import { Circle, Container, Graphics } from 'pixi.js';
import { CUTTER } from '../config';

// Placeholder drawing until there's art, in fractions of the button's size: a wheel up and to the left, its handle
// running down and to the right, outlined in ink. Drawn this many px across, so curves stay smooth when scaled
const DRAWN_SIZE = 100;
const WHEEL_RADIUS = 0.28;
const WHEEL_OFFSET = 0.13;
const AXLE_RADIUS = 0.04;
const HANDLE_LENGTH = 0.58;
const HANDLE_WIDTH = 0.16;
const HANDLE_ANGLE = Math.PI / 4;
const OUTLINE = 0.025;
const HIT_RADIUS = 0.5;
const WHEEL_FILL = 0xdfe3e6;
const HANDLE_FILL = 0xc0392b;
const INK = 0x000000;
// Dimmed while it can't be picked up, larger while in hand
const DISABLED_ALPHA = 0.35;
const SELECTED_SCALE = 1.15;

/** The cutter's button: picked up once the pizza is baked, put back with another press. */
export class CutterButton extends Container {
  private selected = false;

  constructor() {
    super();
    this.addChild(drawCutter());
    this.eventMode = 'static';
    this.hitArea = new Circle(0, 0, HIT_RADIUS * DRAWN_SIZE);
    this.layout();
  }

  setState(enabled: boolean, selected: boolean): void {
    this.alpha = enabled || selected ? 1 : DISABLED_ALPHA;
    this.cursor = enabled || selected ? 'pointer' : 'default';
    this.selected = selected;
    this.layout();
  }

  layout(): void {
    this.position.set(CUTTER.x, CUTTER.y);
    this.scale.set((CUTTER.size / DRAWN_SIZE) * (this.selected ? SELECTED_SCALE : 1));
  }
}

/** The placeholder cutter, centered. */
function drawCutter(): Graphics {
  const g = new Graphics();
  const dx = Math.cos(HANDLE_ANGLE) * DRAWN_SIZE;
  const dy = Math.sin(HANDLE_ANGLE) * DRAWN_SIZE;
  const hub = -WHEEL_OFFSET;
  const end = hub + HANDLE_LENGTH;
  // Across the handle, half its width
  const ax = (-dy * HANDLE_WIDTH) / 2;
  const ay = (dx * HANDLE_WIDTH) / 2;
  const outline = { width: OUTLINE * DRAWN_SIZE, color: INK };
  g.poly([hub * dx + ax, hub * dy + ay, end * dx + ax, end * dy + ay, end * dx - ax, end * dy - ay, hub * dx - ax, hub * dy - ay]);
  g.fill(HANDLE_FILL).stroke(outline);
  g.circle(hub * dx, hub * dy, WHEEL_RADIUS * DRAWN_SIZE).fill(WHEEL_FILL).stroke(outline);
  g.circle(hub * dx, hub * dy, AXLE_RADIUS * DRAWN_SIZE).fill(INK);
  return g;
}
