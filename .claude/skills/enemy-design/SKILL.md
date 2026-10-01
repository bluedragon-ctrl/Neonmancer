---
name: enemy-design
description: Design or tune a Neonmancer enemy template in data/defs.json (look, movement, attack, hostility, color rules D119) and place enemies in rooms. Use when adding, changing or placing enemies or a biome roster.
---

# Enemy design

Enemies are universal and data-driven (D48, D78, D119): a **template** in
`data/defs.json` `enemies` is the whole behavior; a room only says
`{ id, template, at, path? }`. Source of truth: `schemas/defs.schema.json`
(`enemyTemplate`, with descriptions), `docs/design.md` "Enemies" (field
table, roster, AI rules). Prefer the monster editor
(`npm run dev`, `/tools/monster-editor.html`) to edit templates; never edit
`defs.json` templates by hand-guessing colors.

## Building a template
- One behavior per template, named after what it is. A variant is a new
  template with `extends` and only what it changes (always its own color).
- Axes, freely combined: `look` (13 models, `src/render/entity-view.js`),
  `movement` (`patrol` needs a room path; `stationary`; `chase` needs
  `aggroRange` > 0), `attack` (`touch`, `burst`, `arc`, `bolt`, `none`),
  `hostility` (`hostile`, `peaceful`, `provoked`).
- Charged attacks (`burst arc bolt`) need `aggroRange >= attackRange`; a
  peaceful enemy must not fire; a bolt takes `boltSpeed` (slow enough to
  dodge), `boltPattern` (`aimed`/`cross`), `boltBounces`.
- Telegraph: `attackCharge` (0.4 s default) is the warning; keep it long
  enough to react. `attackCooldown` gives breathing room.
- Tuning anchors: bug 2 integrity, speed 3; virus aggro 5, chase 3.5;
  sentinel keeps 5 away; warden 8 integrity, `pausable: false`.
- `bounce` makes a trampoline top (2 blocks up, harmless); `solid` makes a
  platform (golem). Both change how a room's geometry works: say so.
- `height` (default 0.6, up to 1.9) makes a taller body in one cell; above
  1 it can't be jumped over and needs the cell above it free.

## Bosses (D104, D134, D135)
- A `boss` block makes a template a boss: hostile, never paused or
  pulled, may take more than 15 integrity, gets the three gold rings and
  a boss bar (name: `boss.<template>` in `data/strings.json`).
- `phases`: `[{ "from": 1, ... }, { "from": 0.5, ... }]`, each changing
  fighting values (movement, attack, speeds, ranges, charge, cooldown,
  bolts, damage) and `teleport` (seconds between jumps to a free cell of
  its floor, away from the wizard). Each phase must be valid on its own
  (a chaser phase needs aggro, charged attacks aggro >= range).
- `armor: "plate"`: every hit glances off unless it stands on a floor
  plate; give its arena plates it will walk over (a chaser follows him).
- In a room: `{ id, template, at, drop }`, `drop` the id of a permanent
  pickup of the room (it falls there when the boss is beaten; once found,
  the boss stays away). One boss a room, no shrine; arena doors stay
  open (he may retreat). Prototypes: `null_pointer`,
  `proto_gatekeeper` in the test arenas `boss_arena`, `boss_plates`.

## Color rules (D119, D99, D121)
- Every template has a color of its own, >= 0.09 apart in OKLab from every
  other (`MIN_TEMPLATE_COLOR_GAP`; `freeColor()` in `src/data/colors.js`
  picks one). `tests/colors.test.js` enforces it on shipped data.
- Eye color shows hostility (red hostile, amber provoked, cyan peaceful);
  don't use the meaning colors for bodies: red `#ff2a3a` is danger, lime
  crates, cyan platforms, magenta the wizard, white mechanisms.
- Keep body colors away from the biome's room color so enemies pop (D121:
  warm amber Lattice -> cool hostile colors).

## Placing enemies in rooms
- Patrol paths: level legs along x or z at the height of `at`; give
  `pause` for readable turns. Leave the wizard room to pass or a way to
  freeze (Pause), bounce over or shoot them.
- Enemies never step into holes or onto void, and pop if ground goes: don't
  put a patrol over a hole it would treat as a wall.
- A hostile enemy sees through open cells only: blocks and crates hide the
  wizard, so cover is a puzzle tool.
- Introduce a new enemy where it is harmless or alone (a safe first look),
  then combine it. Peaceful ones (glowbug, golem, pixie) are life and tools.
- Frozen enemies can be stood on or cut (Cut & Paste); a plate counts an
  enemy standing on it. Check these don't break a room's puzzle.
- Enemies are not covered by `check:reach`: judge their timing by the
  numbers in the checklist (walk 13 ticks/cell, jump 34 ticks).

## After a change
1. `npm run validate:data`, `npm test` (colors, enemies, monster-edit).
2. Add or update the look in `tools/showcase.js` (CLAUDE.md §9).
3. Update `docs/design.md` Enemies table; record a decision if the rule
   changed. Rooms that use a changed template change behavior: list the
   authored ones in the PR (D90), never edit them.
