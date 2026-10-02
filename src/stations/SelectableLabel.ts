import { Color, ColorMatrixFilter, Sprite, type PointData } from 'pixi.js';
import { SELECTED_LABEL } from '../config';
import { artPoint, artTexture, type ArtName } from '../core/art';

/** A drawn name that colors and grows while what it names is in hand. */
export class SelectableLabel extends Sprite {
  /** 0 as drawn, 1 fully marked as selected. */
  private mark = 0;
  private readonly ink = new ColorMatrixFilter();
  /** The word's center where it was drawn; it grows about it. */
  private readonly drawn: PointData;

  constructor(name: ArtName) {
    super({ texture: artTexture(name), anchor: 0.5 });
    this.drawn = artPoint(name, 0.5, 0.5);
    this.position.copyFrom(this.drawn);
  }

  /** Shift sideways from where it was drawn, design px. */
  nudge(x: number): void {
    this.position.set(this.drawn.x + x, this.drawn.y);
  }

  update(selected: boolean, dt: number): void {
    const target = selected ? 1 : 0;
    const step = SELECTED_LABEL.seconds > 0 ? dt / SELECTED_LABEL.seconds : Infinity;
    this.mark = this.mark < target ? Math.min(target, this.mark + step) : Math.max(target, this.mark - step);
    this.scale.set(1 + (SELECTED_LABEL.scale - 1) * this.mark);
    // Only marked words pay for the filter pass
    const marked = this.mark > 0;
    if (marked !== !!this.filters?.length) this.filters = marked ? [this.ink] : [];
    if (!marked) return;
    // Ink goes to the color while paper-light pixels stay light
    const [r, g, b] = new Color(SELECTED_LABEL.color).toRgbArray();
    // prettier-ignore
    this.ink.matrix = [
      1 - r, 0, 0, 0, r,
      0, 1 - g, 0, 0, g,
      0, 0, 1 - b, 0, b,
      0, 0, 0, 1, 0,
    ];
    this.ink.alpha = this.mark;
  }
}
