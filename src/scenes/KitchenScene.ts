import { Container, Point, Sprite, type FederatedPointerEvent, type Rectangle, type Renderer } from 'pixi.js';
import {
  BAKE,
  BAKE_BUTTON,
  BINS,
  BOWL,
  CHEESE,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  DOUGH,
  DRAGON,
  FIRE,
  HELD,
  INGREDIENT_IDS,
  PEEL,
  PIECES,
  PULSE,
  SERVE_BUTTON,
  SKIP,
  TOPPINGS,
  type IngredientId,
} from '../config';
import { artPoint, artSprite, artTexture } from '../core/art';
import { bakeCurve } from '../core/bake';
import { easeInQuad } from '../core/easing';
import { BakeGauge } from '../stations/BakeGauge';
import { StateButton } from '../stations/StateButton';
import { Dough, landedBallScale, makeDoughBallSprite } from '../stations/Dough';
import { IngredientBin } from '../stations/IngredientBin';
import { SelectableLabel } from '../stations/SelectableLabel';

// Unlocked once the dough is rolled out
const TOPPINGS_READY: readonly IngredientId[] = INGREDIENT_IDS;

type DoughPhase = 'inBowl' | 'held' | 'dropping' | 'onPeel';

/** The main play screen, laid out from the art. Serve is still a placeholder. */
export class KitchenScene extends Container {
  readonly dough: Dough;
  /** Doneness, raw at 0 to burnt at 1; rises steadily, and the dial shows it as is. */
  bakeLevel = 0;
  private readonly gauge = new BakeGauge();
  private readonly bakeButton = new StateButton('bake_button', BAKE_BUTTON);
  private readonly serveButton = new StateButton('serve_button', SERVE_BUTTON);
  private servePressed = false;
  private readonly background = artSprite('bg');
  private readonly peel = artSprite('peel');
  private readonly bowl = artSprite('bowl');
  private readonly bowlLabel = new SelectableLabel('label_dough');
  /** The dough ball: waits in the bowl, is carried by hand, then drops onto the peel where the dough takes over. */
  private readonly doughBall = makeDoughBallSprite();
  /** Where and how large the ball sits in the bowl. */
  private readonly ballRest = new Point();
  private ballRestScale = 1;
  /** Ball position relative to the pointer, kept from where it was grabbed. */
  private readonly grabOffset = new Point();
  private dropFromScale = 1;
  private readonly held = new Container();
  private readonly heldArt = new Sprite({ anchor: 0.5 });
  /** Additive copy of the held art that brightens it while pressed. */
  private readonly heldGlow = new Sprite({ anchor: 0.5, blendMode: 'add', alpha: 0 });
  private readonly fire = artSprite('fire');
  private readonly dragon = artSprite('dragon');
  private readonly bins: IngredientBin[] = [];
  private readonly pointer = new Point();
  private readonly peelCenter = new Point();
  private readonly dropFrom = new Point();
  private readonly strokeEnd = new Point();
  private dropElapsed = 0;
  private doughPhase: DoughPhase = 'inBowl';
  private doughReady = false;
  /** Baked past the toppings cutoff; toppings stay closed until the next pizza. */
  private toppingsClosed = false;
  private available = new Set<IngredientId>();
  /** Ingredient in hand, picked from its bin. */
  private tool: IngredientId | null = null;
  /** The last pointer was a finger; a finger covers the cursor, so the held ingredient hides. */
  private touch = false;
  private painting = false;
  private fireTime = 0;
  private fireScale = 1;

  constructor(unlocked: ReadonlySet<IngredientId>, renderer: Renderer) {
    super();
    this.dough = new Dough(renderer);

    this.background.anchor.set(0.5);
    this.background.position.set(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
    // Interactive so a press anywhere reaches the scene (painting)
    this.background.eventMode = 'static';
    this.addChild(this.background);
    this.buildBins(unlocked);
    this.buildBowl();
    this.buildPeel();
    this.addChild(this.dough);
    this.addChild(this.gauge);
    this.buildDragon();
    this.buildBakeButton();
    this.buildServeButton();
    // Presses on the ball go to whatever is under it: the bowl, or the peel to drop it
    this.doughBall.eventMode = 'none';
    this.held.addChild(this.heldArt, this.heldGlow);
    this.held.eventMode = 'none';
    this.addChild(this.doughBall, this.held);

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
    this.toppingsClosed = false;
    this.doughPhase = 'inBowl';
    this.restBall();
    this.dough.reset();
    this.dough.setPlaced(false);
  }

  /** Testing shortcut, a step per press: place the dough, roll it out to the rim, then sauce it, then cheese it once. */
  skipStep(): void {
    if (this.doughPhase !== 'onPeel') {
      this.doughPhase = 'onPeel';
      this.doughBall.visible = false;
      this.dough.setPlaced(true);
      this.dough.slam();
    } else if (!this.doughReady) {
      this.dough.flattenToRim();
    } else if (this.dough.sauce.coverage <= SKIP.cheeseAfterSauce) {
      if (this.available.has('sauce')) this.dough.fillSauce();
    } else if (this.available.has('cheese') && !this.dough.toppings.has('cheese')) {
      this.dough.fillToppings('cheese', CHEESE);
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
    if (!this.toppingsClosed && this.bakeLevel > BAKE.toppingsCutoff) {
      this.toppingsClosed = true;
      this.applyAvailability();
    }
    this.updateGlow(dt);
    this.bins.forEach((bin) => bin.update(this.tool, dt));
    this.bowlLabel.update(this.doughPhase === 'held', dt);
    const inBowl = this.doughPhase === 'inBowl';
    this.bowl.cursor = inBowl ? 'pointer' : 'default';
    this.gauge.setLevel(this.bakeLevel);
    this.bakeButton.layout();
    this.bakeButton.setState(this.doughReady, this.fire.visible);
    this.serveButton.layout();
    this.serveButton.setState(this.canServe(), this.servePressed);
    // The art eases through the bake, lingering around the optimal level
    this.dough.setBake(bakeCurve(this.bakeLevel));
  }

  /** The held ingredient's glow fades up while pressed and back out once released. */
  private updateGlow(dt: number): void {
    const target = this.painting ? PULSE.strength : 0;
    const step = PULSE.seconds > 0 ? (PULSE.strength * dt) / PULSE.seconds : Infinity;
    const alpha = this.heldGlow.alpha;
    this.heldGlow.alpha = alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
  }

  private trackPointer(e: FederatedPointerEvent): void {
    this.toLocal(e.global, undefined, this.pointer);
    this.touch = e.pointerType === 'touch';
    this.held.visible = !!this.tool && !this.touch;
    // Move in the event itself, not next frame, so held things stick to the pointer
    if (this.doughPhase === 'held') {
      this.doughBall.position.set(this.pointer.x + this.grabOffset.x, this.pointer.y + this.grabOffset.y);
    }
    if (this.tool) this.held.position.copyFrom(this.pointer);
  }

  /** Tap a bin to take its ingredient, tap it again to put it back. The press never reaches the pizza. */
  private pickIngredient(id: IngredientId, e: FederatedPointerEvent): void {
    e.stopPropagation();
    this.trackPointer(e);
    if (this.tool === id) this.setTool(null);
    else if (this.available.has(id)) this.setTool(id);
  }

  private setTool(tool: IngredientId | null): void {
    this.tool = tool;
    this.painting = false;
    this.held.visible = !!tool && !this.touch;
    // Sauce has its own cursor art; toppings show the raw piece they drop, larger than it lands
    if (tool === 'sauce') {
      this.heldArt.texture = artTexture('held_sauce');
      this.held.scale.set(HELD.scale);
    } else if (tool) {
      this.heldArt.texture = artTexture(`topping_${tool}_raw`);
      this.held.scale.set(TOPPINGS.scale * HELD.pieceScale);
    }
    this.heldGlow.texture = this.heldArt.texture;
    this.heldGlow.alpha = 0;
    this.held.position.copyFrom(this.pointer);
    this.dough.setKneadable(tool === null);
  }

  /** A press on the peel with an ingredient in hand paints until release; presses elsewhere are ignored. */
  private startPainting(e: FederatedPointerEvent): void {
    if (!this.tool || !this.peel.getBounds().containsPoint(e.global.x, e.global.y)) return;
    this.trackPointer(e);
    this.painting = true;
    this.strokeEnd.copyFrom(this.pointer);
    this.dough.toppings.beginStroke();
    // The first stamp or piece lands on the press itself, even if released before the next frame
    this.applyTool(0);
  }

  private stopPainting(): void {
    this.painting = false;
  }

  /** Sauce paints along the stroke; cheese scatters pieces; whole toppings repeat while held. */
  private applyTool(dt: number): void {
    const from = this.dough.toLocal(this.strokeEnd, this);
    const to = this.dough.toLocal(this.pointer, this);
    if (this.tool === 'sauce') this.dough.paintSauce(from, to);
    else if (this.tool === 'cheese') this.dough.toppings.scatter('cheese', CHEESE, from, to, dt);
    else if (this.tool) this.dough.toppings.repeat(this.tool, PIECES, to, dt);
    this.strokeEnd.copyFrom(this.pointer);
  }

  private pickUpDough(e: FederatedPointerEvent): void {
    if (this.doughPhase !== 'inBowl') return;
    this.trackPointer(e);
    this.doughPhase = 'held';
    this.grabOffset.set(this.doughBall.x - this.pointer.x, this.doughBall.y - this.pointer.y);
  }

  private dropDough(): void {
    if (this.doughPhase !== 'held') return;
    this.doughPhase = 'dropping';
    this.dropFrom.copyFrom(this.doughBall.position);
    this.dropFromScale = this.doughBall.scale.x;
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
    // The same ball falls to the peel's center, shrinking to the dough's landing size
    this.doughBall.position.set(
      this.dropFrom.x + (this.peelCenter.x - this.dropFrom.x) * k,
      this.dropFrom.y + (this.peelCenter.y - this.dropFrom.y) * k,
    );
    this.doughBall.scale.set(this.dropFromScale + (landedBallScale() - this.dropFromScale) * k);
    if (t < 1) return;

    this.doughPhase = 'onPeel';
    this.doughBall.visible = false;
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
    this.available = new Set<IngredientId>(this.doughReady && !this.toppingsClosed ? TOPPINGS_READY : []);
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
    const { bowl } = this;
    bowl.eventMode = 'static';
    bowl.on('pointerdown', this.pickUpDough, this);
    this.addChild(bowl, this.bowlLabel);
    this.layoutBowl();
  }

  /** Place the bowl, its dough and its label from config. */
  layoutBowl(): void {
    const drawn = artPoint('bowl', 0, 0);
    this.bowl.position.set(drawn.x + BOWL.x, drawn.y + BOWL.y);
    // The label sits by its center, which it grows about
    const label = artPoint('label_dough', 0.5, 0.5);
    this.bowlLabel.position.set(label.x + BOWL.x + BOWL.labelX, label.y + BOWL.y + BOWL.labelY);
    const center = artPoint('bowl', 0.5, 0.5);
    this.ballRest.set(center.x + BOWL.x, center.y + BOWL.y);
    this.ballRestScale = (BOWL.fillWidth * this.bowl.width) / this.doughBall.texture.width;
    if (this.doughPhase === 'inBowl') this.restBall();
  }

  /** Put the ball back in the bowl. */
  private restBall(): void {
    this.doughBall.position.copyFrom(this.ballRest);
    this.doughBall.scale.set(this.ballRestScale);
    this.doughBall.visible = true;
  }

  private buildPeel(): void {
    const peel = this.peel;
    peel.eventMode = 'static';
    peel.on('pointerdown', this.dropDough, this);
    peel.on('pointerup', this.releaseOverPeel, this);
    this.addChild(peel);
    this.layoutPeel();
  }

  /** Place the peel from config; the dough sits on its face and the fire aims there. */
  layoutPeel(): void {
    const drawn = artPoint('peel', 0, 0);
    this.peel.position.set(drawn.x + PEEL.x, drawn.y + PEEL.y);
    const face = artPoint('peel', PEEL.faceX, PEEL.faceY);
    this.peelCenter.set(face.x + PEEL.x, face.y + PEEL.y);
    this.dough.position.copyFrom(this.peelCenter);
    this.layoutDragon();
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
    this.onFirePress(dragon, () => true);
    this.addChild(dragon, this.fire);
  }

  /** A second way to bake, disabled until the dough is rolled out. */
  private buildBakeButton(): void {
    this.onFirePress(this.bakeButton, () => this.doughReady);
    this.addChild(this.bakeButton);
  }

  /** Breathe fire while target is held, if it's enabled; baking puts down whatever ingredient is in hand. */
  private onFirePress(target: Container, enabled: () => boolean): void {
    target.on('pointerdown', (e) => {
      if (!enabled()) return;
      // Never also a press on the pizza
      e.stopPropagation();
      this.setTool(null);
      this.setFiring(true);
    });
    for (const end of ['pointerup', 'pointerupoutside', 'pointercancel'] as const) {
      target.on(end, () => this.setFiring(false));
    }
  }

  /** Pressable once the pizza is baked enough; serving itself isn't in yet. */
  private buildServeButton(): void {
    const button = this.serveButton;
    button.on('pointerdown', (e) => {
      if (!this.canServe()) return;
      // Never also a press on the pizza
      e.stopPropagation();
      this.servePressed = true;
    });
    for (const end of ['pointerup', 'pointerupoutside', 'pointercancel'] as const) {
      button.on(end, () => (this.servePressed = false));
    }
    this.addChild(button);
  }

  private canServe(): boolean {
    return this.bakeLevel >= BAKE.minBaked;
  }
}
