/**
 * The boards, drawn rather than described.
 *
 * Each row is one line and each character one brick: a digit is how many hits
 * it takes, a dot is empty. Written this way because a layout is a *shape*, and
 * a shape in a nested array of coordinates is a shape nobody can see while
 * editing it — including whoever wrote it. Here the source looks like the board.
 *
 * Eight characters wide, always, because the grid geometry is fixed in
 * config.ts. Height is free.
 */
export const LEVELS: readonly (readonly string[])[] = [
  // 1 — the full wall. Nothing to learn yet except that the paddle aims.
  [
    "22222222",
    "22222222",
    "11111111",
    "11111111",
    "11111111",
    "11111111",
  ],

  // 2 — the arch. Opens a channel up the middle, which teaches that the edges
  // of the paddle are worth using: the reward for a steep angle is the ceiling.
  [
    ".111111.",
    "11....11",
    "1......1",
    "1......1",
    "11....11",
    ".122221.",
  ],

  // 3 — the lattice. Nothing sits directly above anything, so the ball threads
  // through instead of grinding down a column, and rallies get long. Mirrored
  // about the centre like every other board: a plain offset checkerboard is
  // not, on eight columns, and a board that is not symmetric quietly makes one
  // side of the paddle the better one.
  [
    "1.1..1.1",
    ".2.11.2.",
    "1.1..1.1",
    ".2.11.2.",
    "1.1..1.1",
    ".1.11.1.",
  ],

  // 4 — the columns. Two clear lanes, and the tough bricks sit where the ball
  // naturally settles, so the easy route runs out before the board does.
  [
    "11.11.11",
    "11.11.11",
    "22.22.22",
    "22.22.22",
    "11.11.11",
    "11.11.11",
  ],

  // 5 — the vault. A three-hit core behind two layers, reachable only from
  // above once the shell is open. The last board, and it should be a wall.
  [
    "..2222..",
    ".221122.",
    "22133122",
    "22133122",
    ".221122.",
    "..2222..",
  ],
];

/** The tallest board, which is what the brick area has to be sized for. */
export const MAX_LEVEL_ROWS = Math.max(...LEVELS.map((rows) => rows.length));

export interface LevelCell {
  readonly row: number;
  readonly col: number;
  readonly hp: number;
}

/** Parse one board into cells. Dots and spaces are holes; digits are hit points. */
export function cellsOf(level: number): LevelCell[] {
  const rows = LEVELS[level];
  const cells: LevelCell[] = [];

  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      const hp = Number.parseInt(line[col], 10);
      if (Number.isFinite(hp) && hp > 0) cells.push({ row, col, hp });
    }
  }

  return cells;
}
