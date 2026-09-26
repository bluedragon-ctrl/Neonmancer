import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readDataFiles } from '../tools/check-data.js';
import { loadGameData } from '../src/data/load.js';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { withExitDefaults } from '../src/data/room-data.js';
import { eventTypes, idle } from './helpers.js';
import { formatText, scrambleText } from '../src/ui/text.js';
import { BANNER, TERMINAL, Terminal, bannerState } from '../src/ui/terminal.js';
import { wantsFullscreenHint } from '../src/ui/fullscreen.js';
import { announce, say, takeAnnouncements, takeMessages } from '../src/core/messages.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const shipped = () => loadGameData(readDataFiles(root).files);

test('formatText fills placeholders and marks missing keys', () => {
  const strings = { 'game.version': 'v{version}', 'msg.x': 'no {thing} here' };
  assert.equal(formatText(strings, 'game.version', { version: '0.1.0' }), 'v0.1.0');
  assert.equal(formatText(strings, 'msg.x'), 'no {thing} here'); // unknown values stay visible
  assert.equal(formatText(strings, 'msg.missing'), '[msg.missing]');
});

test('say() queues messages until they are taken', () => {
  takeMessages();
  say('msg.boot');
  say('game.version', { version: '1.2.3' });
  assert.deepEqual(takeMessages(), [
    { key: 'msg.boot', values: undefined },
    { key: 'game.version', values: { version: '1.2.3' } },
  ]);
  assert.deepEqual(takeMessages(), []);
});

test('announce() queues banners with an optional line and color', () => {
  takeAnnouncements();
  announce('banner.room', { room: 'Cache Hall' }, { sub: 'banner.biome', subValues: { biome: 'Home' }, color: '#ffb020' });
  announce('msg.plug');
  assert.deepEqual(takeAnnouncements(), [
    { key: 'banner.room', values: { room: 'Cache Hall' }, sub: 'banner.biome', subValues: { biome: 'Home' }, color: '#ffb020' },
    { key: 'msg.plug', values: undefined, sub: undefined, subValues: undefined, color: undefined },
  ]);
});

test('rooms are announced on start and on entering another room, not on respawn', () => {
  takeAnnouncements();
  const game = new Game(shipped());
  const start = takeAnnouncements();
  assert.equal(start.length, 1);
  assert.deepEqual(start[0].values, { room: game.room.name });
  game.enterRoom(game.room.id, game.room.reset); // what a respawn does
  assert.deepEqual(takeAnnouncements(), []);
  game.travel(withExitDefaults(game.room.exits[0]));
  assert.deepEqual(takeAnnouncements()[0].values, { room: game.room.name });
});

test('every string key passed to say() or announce() in src/ exists in the shipped strings', () => {
  const { strings } = shipped();
  const src = fileURLToPath(new URL('../src', import.meta.url));
  const keys = readdirSync(src, { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .flatMap((file) => [...readFileSync(join(src, file), 'utf8').matchAll(/\b(?:say\(|announce\(|sub: )'([^']+)'/g)].map((m) => m[1]));
  assert.ok(keys.length > 0);
  for (const key of keys) assert.ok(key in strings, `missing string "${key}"`);
});

test('scrambleText keeps the decoded part and spaces, same seed same glyphs', () => {
  const text = 'CACHE HALL';
  const scrambled = scrambleText(text, 3, 5);
  assert.equal(scrambled.length, text.length);
  assert.ok(scrambled.startsWith('CAC'));
  assert.equal(scrambled[5], ' ');
  assert.equal(scrambleText(text, 3, 5), scrambled);
  assert.equal(scrambleText(text, text.length, 9), text);
});

test('terminal types one line at a time, holds it, then fades it out', () => {
  const terminal = new Terminal();
  terminal.push('> ONE');
  terminal.push('> TWO');
  // Only the line being typed is shown, with nothing of the waiting one.
  terminal.update(2 / TERMINAL.typeRate);
  assert.deepEqual(terminal.lines(), [{ text: '> ', typing: true, opacity: 1 }]);

  terminal.update(1); // both lines typed by now
  const [one, two] = terminal.lines();
  assert.deepEqual(
    [one.text, one.typing, two.text, two.typing],
    ['> ONE', false, '> TWO', false],
  );

  terminal.update(TERMINAL.hold + TERMINAL.fade / 2); // the lines finished typing in the last update
  assert.ok(terminal.lines()[0].opacity > 0 && terminal.lines()[0].opacity < 1);
  terminal.update(TERMINAL.fade);
  assert.equal(terminal.lines().length, 0);
});

test('terminal keeps at most maxLines lines, dropping the oldest', () => {
  const terminal = new Terminal();
  for (let i = 0; i < TERMINAL.maxLines + 2; i++) terminal.push(`> ${i}`);
  terminal.update(10 / TERMINAL.typeRate * TERMINAL.maxLines);
  const lines = terminal.lines();
  assert.equal(lines.length, TERMINAL.maxLines);
  assert.equal(lines[0].text, '> 2');
});

test('room banner decodes, holds, then fades out', () => {
  assert.deepEqual(bannerState(0), { decoded: 0, opacity: 1 });
  assert.equal(bannerState(BANNER.reveal / 2).decoded, 0.5);
  assert.deepEqual(bannerState(BANNER.reveal + BANNER.hold), { decoded: 1, opacity: 1 });
  const fading = bannerState(BANNER.reveal + BANNER.hold + BANNER.fade / 2).opacity;
  assert.ok(Math.abs(fading - 0.5) < 1e-9);
  assert.equal(bannerState(BANNER.reveal + BANNER.hold + BANNER.fade).opacity, 0);
});

test('fullscreen hint below 1080 physical pixels, never in fullscreen', () => {
  assert.equal(wantsFullscreenHint(900, 1, false), true);
  assert.equal(wantsFullscreenHint(720, 1.5, false), false); // 1080 physical pixels
  assert.equal(wantsFullscreenHint(1080, 1, false), false);
  assert.equal(wantsFullscreenHint(600, 1, true), false);
});

test('integrity drains on a fatal fall, comes back on respawn and carries over between rooms', () => {
  const game = new Game(shipped());
  const { player } = game;
  assert.equal(player.integrity, PLAYER.maxIntegrity);
  assert.equal(player.maxIntegrity, PLAYER.maxIntegrity);

  // Stand the wizard on a hole in the start room.
  const [hx, hz] = game.room.holes[0];
  game.player.pos = [hx + 0.5, 0, hz + 0.5];
  const events = [];
  for (let i = 0; i < 3; i++) events.push(...eventTypes(game.update(idle)));
  assert.ok(events.includes('die'), events.join());
  assert.equal(player.integrity, 0);
  assert.deepEqual(takeMessages().map((m) => m.key), ['msg.die']);

  for (let i = 0; i < PLAYER.deathTicks && !events.includes('respawn'); i++) events.push(...eventTypes(game.update(idle)));
  assert.ok(events.includes('respawn'));
  assert.equal(player.integrity, player.maxIntegrity);

  player.integrity = 3;
  const exit = withExitDefaults(game.room.exits[0]);
  game.travel(exit);
  assert.notEqual(game.room.id, game.content.world.start);
  assert.equal(game.player, player); // one wizard for the whole game
  assert.equal(player.integrity, 3);
});
