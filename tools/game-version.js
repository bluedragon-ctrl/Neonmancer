/**
 * Dev only: the game version shown in builds (D42).
 *
 * package.json holds MAJOR.MINOR.0: the major version (the author's call)
 * and the phase. The patch number counts the pull requests merged into
 * main since that phase's tag (vMAJOR.MINOR.0): the first-parent commits
 * after it. Without the tag or git (a shallow clone, a zip), the version
 * is just package.json's.
 */
import { execFileSync } from 'node:child_process';

/** Run git in `cwd` and return its trimmed output. */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * @param {string} baseVersion package.json version, MAJOR.MINOR.0
 * @param {(args: string[]) => string} run runs git, returning its output
 *   (throws when git or the tag is missing)
 * @returns {string} MAJOR.MINOR.PATCH
 */
export function versionFrom(baseVersion, run) {
  const [major, minor] = baseVersion.split('.');
  try {
    const merges = Number(run(['rev-list', '--count', '--first-parent', `v${major}.${minor}.0..HEAD`]));
    return Number.isInteger(merges) ? `${major}.${minor}.${merges}` : baseVersion;
  } catch {
    return baseVersion;
  }
}

/**
 * The game version for the checkout at `root`.
 * @param {string} baseVersion package.json version
 * @param {string} root repository root
 */
export function gameVersion(baseVersion, root) {
  return versionFrom(baseVersion, (args) => git(args, root));
}
