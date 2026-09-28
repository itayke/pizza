import { Container, Graphics, Point, Sprite, type FederatedPointerEvent, type Rectangle, type Renderer } from 'pixi.js';
import {
  BAKE,
  BINS,
  CHEESE,
  COLORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  DOUGH,
  DRAGON,
  FIRE,
  HELD,
  OUTLINE_WIDTH,
  PEEL,
  SERVE_BUTTON,
  type IngredientId,
} from '../config';
import { artPoint, artSprite, artTexture, type ArtName } from '../core/art';
import { easeInQuad } from '../core/easing';
import { BakeGauge } from '../stations/BakeGauge';
import { Dough, makeDoughBall } from '../stations/Dough';
import { IngredientBin } from '../stations/IngredientBin';
import { makeLabel } from '../ui/makeLabel';

const OUTLINE = { width: OUTLINE_WIDTH, color: COLORS.ink };
// Cursor art per ingredient in hand; others show nothing yet
const HELD_ART: Partial<Record<IngredientId, ArtName>> = { sauce: 'held_sauce', cheese: 'held_cheese' };
// Unlocked once the dough is rolled out
const TOPPINGS_READY: readonly IngredientId[] = ['sauce', 'cheese'];

type DoughPhase = 'inBowl' | 'held' | 'dropping' | 'onPeel';

/** The main play screen, laid out from the art. Serve is still a placeholder. */
export class KitchenScene extends Container {
  readonly dough: Dough;
  /** Doneness, raw at 0 to burnt at 1. */
  bakeLevel = 0;
  private readonly gauge = new BakeGauge();
  private readonly background = artSprite('bg');
  private readonly heldBall = makeDoughBall();
  private readonly held = new Sprite();
  private readonly fire = artSprite('fire');
  private readonly dragon = artSprite('dragon');
  private readonly bins: IngredientBin[] = [];
  private readonly pointer = new Point();
  private readonly peelCenter: Point;
  private readonly dropFrom = new Point();
  private readonly strokeEnd = new Point();
  private dropElapsed = 0;
  private doughPhase: DoughPhase = 'inBowl';
  private doughReady = false;
  private available = new Set<IngredientId>();
  /** Ingredient in hand, picked from its bin. */
  private tool: IngredientId | null = null;
  private painting = false;
  private fireTime = 0;
  private fireScale = 1;

  constructor(unlocked: ReadonlySet<IngredientId>, renderer: Renderer) {
    super();
    this.dough = new Dough(renderer);
    const face = artPoint('peel', PEEL.faceX, PEEL.faceY);
    this.peelCenter = new Point(face.x, face.y);

    this.background.anchor.set(0.5);
    this.background.position.set(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
    // Interactive so a press anywhere reaches the scene (painting)
    this.background.eventMode = 'static';
    this.addChild(this.background);
    this.buildBins(unlocked);
    this.buildBowl();
    this.buildPeel();
    this.dough.position.copyFrom(this.peelCenter);
    this.addChild(this.dough);
    this.addChild(this.gauge);
    this.buildDragon();
    this.buildServeButton();
    this.heldBall.eventMode = 'none';
    this.held.anchor.set(0.5);
    this.held.eventMode = 'none';
    this.addChild(this.heldBall, this.held);

    // Track the pointer everywhere so held things can follow it
    this.eventMode = 'static';
    this.on('globalpointermove', this.trackPointer, this);
    this.on('pointerdown', this.startPainting, this);
    this.on('pointerup', this.stopPainting, this);
    this.on('pointerupoutside', this.stopPainting, this);

    this.setTool(null);
    this.resetDough();
    this.applyAvailability();
  }

  /** Stretch the paper to cover the screen area outside the design rect too. */
  fitBackground(screenArea: Rectangle): void {
    this.background.scale.set(Math.max(screenArea.width / DESIGN_WIDTH, screenArea.height / DESIGN_HEIGHT));
  }

  /** Back to an empty peel with the dough in its bowl. */
  resetDough(): void {
    this.bakeLevel = 0;
    this.doughPhase = 'inBowl';
    this.heldBall.visible = false;
    this.dough.reset();
    this.dough.setPlaced(false);
  }

  /** Testing shortcut: place the dough, then roll it out to the rim. */
  skipStep(): void {
    if (this.doughPhase !== 'onPeel') {
      this.doughPhase = 'onPeel';
      this.heldBall.visible = false;
      this.dough.setPlaced(true);
      this.dough.slam();
    } else {
      this.dough.flattenToRim();
    }
  }

  update(dt: number): void {
    if (this.doughPhase === 'dropping') this.updateDrop(dt);
    this.dough.update(dt);
    // Rolled out enough for toppings and baking
    const doughReady = this.doughPhase === 'onPeel' && this.dough.coverage >= DOUGH.sauceCoverage;
    if (doughReady !== this.doughReady) {
      this.doughReady = doughReady;
      this.applyAvailability();
    }

    if (this.painting) this.applyTool(dt);

    if (this.fire.visible) {
      this.updateFire(dt);
      if (this.doughReady) this.bakeLevel = Math.min(1, this.bakeLevel + dt / BAKE.secondsToBurnt);
    }
    this.gauge.setLevel(this.bakeLevel);
    this.dough.setBake(this.bakeLevel);
  }

  private trackPointer(e: FederatedPointerEvent): void {
    this.toLocal(e.global, undefined, this.pointer);
    // Move in the event itself, not next frame, so held things stick to the pointer
    if (this.doughPhase === 'held') this.heldBall.position.copyFrom(this.pointer);
    if (this.tool) this.held.position.copyFrom(this.pointer);
  }

  /** Tap a bin to take its ingredient, tap it again to put it back. */
  private pickIngredient(id: IngredientId, e: FederatedPointerEvent): void {
    this.trackPointer(e);
    if (this.tool === id) this.setTool(null);
    else if (this.available.has(id)) this.setTool(id);
  }

  private setTool(tool: IngredientId | null): void {
    this.tool = tool;
    this.painting = false;
    const art = tool && HELD_ART[tool];
    this.held.visible = !!art;
    if (art) this.held.texture = artTexture(art);
    this.held.scale.set(HELD.scale);
    this.held.position.copyFrom(this.pointer);
    this.dough.setKneadable(tool === null);
  }

  /** A press with an ingredient in hand paints until release; this also catches a drag straight from the bin. */
  private startPainting(e: FederatedPointerEvent): void {
    if (!this.tool) return;
    this.trackPointer(e);
    this.painting = true;
    this.strokeEnd.copyFrom(this.pointer);
    this.dough.toppings.beginStroke();
  }

  private stopPainting(): void {
    this.painting = false;
  }

  /** Sauce paints along the stroke; cheese scatters pieces. */
  private applyTool(dt: number): void {
    const from = this.dough.toLocal(this.strokeEnd, this);
    const to = this.dough.toLocal(this.pointer, this);
    if (this.tool === 'sauce') this.dough.paintSauce(from, to);
    else if (this.tool === 'cheese') this.dough.toppings.scatter('cheese', CHEESE, from, to, dt);
    this.strokeEnd.copyFrom(this.pointer);
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

  /** Dragging the dough from the bowl and letting go inside the rim places it too. */
  private releaseOverPeel(e: FederatedPointerEvent): void {
    this.trackPointer(e);
    const { x, y } = this.pointer;
    if (Math.hypot(x - this.peelCenter.x, y - this.peelCenter.y) <= DOUGH.rimRadius) this.dropDough();
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
    this.available = new Set<IngredientId>(this.doughReady ? TOPPINGS_READY : []);
    this.bins.forEach((bin) => bin.setAvailable(this.available));
    if (this.tool && !this.available.has(this.tool)) this.setTool(null);
  }

  layoutBins(): void {
    this.bins.forEach((bin) => bin.layout());
  }

  private buildBins(unlocked: ReadonlySet<IngredientId>): void {
    for (const spec of BINS) {
      const bin = new IngredientBin(spec, (id, e) => this.pickIngredient(id, e));
      bin.refresh(unlocked);
      this.bins.push(bin);
      this.addChild(bin);
      bin.layout();
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
    peel.on('pointerup', this.releaseOverPeel, this);
    this.addChild(peel);
  }

  /** Place the dragon from config and aim the fire from its mouth at the dough. */
  layoutDragon(): void {
    const { dragon, fire } = this;
    dragon.anchor.set(DRAGON.pivotX, DRAGON.pivotY);
    dragon.scale.set(DRAGON.scale);
    dragon.position.set(DRAGON.x, DRAGON.y);
    dragon.angle = DRAGON.angle;
    // Mouth relative to the pivot, scaled and rotated with the dragon
    const offsetX = (FIRE.mouthX - DRAGON.pivotX) * dragon.texture.width * DRAGON.scale;
    const offsetY = (FIRE.mouthY - DRAGON.pivotY) * dragon.texture.height * DRAGON.scale;
    const cos = Math.cos(dragon.rotation);
    const sin = Math.sin(dragon.rotation);
    const mouthX = DRAGON.x + offsetX * cos - offsetY * sin;
    const mouthY = DRAGON.y + offsetX * sin + offsetY * cos;
    // Flame art has its round head on the left; the head sits in the mouth, tips reaching for the dough
    const dx = this.peelCenter.x - mouthX;
    const dy = this.peelCenter.y - mouthY;
    fire.position.set(mouthX, mouthY);
    fire.rotation = Math.atan2(dy, dx);
    this.fireScale = (Math.hypot(dx, dy) * FIRE.reach) / fire.texture.width;
  }

  private buildDragon(): void {
    this.fire.anchor.set(0, 0.5);
    this.fire.eventMode = 'none';
    this.setFiring(false);
    this.layoutDragon();

    const { dragon } = this;
    dragon.eventMode = 'static';
    dragon.cursor = 'pointer';
    // Baking puts down whatever ingredient is in hand
    dragon.on('pointerdown', () => {
      this.setTool(null);
      this.setFiring(true);
    });
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
