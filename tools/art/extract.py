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
FILL_FEATHER = 1.5  # fill mask blur, px
FILL_CUTOFF = 0.01
# Separately drawn bins: food is where the full drawing differs from the empty one, cleaned up in px
FOOD_DIFF = 45
FOOD_OPEN = 3
FOOD_CLOSE = 14  # bridges gaps between loose bits (cheese shreds) so the whole pile is one area
LETTER_MIN = 60  # ink blobs smaller than this aren't letters, px
LETTER_GROW = 2  # soft margin kept around letter strokes, px
LABEL_CLEARANCE = 6  # keep labels this far from bin pixels, px
BG_QUALITY = 85

# Boxes are (left, top, right, bottom) in source pixels
BOWL_BOX = (90, 690, 700, 1300)
# The dough bowl, drawn empty on its own with its label below (label box in its px); scaled onto the layout bowl's spot
BOWL_SOURCE = 'pizza_dough_bowl.png'
BOWL_LABEL_BOX = (200, 820, 680, 1010)
# Dough drawings for the kneaded dough: (asset, source, ink threshold for a lighter outline, gap seal px)
DOUGH_PIECES = (('dough_ball', 'pizza_dough_ball.png', 150, 0), ('dough_rolled', 'pizza_dough_rolled.jpeg', INK_LUM, 4))
DOUGH_TEXTURE_MAX = 1024  # largest texture side, px
# Bake phases of the rolled dough, drawn over its texture on paper: isolated onto that same canvas so they share its UVs
DOUGH_BAKES = (('dough_baked', 'pizza_dough_baked.png'), ('dough_burnt', 'pizza_dough_burnt.png'))
DOUGH_BAKE_PAD = 16  # paper added around the drawing so dough touching the canvas edge can't stop the flood, px
DOUGH_SMOOTH = 5  # trims pencil-shadow scraps off the silhouette, px
DOUGH_EDGE_SAMPLES = 180
DOUGH_RAY_STEP = 0.25
# Bins come from their own drawings (empty, full), scaled onto their box on the empty layout sheet; the label box is in
# the empty drawing's px
BINS = [
    {'name': 'bin1', 'box': (204, 114, 792, 444), 'label': (0, 570, 1024, 803), 'fills': ('sauce', 'cheese'),
     'drawn': ('pizza_bin1_empty.png', 'pizza_bin1_full.png')},
    {'name': 'bin2', 'box': (930, 132, 1482, 456), 'label': (0, 560, 1024, 817), 'fills': ('pepperoni', 'basil'),
     'drawn': ('pizza_bin2_empty.png', 'pizza_bin2_full.png')},
    {'name': 'bin3', 'box': (1590, 144, 2160, 492), 'label': (0, 560, 1024, 808), 'fills': ('pineapple', 'olives'),
     'drawn': ('pizza_bin3_empty.png', 'pizza_bin3_full.png')},
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

# Placed sauce surface: a drawing that roughly repeats every PERIOD px. One period is cut where its far edges best
# match what precedes its start (searched within ± SLACK px), then those edges are blended over BLEND px so it wraps.
# PERIOD 0 uses a drawing that already tiles (e.g. pizza_sauce_streaks.png) as is
SAUCE_TEXTURE_SOURCE = 'pizza_sauce_swirls_repeat.png'
SAUCE_PERIOD = 256
SAUCE_PERIOD_SLACK = 4
SAUCE_SEAM_BLEND = 32

# Held ingredient cursors: one sheet of pieces drawn to scale with each other, already on transparency, cut out by box (source px)
HELD_SOURCE = 'pizza_placement_ingredients.png'
HELD_PIECES = {'held_sauce': (190, 730, 520, 1060), 'held_cheese': (620, 730, 975, 1065)}

# Bake button: its states side by side, left to right, cut onto one shared canvas so they swap in place; sized in code
BAKE_BUTTON_SOURCE = 'pizza_bake_button.png'
BAKE_BUTTON_STATES = ('unpressed', 'pressed', 'disabled')
BAKE_BUTTON_INK_LUM = 200  # pencil rims can be light, so anything short of paper blocks the flood

# Placed toppings: a transparent sheet with one column per ingredient and one row per bake phase, kept at sheet scale.
# Each ingredient's phases share one canvas centered on its raw piece, with later phases fitted over it so they cross-fade
TOPPINGS_SOURCE = 'pizza_ingredients.png'
TOPPING_COLUMNS = ('cheese', 'pepperoni', 'basil', 'pineapple', 'olives')
TOPPING_PHASES = ('raw', 'baked', 'burnt')
TOPPING_PIECE_MIN = 2000  # px; smaller blobs are crumbs belonging to a nearby piece
TOPPING_CRUMB_REACH = 30  # px; crumbs farther than this from their piece are dropped
TOPPING_ROOM = 1.25  # working canvas side over the largest phase's span, so pieces can move and grow
TOPPING_FIT_ALPHA = 128  # shape used for fitting, so faint soot doesn't pull it
TOPPING_FIT_BLUR = 1.5  # at fitting resolution
TOPPING_FIT_DOWNSAMPLE = 2
TOPPING_FIT_ANGLES = np.arange(-15, 15.5, 1)  # degrees
TOPPING_FIT_SCALES = np.arange(0.84, 1.161, 0.02)
TOPPING_FIT_ROTATE_GAIN = 0.01  # overlap ratio a rotation must add to be used


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


def align_to(img, mask, shape):
    """img resampled into another drawing's frame (shape), matching its main outline's box to mask's."""
    l, t, r, _ = bbox(mask)
    il, it, ir, _ = bbox(largest(foreground(img, estimate_paper(img), use_chroma=False)))
    k = (r - l) / (ir - il)
    inverse = (1 / k, 0, il - l / k, 0, 1 / k, it - t / k)
    src = Image.fromarray(img.astype(np.uint8))
    return np.asarray(src.transform((shape[1], shape[0]), Image.AFFINE, inverse, Image.BICUBIC, fillcolor=(255, 255, 255))).astype(np.float32)


def food_regions(full, empty, mask):
    """Left and right food areas: where the full drawing differs from the empty one, split at the divider."""
    food = ndimage.binary_opening((np.abs(full - empty).max(2) > FOOD_DIFF) & mask, iterations=FOOD_OPEN)
    xs = np.nonzero(mask.any(0))[0]
    third = (xs.max() - xs.min()) // 3
    mid = slice(xs.min() + third, xs.max() - third)
    divider = mid.start + int(np.argmax((mask & (lum(empty) < INK_LUM))[:, mid].sum(0)))
    cols = np.arange(mask.shape[1])[None, :]
    return [ndimage.binary_fill_holes(largest(ndimage.binary_closing(food & side, iterations=FOOD_CLOSE)))
            for side in (cols < divider, cols >= divider)]


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


def words(alpha, count):
    """Split lettering alpha into count pieces, left to right, at its widest gaps between inked columns."""
    inked = np.nonzero(alpha.any(0))[0]
    gaps = np.nonzero(np.diff(inked) > 1)[0]
    widest = np.sort(gaps[np.argsort(np.diff(inked)[gaps])[::-1][:count - 1]])
    cuts = [0, *((inked[g] + inked[g + 1]) // 2 for g in widest), alpha.shape[1]]
    cols = np.arange(alpha.shape[1])[None, :]
    return [np.where((cols >= a) & (cols < b), alpha, 0) for a, b in zip(cuts, cuts[1:])]


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


def dough_bakes(record):
    """Isolate each bake phase onto the rolled dough's canvas; prints how well its silhouette matches."""
    rolled = Image.open(OUT / 'dough_rolled.png')
    rolled_shape = np.asarray(rolled)[..., 3] > 127
    p = DOUGH_BAKE_PAD
    for name, source in DOUGH_BAKES:
        img = np.asarray(Image.open(ART / source).convert('RGB').resize(rolled.size, Image.LANCZOS)).astype(np.float32)
        img = np.pad(img, ((p, p), (p, p), (0, 0)), mode='edge')
        paper = estimate_paper(img)
        mask = foreground(img, paper, use_chroma=True)
        mask = ndimage.binary_fill_holes(largest(ndimage.binary_opening(mask, iterations=DOUGH_SMOOTH)))
        pixels = cutout(img, paper, mask)[p:-p, p:-p]
        Image.fromarray(pixels, 'RGBA').save(OUT / f'{name}.png', optimize=True)
        record(name, f'{name}.png')
        shape = pixels[..., 3] > 127
        print(f'{name}: silhouette overlap with dough_rolled {(shape & rolled_shape).sum() / (shape | rolled_shape).sum():.3f}')


def bleed(pixels):
    """Recolor every pixel short of opaque from its nearest opaque one, so soft edges carry no background fringe."""
    _, (iy, ix) = ndimage.distance_transform_edt(pixels[..., 3] < 255, return_indices=True)
    out = pixels[iy, ix]
    out[..., 3] = pixels[..., 3]
    return out


def best_period(gray, axis, guess, slack, blend):
    """(start, period) along axis whose last blend px best match the blend px just before start."""
    g = np.moveaxis(gray, axis, 0)
    best = (np.inf, 0, 0)
    for period in range(guess - slack, guess + slack + 1):
        for start in range(blend, len(g) - period + 1):
            cost = np.abs(g[start + period - blend:start + period] - g[start - blend:start]).mean()
            best = min(best, (cost, start, period))
    return best[1:]


def seamless_period(img, axis, start, period, blend):
    """One period along axis, its last blend px faded into the px just before start so it wraps smoothly."""
    tile = np.take(img, range(start, start + period), axis).copy()
    before = np.take(img, range(start - blend, start), axis)
    ends = np.take(tile, range(period - blend, period), axis)
    w = np.arange(1, blend + 1, dtype=np.float32) / blend
    w = w.reshape([-1 if a == axis else 1 for a in range(img.ndim)])
    idx = [slice(None)] * img.ndim
    idx[axis] = slice(period - blend, period)
    tile[tuple(idx)] = ends * (1 - w) + before * w
    return tile


def sauce_texture():
    img = load(SAUCE_TEXTURE_SOURCE)
    if SAUCE_PERIOD:
        x0, px = best_period(lum(img), 1, SAUCE_PERIOD, SAUCE_PERIOD_SLACK, SAUCE_SEAM_BLEND)
        img = seamless_period(img, 1, x0, px, SAUCE_SEAM_BLEND)
        y0, py = best_period(lum(img), 0, SAUCE_PERIOD, SAUCE_PERIOD_SLACK, SAUCE_SEAM_BLEND)
        img = seamless_period(img, 0, y0, py, SAUCE_SEAM_BLEND)
        print(f'sauce_pattern: period {px}x{py} from ({x0}, {y0})')
    Image.fromarray(img.clip(0, 255).astype(np.uint8), 'RGB').save(OUT / 'sauce_pattern.png', optimize=True)


def gap_groups(values, count):
    """Split values into count groups at the widest gaps; returns each group's center."""
    v = np.sort(values)
    cuts = np.sort(np.argsort(np.diff(v))[-(count - 1):]) + 1
    return np.array([g.mean() for g in np.split(v, cuts)])


def grid_pieces(sheet, columns, rows):
    """Each (column, row) piece of a transparent sheet laid out in a grid, as a full-sheet RGBA with its nearby crumbs."""
    lab, n = ndimage.label(sheet[..., 3] > 0)
    idx = np.arange(1, n + 1)
    sizes = np.bincount(lab.ravel(), minlength=n + 1)[1:]
    cents = np.array(ndimage.center_of_mass(lab > 0, lab, idx))  # (y, x)
    big = sizes >= TOPPING_PIECE_MIN
    col = np.abs(cents[:, 1:2] - gap_groups(cents[big, 1], len(columns))[None]).argmin(1)
    row = np.abs(cents[:, 0:1] - gap_groups(cents[big, 0], len(rows))[None]).argmin(1)
    out = {}
    for c, cname in enumerate(columns):
        for r, rname in enumerate(rows):
            mine = (col == c) & (row == r)
            near = ndimage.distance_transform_edt(~np.isin(lab, idx[mine & big])) <= TOPPING_CRUMB_REACH
            keep = mine & (big | (ndimage.maximum(near, lab, idx) > 0))
            out[cname, rname] = np.where(np.isin(lab, idx[keep])[..., None], sheet, 0).astype(np.uint8)
    return out


def centered(pixels, size):
    """Square canvas of side size with the piece's shape centroid at its center."""
    cy, cx = ndimage.center_of_mass((pixels[..., 3] > TOPPING_FIT_ALPHA).astype(np.float32))
    t, l = round(cy) - size // 2 + size, round(cx) - size // 2 + size
    return np.pad(pixels, ((size, size), (size, size), (0, 0)))[t:t + size, l:l + size]


def affine(angle, scale, shift, center):
    """Output-to-input matrix and offset (y, x) for ndimage: rotate and scale about center, then shift."""
    a = np.deg2rad(angle)
    m = np.array([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]]) / scale
    return m, center - m @ (center + shift)


def warp(pixels, angle, scale, shift):
    """Premultiplied RGBA warp, so soft edges carry no dark fringe."""
    f = pixels.astype(np.float32)
    f[..., :3] *= f[..., 3:] / 255
    m, off = affine(angle, scale, np.asarray(shift, float), (np.array(f.shape[:2]) - 1) / 2)
    out = np.stack([ndimage.affine_transform(f[..., k], m, off, order=3) for k in range(4)], -1)
    out[..., 3] = out[..., 3].clip(0, 255)
    out[..., :3] = np.where(out[..., 3:] > 0, out[..., :3] * 255 / np.maximum(out[..., 3:], 1e-3), 0)
    return out.clip(0, 255).astype(np.uint8)


def fit_shape(pixels):
    small = (pixels[::TOPPING_FIT_DOWNSAMPLE, ::TOPPING_FIT_DOWNSAMPLE, 3] > TOPPING_FIT_ALPHA).astype(np.float32)
    return ndimage.gaussian_filter(small, TOPPING_FIT_BLUR)


def overlap_ratio(a, b):
    return np.minimum(a, b).sum() / np.maximum(a, b).sum()


def fit_over(ref, moving):
    """(overlap, angle, scale, shift) placing moving's shape over ref's on the same canvas, best by overlap ratio.
    Rotation is kept only when it clearly helps, since round pieces match at any angle."""
    target, m0 = fit_shape(ref), fit_shape(moving)
    center = (np.array(m0.shape) - 1) / 2
    results = []
    for ang in TOPPING_FIT_ANGLES:
        for sc in TOPPING_FIT_SCALES:
            m, off = affine(ang, sc, np.zeros(2), center)
            w = ndimage.affine_transform(m0, m, off, order=1)
            corr = signal.fftconvolve(target, w[::-1, ::-1], mode='same')
            shift = np.array(np.unravel_index(np.argmax(corr), corr.shape)) - np.array(target.shape) // 2
            m, off = affine(ang, sc, shift.astype(float), center)
            score = overlap_ratio(target, ndimage.affine_transform(m0, m, off, order=1))
            results.append((score, ang, sc, shift * TOPPING_FIT_DOWNSAMPLE))
    best = max(results, key=lambda r: r[0])
    upright = max((r for r in results if r[1] == 0), key=lambda r: r[0])
    return upright if best[0] - upright[0] < TOPPING_FIT_ROTATE_GAIN else best


def bake_button():
    """Each button state on a canvas shared by all of them, centered on its outline; returns the asset names."""
    img = load(BAKE_BUTTON_SOURCE)
    paper = estimate_paper(img)
    fg = foreground(img, paper, use_chroma=False, ink_lum=BAKE_BUTTON_INK_LUM)
    comps, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, comps, range(1, n + 1))
    # The buttons are the largest pieces; the state captions above them are small letters
    ids = 1 + np.argsort(sizes)[-len(BAKE_BUTTON_STATES):]
    masks = sorted((ndimage.binary_fill_holes(comps == i) for i in ids), key=lambda m: bbox(m)[0])
    # Every state is stretched to the first one's width and height, so swapping states never changes the button's shape
    fl, ft, fr, fb = bbox(masks[0])
    names = []
    for state, mask in zip(BAKE_BUTTON_STATES, masks):
        l, t, r, b = bbox(mask)
        piece = Image.fromarray(cutout(img, paper, mask)[t:b, l:r], 'RGBA').resize((fr - fl, fb - ft), Image.LANCZOS)
        canvas = Image.new('RGBA', (fr - fl + 2 * FEATHER, fb - ft + 2 * FEATHER))
        canvas.paste(piece, (FEATHER, FEATHER))
        name = f'bake_button_{state}'
        canvas.save(OUT / f'{name}.png', optimize=True)
        print(f'{name}: scaled {(fr - fl) / (r - l):.3f} x {(fb - ft) / (b - t):.3f}')
        names.append(name)
    return names


def toppings():
    """Writes topping_<ingredient>_<phase>.png, all phases of an ingredient on one canvas; returns the names."""
    cut = grid_pieces(bleed(np.asarray(Image.open(ART / TOPPINGS_SOURCE).convert('RGBA'))), TOPPING_COLUMNS, TOPPING_PHASES)
    names = []
    for ing in TOPPING_COLUMNS:
        spans = [max(np.ptp(a), np.ptp(b)) for a, b in (np.nonzero(cut[ing, p][..., 3]) for p in TOPPING_PHASES)]
        size = int(max(spans) * TOPPING_ROOM) // 2 * 2
        stack = [centered(cut[ing, p], size) for p in TOPPING_PHASES]
        for i, phase in enumerate(TOPPING_PHASES[1:], 1):
            score, ang, sc, shift = fit_over(stack[0], stack[i])
            stack[i] = warp(stack[i], ang, sc, shift)
            print(f'topping {ing} {phase}: rotate {ang:+.0f}, scale {sc:.2f}, shift {tuple(int(v) for v in shift)}, overlap {score:.2f}')
        # Trim to what any phase uses, keeping the raw piece centered
        ys, xs = np.nonzero(np.any([s[..., 3] > 0 for s in stack], 0))
        c = size // 2
        h, w = max(c - ys.min(), ys.max() + 1 - c), max(c - xs.min(), xs.max() + 1 - c)
        for phase, s in zip(TOPPING_PHASES, stack):
            name = f'topping_{ing}_{phase}'
            Image.fromarray(s[c - h:c + h, c - w:c + w], 'RGBA').save(OUT / f'{name}.png', optimize=True)
            names.append(name)
    return names


def onto_sheet(mask, sheet_mask, place, f):
    """put(name, pixels) for a piece drawn on its own, scaled so its mask spans sheet_mask's width at its top-left."""
    l, t, r, _ = bbox(mask)
    sl, st, sr, _ = bbox(sheet_mask)
    s = (sr - sl) / (r - l)
    origin = (sl - l * s, st - t * s)
    return lambda name, pixels: place(name, pixels, f * s, origin=origin, src_to_layout=s)


def drawn_bowl(sheet_mask, place, f):
    """The empty dough bowl and its label from their own drawing, scaled onto where the layout's bowl sat."""
    img = load(BOWL_SOURCE)
    paper = estimate_paper(img)
    mask = largest(foreground(img, paper, use_chroma=False))
    put = onto_sheet(mask, sheet_mask, place, f)
    put('bowl', cutout(img, paper, mask))
    near_bowl = ndimage.binary_dilation(mask, iterations=LABEL_CLEARANCE)
    put('label_dough', rgba(img, paper, lettering(img, paper, BOWL_LABEL_BOX, near_bowl)))


def drawn_bin(spec, sheet_mask, place, f):
    """A bin drawn on its own sheets, scaled onto where the sheet's bin sat; fills come from the full drawing aligned to it."""
    empty_src, full_src = spec['drawn']
    empty = load(empty_src)
    paper = estimate_paper(empty)
    mask = largest(foreground(empty, paper, use_chroma=False))
    put = onto_sheet(mask, sheet_mask, place, f)
    put(spec['name'], cutout(empty, paper, mask))

    full = align_to(load(full_src), mask, empty.shape)
    full_paper = estimate_paper(full)
    for fill_name, region in zip(spec['fills'], food_regions(full, empty, mask)):
        soft = ndimage.gaussian_filter(region.astype(np.float32), FILL_FEATHER)
        put(f'fill_{fill_name}', rgba(full, full_paper, soft * (soft > FILL_CUTOFF)))

    near_bin = ndimage.binary_dilation(mask, iterations=LABEL_CLEARANCE)
    # One word per compartment, so each ingredient's name can be highlighted on its own
    label = lettering(empty, paper, spec['label'], near_bin)
    for fill_name, word in zip(spec['fills'], words(label, len(spec['fills']))):
        put(f'label_{fill_name}', rgba(empty, paper, word))


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

    # Bowl and its label: drawn on their own; the layout's bowl gives their spot
    layout = load('pizza_layout.jpeg')
    lay_fg = foreground(layout, plate, use_chroma=False)
    drawn_bowl(largest(in_box(lay_fg, BOWL_BOX)), place, f)
    dough_pieces(record)
    dough_bakes(record)

    # Bins: each drawn on its own; the empty layout sheet gives its spot
    empty_fg = foreground(load('pizza_bins_empty.jpeg'), plate, use_chroma=False)
    for spec in BINS:
        drawn_bin(spec, largest(in_box(empty_fg, spec['box'])), place, f)

    # Peel and dragon were drawn apart; fit each onto the layout
    target = np.abs(layout - plate).max(2) > LAYOUT_DIFF
    for name, source, region, same_paper, use_chroma in (
        ('peel', 'pizza_peel.png', PEEL_REGION, False, True),
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

    sauce_texture()

    # Bake button states: not placed in the layout, sized in code
    for name in bake_button():
        record(name, f'{name}.png')

    # Placed toppings per bake phase: not placed in the layout, kept at sheet scale
    for name in toppings():
        record(name, f'{name}.png')

    body = json.dumps(rects, indent=2)
    LAYOUT_TS.write_text(
        '// Generated by tools/art/extract.py; do not edit. Design-space rects of each asset.\n'
        f'export const ART = {body} as const;\n\n'
        'export type ArtName = keyof typeof ART;\n'
    )


if __name__ == '__main__':
    main()
