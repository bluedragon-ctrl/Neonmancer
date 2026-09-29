import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeKey, decodeKey, normalizeKey, KEY_ALPHABET, KEY_LENGTH } from '../src/world/save-key.js';
import { PICKUP_BITS } from '../src/world/progress.js';

const SAVE = { cell: [-3, 5], access: 2, found: [0, 3, 16, 33, 48, 49, 50, 111, 112, 127], backups: 5 };

test('alphabet is hex', () => {
  assert.equal(KEY_ALPHABET, '0123456789ABCDEF');
});

test('a key is 44 hex digits in dashed groups of 4', () => {
  assert.equal(KEY_LENGTH, 44);
  assert.match(encodeKey(SAVE), /^[0-9A-F]{4}(-[0-9A-F]{4}){10}$/);
});

test('round trip keeps every field', () => {
  assert.deepEqual(decodeKey(encodeKey(SAVE)), { ok: true, save: SAVE });
});

test('round trip at the edges: nothing found and everything found', () => {
  const empty = { cell: [0, 0], access: 0, found: [], backups: 0 };
  assert.deepEqual(decodeKey(encodeKey(empty)).save, empty);
  const full = { cell: [127, -128], access: 15, found: Array.from({ length: PICKUP_BITS }, (_, i) => i), backups: 15 };
  assert.deepEqual(decodeKey(encodeKey(full)).save, full);
});

test('every single pickup bit comes back on its own', () => {
  for (let bit = 0; bit < PICKUP_BITS; bit++) {
    const save = { cell: [bit - 64, 63 - bit], access: bit % 16, found: [bit], backups: bit % 16 };
    assert.deepEqual(decodeKey(encodeKey(save)).save, save);
  }
});

test('keys do not show their fields: one more pickup changes most of the key', () => {
  const a = encodeKey(SAVE);
  const b = encodeKey({ ...SAVE, found: [...SAVE.found, 5] });
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  assert.ok(same < a.length / 2, `${same} of ${a.length} characters unchanged`);
});

test('input forgives spaces, dashes, lowercase, O for 0 and I or L for 1, and a leading #', () => {
  const key = encodeKey(SAVE);
  const sloppy = key.replace(/-/g, ' ').toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
  assert.deepEqual(decodeKey(sloppy), { ok: true, save: SAVE });
  assert.deepEqual(decodeKey(`#${key.replace(/-/g, '')}`), { ok: true, save: SAVE });
  assert.equal(normalizeKey(' ab-c o i l '), 'ABC011');
});

test('every single wrong character is refused', () => {
  const chars = normalizeKey(encodeKey(SAVE));
  for (let i = 0; i < chars.length; i++) {
    for (const other of KEY_ALPHABET) {
      if (other === chars[i]) continue;
      const result = decodeKey(chars.slice(0, i) + other + chars.slice(i + 1));
      assert.equal(result.ok, false, `character ${i} as ${other} was accepted`);
    }
  }
});

test('two swapped characters are refused', () => {
  const chars = normalizeKey(encodeKey(SAVE));
  for (let i = 0; i + 1 < chars.length; i++) {
    if (chars[i] === chars[i + 1]) continue;
    const swapped = chars.slice(0, i) + chars[i + 1] + chars[i] + chars.slice(i + 2);
    assert.equal(decodeKey(swapped).ok, false, `swap at ${i} was accepted`);
  }
});

test('refusals say why', () => {
  const chars = normalizeKey(encodeKey(SAVE));
  assert.deepEqual(decodeKey(''), { ok: false, error: 'empty' });
  assert.deepEqual(decodeKey(' - '), { ok: false, error: 'empty' });
  assert.deepEqual(decodeKey(chars.slice(1)), { ok: false, error: 'length' });
  assert.deepEqual(decodeKey(`${chars}A`), { ok: false, error: 'length' });
  assert.deepEqual(decodeKey(`${chars.slice(1)}G`), { ok: false, error: 'character' });
  assert.deepEqual(decodeKey(`${chars.slice(1)}${chars[0] === 'A' ? 'B' : 'A'}`).ok, false);
});

test('encoding refuses values the key cannot hold', () => {
  assert.throws(() => encodeKey({ ...SAVE, cell: [128, 0] }), RangeError);
  assert.throws(() => encodeKey({ ...SAVE, cell: [0, -129] }), RangeError);
  assert.throws(() => encodeKey({ ...SAVE, access: 16 }), RangeError);
  assert.throws(() => encodeKey({ ...SAVE, backups: -1 }), RangeError);
  assert.throws(() => encodeKey({ ...SAVE, backups: 16 }), RangeError);
  assert.throws(() => encodeKey({ ...SAVE, found: [128] }), RangeError);
  assert.throws(() => encodeKey({ ...SAVE, cell: [1.5, 0] }), RangeError);
});

test('the same save always gives the same key', () => {
  assert.equal(encodeKey(SAVE), encodeKey({ ...SAVE, found: [...SAVE.found].reverse() }));
});
