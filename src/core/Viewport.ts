import { Container, Rectangle } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config';

/** Fixed-resolution world container, letterboxed and centered to fit any screen. */
export class Viewport extends Container {
  /** The whole screen in design coordinates, including the letterbox margins. */
  readonly screenArea = new Rectangle();

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
