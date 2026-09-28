/**
 * Icons for the HUD's clipboard slot (Cut & Paste, D87; pure, tested; no
 * DOM): SVG markup of what the wizard holds, in its own color. A crate is
 * an isometric cube; an enemy a round body with two eyes, in the corner
 * brackets of the Pause cage while frozen (a cut enemy always is).
 */

/** Size of the icons' view box. */
const VIEW = 40;

/**
 * An isometric cube in `color`.
 * @param {string} color
 */
export function crateIcon(color) {
  const faces = [
    ['M20 4 L36 12 L20 20 L4 12 Z', 0.25],
    ['M4 12 L20 20 L20 36 L4 28 Z', 0.12],
    ['M36 12 L20 20 L20 36 L36 28 Z', 0.06],
  ];
  const paths = faces.map(([d, fill]) => `<path d="${d}" fill="${color}" fill-opacity="${fill}"/>`).join('');
  return `<svg viewBox="0 0 ${VIEW} ${VIEW}"><g stroke="${color}" stroke-width="2.5" stroke-linejoin="round">${paths}</g></svg>`;
}

/**
 * An enemy in `color`, caged in `cage` color when frozen.
 * @param {string} color
 * @param {string|null} cage the Pause color while frozen, or null
 */
export function enemyIcon(color, cage) {
  const corners = [
    [4, 4, 1, 1],
    [36, 4, -1, 1],
    [4, 36, 1, -1],
    [36, 36, -1, -1],
  ];
  const brackets = cage
    ? `<g stroke="${cage}" stroke-width="2.5" fill="none">${corners.map(([x, y, dx, dy]) => `<path d="M${x} ${y + dy * 8} L${x} ${y} L${x + dx * 8} ${y}"/>`).join('')}</g>`
    : '';
  const body = `<ellipse cx="20" cy="24" rx="11" ry="9" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.5"/>`;
  const eyes = '<circle cx="16" cy="22" r="2.2" fill="#fff"/><circle cx="24" cy="22" r="2.2" fill="#fff"/>';
  return `<svg viewBox="0 0 ${VIEW} ${VIEW}">${body}${eyes}${brackets}</svg>`;
}

/**
 * The icon of what the clipboard holds, or '' when it is empty.
 * @param {{ kind: 'object'|'enemy', data: { color: string }, frozen?: object }|null} held Player.clipboard
 * @param {string} cage the Pause spell's color
 */
export function clipIcon(held, cage) {
  if (!held) return '';
  return held.kind === 'object' ? crateIcon(held.data.color) : enemyIcon(held.data.color, held.frozen ? cage : null);
}
