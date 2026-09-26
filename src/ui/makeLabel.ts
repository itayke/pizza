import { Text } from 'pixi.js';
import { COLORS, LABEL_FONT_SIZE } from '../config';

/** Centered placeholder label for greybox shapes. */
export function makeLabel(text: string, x: number, y: number): Text {
  const label = new Text({ text, style: { fill: COLORS.label, fontSize: LABEL_FONT_SIZE, fontWeight: 'bold' } });
  label.anchor.set(0.5);
  label.position.set(x, y);
  return label;
}
