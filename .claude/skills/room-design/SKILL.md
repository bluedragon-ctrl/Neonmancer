---
name: room-design
description: Design, draft, edit, review or rework a Neonmancer room (data/rooms/*.json) and its wiring in data/world.json: the game's core idea, workflow, room rework, schema cheat sheet, tuning numbers, puzzle rules, a mutation test and a headless play helper. Use whenever a room is created, resized, rewired, reviewed or reworked, or a mechanic needs a test room.
---

# Room design

A room is one JSON file in `data/rooms/`: all content, no code. Sources of
truth, in order: `schemas/room.schema.json` (fields), `src/data/validate.js`
(rules a schema can't say), `docs/design.md` "Room design checklist" (numbers
and playtest lessons). If this file disagrees with them, they win; fix this
file in the same PR.

## Core idea (read first, D186)
Neonmancer is an **isometric push-puzzle adventure with arcade bite**.
Crates, gravity and height are the puzzle (Sokoban with a third dimension:
crates as steps, stacks, falls off ledges, holes plugged). Enemies are
puzzle pieces first (a frozen enemy is a block, a decoy lures one onto a
plate) and pressure second. Small platforming and combat give the tempo.
**Every room earns its place with one trick.** A valid room without a
trick is not done; checks below make a room correct, the trick makes it
worth playing.

- **Type.** *Puzzle* (thinking: enemies only as pieces on readable paths,
  no clock, failure costs seconds), *hybrid* (a simple puzzle under
  pressure: a chaser, a tower, a timer; only mechanics already taught),
  *action* (a fight, a dash, light platforming; simple layout). Roughly
  60/25/15 % across the Lattice, tuned in playtests. Bosses and a breather
  before one sit outside the mix; no pure connectors.
- **The trick.** One sentence, "the trick is that ...", and the solution
  as numbered moves. A good trick is not the first thing he tries: the
  order of moves matters, a piece does two jobs or is used twice, an
  enemy is a piece, a move looks wrong until it isn't. Can't write it,
  or it reads "push the crate onto the plate": redraw.
- **Spell roles (Lattice).** Puzzle verbs: Zap (targets), Pause (enemy as
  block), Fork (plate holder, lure). Explore: Scan (secrets, hidden
  exits). Action: Shield.
- **No jump: pads, stairs, slabs** (D222, D223, D272). There is no jump
  key: a pad throws him 2 up,
  2 up over a 1-tile gap, 1 up over 2 tiles (D243), a stair takes him 1 up, a slab bridges, a bug he
  falls onto bounces him 2 up; nothing else lifts him. A 1-high wall is a
  wall and a crate is a Sokoban box again (he walks round it), every ledge
  is a one-way drop. Every height change is one the room places: that is
  the puzzle's third dimension.
- **Later abilities skip rooms, not pickups.** An ability found later may
  take him through the room to its exits without the puzzle (a shortcut
  on revisits); it never reaches a pickup without the trick that guards
  it. A pickup may need an ability as its gate (secrets do); no later
  ability may make its trick unnecessary. Guard pickups with what pads
  and spells can't replace: gates on switches (a `cage` over the pickup is
  one cell of them, D202), 3-high walls, fence roofs,
  pits too wide to cross, ledges with no stair or pad up.
- **Lattice abilities only.** In Home Lattice only its own abilities
  count: `zap,scan,fork,pause` (the checker doesn't model
  Shield). The wings open in any order, so a pickup's trick holds
  against all of them, not only those found after the room; pickups
  are checked with `--with zap,scan,fork,pause`, exits and secrets
  with `--with zap,scan,fork,pause,blink`: Blink is the Level 1 reward
  (`dj_vault`), after every Lattice fragment (D187, D216, D217). Each
  room's type, rung and trick to aim for
  is its line in the ladder (`docs/lattice-plan.md`). Pull, Compile,
  Cut & Paste, Warp and Firewall belong to later sectors (strong
  on purpose, maybe dropped or kept for development): don't design
  Lattice rooms around them or against them, and run every check below
  with the Lattice abilities (for an exit's first arrival, the subset
  he has) instead of the default (every ability). One exception: a
  later-sector spell may be the key to a return layer's extra (D260,
  below), never to a fragment.
- **Rooms grow on return** (D260). About two thirds of the rooms carry a
  *return layer*: something seen closed on the first visit that a later
  ability opens (a shortcut, a new exit, a secret, a cache). See
  "Return layers" below.

## Workflow
1. **May you touch it?** A room with `"authored": true` is the author's
   (CLAUDE.md §10, D90): never edit, resize, move or reconnect it, never attach
   a room to it. Real-content rooms are drafted **unflagged**; the author
   flags them. Tests never depend on rooms (use `tests/helpers.js` fixtures).
2. **Base.** CI on `main` green (a red base becomes your PR's problem); run
   `node tools/ensure-deps.js` once in a fresh checkout (npm scripts do it for
   you, scratch scripts don't).
3. **Concept** before any JSON: the type (puzzle/hybrid/action), the
   **trick** in one sentence and the solution as numbered moves, the rung
   (teach/develop/twist/revisit) and its line in the Lattice ladder
   (`docs/lattice-plan.md`), the focal point, what he sees from the
   entrance, the fair-failure case, what a later ability skips (exits
   only, never a pickup's trick), and the **return layer** (its key, what
   it opens, where he sees it closed; or why the room has none, D260).
   Hard to write → redraw. Read
   [craft.md](craft.md) when the room is a new idea rather than a fix.
   When the trick is a push puzzle, design it with the `sokoban-design`
   skill (XSB sketch, solver, classic levels) and come back for step 4.
4. **Draft** from the skeleton below; place pieces per the rules and tuning.
5. **Check** (all must pass; quote the output in the PR):
   ```
   npm run validate:data
   npm run check:reach -- <room>                     # needs per exit/pickup, in the world's order
   npm run check:reach -- <room> --with <a,b> --from <exit>   # every exit, first arrival and each gate's ability
   node .claude/skills/room-design/scripts/mutate.mjs <room>  # is the puzzle enforced?
   npm test
   ```
6. **Play** what the checker can't see (timing, bounces, enemies, races) with
   `scripts/sim.mjs`; screenshot it from the entrance.
7. **Wire** the doors, then **document**: a decision in `docs/decisions.md`, a
   CHANGELOG line, the step table in `docs/design.md`.
8. **Review**: run the `level-review` subagent and fix its findings.

## Rework an existing room (one room a session, step 5.17)
For the room reviews of D186. The author tunes the result in the editor,
so draft the idea, not the last cell.
1. **Read** the room JSON, its line in the Lattice ladder, its neighbours
   and the decisions it names; play it with `sim.mjs` or screenshot it.
2. **Say what it is now**: its type, its trick (or "none"), the solution
   as moves, what each piece does, and what the checker and the mutation
   test say (with the Lattice abilities: which later one skips which
   pickup), and what opens on a return now (its return layer, or none).
3. **Verdict**: *keep* (the trick holds), *tune* (the trick is there,
   pieces or numbers are off), *redesign* (no trick, or one a later
   ability skips for a pickup), *cut* (the room adds nothing to the
   wing). Keep what the wing needs from it: exits, pickups, the spell or
   boss it holds, its map position.
4. **Propose** for tune or redesign: the concept (workflow step 3), with
   a sketch of the layout (a top-down grid in text is fine), with its
   return layer (D260; a room without one gets one proposed, or the
   reason it skips), and stop for the author's OK. No JSON before it.
5. **Draft and check** (workflow steps 4–8) once the author agrees; the
   PR says what changed and why, and what to tune by hand.
6. A changed trick, rung or type updates the room's ladder line, and
   the "Now" column says it was reworked.
7. **Lessons.** The author signs each room off before the next; a rule
   the review found (a trap, a check, a better way to say it) goes into
   this skill or `craft.md` in the same PR.

Lessons from the reviews (D188 on):
- **A hub keeps its doors.** The floor between a hub's doors stays free;
  its puzzle sits to one side and pays a temporary reward (a boost), so
  a decoy skipping it later costs nothing.
- **Fence a plate with holes, not with low walls.** A 1-high pen beside
  a 2-high ledge is a step onto it (walls are steps too); holes keep
  floor crates off a plate and leave a drop from above as the way in.
- **Arcs hit what stands still.** A sentinel aims as it starts to
  charge (0.7 s), so a wizard walking across its line is never hit;
  pressure comes from what keeps him still or on its line: pushes, a
  lift ride, a 1-wide lane pointing at it. Sentinels on hole-ringed
  islands hold their post as turrets.
- **The checker runs every platform.** It ignores a platform's
  switches, so a lock made of plates and a lift is proven with
  `sim.mjs` (the lift stays down unpowered, the solution gets out).
- **Under fire, stop the push.** Where the puzzle is not the point
  (a push under pressure), a 1-high block past the plate stops the
  crate on it, so an over-push never loses it in a hole or a corner.
- **A watchdog sharpens a simple trick.** When a slow, sloppy way
  round does as well as the trick (freezing a walker anywhere and
  dragging it), a watchdog (`timer`, D172) makes the clean answer the
  one that fits. Time the clean solve with `sim.mjs` from every door
  and at every phase of the enemies' walk, and give it about 1.5–2× the
  worst case: room to aim and miss once (`freeze_hall`, 15 s, D192).
- **Hide nothing behind a cage.** Walls round a lane are 1 high: a
  2-high wall hides the enemy from the camera at +x +y +z.
- **A pickup holds from every door.** Run the mutation test `--from`
  each exit: a far door may put him beside the pickup with that side's
  crates (`bolt_gallery`'s north door, D195).
- **The checker hits every target.** It counts a target as on with
  Zap whatever its line and height. Prove a target's line with
  `sim.mjs`: sweep shots from every cell he can reach on the wrong side
  (32 directions, floor, ledge and crate tops, a pad's throw; facing can
  be diagonal), and check the right side hits. A bolt flies at feet +
  0.48: from a 1-high top it reaches 1.48, so a target one block up
  falls to a shot from any 1-high top he reaches, and to a shot in a
  pad's throw (D195). A target by a side wall keeps the crate under it
  there for good: one cell off, it can be pushed back out.
- **Stairs are for everyone, pads only for him** (D230). Enemies walk up
  a stair from its foot and down off its top; a chaser that sees him on
  another level finds its way there by stairs, and a chaser or a patrol
  knocked off its path comes back by them. A ledge reached only by pads
  (or a bounce) is safe from them. Patrol paths stay level. Crates and
  frozen enemies are pushed or pulled down a stair off its top in one
  push, never up one: its foot, its sides and onto its top from the side
  are walls to them. A crate below a ledge stays below it. A slab is a block to enemies. A powered bridge is floor to them; check no patrol or chase
  lane crosses one by accident.
- **Platforms are reachable on foot** (D228). A platform's dock
  (every stop he boards or leaves it at) is level with a floor, stair
  top or ledge he reaches on foot, or he steps on it from a stair or
  slab; never a hop up from the floor. Only a hard or secret room may
  need a trick lift (a bouncy enemy or a pad at one given spot), and the
  room says so in its notes. The checker takes platforms as free floor,
  so check boarding by hand or with `sim.mjs`.
- **Crates board ferries flush.** A platform is a 1-high block, its
  top 1 above the floor it docks on, so a floor crate never gets on;
  docks on a 1-high loft let crates roll on and off. He rides on top of
  a crate a platform carries. The checker takes platforms as floor and
  ignores their switches: prove power and riding with `sim.mjs` (D196).
- **Sockets and plates show only in the open.** A socket or plate lies
  at floor level; a block on its camera side (+x or +z) hides it, so
  never sink one into a loft. A filled socket's top is the floor (0): in
  a loft it is a dip a crate falls into (D196).
- **Borrow Sokoban levels.** A small classic level (Microban) makes a
  good push puzzle: turn it so its goals are what the room needs (a
  socket, a ferry dock, a hole), make its walls 1-high blocks (they
  stop crates; he steps over them, which is fine: he can't carry a
  crate, so only the pushes matter) and credit the level in the
  decision. Solve the turned level with a scratch BFS and check the
  crates meet: the pushes together must beat the sum of each crate
  alone, or each crate has its own easy route (Microban 24 did); count
  the dead ends, and play it with `sim.mjs` (D196).
- **Low walls are roads for crates.** A 1-high wall is a step for him
  and a road for a crate pushed off a ledge: it slides along the tops at
  height 1 and drops onto another crate, a 2-stack next to a 3-high
  fence is a way over it (`ledger_cell`, D203). Guard with a `cage`, a
  2-high `fence` rail, a 4-high wall or no wall there; run the mutation
  test with the lane walls in. A wall in front (+z) of a plate or socket
  hides it: use a `fence` there, and keep sockets off the back-corner edge.
- **A plate is one weight for Fork.** A decoy cast from a ledge onto the
  first crate of a stack holds a heavy plate; only sockets are fake-proof.
  Give every crate a job a decoy can't take (a socket on its route).
- **A stream pocket is the plate Fork can't fake.** Put a plate in a sealed
  one-cell pocket behind a `stream` cell: a frozen body passes, a decoy is
  stopped, and the body stays on it for good (`cold_stairs`, D204). Pockets
  sit at the lane's end rows, since a frozen bug cannot be pushed along a
  lane against its wall. Time the freeze, align and push with `sim.mjs`:
  the bolt only hits a bug whose box crosses his line (cast on a bug a few
  ticks short of the row), and the 5 s run is the clock.
- **A frozen bug is a stack's base** (`idle_cache`, D205). Freeze it, push it
  onto a heavy plate and drop the ledge crate on it: one crate and Pause make
  the weight of two, and the freeze is the clock. The crate first lies alone
  (a reset). The wizard counts too: keep the prize 2+ cells from the plate.
  Fork can still be the base (a decoy is no solid body). Time it with `sim.mjs`.
- **Scenery stairs are routes.** A staircase of wall pieces (1, 2, 3
  high) beside a plateau is a way up whatever it was drawn for; the
  mutation test shows it as the crate, enemy and gate "NO EFFECT" while
  Scan alone reaches the prize (`ghost_exit`, D206). Keep wall rows 1
  high or without a chain of steps he can climb.
- **A ledge crate is the second step.** Crates can't climb, so a 2-high stack
  needs the second one to start on a 1-high ledge and be pushed off onto the first
  (`guard_loop`, D207). Push it too early and it lands on the floor with nothing
  to stack on: a reset, so say it in the decision. A 1-wide door and 1-high wall
  lanes keep the crate's cells few, but two pushable frozen guards still make the
  single-room check and the mutation test take over a minute: fine for CI
  (`check:reach` of the world stays seconds), say so.
- **A closed cage is standable.** Like a gate it is a block he can stand on;
  the checker counts standing on a cage over a pickup's cell as being in that
  cell. In the open it can open a whole bank for Fork (`fork_lab`, D209): keep
  the cage where its top can't be reached (walls round it, a roof), or size it
  like the gate it replaces.
- **A crate's pocket is a gate, a pickup's pocket is a cage.** A `cage` is for
  a pickup in plain view (D202); a crate behind a switch stays behind a white
  gate and fences (`twin_plates`, D210).
- **Fork beats a plate race.** A timed plate is a race only without Fork: a
  decoy holds it for 10 s. Say so in the decision, or use a target or socket
  if the race must hold (`scan_lab`'s secret door, D212).
- **Walls keep the crate search small.** Three or four free crates on
  open floor blow `MAX_CONFIGS`; a truncated search says "unknown" for
  what it didn't reach (D275) and can hide bypasses (it stops at the first
  one it finds). It goes best first, towards plugged holes and held plates,
  so a solution usually turns up before the cap.
  A 1-high wall on the side a crate can only be pushed from (he can't
  push from a wall top, one level up) keeps it in its lane; ledger_cell
  searches in full with three crates and two lane walls. Check for the
  "search stopped" warning on every run.
- **`check:reach` floods from the door.** It assumes he can walk back to the
  door between pushes; where crates shut him away mid-solution (a
  roof, a socket's approach) it says `never` and the mutation test lists every piece as NO EFFECT.
  Prove such a room with `solve.mjs` (it tracks where he stands) and `sim.mjs`.

- **The puzzle keeps 2 cells from every door** (D241). Busy at a piece
  beside a doorway, he steps out by accident and the room resets when he
  comes back. No crate, plate, socket or pad in the 2 rows in front of a
  door or the cell beside either end, and no push, crate route or enemy
  lane he works with there. `check:reach` warns of the pieces where they
  start; check the routes by hand.

Lessons for pads (D222 on):
- **A pad is a one-way lift.** It fires the moment he stands on it, so a
  pad in a doorway, a 1-wide lane or behind a crate he must push throws
  him about; put it at the foot of what it climbs, off the walking lines.
  A crate pushed onto it covers it until the room resets.
- **A pad may sit flush against its ledge** (D243, D244). Flush, a floor
  pad lands him on a ledge up to 2 up from anywhere on the pad, in any
  room (until D244 a room with a stair or a slab dropped him back: a
  collision bug, now fixed). The apex is only 0.2 over a 2-high top, so a
  gap between pad and ledge (boot_up's stair to a step with the pad on it,
  a gap, the ledge) is still the more forgiving build where a throw must
  not miss.
- **A throw goes 2 up over a 1-tile gap, 1 up over 2** (D243). A pad lands
  him on a ledge up to its whole launch higher across one tile (a 3-high top
  from a pad on a 1-high block), a block less across two, never across
  three; the checker counts the same. Since D274 the landing is a rule
  (`src/world/puzzle-rules.js` `throwLanding()`, which the game and the
  checker both ask): the first column ahead in the held direction he can
  stand on at his level or higher, whatever his run-up; a pad never throws
  him over flat floor to something further on. So a guarded ledge needs 3
  up over one tile, 2 over two, or a 3-tile gap; the checker's verdict on a
  throw is exact, `sim.mjs` is for timing. A pad on a step plus Blink cast
  14–22 ticks after the throw crosses 2 tiles onto a 3-high sill (the
  checker models Blink at the launch height); a hidden pad+Blink door
  needs that sim window checked.
- **A bug is a moving pad** (D223). He can't get on top of a bouncy enemy
  from its level; dropped onto it from a ledge, a stair's top or a pad's
  launch, it throws him 2.8 up: a 2-high ledge, never 3. The way up walks
  with it, so the trick is timing the drop; Pause turns it back into a
  1-high block (a step down from, not up to). The checker counts every lane
  cell at any time: time the drop with `sim.mjs`.
- **Drops are one way.** A ledge he steps off is gone for him unless a
  stair or pad leads back: draw the way back from every door first, then
  the puzzle.
- **A walk-off carries.** Walking off a 2-high ledge he lands up to 1.4
  cells out (his middle), about 1 off a 1-high one: a lower top or a pad
  within that reach is reached from the higher ledge. Keep 2 tiles between
  them, or a higher block on the corner (`ghost_exit`, D245).
- **A decoy falls.** Cast from a ledge into the open column over a walled
  pocket, it drops onto the plate in it: a plate only a decoy holds, from
  that ledge; the checker counts it (D245).
- **He follows a crate into its socket** (D262). Holding the push, he walks
  after a crate that drops into a socket, and lands in the cell: fence a
  socket's approach one cell further out, never round the socket itself,
  or it is a pit. Play the drop with `sim.mjs` holding the key.
- **Check every cell he can drop into** (D242). Off a column or out of a
  pad's throw he lands anywhere near; a floor cell walled by blocks and a
  stair's side is a pit with no way out. Fill it or give it a stair.
- **Zap aims in eight directions.** A far target he must hit from one spot sits
  on an axis or a 45° diagonal through that spot's middle; sweep it with
  `sim.mjs` from every point of the spot (D242).

## Skeleton
```json
{
  "$schema": "../../schemas/room.schema.json",
  "schemaVersion": 1,
  "id": "snake_case_matches_file",
  "name": "Short Funny Name",
  "biome": "home_lattice",
  "size": [10, 4, 10],
  "spawn": [8.5, 0, 8.5],
  "exits": [{ "id": "west", "side": "-x", "at": 4 }],
  "blocks": [{ "at": [0, 0, 0], "to": [1, 1, 3] }],
  "holes": [{ "at": [4, 2], "to": [5, 3] }],
  "objects": [{ "id": "crate_1", "type": "crate", "at": [6, 0, 2] }],
  "enemies": [{ "id": "bug_1", "template": "bug", "at": [2, 0, 6], "path": { "points": [[2, 0, 9]] } }],
  "pickups": [{ "id": "fragment_7", "type": "fragment_7", "at": [0, 2, 0] }]
}
```
Write new files with `formatJson` (`src/editor/format-json.js`; `npm test`
rejects any other spacing):
`node -e "import('./src/editor/format-json.js').then(({formatJson})=>{const f='data/rooms/x.json',fs=require('fs');fs.writeFileSync(f,formatJson(JSON.parse(fs.readFileSync(f,'utf8'))))})"`.
Edit existing files with small text edits, not a JSON dump.

## Schema cheat sheet
- **Axes.** y up. `size` = `[x, y, z]`, x and z 1-31 with x + z <= 32, y 2-6.
  Floor y = 0, back walls x = 0 and z = 0, camera at +x +y +z.
- **Cells.** `blocks`/`objects`/`enemies`/`pickups` take `[x, y, z]`; `holes`
  and `shrine` take floor tiles `[x, z]`; `spawn`/`reset` are feet-center
  points (`[5.5, 0, 8.5]` = middle of cell 5,8). `at` + `to` fills a box
  (blocks, holes). Required: `schemaVersion id name biome size spawn`.
- **Ids.** Stable snake_case; room id = file name; object, enemy and pickup
  ids share one namespace per room.
- **Exits.** `{ id, side: -x|+x|-z|+z, at, width 2, y 0, height 2 }` (`at` =
  first cell along the side; `y` raises the doorway). Optional:
  `requires: [{ "switch": id } | { "switch": "*" } | { "access": 1-15 }]`
  (solid until every entry holds; recloses when a switch goes off, never on
  him, always open for him if he came in through it; a switch entry needs a
  switch in the room), `hidden: true` (wall until Scan). The first row inside
  must be free.
- **Blocks** (`defs.json` blocks): `block` (default) `fake
  fence stream bollard collapsing collapsing_regrow gate bridge cage`. A `fence` (D167) is a
  block for bodies (he stands on it, crates and enemies stop) that hides
  nothing and lets bolts and sight through: wall off or raise a wall
  without blocking the view; a target behind it takes a Zap; a tower
  behind it still shoots (no cover). 1 high pens crates, 2 high stops him
  for good. A `stream` (D198) is a fence in
  magenta that crates and frozen enemies pass and he does not, with no
  top: no throw or crate gets him over or onto it, so build it 2 high.
  A crate is pushed into it from the near side only (he cannot stand in
  it): a 1-thick wall hands a crate over, one cell beyond; in a thicker
  one it stops in the last cell. Use it where the trick is routing
  crates through a field he cannot follow (sokoban-design). A `bollard`
  (D276) is the opposite: a thin post crates and enemies (frozen or not)
  stop at and he walks through, no top (nothing rests on it or is pushed
  over it), bolts pass: a row pens crates in a yard he walks in and out
  of; one gap in a row is the crate's only way through. A `cage` (D202) is a one-cell gate that looks like a fence, in the room's color:
  a pickup lies inside it (the one filled cell a pickup may share, with
  `fake`), it takes `switches` and sinks like a gate; bolts and sight pass,
  so a Zap can't take it and nothing else needs hiding. The mutation test
  lists it as a `sealed cage`. `gate`/`bridge` take `switches`
  (default: every switch in the room): a gate goes, a bridge appears while
  all are on. A gate in a hole stands a block high (top 1.0): a step, not
  floor. A bridge is a white glass sheet at its cell's floor (D224): at y 0
  it must lie over a hole and is floor there while powered (crates roll
  over it; gone, he falls in and a crate on it plugs the hole); higher up a
  walkway level with 1-high ledge tops.
  A gone bridge shows no outline: the room that first shows bridges says
  what one is in a screen text (see Screen texts below).
  Stairs `stair_x stair_nx stair_z stair_nz` (D221; one editor entry,
  R turns it): a stair rising +x, −x, +z, −z: he walks up it from the
  cell at its foot onto a ledge one higher; sides and back are walls; a
  block to crates and enemies. `slab`: a thin glass walkway at the top
  of its cell, level with a 1-high ledge; a cell down he walks under it.
- **Objects** (`defs.json` objects): crates `crate crate_plain crate_cross
  crate_dashed`; switches `plate plate_timed plate_heavy target target_timed socket`; `platform
  spiked_platform` (need `path`, may take `switches`: run only while all on);
  the jump pad `pad` (D221: on the floor or a block's top; standing on it throws him 2.2 up by itself, over a 1-tile gap 2 up, over 2 tiles 1 up (D243), in any room; with stairs and bug bounces the only way up in a pads room; never where he must walk across or stand; a crate on it covers it); decorations `screen data_pillar memory_stack` (`overrides: { "face":
  "+x"|"+z" }`; a screen may name a `text` in `data/lore.json`: title <= 32,
  lines <= 48 characters, only as help, see Screen texts below); `core`. `overrides` change only existing type
  values (e.g. a timer). Plates and sockets lie at y = 0 (validated): on a
  raised level the only switch is a target. A socket (D194) is a hole that
  is on once a crate fills it, for good: the lock a decoy or a frozen enemy
  can't hold, and a crate spent there is gone for anything else. Its tile
  is a hole (deadly; no hole entry on it).
- **Screen texts (help, D163).** A screen with a `text` is a console: help
  for a spell or concept the wizard meets here for the first time (what Zap,
  a plate, a bridge, a frozen bug does; the key to cast), in the room that
  teaches it. Never how to solve the room: no which crate goes where, which
  plate needs what, the order of moves, or where the way home is. Test it: the text reads true in any room with that
  mechanic, not only this one. Rooms with no new concept get no help text
  (a plain screen as decor, or lore and a joke with no hint, is fine).
- **Paths.** `{ points, mode: pingpong|loop, speed, pause }`: points follow
  `at`, each leg along one axis. `speed` (u/s, default 2) and `pause` (s at
  the ends) are for platforms only; a platform path may not cross a static
  block.
- **Enemies.** `{ id, template, at, path? }` only: no overrides, no speed
  (D119). Patrollers need a level path (legs along x or z), chasers may have
  one, stationary ones none. Not over a hole. A boss
  (template with `boss`) adds `drop`: the id of a permanent pickup of the
  room (D104, D135); one boss a room, no `shrine`, arena exits never locked.
- **Pickups** by defs id: `disk_*`, `fragment_N`, `secret_N`, `buff_*`,
  `upgrade_*` (permanent: one save bit each, D71: never place the same one
  twice by accident; world map F3 lists duplicates), `refill_*`, `boost_*`
  (temporary). Inside a `fake` block is fine (Scan reveals it), and inside a
  `cage` (D202: locked behind its switches).
- **Shrine** `[x, z]`: one floor tile, not on a hole, plate, block or object.

## Tuning (from the checklist; 60 ticks a second)
| What | Number |
|---|---|
| No jump (D222, D272) | a 1-high wall is a wall, a crate a box he walks round; every ledge a one-way drop |
| Pad | 2.2 above it the moment he stands on it: a 2-high ledge from the floor (3-high from a pad on a block), over a 1-tile gap onto a ledge up to 2 higher, over 2 tiles up to 1 higher, never over 3 (D243); onto the first column ahead he can stand on at his level or higher (D274); the pad's cell and three above free; up to a 2-high ledge ~30 ticks (0.5 s), back down to its level ~46 (0.77 s) |
| Stair | 1 up from its foot, the way it rises; walked at walking speed; a crate or frozen enemy is never pushed up it (its foot is a wall to them); pushed off the ledge over its top it slides down to its foot (one push, D230); enemies walk it both ways, at half their cell rate (two cells a step) |
| Bug bounce (D223) | only when he falls onto it: 2.8 over its lane, a 2-high ledge, never 3; the checker counts the whole lane |
| Headroom | wizard 1.5 high: 2 free cells over every standing surface. A block above is a ceiling, the room's height is not (he stands on top of a 2-high wall in a 3-high room); keep standing surfaces 2 below the room height for the look |
| Bouncy enemy (bug, glowbug) | launches 2.2 above its top (0.6), so 2.8: clears a 2-high ledge, never 3 |
| Frozen enemy | a 1-high block (1×1×1), a stone level with a 1-high ledge, pushed like a crate |
| Zap bolt | flies level, 0.48 above his feet; a bug is 0.6 high. From the floor it hits bugs and 1-high blocks; from a 1-high top it flies over both and hits a target standing a block up; a shot in a pad's throw does too (D189) |
| Blink (Level 1 reward, D217) | 3 units level, through open space; stops at blocks, objects, fences and streams (hurts 1 if cut short). From standing: a 2-tile pit, never 3. Cast 14–22 ticks into a pad's throw: two cells further, as high as the launch goes (D243). The checker models both (axes only): sweep diagonals with `sim.mjs` |
| Walk | 4.5 u/s, ~13 ticks (0.22 s) a cell |
| Push | ~28 ticks (0.47 s) a cell |
| Collapsing block | goes 30 ticks (0.5 s) after a step: never make him stand still on one |
| Pause | 25 energy of the base 50 (two casts, then slow recharge); 5 s freeze (300 ticks), a recast restarts it |
| Timed switch | timer = the run from the switch to the far side of what it powers + ~1 s; checker counts it as on for good |
| Watchdog timer (room `timer`, D172) | the run from the entrance, and from `reset`, to the last permanent pickup (taking it stops the timer; all found: no timer), or to the way out in a room without one, + ~2–3 s; checker ignores it; only where speed is the idea |

## Rules
1. **Readable from the front corner.** Tall blocks against the back walls
   (x = 0, z = 0), steps on the camera side, every mechanic (pit, spiked
   platform, collapsing bridge, plate) in view from the entrance. **Every crate is
   visible** (D164): never hidden behind a tall block, a ledge, a pillar or
   a memory wall from the camera (+x +y +z), never inside a fake block or
   walled in where no cell of it shows; one face in view (its top, +x or
   +z) is enough. **Stairs, plates and targets are visible too** (D227):
   every stair (foot and slope), floor plate, heavy plate, socket and bolt
   target shows a face from the camera and can be aimed at or walked to:
   never behind a tall block, ledge, pillar, decoration or memory wall,
   never under a bridge or slab, never in a pocket walled in on the +x/+z
   sides. Check each from the entrance; a bolt target also needs a clear
   line of fire.
2. **Gates look like gates** (a too-high ledge, a locked door): he should
   come back later, not think it is broken (D67).
3. **He can always leave the way he came** with what he has; a room needn't
   be solvable on first arrival. Two-way is the default; a one-way exit
   (`"oneWay": true` on the arriving end, D259) is a way in only, for a
   drop into a pit room or a one-way shortcut home: then he must be able
   to leave another way with what he has on arrival or finds in the room
   (the checker makes it an error).
4. **No soft-locks.** Every one-shot change (collapse without regrow, crate in
   a corner or hole, spent Compile/Fork) leaves a way to an exit or a way to
   die and reset. `reset` is safe: not on a collapsing block, not under a
   platform's path. Dropping off a ledge is always possible, climbing back not.
5. **Small rooms, one trick** (D68, D186): 8x8 and 12x12 mostly; a big
   room needs a reason (arena, hub, vista).
6. **Colors come from the biome** (D99): red hurts, white is a mechanism,
   cyan moves, neon green is pushable, black is a pit.
7. **Refills are a trade-off**: temporary, and death resets him.
8. **Test rooms** for a new mechanic go in the dev wing: add the id to
   `world.json` `dev` and connect it only to dev-wing rooms (D147, D158;
   today `hidden_layer`); start it with `?room=<id>` on the dev server. Add a
   showcase look and unit tests for the mechanic (D43).

## Return layers (D260)
A room worth coming back to: on the first visit he sees something he
can't use yet (a pit too wide, a wall that sounds hollow, a lock, a
crate out of reach), and an ability found later opens it. The world is a
maze (D67), so a new spell should send him back through rooms he knows,
each read anew.
- **How many.** About two thirds of the rooms in the mix carry one.
  Teach rungs, bosses, breathers and the goal may skip it; say why. Across
  the world every new ability opens at least three places it was seen
  closed (craft.md 7).
- **What it pays.** A *shortcut* (a one-way exit home, D259; a gate
  opened from the far side; a crossing back to a hub the ability shortens), a *new exit* (an
  optional room, a loop, an Outer Buffer door), a *secret* (a permanent
  pickup, but there are only 16 secret bits in the whole game, so most
  layers pay something else), a *fragment* (Lattice keys only), or a
  *cache* (a boost or a refill: temporary, cheap, the common case).
- **Keys.** In the Lattice: Blink (the one sure later key, the Level 1
  reward), another wing's spell (the wings open in any order, so for some
  players it is open on the first visit: an optional extra then, which
  is fine), the energy buff (a third Pause), an access level. Later-sector
  spells (Warp, Pull, Shove, Swap, Compile, Cut & Paste, Firewall) may key extras
  only, never a fragment: the room is whole without them, and if such a
  spell is dropped its layers go or get a new key. Read each key's reach
  in the tuning table, not from memory.
- **Seen on the first visit.** The closed thing is in view from his
  route and looks like a gate (rule 2): a mental to-do, not a find. A
  secret keeps its hint (craft.md 2), never a screen text.
- **Off the main puzzle.** Rooms reset, so a return should not cost the
  whole puzzle again: the layer starts from the room's through-route, or
  the puzzle before it is short. A chore on every pass is a bad layer.
- **A small trick of its own.** One or two moves with the new ability,
  set up by this room, best with its own pieces read anew (the crate
  that plugged a pit is the step a pad can't give; the bug lane is a
  bridge once frozen). A shortcut may be the ability alone (Blink over
  the pit): the payoff is the way home.
- **No red herring.** On the first visit none of its pieces may look
  like part of the main trick: put it to one side, in a shape plainly
  beyond what he has (Sokoban: every tile of the puzzle is used).
- **Never a bypass.** Its key must not reach the room's own pickups
  without their tricks, and nothing the room needs (an exit the wing
  needs, a pickup) waits on it. He can still leave the way he came.
- **Check it** (both must hold):
  ```
  npm run check:reach -- <room> --with <set he has> --from <exit>        # the layer: never
  npm run check:reach -- <room> --with <set he has,key> --from <exit>    # the layer: reached
  node .claude/skills/room-design/scripts/mutate.mjs <room> --with <set he has,key>  # pickups still need their tricks
  ```
  What the checker can't model (a diagonal Blink, timing) is played with
  `sim.mjs`. Record the layer in the "Return layers" table of
  `docs/lattice-plan.md` (room, key, what opens, status).

## Puzzle checks (lessons from D156 and D157)
- **Crates.** A crate can only be pushed away from a side he can stand on:
  trace every crate's route. Plates against a wall so nothing overshoots. Do
  not wall in his own path with crates (a 2-wide island with crates across
  it is a knot). A crate lost in a corner is fine (rooms reset) if you
  checked it.
- **Pit width = crates + 1.** A pit N wide needs N-1 crates; count crates that
  can reach it from the *other* side too (the island's, the return trip).
- **Tops are roads.** Any top he reaches (a stair, a pad, a bounce) leads
  along every top of the same height it touches, crates and frozen enemies
  included: an alcove walled level with a top he reaches is no gate. A
  pad on a reachable top throws him a further 2 up. Keep the walls that
  guard something behind it from the camera (`ledger_cell`, D160).
- **Both directions.** `--from <exit>` for every exit: coming back must work
  with what lies on that side (the way-in puzzle is reset on re-entry).
- **Crates as cover** block a tower's line until they drop into a hole; don't
  promise more in hints. **No fire line** on the cells just inside an exit.
- **Bugs bounce** (2.8): a bug at the foot of a 2-high ledge is a way up
  without Pause; only 3 high stops the bounce and a frozen-bug step (1.0 +
  1.2). Fine where he already has Pause. A bounce also carries him ~3
  cells sideways: keep a bouncy lane 2+ cells from a gap it could throw him
  over (D159); the checker models a bounce as straight up only.
- **An enemy used as a step can die** (zapped from habit, or popped in a
  hole): if it is the only way out of an area, give a second way (a crate,
  a step) so killing it never leaves death as the exit.
- **A plate on a patrol path flickers** (the walker presses it, a gate opens
  for a moment): put it one cell beside the path; prefer a bridge to a gate
  for a held plate (a flicker of a bridge carries nobody).
- **Frozen enemies go where they are pushed.** The checker pushes them
  like crates from every cell of the path (D166), as far as he can follow,
  and counts every cell they can reach as a step and plate weight (it
  ignores the 5 s clock: time the run with `sim.mjs`). Hem the path in
  (walls, the room side, a pit it pops into). Plate against a wall: the
  next push may go into a pit.
- **A heavy plate** (`plate_heavy`, `weight` 2, D200) needs two bodies in
  its column: a stack, so it is the lock a decoy or a frozen enemy alone
  can't fake (a crate, a frozen enemy, the decoy and he each weigh one; he
  counts, so a crate he stands on holds it only while he stays). It is
  the answer to "a plate alone is no lock": a crate on it plus a ledge
  crate dropped on top. Under one weight it flickers half-lit, so the
  player sees he is on the right track.
- **One decoy.** Fork holds one plate at a time (a new fork replaces the
  old, D129); the checker counts it so (D171). Two plates that must be on
  together need a second holder (a crate, a frozen enemy, him on a timed
  one). The wizard can stand on any plate himself, so a decoy's plate is
  one he must leave: a bridge he has to cross, or a pen of 1-high fences
  that keeps crates off it. Cast from a ledge, the decoy falls onto what
  lies below (the checker only counts a cast from beside the plate).
- **Another way is fine if it is no easier** (D166). A second solution of
  the same or higher difficulty (a harder throw, a tighter race) is not a
  bypass; one that skips the room's idea for less effort is. Say which in
  the review.
- **Later abilities and pickups** (D186). A later spell may open the room's exits without its puzzle; it may never reach a
  pickup without the trick. Check it: the mutation test's first lines
  (in the Lattice `--with zap,scan,fork,pause` for pickups, D187) list each
  pickup's ability sets, e.g. `pickup fragment_6: fork or pause`. For every set
  that is not the room's own, rerun with `--with <that set>`: the trick's
  key pieces must still show `→ never` for the pickup. A key piece with
  NO EFFECT, or one that turns into another ability, means that set skips
  the trick. Fix it with what an ability can't replace (a switch-powered
  gate, a 3-high wall, a fence roof, a wider pit). A plate alone is no
  lock: a decoy holds any one plate, a frozen enemy one on or beside its
  lane; lock on a heavy plate (two weights, D200: a stack), on two plates at once, weight that stays longer than 10 s,
  or where a crate ends up (a hole, a step, a stack). Sets that only open
  exits are fine. The later sectors' spells are left out in the Lattice,
  except a return layer's key (D260): add it to the set and check the
  room's fragments again.

## Mutation test (`scripts/mutate.mjs`)
Takes each helper away (crate, platform, enemy, bridge, block) and seals each
gate (a plain block for good), in memory, then lists per exit and pickup what
it depends on and which pieces nothing depends on:
```
node .claude/skills/room-design/scripts/mutate.mjs ledger_cell --with ""
Depends on:
  pickup fragment_5: crate_b [2,0,7] (→ never), crate_1 [6,0,2] (→ never), sealed gate [1,0,6]-[1,2,6] (→ never), sealed gate [6,0,6]-[6,2,6] (→ never)
Every helper and gate matters.
```
A sealed gate or a key piece with NO EFFECT is a bypass: find the route and
fix it (before D160, `ledger_cell` showed both gates as NO EFFECT: a crate
was a step over the 2-high wall). Default searches with every
ability (so each target shows its smallest ability sets); `--with a,b` and
`--from exit` as for `check:reach`. Interchangeable crates hide each other
when taken one at a time: `--without crate_a,crate_b` takes all but one out
first. The checker takes platforms as free floor, so ferry and lift power
(plates only crates hold) is judged by hand.
"crate search stopped at 2000 configurations" turns what it missed into
`unknown` (D275; 4+ roaming crates can hide a solution): raise `MAX_CONFIGS`
(`src/world/reach.js`) temporarily to confirm, or keep fewer free crates.

## Play it (`scripts/sim.mjs`)
The checker knows no timing, bounce, energy, facing or enemies ("reachable"
is not a promise; "unreachable" is a real bug). Play the solution in a scratch
script in the scratchpad (never a committed test), importing the helper by
absolute path:
```js
import { startRoom, pauseEnemy } from '<checkout>/.claude/skills/room-design/scripts/sim.mjs'; // absolute path; on Windows a file:/// URL with %20 for spaces
const sim = startRoom('cold_stairs', { abilities: ['zap', 'pause'] }); // or { at: [x, y, z] }
sim.walkTo([8.5, 0, 3.5]);         // along x, then z, to within 0.1
sim.cast('pause'); sim.run(30);    // selects via Tab, casts, waits 30 ticks
sim.step(['up'], ['cast']);        // hold up, tap cast (Space), one tick; walk onto a pad to go up
sim.until(() => sim.game.player.pos[1] >= 2, ['up']);  // throws when stuck
sim.log('on ledge');               // tick, seconds, pos, integrity, energy, gates, pickups
```
Directions: down +x, up -x, right -z, left +z. `sim.game` is the real `Game`
(`game.enemies`, `game.objects`, `game.player.place([x, y, z])`);
`pauseEnemy(sim.game, enemy, 300)` freezes as the spell does. Bugs move 0.05 a
tick: wait for a cell with a tolerance, not equality. Time each race against
its clock (a timed switch, a freeze counted from the shot) and report the
margin: less than ~1 s spare is a problem.

Screenshot: `npx vite`, open `http://localhost:5173/?room=<id>&msaa=0` with
Playwright (`executablePath: '/opt/pw-browsers/chromium'`) and look at it from
the entrance: is every mechanic and every crate visible, does anything tall
hide a cell?

## Wiring
- An exit leads to the room in the next map cell in its direction (D259;
  `positions` in `world.json`: +x is east, +z is south), into that room's
  exit in the opposite side, equally wide; several exits in one side pair
  up in order along it (by `at`, then `y`). A door needs the room's exit,
  the neighbour's matching exit (check the neighbour is not authored) and
  the room's map cell; nothing else lists the pair. Validation fails while
  an exit leads nowhere.
- Keep exits the author has left free for later wings (decisions name them).

## Examples (copy their shape, not their cells)
No room is flagged authored yet; when some are, open two or three of the
same role before drafting and copy their density and rhythm. The rooms
below predate D186: they show mechanics and checks done right, not the
depth a room needs; each is reviewed in step 5.17.
- `cold_stairs.json` (Pause): a frozen bug pushed onto a plate beside its lane
  holds a bridge for the freeze; a second bug is the step up a ledge; a 3-high
  back ledge leads home over the pit. Every piece matters (mutation test).
- `bolt_gallery.json`: a 3-wide pit filled with two crates, towers covering
  the bridge column; the first crate is his step to two targets two
  blocks up (the cage and the fragment's pocket, then the door) before it
  bridges (D195; the cage's gates show NO EFFECT one at a time only because each
  side is a way out).
- `ledger_cell.json`: a socket and a heavy plate on one cage over the
  fragment; three crates (socket, base, ledge stack), lane walls keep them
  in the checker's search (D203).
- `relay_loft.json`: a loft flush with the ferries' tops, so crates ride them; a
  Sokoban pen of 1-high walls on it (Microban 45) feeds two sockets in the pit and the
  ferry he rides on his crate (D196; power judged with `sim.mjs`).
- `hidden_layer.json` (dev wing, Scan): `fake` blocks.
