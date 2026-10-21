import { Container, Mesh, MeshGeometry, Point, type Texture } from 'pixi.js';
import { SERVED } from '../config';
import { easeInCubic } from '../core/easing';
import type { SlicedPizza } from './Dough';

const DEG_TO_RAD = Math.PI / 180;

/** A slice on its way out: where it heads (a unit vector), its turn, radians, and when it sets off. */
type Leaving = { mesh: Mesh; start: Point; dx: number; dy: number; spin: number; delay: number };

/** A served pizza's slices, cut from its snapshot and sent out from the center one after another, in random order. Placed where the dough shows. */
export class ServedSlices extends Container<Mesh> {
  private leaving: Leaving[] = [];
  private texture: Texture | null = null;
  private elapsed = 0;

  constructor() {
    super();
    this.eventMode = 'none';
  }

  /** Send a served pizza's slices out, replacing any still leaving. Takes over the snapshot. */
  launch({ texture, half, slices }: SlicedPizza): void {
    this.clear();
    this.texture = texture;
    this.elapsed = 0;
    this.leaving = shuffled(slices).map(({ wedge, outline }, i) => {
      // A fan from the center, sampling the snapshot where each point lies
      const positions = new Float32Array([0, 0, ...outline.flatMap((p) => [p.x, p.y])]);
      const uvs = positions.map((v) => (v + half) / (2 * half));
      const indices = new Uint32Array(outline.slice(1).flatMap((_, k) => [0, k + 1, k + 2]));
      const mesh = this.addChild(new Mesh({ geometry: new MeshGeometry({ positions, uvs, indices }), texture }));
      // Turns about its own middle, along the way out
      const mid = wedge.start + wedge.width / 2;
      const dx = Math.cos(mid);
      const dy = Math.sin(mid);
      const start = new Point(dx * half * sectorCentroid(wedge.width), dy * half * sectorCentroid(wedge.width));
      mesh.pivot.copyFrom(start);
      mesh.position.copyFrom(start);
      return { mesh, start, dx, dy, spin: (Math.random() * 2 - 1) * SERVED.spin * DEG_TO_RAD, delay: i * SERVED.stagger };
    });
  }

  update(dt: number): void {
    if (!this.leaving.length) return;
    this.elapsed += dt;
    let done = true;
    for (const { mesh, start, dx, dy, spin, delay } of this.leaving) {
      const t = SERVED.seconds > 0 ? Math.min(1, Math.max(0, (this.elapsed - delay) / SERVED.seconds)) : 1;
      if (t < 1) done = false;
      const out = easeInCubic(t);
      mesh.position.set(start.x + dx * out * SERVED.distance, start.y + dy * out * SERVED.distance);
      mesh.rotation = out * spin;
      mesh.alpha = t <= SERVED.fadeFrom ? 1 : 1 - (t - SERVED.fadeFrom) / (1 - SERVED.fadeFrom);
    }
    if (done) this.clear();
  }

  private clear(): void {
    for (const mesh of this.removeChildren()) {
      mesh.geometry.destroy();
      mesh.destroy();
    }
    this.leaving = [];
    this.texture?.destroy(true);
    this.texture = null;
  }
}

/** A copy of items in random order. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** How far out a wedge's middle lies, as a fraction of its radius. */
function sectorCentroid(width: number): number {
  const half = width / 2;
  return half > 0 ? (2 * Math.sin(half)) / (3 * half) : 0;
}
