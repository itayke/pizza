import { Container, Particle, ParticleContainer, Point, Texture, type PointData } from 'pixi.js';
import { EMBERS, FIRE, FIREBALLS } from '../config';
import { artSprite, artTexture } from '../core/art';
import { easeOutBack } from '../core/easing';
import { wander } from '../core/noise';

const TAU = 2 * Math.PI;
const DEGREES = Math.PI / 180;
// Seeds for the flame's two flickers
const SEED_LENGTH = 1;
const SEED_WIDTH = 2;

type Kind = 'ball' | 'puff' | 'ember';

/** A particle and how it moves: sizes in design px, speeds per second. */
interface Spark {
  particle: Particle;
  kind: Kind;
  vx: number;
  vy: number;
  spin: number;
  age: number;
  life: number;
  fromSize: number;
  toSize: number;
  hue: number;
}

/** A value from -1 to 1. */
const spread = (): number => Math.random() * 2 - 1;

/** A color from hue (turns), saturation and value (0 to 1), as a number. */
function hsv(hue: number, saturation: number, value: number): number {
  // Standard HSV to RGB: each channel's distance around the hue wheel, in sixths
  const channel = (n: number) => {
    const k = (n + hue * 6) % 6;
    return Math.round(255 * (value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (channel(5) << 16) | (channel(3) << 8) | channel(1);
}

/** Particles that share a texture, drawn in one batch; spent ones are kept to reuse. */
class Swarm {
  readonly view: ParticleContainer;
  readonly sparks: Spark[] = [];
  private readonly spare: Spark[] = [];

  constructor(readonly texture: Texture) {
    this.view = new ParticleContainer({ texture, dynamicProperties: { position: true, rotation: true, vertex: true, color: true } });
  }

  /** A fresh spark, or none if max are out. */
  spawn(kind: Kind, max: number): Spark | null {
    if (this.sparks.length >= max) return null;
    const spark = this.spare.pop() ?? {
      particle: new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 }),
      kind,
      vx: 0,
      vy: 0,
      spin: 0,
      age: 0,
      life: 0,
      fromSize: 0,
      toSize: 0,
      hue: 0,
    };
    spark.kind = kind;
    spark.age = 0;
    this.sparks.push(spark);
    this.view.particleChildren.push(spark.particle);
    return spark;
  }

  /** Move each spark on by step, dropping those it says are spent. */
  update(additive: boolean, step: (spark: Spark) => boolean): void {
    this.view.blendMode = additive ? 'add' : 'normal';
    const { sparks } = this;
    const particles = this.view.particleChildren;
    // Backward, so sparks spawned meanwhile wait for the next frame
    for (let i = sparks.length - 1; i >= 0; i--) {
      if (step(sparks[i])) continue;
      this.spare.push(sparks[i]);
      sparks[i] = sparks[sparks.length - 1];
      particles[i] = particles[particles.length - 1];
      sparks.pop();
      particles.pop();
    }
    this.view.update();
  }
}

/** The dragon's breath: the drawn flame, rainbow fireballs that splash over the pizza, and embers, all following its heat. */
export class FireBreath extends Container {
  /** Held on, breathing. */
  firing = false;
  /** 0 out to 1 full blast; rises once breathing starts and falls once it stops. */
  heat = 0;
  private readonly flame = artSprite('fire');
  private readonly balls = new Swarm(artTexture('fireball'));
  private readonly embers = new Swarm(artTexture('ember'));
  private readonly mouth = new Point();
  private readonly target = new Point();
  private radius = 0;
  private flameScale = 1;
  private time = 0;
  /** Fractions of a fireball and an ember owed to their spawn rates. */
  private ballsDue = 0;
  private embersDue = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    // Flame art has its round head on the left; the head sits in the mouth, tips reaching for the dough
    this.flame.anchor.set(0, 0.5);
    this.addChild(this.flame, this.balls.view, this.embers.view);
    this.update(0);
  }

  /** Breathe from mouth at a pizza centered on target with radius rim, all in this one's parent's space. */
  aim(mouth: PointData, target: PointData, radius: number): void {
    this.mouth.copyFrom(mouth);
    this.target.copyFrom(target);
    this.radius = radius;
    const dx = target.x - mouth.x;
    const dy = target.y - mouth.y;
    this.flame.position.copyFrom(mouth);
    this.flame.rotation = Math.atan2(dy, dx);
    this.flameScale = (Math.hypot(dx, dy) * FIRE.reach) / this.flame.texture.width;
  }

  update(dt: number): void {
    this.time += dt;
    const seconds = this.firing ? FIRE.riseSeconds : FIRE.fallSeconds;
    const change = seconds > 0 ? dt / seconds : Infinity;
    this.heat = this.firing ? Math.min(1, this.heat + change) : Math.max(0, this.heat - change);

    const grow = this.flameScale * easeOutBack(this.heat, FIRE.overshoot);
    const t = this.time * FIRE.flickerSpeed;
    this.flame.scale.set(grow * (1 + FIRE.flickerLength * wander(t, SEED_LENGTH)), grow * (1 + FIRE.flickerWidth * wander(t, SEED_WIDTH)));
    this.flame.visible = this.heat > 0;

    this.ballsDue += FIREBALLS.perSecond * this.heat * dt;
    for (; this.ballsDue >= 1; this.ballsDue--) this.throwBall();
    this.embersDue += EMBERS.perSecond * this.heat * dt;
    for (; this.embersDue >= 1; this.embersDue--) this.sparkOffFlame();

    this.balls.update(FIREBALLS.additive, (spark) => this.stepBall(spark, dt));
    this.embers.update(EMBERS.additive, (spark) => this.stepEmber(spark, dt));
  }

  /** A fireball from the mouth to a spot on the pizza. */
  private throwBall(): void {
    const spark = this.balls.spawn('ball', FIREBALLS.max);
    if (!spark) return;
    const { particle } = spark;
    particle.x = this.mouth.x + spread() * FIREBALLS.spread;
    particle.y = this.mouth.y + spread() * FIREBALLS.spread;
    // Even over the area it aims at
    const angle = Math.random() * TAU;
    const reach = Math.sqrt(Math.random()) * FIREBALLS.aim * this.radius;
    const dx = this.target.x + reach * Math.cos(angle) - particle.x;
    const dy = this.target.y + reach * Math.sin(angle) - particle.y;
    const distance = Math.hypot(dx, dy);
    const speed = FIREBALLS.speed * (1 + spread() * FIREBALLS.speedJitter);
    spark.vx = (dx / distance) * speed;
    spark.vy = (dy / distance) * speed;
    spark.life = distance / speed;
    spark.fromSize = FIREBALLS.startSize;
    spark.toSize = FIREBALLS.endSize;
    spark.spin = spread() * FIREBALLS.spin * TAU;
    spark.hue = spread() * FIREBALLS.hueSpread;
    particle.rotation = Math.random() * TAU;
  }

  /** A landed fireball bursts into puffs thrown on along its path, and a few embers. */
  private splash(ball: Spark): void {
    const { x, y } = ball.particle;
    const heading = Math.atan2(ball.vy, ball.vx);
    for (let i = 0; i < FIREBALLS.splashPuffs; i++) {
      const spark = this.balls.spawn('puff', FIREBALLS.max);
      if (!spark) break;
      const angle = heading + spread() * FIREBALLS.splashAngle * DEGREES;
      const speed = FIREBALLS.splashSpeed * (1 + spread() * FIREBALLS.speedJitter);
      spark.particle.x = x;
      spark.particle.y = y;
      spark.particle.rotation = Math.random() * TAU;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = FIREBALLS.splashSeconds;
      spark.fromSize = ball.toSize;
      spark.toSize = FIREBALLS.splashSize;
      spark.spin = spread() * FIREBALLS.spin * TAU;
      spark.hue = ball.hue + FIREBALLS.hueAlong + spread() * FIREBALLS.splashHueSpread;
    }
    for (let i = 0; i < EMBERS.splashEmbers; i++) this.spark(x, y);
  }

  /** An ember from somewhere along the flame. */
  private sparkOffFlame(): void {
    const along = Math.random();
    const across = spread() * EMBERS.spread;
    const dx = this.target.x - this.mouth.x;
    const dy = this.target.y - this.mouth.y;
    const length = Math.hypot(dx, dy) || 1;
    this.spark(this.mouth.x + dx * along - (dy / length) * across, this.mouth.y + dy * along + (dx / length) * across);
  }

  private spark(x: number, y: number): void {
    const spark = this.embers.spawn('ember', EMBERS.max);
    if (!spark) return;
    const angle = Math.random() * TAU;
    const speed = Math.random() * EMBERS.speed;
    spark.particle.x = x;
    spark.particle.y = y;
    spark.vx = Math.cos(angle) * speed;
    spark.vy = Math.sin(angle) * speed;
    spark.life = EMBERS.seconds * (1 + spread() * EMBERS.lifeJitter);
    spark.fromSize = EMBERS.size;
    spark.toSize = 0;
    spark.hue = Math.random();
  }

  /** Fly a fireball on, or fan out a puff and fade it; false once spent. */
  private stepBall(spark: Spark, dt: number): boolean {
    const { particle } = spark;
    spark.age += dt;
    if (spark.kind === 'ball' && spark.age >= spark.life) {
      this.splash(spark);
      return false;
    }
    if (spark.age >= spark.life) return false;
    const t = spark.age / spark.life;
    if (spark.kind === 'puff') {
      const slow = Math.exp(-FIREBALLS.splashDrag * dt);
      spark.vx *= slow;
      spark.vy *= slow;
    }
    particle.x += spark.vx * dt;
    particle.y += spark.vy * dt;
    particle.rotation += spark.spin * dt;
    this.size(spark, t, this.balls);
    const whiteness = FIREBALLS.whiteSeconds > 0 ? Math.min(1, spark.age / FIREBALLS.whiteSeconds) : 1;
    // A fireball's hue walks along its flight; a puff keeps where it landed
    const along = spark.kind === 'ball' ? FIREBALLS.hueAlong * t : 0;
    particle.tint = hsv(fraction(FIREBALLS.startHue + spark.hue + along), FIREBALLS.saturation * whiteness, 1);
    particle.alpha = spark.kind === 'puff' ? FIREBALLS.splashAlpha * (1 - t) : FIREBALLS.alpha;
    return true;
  }

  /** Drift an ember up and shrink it; false once spent. */
  private stepEmber(spark: Spark, dt: number): boolean {
    const { particle } = spark;
    spark.age += dt;
    if (spark.age >= spark.life) return false;
    const slow = Math.exp(-EMBERS.drag * dt);
    spark.vx *= slow;
    spark.vy = spark.vy * slow - EMBERS.rise * dt;
    particle.x += spark.vx * dt;
    particle.y += spark.vy * dt;
    this.size(spark, spark.age / spark.life, this.embers);
    particle.tint = hsv(spark.hue, EMBERS.saturation, 1);
    return true;
  }

  /** Size a spark along its life, t from 0 to 1, as design px across. */
  private size(spark: Spark, t: number, swarm: Swarm): void {
    const px = spark.fromSize + (spark.toSize - spark.fromSize) * t;
    const scale = px / swarm.texture.width;
    spark.particle.scaleX = spark.particle.scaleY = scale;
  }
}

/** The part of a value past its whole number, for hues that walk around the wheel. */
const fraction = (value: number): number => value - Math.floor(value);
