# Architecture

How the code fits together. The vision and locked decisions are in
[CLAUDE.md](../CLAUDE.md); reasons for decisions are in
[decisions.md](decisions.md). Sections marked *(planned)* describe code that
does not exist yet.

## Overview

The engine is generic; all content is JSON in `data/`, described by JSON
Schema in `schemas/`. Data is bundled at build time
(`import.meta.glob`), validated, merged with type defaults and turned into a
runtime room every time the player enters it (rooms fully reset).

## Frame flow

```
requestAnimationFrame(now)
  └─ FixedLoop.advance(elapsed): acc += elapsed
       while acc >= 1/60 (at most 5 steps, then the backlog is dropped):
          input.sample()          raw key state → actions {down, pressed, released}
          game.update(input)      save prev positions → player → pushables → exits → events  (planned)
          acc -= 1/60
       alpha = acc / (1/60)
       views.sync(alpha)          render position = lerp(prev, curr, alpha)  (planned)
       composer.render()          (planned)
```

Game logic only ever sees `dt = 1/60`, so behaviour is identical at any
refresh rate. If a frame takes longer than 5 steps (under 12 FPS, or the tab
was in the background) the game slows down instead of freezing while it
catches up. `FixedLoop.advance()` is plain logic, so tests drive it with
made-up frame times.

## Modules

| Module | Responsibility |
|---|---|
| `main.js` | Bootstrap: load and validate data, build systems, start the loop, error screen |
| `game.js` | Owns game state; fixed-order `update()`; room switching |
| `core/version.js` | Game and data-schema version numbers |
| `core/loop.js` | Fixed 60 Hz timestep, step clamp, interpolation alpha |
| `core/input.js` | Raw keys → action states once per tick |
| `core/bindings.js` | Default key → action map (the only place raw key codes appear) |
| `core/events.js` | Small pub/sub between simulation, HUD and debug |
| `data/validate.js` | Semantic checks and readable error messages (Ajv schema pass is dev/CI) |
| `data/load.js` | Collect JSON, validate, merge type defaults with room overrides |
| `world/grid.js` | 3D occupancy grid (static cells + resting pushables) |
| `world/room.js` | Runtime room built fresh from data on every entry |
| `world/exits.js` | Exit openings, boundary walls with gaps, transition triggers |
| `physics/collision.js` | Axis-separated AABB movement against grid, walls, moving bodies |
| `entities/player.js` | Movement, jump, gravity, integrity, push intent |
| `entities/pushable.js` | Rest → slide → fall → land state machine |
| `render/renderer.js` | WebGLRenderer, 16:9 letterbox, DPR cap, render scale, resize |
| `render/camera.js` | Fixed isometric orthographic camera |
| `render/neon.js` | Neon materials; line widths scaled by render height |
| `render/post.js` | pmndrs postprocessing composer (bloom) |
| `render/floor.js` | Infinite grid floor fading into darkness |
| `render/room-view.js` | Merged edges + instanced occluder faces for static blocks; back walls |
| `render/entity-view.js` | Player / pushable meshes, interpolation, drop shadows |
| `ui/hud.js` | DOM overlay: integrity, room name, terminal messages |
| `debug/debug.js` | Collision boxes, FPS, room jump, invincibility |

## Input

Key events only update a raw key set (keyed by `KeyboardEvent.code`, the
physical key position, so WASD works on QWERTZ/AZERTY too). Once per tick
`input.sample()` turns it into actions (`up`, `down`, `left`, `right`, `jump`,
`cast`, `spellNext`, `spellPrev`, `pause`, `map`, `debug`); game code asks
`input.down(action)`, `input.pressed(action)` or `input.released(action)`.

- A key pressed and released between two ticks still counts as down and
  pressed for one tick, so short taps are never lost.
- Auto-repeat is ignored; window blur releases everything.
- Bound keys have their browser default blocked (arrows/space scrolling,
  F3 search), unless Ctrl/Alt/Meta is held, so browser shortcuts still work.
- Bindings are a plain action → keys object (`core/bindings.js`), passed to
  the `Input` constructor; rebinding later just passes a different object.

Game code never reads raw keys.

Movement follows grid axes: Up = −z (screen up-right), Right = +x,
Down = +z, Left = −x.

## Collision *(planned)*

The player is an AABB moved one axis at a time (x, z, then y). For each axis
the solids are gathered from overlapped grid cells, the room boundary
(except exit openings) and moving bodies, and the movement is clamped.
Landing sets `grounded`. Speeds stay below 0.35 units per tick, so no swept
collision is needed. No auto step-up: the wizard jumps.

Pushables keep x/z on the grid. Walking into one along an axis for
`pushDelay` while grounded slides it one cell (both cells reserved while
sliding) if the target cell is free and nothing rests on it (D4). Without
support it falls with gravity and snaps to the grid on landing.

## Resolution independence *(planned)*

- Canvas CSS size = largest 16:9 rectangle inside the window; the rest is letterbox.
- Drawing buffer = CSS size × min(devicePixelRatio, 2) × renderScale (0.5–1.0).
- Fixed orthographic view height (D2), so framing never depends on resolution.
- Line widths = base × bufferHeight / 1080; HUD uses `--u = viewportHeight / 1080`.

## Data validation *(planned)*

1. JSON Schema (Ajv) — Vite plugin in dev/build and `npm run validate:data` in CI (D8).
2. Semantic checks at runtime — width + depth ≤ 32, bounds, overlaps, known
   types/biomes, exits on their edge, connections valid, spawn not inside a solid.

Errors name the file and path, e.g.
`rooms/cache_hall.json › blocks[3]: cell [12,0,4] is outside size [12,4,12]`.

## Testing

`npm test` runs Node's built-in test runner over `tests/**/*.test.js` (D7).
Tests cover pure logic only (no DOM or WebGL).
