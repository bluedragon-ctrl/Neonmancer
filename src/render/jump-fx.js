/**
 * How the double jump looks (D95; pure, tested; no three.js): where he
 * kicks off in mid-air, rings of light in his own magenta burst out flat
 * under his feet and fade, as if he jumped off a pane of glass. The rings
 * stay where he kicked off; he flies on up.
 */
import { PLAYER } from '../entities/player.js';

/** Timing in ticks (the effect lasts PLAYER.airJumpTicks), sizes in units. */
export const JUMP_FX = {
  /** Rings: how many, the ticks between them, their radius at the start and end. */
  rings: 2,
  stagger: 4,
  from: 0.15,
  to: 0.6,
  /** Corners of each ring: a hexagon reads as a pane of the Grid. */
  sides: 6,
  /** Glow at the start (above 1 blooms). */
  glow: 2.4,
};

/**
 * The rings `tick` ticks after he kicked off.
 * @param {number} tick may be fractional
 * @returns {{ radius: number, glow: number }[]} one per ring; glow 0: not shown
 */
export function jumpRings(tick) {
  const { rings, stagger, from, to, glow } = JUMP_FX;
  const life = PLAYER.airJumpTicks - (rings - 1) * stagger;
  return Array.from({ length: rings }, (_, i) => {
    const t = (tick - i * stagger) / life;
    if (t < 0 || t > 1) return { radius: from, glow: 0 };
    // Fast out, slowing down; fading as it grows.
    const eased = 1 - (1 - t) ** 2;
    return { radius: from + (to - from) * eased, glow: glow * (1 - t) * (i === 0 ? 1 : 0.7) };
  });
}
