# Home Lattice plan (step 4.3)

Paper design of the Playtest 1 world: no room files yet. Everything here (rooms, exits, fragments,
secrets) is a proposal and a draft: it changes during the author's room
review and design. Room names are working titles; map cells and sizes are settled when each batch is drafted
(5.5 to 5.9). The author approves the room list below before any room is
made, and it ends as decisions in `docs/decisions.md`.

## Settled with the author

- A new start; Boot Sector, `room_1`, `room_2` and the other test rooms go
  to the dev wing (5.4). No new room attaches to an authored room (D90).
- A web, not a line: a tutorial, an Atrium hub, four wings that cross-link,
  and the central core behind the second boss.
- Spells of the Lattice: Zap, Shield, Pause, Scan, Fork. Pull, Compile,
  Blink, Warp, Cut & Paste and Firewall are advanced and wait for later
  sectors.
- The double jump is a reward for access Level 1 (16 fragments).
- 16 fragments in normal rooms, all reachable without Level 1; secrets are
  extra. Two bosses: the first drops a fragment, the second an upgrade.
- Five Outer Buffer secret rooms, each its own room off a Lattice room.
  Some need Scan; some need a tool the Lattice does not give (double jump,
  Warp, Cut & Paste) and wait for a return visit (D67). Secret rooms are
  complex: several steps, often with tools found later, so backtracking
  is expected. The room a secret hangs off may change (D173).

## Shape

About 30 rooms: 25 normal and 5 Outer Buffer secrets. The Level 1 teaser
rooms for Glitchmire and Frostbyte come on top (5.8).

```
              [Vault]  double jump, Level 1 lock
 Frostbyte~ [  CORE  ] ~Glitchmire      Level 1 locks
              [Gatekeeper]   boss 2 (drops an energy buff)
   [Scan wing]     |     [Fork wing]    both end at the Gatekeeper
   [Shield wing]-[ATRIUM]-[Pause wing]  Pause wing holds boss 1
                   |
               [tutorial x4]
```

The Atrium has no door to the Gatekeeper: the way to the core leads
through the deep end of the Scan wing or the Fork wing, so the wings must
be crossed. Once boss 2 is beaten (it stays away, D104), the Gatekeeper
joins the Scan and Fork wings as a shortcut.

## Map orientation (D149)

The drawing above is schematic. On the world map the tutorial runs west to
east and the hub sits at its end: `boot_up` (5,0), `first_steps`,
`zap_port`, then the Atrium (8,0). Turned to match: the Shield wing lies
north of the Atrium, the Pause wing south, the Scan wing beyond the Shield
wing and the Fork wing beyond the Pause wing, both ending at the Gatekeeper
east of the Atrium, and the core past it. The Atrium has no east door.
A door to a wing that does not exist yet waits for that wing's step (every
exit must be connected), so rooms with such a door stay unflagged until
then. Steps and room order: docs/design.md, Phase 5.

## Room list

| # | Room | Size | What it is |
|---|---|---|---|
| 1 | `boot_up` (start) | 8x8 | Move, jump; a screen with the controls |
| 2 | `first_steps` | 8x8 | Push a crate, plug a hole, a one-block ledge |
| 3 | `zap_port` | 12x12 | The Zap disk; a first bug; a target to shoot |
| 4 | `first_light` | 8x8 | Fragment 1, behind the Zap target |
| 5 | `atrium` | 12x12 | Hub; doors west and east; a pillar-top fragment 2 (crates) |
| 6 | `shield_hall` | 12x12 | Shield disk; a sentinel to hide from |
| 7 | `bolt_gallery` | 12x12 | Shooters and a turret tower; Shield to cross; fragment 3 |
| 8 | `relay_loft` | 12x8 | Platforms over a pit; fragment 4; the door to the Scan wing |
| 9 | `ledger_cell` | 8x8 | A dead end with a plate; fragment 5 |
| 10 | `freeze_hall` | 12x12 | Pause disk; a bug patrol to stop |
| 11 | `cold_stairs` | 12x12 | Frozen enemies as steps over a gap; fragment 6; the door to the Fork wing |
| 12 | `warden_pit` | 14x14 | Boss 1, drops fragment 7; cover blocks, no shrine (D134) |
| 13 | `idle_cache` | 8x10 | Reached after the boss; fragment 8 |
| 14 | `scan_lab` | 12x12 | Scan disk; fake blocks |
| 15 | `mirror_stacks` | 12x12 | Memory walls with fake blocks; fragment 9 |
| 16 | `ghost_exit` | 12x12 | Hidden exit; fragment 10 |
| 17 | `drift_bay` | 12x12 | Combat; fragment 11; opens to the Gatekeeper |
| 18 | `fork_lab` | 12x12 | Fork disk; a decoy-held plate |
| 19 | `twin_plates` | 12x12 | Two plates, one decoy; fragment 12 |
| 20 | `guard_loop` | 12x12 | Viruses to draw away; fragment 13 |
| 21 | `split_vault` | 12x8 | A lock held by a decoy; fragments 14 and 15 |
| 22 | `gatekeeper` | 16x16 | Boss 2, a big virus, drops an energy buff; overload plates to lure it onto (D134); doors north (`drift_bay`), south (`split_vault`), east (the core) (D174) |
| 23 | `core` | 16x16 | The central core, no fragment; Level 1 locks east and west and north (vault) |
| 24 | `dj_vault` | 8x8 | The double jump, behind the Level 1 lock |
| 25 | `junction` | 8x8 | Off `drift_bay`, a small loop back to the Scan wing; fragment 16 |
| S1 | `buffer_1` | 8x8 | Secret, a Scan hidden exit off `ghost_exit` |
| S2 | `buffer_2` | 8x8 | Secret, a fake block off `mirror_stacks` |
| S3 | `buffer_3` | 8x8 | Secret, a decoy lock; off `guard_loop`'s east side (11,1) or another room, settled in 5.9 (D173) |
| S4 | `buffer_4` | 8x8 | Secret, a double-jump ledge off `atrium` (after Level 1) |
| S5 | `buffer_5` | 8x8 | Secret, needs Warp or Cut & Paste, off `relay_loft` (a later sector) |

Fragments: 16 in normal rooms (4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19,
20, 21 twice, 25), none behind Level 1 or boss 2. A first count, to be
rebalanced when the wings are drafted.

## Decided at approval

- Two of the five secret rooms carry an extra fragment (`buffer_2` and
  `buffer_3`): the Lattice holds 18.
- Boss 2 drops an energy buff (+10 energy chip, D93), not a spell upgrade.
- `junction` stays for now; the core is entered only through the Gatekeeper.
- The room count may shift by a few as the wings are drafted.
