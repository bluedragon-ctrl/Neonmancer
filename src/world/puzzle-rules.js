/**
 * The puzzle's rules on whole cells (pure, no ticks, no browser): where a
 * pushed crate goes, where a dropped crate comes to rest, and where a jump
 * pad throws the wizard. The game asks them before it animates a move
 * (entities/pushable.js, entities/enemy.js, the pads in game.js), the
 * reachability checker (reach.js) and the push solver ask them while they
 * search, so the two can't drift apart. Each caller brings its own view of
 * the cells: the game from collision boxes, the checker from its cell sets
 * of a configuration.
 *
 * The wizard and enemies still move freely; these rules decide what the
 * puzzle state (the crates, the holes, a throw's landing) becomes.
 */

/**
 * Gaps a launch of 2 blocks or more crosses (D243): over a 1-tile gap it
 * lands up to its whole launch higher, over 2 tiles a block less, over 3
 * never. A lower launch crosses gaps as wide as it is high and lands no
 * higher than it took off.
 */
export const LAUNCH = {
  gap: 2,
};

/**
 * Whole blocks a launch of `launch` units (a pad's, D221) lifts him: 2.2 is 2.
 * @param {number} launch
 */
export function launchBlocks(launch) {
  return Math.floor(launch + 1e-9);
}

/**
 * Where a crate (or a frozen enemy, a pulled or shoved one) pushed from the
 * cell [x, y, z] along [dx, dz] goes before it falls (D4, D230): the next
 * cell, or off a ledge over a stair's top down it to its foot, two cells on
 * and a block down, passing over the stair's cell (`via`). Never up a
 * stair, never out of the room (rooms reset, so it would be lost), never
 * into a cell `blocked` says is taken.
 * Whether the crate may move at all (resting, nothing on it) is the
 * caller's to know.
 * @param {import('./grid.js').Grid} grid
 * @param {number[]} cell [x, y, z], whole cells
 * @param {number[]} dir [dx, dz], one of them ±1
 * @param {(cell: number[]) => boolean} blocked is the cell taken (a block, a body)?
 * @returns {{ to: number[], via: number[]|null, rise: number }|null}
 */
export function pushStep(grid, [x, y, z], [dx, dz], blocked) {
  const step = grid.stairStep(x, y, z, dx, dz, false);
  if (!step || !grid.isInside(step.to[0], step.to[2])) return null;
  if (blocked(step.to) || (step.via && blocked(step.via))) return null;
  return step;
}

/**
 * Where a crate put in the cell [x, y, z] comes to rest: it drops while
 * there is air under it, and a hole at the floor swallows it (D18: it plugs
 * the hole, a frozen enemy pops in it).
 * @param {number[]} cell [x, y, z]
 * @param {(x: number, y: number, z: number) => string} below what is under the cell: 'air', 'hole' or anything else (it rests)
 * @returns {{ cell: number[] } | { hole: number[] }} its resting cell, or the hole tile [x, z] it drops into
 */
export function settle([x, y, z], below) {
  for (;;) {
    const under = below(x, y, z);
    if (under === 'hole') return { hole: [x, z] };
    if (under !== 'air') return { cell: [x, y, z] };
    y--;
  }
}

/**
 * Where a jump pad (D221) throws the wizard standing on it at [x, y, z],
 * holding [dx, dz] (a grid axis) as it launches him `up` whole blocks: onto
 * the first column ahead where he can stand at his level or higher.
 * - The column next to the pad: on top of it, up to `up` blocks higher,
 *   with room over the pad for the rise; or on it at his level.
 * - Further, over a gap (a hole or a drop, the cells over it free from his
 *   feet to above his head): up to LAUNCH.gap tiles for a launch of 2 or
 *   more, landing up to `up` higher over one tile and a block less over
 *   two; a lower launch crosses `up` tiles, landing level.
 * With no such column, the farthest one ahead he can land in lower down,
 * else straight up (null): he comes down on the pad, which throws him
 * again. A wall too high for the launch ends the search.
 * @param {{ blocked(x: number, y: number, z: number): boolean, landing(x: number, y: number, z: number): number }} view
 *   `blocked`: is the cell taken for his body (outside the room taken, above it free);
 *   `landing`: put in the column at that height and falling, the y he stands at, or −1 (no room, or a hole)
 * @param {number[]} cell [x, y, z] he stands in, on the pad
 * @param {number[]} dir [dx, dz], one of them ±1
 * @param {number} up whole blocks the launch lifts him
 * @returns {number[]|null} the cell [x, y, z] he lands in, or null: straight up
 */
export function throwLanding({ blocked, landing }, [x, y, z], [dx, dz], up) {
  if (up < 1) return null;
  const high = up > 1;
  const gap = high ? LAUNCH.gap : up;
  /** Room in the pad's column for a rise of `rise` (his head 2 cells over his feet). */
  const headroom = (rise) => {
    for (let dy = 2; dy <= rise + 1; dy++) if (blocked(x, y + dy, z)) return false;
    return true;
  };
  let lower = null;
  for (let k = 1; k <= gap + 1; k++) {
    const lx = x + dx * k;
    const lz = z + dz * k;
    const width = k - 1;
    // Highest first: a block, a ledge or a gap's far side up to its launch higher.
    const most = k === 1 ? up : high ? up + 1 - width : 0;
    for (let rise = most; rise >= 1; rise--) {
      if (!(k === 1 ? headroom(rise) : overRise(blocked, x, y, z, dx, dz, width, rise, up))) continue;
      if (landing(lx, y + rise, lz) === y + rise) return [lx, y + rise, lz];
    }
    const ly = landing(lx, y, lz);
    if (ly === y) return [lx, y, lz];
    if (ly >= 0) lower = [lx, ly, lz];
    // The column is a gap only with its cells free from his feet to over his head.
    let open = true;
    for (let dy = 0; dy <= 2; dy++) open &&= !blocked(lx, y + dy, lz);
    if (!open) break;
  }
  return lower;
}

/**
 * Room for a throw over a gap `width` tiles wide that lands `rise` higher
 * (D243): for every step of the rise his head clears the pad's column, and
 * below the launch's top the cells over the gap too.
 */
function overRise(blocked, x, y, z, dx, dz, width, rise, up) {
  for (let r = 1; r <= rise; r++) {
    if (blocked(x, y + r + 1, z)) return false;
    if (r < up) for (let k = 0; k <= width; k++) if (blocked(x + dx * k, y + r + 2, z + dz * k)) return false;
  }
  return true;
}
