/**
 * Views of moving things: they read the game state once per frame and
 * place their meshes at the interpolated position between the last two
 * ticks, so motion is smooth at any refresh rate.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ENEMY } from '../entities/enemy.js';
import { PLAYER } from '../entities/player.js';
import { createAlertMark, placeAlertMark } from './alert-mark.js';
import { BUG_MODEL } from './bug.js';
import { chargeGlow, createDischarge, dischargeLook, placeDischarge } from './discharge.js';
import { eyeMood } from './enemy-look.js';
import { SENTINEL_MODEL } from './sentinel.js';
import { CRON_MODEL } from './cron.js';
import { WORM_MODEL } from './worm.js';
import { CRAWLER_MODEL } from './crawler.js';
import { VIRUS_MODEL } from './virus.js';
import { hitJolt } from './break-fx.js';
import { COLLAPSE_FX, COLLAPSE_PIXELS, collapseLook, collapsePixels } from './collapse-fx.js';
import { PALETTE, lineMaterial, neonLines, shared } from './neon.js';
import { fadingDrops } from './hole-view.js';
import { HIT_FX, derezPixels, hitFlash, wizardLook } from './hit-fx.js';
import { lerpAngle, lerpPosition, shadowScale } from './interp.js';
import { railSegments } from './rails.js';
import { createObjectView } from './room-view.js';
import { createWizard } from './wizard.js';
import { addXray } from './xray.js';
import { damagedGlitch, enemyHitLook } from './zap-fx.js';
import { createCastFlare, placeCastFlare } from './zap-view.js';
import { createInstall, placeInstall } from './install-view.js';
import { createPickupModel } from './pickup-model.js';
import { createShield, placeShield } from './shield-view.js';
import { createFirewall, placeFirewall } from './firewall-view.js';
import { PAUSE_FX, pauseLook } from './pause-fx.js';
import { createPauseCage, placePauseCage } from './pause-view.js';
import { warpFlash } from './warp-fx.js';
import { createWarpTrail, dashPose, placeWarpTrail } from './warp-view.js';
import { ClipView } from './clip-view.js';
import { createJumpRings, placeJumpRings } from './jump-view.js';

/**
 * Which bodies get a drop shadow besides the wizard (who always has one).
 * Falling objects' shadows are off while the author tries a shadow under
 * the wizard only (D50); enemies have none.
 */
export const DROP_SHADOWS = { fallingObjects: false };

/** Shadow lift above the surface, so it never fights with the floor or block tops. */
const SHADOW_LIFT = 0.01;

const shadowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A glowing ring with a soft filled center, fading to nothing at the edge.
const shadowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float ring = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.8, 1.0, r));
    float fill = 0.12 * (1.0 - smoothstep(0.0, 0.8, r));
    gl_FragColor = vec4(uColor * (ring * 0.5 + fill) * uOpacity, 1.0);
  }
`;

/**
 * Glowing drop shadow directly under a body (CLAUDE.md §4): additive, so it
 * glows on dark surfaces; smaller and fainter the higher the body is.
 * @param {number|string} color
 */
export function createDropShadow(color) {
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 1 },
    },
    vertexShader: shadowVertex,
    fragmentShader: shadowFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(SHADOW_PLANE, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

/** Unit plane shared by every drop shadow. */
const SHADOW_PLANE = shared(new PlaneGeometry(1, 1));

/**
 * Show a drop shadow on the surface at height `ground` under a body whose
 * bottom is at `bottom`, or hide it when there is none (ground null).
 * @param {Mesh} shadow from createDropShadow()
 * @param {number} x center of the shadow
 * @param {number} z
 * @param {number} bottom height of the body's bottom
 * @param {number|null} ground
 * @param {number} diameter at the surface
 */
function placeShadow(shadow, x, z, bottom, ground, diameter) {
  shadow.visible = ground !== null;
  if (ground === null) return;
  const { scale, opacity } = shadowScale(bottom - ground);
  shadow.position.set(x, ground + SHADOW_LIFT, z);
  shadow.scale.set(diameter * scale, diameter * scale, 1);
  shadow.material.uniforms.uOpacity.value = opacity;
}

/**
 * A burst of glowing pixels: small additive cubes, taking turns in the
 * given colors, hidden until placePixels() shows some.
 * @param {number} count
 * @param {number} size edge of one cube
 * @param {(number|string)[]} colors
 */
export function createPixelBurst(count, size, colors) {
  const geometry = new BoxGeometry(size, size, size);
  const material = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new InstancedMesh(geometry, material, count);
  const tints = colors.map((color) => new Color(color).multiplyScalar(1.6));
  for (let i = 0; i < count; i++) mesh.setColorAt(i, tints[i % tints.length]);
  mesh.frustumCulled = false; // instances move far from the geometry's own bounds
  mesh.visible = false;
  return mesh;
}

/** The burst of pixels a derezzing wizard leaves (see hit-fx.js), in his colors. */
export function createDerezPixels() {
  return createPixelBurst(HIT_FX.pixels, HIT_FX.pixelSize, [PALETTE.cyan, PALETTE.magenta]);
}

const pixelMatrix = new Matrix4();

/**
 * Show a pixel burst around `pos`, or hide it when there are no pixels.
 * @param {InstancedMesh} mesh from createPixelBurst()
 * @param {{ offset: number[], scale: number }[]} pixels offsets from `pos`
 *   (e.g. from derezPixels() or collapsePixels())
 * @param {number[]} pos
 */
export function placePixels(mesh, pixels, pos) {
  mesh.visible = pixels.length > 0;
  pixels.forEach(({ offset: [x, y, z], scale }, i) => {
    pixelMatrix.makeScale(scale, scale, scale).setPosition(pos[0] + x, pos[1] + y, pos[2] + z);
    mesh.setMatrixAt(i, pixelMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Set a wizard model's flash uniforms from hitFlash().
 * @param {import('three').Object3D} wizard from createWizard()
 * @param {{ amount: number, color: 'white'|'magenta' }} flash
 */
export function showHitFlash(wizard, { amount, color }) {
  const uniforms = wizard.userData.flash;
  uniforms.amount.value = amount;
  uniforms.color.value.set(color === 'white' ? 0xffffff : PALETTE.magenta);
}

export class PlayerView {
  /**
   * @param {import('../game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new Group();
    this.wizard = createWizard();
    /** Ghost of his parts hidden behind blocks (xray.js). */
    this.xray = addXray(this.wizard);
    this.shadow = createDropShadow(PALETTE.cyan);
    this.pixels = createDerezPixels();
    this.flare = createCastFlare();
    /** The double jump's kick-off rings (D95). */
    this.jumpRings = createJumpRings();
    this.group.add(this.wizard, this.shadow, this.pixels, this.flare, this.jumpRings);
    /** Install animations by spell id, made when first needed (D73). */
    this.installs = new Map();
    /** The Shield and Firewall rings by spell id, made when first cast. */
    this.rings = new Map();
    /** The Blink and Warp afterimages by spell id, made when first cast (D86). */
    this.trails = new Map();
    /** Cut & Paste (D87): its effect and aim marker, made when he first knows the spell. */
    this.clip = null;
  }

  /** The afterimage of a Blink or Warp `spell`, made on first use. */
  trailView(spell) {
    let view = this.trails.get(spell);
    if (!view) {
      view = createWarpTrail(this.game.content.spells[spell].color, spell);
      this.trails.set(spell, view);
      this.group.add(view);
    }
    return view;
  }

  /** The install animation of `item` (a data disk's or buff chip's pickup type id), made on first use. */
  installView(item) {
    let view = this.installs.get(item);
    if (!view) {
      const { content } = this.game;
      view = createInstall(createPickupModel(content, content.pickupTypes[item]));
      this.installs.set(item, view);
      this.group.add(view);
    }
    return view;
  }

  /** The ring of a Shield or Firewall `spell`, made on first use. */
  ringView(spell) {
    let view = this.rings.get(spell);
    if (!view) {
      // Shield+ (D95) is the Shield's ring in the upgrade's color.
      const { color } = spell === 'shield_plus' ? this.game.player.upgrades.get('shield_plus') : this.game.content.spells[spell];
      view = spell === 'firewall' ? createFirewall(color) : createShield(color);
      this.rings.set(spell, view);
      this.group.add(view);
    }
    return view;
  }

  /**
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    const player = this.game.player;
    const { warp } = player;
    // A Blink draws him dashing there over a few frames, stretched (D86).
    const dash = dashPose(warp, lerpPosition(player.prev, player.pos, alpha), warp ? warp.tick + alpha : 0);
    const { pos } = dash;

    this.wizard.position.set(pos[0], pos[1], pos[2]);
    this.wizard.rotation.y = lerpAngle(player.prevFacing, player.facing, alpha);
    // Blinking after a hit; derezzing when he dies out of a hole.
    const look = wizardLook(player, PLAYER.deathTicks);
    this.wizard.visible = look.visible;
    this.wizard.scale.set(look.scale[0] / Math.sqrt(dash.stretch), look.scale[1] / Math.sqrt(dash.stretch), look.scale[2] * dash.stretch);
    // A hit's flash wins over the arrival flash of a Warp (D86).
    const hit = hitFlash(player);
    const arrival = warp?.spell === 'warp' ? warpFlash(warp.tick + alpha) : 0;
    if (hit.amount > 0 || arrival === 0) showHitFlash(this.wizard, hit);
    else {
      this.wizard.userData.flash.amount.value = arrival;
      this.wizard.userData.flash.color.value.set(this.game.content.spells[warp.spell].color);
    }
    for (const [spell, view] of this.trails) if (warp?.spell !== spell) placeWarpTrail(view, null, 0);
    if (warp) placeWarpTrail(this.trailView(warp.spell), warp, warp.tick + alpha);
    // Installing a spell or buff: the disk's or chip's bits flow from where it hung into him, wherever he goes, and tint him.
    const { install, shield } = player;
    for (const [item, view] of this.installs) view.visible = install?.item === item;
    if (install) placeInstall(this.installView(install.item), this.wizard, pos, install.tick + alpha, install.at.map((v, i) => v - pos[i]));
    placeJumpRings(this.jumpRings, player.airJumpFrom, player.airJumpTicks === null ? null : player.airJumpTicks + alpha);
    const ring = shield?.reflects ? 'shield_plus' : shield?.spell;
    for (const [spell, view] of this.rings) view.visible = ring === spell;
    if (shield) {
      const place = shield.spell === 'firewall' ? placeFirewall : placeShield;
      const sinceBlock = shield.blockedAt === null ? null : shield.tick - shield.blockedAt + alpha;
      place(this.ringView(ring), pos, shield.tick + alpha, shield.ticks, sinceBlock);
    }
    // Cut & Paste: its effect wherever he goes, and its aim marker (D87).
    const clipSpell = this.game.content.spells.cut_paste;
    if (!this.clip && clipSpell && player.spells.includes('cut_paste')) {
      this.clip = new ClipView(clipSpell.color);
      this.group.add(this.clip.group);
    }
    this.clip?.sync(this.game, pos, alpha, dt);
    // No ghost while dead: not of him falling into a pit, nor of the derez.
    for (const ghost of this.xray) ghost.visible = !player.dead;
    const derezzing = player.dead && player.deathCause !== 'hole';
    placePixels(this.pixels, derezzing ? derezPixels(PLAYER.deathTicks - player.deathTimer + alpha) : [], pos);

    // The flare at his hands, the way the bolt flies (his aim, not his turning body).
    placeCastFlare(this.flare, pos, player.targetFacing, player.castTicks === null || player.dead ? Infinity : player.castTicks + alpha);

    const ground = player.dead ? null : this.game.shadowHeight(pos, player.size);
    placeShadow(this.shadow, pos[0], pos[2], pos[1], ground, player.size[0] * 1.5);
  }
}

/**
 * Nothing of an object is drawn below the floor: one sinking into a hole
 * disappears into the pit, and a plugged hole shows only the object's top,
 * flush with the floor, plus short corner lines fading into the pit like
 * the pit's own. (A hair below 0, so edges lying on the floor stay.)
 */
const FLOOR_CLIP = [new Plane(new Vector3(0, 1, 0), 0.01)];

export class PushableView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pushable.js').Pushable} pushable
   */
  constructor(game, pushable) {
    this.game = game;
    this.pushable = pushable;
    this.group = new Group();
    // The object view is built at the origin and moved as a whole.
    this.block = createObjectView({ ...pushable.object, at: [0, 0, 0] });
    this.block.traverse((node) => {
      for (const material of [node.material ?? []].flat()) material.clippingPlanes = FLOOR_CLIP;
    });
    this.shadow = createDropShadow(pushable.object.color);
    /** Made once the object plugs a hole (most never do): its vertical edges fade into the pit. */
    this.plugDrops = null;
    this.group.add(this.block, this.shadow);
    // Destructible: it breaks into pixels like a collapsing block.
    if (pushable.integrity !== null) {
      this.pixels = createPixelBurst(COLLAPSE_PIXELS, COLLAPSE_FX.pixelSize, [pushable.object.color, 0xffffff]);
      this.group.add(this.pixels);
    }
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { pushable } = this;
    const pos = lerpPosition(pushable.prev, pushable.pos, alpha);
    if (this.pixels) {
      const broken = pushable.state === 'broken';
      this.block.visible = !broken;
      placePixels(this.pixels, broken ? collapsePixels(pushable.timer + alpha) : [], pushable.pos);
      if (broken) {
        this.shadow.visible = false;
        return;
      }
      const jolt = hitJolt(pushable.hitTicks === null ? null : pushable.hitTicks + alpha);
      for (let i = 0; i < 3; i++) pos[i] += jolt[i];
    }
    this.block.position.set(pos[0], pos[1], pos[2]);
    if (pushable.state === 'plugged' && !this.plugDrops) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
      this.plugDrops = fadingDrops(corners, 1, pushable.object.color, 1, 2.5);
      this.plugDrops.position.set(...pushable.pos); // a plugged object never moves again
      this.group.add(this.plugDrops);
    }

    // Drop shadow only while falling, if falling objects have one (DROP_SHADOWS).
    const falling = DROP_SHADOWS.fallingObjects && pushable.state === 'fall';
    const ground = falling ? this.game.objectShadowHeight(pushable, pos) : null;
    placeShadow(this.shadow, pos[0] + 0.5, pos[2] + 0.5, pos[1], ground, 1.3);
  }
}

export class PlatformView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/platform.js').Platform} platform
   */
  constructor(game, platform) {
    this.platform = platform;
    this.group = new Group();
    // The block is built at the origin and moved as a whole; the guide line
    // stays in room coordinates.
    this.block = createObjectView({ ...platform.object, at: [0, 0, 0] });
    this.rails = createRails(platform.track, platform.object.color);
    this.group.add(this.rails, this.block);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { platform } = this;
    const pos = lerpPosition(platform.prev, platform.pos, alpha);
    this.block.position.set(pos[0], pos[1], pos[2]);
  }
}

export class CollapsingView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/collapsing.js').Collapsing} block (or anything
   *   with its `pos`, `state`, `timer`, `regrown` and `object`, as in the showcase)
   */
  constructor(game, block) {
    this.block = block;
    // The object view is built centered on the origin, so it can shrink
    // around its center while it grows back.
    this.view = createObjectView({ ...block.object, at: [0, 0, 0] });
    this.view.position.set(-0.5, -0.5, -0.5);
    this.center = new Group().add(this.view);
    this.pixels = createPixelBurst(COLLAPSE_PIXELS, COLLAPSE_FX.pixelSize, [block.object.color]);
    // Pixels falling into a pit disappear at the floor, like objects.
    this.pixels.material.clippingPlanes = FLOOR_CLIP;
    this.group = new Group().add(this.center, this.pixels);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { block } = this;
    const [x, y, z] = block.pos;
    const look = collapseLook(block, alpha);
    this.center.visible = look.visible;
    this.center.position.set(x + 0.5 + look.offset[0], y + 0.5 + look.offset[1], z + 0.5 + look.offset[2]);
    this.center.scale.setScalar(look.scale);
    placePixels(this.pixels, block.state === 'gone' ? collapsePixels(block.timer + alpha) : [], block.pos);
  }
}

/**
 * The glowing guide line along a platform's path (render/rails.js), dimmer than its
 * edges so the platform itself stands out.
 * @param {Parameters<typeof railSegments>[0]} track
 * @param {number|string} color
 */
export function createRails(track, color) {
  return neonLines(railSegments(track), lineMaterial({ color, width: 1.5, brightness: 0.55 }));
}

/**
 * The enemy bodies (defs.json enemy "look", D78), by name: how to build,
 * color, animate and pop one (see BUG_MODEL in bug.js), how high its "!"
 * floats and where an arc leaves it. A model has its own flash uniforms
 * (`userData.flash`, holo.js) for spell hits and its charge glow.
 */
export const ENEMY_MODELS = {
  bug: BUG_MODEL,
  virus: VIRUS_MODEL,
  sentinel: SENTINEL_MODEL,
  cron: CRON_MODEL,
  worm: WORM_MODEL,
  crawler: CRAWLER_MODEL,
};

/** How fast its after-the-wizard look (faster bits, flaring eyes) comes and goes, per second. */
const ALERT_RATE = 6;

export class EnemyView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/enemy.js').Enemy} enemy
   */
  constructor(game, enemy) {
    this.game = game;
    this.enemy = enemy;
    const { look, color, attack, attackColor, attackRange } = enemy.data;
    this.kind = ENEMY_MODELS[look];
    if (!this.kind) throw new Error(`No enemy look "${look}" (ENEMY_MODELS)`);
    this.model = this.kind.create(color);
    this.pixels = createPixelBurst(this.kind.pop.pixels, this.kind.pop.pixelSize, [color, 0xffffff]);
    this.mood = null;
    /** The "!" over it while it has noticed the wizard (any enemy). */
    this.mark = createAlertMark();
    this.markHolder = new Group().add(this.mark);
    this.group = new Group().add(this.model, this.pixels, this.markHolder);
    /** Its discharge lightning (world space), if it has that attack. */
    this.discharge = enemy.discharges ? createDischarge({ color: attackColor, shape: attack, range: attackRange }) : null;
    if (this.discharge) this.group.add(this.discharge);
    /** Its own offset into the glitch rhythm of damaged enemies, so they don't glitch in step. */
    this.seed = game.enemies.indexOf(enemy);
    /** Angle the model faces now; it turns towards the enemy's facing. */
    this.angle = enemy.facing;
    /** Seconds, for the hop while standing. */
    this.time = 0;
    /** 0..1: how much it looks after the wizard (it sees him or searches for him). */
    this.alert = 0;
    /** The cage round it while Pause freezes it (D85), made on its first freeze. */
    this.cage = null;
  }

  /** The cage for a freeze, made on first use. */
  cageView() {
    if (!this.cage) {
      this.cage = createPauseCage(this.game.content.spells.pause.color);
      this.group.add(this.cage);
    }
    return this.cage;
  }

  /**
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(alpha, dt) {
    const { enemy, kind } = this;
    const pos = lerpPosition(enemy.prev, enemy.pos, alpha);
    const feet = [pos[0] + 0.5, pos[1], pos[2] + 0.5];
    if (enemy.state === 'dead') {
      this.model.visible = false;
      this.mark.visible = false;
      if (this.cage) this.cage.visible = false;
      if (this.discharge) this.discharge.visible = false;
      // Popped in a pit: the burst comes out at the floor. Once it is over
      // (hidden by an empty burst), there is nothing left to update.
      if (enemy.timer <= kind.pop.ticks) placePixels(this.pixels, kind.popPixels(enemy.timer + alpha), [feet[0], Math.max(feet[1], 0), feet[2]]);
      return;
    }

    // Frozen (D85): it holds its pose (its clock and turning stop), tinted, in a cage.
    const { frozen } = enemy;
    const pause = frozen ? pauseLook(frozen.tick + alpha, frozen.ticks) : null;
    if (pause) placePauseCage(this.cageView(), feet, pause);
    else if (this.cage) this.cage.visible = false;
    if (!frozen) {
      this.time += dt;
      this.angle = lerpAngle(this.angle, enemy.facing, Math.min(1, dt * kind.turnRate));
    }
    this.model.position.set(...feet);
    this.model.rotation.y = this.angle;
    const after = enemy.sees || enemy.behavior.chasing ? 1 : 0;
    this.alert += Math.sign(after - this.alert) * Math.min(Math.abs(after - this.alert), dt * ALERT_RATE);

    // Walked: the distance from the cell it left, for one hop per cell.
    const { from } = enemy;
    const walking = enemy.state === 'walk' && from;
    // A spell hit flashes and squashes it; while damaged it glitches now and then.
    const hit = enemyHitLook(enemy.hitTicks === null ? null : enemy.hitTicks + alpha);
    const glitch = enemy.damaged && hit.flash === 0 ? damagedGlitch(this.time * 60, this.seed) : { shift: 0, flash: 0 };
    const attack = enemy.attackTick === null ? null : enemy.attackTick + alpha;
    kind.animate(this.model, {
      state: walking || enemy.state === 'fall' ? enemy.state : 'rest',
      walked: walking ? Math.abs(pos[0] - from[0]) + Math.abs(pos[2] - from[2]) : 0,
      time: this.time,
      bounced: enemy.bounced === null ? null : enemy.bounced + alpha,
      squash: hit.squash,
      shift: glitch.shift,
      alert: this.alert,
      attack,
      charge: enemy.chargeTicks,
    });
    // Its flash: a hit (white, then cyan), a damaged glitch (cyan), or the
    // white glow of charging and discharging.
    const glow = chargeGlow(dischargeLook(attack, enemy.chargeTicks));
    const flash = this.model.userData.flash;
    const tint = pause?.on ? PAUSE_FX.tint * pause.grow : 0;
    flash.amount.value = Math.max(hit.flash, glitch.flash, glow, tint);
    const white = (hit.flash > 0 && hit.color === 'white') || glow > Math.max(hit.flash, glitch.flash);
    const tinted = tint > Math.max(hit.flash, glitch.flash, glow);
    flash.color.value.set(tinted ? this.game.content.spells.pause.color : white ? 0xffffff : PALETTE.cyan);

    this.markHolder.position.set(...feet);
    placeAlertMark(this.mark, enemy.alerted && !frozen ? 1 : 0, this.time, kind.markHeight);
    if (this.discharge) this.placeDischarge(feet, attack);

    const mood = eyeMood(enemy);
    if (mood !== this.mood) kind.setMood(this.model, (this.mood = mood));
  }

  /**
   * Its discharge: a burst from its eyes (Enemy.middle()); an arc along
   * its aim while charging, and to where it stopped once fired. The arc is
   * drawn on the very line it hits along (from its eyes, discharge() in combat.js),
   * starting its muzzle's reach out in front of it.
   * @param {number[]} feet
   * @param {number|null} attack ticks since the attack started
   */
  placeDischarge(feet, attack) {
    const { enemy, kind } = this;
    const eyes = [feet[0], feet[1] + ENEMY.eyeHeight, feet[2]];
    if (enemy.data.attack !== 'arc') {
      placeDischarge(this.discharge, attack, enemy.chargeTicks, eyes);
      return;
    }
    const target = attack !== null && attack >= enemy.chargeTicks ? enemy.boltEnd : enemy.aim?.end;
    if (!target || !enemy.aim) {
      placeDischarge(this.discharge, null, enemy.chargeTicks, eyes);
      return;
    }
    const { dir } = enemy.aim;
    const from = eyes.map((v, i) => v + dir[i] * kind.muzzle);
    placeDischarge(this.discharge, attack, enemy.chargeTicks, from, target);
  }
}
