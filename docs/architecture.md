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
          game.update(input)      player → exits → his push → pushables (lowest first) → events
          acc -= 1/60
       alpha = acc / (1/60)
       views.sync(alpha)          render position = lerp(prev, curr, alpha)
       hud.update(dt)             integrity, banner, terminal, fullscreen hint (frame time)
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
| `main.js` | Bootstrap: load and validate data, build systems, route input, start the loop, error screen |
| `game.js` | Owns game state; fixed-order `update()`; room switching |
| `core/version.js` | Game and data-schema version numbers |
| `core/loop.js` | Fixed 60 Hz timestep, step clamp, interpolation alpha |
| `core/input.js` | Raw keys → action states once per tick |
| `core/bindings.js` | Default key → action map (the only place raw key codes appear) |
| `core/events.js` | Small pub/sub between simulation, HUD and debug *(planned)* |
| `core/messages.js` | `say(key, values)` terminal messages and `announce(key, values, options)` banners from any module, queued until the HUD takes them |
| `core/rules.js` | Shared rule constants (player hitbox, max room footprint) |
| `data/bundle.js` | The only Vite-specific module: bundles `data/**/*.json`, imports dev schema errors |
| `data/room-data.js` | Shared reading of room data: block boxes → cells, exit defaults, sides, exit cells |
| `data/validate.js` | Semantic checks and readable error messages (Ajv schema pass is dev/CI) |
| `data/load.js` | Validate the data files and build the content tables; throws `DataError` |
| `world/grid.js` | 3D occupancy grid: static cells, room sides with exit openings, hole tiles |
| `world/room.js` | Runtime room built fresh from data on every entry (type defaults + overrides) |
| `world/exits.js` | Which exit the wizard left through; where he arrives in the connected room |
| `physics/collision.js` | Axis-separated AABB movement against the grid; surface below a body |
| `entities/player.js` | Movement, jump, gravity, turning, pushing, death in holes, respawn |
| `entities/pushable.js` | Rest → slide → fall → land / plug-a-hole state machine |
| `render/viewport.js` | Letterbox, buffer size and 1080p-relative sizing math (pure, tested) |
| `render/renderer.js` | WebGLRenderer, 16:9 stage + HUD overlay, DPR cap, render scale, resize |
| `render/camera.js` | Fixed isometric orthographic camera |
| `render/neon.js` | Palette, line and face materials; line widths scaled by render height; `neonLines()`, `fadingLines()`, `shadedFaces()` builders; `disposeTree()` |
| `render/post.js` | pmndrs postprocessing composer (bloom) |
| `render/floor.js` | Infinite grid floor fading into darkness; hole tiles cut out via a mask texture |
| `render/edges.js` | Visible block edges from grid occupancy; merging unit segments into runs (pure, tested) |
| `render/exit-view.js` | Exit effect in the destination color: dashed stream into doorway tunnels, arrows gliding out of front exits |
| `render/exit-layout.js` | Exit effect layout and timing, `EXIT_FX` tuning (pure, tested) |
| `render/walls.js` | Back walls with doorways and dark tunnels behind them, front edges with gaps, arrow shape for front exits (pure, tested) |
| `render/marks.js` | Face-mark line patterns for object styles (pure, tested) |
| `render/hole-view.js` | Hole pits: walls fading to black, rim, short fading corner lines; outline math (tested) |
| `render/room-view.js` | Static blocks (merged edges + instanced occluder faces), back walls, styled object views |
| `render/entity-view.js` | Player and pushable views, glowing drop shadows |
| `render/interp.js` | Tick interpolation (positions, angles) and drop-shadow sizing (pure, tested) |
| `render/room-scene.js` | The current room's views; rebuilds only the objects on a respawn |
| `render/wizard.js` | Wizard model: parts as data (pure, tested), built in the hologram look |
| `render/holo.js` | Hologram look for characters: rim-glow material, inverted-hull outline, eyes, shared clock |
| `ui/hud.js` | DOM overlay: integrity bar, room banner, terminal messages, fullscreen hint |
| `ui/terminal.js` | Terminal message queue (typing, hold, fade) and banner timing (pure, tested) |
| `ui/text.js` | String lookup with `{name}` values; scrambled "decoding" text for the banner (pure, tested) |
| `ui/fullscreen.js` | Fullscreen toggle and when to suggest it (below 1080 physical pixels; tested) |
| `ui/error-screen.js` | Startup error screen listing every data problem |
| `tools/check-data.js` | Dev only: Ajv schema check + semantic checks over `data/` |
| `tools/vite-plugin-data.js` | Dev only: runs the check in the dev server and fails the build on errors |
| `tools/validate-data.js` | Dev only: `npm run validate:data` for CI |
| `tools/showcase.html`, `tools/showcase.js` | Asset showcase page: every look on a turntable with the real renderer (also deployed) |
| `debug/overlay.js` | Debug mode's wireframe collision boxes |
| `debug/readout.js` | Debug mode's stats readout (rates, buffer, GPU resources, actions, position) |

## Input

Key events only update a raw key set (keyed by `KeyboardEvent.code`, the
physical key position, so WASD works on QWERTZ/AZERTY too). Once per tick
`input.sample()` turns it into actions (`up`, `down`, `left`, `right`, `jump`,
`cast`, `spellNext`, `spellPrev`, `pause`, `map`, `debug`, `fullscreen`); game code asks
`input.down(action)`, `input.pressed(action)` or `input.released(action)`.

- A key pressed and released between two ticks still counts as down and
  pressed for one tick, so short taps are never lost.
- Auto-repeat is ignored; window blur releases everything.
- Bound keys have their browser default blocked (arrows/space scrolling,
  F3 search), unless Ctrl/Alt/Meta is held, so browser shortcuts still work.
- Bindings are a plain action → keys object (`core/bindings.js`), passed to
  the `Input` constructor; rebinding later just passes a different object.

Game code never reads raw keys.

Movement follows grid axes (D23): Right = −z (screen up-right),
Up = −x (screen up-left), Left = +z (down-left), Down = +x (down-right).

## Collision

The player is an AABB moved one axis at a time (x, z, then y). For each axis
the solids are gathered from overlapped grid cells, the room boundary
(except exit openings) and moving bodies, and the movement is clamped.
Landing sets `grounded`. Speeds stay below 0.35 units per tick, so no swept
collision is needed. No auto step-up: the wizard jumps.

Solid for the player: static blocks, the room sides (x/z outside the room)
and everything below y = 0 (the grid), plus pushable objects as moving
bodies; above the room height is open. At an exit the row of cells just
beyond the side is open (as high as the exit), so the wizard can walk
through; pushables never move outside the room.

Pushables are not grid cells: each is a body with a `box()`, and
`moveAxis` clamps against bodies like against cells and reports which body
stopped the move. The player is a body too, so objects can rest on him and
never slide into him.

The drop shadow sits on the highest surface under the footprint
(`surfaceBelow`: cells, bodies, floor), computed from the interpolated
render position; over a hole at floor level there is no shadow.

Pushing: the player counts ticks of walking into the same pushable along
one axis (grounded, at its level, lined up); from `pushDelay` on he sets
`pushIntent`, and the game calls `pushable.push()`, which starts a slide if
the object rests, is supported, has nothing on top (D4) and the target cell
is free. A slide moves x/z towards the target cell (waiting if something
steps into the way); on arrival the object falls at once if unsupported.
Falling ends on the highest surface below; above a hole at floor level
that is −1, the object becomes `plugged` and `grid.fillHole()` turns the
tile into floor. Object views are clipped at y = 0 (a clipping plane), so
a sinking or plugged object shows nothing below the floor.

## Room reset

`Game.enterRoom()` rebuilds everything from data. It runs on entry and when
the wizard respawns after dying (D24); `update()` then reports a `room`
event and `RoomScene.show()` rebuilds the room's views. On a respawn the
room is the same, so only the object views are rebuilt. The new views are
compiled before `disposeTree()` frees the old ones, so shaders both use are
kept, not compiled again; resources marked `shared()` (the unit box, the
shadow plane) are never freed.

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
- Composer: half-float buffers, 4× MSAA (`?msaa=0` turns it off until
  there are quality presets), render pass + one effect pass (bloom with
  mipmap blur, which scales with resolution by itself) (D13).
- Window resizing moves the stage at once; the drawing buffers are
  reallocated only once resizing pauses (150 ms).

## Rooms and flip-screen exits

```
game.update: player moved ──► exitAt(room, pos)   feet center past a side, inside an opening?
                                └─ transition 'out' (TRANSITION.outTicks): world frozen, wizard walks on out
                                └─ travel(exit)   links "room.exit" → the connected exit
                                     arrival()    same offset along the edge and height above the
                                                  exit floor, half a cell inside the new room
                                     enterRoom(id, pos)     fresh room, wizard at the arrival point
                                └─ transition 'in' (TRANSITION.inTicks): game runs, veil lifts
main.js: 'room' event ──► RoomScene.show()        views rebuilt, camera reframed
         every frame  ──► renderer.setFade(game.fadeLevel(alpha))   black veil under the HUD
                      ──► exitView.update(dt)                      stream flows, arrows glide
```

Exit effects take their color from `game.destinationColor(exit)` (the biome
of the room behind the exit). The doorway stream is a dashed `LineMaterial`
whose `dashOffset` moves every frame, faded towards black with vertex
colors; front-exit arrows (one per tile) are drawn twice, moved outwards and
faded per frame (`glideState`), half a glide apart. They are purely
visual and never touch the simulation.

`content.links` (built in `data/load.js`) maps every `"room.exit"` to the
exit it connects to, both ways. The wizard keeps his fall speed and facing
through the flip. Dying respawns him at the room's own `reset` point
(D39; `spawn` when it has none), however he entered, in a fresh copy of
the room. The fade is timed in ticks, so it is part of the deterministic
simulation; views only read `fadeLevel()`.

## HUD

```
content.strings (data/strings.json) ──► Hud(renderer.hud, strings)   all text via formatText(key, values)
any module: say(key, values) ──► queue (core/messages.js)   e.g. game.js on die, respawn, plug
            announce(key, values, { sub, subValues, color }) ──► queue   e.g. enterRoom() for a new room
       input.pressed('fullscreen') ──► toggleFullscreen()   within the key press's user activation
frame: hud.setIntegrity(game.integrity, game.maxIntegrity)   cells rebuilt only on change
       hud.setHintWanted(wantsFullscreenHint(stage height, DPR, fullscreen?))
       hud.update(dt)   takeMessages() → Terminal.push(); takeAnnouncements() → last one shown;
                        Terminal.update / lines(), bannerState(t), scrambleText()
```

The HUD is visual only and runs on frame time; it never feeds back into the
simulation. Its timing (`Terminal`, `bannerState`) is plain logic, tested
with made-up times; `hud.js` only moves the results into the DOM. Integrity
lives on `Game` (not the per-room `Player`), so it carries over between
rooms. A missing string shows as `[key]`; the schema lists every key the
game uses, so the data check catches missing ones first, and a test checks
that every key passed to `say()` or `announce()` in `src/` exists.

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
   exits on opposite sides with equal width, every exit connected once, the
   first row inside an exit free of blocks, objects and (at floor level) holes.

Semantic checks run only when the schema pass is clean. Every problem is
reported (not just the first), naming the file and path, e.g.
`rooms/cache_hall.json › blocks[3]: cell [12,0,4] is outside size [12,4,12]`.
If the game cannot start, `ui/error-screen.js` lists them.

Data files start with a `"$schema"` pointing to their schema, so editors like
VS Code offer completion and inline errors.

## Testing

`npm test` runs Node's built-in test runner over the `*.test.js` files in `tests/` (D7);
shared fixtures (small data files and games, fake input, grids) live in
`tests/helpers.js`.
Tests cover pure logic only (no DOM or WebGL).
