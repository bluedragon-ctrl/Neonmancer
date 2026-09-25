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
| Pause | Esc |
| Map | M |
| Debug mode | F3 |

## Player

- Hitbox 0.6 × 1.5 × 0.6 (hat is visual only) — needs 2 blocks of headroom.
- Jump clears exactly one block (`jumpHeight` 1.2).
- Integrity (health) max 8, at most 15 (4 bits in the save key).

## Pushing

- Push by walking into an object along a grid axis while standing on the ground.
- One object at a time; an object with something on top cannot be pushed.
- A pushed object slides one cell, then falls if nothing supports it.

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
| 3 | `feat/data-loading` | Schemas, Ajv plugin + semantic validation, `validate:data` in CI, room built from JSON, error screen |
| 4 | `feat/player` | Wireframe wizard, movement, jump, gravity, grid collision, interpolation, drop shadow |
| 5 | `feat/pushables` | Pushing, sliding, falling, stacking |
| 6 | `feat/rooms-and-exits` | `world.json`, 3 connected test rooms, flip-screen transitions, room reset, respawn |
| 7 | `feat/hud` | `strings.json`, integrity HUD, room name banner, terminal messages, fullscreen hint |
| 8 | `feat/debug-mode` | Collision boxes, FPS, room jump, invincibility, test damage key |
| 9 | `chore/release-0.1.0` | Docs pass, CHANGELOG, `v0.1.0` tag and GitHub Release |

### Data formats (draft)

Schemas land in `schemas/` in step 3. Example room (8×8):

```json
{
  "schemaVersion": 1,
  "id": "boot_sector",
  "name": "Boot Sector",
  "biome": "home_lattice",
  "size": [8, 4, 8],
  "spawn": [2.5, 0, 2.5],
  "exits": [
    { "id": "east",  "side": "+x", "at": 3 },
    { "id": "north", "side": "-z", "at": 5, "y": 1 }
  ],
  "blocks": [
    { "type": "block", "at": [0, 0, 4], "to": [2, 0, 7] },
    { "type": "block", "at": [0, 1, 7] },
    { "type": "block", "at": [5, 0, 0], "to": [7, 0, 1] }
  ],
  "objects": [
    { "id": "crate_a", "type": "crate", "at": [4, 0, 4] }
  ]
}
```

- `blocks` — anonymous static geometry; `to` fills a box (inclusive).
- `objects` — typed things with stable ids; optional `overrides` of type defaults.
- `world.json` pairs exits: `["boot_sector.east", "cache_hall.west"]`.
