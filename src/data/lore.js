/**
 * Screen texts (D118): short hints and lore in data/lore.json, shown in the
 * wizard's terminal when he comes near a screen that has one. Plain logic.
 */

/**
 * Limits of a text, so it fits the terminal (schemas/lore.schema.json
 * holds the same numbers; tests keep them equal).
 */
export const LORE_LIMITS = {
  /** Lines under the title. */
  lines: 6,
  /** Characters per line. */
  lineLength: 48,
  /** Characters of the title. */
  titleLength: 32,
};

/**
 * How near the wizard comes to a screen for its text to show: the gap
 * between his box and the screen's, in units (one cell in front of it).
 */
export const LORE_REACH = 1;

/** Looks of decorations that can show a text (D118): the screen only. */
export const TEXT_LOOKS = ['screen'];

/**
 * What the terminal prints for a text: its title as a prompt line, then
 * its lines as written.
 * @param {{ title?: string, lines: string[] }} text an entry of lore.json "texts"
 * @returns {string[]}
 */
export function loreLines({ title, lines }) {
  return title ? [`> ${title}`, ...lines] : [...lines];
}

/**
 * Why a text can't be saved like this, or null: 1 to LORE_LIMITS.lines
 * lines, none too long or blank, a title not too long.
 * @param {{ title?: string, lines: string[] }} text
 * @returns {string|null}
 */
export function loreProblem({ title = '', lines }) {
  if (lines.length === 0) return 'A text needs at least one line.';
  if (lines.length > LORE_LIMITS.lines) return `A text has at most ${LORE_LIMITS.lines} lines, this one ${lines.length}.`;
  const long = lines.findIndex((line) => line.length > LORE_LIMITS.lineLength);
  if (long >= 0) return `Line ${long + 1} is ${lines[long].length} characters long; at most ${LORE_LIMITS.lineLength} fit.`;
  if (lines.some((line) => line.trim() === '')) return 'A text has no blank lines.';
  if (title.length > LORE_LIMITS.titleLength) return `The title is ${title.length} characters long; at most ${LORE_LIMITS.titleLength} fit.`;
  return null;
}
