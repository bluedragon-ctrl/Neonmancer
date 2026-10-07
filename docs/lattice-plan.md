# Home Lattice plan

The plan for Playtest 1's world (D133): what is built and what is left.
Everything not built is a proposal that changes during the author's room
review and design. Steps: docs/design.md, Phases and steps.

## Direction (D186)

The rooms below were built before the gameplay direction was set
(docs/design.md, Gameplay): a push-puzzle adventure with arcade bite,
puzzle, hybrid and action rooms, one trick a room, and later abilities
that skip a room's way through but never a pickup's trick. Every room is
reviewed against it, one room a session (step 5.17), after the ladder
below is written (step 5.16). Other sectors wait: the teasers stay as
they are, the Outer Buffer rooms keep their entrances and wait for
their contents.

## Ladder

To be written in step 5.16: per room in play order, its type (puzzle,
hybrid, action, boss), its rung (teach, develop, twist, revisit) for
which mechanic, and the trick it should have, in one line. Each room
review works against its line; the review may change the line, with the
author's OK.

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
