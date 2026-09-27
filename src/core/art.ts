import { Assets, Sprite, Texture } from 'pixi.js';
import { ASSET_DIR } from '../config';
import { ART, type ArtName } from '../generated/artLayout';

export type { ArtName };

export async function loadArt(): Promise<void> {
  const base = import.meta.env.BASE_URL + ASSET_DIR;
  // Mipmaps keep art clean when drawn well below its size
  const data = { autoGenerateMipmaps: true };
  await Assets.load(Object.entries(ART).map(([alias, { file }]) => ({ alias, src: base + file, data })));
}

export function artTexture(name: ArtName): Texture {
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
