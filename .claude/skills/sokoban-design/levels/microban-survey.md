# Microban under Neonmancer rules

Microban by David W. Skinner (`microban.xsb`), surveyed with
`scripts/survey.mjs` (2026-10-09, `--max 30000`). This page is the
review: what survives the game's rules, and how to build the best levels
in a room. Re-run the survey after any change to the push rules.

## How to read the table
- **Classic**: fewest pushes under Sokoban rules (the player walks
  floor only).
- The other columns build the level in the game in one way each and
  solve it with the game's rules: walls as **3-high** blocks, as
  **1-high ledges** (or fences), or as **holes**; goals as **plates** or
  **sockets** (a crate spent for good). Each cell reads `pushes/sharp
  steps/trap %`. A sharp step is one where half or more of the pushes
  are traps; the trick lives there.
- `-` unsolvable, `?` the search hit 30 000 states (four or more crates:
  solve that level alone with a higher `--max`), `n/a` the wizard
  starts on a goal (no socket under him).

## What the survey shows
1. **He climbs crates, so the player's route is no longer a puzzle.**
   29 of the 104 levels solved need half the pushes or fewer (8: 32 → 4,
   63: 50 → 4, 96: 37 → 7, 19: 20 → 4). Their trick was getting behind a
   box, and in the game he just walks over it. Skip them.
2. **The crates' routes survive untouched.** Where classic and game
   pushes match (3, 6, 22, 24, 25, 38, 41, 45, 49, 71, 73, ...) the
   puzzle is the crates' own corridors and corners, and it plays the same.
   These are the candidates.
3. **Wall height doesn't matter: build walls as 1-high ledges.** 3-high
   and 1-high walls gave the same numbers in every level solved. A 1-high
   ledge or fence keeps the puzzle, shows everything to the camera and
   hides nothing (room-design rule 1). Use 3-high walls only where the
   room needs to stop him (a guarded pickup), not for the puzzle.
4. **Holes for walls sharpen a level.** The pushes stay the same, but a
   crate pushed into a wall-hole is spent, so more pushes are traps (13:
   1 sharp step → 5; 68: 3 → 11). Mix them in where a level is too
   gentle.
5. **Sockets change the order.** A socket can't be crossed or left: a
   crate that starts on a goal is spent, and a route that runs over a
   goal is cut. Some levels get easier (4: 7 → 3, 41: 9 sharp → 1),
   some unsolvable (17, 22, 29, 39, 43, 47-49). Sockets suit levels
   where each crate goes straight home. A plate can be faked by a decoy
   or a frozen enemy, a socket can't (room-design "plate alone is no
   lock").
6. **Size**: most levels are 4×5 to 7×7, smaller than a room. Set the
   puzzle against the back walls of an 8×8 or 12×12 room: the rest is
   the approach and the doors. Keep the doors' first rows free.

## Picks
Each is solved in its suggested translation (`solve.mjs microban.xsb
--level N --wall 1 [--xsb-goal socket]`). Credit "Microban N by David W.
Skinner" in the room's decision entry.

| Rung | Level | Classic → game | Build it as | Why |
|---|---|---|---|---|
| teach | 2 | 3 → 3 | ledges, plates | Three crates, two already on goals, the last goal beside them. 4×5 |
| teach | 21 | 5 → 3 | ledges, plates; holes for 2 sharp steps | Two crates side by side: which goes first |
| teach | 25 | 7 → 7 | ledges, sockets (63% traps instead of 91%) | Three crates, three goals in a row; teaches sockets |
| develop | 24 | 9 → 9 | ledges, plates | Two crates down a 1-wide neck: order and the corner |
| develop | 45 | 11 → 11 | ledges, sockets along the back wall | A column of three crates fed into a row of goals |
| develop | 18 | 13 → 11 | ledges, plates (sockets: 1 sharp step, gentler) | Two crates through one gap, goals behind a wall |
| develop | 3 | 13 → 11 | ledges or holes, plates | Two crates on the right, goals on the left past a pillar |
| develop | 38 | 8 → 8 | ledges, plates; 8×5 fits a room's back half | Three crates in a tight middle: 4 sharp steps |
| twist | 41 | 13 → 13 | ledges, plates (9 sharp) or sockets (1 sharp) | A row of three crates above three goals: the rung picks the goal type |
| twist | 11 | 16 → 14 | holes, plates (7 sharp) | A loop round a pillar; holes make the wrong loop cost a crate |
| twist | 13 | 21 → 15 | holes, plates (5 sharp; ledges: 1) | The level that most needs holes for walls |
| twist | 22 | 15 → 15 | ledges, plates only (sockets: unsolvable) | Two crates cross each other's goal row |
| late | 71 | 21 → 21 | ledges, plates; 11×7 is a whole room | Two crates round a long corridor loop |
| late | 73 | 25 → 25 | ledges, plates | Three crates through a 1-wide gate to a row of goals |
| late | 68 | 28 → 18 | holes, sockets (8 sharp) | A long corridor; holes and sockets make it sharp |

Too long for a walking game (over ~25 pushes): 6, 16, 49, 59, 76, 77,
84, 85, 88. Too big or too many crates for the solver at this cap: the
`?` rows.

## Neonmancer twists on a pick
A classic gives the crate puzzle; the room adds one thing of its own:
- A **ledge crate** (`&`) instead of a floor crate: pushed off, it drops
  into the puzzle from above, where floor pushes can't reach.
- A **hole row** between the crates and the goals (motif "bridge and
  weight"): one crate is spent as the bridge, so the classic needs a
  spare crate.
- The goal opens a **gate or bridge** instead of the exit, so the
  solved puzzle is a step on the way, not the end.
- A goal as a **plate in a pen of 1-high fences**: only a crate dropped
  from a ledge gets in, so a floor crate can't fake it.

## Survey
| # | Title | Size | Crates | Classic | wall 3, plate | ledge 1, plate | holes, plate | wall 3, socket | holes, socket |
|---|---|---|---|---|---|---|---|---|---|
| 1 |  | 4×5 | 2 | 8 | 4/0/67% | 4/0/67% | 4/0/78% | 4/2/57% | 4/3/67% |
| 2 |  | 4×5 | 3 | 3 | 3/2/99% | 3/2/99% | 3/2/99% | 3/1/74% | 3/1/75% |
| 3 |  | 7×4 | 2 | 13 | 11/4/67% | 11/4/67% | 11/4/86% | 11/3/58% | 11/4/83% |
| 4 |  | 6×4 | 3 | 7 | 7/3/96% | 7/3/96% | 7/3/98% | 3/1/58% | 3/1/64% |
| 5 |  | 6×5 | 4 | 6 | 6/0/97% | 6/0/97% | 6/0/98% | 6/4/98% | 6/4/98% |
| 6 |  | 10×4 | 3 | 29 | 29/10/87% | 29/10/87% | 29/19/96% | 29/11/88% | 29/14/95% |
| 7 |  | 5×6 | 6 | 6 | 6/0/98%? | 6/0/98%? | 6/0/98%? | 6/0/97% | 6/0/97% |
| 8 |  | 6×10 | 2 | 32 | 4/2/59% | 4/2/59% | 4/2/85% | 4/1/25% | 4/1/50% |
| 9 |  | 4×5 | 2 | 10 | 6/5/69% | 6/5/69% | 6/5/83% | 6/3/70% | 6/3/83% |
| 10 |  | 9×6 | 3 | 21 | 11/3/67% | 11/3/67% | 11/3/94% | 11/1/63% | 11/1/94% |
| 11 |  | 7×6 | 2 | 16 | 14/5/71% | 14/5/71% | 14/7/88% | 14/5/72% | 14/6/88% |
| 12 |  | 7×6 | 2 | 11 | 11/8/85% | 11/8/85% | 11/9/93% | 11/8/85% | 11/10/93% |
| 13 |  | 5×7 | 3 | 21 | 15/1/77% | 15/1/77% | 15/5/95% | 15/1/72% | 15/2/93% |
| 14 |  | 5×4 | 2 | 10 | 6/3/85% | 6/3/85% | 6/3/91% | 2/0/58% | 2/1/67% |
| 15 |  | 7×5 | 2 | 12 | 2/1/77% | 2/1/77% | 2/1/92% | 2/1/25% | 2/2/50% |
| 16 |  | 8×6 | 3 | 39 | 37/12/72% | 37/12/72% | 37/21/91% | 37/14/70% | 37/16/91% |
| 17 |  | 4×5 | 3 | 9 | 3/0/91% | 3/0/91% | 3/0/94% | - | - |
| 18 |  | 5×7 | 2 | 13 | 11/3/69% | 11/3/69% | 11/3/86% | 11/1/72% | 11/3/88% |
| 19 |  | 6×6 | 2 | 20 | 4/1/59% | 4/1/59% | 4/1/84% | 4/0/23% | 4/0/50% |
| 20 |  | 7×6 | 2 | 16 | 6/1/73% | 6/1/73% | 6/2/89% | 6/1/50% | 6/1/78% |
| 21 |  | 5×4 | 2 | 5 | 3/2/90% | 3/2/90% | 3/2/94% | 3/1/84% | 3/2/92% |
| 22 |  | 5×7 | 2 | 15 | 15/9/82% | 15/9/82% | 15/11/91% | - | - |
| 23 |  | 5×5 | 2 | 10 | 6/0/68% | 6/0/68% | 6/0/79% | 6/3/53% | 6/3/65% |
| 24 |  | 5×5 | 2 | 9 | 9/2/69% | 9/2/69% | 9/2/83% | 9/2/68% | 9/3/84% |
| 25 |  | 5×5 | 3 | 7 | 7/1/91% | 7/1/91% | 7/1/97% | 7/1/63% | 7/1/84% |
| 26 |  | 4×6 | 3 | 10 | 6/1/91% | 6/1/91% | 6/2/97% | 6/1/72% | 6/1/85% |
| 27 |  | 5×5 | 2 | 10 | 6/0/55% | 6/0/55% | 6/0/79% | 6/0/55% | 6/0/77% |
| 28 |  | 5×5 | 2 | 9 | 3/0/85% | 3/0/85% | 3/0/92% | 3/0/86% | 3/0/94% |
| 29 |  | 9×7 | 2 | 22 | 14/6/75% | 14/6/75% | 14/7/92% | - | - |
| 30 |  | 4×5 | 3 | 5 | 5/1/90% | 5/1/90% | 5/1/95% | 5/0/67% | 5/0/80% |
| 31 |  | 5×5 | 3 | 6 | 4/2/93% | 4/2/93% | 4/2/97% | 4/0/71% | 4/0/86% |
| 32 |  | 5×5 | 3 | 9 | 5/3/88% | 5/3/88% | 5/4/96% | 3/1/47% | 3/1/63% |
| 33 |  | 5×5 | 3 | 10 | 10/0/80% | 10/0/80% | 10/0/88% | 10/1/80% | 10/1/89% |
| 34 |  | 7×4 | 4 | 8 | 8/3/98% | 8/3/98% | 8/3/99% | 4/1/55% | 4/1/62% |
| 35 |  | 4×8 | 5 | 31 | ? | ? | ? | 19/0/79% | ? |
| 36 |  | 13×3 | 5 | 59 | ? | ? | ? | 35/22/91% | ? |
| 37 |  | 7×6 | 3 | 23 | 19/0/77% | 19/0/77% | 19/1/94% | 19/0/75% | 19/1/95% |
| 38 |  | 8×5 | 3 | 8 | 8/4/97% | 8/4/97% | 8/4/99% | 8/2/80% | 8/4/90% |
| 39 |  | 8×7 | 2 | 27 | 7/3/71% | 7/3/71% | 7/4/91% | - | - |
| 40 |  | 5×4 | 3 | 7 | 3/0/85% | 3/0/85% | 3/0/93% | n/a | n/a |
| 41 |  | 6×4 | 3 | 13 | 13/9/95% | 13/9/95% | 13/12/98% | 11/1/85% | 11/5/95% |
| 42 |  | 5×6 | 3 | 15 | 5/1/86% | 5/1/86% | 5/1/95% | 5/0/52% | 5/0/80% |
| 43 |  | 7×7 | 3 | 22 | 16/3/78% | 16/3/78% | 16/3/95% | - | - |
| 44 | 'Duh!' | 3×1 | 1 | 1 | 1/1/33% | 1/1/33% | 1/1/33% | 1/0/0% | 1/0/0% |
| 45 |  | 4×5 | 3 | 11 | 11/2/84% | 11/2/84% | 11/2/89% | 11/2/80% | 11/2/88% |
| 46 |  | 5×6 | 2 | 8 | 2/0/73% | 2/0/73% | 2/1/91% | 2/1/25% | 2/1/57% |
| 47 |  | 9×5 | 2 | 22 | 12/2/74% | 12/2/74% | 12/2/89% | - | - |
| 48 |  | 6×6 | 3 | 14 | 12/4/95% | 12/4/95% | 12/6/98% | - | - |
| 49 |  | 6×8 | 3 | 21 | 21/13/97% | 21/13/97% | 21/16/99% | - | - |
| 50 |  | 8×5 | 2 | 17 | 11/1/59% | 11/1/59% | 11/3/87% | 11/0/60% | 11/1/87% |
| 51 |  | 6×5 | 2 | 8 | 2/0/82% | 2/0/82% | 2/0/92% | 2/0/47% | 2/0/64% |
| 52 |  | 4×6 | 4 | 8 | 4/1/92% | 4/1/92% | 4/1/97% | 4/0/51% | 4/0/73% |
| 53 |  | 5×5 | 4 | 12 | 6/1/91% | 6/1/91% | 6/4/98% | 6/1/63% | 6/1/80% |
| 54 |  | 10×6 | 4 | 30 | ? | ? | ? | 26/5/89% | ? |
| 55 |  | 8×6 | 2 | 27 | 15/2/53% | 15/2/53% | 15/4/86% | 15/2/55% | 15/6/87% |
| 56 |  | 5×4 | 2 | 6 | 4/2/88% | 4/2/88% | 4/2/92% | 2/0/60% | 2/0/68% |
| 57 |  | 6×7 | 2 | 23 | 5/0/63% | 5/0/63% | 5/2/88% | 3/0/44% | 3/0/64% |
| 58 |  | 5×5 | 3 | 11 | 5/1/89% | 5/1/89% | 5/1/96% | 5/0/57% | 5/1/78% |
| 59 |  | 11×7 | 3 | 50 | 42/10/76% | 42/10/76% | ? | - | - |
| 60 |  | 8×8 | 4 | 44 | ? | ? | ? | 28/5/89% | ? |
| 61 |  | 7×8 | 4 | 21 | 15/0/82% | 15/0/82% | ? | 15/1/68% | 15/1/95% |
| 62 |  | 11×4 | 4 | 30 | 14/1/98% | 14/1/98% | ? | - | - |
| 63 |  | 17×4 | 2 | 50 | 4/0/53% | 4/0/53% | 4/0/81% | 4/0/33% | 4/1/53% |
| 64 |  | 8×7 | 4 | 30 | 14/1/94% | 14/1/94% | ? | - | - |
| 65 |  | 7×7 | 4 | 41 | ? | ? | ? | 37/15/90% | ? |
| 66 |  | 7×12 | 3 | 15 | 9/1/86% | 9/1/86% | 9/1/98% | 9/1/70% | 9/1/91% |
| 67 |  | 5×6 | 3 | 8 | 6/0/85% | 6/0/85% | 6/3/97% | 4/1/51% | 4/1/82% |
| 68 |  | 8×5 | 3 | 28 | 18/3/69% | 18/3/69% | 18/11/95% | 18/1/60% | 18/8/94% |
| 69 |  | 9×6 | 3 | 37 | 25/1/85% | 25/1/85% | 25/3/95% | 25/3/79% | 25/6/96% |
| 70 |  | 6×8 | 4 | 26 | ? | ? | ? | 26/9/95% | ? |
| 71 |  | 11×7 | 2 | 21 | 21/8/88% | 21/8/88% | 21/8/95% | 21/8/88% | 21/8/96% |
| 72 |  | 8×9 | 3 | 40 | 22/5/88% | 22/5/88% | 22/8/98%? | 22/3/88% | 22/5/98% |
| 73 |  | 6×8 | 3 | 25 | 25/6/79% | 25/6/79% | 25/10/93% | 25/6/78% | 25/11/93% |
| 74 |  | 9×6 | 4 | 34 | 30/5/84% | 30/5/84% | ? | 30/4/79% | ? |
| 75 |  | 8×5 | 4 | 34 | 26/5/90% | 26/5/90% | ? | 26/4/89% | ? |
| 76 |  | 8×9 | 3 | 56 | 56/6/75% | 56/6/75% | ? | 56/6/75% | ? |
| 77 |  | 9×5 | 4 | 55 | 55/30/87% | 55/30/87% | ? | 55/28/89% | ? |
| 78 |  | 9×6 | 5 | ? | ? | ? | ? | ? | ? |
| 79 |  | 8×4 | 3 | 18 | 4/0/92% | 4/0/92% | 4/0/96% | - | 4/0/63% |
| 80 |  | 8×9 | 4 | 38 | ? | ? | ? | - | ? |
| 81 |  | 4×7 | 3 | 12 | 8/1/92% | 8/1/92% | 8/2/97% | 4/1/44% | 4/1/58% |
| 82 |  | 6×6 | 3 | 14 | 10/2/95% | 10/2/95% | 10/8/99% | 10/7/65% | 10/8/89% |
| 83 |  | 6×8 | 4 | 47 | ? | ? | ? | - | ? |
| 84 |  | 10×8 | 3 | 68 | 48/19/69% | 48/19/69% | ? | 48/15/68% | 48/20/94% |
| 85 |  | 9×9 | 3 | 51 | 47/4/62% | 47/4/62% | ? | 47/4/60% | 47/9/91% |
| 86 |  | 7×6 | 4 | 25 | 21/5/89% | 21/5/89% | ? | 21/4/85% | ? |
| 87 |  | 7×8 | 4 | 53 | ? | ? | ? | 29/0/87% | ? |
| 88 |  | 7×10 | 3 | 63 | 51/18/52% | 51/18/52% | 51/31/90% | 51/10/55% | 51/24/92% |
| 89 |  | 8×7 | 4 | 35 | 35/8/74% | 35/8/74% | ? | 35/9/73% | ? |
| 90 |  | 8×5 | 4 | 16 | 10/0/91% | 10/0/91% | ? | 10/0/86% | 10/0/96%? |
| 91 |  | 9×3 | 4 | 14 | 10/2/95% | 10/2/95% | 10/6/98% | - | - |
| 92 |  | 13×8 | 3 | 48 | 24/7/78% | 24/7/78% | 24/10/96% | - | - |
| 93 |  | 9×9 | 8 | ? | ? | ? | ? | - | - |
| 94 |  | 7×6 | 3 | 29 | 13/4/93% | 13/4/93% | 13/5/97% | 13/3/93% | 13/6/97% |
| 95 |  | 6×6 | 8 | ? | ? | ? | ? | 8/0/85%? | 8/0/85%? |
| 96 |  | 9×9 | 3 | 37 | 7/0/86% | 7/0/86% | 7/1/98% | - | - |
| 97 |  | 12×8 | 5 | 41 | ? | ? | ? | ? | ? |
| 98 |  | 14×8 | 5 | ? | ? | ? | ? | - | ? |
| 99 |  | 20×8 | 4 | ? | ? | ? | ? | - | - |
| 100 |  | 6×6 | 4 | 52 | 24/1/92% | 24/1/92% | ? | 24/1/87% | 24/1/97% |
| 101 | 'Lockdown' | 11×11 | 5 | 15 | 7/0/90% | 7/0/90% | ? | n/a | n/a |
| 102 |  | 9×6 | 4 | 44 | ? | ? | ? | 44/11/95% | ? |
| 103 |  | 6×6 | 4 | 12 | 10/0/88% | 10/0/88% | 10/0/97%? | 10/0/74% | 10/0/95% |
| 104 |  | 7×7 | 3 | 27 | 17/1/83% | 17/1/83% | 17/3/96% | - | - |
| 105 |  | 9×9 | 8 | ? | ? | ? | ? | 8/0/48%? | 8/0/77%? |
| 106 |  | 8×7 | 5 | ? | ? | ? | ? | 44/5/92% | ? |
| 107 |  | 6×6 | 11 | ? | ? | ? | ? | 6/2/56% | 6/2/56% |
| 108 |  | 13×6 | 4 | 68 | ? | ? | ? | ? | ? |
| 109 |  | 7×11 | 5 | ? | ? | ? | ? | ? | ? |
| 110 |  | 7×7 | 4 | 14 | 10/2/88% | 10/2/88% | ? | - | - |
| 111 |  | 7×10 | 6 | ? | ? | ? | ? | ? | ? |
| 112 |  | 8×11 | 5 | ? | ? | ? | ? | ? | ? |
| 113 |  | 12×11 | 4 | 51 | ? | ? | ? | - | ? |
| 114 |  | 9×7 | 6 | ? | ? | ? | ? | ? | ? |
| 115 |  | 10×6 | 5 | ? | ? | ? | ? | 25/6/92% | ? |
| 116 |  | 8×5 | 5 | 14 | 10/5/93%? | 10/5/93%? | ? | 10/0/60% | 10/1/93% |
| 117 |  | 9×8 | 5 | ? | ? | ? | ? | ? | ? |
| 118 |  | 8×8 | 4 | 44 | ? | ? | ? | 36/7/91% | ? |
| 119 |  | 7×8 | 3 | 18 | 18/2/92% | 18/2/92% | 18/4/99% | - | - |
| 120 |  | 9×9 | 4 | 64 | ? | ? | ? | 62/14/89% | ? |
| 121 |  | 9×9 | 5 | ? | ? | ? | ? | 27/1/87% | 27/5/97% |
| 122 |  | 9×10 | 5 | ? | ? | ? | ? | ? | ? |
| 123 |  | 13×9 | 5 | ? | ? | ? | ? | ? | ? |
| 124 |  | 12×7 | 3 | 39 | 33/11/91% | 33/11/91% | ? | 33/11/91% | ? |
| 125 |  | 11×6 | 4 | 38 | ? | ? | ? | 38/12/84% | ? |
| 126 |  | 10×5 | 7 | ? | ? | ? | ? | 13/0/80% | 13/0/89%? |
| 127 |  | 8×7 | 4 | 32 | 10/3/95%? | 10/3/95%? | ? | 10/2/83% | 10/4/97% |
| 128 |  | 9×6 | 4 | 19 | 11/1/96% | 11/1/96% | ? | 7/1/68% | 7/2/88% |
| 129 |  | 9×6 | 5 | 22 | ? | ? | ? | 8/1/67% | 8/1/87% |
| 130 |  | 10×5 | 4 | 36 | ? | ? | ? | - | ? |
| 131 |  | 5×9 | 4 | 31 | 21/2/91% | 21/2/91% | ? | 21/0/90% | ? |
| 132 |  | 8×6 | 4 | 37 | 21/3/88% | 21/3/88% | ? | 21/1/75% | 21/6/95% |
| 133 |  | 8×6 | 5 | ? | ? | ? | ? | ? | ? |
| 134 |  | 10×8 | 4 | 76 | ? | ? | ? | ? | ? |
| 135 |  | 9×5 | 4 | 36 | 32/11/83% | 32/11/83% | ? | 32/6/84% | 32/17/95% |
| 136 |  | 7×6 | 4 | 25 | 23/5/84% | 23/5/84% | ? | 23/2/69% | 23/3/94% |
| 137 |  | 11×8 | 4 | 46 | ? | ? | ? | - | ? |
| 138 |  | 10×9 | 5 | ? | ? | ? | ? | ? | ? |
| 139 |  | 14×10 | 6 | ? | ? | ? | ? | ? | ? |
| 140 |  | 12×7 | 4 | 80 | ? | ? | ? | ? | ? |
| 141 |  | 8×7 | 6 | ? | ? | ? | ? | 22/2/94% | ? |
| 142 |  | 7×7 | 4 | 20 | 4/0/85% | 4/0/85% | 4/0/94%? | 4/0/0% | 4/1/53% |
| 143 |  | 7×13 | 6 | ? | ? | ? | ? | ? | ? |
| 144 |  | 10×10 | 16 | ? | ? | ? | ? | ? | ? |
| 145 |  | 9×9 | 12 | ? | ? | ? | ? | ? | ? |
| 146 |  | 7×7 | 12 | ? | ? | ? | ? | ? | ? |
| 147 | 'reduction of (Mas Sasquatch 8)' | 10×8 | 3 | 50 | 26/7/77% | 26/7/77% | 26/14/94%? | 26/5/65% | 26/9/95% |
| 148 | 'from (Original 18)' | 13×5 | 4 | 49 | ? | ? | ? | 33/6/96% | ? |
| 149 | 'from (Boxxle 43)' | 8×10 | 4 | 35 | 23/2/92% | 23/2/92% | ? | 23/1/86% | 23/7/98% |
| 150 | 'from (Original 47)' | 13×6 | 5 | ? | ? | ? | ? | ? | ? |
| 151 | 'from (Original 47)' | 10×8 | 4 | 50 | ? | ? | ? | 36/7/67% | ? |
| 152 | 'reduced (Mas Sasquatch 23)' | 13×7 | 4 | 35 | 17/9/65% | 17/9/65% | 17/9/77% | 17/0/37% | 17/0/57% |
| 153 | 'reduction of (Revenge 306)' | 11×8 | 10 | ? | ? | ? | ? | ? | ? |
| 154 | 'Take the long way home.' | 27×15 (big) | 1 | 2 | 2/0/11% | 2/0/11% | 2/0/20% | 2/0/6% | 2/0/12% |
| 155 | 'The Dungeon' | 28×15 (big) | 11 | 175 | 67/15/27% | 67/15/27% | 67/15/54% | 67/15/27% | 67/16/54% |
