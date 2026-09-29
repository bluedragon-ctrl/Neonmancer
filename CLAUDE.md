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
- Glowing drop shadow directly under the player (falling objects' shadow
  is off for now, D50).
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
  stays open for him if he came in through it (D69, D75).
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
- Backups (lives, D92, D97): 8; each death uses one. With none left the
  system crashes (`> SYSTEM CRASH`) and he reboots on the backup shrine
  nearest on the world map (map cells |dx| + |dz|; ties to the one used
  last), keeping everything found; only the clipboard and the room's
  state are lost. A backup shrine is a floor tile (one per room at most);
  stepping onto it refills integrity, energy and backups. A load always
  starts with full backups, so the save key holds no backups field.

### Persistence
- Rooms fully reset on re-entry (enemies, blocks, moving platforms).
- Collected things stay collected: fragments, spells, scrolls, secrets,
  and bonus bits.
- The save holds what the wizard has (fragments, spells, items), not the
  state of rooms: no per-room data such as bonus slots or the map (D68).
  Each room has up to 4 bonus slots.
- Every permanent pickup (fragments, data disks, buff items, secrets) is
  one bit in the save, found or not; there are only a limited number of
  them. A bit is the item, not a place: the same item may lie in several
  rooms (D71). A found one shows grayed out when its room is revisited (D67).
  Temporary pickups (e.g. refills) are not saved and come back with the
  room. Death resets the wizard to his base state, so a detour for a
  temporary pickup can be worth it.

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

Upgrades have their own cards and save bits (the upgrades block, not
spells, D88); a spell upgrade replaces its base spell in the Tab cycle
(ZAP becomes ZAP+):
- **Zap+** — the bolt bounces three times off blocks and walls, reaching
  targets round corners (D95)
- **Shield+** (Shield upgrade) — reflects every bolt back the way it came;
  it hurts the first enemy it meets (D95)
- **Double jump** (D92, D95) — one more jump in mid-air, once until he
  lands

An upgrade is an expansion card with contact fingers in its color (D95).

Up to 16 spells and 16 upgrades; 11 spells and 3 upgrades are set, the
rest stay spare for what content production needs (D88, D89). Intended order
in the world: early Zap, Shield, Blink, Pause; middle Cut & Paste,
Firewall, Fork, Scan and the double jump; late Compile, Warp, Zap+ and
Shield+. Buff items make the wizard himself stronger: more integrity,
more energy, faster recharge (D93): 4× +1 integrity (8 → 12), 5× +10
energy (50 → 100) and one recharge buff (a unit every 8 ticks instead
of 12); taking one fills the stat it raises. Each is a chip with its
own save bit (buff slots 0–9). For the player, a pickup's shape tells
what it is (white disk: spell, card: upgrade, chip: buff, small voxel: refill) and its
color the HUD bar it improves (light blue integrity, yellow-green energy
and recharge); found ones are solid gray (D94). Stronger spells, upgrades
and buffs all let him skip easier rooms and reach areas he couldn't
before.

Mana recharges slowly. Every permanent pickup (a spell disk, a buff,
later upgrades and fragments) plays the same install animation as a
spell: the item shrinks, its bits spiral into the wizard, rings in its
color sweep up him and he flashes white; then a banner and a terminal
line (D93). A new permanent pickup gets it too, with its own model.
Later spells and upgrades are stronger: they let the wizard speedrun
simple rooms or solve them differently. The world is a maze, not a line:
a room need not be fully solvable on first arrival, and some of its exits
and pickups wait for a spell or buff found later (backtracking, D67). He
can always leave it again the way he came.

### Enemies (corrupted programs; cute but clearly dangerous)
- **Bugs** — patrol fixed paths
- **Viruses** — chase on line of sight, give up when it breaks; a
  close-range electric burst
- **Sentinels** — keep their distance and fire a long aimed bolt (D78)
- **Worms** and **Crawlers** — a patroller and a chaser that bite on
  touch; **towers** (the cron look) fire bolts four ways (D83)
- **Pop-ups** — stationary, fire slow projectiles
- **Firewall Wardens** — tougher guardians blocking key rooms

Each has a distinct color, silhouette and animation.
AI is implemented as named behavior modules referenced from data.
Enemies are universal and fully data-driven (D48, D78, D80): an enemy is
a look, a movement, an attack (touch, burst, arc, bolt or none) and a
color, and any of them combine. Template fields in `defs.json` (look,
movement, attack, hostility — hostile / peaceful / provoked —, aggro
range, integrity, damage, speed, chase speed, bounce, solid, pausable,
color, a charged attack's range, charge, cooldown and color, and a bolt's
speed, pattern — aimed or four ways — and bounces), overridable per enemy
in the room. Any hit alerts an enemy, and the wizard gets the blame (D81).
Eye color shows hostility (red hostile, amber provoked, cyan peaceful);
a red "!" pops up over one that notices the wizard. Enemies move cell by
cell with physics (fall, ride platforms), never step into holes or onto
void, and pop if the ground goes from under them.

### Biomes (Grid sectors)
Each room has a biome defining look and optional environmental effects,
defined in data and combinable. Health pickups and safe rooms balance
drain effects. Six biomes (D61): one core, four side sectors, one special.
Room colors stay clear of the gameplay colors (lime crates, cyan
platforms, pale white-blue collapsing, red hazard, violet void, green bugs;
magenta is the wizard's color, D98).
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
- **Phantom Partition** (special: secrets, backtracking) — silver-white,
  sparse dotted floor, still twinkling stars, edges slowly shimmering
  through the hues

### Goal
Collect all key fragments (count defined in world data) and deliver them
to the central core. No time limit.

### Arcade layer
Score for enemies, pickups and secrets; floating score popups; bonus bits
in rooms; "all bits collected" room bonus. High score stored locally.

### Map
Map screen showing visited rooms, connections and fragment markers.
Current plan, not final: the map covers the current run only and is
cleared when a save is loaded (the full map is never saved); save shrines
show a map of the surrounding area (decided with the Phase 4 map step).

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
  objects, enemies, bonus slots, a backup shrine tile; only overrides of type defaults;
  `"authored": true` marks the author's real game rooms (D90, §10)
- `data/world.json` — room connections, room positions on the world map,
  start room, fragment locations, number of fragments required, core
  location
- `data/strings.json` — all UI text
- `data/audio.json` — named audio events mapped to files
  (e.g. "jump", "pickup", "music:glitchmire")
- `schemas/*.json` — JSON Schema for every data format, used both as
  documentation and for validation

Rules:
- Stable IDs for rooms, items, fragments, spells and bonus slots.
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
  world targets (D68) and finalized with the access-key step:
  format version 4, room 8, access level 8 (4 bits used, levels 0–15,
  4 spare, D91), pickups 112 (one bit per permanent item, in
  blocks, D71: spells 16, buffs 16, upgrades 16 (D88), fragments 64;
  known spells, upgrades and buffs follow from them), health 4, score 20, checksum 16.
  No per-room data (bonus slots, map).
- Encoding: Base32 without ambiguous characters (no 0/O, 1/I/L), shown
  in groups (e.g. `KX7M-Q4RP-...`). Input tolerates spaces, dashes and
  lowercase.
- Scramble with bit shuffle + XOR so keys are not trivially editable.
- URL saves: at each checkpoint write the key into the URL hash (`#KEY`)
  with `history.replaceState` (no reload, no history spam). On load, a
  valid key in the hash loads that state directly; an invalid key shows
  a friendly message and starts normally.
- UI: "Copy key" and "Copy link" buttons at save shrines and in the pause
  menu; hint to bookmark after saving; "Enter key" on the title screen.
- Also autosave to localStorage (wrapped in try/catch).
- Automated tests for encode/decode round-trips and corrupted-key
  rejection.

---

## 9. Tooling

- **Debug mode** (toggle key): collision boxes, FPS, room jump,
  invincibility.
- **Asset showcase** (`tools/showcase.html`, also deployed): every character
  and object look on a turntable with the real renderer. Add every new
  visual asset (monsters, pickups) to it.
- **Room editor** (in-game, Phase 2): place blocks, enemies and pickups
  with the mouse, preview in the real neon look, export room JSON.
- **World map tool** (`tools/world-map.html`, Phase 3, D66): every room
  as a node on a simple map grid (positions in `world.json`), with its
  connections; drag rooms and save; adds and removes rooms and
  connections (exits in the middle of the facing walls, D77); flags rooms
  not reachable from the start; opens a room in the room editor; F3
  shows the pickup report (every permanent item by save bit, where it
  lies, not placed or placed twice). Dev
  server only, never shown to players: exploring is part of the game
  (D67).
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

**Phase 1 (v0.1) — Foundations**
Vite setup, repo scaffolding, README, docs skeleton, PR template, CI
(test + build). Fixed-timestep loop and input mapping. Isometric camera,
resolution-independent rendering, neon wireframe room with bloom, back
walls only. Player movement, jumping, gravity, grid collision, drop
shadow. Pushable objects that fall and stack; floor holes (death trap,
filled by pushed blocks). JSON Schema + validated
room loading; 2–3 connected test rooms with flip-screen exits. Health
HUD. Debug mode.

**Phase 2 (v0.2) — Hazards, combat, editor**
Damage, invulnerability and death at 0 integrity. Moving, collapsing,
hazard and void blocks. Bugs enemy. Zap spell and mana. X-ray outline.
In-game room editor with JSON export. Step plan: docs/design.md (D43).

**Phase 3 (v0.3) — Spells and pickups**
World map tool for the developer. Pickups and a progress model, data
disks. Switches (pressure plates, bolt targets) unlocking exits. Viruses,
Sentinels and Pop-ups. Shield, Firewall, Pause, Warp and Cut & Paste spells.
A discussion step on further spells, spell upgrades and buff items; the
first buff items; the upgrades Zap+, Shield+ and the double jump (D91, D92, D95).
Backups (lives) and backup shrines (D92). Score, bonus bits and secrets. Fragments, access levels
and the core. Step plan: docs/design.md (D65).

**Phase 4 (v0.4) — Guardians, saves, tooling**
Firewall Wardens. The roster's new spells (D88, D89): Compile, Fork,
Scan and Pull. Title screen and pause menu. Access keys,
URL saves, localStorage autosave, tests. Map screen. Reachability
checker. Design skills and subagents.

**Phase 5 (v0.5+) — Polish**
Full post-processing, juice pass, music and SFX, audio-reactive visuals,
settings menu with quality presets, fullscreen, gamepad, key rebinding.
Then content production toward 1.0.0, including biome environmental
effects (Glitchmire drain, Frostbyte low-res, Abyssal low gravity) with
health pickups and safe rooms.
