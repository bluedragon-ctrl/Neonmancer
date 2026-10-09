/**
 * The cracked top of a spiked crate (D198): a wide fissure across the top
 * face, dark inside with danger-red edges, and a polar aurora rising out
 * of it: slow curtains of light with vertical rays, crimson at the foot
 * and dark indigo above. The aurora is animated in the shader from
 * HOLO_TIME (additive, no depth written), so a view needs no update.
 *
 * The camera sees only the top, +x and +z faces; the fissure lies on the
 * top face and the curtains stand over its centre line, so they read from
 * the camera whichever way the crack runs.
 *
 * Pure geometry (crackPaths(), fissureOutline(), curtainQuads(), tested)
 * and the materials.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three';
import { HOLO_TIME } from './holo.js';
import { lineMaterial, neonLines, PALETTE } from './neon.js';

/** Tuning (units): fissure half-width at its widest, curtain height, quads per path segment, lift over the top face. */
export const CRACK = { halfWidth: 0.1, height: 0.9, steps: 4, lift: 0.004 };

/** The aurora's colors (sRGB, 0–1): crimson at the foot, dark indigo above. */
export const AURORA = { foot: [0.9, 0.06, 0.22], top: [0.3, 0.1, 0.95] };

/** The crack on a side face of the core: [across share, depth share of the core's height] down from its top edge. */
export const CORE_FACE_CRACK = [[0.3, 0], [0.4, 0.18], [0.3, 0.36], [0.44, 0.54], [0.36, 0.74]];

/**
 * The fissure's paths across the top face, in cell units [x, z, half-width
 * share]: a main fracture edge to edge and a shorter branch. Fixed, so
 * every spiked crate cracks the same way.
 */
export const CRACK_PATHS = [
  [[0.06, 0.2, 0.35], [0.3, 0.36, 0.8], [0.42, 0.54, 1], [0.64, 0.6, 0.9], [0.76, 0.78, 0.7], [0.94, 0.88, 0.3]],
  [[0.42, 0.54, 0.6], [0.28, 0.72, 0.5], [0.2, 0.92, 0.25]],
];

/**
 * A path subdivided into straight steps (the curtains bend along them).
 * @param {number[][]} path points [x, z, share]
 * @param {number} steps pieces per segment
 */
export function subdivide(path, steps = CRACK.steps) {
  const points = [];
  for (let i = 0; i + 1 < path.length; i++) {
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      points.push(path[i].map((v, j) => v + (path[i + 1][j] - v) * t));
    }
  }
  points.push([...path[path.length - 1]]);
  return points;
}

/**
 * The two edges of the fissure along a path: the points left and right of
 * the centre line, as wide as the point's share of the half-width.
 * @param {number[][]} path points [x, z, share]
 * @returns {{ left: number[][], right: number[][] }} [x, z] points
 */
export function fissureOutline(path) {
  const left = [];
  const right = [];
  path.forEach(([x, z, share], i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / length;
    const nz = (b[0] - a[0]) / length;
    const w = CRACK.halfWidth * share;
    left.push([x + nx * w, z + nz * w]);
    right.push([x - nx * w, z - nz * w]);
  });
  return { left, right };
}

/**
 * Line segments of the fissure's edges (both sides, closed at the ends),
 * mapped from the unit top face into a square at `origin` ([x, y, z]) of
 * side `scale`: the crate's top face, or the core's top face inside it.
 * @param {number[]} origin
 * @param {number} [scale]
 * @returns {number[][][]} [[x, y, z], [x, y, z]] pairs
 */
function outlineSegments([ox, y, oz], scale = 1) {
  const segments = [];
  const world = ([x, z]) => [ox + x * scale, y, oz + z * scale];
  for (const path of CRACK_PATHS) {
    const { left, right } = fissureOutline(path);
    for (const side of [left, right]) {
      for (let i = 0; i + 1 < side.length; i++) segments.push([world(side[i]), world(side[i + 1])]);
    }
    segments.push([world(left[0]), world(right[0])], [world(left[left.length - 1]), world(right[right.length - 1])]);
  }
  return segments;
}

/**
 * The fissure's edges on the top face of the cell at `at`.
 * @param {number[]} at cell [x, y, z]
 */
export function crackSegments(at) {
  return outlineSegments([at[0], at[1] + 1 + CRACK.lift * 2, at[2]]);
}

/**
 * Where the glass crate's core sits: its lower corner and top height
 * (a centred cube of side `size`).
 * @param {number[]} at cell [x, y, z]
 * @param {number} size core side
 */
function coreTop(at, size) {
  const gap = (1 - size) / 2;
  return { x: at[0] + gap, z: at[2] + gap, y: at[1] + gap + size };
}

/**
 * The crack seen on the core inside the glass: the same fissure on the
 * core's top face, and its edges again on the core's +x and +z faces
 * running down (the faces the camera sees), so the fracture clearly goes
 * through the glass into the core.
 * @param {number[]} at cell [x, y, z]
 * @param {number} size core side
 * @returns {number[][][]} segments
 */
export function coreCrackSegments(at, size) {
  const { x, y, z } = coreTop(at, size);
  const segments = outlineSegments([x, y + 0.012, z], size);
  // A jagged line down each side face, from the top edge.
  const down = (point) => (u, d) => point(u * size, y - d * size);
  const onX = down((u, h) => [x + size + 0.012, h, z + u]); // the +x face, u along z
  const onZ = down((u, h) => [x + u, h, z + size + 0.012]); // the +z face, u along x
  for (const face of [onX, onZ]) {
    for (let i = 0; i + 1 < CORE_FACE_CRACK.length; i++) segments.push([face(...CORE_FACE_CRACK[i]), face(...CORE_FACE_CRACK[i + 1])]);
  }
  return segments;
}

/**
 * Triangle positions of the fissure's dark inside on the top face.
 * @param {number[]} at cell [x, y, z]
 * @returns {number[]} flat x, y, z
 */
export function fissureTriangles(at) {
  const y = at[1] + 1 + CRACK.lift;
  const out = [];
  const put = ([x, z]) => out.push(at[0] + x, y, at[2] + z);
  for (const path of CRACK_PATHS) {
    const { left, right } = fissureOutline(path);
    for (let i = 0; i + 1 < left.length; i++) {
      for (const p of [left[i], right[i], right[i + 1], left[i], right[i + 1], left[i + 1]]) put(p);
    }
  }
  return out;
}

/**
 * The aurora's curtains: a vertical sheet standing over each path's centre
 * line, in short steps so it can wave. Each vertex is [x, y, z, along, v,
 * seed]: `along` is the distance along the path, `v` the height 0..1, `seed`
 * tells the paths apart.
 * @param {number[]} at cell [x, y, z]
 * @returns {number[][][]} quads of four vertices (bottom-left, bottom-right, top-right, top-left)
 */
export function curtainQuads(at) {
  const y = at[1] + 1 + CRACK.lift;
  const quads = [];
  CRACK_PATHS.forEach((path, seed) => {
    const points = subdivide(path);
    // The branch is a lower curtain.
    const height = CRACK.height * (seed === 0 ? 1 : 0.7);
    let along = 0;
    for (let i = 0; i + 1 < points.length; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const next = along + Math.hypot(x1 - x0, z1 - z0);
      quads.push([
        [at[0] + x0, y, at[2] + z0, along, 0, seed],
        [at[0] + x1, y, at[2] + z1, next, 0, seed],
        [at[0] + x1, y + height, at[2] + z1, next, 1, seed],
        [at[0] + x0, y + height, at[2] + z0, along, 1, seed],
      ]);
      along = next;
    }
  });
  return quads;
}

const vertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  uniform float uTime;
  attribute vec3 aInfo; // along the path, height 0..1, seed
  varying vec3 vInfo;
  void main() {
    vInfo = aInfo;
    vec3 p = position;
    // The curtain billows slowly, more the higher it is.
    float h = aInfo.y * aInfo.y;
    p.x += sin(aInfo.x * 7.0 + uTime * 1.3 + aInfo.z * 2.0) * 0.1 * h;
    p.z += cos(aInfo.x * 6.0 - uTime * 1.1 + aInfo.z * 3.0) * 0.1 * h;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform float uTime;
  uniform vec3 uFoot;
  uniform vec3 uTop;
  varying vec3 vInfo;
  void main() {
    #include <clipping_planes_fragment>
    float a = vInfo.x;
    float v = vInfo.y;
    float seed = vInfo.z;
    // Vertical rays, drifting sideways as they wander.
    float rays = 0.5 + 0.5 * sin(a * 46.0 + sin(a * 8.0 + uTime * 0.7 + seed) * 2.5 + seed * 5.0);
    rays = 0.45 + 0.55 * pow(rays, 1.4);
    // Brighter bands travelling up the curtain.
    float flow = 0.65 + 0.35 * sin(v * 5.0 - uTime * 1.6 + a * 4.0);
    // A ragged upper edge that rises and sinks, and a soft foot.
    float edge = 0.7 + 0.3 * sin(a * 9.0 + uTime * 0.9 + seed * 2.0);
    float body = (1.0 - smoothstep(edge - 0.45, edge, v)) * smoothstep(0.0, 0.05, v + 0.04);
    vec3 color = mix(uFoot, uTop, smoothstep(0.05, 0.85, v));
    gl_FragColor = vec4(color, body * rays * flow * 1.7);
  }
`;

/** The aurora's material: additive, see-through, clipped like the crate (a hole's floor line). */
function auroraMaterial() {
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

/**
 * The fracture walls inside the glass: a sheet under each path's centre
 * line from the top face down to the core's top, shrinking into the
 * core's smaller crack, so the fissure reads as going through the glass
 * to the core. Vertices as curtainQuads(), `v` running 0 at the top
 * face to 1 at the core.
 * @param {number[]} at cell [x, y, z]
 * @param {number} size core side
 * @returns {number[][][]} quads
 */
export function seamQuads(at, size) {
  const yTop = at[1] + 1 + CRACK.lift;
  const core = coreTop(at, size);
  const quads = [];
  CRACK_PATHS.forEach((path, seed) => {
    const points = subdivide(path);
    let along = 0;
    for (let i = 0; i + 1 < points.length; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const next = along + Math.hypot(x1 - x0, z1 - z0);
      quads.push([
        [at[0] + x0, yTop, at[2] + z0, along, 0, seed],
        [at[0] + x1, yTop, at[2] + z1, next, 0, seed],
        [core.x + x1 * size, core.y, core.z + z1 * size, next, 1, seed],
        [core.x + x0 * size, core.y, core.z + z0 * size, along, 1, seed],
      ]);
      along = next;
    }
  });
  return quads;
}

const seamVertexShader = /* glsl */ `
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

const seamFragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform float uTime;
  uniform vec3 uFoot;
  uniform vec3 uTop;
  varying vec3 vInfo;
  void main() {
    #include <clipping_planes_fragment>
    float v = vInfo.y;
    // Light seeping up the fracture, strongest at the core, pulsing slowly.
    float pulse = 0.7 + 0.3 * sin(uTime * 1.8 + vInfo.x * 9.0 - v * 4.0);
    vec3 color = mix(uFoot, uTop, v);
    gl_FragColor = vec4(color, (0.18 + 0.4 * v) * pulse);
  }
`;

/** The fracture walls' material: additive and see-through like the aurora's. */
function seamMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: HOLO_TIME, uFoot: { value: new Color(...AURORA.foot) }, uTop: { value: new Color(...AURORA.top) } },
    vertexShader: seamVertexShader,
    fragmentShader: seamFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    clipping: true,
  });
}

/** Geometry for quads of [x, y, z, along, v, seed] vertices. */
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
 * A crate's cracked top: the fissure (dark, red-edged), the aurora over
 * it and, for a glass crate with a core inside (`core`: its side), the
 * fracture going down through the glass and across the core, placed for
 * the cell at `at`.
 * @param {number[]} at cell [x, y, z]
 * @param {number} [core] side of the core inside the glass; 0 or omitted for none
 * @param {number|string} [color] the crack's edges
 */
export function createCrack(at, core = 0, color = PALETTE.danger) {
  const group = new Group();

  const inside = new BufferGeometry();
  inside.setAttribute('position', new Float32BufferAttribute(fissureTriangles(at), 3));
  const dark = new Mesh(inside, new MeshBasicMaterial({ color: 0x07030f, side: DoubleSide }));
  dark.renderOrder = 1;
  group.add(dark);

  const edges = neonLines(crackSegments(at), lineMaterial({ color, width: 2, brightness: 1.8 }));
  edges.renderOrder = 3;
  group.add(edges);

  if (core > 0) {
    const seam = new Mesh(quadGeometry(seamQuads(at, core)), seamMaterial());
    seam.renderOrder = 3;
    seam.frustumCulled = false;
    group.add(seam);
    const deep = neonLines(coreCrackSegments(at, core), lineMaterial({ color, width: 3, brightness: 2.4 }));
    deep.renderOrder = 3;
    group.add(deep);
  }

  const aurora = new Mesh(quadGeometry(curtainQuads(at)), auroraMaterial());
  aurora.renderOrder = 4;
  aurora.frustumCulled = false;
  group.add(aurora);
  return group;
}
