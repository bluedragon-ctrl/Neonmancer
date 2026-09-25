/**
 * HUD text from anywhere in the game, by key from data/strings.json:
 * - say(): a terminal message, typed out bottom left;
 * - announce(): a big banner at the top (room names, later pickups such as
 *   a spell being installed).
 * Both only queue; the HUD takes the queues every frame. Plain logic
 * without DOM, so game logic and tests can call them too. Visual only:
 * nothing in the simulation reads them back.
 */

/** @typedef {Record<string, string | number>} Values values for a string's {placeholders} */

/** @type {{ key: string, values?: Values }[]} */
const messages = [];
/** @type {{ key: string, values?: Values, sub?: string, subValues?: Values, color?: string }[]} */
const announcements = [];

/** Keep at most this many unread entries (e.g. when nothing drains the queue, as in tests). */
const MAX_QUEUED = 32;

function queue(list, entry) {
  list.push(entry);
  if (list.length > MAX_QUEUED) list.shift();
}

/**
 * Print a terminal message, e.g. say('msg.plug'). A string like
 * "> FRAGMENT {count}/{total} GET!" takes values: { count: 3, total: 8 }.
 * @param {string} key string key in data/strings.json
 * @param {Values} [values]
 */
export function say(key, values) {
  queue(messages, { key, values });
}

/**
 * Show a banner at the top of the screen: a title decoding in, an optional
 * smaller line under it, in `color`. A new banner replaces the one showing.
 * e.g. announce('banner.room', { room: 'Cache Hall' }, { sub: 'banner.biome', subValues: { biome }, color })
 * @param {string} key string key of the title
 * @param {Values} [values]
 * @param {{ sub?: string, subValues?: Values, color?: string }} [options] sub: string key of
 *   the smaller line; color: #rrggbb (amber by default)
 */
export function announce(key, values, { sub, subValues, color } = {}) {
  queue(announcements, { key, values, sub, subValues, color });
}

/**
 * Take every terminal message queued since the last call (the HUD calls this each frame).
 * @returns {{ key: string, values?: Values }[]}
 */
export function takeMessages() {
  return messages.splice(0);
}

/**
 * Take every banner queued since the last call; the HUD shows the last one.
 * @returns {{ key: string, values?: Values, sub?: string, subValues?: Values, color?: string }[]}
 */
export function takeAnnouncements() {
  return announcements.splice(0);
}
