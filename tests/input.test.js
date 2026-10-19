import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/core/input.js';

test('hold: pressed on the first tick only, down while held, released after', () => {
  const input = new Input();
  input.keyDown('KeyM');
  input.sample();
  assert.ok(input.down('map') && input.pressed('map'));

  input.sample();
  assert.ok(input.down('map') && !input.pressed('map'));

  input.keyUp('KeyM');
  input.sample();
  assert.ok(!input.down('map') && input.released('map'));

  input.sample();
  assert.ok(!input.released('map'));
});

test('a tap between two ticks is not lost', () => {
  const input = new Input();
  input.keyDown('KeyM');
  input.keyUp('KeyM');
  input.sample();
  assert.ok(input.pressed('map'));
  input.sample();
  assert.ok(input.released('map'));
});

test('two keys bound to one action act as one', () => {
  const input = new Input();
  input.keyDown('KeyW');
  input.sample();
  input.keyDown('ArrowUp');
  input.sample();
  assert.ok(input.down('up') && !input.pressed('up'));

  input.keyUp('KeyW');
  input.sample();
  assert.ok(input.down('up'), 'still held by the arrow key');
});

test('key repeat does not re-trigger pressed', () => {
  const input = new Input();
  input.keyDown('KeyE');
  input.sample();
  input.keyDown('KeyE'); // auto-repeat
  input.sample();
  assert.ok(input.down('cast') && !input.pressed('cast'));
});

test('E and Numpad 0 cast; Tab switches spells', () => {
  for (const code of ['KeyE', 'Numpad0']) {
    const input = new Input();
    input.keyDown(code);
    input.sample();
    assert.ok(input.pressed('cast'), code);
  }
  const input = new Input();
  input.keyDown('Tab');
  input.sample();
  assert.ok(input.pressed('spellNext'));
});

test('the game takes bound keys; shortcuts and unbound keys go to the browser', () => {
  const input = new Input();
  assert.ok(input.takes({ code: 'KeyW' }));
  assert.ok(input.takes({ code: 'Tab' }));
  assert.ok(!input.takes({ code: 'KeyR' }));
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) assert.ok(!input.takes({ code: 'KeyW', [modifier]: true }), modifier);
});

test('typing into a text field (the room editor panel) is left to the browser', () => {
  const input = new Input();
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) assert.ok(!input.takes({ code: 'KeyW', target: { tagName } }), tagName);
  assert.ok(input.takes({ code: 'KeyW', target: { tagName: 'BODY' } }));
  assert.ok(input.takes({ code: 'F2' }), 'the editor key');
  // Function keys type nothing: F2 leaves the editor even from a field.
  assert.ok(input.takes({ code: 'F2', target: { tagName: 'INPUT' } }));
  assert.ok(input.takes({ code: 'F3', target: { tagName: 'SELECT' } }));
});

test('releaseAll drops held keys (window blur)', () => {
  const input = new Input();
  input.keyDown('KeyA');
  input.sample();
  input.releaseAll();
  input.sample();
  assert.ok(input.released('left'));
});

test('unbound keys are ignored', () => {
  const input = new Input();
  input.keyDown('KeyZ');
  input.sample();
  assert.deepEqual(input.activeActions(), []);
});

test('custom bindings replace the defaults', () => {
  const input = new Input({ map: ['KeyK'] });
  input.keyDown('KeyM');
  input.keyDown('KeyK');
  input.sample();
  assert.deepEqual(input.activeActions(), ['map']);
  assert.ok(!input.isBound('KeyM'));
});

test('attach: listens to events and blocks default only for bound keys', () => {
  const target = new EventTarget();
  const input = new Input();
  const detach = input.attach(target);
  const key = (type, code, extra = {}) => {
    const e = Object.assign(new Event(type, { cancelable: true }), { code, ...extra });
    target.dispatchEvent(e);
    return e;
  };

  assert.ok(key('keydown', 'KeyM').defaultPrevented);
  assert.ok(!key('keydown', 'KeyZ').defaultPrevented);
  assert.ok(!key('keydown', 'KeyR', { ctrlKey: true }).defaultPrevented);
  input.sample();
  assert.deepEqual(input.activeActions(), ['map']);

  target.dispatchEvent(new Event('blur'));
  input.sample();
  assert.ok(input.released('map'));

  detach();
  key('keydown', 'KeyW');
  input.sample();
  assert.ok(!input.down('up'));
});
