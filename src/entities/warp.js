/**
 * Where Blink and Warp take the wizard (D86; pure, tested): straight on
 * the way he aims, level at his height, through open space only. His box
 * sweeps along the line and stops at the first block, room object or room
 * side; holes, hazard and void floors below and enemies pass under or
 * through it. He lands at the farthest spot short of that stop (within
 * the spell's range) where his box doesn't overlap a live enemy. It
 * reports the enemies his box passed through on the way (Blink hits them).
 */
import { bodyBox, overlapsBox, overlapsSolid } from '../physics/collision.js';

/** Tuning values (units). */
export const WARP = {
  /** Sweep step: less than the thinnest thing he could skip (a block is 1). */
  step: 0.05,
  /** Halvings that pin down the contact after a sweep step hit something. */
  refine: 12,
  /** Shortest jump that counts; closer than this he stays and the spell fizzles. */
  minDistance: 0.1,
};

/**
 * Does his box at `pos` hit something the line stops at: a solid cell, a
 * solid room object, or a room side he moves out through (one he already
 * stands beyond, in an exit's opening, doesn't count)?
 */
function stopsAt(pos, size, dir, grid, objects) {
  const box = bodyBox(pos, size);
  if (overlapsSolid(box, grid)) return true;
  for (const [axis, d] of [[0, dir[0]], [2, dir[1]]]) {
    if (d > 0 && box[axis][1] > grid.size[axis]) return true;
    if (d < 0 && box[axis][0] < 0) return true;
  }
  return objects.some((object) => overlapsBox(box, object.box()));
}

/**
 * Where a Blink or Warp from `from` ends.
 * @param {number[]} from his feet center [x, y, z]
 * @param {number[]} size his hitbox
 * @param {number[]} dir [dx, dz] the way he aims, normalized
 * @param {number} range farthest it goes (Infinity: Warp, to the first stop)
 * @param {import('../world/grid.js').Grid} grid
 * @param {{ box(): number[][] }[]} objects the room's solid objects
 * @param {{ box(): number[][] }[]} enemies the live enemies (passed, never landed in)
 * @returns {{ to: number[], distance: number, cut: boolean, passed: object[] }|null}
 *   `cut`: a block, object or side stopped the line short of `range`;
 *   `passed`: the enemies his box overlapped on the way (not where he
 *   started), in `enemies` order; null when there is no spot far enough to go to
 */
export function warpTarget(from, size, [dx, dz], range, grid, objects, enemies) {
  const at = (t) => [from[0] + dx * t, from[1], from[2] + dz * t];
  const blocked = (t) => stopsAt(at(t), size, [dx, dz], grid, objects);
  // Sweep until something stops the line (the room's diagonal bounds Warp).
  const limit = Math.min(range, Math.hypot(grid.size[0], grid.size[2]) + 1);
  let free = 0;
  let cut = false;
  for (let t = WARP.step; free < limit; t += WARP.step) {
    const next = Math.min(t, limit);
    if (blocked(next)) {
      // Pin the contact down between the last free spot and this one.
      let hit = next;
      for (let i = 0; i < WARP.refine; i++) {
        const mid = (free + hit) / 2;
        if (blocked(mid)) hit = mid;
        else free = mid;
      }
      cut = true;
      break;
    }
    free = next;
  }
  // Back off from enemies on the landing spot.
  let t = free;
  const inEnemy = (d) => {
    const box = bodyBox(at(d), size);
    return enemies.some((enemy) => overlapsBox(box, enemy.box()));
  };
  while (t >= WARP.minDistance && inEnemy(t)) t -= WARP.step;
  if (t < WARP.minDistance) return null;
  // Enemies on the way: overlapped by the sweep past his starting box.
  const start = bodyBox(from, size);
  const passed = enemies.filter((enemy) => {
    const box = enemy.box();
    if (overlapsBox(start, box)) return false;
    for (let d = WARP.step; d < t + WARP.step; d += WARP.step) {
      if (overlapsBox(bodyBox(at(Math.min(d, t)), size), box)) return true;
    }
    return false;
  });
  return { to: at(t), distance: t, cut, passed };
}
