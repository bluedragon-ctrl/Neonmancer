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
       renderer.render()          composer: render pass + one effect pass (bloom)
```

Game logic only ever sees `dt = 1/60`, so behaviour is identical at any
refresh rate. If a frame takes longer than 5 steps (under 12 FPS, or the tab
was in the background) the game slows down instead of freezing while it
catches up. `FixedLoop.advance()` is plain logic, so tests drive it with
made-up frame times.

## Modules

Paths are under `src/`, except `tools/` (dev tooling at the repo root).

| Module | Responsibility |
|---|---|
| `main.js` | Bootstrap: load and validate data, build systems, start the loop, error screen |
| `game.js` | Owns game state; fixed-order `update()`; room switching |
| `core/version.js` | Game and data-schema version numbers |
| `core/loop.js` | Fixed 60 Hz timestep, step clamp, interpolation alpha |
| `core/input.js` | Raw keys → action states once per tick |
| `core/bindings.js` | Default key → action map (the only place raw key codes appear) |
| `core/events.js` | Small pub/sub between simulation, HUD and debug |
| `core/rules.js` | Shared rule constants (player hitbox, max room footprint) |
| `data/bundle.js` | The only Vite-specific module: bundles `data/**/*.json`, imports dev schema errors |
| `data/room-data.js` | Shared reading of room data: block boxes → cells, exit defaults, sides |
| `data/validate.js` | Semantic checks and readable error messages (Ajv schema pass is dev/CI) |
| `data/load.js` | Validate the data files and build the content tables; throws `DataError` |
| `world/grid.js` | 3D occupancy grid (static cells + resting pushables) |
| `world/room.js` | Runtime room built fresh from data on every entry (type defaults + overrides) |
| `world/exits.js` | Exit openings, boundary walls with gaps, transition triggers |
| `physics/collision.js` | Axis-separated AABB movement against grid, walls, moving bodies |
| `entities/player.js` | Movement, jump, gravity, integrity, push intent |
| `entities/pushable.js` | Rest → slide → fall → land state machine |
| `render/viewport.js` | Letterbox, buffer size and 1080p-relative sizing math (pure, tested) |
| `render/renderer.js` | WebGLRenderer, 16:9 stage + HUD overlay, DPR cap, render scale, resize |
| `render/camera.js` | Fixed isometric orthographic camera |
| `render/neon.js` | Palette, line and face materials; line widths scaled by render height |
| `render/post.js` | pmndrs postprocessing composer (bloom) |
| `render/floor.js` | Infinite grid floor fading into darkness; hole tiles cut out via a mask texture |
| `render/edges.js` | Visible block edges from grid occupancy (pure, tested) |
| `render/marks.js` | Face-mark line patterns for object styles (pure, tested) |
| `render/hole-view.js` | Hole pits: walls fading to black, rim, short fading corner lines; outline math (tested) |
| `render/room-view.js` | Static blocks (merged edges + instanced occluder faces), back walls, styled object views |
| `render/entity-view.js` | Player / pushable meshes, interpolation, drop shadows |
| `ui/hud.js` | DOM overlay: integrity, room name, terminal messages |
| `ui/error-screen.js` | Startup error screen listing every data problem |
| `tools/check-data.js` | Dev only: Ajv schema check + semantic checks over `data/` |
| `tools/vite-plugin-data.js` | Dev only: runs the check in the dev server and fails the build on errors |
| `tools/validate-data.js` | Dev only: `npm run validate:data` for CI |
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

## Rendering

- The stage (canvas + HUD overlay) is the largest 16:9 rectangle inside the
  window; the rest is black letterbox.
- Drawing buffer = stage CSS size × min(devicePixelRatio, 2) × renderScale
  (0.5–1.0, try `?scale=0.5`).
- Fixed orthographic view height of 20 units (D2), so framing never depends
  on resolution; `frameRoom()` centers the room.
- Sizes are given in pixels at 1080p: line widths = base × bufferHeight / 1080;
  the HUD uses the CSS variable `--u` (1080p pixel), set on the stage.
- Static blocks: dark instanced cubes (pushed back with polygon offset) plus
  one `LineSegments2` of edges from `blockEdges()` (D5, D12). Back walls are
  dark planes with a faint grid and a bright outline.
- The floor is one large plane with a grid shader that fades with distance
  from the room and has the void color, so it melts into the background.
- Composer: half-float buffers, 4× MSAA, render pass + one effect pass
  (bloom with mipmap blur, which scales with resolution by itself) (D13).

## Data loading and validation

```
data/**/*.json ──import.meta.glob──► data/bundle.js ──► loadGameData(files)
                                                          ├─ validateData()  semantic checks
                                                          └─ content tables  (types, biomes, world, rooms)
enter room ──► buildRoom(roomData, content)   fresh runtime room: block cells,
                                              objects (type defaults + overrides), exits with defaults
```

Validation has two layers:

1. **JSON Schema** (Ajv, dev only, D8) in `tools/check-data.js`, used by
   - the Vite plugin: a build with *any* data error fails; the dev server prints
     errors and hands the schema errors to the game through the virtual module
     `virtual:data-schema-errors`, so the error screen can show them (D15);
     editing `data/` or `schemas/` reloads the page;
   - `npm run validate:data` in CI and before deploys.
2. **Semantic checks** (`src/data/validate.js`), also at runtime: file present,
   schemaVersion, room id = file name, width + depth ≤ 32, known biome and
   object types, overrides only of existing type properties, blocks/objects
   inside the room and not overlapping, exits fit their side, the player
   hitbox fits at the spawn, start room exists, connections join existing
   exits on opposite sides with equal width, every exit connected once.

Semantic checks run only when the schema pass is clean. Every problem is
reported (not just the first), naming the file and path, e.g.
`rooms/cache_hall.json › blocks[3]: cell [12,0,4] is outside size [12,4,12]`.
If the game cannot start, `ui/error-screen.js` lists them.

Data files start with a `"$schema"` pointing to their schema, so editors like
VS Code offer completion and inline errors.

## Testing

`npm test` runs Node's built-in test runner over `tests/**/*.test.js` (D7).
Tests cover pure logic only (no DOM or WebGL).
