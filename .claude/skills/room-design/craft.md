# Room craft: what makes a room good, not just valid

Read this when a room is a new idea (step 3 of the workflow in SKILL.md).
Principles from games of the same family: Solstice and Head Over Heels
(isometric, planning over reflexes), Zelda dungeons and Mario 3D World
(teach/test/twist), Super Metroid (ability gates, pacing), Sokoban and Baba
Is You (one rule, fair riddles), The Witness (one idea, many variations).
Adventures of Lolo and Chip's Challenge (push puzzles where enemies are
pieces with readable rules), A Monster's Expedition (an open world of
small push puzzles). Ideas only; nothing is copied (CLAUDE.md §1).

The core idea (SKILL.md, D186): a push-puzzle adventure with arcade bite;
every room earns its place with one trick.

1. **One idea, taught in order.** Per mechanic, a ladder over several rooms:
   *teach* (the idea alone, safe: a mistake costs a reset, not a life),
   *develop* (same idea, a harder shape), *twist* (combined with another
   mechanic or an enemy), *revisit* (a short, easy callback later). Say the
   rung before drafting. A twist room whose parts he has not met is a bug.
2. **Show the ingredients first.** The goal (exit, pickup, plate) and every
   tool (crate, switch, ledge) are seen from the entrance or one step in;
   a crate is never hidden, not even for a secret (D164).
   Secrets are the exception, and even they get a hint (a lone block, a
   strange gap), never a screen text.
3. **Planning beats reflexes.** A room is a puzzle room (enemies only as
   pieces, no clock) or an action room (simple layout); a hybrid presses
   on a simple puzzle whose parts were taught. Hard on both axes is for a
   boss or a late combo.
3a. **Find the trick.** Start from what makes a push puzzle interesting,
   not from a layout: the order matters (the first crate blocks the
   second's route), a piece does two jobs (a step, then a pit plug), a
   piece is used twice (it holds a plate, then moves on to be a step),
   an enemy is a piece (frozen on its lane end, lured by a decoy), height
   changes a push (a crate pushed off a ledge lands where a floor push
   can't reach), a move looks wrong (a crate thrown into a pit to make a
   step for the next). Then cut everything the trick doesn't need.
   Read Sokoban (Microban) for push puzzles: one idea a room, every tile
   used, no red herrings; a crate against a wall slides only along it, a
   crate in a corner is lost, so walls and corners are what he reads.
   Here holes, steps and stacks are the goals, a frozen enemy can be the
   last crate, and enemies can press on a small push puzzle (hybrid).
4. **Failure is visible and cheap.** Wrong push, wrong jump: the cause is
   obvious and re-entering costs seconds. No failures he can't explain
   (hidden hitbox edges, unseen platform timing).
5. **Pick a type on purpose** (D186; roughly 60/25/15 %):
   - *puzzle*: the bulk. Teach rungs are 8x8 with one mechanic and no
     threat; develop and twist rungs take a new shape or a second
     mechanic already taught.
   - *hybrid*: a simple puzzle under pressure (a chaser, a tower's line, a
     timer), only with mechanics already taught.
   - *action*: an arena (open floor, cover, a few enemies) or a dash
     (light platforming, collapsing blocks, a timer); simple layout.
   - Outside the mix: *boss* (see the boss rules in SKILL.md), a *breather*
     before a boss (a shrine, a lore screen), *secrets* (a puzzle room
     behind a key: a spell or a sharp eye, pays a permanent pickup).
   - No pure connectors: a room with nothing but a walk gets a beat or is
     cut.
6. **Pacing across rooms.** No more than two threat-heavy rooms in a row; a
   breather or shrine before a boss. A wing opens with a teaching room and
   ends with a payoff (a pickup, a shortcut, a gate opening). One shortcut
   back to a hub per wing, so backtracking shrinks as the world grows (D67).
7. **Locks before keys.** A locked thing is seen before its key, ideally in a
   room he passes twice; far enough apart to be a mental to-do, near enough
   to remember. A new ability opens at least two seen-but-closed places.
8. **Composition.** A focal point (the exit ahead, a tall structure, a
   glowing plate) away from the entrance so the eye crosses the room. Height
   for drama, not filler. No dead floor: empty space is a sightline, a safe
   landing, or it is cut.
9. **Fair dials.** Tune by crates, pit width and enemy count before speed or
   damage. Leave one slack unit: a spare crate, a cell of landing room, a
   second on a timed switch.
10. **Honest rewards.** A permanent pickup for a multistep puzzle or a risk,
    a refill for a short detour. A secret costs an extra move, not a guess
    among 50 walls.
11. **Name and dress it.** A short, funny terminal-style name. A screen text
    only to explain a spell or concept met here first, never the solution:
    the room must teach by its shape (D118, D163). Decor frames the focal point,
    never hides a mechanic or blocks a sightline from the entrance.
