/**
 * Debug info for a tester's report (step 5.13): the pause menu's Copy
 * debug info puts it on the clipboard. Plain text, a line each: the
 * versions, the room and where he stands, a key of this moment (not a
 * save: nothing is stored), his state, the quality in use and the browser.
 */
import { DATA_SCHEMA_VERSION, GAME_VERSION, SAVE_KEY_VERSION } from '../core/version.js';
import { saveGame } from '../world/save-game.js';

/**
 * @param {import('../game.js').Game} game
 * @param {object} [env] what the page knows (main.js); each part optional
 * @param {Record<string, number | string>} [env.settings] the player's settings (ui/settings.js)
 * @param {{ renderScale: number, multisampling: number }} [env.renderer] the quality in use now
 * @param {number} [env.pixelRatio] window.devicePixelRatio
 * @param {[number, number]} [env.viewport] the window's size in CSS pixels
 * @param {string} [env.userAgent]
 * @returns {string}
 */
export function debugInfo(game, env = {}) {
  const { player, progress, room } = game;
  let key;
  try {
    key = saveGame(game);
  } catch {
    key = 'none (the room has no map cell)';
  }
  const lines = [
    `NEONMANCER ${GAME_VERSION} (data ${DATA_SCHEMA_VERSION}, key format ${SAVE_KEY_VERSION})`,
    `room: ${room.id} at ${player.pos.map((v) => v.toFixed(2)).join(' ')}`,
    `key now: ${key}`,
    `integrity ${player.integrity}/${player.maxIntegrity}, energy ${Math.round(player.energy)}/${player.maxEnergy}, backups ${player.backups}, access ${progress.accessLevel}, found ${progress.found.size}`,
  ];
  if (env.settings) lines.push(`settings: ${Object.entries(env.settings).map(([id, value]) => `${id} ${value}`).join(', ')}`);
  if (env.renderer) {
    lines.push(`render: scale ${env.renderer.renderScale}, msaa ${env.renderer.multisampling}, pixel ratio ${env.pixelRatio ?? 1}`);
  }
  if (env.viewport) lines.push(`window: ${env.viewport[0]}x${env.viewport[1]}`);
  if (env.userAgent) lines.push(`browser: ${env.userAgent}`);
  return lines.join('\n');
}
