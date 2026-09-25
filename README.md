# NEONMANCER

An isometric, flip-screen adventure for desktop browsers. A cheerful wizard is
zapped into the Grid, a neon digital kingdom where magic and code are the same
thing. Explore rooms, solve block puzzles, fight corrupted programs with spells
and collect key fragments to reboot the Grid.

> Status: early development — Phase 1 (v0.1, foundations). Not playable yet.
> Latest `main` build: https://bluedragon-ctrl.github.io/Neonmancer/

## Requirements

- Node.js 22 or newer (CI uses Node 24)
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

## Project layout

| Path | Contents |
|---|---|
| `src/` | Game engine and game code (plain ES modules) |
| `data/` | All game content as JSON (rooms, definitions, biomes, world) |
| `schemas/` | JSON Schema for every data format |
| `tests/` | Unit tests (`node --test`) |
| `tools/` | Dev tooling: data validation (Ajv), Vite plugin |
| `docs/` | Architecture, design and the decision log |

## Documentation

- [CLAUDE.md](CLAUDE.md) — vision, locked design decisions and working rules
- [docs/design.md](docs/design.md) — game design and the current phase plan
- [docs/architecture.md](docs/architecture.md) — how the code fits together
- [docs/decisions.md](docs/decisions.md) — decision log with reasons
- [CHANGELOG.md](CHANGELOG.md) — release notes

## Contributing

Work happens on feature branches with Conventional Commits and pull requests
into `main`, which always stays playable. See CLAUDE.md §10.
