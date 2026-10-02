import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBlockTypes } from '../src/data/room-data.js';
import { RoomEdit } from '../src/editor/room-edit.js';
import { linkList, linkables, pickedLinkable, setEvery, setLink, switchClick } from '../src/editor/switch-tool.js';
import { roomSwitches } from '../src/editor/links.js';
import { BLOCK_TYPES, LIFT, roomFile } from './helpers.js';

/** Switch and platform types as in defs.json (D140). */
const OBJECT_TYPES = {
  platform: LIFT,
  crate: { kind: 'pushable', color: '#b6ff3c' },
  target: { kind: 'target', color: '#eef3ff' },
  plate: { kind: 'plate', color: '#eef3ff', edges: 'dashed' },
};
const TYPES = { objectTypes: OBJECT_TYPES, blockTypes: resolveBlockTypes(BLOCK_TYPES) };

/**
 * Room alpha with plates p and q, crate c, lift l, a gate wall (4,0,1)–(4,1,3)
 * on every switch, a lone gate at (5,0,6) on p, a locked exit east on q and
 * an exit west not locked.
 */
function room() {
  return new RoomEdit(
    roomFile('alpha', {
      exits: [{ id: 'east', side: '+x', at: 3, requires: [{ switch: 'q' }] }, { id: 'west', side: '-x', at: 3 }],
      objects: [
        { id: 'p', type: 'plate', at: [2, 0, 2] },
        { id: 'q', type: 'plate', at: [3, 0, 2] },
        { id: 'c', type: 'crate', at: [2, 0, 5] },
        { id: 'l', type: 'platform', at: [6, 0, 6], path: { points: [[6, 0, 2]] } },
      ],
      blocks: [{ type: 'gate', at: [4, 0, 1], to: [4, 1, 3] }, { type: 'gate', at: [5, 0, 6], switches: ['p'] }, { type: 'block', at: [1, 0, 1] }],
    }),
  );
}

const click = (edit, cell, options = {}) => switchClick(edit, TYPES, { cell, exit: null, selected: null, switchType: 'target', ...options });

test('Switch tool: everything switches can power, a gate wall as one', () => {
  const things = linkables(room(), TYPES);
  assert.deepEqual(
    things.map((t) => [t.key, t.label, t.switches]),
    [
      ['exit:east', 'exit east', ['q']],
      ['exit:west', 'exit west', []],
      ['gate:4,0,1', 'gate ×6 at 4,0,1', null],
      ['gate:5,0,6', 'gate ×1 at 5,0,6', ['p']],
      ['platform:l', 'l', []],
    ],
  );
  assert.equal(pickedLinkable(things, { kind: 'gate', cell: [4, 1, 3] }).key, 'gate:4,0,1');
  assert.equal(pickedLinkable(things, { kind: 'item', id: 'p' }), null, 'a switch is no linkable');
});

test('Switch tool click: nothing picked picks a switch or a linkable, places only on a free cell', () => {
  const edit = room();
  assert.deepEqual(click(edit, [2, 0, 2]), { action: 'pick', text: 'pick p', pick: { kind: 'item', id: 'p' } });
  assert.deepEqual(click(edit, [4, 1, 2]).pick, { kind: 'gate', cell: [4, 1, 2] });
  assert.equal(click(edit, [6, 0, 6]).text, 'pick l');
  assert.equal(click(edit, [7, 0, 3], { exit: edit.exits[0] }).text, 'pick exit east');
  assert.deepEqual(click(edit, [3, 0, 6]), { action: 'place', text: 'place target' });
  assert.equal(click(edit, [1, 0, 1]).action, 'none', 'a plain block is never replaced');
  assert.equal(click(edit, [2, 0, 5]).action, 'none', 'nor a crate');
});

test('Switch tool click: a picked switch links and unlinks, never places, picks another only with Shift', () => {
  const edit = room();
  const selected = { kind: 'item', id: 'p' };
  assert.equal(click(edit, [5, 0, 6], { selected }).text, 'unlink gate ×1 at 5,0,6 from p');
  assert.equal(click(edit, [4, 0, 1], { selected }).text, 'link gate ×6 at 4,0,1 to p only (it is on every switch)');
  assert.equal(click(edit, [7, 0, 3], { selected, exit: edit.exits[0] }).text, 'link exit east to p');
  assert.equal(click(edit, [6, 0, 6], { selected }).action, 'link');
  assert.equal(click(edit, [3, 0, 6], { selected }).action, 'none', 'no switch placed while one is picked');
  assert.equal(click(edit, [3, 0, 2], { selected }).text, 'Shift+click picks q instead');
  assert.equal(click(edit, [3, 0, 2], { selected, shift: true }).text, 'pick q');
  assert.equal(click(edit, [2, 0, 2], { selected }).action, 'none');
});

test('Switch tool click: a picked gate, platform or exit links the switches clicked', () => {
  const edit = room();
  const gate = { kind: 'gate', cell: [5, 0, 6] };
  assert.equal(click(edit, [2, 0, 2], { selected: gate }).text, 'unlink gate ×1 at 5,0,6 from p');
  assert.equal(click(edit, [3, 0, 2], { selected: gate }).text, 'link gate ×1 at 5,0,6 to q');
  assert.equal(click(edit, [6, 0, 6], { selected: gate }).text, 'Shift+click picks l instead');
  assert.equal(click(edit, [6, 0, 6], { selected: gate, shift: true }).text, 'pick l');
  assert.equal(click(edit, [3, 0, 2], { selected: { kind: 'exit', id: 'east' } }).text, 'unlink exit east from q');
});

test('Switch tool checklist: a picked switch ticks what it powers, a picked thing its switches', () => {
  const edit = room();
  const things = linkables(edit, TYPES);
  const switches = roomSwitches(edit.data, OBJECT_TYPES);
  const forP = linkList(things, switches, { switch: edit.item('p') });
  assert.equal(forP.title, 'p powers:');
  assert.deepEqual(
    forP.rows.map((row) => [row.label, row.checked]),
    [
      ['exit east', false],
      ['exit west (not locked)', false],
      ['gate ×6 at 4,0,1 (every switch)', true],
      ['gate ×1 at 5,0,6', true],
      ['l', false],
    ],
  );
  const wall = linkList(things, switches, { thing: things[2] });
  assert.equal(wall.title, 'gate ×6 at 4,0,1 opens on:');
  assert.equal(wall.every, true);
  assert.deepEqual(wall.rows.map((row) => [row.key, row.checked, row.disabled]), [['p', true, true], ['q', true, true]]);
  const lift = linkList(things, switches, { thing: things[4] });
  assert.equal(lift.every, null, 'a platform has no every-switch choice');
  assert.equal(lift.title, 'l runs on:');
});

test('Switch tool checklist ticks: link, unlink, every switch and back', () => {
  const edit = room();
  const all = ['p', 'q'];
  const thing = (key) => linkables(edit, TYPES).find((t) => t.key === key);
  // Unticking p on the wall on every switch names the rest.
  assert.equal(setLink(edit, thing('gate:4,0,1'), 'p', false, all), true);
  assert.deepEqual(thing('gate:4,0,1').switches, ['q']);
  // Back on every switch, then named again (the same power).
  setEvery(edit, thing('gate:4,0,1'), true, all);
  assert.equal(thing('gate:4,0,1').switches, null);
  setEvery(edit, thing('gate:4,0,1'), false, all);
  assert.deepEqual(thing('gate:4,0,1').switches, ['p', 'q']);
  // Ticking a switch on an exit not locked locks it; the last unticked unlocks it.
  setLink(edit, thing('exit:west'), 'p', true, all);
  assert.deepEqual(edit.exits[1], { id: 'west', side: '-x', at: 3, requires: [{ switch: 'p' }] });
  setLink(edit, thing('exit:west'), 'p', false, all);
  assert.deepEqual(edit.exits[1], { id: 'west', side: '-x', at: 3 });
  // Every switch on an exit: locked, no list.
  setEvery(edit, thing('exit:west'), true, all);
  assert.deepEqual(edit.exits[1], { id: 'west', side: '-x', at: 3, requires: [{ switch: '*' }] });
  // A platform: ticked switches run it, none left it always runs.
  setLink(edit, thing('platform:l'), 'q', true, all);
  assert.deepEqual(edit.item('l').switches, ['q']);
  setLink(edit, thing('platform:l'), 'q', false, all);
  assert.equal('switches' in edit.item('l'), false);
  edit.undo();
  assert.deepEqual(edit.item('l').switches, ['q'], 'each tick is an undo step');
});
