# NEONMANCER

An isometric, flip-screen adventure for desktop browsers. A cheerful wizard is
zapped into the Grid, a neon digital kingdom where magic and code are the same
thing. Explore rooms, solve block puzzles, fight corrupted programs with spells
and collect key fragments to reboot the Grid.

> Status: early development. Phase 3 (v0.3.0, spells and pickups) is
> done: the wizard finds data disks for seven spells (Zap, Shield,
> Firewall, Pause, Blink, Warp, Cut & Paste) and three upgrades (Zap+,
> Shield+, the double jump), buff chips, secrets and the 64 key
> fragments; switches and access levels lock exits; viruses, sentinels,
> worms, crawlers and towers join the bugs; backups and backup shrines,
> a score from what he has found, and the central core that raises his
> access level and, with every fragment, reboots the Grid. Fifteen test
> rooms, with a world map tool for the developer. Next: Phase 4
> (Wardens, more spells, saves, the map, tooling); the title screen and
> pause menu are in.
> Latest `main` build: https://bluedragon-ctrl.github.io/Neonmancer/

## Requirements

- Node.js 22 or newer (CI uses Node 24; the tests also run on Node 20)
- A desktop browser (Chrome, Firefox, Edge or Safari); 1920x1080 or larger recommended

## Getting started

```bash
npm install
npm run dev            # dev server with hot reload
npm test               # unit tests (Node's built-in test runner)
npm run validate:data  # check data/ against schemas/ and the game rules
npm run check:reach    # can the wizard reach every exit and pickup, and in what order?
npm run build          # production build into dist/
npm run preview        # serve the production build locally
```

The asset showcase shows every character and object look side by side:
`/tools/showcase.html` in the dev server or on the deployed site
(`?asset=wizard` for a close-up).

The room editor opens with F2 in the game: in the dev server it saves
straight to `data/`, in a build it exports the room JSON (docs/design.md,
Room editor).

The world map tool shows every room and connection on one page, flags
rooms out of reach, and moves rooms on the map: `/tools/world-map.html` in
the dev server only (docs/design.md, World map tool). The monster editor
tunes the enemy templates, with a live preview: `/tools/monster-editor.html`
in the dev server only (docs/design.md, Monster editor).

On Windows, `tools\dev.bat` starts the dev server and opens the game
(`tools\dev.bat map`, or double-click `tools\world-map.bat`, opens the
world map; `tools\dev.bat monsters` or `tools\monster-editor.bat` the
monster editor; `tools\dev.bat showcase` the asset showcase), and `tools\map-pr.bat "what changed"` sends saved room
and map changes as one pull request.

## Project layout

| Path | Contents |
|---|---|
| `src/` | Game engine and game code (plain ES modules) |
| `data/` | All game content as JSON (rooms, definitions, biomes, world) |
| `schemas/` | JSON Schema for every data format |
| `tests/` | Unit tests (`node --test`) |
| `tools/` | Dev tooling: data validation (Ajv), Vite plugin, asset showcase, world map tool |
| `docs/` | Architecture, design and the decision log |

## Documentation

- [CLAUDE.md](CLAUDE.md) — vision, locked design decisions and working rules
- [docs/design.md](docs/design.md) — game design and the current phase plan
- [docs/architecture.md](docs/architecture.md) — how the code fits together
- [docs/decisions.md](docs/decisions.md) — decision log with reasons
- [CHANGELOG.md](CHANGELOG.md) — release notes

## Versioning

MAJOR.MINOR.PATCH: MINOR is the phase (0.3 = Phase 3), PATCH counts the
pull requests merged since that phase's release, computed at build time;
1.0.0 will be the first full release. See CLAUDE.md §10 and D42.

## Contributing

Work happens on feature branches with Conventional Commits and pull requests
into `main`, which always stays playable. See CLAUDE.md §10.
