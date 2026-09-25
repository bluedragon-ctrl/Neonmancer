import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_VERSION, DATA_SCHEMA_VERSION } from '../src/core/version.js';

test('game version is SemVer', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});

test('data schema version is a positive integer', () => {
  assert.ok(Number.isInteger(DATA_SCHEMA_VERSION) && DATA_SCHEMA_VERSION > 0);
});
