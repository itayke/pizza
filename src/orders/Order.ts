import { ORDERS, SHARE_TOPPINGS, WHOLE_TOPPINGS } from '../config';
import { between, pick, weighted } from '../core/random';
import type { Topping } from '../stations/ToppingLayer';
import { autoSliceCount } from './slicing';

// Count digits drawn for the ticket
export const MAX_COUNT_DIGIT = 9;

/** Equal parts a share splits the pizza into, one of which holds the topping. */
export type Parts = 1 | 2 | 3 | 4;
export type Doneness = 'normal' | 'well' | 'burnt';

/** One line of an order: a topping covering one of parts equal shares of the slices and no others, exactly n of a
 * topping, or a and b never touching. Any rule's toppings must be on the pizza. */
export type Rule =
  | { kind: 'share'; topping: Topping; parts: Parts }
  | { kind: 'count'; topping: Topping; n: number }
  | { kind: 'apart'; a: Topping; b: Topping };

export type Order = { rules: Rule[]; doneness: Doneness };

const KIND_ORDER: Rule['kind'][] = ['share', 'count', 'apart'];

/** What a drawn rule will be, before its toppings are picked. */
type Draw = { kind: 'share'; parts: Parts } | { kind: 'count' } | { kind: 'apart' };

/** Every rule that can be drawn, with its weight; read live so tuning applies to the next order. */
const draws = (): { value: Draw; weight: number }[] => [
  { value: { kind: 'share', parts: 1 }, weight: ORDERS.wholeWeight },
  { value: { kind: 'share', parts: 2 }, weight: ORDERS.halfWeight },
  { value: { kind: 'share', parts: 3 }, weight: ORDERS.thirdWeight },
  { value: { kind: 'share', parts: 4 }, weight: ORDERS.quarterWeight },
  { value: { kind: 'count' }, weight: ORDERS.countWeight },
  { value: { kind: 'apart' }, weight: ORDERS.apartWeight },
];

/** A new order a pizza cut into slices can meet, its rules grouped by kind. */
export function drawOrder(slices = autoSliceCount()): Order {
  for (let i = 0; i < ORDERS.tries; i++) {
    const rules = drawRules(slices);
    if (rules) return { rules: rules.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)), doneness: drawDoneness() };
  }
  return { rules: [{ kind: 'share', topping: pick(SHARE_TOPPINGS), parts: 1 }], doneness: 'normal' };
}

function drawDoneness(): Doneness {
  const r = Math.random();
  if (r < ORDERS.burntChance) return 'burnt';
  return r < ORDERS.burntChance + ORDERS.wellChance ? 'well' : 'normal';
}

/** Rules drawn by weight, shares only in parts the slices split evenly into; null if they can't be met or ran out of
 * toppings. */
function drawRules(slices: number): Rule[] | null {
  const pool = draws().filter(({ value }) => value.kind !== 'share' || slices % value.parts === 0);
  const rules: Rule[] = [];
  // Toppings already given a share or a count, which each topping gets at most one of
  const placed = new Set<Topping>();
  const count = between(ORDERS.minRules, ORDERS.maxRules);
  for (let i = 0; i < count; i++) {
    const draw = weighted(pool);
    if (!draw) return null;
    if (draw.kind === 'apart') {
      const a = pick(WHOLE_TOPPINGS);
      const b = pick(WHOLE_TOPPINGS.filter((t) => t !== a));
      if (rules.some((rule) => isPair(rule, a, b))) return null;
      rules.push({ kind: 'apart', a, b });
      continue;
    }
    const free = (draw.kind === 'share' ? SHARE_TOPPINGS : WHOLE_TOPPINGS).filter((t) => !placed.has(t));
    if (!free.length) return null;
    const topping = pick(free);
    placed.add(topping);
    rules.push(draw.kind === 'count' ? { kind: 'count', topping, n: between(1, Math.min(ORDERS.maxCount, MAX_COUNT_DIGIT)) } : { kind: 'share', topping, parts: draw.parts });
  }
  return canMeet(rules, slices) ? rules : null;
}

const isPair = (rule: Rule, a: Topping, b: Topping) =>
  rule.kind === 'apart' && ((rule.a === a && rule.b === b) || (rule.a === b && rule.b === a));

/**
 * Whether every topping kept apart from others has room: the slices it takes (its share, or one) plus those its
 * partners take must fit the pizza. Partners kept apart from each other take slices of their own; the rest may
 * overlap, so only the roomiest such group counts.
 */
export function canMeet(rules: readonly Rule[], slices: number): boolean {
  const takes = (t: Topping) => {
    const share = rules.find((rule) => rule.kind === 'share' && rule.topping === t);
    return share?.kind === 'share' ? slices / share.parts : 1;
  };
  const apart = (a: Topping, b: Topping) => rules.some((rule) => isPair(rule, a, b));
  const toppings = new Set(rules.flatMap((rule) => (rule.kind === 'apart' ? [rule.a, rule.b] : [])));
  for (const t of toppings) {
    const partners = [...toppings].filter((other) => apart(t, other));
    // Every group of partners that are all apart from each other
    let room = 0;
    for (let mask = 1; mask < 1 << partners.length; mask++) {
      const group = partners.filter((_, i) => mask & (1 << i));
      if (group.some((a, i) => group.slice(i + 1).some((b) => !apart(a, b)))) continue;
      room = Math.max(room, group.reduce((sum, p) => sum + takes(p), 0));
    }
    if (takes(t) + room > slices) return false;
  }
  return true;
}
