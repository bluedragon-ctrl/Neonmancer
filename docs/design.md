# Design

Game design details that go beyond [CLAUDE.md](../CLAUDE.md), plus the plan
for the current phase. Locked decisions live in CLAUDE.md; their reasons in
[decisions.md](decisions.md).

## Controls (default)

| Action | Keys |
|---|---|
| Move | WASD / arrow keys (along grid axes) |
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
- Jump clears exactly one block (`jumpHeight` 1.2).
- Integrity (health) max 8, at most 15 (4 bits in the save key).

## Pushing

- Push by walking into an object along a grid axis while standing on the ground.
- One object at a time; an object with something on top cannot be pushed.
- A pushed object slides one cell, then falls if nothing supports it.

## Holes

- Floor tiles marked in the room data; drawn as black pits with a bright rim
  on a faintly tinted room floor.
- The player dies when the center of his hitbox is over a hole at floor
  level (grazing the edge is safe), then respawns at the room entrance.
- A block pushed onto a hole drops in and fills it: the hole becomes
  walkable floor and the block is used up. Puzzle idea: push the crate into
  the pit to cross it.
- No way down: holes are only a look plus a rule, never a real lower level.

## Rooms and exits

- Horizontal exits only in Phase 1: an opening on one side of the room
  (`side`, first cell `at`, `width`, floor level `y`, `height`).
- On the back sides an exit is a doorway in the wall; on the front sides it
  is simply a gap in the invisible boundary.
- Walking through an exit loads the connected room; the player arrives at
  the matching exit, keeping the offset along the edge. That arrival point
  is the respawn point for the room.

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
| `data/defs.json` | Object types and their defaults (`crate`: pushable, lime, inset mark, tinted faces; box variants `crate_plain`, `crate_inset_dark`, `crate_cross`, `crate_dashed`) |
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
- `world.json` pairs exits: `"connections": [["boot_sector.east", "cache_hall.west"]]`.
  Paired exits are on opposite sides and equally wide; every exit is connected.
