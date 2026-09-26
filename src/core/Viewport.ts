import { Container } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config';

/** Fixed-resolution world container, letterboxed and centered to fit any screen. */
export class Viewport extends Container {
  fit(screenWidth: number, screenHeight: number): void {
    const scale = Math.min(screenWidth / DESIGN_WIDTH, screenHeight / DESIGN_HEIGHT);
    this.scale.set(scale);
    this.position.set((screenWidth - DESIGN_WIDTH * scale) / 2, (screenHeight - DESIGN_HEIGHT * scale) / 2);
  }
}
