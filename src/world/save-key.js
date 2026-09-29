/**
 * The access key (CLAUDE.md §8, D106): what the wizard has, as a short
 * text the player copies, pastes or bookmarks. Plain logic, no browser.
 *
 * Bit layout, 160 payload bits then a 16-bit checksum:
 *   format version 4 | room cell x 8 | room cell z 8 | access level 8 |
 *   pickups 128 | backups 4
 * 176 bits, 44 hex digits shown in groups of 4. The room is its cell on
 * the world map (world.json `positions`, one room per cell), each
 * coordinate a signed byte. The payload is XORed with a stream seeded by
 * the checksum, then every bit is moved by a fixed shuffle, so the key does
 * not show its fields and a small change turns into a very different key.
 */
import { SAVE_KEY_VERSION } from '../core/version.js';
import { PICKUP_BITS } from './progress.js';

/** Hex digits; reading forgives O for 0 and I or L for 1. */
export const KEY_ALPHABET = '0123456789ABCDEF';

const PAYLOAD_BITS = 4 + 8 + 8 + 8 + PICKUP_BITS + 4; // 160, a whole 20 bytes
const CHECK_BITS = 16;
const KEY_BITS = PAYLOAD_BITS + CHECK_BITS;
/** Characters in a key: 4 bits each. */
export const KEY_LENGTH = KEY_BITS / 4;
const GROUP = 4;

/** Small seeded generator (mulberry32) for the shuffle and the XOR stream. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fixed bit shuffle: SHUFFLE[i] is where bit i goes. Never change it (keys depend on it). */
const SHUFFLE = (() => {
  const order = Array.from({ length: KEY_BITS }, (_, i) => i);
  const next = random(0x4e454f4e); // "NEON"
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
})();

/** The payload's XOR stream for a checksum. */
function mask(check) {
  const next = random(check ^ 0x9e3779b9);
  return Array.from({ length: PAYLOAD_BITS }, () => (next() < 0.5 ? 0 : 1));
}

/** CRC-16/CCITT-FALSE of whole bytes of bits. */
function crc16(bits) {
  let crc = 0xffff;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function pushNumber(bits, value, size) {
  for (let b = size - 1; b >= 0; b--) bits.push((value >>> b) & 1);
}

function readNumber(bits, at, size) {
  let value = 0;
  for (let b = 0; b < size; b++) value = (value << 1) | bits[at + b];
  return value;
}

function checkField(name, value, size, min = 0) {
  const max = min + 2 ** size - 1;
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`save key ${name} ${value} is outside ${min}–${max}`);
}

/** A signed byte read as a number (−128–127). */
function signed(byte) {
  return byte >= 128 ? byte - 256 : byte;
}

/**
 * @typedef {object} SaveState
 * @property {[number, number]} cell the room's cell on the world map, [x, z], each −128–127
 * @property {number} access access level (0–15, D91)
 * @property {Iterable<number>} found permanent pickup bits found (0–127)
 * @property {number} backups backups (lives, D97) left, 0–15; a load starts with full integrity
 */

/**
 * Write a save as an access key, e.g. `3FA0-7C91-B2E4-...`.
 * @param {SaveState} save
 * @returns {string}
 */
export function encodeKey({ cell, access, found, backups }) {
  const [x, z] = cell;
  checkField('room cell x', x, 8, -128);
  checkField('room cell z', z, 8, -128);
  checkField('access level', access, 4); // 8 bits kept, 4 used (D91)
  checkField('backups', backups, 4);
  const pickups = new Array(PICKUP_BITS).fill(0);
  for (const bit of found) {
    checkField('pickup bit', bit, 7);
    pickups[bit] = 1;
  }

  const payload = [];
  pushNumber(payload, SAVE_KEY_VERSION, 4);
  pushNumber(payload, x & 0xff, 8);
  pushNumber(payload, z & 0xff, 8);
  pushNumber(payload, access, 8);
  payload.push(...pickups);
  pushNumber(payload, backups, 4);

  const check = crc16(payload);
  const xor = mask(check);
  const plain = payload.map((bit, i) => bit ^ xor[i]);
  pushNumber(plain, check, CHECK_BITS);

  const shuffled = new Array(KEY_BITS);
  plain.forEach((bit, i) => (shuffled[SHUFFLE[i]] = bit));
  let text = '';
  for (let i = 0; i < KEY_BITS; i += 4) text += KEY_ALPHABET[readNumber(shuffled, i, 4)];
  return text.match(new RegExp(`.{1,${GROUP}}`, 'g')).join('-');
}

/**
 * A typed or pasted key as bare key characters: spaces and dashes
 * dropped, lowercase raised, O read as 0 and I or L as 1.
 * @param {string} text
 */
export function normalizeKey(text) {
  return String(text)
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Read an access key.
 * @param {string} text what the player typed or pasted (URL hash included, `#` first is fine)
 * @returns {{ ok: true, save: { cell: [number, number], access: number, found: number[], backups: number } }
 *   | { ok: false, error: 'empty' | 'length' | 'character' | 'checksum' | 'version' }}
 *   an error names why the key was refused (strings.json has a message for each)
 */
export function decodeKey(text) {
  const chars = normalizeKey(String(text).replace(/^#/, ''));
  if (chars.length === 0) return { ok: false, error: 'empty' };
  if (chars.length !== KEY_LENGTH) return { ok: false, error: 'length' };

  const shuffled = [];
  for (const char of chars) {
    const value = KEY_ALPHABET.indexOf(char);
    if (value < 0) return { ok: false, error: 'character' };
    pushNumber(shuffled, value, 4);
  }
  const plain = SHUFFLE.map((to) => shuffled[to]);

  const check = readNumber(plain, PAYLOAD_BITS, CHECK_BITS);
  const xor = mask(check);
  const payload = plain.slice(0, PAYLOAD_BITS).map((bit, i) => bit ^ xor[i]);
  if (crc16(payload) !== check) return { ok: false, error: 'checksum' };

  if (readNumber(payload, 0, 4) !== SAVE_KEY_VERSION) return { ok: false, error: 'version' };
  const cell = [signed(readNumber(payload, 4, 8)), signed(readNumber(payload, 12, 8))];
  const access = readNumber(payload, 20, 8);
  const found = [];
  for (let bit = 0; bit < PICKUP_BITS; bit++) if (payload[28 + bit]) found.push(bit);
  const backups = readNumber(payload, 28 + PICKUP_BITS, 4);
  // A checksum that matches by chance still has to make sense.
  if (access > 15) return { ok: false, error: 'checksum' };
  return { ok: true, save: { cell, access, found, backups } };
}
