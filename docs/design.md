# Design

Game design details that go beyond [CLAUDE.md](../CLAUDE.md), plus the plan
for the current phase. Locked decisions live in CLAUDE.md; their reasons in
[decisions.md](decisions.md).

## Controls (default)

| Action | Keys |
|---|---|
| Move | WASD / arrow keys; grid-aligned by default: Right ↗, Up ↖, Left ↙, Down ↘ |
| Jump | Space |
| Cast | J |
| Cycle spell | Q / E |
| Pause | Esc / P |
| Map | M |
| Switch movement mode | G |
| Debug mode | F3 |
| Fullscreen | F |

Debug mode only, once toggled on with F3:

| Action | Keys |
|---|---|
| Jump to the next/previous room | ] / [ |
| Toggle invincibility | I |
| Test damage (−1 integrity) | H |

Keys are physical positions (`KeyboardEvent.code`), so the layout is the
same on QWERTY, QWERTZ and AZERTY keyboards.

## Player

- Hitbox 0.6 × 1.5 × 0.6 (hat is visual only) — needs 2 blocks of headroom.
- Walks at 4.5 units/s along the grid axes (default) or screen-relative
  (G toggles); diagonals are normalised either way.
- Jump clears exactly one block (`jumpHeight` 1.2). Every jump has the same
  height (no short hops), so the block rule never depends on timing (D19).
- Forgiveness: a jump still works 6 ticks after walking off a ledge, and a
  jump pressed up to 6 ticks before landing happens on landing.
- Turns smoothly towards the walking direction; starts facing the camera.
- Tuning values live in `PLAYER` in `src/entities/player.js`.

### Movement mode

G switches between the two key → direction mappings (D38), announced with a
terminal message and shown as a small permanent tag, bottom right:

- **Grid** (default, D23): each key moves along one grid axis, which looks
  diagonal on screen (Right ↗, Up ↖, Left ↙, Down ↘).
- **Screen**: each key moves the wizard that way on screen instead —
  straight up/down/left/right — by combining both grid axes. Holding two
  adjacent screen directions (e.g. Up + Right) then collapses to a single
  grid axis, same as pressing one key in grid mode.

Not saved: it always starts in grid mode. `GRID_DIRECTIONS` and
`SCREEN_DIRECTIONS` in `src/entities/player.js` are the two key → [dx, dz]
tables; `Game.movementMode` picks between them each tick.

### Look

Hologram look (D22): magenta cone body, cyan ball head and two small
floating cyan ball hands, magenta pointy hat (cone + brim) sitting on the
head, tilted back so the face shows under the brim, glowing white eyes.
Each part has a dark core glowing towards its silhouette, faint scanlines
drifting up and a thin neon outline. Proportions are `WIZARD` in
`src/render/wizard.js`; review looks in the asset showcase
(`/tools/showcase.html?asset=wizard`).
- Integrity (health) max 8, at most 15 (4 bits in the save key); it carries
  over between rooms. Falling into a hole or landing on a void block drains
  it all; respawning restores it (D35).

### Damage

Every damage source calls `Game.hurt(amount)` (D43): hazard blocks and the
debug `H` key, platforms squeezing the wizard now, enemies in later Phase 2
steps.

- A hit takes integrity and reports a `hurt` event (`amount` actually
  lost). The wizard's hologram flashes: white-hot for 3 ticks, then
  magenta fading out by 8 ticks. The effect stays on him; nothing covers the
  screen. Then he stays invulnerable until 60 ticks (1 s) after the hit
  and blinks (4 ticks shown, 4 hidden); hits during that time do nothing.
  No knockback. Invulnerability carries through exits and ends on respawn.
- Losing the last point kills him (`die` event, cause `damage`): he
  derezzes on the spot, flickering and squeezing into a thin beam while
  a burst of cyan and magenta pixels drifts up out of him (placeholder
  until the Phase 4 juice pass), then recompiles at the room's reset point
  after about 1.1 s, like a hole death (cause `hole`, dropping into the pit).
  Each cause prints its own terminal line.
- Nothing hurts a dead wizard; debug invincibility blocks all damage.
- Tuning: `invulnerableTicks` and `deathTicks` in `PLAYER`; the look is
  `HIT_FX` in `src/render/hit-fx.js`, shown looping in the asset showcase
  (`/tools/showcase.html?asset=wizard-hit`).

## Hazard and void blocks

Static blocks of their own type (`"type"` on a room's block entry, D40,
D44), solid like plain blocks. They are drawn in an animated look of
their own (color from `defs.json` `blocks`, not the room color), so they
read as active. Their edges stay steady and are drawn over plain blocks'
edges where they meet. Motion is slow; nothing strobes.

- **Hazard look:** dark red faces with red pixels (8 per unit) that
  switch on and off at random, each on its own timer (about 30% lit,
  1.5 re-rolls per second). The block that just hurt the wizard flares for
  0.4 s.
- **Void look:** black faces in a thin, dim violet frame, working as
  windows into the block. Layers of sparse grains lie behind each face
  (found along the view ray, clipped to the block) and slowly sink deeper,
  shrinking and fading, as if falling into the void (9 s per layer). Grains
  show more strongly through the top face, since only landing on top
  kills.
- **Hazard rules:** touching one hurts, standing on
  it or walking into any side of it (`damage` in defs.json, 1). The body
  must overlap the block on two axes and lie against or in it (within 0.02),
  so brushing past a corner diagonally doesn't count. Leaning on or
  standing on one keeps hurting each time the 1 s invulnerability ends.
- **Void rules:** landing on top is
  instant death (`die`, cause `void`), whatever the integrity; he derezzes
  on the spot like a damage death. Only the block under his feet center
  counts, like a hole, so an edge under one foot is safe; walking into its
  sides is safe; a crate or plain block on top of one covers it.
- Debug invincibility: hazards don't hurt, void blocks don't kill.
- Validation: `spawn` and `reset` can't be above a hazard or void block
  (he would land on it), and a raised exit's floor can't be a void block.
- Tuning: color and `damage` in `data/defs.json` `blocks`; the animated
  looks are `BLOCK_FX` in `src/render/block-fx.js`. Review them in the
  asset showcase (`/tools/showcase.html?asset=block-hazard,block-void,blocks-in-room`).

## Moving platforms

Room objects of kind `platform` (D40, D46): a 1×1×1 block in its own
color (`platform` in `defs.json`: cyan, tinted faces, bracket marks) that
follows a path given on the room object.

- **Path** (shared with patrolling enemies later): from the object's `at`
  through `points` (cells, the platform's lower corner), each leg along one
  axis. `pingpong` (default) runs there and back, `loop` runs on from the
  last point straight back to `at`. `speed` in units per second (default
  2, at most 8); `pause` seconds of waiting at the ends: both ends of a
  ping-pong path, `at` on a loop. Corners keep the speed; stops are exact
  whole cells.
- **Riding:** whatever stands on top moves with it: the wizard, resting
  crates, and whatever stands on those (stacks ride along). A wall or
  block scrapes the wizard off; he keeps walking and jumping as usual.
- **In the way:** a crate or another platform in its way, or a carried
  crate that would hit something, makes it wait until the way is clear.
  A crate under a lift jams it.
- **The wizard in the way** is shoved out of it: along the motion, or aside
  when only an edge of him is caught (at most 0.35 units per tick). With no
  room for that (pinned against a wall, fully under a lift coming down,
  carried into a ceiling) it hurts him (1 integrity, through `Game.hurt()`)
  and waits; it never kills outright, and he can walk out.
- Crates on a platform can be pushed only while it stands at a stop (on
  whole cells).
- **Guide line:** one dim glowing line in the platform color through the
  middle of its path, at the height of its bottom face: a projection of
  where it moves (a vertical leg runs up through the middle of its column).
- Validation: points inside the room, legs along one axis, nothing static
  on the path, and no path through the first row inside an exit. Crates on
  the path and holes under it are fine.
- Tuning: `PLATFORM` in `src/entities/platform.js`, `RAILS` in
  `src/render/rails.js`; review in the asset showcase
  (`/tools/showcase.html?asset=platform,platforms`).

## Collapsing blocks

Room objects of kind `collapsing` (D40, D47): a 1×1×1 block in its own
color (`collapsing` in `defs.json`: magenta, thin dashed edges, tinted faces)
that gives way under the wizard.

- **Trigger:** only the wizard standing on it (grounded, feet on its top,
  any part of his footprint over it). Walking into its side, jumping past
  it or a crate resting on it does nothing; a dead wizard doesn't trigger
  it either.
- **Shake, then gone:** it shakes for 0.5 s, harder towards the end, then
  breaks into pixels that tumble down and fade, and is gone: whatever
  stood on it falls (the wizard, crates). Once shaking it goes even if he
  steps off. Running across a row of them is safe; stopping is not.
- **Regrow** (optional, `regrow` seconds on the room object): that long
  after vanishing it grows back from its center, but only once nothing is
  in its cell (the wizard or a crate standing there makes it wait).
  Without `regrow` it stays gone until the room resets.
- **Over a hole:** a collapsing block may stand in a hole tile (a bridge
  that gives way); when it goes, the wizard drops into the pit and a crate
  plugs it.
- Validation: `regrow` only on collapsing blocks; spawn and reset points
  don't count a collapsing block as holding the wizard up over a hole.
- Tuning: `COLLAPSING` in `src/entities/collapsing.js`, the look is
  `COLLAPSE_FX` in `src/render/collapse-fx.js`; review in the asset
  showcase (`/tools/showcase.html?asset=collapsing,collapsing-cycle`).

## Enemies

Corrupted programs (D48), listed in a room's `enemies`. Everything about one
comes from data: its type in `defs.json` `enemies`, and the room's
`overrides` for that one enemy.

| Field | Values | Meaning |
|---|---|---|
| `movement` | `patrol`, `stationary` | patrol walks the enemy's `path` (required); stationary stays in its cell (no path). Chasing comes with Viruses (Phase 3). |
| `attack` | `contact`, `none` | contact: touching it hurts while it is hostile. Projectiles come with Pop-ups. |
| `hostility` | `hostile`, `peaceful`, `provoked` | hostile attacks; peaceful never does; provoked is peaceful until a spell hits it (Zap, step 6), then hostile. |
| `aggroRange` | units (default 0) | how far a hostile enemy notices the wizard; used by chasing and shooting later, no effect on patrol and contact. |
| `integrity` | 1–15 | hits it takes (spells, from step 6). |
| `damage` | ≥ 1 | integrity the wizard loses per attack. |
| `speed` | units/s | walking speed; a path's own `speed` overrides it. |
| `bounce` | true / false | trampoline top (below). |
| `color` | #rrggbb | hologram color. |

- **Moving:** an enemy stands in a grid cell (hitbox 0.6 × 0.6 × 0.6,
  centered) and steps one cell at a time with one hop per cell (bug: 3
  cells per second). It only starts a step from a whole cell, so on a
  platform only at a stop.
- **Patrol:** the shared path format (D46) with level legs (along x or z,
  all at the height of `at`); only x and z count once it walks, so after
  falling off a ledge it keeps to its path below. Ping-pong or loop, pause
  at the ends.
- **Blocked:** a wall, a block, a step up, a crate, a platform or another
  enemy in the way turns it back to the waypoint it came from, after a
  0.2 s beat (`turnTicks`). It never leaves the room.
- **Physics:** it walks off ledges and falls, rides platforms (which wait
  while it steps on or off, and wait for one in their way), and a crate
  can rest on it but can't be pushed into it. Falling into a hole or
  landing on a void block pops it into pixels; it stays gone until the
  room resets. Hazard blocks don't hurt it; it never triggers collapsing
  blocks.
- **The wizard** walks through enemies. Touching a hostile one with a
  contact attack hurts him (`Game.hurt()`, then the usual invulnerability).
  Landing on top of a **bouncy** one bounces him up 2.2 above its top
  (clears 2 blocks) without hurting him; its sides still hurt if it is
  hostile. Other enemies can't be stood on.
- **Look (bug):** a mint-green hologram ball with two slanted eyes whose
  color shows its mood: red hostile, amber calm until provoked, cyan
  peaceful. A bouncy bug wears a white pad ring on top and squashes when
  bounced on. It hops as it walks, bobs while standing, turns towards
  where it walks and pops into pixels.
- Validation: known type, valid overrides, a free cell of its own not over
  a hole, ids unique among objects and enemies, a patrol has a level path
  clear of static blocks, a stationary enemy has none.
- Tuning: `ENEMY` in `src/entities/enemy.js`, `PLAYER.bounceHeight`, the
  look is `BUG` in `src/render/bug.js`; review in the asset showcase
  (`/tools/showcase.html?asset=bugs`).

## Pushing

- Push by walking into an object along a grid axis while standing on the
  ground at its level, with the wizard's center lined up with the object
  (grazing a corner doesn't push). After 8 ticks (~0.13 s) it slides one
  cell at 3 units/s, slower than walking, so the wizard visibly shoves it.
  Holding the key keeps pushing, cell after cell.
- One object at a time; an object with something on top (another object or
  the wizard) cannot be pushed (D4). No chain pushing.
- The target cell must be free: no block, room side, object or wizard.
- A pushed object slides one cell, then falls at once if nothing supports
  it; it lands on blocks, other objects or the floor, so objects stack.
  Falling objects show a drop shadow in their own color.
- An object falling onto the wizard rests on his head and falls on when he
  steps away.
- Tuning values: `PUSHABLE` in `src/entities/pushable.js`, `pushDelay` in
  `PLAYER`.

## Holes

- Floor tiles marked in the room data; drawn as black pits with a bright rim
  on a faintly tinted room floor.
- The player dies when the center of his hitbox is over a hole at floor
  level (grazing the edge is safe; jumping over is safe), drops into the pit
  and respawns at the room's own `reset` point (D39) after about 1.1 s.
  Respawning resets the room (D24).
- A block pushed onto a hole drops in and fills it: the hole becomes
  walkable floor and the block is used up: only its top stays visible,
  flush with the floor, with short corner lines fading into the pit like
  the pit's own (objects are never drawn below the floor, so a crate
  dropping in sinks out of sight). Puzzle idea: push the crate into the pit to cross it.
- No way down: holes are only a look plus a rule, never a real lower level.

## Rooms and exits

- Horizontal exits only in Phase 1: an opening on one side of the room
  (`side`, first cell `at`, `width`, floor level `y`, `height`).
- On the back sides an exit is a doorway in the wall (framed, with a
  threshold line) leading into darkness: a short tunnel fading to black with
  corner lines fading into it, like a hole's pit. On the front sides it is a
  gap in the invisible boundary and in the floor edge.
- Exits show where they lead in the color of the connected room. On a
  doorway, dashes flow from the doorway into the dark tunnel along its
  corner edges and two lanes on its floor, fading to black. On a front exit,
  small arrows, one per tile of exit width and side by side, glide out to
  the edge within the first row of tiles, fading in and out in two waves. Tuning values are `EXIT_FX` in `src/render/exit-layout.js`; review
  them in the asset showcase (`/tools/showcase.html?asset=exits`).
- An exit leads out once the wizard's feet center passes the side. The
  screen fades to black (0.2 s) while he walks on out and the world stands
  still, then the connected room fades in (0.25 s, already playable). He
  arrives half a cell
  inside the matching exit, keeping his offset along the edge, his height
  above the exit floor, his fall and his facing.
- Where he respawns if he dies is each room's own `reset` point (D39), not
  the arrival point: it stays put regardless of which door he came through.
- Rooms fully reset on entry and on respawn.
- Objects never leave a room: pushing one out through an exit is blocked.
- The first row of cells inside an exit must be free (no blocks, objects or,
  at floor level, holes). A raised exit (`y` > 0) needs something to stand
  on in front of it, usually a ledge.

### Test rooms

Test rooms stay in the world until content production (Phase 4) builds the
real rooms and puzzles (D45). They are a test lab: each shows one mechanic
in isolation, and later spells and enemy behaviors get tested in them too.
New mechanics add or extend one (D43). Boot Sector, the start, is the
hub: every test room is at most two rooms away from it, so no test means
walking the whole world (new exits are added for that where needed, D49).

| Room | Size | Exits | Shows |
|---|---|---|---|
| `boot_sector` (start, hub) | 12×12 | north doorway → Cache Hall; raised east exit on a ledge → Stack Yard; west doorway → Crawl Space; south (front) → Transit Bus | blocks, holes, two crates |
| `cache_hall` | 16×8 | south (front) → Boot Sector | a 3-wide pit across the room: push a crate in, then jump the rest |
| `stack_yard` | 8×8, Glitch Zone color | raised west doorway → Boot Sector; east (front) → Fault Line | stacked crates, a 2-high block to climb via a crate |
| `fault_line` (Phase 2) | 12×12 | west doorway → Stack Yard; raised east exit on the lookout → Transit Bus | a corridor between hazard walls, hazard blocks between two plain ones to walk across, a zigzag path of plain blocks through a field of void blocks up to a lookout |
| `transit_bus` (Phase 2) | 12×12, 5 high | west doorway → Fault Line; north doorway → Boot Sector; raised east exit on the high ledge → Volatile Memory | a ferry across a pit between two ledges, a lift up to a high ledge, a loop carrying a crate, a press coming down (with a crate to jam it) and a pusher squeezing the wizard against the room's edge |
| `volatile_memory` (Phase 2) | 12×12, 5 high | west doorway → Transit Bus; raised east exit on the high ledge → Crawl Space | a pit across the room with two collapsing bridges: one regrowing after 3 s (the way back), one that stays gone, with a crate on a plain ledge in front of it to push onto the bridge from solid ground (it doesn't trigger the blocks, so it is a safe spot to hop onto); two one-shot collapsing steps up to a high ledge |
| `crawl_space` (Phase 2) | 12×12 | west doorway → Volatile Memory; east (front) → Boot Sector | bugs: a sentry crossing the entrance lane, one walking off a ledge and patrolling the floor below, a lane with a crate to push in its way, a provoked one circling a pillar, a peaceful bouncy one to reach a 2-high ledge |

### Room design checklist

What to check when building or reviewing a room, beyond what validation
catches (validation: bounds, overlaps, exits, spawn and reset points). It
collects problems found in playtests; the room design skill and the level
review subagent planned for Phase 3 (CLAUDE.md §9) start from it, and the
reachability checker will automate the reach and timing checks. Numbers
come from the tuning tables (`PLAYER`, `PUSHABLE`, `PLATFORM`,
`COLLAPSING`); update them here when those change.

**Reach**
- A jump clears exactly 1 block up, never 2 (apex 1.2). A 2-high step
  needs a crate, a platform or a step in between.
- A running jump crosses a 1-tile gap, never a 2-tile one (~1.65 units of
  air travel); a pit 2 or more wide needs a bridge, a platform or a crate
  to plug it.
- A bouncy enemy launches him 2.2 above its top (0.6): from the floor
  that clears a 2-high ledge, never 3. Where the enemy can walk, the way
  up moves with it.
- Headroom: the wizard is 1.5 high, so wherever he stands there must be 2
  free cells above the surface. A ledge 3 high needs a room 5 high.

**Timing** (60 ticks per second)
- Walking (4.5 units/s) crosses one cell in ~13 ticks (0.22 s); a jump
  lasts ~34 ticks (0.57 s).
- A push takes ~28 ticks (0.47 s): 8 ticks of walking into the crate, then
  20 ticks of sliding one cell.
- A collapsing block goes 30 ticks (0.5 s) after he steps on it. Running
  across or hopping off in time is fine; anything that makes him stand
  still on one (a push, lining up a jump, waiting for a platform) is
  almost always fatal. Give such actions solid ground (playtest: pushing a
  crate off a collapsing bridge).
- Platforms: check the wait at the ends (`pause`) is long enough to get on
  and off, and that a squeeze always leaves a way out.

**Readability**
- The camera looks from the front corner (+x, +z). Tall blocks near the
  front sides hide what is behind them: keep high ledges and walls against
  the back walls (x = 0, z = 0), and put steps on the side facing the
  camera, not behind a ledge.
- Each mechanic should be seen before it matters: a pit, a hazard or a
  collapsing bridge in view from where the wizard enters.

**No soft-locks**
- Every one-shot change (a collapsing block without `regrow`, a crate
  pushed into a hole or into a corner) must leave a way back to an exit, or
  a way to die and reset the room. Dropping off a ledge is always possible
  (no fall damage); climbing back is not.
- Exits stay reachable from wherever he can end up; rooms fully reset on
  re-entry and respawn, so no puzzle stays broken for good.
- `reset` (the respawn point) must be safe to land on and let him walk
  away: not on a collapsing block, not under a platform's path.

## HUD

A DOM overlay on the stage, sized in 1080p pixels (`--u`), all text from
`data/strings.json` (D34).

| Where | What |
|---|---|
| Top left | Integrity: label over a row of slanted cyan cells, one per point. A lost cell flashes white and empties; at 2 or less the bar turns magenta and blinks. |
| Top center | Banner: a title decoding from glyphs (0.45 s), holding (1.8 s) and fading (0.7 s), with an optional smaller line below, in its own color. On entering a room (not on respawn) it shows the room name and the biome name in the biome color; later pickups (e.g. a spell installed) use it too. A new banner replaces the one showing. |
| Top right | Game name and version; the debug readout (F3) shows below it. |
| Bottom left | Terminal: lime lines typed at 40 characters/s with a block cursor, kept 4 s, then faded; at most 4 lines. Printed on start, death (one line per cause), respawn and when a crate plugs a hole. |
| Bottom center | Fullscreen hint while the stage has fewer than 1080 physical pixels of height and the page is not fullscreen; shown for 8 s each time it becomes needed. F toggles fullscreen. |
| Bottom right | Movement mode tag (see below), always shown; G switches modes. |

Any module prints through `src/core/messages.js`: `say('msg.plug')` for a
terminal line, `announce('banner.room', { room }, { sub, subValues, color })`
for a banner. Both take string keys and values for `{placeholders}`.

Fonts are bundled (Fontsource, no CDN): Orbitron for labels, the banner and
the hint, Share Tech Mono for terminal lines (both Latin only). Timing values are `TERMINAL`
and `BANNER` in `src/ui/terminal.js`.

## Debug mode

F3 toggles debug mode; off by default. While it's on:

- Wireframe collision boxes: cyan for static block cells, lime for the
  wizard and every room object, red for enemies, updated at the interpolated render position
  (`src/debug/overlay.js`).
- The dev readout (top right, under the brand): room id, tick rate, frame
  rate, render buffer size, GPU resources (shaders, geometries, textures;
  steady counts show rooms free what they use), held actions, the wizard's position and whether
  he's grounded, and whether invincibility is on.
- `]` / `[` jump straight to the next/previous room in load order, skipping
  the exit transition (`Game.debugJumpRoom()`); ignored mid-transition.
- `I` toggles invincibility (`Game.invincible`): holes and void blocks
  never kill and `Game.hurt()` does nothing (so hazards don't hurt).
- `H` calls `Game.hurt(1)`, the same path as every damage source: the
  wizard blinks while invulnerable, and at 0 integrity he derezzes.

Rooms fully reset on a debug room jump, same as walking through an exit.

---

## Phase 1 (v0.1) plan

Each step is one branch and one PR; the game runs after every step.

| # | Branch | Delivers |
|---|---|---|
| 0 | `chore/repo-setup` | Vite, README, docs skeleton, PR template, `.gitignore`, CI (test + build), GitHub Pages deploy of `main`, placeholder title screen |
| 1 | `feat/loop-and-input` | Fixed-timestep loop and action mapping, with tests; on-screen readout of ticks and actions |
| 2 | `feat/iso-renderer` | Letterboxed resolution-independent renderer, iso camera, neon lines, bloom, fading floor grid, back walls, demo blocks |
| 3 | `feat/data-loading` | Schemas, Ajv plugin + semantic validation, `validate:data` in CI, room built from JSON, error screen, object styles, hole look |
| 4 | `feat/player` | Wireframe wizard, movement, jump, gravity, grid collision, interpolation, drop shadow, death in holes + respawn |
| 5 | `feat/pushables` | Pushing, sliding, falling, stacking, blocks filling holes |
| 6 | `feat/rooms-and-exits` | `world.json`, 3 connected test rooms, flip-screen transitions, room reset, respawn |
| 7 | `feat/hud` | `strings.json`, integrity HUD, room name banner, terminal messages, fullscreen hint |
| 8 | `feat/debug-mode` | Collision boxes, FPS, room jump, invincibility, test damage key |
| 9 | `chore/release-0.1.0` | Docs pass, CHANGELOG, `v0.1.0` tag and GitHub Release |

## Phase 2 (v0.2) plan

Hazards, combat and the room editor. Each step is one branch and one PR
against `main` (no stacked PRs); the game runs after every step, CI is
green before a PR is called ready. Rules that apply across steps are in
D43. **Next step: 6.**

Every step also:
- adds its new looks to the asset showcase (`tools/showcase.js`);
- adds or extends a small test room that shows the mechanic, connected to
  the world (`data/world.json`);
- adds unit tests for the logic (fixtures in `tests/helpers.js`);
- updates `docs/design.md`, `docs/architecture.md` and CHANGELOG, and
  records new decisions.

| # | Branch | Delivers |
|---|---|---|
| 1 | `feat/damage` | Damage from any source through `Game.hurt()`: invulnerability after a hit (~1 s) with the wizard blinking, `hurt` event, HUD hit flash. Integrity 0 kills: the wizard derezzes into pixels (placeholder effect is fine) and recompiles at the room's reset point, like a hole death. |
| 2 | `feat/hazard-void-blocks` | Hazard and void block types as grid cell types (D40): room data gets a block type, `CELL` codes, their own neon looks. Hazard: touching from any side or standing on it deals 1 damage (then invulnerability). Void: landing on top is instant death; touching a side is safe. |
| 3 | `feat/moving-blocks` | Shared path format (waypoints, speed, optional pause at ends, loop or ping-pong) in room data; moving platforms as a room object kind (D40) that the wizard and pushables ride; a platform that would push the wizard into something solid pushes him aside, or hurts him if there is no room (never instant death); a glowing guide line along the path. |
| 4 | `feat/collapsing-blocks` | Collapsing blocks as a room object kind: the wizard standing on one starts a short shake, then it vanishes; optional regrow after N seconds (room data). Pushables don't trigger them. |
| 5 | `feat/bugs` | Enemy types in `defs.json` (speed, health, behavior, color) and an `enemies` list in room data; AI as named behavior modules (`src/ai/`, first `patrol` on the shared path format); bugs don't block movement, touching one hurts; hologram bug model (D22) with a bouncy walk; reset with the room. |
| 6 | `feat/zap-and-mana` | Mana (energy) on the Player with slow recharge and a HUD bar; `cast` fires Zap the way the wizard faces (same directions as movement); the bolt stops at solids and pushables, one hit kills a bug (pops into pixels). Zap is available from the start (data disks come in Phase 3). |
| 7 | `feat/xray-outline` | Outline of the wizard drawn through blocks while he is hidden behind them. |
| 8 | `feat/room-editor` | In-game editor (dev server): pick a height layer, place and erase blocks (with type), objects, holes, exits, enemies and paths with the mouse in the real neon look; validate, then save straight to `data/rooms/*.json` through a dev-server endpoint; the deployed build exports JSON only. May be split into two PRs (blocks/objects/holes/exits, then enemies/paths). |
| 9 | `chore/release-0.2.0` | Docs pass, CHANGELOG, `v0.2.0` tag and GitHub Release (CLAUDE.md §10) |

Moved out of Phase 2: biome environmental effects (Glitch Zone drain,
Low-Res, Zero-G) and the health pickups and safe rooms that balance them
are specific content, planned for Phase 4 (content production). Biomes stay
look-only (name, color) until then.

## Data formats

The schemas in `schemas/` are the reference; this is an overview. Every file
has `"schemaVersion": 1` and a `"$schema"` link for editor support.

| File | Contents |
|---|---|
| `data/rooms/<id>.json` | One room (id = file name) |
| `data/defs.json` | Object types and their defaults (`crate`: pushable, lime, inset mark, dark faces; box variants `crate_plain`, `crate_cross`, `crate_dashed`; `platform`: moving platform, cyan; `collapsing`: collapsing block, magenta); `enemies`: enemy types (`bug`, see Enemies); `blocks`: look of the `hazard` and `void` block types and the hazard's `damage` |
| `data/biomes.json` | Biome name and room color (`home_lattice`: amber) |
| `data/world.json` | Start room and exit connections |
| `data/strings.json` | Every UI text by dotted key (`hud.integrity`, `msg.die`); `{name}` marks a value the game fills in; the schema lists the keys the game uses |

Example room (12×12):

```json
{
  "$schema": "../../schemas/room.schema.json",
  "schemaVersion": 1,
  "id": "cache_hall",
  "name": "Cache Hall",
  "biome": "home_lattice",
  "size": [12, 4, 12],
  "spawn": [2.5, 0, 5.5],
  "exits": [
    { "id": "west", "side": "-x", "at": 5 },
    { "id": "north", "side": "-z", "at": 3, "width": 3, "y": 1 }
  ],
  "blocks": [
    { "at": [0, 0, 0], "to": [2, 0, 3] },
    { "at": [3, 0, 0], "to": [5, 0, 0] }
  ],
  "holes": [{ "at": [8, 8], "to": [9, 8] }],
  "objects": [
    { "id": "crate_a", "type": "crate", "at": [6, 0, 6] },
    { "id": "crate_b", "type": "crate", "at": [7, 0, 6], "overrides": { "color": "#00f0ff" } }
  ]
}
```

- `spawn` — player feet center; where the game starts if this is the start room.
- `reset` — player feet center; where he reappears after dying in this room,
  however he entered it (D39). Optional, defaults to `spawn`. Above the
  floor is fine, he just falls from there like anywhere else.
- `exits` — `side` is `-x`, `+x`, `-z` or `+z`; `at` is the first cell along
  that side; `width` (default 2), `y` floor level (default 0), `height`
  (default 2).
- `blocks` — anonymous static geometry; `to` fills a box (inclusive);
  `type` is `block` (default, room color), `hazard` or `void`.
- `holes` — floor tiles `[x, z]` that are pits; `to` fills a rectangle.
- `objects` — typed things with stable ids; `overrides` replace type defaults.
  Platforms also take a `path`:
  `{ "points": [[6, 0, 1]], "mode": "pingpong", "speed": 2, "pause": 0.8 }`
  (see Moving platforms). Collapsing blocks may take `"regrow": 3`
  (seconds; see Collapsing blocks).
- `enemies` — `{ "id", "type", "at", "path", "overrides" }`: `at` is the
  spawn cell, `path` a patrol path (level legs), `overrides` any type field
  (see Enemies). Ids are shared with objects.
- Object type style (D17): `edges` `solid`/`dashed`, `mark`
  `none`/`inset`/`cross`/`brackets`, `faces` `dark`/`tinted` (defaults first),
  `tint` 0–1 (color share of a tinted top face, default 0.1).
  Objects may override them.
- `world.json` pairs exits: `"connections": [["boot_sector.north", "cache_hall.south"]]`.
  Paired exits are on opposite sides and equally wide; every exit is connected.
