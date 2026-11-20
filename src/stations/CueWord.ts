import { Container } from 'pixi.js';
import { SLICE_CUE } from '../config';
import { BentText } from '../core/BentText';
import { easeOutCubic } from '../core/easing';

const TAU = 2 * Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** A call to act in the hand font, styled as SLICE_CUE: outlined to stand out, it lands from large, then pulses. */
export class CueWord extends Container {
  private readonly backing = new BentText();
  private readonly word = new BentText();

  constructor(private readonly text: string) {
    super();
    this.eventMode = 'none';
    this.visible = false;
    this.addChild(this.backing, this.word);
  }

  /** Set it from config, centered at x, y. */
  layout(x: number, y: number): void {
    const { cap, color, outline, outlineColor } = SLICE_CUE;
    this.word.set(this.text, cap, 0);
    this.word.tint = color;
    this.backing.set(this.text, cap, 0, outline);
    this.backing.tint = outlineColor;
    this.position.set(x, y);
    this.rotation = SLICE_CUE.tilt * DEG_TO_RAD;
  }

  /** Show it age seconds after it appeared, at strength from 0 (off) to 1. */
  pose(age: number, strength: number): void {
    this.visible = strength > 0;
    if (!this.visible) return;
    const { popScale, popSeconds, pulse, pulseSpeed } = SLICE_CUE;
    const t = popSeconds > 0 ? Math.min(1, age / popSeconds) : 1;
    const landed = popScale + (1 - popScale) * easeOutCubic(t);
    // The pulse starts once it has landed
    const beat = 1 + pulse * Math.sin(TAU * pulseSpeed * Math.max(0, age - popSeconds));
    this.scale.set(landed * beat);
    this.alpha = t * strength;
  }
}
