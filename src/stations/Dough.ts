import { Circle, Container, Graphics, Point, type FederatedPointerEvent } from 'pixi.js';
import { COLORS, DOUGH } from '../config';

const TAU = Math.PI * 2;

/** Kneadable dough: a ring of radii that grow outward where pressed, capped just past the rim. */
export class Dough extends Container {
  /** Fraction of the rim circle covered by dough. */
  coverage = 0;
  /** How close the dough is to a perfect rim circle; internal score. */
  roundness = 0;

  private target = new Float32Array(0);
  private shown = new Float32Array(0);
  private readonly body = new Graphics();
  private readonly pointer = new Point();
  private readonly reach = new Circle();
  private pointerId: number | null = null;
  private polyBuffer: number[] = [];

  constructor() {
    super();
    // Rim on top so the target stays visible through the dough
    this.addChild(this.body, this.buildRim());

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
    this.polyBuffer = new Array(DOUGH.points * 2);
    this.pointerId = null;
    this.updateReach();
    this.updateMetrics();
    this.draw();
  }

  update(dt: number): void {
    this.updateReach();
    if (this.pointerId !== null && this.isPointerInReach()) {
      this.push(DOUGH.holdGrowthPerSecond * dt);
    }
    const ease = 1 - Math.exp(-DOUGH.easeRate * dt);
    for (let i = 0; i < this.shown.length; i++) {
      this.shown[i] += (this.target[i] - this.shown[i]) * ease;
    }
    this.updateMetrics();
    this.draw();
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
    const n = this.shown.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.polyBuffer[i * 2] = Math.cos(a) * this.shown[i];
      this.polyBuffer[i * 2 + 1] = Math.sin(a) * this.shown[i];
    }
    this.body
      .clear()
      .poly(this.polyBuffer, true)
      .fill(COLORS.dough)
      .stroke({ width: DOUGH.edgeWidth, color: COLORS.doughEdge });
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
