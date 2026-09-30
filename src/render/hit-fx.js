/**
 * How damage looks on the wizard (pure, tested; no three.js): a short
 * flash of his hologram on a hit, blinking while invulnerable after it,
 * and the derez when he dies anywhere but
 * in a hole: he flickers and squeezes into a thin beam while he derezzes
 * into pixels (derez-fx.js, D126). A placeholder until the Phase 5 juice
 * pass.
 */

import { PLAYER } from '../entities/player.js';

/** Timing in ticks, sizes in units. */
export const HIT_FX = {
  /** Ticks the hologram flashes white right after a hit... */
  flashHotTicks: 3,
  /** ...then magenta, fading out, until this many ticks after it. He doesn't blink meanwhile. */
  flashTicks: 8,
  /** Ticks per visible/hidden phase while invulnerable. */
  blinkPeriod: 4,
  /** Ticks the wizard takes to flicker out once he derezzes. */
  derezTicks: 36,
  /** The body his derez pixels start in (derez-fx.js, D126): hat included. */
  body: { size: [0.6, 1.8, 0.6] },
};

/**
 * How to draw the wizard this tick: hidden every other blink phase while
 * invulnerable; when derezzing, flickering faster and faster while
 * squeezing into a tall thin beam, then gone until he respawns.
 * @param {{ invulnerable: number, dead: boolean, deathCause: string|null, deathTimer: number }} player
 * @param {number} deathTicks ticks from dying to respawning (PLAYER.deathTicks)
 * @returns {{ visible: boolean, scale: number[] }} scale [x, y, z]
 */
export function wizardLook({ invulnerable, dead, deathCause, deathTimer }, deathTicks) {
  if (dead && deathCause !== 'hole') {
    const tick = deathTicks - deathTimer; // 0 at the moment of death
    const t = tick / HIT_FX.derezTicks;
    if (t >= 1) return { visible: false, scale: [1, 1, 1] };
    const period = Math.max(1, Math.round(3 * (1 - t)));
    const flicker = tick < 4 || Math.floor(tick / period) % 2 === 0;
    const thin = 1 - 0.9 * t;
    return { visible: flicker, scale: [thin, 1 + 0.8 * t, thin] };
  }
  const flashing = hitFlash({ invulnerable, dead }).amount > 0;
  const visible = dead || flashing || invulnerable <= 0 || Math.floor(invulnerable / HIT_FX.blinkPeriod) % 2 === 0;
  return { visible, scale: [1, 1, 1] };
}

/**
 * The hit flash on the wizard's hologram this tick: white-hot for
 * flashHotTicks right after a hit, then magenta fading out by flashTicks.
 * Nothing while dead (the derez takes over).
 * @param {{ invulnerable: number, dead: boolean }} player
 * @returns {{ amount: number, color: 'white'|'magenta' }} amount 0..1, 0 when not flashing
 */
export function hitFlash({ invulnerable, dead }) {
  const tick = PLAYER.invulnerableTicks - invulnerable; // 0 on the tick of the hit
  if (dead || invulnerable <= 0 || tick >= HIT_FX.flashTicks) return { amount: 0, color: 'white' };
  if (tick < HIT_FX.flashHotTicks) return { amount: 1, color: 'white' };
  const fade = (tick - HIT_FX.flashHotTicks) / (HIT_FX.flashTicks - HIT_FX.flashHotTicks);
  return { amount: 0.85 * (1 - fade), color: 'magenta' };
}
