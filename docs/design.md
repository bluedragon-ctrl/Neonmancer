# Design

Game design details that go beyond [CLAUDE.md](../CLAUDE.md), plus the plan
for the current phase. Locked decisions live in CLAUDE.md; their reasons in
[decisions.md](decisions.md).

## Controls (default)

| Action | Keys |
|---|---|
| Move | WASD / arrow keys; grid-aligned by default: Right ↗, Up ↖, Left ↙, Down ↘ |
| Jump | Space |
| Cast (the selected spell) | E / Numpad 0 |
| Switch spell | Tab (next) / Q (previous) |
| Pause | Esc / P |
| Map | M |
| Switch movement mode | G |
| Debug mode | F3 |
| Room editor | F2 (see Room editor) |
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
  until the Phase 5 juice pass), then recompiles at the room's reset point
  after about 1.1 s, like a hole death (cause `hole`, dropping into the pit).
  Each cause prints its own terminal line.
- Nothing hurts a dead wizard; debug invincibility blocks all damage.
- Tuning: `invulnerableTicks` and `deathTicks` in `PLAYER`; the look is
  `HIT_FX` in `src/render/hit-fx.js`, shown looping in the asset showcase
  (`/tools/showcase.html?asset=wizard-hit`).

## Block types

Every block in a room has a block type (`"type"` on a room's block entry,
default `block`), defined in `defs.json` `blocks` (D60). A type is a set of
properties the engine understands plus a look, and may `extend` a base
type (one level, like enemy templates), taking its values and replacing
the ones it gives:

| Type | Look | Properties |
|---|---|---|
| `block` | plain (room color) | none |
| `hazard` | hazard, red | `damage: 1` |
| `void` | void, violet | `lethal: true` |
| `collapsing` | kind `collapsing`, magenta, dashed edges, tinted faces | gives way (see Collapsing blocks) |
| `collapsing_regrow` | extends `collapsing` | `regrow: 3` |

- **Static types** have a `look` (`plain`, `hazard`, `void`) and live in
  the room grid: each cell holds its type's code, and the rules ask about
  properties, never names: a cell with `damage` hurts on touch, a
  `lethal` one kills whoever lands on it. A plain type may have its own
  `color`; without one it takes the room color.
- **Types with a `kind`** (`collapsing`) are written and painted like
  blocks, but each cell becomes a room object of that kind when the room
  is built (id `<type>@x,y,z`); `regrow`, `color` and the object look
  (`edges`, `mark`, `faces`, `tint`) are on the type.
- A new type that only combines existing properties and looks is data
  only (e.g. `"hazard_hot": { "extends": "hazard", "damage": 2 }`); a new
  property (bounce, slippery, conveyor...) or look is code.
- Validation: a base type has a look or a kind, not both; `damage` and
  `lethal` only on static types, `kind` values only on kinds; a kind needs
  a color; `block` must be static; room blocks name a known type.
- **Edges (D64):** neighbours of any plain types never get an edge between
  them: the corner rule (D12) runs over all plain blocks as one mass, and
  each edge takes the color of a type around it (the later one in
  `defs.json` where types meet). The hazard and void looks outline
  themselves, and a line they share with plain blocks is drawn once, by
  them alone (a lethal type also over a hurting one), so there is always a
  seam in the danger's color where it starts, with no plain edge showing
  around it. Collapsing blocks keep an outline around every
  cell, since each one gives way on its own.

## Hazard and void blocks

The `hazard` and `void` types (D40, D44): solid like plain blocks, drawn
in an animated look of their own (color from their block type, not the
room color), so they read as active. Their edges stay steady and are
drawn over plain blocks' edges where they meet. Motion is slow; nothing
strobes.

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
- **Hazard rules** (any type with `damage`): touching one hurts, standing on
  it or walking into any side of it (its `damage`, 1 for `hazard`). The body
  must overlap the block on two axes and lie against or in it (within 0.02),
  so brushing past a corner diagonally doesn't count. Leaning on or
  standing on one keeps hurting each time the 1 s invulnerability ends.
- **Void rules** (any type with `lethal`): landing on top is
  instant death (`die`, cause `void`), whatever the integrity; he derezzes
  on the spot like a damage death. Only the block under his feet center
  counts, like a hole, so an edge under one foot is safe; walking into its
  sides is safe; a crate or plain block on top of one covers it.
- Debug invincibility: hazards don't hurt, void blocks don't kill.
- Validation: `spawn` and `reset` can't be above a block with `damage` or
  `lethal` (he would land on it), and a raised exit's floor can't be a
  lethal block.
- Tuning: color, `damage` and `lethal` in `data/defs.json` `blocks`; the
  animated looks are `BLOCK_FX` in `src/render/block-fx.js`. Review them
  in the asset showcase (`/tools/showcase.html?asset=block-hazard,block-void,blocks-in-room`).

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

Block types with `kind: collapsing` (D47, D60): painted in rooms like any
block (a box of them is one entry), each cell runs as its own room object
(D40), a 1×1×1 block in the type's color (`collapsing` in `defs.json`:
magenta, thin dashed edges, tinted faces) that gives way under the wizard.

- **Trigger:** only the wizard standing on it (grounded, feet on its top,
  any part of his footprint over it). Walking into its side, jumping past
  it or a crate resting on it does nothing; a dead wizard doesn't trigger
  it either.
- **Shake, then gone:** it shakes for 0.5 s, harder towards the end, then
  breaks into pixels that tumble down and fade, and is gone: whatever
  stood on it falls (the wizard, crates). Once shaking it goes even if he
  steps off. Running across a row of them is safe; stopping is not.
- **Regrow** (optional, `regrow` seconds on the block type, e.g.
  `collapsing_regrow`: 3): that long
  after vanishing it grows back from its center, but only once nothing is
  in its cell (the wizard or a crate standing there makes it wait).
  Without `regrow` it stays gone until the room resets.
- **Over a hole:** a collapsing block may stand in a hole tile (a bridge
  that gives way); when it goes, the wizard drops into the pit and a crate
  plugs it.
- Validation: `regrow` only on block types with a kind; spawn and reset
  points don't count a collapsing block as holding the wizard up over a
  hole.
- Tuning: `COLLAPSING` in `src/entities/collapsing.js`, the look is
  `COLLAPSE_FX` in `src/render/collapse-fx.js`; review in the asset
  showcase (`/tools/showcase.html?asset=collapsing,collapsing-cycle`).

## Enemies

Corrupted programs (D48), listed in a room's `enemies`. Everything about one
comes from data: its type in `defs.json` `enemies`, and the room's
`overrides` for that one enemy.

| Field | Values | Meaning |
|---|---|---|
| `movement` | `patrol`, `stationary` | patrol walks the enemy's `path` (required); stationary stays in its cell (no path). Chasing comes with Viruses (Phase 3); a turret is a stationary enemy with a projectile attack (Pop-ups). |
| `attack` | `contact`, `none` | contact: touching it hurts while it is hostile. Projectiles come with Pop-ups. |
| `hostility` | `hostile`, `peaceful`, `provoked` | hostile attacks; peaceful never does; provoked is peaceful until a spell (Zap) hits it, then hostile. |
| `aggroRange` | units (default 0) | how far a hostile enemy notices the wizard; used by chasing and shooting later, no effect on patrol and contact. |
| `integrity` | 1–15 | how much spell damage it takes before it pops (bug: 2, so two Zaps). |
| `damage` | ≥ 1 | integrity the wizard loses per attack. |
| `speed` | units/s | walking speed; a path's own `speed` overrides it. |
| `bounce` | true / false (default false; bug: true) | trampoline top (below). |
| `solid` | true / false (default false) | blocks the wizard, carries him and shoves him (below). |
| `color` | #rrggbb | body color; the eyes always show hostility, so a room can recolor one enemy with `overrides` without a new type or model. |

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
- **The wizard** walks through enemies unless they are **solid**. A solid
  enemy blocks him like a crate; he can stand on it (if it doesn't bounce)
  and it carries him as it walks, walls scraping him off; walking into him
  it shoves him along (at most 0.35 per tick), and if he is pinned it
  turns back instead. A crate resting on a solid enemy holds it in place.
- Touching a hostile enemy with a contact attack hurts him (`Game.hurt()`,
  then the usual invulnerability): overlapping it, or for a solid one
  leaning on it or standing on it (the hazard rule, D44).
  Landing on top of a **bouncy** one (every bug by default: a round ball
  reads as bouncy) bounces him up 2.2 above its top (clears 2 blocks)
  without hurting him; its sides still hurt if it is hostile. Enemies with
  `bounce` false can be stood on only if they are solid.
- **Look (bug):** a mint-green hologram ball with two slanted eyes whose
  color shows its mood: red hostile, amber calm until provoked, cyan
  peaceful. It squashes when bounced on, hops as it walks, bobs while
  standing, turns towards where it walks and pops into pixels. No drop
  shadow (D50).
- **Spell hits:** a Zap takes `damage` (1) of its integrity and provokes
  it; the last point pops it into pixels. Any enemy can be hit, peaceful
  ones too (they stay peaceful). A hit flashes it white, then cyan, with a
  recoil squash; while damaged it glitches every ~0.8 s (a small sideways
  jump and a faint flash).
- Validation: known type, valid overrides, a free cell of its own not over
  a hole, ids unique among objects and enemies, a patrol has a level path
  clear of static blocks, a stationary enemy has none.
- Tuning: `ENEMY` in `src/entities/enemy.js`, `PLAYER.bounceHeight`, the
  look is `BUG` in `src/render/bug.js`; review in the asset showcase
  (`/tools/showcase.html?asset=bugs`).

## Zap and energy

- **Energy** (mana): the wizard holds 10 and gets 1 back per second;
  it carries over between rooms and is full again after a respawn. The
  HUD shows it under integrity as one lime segment per Zap (5), each
  filling as it recharges; a full segment glows.
- **Casting:** E or Numpad 0 casts the selected spell. Its name
  shows in a lime tag under the energy bar (ZAP); Tab switches to the next
  spell he knows (Q back), and the tag flashes. With only Zap known, Tab
  does nothing and the tag shows no key hint (D54).
- **Zap** (E or Numpad 0): costs 2 energy, then 0.25 s before the next
  cast. The bolt flies at 12 units per second from his hands (0.48 above
  his feet, 0.34 in front) the way he aims: the direction he last walked
  or turned to, so diagonals too. It is a 0.3 box, low enough to hit a bug
  on the same level; standing a block higher he zaps over it.
- It stops at the first thing in its way: a live enemy (which takes the
  hit), a block of any type, a room object (crate, platform, standing
  collapsing block; a destructible crate takes the hit) or the room's
  side, exits included. Cast into a wall right in front of him, it stops
  at once.
- Without enough energy the cast fails: the energy bar flashes magenta
  and jolts.
- **Look:** a flare at his hands; a white-hot core in a cyan halo
  dragging a crackling zigzag trail; cyan and white sparks flying back out
  of whatever it hits.
- Tuning: `defs.json` `spells.zap` (cost, cooldown, speed, damage),
  `maxEnergy` and `energyRecharge` in `PLAYER`, `BOLT` in
  `src/entities/bolt.js`; the look is `ZAP_FX` in `src/render/zap-fx.js`;
  review in the asset showcase (`/tools/showcase.html?asset=zap`).

## X-ray outline

The parts of the wizard hidden behind blocks, crates, platforms or enemies
show through them as a ghost: nearly empty inside, a bright rim in his own
colors (magenta body and hat, cyan head and hands) and faint bands drifting
down through it. Only the hidden parts show it; the rest of him is drawn as
usual, so half behind a wall he is half ghost (D55).

- Each hologram part gets a ghost copy drawn with the depth test reversed,
  after the world and before the wizard, so his own parts never hide each
  other's ghost. Additive and without depth, so edges stay readable
  through it.
- It blinks with him while invulnerable and shows his hit flash; it is
  hidden while he is dead (no ghost of a hole fall or a derez).
- The wizard only for now (D43); enemies have none.
- Tuning: `XRAY` in `src/render/xray.js`; review it in the asset showcase
  (`/tools/showcase.html?asset=xray`), or behind the 2-high wall near
  Boot Sector's front.

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
  Falling objects' drop shadow (in their own color) is switched off for
  now: only the wizard has one (D50, `DROP_SHADOWS`).
- An object falling onto the wizard rests on his head and falls on when he
  steps away.
- Tuning values: `PUSHABLE` in `src/entities/pushable.js`, `pushDelay` in
  `PLAYER`.

## Destructible crates

- A pushable type with `integrity` (1–15) is destructible: each Zap takes
  1, and at 0 it breaks into pixels (like a collapsing block) and is gone
  until the room resets; whatever stood on it falls. `crate_cross` has
  integrity 1: one Zap. A hit that doesn't break it jolts it.
- It always shows it, standing still: the plain `crate` carries a whole
  4×4 grid of small pale squares (its data bits, the `bits` mark; both
  crates have the same tinted faces)
  on every face; a destructible object shows the same grid with 6 of the
  16 bits missing, different on every face (in place of whatever its
  `mark` is), so it reads as a data block with holes. No animation; only a
  hit jolts it. Plain crates shrug a Zap off (sparks only).
- Room design: a destructible crate is cover that can be shot away, or a
  wall of crates to blast through; don't make one the only way up, since
  the wizard can break it by accident (the room comes back on re-entry,
  but it is annoying).
- Tuning: `integrity` on the type (overridable per object); the bits are
  `BITS` in `src/render/marks.js`, the jolt `BREAK_FX` in
  `src/render/break-fx.js`; review in the asset showcase
  (`?asset=crate,crate_cross,zap-break`).

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

Test rooms stay in the world until content production (Phase 5) builds the
real rooms and puzzles (D45). They are a test lab: each shows one mechanic
in isolation, and later spells and enemy behaviors get tested in them too.
New mechanics add or extend one (D43). Boot Sector, the start, is the
hub: every test room is at most two rooms away from it, so no test means
walking the whole world (new exits are added for that where needed, D49).

| Room | Size | Exits | Shows |
|---|---|---|---|
| `boot_sector` (start, hub) | 12×12 | north doorway → Cache Hall; raised east exit on a ledge → Stack Yard; west doorway → Crawl Space; south (front) → Transit Bus | blocks, holes, two crates, a 2-high wall near the front to walk behind (X-ray outline) |
| `cache_hall` | 16×8 | south (front) → Boot Sector | a 3-wide pit across the room: push a crate in, then jump the rest |
| `stack_yard` | 8×8, Glitchmire color | raised west doorway → Boot Sector; east (front) → Fault Line | stacked crates, a 2-high block to climb via a crate |
| `fault_line` (Phase 2) | 12×12 | west doorway → Stack Yard; raised east exit on the lookout → Transit Bus | a corridor between hazard walls, hazard blocks between two plain ones to walk across, a zigzag path of plain blocks through a field of void blocks up to a lookout |
| `transit_bus` (Phase 2) | 12×12, 5 high | west doorway → Fault Line; north doorway → Boot Sector; raised east exit on the high ledge → Volatile Memory | a ferry across a pit between two ledges, a lift up to a high ledge, a loop carrying a crate, a press coming down (with a crate to jam it) and a pusher squeezing the wizard against the room's edge |
| `volatile_memory` (Phase 2) | 12×12, 5 high | west doorway → Transit Bus; raised east exit on the high ledge → Crawl Space | a pit across the room with two collapsing bridges: one regrowing after 3 s (the way back), one that stays gone, with a crate on a plain ledge in front of it to push onto the bridge from solid ground (it doesn't trigger the blocks, so it is a safe spot to hop onto); two one-shot collapsing steps up to a high ledge |
| `crawl_space` (Phase 2) | 12×12 | west doorway → Volatile Memory; east (front) → Boot Sector | bugs: a sentry crossing the entrance lane, one walking off a ledge and patrolling the floor below, a solid one shoving along a lane with a crate to push in its way, a provoked one circling a pillar, a peaceful stationary one to bounce up to a 2-high ledge, a solid peaceful one along the front edge to ride; Zap targets: the provoked one turns hostile when hit, and an amber stationary one with 4 integrity |

### Room design checklist

What to check when building or reviewing a room, beyond what validation
catches (validation: bounds, overlaps, exits, spawn and reset points). It
collects problems found in playtests; the room design skill and the level
review subagent planned for Phase 4 (CLAUDE.md §9) start from it, and the
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

## Biomes

Six Grid sectors (D61): one core, four side sectors and one special sector
for secrets and rooms reached by backtracking. A biome sets the room color
(block edges, walls, floor grid), the name in the room banner and the
room's surroundings (`look`, D62); floor patterns, particles and the
signature effects in the table are planned, and gameplay effects wait for
Phase 5.

| Biome | Color | Floor | Particles | Signature |
|---|---|---|---|---|
| Home Lattice (core) | amber `#ffb020` | clean square grid | warm motes rising slowly | calm, steady glow |
| Glitchmire | hot pink `#ff5fa8` | torn tiles, slightly offset | pixel bubbles popping up | edges jitter for a frame now and then |
| Frostbyte Wastes | ice blue `#9fd0ff` | hex crystal pattern | 0/1 flakes falling | soft, frosty bloom |
| Abyssal Buffer | graphite `#7a8190` | wavy caustics | glitter drifting slowly | gentle sway |
| Firewall Citadel | ember orange `#ff6a1f` | brick pattern | sparks rising | warm edge flicker |
| Phantom Partition (special) | silver-white `#e8eaff` | sparse dots | still stars, twinkling | edges shimmer slowly through the hues |

Room colors keep clear of the gameplay colors (lime crates, cyan
platforms, magenta collapsing blocks, red hazards, violet void, green bugs),
so those always stand out from the room. The two grays are far apart:
graphite Abyssal Buffer is dark and moody, Phantom Partition bright
silver-white on black.

Surroundings (`look` in `biomes.json`, D62; every field optional, Home
Lattice's values are the defaults):

| Field | What | Default |
|---|---|---|
| `background` | the void behind everything, kept near black | `#05060d` |
| `outerGrid` | floor grid outside the room, kept dim so it never reads as room | `#2a2d35` |
| `outerFade` | blocks over which that grid fades out | 5 |
| `wallGrid` | brightness of the faint wall grid (share of the room color) | 0.3 |
| `bloom` | glow strength | 1.4 |

| Biome | Background, outer grid | Fade | Wall grid | Bloom |
|---|---|---|---|---|
| Home Lattice | defaults: near black, neutral gray | 5 | 0.3 | 1.4 |
| Glitchmire | dark plum, dim mauve | 4 | 0.4 | 1.5 |
| Frostbyte Wastes | cold blue-black, icy blue: a wide frozen field | 6 | 0.25 | 1.3 |
| Abyssal Buffer | dark gray, dim gray: the longest, a deep plain around the room | 9 | 0.4 | 1.7 |
| Firewall Citadel | dark ember, dim rust | 5 | 0.45 | 1.7 |
| Phantom Partition | black, faint gray: the room floats in nothing | 1.5 | 0.15 | 1.2 |

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

## Room editor

F2 opens the editor on the current room (not during a room transition);
the game stands still meanwhile, and the HUD makes way for the editor's
panel on the left (D56). The room is rebuilt in the real look after every
change. F2 again plays the edited room from its spawn point, unsaved edits
included (walking through exits into other edited rooms too), if the data
has no validation errors; otherwise the panel says so and the editor stays
open. Edits are kept per room until the page is closed. The panel's room
list switches to another room; New room makes an empty one (D57).

| Input | What it does |
|---|---|
| Left click / drag | Place or pick with the current tool (a drag paints blocks, holes and objects; one undo step) |
| Right click / drag | Erase with the current tool |
| Mouse wheel, PgUp / PgDn | Height layer up / down (a grid shows it; with **hide above**, on by default, blocks, objects and enemies above it aren't drawn) |
| 1–8 | Tool: Block, Hole, Object, Enemy, Path, Exit, Spawn, Reset |
| Esc | Drop the picked enemy, platform or exit |
| Delete, Backspace | Remove the picked object, enemy or exit |
| Ctrl+Z, Ctrl+Y (Ctrl+Shift+Z) | Undo, redo |
| Ctrl+S | Save (dev server) / export (build), from a panel field too |

- **Block** puts a block of the type picked in the panel's type list (every
  block type in `defs.json`, with what it does: `hazard (hurts 1)`,
  `collapsing_regrow (collapsing, regrows 3 s)`) in the cell of the current
  layer, replacing whatever is there; erasing empties the cell (D60).
- **Hole** works on floor tiles, whatever the layer: place makes a hole,
  erase fills it in.
- **Object** places the type picked in the panel (its fields show only
  while this tool is picked), with the id `<type>_<n>`. Placing on an
  object of the same type leaves it as it is (a platform keeps its path). A new platform is picked, ready for its path.
  Erasing removes an object or enemy standing in the cell.
- **Enemy** places an enemy of the panel's type with its settings
  (movement, hostility, bounce, solid: blank is the type's own; other
  overrides written by hand stay), id `<type>_<n>`, and picks it. A click
  on an enemy picks it: the fields then show and change it, and new
  enemies get the same. A patrolling enemy needs a path (the panel says
  so); making one stationary drops its path. Integrity, damage, speed and
  color are typed in (blank: the type's). Changing the type of an enemy
  with an id the editor made renames it (`bug_1` becomes `virus_1`); ids
  written by hand stay.
- **Enemy templates** (D58): Template + Save turns the current enemy
  settings into a new enemy type in `defs.json` (`"extends"` its base
  type, only the changed values), picked from the Type list from then on
  (shown as `bug_tank (bug template)`); the picked enemy becomes one of
  it. With an enemy of a template that has settings of its own, **Update
  template** moves them into the template, changing every enemy of it.
  **Rename** gives the template the name typed in Template (only a
  template no other room uses; the room's enemies follow), **Delete**
  removes one no enemy uses. Template changes are undo steps of the room
  they were made in (D59). Saved with Save, like the rooms.
- **Path** works on a picked platform or enemy (click it). Each click on a
  cell adds a point, with corners added so every leg runs along one axis
  (x, then z, then y); an enemy's points stay at its own height, a
  platform's may change layer (a lift); a stationary enemy takes no
  points (set its Movement to patrol first). Right click takes the last
  point off. The panel sets the mode (there and back, or loop), speed and pause
  at the ends, or clears the path. Every path shows as a dashed line; the
  picked one is white, with its points marked.
- **Exit** opens an exit in the edge cell clicked (in a corner, in the
  wall nearer the mouse), at the layer's height, with the panel's width
  and height, id after the side (`north`, `east_2`...). A click on an exit
  picks it: id, position along its side, floor level (y), width, height
  and **Leads to** (the exits of other rooms in the opposite side,
  equally wide and not connected yet); a change that would overlap
  another exit is refused. A new width goes to the exit it leads to as
  well (an undo step of that room), moving either back to stay within its
  side. Right click removes an exit and its connection. An exit must be connected before
  the room plays or saves.
- **Spawn, Reset** put the start or respawn point in the middle of the
  cell, standing on the layer; erasing with Reset removes the reset point
  (it falls back to spawn). Both show as dashed boxes of the wizard's size
  (spawn cyan, reset magenta).
- The panel, from the top, picks the room (or makes a new one: an id,
  then New; it starts empty, 12x4x12, in the current biome), sets the
  room's name, biome and size (applied on Enter or leaving the field; 2–6
  high, width + depth at most 32; a smaller room drops what ends up
  outside, listed in the status line, and moves spawn and reset inside)
  and the layer, and has Undo, Redo, Save or Export, and Revert (back to
  the last save; undo and Revert take the room's connections along). A new
  room never saved has **Discard new room**, which drops it and its
  connections and goes back to the room edited before. Under the layer, a
  line says what is in the cell under the mouse (`3, 1, 4: crate_1
  (crate)`, an exit there too). Errors of all the edited data are listed
  live by file, the way the game would report them at load time; a click
  on one goes to its room, picks the thing it is about with its tool and
  moves to its layer.
- **Save** (dev server): writes every edited room, `world.json` and
  `defs.json` (templates) together, after the server checks them with the rest of `data/`; nothing
  is written unless everything passes, and the page doesn't reload.
  **Export** (deployed build) downloads each changed file. Untouched block
  and hole entries keep their place and shape; edited cells are merged
  into boxes.
- **Sending the rooms in:** `tools\room-pr.bat ["what changed"]` (Windows)
  puts only `data/rooms/`, `data/world.json` and `data/defs.json` (enemy
  templates) on a new branch
  `feat/rooms-<date>` from `origin/main` (after `npm run validate:data`),
  commits, pushes and opens the PR with the GitHub CLI, or prints a
  compare link without it. Other uncommitted changes stay uncommitted; you
  stay on the new branch.

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
D43. **Done:** every step is merged and Phase 2 is released as v0.2.0.

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
| 6 | `feat/zap-and-mana` | Mana (energy) on the Player with slow recharge and a HUD bar; `cast` fires Zap the way the wizard faces (same directions as movement); the bolt stops at solids and pushables, a bug takes two hits (the second pops it into pixels). Zap is available from the start (data disks come in Phase 3). |
| 7 | `feat/xray-outline` | Outline of the wizard drawn through blocks while he is hidden behind them. |
| 8a | `feat/room-editor` | In-game editor on F2 (D56): pick a height layer, place and erase blocks (with type), holes, objects (not platforms), spawn and reset with the mouse in the real neon look; room name, biome and size; undo/redo; validate, then save straight to `data/rooms/*.json` through a dev-server endpoint; the deployed build exports JSON only. |
| 8b | `feat/room-editor-paths` | Editor, moving part (D57): enemies with their settings, platform and patrol paths, exits with their `world.json` connections, new rooms and a room list; Save writes the edited rooms and `world.json` together. |
| 9 | `chore/release-0.2.0` | Docs pass, CHANGELOG, `v0.2.0` tag and GitHub Release (CLAUDE.md §10) |

Moved out of Phase 2: biome environmental effects (Glitchmire drain,
Frostbyte low-res, Abyssal low gravity) and the health pickups and safe
rooms that balance them are specific content, planned for content
production (Phase 5 since D65). Biomes stay look-only (name, color, surroundings) until then.

## Phase 3 (v0.3) plan

Spells and pickups (D65). Each step is one branch and one PR against
`main` (no stacked PRs); the game runs after every step, CI is green before
a PR is called ready. Every step also does what the Phase 2 steps did:
showcase entries for new looks, a test room (or an extended one) connected
to the world, unit tests, the editor palette for any new type, docs,
CHANGELOG and decisions.

A step starts by settling its open questions (listed below the table) with
the author; the answers are recorded as decisions before the code lands.

| # | Branch | Delivers |
|---|---|---|
| 1 | `feat/world-map-tool` | A developer overview of the whole world on its own page, `tools/world-map.html`, served by the dev server only (D66). Every room is a node in its biome color on a simple map grid, one room per cell, at its position in `world.json`; lines show the connections between exits, and the start room is marked. Rooms are dragged to another free cell and saved through the dev server; connections are read-only here (they are edited in the room editor). A new room from the room editor gets the nearest free cell next to the room it was created from, to be moved afterwards. Validation: every room has a position, no two share one. The tool flags what room validation can't see: rooms not reachable from the start through exits, and test rooms more than two rooms from Boot Sector (D49). Clicking a room opens it in the room editor. |
| 2 | `feat/pickups-and-progress` | A generic pickup object (kind, look, stable id) in `defs.json` and room data, and a `Progress` model (collected ids, known spells) that survives room resets and death: collected pickups stay gone. Pickup burst and banner; editor and validation support. |
| 3 | `feat/data-disks` | Data-disk pickups that unlock a spell: install animation, `> SPELL INSTALLED: …` banner, spell switching (Tab / Q) with more than one spell. |
| 4 | `feat/viruses` | A `chase` movement behavior: a hostile Virus follows the wizard while it sees him within `aggroRange` and gives up when line of sight breaks. |
| 5 | `feat/popups` | A projectile attack: Pop-ups are stationary enemies firing slow shots; a projectile entity with its own rules for what stops it. |
| 6 | `feat/firewall-spell` | Firewall: a brief shield that blocks projectiles. |
| 7 | `feat/pause-spell` | Pause: freezes an enemy for a while; a frozen enemy is a solid platform (reusing the solid-enemy rules, D51). |
| 8 | `feat/warp-spell` | Warp: a short teleport through gaps or past hazards, with an afterimage. |
| 9 | `feat/cut-paste-spell` | Cut & Paste: cut one object into a one-slot inventory, paste it at a valid grid cell in front of the wizard. |
| 10 | `docs/spell-roster` | Discussion step, docs only: further spells, or upgrades of the five, now that they can be played. Accepted ones get their own steps (in this phase or later) and CLAUDE.md §5 is updated; the result is a decision. |
| 11 | `feat/score-and-bits` | Starts with a discussion of the world targets (below). Then: bonus bits (up to 4 slots per room), secrets, score for bits, enemies, secrets and pickups, floating score popups, HUD score, the "all bits collected" room bonus, local high score. |
| 12 | `feat/fragments-and-core` | Fragment pickups, the fragment count and locations in `world.json`, the central core that takes them, `> FRAGMENT n/N GET!`, and the end of the game. |
| 13 | `chore/release-0.3.0` | Docs pass, CHANGELOG, `v0.3.0` tag and GitHub Release (CLAUDE.md §10) |

Open questions, settled at the start of their step:
- **3 Data disks:** does Zap stay known from the start, or become the first
  disk (in or near Boot Sector)?
- **4 Viruses:** what blocks line of sight (blocks, crates, height
  differences); what a Virus does after giving up (stops, returns to its
  post or path); chase speed.
- **5 Pop-ups:** aimed at the wizard or in a fixed direction; fire rate,
  shot speed and range; what stops a shot (blocks, crates, Zap).
- **6 Firewall:** duration and cost; does it also stop contact damage?
- **7 Pause:** duration and cost; how it picks its target (a bolt, or the
  nearest enemy in front); does it work on Wardens (Phase 4)?
- **8 Warp:** distance and direction; through a one-block wall, or only
  across gaps and hazards; where it lands when the target cell is taken.
- **9 Cut & Paste:** what can be cut (objects only, enemies, a crate with
  something on it); does the cut object leave the room with the wizard or
  go back on reset?
- **11 Score and bits — world targets:** target number of rooms (40–60 in
  CLAUDE.md), spells (and upgrades, from step 9) and items; what an item
  is (the key layout reserves 8 bits); bits per room; score values; what
  counts as a secret. These numbers also fix the access-key bit layout
  (Phase 4).
- **12 Fragments:** fragment count in the test world; a placeholder win
  screen or a real ending (final score, credits).
- **Test world:** each step adds a test room (D45), so the world grows to
  about 15 rooms; a second hub may be needed to keep every test room at
  most two rooms from Boot Sector (D49).

## Phase 4 (v0.4) outline

Guardians, saves and tooling (D65); planned in detail when Phase 3 is
released. Firewall Wardens; title screen and pause menu (the save UI needs
both); access-key codec with tests; URL saves and localStorage autosave;
map screen; reachability checker; design skills and subagents. Open so
far: what writes a save (save shrines, room entry, or both), and how deep
the reachability checker searches pushables and spells.

## Data formats

The schemas in `schemas/` are the reference; this is an overview. Every file
has `"schemaVersion": 1` and a `"$schema"` link for editor support.

| File | Contents |
|---|---|
| `data/rooms/<id>.json` | One room (id = file name) |
| `data/defs.json` | Object types and their defaults (`crate`: pushable, lime, data bits mark, dark faces; box variants `crate_plain`, `crate_cross` (destructible: data bits with holes, 1 Zap), `crate_dashed`; `platform`: moving platform, cyan); `enemies`: enemy types (`bug`, see Enemies) and templates that `extend` one (D58); `spells`: spell tuning (`zap`, see Zap and energy); `blocks`: block types (D60): look or kind, color, properties (`damage`, `lethal`, `regrow`), `extends` for variants; see Block types |
| `data/biomes.json` | Biome name and room color: `home_lattice` (core, amber), `glitchmire` (pink), `frostbyte_wastes` (ice blue), `abyssal_buffer` (graphite), `firewall_citadel` (ember orange), `phantom_partition` (special, silver-white); optional `look` for the surroundings (background, outer grid and its fade, wall grid, bloom); see Biomes (D61, D62) |
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
  `type` is a block type from `defs.json` `blocks` (default `block`, room
  color), e.g. `hazard`, `void`, `collapsing` (see Block types).
- `holes` — floor tiles `[x, z]` that are pits; `to` fills a rectangle.
- `objects` — typed things with stable ids; `overrides` replace type defaults.
  Platforms also take a `path`:
  `{ "points": [[6, 0, 1]], "mode": "pingpong", "speed": 2, "pause": 0.8 }`
  (see Moving platforms).
- `enemies` — `{ "id", "type", "at", "path", "overrides" }`: `at` is the
  spawn cell, `path` a patrol path (level legs), `overrides` any type field
  (see Enemies). Ids are shared with objects.
- Object type style (D17): `edges` `solid`/`dashed`, `mark`
  `none`/`inset`/`cross`/`brackets`, `faces` `dark`/`tinted` (defaults first),
  `tint` 0–1 (color share of a tinted top face, default 0.1).
  Objects may override them.
- `world.json` pairs exits: `"connections": [["boot_sector.north", "cache_hall.south"]]`.
  Paired exits are on opposite sides and equally wide; every exit is connected.
