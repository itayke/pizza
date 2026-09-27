import { Pane } from 'tweakpane';
import { DOUGH } from '../config';
import type { KitchenScene } from '../scenes/KitchenScene';
import { TUNING_SAVE_ENDPOINT } from './tuningEndpoint';

const RESET_KEY = 'r';

/** Dev-only live tuning. Edits config objects in place; values reset on reload. */
export function createTuningPanel(scene: KitchenScene): void {
  const pane = new Pane({ title: 'Tuning' });
  const resetDough = () => scene.resetDough();

  pane.addButton({ title: `Reset dough (${RESET_KEY.toUpperCase()})` }).on('click', resetDough);
  const save = pane.addButton({ title: 'Save to config.ts' });
  save.on('click', async () => {
    // The config file change triggers a page reload with the saved values
    const res = await fetch(TUNING_SAVE_ENDPOINT, { method: 'POST', body: JSON.stringify({ DOUGH }) });
    save.title = res.ok ? 'Saved' : `Save failed: ${await res.text()}`;
  });
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === RESET_KEY) resetDough();
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
}
