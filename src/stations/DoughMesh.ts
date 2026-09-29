import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import { DOUGH, SAUCE } from '../config';
import { artTexture } from '../core/art';
import { BAKE_PHASES, bakeWeights } from '../core/bake';
import { DOUGH_SHAPES } from '../generated/doughShapes';

const TAU = Math.PI * 2;
// Rings past the dough edge, out to the sauce's reach, where only spilled sauce draws
const OUTER_RINGS = 3;

const vertex = `
in vec2 aPosition;
in vec2 aBallUV;
in vec2 aRolledUV;
in float aBlend;
in vec2 aSauceUV;
in float aEdgeFraction;
out vec2 vBallUV;
out vec2 vRolledUV;
out float vBlend;
out vec2 vSauceUV;
out float vEdgeFraction;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vBallUV = aBallUV;
  vRolledUV = aRolledUV;
  vBlend = aBlend;
  vSauceUV = aSauceUV;
  vEdgeFraction = aEdgeFraction;
}
`;

const fragment = `
in vec2 vBallUV;
in vec2 vRolledUV;
in float vBlend;
in vec2 vSauceUV;
in float vEdgeFraction;
out vec4 finalColor;
uniform sampler2D uBall;
uniform sampler2D uRolled;
uniform sampler2D uBaked;
uniform sampler2D uBurnt;
uniform vec3 uBakeWeights;
uniform sampler2D uSauce;
uniform sampler2D uSaucePattern;
uniform vec2 uSauceRepeat;
uniform float uSauceEdge;
uniform float uSauceEdgeWidth;
uniform float uBevelOffset;
uniform float uBevelShade;
uniform vec4 uColor;
// Inner shadow sampling: directions around the point, and rings out to the bevel width (more rounds its profile)
const int BEVEL_DIRECTIONS = 8;
const int BEVEL_RINGS = 2;
const float TAU = 6.2831853;
const float EDGE_BARE = 0.5;
// Past the drawn edge the dough fades out over this fraction of it, so texture borders never show
const float DOUGH_CUTOFF = 0.02;

float sauceAt(vec2 uv) {
  // Soft stamps are thresholded into a crisp, antialiased edge
  return smoothstep(uSauceEdge - uSauceEdgeWidth, uSauceEdge + uSauceEdgeWidth, texture(uSauce, uv).a);
}

void main() {
  // Bake phases share the rolled drawing's canvas, so one UV samples all three (premultiplied, so edges fade too)
  vec4 rolled = texture(uRolled, vRolledUV) * uBakeWeights.x + texture(uBaked, vRolledUV) * uBakeWeights.y
    + texture(uBurnt, vRolledUV) * uBakeWeights.z;
  vec4 dough = mix(texture(uBall, vBallUV), rolled, vBlend) * (1.0 - smoothstep(1.0, 1.0 + DOUGH_CUTOFF, vEdgeFraction));
  // Sauce multiplies over the dough laid on white, so the dough's drawing and bake show through it and sauce
  // spilled past the dough shows as is
  float sauce = sauceAt(vSauceUV);
  vec3 red = texture(uSaucePattern, vSauceUV * uSauceRepeat).rgb * (dough.rgb + 1.0 - dough.a);
  // Inner shadow: darken by how much of the surroundings is bare, so every edge is multiplied
  float around = 0.0;
  for (int ring = 1; ring <= BEVEL_RINGS; ring++) {
    float reach = uBevelOffset * float(ring) / float(BEVEL_RINGS);
    for (int i = 0; i < BEVEL_DIRECTIONS; i++) {
      float angle = TAU * float(i) / float(BEVEL_DIRECTIONS);
      around += sauceAt(vSauceUV + reach * vec2(cos(angle), sin(angle)));
    }
  }
  // Right at an edge about half the surroundings are bare; scale so that reads as full shade
  float bare = min(1.0, (1.0 - around / float(BEVEL_RINGS * BEVEL_DIRECTIONS)) / EDGE_BARE);
  red *= 1.0 - bare * uBevelShade;
  finalColor = vec4(mix(dough.rgb, red, sauce), mix(dough.a, 1.0, sauce)) * uColor;
}
`;

type Shape = { centerX: number; centerY: number; edge: readonly number[] };

/**
 * Polar mesh (spokes × rings) textured with the dough drawings. Each spoke's last dough ring follows its radius,
 * so the drawing stretches per angle; the ball fades into the rolled base as each spoke grows toward the rim.
 * Sauce is sampled from a mask in the same polar space (see SauceLayer); a few rings past the edge carry only sauce.
 */
export class DoughMesh extends Mesh<Geometry, Shader> {
  private readonly spokes: number;
  private readonly rings: number;
  private readonly positions: Float32Array;
  private readonly rolledUVs: Float32Array;
  private readonly blends: Float32Array;
  private readonly sauceUVs: Float32Array;
  private readonly edgeFractions: Float32Array;
  private readonly sauceUniforms: UniformGroup;
  /** Rolled, baked and burnt shares of the base, updated in place. */
  private readonly bakeMix: Float32Array;
  /** Pattern repeats across the dough, per axis. */
  private readonly sauceRepeat: Float32Array;
  /** Sauce pattern width over height, so tiles keep their drawn shape. */
  private readonly patternAspect: number;
  private readonly dirs: Float32Array;
  private readonly rolledEdge: Float32Array;
  private readonly buffers: Buffer[];

  constructor(spokes: number, sauce: Texture = Texture.EMPTY) {
    const rings = DOUGH.meshRings + OUTER_RINGS;
    const count = 1 + spokes * rings;
    const positions = new Float32Array(count * 2);
    const ballUVs = new Float32Array(count * 2);
    const rolledUVs = new Float32Array(count * 2);
    const blends = new Float32Array(count);
    const sauceUVs = new Float32Array(count * 2);
    const edgeFractions = new Float32Array(count);
    const buffers = [positions, ballUVs, rolledUVs, blends, sauceUVs, edgeFractions].map(
      (data) => new Buffer({ data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST }),
    );
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: buffers[0], format: 'float32x2' },
        aBallUV: { buffer: buffers[1], format: 'float32x2' },
        aRolledUV: { buffer: buffers[2], format: 'float32x2' },
        aBlend: { buffer: buffers[3], format: 'float32' },
        aSauceUV: { buffer: buffers[4], format: 'float32x2' },
        aEdgeFraction: { buffer: buffers[5], format: 'float32' },
      },
      indexBuffer: buildIndices(spokes, rings),
    });
    const ball = artTexture('dough_ball');
    const rolled = artTexture('dough_rolled');
    const pattern = artTexture('sauce_pattern');
    const sauceRepeat = new Float32Array(2);
    const sauceUniforms = new UniformGroup({
      uSauceRepeat: { value: sauceRepeat, type: 'vec2<f32>' },
      uSauceEdge: { value: SAUCE.edge, type: 'f32' },
      uSauceEdgeWidth: { value: SAUCE.edgeWidth, type: 'f32' },
      uBevelOffset: { value: 0, type: 'f32' },
      uBevelShade: { value: SAUCE.bevelShade, type: 'f32' },
    });
    const bakeUniforms = new UniformGroup({
      uBakeWeights: { value: bakeWeights(0, new Float32Array(BAKE_PHASES.length)), type: 'vec3<f32>' },
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'dough-mesh' }),
      resources: {
        uBall: ball.source,
        uRolled: rolled.source,
        uBaked: artTexture('dough_baked').source,
        uBurnt: artTexture('dough_burnt').source,
        uSauce: sauce.source,
        uSaucePattern: pattern.source,
        sauceUniforms,
        bakeUniforms,
      },
    });
    super({ geometry, shader, texture: ball });

    this.spokes = spokes;
    this.rings = rings;
    this.positions = positions;
    this.rolledUVs = rolledUVs;
    this.blends = blends;
    this.sauceUVs = sauceUVs;
    this.edgeFractions = edgeFractions;
    this.sauceUniforms = sauceUniforms;
    this.bakeMix = bakeUniforms.uniforms.uBakeWeights;
    this.sauceRepeat = sauceRepeat;
    this.patternAspect = pattern.width / pattern.height;
    this.buffers = buffers;
    this.dirs = new Float32Array(spokes * 2);
    this.rolledEdge = new Float32Array(spokes);
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * TAU;
      this.dirs[i * 2] = Math.cos(angle);
      this.dirs[i * 2 + 1] = Math.sin(angle);
      this.rolledEdge[i] = edgeAt(DOUGH_SHAPES.dough_rolled, angle);
    }
    fillBallUVs(ballUVs, this.dirs, ball.width, ball.height);
    this.buffers[1].update();
  }

  /** Show the rolled base at a bake level, raw at 0 to burnt at 1. */
  setBake(level: number): void {
    bakeWeights(level, this.bakeMix);
  }

  /** Reshape to the given radius per spoke. */
  setRadii(radii: ArrayLike<number>): void {
    const rest = DOUGH.rimRadius * DOUGH.startRatio;
    const full = DOUGH.rimRadius - rest;
    const rolled = DOUGH_SHAPES.dough_rolled;
    const { width, height } = artTexture('dough_rolled');
    const { positions, rolledUVs, blends, sauceUVs, edgeFractions, dirs, rings } = this;
    const toMask = 0.5 / SAUCE.maskReach;
    let blendSum = 0;

    for (let i = 0; i < this.spokes; i++) {
      const r = radii[i];
      const dx = dirs[i * 2];
      const dy = dirs[i * 2 + 1];
      const blend = fade((r - rest) / full);
      blendSum += blend;
      for (let k = 1; k <= rings; k++) {
        const s = ringFraction(k);
        // Stretch grows toward the edge; the center stays near its resting size. Past the edge rings sit at even steps.
        const radius = s <= 1 ? s * (rest + (r - rest) * s ** DOUGH.stretchBias) : s * r;
        const v = 1 + i * rings + (k - 1);
        positions[v * 2] = dx * radius;
        positions[v * 2 + 1] = dy * radius;
        // The rolled base is laid flat under the current shape
        const edgeFraction = radius / r;
        const uv = edgeFraction * this.rolledEdge[i];
        rolledUVs[v * 2] = (rolled.centerX + dx * uv) / width;
        rolledUVs[v * 2 + 1] = (rolled.centerY + dy * uv) / height;
        sauceUVs[v * 2] = 0.5 + edgeFraction * dx * toMask;
        sauceUVs[v * 2 + 1] = 0.5 + edgeFraction * dy * toMask;
        edgeFractions[v] = edgeFraction;
        blends[v] = blend;
      }
    }
    rolledUVs[0] = rolled.centerX / width;
    rolledUVs[1] = rolled.centerY / height;
    blends[0] = blendSum / this.spokes;
    sauceUVs[0] = 0.5;
    sauceUVs[1] = 0.5;
    // Follow config live for the tuning panel
    const u = this.sauceUniforms.uniforms;
    // The mask spans maskReach dough widths, so the pattern repeats that much more across it
    this.sauceRepeat[0] = SAUCE.patternRepeat * SAUCE.maskReach;
    this.sauceRepeat[1] = SAUCE.patternRepeat * SAUCE.maskReach * this.patternAspect;
    u.uSauceEdge = SAUCE.edge;
    u.uSauceEdgeWidth = SAUCE.edgeWidth;
    // Mask spans maskReach dough diameters; the rim radius stands in for the current size
    u.uBevelOffset = SAUCE.bevelWidth / (2 * DOUGH.rimRadius * SAUCE.maskReach);
    u.uBevelShade = SAUCE.bevelShade;

    for (const i of [0, 2, 3, 4, 5]) this.buffers[i].update();
  }
}

/** Ball UVs never change: each ring maps to its fraction of the drawing's edge. */
function fillBallUVs(uvs: Float32Array, dirs: Float32Array, width: number, height: number): void {
  const rings = DOUGH.meshRings + OUTER_RINGS;
  const ball = DOUGH_SHAPES.dough_ball;
  const spokes = dirs.length / 2;
  uvs[0] = ball.centerX / width;
  uvs[1] = ball.centerY / height;
  for (let i = 0; i < spokes; i++) {
    const edge = edgeAt(ball, (i / spokes) * TAU);
    for (let k = 1; k <= rings; k++) {
      const v = 1 + i * rings + (k - 1);
      const uv = ringFraction(k) * edge;
      uvs[v * 2] = (ball.centerX + dirs[i * 2] * uv) / width;
      uvs[v * 2 + 1] = (ball.centerY + dirs[i * 2 + 1] * uv) / height;
    }
  }
}

/** Ring k's distance as a fraction of the dough edge: even steps to the edge, then even steps out to the sauce's reach. */
function ringFraction(k: number): number {
  const inner = DOUGH.meshRings;
  return k <= inner ? k / inner : 1 + ((SAUCE.maskReach - 1) * (k - inner)) / OUTER_RINGS;
}

/** Center fan to the first ring, then a quad between each pair of rings. */
function buildIndices(spokes: number, rings: number): Uint16Array {
  const indices: number[] = [];
  const at = (i: number, k: number) => 1 + (i % spokes) * rings + (k - 1);
  for (let i = 0; i < spokes; i++) {
    indices.push(0, at(i, 1), at(i + 1, 1));
    for (let k = 1; k < rings; k++) {
      const a = at(i, k);
      const b = at(i + 1, k);
      const c = at(i, k + 1);
      const d = at(i + 1, k + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  return new Uint16Array(indices);
}

/** Drawn edge radius at an angle, interpolated. */
function edgeAt(shape: Shape, angle: number): number {
  const n = shape.edge.length;
  const f = ((((angle / TAU) * n) % n) + n) % n;
  const i = Math.floor(f);
  const t = f - i;
  return shape.edge[i] * (1 - t) + shape.edge[(i + 1) % n] * t;
}

/** Ball-to-rolled mix from growth progress (0 at rest, 1 at the rim). */
function fade(progress: number): number {
  const t = Math.min(1, Math.max(0, (progress - DOUGH.rolledFadeStart) / (DOUGH.rolledFadeEnd - DOUGH.rolledFadeStart)));
  return t * t * (3 - 2 * t);
}
