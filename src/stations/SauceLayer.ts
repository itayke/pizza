import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { SAUCE } from '../config';
import { artTexture } from '../core/art';

const TAU = Math.PI * 2;
const TRANSPARENT = [0, 0, 0, 0];

/**
 * Where sauce is, as alpha in a square mask over the dough's polar space: the center is the dough center and the
 * inscribed circle is the dough edge. A coarse grid tracks coverage.
 */
export class SauceLayer {
  readonly texture: RenderTexture;
  /** Fraction of the dough painted. */
  coverage = 0;

  private readonly stamps = new Container();
  private used = 0;
  private readonly grid = new Uint8Array(SAUCE.coverageGrid * SAUCE.coverageGrid);
  private readonly discCells: number;
  private covered = 0;

  constructor(private readonly renderer: Renderer) {
    this.texture = RenderTexture.create({ width: SAUCE.textureSize, height: SAUCE.textureSize });
    let disc = 0;
    for (let i = 0; i < this.grid.length; i++) if (this.inDisc(i)) disc++;
    this.discCells = disc;
  }

  /** Queue a stamp at (u, v) with radius in mask units (1 is the full width); drawn on flush. */
  stamp(u: number, v: number, radius: number): void {
    const size = SAUCE.textureSize;
    const sprite = this.nextSprite();
    sprite.position.set(u * size, v * size);
    sprite.scale.set((radius * 2 * size) / sprite.texture.width);
    sprite.rotation = Math.random() * TAU;
    this.markCoverage(u, v, radius * SAUCE.coverageCore);
  }

  /** Draw queued stamps into the mask. */
  flush(): void {
    if (this.used === 0) return;
    this.stamps.children.forEach((sprite, i) => (sprite.visible = i < this.used));
    this.renderer.render({ container: this.stamps, target: this.texture, clear: false });
    this.used = 0;
  }

  clear(): void {
    this.used = 0;
    this.stamps.children.forEach((sprite) => (sprite.visible = false));
    this.renderer.render({ container: this.stamps, target: this.texture, clear: true, clearColor: TRANSPARENT });
    this.grid.fill(0);
    this.covered = 0;
    this.coverage = 0;
  }

  private nextSprite(): Sprite {
    if (this.used === this.stamps.children.length) {
      const sprite = new Sprite(artTexture('sauce_brush'));
      sprite.anchor.set(0.5);
      this.stamps.addChild(sprite);
    }
    return this.stamps.children[this.used++] as Sprite;
  }

  private markCoverage(u: number, v: number, radius: number): void {
    const n = SAUCE.coverageGrid;
    const x0 = Math.max(0, Math.floor((u - radius) * n));
    const x1 = Math.min(n - 1, Math.floor((u + radius) * n));
    const y0 = Math.max(0, Math.floor((v - radius) * n));
    const y1 = Math.min(n - 1, Math.floor((v + radius) * n));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * n + x;
        if (this.grid[i] || !this.inDisc(i)) continue;
        if (Math.hypot((x + 0.5) / n - u, (y + 0.5) / n - v) > radius) continue;
        this.grid[i] = 1;
        this.covered++;
      }
    }
    this.coverage = this.covered / this.discCells;
  }

  private inDisc(i: number): boolean {
    const n = SAUCE.coverageGrid;
    return Math.hypot(((i % n) + 0.5) / n - 0.5, (Math.floor(i / n) + 0.5) / n - 0.5) <= 0.5;
  }
}
