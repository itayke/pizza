import { Color, Container, Sprite } from 'pixi.js';
import { LABEL_TEXT } from '../config';
import { artTexture, type ArtName } from '../core/art';
import { BentText, capToFit } from '../core/BentText';

const DEGREES = Math.PI / 180;
// FNV-1a, for a steady per-word wobble
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UINT32_MAX = 0xffffffff;

/** Which LABEL_TEXT width and arc a label takes. */
export type LabelPlace = 'bin' | 'bowl' | 'tray' | 'gauge';

/** A steady value in [-1, 1] for a word, so its wobble holds across reloads. */
function wobble(word: string): number {
  let hash = FNV_OFFSET;
  for (const char of word) hash = Math.imul(hash ^ char.codePointAt(0)!, FNV_PRIME);
  return ((hash >>> 0) / UINT32_MAX) * 2 - 1;
}

/** Every label, so they can share one size. */
const labels = new Set<Label>();

/** The capital height every label is set at: LABEL_TEXT's, or smaller so each word fits its width. */
function sharedCap(): number {
  let cap = LABEL_TEXT.cap;
  for (const label of labels) {
    const width = LABEL_TEXT[`${label.place}Width`];
    if (width > 0) cap = Math.min(cap, capToFit(label.word, width));
  }
  return cap;
}

/** A word naming something, set on its arc in ink, the same size as every other label wherever it sits. */
export class Label extends Container {
  protected readonly text = new BentText();
  /** Scale that cancels whatever its parents are scaled by. */
  protected unscale = 1;
  /** The drawn label it stands in for, shown faint to compare against while tuning. */
  private readonly art: Sprite;

  /** art is the drawn label whose spot it takes. */
  constructor(
    readonly word: string,
    readonly place: LabelPlace,
    art: ArtName,
  ) {
    super();
    labels.add(this);
    this.art = new Sprite({ texture: artTexture(art), anchor: 0.5 });
    this.addChild(this.text, this.art);
  }

  /**
   * Center the word at x, y on its arc, whose middle is above arcX; it tilts by how far off that middle it sits, plus
   * tilt degrees clockwise.
   */
  layout(x: number, y: number, arcX: number, tilt = 0): void {
    const radius = LABEL_TEXT[`${this.place}Radius`];
    this.position.set(x, y);
    this.text.set(this.word, sharedCap(), radius ? 1 / radius : 0);
    const along = radius ? Math.asin(Math.max(-1, Math.min(1, (x - arcX) / radius))) : 0;
    this.text.rotation = -along + (tilt + wobble(this.word) * LABEL_TEXT.tiltJitter) * DEGREES;
    this.art.alpha = LABEL_TEXT.artAlpha;
    this.art.visible = LABEL_TEXT.artAlpha > 0;
    this.inkToward(0);
  }

  /** Keep the design size under whatever scales its parents, up to root. */
  keepSize(root: Container): void {
    let scale = 1;
    for (let parent = this.parent; parent && parent !== root; parent = parent.parent) scale *= parent.scale.x;
    this.unscale = 1 / scale;
    this.scale.set(this.unscale);
    // The drawn label shows at its own size in its parent's space
    this.art.scale.set(scale);
  }

  /** Ink, mixed toward color by amount. */
  protected inkToward(amount: number, color = LABEL_TEXT.ink): void {
    const ink = new Color(LABEL_TEXT.ink).toRgbArray();
    const toward = new Color(color).toRgbArray();
    this.text.tint = ink.map((c, i) => c + (toward[i] - c) * amount) as [number, number, number];
  }
}

/** Keep every label under root at its design size, whatever its parents are scaled by. */
export function keepLabelSizes(root: Container): void {
  for (const label of labels) label.keepSize(root);
}
