import { Container, type Point } from 'pixi.js';
import { DRAG_CUE, SLICE_CUE } from '../config';
import { WORDS } from '../words';
import { CueWord } from './CueWord';
import { HandPass } from './HandPass';
import { IdleCue } from './IdleCue';

/**
 * Idle tutorial for placing the dough: once it has waited untouched a while, a hand grabs at the ball and slides to the
 * peel, over and over, while the word DRAG shows. Any press takes it off until the next idle spell. The word is placed
 * by whoever holds it, at the cue words' spot.
 */
export class DragCue extends Container {
  private readonly hand = new HandPass('hand_open', 'hand_pinch', DRAG_CUE);
  readonly word = new CueWord(WORDS.drag);
  private readonly timing = new IdleCue();

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
    this.timing.nudge();
  }

  /** waiting: the dough is in its bowl, ready to be dragged. */
  update(dt: number, waiting: boolean): void {
    const { timing } = this;
    timing.update(dt, waiting, DRAG_CUE.idleSeconds, SLICE_CUE.fadeSeconds);
    this.word.pose(timing.age, timing.strength);
    this.hand.pose(timing.age, timing.strength);
  }
}
