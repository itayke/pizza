import { Container, Point, Sprite } from 'pixi.js';
import { artTexture, type TextureName } from '../core/art';
import { easeInOutCubic } from '../core/easing';

/** How a hand makes its pass: its size and focus, and how long each step takes, seconds. */
export type HandPassConfig = {
  /** Drawn width in its parent's px. */
  handWidth: number;
  /** Its focus (a pinch, a claw tip), as fractions of its art: what goes to from and to. */
  pivotX: number;
  pivotY: number;
  fadeInSeconds: number;
  grabSeconds: number;
  holdSeconds: number;
  moveSeconds: number;
  fadeOutSeconds: number;
  restSeconds: number;
};

/** Where a hand is a share u (0 to 1) of the way through its move, set into out. */
export type HandPath = (u: number, out: Point) => void;

/**
 * A hand showing a gesture, pass after pass: it fades in at the start of its move in its first frame, after grabSeconds
 * switches to its second (the grab), holds, makes its move, fades out, then rests before the next. Its move is from
 * to to (easing in and out), or a path of its own, taken at an even pace.
 */
export class HandPass extends Container {
  private readonly first: Sprite;
  private readonly then: Sprite;
  /** Where each pass starts and ends, in its parent's space. */
  readonly from = new Point();
  readonly to = new Point();

  constructor(
    first: TextureName,
    then: TextureName,
    private readonly config: HandPassConfig,
    private readonly path: HandPath | null = null,
  ) {
    super();
    this.eventMode = 'none';
    this.first = new Sprite(artTexture(first));
    this.then = new Sprite(artTexture(then));
    this.addChild(this.first, this.then);
    this.visible = false;
  }

  /** Size it and set its focus from config. */
  layout(): void {
    const { handWidth, pivotX, pivotY } = this.config;
    const { width, height } = this.first.texture;
    this.pivot.set(width * pivotX, height * pivotY);
    this.scale.set(handWidth / width);
  }

  /** Show it age seconds into its passes, at strength from 0 (off) to 1. */
  pose(age: number, strength: number): void {
    this.visible = strength > 0;
    if (!this.visible) return;
    const { fadeInSeconds, grabSeconds, holdSeconds, moveSeconds, fadeOutSeconds, restSeconds } = this.config;
    const grabAt = fadeInSeconds + grabSeconds;
    const moveAt = grabAt + holdSeconds;
    const fadeAt = moveAt + moveSeconds;
    const period = fadeAt + fadeOutSeconds + restSeconds;
    const t = period > 0 ? age % period : 0;

    const u = moveSeconds > 0 ? Math.min(1, Math.max(0, (t - moveAt) / moveSeconds)) : +(t >= moveAt);
    if (this.path) this.path(u, this.position);
    else {
      const move = easeInOutCubic(u);
      this.position.set(this.from.x + (this.to.x - this.from.x) * move, this.from.y + (this.to.y - this.from.y) * move);
    }
    const grabbed = t >= grabAt;
    this.first.visible = !grabbed;
    this.then.visible = grabbed;
    const fadeIn = fadeInSeconds > 0 ? Math.min(1, t / fadeInSeconds) : 1;
    const fadeOut = t < fadeAt ? 1 : fadeOutSeconds > 0 ? Math.max(0, 1 - (t - fadeAt) / fadeOutSeconds) : 0;
    this.alpha = fadeIn * fadeOut * strength;
  }
}
