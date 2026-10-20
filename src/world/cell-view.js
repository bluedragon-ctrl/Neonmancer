/**
 * The game's state as whole cells, for the puzzle's rules
 * (world/puzzle-rules.js): the bridge between the free-moving bodies and
 * the grid. It reads cells the way the reachability checker does (reach.js
 * RoomModel blocked(), landing()), from the grid and the collision boxes
 * of the bodies in the room. Pure.
 */
import { cellBox, overlapsBox } from '../physics/collision.js';

/**
 * A view of the cells for the wizard's body.
 * @param {import('./grid.js').Grid} grid the grid as he sees it
 * @param {Iterable<{ box(): number[][] }>} bodies what he collides with (not himself)
 * @returns {{ blocked(x: number, y: number, z: number): boolean, landing(x: number, y: number, z: number): number }}
 */
export function wizardCells(grid, bodies) {
  const h = grid.size[1];
  const list = [...bodies];
  /** Is the cell taken: outside the room's sides or under its floor, a block or a body; over the room open? */
  const blocked = (x, y, z) => {
    if (y < 0 || !grid.isInside(x, z)) return true;
    if (y >= h) return false;
    if (grid.isSolid(x, y, z)) return true;
    const box = cellBox([x, y, z]);
    return list.some((body) => overlapsBox(box, body.box()));
  };
  const slab = (x, y, z) => y < h && grid.isInside(x, z) && grid.typeAt(x, y, z)?.look === 'slab';
  /** Room for his body: two free cells, or a slab over the first (he is 1.5 high). */
  const clear = (x, y, z) => !blocked(x, y, z) && (!blocked(x, y + 1, z) || slab(x, y + 1, z));
  const landing = (x, y, z) => {
    if (!clear(x, y, z)) return -1;
    for (; y > 0; y--) if (blocked(x, y - 1, z)) return y;
    return grid.isHole(x + 0.5, z + 0.5) ? -1 : 0;
  };
  return { blocked, landing };
}
