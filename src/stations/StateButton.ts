import { Sprite } from 'pixi.js';
import { artTexture } from '../core/art';

/** Buttons drawn in every state, as <art>_<state> art on one shared canvas. */
type ButtonArt = 'bake_button' | 'serve_button';
/** Center and drawn width, design px; read live so the tuning panel can move it. */
type ButtonPlace = { x: number; y: number; width: number };

/** A drawn button that shows whether it's enabled and pressed; the owner decides both. */
export class StateButton extends Sprite {
  constructor(
    private readonly art: ButtonArt,
    private readonly place: ButtonPlace,
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
    this.position.set(this.place.x, this.place.y);
    this.scale.set(this.place.width / this.texture.width);
  }
}
