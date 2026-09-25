# Design

Game design details that go beyond [CLAUDE.md](../CLAUDE.md), plus the plan
for the current phase. Locked decisions live in CLAUDE.md; their reasons in
[decisions.md](decisions.md).

## Controls (default)

| Action | Keys |
|---|---|
| Move | WASD / arrow keys along the grid axes: Right ↗, Up ↖, Left ↙, Down ↘ |
| Jump | Space |
| Cast | J |
| Cycle spell | Q / E |
| Pause | Esc / P |
| Map | M |
| Debug mode | F3 |

Keys are physical positions (`KeyboardEvent.code`), so the layout is the
same on QWERTY, QWERTZ and AZERTY keyboards.

## Player

- Hitbox 0.6 × 1.5 × 0.6 (hat is visual only) — needs 2 blocks of headroom.
- Walks at 4.5 units/s along the grid axes; diagonals are normalised.
- Jump clears exactly one block (`jumpHeight` 1.2). Every jump has the same
  height (no short hops), so the block rule never depends on timing (D19).
- Forgiveness: a jump still works 6 ticks after walking off a ledge, and a
  jump pressed up to 6 ticks before landing happens on landing.
- Turns smoothly towards the walking direction; starts facing the camera.
- Tuning values live in `PLAYER` in `src/entities/player.js`.

### Look

Hologram look (D22): magenta cone body, cyan ball head and two small
floating cyan ball hands, magenta pointy hat (cone + brim) sitting on the
head, tilted back so the face shows under the brim, glowing white eyes.
Each part has a dark core glowing towards its silhouette, faint scanlines
drifting up and a thin neon outline. Proportions are `WIZARD` in
`src/render/wizard.js`; review looks in the asset showcase
(`/tools/showcase.html?asset=wizard`).
- Integrity (health) max 8, at most 15 (4 bits in the save key).

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
  and respawns at the room entrance (for now the room spawn) after 0.75 s.
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
  corner lines fading into it, like a hole's pit; on the front sides it is a gap in the invisible boundary
  and in the floor edge, marked by two chevrons `>>` on its floor pointing out.
- Every exit has a faint data stream: thin dashes flow along lanes on its
  floor out of the room, reaching half a tile past the threshold (and up the jambs to the middle of the lintel on doorways), in the
  color of the room it leads to. Far from the wizard the stream is dim and
  slow; within a few cells it brightens, speeds up and pulses. Tuning values
  are `EXIT_FX` in `src/render/exit-view.js`; review it in the asset
  showcase (`/tools/showcase.html?asset=exits`, cycling far ⇄ near).
- An exit leads out once the wizard's feet center passes the side. The
  screen fades to black (0.2 s) while he walks on out and the world stands
  still, then the connected room fades in (0.25 s, already playable). He
  arrives half a cell
  inside the matching exit, keeping his offset along the edge, his height
  above the exit floor, his fall and his facing.
- That arrival point (on the exit floor) is where he respawns in the room;
  the start room uses its own `spawn` until he leaves it.
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

## Data formats

The schemas in `schemas/` are the reference; this is an overview. Every file
has `"schemaVersion": 1` and a `"$schema"` link for editor support.

| File | Contents |
|---|---|
| `data/rooms/<id>.json` | One room (id = file name) |
| `data/defs.json` | Object types and their defaults (`crate`: pushable, lime, inset mark, dark faces; box variants `crate_plain`, `crate_cross`, `crate_dashed`) |
| `data/biomes.json` | Biome name and room color (`home_lattice`: amber) |
| `data/world.json` | Start room and exit connections |

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
