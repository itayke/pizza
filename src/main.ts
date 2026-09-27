import { Application } from 'pixi.js';
import { COLORS, MAX_RESOLUTION, STARTING_UNLOCKED } from './config';
import { loadArt } from './core/art';
import { Viewport } from './core/Viewport';
import { KitchenScene } from './scenes/KitchenScene';

const MS_PER_SECOND = 1000;

async function start(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: COLORS.paper,
    // The dough mesh shader is GLSL only
    preference: 'webgl',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, MAX_RESOLUTION),
  });
  document.body.appendChild(app.canvas);
  await loadArt();

  const viewport = new Viewport();
  const scene = new KitchenScene(new Set(STARTING_UNLOCKED), app.renderer);
  viewport.addChild(scene);
  app.stage.addChild(viewport);
  app.ticker.add((ticker) => scene.update(ticker.deltaMS / MS_PER_SECOND));

  const fit = (width: number, height: number) => {
    viewport.fit(width, height);
    scene.fitBackground(viewport.screenArea);
  };
  fit(app.screen.width, app.screen.height);
  app.renderer.on('resize', fit);

  if (import.meta.env.DEV) {
    const { createTuningPanel } = await import('./dev/tuningPanel');
    createTuningPanel(scene);
  }
}

start();
