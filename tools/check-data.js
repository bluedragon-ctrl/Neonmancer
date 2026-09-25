/**
 * Full data check for dev tooling (D8): JSON Schema (Ajv) first, then the
 * same semantic checks the game runs at load time. Used by the Vite plugin
 * and `npm run validate:data`. Never shipped to players.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { formatError, validateData } from '../src/data/validate.js';

/** Which schema describes a data file (path relative to data/). */
export function schemaFor(file) {
  if (/^rooms\/[^/]+\.json$/.test(file)) return 'room.schema.json';
  return {
    'defs.json': 'defs.schema.json',
    'biomes.json': 'biomes.schema.json',
    'world.json': 'world.schema.json',
    'strings.json': 'strings.schema.json',
  }[file];
}

/** All *.json files under `dir`, as paths relative to it with forward slashes. */
function listJson(dir) {
  return readdirSync(dir, { recursive: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => path.endsWith('.json'))
    .sort();
}

/** Read and parse every schema in schemas/. */
export function readSchemas(root) {
  const dir = join(root, 'schemas');
  return listJson(dir).map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

/**
 * Read and parse every file in data/.
 * @returns {{ files: Record<string, any>, errors: string[] }}
 */
export function readDataFiles(root) {
  const dir = join(root, 'data');
  const files = {};
  const errors = [];
  for (const name of listJson(dir)) {
    try {
      files[name] = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (err) {
      errors.push(formatError(name, '', `invalid JSON (${err.message})`));
    }
  }
  return { files, errors };
}

/** Ajv error path "/blocks/3/at" → "blocks[3].at". */
function readablePath(instancePath) {
  return instancePath
    .split('/')
    .slice(1)
    .map((part) => (/^\d+$/.test(part) ? `[${part}]` : `.${part}`))
    .join('')
    .replace(/^\./, '');
}

function readableMessage(error) {
  switch (error.keyword) {
    case 'additionalProperties':
      return `unknown property "${error.params.additionalProperty}"`;
    case 'enum':
      return `must be one of ${error.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
    case 'pattern':
      return `"${error.data}" does not match ${error.params.pattern}`;
    default:
      return error.message;
  }
}

/**
 * Schema-check parsed files.
 * @param {Record<string, any>} files parsed JSON keyed by path relative to data/
 * @param {object[]} schemas parsed schemas
 * @returns {string[]} error messages
 */
export function checkSchemas(files, schemas) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, verbose: true });
  for (const schema of schemas) ajv.addSchema(schema);

  const errors = [];
  for (const [file, data] of Object.entries(files)) {
    const schemaId = schemaFor(file);
    if (!schemaId) {
      errors.push(formatError(file, '', 'no schema for this file (unexpected file in data/)'));
      continue;
    }
    const validate = ajv.getSchema(schemaId);
    if (!validate(data)) {
      for (const error of validate.errors) {
        errors.push(formatError(file, readablePath(error.instancePath), readableMessage(error)));
      }
    }
  }
  return errors;
}

/**
 * Check parsed files: schemas first, semantics only when the schemas pass
 * (the semantic checks assume well-formed data).
 */
export function checkFiles(files, schemas) {
  const errors = checkSchemas(files, schemas);
  return errors.length > 0 ? errors : validateData(files);
}

/**
 * Check everything in data/ against schemas/.
 * @param {string} root project root
 * @returns {{ schemaErrors: string[], errors: string[] }} schema-level errors
 *   (including unreadable files) and all errors
 */
export function checkData(root) {
  const { files, errors: readErrors } = readDataFiles(root);
  const schemaErrors = [...readErrors, ...checkSchemas(files, readSchemas(root))];
  const errors = schemaErrors.length > 0 ? schemaErrors : validateData(files);
  return { schemaErrors, errors };
}

/** Relative path helper for log output. */
export const relativeTo = (root, path) => relative(root, path).split('\\').join('/');
