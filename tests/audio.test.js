import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioEngine } from '../src/audio/audio.js';
import { lookup, stepGain } from '../src/audio/audio-data.js';
import { zzfxSamples } from '../src/audio/zzfx.js';
import { loadGameData } from '../src/data/load.js';
import { checkFiles, readSchemas } from '../tools/check-data.js';
import { dataFiles, roomFile } from './helpers.js';
import { Settings } from '../src/ui/settings.js';

const AUDIO = {
  music: { lattice: { file: 'lattice.mp3', volume: 0.5 }, boss: { file: 'boss.mp3' }, gone: { file: 'gone.mp3' } },
  sounds: { pickup: { zzfx: [1, 0, 440, 0, 0.01, 0.01] }, boom: { file: 'boom.wav', volume: 0.5 }, nofile: { file: 'nofile.wav' } },
};
const FILES = new Set(['lattice.mp3', 'boss.mp3', 'boom.wav']);

/** An engine with fake Howl and Web Audio; `log` records what it was asked. */
function engine(audio = AUDIO) {
  const log = { howls: [], warnings: [], sources: 0, gains: [] };
  class Howl {
    constructor(options) {
      this.options = options;
      this.vol = options.volume ?? 1;
      this.calls = [];
      this.handlers = {};
      log.howls.push(this);
    }
    play() { this.calls.push('play'); }
    stop() { this.calls.push('stop'); }
    unload() { this.calls.push('unload'); }
    volume(value) { if (value === undefined) return this.vol; this.vol = value; return this; }
    fade(from, to, ms) { this.calls.push(['fade', from, to, ms]); this.vol = to; }
    once(event, handler) { this.handlers[event] = handler; }
  }
  const context = {
    state: 'running',
    destination: {},
    createGain: () => {
      const node = { gain: { value: 1 }, connect() {} };
      log.gains.push(node);
      return node;
    },
    createBuffer: (channels, length) => ({ getChannelData: () => ({ set() {} }), length }),
    createBufferSource: () => ({ connect() {}, start() { log.sources++; } }),
  };
  const sound = new AudioEngine(audio, { Howl, createContext: () => context, urlOf: (file) => (FILES.has(file) ? `/a/${file}` : undefined), warn: (m) => log.warnings.push(m) });
  return { sound, log, context };
}

test('stepGain: off at 0, full at 10, quieter than linear in between', () => {
  assert.equal(stepGain(0), 0);
  assert.equal(stepGain(10), 1);
  assert.ok(stepGain(5) < 0.5);
  assert.equal(stepGain(99), 1);
});

test('lookup: fills in defaults, music loops, unknown names give null', () => {
  assert.deepEqual(lookup(AUDIO, 'music', 'boss'), { file: 'boss.mp3', volume: 1, loop: true });
  assert.equal(lookup(AUDIO, 'sounds', 'pickup').loop, false);
  assert.equal(lookup(AUDIO, 'sounds', 'toString'), null);
});

test('zzfx: a recipe gives samples in range and a longer release a longer sound', () => {
  const short = zzfxSamples([1, 0, 440, 0, 0.01, 0.01]);
  const long = zzfxSamples([1, 0, 440, 0, 0.01, 0.2]);
  assert.ok(short.length > 0 && long.length > short.length);
  assert.ok(long.every((v) => Number.isFinite(v) && Math.abs(v) <= 1));
  assert.ok(long.some((v) => v !== 0));
});

test('effects: silent until unlocked, then played; the slider scales and mutes', () => {
  const { sound, log, context } = engine();
  assert.equal(sound.sfx('pickup'), false);
  sound.unlock();
  assert.equal(sound.sfx('pickup'), true);
  assert.equal(log.sources, 1);
  sound.setVolumes(7, 0);
  assert.equal(sound.sfx('pickup'), false);
  sound.setVolumes(7, 10);
  assert.equal(sound.soundGain.gain.value, 1);
  context.state = 'suspended';
  let resumed = false;
  context.resume = () => (resumed = true);
  sound.unlock();
  assert.ok(resumed);
});

test('effects: playEvents plays a sound named like each event, ignoring the rest', () => {
  const { sound, log } = engine();
  sound.unlock();
  sound.playEvents([{ type: 'pickup' }, { type: 'room' }, { type: 'pickup' }]);
  assert.equal(log.sources, 2);
});

test('effects: a file sound loads once; a missing file is one warning, then silence', () => {
  const { sound, log } = engine();
  assert.equal(sound.sfx('boom'), true);
  assert.equal(sound.sfx('boom'), true);
  assert.equal(log.howls.length, 1);
  assert.equal(log.howls[0].calls.filter((c) => c === 'play').length, 2);
  assert.equal(sound.sfx('nofile'), false);
  assert.equal(sound.sfx('nofile'), false);
  assert.equal(sound.sfx('nothing'), false);
  assert.equal(log.warnings.length, 1);
});

test('music: fades in at the slider level and track volume; the same track again does nothing', () => {
  const { sound, log } = engine();
  sound.setVolumes(10, 7);
  sound.playMusic('lattice', 2);
  assert.equal(log.howls.length, 1);
  assert.deepEqual(log.howls[0].calls, ['play', ['fade', 0, 0.5, 2000]]);
  assert.equal(log.howls[0].options.loop, true);
  sound.playMusic('lattice');
  assert.equal(log.howls.length, 1);
  sound.setVolumes(0, 7);
  assert.equal(log.howls[0].vol, 0);
});

test('music: a new track crossfades, the old one is released when its fade ends', () => {
  const { sound, log } = engine();
  sound.playMusic('lattice');
  sound.playMusic('boss', 1);
  const [old, next] = log.howls;
  assert.equal(old.calls.at(-1)[0], 'fade');
  assert.equal(old.calls.at(-1)[2], 0);
  assert.equal(next.calls[0], 'play');
  old.handlers.fade();
  assert.deepEqual(old.calls.slice(-2), ['stop', 'unload']);
  sound.stopMusic(1);
  assert.equal(next.calls.at(-1)[2], 0);
  assert.equal(sound.track, null);
});

test('music: unknown name or missing file is a stub that fades the old track out and warns once', () => {
  const { sound, log } = engine();
  sound.playMusic('lattice');
  sound.playMusic('nope');
  sound.playMusic('gone');
  sound.playMusic('nope');
  assert.equal(log.howls.length, 1);
  assert.equal(log.howls[0].calls.at(-1)[2], 0);
  assert.equal(sound.track, null);
  assert.equal(log.warnings.length, 2);
});

test('music: a load error drops the track and warns', () => {
  const { sound, log } = engine();
  sound.playMusic('boss');
  log.howls[0].options.onloaderror();
  assert.equal(sound.track, null);
  assert.equal(log.warnings.length, 1);
});

test('applySettings reads the music and sound sliders', () => {
  const { sound } = engine();
  const settings = new Settings({ music: 3, sound: 9 });
  sound.applySettings(settings);
  assert.deepEqual(sound.volume, { music: 3, sound: 9 });
});

test('audio.json: the real file is valid and loads; a game without one has no audio', () => {
  const schemas = readSchemas(new URL('..', import.meta.url).pathname);
  const real = JSON.parse(readFileSync(new URL('../data/audio.json', import.meta.url), 'utf8'));
  const files = dataFiles({ rooms: [roomFile('alpha', { name: 'Alpha' })], connections: [] });
  assert.deepEqual(loadGameData(files).audio, { music: {}, sounds: {} });
  files['audio.json'] = real;
  assert.deepEqual(checkFiles(files, schemas), []);
  assert.deepEqual(Object.keys(loadGameData(files).audio.sounds), Object.keys(real.sounds));
  files['audio.json'] = { schemaVersion: 1, sounds: { both: { file: 'a.wav', zzfx: [1] } }, music: { bad: { file: 'x.txt' } } };
  assert.ok(checkFiles(files, schemas).length >= 2);
});
