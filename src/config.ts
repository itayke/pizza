// All tunables live here. Positions are in design-space pixels (DESIGN_WIDTH × DESIGN_HEIGHT).
// Art placement comes from src/generated/artLayout.ts (tools/art/extract.py).

// Matches the art layout, the standard layout's stage. The whole stage always shows, centered, with paper filling the
// margins
export const DESIGN_WIDTH = 2048;
export const DESIGN_HEIGHT = 1536;
// Caps device pixel ratio; high-DPI screens otherwise render a much larger buffer
export const MAX_RESOLUTION = 1;
export const ASSET_DIR = 'assets/';

// The hand font words are set in, under ASSET_DIR; weights is the range the file covers
export const FONT = {
  family: 'Playpen Sans',
  file: 'fonts/PlaypenSans.woff2',
  weights: '100 800',
} as const;

export const COLORS = {
  paper: 0xf3e6da,
  rim: 0x5a3a24,
} as const;

export const INGREDIENT_IDS = ['sauce', 'cheese', 'pepperoni', 'basil', 'pineapple', 'olives'] as const;
export type IngredientId = (typeof INGREDIENT_IDS)[number];

// Everything unlocked until the meta game exists
export const STARTING_UNLOCKED: readonly IngredientId[] = INGREDIENT_IDS;

// Containers along the top, by art name, each compartment labeled with its word at label_<item>'s drawn spot. Locked
// compartments show empty.
export const BINS = [
  { art: 'bin1', items: ['sauce', 'cheese'] },
  { art: 'bin2', items: ['pepperoni', 'basil'] },
  { art: 'bin3', items: ['pineapple', 'olives'] },
] as const;

// What is in hand (an ingredient, or the dough) is marked by its label: the ink turns color and the word grows by
// scale, over seconds
export const SELECTED_LABEL = {
  color: '#850670',
  scale: 1.2,
  seconds: 0.15,
};

// Labels are words in the hand font, in ink, squeezed sideways by condense, all with capitals cap design px tall, or
// smaller together so each word fits its <place>Width (none if 0). Each sits on a smile-shaped arc of <place>Radius
// (flat if 0) centered under what it names: it bends with the arc and tilts by where it sits on it, plus a steady
// per-word wobble up to tiltJitter degrees. The texture is drawn at resolution times design size, bent along segments
// about segment design px wide. artAlpha shows the drawn label over the word, to compare while tuning
export const LABEL_TEXT = {
  weight: 450,
  ink: '#1d1713',
  uppercase: true,
  condense: 0.8,
  cap: 49,
  tiltJitter: 3,
  binWidth: 250,
  binRadius: 900,
  bowlWidth: 300,
  bowlRadius: 440,
  trayWidth: 280,
  trayRadius: 730,
  gaugeWidth: 360,
  gaugeRadius: 0,
  resolution: 2,
  segment: 8,
  artAlpha: 0,
};

// Screens at least fromAspect wide (width over height) lay the stations out side by side on a stage width design px
// wide: the bins in a column, then the bowl and order tray over the serve button, then the peel spanning the height,
// then the dragon. Each station keeps its standard-layout look and moves its anchor to <station>X, <station>Y, scaled
// by <station>Scale. Anchors: a bin's center, the bowl's and tray's centers, the dough on the peel, the dragon's pivot,
// the gauge hub and each button's center (the cutter's too)
export const WIDESCREEN = {
  fromAspect: 1.777,
  width: 2730,
  bin1X: 250,
  bin1Y: 254,
  bin1Scale: 1,
  bin2X: 250,
  bin2Y: 728,
  bin2Scale: 1,
  bin3X: 250,
  bin3Y: 1202,
  bin3Scale: 1,
  bowlX: 734,
  bowlY: 394,
  bowlScale: 1.05,
  orderTrayX: 736,
  orderTrayY: 1047,
  orderTrayScale: 1.2,
  serveButtonX: 1140,
  serveButtonY: 1363,
  serveButtonScale: 1.2,
  peelX: 1530,
  peelY: 618,
  peelScale: 1.42,
  gaugeX: 1962,
  gaugeY: 1438,
  gaugeScale: 1.347,
  bakeButtonX: 2275,
  bakeButtonY: 1118,
  bakeButtonScale: 1.297,
  cutterX: 2200,
  cutterY: 880,
  cutterScale: 1.3,
  dragonX: 2830,
  dragonY: 1083,
  dragonScale: 1.411,
};

// Per-bin nudge from its drawn spot, in design px, and whether it shows. Keys are `${art}X`, `${art}Y`, `${art}Enabled`.
export const BIN_LAYOUT = {
  bin1X: -105,
  bin1Y: -54,
  bin1Enabled: true,
  bin2X: -27,
  bin2Y: -60,
  bin2Enabled: true,
  bin3X: 68,
  bin3Y: -62,
  bin3Enabled: true,
};

// Per-label sideways nudge from its drawn spot, in design px, by ingredient
export const LABEL_NUDGE = {
  sauce: -5,
  cheese: 5,
  pepperoni: -15,
  basil: 0,
  pineapple: -20,
  olives: 0,
};

// Dough bowl and its label: nudge from their drawn spot, in design px, with labelX/labelY moving the label further on
// its own. The bowl scales about its center, its label keeping its size. The dough ball sits in the empty bowl at
// fillWidth (a fraction of the bowl's width) until picked up, and returns with the next pizza
export const BOWL = {
  x: -18,
  y: -196,
  scale: 0.906,
  labelX: 0,
  labelY: -40,
  fillWidth: 0.72,
};

// Order tray, with its caption below: its center in design px. It scales about its center, its caption keeping its
// spot and size, with labelX/labelY moving the caption from its drawn spot. Holds nothing yet
export const ORDER_TRAY = {
  x: 318,
  y: 1226,
  scale: 1.119,
  labelX: 0,
  labelY: 23,
};

// Order ticket in the tray, a row of icons per rule: within width × height of the tray (fractions of its art),
// centered offsetY below its center (same units). Rows are up to rowHeight tray px tall, rowGap apart, each centered,
// its icons itemGap apart by what's drawn of them. Icons are sized by what's drawn, as fractions of a row's height: a
// share's pie whole, toppings at toppingSize (pieTopping inside a pie, whose radius is pieRadius of its art), counts'
// digits at digitSize, the × at timesSize, the apart mark at apartSize and the bake flame at flameSize
export const ORDER_TICKET = {
  width: 0.76,
  height: 0.8,
  offsetY: 0,
  rowHeight: 70,
  rowGap: 10,
  itemGap: 20,
  toppingSize: 0.8,
  pieTopping: 0.45,
  pieRadius: 0.44,
  digitSize: 0.75,
  timesSize: 0.45,
  apartSize: 0.9,
  flameSize: 0.85,
};

// Each topping's icon on the ticket, as a multiple of its size there, so they read alike
export const ORDER_ICON_SCALE = {
  cheese: 1,
  pepperoni: 1,
  basil: 1.25,
  pineapple: 1,
  olives: 1,
};

// Orders: rules a pizza should meet, each a topping covering some share of its slices and no others (a whole share is
// all of them), exactly a count of a topping, or two toppings kept from touching; plus how baked. An order has
// minRules to maxRules rules, each drawn by its weight: a share of the whole, half, third or quarter (only those the
// slicing can show), a count (up to maxCount) or an apart pair. wellChance and burntChance of orders ask for past
// normally baked. An order is kept only if its toppings fit the slices (see Order.ts); up to tries orders are drawn,
// then it falls back to a single whole share
export const ORDERS = {
  minRules: 1,
  maxRules: 3,
  wholeWeight: 1,
  halfWeight: 0.75,
  thirdWeight: 0.25,
  quarterWeight: 0.5,
  countWeight: 0.1,
  apartWeight: 0.1,
  maxCount: 5,
  wellChance: 0.1,
  burntChance: 0.025,
  tries: 50,
};

// Slicing: orders are drawn for a pizza cut evenly by cuts lines through its center. A cut shows as a groove multiplied
// over the pizza at alpha: color coreWidth design px wide, dropping off fast to clear over fadeWidth to either side. A
// lip of lipColor (lipCore and lipFade likewise) is screened at lipAlpha lipOffset design px to the side away from the
// light, coming from lightAngle degrees (0 from the right, clockwise); lipFacing is how much less a cut running toward
// the light gets. Cuts wander up to wobble design px to either side, swaying about every wobbleWave, and narrow to a
// point over taper where they stop short of the edge. The sliced pizza shows for showSeconds before the next order
export const SLICING = {
  cuts: 3,
  coreWidth: 2.5,
  fadeWidth: 5,
  color: '#3a2216',
  alpha: 0.7,
  lipCore: 2.5,
  lipFade: 1.875,
  lipColor: '#fff4dc',
  lipAlpha: 0.5,
  lipOffset: 3.125,
  lightAngle: -135,
  lipFacing: 0.5,
  wobble: 1.5,
  wobbleWave: 90,
  taper: 32.609,
  showSeconds: 1.5,
};

// The cutter, picked up from its button (center x, y and size design px) once the pizza is baked. Aimed at the pizza
// (up to reach design px past its edge) it shows the line through the center toward the pointer, held while within
// deadZone of the center, snapping to a cut line within snapToCut degrees. A press snaps to the nearest gridDegrees
// unless it snapped to a cut line, then cuts span design px along the line where the pointer meets it, sweeping as it
// drags. A ray from the center to the edge cut along completeAt of it parts slices. The aim shows as dots guideDot
// across, guideGap apart, of guideColor at guideAlpha; the cutter on its line as a bar of the same
export const CUTTER = {
  x: 1357,
  y: 384,
  size: 150,
  reach: 40,
  deadZone: 30,
  snapToCut: 8,
  gridDegrees: 15,
  span: 50,
  completeAt: 0.9,
  guideDot: 8,
  guideGap: 22,
  guideColor: '#000000',
  guideAlpha: 0.333,
};
// Toppings a share may ask for; counts and apart pairs use whole toppings, never scattered cheese
export const SHARE_TOPPINGS = ['cheese', 'pepperoni', 'basil', 'pineapple', 'olives'] as const;
export const WHOLE_TOPPINGS = ['pepperoni', 'basil', 'pineapple', 'olives'] as const;

// Scoring a served pizza, each rule from 0 to 1. A piece belongs to the slice its center lies in; a slice's coverage
// by a topping is how much of it, out to the inner rim, its own pieces of it cover, each a disc coverRadius of its half
// size, sampled sliceSamples by sliceSamples. A share takes its most covered slices that make up its part: it scores
// how much of the pizza is as asked, each of those covered at least coverFull and every other slice at most clearMax.
// A count loses countPenalty per piece off; an apart pair loses touchPenalty per touch, pieces touching when closer
// than touchFactor of their summed half sizes. Doneness loses its score over bakeTolerance of bake level outside its
// range
export const ORDER_JUDGE = {
  coverFull: 0.75,
  clearMax: 0.1,
  coverRadius: 0.9,
  sliceSamples: 12,
  countPenalty: 0.5,
  touchFactor: 0.8,
  touchPenalty: 0.25,
  bakeTolerance: 0.1,
};

// Peel: nudge from its drawn spot in design px (the dough moves with it), and its face center as fractions of the art
export const PEEL = {
  x: 0,
  y: -18,
  faceX: 0.5,
  faceY: 0.39,
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
  // Fraction of the rim circle covered before sauce, cheese and baking become available
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
  stampSpacing: 0.75,
  // Sauce can spill past the dough onto the peel, out to maskReach times the dough edge; whole stamps only
  maskReach: 1.5,
  // Mask resolution (square, spanning maskReach), and how many times the sauce pattern repeats across the dough
  textureSize: 768,
  patternRepeat: 2,
  // Sauce edge sits where the soft stamps reach this mask level, blurred over ± edgeWidth (small is crisp)
  edge: 0.5,
  edgeWidth: 0.08,
  // Inner shadow along every sauce edge: width in design pixels, darkening at the very edge (0 to 1)
  bevelWidth: 7,
  bevelShade: 0.314,
  // Coverage grid cells per side; a stamp counts cells within this fraction of its radius
  coverageGrid: 32,
  coverageCore: 0.7,
  // Sauce laid over toppings becomes a pass of its own above them, multiplied over the pizza without sauce; up to this
  // many passes in all (the first under every topping), then the newest pass rises above them and takes the sauce
  maxPasses: 4,
};

// Placed toppings: sheet-size pieces scaled down with some jitter, in the dough's polar space so they follow it. Each
// topping has its own cap (cheese maxCheese pieces, the rest maxPieces); past it a new piece takes the place of one
// buried under the rest, or of the oldest if none is
export const TOPPINGS = {
  scale: 0.5,
  scaleJitter: 0.15,
  maxCheese: 500,
  maxPieces: 100,
};

// A settling piece buries older pieces of its topping centered within <topping> times its half size, so they're the
// first to go at the cap
export const BURY = {
  cheese: 0.5,
  pepperoni: 0.5,
  basil: 0.5,
  pineapple: 0.5,
  olives: 0.5,
};

// Sauce and toppings can be applied anywhere. They land where pressed up to innerRim (a fraction of the dough edge at
// that angle); past it, the overshoot eases off exponentially, never landing past outerLimit (same units).
// pull: how fast it closes in on outerLimit; 1 leaves the inner rim at pointer speed, higher hugs the limit sooner
export const PLACEMENT = {
  innerRim: 0.603,
  outerLimit: 1,
  pull: 0.816,
};

// Scattering while pressed: a piece every spacing design px of drag, holdRate per second while resting,
// each landing within scatterRadius design px of the pointer
export type ScatterConfig = { spacing: number; holdRate: number; scatterRadius: number };
// Typed at use: the tuning save only finds plain `export const NAME = {` sections
export const CHEESE = {
  spacing: 14,
  holdRate: 12,
  scatterRadius: 45,
};

// Placed pieces land from their starting size down to it over <topping>Seconds, easing in, and roll into their angle
// from a random offset of up to <topping>Roll degrees either way. A piece held in hand starts from its held size;
// one with nothing held (by touch) starts from <topping>Scale times its size
export const LANDING = {
  cheeseScale: 1.2,
  cheeseSeconds: 0.2,
  cheeseRoll: 0,
  pepperoniScale: 1.2,
  pepperoniSeconds: 0.2,
  pepperoniRoll: 30,
  basilScale: 1.2,
  basilSeconds: 0.4,
  basilRoll: 20,
  pineappleScale: 1.2,
  pineappleSeconds: 0.2,
  pineappleRoll: 30,
  olivesScale: 1.2,
  olivesSeconds: 0.2,
  olivesRoll: 30,
};

// Brightening by an additive copy of the art: held sauce fades up to strength on press and back out on release, each
// over seconds; a dropped piece pulses up and back out the same way as it lands
export const PULSE = {
  strength: 0.1,
  seconds: 0.1,
};

// Whole toppings (all but sauce and cheese): one piece on press, then holdRate per second while held, moving or not,
// each landing within scatterRadius design px of the pointer
export type RepeatConfig = { holdRate: number; scatterRadius: number };
export const PIECES = {
  holdRate: 3,
  scatterRadius: 0,
};

// Dev skip key, once the dough is rolled: covers the inner rim in sauce, then in cheese once more than
// cheeseAfterSauce of the dough is sauced
export const SKIP = {
  cheeseAfterSauce: 0.1,
};

// Ingredients in hand follow the pointer: sauce shows its own art at scale, a fraction of its sheet size; toppings hold
// the very piece they drop next, at pieceScale times the size it lands. After a drop the hand stays empty for
// refillSeconds, then the next piece fades in over refillFadeSeconds; a drop before then takes it at once, whole
export const HELD = {
  scale: 0.56,
  pieceScale: 1.5,
  refillSeconds: 0.1,
  refillFadeSeconds: 0.1,
};

// Doneness rises linearly while the dragon breathes fire on rolled dough, raw at 0 to burnt at 1; the dial shows it.
// The art cross-fades raw to baked up to optimalLevel, where it looks fully baked, then baked to burnt, eased by
// easePower: 1 is linear; higher rushes the art through raw and burnt and lingers around optimalLevel.
// From minBaked on, it's baked enough to serve. Orders take it as normally baked up to wellFrom, well baked up to
// burntFrom, then burnt
export const BAKE = {
  secondsToBurnt: 8,
  optimalLevel: 0.734,
  easePower: 1.256,
  minBaked: 0.5,
  wellFrom: 0.84,
  burntFrom: 0.93,
};

// Dial between the peel and the dragon's feet: hub position and drawn width; hub and needle pivot are fractions of their art
export const BAKE_GAUGE = {
  x: 1341,
  y: 1450,
  width: 370,
  hubX: 0.505,
  hubY: 0.93,
  pivotX: 0.47,
  pivotY: 0.855,
  // Needle angle from upright at raw and burnt, radians
  sweep: 1.45,
};

// Bake button above the gauge: center and drawn width. Pressing it breathes fire, same as pressing the dragon
export const BAKE_BUTTON = {
  x: 1533,
  y: 1182,
  width: 212,
};

// Dragon: its pivot (fractions of the art) sits at (x, y), which may be past the design edge; scaled from its
// drawn size and rotated about the pivot in degrees
export const DRAGON = {
  x: 1950,
  y: 1200,
  pivotX: 0.749,
  pivotY: 0.716,
  scale: 1.18,
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

// Serve button: center and drawn width. Enabled once the pizza is baked enough (BAKE.minBaked); does nothing yet
export const SERVE_BUTTON = {
  x: 697,
  y: 1400,
  width: 293,
};
