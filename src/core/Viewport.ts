import { Container, Rectangle } from 'pixi.js';
import { DESIGN_HEIGHT } from '../config';

/**
 * World container showing the full design height, centered: extra width shows side margins, less clips the sides, down
 * to a least visible width, past which it shrinks to keep that width, with margins top and bottom.
 */
export class Viewport extends Container {
  /** The whole screen in design coordinates, margins included. */
  readonly screenArea = new Rectangle();

  /** Fit a design area width design px wide, always showing at least minWidth of it. */
  fit(screenWidth: number, screenHeight: number, width: number, minWidth: number): void {
    const scale = Math.min(screenHeight / DESIGN_HEIGHT, screenWidth / minWidth);
    this.scale.set(scale);
    this.position.set((screenWidth - width * scale) / 2, (screenHeight - DESIGN_HEIGHT * scale) / 2);
    this.screenArea.x = -this.position.x / scale;
    this.screenArea.y = -this.position.y / scale;
    this.screenArea.width = screenWidth / scale;
    this.screenArea.height = screenHeight / scale;
  }
}
