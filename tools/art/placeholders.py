"""Procedural stand-ins for art that isn't drawn yet. Writes PNGs to public/assets/.

Run from the repo root: python3 tools/art/placeholders.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path('public/assets')
SEED = 7

# Soft round stamp with a wobbly edge; white, shape in alpha
BRUSH_SIZE = 128
BRUSH_RADIUS = 0.42
BRUSH_WOBBLE = 0.06
BRUSH_LOBES = 5
BRUSH_SOFTNESS = 0.12


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


def main():
    rng = np.random.default_rng(SEED)
    brush(rng).save(OUT / 'sauce_brush.png')
    print('wrote sauce_brush')


if __name__ == '__main__':
    main()
