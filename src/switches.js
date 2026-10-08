/**
 * Switches and what they power (D69, D75, D140): locked exits, gates and
 * platforms, each powered while every switch linked to it is on (its own
 * `switches` list of ids, or every switch in the room); exits locked
 * behind an access level (D101), and hidden exits a scan reveals (D128),
 * solid wall until then. Functions of the Game (game.js); they change its
 * state and report through game.emit().
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
  const locks = game.room.exits.filter((exit) => exit.locked || exit.access || exit.hidden).map((exit) => ({ exit, open: false }));
  for (const lock of locks) setLock(game, lock, lockWanted(game, lock));
  return locks;
}

/**
 * The switches linked to something: those named in `ids`, or every switch
 * in the room.
 * @param {import('./game.js').Game} game
 * @param {string[]|null} [ids]
 */
export function linkedSwitches(game, ids) {
  return ids ? game.switches.filter((object) => ids.includes(object.id)) : game.switches;
}

/**
 * Is something linked to `ids` powered: its switches all on (and at least one)?
 * @param {import('./game.js').Game} game
 * @param {string[]|null} [ids]
 */
export function powered(game, ids) {
  const linked = linkedSwitches(game, ids);
  return linked.length > 0 && linked.every((object) => object.on);
}

/**
 * Plates follow what stands on them (a crate, an enemy, the wizard, his
 * decoy, D129), sockets their hole (filled or not, D194); targets were switched by bolts already, and timed ones
 * counted down with the objects (D140). A timed switch counting down
 * ticks ('tick', every second, twice as often in its last two). Then
 * gates and platforms follow their switches (D140): a gate opens or
 * closes ('gate'), a platform runs or stops. Then the locked exits
 * follow their switches and his access level (raised at the core, D101):
 * open while every one is on (reported as 'unlock', with a terminal
 * line), closed again ('lock') once one goes off, but never on the
 * wizard: while he stands in the opening it waits (D75).
 * @param {import('./game.js').Game} game
 */
export function updateSwitches(game) {
  if (game.switches.length === 0 && game.locks.length === 0) return;
  const { player } = game;
  const boxes = [
    ...game.objects.filter((object) => object.kind === 'pushable' && object.solid).map((object) => object.box()),
    ...game.liveEnemies.map((enemy) => enemy.box()),
    ...(player.dead ? [] : [player.box()]),
    ...(game.decoy?.active ? [game.decoy.box()] : []),
  ];
  for (const object of game.switches) {
    if (object.kind === 'plate' && object.press(object.pressedBy(boxes))) game.emit('switch', { object });
    // A socket is on while its hole is filled (D194).
    if (object.kind === 'socket' && object.fill(!game.grid.isHole(object.pos[0] + 0.5, object.pos[2] + 0.5))) game.emit('switch', { object });
    const left = object.countdown === null ? 0 : object.left;
    if (left > 0 && left % (left <= 120 ? 30 : 60) === 0) game.emit('tick', { object });
  }

  let changed = false;
  for (const object of game.objects) {
    if (object.kind === 'gate' && object.trigger === 'switch') {
      const event = object.power(powered(game, object.switches), [...game.bodies, ...(game.decoy?.active ? [game.decoy] : [])]);
      if (event) game.emit('gate', { object, open: event === 'open' });
      changed ||= event !== null;
    } else if (object.kind === 'platform' && object.switches) object.powered = powered(game, object.switches);
  }
  if (changed) game.refreshBodies();
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
 * Should a locked exit be open: revealed if hidden (D128), every switch on
 * (a switch lock) and his access level high enough (an access lock), or the wizard came in
 * through it?
 */
function lockWanted(game, { exit }) {
  if (exit.id === game.entryExit) return true;
  if (game.hidden.exits.includes(exit)) return false;
  const switched = !exit.locked || powered(game, exit.switches);
  return switched && game.progress.accessLevel >= (exit.access ?? 0);
}

/** Open or close a locked exit (its opening in the grid). */
function setLock(game, lock, open) {
  lock.open = open;
  game.grid.setOpening(lock.exit, open);
}

/**
 * A scan revealed the hidden exit `exit` (D128): it opens now, unless it
 * is locked too and waits for its switches or his access level. Opening
 * here, not in updateSwitches(), leaves out the 'unlock' of a lock.
 * @param {import('./game.js').Game} game
 * @param {object} exit
 */
export function revealExit(game, exit) {
  const lock = game.locks.find((one) => one.exit === exit);
  if (lock && lockWanted(game, lock)) setLock(game, lock, true);
}

/** Is the wizard in the opening of `exit` (its row of cells beyond the side)? */
function inOpening(game, exit) {
  const box = game.player.box();
  return exitCells(exit, game.room.size).outside.some((cell) => overlapsBox(box, cellBox(cell)));
}

/**
 * Is the exit open? Every exit is, except a locked one while its switches
 * are not all on (D75) or his access level is too low (D101), and a
 * hidden one until a scan reveals it (D128).
 * @param {import('./game.js').Game} game
 * @param {object} exit exit of the current room
 */
export function exitOpen(game, exit) {
  return game.locks.find((lock) => lock.exit === exit)?.open ?? true;
}

/**
 * How many of the switches linked to `ids` (every switch in the room by
 * default) are on: the lights on a locked exit.
 * @param {import('./game.js').Game} game
 * @param {string[]|null} [ids]
 */
export function switchesOn(game, ids) {
  return linkedSwitches(game, ids).filter((object) => object.on).length;
}
