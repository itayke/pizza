import { SLICE_CUE } from '../config';
import { WORDS } from '../words';
import { CueWord } from './CueWord';

/** The call to cut the pizza, once per pizza: the word lands and pulses for a while, then fades out. */
export class SliceCue extends CueWord {
  private shown = false;
  /** Whether it has played for this pizza, so it doesn't play again. */
  private played = false;
  /** Seconds since it was shown. */
  private age = 0;

  constructor() {
    super(WORDS.slice);
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

  update(dt: number): void {
    this.age += dt;
    this.pose(this.age, this.strength);
  }
}
