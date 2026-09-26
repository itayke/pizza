import { Container, Graphics } from 'pixi.js';
import { COLORS, DOUGH, DOUGH_BOWL, OUTLINE_WIDTH } from '../config';

/** Placeholder dough source: a bowl holding a dough ball until it's picked up. */
export class DoughBowl extends Container {
  private readonly ball: Graphics;

  constructor() {
    super();
    const bowl = new Graphics()
      .circle(0, 0, DOUGH_BOWL.radius)
      .fill(COLORS.bowl)
      .stroke({ width: OUTLINE_WIDTH, color: COLORS.outline });
    this.ball = makeDoughBall();
    this.addChild(bowl, this.ball);
    this.position.set(DOUGH_BOWL.x, DOUGH_BOWL.y);
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }

  setFilled(filled: boolean): void {
    this.ball.visible = filled;
  }
}

/** Dough ball at the kneading start size. */
export function makeDoughBall(): Graphics {
  return new Graphics()
    .circle(0, 0, DOUGH.rimRadius * DOUGH.startRatio)
    .fill(COLORS.dough)
    .stroke({ width: DOUGH.edgeWidth, color: COLORS.doughEdge });
}
