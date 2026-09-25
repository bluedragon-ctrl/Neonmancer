/**
 * The only module that uses Vite features (D7): bundles every JSON file in
 * data/ at build time and imports the schema errors found by the dev-server
 * data check (tools/vite-plugin-data.js).
 */
import schemaErrors from 'virtual:data-schema-errors';

const modules = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' });

/** Parsed data files keyed by path relative to data/, e.g. "rooms/boot_sector.json". */
export const DATA_FILES = Object.fromEntries(
  Object.entries(modules).map(([path, data]) => [path.replace('../../data/', ''), data]),
);

/**
 * JSON Schema errors (dev server only; a build with schema errors fails,
 * so this is always empty in production).
 * @type {string[]}
 */
export const SCHEMA_ERRORS = schemaErrors;
