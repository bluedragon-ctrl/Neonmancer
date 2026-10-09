/**
 * Where Cut & Paste works (D87; pure, tested): the cell right in front of
 * the wizard. He aims along a grid axis (the larger part of his aim; x on
 * a tie), and the cell in front is the first whole cell ahead of his box,
 * in his column across that axis, at the height of his feet.
 *
 * - Cut takes a crate (a resting pushable) or a frozen enemy there, on
 *   his own level only; one with something resting on it can't be cut
 *   (like pushing, D4), so nothing ever drops out of a stack. A compiled
 *   crate (D125) can't be cut either: it only lasts a while.
 * - Paste puts what he holds into that cell at his feet: inside the room,
 *   clear of blocks, bodies (objects, enemies, him) and pickups lying there.
 *   It falls from there if nothing holds it up (into a hole, it plugs it).
 */
import { REST_EPS, cellBox, overlapsBox, restsOn } from '../physics/collision.js';

/**
 * The grid axis he aims along: [dx, dz] with one of them ±1.
 * @param {number[]} aim [dx, dz] the way he aims, normalized
 */
export function aimAxis([dx, dz]) {
  return Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz)];
}

/**
 * The cell right in front of him at the height of his feet: the first
 * whole cell ahead of his box along `axis`.
 * @param {number[]} pos his feet center
 * @param {number[]} size his hitbox
 * @param {number[]} axis [dx, dz] from aimAxis()
 * @returns {number[]} cell [x, y, z]
 */
export function frontCell(pos, size, axis) {
  const cell = [Math.floor(pos[0]), Math.round(pos[1]), Math.floor(pos[2])];
  for (const [i, d] of [[0, axis[0]], [2, axis[1]]]) {
    if (d === 0) continue;
    const front = pos[i] + (d * size[i]) / 2;
    cell[i] = d > 0 ? Math.ceil(front - REST_EPS) : Math.floor(front + REST_EPS) - 1;
  }
  return cell;
}

/**
 * Does anything of `bodies` (but `self`) rest on the box?
 * @param {number[][]} box
 * @param {Iterable<{ box(): number[][] }>} bodies
 */
function loaded(box, bodies, self) {
  for (const body of bodies) if (body !== self && restsOn(body.box(), box)) return true;
  return false;
}

/**
 * What Cut would take: the crate or frozen enemy in the cell in front of
 * him, on his own level, with nothing resting on it.
 * @param {import('../game.js').Game} game player, objects, liveEnemies and bodies
 * @returns {{ object?: object, enemy?: object, cell: number[] }|null}
 */
export function cutTarget({ player, objects, liveEnemies, bodies }) {
  const cell = frontCell(player.pos, player.size, aimAxis(player.aim()));
  const [x, y, z] = cell;
  const object = objects.find((o) => o.kind === 'pushable' && o.state === 'rest' && o.pos.every((v, i) => v === cell[i]));
  if (object?.temporary) return null;
  if (object) return loaded(object.box(), bodies, object) ? null : { object, cell };
  const enemy = liveEnemies.find((e) => {
    const [bx, by, bz] = e.box();
    return Math.floor((bx[0] + bx[1]) / 2) === x && Math.floor(by[0] + REST_EPS) === y && Math.floor((bz[0] + bz[1]) / 2) === z;
  });
  if (enemy?.frozen && !loaded(enemy.box(), bodies, enemy)) return { enemy, cell };
  return null;
}

/**
 * Where Paste would put what he holds: the cell in front of him at his
 * feet, if it is free.
 * @param {import('../game.js').Game} game player, grid, bodies and pickups
 * @param {'crate'|'wizard'} [kind] what is put there: a crate or a frozen
 *   enemy (can stand in a crate stream, D198) or the decoy (cannot)
 * @returns {number[]|null} cell [x, y, z]
 */
export function pasteCell({ player, grid: whole, bodies, pickups }, kind = 'crate') {
  const grid = whole.forBody(kind);
  const cell = frontCell(player.pos, player.size, aimAxis(player.aim()));
  const [x, y, z] = cell;
  if (!grid.isInside(x, z) || y < 0 || y + 1 > grid.size[1] || grid.isSolid(x, y, z)) return null;
  const box = cellBox(cell);
  for (const body of bodies) if (overlapsBox(box, body.box())) return null;
  if (pickups.some((pickup) => pickup.state !== 'taken' && pickup.data.at.every((v, i) => v === cell[i]))) return null;
  return cell;
}
