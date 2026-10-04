import { Assets, Sprite, Texture, type IHitArea } from 'pixi.js';
import { ASSET_DIR } from '../config';
import { ART, type ArtName } from '../generated/artLayout';

export type { ArtName };

// A pixel at least this opaque (of 255) takes presses
const HIT_ALPHA = 128;

// Textures used at runtime only, not placed in the layout (placeholders from tools/art/placeholders.py)
const EXTRA_TEXTURES = {
  sauce_brush: {},
  sauce_pattern: { addressMode: 'repeat' },
} as const;

export type TextureName = ArtName | keyof typeof EXTRA_TEXTURES;

export async function loadArt(): Promise<void> {
  const base = import.meta.env.BASE_URL + ASSET_DIR;
  // Mipmaps keep art clean when drawn well below its size
  const mipmaps = { autoGenerateMipmaps: true };
  await Assets.load([
    ...Object.entries(ART).map(([alias, { file }]) => ({ alias, src: base + file, data: mipmaps })),
    ...Object.entries(EXTRA_TEXTURES).map(([alias, style]) => ({ alias, src: `${base}${alias}.png`, data: { ...mipmaps, ...style } })),
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

/** Hit area of a sprite's drawn pixels only, so presses on its see-through parts reach whatever lies beneath. */
export function opaqueHitArea(sprite: Sprite): IHitArea {
  const { texture } = sprite;
  const { x, y, width, height } = texture.frame;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(texture.source.resource as CanvasImageSource, x, y, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  return {
    // Sprite-local points sit off the texture's corner by the anchor, read live since it can be retuned
    contains: (localX, localY) => {
      const px = Math.floor(localX + sprite.anchor.x * width);
      const py = Math.floor(localY + sprite.anchor.y * height);
      return px >= 0 && py >= 0 && px < width && py < height && pixels[(py * width + px) * 4 + 3] >= HIT_ALPHA;
    },
  };
}
