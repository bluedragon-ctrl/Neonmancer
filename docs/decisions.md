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
starts in the saved room with the room reset, full backups and an empty
clipboard; integrity comes from the key. Phase 4a: access keys, title
screen and pause menu, saving and loading, the map screen. Phase 4b: the
spells Compile, Fork, Scan and Pull, Firewall Wardens, the reachability
checker, design skills and subagents.
**Why:** loading resets the room anyway, so a save anywhere gives nothing
away; 4a gives players saves sooner.

### D106 — 2026-09-29 — Access keys in hex
The key is 168 bits (format version 4, room 8, access level 8, pickups
128, integrity 4, CRC-16 16), 42 hex digits in groups of 6. The payload
is XORed with a stream seeded by the checksum, then every bit moves by a
fixed shuffle. Input forgives spaces, dashes, lowercase, O for 0, I and L
for 1. Replaces Base32 in CLAUDE.md §8.
**Why:** the key is copied, not typed; hex is simpler to read and debug
than a custom alphabet (Base32 without 0/O/1/I/L has only 31 symbols).

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
The game opens on a title screen over the start room (dimmed well down,
standing still): Start, Options and Controls; Enter key joins it with
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
