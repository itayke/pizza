export const easeInQuad = (t: number): number => t * t;
export const easeInCubic = (t: number): number => t ** 3;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeOutCirc = (t: number): number => Math.sqrt(1 - (t - 1) ** 2);
