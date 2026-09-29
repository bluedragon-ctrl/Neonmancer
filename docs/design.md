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
| Pause (Phase 4) | Esc / P |
| Map (Phase 4) | M |
| Switch movement mode | G |
| Debug mode | F3 |
| Room editor | F2 (see Room editor) |
| Fullscreen | F |
| Close the end-of-game screen | Enter |

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

### Damage

Integrity (health) is 8, 12 with every buff (at most 15, the save key's
4 bits); it carries over between rooms and is full again after a respawn
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
  a burst of cyan and magenta pixels drifts up out of him (placeholder
  until the Phase 5 juice pass), then recompiles at the room's reset point
  after about 1.1 s, like a hole death (cause `hole`, dropping into the pit)
  or a void death. Each cause prints its own terminal line, and each death
  uses a backup (below).
- Nothing hurts a dead wizard; debug invincibility blocks all damage.
- Tuning: `invulnerableTicks` and `deathTicks` in `PLAYER`; the look is
  `HIT_FX` in `src/render/hit-fx.js`, shown looping in the asset showcase
  (`/tools/showcase.html?asset=wizard-hit`).

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
| `collapsing` | kind `collapsing`, room color, dashed edges, faces barely tinted (D98, D99) | gives way (see Collapsing blocks) |
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

## Collapsing blocks

Block types with `kind: collapsing` (D47, D60): painted in rooms like any
block (a box of them is one entry), each cell runs as its own room object
(D40), a 1×1×1 block in the room color (D99), with thin dashed edges and
barely tinted faces, that gives way under the wizard.

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
comes from data: its template in `defs.json` `enemies` (D79), and the
room's `overrides` for that one enemy. A template without `extends` sets
every required value below; one with `extends` builds on another template
(and so on down the chain) and sets only what it changes.
Enemies are universal (D78): a look, a
movement, an attack and a color, and any of them combine (a bug can chase
and burst; a virus can patrol).

| Field | Values | Meaning |
|---|---|---|
| `look` | `bug`, `virus`, `sentinel`, `cron`, `worm`, `crawler` | its body (below). A template takes its base's. |
| `movement` | `patrol`, `stationary`, `chase` | patrol walks the enemy's `path` (required); stationary stays in its cell (no path); chase goes after the wizard (below), walking its `path` while calm if it has one. |
| `attack` | `touch`, `burst`, `arc`, `bolt`, `none` | touch: touching it hurts while it is hostile; burst, arc and bolt: charged attacks (below): lightning all round it, a lightning bolt aimed at the wizard, or a slow shot at him (D80); touching it doesn't hurt. |
| `hostility` | `hostile`, `peaceful`, `provoked` | hostile attacks; peaceful never does; provoked is peaceful until a spell (Zap), a discharge or a bolt hits it, then hostile. |
| `aggroRange` | units (default 0) | how far a hostile enemy notices the wizard, with nothing solid in between (a "!" pops up); a chaser goes after him, a charged attack fires at him. 0: it never notices him (a chaser must have one). |
| `integrity` | 1–15 | how much spell damage it takes before it pops (bug: 2, so two Zaps). |
| `damage` | ≥ 1 | integrity the wizard loses per attack. |
| `speed` | units/s | walking speed; a path's own `speed` overrides it. |
| `chaseSpeed` | units/s (default: `speed`) | speed while chasing or searching. |
| `memory` | seconds (default 1.5) | how long a chaser searches where it lost him. |
| `bounce` | true / false (default false; bug: true) | trampoline top (below). |
| `solid` | true / false (default false) | blocks the wizard, carries him and shoves him (below). |
| `pausable` | true / false (default true) | Pause freezes it (D85); false: the spell's bolt stops at it and does nothing (for guardians). |
| `color` | #rrggbb | body color; the eyes always show hostility, so a room can recolor one enemy with `overrides` without a new template. |
| `attackRange` | units (default 1.2) | burst or arc reach, from its eyes to the nearest point of the wizard; for a bolt, how near he must be; `aggroRange` must be at least this. |
| `attackCharge` | seconds (default 0.4) | the warning before it fires. |
| `attackCooldown` | seconds (default 1.5) | the wait after firing. |
| `attackColor` | #rrggbb (default: `color`) | lightning or bolt color. |
| `boltSpeed` | units/s (default 4) | how fast a bolt flies (slow enough to dodge). |
| `boltPattern` | `aimed`, `cross` (default `aimed`) | a bolt attack's shots: one at the wizard, or four level ones along the grid axes (a tower, D81). |
| `boltBounces` | 0–8 (default 0) | how often a bolt glances off walls and objects before they stop it (D81). |

| Type | Look | Moves | Attack |
|---|---|---|---|
| `bug` | mint-green ball `#2bff88`, hops, bouncy | patrol, 3 cells/s | touch, 1 |
| `virus` | yellow sharp cube `#ffe23a`, glides | chase: aggro 5, 2 cells/s calm, 3.5 chasing | burst, range 1.2, charge 0.4 s, cooldown 1.5 s; integrity 2 |
| `sentinel` | orange sharp octahedron `#ff8a1a`, glides | chase: aggro 7, 1.5 calm, 2.5 chasing; stops 5 away | arc, range 5, charge 0.7 s, cooldown 2 s; integrity 3 |
| `worm` | blue worm `#4f7dff`, inches along | patrol, 2 cells/s | touch, 1; integrity 2 (D83) |
| `crawler` | mint six-legged spider `#3dffd0`, walks | chase: aggro 5, 2 cells/s calm, 3.5 chasing | touch, 1; integrity 2 (D83) |
| `shooter` | a bug (extends `bug`) | stationary | bolt at 4 units/s, range 6 (aggro 6), charge 0.6 s, cooldown 2 s (D80) |
| `tower` | rose cron `#ff4f7a` (extends `sentinel`, D83) | stationary | bolts four ways (`cross`) at 3.5 units/s, range 5 (aggro 5), charge 0.6 s, cooldown 1.8 s (D81) |
| `ricochet` | a virus (extends `virus`) | chase: aggro 6, stops 5 away | a bolt bouncing twice, 5 units/s, charge 0.6 s, cooldown 2.2 s (D81) |

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
- **Spell hits:** a Zap takes `damage` (1) of its integrity and provokes
  it; the last point pops it into pixels. Any enemy can be hit, peaceful
  ones too (they stay peaceful). A hit flashes it white, then cyan, with a
  recoil squash; while damaged it glitches every ~0.8 s (a small sideways
  jump and a faint flash).
- Validation: known type, valid overrides, a free cell of its own not over
  a hole nor on a lethal block, ids unique among objects and enemies, a
  patrol has a level path clear of static blocks (so does a chaser's, if
  it has one), a stationary enemy has none; a chaser has an `aggroRange`;
  a charged attack's `aggroRange` reaches its `attackRange`, and no
  peaceful enemy has one (D80).
- Tuning: `ENEMY` in `src/entities/enemy.js`, `BOLT` in
  `src/entities/bolt.js`, `PLAYER.bounceHeight`; the looks are `BUG` in
  `src/render/bug.js`, `VIRUS` in `src/render/virus.js`, `SENTINEL` in
  `src/render/sentinel.js`, `CRON`, `WORM` and `CRAWLER` in
  `src/render/cron.js`, `worm.js` and `crawler.js` (what they share, mood colors, eyes and the
  pop, in `src/render/enemy-look.js`), the lightning `DISCHARGE` in
  `src/render/discharge.js`; review in the asset showcase
  (`/tools/showcase.html?asset=bugs,viruses,sentinels,crons,worms,crawlers`;
  the bolt: `bug-bolt`, `?asset=bolts` for the tower and the ricochet).

## Pickups and progress

Things the wizard takes by touching them (D71). Types live in
`defs.json` `pickups`, placed in rooms as `"pickups": [{ "id", "type",
"at" }]` (a cell; they hover in its middle, ids shared with objects and
enemies).

- **Permanent: data disks.** A disk teaches a spell for good. The wizard
  starts with no spell; the Zap disk lies in Boot Sector, two steps from
  the spawn. Taking it shows the banner `ZAP / SPELL INSTALLED`, the
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
  Cut & Paste white `#f4f6ff`):
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
- **Look:** a data disk is an abstract white slab with both top corners
  clipped, hovering half a block up, spinning (a turn every ~4 s) and
  bobbing; both faces carry a 4×4 bit grid of dark gray squares whose
  one lit cube (brighter for darker colors, D74), in the
  spell's color, is the spell's slot (row by row from the top left). The
  integrity refill is a cyan plus of five voxels, the energy refill a lime
  crystal (the HUD bars' colors), smaller and lower than a disk. Taking
  one lifts it, spins it up and flashes it white (10 ticks), then bursts it
  into pixels in its colors. Tuning: `DISK` in `src/render/disk.js`,
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
- **Test rooms:** `buff_integrity_1` on the Fault Line lookout,
  `buff_energy_1` on the stairs in Cache Hall's back corner,
  `buff_recharge` beside the energy refill past the Warp pit in Fast
  Path.

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

The second spell (D73), from a data disk in Cache Hall (slot 1).

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

The third spell (D84), from a data disk in Scheduler (slot 2), on the low
wall by the west side.

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

The fourth spell (D85), from a data disk in Quarantine (slot 3), on top
of the 2-high pillar (push the crate against it and climb).

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
  bouncy one doesn't bounce him. It still falls, rides platforms, holds a
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

Two teleport spells (D86): Blink from a data disk by the entrance of Fast
Path (slot 4), Warp from one further in (slot 5).

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
  and a kick of pixels where he pushed off. Warp: he bursts into pixels
  that stream along the way into him, and his hologram flashes in its
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
  white (22 ticks). Pasting streams the pixels from his hands into a
  marquee on the cell, and the object grows in with a small overshoot.
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
- **Test room:** Upgrade Lab (see Test rooms).

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
  placed in the world). They lie where it takes an extra move: on the
  Crawl Space tower (the peaceful bouncy bug lifts the wizard there) and
  on the Upgrade Lab wall (the double jump).
- **HUD:** `SCORE 000250 33%` in gold under the title, top right; a new
  score rolls up to its value in 0.9 s (`rollScore()` in `ui/hud.js`,
  easing out), flashing while it rolls. No popups over pickups.
- **Dropped:** bonus bits, their room slots, the "all bits collected"
  bonus and the local high score.

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
  world (validation); now in Boot Sector. A fixed body 1×2×1, too high to
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
- **Access locks:** `"access": n` on an exit (1–15; validation: a level
  the thresholds give). Solid until his level is n or more; with
  `"locked"` too, the switches must be on as well. The exit he came in
  through stays open for him (D75). The look is the switch lock's white
  barrier with the level as a thick gold Roman numeral (I–III, up to XV),
  gold like the hat bands, between a bar across its top and one across
  its bottom, as on a clock face, so a lone I reads as a numeral
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
| Compile | 7 | Temporary block in the cell in front: a step or a bridge tile | Phase 4 |
| Fork | 8 | Hologram decoy for a while: holds plates, draws enemies | Phase 4 |
| Scan | 9 | Reveals hidden blocks, fake walls and secret pickups for a while | Phase 4 |
| Pull | 10 | Pulls the closest crate or enemy in the facing direction one tile towards the wizard | Phase 4 |

- **Upgrades:** Zap+, Shield+ and the double jump, built in Phase 3 (see
  Upgrades). Found, an upgrade replaces its base spell in the Tab cycle
  (ZAP becomes ZAP+), so the cycle stays short.
- **Order in the world** (intended; rooms place the disks later):
  early Zap, Shield, Blink, Pause; middle Cut & Paste, Firewall, Fork,
  Scan and the jump upgrade; late Compile, Warp, Zap+ and Shield+. Pull's
  place settles in its step.
- **Turned down for now:** Patch (an enemy turns
  peaceful), Overclock (a speed burst), Decrypt (dissolves an encrypted
  wall type), Rollback (back to where he was 3 s ago); upgrades Halt
  (Pause freezing the whole room), Lift (Warp landing on top of what
  stops it), Firewall+ (hazard immunity) and Cut & Paste+ (a level up or
  down). They remain candidates for the spare bits.
- Slots 7–10 are provisional until each spell's step; colors and costs
  are settled there.

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

## Switches and locked exits

Switches unlock a room's exits (D69, D75). Two object types in
`defs.json`, placed in `objects` like crates; their state resets with the
room.

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
- **Locked exit** (`"locked": true` on an exit): solid, like the room's
  edge, until every switch in the room is on; then it opens (`> ACCESS
  GRANTED: EXIT UNLOCKED`). When a switch goes off it closes again, but
  never on the wizard: while he stands in the opening it waits. The exit
  he came in through stays open for him while he is in the room, even
  after a respawn, so he can always leave the way he came (D67). The room
  needs at least one switch.
- **Look** (D75, after two showcase rounds): white (`#eef3ff`, the
  type's `color`). Both switches carry a square bull's-eye, a small square
  inside a bigger one, so they read as switches by shape, not only by
  color. Off, its lines are dim; on, they brighten and the inner square
  fills with light. A target has the bull's-eye on every face and a
  plain crate's outline; a hit flashes and jolts it. A plate has a dashed
  tile outline; pressed, the outline turns solid, brackets light up just
  outside its corners and a glow spills onto the floor round it, so it
  shows round a crate standing on it. A locked exit is a dark panel
  that sinks into the threshold, on back doorways and front exits alike
  (front exits had four retracting bars until D101). It carries one small bull's-eye light per switch in the room, lit
  for each switch that is on. The exit's stream shows once it is open.
- Events: `switch` (a switch went on or off), `unlock` and `lock` (a
  locked exit opened or closed).
- Validation: a plate lies on the floor, inside the room, not in a block
  and not over a hole; a locked exit needs a switch in its room.
- Room design: a plate the wizard can reach next to the locked exit is
  no puzzle, since the exit closes as soon as he steps off; give him
  something that stays (a crate) or something that comes and goes (a
  patrolling enemy resting on it, a timing puzzle). Access locks (D101,
  see Fragments and access) reuse the locked exit.
- Tuning: the look is `SWITCH_FX` in `src/render/switch-view.js`;
  showcase `?asset=switches`.

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
- Objects never leave a room: pushing one out through an exit is blocked.
- The first row of cells inside an exit must be free (no blocks, objects or,
  at floor level, holes). A raised exit (`y` > 0) needs something to stand
  on in front of it, usually a ledge.

### Authored rooms

The author's real game rooms carry `"authored": true` (D90), set with the
*Authored* checkbox in the room editor. They share the world with the test
rooms and start from Boot Sector too; development steps never change them
or attach new rooms to them (CLAUDE.md §10). The world map tool marks them
AUTHORED and lets them lie as far from the start as the world needs.

### Test rooms

Test rooms stay in the world alongside the authored rooms (D45, D90): a
lab where each shows one mechanic, and later spells and enemies are tried
in them too. New mechanics add or extend one (D43). Every test room is at
most two rooms from Boot Sector, the start (D49; Room 1 is a second hub);
the world map tool shows the connections and flags any room further out.

| Room | Biome, size | Shows |
|---|---|---|
| `boot_sector` (start) | 12×12 | blocks, holes, crates, plates opening a locked exit; the Zap disk, the core, a fragment, a shrine |
| `cache_hall` | 16×8 | a pit to plug with a crate; the Shield disk, an energy buff |
| `relay_station` | 12×12 | switches: a Zap target, a crate for a plate, a peaceful bug resting on a plate |
| `stack_yard` | Glitchmire, 8×8 | stacked crates, a climb via a crate, a plate by a locked doorway |
| `fault_line` | 12×12 | hazard walls, spiked hoppers, a void field with a zigzag path; an integrity buff |
| `transit_bus` | 12×12, 5 high | platforms: a ferry, a lift, a loop with a crate, a press, a pusher |
| `volatile_memory` | 12×12, 5 high | collapsing bridges (one regrowing) and one-shot steps |
| `crawl_space` | 12×12 | bugs of every kind (solid, bouncy, provoked, peaceful); a secret |
| `quarantine` | Glitchmire, 10×10 | a virus, a sentinel, a bursting bug; the Pause disk; the level-1 access lock |
| `scheduler` | Abyssal Buffer, 10×10 | a tower, a worm, a crawler; the Firewall disk; a shrine |
| `room_1` | 12×12 | an empty hub for the Phase 3 spell rooms |
| `fast_path` | Frostbyte Wastes, 12×12 | Blink and Warp disks, pits to cross; the recharge buff |
| `clipboard` | Abyssal Buffer, 12×12 | Cut & Paste: crates to cut and paste as steps and bridges, a bug to freeze and move |
| `upgrade_lab` | Abyssal Buffer, 12×12 | the upgrades: a wall to double-jump, a bank shot for Zap+, a shooter for Shield+; a secret, a shrine |
| `vault` | Firewall Citadel, 8×8 | behind the access lock: two fragments |

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
| Phantom Partition (special) | pale violet `#a98bff` (D99) | sparse dots | still stars, twinkling | edges shimmer slowly through the hues |

Room colors keep clear of the colors objects and blocks carry (the color
rules, D99): danger red (hazards, spiked platforms), white (plates,
targets, locks), cyan (platforms), magenta (the wizard), lime (crates);
void blocks are black mist and collapsing blocks take the room color.
`tests/colors.test.js` checks every biome against them: a hue gap of at
least 20° between saturated colors, and no near-white room color.
Phantom Partition moved from silver-white to pale violet so plates and
targets stand out in it; violet became free when void blocks turned
black.

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
| Top left | Integrity: label over a row of slanted cyan cells, one per point; a lost cell flashes white and empties, at 2 or less the bar turns magenta and blinks. Under it the backup pips, the energy bar and the spell tag (with the clipboard slot for Cut & Paste). |
| Top center | Banner: a title decoding from glyphs (0.45 s), holding (1.8 s) and fading (0.7 s), with an optional smaller line below, in its own color. On entering a room (not on respawn) it shows the room name and the biome name in the biome color; later pickups (e.g. a spell installed) use it too. A new banner replaces the one showing. |
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
| 1–9 | Tool: Block, Hole, Object, Enemy, Path, Exit, Spawn, Reset, Shrine |
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
- **Enemy** places an enemy of the panel's template with its settings
  (grouped: look and color; movement, speed and chase speed; hostility
  and aggro range; attack, attack range and damage; integrity, bounce,
  solid; each with a tooltip. Blank is the template's own; other
  overrides written by hand stay), id `<template>_<n>`, and picks it. A
  click on an enemy picks it: the fields then show and change it, and new
  enemies get the same. A patrolling enemy needs a path (the panel says
  so), a chaser may have one; making one stationary drops its path.
  Integrity, damage, speed, chase speed, aggro range, attack range and
  color are typed in (blank: the template's). Changing the template of
  an enemy with an id the editor made renames it (`bug_1` becomes
  `virus_1`); ids written by hand stay.
- **Enemy templates** (D58, D79), any of them, the base ones too: a
  name + **New** turns the current enemy settings into a new template in
  `defs.json` (`"extends"` the current template, only the enemy's own
  values), listed as `bug_tank (on bug)` from then on; the picked enemy
  becomes one of it. With settings of its own, **Update template** moves
  them into the template: every enemy of it changes, in every room, and
  so do the templates built on it (the status line says which rooms and
  templates). **Rename** gives the template the typed name (only one no
  other room uses; the room's enemies and the templates built on it
  follow), **Delete** removes one no enemy uses and no template builds
  on. Template changes are undo steps of the room they were made in
  (D59). Saved with Save, like the rooms.
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
- **Sending the rooms in:** `tools\map-pr.bat ["what changed"]` (Windows)
  puts only `data/rooms/`, `data/world.json` (connections, and room
  positions from the world map tool) and `data/defs.json` (enemy
  templates) on a new branch, room and map changes in one PR,
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

---

## Finished phases

Phase 1 (v0.1.0, foundations), Phase 2 (v0.2.0, hazards, combat, editor)
and Phase 3 (v0.3.0, spells and pickups) are done; what each delivered is
in [CHANGELOG.md](../CHANGELOG.md), why in the decisions it names.

Each step of a phase is one branch and one PR against `main` (no stacked
PRs); the game runs after every step and CI is green before a PR is
called ready. A step starts by settling its open questions with the
author, recorded as decisions before the code lands. Every step also
(D43):
- adds its new looks to the asset showcase (`tools/showcase.js`);
- adds or extends a small test room that shows the mechanic, connected to
  the world through test rooms only, never an authored room (D90);
- adds unit tests for the logic (fixtures in `tests/helpers.js`) and the
  room editor palette and validation for any new type;
- updates `docs/design.md`, `docs/architecture.md` and CHANGELOG, and
  records new decisions.

## Phase 4 (v0.4) outline

Saves, guardians and tooling, in two parts (D105), planned step by step.

**Phase 4a — saves and UI:** access-key codec with tests (done, D106);
title screen and pause menu (the save UI needs both); saving and loading
(URL hash, localStorage); map screen.

**Phase 4b — spells, bosses, tooling:** the roster's new spells, one
step each (D88, D89): Pull, Compile, Scan (needs hidden blocks, fake
walls and hidden pickups first), Fork (enemies target the decoy);
Firewall Wardens; reachability checker; design skills and subagents.

Settled:
- Saving is a player action, any time, from the pause menu (D105); it
  writes the key to the URL hash and to localStorage, and nothing saves on
  its own. A load starts in the saved room with the room reset, full
  backups and an empty clipboard; integrity comes from the key.
- Firewall Wardens (D104) are the bosses of combat rooms. Each drops one
  permanent pickup (a pickup naming the Warden, shown once it falls);
  while that pickup's bit is found, the Warden is left out of its room
  and counts as defeated. Data checks refuse a Warden without such a drop,
  and a drop that is a refill. Shrines stay out of boss rooms.

Open so far:
- A key whose room cell holds no room (the room moved on the map since):
  probably load what he has and start in the start room. Settled with
  the saving step.
- Wardens: size (a body wider than one cell needs multi-cell collision and
  claims), phases or attack patterns, a boss integrity bar, weak points,
  how many.
- How deep the reachability checker searches pushables and spells; it
  works out which abilities each exit and pickup needs and checks that
  the world can be finished in some order (D67).
- The map screen, given that finding what is where is part of the game.
  The author's current plan: it records the rooms visited in this run
  only and is cleared when a save is loaded (the access key carries no
  map data); shrines show a map of the area around them. Still open: how
  far that area reaches, whether it shows rooms not visited yet, and
  whether they then stay on the run's map.

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
| 156–159 | Integrity | 1–15 |
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
| `data/defs.json` | `objects`: object types and their defaults (crates, platforms, switches, the core); `enemies`: enemy templates, each complete or `extend`ing another (D58, D79); `spells`: tuning and color per spell; `pickups`: disks, buff chips, upgrade cards, fragments, secrets and refills; `blocks`: block types (D60); `score`: points per kind of pickup (D100). Each is described in its section above. |
| `data/biomes.json` | Biome name and room color, optional `look` for the surroundings (see Biomes) |
| `data/world.json` | Start room, exit connections, every room's cell on the world map (`positions`, D66) and the key fragments (`fragments`: how many the core needs, the access thresholds, D101) |
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
    { "id": "north", "side": "-z", "at": 3, "width": 3, "y": 1, "locked": true }
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
  (default 2); `locked` (switches, D75), `access` (a level, D101).
- `blocks` — anonymous static geometry; `to` fills a box (inclusive);
  `type` is a block type from `defs.json` `blocks` (default `block`).
- `holes` — floor tiles `[x, z]` that are pits; `to` fills a rectangle.
- `shrine` — the backup shrine's floor tile (D97).
- `objects` — typed things with stable ids; `overrides` replace type
  defaults. Platforms also take a `path`:
  `{ "points": [[6, 0, 1]], "mode": "pingpong", "speed": 2, "pause": 0.8 }`.
- `enemies` — `{ "id", "template", "at", "path", "overrides" }` (see Enemies).
- `pickups` — `{ "id", "type", "at" }` (see Pickups and progress).
  Ids are unique among objects, enemies and pickups.
- Object type style (D17): `edges` `solid`/`dashed`, `mark`
  `none`/`inset`/`cross`/`brackets`/`bits`, `faces`
  `dark`/`tinted`/`hazard`/`glass`, `shape` `cube`/`spiked` (defaults
  first), `tint` 0–1 (color share of a tinted top face, default 0.1).
  Objects may override them.
- `world.json` pairs exits: `"connections": [["boot_sector.north", "room_1.south"]]`.
  Paired exits are on opposite sides and equally wide; every exit is connected.
  `"positions": { "boot_sector": [0, 0] }` places every room on the world
  map, one room per cell (`[x, z]`, +x east, +z south; map neighbours need
  not be connected, D66).
