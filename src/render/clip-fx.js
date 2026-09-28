/**
 * How Cut & Paste looks (D87; pure, tested; no three.js), with
 * clip-view.js; picked in the showcase over a scan line wiping the object
 * out and the object flying over his hat.
 *
 * Cut: a bright dashed marquee ("marching ants") in the spell's color
 * snaps onto the object, which then streams as pixels into his hands.
 * Paste: the pixels stream from his hands into a marquee snapping onto
 * the cell, and the object pops up in it. While the spell is selected, a
 * dim marquee marks what a cut would take and a dashed ghost where a
 * paste would go (the aim marker).
 */
import { PLAYER } from '../entities/player.js';
import { hash } from './hash.js';

/** Timing in ticks (the effect lasts PLAYER.clipTicks), sizes in units. */
export const CLIP_FX = {
  /** Ticks the marquee takes to snap on, from `snapScale` times its size; the cut object shows until then. */
  snapTicks: 8,
  snapScale: 1.35,
  /** Ticks the pixels take between the object and his hands. */
  streamTicks: 22,
  /** A pasted object grows in over growTicks, starting this many ticks before the stream ends. */
  growTicks: 8,
  growLead: 4,
  /** How much it overshoots as it grows. */
  growOvershoot: 0.12,
  /** Pixels in the stream, the edge of one, how high they arc. */
  pixels: 48,
  pixelSize: 0.07,
  arc: 0.4,
  /** The marquee round a crate and round an enemy, as a share of a block. */
  crateMarquee: 1.04,
  enemyMarquee: 0.84,
  /** The aim marker's marquee, a little looser than the effect's. */
  aimMarquee: 1.1,
  /** Brightness of the effect's marquee, the aim marker and the paste ghost. */
  brightness: 2,
  aimBrightness: 0.9,
  ghostBrightness: 0.7,
  /** Marching ants: units the dashes move per second. */
  march: 0.5,
};

/** Smoothstep of t, clamped to 0..1. */
function ease(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** The tick a paste's object starts growing in. */
const GROW_START = CLIP_FX.streamTicks - CLIP_FX.growLead;

/**
 * The effect's marquee `tick` ticks after a cut or paste: visible while it
 * lasts (a cut: until the object has streamed away; a paste: until the
 * object has grown in, a little longer), snapping on at the start.
 * @param {'cut'|'paste'} mode
 * @param {number} tick may be fractional
 * @returns {{ visible: boolean, scale: number }} scale: times its size
 */
export function marqueeLook(mode, tick) {
  const { snapTicks, snapScale, streamTicks, growTicks } = CLIP_FX;
  const end = mode === 'cut' ? snapTicks + streamTicks : GROW_START + growTicks + 6;
  if (tick < 0 || tick >= Math.min(end, PLAYER.clipTicks)) return { visible: false, scale: 1 };
  return { visible: true, scale: 1 + (snapScale - 1) * (1 - ease(tick / snapTicks)) };
}

/**
 * The pixels `tick` ticks after a cut (streaming from the object into his
 * hands, once the marquee has snapped on) or a paste (from his hands into
 * the cell): each leaves a spot in the object's volume, or arrives there,
 * a little later than the one before, on a slight arc.
 * @param {'cut'|'paste'} mode
 * @param {number} tick may be fractional
 * @param {number[]} center the middle of the object
 * @param {number} size its size (1 for a crate)
 * @param {number[]} hands where his hands are now
 * @returns {{ offset: number[], scale: number }[]} world positions; empty
 *   while there are none
 */
export function clipPixels(mode, tick, center, size, hands) {
  const { streamTicks, pixels, arc } = CLIP_FX;
  const out = mode === 'cut';
  const t = out ? tick - CLIP_FX.snapTicks : tick;
  if (t < 0 || t >= streamTicks) return [];
  const list = [];
  for (let i = 0; i < pixels; i++) {
    const start = [0, 1, 2].map((k) => center[k] + (hash(i, k) - 0.5) * 0.9 * size);
    const delay = hash(i, 3) * streamTicks * 0.4;
    const u = ease((t - delay) / (streamTicks * 0.6));
    const along = out ? u : 1 - u;
    const lift = Math.sin(Math.PI * along) * arc * (0.5 + hash(i, 4));
    const offset = [0, 1, 2].map((k) => start[k] + (hands[k] - start[k]) * along + (k === 1 ? lift : 0));
    const scale = out ? (u >= 1 ? 0 : 1 - 0.7 * u) : u <= 0 ? 0 : 0.3 + 0.7 * u;
    list.push({ offset, scale });
  }
  return list;
}

/**
 * A pasted object's size `tick` ticks after the paste: nothing while the
 * pixels stream in, then growing in with a small overshoot.
 * @param {number} tick may be fractional
 * @returns {number} 0..1 (a little over while it overshoots)
 */
export function pasteGrow(tick) {
  const u = ease((tick - GROW_START) / CLIP_FX.growTicks);
  return u >= 1 ? 1 : u * (1 + CLIP_FX.growOvershoot * Math.sin(Math.PI * u));
}
