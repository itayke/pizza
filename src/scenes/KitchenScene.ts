import { Container, Graphics, Point, type FederatedPointerEvent, type Rectangle } from 'pixi.js';
import {
  BAKE_METER,
  BINS,
  COLORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  DOUGH,
  FIRE,
  OUTLINE_WIDTH,
  PEEL,
  SERVE_BUTTON,
  type IngredientId,
} from '../config';
import { artPoint, artSprite } from '../core/art';
import { easeInQuad } from '../core/easing';
import { Dough, makeDoughBall } from '../stations/Dough';
import { IngredientBin } from '../stations/IngredientBin';
import { makeLabel } from '../ui/makeLabel';

const OUTLINE = { width: OUTLINE_WIDTH, color: COLORS.ink };

type DoughPhase = 'inBowl' | 'held' | 'dropping' | 'onPeel';

/** The main play screen, laid out from the art. Bake meter and Serve are still placeholders. */
export class KitchenScene extends Container {
  readonly dough = new Dough();
  private readonly background = artSprite('bg');
  private readonly heldBall = makeDoughBall();
  private readonly fire = artSprite('fire');
  private readonly bins: IngredientBin[] = [];
  private readonly pointer = new Point();
  private readonly peelCenter: Point;
  private readonly dropFrom = new Point();
  private dropElapsed = 0;
  private doughPhase: DoughPhase = 'inBowl';
  private sauceReady = false;
  private fireTime = 0;
  private fireScale = 1;

  constructor(unlocked: ReadonlySet<IngredientId>) {
    super();
    const face = artPoint('peel', PEEL.faceX, PEEL.faceY);
    this.peelCenter = new Point(face.x, face.y);

    this.background.anchor.set(0.5);
    this.background.position.set(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
    this.addChild(this.background);
    this.buildBins(unlocked);
    this.buildBowl();
    this.buildPeel();
    this.dough.position.copyFrom(this.peelCenter);
    this.addChild(this.dough);
    this.buildBakeMeter();
    this.buildDragon();
    this.buildServeButton();
    this.heldBall.eventMode = 'none';
    this.addChild(this.heldBall);

    // Track the pointer everywhere so the held ball can follow it
    this.eventMode = 'static';
    this.on('globalpointermove', this.trackPointer, this);

    this.resetDough();
    this.applyAvailability();
  }

  /** Stretch the paper to cover the screen area outside the design rect too. */
  fitBackground(screenArea: Rectangle): void {
    this.background.scale.set(Math.max(screenArea.width / DESIGN_WIDTH, screenArea.height / DESIGN_HEIGHT));
  }

  /** Back to an empty peel with the dough in its bowl. */
  resetDough(): void {
    this.doughPhase = 'inBowl';
    this.heldBall.visible = false;
    this.dough.reset();
    this.dough.setPlaced(false);
  }

  update(dt: number): void {
    if (this.doughPhase === 'dropping') this.updateDrop(dt);
    this.dough.update(dt);
    if (this.fire.visible) this.updateFire(dt);

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

  private setFiring(firing: boolean): void {
    this.fire.visible = firing;
    this.fireTime = 0;
  }

  private updateFire(dt: number): void {
    this.fireTime += dt;
    const flicker = 1 + FIRE.flickerAmount * Math.sin(this.fireTime * FIRE.flickerSpeed);
    this.fire.scale.set(this.fireScale, this.fireScale * flicker);
  }

  private applyAvailability(): void {
    const available = new Set<IngredientId>(this.sauceReady ? ['sauce'] : []);
    this.bins.forEach((bin) => bin.setAvailable(available));
  }

  private buildBins(unlocked: ReadonlySet<IngredientId>): void {
    for (const spec of BINS) {
      const bin = new IngredientBin(spec);
      bin.refresh(unlocked);
      this.bins.push(bin);
      this.addChild(bin);
    }
  }

  private buildBowl(): void {
    const bowl = artSprite('bowl');
    bowl.eventMode = 'static';
    bowl.cursor = 'pointer';
    bowl.on('pointerdown', this.pickUpDough, this);
    this.addChild(bowl, artSprite('label_dough'));
  }

  private buildPeel(): void {
    const peel = artSprite('peel');
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
    // Flame art has its round head on the left; the head sits in the mouth, tips reaching for the dough
    const mouth = artPoint('dragon', FIRE.mouthX, FIRE.mouthY);
    const dx = this.peelCenter.x - mouth.x;
    const dy = this.peelCenter.y - mouth.y;
    this.fire.anchor.set(0, 0.5);
    this.fire.position.set(mouth.x, mouth.y);
    this.fire.rotation = Math.atan2(dy, dx);
    this.fireScale = (Math.hypot(dx, dy) * FIRE.reach) / this.fire.texture.width;
    this.fire.eventMode = 'none';
    this.setFiring(false);

    const dragon = artSprite('dragon');
    dragon.eventMode = 'static';
    dragon.cursor = 'pointer';
    dragon.on('pointerdown', () => this.setFiring(true));
    for (const end of ['pointerup', 'pointerupoutside', 'pointercancel'] as const) {
      dragon.on(end, () => this.setFiring(false));
    }
    this.addChild(dragon, this.fire);
  }

  private buildServeButton(): void {
    const { x, y, width, height, cornerRadius } = SERVE_BUTTON;
    const button = new Graphics().roundRect(x, y, width, height, cornerRadius).fill(COLORS.serve).stroke(OUTLINE);
    this.addChild(button, makeLabel('Serve!', x + width / 2, y + height / 2));
  }
}
