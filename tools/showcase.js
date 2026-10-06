/**
 * Asset showcase: every character and object look side by side, turning
 * slowly on a floor grid, rendered with the game's own renderer (neon
 * lines, bloom, drop shadows). For reviewing looks without playing.
 *
 * Open /tools/showcase.html in the dev server (or on the deployed site).
 * Space pauses the turning; ←/→ turn by hand. `?asset=wizard` shows one
 * asset close up, `?asset=wizard,crate` a few side by side.
 * New assets (monsters, pickups) are added to ASSETS below. Assets can take
 * more room (`span`), animate (`update(dt, time)`, called every frame) and
 * stand still instead of turning (`spin: false`).
 */
import { Color, Group, Vector3 } from 'three';
import defs from '../data/defs.json';
import strings from '../data/strings.json';
import { OBJECT_STYLE_DEFAULTS, resolveBlockTypes, resolveEnemyTemplates, resolveObjectTypes, withEnemyDefaults, withExitDefaults } from '../src/data/room-data.js';
import { VIEW_HEIGHT, frameRoom } from '../src/render/camera.js';
import { JUMP_SPEED, PLAYER } from '../src/entities/player.js';
import { PLAYER_HITBOX } from '../src/core/rules.js';
import { GATE } from '../src/entities/gate.js';
import { PUSHABLE } from '../src/entities/pushable.js';
import {
  ENEMY_MODELS,
  createDropShadow,
  createRails,
  showHitFlash,
} from '../src/render/entity-view.js';
import { createDerez, createPixelBurst, createStream, placeDerez, placePixels, placeStream } from '../src/render/pixels.js';
import { BLOCK_BODY, DEREZ } from '../src/render/derez-fx.js';
import { advance, buildTrack, positionOf, startState } from '../src/world/path.js';
import { HIT_FX, hitFlash, wizardLook } from '../src/render/hit-fx.js';
import { createFloor } from '../src/render/floor.js';
import { PALETTE } from '../src/render/neon.js';
import { Renderer } from '../src/render/renderer.js';
import { ASPECT } from '../src/render/viewport.js';
import { createActiveBlockView, flareHazard } from '../src/render/block-fx.js';
import { createObjectView, createRoomView } from '../src/render/room-view.js';
import { ExitView } from '../src/render/exit-view.js';
import { HOLO_TIME } from '../src/render/holo.js';
import { createWizard } from '../src/render/wizard.js';
import { WizardMotion } from '../src/render/wizard-motion.js';
import { addXray } from '../src/render/xray.js';
import { BUG, BUG_MODEL, animateBug, createBug, setEyeMood } from '../src/render/bug.js';
import { VIRUS, VIRUS_MIDDLE, animateVirus, createVirus } from '../src/render/virus.js';
import { SENTINEL, SENTINEL_MODEL, animateSentinel, createSentinel } from '../src/render/sentinel.js';
import { DISCHARGE, chargeGlow, createDischarge, dischargeLook, placeDischarge } from '../src/render/discharge.js';
import { createAlertMark, placeAlertMark } from '../src/render/alert-mark.js';
import { BOSS, ENEMY } from '../src/entities/enemy.js';
import { BOLT } from '../src/entities/bolt.js';
import { ZAP_FX, damagedGlitch, enemyHitLook } from '../src/render/zap-fx.js';
import { createBolt, createCastFlare, createSparks, placeBolt, placeCastFlare, placeSparks } from '../src/render/zap-view.js';
import { EnergyBar } from '../src/ui/energy-bar.js';
import { createCard } from '../src/render/card.js';
import { createChip } from '../src/render/chip.js';
import { createSecret } from '../src/render/secret.js';
import { createCore } from '../src/render/core-view.js';
import { bodyScale, createArmorShell, createBossMark, teleportLook } from '../src/render/boss-mark.js';
import { dropHeight } from '../src/render/pickup-view.js';
import { createFragment } from '../src/render/fragment.js';
import { DISK, createDisk, diskMotion, poseDisk } from '../src/render/disk.js';
import { BOOST_VOXELS, createBoost } from '../src/render/boost.js';
import { createRefill, refillMotion } from '../src/render/refill.js';
import { INSTALL_FX } from '../src/render/install-fx.js';
import { createInstall, placeInstall } from '../src/render/install-view.js';
import { createShield, placeShield } from '../src/render/shield-view.js';
import { createFirewall, placeFirewall } from '../src/render/firewall-view.js';
import { PAUSE_FX, pauseLook } from '../src/render/pause-fx.js';
import { createPauseCage, placePauseCage } from '../src/render/pause-view.js';
import { warpFlash } from '../src/render/warp-fx.js';
import { createWarpTrail, dashPose, placeWarpTrail } from '../src/render/warp-view.js';
import { createHoleView } from '../src/render/hole-view.js';
import { createLock, createPlate, createTarget, switchLight } from '../src/render/switch-view.js';
import { GateView, createGate } from '../src/render/gate-view.js';
import { SWITCH_KINDS } from '../src/entities/switch.js';
import { FRAGMENT_COLOR } from '../src/entities/pickup.js';
import { CLIP_FX, marqueeLook, pasteGrow } from '../src/render/clip-fx.js';
import { createMarquee, placeMarquee } from '../src/render/clip-view.js';
import { PULL_FX, PULL_PIXELS, pullMarquee, pullPixels } from '../src/render/pull-fx.js';
import { COMPILE_FX, compileLook } from '../src/render/compile-fx.js';
import { DECOY } from '../src/entities/decoy.js';
import { createDecoyModel, placeDecoyModel } from '../src/render/decoy-view.js';
import { streamCount } from '../src/render/stream-fx.js';
import { createWave, placeWave, revealBody } from '../src/render/scan-view.js';
import { SCAN, cellReach, exitReach } from '../src/entities/scan.js';
import { clipIcon } from '../src/ui/clip-icon.js';
import { createJumpRings, placeJumpRings } from '../src/render/jump-view.js';
import { createShrine } from '../src/render/shrine-view.js';
import { WARDEN_MODEL } from '../src/render/warden.js';
import { DAEMON_MODEL } from '../src/render/daemon.js';
import { GOLEM_MODEL } from '../src/render/golem.js';
import { WYRM_MODEL } from '../src/render/wyrm.js';
import { PHISH_MODEL } from '../src/render/phish.js';
import { OVERCLOCK_MODEL } from '../src/render/overclock.js';
import { PIXIE_MODEL } from '../src/render/pixie.js';
import { createDataPillar } from '../src/render/data-pillar.js';
import { createScreen } from '../src/render/screen.js';
import { createMemoryStack } from '../src/render/memory-stack.js';
import biomes from '../data/biomes.json';

/** Block types with variants filled in (D60). */
const BLOCK_TYPES = resolveBlockTypes(defs.blocks);
/** Object types with their variants filled in (D145). */
const OBJECT_TYPES = resolveObjectTypes(defs.objects);

/** Units between two assets (the default span of an asset). */
const SPACING = 3;
/** Turning speed in radians per second. */
const SPIN = 0.6;

/** The D107 enemy looks (see ALL_ASSETS): model, suggested color, and how the showcase runs them. */
const CONCEPTS = [
  { label: 'warden', model: WARDEN_MODEL, color: '#ff5a1f', attack: 'burst', speed: 0.8 },
  { label: 'daemon', model: DAEMON_MODEL, color: '#a45cff', attack: 'arc', speed: 1.5, chaseSpeed: 2.5 },
  { label: 'golem', model: GOLEM_MODEL, color: '#38a8ff', attack: null, speed: 1 },
  { label: 'wyrm', model: WYRM_MODEL, color: '#ffc83a', attack: 'bolt', speed: 2 },
  { label: 'phish', model: PHISH_MODEL, color: '#eef3ff', attack: null, speed: 0, chaseSpeed: 3.5 },
  { label: 'overclock', model: OVERCLOCK_MODEL, color: '#ff6a2a', attack: 'burst', speed: 1.5, chaseSpeed: 3 },
  { label: 'pixie', model: PIXIE_MODEL, color: '#7a7dff', attack: 'bolt', speed: 1.5, chaseSpeed: 2.5 },
];

/** Wyrms in other colors: the plates are shades of any body color. */
const WYRM_COLORS = ['#ffc83a', '#3dff9a', '#4f7dff', '#c05cff'];

/**
 * Showcased assets: a label and a function building the model centered on
 * the origin, standing on y = 0.
 */
const ALL_ASSETS = [
  // The wizard standing (breathing, hands floating, blinking); walking a
  // square with stops, so the hat trails and wobbles; jumping in place.
  { label: 'wizard', build: buildWizardIdle, shadow: PALETTE.magenta },
  { label: 'wizard-walk', span: 4, spin: false, build: buildWizardWalk },
  { label: 'wizard-jump', build: buildWizardJump, shadow: PALETTE.magenta },
  // Action poses: pushing a crate a cell (hands on it, leaning in), casting
  // ahead and then to his side, dropping into a hole (flailing).
  { label: 'wizard-push', span: 4, spin: false, build: buildWizardPush },
  { label: 'wizard-cast', spin: false, shadow: PALETTE.magenta, build: buildWizardCast },
  { label: 'wizard-hole', span: 3, spin: false, build: buildWizardHole },
  { label: 'wizard-hit', build: buildWizardHit, shadow: PALETTE.magenta },
  // The derez (D126): everything that is gone breaks up the same way, in
  // its own colors, from its own body: the wizard, a crate, a bug, a
  // sentinel and a data disk side by side, together, in a loop.
  { label: 'derez', span: 5, spin: false, build: buildDerez },
  // The stream (D127): pixels carried from one place to another the same
  // way in every spell: out of a crate into a point (Cut), from a point
  // into a crate (Paste, Compile), and from the wizard's body to his body
  // further on (Warp), in a loop.
  { label: 'stream', span: 5, spin: false, build: buildStream },
  // Every object type from defs.json, in its own style (glass crates, D96:
  // a data core, or empty thinner glass in a destructible one, D99);
  // switches have their own looks (below), and so have the core (D101) and
  // decorations (D117).
  ...Object.entries(OBJECT_TYPES).filter(([, props]) => !SWITCH_KINDS.includes(props.kind) && props.kind !== 'core' && props.kind !== 'deco').map(([type, props]) => ({
    label: type,
    build: () => {
      const view = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...props, at: [0, 0, 0] });
      view.position.set(-0.5, 0, -0.5);
      return new Group().add(view);
    },
  })),
  // Animated looks of the damaging block types (block-fx.js); the hazard
  // flares every 2 s as if it just hurt the wizard.
  { label: 'block-hazard', build: () => buildActiveBlock('hazard') },
  { label: 'block-void', build: () => buildActiveBlock('void') },
  { label: 'blocks-in-room', span: 5.5, build: buildBlocksInRoom },
  // Fences (D167): see-through, the wizard walks behind them.
  { label: 'fence-in-room', span: 5.5, build: buildFenceInRoom },
  // Glass (D96): every crate type is glass (above). Hazard blocks as glass
  // are an option not used yet; then a room corner with glass crates
  // stacked beside the old tinted crate, the wizard walking behind them.
  { label: 'glass-hazard', group: 'glass', build: () => buildActiveBlock('hazard', { glass: true }) },
  { label: 'glass-in-room', group: 'glass', span: 5.5, build: buildGlassInRoom },
  { label: 'exits', span: 5.5, build: buildExits },
  { label: 'platforms', span: 5.5, build: buildPlatforms },
  // Spiked platforms (D82): a hopper bobbing up and down, a slider gliding
  // along the floor; the hopper flares every 2 s as if it just hurt the wizard.
  { label: 'spiked-platforms', span: 5.5, build: buildSpikedPlatforms },
  { label: 'collapsing-cycle', span: 4.5, build: buildCollapsingCycle },
  // Bugs (D48): walking hops in each mood, one being bounced on, a pop.
  { label: 'bug', group: 'bugs', build: () => buildBug('hostile') },
  { label: 'bug-provoked', group: 'bugs', build: () => buildBug('provoked') },
  { label: 'bug-peaceful', group: 'bugs', build: () => buildBug('peaceful') },
  { label: 'bug-bounce', group: 'bugs', build: () => buildBug('hostile', { bounced: true }) },
  { label: 'bug-pop', group: 'bugs', build: buildBugPop },
  // Any enemy (D78): a bug noticing the wizard ("!"), and a bug with a
  // burst discharge instead of its touch attack.
  { label: 'bug-alert', group: 'bugs', build: buildBugAlert },
  { label: 'bug-burst', group: 'bugs', span: 4, spin: false, build: () => buildBurst('bug') },
  // The bolt attack (D80): a shooter (a stationary bug) charging and
  // firing a slow shot in its color at the wizard.
  { label: 'bug-bolt', group: 'bugs', span: 6, spin: false, build: buildBoltShot },
  // Bolt patterns and bounces (D81): a tower (the cron look, D83) firing
  // four ways, hitting the wizard on an axis, then missing him in a corner;
  // a ricochet glancing a bolt off a crate into the wizard.
  { label: 'bolt-cross', group: 'bolts', span: 6, spin: false, build: buildBoltCross },
  { label: 'bolt-ricochet', group: 'bolts', span: 6, spin: false, build: buildBoltRicochet },
  // Viruses (D78): gliding calm, then after the wizard
  // ("!"); the burst discharge on the wizard; a pop.
  { label: 'virus', group: 'viruses', build: buildVirus },
  { label: 'virus-attack', group: 'viruses', span: 4, spin: false, build: () => buildBurst('virus') },
  { label: 'virus-pop', group: 'viruses', build: buildVirusPop },
  // Sentinels (D78): calm, then after the wizard; the arc discharge
  // (range 5), aimed, then fired: once hitting him, once missing as he
  // steps aside; a pop.
  { label: 'sentinel', group: 'sentinels', build: buildSentinel },
  { label: 'sentinel-attack', group: 'sentinels', span: 7, spin: false, build: buildSentinelAttack },
  { label: 'sentinel-pop', group: 'sentinels', build: buildSentinelPop },
  // Cron, worm and crawler looks (D83): a tower (the cron) calm, then after
  // the wizard and charging, its dial holding the grid; a worm (patrol)
  // inching along; a crawler (chase) on six legs; calm, then after the
  // wizard (faster); their pops.
  { label: 'cron', group: 'crons', build: buildCron },
  { label: 'cron-pop', group: 'crons', build: () => buildEnemyPop('cron') },
  { label: 'worm', group: 'worms', build: () => buildWalker('worm') },
  { label: 'worm-pop', group: 'worms', build: () => buildEnemyPop('worm') },
  { label: 'crawler', group: 'crawlers', build: () => buildWalker('crawler') },
  { label: 'crawler-pop', group: 'crawlers', build: () => buildEnemyPop('crawler') },
  // The D107 looks (no defs.json template uses them yet): a Firewall
  // Warden (a knight of firewall) with a burst, a daemon (a wisp) with an
  // arc, a golem (a server rack, meant solid), a wyrm (a dragon of data
  // packets) with a bolt, a phish (a fake data disk that springs on legs),
  // an overclock (a burning processor) with a burst, a pixie (a butterfly
  // with pixel wings) with a bolt; calm, then after the
  // wizard and attacking, in a loop; their pops; wyrms in other colors.
  ...CONCEPTS.flatMap(({ label, model, color, ...options }) => [
    { label, group: 'concepts', build: () => buildConcept(model, color, options) },
    { label: `${label}-pop`, group: 'concept-pops', build: () => buildConceptPop(model, color) },
  ]),
  { label: 'wyrm-colors', span: 6, build: buildWyrmColors },
  // Bosses (D134, D135): the boss mark, three gold rings round a normal
  // body, sized to its height. A bug boss calm, then awake, teleporting
  // (squeezed to a line and back); a virus two cubes high whose plate
  // armor shuts (a white dashed shell round it, flashing as a hit glances
  // off, rings drawn in) and opens (the shell lifts away, the rings spread
  // and spin fast);
  // a boss's drop falling into its cell once it is beaten.
  { label: 'boss-bug', group: 'bosses', build: buildBossBug },
  { label: 'boss-tall', group: 'bosses', span: 3.5, build: buildBossTall },
  { label: 'boss-drop', group: 'bosses', spin: false, build: buildBossDrop },
  // Zap: the bolt close up, two hits on a bug (the second pops
  // it), and rapid fire at a crate until the energy bar runs dry.
  { label: 'zap-bolt', group: 'zap', build: buildZapBolt },
  { label: 'zap-bug', group: 'zap', span: 6, build: buildZapBug },
  { label: 'zap-crate', group: 'zap', span: 5, build: buildZapCrate },
  { label: 'zap-break', group: 'zap', span: 5, build: buildZapBreak },
  // X-ray: the wizard walking behind a wall shows through it; the
  // turntable stands still so the wall stays in front.
  { label: 'xray', span: 5.5, spin: false, build: buildXray },
  // Data disks: spinning on their own with the spell's slot
  // as one lit bit (Zap: slot 0), a found one as a ghost, a pick-up in a
  // loop, and all 16 slots.
  { label: 'disk', group: 'disks', spin: false, build: () => buildDisk() },
  { label: 'disk-ghost', group: 'disks', spin: false, build: () => buildDisk({ ghost: true }) },
  { label: 'disk-collect', group: 'disks', spin: false, build: buildDiskCollect },
  { label: 'disk-in-room', group: 'disks', span: 5.5, spin: false, build: buildDiskInRoom },
  { label: 'disk-slots', group: 'disks', span: 6, spin: false, build: buildDiskSlots },
  { label: 'disk-shield', group: 'disks', spin: false, build: () => buildDisk(defs.spells.shield) },
  { label: 'disk-firewall', group: 'disks', spin: false, build: () => buildDisk(defs.spells.firewall) },
  { label: 'disk-pause', group: 'disks', spin: false, build: () => buildDisk(defs.spells.pause) },
  { label: 'disk-blink', group: 'disks', spin: false, build: () => buildDisk(defs.spells.blink) },
  { label: 'disk-warp', group: 'disks', spin: false, build: () => buildDisk(defs.spells.warp) },
  { label: 'disk-cut-paste', group: 'disks', spin: false, build: () => buildDisk(defs.spells.cut_paste) },
  { label: 'disk-pull', group: 'disks', spin: false, build: () => buildDisk(defs.spells.pull) },
  { label: 'disk-compile', group: 'disks', spin: false, build: () => buildDisk(defs.spells.compile) },
  { label: 'disk-fork', group: 'disks', spin: false, build: () => buildDisk(defs.spells.fork) },
  { label: 'disk-scan', group: 'disks', spin: false, build: () => buildDisk(defs.spells.scan) },
  // Installing a spell (D73): Zap, then Shield, in a loop.
  { label: 'install', spin: false, shadow: PALETTE.magenta, build: buildInstall },
  // Shield (D73): up for its duration, blinking before it ends.
  { label: 'shield', spin: false, shadow: PALETTE.magenta, build: buildShield },
  // Shield blocking (D84): a shooter's bolt is absorbed at
  // the ring in sparks, and the ring flares.
  { label: 'shield-block', span: 6, spin: false, build: buildShieldBlock },
  // Firewall (D84): flames licking up from a low ring, up for its
  // duration, blinking before it ends.
  { label: 'firewall', spin: false, shadow: PALETTE.magenta, build: buildFirewall },
  // Pause (D85): the wizard fires a Pause bolt at a
  // hopping bug, which freezes in its pose for the spell's duration,
  // tinted, in a cage of corner brackets, blinking before it thaws.
  { label: 'pause', span: 6, spin: false, build: buildPauseFreeze },
  // Blink and Warp (D86): the wizard dashes over a
  // two-tile pit and back (Blink); he bursts into pixels that stream
  // across and back (Warp).
  { label: 'blink', group: 'warp', span: 6, spin: false, build: () => buildWarp('blink') },
  { label: 'warp', group: 'warp', span: 6, spin: false, build: () => buildWarp('warp') },
  // Refills (temporary pickups): integrity and energy, hovering and spinning
  // like a disk; picked up the same way; beside a disk and the wizard for scale.
  { label: 'refill-integrity', group: 'refills', spin: false, build: () => buildRefill('integrity') },
  { label: 'refill-energy', group: 'refills', spin: false, build: () => buildRefill('energy') },
  { label: 'refill-collect', group: 'refills', spin: false, build: buildRefillCollect },
  ...Object.keys(BOOST_VOXELS).map((effect) => ({ label: `boost-${effect}`, group: 'refills', spin: false, build: () => buildBoost(effect) })),
  { label: 'pickups-in-room', group: 'refills', span: 5.5, spin: false, build: buildPickupsInRoom },
  // The access pass (for testing): a gold card, its lit bit the level it grants.
  { label: 'access-pass', group: 'refills', spin: false, build: () => buildCard({ color: FRAGMENT_COLOR, slot: defs.pickups.access_pass_3.level }) },
  // Buff chips (D93): permanent buffs, a chip in the
  // stat's color with pins, its icon on the front and the save bit on the
  // back; a found one as a gray ghost; all three in a row beside a disk.
  { label: 'chip-integrity', group: 'chips', spin: false, build: () => buildChip({ stat: 'integrity', slot: 0 }) },
  { label: 'chip-energy', group: 'chips', spin: false, build: () => buildChip({ stat: 'energy', slot: 4 }) },
  { label: 'chip-recharge', group: 'chips', spin: false, build: () => buildChip({ stat: 'recharge', slot: 9 }) },
  { label: 'chip-ghost', group: 'chips', spin: false, build: () => buildChip({ stat: 'energy', slot: 4, ghost: true }) },
  { label: 'chips-row', group: 'chips', span: 4, spin: false, build: buildChipRow },
  // Upgrades (D95): an upgrade is an expansion card, its
  // contact fingers in the upgrade's color and its slot lit in the bit grid;
  // a found one as a gray ghost; the three in a row beside the Zap disk.
  // Shield+ is the Shield's ring in its color; the double jump kicks
  // off hexagonal rings in mid-air.
  { label: 'upgrade-zap-plus', group: 'upgrades', spin: false, build: () => buildCard(defs.pickups.upgrade_zap_plus) },
  { label: 'upgrade-shield-plus', group: 'upgrades', spin: false, build: () => buildCard(defs.pickups.upgrade_shield_plus) },
  { label: 'upgrade-jump', group: 'upgrades', spin: false, build: () => buildCard(defs.pickups.upgrade_double_jump) },
  { label: 'upgrade-ghost', group: 'upgrades', spin: false, build: () => buildCard({ ...defs.pickups.upgrade_shield_plus, ghost: true }) },
  { label: 'upgrades-row', group: 'upgrades', span: 4, spin: false, build: buildUpgradeRow },
  { label: 'shield-plus', group: 'upgrades', spin: false, shadow: PALETTE.magenta, build: () => buildShield(defs.pickups.upgrade_shield_plus.color) },
  { label: 'double-jump', group: 'upgrades', span: 4, spin: false, build: buildDoubleJump },
  // Secrets (D100): a star in the wizard's magenta; a
  // found one as a gray ghost; beside a disk, a chip and the energy refill.
  { label: 'secret', group: 'secrets', spin: false, build: () => buildSecret({}) },
  { label: 'secret-ghost', group: 'secrets', spin: false, build: () => buildSecret({ ghost: true }) },
  { label: 'secrets-row', group: 'secrets', span: 4, spin: false, build: buildSecretRow },
  // Fragments and access (D101): a gold tile carrying the boot key with
  // its own module lit (a dark one and a light one), beside a disk and a
  // found one as a gray ghost; the core stepping through the access levels
  // and fragments found, flashing as a level is reached; access locks
  // asking for level 1 (a doorway) and 2 (a front exit), opening as he
  // reaches them; the wizard's hat with 0–3 gold bands.
  { label: 'fragment', group: 'fragments', spin: false, build: () => buildFragment({}) },
  { label: 'fragment-ghost', group: 'fragments', spin: false, build: () => buildFragment({ ghost: true }) },
  { label: 'fragments-row', group: 'fragments', span: 4, spin: false, build: buildFragmentRow },
  { label: 'core', group: 'fragments', span: 2.5, spin: false, build: buildCore },
  { label: 'access-locks', group: 'fragments', span: 5.5, spin: false, build: buildAccessLocks },
  { label: 'wizard-access', group: 'fragments', span: 2.5, spin: false, shadow: PALETTE.magenta, build: buildWizardAccess },
  // Switches and locked exits (D75): a target zapped on
  // and off; a plate pressed by a crate dropping on it, then by the wizard;
  // a room with a locked doorway and a locked front exit (both panels)
  // whose lights follow its two switches.
  { label: 'target', group: 'switches', span: 5, spin: false, build: buildTargetZap },
  { label: 'plate', group: 'switches', span: 4, spin: false, build: buildPlate },
  { label: 'locks-in-room', group: 'switches', span: 5.5, spin: false, build: buildLocks },
  // Exits into the Outer Buffer (D183): stars drift out; a lock there is dark indigo glass.
  { label: 'star-exits', group: 'switches', span: 6, spin: false, build: buildStarExits },
  // Timed switches (D140): a target and a plate switched on, blinking ever
  // faster as their time runs out, then off; a gate and a bridge on one
  // plate: the gate sinks as the bridge rises, and back.
  { label: 'timed-switches', group: 'switches', span: 4, spin: false, build: buildTimedSwitches },
  { label: 'gates', group: 'switches', span: 4.5, spin: false, build: buildGates },
  // Cut & Paste (D87): the wizard cuts the crate in front
  // of him (a marquee snaps on, it streams into his hands as pixels), holds
  // it, and pastes it back (the pixels stream into a marquee, it grows in);
  // the aim marker before, the ghost while he holds it. The same with a
  // frozen bug; the HUD's clipboard slot, empty, with a crate and with a
  // frozen bug (its disk: disk-cut-paste).
  { label: 'cut-paste', group: 'cut-paste', span: 4.5, spin: false, build: () => buildCutPaste('crate') },
  { label: 'cut-paste-enemy', group: 'cut-paste', span: 4.5, spin: false, build: () => buildCutPaste('bug') },
  { label: 'clip-hud', group: 'cut-paste', span: 1, spin: false, build: buildClipHud },
  // Pull (D124): the aim marker on the crate (or bug) three cells ahead;
  // he casts, a marquee snaps on, rings of green pixels flow from it into
  // his hands and it slides one cell towards him (its disk: disk-pull).
  { label: 'pull', group: 'pull', span: 5, spin: false, build: () => buildPull('crate') },
  { label: 'pull-enemy', group: 'pull', span: 5, spin: false, build: () => buildPull('bug') },
  // Compile (D125): the aim marker on the free cell in front of him; he
  // casts, gold bits fly from his hands into it and a dashed crate grows
  // in; it blinks, faster at the end, and derezzes (shortened here from
  // 7 s; its disk: disk-compile).
  { label: 'compile', span: 4, spin: false, build: buildCompile },
  // Fork (D129): the aim marker on the free cell in front of him; he casts,
  // blue bits fly from his hands into it and a hologram of him grows in;
  // it blinks, faster at the end, and derezzes (shortened here from 10 s;
  // its disk: disk-fork).
  { label: 'fork', span: 4, spin: false, build: buildFork },
  // Scan (D128): the wizard casts, a violet square wave spreads from his
  // feet over the floor; a fake block in the wall beside him derezzes, then
  // a hidden doorway in the back wall opens (its disk: disk-scan).
  { label: 'scan', span: 9, spin: false, build: buildScan },
  // Backup shrine (D97): a glowing floor tile in the
  // wizard's magenta; he steps on and it flares.
  { label: 'shrine', spin: false, build: buildShrine },
  // Home Lattice's ambience (D179): glass panels in the back walls; the
  // data flows run on the rooms' floor grid.
  { label: 'lattice-ambience', span: 5.5, spin: false, build: buildLatticeAmbience },
  // Data pillar (decoration): glass round a core (like the crates), data up
  // its +z face or its +x face, and in every biome's color. Decorations are
  // seen only from the game's fixed angle (D115), so they stand still.
  { label: 'pillar', group: 'pillars', spin: false, build: () => buildDeco(createDataPillar, { face: '+z' }) },
  { label: 'pillar-x', group: 'pillars', spin: false, build: () => buildDeco(createDataPillar, { face: '+x' }) },
  { label: 'pillar-biomes', group: 'pillars', span: 7, spin: false, build: () => buildDecoRow(createDataPillar, {}) },
  // Screen (decoration): a glass terminal on a slab, facing +z or +x, and
  // in every biome's color (the slab; the screen stays blue).
  { label: 'screen', group: 'screens', spin: false, build: () => buildDeco(createScreen, { face: '+z' }) },
  { label: 'screen-x', group: 'screens', spin: false, build: () => buildDeco(createScreen, { face: '+x' }) },
  // A screen with a text not read yet (D118): its top light blinks, the code runs faster.
  { label: 'screen-text', group: 'screens', spin: false, build: () => buildDeco(createScreen, { face: '+z' }, (screen) => screen.userData.setWaiting(true)) },
  { label: 'screen-biomes', group: 'screens', span: 7, spin: false, build: () => buildDecoRow(createScreen, {}) },
  // Memory stack (decoration, D123): glass plates with chips, facing +z or
  // +x; stacks make a memory wall (3 wide, 2 high: the light runs across it
  // in step); in every biome's color.
  { label: 'memory', group: 'memory', spin: false, build: () => buildDeco(createMemoryStack, { face: '+z' }) },
  { label: 'memory-x', group: 'memory', spin: false, build: () => buildDeco(createMemoryStack, { face: '+x' }) },
  { label: 'memory-wall', group: 'memory', span: 4, spin: false, build: buildMemoryWall },
  { label: 'memory-biomes', group: 'memory', span: 7, spin: false, build: () => buildDecoRow(createMemoryStack, {}) },
];

/** A decoration (`create` from its module) in the default room color. */
function buildDeco(create, options, setup = () => {}) {
  const deco = create({ color: PALETTE.amber, ...options });
  setup(deco);
  deco.position.set(-0.5, 0, -0.5);
  const asset = new Group().add(deco);
  asset.userData.update = (dt) => deco.userData.update(dt);
  return asset;
}

/** A decoration in every biome's color, in a row. */
function buildDecoRow(create, options) {
  const colors = Object.values(biomes.biomes).map((biome) => biome.color);
  const decos = colors.map((color, i) => {
    const deco = create({ color, ...options });
    const t = (i - (colors.length - 1) / 2) * 0.8;
    deco.position.set(t - 0.5, 0, -t - 0.5);
    return deco;
  });
  const asset = new Group().add(...decos);
  asset.userData.update = (dt) => decos.forEach((deco) => deco.userData.update(dt));
  return asset;
}

/** Memory stacks as a wall facing +z, 3 wide and 2 high, each told its cell. */
function buildMemoryWall() {
  const stacks = [];
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 2; y++) {
      const stack = createMemoryStack({ color: PALETTE.amber, face: '+z', cell: [x, y, 0] });
      stack.position.set(x - 1.5, y, -0.5);
      stacks.push(stack);
    }
  }
  const asset = new Group().add(...stacks);
  asset.userData.update = (dt) => stacks.forEach((stack) => stack.userData.update(dt));
  return asset;
}

/** A backup shrine; the wizard walks onto it every few seconds and it flares. */
function buildShrine() {
  const shrine = createShrine();
  shrine.position.set(-0.5, 0, -0.5);
  const wizard = createWizard();
  wizard.rotation.y = Math.PI / 2;
  const asset = new Group().add(shrine, wizard);
  const loop = 5;
  let time = 0;
  asset.userData.update = (dt) => {
    time += dt;
    const t = time % loop;
    // 0–1 s: he walks in from −x; 1–3 s he stands on it; 3–4 s he walks on; then gone for a second.
    const x = t < 1 ? -1.5 + t * 1.5 : t < 3 ? 0 : (t - 3) * 1.5;
    wizard.visible = t < 4;
    wizard.position.set(x, 0, 0);
    if (t - dt < 1 && t >= 1) shrine.userData.use();
    shrine.userData.update(dt);
  };
  return asset;
}

/** Switch color, from defs.json. */
const SWITCH_COLOR = OBJECT_TYPES.target.color;

/** The wizard zapping a target on and off. */
function buildTargetZap() {
  const asset = new Group();
  const zapper = new Zapper(asset, -1.8, 0.3);
  const target = createTarget(SWITCH_COLOR);
  target.position.set(0.3, 0, -0.5);
  asset.add(target);
  let on = false;
  let wait = 40;
  let carry = 0;
  asset.userData.update = (dt) => {
    for (carry += dt * 60; carry >= 1; carry--) {
      if (--wait <= 0) {
        zapper.cast();
        wait = 90;
      }
      if (zapper.tick() > 0) {
        on = !on;
        target.userData.set(on, { hit: true });
      }
    }
    zapper.sync();
    target.userData.update(dt);
  };
  return asset;
}

/**
 * A plate in a floor patch: a crate drops on it, sits, slides off; then the
 * wizard walks over it and stops on it for a moment.
 */
function buildPlate() {
  const asset = new Group();
  const plate = createPlate(SWITCH_COLOR);
  plate.position.set(-0.5, 0, -0.5);
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 0] });
  const wizard = createWizard();
  wizard.rotation.y = Math.PI / 2;
  asset.add(plate, crate, wizard);
  const loop = 6;
  let time = 0;
  asset.userData.update = (dt) => {
    time = (time + dt) % loop;
    // 0–2.2 s: the crate drops (0.35 s) and sits; 2.2–2.6 s it slides off +z and vanishes.
    let cy = 1.6 - 0.5 * 20 * Math.min(time, 0.4) ** 2;
    cy = Math.max(0, cy);
    const slide = Math.max(0, Math.min(1, (time - 2.2) / 0.4));
    crate.visible = time < 2.6;
    crate.position.set(-0.5, cy, -0.5 + slide);
    // 3–6 s: the wizard walks in from −x, stands on it 3.6–5 s, walks on.
    const wx = time < 3 ? -3 : time < 3.6 ? -1.5 + (time - 3) * 2.5 : time < 5 ? 0 : (time - 5) * 2.5;
    wizard.visible = time >= 3;
    wizard.position.set(wx, 0, 0);
    const onCrate = crate.visible && cy < 0.05 && slide < 0.5;
    const onWizard = wizard.visible && Math.abs(wx) < 0.5;
    plate.userData.set(onCrate || onWizard);
    plate.userData.update(dt);
  };
  return asset;
}

/** A small Home Lattice room corner with two glass panels, glowing and flickering now and then (D181). */
function buildLatticeAmbience() {
  const size = [4, 3, 4];
  const panels = [{ side: '-x', u: 1, v: 1 }, { side: '-z', u: 2, v: 2 }];
  const view = createRoomView({ size, blocks: {}, blockTypes: BLOCK_TYPES, color: PALETTE.amber, panels });
  const room = new Group().add(view);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  asset.userData.update = (dt) => view.userData.update(dt);
  return asset;
}

/**
 * Two locked exits of a small room (a back doorway, a front exit) with two
 * switches: they come on one by one, the exits open, then one goes off and
 * they close again.
 */
function buildLocks() {
  const size = [4, 3, 4];
  const exits = [withExitDefaults({ id: 'back', side: '-z', at: 1 }), withExitDefaults({ id: 'front', side: '+x', at: 1 })];
  const flows = [new ExitView(exits[0], size, PALETTE.magenta), new ExitView(exits[1], size, PALETTE.cyan)];
  const locks = exits.map((exit) => createLock(exit, size, { color: SWITCH_COLOR, switches: 2 }));
  const target = createTarget(SWITCH_COLOR);
  target.position.set(0, 0, 3);
  const plate = createPlate(SWITCH_COLOR);
  plate.position.set(2, 0, 2);
  const room = new Group().add(
    createRoomView({ size, blocks: {}, blockTypes: BLOCK_TYPES, exits, color: PALETTE.amber }),
    ...flows.map((v) => v.group),
    ...locks,
    target,
    plate,
  );
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  let time = 0;
  asset.userData.update = (dt) => {
    time = (time + dt) % 7;
    // 1 s: the target comes on; 2.5 s: the plate; 5 s: the target goes off.
    const targetOn = time > 1 && time < 5;
    const plateOn = time > 2.5;
    target.userData.set(targetOn, { hit: Math.abs(time - 1) < dt || Math.abs(time - 5) < dt });
    plate.userData.set(plateOn);
    const lit = Number(targetOn) + Number(plateOn);
    for (const [i, lock] of locks.entries()) {
      lock.userData.set({ lit, open: lit === 2 });
      lock.userData.update(dt);
      flows[i].group.visible = lock.userData.openness > 0.5;
      flows[i].update(dt);
    }
    target.userData.update(dt);
    plate.userData.update(dt);
  };
  return asset;
}

/** A timed target and a timed plate (D140): on, counting down 3 s with a quickening blink, off. */
function buildTimedSwitches() {
  const target = createTarget(SWITCH_COLOR, { timed: true });
  target.position.set(-1.5, 0, -0.5);
  const plate = createPlate(SWITCH_COLOR, { timed: true });
  plate.position.set(0.5, 0, -0.5);
  const asset = new Group().add(target, plate);
  const timer = 3;
  let time = 0;
  asset.userData.update = (dt) => {
    time = (time + dt) % 5;
    const on = time > 0.5 && time < 0.5 + timer;
    const countdown = on ? 1 - (time - 0.5) / timer : null;
    target.userData.set(switchLight(on, countdown, time), { hit: Math.abs(time - 0.5) < dt });
    plate.userData.set(switchLight(on, countdown, time));
    target.userData.update(dt);
    plate.userData.update(dt);
  };
  return asset;
}

/** A gate and a bridge (D140) on one plate: pressed, the gate sinks and the bridge rises. */
function buildGates() {
  const plate = createPlate(SWITCH_COLOR);
  plate.position.set(-2, 0, -0.5);
  const gate = createGate(SWITCH_COLOR, { lights: 1 });
  gate.position.set(-0.5, 0, -0.5);
  const bridge = createGate(SWITCH_COLOR, { lights: 1, closed: false });
  bridge.position.set(1, 0, -0.5);
  const asset = new Group().add(plate, gate, bridge);
  let time = 0;
  asset.userData.update = (dt) => {
    time = (time + dt) % 6;
    const on = time > 1 && time < 4;
    plate.userData.set(on);
    gate.userData.set({ closed: !on, lit: Number(on) });
    bridge.userData.set({ closed: on, lit: Number(on) });
    for (const view of [plate, gate, bridge]) view.userData.update(dt);
  };
  return asset;
}

/** The wizard installing Zap, then Shield, then an integrity buff, in a loop. */
function buildInstall() {
  const wizard = createWizard();
  wizard.rotation.y = Math.PI / 4;
  const views = [createInstall(createDisk(defs.spells.zap)), createInstall(createDisk(defs.spells.shield)), createInstall(createChip({ stat: 'integrity', slot: 0 }))];
  for (const view of views) view.rotation.y = Math.PI / 4;
  const asset = new Group().add(wizard, ...views);
  const loop = INSTALL_FX.ticks + 50;
  let tick = 0;
  let round = 0;
  asset.userData.update = (dt) => {
    tick += dt * 60;
    if (tick >= loop) [tick, round] = [tick - loop, round + 1];
    const shown = views[round % views.length];
    for (const view of views) view.visible = view === shown;
    // Before it starts: the disk still hanging in front of him.
    placeInstall(shown, wizard, [0, 0, 0], Math.max(0, tick - 20));
    if (tick >= 20 + INSTALL_FX.ticks) wizard.userData.flash.amount.value = 0;
  };
  return asset;
}

/** The wizard casting Shield: up for its duration, then down for a moment. */
function buildShield(color = defs.spells.shield.color) {
  const wizard = createWizard();
  wizard.rotation.y = Math.PI / 4;
  const shield = createShield(color);
  const asset = new Group().add(wizard, shield);
  const ticks = Math.round(defs.spells.shield.duration * 60);
  const loop = ticks + 50;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    placeShield(shield, [0, 0, 0], tick, ticks);
  };
  return asset;
}

/** The wizard casting Firewall: up for its duration, then down for a moment. */
function buildFirewall() {
  const wizard = createWizard();
  wizard.rotation.y = Math.PI / 4;
  const ring = createFirewall(defs.spells.firewall.color);
  const asset = new Group().add(wizard, ring);
  const ticks = Math.round(defs.spells.firewall.duration * 60);
  const loop = ticks + 50;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    placeFirewall(ring, [0, 0, 0], tick, ticks);
  };
  return asset;
}

/**
 * Shield blocking (D84) in a loop: a bug shooting bolts (SHOOTER_DEMO)
 * charges and fires at the wizard with his Shield up; the bolt stops at the
 * ring in sparks, the ring flares, he is unhurt.
 */
function buildShieldBlock() {
  const { color, attackColor, attackCharge, boltSpeed } = enemyValues('bug', SHOOTER_DEMO);
  const u = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const bug = createBug(color);
  bug.position.set(u[0] * -2, 0, u[2] * -2);
  bug.rotation.y = Math.atan2(u[0], u[2]);
  const wizard = createWizard();
  wizard.position.set(u[0] * 2, 0, u[2] * 2);
  wizard.rotation.y = Math.atan2(-u[0], -u[2]);
  const shield = createShield(defs.spells.shield.color);
  const asset = new Group().add(bug, wizard, shield);
  const eyes = [bug.position.x, ENEMY.eyeHeight, bug.position.z];
  const middle = [wizard.position.x, PLAYER_HITBOX[1] / 2, wizard.position.z];
  // Level enough: it stops where its box meets the ring (PLAYER.shieldRadius).
  const stop = towards3(eyes, middle, Math.hypot(...middle.map((v, k) => v - eyes[k])) - PLAYER.shieldRadius - BOLT.size / 2);
  const from = towards3(eyes, stop, BOLT.reach);
  const runs = boltRuns(asset, attackColor, [[from, stop]], boltSpeed);
  const charge = Math.round(attackCharge * 60);
  loopBoltAttack(asset, { model: bug, animate: animateBug, markHeight: BUG_MODEL.markHeight, charge, runs, wizard, hit: Infinity });
  const attack = asset.userData.update;
  const loop = Math.ceil(charge + runs.ticks[0] + 80);
  const up = 10000;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    attack(dt, time);
    tick = (tick + dt * 60) % loop;
    placeShield(shield, wizard.position.toArray(), 100 + tick, up, tick - charge - runs.ticks[0]);
  };
  return asset;
}

/**
 * Pause (D85) in a loop: the wizard at the left fires a Pause bolt at a
 * bug hopping in place on the right; it freezes in its pose, tinted, in
 * its cage, blinks before it thaws, and hops on.
 */
function buildPauseFreeze() {
  const { color: pauseColor, speed: boltSpeed, duration } = defs.spells.pause;
  const asset = new Group();
  const wizard = createWizard();
  wizard.position.x = -2.2;
  wizard.rotation.y = Math.PI / 2;
  const flare = createCastFlare();
  const bolt = createBolt(pauseColor);
  const sparks = createSparks(pauseColor);
  const { color, speed } = defs.enemies.bug;
  const bug = createBug(color);
  bug.position.x = 1.5;
  bug.rotation.y = -Math.PI / 2;
  const cage = createPauseCage(pauseColor);
  asset.add(wizard, flare, bolt, sparks, bug, cage);

  const start = -2.2 + ZAP_FX.reach;
  const stop = 1.5 - ENEMY_HALF;
  const cast = 40;
  const hit = cast + ((stop - start) / boltSpeed) * 60;
  const ticks = Math.round(duration * 60);
  const loop = Math.ceil(hit + ticks + 80);
  let tick = 0;
  let frozenAt = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    placeCastFlare(flare, [-2.2, 0, 0], Math.PI / 2, tick - cast);
    const flown = tick - cast;
    const traveled = (Math.max(0, flown) / 60) * boltSpeed;
    bolt.visible = flown >= 0 && tick < hit;
    if (bolt.visible) placeBolt(bolt, [start + traveled, ZAP_FX.height, 0], [1, 0, 0], flown, traveled);
    placeSparks(sparks, [stop, ZAP_FX.height, 0], [1, 0, 0], tick - hit);
    const look = pauseLook(tick - hit, ticks);
    // Frozen: it keeps the pose it was hit in.
    if (!look.frozen) frozenAt = time;
    animateBug(bug, { state: 'walk', walked: (look.frozen ? frozenAt : time) * speed });
    bug.userData.flash.amount.value = look.frozen && look.on ? PAUSE_FX.tint * look.grow : 0;
    bug.userData.flash.color.value.set(pauseColor);
    placePauseCage(cage, [1.5, 0, 0], look);
  };
  return asset;
}

/**
 * Blink or Warp (D86) in a loop: the wizard crosses a two-tile pit, 3
 * units, waits, and comes back the same way: a Blink dash (drawn short of
 * where he is, stretched, streaks and a kick) or a Warp (pixels, and he
 * flashes in its color as he lands).
 */
function buildWarp(spell) {
  const { color } = defs.spells[spell];
  const wizard = createWizard();
  const pit = createHoleView([[0, 0], [1, 0]], PALETTE.amber);
  pit.position.set(-1, 0, -0.5);
  const trail = createWarpTrail(color, spell);
  const asset = new Group().add(pit, wizard, trail);
  const left = [-1.5, 0, 0];
  const right = [1.5, 0, 0];
  // Across at tick 40, back at tick 130; loop 220.
  const casts = [
    { at: 40, from: left, to: right, facing: Math.PI / 2 },
    { at: 130, from: right, to: left, facing: -Math.PI / 2 },
  ];
  const loop = 220;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const last = [...casts].reverse().find((cast) => tick >= cast.at) ?? { ...casts[1], at: casts[1].at - loop };
    const since = tick - last.at;
    const warp = since < PLAYER.warpTicks ? { spell, ...last } : null;
    const { pos, stretch } = dashPose(warp, last.to, since);
    wizard.position.set(...pos);
    wizard.rotation.y = last.facing;
    wizard.scale.set(1 / Math.sqrt(stretch), 1 / Math.sqrt(stretch), stretch);
    placeWarpTrail(trail, warp, since);
    wizard.userData.flash.amount.value = spell === 'warp' ? warpFlash(since) : 0;
    wizard.userData.flash.color.value.set(color);
  };
  return asset;
}

/** For scale: a disk on the floor and one on a block, the wizard and a crate beside them, in a 4×4 room corner. */
function buildDiskInRoom() {
  const room = new Group().add(createRoomView({ size: [4, 3, 4], blocks: { block: [[3, 0, 1]] }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }));
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 2] });
  const wizard = createWizard();
  wizard.position.set(1.5, 0, 2.5);
  wizard.rotation.y = Math.PI / 4;
  const floorDisk = createDisk();
  floorDisk.position.set(2.5, 0, 2.5);
  const ledgeDisk = createDisk({ ghost: true });
  ledgeDisk.position.set(3.5, 1, 1.5);
  room.add(crate, wizard, floorDisk, ledgeDisk);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  asset.userData.update = (dt, time) => {
    poseDisk(floorDisk, diskMotion({ time }));
    poseDisk(ledgeDisk, diskMotion({ time, ghost: true }));
  };
  return asset;
}

/** A data disk idling (a ghost spins without the bob). */
function buildDisk(options = {}) {
  const disk = createDisk(options);
  const asset = new Group().add(disk);
  asset.userData.update = (dt, time) => poseDisk(disk, diskMotion({ time, ghost: options.ghost }));
  return asset;
}

/** A buff chip idling. */
function buildChip(options) {
  const chip = createChip(options);
  const asset = new Group().add(chip);
  asset.userData.update = (dt, time) => poseDisk(chip, diskMotion({ time, ghost: options.ghost }));
  return asset;
}

/** A secret idling. */
function buildSecret(options) {
  const secret = createSecret(options);
  const asset = new Group().add(secret);
  asset.userData.update = (dt, time) => poseDisk(secret, diskMotion({ time, ghost: options.ghost }));
  return asset;
}

/** A fragment idling. */
function buildFragment(options) {
  const fragment = createFragment(options);
  const asset = new Group().add(fragment);
  asset.userData.update = (dt, time) => poseDisk(fragment, diskMotion({ time, ghost: options.ghost }));
  return asset;
}

/** Two fragments (a dark module, a light one: slots 0 and 11) beside a data disk and a found fragment. */
function buildFragmentRow() {
  const models = [createFragment({ slot: 0 }), createFragment({ slot: 11 }), createDisk(), createFragment({ slot: 36, ghost: true })];
  const asset = new Group();
  models.forEach((model, i) => {
    const along = (i - 1.5) * 0.9;
    model.position.set(along, 0, -along);
    asset.add(model);
  });
  asset.userData.update = (dt, time) => models.forEach((model, i) => poseDisk(model, diskMotion({ time: time + i * 0.7, ghost: i === 3 })));
  return asset;
}

/**
 * A core stepping through the game (pure timing): every 2.5 s a quarter
 * more of the fragments; a level at 16, 32 and 48 of 64 (world.json).
 * @param {number} time seconds
 */
function coreStage(time) {
  const found = Math.floor((time % 12.5) / 2.5) * 16;
  return { level: Math.min(3, Math.floor(found / 16)), share: found / 64 };
}

/** The core, stepping through the levels. */
function buildCore() {
  const core = createCore({ color: OBJECT_TYPES.core.color });
  core.position.set(-0.5, 0, -0.5);
  const asset = new Group().add(core);
  let level = -1;
  asset.userData.update = (dt, time) => {
    const stage = coreStage(time);
    if (stage.level > level && level >= 0) core.userData.flash();
    level = stage.level;
    core.userData.set(stage);
    core.userData.update(dt);
  };
  return asset;
}

/**
 * Exits into the Outer Buffer (D183): a back doorway and a front exit with
 * drifting stars, then the same two locked, behind dark indigo glass, one
 * opening and closing in turn.
 */
function buildStarExits() {
  const size = [4, 3, 5];
  const color = biomes.biomes.outer_buffer.color;
  const exits = [
    withExitDefaults({ id: 'back', side: '-z', at: 1 }),
    withExitDefaults({ id: 'front', side: '+x', at: 1 }),
    withExitDefaults({ id: 'back2', side: '-x', at: 2 }),
  ];
  const views = exits.map((exit) => new ExitView(exit, size, color, { stars: true }));
  const dark = new Color(color).multiplyScalar(0.28);
  const lock = createLock(exits[2], size, { color, switches: 1, dark });
  const room = new Group().add(createRoomView({ size, blocks: {}, blockTypes: BLOCK_TYPES, exits, color: PALETTE.amber }), ...views.map((v) => v.group), lock);
  room.position.set(-2, 0, -2.5);
  const asset = new Group().add(room);
  let time = 0;
  asset.userData.update = (dt) => {
    time = (time + dt) % 6;
    const open = time > 3;
    lock.userData.set({ lit: open ? 1 : 0, open });
    lock.userData.update(dt);
    views[2].group.visible = lock.userData.openness > 0.5;
    for (const view of views) view.update(dt);
  };
  return asset;
}

/** A room with a doorway asking for access level 1 and a front exit asking for 2; he reaches 1, then 2. */
function buildAccessLocks() {
  const size = [4, 3, 4];
  const exits = [withExitDefaults({ id: 'back', side: '-z', at: 1, access: 1 }), withExitDefaults({ id: 'front', side: '+x', at: 1, access: 2 })];
  const flows = [new ExitView(exits[0], size, PALETTE.magenta), new ExitView(exits[1], size, PALETTE.cyan)];
  const locks = exits.map((exit) => createLock(exit, size, { color: SWITCH_COLOR, switches: 0, access: exit.access }));
  const room = new Group().add(createRoomView({ size, blocks: {}, blockTypes: BLOCK_TYPES, exits, color: PALETTE.amber }), ...flows.map((v) => v.group), ...locks);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  let time = 0;
  asset.userData.update = (dt) => {
    time = (time + dt) % 7;
    const level = time > 4.5 ? 2 : time > 2 ? 1 : 0;
    for (const [i, lock] of locks.entries()) {
      lock.userData.set({ open: level >= exits[i].access, accessOk: level >= exits[i].access });
      lock.userData.update(dt);
      flows[i].group.visible = lock.userData.openness > 0.5;
      flows[i].update(dt);
    }
  };
  return asset;
}

/** The wizard with his access bands: none, then one, two and three. */
function buildWizardAccess() {
  const wizard = createWizard();
  const asset = new Group().add(wizard);
  asset.userData.update = (dt, time) => {
    wizard.rotation.y = time * SPIN;
    wizard.userData.setAccess(Math.floor(time / 1.5) % 4);
  };
  return asset;
}

/** The secret beside a disk, a chip and the energy refill to compare. */
function buildSecretRow() {
  const models = [createSecret(), createDisk(), createChip({ stat: 'energy', slot: 4 }), createRefill('energy')];
  const asset = new Group();
  models.forEach((model, i) => {
    const along = (i - 1.5) * 0.9;
    model.position.set(along, 0, -along);
    asset.add(model);
  });
  asset.userData.update = (dt, time) => models.forEach((model, i) => poseDisk(model, diskMotion({ time: time + i * 0.7 })));
  return asset;
}

/** The three buff chips in a row along the screen's horizontal, a data disk at the end for scale. */
function buildChipRow() {
  const models = [createChip({ stat: 'integrity', slot: 0 }), createChip({ stat: 'energy', slot: 4 }), createChip({ stat: 'recharge', slot: 9 }), createDisk()];
  const asset = new Group();
  models.forEach((model, i) => {
    const along = (i - 1.5) * 0.9;
    model.position.set(along, 0, -along);
    asset.add(model);
  });
  asset.userData.update = (dt, time) => models.forEach((model, i) => poseDisk(model, diskMotion({ time: time + i * 0.7 })));
  return asset;
}

/** An upgrade card idling. */
function buildCard(options) {
  const card = createCard(options);
  const asset = new Group().add(card);
  asset.userData.update = (dt, time) => poseDisk(card, diskMotion({ time, ghost: options.ghost }));
  return asset;
}

/** The three upgrade cards in a row along the screen's horizontal, the Zap disk first to compare. */
function buildUpgradeRow() {
  const upgrades = ['upgrade_zap_plus', 'upgrade_shield_plus', 'upgrade_double_jump'].map((id) => createCard(defs.pickups[id]));
  const models = [createDisk(defs.spells.zap), ...upgrades];
  const asset = new Group();
  models.forEach((model, i) => {
    const along = (i - 1.5) * 0.9;
    model.position.set(along, 0, -along);
    asset.add(model);
  });
  asset.userData.update = (dt, time) => models.forEach((model, i) => poseDisk(model, diskMotion({ time: time + i * 0.7 })));
  return asset;
}

/**
 * The wizard double jumping on the spot (D95): a jump, a second one at its
 * top (the kick-off rings stay where he was), down again, a pause.
 */
function buildDoubleJump() {
  const wizard = createWizard();
  wizard.rotation.y = Math.PI / 4;
  const rings = createJumpRings();
  const asset = new Group().add(wizard, rings);
  const g = PLAYER.gravity / 3600;
  const v = JUMP_SPEED / 60;
  // Second jump at the top of the first; each is v per tick, less g per tick.
  const top = v / g;
  const height = (t) => (t <= top ? v * t - (g * t * t) / 2 : Math.max(0, PLAYER.jumpHeight + v * (t - top) - (g * (t - top) ** 2) / 2));
  const land = top + (v + Math.sqrt(v * v + 2 * g * PLAYER.jumpHeight)) / g;
  const loop = land + 40;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    wizard.position.y = height(tick);
    const since = tick - top;
    placeJumpRings(rings, [0, PLAYER.jumpHeight, 0], since >= 0 && since <= PLAYER.airJumpTicks ? since : null);
  };
  return asset;
}

/** A refill idling. */
function buildRefill(stat) {
  const refill = createRefill(stat);
  const asset = new Group().add(refill);
  asset.userData.update = (dt, time) => poseDisk(refill, refillMotion(diskMotion({ time })));
  return asset;
}

/** A boost (D152) idling. */
function buildBoost(effect) {
  const boost = createBoost(effect);
  const asset = new Group().add(boost);
  asset.userData.update = (dt, time) => poseDisk(boost, refillMotion(diskMotion({ time })));
  return asset;
}

/** Both refills picked up every 2 s, a moment apart. */
function buildRefillCollect() {
  const asset = new Group();
  const { body, riseTicks } = DISK.collect;
  const items = ['integrity', 'energy'].map((stat, i) => {
    const model = createRefill(stat);
    model.position.x = i === 0 ? -0.6 : 0.6;
    const pixels = createDerez(body, [model.userData.color, 0xffffff]);
    asset.add(model, pixels);
    return { model, pixels, start: 50 + i * 20 };
  });
  const loop = 140;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    for (const { model, pixels, start } of items) {
      const collected = tick >= start ? tick - start : undefined;
      const motion = refillMotion(diskMotion({ time, collected }));
      poseDisk(model, motion);
      placeDerez(pixels, collected === undefined ? null : collected - riseTicks, [model.position.x, motion.y, 0]);
    }
  };
  return asset;
}

/** For scale: both refills and a disk on the floor of a 4×4 room corner, the wizard beside them. */
function buildPickupsInRoom() {
  const room = new Group().add(createRoomView({ size: [4, 3, 4], blocks: { block: [[3, 0, 1]] }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }));
  const wizard = createWizard();
  wizard.position.set(1.2, 0, 2.6);
  wizard.rotation.y = Math.PI / 4;
  const items = [
    [createRefill('integrity'), [2.5, 0, 2.5], true],
    [createRefill('energy'), [1.5, 0, 1.5], true],
    [createDisk(), [3.5, 1, 1.5], false],
  ];
  for (const [model, at] of items) {
    model.position.set(...at);
    room.add(model);
  }
  room.add(wizard);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  asset.userData.update = (dt, time) => {
    items.forEach(([model, , refill], i) => {
      const motion = diskMotion({ time: time + i * 0.7 });
      poseDisk(model, refill ? refillMotion(motion) : motion);
    });
  };
  return asset;
}

/** All 16 spell slots facing the camera, four rows of four, slot 0 at the top left. */
function buildDiskSlots() {
  const asset = new Group();
  for (let slot = 0; slot < 16; slot++) {
    const disk = createDisk({ slot });
    // Along the screen's horizontal (x = -z in the iso view), rows stepping towards the camera.
    const along = ((slot % 4) - 1.5) * 1.1;
    const row = Math.floor(slot / 4) - 1.5;
    disk.position.set(along + row * 1.1, 0, -along + row * 1.1);
    poseDisk(disk, { ...diskMotion({ time: 0, ghost: true }), angle: Math.PI / 4 });
    asset.add(disk);
  }
  return asset;
}

/** A data disk picked up every 2 s: it rises, flashes and derezzes, then comes back. */
function buildDiskCollect() {
  const disk = createDisk();
  const { body, riseTicks } = DISK.collect;
  const pixels = createDerez(body, [disk.userData.color, disk.userData.glyphColor]);
  const asset = new Group().add(disk, pixels);
  const loop = 120;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const collected = tick >= 50 ? tick - 50 : undefined;
    const motion = diskMotion({ time, collected });
    poseDisk(disk, motion);
    placeDerez(pixels, collected === undefined ? null : collected - riseTicks, [0, motion.y, 0]);
  };
  return asset;
}

/**
 * A 4×4 room corner with a 2-high wall and a crate along the front; the
 * wizard walks back and forth behind them, hit now and then (the flash
 * shows through too).
 */
function buildXray() {
  const cells = [[1, 0, 3], [2, 0, 3], [1, 1, 3], [2, 1, 3]];
  const room = new Group().add(createRoomView({ size: [4, 3, 4], blocks: { block: cells }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }));
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 3] });
  const wizard = createWizard();
  addXray(wizard);
  const motion = new WizardMotion(wizard);
  room.add(crate, wizard);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  const loop = 360;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    // Back and forth along x, behind the crate and the wall.
    const t = tick / loop;
    const leg = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const x = t < 0.5 ? 0.5 + leg * 3 : 3.5 - leg * 3;
    wizard.position.set(x, 0, 2.2);
    wizard.rotation.y = t < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    motion.update({ dt, time, pos: [x, 0, 2.2], facing: wizard.rotation.y, grounded: true, moving: true, vy: 0 });
    const hit = Math.floor(tick) % 180;
    showHitFlash(wizard, hitFlash({ invulnerable: hit < 60 ? PLAYER.invulnerableTicks - hit : 0, dead: false }));
  };
  return asset;
}

/**
 * The wizard zapping a destructible crate (crate_cross): it breaks into
 * pixels on the hit and comes back for the next round.
 */
function buildZapBreak() {
  const asset = new Group();
  const zapper = new Zapper(asset, -1.8, 0.8);
  const props = OBJECT_TYPES.crate_cross;
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...props, at: [0, 0, 0] });
  crate.position.set(0.8, 0, -0.5);
  const pixels = createDerez(BLOCK_BODY, [props.color, 0xffffff]);
  asset.add(crate, pixels);

  const loop = 180;
  let carry = 0;
  let tick = 0;
  let broke = Infinity;
  asset.userData.update = (dt) => {
    for (carry += dt * 60; carry >= 1; carry--) {
      tick = (tick + 1) % loop;
      if (tick === 0) broke = Infinity;
      if (tick === 40) zapper.cast();
      if (zapper.tick()) broke = 0;
      broke++;
    }
    zapper.sync();
    crate.visible = broke === Infinity;
    placeDerez(pixels, broke, [1.3, 0, 0]);
  };
  return asset;
}

/** A Zap bolt flying back and forth through the turntable's middle. */
function buildZapBolt() {
  const bolt = createBolt();
  const asset = new Group().add(bolt);
  let tick = 0;
  asset.userData.update = (dt) => {
    tick += dt * 60;
    const traveled = ((tick * defs.spells.zap.speed) / 60) % 3;
    placeBolt(bolt, [0, ZAP_FX.height, traveled - 1.5], [0, 0, 1], tick, traveled);
  };
  return asset;
}

/**
 * The wizard at `x0` facing +x, casting bolts that fly until they reach
 * `stopX` (the target's face) and burst into sparks there. Steps in whole
 * ticks, like the game.
 */
class Zapper {
  constructor(parent, x0, stopX) {
    this.x0 = x0;
    this.stopX = stopX;
    this.wizard = createWizard();
    this.wizard.position.x = x0;
    this.wizard.rotation.y = Math.PI / 2;
    this.flare = createCastFlare();
    this.bolts = [0, 1, 2, 3].map(() => ({ view: createBolt(), live: false, age: 0, traveled: 0 }));
    this.sparks = [0, 1, 2, 3].map(() => ({ view: createSparks(), tick: Infinity, x: 0 }));
    this.castTick = Infinity;
    parent.add(this.wizard, this.flare, ...this.bolts.map((b) => b.view), ...this.sparks.map((s) => s.view));
  }

  cast() {
    this.castTick = 0;
    const bolt = this.bolts.find((b) => !b.live);
    if (bolt) Object.assign(bolt, { live: true, age: 0, traveled: 0 });
  }

  /** One tick; returns how many bolts hit the target. */
  tick() {
    this.castTick++;
    let hits = 0;
    for (const spark of this.sparks) spark.tick++;
    for (const bolt of this.bolts) {
      if (!bolt.live) continue;
      bolt.age++;
      bolt.traveled += defs.spells.zap.speed / 60;
      if (this.x0 + ZAP_FX.reach + bolt.traveled >= this.stopX) {
        bolt.live = false;
        hits++;
        const spark = this.sparks.reduce((a, b) => (a.tick > b.tick ? a : b));
        Object.assign(spark, { tick: 0, x: this.stopX });
      }
    }
    return hits;
  }

  sync() {
    placeCastFlare(this.flare, [this.x0, 0, 0], Math.PI / 2, this.castTick);
    for (const bolt of this.bolts) {
      bolt.view.visible = bolt.live;
      if (bolt.live) placeBolt(bolt.view, [this.x0 + ZAP_FX.reach + bolt.traveled, ZAP_FX.height, 0], [1, 0, 0], bolt.age, bolt.traveled);
    }
    for (const spark of this.sparks) placeSparks(spark.view, [spark.x, ZAP_FX.height, 0], [1, 0, 0], spark.tick);
  }
}

/**
 * The wizard zapping a bug (integrity 2): the first hit flashes and squashes
 * it and leaves it glitching now and then; the second pops it. It comes back
 * for the next round.
 */
function buildZapBug() {
  const asset = new Group();
  const zapper = new Zapper(asset, -2.2, 1.5 - ENEMY_HALF);
  const { color, integrity } = defs.enemies.bug;
  const bug = createBug(color);
  bug.position.x = 1.5;
  bug.rotation.y = -Math.PI / 2;
  const pixels = createDerez(BUG.derez, [color, 0xffffff]);
  pixels.position.x = 1.5;
  asset.add(bug, pixels);

  const loop = 220;
  let carry = 0;
  let tick = 0;
  let hp = integrity;
  let hitTick = null;
  let popTick = Infinity;
  asset.userData.update = (dt, time) => {
    for (carry += dt * 60; carry >= 1; carry--) {
      tick = (tick + 1) % loop;
      if (tick === 0) [hp, hitTick, popTick] = [integrity, null, Infinity];
      if (tick === 20 || tick === 90) zapper.cast();
      if (hitTick !== null) hitTick++;
      popTick++;
      if (zapper.tick() && hp > 0) {
        hp--;
        hitTick = 0;
        if (hp === 0) popTick = 0;
      }
    }
    zapper.sync();
    bug.visible = hp > 0;
    const hit = enemyHitLook(hitTick);
    const glitch = hp > 0 && hp < integrity && hit.flash === 0 ? damagedGlitch(tick, 1) : { shift: 0, flash: 0 };
    animateBug(bug, { time, squash: hit.squash, shift: glitch.shift });
    const flash = Math.max(hit.flash, glitch.flash);
    bug.userData.flash.amount.value = flash;
    bug.userData.flash.color.value.set(hit.flash > 0 && hit.color === 'white' ? 0xffffff : PALETTE.cyan);
    placeDerez(pixels, popTick, [0, 0, 0]);
  };
  return asset;
}

/** Half the enemy hitbox width: where a bolt meets a bug. */
const ENEMY_HALF = 0.3;

/**
 * Rapid fire at a crate, one bolt per cooldown, draining the energy bar
 * (top left); with too little left the cast fails (the bar flashes), and
 * he waits until it has recharged completely.
 */
function buildZapCrate() {
  const asset = new Group();
  const zapper = new Zapper(asset, -1.8, 0.8);
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 0] });
  crate.position.set(0.8, 0, -0.5);
  asset.add(crate);

  const { cost, cooldown } = defs.spells.zap;
  const bar = new EnergyBar(renderer.hud, strings.strings['hud.energy']);
  let energy = PLAYER.maxEnergy;
  let wait = 30;
  let recharging = false;
  let carry = 0;
  let charge = 0;
  asset.userData.update = (dt) => {
    for (carry += dt * 60; carry >= 1; carry--) {
      // One unit every energyTicks, as the wizard recharges.
      if (energy < PLAYER.maxEnergy && ++charge >= PLAYER.energyTicks) [energy, charge] = [energy + 1, 0];
      zapper.tick();
      if (recharging) {
        if (energy >= PLAYER.maxEnergy) [recharging, wait] = [false, 30];
      } else if (--wait <= 0) {
        if (energy >= cost) {
          energy -= cost;
          zapper.cast();
          wait = Math.round(cooldown * 60) + 2;
        } else {
          bar.deny();
          recharging = true;
        }
      }
    }
    zapper.sync();
    bar.set(energy, PLAYER.maxEnergy);
  };
  return asset;
}

/**
 * A bug in a mood, hopping as it walks (3 cells per second); `bounced`:
 * it stands still and the wizard bounces off it every 1.2 s instead.
 * @param {'hostile'|'provoked'|'peaceful'} mood
 */
function buildBug(mood, { bounced = false } = {}) {
  const { color, speed } = defs.enemies.bug;
  const bug = createBug(color);
  setEyeMood(bug, mood);
  const asset = new Group().add(bug);
  asset.userData.update = (dt, time) => {
    animateBug(bug, bounced ? { time, bounced: ((time % 1.2) / 1.2) * 72 } : { state: 'walk', walked: time * speed });
  };
  return asset;
}

/**
 * How much a showcased enemy is after the wizard at `time`: calm for 3 s,
 * then after him for 3 s (ramping up and down over a quarter second).
 */
function alertAt(time) {
  const t = time % 6;
  return Math.min(1, Math.max(0, Math.min((t - 3) * 4, (6 - t) * 4)));
}

/**
 * A "!" for a showcased enemy, added to `asset` over `at` (the middle by
 * default); returns a function that shows it (alert over half) at `height`.
 * @param {Group} asset
 * @param {number} height
 * @param {import('three').Vector3} [at]
 */
function addMark(asset, height, at) {
  const mark = createAlertMark();
  if (at) mark.position.set(at.x, 0, at.z);
  asset.add(mark);
  return (alert, time) => placeAlertMark(mark, alert, time, height);
}

/**
 * An enemy model's white glow `attack` ticks into its attack (null: none),
 * as EnemyView shows it.
 */
function showGlow(model, attack, charge) {
  model.userData.flash.amount.value = chargeGlow(dischargeLook(attack, charge));
  model.userData.flash.color.value.set(0xffffff);
}

/** A virus gliding calm, then after the wizard, in a loop. */
function buildVirus() {
  const virus = createVirus(defs.enemies.virus.color);
  const asset = new Group().add(virus);
  const mark = addMark(asset, VIRUS.markHeight);
  asset.userData.update = (dt, time) => {
    animateVirus(virus, { state: 'walk', time, alert: alertAt(time) });
    mark(alertAt(time), time);
  };
  return asset;
}

/** A bug walking, noticing the wizard now and then ("!"). */
function buildBugAlert() {
  const { color, speed } = defs.enemies.bug;
  const bug = createBug(color);
  const asset = new Group().add(bug);
  const mark = addMark(asset, BUG_MODEL.markHeight);
  asset.userData.update = (dt, time) => {
    animateBug(bug, { state: 'walk', walked: time * speed });
    mark(alertAt(time), time);
  };
  return asset;
}

/**
 * The wizard hit `since` ticks ago (null or negative: not hit): flashing,
 * then blinking while invulnerable.
 * @param {Group} wizard
 * @param {number|null} since
 */
function showWizardHit(wizard, since) {
  const invulnerable = since !== null && since >= 0 ? Math.max(0, PLAYER.invulnerableTicks - Math.floor(since)) : 0;
  showHitFlash(wizard, hitFlash({ invulnerable, dead: false }));
  wizard.visible = wizardLook({ invulnerable, dead: false, deathCause: null, deathTimer: 0 }, PLAYER.deathTicks).visible;
}

/**
 * A burst discharge in a loop, by an enemy of type `type` (defs.json, its
 * color, charge and range) next to the wizard: it charges, then bursts;
 * he flashes when it hits him.
 * @param {'virus'|'bug'} type
 */
function buildBurst(type) {
  const values = defs.enemies[type];
  const color = values.color;
  const charge = Math.round((values.attackCharge ?? 0.4) * 60);
  const model = type === 'virus' ? createVirus(color) : createBug(color);
  // Side by side on screen (the row runs along +x −z), 1.1 apart.
  model.position.set(-0.39, 0, 0.39);
  model.rotation.y = (Math.PI * 3) / 4;
  const discharge = createDischarge({ color, shape: 'burst', range: values.attackRange ?? 1.2 });
  const wizard = createWizard();
  wizard.position.set(0.39, 0, -0.39);
  wizard.rotation.y = -Math.PI / 4;
  const asset = new Group().add(model, discharge, wizard);
  const mark = addMark(asset, type === 'virus' ? VIRUS.markHeight : BUG_MODEL.markHeight, model.position);
  const loop = 120;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const attack = tick < charge + DISCHARGE.ticks ? tick : null;
    if (type === 'virus') animateVirus(model, { time, alert: 1, attack, charge });
    else animateBug(model, { time, attack, charge });
    showGlow(model, attack, charge);
    mark(1, time);
    placeDischarge(discharge, attack === null ? null : Math.floor(attack), charge, [model.position.x, ENEMY.eyeHeight, model.position.z]);
    showWizardHit(wizard, tick - charge);
  };
  return asset;
}

/**
 * An enemy template from defs.json, filled in (D79) with every default;
 * `demo` changes some for a showcase loop (a bolt attack on a bug).
 */
function enemyValues(id, demo = {}) {
  return withEnemyDefaults({ ...resolveEnemyTemplates(defs.enemies)[id], ...demo });
}

/** The bolt demos' shooter: a bug firing slow bolts (D80). */
const SHOOTER_DEMO = { attack: 'bolt', attackCharge: 0.6, boltSpeed: 4 };

/** The bouncing bolt demo's ricochet: a virus firing a faster bolt (D81). */
const RICOCHET_DEMO = { attack: 'bolt', attackCharge: 0.6, boltSpeed: 5, boltBounces: 2 };

/**
 * Bolts (D80, D81) flying along `routes` at `speed`, in `color`: each route
 * a polyline, its first point where the bolt leaves, one per bolt; sparks
 * at every bounce and where it stops. Returns `update(flown)` (ticks since
 * they were fired, negative before) and each route's flight in ticks.
 * @param {Group} asset the bolts and sparks are added to
 */
function boltRuns(asset, color, routes, speed) {
  const runs = routes.map((points) => {
    const legs = points.slice(1).map((to, i) => {
      const from = points[i];
      const d = to.map((v, k) => v - from[k]);
      const length = Math.hypot(...d);
      return { from, to, dir: d.map((c) => c / length), length };
    });
    const bolt = createBolt(color);
    const sparks = legs.map(() => createSparks(color));
    asset.add(bolt, ...sparks);
    return { legs, bolt, sparks, length: legs.reduce((sum, leg) => sum + leg.length, 0) };
  });
  const update = (flown) => {
    const traveled = (Math.max(0, flown) / 60) * speed;
    for (const { legs, bolt, sparks, length } of runs) {
      bolt.visible = flown >= 0 && traveled < length;
      let start = 0;
      legs.forEach((leg, i) => {
        const end = start + leg.length;
        if (bolt.visible && traveled >= start && traveled < end) {
          placeBolt(bolt, leg.from.map((f, k) => f + leg.dir[k] * (traveled - start)), leg.dir, flown, traveled);
        }
        placeSparks(sparks[i], leg.to, leg.dir, flown >= 0 && traveled >= end ? ((traveled - end) / speed) * 60 : -1);
        start = end;
      });
    }
  };
  return { update, ticks: runs.map(({ length }) => (length / speed) * 60) };
}

/** The point `distance` from `from` towards `to`. */
const towards3 = (from, to, distance) => {
  const d = to.map((v, k) => v - from[k]);
  const length = Math.hypot(...d);
  return from.map((f, k) => f + (d[k] / length) * distance);
};

/**
 * A charged bolt attack in a loop: `model` charges, then `runs` fly;
 * `hit` is the tick (after firing) the wizard is hit, if he is.
 */
function loopBoltAttack(asset, { model, animate, markHeight, charge, runs, wizard, hit }) {
  const mark = addMark(asset, markHeight, model.position);
  const loop = Math.ceil(charge + Math.max(...runs.ticks) + 80);
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const attack = tick < charge + ENEMY.dischargeTicks ? tick : null;
    animate(model, { time, alert: 1, attack, charge });
    showGlow(model, attack, charge);
    mark(1, time);
    const flown = tick - charge;
    runs.update(flown);
    showWizardHit(wizard, flown >= hit ? flown - hit : null);
  };
}

/** Where a bolt from eyes at `eyes` stops at the wizard standing at `feet` (his box, half 0.3, and its own). */
function boltStopAtWizard(eyes, feet) {
  const middle = [feet[0], PLAYER_HITBOX[1] / 2, feet[2]];
  return towards3(eyes, middle, Math.hypot(...middle.map((v, k) => v - eyes[k])) - PLAYER_HITBOX[0] / 2 - BOLT.size / 2);
}

/**
 * The bolt attack (D80) in a loop: a bug shooting bolts (SHOOTER_DEMO)
 * charges, then fires a slow shot in its attack color at the wizard 4
 * away; it bursts into sparks on him and he flashes.
 */
function buildBoltShot() {
  const { color, attackColor, attackCharge, boltSpeed } = enemyValues('bug', SHOOTER_DEMO);
  // Along the row on screen.
  const u = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const bug = createBug(color);
  bug.position.set(u[0] * -2, 0, u[2] * -2);
  bug.rotation.y = Math.atan2(u[0], u[2]);
  const wizard = createWizard();
  wizard.position.set(u[0] * 2, 0, u[2] * 2);
  wizard.rotation.y = Math.atan2(-u[0], -u[2]);
  const asset = new Group().add(bug, wizard);
  // From its eyes at his middle (Bolt.shoot()).
  const eyes = [bug.position.x, ENEMY.eyeHeight, bug.position.z];
  const stop = boltStopAtWizard(eyes, wizard.position.toArray());
  const from = towards3(eyes, stop, BOLT.reach);
  const runs = boltRuns(asset, attackColor, [[from, stop]], boltSpeed);
  loopBoltAttack(asset, { model: bug, animate: animateBug, markHeight: BUG_MODEL.markHeight, charge: Math.round(attackCharge * 60), runs, wizard, hit: runs.ticks[0] });
  return asset;
}

/**
 * The bouncing bolt (D81) in a loop: a virus shooting bouncing bolts
 * (RICOCHET_DEMO) fires a level shot at a crate, which it glances off
 * (sparks) into the wizard beside it.
 */
function buildBoltRicochet() {
  const { color, attackColor, attackCharge, boltSpeed } = enemyValues('virus', RICOCHET_DEMO);
  const virus = createVirus(color);
  virus.position.set(-1.5, 0, 0.8);
  const wizard = createWizard();
  wizard.position.set(-1.5, 0, -2);
  wizard.rotation.y = Math.PI / 2;
  // A crate with its −x face at x = 1, z from −1 to 0.
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [1, 0, -1] });
  const asset = new Group().add(virus, wizard, crate);
  const eyes = [virus.position.x, ENEMY.eyeHeight, virus.position.z];
  const bounce = [1 - BOLT.size / 2, ENEMY.eyeHeight, -0.5];
  virus.rotation.y = Math.atan2(bounce[0] - eyes[0], bounce[2] - eyes[2]);
  const from = towards3(eyes, bounce, BOLT.reach);
  // Glancing off the crate's side: back along x, on along z, to his side.
  const d = bounce.map((v, k) => v - eyes[k]);
  const stopX = wizard.position.x + PLAYER_HITBOX[0] / 2 + BOLT.size / 2;
  const t = (bounce[0] - stopX) / d[0];
  const stop = [stopX, ENEMY.eyeHeight, bounce[2] + d[2] * t];
  wizard.position.z = stop[2];
  const runs = boltRuns(asset, attackColor, [[from, bounce, stop]], boltSpeed);
  loopBoltAttack(asset, { model: virus, animate: animateVirus, markHeight: VIRUS.markHeight, charge: Math.round(attackCharge * 60), runs, wizard, hit: runs.ticks[0] });
  return asset;
}

/**
 * The four-way bolt (D81) in a loop, two shots: a cron (defs.json, a
 * stationary tower, D83) charges, then fires four level bolts along the
 * grid axes out of its dial's emitters; the first time the wizard stands
 * on its +z axis and is hit, the second time he stands off the axes (a
 * safe corner) and the bolts spark out 2.4 away (walls) past him.
 */
function buildBoltCross() {
  const { look, color, attackColor, attackCharge, boltSpeed } = enemyValues('cron');
  const model = ENEMY_MODELS[look];
  const cron = model.create(color);
  const wizard = createWizard();
  const asset = new Group().add(cron, wizard);
  const eyes = [0, ENEMY.eyeHeight, 0];
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const reach = (dir) => (dir[2] === 1 ? 2 - PLAYER_HITBOX[2] / 2 - BOLT.size / 2 : 2.4);
  const hitting = boltRuns(asset, attackColor, axes.map((dir) => [BOLT.reach, reach(dir)].map((d) => eyes.map((e, k) => e + dir[k] * d))), boltSpeed);
  const missing = boltRuns(asset, attackColor, axes.map((dir) => [BOLT.reach, 2.4].map((d) => eyes.map((e, k) => e + dir[k] * d))), boltSpeed);
  const charge = Math.round(attackCharge * 60);
  const shot = Math.ceil(charge + Math.max(...missing.ticks) + 50);
  const mark = addMark(asset, model.markHeight);
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % (shot * 2);
    const second = tick >= shot;
    const local = tick % shot;
    // On the +z axis, then stepped aside into the corner between +z and +x.
    const at = second ? [1.4, 0, 1.4] : [0, 0, 2];
    wizard.position.set(...at);
    wizard.rotation.y = Math.atan2(-at[0], -at[2]);
    // The pedestal turns to watch him; the dial holds the grid.
    cron.rotation.y = Math.atan2(at[0], at[2]);
    const attack = local < charge + ENEMY.dischargeTicks ? local : null;
    model.animate(cron, { time, alert: 1, attack, charge });
    showGlow(cron, attack, charge);
    mark(1, time);
    const flown = local - charge;
    hitting.update(second ? -1 : flown);
    missing.update(second ? flown : -1);
    showWizardHit(wizard, !second && flown >= hitting.ticks[2] ? flown - hitting.ticks[2] : null);
  };
  return asset;
}

/**
 * A cron (defs.json) alone, calm, then after the wizard (a faster hand),
 * charging and firing without bolts, in a loop.
 */
function buildCron() {
  const { look, color, attackCharge } = enemyValues('cron');
  const model = ENEMY_MODELS[look];
  const cron = model.create(color);
  const asset = new Group().add(cron);
  const mark = addMark(asset, model.markHeight);
  const charge = Math.round(attackCharge * 60);
  asset.userData.update = (dt, time) => {
    const alert = alertAt(time);
    // It charges and fires while after the wizard: from 3.5 s into the 6 s loop.
    const tick = ((time % 6) - 3.5) * 60;
    const attack = tick >= 0 && tick < charge + ENEMY.dischargeTicks ? tick : null;
    model.animate(cron, { time, alert, attack, charge });
    showGlow(cron, attack, charge);
    mark(alert, time);
  };
  return asset;
}

/**
 * An enemy of type `type` (defs.json) walking in place at its speed, calm,
 * then after the wizard (at its chase speed), in a loop.
 * @param {string} type
 */
function buildWalker(type) {
  const { look, color, speed, chaseSpeed = speed } = enemyValues(type);
  const model = ENEMY_MODELS[look];
  const walker = model.create(color);
  const asset = new Group().add(walker);
  const mark = addMark(asset, model.markHeight);
  let walked = 0;
  asset.userData.update = (dt, time) => {
    const alert = alertAt(time);
    walked += dt * (speed + (chaseSpeed - speed) * alert);
    model.animate(walker, { state: 'walk', walked, time, alert });
    mark(alert, time);
  };
  return asset;
}

/**
 * A concept enemy look (CONCEPTS) walking in place, calm, then after the
 * wizard (at its chase speed); with an attack it charges and fires from
 * 3.5 s into the 6 s loop (a burst shows its lightning).
 * @param {typeof WARDEN_MODEL} model
 * @param {string} color
 * @param {{ attack: string|null, speed: number, chaseSpeed?: number }} options
 */
function buildConcept(model, color, { attack: shape, speed, chaseSpeed = speed }) {
  const enemy = model.create(color);
  const asset = new Group().add(enemy);
  const mark = addMark(asset, model.markHeight);
  const charge = 36;
  const discharge = shape === 'burst' ? createDischarge({ color, shape, range: 1.2 }) : null;
  if (discharge) asset.add(discharge);
  let walked = 0;
  asset.userData.update = (dt, time) => {
    const alert = alertAt(time);
    const pace = speed + (chaseSpeed - speed) * alert;
    walked += dt * pace;
    const tick = ((time % 6) - 3.5) * 60;
    const attack = shape && tick >= 0 && tick < charge + ENEMY.dischargeTicks ? tick : null;
    model.animate(enemy, { state: pace > 0 ? 'walk' : 'rest', walked, time, alert, attack, charge });
    showGlow(enemy, attack, charge);
    mark(alert, time);
    if (discharge) placeDischarge(discharge, attack === null ? null : Math.floor(attack), charge, [0, ENEMY.eyeHeight, 0]);
  };
  return asset;
}

/** A bug with the boss mark, calm then awake; every 3 s it teleports (in place). */
function buildBossBug() {
  const { color } = defs.enemies.bug;
  const bug = createBug(color);
  const ring = createBossMark(ENEMY.size[1]);
  const asset = new Group().add(bug, ring);
  const mark = addMark(asset, BUG_MODEL.markHeight);
  asset.userData.update = (dt, time) => {
    animateBug(bug, { state: 'rest', time, alert: alertAt(time) });
    mark(alertAt(time), time);
    const tick = (time % 3) * 60;
    const warp = teleportLook(tick < BOSS.teleportTicks ? tick : null, BOSS.teleportTicks);
    for (const part of [bug, ring]) {
      part.visible = warp.visible;
      part.scale.set(warp.width, warp.height, warp.width);
    }
    ring.userData.update(dt, { armored: null });
  };
  return asset;
}

/** Height of the tall boss demo: two cubes high (D134). */
const TALL_BOSS = 1.6;

/** A virus two cubes high with the boss mark; its plate armor shuts and opens every 2 s. */
function buildBossTall() {
  const scale = bodyScale(TALL_BOSS);
  const virus = createVirus('#ff7a3d');
  virus.scale.setScalar(scale);
  const ring = createBossMark(TALL_BOSS);
  const shell = createArmorShell(TALL_BOSS);
  const asset = new Group().add(virus, ring, shell);
  const mark = addMark(asset, VIRUS.markHeight * scale);
  asset.userData.update = (dt, time) => {
    animateVirus(virus, { state: 'walk', time, alert: alertAt(time) });
    mark(alertAt(time), time);
    // Shut for 2 s (a hit glancing off at 1 s), then open on a plate for 2 s.
    const armored = time % 4 < 2;
    ring.userData.update(dt, { armored });
    shell.userData.update(dt, { shut: armored, hit: time % 4 >= 1 ? (time % 4) - 1 : null });
  };
  return asset;
}

/** A fragment, a boss's drop, falling into its cell every 3 s (PickupView). */
function buildBossDrop() {
  const fragment = createFragment({ slot: 7 });
  const asset = new Group().add(fragment);
  asset.userData.update = (dt, time) => {
    const motion = diskMotion({ time });
    poseDisk(fragment, { ...motion, y: motion.y + dropHeight((time % 3) * 60) });
  };
  return asset;
}

/** Wyrms in each of WYRM_COLORS side by side, swimming calm. */
function buildWyrmColors() {
  const asset = new Group();
  const wyrms = WYRM_COLORS.map((color, i) => {
    const wyrm = WYRM_MODEL.create(color);
    // Along the row (+x −z on screen), 1.2 apart.
    const along = (i - (WYRM_COLORS.length - 1) / 2) * 1.2;
    wyrm.position.set(along * Math.SQRT1_2, 0, -along * Math.SQRT1_2);
    asset.add(wyrm);
    return wyrm;
  });
  asset.userData.update = (dt, time) => {
    wyrms.forEach((wyrm, i) => WYRM_MODEL.animate(wyrm, { time: time + i * 0.4 }));
  };
  return asset;
}

/** A concept enemy look (CONCEPTS) popping into pixels, in a loop. */
function buildConceptPop(model, color) {
  const enemy = model.create(color);
  const pixels = createDerez(model.derez, [color, 0xffffff]);
  const asset = new Group().add(enemy, pixels);
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % 90;
    enemy.visible = tick < 40;
    model.animate(enemy, { time, alert: 1 });
    placeDerez(pixels, tick >= 40 ? tick - 40 : null, [0, 0, 0]);
  };
  return asset;
}

/**
 * An enemy of type `type` (defs.json) popping into pixels, in a loop.
 * @param {string} type
 */
function buildEnemyPop(type) {
  const { look, color } = enemyValues(type);
  const model = ENEMY_MODELS[look];
  const enemy = model.create(color);
  const pixels = createDerez(model.derez, [color, 0xffffff]);
  const asset = new Group().add(enemy, pixels);
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % 90;
    enemy.visible = tick < 40;
    model.animate(enemy, { time });
    placeDerez(pixels, tick >= 40 ? tick - 40 : null, [0, 0, 0]);
  };
  return asset;
}

/** A sentinel gliding calm, then after the wizard, in a loop. */
function buildSentinel() {
  const sentinel = createSentinel(defs.enemies.sentinel.color);
  const asset = new Group().add(sentinel);
  const mark = addMark(asset, SENTINEL.markHeight);
  asset.userData.update = (dt, time) => {
    animateSentinel(sentinel, { state: 'walk', time, alert: alertAt(time) });
    mark(alertAt(time), time);
  };
  return asset;
}

/**
 * The sentinel's arc, two shots in a loop, 4.5 apart: it aims where the
 * wizard stands when it starts charging (a dashed line), then fires a bolt
 * its full range along that line. The first shot hits; for the second he
 * steps aside while it charges, and it misses.
 */
function buildSentinelAttack() {
  const { color, attackRange: range, attackCharge } = defs.enemies.sentinel;
  const charge = Math.round(attackCharge * 60);
  // Along the row on screen (u), and across it (v).
  const u = [Math.SQRT1_2, -Math.SQRT1_2];
  const v = [Math.SQRT1_2, Math.SQRT1_2];
  const at = (a, b = 0) => [u[0] * a + v[0] * b, 0, u[1] * a + v[1] * b];
  const sentinel = createSentinel(color);
  sentinel.position.set(...at(-2.4));
  const discharge = createDischarge({ color, shape: 'arc', range });
  const wizard = createWizard();
  wizard.rotation.y = -Math.PI / 4;
  const asset = new Group().add(sentinel, discharge, wizard);
  const mark = addMark(asset, SENTINEL.markHeight, sentinel.position);
  const shots = [20, 170];
  const loop = 300;
  let tick = 0;
  let aim = null;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    // He steps aside during the second charge, and back later.
    const side = tick < 175 ? 0 : tick < 200 ? (tick - 175) / 25 : tick < 250 ? 1 : tick < 280 ? 1 - (tick - 250) / 30 : 0;
    wizard.position.set(...at(2.1, side * 0.9));
    const shot = shots.find((start) => tick >= start && tick < start + charge + DISCHARGE.ticks);
    const attack = shot === undefined ? null : tick - shot;
    // The aim locks on his chest when a charge starts; it faces the aim.
    if (attack !== null && (aim === null || attack < 1)) aim = wizard.position.clone();
    if (attack === null) aim = null;
    const target = aim ?? wizard.position;
    const { x: sx, z: sz } = sentinel.position;
    sentinel.rotation.y = Math.atan2(target.x - sx, target.z - sz);
    animateSentinel(sentinel, { time, alert: 1, attack, charge });
    showGlow(sentinel, attack, charge);
    mark(1, time);
    // As in the game: along the line from its eyes, starting at its visor.
    const eyes = [sx, ENEMY.eyeHeight, sz];
    const d = [target.x - sx, 0.75 - ENEMY.eyeHeight, target.z - sz];
    const length = Math.hypot(...d);
    const from = eyes.map((e, k) => e + (d[k] / length) * SENTINEL_MODEL.muzzle);
    const end = eyes.map((e, k) => e + (d[k] / length) * range);
    placeDischarge(discharge, attack === null ? null : Math.floor(attack), charge, from, end);
    const hit = shots[0] + charge;
    showWizardHit(wizard, tick >= hit && tick < shots[1] ? tick - hit : null);
  };
  return asset;
}

/** The sentinel popping into pixels, in a loop. */
function buildSentinelPop() {
  const { color } = defs.enemies.sentinel;
  const sentinel = createSentinel(color);
  const pixels = createDerez(SENTINEL.derez, [color, 0xffffff]);
  const asset = new Group().add(sentinel, pixels);
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % 90;
    sentinel.visible = tick < 40;
    animateSentinel(sentinel, { time });
    placeDerez(pixels, tick >= 40 ? tick - 40 : null, [0, 0, 0]);
  };
  return asset;
}

/** A virus popping into pixels, in a loop. */
function buildVirusPop() {
  const { color } = defs.enemies.virus;
  const virus = createVirus(color);
  const pixels = createDerez(VIRUS.derez, [color, 0xffffff]);
  const asset = new Group().add(virus, pixels);
  const loop = 90;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const popped = tick >= 40;
    virus.visible = !popped;
    animateVirus(virus, { time });
    placeDerez(pixels, popped ? tick - 40 : null, [0, 0, 0]);
  };
  return asset;
}

/** A bug popping into pixels, in a loop. */
function buildBugPop() {
  const { color } = defs.enemies.bug;
  const bug = createBug(color);
  const pixels = createDerez(BUG.derez, [color, 0xffffff]);
  const asset = new Group().add(bug, pixels);
  const loop = 90;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const popped = tick >= 40;
    bug.visible = !popped;
    placeDerez(pixels, popped ? tick - 40 : null, [0, 0, 0]);
  };
  return asset;
}

/**
 * The wizard getting hurt, in a loop: hit (a flash, then blinking while invulnerable),
 * a pause, then losing his last point (derez into pixels), then back.
 */
/** The wizard standing still: only his idle motion (wizard-motion.js). */
function buildWizardIdle() {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  wizard.userData.update = (dt, time) => motion.update({ dt, time, pos: [0, 0, 0], facing: 0, grounded: true, moving: false, vy: 0 });
  return wizard;
}

/**
 * The wizard walking round a 2.5-unit square at his walking speed, turning
 * at each corner and standing there for a moment (the hat wobbles).
 */
function buildWizardWalk() {
  const wizard = createWizard();
  const shadow = createDropShadow(PALETTE.magenta);
  shadow.scale.set(PLAYER_HITBOX[0] * 1.5, PLAYER_HITBOX[0] * 1.5, 1);
  const motion = new WizardMotion(wizard);
  const asset = new Group().add(wizard, shadow);
  const side = 2.5;
  const legTime = side / PLAYER.speed;
  const pause = 0.6;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [(x * side) / 2, (z * side) / 2]);
  let facing = 0;
  asset.userData.update = (dt, time) => {
    const t = time % (4 * (legTime + pause));
    const leg = Math.floor(t / (legTime + pause));
    const along = Math.min(1, (t - leg * (legTime + pause)) / legTime);
    const [ax, az] = corners[leg];
    const [bx, bz] = corners[(leg + 1) % 4];
    const x = ax + (bx - ax) * along;
    const z = az + (bz - az) * along;
    const moving = along < 1;
    // Turn quickly towards the next leg, as the game does.
    const target = moving ? Math.atan2(bx - ax, bz - az) : Math.atan2(corners[(leg + 2) % 4][0] - bx, corners[(leg + 2) % 4][1] - bz);
    facing += Math.atan2(Math.sin(target - facing), Math.cos(target - facing)) * Math.min(1, dt * 60 * PLAYER.turnRate);
    wizard.position.set(x, 0, z);
    wizard.rotation.y = facing;
    shadow.position.set(x, 0.01, z);
    motion.update({ dt, time, pos: [x, 0, z], facing, grounded: true, moving, vy: 0 });
  };
  return asset;
}

/** The wizard jumping in place, as high as in the game, every 1.4 s. */
function buildWizardJump() {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  const asset = new Group().add(wizard);
  const every = 1.4;
  asset.userData.update = (dt, time) => {
    const t = time % every;
    const y = Math.max(0, JUMP_SPEED * t - (PLAYER.gravity * t * t) / 2);
    const grounded = y === 0 && t > 0.1;
    wizard.position.y = y;
    motion.update({ dt, time, pos: [0, y, 0], facing: 0, grounded: grounded || t === 0, moving: false, vy: grounded ? 0 : JUMP_SPEED - PLAYER.gravity * t });
  };
  return asset;
}

/**
 * The wizard walking up to a crate, pushing it one cell (a short strain,
 * then it slides as in the game) and standing back; in a loop.
 */
function buildWizardPush() {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 0] });
  const asset = new Group().add(wizard, crate);
  // Pushing along −x, away from the camera, so the crate never hides him.
  const half = PLAYER_HITBOX[0] / 2;
  const start = 1.9;
  const contact = 0.5 + half; // his front against the crate's near face (crate up to x = 0.5)
  const walkEnd = (start - contact) / PLAYER.speed;
  const strainEnd = walkEnd + PLAYER.pushDelay / 60;
  const slideEnd = strainEnd + 1 / PUSHABLE.slideSpeed;
  const loop = slideEnd + 1.2;
  const facing = -Math.PI / 2;
  asset.userData.update = (dt, time) => {
    const t = time % loop;
    const slid = Math.min(1, Math.max(0, (t - strainEnd) * PUSHABLE.slideSpeed));
    const x = t < walkEnd ? start - t * PLAYER.speed : contact - slid;
    crate.position.set(-0.5 - slid, 0, -0.5);
    wizard.position.set(x, 0, 0);
    wizard.rotation.y = facing;
    const pushing = t >= walkEnd && t < slideEnd;
    motion.update({ dt, time, pos: [x, 0, 0], facing, grounded: true, moving: t < slideEnd, vy: 0, pushing });
  };
  return asset;
}

/**
 * The wizard casting a Zap flare straight ahead, then one to his left
 * before he has turned (the hands follow the aim, not the body); in a loop.
 */
function buildWizardCast() {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  const flare = createCastFlare();
  const asset = new Group().add(wizard, flare);
  const casts = [
    { at: 20, aim: 0 },
    { at: 80, aim: Math.PI / 2 },
  ];
  const loop = 140;
  asset.userData.update = (dt, time) => {
    const tick = (time * 60) % loop;
    const last = [...casts].reverse().find((cast) => tick >= cast.at) ?? { ...casts[1], at: casts[1].at - loop };
    const since = tick - last.at;
    motion.update({ dt, time, pos: [0, 0, 0], facing: 0, grounded: true, moving: false, vy: 0, cast: since, aim: last.aim });
    placeCastFlare(flare, [0, 0, 0], last.aim, since);
  };
  return asset;
}

/** The wizard walking off into a hole and dropping in, flailing; in a loop. */
function buildWizardHole() {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  const pit = createHoleView([[0, 0]], PALETTE.amber);
  pit.position.set(0, 0, -0.5);
  const asset = new Group().add(pit, wizard);
  const start = -1.2;
  const edge = 0.5; // the hole's middle: he falls in there
  const walkEnd = (edge - start) / PLAYER.speed;
  const fallEnd = walkEnd + PLAYER.deathTicks / 60;
  const loop = fallEnd + 0.6;
  asset.userData.update = (dt, time) => {
    const t = time % loop;
    const falling = t >= walkEnd && t < fallEnd;
    const drop = falling ? (PLAYER.gravity * (t - walkEnd) ** 2) / 2 : 0;
    const x = Math.min(edge, start + t * PLAYER.speed);
    const y = -Math.min(drop, 3);
    wizard.visible = t < fallEnd;
    wizard.position.set(x, y, 0);
    wizard.rotation.y = Math.PI / 2;
    motion.update({ dt, time, pos: [x, y, 0], facing: Math.PI / 2, grounded: !falling, moving: t < walkEnd, vy: falling ? -PLAYER.gravity * (t - walkEnd) : 0, falling });
  };
  return asset;
}

function buildStream() {
  const lime = OBJECT_TYPES.crate.color;
  const gold = defs.spells.compile.color;
  const warp = defs.spells.warp.color;
  const crate = (x) => ({ at: [x, 0, 0], body: BLOCK_BODY });
  const point = (x) => ({ at: [x, 0.7, 0] });
  const wizard = (x) => ({ at: [x, 0, 0], body: HIT_FX.body });
  // [from, to, colors]
  const streams = [
    [crate(-2.2), point(-1.2), [lime, defs.spells.cut_paste.color]],
    [point(-0.6), crate(0.4), [gold, 0xffffff]],
    [wizard(1), wizard(2.6), [warp, 0xffffff]],
  ].map(([from, to, colors]) => ({ from, to, pixels: createStream(streamCount(from, to), colors) }));
  const asset = new Group().add(...streams.map(({ pixels }) => pixels));
  const ticks = 24;
  const loop = ticks + 30;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    for (const { from, to, pixels } of streams) placeStream(pixels, tick, ticks, from, to);
  };
  return asset;
}

function buildDerez() {
  const crate = OBJECT_TYPES.crate;
  const bug = defs.enemies.bug.color;
  const sentinel = defs.enemies.sentinel.color;
  const disk = createDisk();
  // [model, its derez, its feet center]
  const things = [
    [createWizard(), createDerez(HIT_FX.body, [PALETTE.cyan, PALETTE.magenta]), [-2.4, 0, 0]],
    [createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...crate, at: [0, 0, 0] }), createDerez(BLOCK_BODY, [crate.color, 0xffffff]), [-1.2, 0, 0]],
    [createBug(bug), createDerez(BUG.derez, [bug, 0xffffff]), [0, 0, 0]],
    [createSentinel(sentinel), createDerez(SENTINEL.derez, [sentinel, 0xffffff]), [1.2, 0, 0]],
    [disk, createDerez(DISK.collect.body, [disk.userData.color, disk.userData.glyphColor]), [2.4, 0, 0]],
  ];
  const asset = new Group();
  for (const [model, pixels, [x]] of things) {
    model.position.x = x;
    asset.add(model, pixels);
  }
  things[1][0].position.set(-1.7, 0, -0.5); // a crate's view stands on its lower corner
  const start = 40;
  const loop = start + DEREZ.ticks + 30;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const derez = tick >= start ? tick - start : null;
    const motion = diskMotion({ time });
    poseDisk(disk, motion);
    animateSentinel(things[3][0], { time });
    for (const [model, pixels, feet] of things) {
      model.visible = derez === null;
      placeDerez(pixels, derez, model === disk ? [feet[0], motion.y, 0] : feet);
    }
  };
  return asset;
}

function buildWizardHit() {
  const wizard = createWizard();
  const pixels = createDerez(HIT_FX.body, [PALETTE.cyan, PALETTE.magenta]);
  const asset = new Group().add(wizard, pixels);
  const hitTicks = PLAYER.invulnerableTicks + 30;
  const loop = hitTicks + PLAYER.deathTicks + 30;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const derezTick = tick - hitTicks;
    const dead = derezTick >= 0 && derezTick < PLAYER.deathTicks;
    const player = {
      invulnerable: Math.max(0, PLAYER.invulnerableTicks - Math.floor(tick)),
      dead,
      deathCause: dead ? 'damage' : null,
      deathTimer: dead ? PLAYER.deathTicks - Math.floor(derezTick) : 0,
    };
    const look = wizardLook(player, PLAYER.deathTicks);
    wizard.visible = look.visible;
    wizard.scale.set(...look.scale);
    showHitFlash(wizard, hitFlash(player));
    placeDerez(pixels, dead ? derezTick : null, [0, 0, 0]);
  };
  return asset;
}

/**
 * One block of a damaging type in its animated look.
 * @param {'hazard'|'void'} type
 * @param {{ glass?: boolean }} [options] glass: the see-through prototype (glass.js)
 */
function buildActiveBlock(type, options) {
  const view = createActiveBlockView([[0, 0, 0]], BLOCK_TYPES[type].look, BLOCK_TYPES[type].color, null, options);
  view.position.set(-0.5, 0, -0.5);
  const asset = new Group().add(view);
  if (type === 'hazard') {
    let time = 0;
    asset.userData.update = (dt) => {
      time = (time + dt) % 2;
      flareHazard(view.userData.faces, [0, 0, 0], time);
    };
  }
  return asset;
}

/**
 * Glass in context: a 4×4 room corner with a stack of two glass crates
 * and a glass crate on the floor beside the old tinted crate, a glass
 * hazard strip and a void (black mist) patch against plain blocks; the wizard
 * walks back and forth behind the crates (with his x-ray ghost, which
 * glass doesn't trigger).
 */
function buildGlassInRoom() {
  const size = [4, 3, 4];
  const room = new Group().add(
    createRoomView({ size, blocks: { block: [[0, 0, 0], [0, 1, 0], [1, 0, 0]] }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }),
    createActiveBlockView([[0, 0, 2], [0, 0, 3]], 'hazard', BLOCK_TYPES.hazard.color, null, { glass: true }),
    createActiveBlockView([[3, 0, 0], [3, 0, 1]], 'void', BLOCK_TYPES.void.color),
  );
  const glass = { ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate };
  for (const at of [[1, 0, 3], [1, 1, 3], [2, 0, 3]]) room.add(createObjectView({ ...glass, at }));
  room.add(createObjectView({ ...glass, faces: 'tinted', at: [3, 0, 3] }));
  const wizard = createWizard();
  addXray(wizard);
  room.add(wizard);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  const loop = 420;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    // Back and forth along x, behind the glass crates and the tinted one.
    const t = tick / loop;
    const leg = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    wizard.position.set(t < 0.5 ? 1.2 + leg * 2.4 : 3.6 - leg * 2.4, 0, 2.3);
    wizard.rotation.y = t < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  };
  return asset;
}

/**
 * The animated looks in context: a 4×4 room corner with plain blocks, a
 * hazard wall and a void patch crossed by a plain path; the pillar's top
 * is a second plain type in its own color, joined without a seam (D64).
 */
function buildBlocksInRoom() {
  const size = [4, 3, 4];
  const room = new Group().add(
    createRoomView({
      size,
      blocks: {
        block: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [2, 0, 2], [2, 0, 3], [3, 0, 3]],
        silver: [[0, 2, 0]],
        hazard: [[0, 0, 2], [0, 0, 3], [1, 0, 3]],
        void: [[2, 0, 1], [3, 0, 1], [3, 0, 2], [2, 0, 0]],
      },
      blockTypes: { ...BLOCK_TYPES, silver: { id: 'silver', static: true, look: 'plain', color: '#e8eaff' } },
      color: PALETTE.amber,
    }),
  );
  room.position.set(-2, 0, -2);
  return new Group().add(room);
}

/**
 * Fences (D167) in a 4×4 room corner: a 2-high run from the back wall
 * turning a corner, a 1-high run meeting a plain block, and the wizard
 * walking back and forth behind the tall one, seen through it.
 */
function buildFenceInRoom() {
  const size = [4, 3, 4];
  const tall = [[0, 0, 2], [1, 0, 2], [2, 0, 2], [2, 0, 3]].flatMap(([x, , z]) => [[x, 0, z], [x, 1, z]]);
  const room = new Group().add(
    createRoomView({ size, blocks: { block: [[3, 0, 0]], fence: [...tall, [3, 0, 1]] }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }),
  );
  const wizard = createWizard();
  addXray(wizard);
  room.add(wizard);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  const loop = 360;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const t = tick / loop;
    const leg = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    wizard.position.set(t < 0.5 ? 0.5 + leg * 1.6 : 2.1 - leg * 1.6, 0, 1.2);
    wizard.rotation.y = t < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  };
  return asset;
}

/**
 * Moving platforms on their guide lines in a 4×4 room corner: one gliding round
 * an L-shaped ping-pong path on the floor, a lift going up to a ledge.
 */
function buildPlatforms() {
  const size = [4, 3, 4];
  const color = OBJECT_TYPES.platform.color;
  const style = { ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.platform, at: [0, 0, 0] };
  const paths = [
    buildTrack([0, 0, 1], { points: [[2, 0, 1], [2, 0, 3]], pause: 0.6 }),
    buildTrack([3, 0, 0], { points: [[3, 1, 0]], speed: 1.2, pause: 0.8 }),
  ];
  const room = new Group().add(createRoomView({ size, blocks: { block: [[2, 0, 0], [2, 1, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0], [0, 1, 0]] }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }));
  const movers = paths.map((track) => {
    const block = createObjectView(style);
    room.add(createRails(track, color), block);
    return { track, block, state: startState() };
  });
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  let carry = 0;
  asset.userData.update = (dt) => {
    // Step in whole ticks, like the game.
    for (carry += dt * 60; carry >= 1; carry--) {
      for (const mover of movers) mover.state = advance(mover.track, mover.state, mover.track.speed / 60);
    }
    for (const { track, block, state } of movers) block.position.set(...positionOf(track, state));
  };
  return asset;
}

/**
 * Spiked platforms (D82) in a 4×4 room corner: a hopper going up a block
 * and back with a short pause at each end, and a slider gliding to and fro
 * along the floor. They move like any platform (world/path.js).
 */
function buildSpikedPlatforms() {
  const size = [4, 3, 4];
  const props = OBJECT_TYPES.spiked_platform;
  const style = { ...OBJECT_STYLE_DEFAULTS, ...props, at: [0, 0, 0] };
  const paths = [
    buildTrack([1, 0, 1], { points: [[1, 1, 1]], speed: 2.5, pause: 0.4 }),
    buildTrack([3, 0, 0], { points: [[3, 0, 3]], speed: 1.5, pause: 0.5 }),
  ];
  const room = new Group().add(createRoomView({ size, blocks: {}, blockTypes: BLOCK_TYPES, color: PALETTE.amber }));
  const movers = paths.map((track) => {
    const block = createObjectView(style);
    room.add(createRails(track, props.color), block);
    return { track, block, state: startState() };
  });
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  const flareHopper = movers[0].block.userData.flare;
  let carry = 0;
  let time = 0;
  asset.userData.update = (dt) => {
    for (carry += dt * 60; carry >= 1; carry--) {
      for (const mover of movers) mover.state = advance(mover.track, mover.state, mover.track.speed / 60);
    }
    for (const { track, block, state } of movers) block.position.set(...positionOf(track, state));
    time = (time + dt) % 2;
    flareHopper(time);
  };
  return asset;
}

/**
 * A row of three collapsing blocks (step gates, D141) going through their
 * states in a loop, one after the other like a bridge giving way under a
 * runner: standing still, shaking, sinking (a dashed outline left, as
 * they grow back), and after a while rising again.
 */
function buildCollapsingCycle() {
  const object = { ...OBJECT_STYLE_DEFAULTS, color: PALETTE.amber, ...BLOCK_TYPES.collapsing_regrow };
  const solidTicks = 40;
  const goneTicks = 60;
  const loop = solidTicks + GATE.shakeTicks + goneTicks;
  const blocks = [0, 1, 2].map((i) => ({ object, trigger: 'step', returns: true, pos: [i - 1.5, 0, -0.5], state: 'solid', timer: 0 }));
  const views = blocks.map((block) => new GateView(null, block));
  const asset = new Group().add(...views.map((view) => view.group));
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    blocks.forEach((block, i) => {
      // Each block starts shaking 12 ticks after the one before.
      const t = (tick - i * 12 + loop) % loop;
      const whole = Math.floor(t);
      // Solid from the start of the loop: it just grew back.
      if (whole < solidTicks) Object.assign(block, { state: 'solid', timer: whole });
      else if (whole < solidTicks + GATE.shakeTicks) Object.assign(block, { state: 'shake', timer: whole - solidTicks });
      else Object.assign(block, { state: 'gone', timer: whole - solidTicks - GATE.shakeTicks });
    });
    for (const view of views) view.sync(0, dt);
  };
  return asset;
}

/**
 * A 3×3 room corner with a back doorway leading to a magenta room and a
 * front exit leading to a cyan one.
 */
function buildExits() {
  const size = [3, 3, 3];
  const exits = [
    withExitDefaults({ id: 'back', side: '-z', at: 0 }),
    withExitDefaults({ id: 'front', side: '+x', at: 1 }),
  ];
  const views = [new ExitView(exits[0], size, PALETTE.magenta), new ExitView(exits[1], size, PALETTE.cyan)];
  const room = new Group().add(createRoomView({ size, blocks: {}, blockTypes: BLOCK_TYPES, exits, color: PALETTE.amber }), ...views.map((v) => v.group));
  room.position.set(-1.5, 0, -1.5);
  const asset = new Group().add(room);
  asset.userData.update = (dt) => {
    for (const view of views) view.update(dt);
  };
  return asset;
}

const only = new URLSearchParams(location.search).get('asset');
const ASSETS = ALL_ASSETS.filter(({ label, group }) => !only || only.split(',').some((name) => name === label || name === group));

const renderer = new Renderer(document.getElementById('app'));
// Assets stand in a row that runs left to right on screen (world +x −z),
// through the middle of a square floor, zoomed so the row fills the view.
const spans = ASSETS.map(({ span = SPACING }) => span);
const total = spans.reduce((sum, span) => sum + span, 0);
const side = Math.ceil(total / Math.SQRT2) + 2;
// Height 2: the view centers on the middle of the assets, not their feet.
const size = [side, 2, side];
renderer.scene.add(createFloor(size, PALETTE.amber));
frameRoom(renderer.camera, size);
renderer.camera.zoom = Math.min(6, (VIEW_HEIGHT * ASPECT) / (total + SPACING));
renderer.camera.updateProjectionMatrix();

const turntables = ASSETS.map(({ label, build, shadow, spin = true }, i) => {
  const turntable = new Group();
  const offset = spans.slice(0, i).reduce((sum, span) => sum + span, 0) + spans[i] / 2 - total / 2;
  const t = offset / Math.SQRT2;
  turntable.position.set(side / 2 + t, 0, side / 2 - t);
  const model = build();
  turntable.userData.update = model.userData.update;
  turntable.userData.spin = spin;
  turntable.add(model);
  if (shadow) {
    const disc = createDropShadow(shadow);
    disc.position.y = 0.01;
    disc.scale.set(0.9, 0.9, 1);
    turntable.add(disc);
  }
  renderer.scene.add(turntable);

  // Label under the asset; the stage is always 16:9, so percentages stay put.
  const screen = new Vector3(turntable.position.x + spans[i] * 0.25, 0, turntable.position.z + spans[i] * 0.25).project(renderer.camera);
  const tag = document.createElement('div');
  tag.className = 'showcase-label';
  tag.textContent = label;
  tag.style.left = `${((screen.x + 1) / 2) * 100}%`;
  tag.style.top = `${((1 - screen.y) / 2) * 100}%`;
  renderer.hud.append(tag);
  return turntable;
});

renderer.hud.insertAdjacentHTML(
  'beforeend',
  '<div class="showcase-title">&gt; ASSET SHOWCASE<br>&gt; SPACE pause &nbsp; &larr;/&rarr; turn</div>',
);

let spinning = true;
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') spinning = !spinning;
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  HOLO_TIME.value = now / 1000;
  let turn = spinning ? SPIN : 0;
  if (held.has('ArrowLeft')) turn -= 2;
  if (held.has('ArrowRight')) turn += 2;
  for (const turntable of turntables) {
    if (turntable.userData.spin) turntable.rotation.y += turn * dt;
    turntable.userData.update?.(dt, now / 1000);
  }
  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


/**
 * Cut & Paste (D87) in a loop: the wizard (left, facing +x) cuts the
 * crate or frozen bug in front of him, holds it, and pastes it back.
 * @param {'crate'|'bug'} kind
 */
function buildCutPaste(kind) {
  const { color } = defs.spells.cut_paste;
  const at = [-1.6, 0, 0];
  const wizard = createWizard();
  wizard.position.set(...at);
  wizard.rotation.y = Math.PI / 2;
  const flare = createCastFlare();
  const crate = kind === 'crate';
  const thingColor = crate ? OBJECT_TYPES.crate.color : defs.enemies.bug.color;
  const thing = new Group();
  if (crate) {
    const view = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 0] });
    view.position.set(-0.5, 0, -0.5);
    thing.add(view);
  } else {
    // Frozen: tinted, in its cage, holding its pose.
    const pause = defs.spells.pause.color;
    const bug = createBug(thingColor);
    bug.rotation.y = -Math.PI / 2;
    animateBug(bug, { state: 'rest', time: 0.3 });
    bug.userData.flash.amount.value = PAUSE_FX.tint;
    bug.userData.flash.color.value.set(pause);
    const cage = createPauseCage(pause);
    placePauseCage(cage, [0, 0, 0], { frozen: true, grow: 1, on: true });
    thing.add(bug, cage);
  }
  const size = crate ? 1 : ENEMY.size[0];
  const center = [0, size / 2, 0];
  const frame = crate ? CLIP_FX.crateMarquee : CLIP_FX.enemyMarquee;
  const marquee = createMarquee(color, CLIP_FX.brightness);
  const aim = createMarquee(color, CLIP_FX.aimBrightness);
  const ghost = createMarquee(thingColor, CLIP_FX.ghostBrightness);
  const body = { at: [0, 0, 0], body: { size: [size, size, size] } };
  const hands = { at: [at[0] + ZAP_FX.reach, ZAP_FX.height, 0] };
  const pixels = createStream(streamCount(body, hands), [thingColor, color]);
  const asset = new Group().add(wizard, flare, thing, marquee, aim, ghost, pixels);
  // Cut at tick 50, paste at 170; loop 280.
  const cutAt = 50;
  const pasteAt = 170;
  const loop = 280;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const cast = tick >= pasteAt ? pasteAt : cutAt;
    placeCastFlare(flare, at, Math.PI / 2, tick - cast);
    const held = tick >= cutAt && tick < pasteAt;
    const mode = tick >= pasteAt ? 'paste' : tick >= cutAt ? 'cut' : null;
    const since = tick - cast;
    const effect = mode !== null && since < PLAYER.clipTicks;
    // The cut thing shows until the marquee has snapped on; a pasted one grows in.
    thing.visible = !held || since < CLIP_FX.snapTicks;
    const scale = mode === 'paste' ? Math.max(pasteGrow(since), 1e-3) : 1;
    thing.scale.setScalar(scale);
    thing.position.set(...center.map((v) => v * (1 - scale)));
    const look = effect ? marqueeLook(mode, since) : { visible: false };
    marquee.visible = false;
    if (look.visible) placeMarquee(marquee, center, frame * look.scale, time);
    if (!effect) placeStream(pixels, null);
    else if (mode === 'cut') placeStream(pixels, since - CLIP_FX.snapTicks, CLIP_FX.streamTicks, body, hands);
    else placeStream(pixels, since, CLIP_FX.streamTicks, hands, body);
    aim.visible = false;
    ghost.visible = false;
    if (!effect && !held) placeMarquee(aim, center, crate ? CLIP_FX.aimMarquee : CLIP_FX.enemyMarquee, time);
    if (!effect && held) placeMarquee(ghost, center, size, time);
  };
  return asset;
}

/**
 * Pull (D124) in a loop: the wizard (left, facing +x) pulls the crate or
 * bug three cells ahead one cell towards him.
 * @param {'crate'|'bug'} kind
 */
function buildPull(kind) {
  const { color } = defs.spells.pull;
  const at = [-2, 0, 0];
  const wizard = createWizard();
  wizard.position.set(...at);
  wizard.rotation.y = Math.PI / 2;
  const flare = createCastFlare();
  const crate = kind === 'crate';
  const thing = new Group();
  let bug = null;
  if (crate) {
    const view = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES.crate, at: [0, 0, 0] });
    view.position.set(-0.5, 0, -0.5);
    thing.add(view);
  } else {
    bug = createBug(defs.enemies.bug.color);
    bug.rotation.y = -Math.PI / 2;
    thing.add(bug);
  }
  const height = crate ? 1 : ENEMY.size[1];
  const frame = crate ? PULL_FX.crateMarquee : PULL_FX.enemyMarquee;
  const marquee = createMarquee(color, PULL_FX.brightness);
  const aim = createMarquee(color, PULL_FX.aimBrightness);
  const pixels = createPixelBurst(PULL_PIXELS, PULL_FX.pixelSize, [color]);
  const asset = new Group().add(wizard, flare, thing, marquee, aim, pixels);
  const hands = [at[0] + ZAP_FX.reach, ZAP_FX.height, 0];
  // Cast at tick 50; it slides a cell in 20 ticks (3 units a second); loop 160.
  const castAt = 50;
  const slideTicks = 20;
  const loop = 160;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const since = tick - castAt;
    placeCastFlare(flare, at, Math.PI / 2, since);
    const x = 1 - Math.max(0, Math.min(1, since / slideTicks));
    thing.position.set(x, 0, 0);
    if (bug) animateBug(bug, { state: since >= 0 && since < slideTicks ? 'walk' : 'rest', walked: since / slideTicks, time });
    const center = [x, height / 2, 0];
    const scale = since >= 0 ? pullMarquee(since) : null;
    marquee.visible = false;
    aim.visible = false;
    if (scale !== null) placeMarquee(marquee, center, frame * scale, time);
    else if (since < 0) placeMarquee(aim, center, crate ? PULL_FX.aimMarquee : frame, time);
    placePixels(pixels, scale !== null ? pullPixels(since, center, hands) : [], [0, 0, 0]);
  };
  return asset;
}

/**
 * Compile (D125) in a loop: the wizard (left, facing +x) compiles a crate
 * into the cell in front of him, which lasts a shortened while.
 */
function buildCompile() {
  const { color, object } = defs.spells.compile;
  const type = { ...OBJECT_STYLE_DEFAULTS, ...OBJECT_TYPES[object] };
  const at = [-1, 0, 0];
  const cell = [-0.5, 0, -0.5];
  const wizard = createWizard();
  wizard.position.set(...at);
  wizard.rotation.y = Math.PI / 2;
  const flare = createCastFlare();
  const crate = createObjectView({ ...type, at: [0, 0, 0] });
  const aim = createMarquee(color, COMPILE_FX.aimBrightness);
  const hands = { at: [at[0] + ZAP_FX.reach, ZAP_FX.height, 0] };
  const into = { at: [cell[0] + 0.5, cell[1], cell[2] + 0.5], body: BLOCK_BODY };
  const bits = createStream(streamCount(hands, into), [color, 0xffffff]);
  const pieces = createDerez(BLOCK_BODY, [type.color, 0xffffff]);
  const asset = new Group().add(wizard, flare, crate, aim, bits, pieces);
  // Cast at tick 40; the crate lasts 240 ticks here; loop 360.
  const castAt = 40;
  const lifetime = 240;
  const loop = 360;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const age = tick - castAt;
    placeCastFlare(flare, at, Math.PI / 2, age);
    aim.visible = false;
    if (age < 0) placeMarquee(aim, cell.map((v) => v + 0.5), COMPILE_FX.aimMarquee, time);
    placeStream(bits, age >= 0 ? age : null, PLAYER.compileTicks, hands, into);
    const alive = age >= 0 && age < lifetime;
    const look = alive ? compileLook(age, lifetime - age) : { visible: false, scale: 1 };
    crate.visible = look.visible;
    crate.scale.setScalar(look.scale);
    crate.position.set(...cell.map((v) => v + (1 - look.scale) / 2));
    placeDerez(pieces, age >= lifetime ? age - lifetime : null, [cell[0] + 0.5, cell[1], cell[2] + 0.5]);
  };
  return asset;
}

/**
 * Fork (D129) in a loop: the wizard casts, blue bits fly from his hands
 * into the cell in front of him and a hologram of him grows in there; it
 * stands, blinks (faster at the end) and derezzes.
 */
function buildFork() {
  const { color } = defs.spells.fork;
  const at = [-1, 0, 0];
  const cell = [-0.5, 0, -0.5];
  const feet = [cell[0] + 0.5, cell[1], cell[2] + 0.5];
  const wizard = createWizard();
  wizard.position.set(...at);
  wizard.rotation.y = Math.PI / 2;
  const flare = createCastFlare();
  const decoy = createDecoyModel(color);
  const aim = createMarquee(color, 0.8);
  const hands = { at: [at[0] + ZAP_FX.reach, ZAP_FX.height, 0] };
  const into = { at: feet, body: BLOCK_BODY };
  const bits = createStream(streamCount(hands, into), [color, 0xffffff]);
  const asset = new Group().add(wizard, flare, decoy.group, aim, bits);
  // Cast at tick 40; the decoy stands 240 ticks here; loop 360.
  const castAt = 40;
  const lifetime = 240;
  const loop = 360;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const age = tick - castAt;
    placeCastFlare(flare, at, Math.PI / 2, age);
    aim.visible = false;
    if (age < 0) placeMarquee(aim, [feet[0], feet[1] + 0.5, feet[2]], 1.06, time);
    placeStream(bits, age >= 0 ? age : null, PLAYER.forkTicks, hands, into);
    const gone = age >= lifetime ? age - lifetime : null;
    decoy.group.visible = age >= 0;
    placeDecoyModel(decoy, { pos: feet, facing: Math.PI / 2, age, ticksLeft: lifetime - age, gone, ground: 0, width: 0.6, dt });
  };
  return asset;
}

/**
 * Scan (D128) in a loop, in a 5×5 room: the wizard (facing the wall,
 * −x) casts; the wave reaches the fake block in the wall first (it derezzes), then the
 * hidden doorway behind it (its patch of wall derezzes and it opens).
 * The room view is swapped as each is revealed, as the game rebuilds it.
 */
function buildScan() {
  const { color } = defs.spells.scan;
  const size = [5, 3, 5];
  const range = 4;
  const origin = [3, 0, 3.5];
  const plain = [0, 1, 3, 4].flatMap((z) => [0, 1, 2].map((y) => [1, y, z])).concat([[1, 2, 2]]);
  const fake = [[1, 0, 2], [1, 1, 2]];
  const exit = withExitDefaults({ id: 'north', side: '-z', at: 3, hidden: true });
  const view = (blocks, exits) => createRoomView({ size, blocks, blockTypes: BLOCK_TYPES, exits, color: PALETTE.amber });
  const stages = [view({ block: plain, fake }, []), view({ block: plain }, []), view({ block: plain }, [exit])];
  // When the wave reaches each (its reach, entities/scan.js), in ticks after the cast.
  const reachedAt = [cellReach(origin, fake[0]), exitReach(origin, exit, size)].map((d) => (d / range) * SCAN.spreadTicks);
  const wizard = createWizard();
  wizard.position.set(...origin);
  wizard.rotation.y = -Math.PI / 2;
  const flare = createCastFlare();
  const wave = createWave(color);
  const found = [{ cell: fake[0] }, { exit }].map((thing) => {
    const { body, at } = revealBody(thing, size);
    return { mesh: createDerez(body, [PALETTE.amber, 0xffffff]), at };
  });
  const room = new Group().add(...stages, wizard, flare, wave, ...found.map(({ mesh }) => mesh));
  room.position.set(-2.5, 0, -2.5);
  const asset = new Group().add(room);
  // Cast at tick 40; loop 240.
  const castAt = 40;
  const loop = 240;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const age = tick - castAt;
    placeCastFlare(flare, origin, -Math.PI / 2, age);
    placeWave(wave, age >= 0 && age < PLAYER.scanTicks ? age : null, origin, range, size);
    const revealed = reachedAt.filter((at) => age >= at).length;
    stages.forEach((stage, i) => (stage.visible = i === revealed));
    found.forEach(({ mesh, at }, i) => placeDerez(mesh, age >= reachedAt[i] ? age - reachedAt[i] : null, at));
  };
  return asset;
}

/** The HUD's clipboard slot (D87): empty, holding a crate, holding a frozen bug. */
function buildClipHud() {
  const pause = defs.spells.pause.color;
  const held = [null, { kind: 'object', data: OBJECT_TYPES.crate }, { kind: 'enemy', data: defs.enemies.bug, frozen: {} }];
  const tags = held.map(
    (thing, i) =>
      `<div class="hud-spell" style="top:calc(${182 + i * 52} * var(--u))"><span class="hud-spell-name">${strings.strings['spell.cut_paste']}</span><span class="hud-clip">${clipIcon(thing, pause)}</span></div>`,
  );
  renderer.hud.insertAdjacentHTML('beforeend', tags.join(''));
  return new Group();
}
