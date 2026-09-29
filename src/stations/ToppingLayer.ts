import { Container, Sprite, type PointData } from 'pixi.js';
import { TOPPINGS, type IngredientId, type RepeatConfig, type ScatterConfig } from '../config';
import { artTexture } from '../core/art';
import { BAKE_PHASES, bakeStep, type BakePhase } from '../core/bake';
import { placedDistance } from '../core/placement';

const TAU = Math.PI * 2;

/** Toppings placed as pieces; each has topping_<id>_<phase> art. */
export type Topping = Exclude<IngredientId, 'sauce'>;

/** One placed piece with every bake phase stacked on it, later phases on top; baking cross-fades them. */
class Piece extends Container {
  private readonly phases: Sprite[];

  /** Position in the dough's polar space: angle, and distance as a fraction of the edge there. */
  constructor(
    topping: Topping,
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
    this.rotation = Math.random() * TAU;
    this.scale.set(TOPPINGS.scale * (1 + TOPPINGS.scaleJitter * (2 * Math.random() - 1)));
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
 * Topping pieces on the dough, kept in its polar space so they follow it as it stretches. Cheese always lies under
 * every other topping, which stack in the order they're placed.
 */
export class ToppingLayer extends Container {
  private readonly cheese = new Container<Piece>();
  private readonly others = new Container<Piece>();
  /** Drag distance since the last drop, design px. */
  private travel = 0;
  /** Drops owed while the pointer rests, or while held for whole toppings. */
  private owed = 0;
  private bakeLevel = 0;

  get pieces(): number {
    return this.cheese.children.length + this.others.children.length;
  }

  constructor(private readonly radiusAt: (angle: number) => number) {
    super();
    this.eventMode = 'none';
    this.addChild(this.cheese, this.others);
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

  /** Show every piece, and those placed later, at a bake level (raw at 0 to burnt at 1). */
  setBake(level: number): void {
    this.bakeLevel = level;
    const { from, t } = bakeStep(level);
    for (const piece of this.all()) piece.setBake(from, t);
  }

  /** Follow the dough's current edge. */
  layout(): void {
    for (const piece of this.all()) this.place(piece);
  }

  clear(): void {
    for (const layer of [this.cheese, this.others]) {
      for (const piece of layer.removeChildren()) piece.destroy({ children: true });
    }
  }

  private all(): Piece[] {
    return [...this.cheese.children, ...this.others.children];
  }

  /** A piece lands somewhere within scatterRadius of (x, y), pulled in past the inner rim. */
  private drop(topping: Topping, config: { scatterRadius: number }, x: number, y: number): void {
    if (this.pieces >= TOPPINGS.maxPieces) return;
    const spread = config.scatterRadius * Math.sqrt(Math.random());
    const heading = Math.random() * TAU;
    const px = x + Math.cos(heading) * spread;
    const py = y + Math.sin(heading) * spread;
    const angle = Math.atan2(py, px);
    const edge = this.radiusAt(angle);
    const fraction = placedDistance(Math.hypot(px, py), edge) / edge;
    const layer = topping === 'cheese' ? this.cheese : this.others;
    const piece = layer.addChild(new Piece(topping, angle, fraction));
    const { from, t } = bakeStep(this.bakeLevel);
    piece.setBake(from, t);
    this.place(piece);
  }

  private place(piece: Piece): void {
    const r = this.radiusAt(piece.polarAngle) * piece.fraction;
    piece.position.set(Math.cos(piece.polarAngle) * r, Math.sin(piece.polarAngle) * r);
  }
}
