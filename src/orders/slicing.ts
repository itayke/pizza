import { SLICING } from '../config';

const TAU = Math.PI * 2;
// Cut edges closer than this, radians, are one edge
const SAME_EDGE = 1e-6;

/** A wedge of the pizza, radians clockwise from its start (0 at 3 o'clock). */
export type Wedge = { start: number; width: number };

/** A stretch along a cut line, signed design px from the center, positive toward the line's angle. */
export type Span = { from: number; to: number };

/** A line through the pizza's center (angle as a line, 0 to π), cut along spans kept sorted and apart. */
export type CutLine = { angle: number; spans: Span[] };

/** Even cut lines through the center, the first top to bottom: the slicing orders are drawn for. */
export function autoCuts(): number[] {
  return Array.from({ length: SLICING.cuts }, (_, i) => Math.PI / 2 + (i * Math.PI) / SLICING.cuts);
}

/** How many slices orders are drawn for. */
export const autoSliceCount = (): number => Math.max(1, 2 * SLICING.cuts);

/** Both rays of each whole cut line, as slice edges. */
export const edgesOf = (cuts: readonly number[]): number[] => cuts.flatMap((angle) => [angle, angle + Math.PI]);

/** The slices edges (angles of rays from the center) make, each from one edge clockwise to the next; one whole pizza if none. */
export function slicesOf(edges: readonly number[]): Wedge[] {
  const sorted = edges
    .map((angle) => ((angle % TAU) + TAU) % TAU)
    .sort((a, b) => a - b)
    .filter((edge, i, all) => i === 0 || edge - all[i - 1] > SAME_EDGE);
  if (!sorted.length) return [{ start: 0, width: TAU }];
  return sorted.map((start, i) => ({ start, width: (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU) - start }));
}

/** Whether an angle falls in a wedge. */
export const inWedge = (angle: number, wedge: Wedge): boolean => (((angle - wedge.start) % TAU) + TAU) % TAU < wedge.width;

/** An angle as a line through the center, 0 to π. */
export const lineAngle = (angle: number): number => ((angle % Math.PI) + Math.PI) % Math.PI;

/** How far apart two lines through the center are, radians, 0 to π/2. */
export function lineGap(a: number, b: number): number {
  const d = lineAngle(a - b);
  return Math.min(d, Math.PI - d);
}

/** The cut line nearest an angle, if any is within reach (radians). */
export function nearestLine(lines: readonly CutLine[], angle: number, reach: number): CutLine | null {
  let best: CutLine | null = null;
  for (const line of lines) {
    if (lineGap(line.angle, angle) <= reach && (!best || lineGap(line.angle, angle) < lineGap(best.angle, angle))) best = line;
  }
  return best;
}

/** An angle snapped to the nearest step (radians), as a line. */
export const snapLine = (angle: number, step: number): number => (step > 0 ? lineAngle(Math.round(angle / step) * step) : lineAngle(angle));

/** Spans with from..to added: overlapping or touching ones merge into one. */
export function withSpan(spans: readonly Span[], from: number, to: number): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans, { from, to }].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/** How much of from..to spans cover, as a fraction of it. */
export function spanCoverage(spans: readonly Span[], from: number, to: number): number {
  if (to <= from) return 0;
  const cut = spans.reduce((sum, span) => sum + Math.max(0, Math.min(to, span.to) - Math.max(from, span.from)), 0);
  return cut / (to - from);
}

/** Slice edges cut lines make: each ray, center to the edge (layer px at an angle), cut along at least completeAt of it. */
export function sliceEdges(lines: readonly CutLine[], radiusAt: (angle: number) => number, completeAt: number): number[] {
  return lines.flatMap(({ angle, spans }) => {
    const edges: number[] = [];
    if (spanCoverage(spans, 0, radiusAt(angle)) >= completeAt) edges.push(angle);
    if (spanCoverage(spans, -radiusAt(angle + Math.PI), 0) >= completeAt) edges.push(angle + Math.PI);
    return edges;
  });
}
