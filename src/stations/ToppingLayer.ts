import { Container, Point, Sprite, type Geometry, type Mesh, type PointData, type Shader } from 'pixi.js';
import { BURY, HELD, LANDING, PLACEMENT, PULSE, TOPPINGS, type IngredientId, type RepeatConfig, type ScatterConfig } from '../config';
import { artTexture } from '../core/art';
import { BAKE_PHASES, bakeCurve, bakeStep, type BakePhase } from '../core/bake';
import { easeInQuad } from '../core/easing';
import { placedDistance } from '../core/placement';

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ORIGIN = { x: 0, y: 0 };

/** Toppings placed as pieces; each has topping_<id>_<phase> art. */
export type Topping = Exclude<IngredientId, 'sauce'>;

/**
 * One piece with every bake phase stacked on it, later phases on top; baking cross-fades them. It may wait in hand
 * first, posed as it will start landing, and is then dropped as is.
 */
class Piece extends Container {
  private readonly phases: Sprite[];
  /** Additive copy of the raw art that pulses as it lands. */
  private glow: Sprite | null;
  /** Resting scale, jitter included. */
  private readonly size: number;
  /** Resting angle, radians. */
  private readonly restAngle: number;
  /** Where it starts rolling from, off the resting angle, radians. */
  private readonly roll: number;
  /** Position in the dough's polar space: angle, and distance as a fraction of the edge there. */
  polarAngle = 0;
  fraction = 0;
  /** Counts up as pieces are laid, so a later piece lies over an earlier one. */
  laid = 0;
  /** The pizza's bake level when it landed, so it bakes only from then on. */
  private placedAt = 0;
  /** Where it was let go of, off its resting spot, closing in as it lands. */
  private readonly letGo = new Point();
  /** Seconds since dropped. */
  private age = 0;
  /** Landing progress, eased: 0 as dropped, 1 at rest. */
  private settled = 0;

  /** startScale: how large it starts landing, as a multiple of its resting size. */
  constructor(
    readonly topping: Topping,
    private readonly startScale: number,
  ) {
    super();
    const sprite = (phase: BakePhase) => {
      const s = new Sprite(artTexture(`topping_${topping}_${phase}`));
      s.anchor.set(0.5);
      return this.addChild(s);
    };
    this.phases = BAKE_PHASES.map(sprite);
    this.glow = this.addChild(new Sprite({ texture: this.phases[0].texture, anchor: 0.5, blendMode: 'add', alpha: 0 }));
    this.restAngle = Math.random() * TAU;
    this.roll = LANDING[`${topping}Roll`] * DEG_TO_RAD * (2 * Math.random() - 1);
    this.size = TOPPINGS.scale * (1 + TOPPINGS.scaleJitter * (2 * Math.random() - 1));
    this.setBake(this.placedAt);
    this.land(0);
  }

  /** Half its art's larger side at rest, layer px. */
  get halfSize(): number {
    const { width, height } = this.phases[0].texture;
    return (Math.max(width, height) / 2) * this.size;
  }

  /** Let go at a polar spot at the pizza's bake level, from offset (layer px) off it. */
  drop(polarAngle: number, fraction: number, level: number, offset: PointData): void {
    this.polarAngle = polarAngle;
    this.fraction = fraction;
    this.placedAt = level;
    this.letGo.copyFrom(offset);
    this.age = 0;
    this.land(0);
  }

  /** Shrink and roll from its starting pose to rest, pulsing once; true once it has landed and the pulse is over. */
  land(dt: number): boolean {
    this.age += dt;
    const seconds = LANDING[`${this.topping}Seconds`];
    const t = seconds > 0 ? Math.min(1, this.age / seconds) : 1;
    this.settled = easeInQuad(t);
    const k = this.settled;
    this.scale.set(this.size * (this.startScale + (1 - this.startScale) * k));
    this.rotation = this.restAngle + this.roll * (1 - k);
    const pulsed = this.pulse();
    return t >= 1 && pulsed;
  }

  /** Place at its spot in the layer, still off it by what's left of where it was let go. */
  placeAt(x: number, y: number): void {
    const away = 1 - this.settled;
    this.position.set(x + this.letGo.x * away, y + this.letGo.y * away);
  }

  /** Brighten up and back out, each over the pulse's seconds; true once over, when the glow goes. */
  private pulse(): boolean {
    if (!this.glow) return true;
    const t = PULSE.seconds > 0 ? this.age / PULSE.seconds : Infinity;
    if (t < 2) {
      this.glow.alpha = PULSE.strength * (1 - Math.abs(t - 1));
      return false;
    }
    this.glow.destroy();
    this.glow = null;
    return true;
  }

  /**
   * Show the heat it has had at the pizza's bake level, cross-fading from phase `from` to the next: the upper one
   * fades in over the first half while the lower one stays, then the lower one fades out, so the piece is never
   * see-through and differing silhouettes don't pop.
   */
  setBake(level: number): void {
    const { from, t } = bakeStep(bakeCurve(level - this.placedAt));
    this.phases.forEach((sprite, i) => {
      const alpha = i === from ? Math.min(1, 2 * (1 - t)) : i === from + 1 ? Math.min(1, 2 * t) : 0;
      sprite.alpha = alpha;
      sprite.visible = alpha > 0;
    });
  }
}

/**
 * Topping pieces on the dough, over its first sauce pass, kept in its polar space so they follow it as it stretches.
 * Every topping shares one stack with any later sauce passes, in the order laid.
 */
export class ToppingLayer extends Container {
  /** Drag distance since the last drop, design px. */
  private travel = 0;
  /** Drops owed while the pointer rests, or while held for whole toppings. */
  private owed = 0;
  private bakeLevel = 0;
  /** Pieces still shrinking into place. */
  private readonly landing = new Set<Piece>();
  /** Every piece, in the order they go at their topping's cap: buried ones first, then the oldest. */
  private readonly placed: Piece[] = [];
  /** Pieces laid so far, numbering each. */
  private laidCount = 0;
  /** Pieces placed of each topping. */
  private readonly counts = new Map<Topping, number>();
  /** Sauce passes in the stack, oldest first. */
  private readonly passes: Mesh<Geometry, Shader>[] = [];
  /** Bumped whenever a piece is added, moves or goes; sauce passes don't count. */
  private changes = 0;
  /** Where the next piece waits, following the pointer at this layer's scale; set by whoever shows it. */
  hand: Container | null = null;
  /** The topping kept in hand, if any. */
  private holding: Topping | null = null;
  /** The next piece, waiting in hand to be dropped as is; briefly none after a drop. */
  private held: Piece | null = null;
  /** Seconds until the hand gets its next piece after a drop. */
  private refillIn = 0;

  get pieces(): number {
    return this.placed.length;
  }

  get version(): number {
    return this.changes;
  }

  /** Whether a piece lies over the newest sauce pass, or there's no pass in the stack yet but pieces. */
  get piecesOnTop(): boolean {
    return this.children[this.children.length - 1] instanceof Piece;
  }

  constructor(private readonly radiusAt: (angle: number) => number) {
    super();
    this.eventMode = 'none';
  }

  /** Keep the next piece of topping waiting in hand, or none. */
  hold(topping: Topping | null): void {
    if (topping === this.holding) return;
    this.holding = topping;
    this.held?.destroy({ children: true });
    this.held = null;
    this.refill();
  }

  /** Put the next piece in hand, if a topping is held and the hand is empty; fading, it starts clear and fades in. */
  private refill(fade = false): void {
    this.refillIn = 0;
    if (this.held || !this.holding || !this.hand) return;
    this.held = this.hand.addChild(new Piece(this.holding, HELD.pieceScale));
    if (fade && HELD.refillFadeSeconds > 0) this.held.alpha = 0;
  }

  /** A new press drops a piece right away. */
  beginStroke(): void {
    this.travel = 0;
    this.owed = 1;
  }

  /** Drop pieces along a stroke (dough-local points), or at a steady rate while the pointer rests. */
  scatter(topping: Topping, config: ScatterConfig, from: PointData, to: PointData, dt: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      this.travel += length;
      while (this.travel >= config.spacing) {
        this.travel -= config.spacing;
        // Drop points walk back from the stroke end by the distance still carried
        const t = Math.max(0, 1 - this.travel / length);
        this.drop(topping, config, from.x + dx * t, from.y + dy * t);
      }
    }
    // Moving drops by distance; resting drops by time
    if (length === 0) this.owed += config.holdRate * dt;
    for (; this.owed >= 1; this.owed--) this.drop(topping, config, to.x, to.y);
  }

  /** Drop pieces at a steady rate while held, at the pointer (a dough-local point). */
  repeat(topping: Topping, config: RepeatConfig, at: PointData, dt: number): void {
    this.owed += config.holdRate * dt;
    for (; this.owed >= 1; this.owed--) this.drop(topping, config, at.x, at.y);
  }

  /** Scatter pieces evenly inside the inner rim, spanning area design px², as densely as a stroke of config lays them. */
  fill(topping: Topping, config: ScatterConfig, area: number): void {
    // A stroke lays a piece every spacing over a swath scatterRadius either side, at least as wide as pieces are apart
    const swath = config.spacing * Math.max(2 * config.scatterRadius, config.spacing);
    const count = Math.round(area / swath);
    // A sunflower spiral spreads them evenly, with no bald spots or clumps
    const start = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      const fraction = PLACEMENT.innerRim * Math.sqrt((i + 0.5) / count);
      this.add(new Piece(topping, LANDING[`${topping}Scale`]), start + i * GOLDEN_ANGLE, fraction);
    }
  }

  /** Lay a sauce pass over every piece so far. */
  addSaucePass(pass: Mesh<Geometry, Shader>): void {
    this.passes.push(this.addChild(pass));
  }

  /** Bring the newest sauce pass up over every piece, if there's one in the stack. */
  raiseSaucePass(): void {
    const newest = this.passes.at(-1);
    if (newest) this.setChildIndex(newest, this.children.length - 1);
  }

  setSaucePassesVisible(visible: boolean): void {
    for (const pass of this.passes) pass.visible = visible;
  }

  has(topping: Topping): boolean {
    return this.counts.has(topping);
  }

  /** Whether the topping is at its own cap. */
  private full(topping: Topping): boolean {
    const cap = topping === 'cheese' ? TOPPINGS.maxCheese : TOPPINGS.maxPieces;
    return (this.counts.get(topping) ?? 0) >= cap;
  }

  /** Move older pieces of a settled piece's topping centered under it to the front of the line to go. */
  private bury(top: Piece): void {
    const reach = BURY[top.topping] * top.halfSize;
    const buried: Piece[] = [];
    const rest: Piece[] = [];
    for (const piece of this.placed) {
      const under = piece.topping === top.topping && piece.laid < top.laid;
      (under && (piece.x - top.x) ** 2 + (piece.y - top.y) ** 2 <= reach ** 2 ? buried : rest).push(piece);
    }
    if (buried.length) this.placed.splice(0, this.placed.length, ...buried, ...rest);
  }

  private remove(piece: Piece): void {
    this.placed.splice(this.placed.indexOf(piece), 1);
    this.landing.delete(piece);
    this.counts.set(piece.topping, (this.counts.get(piece.topping) ?? 0) - 1);
    piece.destroy({ children: true });
  }

  /** Advance pieces that are still landing. */
  update(dt: number): void {
    if (this.refillIn > 0 && (this.refillIn -= dt) <= 0) this.refill(true);
    const { held } = this;
    if (held && held.alpha < 1) held.alpha = Math.min(1, held.alpha + dt / HELD.refillFadeSeconds);
    if (this.landing.size) this.changes++;
    for (const piece of this.landing) {
      const landed = piece.land(dt);
      this.place(piece);
      if (!landed) continue;
      this.landing.delete(piece);
      this.bury(piece);
    }
  }

  /** Bake the pieces at the pizza's bake level (raw at 0 to burnt at 1), each by the heat since it landed. */
  setBake(level: number): void {
    this.bakeLevel = level;
    for (const piece of this.placed) piece.setBake(level);
  }

  /** Follow the dough's current edge. */
  layout(): void {
    for (const piece of this.placed) this.place(piece);
  }

  clear(): void {
    this.landing.clear();
    this.placed.length = 0;
    this.counts.clear();
    this.laidCount = 0;
    this.passes.length = 0;
    this.changes++;
    // Sauce passes share the dough's geometry, which outlives them
    for (const child of this.removeChildren()) child.destroy({ children: true });
  }

  /**
   * A piece lands somewhere within scatterRadius of (x, y), pulled in past the inner rim. The piece in hand is the one
   * dropped, from where it is; the next takes its place after a moment and fades in, or comes at once and whole if
   * another drop comes first.
   */
  private drop(topping: Topping, config: { scatterRadius: number }, x: number, y: number): void {
    const spread = config.scatterRadius * Math.sqrt(Math.random());
    const heading = Math.random() * TAU;
    const px = x + Math.cos(heading) * spread;
    const py = y + Math.sin(heading) * spread;
    const angle = Math.atan2(py, px);
    const edge = this.radiusAt(angle);
    const fraction = placedDistance(Math.hypot(px, py), edge) / edge;
    if (this.refillIn > 0) this.refill();
    const held = this.held?.topping === topping ? this.held : null;
    if (!held) {
      this.add(new Piece(topping, LANDING[`${topping}Scale`]), angle, fraction);
      return;
    }
    held.alpha = 1;
    const from = this.toLocal(held.getGlobalPosition());
    const r = edge * fraction;
    this.add(held, angle, fraction, { x: from.x - Math.cos(angle) * r, y: from.y - Math.sin(angle) * r });
    this.held = null;
    this.refillIn = HELD.refillSeconds;
    if (this.refillIn <= 0) this.refill();
  }

  /**
   * Lay a piece at a polar spot, landing raw, let go from offset off it. At its topping's cap it takes the place of the
   * first of that topping in line to go, so dropping always works.
   */
  private add(piece: Piece, angle: number, fraction: number, offset: PointData = ORIGIN): void {
    if (this.full(piece.topping)) {
      const next = this.placed.find((p) => p.topping === piece.topping);
      if (next) this.remove(next);
    }
    piece.laid = ++this.laidCount;
    piece.drop(angle, fraction, this.bakeLevel, offset);
    this.placed.push(this.addChild(piece));
    this.counts.set(piece.topping, (this.counts.get(piece.topping) ?? 0) + 1);
    this.changes++;
    this.landing.add(piece);
    piece.setBake(this.bakeLevel);
    this.place(piece);
  }

  private place(piece: Piece): void {
    const r = this.radiusAt(piece.polarAngle) * piece.fraction;
    piece.placeAt(Math.cos(piece.polarAngle) * r, Math.sin(piece.polarAngle) * r);
  }
}
