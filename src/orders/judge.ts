import { BAKE, ORDER_JUDGE, PLACEMENT } from '../config';
import type { PlacedPiece, Topping } from '../stations/ToppingLayer';
import type { Doneness, Order, Parts, Rule } from './Order';

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

/** How well a pizza meets an order: each rule's score and its doneness's, each 0 to 1, and their mean. */
export type Verdict = { rules: number[]; doneness: number; total: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Score a pizza, as its pieces and bake level, against an order. */
export function judge(order: Order, pieces: readonly PlacedPiece[], bakeLevel: number): Verdict {
  const rules = order.rules.map((rule) => scoreRule(rule, pieces));
  const doneness = scoreDoneness(order.doneness, bakeLevel);
  const scores = [...rules, doneness];
  return { rules, doneness, total: scores.reduce((sum, s) => sum + s, 0) / scores.length };
}

function scoreRule(rule: Rule, pieces: readonly PlacedPiece[]): number {
  const of = (topping: Topping) => pieces.filter((p) => p.topping === topping);
  switch (rule.kind) {
    case 'share':
      return scoreShare(of(rule.topping), rule.parts);
    case 'count':
      return clamp01(1 - Math.abs(of(rule.topping).length - rule.n) * ORDER_JUDGE.countPenalty);
    case 'apart':
      return scoreApart(of(rule.a), of(rule.b));
  }
}

/**
 * The best-fitting wedge, of every rotation tried: how many of its cells hold a piece, less the pieces outside it.
 * The center belongs to every wedge, so pieces there count neither way.
 */
function scoreShare(pieces: readonly PlacedPiece[], parts: Parts): number {
  const { centerFree, sectorsPerTurn, rings, rotations, fillFull, strays, strayPenalty, edgeSlackDegrees } = ORDER_JUDGE;
  const center2 = centerFree ** 2;
  const spots = pieces
    .map((p) => ({ angle: p.polarAngle, reach: Math.min(1, p.fraction / PLACEMENT.innerRim) }))
    .filter((s) => s.reach >= centerFree);
  if (!spots.length) return 0;
  const width = TAU / parts;
  const slack = edgeSlackDegrees * DEG_TO_RAD;
  const sectors = Math.max(1, Math.round(sectorsPerTurn / parts));
  const cells = new Uint8Array(sectors * rings);
  // A whole pizza looks the same at any rotation
  const tries = parts === 1 ? 1 : rotations;
  let best = 0;
  for (let i = 0; i < tries; i++) {
    const start = (i / tries) * TAU;
    cells.fill(0);
    let outside = 0;
    for (const { angle, reach } of spots) {
      // Offset into the wedge, slack included on both sides
      const offset = ((((angle - start + slack) % TAU) + TAU) % TAU) - slack;
      if (offset >= width + slack) {
        outside++;
        continue;
      }
      const sector = Math.min(sectors - 1, Math.max(0, Math.floor((offset / width) * sectors)));
      // Rings of equal area between the free center and the inner rim
      const ring = Math.min(rings - 1, Math.floor(((reach ** 2 - center2) / (1 - center2)) * rings));
      cells[ring * sectors + sector] = 1;
    }
    const filled = cells.reduce((sum, c) => sum + c, 0) / cells.length;
    const fill = fillFull > 0 ? Math.min(1, filled / fillFull) : 1;
    best = Math.max(best, fill * clamp01(1 - Math.max(0, outside - strays) * strayPenalty));
  }
  return best;
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
