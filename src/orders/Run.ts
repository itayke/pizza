import { GRADE, RECIPE_RAMP, RUN, type RampedOption } from '../config';
import type { Level } from './Recipe';

/** A run from the simplest order up: orders passed so far, and which ramped options it has introduced. */
export class Run {
  passed = 0;
  private readonly introduced = new Set<RampedOption>();

  /** Count a served order's total score (0 to 1) toward the run if it passes. */
  record(total: number): void {
    if (total >= GRADE[RUN.passGrade]) this.passed++;
  }

  /** The level for the next order, introducing the options that start here and haven't been yet. */
  next(): Level {
    const options = Object.keys(RECIPE_RAMP) as RampedOption[];
    const introducing = new Set(options.filter((o) => RECIPE_RAMP[o]?.from === this.passed && !this.introduced.has(o)));
    for (const option of introducing) this.introduced.add(option);
    return { passed: this.passed, introducing };
  }
}
