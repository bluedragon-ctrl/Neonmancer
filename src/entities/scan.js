/**
 * Scan (D128): a square wave spreads from the wizard's feet over the grid,
 * out to the spell's range, and reveals the hidden things it reaches:
 * fake blocks (a block type with `fake`, looking like any plain block)
 * derez, hidden exits (`hidden` in room data, solid wall until then) open.
 * What it reveals stays revealed until the room resets. Distances are
 * along x and z only (the wave covers every height), measured to the
 * nearest point of a cell or an exit's opening, square like the grid.
 */
import { say } from '../core/messages.js';
import { isBackSide, sideAxes } from '../data/room-data.js';
import { revealExit } from '../switches.js';

export const SCAN = {
  /** Ticks the wave takes to spread to the spell's range (it shows for PLAYER.scanTicks). */
  spreadTicks: 30,
};

/**
 * How far the wave of a scan has spread `tick` ticks after the cast.
 * @param {number} tick may be fractional
 * @param {number} range the spell's range
 */
export function scanReach(tick, range) {
  return range * Math.min(Math.max(tick / SCAN.spreadTicks, 0), 1);
}

/** Distance from `v` to the span [min, max] (0 inside it). */
function span(v, min, max) {
  return Math.max(min - v, v - max, 0);
}

/**
 * Distance of the cell [x, y, z] from `origin` (a point), along x and z,
 * square: the wave reaches it once it covers any of its footprint.
 */
export function cellReach(origin, [x, , z]) {
  return Math.max(span(origin[0], x, x + 1), span(origin[2], z, z + 1));
}

/**
 * Distance of an exit's opening (a stretch of the room's side) from `origin`.
 * @param {number[]} origin
 * @param {{ side: string, at: number, width: number }} exit exit with defaults applied
 * @param {number[]} size room size
 */
export function exitReach(origin, { side, at, width }, size) {
  const { cross, along } = sideAxes(side);
  const line = isBackSide(side) ? 0 : size[cross];
  return Math.max(Math.abs(origin[cross] - line), span(origin[along], at, at + width));
}

/**
 * What a scan can reveal in a freshly built room: the cells of its fake
 * blocks, and its hidden exits but the one he came in through (open for
 * him, D75, so it shows from the start).
 * @param {object} room runtime room (world/room.js)
 * @param {string|null} entry id of the exit he came in through
 * @returns {{ cells: { type: string, cell: number[] }[], exits: object[] }}
 */
export function hiddenThings(room, entry) {
  const cells = Object.entries(room.blocks)
    .filter(([type]) => room.blockTypes[type].fake)
    .flatMap(([type, list]) => list.map((cell) => ({ type, cell })));
  const exits = room.exits.filter((exit) => exit.hidden && exit.id !== entry);
  return { cells, exits };
}

/**
 * Once per tick, while a scan's wave spreads: reveal what it has reached
 * ('reveal' with the cell or the exit). The first find of a scan prints a
 * terminal line.
 * @param {import('../game.js').Game} game
 */
export function updateScan(game) {
  const { scan } = game.player;
  if (!scan) return;
  const reach = scanReach(scan.tick, scan.range);
  const { hidden, room } = game;
  const cells = hidden.cells.filter(({ cell }) => cellReach(scan.origin, cell) <= reach);
  const exits = hidden.exits.filter((exit) => exitReach(scan.origin, exit, room.size) <= reach);
  if (cells.length === 0 && exits.length === 0) return;
  for (const found of cells) {
    hidden.cells.splice(hidden.cells.indexOf(found), 1);
    const list = room.blocks[found.type];
    list.splice(list.indexOf(found.cell), 1);
    game.grid.clearCell(...found.cell);
    game.emit('reveal', { cell: found.cell });
  }
  for (const exit of exits) {
    hidden.exits.splice(hidden.exits.indexOf(exit), 1);
    revealExit(game, exit);
    game.emit('reveal', { exit });
  }
  game.reveals += cells.length + exits.length;
  if (!scan.found) say('msg.scanFound');
  scan.found = true;
}
