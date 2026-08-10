export const DT = 1 / 120;

/**
 * Portrait, and deliberately so. The Plinko board this grew out of was drawn
 * 700px wide and then had to be squeezed onto a phone afterwards; starting at
 * 2:3 means the layout a phone gets is the layout the game was designed for,
 * and the desktop one is the compromise instead.
 */
export const FIELD = {
  width: 480,
  height: 720,
} as const;

export interface Tuning {
  /** px/s the ball leaves the paddle at on a fresh life. */
  readonly ballSpeed: number;
  /** Ceiling on ball speed. Reached late, and the reason sweeping is required. */
  readonly ballSpeedMax: number;
  /** Multiplier applied on every brick broken; compounds over a level. */
  readonly ballSpeedGain: number;
  readonly ballRadius: number;

  readonly paddleWidth: number;
  readonly paddleHeight: number;
  /** px/s the paddle can chase the pointer. Finite, so it can be outrun. */
  readonly paddleSpeed: number;

  /**
   * Widest angle off vertical the paddle can impart, in radians. Under 90
   * degrees by construction: a ball leaving horizontally never comes back.
   */
  readonly paddleSpread: number;

  /**
   * Least share of the ball's speed that must be vertical, after any bounce.
   *
   * Honest reflection allows a ball to end up travelling almost flat, and a
   * flat ball is a dead game: it skims between the side walls making no
   * progress toward either the bricks or the paddle, and the player can only
   * watch. Rare, unrecoverable, and entirely avoidable.
   */
  readonly minVerticalShare: number;
}

export const TUNING: Tuning = {
  ballSpeed: 330,
  ballSpeedMax: 660,
  ballSpeedGain: 1.012,
  ballRadius: 6,

  paddleWidth: 92,
  paddleHeight: 12,
  paddleSpeed: 900,

  paddleSpread: (60 * Math.PI) / 180,
  minVerticalShare: 0.22,
};

export const PADDLE_Y = FIELD.height - 64;

export const BRICKS = {
  cols: 8,
  rows: 6,
  width: 52,
  height: 18,
  gap: 4,
  top: 96,
} as const;

/** Centres the grid: 8 x 52 plus 7 x 4 is 444, leaving 18 either side. */
export const BRICK_LEFT =
  (FIELD.width - (BRICKS.cols * BRICKS.width + (BRICKS.cols - 1) * BRICKS.gap)) / 2;

/**
 * How many contacts one step may resolve before giving up and just moving.
 *
 * A ball in a corner can legitimately hit two surfaces in one step, and a ball
 * squeezed between a brick and a wall can hit three. Beyond that the geometry
 * has gone wrong and grinding through more iterations only turns a visual
 * glitch into a frozen frame, so the budget is small and the ball is allowed to
 * finish its step unimpeded.
 */
export const MAX_CONTACTS_PER_STEP = 4;

/**
 * Pushed this far back out along the normal after each contact.
 *
 * Landing exactly on a surface leaves the ball at distance zero from it, and
 * the next sweep starts from a point the slab test reads as already inside —
 * which returns null, and the ball sinks. A thousandth of a pixel is invisible
 * and ends the argument.
 */
export const CONTACT_EPSILON = 1e-3;
