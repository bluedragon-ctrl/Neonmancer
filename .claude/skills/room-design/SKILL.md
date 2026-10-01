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
  optional `locked` (opens while every switch in the room is on; needs >= 1
  switch), `access` (level 1-15), `hidden` (wall until Scan). Connections
  live in `data/world.json` (`"room.exit"` pairs, `positions` on the map
  grid; neighbours sit one cell apart, the side must match the direction).
- Types come from `data/defs.json`: blocks `block hazard void fake collapsing
  collapsing_regrow`; objects `crate* plate target core platform
  spiked_platform screen data_pillar memory_stack`; platforms need a `path`;
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

## Loop: draft -> check
```
npm run validate:data                       # schema + game rules
npm run check:reach -- <room_id>            # what each exit/pickup needs
npm run check:reach -- <room_id> --with double_jump,zap --from west
npm run check:reach                         # whole world, in CI
npm test
```
The checker knows nothing of enemies, timing, energy or facing: "reachable"
is not a promise, "unreachable" is a real bug. Then run the level-review
subagent (`level-review`) on the finished room.

## Annotated examples (copy their shape)
- `data/rooms/tractor_bay.json` (Pull): two crates across a moat; `holes`
  rectangles are the moat; the east exit is behind it, so the mechanic is
  seen from the entrance and the reward (disk) sits on the near side.
- `data/rooms/decoy_lab.json` (Fork): a plate in a slot under a lintel (only
  a decoy fits), a `locked` exit opened by it, a virus to draw away.
- `data/rooms/hidden_layer.json` + `secret_cache.json` (Scan): `fake`
  blocks, a `hidden` exit, a secret behind it.
- `data/rooms/build_yard.json` (Compile): a 2-wide trench and a 2-high ledge.
