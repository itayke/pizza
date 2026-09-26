// All tunables live here. Positions are in design-space pixels (DESIGN_WIDTH × DESIGN_HEIGHT).
// Layout follows ref/kitchen-sketch.jpg.

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
// Caps device pixel ratio; high-DPI screens otherwise render a much larger buffer
export const MAX_RESOLUTION = 1;

export const COLORS = {
  letterbox: 0x3b2418,
  table: 0x8a5a3b,
  bin: 0xd9b48a,
  outline: 0x2a1a10,
  peel: 0xd8a765,
  bowl: 0xe9e4da,
  dough: 0xf3dcae,
  doughEdge: 0xc9a36b,
  rim: 0x5a3a24,
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

// Kneading: press on the dough to spread it toward the rim. No failure: growth just stops past the rim.
// Rates are in rim-radius units.
export const DOUGH = {
  rimRadius: 190,
  capRatio: 1.1,
  startRatio: 0.45,
  points: 96,
  // Press this far past the dough edge still counts (past the cap with reachOutside)
  grabSlack: 76,
  reachOutside: false,
  tapImpulse: 0.251,
  holdGrowthPerSecond: 1.41,
  // Angular falloff of a press, in radians
  spread: 0.73,
  // Radial falloff: presses closer to center than this fraction of the edge do nothing, ramping to full at the edge
  radialInner: 0.29,
  radialPower: 2,
  // Growth slows with dough size everywhere; 0 is off, 1 roughly conserves area
  sizePower: 1,
  // Past the rim, growth drops to this fraction immediately, then slows by overRimPower toward the cap
  overRimFactor: 0.5,
  overRimPower: 0.5,
  // Placing: the held ball drops to the center, then splats outward by slamGrowth (fraction of start radius)
  dropDuration: 0.15,
  slamGrowth: 0.2,
  slamDuration: 0.1,
  // How fast the drawn edge catches up to its target, per second
  easeRate: 15.36,
  // Fraction of the rim circle covered before sauce becomes available
  sauceCoverage: 0.85,
  rimDashes: 36,
  rimDashFill: 0.5,
  rimWidth: 4,
  rimAlpha: 0.5,
  edgeWidth: 4,
};

export const DOUGH_BOWL = {
  x: 190,
  y: 550,
  radius: 120,
};

export const DISABLED_ALPHA = 0.3;

export const BAKE_METER = {
  x: 1325,
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
