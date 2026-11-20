import { Container, type Point } from 'pixi.js';
import { DRAG_CUE, SLICE_CUE } from '../config';
import { WORDS } from '../words';
import { CueWord } from './CueWord';
import { HandPass } from './HandPass';

/**
 * Idle tutorial for placing the dough: once it has waited untouched a while, a hand grabs at the ball and slides to the
 * peel, over and over, while the word DRAG shows. Any press takes it off until the next idle spell. The word is placed
 * by whoever holds it, at the cue words' spot.
 */
export class DragCue extends Container {
  private readonly hand = new HandPass('hand_open', 'hand_pinch', DRAG_CUE);
  readonly word = new CueWord(WORDS.drag);
  /** Seconds waiting without a press. */
  private idle = 0;
  /** Seconds since it last came up, for the word's landing and pulse and the hand's passes. */
  private age = 0;
  /** How much it shows, fading out once it stops. */
  private strength = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.hand);
  }

  /** Grab at from (the ball in its bowl) and let go at to (the peel's center), both in this cue's parent space. */
  layout(from: Point, to: Point): void {
    this.hand.from.copyFrom(from);
    this.hand.to.copyFrom(to);
    this.hand.layout();
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
    if (this.strength > 0) this.age += dt;
    this.word.pose(this.age, this.strength);
    this.hand.pose(this.age, this.strength);
  }
}
