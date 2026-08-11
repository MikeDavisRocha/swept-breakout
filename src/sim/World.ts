import { mulberry32 } from "../core/Rng";
import {
  BRICKS, BRICK_LEFT, CONTACT_EPSILON, FIELD, LAUNCH_LEAN_SHARE,
  MAX_CONTACTS_PER_STEP, PADDLE_Y, TUNING, Tuning,
} from "./config";
import { cellsOf, LEVELS } from "./levels";
import { Box, sweepCircleBox } from "./sweep";

/** Each board opens 6% faster than the one before, floored by the ceiling. */
const LEVEL_SPEED_STEP = 1.06;
/** And with a slightly narrower paddle, which is the other half of the ramp. */
const PADDLE_SHRINK_STEP = 0.94;
/** Below this the paddle stops being a control and starts being a lottery. */
const MIN_PADDLE_WIDTH = 62;

export interface Brick {
  readonly box: Box;
  readonly row: number;
  readonly col: number;
  /** Hits left before it breaks. */
  hp: number;
  /** What it started at, so damage can be drawn as a fraction of it. */
  readonly maxHp: number;
}

export type Surface = "wall" | "paddle" | "brick" | "floor";

/** What the step just did, for the renderer and the audio to react to. */
export interface Contact {
  readonly surface: Surface;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  /** Set when a brick was hit; broken says whether it died. */
  readonly brick?: Brick;
  readonly broken?: boolean;
  /**
   * Where along the paddle the ball landed, -1 at the left edge to +1 at the
   * right. Reported because it is the game's central mechanic and the only
   * one a player cannot see happening — the presentation layer exists to make
   * it audible and visible. See ADR 0002.
   */
  readonly offset?: number;
}

export class World {
  readonly ball = { x: 0, y: 0, vx: 0, vy: 0, prevX: 0, prevY: 0 };
  readonly bricks: Brick[] = [];

  paddleX = FIELD.width / 2;
  /** Where the player is asking the paddle to be. Chased, never teleported to. */
  paddleTarget = FIELD.width / 2;

  /** True until the player launches; the ball rides the paddle. */
  docked = true;
  lives = 3;
  score = 0;
  steps = 0;

  /** Contacts resolved in the step just run. Cleared at the top of each one. */
  readonly contacts: Contact[] = [];

  private readonly rng: () => number;

  constructor(
    readonly seed: number,
    readonly tuning: Tuning = TUNING,
    /** Which board to start on. Only the tests ever pass anything but 0. */
    public level = 0,
  ) {
    this.rng = mulberry32(seed);
    this.buildLevel();
    this.dock();
  }

  get bricksLeft(): number {
    return this.bricks.length;
  }

  get cleared(): boolean {
    return this.bricks.length === 0;
  }

  /** Cleared the last board. There is nothing after this but a new game. */
  get finished(): boolean {
    return this.cleared && this.level >= LEVELS.length - 1;
  }

  get lost(): boolean {
    return this.lives <= 0;
  }

  /**
   * Move to the next board, keeping score and lives. The ball starts a little
   * faster each time: within a board the speed climbs as bricks break, and
   * across boards the floor it climbs from rises too, so board five opens at a
   * pace board one only reached at the end.
   */
  nextLevel() {
    if (this.finished) return;
    this.level++;
    this.bricks.length = 0;
    this.buildLevel();
    this.dock();
  }

  /** Speed this board launches at, and the paddle the player gets to do it with. */
  get levelSpeed(): number {
    return Math.min(
      this.tuning.ballSpeedMax,
      this.tuning.ballSpeed * LEVEL_SPEED_STEP ** this.level,
    );
  }

  get paddleWidth(): number {
    return Math.max(
      MIN_PADDLE_WIDTH,
      this.tuning.paddleWidth * PADDLE_SHRINK_STEP ** this.level,
    );
  }

  private buildLevel() {
    for (const cell of cellsOf(this.level)) {
      const x0 = BRICK_LEFT + cell.col * (BRICKS.width + BRICKS.gap);
      const y0 = BRICKS.top + cell.row * (BRICKS.height + BRICKS.gap);
      this.bricks.push({
        box: { x0, y0, x1: x0 + BRICKS.width, y1: y0 + BRICKS.height },
        row: cell.row,
        col: cell.col,
        hp: cell.hp,
        maxHp: cell.hp,
      });
    }
  }

  /** Park the ball on the paddle, waiting for a launch. */
  private dock() {
    this.docked = true;
    // A narrower paddle can leave the old position hanging off the edge.
    this.clampPaddleToField();
    this.ball.x = this.paddleX;
    this.ball.y = PADDLE_Y - this.tuning.ballRadius - 1;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.savePrev();
  }

  /**
   * Launch upward, leaning slightly to one side. The RNG is consumed here and
   * nowhere else in the step, so a replay is the seed plus the input stream and
   * nothing more.
   */
  launch() {
    if (!this.docked) return;
    this.docked = false;
    this.aimUpward((this.rng() - 0.5) * 2 * LAUNCH_LEAN_SHARE, this.levelSpeed);
  }

  /**
   * Point the ball upward, `shareX` of its speed to the side.
   *
   * Built from a square root rather than from sine and cosine, and that is not
   * a micro-optimisation: sin and cos are implementation-approximated and the
   * engines disagree on them, while sqrt is exactly specified by IEEE 754. Both
   * places the ball's direction is set go through here, so the whole solver
   * reproduces bit for bit on any engine. ADR 0003 has the measurement that
   * forced this.
   */
  private aimUpward(shareX: number, speed: number) {
    const x = clamp(shareX, -1, 1);
    const y = -Math.sqrt(Math.max(0, 1 - x * x));
    this.ball.vx = x * speed;
    this.ball.vy = y * speed;
  }

  private savePrev() {
    this.ball.prevX = this.ball.x;
    this.ball.prevY = this.ball.y;
  }

  /**
   * One fixed step. `targetX` is the player's input for this step — the whole
   * of it — which is what makes a recorded run replayable from a seed and a
   * list of numbers.
   */
  step(dt: number, targetX: number) {
    this.contacts.length = 0;
    this.steps++;

    this.paddleTarget = clamp(
      targetX,
      this.paddleWidth / 2,
      FIELD.width - this.paddleWidth / 2,
    );
    this.movePaddle(dt);

    if (this.docked) {
      this.ball.x = this.paddleX;
      this.ball.y = PADDLE_Y - this.tuning.ballRadius - 1;
      this.savePrev();
      return;
    }

    this.savePrev();
    this.advanceBall(dt);
  }

  /**
   * The paddle chases the pointer at a finite speed rather than snapping to it.
   * Snapping would let a player teleport under any ball and remove the only
   * real skill in the game; it would also make the paddle a surface with no
   * velocity history, which is the wrong thing to bounce off.
   */
  private movePaddle(dt: number) {
    const reach = this.tuning.paddleSpeed * dt;
    const delta = this.paddleTarget - this.paddleX;
    this.paddleX += Math.abs(delta) <= reach ? delta : Math.sign(delta) * reach;
  }

  private paddleBox(): Box {
    const half = this.paddleWidth / 2;
    return {
      x0: this.paddleX - half,
      y0: PADDLE_Y,
      x1: this.paddleX + half,
      y1: PADDLE_Y + this.tuning.paddleHeight,
    };
  }

  private clampPaddleToField() {
    this.paddleX = clamp(
      this.paddleX,
      this.paddleWidth / 2,
      FIELD.width - this.paddleWidth / 2,
    );
  }

  /**
   * Move the ball through the step, stopping at each surface it actually
   * reaches. This is the loop the swept solver exists for: the ball never
   * occupies a position between two frames that was not on its path.
   */
  private advanceBall(dt: number) {
    const r = this.tuning.ballRadius;
    let remaining = 1;

    for (let pass = 0; pass < MAX_CONTACTS_PER_STEP && remaining > 0; pass++) {
      const dx = this.ball.vx * dt * remaining;
      const dy = this.ball.vy * dt * remaining;

      const found = this.earliestHit(dx, dy, r);
      if (!found) break;

      const { hit, surface, brick } = found;

      this.ball.x += dx * hit.t;
      this.ball.y += dy * hit.t;
      this.ball.x += hit.nx * CONTACT_EPSILON;
      this.ball.y += hit.ny * CONTACT_EPSILON;

      const offset = surface === "paddle" ? this.bounceOffPaddle() : undefined;
      if (surface !== "paddle") this.reflect(hit.nx, hit.ny);

      let broken = false;
      if (brick) {
        brick.hp--;
        broken = brick.hp <= 0;
        if (broken) {
          this.bricks.splice(this.bricks.indexOf(brick), 1);
          this.score += 10 * (brick.row < 2 ? 2 : 1);
        }
        this.accelerate();
      }

      this.contacts.push({
        surface,
        x: this.ball.x,
        y: this.ball.y,
        speed: Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2),
        brick,
        broken,
        offset,
      });

      remaining -= remaining * hit.t;
    }

    this.ball.x += this.ball.vx * dt * remaining;
    this.ball.y += this.ball.vy * dt * remaining;

    if (this.ball.y - r > FIELD.height) this.loseLife();
  }

  private earliestHit(dx: number, dy: number, r: number) {
    let best: { hit: ReturnType<typeof sweepCircleBox>; surface: Surface; brick?: Brick } | null = null;

    const consider = (box: Box, surface: Surface, brick?: Brick) => {
      const hit = sweepCircleBox(this.ball.x, this.ball.y, r, dx, dy, box);
      if (hit && (!best || hit.t < best.hit!.t)) best = { hit, surface, brick };
    };

    for (const wall of this.walls()) consider(wall, "wall");
    consider(this.paddleBox(), "paddle");
    // Fixed array order, never a Set or object keys — iteration order has to be
    // the same on every engine or two runs of one seed diverge.
    for (const brick of this.bricks) consider(brick.box, "brick", brick);

    return best as { hit: NonNullable<ReturnType<typeof sweepCircleBox>>; surface: Surface; brick?: Brick } | null;
  }

  /** Left, right and top. The bottom is not a wall; that is the whole game. */
  private walls(): Box[] {
    const t = 1000;
    return [
      { x0: -t, y0: -t, x1: 0, y1: FIELD.height + t },
      { x0: FIELD.width, y0: -t, x1: FIELD.width + t, y1: FIELD.height + t },
      { x0: -t, y0: -t, x1: FIELD.width + t, y1: 0 },
    ];
  }

  private reflect(nx: number, ny: number) {
    const dot = this.ball.vx * nx + this.ball.vy * ny;
    this.ball.vx -= 2 * dot * nx;
    this.ball.vy -= 2 * dot * ny;
    this.keepMovingVertically();
  }

  /**
   * Refuse to let the ball go flat.
   *
   * Reflection is free to leave the ball travelling almost horizontally — off a
   * brick's side, or off a corner at the wrong angle — and once it is flat it
   * skims between the side walls forever, approaching neither the bricks nor
   * the paddle. The player cannot influence it and the round cannot end.
   *
   * So a floor is imposed on the vertical share of the velocity, and the
   * horizontal component gives way to it at constant speed. It fires rarely and
   * only where the alternative is a stuck game; the direction of travel is
   * preserved, so it steers rather than teleports. Second of the two places the
   * simulation is overruled on purpose — ADR 0002 has both.
   */
  private keepMovingVertically() {
    const speed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);
    if (speed === 0) return;

    const floor = speed * this.tuning.minVerticalShare;
    if (Math.abs(this.ball.vy) >= floor) return;

    this.ball.vy = Math.sign(this.ball.vy || -1) * floor;
    const room = speed * speed - this.ball.vy * this.ball.vy;
    this.ball.vx = Math.sign(this.ball.vx || 1) * Math.sqrt(Math.max(0, room));
  }

  /**
   * The paddle is not a mirror.
   *
   * Reflecting honestly off a flat paddle keeps the horizontal component
   * untouched, so a ball arriving nearly flat leaves nearly flat and the rally
   * dies in a long boring skim across the screen — and the player has no way to
   * influence it, which is worse. So the outgoing angle is read off *where* the
   * ball landed on the paddle instead: centre sends it straight up, the edges
   * send it out at the spread limit.
   *
   * This is the one place the simulation is overruled on purpose, and it is
   * what turns the paddle from a wall into a control. See ADR 0002.
   */
  private bounceOffPaddle(): number {
    const half = this.paddleWidth / 2;
    const offset = clamp((this.ball.x - this.paddleX) / half, -1, 1);
    const speed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);

    this.aimUpward(offset * this.tuning.paddleSpreadShare, speed);
    return offset;
  }

  private accelerate() {
    const speed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);
    const next = Math.min(speed * this.tuning.ballSpeedGain, this.tuning.ballSpeedMax);
    const scale = next / speed;
    this.ball.vx *= scale;
    this.ball.vy *= scale;
  }

  private loseLife() {
    this.contacts.push({
      surface: "floor",
      x: this.ball.x,
      y: FIELD.height,
      speed: Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2),
    });
    this.lives--;
    if (this.lives > 0) this.dock();
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
