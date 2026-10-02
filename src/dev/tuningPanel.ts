import { Pane } from 'tweakpane';
import { BAKE, BAKE_BUTTON, BAKE_GAUGE, BIN_LAYOUT, BOWL, DOUGH, CHEESE, DRAGON, FIRE, HELD, LANDING, PEEL, PIECES, PULSE, PLACEMENT, SAUCE, LABEL_NUDGE, SELECTED_LABEL, SERVE_BUTTON, TOPPINGS } from '../config';
import type { KitchenScene } from '../scenes/KitchenScene';
import { TUNING_SAVE_ENDPOINT } from './tuningEndpoint';

const RESET_KEY = 'r';
const SKIP_KEY = 's';
// Tweakpane's own offset from the window corner, px
const PANEL_MARGIN = 8;
const BAKE_LEVEL_REFRESH_MS = 100;

/** Dev-only live tuning. Edits config objects in place; values reset on reload. */
export function createTuningPanel(scene: KitchenScene): void {
  const pane = new Pane({ title: 'Tuning' });
  // Scroll when taller than the window
  const container = pane.element.parentElement;
  if (container) {
    container.style.maxHeight = `calc(100vh - ${2 * PANEL_MARGIN}px)`;
    container.style.overflowY = 'auto';
  }
  const resetDough = () => scene.resetDough();

  pane.addButton({ title: `Reset dough (${RESET_KEY.toUpperCase()})` }).on('click', resetDough);
  pane.addButton({ title: `Skip step (${SKIP_KEY.toUpperCase()})` }).on('click', () => scene.skipStep());
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === RESET_KEY) resetDough();
    if (key === SKIP_KEY) scene.skipStep();
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

  const cheese = pane.addFolder({ title: 'Cheese', expanded: false });
  cheese.addBinding(scene.dough.toppings, 'pieces', { readonly: true });
  cheese.addBinding(CHEESE, 'spacing', { min: 2, max: 80, step: 1 });
  cheese.addBinding(CHEESE, 'holdRate', { min: 0, max: 60 });
  cheese.addBinding(CHEESE, 'scatterRadius', { min: 0, max: 150, step: 1 });

  const pieces = pane.addFolder({ title: 'Pieces', expanded: false });
  pieces.addBinding(PIECES, 'holdRate', { min: 0, max: 20 });
  pieces.addBinding(HELD, 'pieceScale', { label: 'heldScale', min: 0.5, max: 4 });
  pieces.addBinding(PULSE, 'strength', { label: 'pulseStrength', min: 0, max: 2 });
  pieces.addBinding(PULSE, 'seconds', { label: 'pulseSeconds', min: 0, max: 1 });
  pieces.addBinding(SELECTED_LABEL, 'color', { label: 'labelColor' });
  pieces.addBinding(SELECTED_LABEL, 'scale', { label: 'labelScale', min: 1, max: 2 });
  pieces.addBinding(SELECTED_LABEL, 'seconds', { label: 'labelSeconds', min: 0, max: 1 });
  pieces.addBinding(PIECES, 'scatterRadius', { min: 0, max: 150, step: 1 });
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
    bins.addBinding(LABEL_NUDGE, key, { label: `${key}Label`, min: -100, max: 100, step: 1 });
  }
  bins.on('change', () => scene.layoutBins());

  const bowl = pane.addFolder({ title: 'Bowl', expanded: false });
  bowl.addBinding(BOWL, 'x', { min: -200, max: 200, step: 1 });
  bowl.addBinding(BOWL, 'y', { min: -200, max: 200, step: 1 });
  bowl.addBinding(BOWL, 'fillWidth', { min: 0.2, max: 1 });
  bowl.on('change', () => scene.layoutBowl());

  const peel = pane.addFolder({ title: 'Peel', expanded: false });
  peel.addBinding(PEEL, 'x', { min: -200, max: 200, step: 1 });
  peel.addBinding(PEEL, 'y', { min: -200, max: 200, step: 1 });
  peel.addBinding(PEEL, 'faceX', { min: 0, max: 1 });
  peel.addBinding(PEEL, 'faceY', { min: 0, max: 1 });
  peel.on('change', () => scene.layoutPeel());

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
  dragon.on('change', () => scene.layoutDragon());

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
  bake.addBinding(BAKE, 'toppingsCutoff', { min: 0, max: 1 });
  bake.addBinding(BAKE, 'minBaked', { min: 0, max: 1 });
  bake.addBinding(BAKE, 'easePower', { min: 1, max: 5 });
  bake.addBinding(BAKE_GAUGE, 'sweep', { min: 0, max: Math.PI / 2 });

  const serve = pane.addFolder({ title: 'Serve', expanded: false });
  serve.addBinding(SERVE_BUTTON, 'x', { min: 0, max: 2048, step: 1 });
  serve.addBinding(SERVE_BUTTON, 'y', { min: 0, max: 1536, step: 1 });
  serve.addBinding(SERVE_BUTTON, 'width', { min: 40, max: 600, step: 1 });

  const save = pane.addButton({ title: 'Save to config.ts' });
  save.on('click', async () => {
    // The config file change triggers a page reload with the saved values
    const res = await fetch(TUNING_SAVE_ENDPOINT, { method: 'POST', body: JSON.stringify({ DOUGH, SAUCE, BAKE, BAKE_GAUGE, BAKE_BUTTON, DRAGON, FIRE, BIN_LAYOUT, HELD, TOPPINGS, CHEESE, PLACEMENT, PEEL, BOWL, PIECES, LANDING, PULSE, SELECTED_LABEL, SERVE_BUTTON, LABEL_NUDGE }) });
    save.title = res.ok ? 'Saved' : `Save failed: ${await res.text()}`;
  });
}
