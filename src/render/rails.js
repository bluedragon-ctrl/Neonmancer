/**
 * Layout of the guide line a moving platform glides along (pure, tested;
 * no three.js). Drawn by PlatformView (render/entity-view.js).
 *
 * One line through the middle of the platform's path, at the height of its
 * bottom face: the projection of where it moves. A vertical leg runs up
 * through the middle of the column it travels.
 */

/** Tuning values (units). */
export const RAILS = {
  /** Lift above the surface, so the line never fights with the floor. */
  lift: 0.015,
};

/**
 * Guide line segments of a track (world/path.js), each drawn once even when
 * a ping-pong path runs a leg both ways.
 * @param {{ legs: { from: number[], to: number[] }[] }} track
 * @returns {number[][][]} [[x, y, z], [x, y, z]] segments
 */
export function railSegments({ legs }) {
  const segments = new Map();
  const middle = (p) => [p[0] + 0.5, p[1] + RAILS.lift, p[2] + 0.5];
  for (const { from, to } of legs) {
    const a = middle(from);
    const b = middle(to);
    const key = [a, b].map((p) => p.join(',')).sort().join('|');
    if (!segments.has(key)) segments.set(key, [a, b]);
  }
  return [...segments.values()];
}
