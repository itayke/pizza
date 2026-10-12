import { SLICING } from '../config';

const TAU = Math.PI * 2;
// Cut edges closer than this, radians, are one edge
const SAME_EDGE = 1e-6;

/** A wedge of the pizza, radians clockwise from its start (0 at 3 o'clock). */
export type Wedge = { start: number; width: number };

/** The cuts made as the pizza is served: lines through its center, as angles, evenly spaced, the first top to bottom. */
export function autoCuts(): number[] {
  return Array.from({ length: SLICING.cuts }, (_, i) => Math.PI / 2 + (i * Math.PI) / SLICING.cuts);
}

/** How many slices the served pizza is cut into. */
export const autoSliceCount = (): number => Math.max(1, 2 * SLICING.cuts);

/** The slices cut lines make, each from one cut edge clockwise to the next; one whole pizza if uncut. */
export function slicesOf(cuts: readonly number[]): Wedge[] {
  const edges = cuts
    .flatMap((angle) => [angle, angle + Math.PI])
    .map((angle) => ((angle % TAU) + TAU) % TAU)
    .sort((a, b) => a - b)
    .filter((edge, i, all) => i === 0 || edge - all[i - 1] > SAME_EDGE);
  if (!edges.length) return [{ start: 0, width: TAU }];
  return edges.map((start, i) => ({ start, width: (i + 1 < edges.length ? edges[i + 1] : edges[0] + TAU) - start }));
}

/** Whether an angle falls in a wedge. */
export const inWedge = (angle: number, wedge: Wedge): boolean => (((angle - wedge.start) % TAU) + TAU) % TAU < wedge.width;
