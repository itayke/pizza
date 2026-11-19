import { Container, Point, Sprite, Texture, type FederatedPointerEvent, type Rectangle, type Renderer } from 'pixi.js';
import {
  BAKE,
  BAKE_BUTTON,
  BAKE_GAUGE,
  BIN_LAYOUT,
  BINS,
  BOWL,
  CHEESE,
  CUTTER,
  DOUGH,
  DRAGON,
  FIRE,
  ROOM_LIGHT,
  SHAKE,
  HELD,
  INGREDIENT_IDS,
  ORDER_TRAY,
  ORDERS,
  PEEL,
  PIECES,
  PULSE,
  SERVE_BUTTON,
  SKIP,
  SLICING,
  type IngredientId,
} from '../config';
import { artPoint, artSprite, artTexture, opaqueHitArea } from '../core/art';
import { easeInQuad } from '../core/easing';
import { Rumble } from '../core/Rumble';
import { Shake } from '../core/Shake';
import { gradeOf, type Score } from '../orders/grade';
import { judge } from '../orders/judge';
import { drawOrder, type Order } from '../orders/Order';
import { comparePicture, profileOf, type Profile } from '../orders/picture';
import { drawRecipe, type Recipe } from '../orders/Recipe';
import { lineAngle, nearestLine, snapLine } from '../orders/slicing';
import { BakeGauge } from '../stations/BakeGauge';
import { CutterButton } from '../stations/CutterButton';
import { FireBreath } from '../stations/FireBreath';
import { StateButton } from '../stations/StateButton';
import { Dough, landedBallScale, makeDoughBallSprite } from '../stations/Dough';
import { IngredientBin } from '../stations/IngredientBin';
import { OrderTicket } from '../stations/OrderTicket';
import { keepLabelSizes, Label } from '../stations/Label';
import { SelectableLabel } from '../stations/SelectableLabel';
import { ServedSlices } from '../stations/ServedSlices';
import { WORDS } from '../words';

// Unlocked once the dough is rolled out
const TOPPINGS_READY: readonly IngredientId[] = INGREDIENT_IDS;

type DoughPhase = 'inBowl' | 'held' | 'dropping' | 'onPeel';
/** What's in hand: an ingredient from its bin, or the cutter. */
type Tool = IngredientId | 'cutter';
const DEG_TO_RAD = Math.PI / 180;

// Stations in drawing order; each holds its art in the wide design space and is placed for the current layout
const STATIONS = ['bin1', 'bin2', 'bin3', 'bowl', 'orderTray', 'peel', 'dragon', 'gauge', 'bakeButton', 'cutter', 'serveButton'] as const;
type Station = (typeof STATIONS)[number];
/** Where a station's anchor goes on the stage, design px, and its scale (1 if none). */
type StationPlace = { readonly x: number; readonly y: number; readonly scale?: number };

const ORIGIN = { x: 0, y: 0 };
// Order pictures are drawn at design size, about as large as the ticket shows them
const PICTURE_SCALE = 1;
// Scores in the details on what led to them
const SCORE_DECIMALS = 2;

/** What the pizza on the peel should be: a picture to copy, read for scoring, or rules to meet. */
export type CurrentOrder = { kind: 'picture'; recipe: Recipe; profile: Profile } | { kind: 'rules'; order: Order };

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
  /** The last served pizza's slices, leaving the peel over every station. */
  private readonly served = new ServedSlices();
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
  private readonly orderLabel = new Label(WORDS.order, 'tray', 'label_order');
  /** The order, laid out in the tray art's space, though the tray itself isn't drawn for now. */
  private readonly ticket = new OrderTicket(artTexture('order_tray').width, artTexture('order_tray').height);
  /** Makes each picture order out of sight. */
  private readonly pictureDough: Dough;
  /** What the pizza on the peel should be. */
  current!: CurrentOrder;
  /** How the last served pizza met its order; none served yet. */
  lastScore: Score | null = null;
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
  private readonly breath = new FireBreath();
  /** Darkens the room under it while the dragon breathes; the fire, gauge and buttons draw above it. */
  private readonly dim = new Sprite({ texture: Texture.WHITE, anchor: 0.5, blendMode: 'multiply', eventMode: 'none' });
  /** How dark the room is, 0 lit to 1 at full strength; trails the breath's heat. */
  private roomDark = 0;
  private readonly shake = new Shake();
  private readonly rumble = new Rumble();
  /** Where the scene turns about as it shakes: the screen's middle, design px. */
  private readonly shakeCenter = new Point();
  private readonly dragon = artSprite('dragon');
  private readonly bins: IngredientBin[] = [];
  private readonly stations = Object.fromEntries(STATIONS.map((name) => [name, new Container()])) as Record<Station, Container>;
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

  constructor(unlocked: ReadonlySet<IngredientId>, renderer: Renderer) {
    super();
    this.dough = new Dough(renderer);
    this.pictureDough = new Dough(renderer);
    this.pictureDough.setKneadable(false);

    this.background.anchor.set(0.5);
    // Interactive so a press anywhere reaches the scene (painting)
    this.background.eventMode = 'static';
    this.addChild(this.background);
    this.addChild(...STATIONS.map((name) => this.stations[name]));
    // The room dims below the gauge and the fire glows over it, still under the buttons
    this.addChildAt(this.dim, this.getChildIndex(this.stations.gauge));
    this.addChildAt(this.breath, this.getChildIndex(this.stations.bakeButton));
    this.buildBins(unlocked);
    this.buildBowl();
    this.stations.orderTray.addChild(this.ticket, this.orderLabel);
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
    this.addChild(this.doughBall, this.served, this.held);

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
    this.newOrder();
  }

  /** Cover the whole screen area with paper, margins included, with room to spare for the shake at its strongest. */
  fitBackground(screenArea: Rectangle): void {
    const { background } = this;
    const halfWidth = screenArea.width / 2;
    const halfHeight = screenArea.height / 2;
    this.shakeCenter.set(screenArea.x + halfWidth, screenArea.y + halfHeight);
    background.position.copyFrom(this.shakeCenter);
    // Turned a little, each side reaches over by the other's half times the angle
    const turn = Math.abs(SHAKE.angle) * DEG_TO_RAD;
    const room = Math.max(
      (halfWidth + halfHeight * turn + SHAKE.offset) / halfWidth,
      (halfHeight + halfWidth * turn + SHAKE.offset) / halfHeight,
    );
    background.scale.set(room * Math.max(screenArea.width / background.texture.width, screenArea.height / background.texture.height));
    this.dim.position.copyFrom(background.position);
    this.dim.setSize(background.width, background.height);
  }

  /** Place everything from config; stations go first, since the rest reads where they are. */
  layout(): void {
    for (const bin of this.bins) {
      bin.layout();
      const center = artPoint(bin.art, 0.5, 0.5);
      const { art } = bin;
      const place = { x: BIN_LAYOUT[`${art}X`], y: BIN_LAYOUT[`${art}Y`], scale: BIN_LAYOUT[`${art}Scale`] };
      this.placeStation(art, place, center.x, center.y);
    }
    this.layoutBowl();
    this.layoutOrderTray();
    this.layoutPeel();
    this.gauge.layout();
    this.placeStation('gauge', BAKE_GAUGE);
    this.placeStation('bakeButton', BAKE_BUTTON);
    this.cutterButton.layout();
    this.placeStation('cutter', CUTTER);
    this.placeStation('serveButton', SERVE_BUTTON);
    this.layoutDragon();
    this.scaleHeld();
    // Last, once every station has its scale
    keepLabelSizes(this);
  }

  /** Move a station's anchor (a point in its own space) to its place on the stage, at the place's scale if it has one. */
  private placeStation(name: Station, place: StationPlace, anchorX = 0, anchorY = 0): void {
    const station = this.stations[name];
    station.pivot.set(anchorX, anchorY);
    station.position.set(place.x, place.y);
    station.scale.set(place.scale ?? 1);
  }

  /** Back to an empty peel with the dough in its bowl. */
  resetDough(): void {
    this.bakeLevel = 0;
    this.doughPhase = 'inBowl';
    this.restBall();
    this.dough.reset();
    this.dough.setPlaced(false);
  }

  /** Replace the order with a new one: a picture of a pizza made out of sight, or rules. */
  newOrder(): void {
    if (!ORDERS.pictures) {
      this.current = { kind: 'rules', order: drawOrder() };
      this.ticket.showRules(this.current.order);
      return;
    }
    const recipe = drawRecipe();
    this.pictureDough.make(recipe);
    this.current = { kind: 'picture', recipe, profile: profileOf(this.pictureDough.pizza()) };
    this.ticket.showPicture(this.pictureDough.snapshot(PICTURE_SCALE).texture, DOUGH.rimRadius);
  }

  /** How the pizza on the peel meets the order so far, sliced as cut so far. */
  scoreOrder(): Score {
    const pizza = this.dough.pizza();
    const { current } = this;
    if (current.kind === 'picture') {
      const served = profileOf(pizza);
      const { cover, slices, bake, total, channels } = comparePicture(current.profile, served);
      // Short enough for a narrow panel: no leading zeros
      const fixed = (v: number) => v.toFixed(SCORE_DECIMALS).replace(/^0\./, '.');
      const details = [
        // Each sauce or topping: its score, then how much of the pizza it covers, pictured / served
        ...channels.map((c) => `${c.name} ${fixed(c.score)}: ${fixed(c.picture)}/${fixed(c.served)}`),
        `slices ${current.profile.slices}/${served.slices}`,
        `bake ${fixed(current.profile.bakeLevel)}/${fixed(served.bakeLevel)}`,
      ];
      return { parts: [{ name: 'cover', score: cover }, { name: 'slices', score: slices }, { name: 'bake', score: bake }], total, details };
    }
    const verdict = judge(current.order, pizza, pizza.edges);
    const rules = verdict.rules.map((score, i) => ({ name: current.order.rules[i].kind, score }));
    return { parts: [...rules, { name: 'bake', score: verdict.doneness }], total: verdict.total, details: [] };
  }

  /**
   * Hand over the pizza: score it as cut and show it with its grade for a moment, if at all, then send its slices out
   * and start the next order on fresh dough.
   */
  private serve(): void {
    this.lastScore = this.scoreOrder();
    this.ticket.showGrade(gradeOf(this.lastScore.total));
    this.setTool(null);
    this.setFiring(false);
    this.dough.setKneadable(false);
    this.servingFor = SLICING.showSeconds;
    if (!this.serving) this.sendSlicesOut();
  }

  private sendSlicesOut(): void {
    this.servingFor = 0;
    this.served.launch(this.dough.slicedSnapshot());
    this.newOrder();
    this.resetDough();
    this.dough.setKneadable(true);
  }

  private get serving(): boolean {
    return this.servingFor > 0;
  }

  /**
   * Testing shortcut, a step per press: place the dough, roll it out to the rim, then sauce it, then cheese it once, then
   * bake it just right.
   */
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
    } else if (this.canBake() && this.bakeLevel < BAKE.optimalLevel) {
      this.bakeLevel = BAKE.optimalLevel;
    }
  }

  /** Testing shortcut: make the pictured pizza on the peel at once, ready to serve. */
  copyOrder(): void {
    if (this.current.kind !== 'picture' || this.serving) return;
    this.setFiring(false);
    this.doughPhase = 'onPeel';
    this.doughBall.visible = false;
    this.dough.make(this.current.recipe);
    this.bakeLevel = this.current.recipe.bakeLevel;
    this.setTool(null);
    this.applyAvailability();
  }

  update(dt: number): void {
    if (this.serving && (this.servingFor -= dt) <= 0) this.sendSlicesOut();
    this.ticket.update(dt);
    if (this.doughPhase === 'dropping') this.updateDrop(dt);
    this.dough.update(dt);
    this.served.update(dt);
    // Rolled out enough for toppings and baking
    const doughReady = this.doughPhase === 'onPeel' && this.dough.coverage >= DOUGH.sauceCoverage;
    if (doughReady !== this.doughReady) {
      this.doughReady = doughReady;
      this.applyAvailability();
    }

    if (this.painting) this.applyTool(dt);

    this.breath.update(dt);
    if (this.breath.firing && this.doughReady) this.bakeLevel = Math.min(1, this.bakeLevel + dt / BAKE.secondsToBurnt);
    this.updateShake(dt);
    this.updateRoomLight(dt);
    this.updateGlow(dt);
    this.bins.forEach((bin) => bin.update(this.ingredient, dt));
    this.bowlLabel.update(this.doughPhase === 'held', dt);
    const inBowl = this.doughPhase === 'inBowl';
    this.bowl.cursor = inBowl ? 'pointer' : 'default';
    this.dragon.cursor = this.canBake() && !this.serving ? 'pointer' : 'default';
    this.gauge.setLevel(this.bakeLevel);
    this.bakeButton.layout();
    this.bakeButton.setState(this.canBake(), this.breath.firing);
    this.cutterButton.setState(this.canCut(), this.tool === 'cutter');
    this.serveButton.layout();
    this.serveButton.setState(this.canServe(), this.servePressed);
    this.dough.setBake(this.bakeLevel);
    // Last, once the pizza is done changing this frame
    this.dough.drawPlain();
  }

  /** The held ingredient's glow fades up while pressed and back out once released. */
  /** Dim and warm the room as the breath heats up, starting as the first fireballs reach the pizza. */
  private updateRoomLight(dt: number): void {
    const { breath } = this;
    // Until then it holds, so a quick second breath doesn't flash the room lighter
    if (breath.firing && breath.firingSeconds < breath.flightSeconds) return;
    const target = breath.heat;
    const seconds = target > this.roomDark ? ROOM_LIGHT.riseSeconds : ROOM_LIGHT.fallSeconds;
    const change = seconds > 0 ? dt / seconds : Infinity;
    this.roomDark = target > this.roomDark ? Math.min(target, this.roomDark + change) : Math.max(target, this.roomDark - change);
    const { dim } = this;
    dim.tint = ROOM_LIGHT.color;
    dim.alpha = ROOM_LIGHT.strength * this.roomDark;
    dim.visible = dim.alpha > 0;
  }

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
    this.endCut();
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
    this.endCut();
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

  /** Lift the cutter: its line is cut whole if cut far enough along, else left uncut, which may lift the lock again. */
  private endCut(): void {
    if (!this.cutting) return;
    this.cutting = false;
    const wasCut = this.dough.isCut;
    this.dough.finishCut(this.cutAngle);
    if (wasCut !== this.dough.isCut) this.applyAvailability();
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
    if (firing && !this.breath.firing) this.shake.kick(SHAKE.kick);
    this.breath.firing = firing;
    this.rumble.set(firing);
  }

  /** Start or stop breathing fire, a dev shortcut for tuning the breath; only once the dough can bake. */
  toggleFire(): void {
    this.setFiring(!this.breath.firing && this.canBake() && !this.serving);
  }

  /** The scene shakes and the device rumbles while the dragon breathes, the shake wearing off after. */
  private updateShake(dt: number): void {
    const { shake } = this;
    shake.hold(SHAKE.rumble * this.breath.heat);
    shake.update(dt);
    this.rumble.update(dt);
    this.pivot.copyFrom(this.shakeCenter);
    this.position.set(this.shakeCenter.x + shake.x, this.shakeCenter.y + shake.y);
    this.rotation = shake.rotation;
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
    this.bowl.position.copyFrom(center);
    this.bowl.scale.set(BOWL.bowlScale);
    // The label sits by its center, which it grows about
    const label = artPoint('label_dough', 0.5, 0.5);
    this.bowlLabel.layout(label.x + BOWL.labelX, label.y + BOWL.labelY, this.bowl.x);
    this.placeStation('bowl', BOWL, this.bowl.x, this.bowl.y);
    // The ball lives on the scene itself, free to travel to the peel
    this.toLocal(this.bowl.position, this.stations.bowl, this.ballRest);
    this.ballRestScale = (BOWL.fillWidth * this.bowl.width * this.stations.bowl.scale.x) / this.doughBall.texture.width;
    if (this.doughPhase === 'inBowl') this.restBall();
  }

  /** Place the order and its caption from config; the caption keeps its drawn spot below the tray. */
  private layoutOrderTray(): void {
    const { ticketScale, labelX, labelY } = ORDER_TRAY;
    // The ticket sits at the station's anchor, its caption where drawn relative to the tray
    this.ticket.position.set(0, 0);
    this.ticket.scale.set(ticketScale);
    const tray = artPoint('order_tray', 0.5, 0.5);
    const label = artPoint('label_order', 0.5, 0.5);
    this.orderLabel.layout(label.x - tray.x + labelX, label.y - tray.y + labelY, 0);
    this.ticket.layout();
    this.placeStation('orderTray', ORDER_TRAY);
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

  /** Place the peel as drawn, with the dough on its face. */
  private layoutPeel(): void {
    this.peel.position.copyFrom(artPoint('peel', 0, 0));
    this.dough.position.copyFrom(artPoint('peel', PEEL.faceX, PEEL.faceY));
    this.placeStation('peel', PEEL, this.dough.x, this.dough.y);
    this.toLocal(ORIGIN, this.dough, this.peelCenter);
    // Over the dough as it shows, though above every station
    this.served.position.copyFrom(this.peelCenter);
    this.served.scale.set(this.stations.peel.scale.x);
  }

  /** Place the dragon from config and aim the fire from its mouth at the dough, once the peel is placed. */
  private layoutDragon(): void {
    const { dragon } = this;
    dragon.anchor.set(DRAGON.pivotX, DRAGON.pivotY);
    dragon.scale.set(DRAGON.artScale);
    dragon.position.set(0, 0);
    dragon.angle = DRAGON.angle;
    // Mouth relative to the pivot, scaled and rotated with the dragon
    const offsetX = (FIRE.mouthX - DRAGON.pivotX) * dragon.texture.width * DRAGON.artScale;
    const offsetY = (FIRE.mouthY - DRAGON.pivotY) * dragon.texture.height * DRAGON.artScale;
    const cos = Math.cos(dragon.rotation);
    const sin = Math.sin(dragon.rotation);
    const mouthX = offsetX * cos - offsetY * sin;
    const mouthY = offsetX * sin + offsetY * cos;
    this.placeStation('dragon', DRAGON);
    const station = this.stations.dragon;
    // The fire draws in its own layer, over the dimmed room, but moves with the dragon
    this.breath.pivot.copyFrom(station.pivot);
    this.breath.position.copyFrom(station.position);
    this.breath.scale.copyFrom(station.scale);
    const target = station.toLocal(ORIGIN, this.dough);
    const rim = station.toLocal({ x: DOUGH.rimRadius, y: 0 }, this.dough);
    this.breath.aim({ x: mouthX, y: mouthY }, target, Math.hypot(rim.x - target.x, rim.y - target.y));
  }

  private buildDragon(): void {
    this.setFiring(false);

    const { dragon } = this;
    dragon.eventMode = 'static';
    // It may overlap the peel, which should still take presses beside the dragon
    dragon.hitArea = opaqueHitArea(dragon);
    // Like the bake button, it only breathes fire once the dough is rolled out, and not once it's cut
    this.onFirePress(dragon, () => this.canBake());
    this.stations.dragon.addChild(dragon);
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
