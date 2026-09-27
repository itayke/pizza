"""Procedural stand-ins for art that isn't drawn yet. Writes PNGs to public/assets/.

Run from the repo root: python3 tools/art/placeholders.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUT = Path('public/assets')
SEED = 7

SAUCE_RED = np.array([196, 42, 30])
SAUCE_DARK = np.array([120, 18, 14])
SAUCE_LIGHT = np.array([232, 92, 58])
HERB_GREEN = np.array([70, 110, 40])
INK = (43, 35, 32, 255)

# Tiling sauce surface
PATTERN_SIZE = 256
PATTERN_BLOTCH_SIGMA = 10
# Blend toward dark/light per deviation of the blotch noise
PATTERN_BLOTCH_STRENGTH = 0.3
PATTERN_SPECK_SIGMA = 1.2
# Speckles where fine noise passes this many deviations
PATTERN_SPECK_CUT = 2.5
PATTERN_HERB_CHANCE = 0.0006
PATTERN_HERB_RADIUS = 2

# Soft round stamp with a wobbly edge; white, shape in alpha
BRUSH_SIZE = 128
BRUSH_RADIUS = 0.42
BRUSH_WOBBLE = 0.06
BRUSH_LOBES = 5
BRUSH_SOFTNESS = 0.12

# Held blob: wobbly red splat with an ink outline and a shine
BLOB_SIZE = 220
BLOB_RADIUS = 0.4
BLOB_WOBBLE = 0.12
BLOB_LOBES = 6
BLOB_POINTS = 90
BLOB_OUTLINE = 7
# Center x, y and size w, h as fractions of the blob image
BLOB_SHINE = (0.36, 0.34, 0.16, 0.08)
SHINE_COLOR = (255, 220, 200, 170)


def wrapped_noise(rng, size, sigma):
    """Gaussian-blurred noise that tiles, scaled to unit spread."""
    field = ndimage.gaussian_filter(rng.standard_normal((size, size)), sigma, mode='wrap')
    return field / field.std()


def sauce_pattern(rng):
    blotch = wrapped_noise(rng, PATTERN_SIZE, PATTERN_BLOTCH_SIGMA)
    speck = wrapped_noise(rng, PATTERN_SIZE, PATTERN_SPECK_SIGMA)
    img = np.broadcast_to(SAUCE_RED, (PATTERN_SIZE, PATTERN_SIZE, 3)).astype(float)
    dark = np.clip(-blotch * PATTERN_BLOTCH_STRENGTH, 0, 1)[..., None]
    light = np.clip(blotch * PATTERN_BLOTCH_STRENGTH, 0, 1)[..., None]
    img = img * (1 - dark) + SAUCE_DARK * dark
    img = img * (1 - light) + SAUCE_LIGHT * light
    img[speck > PATTERN_SPECK_CUT] = SAUCE_DARK
    img[speck < -PATTERN_SPECK_CUT] = SAUCE_LIGHT
    herbs = rng.random((PATTERN_SIZE, PATTERN_SIZE)) < PATTERN_HERB_CHANCE
    herbs = ndimage.binary_dilation(herbs, iterations=PATTERN_HERB_RADIUS)
    img[herbs] = HERB_GREEN
    return Image.fromarray(img.clip(0, 255).astype(np.uint8), 'RGB')


def wobble(rng, lobes):
    """Radius multiplier around the circle: a few random low-frequency waves."""
    phases = rng.random(lobes) * 2 * np.pi
    amps = rng.random(lobes) / np.arange(1, lobes + 1)
    return lambda angle: sum(a * np.sin((k + 2) * angle + p) for k, (a, p) in enumerate(zip(amps, phases))) / amps.sum()


def brush(rng):
    shape = wobble(rng, BRUSH_LOBES)
    y, x = (np.mgrid[:BRUSH_SIZE, :BRUSH_SIZE] + 0.5) / BRUSH_SIZE - 0.5
    edge = BRUSH_RADIUS * (1 + BRUSH_WOBBLE * shape(np.arctan2(y, x)))
    t = np.clip((edge - np.hypot(x, y)) / BRUSH_SOFTNESS, 0, 1)
    alpha = t * t * (3 - 2 * t)
    img = np.zeros((BRUSH_SIZE, BRUSH_SIZE, 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(img, 'RGBA')


def blob(rng, pattern):
    shape = wobble(rng, BLOB_LOBES)
    angles = np.linspace(0, 2 * np.pi, BLOB_POINTS, endpoint=False)
    radii = BLOB_SIZE * BLOB_RADIUS * (1 + BLOB_WOBBLE * shape(angles))
    center = BLOB_SIZE / 2
    points = [(center + r * np.cos(a), center + r * np.sin(a)) for a, r in zip(angles, radii)]

    mask = Image.new('L', (BLOB_SIZE, BLOB_SIZE), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    img = Image.new('RGBA', (BLOB_SIZE, BLOB_SIZE), (0, 0, 0, 0))
    img.paste(pattern.crop((0, 0, BLOB_SIZE, BLOB_SIZE)), mask=mask)
    draw = ImageDraw.Draw(img)
    sx, sy, sw, sh = (v * BLOB_SIZE for v in BLOB_SHINE)
    draw.ellipse((sx - sw / 2, sy - sh / 2, sx + sw / 2, sy + sh / 2), fill=SHINE_COLOR)
    draw.line(points + points[:1], fill=INK, width=BLOB_OUTLINE, joint='curve')
    return img


def main():
    rng = np.random.default_rng(SEED)
    pattern = sauce_pattern(rng)
    pattern.save(OUT / 'sauce_pattern.png')
    brush(rng).save(OUT / 'sauce_brush.png')
    blob(rng, pattern).save(OUT / 'sauce_blob.png')
    print('wrote sauce_pattern, sauce_brush, sauce_blob')


if __name__ == '__main__':
    main()
