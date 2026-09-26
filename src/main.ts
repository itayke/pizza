import { Application } from 'pixi.js';
import { COLORS, STARTING_UNLOCKED } from './config';
import { Viewport } from './core/Viewport';
import { KitchenScene } from './scenes/KitchenScene';

const MS_PER_SECOND = 1000;

async function start(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: COLORS.letterbox,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
  });
  document.body.appendChild(app.canvas);

  const viewport = new Viewport();
  const scene = new KitchenScene(new Set(STARTING_UNLOCKED));
  viewport.addChild(scene);
  app.stage.addChild(viewport);
  app.ticker.add((ticker) => scene.update(ticker.deltaMS / MS_PER_SECOND));

  viewport.fit(app.screen.width, app.screen.height);
  app.renderer.on('resize', (width: number, height: number) => viewport.fit(width, height));

  if (import.meta.env.DEV) {
    const { createTuningPanel } = await import('./dev/tuningPanel');
    createTuningPanel(scene);
  }
}

start();
