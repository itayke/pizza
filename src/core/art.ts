import { Assets, Rectangle, Sprite, Texture, type IHitArea } from 'pixi.js';
import { ASSET_DIR } from '../config';
import { ART, type ArtName } from '../generated/artLayout';

export type { ArtName };

// A pixel at least this opaque (of 255) takes presses
const HIT_ALPHA = 128;
// A pixel at least this opaque (of 255) counts as drawn
const DRAWN_ALPHA = 16;
const RGBA = 4;

// Textures used at runtime only, not placed in the layout (placeholders from tools/art/placeholders.py)
const EXTRA_TEXTURES = {
  sauce_brush: {},
  sauce_pattern: { addressMode: 'repeat' },
} as const;

// Order ticket icons, placeholders until drawn; drop a name here once the extractor cuts its art
const ORDER_ICONS = [
  'order_share_1',
  'order_share_2',
  'order_share_3',
  'order_share_4',
  'order_digit_1',
  'order_digit_2',
  'order_digit_3',
  'order_digit_4',
  'order_digit_5',
  'order_digit_6',
  'order_digit_7',
  'order_digit_8',
  'order_digit_9',
  'order_times',
  'order_apart',
  'order_well',
  'order_burnt',
] as const;

export type TextureName = ArtName | keyof typeof EXTRA_TEXTURES | (typeof ORDER_ICONS)[number];

export async function loadArt(): Promise<void> {
  const base = import.meta.env.BASE_URL + ASSET_DIR;
  // Mipmaps keep art clean when drawn well below its size
  const mipmaps = { autoGenerateMipmaps: true };
  await Assets.load([
    ...Object.entries(ART).map(([alias, { file }]) => ({ alias, src: base + file, data: mipmaps })),
    ...Object.entries(EXTRA_TEXTURES).map(([alias, style]) => ({ alias, src: `${base}${alias}.png`, data: { ...mipmaps, ...style } })),
    ...ORDER_ICONS.map((alias) => ({ alias, src: `${base}${alias}.png`, data: mipmaps })),
  ]);
}

export function artTexture(name: TextureName): Texture {
  return Texture.from(name);
}

/** Sprite at its layout position. */
export function artSprite(name: ArtName): Sprite {
  const { x, y } = ART[name];
  const sprite = new Sprite(artTexture(name));
  sprite.position.set(x, y);
  return sprite;
}

/** Point inside an art piece, given as fractions of its size. */
export function artPoint(name: ArtName, fx: number, fy: number): { x: number; y: number } {
  const { x, y, width, height } = ART[name];
  return { x: x + width * fx, y: y + height * fy };
}

/** A texture's pixels, RGBA row by row. */
function texturePixels(texture: Texture): Uint8ClampedArray {
  const { x, y, width, height } = texture.frame;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(texture.source.resource as CanvasImageSource, x, y, width, height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

const drawnBounds = new Map<Texture, Rectangle>();

/** The part of a texture that's drawn, past its see-through margins, in texture px; the whole of it if none is. */
export function drawnRect(texture: Texture): Rectangle {
  let rect = drawnBounds.get(texture);
  if (rect) return rect;
  const { width, height } = texture.frame;
  const pixels = texturePixels(texture);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (pixels[(py * width + px) * RGBA + 3] < DRAWN_ALPHA) continue;
      left = Math.min(left, px);
      right = Math.max(right, px);
      top = Math.min(top, py);
      bottom = Math.max(bottom, py);
    }
  }
  rect = right < 0 ? new Rectangle(0, 0, width, height) : new Rectangle(left, top, right - left + 1, bottom - top + 1);
  drawnBounds.set(texture, rect);
  return rect;
}

/** Hit area of a sprite's drawn pixels only, so presses on its see-through parts reach whatever lies beneath. */
export function opaqueHitArea(sprite: Sprite): IHitArea {
  const { texture } = sprite;
  const { width, height } = texture.frame;
  const pixels = texturePixels(texture);
  return {
    // Sprite-local points sit off the texture's corner by the anchor, read live since it can be retuned
    contains: (localX, localY) => {
      const px = Math.floor(localX + sprite.anchor.x * width);
      const py = Math.floor(localY + sprite.anchor.y * height);
      return px >= 0 && py >= 0 && px < width && py < height && pixels[(py * width + px) * RGBA + 3] >= HIT_ALPHA;
    },
  };
}
