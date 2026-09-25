/**
 * Version numbers. They are tracked separately (see CLAUDE.md §10):
 * the game itself, the data schema and the save-key format change independently.
 */
import pkg from '../../package.json' with { type: 'json' };

/** Game version (SemVer), taken from package.json. */
export const GAME_VERSION = pkg.version;

/** Version of the JSON data formats in data/ and schemas/. */
export const DATA_SCHEMA_VERSION = 1;
