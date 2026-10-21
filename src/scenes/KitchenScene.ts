import { Container, Point, Sprite, type FederatedPointerEvent, type Rectangle, type Renderer } from 'pixi.js';
import {
  BAKE,
  BAKE_BUTTON,
  BAKE_GAUGE,
  BINS,
  BOWL,
  CHEESE,
  CUTTER,
  DOUGH,
  DRAGON,
  FIRE,
  HELD,
  INGREDIENT_IDS,
  ORDER_TRAY,
  PEEL,
  PIECES,
  PULSE,
  SERVE_BUTTON,
  SKIP,
  SLICING,
  WIDESCREEN,
  type IngredientId,
} from '../config';
import { artPoint, artSprite, artTexture, opaqueHitArea } from '../core/art';
import { easeInQuad } from '../core/easing';
import { judge, type Verdict } from '../orders/judge';
import { drawOrder, type Order } from '../orders/Order';
import { lineAngle, nearestLine, snapLine } from '../orders/slicing';
import { BakeGauge } from '../stations/BakeGauge';
import { CutterButton } from '../stations/CutterButton';
import { StateButton } from '../stations/StateButton';
import { Dough, landedBallScale, makeDoughBallSprite } from '../stations/Dough';
import { IngredientBin } from '../stations/IngredientBin';
import { OrderTicket } from '../stations/OrderTicket';
import { keepLabelSizes, Label } from '../stations/Label';
import { SelectableLabel } from '../stations/SelectableLabel';
import { WORDS } from '../words';

// Unlocked once the dough is rolled out
const TOPPINGS_READY: readonly IngredientId[] = INGREDIENT_IDS;

type DoughPhase = 'inBowl' | 'held' | 'dropping' | 'onPeel';
/** What's in hand: an ingredient from its bin, or the cutter. */
type Tool = IngredientId | 'cutter';
const DEG_TO_RAD = Math.PI / 180;

// Stations in drawing order; each holds its art in the wide design space and is placed for the current layout
const STATIONS = ['bin1', 'bin2', 'bin3', 'bowl', 'orderTray', 'peel', 'gauge', 'dragon', 'bakeButton', 'cutter', 'serveButton'] as const;
type Station = (typeof STATIONS)[number];

const ORIGIN = { x: 0, y: 0 };

/**
 * The main play screen, laid out from the art. Once baked, the pizza is cut with the cutter, which locks the toppings,
 * baking and kneading; serving then scores it against the order and brings the next.
 */
export class KitchenScene extends Container {
  readonly dough: Dough;
  /** Doneness, raw at 0 to burnt at 1; rises steadily, and the dial shows it as is. */
  bakeLevel = 0;
  private readonly gauge = new BakeGauge();
  private readonly bakeButton = new StateButton('bake_button', BAKE_BUTTON);
  private readonly serveButton = new StateButton('serve_button', SERVE_BUTTON);
  private servePressed = false;
  private readonly cutterButton = new CutterButton();
  /** The line the cutter aims along, as a line through the dough's center, and whether it's an existing cut's. */
  private cutAngle = Math.PI / 2;
  private onCutLine = false;
  /** The cutter is pressed, cutting along its line; it last met the line at cutAt (signed design px from the center). */
  private cutting = false;
  private cutAt = 0;
  /** Seconds the served, sliced pizza still shows before the next order; nothing is pressable meanwhile. */
  private servingFor = 0;
  private readonly background = artSprite('bg');
  private readonly peel = artSprite('peel');
  private readonly bowl = artSprite('bowl');
  private readonly bowlLabel = new SelectableLabel(WORDS.dough, 'bowl', 'label_dough');
  private readonly orderTray = new Sprite({ texture: artTexture('order_tray'), anchor: 0.5 });
  private readonly orderLabel = new Label(WORDS.order, 'tray', 'label_order');
  private readonly ticket = new OrderTicket(this.orderTray.texture.width, this.orderTray.texture.height);
  /** What the pizza on the peel should be. */
  order: Order = drawOrder();
  /** How the last served pizza met its order; none served yet. */
  lastVerdict: Verdict | null = null;
  /** The dough ball: waits in the bowl, is carried by hand, then drops onto the peel where the dough takes over. */
  private readonly doughBall = makeDoughBallSprite();
  /** Where and how large the ball sits in the bowl. */
  private readonly ballRest = new Point();
  private ballRestScale = 1;
  /** Ball position relative to the pointer, kept from where it was grabbed. */
  private readonly grabOffset = new Point();
  private dropFromScale = 1;
  /** Follows the pointer at the pizza's scale, with sauce's art or the topping piece to be dropped next. */
  private readonly held = new Container();
  private readonly heldArt = new Sprite({ anchor: 0.5 });
  /** Additive copy of the held sauce art that brightens it while pressed. */
  private readonly heldGlow = new Sprite({ anchor: 0.5, blendMode: 'add', alpha: 0 });
  private readonly fire = artSprite('fire');
  private readonly dragon = artSprite('dragon');
  private readonly bins: IngredientBin[] = [];
  private readonly stations = Object.fromEntries(STATIONS.map((name) => [name, new Container()])) as Record<Station, Container>;
  private widescreen = false;
  private readonly pointer = new Point();
  /** Where the dough sits, in scene space; the ball lands there. */
  private readonly peelCenter = new Point();
  private readonly dropFrom = new Point();
  private readonly strokeEnd = new Point();
  private dropElapsed = 0;
  private doughPhase: DoughPhase = 'inBowl';
  private doughReady = false;
  private available = new Set<IngredientId>();
  private tool: Tool | null = null;
  /** The last pointer was a finger; a finger covers the cursor, so the held ingredient hides. */
  private touch = false;
  private painting = false;
  private fireTime = 0;
  private fireScale = 1;

  constructor(unlocked: ReadonlySet<IngredientId>, renderer: Renderer) {
    super();
    this.dough = new Dough(renderer);

    this.background.anchor.set(0.5);
    // Interactive so a press anywhere reaches the scene (painting)
    this.background.eventMode = 'static';
    this.addChild(this.background);
    this.addChild(...STATIONS.map((name) => this.stations[name]));
    this.buildBins(unlocked);
    this.buildBowl();
    this.stations.orderTray.addChild(this.orderTray, this.ticket, this.orderLabel);
    this.buildPeel();
    this.stations.gauge.addChild(this.gauge);
    this.buildDragon();
    this.buildBakeButton();
    this.buildServeButton();
    this.buildCutter();
    // Presses on the ball go to whatever is under it: the bowl, or the peel to drop it
    this.doughBall.eventMode = 'none';
    this.held.addChild(this.heldArt, this.heldGlow);
    this.held.eventMode = 'none';
    this.dough.toppings.hand = this.held;
    this.addChild(this.doughBall, this.held);

    // Track the pointer everywhere so held things can follow it
    this.eventMode = 'static';
    this.on('globalpointermove', this.trackPointer, this);
    this.on('pointerdown', this.startPainting, this);
    this.on('pointerup', this.stopPainting, this);
    this.on('pointerupoutside', this.stopPainting, this);

    this.layout();
    this.setTool(null);
    this.resetDough();
    this.applyAvailability();
    this.ticket.show(this.order);
  }

  /** Cover the whole screen area with paper, margins included. */
  fitBackground(screenArea: Rectangle): void {
    const { background } = this;
    background.position.set(screenArea.x + screenArea.width / 2, screenArea.y + screenArea.height / 2);
    background.scale.set(Math.max(screenArea.width / background.texture.width, screenArea.height / background.texture.height));
  }

  /** Arrange the stations side by side for a widescreen, or as drawn. */
  setWidescreen(widescreen: boolean): void {
    this.widescreen = widescreen;
    this.layout();
  }

  /** Place everything from config, in the current arrangement; stations go first, since the rest reads where they are. */
  layout(): void {
    for (const bin of this.bins) {
      bin.layout();
      const center = artPoint(bin.art, 0.5, 0.5);
      this.placeStation(bin.art, center.x + bin.x, center.y + bin.y);
    }
    this.layoutBowl();
    this.layoutOrderTray();
    this.layoutPeel();
    this.gauge.layout();
    this.placeStation('gauge', BAKE_GAUGE.x, BAKE_GAUGE.y);
    this.placeStation('bakeButton', BAKE_BUTTON.x, BAKE_BUTTON.y);
    this.cutterButton.layout();
    this.placeStation('cutter', CUTTER.x, CUTTER.y);
    this.placeStation('serveButton', SERVE_BUTTON.x, SERVE_BUTTON.y);
    this.layoutDragon();
    this.scaleHeld();
    // Last, once every station has its scale
    keepLabelSizes(this);
  }

  /** In the standard layout a station stays as drawn; on a widescreen its anchor (a point in the standard layout) moves to
   * its spot and scale. */
  private placeStation(name: Station, anchorX: number, anchorY: number): void {
    const station = this.stations[name];
    station.pivot.set(anchorX, anchorY);
    if (this.widescreen) {
      station.position.set(WIDESCREEN[`${name}X`], WIDESCREEN[`${name}Y`]);
      station.scale.set(WIDESCREEN[`${name}Scale`]);
    } else {
      station.position.set(anchorX, anchorY);
      station.scale.set(1);
    }
  }

  /** Back to an empty peel with the dough in its bowl. */
  resetDough(): void {
    this.bakeLevel = 0;
    this.doughPhase = 'inBowl';
    this.restBall();
    this.dough.reset();
    this.dough.setPlaced(false);
  }

  /** Replace the order with a new one. */
  newOrder(): void {
    this.order = drawOrder();
    this.ticket.show(this.order);
  }

  /** How the pizza on the peel meets the order so far, sliced as cut so far. */
  scoreOrder(): Verdict {
    const { dough } = this;
    return judge(this.order, { pieces: dough.toppings.placedPieces, bakeLevel: this.bakeLevel, radiusAt: (a) => dough.radiusAt(a) }, dough.sliceEdges());
  }

  /** Hand over the pizza: score it as cut, show it for a moment, then start the next order on fresh dough. */
  private serve(): void {
    this.lastVerdict = this.scoreOrder();
    this.setTool(null);
    this.setFiring(false);
    this.dough.setKneadable(false);
    this.servingFor = SLICING.showSeconds;
  }

  private get serving(): boolean {
    return this.servingFor > 0;
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
    if (this.serving && (this.servingFor -= dt) <= 0) {
      this.newOrder();
      this.resetDough();
      this.dough.setKneadable(true);
    }
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
    this.updateGlow(dt);
    this.bins.forEach((bin) => bin.update(this.ingredient, dt));
    this.bowlLabel.update(this.doughPhase === 'held', dt);
    const inBowl = this.doughPhase === 'inBowl';
    this.bowl.cursor = inBowl ? 'pointer' : 'default';
    this.dragon.cursor = this.canBake() && !this.serving ? 'pointer' : 'default';
    this.gauge.setLevel(this.bakeLevel);
    this.bakeButton.layout();
    this.bakeButton.setState(this.canBake(), this.fire.visible);
    this.cutterButton.setState(this.canCut(), this.tool === 'cutter');
    this.serveButton.layout();
    this.serveButton.setState(this.canServe(), this.servePressed);
    this.dough.setBake(this.bakeLevel);
    // Last, once the pizza is done changing this frame
    this.dough.drawPlain();
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
    this.held.visible = !!this.ingredient && !this.touch;
    this.holdPiece();
    if (this.tool === 'cutter') this.aimCutter();
    // Move in the event itself, not next frame, so held things stick to the pointer
    if (this.doughPhase === 'held') {
      this.doughBall.position.set(this.pointer.x + this.grabOffset.x, this.pointer.y + this.grabOffset.y);
    }
    if (this.tool) this.held.position.copyFrom(this.pointer);
  }

  /** Tap a bin to take its ingredient, tap it again to put it back. The press never reaches the pizza. */
  private pickIngredient(id: IngredientId, e: FederatedPointerEvent): void {
    e.stopPropagation();
    if (this.serving) return;
    this.trackPointer(e);
    if (this.tool === id) this.setTool(null);
    else if (this.available.has(id)) this.setTool(id);
  }

  /** The ingredient in hand, if it's one. */
  private get ingredient(): IngredientId | null {
    return this.tool === 'cutter' ? null : this.tool;
  }

  private setTool(tool: Tool | null): void {
    this.tool = tool;
    this.painting = false;
    this.cutting = false;
    this.onCutLine = false;
    this.dough.showGuide(null);
    this.held.visible = !!this.ingredient && !this.touch;
    // Sauce has its own cursor art; toppings hold the very piece they drop next
    const sauce = tool === 'sauce';
    this.heldArt.visible = this.heldGlow.visible = sauce;
    if (sauce) this.heldArt.texture = this.heldGlow.texture = artTexture('held_sauce');
    this.heldGlow.alpha = 0;
    this.holdPiece();
    this.held.position.copyFrom(this.pointer);
    this.dough.setKneadable(tool === null && !this.dough.isCut);
  }

  /** A topping in hand waits as its next piece, except by touch, where the finger covers it and nothing is held. */
  private holdPiece(): void {
    const tool = this.ingredient;
    this.dough.toppings.hold(tool && tool !== 'sauce' && !this.touch ? tool : null);
  }

  /** Held things follow the dough's size on screen. */
  private scaleHeld(): void {
    this.held.scale.set(this.stations.peel.scale.x);
    this.heldArt.scale.set(HELD.scale);
    this.heldGlow.scale.set(HELD.scale);
  }

  /** A press on the peel with an ingredient in hand paints until release; presses elsewhere are ignored. */
  private startPainting(e: FederatedPointerEvent): void {
    if (this.tool === 'cutter') {
      this.startCut(e);
      return;
    }
    if (!this.tool || this.serving || !this.peel.getBounds().containsPoint(e.global.x, e.global.y)) return;
    this.trackPointer(e);
    this.painting = true;
    this.strokeEnd.copyFrom(this.pointer);
    this.dough.toppings.beginStroke();
    // The first stamp or piece lands on the press itself, even if released before the next frame
    this.applyTool(0);
  }

  private stopPainting(): void {
    this.painting = false;
    if (!this.cutting) return;
    this.cutting = false;
    this.aimCutter();
  }

  /** Pick up the cutter once the pizza is baked, or put it back. The press never reaches the pizza. */
  private pickCutter(e: FederatedPointerEvent): void {
    e.stopPropagation();
    if (this.serving) return;
    this.trackPointer(e);
    if (this.tool === 'cutter') this.setTool(null);
    else if (this.canCut()) this.setTool('cutter');
  }

  /**
   * Over the pizza, aim along the line through its center toward the pointer, snapping to a cut line close by, and keep
   * the aim near the center where the pointer's angle is unsteady. While cutting, the line stays and the cutter follows
   * where the pointer meets it, cutting all it sweeps.
   */
  private aimCutter(): void {
    const { dough } = this;
    const p = dough.toLocal(this.pointer, this);
    if (this.cutting) {
      const at = this.alongCut(p);
      const half = CUTTER.span / 2;
      this.cutAlong(Math.min(this.cutAt, at) - half, Math.max(this.cutAt, at) + half);
      this.cutAt = at;
      dough.showGuide(this.cutAngle, at);
      return;
    }
    if (!this.inCutterReach(p)) {
      dough.showGuide(null);
      return;
    }
    const angle = Math.atan2(p.y, p.x);
    if (Math.hypot(p.x, p.y) > CUTTER.deadZone) {
      const near = nearestLine(dough.cutLines, angle, CUTTER.snapToCut * DEG_TO_RAD);
      this.cutAngle = near ? near.angle : lineAngle(angle);
      this.onCutLine = !!near;
    }
    dough.showGuide(this.cutAngle);
  }

  /** A press over the pizza locks the aim, snapped to the grid unless it's on a cut line, and starts cutting there. */
  private startCut(e: FederatedPointerEvent): void {
    if (this.serving) return;
    this.trackPointer(e);
    const p = this.dough.toLocal(this.pointer, this);
    if (!this.inCutterReach(p)) return;
    if (!this.onCutLine) this.cutAngle = snapLine(this.cutAngle, CUTTER.gridDegrees * DEG_TO_RAD);
    this.cutting = true;
    this.cutAt = this.alongCut(p);
    this.cutAlong(this.cutAt - CUTTER.span / 2, this.cutAt + CUTTER.span / 2);
    this.dough.showGuide(this.cutAngle, this.cutAt);
  }

  /** Whether a dough-local point is close enough to the pizza to aim the cutter: within its edge times the reach. */
  private inCutterReach(p: { x: number; y: number }): boolean {
    return Math.hypot(p.x, p.y) <= this.dough.radiusAt(Math.atan2(p.y, p.x)) * CUTTER.reach;
  }

  /** Where a dough-local point meets the cutter's line, signed design px from the center, kept on the dough. */
  private alongCut(p: { x: number; y: number }): number {
    const along = p.x * Math.cos(this.cutAngle) + p.y * Math.sin(this.cutAngle);
    return Math.min(this.dough.radiusAt(this.cutAngle), Math.max(-this.dough.radiusAt(this.cutAngle + Math.PI), along));
  }

  /** Cut along the cutter's line; the first cut locks the toppings, baking and kneading. */
  private cutAlong(from: number, to: number): void {
    const wasCut = this.dough.isCut;
    this.dough.cut(this.cutAngle, from, to);
    if (!wasCut && this.dough.isCut) this.applyAvailability();
  }

  /** Sauce paints along the stroke; cheese scatters pieces; whole toppings repeat while held. */
  private applyTool(dt: number): void {
    const from = this.dough.toLocal(this.strokeEnd, this);
    const to = this.dough.toLocal(this.pointer, this);
    const tool = this.ingredient;
    if (tool === 'sauce') this.dough.paintSauce(from, to);
    else if (tool === 'cheese') this.dough.toppings.scatter('cheese', CHEESE, from, to, dt);
    else if (tool) this.dough.toppings.repeat(tool, PIECES, to, dt);
    this.strokeEnd.copyFrom(this.pointer);
  }

  private pickUpDough(e: FederatedPointerEvent): void {
    if (this.doughPhase !== 'inBowl' || this.serving) return;
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
    const { x, y } = this.dough.toLocal(e.global);
    if (Math.hypot(x, y) <= DOUGH.rimRadius) this.dropDough();
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
    const landedScale = landedBallScale() * this.stations.peel.scale.x;
    this.doughBall.scale.set(this.dropFromScale + (landedScale - this.dropFromScale) * k);
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
    this.available = new Set<IngredientId>(this.doughReady && !this.dough.isCut ? TOPPINGS_READY : []);
    this.bins.forEach((bin) => bin.setAvailable(this.available));
    if (this.ingredient && !this.available.has(this.ingredient)) this.setTool(null);
  }

  private buildBins(unlocked: ReadonlySet<IngredientId>): void {
    for (const spec of BINS) {
      const bin = new IngredientBin(spec, (id, e) => this.pickIngredient(id, e));
      bin.refresh(unlocked);
      this.bins.push(bin);
      this.stations[bin.art].addChild(bin);
    }
  }

  private buildBowl(): void {
    const { bowl } = this;
    // Anchored at its center, which it scales about
    bowl.anchor.set(0.5);
    bowl.eventMode = 'static';
    bowl.on('pointerdown', this.pickUpDough, this);
    this.stations.bowl.addChild(bowl, this.bowlLabel);
  }

  /** Place the bowl, its dough and its label from config. */
  private layoutBowl(): void {
    const center = artPoint('bowl', 0.5, 0.5);
    this.bowl.position.set(center.x + BOWL.x, center.y + BOWL.y);
    this.bowl.scale.set(BOWL.scale);
    // The label sits by its center, which it grows about
    const label = artPoint('label_dough', 0.5, 0.5);
    this.bowlLabel.layout(label.x + BOWL.x + BOWL.labelX, label.y + BOWL.y + BOWL.labelY, this.bowl.x);
    this.placeStation('bowl', this.bowl.x, this.bowl.y);
    // The ball lives on the scene itself, free to travel to the peel
    this.toLocal(this.bowl.position, this.stations.bowl, this.ballRest);
    this.ballRestScale = (BOWL.fillWidth * this.bowl.width * this.stations.bowl.scale.x) / this.doughBall.texture.width;
    if (this.doughPhase === 'inBowl') this.restBall();
  }

  /** Place the order tray and its caption from config; the caption keeps its drawn spot below the tray. */
  private layoutOrderTray(): void {
    const { x, y, scale, labelX, labelY } = ORDER_TRAY;
    this.orderTray.position.set(x, y);
    this.orderTray.scale.set(scale);
    // The ticket lives in the tray's art space
    this.ticket.position.set(x, y);
    this.ticket.scale.set(scale);
    const tray = artPoint('order_tray', 0.5, 0.5);
    const label = artPoint('label_order', 0.5, 0.5);
    this.orderLabel.layout(x + label.x - tray.x + labelX, y + label.y - tray.y + labelY, x);
    this.ticket.layout();
    this.placeStation('orderTray', x, y);
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
    this.stations.peel.addChild(peel, this.dough);
  }

  /** Place the peel from config, with the dough on its face. */
  private layoutPeel(): void {
    const drawn = artPoint('peel', 0, 0);
    this.peel.position.set(drawn.x + PEEL.x, drawn.y + PEEL.y);
    const face = artPoint('peel', PEEL.faceX, PEEL.faceY);
    this.dough.position.set(face.x + PEEL.x, face.y + PEEL.y);
    this.placeStation('peel', this.dough.x, this.dough.y);
    this.toLocal(ORIGIN, this.dough, this.peelCenter);
  }

  /** Place the dragon from config and aim the fire from its mouth at the dough, once the peel is placed. */
  private layoutDragon(): void {
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
    this.placeStation('dragon', DRAGON.x, DRAGON.y);
    // Flame art has its round head on the left; the head sits in the mouth, tips reaching for the dough
    const target = this.stations.dragon.toLocal(ORIGIN, this.dough);
    const dx = target.x - mouthX;
    const dy = target.y - mouthY;
    fire.position.set(mouthX, mouthY);
    fire.rotation = Math.atan2(dy, dx);
    this.fireScale = (Math.hypot(dx, dy) * FIRE.reach) / fire.texture.width;
  }

  private buildDragon(): void {
    this.fire.anchor.set(0, 0.5);
    this.fire.eventMode = 'none';
    this.setFiring(false);

    const { dragon } = this;
    dragon.eventMode = 'static';
    // It may overlap the peel, which should still take presses beside the dragon
    dragon.hitArea = opaqueHitArea(dragon);
    // Like the bake button, it only breathes fire once the dough is rolled out, and not once it's cut
    this.onFirePress(dragon, () => this.canBake());
    this.stations.dragon.addChild(dragon, this.fire);
  }

  /** A second way to bake, disabled until the dough is rolled out, and once it's cut. */
  private buildBakeButton(): void {
    this.onFirePress(this.bakeButton, () => this.canBake());
    this.stations.bakeButton.addChild(this.bakeButton);
  }

  /** Breathe fire while target is held, if it's enabled; baking puts down whatever ingredient is in hand. */
  private onFirePress(target: Container, enabled: () => boolean): void {
    target.on('pointerdown', (e) => {
      if (!enabled() || this.serving) return;
      // Never also a press on the pizza
      e.stopPropagation();
      this.setTool(null);
      this.setFiring(true);
    });
    for (const end of ['pointerup', 'pointerupoutside', 'pointercancel'] as const) {
      target.on(end, () => this.setFiring(false));
    }
  }

  /** Pressable once the pizza is cut; releasing it on the button serves the pizza. */
  private buildServeButton(): void {
    const button = this.serveButton;
    button.on('pointerdown', (e) => {
      if (!this.canServe()) return;
      // Never also a press on the pizza
      e.stopPropagation();
      this.servePressed = true;
    });
    button.on('pointerup', () => {
      if (this.servePressed) this.serve();
    });
    for (const end of ['pointerup', 'pointerupoutside', 'pointercancel'] as const) {
      button.on(end, () => (this.servePressed = false));
    }
    this.stations.serveButton.addChild(button);
  }

  private canServe(): boolean {
    return this.dough.isCut && !this.serving;
  }

  private canBake(): boolean {
    return this.doughReady && !this.dough.isCut;
  }

  /** The cutter can be picked up once the pizza is baked enough. */
  private canCut(): boolean {
    return this.doughPhase === 'onPeel' && this.bakeLevel >= BAKE.minBaked && !this.serving;
  }

  private buildCutter(): void {
    this.cutterButton.on('pointerdown', this.pickCutter, this);
    this.stations.cutter.addChild(this.cutterButton);
  }
}
