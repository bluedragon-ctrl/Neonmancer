/**
 * How a Blink or Warp looks (D86; pure, tested; no three.js), with
 * warp-view.js, and his hologram flashing in the spell's color as he
 * arrives.
 * Blink is a super-speed dash rather than a teleport: the logic moves him
 * at once, but he is drawn shooting forward over dashTicks, stretched,
 * with light streaks at his feet, hands and head trailing behind (the
 * tail running after him) and a kick of pixels where he pushed off.
 * Warp is a teleport: his pixels stream from where he was to where he is
 * (the stream every spell shares, stream-fx.js, D127).
 */

import { PLAYER } from '../entities/player.js';
import { hash } from './hash.js';

/** Timing in ticks (the afterimage lasts PLAYER.warpTicks), sizes in units. */
export const WARP_FX = {
  /** Ticks the arrival flash takes to fade. */
  flashTicks: 12,
  /** Ticks a Blink dash is drawn over, and how much he stretches along it at full speed. */
  dashTicks: 6,
  dashStretch: 0.6,
  /** Pixels kicked up where a dash starts. */
  kickPixels: 16,
  /** Heights of the streak's lines above his feet: feet, hands, head. */
  streakHeights: [0.12, 0.48, 0.95],
  /** The edge of a kicked pixel. */
  pixelSize: 0.08,
};

/**
 * The arrival flash `tick` ticks after he teleported: solid at once,
 * fading out by flashTicks.
 * @param {number} tick may be fractional
 * @returns {number} flash amount 0..1
 */
export function warpFlash(tick) {
  if (tick < 0 || tick >= WARP_FX.flashTicks) return 0;
  return 0.9 * (1 - tick / WARP_FX.flashTicks);
}

/**
 * A Blink dash `tick` ticks after the cast: how far along the way he is
 * drawn (0..1, fast from the start, easing in) and his stretch along it
 * (1 when still).
 * @param {number} tick may be fractional
 * @returns {{ along: number, stretch: number }}
 */
export function dashLook(tick) {
  const { dashTicks, dashStretch } = WARP_FX;
  if (tick < 0) return { along: 0, stretch: 1 };
  const t = Math.min(1, tick / dashTicks);
  const along = 1 - (1 - t) ** 2;
  // Stretched while fast, settling back just after he stops.
  const speed = Math.max(0, 1 - tick / (dashTicks + 3));
  return { along, stretch: 1 + dashStretch * speed };
}

/**
 * Pixels kicked up where a dash started, `tick` ticks after: they fly
 * back and up from his feet and shrink.
 * @param {number} tick may be fractional
 * @param {number[]} dir [dx, dz] the way he dashed, normalized
 * @returns {{ offset: number[], scale: number }[]} offsets from where he
 *   started; empty once they are over
 */
export function kickPixels(tick, [dx, dz]) {
  const ticks = PLAYER.warpTicks;
  if (tick < 0 || tick >= ticks) return [];
  const t = tick / ticks;
  const out = [];
  for (let i = 0; i < WARP_FX.kickPixels; i++) {
    const back = (0.2 + hash(i, 8) * 0.8) * Math.sqrt(t);
    const side = (hash(i, 9) - 0.5) * 0.8 * Math.sqrt(t);
    const up = hash(i, 10) * 0.5 * Math.sqrt(t) - 0.4 * t * t;
    out.push({ offset: [-dx * back + dz * side, 0.05 + Math.max(0, up), -dz * back - dx * side], scale: 1 - t });
  }
  return out;
}

/**
 * A Blink's streak `tick` ticks after the cast: its tail runs from where
 * he started towards where he is (0..1 of the way), after him.
 * @param {number} tick may be fractional
 * @returns {{ visible: boolean, tail: number }}
 */
export function streakLook(tick) {
  const t = tick / PLAYER.warpTicks;
  if (tick < 0 || t >= 1) return { visible: false, tail: 1 };
  return { visible: true, tail: 1 - (1 - t) ** 2 };
}
