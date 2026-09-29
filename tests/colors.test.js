import { test } from 'node:test';
import assert from 'node:assert/strict';
import DEFS from '../data/defs.json' with { type: 'json' };
import BIOMES from '../data/biomes.json' with { type: 'json' };
import { PALETTE } from '../src/render/neon.js';

/**
 * The color rules (D99): room colors (biomes) stay clear of the colors that
 * carry meaning for objects and blocks, so a crate, a platform, a switch or
 * a hazard never blends into its room. Monsters and spell effects are not
 * checked yet.
 */

/** Smallest hue gap (degrees) between two saturated colors. */
const MIN_HUE_GAP = 20;
/** Below this saturation a color is neutral (white, gray, black): its hue means nothing. */
const NEUTRAL = 0.3;

/** @param {string|number} color '#rrggbb' or 0xrrggbb */
function hsv(color) {
  const n = typeof color === 'number' ? color : parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Every color with a meaning for objects and blocks, by name. */
function ruleColors() {
  const colors = {
    'wizard (PALETTE.magenta)': PALETTE.magenta,
    'danger (PALETTE.danger)': PALETTE.danger,
  };
  for (const [id, type] of Object.entries(DEFS.objects)) if (type.color) colors[`objects.${id}`] = type.color;
  for (const [id, type] of Object.entries(DEFS.blocks)) if (type.color) colors[`blocks.${id}`] = type.color;
  return colors;
}

test('color rules: biome colors stay clear of object and block colors (D99)', () => {
  const clashes = [];
  for (const [id, biome] of Object.entries(BIOMES.biomes)) {
    const room = hsv(biome.color);
    for (const [name, color] of Object.entries(ruleColors())) {
      const rule = hsv(color);
      if (room.s >= NEUTRAL && rule.s >= NEUTRAL) {
        const gap = hueGap(room.h, rule.h);
        if (gap < MIN_HUE_GAP) clashes.push(`${id} ${biome.color} vs ${name} ${color}: hue gap ${gap.toFixed(1)}°`);
      } else if (rule.s < NEUTRAL && rule.v > 0.8 && room.s < NEUTRAL && room.v > 0.7) {
        clashes.push(`${id} ${biome.color} vs ${name} ${color}: both near white`);
      }
    }
  }
  assert.deepEqual(clashes, []);
});

test('color rules: everything that hurts is the one danger red (D99)', () => {
  const danger = `#${PALETTE.danger.toString(16).padStart(6, '0')}`;
  const hurts = [
    ...Object.entries(DEFS.objects).filter(([, type]) => type.damage),
    ...Object.entries(DEFS.blocks).filter(([, type]) => type.damage),
  ];
  assert.ok(hurts.length > 0);
  for (const [id, type] of hurts) assert.equal(type.color.toLowerCase(), danger, id);
});

test('color rules: collapsing blocks take the room color (D99)', () => {
  assert.equal(DEFS.blocks.collapsing.color, undefined);
});
