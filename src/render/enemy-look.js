/**
 * What every enemy model shares (bug.js, virus.js, sentinel.js, cron.js,
 * worm.js, crawler.js): the eye colors by mood, the eye geometry, how
 * bright the eyes glow. An enemy pops into the derez everything shares
 * (derez-fx.js, D126). Pure functions are tested.
 *
 * A model keeps its eye material in `userData.eyes`, its mood in
 * `userData.mood` and its calm eye brightness in `userData.glow`, so one
 * setMood() colors any of them.
 */
import { SphereGeometry } from 'three';
import { PALETTE, shared } from './neon.js';

/** Eye color by mood: red hostile, amber calm until provoked, cyan peaceful. */
export const MOODS = { hostile: PALETTE.danger, provoked: PALETTE.amber, peaceful: PALETTE.cyan };

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
