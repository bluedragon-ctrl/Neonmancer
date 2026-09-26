# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
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
