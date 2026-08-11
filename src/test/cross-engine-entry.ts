/**
 * The replay check, packaged to run inside a browser engine.
 *
 * A run is the seed plus the input stream, so reproducing it is a claim about
 * floating point rather than about bookkeeping — and a same-engine test cannot
 * examine that claim, since Node and Chrome are both V8. This recomputes the
 * committed hash so an engine that is not V8 can answer.
 *
 * Attached to `globalThis` rather than exported: the bundle is injected into a
 * blank page as a plain script, where a module export would be unreachable.
 *
 * Driven by scripts/cross-engine.mjs.
 */
import { hashFloats } from "../core/hash";
import { mulberry32 } from "../core/Rng";
import { DT, FIELD } from "../sim/config";
import { World } from "../sim/World";

/**
 * The same fixed input stream world.test.ts records against, and it has to be
 * generated the same way for the same reason: driven by the seeded PRNG, never
 * by `Math.sin`. A stream built from sine is a different stream on a different
 * engine, which would make this check report a mismatch that says nothing about
 * the solver.
 */
const INPUTS = (() => {
  const rng = mulberry32(20260810);
  let x = FIELD.width / 2;
  return Array.from({ length: 2500 }, () => {
    x += (rng() - 0.5) * 26;
    return Math.max(0, Math.min(FIELD.width, x));
  });
})();

const SEED = 4242;
export const REPLAY_HASH = "2e3ef8ad";

function replayHash(): string {
  const world = new World(SEED);
  world.launch();
  const trace: number[] = [];
  for (const targetX of INPUTS) {
    world.step(DT, targetX);
    trace.push(world.ball.x, world.ball.y, world.ball.vx, world.ball.vy, world.paddleX);
    if (world.docked) world.launch();
  }
  return hashFloats(trace);
}

(globalThis as unknown as Record<string, unknown>).__crossEngine = () => [
  { seed: SEED, got: replayHash(), want: REPLAY_HASH },
];
