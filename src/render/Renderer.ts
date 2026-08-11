import { Application, Container, Graphics } from "pixi.js";
import { BRICKS, FIELD, PADDLE_Y, TUNING } from "../sim/config";
import { World } from "../sim/World";
import { BRICK_ROW, CRACKED_ALPHA, PAL } from "./palette";

const TRAIL_LEN = 14;

export class Renderer {
  private root = new Container();
  private brickLayer = new Graphics();
  private paddleLayer = new Graphics();
  private ballLayer = new Graphics();
  private trailLayer = new Graphics();
  private burstLayer = new Graphics();
  private flashLayer = new Graphics();

  /** Flat [x, y, vx, vy, msLeft, msTotal, colour] — no per-frame allocation. */
  private sparks: number[] = [];
  private trail: number[] = [];
  private shake = 0;

  /** The last paddle impact: where along it, and how much life the mark has. */
  private impactOffset = 0;
  private impactMs = 0;
  private flashMs = 0;

  constructor(app: Application) {
    app.stage.addChild(this.root);
    this.root.addChild(
      this.brickLayer, this.trailLayer, this.paddleLayer, this.ballLayer,
      this.burstLayer, this.flashLayer,
    );
  }

  /**
   * A brick died. Scaled by the row it came from, so clearing the expensive top
   * rows feels different from clearing the cheap ones without a number saying so.
   */
  burst(x: number, y: number, row: number) {
    const colour = BRICK_ROW[row % BRICK_ROW.length];
    const weight = 1 - row / BRICKS.rows;
    this.shake = Math.max(this.shake, 2 + weight * 4);

    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 180;
      const life = 260 + Math.random() * 320;
      this.sparks.push(
        x, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        life, life, colour,
      );
    }
  }

  /**
   * The ball was returned from `offset` along the paddle, -1 to 1. Marked so
   * the player can see the thing that decided their angle — the mechanic is
   * invisible otherwise, and a mechanic nobody notices is one nobody uses.
   */
  paddleHit(offset: number) {
    this.impactOffset = offset;
    this.impactMs = 240;
    this.shake = Math.max(this.shake, 1.2 + Math.abs(offset) * 1.8);
  }

  /** A life went. The whole field takes the hit, not just the ball. */
  lostLife() {
    this.flashMs = 360;
    this.shake = Math.max(this.shake, 9);
  }

  draw(world: World, alpha: number, deltaMS: number) {
    this.tickShake(deltaMS);
    this.tickSparks(deltaMS);
    this.impactMs = Math.max(0, this.impactMs - deltaMS);
    this.flashMs = Math.max(0, this.flashMs - deltaMS);

    const bx = world.ball.prevX + (world.ball.x - world.ball.prevX) * alpha;
    const by = world.ball.prevY + (world.ball.y - world.ball.prevY) * alpha;

    this.drawBricks(world);
    this.drawPaddle(world);
    this.drawTrail(bx, by, world.docked);
    this.drawFlash();

    this.ballLayer.clear();
    this.ballLayer.circle(bx, by, TUNING.ballRadius).fill({ color: PAL.ball });
  }

  private drawBricks(world: World) {
    this.brickLayer.clear();
    for (const brick of world.bricks) {
      const { x0, y0, x1, y1 } = brick.box;
      // Damage as a fraction of what the brick started at, so a three-hit
      // brick reads as tougher than a two-hit one at a glance — the layouts
      // mix them, and the player has to be able to see which is which.
      const wear = brick.hp / brick.maxHp;
      this.brickLayer
        .roundRect(x0, y0, x1 - x0, y1 - y0, 3)
        .fill({
          color: BRICK_ROW[brick.row % BRICK_ROW.length],
          alpha: CRACKED_ALPHA + (1 - CRACKED_ALPHA) * wear,
        });

      // A tough brick still at full health gets an inner outline: alpha alone
      // cannot say "this one takes three" before you have hit it once.
      if (brick.maxHp > 1 && brick.hp === brick.maxHp) {
        this.brickLayer
          .roundRect(x0 + 3, y0 + 3, x1 - x0 - 6, y1 - y0 - 6, 2)
          .stroke({ width: 1, color: 0x0b0f14, alpha: 0.5 });
      }
    }
  }

  private drawPaddle(world: World) {
    const width = world.paddleWidth;
    const half = width / 2;
    const t = this.impactMs / 240;

    this.paddleLayer.clear();

    // Squashed on impact. Two frames of this is the difference between a bar
    // and something the ball landed on.
    const squash = 1 - t * 0.35;
    const h = TUNING.paddleHeight * squash;
    this.paddleLayer
      .roundRect(world.paddleX - half, PADDLE_Y + (TUNING.paddleHeight - h), width, h, 5)
      .fill({ color: PAL.paddle });

    if (t > 0) {
      // The impact point itself, in the ball's colour so the connection reads
      // without being explained. Off centre it is the angle you just bought.
      const x = world.paddleX + this.impactOffset * half;
      this.paddleLayer
        .circle(x, PADDLE_Y + TUNING.paddleHeight / 2, 3 + t * 5)
        .fill({ color: PAL.ball, alpha: t });
    }
  }

  /** A red wash over the field when a life goes. Brief, and hard to miss. */
  private drawFlash() {
    this.flashLayer.clear();
    if (this.flashMs <= 0) return;
    const t = this.flashMs / 360;
    this.flashLayer
      .rect(0, 0, FIELD.width, FIELD.height)
      .fill({ color: 0xff5c5c, alpha: t * t * 0.28 });
  }

  /**
   * The trail is where the ball's speed becomes legible: it is a fixed number
   * of past positions, so it stretches on its own as the ball accelerates.
   */
  private drawTrail(x: number, y: number, docked: boolean) {
    if (docked) this.trail.length = 0;
    this.trail.push(x, y);
    if (this.trail.length > TRAIL_LEN * 2) this.trail.splice(0, 2);

    this.trailLayer.clear();
    const n = this.trail.length / 2;
    for (let i = 1; i < n; i++) {
      this.trailLayer
        .moveTo(this.trail[(i - 1) * 2], this.trail[(i - 1) * 2 + 1])
        .lineTo(this.trail[i * 2], this.trail[i * 2 + 1])
        .stroke({ width: TUNING.ballRadius * 1.4, color: PAL.trail, alpha: (i / n) * 0.35, cap: "round" });
    }
  }

  private tickSparks(deltaMS: number) {
    this.burstLayer.clear();
    const dt = deltaMS / 1000;
    const STRIDE = 7;

    for (let i = this.sparks.length - STRIDE; i >= 0; i -= STRIDE) {
      const left = (this.sparks[i + 4] -= deltaMS);
      if (left <= 0) {
        for (let k = 0; k < STRIDE; k++) {
          this.sparks[i + k] = this.sparks[this.sparks.length - STRIDE + k];
        }
        this.sparks.length -= STRIDE;
        continue;
      }
      this.sparks[i + 3] += 520 * dt;
      this.sparks[i] += this.sparks[i + 2] * dt;
      this.sparks[i + 1] += this.sparks[i + 3] * dt;

      const t = left / this.sparks[i + 5];
      this.burstLayer
        .circle(this.sparks[i], this.sparks[i + 1], 1 + t * 2)
        .fill({ color: this.sparks[i + 6], alpha: t * t });
    }
  }

  private tickShake(deltaMS: number) {
    if (this.shake <= 0.05) {
      this.shake = 0;
      this.root.position.set(0, 0);
      return;
    }
    this.shake *= Math.pow(0.5, deltaMS / 55);
    this.root.position.set(
      (Math.random() - 0.5) * 2 * this.shake,
      (Math.random() - 0.5) * 2 * this.shake,
    );
  }
}

export const FIELD_SIZE = FIELD;
