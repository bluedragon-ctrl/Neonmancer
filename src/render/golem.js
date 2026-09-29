/**
 * The golem model, a stone golem built from a server rack, in the hologram
 * look (D22). An enemy look (D104); no defs.json template uses it yet, a
 * room picks it with `look`. Meant for a slow solid patroller (D51) the wizard
 * can ride, or freeze with Pause for a step.
 *
 * Two stacked rack units for a body, rows of LEDs blinking like disk
 * activity and vent slats on their fronts, a slim head block with a wide
 * visor (its eyes), two block fists floating at its sides and two short
 * slab legs. It stomps: legs lift in turn, the body dips on each step, the
 * fists swing. After the wizard (`alert`) every LED turns to its eye color
 * and the slats scroll as its fans spin up; charging, the LEDs fill up.
 *
 * The model stands on y = 0 around the y axis and looks along +z, filling
 * the enemy hitbox (0.6) and a bit more.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { dischargeLook } from './discharge.js';
import { MOODS, flaredGlow, glowEyes, popBurst, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const GOLEM = {
  /** A rack unit: width, height, depth; the two units' middles. */
  unit: [0.56, 0.2, 0.4],
  units: [0.31, 0.53],
  head: { size: [0.3, 0.15, 0.3], y: 0.72 },
  leg: { size: [0.16, 0.2, 0.22], x: 0.13 },
  fist: { size: 0.15, x: 0.39, y: 0.42 },
  /** LEDs per row (one row per unit) and how often they change, per second. */
  leds: 5,
  blinkRate: 7,
  /** Vent slats per unit, and how fast they scroll while alert (units per second). */
  slats: 3,
  fan: 0.4,
  /** Step: how high a leg lifts, how far the body dips. */
  step: { lift: 0.07, dip: 0.025 },
  eyeGlow: { calm: 2.2, alert: 4.5 },
  markHeight: 1.05,
  turnRate: 3,
  pop: { pixels: 40, pixelSize: 0.08, ticks: 40, spread: 1, rise: 0.8 },
};

const [UW, UH, UD] = GOLEM.unit;

const GEO = {
  unit: sharpGeometry(new BoxGeometry(UW, UH, UD)),
  head: sharpGeometry(new BoxGeometry(...GOLEM.head.size)),
  leg: sharpGeometry(new BoxGeometry(...GOLEM.leg.size)),
  fist: sharpGeometry(new BoxGeometry(GOLEM.fist.size, GOLEM.fist.size, GOLEM.fist.size)),
  cube: shared(new BoxGeometry(1, 1, 1)),
};

/**
 * A golem as a three.js group (origin at the feet center, looking along
 * +z). `userData.body` is the rack units and head, `userData.legs` and
 * `userData.fists` its limbs, `userData.leds` one material per LED,
 * `userData.slats` the vent slats, `userData.eyes` the visor material,
 * `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createGolem(color) {
  const flash = createFlash();
  const body = new Group();
  const front = UD / 2 + 0.004;
  const leds = [];
  const slats = [];
  const slatMaterial = new MeshBasicMaterial();
  slatMaterial.color.set(color).multiplyScalar(1.4);
  for (const y of GOLEM.units) {
    const unit = sharpPart(GEO.unit, color, flash);
    unit.position.y = y;
    // LEDs on the left of its front, slats on the right.
    for (let i = 0; i < GOLEM.leds; i++) {
      const material = new MeshBasicMaterial();
      const led = new Mesh(GEO.cube, material);
      led.scale.set(0.028, 0.028, 0.01);
      led.position.set(-UW / 2 + 0.05 + i * 0.045, 0.03, front);
      unit.add(led);
      leds.push(material);
    }
    const vents = new Group();
    for (let i = 0; i < GOLEM.slats; i++) {
      const slat = new Mesh(GEO.cube, slatMaterial);
      slat.scale.set(0.2, 0.01, 0.01);
      vents.add(slat);
    }
    vents.position.set(UW / 2 - 0.14, 0, front);
    unit.add(vents);
    slats.push(vents);
    body.add(unit);
  }

  const head = sharpPart(GEO.head, color, flash);
  head.position.y = GOLEM.head.y;
  // A wide visor across the head's front is its eyes.
  const eyes = new MeshBasicMaterial();
  const visor = new Mesh(GEO.cube, eyes);
  visor.scale.set(GOLEM.head.size[0] * 0.75, 0.035, 0.012);
  visor.position.set(0, 0.01, GOLEM.head.size[2] / 2 + 0.006);
  head.add(visor);
  body.add(head);

  const legs = [-1, 1].map((side) => {
    const leg = sharpPart(GEO.leg, color, flash);
    leg.userData.side = side;
    return leg;
  });
  const fists = [-1, 1].map((side) => {
    const fist = sharpPart(GEO.fist, color, flash);
    fist.userData.side = side;
    return fist;
  });

  const group = new Group().add(body, ...legs, ...fists);
  Object.assign(group.userData, { body, head, legs, fists, leds, slats, color, eyes, flash, glow: GOLEM.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * Whether LED `i` is lit at `time`: a random pattern that changes
 * GOLEM.blinkRate times a second, like disk activity; charging fills them
 * up from the first.
 * @param {number} i
 * @param {number} time seconds
 * @param {number} charge 0..1
 * @param {number} count LEDs in its row
 */
export function ledOn(i, time, charge, count) {
  if (charge * count > i) return true;
  return hash(i, Math.floor(time * GOLEM.blinkRate)) > 0.45;
}

/**
 * Pose it for this frame.
 * @param {Group} golem from createGolem()
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
export function animateGolem(golem, { state = 'rest', walked = 0, time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { body, head, legs, fists, leds, slats, color } = golem.userData;
  const look = dischargeLook(attack, charge);
  const jolt = Math.floor(time * 30);
  const shake = look.shake * (hash(jolt, 4) - 0.5) * 2;
  const walking = state === 'walk';
  // Two steps per cell: a leg lifts on each, the body dips as it lands.
  const phase = walked * Math.PI * 2;
  const { lift, dip } = GOLEM.step;
  const land = walking ? Math.abs(Math.cos(phase)) : 1;
  body.position.set(shift + shake, -dip * (1 - land) + (walking ? 0 : Math.sin(time * 1.2) * 0.006), 0);
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  head.rotation.y = walking ? Math.sin(phase) * 0.06 : 0;
  for (const leg of legs) {
    const { side } = leg.userData;
    const up = walking ? Math.max(0, Math.sin(phase) * side) * lift : 0;
    leg.position.set(shift + side * GOLEM.leg.x, GOLEM.leg.size[1] / 2 - 0.02 + up, walking ? up * 0.6 : 0);
  }
  const { x, y } = GOLEM.fist;
  for (const fist of fists) {
    const { side } = fist.userData;
    const swing = walking ? Math.sin(phase) * -side * 0.08 : 0;
    // Fists rise to guard while alert, and up high while charging.
    fist.position.set(shift + side * x, y + Math.sin(time * 1.8 + side) * 0.012 + 0.05 * alert + 0.15 * look.charge, swing + 0.08 * alert);
    fist.rotation.set(swing * 2, 0, side * 0.1 * alert);
  }

  // LEDs blink in the body color; alert they turn to the eye color.
  const moodColor = MOODS[golem.userData.mood];
  leds.forEach((material, i) => {
    const on = ledOn(i % GOLEM.leds, time + Math.floor(i / GOLEM.leds) * 0.37, look.charge, GOLEM.leds);
    material.color.set(alert > 0.5 || look.charge > 0 ? moodColor : color).multiplyScalar(on ? 3 : 0.25);
  });
  // Slats scroll down as its fans spin up.
  const scroll = (time * GOLEM.fan * alert) % (UH / GOLEM.slats);
  for (const vents of slats) {
    vents.children.forEach((slat, i) => {
      slat.position.y = UH / 2 - 0.02 - ((i * UH) / GOLEM.slats + scroll) % (UH - 0.03);
    });
  }
  glowEyes(golem, flaredGlow(GOLEM.eyeGlow, alert, look.charge));
}

/** The pixels of it popping `tick` ticks after it died (enemy-look.js popBurst()). */
export const golemPopPixels = popBurst(GOLEM.pop, { seed: 81, middle: 0.42, start: 0.2, scatter: 0.6 });

/** Everything EnemyView needs to show a golem (see BUG_MODEL in bug.js). */
export const GOLEM_MODEL = {
  create: createGolem,
  setMood,
  animate: animateGolem,
  popPixels: golemPopPixels,
  pop: GOLEM.pop,
  turnRate: GOLEM.turnRate,
  markHeight: GOLEM.markHeight,
  muzzle: GOLEM.head.size[2] / 2 + 0.05,
};
