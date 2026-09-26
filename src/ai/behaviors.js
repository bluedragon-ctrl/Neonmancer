/**
 * Movement behaviors by name, as enemy types in defs.json refer to them
 * ("movement"). A behavior is made with the enemy's start cell and its path
 * (if any) and has:
 * - `next(x, z)`: the next step [dx, dz] from the enemy's column, or null to
 *   stay put this tick;
 * - `turnBack()`: the step it was taking is blocked.
 * A new behavior is a class here, listed in ENEMY_OPTIONS (data/room-data.js)
 * and schemas/defs.schema.json.
 */
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
};
