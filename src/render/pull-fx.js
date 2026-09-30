/**
 * How Pull looks (D124; pure, tested; no three.js), with pull-view.js.
 *
 * A tractor beam: square rings of pixels in the spell's green leave the
 * pulled crate or enemy one after another and shrink as they flow into
 * the wizard's hands, while a marquee (as Cut & Paste's, D87) snaps onto
 * the target and rides along with it. While the spell is selected, a dim
 * marquee marks what a pull would take (the aim marker).
 */
import { PLAYER } from '../entities/player.js';

/** Timing in ticks (the beam lasts PLAYER.pullTicks), sizes in units. */
export const PULL_FX = {
  /** Ticks a ring takes from the target to his hands, and between two rings leaving. */
  travelTicks: 12,
  spacing: 3,
  /** The edge of a pixel. */
  pixelSize: 0.07,
  /** Half the width of a ring as it leaves the target, and as it reaches his hands. */
  ringSize: 0.42,
  handSize: 0.08,
  /** A ring fades out over the last part of its way (a share of it). */
  fade: 0.25,
  /** Ticks the marquee takes to snap on, from `snapScale` times its size. */
  snapTicks: 6,
  snapScale: 1.35,
  /** The marquee round a crate and round an enemy, as a share of a block. */
  crateMarquee: 1.04,
  enemyMarquee: 0.84,
  /** The aim marker's marquee round a crate, a little looser. */
  aimMarquee: 1.1,
  /** Brightness of the effect's marquee and of the aim marker. */
  brightness: 2,
  aimBrightness: 0.8,
};

/** Rings that can be on the way at once: the pixel slots the beam needs. */
export const PULL_RINGS = Math.ceil(PULL_FX.travelTicks / PULL_FX.spacing);

/** Pixels in the beam: a square ring of 8 (RING) per slot. */
export const PULL_PIXELS = PULL_RINGS * 8;

/** Smoothstep of t, clamped to 0..1. */
function ease(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** Where a ring's pixels sit round its middle: corners and edge middles of a square, in units of its half width. */
const RING = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

/**
 * The beam's pixels `tick` ticks after a pull: rings leaving the target
 * every PULL_FX.spacing ticks (as long as one can still reach his hands
 * before the beam ends), each flowing to his hands over travelTicks,
 * shrinking, and fading at the end. A ring stands across the beam: its
 * square spans the up axis and the level one across the way it runs.
 * @param {number} tick may be fractional
 * @param {number[]} target the middle of the target now
 * @param {number[]} hands where his hands are now
 * @returns {{ offset: number[], scale: number }[]} world positions, always
 *   PULL_PIXELS of them (scale 0: not shown)
 */
export function pullPixels(tick, target, hands) {
  const { travelTicks, spacing, ringSize, handSize, fade } = PULL_FX;
  const dx = hands[0] - target[0];
  const dz = hands[2] - target[2];
  const length = Math.hypot(dx, dz) || 1;
  // Level and across the beam.
  const across = [-dz / length, 0, dx / length];
  const list = [];
  for (let slot = 0; slot < PULL_RINGS; slot++) {
    // The latest ring in this slot that has left by now.
    const k = Math.floor((tick - slot * spacing) / (PULL_RINGS * spacing)) * PULL_RINGS + slot;
    const start = k * spacing;
    const u = (tick - start) / travelTicks;
    const shown = k >= 0 && u >= 0 && u < 1 && start + travelTicks <= PLAYER.pullTicks;
    const along = ease(u);
    const middle = [0, 1, 2].map((i) => target[i] + (hands[i] - target[i]) * along);
    const half = ringSize + (handSize - ringSize) * along;
    const scale = shown ? Math.min(1, (1 - u) / fade) : 0;
    for (const [a, b] of RING) {
      const offset = [0, 1, 2].map((i) => middle[i] + across[i] * a * half + (i === 1 ? b * half : 0));
      list.push({ offset, scale });
    }
  }
  return list;
}

/**
 * The marquee's size `tick` ticks after a pull: snapping on from
 * snapScale times its size, then steady while the beam lasts.
 * @param {number} tick may be fractional
 * @returns {number|null} times its size; null once the beam is over
 */
export function pullMarquee(tick) {
  if (tick < 0 || tick >= PLAYER.pullTicks) return null;
  return 1 + (PULL_FX.snapScale - 1) * (1 - ease(tick / PULL_FX.snapTicks));
}
