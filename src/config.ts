// All tunables live here. Positions are in design-space pixels (DESIGN_WIDTH × DESIGN_HEIGHT).
// Art placement comes from src/generated/artLayout.ts (tools/art/extract.py).

// Matches the art layout; wider or taller screens see more background paper
export const DESIGN_WIDTH = 2048;
export const DESIGN_HEIGHT = 1536;
// Caps device pixel ratio; high-DPI screens otherwise render a much larger buffer
export const MAX_RESOLUTION = 1;
export const ASSET_DIR = 'assets/';

export const COLORS = {
  paper: 0xf3e6da,
  ink: 0x2b2320,
  rim: 0x5a3a24,
  serve: 0xf2a33a,
  label: 0x2a1a10,
} as const;

export const OUTLINE_WIDTH = 6;

export const INGREDIENT_IDS = ['sauce', 'cheese', 'pepperoni', 'sausage', 'pineapple', 'olives'] as const;
export type IngredientId = (typeof INGREDIENT_IDS)[number];

// Everything unlocked until the meta game exists
export const STARTING_UNLOCKED: readonly IngredientId[] = INGREDIENT_IDS;

// Containers along the top, by art name. Locked compartments show empty.
export const BINS = [
  { art: 'bin1', label: 'label_bin1', items: ['sauce', 'cheese'] },
  { art: 'bin2', label: 'label_bin2', items: ['pepperoni', 'sausage'] },
  { art: 'bin3', label: 'label_bin3', items: ['pineapple', 'olives'] },
] as const;

// Per-bin nudge from its drawn spot, in design px, and whether it shows. Keys are `${art}X`, `${art}Y`, `${art}Enabled`.
export const BIN_LAYOUT = {
  bin1X: 0,
  bin1Y: -27,
  bin1Enabled: true,
  bin2X: -27,
  bin2Y: -33,
  bin2Enabled: true,
  bin3X: -28,
  bin3Y: -47,
  bin3Enabled: true,
};

// Center of the peel's face, as fractions of the peel art
export const PEEL = {
  faceX: 0.5,
  faceY: 0.36,
};

// Kneading: press on the dough to spread it toward the rim. No failure: growth just stops past the rim.
// Rates are in rim-radius units.
export const DOUGH = {
  rimRadius: 270,
  capRatio: 1.1,
  startRatio: 0.45,
  points: 96,
  // Press this far past the dough edge still counts (past the cap with reachOutside)
  grabSlack: 108,
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
  // Fraction of the rim circle covered before sauce and baking become available
  sauceCoverage: 0.85,
  // Drawing mesh: rings per spoke; stretchBias above 0 keeps the center firmer than the edge
  meshRings: 12,
  stretchBias: 1,
  // Ball drawing fades to the rolled base between these fractions of the way from start size to the rim
  rolledFadeStart: 0.2,
  rolledFadeEnd: 0.9,
  rimDashes: 36,
  rimDashFill: 0.5,
  rimWidth: 6,
  rimAlpha: 0.5,
};

export const DISABLED_ALPHA = 0.3;

// Painting: stamps land in the dough's own polar space, so sauce stretches with it and never leaves the dough.
// Sizes are in design pixels.
export const SAUCE = {
  brushRadius: 81,
  // Stamp spacing along a stroke, as a fraction of brushRadius
  stampSpacing: 1,
  // Mask resolution (square), and how many times the sauce pattern repeats across the dough
  textureSize: 512,
  patternRepeat: 3,
  // How much the dough drawing's shading shows through the sauce, 0 to 1
  grain: 0.6,
  // Sauce edge sits where the soft stamps reach this mask level, blurred over ± edgeWidth (small is crisp)
  edge: 0.5,
  edgeWidth: 0.08,
  // Inner shadow along every sauce edge: width in design pixels, darkening at the very edge (0 to 1)
  bevelWidth: 7,
  bevelShade: 0.314,
  // Coverage grid cells per side; a stamp counts cells within this fraction of its radius
  coverageGrid: 32,
  coverageCore: 0.7,
};

// Ingredients in hand follow the pointer, drawn at this fraction of their sheet size so they keep their relative sizes
export const HELD = {
  scale: 0.56,
};

// Doneness rises linearly while the dragon breathes fire on rolled dough, raw at 0 to burnt at 1
export const BAKE = {
  secondsToBurnt: 8,
};

// Dial between the peel and the dragon's feet: hub position and drawn width; hub and needle pivot are fractions of their art
export const BAKE_GAUGE = {
  x: 1420,
  y: 1450,
  width: 370,
  hubX: 0.505,
  hubY: 0.93,
  pivotX: 0.47,
  pivotY: 0.855,
  // Needle angle from upright at raw and burnt, radians
  sweep: 1.45,
};

// Dragon: its pivot (fractions of the art) sits at (x, y), which may be past the design edge; scaled from its
// drawn size and rotated about the pivot in degrees
export const DRAGON = {
  x: 1950,
  y: 1200,
  pivotX: 0.749,
  pivotY: 0.716,
  scale: 1.175,
  angle: -12,
};

// Fire streams from the mouth (fractions of the dragon art) toward the dough while the dragon is held
export const FIRE = {
  mouthX: 0.2,
  mouthY: 0.194,
  // Flame length as a fraction of the mouth-to-dough distance
  reach: 1.145,
  flickerAmount: 0.06,
  flickerSpeed: 30,
};

export const SERVE_BUTTON = {
  x: 170,
  y: 1300,
  width: 300,
  height: 140,
  cornerRadius: 36,
};

export const LABEL_FONT_SIZE = 50;
