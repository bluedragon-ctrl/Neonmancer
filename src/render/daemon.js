/**
 * The daemon model, a will-o'-the-wisp that is also a background process,
 * in the hologram look (D22). An enemy look (D107); no
 * defs.json template uses it yet, a room picks it with `look`.
 *
 * A floating teardrop flame with two slanted eyes, shedding square pixel
 * embers that drift up off its tip. It bobs on a slow wave and its tip
 * flickers and leans. After
 * the wizard (`alert`) it stretches tall and thin and its embers rise
 * faster; charging, it shrinks into a tight bright ball; firing (an arc
 * would leave its eyes) it flares tall.
 *
 * The model floats over y = 0 around the y axis and looks along +z, about
 * as wide as the enemy hitbox (0.6).
 */
import { BoxGeometry, Group, LatheGeometry, Mesh, MeshBasicMaterial, Vector2 } from 'three';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const DAEMON = {
  /** The flame: radius of its round bottom, height of its tip over that; how high it floats. */
  flame: { r: 0.17, tip: 0.42 },
  hover: 0.14,
  bob: { height: 0.035, rate: 0.7 },
  /** Embers: how many, how high they rise before fading, rises per second (calm, alert). */
  embers: { count: 6, rise: 0.35, rate: [0.5, 1.2], size: 0.035 },
  /** Stretch while alert (height times, width times), squeeze at full charge. */
  alertStretch: [1.25, 0.88],
  chargeSqueeze: [0.55, 0.85],
  eyeGlow: { calm: 2.4, alert: 4.5 },
  markHeight: 1,
  turnRate: 6,
  /** The body it derezzes from when it dies (derez-fx.js, D126); square, as it turns. */
  derez: { size: [0.45, 0.45, 0.45], y: 0.1 },
};

const { r: R, tip: TIP } = DAEMON.flame;

/** The flame's profile for LatheGeometry: a round bottom narrowing to a point. */
function flameProfile() {
  const points = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    points.push(new Vector2(R * Math.sin(a), R - R * Math.cos(a)));
  }
  for (let i = 1; i <= 12; i++) {
    const s = i / 12;
    points.push(new Vector2(Math.max(R * Math.pow(1 - s, 1.4), 0.001), R + TIP * s));
  }
  return points;
}

const GEO = {
  flame: shared(new LatheGeometry(flameProfile(), 24)),
  pixel: shared(new BoxGeometry(1, 1, 1)),
};

/**
 * A daemon as a three.js group (origin at the feet center, looking along
 * +z). `userData.body` is the flame and eyes (it bobs and stretches),
 * `userData.embers` its pixels, `userData.bright` their material,
 * `userData.eyes` the eye material, `userData.flash` its flash uniforms
 * (holo.js).
 * @param {number|string} color
 */
export function createDaemon(color) {
  const flash = createFlash();
  const flame = holoPart(GEO.flame, color, flash);
  const body = new Group().add(flame);

  // Slanted eyes on the front of its round bottom.
  const eyes = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    eye.position.set(side * 0.06, R * 1.05, R * 0.93);
    eye.scale.set(0.04, 0.026, 0.012);
    eye.rotation.set(0, side * 0.3, side * 0.4);
    body.add(eye);
  }

  const bright = new MeshBasicMaterial();
  bright.color.set(color).multiplyScalar(2.6);
  const embers = Array.from({ length: DAEMON.embers.count }, () => new Mesh(GEO.pixel, bright));

  const group = new Group().add(body, ...embers);
  Object.assign(group.userData, { body, flame, embers, bright, color, eyes, flash, glow: DAEMON.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * How it is stretched: [height, width] times, from alert (tall and thin)
 * and its attack (squeezed into a ball while charging, tall while firing).
 * @param {number} alert 0..1
 * @param {ReturnType<typeof dischargeLook>} look
 */
export function daemonStretch(alert, { charge, discharging }) {
  const [ah, aw] = DAEMON.alertStretch;
  let h = 1 + (ah - 1) * alert;
  let w = 1 + (aw - 1) * alert;
  if (discharging) return [ah * 1.15, aw * 0.9];
  const [ch, cw] = DAEMON.chargeSqueeze;
  h += (ch - h) * charge;
  w += (cw - w) * charge;
  return [h, w];
}

/**
 * Pose it for this frame.
 * @param {Group} daemon from createDaemon()
 * @param {object} state
 * @param {string} [state.state] 'rest' | 'walk' | 'fall'
 * @param {number} [state.walked] cells walked (while walking)
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard
 * @param {number|null} [state.attack] ticks since its attack started, or null
 * @param {number} [state.charge] ticks that attack charges
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animateDaemon(daemon, { state = 'rest', time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { body, flame, embers, bright, color } = daemon.userData;
  const look = dischargeLook(attack, charge);
  const { height, rate } = DAEMON.bob;
  const y = DAEMON.hover + Math.sin(time * rate * Math.PI * 2) * height;
  const jolt = Math.floor(time * 30);
  const shake = look.shake * (hash(jolt, 3) - 0.5) * 2;
  body.position.set(shift + shake, y, 0);

  // The flame flickers: its height jitters and its tip leans.
  const [h, w] = daemonStretch(alert, look);
  const flicker = 1 + 0.06 * Math.sin(time * 13) + 0.04 * Math.sin(time * 7.3);
  flame.scale.set(w * (1 + squash * 0.5), h * flicker * (1 - squash), w * (1 + squash * 0.5));
  flame.rotation.z = Math.sin(time * 2.1) * 0.08;
  flame.rotation.x = (state === 'walk' ? -0.15 : 0) + Math.sin(time * 1.7) * 0.05;

  // Embers drift up off the tip, spreading and shrinking as they go.
  const { count, rise, rate: [calm, after], size } = DAEMON.embers;
  const speed = calm + (after - calm) * alert;
  const tipY = y + (R + TIP * 0.7) * h;
  embers.forEach((ember, i) => {
    const t = (time * speed + i / count) % 1;
    const angle = hash(i, 11) * Math.PI * 2 + time * 0.8;
    const out = 0.03 + t * 0.12;
    ember.position.set(shift + Math.cos(angle) * out, tipY + t * rise, Math.sin(angle) * out);
    ember.scale.setScalar(size * (1 - t));
    ember.rotation.set(t * 3, t * 5, 0);
  });


  bright.color.set(color).multiplyScalar(2.6 + look.charge * 2);
  glowEyes(daemon, flaredGlow(DAEMON.eyeGlow, alert, look.charge));
}

/** Everything EnemyView needs to show a daemon (see BUG_MODEL in bug.js). */
export const DAEMON_MODEL = {
  create: createDaemon,
  setMood,
  animate: animateDaemon,
  derez: DAEMON.derez,
  turnRate: DAEMON.turnRate,
  markHeight: DAEMON.markHeight,
  muzzle: R + 0.05,
};
