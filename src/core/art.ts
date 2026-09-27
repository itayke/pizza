import { Assets, Sprite, Texture } from 'pixi.js';
import { ASSET_DIR } from '../config';
import { ART, type ArtName } from '../generated/artLayout';

export type { ArtName };

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
