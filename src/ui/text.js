/**
 * UI text helpers: look up strings from data/strings.json and fill in
 * values; the scrambled "decoding" reveal used by the room banner. Pure.
 */

/**
 * Text for `key` with `{name}` placeholders filled from `values`. A missing
 * key shows as `[key]`, so it is easy to spot on screen.
 * @param {Record<string, string>} strings
 * @param {string} key
 * @param {Record<string, string | number>} [values]
 */
export function formatText(strings, key, values = {}) {
  const text = strings[key];
  if (text === undefined) return `[${key}]`;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

/** Glyphs shown in place of letters that are not decoded yet. */
const GLYPHS = '#%&*+=<>/\\|?$@01';

/**
 * `text` with the first `shown` characters in place and the rest replaced by
 * random-looking glyphs (spaces stay), for a "decoding" reveal. The glyphs
 * depend on `seed`, so the same seed gives the same picture.
 * @param {string} text
 * @param {number} shown characters already decoded (0 to text.length)
 * @param {number} seed changes the glyphs, e.g. a frame counter
 */
export function scrambleText(text, shown, seed) {
  let result = text.slice(0, shown);
  for (let i = Math.max(shown, 0); i < text.length; i++) {
    const char = text[i];
    result += char === ' ' ? ' ' : GLYPHS[Math.abs((i * 7 + seed * 13) ^ (seed >> 1)) % GLYPHS.length];
  }
  return result;
}
