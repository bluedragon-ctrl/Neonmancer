/**
 * Version numbers. They are tracked separately (see CLAUDE.md §10):
 * the game itself, the data schema and the save-key format change independently.
 */
import pkg from '../../package.json' with { type: 'json' };

/* global __GAME_VERSION__ */

/**
 * Game version (SemVer, D42): MAJOR.MINOR from package.json, PATCH counting
 * the pull requests merged since the phase's tag. Vite fills in
 * __GAME_VERSION__ (tools/game-version.js); outside Vite (tests) it is
 * package.json's version.
 */
export const GAME_VERSION = typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : pkg.version;

/** Version of the JSON data formats in data/ and schemas/. */
export const DATA_SCHEMA_VERSION = 1;
