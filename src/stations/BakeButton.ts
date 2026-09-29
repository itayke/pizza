import { Sprite } from 'pixi.js';
import { BAKE_BUTTON } from '../config';
import { artTexture } from '../core/art';

/** Round bake button: pressed while fire is breathing, greyed out until the dough can bake. */
export class BakeButton extends Sprite {
  constructor() {
    super(artTexture('bake_button_disabled'));
    this.anchor.set(0.5);
    this.eventMode = 'static';
    this.layout();
  }

  /** Show the state; a disabled button shows so even while fire breathes from the dragon. */
  setState(enabled: boolean, pressed: boolean): void {
    this.texture = artTexture(!enabled ? 'bake_button_disabled' : pressed ? 'bake_button_pressed' : 'bake_button_unpressed');
    this.cursor = enabled ? 'pointer' : 'default';
  }

  /** Follows config live for the tuning panel. */
  layout(): void {
    this.position.set(BAKE_BUTTON.x, BAKE_BUTTON.y);
    this.scale.set(BAKE_BUTTON.width / this.texture.width);
  }
}
