import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/core/input.js';

test('hold: pressed on the first tick only, down while held, released after', () => {
  const input = new Input();
  input.keyDown('Space');
  input.sample();
  assert.ok(input.down('jump') && input.pressed('jump'));

  input.sample();
  assert.ok(input.down('jump') && !input.pressed('jump'));

  input.keyUp('Space');
  input.sample();
  assert.ok(!input.down('jump') && input.released('jump'));

  input.sample();
  assert.ok(!input.released('jump'));
});

test('a tap between two ticks is not lost', () => {
  const input = new Input();
  input.keyDown('Space');
  input.keyUp('Space');
  input.sample();
  assert.ok(input.pressed('jump'));
  input.sample();
  assert.ok(input.released('jump'));
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

test('Ctrl and E cast; Tab switches spells', () => {
  for (const code of ['ControlLeft', 'ControlRight', 'KeyE']) {
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

test('with Ctrl a game key, Ctrl plus a game key is play; other shortcuts go to the browser', () => {
  const input = new Input();
  assert.ok(input.takes({ code: 'ControlLeft', ctrlKey: true }));
  assert.ok(input.takes({ code: 'KeyW', ctrlKey: true }), 'moving while casting');
  assert.ok(!input.takes({ code: 'KeyR', ctrlKey: true }), 'Ctrl+R reloads');
  assert.ok(!input.takes({ code: 'KeyW', altKey: true }));
  assert.ok(!input.takes({ code: 'KeyW', metaKey: true }));
  // Without Ctrl bound, any Ctrl combination is a browser shortcut.
  const plain = new Input({ up: ['KeyW'] });
  assert.ok(plain.takes({ code: 'KeyW' }));
  assert.ok(!plain.takes({ code: 'KeyW', ctrlKey: true }));
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
  const input = new Input({ jump: ['KeyK'] });
  input.keyDown('Space');
  input.keyDown('KeyK');
  input.sample();
  assert.deepEqual(input.activeActions(), ['jump']);
  assert.ok(!input.isBound('Space'));
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

  assert.ok(key('keydown', 'Space').defaultPrevented);
  assert.ok(!key('keydown', 'KeyZ').defaultPrevented);
  assert.ok(!key('keydown', 'KeyR', { ctrlKey: true }).defaultPrevented);
  input.sample();
  assert.deepEqual(input.activeActions(), ['jump']);

  target.dispatchEvent(new Event('blur'));
  input.sample();
  assert.ok(input.released('jump'));

  detach();
  key('keydown', 'KeyW');
  input.sample();
  assert.ok(!input.down('up'));
});
