# Two places the simulation is overruled, on purpose

Everything else in this project is an argument for honest physics. These two
are the exceptions, and they are exceptions because honest physics makes the
game worse in a way the player cannot do anything about. Both are named here
rather than buried, because an undocumented override is indistinguishable from
a bug.

## The paddle is not a mirror

Reflecting truthfully off a flat paddle leaves the horizontal component
untouched. A ball arriving nearly flat therefore leaves nearly flat, and the
rally dies in a long skim across the screen — and the player has no way to
influence it, which is the real objection. A paddle that only reflects is a
wall, and a wall is not a control.

So the outgoing angle is read from **where** the ball landed on the paddle
instead: dead centre sends it straight up, the edges send it out at the spread
limit of 60 degrees, and everything between interpolates. Speed is preserved, so
this steers without adding energy.

Sixty degrees is not arbitrary. The limit has to stay under ninety or the paddle
can serve a ball flat, and a flat ball never comes back.

This is the single mechanic that turns the game from reflex into aim. A player
who understands it can clear a specific column; a player who does not still has
a working paddle.

## The ball refuses to go flat

Reflection off a brick's side, or off a corner at the wrong angle, can leave the
ball travelling almost horizontally. Once flat it skims between the side walls
forever, approaching neither the bricks nor the paddle. The round cannot end and
the player cannot intervene.

So a floor is imposed on the vertical share of the ball's velocity — 22% — with
the horizontal component giving way to it at constant speed. It preserves the
direction of travel, so it nudges rather than teleports, and it fires rarely:
only where the alternative is a game that has stopped being one.

## Consequences

- Both are tested as invariants rather than described. The suite plays 25 seeds
  for 3000 steps at nearly triple the shipped speed and asserts the flattest
  vertical share ever seen still clears the floor, and it fires balls at every
  point across the paddle and asserts every one comes back upward.
- **Neither breaks replay.** Both are pure functions of the state at contact,
  so a recorded run reproduces exactly — the seed and the input stream still
  determine everything.
- Speed is conserved by both. Neither can be used to pump energy into the ball,
  which would quietly break the difficulty curve the speed ceiling exists to
  shape.
- The cost is honesty about the paddle, and it is worth paying: every breakout
  worth playing has made this same trade since 1976. The cost of the vertical
  floor is a bounce that occasionally leaves at a slightly different angle than
  a perfect mirror would give, which no player can perceive and every player
  benefits from.
