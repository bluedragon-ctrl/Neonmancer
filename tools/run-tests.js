/**
 * `npm test`: run Node's test runner on every tests/*.test.js file.
 *
 * The files are listed here instead of passing a folder or a glob to
 * `node --test`: Node 20 takes a folder but no globs, Node 22+ takes globs
 * but reads a folder as a file name, and npm on Windows does not expand
 * globs in the shell. An explicit file list works everywhere.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../tests', import.meta.url));
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => join(dir, name));

const { status } = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
