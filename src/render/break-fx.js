/**
 * How a destructible object reacts (pure, tested; no three.js). It stands
 * still, told apart by its data bits with some missing (marks.js); a hit
 * that doesn't break it jolts it; breaking bursts it into pixels (the
 * collapsing block's, collapse-fx.js).
 */

/** Timing in ticks, sizes in units. */
export const BREAK_FX = {
  /** A hit that doesn't break it: ticks of jolting and how far. */
  jolt: { ticks: 12, amount: 0.06 },
};

/**
 * The jolt `tick` ticks after a hit that didn't break it: a sideways
 * offset [x, 0, z] that rattles and dies away; zero when there is none.
 * @param {number|null} tick
 */
export function hitJolt(tick) {
  const { ticks, amount } = BREAK_FX.jolt;
  if (tick === null || tick < 0 || tick >= ticks) return [0, 0, 0];
  const a = amount * (1 - tick / ticks);
  return [a * Math.sin(tick * 2.3), 0, a * Math.sin(tick * 3.1 + 1)];
}
