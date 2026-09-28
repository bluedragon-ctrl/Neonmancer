/**
 * How the Shield spell looks (D73; pure, tested; no three.js): a jagged
 * ring of lightning round the wizard at hand height, a double line (the
 * spell's color outside, white-hot inside), turning slowly and flickering.
 * The zigzag comes in a few prebuilt variants swapped every flickerTicks,
 * like the Zap trail. It pops up in a few ticks and blinks before it ends.
 * Blocking an attack flares it for a moment (D84). Firewall shares its
 * radius and timing (firewall-fx.js).
 */
import { PLAYER } from '../entities/player.js';
import { hash } from './hash.js';

/** Timing in ticks, sizes in units. */
export const SHIELD_FX = {
  /** Ring radius (the one that blocks, PLAYER.shieldRadius) and height above his feet. */
  radius: PLAYER.shieldRadius,
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
  /** A block flares it this many ticks: brighter, a little bigger. */
  flareTicks: 12,
  flareGlow: 1.6,
  flareGrow: 0.15,
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
 * @param {number|null} [sinceBlock] ticks since it last blocked an attack (D84), or null
 * @returns {{ visible: boolean, scale: number, variant: number, angle: number, glow: number }}
 *   scale: popping up 0..1 (a flare grows it a little); variant: which zigzag shows; angle: turn in
 *   radians; glow: brightness 0..1 (flickers; a flare raises it)
 */
export function shieldLook(tick, ticks, sinceBlock = null) {
  const { growTicks, warnTicks, blinkTicks, flickerTicks, variants, turn, flareTicks, flareGlow, flareGrow } = SHIELD_FX;
  const off = { visible: false, scale: 0, variant: 0, angle: 0, glow: 0 };
  if (tick < 0 || tick >= ticks) return off;
  const left = ticks - tick;
  if (left < warnTicks && Math.floor(left / blinkTicks) % 2 === 1) return off;
  const k = Math.min(1, tick / growTicks);
  const step = Math.floor(tick / flickerTicks);
  const flare = sinceBlock !== null && sinceBlock >= 0 && sinceBlock < flareTicks ? 1 - sinceBlock / flareTicks : 0;
  return {
    visible: true,
    scale: (1 - (1 - k) * (1 - k)) * (1 + flareGrow * flare),
    variant: step % variants,
    angle: tick * turn,
    glow: (0.75 + 0.25 * hash(step, 9, SEED)) * (1 + (flareGlow - 1) * flare),
  };
}
