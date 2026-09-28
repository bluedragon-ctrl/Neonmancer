/**
 * The virus model in the hologram look (D22): a chasing enemy that attacks
 * with a close-range electric discharge instead of by touch (Phase 3
 * step 5; the lightning itself is discharge.js).
 *
 * A sharp-edged cube tipped onto an edge (a diamond seen from the front),
 * slanted eyes on its front face, and small cubes of itself orbiting and
 * jumping out of line. Unlike the hopping bug, a virus
 * glides: it floats a little above its cell, bobbing, and leans into
 * where it goes. While it chases (`alert` 0..1) its bits orbit faster and
 * wider and its eyes flare. While it charges it shakes, squares up and
 * pulls its bits in tight (the white glow and the "!" are every enemy's,
 * render/entity-view.js).
 *
 * The model stands on y = 0 around the y axis and looks along +z, about
 * as big as the enemy hitbox (0.6).
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, popBurst, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, sharpGeometry, sharpPart } from './holo.js';

/** Proportions (world units) and animation tuning. */
export const VIRUS = {
  /** Float height above the cell floor, and the bob on top of it. */
  hover: 0.1,
  bob: { height: 0.04, rate: 1.4 },
  /** Height of the cube's middle above the floor (before hovering). */
  y: 0.3,
  /** Cube edge. */
  size: 0.34,
  /** Lean forward while moving (radians). */
  lean: 0.25,
  /** Orbiting bits: how many, edge, orbit radius, turns per second (calm, chasing). */
  bits: { count: 4, size: 0.08, orbit: 0.33, speed: [1.5, 3.5] },
  /** Eye brightness: calm, and flared while chasing (colors by mood: enemy-look.js). */
  eyeGlow: { calm: 2.2, alert: 4 },
  /** Height of the "!" above its feet. */
  markHeight: 0.95,
  turnRate: 10,
  pop: { pixels: 28, pixelSize: 0.07, ticks: 36, spread: 0.9, rise: 0.7 },
};

/** Geometry shared by every virus (never disposed with a room). */
const GEO = {
  cube: sharpGeometry(new BoxGeometry(VIRUS.size, VIRUS.size, VIRUS.size)),
  bit: sharpGeometry(new BoxGeometry(VIRUS.bits.size, VIRUS.bits.size, VIRUS.bits.size)),
};

/**
 * A virus as a three.js group (origin at the feet center, looking along
 * +z). `userData.body` floats, leans and shakes, `userData.cube` is the
 * tipped cube, `userData.bits` the orbiting bits, `userData.eyes` the eye
 * material, `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createVirus(color) {
  const flash = createFlash();
  const body = new Group();
  body.position.y = VIRUS.hover;

  // Tipped onto an edge: a diamond from the front, a corner up and down.
  const cube = sharpPart(GEO.cube, color, flash);
  cube.position.y = VIRUS.y;
  cube.rotation.z = Math.PI / 4;
  body.add(cube);

  const orbiting = Array.from({ length: VIRUS.bits.count }, (_, i) => {
    const bit = sharpPart(GEO.bit, color, flash);
    bit.userData.seed = i;
    body.add(bit);
    return bit;
  });

  // Slanted eyes on the front face, bright (above 1, for bloom).
  const eyes = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    eye.position.set(side * 0.065, VIRUS.y + 0.025, VIRUS.size / 2 + 0.005);
    eye.scale.set(0.055, 0.03, 0.015);
    eye.rotation.z = side * 0.5;
    body.add(eye);
  }

  const group = new Group().add(body);
  Object.assign(group.userData, { body, cube, bits: orbiting, eyes, flash, glow: VIRUS.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * Pose a virus for this frame.
 * @param {Group} virus from createVirus()
 * @param {object} state
 * @param {string} [state.state] 'rest' | 'walk' | 'fall'
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard (bits, eyes)
 * @param {number|null} [state.attack] ticks since its attack started, or null
 * @param {number} [state.charge] ticks its attack charges
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateVirus(virus, { state = 'rest', time = 0, alert = 0, attack = null, charge = 24, squash = 0, shift = 0 }) {
  const { body, cube, bits } = virus.userData;
  const look = dischargeLook(attack, charge);
  const bob = Math.sin(time * Math.PI * 2 * VIRUS.bob.rate) * VIRUS.bob.height;
  // Shaking while it charges: a new offset every other frame.
  const jolt = Math.floor(time * 30);
  const sx = look.shake * (hash(jolt, 1) - 0.5) * 2;
  const sy = look.shake * (hash(jolt, 2) - 0.5) * 2;
  body.position.set(shift + sx, (state === 'fall' ? VIRUS.hover * 0.3 : VIRUS.hover + bob) + sy, 0);
  body.rotation.x = state === 'walk' && attack === null ? VIRUS.lean * (0.6 + 0.4 * alert) : 0;
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  // A slow wobble of the diamond; it squares up to the front while charging.
  cube.rotation.set(0, Math.sin(time * 1.3) * 0.25 * (1 - look.charge), Math.PI / 4);

  // Bits orbit, wider and faster while chasing, pulled in tight while
  // charging; now and then one jumps out of line.
  const { count, orbit, speed } = VIRUS.bits;
  const turn = speed[0] + (speed[1] - speed[0]) * alert + look.charge * 6;
  for (const bit of bits) {
    const i = bit.userData.seed;
    const angle = time * turn + (i * Math.PI * 2) / count;
    const tick = Math.floor(time * 8 + i * 3);
    const out = hash(tick, i) > 0.85 ? (hash(tick, i + 7) - 0.5) * 0.18 : 0;
    const radius = orbit * (1 + 0.2 * alert) * (1 - 0.45 * look.charge);
    bit.position.set(Math.cos(angle) * radius + out, VIRUS.y + Math.sin(angle * 2 + i) * 0.12 * (1 - look.charge), Math.sin(angle) * radius);
    bit.rotation.set(angle, angle * 1.3, 0);
  }

  // Eyes flare while chasing and while charging.
  glowEyes(virus, flaredGlow(VIRUS.eyeGlow, alert, look.charge));
}

/** The middle of a virus above its feet: where its discharge comes from. */
export const VIRUS_MIDDLE = VIRUS.hover + VIRUS.y;

/** The pixels of a popping virus `tick` ticks after it died (enemy-look.js popBurst()). */
export const virusPopPixels = popBurst(VIRUS.pop, { seed: 11, middle: VIRUS_MIDDLE });

/** Everything EnemyView needs to show a virus (see BUG_MODEL in bug.js). */
export const VIRUS_MODEL = {
  create: createVirus,
  setMood,
  animate: animateVirus,
  popPixels: virusPopPixels,
  pop: VIRUS.pop,
  turnRate: VIRUS.turnRate,
  markHeight: VIRUS.markHeight,
  /** How far in front of its eyes an arc leaves it (along the line of fire). */
  muzzle: VIRUS.size / 2,
};
