# Home Lattice plan

The plan for Playtest 1's world (D133): what is built and what is left.
Everything not built is a proposal that changes during the author's room
review and design. Steps: docs/design.md, Phases and steps.

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

## Built (5.5–5.6h)

22 rooms; the room files hold the layouts, the decisions the rules.

| Area | Rooms |
|---|---|
| Tutorial (D148) | `boot_up` (start), `first_steps`, `zap_port` (Zap), `first_light` (watchdog, D172) |
| Hub (D151) | `atrium`, `shield_hall` (Shield), `freeze_hall` (Pause) |
| Shield wing (D156) | `bolt_gallery`, `relay_loft`, `ledger_cell` |
| Pause wing (D157, D162) | `cold_stairs`, `warden_pit` (Null Pointer), `idle_cache` |
| Scan wing (D168, D170) | `scan_lab` (Scan), `mirror_stacks`, `ghost_exit`, `junction`, `drift_bay` |
| Fork wing (D171, D173) | `fork_lab` (Fork), `twin_plates`, `guard_loop`, `split_vault` |

Fragments 0–15 are all placed.

## Left to build

| Room | Size | What it is |
|---|---|---|
| `gatekeeper` (5.7) | 16x16 | Boss 2, a big virus, drops the energy buff; overload plates to lure it onto (D134); at (9,0), joining `drift_bay`'s and `split_vault`'s free sides; the way on to the core |
| `core` (5.8) | 16x16 | The central core, no fragment; Level 1 locks to the teasers and the vault |
| `dj_vault` (5.8) | 8x8 | The double jump, behind the Level 1 lock |
| Teasers (5.8) | small | A few look-only rooms each for Glitchmire and Frostbyte Wastes |
| `buffer_1` (5.9) | 8x8 | Secret, a Scan hidden exit off `ghost_exit` |
| `buffer_2` (5.9) | 8x8 | Secret, a fake block off `mirror_stacks`; an extra fragment |
| `buffer_3` (5.9) | 8x8 | Secret, a decoy lock; off `guard_loop`'s east side (11,1) or another room; an extra fragment |
| `buffer_4` (5.9) | 8x8 | Secret, a double-jump ledge off `atrium` (after Level 1) |
| `buffer_5` (5.9) | 8x8 | Secret, needs Warp or Cut & Paste, off `relay_loft` (a later sector) |
