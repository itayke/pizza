import { Container, Sprite, type PointData } from 'pixi.js';
import { TOPPINGS, type ScatterConfig } from '../config';
import { artTexture } from '../core/art';
import { BAKE_PHASES, bakeStep, type BakePhase } from '../core/bake';

const TAU = Math.PI * 2;

/** Toppings that scatter as pieces; each has topping_<id>_<phase> art. */
export type ScatterTopping = 'cheese';

/** One placed piece with every bake phase stacked on it, later phases on top; baking cross-fades them. */
class Piece extends Container {
  private readonly phases: Sprite[];

  /** Position in the dough's polar space: angle, and distance as a fraction of the edge there. */
  constructor(
    topping: ScatterTopping,
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

/** Topping pieces on the dough, kept in its polar space so they follow it as it stretches. */
export class ToppingLayer extends Container<Piece> {
  /** Drag distance since the last drop, design px. */
  private travel = 0;
  /** Drops owed while the pointer rests. */
  private owed = 0;
  private bakeLevel = 0;

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
  scatter(topping: ScatterTopping, config: ScatterConfig, from: PointData, to: PointData, dt: number): void {
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
    for (const piece of this.removeChildren()) piece.destroy({ children: true });
  }

  /** A piece lands somewhere within scatterRadius of (x, y), if that's on the dough. */
  private drop(topping: ScatterTopping, config: ScatterConfig, x: number, y: number): void {
    if (this.children.length >= TOPPINGS.maxPieces) return;
    const spread = config.scatterRadius * Math.sqrt(Math.random());
    const heading = Math.random() * TAU;
    const px = x + Math.cos(heading) * spread;
    const py = y + Math.sin(heading) * spread;
    const angle = Math.atan2(py, px);
    const fraction = Math.hypot(px, py) / this.radiusAt(angle);
    if (fraction > TOPPINGS.edgeFraction) return;
    const piece = this.addChild(new Piece(topping, angle, fraction));
    const { from, t } = bakeStep(this.bakeLevel);
    piece.setBake(from, t);
    this.place(piece);
  }

  private place(piece: Piece): void {
    const r = this.radiusAt(piece.polarAngle) * piece.fraction;
    piece.position.set(Math.cos(piece.polarAngle) * r, Math.sin(piece.polarAngle) * r);
  }
}
