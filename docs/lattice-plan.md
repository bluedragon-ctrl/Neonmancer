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
- **Not the double jump.** It comes only once all 16 fragments are
  found, so it never skips a Lattice fragment or disk. It matters for
  exits and secrets only.
- **Plates are no lock on their own.** A decoy holds any one plate, a
  frozen enemy any plate on or beside its lane. A trick that rests on a
  plate needs what they can't give: two plates at once, weight that must
  stay longer than 10 s, or a crate that ends somewhere (a hole, a step,
  a stack).

### Tutorial

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 1 | `boot_up` | action | teach: move, jump | The way to the door is up: a 1-high step, then a 1-tile gap, so he learns the jump's height and reach before anything can hurt him. | Reworked (D193): the east door sits on a 2-high ledge past a 1-wide gap; a short jump drops him safely into it. Start room and shrine; the access pass is test-only. |
| 2 | `first_steps` | puzzle | teach: push, plug a hole | One push fills one cell of the 2-wide hole: the second crate needs a push from a new side, which he reaches across the first. | Holds; signed off unchanged (5.17): a micro-Sokoban, pushing crate B straight in is the one dead end, and the west door resets it. |
| 3 | `zap_port` | hybrid | teach: Zap (a target, an enemy, bolts fly level) | The target sits a block up: a floor shot hits the block under it or the bug crossing the line, and the stair he climbed for the disk is his firing step (a jump shot also reaches it). | Reworked (D189). |
| 4 | `first_light` | action | teach: the watchdog, fragments | The straight line is a pit: a zigzag of single jumps round the pits' open ends, inside 10 s. | Holds; signed off unchanged (5.17). |

### Hub

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 5 | `atrium` | puzzle | teach: a crate as a step, a crate dropped off a ledge, a plate, a bridge | The crate he climbs on is not the one for the plate: it lifts him to a ledge, and from there he pushes a second crate off onto the plate, which raises a bridge to the Rainbow hat (a boost). The doors stay free. | Reworked (D188): every piece matters; a decoy or the double jump skips it for the boost only. |
| 6 | `shield_hall` | action | teach: Shield | The disk is easy to reach behind cover; the way on is not: the north door sits on a 3-high ledge, and the only lift up runs while two crates hold two plates. Pushing and riding are slow, and an arc hits what stands still, so the two sentinels bite there: he shields, dodges or fights. | Reworked (D190): the plates and the lift are judged by play (the checker runs every platform). |
| 7 | `freeze_hall` | puzzle | teach: Pause, a frozen enemy as a block | The bug walks a caged lane with one gap across it: freeze it as it passes the gap in front of him, push it out across the hall to the ledge's foot and climb it, inside a 15 s watchdog. | Reworked (D191, D192): freezing it elsewhere in the cage costs time the watchdog barely gives. |

### Shield wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 8 | `bolt_gallery` | hybrid | develop: crates into a pit, targets, under towers | The bridge crate is his step first: two targets two blocks up take a jump shot from its top, pushed under one (the cage and the fragment's pocket), one cell back under the other (the door), then on to the pit with the freed crate. | Reworked (D195): only a crate reaches the targets; from the north the fragment costs the crossing both ways; the towers' pressure is judged by play. |
| 9 | `relay_loft` | puzzle | teach: powered platforms | Ferries carry crates: a small Sokoban on the loft (Microban 45, 1-high walls, 14 pushes) gets two crates into the sockets that run the east ferry and the third onto it; he rides on top, his step to the fragment's 3-high pillar at the far dock. | Reworked (D196): two sockets, not plates, run the ferry to the fragment; the west ferry's plate (the way in) may be held by his own weight or a decoy and the ferry parked. |
| 10 | `ledger_cell` | puzzle | develop: sockets, heavy plate, stacking | Which crate goes where: one fills a socket in the open, the lane's first crate fills a second socket, the next goes west onto the heavy plate and the ledge crate is dropped on it (a stack of two). All three switch the cage over the fragment. | Reworked (D203): a decoy is one weight, so Fork replaces one plate body, never a socket. |

### Scan wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 11 | `scan_lab` | puzzle | teach: Scan, fake blocks | The crate that lifts him to the disk is needed again past the fake wall: pushed into the plinth's corner, it is lost. Past the wall a scan drops a second crate off a fake pillar, and both fill one row of the pit. | Holds. The disk's pocket (gate and fences) could be a `cage`. |
| 12 | `mirror_stacks` | puzzle | develop: Scan's range | Where he casts: the far cage's target hides behind a fake column beyond a scan's 6 units from the near side, so the second scan is cast after crossing. The fragment also needs Fork (the author's move): a revisit. | Holds with Scan and Fork; every crate shows NO EFFECT and the search truncates: check by hand. |
| 13 | `ghost_exit` | puzzle | twist: Scan hides the way out | The way on is hidden: a frozen bug on the plate opens the crate's pen, the crate holds the gate open as it passes and is the step to the plateau, where a scan shows the fragment and the exit. | Reworked (D206): the stair blocks `[2,0,6]` and `[3,0,6]` were a free route and are gone, so the chain is the lock; Fork can hold the plate instead of the bug. |
| 14 | `junction` | hybrid | develop: Pause on a moving enemy, timed plates | The shot's timing: the bug must be frozen two cells before the pillar while it walks towards him, then pushed twice. The fence gate is a one-way shortcut home. | Holds (Pause). |
| 15 | `drift_bay` | action | develop: Shield, enemies as steps | The fight leaves him his step: he rides the ferry under the sentinel's fire, and the virus that meets him is the only step to the fragment, so he freezes it instead of killing it. | Holds; the enemies' roles are judged by play. |

### Pause wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 16 | `cold_stairs` | puzzle | develop: Pause parks a piece behind a barrier, with a clock | Two bugs, two jobs, two casts: each frozen and pushed through a stream (D198) onto its own plate, which a decoy cannot reach; the plates hold the bridge for good. The 5 s freeze is the clock. | Reworked (D204): Fork cannot hold a plate, each bug is needed, `mutate.mjs` says every piece matters. |
| 17 | `warden_pit` | boss | Null Pointer | Cover bars and refills set the fight's rhythm; its teleports break cover. As hard as it should be. Drops fragment 7. | Boss. |
| 18 | `idle_cache` | hybrid | twist: a frozen enemy is the base of a stack | The bug is the first weight: frozen in its lane, pushed onto the heavy plate, and the ledge crate dropped on it; the 5 s freeze is the clock for freeze, push, drop and the run to the caged fragment. The crate dropped first is lost. | Reworked (D205): the stack needs both (`mutate.mjs` says every piece matters with Pause); Fork can still be the base (a decoy is no solid body), but the ledge drop stays. |

### Fork wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 19 | `fork_lab` | puzzle | teach: Fork holds a plate | The crate that opens the disk's cage is then his step into a pen only a decoy can hold: one push too many loses it. | Holds; the pocket's gate is a cage (D209). |
| 20 | `twin_plates` | puzzle | develop: Fork plus Pause, two clocks | The order of clocks: the decoy (10 s) first, the frozen bug (5 s) second, both plates under the bridge; past it a zapped target frees the crate that is the step to the fragment. | Holds (Fork, Pause and Zap). |
| 21 | `guard_loop` | hybrid | develop: Fork as a lure | The step is two crates high: one is pushed through two guards, the other waits on the ledge and drops on it. The decoy pulls the guards off the lane; cast too early and they are back, too late and they block the crate. | Reworked (D207): the plate, bridge and pocket are gone; a 2-high stack (a crate through the guards' lane, a ledge crate dropped on it) is the lock, Fork is a lure and a frozen virus may be the base. |
| 22 | `split_vault` | hybrid | twist: one decoy, two needs | Two crates are handed through a stream wall (he goes round over a divider) into sockets; the cage opens only while a decoy holds a plate in a fenced pocket, with a virus after him as he runs. | Reworked (D208): crates handed through a stream wall into a vault and spent in sockets; a cage on fragment 15 that a decoy keeps open while he runs. |

### The deep end

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 23 | `gatekeeper` | boss | the Gatekeeper | Lure it onto the overload plates, recharge behind cover; as hard as it should be. Drops the energy buff. | Boss. |
| 24 | `core_hall` | goal | the core, the Level 1 locks | No puzzle: the core is the beat. | Outside the mix. |
| 25 | `dj_vault` | reward | teach: the double jump | The reward's first use: the way on is a 2-high door. | Outside the mix. |

The teasers (`frost_gate`, `frost_edge`, `glitch_gate`, `glitch_edge`)
stay look-only and outside the ladder (D186).

### Revisits

- `mirror_stacks`: fragment 0 needs Fork, from the Fork wing.
- Double jump, after Level 1: `warden_pit` west to `buffer_2`;
  `scan_lab` north (with Scan) to `buffer_1`; `mirror_stacks` east (with
  Zap) to `buffer_4`; `guard_loop` east (with Scan) to `buffer_3`.
  `ghost_exit` east to `buffer_5` waits for a later sector's spell.
- Shortcuts: `junction`'s fence gate home, and the Gatekeeper once beaten.

### Mix and gaps

In the mix, 21 rooms: 12 puzzle (57 %), 5 hybrid (24 %), 4 action (19 %),
near the 60/25/15 aim; action runs high because the tutorial teaches
movement. Outside the mix: two bosses, the core hall and the double-jump
vault. Every mechanic is taught before a hybrid uses it; timed plates
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
| `fork_lab`, `twin_plates` | tidy only: the pocket of gate and fences becomes a `cage`. |
| `scan_lab`, `junction`, `drift_bay` | no change. `junction` holds from `--from east` (its north spawn is the one-way side); `drift_bay` is judged by play. |

Order of reviews: `ledger_cell` first (it settles item 3), then
`cold_stairs`, `idle_cache`, `ghost_exit`, `guard_loop`,
`split_vault`, then the tidy-ups.

## Settled with the author

- A web, not a line: a tutorial, an Atrium hub, four wings that cross-link,
  and the central core behind the second boss.
- Spells of the Lattice: Zap, Shield, Pause, Scan, Fork. Pull, Compile,
  Blink, Warp, Cut & Paste and Firewall wait for later sectors.
- The double jump is the reward for access Level 1 (16 fragments).
- 16 fragments in normal rooms, all reachable without Level 1; two secret
  rooms carry an extra one each (18 in the Lattice). Boss 1 drops a
  fragment, boss 2 the +10 energy buff.
- Five Outer Buffer secret rooms, each its own room off a Lattice room.
  Secret rooms are complex: several steps, often with tools found later
  (backtracking, D67); the room a secret hangs off may change (D173).

## Shape

```
              [Vault]  double jump, Level 1 lock
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
| Core (D177) | `core_hall` (the core; Level 1 locks north and east), `dj_vault` (the double jump; its ledge door leads on to Frostbyte) |
| Teasers (D177) | Frostbyte: `frost_gate`, `frost_edge`; Glitchmire: `glitch_gate`, `glitch_edge` (look only) |

Fragments 0–15 are all placed.

## Left to build

Waits for the core (D186): the secret rooms' contents.

| Room | Size | What it is |
|---|---|---|
| `buffer_1` Dead Pixel (5.11) | 8x8 | Secret, a Scan hidden exit in `scan_lab`; entrance built (D183), contents to come |
| `buffer_2` Stray Byte (5.11) | 8x8 | Secret, double jump or Compile up to a ledge in `warden_pit`; entrance built, an extra fragment to come |
| `buffer_3` Null Orbit (5.11) | 8x8 | Secret, a Blink across a caged gap in `guard_loop`; entrance built, an extra fragment to come |
| `buffer_4` Event Horizon (5.11) | 8x8 | Secret, a Warp to a high doorway in `mirror_stacks`; entrance built |
| `buffer_5` Cache Miss (5.11) | 8x8 | Secret, Warp plus Compile or Fork onto a plate in `ghost_exit`; entrance built |
