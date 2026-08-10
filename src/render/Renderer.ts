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

  /** Flat [x, y, vx, vy, msLeft, msTotal, colour] — no per-frame allocation. */
  private sparks: number[] = [];
  private trail: number[] = [];
  private shake = 0;

  constructor(app: Application) {
    app.stage.addChild(this.root);
    this.root.addChild(
      this.brickLayer, this.trailLayer, this.paddleLayer, this.ballLayer, this.burstLayer,
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

  draw(world: World, alpha: number, deltaMS: number) {
    this.tickShake(deltaMS);
    this.tickSparks(deltaMS);

    const bx = world.ball.prevX + (world.ball.x - world.ball.prevX) * alpha;
    const by = world.ball.prevY + (world.ball.y - world.ball.prevY) * alpha;

    this.drawBricks(world);
    this.drawPaddle(world);
    this.drawTrail(bx, by, world.docked);

    this.ballLayer.clear();
    this.ballLayer.circle(bx, by, TUNING.ballRadius).fill({ color: PAL.ball });
  }

  private drawBricks(world: World) {
    this.brickLayer.clear();
    for (const brick of world.bricks) {
      const { x0, y0, x1, y1 } = brick.box;
      this.brickLayer
        .roundRect(x0, y0, x1 - x0, y1 - y0, 3)
        .fill({
          color: BRICK_ROW[brick.row % BRICK_ROW.length],
          // Rows that start with 2 hp show their damage by dimming.
          alpha: brick.row < 2 && brick.hp === 1 ? CRACKED_ALPHA : 1,
        });
    }
  }

  private drawPaddle(world: World) {
    const half = TUNING.paddleWidth / 2;
    this.paddleLayer.clear();
    this.paddleLayer
      .roundRect(world.paddleX - half, PADDLE_Y, TUNING.paddleWidth, TUNING.paddleHeight, 5)
      .fill({ color: PAL.paddle });
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
