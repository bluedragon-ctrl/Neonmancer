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
import { Group, Vector3 } from 'three';
import defs from '../data/defs.json';
import strings from '../data/strings.json';
import { OBJECT_STYLE_DEFAULTS, resolveBlockTypes, withExitDefaults } from '../src/data/room-data.js';
import { VIEW_HEIGHT, frameRoom } from '../src/render/camera.js';
import { PLAYER } from '../src/entities/player.js';
import { COLLAPSING } from '../src/entities/collapsing.js';
import {
  CollapsingView,
  createDerezPixels,
  createPixelBurst,
  createDropShadow,
  createRails,
  placePixels,
  showHitFlash,
} from '../src/render/entity-view.js';
import { advance, buildTrack, positionOf, startState } from '../src/world/path.js';
import { derezPixels, hitFlash, wizardLook } from '../src/render/hit-fx.js';
import { createFloor } from '../src/render/floor.js';
import { PALETTE } from '../src/render/neon.js';
import { Renderer } from '../src/render/renderer.js';
import { ASPECT } from '../src/render/viewport.js';
import { createActiveBlockView, flareHazard } from '../src/render/block-fx.js';
import { createObjectView, createRoomView } from '../src/render/room-view.js';
import { COLLAPSE_FX, COLLAPSE_PIXELS, collapsePixels } from '../src/render/collapse-fx.js';
import { ExitView } from '../src/render/exit-view.js';
import { HOLO_TIME } from '../src/render/holo.js';
import { createWizard } from '../src/render/wizard.js';
import { addXray } from '../src/render/xray.js';
import { BUG, animateBug, createBug, popPixels, setEyeMood } from '../src/render/bug.js';
import { ZAP_FX, damagedGlitch, enemyHitLook } from '../src/render/zap-fx.js';
import { createBolt, createCastFlare, createSparks, placeBolt, placeCastFlare, placeSparks } from '../src/render/zap-view.js';
import { EnergyBar } from '../src/ui/energy-bar.js';
import { DISK, createDisk, diskMotion, diskPixels, poseDisk } from '../src/render/disk.js';
import { createRefill, refillMotion } from '../src/render/refill.js';

/** Block types with variants filled in (D60). */
const BLOCK_TYPES = resolveBlockTypes(defs.blocks);

/** Units between two assets (the default span of an asset). */
const SPACING = 3;
/** Turning speed in radians per second. */
const SPIN = 0.6;

/**
 * Showcased assets: a label and a function building the model centered on
 * the origin, standing on y = 0.
 */
const ALL_ASSETS = [
  { label: 'wizard', build: () => createWizard(), shadow: PALETTE.cyan },
  { label: 'wizard-hit', build: buildWizardHit, shadow: PALETTE.cyan },
  // Every object type from defs.json, in its own style (destructible ones
  // with data bits missing).
  ...Object.entries(defs.objects).map(([type, props]) => ({
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
  { label: 'exits', span: 5.5, build: buildExits },
  { label: 'platforms', span: 5.5, build: buildPlatforms },
  { label: 'collapsing-cycle', span: 4.5, build: buildCollapsingCycle },
  // Bugs (D48): walking hops in each mood, one being bounced on, a pop.
  { label: 'bug', group: 'bugs', build: () => buildBug('hostile') },
  { label: 'bug-provoked', group: 'bugs', build: () => buildBug('provoked') },
  { label: 'bug-peaceful', group: 'bugs', build: () => buildBug('peaceful') },
  { label: 'bug-bounce', group: 'bugs', build: () => buildBug('hostile', { bounced: true }) },
  { label: 'bug-pop', group: 'bugs', build: buildBugPop },
  // Zap (step 6): the bolt close up, two hits on a bug (the second pops
  // it), and rapid fire at a crate until the energy bar runs dry.
  { label: 'zap-bolt', group: 'zap', build: buildZapBolt },
  { label: 'zap-bug', group: 'zap', span: 6, build: buildZapBug },
  { label: 'zap-crate', group: 'zap', span: 5, build: buildZapCrate },
  { label: 'zap-break', group: 'zap', span: 5, build: buildZapBreak },
  // X-ray (step 7): the wizard walking behind a wall shows through it; the
  // turntable stands still so the wall stays in front.
  { label: 'xray', span: 5.5, spin: false, build: buildXray },
  // Data disks (Phase 3 step 2): spinning on their own with the spell's slot
  // as one lit bit (Zap: slot 0), a found one as a ghost, a pick-up in a
  // loop, and all 16 slots.
  { label: 'disk', group: 'disks', spin: false, build: () => buildDisk() },
  { label: 'disk-ghost', group: 'disks', spin: false, build: () => buildDisk({ ghost: true }) },
  { label: 'disk-collect', group: 'disks', spin: false, build: buildDiskCollect },
  { label: 'disk-in-room', group: 'disks', span: 5.5, spin: false, build: buildDiskInRoom },
  { label: 'disk-slots', group: 'disks', span: 6, spin: false, build: buildDiskSlots },
  // Refills (temporary pickups): integrity and energy, hovering and spinning
  // like a disk; picked up the same way; beside a disk and the wizard for scale.
  { label: 'refill-integrity', group: 'refills', spin: false, build: () => buildRefill('integrity') },
  { label: 'refill-energy', group: 'refills', spin: false, build: () => buildRefill('energy') },
  { label: 'refill-collect', group: 'refills', spin: false, build: buildRefillCollect },
  { label: 'pickups-in-room', group: 'refills', span: 5.5, spin: false, build: buildPickupsInRoom },
];

/** For scale: a disk on the floor and one on a block, the wizard and a crate beside them, in a 4×4 room corner. */
function buildDiskInRoom() {
  const room = new Group().add(createRoomView({ size: [4, 3, 4], blocks: { block: [[3, 0, 1]] }, blockTypes: BLOCK_TYPES, color: PALETTE.amber }));
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...defs.objects.crate, at: [0, 0, 2] });
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

/** A data disk idling (or standing still as a ghost). */
function buildDisk(options = {}) {
  const disk = createDisk(options);
  const asset = new Group().add(disk);
  asset.userData.update = (dt, time) => poseDisk(disk, diskMotion({ time, ghost: options.ghost }));
  return asset;
}

/** A refill idling. */
function buildRefill(stat) {
  const refill = createRefill(stat);
  const asset = new Group().add(refill);
  asset.userData.update = (dt, time) => poseDisk(refill, refillMotion(diskMotion({ time })));
  return asset;
}

/** Both refills picked up every 2 s, a moment apart. */
function buildRefillCollect() {
  const asset = new Group();
  const { pixels: count, pixelSize, riseTicks } = DISK.collect;
  const items = ['integrity', 'energy'].map((stat, i) => {
    const model = createRefill(stat);
    model.position.x = i === 0 ? -0.6 : 0.6;
    const pixels = createPixelBurst(count, pixelSize, [model.userData.color, 0xffffff]);
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
      const burst = collected === undefined ? [] : diskPixels(collected - riseTicks);
      placePixels(pixels, burst, [model.position.x, motion.y, 0]);
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
    poseDisk(disk, diskMotion({ time: 0, ghost: true }));
    asset.add(disk);
  }
  return asset;
}

/** A data disk picked up every 2 s: it rises, flashes and bursts into pixels, then comes back. */
function buildDiskCollect() {
  const disk = createDisk();
  const { pixels: count, pixelSize, riseTicks } = DISK.collect;
  const pixels = createPixelBurst(count, pixelSize, [disk.userData.color, disk.userData.glyphColor]);
  const asset = new Group().add(disk, pixels);
  const loop = 120;
  let tick = 0;
  asset.userData.update = (dt, time) => {
    tick = (tick + dt * 60) % loop;
    const collected = tick >= 50 ? tick - 50 : undefined;
    const motion = diskMotion({ time, collected });
    poseDisk(disk, motion);
    const burst = collected === undefined ? [] : diskPixels(collected - riseTicks);
    placePixels(pixels, burst, [0, motion.y, 0]);
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
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...defs.objects.crate, at: [0, 0, 3] });
  const wizard = createWizard();
  addXray(wizard);
  room.add(crate, wizard);
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  const loop = 360;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    // Back and forth along x, behind the crate and the wall.
    const t = tick / loop;
    const leg = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const x = t < 0.5 ? 0.5 + leg * 3 : 3.5 - leg * 3;
    wizard.position.set(x, 0, 2.2);
    wizard.rotation.y = t < 0.5 ? Math.PI / 2 : -Math.PI / 2;
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
  const props = defs.objects.crate_cross;
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...props, at: [0, 0, 0] });
  crate.position.set(0.8, 0, -0.5);
  const pixels = createPixelBurst(COLLAPSE_PIXELS, COLLAPSE_FX.pixelSize, [props.color, 0xffffff]);
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
    placePixels(pixels, collapsePixels(broke), [0.8, 0, -0.5]);
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
    placeBolt(bolt, [0, ZAP_FX.height, traveled - 1.5], [0, 1], tick, traveled);
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
      if (bolt.live) placeBolt(bolt.view, [this.x0 + ZAP_FX.reach + bolt.traveled, ZAP_FX.height, 0], [1, 0], bolt.age, bolt.traveled);
    }
    for (const spark of this.sparks) placeSparks(spark.view, [spark.x, ZAP_FX.height, 0], [1, 0], spark.tick);
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
  const pixels = createPixelBurst(BUG.pop.pixels, BUG.pop.pixelSize, [color, 0xffffff]);
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
    placePixels(pixels, popPixels(popTick), [0, 0, 0]);
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
  const crate = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...defs.objects.crate, at: [0, 0, 0] });
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
    bar.set(energy, PLAYER.maxEnergy, cost);
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

/** A bug popping into pixels, in a loop. */
function buildBugPop() {
  const { color } = defs.enemies.bug;
  const bug = createBug(color);
  const pixels = createPixelBurst(BUG.pop.pixels, BUG.pop.pixelSize, [color, 0xffffff]);
  const asset = new Group().add(bug, pixels);
  const loop = 90;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const popped = tick >= 40;
    bug.visible = !popped;
    placePixels(pixels, popped ? popPixels(tick - 40) : [], [0, 0, 0]);
  };
  return asset;
}

/**
 * The wizard getting hurt, in a loop: hit (a flash, then blinking while invulnerable),
 * a pause, then losing his last point (derez into pixels), then back.
 */
function buildWizardHit() {
  const wizard = createWizard();
  const pixels = createDerezPixels();
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
    placePixels(pixels, dead ? derezPixels(derezTick) : [], [0, 0, 0]);
  };
  return asset;
}

/** One block of a damaging type in its animated look. */
function buildActiveBlock(type) {
  const view = createActiveBlockView([[0, 0, 0]], BLOCK_TYPES[type].look, BLOCK_TYPES[type].color);
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
 * Moving platforms on their guide lines in a 4×4 room corner: one gliding round
 * an L-shaped ping-pong path on the floor, a lift going up to a ledge.
 */
function buildPlatforms() {
  const size = [4, 3, 4];
  const color = defs.objects.platform.color;
  const style = { ...OBJECT_STYLE_DEFAULTS, ...defs.objects.platform, at: [0, 0, 0] };
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
 * A row of three collapsing blocks going through their states in a loop,
 * one after the other like a bridge giving way under a runner: standing
 * still, shaking, breaking into pixels, and after a while growing back.
 */
function buildCollapsingCycle() {
  const object = { ...OBJECT_STYLE_DEFAULTS, ...BLOCK_TYPES.collapsing };
  const solidTicks = 40;
  const goneTicks = 60;
  const loop = solidTicks + COLLAPSING.shakeTicks + goneTicks;
  const blocks = [0, 1, 2].map((i) => ({ object, pos: [i - 1.5, 0, -0.5], state: 'solid', timer: 0, regrown: false }));
  const views = blocks.map((block) => new CollapsingView(null, block));
  const asset = new Group().add(...views.map((view) => view.group));
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    blocks.forEach((block, i) => {
      // Each block starts shaking 12 ticks after the one before.
      const t = (tick - i * 12 + loop) % loop;
      const whole = Math.floor(t);
      // Solid from the start of the loop: it just grew back.
      if (whole < solidTicks) Object.assign(block, { state: 'solid', timer: whole, regrown: true });
      else if (whole < solidTicks + COLLAPSING.shakeTicks) Object.assign(block, { state: 'shake', timer: whole - solidTicks });
      else Object.assign(block, { state: 'gone', timer: whole - solidTicks - COLLAPSING.shakeTicks });
    });
    for (const view of views) view.sync(0);
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
