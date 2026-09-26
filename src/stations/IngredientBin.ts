import { Container, Graphics } from 'pixi.js';
import { BINS, COLORS, DISABLED_ALPHA, OUTLINE_WIDTH, type IngredientId } from '../config';
import { makeLabel } from '../ui/makeLabel';

/** One top container; shows its unlocked ingredients as a grid of compartments. */
export class IngredientBin extends Container {
  private readonly cells = new Map<IngredientId, Container>();
  private available: ReadonlySet<IngredientId> = new Set();

  constructor(private readonly contents: readonly IngredientId[]) {
    super();
  }

  refresh(unlocked: ReadonlySet<IngredientId>): void {
    this.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.cells.clear();

    const items = this.contents.filter((id) => unlocked.has(id));
    const rows = Math.max(1, Math.ceil(items.length / BINS.columns));
    const cellWidth = BINS.width / BINS.columns;
    const cellHeight = BINS.height / rows;

    const box = new Graphics().roundRect(0, 0, BINS.width, BINS.height, BINS.cornerRadius).fill(COLORS.bin);
    for (let c = 1; c < BINS.columns; c++) {
      box.moveTo(c * cellWidth, 0).lineTo(c * cellWidth, BINS.height);
    }
    for (let r = 1; r < rows; r++) {
      box.moveTo(0, r * cellHeight).lineTo(BINS.width, r * cellHeight);
    }
    box.stroke({ width: OUTLINE_WIDTH, color: COLORS.outline });
    this.addChild(box);

    items.forEach((id, i) => {
      const col = i % BINS.columns;
      const row = Math.floor(i / BINS.columns);
      const cell = new Container();
      cell.addChild(makeLabel(id, (col + 0.5) * cellWidth, (row + 0.5) * cellHeight));
      this.cells.set(id, cell);
      this.addChild(cell);
    });
    this.applyAvailability();
  }

  /** Ingredients not in the set are shown disabled. */
  setAvailable(available: ReadonlySet<IngredientId>): void {
    this.available = available;
    this.applyAvailability();
  }

  private applyAvailability(): void {
    for (const [id, cell] of this.cells) {
      cell.alpha = this.available.has(id) ? 1 : DISABLED_ALPHA;
    }
  }
}
