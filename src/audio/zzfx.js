/**
 * ZzFX sample generator (Frank Force, MIT licence, v1.3): turns a recipe of
 * up to 21 numbers into mono samples. The npm package builds an
 * AudioContext on import and plays by itself, so only its generator is
 * kept here: pure, and the engine (audio.js) does the playing.
 * https://github.com/KilledByAPixel/ZzFX
 */

/** Samples per second of the generated sounds. */
export const ZZFX_RATE = 44100;

/** Most numbers a recipe can hold. */
export const ZZFX_PARAMS = 21;

/**
 * @param {number[]} recipe volume, randomness, frequency, attack, sustain,
 *   release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime,
 *   repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay,
 *   tremolo, filter; a missing or null number takes its default
 * @param {() => number} [random] source of the small pitch variation
 * @returns {number[]} samples, -1 to 1
 */
export function zzfxSamples(recipe, random = Math.random) {
  let [
    volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0, release = 0.1, shape = 0, shapeCurve = 1,
    slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0,
    delay = 0, sustainVolume = 1, decay = 0, tremolo = 0, filter = 0,
  ] = recipe.map((value) => value ?? undefined);

  const PI2 = Math.PI * 2;
  const abs = Math.abs;
  const sign = (v) => (v < 0 ? -1 : 1);
  let startSlide = (slide *= (500 * PI2) / ZZFX_RATE / ZZFX_RATE);
  let startFrequency = (frequency *= ((1 + randomness * 2 * random() - randomness) * PI2) / ZZFX_RATE);
  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;
  let t = 0;
  let s = 0;
  const b = [];

  // Biquad filter coefficients.
  const quality = 2;
  const w = (PI2 * abs(filter) * 2) / ZZFX_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  const minAttack = 9; // no pop when the attack is 0
  attack = attack * ZZFX_RATE || minAttack;
  decay *= ZZFX_RATE;
  sustain *= ZZFX_RATE;
  release *= ZZFX_RATE;
  delay *= ZZFX_RATE;
  deltaSlide *= (500 * PI2) / ZZFX_RATE ** 3;
  modulation *= PI2 / ZZFX_RATE;
  pitchJump *= PI2 / ZZFX_RATE;
  pitchJumpTime *= ZZFX_RATE;
  repeatTime = (repeatTime * ZZFX_RATE) | 0;
  volume *= 0.3; // ZzFX's master volume

  const length = (attack + decay + sustain + release + delay) | 0;
  for (let i = 0; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? ((t / PI2) % 1 < shapeCurve / 2) * 2 - 1
                : Math.sin(t ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - ((((2 * t) / PI2) % 2) + 2) % 2
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);

      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0);

      s = delay ? s / 2 + (delay > i ? 0 : (i < length - delay ? 1 : (length - i) / delay) * (b[(i - delay) | 0] ?? 0) / 2 / volume) : s;

      if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }

    const f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * Math.sin(i ** 5);

    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump = jump || 1;
    }
  }
  return b;
}
