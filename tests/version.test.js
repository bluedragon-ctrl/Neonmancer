import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_VERSION, DATA_SCHEMA_VERSION } from '../src/core/version.js';
import { versionFrom } from '../tools/game-version.js';

test('game version is SemVer', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});

test('data schema version is a positive integer', () => {
  assert.ok(Number.isInteger(DATA_SCHEMA_VERSION) && DATA_SCHEMA_VERSION > 0);
});

test('patch version counts the merges since the phase tag; no tag means the package version', () => {
  const merges = (count) => (args) => {
    assert.deepEqual(args, ['rev-list', '--count', '--first-parent', 'v0.2.0..HEAD']);
    return String(count);
  };
  assert.equal(versionFrom('0.2.0', merges(0)), '0.2.0'); // right at the tag
  assert.equal(versionFrom('0.2.0', merges(7)), '0.2.7');
  const noTag = () => {
    throw new Error('unknown revision');
  };
  assert.equal(versionFrom('0.2.0', noTag), '0.2.0');
});
