/**
 * The wizard's body language: a walk cycle (the head bobs at each step, the
 * hands swing), an idle float (breathing, drifting hands, a blink now and
 * then), a stretch in the air with the hands up, a squash on landing, and a
 * floppy hat on a spring that trails his motion and wobbles when he stops.
 * Actions take over the hands: pushing (hands flat on the crate, leaning
 * in), casting (both hands thrust the way the spell goes) and falling into
 * a hole (flailing, the hat lifting off).
 *
 * Visual only: it poses the parts of createWizard()'s rig and never touches
 * the hitbox or the game state. The pose and the spring are pure (tested);
 * WizardMotion keeps the few numbers that carry over between frames.
 */
import { BOLT } from '../entities/bolt.js';
import { JUMP_SPEED, PLAYER } from '../entities/player.js';
import { hash } from './hash.js';
import { WIZARD } from './wizard.js';

/** Tuning: lengths in units, angles in radians, times in seconds. */
export const MOTION = {
  /** Distance of one walk cycle (two steps), so the steps match his speed. */
  stride: 1.1,
  /** Head dip and body squash at each step. */
  bob: 0.03,
  bodySquash: 0.04,
  /** Hands swinging forward and back while walking, rising a little at the ends. */
  swing: 0.09,
  swingLift: 0.025,
  /** Forward lean while walking. */
  lean: 0.08,
  /** How fast the walk and the air pose blend in and out, per second. */
  blend: 10,
  /** Standing: breathing (height share), hands drifting up and down. */
  breathe: { rate: 0.4, depth: 0.012 },
  float: { rate: 0.6, height: 0.025 },
  /** A blink somewhere in every `every` seconds, closed for `length`. */
  blink: { every: 3.4, length: 0.14 },
  /** In the air: hands up and out, stretched while fast (at jump speed). */
  air: { handLift: 0.08, handOut: 0.04, stretch: 0.08 },
  /** Landing: squashed flat, springing back through a small stretch. */
  land: { time: 0.22, depth: 0.14 },
  /**
   * The hat's spring: tilt per unit/s of his speed (trailing), the most it
   * tilts, stiffness and damping (underdamped: it overshoots and wobbles),
   * and the kick it gets on landing (radians per second, tipping back).
   */
  hat: { trail: 0.05, max: 0.35, stiffness: 160, damping: 8, landKick: 2.2 },
  /**
   * Pushing: where the hands go (|x|, y, z from his feet center, before the
   * lean, which carries them onto the crate's face just past his hitbox),
   * the lean, and slow straining steps (cycles per second) while the crate
   * doesn't give yet.
   */
  push: { hand: [0.17, 0.58, 0.2], lean: 0.2, steps: 1.4 },
  /**
   * Casting, in ticks after the cast: the hands thrust out by `out`, hold
   * until `hold`, and are back by `back`. They meet where the bolt starts
   * (BOLT.reach, BOLT.height), `apart` from each other.
   */
  cast: { out: 3, hold: 6, back: 18, apart: 0.09 },
  /**
   * Falling into a hole: hands high and waving (cycles per second), the
   * body rocking side to side, the hat lifting off the head. It blends in
   * faster than the rest (per second): the drop is over in a moment.
   */
  flail: { blend: 30, rate: 3.2, handLift: 0.3, wave: 0.12, rock: 0.14, hatLift: 0.12 },
};

/** Longest spring step, so a slow frame never makes the hat explode. */
const SPRING_STEP = 1 / 120;
/** A move longer than this in one frame is a jump cut (respawn, Warp), not motion. */
const TELEPORT = 0.5;

/**
 * One spring step towards `target` (pure; semi-implicit Euler, split into
 * short steps).
 * @param {{ x: number, v: number }} state position and velocity
 * @param {number} target
 * @param {number} dt seconds
 * @param {{ stiffness: number, damping: number }} [spring]
 * @returns {{ x: number, v: number }}
 */
export function springStep({ x, v }, target, dt, { stiffness, damping } = MOTION.hat) {
  for (let left = dt; left > 0; left -= SPRING_STEP) {
    const h = Math.min(left, SPRING_STEP);
    v += (stiffness * (target - x) - damping * v) * h;
    x += v * h;
  }
  return { x, v };
}

/**
 * The landing squash `t` seconds after touching down: flattened at once,
 * springing back through a little stretch (negative). 0 before and after.
 * @param {number|null} t
 */
export function landSquash(t) {
  const { time, depth } = MOTION.land;
  if (t === null || t < 0 || t >= time) return 0;
  const k = t / time;
  return depth * (1 - k) * Math.cos(k * Math.PI * 1.5);
}

/**
 * How open his eyes are at `time` (1 open, 0 shut): one quick blink at a
 * different moment in each stretch of MOTION.blink.every seconds.
 * @param {number} time
 */
export function eyesOpen(time) {
  const { every, length } = MOTION.blink;
  const n = Math.floor(time / every);
  const t = time - n * every - hash(n, 7) * (every - length);
  return t < 0 || t >= length ? 1 : 1 - Math.sin((t / length) * Math.PI);
}

/** Where each hand rests (left, right), as WIZARD.hands places them. */
const HAND_REST = [-1, 1].map((side) => [side * WIZARD.hands.x, WIZARD.hands.y, WIZARD.hands.z]);

/**
 * How far the hands are thrust out `tick` ticks after a cast (0..1): fast
 * out, a short hold, eased back. 0 when there is no cast.
 * @param {number|null} tick
 */
export function castReach(tick) {
  const { out, hold, back } = MOTION.cast;
  if (tick === null || tick < 0 || tick >= back) return 0;
  if (tick < out) return Math.sin((tick / out) * (Math.PI / 2));
  if (tick < hold) return 1;
  const t = (tick - hold) / (back - hold);
  return 1 - t * t * (3 - 2 * t);
}

/** Blend hand offsets `a` towards `b` by `k`. */
const mix = (a, b, k) => a.map((hand, i) => hand.map((v, j) => v + (b[i][j] - v) * k));

/**
 * The pose for one frame (pure).
 * @param {object} state
 * @param {number} state.phase walk cycles so far (one cycle: two steps)
 * @param {number} state.walk 0..1, how much he walks
 * @param {number} state.air 0..1, how much he is in the air
 * @param {number} state.speed 0..1, his vertical speed as a share of the jump speed
 * @param {number|null} state.landed seconds since he landed, or null
 * @param {number} state.time seconds, for the idle float and the blink
 * @param {number} [state.push] 0..1, how much he pushes
 * @param {number|null} [state.cast] ticks since his last cast, or null
 * @param {number} [state.aim] angle of the cast relative to where he faces
 * @param {number} [state.flail] 0..1, how much he flails (falling into a hole)
 * @returns {{ scale: number[], lean: number, roll: number, headY: number, hatLift: number, hands: number[][], eyes: number }}
 *   the rig's scale, forward lean and sideways rock, the head's and the
 *   hat's lift, each hand's offset from its rest place (left, right) and
 *   how open the eyes are
 */
export function wizardPose({ phase, walk, air, speed, landed, time, push = 0, cast = null, aim = 0, flail = 0 }) {
  const m = MOTION;
  const still = (1 - walk) * (1 - air);
  const swing = Math.sin(phase * 2 * Math.PI);
  // Lowest at each step, where the hands are furthest out.
  const bob = (1 - Math.cos(phase * 4 * Math.PI)) / 2;

  let height = 1 - m.bodySquash * bob * walk;
  height *= 1 + m.breathe.depth * Math.sin(time * m.breathe.rate * 2 * Math.PI) * still;
  height *= 1 + m.air.stretch * Math.min(1, Math.abs(speed)) * air;
  const squash = landSquash(landed);
  height *= 1 - squash;
  const width = 1 / Math.sqrt(height);

  let hands = [-1, 1].map((side, i) => {
    const float = m.float.height * Math.sin((time * m.float.rate + i * 0.5) * 2 * Math.PI) * still;
    return [
      side * m.air.handOut * air,
      m.swingLift * Math.abs(swing) * walk + float + m.air.handLift * air,
      -side * m.swing * swing * walk,
    ];
  });

  // Actions take the hands in turn: a push, over it a cast, over all a flail.
  if (push > 0) {
    const [x, y, z] = m.push.hand;
    hands = mix(hands, [-1, 1].map((side, i) => [side * x - HAND_REST[i][0], y - HAND_REST[i][1], z - HAND_REST[i][2]]), push);
  }
  const thrust = castReach(cast);
  if (thrust > 0) {
    const [fx, fz] = [Math.sin(aim), Math.cos(aim)];
    const target = [-1, 1].map((side, i) => {
      const x = fx * BOLT.reach + fz * side * m.cast.apart;
      const z = fz * BOLT.reach - fx * side * m.cast.apart;
      return [x - HAND_REST[i][0], BOLT.height - HAND_REST[i][1], z - HAND_REST[i][2]];
    });
    hands = mix(hands, target, thrust);
  }
  if (flail > 0) {
    const wave = Math.sin(time * m.flail.rate * 2 * Math.PI);
    const target = [-1, 1].map((side) => [side * m.air.handOut, m.flail.handLift + side * wave * m.flail.wave, side * wave * m.flail.wave * 0.5]);
    hands = mix(hands, target, flail);
  }

  return {
    scale: [width, height, width],
    lean: (m.lean * walk * (1 - air)) * (1 - push) + m.push.lean * push,
    roll: m.flail.rock * Math.sin(time * m.flail.rate * Math.PI) * flail,
    headY: -m.bob * bob * walk,
    hatLift: m.flail.hatLift * flail,
    hands,
    eyes: eyesOpen(time),
  };
}

/**
 * Animates one wizard model from frame to frame. Feed update() where he is
 * (interpolated) and what he does; it poses the rig.
 */
export class WizardMotion {
  /** @param {import('three').Group} model from createWizard() */
  constructor(model) {
    this.rig = model.userData.rig;
    this.reset();
  }

  /** Forget the motion so far (e.g. after a respawn): standing still. */
  reset() {
    this.last = null;
    this.phase = 0;
    this.walk = 0;
    this.air = 0;
    this.push = 0;
    this.flail = 0;
    this.grounded = true;
    this.landed = null;
    this.pitch = { x: 0, v: 0 };
    this.roll = { x: 0, v: 0 };
  }

  /**
   * @param {object} frame
   * @param {number} frame.dt seconds since the last frame
   * @param {number} frame.time seconds
   * @param {number[]} frame.pos his feet
   * @param {number} frame.facing angle he looks at (as rotation.y)
   * @param {boolean} frame.grounded
   * @param {boolean} frame.moving walking (input held)
   * @param {number} frame.vy vertical speed in units per second
   * @param {boolean} [frame.pushing] walking into a crate lined up to push
   * @param {number|null} [frame.cast] ticks since his last cast, or null
   * @param {number} [frame.aim] angle the cast goes (as rotation.y)
   * @param {boolean} [frame.falling] falling into a hole (dead)
   */
  update({ dt, time, pos, facing, grounded, moving, vy, pushing = false, cast = null, aim = facing, falling = false }) {
    const { hat } = MOTION;
    const dx = this.last ? pos[0] - this.last[0] : 0;
    const dz = this.last ? pos[2] - this.last[2] : 0;
    const cut = Math.hypot(dx, dz, this.last ? pos[1] - this.last[1] : 0) > TELEPORT;
    this.last = [...pos];
    const moved = cut ? 0 : Math.hypot(dx, dz);

    // Steps follow the distance walked (never more than walking speed, so
    // riding a platform doesn't make him run).
    if (grounded && moving) this.phase += Math.min(moved, PLAYER.speed * dt * 1.5) / MOTION.stride;
    // Straining against a crate that doesn't give yet: slow steps on the spot.
    if (pushing && moved < PLAYER.speed * dt * 0.5) this.phase += MOTION.push.steps * dt;
    const k = Math.min(1, dt * MOTION.blend);
    this.walk += ((grounded && moving ? 1 : 0) - this.walk) * k;
    this.air += ((grounded ? 0 : 1) - this.air) * k;
    this.push += ((pushing ? 1 : 0) - this.push) * k;
    this.flail += ((falling ? 1 : 0) - this.flail) * Math.min(1, dt * MOTION.flail.blend);
    if (grounded && !this.grounded) {
      this.landed = 0;
      this.pitch.v -= hat.landKick;
    } else if (this.landed !== null) this.landed += dt;
    this.grounded = grounded;

    // The hat trails his motion, in his own frame: forward speed tips it
    // back, sideways speed tips it the other way.
    if (dt > 0) {
      const vx = cut ? 0 : dx / dt;
      const vz = cut ? 0 : dz / dt;
      const forward = vx * Math.sin(facing) + vz * Math.cos(facing);
      const side = vx * Math.cos(facing) - vz * Math.sin(facing);
      const clamp = (a) => Math.max(-hat.max, Math.min(hat.max, a));
      this.pitch = springStep(this.pitch, clamp(-hat.trail * forward), dt);
      this.roll = springStep(this.roll, clamp(hat.trail * side), dt);
    }

    const aimed = Math.atan2(Math.sin(aim - facing), Math.cos(aim - facing));
    const pose = wizardPose({
      phase: this.phase,
      walk: this.walk,
      air: this.air,
      speed: vy / JUMP_SPEED,
      landed: this.landed,
      time,
      push: this.push,
      cast,
      aim: aimed,
      flail: this.flail,
    });
    const { rig, head, hands, eyes } = this.rig;
    rig.scale.set(...pose.scale);
    rig.rotation.x = pose.lean;
    rig.rotation.z = pose.roll;
    head.position.y = pose.headY;
    this.rig.hat.position.y = WIZARD.brim.y + pose.hatLift;
    hands.forEach((hand, i) => hand.position.set(...pose.hands[i]));
    this.rig.hat.rotation.x = -WIZARD.hatTilt + this.pitch.x;
    this.rig.hat.rotation.z = this.roll.x;
    for (const eye of eyes) eye.scale.y = WIZARD.eyes.size[1] * Math.max(0.1, pose.eyes);
  }
}
