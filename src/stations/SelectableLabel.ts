import { SELECTED_LABEL } from '../config';
import { Label } from './Label';

/** A label that colors and grows while what it names is in hand. */
export class SelectableLabel extends Label {
  /** 0 as written, 1 fully marked as selected. */
  private mark = 0;

  update(selected: boolean, dt: number): void {
    const target = selected ? 1 : 0;
    const step = SELECTED_LABEL.seconds > 0 ? dt / SELECTED_LABEL.seconds : Infinity;
    this.mark = this.mark < target ? Math.min(target, this.mark + step) : Math.max(target, this.mark - step);
    this.scale.set(this.unscale * (1 + (SELECTED_LABEL.scale - 1) * this.mark));
    this.inkToward(this.mark, SELECTED_LABEL.color);
  }
}
