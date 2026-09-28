# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- World map tool edits the world's structure (D77): tools to add a room
  (a new, empty 12×4×12 room in a free cell), connect two rooms (each
  gets an exit in the middle of the wall facing the other, moved along
  the wall if that spot is taken or blocked), and delete a room (with the
  exits leading into it) or a connection (with both its exits). Undo
  covers every edit; Save writes the new, changed and removed room files
  and `world.json` after the usual checks.
- Automatic quality fallback (D76): when frames run below 50 fps for a
  few seconds, multisampling steps down (4 → 2 → 0), then the render
  scale (0.75, 0.5), so weak laptops stay smooth. `?msaa` / `?scale`
  still set quality by hand. The debug readout (F3) shows the level.
- Switches and locked exits (Phase 3 step 4, D75): a Zap target (a fixed
  block a bolt switches on and off) and a floor plate (on while a crate,
  an enemy or the wizard stands on it), both white with a square
  bull's-eye that lights up when on. An exit with `"locked": true` is
  solid until every switch in its room is on, closes again when one goes
  off (never on the wizard), and stays open for him if he came in through
  it. A locked doorway is a sinking panel, a locked front exit retracting
  bars, with one light per switch. New test room Relay Station (east of
  Cache Hall), and a locked doorway with a plate in Stack Yard. Editor:
  switch types in the Object tool, a Locked checkbox for exits. Showcase
  `?asset=switches`.
- Data disks (Phase 3 step 3, D73): taking a disk plays an install
  animation on the wizard (its bits spiral in, rings sweep up him in the
  spell's color, a white flash; he plays on meanwhile, D74). A
  second spell, Shield: a crackling neon-blue ring of lightning round him
  for 7 s (20 energy); it will block projectiles once there are any. Its
  disk lies in Cache Hall, behind the pit; with two spells Tab / Q switch
  between them. Each spell has a color in `defs.json`. Showcase
  `?asset=install`, `?asset=shield`, `disk-shield`.
- Pickups and progress (Phase 3 step 2, D71): pickup types in
  `defs.json` and rooms; a `Progress` model of save bits found (112, in
  blocks: spells, buffs, equipment, fragments) that room resets and death
  leave alone. The first data disk: the wizard starts without Zap and
  learns it from a disk in Boot Sector (banner and terminal line; the HUD
  spell tag appears). A found disk is a gray ghost on revisits.
  Integrity and energy refills (Fault Line, Crawl Space) come back with
  the room. Looks in the showcase (`?asset=disks`, `?asset=refills`);
  validation and room editor support (pickups in the Object tool).

- World map tool (Phase 3 step 1, D66, D70): `/tools/world-map.html` in
  the dev server (not built, never shown to players) draws every room as a
  node in its biome color on a map grid, with lines between connected
  exits (dashed when a connection runs across the map) and the start room
  marked. Drag rooms to free cells and save (Ctrl+S; Ctrl+Z undoes a
  move); click a room to open it in the room editor. The side panel lists
  data errors, rooms the start can't reach and test rooms more than two
  rooms from the start (D49).
- `world.json` `positions`: every room's cell on the world map, validated
  (one per room, no two in one cell).
- Room editor: a new room gets the free map cell nearest to the room it
  was made from.
- Dev server: `?room=<id>` starts the game in that room and `?edit`
  opens the room editor on it.
- `tools\dev.bat` (Windows): starts the dev server and opens the game,
  or the world map (`map`) or the asset showcase (`showcase`).

### Changed
- Shaders of hidden effects (pixel bursts, the cast flare) and of each
  new room are compiled while the room loads, for the buffer they are
  really drawn into, instead of on first use during play (D76).
- A data disk takes 7 draw calls instead of 36 (its zero bits are one
  line); it looks the same (D76).
- Energy in whole units (D72): 50 at most, one back every 0.2 s, Zap
  costs 10. The HUD energy bar has segments of 10 energy whatever the
  spell (spell costs stay multiples of 10); hidden until the first spell.
- `tools\room-pr.bat` is now `tools\map-pr.bat`: one PR for room and
  world map changes (branch `feat/map-<date>`, title `feat(map): …`); its
  summary says whether rooms, the map or enemy templates changed.
- Phase plan (D65): the old Phase 3 splits into Phase 3 (v0.3, spells and
  pickups) and Phase 4 (v0.4, Wardens, saves, map, tooling); polish moves
  to Phase 5. Phase 3 step plan in docs/design.md: a world map tool for
  the developer first (its own page, room positions in `world.json`,
  D66), a spell roster discussion step, and a world-targets discussion
  opening the score step.
- Design direction (D67): exploring is part of the game, so development
  tools stay hidden from players; the world is a maze with backtracking,
  so a room need not be fully solvable on first arrival; later spells let
  the wizard speedrun simple rooms or solve them differently; every
  permanent pickup is one save bit and shows grayed out on revisits.
- Switches (D69): pressure plates held by a crate and targets hit by a
  bolt unlock exits; a new Phase 3 step after data disks.
- World targets (D68): towards 128 rooms (more small rooms), up to 16
  spells including upgrades, buff items (integrity, energy, jump) and
  access levels locking areas; stronger spells and buffs skip rooms and
  open areas; saves keep what the wizard has, no per-room data. Phase 3
  gains a buff-items step and access levels.

## [0.2.0] - 2026-09-27

Phase 2 — Hazards, combat, editor.

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
  (every bug by default) launches him 2 blocks up. `solid` enemies block
  him, carry him when he stands on them and shove him (D51). The bug: a mint-green
  hologram ball whose eyes show its mood (red hostile, amber provoked,
  cyan peaceful), hopping as it walks and squashing when bounced on. Enemy
  collision boxes in debug mode. New test
  room Crawl Space behind a raised exit on Volatile Memory's high ledge;
  showcase `bug`, `bug-provoked`, `bug-peaceful`, `bug-bounce`, `bug-pop`.
- Zap and energy (Phase 2 step 6): E or Numpad 0 fires a Zap bolt the
  way the wizard aims, for 2 of his 10 energy (1 per second comes back, a
  0.25 s cooldown between casts). The bolt stops at the first enemy,
  block, object or room side; a hit takes 1 integrity and provokes the
  enemy. A bug now takes two hits (D52): the first flashes it and leaves it
  glitching, the second pops it. A lime energy bar under integrity, one
  segment per Zap, flashes when a cast fails. Spell tuning in `defs.json`
  `spells`; bolt boxes in debug mode. The selected spell shows in a tag
  under the energy bar; Tab switches spells once there are more (D54). Crawl Space gets an amber bug with 4
  integrity; showcase `zap-bolt`, `zap-bug`, `zap-crate`.
- Destructible crates (D53): a pushable type with `integrity` breaks into
  pixels once Zaps have taken it all; what stood on it falls. `crate_cross`
  is destructible (1 Zap). Crates show data bits: the plain `crate` a
  whole grid of small pale squares on each face (new `bits` mark, tinted faces like `crate_cross`), a
  destructible one the grid with holes. Showcase `zap-break`.
- X-ray outline (Phase 2 step 7): the parts of the wizard hidden behind
  blocks, objects or enemies show through as a ghost with a bright rim in
  his own colors (D55); it blinks and flashes with him and is hidden while
  he is dead. Boot Sector gets a 2-high wall near the front to walk
  behind; showcase `xray` (showcase assets can now stand still).
- Room editor, static part (Phase 2 step 8a, D56): F2 freezes the game
  and edits the current room in the real look, one height layer at a time.
  Place and erase plain, hazard and void blocks, holes, objects (crates,
  collapsing blocks with a regrow time), the spawn and reset points; set
  the room's name, biome and size; undo and redo; errors listed live. F2
  again plays the edited room. In the dev server Save checks the room with
  all the data and writes `data/rooms/<id>.json`, keeping untouched block
  entries and the hand-written JSON style; the deployed build exports the
  file. Keys typed into the editor's fields no longer reach the game.
- Room editor, moving part (Phase 2 step 8b, D57): Enemy, Path and Exit
  tools (keys 6–8; Spawn and Reset move to 9 and 0). Place enemies with
  their movement, hostility, bounce and solid settings, or click one to
  pick and change it; draw platform and patrol paths cell by cell (corners
  added, right click takes a point off; mode, speed and pause in the
  panel), shown as dashed lines; open exits in edge cells and pick what
  they lead to from the fitting exits of other rooms. Platforms can be
  placed now. The panel lists every room to switch to and makes new, empty
  ones. Save writes all edited rooms and `world.json` together once the
  whole data checks out; the build exports each changed file.
- Enemy templates (D58): an enemy type in `defs.json` can `extend` a base
  type with only the values it changes, and looks like its base. The room
  editor saves the Enemy panel's settings as a template, lists templates
  in the Type list, and Update template moves an enemy's own settings into
  its template; `defs.json` is saved with the rooms. The Enemy panel also
  sets integrity, damage, speed and color.
- Room editor improvements (second review, D59): **hide above** draws the
  room without what is above the edited layer; a line names what is in
  the cell under the mouse; Delete removes the picked object, enemy or
  exit; a picked exit's position and floor level are set in the panel,
  and a new width goes to the exit it leads to too; an enemy's editor-made
  id follows its type (`bug_1` → `virus_1`); errors are grouped by file
  and a click goes to the room, tool, thing and layer; a new room never
  saved can be discarded; templates can be renamed and deleted, and
  template changes are undo steps of their room; shrinking a room moves
  spawn and reset inside and lists what was dropped. Editor logic moved
  into tested modules (`defs-edit.js`, `errors.js`, `linkChoices()`), and
  a room's text is kept until it changes, so the unsaved check doesn't
  re-format every open room on each painted cell.
- Room design checklist in docs/design.md: reach, timing budgets,
  readability and soft-lock checks collected from playtests; the basis for
  the Phase 3 room design skill and level review subagent.
- Six biomes (D61): Home Lattice (core), Glitchmire, Frostbyte Wastes,
  Abyssal Buffer, Firewall Citadel and Phantom Partition (special), with
  names and room colors; looks planned in docs/design.md.
- Biome surroundings (D62): an optional `look` in `biomes.json` sets the
  background, the color and fade of the floor grid outside the room, the
  wall grid brightness and the bloom strength; each of the six biomes has
  its own.

### Fixed
- Volatile Memory: the crate on the one-shot bridge now starts on a plain
  ledge, so it can be pushed onto the bridge from solid ground (pushing
  from a collapsing block took as long as the block's shake).
- A room without objects logged a three.js error on entry.
- `npm test` failed on Node 22+ (CI) after the Node 20 change: it now runs
  through `tools/run-tests.js`, which lists the test files itself.
- A moving platform could carry a solid enemy into the wizard (mid-jump
  beside it); it now waits, as it does for crates.
- Room resets no longer free the hologram materials that the new views
  share, so enemy shaders aren't compiled again after each death or
  re-entry.
- Room editor review fixes: F2 leaves the editor even while a panel field
  has focus, and the typed value counts; leaving checks and plays the room
  with the edit made that same frame; placing a collapsing block again
  without a regrow time clears its `regrow`; the dev server takes saves
  only as a JSON POST from the game's own page, so other sites open in the
  browser can't overwrite rooms; `tools/room-pr.bat` takes a description
  with `( ) & < > |` in it.
- Room editor, second review: a click with the Object tool on a platform of
  the same type no longer replaces it and drops its path (an object of
  the same type only takes the regrow time); the Path tool no longer gives
  a stationary enemy an invalid path; Save checks an edit made that same
  frame and ignores a second click while saving; Ctrl+S in a panel field
  saves instead of opening the browser's Save Page; the cursor follows a
  layer or tool change without moving the mouse; blanking the room name
  shows the name again; Revert is enabled only when the room or its own
  connections changed, and a room whose connections changed shows as
  unsaved; `tools/room-pr.bat` sends `data/defs.json` (enemy templates)
  too.

### Changed
- Block types are open and data-driven (D60): `defs.json` `blocks` lists
  every block type (`block`, `hazard`, `void`, `collapsing`,
  `collapsing_regrow`) with a look or a kind, a color and properties
  (`damage`, `lethal`, `regrow`); variants `extend` a base type. The grid
  holds a type code per cell and the rules ask about properties, not
  names. Collapsing blocks are painted as block boxes (each cell still runs
  as its own object; regrow time on the type), so Volatile Memory's
  bridges are one line each. The editor has one Block tool with a type
  list; tools are now 1–8.
- Block edges (D64): neighbouring plain blocks of different types join
  without a seam, each edge in the color of a type around it; hazard and
  void blocks always show their outline, and a line they share with plain
  blocks is theirs alone (no amber showing around the thin void frame).
- Glitch Zone is now Glitchmire (`glitchmire`), hot pink instead of
  magenta so collapsing blocks stand out; Stack Yard uses it.
- Enemy code cleanup: shared collision helpers (`restsOn()`, `cellBox()`,
  `REST_EPS`) replace copies in every entity; `EnemyView` draws any enemy
  type through `ENEMY_MODELS` (the bug is `BUG_MODEL`); fewer allocations
  per enemy per tick; shared bug geometry.
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

[Unreleased]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bluedragon-ctrl/Neonmancer/releases/tag/v0.1.0
