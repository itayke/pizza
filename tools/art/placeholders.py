"""Procedural stand-ins for art that isn't drawn yet. Writes PNGs to public/assets/.

Run from the repo root: python3 tools/art/placeholders.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path('public/assets')
SEED = 7

# Soft round stamp with a wobbly edge; white, shape in alpha
BRUSH_SIZE = 128
BRUSH_RADIUS = 0.42
BRUSH_WOBBLE = 0.06
BRUSH_LOBES = 5
BRUSH_SOFTNESS = 0.12

# Order ticket icons: square, drawn at ICON_SIZE px in pencil-like ink. Pies are pizzas of radius PIE_RADIUS (of the
# icon) cut into equal wedges: the one asked for in dough, starting at 12 o'clock and going clockwise, the rest empty
ICON_SIZE = 160
INK = (70, 60, 55, 255)
LINE = 7
PIE_RADIUS = 0.44
PIE_PARTS = (1, 2, 3, 4)
DOUGH_FILL = (240, 215, 170, 255)
EMPTY_FILL = (215, 210, 205, 255)
# Count digits drawn, the most an order may ask for
MAX_DIGIT = 9
DIGIT_SIZE = 0.8
# Flame: a teardrop of FLAME_RADIUS (of the icon); well baked is golden, burnt is charred
FLAME_RADIUS = 0.4
FLAME_POINTS = 64
WELL_FILL = (240, 150, 50, 255)
BURNT_FILL = (40, 35, 35, 255)
# Apart: arrows pushing out from a wall, ARROW_HEAD long (of the icon)
ARROW_HEAD = 0.14


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


def canvas():
    img = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def pie(parts):
    """A pizza cut into parts wedges, only the first in dough."""
    img, draw = canvas()
    c = ICON_SIZE / 2
    r = PIE_RADIUS * ICON_SIZE
    box = (c - r, c - r, c + r, c + r)
    draw.ellipse(box, fill=EMPTY_FILL)
    # PIL angles run clockwise from 3 o'clock
    start = -90
    draw.pieslice(box, start, start + 360 / parts, fill=DOUGH_FILL)
    if parts > 1:
        for k in range(parts):
            a = np.radians(start + 360 * k / parts)
            draw.line((c, c, c + r * np.cos(a), c + r * np.sin(a)), fill=INK, width=LINE)
    draw.ellipse(box, outline=INK, width=LINE)
    return img


def text(label):
    img, draw = canvas()
    font = ImageFont.load_default(size=int(DIGIT_SIZE * ICON_SIZE))
    draw.text((ICON_SIZE / 2, ICON_SIZE / 2), label, font=font, fill=INK, anchor='mm')
    return img


def times():
    img, draw = canvas()
    lo, hi = 0.3 * ICON_SIZE, 0.7 * ICON_SIZE
    draw.line((lo, lo, hi, hi), fill=INK, width=LINE)
    draw.line((lo, hi, hi, lo), fill=INK, width=LINE)
    return img


def apart():
    """Two arrows pushing away from a wall between them."""
    img, draw = canvas()
    c = ICON_SIZE / 2
    head = ARROW_HEAD * ICON_SIZE
    draw.line((c, 0.2 * ICON_SIZE, c, 0.8 * ICON_SIZE), fill=INK, width=LINE)
    for side in (-1, 1):
        near, far = c + side * 0.15 * ICON_SIZE, c + side * 0.45 * ICON_SIZE
        draw.line((near, c, far, c), fill=INK, width=LINE)
        draw.polygon([(far + side * LINE, c), (far - side * head, c - head), (far - side * head, c + head)], fill=INK)
    return img


def flame(fill):
    """A teardrop flame, tip up."""
    img, draw = canvas()
    c = ICON_SIZE / 2
    r = FLAME_RADIUS * ICON_SIZE
    t = np.linspace(0, 2 * np.pi, FLAME_POINTS, endpoint=False)
    points = list(zip(c + r * np.sin(t) * np.sin(t / 2), c - r * np.cos(t)))
    draw.polygon(points, fill=fill, outline=INK, width=LINE)
    return img


def main():
    rng = np.random.default_rng(SEED)
    brush(rng).save(OUT / 'sauce_brush.png')
    icons = {f'order_share_{n}': pie(n) for n in PIE_PARTS}
    icons |= {f'order_digit_{n}': text(str(n)) for n in range(1, MAX_DIGIT + 1)}
    icons |= {'order_times': times(), 'order_apart': apart(), 'order_well': flame(WELL_FILL), 'order_burnt': flame(BURNT_FILL)}
    for name, img in icons.items():
        img.save(OUT / f'{name}.png')
    print('wrote sauce_brush,', ', '.join(icons))


if __name__ == '__main__':
    main()
