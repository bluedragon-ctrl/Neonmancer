/**
 * How Compile looks (D125; pure, tested; no three.js), with
 * compile-view.js.
 *
 * Bits in the spell's gold fly from the wizard's hands into the cell in
 * front of him, each to its own point of a lattice through the cell,
 * while the crate grows in there with a flicker, as a collapsing block
 * recompiles (collapse-fx.js). Before it derezzes the crate blinks, faster
 * at the end, then derezzes like anything else (derez-fx.js). While the
 * spell is selected, a dim marquee marks the cell a cast would fill (the
 * aim marker).
 */
import { PLAYER } from '../entities/player.js';
import { hash } from './hash.js';

/** Timing in ticks (the bits fly for PLAYER.compileTicks), sizes in units. */
export const COMPILE_FX = {
  /** Ticks one bit takes from his hands to the cell; the last leaves `stagger` ticks after the first. */
  flyTicks: 12,
  stagger: 6,
  /** The edge of a bit. */
  pixelSize: 0.08,
  /** How high a bit arcs on its way. */
  arc: 0.35,
  /** Ticks the crate takes to grow in, with a flicker, from `growFrom` of its size. */
  growTicks: 14,
  growFrom: 0.3,
  /** Ticks before it derezzes that it blinks, the last `fastTicks` of them faster; ticks per blink. */
  blinkTicks: 120,
  fastTicks: 40,
  blinkPeriod: 12,
  fastPeriod: 4,
  /** The aim marker's marquee round the cell, and its brightness. */
  aimMarquee: 1.06,
  aimBrightness: 0.8,
};

/** Seed of this effect's hash() sequence. */
const SEED = [37.9, 511.3];

/** Where the bits end: every other point (a checkerboard) of a 3×3×3 lattice through the cell. */
const LATTICE = [];
for (let x = 0; x < 3; x++)
  for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) if ((x + y + z) % 2 === 0) LATTICE.push([x, y, z].map((v) => (v + 0.5) / 3));

/** Bits in a compile. */
export const COMPILE_PIXELS = LATTICE.length;

/** Smoothstep of t, clamped to 0..1. */
function ease(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * The bits `tick` ticks after a compile: each leaves his hands at its own
 * time within the stagger, arcs into its lattice point of the cell and
 * shrinks away as it arrives.
 * @param {number} tick may be fractional
 * @param {number[]} hands where his hands are now
 * @param {number[]} cell the cell's lower corner [x, y, z]
 * @returns {{ offset: number[], scale: number }[]} world positions, always
 *   COMPILE_PIXELS of them (scale 0: not shown)
 */
export function compilePixels(tick, hands, cell) {
  const { flyTicks, stagger, arc } = COMPILE_FX;
  return LATTICE.map((point, i) => {
    const u = (tick - hash(i, 0, SEED) * stagger) / flyTicks;
    const end = point.map((v, k) => cell[k] + v);
    if (u < 0 || u >= 1 || tick >= PLAYER.compileTicks) return { offset: end, scale: 0 };
    const along = ease(u);
    const offset = end.map((v, k) => hands[k] + (v - hands[k]) * along + (k === 1 ? arc * Math.sin(Math.PI * u) : 0));
    return { offset, scale: Math.min(1, (1 - u) * 3) };
  });
}

/**
 * How a compiled crate is drawn: growing in with a flicker after it
 * appeared, blinking before it derezzes, whole in between.
 * @param {number} age ticks since it was compiled (may be fractional)
 * @param {number} ticksLeft ticks before it derezzes
 * @returns {{ visible: boolean, scale: number }} scale round its middle
 */
export function compileLook(age, ticksLeft) {
  const { growTicks, growFrom, blinkTicks, fastTicks, blinkPeriod, fastPeriod } = COMPILE_FX;
  if (age < growTicks) {
    const t = age / growTicks;
    return { visible: Math.floor(age / 2) % 2 === 0 || t > 0.6, scale: growFrom + (1 - growFrom) * t * (2 - t) };
  }
  if (ticksLeft < blinkTicks) {
    const period = ticksLeft < fastTicks ? fastPeriod : blinkPeriod;
    return { visible: Math.floor(ticksLeft / period) % 2 === 0, scale: 1 };
  }
  return { visible: true, scale: 1 };
}
