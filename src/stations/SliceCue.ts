import { Container } from 'pixi.js';
import { SLICE_CUE } from '../config';
import { BentText } from '../core/BentText';
import { easeOutCubic } from '../core/easing';
import { WORDS } from '../words';

const TAU = 2 * Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/**
 * The call to cut the pizza, once per pizza: the word, outlined to stand out, lands from large and pulses for a while,
 * then fades out.
 */
export class SliceCue extends Container {
  private readonly backing = new BentText();
  private readonly word = new BentText();
  private shown = false;
  /** Whether it has played for this pizza, so it doesn't play again. */
  private played = false;
  /** Seconds since it was shown. */
  private age = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.visible = false;
    this.addChild(this.backing, this.word);
  }

  /** Show it, unless it already played for this pizza. */
  play(): void {
    if (this.played) return;
    this.played = true;
    this.shown = true;
    this.age = 0;
    this.update(0);
  }

  /** Take it off; it stays played. */
  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.update(0);
  }

  /** Off, and ready to play again for a new pizza. */
  rearm(): void {
    this.hide();
    this.played = false;
  }

  /** How much it shows, 1 while it's up to 0 once faded out or hidden, for what shows along with it. */
  get strength(): number {
    if (!this.shown) return 0;
    const { showSeconds, fadeSeconds } = SLICE_CUE;
    const past = this.age - showSeconds;
    if (past <= 0) return 1;
    return fadeSeconds > 0 ? Math.max(0, 1 - past / fadeSeconds) : 0;
  }

  /** Set it from config, centered at x, y. */
  layout(x: number, y: number): void {
    const { cap, color, outline, outlineColor } = SLICE_CUE;
    this.word.set(WORDS.slice, cap, 0);
    this.word.tint = color;
    this.backing.set(WORDS.slice, cap, 0, outline);
    this.backing.tint = outlineColor;
    this.position.set(x, y);
    this.rotation = SLICE_CUE.tilt * DEG_TO_RAD;
  }

  update(dt: number): void {
    this.age += dt;
    this.visible = this.strength > 0;
    if (!this.visible) return;
    const { popScale, popSeconds, pulse, pulseSpeed } = SLICE_CUE;
    const t = popSeconds > 0 ? Math.min(1, this.age / popSeconds) : 1;
    const landed = popScale + (1 - popScale) * easeOutCubic(t);
    // The pulse starts once it has landed
    const beat = 1 + pulse * Math.sin(TAU * pulseSpeed * Math.max(0, this.age - popSeconds));
    this.scale.set(landed * beat);
    this.alpha = t * this.strength;
  }
}
