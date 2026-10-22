import { Pane } from 'tweakpane';
import { BAKE, BAKE_BUTTON, BAKE_GAUGE, BIN_LAYOUT, BOWL, BURY, DOUGH, CHEESE, CUTTER, DRAGON, FIRE, GRADE, HELD, LANDING, PEEL, PIECES, PULSE, PLACEMENT, SAUCE, LABEL_NUDGE, LABEL_TEXT, ORDER_ICON_SCALE, ORDER_JUDGE, ORDER_TICKET, ORDER_TRAY, ORDERS, PICTURE_JUDGE, RECIPE, SELECTED_LABEL, SERVE_BUTTON, SERVED, SLICING, TOPPINGS, WIDESCREEN } from '../config';
import { gradeOf } from '../orders/grade';
import type { Order, Rule } from '../orders/Order';
import type { Recipe } from '../orders/Recipe';
import type { CurrentOrder, KitchenScene } from '../scenes/KitchenScene';
import { addPaneFilter } from './paneFilter';
import { TUNING_SAVE_ENDPOINT } from './tuningEndpoint';

const RESET_KEY = 'r';
const SKIP_KEY = 's';
const ORDER_KEY = 'o';
const COPY_KEY = 'c';
// Tweakpane's own offset from the window corner, px
const PANEL_MARGIN = 8;
const BAKE_LEVEL_REFRESH_MS = 100;
const ORDER_SCORE_REFRESH_MS = 250;
const SCORE_DECIMALS = 2;

const describeRule = (rule: Rule): string => {
  switch (rule.kind) {
    case 'share':
      return `1/${rule.parts} ${rule.topping}`;
    case 'count':
      return `${rule.n} × ${rule.topping}`;
    case 'apart':
      return `${rule.a} apart from ${rule.b}`;
  }
};

/** A rule order spelled out, a line per rule, then how baked. */
const describeRules = (order: Order): string => [...order.rules.map(describeRule), `${order.doneness} bake`].join('\n');

/** A picture order spelled out: its cuts, sauce and cheese, a line per topping with its slices, then how baked. */
const describeRecipe = (recipe: Recipe): string =>
  [
    `${recipe.cuts.length} cuts`,
    [recipe.sauce ? 'sauce' : 'no sauce', recipe.cheese ? 'cheese' : 'no cheese'].join(', '),
    ...recipe.toppings.map(({ topping, slices }) => `${topping} on ${slices.join(' ')}`),
    `bake ${recipe.bakeLevel.toFixed(SCORE_DECIMALS)}`,
  ].join('\n');

const describeOrder = (current: CurrentOrder): string => (current.kind === 'picture' ? describeRecipe(current.recipe) : describeRules(current.order));

/** Dev-only live tuning. Edits config objects in place; values reset on reload. refit re-fits the screen. */
export function createTuningPanel(scene: KitchenScene, refit: () => void): void {
  const pane = new Pane({ title: 'Tuning' });
  // Scroll when taller than the window
  const container = pane.element.parentElement;
  if (container) {
    container.style.maxHeight = `calc(100vh - ${2 * PANEL_MARGIN}px)`;
    container.style.overflowY = 'auto';
  }
  const resetDough = () => scene.resetDough();
  const layout = () => scene.layout();

  pane.addButton({ title: `Reset dough (${RESET_KEY.toUpperCase()})` }).on('click', resetDough);
  pane.addButton({ title: `Skip step (${SKIP_KEY.toUpperCase()})` }).on('click', () => scene.skipStep());
  pane.addButton({ title: `New order (${ORDER_KEY.toUpperCase()})` }).on('click', () => scene.newOrder());
  pane.addButton({ title: `Copy order (${COPY_KEY.toUpperCase()})` }).on('click', () => scene.copyOrder());
  window.addEventListener('keydown', (e) => {
    // Typing in a field (the filter, a number box) isn't a shortcut
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (key === RESET_KEY) resetDough();
    if (key === SKIP_KEY) scene.skipStep();
    if (key === ORDER_KEY) scene.newOrder();
    if (key === COPY_KEY) scene.copyOrder();
  });

  const dough = pane.addFolder({ title: 'Dough', expanded: false });
  dough.addBinding(scene.dough, 'coverage', { readonly: true });
  dough.addBinding(scene.dough, 'roundness', { readonly: true });
  dough.addBinding(DOUGH, 'tapImpulse', { min: 0, max: 0.3 });
  dough.addBinding(DOUGH, 'holdGrowthPerSecond', { label: 'holdGrowth', min: 0, max: 2 });
  dough.addBinding(DOUGH, 'spread', { min: 0.05, max: 1.5 });
  dough.addBinding(DOUGH, 'radialInner', { min: 0, max: 0.95 });
  dough.addBinding(DOUGH, 'radialPower', { min: 0.25, max: 4 });
  dough.addBinding(DOUGH, 'sizePower', { min: 0, max: 4 });
  dough.addBinding(DOUGH, 'overRimFactor', { min: 0, max: 1 });
  dough.addBinding(DOUGH, 'overRimPower', { min: 0, max: 5 });
  dough.addBinding(DOUGH, 'dropDuration', { min: 0.01, max: 1 });
  dough.addBinding(DOUGH, 'slamGrowth', { min: 0, max: 1 });
  dough.addBinding(DOUGH, 'slamDuration', { min: 0.01, max: 1 });
  dough.addBinding(DOUGH, 'easeRate', { min: 1, max: 40 });
  dough.addBinding(DOUGH, 'grabSlack', { min: 0, max: 150, step: 1 });
  dough.addBinding(DOUGH, 'reachOutside');
  dough.addBinding(DOUGH, 'capRatio', { min: 1, max: 1.3 });
  dough.addBinding(DOUGH, 'startRatio', { label: 'startRatio (on reset)', min: 0.1, max: 0.9 });
  dough.addBinding(DOUGH, 'sauceCoverage', { min: 0.5, max: 1 });
  dough.addBinding(DOUGH, 'stretchBias', { min: 0, max: 4 });
  dough.addBinding(DOUGH, 'rolledFadeStart', { min: 0, max: 1 });
  dough.addBinding(DOUGH, 'rolledFadeEnd', { min: 0, max: 1 });

  const sauce = pane.addFolder({ title: 'Sauce', expanded: false });
  sauce.addBinding(scene.dough.sauce, 'coverage', { readonly: true });
  sauce.addBinding(HELD, 'scale', { label: 'heldScale', min: 0.1, max: 1.5 });
  sauce.addBinding(SAUCE, 'brushRadius', { min: 10, max: 150, step: 1 });
  sauce.addBinding(SAUCE, 'stampSpacing', { min: 0.05, max: 1 });
  sauce.addBinding(SAUCE, 'edge', { min: 0.05, max: 0.95 });
  sauce.addBinding(SAUCE, 'edgeWidth', { min: 0.01, max: 0.5 });
  sauce.addBinding(SAUCE, 'patternRepeat', { min: 0.5, max: 6 });
  sauce.addBinding(SAUCE, 'bevelWidth', { min: 0, max: 40, step: 1 });
  sauce.addBinding(SAUCE, 'bevelShade', { min: 0, max: 1 });
  sauce.addBinding(scene.dough.sauce, 'passes', { readonly: true });
  sauce.addBinding(SAUCE, 'maxPasses', { min: 1, max: 10, step: 1 });

  const cheese = pane.addFolder({ title: 'Cheese', expanded: false });
  cheese.addBinding(scene.dough.toppings, 'pieces', { readonly: true });
  cheese.addBinding(CHEESE, 'spacing', { min: 2, max: 80, step: 1 });
  cheese.addBinding(CHEESE, 'holdRate', { min: 0, max: 60 });
  cheese.addBinding(CHEESE, 'scatterRadius', { min: 0, max: 150, step: 1 });

  const pieces = pane.addFolder({ title: 'Pieces', expanded: false });
  pieces.addBinding(PIECES, 'holdRate', { min: 0, max: 20 });
  pieces.addBinding(HELD, 'pieceScale', { label: 'heldScale', min: 0.5, max: 4 });
  pieces.addBinding(HELD, 'refillSeconds', { label: 'heldRefill', min: 0, max: 1 });
  pieces.addBinding(HELD, 'refillFadeSeconds', { label: 'heldFadeIn', min: 0, max: 1 });
  pieces.addBinding(PULSE, 'strength', { label: 'pulseStrength', min: 0, max: 2 });
  pieces.addBinding(PULSE, 'seconds', { label: 'pulseSeconds', min: 0, max: 1 });
  pieces.addBinding(SELECTED_LABEL, 'color', { label: 'labelColor' });
  pieces.addBinding(SELECTED_LABEL, 'scale', { label: 'labelScale', min: 1, max: 2 });
  pieces.addBinding(SELECTED_LABEL, 'seconds', { label: 'labelSeconds', min: 0, max: 1 });
  pieces.addBinding(PIECES, 'scatterRadius', { min: 0, max: 150, step: 1 });
  for (const key of Object.keys(BURY) as (keyof typeof BURY)[]) pieces.addBinding(BURY, key, { label: `${key}Bury`, min: 0, max: 1 });
  cheese.addBinding(TOPPINGS, 'scale', { label: 'pieceScale', min: 0.05, max: 1 });
  cheese.addBinding(TOPPINGS, 'scaleJitter', { min: 0, max: 0.5 });

  const placement = pane.addFolder({ title: 'Placement', expanded: false });
  placement.addBinding(PLACEMENT, 'innerRim', { min: 0.5, max: 1 });
  placement.addBinding(PLACEMENT, 'outerLimit', { min: 1, max: 1.5 });
  placement.addBinding(PLACEMENT, 'pull', { min: 0.25, max: 4 });

  // Per topping: how much bigger a piece starts when placed, how far it rolls in, and how long it takes to settle
  const landing = pane.addFolder({ title: 'Landing', expanded: false });
  for (const key of Object.keys(LANDING) as (keyof typeof LANDING)[]) {
    const range = key.endsWith('Scale') ? { min: 0.5, max: 3 } : key.endsWith('Roll') ? { min: 0, max: 180, step: 1 } : { min: 0, max: 1 };
    landing.addBinding(LANDING, key, range);
  }


  const bins = pane.addFolder({ title: 'Bins', expanded: false });
  for (const key of Object.keys(BIN_LAYOUT) as (keyof typeof BIN_LAYOUT)[]) {
    const isFlag = typeof BIN_LAYOUT[key] === 'boolean';
    bins.addBinding(BIN_LAYOUT, key, isFlag ? {} : { min: -400, max: 400, step: 1 });
  }
  for (const key of Object.keys(LABEL_NUDGE) as (keyof typeof LABEL_NUDGE)[]) {
    const range = key.endsWith('Tilt') ? { min: -20, max: 20, step: 0.5 } : { min: -100, max: 100, step: 1 };
    bins.addBinding(LABEL_NUDGE, key, { label: `${key}Label`, ...range });
  }
  bins.on('change', layout);

  const labels = pane.addFolder({ title: 'Labels', expanded: false });
  labels.addBinding(LABEL_TEXT, 'weight', { min: 100, max: 800, step: 10 });
  labels.addBinding(LABEL_TEXT, 'ink');
  labels.addBinding(LABEL_TEXT, 'uppercase');
  labels.addBinding(LABEL_TEXT, 'condense', { min: 0.5, max: 1.2 });
  labels.addBinding(LABEL_TEXT, 'cap', { min: 10, max: 150, step: 1 });
  for (const place of ['bin', 'bowl', 'tray', 'gauge'] as const) {
    labels.addBinding(LABEL_TEXT, `${place}Width`, { min: 0, max: 600, step: 1 });
    // No curve at all is a radius of 0
    labels.addBinding(LABEL_TEXT, `${place}Radius`, { min: 0, max: 3000, step: 10 });
  }
  labels.addBinding(LABEL_TEXT, 'tiltJitter', { min: 0, max: 15 });
  labels.addBinding(LABEL_TEXT, 'resolution', { min: 0.5, max: 4 });
  labels.addBinding(LABEL_TEXT, 'segment', { min: 1, max: 50, step: 1 });
  labels.addBinding(LABEL_TEXT, 'artAlpha', { min: 0, max: 1 });
  labels.on('change', layout);

  const bowl = pane.addFolder({ title: 'Bowl', expanded: false });
  bowl.addBinding(BOWL, 'x', { min: -200, max: 200, step: 1 });
  bowl.addBinding(BOWL, 'y', { min: -200, max: 200, step: 1 });
  bowl.addBinding(BOWL, 'scale', { min: 0.5, max: 2 });
  bowl.addBinding(BOWL, 'labelX', { min: -200, max: 200, step: 1 });
  bowl.addBinding(BOWL, 'labelY', { min: -200, max: 200, step: 1 });
  bowl.addBinding(BOWL, 'fillWidth', { min: 0.2, max: 1 });
  bowl.on('change', layout);

  const orderTray = pane.addFolder({ title: 'Order tray', expanded: false });
  orderTray.addBinding(ORDER_TRAY, 'x', { min: 0, max: 2048, step: 1 });
  orderTray.addBinding(ORDER_TRAY, 'y', { min: 0, max: 1536, step: 1 });
  orderTray.addBinding(ORDER_TRAY, 'scale', { min: 0.5, max: 2 });
  orderTray.addBinding(ORDER_TRAY, 'labelX', { min: -200, max: 200, step: 1 });
  orderTray.addBinding(ORDER_TRAY, 'labelY', { min: -200, max: 200, step: 1 });
  orderTray.on('change', layout);

  // Live scores of the pizza on the peel against the order, a line per part then the total
  const orders = pane.addFolder({ title: 'Orders', expanded: false });
  const live = { order: '', score: '', served: '' };
  const lines = Math.max(ORDERS.maxRules + 2, RECIPE.maxToppings + 3);
  const liveOrder = orders.addBinding(live, 'order', { readonly: true, multiline: true, rows: lines });
  const liveScore = orders.addBinding(live, 'score', { readonly: true, multiline: true, rows: lines });
  const lastServed = orders.addBinding(live, 'served', { label: 'last served', readonly: true });
  setInterval(() => {
    const { parts, total } = scene.scoreOrder();
    live.order = describeOrder(scene.current);
    live.score = [...parts, { name: 'total', score: total }].map(({ name, score }) => `${name} ${score.toFixed(SCORE_DECIMALS)}`).join('\n');
    live.served = scene.lastScore ? `${scene.lastScore.total.toFixed(SCORE_DECIMALS)} ${gradeOf(scene.lastScore.total)}` : '';
    liveOrder.refresh();
    liveScore.refresh();
    lastServed.refresh();
  }, ORDER_SCORE_REFRESH_MS);
  orders.addBinding(ORDERS, 'pictures').on('change', () => scene.newOrder());
  orders.addBinding(RECIPE, 'minCuts', { min: 1, max: 6, step: 1 });
  orders.addBinding(RECIPE, 'maxCuts', { min: 1, max: 6, step: 1 });
  orders.addBinding(RECIPE, 'sauceChance', { min: 0, max: 1 });
  orders.addBinding(RECIPE, 'cheeseChance', { min: 0, max: 1 });
  orders.addBinding(RECIPE, 'minToppings', { min: 0, max: 4, step: 1 });
  orders.addBinding(RECIPE, 'maxToppings', { min: 0, max: 4, step: 1 });
  orders.addBinding(RECIPE, 'everywhereChance', { min: 0, max: 1 });
  orders.addBinding(RECIPE, 'density', { min: 0.1, max: 2 });
  orders.addBinding(RECIPE, 'edgeGap', { min: 0, max: 2 });
  for (const key of ['lightWeight', 'rightWeight', 'wellWeight', 'burntWeight'] as const) orders.addBinding(RECIPE, key, { min: 0, max: 5 });
  for (const key of ['lightAt', 'wellAt', 'burntAt'] as const) orders.addBinding(RECIPE, key, { min: 0, max: 1 });
  orders.addBinding(PICTURE_JUDGE, 'extraPenalty', { min: 0, max: 0.5 });
  orders.addBinding(PICTURE_JUDGE, 'missingPenalty', { min: 0, max: 0.5 });
  orders.addBinding(PICTURE_JUDGE, 'bakeTolerance', { label: 'pictureBakeTolerance', min: 0, max: 0.5 });
  for (const key of ['coverWeight', 'slicesWeight', 'bakeWeight'] as const) orders.addBinding(PICTURE_JUDGE, key, { min: 0, max: 10 });
  for (const key of ['aPlus', 'a', 'b', 'c', 'd'] as const) orders.addBinding(GRADE, key, { label: `grade ${key}`, min: 0, max: 1 });
  orders.addBinding(GRADE, 'cap', { label: 'gradeCap', min: 20, max: 600, step: 1 });
  orders.addBinding(GRADE, 'color', { label: 'gradeColor' });
  orders.addBinding(GRADE, 'tilt', { label: 'gradeTilt', min: -45, max: 45, step: 0.5 });
  orders.addBinding(GRADE, 'x', { label: 'gradeX', min: -300, max: 300, step: 1 });
  orders.addBinding(GRADE, 'y', { label: 'gradeY', min: -500, max: 500, step: 1 });
  orders.addBinding(GRADE, 'popScale', { min: 1, max: 5 });
  orders.addBinding(GRADE, 'popSeconds', { min: 0, max: 1 });
  orders.addBinding(ORDER_TICKET, 'pictureSize', { min: 0.2, max: 1.5 });
  orders.addBinding(ORDERS, 'minRules', { min: 1, max: 4, step: 1 });
  orders.addBinding(ORDERS, 'maxRules', { min: 1, max: 4, step: 1 });
  for (const key of ['wholeWeight', 'halfWeight', 'thirdWeight', 'quarterWeight'] as const) orders.addBinding(ORDERS, key, { min: 0, max: 2 });
  orders.addBinding(ORDERS, 'countWeight', { min: 0, max: 2 });
  orders.addBinding(ORDERS, 'apartWeight', { min: 0, max: 2 });
  orders.addBinding(ORDERS, 'maxCount', { min: 1, max: 9, step: 1 });
  orders.addBinding(ORDERS, 'wellChance', { min: 0, max: 1 });
  orders.addBinding(ORDERS, 'burntChance', { min: 0, max: 1 });
  orders.addBinding(SLICING, 'cuts', { min: 0, max: 10, step: 1 });

  // How cuts look, and how long the cut pizza shows once served
  const slicing = pane.addFolder({ title: 'Slicing', expanded: false });
  slicing.addBinding(SLICING, 'coreWidth', { label: 'cutCore', min: 0, max: 10 });
  slicing.addBinding(SLICING, 'fadeWidth', { label: 'cutFade', min: 0, max: 20 });
  slicing.addBinding(SLICING, 'color', { label: 'cutColor' });
  slicing.addBinding(SLICING, 'alpha', { label: 'cutAlpha', min: 0, max: 1 });
  slicing.addBinding(SLICING, 'lipCore', { min: 0, max: 10 });
  slicing.addBinding(SLICING, 'lipFade', { min: 0, max: 20 });
  slicing.addBinding(SLICING, 'lipColor');
  slicing.addBinding(SLICING, 'lipAlpha', { min: 0, max: 1 });
  slicing.addBinding(SLICING, 'lipOffset', { min: -10, max: 10 });
  slicing.addBinding(SLICING, 'lightAngle', { min: -180, max: 180, step: 1 });
  slicing.addBinding(SLICING, 'lipFacing', { min: 0, max: 1 });
  slicing.addBinding(SLICING, 'wobble', { label: 'cutWobble', min: 0, max: 10 });
  slicing.addBinding(SLICING, 'wobbleWave', { label: 'cutWobbleWave', min: 10, max: 400 });
  slicing.addBinding(SLICING, 'taper', { label: 'cutTaper', min: 0, max: 40 });
  slicing.addBinding(SLICING, 'showSeconds', { label: 'slicedSeconds', min: 0, max: 5 });
  slicing.addBinding(SERVED, 'stagger', { label: 'servedStagger', min: 0, max: 0.5 });
  slicing.addBinding(SERVED, 'seconds', { label: 'servedSeconds', min: 0.1, max: 3 });
  slicing.addBinding(SERVED, 'distance', { label: 'servedDistance', min: 0, max: 1500, step: 1 });
  slicing.addBinding(SERVED, 'spin', { label: 'servedSpin', min: 0, max: 90, step: 1 });
  slicing.addBinding(SERVED, 'fadeFrom', { label: 'servedFadeFrom', min: 0, max: 0.99 });

  const cutter = pane.addFolder({ title: 'Cutter', expanded: false });
  cutter.addBinding(CUTTER, 'x', { min: 0, max: 2048, step: 1 }).on('change', () => scene.layout());
  cutter.addBinding(CUTTER, 'y', { min: 0, max: 1536, step: 1 }).on('change', () => scene.layout());
  cutter.addBinding(CUTTER, 'size', { min: 40, max: 400, step: 1 }).on('change', () => scene.layout());
  cutter.addBinding(CUTTER, 'span', { min: 5, max: 200, step: 1 });
  cutter.addBinding(CUTTER, 'completeAt', { min: 0, max: 1 });
  cutter.addBinding(CUTTER, 'snapToCut', { min: 0, max: 45 });
  cutter.addBinding(CUTTER, 'gridDegrees', { min: 0, max: 90, step: 0.25 });
  cutter.addBinding(CUTTER, 'deadZone', { min: 0, max: 150, step: 1 });
  cutter.addBinding(CUTTER, 'reach', { min: 1, max: 3 });
  cutter.addBinding(CUTTER, 'guideDot', { min: 1, max: 20 });
  cutter.addBinding(CUTTER, 'guideGap', { min: 2, max: 60 });
  cutter.addBinding(CUTTER, 'guideColor');
  cutter.addBinding(CUTTER, 'guideAlpha', { min: 0, max: 1 });
  orders.addBinding(ORDER_JUDGE, 'coverFull', { min: 0.1, max: 1 });
  orders.addBinding(ORDER_JUDGE, 'clearMax', { min: 0, max: 0.5 });
  orders.addBinding(ORDER_JUDGE, 'coverRadius', { min: 0.2, max: 1.5 });
  orders.addBinding(ORDER_JUDGE, 'sliceSamples', { min: 4, max: 32, step: 1 });
  orders.addBinding(ORDER_JUDGE, 'countPenalty', { min: 0, max: 1 });
  orders.addBinding(ORDER_JUDGE, 'touchFactor', { min: 0.2, max: 1.5 });
  orders.addBinding(ORDER_JUDGE, 'touchPenalty', { min: 0, max: 1 });
  orders.addBinding(ORDER_JUDGE, 'bakeTolerance', { min: 0, max: 0.5 });
  orders.addBinding(ORDER_TICKET, 'width', { label: 'ticketWidth', min: 0.2, max: 1 });
  orders.addBinding(ORDER_TICKET, 'height', { label: 'ticketHeight', min: 0.2, max: 1 });
  orders.addBinding(ORDER_TICKET, 'offsetY', { label: 'ticketOffsetY', min: -0.5, max: 0.5 });
  orders.addBinding(ORDER_TICKET, 'rowHeight', { min: 20, max: 200, step: 1 });
  orders.addBinding(ORDER_TICKET, 'rowGap', { min: 0, max: 60, step: 1 });
  orders.addBinding(ORDER_TICKET, 'itemGap', { min: -20, max: 60, step: 1 });
  orders.addBinding(ORDER_TICKET, 'toppingSize', { min: 0.2, max: 1.5 });
  orders.addBinding(ORDER_TICKET, 'pieTopping', { min: 0.1, max: 1 });
  orders.addBinding(ORDER_TICKET, 'pieRadius', { min: 0.2, max: 0.5 });
  for (const key of ['digitSize', 'timesSize', 'apartSize', 'flameSize'] as const) orders.addBinding(ORDER_TICKET, key, { min: 0.1, max: 1.5 });
  for (const key of Object.keys(ORDER_ICON_SCALE) as (keyof typeof ORDER_ICON_SCALE)[]) {
    orders.addBinding(ORDER_ICON_SCALE, key, { label: `${key}Icon`, min: 0.5, max: 2 });
  }
  orders.on('change', layout);

  const peel = pane.addFolder({ title: 'Peel', expanded: false });
  peel.addBinding(PEEL, 'x', { min: -200, max: 200, step: 1 });
  peel.addBinding(PEEL, 'y', { min: -200, max: 200, step: 1 });
  peel.addBinding(PEEL, 'faceX', { min: 0, max: 1 });
  peel.addBinding(PEEL, 'faceY', { min: 0, max: 1 });
  peel.on('change', layout);

  const dragon = pane.addFolder({ title: 'Dragon', expanded: false });
  dragon.addBinding(DRAGON, 'x', { min: 1200, max: 2800, step: 1 });
  dragon.addBinding(DRAGON, 'y', { min: 800, max: 2200, step: 1 });
  dragon.addBinding(DRAGON, 'pivotX', { min: 0, max: 1 });
  dragon.addBinding(DRAGON, 'pivotY', { min: 0, max: 1 });
  dragon.addBinding(DRAGON, 'scale', { min: 0.5, max: 2.5 });
  dragon.addBinding(DRAGON, 'angle', { min: -45, max: 45, step: 0.5 });
  dragon.addBinding(FIRE, 'mouthX', { min: 0, max: 1 });
  dragon.addBinding(FIRE, 'mouthY', { min: 0, max: 1 });
  dragon.addBinding(FIRE, 'reach', { min: 0.2, max: 1.5 });
  dragon.on('change', layout);

  const bake = pane.addFolder({ title: 'Bake', expanded: false });
  bake.addBinding(BAKE_GAUGE, 'x', { min: 0, max: 2048, step: 1 });
  bake.addBinding(BAKE_GAUGE, 'y', { min: 0, max: 1536, step: 1 });
  bake.addBinding(BAKE_BUTTON, 'x', { label: 'buttonX', min: 0, max: 2048, step: 1 });
  bake.addBinding(BAKE_BUTTON, 'y', { label: 'buttonY', min: 0, max: 1536, step: 1 });
  bake.addBinding(BAKE_BUTTON, 'width', { label: 'buttonWidth', min: 40, max: 400, step: 1 });
  // Draggable to preview the bake cross-fade; fire keeps raising it from wherever it's left, so it re-reads
  const bakeLevel = bake.addBinding(scene, 'bakeLevel', { min: 0, max: 1 });
  setInterval(() => bakeLevel.refresh(), BAKE_LEVEL_REFRESH_MS);
  bake.addBinding(BAKE, 'secondsToBurnt', { min: 1, max: 40 });
  bake.addBinding(BAKE, 'optimalLevel', { min: 0.05, max: 0.95 });
  bake.addBinding(BAKE, 'minBaked', { min: 0, max: 1 });
  bake.addBinding(BAKE, 'wellFrom', { min: 0, max: 1 });
  bake.addBinding(BAKE, 'burntFrom', { min: 0, max: 1 });
  bake.addBinding(BAKE, 'easePower', { min: 1, max: 5 });
  bake.addBinding(BAKE_GAUGE, 'sweep', { min: 0, max: Math.PI / 2 });
  bake.on('change', layout);

  const serve = pane.addFolder({ title: 'Serve', expanded: false });
  serve.addBinding(SERVE_BUTTON, 'x', { min: 0, max: 2048, step: 1 });
  serve.addBinding(SERVE_BUTTON, 'y', { min: 0, max: 1536, step: 1 });
  serve.addBinding(SERVE_BUTTON, 'width', { min: 40, max: 600, step: 1 });
  serve.on('change', layout);

  // Shows on screens at least fromAspect wide; widen the window to see it
  const widescreen = pane.addFolder({ title: 'Widescreen', expanded: false });
  widescreen.addBinding(WIDESCREEN, 'fromAspect', { min: 1, max: 2.5 });
  widescreen.addBinding(WIDESCREEN, 'width', { min: 2048, max: 4000, step: 1 });
  const fitKeys = ['fromAspect', 'width'];
  for (const key of Object.keys(WIDESCREEN).filter((k) => !fitKeys.includes(k)) as (keyof typeof WIDESCREEN)[]) {
    const range = key.endsWith('Scale') ? { min: 0.2, max: 2.5 } : { min: -200, max: 4000, step: 1 };
    widescreen.addBinding(WIDESCREEN, key, range);
  }
  widescreen.on('change', refit);

  // After every folder is in, so it can sit above the first
  addPaneFilter(pane);

  const save = pane.addButton({ title: 'Save to config.ts' });
  save.on('click', async () => {
    // The config file change triggers a page reload with the saved values
    const res = await fetch(TUNING_SAVE_ENDPOINT, { method: 'POST', body: JSON.stringify({ DOUGH, SAUCE, BAKE, BAKE_GAUGE, BAKE_BUTTON, DRAGON, FIRE, BIN_LAYOUT, HELD, TOPPINGS, BURY, CHEESE, PLACEMENT, PEEL, BOWL, ORDER_TRAY, ORDER_TICKET, ORDER_ICON_SCALE, ORDERS, RECIPE, PICTURE_JUDGE, GRADE, SLICING, SERVED, CUTTER, ORDER_JUDGE, PIECES, LANDING, PULSE, SELECTED_LABEL, LABEL_TEXT, SERVE_BUTTON, LABEL_NUDGE, WIDESCREEN }) });
    save.title = res.ok ? 'Saved' : `Save failed: ${await res.text()}`;
  });
}
