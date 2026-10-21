import { describe, expect, it } from 'vitest';
import { BAKE, DOUGH, ORDER_JUDGE, ORDERS, PLACEMENT, SHARE_TOPPINGS, TOPPINGS, WHOLE_TOPPINGS } from '../config';
import { ART } from '../generated/artLayout';
import type { PlacedPiece, Topping } from '../stations/ToppingLayer';
import { judge } from './judge';
import { canMeet, drawOrder, type Doneness, type Order, type Parts, type Rule } from './Order';
import { autoCuts, autoSliceCount, edgesOf, inWedge, slicesOf } from './slicing';

const DRAWS = 1000;
const RANDOM_SETS = 3000;
const PARTS: Parts[] = [1, 2, 3, 4];
// Bake level in the middle of each doneness's range
const BAKED: Record<Doneness, number> = {
  normal: (BAKE.minBaked + BAKE.wellFrom) / 2,
  well: (BAKE.wellFrom + BAKE.burntFrom) / 2,
  burnt: (BAKE.burntFrom + 1) / 2,
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * Slices for each topping kept apart from others, found by trying every placement: a shared topping takes a run of
 * slices its share long, any other one slice, and toppings kept apart never share one; null if there's no way.
 */
function assignSlices(rules: readonly Rule[], slices: number): Map<Topping, number[]> | null {
  const pairs = rules.filter((r): r is Extract<Rule, { kind: 'apart' }> => r.kind === 'apart');
  const toppings = [...new Set(pairs.flatMap((r) => [r.a, r.b]))];
  const length = (t: Topping) => {
    const share = rules.find((r) => r.kind === 'share' && r.topping === t);
    return share?.kind === 'share' ? slices / share.parts : 1;
  };
  const taken = new Map<Topping, number[]>();
  const place = (i: number): boolean => {
    if (i === toppings.length) return true;
    const t = toppings[i];
    for (let start = 0; start < slices; start++) {
      const run = Array.from({ length: length(t) }, (_, k) => (start + k) % slices);
      const clash = pairs.some((p) => (p.a === t || p.b === t) && taken.get(p.a === t ? p.b : p.a)?.some((s) => run.includes(s)));
      if (clash) continue;
      taken.set(t, run);
      if (place(i + 1)) return true;
      taken.delete(t);
    }
    return false;
  };
  return place(0) ? taken : null;
}

/** Rules drawn at random with no check that they can be met; each topping still gets at most one share or count. */
function randomRules(): Rule[] {
  const rules: Rule[] = [];
  const placed = new Set<Topping>();
  for (let i = 0; i < ORDERS.maxRules + 1; i++) {
    const kind = pick(['share', 'count', 'apart'] as const);
    if (kind === 'apart') {
      const a = pick(WHOLE_TOPPINGS);
      rules.push({ kind, a, b: pick(WHOLE_TOPPINGS.filter((t) => t !== a)) });
      continue;
    }
    const free = (kind === 'share' ? SHARE_TOPPINGS : WHOLE_TOPPINGS).filter((t) => !placed.has(t));
    if (!free.length) continue;
    const topping = pick(free);
    placed.add(topping);
    rules.push(kind === 'share' ? { kind, topping, parts: pick(PARTS.filter((p) => autoSliceCount() % p === 0)) } : { kind, topping, n: 1 });
  }
  return rules;
}

/** A piece of a topping at its art size, centered at a point on dough rolled to the rim. */
function piece(topping: Topping, x: number, y: number): PlacedPiece {
  const { width, height } = ART[`topping_${topping}_raw`];
  return { topping, polarAngle: Math.atan2(y, x), fraction: Math.hypot(x, y) / DOUGH.rimRadius, x, y, halfSize: (Math.max(width, height) / 2) * TOPPINGS.scale };
}

const touches = (p: PlacedPiece, q: PlacedPiece) => Math.hypot(p.x - q.x, p.y - q.y) < (p.halfSize + q.halfSize) * ORDER_JUDGE.touchFactor;

/**
 * Lay a pizza that meets an order, as a careful player would: each shared topping packs the slices it's given, every
 * other topping goes in its slice (or anywhere if it has none), each piece kept from touching what it must not.
 */
function layPizza(order: Order): PlacedPiece[] {
  const slices = slicesOf(edgesOf(autoCuts()));
  const given = assignSlices(order.rules, slices.length)!;
  const rim = PLACEMENT.innerRim * DOUGH.rimRadius;
  const pieces: PlacedPiece[] = [];
  const partners = (t: Topping) =>
    order.rules.flatMap((r) => (r.kind === 'apart' && (r.a === t || r.b === t) ? [r.a === t ? r.b : r.a] : []));
  // Spots on a grid as fine as the smallest piece's disc, inside the inner rim
  const spacing = ORDER_JUDGE.coverRadius * Math.min(...SHARE_TOPPINGS.map((t) => piece(t, 0, 0).halfSize));
  const spots: { x: number; y: number }[] = [];
  for (let x = -rim; x <= rim; x += spacing) for (let y = -rim; y <= rim; y += spacing) if (Math.hypot(x, y) <= rim) spots.push({ x, y });
  const inSlices = (indices: number[]) => spots.filter((s) => indices.some((i) => inWedge(Math.atan2(s.y, s.x), slices[i])));
  const clear = (p: PlacedPiece) => !pieces.some((q) => partners(p.topping).includes(q.topping) && touches(p, q));

  for (const rule of order.rules) {
    if (rule.kind !== 'share') continue;
    // Its own slices, or the first run its share long if it's kept from nothing
    const own = given.get(rule.topping) ?? Array.from({ length: slices.length / rule.parts }, (_, i) => i);
    for (const s of inSlices(own)) {
      const p = piece(rule.topping, s.x, s.y);
      if (clear(p)) pieces.push(p);
    }
  }
  /** Lay n pieces of a topping, each where it's farthest from anything it must not touch, or its own kind. */
  const layClear = (t: Topping, n: number) => {
    const own = given.get(t);
    for (let i = 0; i < n; i++) {
      const avoid = pieces.filter((q) => q.topping === t || partners(t).includes(q.topping));
      const room = (p: PlacedPiece) => Math.min(Infinity, ...avoid.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
      const options = (own ? inSlices(own) : spots).map((s) => piece(t, s.x, s.y)).filter(clear);
      if (options.length) pieces.push(options.reduce((a, b) => (room(b) > room(a) ? b : a)));
    }
  };
  for (const rule of order.rules) if (rule.kind === 'count') layClear(rule.topping, rule.n);
  for (const rule of order.rules) {
    if (rule.kind !== 'apart') continue;
    for (const t of [rule.a, rule.b]) if (!pieces.some((p) => p.topping === t)) layClear(t, 1);
  }
  return pieces;
}

describe('orders', () => {
  const orders = Array.from({ length: DRAWS }, () => drawOrder());

  it('keep to their limits', () => {
    for (const order of orders) {
      expect(order.rules.length).toBeGreaterThanOrEqual(ORDERS.minRules);
      expect(order.rules.length).toBeLessThanOrEqual(ORDERS.maxRules);
      const placed = order.rules.flatMap((r) => (r.kind === 'apart' ? [] : [r.topping]));
      expect(new Set(placed).size).toBe(placed.length);
      for (const rule of order.rules) {
        if (rule.kind === 'share') expect(autoSliceCount() % rule.parts).toBe(0);
        if (rule.kind === 'count') expect(rule.n).toBeLessThanOrEqual(ORDERS.maxCount);
        if (rule.kind === 'apart') expect(rule.a).not.toBe(rule.b);
      }
    }
  });

  it('are kept exactly when their toppings fit the slices', () => {
    for (let i = 0; i < RANDOM_SETS; i++) {
      const rules = randomRules();
      expect({ rules, met: canMeet(rules, autoSliceCount()) }).toEqual({ rules, met: assignSlices(rules, autoSliceCount()) !== null });
    }
  });

  it('can all be met in full', () => {
    const radiusAt = () => DOUGH.rimRadius;
    const missed = orders
      .map((order) => ({ order, verdict: judge(order, { pieces: layPizza(order), bakeLevel: BAKED[order.doneness], radiusAt }, edgesOf(autoCuts())) }))
      .filter(({ verdict }) => verdict.total < 1)
      .map(({ order, verdict }) => ({ rules: order.rules, scores: verdict.rules }));
    expect({ count: missed.length, first: missed.slice(0, 4) }).toEqual({ count: 0, first: [] });
  });
});
