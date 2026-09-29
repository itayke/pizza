import { PLACEMENT } from '../config';

/** How far from the dough center a press at distance lands, with the dough edge at edge along that angle: as pressed
 * up to the inner rim, then the overshoot eases toward the outer limit without reaching it, as fast as pull says. */
export function placedDistance(distance: number, edge: number): number {
  const inner = edge * PLACEMENT.innerRim;
  if (distance <= inner) return distance;
  const room = edge * Math.max(0, PLACEMENT.outerLimit - PLACEMENT.innerRim);
  return room > 0 ? inner + room * (1 - Math.exp((-PLACEMENT.pull * (distance - inner)) / room)) : inner;
}
