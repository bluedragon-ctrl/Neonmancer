/**
 * The vents of a spiked crate (D198): a few square, bit-like holes in its
 * top face (on the same 4 × 4 grid as the crate's data bits, marks.js),
 * dark inside with danger-red edges, and a jet of aurora light shooting
 * out of each: crimson at the foot, dark indigo above, with slow vertical
 * rays. Down in the glass, each hole has a shaft to a smaller square on
 * the core's top, so the holes clearly go all the way to the core.
 *
 * The jets and shafts are animated in the shader from HOLO_TIME (additive,
 * no depth written), so a view needs no update. The camera sees only the
 * top, +x and +z faces, so a jet is a pair of crossed vertical quads.
 *
 * Pure geometry (holeSquare(), holeSegments(), shaftQuads(), jetQuads(),
 * tested) and the materials.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three';
import { BITS } from './marks.js';
import { HOLO_TIME } from './holo.js';
import { lineMaterial, neonLines, PALETTE } from './neon.js';

/** Tuning (units): hole half-side on the top face, jet width and height range, lift over the top face. */
export const VENTS = { half: 0.065, jetWidth: 0.2, jetMin: 0.55, jetMax: 0.95, lift: 0.004 };

/** The aurora's colors (sRGB, 0–1): crimson at the foot, dark indigo above. */
export const AURORA = { foot: [0.9, 0.06, 0.22], top: [0.3, 0.1, 0.95] };

/**
 * Which cells of the top face's 4 × 4 bit grid are vents [column (x),
 * row (z)]: scattered, not a pattern. Fixed, so every spiked crate looks
 * the same.
 */
export const VENT_CELLS = [[0, 1], [1, 3], [2, 0], [2, 2], [3, 1]];

/** Centre [x, z] of a vent in cell units, on the bit grid. */
export function ventCentre([column, row]) {
  const pitch = (1 - 2 * BITS.margin) / BITS.grid;
  return [BITS.margin + pitch * (column + 0.5), BITS.margin + pitch * (row + 0.5)];
}

/**
 * Where the glass crate's core sits: its lower corner and top height (a
 * centred cube of side `size`).
 * @param {number[]} at cell [x, y, z]
 * @param {number} size
 */
function coreTop(at, size) {
  const gap = (1 - size) / 2;
  return { x: at[0] + gap, z: at[2] + gap, y: at[1] + gap + size };
}

/**
 * A vent's four corners [x, y, z] (in order round the square) on the
 * crate's top face, or, with `core` (its side), on the core's top face,
 * where the vent's centre and size are scaled into the core.
 * @param {number[]} at cell [x, y, z]
 * @param {number[]} cell [column, row]
 * @param {number} [core] side of the core, or 0 for the top face
 */
export function holeSquare(at, cell, core = 0) {
  const [cx, cz] = ventCentre(cell);
  const scale = core || 1;
  const origin = core ? coreTop(at, core) : { x: at[0], z: at[2], y: at[1] + 1 };
  const y = origin.y + (core ? 0.012 : VENTS.lift);
  const half = VENTS.half * scale;
  const x = origin.x + cx * scale;
  const z = origin.z + cz * scale;
  return [[x - half, y, z - half], [x + half, y, z - half], [x + half, y, z + half], [x - half, y, z + half]];
}

/** The segments round a square's corners. */
const outline = (corners) => corners.map((a, i) => [a, corners[(i + 1) % 4]]);

/**
 * The red edges of the vents on the top face and, with `core`, the
 * (smaller) ones on the core's top.
 * @param {number[]} at cell [x, y, z]
 * @param {number} [core]
 * @returns {number[][][]} segments
 */
export function holeSegments(at, core = 0) {
  const segments = [];
  for (const cell of VENT_CELLS) {
    segments.push(...outline(holeSquare(at, cell)));
    if (core) segments.push(...outline(holeSquare(at, cell, core)));
  }
  return segments;
}

/** The dark insides of the vents on the top face, as flat triangle positions. */
export function holeTriangles(at) {
  const out = [];
  for (const cell of VENT_CELLS) {
    const [a, b, c, d] = holeSquare(at, cell);
    for (const p of [a, b, c, a, c, d]) out.push(...p);
  }
  return out;
}

/**
 * The shafts: four sheets from each vent's edges on the top face down to
 * its square on the core. Vertex [x, y, z, along, v, seed]: `along` 0..1
 * across a sheet, `v` 0 at the top face to 1 at the core, `seed` per vent.
 * @param {number[]} at cell [x, y, z]
 * @param {number} core side of the core
 * @returns {number[][][]} quads of four vertices
 */
export function shaftQuads(at, core) {
  const quads = [];
  VENT_CELLS.forEach((cell, seed) => {
    const top = holeSquare(at, cell);
    const bottom = holeSquare(at, cell, core);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quads.push([
        [...top[i], 0, 0, seed],
        [...top[j], 1, 0, seed],
        [...bottom[j], 1, 1, seed],
        [...bottom[i], 0, 1, seed],
      ]);
    }
  });
  return quads;
}

/**
 * The corner lines of the shafts: from each corner on the top face to the
 * same corner of the vent's square on the core.
 * @param {number[]} at cell [x, y, z]
 * @param {number} core
 * @returns {number[][][]} segments
 */
export function shaftSegments(at, core) {
  const segments = [];
  for (const cell of VENT_CELLS) {
    const top = holeSquare(at, cell);
    const bottom = holeSquare(at, cell, core);
    for (let i = 0; i < 4; i++) segments.push([top[i], bottom[i]]);
  }
  return segments;
}

/** A jet's height: a fixed spread between VENTS.jetMin and jetMax by vent number. */
export function jetHeight(seed) {
  const share = [0.2, 0.9, 0.5, 1, 0.1][seed % 5];
  return VENTS.jetMin + (VENTS.jetMax - VENTS.jetMin) * share;
}

/**
 * The jets: two crossed vertical quads over each vent. Vertex [x, y, z,
 * across, v, seed]: `across` −1..1 over the width, `v` the height 0..1.
 * @param {number[]} at cell [x, y, z]
 * @returns {number[][][]} quads of four vertices
 */
export function jetQuads(at) {
  const quads = [];
  const half = VENTS.jetWidth / 2;
  VENT_CELLS.forEach((cell, seed) => {
    const [cx, cz] = ventCentre(cell);
    const x = at[0] + cx;
    const z = at[2] + cz;
    const y = at[1] + 1 + VENTS.lift;
    const top = y + jetHeight(seed);
    for (const [dx, dz, offset] of [[half, 0, 0], [0, half, 0.5]]) {
      quads.push([
        [x - dx, y, z - dz, -1, 0, seed + offset],
        [x + dx, y, z + dz, 1, 0, seed + offset],
        [x + dx, top, z + dz, 1, 1, seed + offset],
        [x - dx, top, z - dz, -1, 1, seed + offset],
      ]);
    }
  });
  return quads;
}

const jetVertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  uniform float uTime;
  attribute vec3 aInfo; // across, height 0..1, seed
  varying vec3 vInfo;
  void main() {
    vInfo = aInfo;
    vec3 p = position;
    // The jet wavers, more the higher it is.
    float h = aInfo.y * aInfo.y;
    p.x += sin(uTime * 2.1 + aInfo.z * 9.0 + aInfo.y * 3.0) * 0.06 * h;
    p.z += cos(uTime * 1.7 + aInfo.z * 7.0 + aInfo.y * 3.0) * 0.06 * h;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const jetFragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform float uTime;
  uniform vec3 uFoot;
  uniform vec3 uTop;
  varying vec3 vInfo;
  void main() {
    #include <clipping_planes_fragment>
    float across = vInfo.x;
    float v = vInfo.y;
    float seed = vInfo.z;
    // Vertical rays inside the jet, drifting sideways.
    float rays = 0.5 + 0.5 * sin(across * 11.0 + sin(uTime * 0.9 + seed) * 2.0 + seed * 5.0);
    rays = 0.4 + 0.6 * pow(rays, 1.3);
    // Bands of light travelling up, and a tip that rises and sinks.
    float flow = 0.65 + 0.35 * sin(v * 6.0 - uTime * 2.2 + seed * 4.0);
    float tip = 0.72 + 0.28 * sin(uTime * 1.6 + seed * 13.0);
    float lengthwise = 1.0 - smoothstep(tip - 0.5, tip, v);
    // Narrower towards the top, soft at the sides.
    float width = 0.35 + 0.65 * (1.0 - v);
    float sideways = 1.0 - smoothstep(0.35 * width, width, abs(across));
    vec3 color = mix(uFoot, uTop, smoothstep(0.05, 0.85, v));
    gl_FragColor = vec4(color, lengthwise * sideways * rays * flow * 1.9);
  }
`;

const shaftFragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform float uTime;
  uniform vec3 uFoot;
  uniform vec3 uTop;
  varying vec3 vInfo;
  void main() {
    #include <clipping_planes_fragment>
    float v = vInfo.y;
    // Light rising out of the core up the shaft, pulsing; bright at the core.
    float pulse = 0.7 + 0.3 * sin(uTime * 2.4 + vInfo.z * 5.0 - v * 6.0);
    vec3 color = mix(uFoot, uTop, v);
    gl_FragColor = vec4(color, (0.12 + 0.55 * v * v) * pulse);
  }
`;

const shaftVertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  attribute vec3 aInfo;
  varying vec3 vInfo;
  void main() {
    vInfo = aInfo;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

/** An additive, see-through material, clipped like the crate (a hole's floor line). */
function lightMaterial(vertexShader, fragmentShader) {
  return new ShaderMaterial({
    uniforms: { uTime: HOLO_TIME, uFoot: { value: new Color(...AURORA.foot) }, uTop: { value: new Color(...AURORA.top) } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    clipping: true,
  });
}

/** Geometry for quads of [x, y, z, a, b, seed] vertices. */
function quadGeometry(quads) {
  const positions = [];
  const info = [];
  for (const quad of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(quad[i][0], quad[i][1], quad[i][2]);
      info.push(quad[i][3], quad[i][4], quad[i][5]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aInfo', new Float32BufferAttribute(info, 3));
  return geometry;
}

/**
 * A crate's vents: the holes in its top, the jets out of them and, for a
 * glass crate with a core (`core`: its side), the shafts down to the core,
 * placed for the cell at `at`.
 * @param {number[]} at cell [x, y, z]
 * @param {number} [core] side of the core inside the glass; 0 or omitted for none
 * @param {number|string} [color] the holes' edges
 */
export function createVents(at, core = 0, color = PALETTE.danger) {
  const group = new Group();
  const part = (mesh, order) => {
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    group.add(mesh);
  };

  const inside = new BufferGeometry();
  inside.setAttribute('position', new Float32BufferAttribute(holeTriangles(at), 3));
  part(new Mesh(inside, new MeshBasicMaterial({ color: 0x07030f, side: DoubleSide })), 1);
  part(neonLines(holeSegments(at, core), lineMaterial({ color, width: 2, brightness: 1.9 })), 3);

  if (core > 0) {
    part(new Mesh(quadGeometry(shaftQuads(at, core)), lightMaterial(shaftVertexShader, shaftFragmentShader)), 3);
    part(neonLines(shaftSegments(at, core), lineMaterial({ color, width: 1.2, brightness: 1 })), 3);
  }

  part(new Mesh(quadGeometry(jetQuads(at)), lightMaterial(jetVertexShader, jetFragmentShader)), 4);
  return group;
}
