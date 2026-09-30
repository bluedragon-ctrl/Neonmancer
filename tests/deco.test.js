import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import DEFS from '../data/defs.json' with { type: 'json' };
import { checkFiles, readSchemas } from '../tools/check-data.js';
import { DECO_LOOKS } from '../src/data/room-data.js';
import { loadGameData } from '../src/data/load.js';
import { RoomEdit } from '../src/editor/room-edit.js';
import { Game } from '../src/game.js';
import { PILLAR_FX, packetFade, packetT } from '../src/render/data-pillar.js';
import { codeWords, terminalRows } from '../src/render/screen.js';
import { MEMORY_FX, sweepGlow, sweepY } from '../src/render/memory-stack.js';
import { buildRoom } from '../src/world/room.js';
import { CRATE, dataFiles, hold, roomFile } from './helpers.js';

const schemas = readSchemas(fileURLToPath(new URL('..', import.meta.url)));

/** Decoration types, as in defs.json (D117). */
const DECOS = { crate: CRATE, data_pillar: { kind: 'deco', look: 'data_pillar' }, screen: { kind: 'deco', look: 'screen' }, memory_stack: { kind: 'deco', look: 'memory_stack' } };

/** One 8×4×8 room with these objects and the decoration types. */
function files(objects, room = {}) {
  return dataFiles({ rooms: [roomFile('alpha', { objects, ...room })], objects: DECOS });
}

const errors = (data) => checkFiles(data, schemas);

test('defs.json has the decorations, sized by their look: the pillar 3 high, the screen and the memory stack 1 (D117, D123)', () => {
  assert.deepEqual(DEFS.objects.data_pillar, DECOS.data_pillar);
  assert.deepEqual(DEFS.objects.screen, DECOS.screen);
  assert.deepEqual(DEFS.objects.memory_stack, DECOS.memory_stack);
  assert.deepEqual(DECO_LOOKS.memory_stack.size, [1, 1, 1]);
  assert.deepEqual(DECO_LOOKS.data_pillar.size, [1, 3, 1]);
  assert.deepEqual(DECO_LOOKS.screen.size, [1, 1, 1]);
  assert.equal(PILLAR_FX.height, DECO_LOOKS.data_pillar.size[1], 'the look is drawn as high as it collides');
});

test('decorations are valid in a room, facing either seen side', () => {
  const objects = [
    { id: 'pillar', type: 'data_pillar', at: [4, 0, 4] },
    { id: 'screen', type: 'screen', at: [2, 0, 2], overrides: { face: '+x' } },
  ];
  assert.deepEqual(errors(files(objects)), []);
});

test('a data pillar fills its 3 cells: nothing else fits above it, and it must fit under the ceiling', () => {
  const stacked = errors(files([{ id: 'pillar', type: 'data_pillar', at: [4, 0, 4] }, { id: 'box', type: 'crate', at: [4, 2, 4] }]));
  assert.equal(stacked.length, 1, stacked.join('\n'));
  assert.match(stacked[0], /filled by objects\[0\]/);
  const low = errors(files([{ id: 'pillar', type: 'data_pillar', at: [4, 0, 4] }], { size: [8, 2, 8] }));
  assert.equal(low.length, 1, low.join('\n'));
  assert.match(low[0], /outside/);
});

test('a decoration faces +z or +x only, and has no color of its own', () => {
  const up = errors(files([{ id: 'screen', type: 'screen', at: [2, 0, 2], overrides: { face: '-z' } }]));
  assert.equal(up.length, 1, up.join('\n'));
  assert.match(up[0], /"face" must be one of \+z, \+x/);
  const colored = errors(files([{ id: 'screen', type: 'screen', at: [2, 0, 2], overrides: { color: '#ff0000' } }]));
  assert.equal(colored.length, 1, colored.join('\n'));
  assert.match(colored[0], /"color" is not a property/);
});

test('a decoration type needs a look, and only decorations have one', () => {
  const data = files([]);
  data['defs.json'].objects.odd = { kind: 'deco' };
  data['defs.json'].objects.crate = { ...CRATE, look: 'screen' };
  data['defs.json'].objects.tinted = { kind: 'deco', look: 'screen', color: '#ff0000' };
  const found = errors(data);
  assert.ok(found.some((e) => e.includes('objects.odd.look') && e.includes('needs a look')), found.join('\n'));
  assert.ok(found.some((e) => e.includes('objects.crate.look') && e.includes('only decorations')), found.join('\n'));
  assert.ok(found.some((e) => e.includes('objects.tinted.color')), found.join('\n'));
});

test('a built decoration takes the room color and faces +z unless turned', () => {
  const content = loadGameData(files([{ id: 'a', type: 'screen', at: [3, 0, 5] }, { id: 'b', type: 'screen', at: [5, 0, 5], overrides: { face: '+x' } }]));
  const room = buildRoom(content.rooms.get('alpha'), content);
  const [a, b] = room.objects;
  assert.equal(a.color, room.color);
  assert.equal(a.face, '+z');
  assert.equal(b.face, '+x');
  assert.equal(a.look, 'screen');
});

test('the wizard walks into a data pillar and stops: it is a fixed body 1×3×1', () => {
  const game = new Game(loadGameData(files([{ id: 'pillar', type: 'data_pillar', at: [4, 0, 4] }])), { start: 'alpha' });
  const pillar = game.objects.find((object) => object.kind === 'deco');
  assert.deepEqual(pillar.box(), [[4, 5], [0, 3], [4, 5]]);
  game.player.place([2.5, 0, 4.5]);
  for (let i = 0; i < 90; i++) game.update(hold('down'));
  assert.ok(game.player.pos[0] < 4 - 0.29, `stopped at x ${game.player.pos[0]}`);
  assert.deepEqual(pillar.pos, [4, 0, 4], 'it never moves');
});

test('the room editor turns a decoration: +x, then back to +z with no override written', () => {
  const edit = new RoomEdit(roomFile('lab', { objects: [{ id: 'screen_1', type: 'screen', at: [2, 0, 2] }] }));
  assert.ok(edit.turnObject('screen_1'));
  assert.deepEqual(edit.item('screen_1').overrides, { face: '+x' });
  assert.ok(edit.turnObject('screen_1'));
  assert.equal(edit.item('screen_1').overrides, undefined);
  assert.equal(edit.turnObject('nothing'), false);
});

test('data pillar packets run up their cable and back round, growing in and shrinking away', () => {
  for (const time of [0, 0.7, 3.3, 100]) {
    const t = packetT(time, 2, 1, 3, 2.7);
    assert.ok(t >= 0 && t < 1, `t ${t}`);
  }
  assert.equal(packetFade(0), 0);
  assert.equal(packetFade(0.5), 1);
  assert.ok(packetFade(0.99) < 0.1);
});

test('the screen shows lines of code across its width, the bottom one typing out behind the cursor', () => {
  for (let line = 0; line < 50; line++) {
    for (const [a, b] of codeWords(line)) assert.ok(a >= 0 && b <= 1 && a < b, `line ${line}: [${a}, ${b}]`);
  }
  const rows = 6;
  const start = terminalRows(0.001, rows);
  assert.equal(start.rows.length, rows);
  const typed = start.rows[rows - 1].reduce((sum, [a, b]) => sum + b - a, 0);
  assert.ok(typed < 0.01, 'the bottom line has just begun');
  const later = terminalRows(0.44, rows);
  const [a, b] = later.rows[rows - 1].at(-1) ?? [0, 0];
  assert.ok(b >= a);
  // Once typed, the bottom line (line rows - 1 at first) scrolls up a row, whole.
  assert.deepEqual(terminalRows(0.5, rows).rows[rows - 2], codeWords(rows - 1));
});

test('memory stacks make a wall side by side and on top of each other: no height option (D123)', () => {
  const wall = [0, 1, 2].flatMap((x) => [0, 1].map((y) => ({ id: `mem_${x}_${y}`, type: 'memory_stack', at: [2 + x, y, 3] })));
  assert.deepEqual(errors(files(wall)), []);
  const game = new Game(loadGameData(files(wall)), { start: 'alpha' });
  const top = game.objects.find((object) => object.id === 'mem_1_1');
  assert.deepEqual(top.box(), [[3, 4], [1, 2], [3, 4]]);
  assert.deepEqual(top.pos, [3, 1, 3], 'it never falls');
});

test("a memory wall's light climbs from a stack into the one above and runs along the wall", () => {
  const lag = MEMORY_FX.lag * MEMORY_FX.period / MEMORY_FX.rise;
  for (const time of [0.3, 1.7, 2.9, 40]) {
    const low = sweepY(time, [4, 0, 2]);
    const high = sweepY(time, [4, 1, 2]);
    assert.ok(Math.abs(high - (low - 1)) < 1e-9, `the same light, a block lower in the upper stack at ${time}`);
    // The next stack along shows what this one showed a moment ago.
    assert.ok(Math.abs(sweepY(time + lag, [5, 0, 2]) - low) < 1e-9);
  }
  assert.equal(sweepGlow(0.5, 0.5), 1);
  assert.equal(sweepGlow(0.9, 0.5), 0);
});