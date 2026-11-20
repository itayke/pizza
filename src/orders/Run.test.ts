import { describe, expect, it } from 'vitest';
import { BAKE, GRADE, RECIPE, RECIPE_RAMP, RUN, type RampedOption } from '../config';
import { drawRecipe, reach, type Level, type Recipe } from './Recipe';
import { Run } from './Run';
import { edgesOf, slicesOf } from './slicing';

const DRAWS = 300;
const SIMPLEST_SLICES = 4;
const RAMPED = Object.keys(RECIPE_RAMP) as RampedOption[];
const rampOf = (option: RampedOption) => RECIPE_RAMP[option]!;

const at = (passed: number, introducing: RampedOption[] = []): Level => ({ passed, introducing: new Set(introducing) });
const draws = (level: Level): Recipe[] => Array.from({ length: DRAWS }, () => drawRecipe(level));
const sliceCount = (recipe: Recipe) => slicesOf(edgesOf(recipe.cuts)).length;
const burnt = (recipe: Recipe) => recipe.bakeLevel >= BAKE.burntFrom;

/** Simplest in every way but the bake. */
function plainApartFromBake(recipe: Recipe): void {
  expect(sliceCount(recipe)).toBe(SIMPLEST_SLICES);
  expect(recipe.sauce && recipe.cheese).toBe(true);
  expect(recipe.toppings.length).toBe(RECIPE.minToppings);
  for (const { slices } of recipe.toppings) expect(slices.length).toBe(SIMPLEST_SLICES);
}

describe('a run', () => {
  it('starts on the simplest pizza', () => {
    for (const recipe of draws(new Run().next())) {
      plainApartFromBake(recipe);
      expect(recipe.bakeLevel).toBe(BAKE.optimalLevel);
    }
  });

  it('keeps each option out until its ramp starts, then grows it to full', () => {
    for (const option of RAMPED) {
      const { from, full } = rampOf(option);
      expect(reach(option, at(from - 1))).toBe(0);
      expect(reach(option, at(from))).toBeGreaterThan(0);
      expect(reach(option, at(full))).toBe(1);
    }
  });

  it('never asks for burnt before its ramp starts', () => {
    for (let passed = 0; passed < rampOf('burntWeight').from; passed++) for (const recipe of draws(at(passed))) expect(burnt(recipe)).toBe(false);
  });

  it('introduces an option alone, everything else simplest', () => {
    for (const recipe of draws(at(rampOf('burntWeight').from, ['burntWeight']))) {
      plainApartFromBake(recipe);
      expect(burnt(recipe)).toBe(true);
    }
  });

  it('counts only passing grades and introduces each option once', () => {
    const run = new Run();
    run.record(GRADE[RUN.passGrade] / 2);
    expect(run.passed).toBe(0);
    const { from } = rampOf('burntWeight');
    run.passed = from - 1;
    run.record(GRADE[RUN.passGrade]);
    expect(run.passed).toBe(from);
    expect(run.next().introducing.has('burntWeight')).toBe(true);
    expect(run.next().introducing.has('burntWeight')).toBe(false);
  });
});
