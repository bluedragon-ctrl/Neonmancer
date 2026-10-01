/**
 * Audio helpers that need no browser (D138): the volume curve and the
 * lookup of named sounds and tracks in `data/audio.json`.
 */

/** Steps of the Options volume sliders (ui/settings.js: 0 to 10). */
export const VOLUME_STEPS = 10;

/** The audio data when a game has no audio.json. */
export const NO_AUDIO = { music: {}, sounds: {} };

/**
 * Gain of a slider step. Squared, so the lower steps are quiet enough to
 * tell apart (loudness is not linear in gain).
 * @param {number} step 0 (off) to VOLUME_STEPS
 * @returns {number} 0 to 1
 */
export function stepGain(step) {
  const clamped = Math.min(VOLUME_STEPS, Math.max(0, step));
  return (clamped / VOLUME_STEPS) ** 2;
}

/**
 * A named sound or track of the audio data, with its defaults filled in.
 * @param {typeof NO_AUDIO} audio
 * @param {'music' | 'sounds'} kind
 * @param {string} name
 * @returns {{ file?: string, zzfx?: number[], volume: number, loop: boolean } | null} null when there is none
 */
export function lookup(audio, kind, name) {
  const entry = Object.hasOwn(audio[kind] ?? {}, name) ? audio[kind][name] : null;
  if (!entry) return null;
  return { volume: 1, loop: kind === 'music', ...entry };
}
