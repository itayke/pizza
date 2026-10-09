import { ORDERS, SHARE_TOPPINGS, WHOLE_TOPPINGS } from '../config';
import type { Topping } from '../stations/ToppingLayer';

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
// Share wedges in a drawn-up order start on this many even steps around, so neighbors can line up edge to edge
const WEDGE_STEPS = 12;
// Angles checked around the pizza when telling whether an order can be met
const ANGLE_SAMPLES = 360;
// Count digits drawn for the ticket
export const MAX_COUNT_DIGIT = 9;

/** Equal wedges a share cuts the pizza into, one of which holds the topping. */
export type Parts = 1 | 2 | 3 | 4;
export type Doneness = 'normal' | 'well' | 'burnt';

/** One line of an order: a topping only within one of parts equal wedges, exactly n of a topping, or a and b never
 * touching. Any rule's toppings must be on the pizza. */
export type Rule =
  | { kind: 'share'; topping: Topping; parts: Parts }
  | { kind: 'count'; topping: Topping; n: number }
  | { kind: 'apart'; a: Topping; b: Topping };

export type Order = { rules: Rule[]; doneness: Doneness };

/** A wedge of the pizza, radians clockwise from its start. */
export type Wedge = { start: number; width: number };

/** An order with the pizza it was drawn along with: a wedge for each shared topping. */
export type Plan = { order: Order; wedges: Map<Topping, Wedge> };

const KIND_ORDER: Rule['kind'][] = ['share', 'count', 'apart'];

/** What a drawn rule will be, before its toppings are picked. */
type Draw = { kind: 'share'; parts: Parts } | { kind: 'count' } | { kind: 'apart' };

/** Every rule that can be drawn, with its weight; read live so tuning applies to the next order. */
const draws = (): { draw: Draw; weight: number }[] => [
  { draw: { kind: 'share', parts: 1 }, weight: ORDERS.wholeWeight },
  { draw: { kind: 'share', parts: 2 }, weight: ORDERS.halfWeight },
  { draw: { kind: 'share', parts: 3 }, weight: ORDERS.thirdWeight },
  { draw: { kind: 'share', parts: 4 }, weight: ORDERS.quarterWeight },
  { draw: { kind: 'count' }, weight: ORDERS.countWeight },
  { draw: { kind: 'apart' }, weight: ORDERS.apartWeight },
];

/** One of items, each as likely as its weight; null if none has any. */
function weighted<T>(items: { draw: T; weight: number }[]): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  return (items.find((item) => (r -= Math.max(0, item.weight)) < 0) ?? items[items.length - 1]).draw;
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** A new order a pizza can meet, its rules grouped by kind. */
export function drawOrder(): Order {
  return drawPlan().order;
}

/** A new order along with the pizza that meets it. */
export function drawPlan(): Plan {
  for (let i = 0; i < ORDERS.tries; i++) {
    const drawn = drawRules();
    if (!drawn) continue;
    const rules = drawn.rules.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return { order: { rules, doneness: drawDoneness() }, wedges: drawn.wedges };
  }
  const topping = pick(SHARE_TOPPINGS);
  return { order: { rules: [{ kind: 'share', topping, parts: 1 }], doneness: 'normal' }, wedges: new Map([[topping, { start: 0, width: TAU }]]) };
}

function drawDoneness(): Doneness {
  const r = Math.random();
  if (r < ORDERS.burntChance) return 'burnt';
  return r < ORDERS.burntChance + ORDERS.wellChance ? 'well' : 'normal';
}

/**
 * Rules drawn along with a pizza that meets them: each share gets a wedge on it, kept only if every apart pair can sit
 * in wedges that don't overlap, or in a free gap; null if this draw can't be met or ran out of toppings.
 */
function drawRules(): { rules: Rule[]; wedges: Map<Topping, Wedge> } | null {
  const pool = draws();
  const rules: Rule[] = [];
  // Toppings already given a share or a count, which each topping gets at most one of
  const placed = new Set<Topping>();
  const wedges = new Map<Topping, Wedge>();
  const count = between(ORDERS.minRules, ORDERS.maxRules);
  for (let i = 0; i < count; i++) {
    const draw = weighted(pool);
    if (!draw) return null;
    if (draw.kind === 'apart') {
      const a = pick(WHOLE_TOPPINGS);
      const b = pick(WHOLE_TOPPINGS.filter((t) => t !== a));
      const same = (rule: Rule) => rule.kind === 'apart' && ((rule.a === a && rule.b === b) || (rule.a === b && rule.b === a));
      if (rules.some(same)) return null;
      rules.push({ kind: 'apart', a, b });
      continue;
    }
    const free = (draw.kind === 'share' ? SHARE_TOPPINGS : WHOLE_TOPPINGS).filter((t) => !placed.has(t));
    if (!free.length) return null;
    const topping = pick(free);
    placed.add(topping);
    if (draw.kind === 'count') {
      rules.push({ kind: 'count', topping, n: between(1, Math.min(ORDERS.maxCount, MAX_COUNT_DIGIT)) });
      continue;
    }
    const { parts } = draw;
    wedges.set(topping, { start: (between(0, WEDGE_STEPS - 1) / WEDGE_STEPS) * TAU, width: TAU / parts });
    rules.push({ kind: 'share', topping, parts });
  }
  return canMeet(rules, wedges) ? { rules, wedges } : null;
}

/** Whether each apart pair can stay apart: two shared toppings need wedges that don't overlap, a topping without a
 * share needs a free gap outside its partners' wedges. */
function canMeet(rules: Rule[], wedges: Map<Topping, Wedge>): boolean {
  // Sampled between whole steps, so wedges that only meet at an edge never share a sample
  const angles = Array.from({ length: ANGLE_SAMPLES }, (_, i) => ((i + 0.5) / ANGLE_SAMPLES) * TAU);
  const inside = (topping: Topping, angle: number) => {
    const wedge = wedges.get(topping);
    return !!wedge && (angle - wedge.start + TAU) % TAU < wedge.width;
  };
  const gapSamples = (ORDERS.gapDegrees * DEG_TO_RAD * ANGLE_SAMPLES) / TAU;
  const partners = new Map<Topping, Topping[]>();
  for (const rule of rules) {
    if (rule.kind !== 'apart') continue;
    if (wedges.has(rule.a) && wedges.has(rule.b) && angles.some((angle) => inside(rule.a, angle) && inside(rule.b, angle))) return false;
    partners.set(rule.a, [...(partners.get(rule.a) ?? []), rule.b]);
    partners.set(rule.b, [...(partners.get(rule.b) ?? []), rule.a]);
  }
  for (const [topping, others] of partners) {
    if (wedges.has(topping)) continue;
    const free = angles.filter((angle) => !others.some((other) => inside(other, angle))).length;
    if (free < gapSamples) return false;
  }
  return true;
}
