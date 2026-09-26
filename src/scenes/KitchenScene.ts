import { Container, Graphics, Point, type FederatedPointerEvent } from 'pixi.js';
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
import { easeInQuad } from '../core/easing';
import { Dough } from '../stations/Dough';
import { DoughBowl, makeDoughBall } from '../stations/DoughBowl';
import { IngredientBin } from '../stations/IngredientBin';
import { makeLabel } from '../ui/makeLabel';

const OUTLINE = { width: OUTLINE_WIDTH, color: COLORS.outline };

type DoughPhase = 'inBowl' | 'held' | 'dropping' | 'onPeel';

/** Greybox layout of the main play screen. Placeholder shapes until real art lands. */
export class KitchenScene extends Container {
  readonly dough = new Dough();
  private readonly bowl = new DoughBowl();
  private readonly heldBall = makeDoughBall();
  private readonly bins: IngredientBin[] = [];
  private readonly pointer = new Point();
  private readonly peelCenter = new Point(PEEL.x + PEEL.width / 2, PEEL.y + PEEL.height / 2);
  private readonly dropFrom = new Point();
  private dropElapsed = 0;
  private doughPhase: DoughPhase = 'inBowl';
  private sauceReady = false;

  constructor(unlocked: ReadonlySet<IngredientId>) {
    super();
    this.addChild(new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(COLORS.table));
    this.buildBins(unlocked);
    this.buildPeel();
    this.dough.position.copyFrom(this.peelCenter);
    this.addChild(this.dough, this.bowl);
    this.buildBakeMeter();
    this.buildDragon();
    this.buildServeButton();
    this.heldBall.eventMode = 'none';
    this.addChild(this.heldBall);

    // Track the pointer everywhere so the held ball can follow it
    this.eventMode = 'static';
    this.on('globalpointermove', this.trackPointer, this);
    this.bowl.on('pointerdown', this.pickUpDough, this);

    this.resetDough();
  }

  /** Back to an empty peel with the dough ball in its bowl. */
  resetDough(): void {
    this.doughPhase = 'inBowl';
    this.bowl.setFilled(true);
    this.heldBall.visible = false;
    this.dough.reset();
    this.dough.setPlaced(false);
  }

  update(dt: number): void {
    if (this.doughPhase === 'dropping') this.updateDrop(dt);
    this.dough.update(dt);

    const sauceReady = this.doughPhase === 'onPeel' && this.dough.coverage >= DOUGH.sauceCoverage;
    if (sauceReady !== this.sauceReady) {
      this.sauceReady = sauceReady;
      this.applyAvailability();
    }
  }

  private trackPointer(e: FederatedPointerEvent): void {
    this.toLocal(e.global, undefined, this.pointer);
    // Move in the event itself, not next frame, so the held ball sticks to the pointer
    if (this.doughPhase === 'held') this.heldBall.position.copyFrom(this.pointer);
  }

  private pickUpDough(e: FederatedPointerEvent): void {
    if (this.doughPhase !== 'inBowl') return;
    this.trackPointer(e);
    this.doughPhase = 'held';
    this.bowl.setFilled(false);
    this.heldBall.position.copyFrom(this.pointer);
    this.heldBall.visible = true;
  }

  private dropDough(): void {
    if (this.doughPhase !== 'held') return;
    this.doughPhase = 'dropping';
    this.dropFrom.copyFrom(this.heldBall.position);
    this.dropElapsed = 0;
  }

  private updateDrop(dt: number): void {
    this.dropElapsed += dt;
    const t = Math.min(1, this.dropElapsed / DOUGH.dropDuration);
    const k = easeInQuad(t);
    this.heldBall.position.set(
      this.dropFrom.x + (this.peelCenter.x - this.dropFrom.x) * k,
      this.dropFrom.y + (this.peelCenter.y - this.dropFrom.y) * k,
    );
    if (t < 1) return;

    this.doughPhase = 'onPeel';
    this.heldBall.visible = false;
    this.dough.setPlaced(true);
    this.dough.slam();
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
    peel.eventMode = 'static';
    peel.on('pointerdown', this.dropDough, this);
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
