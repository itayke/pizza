import { SHAKE } from '../config';
import { wander } from './noise';

const DEGREES = Math.PI / 180;
// Seeds for the three ways it shakes
const SEED_X = 1;
const SEED_Y = 2;
const SEED_TURN = 3;

/** Screen shake from trauma: knocks add to it, it wears off, and the shake grows faster than it does. */
export class Shake {
  /** How shaken, 0 to 1. */
  private trauma = 0;
  private time = 0;
  /** Where the shaken thing sits off its rest, design px and radians. */
  x = 0;
  y = 0;
  rotation = 0;

  /** A sudden knock. */
  kick(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Shaken at least this much, for as long as it's held. */
  hold(amount: number): void {
    this.trauma = Math.max(this.trauma, Math.min(1, amount));
  }

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - SHAKE.decay * dt);
    const strength = this.trauma ** SHAKE.power;
    const t = this.time * SHAKE.frequency;
    this.x = SHAKE.offset * strength * wander(t, SEED_X);
    this.y = SHAKE.offset * strength * wander(t, SEED_Y);
    this.rotation = SHAKE.angle * DEGREES * strength * wander(t, SEED_TURN);
  }
}
