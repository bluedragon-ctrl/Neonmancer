# NEONMANCER

An isometric, flip-screen adventure for desktop browsers. A cheerful wizard is
zapped into the Grid, a neon digital kingdom where magic and code are the same
thing. Explore rooms, solve block puzzles, fight corrupted programs with spells
and collect key fragments to reboot the Grid.

> Status: early development. Phase 2 (v0.2.0, hazards, combat, editor) is
> done: on top of Phase 1's walking, jumping and crate pushing, the wizard
> takes damage and derezzes, crosses hazard and void blocks, rides moving
> platforms, runs over collapsing blocks, fights bugs with the Zap spell and
> shows through walls as an X-ray outline, across seven test rooms. Rooms
> are made in the in-game room editor (F2), with open, data-driven block
> types and six biome looks. No goal yet. Next: Phase 3 (spells and
> pickups: data disks, Viruses and Pop-ups, four more spells, score and
> bonus bits, fragments and the core), then Phase 4 (Wardens, saves, the
> map, tooling).
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
npm run build          # production build into dist/
npm run preview        # serve the production build locally
```

The asset showcase shows every character and object look side by side:
`/tools/showcase.html` in the dev server or on the deployed site
(`?asset=wizard` for a close-up).

The room editor opens with F2 in the game: in the dev server it saves
straight to `data/`, in a build it exports the room JSON (docs/design.md,
Room editor).

## Project layout

| Path | Contents |
|---|---|
| `src/` | Game engine and game code (plain ES modules) |
| `data/` | All game content as JSON (rooms, definitions, biomes, world) |
| `schemas/` | JSON Schema for every data format |
| `tests/` | Unit tests (`node --test`) |
| `tools/` | Dev tooling: data validation (Ajv), Vite plugin, asset showcase |
| `docs/` | Architecture, design and the decision log |

## Documentation

- [CLAUDE.md](CLAUDE.md) — vision, locked design decisions and working rules
- [docs/design.md](docs/design.md) — game design and the current phase plan
- [docs/architecture.md](docs/architecture.md) — how the code fits together
- [docs/decisions.md](docs/decisions.md) — decision log with reasons
- [CHANGELOG.md](CHANGELOG.md) — release notes

## Versioning

MAJOR.MINOR.PATCH: MINOR is the phase (0.2 = Phase 2), PATCH counts the
pull requests merged since that phase's release, computed at build time;
1.0.0 will be the first full release. See CLAUDE.md §10 and D42.

## Contributing

Work happens on feature branches with Conventional Commits and pull requests
into `main`, which always stays playable. See CLAUDE.md §10.
