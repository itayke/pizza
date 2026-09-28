import { BAKE } from '../config';

export const BAKE_PHASES = ['raw', 'baked', 'burnt'] as const;
export type BakePhase = (typeof BAKE_PHASES)[number];

/** Where a bake level sits between two adjacent phases: raw to baked up to the optimal level, then baked to burnt. */
export function bakeStep(level: number): { from: number; t: number } {
  const optimal = BAKE.optimalLevel;
  if (level < optimal) return { from: 0, t: Math.max(0, level / optimal) };
  return { from: 1, t: optimal < 1 ? Math.min(1, (level - optimal) / (1 - optimal)) : 1 };
}

/** How much each phase shows at a bake level; sums to 1, for a per-pixel mix. */
export function bakeWeights(level: number, out: Float32Array): Float32Array {
  const { from, t } = bakeStep(level);
  out.fill(0);
  out[from] = 1 - t;
  out[from + 1] = t;
  return out;
}
