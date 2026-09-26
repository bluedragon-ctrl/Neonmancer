# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Damage (Phase 2 step 1): every source goes through `Game.hurt()`; after
  a hit his hologram flashes white, then magenta, and he is invulnerable
  for 1 s and blinks. At 0 integrity he derezzes into pixels and recompiles
  at the room's reset point after about 1.1 s. Death events name their cause (`hole` or
  `damage`), each with its own terminal line.
- Asset showcase: `wizard-hit` loops the hit flash, the blink and the derez.
- Hazard and void blocks (Phase 2 step 2): a `type` on room blocks, with
  their color and the hazard's damage in `defs.json` `blocks`. Touching a
  hazard hurts, and the block flares; landing on void is instant death
  (cause `void`, own terminal line). Both have animated looks: red pixels
  switching on and off, and grains sinking inside a black void block.
  Validation keeps spawn and reset points off them and raised exits off
  void. New test room Fault Line east of Stack Yard; showcase
  `block-hazard`, `block-void` and `blocks-in-room`.
- Moving platforms (Phase 2 step 3): a `platform` object type following a
  `path` in room data (from `at` through `points`, ping-pong or loop,
  speed, pause at the ends), the format patrolling enemies will share. The
  wizard and resting crates (and stacks) ride them; a crate in the way
  makes a platform wait; the wizard in the way is shoved aside, or hurt if
  there is no room, never killed outright. A glowing guide line through the
  middle of each path.
  Validation checks path legs, blocks on the path and exits. New test
  room Transit Bus behind a raised exit on Fault Line's lookout; showcase
  `platform` and `platforms`.
- Collapsing blocks (Phase 2 step 4): a `collapsing` object type that
  shakes for 0.5 s once the wizard stands on it, then breaks into pixels
  and is gone; whatever stood on it falls. Crates don't trigger them. An
  optional `regrow` time in room data brings one back once its cell is
  clear. They may stand in holes as bridges that give way. New test room
  Volatile Memory behind a raised exit on Transit Bus's high ledge;
  showcase `collapsing` and `collapsing-cycle`.
- Enemies and bugs (Phase 2 step 5): data-driven enemy types in
  `defs.json` `enemies` (movement, attack, hostility, aggro range,
  integrity, damage, speed, bounce, color) and an `enemies` list in room
  data with per-enemy overrides. Movement behaviors in `src/ai/` (`patrol`
  on the shared path format, `stationary`). Enemies step cell by cell,
  turn back when blocked, walk off ledges and fall, ride platforms, and pop
  in holes and on void blocks; crates rest on them. The wizard walks
  through them; touching a hostile one hurts, and landing on a bouncy one
  (every bug by default) launches him 2 blocks up. The bug: a mint-green
  hologram ball whose eyes show its mood (red hostile, amber provoked,
  cyan peaceful), hopping as it walks and squashing when bounced on. Enemy
  collision boxes in debug mode. New test
  room Crawl Space behind a raised exit on Volatile Memory's high ledge;
  showcase `bug`, `bug-provoked`, `bug-peaceful`, `bug-bounce`, `bug-pop`.
- Room design checklist in docs/design.md: reach, timing budgets,
  readability and soft-lock checks collected from playtests; the basis for
  the Phase 3 room design skill and level review subagent.

### Fixed
- Volatile Memory: the crate on the one-shot bridge now starts on a plain
  ledge, so it can be pushed onto the bridge from solid ground (pushing
  from a collapsing block took as long as the block's shake).
- A room without objects logged a three.js error on entry.
- `npm test` failed on Node 22+ (CI) after the Node 20 change: it now runs
  through `tools/run-tests.js`, which lists the test files itself.

### Changed
- Drop shadows only under the wizard for now (D50): falling crates' shadow
  is switched off (`DROP_SHADOWS` in `render/entity-view.js`); enemies
  have none.
- Test rooms hang off Boot Sector instead of one long row (D49): new west
  and south exits lead to Crawl Space and Transit Bus, so every test room
  is at most two rooms from the start.
- Phase 2 planned step by step (docs/design.md, D43); biome environmental
  effects moved to Phase 4.
- Versioning (D42): `package.json` holds the phase (MAJOR.MINOR.0) and
  the patch number counts pull requests merged since the phase's tag,
  computed at build time.

## [0.1.0] - 2026-09-26

Phase 1 — Foundations.

### Added
- Project scaffolding: Vite, placeholder title screen, unit tests with
  `node --test`, GitHub Actions CI (test + build), GitHub Pages deploy of
  `main`, PR template, docs skeleton.
- Fixed-timestep game loop (60 logic updates per second, interpolation
  alpha for rendering, capped catch-up).
- Action-mapped keyboard input with default bindings; taps shorter than a
  tick are never lost.
- Isometric neon renderer: letterboxed 16:9 stage, capped pixel ratio and
  render scale (`?scale=0.5`), fixed isometric camera, thick neon edges
  scaled with render height, bloom, amber room grid on a fading dark-gray
  infinite floor grid, back walls and dark occluding block faces.
- Game data in `data/` (rooms, object types, biomes, world) with JSON
  Schemas in `schemas/`; Ajv check in the dev server, the build and
  `npm run validate:data` (CI); semantic checks at load time; the start
  room is built from JSON; error screen listing every data problem.
- First room "Boot Sector" with two crates (not pushable yet).
- Object type styles (dashed edges, face marks, tinted faces) so types
  differ by shape, not only color; box variants as named types in
  `defs.json`, shown side by side in Boot Sector.
- Floor holes in room data (`holes`): drawn as black pits on a faintly
  tinted room floor, validated (inside the room, nothing standing in them,
  spawn not above one).
- The wizard, drawn as a hologram (dark core, glowing silhouette,
  scanlines, neon outline, glowing eyes): magenta cone body and tilted
  pointy hat, cyan ball head and floating hands; walks along the grid axes
  (Right ↗, Up ↖, Left ↙, Down ↘), jumps exactly one block high
  (with coyote time and a jump buffer), falls with gravity and collides
  with blocks, objects and the room sides. Motion is interpolated between
  logic ticks; a glowing drop shadow shows where he will land.
- Falling into a hole: the wizard drops into the pit and respawns at the
  room spawn.
- Asset showcase (`/tools/showcase.html`): every character and object look
  on a turntable, also on the deployed site.
- Pushable crates: walk into one to shove it a cell (hold to keep pushing);
  crates fall off ledges, stack, rest on the wizard, show a drop shadow
  while falling and can't be pushed with something on top. A crate pushed
  into a hole plugs it and the tile becomes floor.
- Dying resets the room.
- Flip-screen exits: doorways in the back walls leading into a dark
  tunnel, gaps on the front sides; walking out loads the connected room at
  the matching exit (offset along the edge kept), which becomes the respawn
  point. Rooms fade out and in through black. Exits show where they lead
  in the color of the next room: dashes flowing into the doorway tunnel,
  arrows gliding out of front exits (also in the asset showcase).
  Crates can't be pushed out of a room; the first row inside an exit is
  validated to be free.
- Three connected test rooms: Boot Sector, Cache Hall (pit puzzle) and
  Stack Yard (stacked crates, Glitch Zone color).
- HUD: integrity bar (8 cells, flashing when lost, blinking when low), room
  name banner that decodes in on entering a room, terminal messages typed
  out bottom left (start, death, respawn, plugged hole), and a fullscreen
  hint while the game is drawn below 1080 pixels high. F toggles
  fullscreen. Bundled fonts (Orbitron, Share Tech Mono).
- `data/strings.json` with its schema: every UI text by key.
- `say()` and `announce()` (`src/core/messages.js`): any module can print a
  terminal message or show a banner (used for room names).
- Integrity: falling into a hole drains it, respawning restores it; it
  carries over between rooms.
- Debug mode (F3): wireframe collision boxes for blocks, the wizard and
  pushables; a stats readout (room, tick/frame rate, buffer size, actions,
  position); jumping straight to the next/previous room (`]` / `[`);
  toggling invincibility (`I`); and a key to test damage (`H`) through the
  same `Game.hurt()` real hazards will use later.
- Screen-relative movement as an alternative to the default grid-aligned
  keys: `G` switches between them, with a terminal message and a small
  permanent HUD tag (bottom right) naming the active mode.
- Rooms define their own death-respawn point (`reset`, defaults to `spawn`)
  instead of respawning wherever the wizard last entered through a door.
- `?msaa=0` turns multisampling off; the debug readout shows GPU shaders,
  geometries and textures.

### Changed
- Phase 1 code review: rooms free the floor's hole-mask texture (it leaked
  one per room entry and death), keep shared shaders across room changes,
  and a respawn rebuilds only the object views. Window resizing
  reallocates buffers only once it pauses.
- The occupancy grid is typed arrays and the logic tick no longer
  allocates per entity: about 1.7× more logic ticks per second.
- Phase 2 groundwork: room objects are built and drawn by kind; grid cells
  hold a type (D40); one Player for the whole game owns integrity, and the
  tick returns typed events (D41).
- Shared render builders (`neonLines`, `fadingLines`, `shadedFaces`),
  `main.js` and `validateRoom()` split into focused parts, pure helpers
  moved out of three.js view modules.

### Removed
- The four box-look crates in Boot Sector (the asset showcase shows them).

[Unreleased]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bluedragon-ctrl/Neonmancer/releases/tag/v0.1.0
