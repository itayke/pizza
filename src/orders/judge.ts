import { BAKE, ORDER_JUDGE, PLACEMENT } from '../config';
import type { PlacedPiece, Topping } from '../stations/ToppingLayer';
import type { Doneness, Order, Parts, Rule } from './Order';
import { inWedge, slicesOf, type Wedge } from './slicing';

const TAU = Math.PI * 2;
// Slack when adding up slices to a share, radians
const SHARE_EPSILON = 1e-6;

/** A pizza to score: its pieces, bake level, and its dough's edge at an angle (layer px). */
export type Pizza = { pieces: readonly PlacedPiece[]; bakeLevel: number; radiusAt: (angle: number) => number };

/** How well a pizza meets an order: each rule's score and its doneness's, each 0 to 1, and their mean. */
export type Verdict = { rules: number[]; doneness: number; total: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Score a pizza against an order, sliced along edges (angles of rays from its center). */
export function judge(order: Order, pizza: Pizza, edges: readonly number[]): Verdict {
  const slices = slicesOf(edges);
  const rules = order.rules.map((rule) => scoreRule(rule, pizza, slices));
  const doneness = scoreDoneness(order.doneness, pizza.bakeLevel);
  const scores = [...rules, doneness];
  return { rules, doneness, total: scores.reduce((sum, s) => sum + s, 0) / scores.length };
}

function scoreRule(rule: Rule, pizza: Pizza, slices: Wedge[]): number {
  const of = (topping: Topping) => pizza.pieces.filter((p) => p.topping === topping);
  switch (rule.kind) {
    case 'share':
      return scoreShare(of(rule.topping), rule.parts, slices, pizza.radiusAt);
    case 'count':
      return clamp01(1 - Math.abs(of(rule.topping).length - rule.n) * ORDER_JUDGE.countPenalty);
    case 'apart':
      return scoreApart(of(rule.a), of(rule.b));
  }
}

/**
 * The most covered slices that make up the share should be covered and the rest clear: how much of the pizza is as
 * asked.
 */
function scoreShare(pieces: readonly PlacedPiece[], parts: Parts, slices: Wedge[], radiusAt: (angle: number) => number): number {
  if (!pieces.length) return 0;
  const covered = slices.map((slice) => ({ slice, coverage: sliceCoverage(pieces, slice, radiusAt) }));
  covered.sort((a, b) => b.coverage - a.coverage);
  let taken = 0;
  let right = 0;
  for (const { slice, coverage } of covered) {
    const asked = taken < TAU / parts - SHARE_EPSILON;
    if (asked) taken += slice.width;
    if (asked ? coverage >= ORDER_JUDGE.coverFull : coverage <= ORDER_JUDGE.clearMax) right += slice.width;
  }
  return right / TAU;
}

/**
 * How much of a slice, out to the inner rim, its own pieces cover: those centered in it, each a disc. Sampled evenly
 * over its area.
 */
export function sliceCoverage(pieces: readonly PlacedPiece[], slice: Wedge, radiusAt: (angle: number) => number): number {
  const own = pieces.filter((p) => inWedge(p.polarAngle, slice));
  if (!own.length) return 0;
  const n = ORDER_JUDGE.sliceSamples;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const angle = slice.start + ((i + 0.5) / n) * slice.width;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rim = PLACEMENT.innerRim * radiusAt(angle);
    for (let j = 0; j < n; j++) {
      // Even steps of area, out from the center
      const r = rim * Math.sqrt((j + 0.5) / n);
      const x = cos * r;
      const y = sin * r;
      if (own.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= (p.halfSize * ORDER_JUDGE.coverRadius) ** 2)) hits++;
    }
  }
  return hits / (n * n);
}

/** Both toppings on the pizza, losing score for each touching pair. */
function scoreApart(a: readonly PlacedPiece[], b: readonly PlacedPiece[]): number {
  if (!a.length || !b.length) return 0;
  let touches = 0;
  for (const p of a) {
    for (const q of b) {
      if (Math.hypot(p.x - q.x, p.y - q.y) < (p.halfSize + q.halfSize) * ORDER_JUDGE.touchFactor) touches++;
    }
  }
  return clamp01(1 - touches * ORDER_JUDGE.touchPenalty);
}

/** Full within its bake range, fading out past it. */
function scoreDoneness(doneness: Doneness, level: number): number {
  const ranges: Record<Doneness, [number, number]> = {
    normal: [BAKE.minBaked, BAKE.wellFrom],
    well: [BAKE.wellFrom, BAKE.burntFrom],
    burnt: [BAKE.burntFrom, 1],
  };
  const [from, to] = ranges[doneness];
  const off = Math.max(0, from - level, level - to);
  return ORDER_JUDGE.bakeTolerance > 0 ? clamp01(1 - off / ORDER_JUDGE.bakeTolerance) : off > 0 ? 0 : 1;
}
