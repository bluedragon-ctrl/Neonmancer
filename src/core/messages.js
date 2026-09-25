/**
 * Terminal messages from anywhere in the game: call say() with a key from
 * data/strings.json (and values for its {placeholders}); the HUD picks the
 * queued messages up every frame and types them out. Plain logic without
 * DOM, so game logic and tests can call it too. Messages are visual only;
 * nothing in the simulation reads them back.
 */

/** @type {{ key: string, values?: Record<string, string | number> }[]} */
const queue = [];

/** Keep at most this many unread messages (e.g. when nothing drains the queue, as in tests). */
const MAX_QUEUED = 32;

/**
 * Print a terminal message, e.g. say('msg.plug'). A string like
 * "> FRAGMENT {count}/{total} GET!" takes values: { count: 3, total: 8 }.
 * @param {string} key string key in data/strings.json
 * @param {Record<string, string | number>} [values] values for the {placeholders}
 */
export function say(key, values) {
  queue.push({ key, values });
  if (queue.length > MAX_QUEUED) queue.shift();
}

/**
 * Take every message queued since the last call (the HUD calls this each frame).
 * @returns {{ key: string, values?: Record<string, string | number> }[]}
 */
export function takeMessages() {
  return queue.splice(0);
}
