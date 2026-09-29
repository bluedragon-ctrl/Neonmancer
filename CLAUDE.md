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

Tone: light, playful arcade. Visuals: neon wireframe on a dark void with
glow and retro digital effects.

Explicitly NOT in scope: time limit, day/night cycle, transformations,
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
- Web Audio AnalyserNode for audio-reactive visuals (later phase)
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
    render scale step down (D76). Extra full-screen effect passes are
    costly on weak GPUs; add effects to the existing effect pass.
  - HUD and text scale with screen size.
- Optional setting (off by default): zoom to fit smaller rooms.

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
  screen-relative mode as a later option.

### Objects and blocks
- Types: static, pushable, moving (paths or up/down cycles; player rides
  them; spiked ones hurt on touch, D82), collapsing (vanish after being stepped on, optional respawn),
  hazard (deals damage), void (instant death when the player falls onto it).
- Switches unlock exits: a floor plate held down by a crate, an enemy or
  the wizard, or a target a bolt switches on and off. A locked exit opens
  while every switch in its room is on, never closes on the wizard, and
  stays open for him if he came in through it (D69, D75). An access lock
  opens once his access level is high enough (D101).
- Holes: floor tiles (at y = 0) drawn as black pits. The player dies falling
  in (a trap, no way back out); a block pushed into a hole drops in and fills
  it, turning it into walkable floor. Holes never lead to another room.
- Objects rest on and stack on each other (pushed off ledges, falling).
- Push one object at a time; an object with something on top of it cannot
  be pushed (only the top of a stack moves).
- No basic carry action: the wizard can only push objects until he
  unlocks the Cut & Paste spell.
- Frozen enemies can be stood on. Active enemies can't, except bouncy ones
  (landing on top bounces the wizard up 2 blocks, harmlessly, D48) and
  solid ones, which block, carry and shove him like platforms (D51).

### Damage and death
- Hazards and enemies deal damage, followed by brief invulnerability with
  blinking.
- No fall damage. The only instant death is falling onto void blocks.
- On death the wizard derezzes into pixels and recompiles at the room
  entrance — quick and non-punishing.
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
  Temporary pickups (refills) are not saved and come back with the room.
  Death resets the wizard to his base state, so a detour for a refill
  can be worth it.

---

## 5. Game systems

### Player
Move, jump, gravity, push objects, health ("integrity") and mana ("energy").

### Spells (programs, unlocked by finding data disks)
The wizard starts with none; the first data disk (Zap) lies in Boot
Sector. Each spell has a slot (0–15), its save bit, shown as the one lit
bit on its disk (D71).
- **Zap** — fast bolt, short cooldown
- **Shield** — a crackling electric ring round the wizard for a while;
  blocks enemies' ranged attacks: bolts, arcs and bursts (D73, D84)
- **Firewall** — a ring of flames like the Shield that also blocks touch
  and burns enemies touching it (D84)
- **Pause** — a bolt that freezes an enemy for a while; frozen enemies
  are harmless solid platforms, still hittable (D85)
- **Blink** — a super-speed dash up to 3 units forward through open
  space, over gaps and hazards; it hits enemies it passes through, and
  hurts the wizard if a wall cuts it short (D86)
- **Warp** — a teleport forward as far as the first wall or object, over
  gaps of any width; safe, a later and stronger spell (D86)
- **Cut & Paste** — cut a crate or a frozen enemy in front of the wizard
  into a one-slot clipboard, paste it into the free cell in front of him,
  in any room (it goes with him; copies allowed, D87)

Planned for Phase 4 (the roster, D88); details settle in their steps:
- **Compile** — builds a temporary block in the cell in front of the
  wizard: a step up or a bridge tile over a gap
- **Fork** — a hologram decoy of the wizard that stands for a while,
  holds floor plates down and draws enemies
- **Scan** — reveals hidden blocks, fake walls and secret pickups for a
  while
- **Pull** — pulls the closest movable object (a crate) or enemy in the
  facing direction one tile towards the wizard (D89)

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
the wizard skip easier rooms or solve them differently. The world is a
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
- **Shooters** — stationary, fire slow bolts (the Pop-up idea, D84)
- **Firewall Wardens** — bosses of combat rooms; each drops a permanent
  pickup and stays away once it is found (D104)
- Home Lattice's own enemies are the default cyberspace four: bug,
  virus, sentinel and cron (the tower) (D108); each other biome gets its
  own roster, reviewed in Phase 4b
- More looks for content (D107), no template yet: warden, daemon (wisp),
  golem (server rack), wyrm (packet dragon), phish (a data disk mimic),
  overclock (burning chip), pixie (pixel butterfly)

Each has a distinct color, silhouette and animation. Enemies are
universal and data-driven (D48, D78, D80): a template in `defs.json` is a
look, a movement, an attack (touch, burst, arc, bolt or none), a
hostility (hostile, peaceful, provoked) and a color, plus tuning; any of
them combine, a template may `extend` another, and a room overrides any
field per enemy (docs/design.md, Enemies); movement AI is named behavior
modules referenced from data. Any hit alerts an enemy, and
the wizard gets the blame (D81). Eye color shows hostility (red hostile,
amber provoked, cyan peaceful); a red "!" pops up over one that notices
him. Enemies move cell by cell with physics, never step into holes or
onto void, and pop if the ground goes from under them.

### Biomes (Grid sectors)
Each room has a biome defining look and optional environmental effects,
defined in data and combinable. Health pickups and safe rooms balance
drain effects. Six biomes (D61): one core, four side sectors, one special.
Color rules (D99), for objects and blocks: red hurts or is about to
(hazards, spiked platforms, hostile eyes: one red, `#ff2a3a`); the room
color is structure (plain and collapsing blocks); black is a pit (holes,
void blocks as black mist); white is a mechanism (plates, targets, locks);
cyan moves (platforms); magenta is the wizard (D98); lime is pushable
(crates). Room colors stay clear of them (`tests/colors.test.js`).
Monsters and spell effects are not bound by them yet.
Behaviors below are ideas for Phase 5; for now biomes are look only.
- **Home Lattice** (core) — amber (the default room color), clean square
  grid, warm rising motes; safe; holds the central core
- **Glitchmire** — hot pink, torn offset floor tiles, pixel bubbles, edges
  that jitter; later: slow health drain
- **Frostbyte Wastes** — ice blue, hex crystal floor, falling 0/1 flakes,
  soft frosty bloom; later: low-res, reduced visibility
- **Abyssal Buffer** — graphite gray, wavy caustics on the floor, slowly
  drifting glitter, gentle sway; later: low gravity
- **Firewall Citadel** — ember orange, brick floor, rising sparks, warm
  flicker; guardians
- **Phantom Partition** (special: secrets, backtracking) — pale violet (D99),
  sparse dotted floor, still twinkling stars, edges slowly shimmering
  through the hues

### Goal
Collect the 64 key fragments and bring them to the central core (D101).
Touching the core raises the wizard's access level to what his fragments
earn (16 → 1, 32 → 2, 48 → 3), which opens access-locked exits; with all
64 the Grid reboots (the end, a placeholder screen for now) and he plays
on. No time limit. The fragments are the modules of one 8×8 QR-like boot
key, which the HUD fills in; a gold band round his hat per level.

### Arcade layer
The score is what the wizard has, not what he did (D100): points per
permanent pickup, secret and access level (`defs.json` `score`), worked
out from the save bits and never saved. The HUD shows it with the share
of the world's permanent pickups found. Secrets are permanent pickups
hidden where it takes an extra move. No bonus bits, no high score.

### Map
Map screen (M, D112): the rooms entered in this run, their connections,
stubs for exits not explored yet and a gold mark where a fragment he
hasn't found lies. Never saved: a new game or a load starts it empty. A
backup shrine reveals the rooms within 2 map cells, dimmed until visited;
they stay for the run.

---

## 6. Art direction and feel

- Bright neon wireframe on dark background; saturated cyan, magenta,
  lime, amber. Infinite grid floor fading into darkness.
- Characters (the wizard, monsters) are holograms: a dark core glowing
  towards the silhouette, faint drifting scanlines, a thin neon outline and
  glowing eyes (D22). The world stays wireframe.
- The wizard: cone body, ball head, floating ball hands and a big pointy
  hat, readable at a glance.
- "Juice": squash-and-stretch on jumps and landings, small screen shake
  and hit-flash on hits, particle bursts on pickups, enemies pop into
  pixel fragments, collapsing blocks fragment into pixels, moving
  platforms glide on glowing rails.
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
  platforms), block types (look or kind, color,
  properties such as damage and lethal; variants `extend` a base, D60),
  enemy templates (look, movement, attack,
  hostility, aggro range, integrity, damage, speeds, bounce, solid, color,
  charged attack values; a template may `extend` another, D58, D78, D79,
  D80), spells
- `data/biomes.json` — palette, floor pattern, effect settings,
  environmental effects
- `data/rooms/*.json` — one file per room: biome, size [x, y, z], exits,
  objects, enemies, pickups, a backup shrine tile; only overrides of type defaults;
  `"authored": true` marks the author's real game rooms (D90, §10)
- `data/world.json` — room connections, room positions on the world map,
  start room, the fragments the core needs and the access thresholds
  (D101); fragments lie in the rooms' pickups, the core is a room object
- `data/strings.json` — all UI text
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
- **Asset showcase** (`tools/showcase.html`, also deployed): every character
  and object look on a turntable with the real renderer. Add every new
  visual asset (monsters, pickups) to it.
- **Room editor** (in-game, Phase 2): place blocks, enemies and pickups
  with the mouse, preview in the real neon look, export room JSON.
- **World map tool** (`tools/world-map.html`, D66, D77): every room on a
  map grid with its connections; move, add and remove rooms and
  connections; flags rooms out of reach; opens a room in the room editor;
  F3 lists every permanent item by save bit and where it lies. Dev server
  only, never shown to players: exploring is part of the game (D67).
- **Reachability checker** (Phase 4): script that searches the grid with
  jump height, pushable objects and available spells to flag unsolvable
  rooms. Used by CI, the editor, and design skills/subagents.
- **Claude Code skills and subagents** (Phase 4+, once schemas are
  stable): room design and enemy design skills (schema, rules, annotated
  examples); room-drafting and level-review subagents. They start from the
  room design checklist in docs/design.md; check new rooms against it
  until then.

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
  - never attach a new room to an authored room; new test rooms connect
    only to test rooms (Boot Sector, the shared start, stays a test
    room; if a hub becomes authored, ask where test rooms go);
  - tests never depend on authored rooms; they use the fixtures in
    `tests/helpers.js` or test rooms;
  - a change that could affect them (a schema change that needs a
    migration, a new default in `defs.json`, a changed mechanic) lists
    the affected authored rooms in the PR, and any change to their
    files waits for the author's OK;
  - running, playing and screenshotting them to check a mechanic is fine.
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
editor), Phase 3 (v0.3.0, spells and pickups); see CHANGELOG.md.

**Phase 4 (v0.4) — Saves, guardians, tooling**, in two parts (D105):
- 4a — Access keys and tests, title screen and pause menu, saving and
  loading (URL hash, localStorage), map screen.
- 4b — The roster's new spells (D88, D89): Compile, Fork, Scan and Pull.
  Firewall Wardens (bosses, D104). Reachability checker. Design skills
  and subagents. Biome enemy rosters: review the proposal (at least three
  enemies of its own per biome, still six biomes; colors and setup may
  change) and settle it before content production (D108).
- Proposal, not yet confirmed: visual rewards for secrets found (a hat
  star, a star trail, a Phantom shimmer) and a special room behind a
  lock for all 16 (docs/design.md, Phase 4 outline).

**Phase 5 (v0.5+) — Polish**
Full post-processing, juice pass, music and SFX, audio-reactive visuals,
settings menu with quality presets, fullscreen, gamepad, key rebinding.
Then content production toward 1.0.0, including biome environmental
effects (Glitchmire drain, Frostbyte low-res, Abyssal low gravity) with
health pickups and safe rooms.
