import { Container, Rectangle } from 'pixi.js';
import { DESIGN_HEIGHT } from '../config';

/** World container showing the whole stage, centered: whichever way the screen is out of proportion shows margins. */
export class Viewport extends Container {
  /** The whole screen in design coordinates, margins included. */
  readonly screenArea = new Rectangle();

  /** Fit a stage width design px wide and the full design height. */
  fit(screenWidth: number, screenHeight: number, width: number): void {
    const scale = Math.min(screenWidth / width, screenHeight / DESIGN_HEIGHT);
    this.scale.set(scale);
    this.position.set((screenWidth - width * scale) / 2, (screenHeight - DESIGN_HEIGHT * scale) / 2);
    this.screenArea.x = -this.position.x / scale;
    this.screenArea.y = -this.position.y / scale;
    this.screenArea.width = screenWidth / scale;
    this.screenArea.height = screenHeight / scale;
  }
}
