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

### D11 — 2026-09-25 — GitHub Pages deploys every push to main
A workflow builds and deploys `main` to GitHub Pages on each push (Pages
source: "GitHub Actions"). Vite uses a relative `base: './'`, so the build
works under `/Neonmancer/`. This replaces "deploy on release" for now.
**Why:** the author tests the latest `main` online, from any computer.
Release-only deploys can come back later (e.g. a separate test URL) if needed.

### D12 — 2026-09-25 — Block edges from a corner rule, not EdgesGeometry
Static block edges are computed from grid occupancy (`render/edges.js`): an
edge is drawn when the four cells around it form an outer or inner corner,
and collinear pieces are merged. The result is drawn as one `LineSegments2`
(thick lines); faces are one `InstancedMesh` of dark cubes.
**Why:** `EdgesGeometry` works per mesh and would draw lines between
neighbouring blocks (D5 wants them dropped); the corner rule is simple,
exact for grid blocks and unit tested.

### D13 — 2026-09-25 — Render pipeline: half-float, 4× MSAA, one effect pass
The composer renders into half-float buffers (colors above 1 feed the bloom)
with 4× multisampling to smooth lines. The canvas itself has no antialias or
depth buffer. All effects share one `EffectPass`. The render scale can be
tried with `?scale=0.5` until the settings menu exists (Phase 4).
**Why:** smooth neon lines and a controllable glow at a fixed cost; one
effect pass keeps the post-processing cheap.

### D14 — 2026-09-25 — Amber is the default room color; outer floor grid is dark gray
Rooms and the floor grid inside them default to amber. Outside the room the
floor grid is a neutral dark gray and fades out within 5 units.
**Why:** author's preference; a colorless surrounding makes it obvious to the
player what is part of the room. Biome palettes (step 3) can still override
the room color. Home Lattice, the default safe biome, is amber (was cyan
in CLAUDE.md §5); other biomes use their own colors.

### D15 — 2026-09-25 — Data errors: build fails, dev server shows them in the game
Any data error (schema or semantic) fails `npm run build`, so invalid data
never deploys. In the dev server the schema errors reach the game through
the virtual module `virtual:data-schema-errors`; the game adds its own
semantic check and lists every problem on an error screen. Rooms are keyed
by file name while validating, so a wrong `id` gives one clear error instead
of a cascade.
**Why:** one place (the game window) to see what is wrong while editing
data, with all problems at once; no chance of shipping broken rooms.

### D16 — 2026-09-25 — Every exit must be connected
An exit that no `world.json` connection uses is an error, as is an exit used
twice.
**Why:** an opening that leads nowhere would let the player walk out of the
world. A dead-end opening can be modelled as blocks instead.

### D17 — 2026-09-25 — Object types differ by shape, not only color
Each object type in `defs.json` can set a style: `edges` (solid / dashed),
`mark` (none / inset / cross / brackets: a line pattern on every face) and
`faces` (dark / tinted: faces shaded in the object color, top lighter) and
`tint` (0–1, how much color the tinted top face gets; default 0.1).
Objects can override the style like any other type property. Crates use an
inset square with tinted faces; static blocks stay plain.
**Why:** color alone is not enough for color-blind players and gets washed
out by bloom. Keeping the style in data lets every future type pick its look
without code changes, and the room editor can preview it.
