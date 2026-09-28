/**
 * The ranged enemy's model in the hologram look (D22), working name
 * "sentinel" (Phase 3 step 5): it keeps its distance and fires a long
 * electric bolt at the wizard (the `arc` discharge, discharge.js).
 *
 * A tall, sharp octahedron standing on its point, a single visor eye
 * across its front ridge, and three shards circling its waist. It floats
 * and bobs like a virus but stays upright and steady: while it is after the
 * wizard (`alert` 0..1) the shards circle faster and its eye flares; while
 * it charges the shards swing to the front and spin round the line of fire
 * like a barrel; when it fires it recoils. (The white glow and the "!" are
 * every enemy's, render/entity-view.js.)
 *
 * The model stands on y = 0 around the y axis and looks along +z; it is
 * taller than the enemy hitbox (0.6), for a silhouette unlike the bug's
 * and the virus's.
 */
import { Group, Mesh, MeshBasicMaterial, OctahedronGeometry, TetrahedronGeometry } from 'three';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, popBurst, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, sharpGeometry, sharpPart } from './holo.js';

/** Proportions (world units) and animation tuning. */
export const SENTINEL = {
  hover: 0.12,
  bob: { height: 0.035, rate: 0.9 },
  /** The octahedron: radius, stretched `tall` times upright, middle above the floor. */
  r: 0.23,
  tall: 2,
  y: 0.48,
  /** Shards: how many, size, circle radius, turns per second (calm, chasing). */
  shards: { count: 3, size: 0.09, orbit: 0.38, speed: [1, 2.6] },
  /** While charging the shards gather in front, round the line of fire. */
  barrel: { z: 0.34, radius: 0.1, spin: 14 },
  /** Recoil when it fires: how far back, over how many ticks. */
  recoil: { distance: 0.08, ticks: 10 },
  /** Eye brightness: calm, and flared while chasing (colors by mood: enemy-look.js). */
  eyeGlow: { calm: 2.4, alert: 4.5 },
  markHeight: 1.2,
  turnRate: 6,
  pop: { pixels: 32, pixelSize: 0.07, ticks: 36, spread: 0.9, rise: 0.8 },
};

/** Where its visor eye is, from its feet center, looking along +z (its arc starts this far in front). */
export const SENTINEL_EYE = [0, SENTINEL.hover + SENTINEL.y, (SENTINEL.r / Math.SQRT2) + 0.01];

const GEO = {
  body: sharpGeometry(new OctahedronGeometry(SENTINEL.r)),
  shard: sharpGeometry(new TetrahedronGeometry(SENTINEL.shards.size)),
};

/**
 * The ranged enemy as a three.js group (origin at the feet center, looking
 * along +z). `userData.body` floats and recoils, `userData.shards` circle
 * it, `userData.eyes` is the eye material, `userData.flash` its flash
 * uniforms (holo.js).
 * @param {number|string} color
 */
export function createSentinel(color) {
  const flash = createFlash();
  const body = new Group();

  // Turned an eighth, so its front is a ridge across its waist.
  const core = sharpPart(GEO.body, color, flash);
  core.position.y = SENTINEL.y;
  core.rotation.y = Math.PI / 4;
  core.scale.y = SENTINEL.tall;
  body.add(core);

  const shards = Array.from({ length: SENTINEL.shards.count }, (_, i) => {
    const shard = sharpPart(GEO.shard, color, flash);
    shard.userData.seed = i;
    body.add(shard);
    return shard;
  });

  // One visor eye across the front ridge, bright for bloom.
  const eyes = new MeshBasicMaterial();
  const visor = new Mesh(EYE, eyes);
  visor.position.set(0, SENTINEL.y, SENTINEL_EYE[2] - 0.005);
  visor.scale.set(0.11, 0.028, 0.02);
  body.add(visor);

  const group = new Group().add(body);
  Object.assign(group.userData, { body, shards, eyes, flash, glow: SENTINEL.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/** Smooth 0..1 ease. */
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Pose it for this frame.
 * @param {Group} sentinel from createSentinel()
 * @param {object} state
 * @param {string} [state.state] 'rest' | 'walk' | 'fall'
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard
 * @param {number|null} [state.attack] ticks since its attack started, or null
 * @param {number} [state.charge] ticks its attack charges
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateSentinel(sentinel, { state = 'rest', time = 0, alert = 0, attack = null, charge = 42, squash = 0, shift = 0 }) {
  const { body, shards } = sentinel.userData;
  const look = dischargeLook(attack, charge);
  const bob = Math.sin(time * Math.PI * 2 * SENTINEL.bob.rate) * SENTINEL.bob.height;
  // Recoil: thrown back when it fires, settling over recoil.ticks.
  const since = attack === null ? Infinity : attack - charge;
  const recoil = since >= 0 && since < SENTINEL.recoil.ticks ? SENTINEL.recoil.distance * (1 - since / SENTINEL.recoil.ticks) : 0;
  // A faint tremble only in the last third of the charge: it holds steady to aim.
  const tremble = look.charge > 0.66 && !look.discharging ? 0.008 : 0;
  const jolt = Math.floor(time * 30);
  body.position.set(
    shift + tremble * (hash(jolt, 1) - 0.5) * 2,
    (state === 'fall' ? SENTINEL.hover * 0.3 : SENTINEL.hover + bob) + tremble * (hash(jolt, 2) - 0.5) * 2,
    -recoil,
  );
  body.rotation.x = state === 'walk' && attack === null ? 0.15 : 0;
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);

  // Shards circle its waist, then swing to the front and spin round the
  // line of fire while it charges; they fly back out when it fires.
  const { count, orbit, speed } = SENTINEL.shards;
  const { barrel } = SENTINEL;
  const gather = look.discharging ? 1 - ease(Math.min(1, (attack - charge) / 8)) : ease(look.charge);
  const turn = speed[0] + (speed[1] - speed[0]) * alert;
  for (const shard of shards) {
    const i = shard.userData.seed;
    const angle = time * turn + (i * Math.PI * 2) / count;
    const circle = [Math.cos(angle) * orbit, SENTINEL.y + Math.sin(angle * 2 + i) * 0.05, Math.sin(angle) * orbit];
    const around = time * barrel.spin + (i * Math.PI * 2) / count;
    const front = [Math.cos(around) * barrel.radius, SENTINEL.y + Math.sin(around) * barrel.radius, barrel.z];
    shard.position.set(...circle.map((c, k) => c + (front[k] - c) * gather));
    // Circling: pointing out; gathered: pointing forward along the line of fire.
    shard.rotation.set(gather * -Math.PI / 2, -angle * (1 - gather), around * gather);
  }

  glowEyes(sentinel, flaredGlow(SENTINEL.eyeGlow, alert, look.charge));
}

/**
 * The pixels of it popping `tick` ticks after it died (enemy-look.js
 * popBurst()), starting spread over its tall body.
 */
export const sentinelPopPixels = popBurst(SENTINEL.pop, { seed: 21, middle: SENTINEL.hover + SENTINEL.y, start: 0.1, scatter: 0.6 });

/** Everything EnemyView needs to show a sentinel (see BUG_MODEL in bug.js). */
export const SENTINEL_MODEL = {
  create: createSentinel,
  setMood,
  animate: animateSentinel,
  popPixels: sentinelPopPixels,
  pop: SENTINEL.pop,
  turnRate: SENTINEL.turnRate,
  markHeight: SENTINEL.markHeight,
  /** How far in front of its eyes an arc leaves it (along the line of fire): its visor. */
  muzzle: SENTINEL_EYE[2],
};
