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
  'debug',
  'fullscreen',
];

/** @type {Record<string, string[]>} */
export const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  cast: ['KeyJ'],
  spellNext: ['KeyE'],
  spellPrev: ['KeyQ'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM'],
  debug: ['F3'],
  fullscreen: ['KeyF'],
};
