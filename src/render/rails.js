/**
 * Layout of the glowing rails a moving platform glides on (pure, tested;
 * no three.js). Drawn by PlatformView (render/entity-view.js).
 *
 * - Along the ground of a horizontal leg: two rails under the platform,
 *   with a cross tie at every point where it stops or turns.
 * - Along a vertical leg: two guide posts at the platform's side corners
 *   (the ones facing the camera's left and right), as high as it travels.
 */

/** Tuning values (units). */
export const RAILS = {
  /** Distance of each rail from the platform's middle line. */
  gauge: 0.3,
  /** Half the length of a cross tie. */
  tie: 0.42,
  /** Guide posts stand this far out from the platform's corner. */
  postGap: 0.1,
  /** Lift above the surface, so rails never fight with the floor. */
  lift: 0.015,
};

/**
 * Rail segments of a track (world/path.js), each drawn once even when a
 * ping-pong path runs a leg both ways.
 * @param {{ legs: { from: number[], to: number[], axis: number }[] }} track
 * @returns {number[][][]} [[x, y, z], [x, y, z]] segments
 */
export function railSegments({ legs }) {
  const segments = new Map();
  const add = (a, b) => {
    const key = [a, b].map((p) => p.map((v) => v.toFixed(3)).join(',')).sort().join('|');
    segments.set(key, [a, b]);
  };
  for (const { from, to, axis } of legs) {
    if (axis === 1) {
      const bottom = Math.min(from[1], to[1]);
      const top = Math.max(from[1], to[1]) + 1;
      const [x, , z] = from;
      const g = RAILS.postGap;
      for (const [px, pz] of [[x - g, z + 1 + g], [x + 1 + g, z - g]]) add([px, bottom, pz], [px, top, pz]);
      continue;
    }
    const across = axis === 0 ? 2 : 0;
    const y = from[1] + RAILS.lift;
    const middle = (p) => [p[0] + 0.5, y, p[2] + 0.5];
    for (const side of [-RAILS.gauge, RAILS.gauge]) {
      const a = middle(from);
      const b = middle(to);
      a[across] += side;
      b[across] += side;
      add(a, b);
    }
    for (const end of [from, to]) {
      const a = middle(end);
      const b = middle(end);
      a[across] -= RAILS.tie;
      b[across] += RAILS.tie;
      add(a, b);
    }
  }
  return [...segments.values()];
}
