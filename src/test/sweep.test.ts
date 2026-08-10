import { describe, expect, it } from "vitest";
import { Box, sweepCircleBox } from "../sim/sweep";

/** A brick-shaped box: wide and thin, which is where tunnelling lives. */
const BRICK: Box = { x0: 100, y0: 100, x1: 200, y1: 110 };
const BLOCK: Box = { x0: 100, y0: 100, x1: 200, y1: 200 };

describe("swept circle against a box", () => {
  it("reports the instant of contact, not the overlap after it", () => {
    // Falling onto the brick's top face from 50px up, radius 5, 100px step.
    // Contact is when the *surface* touches, 45px down, not when the centre
    // reaches the face.
    const hit = sweepCircleBox(150, 50, 5, 0, 100, BRICK);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.45, 10);
    expect([hit!.nx, hit!.ny]).toEqual([0, -1]);
  });

  it("faces the normal back at the circle, on every side", () => {
    expect(sweepCircleBox(150, 50, 5, 0, 100, BRICK)).toMatchObject({ nx: 0, ny: -1 });
    expect(sweepCircleBox(150, 300, 5, 0, -100, BLOCK)).toMatchObject({ nx: 0, ny: 1 });
    expect(sweepCircleBox(50, 150, 5, 200, 0, BLOCK)).toMatchObject({ nx: -1, ny: 0 });
    expect(sweepCircleBox(300, 150, 5, -200, 0, BLOCK)).toMatchObject({ nx: 1, ny: 0 });
  });

  /**
   * The reason this file exists. The ball crosses the entire brick — 10px tall
   * — inside a single 400px step. A test that sampled positions would find the
   * ball above the brick before the step and below it after, and report
   * nothing; the player would watch a brick get shot through.
   */
  it("catches a brick crossed whole in one step", () => {
    const hit = sweepCircleBox(150, 50, 5, 0, 400, BRICK);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.1125, 10);
    expect(hit!.ny).toBe(-1);
    // And the contact really is before the far side of the brick.
    expect(50 + 400 * hit!.t).toBeLessThan(BRICK.y1);
  });

  it("finds no contact when the path stops short", () => {
    expect(sweepCircleBox(150, 50, 5, 0, 40, BRICK)).toBeNull();
  });

  it("finds no contact when the path leads away", () => {
    expect(sweepCircleBox(150, 50, 5, 0, -100, BRICK)).toBeNull();
  });

  /**
   * The corner case, and the one a plain expanded-box test gets wrong.
   *
   * Growing the box by the radius and treating it as a rectangle gives it
   * square corners, which claim a square of area the round ball never reaches.
   * This path enters that phantom square at t = 0.833 and the shortcut would
   * report a bounce there — off nothing the player can see. The true circle
   * around the corner is not reached until t = 1.08, which is past the end of
   * the step, so the honest answer is no contact.
   */
  it("does not bounce off the empty space at a corner", () => {
    expect(sweepCircleBox(80, 80, 10, 12, 12, BLOCK)).toBeNull();
  });

  it("does bounce off a corner actually reached, with a diagonal normal", () => {
    const hit = sweepCircleBox(80, 80, 10, 30, 30, BLOCK);
    expect(hit).not.toBeNull();
    // Struck on the diagonal, so the normal is neither axis.
    expect(hit!.nx).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(hit!.ny).toBeCloseTo(-Math.SQRT1_2, 6);
    // And it is exactly one radius from the corner at that instant.
    const hx = 80 + 30 * hit!.t;
    const hy = 80 + 30 * hit!.t;
    expect(Math.sqrt((hx - 100) ** 2 + (hy - 100) ** 2)).toBeCloseTo(10, 6);
  });

  it("always returns a unit normal and a time inside the step", () => {
    for (let angle = 0; angle < 360; angle += 7) {
      const rad = (angle * Math.PI) / 180;
      // Fire inwards at the block from a ring well outside it.
      const px = 150 + Math.cos(rad) * 300;
      const py = 150 + Math.sin(rad) * 300;
      const hit = sweepCircleBox(px, py, 6, 150 - px, 150 - py, BLOCK);
      expect(hit).not.toBeNull();
      expect(hit!.t).toBeGreaterThanOrEqual(0);
      expect(hit!.t).toBeLessThanOrEqual(1);
      expect(Math.sqrt(hit!.nx ** 2 + hit!.ny ** 2)).toBeCloseTo(1, 12);
    }
  });

  /**
   * The board is drawn symmetrically, so the solver has to be symmetric too —
   * a bias here would slowly steer every rally to one side of the screen.
   */
  it("mirrors exactly across the box's vertical axis", () => {
    // Negative zero and zero are the same number and different values, and
    // mirroring a flat normal produces -0. Adding zero folds them back
    // together, so this compares the mathematics rather than the sign bit.
    const same = (a: number, b: number) => expect(a + 0).toBe(b + 0);

    const mid = (BLOCK.x0 + BLOCK.x1) / 2;
    for (let off = 5; off < 200; off += 3) {
      const left = sweepCircleBox(mid - off, 40, 6, off * 0.5, 120, BLOCK);
      const right = sweepCircleBox(mid + off, 40, 6, -off * 0.5, 120, BLOCK);
      expect(left === null).toBe(right === null);
      if (left && right) {
        same(left.t, right.t);
        same(left.nx, -right.nx);
        same(left.ny, right.ny);
      }
    }
  });

  it("declines to sweep from inside, leaving overlap to the caller", () => {
    expect(sweepCircleBox(150, 150, 5, 10, 10, BLOCK)).toBeNull();
  });
});
