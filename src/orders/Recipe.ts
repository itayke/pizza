import { BAKE, CUTTER, DOUGH, ORDER_JUDGE, PLACEMENT, RECIPE, TOPPINGS, WHOLE_TOPPINGS } from '../config';
import { between, pick, shuffled, weighted } from '../core/random';
import { ART } from '../generated/artLayout';
import type { Topping } from '../stations/ToppingLayer';
import { edgesOf, lineAngle, slicesOf, type Wedge } from './slicing';

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
// Cuts step by this, degrees, when the cutter has no grid
const FALLBACK_GRID = 15;
// Slack when checking an angle lands on the grid, in grid steps
const ON_GRID = 1e-6;
// Spots tried per piece; the best one wins
const CANDIDATES = 24;

export type WholeTopping = (typeof WHOLE_TOPPINGS)[number];

/**
 * A pizza to copy: its cut lines (angles as lines), whether sauce and cheese cover it, each whole topping on some of its
 * slices (indices into slicesOf its cuts' edges), and its bake level.
 */
export type Recipe = {
  cuts: number[];
  sauce: boolean;
  cheese: boolean;
  toppings: { topping: WholeTopping; slices: number[] }[];
  bakeLevel: number;
};

/** A piece to lay: its topping at a polar spot, its distance a fraction of the rim radius. */
export type Spot = { topping: Topping; angle: number; fraction: number };

/** The cutter's grid step, radians; cuts made with it, pictured or not, land on it. */
export const gridStep = (): number => (CUTTER.gridDegrees > 0 ? CUTTER.gridDegrees : FALLBACK_GRID) * DEG_TO_RAD;

const onGrid = (angle: number, step: number) => Math.abs(angle / step - Math.round(angle / step)) < ON_GRID;

/** A new pizza to copy. */
export function drawRecipe(): Recipe {
  const step = gridStep();
  const counts = Array.from({ length: RECIPE.maxCuts - RECIPE.minCuts + 1 }, (_, i) => RECIPE.minCuts + i).filter((n) => n > 0 && onGrid(Math.PI / n, step));
  const lines = counts.length ? pick(counts) : Math.max(1, RECIPE.minCuts);
  const apart = Math.PI / lines;
  const turn = Math.floor(Math.random() * Math.max(1, Math.round(apart / step))) * step;
  const cuts = Array.from({ length: lines }, (_, i) => lineAngle(turn + i * apart));
  const slices = slicesOf(edgesOf(cuts)).length;
  const count = Math.min(between(RECIPE.minToppings, RECIPE.maxToppings), WHOLE_TOPPINGS.length);
  const toppings = shuffled(WHOLE_TOPPINGS)
    .slice(0, count)
    .map((topping) => ({ topping, slices: sliceRun(slices) }));
  return { cuts, sauce: Math.random() < RECIPE.sauceChance, cheese: Math.random() < RECIPE.cheeseChance, toppings, bakeLevel: drawBakeLevel() };
}

/** Every slice, or a run of neighbors short of all of them. */
function sliceRun(slices: number): number[] {
  const length = slices > 1 && Math.random() >= RECIPE.everywhereChance ? between(1, slices - 1) : slices;
  const start = Math.floor(Math.random() * slices);
  return Array.from({ length }, (_, i) => (start + i) % slices);
}

function drawBakeLevel(): number {
  const { minBaked, burntFrom, optimalLevel } = BAKE;
  const baked = (at: number) => minBaked + (burntFrom - minBaked) * at;
  const level = weighted([
    { value: baked(RECIPE.lightAt), weight: RECIPE.lightWeight },
    { value: optimalLevel, weight: RECIPE.rightWeight },
    { value: baked(RECIPE.wellAt), weight: RECIPE.wellWeight },
    { value: burntFrom + (1 - burntFrom) * RECIPE.burntAt, weight: RECIPE.burntWeight },
  ]);
  return level ?? optimalLevel;
}

/** A topping piece's half size at rest, design px, before jitter. */
const halfSize = (topping: Topping) => {
  const { width, height } = ART[`topping_${topping}_raw`];
  return (Math.max(width, height) / 2) * TOPPINGS.scale;
};

/** Where a recipe's whole toppings go on dough rolled to the rim, each slice's pieces spread apart. */
export function recipeSpots(recipe: Recipe): Spot[] {
  const rim = PLACEMENT.innerRim * DOUGH.rimRadius;
  const spots: Spot[] = [];
  slicesOf(edgesOf(recipe.cuts)).forEach((slice, i) => {
    const laid: { x: number; y: number }[] = [];
    for (const { topping, slices } of recipe.toppings) {
      if (!slices.includes(i)) continue;
      const half = halfSize(topping);
      const disc = Math.PI * (half * ORDER_JUDGE.coverRadius) ** 2;
      const count = Math.max(1, Math.round((RECIPE.density * slice.width * rim * rim) / 2 / disc));
      for (let k = 0; k < count; k++) {
        const p = spreadSpot(slice, rim, half * RECIPE.edgeGap, laid);
        laid.push(p);
        spots.push({ topping, angle: Math.atan2(p.y, p.x), fraction: Math.hypot(p.x, p.y) / DOUGH.rimRadius });
      }
    }
  });
  return spots;
}

/**
 * A spot in a slice out to rim (design px), farthest from those laid of the tries that keep gap clear of its cuts; if
 * none does, the one that comes closest.
 */
function spreadSpot(slice: Wedge, rim: number, gap: number, laid: readonly { x: number; y: number }[]): { x: number; y: number } {
  const uncut = slice.width >= TAU;
  let best = { x: 0, y: 0, clear: false, score: -Infinity };
  for (let i = 0; i < CANDIDATES; i++) {
    const into = Math.random() * slice.width;
    const angle = slice.start + into;
    const r = rim * Math.sqrt(Math.random());
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    // From the nearer cut: across to it, or to the center past a right angle
    const off = Math.min(into, slice.width - into);
    const clearance = uncut ? Infinity : off < Math.PI / 2 ? r * Math.sin(off) : r;
    const clear = clearance >= gap;
    const score = clear ? Math.min(Infinity, ...laid.map((q) => Math.hypot(q.x - x, q.y - y))) : clearance;
    if ((clear && !best.clear) || (clear === best.clear && score > best.score)) best = { x, y, clear, score };
  }
  return best;
}
