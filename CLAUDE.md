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
  - HUD and text scale with screen size.
- Optional setting (off by default): zoom to fit smaller rooms.

---

## 4. Locked design decisions

### Grid and rooms
- Coordinates: y is up; room size is [x, y, z] = [width, height, depth];
  the floor is at y = 0; back walls are the x = 0 and z = 0 planes.
- 1 block = 1 unit (1x1x1). Player jump height: 1 unit (clears exactly one
  block, never two).
- Player hitbox 0.6 x 1.5 x 0.6 (the hat is visual only), so the wizard
  needs 2 blocks of headroom.
- Blocks snap to the grid; player and enemies move freely (sub-grid).
- Room size: width + depth <= 32, height <= 6 (max 16x16; also e.g.
  20x12, 24x8). Mix of small (8x8), standard (12x12) and large (16x16).
- Every room fits the fixed camera framing without scrolling.
- World target: 40–60 rooms.

### Engine
- Fixed-timestep loop: 60 logic updates per second, rendering
  interpolated; identical behavior on any refresh rate.
- Input via action mapping (move, jump, cast, cycle spell, pause, map);
  game code never reads raw keys. Rebinding and gamepad later.
- Blocks rendered with instanced or merged geometry for performance.

### Depth readability
- Glowing drop shadow directly under the player and falling objects.
- Only back walls rendered; front walls omitted.
- Neon edges are drawn over dark occluding faces, so hidden edges never show.
- X-ray outline when the player is hidden behind blocks.
- Movement along grid axes (screen-diagonal) by default;
  screen-relative mode as a later option.

### Objects and blocks
- Types: static, pushable, moving (paths or up/down cycles; player rides
  them), collapsing (vanish after being stepped on, optional respawn),
  hazard (deals damage), void (instant death when the player falls onto it).
- Objects rest on and stack on each other (pushed off ledges, falling).
- Push one object at a time; an object with something on top of it cannot
  be pushed (only the top of a stack moves).
- No basic carry action: the wizard can only push objects until he
  unlocks the Cut & Paste spell.
- Frozen enemies can be stood on; active enemies cannot.

### Damage and death
- Hazards and enemies deal damage, followed by brief invulnerability with
  blinking.
- No fall damage. The only instant death is falling onto void blocks.
- On death the wizard derezzes into pixels and recompiles at the room
  entrance — quick and non-punishing.

### Persistence
- Rooms fully reset on re-entry (enemies, blocks, moving platforms).
- Collected things stay collected: fragments, spells, scrolls, secrets,
  and bonus bits.
- Each room has up to 4 bonus slots, tracked per room in the save.

---

## 5. Game systems

### Player
Move, jump, gravity, push objects, health ("integrity") and mana ("energy").

### Spells (programs, unlocked by finding data disks)
- **Zap** — fast bolt, short cooldown
- **Firewall** — brief shield that blocks projectiles
- **Pause** — freezes an enemy; frozen enemies act as platforms
- **Warp** — short teleport through gaps or past hazards
- **Cut & Paste** — cut one object into inventory, paste it at a valid
  grid spot in front of the wizard

Mana recharges slowly. Installing a spell plays a short animation.

### Enemies (corrupted programs; cute but clearly dangerous)
- **Bugs** — patrol fixed paths
- **Viruses** — chase on line of sight, give up when it breaks
- **Pop-ups** — stationary, fire slow projectiles
- **Firewall Wardens** — tougher guardians blocking key rooms

Each has a distinct color, silhouette and bouncy animation.
AI is implemented as named behavior modules referenced from data.

### Biomes (Grid sectors)
Each room has a biome defining look and optional environmental effects,
defined in data and combinable. Health pickups and safe rooms balance
drain effects.
- **Home Lattice** — amber (the default room color), safe
- **Glitch Zone** — magenta, slow health drain
- **Low-Res Zone** — pixelated, reduced visibility
- **Zero-G Sector** — low gravity
- **Firewall Citadel** — red, guardians

### Goal
Collect all key fragments (count defined in world data) and deliver them
to the central core. No time limit.

### Arcade layer
Score for enemies, pickups and secrets; floating score popups; bonus bits
in rooms; "all bits collected" room bonus. High score stored locally.

### Map
Map screen showing visited rooms, connections and fragment markers.

---

## 6. Art direction and feel

- Bright neon wireframe on dark background; saturated cyan, magenta,
  lime, amber. Infinite grid floor fading into darkness.
- The wizard: wireframe figure with a big pointy hat and robe, readable
  at a glance. Characters use slightly thicker lines than the environment.
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

- `data/defs.json` — object types, enemy types (speed, health, behavior,
  color), spells
- `data/biomes.json` — palette, floor pattern, effect settings,
  environmental effects
- `data/rooms/*.json` — one file per room: biome, size [x, y, z], exits,
  objects, enemies, bonus slots; only overrides of type defaults
- `data/world.json` — room connections, start room, fragment locations,
  number of fragments required, core location
- `data/strings.json` — all UI text
- `data/audio.json` — named audio events mapped to files
  (e.g. "jump", "pickup", "music:glitch_zone")
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

- Bit layout (one versioned module, spare bits reserved):
  format version 4, room 7, spells 5, items 8, fragments 8, health 4,
  score 20, secrets 16, bonus slots 4 per room (reserve for 64 rooms =
  256), checksum 16.
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
- **Room editor** (in-game, Phase 2): place blocks, enemies and pickups
  with the mouse, preview in the real neon look, export room JSON.
- **Reachability checker** (Phase 3): script that searches the grid with
  jump height, pushable objects and available spells to flag unsolvable
  rooms. Used by CI, the editor, and design skills/subagents.
- **Claude Code skills and subagents** (Phase 3+, once schemas are
  stable): room design and enemy design skills (schema, rules, annotated
  examples); room-drafting and level-review subagents.

---

## 10. Development process

- Git: protected `main` (always playable), feature branches
  (`feat/cut-paste-spell`), pull requests. Use the GitHub CLI to open a
  PR for each step; the author reviews and merges.
- Not every development computer has the GitHub CLI. If `gh` is missing,
  push the branch and give the author a prefilled compare link
  (`https://github.com/bluedragon-ctrl/Neonmancer/compare/main...<branch>?expand=1`)
  plus the PR title and body, so they can create the PR manually.
- CLAUDE.md is versioned in the repo so every machine shares it; put
  working rules here, not in machine-local notes.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- PR template: summary, how it was tested, docs updated.
- Semantic Versioning: 0.x during development (0.1 = Phase 1, ...),
  1.0.0 for the first full release. Git tags, GitHub Releases,
  CHANGELOG.md.
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
shadow. Pushable objects that fall and stack. JSON Schema + validated
room loading; 2–3 connected test rooms with flip-screen exits. Health
HUD. Debug mode.

**Phase 2 (v0.2) — Hazards, combat, editor**
Moving, collapsing, hazard and void blocks. Bugs enemy, damage and
invulnerability. Zap spell and mana. Biomes with health drain. X-ray
outline. In-game room editor with JSON export.

**Phase 3 (v0.3) — Game structure**
Viruses, Pop-ups, Firewall Wardens. Firewall, Pause, Warp, Cut & Paste
spells and data disks. Fragments and the core. Score, bonus bits,
secrets. Access keys, URL saves, localStorage autosave, tests. Map
screen. Reachability checker. Design skills and subagents.

**Phase 4 (v0.4+) — Polish**
Full post-processing, juice pass, music and SFX, audio-reactive visuals,
settings menu with quality presets, fullscreen, gamepad, key rebinding.
Then content production toward 1.0.0.
