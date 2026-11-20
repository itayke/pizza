/**
 * Times a cue that comes up once its moment has waited untouched a while: it fades in, plays on while that lasts, and
 * fades out on a press or once the moment passes, ready to come back after the next wait.
 */
export class IdleCue {
  /** Seconds since it last came up, for what it plays. */
  age = 0;
  /** How much it shows, 0 (off) to 1. */
  strength = 0;
  /** Seconds the moment has waited without a press. */
  private idle = 0;

  /** A press: it comes off, and the wait starts over. */
  nudge(): void {
    this.idle = 0;
  }

  /** waiting: its moment is here. It comes up after idleSeconds of that, fading in and out over fadeSeconds. */
  update(dt: number, waiting: boolean, idleSeconds: number, fadeSeconds: number): void {
    this.idle = waiting ? this.idle + dt : 0;
    const active = waiting && this.idle >= idleSeconds;
    if (active && this.strength === 0) this.age = 0;
    const step = fadeSeconds > 0 ? dt / fadeSeconds : 1;
    this.strength = Math.min(1, Math.max(0, this.strength + (active ? step : -step)));
    if (this.strength > 0) this.age += dt;
  }
}
