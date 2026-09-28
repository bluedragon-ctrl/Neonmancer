/**
 * What every enemy model shares (bug.js, virus.js, sentinel.js): the eye
 * colors by mood, the eye geometry, how bright the eyes glow, and the
 * burst of pixels an enemy pops into. Pure functions are tested.
 *
 * A model keeps its eye material in `userData.eyes`, its mood in
 * `userData.mood` and its calm eye brightness in `userData.glow`, so one
 * setMood() colors any of them.
 */
import { SphereGeometry } from 'three';
import { hash } from './hash.js';
import { shared } from './neon.js';

/** Eye color by mood: red hostile, amber calm until provoked, cyan peaceful. */
export const MOODS = { hostile: 0xff2a3a, provoked: 0xffb020, peaceful: 0x00f0ff };

/** Unit sphere every enemy eye is scaled from (never disposed with a room). */
export const EYE = shared(new SphereGeometry(1, 12, 8));

/**
 * The mood an enemy's eyes show: 'hostile', 'provoked' (calm, but will
 * turn hostile when attacked) or 'peaceful'.
 * @param {{ hostile: boolean, data: { hostility: string } }} enemy
 */
export function eyeMood(enemy) {
  if (enemy.hostile) return 'hostile';
  return enemy.data.hostility === 'provoked' ? 'provoked' : 'peaceful';
}

/**
 * Color a model's eyes for its mood, `glow` times as bright (above 1 blooms).
 * @param {import('three').Object3D} model with userData.eyes, mood and glow
 * @param {number} [glow] brightness; its calm one by default
 */
export function glowEyes(model, glow = model.userData.glow) {
  const { eyes, mood } = model.userData;
  eyes.color.set(MOODS[mood]).multiplyScalar(glow);
}

/**
 * Color a model's eyes for a mood.
 * @param {import('three').Object3D} model with userData.eyes and glow
 * @param {'hostile'|'provoked'|'peaceful'} mood
 */
export function setMood(model, mood) {
  model.userData.mood = mood;
  glowEyes(model);
}

/**
 * Eye brightness between calm and flared: `alert` (0..1, after the
 * wizard) or the charge of an attack, whichever is more.
 * @param {{ calm: number, alert: number }} eyeGlow
 * @param {number} alert
 * @param {number} charge 0..1
 */
export function flaredGlow({ calm, alert: flared }, alert, charge) {
  return calm + (flared - calm) * Math.max(alert, charge);
}

/**
 * The pop of an enemy: a function giving the pixels `tick` ticks after it
 * died (may be fractional), a burst flying out from its middle, rising a
 * little and shrinking to nothing; empty once the burst is over.
 * @param {{ pixels: number, ticks: number, spread: number, rise: number }} pop
 * @param {object} shape
 * @param {number} shape.seed first of the hash channels it uses (four in a row)
 * @param {number} shape.middle height of the burst's middle above its feet
 * @param {number} [shape.start] radius the pixels start from
 * @param {number} [shape.scatter] height the pixels start spread over (a tall body)
 * @returns {(tick: number) => { offset: number[], scale: number }[]} offsets from its feet center
 */
export function popBurst({ pixels, ticks, spread, rise }, { seed, middle, start = 0.15, scatter = 0 }) {
  return (tick) => {
    if (tick < 0 || tick >= ticks) return [];
    const t = tick / ticks;
    const out = [];
    for (let i = 0; i < pixels; i++) {
      const angle = hash(i, seed) * Math.PI * 2;
      const radius = (start + hash(i, seed + 1) * spread) * Math.sqrt(t);
      const height = middle + (hash(i, seed + 2) - 0.3) * rise * t + (hash(i, seed + 3) - 0.5) * scatter;
      out.push({ offset: [Math.cos(angle) * radius, height, Math.sin(angle) * radius], scale: 1 - t });
    }
    return out;
  };
}
