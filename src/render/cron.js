/**
 * The cron model (D83), a scheduled job, in the hologram look (D22): the
 * look of the stationary tower (defs.json "tower": `attack: "bolt"`,
 * `boltPattern: "cross"`, D81).
 *
 * A squat hex pedestal with two eyes and a small bell on top, and a clock
 * dial floating round it at eye height: a ring with four emitters on the
 * grid axes and one hand sweeping round. The four bolts of a cross leave
 * from those emitters, so the dial never turns with the enemy: it holds
 * the grid while the pedestal turns to watch the wizard. While it is
 * after him (`alert`) the hand sweeps faster; while it charges the hand
 * whirls two full turns, the emitters glow up and push out, and the
 * pedestal trembles; when it fires the dial slams down and springs back.
 *
 * The model stands on y = 0 around the y axis and looks along +z, about as
 * wide as the enemy hitbox (0.6).
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from 'three';
import { BOLT } from '../entities/bolt.js';
import { ENEMY } from '../entities/enemy.js';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, popBurst, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const CRON = {
  /** The pedestal: top and bottom radius, height. */
  pedestal: [0.22, 0.28, 0.26],
  /** The dial round it at the bolts' height (the enemy's eyes, Bolt.shoot()). */
  dial: { r: 0.29, tube: 0.022, y: ENEMY.eyeHeight },
  /** The bell on top: radius, height, its middle above the floor. */
  bell: [0.1, 0.16, 0.56],
  bob: { height: 0.015, rate: 0.8 },
  /** Hand sweeps per second (calm, after the wizard); whole turns it whirls while charging. */
  sweep: [0.2, 0.5],
  whirl: 2,
  /** How far the emitters push out at full charge. */
  push: 0.04,
  /** The dial slams down this far when it fires, springing back over `ticks`. */
  slam: { distance: 0.08, ticks: 16 },
  /** Emitter brightness: calm, fully charged, firing. */
  emitterGlow: [1.4, 4, 6],
  /** Eye brightness: calm, and flared while after the wizard (colors by mood: enemy-look.js). */
  eyeGlow: { calm: 2.2, alert: 4 },
  markHeight: 1,
  turnRate: 4,
  pop: { pixels: 30, pixelSize: 0.07, ticks: 36, spread: 0.9, rise: 0.8 },
};

/** The grid axes the emitters sit on (the cross pattern's, entities/bolt.js). */
const AXES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

const [TOP, BOTTOM, HEIGHT] = CRON.pedestal;

const GEO = {
  // Six sides with a flat face to the front (+z).
  pedestal: sharpGeometry(new CylinderGeometry(TOP, BOTTOM, HEIGHT, 6, 1, false, Math.PI / 6)),
  bell: sharpGeometry(new ConeGeometry(CRON.bell[0], CRON.bell[1], 8)),
  ring: shared(new TorusGeometry(CRON.dial.r, CRON.dial.tube, 8, 40)),
  emitter: sharpGeometry(new ConeGeometry(0.05, 0.1, 4)),
  hub: shared(new SphereGeometry(0.045, 16, 8)),
  post: shared(new CylinderGeometry(0.022, 0.022, 1, 8)),
  hand: sharpGeometry(new BoxGeometry(0.03, 0.025, CRON.dial.r - 0.06)),
  tip: shared(new BoxGeometry(0.04, 0.04, 0.04)),
};

/**
 * A cron as a three.js group (origin at the feet center, looking along +z).
 * `userData.body` is the pedestal and bell, `userData.dial` floats round
 * it holding the grid, `userData.hand` sweeps round the dial,
 * `userData.emitters` are its four emitters, `userData.eyes` the eye
 * material, `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createCron(color) {
  const flash = createFlash();
  const body = new Group();
  const pedestal = sharpPart(GEO.pedestal, color, flash);
  pedestal.position.y = HEIGHT / 2;
  const bell = sharpPart(GEO.bell, color, flash);
  bell.position.y = CRON.bell[2];
  bell.rotation.y = Math.PI / 8;
  // A post from the pedestal up to the bell, through the dial's hub.
  const post = holoPart(GEO.post, color, flash);
  const bellBottom = CRON.bell[2] - CRON.bell[1] / 2;
  post.position.y = (HEIGHT + bellBottom) / 2;
  post.scale.y = bellBottom - HEIGHT + 0.02;
  body.add(pedestal, post, bell);

  // Eyes on the pedestal's front face, frowning.
  const eyes = new MeshBasicMaterial();
  const front = (Math.cos(Math.PI / 6) * (TOP + BOTTOM)) / 2;
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    eye.position.set(side * 0.07, HEIGHT * 0.55, front + 0.004);
    eye.scale.set(0.05, 0.03, 0.012);
    eye.rotation.set(-0.15, 0, side * 0.45);
    body.add(eye);
  }

  // The dial: ring, four emitters, the hand round a hub on the post.
  const dial = new Group();
  const ring = holoPart(GEO.ring, color, flash);
  ring.rotation.x = Math.PI / 2;
  dial.add(ring);
  const bright = new MeshBasicMaterial();
  const emitters = AXES.map((angle) => {
    const holder = new Group();
    holder.rotation.y = angle;
    const emitter = sharpPart(GEO.emitter, color, flash);
    // A four-sided cone pointing out along the axis.
    emitter.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    // A glowing spark at its point.
    const spark = new Mesh(GEO.tip, bright);
    spark.position.z = 0.055;
    spark.rotation.set(Math.PI / 4, 0, Math.PI / 4);
    const tip = new Group().add(emitter, spark);
    holder.add(tip);
    dial.add(holder);
    return tip;
  });
  const hand = new Group();
  const arm = sharpPart(GEO.hand, color, flash);
  arm.position.z = (CRON.dial.r - 0.06) / 2;
  hand.add(arm);
  const hub = holoPart(GEO.hub, color, flash);
  dial.add(hub, hand);

  const group = new Group().add(body, dial);
  Object.assign(group.userData, { body, dial, hand, emitters, bright, color, eyes, flash, glow: CRON.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * The hand's angle (radians, clockwise seen from above) at `time`: a slow
 * sweep, faster while after the wizard, plus two whole turns over a
 * charge (so it lands where it would have been once the charge ends).
 * @param {number} time seconds
 * @param {number} alert 0..1
 * @param {number} charge 0..1 through its attack's charge
 */
export function cronHand(time, alert, charge) {
  const [calm, after] = CRON.sweep;
  return -(time * (calm + (after - calm) * alert) + charge * charge * CRON.whirl) * Math.PI * 2;
}

/**
 * Pose it for this frame.
 * @param {Group} cron from createCron()
 * @param {object} state
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard
 * @param {number|null} [state.attack] ticks since its attack started, or null
 * @param {number} [state.charge] ticks its attack charges
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateCron(cron, { time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { body, dial, hand, emitters, bright, color } = cron.userData;
  const look = dischargeLook(attack, charge);
  const jolt = Math.floor(time * 30);
  body.position.set(shift + look.shake * (hash(jolt, 1) - 0.5) * 2, 0, look.shake * (hash(jolt, 2) - 0.5) * 2);
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);

  // The dial holds the grid whichever way the model faces: the bolts of a
  // cross fly along the grid axes, out of its emitters.
  const since = attack === null ? Infinity : attack - charge;
  const t = since >= 0 && since < CRON.slam.ticks ? since / CRON.slam.ticks : 1;
  const drop = t >= 1 ? 0 : CRON.slam.distance * Math.cos(t * Math.PI * 1.5) * (1 - t);
  const bob = Math.sin(time * Math.PI * 2 * CRON.bob.rate) * CRON.bob.height;
  dial.position.set(shift, CRON.dial.y + bob - drop, 0);
  dial.rotation.y = -cron.rotation.y;
  hand.rotation.y = cronHand(time, alert, look.charge);

  // Emitters glow up and push out while charging, flare as they fire.
  const [calm, full, firing] = CRON.emitterGlow;
  for (const tip of emitters) tip.position.z = CRON.dial.r + 0.03 + CRON.push * (look.discharging ? 1 - t : look.charge);
  bright.color.set(color).multiplyScalar(look.discharging ? firing : calm + (full - calm) * look.charge);
  glowEyes(cron, flaredGlow(CRON.eyeGlow, alert, look.charge));
}

/** The pixels of it popping `tick` ticks after it died (enemy-look.js popBurst()). */
export const cronPopPixels = popBurst(CRON.pop, { seed: 41, middle: CRON.dial.y, scatter: 0.4 });

/** Everything EnemyView needs to show a cron (see BUG_MODEL in bug.js). */
export const CRON_MODEL = {
  create: createCron,
  setMood,
  animate: animateCron,
  popPixels: cronPopPixels,
  pop: CRON.pop,
  turnRate: CRON.turnRate,
  markHeight: CRON.markHeight,
  /** How far in front of its eyes an arc leaves it: its emitters (a bolt starts BOLT.reach out). */
  muzzle: Math.min(BOLT.reach, CRON.dial.r + 0.08),
};
