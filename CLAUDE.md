# NEONMANCER — Project Guide for Claude Code

This file holds the vision, locked design decisions and working rules for
the project. Read it at the start of every session and keep it up to date
when decisions change (and record the reason in docs/decisions.md).

---

## 1. Vision

NEONMANCER is a desktop browser game: an isometric, flip-screen adventure
inspired by the *style and concept* of 1980s isometric games (e.g. Knight
Lore), but fully original — own character, rooms, story, names and assets.
Nothing from existing games is copied.

A cheerful wizard is zapped into the Grid, a colorful digital kingdom where
magic and code are the same thing. He explores rooms, solves block puzzles,
fights corrupted programs with spells, and collects key fragments to bring
to the central core and reboot the Grid.

Gameplay (D186): an isometric push-puzzle adventure with arcade bite.
Crates, gravity and height are the puzzle (Sokoban with a third
dimension); enemies are puzzle pieces first and pressure second; small
platforming and combat give the tempo. Rooms are puzzle, hybrid or
action (roughly 60/25/15 %, tuned in playtests), and every room earns
its place with one trick.

Tone: light, playful arcade. Visuals: neon wireframe on a dark void with
glow and retro digital effects.

Explicitly NOT in scope: a time limit on the game (a room may have a
challenge timer, D172), day/night cycle, transformations,
mobile/touch support, backend or accounts.

---

## 2. Tech stack

- Plain JavaScript (ES modules), Vite for dev server and build
- three.js for rendering: orthographic isometric camera, thick neon edges
  with LineSegments2 (block edges computed from the grid, see D12)
- pmndrs `postprocessing` for effects (bloom, pixelation, noise, scanlines,
  chromatic aberration, glitch), merged into as few passes as possible
- Custom AABB grid collision — no physics engine
- Howler.js for music (looping, crossfades); ZzFX for sound effects
- Ajv (dev-only) for JSON Schema validation in the dev server, build and CI;
  not shipped to players
- Tests: Node's built-in runner (`node --test`), no test framework
- Fonts bundled via Fontsource (no CDN): Orbitron for HUD labels,
  Share Tech Mono for terminal text (D34)
- Static hosting on GitHub Pages; no backend

---

## 3. Platform and display

- Desktop browsers only (Chrome, Firefox, Edge, Safari).
- Controls: keyboard first; Gamepad API later. No touch controls.
- Minimum target resolution 1920x1080; below that, suggest fullscreen.
- Resolution independence from the start:
  - Canvas fills the window and handles resize; fixed 16:9 framing with
    letterboxing, so every room shows the same area at any size.
  - Camera zoom derived from a virtual resolution and fixed for the
    maximum room size (identical framing from 1080p to 4K).
  - Line widths, bloom radius, pixelation size and particle sizes scale
    with render height, never fixed pixel values.
  - Render scale setting (50–100%) separate from window size; cap
    devicePixelRatio.
  - Automatic quality fallback: when frames run slow, MSAA and then
    render scale step down (D76); a high-DPI buffer (1.5+ pixels per
    CSS pixel) has no MSAA (D169). Behind a menu the last frame is kept,
    not redrawn (D169). Extra full-screen effect passes are
    costly on weak GPUs; add effects to the existing effect pass.
  - HUD and text scale with screen size.

---

## 4. Locked design decisions

### Grid and rooms
- Coordinates: y is up; room size is [x, y, z] = [width, height, depth];
  the floor is at y = 0; back walls are the x = 0 and z = 0 planes.
- 1 block = 1 unit (1x1x1). Player jump height: 1 unit (clears exactly one
  block, never two). The double jump upgrade (D92, D95) adds a second
  jump in mid-air (2 blocks up, wider gaps), to skip easier rooms or
  reach areas closed before (D68).
- Player hitbox 0.6 x 1.5 x 0.6 (the hat is visual only), so the wizard
  needs 2 blocks of headroom.
- Blocks snap to the grid; player and enemies move freely (sub-grid).
- Room size: width + depth <= 32, height <= 6 (max 16x16; also e.g.
  20x12, 24x8). Mix of small (8x8), standard (12x12) and large (16x16).
- Every room fits the fixed camera framing without scrolling.
- World target: towards 128 rooms, more small rooms rather than a few
  very complex ones (D68). Some areas are locked behind an access level,
  probably linked to fragments; others open only to a stronger spell or
  an upgrade (e.g. the jump upgrade).

### Engine
- Fixed-timestep loop: 60 logic updates per second, rendering
  interpolated; identical behavior on any refresh rate.
- Input via action mapping (move, jump, cast, cycle spell, pause, map);
  game code never reads raw keys. Rebinding and gamepad later.
- Blocks rendered with instanced or merged geometry for performance.

### Depth readability
- Glowing drop shadow directly under the player, in his magenta (falling
  objects' shadow is off for now, D50).
- Only back walls rendered; front walls omitted.
- Neon edges are drawn over dark occluding faces, so hidden edges never show.
- X-ray outline when the player is hidden behind blocks.
- Movement along grid axes (screen-diagonal) by default;
  screen-relative mode on G (D38).

### Objects and blocks
- Types: static, pushable, moving (paths or up/down cycles; player rides
  them; spiked ones hurt on touch, D82), hazard (deals damage), void
  (instant death when the player falls onto it), fake (a plain-looking
  block that a scan derezzes, D128), fence (see-through: solid to
  bodies, standable, but bolts and sight pass; linked data streams with
  no faces, so a raised wall hides nothing, D167), and gate blocks that come and go
  (D140, D141): a gate or bridge switched by power, or a collapsing block
  that goes after being stepped on (optional regrow); all sink to go and
  never come back on anything in their cell.
- Decorations (kind `deco`, D117): fixed bodies that dress a room and do
  nothing, in the room's color, facing +z or +x: the data pillar
  (1×3×1, always 3 high), the screen (1×1×1) and the memory stack
  (1×1×1; stacked side by side and on top it makes a memory wall, D123).
  Decorations never fall. A screen may hold a
  short text of `data/lore.json`, printed in the wizard's terminal once
  per visit when he comes near (hints and lore, D118).
- Switches power exits, gates and platforms: a floor plate held down by a
  crate, an enemy or the wizard, or a target a bolt switches on and off;
  a timed one goes off by itself after a few seconds (D140). Each locked
  exit, gate or platform names its switches (`switches`, by default every
  switch in the room) and is powered while they are all on (D140). A
  locked exit opens then, never closes on the wizard, and stays open for
  him if he came in through it (D69, D75). A gate (a white block) opens,
  a bridge (a gate that starts gone) appears, neither closing on anything in
  its cell; a platform with switches runs only while powered. An access lock
  opens once his access level is high enough (D101). A hidden exit is
  wall until a scan reveals it (D128).
- Holes: floor tiles (at y = 0) drawn as black pits. The player dies falling
  in (a trap, no way back out); a block pushed into a hole drops in and fills
  it, turning it into walkable floor. Holes never lead to another room.
- Objects rest on and stack on each other (pushed off ledges, falling).
- Push one object at a time; an object with something on top of it cannot
  be pushed (only the top of a stack moves).
- No basic carry action: the wizard can only push objects until he
  unlocks the Cut & Paste spell.
- Frozen enemies are 1×1×1 blocks (D155): stood on, climbed from and pushed
  one cell at a time (D154).
  Active enemies can't, except bouncy ones
  (landing on top bounces the wizard up 2 blocks, harmlessly, D48) and
  solid ones, which block, carry and shove him like platforms (D51).

### Damage and death
- Hazards and enemies deal damage, followed by brief invulnerability with
  blinking.
- No fall damage. The only instant death is falling onto void blocks.
- On death the wizard derezzes into pixels and recompiles at the room
  entrance — quick and non-punishing.
- A room may have a watchdog timer (`timer`, seconds, set in the room
  editor, D172): it starts once the room has faded in, stands still
  behind menus, and at zero kills the wizard (a death like any other: a
  backup used, the room reset). It guards the room's permanent pickups:
  taking the last one still to find stops it, and a room whose pickups
  are all found arms none; a room without any (a dash) always does.
  Leaving the room drops it. The HUD shows the time left.
- Backups (lives, D97): 8; each death uses one. With none left the
  system crashes and he reboots on the backup shrine nearest on the world
  map, keeping everything found; only the clipboard and the room's state
  are lost. A shrine is a floor tile (one per room at most) that refills
  integrity, energy and backups. The save key holds the backups left; a
  load starts with full integrity and energy (D106).

### Persistence
- Rooms fully reset on re-entry (enemies, blocks, moving platforms).
- Collected things stay collected: fragments, spells, upgrades, buffs and
  secrets.
- The save holds what the wizard has (permanent pickups, access level),
  not the state of rooms or the map (D68). Every permanent pickup
  (spells, upgrades, buffs, fragments, secrets) is one save bit, found or
  not; a bit is the item, not a place, so the same item may lie in
  several rooms (D71). A found one shows grayed out on revisits (D67).
  Temporary pickups (refills, boosts) are not saved and come back with the
  room. Boosts (D152) reward simple secrets: Overdrive (faster on the
  ground), Patch (absorbs a hit) and Overclock (free spells) end when the
  room resets; the Sparkle trail and Rainbow hat stay until his next death or a
  reload.
  Death resets the wizard to his base state, so a detour for a refill
  can be worth it.

---

## 5. Game systems

### Player
Move, jump, gravity, push objects, health ("integrity") and mana ("energy").

### Spells (programs, unlocked by finding data disks)
The wizard starts with none; the first data disk (Zap) lies in
`zap_port`, in the tutorial. Each spell has a slot (0–15), its save bit, shown as the one lit
bit on its disk (D71).
- **Zap** — fast bolt, short cooldown
- **Shield** — a crackling electric ring round the wizard for a while;
  blocks enemies' ranged attacks: bolts, arcs and bursts (D73, D84)
- **Firewall** — a ring of flames like the Shield that also blocks touch
  and burns enemies touching it (D84)
- **Pause** — a bolt that freezes an enemy for a while; frozen enemies
  are harmless solid platforms, still hittable (D85), and can be pushed
- **Blink** — a super-speed dash up to 3 units forward through open
  space, over gaps and hazards; it hits enemies it passes through, and
  hurts the wizard if a wall cuts it short (D86)
- **Warp** — a teleport forward as far as the first wall or object, over
  gaps of any width; safe, a later and stronger spell (D86)
- **Cut & Paste** — cut a crate or a frozen enemy in front of the wizard
  into a one-slot clipboard, paste it into the free cell in front of him,
  in any room (it goes with him; copies allowed, D87)

Added in Phase 4 (the roster, D88):
- **Compile** — a crate in the free cell in front of the wizard for 7 s:
  a step up, or a hole plugged to walk over (D125; built)
- **Fork** — a hologram decoy of the wizard in the free cell in front of
  him for 10 s: it holds floor plates down and draws hostile enemies,
  which go for the nearer of it and him (D129; built)
- **Scan** — a wave from the wizard's feet (6 units): fake blocks it
  reaches derez (a pickup may hide inside one), hidden exits open; they
  stay revealed until the room resets (D128; built)
- **Pull** — pulls the first crate or enemy in line (6 cells) one tile
  towards the wizard, an enemy even into a hole (D89, D124; built)

Upgrades (Zap+, Shield+, the double jump, D95) have their own save
bits; a spell upgrade replaces its base spell in the Tab cycle (ZAP
becomes ZAP+). Up to 16 spells and 16 upgrades; the spare ones wait for
what content production needs (D88). Buff items make the wizard himself
stronger (D93): +1 integrity ×4 (8 → 12), +10 energy ×5 (50 → 100), one
faster recharge. A pickup's shape tells what it is (white disk: spell,
card: upgrade, chip: buff, gold tile: fragment, magenta star: secret,
small voxel: refill), its color the HUD bar it improves; found ones are
gray (D94). Every permanent pickup plays the same install animation,
then a banner and a terminal line (D93).

Mana recharges slowly. Later spells and upgrades are stronger: they let
the wizard pass through easier rooms without their puzzles, but never
reach a pickup without the trick that guards it (D186). The world is a
maze, not a line: a room need not be fully solvable on first arrival,
and some exits and pickups wait for a spell or buff found later
(backtracking, D67). He can always leave a room the way he came.

### Enemies (corrupted programs; cute but clearly dangerous)
- **Bugs** — patrol fixed paths
- **Viruses** — chase on line of sight, give up when it breaks; a
  close-range electric burst
- **Sentinels** — keep their distance and fire a long aimed bolt (D78)
- **Worms** and **Crawlers** — a patroller and a chaser that bite on
  touch; **towers** (the cron look) fire bolts four ways (D83)
- **Firewall Wardens** — bosses of combat rooms in any biome, Home
  Lattice too (D122); each drops a permanent pickup and stays away once
  it is found (D104). A template's `boss` block: phases by integrity
  that change how it fights (teleports too), plate armor, a boss bar,
  three gold rings round its normal body; never paused or pulled; one a
  room, no shrine; its arena's doors never lock (D134, D135)
- Home Lattice's own enemies are the default cyberspace four: bug,
  virus, sentinel and cron (the tower) (D108), plus the peaceful glowbug,
  in tiers (D121); each other biome gets its own roster, settled one
  biome at a time in Phase 6 (docs/design.md, Biomes)
- Seven more looks have templates but no room or plan (D107, D176):
  warden, daemon, golem, wyrm, phish, overclock, pixie

Each has a distinct color, silhouette and animation. Enemies are
universal and data-driven (D48, D78, D80): a template in `defs.json` is a
look, a movement, an attack (touch, burst, arc, bolt or none), a
hostility (hostile, peaceful, provoked) and a color, plus tuning; any of
them combine, and a template may `extend` another. A room places an
enemy from a template and gives it only its cell and path, never values
of its own, so an enemy behaves the same everywhere; each template has a
color of its own, told apart at a glance (D119; docs/design.md,
Enemies). Movement AI is named behavior modules referenced from data. Any hit alerts an enemy, and
the wizard gets the blame (D81). Eye color shows hostility (red hostile,
amber provoked, cyan peaceful); a red "!" pops up over one that notices
him. Enemies move cell by cell with physics, never step into holes or
onto void, and pop if the ground goes from under them.

### Biomes (Grid sectors)
Each room has a biome defining look and optional environmental effects,
defined in data and combinable. Health pickups and safe rooms balance
drain effects. Six biomes (D61): one core, four side sectors, one special (Outer
Buffer, secrets, D130).
Color rules (D99), for objects and blocks: red hurts or is about to
(hazards, spiked platforms, hostile eyes: one red, `#ff2a3a`); the room
color is structure (plain and collapsing blocks); black is a pit (holes,
void blocks as black mist); white is a mechanism (plates, targets, locks);
cyan moves (platforms); magenta is the wizard (D98); neon green is pushable
(crates). Room colors stay clear of them (`tests/colors.test.js`).
Monsters and spell effects are not bound by them yet.
Behaviors below are ideas for Phase 5; for now biomes are look only.
- **Home Lattice** (core, settled D121) — a clean kernel city; amber (the
  default room color), clean square grid, data flows on the grid and
  random glass wall panels (D179; no motes, D180); safe; holds the
  central core
The high-level map (D122, docs/design.md, Biomes) sets each sector's
theme, enemy family and one mechanic of its own; details are settled one
biome at a time.
- **Glitchmire** — heavy virtual: pixel and geometric monsters that
  split, morph and hop; hot pink, torn offset floor tiles, pixel bubbles,
  edges that jitter; later: low-res
- **Frostbyte Wastes** — frozen storage: things that slow and freeze; ice
  blue, hex crystal floor, falling 0/1 flakes, soft frosty bloom; later:
  slippery ice
- **Outer Buffer** (special: secrets and optional rooms, D130) — dark
  space beyond the Grid: things that orbit, fall and pull; deep indigo
  edges, no grid outside the room, only a void with twinkling stars,
  faint clouds and a lensed black hole beside it (D182); exits into it
  show drifting stars, locked ones dark indigo glass (D183); later:
  low gravity, darkness with a light round the wizard
- **Firewall Citadel** — the fortress: armored guards, burners, turrets;
  ember orange, brick floor, rising sparks, warm flicker; later: heat vents
- **Phantom Partition** (a late sector, D130) — ghosts that
  phase, mirror and haunt; pale violet (D99), sparse dotted floor under
  low glowing mist, edges slowly shimmering through the hues

### Goal
Collect the 64 key fragments and bring them to the central core (D101).
Touching the core raises the wizard's access level to what his fragments
earn (16 → 1, 32 → 2, 48 → 3), which opens access-locked exits; with all
64 the Grid reboots (the end, a placeholder screen for now) and he plays
on. No time limit (only challenge rooms' watchdog timers, D172). The fragments are the modules of one 8×8 QR-like boot
key, which the HUD fills in; a gold band round his hat per level.

### Arcade layer
The score is what the wizard has, not what he did (D100): points per
permanent pickup, secret and access level (`defs.json` `score`), worked
out from the save bits and never saved. The HUD shows it with the share
of the world's permanent pickups found. Secrets are permanent pickups
hidden where it takes an extra move. No bonus bits, no high score.

### Map
Map screen (M, D112): the rooms entered in this run, their connections,
stubs for exits not explored yet, and each room's name with icons under
it (he is here, a fragment he hasn't found, a backup shrine). Never saved: a new game or a load starts it empty. A
backup shrine reveals the rooms within 2 map cells, dimmed until visited;
they stay for the run.

---

## 6. Art direction and feel

- Bright neon wireframe on dark background; saturated cyan, magenta,
  lime, amber. Infinite grid floor fading into darkness.
- The camera never turns: it looks from +x +y +z, so a static object shows
  only its top, +x and +z faces. Put detail on those faces and none on the
  hidden ones; the asset showcase shows static objects without turning
  (D115). Things that turn in play (characters, spinning pickups) are exempt.
- Glass (crates, decorations) is always built with `glassBox()` (or
  `glassBoxes()` for several boxes in one draw, D169) and a
  `GLASS` preset from `src/render/glass.js` (D116), never a material of
  its own.
- Characters (the wizard, monsters) are holograms: a dark core glowing
  towards the silhouette, faint drifting scanlines, a thin neon outline and
  glowing eyes (D22). The world stays wireframe.
- The wizard: cone body, ball head, floating ball hands and a big pointy
  hat, readable at a glance.
- "Juice": squash-and-stretch on jumps and landings, small screen shake
  and hit-flash on hits, particle bursts on pickups, anything gone
  (the wizard, enemies, blocks, crates, pickups) derezzes into pixels
  in one shared look (D126), pixels a spell carries (Cut & Paste,
  Compile, Warp) stream in one shared look too (D127), moving platforms
  glide on glowing rails.
- Effects react to gameplay: afterimage on Warp, glitch and chromatic
  aberration on damage. Pixelation, scanlines and noise are subtle by
  default; stronger effects are short bursts.
- Quality presets (Low / Medium / High) and effect toggles.
- UI: chunky retro arcade font, big clear HUD, playful terminal-style
  messages (e.g. `> FRAGMENT 3/8 GET!`, `> SPELL INSTALLED: ZAP`).
- Music: upbeat synthwave/chiptune tracks provided by the author as
  audio files (Suno), trimmed for seamless loops.

---

## 7. Data-driven architecture

The engine is generic; all content lives in data.

- `data/defs.json` — object types (kind, style, damage for spiked
  platforms, a decoration's look, a switch's timer; variants `extend` a
  base, D145), block types (look or kind, color, a gate's trigger,
  properties such as damage and lethal; variants `extend` a base, D60),
  enemy templates (look, movement, attack,
  hostility, aggro range, integrity, damage, speeds, bounce, solid, color,
  charged attack values, height, a boss block; a template may `extend`
  another, D58, D78, D79, D80, D135), spells
- `data/biomes.json` — palette, floor pattern, effect settings,
  environmental effects
- `data/rooms/*.json` — one file per room: biome, size [x, y, z], exits,
  objects (switch links, D140), enemies, pickups, a backup shrine tile, a
  watchdog timer (D172); only overrides of type defaults;
  `"authored": true` marks the author's real game rooms (D90, §10)
- `data/world.json` — room connections, room positions on the world map,
  the dev wing (`dev`: test rooms only the dev server shows, D147),
  start room, the fragments the core needs and the access thresholds
  (D101); fragments lie in the rooms' pickups, the core is a room object
- `data/strings.json` — all UI text
- `data/lore.json` — screen texts (hints and lore, D118), by id; a
  screen room object names one
- `data/audio.json` — named audio events mapped to files
  (e.g. "jump", "pickup", "music:glitchmire")
- `schemas/*.json` — JSON Schema for every data format, used both as
  documentation and for validation

Rules:
- Stable IDs for rooms, items, fragments, spells and secrets.
- Validate all data at load time with clear error messages.
- Keep modules small and focused: renderer, input, loop, collision,
  entities, ai, spells, biomes, effects, audio, save, room loader, ui,
  editor, debug.
- Prefer simple, readable code with brief comments over clever
  abstractions.

---

## 8. Save system: access keys

Keys are copied, pasted and bookmarked — never memorized — so length is
not critical.

- Bit layout (one versioned module, spare bits reserved), sized for the
  world targets (D68), finalized in D106: format version 4, room cell
  x 8 and z 8 (its `world.json` position, signed), access level 8 (4 bits used, levels 0–15,
  4 spare, D91), pickups 128 (one bit per permanent item, in
  blocks, D71: spells 16, buffs 16, upgrades 16 (D88), fragments 64,
  secrets 16 (D100); known spells, upgrades and buffs follow from them),
  backups 4, checksum 16. No score field: the score follows from the
  pickups and the access level (D100). No per-room data (map).
- Encoding: 44 hex digits in groups of 4 (e.g. `2DE0-279E-AE79-...`,
  D106). Input tolerates spaces, dashes, lowercase, O for 0, I/L for 1.
- Scramble with bit shuffle + XOR so keys are not trivially editable.
- Saving is a player action, any time, from the pause menu (D105); nothing
  saves on its own. A load starts in the saved room, reset, with the
  saved backups, full integrity and energy, and an empty clipboard.
- URL saves: a save writes the key into the URL hash (`#KEY`)
  with `history.replaceState` (no reload, no history spam). On load, a
  valid key in the hash loads that state directly; an invalid key shows
  a friendly message and starts normally.
- UI: "Save", "Copy key" and "Copy link" in the pause menu; hint to
  bookmark after saving; "Enter key" on the title screen.
- A save also goes to localStorage (wrapped in try/catch); the title's
  "Continue" loads it (D111). Loading a key never stores it: only Save does.
- Automated tests for encode/decode round-trips and corrupted-key
  rejection.

---

## 9. Tooling

- **Debug mode** (toggle key): collision boxes, FPS, room jump,
  invincibility, test damage, finding fragments (K).
- **Access pass** (D113): a test pickup (kind `access`) that raises the
  access level at once; one (level 3) lies in `boot_up`, the start, for
  testing. Not for real game content.
- **Asset showcase** (`tools/showcase.html`, also deployed): every character
  and object look on a turntable with the real renderer. Add every new
  visual asset (monsters, pickups) to it.
- **Room editor** (in-game, Phase 2): place blocks, enemies and pickups
  with the mouse, preview in the real neon look, export room JSON. The
  Switch tool places switches (the Object tool does not) and links them
  to gates, platforms and exits, from either side, with checklists in the
  panel; hovering shows any thing's switch links (D142).
- **World map tool** (`tools/world-map.html`, D66, D77): every room on a
  map grid with its connections; move, add and remove rooms and
  connections; flags rooms out of reach; opens a room in the room editor;
  F3 lists every permanent item by save bit and where it lies. Dev server
  only, never shown to players: exploring is part of the game (D67).
- **Monster editor** (`tools/monster-editor.html`, D119, D120): the enemy
  templates in `defs.json`, where enemies are tuned: fields from the
  schema with where each value comes from, a live preview with the
  game's models, variants in colors of their own, rename (rooms follow),
  delete. Dev server only; the room editor only picks templates.
- **Reachability checker** (`tools/check-reach.js`, `npm run check:reach`,
  D131): searches every room's grid with jump height, the double jump,
  crates (pushed, pulled, pasted), frozen enemies (pushed, D166) and the
  spells found so far, and the
  world as a fixpoint, flagging exits, pickups and rooms that stay out of
  reach; `<room>` checks one room (`--with` abilities, `--from` an exit),
  `--rooms` lists what each exit and pickup needs. Used by CI, the
  world map tool, and design skills/subagents. Knows nothing of enemies
  or timing.
- **Claude Code skills and subagents** (D132, `.claude/`): the
  `room-design` and `enemy-design` skills (schema, rules, tuning numbers,
  annotated examples; room-design opens with the game's core idea and
  has a rework workflow for existing rooms, D186, and ships a mutation
  test and a headless play helper in its `scripts/`, D161) and the
  read-only `level-review` subagent (runs validation, the reachability
  checker and the mutation test, reads a room against its trick and the
  checklist, verdict keep/tune/redesign/cut). Use them when drafting or reviewing rooms and enemies; keep
  them in step with the schemas and the checklist in docs/design.md. A
  room-drafting subagent comes with Phase 5's content steps.

---

## 10. Development process

- Git: protected `main` (always playable), feature branches
  (`feat/cut-paste-spell`), pull requests. Use the GitHub CLI to open a
  PR for each step; the author reviews and merges.
- Every PR targets `main`; never stack a PR on another open PR's branch
  (stacked PRs got merged into their bases instead of `main`). Work that
  depends on an open PR waits for its merge.
- A PR is ready only when its CI is green; before tagging a release,
  CI and the Pages deploy on `main` must be green.
- Not every development computer has the GitHub CLI. If `gh` is missing,
  push the branch and give the author a prefilled compare link
  (`https://github.com/bluedragon-ctrl/Neonmancer/compare/main...<branch>?expand=1`)
  plus the PR title and body, so they can create the PR manually.
- Authored rooms (D90): a room with `"authored": true` is a real game
  room made by the author, who sets and clears the flag in the room
  editor (a test room may become the start of a real one). Development
  steps never touch them:
  - never edit, migrate, resize or move an authored room (its file or
    its map position), and never add, remove or rename its exits or
    connections;
  - never attach a new room to an authored room; new test rooms go in
    the dev wing and connect only to dev rooms (D147);
  - tests never depend on authored rooms; they use the fixtures in
    `tests/helpers.js` or dev rooms;
  - a change that could affect them (a schema change that needs a
    migration, a new default in `defs.json`, a changed mechanic) lists
    the affected authored rooms in the PR, and any change to their
    files waits for the author's OK;
  - running, playing and screenshotting them to check a mechanic is fine.
- A git worktree has no node_modules of its own and Node would use the
  main checkout's (maybe from an older branch). `tools/ensure-deps.js`
  runs before dev, build, test, validate:data and check:reach and installs
  what this checkout lacks, so a new worktree just works.
- CLAUDE.md is versioned in the repo so every machine shares it; put
  working rules here, not in machine-local notes.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- PR template: summary, how it was tested, docs updated.
- Semantic Versioning, MAJOR.MINOR.PATCH (D42):
  - MAJOR: 0 during development; 1.0.0 for the first full release. Only
    the author decides a major bump.
  - MINOR: the phase (0.1 = Phase 1, 0.2 = Phase 2, ...), raised when the
    author declares a phase finished.
  - PATCH: counts pull requests merged into `main` since the phase's tag;
    computed at build time (`tools/game-version.js`), never edited by hand.
    `package.json` always holds MAJOR.MINOR.0.
- Closing a phase: a `chore/release-0.X.0` PR sets `package.json` to
  0.X.0 (`npm version 0.X.0 --no-git-tag-version`), turns CHANGELOG's
  Unreleased section into `[0.X.0] - date` and does a docs pass. After the
  author merges it: tag the merge commit `v0.X.0`, push the tag, and create
  the GitHub Release from that CHANGELOG section.
- Separate version numbers for: game (package.json), save-key format, data
  schema (`src/core/version.js`).
- CI (GitHub Actions): on PR run tests, data validation and build;
  every push to `main` builds and deploys to GitHub Pages for testing
  (release-only deploys may return later).
- Docs: README.md, CLAUDE.md, docs/architecture.md, docs/design.md,
  docs/decisions.md (decision log). JSDoc on public modules.
- Never commit secrets; keep .gitignore current.

---

## 11. Phases

Done: Phase 1 (v0.1.0, foundations), Phase 2 (v0.2.0, hazards, combat,
editor), Phase 3 (v0.3.0, spells and pickups), Phase 4 (v0.4.0, saves,
guardians, tooling); see CHANGELOG.md.

Step plan: docs/design.md, Phases and steps (D130).

**Phase 4 (v0.4) — Saves, guardians, tooling** (D105, re-cut D130) —
done, v0.4.0: access keys, title and pause menu, saving, the map screen;
the spells Pull, Compile, Scan and Fork; the reachability checker, design
skills and level-review subagent; the paper design of Home Lattice
(docs/lattice-plan.md); the boss engine and the two bosses, Null Pointer
and the Gatekeeper (D134–D137). Biome rosters move to Phase 6.

**Phase 5 (v0.5) — Home Lattice playtest** (D130): finish one good,
sounding Home Lattice and ship it to testers.
- Sound: audio engine (Howler music with crossfades, ZzFX effects,
  `audio.json`, the Options sliders wired), an effects pass over existing
  events, the author's music tracks (Lattice, boss, title).
- Content: Home Lattice, about 30 rooms (docs/lattice-plan.md): 16
  fragments that give Level 1 plus two in secret rooms, two bosses (one
  drops a fragment, one the energy buff), the tutorial near the core. Two Level 1
  exits lead to the next two biomes, Glitchmire and Frostbyte Wastes,
  each only a few teaser rooms (look only); an Outer Buffer cluster of
  secret rooms (entrances built; their contents wait, D186). The
  Lattice's ambience (data flows, glass panels, D179) and the Outer
  Buffer's look are done.
- Core first (D186): a Lattice ladder (each room's type, rung and trick
  in docs/lattice-plan.md), then every Lattice room reviewed one by one
  with the room-design skill and the author's tuning.
- Readiness: quality presets, auto fallback and render scale wired up,
  a check on a weaker GPU; first-minute onboarding; a "copy debug info"
  pause entry for feedback; a balance pass.
- Rooms: real-content rooms are drafted unflagged; the author refines
  them in the editor and flags them authored. Test rooms live in the
  dev wing (D147).
- Closes as v0.5.0, "Playtest 1".

**Phase 6 (v0.6+) — The other sectors**, from playtest feedback, one
biome at a time: enemy roster, look, rooms. Glitchmire and Frostbyte
first, then Firewall Citadel and Phantom Partition.

**Phase 7 — Polish and 1.0.0**: juice and post-processing pass,
fullscreen, gamepad, key rebinding, biome
environmental effects (D122: Glitchmire low-res, Frostbyte ice, Outer
Buffer low gravity and darkness) with health pickups and safe rooms.
