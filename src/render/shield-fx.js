/**
 * How the Shield spell looks (D73; pure, tested; no three.js): a jagged
 * ring of lightning round the wizard at hand height, a double line (the
 * spell's color outside, white-hot inside), turning slowly and flickering.
 * The zigzag comes in a few prebuilt variants swapped every flickerTicks,
 * like the Zap trail. It pops up in a few ticks and blinks before it ends.
 */
import { hash } from './hash.js';

/** Timing in ticks, sizes in units. */
export const SHIELD_FX = {
  /** Ring radius and height above his feet. */
  radius: 0.55,
  y: 0.55,
  /** Zigzag points round the circle, their jitter (in and out, up and down), prebuilt variants. */
  kinks: 28,
  jitter: 0.07,
  variants: 4,
  flickerTicks: 2,
  /** Turning speed, radians per tick. */
  turn: 0.02,
  /** Ticks it takes to pop up; blinking in the last `warnTicks`, every `blinkTicks`. */
  growTicks: 6,
  warnTicks: 40,
  blinkTicks: 4,
};

const SEED = [211.7, 97.3];

/**
 * The jagged circle for one variant, in the xz plane round the origin, as a
 * closed list of points [x, y, z].
 * @param {number} variant 0..variants − 1
 */
export function arcPoints(variant) {
  const { kinks, jitter, radius } = SHIELD_FX;
  const points = [];
  for (let i = 0; i < kinks; i++) {
    const angle = (i / kinks) * Math.PI * 2;
    const out = (hash(i, variant * 3, SEED) - 0.5) * 2 * jitter;
    const up = (hash(i, variant * 3 + 1, SEED) - 0.5) * 2 * jitter;
    points.push([Math.cos(angle) * (radius + out), up, Math.sin(angle) * (radius + out)]);
  }
  return points;
}

/**
 * The shield `tick` ticks after casting, lasting `ticks` in all.
 * @param {number} tick may be fractional
 * @param {number} ticks its duration
 * @returns {{ visible: boolean, scale: number, variant: number, angle: number, glow: number }}
 *   scale: popping up 0..1; variant: which zigzag shows; angle: turn in
 *   radians; glow: brightness 0..1 (flickers)
 */
export function shieldLook(tick, ticks) {
  const { growTicks, warnTicks, blinkTicks, flickerTicks, variants, turn } = SHIELD_FX;
  const off = { visible: false, scale: 0, variant: 0, angle: 0, glow: 0 };
  if (tick < 0 || tick >= ticks) return off;
  const left = ticks - tick;
  if (left < warnTicks && Math.floor(left / blinkTicks) % 2 === 1) return off;
  const k = Math.min(1, tick / growTicks);
  const step = Math.floor(tick / flickerTicks);
  return {
    visible: true,
    scale: 1 - (1 - k) * (1 - k),
    variant: step % variants,
    angle: tick * turn,
    glow: 0.75 + 0.25 * hash(step, 9, SEED),
  };
}
