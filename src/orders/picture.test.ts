import { describe, expect, it } from 'vitest';
import { BAKE, CHEESE, CUTTER, DOUGH, GRADE, PICTURE_JUDGE, PLACEMENT, RECIPE, TOPPINGS, WHOLE_TOPPINGS } from '../config';
import { ART } from '../generated/artLayout';
import type { PlacedPiece, Topping } from '../stations/ToppingLayer';
import { gradeOf } from './grade';
import { comparePicture, profileOf, type CutPizza } from './picture';
import { drawRecipe, gridStep, recipeSpots, uprightEdges, type Recipe, type Spot } from './Recipe';
import { edgesOf, lineAngle, slicesOf } from './slicing';

const DRAWS = 500;
const MIN_SLICES = 4;
const MAX_SLICES = 16;
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// Slack for angles landing on the grid, in grid steps
const ON_GRID = 1e-6;
// A fresh laying of a picture's toppings, or an extra cut through it, still reads almost the same
const NEAR_FULL = 0.9;

/** A piece of a topping at its art size, at a polar spot on dough rolled to the rim. */
function piece(topping: Topping, angle: number, fraction: number): PlacedPiece {
  const { width, height } = ART[`topping_${topping}_raw`];
  const r = fraction * DOUGH.rimRadius;
  return { topping, polarAngle: angle, fraction, x: Math.cos(angle) * r, y: Math.sin(angle) * r, halfSize: (Math.max(width, height) / 2) * TOPPINGS.scale };
}

/** Cheese all over, as evenly as the skip key lays it. */
function cheese(): PlacedPiece[] {
  const rim = PLACEMENT.innerRim * DOUGH.rimRadius;
  const count = Math.round((Math.PI * rim * rim) / (CHEESE.spacing * Math.max(2 * CHEESE.scatterRadius, CHEESE.spacing)));
  return Array.from({ length: count }, (_, i) => piece('cheese', i * GOLDEN_ANGLE, PLACEMENT.innerRim * Math.sqrt((i + 0.5) / count)));
}

type Laying = { spots?: Spot[]; turn?: number; cuts?: number[]; without?: Topping; bakeLevel?: number };

/** A recipe's pizza on dough rolled to the rim: its spots (or fresh ones), turned, cut along cuts, maybe missing a topping. */
function lay(recipe: Recipe, { spots = recipeSpots(recipe), turn = 0, cuts = recipe.cuts, without, bakeLevel = recipe.bakeLevel }: Laying = {}): CutPizza {
  const pieces = [...spots.filter((s) => s.topping !== without).map((s) => piece(s.topping, s.angle + turn, s.fraction)), ...(recipe.cheese ? cheese() : [])];
  return {
    pieces,
    bakeLevel,
    radiusAt: () => DOUGH.rimRadius,
    edges: edgesOf(cuts.map((a) => a + turn)),
    sauceIn: () => (recipe.sauce ? 1 : 0),
  };
}

/** A recipe with toppings, drawn until one comes up that fits a test. */
function recipeWhere(fits: (recipe: Recipe) => boolean): Recipe {
  for (;;) {
    const recipe = drawRecipe();
    if (recipe.toppings.length && fits(recipe)) return recipe;
  }
}

const onGrid = (angle: number) => Math.abs(angle / gridStep() - Math.round(angle / gridStep())) < ON_GRID;

describe('picture recipes', () => {
  const recipes = Array.from({ length: DRAWS }, drawRecipe);

  it('keep to their limits', () => {
    for (const recipe of recipes) {
      // Even cuts on the cutter's grid, the first upright
      expect(recipe.cuts[0]).toBeCloseTo(Math.PI / 2);
      expect(2 * recipe.cuts.length).toBeGreaterThanOrEqual(MIN_SLICES);
      expect(2 * recipe.cuts.length).toBeLessThanOrEqual(MAX_SLICES);
      const sorted = [...recipe.cuts].sort((a, b) => a - b);
      for (const cut of sorted) expect(onGrid(cut)).toBe(true);
      sorted.forEach((cut, i) => i && expect(cut - sorted[i - 1]).toBeCloseTo(Math.PI / sorted.length));
      const slices = slicesOf(edgesOf(recipe.cuts)).length;
      expect(new Set(recipe.toppings.map((t) => t.topping)).size).toBe(recipe.toppings.length);
      expect(recipe.toppings.length).toBeLessThanOrEqual(Math.min(RECIPE.maxToppings, WHOLE_TOPPINGS.length));
      for (const { slices: own } of recipe.toppings) {
        expect(own.length).toBeGreaterThan(0);
        expect(new Set(own).size).toBe(own.length);
        for (const i of own) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(slices);
      }
      expect(recipe.bakeLevel).toBeGreaterThanOrEqual(BAKE.minBaked);
      expect(recipe.bakeLevel).toBeLessThanOrEqual(1);
    }
  });

  it('put the first part-covering topping against the upright cut, and later ones against its sides', () => {
    for (const recipe of recipes) {
      const count = 2 * recipe.cuts.length;
      // A run's two sides, each the index of the slice it starts
      const sides = (run: number[]) => [run[0], (run[run.length - 1] + 1) % count];
      const parts = recipe.toppings.map((t) => t.slices).filter((run) => run.length < count);
      if (!parts.length) continue;
      const upright = uprightEdges(recipe.cuts);
      expect(upright).toHaveLength(2);
      expect(sides(parts[0]).some((side) => upright.includes(side))).toBe(true);
      for (const run of parts.slice(1)) expect(sides(run).some((side) => sides(parts[0]).includes(side))).toBe(true);
    }
  });

  it('lay each topping only on its slices', () => {
    for (const recipe of recipes) {
      const slices = slicesOf(edgesOf(recipe.cuts));
      for (const spot of recipeSpots(recipe)) {
        const own = recipe.toppings.find((t) => t.topping === spot.topping)!.slices;
        const angle = ((spot.angle % TAU) + TAU) % TAU;
        const index = slices.findIndex((s) => ((angle - s.start) % TAU + TAU) % TAU < s.width);
        expect(own).toContain(index);
        expect(spot.fraction).toBeLessThanOrEqual(PLACEMENT.innerRim);
      }
    }
  });
});

describe('copying a picture', () => {
  it('scores full for the very pizza, however it is turned', () => {
    for (let i = 0; i < DRAWS / 10; i++) {
      const recipe = drawRecipe();
      const spots = recipeSpots(recipe);
      const picture = profileOf(lay(recipe, { spots }));
      const turn = Math.floor(Math.random() * Math.round(TAU / gridStep())) * gridStep();
      expect(comparePicture(picture, profileOf(lay(recipe, { spots, turn }))).total).toBeCloseTo(1);
    }
  });

  it('scores nearly full for the same toppings laid afresh', () => {
    for (let i = 0; i < DRAWS / 10; i++) {
      const recipe = drawRecipe();
      expect(comparePicture(profileOf(lay(recipe)), profileOf(lay(recipe))).cover).toBeGreaterThan(NEAR_FULL);
    }
  });

  it('costs little for an extra cut', () => {
    const recipe = recipeWhere(() => true);
    const spots = recipeSpots(recipe);
    const extra = lineAngle(recipe.cuts[0] + gridStep());
    const verdict = comparePicture(profileOf(lay(recipe, { spots })), profileOf(lay(recipe, { spots, cuts: [...recipe.cuts, extra] })));
    expect(verdict.slices).toBeCloseTo(1 - 2 * PICTURE_JUDGE.extraPenalty);
    expect(verdict.cover).toBeGreaterThan(NEAR_FULL);
  });

  it('costs more for a missing cut', () => {
    const recipe = recipeWhere((r) => r.cuts.length > 1);
    const spots = recipeSpots(recipe);
    const verdict = comparePicture(profileOf(lay(recipe, { spots })), profileOf(lay(recipe, { spots, cuts: recipe.cuts.slice(1) })));
    expect(verdict.slices).toBeCloseTo(1 - 2 * PICTURE_JUDGE.missingPenalty);
  });

  it('costs a missing topping its share of cover', () => {
    const recipe = recipeWhere(() => true);
    const spots = recipeSpots(recipe);
    const verdict = comparePicture(profileOf(lay(recipe, { spots })), profileOf(lay(recipe, { spots, without: recipe.toppings[0].topping })));
    // Sauce and cheese if any, and each topping, count alike
    const channels = Number(recipe.sauce) + Number(recipe.cheese) + recipe.toppings.length;
    expect(verdict.cover).toBeCloseTo(1 - 1 / channels);
  });

  it('loses the bake score past its tolerance', () => {
    const recipe = drawRecipe();
    const spots = recipeSpots(recipe);
    const verdict = comparePicture(profileOf(lay(recipe, { spots })), profileOf(lay(recipe, { spots, bakeLevel: recipe.bakeLevel + PICTURE_JUDGE.bakeTolerance })));
    expect(verdict.bake).toBeCloseTo(0);
  });

  it('reads cuts on the grid as whole bins', () => {
    expect(onGrid(CUTTER.gridDegrees * (Math.PI / 180))).toBe(true);
  });
});

describe('grades', () => {
  it('run from A+ down to F', () => {
    expect(gradeOf(1)).toBe('A+');
    expect(gradeOf(GRADE.a)).toBe('A');
    expect(gradeOf(GRADE.d)).toBe('D');
    expect(gradeOf(0)).toBe('F');
  });
});
