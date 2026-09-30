import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import LORE_SCHEMA from '../schemas/lore.schema.json' with { type: 'json' };
import { takeMessages } from '../src/core/messages.js';
import { LORE_LIMITS, loreLines, loreProblem } from '../src/data/lore.js';
import { loadGameData } from '../src/data/load.js';
import { formatJson } from '../src/editor/format-json.js';
import { LoreEdit } from '../src/editor/lore-edit.js';
import { typedText } from '../src/editor/panel.js';
import { RoomEdit } from '../src/editor/room-edit.js';
import { Game } from '../src/game.js';
import { buildRoom } from '../src/world/room.js';
import { checkFiles, readSchemas } from '../tools/check-data.js';
import { saveEdits } from '../tools/room-save.js';
import { CRATE, dataFiles, eventTypes, idle, roomFile } from './helpers.js';

const schemas = readSchemas(fileURLToPath(new URL('..', import.meta.url)));

const DECOS = { crate: CRATE, data_pillar: { kind: 'deco', look: 'data_pillar' }, screen: { kind: 'deco', look: 'screen' } };
const HELLO = { title: 'SYSLOG 0x01', lines: ['THE CORE WENT DARK.', 'BRING THE FRAGMENTS HOME.'] };
const LORE = { schemaVersion: 1, texts: { hello: HELLO } };

/** Rooms alpha (with these objects) and beta, the decoration types, and lore.json. */
function files(objects, { lore = LORE } = {}) {
  const data = dataFiles({ rooms: [roomFile('alpha', { objects }), roomFile('beta')], objects: DECOS });
  if (lore) data['lore.json'] = structuredClone(lore);
  return data;
}

const errors = (data) => checkFiles(data, schemas);

test('lore.json and the limits the terminal and the editor use agree', () => {
  const text = LORE_SCHEMA.properties.texts.additionalProperties.properties;
  assert.equal(text.lines.maxItems, LORE_LIMITS.lines);
  assert.equal(text.lines.items.maxLength, LORE_LIMITS.lineLength);
  assert.equal(text.title.maxLength, LORE_LIMITS.titleLength);
  const game = JSON.parse(readFileSync(new URL('../data/lore.json', import.meta.url), 'utf8'));
  assert.deepEqual(errors({ ...files([]), 'lore.json': game }), []);
});

test('a screen shows a text lore.json has; no other object shows one (D118)', () => {
  assert.deepEqual(errors(files([{ id: 'screen', type: 'screen', at: [3, 0, 5], text: 'hello' }])), []);
  const unknown = errors(files([{ id: 'screen', type: 'screen', at: [3, 0, 5], text: 'nope' }]));
  assert.equal(unknown.length, 1, unknown.join('\n'));
  assert.match(unknown[0], /objects\[0\]\.text: unknown text "nope"/);
  const noFile = errors(files([{ id: 'screen', type: 'screen', at: [3, 0, 5], text: 'hello' }], { lore: null }));
  assert.match(noFile.join('\n'), /unknown text "hello"/);
  for (const type of ['data_pillar', 'crate']) {
    const found = errors(files([{ id: 'thing', type, at: [3, 0, 5], text: 'hello' }]));
    assert.equal(found.length, 1, found.join('\n'));
    assert.match(found[0], /only screens show a text/);
  }
});

test('lore.json keeps texts within the terminal', () => {
  const tooMany = { texts: { long: { lines: Array.from({ length: LORE_LIMITS.lines + 1 }, () => 'LINE') } } };
  assert.match(errors(files([], { lore: { schemaVersion: 1, ...tooMany } })).join('\n'), /lore\.json › texts\.long\.lines/);
  const wide = { schemaVersion: 1, texts: { wide: { lines: ['X'.repeat(LORE_LIMITS.lineLength + 1)] } } };
  assert.match(errors(files([], { lore: wide })).join('\n'), /lore\.json › texts\.wide\.lines\[0\]/);
  assert.equal(loreProblem({ lines: [] }), 'A text needs at least one line.');
  assert.match(loreProblem({ lines: ['X'.repeat(LORE_LIMITS.lineLength + 1)] }), /Line 1 is/);
  assert.match(loreProblem({ lines: ['A', ' '] }), /blank/);
  assert.match(loreProblem({ title: 'T'.repeat(LORE_LIMITS.titleLength + 1), lines: ['A'] }), /title/);
  assert.equal(loreProblem(HELLO), null);
  assert.deepEqual(loreLines(HELLO), ['> SYSLOG 0x01', ...HELLO.lines]);
  assert.deepEqual(loreLines({ lines: ['A'] }), ['A']);
});

test('a built screen keeps its text id', () => {
  const content = loadGameData(files([{ id: 'screen', type: 'screen', at: [3, 0, 5], text: 'hello' }]));
  assert.deepEqual(content.lore, LORE.texts);
  assert.equal(buildRoom(content.rooms.get('alpha'), content).objects[0].text, 'hello');
});

test('coming near a screen shows its text once a visit: not after a respawn, again on the next visit', () => {
  const content = loadGameData(files([{ id: 'screen', type: 'screen', at: [3, 0, 5], text: 'hello' }, { id: 'plain', type: 'screen', at: [6, 0, 5] }]));
  const game = new Game(content, { start: 'alpha' });
  const screen = game.objects.find((object) => object.id === 'screen');
  takeMessages();
  const shown = () => takeMessages().filter((message) => message.lines).map((message) => message.lines);

  game.player.place([3.5, 0, 3.2]); // two cells in front of it: too far
  game.update(idle);
  assert.deepEqual(shown(), []);
  assert.equal(screen.read, false);

  game.player.place([3.5, 0, 4.3]); // one cell in front of it
  assert.ok(eventTypes(game.update(idle)).includes('read'));
  assert.deepEqual(shown(), [loreLines(HELLO)]);
  assert.equal(screen.read, true);
  game.update(idle);
  assert.deepEqual(shown(), [], 'once');

  game.enterRoom('alpha'); // a respawn: the room resets, the text stays read
  assert.equal(game.objects.find((object) => object.id === 'screen').read, true);
  game.player.place([3.5, 0, 4.3]);
  game.update(idle);
  assert.deepEqual(shown(), []);

  game.enterRoom('beta');
  game.enterRoom('alpha'); // a new visit
  game.player.place([2.2, 0, 5.5]); // at its side
  game.update(idle);
  assert.deepEqual(shown(), [loreLines(HELLO)]);

  // A screen without a text is decoration only.
  game.player.place([6.5, 0, 4.3]);
  assert.ok(!eventTypes(game.update(idle)).includes('read'));
});

test('the editor gives a screen a text and takes it off; undo takes a new text out of lore.json too', () => {
  const lore = new LoreEdit(LORE);
  const edit = new RoomEdit(roomFile('lab', { objects: [{ id: 'screen_1', type: 'screen', at: [2, 0, 2] }] }), { lore });
  assert.ok(edit.setText('screen_1', 'hello'));
  assert.equal(edit.item('screen_1').text, 'hello');
  assert.ok(edit.setText('screen_1', null));
  assert.equal('text' in edit.item('screen_1'), false);

  const text = { lines: ['NEW TEXT'] };
  assert.ok(edit.edit(() => lore.addText('fresh', text) === null && edit.setText('screen_1', 'fresh')));
  assert.deepEqual(lore.texts.fresh, text);
  assert.ok(lore.dirty);
  assert.ok(edit.undo());
  assert.equal(lore.texts.fresh, undefined);
  assert.equal('text' in edit.item('screen_1'), false);
  assert.ok(edit.redo());
  assert.deepEqual(lore.texts.fresh, text);
  assert.equal(edit.item('screen_1').text, 'fresh');
});

test('LoreEdit checks ids and texts; with no lore.json yet it is saved once it has a text', () => {
  const lore = new LoreEdit();
  assert.equal(lore.dirty, false);
  assert.match(lore.addText('Bad Id', { lines: ['A'] }), /Text id/);
  assert.match(lore.addText('ok', { lines: [] }), /at least one line/);
  assert.equal(lore.addText('ok', { title: 'T', lines: ['A'] }), null);
  assert.match(lore.addText('ok', { lines: ['B'] }), /taken/);
  assert.ok(lore.dirty);
  assert.equal(lore.updateText('ok', { lines: ['B'] }), null);
  assert.deepEqual(lore.texts.ok, { lines: ['B'] }, 'a blank title is left out');
  assert.match(lore.updateText('nope', { lines: ['B'] }), /No text/);
  lore.markSaved();
  assert.equal(lore.dirty, false);
});

test('the panel reads a typed text: title optional, one line per row, trailing rows dropped', () => {
  assert.deepEqual(typedText('  ', 'ONE  \nTWO\n\n'), { lines: ['ONE', 'TWO'] });
  assert.deepEqual(typedText(' LOG ', ''), { title: 'LOG', lines: [] });
});

test('saveEdits writes lore.json with the rooms, and refuses a text too long', () => {
  const root = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    for (const dir of ['data', 'schemas']) cpSync(fileURLToPath(new URL(`../${dir}`, import.meta.url)), join(root, dir), { recursive: true });
    const file = join(root, 'data/lore.json');
    const lore = JSON.parse(readFileSync(file, 'utf8'));
    lore.texts.extra = { lines: ['X'.repeat(LORE_LIMITS.lineLength + 1)] };
    assert.equal(saveEdits(root, { lore }).ok, false);
    lore.texts.extra = { lines: ['FINE'] };
    assert.deepEqual(saveEdits(root, { lore }), { ok: true, errors: [], files: ['data/lore.json'] });
    assert.equal(readFileSync(file, 'utf8'), formatJson(lore));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
