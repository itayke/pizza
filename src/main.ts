import { Application } from 'pixi.js';
import { COLORS, STARTING_UNLOCKED } from './config';
import { Viewport } from './core/Viewport';
import { KitchenScene } from './scenes/KitchenScene';

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
  viewport.addChild(new KitchenScene(new Set(STARTING_UNLOCKED)));
  app.stage.addChild(viewport);

  viewport.fit(app.screen.width, app.screen.height);
  app.renderer.on('resize', (width: number, height: number) => viewport.fit(width, height));
}

start();
