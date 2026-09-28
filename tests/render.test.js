import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color, GreaterDepth, Vector3 } from 'three';
import {
  bufferSize,
  clampRenderScale,
  fitLetterbox,
  scaleToHeight,
} from '../src/render/viewport.js';
import { VIEW_HEIGHT, createIsoCamera, frameRoom, projectedHeight } from '../src/render/camera.js';
import { blockEdges, edgeUnitKeys, groupedBlockEdges } from '../src/render/edges.js';
import { MARKS, markSegments } from '../src/render/marks.js';
import { SPIKES, spikePyramids, spikeSegments, spikeTriangles } from '../src/render/spikes.js';
import { holeSides } from '../src/render/hole-view.js';
import { OBJECT_VIEWS } from '../src/render/room-scene.js';
import { OBJECT_KINDS } from '../src/entities/kinds.js';
import DEFS from '../data/defs.json' with { type: 'json' };
import DEFS_SCHEMA from '../schemas/defs.schema.json' with { type: 'json' };
import { ENEMY_MODELS } from '../src/render/entity-view.js';
import { DISCHARGE, arcSegments, burstSegments, chargeGlow, dischargeLook } from '../src/render/discharge.js';
import { createRoomView } from '../src/render/room-view.js';
import { resolveBlockTypes } from '../src/data/room-data.js';
import { LOOK_DEFAULTS, roomLook } from '../src/render/neon.js';
import { createWizard } from '../src/render/wizard.js';
import { CHARACTER_ORDER, XRAY_ORDER, addXray } from '../src/render/xray.js';

test('letterbox fills a 16:9 window exactly', () => {
  assert.deepEqual(fitLetterbox(1920, 1080), { x: 0, y: 0, width: 1920, height: 1080 });
});

test('letterbox adds bars on wide and tall windows', () => {
  assert.deepEqual(fitLetterbox(2560, 1080), { x: 320, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(fitLetterbox(1600, 1200), { x: 0, y: 150, width: 1600, height: 900 });
});

test('buffer size caps devicePixelRatio and applies render scale', () => {
  assert.deepEqual(bufferSize(1920, 1080, 1, 1), { width: 1920, height: 1080 });
  assert.deepEqual(bufferSize(1920, 1080, 3, 1), { width: 3840, height: 2160 });
  assert.deepEqual(bufferSize(1920, 1080, 2, 0.5), { width: 1920, height: 1080 });
});

test('render scale is clamped to 0.5–1', () => {
  assert.equal(clampRenderScale(0.1), 0.5);
  assert.equal(clampRenderScale(2), 1);
  assert.equal(clampRenderScale(0.75), 0.75);
  assert.equal(clampRenderScale(NaN), 1);
});

test('sizes scale with render height', () => {
  assert.equal(scaleToHeight(2, 1080), 2);
  assert.equal(scaleToHeight(2, 2160), 4);
});

/** Screen-space height of a room box in world units, measured with the real camera. */
function measuredHeight(size) {
  const camera = createIsoCamera();
  frameRoom(camera, size);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  let min = Infinity;
  let max = -Infinity;
  for (const x of [0, size[0]])
    for (const y of [0, size[1]])
      for (const z of [0, size[2]]) {
        const v = new Vector3(x, y, z).dot(up);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
  return max - min;
}

test('projected room height matches the camera', () => {
  for (const size of [[8, 4, 8], [16, 6, 16], [24, 6, 8]]) {
    assert.ok(Math.abs(measuredHeight(size) - projectedHeight(size)) < 1e-9);
  }
});

test('the largest legal rooms fit the fixed view', () => {
  for (const size of [[16, 6, 16], [20, 6, 12], [24, 6, 8], [31, 6, 1]]) {
    assert.ok(projectedHeight(size) <= 18, `${size} is too tall`);
    assert.ok(projectedHeight(size) < VIEW_HEIGHT);
  }
});

/** Sorted, comparable form of a segment list. */
const norm = (segments) => segments.map((s) => JSON.stringify(s)).sort();

test('a single block has 12 edges', () => {
  assert.equal(blockEdges([[0, 0, 0]]).length, 12);
});

test('neighbouring blocks merge into one box outline', () => {
  const row = blockEdges([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(row.length, 12);
  assert.ok(norm(row).includes(JSON.stringify([[0, 0, 0], [3, 0, 0]])));

  const cube = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cube.push([x, y, z]);
  assert.equal(blockEdges(cube).length, 12);
});

test('inner corners of an L shape are drawn', () => {
  const edges = norm(blockEdges([[0, 0, 0], [1, 0, 0], [0, 0, 1]]));
  // The vertical concave edge where the arms meet.
  assert.ok(edges.includes(JSON.stringify([[1, 0, 1], [1, 1, 1]])));
});

test('an edge shared by diagonal blocks is drawn once', () => {
  const edges = blockEdges([[0, 0, 0], [1, 1, 0]]);
  // 2 × 12, minus the shared edge, minus 4 pieces that continue in a line.
  assert.equal(edges.length, 19);
  const shared = JSON.stringify([[1, 1, 0], [1, 1, 1]]);
  assert.equal(norm(edges).filter((e) => e === shared).length, 1);
});

test('no blocks, no edges', () => {
  assert.deepEqual(blockEdges([]), []);
});

test('a line claimed by a more dangerous look is left out of the plain edges (D64)', () => {
  const plain = [[0, 0, 0]];
  const danger = [[1, 0, 0]];
  const claimed = edgeUnitKeys(danger);
  const kept = norm(blockEdges(plain, claimed));
  // The shared face x = 1: its 4 edges belong to the dangerous block alone.
  assert.equal(kept.length, 8);
  assert.ok(!kept.some((edge) => JSON.parse(edge).every(([x]) => x === 1)));
  const [grouped] = groupedBlockEdges([plain], claimed);
  assert.deepEqual(norm(grouped).sort(), kept.sort());
});

test('plain types side by side: one outline, no seam; each edge goes to the higher-ranked type around it (D64)', () => {
  const low = [[0, 0, 0], [1, 0, 0]];
  const high = [[2, 0, 0]];
  const [lowEdges, highEdges] = groupedBlockEdges([low, high]);
  // Unit pieces of every edge: together exactly the outline of the whole row.
  const units = (segments) =>
    segments.flatMap(([from, to]) => {
      const axis = from.findIndex((v, i) => v !== to[i]);
      return Array.from({ length: to[axis] - from[axis] }, (_, k) => {
        const p = [...from];
        p[axis] += k;
        return JSON.stringify(p) + axis;
      });
    });
  assert.deepEqual([...units(lowEdges), ...units(highEdges)].sort(), units(blockEdges([...low, ...high])).sort());
  // The end face at x = 2 is no edge at all (the faces are coplanar there)...
  assert.ok(![...lowEdges, ...highEdges].some(([from, to]) => from[0] === 2 && to[0] === 2));
  // ...and the lengthwise edges split where the types meet: x 0..2 low, 2..3 high.
  assert.ok(norm(lowEdges).includes(JSON.stringify([[0, 0, 0], [2, 0, 0]])));
  assert.ok(norm(highEdges).includes(JSON.stringify([[2, 0, 0], [3, 0, 0]])));
});

test('face marks: patterns on all six faces', () => {
  assert.equal(markSegments('none').length, 0);
  assert.equal(markSegments('inset').length, 6 * 4);
  assert.equal(markSegments('cross').length, 6 * 2);
  assert.equal(markSegments('brackets').length, 6 * 8);
  assert.deepEqual(MARKS, ['none', 'inset', 'cross', 'brackets', 'bits']);
});

test('face marks lie on the faces of the cube at the given cell', () => {
  const cell = [3, 1, 5];
  for (const segment of markSegments('inset', cell)) {
    for (const point of segment) {
      // Every point is inside the cube and on at least one of its faces.
      const local = point.map((v, i) => v - cell[i]);
      assert.ok(local.every((v) => v >= 0 && v <= 1));
      assert.ok(local.some((v) => v === 0 || v === 1));
    }
  }
});

test('hole outline: only sides that border floor', () => {
  assert.equal(holeSides([[2, 3]]).length, 4);
  // A 2×2 hole has an outline of 8 unit sides, none between its own tiles.
  const square = holeSides([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(square.length, 8);
  assert.ok(!square.some(([[x1], [x2]]) => x1 === 1 && x2 === 1));
});

test('every object kind in the schema (objects and block types, D60) has a logic class and a view', () => {
  const kinds = [...DEFS_SCHEMA.$defs.objectType.properties.kind.enum, ...DEFS_SCHEMA.$defs.blockType.properties.kind.enum];
  assert.deepEqual(Object.keys(OBJECT_KINDS).sort(), [...kinds].sort());
  assert.deepEqual(Object.keys(OBJECT_VIEWS).sort(), [...kinds].sort());
});

test('every enemy look in the schema has a model, and so every enemy template in defs.json', () => {
  assert.deepEqual(Object.keys(ENEMY_MODELS).sort(), [...DEFS_SCHEMA.$defs.enemyTemplate.properties.look.enum].sort());
  for (const [type, { look }] of Object.entries(DEFS.enemies)) assert.ok(!look || ENEMY_MODELS[look], `no model for look "${look}" of "${type}"`);
});

test('discharge: it charges, then discharges for its ticks, glowing white', () => {
  assert.deepEqual(dischargeLook(null, 24), { charge: 0, discharging: false, shake: 0 });
  const half = dischargeLook(12, 24);
  assert.equal(half.charge, 0.5);
  assert.equal(half.discharging, false);
  assert.ok(half.shake > 0);
  assert.equal(dischargeLook(24, 24).discharging, true);
  assert.equal(dischargeLook(24 + DISCHARGE.ticks, 24).discharging, false, 'over');
  assert.ok(chargeGlow(dischargeLook(24, 24)) > chargeGlow(half));
  // A burst reaches out to its range; an arc runs along +z to its length.
  const burst = burstSegments(0, 1.2).flat();
  assert.ok(Math.max(...burst.map(([x, , z]) => Math.hypot(x, z))) <= 1.2 + 0.2);
  const arc = arcSegments(0, 5).flat();
  assert.equal(Math.max(...arc.map(([, , z]) => z)), 5);
});

test('x-ray: every hologram part of the wizard gets a ghost', () => {
  const wizard = createWizard();
  const parts = [];
  wizard.traverse((node) => node.userData.holoSolid && parts.push(node));
  const ghosts = addXray(wizard);
  assert.equal(ghosts.length, parts.length);
  for (const ghost of ghosts) {
    assert.equal(ghost.material.depthFunc, GreaterDepth, 'drawn only where the world is nearer');
    assert.equal(ghost.material.depthWrite, false);
    assert.equal(ghost.parent.userData.holoSolid.geometry, ghost.geometry, 'same shape as its part');
  }
});

test('x-ray: ghosts draw after the world and before the wizard', () => {
  const wizard = createWizard();
  const ghosts = addXray(wizard);
  wizard.traverse((node) => {
    if (node.isMesh && !ghosts.includes(node)) assert.equal(node.renderOrder, CHARACTER_ORDER);
  });
  for (const ghost of ghosts) assert.equal(ghost.renderOrder, XRAY_ORDER);
  assert.ok(XRAY_ORDER < CHARACTER_ORDER);
  // Every world view that can hide him draws before the ghost.
  const blocks = { block: [[0, 0, 0]], hazard: [[1, 0, 0]], void: [[2, 0, 0]] };
  const room = createRoomView({ size: [4, 3, 4], blocks, blockTypes: resolveBlockTypes(DEFS.blocks), color: '#ffb020' });
  room.traverse((node) => assert.ok(node.renderOrder < XRAY_ORDER, 'room view drawn before the ghost'));
});

test('room view: each static block type in its look and color (D60)', () => {
  const blockTypes = resolveBlockTypes({
    block: { look: 'plain' },
    glass: { look: 'plain', color: '#00ffaa' },
    hazard: { look: 'hazard', color: '#ff3b30', damage: 1 },
    hot: { extends: 'hazard', damage: 2 },
  });
  const blocks = { block: [[0, 0, 0]], glass: [[1, 0, 0]], hazard: [[2, 0, 0]], hot: [[3, 0, 0]] };
  const room = createRoomView({ size: [4, 3, 4], blocks, blockTypes, color: '#ffb020' });
  // Block edges glow at 1.6 times their color (room-view.js createBlockView()).
  const edgeColor = (hex) => new Color(hex).multiplyScalar(1.6);
  const lineColors = [];
  room.traverse((node) => node.material?.isLineMaterial && lineColors.push(node.material.color));
  assert.ok(lineColors.some((c) => c.equals(edgeColor('#00ffaa'))), 'a plain type with its own color');
  assert.ok(lineColors.some((c) => c.equals(edgeColor('#ffb020'))), 'a plain type without one takes the room color');
  // Every hazard-look cell can flare, each with its own type's material.
  const { flares } = room.userData;
  assert.deepEqual([...flares.keys()].sort(), ['2,0,0', '3,0,0']);
  assert.notEqual(flares.get('2,0,0'), flares.get('3,0,0'));
});

test('x-ray: parts of one color share a ghost material with the wizard flash', () => {
  const wizard = createWizard();
  const ghosts = addXray(wizard);
  const materials = new Set(ghosts.map((ghost) => ghost.material));
  assert.equal(materials.size, 2, 'magenta body and hat, cyan head and hands');
  for (const material of materials) assert.equal(material.uniforms.uFlash, wizard.userData.flash.amount);
});

test('roomLook fills in the Home Lattice look where a biome sets nothing (D62)', () => {
  assert.deepEqual(roomLook(undefined), LOOK_DEFAULTS);
  assert.deepEqual(roomLook({ bloom: 1.7 }), { ...LOOK_DEFAULTS, bloom: 1.7 });
});

test('spiked shape (D82): four pyramids on each side of a core, inside the cell, tips on its faces', () => {
  const cell = [2, 1, 3];
  const pyramids = spikePyramids(cell);
  assert.equal(pyramids.length, 6 * 4);
  const local = (p) => p.map((v, i) => v - cell[i]);
  for (const { base, tip } of pyramids) {
    // The tip lies on a face of the cell, the base on the core, SPIKES.inset in.
    assert.equal(local(tip).filter((v) => v === 0 || v === 1).length, 1);
    for (const corner of base) assert.ok(local(corner).every((v) => v >= SPIKES.inset - 1e-9 && v <= 1 - SPIKES.inset + 1e-9));
  }
  // Four sides per pyramid, three corners each.
  const positions = spikeTriangles(cell);
  assert.equal(positions.length, 6 * 4 * 4 * 3 * 3);
  // Every triangle faces out of the cell's middle side (its normal points away from the core's center).
  const center = cell.map((v) => v + 0.5);
  for (let i = 0; i < positions.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((k) => positions.slice(i + k, i + k + 3));
    const u = b.map((v, k) => v - a[k]);
    const w = c.map((v, k) => v - a[k]);
    const normal = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const out = c.map((v, k) => v - center[k]); // c is the tip
    assert.ok(normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2] > 0);
  }
  // Outline: 4 ridges per pyramid, plus the core's 12 edges (2 pieces each, drawn once).
  assert.equal(spikeSegments(cell).length, 6 * 4 * 4 + 12 * 2);
});
