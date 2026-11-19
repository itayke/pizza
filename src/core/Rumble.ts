import { HAPTICS } from '../config';

const MS_PER_SECOND = 1000;
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

/** Buzzes the device while on, where it can: a kick as it starts, then steady pulses. */
export class Rumble {
  private on = false;
  /** Seconds until the next pulse. */
  private wait = 0;

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!canVibrate) return;
    navigator.vibrate(on ? HAPTICS.kickMs : 0);
    this.wait = HAPTICS.kickMs / MS_PER_SECOND;
  }

  update(dt: number): void {
    if (!this.on || !canVibrate || HAPTICS.pulseMs <= 0 || (this.wait -= dt) > 0) return;
    navigator.vibrate(HAPTICS.pulseMs);
    this.wait = HAPTICS.everyMs / MS_PER_SECOND;
  }
}
