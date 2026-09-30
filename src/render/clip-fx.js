/**
 * How Cut & Paste looks (D87; pure, tested; no three.js), with
 * clip-view.js.
 *
 * Cut: a bright dashed marquee ("marching ants") in the spell's color
 * snaps onto the object, which then streams as pixels into his hands.
 * Paste: the pixels stream from his hands into a marquee snapping onto
 * the cell, and the object pops up in it. The pixels are the stream
 * every spell shares (stream-fx.js, D127). While the spell is selected, a
 * dim marquee marks what a cut would take and a dashed ghost where a
 * paste would go (the aim marker).
 */
import { PLAYER } from '../entities/player.js';

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
 * A pasted object's size `tick` ticks after the paste: nothing while the
 * pixels stream in, then growing in with a small overshoot.
 * @param {number} tick may be fractional
 * @returns {number} 0..1 (a little over while it overshoots)
 */
export function pasteGrow(tick) {
  const u = ease((tick - GROW_START) / CLIP_FX.growTicks);
  return u >= 1 ? 1 : u * (1 + CLIP_FX.growOvershoot * Math.sin(Math.PI * u));
}
