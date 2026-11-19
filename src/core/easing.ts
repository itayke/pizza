export const easeInQuad = (t: number): number => t * t;
export const easeInCubic = (t: number): number => t ** 3;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeOutCirc = (t: number): number => Math.sqrt(1 - (t - 1) ** 2);
/** Past 1 by an amount set by overshoot, then settles back; 0 overshoot is ease-out-cubic. */
export const easeOutBack = (t: number, overshoot: number): number => 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
