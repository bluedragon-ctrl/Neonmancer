/**
 * How damage looks on the wizard (pure, tested; no three.js): blinking
 * while invulnerable after a hit, and the derez when he dies anywhere but
 * in a hole: he flickers and squeezes into a thin beam while a burst of
 * pixels drifts up out of him and fades. A placeholder until the Phase 4
 * juice pass.
 */

/** Timing in ticks, sizes in units. */
export const HIT_FX = {
  /** Ticks per visible/hidden phase while invulnerable. */
  blinkPeriod: 4,
  /** Ticks the wizard takes to flicker out once he derezzes. */
  derezTicks: 24,
  /** Ticks the derez pixels fly (less than PLAYER.deathTicks). */
  pixelTicks: 40,
  /** Number of derez pixels. */
  pixels: 48,
  /** Edge of one pixel cube. */
  pixelSize: 0.09,
  /** How high the pixels drift by the end. */
  rise: 1.4,
  /** How far out they drift by the end. */
  spread: 0.7,
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
  const visible = dead || invulnerable <= 0 || Math.floor(invulnerable / HIT_FX.blinkPeriod) % 2 === 0;
  return { visible, scale: [1, 1, 1] };
}

/** A fixed pseudo-random number in [0, 1) for pixel `i` and channel `k`. */
function hash(i, k) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The derez pixels `tick` ticks after dying, around the feet center.
 * Each starts somewhere inside the wizard's body and drifts up and out,
 * shrinking to nothing; later ones start a little later (scale 0 until then).
 * @param {number} tick ticks since he died (may be fractional, for interpolation)
 * @returns {{ offset: number[], scale: number }[]} one per pixel, offsets
 *   from the feet center; empty once the burst is over
 */
export function derezPixels(tick) {
  if (tick < 0 || tick >= HIT_FX.pixelTicks) return [];
  const pixels = [];
  for (let i = 0; i < HIT_FX.pixels; i++) {
    const delay = hash(i, 0) * 10;
    const life = HIT_FX.pixelTicks - delay;
    const t = (tick - delay) / life;
    if (t < 0) {
      pixels.push({ offset: [0, 0, 0], scale: 0 });
      continue;
    }
    const angle = hash(i, 1) * Math.PI * 2;
    const radius = 0.1 + hash(i, 2) * 0.2 + t * HIT_FX.spread * hash(i, 3);
    const height = hash(i, 4) * 1.8 + t * HIT_FX.rise;
    pixels.push({
      offset: [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
      scale: 1 - t,
    });
  }
  return pixels;
}
