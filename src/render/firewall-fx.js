/**
 * How the Firewall spell looks (D84; pure, tested; no three.js): a low
 * jagged ring round the wizard's feet with tongues of flame licking up from
 * it, the same radius and timing as the Shield (shieldLook()). Drawn as
 * line segments [[x, y, z], [x, y, z]] round his feet, in a few prebuilt
 * variants swapped every SHIELD_FX.flickerTicks, so the flames flicker.
 */
import { hash } from './hash.js';
import { SHIELD_FX } from './shield-fx.js';

/** Sizes in units, heights above his feet. */
export const FIREWALL_FX = {
  /** Height of the ring the flames stand on (its jitter never dips below the floor). */
  y: 0.05,
  /** Tongues round the ring, their height range and width (radians). */
  tongues: 11,
  tongueLow: 0.3,
  tongueHigh: 0.75,
  tongueWidth: 0.26,
};

const SEED = [57.9, 413.3];

/** A point on the ring at `angle`, `out` beyond its radius, at height `y`. */
function ringPoint(angle, y, out = 0) {
  const r = SHIELD_FX.radius + out;
  return [Math.cos(angle) * r, y, Math.sin(angle) * r];
}

/** The low jagged ring, a little calmer than the Shield's, as segments. */
function jaggedRing(variant) {
  const n = SHIELD_FX.kinks;
  const jitter = SHIELD_FX.jitter * 0.6;
  const points = Array.from({ length: n }, (_, i) => {
    const out = (hash(i, variant * 7, SEED) - 0.5) * 2 * jitter;
    const up = (hash(i, variant * 7 + 1, SEED) - 0.5) * 2 * jitter;
    return ringPoint((i / n) * Math.PI * 2, FIREWALL_FX.y + up, out);
  });
  return points.map((p, i) => [p, points[(i + 1) % n]]);
}

/** A flame tongue standing on the ring at `angle`: up from its base to a leaning tip, back down. */
function tongue(angle, width, height, lean) {
  const half = width / 2;
  const kink = height * 0.45;
  const points = [
    ringPoint(angle - half, FIREWALL_FX.y),
    ringPoint(angle - half * 0.7 + lean * 0.3, kink),
    ringPoint(angle + lean, height),
    ringPoint(angle + half * 0.5 + lean * 0.4, kink * 1.2),
    ringPoint(angle + half * 0.2, kink * 0.8),
    ringPoint(angle + half, FIREWALL_FX.y),
  ];
  return points.slice(1).map((p, i) => [points[i], p]);
}

/**
 * The segments of one flicker variant, round his feet: the ring and its
 * tongues, each tongue's height and lean changing between variants.
 * @param {number} variant 0..SHIELD_FX.variants − 1
 * @returns {number[][][]}
 */
export function firewallSegments(variant) {
  const { tongues, tongueLow, tongueHigh, tongueWidth } = FIREWALL_FX;
  const segments = jaggedRing(variant);
  for (let i = 0; i < tongues; i++) {
    const angle = ((i + hash(i, 40, SEED) * 0.4) / tongues) * Math.PI * 2;
    const height = tongueLow + (tongueHigh - tongueLow) * hash(i, variant * 3 + 41, SEED);
    const lean = (hash(i, variant * 3 + 42, SEED) - 0.5) * 0.18;
    segments.push(...tongue(angle, tongueWidth * (0.8 + 0.4 * hash(i, 43, SEED)), height, lean));
  }
  return segments;
}
