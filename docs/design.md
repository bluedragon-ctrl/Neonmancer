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
  over between rooms. Falling into a hole drains it all; respawning restores
  it (D35). Damage from hazards and enemies comes in Phase 2.

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
  and respawns at the room's own `reset` point (D39) after 0.75 s.
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

### Test rooms (Phase 1)

| Room | Size | Exits | Shows |
|---|---|---|---|
| `boot_sector` (start) | 12×12 | north doorway → Cache Hall; raised east exit on a ledge → Stack Yard | blocks, holes, two crates |
| `cache_hall` | 16×8 | south (front) → Boot Sector | a 3-wide pit across the room: push a crate in, then jump the rest |
| `stack_yard` | 8×8, Glitch Zone color | raised west doorway → Boot Sector | stacked crates, a 2-high block to climb via a crate |

## HUD

A DOM overlay on the stage, sized in 1080p pixels (`--u`), all text from
`data/strings.json` (D34).

| Where | What |
|---|---|
| Top left | Integrity: label over a row of slanted cyan cells, one per point. A lost cell flashes white and empties; at 2 or less the bar turns magenta and blinks. |
| Top center | Banner: a title decoding from glyphs (0.45 s), holding (1.8 s) and fading (0.7 s), with an optional smaller line below, in its own color. On entering a room (not on respawn) it shows the room name and the biome name in the biome color; later pickups (e.g. a spell installed) use it too. A new banner replaces the one showing. |
| Top right | Game name and version; the debug readout (F3) shows below it. |
| Bottom left | Terminal: lime lines typed at 40 characters/s with a block cursor, kept 4 s, then faded; at most 4 lines. Printed on start, death, respawn and when a crate plugs a hole. |
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
  wizard and every pushable, updated at the interpolated render position
  (`src/debug/overlay.js`).
- The dev readout (top right, under the brand): room id, tick rate, frame
  rate, render buffer size, GPU resources (shaders, geometries, textures;
  steady counts show rooms free what they use), held actions, the wizard's position and whether
  he's grounded, and whether invincibility is on.
- `]` / `[` jump straight to the next/previous room in load order, skipping
  the exit transition (`Game.debugJumpRoom()`); ignored mid-transition.
- `I` toggles invincibility (`Game.invincible`): holes never kill and
  `Game.hurt()` does nothing.
- `H` calls `Game.hurt(1)` to test the integrity HUD; real hazards and
  enemies call the same method from Phase 2.

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
D43. **Next step: 1.**

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
| 3 | `feat/moving-blocks` | Shared path format (waypoints, speed, optional pause at ends, loop or ping-pong) in room data; moving platforms as a room object kind (D40) that the wizard and pushables ride; a platform that would push the wizard into something solid pushes him aside, or hurts him if there is no room (never instant death); glowing rails along the path. |
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
| `data/defs.json` | Object types and their defaults (`crate`: pushable, lime, inset mark, dark faces; box variants `crate_plain`, `crate_cross`, `crate_dashed`) |
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
- `blocks` — anonymous static geometry; `to` fills a box (inclusive).
- `holes` — floor tiles `[x, z]` that are pits; `to` fills a rectangle.
- `objects` — typed things with stable ids; `overrides` replace type defaults.
- Object type style (D17): `edges` `solid`/`dashed`, `mark`
  `none`/`inset`/`cross`/`brackets`, `faces` `dark`/`tinted` (defaults first),
  `tint` 0–1 (color share of a tinted top face, default 0.1).
  Objects may override them.
- `world.json` pairs exits: `"connections": [["boot_sector.north", "cache_hall.south"]]`.
  Paired exits are on opposite sides and equally wide; every exit is connected.
