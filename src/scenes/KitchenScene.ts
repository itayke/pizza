import { Container, Graphics } from 'pixi.js';
import {
  BAKE_METER,
  BINS,
  COLORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  DOUGH,
  DRAGON,
  OUTLINE_WIDTH,
  PEEL,
  SERVE_BUTTON,
  type IngredientId,
} from '../config';
import { Dough } from '../stations/Dough';
import { IngredientBin } from '../stations/IngredientBin';
import { makeLabel } from '../ui/makeLabel';

const OUTLINE = { width: OUTLINE_WIDTH, color: COLORS.outline };

/** Greybox layout of the main play screen. Placeholder shapes until real art lands. */
export class KitchenScene extends Container {
  readonly dough = new Dough();
  private readonly bins: IngredientBin[] = [];
  private sauceReady = false;

  constructor(unlocked: ReadonlySet<IngredientId>) {
    super();
    this.addChild(new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(COLORS.table));
    this.buildBins(unlocked);
    this.buildPeel();
    this.dough.position.set(PEEL.x + PEEL.width / 2, PEEL.y + PEEL.height / 2);
    this.addChild(this.dough);
    this.buildBakeMeter();
    this.buildDragon();
    this.buildServeButton();
    this.applyAvailability();
  }

  update(dt: number): void {
    this.dough.update(dt);
    const sauceReady = this.dough.coverage >= DOUGH.sauceCoverage;
    if (sauceReady !== this.sauceReady) {
      this.sauceReady = sauceReady;
      this.applyAvailability();
    }
  }

  private applyAvailability(): void {
    const available = new Set<IngredientId>(this.sauceReady ? ['sauce'] : []);
    this.bins.forEach((bin) => bin.setAvailable(available));
  }

  private buildBins(unlocked: ReadonlySet<IngredientId>): void {
    const count = BINS.containers.length;
    const gap = (DESIGN_WIDTH - count * BINS.width) / (count + 1);

    BINS.containers.forEach((contents, i) => {
      const bin = new IngredientBin(contents);
      bin.position.set(gap + i * (BINS.width + gap), BINS.top);
      bin.refresh(unlocked);
      this.bins.push(bin);
      this.addChild(bin);
    });
  }

  private buildPeel(): void {
    const { x, y, width, height, cornerRadius, handleWidth, handleLength, holeRadius } = PEEL;
    const centerX = x + width / 2;
    const handleRadius = handleWidth / 2;
    const handleBottom = y + height + handleLength;

    // Handle starts under the body so only its rounded bottom end shows
    const peel = new Graphics()
      .roundRect(centerX - handleRadius, y + height - handleRadius, handleWidth, handleLength + handleRadius, handleRadius)
      .fill(COLORS.peel)
      .stroke(OUTLINE)
      .roundRect(x, y, width, height, cornerRadius)
      .fill(COLORS.peel)
      .stroke(OUTLINE)
      .circle(centerX, handleBottom - handleRadius, holeRadius)
      .fill(COLORS.table)
      .stroke(OUTLINE);
    this.addChild(peel);
  }

  private buildBakeMeter(): void {
    const { x, y, width, height, targetMin, targetMax } = BAKE_METER;
    // Meter fills bottom-up, so the target zone is measured from the bottom
    const zoneTop = y + height * (1 - targetMax);
    const zoneHeight = height * (targetMax - targetMin);
    const meter = new Graphics()
      .rect(x, y, width, height)
      .fill(COLORS.meterBg)
      .rect(x, zoneTop, width, zoneHeight)
      .fill(COLORS.meterTarget);
    this.addChild(meter);
  }

  private buildDragon(): void {
    const { x, y, width, height } = DRAGON;
    const dragon = new Graphics()
      .ellipse(x + width / 2, y + height / 2, width / 2, height / 2)
      .fill(COLORS.dragon)
      .stroke(OUTLINE);
    this.addChild(dragon, makeLabel('dragon', x + width / 2, y + height / 2));
  }

  private buildServeButton(): void {
    const { x, y, width, height, cornerRadius } = SERVE_BUTTON;
    const button = new Graphics().roundRect(x, y, width, height, cornerRadius).fill(COLORS.serve).stroke(OUTLINE);
    this.addChild(button, makeLabel('Serve!', x + width / 2, y + height / 2));
  }
}
