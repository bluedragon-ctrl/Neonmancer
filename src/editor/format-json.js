/**
 * JSON text in the style of the hand-written data files: two-space indent,
 * and any object or array that fits on its line written on one line
 * (`{ "at": [2, 0, 1], "to": [5, 0, 1] }`), so saved rooms read and diff
 * like the ones written by hand.
 */

/** Longest line, indentation and trailing comma included. */
export const LINE_WIDTH = 120;

/**
 * @param {any} value plain JSON data
 * @param {number} [width] longest line
 * @returns {string} the text, ending with a newline
 */
export function formatJson(value, width = LINE_WIDTH) {
  return `${print(value, '', '', ',', width)}\n`;
}

/** A value on one line: `{ "a": 1 }`, `[1, 2]`, `{}`. */
function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`);
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }
  return JSON.stringify(value);
}

/**
 * A list of records is written one per line even when it would fit: an
 * array of two or more objects (blocks, exits), or an object whose values
 * are all objects (types by id in defs.json).
 */
function isList(value) {
  const items = Object.values(value);
  const records = items.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  return Array.isArray(value) ? records.length >= 2 : items.length > 0 && records.length === items.length;
}

/**
 * A value at `indent`, after `prefix` (its key, if any) and followed by
 * `suffix` (a comma, if more follows). The top level is always expanded.
 */
function print(value, indent, prefix, suffix, width) {
  const flat = inline(value);
  const container = value && typeof value === 'object';
  const top = indent === '' && prefix === '';
  const fits = indent.length + prefix.length + flat.length + suffix.length <= width;
  if (!container || (!top && fits && !isList(value))) return flat;

  const inner = `${indent}  `;
  const items = Array.isArray(value) ? value.map((item) => ['', item]) : Object.entries(value).map(([key, item]) => [`${JSON.stringify(key)}: `, item]);
  if (items.length === 0) return flat;
  const lines = items.map(([key, item], i) => {
    const comma = i < items.length - 1 ? ',' : '';
    return `${inner}${key}${print(item, inner, key, comma, width)}${comma}`;
  });
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${lines.join('\n')}\n${indent}${close}`;
}
