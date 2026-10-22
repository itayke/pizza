import { Container, Sprite, Texture } from 'pixi.js';
import { GRADE, ORDER_ICON_SCALE, ORDER_TICKET } from '../config';
import { artTexture, drawnRect, type TextureName } from '../core/art';
import { BentText } from '../core/BentText';
import { easeOutCubic } from '../core/easing';
import type { Order, Rule } from '../orders/Order';
import type { Topping } from './ToppingLayer';

// Shares' wedges are drawn from 12 o'clock, clockwise
const PIE_START = -Math.PI / 2;
const DEG_TO_RAD = Math.PI / 180;

/** An icon whose drawn part's larger side is size of the row height; any icons inside it sit off its art's center by
 * x, y, as fractions of the art's larger side. */
type Item = { texture: TextureName; size: number; children?: Item[]; x?: number; y?: number };

const topping = (t: Topping, size = ORDER_TICKET.toppingSize): Item => ({ texture: `topping_${t}_raw`, size: size * ORDER_ICON_SCALE[t] });

/** The icons that spell out a rule, left to right. */
function ruleItems(rule: Rule): Item[] {
  switch (rule.kind) {
    case 'share': {
      // The topping sits on the shaded wedge's centroid
      const angle = (Math.PI * 2) / rule.parts;
      const centroid = rule.parts === 1 ? 0 : (4 * Math.sin(angle / 2)) / (3 * angle);
      const r = ORDER_TICKET.pieRadius * centroid;
      const mid = PIE_START + angle / 2;
      return [{ texture: `order_share_${rule.parts}`, size: 1, children: [{ ...topping(rule.topping, ORDER_TICKET.pieTopping), x: r * Math.cos(mid), y: r * Math.sin(mid) }] }];
    }
    case 'count':
      return [
        { texture: `order_digit_${rule.n}` as TextureName, size: ORDER_TICKET.digitSize },
        { texture: 'order_times', size: ORDER_TICKET.timesSize },
        topping(rule.topping),
      ];
    case 'apart':
      return [topping(rule.a), { texture: 'order_apart', size: ORDER_TICKET.apartSize }, topping(rule.b)];
  }
}

/**
 * The order in the tray: a picture of the pizza to copy, or a row of icons per rule and one for how baked when past
 * normal; in the tray's art space, centered on it. A served pizza's grade is stamped over it until the next order.
 */
export class OrderTicket extends Container {
  private rows: Item[][] = [];
  private readonly content = new Container();
  /** The picture order, if it's one, and its texture, which the ticket owns. */
  private readonly picture = new Sprite({ anchor: 0.5 });
  private pictured: Texture | null = null;
  /** How far the pictured pizza reaches from the texture's center, texture px. */
  private picturedRadius = 1;
  private readonly grade = new BentText();
  /** Seconds since the grade was stamped. */
  private gradeAge = Infinity;

  constructor(private readonly trayWidth: number, private readonly trayHeight: number) {
    super();
    this.eventMode = 'none';
    this.picture.visible = this.grade.visible = false;
    this.addChild(this.content, this.picture, this.grade);
  }

  /** Show a rule order. */
  showRules(order: Order): void {
    this.rows = order.rules.map(ruleItems);
    if (order.doneness !== 'normal') this.rows.push([{ texture: `order_${order.doneness}`, size: ORDER_TICKET.flameSize }]);
    this.setPicture(null);
    this.showGrade(null);
    this.layout();
  }

  /** Show a picture order, its pizza radius texture px from the texture's center, taking over its texture. */
  showPicture(texture: Texture, radius: number): void {
    this.rows = [];
    this.setPicture(texture);
    this.picturedRadius = Math.max(1, radius);
    this.showGrade(null);
    this.layout();
  }

  /** Stamp a grade over the order, or take it off. */
  showGrade(grade: string | null): void {
    this.grade.visible = grade !== null;
    this.gradeAge = 0;
    if (grade !== null) this.grade.set(grade, GRADE.cap, 0);
    this.update(0);
  }

  /** The grade lands from large. */
  update(dt: number): void {
    if (!this.grade.visible) return;
    this.gradeAge += dt;
    const t = GRADE.popSeconds > 0 ? Math.min(1, this.gradeAge / GRADE.popSeconds) : 1;
    this.grade.scale.set(GRADE.popScale + (1 - GRADE.popScale) * easeOutCubic(t));
    this.grade.alpha = t;
  }

  private setPicture(texture: Texture | null): void {
    if (this.pictured !== texture) this.pictured?.destroy(true);
    this.pictured = texture;
    this.picture.texture = texture ?? Texture.EMPTY;
    this.picture.visible = texture !== null;
  }

  /** Lay out the order and the grade's spot. */
  layout(): void {
    this.layoutRows();
    const { width, height, offsetY, pictureSize } = ORDER_TICKET;
    const size = Math.min(width * this.trayWidth, height * this.trayHeight) * pictureSize;
    // The pizza fills it; the texture's clear margins spill past
    this.picture.scale.set(size / (2 * this.picturedRadius));
    // Its nudge is in design px, whatever the tray is scaled by
    const nudge = 1 / this.scale.x;
    this.picture.position.set(ORDER_TICKET.pictureX * nudge, offsetY * this.trayHeight + ORDER_TICKET.pictureY * nudge);
    this.grade.tint = GRADE.color;
    this.grade.position.set(this.picture.x + GRADE.x, this.picture.y + GRADE.y);
    this.grade.rotation = GRADE.tilt * DEG_TO_RAD;
  }

  /** Stack the rows, centered in the tray, each as tall as fits, centered and no wider than it. */
  private layoutRows(): void {
    for (const child of this.content.removeChildren()) child.destroy({ children: true });
    const { width, height, offsetY, rowHeight, rowGap, itemGap } = ORDER_TICKET;
    const maxWidth = width * this.trayWidth;
    const count = this.rows.length;
    const rowH = Math.min(rowHeight, (height * this.trayHeight - rowGap * (count - 1)) / count);
    let y = offsetY * this.trayHeight - ((rowH + rowGap) * count - rowGap) / 2 + rowH / 2;
    for (const items of this.rows) {
      const row = this.content.addChild(new Container());
      let x = 0;
      for (const item of items) {
        const icon = this.icon(item, rowH);
        row.addChild(icon.view).x = x + icon.width / 2;
        x += icon.width + itemGap;
      }
      const rowWidth = Math.max(0, x - itemGap);
      row.scale.set(Math.min(1, maxWidth / rowWidth));
      row.position.set((-rowWidth * row.scale.x) / 2, y);
      y += rowH + rowGap;
    }
  }

  /** An icon centered on what's drawn of it, with that drawn part's width. */
  private icon(item: Item, rowH: number): { view: Container; width: number } {
    const sprite = new Sprite(artTexture(item.texture));
    const { width, height } = sprite.texture;
    const drawn = drawnRect(sprite.texture);
    sprite.anchor.set((drawn.x + drawn.width / 2) / width, (drawn.y + drawn.height / 2) / height);
    const scale = (item.size * rowH) / Math.max(drawn.width, drawn.height);
    sprite.scale.set(scale);
    const size = { view: sprite as Container, width: drawn.width * scale };
    if (!item.children) return size;
    const group = new Container();
    group.addChild(sprite);
    // Children are placed off the art's center, which sits off the anchor
    const side = Math.max(width, height);
    const centerX = (0.5 - sprite.anchor.x) * width;
    const centerY = (0.5 - sprite.anchor.y) * height;
    for (const child of item.children) {
      const inner = group.addChild(this.icon(child, rowH).view);
      inner.position.set((centerX + (child.x ?? 0) * side) * scale, (centerY + (child.y ?? 0) * side) * scale);
    }
    return { ...size, view: group };
  }
}
