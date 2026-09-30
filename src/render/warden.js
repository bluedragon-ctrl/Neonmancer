/**
 * The warden model, a Firewall Warden (Phase 4 guardians), a knight made
 * of firewall, in the hologram look (D22). An enemy look (D107); no
 * defs.json template uses it yet, a room picks it with `look`.
 *
 * A kite shield for a body, its front bricked like the Firewall Citadel's
 * floor, a helm with a T-slit visor (its eyes) floating over it, two
 * gauntlets at its sides and a greatsword planted point down in the right
 * one, a line of heat wavering up the blade. The brick seams breathe
 * slowly. After the wizard (`alert`) the visor flares and the sword comes
 * up to guard; charging, the sword rises overhead and the seams light up
 * row by row from the bottom; firing, it slams down (a burst would go off)
 * and the shield shakes.
 *
 * The model stands on y = 0 around the y axis and looks along +z, taller
 * than the enemy hitbox (0.6): a guardian.
 */
import { BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Shape } from 'three';
import { dischargeLook } from './discharge.js';
import { flaredGlow, glowEyes, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const WARDEN = {
  /** The shield: half width, top, where its sides start to taper, its point, thickness; its middle's height. */
  shield: { half: 0.22, top: 0.24, taper: -0.06, point: -0.3, depth: 0.06, y: 0.46 },
  helm: { y: 0.86, r: 0.13, height: 0.2 },
  /** Gauntlets: distance out to the side, height, bob. */
  hand: { x: 0.32, y: 0.46, bob: 0.02 },
  /** Sword: blade length and width. */
  blade: [0.5, 0.055],
  /** Sword angles (radians about x, 0 is straight up): planted, on guard, raised, slammed. */
  pose: { rest: Math.PI, guard: 0.35, raised: -0.7, slam: 1.7 },
  /** How high the sword hand rises while charging. */
  raise: 0.34,
  /** Seam brightness: breathing low and high, lit while charging. */
  seams: [0.9, 1.6, 4.5],
  breathRate: 0.25,
  eyeGlow: { calm: 2.6, alert: 5 },
  markHeight: 1.25,
  turnRate: 3,
  /** The body it derezzes from when it dies (derez-fx.js, D126); square, as it turns. */
  derez: { size: [0.5, 1, 0.5] },
};

const { half, top, taper, point, depth } = WARDEN.shield;
/** The shield's outline, point down. */
const OUTLINE = [[-half, top], [half, top], [half, taper], [0, point], [-half, taper]];

/** Brick rows on the shield's front, bottom to top: [bottom, top, joints' x]. */
const ROWS = [
  [-0.16, -0.06, [0]],
  [-0.06, 0.04, [-0.11, 0.11]],
  [0.04, 0.14, [0]],
  [0.14, top, [-0.11, 0.11]],
];

function shieldGeometry() {
  const shape = new Shape(OUTLINE.map(([x, y]) => ({ x, y })));
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return sharpGeometry(geometry);
}

const GEO = {
  shield: shieldGeometry(),
  helm: sharpGeometry(new CylinderGeometry(WARDEN.helm.r * 0.9, WARDEN.helm.r, WARDEN.helm.height, 8, 1, false, Math.PI / 8)),
  crest: sharpGeometry(new ConeGeometry(0.045, 0.14, 4)),
  gauntlet: sharpGeometry(new BoxGeometry(0.1, 0.12, 0.11)),
  blade: sharpGeometry(new BoxGeometry(WARDEN.blade[1], WARDEN.blade[0], 0.016)),
  guard: sharpGeometry(new BoxGeometry(0.2, 0.03, 0.04)),
  grip: shared(new CylinderGeometry(0.018, 0.018, 0.1, 8)),
  strip: shared(new BoxGeometry(1, 1, 1)),
};

/** Half the shield's width at height `y` (its local frame). */
function widthAt(y) {
  return y >= taper ? half : half * ((y - point) / (taper - point));
}

/**
 * A warden as a three.js group (origin at the feet center, looking along
 * +z). `userData.body` is the shield and helm, `userData.hands` its two
 * gauntlets, `userData.sword` the sword (in the right hand), `userData.rows`
 * one seam material per brick row (bottom first), `userData.heat` the
 * blade's heat line, `userData.eyes` the visor material, `userData.flash`
 * its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createWarden(color) {
  const flash = createFlash();
  const body = new Group();
  const shield = sharpPart(GEO.shield, color, flash);
  shield.position.set(0, WARDEN.shield.y, 0.04);

  // Brick seams on the front face, one material per row so they light up in turn.
  const front = depth / 2 + 0.003;
  const seam = 0.008;
  const rows = ROWS.map(([bottom, rowTop, joints]) => {
    const material = new MeshBasicMaterial();
    const w = widthAt(bottom) * 2 - 0.02;
    const line = new Mesh(GEO.strip, material);
    line.scale.set(w, seam, 0.004);
    line.position.set(0, bottom, front);
    shield.add(line);
    for (const x of joints) {
      const joint = new Mesh(GEO.strip, material);
      joint.scale.set(seam, rowTop - bottom, 0.004);
      joint.position.set(x, (bottom + rowTop) / 2, front);
      shield.add(joint);
    }
    return material;
  });

  const helm = new Group();
  const { y: helmY, r, height } = WARDEN.helm;
  helm.position.y = helmY;
  const crest = sharpPart(GEO.crest, color, flash);
  crest.position.y = height / 2 + 0.07;
  crest.rotation.y = Math.PI / 4;
  helm.add(sharpPart(GEO.helm, color, flash), crest);
  // The T-slit visor is its eyes.
  const eyes = new MeshBasicMaterial();
  const faceZ = r * 0.95 * Math.cos(Math.PI / 8) + 0.004;
  const bar = new Mesh(GEO.strip, eyes);
  bar.scale.set(0.17, 0.032, 0.01);
  bar.position.set(0, 0.03, faceZ);
  const slit = new Mesh(GEO.strip, eyes);
  slit.scale.set(0.032, 0.1, 0.01);
  slit.position.set(0, -0.03, faceZ);
  helm.add(bar, slit);
  body.add(shield, helm);

  const hands = [-1, 1].map((side) => {
    const hand = new Group().add(sharpPart(GEO.gauntlet, color, flash));
    hand.userData.side = side;
    return hand;
  });

  // The sword grows up (+y) from the right hand; turned about x it points down or overhead.
  const sword = new Group();
  const [length] = WARDEN.blade;
  const grip = holoPart(GEO.grip, color, flash);
  const guard = sharpPart(GEO.guard, color, flash);
  guard.position.y = 0.06;
  const blade = sharpPart(GEO.blade, color, flash);
  blade.position.y = 0.07 + length / 2;
  const heat = new MeshBasicMaterial();
  const line = new Mesh(GEO.strip, heat);
  line.scale.set(0.012, length * 0.8, 0.024);
  line.position.y = 0.07 + length * 0.45;
  sword.add(grip, guard, blade, line);
  hands[1].add(sword);

  const group = new Group().add(body, ...hands);
  Object.assign(group.userData, { body, helm, hands, sword, rows, heat, color, eyes, flash, glow: WARDEN.eyeGlow.calm });
  setMood(group, 'hostile');
  return group;
}

/**
 * The sword's angle (radians about x) for a pose: planted while calm, on
 * guard while alert, rising overhead through a charge, slammed down while
 * it fires (springing back over the discharge).
 * @param {number} alert 0..1
 * @param {ReturnType<typeof dischargeLook>} look
 */
export function swordAngle(alert, { charge, discharging }) {
  const { rest, guard, raised, slam } = WARDEN.pose;
  const idle = rest + (guard - rest) * alert;
  if (discharging) return slam;
  const ease = charge * charge * (3 - 2 * charge);
  return idle + (raised - idle) * ease;
}

/**
 * Pose it for this frame.
 * @param {Group} warden from createWarden()
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
export function animateWarden(warden, { state = 'rest', walked = 0, time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const { body, helm, hands, sword, rows, heat, color } = warden.userData;
  const look = dischargeLook(attack, charge);
  const jolt = Math.floor(time * 30);
  // A heavy sway as it walks; the shield shakes as it fires.
  const sway = state === 'walk' ? Math.sin(walked * Math.PI * 2) * 0.04 : 0;
  const shake = look.discharging ? 0.03 : look.shake;
  body.position.set(shift + shake * (hash(jolt, 1) - 0.5) * 2, Math.abs(sway) * 0.3, 0);
  body.rotation.z = sway * 0.6;
  body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  helm.position.y = WARDEN.helm.y + Math.sin(time * 1.3) * 0.01 + 0.03 * alert;

  const { x, y, bob } = WARDEN.hand;
  const ease = look.charge * look.charge * (3 - 2 * look.charge);
  for (const hand of hands) {
    const side = hand.userData.side;
    const lift = side > 0 ? WARDEN.raise * (look.discharging ? 0.3 : ease) : 0;
    hand.position.set(shift + side * x, y + Math.sin(time * 2 + side) * bob + lift, side > 0 ? 0.04 + 0.08 * alert : 0.06);
  }
  sword.rotation.x = swordAngle(alert, look);

  // Seams breathe; while charging they light up row by row from the bottom.
  const [low, high, lit] = WARDEN.seams;
  const breath = low + (high - low) * (0.5 + 0.5 * Math.sin(time * WARDEN.breathRate * Math.PI * 2));
  rows.forEach((material, i) => {
    const on = look.discharging || look.charge * rows.length > i + 0.5;
    material.color.set(color).multiplyScalar(on ? lit : breath + alert * 0.5);
  });
  heat.color.set(color).multiplyScalar(2 + 1.5 * hash(jolt >> 2, 7) + 2 * look.charge);
  glowEyes(warden, flaredGlow(WARDEN.eyeGlow, alert, look.charge));
}

/** Everything EnemyView needs to show a warden (see BUG_MODEL in bug.js). */
export const WARDEN_MODEL = {
  create: createWarden,
  setMood,
  animate: animateWarden,
  derez: WARDEN.derez,
  turnRate: WARDEN.turnRate,
  markHeight: WARDEN.markHeight,
  muzzle: 0.3,
};
