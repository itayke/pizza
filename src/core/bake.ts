import { BAKE } from '../config';

export const BAKE_PHASES = ['raw', 'baked', 'burnt'] as const;
export type BakePhase = (typeof BAKE_PHASES)[number];

/** How baked the art looks at a bake level: rushes out of raw, lingers around the optimal level, then rushes into
 * burnt. Ease-out up to the optimal level and ease-in past it, so both meet there. */
export function bakeCurve(level: number): number {
  const optimal = BAKE.optimalLevel;
  const power = BAKE.easePower;
  const t = Math.min(1, Math.max(0, level));
  if (t < optimal) return optimal * (1 - (1 - t / optimal) ** power);
  return optimal < 1 ? optimal + (1 - optimal) * ((t - optimal) / (1 - optimal)) ** power : 1;
}

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
