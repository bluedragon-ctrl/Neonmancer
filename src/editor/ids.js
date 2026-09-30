/**
 * Ids the editors give things (rooms, exits, enemy templates, screen
 * texts): the pattern of common.schema.json, and why a new one won't do.
 */

/** Room ids, exit ids, template and text ids (common.schema.json). */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Why `id` can't be a new id, or null.
 * @param {string} label what it names, for the message: `Room id`
 * @param {string} id
 * @param {Iterable<string>} taken ids in use
 */
export function idProblem(label, id, taken) {
  if (!ID_PATTERN.test(id)) return `${label}: lowercase letters, digits and _, starting with a letter.`;
  if (new Set(taken).has(id)) return `${label}: "${id}" is taken.`;
  return null;
}
