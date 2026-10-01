# Decision log

Each entry: date, decision, reason, kept short; newest at the bottom.
When a decision changes, add a new entry that names the one it replaces
(don't rewrite history) and update CLAUDE.md if it is a locked decision.
The details of what was built are in docs/design.md; the discussion
behind an entry is in its pull request.

---

### D1 — 2026-09-25 — Coordinate system: y is up
Room `size` is `[x, y, z]` = `[width, height, depth]`, floor at y = 0; a
block at `[x, y, z]` fills `[x, x+1] × [y, y+1] × [z, z+1]`. The camera
looks from `+x +y +z`, so the back walls are `x = 0` and `z = 0`.
**Why:** matches three.js, no axis swapping.

### D2 — 2026-09-25 — True isometric projection, fixed view height
Orthographic camera at azimuth 45°, elevation 35.26°, view height ~20
units (16:9). Every legal room (w + d ≤ 32, h ≤ 6) projects to at most 18
units, so maximum rooms frame identically and smaller ones are centered.
**Why:** one fixed zoom gives identical framing at any resolution.

### D3 — 2026-09-25 — Player hitbox 0.6 × 1.5 × 0.6, jump clears one block
The hat is visual only; the wizard needs 2 blocks of headroom.
`jumpHeight` 1.2 clears 1 block reliably, never 2.
**Why:** "jump height = 1 unit" with a little forgiveness; a simple rule
for level design.

### D4 — 2026-09-25 — Only objects with nothing on top can be pushed
One object at a time, no chain pushing; the top of a stack can be pushed
off.
**Why:** author's choice; clearer puzzles.

### D5 — 2026-09-25 — Neon wireframe with dark occluding faces
Glowing edges over dark solid faces, so hidden edges don't show; edges
between coplanar neighbours are dropped.
**Why:** a see-through wireframe is unreadable once blocks stack.

### D6 — 2026-09-25 — Exit connections live only in world.json
Rooms describe exit geometry with a stable id; `world.json` pairs exits
(`"room.exit"`), on opposite sides and equally wide.
**Why:** one source of truth for the room graph; both ends checkable.

### D7 — 2026-09-25 — Tests use Node's built-in runner, not Vitest
`npm test` runs `node --test`; logic modules stay plain ES modules, with
`import.meta.glob` confined to the data entry.
**Why:** no dependencies or config; Vitest can come if DOM tests are needed.

### D8 — 2026-09-25 — Ajv as a dev-only validator
JSON Schema checks (Ajv) run in a Vite plugin and CI; semantic checks are
plain JS and also run at runtime.
**Why:** data is bundled at build time, so build-time validation is as
safe without shipping Ajv.

### D9 — 2026-09-25 — PRs without the GitHub CLI
Without `gh`, push the branch and give the author a prefilled compare
link with the PR title and body.
**Why:** not every computer has `gh`; no tokens handled by tools.

### D10 — 2026-09-25 — Line endings normalised to LF
`.gitattributes` forces LF.
**Why:** no whole-file diffs from Windows machines.

### D11 — 2026-09-25 — GitHub Pages deploys every push to main
Every push to `main` builds and deploys to Pages (`base: './'`).
**Why:** the author tests the latest `main` online from any computer.

### D12 — 2026-09-25 — Block edges from a corner rule, not EdgesGeometry
Static block edges come from grid occupancy (`render/edges.js`): an edge
where the four cells around it form an outer or inner corner, collinear
pieces merged, drawn as one `LineSegments2`; faces are one instanced mesh.
**Why:** `EdgesGeometry` draws lines between neighbours (D5); the corner
rule is exact and tested.

### D13 — 2026-09-25 — Render pipeline: half-float, 4× MSAA, one effect pass
The composer renders into half-float buffers with 4× MSAA; all effects
share one `EffectPass`.
**Why:** smooth lines and controllable glow at a fixed, low cost.

### D14 — 2026-09-25 — Amber is the default room color; outer floor grid is dark gray
Rooms default to amber (Home Lattice); the grid outside the room is dark
gray and fades within 5 units.
**Why:** author's preference; a colorless outside shows what is room.

### D15 — 2026-09-25 — Data errors: build fails, dev server shows them in the game
Any data error fails the build; in the dev server the game lists every
schema and semantic problem on an error screen. Rooms are keyed by file
name while validating.
**Why:** one place to see all problems; broken rooms never deploy.

### D16 — 2026-09-25 — Every exit must be connected
An unconnected exit, or one used twice, is an error.
**Why:** an opening leading nowhere lets the player out of the world.

### D17 — 2026-09-25 — Object types differ by shape, not only color
Object types set a style in `defs.json`: `edges`, `mark`, `faces`,
`tint`, overridable per object. Box looks kept as `crate_plain`,
`crate_cross`, `crate_dashed`.
**Why:** color alone fails color-blind players and washes out in bloom.

### D18 — 2026-09-25 — Holes are floor tiles, not a lower level
`holes` mark floor tiles as black pits: the wizard dies when his center
is over one at floor level; a pushed block drops in and fills it. Holes
never lead to another room.
**Why:** a trap and a push puzzle without a deeper room model.

### D19 — 2026-09-25 — Fixed-height jumps with coyote time and a jump buffer
Every jump reaches `jumpHeight`; a jump works a few ticks after leaving a
ledge, and a press just before landing is remembered.
**Why:** puzzles rely on "clears exactly one block" (D3).

### D20 — 2026-09-25 — Asset showcase page, deployed with the game
`tools/showcase.html` shows every look on a turntable with the game's
renderer, as a second Vite entry.
**Why:** review looks without playing to them, locally or online.

### D21 — 2026-09-25 — Wizard look: cone body, ball head, floating hands, tilted hat
Cone body, ball head, two floating ball hands, a pointy hat tilted back;
body and hat magenta, head and hands cyan. (Line style replaced by D22.)
**Why:** author's design; the tilt shows the face from above.

### D22 — 2026-09-25 — Characters use a hologram look
Characters are smooth solids with a dark core glowing towards the
silhouette, drifting scanlines, an inverted-hull outline and glowing eyes
(`render/holo.js`). The world stays wireframe.
**Why:** author's pick in the showcase; reads as a figure and a program.

### D23 — 2026-09-25 — Direction keys: Right goes up-right on screen
Right = −z (up-right), Up = −x (up-left), Left = +z, Down = +x.
**Why:** author's preference after playing.

### D24 — 2026-09-25 — Dying resets the room
Respawning rebuilds the room from data, as on re-entry.
**Why:** a push puzzle can be left unsolvable; no separate reset action.

### D25 — 2026-09-25 — Pushables are moving bodies, not grid cells
Pushables collide as boxes, the player too; a push needs a short shove
(`pushDelay`) and slides one cell at 3 units/s. A plugged hole keeps its
object, top flush with the floor.
**Why:** smooth following, one code path for stacking and plugging.

### D26 — 2026-09-25 — Flip-screen exits keep the offset; the arrival is the respawn point
The wizard arrives half a cell inside the matching exit, keeping his
offset, height, fall and facing. Objects can't leave a room; the first
row inside an exit must be free. (The respawn part is replaced by D39.)
**Why:** joined rooms feel continuous; objects would be lost on reset.

### D27 — 2026-09-25 — Room transitions fade through black
Fade out 0.2 s with the world frozen, fade in 0.25 s already playable;
the veil sits under the HUD.
**Why:** author's request; an instant swap felt abrupt.

### D28 — 2026-09-25 — Exits show a data stream in the destination's color
Exits are marked in the color of the room they lead to. (The first
stream look was replaced by D30–D33.)
**Why:** exits read at a glance and hint where they lead.

### D29 — 2026-09-25 — Doorways lead into darkness; a quieter stream
Behind every back doorway a short dark tunnel hides the outer grid.
**Why:** the grid through a doorway read as a hole in a thin wall.

### D30 — 2026-09-25 — Exit effect only on the doorway frame and the front arrows
The floor stream and proximity glow are dropped; front exits get gliding
arrows instead of chevrons. (Doorway part replaced by D31, D32.)
**Why:** author's review: the floor stream was too much.

### D31 — 2026-09-25 — Doorway effect uses the arrow pattern
Gliding frames into the tunnel. Replaced by D32.

### D32 — 2026-09-25 — Doorways: a dashed stream into the tunnel
Dashes in the destination color flow from the doorway into the tunnel
along its corner edges and two floor lanes, fading to black.
**Why:** author's pick side by side in the showcase.

### D33 — 2026-09-25 — Front exits: one small arrow per tile
One small arrow per tile of exit width, gliding within the first row.
**Why:** one large arrow covered too much floor.

### D34 — 2026-09-25 — HUD layout, bundled retro fonts, text in strings.json
Integrity top left, banner top center, name top right, terminal bottom
left, fullscreen hint bottom center. Orbitron and Share Tech Mono through
Fontsource. Any module prints with `say()` and `announce()`; every UI text
comes from `data/strings.json` (the error screen keeps its own English).
**Why:** a clear retro HUD, self-contained and offline; logic prints
without knowing the HUD.

### D35 — 2026-09-25 — Integrity carries over; a fatal fall drains it, respawn refills it
Integrity is game state, not room state; a fatal fall empties it and a
respawn fills it.
**Why:** quick, non-punishing deaths in rooms that reset.

### D36 — 2026-09-25 — Slower steering in the air: a jump can't cross 2 tiles
Air speed 65% of walking: a jump reaches ~1.65 units, a 1-tile gap.
**Why:** gaps stay a puzzle limit, like D3 for height.

### D37 — 2026-09-26 — Debug mode: a Game.hurt() method, no fake hazards
The test-damage key calls `Game.hurt()`; the room jump reuses
`enterRoom()`.
**Why:** the debug keys exercise the real code paths.

### D38 — 2026-09-26 — G toggles screen-relative movement, arrives ahead of the settings menu
`G` toggles grid and screen-relative movement, announced and shown as a
HUD tag; not saved.
**Why:** author wants it for players who find grid controls harder.

### D39 — 2026-09-26 — Each room defines its own death-respawn point
Optional `reset` point per room (default `spawn`); dying always respawns
there, whichever door he came through. Replaces D26's respawn at arrival.
**Why:** a designed spot is easier to reason about with several exits.

### D40 — 2026-09-26 — Static block types live in the grid; changing blocks are room objects
Blocks that never move or change (hazard, void) are grid cell types;
blocks that move or vanish (platforms, collapsing) are room objects.
**Why:** static blocks are one merged mesh; room objects already move,
collide and reset.

### D41 — 2026-09-26 — One Player for the whole game; the tick returns typed events
One `Player` lives the whole game and owns the wizard's state;
`Game.update()` returns `GameEvent` objects (`{ type, ...details }`).
**Why:** per-wizard state survives room changes; events carry details.

### D42 — 2026-09-26 — Version: phase in MINOR, merged PRs in PATCH, computed from git
MAJOR stays 0 until the author declares 1.0.0; MINOR is the phase, raised
by a release PR, tag and GitHub Release; PATCH counts merges into `main`
since the tag (`tools/game-version.js`).
**Why:** every merge shows a new number without PRs conflicting on
`package.json`.

### D43 — 2026-09-26 — Phase 2 scope, order and rules
Phase 2 order: damage first, then block types, bugs, Zap, X-ray, the
editor last. Rules: every damage source goes through `Game.hurt()`, ~1 s
invulnerability with blinking, no knockback, death at 0; a squeezing
platform shoves or hurts, never kills; platforms and patrols share one
path format; X-ray for the wizard only. Every step adds showcase
entries, a test room, tests and docs. Biome effects move to content
production.
**Why:** author's review; fixed rules keep each step focused.

### D44 — 2026-09-26 — Hazard and void contact rules and animated looks
Hazard contact: overlap on two axes and within 0.02 on the third
(standing or leaning counts, a corner doesn't), through `Game.hurt()`.
Void kills when grounded with the feet center over it, like a hole.
Animated shader looks, steady edges, a flare when a hazard hurts.
(Fixed block keys replaced by D60; void look by D99.)
**Why:** walls hurt on contact without punishing a near miss.

### D45 — 2026-09-26 — Test rooms stay until content production
The rooms that each show one mechanic stay and grow with each step.
**Why:** the only place to try a mechanic in isolation. (Refined by D90.)

### D46 — 2026-09-26 — Moving platforms: path format, riding, waiting and squeezing
Paths start at `at` and run through `points`, axis-aligned legs,
`pingpong` or `loop`, `speed`, `pause`. A platform carries the wizard and
crates, waits for anything in its way, shoves the wizard at most 0.35 per
tick and, pinned, hurts him and waits. One dim guide line.
**Why:** simple validation and grid alignment; a jammed lift is a puzzle;
never instant death.

### D47 — 2026-09-26 — Collapsing blocks: trigger, timing, regrow and bodies
Only the wizard standing on one triggers it: 0.5 s of shaking, then gone,
even if he steps off; optional `regrow` once its cell is clear. It may
bridge a hole. (Color replaced by D98, D99.)
**Why:** running across is safe, standing still is not.

### D48 — 2026-09-26 — Enemies: data-driven types, cell-by-cell physics, hostility and bounce
Every enemy trait is data, overridable per enemy. Enemies move one cell at
a time, fall, ride platforms, turn back when blocked and pop in holes and
on void. The wizard walks through them; touching a hostile one hurts;
landing on a bouncy one launches him 2 blocks up. Eye color shows
hostility. (Extended by D78–D81.)
**Why:** grid movement avoids edge cases; data lets rooms tune enemies.

### D49 — 2026-09-26 — Test rooms hang off Boot Sector, not in one row
Every test room is at most two rooms from Boot Sector; new ones connect
near the hub.
**Why:** testing the newest mechanic shouldn't mean walking the world.

### D50 — 2026-09-26 — Every bug bounces; a drop shadow only under the wizard
`bounce` is true on bugs; falling objects' shadow is off
(`DROP_SHADOWS.fallingObjects`).
**Why:** the ball already reads as bouncy; one shadow reads clearer.

### D51 — 2026-09-26 — Solid enemies block, carry and shove the wizard
A `solid` enemy blocks him like a crate, carries him and shoves him (at
most 0.35 per tick); pinned, it turns back.
**Why:** enemies to avoid or ride, set by data.

### D52 — 2026-09-26 — Zap and energy: numbers, aim, what stops a bolt; bugs take two hits
The bolt flies level from his hands the way he last walked or turned and
stops at the first enemy, block, object or room side; it hits peaceful
enemies too. A bug takes two Zaps. (Numbers replaced by D72.)
**Why:** one cast key; crates stay useful as cover.

### D53 — 2026-09-26 — Destructible crates: integrity on pushables, drawn as data bits
A pushable type may have `integrity`; at 0 it breaks until the room
resets. `crate` gets the `bits` mark; a destructible object shows the
grid with 6 bits missing. Boxes stay static. (Glass look: D96, D99.)
**Why:** author's request, with a visual hint of breakability.

### D54 — 2026-09-26 — Cast on E or Numpad 0; Tab switches spells; the selected spell under energy
Cast on E / Numpad 0, next spell Tab, previous Q; the selected spell's
tag under the energy bar. No game key is a modifier.
**Why:** Ctrl+W would close the tab while moving up.

### D55 — 2026-09-26 — X-ray outline: a ghost of the hidden parts, in his own colors
Only the hidden parts of the wizard show, as a ghost in his own colors
(reversed depth test).
**Why:** author's pick; shows how far behind he is, keeps blocks readable.

### D56 — 2026-09-26 — Room editor: F2 in the game, save through the dev server, hand-written style kept
F2 edits the current room in place, one height layer at a time; F2 again
plays it. The dev server checks and writes the room; a build downloads
it. Untouched `blocks`/`holes` entries keep their shape; JSON in the
data files' style. The editor reads its own keys and has its own text.
**Why:** instant edit-and-test turns; small diffs of hand-written rooms.

### D57 — 2026-09-26 — Room editor, moving part: pick, then edit; world.json saved with the rooms
Enemies, paths and exits are picked, then edited in the panel; paths get
automatic corners; exits connect to fitting exits of other rooms. Rooms
and `world.json` are checked and saved together.
**Why:** a new exit and its connection only pass validation together.

### D58 — 2026-09-26 — Enemy templates are enemy types that extend a base type
A reusable setup is saved as a `defs.json` enemy type that `extends` a
base and sets only what it changes. (Extended by D59, D79.)
**Why:** linked templates: changing one changes every enemy of it.

### D59 — 2026-09-27 — Room editor: template changes are undo steps; the view cuts at the layer
Template changes are undo steps of their room; rename and delete only
when nothing else uses the template. **Hide above** leaves out what is
above the edited layer.
**Why:** undo by hand was error-prone; higher blocks hid the layer.

### D60 — 2026-09-27 — Block types become open, data-driven types
`defs.json` `blocks` is an open map of types: properties the engine
understands (`damage`, `lethal`), a look, a color, `extends` (one level).
The engine asks properties, never names. A type with a `kind`
(collapsing) is painted like blocks but runs as room objects (id
`<type>@x,y,z`). One Block tool in the editor. Built 2026-09-27.
**Why:** new block types become data; the engine grows by behaviors.

### D61 — 2026-09-27 — Six biomes: a core, four side sectors, one special
Home Lattice (core), Glitchmire, Frostbyte Wastes, Abyssal Buffer,
Firewall Citadel and Phantom Partition (special: secrets, backtracking);
looks only for now. (Colors refined by D62, D63, D99.)
**Why:** author's request; room colors avoid gameplay colors.

### D62 — 2026-09-27 — Biomes set the room's surroundings too
A biome's optional `look`: `background`, `outerGrid`, `outerFade`,
`wallGrid`, `bloom`; defaults are Home Lattice's. Frostbyte becomes ice
blue.
**Why:** cheap values already in the renderer set the biomes apart.

### D63 — 2026-09-27 — Abyssal Buffer turns graphite gray
Graphite `#7a8190` on dark gray, drifting glitter planned.
**Why:** author's choice: a dark, quiet sector.

### D64 — 2026-09-27 — Edges between block types
All plain types are one mass for the corner rule, each edge in a
neighbouring type's color; hazard and void outline themselves, drawn
alone where they meet plain blocks. Collapsing blocks keep every cell
outline.
**Why:** seams only where they mean something.

### D65 — 2026-09-27 — Phase 3 splits in two; spells get a discussion step
Phase 3 (spells and pickups) and Phase 4 (guardians, saves, tooling);
polish moves to Phase 5. A spell-roster discussion step; each step
settles its questions with the author first.
**Why:** the old Phase 3 was twice Phase 2's size.

### D66 — 2026-09-27 — World map tool: its own page, room positions in world.json
`tools/world-map.html`, dev server only; rooms are nodes on a grid, one
per cell, at positions stored in `world.json`.
**Why:** an overview of the growing world; stored positions don't shift
and the player's map can share them. Never shown to players (D67).

### D67 — 2026-09-27 — Exploration is part of the game; a maze with backtracking
Nothing made for development reaches the player. The world is a maze: a
room need not be solvable on first arrival, later spells open shortcuts,
he can always leave the way he came. Every permanent pickup is one save
bit; a found one stays as a gray ghost. Temporary pickups come back.
**Why:** author's direction: exploring and mastering the Grid is the
reward.

### D68 — 2026-09-27 — World targets: towards 128 rooms, 16 spells, buff items, access levels
Towards 128 rooms (many small ones), up to 16 spells, buff items, access
levels and ability gates. The save holds the wizard, not rooms (no map,
no bonus slots); room field 8 bits. (Spell count refined by D88; bonus
slots dropped by D100.)
**Why:** many small rooms suit flip-screen exploring; a short key.

### D69 — 2026-09-27 — Switches unlock exits
A Phase 3 step for plates and targets unlocking exits; the locked exit is
shared with access levels. (Settled in D75.)
**Why:** crates and Zap become puzzle keys with little new machinery.

### D70 — 2026-09-27 — World map tool: positions format, who saves what
`positions`: room id → `[x, z]` (+x east, +z south). The room editor owns
connections, the map positions (merged on save, disk wins). A new room
gets the nearest free cell. `?room` and `?edit` work in the dev server
only.
**Why:** no stale copy undoes another page's save.

### D71 — 2026-09-27 — Pickups: save bits in blocks, the Zap disk, refills
Save bits come in blocks per kind; a bit is the item, not the place. The
index lives on what the item unlocks (a spell's `slot`). Integrity and
energy refills. Zap is learnt from its disk in Boot Sector. The disk: a
white slab with a 4×4 bit grid, the slot lit in the spell's color.
**Why:** countable items; a disk can wait on both sides of a gate.

### D72 — 2026-09-27 — Energy in whole units, a bar in segments of 10
50 energy, one unit back every 12 ticks; Zap 10; refill 30. The bar is
segments of 10 whatever the spell; costs are multiples of 10; hidden until
a spell is known. Replaces D52's numbers.
**Why:** the bar keeps its shape when switching spells.

### D73 — 2026-09-27 — Data disks: install animation, the Shield spell
Taking a disk plays a 1 s scan: bits spiral in, rings sweep up him, a
white flash. Shield (slot 1): a lightning ring. Each spell has a `color`
in `defs.json`. (Refined by D74.)
**Why:** a reward moment; a real second spell tests switching.

### D74 — 2026-09-27 — Playtest: no freeze while installing, Shield 7 s
The install no longer freezes him; Shield lasts 7 s; lit bits glow
brighter for darker colors; found disks spin without the bob.
**Why:** author's playtest.

### D75 — 2026-09-28 — Switches: targets, floor plates, locked exits
A target (Zap toggles it) and a plate (on while something stands on it).
`"locked": true` exits open while every switch in the room is on, never
close on the wizard, and the exit he came in through stays open for him.
White with a square bull's-eye; the lock has one light per switch.
**Why:** author's choices; every room stays leavable the way he came.

### D76 — 2026-09-28 — Automatic quality fallback; shaders compiled ahead
Two slow 2 s windows (below 50 fps) step MSAA 4 → 2 → 0, then render
scale 0.75 → 0.5; never back up; `?msaa`/`?scale` turn it off. Shaders
compile ahead, hidden objects included, for the composer's buffer.
**Why:** weak GPUs pay for resolution × MSAA; extra full-screen passes
are costly, effects in the existing pass nearly free.

### D77 — 2026-09-28 — World map tool adds and removes rooms and connections
Move, Add, Connect and Delete tools; connected rooms get 2-wide exits in
the middle of their facing walls; everything is saved together, all or
nothing.
**Why:** sketching the world's layout is quicker on the map.

### D78 — 2026-09-28 — Universal enemies; chase and discharge; Viruses and Sentinels
An enemy's `look` is a field beside `movement`, `attack` and `color`, and
any combine. `attack`: `touch`, `burst`, `arc`, `none`. `chase`: a hostile
enemy follows the wizard while it sees him within `aggroRange`, searches
where it lost him, then goes home. Charged discharges warn before they
fire. No enemy walks into a hole or onto void. A red "!" when one notices
him. Virus (chaser, burst) and Sentinel (keeps distance, arc); test room
Quarantine.
**Why:** new enemies are data, not code; a charged attack is fair.

### D79 — 2026-09-28 — Every enemy type is a template
Every `defs.json` enemy is a template; chains of `extends` allowed; a room
enemy names its `template`. Every template can be updated, renamed and
deleted in the editor. Amends D58.
**Why:** a type was a template in all but name; templates tune an area.

### D80 — 2026-09-28 — Enemy review: bolt attack, alarm, routes, cell claims
`bolt` attack: a slow shot at the wizard's middle, harmless to objects; a
`shooter` template. The wizard's hits alarm an enemy. Chasers route round
walls going home and searching. An enemy never steps into a cell another
is entering. Validation: a chaser needs an aggro range, a peaceful enemy
no charged attack.
**Why:** fixes from the enemy review; the bolt reuses the Zap's entity.

### D81 — 2026-09-28 — Bolt patterns and bounces; any hit alarms
`boltPattern` (`aimed`, `cross`) and `boltBounces` combine freely. Every
hit that leaves an enemy hostile alarms it, friendly fire included, and
the wizard gets the blame. Templates `tower` and `ricochet`.
**Why:** options keep enemies universal; stirring up a room is a trick.

### D82 — 2026-09-28 — Spiked platforms
A platform type with `damage` hurts on any touch; `spiked_platform` has
`shape: "spiked"` (pyramids within its cell) in hazard red.
**Why:** a fixed rhythm is an object, not an enemy; reuses platforms.

### D83 — 2026-09-28 — Cron, worm and crawler looks
Cron (the tower's look, emitters on the grid axes), worm (patroller) and
crawler (chaser), both touch attacks; test room Scheduler.
**Why:** looks are data; the tower shows its dangerous lines.

### D84 — 2026-09-28 — Step 6 closed; Shield blocking and the Firewall spell
Pop-ups are closed: the `bolt` attack and `shooter` cover them. The
Shield absorbs bolts and blocks arcs and bursts. Firewall (slot 2, 40
energy, 7 s) also blocks touch and burns enemies touching it; either ring
replaces the other. Ember flames. Its disk in Scheduler.
**Why:** Shield for shooters, Firewall for crowds.

### D85 — 2026-09-28 — The Pause spell
Slot 3, 25 energy: a bolt that freezes the enemy it hits for 5 s; a
frozen enemy is solid, harmless and still hittable, and never traps the
wizard. `pausable` template field (Wardens). A cage of corner brackets,
pale lavender. Disk in Quarantine.
**Why:** a skill shot like Zap; freeze-and-zap combos.

### D86 — 2026-09-28 — Blink and Warp
Both go the way he aims through open space only and land short of a
stop, fizzling against a wall. Blink (slot 4, 15 energy, 3 units) hits
enemies it passes for 2 and hurts him 1 if cut short; Warp (slot 5, 30
energy) goes to the first stop, harmless. Test room Fast Path.
**Why:** a risky attack dash against a safe way across; walls stay walls.

### D87 — 2026-09-28 — Cut & Paste
Slot 6: cut a crate or frozen enemy in front of him (his level, nothing on
it; 20 energy) into a one-slot clipboard that goes with him; paste into
the free cell in front for free. Copies allowed; dying loses it. A
marching-ants marquee, an aim marker, a HUD slot; white. Test room
Clipboard.
**Why:** a puzzle spell with a combo; copies keep the rules simple.

### D88 — 2026-09-28 — Spell roster: Compile, Fork, Scan; Zap+ and Mirror
New spells Compile, Fork, Scan (slots 7–9, Phase 4). Upgrades Zap+ and
Mirror (renamed Shield+ in D95) in their own save block (bits 32–47),
replacing their base spell in the Tab cycle. Up to 16 spells and 16
upgrades. An intended order in the world; a buff draft (settled in D93).
Turned down for now: Patch, Overclock, Decrypt, Rollback, Halt, Lift,
Firewall+, Cut & Paste+.
**Why:** new answers to puzzles; the first spells stay useful late.

### D89 — 2026-09-29 — Pull joins the spell roster
Pull (slot 10, Phase 4): pulls the closest crate or enemy in the facing
direction one tile towards the wizard.
**Why:** pushing only moves crates away.

### D90 — 2026-09-29 — Authored rooms: the author's real game rooms
`"authored": true` marks the author's real rooms, set in the room editor.
Development steps never change them or attach rooms to them; tests never
depend on them; changes that could affect them are listed in the PR. The
map tool doesn't flag them for distance. Refines D45.
**Why:** the author's rooms must not grow test exits; a flag promotes a
room in place.

### D91 — 2026-09-29 — Access level in the save key; upgrades move to Phase 3
The key gets an 8-bit access-level field (4 used), stored, not counted.
Zap+ and Mirror move to Phase 3.
**Why:** room to grow; upgrades make early spells matter already.

### D92 — 2026-09-29 — The jump becomes an upgrade; backups (lives) and backup shrines
The jump buff moves to the upgrades. Backups (lives) and backup shrines
join Phase 3; a load starts with full backups. (Rollback replaced by D97;
the jump settled in D95.)
**Why:** death cost nothing, so there was no tension.

### D93 — 2026-09-29 — Buff items: amounts, taking one, the chip look
4× +1 integrity (8 → 12), 5× +10 energy (50 → 100), one recharge buff
(12 → 8 ticks per unit); slots 0–9 of the buff block. Taking one fills
the stat; every permanent pickup plays the install animation. A chip in
the stat's color.
**Why:** a buff feels like a reward at once.

### D94 — 2026-09-29 — Pickup colors the player can read; found pickups solid gray
Shape tells what a pickup is, color the HUD bar it improves (cyan
integrity, lime energy and recharge); found ones are solid gray ghosts.
**Why:** a clean visual distinction; amber said nothing.

### D95 — 2026-09-29 — Upgrades: Zap+, Shield+ and the double jump
Upgrades are pickup types in the upgrade block; a spell upgrade replaces
its spell in the Tab cycle at the spell's cost. Zap+ bounces three times;
Shield+ sends bolts back as his own; the double jump adds one mid-air
jump. An expansion card look. Test room Upgrade Lab.
**Why:** a double jump leaves the base rules intact; names show SHIELD
becoming SHIELD+.

### D96 — 2026-09-29 — Glass crates
Every crate is frosted glass (`"faces": "glass"`), a marked crate's mark
on a small dark core inside. (Destructible look replaced by D99.)
**Why:** crates read as material, not items; a cheap face shader.

### D97 — 2026-09-29 — Backups: 8, no rollback, reboot on the nearest shrine
8 backups, one per death. With none left the system crashes and he
reboots on the shrine nearest on the world map (|dx| + |dz|, ties to the
last used), losing nothing found. A shrine is a floor tile that refills
integrity, energy and backups, in the wizard's magenta. Replaces D92's
rollback.
**Why:** losing found items felt too harsh for the game's tone.

### D98 — 2026-09-29 — Magenta is the wizard's color; collapsing blocks turn pale white-blue
Magenta is the player's color; collapsing blocks give it up. (Their
color is replaced by D99.)
**Why:** a magenta shrine by magenta blocks would look related.

### D99 — 2026-09-29 — Color rules for objects and blocks; void as black mist
Red hurts (one `#ff2a3a`); the room color is structure (collapsing
blocks too); black is a pit (void as black mist); white is a mechanism;
cyan moves; magenta is the wizard; lime is pushable (a destructible crate
an empty, thinner shell). Biome colors are tested clear of them; Phantom
Partition turns pale violet. Refines D44, D61, D96, D98.
**Why:** with few colors, each must mean one thing.

### D100 — 2026-09-29 — Score counts what the wizard has; secrets; no bonus bits
The score is worked out from the save bits: 50 per permanent pickup, 200
per secret, 500 per access level; never saved. Secrets (magenta stars,
bits 112–127). No bonus bits, no high score. HUD score rolls up with the
completion share.
**Why:** reward progress through the Grid, not farming.

### D101 — 2026-09-29 — Fragments, the core and access levels; the end of the game
64 fragments (bits 48–111), the modules of an 8×8 boot key the HUD fills
in. Touching the core raises the access level to what the fragments earn
(16, 32, 48 → 1, 2, 3); all 64 reboot the Grid (a placeholder end). The
core is a placeable object, at most one. `"access": n` exits show a gold
Roman numeral; every locked exit is a dark door panel. Gold hat bands
show the level. Test room Vault.
**Why:** the core is the hub he returns to; the last 16 fragments are for
the ending.

### D102 — 2026-09-28 — World map tool removes single exits
Exits are marks on their room's edge, cyan connected and magenta loose.
Delete removes one by a click on its mark: a connected exit goes with its
connection and the exit at the other end (every exit must be connected),
a loose one alone; one undo step. Connect uses a loose 2-wide exit in the
facing wall, nearest the middle, before opening a new one.
**Why:** a connection line between neighbours is short and hard to hit,
and a loose exit (made by hand) has no line at all.

### D103 — 2026-09-28 — World map tool: Undo last save
Before each save the map keeps a rollback point: `world.json` and every
room file the save writes or deletes, in session storage so it survives
the reload a new or deleted room causes. The panel's Undo button (Ctrl+Z)
undoes edits; with none left it reads Undo last save and puts the point
back as unsaved changes, for Save to write through its usual checks. One
step only; another page's save (the room editor) drops the point. The map
tool's tests use a small world of their own.
**Why:** a room deleted by accident was gone once saved; restoring it as
unsaved changes keeps one way to write data and lets the rollback be
undone.

### D104 — 2026-09-29 — Firewall Wardens are bosses that always drop loot
Wardens are the bosses of combat rooms. Every Warden drops one permanent
pickup (fragment, buff, upgrade, spell or secret; never a refill), shown
once it falls. While that pickup's save bit is found, the Warden is left
out of its room and counts as defeated, so exits it locks stay open. An
item that also lies elsewhere skips the boss when found there first.
Shrines stay out of boss rooms.
**Why:** a beaten boss stays beaten without saving any room state (D68).

### D105 — 2026-09-29 — Saving is a player action; Phase 4 splits in two
The player saves when he chooses, from the pause menu; a save writes the
key to the URL hash and to localStorage. Nothing saves on its own. A load
starts in the saved room with the room reset, full integrity and energy
and an empty clipboard; the backups left come from the key (D106,
replacing "a load starts with full backups" of D92). Phase 4a: access keys, title
screen and pause menu, saving and loading, the map screen. Phase 4b: the
spells Compile, Fork, Scan and Pull, Firewall Wardens, the reachability
checker, design skills and subagents.
**Why:** loading resets the room anyway, so a save anywhere gives nothing
away; 4a gives players saves sooner.

### D106 — 2026-09-29 — Access keys in hex; the room as its map cell
The key is 176 bits (format version 4, room cell x 8 and z 8, access
level 8, pickups 128, backups 4, CRC-16 16), 44 hex digits in groups of
4. Backups are saved, integrity is not (a load starts full). The room is its cell in `world.json` `positions` (one room per cell),
each coordinate a signed byte. The payload is XORed with a stream seeded
by the checksum, then every bit moves by a fixed shuffle. Input forgives
spaces, dashes, lowercase, O for 0, I and L for 1. Replaces Base32 and
the 8-bit room number in CLAUDE.md §8.
**Why:** the key is copied, not typed; hex is simpler to read and debug
than a custom alphabet (Base32 without 0/O/1/I/L has only 31 symbols).
The map cell already names a room uniquely, so no room-number table is
needed; moving a room breaks old keys, which matters only in development.
Saving backups keeps save and load from refilling lives for free.

### D107 — 2026-09-29 — Seven more enemy looks
Warden, daemon, golem, wyrm, phish, overclock and pixie join the enemy
looks, each a fantasy creature crossed with a computer thing (a knight of
firewall, a wisp daemon, a rack golem, a packet dragon, a phishing mimic,
a burning processor, a pixel butterfly). They are looks only: no template
uses them yet, rooms pick them with `look`, and templates come with the
content that needs them (the warden with the Firewall Wardens). A wyrm's
plates are shades of its own color, so a room can recolor it. A model's
`muzzle` is a reach along the line of fire (worm and crawler had points).
**Why:** more silhouettes for content production; reviewed in the
showcase first.

### D108 — 2026-09-29 — Home Lattice keeps the default enemies; a roster per biome
Home Lattice's own enemies are bug, virus, sentinel and cron (the
`tower` template): the default cyberspace enemies, which may still show
up anywhere. Each other biome gets a roster of its own, at least three
enemies with a signature trick, proposed in docs/design.md (Phase 4
outline) and reviewed in Phase 4b. Still six biomes (D61); their colors
and setup may change so ideas such as a nature sector with insects or a
heavy virtual one with pixelated enemies fit into them.
**Why:** biomes should play differently, not only look different; the
four basic enemies, one per attack, suit the core and teach the basics.

### D109 — 2026-09-29 — Title screen and pause menu
The game opens on a title screen over the start room's empty shape (its
floor grid and back walls in its biome's look, no blocks, objects or
wizard; dimmed well down): Start, Options and Controls; the room itself
loads after Start; Enter key joins it with
loading. Esc or P pauses the game, and so does the window losing focus;
the pause menu has Resume, Save (a stub that says saving comes next),
Options, Controls and Quit to title (Copy key and Copy link join it with
saving). Quitting asks first, as it starts a new game. Options: music
and sound volume, 0–10, and a Visuals submenu (quality, render scale,
screen effects); stored in localStorage apart from the key, not applied
until audio and quality presets exist (Phase 5). Menus take
arrows or WASD, Enter or Space, Esc or P to go back, and the mouse. Behind
a menu the game and its animations stand still. The world map tool's dev
links (`?room`, `?edit`) skip the title.
**Why:** the save UI needs both screens; pausing on focus loss keeps a
player who switched windows from coming back dead. Settings belong to the
browser, not to the wizard, so they stay out of the access key.

### D110 — 2026-09-29 — A boot sequence after Start
Start plays a 2.6-second boot sequence: the logo scrambles into glyphs
and glitches out, the room compiles tile by tile along its own grid
(2×2-cell tiles, each a column up to the ceiling, in a shuffled wave from
the back corner, each floor outline flashing cyan) while the terminal
types `> LOADING SECTOR`, and the world round it fades in last; then the
wizard pops in out of gathering pixels (the derez backwards), flashing
white and landing with a squash. Then the room's banner and the boot
messages; the game holds until he lands. Enter, Space, Esc or P skip it.
The tiles are a 2D canvas over the game, not clipping in 3D, which would
recompile every shader at its start and end; a cleared tile always
shows, so at worst a block in front shows a moment early. (A first try,
a scan line sweeping down the screen, was dropped.) The title's tagline
is "INTO THE GRID".
**Why:** starting should feel like being loaded into the Grid; the pixel
pop-in reuses the derez, so it needs no new asset.

### D111 — 2026-09-29 — Saving and loading
**Save** in the pause menu writes the key into the URL hash
(`history.replaceState`) and localStorage (`neonmancer.save`), and the
pause menu shows it from then on; **Copy key** and **Copy link** copy it
(or a link to the page with it as the hash) and ask for a save first.
A valid key in the hash at start loads directly (the boot sequence into
the saved room); an invalid one opens the title with a message. The title
has **Continue** (only with a save stored: the last save in this browser)
and **Enter key** (a text field; a refused key says why). A loaded key
goes into the hash but not into localStorage: only Save stores. A load
starts over in the saved room, reset, with the key's pickups, access
level and backups, full integrity and energy, and an empty clipboard; a
map cell with no room any more loads in the start room (D106). A hash
changed by hand (a pasted link on the same page) reloads the page. The
Grid-rebooted flag is not saved: after a load the core may play the
reboot again.
**Why:** Continue saves pasting a key in the same browser, while the key
and the link still carry a save anywhere else. Storing only on Save keeps
"nothing saves on its own" (D105).

### D112 — 2026-09-29 — The map screen
M (or **Map** in the pause menu) opens the run's map over the standing
game; M, Esc, P, Enter or Space close it. It records the rooms entered in
this run and is never saved (D68): a new game or a loaded save starts it
empty. Using a backup shrine (stepping on it, or a crash reboot) reveals
every room within 2 map cells of it (|dx| + |dz|), dimmed as a dashed
outline until visited, and they stay on the map for the run. A visited
room shows in its biome color with its exits: connections to rooms on the
map, center to center like a grid (dashed when they run across the map),
and a cyan stub in the middle of each side with an exit to a room not on
it yet; where along the wall an exit lies doesn't show. The rooms behind
stay hidden. Each visited room
is labelled with its name and, under it, a row of icons: a blinking dot
where he is, a gold mark while a fragment he hasn't found lies there, a
magenta ring for a backup shrine. Revealed rooms have no label. The map is drawn from the
game's isometric angle, so east is down-right as in the rooms.
**Why:** finding what is where is part of the game (D67), so the map only
remembers what he has seen; shrines give a local chart as a reward for
reaching them, and the stubs show the way on without giving away the
rooms. Fragment marks save revisiting rooms to check what is left.

### D113 — 2026-09-30 — An access pass for testing
A new temporary pickup kind, `access` (`access_pass_3` in defs.json),
raises the wizard's access level to its `level` when he touches it, as
the core does (D101), and lies in Boot Sector beside the core. It has no
save bit, comes back with the room, never lowers his level and is left
lying while he has that level. It looks like a gold upgrade card with the
level as its lit bit.
**Why:** access-locked exits and rooms behind them are tedious to test
when every level needs 16 fragments at the core; debug K still finds
fragments, but the pass works without debug mode and in a normal
playthrough of the test rooms. It is a test item: real game rooms should
not use it.

### D114 — 2026-09-30 — The wizard's body language
The wizard gets a walk cycle (head bob, hand swing, forward lean), an
idle float (breathing, drifting hands, blinks), an air pose with a
stretch, a landing squash and a hat on a spring (docs/design.md, Player,
Look). It is all transforms of the model's existing parts, posed by a
pure function in the render layer (`wizard-motion.js`); the walk cycle
follows the distance walked, not time.
**Why:** a rigid wizard sliding over the floor looked static, and he is
on screen all the time. Moving, rotating and scaling half a dozen parts
per frame costs nothing measurable: no new geometry, materials, draw
calls or effect passes, and the x-ray ghosts are children of the parts,
so they follow for free. Deforming meshes (skinning, per-vertex changes)
was ruled out as the one option with a real cost. Tying steps to
distance keeps his feet from sliding and his stride from freezing
mid-step. Action poses follow the same way: pushing, casting (the hands
follow the aim, where the bolt starts, not the turning body) and falling
into a hole; each reads existing player state (`pushTarget`,
`castTicks`, `deathCause`), so the game logic is unchanged.

### D115 — 2026-09-30 — Static objects are drawn for the fixed view
The camera never turns and looks from +x +y +z, so a static object shows
only its top and its +x and +z faces. New static looks put their detail
on those faces and draw nothing on the hidden ones, and the asset
showcase shows them standing still, as they are seen in play. The first
is the data pillar, a decoration: a glass shaft round a core with four
data cables up one seen face, in the biome's color (docs/design.md,
Decorations).
**Why:** detail on hidden faces is never seen but still costs lines and
draw work, and a turning showcase hid how the object really looks in a
room. Of three pillar looks tried (a solid shaft with traces, a cable
bundle round a glowing rod, an open lattice with rising bits), the shaft
read best; data on one face only keeps it calm as room dressing. It was
then made glass like the crates, and rooms get only that one version.
Characters and pickups that turn in play keep full detail.

### D116 — 2026-09-30 — One glass helper for everything glass
Glass objects are built with `glassBox(lo, hi, color, preset)` in
`src/render/glass.js`: the crates, the data pillar and the screen. Its
tuning lives in `GLASS`, with presets per use: `hollow` (destructible
crates) and `deco` (decorations, hiding less so what's inside shows).
**Why:** glass is spreading from crates to decorations. One helper keeps
the look the same everywhere, and the shader's rim and frost correct:
they work in a unit cell, so every box is the unit cube scaled into place
rather than a geometry of its own size. Presets keep new objects from
inventing their own glass values.

### D117 — 2026-09-30 — Decorations: the data pillar and the screen
A new object kind, `deco`, for room dressing: a fixed body that does
nothing, as big as its `look` (the data pillar 1×3×1, the screen 1×1×1),
placed with the room editor's Object tool. A decoration type has no
color: it takes the room's, as structure does (D99). It faces +z or +x,
the two sides the camera sees (D115); +z is the default and a room
object's `"face": "+x"` override turns it; in the editor, clicking it
again turns it. The pillar is always 3 high.
**Why:** one kind with a look, like enemies, keeps the engine generic:
a new decoration is a look and a size, not a new class. Solid bodies
match what they show, so the wizard never walks through a pillar, and
the fixed-body code (collision, bolts, standing on it) is the core's.
Without their own color, decorations never break the color rules (the
screen's blue would sit too close to Frostbyte's ice blue as a rule
color) and always suit their biome. A fixed height for the pillar keeps
rooms consistent; it fits every room at least 3 high. Only two facings
are needed because the hidden sides are never seen.

### D118 — 2026-09-30 — Screen texts: hints and lore in the terminal
A screen may name a text (`"text": "<id>"` on the room object), kept in a
new file, `data/lore.json`: an optional title and 1–6 lines of at most
48 characters. When the wizard comes near the screen (within 1 unit in
front of it, at its side or on top), his terminal prints the text in the
screens' blue, once per visit to the room: a respawn doesn't repeat it,
coming back does. It is a block of its own in the terminal: messages
don't push it off, it stays until it could be read (12 characters a
second, at least a message's hold) and fades at once; a newer text
replaces it. A screen with a text not read yet blinks a light on its top
and scrolls faster. The room editor picks a screen's text from a list,
writes a new one, or changes one (every screen showing it changes);
lore.json is saved with the rooms and its changes are part of the room's
undo steps. Only screens show texts. Nothing is saved: the save holds
what the wizard has, not what he read.
**Why:** hints and story need a place in the world without a new
system: the terminal already speaks to the player. Texts live in their
own file, not in `strings.json` (which is the game's own words) or in
the room (a hint may repeat in several rooms). Proximity rather than a
use key: the game has no interact action, and walking up to a screen is
reading it. Once per visit so a screen by the path doesn't flood the
terminal; short texts only, because the terminal is a few lines at the
screen's corner (a reader panel that pauses the game was left out). A
codex of texts read was left out too: it would need save bits for what
isn't an item.

### D119 — 2026-09-30 — An enemy is all its template; a color per template
A room places an enemy from a template in `defs.json` and gives it only
its cell and, for a patrol or a chaser, its path: no `overrides`, and a
path has no speed of its own (the template's speed counts). Every
template has a body color of its own, at least 0.09 apart from every
other in OKLab (`MIN_TEMPLATE_COLOR_GAP`, checked by
`tests/colors.test.js` on the shipped data, not by the loader, so test
fixtures may share colors). The checks on what could never happen (a
chaser without an aggro range, a charged attack out of its reach, a
peaceful one firing) move from the room's enemies to the templates. The
templates start as one per look, named after it (13), from the
templates and the Menagerie's overrides of before; `shooter`, `tower`
and `ricochet` went (the tower is the cron). Test rooms that used
overrides now use the plain templates and behave differently in places;
variants are to be made as templates of their own. The room editor's
Enemy tool only picks a template; templates are to be edited in a
monster editor of their own (`tools/monster-editor.html`, next).
**Why:** templates grew complex, and per-room overrides made enemies that
looked alike behave differently from room to room: the player can't
learn them. One behavior per template, one color per behavior, makes an
enemy readable at a glance and keeps tuning in one place. A test (like
the D99 color rules) rather than a load error keeps the rule on the real
roster without forcing a color on every fixture.

### D120 — 2026-09-30 — The monster editor
Enemy templates are tuned in a tool of their own, `tools/monster-editor.html`
(dev server only, not built, like the world map): a list of templates, a
form made from `defs.schema.json` showing where each value comes from
(own, a base template, the default), a live preview with the game's
models (walking, noticing the wizard, attacking in a loop), variants and
copies in a free color, rename (rooms follow), delete (only unused),
undo, and the color check. Save sends `defs.json` and the rooms a rename
changed. The room editor only picks templates; it takes in templates and
rooms another page saved (rooms with unsaved edits there are kept and
flagged).
**Why:** with enemies all their template (D119), tuning moves out of the
room editor, whose panel had grown an override form; a tool of its own
has room for every field, their descriptions and a preview of the
behavior, not just the look.

### D121 — 2026-09-30 — Home Lattice settled: a kernel city, enemies in tiers
The first biome settled in Phase 4b's per-biome review (D108): Home
Lattice is the Grid's kernel, a clean, orderly, technical city, the
reference every other sector twists. Its enemies come in tiers: a new
peaceful `glowbug` (extends `bug`, pale gold `#ffd27a`, harmless and
bouncy, a friendly springboard), the hostile bug patrolling a fixed path
(bouncy too), and virus, sentinel and cron, all hostile. Virus turns
violet (`#b35cff`, was yellow) and sentinel sky blue (`#4fa8ff`, was
orange); daemon (`#c79bff`), golem (`#a0a8c0`) and pixie (`#ff9a5a`),
not yet placed in a biome, move to keep every template its own color
(D119) and get their real colors with their biomes. Planned for the
Phase 5 visual pass: data flows running along the floor grid in and
around the room, random 1×1 glass panels in the back walls (new on every
entry) showing the flows outside, and possibly a core heartbeat. Each
biome is settled the same way: look, enemies, signature trick, later
effect (docs/design.md, Biomes).
**Why:** yellow and orange sat 0.12 and 0.09 (OKLab) from the amber rooms
and blended into them; cool colors make the hostile ones pop in the warm
city. A peaceful bug gives the safe sector life and a harmless first
enemy to learn on, with no engine change (any hostility and bounce
combine, D80). The glass panels are looks only, so a new random set per
entry costs nothing and keeps rooms from looking stamped.

### D122 — 2026-09-30 — The sectors at a glance; Outer Buffer
Before settling the remaining biomes one by one, a high-level map of all
six: each has a theme, an enemy family and one mechanic of its own
(docs/design.md, Biomes). Glitchmire becomes the heavy virtual sector
(pixel and geometric monsters that split, morph and hop; later low-res,
moved from Frostbyte). Abyssal Buffer becomes **Outer Buffer**, dark space
beyond the Grid (id `outer_buffer`; things that orbit, fall and pull;
later low gravity and darkness with a light round the wizard; the stars
move here from Phantom Partition). Phantom Partition becomes the ghost
sector (low glowing mist; ghosts that phase, mirror and haunt).
Frostbyte Wastes (slowing, freezing; later slippery ice) and Firewall
Citadel (armored guards) stay. The looks already made are spread over
the sectors, and Firewall Wardens are bosses for any biome, Home Lattice
too. The deep-sea and nature ideas, Bitrot and Z-Fighter are dropped for
now.
**Why:** settling biomes one at a time without a map risked sectors that
overlap; a theme, an enemy family and a mechanic of its own per sector
keep them apart. Space, heavy virtual and ghosts were the author's three
wishes and fit the existing sectors' setup (low gravity, pixelation,
the special sector). Bosses anywhere let every sector close with one. The per-biome passes
wait for the end of Phase 4, once the spells and game concepts they
build on are ready.

### D123 — 2026-09-30 — The memory stack; walls are stacks
A third decoration (D117), the memory stack: a 1×1×1 cell of glass
memory plates with chips on a spine, a read/write light rising past them
and plates writing now and then. Stacks placed side by side and on top of
each other make a memory wall; there is no height option and no wall
object. The look takes its light's timing from its cell, so a wall's
plates line up and the light climbs and runs across it as one.
**Why:** chosen in the showcase from six drafts (three memory looks,
three relay nodes); the author wanted a decoration that also builds
walls. A cooling vent was dropped first: it doesn't fit a virtual grid.
One 1-cell piece keeps data and editor unchanged (decorations already
never fall and may stand on anything) and lets a wall take any shape.

### D124 — 2026-09-30 — Pull: the first crate or enemy in line, one cell
Pull (slot 10, 15 energy, pale mint `#a6ffcf`, early in the world with
Blink and Pause) takes the first crate or enemy in line the way the
wizard aims, at his level, within 6 cells; a block, the room's side or
another body first stops the line, holes don't. The target slides one
cell towards him per cast: a crate as if pushed (nothing on it, into a
free cell), any live enemy, frozen or not, over anything, so it can be
pulled into a hole; pulling alarms it and he gets the blame (D81). Right
in front of him, or with nowhere to go, it fizzles. A tractor beam of
pixel rings and a marquee on the target; an aim marker while selected.
Test room Tractor Bay, east of Cache Hall.
**Why:** the author's picks among the proposals. A line to the first
thing, like Warp's, is easy to read and aim; one cell per cast keeps the
puzzles exact (each cast a move, like a push). Taking any enemy makes
Pull a tool against them too (into a pit, off a plate), and the blame
keeps it from being free. The mint keeps the beam readable on the lime
crates and the green bug.

### D125 — 2026-09-30 — Compile: a crate for 7 seconds
Compile (slot 7, 50 energy, gold `#ffe45c`, late in the world) puts a
crate of the dashed crate type into the free cell in front of the
wizard at his feet, where Paste would put one. It is an ordinary crate
while it lasts: it falls, plugs a hole, can be pushed and pulled. After
7 s (blinking for the last 2) it derezzes; what stands on it falls and
a hole it plugged opens again. Any number may stand at once; Cut &
Paste can't take one. No free cell: it fizzles. Gold bits fly from his
hands into the cell as it grows in; an aim marker shows the cell. Test
room Build Yard, east of Tractor Bay.
**Why:** the author's picks. A crate rather than a floating block keeps
one set of rules (D4) and no free-standing stairs: a step is one high,
a gap is crossed by plugging its holes. Cheap and short-lived, it is a
tool to use often, not a lasting change to the room; no cap on how many,
since the 7 s already limits it. The crate stays lime (pushable, D99);
the gold marks the spell.

### D126 — 2026-09-30 — One derez for everything that is gone
The wizard's death, enemy pops (13 looks), collapsing blocks,
destructible and compiled crates and taken pickups share one pixel
burst (`derez-fx.js`): pixels start spread through a body box standing
on the thing's feet, a few ticks apart, drift out from its middle and
up, and shrink away in 48 ticks, all the same pixel size. A caller
gives only the body (which also sets the pixel count) and the colors:
its own, white as the second where it has only one. Blocks' pixels rise
now, where they used to tumble down. Effects that carry pixels
somewhere (Cut & Paste, Compile's bits, Pull, Warp, sparks, install)
stay their own.
**Why:** the author's proposal. Five bursts had grown apart (different
motion, timing, pixel sizes, per-look pop settings); one look reads as
one rule of the Grid, "gone is derezzed", and a tweak in one place now
changes them all. Rising suits a digital derez better than falling
rubble.

### D127 — 2026-09-30 — One stream for pixels a spell carries
Cut, Paste, Compile and Warp share one stream (`stream-fx.js`): between
two ends, each a body box (as a derez's, D126) or a point (his hands),
each pixel leaves its own spot of the start, staggered over 40% of the
stream's time, and flies on a slight arc to the same spot of the end;
full size at a body, where it waits before leaving or after arriving,
small at a point. The count comes from the bigger body, the pixel size
from the derez. A spell gives only the ends, its duration and colors.
Pull's ring beam, the install spiral, Zap's sparks and the Blink kick
stay their own.
**Why:** the author's proposal after D126. Four streams had grown apart
(arcs, pixel counts and sizes, lattices); one reads as one rule, "a spell
moves data", and tunes in one place. Pull stays a ring beam (the
author's pick): its rings tell it from Cut at a glance.

### D128 — 2026-09-30 — Scan: fake blocks and hidden exits
Scan (slot 9, 15 energy, violet `#8f6bff`) sends a square wave from the
wizard's feet over the grid, at every height, out to 6 units along x and
z in half a second; what it reaches is revealed, nearest first, and stays
revealed until the room resets. It never fizzles. Two things hide from
it: fake blocks (block type `fake`, a static plain block drawn in one
mass with the others) derez when reached, so what stood on them falls;
hidden exits (`"hidden": true`) are solid wall, drawn as wall, until
reached, then their patch of wall derezzes and the doorway shows (a
locked one is a lock from then on). The exit he came in through is never
hidden. A pickup may lie inside a fake block: that is the hidden pickup.
Test rooms Hidden Layer, east of Build Yard, and Secret Cache behind its
hidden exit.
**Why:** the author's idea (hidden exits that appear on a scan, fake
blocks that vanish). A wave with a range makes it a search, cast where a
room looks suspicious, not a free map of every secret; square suits the
grid. Revealed things stay for the visit so a doorway never closes on
him and a vanished block never reappears inside him; the room reset
already brings secrets back. Fake blocks are static grid cells, not
objects, so their edges merge with the plain blocks round them and
nothing gives them away. A pickup inside a fake block covers "secret
pickups" without a new pickup state.

### D129 — 2026-09-30 — Fork: a decoy of the wizard
Fork (slot 8, 25 energy, blue `#4d8bff`) stands a hologram of the wizard
in the free cell in front of him (where Compile puts a crate) for 10 s.
It is no solid body: nothing collides with it or harms it. It holds a
floor plate down, and a hostile enemy that sees it goes for the nearer of
it and him (the decoy wins a tie): it chases, faces and aims at that
focus, so bolts and arcs fly at the decoy. One at a time, a new fork
replaces the old; a new room has none. Test rooms Decoy Lab, north of
Build Yard, and Decoy Vault behind its locked exit.
**Why:** the roster's Fork (D88): a second body for puzzles (a plate he
can't reach himself) and for combat (draw a sentinel's bolt, pull a
virus away). Ghost-like and harmless keeps the rules small: no health, no
blocking, no cleanup but the timer. Casting it in front of him, like
Compile, makes it aimable and needs no new input. The nearer-wins rule
keeps enemies from ignoring him when he stands next to them.


### D130 — 2026-09-30 — Roadmap: a Home Lattice playtest first
Phases re-cut. Phase 4 keeps the reachability checker, design skills and
subagents, and the Firewall Wardens (two Lattice bosses: one drops a
fragment, one an upgrade), and closes as v0.4.0. Phase 5 (v0.5.0,
Playtest 1) finishes Home Lattice with sound: about 25-30 rooms, 16
fragments for Level 1 plus a few extra in secret or optional rooms, two
bosses, the author's music, quality presets, onboarding and a debug-info
copy. Two Level 1 exits open onto Glitchmire and Frostbyte Wastes as
teaser rooms only. Biome rosters, the secrets ladder and the other
sectors move to Phase 6; polish, gamepad, rebinding and biome effects to
Phase 7. The Outer Buffer becomes the special sector for secrets and
optional rooms (was Phantom Partition), and the 16-secret room goes
there; Phantom Partition becomes a late regular sector. Real-content
rooms are drafted unflagged by Claude, refined and flagged authored by
the author; old test rooms move to a dev-only wing, none deleted
(adjusts D45 and D90 for content production). Refines D61, D105, D108
and D122.
**Why:** the basic gameplay is done, and feedback on one polished sector
is worth more than six half-built ones. The Outer Buffer's lonely dark
suits hidden rooms; Phantom's ghosts suit a late fight sector. The
checker and review tools come first because 30 rooms cannot be checked by
hand.


### D131 — 2026-10-01 — The reachability checker: cells, crates as a puzzle, abilities as a fixpoint
`npm run check:reach` (`tools/check-reach.js`, in CI and the deploy) searches
every room as whole cells and the world as a fixpoint. A room: standing
cells (two free cells above, a floor under), walking, stepping off ledges,
a jump up one block or over a one-tile gap, and with abilities more: the
double jump (up two, over two tiles), Blink (3 cells ahead), Warp (to the
first stop), Compile (a step up, or a plugged hole), Pull, Cut & Paste, a
scan (fake blocks and hidden exits), Zap (targets), Fork or Compile (a
plate). Crates are searched as a puzzle: every position they can be
pushed, pulled or pasted into is a configuration with its own flood, up
to 500; the search stops as soon as everything in the room is reached.
The world: from the start room with nothing, every entered room is
searched with what he has, the pickups found add abilities (disks,
upgrades), fragments and the core raise the access level, the exits
reached open the rooms beyond, round after round until nothing changes;
the rounds are the order the world opens in. A pickup, an exit or a room
that stays out of reach is an error (exit code 1); rooms not joined to
the start, the world holding fewer fragments than the core asks for, a
cut-off crate search, and a room whose way back is missing (arrived on a
ledge) are warnings. One room at a time (no need to check them all
while designing): `check-reach.js <room>` reports only that room, with
what each exit and pickup needs (the world is still searched to know what
he has by then); `--with a,b` skips the world and takes the abilities
given, from the spawn point or `--from <exit>`. `--rooms` lists what each exit and pickup needs:
the smallest sets of one or two abilities from what he finds in the
world, measured from the way he first came in. The world map tool shows
the errors and warnings under CHECKS.
Left out on purpose: enemies and their fire, timing (collapsing blocks,
platforms' waits, spell durations), energy, which way he faces. Moving
platforms count as floor along their whole path, a scan reaches every
fake block, and Compile crates last as long as needed. So the verdict errs
towards "reachable": unreachable is a real problem, reachable is not a
promise (playtests and the design checklist still apply).
**Why:** 30 rooms cannot be checked by hand (D130), and the unclear part
of D67 is the order: an exit that waits for a spell must have the spell
somewhere he can get first. Plain cells and a bounded crate search are
simple to read and test, and fast (the whole world in under a second); a
physics replay would be exact but slow and brittle against tuning. The
fixpoint gives the order for free and the per-target ability sets feed
the room design skill and the review subagent (4.2).

### D132 — 2026-10-01 — Design skills and the level-review subagent live in `.claude/`
Step 4.2 adds `.claude/skills/room-design` (format, coordinates, types,
tuning numbers, design rules, the check loop with `validate:data` and
`check:reach`, annotated example rooms, the authored-room rules of D90),
`.claude/skills/enemy-design` (template axes, charged-attack rules, the
D119 color rules, placing enemies) and `.claude/agents/level-review.md`,
a read-only subagent that runs the checks and walks a room against the
room design checklist, reporting blockers, problems and notes. The
skills point to the schemas, `docs/design.md` and the checklist rather
than copying them, and repeat only the numbers a draft needs. A
room-drafting subagent is left for Phase 5's content steps, when the
Lattice plan (4.3) says what to draft.
**Why:** 25-30 Lattice rooms will be drafted and checked by Claude
sessions that start cold; the rules were spread over CLAUDE.md, design.md
and the schemas. One entry point per task, with the checker in the loop,
makes drafts consistent and keeps review cheap. Pointers instead of
copies keep a single source of truth.

### D133 — 2026-10-01 — Home Lattice plan: a web around the core, as a draft
Step 4.3 settles the paper design in [lattice-plan.md](lattice-plan.md):
about 30 rooms (25 normal, 5 Outer Buffer secrets), a new start with a
four-room tutorial (the old test rooms and Boot Sector go to the dev wing),
an Atrium hub, four wings (Shield, Pause, Scan, Fork; Zap in the
tutorial), the core behind boss 2 with Level 1 locks to the double jump
vault and the two teaser sectors. 16 fragments in normal rooms, none
behind Level 1 or boss 2; two secret rooms hold extra fragments (18 in
all). Boss 1 drops a fragment, boss 2 an energy buff. Pull, Compile,
Blink, Warp, Cut & Paste and Firewall stay out of the Lattice; the double
jump is the Level 1 reward. Some secrets need tools the Lattice does not
give and wait for a return visit (D67).
The whole list is a proposal: rooms, exits and fragments change during
the author's room review and design.
**Why:** a hub with cross-linked wings gives branching and backtracking
instead of a line, keeps the first playtest to five simple spells, and
lets the drafting steps (5.5 to 5.9) start from an agreed list.

### D134 — 2026-10-01 — Bosses: one cell, a boss bar, one pattern each
Step 4.4 settles the two Lattice bosses with the author.
- **Body:** one cell on the floor, one or two cubes high; no multi-cell
  bodies, no multi-cell claims, so pathfinding and collision stay as they
  are. Boss 1 has the bug body, ringed by three gold circles like the
  core's; boss 2 is a bigger virus two cubes high (it cannot be jumped,
  only gone round). Snake-like segmented bosses are an idea for later.
  The Warden knight look (D107) stays for ordinary combat rooms.
- **Boss mark:** three gold rings round a body is how a boss is told
  apart. It is a mark, not a look: any template gets it from a `boss`
  block (its look stays as it is, so later bosses reuse a normal body, a
  virus, a worm, a wyrm, in its own color), and one small render helper
  (`render/boss-mark.js`, sized to the body's height) draws it for every
  boss, the showcase included. Boss 2 carries it too.
- **Damage:** the HUD shows a boss bar while a boss is awake. Pause never
  freezes a boss (`pausable` false). Boss 1 can always be hit but has
  high integrity; no visor. Boss 2 is armored (below).
- **Boss 1 (drops fragment 7):** shoots aimed bolts at the wizard and
  from time to time teleports to another cell of its arena, which forces
  him to take cover and retarget. The arena has blocks that stop bolts
  (cover) and no shrine (D104). It shoots faster and teleports more
  often as its integrity drops.
- **Boss 2, the Gatekeeper (drops the +10 energy buff, D133):** it walks
  straight at the wizard's position (or a Fork decoy's, D129); next to
  him it winds up a charged, strong surround attack (a burst all round),
  with a long windup he can step out of. It is immune to every spell
  except while it stands on an overload plate of its arena (a held floor
  plate, D75), where its armor opens; he leads it over a plate by
  walking, and a decoy beside a plate holds it there. Because it chases
  him, no pulling or special luring is needed. Later phases wind up
  faster. It needs no Fork, so reaching the Gatekeeper through the Scan
  wing first is not a dead end.
- **Engine (4.5):** a `boss` block in a template: the bar, phases by
  integrity thresholds with an attack pattern each (bolt, teleport,
  chase, charged burst), a "vulnerable only on a plate" mode; `size`
  height for a taller hitbox. Nothing else about the grid changes.
**Why:** one-cell bodies keep the grid claims, enemy pathing and the
reachability checker as they are, and let two different boss ideas (cover
and retargeting; luring) carry the fights, one per boss, rather than one
big engine step. A visor and a bar make the fight readable.

### D135 — 2026-10-01 — The boss engine: a boss block, phases, drops
Built in step 4.5, from D104 and D134.
- **Template:** a `boss` block in an enemy template makes it a boss:
  `phases`, each starting once its integrity is down to a share
  (`from`; the first has 1) and changing any of the template's fighting
  values (movement, attack, speeds, ranges, charge, cooldown, bolts,
  damage) plus `teleport` (seconds between jumps); `armor` `none` or
  `plate`. `height` (any template, 0.6 by default, up to 1.9) makes a
  taller hitbox in the same one cell; above 1 the cell above must be
  free. A boss is hostile, may take more than 15 integrity, is never
  frozen by Pause nor dragged by Pull. Validation checks each phase as
  the enemy it makes.
- **Awake:** a boss wakes when it first sees the wizard or is hit, and
  stays awake: its bar shows (top middle: name from `strings.json`
  `boss.<template>`, integrity in its color, a tick per later phase,
  dimmed while plate armor is shut; it lingers 1.5 s once beaten), and
  its teleport clock runs.
- **Teleport:** half a second: it narrows to a line, jumps to a free,
  safe cell of the floor it stands on at least 3 units from the wizard
  and his decoy, preferring a cell that sees him, picked by its own
  seeded dice (so a room plays the same each time), and comes back.
- **Plate armor:** spells, discharges and bolts glance off ('armor')
  unless it stands on a floor plate (any plate object); it does not
  stop plates working.
- **Drop and defeated bit (D104):** a room gives its boss the id of one
  of its permanent pickups (`drop`). The boss holds it unseen; beaten, it
  lets it fall into its own cell (a banner and a terminal line), and
  once its bit is found the boss is left out of the room. One boss a
  room, no shrine with it.
- **Open doors:** a boss never locks its arena's doors: the wizard may
  retreat through any exit at any time, and the room resets when he comes
  back anyway. A locked exit in a boss room follows the usual switch
  rules (D75).
- **Look:** a taller body draws its model bigger (at most 1.6 times, so
  it keeps within its cell); `render/boss-mark.js` puts the three gold
  rings round any boss, drawn in while plate armor is shut, spread and
  spinning when it opens. Plate armor shows as a shell round the body:
  a white dashed box, the plates' own look (a mechanism, D99), that
  flashes when a hit glances off and lifts away when the boss steps on
  a plate (from review: the vulnerable moment must be plain to see; the
  plates themselves stay as they are). A teleport squeezes body and
  rings.
- **Test arenas:** `boss_arena` (a prototype of boss 1, `proto_warden`)
  and `boss_plates` (of boss 2, `proto_gatekeeper`), test rooms off
  Build Yard (D90); 4.6 and 4.7 turn the prototypes into the bosses.
**Why:** the bosses differ by data, not code: the phase overrides reuse
the existing movements and attacks, so boss 1 and 2 need only teleport
and plate armor besides. The drop stays at an authored cell, so the
reachability checker and the room designer see where it falls. Open
doors (the author's call at review) keep a fight escapable; the room
reset makes retreating cost the fight, nothing more.
