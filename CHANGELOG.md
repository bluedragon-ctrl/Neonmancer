# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).
Details are in docs/design.md; the reasons in the decisions named (Dnn,
docs/decisions.md).

## [Unreleased]

### Added
- Boosts (D152): temporary pickups for simple secrets. Overdrive, Patch and
  Overclock last until the room resets; the Sparkle trail and Rainbow hat
  until his next death or a reload. Nothing is saved or scored.
- The Atrium hub (5.6a, D151): north and south doors, a backup shrine, and
  the two disk halls `shield_hall` (Shield) and `freeze_hall` (Pause).
- The Lattice tutorial (5.5, D148): the new start `boot_up`, `first_steps`,
  `zap_port`, `first_light` and a small `atrium`, with hint screens; the
  old test start joins the dev wing.
- Audio engine (5.1, D138): `data/audio.json` (music tracks, sound
  effects as files or ZzFX recipes), Howler music with looping and
  crossfades, the Options music and sound sliders wired, game events play
  the sound named like them, a missing file is a silent stub. Two
  placeholder effects (`pickup`, `hurt`) to hear it.
- Sound effects pass (5.2, D139): symbolic ZzFX effects for jump, land,
  pushes, hits, derezz bubble pops, electric spell zaps, pickups, doors,
  switches, alerts and the menus; `type:detail` sounds per spell, pickup
  kind and death cause.
- Linked and timed switches (D140): locked exits, the new gates and
  bridges, and platforms name the switches that power them (`switches`;
  without it every switch in the room, as before). Timed targets and
  plates (`target_timed`, `plate_timed`, a type's `timer`) go off by
  themselves, blinking and ticking as they count down. Gates sink to
  open; bridges rise; a platform with switches runs only while powered.
  Room editor "Switches" field, reachability checker, showcase
  (`?asset=gates`, `?asset=timed-switches`), sounds `gate` and `tick`,
  and the test room `switch_works` south of Fast Path.

- Room editor Switch tool (D142, key 0): pick a switch, click gates,
  platforms and exits to link or unlink them; hovering a switch, gate,
  platform or locked exit names and draws its links; the Object tool
  picks switches and platforms (a timed switch's timer is editable);
  Alt+click with the Block tool copies a block's type and switches.

### Changed
- Doors (D151): a locked exit is a pane of white glass like the switch gates;
  one `requires` list on an exit replaces `locked`, `switches` and `access`
  (switch entries and an access level); lock lights glow red until their
  switch is on, then green, and the access numeral sits small in the top
  corner, red until his level is enough, then green. The authored rooms
  Boot Sector and `room_1` and the test rooms `decoy_lab` and `zap_port`
  were migrated.
- Crates are neon green instead of lime (D150); the tutorial screen says so.
- The dev wing (5.4, D147): `world.json` `dev` lists the test rooms that
  only the dev server shows; a build for players leaves them out and walls
  up exits that led into them. Boot Sector, `room_1` and `room_2` stay in
  the player world until the new start (5.5).
- Room editor Object tool (D146): its type list is in groups (crates,
  platforms, decorations, core, then pickups by kind), each type saying
  what it does, each permanent pickup where it lies in the world
  (`not placed`, `in room_1`).
- Object types may `extend` a base type (D145), like block types: the
  crate variants and timed switches list only what they change.
- Gate block types (D144): a bridge is `"start": "gone"` (was
  `"inverted": true`). The room editor's Block tool lists block types in
  groups (Static, Switch gates, Collapsing (step) gates), each saying
  what it does.
- Room editor: a click hits what is seen. With the Block, Object, Enemy
  and Switch tools, a block or item drawn on the layer is hit through its
  top or side, not the floor cell behind it; the top of a block one layer
  down is still the cell above it. The Path tool hits objects and enemies.
- Room editor Switch tool: the first click on a gate or exit on every
  switch links it to just the picked switch (it used to unlink it, and
  could unlock a locked exit); deleting a switch takes it out of every
  link; a gate's switch ids are sorted, so the same switches in another
  order merge into one box.
- Room editor: switches (targets, plates, timed ones) are placed only
  with the Switch tool, from its own type list: a click on a free cell
  places one and picks it, a right click erases one. The Object tool's
  list no longer has them (it still picks a placed switch).
- Room editor Switch tool links from either side, mostly from the panel:
  a picked switch ticks the gates, platforms and exits it powers, a
  picked gate, platform or exit ticks its switches (or every switch in
  the room); hovering a row lights the link up. With something picked a
  click never places a switch, and picks another thing only with Shift;
  the hover line and the cursor's color say what a click will do.
- Room editor Object tool never overwrites: a click on an object, enemy
  or pickup picks it; a block or another type there wants erasing first.
- Room design checklist and the level-review subagent: check the race
  of a timed switch by hand (the reachability checker ignores timing).
- Switch gates are white glass boxes, and a switched-off one is not
  shown in play, only in the room editor (D142).
- Targets and plates are white frosted glass like the gates (D143):
  dark glass while off, bright while on; a target's bull's-eye only on
  its seen faces, a plate a thin glass tile.
- Gate blocks (D141): collapsing blocks and the new gates are one block
  kind, `gate`, with a `trigger`: `switch` (gates, bridges) or `step`
  (collapsing blocks, `regrow` as before). Gates are block types placed
  as boxes, a box's `switches` linking all its cells. Both sink into the
  floor to go and leave a dashed outline while they will come back; a
  collapsing block no longer derezzes.

## [0.4.0] - 2026-10-01

Phase 4: saves, map, four new spells, the reachability checker, design
skills, the boss engine and the two Lattice bosses (D104–D137).

Phase 4 splits into 4a (saves and UI) and 4b (spells, Firewall Wardens as
bosses that drop loot, tooling) (D104, D105).

### Fixed
- `tools\map-pr.bat` sends `data/lore.json` too: screen texts written in
  the room editor went missing from the PR (and a room showing a new
  text failed the data check there). It already sent the monster
  editor's templates (`data/defs.json`, and rooms a rename changed); its
  notes and PR summary now say so.

### Added
- Boss two, the Gatekeeper (D137, step 4.7): the `proto_gatekeeper`
  prototype becomes the second boss, harder (16 integrity, three phases),
  named on the boss bar; it drops the +10 energy buff in the test arena
  `boss_plates` (renamed Gatekeeper Arena).
- Boss one, Null Pointer (D136, step 4.6): the `proto_warden` prototype
  becomes the first boss, with its name on the boss bar; it drops
  fragment 7 in the test arena `boss_arena` (renamed Null Pointer Arena).
- Boss engine (D135): a `boss` block in an enemy template (phases by
  integrity share that change how it fights, teleports, plate armor),
  `height` for bodies up to two cubes high (plate armor shows as a white
  dashed shell that lifts away on a plate), a boss bar on the HUD, the
  three gold rings of the boss mark (`render/boss-mark.js`), a room
  enemy's `drop` (held until the boss is beaten; the boss stays away
  once it is found; arena doors never lock), the drop
  picker in the room editor, the boss block in the monster editor, two
  test arenas off Build Yard, showcase `?asset=bosses`.
- Boss design (D134): one-cell bosses one or two cubes high with a boss
  bar; boss 1 (bug body, three gold rings) shoots and teleports, boss 2
  (a big virus) chases and winds up a surround burst, and is hurt only
  on an overload plate.
- Design skills (D132): `.claude/skills/room-design` and `enemy-design`,
  and the read-only `level-review` subagent (`.claude/agents/`) that runs
  `validate:data` and `check:reach` and reviews a room against the room
  design checklist.
- Reachability checker (D131): `npm run check:reach` searches every
  room with jump height, the double jump, crates (pushed, pulled, cut and
  pasted) and the spells found so far, and the world as a fixpoint of
  abilities, access level and rooms. It prints the order the world opens
  in and fails on an exit, pickup or room that stays out of reach;
  `<room>` checks one room (`--with` abilities, `--from` an exit),
  `--rooms` lists what each one needs. Runs in CI and the deploy; the
  world map tool shows its problems and warnings under CHECKS.
- Spell help texts in `data/lore.json` (`help_zap`, `help_shield`,
  `help_firewall`, `help_pause`, `help_blink`, `help_warp`,
  `help_cut_paste`, `help_compile`, `help_scan`, `help_pull`): a screen
  decoration can name one to explain a spell near where it is found
  (D118). No room uses them yet; Fork gets one once it is built.
- Help texts for the upgrades (`help_zap_plus`, `help_shield_plus`,
  `help_double_jump`), fragments, the core and access levels
  (`help_fragments`, `help_core`, `help_access`), and one per level for
  a screen by an access-locked exit (`access_1` to `access_3`).
- Fork spell (D129, slot 8, 25 energy): a hologram of him in the free
  cell in front of him for 10 s; it holds a floor plate down and hostile
  enemies that see it go for the nearer of it and him (they aim their
  bolts and arcs at it). One at a time. Blue bits fly into the cell as it
  grows in; an aim marker. Disk in the new test room Decoy Lab, north of
  Build Yard (a plate only a decoy can press, a locked exit), with Decoy
  Vault behind it; showcase `?asset=fork,disk-fork`.
- Scan spell (D128, slot 9, 15 energy): a violet square wave spreads from
  his feet out to 6 units; fake blocks it reaches derez (block type
  `fake`, looking like any plain block; a pickup may hide inside one),
  hidden exits (`"hidden": true`, wall until then) open. Revealed until
  the room resets. A Hidden checkbox for exits in the room editor. Disk in
  the new test room Hidden Layer, east of Build Yard, with Secret Cache
  behind its hidden exit; showcase `?asset=scan,disk-scan`.
- Compile spell (D125, slot 7, 50 energy): a crate (the dashed one) in
  the free cell in front of him for 7 s; it falls, plugs a hole, can be
  pushed and pulled, blinks before it derezzes (a plugged hole opens
  again). Gold bits fly into the cell as it grows in; an aim marker.
  Disk in the new test room Build Yard, east of Tractor Bay; showcase
  `?asset=compile,disk-compile`.
- Pull spell (D124, slot 10, 15 energy): the first crate or enemy in line
  the way he aims, within 6 cells, slides one cell towards him; a crate
  as if pushed, an enemy over anything (into a hole it pops), alarmed and
  blaming him. A tractor beam of pixel rings, a marquee on the target, an
  aim marker. Disk in the new test room Tractor Bay, east of Cache Hall;
  showcase `?asset=pull,disk-pull`.
- Memory stack decoration (`memory_stack`, D123), 1×1×1: glass memory
  plates with chips, a read/write light rising past them. Stacked side by
  side and on top of each other they make a memory wall, the light
  running across it in step. Showcase `?asset=memory`.
- Home Lattice settled (D121), the first biome of the Phase 4b review: a
  kernel city with enemies in tiers. New peaceful `glowbug` template (a
  pale gold bug, harmless, bouncy); plans for data flows and random glass
  wall panels in the Phase 5 visual pass (docs/design.md, Biomes).
- Monster editor (D120), `/tools/monster-editor.html` in the dev server
  (`tools\dev.bat monsters`): the enemy templates with a form made from the
  schema, where each value comes from, a live preview, variants in colors
  of their own, rename and delete; the room editor links to it and takes
  in what it saves.
- Decorations (D117), a new object kind placed with the room editor:
  the data pillar (`data_pillar`, 1×3×1), a glass shaft round a core with
  four cables of data climbing one face, and the screen (`screen`,
  1×1×1), a blue glass terminal with scrolling code on a slab. Both are
  fixed bodies in the room's color, facing +z or +x (click one again in
  the editor to turn it); showcase `pillars` and `screens`.
- Screen texts (D118): a screen can show a short hint or piece of lore
  from the new `data/lore.json`. When the wizard comes near, his
  terminal prints it in blue, once per visit to the room; an unread
  screen blinks a light on its top. The room editor picks a screen's
  text, writes new ones and changes them; they are saved with the rooms.
- One glass helper (D116): crates and decorations build glass with
  `glassBox()` and a `GLASS` preset.
- A working rule for static looks (D115): the camera never turns, so
  detail goes only on the faces it sees.
- The wizard's body language (D114): his head bobs and his hands swing as
  he walks, he breathes, floats his hands and blinks while standing,
  raises his hands and stretches in the air, squashes on landing, and his
  hat trails his motion on a spring and wobbles when he stops. Action
  poses: hands on the crate and leaning in while pushing, both hands
  thrust the way a spell goes when casting, flailing (hat lifting off)
  when falling into a hole. Visual only; showcase entries `wizard-walk`,
  `wizard-jump`, `wizard-push`, `wizard-cast` and `wizard-hole`.
- An access pass for testing (D113): a new temporary pickup kind that
  raises the access level at once (`access_pass_3`, level 3), placed in
  Boot Sector beside the core.
- Title screen and pause menu (D109): the game opens on the logo over
  the start room's empty shape (Start, Options, Controls; the room loads
  after Start); Esc or P, or leaving the
  window, pauses it (Resume, Save, Options, Controls, Quit to title, which
  asks first). Arrows or WASD, Enter or Space, and the mouse work in menus.
- Options (D109): music and sound volume on a 0–10 scale and a Visuals
  submenu (quality, render scale, screen effects), kept in localStorage;
  stubs that nothing applies yet.
- A boot sequence after Start (D110): the logo glitches out, the room
  compiles tile by tile from its back corner, and the wizard pops in out
  of pixels; any
  menu key skips it.
- Access keys (D106): the save codec, 44 scrambled hex digits holding the
  room's map cell, access level, pickup bits and backups with a CRC-16; reading
  forgives spaces, dashes, lowercase and look-alike letters, and says why
  it refuses a key.
- Saving and loading (D105, D111): **Save** in the pause menu writes the
  access key into the URL hash and localStorage and shows it; **Copy key**
  and **Copy link** copy it. A link with a key loads straight into the
  saved room; the title has **Continue** (the last save in this browser)
  and **Enter key**, which says why it refuses a key. A load starts in the
  saved room, reset, with the key's pickups, access level and backups,
  full integrity and energy.
- Map screen (D112): M, or **Map** in the pause menu, shows the rooms
  entered in this run in their biome colors, seen from the game's angle,
  with their connections, a stub for each exit not explored yet, and
  each room's name with icons under it: where the wizard is, a fragment
  still to be found, a backup shrine. A backup shrine reveals the rooms within 2 map cells,
  dimmed until visited. The map is never saved: a new game or a load
  starts it empty.
- World map tool: exits show as marks on the room edges (cyan connected,
  magenta loose), and Delete removes one by a click on its mark (D102): a
  connected exit goes with its partner, a loose one alone. Connect uses a
  loose exit already in the facing wall before making a new one.
- World map tool: an Undo button, and **Undo last save** once there is
  nothing left to undo (D103): what the last save changed or deleted, even
  a deleted room after the reload, comes back as unsaved changes.
- Seven more enemy looks (D107), for any template or room override:
  warden (a knight of firewall), daemon (a wisp flame), golem (a server
  rack), wyrm (a packet dragon whose plates are shades of its color),
  phish (a data disk that springs on legs), overclock (a burning
  processor) and pixie (a butterfly with pixel wings); in the asset
  showcase (`?asset=concepts`) and the test room Menagerie, north of
  Quarantine.

### Changed
- One stream for pixels a spell carries (D127): Cut, Paste, Compile and
  Warp send their pixels from one end to the other the same way (each
  from its own spot, staggered, on a slight arc; full size in a body,
  small at his hands), with the derez's pixel size. Compile's bits now
  fill the cell, Cut and Paste use the same pixel size as the rest, and
  Warp's pixels keep his shape from start to end. Pull's beam stays as
  it is. Showcase `stream`.
- One derez for everything that is gone (D126): the wizard dying, enemies
  popping, collapsing blocks, destructible and compiled crates breaking
  and pickups taken all break into pixels the same way (start through the
  body, drift out and up, shrink away in 0.8 s); only the body's size and
  the colors differ. Blocks' pixels now rise instead of tumbling down,
  and every burst has the same pixel size and timing. Showcase `derez`.
- Biome map (D122): Glitchmire becomes the heavy virtual sector (pixel and
  geometric monsters), Abyssal Buffer becomes Outer Buffer (dark space;
  id `outer_buffer`), Phantom Partition the ghost sector; Firewall
  Wardens are bosses for any biome.
- Enemy colors (D121): virus violet `#b35cff` (was yellow), sentinel sky
  blue `#4fa8ff` (was orange), so they stand out in amber rooms; daemon,
  golem and pixie moved to keep every template its own color.
- Enemies are all their template (D119): rooms no longer override a
  template's values for one enemy, and an enemy's path has no speed of
  its own. The templates are one per look (13, named after it), each in a
  color of its own (a test keeps them apart); `shooter`, `tower` and
  `ricochet` are gone (the tower is `cron`). Test rooms that overrode
  enemies use the plain templates now and play differently in places
  (Crawl Space, Menagerie, Quarantine, Relay Station, Upgrade Lab). The
  room editor's Enemy tool picks a template and says what it does; it
  no longer edits templates.

### Fixed
- The map tool's tests use a small world of their own instead of the
  real rooms, so map redesigns no longer break them.
- A worm's or crawler's arc discharge would start from nowhere: its
  model's muzzle was a point, not the reach the view expects (D107).
- Room editor: the help line and the new-room hint named the wrong tool
  keys (1–8, Exit 8; it is 1–9, Exit 6), and an enemy field left to the
  defaults showed a wrong template value ("no" for Pausable, "undefined"
  for numbers).

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

[Unreleased]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bluedragon-ctrl/Neonmancer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bluedragon-ctrl/Neonmancer/releases/tag/v0.1.0
