/**
 * How far apart two colors look (OKLab, a perceptual color space), and the
 * rule that every enemy template has a color of its own (D119): a template
 * is a behavior, and the player tells behaviors apart by color. Pure.
 */
import { resolveEnemyTemplates } from './room-data.js';

/** Smallest OKLab distance between two templates' colors. */
export const MIN_TEMPLATE_COLOR_GAP = 0.09;

/** sRGB channel (0–1) to linear light. */
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * A color in OKLab: [lightness, a, b].
 * @param {string} hex '#rrggbb'
 * @returns {number[]}
 */
export function oklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => linear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * How different two colors look: 0 the same, about 0.1 told apart at a glance.
 * @param {string} a '#rrggbb'
 * @param {string} b '#rrggbb'
 */
export function colorGap(a, b) {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * Colors a new template keeps clear of, besides the other templates': the
 * ones with a meaning (D99): the wizard's magenta, the danger red, lime
 * (pushable) and cyan (moving), as in render/neon.js PALETTE.
 */
export const AVOID_COLORS = ['#ff2bd6', '#ff2a3a', '#b6ff3c', '#00f0ff'];

/** Least OKLab lightness of a color picked for a new template: bright enough to glow on the dark void. */
export const MIN_TEMPLATE_LIGHTNESS = 0.68;

/**
 * '#rrggbb' of a hue (degrees), saturation and value (0–1).
 * @param {number} h
 * @param {number} s
 * @param {number} v
 */
export function hsvHex(h, s, v) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[channel(5), channel(3), channel(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A bright color as far from all of `taken` (and AVOID_COLORS) as can be
 * found: for a new enemy template, which needs a color of its own (D119).
 * @param {string[]} taken '#rrggbb'
 * @returns {string}
 */
export function freeColor(taken) {
  let best = null;
  for (let h = 0; h < 360; h += 3) {
    for (const s of [0.55, 0.7, 0.85, 1]) {
      const color = hsvHex(h, s, 1);
      if (oklab(color)[0] < MIN_TEMPLATE_LIGHTNESS) continue;
      const gap = Math.min(...[...taken, ...AVOID_COLORS].map((other) => colorGap(color, other)));
      if (!best || gap > best.gap) best = { color, gap };
    }
  }
  return best.color;
}

/**
 * Pairs of enemy templates whose colors (filled in from the templates they
 * extend) are too alike to tell apart.
 * @param {Record<string, object>} templates defs.json `enemies`, as written
 * @returns {{ a: string, b: string, gap: number }[]} closest first
 */
export function templateColorClashes(templates) {
  const colors = Object.entries(resolveEnemyTemplates(templates)).filter(([, t]) => typeof t.color === 'string');
  const clashes = [];
  colors.forEach(([a, ta], i) => {
    for (const [b, tb] of colors.slice(i + 1)) {
      const gap = colorGap(ta.color, tb.color);
      if (gap < MIN_TEMPLATE_COLOR_GAP) clashes.push({ a, b, gap });
    }
  });
  return clashes.sort((x, y) => x.gap - y.gap);
}
