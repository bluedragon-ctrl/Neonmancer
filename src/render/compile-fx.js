/**
 * How Compile looks (D125; pure, tested; no three.js), with
 * compile-view.js.
 *
 * Bits in the spell's gold stream from the wizard's hands into the cell in
 * front of him (the stream every spell shares, stream-fx.js, D127) while
 * the crate grows in there with a flicker, as a collapsing block
 * recompiles (collapse-fx.js). Before it derezzes the crate blinks, faster
 * at the end, then derezzes like anything else (derez-fx.js). While the
 * spell is selected, a dim marquee marks the cell a cast would fill (the
 * aim marker).
 */

/** Timing in ticks (the bits stream for PLAYER.compileTicks), sizes in units. */
export const COMPILE_FX = {
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
