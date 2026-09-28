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

### D49 — 2026-09-26 — Test rooms hang off Boot Sector, not in one row
Boot Sector (the start) is a hub for the test rooms: new west and south
exits lead to Crawl Space and Transit Bus, so every test room is at most
two rooms from the start (Cache Hall and Stack Yard directly, Fault Line
behind Stack Yard, Volatile Memory behind Transit Bus). The old chain
stays, so the rooms also form loops. New test rooms connect near the hub,
adding exits to existing rooms where needed.
**Why:** author's request: with every room in one row, testing the newest
mechanic meant walking through all the others first.

### D50 — 2026-09-26 — Every bug bounces; a drop shadow only under the wizard
Supersedes the pad ring of D48. `bounce` is true on the `bug` type, so
every bug is a trampoline unless a room overrides it; the ring that marked
bouncy bugs is gone. Drop shadows are drawn only under the wizard for now:
bugs have none, and falling objects' shadow (CLAUDE.md §4) is switched off
behind `DROP_SHADOWS.fallingObjects` in `render/entity-view.js`, so it can
come back in one line.
**Why:** author's review: the ball shape already says "bouncy", so a mark
is not needed and every bug should bounce. The author wants to try a
single shadow under the wizard to see whether it reads more clearly.

### D51 — 2026-09-26 — Solid enemies block, carry and shove the wizard
A `solid` enemy type field (default false, overridable per enemy). A
solid enemy is one of the bodies the wizard collides with: he can't walk
through it, can stand on it (unless it bounces) and is carried as it
walks, and it shoves him when it walks into him (at most 0.35 per tick,
as platforms do, with the same `shoveClear()`); if he is pinned it turns
back instead of hurting him. A crate on top holds it in place. Touching a
hostile solid enemy uses the hazard rule (leaning or standing on it
counts). Body color stays the `color` field, overridable per enemy; the
eyes keep showing hostility.
**Why:** author's request: enemies the wizard must avoid or ride, set by
data rather than new code. Carrying like a platform was preferred over a
simpler "it waits while he stands on it". Turning back when he is pinned
keeps "never killed outright by being squeezed" from D46, and contact
damage already covers hostile ones. With `stationary` movement, a turret
needs only a projectile attack (Pop-ups), no new movement code.

### D52 — 2026-09-26 — Zap and energy: numbers, aim, what stops a bolt; bugs take two hits
Energy: 10, recharging 1 per second, full after a respawn, carried
between rooms. Zap costs 2 (5 in a row), 0.25 s cooldown, bolt speed 12,
damage 1; the numbers are in `defs.json` `spells.zap` (required) and
`PLAYER`. The bolt flies level from his hands the way he aims (the
direction he last walked or turned to, diagonals included) and stops at
the first live enemy, block, room object or the room's side. It hits
every enemy, peaceful ones too, and provokes it. A bug's integrity is 2,
so it takes two Zaps; a hit flashes it and it glitches while damaged, so
the first hit reads as damage and not a miss. A failed cast flashes the
energy bar instead of printing a terminal line. The looks were reviewed
in the asset showcase before they went into the game.
**Why:** the step plan said one hit kills a bug; the author asked for two.
A bar of one segment per cast shows how many Zaps are left at a glance.
Aiming the way he last walked keeps the controls to one cast key.
Stopping at crates keeps them useful as cover, and a bolt at hand height
passing over enemies below a ledge follows from flying level.

### D53 — 2026-09-26 — Destructible crates: integrity on pushables, drawn as data bits
A pushable object type may have `integrity` (1–15, overridable per
object); spells take it like an enemy's, and at 0 the crate breaks into
pixels and is gone until the room resets. Only pushables can have it (the
data check rejects it on other kinds). `crate_cross` has integrity 1 and
no longer draws its cross. The plain `crate` gets a new `bits` mark: a
4×4 grid of small pale squares (its color mixed a third towards white) on
every face, and the same tinted faces as `crate_cross`; every destructible
object is drawn with that grid with 6 of 16 bits missing, in place of
whatever its `mark` says. Boxes stay static: no pulse or blinking, only a
jolt on a hit that doesn't break it.
**Why:** author's request, with a visual hint that it can be destroyed.
Tried and turned down on the way: jagged glowing crack lines (the author
wanted a small square pattern that keeps the "data block" look), then
pulsing and blinking bits (the author wants boxes static). Whole grid
against grid with holes was the author's idea; 6 missing bits rather than
3 was a counterproposal, as a few gaps are easy to miss at game distance.
Drawing the holes from `integrity` (rather than as a `mark` a type picks)
means a breakable crate can never look solid, nor a solid one breakable. `crate_cross`
keeps its id (stable IDs; room data uses it). The look was reviewed in
the asset showcase before it went into the game.

### D54 — 2026-09-26 — Cast on E or Numpad 0; Tab switches spells; the selected spell under energy
The cast action is bound to E and Numpad 0, replacing J; `spellNext`
moves from E to Tab (`spellPrev` stays on Q). The selected spell's name
shows in a tag under the energy bar, with the Tab hint once he knows more
than one spell. Casting goes through the selected spell (`Player.spell`,
`SPELL_EFFECTS`), so new spells plug in without new keys.
**Why:** author's request. Ctrl was tried first and dropped: Ctrl+W closes
the browser tab and a page can't block it, so casting (Ctrl) while moving
up (W) could close the game. No game key is a modifier, so Ctrl, Alt and
Meta combinations all stay browser shortcuts. Numpad 0 fits players who
move with the arrow keys.

### D55 — 2026-09-26 — X-ray outline: a ghost of the hidden parts, in his own colors
Only the parts of the wizard that something nearer hides are drawn as a
ghost (reversed depth test), not the whole wizard on top of everything:
half behind a wall, he is half ghost, which also shows how far behind he
is. The ghost keeps his colors (magenta body and hat, cyan head and hands):
a rim with a nearly empty inside and faint bands. It is drawn before the
wizard, so his own parts don't count as cover. Hidden while he is dead.
**Why:** author's choice in the asset showcase between his own colors and
an all-cyan ghost. Drawing only the hidden parts avoids a second outline
doubling up on the visible wizard; keeping the inside dim leaves the
blocks in front readable.

### D56 — 2026-09-26 — Room editor: F2 in the game, save through the dev server, hand-written style kept
The room editor is part of the game, not a separate page: F2 freezes the
game and edits the current room in place, rebuilt in the real look after
every change; F2 again plays the edited room from its start point, unsaved
edits included, once it has no validation errors. Edits are kept per room
until the page closes (a warning comes up before closing with unsaved
ones). Editing works on one height layer at a time (a grid on that layer,
mouse wheel or PgUp/PgDn); left click places, right click erases, a drag
paints and is one undo step. Step 8 is split in two PRs: 8a (blocks with
type, holes, objects but platforms, spawn and reset, room name, biome and
size, save and export) and 8b (enemies, platform and patrol paths, exits
with their world.json connections, new rooms).
Saving posts the room to the dev server (`tools/room-save.js` through the
data plugin), which checks it with the rest of `data/` (schemas and the
game's checks) and writes `data/rooms/<id>.json` only if everything passes;
only existing rooms for now. The file change right after a save doesn't
reload the page. The deployed build downloads the file instead.
Saved rooms look hand-written: box entries of `blocks` and `holes` nobody
touched stay as they are, in order; edited cells are merged into as few
boxes as a greedy pass finds (along x, then z, then y); the JSON is written
in the data files' style (two-space indent, what fits in 120 columns on one
line, lists of records one per line), which every data file already follows.
The editor reads the mouse and its own keys (digits, PgUp/PgDn, Ctrl+Z/Y/S)
directly instead of through action mapping, and its text is written in
its code rather than `strings.json`, like the debug readout: it is a tool,
not the game. Only F2 is an action.
**Why:** author's choices before step 8 (in-game toggle for instant edit
and test turns; a split into a static and a moving part; small diffs of
hand-written rooms). Layer-by-layer picking is simple and exact on an
isometric view, where clicking into depth is ambiguous. Checking on the
server as well as in the page keeps invalid rooms off the disk even if the
page's copy of the data is stale.

### D57 — 2026-09-26 — Room editor, moving part: pick, then edit; world.json saved with the rooms
Step 8b adds enemies, platform and patrol paths, exits and new rooms to the
editor (D56). Things that have more to them than a cell are picked, then
edited: a left click on an enemy (Enemy tool), a platform or enemy (Path
tool) or an exit (Exit tool) picks it, and the tool's panel fields show and
change it; a white dashed box marks it, Esc drops it. The fields also hold
the settings for new ones (a picked enemy's settings carry over to the next
placed). Paths grow by clicking cells: the editor adds corners so each leg
runs along one axis (x, then z, then y), enemies' points stay at their own
height, a right click takes the last point off. Exits open by clicking an
edge cell of the current layer (in a corner, the wall nearer the mouse);
their connection is picked from the exits of other rooms that fit (the
opposite side, equally wide, not connected yet). New rooms get an id and
start empty (12x4x12); the panel's room list switches between rooms.
Connections live in `world.json`, which the editor edits too: an exit's
id change or removal takes its connection along, and a room's undo steps
and Revert take that room's connections back as well (connections of other
rooms stay). Save writes every edited room and `world.json` at once, after
the server checks them all together, since a connection is only valid with
both rooms; a build exports each changed file. The editor still refuses to
save or play while any file has errors, an unconnected exit included.
**Why:** a click on the cell of a mover is how you find it on the screen;
building paths leg by leg with automatic corners can't make an invalid
diagonal leg. Checking and saving the rooms and `world.json` together is
the only way a new exit and its connection pass validation (every exit must
be connected), and keeps half a connection off the disk.

### D58 — 2026-09-26 — Enemy templates are enemy types that extend a base type
An enemy setup worth reusing (a tougher amber bug, a peaceful solid
mount) is saved from the room editor as a template: a new enemy type in
`defs.json` with `"extends"` naming its base type and only the values it
changes, e.g. `"bug_tank": { "extends": "bug", "integrity": 4 }`. Rooms
place it like any type (`"type": "bug_tank"`). At load time a template is
filled in from its base (`resolveEnemyTypes()`), and it uses its base's
look (`enemyModels()`, `ENEMY_MODELS`). Templates are one level deep: a
base has no `extends`; saving a template of a template extends the same
base. In the editor, Save as template turns the Enemy panel's settings
into a template and makes the picked enemy one of it; Update template
moves an enemy's own settings into its template, which changes every
enemy of it. The Enemy panel also sets integrity, damage, speed and color
now. `defs.json` is saved with the rooms and `world.json`. Template
changes are not part of a room's undo steps.
**Why:** author's choice: linked templates kept in the repo, so changing
one changes every enemy placed from it, on every computer. Making them
enemy types keeps rooms short and needs no new room format; `extends`
instead of a full copy means a change to the base type reaches its
templates too.

### D59 — 2026-09-27 — Room editor: template changes are undo steps; the view cuts at the layer
Changes to enemy templates (save, update, rename, delete) are now undo
steps of the room they were made in, together with what they do to that
room's enemies (this replaces D58's "not part of a room's undo steps").
Undo and redo apply only the template entries that step changed, so a
template made meanwhile from another room stays. Rename is allowed only
for a template no other room uses, and delete for one no enemy uses, so
no room is left with enemies of a type that is gone. The editor draws the
room without the blocks, objects and enemies above the layer being edited
(**hide above**, on by default; `RoomScene.show({ cutAbove })`); the game
itself keeps the whole room.
**Why:** from the second editor review (author's picks). Undoing a
template by hand was error-prone; restoring all of `defs.json` on undo
would throw away other rooms' templates. On an isometric view, blocks in
front of higher layers hid the cells being edited; leaving them out of
the drawing (edges worked out anew, so the cut reads as block tops) is
cleaner than clipping planes, which would leave open, edge-cut blocks.

### D60 — 2026-09-27 — Block types become open, data-driven types
Plain, hazard and void stop being a fixed set. `defs.json` `blocks`
becomes an open map of block types, like enemy types (D48): each type is
a set of properties the engine understands, plus a look and a color, and
may `extend` another type (like enemy templates, D58), e.g.
`"block": { "look": "plain" }`,
`"hazard": { "look": "hazard", "color": "#ff3b30", "damage": 1 }`,
`"void": { "look": "void", "color": "#8a5cff", "lethal": true }`,
`"hazard_hot": { "extends": "hazard", "damage": 2 }`.
The engine asks about properties, never about type names: a grid cell
holds a type index (still one byte, `0` empty) that points to its
type's properties, and contact checks look for "a cell with `damage`" or
"a cell that is `lethal`" (`game.js`, `player.js`, `enemy.js`,
validation). A new property (for example `bounce`, `slippery`,
`conveyor`, `recharge`) is written once and then works for any type
that has it; a new look (a shader in `render/block-fx.js`) is also code.
A new type that only combines existing properties and looks is data
only. Room files keep `{ "type", "at", "to" }` with `block` as the
default; `type` becomes any block type in `defs.json`, checked by the
validator. The editor gets one Block tool with a type list filled from
`defs.json` (like the Object tool), replacing the separate Hazard and
Void tools. Holes stay separate (they are missing floor, not a block).
Blocks that vanish and grow back (collapsing, D47) are written and
painted as block types but run as room objects: a block type with a
`kind` (`"collapsing": { "kind": "collapsing", "color": "#ff2bd6" }`)
makes the room loader build one room object of that kind per cell, so
the engine side (D40, D47) stays as it is. Its tuning moves to the type,
with `extends` for variants
(`"collapsing_regrow": { "extends": "collapsing", "regrow": 3 }`), and a
row of them is one box (`"at"`, `"to"`) instead of one object each; the
per-object `id` and `regrow` go away. Blocks that move or are pushed
(platforms with their paths, pushables) stay room objects as they are.
This replaces D44's "fixed keys in `blocks`"; D44's contact rules and
looks stay. Only the decision for now: the refactor is a later PR with
no new block type, keeping today's behavior (Volatile Memory's collapsing
objects become block boxes).
**Why:** author's question: blocks, hazards and voids are one thing,
and more block types will come. With a closed set, every new type means
touching the schema, grid, game, rendering and editor; with properties,
the engine grows by behaviors, and content grows in data, as the project's
data-driven rule (CLAUDE.md §7) asks. Collapsing blocks: author's choice to write
them like blocks (a bridge is one line, not four objects) while keeping
them objects inside, since a grid cell with its own timer would mean
rebuilding the merged block mesh (D12) on every collapse.

### D61 — 2026-09-27 — Six biomes: a core, four side sectors, one special
The world has six biomes: Home Lattice (core, amber), Glitchmire (hot
pink), Frostbyte Wastes (pale ice), Abyssal Buffer (cobalt), Firewall
Citadel (ember orange) and Phantom Partition (silver-white, the special
sector for secrets and rooms reached by backtracking). All six are in
`data/biomes.json` with name and color; each look also plans a floor
pattern, particles and one signature effect (docs/design.md, Biomes),
added later. Glitch Zone becomes Glitchmire (id `glitchmire`, pink instead
of magenta); Low-Res Zone and Zero-G Sector stop being biomes of their own,
and their effects become Phase 4 candidates for Frostbyte Wastes and
Abyssal Buffer. This decision covers looks only; gameplay effects are
decided with Phase 4.
**Why:** author's request: one core, four side biomes and one special,
visual only for now, with fantasy cyberspace names. Room colors avoid the
gameplay colors (lime, cyan, magenta, red, violet, green) so crates,
platforms, collapsing, hazard and void blocks, and bugs never blend into
the room; that moved the glitch sector off magenta, the color of
collapsing blocks.

### D62 — 2026-09-27 — Biomes set the room's surroundings too
A biome in `biomes.json` may have a `look`: `background` (the void
color), `outerGrid` and `outerFade` (color and fade distance of the floor
grid outside the room), `wallGrid` (brightness of the wall grid) and
`bloom` (glow strength). Every field is optional; the defaults are Home
Lattice's look (`LOOK_DEFAULTS` in `render/neon.js`), so a biome without
`look` looks as rooms did before. The floor shader, wall grid, scene
background and bloom read them when a room is shown. Backgrounds stay near
black and outer grids dim, so the room's own color still carries the
biome and the outside never reads as room. Frostbyte Wastes moves from
pale ice to ice blue (`#9fd0ff`): next to Phantom Partition's
silver-white the two read the same.
**Why:** author's pick of the cheapest biome effects ("tier 1"): each is
a value already in the renderer, so six biomes look clearly apart
without new shaders or draw calls. Floor patterns, particles, backdrop
shapes and edge effects are the planned next tiers (docs/design.md,
Biomes).

### D63 — 2026-09-27 — Abyssal Buffer turns graphite gray
Abyssal Buffer's room color is graphite `#7a8190` instead of cobalt, on
a dark gray background (`#0b0c0f`) with a dim gray outer grid; its
planned particles become slowly drifting glitter. Phantom Partition keeps
stars, but still and twinkling, so the two differ in style. A darker gray
(`#5a606d`) was tried: blocks and walls faded and the cyan exits took
over the room.
**Why:** author's choice: a dark, quiet gray sector that later pairs with
glitter effects.
**Built (2026-09-27):** as planned. Details settled while building it:
`extends` is one level (a variant of a variant is refused, like enemy
templates); `block` must be in `defs.json` and static; a kind's objects
get the id `<type>@x,y,z` and every object style value of the type; the
grid's code 1 is the room's edge (outside the sides, below the floor);
Volatile Memory uses `collapsing_regrow` (3 s) for the bridge that grows
back. The editor's tools are renumbered 1–8 (Block, Hole, Object, Enemy,
Path, Exit, Spawn, Reset); the regrow field of the Object tool is gone,
since a regrow time now belongs to a block type.

### D64 — 2026-09-27 — Edges between block types
Neighbouring blocks of the same type never get an edge between them (the
corner rule, D12), and neither do neighbouring blocks of different plain
types: all plain blocks are one mass for the corner rule, and each edge
takes the color of a type around it, the later one in `defs.json` where
types meet. The hazard and void looks outline themselves, and a line
they share with plain blocks is drawn once, by the dangerous look alone
(lethal types over hurting ones), so a seam always shows where a
dangerous block starts. Drawing it on top was not enough: the void frame
is thinner and dimmer than plain edges, so the amber line showed around
the violet one and the glow mixed them (author's playtest).
Collapsing blocks keep an outline around every cell.
**Why:** author's choice. Plain types only differ in color, so a seam
between them would cut shapes apart for nothing; blocks that hurt or kill
must read at their exact boundary; each collapsing block gives way on its
own, so its cell outline is information, not noise.


### D65 — 2026-09-27 — Phase 3 splits in two; spells get a discussion step
The old Phase 3 (game structure) becomes two phases, and polish moves to
Phase 5 (v0.5+):
- **Phase 3 (v0.3), spells and pickups:** a world map tool for the
  developer, pickups and progress, data disks, Viruses, Pop-ups, the Firewall, Pause, Warp and Cut & Paste
  spells, a spell roster discussion, score with bonus bits and secrets,
  fragments and the core.
- **Phase 4 (v0.4), guardians, saves, tooling:** Firewall Wardens, title
  screen and pause menu, access keys and saves, the map, the reachability
  checker, design skills and subagents.

Two steps are discussions first: `docs/spell-roster` (further spells or
upgrades of the five, docs only) and the start of `feat/score-and-bits`
(target number of rooms, spells and items, bits per room, score values).
Every other step settles its open questions with the author before its
code lands. Step plan in docs/design.md.
**Why:** author's review of the Phase 3 proposal. As defined, Phase 3 was
about 17 PRs, twice Phase 2. Wardens guard key rooms, so they belong with
the world structure of Phase 4. The five spells were named before any of
them could be played; once they can, it is worth asking what else (or
what upgrade) the game needs. Score and bits depend on how big the world
is and how many spells and items it has, and those numbers also fix the
access-key bit layout, so they are decided in the step, not up front.
The world map tool comes first: every step adds a test room, and the
room editor shows one room at a time, so nothing gives an overview of the
growing world or catches rooms cut off from the start.

### D66 — 2026-09-27 — World map tool: its own page, room positions in world.json
The developer world map tool (Phase 3 step 1) is a separate page,
`tools/world-map.html`, not a view inside the room editor, and only the
dev server serves it (it is not deployed). Room positions on the map are
stored in `data/world.json`, not computed from the connections:
- The map is a simple grid of virtual nodes, one room per cell; a room's
  size and its exits' tiles don't have to match its neighbours'.
- Rooms are dragged to another free cell and saved through the dev
  server. The tool shows connections; the room editor edits them (editing
  them on the map can come later).
- A new room from the room editor gets the nearest free cell next to the
  room it was created from, and is moved afterwards.
**Why:** author's choice. A page of its own keeps the room editor
focused on one room and can show the whole world without the game
running. It is a development tool, never visible to players: finding
what is where is part of the game (D67).
Nodes on a grid are enough to see the structure; matching tiles would
make every room size a layout constraint. Stored positions give one layout that the tool and the player's
map screen (Phase 4) share; an automatic layout can't place the test
world, whose shortcuts (D49) don't fit a flat grid, and would shift
whenever a connection changes.

### D67 — 2026-09-27 — Exploration is part of the game; a maze with backtracking
Finding what is where is part of the game, as in the 1980s isometric
games that inspired it: nothing made for development (the world map tool,
debug room jumps) reaches the player. The world is a maze, not a linear
progression, and the wizard grows stronger: later spells and upgrades let
him speedrun simple rooms, solve them differently, and reach what he
couldn't before. So:
- A room need not be fully solvable on first arrival: some exits and
  pickups may wait for a spell or buff found later, and the player comes
  back (backtracking). He can always leave the way he came.
- With later spells, shortcuts and other solutions are intended, not bugs
  to design out.
- The spell roster step (Phase 3 step 11) looks for spells and upgrades
  that open shortcuts and new areas, not only for new puzzle types.
- The reachability checker (Phase 4) works out which abilities each exit
  and pickup of a room needs, and checks that the whole world can be
  finished in some order.
- Every permanent pickup (fragments, data disks, buff items, secrets) is
  one bit in the save, found or not; there are only a limited number of
  them. A found one stays in its room as a grayed-out ghost when the room
  is revisited, so the player sees he has been there. Temporary pickups
  (e.g. refills) are not saved and come back with the room; death resets
  the wizard, so a trip to one can be worth making.
**Why:** author's direction for the game. Exploring the Grid and mastering
it are the reward: discovering the layout matters, a gate seen early is a
reason to come back, and a room that took a puzzle the first time can
become a quick run later. Grayed-out pickups keep a maze readable
without a saved map; one bit each is cheap because permanent pickups are
few.

### D68 — 2026-09-27 — World targets: towards 128 rooms, 16 spells, buff items, access levels
The author's targets for the finished game, replacing the 40–60 rooms of
CLAUDE.md:
- **Rooms:** towards 128, more small rooms rather than a few very
  complex ones.
- **Access levels:** some areas are locked behind an access level,
  probably linked to fragments (settled in the fragments step).
- **Spells:** up to 16 in all: new spells, some letting the wizard skip
  easier rooms, and upgrades of the basic ones (the roster is the Phase 3
  spell-roster step).
- **Buff items:** pickups that make the wizard stronger: more integrity,
  more energy, a higher jump. The one-block jump stays the base; a jump
  buff raises it (how high is decided with its step).
- **Ability gates:** stronger spells and buffs let the wizard skip easier
  rooms and reach areas he couldn't before, so an area can be gated by
  an ability as well as by an access level, and the player backtracks
  to it once he has that ability (D67).
- **Saves hold the wizard, not rooms:** the access key stores what he
  has (fragments, spells, items, secrets, score, health) and where he
  is, but no per-room data: no bonus slots, no map.

The access-key layout follows (CLAUDE.md §8, finalized in Phase 4): room
8 bits (7 would allow exactly 128), one bit per permanent pickup (64
reserved; spells and buffs follow from the disks and items found, D67),
and no bonus-slot bits.
The score step no longer discusses world targets (D65); it keeps
bits per room, score values and secrets. A buff-items step joins Phase 3,
and access levels join the fragments step.
**Why:** author's direction. Many small rooms suit the flip-screen style
and make exploring (D67) the core of the game; more spells and buffs give
the player a growing toolset that opens shortcuts through rooms already
solved and new areas; access levels give a large world its structure.
Leaving room state out keeps the key short (512 bits of bonus slots
would have been most of it).

### D69 — 2026-09-27 — Switches unlock exits
A new Phase 3 step (`feat/switches`, step 4, after data disks): switches
that unlock a room's exits. Two kinds to start: a pressure plate held
down by a crate, and a target that a Zap bolt hits. An exit can be locked
until its switches are on; a locked exit looks closed and is solid.
Switch state resets with the room like everything else in it. The locked
exit is shared with access levels (fragments step). The step settles
first whether the wizard presses plates himself, whether switches latch,
how several switches and exits combine, and how a locked exit keeps the
way back open (D67).
**Why:** author's request. Crates and Zap exist already, so switches turn
them into puzzle keys with little new machinery, and a locked exit is
needed for access levels anyway.

### D70 — 2026-09-27 — World map tool: positions format, who saves what
The details of the world map tool (Phase 3 step 1, D66):
- `world.json` gets a required `positions` map, room id → `[x, z]` map
  cell (integers, negative allowed; +x east, +z south, the same axes as a
  room, so a room's east exit points right on the map). Validation: every
  room has one, no two share one, no unknown rooms. The data schema
  version stays 1 (nothing was published that reads the old file).
- The room editor owns the connections, the map tool the positions. The
  map sends only the moved rooms' positions, merged into `world.json` on
  disk; when the editor sends the whole file, the positions on disk win
  (only a new room's cell comes from the editor). Each tool's saves
  survive the other's, even from a page loaded earlier.
- A new room from the editor gets the nearest free cell to the room it
  was made from: east, south, west, north, then the diagonals, then
  further out. Discarding the new room frees the cell again.
- The map opens a room with `/?room=<id>&edit`; the game reads `?room`
  and `?edit` in the dev server only, so a deployed build can't be used to
  jump rooms (D67).
- The "far from the hub" check counts every room as a test room until
  content production (D45); it flags rooms more than two rooms from the
  start (D49).
- After any save the dev server sends a `neonmancer:data-saved` event;
  the map reloads to show another page's save unless it has unsaved moves.
**Why:** a room's east exit pointing east on the map makes the layout
readable at a glance. Splitting ownership avoids the one real conflict of
two pages editing one file: a stale copy undoing a newer save.

### D71 — 2026-09-27 — Pickups: save bits in blocks, the Zap disk, refills
Phase 3 step 2's open questions, settled with the author:
- Save bits come in blocks: spells 16, buffs 16, equipment 16, fragments
  64, so 112 pickup bits (was 64 in CLAUDE.md §8). A bit identifies an
  item, not a placement: the same item may lie in several rooms, and a
  room holds any number of permanent items (or none).
- The index lives on what the item unlocks: a spell's `slot` on the
  spell in `defs.json` (its disk's bit); later a buff's or a piece of
  equipment's slot on its pickup type, and a fragment's number (0–63) on
  the placement, fragments being one type. Slots are unique per block.
- Temporary pickups: an integrity refill and an energy refill, an amount
  each (per type), up to the maximum; left lying while that stat is full.
- Step 2 ships the Zap data disk (pulled forward from step 3): the wizard
  no longer knows Zap from the start; its disk lies in Boot Sector near
  the spawn. Step 3 keeps the install animation and spell switching.
- Disk look (after three showcase rounds): an abstract white slab with
  both top corners clipped (the same from either side, so its bits sit
  the same way from both), spinning and hovering; both faces show a 4×4
  bit grid with one lit cube in the spell's color: the spell's slot, row
  by row from the top left. Not a 3.5" floppy, not letter codes (spells
  can share a first letter), not a binary number, no moving bits, white
  rather than gold.
**Why:** author's choices. Blocks keep each kind of item countable and
leave room per kind; a bit per item (not per place) lets a disk wait in
two places, e.g. on both sides of a gate. Showing the slot as one bit
makes each disk the save bit it sets, and the 16 spells fill the 4×4 grid.

### D72 — 2026-09-27 — Energy in whole units, a bar in segments of 10
Replaces the energy numbers of D52 and the segment-per-cast bar. Energy is
whole units: the wizard holds 50 and gets one back every 12 ticks (5 per
second, still full in 10 s); Zap costs 10 (the same share as 2 of 10);
the energy refill gives 30. The HUD bar keeps its slanted segments, now
10 energy each whatever the spell, filling unit by unit; spell costs are
kept to multiples of 10, so full segments count the casts left. The
maximum and the recharge rate live on the wizard, so energy buffs
(permanent and temporary, author's note) can raise them; a larger
maximum adds segments. The bar is hidden until he knows a spell.
**Why:** author's request. A bar split by the selected spell's cost
changes shape when switching between spells of different costs; fixed
segments of 10 don't, and still read as casts. A bar of one thin tick
per unit with a notch at the cost was tried and dropped: the segments
read better.

### D73 — 2026-09-27 — Data disks: install animation, the Shield spell
Phase 3 step 3, settled with the author:
- Install animation (picked from three showcase variants: a download
  beam, a scan, an orbiting bit): **scan**. The disk shrinks where it
  hung, its bits spiral into the wizard, three rings in the spell's color
  sweep up his body, tinting him, and he flashes white. It lasts 1 s, and
  he is frozen and unhurt meanwhile (a reward moment; he still falls).
- The second spell, for trying spell switching now, is **Shield** (slot
  1): a crackling ring of lightning round him at hand height (picked over
  a cage of three rings), neon blue `#3b82ff`. 20 energy, 5 s (the
  author raised it from 3 s), recast starts it over. It blocks
  projectiles once there are any (steps 6–7); until then it only shows.
- **Firewall** stays a spell, but becomes a similar shield that also
  damages; its details are settled at step 7. Shield takes over
  "a brief shield that blocks projectiles" (CLAUDE.md §5).
- Each spell has a `color` in `defs.json` (its disk bit, install
  animation and banner), instead of a table in the renderer.
**Why:** author's choices. Shield keeps the name Firewall free for a
stronger, damaging version later, and a real second spell tests
switching and the install animation with a second color. Colors in data
keep spells data-driven like enemies.

### D74 — 2026-09-27 — Playtest: no freeze while installing, Shield 7 s
After playtesting step 3 (D73), the author's changes:
- The install animation no longer freezes the wizard: he walks, jumps,
  casts and switches during it, and can be hurt. The disk's bits spiral
  from where it hung into him wherever he goes.
- Shield lasts 7 s (was 5 s).
- A lit bit on a data disk glows brighter the darker its color is, so
  Shield's neon blue reads as well as Zap's cyan on the white disk, and
  the empty squares of the bit grid are dark gray (were dim white).
- A found disk's ghost spins like a live disk, without the bob (it stood
  still).
**Why:** author's playtest. The freeze interrupted the flow of play;
5 s felt short; the blue bit was hard to see.

### D75 — 2026-09-28 — Switches: targets, floor plates, locked exits
Phase 3 step 4's open questions (D69), settled with the author:
- Two switches, both fixed in place: a **target**, a block a Zap switches
  on and off (toggle), and a **plate**, a floor tile flush with the floor
  like a hole (y 0 only), on while a crate, an enemy or the wizard stands
  on it (no latch). New object types `target` and `plate` (kinds of the
  same names), placed in `objects`; `crate_plain` and `crate_dashed`,
  whose looks they start from, stay crates (stable ids).
- An exit gets `"locked": true`: it opens while **every** switch in its
  room is on, and closes again when one goes off, but never on the
  wizard (it waits while he stands in the opening). No per-exit switch
  lists: all switches of the room count. A room with a locked exit needs
  a switch.
- The way back (D67): the exit he came in through stays open for him
  while he is in the room, even after a respawn; the exit on the other
  side is not locked by this one.
- Look, after two showcase rounds: white (`#eef3ff`), picked over yellow
  (too close to Home Lattice's amber) and red → green. First round: the
  target `led` (a square on each face that fills), picked over `glow`
  and `bullseye`; the plate `brackets` (corner brackets and a floor glow
  when pressed), over `halo` and `slab`; the lock `panel` (a sinking dark
  panel with one light per switch; bars on front exits), over bars
  alone and a grid. The author then asked for a stronger hint than
  brightness: both switches carry a **square bull's-eye** (a small square
  inside a bigger one), whose inner square fills when on; the lock's
  lights are small bull's-eyes too.
- Terminal line `> ACCESS GRANTED: EXIT UNLOCKED` when locked exits open.
**Why:** author's choices. Plates on the floor keep "push a crate onto
it" the natural puzzle; every switch counting keeps room data simple and
readable (the lights show how many are left). Opening behind him keeps
every room leavable the way he came without the designer checking both
sides. A shape, not only a color, marks switches for color-blind players
and survives bloom (D17).

### D76 — 2026-09-28 — Automatic quality fallback; shaders compiled ahead
A rendering review (measured on a fast GPU, scaled to weak ones by memory
bandwidth) found that what a room shows costs little: rooms use 60–130
draw calls, a bug 4, the wizard 20, and game logic is a few µs per enemy.
The frame cost on weak GPUs is resolution × 4× MSAA in half-float
buffers: estimated 13–19 ms at 1080p on an Intel UHD 620, most of the
60 fps budget. So:
- **Auto quality** (`render/quality.js`): the game starts at 4× MSAA and
  full render scale; when two 2 s windows in a row average slower than
  50 fps, it steps down one level: MSAA 4 → 2 → 0, then render scale
  0.75 → 0.5. Never back up (no flicker). Two steps that don't make
  frames faster (a 30 or 50 Hz display, battery-saver frame caps, a slow
  CPU) go back and stop. `?msaa` or `?scale` set quality by hand and turn
  it off. Nothing is saved: each load judges again.
- **Shaders compiled ahead**: `Renderer.compile()` (on every room show)
  now includes hidden objects (pixel bursts, the cast flare), which
  otherwise compiled mid-play the first time they appeared, and compiles
  for the composer's buffer: compiled for the canvas they were the wrong
  variants (output color space), so room shaders really compiled on the
  first frame after the fade.
- **Data disk in 7 draw calls** instead of 36: its 30 zero-bit squares
  are one line (dashes restart per square, so a ghost looks the same).
**Why:** protect weak laptops before the Phase 5 quality presets exist;
the fallback is what those presets will start from. Effects added to the
existing effect pass are nearly free, while every extra full-screen pass
costs (~1.6 ms at 1080p on a UHD 620); keep that in mind for Phase 5.

### D77 — 2026-09-28 — World map tool adds and removes rooms and connections
The world map tool (D66, D70) now edits the world's structure, not only
where rooms sit. Four tools, picked in the panel or with keys 1–4:
- **Move** (as before): drag a room to a free cell; a click opens it in
  the room editor.
- **Add**: click a free cell for a new, empty room (the room editor's
  new room: 12×4×12, spawn in the middle, no exits), id and biome from
  the panel (a free `room_N` by default).
- **Connect**: drag from one room to another, or click both. Each room
  gets a 2-wide exit at floor level in the wall facing the other on the
  map (along the axis they are further apart on; x for diagonals), in
  the middle of the wall; if that spot overlaps another exit or the room's
  checks reject it (a block, a hole, a platform path in the opening), the
  nearest spot that passes, outwards from the middle. Ids as in the room
  editor (`south`, `south_2`...).
- **Delete**: click a room to remove it, with its map cell, its
  connections and the exits of other rooms that led into it; click a
  connection to remove it and both its exits. The start room stays.
Every exit must be connected (validation), so the map never leaves one
half-made: exits come and go in pairs with their connection. Everything
else about an exit (where along the wall, height, width, lock) stays in
the room editor. Edits are undoable (Ctrl+Z) and saved together: the
dev server gets the new and changed room files, the ids of removed ones
(deleted from `data/rooms/`), the moved rooms' cells and, when the
connections changed, `world.json`; it checks the result as a whole and
writes all of it or none. The logic is `editor/map-edit.js` (`MapEdit`),
with `addExit()` and `disconnectExit()` as hooks for later room edits
from the map.
With structure edits the map now sends `world.json` itself, so its
connections win over the file on disk; the positions still merge as in
D70. An unsaved-changes warning covers a room editor save made meanwhile.
**Why:** author's request: sketching the world's layout (which rooms,
which way they connect) is quicker on the map than one room at a time in
the room editor. Exits in the middle of the wall are a sensible start;
the rooms are then built in the room editor, where the exits can move.

### D78 — 2026-09-28 — Universal enemies; chase and discharge; Viruses and Sentinels
Phase 3 step 5's open questions, settled with the author:
- **Universal enemies:** an enemy type's body is a field, `look` (`bug`,
  `virus`, `sentinel`; the word block types use too, D60), beside
  `movement`, `attack` and `color`. Any look combines with any movement
  and attack, all set in data and overridable per enemy in a room (a bug
  can chase and burst). Templates (D58) still take their base's look, now
  through the inherited `look`.
- **One attack field:** `attack` is `touch` (touching it hurts; was
  `contact`, D48), `burst`, `arc` or `none`. Burst and arc, the
  discharges, share `attackRange`, `attackCharge`, `attackCooldown` and
  `attackColor`. A separate shape field beside the attack read as two
  names for the same thing in the editor.
- **Chase** (`movement: "chase"`): a hostile enemy notices the wizard
  within `aggroRange` when nothing solid (blocks, objects, closed exits)
  lies between its eyes and his middle, and steps cell by cell towards
  him at `chaseSpeed`, greedily: along the axis where he is farther, else
  the other; a wall stops it, so he can hide and trap it with crates.
  Losing sight, it goes to where it last saw him and searches for
  `memory` seconds (1.5), then goes back to its post, or to its path: a
  chaser may have one, walked while calm. While he is within its attack
  range it holds its ground.
- **No enemy walks into a hole or onto a lethal block**, nor off a ledge
  onto one (bugs too; amends D48). They still fall in when the ground goes
  from under them.
- **"!" mark** over any enemy that notices the wizard, and over a
  provoked one turned hostile; it stays up at least 1 s and as long as it
  sees him.
- **Discharges** (`attack: "burst"` or `"arc"`), instead of touch
  (touching such an enemy doesn't hurt): seeing him within `attackRange`
  and standing still, it stops, charges for `attackCharge` seconds
  (shaking, glowing white, crackling), fires lightning for 10 ticks, then
  waits `attackCooldown` seconds. Two kinds:
  - `burst`: lightning all round it, hitting everything within range it
    can see: the wizard and other enemies (not objects);
  - `arc`: one bolt aimed where the wizard stood when it started charging
    (a dashed aim line, blinking before it fires), as long as its range
    unless a block or an object stops it first; it hits every body in the
    squares it passes through (the wizard and other enemies, all of them,
    at the author's request). Stepping aside dodges it.
  `attackColor` is its color by default; `damage` applies as before. A
  burst or arc only fires at a wizard it has noticed, so validation wants
  `aggroRange` ≥ `attackRange`.
- **Editor:** the Enemy panel lists the settings grouped (look and color,
  movement and speeds, hostility and aggro range, attack, range and
  damage, integrity, bounce, solid), each with a tooltip; all of them
  come from the enemy's template unless set for the one enemy (D79).
- **Virus:** a sharp-edged cube tipped onto an edge, slanted eyes on its
  front face, four small cubes of itself orbiting (the glitch shape,
  picked over a spiky ball and a phage; hard, flat edges at the author's
  request); yellow `#ffe23a`; it glides instead of hopping. A chaser with
  a burst: range 1.2, charge 0.4 s, cooldown 1.5 s, aggro range 5, speed
  2, chase speed 3.5, integrity 2.
- **Sentinel** (new, the author's addition): a tall sharp octahedron on
  its point with one visor eye and three shards that swing in front of it
  like a barrel as it charges; orange `#ff8a1a`. A chaser with an arc:
  range 5, charge 0.7 s, cooldown 2 s, aggro range 7, speed 1.5, chase
  speed 2.5, integrity 3. It keeps its distance: it stops once he is in
  range.
- Test room **Quarantine** (10×10, Glitchmire), off a new west doorway
  of Boot Sector: a virus, a sentinel, a stationary bug with a burst
  guarding an integrity refill, a pillar to hide behind, a trench of
  holes, a crate and a ledge.
**Why:** author's choices. The author wants one universal enemy whose
look, attack, color and movement all come from data, so new enemies are
data, not code. A charged discharge warns before it hurts, and stops a
chaser that sits inside the wizard (he walks through enemies) from
hitting him each time his invulnerability runs out, as contact damage
would. Aiming an arc when the charge starts keeps long shots dodgeable.
Greedy chasing is readable and lets rooms use cover and crates as
puzzles. Enemies throwing themselves into pits looked silly; the author
wants them to keep out.

### D79 — 2026-09-28 — Every enemy type is a template
Amends D58. With the look a field of its own (D78), a base enemy type
was only a template that sets every value, so the two are one thing now:
- Every entry of `defs.json` `enemies` is an **enemy template**. One
  without `extends` has every required value; one with it takes the
  values of the template it builds on and changes only its own. Chains
  are allowed (`big_tank` → `tank` → `bug`), loops and unknown templates
  are errors; each template must be complete once filled in
  (`resolveEnemyTemplates()`, `templateChain()`).
- A room enemy names its template: `"template": "bug"` (was `"type"`),
  so the data and the editor say the same word.
- In the room editor every template can be updated, renamed and deleted,
  the base ones too: Update moves an enemy's own settings into its
  template and says what that reaches (every enemy of it, by room, and
  the templates built on it); Rename is refused while another room uses
  it, and the templates built on it follow; Delete is refused while an
  enemy uses it or a template builds on it. New saves a template built
  on the current one, with only the enemy's own settings.
**Why:** the author's call: a type was a template in all but name.
Changing `bug` now reaches every bug and every template built on it,
which the author wants: templates tune the enemies of a whole area at
once, and different sets of templates give different areas their own
enemies.

### D80 — 2026-09-28 — Enemy review: bolt attack, alarm, routes, cell claims
From a review of the enemy code, the author asked for its fixes, the
duplication gone, a bolt attack and enemies alerted by the wizard's hits:
- **Bolt attack** (`attack: "bolt"`): a third charged attack beside the
  burst and arc (`CHARGED_ATTACKS`), sharing `attackRange`,
  `attackCharge`, `attackCooldown` and `attackColor`, plus `boltSpeed`
  (default 4 units/s). When charged it fires a bolt (the Zap's entity,
  `Bolt.shoot()`) from its eyes at the wizard's middle as he is then, in
  3D, so it reaches him on a ledge. It stops at the first body (the
  wizard: hurt; another enemy, never its own shooter: hit and provoked),
  block, room object or the room's side. Room objects shrug it off: it
  breaks no crate and switches no target (those answer the wizard's Zap
  only). Aiming when it fires, not when it charges, is fair because it is
  slow. A `shooter` template (a stationary bug) uses it; Pop-ups (step 6)
  get their own look. The Shield blocking it stays with step 7.
- **Alarm:** the wizard's Zap hitting an enemy that is hostile after the
  hit (a provoked one included) pops up a "!" ('alert'), turns it to him
  and sets where it last saw him to where he stood; a chaser searches
  there for `memory` seconds. Peaceful ones only take the damage.
- **Routes:** searching and going home, a chaser walks a shortest way
  round walls (`Enemy.route()`, a breadth-first search over the room's
  cells, down ledges but never up a step, past objects and enemies
  standing still), and a patrol off its path walks back to it the same
  way. Chasing stays greedy (D78), so hiding and crate traps still work.
  Going home it gives up only when there is no way.
- **Cell claims:** an enemy never starts a step into a cell another enemy
  is walking into, and one turned back mid-step waits `turnTicks` in the
  cell it left. Two chasers heading for one cell used to meet in the
  middle, both turn back and repeat for ever.
- **Ground gone mid-step:** an enemy drops as it walks on (it used to
  float until the end of the step).
- **Arc drawn where it hits:** from its eyes along the aim, starting its
  model's muzzle reach in front, instead of from the model's muzzle
  height (a sentinel's eye is 0.2 higher than the line the arc hits
  along).
- **Validation:** a chaser needs an `aggroRange` above 0, a peaceful enemy
  can't have a charged attack, and no enemy may start on a lethal block
  (each could never work); an enemy's bad override names its template.
- **Shared looks:** the three enemy models share their mood colors, eye
  geometry, eye glow and pop burst (`render/enemy-look.js`).
**Why:** the author's request after the review. Claims and the wait end
a livelock between chasers; routes stop chasers stranding themselves
behind a wall they walked round; a bolt reuses the Zap's entity and
rules instead of a second projectile.

### D81 — 2026-09-28 — Bolt patterns and bounces; any hit alarms
Amends D80, after the enemy review; the author's answers to four
questions (each the proposed option):
- **Bolt options, not new attacks:** the `bolt` attack gets
  `boltPattern` (`aimed`, the default, or `cross`) and `boltBounces` (0–8,
  default 0), which combine freely (a tower firing bouncing bolts four
  ways), instead of two fixed attacks.
- **Cross** (towers): fired like every charged attack, when it sees the
  wizard within `attackRange`; four level shots at eye height along the
  grid axes (`boltDirections()`); the corners between them are safe.
- **Bounces:** a bouncing bolt is aimed level at the wizard (it bounces
  in the level plane only) and glances off blocks, the room's sides
  (closed exits included) and room objects, turning back along the axis
  it ran into, `boltBounces` times; then the next of them stops it. After
  its first bounce it can hit its own shooter. Each bounce is a
  `ricochet` event (sparks). Objects are still never harmed by it.
- **Any hit alarms:** not only the wizard's Zap but every hit that leaves
  an enemy hostile, friendly fire from another enemy's burst, arc or bolt
  included (`Game.hitEnemy()`). The wizard always gets the blame: it
  turns to him and a chaser searches where he stands.
- Templates `tower` (a stationary sentinel with a cross) and `ricochet`
  (a chasing virus whose bolt bounces twice); showcase `?asset=bolts`.
**Why:** the author's choices. Options keep enemies universal (D78):
new combinations are data, not code. Level bounces stay readable on the
isometric screen; a bolt that can come back at its shooter gives the
wizard a trick. Blaming the wizard for friendly fire lets him stir up a
room on purpose.

### D82 — 2026-09-28 — Spiked platforms
Knight Lore's bouncing spiked balls, as an object rather than an enemy:
the author asked for the hopper only, reusing the platform code, as a
damaging object with coloring from the hazard block.
- A platform type may have `damage` (validated: platforms only): the
  wizard touching it, its sides, its top or riding it, loses that much
  integrity, like touching a hazard block (then invulnerability). It
  moves, waits and carries crates like any platform (same class, same
  paths), so a hopper is a platform on a short up-and-down path.
- Look: `faces: "hazard"` gives an object the hazard block's flickering
  pixels, flaring when it hurts the wizard; `mark: "spikes"` draws a ring
  of pale teeth on every face. `spiked_platform` combines both in hazard
  red; showcase `spiked-platforms`.
**Why:** a mechanism with a fixed rhythm is an object, not a monster
(enemies are for things that sense and react; a Zap, Pause or alarm means
nothing to it). Reusing platforms and the hazard look makes it data plus
a touch check, and red with flickering pixels already means "hurts" in
every room.
