# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).
Details are in docs/design.md; the reasons in the decisions named (Dnn,
docs/decisions.md).

## [Unreleased]

### Added
- World map tool: exits show as marks on the room edges (cyan connected,
  magenta loose), and Delete removes one by a click on its mark (D102): a
  connected exit goes with its partner, a loose one alone. Connect uses a
  loose exit already in the facing wall before making a new one.
- World map tool: an Undo button, and **Undo last save** once there is
  nothing left to undo (D103): what the last save changed or deleted, even
  a deleted room after the reload, comes back as unsaved changes.

### Fixed
- The map tool's tests use a small world of their own instead of the
  real rooms, so map redesigns no longer break them.

## [0.3.0] - 2026-09-29

Phase 3 — Spells and pickups.

### Added
- Pickups and progress (D71): pickup types in `defs.json` and rooms; a
  `Progress` of save bits in blocks (spells, buffs, upgrades, fragments,
  secrets: 128) that survives room resets and death; found permanent
  pickups stay as gray ghosts; integrity and energy refills come back
  with the room.
- Data disks (D73, D74): the wizard learns Zap from a disk in Boot Sector;
  every permanent pickup plays an install animation, then a banner and a
  terminal line. Tab / Q switch spells.
- Spells: Shield (D73, D84), a lightning ring that blocks bolts, arcs and
  bursts; Firewall (D84), a ring of flames that also blocks touch and
  burns; Pause (D85), a bolt that freezes an enemy into a platform; Blink
  and Warp (D86), a dash that hits enemies and a teleport to the first
  wall; Cut & Paste (D87), a one-slot clipboard for crates and frozen
  enemies that goes from room to room.
- Upgrades (D95): Zap+ (the bolt bounces three times), Shield+ (the
  Shield sends bolts back) and the double jump, as expansion cards that
  replace their spell in the Tab cycle.
- Buff items (D93, D94): chips raising maximum integrity (8 → 12), energy
  (50 → 100) and the recharge rate; HUD bars grow with them.
- Backups (D97): 8 lives shown as pips; with none left the system crashes
  and he reboots on the nearest backup shrine, keeping everything found.
  Shrines are floor tiles that refill integrity, energy and backups.
- Score and secrets (D100): the score is worked out from what he has
  found, with the share of the world found; secrets are magenta stars
  with their own save bits.
- Fragments and access (D101): 64 key fragments, the modules of an 8×8
  boot key the HUD fills in; the central core raises the access level
  (16, 32, 48 fragments), shown as gold bands on his hat; exits locked to
  an access level show a gold Roman numeral; all 64 reboot the Grid (a
  placeholder end screen). Debug key K finds 8 fragments.
- Switches (D75): Zap targets and floor plates unlock `"locked"` exits;
  the exit he came in through stays open for him.
- Universal enemies (D78–D81): any look with any movement and attack in
  data; a `chase` movement; charged `burst`, `arc` and `bolt` attacks
  with bolt patterns and bounces; a "!" when an enemy notices him; any hit
  alarms an enemy. Viruses, Sentinels, shooters, towers, ricochets; cron,
  worm and crawler looks (D83).
- Spiked platforms (D82): platforms with `damage`, shaped as spikes.
- Glass crates (D96): every crate is frosted glass.
- World map tool (D66, D70, D77): `/tools/world-map.html` in the dev
  server shows every room and connection, moves, adds, connects and
  deletes rooms, flags rooms out of reach, and lists every permanent item
  by save bit (F3). `?room=<id>&edit` opens a room in the editor.
- Automatic quality fallback (D76): MSAA, then render scale, step down
  when frames run slow.
- Authored rooms (D90): `"authored": true` marks the author's real rooms.
- Test rooms Quarantine, Relay Station, Scheduler, Room 1, Fast Path,
  Clipboard, Upgrade Lab and Vault; editor tools and validation for every
  new type; showcase entries for every new look.
- `tools\dev.bat` and `tools\world-map.bat` start the dev server on the
  game, the map or the showcase (Windows).

### Changed
- Energy is whole units (D72): 50, one back every 0.2 s, Zap 10; the bar
  has segments of 10 and shows once a spell is known.
- Enemy types are templates (D79): a room enemy names its `template`,
  templates may `extend` in chains, and the editor updates, renames and
  deletes any of them. `contact` attacks are `touch` (D78).
- Enemies never walk into holes or onto void (D78); chasers route round
  walls, never meet head-on in a cell, and drop when the ground goes
  mid-step (D80).
- Color rules (D98, D99): red hurts, the room color is structure (with
  collapsing blocks), black is a pit (void is black mist), white a
  mechanism, cyan moves, magenta is the wizard, lime is pushable;
  Phantom Partition is pale violet. A test keeps biome colors clear.
- Every locked exit is a dark door panel with one light per switch (D101).
- Shaders compile while a room loads, hidden effects included; a data disk
  takes 7 draw calls instead of 36 (D76).
- `tools\room-pr.bat` is `tools\map-pr.bat`: one PR for room, map and
  template changes.
- `game.js` split into `spells.js`, `combat.js` and `switches.js`.
- Plans (D65, D67, D68, D88, D89, D91): Phase 3 split from Phase 4; the
  world is a maze with backtracking; targets towards 128 rooms; the spell
  roster (Compile, Fork, Scan, Pull planned for Phase 4).
- Docs pass: finished phase plans dropped from docs/design.md, stale
  descriptions fixed; CLAUDE.md, the decision log and this changelog
  condensed; code comments lose phase and step tags and design-history
  asides, and a wrong decision citation is fixed.

## [0.2.0] - 2026-09-27

Phase 2 — Hazards, combat, editor.

### Added
- Damage (D43): every source goes through `Game.hurt()`; a hit flashes
  the wizard and leaves him invulnerable for 1 s, blinking; at 0
  integrity he derezzes and recompiles at the room's reset point.
- Hazard and void blocks (D44): hazards hurt on touch, landing on void
  kills; animated looks. Test room Fault Line.
- Moving platforms (D46): objects on a `path` that carry the wizard and
  crates, wait for crates, shove or squeeze him (never fatally), with a
  guide line. Test room Transit Bus.
- Collapsing blocks (D47): give way 0.5 s after he stands on one,
  optionally regrow; may bridge holes. Test room Volatile Memory.
- Enemies and bugs (D48, D50, D51): data-driven enemy types with
  per-room overrides, cell-by-cell movement with physics, hostility shown
  by eye color, bouncy and solid enemies; movement behaviors in `src/ai/`.
  Test room Crawl Space.
- Zap and energy (D52, D54): E or Numpad 0 fires a bolt the way he aims;
  a bug takes two hits; an energy bar and a spell tag in the HUD.
- Destructible crates (D53): pushables with `integrity`, drawn with data
  bits.
- X-ray outline (D55): the hidden parts of the wizard show as a ghost.
- Room editor (D56, D57, D59): F2 edits the current room in place, one
  layer at a time: blocks, holes, objects, enemies, paths, exits and their
  connections, spawn and reset, room settings, undo and redo, live errors;
  the dev server saves rooms and `world.json` together, a build exports.
- Enemy templates (D58): enemy types that `extend` a base, made and
  updated from the room editor.
- Six biomes with their own surroundings (D61, D62).
- Room design checklist in docs/design.md.

### Fixed
- Volatile Memory's one-shot bridge crate starts on solid ground.
- A room without objects logged a three.js error on entry.
- `npm test` on Node 22+ runs through `tools/run-tests.js`.
- A platform could carry a solid enemy into the wizard.
- Room resets no longer recompile shared hologram shaders.
- Room editor review fixes (focus, saving, paths, platforms, Revert) and
  the dev server's save endpoint accepts only the game's own page.

### Changed
- Block types are open and data-driven (D60): properties, a look or a
  kind, `extends`; collapsing blocks are painted as block boxes.
- Edges between block types (D64): plain types join without a seam;
  hazard and void always show their outline.
- Glitch Zone is Glitchmire, hot pink.
- Drop shadows only under the wizard (D50).
- Test rooms hang off Boot Sector (D49).
- Versioning (D42): PATCH counts merged PRs since the phase's tag.
- Enemy code cleanup: shared collision helpers, enemy models by look.

## [0.1.0] - 2026-09-26

Phase 1 — Foundations.

### Added
- Project scaffolding: Vite, `node --test` unit tests, CI (test + build),
  GitHub Pages deploy of `main`, PR template, docs.
- Fixed-timestep loop (60 ticks per second, interpolated rendering) and
  action-mapped keyboard input.
- Isometric neon renderer: letterboxed 16:9 stage, render scale, fixed
  camera, thick neon edges scaled with render height, bloom, a fading
  floor grid, back walls and dark occluding faces.
- Game data with JSON Schemas, Ajv checks in the dev server, build and
  CI, semantic checks at load time and an error screen.
- Object type styles (D17), holes (D18) and pushable crates that fall,
  stack and plug holes (D25).
- The wizard as a hologram (D21, D22): walks along the grid axes, jumps
  exactly one block with coyote time and a jump buffer, falls, collides;
  a glowing drop shadow. Screen-relative movement on G (D38).
- Flip-screen exits with fades and exit effects in the destination color
  (D26–D33); rooms reset on entry and on death (D24); each room has its
  own respawn point (D39). Test rooms Boot Sector, Cache Hall, Stack Yard.
- HUD (D34): integrity bar, room banner, terminal messages, fullscreen
  hint (F), bundled fonts, all text in `data/strings.json`.
- Debug mode (F3): collision boxes, stats, room jump, invincibility, test
  damage (D37).
- Asset showcase (`/tools/showcase.html`, D20).

### Changed
- Phase 1 review: no leaked hole textures, shared shaders kept across
  rooms, allocation-free ticks (about 1.7× faster logic), render builders
  and validation split into focused parts; Phase 2 groundwork (D40, D41).

[Unreleased]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bluedragon-ctrl/Neonmancer/releases/tag/v0.1.0
