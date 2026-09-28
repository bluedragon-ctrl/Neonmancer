/**
 * Proposed moving enemy, working name "crawler" (a web crawler), in the
 * hologram look (D22). Shown in the asset showcase for review; not in the
 * game yet.
 *
 * A six-legged spider: a faceted gem abdomen, a round head with four eyes
 * (two big, two small) and thin jointed legs that walk in a tripod gait,
 * three feet down while the other three swing forward. When it notices the
 * wizard (`alert`) it crouches low, walks faster and raises its front legs
 * between steps. A chaser is the natural fit (D78: any movement and attack).
 *
 * The model stands on y = 0 around the y axis and looks along +z; its body
 * fits the enemy hitbox (0.6), its feet reach a little beyond.
 */
import { CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const CRAWLER = {
  /** Height of the body's middle above the floor; lower while alert. */
  y: 0.3,
  crouch: 0.08,
  abdomen: { r: 0.19, scale: [1, 0.7, 1.2], z: -0.1 },
  head: { r: 0.115, z: 0.13 },
  /** Legs per side: hip [x, z] on the body, foot [x, z] on the floor, knee height above the hip line. */
  legs: [
    { hip: [0.08, 0.1], foot: [0.36, 0.3] },
    { hip: [0.1, 0], foot: [0.42, 0.02] },
    { hip: [0.08, -0.1], foot: [0.36, -0.28] },
  ],
  knee: 0.16,
  /** A step: how far a foot swings, how high it lifts, steps per cell walked. */
  step: { stride: 0.18, lift: 0.09, perCell: 2 },
  /** Front legs raised between steps while alert. */
  threat: 0.18,
  moods: { hostile: 0xff2a3a, provoked: 0xffb020, peaceful: 0x00f0ff },
  eyeGlow: { calm: 2.2, alert: 4 },
  markHeight: 0.8,
  turnRate: 12,
  pop: { pixels: 28, pixelSize: 0.07, ticks: 36, spread: 0.9, rise: 0.6 },
};

const GEO = {
  abdomen: sharpGeometry(new IcosahedronGeometry(CRAWLER.abdomen.r, 0)),
  head: shared(new SphereGeometry(CRAWLER.head.r, 24, 12)),
  limb: shared(new CylinderGeometry(0.017, 0.017, 1, 6)),
  joint: shared(new SphereGeometry(0.024, 10, 6)),
  eye: shared(new SphereGeometry(1, 12, 8)),
};

const UP = new Vector3(0, 1, 0);
const DIR = new Vector3();
const TURN = new Quaternion();

/**
 * Stretch a limb (a unit-long upright part) from point `a` to point `b`.
 * @param {import('three').Object3D} limb
 * @param {number[]} a
 * @param {number[]} b
 */
export function placeLimb(limb, a, b) {
  DIR.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = DIR.length() || 1e-4;
  limb.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  limb.quaternion.copy(TURN.setFromUnitVectors(UP, DIR.divideScalar(length)));
  limb.scale.set(1, length, 1);
}

/**
 * A crawler as a three.js group (origin at the feet center, looking along
 * +z). `userData.body` (abdomen and head) bobs and crouches, `userData.legs`
 * are its six legs (upper and lower part, knee), `userData.eyes` the eye
 * material, `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createCrawler(color) {
  const flash = createFlash();
  const { abdomen, head: headSize } = CRAWLER;
  const body = new Group();
  const back = sharpPart(GEO.abdomen, color, flash);
  back.position.z = abdomen.z;
  back.scale.set(...abdomen.scale);
  const head = holoPart(GEO.head, color, flash);
  head.position.z = headSize.z;
  body.add(back, head);

  // Four eyes: two big ones low, two small ones above them.
  const eyes = new MeshBasicMaterial();
  const r = headSize.r;
  for (const [x, y, size] of [[0.045, 0.01, 0.034], [0.03, 0.06, 0.02]]) {
    for (const side of [-1, 1]) {
      const eye = new Mesh(GEO.eye, eyes);
      eye.position.set(side * x, y, headSize.z + Math.sqrt(r * r - x * x - y * y) - 0.004);
      eye.scale.set(size, size * 0.8, 0.012);
      eye.rotation.set(-y * 3, side * 0.35, side * 0.35);
      body.add(eye);
    }
  }

  const legs = [];
  for (const side of [-1, 1]) {
    CRAWLER.legs.forEach((leg, i) => {
      const upper = holoPart(GEO.limb, color, flash);
      const lower = holoPart(GEO.limb, color, flash);
      const knee = holoPart(GEO.joint, color, flash);
      // Tripod gait: front and back legs of one side step with the middle leg of the other.
      legs.push({ side, i, upper, lower, knee, group: (i % 2 === 0) === (side === 1) ? 0 : 1, ...leg });
    });
  }

  const group = new Group().add(body, ...legs.flatMap(({ upper, lower, knee }) => [upper, lower, knee]));
  Object.assign(group.userData, { body, legs, eyes, flash, mood: 'hostile' });
  setCrawlerMood(group, 'hostile');
  return group;
}

/**
 * @param {Group} crawler from createCrawler()
 * @param {'hostile'|'provoked'|'peaceful'} mood
 */
export function setCrawlerMood(crawler, mood) {
  crawler.userData.mood = mood;
  crawler.userData.eyes.color.set(CRAWLER.moods[mood]).multiplyScalar(CRAWLER.eyeGlow.calm);
}

/**
 * Where a foot is at `phase` (0..1 through one step cycle of its tripod):
 * swinging forward and lifted in the first half, planted and sliding back
 * in the second. Returns [forward offset, lift].
 * @param {number} phase
 */
export function crawlerFoot(phase) {
  const { stride, lift } = CRAWLER.step;
  const t = ((phase % 1) + 1) % 1;
  if (t < 0.5) {
    const s = t / 0.5;
    return [stride * (s - 0.5), Math.sin(s * Math.PI) * lift];
  }
  return [stride * (0.5 - (t - 0.5) / 0.5), 0];
}

/**
 * Pose it for this frame.
 * @param {Group} crawler from createCrawler()
 * @param {object} state
 * @param {string} [state.state] 'rest' | 'walk' | 'fall'
 * @param {number} [state.walked] cells walked (while walking)
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateCrawler(crawler, { state = 'rest', walked = 0, time = 0, alert = 0, squash = 0, shift = 0 }) {
  const { body, legs, eyes } = crawler.userData;
  const walking = state === 'walk';
  const falling = state === 'fall';
  const phase = walking ? walked * CRAWLER.step.perCell : 0;
  // Bobs down each time a tripod lands; crouches while alert.
  const bob = walking ? Math.abs(Math.sin(phase * Math.PI * 2)) * 0.02 : Math.sin(time * 2) * 0.006;
  const y = CRAWLER.y - CRAWLER.crouch * alert + bob + (falling ? 0.06 : 0);
  body.position.set(shift, y, 0);
  body.rotation.x = -0.12 * alert;
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);

  for (const leg of legs) {
    const { side, i, upper, lower, knee, hip, foot } = leg;
    const hipAt = [side * hip[0] + shift, y, hip[1]];
    let [forward, lift] = walking ? crawlerFoot(phase + leg.group * 0.5) : [0, 0];
    // Standing: now and then a foot taps.
    if (!walking && hash(Math.floor(time * 1.5), i * 2 + (side > 0 ? 1 : 0)) > 0.8) lift = Math.max(0, Math.sin(time * 1.5 * Math.PI * 2)) * 0.04;
    // Alert: front legs rise while swinging, pawing at the wizard.
    if (i === 0) lift += CRAWLER.threat * alert * (walking ? lift / CRAWLER.step.lift : 0.5 + 0.5 * Math.sin(time * 6 + side));
    // Falling: legs hang, pulled in.
    const reach = falling ? 0.7 : 1;
    const footAt = [side * foot[0] * reach + shift, falling ? y - 0.22 : lift, foot[1] + forward];
    // The knee: up and out, above the line from hip to foot.
    const kneeAt = [
      hipAt[0] + (footAt[0] - hipAt[0]) * 0.45,
      Math.max(hipAt[1], footAt[1]) + CRAWLER.knee * (falling ? 0.3 : 1),
      hipAt[2] + (footAt[2] - hipAt[2]) * 0.45,
    ];
    placeLimb(upper, hipAt, kneeAt);
    placeLimb(lower, kneeAt, footAt);
    knee.position.set(...kneeAt);
  }

  const glow = CRAWLER.eyeGlow.calm + (CRAWLER.eyeGlow.alert - CRAWLER.eyeGlow.calm) * alert;
  eyes.color.set(CRAWLER.moods[crawler.userData.mood]).multiplyScalar(glow);
}

/**
 * The pixels of it popping `tick` ticks after it died.
 * @param {number} tick may be fractional
 * @returns {{ offset: number[], scale: number }[]}
 */
export function crawlerPopPixels(tick) {
  const { pixels, ticks, spread, rise } = CRAWLER.pop;
  if (tick < 0 || tick >= ticks) return [];
  const t = tick / ticks;
  const out = [];
  for (let i = 0; i < pixels; i++) {
    const angle = hash(i, 61) * Math.PI * 2;
    const radius = (0.15 + hash(i, 62) * spread) * Math.sqrt(t);
    const height = CRAWLER.y * (0.5 + hash(i, 63)) + (hash(i, 64) - 0.3) * rise * t;
    out.push({ offset: [Math.cos(angle) * radius, height, Math.sin(angle) * radius], scale: 1 - t });
  }
  return out;
}

/** Everything EnemyView needs to show a crawler (see BUG_MODEL in bug.js). */
export const CRAWLER_MODEL = {
  create: createCrawler,
  setMood: setCrawlerMood,
  animate: animateCrawler,
  popPixels: crawlerPopPixels,
  pop: CRAWLER.pop,
  turnRate: CRAWLER.turnRate,
  markHeight: CRAWLER.markHeight,
  muzzle: [0, CRAWLER.y, CRAWLER.head.z + CRAWLER.head.r],
};
