# The path is what gets tested, not the position

A breakout ball speeds up as the round goes on and bricks are thin. At the
shipped ceiling of 660 px/s a step at 120 Hz moves the ball 5.5px, which is
comfortable — but the ceiling is the difficulty curve, and any tuning that makes
the game harder makes the step longer. A brick is 18px tall and 4px of gap sits
between rows, so a ball is one tuning change away from crossing a brick between
two samples. Test positions and the brick is shot through; the better the player
is doing, the more often it happens.

**So the ball's path is swept against every surface, and contact is solved for
rather than detected.** Each step finds the first instant the ball's circle
touches anything, moves it exactly there, reflects, and spends whatever time is
left over — up to four contacts, which covers a ball in a corner and a ball
pinched between a brick and a wall. No step can skip anything at any speed, and
the test suite runs the game at 9000 px/s to say so.

## What was rejected

**A smaller timestep.** Makes tunnelling rarer rather than impossible, and pays
for it on every frame forever. The failure it leaves behind is the worst kind:
too infrequent to reproduce, frequent enough to be reported.

**Clamping the speed** so a step can never cross a brick. This is what the Plinko
board this grew out of does, and it works there because that disc has a designed
speed ceiling — the whole board is tuned to a four-second fall. Here the ceiling
*is* the game's difficulty, and capping it caps the game.

## The corner is the whole difficulty

Sweeping a circle against a box is done as a *point* against the box grown by
the radius — the same problem with one fewer moving part. But the grown shape is
a rounded rectangle, and the rounding is not a detail.

Growing the box and treating it as a plain rectangle gives it square corners,
which claim a square of area the round ball never reaches. A shot clipping past
a brick's corner then rebounds off nothing the player can see, which reads as
the game cheating. So faces are solved as a ray against the grown box, and
corners as a ray against a circle of the ball's radius centred on the real
corner. A test pins a path that enters the phantom square at t = 0.833 and
proves the honest answer is no contact at all.

## Consequences

- **Contact leaves the ball exactly on the surface, which is a problem.** The
  next sweep would start from a point the slab test reads as already inside, and
  return nothing, and the ball would sink. It is pushed a thousandth of a pixel
  back along the normal after every contact — invisible, and it ends the
  argument.
- The sweep declines to answer when it starts already overlapping. That is a
  resting-contact problem and a different one; the caller keeps it from arising
  by never letting it happen.
- `Math.sqrt`, never `Math.hypot`. Hypot is specified as
  implementation-approximated and engines disagree by an ULP, which in a chaotic
  system is enough to reroute a bounce and break a replay across browsers.
- Bricks are iterated as a fixed array, never a Set or object keys — iteration
  order has to be identical on every engine or one seed produces two games.
- The solver is proven symmetric across the box's vertical axis. A bias there
  would slowly steer every rally to one side of the screen, which is the kind of
  bug that gets described as "feels off" and never as a defect.
