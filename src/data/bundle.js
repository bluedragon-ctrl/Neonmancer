/**
 * The only module that uses Vite features (D7): bundles every JSON file in
 * data/ at build time, imports the schema errors found by the dev-server
 * data check (tools/vite-plugin-data.js) and tells whether this is the dev
 * server.
 */
import schemaErrors from 'virtual:data-schema-errors';

const modules = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' });

/** Parsed data files keyed by path relative to data/, e.g. "rooms/boot_sector.json". */
export const DATA_FILES = Object.fromEntries(
  Object.entries(modules).map(([path, data]) => [path.replace('../../data/', ''), data]),
);

/**
 * Running in the dev server (not a build): the room editor can save rooms
 * straight to data/rooms/ there (D56).
 */
export const DEV_SERVER = import.meta.env.DEV;

/**
 * JSON Schema errors (dev server only; a build with schema errors fails,
 * so this is always empty in production).
 * @type {string[]}
 */
export const SCHEMA_ERRORS = schemaErrors;
