import { Container, Rectangle } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config';

/** World container showing the whole stage, centered: whichever way the screen is out of proportion shows margins. */
export class Viewport extends Container {
  /** The whole screen in design coordinates, margins included. */
  readonly screenArea = new Rectangle();

  /** Fit the whole stage to the screen. */
  fit(screenWidth: number, screenHeight: number): void {
    const scale = Math.min(screenWidth / DESIGN_WIDTH, screenHeight / DESIGN_HEIGHT);
    this.scale.set(scale);
    this.position.set((screenWidth - DESIGN_WIDTH * scale) / 2, (screenHeight - DESIGN_HEIGHT * scale) / 2);
    this.screenArea.x = -this.position.x / scale;
    this.screenArea.y = -this.position.y / scale;
    this.screenArea.width = screenWidth / scale;
    this.screenArea.height = screenHeight / scale;
  }
}
