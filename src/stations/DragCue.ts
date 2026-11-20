import { Container, Point, Sprite } from 'pixi.js';
import { DRAG_CUE, SLICE_CUE } from '../config';
import { artTexture } from '../core/art';
import { easeInOutCubic } from '../core/easing';
import { WORDS } from '../words';
import { CueWord } from './CueWord';

/**
 * Idle tutorial for placing the dough: once it has waited untouched a while, a hand grabs at the ball and slides to the
 * peel, over and over, while the word DRAG shows. Any press takes it off until the next idle spell. The word is placed
 * by whoever holds it, at the cue words' spot.
 */
export class DragCue extends Container {
  private readonly open = new Sprite(artTexture('hand_open'));
  private readonly pinch = new Sprite(artTexture('hand_pinch'));
  private readonly hand = new Container();
  readonly word = new CueWord(WORDS.drag);
  /** Where the hand grabs (the ball in its bowl) and lets go (the peel's center), scene px. */
  private readonly from = new Point();
  private readonly to = new Point();
  /** Seconds waiting without a press. */
  private idle = 0;
  /** Seconds since it last came up, for the word's landing and pulse and the hand's passes. */
  private age = 0;
  /** How much it shows, fading out once it stops. */
  private strength = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.hand.addChild(this.open, this.pinch);
    this.addChild(this.hand);
    this.visible = false;
  }

  /** Grab at from and let go at to, both in this cue's parent space. */
  layout(from: Point, to: Point): void {
    const { handWidth, pivotX, pivotY } = DRAG_CUE;
    this.from.copyFrom(from);
    this.to.copyFrom(to);
    const { width, height } = this.open.texture;
    this.hand.pivot.set(width * pivotX, height * pivotY);
    this.hand.scale.set(handWidth / width);
  }

  /** A press: it comes off, and the wait starts over. */
  nudge(): void {
    this.idle = 0;
  }

  /** waiting: the dough is in its bowl, ready to be dragged. */
  update(dt: number, waiting: boolean): void {
    this.idle = waiting ? this.idle + dt : 0;
    const active = waiting && this.idle >= DRAG_CUE.idleSeconds;
    if (active && this.strength === 0) this.age = 0;
    const fade = SLICE_CUE.fadeSeconds;
    this.strength = active ? 1 : fade > 0 ? Math.max(0, this.strength - dt / fade) : 0;
    this.visible = this.strength > 0;
    if (!this.visible) {
      this.word.pose(0, 0);
      return;
    }
    this.age += dt;
    this.word.pose(this.age, this.strength);
    this.poseHand();
  }

  /** The hand's place in its pass: fade in open, pinch, slide eased in and out, fade out, rest. */
  private poseHand(): void {
    const { fadeInSeconds, openSeconds, pinchSeconds, slideSeconds, fadeOutSeconds, restSeconds } = DRAG_CUE;
    const pinchAt = fadeInSeconds + openSeconds;
    const slideAt = pinchAt + pinchSeconds;
    const fadeAt = slideAt + slideSeconds;
    const restAt = fadeAt + fadeOutSeconds;
    const period = restAt + restSeconds;
    const t = period > 0 ? this.age % period : 0;

    const slide = easeInOutCubic(slideSeconds > 0 ? Math.min(1, Math.max(0, (t - slideAt) / slideSeconds)) : +(t >= slideAt));
    this.hand.position.set(this.from.x + (this.to.x - this.from.x) * slide, this.from.y + (this.to.y - this.from.y) * slide);
    const pinched = t >= pinchAt;
    this.open.visible = !pinched;
    this.pinch.visible = pinched;
    const fadeIn = fadeInSeconds > 0 ? Math.min(1, t / fadeInSeconds) : 1;
    const fadeOut = t < fadeAt ? 1 : fadeOutSeconds > 0 ? Math.max(0, 1 - (t - fadeAt) / fadeOutSeconds) : 0;
    this.hand.alpha = fadeIn * fadeOut * this.strength;
  }
}
