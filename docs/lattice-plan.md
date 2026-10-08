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
| 1 | `boot_up` | action | teach: move, jump | The way to the door is up: a 1-high step, then a 1-tile gap, so he learns the jump's height and reach before anything can hurt him. | Start room and shrine; the access pass is test-only. |
| 2 | `first_steps` | puzzle | teach: push, plug a hole | One push fills one cell of the 2-wide hole: the second crate needs a push from a new side, which he reaches across the first. | Holds. |
| 3 | `zap_port` | hybrid | teach: Zap (a target, an enemy, bolts fly level) | The target sits a block up: a floor shot hits the block under it or the bug crossing the line, and the stair he climbed for the disk is his firing step (a jump shot also reaches it). | Reworked (D189). |
| 4 | `first_light` | action | teach: the watchdog, fragments | The straight line is a pit: a zigzag of single jumps round the pits' open ends, inside 10 s. | Holds. |

### Hub

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 5 | `atrium` | puzzle | teach: a crate as a step, a crate dropped off a ledge, a plate, a bridge | The crate he climbs on is not the one for the plate: it lifts him to a ledge, and from there he pushes a second crate off onto the plate, which raises a bridge to a small reward (a boost or a secret star). The doors stay free. | Redesign: a connector now (decorative holes). |
| 6 | `shield_hall` | action | teach: Shield | The disk is easy to reach behind cover; the way out is not: two sentinels cover the open floor to both doors, so he leaves under the Shield he just found. | The sentinels are scenery: put the open floor in their lines. |
| 7 | `freeze_hall` | puzzle | teach: Pause, a frozen enemy as a block | The bug frozen where it walks is a cell short of the ledge: freeze it at the right end of its lane and push it to the ledge's foot, inside 5 s. | Holds (Pause only). |

### Shield wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 8 | `bolt_gallery` | hybrid | develop: crates into a pit, targets, under towers | Each crate is his cover until it drops in: the order he fills the 3-wide pit decides how many cells he crosses in the towers' lines. | Holds (Zap); the towers' pressure is judged by play. |
| 9 | `relay_loft` | puzzle | teach: powered platforms | The ferry he needs runs only while crates hold its plates, and the second crate must come the long way round from the first ferry's far bank. | Fork holds a ferry plate: each ferry needs weight a decoy can't give. |
| 10 | `ledger_cell` | puzzle | develop: plate chains, gates | A relay: crate 1 holds gate 1 while crate 2 comes out, then crate 2 takes over plate 1 so crate 1 can go on, and both plates end held. Order and swaps are the puzzle. | Fork replaces either crate. |

### Scan wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 11 | `scan_lab` | puzzle | teach: Scan, fake blocks | The crate that lifts him to the disk is needed again past the fake wall: pushed into the plinth's corner, it is lost. Past the wall a scan drops a second crate off a fake pillar, and both fill one row of the pit. | Holds. |
| 12 | `mirror_stacks` | puzzle | develop: Scan's range | Where he casts: the far cage's target hides behind a fake column beyond a scan's 6 units from the near side, so the second scan is cast after crossing. The fragment also needs Fork (the author's move): a revisit. | Holds with Scan and Fork; every crate shows NO EFFECT and the search truncates: check by hand. |
| 13 | `ghost_exit` | puzzle | twist: Scan hides the way out | The way on is hidden: a frozen bug on the plate opens the crate's pen, the crate holds the gate open as it passes and is the step to the plateau, where a scan shows the fragment and the exit. | Fork holds the plate instead of the bug. |
| 14 | `junction` | hybrid | develop: Pause on a moving enemy, timed plates | The shot's timing: the bug must be frozen two cells before the pillar while it walks towards him, then pushed twice. The fence gate is a one-way shortcut home. | Holds (Pause). |
| 15 | `drift_bay` | action | develop: Shield, enemies as steps | The fight leaves him his step: he rides the ferry under the sentinel's fire, and the virus that meets him is the only step to the fragment, so he freezes it instead of killing it. | Holds; the enemies' roles are judged by play. |

### Pause wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 16 | `cold_stairs` | puzzle | develop: Pause with a push and a clock | Two bugs, two jobs, two casts: one frozen and pushed onto the plate holds the bridge for 5 s, the other frozen at the ledge is the step; the energy refill across is the cast home. | Fork holds the plate instead of the key bug. |
| 17 | `warden_pit` | boss | Null Pointer | Cover bars and refills set the fight's rhythm; its teleports break cover. As hard as it should be. Drops fragment 7. | Boss. |
| 18 | `idle_cache` | puzzle | twist: two holders that move differently | The order: the crate slides only along the wall, the frozen bug only along its lane, and the bug's 5 s starts the run, so the crate goes first. | Fork replaces the bug. |

### Fork wing

| # | Room | Type | Rung | Trick to aim for | Now |
|---|---|---|---|---|---|
| 19 | `fork_lab` | puzzle | teach: Fork holds a plate | The crate that opens the disk's cage is then his step into a pen only a decoy can hold: one push too many loses it. | Holds. |
| 20 | `twin_plates` | puzzle | develop: Fork plus Pause, two clocks | The order of clocks: the decoy (10 s) first, the frozen bug (5 s) second, both plates under the bridge; past it a zapped target frees the crate that is the step to the fragment. | Holds (Fork, Pause and Zap). |
| 21 | `guard_loop` | hybrid | develop: Fork as a lure | The decoy does two jobs at once: it holds the gate's plate and pulls two viruses off the crate's route. Cast too early and they are back; too late and they guard the crate. | A frozen virus is the step instead of the crate; the lure isn't needed. |
| 22 | `split_vault` | hybrid | twist: one decoy, two needs | The decoy can't do both: the crate holds the way back while the decoy holds the cage's second plate, with a virus after him as he runs. | Holds for fragment 15; fragment 14 by crate or decoy is fine. |

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
fits (`ledger_cell`, `idle_cache`). Collapsing and hazard blocks have no
Lattice room; they wait for the sectors.

Reviews needed for the Fork skips above: `relay_loft`, `ledger_cell`,
`ghost_exit`, `cold_stairs`, `idle_cache`, `guard_loop`; and redesigns
for the rooms whose pieces do nothing: `atrium`, `shield_hall`.

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
