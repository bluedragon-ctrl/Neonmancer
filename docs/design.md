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
| Pause menu (and back, in a menu) | Esc / P |
| Map (and back) | M |
| Switch movement mode | G |
| Debug mode | F3 |
| Room editor | F2 (see Room editor) |
| Fullscreen | F |
| Close the end-of-game screen | Enter |
| Menus: choose, select | ↑ ↓ (or W S), Enter / Space; the mouse |

Debug mode only, once toggled on with F3:

| Action | Keys |
|---|---|
| Jump to the next/previous room | ] / [ |
| Toggle invincibility | I |
| Test damage (−1 integrity) | H |
| Find the next 8 fragments | K |

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

He moves like he's alive (D114, `src/render/wizard-motion.js`, tuning in
`MOTION`), all visual only (the hitbox never changes):
- **Walking:** the head (with the hat) dips at each step and the body
  squashes a little, the hands swing forward and back in turn, and he
  leans forward. The steps follow the distance he walks (one cycle of two
  steps per 1.1 units), so they match his speed and stop cleanly; riding
  a platform without walking takes no steps.
- **Standing:** slow breathing, the hands drifting up and down out of
  step, and a blink once every ~3.4 s at an irregular moment.
- **In the air:** hands up and out, the body stretched while he moves
  fast (none at the top of a jump). **Landing** squashes him flat and he
  springs back through a small stretch (0.22 s).
- **Hat:** an underdamped spring on its tilt trails his motion in his own
  frame (walking forward tips it back, sideways tips it the other way)
  and wobbles when he stops or turns; landing kicks it back.

- **Actions** take over the hands (a push, over it a cast, over all a
  flail): **pushing** (walking into a crate lined up to push) puts both
  hands flat on its face and leans him in, with slow straining steps on
  the spot until it gives; **casting** any spell thrusts both hands out
  to where the bolt starts, the way the spell goes (his aim, even before
  his body has turned), holds them there a moment and brings them back
  (18 ticks); **falling into a hole** he flails, hands high and waving,
  rocking side to side, his hat lifting off his head.

Walk, idle, air and push blend in and out over ~0.1 s, the flail faster. A move of more than 0.5
units in one frame (respawn, Warp, Blink) counts as a cut, not motion.
Showcase: `wizard` (idle), `wizard-walk`, `wizard-jump`, `wizard-push`,
`wizard-cast`, `wizard-hole`.

### Damage

Integrity (health) is 8, 12 with every buff (not saved: a load starts
full, D106); it carries over between rooms and is full again after a respawn
(D35). Every damage source calls `Game.hurt(amount)` (D43): enemies,
hazard blocks, spiked and squeezing platforms, Blink into a wall, the
debug `H` key.

- A hit takes integrity and reports a `hurt` event (`amount` actually
  lost). The wizard's hologram flashes: white-hot for 3 ticks, then
  magenta fading out by 8 ticks. The effect stays on him; nothing covers the
  screen. Then he stays invulnerable until 60 ticks (1 s) after the hit
  and blinks (4 ticks shown, 4 hidden); hits during that time do nothing.
  No knockback. Invulnerability carries through exits and ends on respawn.
- Losing the last point kills him (`die` event, cause `damage`): he
  derezzes on the spot, flickering and squeezing into a thin beam while
  his cyan and magenta pixels drift up out of him (the derez, below;
  placeholder until the Phase 5 juice pass), then recompiles at the room's reset point
  after about 1.1 s, like a hole death (cause `hole`, dropping into the pit)
  or a void death. Each cause prints its own terminal line, and each death
  uses a backup (below).
- Nothing hurts a dead wizard; debug invincibility blocks all damage.
- Tuning: `invulnerableTicks` and `deathTicks` in `PLAYER`; the look is
  `HIT_FX` in `src/render/hit-fx.js`, shown looping in the asset showcase
  (`/tools/showcase.html?asset=wizard-hit`).

### Derez

One look for anything that is gone (D126): the wizard dying, an enemy
popping, a collapsing block, a destructible or compiled crate breaking,
a pickup taken. Its pixels start spread through its body, a few ticks
apart (10), drift out from its middle and up (up to 0.7 and 1 units) and
shrink to nothing in 48 ticks (0.8 s). Only two things differ: the
body, a box standing on its feet (the wizard 0.6 × 1.8 × 0.6, a block or
crate its cell, each enemy look its own, square as it turns, a pickup a
small box round its middle), which also sets how many pixels (48 for a
cell, fewer for smaller bodies, 24–64); and the colors, its own, white as
the second where it has only one. The boot's arrival plays the wizard's
backwards. Tuning: `DEREZ` in `src/render/derez-fx.js`; showcase
`?asset=derez` (the wizard, a crate, a bug, a sentinel and a disk side by
side).

### Stream

One look for pixels a spell carries from one place to another (D127):
Cut (the object into his hands), Paste and Compile (his hands into the
cell), Warp (his body where he was into his body where he is). Each end
is a body (a box, as a derez's) or a point (his hands). Each pixel leaves
its own spot of the start, the last 40% of the stream's time after the
first, and flies on a slight arc (up to 0.35) to the same spot of the
end. At a body the pixels are full size and wait there before leaving or
after arriving; at a point they are small (0.3) and gone. As many pixels
as the bigger body's derez (24 between two points), the derez's pixel
size. Each spell keeps its own timing (Cut and Paste 22 ticks, Compile
18, Warp 24) and colors. Pull's tractor beam of rings stays its own, and
so do the install spiral, Zap's sparks and the Blink kick. Tuning:
`STREAM` in `src/render/stream-fx.js`; showcase `?asset=stream` (Cut,
Paste and Warp side by side).

### Backups

Lives (D97): the wizard has 8 (`PLAYER.backups`), shown as magenta pips
under the integrity bar, blinking when none are left.

- A death uses one (`> RECOMPILING WIZARD... OK. BACKUPS LEFT: 7`).
  Dying with none left crashes the system (`SYSTEM CRASH` banner): he
  reboots standing on the backup shrine nearest on the world map
  (|dx| + |dz| map cells, his own room first; a tie goes to the shrine
  used last, then room order; the start with no shrine). Nothing found is
  lost; the room resets and the clipboard is gone, as with any death.
- **Shrine:** a floor tile (`"shrine": [x, z]`, one per room at most),
  flush and not solid. Stepping onto it (not jumping over) fills
  integrity, energy and backups (`> BACKUP SAVED`) and flares it;
  stepping off and on uses it again, and rebooting on one uses it.
- **Look:** in the wizard's magenta: a square outline with a diamond
  rune, a pulsing glow, light rising from its corners, motes and a faint
  ring floating up. `SHRINE_FX` in `src/render/shrine-view.js`; showcase
  `?asset=shrine`. Room editor: the Shrine tool (9).

## Block types

Every block in a room has a block type (`"type"` on a room's block entry,
default `block`), defined in `defs.json` `blocks` (D60). A type is a set of
properties the engine understands plus a look, and may `extend` a base
type (one level, like enemy templates), taking its values and replacing
the ones it gives:

| Type | Look | Properties |
|---|---|---|
| `block` | plain (room color) | none |
| `hazard` | hazard, danger red | `damage: 1` |
| `void` | void, black mist with gray wisps (D99) | `lethal: true` |
| `fake` | plain (room color) | `fake: true`: a scan derezzes it (D128, see Scan) |
| `fence` | fence (room color): data streams, no faces (D167) | `seeThrough: true`: bolts and sight pass (see Fences) |
| `collapsing` | kind `gate`, `trigger: step`; room color, dashed edges, faces barely tinted (D98, D99) | gives way (see Gate blocks) |
| `collapsing_regrow` | extends `collapsing` | `regrow: 3` |
| `gate` | kind `gate` (switch trigger), white, bars on its seen sides (D140) | solid until its switches are on (see Gate blocks) |
| `bridge` | extends `gate` | `start: gone`: there only while its switches are on (D144) |

- **Static types** have a `look` (`plain`, `hazard`, `void`, `fence`) and live in
  the room grid: each cell holds its type's code, and the rules ask about
  properties, never names: a cell with `damage` hurts on touch, a
  `lethal` one kills whoever lands on it. A plain type may have its own
  `color`; without one it takes the room color.
- **Types with a `kind`** (`gate`, D141) are written and painted like
  blocks, but each cell becomes a room object of that kind when the room
  is built (id `<type>@x,y,z`, with its entry's `switches`); `trigger`,
  `start`, `regrow`, `color` and the object look (`edges`, `mark`,
  `faces`, `tint`) are on the type.
- A new type that only combines existing properties and looks is data
  only (e.g. `"hazard_hot": { "extends": "hazard", "damage": 2 }`); a new
  property (bounce, slippery, conveyor...) or look is code.
- **Fences (D167):** a see-through barrier, so a room can wall off an
  area or raise a wall without hiding what is behind it from the fixed
  camera. Solid to bodies like any block (the wizard, enemies, crates;
  he stands on top, and the reachability checker treats it as a block),
  but bolts (his Zap and Pause, enemies' shots, Zap+ bounces too) and
  enemies' sight pass through (`seeThrough`, `Grid.blocksSight()`).
  Blink, Warp, Pull and a paste stop at it as at a block. Height is the
  design tool: 1 high keeps crates and enemies in and he jumps it; 2 high
  stops him until the double jump; 3 high for good. A target behind a
  fence is switched with a Zap through it; a tower behind one still
  shoots him (no cover). Look: no faces; two beams per unit of height (at
  half and full height) through the middle of the cell, along its run;
  fence cells side by side on a level link up, a corner, T or cross joins
  round a post in the middle, a free end has a post (none where it meets
  a block or a back wall), a lone cell runs along x (along z when only a
  z side is walled) (`src/render/fence.js`, pure). Drawn as streams of
  light (`src/render/fence-view.js`, `FENCE` tuning): each beam a soft
  camera-facing ribbon, a near-white core fading into the color, with
  packets of light (a bright head, a comet tail) running along it,
  unevenly spaced, over a faint ripple; the lower and upper beam of a
  level flow opposite ways; beams fade out at their ends. The top beam of
  a stack is the rail, brighter and steadier. Posts are emitters: a
  glowing node where each beam meets one and a faint glow up it. All
  additive light, no depth written: it never hides the wizard or sets
  off his x-ray. Room color (structure, D99). Chosen from three
  showcase variants (ribbon alone, with nodes, with data pixels). Showcase
  `?asset=fence-in-room`; dev room `fence_yard`.
- Validation: a base type has a look or a kind, not both; `damage`,
  `lethal` and `seeThrough` only on static types, `kind` values only on
  kinds; a kind needs a color; `block` must be static; room blocks name a
  known type.
- **Edges (D64):** neighbours of any plain types never get an edge between
  them: the corner rule (D12) runs over all plain blocks as one mass, and
  each edge takes the color of a type around it (the later one in
  `defs.json` where types meet). The hazard and void looks outline
  themselves, and a line they share with plain blocks is drawn once, by
  them alone (a lethal type also over a hurting one), so there is always a
  seam in the danger's color where it starts, with no plain edge showing
  around it. Gate blocks keep an outline around every
  cell, since each one goes on its own.

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
- **Void look** (D99, `render/mist.js`): black mist, a pit in the
  world like a floor hole. Opaque black cubes hide the grid behind them;
  thin gray wisps (ridges of 3D noise, on four layers along the view
  ray) sink slowly through them; a slightly larger shell of patchy dark
  fog softens the outline, and a thin dim gray frame keeps the exact
  extent readable. The noise runs in room coordinates, so a patch of void
  blocks is one cloud. Cost: two instanced draws per room; the per-pixel
  noise only runs where void blocks are.
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
- **Spiked platforms** (D82): a platform type with `damage` hurts the
  wizard whenever he touches it, its sides, its top or riding it, like a
  hazard block that moves (then he is invulnerable for a while and
  blinks). `spiked_platform` in `defs.json`: hazard red, dark faces and
  `shape: "spiked"` (a smaller core cube with four pyramids on each side,
  their tips reaching the faces of its cell, so what shows is what hurts;
  `SPIKES` in `src/render/spikes.js`); its outline flares when it hurts
  him (hazard faces would flare too, but their pixels are too small to
  read on the spikes). It moves, waits
  and carries crates like any platform; a short up-and-down path makes a
  hopper to time a run past, a long one a sliding trap. Only platforms
  take `damage` (validation).
- Tuning: `PLATFORM` in `src/entities/platform.js`, `RAILS` in
  `src/render/rails.js`; review in the asset showcase
  (`/tools/showcase.html?asset=platform,platforms,spiked_platform,spiked-platforms`).

## Gate blocks

Blocks that come and go (D140, D141): block types with `kind: gate`,
painted in rooms like any block (a box of them is one entry), each cell
running as its own room object (D40). What makes one go is its type's
`trigger`; everything else is shared:

- **Gone** it is no body at all: whatever stood on it falls (the wizard,
  crates, enemies), and things pass through its cell.
- **Coming back** it never traps anything: while the wizard, his decoy,
  a crate or an enemy is in its cell it waits, and comes back once the
  cell is clear.
- **Look, one language:** going, the block sinks into its cell's floor;
  coming back, it rises. Gone, a collapsing block that will come back
  leaves a dim dashed outline; a switch gate leaves nothing in play, only
  in the room editor (D142).
- **Over a hole:** a gate block may stand in a hole tile (a bridge over
  a pit, a trapdoor); when it goes, the wizard drops into the pit and a
  crate plugs it. Spawn and reset points don't count one as holding the
  wizard up over a hole.

The two triggers:

- **Switch** (`trigger: switch`, the default; types `gate` and `bridge`):
  a white glass box (white is a mechanism, D99; `glassBox()` with
  `GLASS.gate`, D116) with neon edges and, on the top of a stack, one
  light per switch that powers it (lit for each one on). Gone, it is
  not drawn at all in play (D142); the room editor shows its dashed
  outline. Solid until its switches are all on: its block entry's
  `switches` (ids of the room's targets and plates; one entry, one set)
  or every switch in the room. `start` is its state while unpowered
  (D144): `solid` (the default, a gate) or `gone` (a bridge, the other way
  round). Event: `gate` (`open` true or false). See Switches and locked
  exits.
- **Step** (`trigger: step`; types `collapsing`, `collapsing_regrow`, the
  collapsing block of D47): the room color, thin dashed edges, barely
  tinted faces. Only the wizard standing on it (grounded, feet on its
  top, any part of his footprint over it) sets it off: walking into its
  side, jumping past it, a crate resting on it or a dead wizard does
  nothing. It rattles for 0.5 s, harder towards the end, then sinks; once
  rattling it goes even if he steps off. Running across a row of them is
  safe; stopping is not. With `regrow` (seconds, e.g.
  `collapsing_regrow`: 3) it comes back that long after it went; without
  it stays gone until the room resets. Events: `shake`, `collapse`,
  `regrow`.
- Validation: `trigger`, `start` and `regrow` only on gate block
  types; `start: gone` only with the switch trigger, `regrow` only with the
  step trigger; `switches` only on switch gate entries, naming switches
  of the room; a switch gate needs a switch in its room.
- Tuning: `GATE` in `src/entities/gate.js` (the shake time), the look is
  `GATE_FX` in `src/render/gate-view.js`; review in the asset showcase
  (`?asset=gates,collapsing-cycle`).

## Enemies

Corrupted programs (D48), listed in a room's `enemies`. Everything about one
comes from its template in `defs.json` `enemies` (D79): a room gives an
enemy only its cell and, for a patrol or a chaser, its path (D119), so an
enemy behaves the same in every room. A template is one behavior, and each
has a color of its own so the player tells them apart. A template without
`extends` sets every required value below; one with `extends` builds on
another template (and so on down the chain) and sets only what it changes.
Enemies are universal (D78): a look, a
movement, an attack and a color, and any of them combine (a bug can chase
and burst; a virus can patrol).

| Field | Values | Meaning |
|---|---|---|
| `look` | `bug`, `virus`, `sentinel`, `cron`, `worm`, `crawler`, `warden`, `daemon`, `golem`, `wyrm`, `phish`, `overclock`, `pixie` | its body (below). A template takes its base's. |
| `movement` | `patrol`, `stationary`, `chase` | patrol walks the enemy's `path` (required); stationary stays in its cell (no path); chase goes after the wizard (below), walking its `path` while calm if it has one. |
| `attack` | `touch`, `burst`, `arc`, `bolt`, `none` | touch: touching it hurts while it is hostile; burst, arc and bolt: charged attacks (below): lightning all round it, a lightning bolt aimed at the wizard, or a slow shot at him (D80); touching it doesn't hurt. |
| `hostility` | `hostile`, `peaceful`, `provoked` | hostile attacks; peaceful never does; provoked is peaceful until a spell (Zap), a discharge or a bolt hits it, then hostile. |
| `aggroRange` | units (default 0) | how far a hostile enemy notices the wizard, with nothing solid in between (a "!" pops up); a chaser goes after him, a charged attack fires at him. 0: it never notices him (a chaser must have one). |
| `integrity` | 1–15 (a boss up to 99) | how much spell damage it takes before it pops (bug: 2, so two Zaps). |
| `damage` | ≥ 1 | integrity the wizard loses per attack. |
| `speed` | units/s | walking speed, along its path too (an enemy's path has no speed of its own, D119). |
| `chaseSpeed` | units/s (default: `speed`) | speed while chasing or searching. |
| `memory` | seconds (default 1.5) | how long a chaser searches where it lost him. |
| `bounce` | true / false (default false; bug: true) | trampoline top (below). |
| `solid` | true / false (default false) | blocks the wizard, carries him and shoves him (below). |
| `pausable` | true / false (default true) | Pause freezes it (D85); false: the spell's bolt stops at it and does nothing (for guardians). A boss is never frozen. |
| `height` | units, 0.3–1.9 (default 0.6) | its hitbox height in its one cell; its model is drawn bigger (at most 1.6×). Above 1 it stands two cubes high and needs the cell above free (D134, D135). |
| `boss` | `{ armor?, phases }` | makes it a boss (D135): `phases` start at a share of its integrity (`from`, the first 1) and change any fighting value, `teleport` (seconds) among them; `armor` `plate`: hurt only on a floor plate. A room gives a boss its `drop`. |
| `color` | #rrggbb | body color; the eyes show hostility. Each template has a color of its own, told apart at a glance: at least 0.09 apart in OKLab (`MIN_TEMPLATE_COLOR_GAP` in `src/data/colors.js`, checked by `tests/colors.test.js`, D119). |
| `attackRange` | units (default 1.2) | burst or arc reach, from its eyes to the nearest point of the wizard; for a bolt, how near he must be; `aggroRange` must be at least this. |
| `attackCharge` | seconds (default 0.4) | the warning before it fires. |
| `attackCooldown` | seconds (default 1.5) | the wait after firing. |
| `attackColor` | #rrggbb (default: `color`) | lightning or bolt color. |
| `boltSpeed` | units/s (default 4) | how fast a bolt flies (slow enough to dodge). |
| `boltPattern` | `aimed`, `cross` (default `aimed`) | a bolt attack's shots: one at the wizard, or four level ones along the grid axes (a tower, D81). |
| `boltBounces` | 0–8 (default 0) | how often a bolt glances off walls and objects before they stop it (D81). |

One template per look for now (D119), named after it; variants of them
(a tougher bug, a bug that shoots) are to be made as templates of their
own, each in its own color.

| Template | Look | Moves | Attack |
|---|---|---|---|
| `bug` | mint-green ball `#2bff88`, hops, bouncy | patrol, 3 cells/s | touch, 1 |
| `glowbug` | the bug in pale gold `#ffd27a` (extends `bug`, D121) | patrol, 3 cells/s, peaceful | none (peaceful); bouncy, a friendly springboard |
| `virus` | violet sharp cube `#b35cff` (D121), glides | chase: aggro 5, 2 cells/s calm, 3.5 chasing | burst, range 1.2, charge 0.4 s, cooldown 1.5 s; integrity 2 |
| `sentinel` | sky-blue sharp octahedron `#4fa8ff` (D121), glides | chase: aggro 7, 1.5 calm, 2.5 chasing; stops 5 away | arc, range 5, charge 0.7 s, cooldown 2 s; integrity 3 |
| `cron` | rose tower `#ff4f7a` (D83) | stationary | bolts four ways (`cross`) at 3.5 units/s, range 5 (aggro 5), charge 0.6 s, cooldown 1.8 s (D81); integrity 3 |
| `worm` | blue worm `#4f7dff`, inches along | patrol, 2 cells/s | touch, 1; integrity 2 (D83) |
| `crawler` | mint six-legged spider `#3dffd0`, walks | chase: aggro 5, 2 cells/s calm, 3.5 chasing | touch, 1; integrity 2 (D83) |
| `warden` | ember knight `#ff5a1f` | stationary | burst, range 1.2 (aggro 2.5); integrity 8, Pause can't freeze it |
| `daemon` | lilac wisp `#c79bff` | chase like a sentinel, provoked | arc, range 5; integrity 3 |
| `golem` | steel-gray rack `#a0a8c0`, solid (carries the wizard) | patrol, 1 cell/s, peaceful | none; integrity 6 |
| `wyrm` | ice-blue dragon `#73d0ff` | patrol, 2 cells/s, provoked | bolt, range 5 (aggro 5) |
| `phish` | white disk mimic `#eef3ff` | chase: aggro 2, 2 calm, 3.5 chasing | touch, 1 |
| `overclock` | orchid chip `#ec73ff` | chase like a virus, provoked | burst, range 1.2 |
| `pixie` | tangerine butterfly `#ff9a5a` | patrol, 1.5 cells/s, peaceful | touch (never, peaceful) |

- **Moving:** an enemy stands in a grid cell (hitbox 0.6 × 0.6 × 0.6,
  centered) and steps one cell at a time (bug: one hop per cell, 3 cells
  per second). It only starts a step from a whole cell, so on a platform
  only at a stop. It never starts a step into a cell another enemy is
  walking into (D80), so two enemies never meet head-on in the middle of
  a cell.
- **Seeing:** a hostile enemy with an `aggroRange` sees the wizard when
  he is within it (from its eyes, 0.4 above its cell floor, to the
  nearest point of him) and nothing solid lies on the line to his middle:
  blocks, crates, platforms, targets, closed exits. Other enemies and
  holes don't block it. Noticing him pops up a red **"!"** over it
  (any enemy), which stays at least 1 s and as long as it sees him; so
  does a provoked one turning hostile.
- **Chase** (D78): while it sees him it steps towards his column at
  `chaseSpeed`, greedily: along the axis where he is farther, else along
  the other; if both are blocked it waits and tries again, so a wall
  between them stops it (he can hide behind blocks and trap it with
  crates). While he is within its attack range it holds its ground and
  faces him (a sentinel keeps its distance). Losing sight of him, it goes
  to the column where it last saw him and searches for `memory` seconds,
  then goes back to its post (its start cell), or walks its path again
  if it has one. Searching and going back it finds its way round walls
  (a shortest walk over the room's cells, `Enemy.route()`, D80), down
  ledges but never up a step; going back, it stays where it is only when
  there is no way home. It notices him again at any time.
- **Alarm** (D80, D81): any hit that leaves an enemy hostile (a provoked
  one included, once it turns) pops up a "!", turns it to the wizard,
  and a chaser searches where he stands, as if it had seen him there:
  his Zap, and friendly fire too (another enemy's burst, arc or bolt).
  The wizard always gets the blame, so he can stir enemies up with
  friendly fire. Peaceful ones only take the damage.
- **Patrol:** the shared path format (D46) with level legs (along x or z,
  all at the height of `at`); only x and z count once it walks, so after
  falling off a ledge it keeps to its path below. Ping-pong or loop, pause
  at the ends. Off its path (a chaser back from a search), it finds its
  way back round walls (D80).
- **Blocked:** a wall, a block, a step up, a crate, a platform or another
  enemy in the way turns it back to the waypoint it came from, after a
  0.2 s beat (`turnTicks`); something in its way mid-step sends it back to
  the cell it left, where it waits the same beat (D80). It never leaves
  the room.
- **Physics:** it walks off ledges and falls, rides platforms (which wait
  while it steps on or off, and wait for one in their way), and a crate
  can rest on it but can't be pushed into it. It never steps into a hole
  or onto a void block, nor off a ledge onto one (D78): that cell counts
  as blocked. When the ground goes from under it mid-step (a block
  collapses, a crate breaks), it drops as it walks on (D80). Falling into
  a hole or onto a void block anyway pops it into pixels; it stays gone
  until the room resets. Hazard blocks don't hurt it; it never triggers
  collapsing blocks.
- **The wizard** walks through enemies unless they are **solid**. A solid
  enemy blocks him like a crate; he can stand on it (if it doesn't bounce)
  and it carries him as it walks, walls scraping him off; walking into him
  it shoves him along (at most 0.35 per tick), and if he is pinned it
  turns back instead. A crate resting on a solid enemy holds it in place.
- Touching a hostile enemy with a touch attack hurts him (`Game.hurt()`,
  then the usual invulnerability): overlapping it, or for a solid one
  leaning on it or standing on it (the hazard rule, D44).
  Landing on top of a **bouncy** one (every bug by default: a round ball
  reads as bouncy) bounces him up 2.2 above its top (clears 2 blocks)
  without hurting him; its sides still hurt if it is hostile. Enemies with
  `bounce` false can be stood on only if they are solid. A frozen enemy
  (Pause, D85) is solid and never bounces or hurts.
- **Charged attacks** (D78, D80): a hostile enemy with a burst, an arc or
  a bolt that sees him within `attackRange` stops (at a whole cell),
  charges for `attackCharge` seconds (it trembles and glows white;
  lightning crackles round a burst), then fires (lightning in
  `attackColor` for 10 ticks, or a bolt) and cools down for
  `attackCooldown` seconds. Falling cuts the attack off.
  - **Burst:** lightning all round it, out to its range. It hits every
    body within range it can see (the line to its middle not blocked):
    the wizard and other enemies (they lose `damage` integrity and are
    provoked). Objects are not hurt.
  - **Arc:** when the charge starts it aims at the wizard's middle, and a
    dashed line shows the aim (brightening, blinking just before it
    fires). The bolt flies along that line for its range, or until a
    block or an object stops it, and hits every body in the squares it
    passes through: the wizard (if he is still there) and other enemies.
    Stepping out of the line during the charge dodges it. It is drawn on
    the line it hits along, from its eyes (starting at its muzzle).
  - **Bolt** (D80): when charged it fires a slow shot (`boltSpeed`) from
    its eyes at the wizard's middle as he is then, up or down too; a Zap
    in its `attackColor`. The shot flies straight until it meets the
    wizard (hurt, `damage`), another enemy (hit and provoked; never the
    one that fired it), a block, an object or the room's side, and
    sparks there. Room objects shrug it off (it breaks no crate and
    switches no target). Stepping aside while it flies dodges it. The
    Shield and Firewall absorb it at their ring (D84).
    - `boltPattern: "cross"` (D81, towers): four level shots at eye
      height along the grid axes (the screen diagonals), fired like any
      charged attack when it sees him within range; the corners between
      the axes are safe.
    - `boltBounces` (D81): a bouncing bolt is aimed level at him and
      glances off blocks, the room's sides (closed exits too) and room
      objects that many times, turning back along the axis it ran into
      (sparks at each bounce, a 'ricochet' event); then the next of them
      stops it. After its first bounce it can hit its own shooter, so
      the wizard can dodge and let it come back at the shooter.
- **Look (bug):** a mint-green hologram ball with two slanted eyes whose
  color shows its mood: red hostile, amber calm until provoked, cyan
  peaceful. It squashes when bounced on, hops as it walks, bobs while
  standing, turns towards where it walks and pops into pixels. No drop
  shadow (D50).
- **Look (virus):** a sharp-edged hologram cube (flat faces, hard
  corners) tipped onto an edge, slanted eyes on its front face, four
  small cubes of itself orbiting and now and then jumping out of line.
  It floats and glides, leaning into its steps; after the wizard its bits
  orbit faster and wider and its eyes flare; charging, it squares up and
  pulls its bits in tight.
- **Look (sentinel):** a tall sharp octahedron on its point, a visor eye
  across its front ridge and three shards circling its waist; it floats,
  steady. Charging, the shards swing in front of its eye and spin round
  the line of fire like a barrel; firing, it recoils.
- **Look (cron, D83):** a squat hex pedestal with two eyes and a small
  bell on top, and a clock dial floating round it at eye height: a ring
  with four emitters on the grid axes and one hand sweeping round. The
  dial never turns with the enemy (the pedestal does, to watch the
  wizard), so a tower's cross leaves from the emitters. After the wizard
  the hand sweeps faster; charging, it whirls two whole turns, the
  emitters glow up and push out and the pedestal trembles; firing, the
  dial slams down and springs back.
- **Look (worm, D83):** a round head with two antennae and big frowning
  eyes, dragging a tail of four shrinking balls; it inches along, a hump
  running from head to tail once per cell while the tail wiggles. After
  the wizard it rears its head up and its antennae stand straight. The
  tail trails outside its hitbox, for show.
- **Look (crawler, D83):** a six-legged spider: a faceted gem abdomen, a
  round head with four eyes, thin jointed legs walking in a tripod gait
  (three feet down while the other three swing). After the wizard it
  crouches, walks faster and paws with its front legs.
- **More looks (D107):** each has a template of its own (D119; the
  colors in brackets are the showcase's, changed where two templates
  would look alike). Each is taller or wider than its hitbox in places,
  for show.
  - **warden** (`#ff5a1f`): a Firewall Warden, a kite shield bricked like
    the Citadel's floor, a helm with a T-slit visor for eyes, two floating
    gauntlets and a greatsword planted point down. The seams breathe;
    after the wizard the sword comes up to guard; charging, it rises
    overhead while the seams light row by row; firing, it slams down.
  - **daemon** (`#a45cff`): a floating teardrop flame, a will-o'-the-wisp,
    shedding pixel embers off its flickering tip. After the wizard it
    stretches tall; charging, it squeezes into a ball; firing, it flares.
  - **golem** (`#38a8ff`): two stacked rack units with blinking LEDs and
    vent slats, a visor head, block fists and stomping slab legs; meant
    `solid`. After the wizard its LEDs turn to the eye color and the slats
    scroll; charging, the LEDs fill up and the fists rise.
  - **wyrm** (`#ffc83a`): a flying horned dragon mask trailing six hex
    plates in shades of its color (the hue swinging a little either way,
    darker to the tail), a glowing packet over each; a wave swims down it.
    Charging, the packets light tail to head and the jaw opens; firing, it
    snaps forward.
  - **phish** (`#eef3ff`): a mimic. Calm it is a data disk with a red lit
    bit, bobbing out of step with real disks and glitching now and then;
    after the wizard it stands on four jointed legs, eye stalks pop from
    its top corners and a red-toothed jaw chomps. Its eyes stay hidden
    while it poses: the red bit is the warning.
  - **overclock** (`#ff6a2a`): a burning CPU chip scuttling on its pins,
    a die with two eyes, glowing traces, a crown of flame tongues round a
    taller lighter one, sparks rising. After the wizard the fire roars;
    charging, the tongues lean into one column; firing, they flare out.
  - **pixie** (`#7a7dff`): a butterfly, a slim body with antennae and two
    pairs of wings covered in pixels that shimmer in three phases; pixel
    dust drifts down. It flutters along a figure eight; after the wizard
    it flaps faster; charging, the wings fold over its back, all lit;
    firing, they snap open.
- **Spell hits:** a Zap takes `damage` (1) of its integrity and provokes
  it; the last point pops it into pixels. Any enemy can be hit, peaceful
  ones too (they stay peaceful). A hit flashes it white, then cyan, with a
  recoil squash; while damaged it glitches every ~0.8 s (a small sideways
  jump and a faint flash).
- Validation: a known template, a free cell of its own not over a hole
  nor on a lethal block, ids unique among objects and enemies, a patrol
  has a level path clear of static blocks (so does a chaser's, if it has
  one), a stationary enemy has none, and a path has no speed (D119). A
  template: a chaser has an `aggroRange`; a charged attack's
  `aggroRange` reaches its `attackRange`, and no peaceful enemy has one
  (D80).
- Tuning: `ENEMY` in `src/entities/enemy.js`, `BOLT` in
  `src/entities/bolt.js`, `PLAYER.bounceHeight`; the looks are `BUG` in
  `src/render/bug.js`, `VIRUS` in `src/render/virus.js`, `SENTINEL` in
  `src/render/sentinel.js`, `CRON`, `WORM` and `CRAWLER` in
  `src/render/cron.js`, `worm.js` and `crawler.js`, and the D107 looks in
  `warden.js`, `daemon.js`, `golem.js`, `wyrm.js`, `phish.js`,
  `overclock.js` and `pixie.js` (what they share, mood colors and eyes, in
  `src/render/enemy-look.js`; each look's `derez` body for its pop, D126), the lightning `DISCHARGE` in
  `src/render/discharge.js`; review in the asset showcase
  (`/tools/showcase.html?asset=bugs,viruses,sentinels,crons,worms,crawlers`;
  the bolt: `bug-bolt`, `?asset=bolts` for the cron's four-way bolts and a bouncing bolt;
  the D107 looks: `?asset=concepts`, their pops `concept-pops`, wyrms in
  four colors `wyrm-colors`).

### Bosses

Firewall Wardens (D104, D134, D135) are bosses for any biome:
- **Mark and body:** three gold rings round a normal body
  (`render/boss-mark.js`); one cell on the floor, one or two cubes high
  (`height`), never frozen by Pause nor pulled.
- **Awake:** a boss wakes when it first sees the wizard or is hit. Its bar
  shows top middle (name from `boss.<template>` in strings.json, ticks
  where later phases start, dimmed while plate armor is shut; it lingers
  1.5 s once beaten).
- **Teleport** (a phase value): half a second, to a free, safe cell of its
  floor at least 3 units from him and his decoy, one that sees him if it
  can, picked by seeded dice so a room plays the same each time.
- **Plate armor:** hits glance off unless it stands on a floor plate; a
  white dashed shell round it flashes on a glance and lifts away on a
  plate.
- **Drop:** the room names its `drop`, a permanent pickup it holds
  unseen; beaten, the pickup falls into its cell, and once the bit is
  found the boss stays away. One boss a room, no shrine; a boss never
  locks its arena's doors (he may retreat; the room resets).
- **The two:** Null Pointer (`null_pointer`, D136, in `warden_pit`, drops
  fragment 7) and the Gatekeeper (`gatekeeper`, D137, drops the +10
  energy buff, in `gatekeeper`, D174).

## Pickups and progress

Things the wizard takes by touching them (D71). Types live in
`defs.json` `pickups`, placed in rooms as `"pickups": [{ "id", "type",
"at" }]` (a cell; they hover in its middle, ids shared with objects and
enemies).

- **Permanent: data disks.** A disk teaches a spell for good. The wizard
  starts with no spell; the Zap disk lies in `zap_port`, the tutorial's
  third room. Taking it shows the banner `ZAP / SPELL INSTALLED`, the
  terminal line `> SPELL INSTALLED: ZAP`, selects the spell and brings up
  the energy bar and the spell tag in the HUD (both hidden until then:
  energy is only for spells; see Zap and energy).
- **Save bits in blocks:** spells 0–15, buffs 16–31, upgrades 32–47
  (spell upgrades, D88), fragments 48–111, secrets 112–127 (D100); 128 in
  all. The index comes
  from what the item unlocks: a spell's `slot` in `defs.json` for its
  disk (Zap: 0); a buff's, an upgrade's or a secret's slot on its pickup type, and a
  fragment's `slot` on its pickup type (D101). A bit is the item, not the place:
  the same disk may lie in several rooms, and finding one grays out all.
- **Progress** (`src/world/progress.js`) holds the bits found for the
  whole game; room resets and death leave it alone. Known spells follow
  from it (in slot order). The access key holds these bits and the
  access level (see Access keys).
- **Installing** (D73): taking a disk plays a 1 s animation on the
  wizard (`PLAYER.installTicks`, 60 ticks). Every permanent pickup
  plays this same animation with its own model and color (D93): chips,
  cards, fragments and secrets too. `Game.use()` saves the bit,
  starts it and announces it for all of them; `Game.gain()` holds what
  each kind gives and its banner; the model comes from
  `createPickupModel()` (`src/render/pickup-model.js`). It doesn't hold him up: he
  walks, casts (the new spell at once) and can be hurt meanwhile (D74).
  The disk shrinks where it hung and its bits spiral into him, wherever
  he goes, three
  rings in the spell's color sweep up from his feet to his hat, tinting
  his hologram, and he flashes white at the end. The banner shows at
  once. Tuning: `INSTALL_FX` in `src/render/install-fx.js`; showcase
  `?asset=install`.
- **Spell colors:** each spell has a `color` in `defs.json` (Zap cyan
  `#00f0ff`, Shield neon blue `#3b82ff`, Firewall ember `#ff5a14`, Pause
  lavender `#c9a2ff`, Blink pale cyan `#9ef0ff`, Warp pink `#ff6ee8`,
  Cut & Paste white `#f4f6ff`, Compile gold `#ffe45c`, Scan violet
  `#8f6bff`, Pull pale mint `#a6ffcf`):
  its disk's lit bit, its
  install animation and its banner.
- **Found before:** a permanent pickup whose bit is set shows as a ghost
  (gray, solid-lined, spinning without the bob, D74, D94) and can't be
  taken again (D67).
- **Pickup rules for the player** (D94): the shape tells what a pickup
  is, the color what it touches. A white disk teaches a spell (its lit
  bit in the spell's color); a card an upgrade; a chip a buff; a gold
  tile a key fragment; a magenta star a secret; a small voxel shape a
  temporary refill. Chips and refills take the color of the
  HUD bar they improve: light blue (cyan) integrity, yellow-green (lime)
  energy, recharge included. Gray means found already.
- **Temporary: refills.** `refill_integrity` (+3) and `refill_energy`
  (+30), up to the wizard's maximum; a refill is left lying while that stat
  is full. No save bit: it comes back when the room resets (entering it,
  or dying in it). Terminal lines `> INTEGRITY RESTORED` and `> ENERGY
  RECHARGED`.
- **Temporary: boosts (D152).** Small rewards for simple secrets, kind
  `boost`, one pickup type per `effect`, a voxel figure each (an arrowhead,
  a square ring, a lightning step, an X, an arch). Functional, with
  `seconds`, ended when the room resets (leaving it, or a death): `boost_overdrive`
  (15 s, 50% faster on the ground; the air speed stays), `boost_patch`
  (30 s, absorbs the next hit, a gold ring round him) and `boost_overclock`
  (10 s, spells cost no energy); running ones show as tags under the spell
  tag. Cosmetic, no `seconds`, kept through rooms, lost at the next
  death or a reload: `boost_sparkle` (pixels fall off his feet while he
  walks) and `boost_rainbow` (hat bands cycling the hues); one already worn
  is left lying. Not saved, not scored, ignored by the reachability
  checker. `BOOST` in `src/entities/boost.js`, `BOOST_VOXELS` in
  `src/render/boost.js`; showcase `?asset=refills`.
- **Temporary: access pass (for testing, D113).** `access_pass_3` (kind
  `access`, `level` 1–15) raises the wizard's access level to its level
  at once, as the core would (D101): access locks open, the hat gets its
  bands, and the level is saved in the key like the core's. It never
  lowers the level and is left lying while he has that level already. No
  save bit, no score of its own (the level scores as usual). A gold
  upgrade card whose lit bit is the level; picked up like a refill.
  Banner `ACCESS LEVEL n` / `GRANTED BY A TEST PASS`, terminal line
  `> TEST PASS: ACCESS LEVEL n GRANTED`. One lies in `boot_up`, the
  start room; showcase `?asset=access-pass`.
- **Look:** a data disk is an abstract white slab with both top corners
  clipped, hovering half a block up, spinning (a turn every ~4 s) and
  bobbing; both faces carry a 4×4 bit grid of dark gray squares whose
  one lit cube (brighter for darker colors, D74), in the
  spell's color, is the spell's slot (row by row from the top left). The
  integrity refill is a cyan plus of five voxels, the energy refill a lime
  crystal (the HUD bars' colors), smaller and lower than a disk. Taking
  one lifts it, spins it up and flashes it white (10 ticks), then derezzes
  it in its colors (D126). Tuning: `DISK` in `src/render/disk.js`,
  `REFILL` in `src/render/refill.js`; showcase `?asset=disks` and
  `?asset=refills`.
- **Rules:** he takes a pickup when his box overlaps its box (its cell,
  0.2 in from the sides, 0.1 from bottom and top); not while dead. Nothing
  else takes pickups, and they don't block anything.
- **Validation:** known type, inside the room, in a cell no block or
  object fills, one pickup per cell, ids unique among objects, enemies
  and pickups; spell slots unique; a disk names a known spell; pickup and
  object type ids differ.
- **Editor:** pickup types are in the Object tool's list; placing one
  puts it in the room's `pickups`, and picking, erasing, Delete and
  resizing treat it like an object.

## Buff items

Permanent pickups that make the wizard himself stronger (D93, from the
roster's draft, D88).

| Buff | Types | Slots | Each | All found |
|---|---|---|---|---|
| Integrity | `buff_integrity_1`–`4` | 0–3 | +1 maximum integrity | 8 → 12 |
| Energy | `buff_energy_1`–`5` | 4–8 | +10 maximum energy (one bar segment) | 50 → 100 |
| Recharge | `buff_recharge` | 9 | 4 ticks fewer per unit of energy | 12 → 8 ticks (5 → 7.5 per second) |

- **Data:** a pickup type `{ "kind": "buff", "slot", "stat", "amount" }`
  in `defs.json` (`stat`: `integrity`, `energy` or `recharge`). Its
  save bit is the slot in the buff block (bits 16–31); slots 10–15 stay
  spare. Each buff is its own type, as each is its own bit.
- **Effect:** `Progress.buffs()` adds up the buffs found;
  `Game.applyBuffs()` sets the wizard's maxima and recharge rate from
  it, at the start (a loaded save starts him buffed and full) and when he
  takes one. Taking an integrity or energy buff fills that stat to the
  new maximum. Buffs survive death and room resets like every permanent
  pickup; the HUD bars grow with the maxima (a cell or a segment more).
- **Taking one** plays the install animation (D73) with the chip in
  place of the disk, in the buff's color; the banner shows e.g.
  `INTEGRITY +1 / BUFF INSTALLED` (`RECHARGE BOOST` without an amount)
  and the terminal `> BUFF INSTALLED: INTEGRITY +1`.
- **Look:** a square chip, thicker than a disk, in the color of the HUD
  bar it improves (`BUFF_COLORS`, D94: cyan integrity, lime energy and
  recharge; the icon tells recharge from energy), hovering,
  bobbing and spinning like a disk, one corner clipped, three pins on
  its left and right sides. The front carries the stat's icon (a plus,
  a crystal, a lightning bolt), the back the 4×4 bit grid with the buff's
  slot lit. A found chip is a gray ghost, solid-lined like a found disk. Tuning: `CHIP` in
  `src/render/chip.js`; showcase `?asset=chips`.
- **Validation:** buff slots unique; all integrity buffs together keep
  the maximum within the key's health field (at most 15,
  `MAX_SAVED_INTEGRITY`); all recharge buffs together leave at least 1
  tick per unit.

## Zap and energy

- **Energy** (mana, D72): whole units; the wizard holds 50 and gets one
  unit back every 12 ticks (5 per second, empty to full in 10 s). It
  carries over between rooms and is full again after a respawn. Buffs
  raise the maximum and the recharge rate (see Buff items).
- **Energy bar:** under integrity, slanted lime segments of 10 energy
  each (5 at 50), filling unit by unit as energy comes back; a full one
  glows. Spell costs are kept to multiples of 10, so the full segments
  count the casts left whatever spell is selected, and switching spells
  never changes the bar. A higher maximum adds segments. The bar is
  hidden until he knows a spell.
- **Casting:** once he has found a data disk (see Pickups and
  progress), E or Numpad 0 casts the selected spell. Its name
  shows in a lime tag under the energy bar (ZAP); Tab switches to the next
  spell he knows (Q back), and the tag flashes. With only one spell known,
  Tab does nothing and the tag shows no key hint (D54); with two or
  more, the hint TAB shows. A spell just installed is selected.
- **Zap** (E or Numpad 0): costs 10 energy, then 0.25 s before the next
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

## Shield

The second spell (D73), from a data disk in `shield_hall` (slot 1).

- Cast (E) with Shield selected: costs 20 energy, then 0.25 s before the
  next cast. It stays up for 7 s (D74); casting it again while it is up starts
  it over. Death ends it; it carries over between rooms.
- It blocks enemies' ranged attacks (D84): a bolt stops at the ring
  (radius `PLAYER.shieldRadius`, 0.55, round his feet) in sparks, and an
  arc or burst that reaches him does nothing. The ring flares for 12
  ticks (brighter, a little bigger) and no invulnerability starts.
  Touching an enemy, hazard blocks and spiked platforms still hurt.
  Casting Firewall replaces it.
- **Look:** a jagged ring of lightning round him at hand height (radius
  0.55), neon blue outside with a thin white core, turning slowly and
  flickering between four zigzags every 2 ticks. It pops up in 6 ticks
  and blinks in its last 40 ticks.
- Tuning: `defs.json` `spells.shield` (cost, cooldown, duration, color);
  the look is `SHIELD_FX` in `src/render/shield-fx.js`; showcase
  `?asset=shield`.

## Firewall

The third spell (D84), from a data disk (slot 2); not placed in the
Lattice (D133).

- Cast (E) with Firewall selected: costs 40 energy, then 0.25 s before the
  next cast. It stays up for 7 s; casting it again starts it over, casting
  the Shield replaces it (and the other way round). Death ends it.
- It blocks everything the Shield blocks, and touch attacks too: touching
  an enemy doesn't hurt while it is up. Hazard blocks and spiked
  platforms still do.
- It burns every live enemy touching its ring (`shieldBox()`: his box
  widened to the ring on the ground plane): 1 damage (`damage`) at once,
  then again every 0.5 s (`burnInterval`) while it stays. A burn is a
  hit like a Zap's: it provokes and alarms the enemy (D81); an enemy it
  pops has the death cause `firewall`.
- **Look:** a low jagged ring round his feet with 11 tongues of flame
  licking up from it (0.3–0.75 high), ember orange outside with a thin
  white core, turning slowly the other way from the Shield and flickering
  between four sets of flames. Timing as the Shield (pops up, blinks in
  its last 40 ticks, flares when it blocks).
- Tuning: `defs.json` `spells.firewall` (cost, cooldown, duration, color,
  damage, burnInterval); the look is `FIREWALL_FX` in
  `src/render/firewall-fx.js`; showcase `?asset=firewall,shield-block`.

## Pause

The fourth spell (D85), from a data disk in `freeze_hall` (slot 3).

- Cast (E) with Pause selected: costs 25 energy, then 0.25 s before the
  next cast. A bolt in its color flies the way he aims (10 units per
  second), like a Zap: it stops at the first live enemy, block, object or
  room side, in sparks. Room objects shrug it off (it switches no target
  and breaks no crate).
- The enemy it stops at freezes for 5 s (`duration`); freezing a frozen
  one starts it over. A frozen enemy stops where it is, mid-step too, and
  walks on from there when it thaws. It sees nothing, cuts off a charged
  attack and fires none, and touching it doesn't hurt. It is solid, by
  the solid-enemy rules (D51): he bumps into it and stands on it, and a
  bouncy one doesn't bounce him. Its box is the whole cell while frozen
  (1×1×1 at least, D155), so it is a block to climb from like a crate, and
  it can be pushed (D154). It still falls, rides platforms, holds a
  plate down and takes hits (a Zap, a burn, another enemy's discharge or
  bolt); it pops as usual.
- A frozen enemy he stands inside when it freezes doesn't trap him: it is
  solid for him only once he has stepped out of it (`Enemy.passable`).
  Standing on one as it thaws: a solid one carries on carrying him, any
  other drops him through (and hurts if it touches). It blinks in its
  last second as a warning.
- A Pause hit provokes (a provoked enemy thaws hostile) but doesn't
  alarm a frozen enemy. An enemy with `pausable` false (Firewall Wardens,
  Phase 4) shrugs it off: it counts as a hit, so it is alarmed (D81).
- **Look:** the enemy holds its pose (its animation stops), tinted 30 %
  towards lavender, inside a cage of corner brackets in the spell's
  color (a box of 0.84 round it, growing up from the floor over 8 ticks),
  blinking every 5 ticks in its last 60.
- Tuning: `defs.json` `spells.pause` (cost, cooldown, speed, duration,
  color); the look is `PAUSE_FX` in `src/render/pause-fx.js` and
  `PAUSE_VIEW` in `src/render/pause-view.js`; showcase
  `?asset=pause,disk-pause`.

## Blink and Warp

Two teleport spells (D86): Blink (slot 4) and Warp (slot 5), from data
disks; neither is placed in the Lattice (D133).

- Both go the way he aims (the way he last walked), level at his height,
  through open space only: over holes, hazard and void floors, and
  through enemies. A block, a room object or the room's side stops them,
  however thin; they never leave the room. His box sweeps the line
  (`warpTarget()` in `src/entities/warp.js`) and he lands at the farthest
  free spot short of the stop, backing off an enemy standing there. He
  keeps his fall or jump, so a jump and a Blink at its top clears a
  1-high block. Landing over a hole, he falls in.
- Right against a wall (no spot at least `WARP.minDistance`, 0.1, away)
  the cast fizzles (a `fizzle` event): he stays, the energy comes back
  and there is no cooldown.
- **Blink:** 15 energy, at most 3 units (`range`): over a 2-tile gap,
  never a 3-tile one. Every enemy it passes through takes 2
  (`hitDamage`), a spell hit (provokes, alarms, D81). Cut short by a
  wall, an object or the room's side, he takes 1 (`damage`) after
  landing, as a hit (invulnerability after it; no ring blocks it).
- **Warp:** 30 energy, no limit: as far as the first stop, and harmless.
- **Look:** Blink is a super-speed dash: he is drawn shooting from where
  he was to where he is over 6 ticks (fast at first), stretched along the
  way, with light streaks at his feet, hands and head trailing behind
  and a kick of pixels where he pushed off. Warp: his pixels stream from
  his body where he was into his body where he is (the stream, D127),
  and his hologram flashes in its
  color as he lands (12 ticks). The afterimage lasts `PLAYER.warpTicks`
  (24).
- Tuning: `defs.json` `spells.blink` (cost, cooldown, range, damage,
  hitDamage, color) and `spells.warp` (cost, cooldown, color); the look
  is `WARP_FX` in `src/render/warp-fx.js`; showcase
  `?asset=blink,warp,disk-blink,disk-warp`.

## Cut & Paste

The seventh spell (D87), from a data disk by the entrance of Clipboard
(slot 6).

- **Where:** the cell right in front of him: the first whole cell ahead
  of his box along the grid axis he aims on (the larger part of his aim,
  x on a tie), in his column across it, at the height of his feet
  (rounded to the nearest level mid-jump). `frontCell()`, `cutTarget()`
  and `pasteCell()` in `src/entities/clip.js`.
- **Cut** (E, clipboard empty; 20 energy): takes the crate (any pushable
  at rest) or the frozen enemy in that cell, on his own level only, out
  of the room into his clipboard. One with something resting on it
  stays (D4): cutting never makes anything fall. Nothing to cut: it fizzles
  (energy back, no cooldown).
- **Paste** (E, holding something; free, `pasteCost`): puts it into that
  cell, if it is inside the room and clear of blocks, bodies (objects,
  enemies, him) and pickups lying there; else it fizzles and he keeps it.
  It falls from there: over a hole a crate plugs it, an enemy pops. A
  crate keeps its integrity; an enemy its integrity, provocation, facing
  and what was left of its freeze (paused while held), and its patrol
  path moves with it (translated by how far it moved). A pasted thing is
  new to the room: its id is the old one with `~n`.
- **Carried:** what he holds goes with him through exits and pastes into
  any room. Dying loses it. The room it was cut from resets as usual, so
  it is back there on re-entry: copies are allowed (D87).
- **Look:** a bright dashed marquee in white (marching ants) snaps onto
  what he cuts (from 1.35 times its size, 8 ticks); the object shows
  until then, then streams into his hands as pixels in its color and
  white (22 ticks; the stream, D127). Pasting streams the pixels from his
  hands into a marquee on the cell, and the object grows in with a small
  overshoot.
  The effect lasts `PLAYER.clipTicks` (40) and doesn't hold him up.
- **Aim marker:** while Cut & Paste is selected (alive, no transition, no
  effect running), a dim marquee marks what a cut would take, or a
  dashed ghost of what he holds (its size, its color) marks where a paste
  would go; nothing shows without a target.
- **HUD:** while Cut & Paste is selected, a dashed slot after the spell
  tag: empty, or an icon of what he holds (an isometric cube in the
  crate's color; an enemy's round body with eyes in its color, in the
  Pause cage's corner brackets while frozen).
- Tuning: `defs.json` `spells.cut_paste` (cost, pasteCost, cooldown,
  color); the look is `CLIP_FX` in `src/render/clip-fx.js` with
  `src/render/clip-view.js`, the icons `src/ui/clip-icon.js`; showcase
  `?asset=cut-paste,disk-cut-paste`.

## Pull

The first Phase 4 spell (D89, D124), from a data disk (slot 10); not
placed in the Lattice (D133). Pushing only moves crates away; Pull brings them,
and enemies, closer.

- **The line:** along the grid axis he aims on (as Cut & Paste: the
  larger part of his aim, x on a tie), in his column across it, at the
  height of his feet (the nearest level mid-jump), from the cell right in
  front of him up to `range` cells (6). Holes and hazard or void floors
  below don't stop it; a block, the room's side or any other body in a
  cell does. The first crate or enemy on it is the target.
  `pullTarget()` in `src/entities/pull.js`.
- **Pull** (E; 15 energy): the target slides one cell towards him.
  - A crate moves as if pushed (`Pushable.push()`, D4): only a resting
    one with nothing on it, supported, into a free cell; it falls or
    plugs a hole from there.
  - An enemy (any live one, frozen too, walking or standing; not
    falling, not riding a platform between stops) is dragged from its
    cell, or of the two it walks between the one it is nearer, over
    anything: over a hole it drops in and pops, onto a void block it
    dies (`Enemy.pull()`). It slides at `ENEMY.pullSpeed` (3 units a
    second, a pushed crate's speed) and does nothing else until it
    arrives; an attack it was charging is cut off. Something in the way
    on the way drags it back to its cell. Pulling provokes it and
    alarms it (D81): he gets the blame.
  - Nothing in line, or a target with nowhere to go (right in front of
    him, a load on the crate, a body in the cell, another enemy walking
    into it): it fizzles (energy back, no cooldown).
  - One cell per cast; cast again to pull it further.
- **Look:** a marquee in the spell's color snaps onto the target (from
  1.35 times its size, 6 ticks) and rides along with it; square rings of
  pixels leave it every 3 ticks and shrink as they flow into his hands
  (12 ticks each): a tractor beam. The beam lasts `PLAYER.pullTicks`
  (24), about as long as the target slides, and doesn't hold him up.
- **Aim marker:** while Pull is selected (alive, no transition, no beam
  running), a dim marquee marks what a pull would take; nothing shows
  without a target that has somewhere to go.
- **Color:** a pale mint, not the crate's neon green nor the bug's green, so the
  beam reads on both.
- Tuning: `defs.json` `spells.pull` (cost, cooldown, range, color); the
  look is `PULL_FX` in `src/render/pull-fx.js` with
  `src/render/pull-view.js`; showcase `?asset=pull,disk-pull`.

## Compile

The second Phase 4 spell (D88, D125), from a data disk (slot 7); not
placed in the Lattice (D133). It makes a crate out of nothing, for a while: a
step up, or a hole plugged to walk over.

- **Where:** the free cell in front of him at the height of his feet,
  as Paste puts a crate (`pasteCell()` in `src/entities/clip.js`): inside
  the room, clear of blocks, bodies and pickups lying there.
- **Compile** (E; 50 energy): a crate of the spell's `object` type (the
  dashed crate, `crate_dashed`) appears there. It is an ordinary crate of
  the room (`Pushable`, D4): it falls from there if nothing holds it up,
  plugs a hole it drops into, can be pushed and pulled, holds a plate
  down and carries what stands on it. No free cell: it fizzles (energy
  back, no cooldown).
- **Lifetime:** `duration` seconds (7), counted from the cast; it blinks
  for the last 2 s, faster in the last 0.7 s, then derezzes into pixels
  (`Pushable.expire()`): what stands on it falls, and a hole it plugged
  opens again under whoever is there. Its pixels fly for a second, then
  it leaves the room's objects.
- **No limit** on how many stand at once: only the energy (5, back in
  1 s at the base recharge) and the cooldown hold him back. Stairs are
  not free-standing: each crate falls to the ground, so a step is one
  high, as with any crate.
- Cut & Paste can't take a compiled crate (it only lasts a while); a
  room reset clears them.
- **Look:** bits in the spell's gold stream from his hands into the cell
  (18 ticks; the stream, D127) while the crate grows in with a flicker; the blinking and the pixels
  of its end as above. The crate is neon green, like every crate (D99): the
  gold is the spell's.
- **Aim marker:** while Compile is selected (alive, no transition), a dim
  gold marquee marks the cell a cast would fill; nothing shows without a
  free one.
- Tuning: `defs.json` `spells.compile` (cost, cooldown, duration,
  object, color); the look is `COMPILE_FX` in `src/render/compile-fx.js`
  with `src/render/compile-view.js`; showcase `?asset=compile,disk-compile`.

## Fork

The fourth Phase 4 spell (D88, D129), from a data disk in `fork_lab`
(slot 8). It makes a second wizard for a while: one more body to stand on
a plate, and a target for enemies.

- **Fork** (E; 25 energy): a hologram of him, in the spell's blue
  (`#4d8bff`, white head), stands in the free cell in front of him at the
  height of his feet, where Compile puts a crate (`pasteCell()`), facing
  as he did. No free cell: it fizzles (energy back, no cooldown).
- **Not a solid body:** nothing collides with it and nothing harms it;
  he walks through it. It falls if nothing holds it up, and derezzes if
  it lands on a hole.
- **Plates:** it holds a floor plate down like a body standing on it, so
  a plate in a slot too low for him (a lintel over it) can be pressed
  from outside.
- **Enemies:** a hostile enemy that sees it (aggro range, line of sight)
  goes for the nearest of it and him; the decoy wins a tie. What the
  enemy looks at, chases (where it saw it last), faces and aims at is
  that focus (`Enemy.focus`, `Enemy.aimAt()`): bolts and arcs fly at the
  decoy, a burst or an arc hits nothing there. Touch attacks never reach
  it. Once it is gone, enemies go back to him.
- **Lifetime:** `duration` seconds (10), counted from the cast; it blinks
  for the last 2 s, faster in the last 0.7 s (as a compiled crate does),
  then derezzes into pixels (48 ticks) and leaves the room. One at a
  time: a new fork replaces the old one. A new room has none.
- **Look:** a wizard hologram in the spell's blue with a white head that
  grows in with a flash; blue bits stream from his hands into the cell (the
  stream, D127); while Fork is selected, a dim blue marquee marks the
  cell a cast would fill.
- Tuning: `defs.json` `spells.fork` (cost, cooldown, duration, color);
  the decoy is `src/entities/decoy.js`, the look `src/render/decoy-view.js`
  and `src/render/fork-view.js`; showcase `?asset=fork,disk-fork`.

## Scan

The third Phase 4 spell (D88, D128), from a data disk in Hidden Layer
(slot 9). It finds what a room hides: fake blocks and hidden exits.

- **Scan** (E; 15 energy): a square wave spreads from his feet over the
  grid, at every height, out to `range` (6) along x and z, in half a
  second (`SCAN.spreadTicks`, 30 ticks). What it reaches is revealed
  then, nearest first. It never fizzles: finding nothing is an answer
  too. The first find of a cast prints `> SCAN: HIDDEN DATA FOUND`.
- **Fake blocks:** block type `fake` (`"fake": true`, the plain look, no
  color): solid like any block and drawn in one mass with the plain ones,
  so nothing gives it away. Reached, it derezzes (D126) in the room's
  color and is gone: what stood on it falls. A pickup may lie inside one
  (a hidden pickup; the validator allows it only there).
- **Hidden exits:** an exit with `"hidden": true` is solid wall, drawn as
  wall (a back doorway is not cut, a front exit's floor edge runs on,
  no arrows), until the wave reaches its opening; then the patch of wall
  derezzes and the doorway with its stream shows. Locked or access-locked
  too, it is a lock from then on. The exit he came in through is open
  and shown from the start (D75), so the way back is never hidden.
- **Until the room resets:** what a scan revealed stays revealed for the
  visit; a respawn or a new visit hides it again (rooms fully reset).
- **Look:** a violet square on the floor he stands on, a dimmer one
  trailing it, clipped to the room's floor, fading after it has spread;
  the room view is rebuilt without what it revealed.
- Tuning: `defs.json` `spells.scan` (cost, cooldown, range, color); the
  wave is `SCAN` in `src/entities/scan.js`, the look `SCAN_FX` in
  `src/render/scan-fx.js` with `src/render/scan-view.js`; showcase
  `?asset=scan,disk-scan`.
- The room editor has a Hidden checkbox for exits; fake blocks are the
  `fake` block type.

## Upgrades

An upgrade (D95) is a permanent pickup with its own
bit in the upgrade block (bits 32–47); the engine knows three.

| Upgrade | Type | Slot | Of | Color | What it does |
|---|---|---|---|---|---|
| Zap+ | `upgrade_zap_plus` | 0 | Zap | cyan | The bolt bounces three times off blocks and the room's sides |
| Shield+ | `upgrade_shield_plus` | 1 | Shield | ice blue `#cfe8ff` | The ring sends enemy bolts back the way they came |
| Double jump | `upgrade_double_jump` | 2 | the wizard | magenta | One more jump in mid-air |

- **Data:** a pickup type `{ "kind": "upgrade", "upgrade", "slot",
  "spell", "color" }`, Zap+ with `bounces`. `Progress.upgrades()` maps
  what was found by `upgrade`; `Game.applyUpgrades()` gives them to the
  wizard (`player.upgrades`, `player.airJumps`) at the start and when he
  takes one.
- **Replacing the spell:** the spell keeps its id, slot and place in the
  Tab cycle; the HUD tag shows the upgrade's name (`Game.spellNameKey()`,
  strings `upgrade.<id>`), and casting it casts the upgraded version at
  the spell's cost. Taking the disk selects the spell. An upgrade whose
  spell isn't known yet waits for it.
- **Zap+:** `bounces` (3) off blocks and the room's sides (a closed
  exit too), turning back along the axis it ran into: a diagonal shot
  banks off a wall round a corner. It stops at room objects like a Zap
  (`Bolt` `bounceObjects: false`), so it breaks crates and switches
  targets. His own bolt never hurts him, bounced or not.
- **Shield+:** casting the Shield raises a ring with `reflects` set. An
  enemy bolt stopping at it turns round (`Bolt.reflect()`): it flies back
  the way it came as his bolt, with its own damage and color, stopping at
  the first enemy (its shooter included), object or wall; sparks fly
  where it turned (`ricochet`), the ring flares and `reflect` is
  reported. Arcs and bursts are only blocked, as by the Shield. Firewall
  doesn't reflect. The ring is the Shield's in Shield+'s color.
- **Double jump:** a jump pressed in mid-air (after a jump, after
  walking off a ledge once the coyote time is over, after a bounce)
  kicks him up again at the jump's speed, once until he lands
  (`airJumpsLeft`); `airjump` is reported. From a jump's top he
  reaches 2.4: over a 2-high wall, and across wider gaps. Hexagonal
  rings in his magenta burst flat from where he kicked off and fade
  (`JUMP_FX` in `src/render/jump-fx.js`, `PLAYER.airJumpTicks`).
- **Look:** an expansion card (`createCard()` in `src/render/card.js`,
  tuning `CARD`): a white landscape card as thin as a disk, hovering and
  spinning like one; contact fingers along its bottom edge in the
  upgrade's color with a key notch; a mounting bracket up its left side;
  the 4×4 bit grid with the upgrade's slot lit on both faces. A found one
  is a gray ghost like any disk. Taking one
  plays the install animation in its color, the banner reads e.g.
  `ZAP+ / UPGRADE INSTALLED`, the terminal `> UPGRADE INSTALLED: ZAP+`.
  Showcase `?asset=upgrades` (the cards, the row beside the Zap disk,
  `shield-plus`, `double-jump`).
- **Validation:** upgrade slots unique; one pickup type per upgrade;
  Zap+ upgrades Zap and has `bounces`, Shield+ upgrades the Shield,
  the double jump no spell.

## Score and secrets

The score is what the wizard has, not what he did (D100).

- **Points** (`defs.json` `score`): 50 per permanent pickup found (a
  disk, a buff chip, an upgrade card, a fragment), 200 per secret,
  500 per access level (D101). Enemies, refills and rooms score
  nothing. `world/score.js` works it out from `Progress` whenever it is
  shown (`Game.score`), so it is never saved: the save key has no score
  field, and a loaded save scores exactly what it holds.
- **Completion:** the share of the permanent pickups placed in the world
  that he found, rounded down (`Game.completion`); items defined but
  placed in no room don't count.
- **Secrets:** `{ "kind": "secret", "slot" }`, a bit in the secrets block
  (slots unique, checked by validation); `defs.json` defines all 16
  (`secret_0`–`secret_15`), so the room editor offers each one. The look is a thick five-pointed star
  in the wizard's magenta (`render/secret.js`, `SECRET_COLOR` `#ff2bd6`),
  a gray ghost once found. Taking one plays the install animation with the
  banner `SECRET FOUND / n / N` and `> SECRET FOUND n/N` (N: the secrets
  placed in the world). They lie where it takes an extra move.
- **HUD:** `SCORE 000250 33%` in gold under the title, top right; a new
  score rolls up to its value in 0.9 s (`rollScore()` in `ui/hud.js`,
  easing out), flashing while it rolls. No popups over pickups.
- **Dropped:** bonus bits, their room slots, the "all bits collected"
  bonus and the local high score; the secrets ladder (rewards per 4
  secrets, a room for all 16, D176). Simple secrets give boosts (D152).

## Fragments and access

Collecting the key fragments is the goal of the game (D101).

- **Fragments:** `{ "kind": "fragment", "slot" }`, a bit in the fragments
  block (48–111; slots unique); `defs.json` defines all 64
  (`fragment_0`–`fragment_63`), so the room editor offers each one.
- **The boot key:** the 64 fragments are the modules of one 8×8 code,
  QR-like, with finder squares in three corners (`BOOT_KEY` in
  `world/boot-key.js`); slot n is row n / 8, column n % 8, a dark or a
  light module. A fragment is a thin gold tile carrying the whole key dim,
  its own module lit (filled if dark, a bright outline if light), as a
  disk lights its bit (`render/fragment.js`, `FRAGMENT_COLOR` = the
  score's gold `#ffe23d`), a gray ghost once found. The HUD shows the key
  under the fragment count, each found module in place, so the code fills
  in as he collects them; the end screen shows it whole.
  Taking one plays the install animation with the banner
  `FRAGMENT n/N / KEY FRAGMENT GET` and `> FRAGMENT n/N GET!` (N: the
  fragments the core needs). There is nothing to carry: found is found.
- **World data:** `world.json` `"fragments": { "required": 64, "access":
  [16, 32, 48] }`: 64 fragments reboot the Grid; 16, 32 and 48 found earn
  access levels 1, 2 and 3 (the last). Validation: the thresholds rise and
  stay within `required`; a world without the field needs 64 and has no
  levels.
- **The core** (`defs.json` `core`, kind `core`, white: a mechanism,
  D99): a room object placed with the room editor, at most one in the
  world (validation); its Lattice room comes in 5.8. A fixed body 1×2×1, too high to
  jump onto with one jump, so he walks up to it (both cells must be
  free). Touching it (`Game.touchCore()`, once until he steps away): the
  level rises to what his fragments earn (`Progress.earnedAccess()`),
  with the banner `ACCESS LEVEL n / GRANTED BY THE CORE` and `> CORE:
  ACCESS LEVEL n GRANTED`; otherwise it says how many more are needed
  (`> CORE: 12/16 FRAGMENTS FOR ACCESS LEVEL 1`, later `... TO REBOOT
  THE GRID`).
- **Access level:** `Progress.accessLevel`, stored on its own (the save
  key's 8-bit field, D91), raised only by the core, never counted from
  the bits; 500 points each. His hat shows it: a thin gold band per level
  round the cone, from the brim up (`hatBands()` in `render/wizard.js`).
- **Access locks:** `{ "access": n }` in an exit's `requires` (1–15;
  validation: a level the thresholds give; D151). Solid until his level
  is n or more; with switch entries too, the switches must be on as well.
  The exit he came in through stays open for him (D75). The look is the
  switch lock's white glass pane with the level as a small Roman numeral
  (I–III, up to XV) in its top corner, between a bar across its top and
  one across its bottom, as on a clock face, so a lone I reads as a
  numeral; it is red while his level is too low and green once it is
  enough (the switch lights in the middle are red and green the same way)
  (`romanBars()` in `render/switch-view.js`). It opens as soon as the
  core raises the level in the same room, with `> ACCESS GRANTED: EXIT
  UNLOCKED`. Room editor: `Access level` in the exit fields.
- **Core look** (the reactor; showcase `?asset=core`): a gold
  crystal floating and spinning over a white pedestal, inside orbit rings,
  one per access level, each turning gold once reached; the crystal glows
  brighter with the fragments found, and the core flashes when it raises
  the level. Tuning: `CORE_FX` in `render/core-view.js`.
- **The end:** with every fragment the core needs, touching it reboots
  the Grid, once (`Game.won`, `'win'` event): a placeholder screen
  `GRID REBOOTED` with the final score and completion; Enter closes it
  and he plays on. A real ending comes with content production.

## Spell roster

Up to 16 spells and 16 upgrades (D88, D89), each its own save bit (an
upgrade in the upgrades block, not spells). Eleven spells and three
upgrades are set; the rest stay spare for what content production shows
a need for.

| Spell | Slot | What it does | Built |
|---|---|---|---|
| Zap | 0 | Fast bolt | Phase 2–3 |
| Shield | 1 | Ring that blocks ranged attacks | Phase 3 |
| Firewall | 2 | Ring of flames: blocks touch too, burns | Phase 3 |
| Pause | 3 | Bolt that freezes an enemy into a platform | Phase 3 |
| Blink | 4 | 3-unit dash, hits enemies, hurts on a wall | Phase 3 |
| Warp | 5 | Teleport to the first wall | Phase 3 |
| Cut & Paste | 6 | Move a crate or frozen enemy, room to room | Phase 3 |
| Compile | 7 | A crate in the cell in front for 7 s: a step, or a hole plugged | Phase 4 (D125) |
| Fork | 8 | Hologram decoy for 10 s: holds plates, draws enemies | Phase 4 (D129) |
| Scan | 9 | A wave that reveals fake blocks (and pickups inside them) and hidden exits | Phase 4 (D128) |
| Pull | 10 | Pulls the first crate or enemy in line one tile towards the wizard | Phase 4 (D124) |

- **Upgrades:** Zap+, Shield+ and the double jump, built in Phase 3 (see
  Upgrades). Found, an upgrade replaces its base spell in the Tab cycle
  (ZAP becomes ZAP+), so the cycle stays short.
- **Order in the world:** Home Lattice gives Zap, Shield, Pause, Scan,
  Fork and the double jump (D133); the rest come in later sectors.
- **Turned down for now:** spells Decrypt (dissolves an encrypted
  wall type), Rollback (back to where he was 3 s ago); upgrades Halt
  (Pause freezing the whole room), Lift (Warp landing on top of what
  stops it), Firewall+ (hazard immunity) and Cut & Paste+ (a level up or
  down). They remain candidates for the spare bits. (Patch and Overclock
  became boosts, D152.)

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
  (`/tools/showcase.html?asset=xray`).

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
  1, and at 0 it derezzes (D126) and is gone
  until the room resets; whatever stood on it falls. `crate_cross` has
  integrity 1: one Zap. A hit that doesn't break it jolts it.
- It always shows it, standing still. Crates are glass (D96): the plain
  `crate` holds a small dark core inside the glass carrying a whole 4×4
  grid of small pale squares (its data bits, the `bits` mark) on every
  face; a destructible crate is an empty shell of thinner, more
  translucent glass (D99). (Objects with other faces than glass show the
  grid with 6 of the 16 bits missing, D53.) No animation; only a hit
  jolts it. Plain crates shrug a Zap off (sparks only).
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

## Decorations

Room dressing (D117): object types of kind `deco` in `defs.json`
(`data_pillar`, `screen`, `memory_stack`), placed with the room editor's Object tool.

- A decoration is a fixed body as big as its look (`DECO_LOOKS`,
  `src/data/room-data.js`): the data pillar 1×3×1, the screen and the
  memory stack 1×1×1. It never falls, so it may stand on anything or on
  another decoration. The wizard walks round it or stands on it (the
  screen and a single memory stack are jumpable, the pillar is not), things bump into it, bolts stop at it; it does nothing
  else and resets with nothing.
- It has no color of its own: it takes the room's (biome's) color, like
  structure (D99). The screen's blue is part of its look.
- It faces `+z` by default; the room object's override `"face": "+x"`
  turns it. In the editor, clicking a placed decoration with the same
  type picks it, and clicking the picked one turns it (the override is
  left out while it faces `+z`).
- A screen may show a text in the wizard's terminal (D118, Screen texts
  below).
- In the game: `src/entities/deco.js` (the body) and
  `src/render/deco-view.js` (the look, by `look`).
- Static objects are seen from one fixed angle (D115): only the top and
  the +x and +z faces. Detail goes on those faces; hidden faces stay dark.
- Glass (D96, D116): crates and decorations are built with
  `glassBox()` (`src/render/glass.js`) and a preset from `GLASS`.
  Decorations use `GLASS.deco`, which hides less of what's behind than a
  crate, so what's inside shows.
  Shared pieces (dark boxes, edges, boxes of light) are in
  `src/render/deco.js`.
- **Data pillar** (`src/render/data-pillar.js`): a frosted glass shaft in
  one cell, always 3 blocks high, one segment per block, on a plinth
  under a cap. Inside stands a slimmer dark core; one of its seen faces
  (`+z` or `+x`) carries four cables over a softly pulsing panel, with
  dashes of data climbing them. Glass, core and cables are in the biome's
  color, the data a brighter, whiter tint of it. Showcase
  `?asset=pillars` (both faces, every biome's color).
- **Screen** (`src/render/screen.js`): a blue terminal (`#4a8dff`, clear
  of cyan, which moves) in a 1×1×1 cell, facing `+z` or `+x`. A deep
  glass box round a dark tube sits on a plain slab a little smaller than
  it, in the biome's color. Code scrolls up the tube's face, the bottom
  line typing out behind a blinking cursor. Chosen from three variants (a
  flat monitor on a post, a CRT box with an oscilloscope, a floating
  hologram): the CRT's shape with the monitor's text. Showcase
  `?asset=screens`.
- **Memory stack** (`src/render/memory-stack.js`, D123): 1×1×1, four
  frosted glass plates with memory chips on them, held by a dark spine at
  the back; lights along the plates' front edge face `+z` or `+x`. A
  read/write bar rises past the plates, lighting each as it passes, and
  every few seconds one plate's lights come on one by one (a write), then
  fade. There is no height option and no wall object: a **memory wall**
  is stacks placed side by side and on top of each other. The plates run
  nearly to the cell's sides, so neighbors join, and the light's timing
  comes from the stack's cell: the bar climbs from a stack into the one
  above (it repeats every 2 blocks, so a 2-high wall shows it once) and
  runs along the wall as a slow wave. Chosen from six drafts (memory
  cells, platters, and three relay nodes: a crystal pylon, a routing ring,
  a signal mast). Showcase `?asset=memory` (both faces, a 3×2 wall, every
  biome's color).

### Screen texts

Hints and lore (D118). A screen room object may name a text:
`{ "id": "screen_1", "type": "screen", "at": [5, 0, 10], "text": "boot_hello" }`.

- Texts live in `data/lore.json` (`schemas/lore.schema.json`), by id: an
  optional `title` (at most 32 characters, printed as `> TITLE`) and
  `lines`, 1 to 6 of at most 48 characters, printed as written
  (`LORE_LIMITS`, `src/data/lore.js`). One text may be shown by screens
  in several rooms. Only screens show texts; the data checks refuse a
  text on any other object and an id lore.json doesn't have.
- The wizard reads a screen by coming near it, alive: within 1 unit
  (`LORE_REACH`) in front of it, at its side or on top. The text prints
  in his terminal, once per visit to the room (a respawn doesn't repeat
  it; leaving and coming back does). Nothing is saved.
- In the terminal a text is a block of its own, in the screens' blue:
  messages don't count it towards their 4 lines, so they can't push it
  off; it stays at least as long as a message and as long as it takes to
  read (12 characters a second), then its lines fade at once. A newer
  text replaces it.
- A screen with a text not read yet on this visit blinks a light on its
  top and its code scrolls faster (showcase `?asset=screen-text`); once
  read it looks like any screen.
- **Editor:** placing a screen picks it; clicking a placed one picks it,
  clicking the picked one turns it. With a screen picked, the Object
  tool's fields show its text: pick one of lore.json's texts (or none),
  change the picked text (Update: every screen showing it changes), or
  write a title and lines and add them under a new id (New). Save writes
  lore.json with the rooms; undo takes text changes back with the room's
  step.

## Switches and locked exits

Switches power what is linked to them (D69, D75, D140): locked exits,
gates and platforms. Each of those is powered while all its switches are
on: the ones its `switches` list names (ids of targets and plates in the
room), or, without a list, every switch in the room (so rooms made
before D140 work as they did). Switch types in `defs.json` are placed in
`objects` like crates; their state resets with the room.

- **Target** (`target`, kind `target`): a fixed 1×1×1 block. A Zap bolt
  stops at it and switches it on; the next one switches it off again. It
  is a body like a crate (the wizard, crates and enemies stand on it and
  bump into it) but can't be pushed.
- **Plate** (`plate`, kind `plate`): a floor tile, flush with the floor
  like a hole, only at y 0. It is on while something stands on it: a
  crate, an enemy (any hostility) or the wizard, with the middle of its
  footprint over the tile and its feet on the floor (jumping over it
  doesn't count). It is no body: things move over it as over the floor,
  and a crate may start on it.
- **Timed switches** (D140; `target_timed` 5 s, `plate_timed` 3 s; a
  type's `timer`, which a room object may override, 0.5–30 s): on for
  that long, then off by themselves. A timed target counts from the bolt
  that switched it on, and another bolt starts the time again (it never
  switches a timed target off). A timed plate is on while pressed and
  counts from the moment nothing stands on it. While it counts down it
  blinks, ever faster, and ticks (`tick` events: every second, twice a
  second in the last two). Its bull's-eye has a dashed outer square.
- **Gate** (block type `gate`, a switch gate block, D140, D141): solid
  until its switches (its block entry's `switches`) are all on; then it
  sinks into its cell and is no body at all until a switch goes off. A
  **bridge** (`bridge`, `"start": "gone"`) is the other way round:
  there only while its switches are all on. Neither ever closes on
  anything in its cell. See Gate blocks.
- **Powered platform** (a platform with `switches`, D140): runs only
  while they are all on, and stops where it is when one goes off;
  without `switches` a platform always runs.
- **Locked exit** (`"requires": [{ "switch": "p" }, ...]` on an exit, one
  entry per switch, or `{ "switch": "*" }` for every switch in the room;
  D151): solid, like the room's
  edge, until those switches are all on; then it opens (`> ACCESS
  GRANTED: EXIT UNLOCKED`). When a switch goes off it closes again, but
  never on the wizard: while he stands in the opening it waits. The exit
  he came in through stays open for him while he is in the room, even
  after a respawn, so he can always leave the way he came (D67). The room
  needs at least one switch.
- **Hidden exit** (`"hidden": true` on an exit, D128): solid and drawn as
  wall until a scan reaches it (see Scan); with `"requires"`
  it is a lock once revealed.
- **Look** (D75, after two showcase rounds): white (`#eef3ff`, the
  type's `color`). Both switches carry a square bull's-eye, a small square
  inside a bigger one, so they read as switches by shape, not only by
  color. Both are white frosted glass like the switch gates (D143,
  `GLASS.gate`): off, the glass is dark and the lines dim; on, the glass
  glows bright, the lines brighten and the inner square fills with light
  (`SWITCH_FX` `glassOff`, `glassOn`, `bodyOff`). A target is a glass
  block with the bull's-eye on its seen faces (top, +x, +z; the glass
  would show hidden ones through); a hit flashes and jolts it. A plate
  is a thin glass tile with a dashed outline; pressed, the outline turns solid, brackets light up just
  outside its corners and a glow spills onto the floor round it, so it
  shows round a crate standing on it. A locked exit is a dark panel
  that sinks into the threshold, on back doorways and front exits alike
  (front exits had four retracting bars until D101). It carries one small bull's-eye light per switch linked to it, lit
  for each one that is on. The exit's stream shows once it is open. A
  gate is a white block with three bars across each seen side and one
  light per linked switch on top; it sinks into its floor to open, and
  open it leaves a dim dashed outline where it will rise again. A bridge
  looks the same.
- Events: `switch` (a switch went on or off), `tick` (a timed one
  counting down), `gate` (a gate opened or closed), `unlock` and `lock`
  (a locked exit opened or closed).
- Validation: a plate lies on the floor, inside the room, not in a block
  and not over a hole; a locked exit and a gate need a switch in their
  room; a `switches` list names targets and plates of the room, and only
  locked exits, switch gate block entries and platforms take one; only
  switch types have a `timer`.
- Room design: a plate the wizard can reach next to the locked exit is
  no puzzle, since the exit closes as soon as he steps off; give him
  something that stays (a crate) or something that comes and goes (a
  patrolling enemy resting on it, a timing puzzle: a timed plate). Access locks (D101,
  see Fragments and access) reuse the locked exit. With links, one room
  can chain steps (a target opens a gate, behind it a plate runs a lift
  to the exit) and two switches can do different things; keep each link
  readable: a switch in view of what it powers, the lights on locks and
  gates counting its switches. A timed switch's time is the run from it
  to what it powers plus about a second: the walk is ~0.22 s a cell.
- Reachability (D131): a powered thing counts when its switches can all
  be on at once (a timed plate also under the wizard himself); a gate
  that can be both open and closed counts as both, floor never in the
  way. Timing is not checked: a timed switch counts as on for good.
- Tuning: the look is `SWITCH_FX` in `src/render/switch-view.js` and
  `GATE_FX` in `src/render/gate-view.js`; showcase `?asset=switches`
  (timed switches: `?asset=timed-switches`, gates: `?asset=gates`).

## Rooms and exits

- Exits are horizontal: an opening on one side of the room
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
- A room may have a watchdog timer (`timer`, whole seconds 3–600, D172):
  a challenge room. It starts once the room has faded in (`> WATCHDOG
  ARMED: 25 S`) and runs while the wizard is alive in the room; it stands
  still behind the pause menu, the map and the editor, and while he is
  invincible (debug). At zero he dies (`> FATAL: WATCHDOG TIMEOUT`),
  using a backup like any death, and his respawn resets the room and the
  timer. It guards the room's permanent pickups: taking the last one
  still to find stops it (`> WATCHDOG DISARMED`, the time left stays on
  show in lime), and a room whose permanent pickups are all found arms
  no timer, so he can pass through again at leisure. A room without any
  (a dash) arms it every time; refills and boosts don't count.
  Leaving the room drops it; coming back starts it from full. The
  exit he came in through stays open (D75), so he can always back out.
  The HUD shows the time left (`WATCHDOG 0:24.5`, rounded up to the
  tenth); its last 5 seconds tick and turn red.
- Objects never leave a room: pushing one out through an exit is blocked.
- The first row of cells inside an exit must be free (no blocks, objects or,
  at floor level, holes). A raised exit (`y` > 0) needs something to stand
  on in front of it, usually a ledge.

### Authored rooms

The author's real game rooms carry `"authored": true` (D90), set with the
*Authored* checkbox in the room editor. They share the world with the test
rooms; development steps never change them
or attach new rooms to them (CLAUDE.md §10). The world map tool marks them
AUTHORED and lets them lie as far from the start as the world needs.

### Dev rooms

Rooms that show one mechanic on its own live in the dev wing (D147):
the dev server, the tools and the tests see them, a player build leaves
them out. A new mechanic gets one there (D43), joined to the other dev
rooms, never to a Lattice or authored room.

| Room | Size | Shows |
|---|---|---|
| `room_1`, `room_2` | 12×12 | empty hubs joining the dev rooms |
| `hidden_layer` | 12×12 | Scan: a fake gap, a hidden exit, a refill in a fake block; the Scan disk |
| `fence_yard` | 10×10 | fences (D167): a target zapped through a 2-high fence raises a bridge; a 1-high pen with a crate |
| `watchdog_run` | 12×8 | a watchdog timer (D172), 25 s: a 1-wide path through a pit to a refill and back |

### Room design checklist

What to check when building or reviewing a room, beyond what validation
catches (validation: bounds, overlaps, exits, spawn and reset points). It
collects problems found in playtests; the room design skill and the level
review subagent (D132) start from it, and the
reachability checker (`npm run check:reach`, D131) automates the reach
checks (not timing: collapsing blocks, platform waits, enemies). Numbers
come from the tuning tables (`PLAYER`, `PUSHABLE`, `PLATFORM`,
`COLLAPSING`); update them here when those change.

**Reach**
- A jump clears exactly 1 block up, never 2 (apex 1.2). A 2-high step
  needs a crate, a platform or a step in between.
- A running jump crosses a 1-tile gap, never a 2-tile one (~1.65 units of
  air travel); a pit 2 or more wide needs a bridge, a platform or a crate
  to plug it. Only from the same level: from a 1-high top (a crate, a
  frozen enemy, a bridge block) beside a floor pit, a late running jump
  lands up to 2.45 units on, so it crosses 2 tiles (D162). Keep anything
  pushable or freezable 2+ cells from a 2-wide pit, or make the pit 3 wide.
- A bouncy enemy launches him 2.2 above its top (0.6): from the floor
  that clears a 2-high ledge, never 3. Where the enemy can walk, the way
  up moves with it.
- Headroom: the wizard is 1.5 high, so wherever he stands there must be 2
  free cells above the surface. A block above is a ceiling, the room's
  height is not (D161), but a ledge 3 high still wants a room 5 high for
  the look.
- A frozen enemy is a 1-high step (D155) and can be pushed like a crate
  (D154); the reachability checker follows its pushes from every cell of
  its path (D166), not the 5 s it stays frozen; bugs also bounce
  him to 2.8, so only a 3-high ledge stops both, and the bounce carries
  him ~3 cells sideways (keep the lane 2+ cells from a gap). An enemy
  he needs as a step can be killed: give the area a second way out.
- Gate and bridge blocks in a hole stand a block high: a step up, not floor.
- A second solution of the same or higher difficulty is fine; only an
  easier one that skips the room's idea is a bypass (D166).
- A crate or a frozen enemy beside a 2-high wall is a step over it: an
  alcove behind 2-high walls is no gate (`ledger_cell`, D160).

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
- Timed switches (D140): the reachability checker counts them as on for
  good, so check the race by hand. Count the cells from where the switch
  goes on (the plate he steps off; for a target, the cell he zaps from,
  the bolt is near instant; for a frozen enemy on a plate, the Pause shot)
  to the far side of what it powers, ~13 ticks
  a cell plus ~34 per jump and ~28 per push on the way; the timer should
  be that plus about a second (60 ticks), not less and not much more.
- A watchdog timer (room `timer`, D172): the checker knows nothing of it
  either. Count the run from the entrance, and from the `reset` point
  after a death, to the last permanent pickup (it stops the timer), or
  to the way out in a room without one, the same way: ~13 ticks a cell, ~34 a jump, ~28 a push, plus
  waits for platforms and switches. Give it about 2–3 s to spare, more on
  a long run. A timer suits rooms where speed is the idea (a dash, a race
  over collapsing blocks), not a slow puzzle.

**Readability**
- The camera looks from the front corner (+x, +z). Tall blocks near the
  front sides hide what is behind them: keep high ledges and walls against
  the back walls (x = 0, z = 0), and put steps on the side facing the
  camera, not behind a ledge. Where a barrier must stand on the camera
  side, or a wall must rise higher, use a fence (D167): it blocks him
  but hides nothing. It is no cover: bolts and sight pass through it.
- Each mechanic should be seen before it matters: a pit, a hazard or a
  collapsing bridge in view from where the wizard enters. Every crate is
  visible to the player: never hidden from the camera behind tall blocks,
  ledges or decorations, never inside a fake block (D164). A bridge that
  starts gone shows no outline: the room that first shows bridges says
  what one is in a screen text.
- Screen texts are help for a spell or concept met for the first time,
  never the room's solution (no where a crate goes, which plate needs
  what, the order of moves); a help text reads true in any room with that
  mechanic (D163).
- A plate on an enemy's patrol path flickers as it walks over: keep it
  beside the path when only a frozen enemy should hold it.
- A gate that needs a stronger spell or a buff (a ledge too high for the
  base jump, D68) should look like a gate: the player should recognise it
  and come back later, not think the room is unsolvable.

**Spells and backtracking** (D67)
- A room need not be fully solvable on first arrival: an exit or a pickup
  may wait for a spell or buff found later. Know which abilities each
  exit and pickup needs, and make sure the player can always leave the
  way he came with what he has.
- Later spells may open shortcuts or other solutions; that is intended,
  so don't block them without a reason.
- Temporary pickups come back with the room and death resets the wizard
  (D67): a refill a detour away is a choice for the player; place it so
  the trip is a real trade-off.

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

Six Grid sectors (D61): one core, four side sectors and one special sector,
the Outer Buffer, for secrets and optional rooms (D130). A biome sets the room color
(block edges, walls, floor grid), the name in the room banner and the
room's surroundings (`look`, D62); floor patterns, particles and the
signature effects in the table are planned, and gameplay effects wait for
Phase 7.

| Biome | Color | Floor | Particles | Signature |
|---|---|---|---|---|
| Home Lattice (core) | amber `#ffb020` | clean square grid | warm motes rising slowly | calm, steady glow |
| Glitchmire (heavy virtual, D122) | hot pink `#ff5fa8` | torn tiles, slightly offset | pixel bubbles popping up | edges jitter for a frame now and then |
| Frostbyte Wastes | ice blue `#9fd0ff` | hex crystal pattern | 0/1 flakes falling | soft, frosty bloom |
| Outer Buffer (special: secrets, D130; dark space, D122) | graphite `#7a8190` (to be picked again) | to be settled | a starfield | to be settled |
| Firewall Citadel | ember orange `#ff6a1f` | brick pattern | sparks rising | warm edge flicker |
| Phantom Partition (late sector; ghosts, D122, D130) | pale violet `#a98bff` (D99) | sparse dots under low glowing mist | to be settled | edges shimmer slowly through the hues |

Room colors keep clear of the colors objects and blocks carry (the color
rules, D99): danger red (hazards, spiked platforms), white (plates,
targets, locks), cyan (platforms), magenta (the wizard), neon green (crates);
void blocks are black mist and collapsing blocks take the room color.
`tests/colors.test.js` checks every biome against them: a hue gap of at
least 20° between saturated colors, and no near-white room color.
Phantom Partition moved from silver-white to pale violet so plates and
targets stand out in it; violet became free when void blocks turned
black.

Enemies by biome (D108): Home Lattice's are the default cyberspace four,
bug, virus, sentinel and cron, plus the peaceful glowbug (D121); they read
as the Grid's plain enemies and may show up anywhere. Every other biome
gets a roster of its own, at least three enemies, settled in Phase 6 one
biome at a time, each in a section of its own below (look, enemies,
signature trick, later effect).
Firewall Wardens are bosses for any biome, Home Lattice too (D122).

### The sectors at a glance (D122)

The high-level map the per-biome passes work within: each sector has a
theme, an enemy family and one mechanic no other sector has.

| Sector | Theme | Feel | Visual key | Enemy family | Later effect (Phase 7) |
|---|---|---|---|---|---|
| Home Lattice (settled, D121) | clean kernel city | safe, orderly | amber, grid, data flows | the plain Grid four, glowbug | none |
| Glitchmire | heavy virtual: raw virtual space, math made visible | abstract, unstable | hot pink, voxels, low-poly shapes, pixel noise | pixel and geometric monsters that split, morph and hop | low-res (pixelation) |
| Frostbyte Wastes | frozen storage | cold, slow, precise | ice blue, hex crystals, 0/1 flakes | things that slow and freeze | slippery ice |
| Outer Buffer | dark space beyond the Grid | lonely, dark, floating | near-black void, starfield, dim cool edges | space things that orbit, fall, pull | low gravity; darkness, a light round the wizard |
| Firewall Citadel | the fortress | armored, hot | ember orange, bricks, sparks | armored guards, burners, turrets | heat vents |
| Phantom Partition (late sector, D130) | ghosts: deleted data that lingers | eerie, quiet, misty | pale violet, low glowing mist over the floor | ghosts that phase, mirror, haunt | mist hides the low floor; blocks phase in and out |

Enemy ideas, to refine in each pass:
- **Glitchmire:** Voxel Swarm (splits in two when hit), Primitive
  (morphs cube to octahedron between patrol and attack), Null Pointer
  (dashes straight until a wall), Artifact (short pixel hops).
- **Frostbyte Wastes:** Cold Boot (a slow ice wall), Flurry (a flake swarm),
  Freezer (a bolt that slows the wizard), Icicle (drops when he passes
  under it).
- **Outer Buffer:** Satellite (orbits a point), Meteor (falls from above,
  its drop shadow warning), Gravity Well (stationary, pulls the wizard),
  Probe (sweeps a searchlight cone), Asteroid (a solid drifting
  platform), worm.
- **Firewall Citadel:** Proxy (a shield knight, hit from behind),
  Brickling (a wall brick that wakes up), Turret, crawler.
- **Phantom Partition:** Zombie Process
  (moves only while the wizard faces away), Echo (mirrors his moves),
  Poltergeist (shoves crates), Orphan (a peaceful ghost leading to a
  secret).

Dropped for now: deep-sea and nature sectors, Bitrot and Z-Fighter.

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
| Outer Buffer | dark gray, dim gray: the longest, a deep plain around the room | 9 | 0.4 | 1.7 |
| Firewall Citadel | dark ember, dim rust | 5 | 0.45 | 1.7 |
| Phantom Partition | black, faint gray: the room floats in nothing | 1.5 | 0.15 | 1.2 |

### Home Lattice (settled, D121)

The Grid's kernel: a clean, orderly, technical city. The hub at the
center of the world map; it holds the central core and opens onto the
four side sectors, and its rooms near the core double as the tutorial.
Every other biome is a twist on it.

- **Look:** amber `#ffb020`, the default surroundings. A clean square
  floor grid, every line whole and straight: the healthy version the
  other sectors corrupt. Warm motes rising slowly.
- **Data flows (5.10):** short bright dashes now and then run along
  the grid lines, on the room floor and on the surrounding grid outside
  it; random decoration, not a guide.
- **Glass panels (5.10):** random 1×1 glass panels set into the back
  walls (`glassBox()` with a `GLASS` preset, D116), framed in the room
  color, never over an exit; a new random set on every entry, since they
  are looks only. The data flows outside show through them: windows onto
  the city.
- **Decorations:** pillars with steady, evenly spaced data; screens with
  clean, friendly terminal text (help on a new spell or concept, never a
  room's solution, D163).
- **Enemies, in tiers:** the glowbug (peaceful, harmless, bouncy), life
  in the safe sector; the bug (hostile, patrols a fixed path, bouncy);
  virus, sentinel and cron, all hostile (the cron fires four ways). Both
  bugs can be jumped on. The hostile ones are cool colors against the
  warm rooms (mint, violet, sky blue) or the cron's red-pink; the glowbug
  is a pale gold close to the grid, part of the city.
- **Signature trick:** none, the Lattice is the reference. A core
  heartbeat (the room glowing up faintly every few seconds) is to be
  discussed in the visual pass (5.10).
- **Later effect:** none, the safe sector.

## HUD

A DOM overlay on the stage, sized in 1080p pixels (`--u`), all text from
`data/strings.json` (D34).

| Where | What |
|---|---|
| Top left | Integrity: label over a row of slanted cyan cells, one per point; a lost cell flashes white and empties, at 2 or less the bar turns magenta and blinks. Under it the backup pips, the energy bar and the spell tag (with the clipboard slot for Cut & Paste). |
| Top center | A room's watchdog timer (D172), over the banner: `WATCHDOG 0:24.5` in cyan, red and pulsing in its last 5 s, lime once stopped; under the boss bar while that is up. Banner: a title decoding from glyphs (0.45 s), holding (1.8 s) and fading (0.7 s), with an optional smaller line below, in its own color. On entering a room (not on respawn) it shows the room name and the biome name in the biome color; later pickups (e.g. a spell installed) use it too. A new banner replaces the one showing. |
| Top right | Game name and version; the score and completion (D100) and, once he has a fragment or a level, `FRAGMENTS 03/64 ACCESS 1` in gold over the boot key, the 8×8 code filling in as fragments are found (D101); the debug readout (F3) shows below it. |
| Whole stage | The end-of-game screen (D101): `GRID REBOOTED`, the whole boot key, the final score and completion; the game stands still until Enter. |
| Bottom left | Terminal: lime lines typed at 40 characters/s with a block cursor, kept 4 s, then faded; at most 4 lines. |
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
- `K` finds the next 8 fragments not found yet (`Game.debugGrantFragments()`),
  to try access levels without walking the world; the core still has
  to be touched to raise the level.
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
| 1–9, 0 | Tool: Block, Hole, Object, Enemy, Path, Exit, Spawn, Reset, Shrine, Switch |
| Alt + left click | Block tool: take the type and switches of the block clicked (an eyedropper, D142) |
| Esc | Drop the picked enemy, platform or exit |
| Delete, Backspace | Remove the picked object, enemy or exit |
| Ctrl+Z, Ctrl+Y (Ctrl+Shift+Z) | Undo, redo |
| Ctrl+S | Save (dev server) / export (build), from a panel field too |

A click hits what is seen (`src/editor/pick.js`): with the Block, Object,
Enemy and Switch tools, a block, object, enemy or pickup drawn on the
current layer (or above it, with **hide above** off) is hit through its
top or side, so a click on the top of a crate is the crate, never the
floor cell behind it. A plate is thin, a decoration as tall as its look.
Things below the layer never win: the ray meets the layer first, so a
click on the top of a block one layer down is the free cell above it, on
this layer. Elsewhere a click is the layer's cell under the mouse. The
Path tool hits objects and enemies only (its points go on the layer);
the Exit, Spawn and Reset tools work on the layer, Hole and Shrine on the
floor.

- **Block** puts a block of the type picked in the panel's type list (every
  block type in `defs.json`, in groups: Static, Switch gates, Collapsing
  (step) gates (D144), each with what it does: `hazard (hurts 1)`,
  `collapsing_regrow (collapses, back in 3 s)`, `bridge (gone, there
  while powered)`) in the cell clicked (see above), replacing whatever is
  there; erasing empties the cell (D60). For a switch gate the panel has
  a **Switches** field: the ids the gates placed take (blank: every
  switch). Cells merge into boxes only with the same type and switches.
- **Hole** works on floor tiles, whatever the layer: place makes a hole,
  erase fills it in.
- **Object** places the type picked in the panel (its fields show only
  while this tool is picked; switches are not in its list, the Switch
  tool places them), with the id `<type>_<n>`, only in a free cell: it
  never overwrites (D142). A click on an object, enemy or pickup picks it
  (a decoration of the type picked turns to face the other seen side when
  clicked again, D117); a block or something of another type there says
  to erase it first. A new platform is picked, ready for its path. A
  picked platform shows its **Switches** field, a picked switch what it
  powers and, a timed one, its **Timer** (blank: its type's). Its type
  list is in groups (D146): Crates, Platforms, Decorations, Core, then
  the pickups: Spells, Upgrades, Buffs, Refills, Fragments, Secrets,
  Test; each type says what it does (`crate_cross (breaks after 1 hit)`,
  `buff_energy_2 (+10 energy)`), and a permanent pickup where it lies in
  the world, unsaved edits included (`fragment_3 (slot 3 · not placed)`,
  `disk_zap (spell zap · in room_1)`, `in a ×2` placed twice), like the
  world map's pickup report (F3).
  Erasing removes an object or enemy standing in the cell.
- **Enemy** places an enemy of the template picked in the panel (a line
  under it says what the template does: `bug · patrol · touch · hostile
  · 2 hits · speed 3 · bouncy`), id `<template>_<n>`, and picks it. A
  click on an enemy picks it: a template picked then is its new one, and
  new enemies get the same. A patrolling enemy needs a path (the panel
  says so), a chaser may have one; a stationary template drops the path.
  Changing the template of an enemy with an id the editor made renames it
  (`bug_1` becomes `virus_1`); ids written by hand stay. The room
  editor doesn't change templates (D119): they are tuned in the monster
  editor ("Edit in the monster editor" opens the picked template there,
  dev server only). Templates it saves are taken in at once, and so are
  rooms saved by another page that have no unsaved edits here (D120).
- **Path** works on a picked platform or enemy (click it). Each click on a
  cell adds a point, with corners added so every leg runs along one axis
  (x, then z, then y); an enemy's points stay at its own height, a
  platform's may change layer (a lift); a stationary enemy takes no
  points (give it a patrolling template first). Right click takes the last
  point off. The panel sets the mode (there and back, or loop), the speed
  (platforms only: an enemy walks at its template's) and the pause at the
  ends, or clears the path. Every path shows as a dashed line; the
  picked one is white, with its points marked.
- **Switch** (D142) places switches and links them to what they power,
  from either side (logic in `src/editor/switch-tool.js`). Its panel
  lists the switch types (targets, plates, timed ones).
  - With nothing picked, a click on a free cell places a switch of the
    type picked there and picks it; a click on a switch, a switch gate, a
    platform or an exit picks it. A right click on a switch erases it,
    elsewhere drops the pick (so does Esc).
  - A picked switch: the panel ticks everything it can power (every exit,
    gate and platform; a timed switch's timer can be changed). A picked
    gate, platform or exit: the panel ticks the room's switches, a gate
    or exit also "every switch in the room" (no list; unticked, the list
    names them all, ready to untick some). Hovering a row lights that
    link up in the room.
  - In the room, with a switch picked a click on a gate, platform or exit
    links or unlinks it; with one of those picked, a click on a switch
    does. With something picked a click never places a switch, and picks
    another thing only with Shift.
  - Before a click, the hover line says what it will do (`click: link
    gate ×4 at 5,0,6 to timer_plate`) and the cursor's color says it too:
    white place, cyan pick, green link, red unlink, gray nothing.
  - A gate is the whole gate: every cell joined to it with the same type
    and switches (a wall). A click on a gate or exit on every switch (no
    list) links it to just the picked switch; an exit linked to its first
    switch becomes locked, one with its last switch unlinked is no longer
    locked; a gate with its last unlinked is on every switch again; a
    platform with none always runs.
  Deleting a switch unlinks it the same way from everything it powered.
  A gate's switch ids are kept sorted, so the same switches in any order
  merge into one box.
- **Links show everywhere** (D142): hovering a switch, a switch gate, a
  platform with switches or a locked exit names its links in the hover
  line (`powers gate ×4, exit east`, `opens on timer_plate`) and draws
  them over the room: gold boxes round the switches and what they power,
  dashed lines between. With nothing hovered, the picked thing's links
  show. In the editor a switched-off gate shows as a dashed outline; in
  play it is not drawn at all.
- **Exit** opens an exit in the edge cell clicked (in a corner, in the
  wall nearer the mouse), at the layer's height, with the panel's width
  and height, id after the side (`north`, `east_2`...). A click on an exit
  picks it: id, position along its side, floor level (y), width, height
  and **Leads to** (the exits of other rooms in the opposite side,
  equally wide and not connected yet); a change that would overlap
  another exit is refused. A new width goes to the exit it leads to as
  well (an undo step of that room), moving either back to stay within its
  side. **Locked** makes it a locked exit (D75). Right click removes an exit and its connection. An exit must be connected before
  the room plays or saves.
- **Spawn, Reset** put the start or respawn point in the middle of the
  cell, standing on the layer; erasing with Reset removes the reset point
  (it falls back to spawn). Both show as dashed boxes of the wizard's size
  (spawn cyan, reset magenta).
- **Shrine** puts the room's backup shrine (D97) on the floor tile under
  the mouse, whatever the layer, moving it if there is one; right click
  removes it.
- The panel, from the top, picks the room (or makes a new one: an id,
  then New; it starts empty, 12x4x12, in the current biome), sets the
  room's name, biome and size (applied on Enter or leaving the field; 2–6
  high, width + depth at most 32; a smaller room drops what ends up
  outside, listed in the status line, and moves spawn and reset inside),
  its watchdog timer (**Timer (s)**: whole seconds 3–600, blank for none,
  D172) and the layer, and has Undo, Redo, Save or Export, and Revert (back to
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
- **Sending the rooms in:** `tools\map-pr.bat ["what changed"]` (Windows)
  puts only `data/rooms/`, `data/world.json` (connections, and room
  positions from the world map tool), `data/defs.json` (enemy
  templates) and `data/lore.json` (screen texts, D118) on a new branch, room and map changes in one PR,
  `feat/map-<date>` from `origin/main` (after `npm run validate:data`),
  commits, pushes and opens the PR with the GitHub CLI, or prints a
  compare link without it. Other uncommitted changes stay uncommitted; you
  stay on the new branch.

## World map tool

The whole world on one page for the developer (D66, D70):
`/tools/world-map.html` in the dev server. It is not part of the build, so
players never see it (D67).

- **Map:** every room is a node in its biome color on a simple grid, one
  room per cell, at its `positions` entry in `world.json` (`[x, z]`: +x
  east, +z south, as in a room). A node shows the room's name, id and
  size; the start room has a dashed lime frame and `START`.
- **Connections:** a line joins two connected exits, leaving each node
  from the side its exit is on, as far along it as the exit is along the
  room's side. Solid when the rooms are neighbours that way round on the
  map (east exit, room one cell east), dashed when the connection runs
  across the map (shortcuts, loops).
- **Tools** (D77), picked in the panel or with keys 1–4:
  - **Move:** drag a room to a free cell (dropping it on another room
    does nothing); a click opens it (below).
  - **Add:** click a free cell for a new, empty room (12×4×12, no exits);
    its id (a free `room_N` if left empty) and biome are set in the panel.
  - **Connect:** drag from one room to another, or click one then the
    other (Esc cancels). Each gets a 2-wide floor-level exit in the wall
    facing the other on the map (x wall for diagonal neighbours), in the
    middle of the wall, or the nearest spot that is free of other exits
    and passes the room's checks. Fine-tune it in the room editor.
  - **Delete:** click a room to remove it with the exits into it (not the
    start room), a connection to remove it and both its exits, or an
    exit's mark on a room edge (D102): a connected exit goes with its
    partner, a loose one alone.
- **Exits** show as marks on the room edges, where they are along the
  side: cyan when connected, magenta when loose (not connected: a data
  error, e.g. made by hand). Connect uses a 2-wide loose exit already in
  the facing wall (the middle-most) before making a new one.
- **Saving:** rooms with unsaved changes show a lime dot; the Save button
  says what it would send. **Save** (or Ctrl+S) sends the moved rooms'
  positions, the new and changed room files, the removed rooms' ids and,
  if the connections changed, `world.json`; the dev server merges the
  positions into `world.json` as it is on disk, checks everything and
  writes it all or nothing (removed room files are deleted). **Undo**
  (or Ctrl+Z) undoes the last edit; with nothing left to undo it becomes
  **Undo last save** (D103): what the last save changed or deleted comes
  back as unsaved changes (Save writes it). It survives the reload a
  saved new or deleted room causes, and is dropped when another page
  (the room editor) saves. A room file with no position yet gets a free cell
  next to the start, saved with the next save.
- **Opening a room:** click it: the game opens in one reused tab at
  `/?room=<id>&edit`, in the room editor on that room (F2 plays it). The
  game takes `?room` and `?edit` in the dev server only.
- **Checks:** the side panel lists the data errors, the rooms the start
  can't reach through exits, and test rooms more than two rooms from the
  start (D49; authored rooms, D90, are marked and not flagged).
  Click a warning to highlight its room.
- **Pickup report** (F3 or the panel's button; F3 or Esc closes it):
  over the map, every permanent item defined in `defs.json` by its save
  bit, in the save blocks (spells, buffs, upgrades, fragments, with how
  many of each block's bits are defined), with the rooms and cells it
  lies in. An item not placed yet or placed more than once is flagged
  amber: a duplicate is allowed (a bit is the item, not the place, D71)
  but worth a look. Refills are listed by type with their places, and
  pickups of an unknown type as errors. It reads the rooms as edited
  (`pickupReport()`, `src/world/pickup-report.js`); clicking a place
  closes the report and highlights that room.
- **New rooms** made in the room editor get the free cell nearest to the
  room they were made from (east, south, west, north first, then further
  out), to be moved on the map afterwards. The room editor never moves
  existing rooms: when it saves `world.json`, the positions on disk win
  over its copy, so a move saved from the map meanwhile stays.
- **Live data:** when another page saves (the room editor), the map
  reloads to show it; with changes not saved yet, it says so instead.
- **Sending it in:** `tools\map-pr.bat` opens one PR with the saved map
  and room changes (see Room editor).

## Monster editor

The enemy templates in `defs.json` (D119, D120): an enemy is all its
template, so this is where enemies are tuned. `/tools/monster-editor.html`
in the dev server (`#bug` picks a template); `tools\dev.bat monsters` or
`tools\monster-editor.bat` opens it. Not part of the build.

- **List** (left): every template with its color, what it builds on and
  how many enemies use it (`on bug · 3×`). A name + **Variant** adds a
  template built on the picked one, with only a color of its own;
  **Copy** adds one with all its values and no base. A new one gets a
  bright color as far as can be found from the other templates and from
  the colors with a meaning (the wizard's magenta, danger red, lime,
  cyan; `freeColor()` in `src/data/colors.js`). **Rename** gives the
  picked one the name: the templates built on it and the enemies of it,
  in every room, follow. **Delete** removes one no enemy uses and no
  template builds on.
- **Form** (right): every field in groups (body, moves, notices, attack,
  takes), made from `defs.schema.json`: lists for its choices, number
  fields with its limits, a color field with a picker; the field's
  description shows below when the mouse is on it. Next to each: where
  the value comes from (`own`, `from bug`, `default`, or `missing` in
  red), and × to clear an own value so it comes from the base again.
  **Builds on** changes the base without changing what the template does
  (values the new base has too are dropped; with no base, every value is
  written down).
- **Preview** (middle): an enemy of the template with the game's models,
  facing the wizard, in a 6 s loop: calm for 3 s (walking at its speed
  unless stationary), then after him (a provoked one as if hit): the
  "!", its chase speed, and a charged attack charging and firing (burst,
  arc, or bolts aimed or four ways). A peaceful one stays calm.
- **Checks:** the game's validation of the data with the edits in, and
  templates too alike in color (D119), listed under the actions.
- **Undo, redo, save:** Ctrl+Z / Ctrl+Y / Ctrl+S too. Save sends
  `defs.json` and the rooms a rename changed; the dev server checks it
  all first. When another page saves, the editor reloads to show it; with
  edits not saved yet, it says so instead.

---

## Phases and steps

Phases 1–4 are done (v0.1.0 to v0.4.0); what each delivered is in
[CHANGELOG.md](../CHANGELOG.md), why in the decisions it names. The
phases were re-cut around a playtest of Home Lattice (D130).

Each step is one branch and one PR against `main` (no stacked PRs); the
game runs after every step and CI is green before a PR is called ready. A
step starts by settling its open questions with the author, recorded as
decisions before the code lands. Every step also (D43):
- adds its new looks to the asset showcase (`tools/showcase.js`);
- adds or extends a dev room for a new mechanic (see Dev rooms);
- adds unit tests for the logic (fixtures in `tests/helpers.js`) and the
  room editor palette and validation for any new type;
- updates `docs/design.md`, `docs/architecture.md` and CHANGELOG, and
  records new decisions.

**Next: Phase 5, step 5.8** (5.3 music waits for the author's tracks).

### Phase 5 (v0.5) steps: Home Lattice playtest

Done: 5.1 audio engine (D138), 5.2 sound effects (D139), 5.4 dev wing
(D147), 5.5 tutorial (D148), 5.6a–h the Atrium and the four wings
(D151, D156–D173), 5.7 the Gatekeeper's hall (D174). The Lattice steps are two or three rooms each, the hub
before the wings (D149); every batch goes through the reachability
checker and the review subagent; rooms are drafted unflagged and the
author flags them authored (D90). Room plan: [lattice-plan.md](lattice-plan.md).

| # | Branch | Delivers |
|---|---|---|
| 5.3 | `feat/music` | The author's tracks trimmed for seamless loops: Lattice, boss, title; room and biome mapping, a boss switch and a crossfade back. |
| 5.8 | `feat/lattice-core-gates` | The core (east of the Gatekeeper, its door kept free, D174), the Level 1 access locks and the teaser rooms beyond them: a few look-only rooms each for Glitchmire and Frostbyte Wastes (looks in the showcase first). |
| 5.9 | `feat/outer-buffer-secrets` | The Outer Buffer look (floor, starfield, color re-picked) and the secret cluster: complex multi-step rooms, often with tools found later (D173). |
| 5.10 | `feat/lattice-visual-pass` | Optional: the Lattice's data flows and glass panels (D121). |
| 5.11 | `feat/quality-presets` | Quality presets, auto fallback and render scale wired up (D76), a check on a weaker GPU. |
| 5.12 | `feat/onboarding-feedback` | The first minute from title to the first disk, the controls screen, the pause entry that copies debug info (version, room, key) for feedback. |
| 5.13 | `chore/balance-pass` | Difficulty, energy, backups and shrines across the Lattice from full playthroughs. |
| 5.14 | `chore/release-0.5.0` | Docs pass, tag `v0.5.0`, the GitHub Release: **Playtest 1**. |

### Phase 6 (v0.6) steps: the other sectors

Planned after the playtest and reshaped by its feedback; one biome per
step (roster, look, rooms, its own mechanic of D122).

| # | Branch | Delivers |
|---|---|---|
| 6.1 | `feat/playtest-fixes` | What Playtest 1 found. |
| 6.2 | `feat/glitchmire` | The biome concept and roster (at least three enemies), its looks, rooms. |
| 6.3 | `feat/frostbyte` | The same for Frostbyte Wastes. |
| 6.4 | `feat/firewall-citadel` | The same for Firewall Citadel. |
| 6.5 | `feat/phantom-partition` | The same for Phantom Partition. |
| 6.6 | `chore/release-0.6.0` | Release. |

### Phase 7 steps: polish, then 1.0.0

Juice and post-processing pass, fullscreen, gamepad, key rebinding,
biome environmental effects (Glitchmire low-res, Frostbyte ice, Outer
Buffer low gravity and darkness) with health pickups and safe rooms, the
real ending; split into steps when Phase 6 nears its end.

## Title screen and pause menu

`src/ui/menus.js` (the logic, tested) and `src/ui/menu-screen.js` (the
view), D109. The game opens on the title screen: the logo over the start
room's empty shape (`RoomScene.showShape()`: floor grid and back walls in
its biome's look, no blocks, holes, exits, objects or wizard), dimmed
well down, with **Continue** (only with a save stored), **Start**,
**Enter key**, **Options** and **Controls**. Esc or P in the game, or the
window losing focus, opens the pause menu: **Resume**, **Save**, **Copy
key**, **Copy link**, **Options**, **Controls**, **Quit to title** (see
Saving and loading). Quitting asks first (*Keep playing* is selected),
then starts a new game behind the title (the empty shape again); what was
found since the last save is lost (D105). Menus stack: Options (and its
Visuals), Controls, Enter key and the quit question open over the menu,
and Esc or P closes the top one (the pause menu itself: back to the
game).

**Options** (`src/ui/settings.js`): **Music** and **Sound** volume
as a bar of ten cells (0–10, default 7), and **Visuals**: **Quality**
(Auto, Low, Medium, High), **Render scale** (50–100 %), **Screen effects**
(On, Off). ◄ ► (or A D, or a click on the arrows) adjust the selected
one, Enter steps it on and round. They are kept in localStorage
(`neonmancer.settings`, apart from the access key). The volumes drive
the audio engine (D138); the visuals wait for the quality presets (5.11).

**Start** plays the boot sequence (D110, `src/render/boot-fx.js`, 2.6 s):
the logo scrambles and glitches out; the room compiles tile by tile along
its own grid, 2×2-cell tiles clearing in a shuffled wave from the back
corner forward, each floor outline flashing cyan, while the terminal
types `> LOADING SECTOR` (`src/ui/boot-screen.js`, a canvas over the
game); the world round the room fades in last; the wizard pops in out of gathering pixels (the derez backwards),
flashing white and landing with a squash; then the room's banner and the
boot messages. The game holds until he lands; Enter, Space, Esc or P skip
the rest.
The tick that closes a menu does not run the game, so Enter or Space
there never jumps. Behind a menu the game, its animations and the
terminal stand still. Dev links from the world map tool (`?room`,
`?edit`) start in the game, without the boot sequence (and ignore a key
in the hash).

## Saving and loading

D105, D106, D111. `src/world/save-game.js` turns a Game into an access key and
a key into `Game.reset()` options (tested); `src/ui/saves.js` keeps keys
in the browser; `src/main.js` wires them to the menus.

- **Save** (pause menu) writes the key of the game as it is: his room's
  map cell, access level, the permanent pickups found and the backups
  left (D106). It goes into the URL hash
  (`history.replaceState`: no reload, no history entry) and localStorage
  (`neonmancer.save`, apart from the settings). The notice says to
  bookmark the page or copy the key, and the pause menu shows the key
  from then on, selectable by hand.
- **Copy key** and **Copy link** copy that key, or the page's address
  with it as the hash; before a save they say to save first. Where the
  browser refuses the Clipboard API an old copy command is tried; if that
  fails too, the notice says to select the key by hand.
- **A link with a key** (`…/#E907D4-41B4A7-…`) loads it at start, straight
  into the boot sequence in the saved room; an invalid one opens the
  title with a message. A hash changed by hand while the page is open
  reloads it.
- **Continue** (title, only with a save stored in this browser) loads the
  last save; **Enter key** opens a text field (typing or pasting; the
  game's keys leave it alone; Enter loads, Esc goes back). A refused key
  says why (`key.error.*` in `strings.json`: empty, length, character,
  checksum, version).
- **A load** starts the game over in the saved room, reset, with the
  key's pickups, access level and backups, full integrity and energy and
  an empty clipboard; the terminal greets him back. The key goes into the
  hash, not into localStorage: only Save stores. A key whose map cell has
  no room any more (moved or deleted) loads in the start room. The
  Grid-rebooted flag is not saved, so the core may play the reboot again.

## Access keys

`src/world/save-key.js` (D106). A key holds what the wizard has, never the
state of a room or the map (D68):

| Bits | Field | |
|---|---|---|
| 0–3 | Format version | `SAVE_KEY_VERSION` in `src/core/version.js`; a key of another version is refused |
| 4–11 | Room cell x | The saved room's cell in `world.json` `positions`, signed (−128–127) |
| 12–19 | Room cell z | Likewise |
| 20–27 | Access level | 0–15 used (D91) |
| 28–155 | Pickups | Save bit n at 28 + n (D71): spells 28–43, buffs 44–59, upgrades 60–75, fragments 76–139, secrets 140–155 |
| 156–159 | Backups | Backups left (D97), 0–15 |
| 160–175 | Checksum | CRC-16/CCITT-FALSE of bits 0–159 |

Bits 0–159 are XORed with a stream seeded by the checksum, then all 176
bits move by a fixed shuffle (seeded, never changed: old keys depend on
it), so no field sits at a fixed digit and one more pickup changes most
of the key. The key is 44 hex digits in groups of 4
(`2DE0-279E-AE79-...`). The room is its map cell, so moving a room on the
world map breaks keys saved in it. Reading forgives spaces, dashes,
lowercase, a leading `#`, O for 0 and I or L for 1, and names why it
refuses a key: `empty`, `length`, `character`, `checksum` or `version`.
Tests cover round trips, every single wrong digit and every swap of two
neighbours.

## Data formats

The schemas in `schemas/` are the reference; this is an overview. Every file
has `"schemaVersion": 1` and a `"$schema"` link for editor support.

| File | Contents |
|---|---|
| `data/rooms/<id>.json` | One room (id = file name) |
| `data/defs.json` | `objects`: object types and their defaults (crates, platforms, switches, the core); a variant `extend`s a base type and lists only what it changes, one level, keeping its kind (D145, e.g. `target_timed`: `{ "extends": "target", "timer": 5 }`); `enemies`: enemy templates, each complete or `extend`ing another (D58, D79); `spells`: tuning and color per spell; `pickups`: disks, buff chips, upgrade cards, fragments, secrets and refills; `blocks`: block types (D60); `score`: points per kind of pickup (D100). Each is described in its section above. |
| `data/biomes.json` | Biome name and room color, optional `look` for the surroundings (see Biomes) |
| `data/world.json` | Start room, exit connections, every room's cell on the world map (`positions`, D66), the dev wing (`dev`, D147) and the key fragments (`fragments`: how many the core needs, the access thresholds, D101) |
| `data/lore.json` | Screen texts by id (D118) |
| `data/audio.json` | Named sounds and music (D138) |
| `data/strings.json` | Every UI text by dotted key (`hud.integrity`, `msg.die`); `{name}` marks a value the game fills in; the schema lists the keys the game uses |

Example room:

```json
{
  "$schema": "../../schemas/room.schema.json",
  "schemaVersion": 1,
  "id": "example",
  "name": "Example",
  "biome": "home_lattice",
  "size": [12, 4, 12],
  "spawn": [2.5, 0, 5.5],
  "exits": [
    { "id": "west", "side": "-x", "at": 5 },
    { "id": "north", "side": "-z", "at": 3, "width": 3, "y": 1, "requires": [{ "switch": "*" }] }
  ],
  "blocks": [
    { "at": [0, 0, 0], "to": [2, 0, 3] },
    { "at": [3, 0, 0], "to": [5, 0, 0], "type": "hazard" }
  ],
  "holes": [{ "at": [8, 8], "to": [9, 8] }],
  "shrine": [6, 9],
  "objects": [
    { "id": "crate_1", "type": "crate", "at": [6, 0, 6] },
    { "id": "plate_1", "type": "plate", "at": [7, 0, 2] }
  ],
  "enemies": [{ "id": "bug_1", "template": "bug", "at": [9, 0, 3], "path": { "points": [[9, 0, 6]] } }],
  "pickups": [{ "id": "refill_1", "type": "refill_energy", "at": [10, 0, 10] }]
}
```

- `spawn` — player feet center; where the game starts if this is the start room.
- `reset` — player feet center; where he reappears after dying in this room,
  however he entered it (D39). Optional, defaults to `spawn`.
- `authored` — the author's real game room (D90); development steps never
  touch it.
- `exits` — `side` is `-x`, `+x`, `-z` or `+z`; `at` is the first cell along
  that side; `width` (default 2), `y` floor level (default 0), `height`
  (default 2); `requires`, the conditions that open it (D175):
  `{ "switch": id }`, `{ "switch": "*" }` (every switch in the room),
  `{ "access": level }`; `hidden` (D128).
- `blocks` — anonymous static geometry; `to` fills a box (inclusive);
  `type` is a block type from `defs.json` `blocks` (default `block`); a
  switch gate's entry may name its `switches` (D141).
- `holes` — floor tiles `[x, z]` that are pits; `to` fills a rectangle.
- `shrine` — the backup shrine's floor tile (D97).
- `objects` — typed things with stable ids; `overrides` replace type
  defaults. Platforms also take a `path`:
  `{ "points": [[6, 0, 1]], "mode": "pingpong", "speed": 2, "pause": 0.8 }`.
  Platforms take `switches`, the ids of the switches that run them (D140).
- `enemies` — `{ "id", "template", "at", "path" }` (see Enemies); an enemy's path has no `speed` (D119).
- `pickups` — `{ "id", "type", "at" }` (see Pickups and progress).
  Ids are unique among objects, enemies and pickups.
- Object type style (D17): `edges` `solid`/`dashed`, `mark`
  `none`/`inset`/`cross`/`brackets`/`bits`, `faces`
  `dark`/`tinted`/`hazard`/`glass`, `shape` `cube`/`spiked` (defaults
  first), `tint` 0–1 (color share of a tinted top face, default 0.1).
  Objects may override them.
- `world.json` pairs exits: `"connections": [["boot_up.east", "first_steps.west"]]`.
  Paired exits are on opposite sides and equally wide; every exit is connected.
  `"positions": { "boot_up": [5, 0] }` places every room on the world
  map, one room per cell (`[x, z]`, +x east, +z south; map neighbours need
  not be connected, D66).
