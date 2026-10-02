// Installs the packages when this checkout lacks any of them. A git worktree
// has no node_modules of its own, and Node would quietly use the main
// checkout's, which may be from an older branch (a missing `howler` broke the
// dev server in every new worktree). Runs before dev, build and test.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !existsSync(`${root}node_modules/${name}/package.json`));

if (missing.length > 0) {
  console.log(`Installing packages (missing here: ${missing.join(', ')})...`);
  const result = spawnSync('npm install --no-audit --no-fund', { cwd: root, stdio: 'inherit', shell: true });
  process.exit(result.status ?? 1);
}
