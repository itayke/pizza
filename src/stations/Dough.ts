import { Circle, Container, Graphics, Matrix, Mesh, Point, RenderTexture, RopeGeometry, Sprite, Texture, UniformGroup, type BLEND_MODES, type ColorSource, type FederatedPointerEvent, type PointData, type Renderer } from 'pixi.js';
import { COLORS, DOUGH, PLACEMENT, SAUCE, SLICING, type ScatterConfig } from '../config';
import { artTexture } from '../core/art';
import { bakeCurve } from '../core/bake';
import { easeOutCirc, easeOutCubic } from '../core/easing';
import { placedDistance } from '../core/placement';
import { DOUGH_SHAPES } from '../generated/doughShapes';
import { DoughMesh } from './DoughMesh';
import { SauceLayer } from './SauceLayer';
import { ToppingLayer, type Topping } from './ToppingLayer';

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const TRANSPARENT = [0, 0, 0, 0];
// Spokes moving less than this, design px, leave the plain pizza as drawn
const RESHAPE_EPSILON = 0.01;
// Texels across a cut strip, its profile stretched to the strip's width
const PROFILE_TEXELS = 64;
// A cut's wander: path points per wave, and an overtone this many times shorter at this weight, so it never repeats
const WOBBLE_STEPS_PER_WAVE = 8;
const WOBBLE_OVERTONE = 2.3;
const WOBBLE_OVERTONE_WEIGHT = 0.5;
const RGBA = 4;
const OPAQUE = 255;

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
  private readonly rim: Graphics;
  /** Slicing cuts across the pizza, each a groove multiplied over it with a lit lip screened along one side. */
  private readonly cuts = new Container<Mesh>({ visible: false });
  private groove: Texture | null = null;
  private lip: Texture | null = null;
  /** The pizza without sauce, for later sauce passes to multiply over; redrawn when it changes while there are any. */
  private readonly plain: RenderTexture;
  private readonly plainUniforms = new UniformGroup({ uPlainExtent: { value: 0, type: 'f32' } });
  private readonly plainTransform = new Matrix();
  private plainStale = true;
  /** Topping layer version the plain pizza was drawn at. */
  private plainToppings = -1;
  private bakeLevel = 0;
  private readonly pointer = new Point();
  private readonly reach = new Circle();
  private pointerId: number | null = null;
  private slamElapsed = Infinity;
  private placed = false;
  private kneadable = true;

  constructor(private readonly renderer: Renderer) {
    super();
    this.sauce = new SauceLayer(renderer);
    this.body = new DoughMesh(DOUGH.points, this.sauce.texture);
    this.rim = this.buildRim();
    const size = 2 * plainExtent();
    this.plain = RenderTexture.create({ width: size, height: size });
    this.addChild(this.rim, this.body, this.toppings, this.cuts);

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
    this.showCuts(null);
    this.plainStale = true;
    this.updateReach();
    this.updateMetrics();
    this.draw();
  }

  /**
   * Show cuts (angles of lines through the center) across the pizza, edge to edge, or none. Each is a groove with a
   * lip lit along the side away from the light, whose slice edge faces it, wandering slightly as a knife does.
   */
  showCuts(cuts: readonly number[] | null): void {
    for (const child of this.cuts.removeChildren()) {
      child.geometry.destroy();
      child.destroy();
    }
    this.groove?.destroy(true);
    this.lip?.destroy(true);
    const { coreWidth, fadeWidth, lipCore, lipFade } = SLICING;
    const shown = !!cuts?.length;
    this.groove = shown ? profileTexture(coreWidth, fadeWidth) : null;
    this.lip = shown ? profileTexture(lipCore, lipFade) : null;
    this.cuts.visible = shown;
    if (!this.groove || !this.lip) return;
    const light = SLICING.lightAngle * DEG_TO_RAD;
    for (const angle of cuts ?? []) {
      const path = this.cutPath(angle);
      // Across the cut, and how squarely the light meets it
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const facing = nx * Math.cos(light) + ny * Math.sin(light);
      const lipShift = (facing > 0 ? -1 : 1) * SLICING.lipOffset;
      const lipPath = path.map((p) => new Point(p.x + nx * lipShift, p.y + ny * lipShift));
      const lipAlpha = SLICING.lipAlpha * (1 - SLICING.lipFacing + SLICING.lipFacing * Math.abs(facing));
      this.cuts.addChild(
        cutStrip(path, this.groove, coreWidth + 2 * fadeWidth, 'multiply', SLICING.color, SLICING.alpha),
        cutStrip(lipPath, this.lip, lipCore + 2 * lipFade, 'screen', SLICING.lipColor, lipAlpha),
      );
    }
  }

  /** Points along a cut through the center from edge to edge, wandering to either side by up to the wobble. */
  private cutPath(angle: number): Point[] {
    const { wobble, wobbleWave } = SLICING;
    const behind = this.radiusAt(angle + Math.PI);
    const length = behind + this.radiusAt(angle);
    const steps = wobbleWave > 0 ? Math.max(1, Math.ceil((length / wobbleWave) * WOBBLE_STEPS_PER_WAVE)) : 1;
    const phase = Math.random() * TAU;
    const overtonePhase = Math.random() * TAU;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return Array.from({ length: steps + 1 }, (_, i) => {
      const along = (i / steps) * length - behind;
      const wave = wobbleWave > 0 ? (TAU * along) / wobbleWave : 0;
      const sway = Math.sin(wave + phase) + WOBBLE_OVERTONE_WEIGHT * Math.sin(wave * WOBBLE_OVERTONE + overtonePhase);
      const off = (wobble * sway) / (1 + WOBBLE_OVERTONE_WEIGHT);
      return new Point(dx * along - dy * off, dy * along + dx * off);
    });
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

  /** Bake to a level, raw at 0 to burnt at 1: the base all the way, each topping only by the heat since it landed. */
  setBake(level: number): void {
    if (level !== this.bakeLevel) this.plainStale = true;
    this.bakeLevel = level;
    // The art eases through the bake, lingering around the optimal level
    this.body.setBake(bakeCurve(level));
    this.toppings.setBake(level);
  }

  /** Stamp sauce along a stroke (dough-local points), pulled in past the inner rim; stamps that would reach past the
   * sauce's drawn area are skipped. */
  paintSauce(from: PointData, to: PointData): void {
    this.layerSauce();
    this.stampSauce(from, to);
    this.sauce.flush();
  }

  /** Cover everything inside the inner rim with sauce, as strokes around rings stepping out from the center. */
  fillSauce(): void {
    this.layerSauce();
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

  /** Sauce laid over toppings starts a pass above them, up to the cap; past it, the newest pass rises over them. */
  private layerSauce(): void {
    if (!this.toppings.piecesOnTop) return;
    if (this.sauce.passes >= SAUCE.maxPasses) {
      this.toppings.raiseSaucePass();
      return;
    }
    this.toppings.addSaucePass(this.body.makeSaucePass(this.sauce.addPass(), this.plain, this.plainUniforms));
  }

  /** Redraw the plain pizza if it changed and a later sauce pass shows it; call once everything has moved this frame. */
  drawPlain(): void {
    const unchanged = !this.plainStale && this.plainToppings === this.toppings.version;
    if (this.sauce.passes <= 1 || unchanged) return;
    const extent = plainExtent();
    this.plain.source.resize(2 * extent, 2 * extent);
    this.plainUniforms.uniforms.uPlainExtent = extent;
    this.rim.visible = false;
    const cutsShown = this.cuts.visible;
    this.cuts.visible = false;
    this.toppings.setSaucePassesVisible(false);
    this.body.setSauceShown(false);
    // Dough-local, with its center in the middle of the texture
    const transform = this.plainTransform.identity().translate(extent, extent);
    this.renderer.render({ container: this, target: this.plain, clear: true, clearColor: TRANSPARENT, transform });
    this.rim.visible = true;
    this.cuts.visible = cutsShown;
    this.toppings.setSaucePassesVisible(true);
    this.body.setSauceShown(true);
    this.plainStale = false;
    this.plainToppings = this.toppings.version;
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
    this.plainStale = true;
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
    let moved = 0;
    if (this.slamElapsed < DOUGH.slamDuration) {
      this.slamElapsed += dt;
      const k = easeOutCubic(Math.min(1, this.slamElapsed / DOUGH.slamDuration));
      const start = DOUGH.rimRadius * DOUGH.startRatio;
      for (let i = 0; i < this.shown.length; i++) {
        const next = start + (this.target[i] - start) * k;
        moved = Math.max(moved, Math.abs(next - this.shown[i]));
        this.shown[i] = next;
      }
    } else {
      const ease = 1 - Math.exp(-DOUGH.easeRate * dt);
      for (let i = 0; i < this.shown.length; i++) {
        const step = (this.target[i] - this.shown[i]) * ease;
        moved = Math.max(moved, Math.abs(step));
        this.shown[i] += step;
      }
    }
    if (moved > RESHAPE_EPSILON) this.plainStale = true;
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
  radiusAt(angle: number): number {
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

/** Furthest any sauce can reach from the dough center, design px: the sauce's reach past the capped dough. */
function plainExtent(): number {
  return DOUGH.rimRadius * DOUGH.capRatio * SAUCE.maskReach;
}

/** Scale at which the dough ball drawing matches the dough as it lands on the peel. */
export function landedBallScale(): number {
  const { edge } = DOUGH_SHAPES.dough_ball;
  const drawn = edge.reduce((sum, r) => sum + r, 0) / edge.length;
  return (DOUGH.rimRadius * DOUGH.startRatio) / drawn;
}

/** The dough ball drawing as a sprite, anchored at the drawn ball's center like the dough. */
export function makeDoughBallSprite(): Sprite {
  const { centerX, centerY } = DOUGH_SHAPES.dough_ball;
  const sprite = new Sprite(artTexture('dough_ball'));
  sprite.anchor.set(centerX / sprite.texture.width, centerY / sprite.texture.height);
  return sprite;
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

/**
 * A cut strip's profile across (down the texture, as a rope runs it): opaque white through a core coreWidth design px
 * wide, then dropping off fast (ease-out circ) to clear over fadeWidth to either side; tinted where drawn.
 */
function profileTexture(coreWidth: number, fadeWidth: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = PROFILE_TEXELS;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(1, PROFILE_TEXELS);
  for (let i = 0; i < PROFILE_TEXELS; i++) {
    // Design px from the middle, then how far into the fade
    const across = Math.abs((i + 0.5) / PROFILE_TEXELS - 0.5) * (coreWidth + 2 * fadeWidth);
    const t = fadeWidth > 0 ? Math.min(1, Math.max(0, (across - coreWidth / 2) / fadeWidth)) : 0;
    const alpha = 1 - easeOutCirc(t);
    image.data.set([OPAQUE, OPAQUE, OPAQUE, Math.round(alpha * OPAQUE)], i * RGBA);
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

/** A strip of a profile texture, width design px across, running along a path. */
function cutStrip(points: Point[], texture: Texture, width: number, blendMode: BLEND_MODES, tint: ColorSource, alpha: number): Mesh {
  // Stretched once along the whole path, so the profile only varies across
  const geometry = new RopeGeometry({ points, width, textureScale: 0 });
  return new Mesh({ geometry, texture, blendMode, tint, alpha });
}
