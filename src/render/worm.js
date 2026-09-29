/**
 * The worm model (D83), malware that copies itself along, in the hologram
 * look (D22); defs.json "worm" patrols with a touch attack.
 *
 * A round head with two antennae and big frowning eyes, dragging a tail of
 * four shrinking balls. It inches along: a hump runs from head to tail once
 * per cell walked while the tail wiggles side to side. When it notices the
 * wizard (`alert`) it rears its head up and its antennae stand straight.
 * A patroller with a touch attack is the natural fit, but like every enemy
 * it can take any movement and attack (D78).
 *
 * The model stands on y = 0 around the y axis and looks along +z. The head
 * and the first ball fill the enemy hitbox (0.6); the tail trails behind it
 * (visual only).
 */
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const WORM = {
  head: { r: 0.17, z: 0.2 },
  /** Tail balls, head to tail: radius, and distance behind the one before. */
  tail: [
    [0.15, 0.2],
    [0.13, 0.18],
    [0.105, 0.16],
    [0.08, 0.13],
  ],
  /** The hump that runs down it: height, lag per ball (radians); the wiggle's width. */
  hump: { height: 0.07, lag: 1.1 },
  wiggle: { width: 0.06, lag: 0.9 },
  /** Humps per second while it stands. */
  idleRate: 0.5,
  /** Rearing up while alert: head lift and tilt back. */
  rear: { lift: 0.14, tilt: 0.35 },
  /** Eye brightness: calm, and flared while after the wizard (colors by mood: enemy-look.js). */
  eyeGlow: { calm: 2.2, alert: 4 },
  markHeight: 0.85,
  turnRate: 8,
  pop: { pixels: 28, pixelSize: 0.07, ticks: 36, spread: 0.8, rise: 0.6 },
};

const GEO = {
  head: shared(new SphereGeometry(WORM.head.r, 28, 14)),
  balls: WORM.tail.map(([r]) => shared(new SphereGeometry(r, 24, 12))),
  antenna: shared(new CylinderGeometry(0.012, 0.012, 1, 6)),
  knob: shared(new SphereGeometry(0.03, 10, 6)),
};

/**
 * A worm as a three.js group (origin at the feet center, looking along
 * +z). `userData.head` rears and bobs, `userData.balls` are the tail,
 * `userData.antennae` its two antennae, `userData.eyes` the eye material,
 * `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createWorm(color) {
  const flash = createFlash();
  const { r } = WORM.head;
  const head = new Group();
  head.add(holoPart(GEO.head, color, flash));

  // Big frowning eyes on the front of the head.
  const eyes = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    const x = side * 0.065;
    const y = 0.035;
    eye.position.set(x, y, Math.sqrt(r * r - x * x - y * y) - 0.004);
    eye.scale.set(0.045, 0.032, 0.015);
    eye.rotation.set(-0.2, side * 0.35, side * 0.45);
    head.add(eye);
  }

  // Two antennae with glowing knobs, leaning out and forward.
  const bright = new MeshBasicMaterial();
  bright.color.set(color).multiplyScalar(2.4);
  const antennae = [-1, 1].map((side) => {
    const antenna = new Group();
    const stalk = holoPart(GEO.antenna, color, flash);
    stalk.scale.y = 0.16;
    stalk.position.y = 0.08;
    const knob = new Mesh(GEO.knob, bright);
    knob.position.y = 0.16;
    antenna.add(stalk, knob);
    antenna.position.set(side * 0.07, r * 0.8, 0.02);
    antenna.userData.side = side;
    head.add(antenna);
    return antenna;
  });

  const balls = GEO.balls.map((geometry) => holoPart(geometry, color, flash));
  const body = new Group().add(head, ...balls);
  const group = new Group().add(body);
  Object.assign(group.userData, { body, head, balls, antennae, eyes, flash, glow: WORM.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * Where each part of it is at `phase` (radians of its hump), head first:
 * [x, y, z] of each ball's middle, before rearing.
 * @param {number} phase
 * @param {number} [size] 1 walking, less standing
 * @returns {number[][]}
 */
export function wormSpine(phase, size = 1) {
  const { head, tail, hump, wiggle } = WORM;
  const parts = [[0, head.r, head.z]];
  let z = head.z;
  tail.forEach(([r, gap], i) => {
    z -= gap;
    const k = i + 1;
    const lift = Math.max(0, Math.sin(phase - k * hump.lag)) * hump.height * size;
    // The wiggle grows towards the tail.
    const x = Math.sin(phase * 0.5 - k * wiggle.lag) * wiggle.width * (k / tail.length) * (0.4 + 0.6 * size);
    parts.push([x, r + lift, z]);
  });
  return parts;
}

/**
 * Pose it for this frame.
 * @param {Group} worm from createWorm()
 * @param {object} state
 * @param {string} [state.state] 'rest' | 'walk' | 'fall'
 * @param {number} [state.walked] cells walked (while walking)
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard
 * @param {number|null} [state.attack] ticks since its attack started, or null (any attack, D78)
 * @param {number} [state.charge] ticks that attack charges
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateWorm(worm, { state = 'rest', walked = 0, time = 0, alert = 0, attack = null, charge = 1, squash = 0, shift = 0 }) {
  // It trembles while it charges an attack.
  const look = dischargeLook(attack, charge);
  if (look.shake > 0) shift += look.shake * (hash(Math.floor(time * 30), 5) - 0.5) * 2;
  const { body, head, balls, antennae } = worm.userData;
  const walking = state === 'walk';
  const phase = walking ? walked * Math.PI * 2 : time * WORM.idleRate * Math.PI * 2;
  const spine = wormSpine(phase, walking ? 1 : 0.4);
  const fall = state === 'fall' ? 0.08 : 0;

  // The head bobs with the hump and rears up while alert.
  const { lift, tilt } = WORM.rear;
  const [hx, hy, hz] = spine[0];
  head.position.set(hx, hy + Math.max(0, Math.sin(phase)) * WORM.hump.height * 0.5 + lift * alert + fall, hz - lift * 0.3 * alert);
  head.rotation.x = -tilt * alert + Math.sin(phase) * 0.06;
  balls.forEach((ball, i) => {
    const [x, y, z] = spine[i + 1];
    // The first ball rises a little with a rearing head.
    ball.position.set(x, y + (i === 0 ? lift * 0.4 * alert : 0) + fall * (1 - i * 0.2), z);
  });

  // Antennae droop and sway while calm, stand straight up while alert.
  for (const antenna of antennae) {
    const side = antenna.userData.side;
    const sway = Math.sin(time * 3 + side) * 0.15 * (1 - alert);
    antenna.rotation.set(0.5 - 0.45 * alert + sway, 0, -side * (0.5 - 0.3 * alert));
  }

  body.position.x = shift;
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  glowEyes(worm, flaredGlow(WORM.eyeGlow, alert, look.charge));
}

/**
 * The pixels of it popping `tick` ticks after it died: a burst from along
 * its whole length.
 * @param {number} tick may be fractional
 * @returns {{ offset: number[], scale: number }[]}
 */
export function wormPopPixels(tick) {
  const { pixels, ticks, spread, rise } = WORM.pop;
  if (tick < 0 || tick >= ticks) return [];
  const t = tick / ticks;
  const spine = wormSpine(0, 0);
  const out = [];
  for (let i = 0; i < pixels; i++) {
    const [x, y, z] = spine[i % spine.length];
    const angle = hash(i, 51) * Math.PI * 2;
    const radius = (0.05 + hash(i, 52) * spread * 0.6) * Math.sqrt(t);
    const height = y + (hash(i, 53) - 0.3) * rise * t;
    out.push({ offset: [x + Math.cos(angle) * radius, height, z + Math.sin(angle) * radius], scale: 1 - t });
  }
  return out;
}

/** Everything EnemyView needs to show a worm (see BUG_MODEL in bug.js). */
export const WORM_MODEL = {
  create: createWorm,
  setMood,
  animate: animateWorm,
  popPixels: wormPopPixels,
  pop: WORM.pop,
  turnRate: WORM.turnRate,
  markHeight: WORM.markHeight,
  muzzle: WORM.head.z + WORM.head.r,
};
