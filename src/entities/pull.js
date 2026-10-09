/**
 * What Pull reaches (D124; pure, tested): the first crate or enemy in
 * line the way the wizard aims. The line runs along his grid axis (the
 * larger part of his aim, as for Cut & Paste, D87), in his column across
 * it, at the height of his feet, from the cell right in front of him up
 * to the spell's range. Holes and hazard or void floors below don't stop
 * it; a block, the room's side or any other body in a cell does.
 *
 * - A crate (a resting pushable on a whole cell) is pulled like a push
 *   towards him (Pushable.push()): nothing on it, supported, into a free
 *   cell; it falls or plugs a hole from there.
 * - An enemy (any live one standing in that cell, walking through it or
 *   frozen, not falling) is pulled a cell towards him (Enemy.pull()), even
 *   over a hole, where it drops and pops.
 * Right in front of him, a target has nowhere to go: the spell fizzles.
 */
import { REST_EPS, cellBox, overlapsBox } from '../physics/collision.js';
import { aimAxis, frontCell } from './clip.js';

/**
 * The live enemy whose middle stands in `cell`, on its floor, if any.
 * @param {number[]} cell [x, y, z]
 * @param {{ box(): number[][] }[]} enemies
 */
function enemyIn([x, y, z], enemies) {
  return enemies.find((enemy) => {
    const [bx, by, bz] = enemy.box();
    return Math.floor((bx[0] + bx[1]) / 2) === x && Math.floor(by[0] + REST_EPS) === y && Math.floor((bz[0] + bz[1]) / 2) === z;
  });
}

/**
 * What Pull would take: the first crate or enemy in line within `range`
 * cells, the way `dir` points (towards the wizard: minus his axis), or
 * null when a block, the room's side or another body comes first.
 * @param {import('../game.js').Game} game player, grid, objects, liveEnemies and bodies
 * @param {number} range cells the line reaches, counting the one right in front of him
 * @returns {{ object?: object, enemy?: object, cell: number[], dir: number[], distance: number }|null}
 *   `distance`: 1 right in front of him
 */
export function pullTarget({ player, grid: whole, objects, liveEnemies, bodies }, range) {
  const grid = whole.forBody('crate'); // a crate stream lets the pull through (D198)
  const axis = aimAxis(player.aim());
  const dir = [0 - axis[0], 0 - axis[1]]; // (not −0)
  const cell = frontCell(player.pos, player.size, axis);
  for (let distance = 1; distance <= range; distance++) {
    const [x, y, z] = cell;
    if (!grid.isInside(x, z) || y < 0 || y + 1 > grid.size[1] || grid.isSolid(x, y, z)) return null;
    const object = objects.find((o) => o.kind === 'pushable' && o.state === 'rest' && o.pos.every((v, i) => v === cell[i]));
    if (object) return { object, cell: [...cell], dir, distance };
    const enemy = enemyIn(cell, liveEnemies);
    if (enemy) return enemy.state === 'fall' ? null : { enemy, cell: [...cell], dir, distance };
    const box = cellBox(cell);
    if (bodies.some((body) => body !== player && body.solid !== false && overlapsBox(box, body.box()))) return null;
    cell[0] += axis[0];
    cell[2] += axis[1];
  }
  return null;
}
