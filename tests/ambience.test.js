import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withExitDefaults } from '../src/data/room-data.js';
import { LOOK_DEFAULTS, roomLook } from '../src/render/neon.js';
import { panelGlowPlacement } from '../src/render/panel-glow.js';
import { pickPanels, wallLayout } from '../src/render/walls.js';
import biomes from '../data/biomes.json' with { type: 'json' };

/** A repeatable random sequence (a small LCG). */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('ambience is off by default and on in Home Lattice only (D179)', () => {
  assert.equal(LOOK_DEFAULTS.flows, 0);
  assert.equal(LOOK_DEFAULTS.panels, 0);
  const lattice = roomLook(biomes.biomes.home_lattice.look);
  assert.ok(lattice.flows > 0 && lattice.panels > 0);
  for (const [id, biome] of Object.entries(biomes.biomes)) {
    if (id === 'home_lattice') continue;
    const look = roomLook(biome.look);
    assert.deepEqual([look.flows, look.panels], [0, 0], id);
  }
});

test('panels: none without a share, never in the bottom row, by a doorway or touching each other', () => {
  const size = [12, 4, 12];
  const exits = [withExitDefaults({ id: 'w', side: '-x', at: 5 }), withExitDefaults({ id: 'n', side: '-z', at: 3, y: 1 })];
  assert.deepEqual(pickPanels(size, exits, 0), []);
  for (let seed = 1; seed <= 20; seed++) {
    const panels = pickPanels(size, exits, 0.5, seeded(seed));
    assert.ok(panels.length > 0);
    for (const p of panels) {
      assert.ok(p.v >= 1 && p.v < 4, `row ${p.v}`);
      for (const e of exits.filter((exit) => exit.side === p.side)) {
        const beside = p.u >= e.at - 1 && p.u <= e.at + e.width && p.v <= e.y + e.height;
        assert.ok(!beside, `panel ${p.side} ${p.u},${p.v} by exit ${e.id}`);
      }
      for (const q of panels) {
        if (q === p || q.side !== p.side) continue;
        assert.ok(Math.abs(q.u - p.u) > 1 || Math.abs(q.v - p.v) > 1, 'panels touch');
      }
    }
  }
});

test('panels: about the share asked for, fewer only where they would touch', () => {
  // 2 walls of 12 cells by 3 rows (bottom row left out), no doorways: 72 free cells.
  const panels = pickPanels([12, 4, 12], [], 0.08, seeded(7));
  assert.ok(panels.length >= 4 && panels.length <= 6, `${panels.length}`);
});

test('walls: a panel cell is glass in a frame instead of a dark face', () => {
  const plain = wallLayout([4, 3, 4], []);
  const { faces, frames, glass } = wallLayout([4, 3, 4], [], [{ side: '-z', u: 1, v: 1 }]);
  assert.equal(faces.length, plain.faces.length - 1);
  assert.equal(frames.length, 4);
  // Set into the wall's outer side, flush with its inner face.
  const [lo, hi] = glass[0];
  assert.deepEqual([lo[0], lo[1], hi[0], hi[1]], [1, 1, 2, 2]);
  assert.ok(lo[2] < 0 && hi[2] === 0);
});


test('panel glow: in front of each pane, facing into the room (D181)', () => {
  const placed = panelGlowPlacement([{ side: '-x', u: 3, v: 1 }, { side: '-z', u: 5, v: 2 }]);
  assert.equal(placed[0].facing, '+x');
  assert.deepEqual(placed[0].center.slice(1), [1.5, 3.5]);
  assert.ok(placed[0].center[0] > 0 && placed[0].center[0] < 0.01);
  assert.equal(placed[1].facing, '+z');
  assert.deepEqual(placed[1].center.slice(0, 2), [5.5, 2.5]);
  assert.ok(placed[1].center[2] > 0 && placed[1].center[2] < 0.01);
});

test('space is off by default and on in the Outer Buffer only (D182)', () => {
  assert.deepEqual([LOOK_DEFAULTS.stars, LOOK_DEFAULTS.nebula, LOOK_DEFAULTS.blackHole], [0, 0, 0]);
  const buffer = roomLook(biomes.biomes.outer_buffer.look);
  assert.ok(buffer.stars > 0 && buffer.nebula > 0 && buffer.blackHole > 0);
  for (const [id, biome] of Object.entries(biomes.biomes)) {
    if (id === 'outer_buffer') continue;
    const look = roomLook(biome.look);
    assert.deepEqual([look.stars, look.nebula, look.blackHole], [0, 0, 0], id);
  }
});

test('star exits are off by default and on in the Outer Buffer only (D183)', () => {
  assert.equal(LOOK_DEFAULTS.starExits, false);
  for (const [id, biome] of Object.entries(biomes.biomes)) {
    assert.equal(roomLook(biome.look).starExits, id === 'outer_buffer', id);
  }
});
