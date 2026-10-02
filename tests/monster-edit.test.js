import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { AVOID_COLORS, MIN_TEMPLATE_COLOR_GAP, MIN_TEMPLATE_LIGHTNESS, colorGap, freeColor, hsvHex, oklab } from '../src/data/colors.js';
import { PALETTE } from '../src/render/neon.js';
import { FIELDS, MonsterEdit } from '../src/editor/monster-edit.js';
import { readSchemas } from '../tools/check-data.js';
import { BUG, VIRUS, dataFiles, roomFile } from './helpers.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** A tank built on bug, a bug and a tank in room lab, a virus in room hall. */
function files() {
  return dataFiles({
    rooms: [
      roomFile('lab', {
        enemies: [
          { id: 'b', template: 'bug', at: [1, 0, 1], path: { points: [[3, 0, 1]] } },
          { id: 't', template: 'tank', at: [5, 0, 5] },
        ],
      }),
      roomFile('hall', { enemies: [{ id: 'v', template: 'virus', at: [2, 0, 2] }] }),
    ],
    enemies: { bug: BUG, virus: VIRUS, tank: { extends: 'bug', movement: 'stationary', integrity: 4, color: '#ffb020' } },
  });
}

test('the monster editor has a field for every template field of the schema', () => {
  const props = readSchemas(root).find((schema) => schema.$id === 'defs.schema.json').$defs.enemyTemplate.properties;
  assert.deepEqual([...FIELDS].sort(), Object.keys(props).filter((key) => key !== 'extends').sort());
});

test('MonsterEdit tells where each value comes from: own, a base template, a default, or missing', () => {
  const edit = new MonsterEdit(files());
  assert.deepEqual(edit.field('tank', 'integrity'), { value: 4, source: 'own' });
  assert.deepEqual(edit.field('tank', 'look'), { value: 'bug', source: 'bug' });
  assert.deepEqual(edit.field('tank', 'memory'), { value: 1.5, source: 'default' });
  assert.deepEqual(edit.field('tank', 'chaseSpeed'), { value: 3, source: 'default' }, 'its speed');
  assert.equal(edit.values('tank').integrity, 4);
  assert.deepEqual(edit.usage('tank'), ['lab.t']);
  assert.deepEqual(edit.builtOn('bug'), ['tank']);
  assert.deepEqual(edit.errors(), []);

  edit.setField('bug', 'look', undefined);
  assert.deepEqual(edit.field('tank', 'look'), { value: undefined, source: null });
  assert.deepEqual(edit.missing('tank'), ['look']);
  assert.match(edit.errors().join('\n'), /enemies\.bug: missing look/);
});

test('MonsterEdit sets and clears fields as undo steps', () => {
  const edit = new MonsterEdit(files());
  assert.equal(edit.setField('tank', 'speed', 1), true);
  assert.equal(edit.setField('tank', 'speed', 1), false, 'so already');
  assert.equal(edit.setField('tank', 'integrity', undefined), true);
  assert.deepEqual(edit.field('tank', 'integrity'), { value: 2, source: 'bug' });
  assert.equal(edit.setField('tank', 'integrity', undefined), false, 'nothing to clear');
  assert.equal(edit.dirty, true);
  assert.equal(edit.undo(), true);
  assert.equal(edit.undo(), true);
  assert.equal(edit.dirty, false);
  assert.equal(edit.undo(), false);
  assert.equal(edit.redo(), true);
  assert.equal(edit.templates.tank.speed, 1);
});

test('MonsterEdit changes what a template builds on without changing what it does', () => {
  const edit = new MonsterEdit(files());
  const before = edit.values('tank');
  assert.equal(edit.setBase('tank', null), null);
  assert.equal(edit.templates.tank.extends, undefined);
  assert.equal(edit.templates.tank.look, 'bug', 'written down');
  assert.deepEqual(edit.values('tank'), before);

  assert.equal(edit.setBase('tank', 'virus'), null);
  assert.equal(edit.templates.tank.extends, 'virus');
  assert.deepEqual(edit.values('tank'), before);
  assert.equal('damage' in edit.templates.tank, false, 'the same as the virus: left to it');

  assert.match(edit.setBase('virus', 'tank'), /loop/);
  assert.match(edit.setBase('tank', 'moth'), /not a template/);
  assert.deepEqual(edit.errors(), []);
});

test('MonsterEdit adds variants and copies, each in a color of its own', () => {
  const edit = new MonsterEdit(files());
  assert.match(edit.add('Big'), /lowercase/);
  assert.match(edit.add('tank'), /taken/);
  assert.equal(edit.add('fast_bug', { from: 'bug' }), null);
  assert.deepEqual(Object.keys(edit.templates.fast_bug), ['extends', 'color']);
  assert.equal(edit.values('fast_bug').look, 'bug');
  assert.equal(edit.add('copy', { from: 'tank', copy: true }), null);
  assert.equal(edit.templates.copy.extends, undefined);
  assert.equal(edit.templates.copy.integrity, 4);
  assert.deepEqual(edit.clashes(), [], 'new ones get colors of their own');
  assert.deepEqual(edit.errors(), []);
});

test('MonsterEdit renames a template: templates built on it and enemies of it follow', () => {
  const edit = new MonsterEdit(files());
  assert.match(edit.rename('bug', 'virus'), /taken/);
  assert.equal(edit.rename('bug', 'beetle'), null);
  assert.deepEqual(edit.ids, ['beetle', 'virus', 'tank'], 'in its place');
  assert.equal(edit.templates.tank.extends, 'beetle');
  assert.deepEqual(edit.usage('beetle'), ['lab.b']);
  assert.deepEqual(edit.errors(), []);

  const { defs, rooms, state } = edit.changes();
  assert.deepEqual(rooms.map((room) => room.id), ['lab'], 'only the rooms it changed');
  assert.deepEqual(Object.keys(defs.enemies), ['beetle', 'virus', 'tank']);
  edit.markSaved({ defs, rooms, state });
  assert.equal(edit.dirty, false);
  assert.deepEqual(edit.changes().rooms, []);

  edit.undo();
  assert.equal(edit.rooms.get('lab').enemies[0].template, 'bug', 'undo takes the rooms back too');
  assert.equal(edit.dirty, true);
});

test('MonsterEdit removes only a template nothing uses', () => {
  const edit = new MonsterEdit(files());
  assert.match(edit.remove('tank'), /used by lab\.t/);
  assert.match(edit.remove('virus'), /used by hall\.v/);
  edit.add('spare', { from: 'virus' });
  edit.add('spare_2', { from: 'spare' });
  assert.match(edit.remove('spare'), /spare_2 builds on spare/);
  assert.equal(edit.remove('spare_2'), null);
  assert.equal(edit.remove('spare'), null);
  assert.deepEqual(edit.ids, ['bug', 'virus', 'tank']);
});

test('MonsterEdit.clashes finds templates too alike in color', () => {
  const edit = new MonsterEdit(files());
  edit.setField('tank', 'color', undefined);
  assert.deepEqual(edit.clashes().map(({ a, b }) => `${a}-${b}`), ['bug-tank']);
});

test('freeColor picks a bright color far from the ones taken', () => {
  const taken = ['#2bff88', '#ffe23a', '#ff8a1a', '#4f7dff'];
  const color = freeColor(taken);
  assert.ok(oklab(color)[0] >= MIN_TEMPLATE_LIGHTNESS);
  for (const other of [...taken, ...AVOID_COLORS]) assert.ok(colorGap(color, other) >= MIN_TEMPLATE_COLOR_GAP, `${color} vs ${other}`);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  assert.deepEqual(AVOID_COLORS, [PALETTE.magenta, PALETTE.danger, PALETTE.lime, PALETTE.neonGreen, PALETTE.cyan].map(hex), 'the colors with a meaning, as in PALETTE');
  assert.equal(hsvHex(0, 1, 1), '#ff0000');
  assert.equal(hsvHex(120, 1, 1), '#00ff00');
});
