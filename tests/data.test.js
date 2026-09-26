import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkData, checkFiles, readSchemas } from '../tools/check-data.js';
import { validateData } from '../src/data/validate.js';
import { DataError, loadGameData } from '../src/data/load.js';
import { buildRoom } from '../src/world/room.js';
import { OBJECT_STYLES } from '../src/data/room-data.js';
import { MARKS } from '../src/render/marks.js';
import { CRUMBLE, LIFT, dataFiles, roomFile } from './helpers.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemas = readSchemas(root);

/** A small valid game: two connected rooms. Fresh copy on every call. */
function validFiles() {
  return dataFiles({
    rooms: [
      roomFile('alpha', {
        name: 'Alpha',
        exits: [{ id: 'east', side: '+x', at: 3 }],
        blocks: [{ at: [4, 0, 4], to: [5, 1, 4] }],
        objects: [{ id: 'box', type: 'crate', at: [2, 0, 5], overrides: { color: '#00f0ff' } }],
      }),
      roomFile('beta', { name: 'Beta', size: [12, 4, 8], spawn: [2, 0, 2], exits: [{ id: 'west', side: '-x', at: 3, width: 2 }] }),
    ],
    connections: [['alpha.east', 'beta.west']],
  });
}

/** Errors for the valid game after `change` has modified it. */
function errorsAfter(change) {
  const files = validFiles();
  change(files);
  return checkFiles(files, schemas);
}

/** Assert exactly one error that contains every expected piece. */
function assertError(errors, ...pieces) {
  assert.equal(errors.length, 1, `expected 1 error, got:\n${errors.join('\n')}`);
  for (const piece of pieces) assert.ok(errors[0].includes(piece), `"${errors[0]}" lacks "${piece}"`);
}

test('the shipped data in data/ is valid', () => {
  assert.deepEqual(checkData(root).errors, []);
});

test('the test fixture is valid', () => {
  assert.deepEqual(checkFiles(validFiles(), schemas), []);
});

test('schema: unknown properties and bad values are reported with paths', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].blocks[0].colour = 'red')),
    'rooms/alpha.json › blocks[0]',
    'unknown property "colour"',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].exits[0].side = 'north')),
    'rooms/alpha.json › exits[0].side',
    'must be one of',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].size = [8, 9, 8])),
    'rooms/alpha.json › size[1]',
  );
});

test('schema: files without a schema are reported', () => {
  assertError(
    errorsAfter((f) => (f['notes.json'] = {})),
    'notes.json',
    'no schema',
  );
});

test('room: id must match the file name', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].id = 'gamma')),
    'rooms/alpha.json › id',
    'must match the file name',
  );
});

test('room: width + depth is limited', () => {
  assertError(
    errorsAfter((f) => (f['rooms/beta.json'].size = [24, 4, 12])),
    'rooms/beta.json › size',
    'width + depth is 36',
  );
});

test('room: unknown biome and object type', () => {
  assertError(errorsAfter((f) => (f['rooms/alpha.json'].biome = 'lava')), 'unknown biome "lava"');
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].type = 'barrel')),
    'objects[0]',
    'unknown object type "barrel"',
  );
});

test('room: blocks outside the room or overlapping are reported', () => {
  assertError(
    errorsAfter((f) => f['rooms/alpha.json'].blocks.push({ at: [8, 0, 0] })),
    'rooms/alpha.json › blocks[1]',
    'cell [8,0,0] is outside size [8,4,8]',
  );
  assertError(
    errorsAfter((f) => f['rooms/alpha.json'].blocks.push({ at: [5, 1, 4] })),
    'blocks[1]',
    'already filled by blocks[0]',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].blocks[0].to = [3, 1, 4])),
    'blocks[0]',
    'must not be below',
  );
});

test('room: objects must not overlap blocks and overrides must match the type', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].at = [4, 1, 4])),
    'objects[0]',
    'already filled by blocks[0]',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].overrides = { weight: 3 })),
    'objects[0].overrides',
    '"weight" is not a property',
  );
});

test('room: the player must fit at the spawn point', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].spawn = [0.1, 0, 1.5])),
    'rooms/alpha.json › spawn',
    'does not fit',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].spawn = [4.9, 0, 4.5])),
    'spawn',
    'overlaps blocks[0]',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].spawn = [1.5, 3, 1.5])),
    'spawn',
    'does not fit',
  );
});

test('room: an explicit reset point (D39) is validated like spawn, at its own path', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].reset = [0.1, 0, 1.5])),
    'rooms/alpha.json › reset',
    'does not fit',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].reset = [4.9, 0, 4.5])),
    'reset',
    'overlaps blocks[0]',
  );
});

test('room: exits must fit their side', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].exits[0].at = 7)),
    'exits[0]',
    'run past the side',
  );
});

test('room: the first row inside an exit must be free', () => {
  assertError(
    errorsAfter((f) => f['rooms/alpha.json'].blocks.push({ at: [7, 1, 4] })),
    'rooms/alpha.json › exits[0]',
    'cell [7,1,4] inside the exit is filled by blocks[1]',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].holes = [{ at: [7, 3] }])),
    'rooms/alpha.json › exits[0]',
    'tile [7,3] inside the exit is a hole',
  );
});

test('world: unknown start room', () => {
  assertError(errorsAfter((f) => (f['world.json'].start = 'nowhere')), 'world.json › start');
});

test('world: connections must name known exits', () => {
  const errors = errorsAfter((f) => (f['world.json'].connections[0][1] = 'beta.south'));
  assert.deepEqual(errors, [
    'world.json › connections[0]: unknown exit "beta.south"',
    'world.json › connections: exit "beta.west" is not connected',
  ]);
});

test('world: connected exits must be opposite, equally wide and used once', () => {
  let errors = errorsAfter((f) => (f['rooms/beta.json'].exits[0].side = '+z'));
  assertError(errors, 'world.json › connections[0]', 'opposite sides');

  errors = errorsAfter((f) => (f['rooms/beta.json'].exits[0].width = 3));
  assertError(errors, 'equally wide');

  errors = errorsAfter((f) => (f['world.json'].connections = []));
  assert.equal(errors.length, 2);
  assert.ok(errors.every((e) => e.includes('is not connected')));

  errors = errorsAfter((f) => f['world.json'].connections.push(['alpha.east', 'beta.west']));
  assert.ok(errors.some((e) => e.includes('already connected')));
});

test('a wrong schemaVersion is reported', () => {
  const files = validFiles();
  files['defs.json'].schemaVersion = 2;
  assertError(validateData(files), 'defs.json › schemaVersion', 'expects 1');
});

test('loadGameData throws a DataError listing every problem', () => {
  const files = validFiles();
  files['world.json'].start = 'nowhere';
  files['rooms/alpha.json'].biome = 'lava';
  assert.throws(
    () => loadGameData(files),
    (err) => err instanceof DataError && err.errors.length === 2,
  );
});

test('buildRoom expands blocks, merges type defaults and applies exit defaults', () => {
  const content = loadGameData(validFiles());
  const room = buildRoom(content.rooms.get('alpha'), content);

  assert.equal(room.color, '#ffb020');
  assert.deepEqual(room.cells, [
    [4, 0, 4],
    [4, 1, 4],
    [5, 0, 4],
    [5, 1, 4],
  ]);
  assert.deepEqual(room.objects, [
    {
      id: 'box',
      type: 'crate',
      at: [2, 0, 5],
      kind: 'pushable',
      color: '#00f0ff',
      edges: 'solid',
      mark: 'none',
      faces: 'dark',
      tint: 0.1,
    },
  ]);
  assert.deepEqual(room.exits, [{ id: 'east', side: '+x', at: 3, width: 2, y: 0, height: 2 }]);
});

test('buildRoom defaults reset to spawn, or uses an explicit reset (D39)', () => {
  const content = loadGameData(validFiles());
  const withoutReset = buildRoom(content.rooms.get('alpha'), content);
  assert.deepEqual(withoutReset.reset, withoutReset.spawn);

  const files = validFiles();
  files['rooms/alpha.json'].reset = [6, 0, 6];
  const withReset = buildRoom(loadGameData(files).rooms.get('alpha'), content);
  assert.deepEqual(withReset.reset, [6, 0, 6]);
  assert.deepEqual(withReset.spawn, [1.5, 0, 1.5]); // spawn itself is untouched
});

test('buildRoom gives a fresh copy every time (rooms reset on entry)', () => {
  const content = loadGameData(validFiles());
  const data = content.rooms.get('alpha');
  const first = buildRoom(data, content);
  first.objects[0].at[0] = 7;
  first.spawn[0] = 5;
  first.reset[0] = 9;
  const second = buildRoom(data, content);
  assert.equal(second.objects[0].at[0], 2);
  assert.equal(second.spawn[0], 1.5);
  assert.equal(second.reset[0], 1.5);
  assert.equal(data.objects[0].at[0], 2);
});

test('object styles: overrides must use known values', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].overrides = { mark: 'stars' })),
    'objects[0].overrides',
    '"mark" must be one of none, inset, cross, brackets',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].overrides = { tint: 1.5 })),
    '"tint" must be between 0 and 1',
  );
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].overrides = { color: 'green' })),
    '"color" must be #rrggbb',
  );
  // Style keys can be overridden even when the type relies on the defaults.
  assert.deepEqual(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].overrides = { edges: 'dashed' })),
    [],
  );
});

test('object styles: the schema rejects unknown values in defs.json', () => {
  assertError(
    errorsAfter((f) => (f['defs.json'].objects.crate.faces = 'glass')),
    'defs.json › objects.crate.faces',
    'must be one of',
  );
});

test('object styles: every mark in the data has a renderer pattern', () => {
  assert.deepEqual(OBJECT_STYLES.mark, MARKS);
});

test('holes: inside the room, not under blocks or objects, not twice', () => {
  const addHole = (hole) => (f) => (f['rooms/alpha.json'].holes = [hole]);
  assert.deepEqual(errorsAfter(addHole({ at: [6, 6], to: [7, 7] })), []);
  assertError(errorsAfter(addHole({ at: [7, 8] })), 'holes[0]', 'tile [7,8] is outside size');
  assertError(errorsAfter(addHole({ at: [4, 4] })), 'holes[0]', 'tile [4,4] is under blocks[0]');
  assertError(errorsAfter(addHole({ at: [2, 5] })), 'holes[0]', 'is under objects[0]');
  assertError(errorsAfter(addHole({ at: [3, 3], to: [2, 3] })), 'holes[0]', 'must not be below');
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].holes = [{ at: [6, 6] }, { at: [5, 5], to: [6, 6] }])),
    'holes[1]',
    'already a hole in holes[0]',
  );
});

test('holes: the player must not spawn above one', () => {
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].holes = [{ at: [1, 1] }])),
    'spawn',
    'would fall into holes[0]',
  );
  // A block below the spawn catches the player.
  assert.deepEqual(
    errorsAfter((f) => {
      const room = f['rooms/alpha.json'];
      room.holes = [{ at: [4, 4] }];
      room.blocks = [{ at: [4, 1, 4] }];
      room.spawn = [4.5, 2, 4.5];
    }),
    [],
  );
});

test('buildRoom expands hole rectangles into tiles', () => {
  const files = validFiles();
  files['rooms/alpha.json'].holes = [{ at: [6, 6], to: [7, 6] }, { at: [1, 6] }];
  const content = loadGameData(files);
  assert.deepEqual(buildRoom(content.rooms.get('alpha'), content).holes, [
    [6, 6],
    [7, 6],
    [1, 6],
  ]);
});

test('hazard and void blocks: the player must not spawn or respawn above one', () => {
  assertError(
    errorsAfter((f) => {
      const room = f['rooms/alpha.json'];
      room.blocks = [{ type: 'hazard', at: [1, 0, 1] }];
      room.spawn = [1.5, 1, 1.5];
    }),
    'rooms/alpha.json › spawn',
    'would land on a hazard block (blocks[0])',
  );
  assertError(
    errorsAfter((f) => {
      const room = f['rooms/alpha.json'];
      room.blocks = [{ type: 'void', at: [4, 0, 4] }];
      room.reset = [4.5, 2, 4.5];
    }),
    'rooms/alpha.json › reset',
    'would land on a void block',
  );
  // A plain block on top of the void block catches him.
  assert.deepEqual(
    errorsAfter((f) => {
      const room = f['rooms/alpha.json'];
      room.blocks = [{ type: 'void', at: [4, 0, 4] }, { at: [4, 1, 4] }];
      room.reset = [4.5, 2, 4.5];
    }),
    [],
  );
});

test('hazard and void blocks: a raised exit must not stand on a void block', () => {
  assertError(
    errorsAfter((f) => {
      const room = f['rooms/alpha.json'];
      room.exits[0].y = 1;
      room.blocks = [{ type: 'void', at: [7, 0, 3], to: [7, 0, 4] }];
    }),
    'rooms/alpha.json › exits[0]',
    'void block at [7,0,3]',
  );
});

test('buildRoom sorts blocks by type and carries the block type looks', () => {
  const files = validFiles();
  files['rooms/alpha.json'].blocks.push({ type: 'hazard', at: [1, 0, 6] }, { type: 'void', at: [6, 0, 1], to: [6, 0, 2] });
  const content = loadGameData(files);
  const room = buildRoom(content.rooms.get('alpha'), content);
  assert.equal(room.cells.length, 4);
  assert.deepEqual(room.typedCells, {
    hazard: [[1, 0, 6]],
    void: [
      [6, 0, 1],
      [6, 0, 2],
    ],
  });
  assert.equal(room.blockTypes.hazard.damage, 1);
  assert.equal(room.blockTypes.void.color, '#8a5cff');
});

test('block types: the schema requires both types and a hazard damage', () => {
  const errors = errorsAfter((f) => delete f['defs.json'].blocks.hazard.damage);
  assert.ok(errors.some((e) => e.includes('damage')), errors.join('\n'));
  const unknown = errorsAfter((f) => (f['rooms/alpha.json'].blocks[0].type = 'lava'));
  assert.ok(unknown.length > 0);
});

/** The valid game with a platform type and `object` added to room alpha. */
function withPlatform(object, change = () => {}) {
  return errorsAfter((f) => {
    f['defs.json'].objects.lift = LIFT;
    f['rooms/alpha.json'].objects.push(object);
    change(f);
  });
}

test('platforms: a valid path passes, and the platform needs one', () => {
  assert.deepEqual(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[1, 2, 3], [3, 2, 3]], mode: 'loop' } }), [
    'rooms/alpha.json › objects[1].path: a loop runs from [3,2,3] back to [1,0,3]: they must differ on exactly one axis',
  ]);
  assert.deepEqual(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[1, 2, 3], [3, 2, 3]] } }), []);
  assertError(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3] }), 'objects[1]', 'a platform needs a "path"');
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].path = { points: [[3, 0, 5]] })),
    'objects[0].path',
    'only platforms follow a path',
  );
});

test('platforms: each leg runs along one axis, inside the room, clear of blocks', () => {
  assertError(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[2, 1, 3]] } }), 'objects[1].path.points[0]', 'exactly one axis');
  assertError(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[9, 0, 3]] } }), 'objects[1].path.points[0]', 'outside size');
  // Blocks fill [4..5, 0..1, 4].
  assertError(withPlatform({ id: 'p', type: 'lift', at: [2, 1, 4], path: { points: [[6, 1, 4]] } }), 'objects[1].path', 'runs through cell [4,1,4], filled by blocks[0]');
  // A crate on the path is fine: the platform waits for it.
  assert.deepEqual(withPlatform({ id: 'p', type: 'lift', at: [0, 0, 5], path: { points: [[3, 0, 5]] } }), []);
});

test('platforms: no path through the first row inside an exit', () => {
  // Exit east: +x side at z 3..4, so the cells x = 7, z 3..4 must stay free.
  assertError(withPlatform({ id: 'p', type: 'lift', at: [7, 0, 0], path: { points: [[7, 0, 6]] } }), 'exits[0]', 'is on objects[1].path');
});

test('schema: path speed must be positive and mode known', () => {
  assertError(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[1, 2, 3]], speed: 0 } }), 'objects[1].path.speed');
  assertError(withPlatform({ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[1, 2, 3]], mode: 'bounce' } }), 'objects[1].path.mode');
});

/** The valid game with a collapsing block type and `objects` and `holes` added to room alpha. */
function withCollapsing(objects, { holes = [], spawn } = {}) {
  return errorsAfter((f) => {
    const room = f['rooms/alpha.json'];
    f['defs.json'].objects.crumble = CRUMBLE;
    room.objects.push(...objects);
    room.holes = holes;
    if (spawn) room.spawn = spawn;
  });
}

test('collapsing blocks: may regrow; nothing else may', () => {
  assert.deepEqual(withCollapsing([{ id: 'c', type: 'crumble', at: [1, 0, 3], regrow: 2.5 }, { id: 'd', type: 'crumble', at: [2, 0, 3] }]), []);
  assertError(
    errorsAfter((f) => (f['rooms/alpha.json'].objects[0].regrow = 2)),
    'objects[0].regrow',
    'only collapsing blocks grow back',
  );
  assertError(withCollapsing([{ id: 'c', type: 'crumble', at: [1, 0, 3], regrow: 0 }]), 'objects[1].regrow');
});

test('collapsing blocks: may stand in a hole (a bridge that gives way); crates may not', () => {
  assert.deepEqual(withCollapsing([{ id: 'c', type: 'crumble', at: [6, 0, 6] }], { holes: [{ at: [6, 6] }] }), []);
  assertError(
    withCollapsing([{ id: 'c', type: 'crate', at: [6, 0, 6] }], { holes: [{ at: [6, 6] }] }),
    'holes[0]',
    'is under objects[1]',
  );
});

test('collapsing blocks: a spawn on one over a hole would fall in', () => {
  const errors = withCollapsing([{ id: 'c', type: 'crumble', at: [1, 0, 1] }], { holes: [{ at: [1, 1] }], spawn: [1.5, 1, 1.5] });
  assertError(errors, 'spawn', 'would fall into holes[0]');
});

test('collapsing blocks: the room carries the regrow time', () => {
  const files = validFiles();
  files['defs.json'].objects.crumble = CRUMBLE;
  files['rooms/alpha.json'].objects.push({ id: 'c', type: 'crumble', at: [1, 0, 3], regrow: 4 }, { id: 'd', type: 'crumble', at: [2, 0, 3] });
  const content = loadGameData(files);
  const [, c, d] = buildRoom(content.rooms.get('alpha'), content).objects;
  assert.equal(c.kind, 'collapsing');
  assert.equal(c.regrow, 4);
  assert.equal('regrow' in d, false);
});
