/**
 * Movement behaviors by name, as enemy templates in defs.json refer to them
 * ("movement"). A behavior is made with the enemy's start cell, its path
 * (if any) and its values (its enemy template, filled in) and has:
 * - `next(x, z, senses, route)`: the next step [dx, dz] from the enemy's
 *   column, or a list of steps to try, best first, or null to stay put this
 *   tick; `senses` is the enemy (sees, lastSeen, inRange; see
 *   Enemy.sense()), `route(column)` the first step of a shortest walk to a
 *   column round walls, or null (Enemy.route());
 * - `turnBack()`: the step it was taking is blocked;
 * - optionally `update(senses)`, called every tick, `alarm()`, when
 *   something hits it (Enemy.alarm()), and `chasing` (true while it
 *   moves at its chase speed).
 * A new behavior is a class here, listed in ENEMY_OPTIONS (data/room-data.js)
 * and schemas/defs.schema.json.
 */
import { Chase } from './chase.js';
import { Patrol } from './patrol.js';

/** Stays in its cell (it still falls and rides platforms, like any enemy). */
export class Stationary {
  next() {
    return null;
  }

  turnBack() {}
}

export const BEHAVIORS = {
  patrol: Patrol,
  stationary: Stationary,
  chase: Chase,
};
