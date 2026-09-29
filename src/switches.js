/**
 * Switches and the locked exits they open (D69, D75), and exits locked
 * behind an access level (D101). Functions of the
 * Game (game.js); they change its state and report through game.emit().
 */
import { say } from './core/messages.js';
import { exitCells } from './data/room-data.js';
import { cellBox, overlapsBox } from './physics/collision.js';

/**
 * The room's locked exits, each opened or closed to start with (see
 * lockWanted()). Needs the room's grid, switches and entry exit.
 * @param {import('./game.js').Game} game
 * @returns {{ exit: object, open: boolean }[]}
 */
export function createLocks(game) {
  const locks = game.room.exits.filter((exit) => exit.locked || exit.access).map((exit) => ({ exit, open: false }));
  for (const lock of locks) setLock(game, lock, lockWanted(game, lock));
  return locks;
}

/**
 * Plates follow what stands on them (a crate, an enemy, the wizard);
 * targets were switched by bolts already. Then the locked exits follow
 * the switches and his access level (raised at the core, D101): open while every one is on (reported as 'unlock', with a
 * terminal line), closed again ('lock') once one goes off, but never on
 * the wizard: while he stands in the opening it waits (D75).
 * @param {import('./game.js').Game} game
 */
export function updateSwitches(game) {
  if (game.switches.length === 0 && game.locks.length === 0) return;
  const { player } = game;
  const boxes = [
    ...game.objects.filter((object) => object.kind === 'pushable' && object.solid).map((object) => object.box()),
    ...game.liveEnemies.map((enemy) => enemy.box()),
    ...(player.dead ? [] : [player.box()]),
  ];
  for (const plate of game.switches) {
    if (plate.kind !== 'plate') continue;
    if (plate.press(plate.pressedBy(boxes))) game.emit('switch', { object: plate });
  }
  let unlocked = false;
  for (const lock of game.locks) {
    const open = lockWanted(game, lock);
    if (open === lock.open || (!open && inOpening(game, lock.exit))) continue;
    setLock(game, lock, open);
    game.emit(open ? 'unlock' : 'lock', { exit: lock.exit });
    unlocked ||= open;
  }
  if (unlocked) say('msg.unlocked');
}

/**
 * Should a locked exit be open: every switch on (a switch lock) and his
 * access level high enough (an access lock), or the wizard came in through it?
 */
function lockWanted(game, { exit }) {
  if (exit.id === game.entryExit) return true;
  const switched = !exit.locked || game.switches.every((object) => object.on);
  return switched && game.progress.accessLevel >= (exit.access ?? 0);
}

/** Open or close a locked exit (its opening in the grid). */
function setLock(game, lock, open) {
  lock.open = open;
  game.grid.setOpening(lock.exit, open);
}

/** Is the wizard in the opening of `exit` (its row of cells beyond the side)? */
function inOpening(game, exit) {
  const box = game.player.box();
  return exitCells(exit, game.room.size).outside.some((cell) => overlapsBox(box, cellBox(cell)));
}

/**
 * Is the exit open? Every exit is, except a locked one while its switches
 * are not all on (D75) or his access level is too low (D101).
 * @param {import('./game.js').Game} game
 * @param {object} exit exit of the current room
 */
export function exitOpen(game, exit) {
  return game.locks.find((lock) => lock.exit === exit)?.open ?? true;
}

/**
 * How many of the room's switches are on (the lights on its locked exits).
 * @param {import('./game.js').Game} game
 */
export function switchesOn(game) {
  return game.switches.filter((object) => object.on).length;
}
