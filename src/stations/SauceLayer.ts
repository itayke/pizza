import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { SAUCE } from '../config';
import { artTexture } from '../core/art';
import { inWedge, type Wedge } from '../orders/slicing';

const TAU = Math.PI * 2;
const TRANSPARENT = [0, 0, 0, 0];

/**
 * Where sauce is, as alpha in a square mask over the dough's polar space: the center is the dough center and the
 * inscribed circle is maskReach times the dough edge, so sauce can spill past it. Sauce laid over toppings goes into
 * a mask of its own per pass, stamped from then on; a coarse grid over the dough itself tracks coverage across them all.
 */
export class SauceLayer {
  /** The first pass, under every topping. */
  readonly texture: RenderTexture;
  /** Fraction of the dough painted. */
  coverage = 0;

  /** Every pass's mask, oldest first; stamps draw into the newest. */
  private readonly masks: RenderTexture[];
  private readonly stamps = new Container();
  private used = 0;
  private readonly grid = new Uint8Array(SAUCE.coverageGrid * SAUCE.coverageGrid);
  private readonly discCells: number;
  private covered = 0;

  constructor(private readonly renderer: Renderer) {
    this.texture = this.createMask();
    this.masks = [this.texture];
    let disc = 0;
    for (let i = 0; i < this.grid.length; i++) if (this.inDisc(i)) disc++;
    this.discCells = disc;
  }

  get passes(): number {
    return this.masks.length;
  }

  /** Start a pass over everything laid so far, and return its mask; later stamps draw into it. */
  addPass(): RenderTexture {
    this.flush();
    return this.masks[this.masks.push(this.createMask()) - 1];
  }

  /** Queue a stamp at (x, y) with a radius, in dough units (the dough edge is the unit circle); drawn on flush. */
  stamp(x: number, y: number, radius: number): void {
    const size = SAUCE.textureSize;
    const toMask = 0.5 / SAUCE.maskReach;
    const sprite = this.nextSprite();
    sprite.position.set((0.5 + x * toMask) * size, (0.5 + y * toMask) * size);
    sprite.scale.set((radius * toMask * 2 * size) / sprite.texture.width);
    sprite.rotation = Math.random() * TAU;
    this.markCoverage(x, y, radius * SAUCE.coverageCore);
  }

  /** Draw queued stamps into the mask. */
  flush(): void {
    if (this.used === 0) return;
    this.stamps.children.forEach((sprite, i) => (sprite.visible = i < this.used));
    this.renderer.render({ container: this.stamps, target: this.masks[this.masks.length - 1], clear: false });
    this.used = 0;
  }

  clear(): void {
    this.used = 0;
    for (const mask of this.masks.splice(1)) mask.destroy(true);
    this.wipe(this.texture);
    this.grid.fill(0);
    this.covered = 0;
    this.coverage = 0;
  }

  private createMask(): RenderTexture {
    const mask = RenderTexture.create({ width: SAUCE.textureSize, height: SAUCE.textureSize });
    this.wipe(mask);
    return mask;
  }

  /** Clear a mask to no sauce. */
  private wipe(mask: RenderTexture): void {
    this.stamps.children.forEach((sprite) => (sprite.visible = false));
    this.renderer.render({ container: this.stamps, target: mask, clear: true, clearColor: TRANSPARENT });
  }

  private nextSprite(): Sprite {
    if (this.used === this.stamps.children.length) {
      const sprite = new Sprite(artTexture('sauce_brush'));
      sprite.anchor.set(0.5);
      this.stamps.addChild(sprite);
    }
    return this.stamps.children[this.used++] as Sprite;
  }

  /** Mark grid cells within radius of (x, y), in dough units; the grid spans the dough's bounding square. */
  private markCoverage(x: number, y: number, radius: number): void {
    const n = SAUCE.coverageGrid;
    const cell = (d: number) => Math.floor(((d + 1) / 2) * n);
    const x0 = Math.max(0, cell(x - radius));
    const x1 = Math.min(n - 1, cell(x + radius));
    const y0 = Math.max(0, cell(y - radius));
    const y1 = Math.min(n - 1, cell(y + radius));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * n + cx;
        if (this.grid[i] || !this.inDisc(i)) continue;
        if (Math.hypot(cellCenter(cx, n) - x, cellCenter(cy, n) - y) > radius) continue;
        this.grid[i] = 1;
        this.covered++;
      }
    }
    this.coverage = this.covered / this.discCells;
  }

  /** How much of a slice of the dough, out to reach (a fraction of its edge), is sauced, by the coverage grid. */
  coverageIn(slice: Wedge, reach: number): number {
    const n = SAUCE.coverageGrid;
    let cells = 0;
    let sauced = 0;
    for (let i = 0; i < this.grid.length; i++) {
      const x = cellCenter(i % n, n);
      const y = cellCenter(Math.floor(i / n), n);
      if (Math.hypot(x, y) > reach || !inWedge(Math.atan2(y, x), slice)) continue;
      cells++;
      sauced += this.grid[i];
    }
    return cells ? sauced / cells : 0;
  }

  private inDisc(i: number): boolean {
    const n = SAUCE.coverageGrid;
    return Math.hypot(cellCenter(i % n, n), cellCenter(Math.floor(i / n), n)) <= 1;
  }
}

/** Center of grid cell c of n across the dough, in dough units. */
function cellCenter(c: number, n: number): number {
  return ((c + 0.5) / n) * 2 - 1;
}
