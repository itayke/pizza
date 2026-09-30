import { Circle, Container, Graphics, Point, type FederatedPointerEvent, type PointData, type Renderer } from 'pixi.js';
import { COLORS, DOUGH, PLACEMENT, SAUCE, type ScatterConfig } from '../config';
import { easeOutCubic } from '../core/easing';
import { placedDistance } from '../core/placement';
import { DoughMesh } from './DoughMesh';
import { SauceLayer } from './SauceLayer';
import { ToppingLayer, type Topping } from './ToppingLayer';

const TAU = Math.PI * 2;

/** Kneadable dough: a ring of radii that grow outward where pressed, capped just past the rim. */
export class Dough extends Container {
  /** Fraction of the rim circle covered by dough. */
  coverage = 0;
  /** How close the dough is to a perfect rim circle; internal score. */
  roundness = 0;
  readonly sauce: SauceLayer;
  readonly toppings = new ToppingLayer((angle) => this.radiusAt(angle));

  private target = new Float32Array(0);
  private shown = new Float32Array(0);
  private readonly body: DoughMesh;
  private readonly pointer = new Point();
  private readonly reach = new Circle();
  private pointerId: number | null = null;
  private slamElapsed = Infinity;
  private placed = false;
  private kneadable = true;

  constructor(renderer: Renderer) {
    super();
    this.sauce = new SauceLayer(renderer);
    this.body = new DoughMesh(DOUGH.points, this.sauce.texture);
    this.addChild(this.buildRim(), this.body, this.toppings);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = this.reach;
    this.on('pointerdown', this.onDown, this);
    this.on('globalpointermove', this.onMove, this);
    this.on('pointerup', this.onUp, this);
    this.on('pointerupoutside', this.onUp, this);
    this.on('pointercancel', this.onUp, this);

    this.reset();
  }

  reset(): void {
    const start = DOUGH.rimRadius * DOUGH.startRatio;
    this.target = new Float32Array(DOUGH.points).fill(start);
    this.shown = new Float32Array(DOUGH.points).fill(start);
    this.pointerId = null;
    this.slamElapsed = Infinity;
    this.sauce.clear();
    this.toppings.clear();
    this.updateReach();
    this.updateMetrics();
    this.draw();
  }

  /** Show the dough body and accept kneading, or hide it (rim stays visible). */
  setPlaced(placed: boolean): void {
    this.body.visible = placed;
    this.placed = placed;
    this.updateInput();
  }

  /** Kneading is off while a tool is in hand. */
  setKneadable(kneadable: boolean): void {
    this.kneadable = kneadable;
    this.updateInput();
  }

  /** Bake the base and toppings to a level, raw at 0 to burnt at 1. */
  setBake(level: number): void {
    this.body.setBake(level);
    this.toppings.setBake(level);
  }

  /** Stamp sauce along a stroke (dough-local points), pulled in past the inner rim; stamps that would reach past the
   * sauce's drawn area are skipped. */
  paintSauce(from: PointData, to: PointData): void {
    this.stampSauce(from, to);
    this.sauce.flush();
  }

  /** Cover everything inside the inner rim with sauce, as strokes around rings stepping out from the center. */
  fillSauce(): void {
    const step = SAUCE.brushRadius * SAUCE.stampSpacing;
    const widest = PLACEMENT.innerRim * Math.max(...this.shown);
    const rings = Math.ceil(widest / step);
    const at = (fraction: number, angle: number) => {
      const r = fraction * this.radiusAt(angle);
      return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    };
    for (let k = 0; k <= rings; k++) {
      const fraction = (PLACEMENT.innerRim * k) / rings;
      const segments = Math.max(1, Math.ceil((TAU * widest * k) / rings / step));
      let from = at(fraction, 0);
      for (let j = 1; j <= segments; j++) {
        const to = at(fraction, (TAU * j) / segments);
        this.stampSauce(from, to);
        from = to;
      }
    }
    this.sauce.flush();
  }

  /** Cover everything inside the inner rim with a topping, as densely as its strokes lay it. */
  fillToppings(topping: Topping, config: ScatterConfig): void {
    let area = 0;
    for (const r of this.shown) area += (PLACEMENT.innerRim * r) ** 2 / 2;
    this.toppings.fill(topping, config, (area * TAU) / this.shown.length);
  }

  /** Queue sauce stamps along a stroke; drawn on flush. */
  private stampSauce(from: PointData, to: PointData): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (SAUCE.brushRadius * SAUCE.stampSpacing)));
    for (let i = 1; i <= count; i++) {
      const x = from.x + (dx * i) / count;
      const y = from.y + (dy * i) / count;
      const angle = Math.atan2(y, x);
      const edge = this.radiusAt(angle);
      const distance = placedDistance(Math.hypot(x, y), edge);
      if (distance + SAUCE.brushRadius > edge * SAUCE.maskReach) continue;
      // Dough units: the edge is the unit circle, whatever its current radius
      const fraction = distance / edge;
      this.sauce.stamp(fraction * Math.cos(angle), fraction * Math.sin(angle), SAUCE.brushRadius / edge);
    }
  }

  /** Spread to exactly the rim at once. */
  flattenToRim(): void {
    this.target.fill(DOUGH.rimRadius);
    this.shown.fill(DOUGH.rimRadius);
    this.slamElapsed = Infinity;
    this.updateMetrics();
    this.draw();
  }

  /** Impact on the peel: splat outward from the start size. */
  slam(): void {
    const start = DOUGH.rimRadius * DOUGH.startRatio;
    this.shown.fill(start);
    this.target.fill(start * (1 + DOUGH.slamGrowth));
    this.slamElapsed = 0;
  }

  update(dt: number): void {
    this.toppings.update(dt);
    this.updateReach();
    if (this.pointerId !== null && this.isPointerInReach()) {
      this.push(DOUGH.holdGrowthPerSecond * dt);
    }
    if (this.slamElapsed < DOUGH.slamDuration) {
      this.slamElapsed += dt;
      const k = easeOutCubic(Math.min(1, this.slamElapsed / DOUGH.slamDuration));
      const start = DOUGH.rimRadius * DOUGH.startRatio;
      for (let i = 0; i < this.shown.length; i++) {
        this.shown[i] = start + (this.target[i] - start) * k;
      }
    } else {
      const ease = 1 - Math.exp(-DOUGH.easeRate * dt);
      for (let i = 0; i < this.shown.length; i++) {
        this.shown[i] += (this.target[i] - this.shown[i]) * ease;
      }
    }
    this.updateMetrics();
    this.draw();
  }

  private updateInput(): void {
    this.eventMode = this.placed && this.kneadable ? 'static' : 'none';
    this.pointerId = null;
  }

  private onDown(e: FederatedPointerEvent): void {
    if (this.pointerId !== null) return;
    this.toLocal(e.global, undefined, this.pointer);
    if (!this.isPointerInReach()) return;
    this.pointerId = e.pointerId;
    this.push(DOUGH.tapImpulse);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (e.pointerId === this.pointerId) this.toLocal(e.global, undefined, this.pointer);
  }

  private onUp(e: FederatedPointerEvent): void {
    if (e.pointerId === this.pointerId) this.pointerId = null;
  }

  /** Presses count near the current edge, or anywhere up to the cap with reachOutside. */
  private isPointerInReach(): boolean {
    const { x, y } = this.pointer;
    const limit = DOUGH.reachOutside ? this.reach.radius : this.radiusAt(Math.atan2(y, x)) + DOUGH.grabSlack;
    return Math.hypot(x, y) <= limit;
  }

  private updateReach(): void {
    this.reach.radius = DOUGH.rimRadius * DOUGH.capRatio + DOUGH.grabSlack;
  }

  /** Grow the target radii around the pointer's angle; amount is in rim-radius units. */
  private push(amount: number): void {
    const { x, y } = this.pointer;
    const angle = Math.atan2(y, x);
    const radial = radialWeight(Math.hypot(x, y) / this.radiusAt(angle));
    if (radial <= 0) return;

    const cap = DOUGH.rimRadius * DOUGH.capRatio;
    const twoSigmaSq = 2 * DOUGH.spread * DOUGH.spread;
    const n = this.target.length;
    for (let i = 0; i < n; i++) {
      const diff = wrapAngle((i / n) * TAU - angle);
      const weight = radial * Math.exp(-(diff * diff) / twoSigmaSq) * sizeMultiplier(this.target[i]) * overRimMultiplier(this.target[i]);
      this.target[i] = Math.min(cap, this.target[i] + amount * DOUGH.rimRadius * weight);
    }
  }

  /** Interpolated drawn radius at an angle. */
  private radiusAt(angle: number): number {
    const n = this.shown.length;
    const f = (((angle / TAU) * n) % n + n) % n;
    const i = Math.floor(f);
    const t = f - i;
    return this.shown[i] * (1 - t) + this.shown[(i + 1) % n] * t;
  }

  private updateMetrics(): void {
    const rim = DOUGH.rimRadius;
    let covered = 0;
    let deviation = 0;
    for (const r of this.shown) {
      covered += Math.min(r, rim) ** 2;
      deviation += Math.abs(r - rim);
    }
    const n = this.shown.length;
    this.coverage = covered / (n * rim * rim);
    this.roundness = Math.max(0, 1 - deviation / (n * rim));
  }

  private draw(): void {
    this.body.setRadii(this.shown);
    this.toppings.layout();
  }

  private buildRim(): Graphics {
    const rim = new Graphics();
    const step = TAU / DOUGH.rimDashes;
    for (let i = 0; i < DOUGH.rimDashes; i++) {
      const start = i * step;
      const end = start + step * DOUGH.rimDashFill;
      rim.moveTo(Math.cos(start) * DOUGH.rimRadius, Math.sin(start) * DOUGH.rimRadius);
      rim.arc(0, 0, DOUGH.rimRadius, start, end);
    }
    return rim.stroke({ width: DOUGH.rimWidth, color: COLORS.rim, alpha: DOUGH.rimAlpha });
  }
}

/** Dough ball at the kneading start size. */
export function makeDoughBall(): DoughMesh {
  const ball = new DoughMesh(DOUGH.points);
  ball.setRadii(new Float32Array(DOUGH.points).fill(DOUGH.rimRadius * DOUGH.startRatio));
  return ball;
}

/** Press strength by distance from center as a fraction of the edge: none inside radialInner, full at the edge. */
function radialWeight(fraction: number): number {
  const t = Math.min(1, Math.max(0, (fraction - DOUGH.radialInner) / (1 - DOUGH.radialInner)));
  return t ** DOUGH.radialPower;
}

/** Growth slows as the dough gets bigger; 1 at the start radius. */
function sizeMultiplier(radius: number): number {
  return (DOUGH.rimRadius * DOUGH.startRatio / radius) ** DOUGH.sizePower;
}

/** Past the rim, growth drops to overRimFactor at once, then slows further toward the cap. */
function overRimMultiplier(radius: number): number {
  if (radius <= DOUGH.rimRadius) return 1;
  const t = Math.min(1, (radius - DOUGH.rimRadius) / (DOUGH.rimRadius * (DOUGH.capRatio - 1)));
  return DOUGH.overRimFactor * (1 - t) ** DOUGH.overRimPower;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
