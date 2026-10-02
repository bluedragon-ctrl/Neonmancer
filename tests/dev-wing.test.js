import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles, readSchemas } from '../tools/check-data.js';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '../src/data/load.js';
import { dataFiles, roomFile } from './helpers.js';

const schemas = readSchemas(fileURLToPath(new URL('..', import.meta.url)));

/** alpha - beta - gamma in a row; beta and gamma are the dev wing. */
function files(dev = ['beta', 'gamma']) {
  return dataFiles({
    rooms: [
      roomFile('alpha', { exits: [{ id: 'east', side: '+x', at: 3 }] }),
      roomFile('beta', { exits: [{ id: 'west', side: '-x', at: 3 }, { id: 'east', side: '+x', at: 3 }] }),
      roomFile('gamma', { exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    connections: [['alpha.east', 'beta.west'], ['beta.east', 'gamma.west']],
    dev,
  });
}

test('the dev wing is part of the world by default (dev server, tests, tools)', () => {
  const content = loadGameData(files());
  assert.deepEqual([...content.rooms.keys()], ['alpha', 'beta', 'gamma']);
});

test('a build for players leaves out the dev wing and walls up the exits into it', () => {
  const content = loadGameData(files(), { dev: false });
  assert.deepEqual([...content.rooms.keys()], ['alpha']);
  assert.deepEqual(content.rooms.get('alpha').exits, []);
  assert.deepEqual(content.world.connections, []);
  assert.deepEqual(Object.keys(content.world.positions), ['alpha']);
  assert.equal(content.links.size, 0);
});

test('without a dev wing nothing changes', () => {
  const all = files([]);
  assert.equal(loadGameData(all, { dev: false }).rooms.size, 3);
});

test('dev wing data checks: unknown rooms and the start room are refused', () => {
  assert.deepEqual(checkFiles(files(), schemas), []);
  const unknown = checkFiles(files(['nowhere']), schemas);
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /unknown room "nowhere"/);
  const start = checkFiles(files(['alpha']), schemas);
  assert.equal(start.length, 1);
  assert.match(start[0], /start room/);
});
