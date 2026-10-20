import { CanvasSource, Mesh, MeshGeometry, Texture } from 'pixi.js';
import { FONT, LABEL_TEXT } from '../config';

// Room around the measured ink so antialiased edges aren't clipped, design px
const PAD = 2;
// Size the font is measured at to find its capital height
const MEASURE_SIZE = 100;
// A capital whose top marks the capital height
const CAPITAL = 'H';
const ROWS = 2;

/**
 * A word in the hand font, drawn white (tint gives its ink) and bent along an arc. The browser shapes the whole word
 * before it's bent, so any script keeps its joins and direction. Centered on the middle of its capitals.
 */
export class BentText extends Mesh {
  private drawn = '';

  constructor() {
    super({ geometry: new MeshGeometry({}), texture: Texture.EMPTY });
  }

  /** Show text with capitals capHeight design px tall, bent with curvature (1 / radius; positive lifts the ends). */
  set(text: string, capHeight: number, curvature: number): void {
    const { weight, condense, resolution, segment } = LABEL_TEXT;
    const word = cased(text);
    const key = [word, capHeight, curvature, weight, condense, resolution, segment].join('|');
    if (key === this.drawn) return;
    this.drawn = key;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const size = capHeight / capRatio(context);
    context.font = font(size);
    const ink = context.measureText(word);
    // Condensing squeezes the word sideways only
    const width = (ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight) * condense + 2 * PAD;
    const height = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent + 2 * PAD;
    canvas.width = Math.ceil(width * resolution);
    canvas.height = Math.ceil(height * resolution);
    // Resizing the canvas resets its state
    context.scale(resolution * condense, resolution);
    context.font = font(size);
    context.fillStyle = 'white';
    const baseline = PAD + ink.actualBoundingBoxAscent;
    context.fillText(word, PAD / condense + ink.actualBoundingBoxLeft, baseline);

    const old = this.texture;
    this.texture = new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
    if (old !== Texture.EMPTY) old.destroy(true);
    this.geometry.destroy();
    const middle = baseline - capHeight / 2;
    this.geometry = bent(width, -middle, height - middle, curvature, segment);
  }
}

const font = (size: number) => `${LABEL_TEXT.weight} ${size}px "${FONT.family}"`;
const cased = (text: string) => (LABEL_TEXT.uppercase ? text.toLocaleUpperCase() : text);

/** Capital height over font size. */
function capRatio(context: CanvasRenderingContext2D): number {
  context.font = font(MEASURE_SIZE);
  return context.measureText(CAPITAL).actualBoundingBoxAscent / MEASURE_SIZE;
}

const measuring = document.createElement('canvas').getContext('2d')!;

/** The capital height at which text runs maxWidth design px wide, as BentText sets it. */
export function capToFit(text: string, maxWidth: number): number {
  const ratio = capRatio(measuring);
  const span = measuring.measureText(cased(text));
  const width = (span.actualBoundingBoxLeft + span.actualBoundingBoxRight) * LABEL_TEXT.condense;
  return (maxWidth / width) * MEASURE_SIZE * ratio;
}

/**
 * A strip width wide spanning top to bottom (from the bend line, design px), its middle line laid on an arc of the
 * given curvature centered about the origin, split into columns about segment wide.
 */
function bent(width: number, top: number, bottom: number, curvature: number, segment: number): MeshGeometry {
  const columns = Math.max(1, Math.ceil(width / segment));
  // Down by half what the ends lift, so the bent word is centered on its outline
  const lift = curvature ? (1 - Math.cos((width / 2) * curvature)) / curvature : 0;
  const positions = new Float32Array((columns + 1) * ROWS * 2);
  const uvs = new Float32Array(positions.length);
  const indices = new Uint32Array(columns * 6);
  for (let i = 0; i <= columns; i++) {
    const u = width * (i / columns - 0.5);
    const turn = u * curvature;
    for (let row = 0; row < ROWS; row++) {
      const v = row ? bottom : top;
      const at = (i * ROWS + row) * 2;
      // Off the arc's middle line by v, square to it; a straight line when there's no curve
      positions[at] = curvature ? Math.sin(turn) / curvature + v * Math.sin(turn) : u;
      positions[at + 1] = (curvature ? (1 - Math.cos(turn)) / -curvature + v * Math.cos(turn) : v) + lift / 2;
      uvs[at] = i / columns;
      uvs[at + 1] = row;
    }
  }
  for (let i = 0; i < columns; i++) {
    const [a, b, c, d] = [i * ROWS, i * ROWS + 1, (i + 1) * ROWS, (i + 1) * ROWS + 1];
    indices.set([a, c, b, c, d, b], i * 6);
  }
  return new MeshGeometry({ positions, uvs, indices });
}
