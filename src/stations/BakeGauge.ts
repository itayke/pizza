import { Container } from 'pixi.js';
import { BAKE_GAUGE } from '../config';
import { artPoint, artSprite } from '../core/art';
import { ART } from '../generated/artLayout';

/** Bake level dial: the needle swings from raw on the left to burnt on the right. */
export class BakeGauge extends Container {
  private readonly needle = artSprite('gauge_needle');

  constructor() {
    super();
    // Gauge pieces share their own art space; the whole group pivots on the hub
    const hub = artPoint('gauge', BAKE_GAUGE.hubX, BAKE_GAUGE.hubY);
    this.needle.anchor.set(BAKE_GAUGE.pivotX, BAKE_GAUGE.pivotY);
    this.needle.position.set(hub.x, hub.y);
    this.addChild(artSprite('gauge'), artSprite('gauge_label'), this.needle);

    this.pivot.set(hub.x, hub.y);
    this.position.set(BAKE_GAUGE.x, BAKE_GAUGE.y);
    this.scale.set(BAKE_GAUGE.width / ART.gauge.width);
    this.eventMode = 'none';
    this.setLevel(0);
  }

  /** 0 is raw, 1 is burnt. */
  setLevel(level: number): void {
    // Follows config live for the tuning panel
    this.position.set(BAKE_GAUGE.x, BAKE_GAUGE.y);
    this.needle.rotation = (level * 2 - 1) * BAKE_GAUGE.sweep;
  }
}
