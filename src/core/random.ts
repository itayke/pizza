/** One of items, each as likely as the others. */
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** A whole number from min to max, both included. */
export const between = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));

/** One of items, each as likely as its weight; null if none has any. */
export function weighted<T>(items: readonly { value: T; weight: number }[]): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  return (items.find((item) => (r -= Math.max(0, item.weight)) < 0) ?? items[items.length - 1]).value;
}

/** A copy of items in random order (Fisher–Yates). */
export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
