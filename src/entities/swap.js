/**
 * Where Swap works (D261; pure, tested): the wizard and the first crate or
 * frozen enemy in line the way he aims trade places. The line is Pull's
 * (entities/pull.js lineTarget(): his grid axis, at the height of his
 * feet, up to the spell's range; a crate stream lets it through, a fence
 * doesn't).
 *
 * - The target: a crate or a frozen enemy, resting on a whole cell,
 *   with nothing on it (like pushing, D4).
 * - He stands on the ground at a whole height (not in the air, not on a
 *   stair's slope); his cell (the one under his feet center) takes the
 *   target: inside the room, clear of blocks (a crate stream is open, D198),
 *   other bodies and pickups lying there. It falls from there.
 * - The target's cell takes him: his box there, centered in it, clear of
 *   blocks (a crate stream is not open to him) and other bodies.
 * Swapping never lifts him: he lands at the height of his feet, on what
 * the target stood on.
 */
import { REST_EPS, bodyBox, cellBox, overlapsBox, overlapsSolid, restsOn } from '../physics/collision.js';
import { lineTarget } from './pull.js';

/**
 * Does any of `bodies` (but the target itself) rest on its box?
 * @param {{ box(): number[][] }} target
 * @param {Iterable<{ box(): number[][] }>} bodies
 */
function loaded(target, bodies) {
  const box = target.box();
  for (const body of bodies) if (body !== target && restsOn(body.box(), box)) return true;
  return false;
}

/**
 * What a swap would do now, or null if it can't.
 * @param {import('../game.js').Game} game player, grid, objects, liveEnemies, bodies and pickups
 * @param {number} range cells the line reaches, counting the one right in front of him
 * @returns {{ object?: object, enemy?: object, cell: number[], home: number[], to: number[], distance: number }|null}
 *   `cell` where the target stands, `home` the cell it goes to (his), `to` where his feet center goes
 */
export function swapTarget(game, range) {
  const { player, grid, bodies, pickups } = game;
  if (!player.grounded) return null;
  const [px, py, pz] = player.pos;
  const level = Math.round(py);
  if (Math.abs(py - level) > REST_EPS) return null;
  const found = lineTarget(game, range);
  if (!found) return null;
  const { object, enemy, cell, distance } = found;
  const target = object ?? enemy;
  if (object && !object.pos.every(Number.isInteger)) return null;
  if (enemy && (!enemy.pushable || enemy.state !== 'rest' || !enemy.pos.every(Number.isInteger))) return null;
  if (loaded(target, bodies)) return null;

  // His cell takes the target.
  const home = [Math.floor(px), level, Math.floor(pz)];
  const crateGrid = grid.forBody('crate');
  if (!crateGrid.isInside(home[0], home[2]) || home[1] + 1 > grid.size[1] || crateGrid.isSolid(...home)) return null;
  const homeBox = cellBox(home);
  if (bodies.some((body) => body !== player && body !== target && overlapsBox(homeBox, body.box()))) return null;
  if (pickups.some((pickup) => pickup.state !== 'taken' && pickup.data.at.every((v, i) => v === home[i]))) return null;

  // The target's cell takes him.
  const to = [cell[0] + 0.5, cell[1], cell[2] + 0.5];
  const box = bodyBox(to, player.size);
  if (overlapsSolid(box, grid)) return null;
  if (bodies.some((body) => body !== player && body !== target && body.solid !== false && overlapsBox(box, body.box()))) return null;
  return { ...(object ? { object } : { enemy }), cell, home, to, distance };
}
