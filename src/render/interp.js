/**
 * Interpolation for drawing between two logic ticks, and drop shadow sizing
 * (pure, tested; no three.js, so logic tests and tools can use it).
 */

/** Linear interpolation between two positions. */
export function lerpPosition(prev, curr, alpha) {
  return prev.map((p, i) => p + (curr[i] - p) * alpha);
}

/** Interpolate angles the short way round. */
export function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

/**
 * Size and brightness of a drop shadow for a body `height` units above the
 * surface (pure, tested).
 */
export function shadowScale(height) {
  const t = Math.min(Math.max(height, 0) / 3, 1);
  return { scale: 1 - 0.45 * t, opacity: 1 - 0.6 * t };
}
