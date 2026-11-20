import { Sprite } from 'pixi.js';
import { artTexture } from '../core/art';

/** Buttons drawn in every state, as <art>_<state> art on one shared canvas. */
type ButtonArt = 'bake_button' | 'serve_button';

/** A drawn button that shows whether it's enabled and pressed; the owner decides both. */
export class StateButton extends Sprite {
  constructor(
    private readonly art: ButtonArt,
    /** Drawn width, design px; read on layout so the tuning panel can size it. */
    private readonly drawnWidth: () => number,
  ) {
    super(artTexture(`${art}_disabled`));
    this.anchor.set(0.5);
    this.eventMode = 'static';
    this.layout();
  }

  /** A disabled button shows so even while pressed. */
  setState(enabled: boolean, pressed: boolean): void {
    this.texture = artTexture(`${this.art}_${!enabled ? 'disabled' : pressed ? 'pressed' : 'unpressed'}`);
    this.cursor = enabled ? 'pointer' : 'default';
  }

  layout(): void {
    this.scale.set(this.drawnWidth() / this.texture.width);
  }
}
