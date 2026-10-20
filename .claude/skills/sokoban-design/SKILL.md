---
name: sokoban-design
description: Design the crate-pushing (Sokoban) puzzle of a Neonmancer room. Sketch it as XSB text, solve it with the game's own push rules (fewest pushes, traps, sharp steps), build walls as blocks, ledges or holes and goals as plates or sockets, adapt classic Sokoban levels (Microban, surveyed) and the motif library, and convert the sketch into a room draft. Use with room-design whenever a room's trick is pushing crates onto plates, into sockets or holes, off ledges or into stacks.
---

# Sokoban design (a sub-skill of room-design)

This skill covers the push puzzle only. Everything else about the room
(core idea, workflow, schema, rules, checks, wiring, review) is in the
`room-design` skill, and its rules win. Load both: start the room's
concept in room-design (step 3), design the push puzzle here, then go
back to room-design for the draft, checks and review.

## Neonmancer is not flat Sokoban
The grid looks like Sokoban, and the wizard is nearly a Sokoban player:
there is no jump (D222, D272), so he can't climb a crate or a 1-high
wall, and he gets behind a crate only by walking round it. A classic
level of plain crates and walls of any height plays at its classic push
count (Microban 8: 32 pushes). What Neonmancer adds is height the room
places: stairs and pads up to ledges, crates falling off them, stacks,
holes and sockets that spend a crate, streams.

| Sokoban | Neonmancer |
|---|---|
| Boxes block the player | The same: a crate is a box he walks round. He stands on one only by walking onto it level (from a 1-high ledge or a stair top) or landing on it from a pad |
| Walls block the player | The same, at any height: a 1-high wall stops him and hides nothing. A pad throws him onto a top up to 2 higher |
| Floor is flat | **Ledges** (he reaches one by a stair or a pad only, and steps off one way): a crate pushed off a ledge falls; a crate on a crate is a **stack** (only the top moves) |
| Goals are marks | **Plates** (anything holds them: crate, frozen enemy, decoy, him), **sockets** (only a crate fills one, for good, D194), **holes** (a crate plugs it into floor) and **exits/pickups** he must reach |
| No pits | **Holes** eat crates (the crate is gone, the hole becomes floor). He never crosses an open one on foot |
| Push from anywhere adjacent | He pushes from the cell behind, **at the crate's own level** (standing on a ledge for a ledge crate) |
| Deadlock = restart | A trap costs a reset: leave and come back, or die. A trap that blocks every exit needs a way to die (a hole) or it is a soft-lock |

So the player-routing knots of classic Sokoban are all there, and so are
**the crates' own routes**: a crate moves only away from a cell he can
stand on at its level; walls, corners, holes and other crates stop it.
Neonmancer adds height (ledges, drops, stacks) and crates that are spent
(holes, sockets).

## Workflow
1. **The trick first** (room-design step 3): one sentence and the
   solution as moves. Look for it in the motif library
   (`levels/motifs.xsb`), the classic collections (`levels/`, see
   [sources.md](levels/sources.md)) and the patterns below.
2. **Sketch** the puzzle as XSB text in the scratchpad (the characters
   are listed in `scripts/xsb.mjs`). The top-left of the text is the
   back corner (x 0, z 0); the bottom-right faces the camera. Keep tall
   walls top and left (room-design rule 1). `xsb.mjs` and `solve.mjs`
   build `#` walls 1 high (D223). A ledge crate (`&`) needs a stair or pad up to its ledge: add
   it by hand and solve the room JSON.
3. **Solve** it and read the numbers (below). Iterate on the sketch
   until the trick is the only way and the traps are fair:
   ```
   node .claude/skills/sokoban-design/scripts/solve.mjs <sketch.xsb> [--level N] [--wall H|hole] [--xsb-goal plate|socket] [--exit side:at[:y]]
   ```
4. **Convert** it into a room draft, with the room-design skeleton fields
   filled in, then move on from room-design step 4 (exits, wiring,
   validate, check:reach, mutate, sim, level-review):
   ```
   node .claude/skills/sokoban-design/scripts/xsb.mjs <sketch.xsb> --id my_room --name "My Room" --exit -x:3 --out data/rooms/my_room.json
   ```
   Exits on a room with plates or sockets come out locked on every
   switch. Add the door you came in by, by hand, unlocked (he can always
   leave the way he came). Check that the first row inside each exit is free.
5. **Solve the real room** again after every hand edit (the solver takes
   room ids and `.json` files too), with `--from` each exit and the
   Lattice abilities (`--with zap,fork,pause`) to see what a spell does
   to the pushes.

## Reading the solver
`solve.mjs` searches every state (the crates and where he is) breadth
first, with the reachability checker's own movement (`src/world/reach.js`: stairs,
pads, falls, plugs, gates on their switches). Walking is free;
only pushes count. It knows nothing of enemies or timing (use
room-design's `sim.mjs`).

- **`N push(es)`**: the shortest solution, as numbered pushes (the
  crate, where it stood, the direction and the key: down +x, up -x,
  right -z, left +z). `free: no puzzle` means the goal needs no push: a
  bypass, unless the room's puzzle guards something else.
- **`traps: D of T`**: states from which the goal is lost (a reset is
  the only way on). A high share means a sharp puzzle, and a
  low one a forgiving puzzle. Neither is wrong: a teach rung wants few
  traps, a twist rung may have many, if each is visible (a crate in a
  corner, a spent hole).
- **`safe pushes / all pushes`** at each step of the solution, and how
  many steps are **sharp** (half or more of the pushes there are traps,
  like `1/4`): the trick lives at a sharp step. None means no puzzle,
  only a walk; one to three sharp steps are a good room.
- **`shortest way into a trap`**: usually the push a player tries first.
  Make sure it is visible and its cause obvious (craft.md: failure is
  visible and cheap). If it is the trick's own wrong answer (the drop
  onto a heavy plate), good.
- **`UNSOLVABLE`**: no sequence of pushes reaches it; for a room's own
  exit or pickup this is a bug.
- `--max` caps the search (default 200 000 states). Four or more
  free crates in a big room explode it: cut crates before raising it.

Rough sizes by rung: **teach** 1–4 pushes, one sharp step, few
traps; **develop** 4–10 pushes; **twist** 8–20 pushes, where a second
mechanic (a ledge, a socket, an enemy) makes the sharp step. Past
about 25 pushes the room is a chore in a walking game: cut it down.

## Translation menu: building a level in the game
A Sokoban wall or goal is not one thing here. Each translation changes
the puzzle, and mixing them inside one level is where a classic becomes
a Neonmancer room:

| Sokoban | Built as | What changes |
|---|---|---|
| Wall | **3-high block** | Stops crates and him. Heavy: keep it at the back (camera) |
| | **1-high ledge or fence** | Stops crates and him: a classic wall that hides nothing, the default (the same puzzle as a 3-high wall) |
| | **Crate stream** (`~`, 2 high, D198) | Crates pass, he is stopped (no top: a throw or a crate under him never gets him over). A wall between two floors he cannot cross but a crate can: Sokoban's player routing is back, since he must go round to push the crate on from the far side. A 1-thick stream hands a crate over, one cell beyond; in a thicker one it stops in the last cell (he cannot stand in a stream to push on) |
| | **Hole** | A crate pushed in is spent and the hole becomes floor: a wall that can be "opened" by sacrificing a crate (for him too: he crosses only a plugged one) |
| Box | **Plain crate** | He can't climb it: a Sokoban box, the classic push count (Microban 8: 32) |
| | **Ledge edge** (floor one lower) | A crate pushed off falls, and can't come back up: a one-way wall |
| Goal | **Plate** | Anything holds it (a crate can leave it again; a decoy or a frozen enemy can fake it) |
| | **Socket** | A crate fills it for good (spent, can't be pushed on): order matters more; no spell fakes it |
| | **Cage over the prize** | The reward of a push puzzle: a pickup in a `cage` (D202) on the plate or socket's switches is one cell, in plain view, and no spell reaches it (a Zap passes through the bars) |
| | **Hole to plug** | Not a switch: the goal is the floor it makes (a way across to an exit or a pickup) |
| | **Stack spot** | A crate dropped onto a crate: a heavy plate's weight of two (`:`, D200) |
| Player start | The door he comes in by | And every other door: re-solve `--from` each |

The survey (below) builds every level in four of these ways, and with
thin walls as streams. Holes
instead of walls keep the pushes and add sharp steps (a crate can be
spent). Sockets change the order: a crate that starts on a goal is
spent, a route over a goal is cut; some levels get easier, some
unsolvable.

## Classic levels (D197)
Sokoban layouts are classic puzzles, like chess problems: a room may use
a classic level as it is or adapted (the author's call, D197). Credit
the author and collection in the room's decision entry. Before use:
- **Read the survey.** `levels/microban-survey.md` (made by
  `scripts/survey.mjs`) lists every level's fewest pushes under classic
  rules and in each translation, all with the free jump. In a pads room
  a level of plain crates and walls of any height plays as the classic
  column; holes and sockets still change it (a crate can be spent). Since he climbs crates, a classic whose
  difficulty is the player's own route (getting behind a box) collapses:
  Microban 8 drops from 32 pushes to 4, and 29 of the 104 levels solved
  need half the pushes or fewer. Pick levels where the game's pushes
  stay near the classic count: their trick is the crates' routes, and
  that survives. The survey's picks suggest a rung and a build for
  each.
- **A pads room brings a collapsed classic back (D222).** There no crate
  is a step, so a level keeps its classic count with plain crates
  (Microban 8 is 32 pushes again, 19 is 20 and 63 is 50).
- **Re-solve under Neonmancer rules** after any edit (`solve.mjs` on the
  `.xsb` with `--wall`, `--xsb-goal`, or on the room JSON).
- **Size**: x + z <= 32 and rooms mostly 8×8 to 12×12 (room-design
  rule 5). Microban-sized levels fit; big classics don't.
- **Translate the goal**: a Sokoban goal becomes a plate (a decoy or a
  frozen enemy holds it, so mind room-design's "One decoy" and "plate
  alone is no lock") or a socket (crate only, spent). A goal can also be
  a **stack spot** (`:` in XSB, a heavy plate, D200): it needs two crates
  stacked on it (or a crate, and a frozen enemy or the decoy), so only a
  ledge drop onto a crate already there builds it. Mixing them is where
  Neonmancer adds to a classic.
- **Lift it**: the best adaptations add one Neonmancer twist (a ledge
  crate, a hole row, a stack, a pen of fences) to the classic (ideas in
  the survey page).

## Patterns (Neonmancer push tricks)
- **Uncover the pad**: a crate stands on the pad that is the
  way up; pushing it off is the first move, and pushing it back on (or
  another crate onto it) is a trap the player sees.
- **Blocked stair**: a crate in the cell at a stair's foot
  shuts the way up: it never goes up a stair (D230), so only a push
  along the foot's row moves it on; where he can't get behind it, it is a
  trap (a lock where the trick says so). A crate pushed down the stair
  lands in that cell, so bringing one down can shut the stair behind it.
- **Crate down the stair** (D230): one push from the ledge's
  cell over the stair's top slides it down to the foot; he must stand
  beyond it on the ledge. Crates only go down: a ledge's crates come from
  the ledge (or a drop from higher up), never from the floor below. A
  crate never stops on a stair.
- **Wall slide** (teach): a crate against a wall moves only along it;
  the plate is on that wall. A crate in a corner is lost.
- **Bridge and weight** (`motifs.xsb` 1): a hole row a crate can't cross;
  the first crate plugs the hole in the right column, the second rolls
  over it to the plate.
- **Heavy plate** (`:`, D200): the floor crate goes onto the plate first,
  then the ledge crate drops on it. The drop first is the trap: that crate
  lies on the plate alone (half-lit flicker), and the other can no longer
  be pushed onto it. `ledger_cell` and `buffer_2` build it.
- **Ledge drop**: a ledge crate pushed off lands where floor pushes
  can't reach (a pocket past a 1-high rim, a plate behind a fence row).
- **Stand, then spend**: a crate walked onto from a ledge is a stone to
  cross or a top to shoot a target from (D195), then plugs a pit or fills
  a socket. Order is the trick.
- **Socket order**: two sockets, two crates; filling the near one first
  makes floor for the far one's route, or the other way round blocks it.
- **Stream gate**: a thin wall (one cell between two floors) built as a
  stream: crates cross, he goes round (`xsb.mjs --streams thin` builds
  every thin wall of a classic level this way; `~` by hand). The trick is
  which crate to hand over first, and from where the far side can be
  reached. A level needs a way round for him, or the far crates stay
  where they land.
- **Fence pen**: a 1-high fence keeps crates off a plate, so the plate
  needs a drop from above or a decoy.
- **Enemy as the last crate** (with Pause): a frozen enemy pushed like a
  crate fills the last plate (room-design, "Frozen enemies go where they
  are pushed"; the solver needs `--with pause` to count it).
- **Pier** (`buffer_1`, D262): a crate pushed off a higher ledge
  onto a crate parked on a lower one stands 2 high, and a 2-high wall's top
  is its road: pushed on (he stands on the pier's top), it rides over the
  wall and drops beyond, where no floor push reaches (low fences beside the
  goal and in front of the cell before it). The pier moves on and serves
  again. Prove the lock with the wall 3 high: unsolvable.
- **Sockets as a moat** (the first Dead Pixel, D220): the goals sit between the door and
  the floor; empty, they are pits he Blinks over to get in, and the last crate
  is pushed in from the doorway.
- **Deadlocks to read**: a crate in a corner; two crates side by side
  along a wall; a crate on a wall line with no goal on it; the bottom of
  a stack; a crate pushed onto a ledge it can't be pushed back from.
  Each is fine if it is visible and costs a reset.

## Files
- `scripts/xsb.mjs`: XSB to room JSON (`--out`, `--wall 1-5|hole`,
  `--goal plate|socket`, `--streams thin`; `~` is a 2-high crate stream; `:` is a heavy plate,
  D200, always a plate whatever `--goal` says), plus the parser.
- `scripts/solve.mjs`: the solver (XSB, room id or room `.json`). A state
  is the crates plus where he is: after a push he stands where the crate
  was, so a region he can't leave counts.
- `scripts/survey.mjs`: a whole collection under classic rules and in its
  translations, as a Markdown table (`--levels a-b` to split a long run).
- `levels/motifs.xsb`: original Neonmancer motifs, solved.
- `levels/microban.xsb`, `levels/microban-survey.md`: Microban (David W.
  Skinner) and its survey with notes on the best candidates.
- Worked example: Null Orbit (`buffer_3`, D264), Microban 38 taken
  through the whole workflow (sketch, solve, convert, hand-wire, check, play).
  A classic level's walls are walls for him too, so his region must
  connect: solve it with `solve.mjs` after every wall change.
- `levels/sources.md`: classic collections and where to get them.
  Keep the collections in `levels/` as `.xsb` files with their
  author's credit in the header.

A new pattern found while designing or reviewing a room goes into this
file or `motifs.xsb` (solved) in the same PR.
