import { Container, Sprite, type PointData } from 'pixi.js';
import { TOPPINGS, type ScatterConfig } from '../config';
import { artTexture } from '../core/art';

const TAU = Math.PI * 2;

export const BAKE_PHASES = ['raw', 'baked', 'burnt'] as const;
export type BakePhase = (typeof BAKE_PHASES)[number];
/** Toppings that scatter as pieces; each has topping_<id>_<phase> art. */
export type ScatterTopping = 'cheese';

/** One placed piece with every bake phase stacked on it; only raw shows until baking cross-fades them. */
class Piece extends Container {
  readonly phases: Record<BakePhase, Sprite>;

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
      s.visible = phase === 'raw';
      return this.addChild(s);
    };
    this.phases = { raw: sprite('raw'), baked: sprite('baked'), burnt: sprite('burnt') };
    this.rotation = Math.random() * TAU;
    this.scale.set(TOPPINGS.scale * (1 + TOPPINGS.scaleJitter * (2 * Math.random() - 1)));
  }
}

/** Topping pieces on the dough, kept in its polar space so they follow it as it stretches. */
export class ToppingLayer extends Container<Piece> {
  /** Drag distance since the last drop, design px. */
  private travel = 0;
  /** Drops owed while the pointer rests. */
  private owed = 0;

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
    this.place(this.addChild(new Piece(topping, angle, fraction)));
  }

  private place(piece: Piece): void {
    const r = this.radiusAt(piece.polarAngle) * piece.fraction;
    piece.position.set(Math.cos(piece.polarAngle) * r, Math.sin(piece.polarAngle) * r);
  }
}
