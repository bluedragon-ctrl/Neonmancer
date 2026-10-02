/**
 * Boosts (D152): small temporary rewards for simple secrets, in two kinds.
 * A functional one helps for a while and is lost when the room resets
 * (leaving it, dying); a cosmetic one only dresses the wizard and lasts until
 * a death or a reload. Neither is saved or scored. Pure data and helpers.
 */
import { DT } from '../core/loop.js';

/** Boost effects by id: functional ones run on a timer (`seconds` in defs.json), cosmetic ones don't. */
export const BOOST_EFFECTS = {
  /** Walks faster (BOOST.overdriveSpeed). */
  overdrive: { functional: true },
  /** Absorbs the next hit. */
  patch: { functional: true },
  /** Spells cost no energy. */
  overclock: { functional: true },
  /** A trail of pixels behind him. */
  sparkle: { functional: false },
  /** Hat bands cycling the hues. */
  rainbow: { functional: false },
};

/** Tuning. */
export const BOOST = {
  /** Walking speed factor of Overdrive. */
  overdriveSpeed: 1.5,
  /** Colors by effect (the pickup, its HUD tag): cyan moves, white-gold is a patch, lime is energy, magenta is the wizard (D99). */
  colors: { overdrive: '#00f0ff', patch: '#ffe23d', overclock: '#b6ff3c', sparkle: '#ff2bd6', rainbow: '#ff2bd6' },
};

/**
 * Ticks a functional boost lasts.
 * @param {number} seconds
 */
export function boostTicks(seconds) {
  return Math.round(seconds / DT);
}
