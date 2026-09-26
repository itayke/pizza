// All tunables live here. Positions are in design-space pixels (DESIGN_WIDTH × DESIGN_HEIGHT).
// Layout follows ref/kitchen-sketch.jpg.

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export const COLORS = {
  letterbox: 0x3b2418,
  table: 0x8a5a3b,
  bin: 0xd9b48a,
  outline: 0x2a1a10,
  peel: 0xd8a765,
  meterBg: 0x2b2b2b,
  meterTarget: 0x6fcf5a,
  dragon: 0x2fb391,
  serve: 0xf2a33a,
  label: 0x2a1a10,
} as const;

export const OUTLINE_WIDTH = 6;

export const INGREDIENT_IDS = ['sauce', 'cheese', 'pepper', 'greens', 'pineapple', 'olives'] as const;
export type IngredientId = (typeof INGREDIENT_IDS)[number];

// Everything unlocked until the meta game exists
export const STARTING_UNLOCKED: readonly IngredientId[] = INGREDIENT_IDS;

// Containers along the top. Each lists everything it will ever hold; only unlocked items show,
// laid out in a grid of fixed columns that gains rows as items unlock.
export const BINS = {
  containers: [
    ['sauce', 'cheese'],
    ['pepper', 'greens'],
    ['pineapple', 'olives'],
  ] as readonly (readonly IngredientId[])[],
  columns: 2,
  top: 40,
  width: 460,
  height: 180,
  cornerRadius: 24,
};

// Rectangular pizza peel with a handle hanging below its center
export const PEEL = {
  x: 380,
  y: 330,
  width: 920,
  height: 440,
  cornerRadius: 16,
  handleWidth: 320,
  handleLength: 230,
  holeRadius: 44,
};

export const BAKE_METER = {
  x: 140,
  y: 330,
  width: 50,
  height: 440,
  // Target zone as fractions of the meter, raw to charred
  targetMin: 0.55,
  targetMax: 0.8,
};

export const DRAGON = {
  x: 1400,
  y: 300,
  width: 460,
  height: 760,
};

export const SERVE_BUTTON = {
  x: 60,
  y: 860,
  width: 240,
  height: 120,
  cornerRadius: 30,
};

export const LABEL_FONT_SIZE = 36;
