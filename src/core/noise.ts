// Sines at rates that never line up, each half the weight of the last, so their sum wanders without repeating
const RATES = [1, 2.137, 4.391];
// Golden angle, so each seed's phases land far from every other's
const PHASE_STEP = 2.39996;

/** A smooth wandering value in [-1, 1] at time t; each seed wanders its own way. */
export function wander(t: number, seed: number): number {
  let sum = 0;
  let total = 0;
  let weight = 1;
  RATES.forEach((rate, i) => {
    sum += weight * Math.sin(t * rate + seed * (i + 1) * PHASE_STEP);
    total += weight;
    weight /= 2;
  });
  return sum / total;
}
