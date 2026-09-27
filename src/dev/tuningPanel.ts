import { Pane } from 'tweakpane';
import { BAKE, BAKE_GAUGE, BIN_LAYOUT, DOUGH, DRAGON, FIRE, HELD, SAUCE } from '../config';
import type { KitchenScene } from '../scenes/KitchenScene';
import { TUNING_SAVE_ENDPOINT } from './tuningEndpoint';

const RESET_KEY = 'r';
const SKIP_KEY = 's';

/** Dev-only live tuning. Edits config objects in place; values reset on reload. */
export function createTuningPanel(scene: KitchenScene): void {
  const pane = new Pane({ title: 'Tuning' });
  const resetDough = () => scene.resetDough();

  pane.addButton({ title: `Reset dough (${RESET_KEY.toUpperCase()})` }).on('click', resetDough);
  pane.addButton({ title: `Skip step (${SKIP_KEY.toUpperCase()})` }).on('click', () => scene.skipStep());
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === RESET_KEY) resetDough();
    if (key === SKIP_KEY) scene.skipStep();
  });

  const dough = pane.addFolder({ title: 'Dough' });
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

  const sauce = pane.addFolder({ title: 'Sauce' });
  sauce.addBinding(scene.dough.sauce, 'coverage', { readonly: true });
  sauce.addBinding(HELD, 'scale', { label: 'heldScale', min: 0.1, max: 1.5 });
  sauce.addBinding(SAUCE, 'brushRadius', { min: 10, max: 150, step: 1 });
  sauce.addBinding(SAUCE, 'stampSpacing', { min: 0.05, max: 1 });
  sauce.addBinding(SAUCE, 'edge', { min: 0.05, max: 0.95 });
  sauce.addBinding(SAUCE, 'edgeWidth', { min: 0.01, max: 0.5 });
  sauce.addBinding(SAUCE, 'grain', { min: 0, max: 1 });
  sauce.addBinding(SAUCE, 'bevelWidth', { min: 0, max: 40, step: 1 });
  sauce.addBinding(SAUCE, 'bevelShade', { min: 0, max: 1 });

  const bins = pane.addFolder({ title: 'Bins' });
  for (const key of Object.keys(BIN_LAYOUT) as (keyof typeof BIN_LAYOUT)[]) {
    const isFlag = typeof BIN_LAYOUT[key] === 'boolean';
    bins.addBinding(BIN_LAYOUT, key, isFlag ? {} : { min: -400, max: 400, step: 1 });
  }
  bins.on('change', () => scene.layoutBins());

  const dragon = pane.addFolder({ title: 'Dragon' });
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

  const bake = pane.addFolder({ title: 'Bake' });
  bake.addBinding(BAKE_GAUGE, 'x', { min: 0, max: 2048, step: 1 });
  bake.addBinding(BAKE_GAUGE, 'y', { min: 0, max: 1536, step: 1 });
  bake.addBinding(scene, 'bakeLevel', { readonly: true });
  bake.addBinding(BAKE, 'secondsToBurnt', { min: 1, max: 40 });
  bake.addBinding(BAKE_GAUGE, 'sweep', { min: 0, max: Math.PI / 2 });

  const save = pane.addButton({ title: 'Save to config.ts' });
  save.on('click', async () => {
    // The config file change triggers a page reload with the saved values
    const res = await fetch(TUNING_SAVE_ENDPOINT, { method: 'POST', body: JSON.stringify({ DOUGH, SAUCE, BAKE, BAKE_GAUGE, DRAGON, FIRE, BIN_LAYOUT, HELD }) });
    save.title = res.ok ? 'Saved' : `Save failed: ${await res.text()}`;
  });
}
