"""Cut the drawings in art/ into transparent PNGs placed on the layout.

Writes public/assets/ and src/generated/. Needs numpy, pillow, scipy.
Usage: python3 tools/art/extract.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
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

# Placed sauce surface: flat spoon-spread streaks drawn on a torus so the tile repeats exactly, colored from the held sauce.
# The streaks follow a main direction bent by waves with whole cycles per tile
SAUCE_TILE = 1024
SAUCE_SUPERSAMPLE = 4
SAUCE_SEED = 3
SAUCE_PALETTE_EDGE = 12  # px trimmed off the dab rim before sampling its tones
SAUCE_TONE_BAND = 4  # luma within this of the median counts as base
SAUCE_HIGHLIGHT_LUMA = 12  # luma offsets from the base that split the dab into its drawn tones
SAUCE_GROOVE_LUMA = -12
SAUCE_LINE_LUMA = -30
SAUCE_FLOW_WAVES = 4
SAUCE_FLOW_FREQ = (1, 2)  # cycles per tile
SAUCE_FLOW_BEND = (0.175, 0.35)  # radians of bend per wave
SAUCE_STEP = 3  # px per streamline step
SAUCE_STROKES = 1500  # placement attempts; crowded ones are dropped
SAUCE_STROKE_LENGTH = (220, 520)
SAUCE_GROOVE_WIDTH = (14, 30)
SAUCE_HIGHLIGHT_WIDTH = (6, 14)
SAUCE_HIGHLIGHT_SHARE = 0.45
SAUCE_LINE_SHARE = 0.4  # of groove width
SAUCE_LINE_TAPER = 0.3
SAUCE_STROKE_TAPER = 0.6
SAUCE_CLEARANCE = 55  # px kept between strokes
SAUCE_CHECK_EVERY = 3  # streamline points sampled for clearance
SAUCE_FLECKS = 90
SAUCE_FLECK_SIZE = (2, 5)
SAUCE_FLECK_POINTS = 8

# Held ingredient cursors: one sheet of pieces drawn to scale with each other, already on transparency, cut out by box (source px)
HELD_SOURCE = 'pizza_placement_ingredients.png'
HELD_PIECES = {'held_sauce': (190, 730, 520, 1060), 'held_cheese': (620, 730, 975, 1065)}


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


def bleed(pixels):
    """Recolor every pixel short of opaque from its nearest opaque one, so soft edges carry no background fringe."""
    _, (iy, ix) = ndimage.distance_transform_edt(pixels[..., 3] < 255, return_indices=True)
    out = pixels[iy, ix]
    out[..., 3] = pixels[..., 3]
    return out


def sauce_palette(pixels):
    """Base, highlight, groove and line colors of a drawn sauce dab (RGBA, opaque where drawn)."""
    inner = ndimage.binary_erosion(pixels[..., 3] == 255, iterations=SAUCE_PALETTE_EDGE)
    p = pixels[inner][:, :3].astype(np.float32)
    lum = p @ LUMA
    mid = np.median(lum)
    tones = (
        np.abs(lum - mid) < SAUCE_TONE_BAND,
        lum > mid + SAUCE_HIGHLIGHT_LUMA,
        (lum < mid + SAUCE_GROOVE_LUMA) & (lum > mid + SAUCE_LINE_LUMA),
        lum < mid + SAUCE_LINE_LUMA,
    )
    return [tuple(int(v) for v in np.median(p[t], 0)) for t in tones]


def taper(n, power):
    """Stroke width profile: pointed ends, full in the middle."""
    return np.sin(np.linspace(0, np.pi, n)) ** power


def normals(pts):
    d = np.gradient(pts, axis=0)
    return np.stack([-d[:, 1], d[:, 0]], 1) / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)


def ribbon(pts, widths):
    """Outline of a stroke of the given widths along pts."""
    off = normals(pts) * (widths / 2)[:, None]
    return np.concatenate([pts + off, (pts - off)[::-1]])


def draw_wrapped(draw, outline, scale, fill):
    """Draws the polygon and its copies one tile over in each direction, so tile edges match."""
    for dx in (-SAUCE_TILE, 0, SAUCE_TILE):
        for dy in (-SAUCE_TILE, 0, SAUCE_TILE):
            draw.polygon([((x + dx) * scale, (y + dy) * scale) for x, y in outline], fill=fill)


def sauce_texture(dab):
    rng = np.random.default_rng(SAUCE_SEED)
    base, hi, groove, line = sauce_palette(dab)
    n, ss = SAUCE_TILE, SAUCE_SUPERSAMPLE
    img = Image.new('RGB', (n * ss, n * ss), base)
    draw = ImageDraw.Draw(img)
    blocked = Image.new('L', (n, n), 0)
    block = ImageDraw.Draw(blocked)

    main_dir = rng.uniform(0, np.pi)
    waves = [
        (rng.integers(SAUCE_FLOW_FREQ[0], SAUCE_FLOW_FREQ[1] + 1, 2) * rng.choice((-1, 1), 2),
         rng.uniform(0, 2 * np.pi), rng.uniform(*SAUCE_FLOW_BEND))
        for _ in range(SAUCE_FLOW_WAVES)
    ]

    def heading(p):
        a = main_dir + sum(amp * np.sin(2 * np.pi * (k @ p) / n + ph) for k, ph, amp in waves)
        return np.array([np.cos(a), np.sin(a)])

    for _ in range(SAUCE_STROKES):
        pts = [rng.uniform(0, n, 2)]
        for _ in range(int(rng.uniform(*SAUCE_STROKE_LENGTH) / SAUCE_STEP)):
            pts.append(pts[-1] + SAUCE_STEP * heading(pts[-1]))
        pts = np.array(pts)
        is_hi = rng.random() < SAUCE_HIGHLIGHT_SHARE
        widths = rng.uniform(*(SAUCE_HIGHLIGHT_WIDTH if is_hi else SAUCE_GROOVE_WIDTH)) * taper(len(pts), SAUCE_STROKE_TAPER)
        taken = np.asarray(blocked)
        if any(taken[int(y) % n, int(x) % n] for x, y in pts[::SAUCE_CHECK_EVERY]):
            continue
        draw_wrapped(draw, ribbon(pts, widths), ss, hi if is_hi else groove)
        if not is_hi:
            # Dark line along one side of the groove, as on the dab
            edge = pts + rng.choice((-1, 1)) * normals(pts) * (widths / 2 * (1 - SAUCE_LINE_SHARE))[:, None]
            draw_wrapped(draw, ribbon(edge, widths * SAUCE_LINE_SHARE * taper(len(pts), SAUCE_LINE_TAPER)), ss, line)
        draw_wrapped(block, ribbon(pts, widths + 2 * SAUCE_CLEARANCE), 1, 255)

    # Flecks: small specks lying along the flow
    for _ in range(SAUCE_FLECKS):
        p = rng.uniform(0, n, 2)
        size = rng.uniform(*SAUCE_FLECK_SIZE)
        pts = np.linspace(p - size * heading(p), p + size * heading(p), SAUCE_FLECK_POINTS)
        draw_wrapped(draw, ribbon(pts, size * taper(SAUCE_FLECK_POINTS, SAUCE_STROKE_TAPER)), ss, (hi, line)[rng.integers(2)])

    img.resize((n, n), Image.LANCZOS).save(OUT / 'sauce_pattern.png', optimize=True)


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

    # Held ingredient cursors: not placed in the layout, kept at sheet scale
    sheet = bleed(np.asarray(Image.open(ART / HELD_SOURCE).convert('RGBA')))
    for name, box in HELD_PIECES.items():
        save(name, np.where(in_box(np.ones(sheet.shape[:2], bool), box)[..., None], sheet, 0).astype(np.uint8), 1)
        record(name, f'{name}.png')
    l, t, r, b = HELD_PIECES['held_sauce']
    sauce_texture(sheet[t:b, l:r])

    body = json.dumps(rects, indent=2)
    LAYOUT_TS.write_text(
        '// Generated by tools/art/extract.py; do not edit. Design-space rects of each asset.\n'
        f'export const ART = {body} as const;\n\n'
        'export type ArtName = keyof typeof ART;\n'
    )


if __name__ == '__main__':
    main()
