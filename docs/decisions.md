# Decision log

Each entry: number, date, the decision as it stands now, and why; kept
short. Numbers are stable (code, tests and docs cite them) and never
reused. When a decision changes, update its entry (or add a new one and
shrink the old to a one-line pointer, "replaced by Dn") and update
CLAUDE.md if it is a locked decision; the old wording stays in git
history and the discussion in the entry's pull request (D176). The
details of what was built are in docs/design.md; room layouts are in the
room files.

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
The composer renders into half-float buffers with MSAA (4× at most, see
D76, D169); all effects share one `EffectPass`.
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
`tint`, overridable per object.
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
body and hat magenta, head and hands cyan; drawn as a hologram (D22).
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

### D26 — 2026-09-25 — Flip-screen exits keep the offset
The wizard arrives half a cell inside the matching exit, keeping his
offset, height, fall and facing. Objects can't leave a room; the first
row inside an exit must be free. (Respawn point: D39.)
**Why:** joined rooms feel continuous; objects would be lost on reset.

### D27 — 2026-09-25 — Room transitions fade through black
Fade out 0.2 s with the world frozen, fade in 0.25 s already playable;
the veil sits under the HUD.
**Why:** author's request; an instant swap felt abrupt.

### D28 — 2026-09-25 — Exits: the destination's color, dashed streams, arrows
Exits are marked in the color of the room they lead to. Behind every back
doorway a short dark tunnel hides the outer grid, and dashes flow from the
doorway into it along its corner edges and two floor lanes, fading to
black. Front exits get one small gliding arrow per tile of width, within
the first row. No floor stream or proximity glow.
**Why:** exits read at a glance and hint where they lead; the author
picked the doorway stream side by side in the showcase; bigger effects
covered too much floor.

### D29 — folded into D28
### D30 — folded into D28
### D31 — folded into D28
### D32 — folded into D28
### D33 — folded into D28

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

### D38 — 2026-09-26 — G toggles screen-relative movement
`G` toggles grid and screen-relative movement, announced and shown as a
HUD tag; not saved.
**Why:** author wants it for players who find grid controls harder.

### D39 — 2026-09-26 — Each room defines its own death-respawn point
Optional `reset` point per room (default `spawn`); dying always respawns
there, whichever door he came through.
**Why:** a designed spot is easier to reason about with several exits.

### D40 — 2026-09-26 — Static block types live in the grid; changing blocks are room objects
Blocks that never move or change (hazard, void, fake, fence) are grid
cell types; things that move (platforms) are room objects; gate blocks
are painted as blocks but run as room objects (D60, D141).
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

### D43 — 2026-09-26 — Damage rules; what every step adds
Every damage source goes through `Game.hurt()`, ~1 s invulnerability with
blinking, no knockback, death at 0; a squeezing platform shoves or hurts,
never kills; platforms and patrols share one path format; X-ray for the
wizard only. Every step adds showcase entries for new looks, a dev room
for a new mechanic, tests and docs.
**Why:** author's review; fixed rules keep each step focused.

### D44 — 2026-09-26 — Hazard and void contact rules
Hazard contact: overlap on two axes and within 0.02 on the third
(standing or leaning counts, a corner doesn't), through `Game.hurt()`.
Void kills when grounded with the feet center over it, like a hole.
Animated shader looks, steady edges, a flare when a hazard hurts (void
look: D99).
**Why:** walls hurt on contact without punishing a near miss.

### D45 — replaced by D147 (the dev wing)

### D46 — 2026-09-26 — Moving platforms: path format, riding, waiting and squeezing
Paths start at `at` and run through `points`, axis-aligned legs,
`pingpong` or `loop`, `speed`, `pause`. A platform carries the wizard and
crates, waits for anything in its way, shoves the wizard at most 0.35 per
tick and, pinned, hurts him and waits. One dim guide line.
**Why:** simple validation and grid alignment; a jammed lift is a puzzle;
never instant death.

### D47 — replaced by D141 (collapsing blocks are step gates)

### D48 — 2026-09-26 — Enemies: cell-by-cell physics, hostility and bounce
Enemies move one cell at a time, fall, ride platforms, turn back when
blocked and pop in holes and on void. The wizard walks through them;
touching a hostile one hurts; landing on a bouncy one launches him 2
blocks up. Eye color shows hostility. (Templates: D78, D119.)
**Why:** grid movement avoids edge cases.

### D49 — replaced by D178 (no far-room warning)

### D50 — 2026-09-26 — Every bug bounces; a drop shadow only under the wizard
`bounce` is true on bugs; falling objects' shadow is off
(`DROP_SHADOWS.fallingObjects`).
**Why:** the ball already reads as bouncy; one shadow reads clearer.

### D51 — 2026-09-26 — Solid enemies block, carry and shove the wizard
A `solid` enemy blocks him like a crate, carries him and shoves him (at
most 0.35 per tick); pinned, it turns back.
**Why:** enemies to avoid or ride, set by data.

### D52 — 2026-09-26 — Zap: aim and what stops a bolt
The bolt flies level from his hands the way he last walked or turned and
stops at the first enemy, block, object or room side; it hits peaceful
enemies too. A bug takes two Zaps. (Energy numbers: D72.)
**Why:** one cast key; crates stay useful as cover.

### D53 — 2026-09-26 — Destructible crates
A pushable type may have `integrity`; at 0 it breaks until the room
resets. (Look: D99.)
**Why:** author's request.

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

### D58 — replaced by D79 (every enemy type is a template)

### D59 — 2026-09-27 — Room editor: the view cuts at the layer
**Hide above** leaves out what is above the edited layer. (Templates are
edited in the monster editor, D120.)
**Why:** higher blocks hid the layer.

### D60 — 2026-09-27 — Block types are open, data-driven types
`defs.json` `blocks` is an open map of types: properties the engine
understands (`damage`, `lethal`, `seeThrough`), a look, a color,
`extends` (one level). The engine asks properties, never names. A type
with a `kind` (`gate`, D141) is painted like blocks but runs as room
objects (id `<type>@x,y,z`). One Block tool in the editor.
**Why:** new block types become data; the engine grows by behaviors.

### D61 — 2026-09-27 — Six biomes: a core, four side sectors, one special
Home Lattice (core), Glitchmire, Frostbyte Wastes, Firewall Citadel,
Phantom Partition and the Outer Buffer (special: secrets and optional
rooms, D130); looks only for now. (Themes: D122; colors: D99.)
**Why:** author's request; room colors avoid gameplay colors.

### D62 — 2026-09-27 — Biomes set the room's surroundings too
A biome's optional `look`: `background`, `outerGrid`, `outerFade`,
`wallGrid`, `bloom`; defaults are Home Lattice's.
**Why:** cheap values already in the renderer set the biomes apart.

### D63 — replaced by D122 (Abyssal Buffer became the Outer Buffer)

### D64 — 2026-09-27 — Edges between block types
All plain types are one mass for the corner rule, each edge in a
neighbouring type's color; hazard and void outline themselves, drawn
alone where they meet plain blocks.
**Why:** seams only where they mean something.

### D65 — replaced by D130 (the phase plan)

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

### D68 — 2026-09-27 — World targets: towards 128 rooms, spells, buffs, access levels
Towards 128 rooms (many small ones), up to 16 spells and 16 upgrades
(D88), buff items, access levels and ability gates. The save holds the
wizard, not rooms (no map, no per-room data).
**Why:** many small rooms suit flip-screen exploring; a short key.

### D69 — replaced by D75 and D140 (switches)

### D70 — 2026-09-27 — World map tool: positions format, who saves what
`positions`: room id → `[x, z]` (+x east, +z south). The room editor owns
connections, the map positions (merged on save, disk wins). A new room
gets the nearest free cell. `?room` and `?edit` work in the dev server
only.
**Why:** no stale copy undoes another page's save.

### D71 — 2026-09-27 — Pickups: save bits in blocks, the Zap disk, refills
Save bits come in blocks per kind; a bit is the item, not the place. The
index lives on what the item unlocks (a spell's `slot`). Integrity and
energy refills. The disk: a white slab with a 4×4 bit grid, the slot lit
in the spell's color.
**Why:** countable items; a disk can wait on both sides of a gate.

### D72 — 2026-09-27 — Energy in whole units, a bar in segments of 10
50 energy, one unit back every 12 ticks; Zap 10; refill 30. The bar is
segments of 10 whatever the spell; costs are multiples of 10; hidden until
a spell is known.
**Why:** the bar keeps its shape when switching spells.

### D73 — 2026-09-27 — Data disks: install animation, the Shield spell
Taking a disk plays a 1 s scan (bits spiral in, rings sweep up him, a
white flash) without freezing him. Shield (slot 1): a lightning ring for
7 s. Each spell has a `color` in `defs.json`. Found disks spin without
the bob.
**Why:** a reward moment; the author's playtest asked for no freeze.

### D74 — folded into D73

### D75 — 2026-09-28 — Switches: targets, floor plates, locked exits
A target (Zap toggles it) and a plate (on while something stands on it).
A locked exit opens while its conditions hold (D175), never closes on the
wizard, and the exit he came in through stays open for him. (Links and
timers: D140; look: D143.)
**Why:** author's choices; every room stays leavable the way he came.

### D76 — 2026-09-28 — Automatic quality fallback; shaders compiled ahead
Two slow 2 s windows (below 50 fps) step MSAA 4 → 2 → 0, then render
scale 0.75 → 0.5; never back up; `?msaa`/`?scale` turn it off. Shaders
compile ahead, hidden objects included, for the composer's buffer.
(High-DPI: D169.)
**Why:** weak GPUs pay for resolution × MSAA; extra full-screen passes
are costly, effects in the existing pass nearly free.

### D77 — 2026-09-28 — World map tool adds and removes rooms and connections
Move, Add, Connect and Delete tools; connected rooms get 2-wide exits in
the middle of their facing walls; everything is saved together, all or
nothing.
**Why:** sketching the world's layout is quicker on the map.

### D78 — 2026-09-28 — Universal enemies; chase and discharge; Viruses and Sentinels
An enemy's `look` is a field beside `movement`, `attack` and `color`, and
any combine. `attack`: `touch`, `burst`, `arc`, `bolt`, `none`. `chase`:
a hostile enemy follows the wizard while it sees him within `aggroRange`,
searches where it lost him, then goes home. Charged discharges warn
before they fire. No enemy walks into a hole or onto void. A red "!" when
one notices him. Virus (chaser, burst), Sentinel (keeps distance, arc).
**Why:** new enemies are data, not code; a charged attack is fair.

### D79 — 2026-09-28 — Every enemy type is a template
Every `defs.json` enemy is a template; chains of `extends` allowed; a room
enemy names its `template`.
**Why:** linked templates: changing one changes every enemy of it.

### D80 — 2026-09-28 — Enemy review: bolt attack, alarm, routes, cell claims
`bolt` attack: a slow shot at the wizard's middle, harmless to objects.
Chasers route round walls going home and searching. An enemy never steps
into a cell another is entering. Validation: a chaser needs an aggro
range, a peaceful enemy no charged attack.
**Why:** fixes from the enemy review; the bolt reuses the Zap's entity.

### D81 — 2026-09-28 — Bolt patterns and bounces; any hit alarms
`boltPattern` (`aimed`, `cross`) and `boltBounces` combine freely. Every
hit that leaves an enemy hostile alarms it, friendly fire included, and
the wizard gets the blame.
**Why:** options keep enemies universal; stirring up a room is a trick.

### D82 — 2026-09-28 — Spiked platforms
A platform type with `damage` hurts on any touch; `spiked_platform` has
`shape: "spiked"` (pyramids within its cell) in hazard red.
**Why:** a fixed rhythm is an object, not an enemy; reuses platforms.

### D83 — 2026-09-28 — Cron, worm and crawler looks
Cron (the tower's look, emitters on the grid axes), worm (patroller) and
crawler (chaser), both touch attacks.
**Why:** looks are data; the tower shows its dangerous lines.

### D84 — 2026-09-28 — Shield blocking and the Firewall spell
The `bolt` attack covers the old Pop-up idea. The Shield absorbs bolts
and blocks arcs and bursts. Firewall (slot 2, 40 energy, 7 s) also blocks
touch and burns enemies touching it; either ring replaces the other.
Ember flames.
**Why:** Shield for shooters, Firewall for crowds.

### D85 — 2026-09-28 — The Pause spell
Slot 3, 25 energy: a bolt that freezes the enemy it hits for 5 s; a
frozen enemy is solid, harmless and still hittable, and never traps the
wizard (pushing: D154; its box: D155). A cage of corner brackets, pale
lavender.
**Why:** a skill shot like Zap; freeze-and-zap combos.

### D86 — 2026-09-28 — Blink and Warp
Both go the way he aims through open space only and land short of a
stop, fizzling against a wall. Blink (slot 4, 15 energy, 3 units) hits
enemies it passes for 2 and hurts him 1 if cut short; Warp (slot 5, 30
energy) goes to the first stop, harmless.
**Why:** a risky attack dash against a safe way across; walls stay walls.

### D87 — 2026-09-28 — Cut & Paste
Slot 6: cut a crate or frozen enemy in front of him (his level, nothing on
it; 20 energy) into a one-slot clipboard that goes with him; paste into
the free cell in front for free. Copies allowed; dying loses it. A
marching-ants marquee, an aim marker, a HUD slot; white.
**Why:** a puzzle spell with a combo; copies keep the rules simple.

### D88 — 2026-09-28 — Spell roster and upgrades
Spells Compile, Fork, Scan (slots 7–9) and Pull (slot 10, D89). Upgrades
(Zap+, Shield+, the double jump, D95) have their own save block,
replacing their base spell in the Tab cycle. Up to 16 spells and 16
upgrades; spare slots wait for content.
**Why:** new answers to puzzles; the first spells stay useful late.

### D89 — 2026-09-29 — Pull joins the spell roster
Pull (slot 10) pulls the first crate or enemy in line one tile towards
the wizard (details: D124).
**Why:** pushing only moves crates away.

### D90 — 2026-09-29 — Authored rooms: the author's real game rooms
`"authored": true` marks the author's real rooms, set in the room editor.
Development steps never change them or attach rooms to them; tests never
depend on them; changes that could affect them are listed in the PR.
Real-content rooms are drafted unflagged; the author refines and flags
them (D130).
**Why:** the author's rooms must not grow test exits; a flag promotes a
room in place.

### D91 — 2026-09-29 — Access level in the save key
The key has an 8-bit access-level field (4 used), stored, not counted.
**Why:** room to grow.

### D92 — replaced by D95 (double jump), D97 (backups) and D106 (saved backups)

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
jump. An expansion card look.
**Why:** a double jump leaves the base rules intact; names show SHIELD
becoming SHIELD+.

### D96 — 2026-09-29 — Glass crates
Every crate is frosted glass (`"faces": "glass"`), a marked crate's mark
on a small dark core inside. (Destructible look: D99.)
**Why:** crates read as material, not items; a cheap face shader.

### D97 — 2026-09-29 — Backups: 8, no rollback, reboot on the nearest shrine
8 backups, one per death. With none left the system crashes and he
reboots on the shrine nearest on the world map (|dx| + |dz|, ties to the
last used), losing nothing found. A shrine is a floor tile that refills
integrity, energy and backups, in the wizard's magenta.
**Why:** losing found items felt too harsh for the game's tone; without
lives death cost nothing.

### D98 — folded into D99

### D99 — 2026-09-29 — Color rules for objects and blocks; void as black mist
Red hurts (one `#ff2a3a`); the room color is structure (collapsing
blocks too); black is a pit (void as black mist); white is a mechanism;
cyan moves; magenta is the wizard (shrines too); neon green is pushable
(D150; a destructible crate an empty, thinner shell). Biome colors are
tested clear of them; Phantom Partition is pale violet.
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
core is a placeable object, at most one. Access-locked exits show the
level (D175). Gold hat bands show the level.
**Why:** the core is the hub he returns to; the last 16 fragments are for
the ending.

### D102 — 2026-09-28 — World map tool removes single exits
Exits are marks on their room's edge, cyan connected and magenta loose.
Delete removes one by a click on its mark: a connected exit goes with its
connection and the exit at the other end, a loose one alone; one undo
step. Connect uses a loose 2-wide exit in the facing wall, nearest the
middle, before opening a new one.
**Why:** a connection line between neighbours is short and hard to hit,
and a loose exit has no line at all.

### D103 — 2026-09-28 — World map tool: Undo last save
Before each save the map keeps a rollback point (`world.json` and every
room file the save writes or deletes, in session storage). With no edits
left to undo, Undo reads Undo last save and puts the point back as
unsaved changes. One step only; another page's save drops the point.
**Why:** a room deleted by accident was gone once saved; restoring it as
unsaved changes keeps one way to write data.

### D104 — 2026-09-29 — Firewall Wardens are bosses that always drop loot
Every boss drops one permanent pickup (never a refill), shown once it
falls. While that pickup's save bit is found, the boss is left out of its
room and counts as defeated. Shrines stay out of boss rooms.
**Why:** a beaten boss stays beaten without saving any room state (D68).

### D105 — 2026-09-29 — Saving is a player action
The player saves when he chooses, from the pause menu; a save writes the
key to the URL hash and to localStorage. Nothing saves on its own. A load
starts in the saved room with the room reset, full integrity and energy,
an empty clipboard and the backups from the key (D106).
**Why:** loading resets the room anyway, so a save anywhere gives nothing
away.

### D106 — 2026-09-29 — Access keys in hex; the room as its map cell
The key is 176 bits (format version 4, room cell x 8 and z 8, access
level 8, pickups 128, backups 4, CRC-16 16), 44 hex digits in groups of
4. The room is its cell in `world.json` `positions`, each coordinate a
signed byte. The payload is XORed with a stream seeded by the checksum,
then every bit moves by a fixed shuffle. Input forgives spaces, dashes,
lowercase, O for 0, I and L for 1.
**Why:** the key is copied, not typed; hex is simpler to read and debug.
The map cell already names a room uniquely; moving a room breaks old
keys, which matters only in development. Saving backups keeps save and
load from refilling lives for free.

### D107 — 2026-09-29 — Seven more enemy looks
Warden, daemon, golem, wyrm, phish, overclock and pixie are looks, each
with its template (D119), but no room uses them and there is no plan to
(D176); a biome's roster may pick them up. A model's `muzzle` is a reach
along the line of fire.
**Why:** more silhouettes, reviewed in the showcase first.

### D108 — 2026-09-29 — Home Lattice keeps the default enemies; a roster per biome
Home Lattice's own enemies are bug, virus, sentinel and cron (the
`tower` template), which may show up anywhere. Each other biome gets a
roster of its own, settled in Phase 6 (D130).
**Why:** biomes should play differently, not only look different.

### D109 — 2026-09-29 — Title screen and pause menu
The game opens on a title screen over the start room's empty shape:
Continue, Start, Enter key, Options and Controls. Esc or P pauses the
game, and so does the window losing focus. Quitting asks first. Options
(volume, visuals) are stored in localStorage apart from the key. Behind
a menu the game and its animations stand still. The world map tool's
dev links skip the title.
**Why:** pausing on focus loss keeps a player who switched windows from
coming back dead. Settings belong to the browser, not to the wizard.

### D110 — 2026-09-29 — A boot sequence after Start
Start plays a 2.6 s boot sequence: the logo glitches out, the room
compiles tile by tile, then the wizard pops in out of gathering pixels.
Enter, Space, Esc or P skip it. The tiles are a 2D canvas over the game,
not clipping in 3D, which would recompile every shader.
**Why:** starting should feel like being loaded into the Grid; the pixel
pop-in reuses the derez.

### D111 — 2026-09-29 — Saving and loading
**Save** writes the key into the URL hash (`history.replaceState`) and
localStorage (`neonmancer.save`); **Copy key** and **Copy link** copy it.
A valid key in the hash at start loads directly; an invalid one opens
the title with a message. **Continue** loads the last save in this
browser; **Enter key** takes a pasted key. A loaded key is never stored:
only Save stores. A map cell with no room any more loads in the start
room. The Grid-rebooted flag is not saved.
**Why:** Continue saves pasting a key in the same browser; storing only
on Save keeps "nothing saves on its own" (D105).

### D112 — 2026-09-29 — The map screen
M (or **Map** in the pause menu) shows the rooms entered in this run,
never saved. A backup shrine reveals the rooms within 2 map cells, dimmed
until visited. Visited rooms show their connections, a stub per exit to a
room not on the map yet, and their name with icons (he is here, a
fragment not found, a shrine). Drawn isometrically, east down-right.
**Why:** finding what is where is part of the game (D67), so the map only
remembers what he has seen.

### D113 — 2026-09-30 — An access pass for testing
A temporary pickup kind, `access` (`access_pass_3`), raises the wizard's
access level to its `level` when he touches it, as the core does. No save
bit, comes back with the room, never lowers his level. A gold upgrade
card with the level as its lit bit. A test item.
**Why:** access-locked exits are tedious to test when every level needs
16 fragments at the core.

### D114 — 2026-09-30 — The wizard's body language
A walk cycle (head bob, hand swing, forward lean), an idle float, an air
pose, a landing squash, a hat on a spring, and action poses (pushing,
casting, falling into a hole). All transforms of the model's existing
parts, posed by a pure function (`wizard-motion.js`); the walk cycle
follows the distance walked, not time.
**Why:** a rigid wizard looked static. Moving a few parts costs nothing;
deforming meshes was ruled out as the one option with a real cost.

### D115 — 2026-09-30 — Static objects are drawn for the fixed view
The camera never turns, so a static object shows only its top and its +x
and +z faces. Static looks put their detail there and nothing on the
hidden faces; the showcase shows them standing still.
**Why:** detail on hidden faces is never seen but costs lines and draws.

### D116 — 2026-09-30 — One glass helper for everything glass
Glass objects are built with `glassBox()` (or `glassBoxes()`, D169) in
`src/render/glass.js` with a `GLASS` preset per use.
**Why:** one look everywhere; the shader's rim and frost work in a unit
cell; presets keep new objects from inventing their own glass values.

### D117 — 2026-09-30 — Decorations: the data pillar and the screen
Object kind `deco`: a fixed body that does nothing, as big as its `look`
(the data pillar 1×3×1, the screen 1×1×1, the memory stack D123). No
color of its own: it takes the room's. It faces +z (default) or +x.
**Why:** one kind with a look keeps the engine generic; without their own
color, decorations never break the color rules.

### D118 — 2026-09-30 — Screen texts: hints and lore in the terminal
A screen may name a text (`"text": "<id>"`) from `data/lore.json`: an
optional title and 1–6 lines of at most 48 characters. When the wizard
comes near, his terminal prints it, once per visit to the room, as a block
of its own that stays until it could be read. A screen with an unread
text blinks a light. The room editor picks, writes and edits texts.
Nothing is saved. (What a text may say: D163.)
**Why:** hints need a place without a new system: the terminal already
speaks to the player; proximity because the game has no interact action.

### D119 — 2026-09-30 — An enemy is all its template; a color per template
A room places an enemy from a template and gives it only its cell and
path: no `overrides`, no path speed. Every template has a body color of
its own, at least 0.09 apart from every other in OKLab
(`tests/colors.test.js` on the shipped data). Template checks (chaser
aggro range, charged attack reach, peaceful never fires) run on templates.
**Why:** per-room overrides made enemies that looked alike behave
differently; one behavior per template, one color per behavior.

### D120 — 2026-09-30 — The monster editor
Enemy templates are tuned in `tools/monster-editor.html` (dev server
only): a form from the schema showing where each value comes from, a live
preview, variants in a free color, rename (rooms follow), delete (only
unused), undo, the color check. The room editor only picks templates.
**Why:** tuning moves out of the room editor, whose panel had grown an
override form.

### D121 — 2026-09-30 — Home Lattice settled: a kernel city, enemies in tiers
Home Lattice is the Grid's clean, orderly kernel city. Enemies in tiers:
peaceful `glowbug` (pale gold, bouncy springboard), the hostile bug, then
virus (violet), sentinel (sky blue) and cron. Planned visual pass: data
flows along the floor grid and random glass panels in the back walls.
**Why:** cool colors make hostile enemies pop in the warm city; a
peaceful bug gives a harmless first enemy to learn on.

### D122 — 2026-09-30 — The sectors at a glance; Outer Buffer
Each sector has a theme, an enemy family and one mechanic of its own
(docs/design.md, Biomes). Glitchmire: heavy virtual (split, morph, hop;
later low-res). Outer Buffer (was Abyssal Buffer): dark space (orbit,
fall, pull; later low gravity and darkness). Phantom Partition: ghosts
(phase, mirror, haunt). Frostbyte Wastes (slow, freeze; later ice) and
Firewall Citadel (armored guards) stay. Bosses for any biome.
**Why:** a map of all six keeps sectors from overlapping; space, heavy
virtual and ghosts were the author's three wishes.

### D123 — 2026-09-30 — The memory stack; walls are stacks
A third decoration: a 1×1×1 cell of glass memory plates with a rising
read/write light. Stacks side by side and on top make a memory wall; no
wall object. Timing from its cell, so a wall animates as one.
**Why:** a decoration that also builds walls, without data changes.

### D124 — 2026-09-30 — Pull: the first crate or enemy in line, one cell
Pull (slot 10, 15 energy, pale mint) takes the first crate or enemy in
line the way he aims, at his level, within 6 cells; a block, the room
side or another body stops the line, holes don't. It slides one cell
towards him per cast: a crate as if pushed, any live enemy over anything
(into a hole too); pulling alarms it. Right in front of him, or with
nowhere to go, it fizzles. A ring beam.
**Why:** a line to the first thing is easy to aim; one cell per cast
keeps puzzles exact; the blame keeps it from being free.

### D125 — 2026-09-30 — Compile: a crate for 7 seconds
Compile (slot 7, 50 energy, gold) puts a dashed crate in the free cell in
front of him. An ordinary crate while it lasts; after 7 s (blinking for
the last 2) it derezzes. Any number at once; Cut & Paste can't take one.
**Why:** a crate keeps one set of rules (D4); short-lived, it is a tool
to use often, not a lasting change.

### D126 — 2026-09-30 — One derez for everything that is gone
The wizard's death, enemy pops, gate blocks, destructible and compiled
crates and taken pickups share one rising pixel burst (`derez-fx.js`); a
caller gives only the body box and colors.
**Why:** five bursts had grown apart; "gone is derezzed" reads as one
rule and tunes in one place.

### D127 — 2026-09-30 — One stream for pixels a spell carries
Cut, Paste, Compile and Warp share one stream (`stream-fx.js`) between
two ends (a body box or a point). Pull's ring beam, the install spiral,
Zap's sparks and the Blink kick stay their own.
**Why:** "a spell moves data" reads as one rule and tunes in one place.

### D128 — 2026-09-30 — Scan: fake blocks and hidden exits
Scan (slot 9, 15 energy, violet) sends a square wave from his feet, every
height, 6 units along x and z in half a second; what it reaches stays
revealed until the room resets. Fake blocks (block type `fake`, drawn in
one mass with plain blocks) derez; hidden exits (`"hidden": true`) are
wall until reached. The exit he came in through is never hidden. A
pickup may lie inside a fake block.
**Why:** a wave with a range makes it a search, not a free map; fake
blocks as grid cells give nothing away.

### D129 — 2026-09-30 — Fork: a decoy of the wizard
Fork (slot 8, 25 energy, blue) stands a hologram of him in the free cell
in front for 10 s. No solid body. It holds a floor plate down, and a
hostile enemy that sees it goes for the nearer of it and him (the decoy
wins a tie). One at a time; a new room has none.
**Why:** a second body for puzzles and combat; harmless keeps the rules
small.

### D130 — 2026-09-30 — Roadmap: a Home Lattice playtest first
Phase 5 (v0.5.0, Playtest 1) finishes Home Lattice with sound: about
25–30 rooms, 16 fragments for Level 1 plus extras, two bosses, music,
quality presets, onboarding. Two Level 1 exits open onto Glitchmire and
Frostbyte teaser rooms. Phase 6: the other sectors one at a time. Phase
7: polish and 1.0.0. The Outer Buffer is the special sector for secrets;
Phantom Partition a late regular sector. Real-content rooms are drafted
unflagged and flagged authored by the author; test rooms go to a dev
wing (D147).
**Why:** feedback on one polished sector is worth more than six
half-built ones.

### D131 — 2026-10-01 — The reachability checker: cells, crates as a puzzle, abilities as a fixpoint
`npm run check:reach` (`tools/check-reach.js`, in CI) searches every room
as whole cells and the world as a fixpoint. A room: standing cells,
walking, stepping off ledges, a jump up one block or over a one-tile gap,
and with abilities the double jump, Blink, Warp, Compile, Pull, Cut &
Paste, Scan, Zap (targets), Fork, frozen enemies (D166). Crate positions
are searched as a puzzle (up to 500 configurations). The world: from the
start with nothing, rounds of rooms searched with what he has until
nothing changes. Unreachable pickups, exits or rooms are errors.
`<room>` checks one room; `--with` gives abilities, `--from` an exit;
`--rooms` lists what each exit and pickup needs.
Left out on purpose: enemies and their fire, timing (gates, platforms,
spell durations, timers), energy, facing. Platforms count as floor along
their whole path. So "reachable" is not a promise.
**Why:** 30 rooms cannot be checked by hand, and an exit that waits for a
spell must have the spell somewhere first. Plain cells are fast and
simple; a physics replay would be slow and brittle.

### D132 — 2026-10-01 — Design skills and the level-review subagent live in `.claude/`
`.claude/skills/room-design`, `.claude/skills/enemy-design` and
`.claude/agents/level-review.md` (read-only: runs the checks, reads a
room against the checklist). The skills point to the schemas,
`docs/design.md` and the checklist rather than copying them. A
room-drafting subagent may come with later content steps.
**Why:** rooms are drafted by Claude sessions that start cold; one entry
point per task with the checker in the loop.

### D133 — 2026-10-01 — Home Lattice plan: a web around the core
The plan ([lattice-plan.md](lattice-plan.md)): a tutorial, an Atrium hub,
four wings (Shield, Pause, Scan, Fork), the core behind boss 2 with Level
1 locks to the double-jump vault and the two teaser sectors, five Outer
Buffer secrets. Pull, Compile, Blink, Warp, Cut & Paste and Firewall stay
out of the Lattice. A proposal that changes as rooms are made.
**Why:** a hub with cross-linked wings gives branching and backtracking
and keeps the first playtest to five spells.

### D134 — 2026-10-01 — Bosses: one cell, a boss bar, one pattern each
A boss body is one cell, one or two cubes high (no multi-cell claims).
Three gold rings round any normal body mark a boss
(`render/boss-mark.js`). The HUD shows a boss bar; Pause never freezes a
boss. Boss 1 shoots and teleports, so he takes cover; boss 2 chases and
winds up a surround burst, and is armored except on an overload plate.
**Why:** one-cell bodies keep pathing and the checker as they are; two
different ideas (cover, luring) carry the fights.

### D135 — 2026-10-01 — The boss engine: a boss block, phases, drops
A `boss` block in a template: `phases` by integrity share, each changing
fighting values plus `teleport`; `armor` `none` or `plate`. `height` (up
to 1.9) makes a taller hitbox in one cell. A boss is hostile, never
frozen or pulled; it wakes on sight or hit, then its bar shows. Teleport:
to a free safe cell ≥ 3 units from him, seeded. Plate armor: hits glance
off unless it stands on a floor plate (a white dashed shell lifts away).
A room names its boss's `drop`; beaten, it falls into its cell. One boss a
room, no shrine; a boss never locks its arena's doors.
**Why:** bosses differ by data; open doors keep a fight escapable.

### D136 — 2026-10-01 — Boss one is Null Pointer
Template `null_pointer` (bug body, pink, 24 integrity, aimed bolts, three
phases that fire and teleport faster), NULL POINTER on the bar.
**Why:** the fight matched D134; it needed an identity.

### D137 — 2026-10-01 — Boss two is the Gatekeeper
Template `gatekeeper` (a virus 1.6 high, plate armor, chase and surround
burst, 16 integrity, a third phase at 30%), THE GATEKEEPER on the bar;
drops the +10 energy buff.
**Why:** the lure-over-plates fight of D134, harder than boss one.

### D138 — 2026-10-01 — The audio engine
`src/audio/` plays music through Howler (loops, 1.5 s crossfades) and
effects as ZzFX recipes or files, named in `data/audio.json`. Slider steps
0–10 map to gain squared. A sound named like a game event plays on it. A
missing entry or file is a silent stub with one warning. Only ZzFX's
generator is vendored (`audio/zzfx.js`); the context is made on the first
key or click.
**Why:** the game never waits for assets; tests run without a browser.

### D139 — 2026-10-01 — The sound effects: symbolic, not realistic
Spells and enemy attacks are electric zaps, pushes a soft swish,
derezzing a bubble pop, appearing its reverse; no realistic explosions. A
sound named `type:detail` plays for a matching event (`cast:zap`,
`pickup:disk`, `die:void`), else the plain `type`. Menus play `ui_*`
sounds. `"loop": true` sounds run while the game keeps them on (shield,
firewall).
**Why:** one coherent sound identity; recipes stay data.

### D140 — 2026-10-01 — Linked switches, gates and timed switches
A locked exit, a gate or a platform names the switches that power it and
is powered while they are all on; without a list it takes every switch in
the room. A platform with switches runs only while powered. A switch
type's `timer` makes a timed switch (a target stays on that long after a
bolt, a plate that long after release; it blinks and ticks). The checker
treats a gate that can be open and closed as never in the way and timed
switches as on for good.
**Why:** rooms can chain steps and give switches different jobs; timed
switches add "hit it, then race" puzzles.

### D141 — 2026-10-01 — Gate blocks: collapsing blocks and gates are one kind
Block kind `gate` with a `trigger`: `switch` (powered by switches) or
`step` (the collapsing block: the wizard standing on it makes it shake,
then go; `regrow` brings it back). A wall of gates is one block box, and
its `switches` link every cell. Going, they sink into the floor; they
never come back on a body.
**Why:** two near-identical mechanics would drift apart.

### D142 — 2026-10-01 — The Switch tool in the room editor
The room editor's **Switch** tool (key 0): pick a target or plate, then
click gates, platforms and exits to link or unlink them. Hovering shows a
thing's links. Alt+click with the Block tool takes a block's type and
switches. Switch gates are white frosted glass (`GLASS.gate`); one that is
off is not drawn in play, only outlined in the editor.
**Why:** links were hard to see and edit.

### D143 — 2026-10-01 — Switches are white glass
Targets and plates are built with `glassBox()` and `GLASS.gate`: dark when
off, bright when on. A target's bull's-eye only on the seen faces.
**Why:** what switches and what is switched share one material (white is
a mechanism, D99).

### D144 — 2026-10-02 — Gate blocks keep types; a bridge starts gone
Gate blocks are block types in `defs.json`; a room gives a gate only its
cells and `switches`. A switch gate's `start` is `solid` (default) or
`gone` (a bridge). The Block tool lists types in groups.
**Why:** values per block would let blocks that look alike behave
differently (D99).

### D145 — 2026-10-02 — Object types have variants (`extends`)
An object type may `extend` a base and list only what it changes, one
level, keeping the base's kind; the loader fills variants in
(`resolveObjectTypes()`). Crates and timed switches use it.
**Why:** one change in one place, as for block types (D60).

### D146 — 2026-10-02 — The Object tool's list in groups, with where pickups lie
The Object tool lists types in groups (Crates, Platforms, Decorations,
Core, Spells, Upgrades, Buffs, Refills, Fragments, Secrets, Test), each
saying what it does, and each permanent pickup where it lies in the world
(`world/pickup-report.js`).
**Why:** placing 16+ fragments over 30 rooms without placing a slot twice
or forgetting one.

### D147 — 2026-10-02 — The dev wing: a list in world.json, hidden from players
`world.json` has a `dev` list of room ids. The dev server, tests and tools
see the whole world; a build for players (`loadGameData(files, { dev:
false })`) leaves the dev rooms out, and an exit into one becomes wall.
The start room may not be in the wing. New mechanics get a dev room there.
**Why:** test rooms are the place to try a mechanic in isolation; a list
hides them without touching room files.

### D148 — 2026-10-02 — The Lattice tutorial: the real start
The game starts at `boot_up`, the first of the tutorial rooms; screen
texts `tut_*`. The checker's core check counts only rooms joined to the
start.
**Why:** the world needs a real first minute.

### D149 — 2026-10-02 — Lattice steps: hub first, then small wings
Lattice rooms are built two or three per step, the hub first.
**Why:** an exit must be connected and an authored room cannot get new
exits (D90); small steps keep each PR reviewable.

### D150 — 2026-10-02 — Crates are neon green
Pushable crates are neon green (`#39ff14`), was lime. Lime stays for the
energy bar and buffs; new template colors keep clear of both
(`AVOID_COLORS`).
**Why:** the game is called NEONMANCER.

### D151 — 2026-10-02 — The Atrium hub and its two disk halls (5.6a)
The Atrium with its wing doors and a shrine; `shield_hall` (Shield disk)
and `freeze_hall` (Pause disk).
**Why:** each disk hall teaches its spell before the wing that needs it.

### D152 — 2026-10-02 — Boosts: small temporary rewards for simple secrets
Pickup kind `boost` (small voxel figures, no save bit, no score).
Functional ones end when the room resets: **Overdrive** (50% faster on the
ground, air speed unchanged), **Patch** (absorbs the next hit, 30 s),
**Overclock** (free spells, 10 s); running ones show as tags. Cosmetic
ones last until any death or a reload: **Sparkle trail** (small magenta
pixels), **Rainbow hat**. One already worn is left lying. The checker
ignores them.
**Why:** a simple secret needs a reward between nothing and a permanent
chip; limited to the room they never trivialise later rooms.

### D153 — folded into D152

### D154 — 2026-10-02 — Frozen enemies can be pushed
Walking into a frozen enemy pushes it one cell (as `Enemy.pull()` moves
it): over anything, so a hole or lethal floor is its end. Only the top of
a stack moves; bosses never freeze.
**Why:** a frozen enemy is already a platform; pushing makes it a block
for puzzles.

### D155 — 2026-10-02 — A frozen enemy is a whole cell
While frozen, an enemy's box is the whole cell, at least a block high; it
is a step like a crate. The Pause cage shows the cell.
**Why:** players expect to use a frozen enemy as a block.

### D156 — 2026-10-03 — The Shield wing (5.6b)
`bolt_gallery`, `relay_loft` and `ledger_cell`. Rule: wing rooms combine
taught verbs in several steps, each harder than the last. The checker
takes platforms as free floor, so ferry power is judged by hand.
**Why:** the tutorial teaches one verb per room; wings combine them.

### D157 — 2026-10-03 — Cold Stairs (5.6c)
`cold_stairs`: a frozen bug pushed onto a plate holds a bridge. The
checker counts a plate on a pausable enemy's path, or one push beside it,
as held with Pause (extended by D166).
**Why:** develops freeze-as-step with the push and a clock.

### D158 — 2026-10-03 — The dev wing is outside the world check
The world check reports an unreachable dev-wing room as a warning, not an
error.
**Why:** players never see the wing, so it cannot fail their world.

### D159 — 2026-10-03 — Cold Stairs review fixes
Rule: a puzzle must not be solved by a habit (riding a bug's bounce) nor
trap him for one (zapping a bug); the checker models a bounce as straight
up, so both are judged by playing.
**Why:** a bounce carried him across without Pause.

### D160 — 2026-10-03 — Ledger Cell: no climbing past the gates
Rule: a crate step reaches 2 high, never 3; the room height is no
ceiling. Walls a crate must not climb are 3 high, and no 2-high top
touches a 3-high one.
**Why:** a crate beside a 2-high divider skipped both gates.

### D161 — 2026-10-03 — Room-design skill: mutation test and play helper as scripts
`.claude/skills/room-design/scripts/`: `mutate.mjs` removes each helper
and seals each gate, re-runs the checker and lists what each exit and
pickup depends on; `sim.mjs` wraps `Game` for headless play. The
level-review subagent runs the mutation test.
**Why:** the manual mutation test was skipped in practice; as a script it
found real bypasses.

### D162 — 2026-10-03 — Warden Pit and Idle Cache (5.6d)
`warden_pit` (Null Pointer, cover bars so the doors are out of its sight)
and `idle_cache`. Rule: from a 1-high top beside a floor pit a late
running jump crosses 2 tiles (up to 2.45 units).
**Why:** boss 1 belongs to the Pause wing.

### D163 — 2026-10-03 — Screen texts are help, never the solution
A screen text explains a spell or concept met for the first time: what it
does and how to use it, never how to solve the room. Test: it reads true
in any room with that mechanic. Rooms without a new concept carry no help
text; a secret's hint is in the room's shape.
**Why:** rooms teach by their shape.

### D164 — 2026-10-03 — Every crate is visible
No block, ledge, pillar or wall hides a crate from the camera; one face
showing is enough. Secrets too.
**Why:** a puzzle whose tool can't be seen is a guess.

### D165 — 2026-10-03 — Lattice rooms reviewed against D163 and D164
All Lattice rooms reviewed: help texts that solved rooms were cut, hidden
crates moved, pits widened where a crate-top leap skipped them.
**Why:** new rules apply to existing rooms.

### D166 — 2026-10-03 — The checker pushes frozen enemies; other solutions
With Pause the checker pushes a frozen enemy like a crate; every cell it
can rest in is a step, and as weight it holds one plate at most. Rule: a
second solution of the same or higher difficulty is fine; a bypass is
one that skips the room's idea for less effort. Abilities found later
may skip a room's way through, never its pickups' tricks (D186).
**Why:** bounce bypasses could not be fixed while the checker only knew
path cells.

### D167 — 2026-10-04 — Fences: a see-through block
Block type `fence` (`"seeThrough": true`): solid to bodies and standable,
but bolts and enemies' sight pass through (`Grid.blocksSight()`); Blink,
Warp, Pull and paste stop at it. No faces: horizontal beams of light per
unit of height through the cell's middle, linking to neighbours, in the
room color. Whole cells, not edges. Height is the design tool: 1 pens
crates and enemies, 2 waits for the double jump, 3 for good. No cover.
**Why:** walling off areas without the fixed camera losing what is
behind them.

### D168 — 2026-10-04 — The Scan wing, first half (5.6e)
`scan_lab` and `mirror_stacks`. From here on rooms are chains of four or
five steps where a tool is used twice or a step must be taken in the
right place. Rule: a room with platforms needs a way home checked by hand
from every exit (rooms behind reset). The checker takes every fake block
as gone and every target as hit, so scan range and bolt lines are judged
by hand.
**Why:** the author asked for harder rooms.

### D169 — 2026-10-04 — Fewer draws, no redraws behind menus, no MSAA on high-DPI
Decorations merge their boxes (`boxFaces()`) and instance their glass
(`glassBoxes()`); shared primitives in `render/geometry.js`. Behind a
menu the last frame is kept (`render({ onlyIfChanged })`, `invalidate()`)
and shader time stands still. MSAA is off at 1.5+ pixels per CSS pixel;
the quality ladder skips steps that change nothing there. Not done yet:
cached line materials, SMAA, fewer bloom levels, GPU particles.
**Why:** decorations were most draws; menus redrew an unchanged picture;
high-DPI paid for MSAA it does not need.

### D170 — 2026-10-05 — The Scan wing, second half (5.6f)
`ghost_exit` (the first hidden exit), `junction` (the wing's crossroads,
a one-way shortcut home) and `drift_bay`. Fragment numbers are save
slots, not a count. Rule: where a death or a load could put him on the
wrong side of a one-way shortcut, set `spawn` and `reset` apart.
**Why:** a shortcut home must not become a way in.

### D171 — 2026-10-05 — The Fork wing, first half (5.6g)
`fork_lab` and `twin_plates`. The checker: Fork holds one plate at a
time, like a frozen enemy; a drop past a cell a frozen enemy or platform
may occupy also falls to the floor.
**Why:** two-plate rooms looked solvable with Fork alone.

### D172 — 2026-10-05 — Watchdog timers: a timed challenge per room
A room may set `timer` (whole seconds, 3–600). It runs once the room has
faded in, stands still behind menus and with debug invincibility, and at
zero kills him (cause `timeout`, a normal death). Leaving drops it. The
HUD shows `WATCHDOG 0:24.5` top middle, red and ticking in the last 5 s.
It guards the room's permanent pickups: taking the last one still to find
stops it, and a room with all found arms none; a room without any always
arms it. Ticks, not wall-clock time. The checker ignores it. The
room-editor field **Timer (s)**. `first_light` ("Watchdog Kennel") is the
first, 10 s.
**Why:** the author asked for timed challenge rooms. A clock on the whole
game stays out of scope.

### D173 — 2026-10-05 — The Fork wing, second half (5.6h)
`guard_loop` and `split_vault`. Secret rooms are complex: several steps,
often with tools found later; a secret may hang off another room than
planned.
**Why:** Fork combined with crates and guards.

### D174 — 2026-10-05 — The Gatekeeper's hall (5.7)
`gatekeeper` ("Gatekeeper Hall", 16x4x16) at (9,0) joins `drift_bay`
(north) and `split_vault` (south), so the Scan and Fork wings meet
there; its east side waits for the core (5.8). The fight is the one of
D134 and D137 (drops `buff_energy_2`). Rules: each overload plate keeps
its eight neighbours free (next to a wall, hole or block it could stop on
a plate out of its burst's reach and open to Zap for good); 1-high cover
blocks it can't climb give him time to recharge, a refuge only if he
jumps them; a door must not open into an enemy's sight (`drift_bay`'s
south door moved behind a 1-high wall, its enemies moved). A decoy or
the Shield make it easier but still use the plates: not bypasses (D166).
Beaten with Zap alone in about 35–40 s headless.
**Why:** boss 2's arena, joining the two deep wings so the way to the
core leads through either; cover gives a fight with 50 energy room to
breathe.

### D175 — 2026-10-02 — One `requires` list for locked doors
(Numbered late: it was a second D152.) An exit's `requires` lists
conditions that must all hold: `{ "switch": id }`, `{ "switch": "*" }`
(every switch in the room) and `{ "access": level }`.
`withExitDefaults()` expands it for the game, the checker and the
renderer. Look: a white glass pane, lights red until their switch is on,
then green; an access level as a small numeral, red until his level is
enough. Hidden exits stay a flag of their own.
**Why:** switch locks and access locks were one idea with two
vocabularies.

### D176 — 2026-10-05 — Docs cleanup: a log of current decisions; dropped ideas
The decision log shows each decision as it stands: replaced entries are
one-line pointers, room-build entries keep only the rules they produced,
and the old wording lives in git history (the log was over 2,000 lines).
Dropped from the plans: the secrets ladder (hat star, star trail, Phantom
shimmer, the 16-secret room), the zoom-to-fit setting for small rooms,
audio-reactive visuals, and the seven unused looks as planned content.
**Why:** the author asked to cut what is obsolete; a log read at the start
of every session must stay short enough to read.

### D177 — 2026-10-05 — The core hall, the Level 1 locks and the teasers (5.8)
The core moves from `atrium` to `core_hall` ("Kernel Core", 12x4x12,
(10,0)), east of the Gatekeeper, as the plan put it behind boss 2 (one
core in the world). It has only two free sides (`guard_loop` lies
south), so its north Level 1 lock leads to `dj_vault` (the double jump's
first placement), whose east door on a 2-high ledge (`y` 2) leads on to
Frostbyte: the reward is the key. The east lock leads to Glitchmire.
Teasers are look only: two rooms per biome, dead ends ending in a lore
screen (the route is not compiled yet), no permanent pickups, Lattice
enemies only, nothing a Lattice room has not taught (`frost_gate`'s
crossing is a plain causeway: collapsing blocks wait for a room that
teaches them). The biomes' floor patterns and particles are a
step of their own (5.8b). The level-3 access pass in `boot_up` stays
while the author tests.
**Why:** the plan's core behind boss 2 with its Level 1 reward; with two
free sides the vault doubles as the way to Frostbyte.

### D178 — 2026-10-05 — The world map tool no longer flags rooms far from the start
`mapWarnings()` and the world map tool's CHECKS list only rooms the start
can't reach through exits; `TEST_ROOM_REACH` and the "N ROOMS OUT" flag
are gone (D49's warning). It flagged 23 of 28 rooms, 20 of them Lattice
rooms. Limiting it to the dev wing, measured from the wing's entry, would
still flag `fence_yard` and `watchdog_run`; the dev server reaches any
room with the debug room jump or `?room=`.
**Why:** real rooms are drafted unflagged (D90) and test rooms live in the
dev wing (D147), so the warning flagged nearly every real room and hid the
warnings that matter.

### D179 — 2026-10-05 — Home Lattice's ambience; the Outer Buffer before the teasers' looks
Step 5.9. Two biome look fields, off unless a biome sets them (the
other look fields keep Home Lattice's values as defaults): `flows` (share
of floor grid lines that now and then carry a bright dash, in the floor
shader) and `panels` (share of free back-wall
cells that become clear glass windows in a frame, never in the bottom
row, by a doorway or touching each other; picked anew on every entry and
kept through a respawn or a scan's rebuild). Home Lattice: 0.5 and
0.08. No extra render pass; the core heartbeat is dropped, and so are the
warm motes (D180).
The step plan with the author: the Glitchmire and Frostbyte floors and
particles move to their Phase 6 steps (the teasers get them then); the
Outer Buffer look (5.10) comes before its secret rooms (5.11), since
both the Lattice's and the Outer Buffer's looks are needed for the
playtest.
**Why:** the safe sector gets a living city look without gameplay
effects; the teaser biomes are not part of the playtest's focus.

### D180 — 2026-10-05 — No warm motes in Home Lattice
The room-wide warm motes of D179 (and the "warm motes rising slowly" of
D121) are removed: the `motes` look field, `render/motes.js` and its
showcase part. Data flows and glass panels stay. The backup shrine keeps
its own motes (D97).
**Why:** the author saw them in play and did not want them.

### D181 — 2026-10-05 — Glass panels glow and flicker
Home Lattice's glass panels (D179) glow softly in the room color,
brightest at the frame, breathing slowly, each panel on its own rhythm;
now and then (every 5–15 s per panel) one stutters between dark and
bright for about a third of a second, like a faulty display. One
instanced additive quad per panel in front of the pane, animated in its
shader (`PANEL_FX`); no extra pass.
**Why:** the author asked for the panels to glow a bit and flicker
sometimes; faint enough that they still read as windows.

### D182 — 2026-10-06 — The Outer Buffer look: a deep indigo void with a black hole
The Outer Buffer (D130) is dark space beyond the Grid. Its room color is
deep indigo (`#5b4fe0`, was gray) on a near-black indigo background; the
whole room stays dark. Outside the room there is no grid: a clean cut
into the void, which shows a starfield in three depth layers (tiny dim,
medium, a few large, all twinkling), faint slow clouds in the room color,
and a black hole beside the room: a black shadow with a thin photon
ring, a slowly turning disk of streaks, and lensing that bends the stars
round it. Three new biome look fields, off by default: `stars` (density),
`nebula` (strength), `blackHole` (radius in blocks). All of it runs in the
floor's shader (`SPACE` in `render/floor.js`), the outside being the floor
plane, so there is no extra pass or object and the flat disk reads as an
ellipse under the fixed camera.
**Why:** the author asked for a dark, starry, mysterious space with a
deep indigo palette, a clean void edge instead of drifting debris, and a
black hole. Low gravity and the light round the wizard stay in Phase 7.

### D184 — 2026-10-06 — The Outer Buffer entrances: five secret doors, each needing a later spell (5.11a)
Step 5.11 starts with the five secret rooms' entrances; the rooms
themselves (`buffer_1`–`buffer_5`, 8×8, Outer Buffer, one exit each, width 1)
are empty until their puzzles are built one by one. Each hangs off a Lattice
room by a width-1 exit; every door asks for a spell he does not have at the
start, and the Lattice's own spells and crates must not get him in:
- `buffer_1` Dead Pixel: **Scan**, a hidden exit in `scan_lab`'s north wall
  (the room where he learns Scan).
- `buffer_2` Stray Byte: **double jump or Compile**, a doorway two blocks up
  in `warden_pit`'s west wall (a 2-high ledge; no crates, and the boss is
  never paused, so Pause and crates give no step).
- `buffer_3` Null Orbit: **Blink**, a door in `guard_loop`'s east wall on a
  block island behind two void tiles, in a fence cage with a fence roof: only
  a Blink (exactly 3 cells, from the 1-high pad) crosses it; the roof stops
  the double jump, the pad stops crates, a Compile crate would stand under
  the roof.
- `buffer_4` Event Horizon: **Warp**, a doorway three blocks up in
  `mirror_stacks`' east wall, across a 4-cell lane of holes from a staircase
  that rises to the same height (a Blink from the stair's edge falls short,
  the double jump is too short; the review found a 3-cell lane let a Blink
  across; holes in the lane and a fence beside the doorway column leave no
  place for a crate step).
- `buffer_5` Cache Miss: **Warp plus Compile or Fork**, a door in
  `ghost_exit`'s east wall that opens while a plate is held. The plate lies
  in a fenced pocket that only a ledge, four blocks up and across a 4-cell
  lane from a staircase, looks into; he warps onto the ledge, walks to its
  edge and casts Compile (a crate falls on the plate, 7 s) or Fork (a decoy,
  10 s), drops off and runs to the door (about 3.9 s spare in the simulation).
  A hole beside the plate lets him end a fall into the pocket.
`world.json` gets a `later` list (compile, blink, warp): spells the world
hands out in sectors not built yet. The reachability checker treats a room,
exit or pickup that stays out of reach only because of them as a warning,
not an error, so CI stays green until the disks are placed; one that stays
out of reach even with them is still an error.
**Why:** the author asked for five entrances, each tied to a later spell,
with their contents to follow. The checker ignores energy, so "double jump +
Compile" in `buffer_5`'s and `buffer_4`'s reports means three or more
Compile casts (at least three crates: a step, then two stacked beside the ledge; over the 100 energy ceiling) and is no real way in; Cut &
Paste and Pull routes are for the author to judge when those spells
arrive. Nothing here edits an authored room (none is flagged).
### D183 — 2026-10-06 — Exits into the Outer Buffer look different
An exit that leads into a biome with the look field `starExits` (only the
Outer Buffer) shows small stars drifting out through it, fading in and
out and twinkling, instead of the usual dashes (back doorways) and
arrows (front exits); and a locked one (switches or access level) has a
dark indigo glass pane, a frame in the biome's color, instead of white
glass (`GLASS.darkGate`). The lights and the numeral keep their red and
green. It follows the destination biome, so no room data changes and
any biome may turn it on later. A door's own color is still the
destination's (D99); the effect is the hint that the rooms beyond are
different and meant for later (D67).
**Why:** the author wanted the doors into the Outer Buffer to read as
different at a glance; only the stars, not a portal frame, and dark
glass for the switchable ones.

### D185 — 2026-10-06 — The world map checks run on idle; `pending` rooms only warn
The world map tool ran validation twice and the whole reachability
search on every redraw (each drag, click and panel update), which made
editing slow. The checks are now cached by the data's content and run
once after the data has stood still for 0.7 s ("Checking…" meanwhile).
`world.json` also gets `pending`: rooms still waiting for something not
placed yet (a secret whose entrance comes later). The checker turns their
errors into warnings, so they never fail CI or a release; remove a room
from the list when it is finished (as with `later`, D183).
**Why:** the author found the map editor too slow, and unfinished secret
rooms must not block a release.

### D186 — 2026-10-07 — Gameplay direction: a push-puzzle adventure with arcade bite
What the game is about, set before the Lattice rooms are reviewed one by
one. Neonmancer is an isometric push-puzzle adventure with arcade bite:
crates, gravity and height are the puzzle (Sokoban with a third
dimension: stacking, steps, falls, plugged holes); enemies are puzzle
pieces first (a frozen enemy is a block, a decoy lures one onto a plate)
and pressure second; small platforming and combat give the tempo between
and around the puzzles. Every room earns its place with one trick.
- **Room types:** *puzzle* (a thinking room: enemies only as pieces on
  readable paths, no clock), *action* (combat or light platforming,
  simple layout), *hybrid* (a simple puzzle under pressure, only with
  mechanics already taught). Breathers only before a boss; no pure
  connectors. A rough mix of 60 % puzzle, 25 % hybrid, 15 % action,
  tuned in playtests.
- **The trick:** every room's concept names its trick in one sentence
  ("the trick is that ...") and its solution as numbered moves. A room
  whose trick can't be written has no puzzle and is redrawn.
- **Spell roles in the Lattice:** Zap, Pause and Fork are puzzle verbs
  (targets, enemies as blocks, a plate holder and lure); Scan is for
  exploring (secrets, hidden exits); Shield is for action; the double
  jump is a world key.
- **Later abilities skip rooms, not pickups.** A spell or upgrade found
  later may take the wizard through a room (to its exits) without its
  puzzle, a shortcut on revisits once its pickup is found. It never
  reaches a pickup without the trick that guards it. A pickup may need an
  ability (that is its gate, as for secrets); no ability found later may
  make its trick unnecessary. D166 still holds for other solutions with
  the same abilities.
- **The Lattice counts only its own abilities.** For the Lattice and its
  playtest, "later" means the double jump and the Lattice spells found
  after a room (Fork for a Pause-wing room). Pull, Compile, Cut & Paste,
  Blink, Warp and Firewall belong to later sectors, are meant to be
  strong, and may yet be dropped or kept for development only: rooms are
  neither designed nor checked against them for now (the checks run with
  `--with double_jump,zap,scan,fork,pause`). When they are placed in a
  sector, the rooms they reach are checked again.
- **Core first:** the other sectors' teasers stay as they are and the
  Outer Buffer secret rooms wait (step 5.11); new sector work waits for
  Phase 6. Restart and backups stay as they are.
**Why:** the author's playthrough found the engine and look fine but
many rooms thin: the checker showed pickups and exits that any of six to
eight abilities opened, so no room's idea carried weight. The author
chose a mix of Sokoban with 3D parts and arcade with small platforming
and combat, and rules that later abilities may only skip a room's way
through, never its pickup; the strong spells of later sectors are left
out of the Lattice playtest.

### D187 — 2026-10-08 — The Lattice ladder; "later" means any route
Step 5.16 writes the Lattice ladder in docs/lattice-plan.md: per room in
play order its type, rung, mechanic, the trick to aim for and what the
mutation test says now. Settled with the author:
- **Any route.** Past the hub the wings open in any order (the
  Gatekeeper's doors never lock), so a wing room may be met with any
  Lattice spell. Every pickup's trick holds against Zap, Shield, Pause,
  Scan and Fork, which replaces "found after the room" (D186) for the
  Lattice; the trick may use them.
- **Not the double jump.** It comes only with Level 1, once all 16
  fragments are found, so it never skips a Lattice fragment or disk.
  Checks for pickups run with `--with zap,scan,fork,pause`; the double
  jump still counts for exits and secrets.
- **The Atrium teaches** a crate as a step, a crate dropped off a ledge,
  a plate and a bridge, so both wings start from taught basics and the
  hub is no pure connector.
- **Sharpen, and hard is fine.** Reviews keep each room's idea where it
  has one and sharpen it; harder Sokoban puzzles and tougher fights are
  welcome.
**Why:** with the double jump the mutation test flagged nearly every
room for skips no player can make, while Fork, which a player may
already have in any wing, skipped six rooms' plates; plates and steps
were first met inside the wings.
