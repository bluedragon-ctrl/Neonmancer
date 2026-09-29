/**
 * The overclock model, a fire elemental that is an overheating processor,
 * in the hologram look (D22). An enemy look (D107); no
 * defs.json template uses it yet, a room picks it with `look`. Meant for a walker with a burst (a
 * blast of heat), or a touch attack: it burns.
 *
 * A CPU chip scuttling on its pins, its die on top with two eyes, glowing
 * traces running out over the chip, and a crown of flame tongues burning
 * from the die round a taller one in the middle, each flickering on its
 * own, sparks rising off them. The chip is a darker shade of its color and
 * the middle tongue a lighter one, so the fire stands out. After the wizard
 * (`alert`) the fire roars taller and faster and the traces glow hot;
 * charging, the tongues lean in into one column and the chip shakes;
 * firing, they flare out all round (a burst would go off).
 *
 * The model stands on y = 0 around the y axis and looks along +z, the
 * chip about as wide as the enemy hitbox (0.6).
 */
import { BoxGeometry, Color, Group, LatheGeometry, Mesh, MeshBasicMaterial, Vector2 } from 'three';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, popBurst, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const OVERCLOCK = {
  /** The chip: width, thickness, height of its middle; the die on top: width, height. */
  chip: { size: 0.42, thick: 0.05, y: 0.12 },
  die: { size: 0.22, height: 0.07 },
  /** Pins per side, their length; how high they lift in a step. */
  pins: { count: 3, length: 0.11, lift: 0.04 },
  /** Flame tongues round the die: how many, radius and height; the middle one's. */
  tongues: { count: 5, r: 0.055, height: 0.24, lean: 0.35 },
  middle: { r: 0.08, height: 0.36 },
  /** Shades: the chip darker, the middle tongue lighter (HSL lightness). */
  shade: { chip: -0.18, middle: 0.14 },
  /** Fire height times: alert, charging (one column), flaring out when firing. */
  roar: [1.35, 1.6, 0.8],
  /** Flicker rate (per second): calm, alert. */
  flicker: [7, 12],
  sparks: { count: 8, rise: 0.45, rate: [0.7, 1.6], size: 0.03 },
  /** Trace brightness: calm, alert. */
  traceGlow: [1.2, 3.5],
  eyeGlow: { calm: 2.4, alert: 4.5 },
  markHeight: 1.05,
  turnRate: 6,
  pop: { pixels: 34, pixelSize: 0.06, ticks: 36, spread: 0.9, rise: 1 },
};

/** A flame tongue's profile for LatheGeometry: a rounded base, a bulge, a point. */
function tongueProfile(r, height) {
  const points = [new Vector2(0.001, 0)];
  for (let i = 1; i <= 14; i++) {
    const s = i / 14;
    const width = r * Math.sin(Math.min(1, s * 2.6) * (Math.PI / 2)) * Math.pow(1 - s, 0.9);
    points.push(new Vector2(Math.max(width, 0.001), height * s));
  }
  return points;
}

const { chip: CHIP, die: DIE, pins: PINS, tongues: TONGUES, middle: MIDDLE } = OVERCLOCK;
const DIE_TOP = CHIP.y + CHIP.thick / 2 + DIE.height;

const GEO = {
  chip: sharpGeometry(new BoxGeometry(CHIP.size, CHIP.thick, CHIP.size)),
  die: sharpGeometry(new BoxGeometry(DIE.size, DIE.height, DIE.size)),
  pin: sharpGeometry(new BoxGeometry(0.03, PINS.length, 0.03)),
  tongue: shared(new LatheGeometry(tongueProfile(TONGUES.r, TONGUES.height), 12)),
  middle: shared(new LatheGeometry(tongueProfile(MIDDLE.r, MIDDLE.height), 16)),
  cube: shared(new BoxGeometry(1, 1, 1)),
};

/**
 * An overclock as a three.js group (origin at the feet center, looking
 * along +z). `userData.body` is the chip and die, `userData.pins` its legs,
 * `userData.tongues` the flame tongues (the middle one last),
 * `userData.sparks` its sparks, `userData.traces` the traces' material,
 * `userData.eyes` the eye material, `userData.flash` its flash uniforms
 * (holo.js).
 * @param {number|string} color
 */
export function createOverclock(color) {
  const flash = createFlash();
  const chipColor = new Color(color).offsetHSL(0, 0, OVERCLOCK.shade.chip);
  const body = new Group();
  const chip = sharpPart(GEO.chip, chipColor, flash);
  chip.position.y = CHIP.y;
  const die = sharpPart(GEO.die, chipColor, flash);
  die.position.y = CHIP.y + CHIP.thick / 2 + DIE.height / 2;
  body.add(chip, die);

  // Traces from the die out to the chip's edges, glowing with heat.
  const traces = new MeshBasicMaterial();
  const top = CHIP.y + CHIP.thick / 2 + 0.003;
  const reach = (CHIP.size - DIE.size) / 2 - 0.02;
  for (let side = 0; side < 4; side++) {
    for (const offset of [-0.06, 0.06]) {
      const trace = new Mesh(GEO.cube, traces);
      trace.scale.set(0.012, 0.004, reach);
      const along = DIE.size / 2 + reach / 2;
      const holder = new Group().add(trace);
      trace.position.set(offset, top, along);
      holder.rotation.y = (side * Math.PI) / 2;
      body.add(holder);
    }
  }

  // Eyes on the die's front face.
  const eyes = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    eye.position.set(side * 0.05, die.position.y + 0.005, DIE.size / 2 + 0.004);
    eye.scale.set(0.035, 0.022, 0.01);
    eye.rotation.set(0, 0, side * 0.4);
    body.add(eye);
  }

  // Pins along each side, splayed a little outward: its legs.
  const pins = [];
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < PINS.count; i++) {
      const pin = sharpPart(GEO.pin, chipColor, flash);
      const holder = new Group().add(pin);
      holder.rotation.y = (side * Math.PI) / 2;
      pin.userData.along = (i - (PINS.count - 1) / 2) * 0.11;
      pin.userData.set = (side + i) % 2;
      pins.push(pin);
      body.add(holder);
    }
  }

  // Tongues round the die's top edge, and a taller, lighter one in the middle.
  const tongues = [];
  for (let i = 0; i < TONGUES.count; i++) {
    const angle = (i / TONGUES.count) * Math.PI * 2 + 0.3;
    const holder = new Group();
    holder.rotation.y = angle;
    const tongue = holoPart(GEO.tongue, color, flash);
    tongue.position.z = DIE.size * 0.36;
    holder.add(tongue);
    holder.position.y = DIE_TOP;
    tongue.userData.seed = i;
    tongues.push(tongue);
    body.add(holder);
  }
  const middle = holoPart(GEO.middle, new Color(color).offsetHSL(0, 0, OVERCLOCK.shade.middle), flash);
  middle.position.y = DIE_TOP;
  middle.userData.seed = TONGUES.count;
  tongues.push(middle);
  body.add(middle);

  const bright = new MeshBasicMaterial();
  bright.color.set(color).multiplyScalar(3);
  const sparks = Array.from({ length: OVERCLOCK.sparks.count }, () => new Mesh(GEO.cube, bright));

  const group = new Group().add(body, ...sparks);
  Object.assign(group.userData, { body, pins, tongues, sparks, traces, color, eyes, flash, glow: OVERCLOCK.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * How tall its fire burns and how far the outer tongues lean out
 * (radians, negative in): taller while alert; one column leaning in while
 * charging; low and flared out all round while it fires.
 * @param {number} alert 0..1
 * @param {ReturnType<typeof dischargeLook>} look
 * @returns {[number, number]} [height times, lean]
 */
export function overclockFire(alert, { charge, discharging }) {
  const [roar, column, flare] = OVERCLOCK.roar;
  const { lean } = TONGUES;
  if (discharging) return [flare, 1.3];
  const height = 1 + (roar - 1) * alert;
  return [height + (column - height) * charge, lean + (-0.25 - lean) * charge];
}

/**
 * Pose it for this frame.
 * @param {Group} overclock from createOverclock()
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
export function animateOverclock(overclock, { state = 'rest', walked = 0, time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { body, pins, tongues, sparks, traces, color } = overclock.userData;
  const look = dischargeLook(attack, charge);
  const jolt = Math.floor(time * 30);
  const walking = state === 'walk';
  // It scuttles: the pins step in two sets, the chip jiggling on them.
  const phase = walked * Math.PI * 4;
  const shake = look.shake * (hash(jolt, 8) - 0.5) * 2;
  body.position.set(shift + shake, walking ? Math.abs(Math.sin(phase)) * 0.012 : 0, 0);
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  for (const pin of pins) {
    const up = walking ? Math.max(0, Math.sin(phase + pin.userData.set * Math.PI)) * PINS.lift : 0;
    pin.position.set(pin.userData.along, CHIP.y - PINS.length / 2 + 0.01 + up, CHIP.size / 2 - 0.01);
    pin.rotation.x = 0.25;
  }

  // Each tongue flickers on its own; the outer ones lean out (or in).
  const [height, lean] = overclockFire(alert, look);
  const [calm, after] = OVERCLOCK.flicker;
  const rate = calm + (after - calm) * alert;
  for (const tongue of tongues) {
    const seed = tongue.userData.seed;
    const outer = seed < TONGUES.count;
    const flicker = 1 + 0.12 * Math.sin(time * rate + seed * 2.1) + 0.08 * Math.sin(time * rate * 1.7 + seed);
    const h = height * flicker;
    tongue.scale.set(1 + 0.1 * (1 - flicker), h * (1 - squash), 1 + 0.1 * (1 - flicker));
    tongue.rotation.x = outer ? lean + Math.sin(time * 3 + seed) * 0.1 : 0;
    tongue.rotation.z = Math.sin(time * 2.3 + seed * 1.3) * 0.12;
  }

  // Sparks rise off the fire, drifting out and shrinking.
  const { count, rise, rate: [slow, fast], size } = OVERCLOCK.sparks;
  const speed = slow + (fast - slow) * alert;
  sparks.forEach((spark, i) => {
    const t = (time * speed + i / count) % 1;
    const angle = hash(i, 17) * Math.PI * 2;
    const out = 0.05 + t * 0.2 * (look.discharging ? 2 : 1);
    spark.position.set(shift + Math.cos(angle) * out, DIE_TOP + MIDDLE.height * 0.5 * height + t * rise, Math.sin(angle) * out);
    spark.scale.setScalar(size * (1 - t));
    spark.rotation.set(t * 4, t * 6, 0);
  });

  const [cool, hot] = OVERCLOCK.traceGlow;
  const pulse = 0.3 * Math.sin(time * 5);
  traces.color.set(color).multiplyScalar(cool + (hot - cool) * Math.max(alert, look.charge) + pulse);
  glowEyes(overclock, flaredGlow(OVERCLOCK.eyeGlow, alert, look.charge));
}

/** The pixels of it popping `tick` ticks after it died (enemy-look.js popBurst()). */
export const overclockPopPixels = popBurst(OVERCLOCK.pop, { seed: 111, middle: DIE_TOP, start: 0.15, scatter: 0.4 });

/** Everything EnemyView needs to show an overclock (see BUG_MODEL in bug.js). */
export const OVERCLOCK_MODEL = {
  create: createOverclock,
  setMood,
  animate: animateOverclock,
  popPixels: overclockPopPixels,
  pop: OVERCLOCK.pop,
  turnRate: OVERCLOCK.turnRate,
  markHeight: OVERCLOCK.markHeight,
  muzzle: DIE.size / 2 + 0.05,
};
