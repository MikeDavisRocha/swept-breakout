import { describe, expect, it } from "vitest";
import { hashFloats } from "../core/hash";
import { mulberry32 } from "../core/Rng";
import { DT, FIELD, PADDLE_Y, TUNING, Tuning } from "../sim/config";
import { World } from "../sim/World";

/** Plays a run by tracking the ball, which is enough to keep a rally alive. */
function play(world: World, steps: number, onStep?: (w: World) => void) {
  world.launch();
  for (let i = 0; i < steps; i++) {
    world.step(DT, world.ball.x);
    onStep?.(world);
    if (world.docked) world.launch();
    if (world.lost || world.cleared) break;
  }
  return world;
}

describe("the ball", () => {
  /**
   * The claim the swept solver is here to make, at the level that matters: not
   * "the maths is right" but "the ball never leaves the box". Run at a speed
   * ceiling far past anything the game ships, where a position-sampling
   * collision test would leak the ball through a wall within seconds.
   */
  it("never escapes the field, at any speed", () => {
    const absurd: Tuning = { ...TUNING, ballSpeed: 4000, ballSpeedMax: 9000, ballSpeedGain: 1.05 };
    const r = absurd.ballRadius;
    // Checked with a plain comparison and reported once. An expect() per step
    // is 600 000 of them and turns a 200 ms test into a timeout.
    let escape: string | null = null;

    for (let seed = 0; seed < 40 && !escape; seed++) {
      const world = new World(seed, absurd);
      play(world, 4000, (w) => {
        const { x, y } = w.ball;
        if (!escape && (!Number.isFinite(x) || !Number.isFinite(y) ||
            x < -r || x > FIELD.width + r || y < -r)) {
          escape = `seed ${seed} step ${w.steps}: ball at ${x}, ${y}`;
        }
      });
    }

    expect(escape).toBeNull();
  });

  /**
   * A ball that goes flat skims the walls forever and the round can never end.
   * Checked continuously rather than at the finish, since the whole failure is
   * that it is a state you cannot leave.
   */
  it("never goes flat enough to stall the round", () => {
    const fast: Tuning = { ...TUNING, ballSpeed: 900, ballSpeedMax: 2000 };
    let flattest = 1;

    for (let seed = 0; seed < 25; seed++) {
      play(new World(seed, fast), 3000, (w) => {
        if (w.docked) return;
        const speed = Math.sqrt(w.ball.vx ** 2 + w.ball.vy ** 2);
        flattest = Math.min(flattest, Math.abs(w.ball.vy) / speed);
      });
    }

    expect(flattest).toBeGreaterThanOrEqual(fast.minVerticalShare - 1e-9);
  });

  it("respects the speed ceiling however many bricks it breaks", () => {
    let fastest = 0;
    for (let seed = 0; seed < 10; seed++) {
      play(new World(seed), 6000, (w) => {
        fastest = Math.max(fastest, Math.sqrt(w.ball.vx ** 2 + w.ball.vy ** 2));
      });
    }
    expect(fastest).toBeLessThanOrEqual(TUNING.ballSpeedMax + 1e-9);
  });

  it("breaks bricks and clears the level", () => {
    const world = new World(7);
    const before = world.bricksLeft;
    expect(before).toBe(48);
    play(world, 20_000);
    expect(world.bricksLeft).toBeLessThan(before);
    expect(world.score).toBeGreaterThan(0);
  });
});

describe("replay", () => {
  /**
   * What a deterministic simulation is *for*. The seed decides the launch and
   * the input stream decides everything after it, so a run is reproducible from
   * a number and a list of numbers — no recorded positions, no trusted state.
   *
   * Hashed over the raw float bit patterns rather than compared as printed
   * numbers, because two engines that disagree by one ULP produce identical
   * output to six decimals and different bits, and it is the bits that decide
   * whether a replay verifies.
   */
  const record = (seed: number, inputs: number[]) => {
    const world = new World(seed);
    world.launch();
    const trace: number[] = [];
    for (const targetX of inputs) {
      world.step(DT, targetX);
      trace.push(world.ball.x, world.ball.y, world.ball.vx, world.ball.vy, world.paddleX);
      if (world.docked) world.launch();
    }
    return { hash: hashFloats(trace), score: world.score, bricks: world.bricksLeft };
  };

  /**
   * A fixed, wandering input stream, driven by the seeded PRNG rather than by
   * `Math.sin`.
   *
   * That is not a style preference. Sine is implementation-approximated, so an
   * input stream built from it is a *different* stream on a different engine —
   * and the hash below would then be testing the browser's trigonometry as much
   * as the game. mulberry32 is integer arithmetic and division by a power of
   * two, identical everywhere.
   */
  const inputs = (() => {
    const rng = mulberry32(20260810);
    let x = FIELD.width / 2;
    return Array.from({ length: 2500 }, () => {
      x += (rng() - 0.5) * 26;
      return Math.max(0, Math.min(FIELD.width, x));
    });
  })();

  it("reproduces a run from its seed and inputs alone", () => {
    const first = record(4242, inputs);
    const second = record(4242, inputs);
    expect(second).toEqual(first);
  });

  it("diverges when the seed changes", () => {
    expect(record(4243, inputs).hash).not.toBe(record(4242, inputs).hash);
  });

  it("diverges when one input differs by a pixel", () => {
    const nudged = [...inputs];
    nudged[900] += 1;
    expect(record(4242, nudged).hash).not.toBe(record(4242, inputs).hash);
  });

  /** The committed trajectory. Run it under a second engine to close the loop. */
  it("matches its committed hash", () => {
    expect(record(4242, inputs).hash).toBe("2e3ef8ad");
  });
});

describe("the paddle", () => {
  /**
   * Dead centre sends the ball straight back up. Dropped without sideways
   * motion on purpose: the angle is read from where the ball *lands*, so a ball
   * given horizontal speed would have drifted off centre by the time it
   * arrives and would rightly come back angled.
   */
  it("returns a centred ball vertically", () => {
    const world = new World(1);
    world.launch();
    world.ball.x = world.paddleX;
    world.ball.y = PADDLE_Y - TUNING.ballRadius - 2;
    world.ball.vx = 0;
    world.ball.vy = 400;
    world.step(DT, world.paddleX);

    expect(world.contacts.some((c) => c.surface === "paddle")).toBe(true);
    expect(world.ball.vx).toBeCloseTo(0, 6);
    expect(world.ball.vy).toBeLessThan(0);
  });

  /**
   * The edges are the control: they impart the full spread, which is what lets
   * a player aim rather than merely survive. Asserted as a share of speed
   * rather than as an angle, because a share is what the solver actually works
   * in — going through `atan2` here would test the engine's trigonometry
   * instead of the game.
   */
  it("sends an edge hit out at the spread limit", () => {
    const world = new World(1);
    world.launch();
    world.ball.x = world.paddleX + TUNING.paddleWidth / 2;
    world.ball.y = PADDLE_Y - TUNING.ballRadius - 2;
    world.ball.vx = 0;
    world.ball.vy = 400;
    world.step(DT, world.paddleX);

    const speed = Math.sqrt(world.ball.vx ** 2 + world.ball.vy ** 2);
    expect(world.ball.vx / speed).toBeCloseTo(TUNING.paddleSpreadShare, 9);
    expect(world.ball.vy).toBeLessThan(0);
  });

  it("never returns a ball flat, so a rally can always continue", () => {
    for (let offset = -1; offset <= 1; offset += 0.05) {
      const world = new World(1);
      world.launch();
      world.ball.x = world.paddleX + offset * (TUNING.paddleWidth / 2);
      world.ball.y = PADDLE_Y - TUNING.ballRadius - 2;
      world.ball.vx = 0;
      world.ball.vy = 400;
      world.step(DT, world.paddleX);
      expect(world.ball.vy).toBeLessThan(0);
    }
  });

  /**
   * The contact reports the impact point, and the sound and the mark on the
   * paddle are both drawn from it. If it ever disagreed with the angle actually
   * imparted, the game would be teaching the player something false — the pan
   * would say one thing and the ball would do another.
   */
  it("reports an impact point that matches the angle it imparted", () => {
    for (let want = -0.9; want <= 0.9; want += 0.15) {
      const world = new World(1);
      world.launch();
      world.ball.x = world.paddleX + want * (TUNING.paddleWidth / 2);
      world.ball.y = PADDLE_Y - TUNING.ballRadius - 2;
      world.ball.vx = 0;
      world.ball.vy = 400;
      world.step(DT, world.paddleX);

      const contact = world.contacts.find((c) => c.surface === "paddle");
      expect(contact?.offset).toBeCloseTo(want, 6);

      const speed = Math.sqrt(world.ball.vx ** 2 + world.ball.vy ** 2);
      expect(world.ball.vx / speed).toBeCloseTo(
        contact!.offset! * TUNING.paddleSpreadShare,
        9,
      );
    }
  });

  it("chases the pointer at a finite speed rather than snapping to it", () => {
    const world = new World(1);
    const start = world.paddleX;
    world.step(DT, FIELD.width);
    expect(world.paddleX).toBeGreaterThan(start);
    expect(world.paddleX - start).toBeCloseTo(TUNING.paddleSpeed * DT, 6);
  });

  it("stays inside the field", () => {
    const world = new World(1);
    for (let i = 0; i < 200; i++) world.step(DT, -9999);
    expect(world.paddleX).toBeCloseTo(TUNING.paddleWidth / 2, 6);
    for (let i = 0; i < 400; i++) world.step(DT, 9999);
    expect(world.paddleX).toBeCloseTo(FIELD.width - TUNING.paddleWidth / 2, 6);
  });
});
