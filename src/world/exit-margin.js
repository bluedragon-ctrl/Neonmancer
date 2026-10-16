/**
 * Puzzle pieces too close to an exit (D241). A wizard pushing a crate,
 * stepping on a plate or bouncing off a pad beside a door walks out by
 * accident, and coming back in resets the room. So every piece he works
 * with keeps at least 2 cells of floor between it and every doorway: no
 * piece in the 2 rows in front of a door, nor in the cell beside either
 * end of it. Plain logic; `check:reach` prints what it finds.
 *
 * It checks where pieces start, not where a solution pushes crates; a
 * crate route past a door is for the review to see.
 */
import { isBackSide, sideAxes } from '../data/room-data.js';
import { buildRoom } from './room.js';

/** Object kinds he works with: pushed, stood on, filled or thrown by. */
const PIECE_KINDS = new Set(['pushable', 'plate', 'socket', 'pad']);

/** Cells of floor kept free between a piece and a doorway. */
export const EXIT_MARGIN = 2;

/**
 * How far a cell lies from an exit's doorway, in whole cells: 0 in the
 * doorway's first row, counted across the side and along it past its ends
 * (whichever is more). Height is not counted: a door raised over a piece
 * is still flagged, for the review to judge.
 * @param {{ size: number[] }} room
 * @param {{ side: string, at: number, width?: number }} exit
 * @param {number[]} cell [x, y, z]
 */
export function exitDistance({ size }, exit, cell) {
  const { cross, along } = sideAxes(exit.side);
  const across = isBackSide(exit.side) ? cell[cross] : size[cross] - 1 - cell[cross];
  const last = exit.at + (exit.width ?? 2) - 1;
  const past = Math.max(0, exit.at - cell[along], cell[along] - last);
  return Math.max(across, past);
}

/**
 * Pieces closer to an exit than EXIT_MARGIN.
 * @param {{ size: number[], exits?: object[], objects?: object[] }} room runtime room (object kinds resolved)
 * @returns {{ piece: string, exit: string, distance: number }[]}
 */
export function piecesNearExits(room) {
  const near = [];
  for (const object of room.objects ?? []) {
    if (!PIECE_KINDS.has(object.kind)) continue;
    for (const exit of room.exits ?? []) {
      const distance = exitDistance(room, exit, object.at);
      if (distance < EXIT_MARGIN) near.push({ piece: object.id, exit: exit.id, distance });
    }
  }
  return near;
}

/**
 * The world's rooms with pieces near an exit, as warnings "<room>: ...".
 * @param {object} content loaded game data (rooms as data, the type tables)
 * @param {Iterable<string>} [only] room ids to check (default every room)
 * @returns {string[]}
 */
export function exitMarginWarnings(content, only = content.rooms.keys()) {
  const warnings = [];
  for (const id of only) {
    for (const { piece, exit, distance } of piecesNearExits(buildRoom(content.rooms.get(id), content))) {
      warnings.push(`${id}: ${piece} is ${distance === 0 ? 'in front of' : '1 cell from'} exit "${exit}"; keep pieces ${EXIT_MARGIN} cells from a door (D241)`);
    }
  }
  return warnings;
}
