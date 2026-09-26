/**
 * How the Zap spell looks (pure, tested; no three.js): the flare at the
 * wizard's hands when he casts, the bolt (a white-hot core in a cyan halo
 * dragging a crackling zigzag trail), the sparks where it stops, and an
 * enemy getting hit: a white flash with a recoil squash, then, while it is
 * damaged but alive, a glitch now and then.
 *
 * Bolt shapes are in the bolt's own frame: it flies along +z, the trail
 * runs back along −z from its core.
 */

import { BOLT } from '../entities/bolt.js';
import { hash } from './hash.js';

/** Timing in ticks, sizes in units. */
export const ZAP_FX = {
  /** Height of the bolt and the cast flare above the wizard's feet (his hands). */
  height: BOLT.height,
  /** How far in front of his feet center they start. */
  reach: BOLT.reach,
  /** The bolt's white core and the cyan halo around it (length along the flight). */
  core: { length: 0.3, width: 0.08 },
  halo: { length: 0.5, width: 0.2 },
  /** Crackling trail: zigzag points, their sideways jitter, prebuilt variants swapped every flickerTicks. */
  trail: { length: 1.1, kinks: 6, jitter: 0.09, variants: 4, flickerTicks: 2 },
  /** Flare at the hands when casting: ticks, largest radius. */
  cast: { ticks: 10, size: 0.2 },
  /** Sparks where the bolt stops. */
  sparks: { pixels: 16, pixelSize: 0.05, ticks: 20, speed: 0.9, fall: 0.5 },
  /** An enemy hit: white-hot ticks, then flashing cyan until flashTicks; recoil squash. */
  hit: { hotTicks: 3, flashTicks: 12, squashTicks: 14, squash: 0.3 },
  /** A damaged enemy glitches once per `every` ticks, for `ticks` ticks, shifted sideways by `shift`. */
  glitch: { every: 50, ticks: 4, shift: 0.06, flash: 0.45 },
};

/**
 * The trail's zigzag for one variant: points from the core (z = 0) back to
 * the tail (z = −length), each kink pushed sideways and up or down a little,
 * most in the middle; both ends stay on the flight line.
 * @param {number} variant 0..trail.variants − 1
 * @returns {number[][]} points [x, y, z]
 */
export function trailPoints(variant) {
  const { length, kinks, jitter } = ZAP_FX.trail;
  const points = [];
  for (let i = 0; i <= kinks; i++) {
    const t = i / kinks;
    const swing = i === 0 || i === kinks ? 0 : jitter * Math.sin(t * Math.PI) * 1.6;
    points.push([(hash(i, variant * 2) - 0.5) * 2 * swing, (hash(i, variant * 2 + 1) - 0.5) * swing, -t * length]);
  }
  return points;
}

/**
 * The bolt this frame.
 * @param {number} age ticks since it was cast (may be fractional)
 * @param {number} traveled units flown so far
 * @returns {{ variant: number, trail: number, pulse: number }} which trail
 *   variant shows, how much of the trail's length (0..1: it grows out of
 *   the hands), and the core's size pulse (about 1)
 */
export function boltLook(age, traveled) {
  const { length, variants, flickerTicks } = ZAP_FX.trail;
  return {
    variant: Math.floor(age / flickerTicks) % variants,
    trail: Math.min(1, traveled / length),
    pulse: 1 + 0.15 * Math.sin(age * 1.9),
  };
}

/**
 * The flare at the hands `tick` ticks after casting: its radius, flaring
 * up at once and shrinking away; 0 when it is over.
 * @param {number} tick
 */
export function castFlare(tick) {
  const { ticks, size } = ZAP_FX.cast;
  if (tick < 0 || tick >= ticks) return 0;
  const t = tick / ticks;
  return size * (t < 0.2 ? 0.6 + 2 * t : 1 - (t - 0.2) / 0.8);
}

/**
 * The sparks `tick` ticks after the bolt stopped: pixels flying back out of
 * the impact (against the flight, −z, and to the sides), falling a little
 * and shrinking to nothing.
 * @param {number} tick may be fractional
 * @returns {{ offset: number[], scale: number }[]} offsets from the impact
 *   in the bolt's frame; empty once they are over
 */
export function sparkPixels(tick) {
  const { pixels, ticks, speed, fall } = ZAP_FX.sparks;
  if (tick < 0 || tick >= ticks) return [];
  const t = tick / ticks;
  const out = [];
  for (let i = 0; i < pixels; i++) {
    // A cone opening backwards: angle around the flight line, and how far off it.
    const around = hash(i, 5) * Math.PI * 2;
    const off = 0.3 + hash(i, 6) * 1.1;
    const d = speed * (0.4 + hash(i, 7) * 0.6) * Math.sqrt(t);
    const dir = [Math.sin(off) * Math.cos(around), Math.sin(off) * Math.sin(around), -Math.cos(off)];
    out.push({
      offset: [dir[0] * d, dir[1] * d - fall * t * t, dir[2] * d],
      scale: 1 - t,
    });
  }
  return out;
}

/**
 * An enemy `tick` ticks after a Zap hit it: its hologram flash (white-hot,
 * then cyan fading out) and an extra squash, flattened at once and
 * springing back.
 * @param {number|null} tick null when it was never hit
 * @returns {{ flash: number, color: 'white'|'cyan', squash: number }}
 */
export function enemyHitLook(tick) {
  const { hotTicks, flashTicks, squashTicks, squash } = ZAP_FX.hit;
  const look = { flash: 0, color: 'white', squash: 0 };
  if (tick === null || tick < 0) return look;
  if (tick < hotTicks) look.flash = 1;
  else if (tick < flashTicks) Object.assign(look, { flash: 0.8 * (1 - (tick - hotTicks) / (flashTicks - hotTicks)), color: 'cyan' });
  if (tick < squashTicks) {
    const t = tick / squashTicks;
    look.squash = squash * (1 - t) * Math.cos(t * Math.PI * 2);
  }
  return look;
}

/**
 * A damaged enemy's glitch at `tick` (its own clock): now and then, for a
 * few ticks, it jumps sideways and flashes faintly. Each enemy has its own
 * `seed`, so they don't glitch in step.
 * @param {number} tick
 * @param {number} seed any number, e.g. the enemy's index
 * @returns {{ shift: number, flash: number }} sideways shift (units) and
 *   flash amount; both 0 between glitches
 */
export function damagedGlitch(tick, seed) {
  const { every, ticks, shift, flash } = ZAP_FX.glitch;
  const offset = Math.floor(hash(seed, 9) * every);
  const phase = (((Math.floor(tick) + offset) % every) + every) % every;
  if (phase >= ticks) return { shift: 0, flash: 0 };
  const side = phase % 2 === 0 ? 1 : -1;
  return { shift: side * shift, flash };
}
