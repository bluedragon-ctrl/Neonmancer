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
`mark` (none / inset / cross / brackets: a line pattern on every face),
`faces` (dark / tinted: faces shaded in the object color, top lighter) and
`tint` (0–1, how much color the tinted top face gets; default 0.1).
Objects can override the style like any other type property. The default
`crate` has an inset square with dark faces; the author kept three more looks
as named box types (`crate_plain`, `crate_cross`, `crate_dashed`) for
rooms to use. Static blocks stay plain. The `brackets` mark and dashed +
tinted combination stay available through `overrides` but have no type.
**Why:** color alone is not enough for color-blind players and gets washed
out by bloom. Keeping the style in data lets every future type pick its look
without code changes, and the room editor can preview it.

### D18 — 2026-09-25 — Holes are floor tiles, not a lower level
Rooms can mark floor tiles as holes (`holes`, `[x, z]` at y = 0). They are a
look plus a rule: black pits (the floor shader cuts them out, pit walls fade
to a black bottom, bright rim, short corner lines fading to black) on a faintly tinted room
floor. The player dies when his hitbox center is over a hole at floor level;
a pushed block drops in and fills the hole, making it floor. Holes never
lead to another room. The data format, validation and look land in step 3,
dying in step 4, filling in step 5.
**Why:** a trap and a push-puzzle element ("fill the pit to cross it")
without real vertical space, which would need vertical exits and a deeper
room model. Unlike Phase 2 void blocks, holes are at floor level.

### D19 — 2026-09-25 — Fixed-height jumps with coyote time and a jump buffer
Every jump reaches `jumpHeight` (1.2); releasing the key early does not cut
it short. A jump still works a few ticks after leaving a ledge (coyote time)
and a press shortly before landing is remembered (jump buffer).
**Why:** puzzles rely on "a jump clears exactly one block" (D3); variable
height would make that depend on how long the key is held. The small
forgiveness windows make jumps feel responsive without changing their reach.

### D20 — 2026-09-25 — Asset showcase page, deployed with the game
`tools/showcase.html` renders every character and object type on a turntable
with the game's own renderer. It is a second Vite entry, so it is also on
GitHub Pages; the dev server port follows `PORT` so several worktrees can
run side by side.
**Why:** author's proposal: review and tune looks (wizard, crates, later
monsters) without playing to them, locally or online.

### D21 — 2026-09-25 — Wizard look: cone body, ball head, floating hands, tilted hat
The wizard is a cone body, a ball head drawn as a globe, two floating ball
hands (no arms) and a pointy hat (cone + brim) tilted back. Body and hat are
magenta, head and hands cyan. The upright cone lines and the globe lines are
thin and dark, the rims bright.
**Why:** author's design. The hat tilt keeps the face visible from the
isometric camera, which looks down on the brim; faint upright lines keep the
silhouette clean.

### D22 — 2026-09-25 — Characters use a hologram look
Supersedes the line style of D21 (the wizard's shapes stay). Characters are
smooth solids with a shader that keeps the core near-black and glows towards
the silhouette (rim / Fresnel), faint scanlines drifting up, a thin outline
from an inverted hull, and glowing eyes (`render/holo.js`). Outline width is
in world units, which scale with the render height because the framing is
fixed (D2). Rooms and objects stay wireframe.
**Why:** author's choice after comparing toon, hologram and faceted mockups
in the asset showcase. Wireframe globe lines made the ball head and face hard
to read; the hologram reads as a figure, fits "programs in the Grid", and
gives monsters a shared look (color + silhouette + eyes).

### D23 — 2026-09-25 — Direction keys: Right goes up-right on screen
Movement keys follow the grid axes rotated so that Right = −z (screen
up-right), Up = −x (up-left), Left = +z (down-left), Down = +x (down-right).
Replaces the step 1 mapping (Up = up-right, Right = down-right).
**Why:** author's preference after playing: "right" should head to the
upper right corner. Neither isometric mapping is standard; a setting with
both (and the planned screen-relative mode) can come with the settings menu.

### D24 — 2026-09-25 — Dying resets the room
When the wizard respawns after falling into a hole, the room is rebuilt
from data (objects back in place, holes open again), as on re-entry.
**Why:** a push puzzle can be left unsolvable (a crate in a corner or in
the wrong hole); dying already means starting the room over, so resetting
it is the least surprising and needs no separate "reset room" action.
Softlocks without a hole are still possible; a reset action can come with
the pause menu if rooms need it.

### D25 — 2026-09-25 — Pushables are moving bodies, not grid cells
Pushable objects collide as boxes (`box()`), not as cells in the static
grid; the player is a body too. Pushing needs a short deliberate shove
(`pushDelay`) and the wizard lined up with the object; a slide is one cell
at 3 units/s. A plugged hole keeps its object, top flush with the floor.
**Why:** the player follows a sliding crate smoothly instead of stopping at
reserved cells, and the same code handles standing on crates, crates
landing on the wizard and crates in holes. Showing the plug makes it
obvious where the pit was filled.

### D26 — 2026-09-25 — Flip-screen exits keep the offset; the arrival is the respawn point
Leaving through an exit enters the connected room (after a short fade, see
below), half a cell
inside the matching exit, with the same offset along the edge and height
above the exit floor; fall speed and facing carry over. The arrival point
on the exit floor becomes the room's respawn point. Exits on the open front
sides are marked with floor chevrons; back exits are doorways cut out of
the wall. Objects cannot be pushed out of a room, and the first row inside
an exit must be free (validated).
**Why:** keeping the offset makes the two rooms feel joined; respawning at
the entrance matches "recompile at the room entrance" (CLAUDE.md §4). The
front sides have no wall, so without a mark a front exit is only a gap in a
thin floor line. Objects leaving would be lost, since rooms reset.

### D27 — 2026-09-25 — Room transitions fade through black
Leaving a room fades to black in 0.2 s with the world frozen while the
wizard walks on out through the exit; the next room fades in over 0.25 s
and is playable right away. The veil is a DOM layer between the canvas and
the HUD, so HUD text stays readable.
**Why:** author's request; an instant swap felt abrupt. Freezing only the
fade-out keeps the player from turning back mid-transition, and letting
the fade-in run avoids dead time.

### D28 — 2026-09-25 — Exits show a data stream in the destination's color
Every exit gets dashes flowing out of the room along floor lanes (and up the
doorway frame on back exits), colored like the room it leads to, dim and
slow when the wizard is far, bright, fast and pulsing when he is close.
Chosen from six proposals (stream, portal curtain, destination hint,
proximity glow, glitch on crossing, light spill) as stream + destination
color + proximity; reviewed in the asset showcase first.
**Why:** author's choice. Exits read at a glance on both the walled back
sides and the open front, hint where they lead (useful with 40–60 rooms)
and react to the player, while staying thin lines that keep rooms clean.
A curtain may come later; glitch on crossing belongs to the juice pass.

### D29 — 2026-09-25 — Doorways lead into darkness; a quieter stream
Behind every back doorway a short dark tunnel (floor, sides, ceiling and
far end, shaded from the void color to black, with corner lines fading into
it) hides the outer floor grid, as the pits do for holes. The exit stream
(D28) is dimmer and thinner and reaches only half a tile past the threshold.
**Why:** author's review: the grid seen through a doorway made it look like
a hole in a thin wall rather than a way out, and the stream was too strong.

### D30 — 2026-09-25 — Exit effect only on the doorway frame and the front arrows
Supersedes the stream parts of D28 and D29 (the dark tunnels stay). The
floor-lane data stream and the proximity glow are removed. The destination
color now goes on moving dashes up the doorway frame (back exits) and on two
arrows gliding out of front exits, replacing the static floor chevrons.
**Why:** author's review: the stream over the floor was too much even when
toned down; the color hint and motion work better kept on the exit's own
outline.

### D31 — 2026-09-25 — Doorway effect uses the arrow pattern
Replaces the frame dashes of D30. On back doorways two copies of the
doorway frame, in the destination color, glide from the wall back into the
dark tunnel, fading in and out, half a glide apart: the same pattern as the
arrows on front exits.
**Why:** author's choice; one pattern for every exit, and frames receding
into the dark read as a passage.

### D32 — 2026-09-25 — Doorways: a dashed stream into the tunnel
Replaces the gliding frames of D31. Dashes in the destination color flow
from the doorway into the dark tunnel along its four corner edges and two
lanes on its floor, fading to black. Front exits keep the gliding arrows.
The two styles were compared side by side in the asset showcase.
**Why:** author's choice. It merges the first stream idea (D28) with the
tunnel: the motion stays inside the doorway instead of spreading over the
room floor, and the fade into the dark adds depth.

### D33 — 2026-09-25 — Front exits: one small arrow per tile
Front exits show one small arrow per tile of exit width, side by side,
gliding out to the edge within the first row of tiles. Replaces one large
arrow centered on the exit.
**Why:** author's review: the large arrow and its glide covered about four
tiles in front of the exit; small arrows per tile keep the mark on the exit
itself and show its width.

### D34 — 2026-09-25 — HUD layout, bundled retro fonts, text in strings.json
Integrity top left, room banner top center, game name top right, terminal
messages bottom left, fullscreen hint bottom center. Labels, banner and
hint use Orbitron, terminal lines Share Tech Mono; both are bundled through
Fontsource (Latin) instead of loaded from a font CDN. Pixel fonts (Press
Start 2P, VT323) were tried first. Terminal messages and banners go through
two functions any module can call: `say(key, values)` and
`announce(key, values, options)`; room names use the banner.
Every UI text comes from `data/strings.json` by dotted key; the schema
lists the keys the game uses. The startup error screen keeps its own
English text, since it must work when the data does not. F toggles
fullscreen (an action, so it can be rebound later).
**Why:** CLAUDE.md asks for a retro font and a big clear HUD; the author
preferred smoother fonts to the pixel ones. Bundling keeps the game
self-contained on GitHub Pages and working offline. `say()` and `announce()` let
game logic, spells or pickups print messages without knowing the HUD.
The corners keep the room area (center) clear in every room size.

### D35 — 2026-09-25 — Integrity carries over; a fatal fall drains it, respawn refills it
Integrity (max 8) is game state, not room state: it carries over between
rooms. Falling into a hole sets it to 0; recompiling at the room entrance
restores it to full.
**Why:** holes are instant deaths, and the bar emptying shows it. Refilling
on respawn keeps death quick and non-punishing (CLAUDE.md §4); with rooms
resetting on respawn, a half-empty bar would only make the retry harder.
Damage and invulnerability arrive with hazards and enemies in Phase 2.

### D36 — 2026-09-25 — Slower steering in the air: a jump can't cross 2 tiles
In the air the wizard moves at 65% of his walking speed (`airSpeed`), so a
full jump reaches ~1.65 units: enough for a 1-tile gap or hole, not for a
2-tile one at the same level.
**Why:** at full speed a jump covered ~2.55 units and cleared 2-tile holes,
which broke the rule that gaps are a puzzle limit (like D3 for height).

### D37 — 2026-09-26 — Debug mode: a Game.hurt() method, no fake hazards
The test-damage key calls a new `Game.hurt(amount)` that respects
invincibility; it doesn't spawn a fake hazard or enemy. Room jump
(`Game.debugJumpRoom()`) reuses `enterRoom()`, so a jumped-to room resets
exactly like a normal entry.
**Why:** Phase 2's hazards and enemies will call the same `hurt()`, so the
debug key exercises the real damage path instead of a separate one that
could drift from it.

### D38 — 2026-09-26 — G toggles screen-relative movement, arrives ahead of the settings menu
A second key → direction table (`SCREEN_DIRECTIONS` in
`src/entities/player.js`) moves the wizard the way the key points on screen
instead of along one grid axis. `G` toggles `Game.movementMode` between
`'grid'` (default) and `'screen'`; it is not saved and always starts in grid
mode. A terminal message and a small permanent HUD tag (bottom right) show
the active mode, since it changes how every key behaves.
**Why:** D23 already flagged screen-relative movement as a possible option
"with the settings menu"; the author wants it sooner, as a plain toggle, for
players who find grid-aligned controls harder to read. Not saving it keeps
the access-key format (CLAUDE.md §8) untouched; it can move into a real
settings menu in Phase 4 without changing the underlying direction tables.

### D39 — 2026-09-26 — Each room defines its own death-respawn point
Supersedes the part of D23/exits design that made the exit arrival point
double as the respawn point. Room data gets an optional `reset` field (a
point, same shape as `spawn`); it defaults to `spawn` when omitted. Dying
always respawns the wizard at the room's `reset` point, no matter which
door he entered through. `reset` doesn't need to touch the floor: gravity
takes over normally, same as any other position.
**Why:** author's request: a fixed, designed respawn spot is easier to
reason about than "wherever the last door happened to drop him", especially
once a room has several exits. It also keeps a respawn from ever landing on
an awkward spot right at a raised or narrow doorway.

### D40 — 2026-09-26 — Static block types live in the grid; changing blocks are room objects
Grid cells hold a type code (`CELL` in `src/world/grid.js`; only `empty` and
`solid` so far). The Phase 2 block types that never move or change shape
(hazard, void) become new cell types with their own look. Blocks that move
or disappear (moving platforms, collapsing blocks) are room objects, like
pushables: built by kind (`entities/kinds.js`), colliding as bodies, drawn
by their own view.
**Why:** static blocks are drawn as one instanced mesh with merged edges
(D12); making a single cell vanish or move would mean rebuilding them, and
the typed-array grid can't carry per-cell motion. Room objects already
move, collide, carry an interpolated position and reset with the room, so
moving and collapsing blocks get all of that for free. Hazard and void
blocks only differ in what touching them does, which the grid answers with
one lookup.

### D41 — 2026-09-26 — One Player for the whole game; the tick returns typed events
The `Player` is made once and placed by `Game.enterRoom()` instead of being
rebuilt with every room; it owns integrity (and later mana, invulnerability
and spells), and `Game.hurt()` passes damage on to it. `Game.update()`
returns `GameEvent` objects (`{ type, ...details }`) instead of strings.
**Why:** Phase 2 adds invulnerability after hits, blinking, health drain and
mana, all per-wizard state that must survive room changes; on `Game` it
would split the wizard's state across two objects. Damage, pickups and
later sound and effects need details (amount, which object, where), which
plain strings can't carry; changing the event shape now touches three
consumers instead of every Phase 2 system.

### D42 — 2026-09-26 — Version: phase in MINOR, merged PRs in PATCH, computed from git
The game version is MAJOR.MINOR.PATCH. MAJOR stays 0 until the author
declares the first full release (1.0.0). MINOR is the phase, raised when a
phase is closed with a `chore/release-0.X.0` PR, a `v0.X.0` tag and a
GitHub Release. PATCH counts the pull requests merged into `main` since
that tag: `tools/game-version.js` counts the first-parent commits after
`vMAJOR.MINOR.0` when Vite starts, and the build shows it (HUD brand). The
deploy workflow checks out full history for it; without the tag or git the
version is `package.json`'s MAJOR.MINOR.0.
**Why:** the version never moved (0.0.1 through all of Phase 1) because no
step owned it. The author wants every merge to show up as a new patch
number. Bumping `package.json` in each PR would make every open PR
conflict on the same line (stacked PRs always would); counting merges
from git needs no manual step and cannot be forgotten.

### D43 — 2026-09-26 — Phase 2 scope, order and rules
Phase 2 runs in the steps of the plan in docs/design.md: damage first
(everything that hurts depends on it), then hazard/void, moving and
collapsing blocks, bugs, Zap and mana, X-ray outline, and the room editor
last (it needs every block and enemy type to exist). Rules:
- Damage: every source goes through `Game.hurt()`; ~1 s invulnerability
  with blinking after a hit, no knockback. Integrity 0 kills (derezz, then
  respawn at the room's reset point).
- Hazard blocks hurt on any contact, from the side or standing on them.
  Void blocks kill only when landed on from above.
- Moving platforms carry the wizard and pushables. One that would push the
  wizard into something solid pushes him aside, or hurts him if there is
  no room; it never kills outright.
- Collapsing blocks are triggered only by the wizard standing on them;
  regrowing after N seconds is optional per block.
- Moving platforms and patrolling enemies share one path format.
- Bugs don't block movement; touching one hurts; one Zap kills one.
- Zap fires the way the wizard faces and is available from the start
  until data disks exist (Phase 3).
- X-ray outline covers the wizard only for now.
- The editor saves straight to `data/rooms/` in the dev server (after
  validation); the deployed build can only export JSON.
- Biome environmental effects (drain, Low-Res, Zero-G) and the health
  pickups and safe rooms balancing them move to Phase 4 content
  production.
**Why:** author's review of the Phase 2 plan after v0.1.0. Environmental
effects are specific content, not basics, and without pickups a drain
room only counts down to death. Several Phase 2 mechanics were only named
in CLAUDE.md; fixing their rules up front keeps each step's PR focused.
Death at 0 integrity was implied by damage but not planned. The shared
path format avoids two movement systems.

### D44 — 2026-09-26 — Hazard and void contact rules and animated looks
Hazard contact means the wizard's box overlaps the block on two axes and
lies against or in it on the third (within 0.02 units): standing on it or
leaning on a side counts, grazing a corner diagonally doesn't. The hit goes
through `Game.hurt()`, so it repeats each time the invulnerability ends.
Void kills when he is grounded with his feet center over a void cell,
the same rule as holes; he derezzes on the spot (cause `void`). The two
types are fixed keys in a `blocks` section of defs.json (color plus the
hazard's `damage`), not open-ended types like objects, because their
behavior is built into the engine. Their looks are animated shaders
(`render/block-fx.js`): hazard pixels switching on and off, void grains
sinking inside the block, stronger through the top. Edges stay steady and
all motion is slow. Where a special block meets a plain one, the special
block's edge is drawn on top. A hazard block that hurts the wizard
flares. Spawn and reset points can't be above either, and a raised exit
can't stand on void.
**Why:** the two-axis rule makes walls hurt on contact without punishing a
near miss at a corner. Reusing the hole rule for void keeps "edge under one
foot is safe" consistent across all falls to death. Author's review of
the looks: damaging blocks should read as active, not as colored crates.
Steady edges keep the hitbox exact, and slow motion keeps the room calm.
The void's grains lie inside the block so it reads as a hole, not a
surface. Drawing special edges on top keeps the dangerous block
readable.

### D45 — 2026-09-26 — Test rooms stay until content production
The small rooms that each show one mechanic (Boot Sector, Cache Hall,
Stack Yard, Fault Line, ...) stay in the world and keep growing with each
step. The real rooms and puzzles of Phase 4 content production replace
them, not earlier.
**Why:** author's call. Until real rooms exist they are the only place to
try a mechanic in isolation, and future spells and behaviors (Zap, Warp,
Cut & Paste, enemy AI) will need them for testing too.

### D46 — 2026-09-26 — Moving platforms: path format, riding, waiting and squeezing
Paths are given on the room object: the path starts at the object's `at`
and runs through `points` (cells), each leg along one axis; `pingpong`
(default) or `loop`, `speed` in units per second, `pause` at the ends
(both ends of ping-pong, the start of a loop). The same format serves
patrolling enemies later (`world/path.js`). A platform is a 1×1×1 room
object; it carries the wizard, resting crates and stacks on them. It
never pushes crates or other platforms: something in its way, or a
carried crate that would hit something, makes it wait. The wizard is
shoved clear by at most 0.35 units per tick (along the motion or aside);
with no room it hurts him through `Game.hurt()` and waits. Paths must not
cross static blocks or the first row inside an exit; crates on the path
and holes under it are allowed.
The path is drawn as one guide line through its middle (author's review:
rails and guide posts were too busy).
**Why:** axis-aligned legs keep the guide line, swept-cell validation and grid
alignment simple, and match how blocks and pushing work. Starting at `at`
avoids repeating the first point. Waiting instead of pushing crates keeps
crates on the grid and never forces one into a wall; it also gives a
puzzle (jam a lift with a crate). A shove limit stops the wizard from
jumping a whole block in one tick; hurting and waiting when he is pinned
follows D43 (never instant death) and always leaves him a way out.

### D47 — 2026-09-26 — Collapsing blocks: trigger, timing, regrow and bodies
A collapsing block is a 1×1×1 room object (kind `collapsing`, D40). Only
the wizard triggers it, by standing on it: alive, grounded, feet on its
top, any footprint overlap (like a platform's riders). It then shakes for
0.5 s (30 ticks) and vanishes, even if he steps off meanwhile. With
`regrow` (seconds, on the room object) it comes back that long after
vanishing, but only once no body overlaps its cell; without it, it stays
gone until the room resets. A vanished block is left out of the bodies
everything collides with (`Game.solids`, `Game.bodies`, refreshed on
`collapse` and `regrow`), rather than every collision check skipping it.
It may stand in a hole tile (a bridge that gives way), and spawn and reset
points don't count it as ground over a hole. Look: magenta, thin dashed edges,
tinted faces; it rattles, breaks into falling pixels, and grows back from
its center.
**Why:** 0.5 s lets the wizard run across a row (a block takes ~0.22 s at
walking speed) or hop up a step, but not stand still. Going on after he
steps off keeps the rule simple and readable (touch it and it is doomed).
Waiting for a clear cell stops a regrowing block from trapping the wizard
or a crate inside it. One refreshed list keeps the collision code free of
special cases. Bridges over pits are the classic use; a spawn on one would
drop the wizard to his death on every respawn. Dashed edges read as
fragile (thinner than other objects', author's review); magenta is the one palette color objects did not use yet.

### D48 — 2026-09-26 — Enemies: data-driven types, cell-by-cell physics, hostility and bounce
Enemy types in `defs.json` `enemies` hold every trait: `movement`
(behavior module: `patrol`, `stationary`), `attack` (`contact`, `none`),
`hostility` (`hostile`, `peaceful`, `provoked`: hostile once attacked),
`aggroRange`, `integrity`, `damage`, `speed`, `bounce` and `color`; room
entries (`id`, `type`, `at` = spawn cell, `path`, `overrides`) can change
any of them for one enemy. Enemies are not room objects: they move one
grid cell at a time (starting a step only from a whole cell), fall when
unsupported, ride platforms, turn back when anything blocks the next cell
(including a step up), walk off ledges, and pop in holes and on void
blocks (gone until the room resets). The wizard walks through them;
crates rest on them and can't be pushed into them. Touching a hostile
contact enemy hurts; landing on a bouncy one launches the wizard 2.2 above
its top (2 blocks), harmlessly, which amends the locked "active enemies
cannot be stood on" rule. The bug is a mint-green hologram ball; eye color
shows hostility (red, amber, cyan), a pad ring marks a bouncy one.
Patrol paths are level (legs along x or z at one height); only x and z
count at runtime.
**Why:** author's review. Grid-aligned movement (author's suggestion)
removes the sub-cell edge cases of free movement against crates,
platforms and ledges, and lets enemies reuse the crate rules for falling
and riding; physics makes rooms more systemic (a floor giving way, a crate
used as a fence). Putting every trait in data lets one room tune an
enemy (a peaceful bug, a bouncy one) without new types, and the fields
chase and shoot behaviors will need (aggro range, attack) are in place
before Viruses and Pop-ups. Red eyes warn of hostility at a glance, as the
author asked; a mood color keeps peaceful and provoked readable. A bounce
higher than a jump turns bouncy enemies into a way up (the reachability
checker must learn it); keeping it harmless and limited to the top keeps
hostile bouncy enemies dangerous from the sides.
