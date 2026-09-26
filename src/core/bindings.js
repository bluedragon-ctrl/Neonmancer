/**
 * Default key bindings: action name → physical keys.
 *
 * Keys are KeyboardEvent.code values, which name the physical key position,
 * so WASD stays in the same place on QWERTY, QWERTZ and AZERTY keyboards.
 * This is the only place in the game where raw keys appear.
 */

/** All actions the game understands. */
export const ACTIONS = [
  'up',
  'down',
  'left',
  'right',
  'jump',
  'cast',
  'spellNext',
  'spellPrev',
  'pause',
  'map',
  'movementMode',
  'debug',
  'debugRoomNext',
  'debugRoomPrev',
  'debugInvincible',
  'debugDamage',
  'fullscreen',
];

/** @type {Record<string, string[]>} */
export const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  cast: ['KeyE', 'Numpad0'],
  spellNext: ['Tab'],
  spellPrev: ['KeyQ'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM'],
  movementMode: ['KeyG'],
  debug: ['F3'],
  // Only acted on while debug mode is on (src/debug/overlay.js).
  debugRoomNext: ['BracketRight'],
  debugRoomPrev: ['BracketLeft'],
  debugInvincible: ['KeyI'],
  debugDamage: ['KeyH'],
  fullscreen: ['KeyF'],
};
