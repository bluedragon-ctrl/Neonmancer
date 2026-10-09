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
The grid looks like Sokoban, but the wizard is not a Sokoban player.
Read a classic level with these differences in mind:

| Sokoban | Neonmancer |
|---|---|
| Boxes block the player | He **climbs** a crate (1 high) and walks over crates: they block crates, not him |
| Walls block the player | He climbs anything 1 high, and anything 2 high from a crate top. Only **3-high walls** stop him for good; a 2-high wall beside a crate is a road (room-design, "Walls are steps too") |
| Floor is flat | **Ledges**: a crate pushed off a ledge falls; a crate on a crate is a **stack** (only the top moves); a crate's top is a step 1 up, a stack's top 2 up |
| Goals are marks | **Plates** (anything holds them: crate, frozen enemy, decoy, him), **sockets** (only a crate fills one, for good, D194), **holes** (a crate plugs it into floor) and **exits/pickups** he must reach |
| No pits | **Holes** eat crates (the crate is gone, the hole becomes floor). He jumps a 1-tile hole, never 2 (3 from a crate top beside a floor pit, D162) |
| Push from anywhere adjacent | He pushes from the cell behind, **at the crate's own level** (standing on a ledge for a ledge crate) |
| Deadlock = restart | A trap costs a reset: leave and come back, or die. A trap that blocks every exit needs a way to die (a hole) or it is a soft-lock |

So the player-routing knots of classic Sokoban mostly vanish (he walks
over crates and short walls). What stays is **the crates' own routes**:
a crate moves only away from a cell he can stand on at its level; walls,
corners, holes and other crates stop it. Neonmancer adds height (steps,
drops, stacks) and crates that are spent (holes, sockets).

## Workflow
1. **The trick first** (room-design step 3): one sentence and the
   solution as moves. Look for it in the motif library
   (`levels/motifs.xsb`), the classic collections (`levels/`, see
   [sources.md](levels/sources.md)) and the patterns below.
2. **Sketch** the puzzle as XSB text in the scratchpad (the characters
   are listed in `scripts/xsb.mjs`). The top-left of the text is the
   back corner (x 0, z 0); the bottom-right faces the camera. Keep tall
   walls top and left (room-design rule 1).
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
first, with the reachability checker's own movement (`src/world/reach.js`: climbing,
1-tile jumps, falls, plugs, gates on their switches). Walking is free;
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
  visible and cheap). If it is the trick's own wrong answer (the drop in
  stack stairs), good.
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
| | **2-high block** | Stops crates; a crate beside it is his step onto it, and its top a road |
| | **1-high ledge or fence** | Stops crates; he walks over it. The same puzzle as a 3-high wall in every Microban level solved, and hides nothing: the default |
| | **Hole** | A crate pushed in is spent and the hole becomes floor: a wall that can be "opened" by sacrificing a crate. He jumps one, falls in two |
| | **Ledge edge** (floor one lower) | A crate pushed off falls, and can't come back up: a one-way wall |
| Goal | **Plate** | Anything holds it (a crate can leave it again; a decoy or a frozen enemy can fake it) |
| | **Socket** | A crate fills it for good (spent, can't be pushed on): order matters more; no spell fakes it |
| | **Hole to plug** | Not a switch: the goal is the floor it makes (a way across to an exit or a pickup) |
| | **Stack spot** | A crate dropped onto a crate: a 2-high step to a 3-high goal |
| Player start | The door he comes in by | And every other door: re-solve `--from` each |

The survey (below) builds every level in five of these ways. Holes
instead of walls keep the pushes and add sharp steps (a crate can be
spent). Sockets change the order: a crate that starts on a goal is
spent, a route over a goal is cut; some levels get easier, some
unsolvable.

## Classic levels (D196)
Sokoban layouts are classic puzzles, like chess problems: a room may use
a classic level as it is or adapted (the author's call, D196). Credit
the author and collection in the room's decision entry. Before use:
- **Read the survey.** `levels/microban-survey.md` (made by
  `scripts/survey.mjs`) lists every level's fewest pushes under classic
  rules and in each translation. Since he climbs crates, a classic whose
  difficulty is the player's own route (getting behind a box) collapses:
  Microban 8 drops from 32 pushes to 4, and 29 of the 104 levels solved
  need half the pushes or fewer. Pick levels where the game's pushes
  stay near the classic count: their trick is the crates' routes, and
  that survives. The survey's picks suggest a rung and a build for
  each.
- **Re-solve under Neonmancer rules** after any edit (`solve.mjs` on the
  `.xsb` with `--wall`, `--xsb-goal`, or on the room JSON).
- **Size**: x + z <= 32 and rooms mostly 8×8 to 12×12 (room-design
  rule 5). Microban-sized levels fit; big classics don't.
- **Translate the goal**: a Sokoban goal becomes a plate (a decoy or a
  frozen enemy holds it, so mind room-design's "One decoy" and "plate
  alone is no lock") or a socket (crate only, spent). Mixing them is
  where Neonmancer adds to a classic.
- **Lift it**: the best adaptations add one Neonmancer twist (a ledge
  crate, a hole row, a stack, a pen of fences) to the classic (ideas in
  the survey page).

## Patterns (Neonmancer push tricks)
- **Wall slide** (teach): a crate against a wall moves only along it;
  the plate is on that wall. A crate in a corner is lost.
- **Bridge and weight** (`motifs.xsb` 1): a hole row a crate can't cross;
  the first crate plugs the hole in the right column, the second rolls
  over it to the plate.
- **Stack stairs** (`motifs.xsb` 2): the floor crate goes under the
  ledge's edge first, then the ledge crate drops onto it: a 2-high step.
  The drop alone is the trap.
- **Ledge drop**: a ledge crate pushed off lands where floor pushes
  can't reach (a pocket past a 1-high rim, a plate behind a fence row).
- **Step, then spend**: a crate is a step to a ledge (or a target
  shot, D195), then plugs a pit or fills a socket. Order is the trick.
- **Socket order**: two sockets, two crates; filling the near one first
  makes floor for the far one's route, or the other way round blocks it.
- **Fence pen**: a 1-high fence keeps crates off a plate (he steps
  over it), so the plate needs a drop from above or a decoy.
- **Enemy as the last crate** (with Pause): a frozen enemy pushed like a
  crate fills the last plate (room-design, "Frozen enemies go where they
  are pushed"; the solver needs `--with pause` to count it).
- **Deadlocks to read**: a crate in a corner; two crates side by side
  along a wall; a crate on a wall line with no goal on it; the bottom of
  a stack; a crate pushed onto a ledge it can't be pushed back from.
  Each is fine if it is visible and costs a reset.

## Files
- `scripts/xsb.mjs`: XSB to room JSON (`--out`, `--wall 1-5|hole`,
  `--goal plate|socket`), plus the parser.
- `scripts/solve.mjs`: the solver (XSB, room id or room `.json`). A state
  is the crates plus where he is: after a push he stands where the crate
  was, so a region he can't leave counts.
- `scripts/survey.mjs`: a whole collection under classic rules and in five
  translations, as a Markdown table.
- `levels/motifs.xsb`: original Neonmancer motifs, solved.
- `levels/microban.xsb`, `levels/microban-survey.md`: Microban (David W.
  Skinner) and its survey with notes on the best candidates.
- `levels/sources.md`: classic collections and where to get them.
  Keep the collections in `levels/` as `.xsb` files with their
  author's credit in the header.

A new pattern found while designing or reviewing a room goes into this
file or `motifs.xsb` (solved) in the same PR.
