import { Container, Sprite, type FederatedPointerEvent } from 'pixi.js';
import { DISABLED_ALPHA, type BINS, type IngredientId } from '../config';
import { artSprite } from '../core/art';

type BinSpec = (typeof BINS)[number];
export type PickHandler = (id: IngredientId, e: FederatedPointerEvent) => void;

/** One top container; unlocked compartments show their food, locked ones stay empty. */
export class IngredientBin extends Container {
  private readonly fills = new Map<IngredientId, Sprite>();

  /** onPick fires on a press on a compartment's food, available or not. */
  constructor(spec: BinSpec, onPick: PickHandler) {
    super();
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
