---
name: room-design
description: Design, draft or edit a Neonmancer room (data/rooms/*.json): schema, rules, tuning numbers, the room design checklist and annotated examples. Use whenever a room is created, resized or reviewed, or a mechanic needs a test room.
---

# Room design

A room is one JSON file in `data/rooms/`, all content, no code. Source of
truth: `schemas/room.schema.json` (fields), `src/data/validate.js` (rules
JSON Schema can't say), `docs/design.md` "Room design checklist" (the
numbers and playtest lessons). Read the checklist before drafting.

## First: may you touch it?
- A room with `"authored": true` is the author's (CLAUDE.md §10, D90).
  Never edit, resize, move or reconnect it, and never attach a new room to
  one. New test rooms connect only to test rooms. Real-content rooms are
  drafted **unflagged**; the author refines them in the editor and flags them.
- Tests never depend on authored rooms (fixtures in `tests/helpers.js`).

## Coordinates and format
- y is up. `size` = `[x width, y height, z depth]`, width + depth <= 32,
  height 2-6. Floor is y = 0; back walls are x = 0 and z = 0. Camera looks
  from +x +y +z.
- `blocks`/`objects`/`enemies`/`pickups` cells are `[x, y, z]`; `holes` and
  `shrine` are floor tiles `[x, z]`; `spawn`/`reset` are feet-center points
  (`[5.5, 0, 8.5]` = middle of cell 5,8). `at` + `to` fills a box.
- Ids are stable snake_case; room ids match the file name; object, enemy
  and pickup ids share one namespace per room. Start from `$schema` and
  `schemaVersion` as in the examples.
- Exits: `{ id, side: -x|+x|-z|+z, at, width 2, y 0, height 2 }`, plus
  optional `requires` (`[{ "switch": id }]` or `{ "switch": "*" }` for every switch; `{ "access": n }`; needs >= 1 switch in the room), `access` (level 1-15), `hidden` (wall until Scan). Connections
  live in `data/world.json` (`"room.exit"` pairs, `positions` on the map
  grid; neighbours sit one cell apart, the side must match the direction).
- Types come from `data/defs.json`: blocks `block hazard void fake
  collapsing collapsing_regrow gate bridge`; objects `crate* plate target
  plate_timed target_timed core platform spiked_platform screen
  data_pillar memory_stack`; platforms need a `path`. A `gate`/`bridge`
  block entry (a box) may take `switches` (D140, D141: a gate goes, a
  bridge appears while they are all on; without, every switch in the
  room); a platform's `switches` run it only while they are all on;
  screens may name a `text` id in `data/lore.json`; pickups by their defs id
  (`disk_*`, `fragment_N`, `secret_N`, `buff_*`, `upgrade_*`, `refill_*`).
- Enemies: `{ id, template, at, path? }` only. No overrides, no path speed
  (D119). A patroller needs a path of level legs; a chaser may have one.
  A boss (template with a `boss` block) also has `drop`: the id of a
  permanent pickup in the room, where it falls once the boss is beaten
  (D104, D135). One boss a room, no `shrine`; don't lock the arena's
  exits: the wizard may always retreat.
- A permanent pickup is one save bit, the item not the place (D71): don't
  place the same fragment twice by accident (the world map F3 report lists
  duplicates).

## Tuning (from the checklist; trust the doc if these drift)
- Jump clears exactly 1 block up; crosses a 1-tile gap, never 2. Double jump
  (upgrade): 2 up, 2 wide. Bouncy enemy: launches 2.2 up.
- Wizard is 1.5 high: 2 free cells above every surface he stands on, so a
  3-high ledge needs height 5.
- Walk 4.5 u/s (~13 ticks per cell); a push ~28 ticks; collapsing block goes
  30 ticks after a step. Never make him stand still on one.
- Timed switch: its timer is the run from it to the far side of what it
  powers (~0.22 s a cell, ~0.57 s a jump) plus about a second. The checker
  doesn't check timing; work it out by hand.

## Design rules
1. **Readable** from the front corner: tall blocks against back walls, steps
   on the camera-facing side, each mechanic visible from the entrance.
2. **Gates look like gates** (a too-high ledge, a locked door): the player
   should come back later, not think it is broken (D67).
3. **Backtracking is fine**: a room needn't be solvable on first arrival,
   but he can always leave the way he came with what he has.
4. **No soft-locks**: every one-shot change (collapsing block, crate pushed
   into a corner or hole) leaves a way to an exit or a way to die and reset.
   `reset` is safe: not on a collapsing block, not under a platform's path.
5. Small rooms beat big ones (D68): one idea per room, 8x8 / 12x12 mostly.
6. Refills are temporary and death resets: place them as a real trade-off.
7. Room colors come from the biome; don't invent colors (D99). Red hurts,
   white is a mechanism, cyan moves, lime is pushable.
8. New mechanics get a test room (D43) near the start (<= 2 rooms from Boot
   Sector, D49), plus a showcase look and unit tests.

## Puzzle craft (lessons from the Shield wing, D156)
- **Sokoban riddles are welcome.** Crates pushed round corners onto plates,
  through gates, into pits: they make good multistep rooms. Keep them fair:
  a crate can only be pushed away from a side he can stand on, so check
  every crate's route; put a plate against a wall so a crate cannot
  overshoot it; do not wall in his own path with crates (a 2-wide island
  with crates across it is a knot). A crate lost in a corner is fine (leave
  and re-enter resets the room), but say so to yourself and check it.
- **Pit width = crates + 1.** A jump crosses one tile, so a pit N wide needs
  N-1 crates; a 2-wide pit falls to one crate. Count crates that can reach
  it from the *other* side too (the island's crates, the return trip).
- **Both directions.** Check `--from <exit>` for every exit: coming back
  must work with what lies on that side (a puzzle solved on the way in is
  reset on re-entry).
- **Crates as cover.** A crate between a tower and him blocks its line;
  cover ends when the crate drops into a hole. Do not promise more in hints.
- **Don't land in a fire line.** Check the cells just inside each exit
  against tower columns and rows.
- **Mutation test.** Remove each key crate or gate from a scratch copy and
  re-run `check:reach <room>`: if a pickup stays "free" the puzzle is not
  enforced. Platforms count as free floor for the checker, so ferry/lift
  power must be judged by hand (moats wide enough that a crate cannot
  bypass them).
- **Truncated search.** "crate search stopped at 500 configurations" makes
  a `never` verdict unreliable; with 4+ roaming crates it can hide a
  solution. Raise `MAX_CONFIGS` temporarily to confirm, keep rooms checkable
  (fewer free crates), or both.

## Design craft (what makes a room good, not just valid)
Principles from games of the same family: Solstice and Head Over Heels
(isometric, planning over reflexes), Zelda dungeons and Mario 3D World
(teach/test/twist), Super Metroid (ability gates, pacing), Sokoban and
Baba Is You (one rule, fair riddles), The Witness (one idea, many
variations). Ideas only; nothing is copied (CLAUDE.md §1).

1. **One idea per room, taught in order.** Per mechanic, a ladder over
   several rooms: *teach* (the idea alone, safe: a mistake costs a reset,
   not a life), *develop* (same idea, a harder shape), *twist* (combined
   with another mechanic or an enemy), *revisit* (a short, easy callback
   later, so he feels he has learned it). Before drafting a room, say which
   rung it is. A twist room whose parts he has not met is a bug.
2. **Show the answer's ingredients first.** The player should see the goal
   (an exit, a pickup, a plate) and every tool (crate, switch, ledge) from
   the entrance or from one step in. Puzzles of the "I did not know that
   existed" kind are unfair; secrets are the exception, and even they get
   a hint (a lone block, a strange gap, a screen text).
3. **Planning beats reflexes** (the isometric tradition). Timing and enemy
   pressure spice a puzzle; they do not replace it. A room is either a
   thinking room (few or slow enemies, no clock) or an action room (simple
   layout), rarely both. Hard on both axes is for a boss or a late combo.
4. **A first-glance failure must be recoverable and visible.** Wrong
   crate push, wrong jump: the cause is obvious and re-entering costs
   seconds. Avoid failures he cannot explain (hidden hitbox edges, a
   platform that depends on unseen timing).
5. **Archetypes.** Pick one on purpose:
   - *teaching* (small, 8x8, no threat, one mechanic, reward visible)
   - *test* (12x12, the mechanic in a new shape, light threat)
   - *combo* (two mechanics; only after both were taught)
   - *arena* (open floor, cover, a few enemies, no puzzle)
   - *breather* (a refill or shrine, scenery, lore screen; no threat)
   - *connector* (a walk with one small beat: a gap, a patrol)
   - *secret* (off the path, needs a spell or a sharp eye, pays a
     permanent pickup)
   - *boss* (see the boss rules above)
6. **Pacing across rooms.** Alternate effort: no more than two threat-heavy
   rooms in a row, and a breather or shrine before a boss. A wing opens with
   a teaching room and ends with a payoff (a pickup, a shortcut, a gate
   opening). Shortcuts that open a loop back to a hub are rewards: place one
   per wing so backtracking gets shorter as the world grows (D67).
7. **Gates and keys.** A locked thing is seen before its key is found, ideally
   in a room he passes twice. The key room and the lock room should be far
   enough apart that he has a mental to-do and near enough that he
   remembers it. A new ability should open at least two seen-but-closed
   places, never just one.
8. **Space and composition.** Give every room a focal point (the exit
   ahead, a tall structure, the core, a glowing plate) placed away from the
   entrance so the eye crosses the room. Use height for drama, not filler:
   tall blocks against back walls, low ones in front (rule 1). No dead
   floor: if an area is empty, it is a sightline, a safe landing, or it is
   cut. A big room needs a reason (an arena, a hub, a vista).
9. **Fair difficulty dials.** Tune by crates, pit width and enemy count
   before tuning by speed or damage. Leave one slack unit: one crate
   spare, one cell of landing room, one second on a timed switch.
10. **Reward honesty.** Effort and reward match: a permanent pickup for a
    multi-step puzzle or a risk, a refill for a short detour. A secret
    costs an extra move, not a guess among 50 walls.
11. **Name and dress it.** Every room gets a short, funny terminal-style
    name and (where it helps) a screen with a hint or a joke (D118). Decor
    (pillars, screens, memory stacks) frames the focal point; it never
    hides a mechanic or blocks a sightline from the entrance.
12. **Self-check before the checker.** In one line each: the idea, the
    rung (teach/develop/twist/revisit), the archetype, the focal point,
    what he sees first, and the fair-failure case. If one line is hard to
    write, redraw the room, then run `check:reach` and `level-review`.

Mining the author's taste: the rooms with `"authored": true` are the
reference. Open two or three similar in role (size, archetype) before
drafting and copy their density and rhythm, not their cells.

## Wiring a room
- A new door also needs the neighbour's exit, the connection pair and the
  `positions` entry in `data/world.json`; check the neighbour is not
  authored. Edit existing files with small text edits, not a JSON dump.
- Format room files with `formatJson` (`src/editor/format-json.js`); a test
  rejects other spacing. Lore lines are at most 48 characters.
- Finish with a decision in `docs/decisions.md`, a CHANGELOG line and the
  step table in `docs/design.md`; run `level-review` and fix its findings.

## Loop: draft -> check
```
npm run validate:data                       # schema + game rules
npm run check:reach -- <room_id>            # what each exit/pickup needs
npm run check:reach -- <room_id> --with double_jump,zap --from west
npm run check:reach                         # whole world, in CI
npm test
```
The checker knows nothing of enemies (except that with `pause` every cell a
pausable enemy walks counts as a 1-high step, and a plate on that path or
one push beside it can be held), timing, energy or facing: "reachable"
is not a promise, "unreachable" is a real bug. Then run the level-review
subagent (`level-review`) on the finished room.

## Annotated examples (copy their shape)
The old test rooms (tractor_bay, decoy_lab, build_yard, ...) were removed
from the data; these Lattice drafts are the examples now (git history
keeps the old ones).
- `data/rooms/bolt_gallery.json`: a 3-wide pit filled with two crates, one
  caged behind a gate a target opens; towers cover the bridge column.
- `data/rooms/ledger_cell.json`: a chain of two plates and two gates.
- `data/rooms/cold_stairs.json` (Pause): a frozen bug pushed onto a plate
  beside its lane holds a bridge for the freeze time; a second bug is the
  step to a ledge that leads back over the pit.
- `data/rooms/hidden_layer.json` (Scan, dev wing): `fake` blocks.
