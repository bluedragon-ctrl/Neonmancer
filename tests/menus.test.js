import { test } from 'node:test';
import assert from 'node:assert/strict';
import STRINGS from '../data/strings.json' with { type: 'json' };
import { takeAnnouncements } from '../src/core/messages.js';
import { Game } from '../src/game.js';
import { CONTROL_ROWS, settingText } from '../src/ui/menu-screen.js';
import { MENUS, MenuFlow, isSetting } from '../src/ui/menus.js';
import { SETTINGS, SETTINGS_STORAGE_KEY, Settings } from '../src/ui/settings.js';
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
  for (let i = 1; i < MENUS.title.length; i++) flow.update(press('down'));
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
  for (const [id, setting] of Object.entries(SETTINGS)) {
    for (const value of setting.values ?? []) assert.ok(`setting.${id}.${value}` in strings, `setting.${id}.${value}`);
  }
  for (const key of ['menu.saveSoon', 'menu.optionsText', 'menu.visualsText', 'menu.quitText', 'menu.helpAdjust']) assert.ok(key in strings, key);
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

/** A Storage stand-in. */
function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

test('settings: defaults, ranges clamp, choices wrap, Enter wraps a range', () => {
  const settings = new Settings();
  assert.equal(settings.get('music'), SETTINGS.music.default);
  for (let i = 0; i < 20; i++) settings.step('music', 1);
  assert.equal(settings.get('music'), 10);
  assert.equal(settings.step('music', 1), false); // already full
  assert.equal(settings.step('music', 1, true), true);
  assert.equal(settings.get('music'), 0);
  assert.equal(settings.step('music', -1), false);
  settings.step('quality', -1);
  assert.equal(settings.get('quality'), 'high');
  settings.step('renderScale', -9);
  assert.equal(settings.get('renderScale'), 5);
});

test('settings: stored and loaded; bad or missing values fall back; blocked storage is harmless', () => {
  const storage = memoryStorage();
  const settings = new Settings();
  settings.step('sound', -3);
  settings.step('effects', 1);
  settings.save(storage);
  assert.deepEqual(Settings.load(storage).values, settings.values);

  const odd = Settings.load(memoryStorage({ [SETTINGS_STORAGE_KEY]: '{"music": 42, "quality": "ultra", "sound": 3}' }));
  assert.equal(odd.get('music'), SETTINGS.music.default);
  assert.equal(odd.get('quality'), 'auto');
  assert.equal(odd.get('sound'), 3);
  assert.equal(Settings.load(memoryStorage({ [SETTINGS_STORAGE_KEY]: 'not json' })).get('music'), SETTINGS.music.default);

  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(Settings.load(blocked).get('music'), SETTINGS.music.default);
  assert.doesNotThrow(() => new Settings().save(blocked));
});

test('options: left and right adjust the selected setting and ask for a save; other items ignore them', () => {
  const flow = new MenuFlow('playing');
  flow.pause();
  assert.equal(flow.update(press('right')), null); // Resume is no setting
  flow.select(MENUS.pause.indexOf('options'));
  flow.choose();
  assert.equal(flow.top.id, 'options');
  const music = flow.settings.get('music');
  assert.equal(flow.update(press('left')), 'settings');
  assert.equal(flow.settings.get('music'), music - 1);
  assert.equal(flow.update(press('confirm')), 'settings'); // Enter steps it on
  assert.equal(flow.settings.get('music'), music);

  flow.select(MENUS.options.indexOf('visuals'));
  flow.choose();
  assert.equal(flow.top.id, 'visuals');
  assert.ok(MENUS.visuals.filter(isSetting).length >= 3);
  flow.update(press('pause'));
  flow.update(press('pause'));
  assert.equal(flow.top.id, 'pause');
});

test('the title menu has the options too', () => {
  const flow = new MenuFlow();
  flow.select(MENUS.title.indexOf('options'));
  flow.choose();
  assert.equal(flow.top.id, 'options');
  assert.equal(flow.onTitle, true);
});

test('Save is a stub for now: it says so and stays in the menu, the note goes with the next move', () => {
  const flow = new MenuFlow('playing');
  flow.pause();
  flow.select(MENUS.pause.indexOf('save'));
  assert.equal(flow.choose(), null);
  assert.equal(flow.top.id, 'pause');
  assert.equal(flow.notice, 'menu.saveSoon');
  flow.move(1);
  assert.equal(flow.notice, null);
});

test('setting values as shown: a bar of ten cells, a percentage, a choice by name', () => {
  const text = (key) => key;
  assert.equal(settingText(text, 'music', 7), '■■■■■■■□□□');
  assert.equal(settingText(text, 'sound', 0), '□□□□□□□□□□');
  assert.equal(settingText(text, 'renderScale', 8), '80%');
  assert.equal(settingText(text, 'quality', 'low'), 'setting.quality.low');
});
