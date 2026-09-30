/**
 * The bug model in the hologram look (D22, D48): a plain ball with two
 * slanted eyes whose color shows its mood (red: hostile, amber: calm until
 * provoked, cyan: peaceful), hopping from cell to cell with squash and
 * stretch; it squashes when the wizard bounces off it. Pure pose
 * functions are tested.
 *
 * The model stands on y = 0 around the y axis and looks along +z. The ball
 * is as big as the hitbox (0.6); the hop lifts it only for show.
 */
import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { dischargeLook } from './discharge.js';
import { EYE, eyeMood, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const BUG = {
  r: 0.3,
  /** Eyes: offset from the middle, height, size of the flattened spheres, frown slant (radians). */
  eyes: { x: 0.1, y: 0.36, size: [0.06, 0.04, 0.03], slant: 0.45 },
  /** Eye brightness (colors by mood: enemy-look.js). */
  eyeGlow: 2.2,
  /** Squash when the wizard bounces off it: ticks and depth. */
  bounceSquash: { ticks: 14, depth: 0.35 },
  /** One hop per cell: in the air for the first `air` of it, then squashed on landing. */
  hop: { height: 0.14, air: 0.7, squash: 0.18, stretch: 0.08 },
  /** Hops per second while standing (smaller ones). */
  idleRate: 1.6,
  idleLift: 0.4,
  /** Turning speed towards where it walks, per second. */
  turnRate: 14,
  /** The body it derezzes from when it dies (derez-fx.js, D126); square, as it turns. */
  derez: { size: [0.5, 0.55, 0.5], y: 0.05 },
};

const SEGMENTS = 32;

/** Geometry every bug shares (never disposed with a room, see shared()). */
const BALL = shared(new SphereGeometry(BUG.r, SEGMENTS, SEGMENTS / 2));

/** Pose while falling: stretched tall. */
const FALL_POSE = { lift: 0, scale: [0.92, 1.15, 0.92] };

/**
 * The bug as a three.js group (origin at the feet center, looking along
 * +z). Its `userData.body` is the part that hops (see bugPose()),
 * `userData.eyes` the eye material (see setEyeMood()), `userData.flash`
 * its own flash uniforms (holo.js createFlash(); a Zap hit flashes it).
 * @param {number|string} color
 */
export function createBug(color) {
  const { r, eyes } = BUG;
  const body = new Group();
  const flash = createFlash();
  const ball = holoPart(BALL, color, flash);
  ball.position.y = r;
  body.add(ball);

  // Bright (above 1, for bloom), flattened and slanted into a frown.
  const material = new MeshBasicMaterial();
  const z = Math.sqrt(r ** 2 - eyes.x ** 2 - (eyes.y - r) ** 2) - 0.005;
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, material);
    eye.position.set(side * eyes.x, eyes.y, z);
    eye.scale.set(...eyes.size);
    eye.rotation.set(-0.3, side * 0.35, side * eyes.slant);
    body.add(eye);
  }

  const group = new Group().add(body);
  Object.assign(group.userData, { body, eyes: material, flash, glow: BUG.eyeGlow });
  setMood(group, 'hostile');
  return group;
}

// The mood helpers every enemy shares, under the names the showcase knows.
export { eyeMood, setMood as setEyeMood };

/**
 * Extra squash `ticks` after the wizard bounced off it: flattened at once,
 * springing back. 0 when there is none.
 * @param {number|null} ticks
 */
export function bounceSquash(ticks) {
  const { ticks: length, depth } = BUG.bounceSquash;
  if (ticks === null || ticks >= length) return 0;
  return depth * (1 - ticks / length) * Math.cos((ticks / length) * Math.PI * 1.5);
}

/**
 * The hop at `phase` (0..1 through one hop): how high the body is lifted
 * and its scale [x, y, z]. In the air it stretches a little; landing
 * squashes it wide and flat.
 * @param {number} phase
 * @param {number} [size] 1 for a full hop, less for a smaller one
 * @returns {{ lift: number, scale: number[] }}
 */
export function bugPose(phase, size = 1) {
  const { height, air, squash, stretch } = BUG.hop;
  const t = ((phase % 1) + 1) % 1;
  if (t < air) {
    const up = Math.sin((t / air) * Math.PI);
    const s = 1 + up * stretch * size;
    return { lift: up * height * size, scale: [1 / Math.sqrt(s), s, 1 / Math.sqrt(s)] };
  }
  const down = Math.sin(((t - air) / (1 - air)) * Math.PI) * size;
  return { lift: 0, scale: [1 + down * squash, 1 - down * squash * 1.2, 1 + down * squash] };
}

/**
 * Pose a bug's body for this frame: a hop per cell while walking, small
 * hops while standing, stretched while falling, plus the squash of a
 * bounce or a hit, shifted sideways by a glitch.
 * @param {Group} bug from createBug()
 * @param {object} state
 * @param {string} [state.state] the enemy's state ('rest', 'walk', 'fall')
 * @param {number} [state.walked] cells walked (while walking)
 * @param {number} [state.time] seconds (for the standing hops)
 * @param {number|null} [state.bounced] ticks since the wizard bounced off it
 * @param {number} [state.squash] extra squash (a hit, zap-fx.js enemyHitLook())
 * @param {number} [state.shift] sideways shift (a glitch, zap-fx.js damagedGlitch())
 * @param {number|null} [state.attack] ticks since its discharge attack started, or null
 * @param {number} [state.charge] ticks that attack charges
 */
export function animateBug(bug, { state = 'rest', walked = 0, time = 0, bounced = null, squash: hit = 0, shift = 0, attack = null, charge = 1 }) {
  const pose = state === 'fall' ? FALL_POSE : state === 'walk' ? bugPose(walked) : bugPose(time * BUG.idleRate, BUG.idleLift);
  // A bug with a discharge attack trembles while it charges.
  const { shake } = dischargeLook(attack, charge);
  if (shake > 0) shift += shake * (hash(Math.floor(time * 30), 5) - 0.5) * 2;
  const squash = bounceSquash(bounced) + hit;
  const { body } = bug.userData;
  body.position.x = shift;
  body.position.y = pose.lift;
  body.scale.set(pose.scale[0] * (1 + squash * 0.5), pose.scale[1] * (1 - squash), pose.scale[2] * (1 + squash * 0.5));
}

/**
 * Everything EnemyView needs to show a bug: build it, color its eyes,
 * animate it, and the body it derezzes from.
 */
export const BUG_MODEL = {
  create: createBug,
  setMood,
  animate: animateBug,
  derez: BUG.derez,
  turnRate: BUG.turnRate,
  /** Height of the "!" above its feet. */
  markHeight: 0.85,
  /** How far in front of its eyes an arc leaves it (along the line of fire). */
  muzzle: BUG.r,
};
