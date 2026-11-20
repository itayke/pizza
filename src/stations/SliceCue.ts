import { Container } from 'pixi.js';
import { SLICE_CUE, SLICE_HAND } from '../config';
import { WORDS } from '../words';
import { CueWord } from './CueWord';
import { HandPass } from './HandPass';
import { IdleCue } from './IdleCue';

/**
 * The call to cut the pizza: once it has waited baked and uncut a while, untouched and with no fire, the word lands and
 * a hand draws its claw down the upright cut, pass after pass, until a press or the cut takes them off. The pizza's
 * cut guides fade along with it, by its strength.
 */
export class SliceCue extends Container {
  private readonly word = new CueWord(WORDS.slice);
  /** Its stroke runs from hand.from to hand.to, set by whoever holds it. */
  readonly hand = new HandPass('hand_point', 'hand_point', SLICE_HAND);
  private readonly timing = new IdleCue();

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.hand, this.word);
  }

  /** Set it from config, the word centered at x, y. */
  layout(x: number, y: number): void {
    this.word.layout(x, y);
    this.hand.layout();
  }

  /** A press: it comes off, and the wait starts over. */
  nudge(): void {
    this.timing.nudge();
  }

  /** How much it shows, 0 (off) to 1, for what shows along with it. */
  get strength(): number {
    return this.timing.strength;
  }

  /** waiting: the pizza can be cut and isn't yet, with no fire. */
  update(dt: number, waiting: boolean): void {
    const { timing } = this;
    timing.update(dt, waiting, SLICE_CUE.idleSeconds, SLICE_CUE.fadeSeconds);
    this.word.pose(timing.age, timing.strength);
    this.hand.pose(timing.age, timing.strength);
  }
}
