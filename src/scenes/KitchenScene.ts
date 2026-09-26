import { Container, Graphics, Text } from 'pixi.js';
import {
  BAKE_METER,
  BINS,
  COLORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  DRAGON,
  LABEL_FONT_SIZE,
  SERVE_BUTTON,
  TRAY,
} from '../config';

/** Greybox layout of the main play screen. Placeholder shapes until real art lands. */
export class KitchenScene extends Container {
  constructor() {
    super();
    this.addChild(new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(COLORS.table));
    this.buildBins();
    this.buildTray();
    this.buildBakeMeter();
    this.buildDragon();
    this.buildServeButton();
  }

  private buildBins(): void {
    const count = BINS.ids.length;
    const rowWidth = count * BINS.width + (count - 1) * BINS.gap;
    const startX = (DESIGN_WIDTH - rowWidth) / 2;

    BINS.ids.forEach((id, i) => {
      const x = startX + i * (BINS.width + BINS.gap);
      const bin = new Graphics()
        .roundRect(x, BINS.top, BINS.width, BINS.height, BINS.cornerRadius)
        .fill(COLORS.bin)
        .stroke({ width: 6, color: COLORS.binOutline });
      this.addChild(bin, makeLabel(id, x + BINS.width / 2, BINS.top + BINS.height / 2));
    });
  }

  private buildTray(): void {
    const tray = new Graphics()
      .circle(TRAY.x, TRAY.y, TRAY.radius)
      .fill(COLORS.tray)
      .stroke({ width: TRAY.rimWidth, color: COLORS.trayRim });
    this.addChild(tray);
  }

  private buildBakeMeter(): void {
    const { x, y, width, height, targetMin, targetMax } = BAKE_METER;
    // Meter fills bottom-up, so the target zone is measured from the bottom
    const zoneTop = y + height * (1 - targetMax);
    const zoneHeight = height * (targetMax - targetMin);
    const meter = new Graphics()
      .rect(x, y, width, height)
      .fill(COLORS.meterBg)
      .rect(x, zoneTop, width, zoneHeight)
      .fill(COLORS.meterTarget);
    this.addChild(meter);
  }

  private buildDragon(): void {
    const { x, y, width, height } = DRAGON;
    const dragon = new Graphics().ellipse(x + width / 2, y + height / 2, width / 2, height / 2).fill(COLORS.dragon);
    this.addChild(dragon, makeLabel('dragon', x + width / 2, y + height / 2));
  }

  private buildServeButton(): void {
    const { x, y, width, height, cornerRadius } = SERVE_BUTTON;
    const button = new Graphics().roundRect(x, y, width, height, cornerRadius).fill(COLORS.serve);
    this.addChild(button, makeLabel('Serve!', x + width / 2, y + height / 2));
  }
}

function makeLabel(text: string, x: number, y: number): Text {
  const label = new Text({ text, style: { fill: COLORS.label, fontSize: LABEL_FONT_SIZE, fontWeight: 'bold' } });
  label.anchor.set(0.5);
  label.position.set(x, y);
  return label;
}
