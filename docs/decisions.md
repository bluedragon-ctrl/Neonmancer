# Decision log

Each entry: date, decision, reason. Newest at the bottom. When a decision
changes, add a new entry that supersedes the old one (don't rewrite history)
and update CLAUDE.md if it is a locked decision.

---

### D1 — 2026-09-25 — Coordinate system: y is up
Room `size` is `[x, y, z]` = `[width, height, depth]`; the floor is at y = 0.
A block at cell `[x, y, z]` fills `[x, x+1] × [y, y+1] × [z, z+1]`.
The camera looks from the `+x +y +z` direction, so the back walls are the
`x = 0` and `z = 0` planes and the `+x` / `+z` sides are the open front.
**Why:** matches three.js conventions, so no axis swapping in code.

### D2 — 2026-09-25 — True isometric projection, fixed view height
Orthographic camera at azimuth 45°, elevation 35.26°, fixed view height of
about 20 world units (16:9 frame). A room's projected height is
(w + d + 2h) / √6 ≤ 18 units for every legal room (w + d ≤ 32, h ≤ 6), so all
maximum-size rooms frame identically and smaller rooms are centered.
**Why:** one fixed zoom satisfies "identical framing at any resolution"
without per-room camera logic. 2:1 dimetric remains an option if pixelation
effects later look better with it.

### D3 — 2026-09-25 — Player hitbox 0.6 × 1.5 × 0.6, jump clears one block
The hat is visual only; the wizard needs 2 blocks of headroom. `jumpHeight`
is 1.2 so a 1-block step is reliably clearable but 2 blocks never are.
**Why:** keeps "jump height = 1 unit" true with a little forgiveness, and
gives level design a simple rule (1-high gaps are impassable).

### D4 — 2026-09-25 — Only objects with nothing on top can be pushed
One object is pushed at a time (no chain pushing). An object with anything
resting on it is blocked; the top of a stack can be pushed off.
**Why:** author's choice; clearer puzzles and simpler rules than moving
whole stacks.

### D5 — 2026-09-25 — Neon wireframe with dark occluding faces
Blocks draw glowing edges over dark solid faces, so hidden edges are not
visible. Edges between coplanar neighbouring blocks are dropped.
**Why:** a see-through wireframe becomes unreadable once blocks stack.

### D6 — 2026-09-25 — Exit connections live only in world.json
Room files describe exit geometry (side, position, width, height) with a
stable exit id; `world.json` pairs exits (`"room.exit"`). Connected exits
must be on opposite sides and have equal width. Phase 1 has horizontal
exits only.
**Why:** single source of truth for the room graph (as CLAUDE.md §7 says);
the validator can check both ends.

### D7 — 2026-09-25 — Tests use Node's built-in runner, not Vitest
`npm test` runs `node --test`. Logic modules stay plain ES modules without
Vite-only features; `import.meta.glob` is confined to the data entry file.
**Why:** zero dependencies and no config; enough for the logic tests we
need. Vitest can be adopted later if DOM/WebGL or Vite-aware tests are needed.

### D8 — 2026-09-25 — Ajv as a dev-only validator
JSON Schema validation (Ajv, draft 2020-12) runs in a small Vite plugin
(dev server start, on data file change, on build) and in CI. The semantic
checks JSON Schema cannot express (bounds, overlaps, exits, connections) are
plain JS and also run at runtime.
**Why:** data is bundled at build time and cannot change afterwards, so
build-time validation gives the same safety as load-time validation without
shipping Ajv to players.

### D9 — 2026-09-25 — PRs without the GitHub CLI
Development happens on several computers, not all with `gh`. When `gh` is
available it is used to open PRs; otherwise the branch is pushed and the
author gets a prefilled compare link plus the PR title and body to create
the PR manually.
**Why:** don't block work on a missing tool; no API tokens are handled by tools.

### D10 — 2026-09-25 — Line endings normalised to LF
`.gitattributes` forces LF in the repo.
**Why:** development on multiple machines (Windows included) must not
produce whole-file line-ending diffs.
