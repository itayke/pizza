import { SLICE_CUE } from '../config';
import { CueWord } from './CueWord';
import type { HandPass } from './HandPass';
import { IdleCue } from './IdleCue';

/**
 * A tutorial cue: once its moment has waited untouched a while, its word lands and its hand shows the gesture, pass
 * after pass, until a press or the moment passing takes them off. Both fade in and out over SLICE_CUE's fadeSeconds.
 * Whoever holds it places the word and the hand, each where it belongs.
 */
export class HandCue {
  readonly word: CueWord;
  private readonly timing = new IdleCue();

  constructor(
    text: string,
    readonly hand: HandPass,
    private readonly config: { idleSeconds: number },
  ) {
    this.word = new CueWord(text);
  }

  /** A press: it comes off, and the wait starts over. */
  nudge(): void {
    this.timing.nudge();
  }

  /** How much it shows, 0 (off) to 1, for what shows along with it. */
  get strength(): number {
    return this.timing.strength;
  }

  /** waiting: its moment is here, with nothing pressed. */
  update(dt: number, waiting: boolean): void {
    const { timing } = this;
    timing.update(dt, waiting, this.config.idleSeconds, SLICE_CUE.fadeSeconds);
    this.word.pose(timing.age, timing.strength);
    this.hand.pose(timing.age, timing.strength);
  }
}
