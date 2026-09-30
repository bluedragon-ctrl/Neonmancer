/**
 * The wyrm model, a flying dragon made of a stream of data packets, in
 * the hologram look (D22). An enemy look (D107); no
 * defs.json template uses it yet, a room picks it with `look`. Meant for a patroller spitting a
 * bolt, gliding along a long path in a big room.
 *
 * A horned dragon mask in its body color trailing a chain of hexagon
 * plates in shades of that color (wyrmShades(): the hue swinging a little
 * either way plate by plate, darker towards the tail), so any `color`
 * makes a wyrm of its own; a glowing packet rides above each plate. It
 * swims through the air: a wave runs down the chain and the tail swings wider than the
 * head. After the wizard (`alert`) the wave quickens and its head rises;
 * charging, the packets light up from the tail to the head and its jaw
 * opens; firing, it snaps its head forward.
 *
 * The model flies around the y axis at eye height and looks along +z; the
 * head fills the enemy hitbox (0.6), the chain trails behind it (visual
 * only).
 */
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { ENEMY } from '../entities/enemy.js';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const WYRM = {
  /** How high it flies (the head's middle). */
  height: ENEMY.eyeHeight + 0.04,
  /** Plates, head to tail: radius; the gap between them. */
  plates: [0.075, 0.07, 0.064, 0.057, 0.049, 0.04],
  gap: 0.11,
  /** Plate shades: hue swing either way (turns), lightness lost by the tail. */
  shade: { hue: 0.035, darken: 0.2 },
  /** The wave: height and width (the tail swings wider), lag per plate (radians). */
  wave: { height: 0.07, width: 0.06, lag: 0.85 },
  /** Waves per second standing, per cell walked. */
  idleRate: 0.6,
  alertRate: 1.1,
  /** Head rise while alert; jaw opening at full charge (radians). */
  rise: 0.08,
  jaw: 0.6,
  /** Packet brightness: calm, lit while charging. */
  packetGlow: [1.4, 4.5],
  eyeGlow: { calm: 2.4, alert: 4.5 },
  markHeight: 1,
  turnRate: 5,
  /** The body it derezzes from when it dies (derez-fx.js, D126); square, as it turns. */
  derez: { size: [0.8, 0.35, 0.8], y: 0.25 },
};

const GEO = {
  // A four-sided snout pointing +z, and the skull behind it.
  snout: sharpGeometry(new ConeGeometry(0.09, 0.2, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2)),
  skull: sharpGeometry(new BoxGeometry(0.18, 0.11, 0.14)),
  jaw: sharpGeometry(new BoxGeometry(0.11, 0.025, 0.16)),
  horn: sharpGeometry(new ConeGeometry(0.025, 0.17, 4)),
  // Hexagon plates with their axis along z (the way the chain runs).
  plates: WYRM.plates.map((r) => sharpGeometry(new CylinderGeometry(r, r, 0.05, 6).rotateX(Math.PI / 2))),
  packet: shared(new BoxGeometry(0.035, 0.035, 0.035)),
};

/**
 * A wyrm as a three.js group (origin at the feet center, looking along
 * +z). `userData.head` rises and snaps, `userData.jaw` opens,
 * `userData.plates` are the chain (each with its packet material in
 * `userData.packet`), `userData.eyes` the eye material, `userData.flash`
 * its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createWyrm(color) {
  const flash = createFlash();
  const head = new Group();
  const skull = sharpPart(GEO.skull, color, flash);
  const snout = sharpPart(GEO.snout, color, flash);
  snout.position.set(0, -0.005, 0.15);
  const jaw = new Group();
  const jawPart = sharpPart(GEO.jaw, color, flash);
  jawPart.position.z = 0.08;
  jaw.add(jawPart);
  jaw.position.set(0, -0.055, 0.0);
  head.add(skull, snout, jaw);
  for (const side of [-1, 1]) {
    const horn = sharpPart(GEO.horn, color, flash);
    horn.position.set(side * 0.06, 0.1, -0.05);
    horn.rotation.set(-0.8, 0, -side * 0.35);
    head.add(horn);
  }
  // Slit eyes on the front corners of the skull.
  const eyes = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    eye.position.set(side * 0.06, 0.025, 0.072);
    eye.scale.set(0.035, 0.014, 0.01);
    eye.rotation.set(0, side * 0.3, side * 0.35);
    head.add(eye);
  }

  const shades = wyrmShades(color);
  const plates = GEO.plates.map((geometry, i) => {
    const hue = shades[i];
    const plate = new Group().add(sharpPart(geometry, hue, flash));
    const packet = new MeshBasicMaterial();
    packet.userData.color = hue;
    const cube = new Mesh(GEO.packet, packet);
    cube.position.y = WYRM.plates[i] + 0.04;
    cube.rotation.set(Math.PI / 4, 0, Math.PI / 4);
    plate.add(cube);
    plate.userData.packet = packet;
    return plate;
  });

  const group = new Group().add(head, ...plates);
  Object.assign(group.userData, { head, jaw, plates, eyes, flash, glow: WYRM.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * The colors of its plates, head to tail: shades of its body color, the
 * hue swinging a little either way from plate to plate and the lightness
 * falling towards the tail.
 * @param {number|string} color
 * @returns {Color[]}
 */
export function wyrmShades(color) {
  const { plates, shade } = WYRM;
  return plates.map((_, i) => {
    const k = (i + 1) / plates.length;
    return new Color(color).offsetHSL((i % 2 ? -1 : 1) * shade.hue, 0, -shade.darken * k);
  });
}

/**
 * Where its head and each plate are at `phase` (radians of its wave):
 * [x, y, z] of each middle, head first.
 * @param {number} phase
 */
export function wyrmSpine(phase) {
  const { plates, gap, wave, height } = WYRM;
  const parts = [[0, height, 0]];
  let z = -0.07;
  plates.forEach((r, i) => {
    const k = i + 1;
    z -= i === 0 ? r : gap;
    const grow = 0.4 + (0.6 * k) / plates.length;
    parts.push([Math.sin(phase * 0.5 - k * wave.lag) * wave.width * grow, height + Math.sin(phase - k * wave.lag) * wave.height * grow, z]);
  });
  return parts;
}

/**
 * Pose it for this frame.
 * @param {Group} wyrm from createWyrm()
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
export function animateWyrm(wyrm, { time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { head, jaw, plates } = wyrm.userData;
  const look = dischargeLook(attack, charge);
  const rate = WYRM.idleRate + (WYRM.alertRate - WYRM.idleRate) * alert;
  const phase = time * rate * Math.PI * 2;
  const spine = wyrmSpine(phase);
  const jolt = Math.floor(time * 30);
  const shake = look.shake * (hash(jolt, 6) - 0.5) * 2;

  // The head rides the wave's crest, rises while alert and snaps forward to fire.
  const [, hy] = spine[0];
  const bob = Math.sin(phase) * WYRM.wave.height * 0.3;
  const snap = look.discharging ? 0.08 : -0.04 * look.charge;
  head.position.set(shift + shake, hy + bob + WYRM.rise * alert, snap);
  head.rotation.x = -0.25 * look.charge + (look.discharging ? 0.2 : 0) - 0.1 * alert;
  head.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  jaw.rotation.x = look.discharging ? WYRM.jaw : WYRM.jaw * look.charge * look.charge;

  // Each plate faces the one before it; packets light up tail to head while charging.
  const [calm, lit] = WYRM.packetGlow;
  plates.forEach((plate, i) => {
    const [x, y, z] = spine[i + 1];
    const [px, py, pz] = i === 0 ? [head.position.x, head.position.y, 0] : spine[i];
    plate.position.set(x + shift * (1 - i / plates.length), y, z);
    plate.rotation.set(-Math.atan2(py - y, Math.hypot(px - x, pz - z)), Math.atan2(px - x, pz - z), 0, 'YXZ');
    const on = look.discharging || look.charge * plates.length > plates.length - 1 - i;
    const pulse = 0.4 * Math.sin(time * 4 - i * 0.9);
    plate.userData.packet.color.copy(plate.userData.packet.userData.color).multiplyScalar(on ? lit : calm + pulse);
  });
  glowEyes(wyrm, flaredGlow(WYRM.eyeGlow, alert, look.charge));
}

/** Everything EnemyView needs to show a wyrm (see BUG_MODEL in bug.js). */
export const WYRM_MODEL = {
  create: createWyrm,
  setMood,
  animate: animateWyrm,
  derez: WYRM.derez,
  turnRate: WYRM.turnRate,
  markHeight: WYRM.markHeight,
  muzzle: 0.26,
};
