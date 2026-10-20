import { ASSET_DIR, FONT } from '../config';

/** Load the hand font before anything draws words in it, so none show in a fallback font first. */
export async function loadFonts(): Promise<void> {
  const face = new FontFace(FONT.family, `url(${import.meta.env.BASE_URL}${ASSET_DIR}${FONT.file})`, { weight: FONT.weights });
  document.fonts.add(await face.load());
}
