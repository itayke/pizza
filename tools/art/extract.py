"""Cut the drawings in art/ into transparent PNGs placed on the layout.

Writes public/assets/ and src/generated/. Needs numpy, pillow, scipy.
Usage: python3 tools/art/extract.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, signal

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art'
OUT = ROOT / 'public' / 'assets'
LAYOUT_TS = ROOT / 'src' / 'generated' / 'artLayout.ts'
DOUGH_TS = ROOT / 'src' / 'generated' / 'doughShapes.ts'

# Must match DESIGN_WIDTH in src/config.ts
DESIGN_WIDTH = 2048
LUMA = np.array([0.299, 0.587, 0.114], np.float32)

INK_LUM = 110  # darker than this blocks the paper flood fill
INK_BLACK = 40  # fully opaque ink for soft edges
CHROMA_DELTA = 45  # chroma above paper that also blocks the flood (uncoloured-outline art)
FEATHER = 2  # soft-edge ring width, px
MIN_SPECK = 400  # drop foreground islands smaller than this, px
LAYOUT_DIFF = 35  # layout-vs-plate difference that counts as drawn
FIT_DOWNSAMPLE = 4
FIT_SCALES = np.arange(0.6, 1.4, 0.005)
FILL_FEATHER = 1.5  # compartment mask blur, px
FILL_CUTOFF = 0.01
LETTER_MIN = 60  # ink blobs smaller than this aren't letters, px
LETTER_GROW = 2  # soft margin kept around letter strokes, px
LABEL_CLEARANCE = 6  # keep labels this far from bin pixels, px
BG_QUALITY = 85

# Boxes are (left, top, right, bottom) in source pixels
BOWL_BOX = (90, 690, 700, 1300)
DOUGH_LABEL_BOX = (240, 1300, 540, 1440)
# Dough drawings for the kneaded dough: (asset, source, ink threshold for a lighter outline, gap seal px)
DOUGH_PIECES = (('dough_ball', 'pizza_dough_ball.png', 150, 0), ('dough_rolled', 'pizza_dough_rolled.jpeg', INK_LUM, 4))
DOUGH_TEXTURE_MAX = 1024  # largest texture side, px
DOUGH_SMOOTH = 5  # trims pencil-shadow scraps off the silhouette, px
DOUGH_EDGE_SAMPLES = 180
DOUGH_RAY_STEP = 0.25
BINS = [
    {'name': 'bin1', 'box': (204, 114, 792, 444), 'label': (288, 430, 726, 534), 'fills': ('sauce', 'cheese')},
    {'name': 'bin2', 'box': (930, 132, 1482, 456), 'label': (906, 418, 1506, 528), 'fills': ('pepperoni', 'sausage')},
    {'name': 'bin3', 'box': (1590, 144, 2160, 492), 'label': (1560, 448, 2140, 570), 'fills': ('pineapple', 'olives')},
]
# Where to look for the separately drawn pieces in the layout
PEEL_REGION = (560, 500, 1760, 1792)
DRAGON_REGION = (1700, 560, 2390, 1792)
FIRE_OUTPUT_LENGTH = 720  # px along the flame axis; drawn length is set in code
# Bake gauge pieces share one scale so they stay aligned; their positions are in gauge space, placed in code
GAUGE_SOURCE = 'pizza_bake_gauge.jpeg'
GAUGE_BOX = (270, 230, 2360, 1270)
GAUGE_LABEL_BOX = (740, 1290, 1890, 1540)
GAUGE_NEEDLE_BOX = (2280, 0, 2592, 870)
GAUGE_SCALE = 0.4

# Sauce ladle: plain and spilling side by side on white; the drops' center is the cursor pivot
LADLE_SOURCE = 'pizza_sauce_ladle.jpg'
LADLE_FRAMES = ('sauce_ladle', 'sauce_ladle_spill')
LADLE_PAPER_DELTA = 25  # channel difference from white that counts as drawn
LADLE_MIN_HOLE = 20  # enclosed white smaller than this is filled, px; the handle hole stays open
LADLE_MIN_SPECK = 20  # smaller islands are noise; drops are bigger, px


def load(name):
    return np.asarray(Image.open(ART / name).convert('RGB')).astype(np.float32)


def lum(img):
    return img @ LUMA


def chroma(img):
    return img.max(2) - img.min(2)


def estimate_paper(img, sigma=40, step=8):
    """Smooth paper colour with the drawing masked out (normalised blur)."""
    small = img[::step, ::step]
    ref = np.median(np.concatenate([small[0], small[-1], small[:, 0], small[:, -1]]), axis=0)
    weight = (np.abs(small - ref).max(2) < 30).astype(np.float32)
    s = sigma / step
    num = np.stack([ndimage.gaussian_filter(small[..., c] * weight, s) for c in range(3)], 2)
    den = ndimage.gaussian_filter(weight, s)[..., None]
    paper = num / np.maximum(den, 1e-3)
    up = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8)).resize((img.shape[1], img.shape[0]), Image.BILINEAR)
    return np.asarray(up).astype(np.float32)


def inkness(img, paper):
    p = lum(paper)
    return np.clip((p - lum(img)) / np.maximum(p - INK_BLACK, 1), 0, 1)


def foreground(img, paper, use_chroma, ink_lum=INK_LUM, seal=0):
    """Everything the paper can't flood into from the border. seal thickens the ink to close gaps in grainy outlines."""
    barrier = lum(img) < ink_lum
    if use_chroma:
        barrier |= chroma(img) - chroma(paper) > CHROMA_DELTA
    if seal:
        barrier = ndimage.binary_dilation(barrier, iterations=seal)
    labels, _ = ndimage.label(~barrier)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge > 0]
    fg = ~np.isin(labels, edge)
    if seal:
        fg = ndimage.binary_erosion(fg, iterations=seal)
    comps, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, comps, range(1, n + 1))
    return np.isin(comps, 1 + np.flatnonzero(sizes >= MIN_SPECK))


def in_box(mask, box):
    out = np.zeros_like(mask)
    l, t, r, b = box
    out[t:b, l:r] = mask[t:b, l:r]
    return out


def largest(mask):
    comps, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, comps, range(1, n + 1))
    return comps == 1 + int(np.argmax(sizes))


def cutout(img, paper, fg):
    """RGBA with a soft ink edge and paper unmixed from the edge pixels."""
    ring = ndimage.binary_dilation(fg, iterations=FEATHER) & ~fg
    alpha = np.where(fg, 1.0, np.where(ring, inkness(img, paper), 0.0)).astype(np.float32)
    return rgba(img, paper, alpha)


def rgba(img, paper, alpha):
    a = alpha[..., None]
    color = np.where(a > 0, (img - (1 - a) * paper) / np.maximum(a, 1e-3), 0)
    return np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)


def bbox(alpha):
    ys, xs = np.nonzero(alpha)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def save(name, pixels, scale):
    """Crop to content, scale into design space, save; returns the crop box in source px."""
    l, t, r, b = bbox(pixels[..., 3])
    im = Image.fromarray(pixels[t:b, l:r], 'RGBA')
    size = (max(1, round((r - l) * scale)), max(1, round((b - t) * scale)))
    im = im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
    im.save(OUT / f'{name}.png', optimize=True)
    return l, t, r, b


def compartments(mask, ink):
    """Left and right compartment areas: inside the rim band, split at the divider."""
    comps, n = ndimage.label(mask & ~ink)
    # The rim band is a ring, so its bounding box is the biggest
    boxes = ndimage.find_objects(comps)
    areas = [(s[0].stop - s[0].start) * (s[1].stop - s[1].start) for s in boxes]
    rim = comps == 1 + int(np.argmax(areas))
    inner = ndimage.binary_fill_holes(rim) & ~rim
    xs = np.nonzero(inner.any(0))[0]
    third = (xs.max() - xs.min()) // 3
    mid = slice(xs.min() + third, xs.max() - third)
    divider = mid.start + int(np.argmax((inner & ink)[:, mid].sum(0)))
    cols = np.arange(inner.shape[1])[None, :]
    return inner & (cols < divider), inner & (cols >= divider)


def lettering(img, paper, box, exclude=None):
    """Alpha of the ink strokes inside box, minus stray bits touching the box edge or excluded."""
    l, t, r, b = box
    strokes = np.zeros(img.shape[:2], bool)
    strokes[t:b, l:r] = lum(img)[t:b, l:r] < INK_LUM
    if exclude is not None:
        strokes &= ~exclude
    comps, n = ndimage.label(strokes)
    keep = np.zeros(n + 1, bool)
    for i, s in enumerate(ndimage.find_objects(comps), 1):
        edge = s[0].start <= t or s[0].stop >= b or s[1].start <= l or s[1].stop >= r
        keep[i] = not edge and (comps[s] == i).sum() >= LETTER_MIN
    near = ndimage.binary_dilation(keep[comps], iterations=LETTER_GROW)
    return np.where(near, inkness(img, paper), 0).astype(np.float32)


def edge_profile(mask):
    """Center of mass and outer edge radius per angle (from +x toward +y), in mask px."""
    cy, cx = ndimage.center_of_mass(mask)
    d = np.arange(0, max(mask.shape), DOUGH_RAY_STEP)
    edge = []
    for a in np.arange(DOUGH_EDGE_SAMPLES) / DOUGH_EDGE_SAMPLES * 2 * np.pi:
        px = np.round(cx + np.cos(a) * d).astype(int)
        py = np.round(cy + np.sin(a) * d).astype(int)
        ok = (px >= 0) & (py >= 0) & (px < mask.shape[1]) & (py < mask.shape[0])
        edge.append(d[np.nonzero(ok & mask[np.clip(py, 0, mask.shape[0] - 1), np.clip(px, 0, mask.shape[1] - 1)])[0].max()])
    return cx, cy, edge


def dough_pieces(record):
    """Isolate the dough drawings at full size and write their shapes for UV mapping."""
    shapes = []
    for name, source, ink_lum, seal in DOUGH_PIECES:
        img = load(source)
        paper = estimate_paper(img)
        mask = foreground(img, paper, use_chroma=False, ink_lum=ink_lum, seal=seal)
        mask = ndimage.binary_fill_holes(largest(ndimage.binary_opening(mask, iterations=DOUGH_SMOOTH)))
        l, t, r, b = bbox(cutout(img, paper, mask)[..., 3])
        scale = min(1.0, DOUGH_TEXTURE_MAX / max(r - l, b - t))
        save(name, cutout(img, paper, mask), scale)
        record(name, f'{name}.png')
        cx, cy, edge = (np.asarray(v) * scale for v in edge_profile(mask[t:b, l:r]))
        values = ', '.join(f'{v:.1f}' for v in edge)
        shapes.append(f'  {name}: {{ centerX: {cx:.1f}, centerY: {cy:.1f}, edge: [{values}] }},')
    DOUGH_TS.write_text(
        '// Generated by tools/art/extract.py; do not edit.\n'
        '// Dough textures: center and outer edge radius per angle (from +x toward +y), in texture px.\n'
        'export const DOUGH_SHAPES = {\n' + '\n'.join(shapes) + '\n};\n'
    )


def ladle_frames():
    """Both ladle drawings on one shared canvas, aligned on the ladle body, with the spill drops' center as pivot."""
    img = load(LADLE_SOURCE)
    paper = np.full_like(img, 255)
    drawn = np.abs(img - paper).max(2) > LADLE_PAPER_DELTA
    split = img.shape[1] // 2
    frames = []
    for half in (slice(0, split), slice(split, None)):
        mask = drawn.copy()
        mask[:, :half.start or 0] = False
        if half.stop:
            mask[:, half.stop:] = False
        holes, n = ndimage.label(~mask)
        sizes = ndimage.sum(~mask, holes, range(1, n + 1))
        mask |= np.isin(holes, 1 + np.flatnonzero(sizes < LADLE_MIN_HOLE))
        comps, n = ndimage.label(mask)
        sizes = ndimage.sum(mask, comps, range(1, n + 1))
        mask = np.isin(comps, 1 + np.flatnonzero(sizes >= LADLE_MIN_SPECK))
        body = largest(mask)
        frames.append((cutout(img, paper, mask), bbox(body), mask & ~body))

    # Shift both onto a canvas where the bodies' top-left corners meet
    boxes = [bbox(pixels[..., 3]) for pixels, _, _ in frames]
    rel = [(l - bl, t - bt, r - bl, b - bt) for (l, t, r, b), (bl, bt, _, _) in zip(boxes, (f[1] for f in frames))]
    left, top = min(r[0] for r in rel), min(r[1] for r in rel)
    width, height = max(r[2] for r in rel) - left, max(r[3] for r in rel) - top
    pivot = None
    for name, (pixels, (bl, bt, _, _), drops), (l, t, r, b) in zip(LADLE_FRAMES, frames, boxes):
        canvas = np.zeros((height, width, 4), np.uint8)
        x, y = l - bl - left, t - bt - top
        canvas[y:y + b - t, x:x + r - l] = pixels[t:b, l:r]
        Image.fromarray(canvas, 'RGBA').save(OUT / f'{name}.png', optimize=True)
        if drops.any():
            dy, dx = ndimage.center_of_mass(drops)
            pivot = ((dx - bl - left) / width, (dy - bt - top) / height)
    return pivot


def fit(mask, target, region):
    """Scale and offset placing mask best over target inside region (target px)."""
    d = FIT_DOWNSAMPLE
    l, t, r, b = region
    tgt = np.where(in_box(target, region), 1.0, -1.0)[::d, ::d]
    ml, mt, mr, mb = bbox(mask)
    crop = mask[mt:mb, ml:mr]
    best = (-np.inf, 1, 0, 0)
    for s in FIT_SCALES:
        size = (max(1, round(crop.shape[1] * s / d)), max(1, round(crop.shape[0] * s / d)))
        # Hits minus spill; uncovered background scores nothing so size isn't rewarded
        m = (np.asarray(Image.fromarray(crop.astype(np.uint8) * 255).resize(size, Image.BILINEAR)) > 127).astype(float)
        # Pad so the piece may hang off the layout edge
        padded = np.pad(tgt, ((m.shape[0], m.shape[0]), (m.shape[1], m.shape[1])), constant_values=-1)
        score = signal.fftconvolve(padded, m[::-1, ::-1], mode='valid')
        y, x = np.unravel_index(np.argmax(score), score.shape)
        if score[y, x] > best[0]:
            best = (score[y, x], s, (x - m.shape[1]) * d, (y - m.shape[0]) * d)
    _, s, x, y = best
    return s, x, y


def orient_fire(pixels):
    """Rotate so the flame's long axis is horizontal with its round head on the left."""
    alpha = pixels[..., 3] > 0
    ys, xs = np.nonzero(alpha)
    pts = np.stack([xs - xs.mean(), ys - ys.mean()], 1)
    _, vecs = np.linalg.eigh(np.cov(pts.T))
    axis = vecs[:, -1]
    angle = np.degrees(np.arctan2(axis[1], axis[0]))
    im = Image.fromarray(pixels, 'RGBA').convert('RGBa').rotate(angle, Image.BICUBIC, expand=True).convert('RGBA')
    out = np.asarray(im)
    # Head is the heavier half; flip it to the left
    cols = (out[..., 3] > 0).sum(0)
    xs = np.nonzero(cols)[0]
    mid = (xs.min() + xs.max()) / 2
    if cols[: int(mid)].sum() < cols[int(mid):].sum():
        out = out[:, ::-1]
    return np.ascontiguousarray(out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    LAYOUT_TS.parent.mkdir(parents=True, exist_ok=True)
    plate = load('pizza_bg.jpeg')
    f = DESIGN_WIDTH / plate.shape[1]
    rects = {}

    def record(name, file, x=0, y=0):
        w, h = Image.open(OUT / file).size
        rects[name] = {'file': file, 'x': round(x), 'y': round(y), 'width': w, 'height': h}
        print(f'{name}: {rects[name]}')

    def place(name, pixels, scale, origin=(0, 0), src_to_layout=1.0):
        l, t, _, _ = save(name, pixels, scale)
        ox, oy = origin
        record(name, f'{name}.png', (ox + l * src_to_layout) * f, (oy + t * src_to_layout) * f)

    # Background: the clean paper
    bg = Image.fromarray(plate.astype(np.uint8)).resize((DESIGN_WIDTH, round(plate.shape[0] * f)), Image.LANCZOS)
    bg.save(OUT / 'bg.jpg', quality=BG_QUALITY)
    record('bg', 'bg.jpg')

    # Bowl and its label come straight from the layout
    layout = load('pizza_layout.jpeg')
    lay_fg = foreground(layout, plate, use_chroma=False)
    place('label_dough', rgba(layout, plate, lettering(layout, plate, DOUGH_LABEL_BOX)), f)
    bowl = largest(in_box(lay_fg, BOWL_BOX))
    place('bowl', cutout(layout, plate, bowl), f)
    dough_pieces(record)

    # Bins: empty base plus one food overlay per compartment
    empty = load('pizza_bins_empty.jpeg')
    full = load('pizza_bins_full.jpeg')
    full_paper = estimate_paper(full)
    empty_fg = foreground(empty, plate, use_chroma=False)
    full_fg = foreground(full, full_paper, use_chroma=False)
    ink = lum(empty) < INK_LUM
    for spec in BINS:
        mask = largest(in_box(empty_fg, spec['box']))
        place(spec['name'], cutout(empty, plate, mask), f)

        for fill_name, region in zip(spec['fills'], compartments(mask, ink)):
            soft = ndimage.gaussian_filter(region.astype(np.float32), FILL_FEATHER)
            place(f'fill_{fill_name}', rgba(full, full_paper, soft * (soft > FILL_CUTOFF)), f)

        near_bin = ndimage.binary_dilation(largest(in_box(full_fg, spec['box'])), iterations=LABEL_CLEARANCE)
        place(f'label_{spec["name"]}', rgba(full, full_paper, lettering(full, full_paper, spec['label'], near_bin)), f)

    # Peel and dragon were drawn apart; fit each onto the layout
    target = np.abs(layout - plate).max(2) > LAYOUT_DIFF
    for name, source, region, same_paper, use_chroma in (
        ('peel', 'pizza_peel.jpeg', PEEL_REGION, False, True),
        ('dragon', 'pizza_dragon.jpeg', DRAGON_REGION, True, False),
    ):
        img = load(source)
        paper = plate if same_paper else estimate_paper(img)
        mask = largest(foreground(img, paper, use_chroma))
        s, x, y = fit(mask, target, region)
        ml, mt, _, _ = bbox(mask)
        print(f'{name} fit scale {s:.3f}')
        place(name, cutout(img, paper, mask), f * s, origin=(x - ml * s, y - mt * s), src_to_layout=s)

    # Fire: oriented to point left, sized in code
    img = load('pizza_dragon_fire.jpg')
    paper = estimate_paper(img)
    pixels = orient_fire(cutout(img, paper, largest(foreground(img, paper, use_chroma=True))))
    l, t, r, b = bbox(pixels[..., 3])
    save('fire', pixels, FIRE_OUTPUT_LENGTH / (r - l))
    record('fire', 'fire.png')

    # Bake gauge: dial, label and needle
    img = load(GAUGE_SOURCE)
    paper = estimate_paper(img)
    fg = foreground(img, paper, use_chroma=False)
    place('gauge', cutout(img, paper, largest(in_box(fg, GAUGE_BOX))), GAUGE_SCALE, src_to_layout=GAUGE_SCALE / f)
    place('gauge_label', rgba(img, paper, lettering(img, paper, GAUGE_LABEL_BOX)), GAUGE_SCALE, src_to_layout=GAUGE_SCALE / f)
    place('gauge_needle', cutout(img, paper, largest(in_box(fg, GAUGE_NEEDLE_BOX))), GAUGE_SCALE, src_to_layout=GAUGE_SCALE / f)

    # Sauce ladle cursor: not placed in the layout, pivots on the spill point
    pivot_x, pivot_y = ladle_frames()
    for name in LADLE_FRAMES:
        record(name, f'{name}.png')
        rects[name].update(pivotX=round(pivot_x, 4), pivotY=round(pivot_y, 4))

    body = json.dumps(rects, indent=2)
    LAYOUT_TS.write_text(
        '// Generated by tools/art/extract.py; do not edit. Design-space rects of each asset.\n'
        f'export const ART = {body} as const;\n\n'
        'export type ArtName = keyof typeof ART;\n'
    )


if __name__ == '__main__':
    main()
