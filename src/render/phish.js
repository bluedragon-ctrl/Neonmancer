/**
 * The phish model, a mimic: a fake data disk that is a trap, in the
 * hologram look (D22) once it springs. An enemy look (D107); no
 * defs.json template uses it yet, a room picks it with `look`. Meant for a chaser with a
 * short aggro range and a touch attack, in the secret-heavy sectors.
 *
 * Calm, it is a data disk (disk.js), hovering and spinning, but its one lit
 * bit is red, it bobs out of step with real disks and now and then it
 * glitches sideways: the tells. After the wizard (`alert`) it springs: it
 * stops spinning and turns to him, drops on four jointed legs, eye stalks
 * pop out of its clipped corners and a jaw of red teeth opens under it,
 * chomping. It scuttles on its legs while it chases.
 *
 * The model stands on y = 0 around the y axis and looks along +z, the
 * disk's width (0.6).
 */
import { ConeGeometry, CylinderGeometry, BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { DISK, createDisk } from './disk.js';
import { dischargeLook } from './discharge.js';
import { EYE, flaredGlow, glowEyes, popBurst, setMood } from './enemy-look.js';
import { hash } from './hash.js';
import { createFlash, holoPart, sharpGeometry, sharpPart } from './holo.js';
import { PALETTE, shared } from './neon.js';

/** Proportions (world units) and animation tuning. */
export const PHISH = {
  /** The lit bit of its fake disk (a spell slot that looks plausible). */
  slot: 5,
  /** Out of step with real disks (DISK.bobPeriod), seconds. */
  bobPeriod: 1.6,
  /** The glitch: every so many seconds, for so long, this far sideways. */
  glitch: { every: 2.7, lasts: 0.12, shift: 0.04 },
  /** Its disk's middle once it stands on its legs. */
  stand: 0.47,
  /** Legs: hips out along the bottom edge, knee out and up, feet out and in depth. */
  leg: { hip: 0.22, knee: [0.14, 0.12], foot: [0.4, 0.16], lift: 0.07, stride: 0.08 },
  /** Eye stalks: how tall, from the top corners. */
  stalk: 0.14,
  /** Jaw: how far it drops open, chomps per second while alert. */
  jaw: { drop: 0.07, rate: 3 },
  teeth: 6,
  eyeGlow: { calm: 2.4, alert: 4.5 },
  markHeight: 1.15,
  turnRate: 7,
  pop: { pixels: 30, pixelSize: 0.06, ticks: 36, spread: 0.9, rise: 0.7 },
};

const S = DISK.size / 2;

const GEO = {
  segment: shared(new CylinderGeometry(0.018, 0.014, 1, 6)),
  stalk: shared(new CylinderGeometry(0.012, 0.012, 1, 6)),
  tooth: sharpGeometry(new ConeGeometry(0.025, 0.06, 4)),
  jaw: sharpGeometry(new BoxGeometry(DISK.size * 0.8, 0.03, 0.08)),
};

const UP = new Vector3(0, 1, 0);
const dir = new Vector3();
const turn = new Quaternion();

/** Stretch a unit-long y-axis part from `a` to `b`. */
function span(part, a, b) {
  dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = dir.length();
  part.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  part.quaternion.copy(turn.setFromUnitVectors(UP, dir.normalize()));
  part.scale.set(1, Math.max(length, 1e-4), 1);
}

/**
 * A phish as a three.js group (origin at the feet center, looking along
 * +z). `userData.disk` is its fake disk (disk.js), `userData.legs` four
 * legs of two segments, `userData.stalks` its eye stalks, `userData.jaw`
 * its lower jaw, `userData.teeth` the upper teeth, `userData.eyes` the eye
 * material, `userData.flash` its flash uniforms (holo.js).
 * @param {number|string} color
 */
export function createPhish(color) {
  const flash = createFlash();
  const disk = createDisk({ color: PALETTE.danger, slot: PHISH.slot });

  const legs = [];
  for (const side of [-1, 1]) {
    for (const depth of [-1, 1]) {
      const thigh = holoPart(GEO.segment, color, flash);
      const shin = holoPart(GEO.segment, color, flash);
      legs.push({ side, depth, thigh, shin });
    }
  }

  // Red teeth: hanging from its bottom edge, and standing on the jaw.
  const toothRow = (down) =>
    Array.from({ length: PHISH.teeth }, (_, i) => {
      const tooth = sharpPart(GEO.tooth, PALETTE.danger, flash);
      tooth.position.x = (i - (PHISH.teeth - 1) / 2) * ((DISK.size * 0.7) / PHISH.teeth);
      if (down) tooth.rotation.x = Math.PI;
      return tooth;
    });
  const teeth = new Group().add(...toothRow(true));
  const jaw = new Group().add(sharpPart(GEO.jaw, color, flash));
  const lower = new Group().add(...toothRow(false));
  lower.position.y = 0.04;
  jaw.add(lower);

  const eyes = new MeshBasicMaterial();
  const stalks = [-1, 1].map((side) => {
    const stalk = holoPart(GEO.stalk, color, flash);
    const eye = new Mesh(EYE, eyes);
    eye.scale.set(0.035, 0.035, 0.035);
    const ball = new Group().add(eye);
    return { side, stalk, ball };
  });

  const group = new Group().add(disk, teeth, jaw, ...legs.flatMap(({ thigh, shin }) => [thigh, shin]), ...stalks.flatMap(({ stalk, ball }) => [stalk, ball]));
  Object.assign(group.userData, { disk, legs, stalks, teeth, jaw, eyes, flash, glow: PHISH.eyeGlow.calm, frozen: null });
  setMood(group, 'hostile');
  return group;
}

/**
 * Its sideways glitch at `time` (the tell while it poses as a disk): a
 * short jump every PHISH.glitch.every seconds, else 0.
 * @param {number} time seconds
 */
export function phishGlitch(time) {
  const { every, lasts, shift } = PHISH.glitch;
  const k = Math.floor(time / every);
  return time - k * every < lasts ? shift * (hash(k, 13) > 0.5 ? 1 : -1) : 0;
}

/**
 * Pose it for this frame.
 * @param {Group} phish from createPhish()
 * @param {object} state
 * @param {string} [state.state] 'rest' | 'walk' | 'fall'
 * @param {number} [state.walked] cells walked (while walking)
 * @param {number} [state.time] seconds
 * @param {number} [state.alert] 0..1, how much it is after the wizard: how far it has sprung
 * @param {number|null} [state.attack] ticks since its attack started, or null
 * @param {number} [state.charge] ticks that attack charges
 * @param {number} [state.squash] extra squash (a hit)
 * @param {number} [state.shift] sideways shift (a glitch)
 */
export function animatePhish(phish, { state = 'rest', walked = 0, time = 0, alert = 0, attack = null, charge = 36, squash = 0, shift = 0 }) {
  const data = phish.userData;
  const { disk, legs, stalks, teeth, jaw } = data;
  const look = dischargeLook(attack, charge);
  const sprung = Math.min(1, alert * 1.4);
  const ease = sprung * sprung * (3 - 2 * sprung);
  const hidden = ease < 0.02;

  // A disk: bobbing (out of step) and spinning, glitching now and then.
  const bob = DISK.hover + DISK.bob * Math.sin((time / PHISH.bobPeriod) * 2 * Math.PI);
  const y = bob + (PHISH.stand - bob) * ease;
  const x = shift + (hidden ? phishGlitch(time) : 0);
  // Springing, it stops spinning where it is and turns to face +z (both faces look alike).
  const spinning = time * DISK.turn;
  if (hidden) data.frozen = null;
  else data.frozen ??= spinning - Math.round(spinning / Math.PI) * Math.PI;
  const { spin } = disk.userData;
  spin.position.set(x, y, 0);
  spin.rotation.set(0, hidden ? spinning : data.frozen * (1 - ease), 0);
  spin.scale.set(1 + squash * 0.5, 1 - squash, 1);

  for (const part of [teeth, jaw, ...legs.flatMap(({ thigh, shin }) => [thigh, shin]), ...stalks.flatMap(({ stalk, ball }) => [stalk, ball])]) part.visible = !hidden;
  if (hidden) {
    glowEyes(phish, 0);
    return;
  }

  // Jaw: teeth slide out of its bottom edge, the jaw drops and chomps.
  const bottom = y - S;
  teeth.position.set(x, bottom - 0.025 * ease, DISK.thickness / 2);
  teeth.scale.set(1, ease, 1);
  const chomp = look.discharging ? 0 : 0.5 + 0.5 * Math.sin(time * PHISH.jaw.rate * Math.PI * 2);
  jaw.position.set(x, bottom - 0.03 - PHISH.jaw.drop * ease * (0.4 + 0.6 * chomp + look.charge), DISK.thickness / 2);
  jaw.scale.set(ease, 1, 1);

  // Legs from its bottom corners, stepping in pairs while it scuttles.
  const { hip, knee, foot, lift, stride } = PHISH.leg;
  const walking = state === 'walk';
  for (const { side, depth, thigh, shin } of legs) {
    const phase = walked * Math.PI * 4 + (side * depth > 0 ? 0 : Math.PI);
    const step = walking ? Math.sin(phase) * stride : 0;
    const up = walking ? Math.max(0, Math.cos(phase)) * lift : 0;
    const a = [x + side * hip, bottom + 0.02, depth * 0.02];
    const k = [x + side * (hip + knee[0] * ease), bottom + knee[1] * ease, depth * 0.08 * ease];
    const f = [x + side * (hip + (foot[0] - hip) * ease), (bottom + 0.02) * (1 - ease) + up, (depth * foot[1] + step) * ease];
    span(thigh, a, k);
    span(shin, k, f);
  }

  // Eye stalks pop out of the clipped top corners.
  for (const { side, stalk, ball } of stalks) {
    const base = [x + side * (S - DISK.corner / 2), y + S - DISK.corner / 2, 0];
    const top = [base[0] + side * 0.05 * ease, base[1] + PHISH.stalk * ease, 0.03 * ease];
    span(stalk, base, top);
    ball.position.set(...top);
    ball.scale.setScalar(ease);
  }
  glowEyes(phish, flaredGlow(PHISH.eyeGlow, alert, look.charge));
}

/** The pixels of it popping `tick` ticks after it died (enemy-look.js popBurst()). */
export const phishPopPixels = popBurst(PHISH.pop, { seed: 101, middle: PHISH.stand, start: 0.2, scatter: 0.4 });

/** Everything EnemyView needs to show a phish (see BUG_MODEL in bug.js). */
export const PHISH_MODEL = {
  create: createPhish,
  setMood,
  animate: animatePhish,
  popPixels: phishPopPixels,
  pop: PHISH.pop,
  turnRate: PHISH.turnRate,
  markHeight: PHISH.markHeight,
  muzzle: 0.1,
};
