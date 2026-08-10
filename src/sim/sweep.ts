/**
 * Swept collision: a moving circle against a static box.
 *
 * This is the whole reason the project exists. A breakout ball speeds up as the
 * round goes on and bricks are thin, so the ball's displacement in one step
 * routinely exceeds a brick's height — test positions instead of paths and the
 * ball passes straight through, more often the better the player is doing.
 *
 * The usual dodges do not survive contact with that. Shrinking the timestep
 * makes tunnelling rarer rather than impossible and costs the same work every
 * frame forever. Clamping speed so a step can never cross a brick — which is
 * what the Plinko board this grew out of does — works there only because that
 * disc has a designed speed ceiling; here the ceiling is the difficulty curve,
 * and capping it caps the game.
 *
 * So the path is what gets tested: find the first instant the circle touches
 * the box, move the ball exactly there, reflect, and spend whatever time is
 * left. No step can skip anything, at any speed.
 */

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface Hit {
  /** Fraction of the step at which contact happens, in [0, 1]. */
  readonly t: number;
  /** Unit surface normal at the contact point, pointing at the circle. */
  readonly nx: number;
  readonly ny: number;
}

/**
 * The Minkowski trick: instead of a circle against a box, this is a *point*
 * against the box grown by the circle's radius — which is the same problem with
 * one fewer moving part.
 *
 * The grown shape is a rounded rectangle, and the rounding is the entire
 * difficulty. Treating it as a plain rectangle is the common shortcut and it
 * makes the ball bounce off empty space at the corners: square corners on the
 * grown box claim a square of area the real circle never reaches, so a shot
 * clipping past a brick's corner rebounds off nothing the player can see.
 *
 * So faces are handled as a ray against the grown box, and corners as a ray
 * against a circle of the same radius centred on the real corner.
 */
export function sweepCircleBox(
  px: number, py: number, r: number,
  dx: number, dy: number,
  box: Box,
): Hit | null {
  const x0 = box.x0 - r;
  const y0 = box.y0 - r;
  const x1 = box.x1 + r;
  const y1 = box.y1 + r;

  // Already overlapping. Nothing sensible to sweep, and the caller has a
  // resting-contact problem rather than a collision one.
  if (px > x0 && px < x1 && py > y0 && py < y1) return null;

  // Slab test. An axis with no motion either straddles the slab for the whole
  // step or never enters it at all.
  let entry = 0;
  let exit = 1;
  let axis: "x" | "y" | null = null;

  if (dx !== 0) {
    const inv = 1 / dx;
    let tn = (x0 - px) * inv;
    let tf = (x1 - px) * inv;
    if (tn > tf) { const s = tn; tn = tf; tf = s; }
    if (tn > entry) { entry = tn; axis = "x"; }
    if (tf < exit) exit = tf;
  } else if (px <= x0 || px >= x1) {
    return null;
  }

  if (dy !== 0) {
    const inv = 1 / dy;
    let tn = (y0 - py) * inv;
    let tf = (y1 - py) * inv;
    if (tn > tf) { const s = tn; tn = tf; tf = s; }
    if (tn > entry) { entry = tn; axis = "y"; }
    if (tf < exit) exit = tf;
  } else if (py <= y0 || py >= y1) {
    return null;
  }

  if (entry > exit || entry < 0 || entry > 1 || axis === null) return null;

  const hx = px + dx * entry;
  const hy = py + dy * entry;

  // A face hit lands within the box's real extent on the other axis. Anything
  // else is in a corner region, where the grown box lies about its shape.
  if (axis === "x" && hy >= box.y0 && hy <= box.y1) {
    return { t: entry, nx: dx > 0 ? -1 : 1, ny: 0 };
  }
  if (axis === "y" && hx >= box.x0 && hx <= box.x1) {
    return { t: entry, nx: 0, ny: dy > 0 ? -1 : 1 };
  }

  const cx = hx < box.x0 ? box.x0 : box.x1;
  const cy = hy < box.y0 ? box.y0 : box.y1;
  return sweepCirclePoint(px, py, r, dx, dy, cx, cy);
}

/**
 * Ray against a circle of radius r about a corner — the honest version of what
 * the grown box only approximates.
 *
 * Solved with the smaller root of the quadratic, which is the entering
 * intersection; the larger one is where the ball would leave again and is
 * never the contact.
 */
function sweepCirclePoint(
  px: number, py: number, r: number,
  dx: number, dy: number,
  cx: number, cy: number,
): Hit | null {
  const ox = px - cx;
  const oy = py - cy;

  const a = dx * dx + dy * dy;
  if (a === 0) return null;

  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - r * r;

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  // Math.sqrt, never Math.hypot: hypot is implementation-approximated and the
  // engines disagree by an ULP, which is enough to reroute a bounce.
  const root = Math.sqrt(disc);
  const t = (-b - root) / (2 * a);
  if (t < 0 || t > 1) return null;

  const nx = ox + dx * t;
  const ny = oy + dy * t;
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len === 0) return null;

  return { t, nx: nx / len, ny: ny / len };
}
