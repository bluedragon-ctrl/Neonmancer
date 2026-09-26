/**
 * Flip-screen exits: noticing that the wizard walked out through an exit,
 * and where he arrives in the connected room. Pure logic.
 *
 * The room boundary is solid except at exit openings (world/grid.js), so the
 * wizard's center can only leave the room through one. He then arrives at
 * the matching exit of the connected room, keeping his offset along the
 * edge and his height above the exit floor. Where he respawns if he dies is
 * a separate, room-authored point (`reset`, D39) — not tied to this arrival.
 */
import { PLAYER_HITBOX } from '../core/rules.js';
import { isBackSide, sideAxes } from '../data/room-data.js';

/** Distance of the arrival point from the side: the middle of the first cell. */
const ARRIVAL_DEPTH = 0.5;

/**
 * The exit a body has left the room through, or null while its feet center
 * is inside the room's sides.
 * @param {{ size: number[], exits: object[] }} room runtime room
 * @param {number[]} pos feet center [x, y, z]
 */
export function exitAt({ size, exits }, pos) {
  for (const exit of exits) {
    const { cross, along } = sideAxes(exit.side);
    const out = isBackSide(exit.side) ? pos[cross] < 0 : pos[cross] > size[cross];
    if (out && pos[along] >= exit.at && pos[along] <= exit.at + exit.width) return exit;
  }
  return null;
}

/**
 * Where a body leaving through `from` at `pos` arrives in the room behind
 * `to` (the connected exit, on the opposite side).
 * @param {object} from exit left through (defaults applied)
 * @param {number[]} pos feet center when leaving
 * @param {object} to exit arrived at (defaults applied)
 * @param {number[]} size size of the room arrived in
 * @returns {number[]} arrival position (feet center); not the death-respawn
 *   point, see `reset` in room data
 */
export function arrival(from, pos, to, size) {
  const { cross, along } = sideAxes(to.side);
  const half = PLAYER_HITBOX[along] / 2;
  const offset = pos[along] - from.at;
  const arrived = [0, 0, 0];
  arrived[along] = Math.min(Math.max(to.at + offset, to.at + half), to.at + to.width - half);
  arrived[cross] = isBackSide(to.side) ? ARRIVAL_DEPTH : size[cross] - ARRIVAL_DEPTH;
  arrived[1] = to.y + Math.max(pos[1] - from.y, 0);
  return arrived;
}
