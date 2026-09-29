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
          game.update(input)      player → exits → his cast → his push → room objects (lowest first)
                                  → enemies → bolts → enemy contact → GameEvent[]
          acc -= 1/60
       alpha = acc / (1/60)
       views.sync(alpha)          render position = lerp(prev, curr, alpha)
       hud.update(dt)             integrity, energy, banner, terminal, fullscreen hint (frame time)
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
| `game.js` | Owns game state; fixed-order `update()` returning typed events; room switching |
| `spells.js` | What each spell does once cast (`SPELL_EFFECTS`): `castSpell(game)`, Blink and Warp, Cut & Paste |
| `combat.js` | Bolts, enemies' charged attacks, bouncing off, touching and burning enemies; every hit on an enemy (`hitEnemy(game, …)`, `pauseEnemy(game, …)`) |
| `switches.js` | Plates and the locked exits they open (D75): `updateSwitches(game)`, `exitOpen()`, `switchesOn()` |
| `core/version.js` | Game and data-schema version numbers (the game's patch number comes from `tools/game-version.js`, D42) |
| `core/loop.js` | Fixed 60 Hz timestep, step clamp, interpolation alpha |
| `core/input.js` | Raw keys → action states once per tick |
| `core/bindings.js` | Default key → action map (the only place raw key codes appear) |
| `core/messages.js` | `say(key, values)` terminal messages and `announce(key, values, options)` banners from any module, queued until the HUD takes them |
| `core/rules.js` | Shared rule constants (player hitbox, max room footprint) |
| `data/bundle.js` | The only Vite-specific module: bundles `data/**/*.json`, imports dev schema errors, `DEV_SERVER` flag |
| `data/room-data.js` | Shared reading of room data: block boxes → cells, block types with variants filled in (`resolveBlockTypes()`, D60), exit defaults, sides, exit cells |
| `data/validate.js` | Semantic checks and readable error messages (Ajv schema pass is dev/CI) |
| `data/load.js` | Validate the data files and build the content tables; throws `DataError` |
| `world/grid.js` | 3D occupancy grid: a block type code per cell (`typeAt()` gives its properties), room sides with exit openings (a locked exit's opening closes with `setOpening()`), hole tiles |
| `world/room.js` | Runtime room built fresh from data on every entry (type defaults + overrides; static block cells by type; cells of block types with a kind become room objects) |
| `world/exits.js` | Which exit the wizard left through; where he arrives in the connected room |
| `physics/collision.js` | Axis-separated AABB movement against the grid; surface below a body; box helpers (`restsOn()`, `touchesBox()`, `shoveClear()`) shared by all entities |
| `entities/player.js` | Movement, jump, gravity, turning, pushing, integrity, invulnerability after a hit, death (hole or damage), respawn; one wizard for the whole game |
| `entities/kinds.js` | Object kind → logic class (`OBJECT_KINDS`); the room's objects are built from it |
| `entities/pushable.js` | Rest → slide → fall → land / plug-a-hole state machine; destructible ones break (`hit()` → `broken`) |
| `entities/platform.js` | Moving platform: follows its path, carries riders, waits when blocked, shoves or squeezes the wizard (D46); a spiked one hurts on touch (D82) |
| `entities/collapsing.js` | Collapsing block: solid → shake (the wizard stood on it) → gone → optional regrow once its cell is clear (D47) |
| `entities/enemy.js` | Enemy body: steps cell by cell where its movement behavior leads (never into a hole or onto void, never into a cell another enemy is walking into), turns back when blocked, falls (mid-step too), rides platforms, pops in holes and on void; hostility, provoke, bounce state (D48); seeing the wizard, the "!", the charged attack's charge and cooldown (D78); `alarm()` when anything hits it (D81) and `route()`, a shortest walk to a column (D80); `freeze()` by Pause (D85): still, harmless and solid until it thaws |
| `entities/switch.js` | Switches (D75): `Target` (a fixed body a bolt switches over) and `Plate` (a floor tile, no body, on while something stands on it); `SWITCH_KINDS` (pure, tested) |
| `entities/bolt.js` | A bolt: the wizard's Zap or Pause (`Bolt.cast()`, level; a Pause bolt carries `freeze` ticks, D85) or an enemy's shot (`Bolt.shoot()`, D80; `boltDirections()`: aimed, or four ways, D81); flies in sub-steps one axis at a time, bounces off walls and objects if it has bounces left (D81), stops at the first body it may hit, block, object or room side (`BOLT` tuning) |
| `ai/behaviors.js` | Movement behaviors by name (`BEHAVIORS`: `patrol`, `stationary`, `chase`), as enemy templates refer to them |
| `ai/patrol.js` | Patrol: next step towards the next waypoint column, pauses at the ends, turns back; off its path it takes the enemy's route back (pure, tested) |
| `ai/chase.js` | Chase (D78, D80): calm → chase → search → return, greedy steps towards the wizard, routes (round walls) to where it last saw him and home, searches when his Zap hits it, patrols while calm if it has a path (pure, tested) |
| `ai/sight.js` | Rays through the grid and bodies (`castRay()`), `lineOfSight()`, `reach()` from a point to a box (pure, tested) |
| `world/progress.js` | What the wizard has for the whole game (D71): save bits in blocks (`SAVE_BLOCKS`, `saveBit()`, `pickupBit()`), `Progress` (bits found, known spells, a block's count); blocks: spells, buffs, upgrades, fragments, secrets (D100) (pure, tested) |
| `world/score.js` | The score (D100): points from the save bits (`scoreOf()`), the permanent pickups placed in the world (`placedBits()`) and the share found (`completion()`) (pure, tested) |
| `entities/warp.js` | Where Blink and Warp take the wizard (D86): `warpTarget()` sweeps his box along his aim through open space, stops at blocks, objects and the room's side, lands short of enemies, reports the enemies passed (pure, tested) |
| `entities/clip.js` | Where Cut & Paste works (D87): `aimAxis()`, `frontCell()` (the cell in front of him), `cutTarget()` (a resting crate or frozen enemy there or one up, nothing on it), `pasteCell()` (free of blocks, bodies and pickups) (pure, tested); `cutOrPaste()` (spells.js) moves things in and out of the room |
| `entities/pickup.js` | A pickup in a room: its box, save bit, state (idle, ghost, taken) and pick-up ticks (pure, tested) |
| `world/pickup-report.js` | The world map tool's pickup report: every permanent item by save bit, the rooms it lies in, refills per type, unknown types (pure, tested) |
| `world/map.js` | The world map (D66): `nearestFreeCell()` for new rooms, `roomDistances()` from the start, `mapWarnings()` (unreachable rooms, test rooms too far out, D49; authored rooms exempt, D90) (pure, tested) |
| `world/path.js` | Shared path format: legs from `at` through `points`, `advance()` / `positionOf()` on a small path state, swept cells |
| `render/viewport.js` | Letterbox, buffer size and 1080p-relative sizing math (pure, tested) |
| `render/renderer.js` | WebGLRenderer, 16:9 stage + HUD overlay, DPR cap, render scale, MSAA, resize, shader precompile |
| `render/quality.js` | Automatic quality fallback: steps MSAA, then render scale, down when frames run slow (D76; pure, tested) |
| `render/camera.js` | Fixed isometric orthographic camera |
| `render/neon.js` | Palette, line and face materials; line widths scaled by render height; `neonLines()`, `fadingLines()`, `shadedFaces()` builders; `disposeTree()` |
| `render/post.js` | pmndrs postprocessing composer (bloom) |
| `render/floor.js` | Infinite grid floor fading into darkness; hole tiles cut out via a mask texture |
| `render/edges.js` | Visible block edges from grid occupancy; several plain types as one mass, each edge to a type (`groupedBlockEdges()`, D64); merging unit segments into runs (pure, tested) |
| `render/exit-view.js` | Exit effect in the destination color: dashed stream into doorway tunnels, arrows gliding out of front exits |
| `render/exit-layout.js` | Exit effect layout and timing, `EXIT_FX` tuning (pure, tested) |
| `render/walls.js` | Back walls with doorways and dark tunnels behind them, front edges with gaps, arrow shape for front exits (pure, tested) |
| `render/spikes.js` | The spiked object shape (D82): pyramids on a core cube inside the cell, as face triangles and outline segments, `SPIKES` tuning; pure, tested |
| `render/marks.js` | Face-mark line patterns for object styles, including the data bits, whole (`bits`) or with holes for destructible objects (`bitsBroken`, `bitLayout()`); pure, tested |
| `render/glass.js` | Glass faces (D96): a see-through face shader (transparent, no depth written, clipping), the data core's shrunk mark and the loose bits of a destructible glass crate (`looseBitSegments()`, tested) |
| `render/break-fx.js` | Destructible object's jolt on a hit that doesn't break it, `BREAK_FX` tuning (pure, tested) |
| `render/hole-view.js` | Hole pits: walls fading to black, rim, short fading corner lines; outline math (tested) |
| `render/room-view.js` | Static blocks (merged edges + instanced occluder faces), back walls, styled object views |
| `render/entity-view.js` | Player (with the cast flare), pushable, platform, collapsing-block and enemy views (enemy bodies by `look`: `ENEMY_MODELS`; spell-hit flash and glitch, charge glow, "!" and discharge), glowing drop shadows, pixel bursts (derez, collapse), platform guide lines |
| `render/zap-fx.js` | Zap look: trail zigzags, bolt flicker, cast flare, sparks, enemy hit flash and damaged glitch, `ZAP_FX` tuning (pure, tested) |
| `render/zap-view.js` | Zap meshes: bolt, cast flare, sparks, in the Zap's cyan or an enemy bolt's color; `ZapView` keeps a room's bolts and sparks (pooled by color) |
| `render/install-fx.js`, `render/install-view.js` | Installing a spell from a data disk (D73): the look (pure, tested) and its meshes, shown by `PlayerView` |
| `render/shield-fx.js`, `render/shield-view.js` | The Shield's lightning ring (D73): the look (pure, tested; its flare when it blocks, D84) and its meshes, shown by `PlayerView` |
| `render/firewall-fx.js`, `render/firewall-view.js` | Firewall's ring of flames (D84): the segments (pure, tested; timing is the Shield's) and its meshes, shown by `PlayerView` |
| `render/warp-fx.js`, `render/warp-view.js` | Blink's dash (drawn position and stretch, streaks, kicked-up pixels) and Warp's pixel stream and arrival flash (D86): the look (pure, tested) and its meshes, shown by `PlayerView` |
| `render/jump-fx.js`, `render/jump-view.js` | The double jump's kick-off (D95): hexagonal rings in his magenta where he jumped in mid-air, the look (pure, tested) and its meshes, shown by `PlayerView` |
| `render/clip-fx.js`, `render/clip-view.js` | Cut & Paste (D87): the marquee, pixel stream and grow-in (pure, tested) and its meshes with the aim marker and paste ghost (`ClipView`, shown by `PlayerView`); `RoomScene.clip()` keeps a cut thing's view until the marquee has snapped on and adds a pasted one's |
| `render/pause-fx.js`, `render/pause-view.js` | A frozen enemy (Pause, D85): tint and blinking (pure, tested) and its cage of corner brackets, shown by `EnemyView` |
| `render/collapse-fx.js` | Collapsing-block look: shake, pixels breaking off, regrow, `COLLAPSE_FX` tuning (pure, tested) |
| `render/enemy-look.js` | What every enemy model shares (D80): mood colors (`MOODS`, `eyeMood()`, `setMood()`), the eye geometry and glow, the pop burst (`popBurst()`) (pure parts tested) |
| `render/bug.js` | Bug model (ball, eyes colored by mood), hop pose, bounce squash, pop pixels, `BUG` tuning (pure parts tested); `BUG_MODEL` for `EnemyView` |
| `render/virus.js` | Virus model (D78): sharp tipped cube, orbiting bits, glide, charge pose, pop pixels, `VIRUS` tuning; `VIRUS_MODEL` |
| `render/sentinel.js` | Sentinel model (D78): sharp octahedron, visor eye, shards gathering like a barrel, recoil, pop pixels, `SENTINEL` tuning; `SENTINEL_MODEL` |
| `render/cron.js` | Cron model (D83), the tower's look: hex pedestal, bell, a dial holding the grid axes with four emitters where a cross's bolts leave, sweeping hand, slam, `CRON` tuning; `CRON_MODEL` |
| `render/worm.js` | Worm model (D83): head with antennae dragging a tail of balls, inching hump and wiggle (`wormSpine()`), rearing up, `WORM` tuning; `WORM_MODEL` |
| `render/crawler.js` | Crawler model (D83): six-legged spider, tripod gait (`crawlerFoot()`, `placeLimb()`), crouch and pawing, `CRAWLER` tuning; `CRAWLER_MODEL` |
| `render/discharge.js` | Discharge lightning (D78): charge timing and glow (`dischargeLook()`, `chargeGlow()`), burst and arc zigzags (pure, tested), the aim line, `DISCHARGE` tuning |
| `render/alert-mark.js` | The red "!" over an enemy that noticed the wizard |
| `render/hash.js` | Fixed pseudo-random numbers for pixel bursts (pure) |
| `render/rails.js` | Guide line along a platform's path, `RAILS` tuning (pure, tested) |
| `render/block-fx.js` | Animated looks of hazard and void blocks (hazard face shader in room coordinates, steady edges, hazard flare; void via mist.js), `BLOCK_FX` tuning |
| `render/mist.js` | Void blocks as black mist (D99): opaque black cubes with sinking gray wisps, a patchy fog shell and a dim frame, `MIST` tuning |
| `render/hit-fx.js` | Damage look: blinking while invulnerable, derez flicker and pixel burst, `HIT_FX` tuning (pure, tested) |
| `render/interp.js` | Tick interpolation (positions, angles) and drop-shadow sizing (pure, tested) |
| `render/room-scene.js` | The current room's views, object views by kind (`OBJECT_VIEWS`); rebuilds only the objects on a respawn |
| `render/wizard.js` | Wizard model: parts as data (pure, tested), built in the hologram look |
| `render/holo.js` | Hologram look for characters: rim-glow material, inverted-hull outline, eyes, shared clock; sharp parts with hard edges (`sharpPart()`) |
| `render/xray.js` | X-ray ghost of the wizard's hidden parts (reversed depth test), render orders of the ghost and the characters, `XRAY` tuning |
| `ui/hud.js` | DOM overlay: integrity bar, energy bar, spell tag and Cut & Paste clipboard slot, room banner, terminal messages, fullscreen hint |
| `ui/clip-icon.js` | SVG icons of what the clipboard holds (D87): a crate's cube, an enemy, caged while frozen (pure, tested) |
| `ui/energy-bar.js` | Energy bar: one segment per cast filling as it recharges; flashes on a denied cast |
| `ui/terminal.js` | Terminal message queue (typing, hold, fade) and banner timing (pure, tested) |
| `ui/text.js` | String lookup with `{name}` values; scrambled "decoding" text for the banner (pure, tested) |
| `ui/fullscreen.js` | Fullscreen toggle and when to suggest it (below 1080 physical pixels; tested) |
| `ui/error-screen.js` | Startup error screen listing every data problem |
| `tools/check-data.js` | Dev only: Ajv schema check + semantic checks over `data/` |
| `tools/vite-plugin-data.js` | Dev only: runs the check in the dev server and fails the build on errors |
| `tools/validate-data.js` | Dev only: `npm run validate:data` for CI |
| `tools/run-tests.js` | `npm test`: runs `node --test` on an explicit list of `tests/*.test.js` (works on Node 20 and 22+, Windows and Linux) |
| `tools/game-version.js` | Dev only: the game version for builds, PATCH counted from git merges since the phase tag (D42) |
| `render/disk.js`, `render/refill.js` | Pickup looks: the data disk (bit grid showing the spell's slot, ghost, pick-up and pixel burst; motion pure, tested) and the refills |
| `render/card.js` | Upgrade card look (D95): a white expansion card, contact fingers in the upgrade's color with a key notch, a bracket, the upgrade's bit on both faces, ghost |
| `render/switch-view.js` | Switch and locked-exit looks (`SWITCH_FX`): target and plate with their square bull's-eye, the lock's panel or bars with one light per switch; `TargetView`, `PlateView`, `LockView` (marks pure, tested) |
| `render/chip.js` | Buff chip look (D93): chip in the stat's color, icon on the front, the buff's bit on the back, ghost |
| `render/secret.js` | Secret look (D100) in the score's gold, three variants under review (Easter egg, pixel "?", star), ghost |
| `render/pickup-model.js` | A pickup's model by kind (disk, upgrade card, chip or refill), for the room view and the install animation |
| `render/pickup-view.js` | A room pickup's view: its look, idle motion, ghost, pick-up effect |
| `tools/showcase.html`, `tools/showcase.js` | Asset showcase page: every look on a turntable with the real renderer (also deployed) |
| `tools/world-map.html`, `tools/world-map.js`, `tools/world-map.css` | World map tool (D66, D70, D77): every room on the map grid with its connections and checks; move, add and delete rooms, connect rooms and delete connections, then save; click to open a room in the editor; F3 opens the pickup report. Dev server only, not built |
| `editor/editor.js` | Room editor (F2, D56, D57): opens on the current room, switches rooms and makes new ones, mouse picking on a height layer, tools, picking things, keys, rebuilding the room from the edited data, save or export |
| `editor/room-edit.js` | One room being edited: place/erase edits, enemies, paths, exits and their connections, spawn/reset, name, biome, size (with a report), undo/redo (with the step's template changes), dirty state, cell descriptions; `roomErrors()`, `newRoom()` (pure, tested) |
| `editor/map-edit.js` | The world as the world map tool edits it (D77): `MapEdit` moves, adds and removes rooms, connects rooms with an exit in the middle of each facing wall (`addExit()`), removes connections with both exits (`disconnectExit()`), undo, and what a save sends (`changes()`) (pure, tested) |
| `editor/world-edit.js` | `world.json` being edited: connecting, disconnecting and renaming exits, a room's connections for its undo steps, a new room's map cell (`place()`, `unplace()`); `linkChoices()` (pure, tested) |
| `editor/templates.js` | The editor's enemy template actions (D58, D79): save the enemy settings as a new template, move them into their template, rename, delete; hands the edited templates to the game and the panel |
| `editor/defs-edit.js` | `defs.json` being edited: enemy templates (any of them, D79) added, updated, renamed and deleted; a step's template changes applied again for undo/redo (pure, tested) |
| `editor/errors.js` | The error list: errors grouped by file, and the room, tool and thing each one points at (pure, tested) |
| `editor/boxes.js` | `blocks`/`holes` entries edited cell by cell: untouched entries kept, loose cells merged greedily into boxes (pure, tested) |
| `editor/format-json.js` | JSON in the data files' hand-written style (pure, tested against every data file) |
| `editor/overlay.js` | Editor gizmos: layer grid, cursor, spawn and reset markers, paths, the picked thing's box, `EDITOR_LOOK` |
| `editor/panel.js` | Editor side panel (DOM): room list, tools and their fields, layer, room settings, actions, errors |
| `editor/save.js` | Posting edited files to the dev server; downloading them in a build |
| `tools/room-save.js` | Dev only: checks edited rooms, `world.json` and `defs.json` with the rest of `data/` and writes them; deletes rooms the world map removed |
| `tools/map-pr.bat` | Windows: opens one PR with only `data/rooms/`, `data/world.json` and `data/defs.json` changes, rooms and map together (validates first) |
| `tools/dev.bat` | Windows: installs packages if needed and starts the dev server, opening the game (or `dev.bat map`: the world map tool, `dev.bat showcase`: the asset showcase) |
| `tools/world-map.bat` | Windows: double-click to start the dev server on the world map tool (`dev.bat map`) |
| `debug/overlay.js` | Debug mode's wireframe collision boxes |
| `debug/readout.js` | Debug mode's stats readout (rates, buffer and quality, GPU resources, actions, position) |

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
  F3 search, Tab focus), unless Ctrl/Alt/Meta is held, so browser
  shortcuts still work (`Input.takes()`). No game key is a modifier (D54).
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
and everything below y = 0 (the grid), plus room objects as moving bodies;
above the room height is open. Grid cells hold a code (D60): 0 empty, 1
the room's edge, from 2 on the room's static block types; all but empty
are solid, and `typeAt()` gives the block type with its properties. What
a block does is asked of its properties after the move, never its name:
`touchedCell()` in `physics/collision.js` finds a touched cell with
`damage` (Game, each tick), and a `lethal` cell under the feet center
kills (Player on landing, Enemy when it stands or falls). Only blocks that never move or change are grid cells,
everything that moves or disappears is a room object (D40). At an exit the row of cells just
beyond the side is open (as high as the exit), so the wizard can walk
through; pushables never move outside the room.

Room objects are built by kind (`entities/kinds.js`) and drawn by kind
(`OBJECT_VIEWS` in `render/room-scene.js`); a test keeps both tables in
step with the kinds in `schemas/defs.schema.json`. Pushables are not grid
cells: each is a body with a `box()`, and
`moveAxis` clamps against bodies like against cells and reports which body
stopped the move. The player is a body too, so objects can rest on him and
never slide into him.

Only the wizard has a drop shadow for now (D50): falling objects' shadow is
behind `DROP_SHADOWS.fallingObjects` in `render/entity-view.js` (off), and
enemies have none. The drop shadow sits on the highest surface under the footprint
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

Moving platforms (D46) are room objects too, updated with the others
(lowest first, so a platform moves before what rides on it). Each tick a
platform asks `advance()` (`world/path.js`) where it would be next and
plans the whole move before making it: its riders (resting pushables on
top, recursively, and the wizard if he stands on any of them), anything
else in the new box or in the way of a carried crate (then it waits and
its path state stays), and the wizard: carried with `moveAxis` (so walls
scrape him off), then shoved clear of the new box by the smallest move of
at most `maxShove` along any axis. If none fits, it calls `Game.hurt()`
and waits. Carried crates keep whole-cell positions at stops (a tiny
rounding snap), and `push()` only moves a crate standing on whole cells.
A spiked platform (D82) is the same class with a `damage` from its type:
`Game.spiked` lists those objects, and each tick, right after the hazard
blocks, touching one (`touchesBox()`) calls `Game.hurt()` with the object,
whose view flares (`RoomScene.flareObject()`).

Collapsing blocks (D47) are room objects that never move but can vanish.
Each tick one checks whether the wizard stands on it (alive, grounded, feet
on its top, footprints overlapping); then it shakes for `shakeTicks` and
vanishes. While gone its `solid` is false, and the game leaves it out of
`Game.solids` (the objects others collide with) and `Game.bodies` (those
plus the wizard): `refreshBodies()` rebuilds both right after a `collapse`
or `regrow` event, inside the objects loop, so a crate resting on it falls
in the same tick. A block with a regrow time grows back once the time is
up and no body overlaps its cell.

Enemies (D48) are not room objects: `Game.enemies` holds them, built from
the room's `enemies` (type fields from `defs.json` merged with the room's
overrides). They update after the objects, so they see platforms and
crates where those are now. An enemy stands in a cell (a 0.6 box centered
on its floor) and only starts a step from whole cells: it asks its
movement behavior for the next step and walks one cell, counting the
distance walked so cells stay exact. A block, solid object, other enemy
or step up in the way turns it back (`turnBack()`, then `turnTicks` of
waiting). Unsupported, it falls; landing at −1 (a hole) or on a void cell
pops it (`dead`, gone until the room resets; `refreshBodies()` drops it).
Enemies are in `Game.obstacles` (what enemies collide with: solid objects
and live enemies) and in `Game.bodies` (what objects collide with), so
crates land on them and can't be pushed into them. Only solid enemies are
in `Game.solids` (what the wizard collides with); he walks through the
rest. A solid enemy moving carries the wizard standing on it (`moveAxis`,
so walls scrape him off) and shoves him clear of its new box with
`shoveClear()` (physics/collision.js, shared with platforms); if he is
pinned it turns back. Platforms carry resting enemies like crates and wait
while one is stepping on or off. After the enemies,
`bounceOffEnemies()` launches the wizard up (`Player.bounce()`) when his
feet crossed the top of a bouncy enemy this tick, and `touchEnemies()`
calls `hurt()` for the first hostile contact-attack enemy he touches
(`touchesBox()`: overlapping, or against a solid one within 0.02 on two
axes), skipping the one he just bounced off.

Spells: `Player.spells` lists the ones he knows and `Player.spell` is the
selected one; `spellNext` / `spellPrev` call `Player.selectSpell()` (a
`spell` event when it changed). On the cast action `castSpell()` (spells.js)
asks `Player.cast(cost, cooldown)` with the selected spell's tuning: while
dead or cooling down nothing happens; without the energy it reports
`deny`; else it spends the energy and runs the spell's effect
(`SPELL_EFFECTS` in spells.js). Zap's puts a `Bolt` at his hands in
`Game.bolts` (`Bolt.cast()`), aimed along `Player.aim()` (his
`targetFacing`). Bolts update after the enemies (`updateBolts()`), in
sub-steps of at most 0.1, and stop at the first live enemy, solid cell,
solid object or room side; a stopped bolt is reported (`zap`, with the
bolt, for the sparks) and dropped. The enemy it stopped at takes
`Enemy.hit(damage, 'zap')`: it is provoked and loses integrity, `hit` or,
at 0, `pop` (then `refreshBodies()`), before `touchEnemies()` runs, so a
popped enemy can't hurt him that tick; one left hostile takes
`Enemy.alarm()` (D80: it turns to him, a chaser searches where he stood;
an `alert` event unless it saw him already). A room object it stopped at
takes `hit(damage)` if it has one: a pushable with `integrity` reports
`hit` or, at 0, `break` (state `broken`, `solid` false, so
`refreshBodies()` drops it and what stood on it falls next tick);
indestructible ones return null. An enemy's `bolt` attack (D80) puts
`Bolt.shoot()`s in the same list when `discharge()` (combat.js) fires it (one,
or four for a `cross`, D81), with the enemy as their `owner`: a bolt
stops at the wizard (`hurt()` with the enemy), another enemy (or, after
a bounce, its own; `hit(damage, 'bolt')`), a block, an object (unharmed)
or the room side; a bouncing one glances off blocks and objects first
(`ricochet` events, passed to `RoomScene.sparks()` too). The wizard's
Zap+ (D95) bounces off blocks and the room side only, stopping at objects
as a Zap does. With Shield+, a shot stopping at his Shield turns round
(`Bolt.reflect()`, a `reflect` event) and flies on as his own bolt. Every hit on an
enemy, a spell's, a discharge's or a bolt's, goes through
`hitEnemy()` (combat.js): it emits `hit` or `pop`, and alarms one left hostile
(`Enemy.alarm()`, D81). Bolts belong to the room: `enterRoom()` clears
them.
Energy recharges in `Player.update()` and lives on the `Player`, so it
carries over between rooms.

## Game events

`Game.update()` returns what happened during the tick as `GameEvent`
objects (typedef in `game.js`): `{ type, ...details }`, e.g.
`{ type: 'push', object }`, `{ type: 'exit', exit }`, `{ type: 'hurt', amount }`.
Types so far: `jump`, `land`, `die`, `respawn`, `push`, `plug`, `shake`,
`collapse`, `regrow`, `pop`, `bounce`, `hurt`, `cast`, `deny`, `spell`, `zap`, `hit`,
`break`, `exit`, `room`; enemy events (and a hurt by an enemy) carry the
`enemy`, object events (`hit` and `break` of a crate too) the `object`,
`zap` the stopped `bolt`. `main.js` passes `zap` to `RoomScene.sparks()`
and `deny` to the HUD's energy bar. Game code records them with `emit()`; events raised
outside a tick (`hurt()` from the debug key) come out with the next tick's.
`main.js` rebuilds the room's views on `room`; later, sound, screen shake
and score popups read the same list (D41).

## Room reset

`Game.enterRoom()` rebuilds the room and its objects from data and places
the wizard (one `Player` for the whole game, D41). It runs on entry and
when the wizard respawns after dying (D24); `update()` then reports a `room`
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
- Composer: half-float buffers, 4× MSAA, render pass + one effect pass
  (bloom with mipmap blur, which scales with resolution by itself) (D13).
- Auto quality (D76): `AutoQuality` in `main.js` judges frame times in
  2 s windows and, after two slow ones (below 50 fps), lowers MSAA
  (4 → 2 → 0), then the render scale (0.75, 0.5), via
  `Renderer.setQuality()`. `?msaa=` / `?scale=` set quality by hand and
  turn it off. The debug readout shows the current level.
- `Renderer.compile()` runs on every room show, before the old room is
  freed: it compiles hidden objects too and compiles for the composer's
  buffer, so no shader compiles during play (D76).
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
frame: hud.setIntegrity(player.integrity, player.maxIntegrity)   cells rebuilt only on change
       hud.setEnergy(player.energy, player.maxEnergy, selected spell's cost)   segments written only on change
       hud.setSpell(player.spell, player.spells.length)   tag under the energy bar
       hud.setHintWanted(wantsFullscreenHint(stage height, DPR, fullscreen?))
       hud.update(dt)   takeMessages() → Terminal.push(); takeAnnouncements() → last one shown;
                        Terminal.update / lines(), bannerState(t), scrambleText()
```

The HUD is visual only and runs on frame time; it never feeds back into the
simulation. Its timing (`Terminal`, `bannerState`) is plain logic, tested
with made-up times; `hud.js` only moves the results into the DOM. Integrity
lives on the `Player`, which lasts the whole game (D41), so it carries over
between rooms. A missing string shows as `[key]`; the schema lists every key the
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
     editing `data/` or `schemas/` reloads the page, except a room the room
     editor just saved; the plugin also takes the editor's saves (see below);
   - `npm run validate:data` in CI and before deploys.
2. **Semantic checks** (`src/data/validate.js`), also at runtime: file present,
   schemaVersion, room id = file name, width + depth ≤ 32, known biome and
   object types, overrides only of existing type properties, blocks/objects
   inside the room and not overlapping, exits fit their side, the player
   hitbox fits at the spawn, start room exists, connections join existing
   exits on opposite sides with equal width, every exit connected once, the
   first row inside an exit free of blocks, objects and (at floor level) holes,
   every room on the world map in a cell of its own (`positions`).

Semantic checks run only when the schema pass is clean. Every problem is
reported (not just the first), naming the file and path, e.g.
`rooms/cache_hall.json › blocks[3]: cell [12,0,4] is outside size [12,4,12]`.
If the game cannot start, `ui/error-screen.js` lists them.

### Saving from the room editor

```
editor (page) ──POST /__editor/save {rooms, world?, defs?}──► tools/vite-plugin-data.js
world map ─POST /__editor/save {positions, rooms?, remove?,──►   └─ tools/room-save.js: read data/, swap in the edited files,
                                world?}                           drop removed rooms, merge positions,
                                                                  schema + semantic checks,
                                                                  write (and delete) them all or none
page ◄── { ok, errors, files } ────────────────────────────────┘  (no page reload for those writes)
open pages ◄── ws custom event neonmancer:data-saved { files }
```

`world.json` has two editors (D70): the room editor owns the connections,
the world map tool the positions. The map sends the positions of the rooms
it moved, merged into the file on disk; when the room editor sends the
whole file, the positions on disk win over its copy (only a new room's
cell is its own), so neither undoes the other's saves. The map also adds
and removes rooms and connections (D77): then it sends the new and
changed room files, the removed rooms' ids and the whole `world.json`
(its connections win; positions still merge, removed rooms' dropped).
After every save the dev server sends `neonmancer:data-saved`: the game
ignores it (it already shows its edits), the map reloads unless it has
unsaved changes. A room file added or deleted reloads open pages anyway
(the data bundle changed).

While editing, the page checks all its edited data (every edited room and
`world.json`, D57) with `validateData()` against its own copy of the rest
after every change, and hands the edited data to the game
(`content.rooms`, `content.links` from `linkMap()`) so `Game.enterRoom()`
rebuilds it and `RoomScene.show(game, { rebuild: true })` redraws the
static views too; walking through an exit reaches other edited or new
rooms. An exit not connected yet streams its own room's color.
Only the dev server writes files; a build downloads the files instead. The
endpoint takes only a JSON POST whose `Origin` (if any) is the dev server
itself (`refuseSaveRequest()`), so another site open in the browser can't
post a room to it.

Data files start with a `"$schema"` pointing to their schema, so editors like
VS Code offer completion and inline errors.

## Testing

`npm test` runs Node's built-in test runner over the `*.test.js` files in `tests/` (D7);
shared fixtures (small data files and games, fake input, grids) live in
`tests/helpers.js`.
Tests cover pure logic only (no DOM or WebGL).
