import { describe, expect, it } from "vitest";
import { BRICKS, DT, FIELD, PADDLE_Y, TUNING } from "../sim/config";
import { cellsOf, LEVELS, MAX_LEVEL_ROWS } from "../sim/levels";
import { World } from "../sim/World";

describe("the boards", () => {
  it("are all the width the grid is laid out for", () => {
    for (const [i, rows] of LEVELS.entries()) {
      for (const line of rows) {
        expect(line.length, `board ${i + 1}`).toBe(BRICKS.cols);
      }
    }
  });

  it("use only holes and hit points", () => {
    for (const rows of LEVELS) {
      for (const line of rows) {
        expect(line).toMatch(/^[.123]+$/);
      }
    }
  });

  it("have bricks on every board", () => {
    for (const [i, _] of LEVELS.entries()) {
      expect(cellsOf(i).length, `board ${i + 1}`).toBeGreaterThan(0);
    }
  });

  /**
   * The bricks have to fit above the paddle with room to play in. A board that
   * reached down to the paddle would be unplayable in a way no test of the
   * solver would ever catch.
   */
  it("leave the ball somewhere to live", () => {
    const lowest = BRICKS.top + MAX_LEVEL_ROWS * (BRICKS.height + BRICKS.gap);
    expect(lowest).toBeLessThan(PADDLE_Y - 120);
  });

  it("are symmetric, so neither side of the paddle is the wrong side", () => {
    for (const [i, rows] of LEVELS.entries()) {
      for (const line of rows) {
        expect([...line].reverse().join(""), `board ${i + 1}`).toBe(line);
      }
    }
  });
});

describe("progression", () => {
  it("starts on the first board and counts up", () => {
    const world = new World(1);
    expect(world.level).toBe(0);
    expect(world.bricksLeft).toBe(cellsOf(0).length);

    world.nextLevel();
    expect(world.level).toBe(1);
    expect(world.bricksLeft).toBe(cellsOf(1).length);
  });

  it("keeps score and lives across boards", () => {
    const world = new World(1);
    world.score = 500;
    world.lives = 2;
    world.nextLevel();
    expect(world.score).toBe(500);
    expect(world.lives).toBe(2);
  });

  it("stops at the last board rather than wrapping", () => {
    const world = new World(1, TUNING, LEVELS.length - 1);
    world.bricks.length = 0;
    expect(world.finished).toBe(true);
    world.nextLevel();
    expect(world.level).toBe(LEVELS.length - 1);
  });

  /**
   * The ramp: each board opens faster and hands over a narrower paddle. Both
   * are bounded, because an unbounded ramp stops being difficulty and becomes
   * a wall — the paddle floor is the point at which it would stop being a
   * control at all.
   */
  it("ramps speed up and the paddle down, within bounds", () => {
    const speeds: number[] = [];
    const widths: number[] = [];

    for (let level = 0; level < LEVELS.length; level++) {
      const world = new World(1, TUNING, level);
      speeds.push(world.levelSpeed);
      widths.push(world.paddleWidth);
    }

    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
    expect(speeds.at(-1)).toBeLessThanOrEqual(TUNING.ballSpeedMax);
    expect(widths.at(-1)).toBeGreaterThan(TUNING.ballRadius * 6);
  });

  /**
   * Every board has to be clearable, and a layout holding a brick the ball can
   * never reach should fail here rather than in front of a player.
   *
   * Note what the driver has to do. A paddle that tracks the ball *exactly*
   * returns it dead centre every time, which by ADR 0002 sends it straight up
   * — and a perfectly vertical rally never reaches the sides, so a "perfect"
   * player clears nothing. The driver therefore returns the ball off centre on
   * a slow sweep, which is both what makes the test work and a fair
   * description of how the game is actually played.
   */
  it("can be cleared, every board", () => {
    for (let level = 0; level < LEVELS.length; level++) {
      const world = new World(99, { ...TUNING, ballSpeedMax: 900 }, level);
      world.lives = 9999;
      world.launch();

      for (let i = 0; i < 400_000 && !world.cleared; i++) {
        const lean = Math.sin(i / 900) * world.paddleWidth * 0.42;
        world.step(DT, world.ball.x - lean);
        if (world.docked) world.launch();
      }

      expect(world.cleared, `board ${level + 1} left ${world.bricksLeft} bricks`).toBe(true);
    }
  });

  it("keeps the paddle inside the field when it narrows", () => {
    const world = new World(1);
    for (let i = 0; i < 300; i++) world.step(DT, FIELD.width);
    world.nextLevel();
    expect(world.paddleX + world.paddleWidth / 2).toBeLessThanOrEqual(FIELD.width + 1e-9);
  });
});
