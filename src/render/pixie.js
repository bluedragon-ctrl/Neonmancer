/**
 * The pixie model, a butterfly fairy whose wings are pixel displays, in
 * the hologram look (D22). An enemy look (D107); no
 * defs.json template uses it yet, a room picks it with `look`. Meant for a flier with a bolt (it
 * flings pixel dust), or a peaceful one drifting about a room.
 *
 * A slim body with a round head, two slanted eyes and two curling
 * antennae, and two pairs of wings (fore and hind) covered in a grid of
 * lit pixels in three phases that shimmer across them; pixel dust drifts
 * down behind it. It flutters, bobbing along a lazy figure eight. After
 * the wizard (`alert`) it flaps faster and the shimmer races; charging,
 * its wings fold up together over its back, every pixel lit; firing, they
 * snap open.
 *
 * The model flies around the y axis at eye height and looks along +z;
 * its wings span about the enemy hitbox (0.6).
 */
import { BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Shape, SphereGeometry } from 'three';
import { ENEMY } from '../entities/enemy.js';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const PIXIE = {
  /** How high it flies (the body's middle); its figure eight: height, width, loops per second. */
  height: ENEMY.eyeHeight + 0.05,
  loop: { height: 0.05, width: 0.04, rate: 0.35 },
  /** Wing outlines (x out, y forward) of the right wings; the left mirror them. */
  forewing: [[0, 0.03], [0.1, 0.16], [0.26, 0.21], [0.32, 0.12], [0.24, 0.01], [0.02, -0.02]],
  hindwing: [[0.02, -0.02], [0.2, -0.04], [0.25, -0.15], [0.15, -0.25], [0.04, -0.14]],
  /** The pixel grid on the wings: pitch, a pixel's size. */
  pixel: { pitch: 0.045, size: 0.028 },
  /** Flapping: rest angle, swing, flaps per second (calm, alert); folded and snapped angles. */
  flap: { rest: 0.35, swing: 0.55, rate: [2.2, 4.5], folded: 1.45, snapped: -0.35 },
  /** Shimmer phases per second (calm, alert); pixel brightness low and high. */
  shimmer: { rate: [1.2, 4], glow: [0.5, 2.6] },
  dust: { count: 5, fall: 0.4, rate: 0.5, size: 0.022 },
  eyeGlow: { calm: 2.4, alert: 4.5 },
  markHeight: 1.05,
  turnRate: 6,
  /** The body it derezzes from when it dies (derez-fx.js, D126); square, as it turns. */
  derez: { size: [0.6, 0.4, 0.6], y: 0.25 },
};

/** Is point [x, y] inside the polygon (even-odd rule)? */
function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The pixel cells of a wing outline: middles of the grid cells that lie
 * inside it with a margin, each with its shimmer phase (0, 1, 2).
 * @param {number[][]} outline
 * @returns {{ at: number[], phase: number }[]}
 */
export function wingPixels(outline) {
  const { pitch, size } = PIXIE.pixel;
  const m = size / 2 + 0.006;
  const cells = [];
  for (let col = 0; col * pitch < 0.4; col++) {
    for (let row = -8; row <= 8; row++) {
      const at = [pitch * (col + 0.5), pitch * row];
      const corners = [[-m, -m], [m, -m], [m, m], [-m, m]].map(([dx, dy]) => [at[0] + dx, at[1] + dy]);
      if (corners.every((p) => inside(p, outline))) cells.push({ at, phase: (col + Math.abs(row)) % 3 });
    }
  }
  return cells;
}

/** A thin wing slab from an outline (x out, y forward), lying flat, facing up. */
function wingGeometry(outline, side) {
  const points = side > 0 ? outline : outline.map(([x, y]) => [-x, y]).reverse();
  const geometry = new ExtrudeGeometry(new Shape(points.map(([x, y]) => ({ x, y }))), { depth: 0.012, bevelEnabled: false });
  // Shape y becomes forward (+z), the slab's thickness runs down from y = 0.
  geometry.rotateX(Math.PI / 2);
  return sharpGeometry(geometry);
}

const GEO = {
  body: shared(new CapsuleGeometry(0.035, 0.2, 6, 12).rotateX(Math.PI / 2)),
  head: shared(new SphereGeometry(0.055, 20, 12)),
  antenna: shared(new CylinderGeometry(0.008, 0.008, 1, 5)),
  knob: shared(new SphereGeometry(0.02, 8, 6)),
  wings: [1, -1].map((side) => ({ fore: wingGeometry(PIXIE.forewing, side), hind: wingGeometry(PIXIE.hindwing, side) })),
  pixel: shared(new BoxGeometry(PIXIE.pixel.size, 0.006, PIXIE.pixel.size)),
  dust: shared(new BoxGeometry(1, 1, 1)),
};

/**
 * A pixie as a three.js group (origin at the feet center, looking along
 * +z). `userData.body` flies (body, head, wings), `userData.wings` the two
 * wing holders (right, left) that flap, `userData.phases` the three pixel
 * materials, `userData.dust` its dust pixels, `userData.eyes` the eye
 * material, `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createPixie(color) {
  const flash = createFlash();
  const body = new Group();
  body.add(holoPart(GEO.body, color, flash));
  const head = holoPart(GEO.head, color, flash);
  head.position.set(0, 0.01, 0.16);
  body.add(head);

  const eyes = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, eyes);
    eye.position.set(side * 0.028, 0.02, 0.205);
    eye.scale.set(0.022, 0.016, 0.01);
    eye.rotation.set(0, side * 0.5, side * 0.35);
    body.add(eye);
  }

  // Antennae leaning forward and out, knobs glowing.
  const bright = new MeshBasicMaterial();
  bright.color.set(color).multiplyScalar(2.6);
  for (const side of [-1, 1]) {
    const antenna = new Group();
    const stalk = holoPart(GEO.antenna, color, flash);
    stalk.scale.y = 0.14;
    stalk.position.y = 0.07;
    const knob = new Mesh(GEO.knob, bright);
    knob.position.y = 0.14;
    antenna.add(stalk, knob);
    antenna.position.set(side * 0.025, 0.05, 0.18);
    antenna.rotation.set(0.7, 0, -side * 0.45);
    body.add(antenna);
  }

  // Wing pixels in three phases, in shades of its color.
  const phases = [0.1, -0.05, 0.2].map((lighten) => {
    const material = new MeshBasicMaterial();
    material.userData.color = new Color(color).offsetHSL(0, 0, lighten);
    return material;
  });
  const wingColor = new Color(color).offsetHSL(0, 0, -0.1);
  const wings = [1, -1].map((side, s) => {
    const holder = new Group();
    for (const [part, outline] of [['fore', PIXIE.forewing], ['hind', PIXIE.hindwing]]) {
      holder.add(sharpPart(GEO.wings[s][part], wingColor, flash));
      for (const { at, phase } of wingPixels(outline)) {
        const pixel = new Mesh(GEO.pixel, phases[phase]);
        pixel.position.set(side * at[0], 0.004, at[1]);
        holder.add(pixel);
      }
    }
    holder.userData.side = side;
    holder.position.x = side * 0.02;
    body.add(holder);
    return holder;
  });

  const dust = Array.from({ length: PIXIE.dust.count }, (_, i) => new Mesh(GEO.dust, phases[i % 3]));
  const group = new Group().add(body, ...dust);
  Object.assign(group.userData, { body, wings, phases, dust, eyes, flash, glow: PIXIE.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * The wings' angle (radians up from flat) at `time`: flapping about a
 * raised rest, faster while alert; folded up over its back through a
 * charge, snapped down while it fires.
 * @param {number} time seconds
 * @param {number} alert 0..1
 * @param {ReturnType<typeof dischargeLook>} look
 */
export function pixieFlap(time, alert, { charge, discharging }) {
  const { rest, swing, rate: [calm, fast], folded, snapped } = PIXIE.flap;
  if (discharging) return snapped;
  const rate = calm + (fast - calm) * alert;
  const flap = rest + swing * Math.sin(time * rate * Math.PI * 2);
  return flap + (folded - flap) * charge * charge;
}

/**
 * Pose it for this frame.
 * @param {Group} pixie from createPixie()
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
export function animatePixie(pixie, { state = 'rest', time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { body, wings, phases, dust } = pixie.userData;
  const look = dischargeLook(attack, charge);
  const jolt = Math.floor(time * 30);
  const shake = look.shake * (hash(jolt, 9) - 0.5) * 2;

  // A lazy figure eight; each flap lifts it a little.
  const { height, width, rate } = PIXIE.loop;
  const t = time * rate * Math.PI * 2;
  const angle = pixieFlap(time, alert, look);
  const lift = (angle - PIXIE.flap.rest) * 0.025;
  body.position.set(shift + shake + Math.sin(t) * width, PIXIE.height + Math.sin(t * 2) * height - lift, 0);
  body.rotation.set(state === 'walk' ? 0.12 : 0, 0, Math.sin(t) * 0.12);
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  for (const wing of wings) wing.rotation.z = wing.userData.side * angle;

  // Shimmer: the three pixel phases light up in turn; all lit at full charge.
  const [slow, fast] = PIXIE.shimmer.rate;
  const [low, high] = PIXIE.shimmer.glow;
  const shimmer = time * (slow + (fast - slow) * alert);
  phases.forEach((material, i) => {
    const wave = 0.5 + 0.5 * Math.cos((shimmer - i / 3) * Math.PI * 2);
    const glow = look.discharging ? high * 1.5 : low + (high - low) * Math.max(wave, look.charge);
    material.color.copy(material.userData.color).multiplyScalar(glow);
  });

  // Pixel dust drifts down from behind its wings.
  const { count, fall, rate: dustRate, size } = PIXIE.dust;
  dust.forEach((pixel, i) => {
    const k = (time * dustRate + i / count) % 1;
    const side = i % 2 ? 1 : -1;
    pixel.position.set(body.position.x + side * (0.08 + hash(i, 19) * 0.12), body.position.y - k * fall, -0.08 - k * 0.1);
    pixel.scale.setScalar(size * (1 - k));
  });
  glowEyes(pixie, flaredGlow(PIXIE.eyeGlow, alert, look.charge));
}

/** Everything EnemyView needs to show a pixie (see BUG_MODEL in bug.js). */
export const PIXIE_MODEL = {
  create: createPixie,
  setMood,
  animate: animatePixie,
  derez: PIXIE.derez,
  turnRate: PIXIE.turnRate,
  markHeight: PIXIE.markHeight,
  muzzle: 0.25,
};
