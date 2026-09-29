import { test } from 'node:test';
import assert from 'node:assert/strict';
import STRINGS from '../data/strings.json' with { type: 'json' };
import { takeAnnouncements } from '../src/core/messages.js';
import { Game } from '../src/game.js';
import { CONTROL_ROWS } from '../src/ui/menu-screen.js';
import { MENUS, MenuFlow } from '../src/ui/menus.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { SPELLS, gameData, input, roomFile } from './helpers.js';

/** One tick of menu input: `actions` pressed. */
const press = (...actions) => input([], actions);

test('the game opens on the title menu; Esc there does nothing, Start plays', () => {
  const flow = new MenuFlow();
  assert.equal(flow.playing, false);
  assert.equal(flow.onTitle, true);
  flow.update(press('pause'));
  assert.equal(flow.top.id, 'title');
  assert.equal(flow.update(press('confirm')), 'start');
  assert.equal(flow.playing, true);
});

test('dev links start straight in the game', () => {
  assert.equal(new MenuFlow('playing').playing, true);
});

test('up and down move the selection, wrapping round; Space chooses too', () => {
  const flow = new MenuFlow();
  flow.update(press('down'));
  assert.equal(flow.top.selected, 1);
  flow.update(press('down'));
  assert.equal(flow.top.selected, 0);
  flow.update(press('up'));
  assert.equal(flow.top.selected, MENUS.title.length - 1);
  flow.select(0);
  assert.equal(flow.update(press('jump')), 'start');
});

test('Esc or P pauses the game and closes the pause menu again', () => {
  const flow = new MenuFlow('playing');
  flow.update(press('pause'));
  assert.equal(flow.top.id, 'pause');
  assert.equal(flow.onTitle, false);
  flow.update(press('pause'));
  assert.equal(flow.playing, true);
  flow.pause();
  assert.equal(flow.update(press('confirm')), null); // Resume
  assert.equal(flow.playing, true);
});

test('panels stack: the controls open over the menu and Back returns to it', () => {
  const flow = new MenuFlow('playing');
  flow.pause();
  flow.select(MENUS.pause.indexOf('controls'));
  flow.choose();
  assert.deepEqual(flow.stack.map((menu) => menu.id), ['pause', 'controls']);
  flow.update(press('pause'));
  assert.equal(flow.top.id, 'pause');
  assert.equal(flow.top.selected, MENUS.pause.indexOf('controls')); // where it was
  flow.choose();
  flow.choose(); // Back
  assert.equal(flow.top.id, 'pause');
});

test('quitting asks first; yes goes to the title, no back to the pause menu', () => {
  const flow = new MenuFlow('playing');
  flow.pause();
  flow.select(MENUS.pause.indexOf('quit'));
  flow.choose();
  assert.equal(flow.top.id, 'quit');
  assert.equal(flow.top.selected, MENUS.quit.indexOf('quitNo')); // the safe answer first
  assert.equal(flow.choose(), null);
  assert.equal(flow.top.id, 'pause');

  flow.choose();
  flow.select(MENUS.quit.indexOf('quitYes'));
  assert.equal(flow.choose(), 'quit');
  assert.deepEqual(flow.stack.map((menu) => menu.id), ['title']);
  assert.equal(flow.top.selected, 0);
});

test('pause() only opens over the running game', () => {
  const flow = new MenuFlow();
  flow.pause();
  assert.deepEqual(flow.stack.map((menu) => menu.id), ['title']);
});

test('select() ignores an index outside the menu', () => {
  const flow = new MenuFlow();
  flow.select(5);
  assert.equal(flow.top.selected, 0);
});

test('every menu item, heading and controls row has its strings', () => {
  const { strings } = STRINGS;
  for (const [menu, items] of Object.entries(MENUS)) {
    if (menu !== 'title') assert.ok(`menu.heading.${menu}` in strings, `menu.heading.${menu}`);
    for (const item of items) assert.ok(`menu.${item}` in strings, `menu.${item}`);
  }
  for (const row of CONTROL_ROWS) {
    assert.ok(`controls.${row}` in strings, `controls.${row}`);
    assert.ok(`controls.${row}Keys` in strings, `controls.${row}Keys`);
  }
});

test('Game.reset() starts over in place: a new wizard, the start room, what the progress holds', () => {
  const content = gameData({ rooms: [roomFile('alpha'), roomFile('beta')] });
  const game = new Game(content);
  const { room } = game;
  game.progress.collect(saveBit('spells', SPELLS.zap.slot));
  game.enterRoom('beta');
  game.player.integrity = 1;
  const oldPlayer = game.player;
  takeAnnouncements();

  game.reset();
  assert.equal(game.room.id, 'alpha');
  assert.notEqual(game.room, room); // built fresh
  assert.notEqual(game.player, oldPlayer);
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  assert.equal(game.progress.found.size, 0);
  assert.equal(game.player.spell, null);
  assert.equal(game.transition, null);
  // The start room is announced even when he was in it already.
  assert.equal(takeAnnouncements().length, 1);

  game.reset({ start: 'beta', progress: new Progress([saveBit('spells', SPELLS.zap.slot)]) });
  assert.equal(game.room.id, 'beta');
  assert.equal(game.player.spell, 'zap');
});
