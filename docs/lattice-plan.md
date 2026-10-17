# Home Lattice plan

The plan for Playtest 1's world (D133): what is built and what is left.
Everything not built is a proposal that changes during the author's room
review and design. Steps: docs/design.md, Phases and steps.

## Direction (D186)

The rooms below were built before the gameplay direction was set
(docs/design.md, Gameplay): a push-puzzle adventure with arcade bite,
puzzle, hybrid and action rooms, one trick a room, and later abilities
that skip a room's way through but never a pickup's trick. Every room is
reviewed against it and its line in the ladder below (D187), one room a
session (step 5.17). Other sectors wait: the teasers stay as
they are, the Outer Buffer rooms keep their entrances and wait for
their contents.

## Ladder

Per room in play order: its type, its rung (teach, develop, twist) for
which mechanic, the trick to aim for, and what the mutation test says now
(`--with zap,scan,fork,pause`, D187). Each room review (step 5.17) works
against its line; the review may change the line, with the author's OK.
Tricks are aims, not layouts. They can be hard: harder Sokoban and
tougher fights are welcome (D187).

Rules for the lines (D186, D187):
- **Any route.** Past the hub the wings can be played in any order (the
  Gatekeeper's doors never lock), so a wing room may be met with any of
  Zap, Shield, Pause, Scan and Fork. Every pickup's trick holds against
  all of them; the trick may use them.
- **No double jump.** It was removed (D216): his jump is 1 up and a
  one-tile gap everywhere.
- **Pads only** (D222). Each review moves its room to `"jump": "pads"`:
  no jump key, pads throw him 2 up and over a 1-tile gap, stairs take him a
  block up, slabs bridge, a bug he falls onto bounces him 2 up (D223). See
  Pads-only migration below.
- **Blink after Level 1.** The Level 1 reward in `dj_vault` (D217), so it
  never skips a Lattice fragment; it counts for exits and secrets only.
- **Plates are no lock on their own.** A decoy holds any one plate, a
  frozen enemy any plate on or beside its lane. A trick that rests on a
  plate needs what they can't give: two plates at once, weight that must
  stay longer than 10 s, or a crate that ends somewhere (a hole, a step,
  a stack).

### Tutorial

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 1 | `boot_up` | action | teach: move, jump | The way to the door is up: a 1-high step, then a 1-tile gap, so he learns the jump's height and reach before anything can hurt him. | Reworked (D193), on pads (D225): the east door sits on a 2-high ledge past a 1-wide gap; a stair beside the spawn onto a 1-high step, a pad on it throws him over the gap; a miss drops him safely into it. Start room and shrine; the access pass is test-only. |
| 2 | `first_steps` | puzzle | teach: push, plug a hole | One push fills one cell of the 2-wide hole: the second crate needs a push from a new side, which he reaches across the first. | Holds, on pads (D231): the hole is 2 wide, so two crates cross it; a micro-Sokoban, pushing crate B straight in is the one dead end, and the west door resets it. |
| 3 | `zap_port` | hybrid | teach: Zap (a target, an enemy, bolts fly level) | The target sits a block up: a floor shot hits the block under it or the bug crossing the line, and the stair he climbed for the disk is his firing step (a jump shot also reaches it). | Reworked (D189), on pads (D232): two stairs to the disk replace the pile; the firing step is on the way; no jump shot. |
| 4 | `first_light` | action | teach: the watchdog, fragments | The straight line is a pit: a zigzag round the pits' open ends, inside 10 s. | Holds, on pads (D233): 2-deep pits were always walked round; 7.8 s of the 10. |

### Hub

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 5 | `atrium` | puzzle | teach: a crate dropped off a ledge, a plate, a bridge | The plate sits behind holes, so only a crate from above reaches it: he climbs the stair and pushes the ledge crate off onto it, which raises a bridge to the Rainbow hat (a boost). The doors stay free. | Reworked (D188), on pads (D234): a stair to a 1-high ledge, the ledge crate pushed onto the plate; no crate step; a decoy skips it for the boost only. |
| 6 | `shield_hall` | action | teach: Shield | The disk is easy to reach behind cover; the way on is not: the north door sits on a 3-high ledge, and the only lift up runs while two crates hold two plates. Pushing and riding are slow, and an arc hits what stands still, so the two sentinels bite there: he shields, dodges or fights. | Reworked (D190), on pads (D235): a stair onto the lift's bottom stop; the plates and the lift are judged by play (the checker runs every platform). |
| 7 | `freeze_hall` | puzzle | teach: Pause, a frozen enemy as a block | The bug walks a caged lane with one gap across it: freeze it as it passes the gap in front of him, push it down the hall into a slot in the walkway and cross over it to the ledge, inside a 5 s freeze and a 15 s watchdog. | Reworked (D191, D192), on pads (D236): the frozen bug fills a one-cell slot in a walkway between two stairs; freezing it elsewhere in the cage costs time the watchdog barely gives. |

### Shield wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 8 | `bolt_gallery` | hybrid | develop: crates into a pit, targets, under towers | Two targets two blocks up take a shot from a 2-high platform reached by two stairs (the cage and the fragment's pocket, the door); the freed crate and the free one then plug the 2-deep pit, the towers watching the north bank and the x = 5 column. | Reworked (D195), on pads (D237): only a 2-high platform reaches the targets; from the north the fragment costs the crossing both ways; the towers' pressure is judged by play. |
| 9 | `relay_loft` | puzzle | teach: powered platforms | Ferries carry crates: a small Sokoban on the loft (Microban 45, 1-high walls, 14 pushes) gets two crates into the sockets that run the east ferry and the third onto it; he rides on top, his step to the fragment's 3-high pillar at the far dock. | Reworked (D196), on pads (D238): two sockets run the ferry to the fragment; a pad throws him onto the rider crate, a stair leads off it to the pillar; the west ferry runs freely. |
| 10 | `ledger_cell` | puzzle | develop: sockets, heavy plate, stacking | Which crate goes where: one fills a socket in the open, the lane's first crate fills a second socket, the next goes west onto the heavy plate and the ledge crate is dropped on it (a stack of two). All three switch the cage over the fragment. | Reworked (D203), on pads (D239): a stair to the ledge, a gap into the lane; a decoy is one weight, so Fork replaces one plate body, never a socket. |

### Scan wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 11 | `scan_lab` | puzzle | teach: Scan, fake blocks | The way east is a wall that isn't there until a scan: the crate he pushes through the gap and a second one that a scan drops off a fake pillar fill one row of the pit, in order. | Holds, on pads (D240): a stair and a pad to the disk, a 2-wide pit for the two crates, a pad and Blink to Dead Pixel's door. |
| 12 | `mirror_stacks` | puzzle | develop: Scan | Scan frees two crates sealed behind a fake row, and all three crates fill one row of the 3-wide pit. On a revisit Fork opens the fragment's gate: one crate can reach a plate, the other is boxed in under the gate, so a decoy holds the second plate. | Reworked on pads (D242): every crate counts for the crossing; the boxed crate, a pad in the pocket, a one-way stair out; Event Horizon is a pad onto the column and a diagonal Zap. The full search truncates (five crates): played in sim. |
| 13 | `ghost_exit` | puzzle | twist: Scan hides the way out | The way on is hidden: a frozen bug on the plate opens the crate's pen, the crate holds the gate open as it passes and plugs the hole at a stair's foot; the stair's pad throws him onto the back row with the fragment, and from the plateau below a scan shows the exit. | Reworked (D206): the stair blocks `[2,0,6]` and `[3,0,6]` were a free route and are gone, so the chain is the lock; Fork can hold the plate instead of the bug. On pads (D245): the plug, stair and pad replace the crate step; the fragment moved off the plateau, where the west door put him beside it with Scan alone. |
| 14 | `junction` | hybrid | develop: Pause on a moving enemy, timed plates | The shot's timing: the bug must be frozen two cells before the pillar while it walks towards him, then pushed twice. The fence gate is a one-way shortcut home. | Reworked (D246), on pads: a stair up to a 1-high ledge beside the bug's lane; he drops onto the passing bug and its bounce lands him on the 2-high pillar with the fragment. Pause turns the bug into a harmless block. |
| 15 | `drift_bay` | action | develop: Shield, enemies as steps | The fight leaves him his step: he rides the ferry under the sentinel's fire, and the virus that meets him is the only step to the fragment, so he freezes it instead of killing it. | Holds; the enemies' roles are judged by play. |

### Pause wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 16 | `cold_stairs` | puzzle | develop: Pause parks a piece behind a barrier, with a clock | Two bugs, two jobs, two casts: each frozen and pushed through a stream (D198) onto its own plate, which a decoy cannot reach; the plates hold the bridge for good. The 5 s freeze is the clock. | Reworked (D204): Fork cannot hold a plate, each bug is needed, `mutate.mjs` says every piece matters. |
| 17 | `warden_pit` | boss | Null Pointer | Cover bars and refills set the fight's rhythm; its teleports break cover. As hard as it should be. Drops fragment 7. | Boss. |
| 18 | `idle_cache` | hybrid | twist: a frozen enemy is the base of a stack | The bug is the first weight: frozen in its lane, pushed onto the heavy plate, and the ledge crate dropped on it; the 5 s freeze is the clock for freeze, push, drop and the run to the caged fragment. The crate dropped first is lost. | Reworked (D205), on pads (D250): a stair onto the ledge; the stack needs both (`mutate.mjs` says every piece matters with Pause); Fork can still be the base (a decoy is no solid body), but the ledge drop stays. |

### Fork wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 19 | `fork_lab` | puzzle | teach: Fork holds a plate | The crate that opens the disk's cage is then his step into a pen only a decoy can hold: one push too many loses it. | Holds; the pocket's gate is a cage (D209); on pads (D251): the crate only opens the disk, a stair puts him on the pen's fence top to cast the decoy. |
| 20 | `twin_plates` | puzzle | develop: Fork plus Pause, two clocks | The order of clocks: the decoy (10 s) first, the frozen bug (5 s) second, both plates under the bridge; past it a zapped target opens the pen with the fragment. | Holds (Fork, Pause and Zap); reviewed, kept (D210); on pads (D252): a pad in the pen throws him onto the fragment block, the crate is gone. |
| 21 | `guard_loop` | hybrid | develop: Fork as a lure | The step is two crates high: one is pushed through two guards, the other waits on the ledge and drops on it. The decoy pulls the guards off the lane; cast too early and they are back, too late and they block the crate. | Reworked (D207): the plate, bridge and pocket are gone; a 2-high stack (a crate through the guards' lane, a ledge crate dropped on it) is the lock, Fork is a lure and a frozen virus may be the base. |
| 22 | `split_vault` | hybrid | twist: one decoy, two needs | Two crates are handed through a stream wall (he goes round over a divider) into sockets; the cage opens only while a decoy holds a plate in a fenced pocket, with a virus after him as he runs. | Reworked (D208): crates handed through a stream wall into a vault and spent in sockets; a cage on fragment 15 that a decoy keeps open while he runs. |

### The deep end

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 23 | `gatekeeper` | boss | the Gatekeeper | Lure it onto the overload plates, recharge behind cover; as hard as it should be. Drops the energy buff. | Boss. |
| 24 | `core_hall` | goal | the core, the Level 1 locks | No puzzle: the core is the beat. | Outside the mix. |
| 25 | `dj_vault` | reward | teach: Blink | The reward's first use: a 2-tile pit, the room's full depth, between the disk and the east door; a jump crosses one tile, never two. | Reworked (D217). Outside the mix. |

The teasers (`frost_gate`, `frost_edge`, `glitch_gate`, `glitch_edge`)
stay look-only and outside the ladder (D186).

### Revisits

- `mirror_stacks`: fragment 0 needs Fork, from the Fork wing.
- Outer Buffer doors (D212): each gets a trick of its own, never open on the
  first arrival. They were built round the double jump (D212–D215); with it
  gone (D216) each is redone in its own PR, round Blink (D217; the checker
  already finds `guard_loop` east with `scan + blink`, not yet played; the
  other three are `never`): `scan_lab` north_2 (`buffer_1`, done: a pad and
  Blink onto the memory stack's sill, D240; was a Blink walk, D218), `warden_pit` west (`buffer_2`, done: two pads and a Blink onto the 4-high pillar, D249),
  `guard_loop` east (`buffer_3`), `mirror_stacks` east_2 (`buffer_4`, done: the
  pocket's pad onto the column, then a diagonal Zap at the target, D242),
  `ghost_exit` east (`buffer_5`, done: the pen's pad and Blink onto a ledge over
  the plate's pocket, a decoy dropped onto the plate, D245).
- Shortcuts: `junction`'s fence gate home, and the Gatekeeper once beaten.

### Mix and gaps

In the mix, 21 rooms: 12 puzzle (57 %), 5 hybrid (24 %), 4 action (19 %),
near the 60/25/15 aim; action runs high because the tutorial teaches
movement. Outside the mix: two bosses, the core hall and the
`dj_vault`. Every mechanic is taught before a hybrid uses it; timed plates
first appear as ways home (`relay_loft`, `scan_lab`) before `junction`
makes one the puzzle.

No line develops stacking (a crate dropped onto a crate as a 2-high
step) after the Atrium teaches the drop; a review may add it where it
fits (`ledger_cell` has it since D203, `idle_cache` since D205). Collapsing and hazard blocks have no
Lattice room; they wait for the sectors.

Ideas from the author for the reviews to come (5.17):
- Sokoban, often (Microban's way: one idea a room, every tile used, no
  red herrings, corners and walls as the deadlocks to read). Holes,
  steps and stacks are the goals; plates are weak locks. The Lattice
  has no Pull, so pushes are final until the room resets.
- The last crate is a frozen enemy: Pause turns a bug into the piece
  that finishes the push puzzle.
- Sokoban under attack: a push puzzle in a hybrid room with enemies after him.
- Timing: freeze the bug the moment it stands on a plate he can't
  reach, inside its fenced lane or across a gap too wide to jump (a
  bolt passes a fence and flies over a gap; he and a decoy can't, so
  Fork doesn't skip it); a timed run of jumps (a timed target's
  bridge, a watchdog).
- A plate in a moat: holes round the plate make him fill one before he
  (or a crate) can reach it.
- The socket (built, D194): a hole that is a switch once a crate
  fills it. A decoy can't fill a hole and a frozen enemy pushed in is
  lost, so only a crate powers it: a Sokoban goal no spell fakes.

- The heavy plate (built, D200): a plate that needs a stack of two. A
  decoy or a frozen enemy adds one weight but lasts 10 s or 5 s, so a
  crate stack is the lock; he counts one while he stands on it.
- The cage (built, D202): one cell that locks a pickup in plain view
  behind switches; a Zap passes through the bars. Replaces the pockets
  of gates and fences (`fork_lab`, `twin_plates`, `split_vault`,
  `ledger_cell`).
- The spiked crate and the crate stream (built, D199, D198): they give a
  classic level back its player routing (he can't stand on the crate,
  or can't follow it through the field).

Reviews needed for the Fork skips above: `ledger_cell`,
`ghost_exit`, `cold_stairs`, `idle_cache`, `guard_loop`. Proposals
for them are in Plan review below.

## Plan review (2026-10-10, for the author's OK)

A read of the plan against the tools (mutation test with
`--with zap,scan,fork,pause`) and the mechanics built since D194. Each
line is an aim, not a layout; a review may change it with the author's
OK, and the ladder's rows change only when it does.

### What the plan was missing

1. **Fakeable plates were the common flaw.** All five Fork skips are a
   plate a decoy or a frozen enemy holds. Replace the fakeable lock with
   one a spell can't fake: a socket (a crate, spent), a heavy plate (a
   stack), a cage over the pickup, or a plate in a fenced lane (bolts
   pass a fence, he and a decoy don't, D167).
2. **Stacking has no home** (above). The heavy plate is its home.
3. **A socket is met before it is taught.** `relay_loft` (#9) is the
   first room with sockets, and its rung says "teach: powered
   platforms". Options: the next review (`ledger_cell`) is moved before
   it in the order, or a short socket lesson goes into an earlier room
   (the Atrium's ledge puzzle is already full; `first_steps` is signed
   off).
4. **How many new mechanics the Lattice carries.** Teach three, all of
   one family, the locks: socket, heavy plate, cage. Keep the spiked
   crate and the stream for the five Outer Buffer secret rooms
   (step 5.11): they are optional, complex by design, still empty, and
   the place for the hard classics (Microban 8, 19 and 63 with spiked
   crates, streams).
5. **The Fork wing is one verb.** `fork_lab`, `twin_plates`,
   `guard_loop` and `split_vault` are all plates and a decoy; sockets
   and heavy plates vary them. The Pause wing has no hybrid
   (a puzzle under pressure) between its puzzles and the boss; one
   there would help pacing.
6. **Sokoban is used once** (`relay_loft`) though the author wants it
   often. The next rooms below take a classic or a Microban-style small
   level each.

### Proposed aims for the rooms with findings

| Room | Proposed type and aim |
|---|---|
| `ledger_cell` | puzzle, develop: socket and heavy plate (a classic 3-crate level). One crate is spent in a socket (gate 1, for good); the other two stack on a heavy plate (gate 2). Which crate is spent is the puzzle. The fragment sits in a cage on the same switches. Taught first if it moves before `relay_loft` (item 3). |
| `cold_stairs` | puzzle: the plate in the key bug's fenced lane (a decoy can't enter); the second bug gets a job (a 2-high stack needs it and the spare crate) or goes. |
| `idle_cache` | hybrid: a Microban-sized push with the patrolling bug on it; the idle plate as a heavy plate, the frozen bug as the base of a stack the crate is dropped on. Keeps the "two holders that move differently" idea. |
| `ghost_exit` | puzzle, twist: find why the crate, bug and gate are not enforced, then make the chain the lock and Scan the reveal. Hand check first. |
| `guard_loop` | hybrid: Sokoban under attack. The step is a 2-high stack, so a frozen virus alone is not enough; the decoy stays a lure, not a shortcut. |
| `split_vault` | hybrid, twist: crates handed through a stream wall while he goes round (D198's "vault"), a cage on fragment 15. |
| `fork_lab`, `twin_plates` | tidy only: the pocket of gate and fences becomes a `cage`. Done for `fork_lab` (D209); `twin_plates` stays, its pocket holds a crate (D210). |
| `scan_lab`, `junction`, `drift_bay` | no change. `junction` holds from `--from east` (its north spawn is the one-way side); `drift_bay` is judged by play. |

Order of reviews: `ledger_cell` first (it settles item 3), then
`cold_stairs`, `idle_cache`, `ghost_exit`, `guard_loop`,
`split_vault`, then the tidy-ups.

## Settled with the author

- A web, not a line: a tutorial, an Atrium hub, four wings that cross-link,
  and the central core behind the second boss.
- Spells of the Lattice: Zap, Shield, Pause, Scan, Fork, and Blink as
  the Level 1 reward (D217). Pull, Compile, Warp, Cut & Paste and
  Firewall wait for later sectors.
- Level 1 (16 fragments) opens the core's locks; its reward in `dj_vault`
  is Blink (D217; the double jump before it, removed, D216).
- 16 fragments in normal rooms, all reachable without Level 1; two secret
  rooms carry an extra one each (18 in the Lattice). Boss 1 drops a
  fragment, boss 2 the +10 energy buff.
- Five Outer Buffer secret rooms, each its own room off a Lattice room.
  Secret rooms are complex: several steps, often with tools found later
  (backtracking, D67); the room a secret hangs off may change (D173).

## Shape

```
              [Vault]  Blink, Level 1 lock
 Frostbyte~ [  CORE  ] ~Glitchmire      Level 1 locks
              [Gatekeeper]   boss 2 (drops an energy buff)
   [Scan wing]     |     [Fork wing]    both end at the Gatekeeper
   [Shield wing]-[ATRIUM]-[Pause wing]  Pause wing holds boss 1
                   |
               [tutorial]
```

On the world map the tutorial runs west to east into the Atrium (8,0);
the Shield wing lies north, the Pause wing south, the Scan wing beyond the
Shield wing and the Fork wing beyond the Pause wing (D149). The Atrium has
no door to the Gatekeeper: the way to the core leads through the deep end
of the Scan or the Fork wing. Once boss 2 is beaten (it stays away, D104),
the Gatekeeper joins the two wings as a shortcut.

## Built (5.5–5.8)

29 rooms; the room files hold the layouts, the decisions the rules.

| Area | Rooms |
|---|---|
| Tutorial (D148) | `boot_up` (start), `first_steps`, `zap_port` (Zap), `first_light` (watchdog, D172) |
| Hub (D151) | `atrium`, `shield_hall` (Shield), `freeze_hall` (Pause) |
| Shield wing (D156) | `bolt_gallery`, `relay_loft`, `ledger_cell` |
| Pause wing (D157, D162) | `cold_stairs`, `warden_pit` (Null Pointer), `idle_cache` |
| Scan wing (D168, D170) | `scan_lab` (Scan), `mirror_stacks`, `ghost_exit`, `junction`, `drift_bay` |
| Fork wing (D171, D173) | `fork_lab` (Fork), `twin_plates`, `guard_loop`, `split_vault` |
| Boss 2 (D174) | `gatekeeper` (the Gatekeeper; doors north to `drift_bay`, south to `split_vault`, east to `core_hall`) |
| Core (D177) | `core_hall` (the core; Level 1 locks north and east), `dj_vault` (Blink, D217; its door over a pit leads on to Frostbyte) |
| Teasers (D177) | Frostbyte: `frost_gate`, `frost_edge`; Glitchmire: `glitch_gate`, `glitch_edge` (look only) |

Fragments 0–15 are all placed.

## Left to build

Waits for the core (D186): the secret rooms' contents.

| Room | Size | What it is |
|---|---|---|
| `buffer_1` Dead Pixel (5.11) | 8x6 | Secret, a Scan hidden exit in `scan_lab` (Blink walk, D218); done: Microban 86, spiked crates into sockets under a fence roof, `secret_0` in a cage (D219) |
| `buffer_2` Stray Byte (5.11) | 8x8 | Secret, in `warden_pit` behind a 4-high ledge (D213), two pads and Blink since D249; entrance built, an extra fragment to come |
| `buffer_3` Null Orbit (5.11) | 8x8 | Secret, in `guard_loop` on a 4-high sill (D214), no Lattice way in since D216, to redo; entrance built, an extra fragment to come |
| `buffer_4` Event Horizon (5.11) | 8x8 | Secret, in `mirror_stacks` above the fragment pocket (D215); since D242 the pocket's pad throws him onto the door's column and a diagonal Zap hits the target; entrance built |
| `buffer_5` Cache Miss (5.11) | 8x8 | Secret, in `ghost_exit` behind a plate in a walled pocket (D215); since D245 a pad in the bug pen and Blink reach the 2-high ledge over it, and a decoy cast from there holds the plate; entrance built |

## Pads-only migration (D222)

What each room loses without the free jump, worked out with the checker
(`--with zap,scan,fork,pause`, from every door) on 2026-10-14: a pickup it
no longer reaches, or a crossing from one door to another. "Play" means the
checker sees nothing lost, but the trick or the tempo leaned on the jump
and the review checks it by playing. Tags: rooms with spiked crates or
fences (often there only to stop hops: candidates to simplify) and bouncy
enemies (a bounce now needs a fall onto them: a moving pad, D223, which the
checker counts). Each room's review (5.17)
moves it to `"jump": "pads"` and ticks it off here.

| # | Room | Lost without the jump | Tags | Note |
|---|---|---|---|---|
| 1 | `boot_up` | the east door (from the spawn and the west door) | | Done (D225): a stair, a pad over the gap, a drop back. |
| 2 | `first_steps` | crossing west→east | | Done (D231): the hole narrowed from 3 to 2 wide. |
| 3 | `zap_port` | `disk_zap_1` | bouncy | Done (D232): two stairs, the firing step on the way. |
| 4 | `first_light` | play | | Done (D233): no jump was involved; cells unchanged. |
| 5 | `atrium` | `boost_rainbow_1` | | Done (D234): one stair to a 1-high ledge. |
| 6 | `shield_hall` | crossing south→north | | Done (D235): a stair to the lift; the checker rides lifts. |
| 7 | `freeze_hall` | `fragment_1_1` | bouncy | Done (D236): the frozen bug is a stepping stone in a slot. |
| 8 | `bolt_gallery` | crossings south↔north | fence | Done (D237): a firing platform and a 2-deep pit. |
| 9 | `relay_loft` | `fragment_4`; crossings to and from east | | Done (D238): a pad onto the rider crate, stairs onto the ferry and up to the fragment; widened to 15. |
| 10 | `ledger_cell` | `fragment_5` | fence | Done (D239): a stair to the ledge, the pocket's row 2 open, a gap in the lane's fence. |
| 11 | `scan_lab` | `disk_scan`; crossings west/south→east | fence | Done (D240): a stair and pad to the disk, a 2-wide pit; the door is a pad and Blink. |
| 12 | `mirror_stacks` | crossings west↔south | fence | Done (D242): three crates for the 3-wide pit, a pad in the fragment's pocket and a one-way stair out; Event Horizon's door is the pad onto the column. |
| 13 | `ghost_exit` | crossings north/east→west | fence, bouncy | Done (D245): the crate plugs a stair's foot, a pad onto a 3-high back row; gaps in the pens' fences; Cache Miss is a pad, Blink and a dropped decoy. |
| 14 | `junction` | `fragment_11` | fence, bouncy | Done (D246): a stair, a ledge to drop from, the bug as a moving pad; plate moved off the south door. |
| 15 | `drift_bay` | `fragment_10`; crossings north↔south | | Done (D247): stairs on the ferry, a pad onto the 3-high pillar, the frozen virus bridges the gap. |
| 16 | `cold_stairs` | `fragment_6`; crossings north↔south, north↔east | fence, bouncy | Done (D248): a pad by the pillar, the spare crate gone. |
| 17 | `warden_pit` | play | | Done (D249): the fight unchanged; Stray Byte's door is two pads and a Blink. |
| 18 | `idle_cache` | play | bouncy | Done (D250): a stair onto the ledge; the freeze run has 1.4 s spare. |
| 19 | `fork_lab` | crossings west↔east | fence | Done (D251): the pen is 1-high fences with a stair on and a stair off; the decoy is cast from its fence top. |
| 20 | `twin_plates` | `fragment_12`; crossings west↔north | fence, bouncy | Done (D252): the fragment block and a pad sit in the target's pen; `plate_home` off the north door. |
| 21 | `guard_loop` | `fragment_13` | | Host of Null Orbit's door (D214). |
| 22 | `split_vault` | `fragment_15` | fence | |
| 23 | `gatekeeper` | play | | Boss. |
| 24 | `core_hall` | play | | |
| 25 | `dj_vault` | play | | Teaches Blink with a Blink from a jump (D217): from a pad now. |
| – | `buffer_1`–`buffer_5` | play | buffer_1: spiked, fence | The secret rooms (5.11) with their host rooms' doors; Dead Pixel can lose its fence roof (D220). |
| – | teasers (`frost_*`, `glitch_*`) | nothing | glitch_gate: bouncy | Moved over in 5.19 as they are. |
