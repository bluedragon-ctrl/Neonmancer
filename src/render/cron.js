/**
 * Proposed static enemy, working name "cron" (a scheduled job), in the
 * hologram look (D22). Shown in the asset showcase for review; not in the
 * game yet.
 *
 * A squat hex pedestal with two eyes, and a clock dial floating above it:
 * a ring with four ticks and one hand sweeping round it. It never moves
 * and never aims: every time the hand comes round (`cycle` 0..1 through
 * its period) it sends an electric ring along the floor round itself
 * (createCronPulse()), so the wizard times his way past. In the last part
 * of the cycle the dial glows up and the pedestal trembles; when it fires
 * the dial slams down and springs back.
 *
 * The model stands on y = 0 around the y axis and looks along +z, about
 * as wide as the enemy hitbox (0.6).
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from 'three';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { lineMaterial, neonLines, shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const CRON = {
  /** The pedestal: top and bottom radius, height. */
  pedestal: [0.24, 0.3, 0.28],
  /** The dial: ring radius and tube, its height above the floor, and its bob. */
  dial: { r: 0.28, tube: 0.022, y: 0.55 },
  bob: { height: 0.02, rate: 0.8 },
  /** Last share of the cycle in which it warns (glows, trembles). */
  warn: 0.25,
  /** The dial slams down this far when it fires, springing back over `ticks`. */
  slam: { distance: 0.12, ticks: 18 },
  /** The pulse: seconds it takes to reach its range, jagged variants. */
  pulse: { seconds: 0.5, points: 40, jitter: 0.05, variants: 3 },
  moods: { hostile: 0xff2a3a, provoked: 0xffb020, peaceful: 0x00f0ff },
  eyeGlow: { calm: 2.2, alert: 4 },
  markHeight: 1,
  turnRate: 4,
  pop: { pixels: 30, pixelSize: 0.07, ticks: 36, spread: 0.9, rise: 0.8 },
};

const [TOP, BOTTOM, HEIGHT] = CRON.pedestal;

const GEO = {
  // Six sides with a flat face to the front (+z).
  pedestal: sharpGeometry(new CylinderGeometry(TOP, BOTTOM, HEIGHT, 6, 1, false, Math.PI / 6)),
  ring: shared(new TorusGeometry(CRON.dial.r, CRON.dial.tube, 8, 40)),
  tick: sharpGeometry(new BoxGeometry(0.05, 0.05, 0.08)),
  spindle: shared(new CylinderGeometry(0.025, 0.025, 1, 8)),
  hub: shared(new SphereGeometry(0.05, 16, 8)),
  hand: sharpGeometry(new BoxGeometry(0.035, 0.03, CRON.dial.r - 0.05)),
  tip: shared(new BoxGeometry(0.05, 0.05, 0.05)),
  eye: shared(new SphereGeometry(1, 12, 8)),
};

/**
 * A cron as a three.js group (origin at the feet center, looking along +z).
 * `userData.dial` floats above the pedestal, `userData.hand` sweeps round
 * it, `userData.body` is the pedestal, `userData.eyes` the eye material,
 * `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createCron(color) {
  const flash = createFlash();
  const body = sharpPart(GEO.pedestal, color, flash);
  body.position.y = HEIGHT / 2;

  // Eyes on the front face, frowning.
  const eyes = new MeshBasicMaterial();
  const front = Math.cos(Math.PI / 6) * (TOP + BOTTOM) / 2;
  for (const side of [-1, 1]) {
    const eye = new Mesh(GEO.eye, eyes);
    eye.position.set(side * 0.075, 0.02, front + 0.004);
    eye.scale.set(0.055, 0.032, 0.012);
    eye.rotation.set(-0.15, 0, side * 0.45);
    body.add(eye);
  }

  const spindle = holoPart(GEO.spindle, color, flash);
  const dial = new Group();
  const ring = holoPart(GEO.ring, color, flash);
  ring.rotation.x = Math.PI / 2;
  dial.add(ring, holoPart(GEO.hub, color, flash));
  for (let i = 0; i < 4; i++) {
    const tick = sharpPart(GEO.tick, color, flash);
    const angle = (i * Math.PI) / 2;
    tick.position.set(Math.sin(angle) * CRON.dial.r, 0, Math.cos(angle) * CRON.dial.r);
    tick.rotation.y = angle;
    dial.add(tick);
  }

  // The hand points out from the hub; its tip glows.
  const bright = new MeshBasicMaterial();
  const hand = new Group();
  const arm = sharpPart(GEO.hand, color, flash);
  arm.position.z = (CRON.dial.r - 0.05) / 2;
  const tip = new Mesh(GEO.tip, bright);
  tip.position.z = CRON.dial.r - 0.03;
  tip.rotation.y = Math.PI / 4;
  hand.add(arm, tip);
  dial.add(hand);

  const group = new Group().add(body, spindle, dial);
  Object.assign(group.userData, { body, spindle, dial, ring, hand, bright, color, eyes, flash, mood: 'hostile' });
  setCronMood(group, 'hostile');
  return group;
}

/**
 * @param {Group} cron from createCron()
 * @param {'hostile'|'provoked'|'peaceful'} mood
 */
export function setCronMood(cron, mood) {
  cron.userData.mood = mood;
  cron.userData.eyes.color.set(CRON.moods[mood]).multiplyScalar(CRON.eyeGlow.calm);
}

/**
 * How much it warns at `cycle` 0..1: 0 until the last `warn` share of it,
 * then rising to 1 as the hand comes round.
 * @param {number} cycle
 */
export function cronWarning(cycle) {
  const c = ((cycle % 1) + 1) % 1;
  return Math.max(0, (c - (1 - CRON.warn)) / CRON.warn);
}

/**
 * Pose it for this frame.
 * @param {Group} cron from createCron()
 * @param {object} state
 * @param {number} [state.time] seconds
 * @param {number} [state.cycle] 0..1 through its period; it fires as it wraps to 0
 * @param {number} [state.since] ticks since it last fired (the slam), or null
 * @param {number} [state.alert] 0..1 (its eyes)
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateCron(cron, { time = 0, cycle = 0, since = null, alert = 0, squash = 0, shift = 0 }) {
  const { body, spindle, dial, hand, bright, color, eyes } = cron.userData;
  const warn = cronWarning(cycle);
  const jolt = Math.floor(time * 30);
  const tremble = warn * warn * 0.02;
  const sx = shift + tremble * (hash(jolt, 1) - 0.5) * 2;
  body.position.x = sx;
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);

  // The dial bobs, slams down when it fires and springs back.
  const { slam } = CRON;
  const t = since === null || since < 0 || since >= slam.ticks ? 1 : since / slam.ticks;
  const drop = t >= 1 ? 0 : slam.distance * Math.cos(t * Math.PI * 1.5) * (1 - t);
  const bob = Math.sin(time * Math.PI * 2 * CRON.bob.rate) * CRON.bob.height;
  dial.position.set(sx, CRON.dial.y + bob - drop, 0);
  dial.rotation.y = Math.sin(time * 0.7) * 0.1;
  // Clockwise seen from above, from the front.
  hand.rotation.y = -cycle * Math.PI * 2;

  const bottom = HEIGHT * (1 - squash);
  const top = dial.position.y;
  spindle.position.set(sx, (bottom + top) / 2, 0);
  spindle.scale.set(1, Math.max(0.001, top - bottom), 1);

  bright.color.set(color).multiplyScalar(1.6 + warn * 3);
  const glow = CRON.eyeGlow.calm + (CRON.eyeGlow.alert - CRON.eyeGlow.calm) * Math.max(alert, warn);
  eyes.color.set(CRON.moods[cron.userData.mood]).multiplyScalar(glow);
}

/**
 * One jagged ring of radius 1 in the xz plane, as segments.
 * @param {number} variant
 */
function ringSegments(variant) {
  const { points, jitter } = CRON.pulse;
  const ring = Array.from({ length: points }, (_, k) => {
    const angle = (k / points) * Math.PI * 2;
    const r = 1 + (hash(k, variant + 40) - 0.5) * 2 * jitter;
    return [Math.cos(angle) * r, (hash(k, variant + 50) - 0.5) * jitter, Math.sin(angle) * r];
  });
  return ring.map((p, k) => [p, ring[(k + 1) % points]]);
}

/**
 * The electric ring a cron sends along the floor (placeCronPulse()): a
 * double line like the discharge (the color outside, white inside),
 * swapping jagged variants to flicker.
 * @param {number|string} color
 */
export function createCronPulse(color) {
  const outer = lineMaterial({ color, width: 5, brightness: 3 });
  const inner = lineMaterial({ color: 0xffffff, width: 1.6, brightness: 1.6 });
  const variants = Array.from({ length: CRON.pulse.variants }, (_, v) => {
    const segments = ringSegments(v);
    const lines = new Group().add(neonLines(segments, outer), neonLines(segments, inner));
    lines.visible = false;
    return lines;
  });
  const pulse = new Group().add(...variants);
  Object.assign(pulse.userData, { variants, outer, inner, colors: [outer.color.clone(), inner.color.clone()] });
  pulse.visible = false;
  return pulse;
}

/**
 * Show a pulse `seconds` after it fired (null: none), spreading to `range`
 * and fading as it goes.
 * @param {Group} pulse from createCronPulse()
 * @param {number|null} seconds
 * @param {number} range units
 */
export function placeCronPulse(pulse, seconds, range) {
  const t = seconds === null ? 1 : seconds / CRON.pulse.seconds;
  pulse.visible = t >= 0 && t < 1;
  if (!pulse.visible) return;
  const { variants, outer, inner, colors } = pulse.userData;
  const r = Math.max(0.05, range * (1 - (1 - t) ** 2));
  pulse.scale.set(r, 1, r);
  pulse.position.y = 0.06;
  const variant = Math.floor(seconds * 30) % variants.length;
  variants.forEach((lines, v) => (lines.visible = v === variant));
  const fade = 1 - t ** 3;
  outer.color.copy(colors[0]).multiplyScalar(fade);
  inner.color.copy(colors[1]).multiplyScalar(fade);
}

/**
 * The pixels of it popping `tick` ticks after it died.
 * @param {number} tick may be fractional
 * @returns {{ offset: number[], scale: number }[]}
 */
export function cronPopPixels(tick) {
  const { pixels, ticks, spread, rise } = CRON.pop;
  if (tick < 0 || tick >= ticks) return [];
  const t = tick / ticks;
  const out = [];
  for (let i = 0; i < pixels; i++) {
    const angle = hash(i, 41) * Math.PI * 2;
    const radius = (0.15 + hash(i, 42) * spread) * Math.sqrt(t);
    const height = 0.1 + hash(i, 43) * CRON.dial.y + (hash(i, 44) - 0.3) * rise * t;
    out.push({ offset: [Math.cos(angle) * radius, height, Math.sin(angle) * radius], scale: 1 - t });
  }
  return out;
}

/** Everything EnemyView needs to show a cron (see BUG_MODEL in bug.js). */
export const CRON_MODEL = {
  create: createCron,
  setMood: setCronMood,
  animate: animateCron,
  popPixels: cronPopPixels,
  pop: CRON.pop,
  turnRate: CRON.turnRate,
  markHeight: CRON.markHeight,
  muzzle: [0, 0.06, 0],
};
