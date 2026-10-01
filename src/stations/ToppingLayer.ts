import { Container, Sprite, type PointData } from 'pixi.js';
import { LANDING, PLACEMENT, TOPPINGS, type IngredientId, type RepeatConfig, type ScatterConfig } from '../config';
import { artTexture } from '../core/art';
import { BAKE_PHASES, bakeStep, type BakePhase } from '../core/bake';
import { easeInQuad } from '../core/easing';
import { placedDistance } from '../core/placement';

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Toppings placed as pieces; each has topping_<id>_<phase> art. */
export type Topping = Exclude<IngredientId, 'sauce'>;

/** One placed piece with every bake phase stacked on it, later phases on top; baking cross-fades them. */
class Piece extends Container {
  private readonly phases: Sprite[];
  /** Resting scale, jitter included. */
  private readonly size: number;
  /** Resting angle, radians. */
  private readonly restAngle: number;
  /** Where it starts rolling from, off the resting angle, radians. */
  private readonly roll: number;
  /** Seconds since placed. */
  private age = 0;

  /** Position in the dough's polar space: angle, and distance as a fraction of the edge there. */
  constructor(
    readonly topping: Topping,
    readonly polarAngle: number,
    readonly fraction: number,
  ) {
    super();
    const sprite = (phase: BakePhase) => {
      const s = new Sprite(artTexture(`topping_${topping}_${phase}`));
      s.anchor.set(0.5);
      return this.addChild(s);
    };
    this.phases = BAKE_PHASES.map(sprite);
    this.restAngle = Math.random() * TAU;
    this.roll = LANDING[`${topping}Roll`] * DEG_TO_RAD * (2 * Math.random() - 1);
    this.size = TOPPINGS.scale * (1 + TOPPINGS.scaleJitter * (2 * Math.random() - 1));
    this.land(0);
  }

  /** Shrink from the topping's landing scale to rest; true once it has landed. */
  land(dt: number): boolean {
    this.age += dt;
    const seconds = LANDING[`${this.topping}Seconds`];
    const t = seconds > 0 ? Math.min(1, this.age / seconds) : 1;
    const start = LANDING[`${this.topping}Scale`];
    const k = easeInQuad(t);
    this.scale.set(this.size * (start + (1 - start) * k));
    this.rotation = this.restAngle + this.roll * (1 - k);
    return t >= 1;
  }

  /**
   * Cross-fade from phase `from` to the next: the upper one fades in over the first half while the lower one stays,
   * then the lower one fades out, so the piece is never see-through and differing silhouettes don't pop.
   */
  setBake(from: number, t: number): void {
    this.phases.forEach((sprite, i) => {
      const alpha = i === from ? Math.min(1, 2 * (1 - t)) : i === from + 1 ? Math.min(1, 2 * t) : 0;
      sprite.alpha = alpha;
      sprite.visible = alpha > 0;
    });
  }
}

/**
 * Topping pieces on the dough, over its sauce, kept in its polar space so they follow it as it stretches. Every
 * topping shares one stack, in the order placed.
 */
export class ToppingLayer extends Container<Piece> {
  /** Drag distance since the last drop, design px. */
  private travel = 0;
  /** Drops owed while the pointer rests, or while held for whole toppings. */
  private owed = 0;
  private bakeLevel = 0;
  /** Pieces still shrinking into place. */
  private readonly landing = new Set<Piece>();

  get pieces(): number {
    return this.children.length;
  }

  constructor(private readonly radiusAt: (angle: number) => number) {
    super();
    this.eventMode = 'none';
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
      this.add(topping, start + i * GOLDEN_ANGLE, PLACEMENT.innerRim * Math.sqrt((i + 0.5) / count));
    }
  }

  has(topping: Topping): boolean {
    return this.children.some((piece) => piece.topping === topping);
  }

  /** Advance pieces that are still landing. */
  update(dt: number): void {
    for (const piece of this.landing) {
      if (piece.land(dt)) this.landing.delete(piece);
    }
  }

  /** Show every piece, and those placed later, at a bake level (raw at 0 to burnt at 1). */
  setBake(level: number): void {
    this.bakeLevel = level;
    const { from, t } = bakeStep(level);
    for (const piece of this.children) piece.setBake(from, t);
  }

  /** Follow the dough's current edge. */
  layout(): void {
    for (const piece of this.children) this.place(piece);
  }

  clear(): void {
    this.landing.clear();
    for (const piece of this.removeChildren()) piece.destroy({ children: true });
  }

  /** A piece lands somewhere within scatterRadius of (x, y), pulled in past the inner rim. */
  private drop(topping: Topping, config: { scatterRadius: number }, x: number, y: number): void {
    const spread = config.scatterRadius * Math.sqrt(Math.random());
    const heading = Math.random() * TAU;
    const px = x + Math.cos(heading) * spread;
    const py = y + Math.sin(heading) * spread;
    const angle = Math.atan2(py, px);
    const edge = this.radiusAt(angle);
    this.add(topping, angle, placedDistance(Math.hypot(px, py), edge) / edge);
  }

  /** A new piece at a polar spot, landing and baked like the rest. */
  private add(topping: Topping, angle: number, fraction: number): void {
    if (this.pieces >= TOPPINGS.maxPieces) return;
    const piece = this.addChild(new Piece(topping, angle, fraction));
    this.landing.add(piece);
    const { from, t } = bakeStep(this.bakeLevel);
    piece.setBake(from, t);
    this.place(piece);
  }

  private place(piece: Piece): void {
    const r = this.radiusAt(piece.polarAngle) * piece.fraction;
    piece.position.set(Math.cos(piece.polarAngle) * r, Math.sin(piece.polarAngle) * r);
  }
}
