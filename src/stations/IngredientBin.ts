import { Container, Sprite, type FederatedPointerEvent } from 'pixi.js';
import { BIN_LAYOUT, DISABLED_ALPHA, type BINS, type IngredientId } from '../config';
import { artSprite } from '../core/art';

type BinSpec = (typeof BINS)[number];
export type PickHandler = (id: IngredientId, e: FederatedPointerEvent) => void;

/** One top container; unlocked compartments show their food, locked ones stay empty. */
export class IngredientBin extends Container {
  private readonly fills = new Map<IngredientId, Sprite>();
  private readonly art: BinSpec['art'];

  /** onPick fires on a press on a compartment's food, available or not. */
  constructor(spec: BinSpec, onPick: PickHandler) {
    super();
    this.art = spec.art;
    this.addChild(artSprite(spec.art));
    for (const id of spec.items) {
      const fill = artSprite(`fill_${id}` as const);
      fill.eventMode = 'static';
      fill.on('pointerdown', (e) => onPick(id, e));
      this.fills.set(id, fill);
      this.addChild(fill);
    }
    this.addChild(artSprite(spec.label));
  }

  /** Apply the nudge and enabled flag from BIN_LAYOUT, if it has entries for this bin. */
  layout(): void {
    const values = BIN_LAYOUT as Record<string, number | boolean | undefined>;
    this.position.set(Number(values[`${this.art}X`] ?? 0), Number(values[`${this.art}Y`] ?? 0));
    // Hidden bins aren't hit-tested either
    this.visible = values[`${this.art}Enabled`] !== false;
  }

  refresh(unlocked: ReadonlySet<IngredientId>): void {
    for (const [id, fill] of this.fills) fill.visible = unlocked.has(id);
  }

  /** Ingredients not in the set are shown faded. */
  setAvailable(available: ReadonlySet<IngredientId>): void {
    for (const [id, fill] of this.fills) {
      fill.alpha = available.has(id) ? 1 : DISABLED_ALPHA;
      fill.cursor = available.has(id) ? 'pointer' : 'default';
    }
  }
}
