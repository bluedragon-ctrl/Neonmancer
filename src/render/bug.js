/**
 * The bug model in the hologram look (D22, D48): a plain ball with two
 * slanted eyes whose color shows its mood (red: hostile, amber: calm until
 * provoked, cyan: peaceful), hopping from cell to cell with squash and
 * stretch. A bouncy bug wears a glowing pad ring on top. Pure pose and pop
 * functions are tested.
 *
 * The model stands on y = 0 around the y axis and looks along +z. The ball
 * is as big as the hitbox (0.6); the hop lifts it only for show.
 */
import { Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from 'three';
import { holoPart } from './holo.js';

/** Proportions (world units) and animation tuning. */
export const BUG = {
  r: 0.3,
  /** Eyes: offset from the middle, height, size of the flattened spheres, frown slant (radians). */
  eyes: { x: 0.1, y: 0.36, size: [0.06, 0.04, 0.03], slant: 0.45 },
  /** Eye color by mood (see eyeMood()). */
  moods: { hostile: 0xff2a3a, provoked: 0xffb020, peaceful: 0x00f0ff },
  /** Pad ring on top of a bouncy bug: radius, tube thickness, color. */
  pad: { r: 0.16, tube: 0.022, color: 0xffffff },
  /** Squash when the wizard bounces off it: ticks and depth. */
  bounceSquash: { ticks: 14, depth: 0.35 },
  /** One hop per cell: in the air for the first `air` of it, then squashed on landing. */
  hop: { height: 0.14, air: 0.7, squash: 0.18, stretch: 0.08 },
  /** Hops per second while standing (smaller ones). */
  idleRate: 1.6,
  idleLift: 0.4,
  /** Turning speed towards where it walks, per second. */
  turnRate: 14,
  /** Pop into pixels when it dies. */
  pop: { pixels: 24, pixelSize: 0.07, ticks: 36, spread: 0.8, rise: 0.6 },
};

const SEGMENTS = 32;

/**
 * The bug as a three.js group (origin at the feet center, looking along
 * +z). Its `userData.body` is the part that hops (see bugPose()),
 * `userData.eyes` the eye material (see setEyeMood()).
 * @param {number|string} color
 * @param {{ bounce?: boolean }} [options] bounce: wear the pad ring
 */
export function createBug(color, { bounce = false } = {}) {
  const { r, eyes, pad } = BUG;
  const body = new Group();
  const ball = holoPart(new SphereGeometry(r, SEGMENTS, SEGMENTS / 2), color);
  ball.position.y = r;
  body.add(ball);

  // Bright (above 1, for bloom), flattened and slanted into a frown.
  const material = new MeshBasicMaterial();
  const geometry = new SphereGeometry(1, 12, 8);
  const z = Math.sqrt(r ** 2 - eyes.x ** 2 - (eyes.y - r) ** 2) - 0.005;
  for (const side of [-1, 1]) {
    const eye = new Mesh(geometry, material);
    eye.position.set(side * eyes.x, eyes.y, z);
    eye.scale.set(...eyes.size);
    eye.rotation.set(-0.3, side * 0.35, side * eyes.slant);
    body.add(eye);
  }

  if (bounce) {
    const ring = new Mesh(new TorusGeometry(pad.r, pad.tube, 8, SEGMENTS), new MeshBasicMaterial({ color: new Color(pad.color).multiplyScalar(1.6) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = r + Math.sqrt(r ** 2 - pad.r ** 2);
    body.add(ring);
  }

  const group = new Group().add(body);
  group.userData.body = body;
  group.userData.eyes = material;
  setEyeMood(group, 'hostile');
  return group;
}

/**
 * The mood its eyes show: 'hostile', 'provoked' (calm, but will turn
 * hostile when attacked) or 'peaceful'.
 * @param {{ hostile: boolean, data: { hostility: string } }} enemy
 */
export function eyeMood(enemy) {
  if (enemy.hostile) return 'hostile';
  return enemy.data.hostility === 'provoked' ? 'provoked' : 'peaceful';
}

/**
 * Color a bug's eyes for a mood.
 * @param {Group} bug from createBug()
 * @param {'hostile'|'provoked'|'peaceful'} mood
 */
export function setEyeMood(bug, mood) {
  bug.userData.eyes.color.set(BUG.moods[mood]).multiplyScalar(2.2);
}

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

/** A small deterministic hash in 0..1, so every pop looks the same. */
function hash(i, k) {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * The pixels of a popping bug `tick` ticks after it died: a burst flying
 * out from the ball's middle, rising a little and shrinking to nothing.
 * @param {number} tick may be fractional, for interpolation
 * @returns {{ offset: number[], scale: number }[]} offsets from its feet
 *   center; empty once the burst is over
 */
export function popPixels(tick) {
  const { pixels, ticks, spread, rise } = BUG.pop;
  if (tick < 0 || tick >= ticks) return [];
  const t = tick / ticks;
  const out = [];
  for (let i = 0; i < pixels; i++) {
    const angle = hash(i, 1) * Math.PI * 2;
    const radius = (0.15 + hash(i, 2) * spread) * Math.sqrt(t);
    const height = BUG.r + (hash(i, 3) - 0.3) * rise * t;
    out.push({ offset: [Math.cos(angle) * radius, height, Math.sin(angle) * radius], scale: 1 - t });
  }
  return out;
}
