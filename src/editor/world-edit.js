/**
 * world.json while the room editor changes its connections (D57): exits are
 * connected and disconnected from the room they are in, and each room's
 * undo steps take that room's connections along. Plain logic, no browser.
 */
import { formatJson } from './format-json.js';

/** Is "room.exit" an exit of `roomId`? */
const inRoom = (ref, roomId) => ref.startsWith(`${roomId}.`);

/** Same pair, the same way round. */
const samePair = (a, b) => a[0] === b[0] && a[1] === b[1];

export class WorldEdit {
  /** @param {object} data world.json contents */
  constructor(data) {
    this.data = structuredClone(data);
    /** Text as last saved (or loaded), to tell unsaved changes. */
    this.savedText = this.text();
  }

  /** @returns {string[][]} pairs of "room.exit" */
  get connections() {
    return this.data.connections;
  }

  toData() {
    return structuredClone(this.data);
  }

  text() {
    return formatJson(this.data);
  }

  get dirty() {
    return this.text() !== this.savedText;
  }

  markSaved() {
    this.savedText = this.text();
  }

  /**
   * The exit `ref` is connected to, or null.
   * @param {string} ref "room.exit"
   */
  partner(ref) {
    const pair = this.connections.find((p) => p.includes(ref));
    return pair ? pair[pair[0] === ref ? 1 : 0] : null;
  }

  /**
   * Connect two exits, dropping what either was connected to before.
   * @returns {boolean} whether anything changed
   */
  connect(a, b) {
    if (this.partner(a) === b) return false;
    this.disconnect(a);
    this.disconnect(b);
    this.connections.push([a, b]);
    return true;
  }

  /** @returns {boolean} whether `ref` was connected */
  disconnect(ref) {
    const before = this.connections.length;
    this.data.connections = this.connections.filter((pair) => !pair.includes(ref));
    return this.connections.length !== before;
  }

  /** An exit got a new id: its connection follows. */
  rename(ref, to) {
    for (const pair of this.connections) pair.forEach((r, i) => r === ref && (pair[i] = to));
  }

  /**
   * The connections of a room's exits (copies).
   * @param {string} roomId
   * @param {string[][]} [connections] from these instead of the current ones
   */
  linksOf(roomId, connections = this.connections) {
    return connections.filter((pair) => pair.some((ref) => inRoom(ref, roomId))).map((pair) => [...pair]);
  }

  /** The room's connections as last saved. */
  savedLinksOf(roomId) {
    return this.linksOf(roomId, JSON.parse(this.savedText).connections);
  }

  /**
   * Make `links` the room's connections: the ones it keeps stay where they
   * are in the list, new ones go at the end (small diffs of world.json).
   * @param {string} roomId
   * @param {string[][]} links
   */
  setLinks(roomId, links) {
    const kept = this.connections.filter((pair) => !pair.some((ref) => inRoom(ref, roomId)) || links.some((link) => samePair(link, pair)));
    const added = links.filter((link) => !kept.some((pair) => samePair(pair, link)));
    this.data.connections = [...kept, ...added.map((pair) => [...pair])];
  }
}
