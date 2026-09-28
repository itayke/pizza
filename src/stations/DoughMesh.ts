import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import { DOUGH, SAUCE } from '../config';
import { artTexture } from '../core/art';
import { DOUGH_SHAPES } from '../generated/doughShapes';

const TAU = Math.PI * 2;

const vertex = `
in vec2 aPosition;
in vec2 aBallUV;
in vec2 aRolledUV;
in float aBlend;
in vec2 aSauceUV;
out vec2 vBallUV;
out vec2 vRolledUV;
out float vBlend;
out vec2 vSauceUV;
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
}
`;

const fragment = `
in vec2 vBallUV;
in vec2 vRolledUV;
in float vBlend;
in vec2 vSauceUV;
out vec4 finalColor;
uniform sampler2D uBall;
uniform sampler2D uRolled;
uniform sampler2D uSauce;
uniform sampler2D uSaucePattern;
uniform vec2 uSauceRepeat;
uniform float uSauceGrain;
uniform float uSauceEdge;
uniform float uSauceEdgeWidth;
uniform float uBevelOffset;
uniform float uBevelShade;
uniform vec4 uColor;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float MIN_ALPHA = 0.001;
// Inner shadow sampling: directions around the point, and rings out to the bevel width (more rounds its profile)
const int BEVEL_DIRECTIONS = 8;
const int BEVEL_RINGS = 2;
const float TAU = 6.2831853;
const float EDGE_BARE = 0.5;

float sauceAt(vec2 uv) {
  // Soft stamps are thresholded into a crisp, antialiased edge
  return smoothstep(uSauceEdge - uSauceEdgeWidth, uSauceEdge + uSauceEdgeWidth, texture(uSauce, uv).a);
}

void main() {
  vec4 dough = mix(texture(uBall, vBallUV), texture(uRolled, vRolledUV), vBlend);
  // Sauce takes the dough's alpha so it never spills past the drawn edge (colors are premultiplied)
  float sauce = sauceAt(vSauceUV);
  vec3 red = texture(uSaucePattern, vSauceUV * uSauceRepeat).rgb * dough.a;
  // The drawing's pencil grain shows through
  float grain = dot(dough.rgb, LUMA) / max(dough.a, MIN_ALPHA);
  red *= mix(1.0, grain, uSauceGrain);
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
  finalColor = vec4(mix(dough.rgb, red, sauce), dough.a) * uColor;
}
`;

type Shape = { centerX: number; centerY: number; edge: readonly number[] };

/**
 * Polar mesh (spokes × rings) textured with the dough drawings. Each spoke's outer ring follows its radius,
 * so the drawing stretches per angle; the ball fades into the rolled base as each spoke grows toward the rim.
 * Sauce is sampled from a mask in the same polar space (see SauceLayer).
 */
export class DoughMesh extends Mesh<Geometry, Shader> {
  private readonly spokes: number;
  private readonly rings: number;
  private readonly positions: Float32Array;
  private readonly rolledUVs: Float32Array;
  private readonly blends: Float32Array;
  private readonly sauceUVs: Float32Array;
  private readonly sauceUniforms: UniformGroup;
  /** Pattern repeats across the dough, per axis. */
  private readonly sauceRepeat: Float32Array;
  /** Sauce pattern width over height, so tiles keep their drawn shape. */
  private readonly patternAspect: number;
  private readonly dirs: Float32Array;
  private readonly rolledEdge: Float32Array;
  private readonly buffers: Buffer[];

  constructor(spokes: number, sauce: Texture = Texture.EMPTY) {
    const rings = DOUGH.meshRings;
    const count = 1 + spokes * rings;
    const positions = new Float32Array(count * 2);
    const ballUVs = new Float32Array(count * 2);
    const rolledUVs = new Float32Array(count * 2);
    const blends = new Float32Array(count);
    const sauceUVs = new Float32Array(count * 2);
    const buffers = [positions, ballUVs, rolledUVs, blends, sauceUVs].map(
      (data) => new Buffer({ data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST }),
    );
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: buffers[0], format: 'float32x2' },
        aBallUV: { buffer: buffers[1], format: 'float32x2' },
        aRolledUV: { buffer: buffers[2], format: 'float32x2' },
        aBlend: { buffer: buffers[3], format: 'float32' },
        aSauceUV: { buffer: buffers[4], format: 'float32x2' },
      },
      indexBuffer: buildIndices(spokes, rings),
    });
    const ball = artTexture('dough_ball');
    const rolled = artTexture('dough_rolled');
    const pattern = artTexture('sauce_pattern');
    const sauceRepeat = new Float32Array(2);
    const sauceUniforms = new UniformGroup({
      uSauceRepeat: { value: sauceRepeat, type: 'vec2<f32>' },
      uSauceGrain: { value: SAUCE.grain, type: 'f32' },
      uSauceEdge: { value: SAUCE.edge, type: 'f32' },
      uSauceEdgeWidth: { value: SAUCE.edgeWidth, type: 'f32' },
      uBevelOffset: { value: 0, type: 'f32' },
      uBevelShade: { value: SAUCE.bevelShade, type: 'f32' },
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'dough-mesh' }),
      resources: {
        uBall: ball.source,
        uRolled: rolled.source,
        uSauce: sauce.source,
        uSaucePattern: pattern.source,
        sauceUniforms,
      },
    });
    super({ geometry, shader, texture: ball });

    this.spokes = spokes;
    this.rings = rings;
    this.positions = positions;
    this.rolledUVs = rolledUVs;
    this.blends = blends;
    this.sauceUVs = sauceUVs;
    this.sauceUniforms = sauceUniforms;
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
    fillBallUVs(ballUVs, this.dirs, rings, ball.width, ball.height);
    this.buffers[1].update();
  }

  /** Reshape to the given radius per spoke. */
  setRadii(radii: ArrayLike<number>): void {
    const rest = DOUGH.rimRadius * DOUGH.startRatio;
    const full = DOUGH.rimRadius - rest;
    const rolled = DOUGH_SHAPES.dough_rolled;
    const { width, height } = artTexture('dough_rolled');
    const { positions, rolledUVs, blends, sauceUVs, dirs, rings } = this;
    let blendSum = 0;

    for (let i = 0; i < this.spokes; i++) {
      const r = radii[i];
      const dx = dirs[i * 2];
      const dy = dirs[i * 2 + 1];
      const blend = fade((r - rest) / full);
      blendSum += blend;
      for (let k = 1; k <= rings; k++) {
        const s = k / rings;
        // Stretch grows toward the edge; the center stays near its resting size
        const radius = s * (rest + (r - rest) * s ** DOUGH.stretchBias);
        const v = 1 + i * rings + (k - 1);
        positions[v * 2] = dx * radius;
        positions[v * 2 + 1] = dy * radius;
        // The rolled base is laid flat under the current shape
        const edgeFraction = radius / r;
        const uv = edgeFraction * this.rolledEdge[i];
        rolledUVs[v * 2] = (rolled.centerX + dx * uv) / width;
        rolledUVs[v * 2 + 1] = (rolled.centerY + dy * uv) / height;
        sauceUVs[v * 2] = 0.5 + 0.5 * edgeFraction * dx;
        sauceUVs[v * 2 + 1] = 0.5 + 0.5 * edgeFraction * dy;
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
    this.sauceRepeat[0] = SAUCE.patternRepeat;
    this.sauceRepeat[1] = SAUCE.patternRepeat * this.patternAspect;
    u.uSauceGrain = SAUCE.grain;
    u.uSauceEdge = SAUCE.edge;
    u.uSauceEdgeWidth = SAUCE.edgeWidth;
    // Mask spans the dough's diameter; the rim radius stands in for the current size
    u.uBevelOffset = SAUCE.bevelWidth / (2 * DOUGH.rimRadius);
    u.uBevelShade = SAUCE.bevelShade;

    for (const i of [0, 2, 3, 4]) this.buffers[i].update();
  }
}

/** Ball UVs never change: ring s of each spoke maps to that fraction of the drawing's edge. */
function fillBallUVs(uvs: Float32Array, dirs: Float32Array, rings: number, width: number, height: number): void {
  const ball = DOUGH_SHAPES.dough_ball;
  const spokes = dirs.length / 2;
  uvs[0] = ball.centerX / width;
  uvs[1] = ball.centerY / height;
  for (let i = 0; i < spokes; i++) {
    const edge = edgeAt(ball, (i / spokes) * TAU);
    for (let k = 1; k <= rings; k++) {
      const v = 1 + i * rings + (k - 1);
      const uv = (k / rings) * edge;
      uvs[v * 2] = (ball.centerX + dirs[i * 2] * uv) / width;
      uvs[v * 2 + 1] = (ball.centerY + dirs[i * 2 + 1] * uv) / height;
    }
  }
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
