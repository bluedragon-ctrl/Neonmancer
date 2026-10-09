/**
 * The cracked top of a spiked crate (D198): a jagged crack across the top
 * face, in danger red, with neon fire lashing out of it. Two looks:
 * `flame` (tongues of fire standing in the crack) and `wave` (a rippling
 * sheet of fire along it). The fire is animated in the shader from
 * HOLO_TIME (additive, no depth written), so a view needs no update.
 *
 * The camera sees only the top, +x and +z faces, so the crack is drawn on
 * the top face and every tongue is a pair of crossed vertical quads, one
 * facing +x and one facing +z.
 *
 * Pure geometry (crackPoints(), fireQuads(), tested) and the materials.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from 'three';
import { HOLO_TIME } from './holo.js';
import { lineMaterial, neonLines, PALETTE } from './neon.js';

/** Tuning: how high the fire rises over the top face, and how wide a tongue is (units). */
export const CRACK = { height: 0.5, tongueWidth: 0.2, lift: 0.004 };

/**
 * The crack as a polyline across the top face, in cell units [x, z]: a main
 * fracture from one edge to the other with a branch. Fixed, so every spiked
 * crate cracks the same way.
 */
export const CRACK_PATH = [
  [0.1, 0.22],
  [0.32, 0.38],
  [0.4, 0.55],
  [0.62, 0.6],
  [0.74, 0.8],
  [0.9, 0.88],
];
export const CRACK_BRANCH = [
  [0.4, 0.55],
  [0.26, 0.74],
  [0.18, 0.9],
];

/**
 * The crack's line segments on the top face of the cell at `at`.
 * @param {number[]} at cell [x, y, z]
 * @returns {number[][][]} [[x, y, z], [x, y, z]] pairs
 */
export function crackSegments(at) {
  const y = at[1] + 1 + CRACK.lift;
  const segments = [];
  for (const path of [CRACK_PATH, CRACK_BRANCH]) {
    for (let i = 0; i + 1 < path.length; i++) {
      segments.push([[at[0] + path[i][0], y, at[2] + path[i][1]], [at[0] + path[i + 1][0], y, at[2] + path[i + 1][1]]]);
    }
  }
  return segments;
}

/**
 * Quads of fire standing on the crack. Each vertex is [x, y, z, along, v,
 * seed]: `along` runs across a tongue (−1..1) or along the wave (0..1), `v`
 * is the height 0..1, `seed` tells quads apart.
 * @param {'flame'|'wave'} look
 * @param {number[]} at cell [x, y, z]
 * @returns {number[][][]} quads of four vertices (bottom-left, bottom-right, top-right, top-left)
 */
export function fireQuads(look, at) {
  const y = at[1] + 1 + CRACK.lift;
  const top = y + CRACK.height;
  const quads = [];
  const quad = (a, b, seed, along) => {
    const [x0, z0] = a;
    const [x1, z1] = b;
    quads.push([
      [at[0] + x0, y, at[2] + z0, along[0], 0, seed],
      [at[0] + x1, y, at[2] + z1, along[1], 0, seed],
      [at[0] + x1, top, at[2] + z1, along[1], 1, seed],
      [at[0] + x0, top, at[2] + z0, along[0], 1, seed],
    ]);
  };
  if (look === 'wave') {
    // A sheet along each stretch of the crack; `along` keeps running so the ripple is continuous.
    let length = 0;
    for (const [pathIndex, path] of [CRACK_PATH, CRACK_BRANCH].entries()) {
      for (let i = 0; i + 1 < path.length; i++) {
        const span = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        quad(path[i], path[i + 1], pathIndex, [length, length + span]);
        length += span;
      }
    }
  } else {
    // A tongue on each bend of the crack, crossed in x and z.
    const half = CRACK.tongueWidth / 2;
    const points = [...CRACK_PATH.slice(1, -1), CRACK_BRANCH[CRACK_BRANCH.length - 1]];
    points.forEach(([x, z], i) => {
      quad([x - half, z], [x + half, z], i * 0.37 + 0.1, [-1, 1]);
      quad([x, z - half], [x, z + half], i * 0.37 + 0.2, [-1, 1]);
    });
  }
  return quads;
}

const vertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  uniform float uTime;
  attribute vec3 aInfo; // across or along, height 0..1, seed
  varying vec3 vInfo;
  void main() {
    vInfo = aInfo;
    vec3 p = position;
    // The upper part sways, more the higher it is.
    float sway = sin(uTime * 7.0 + aInfo.z * 40.0 + aInfo.y * 4.0) * 0.06 * aInfo.y * aInfo.y;
    p.x += sway;
    p.z += sway * 0.7;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vInfo;
  void main() {
    #include <clipping_planes_fragment>
    float across = vInfo.x;
    float v = vInfo.y;
    float seed = vInfo.z;
    float shape;
  #ifdef WAVE
    // The sheet's upper edge ripples along the crack.
    float edge = 0.62 + 0.28 * sin(across * 16.0 + uTime * 5.0 + seed * 3.0) + 0.14 * sin(across * 37.0 - uTime * 9.0);
    shape = 1.0 - smoothstep(edge - 0.3, edge, v);
  #else
    // A tongue tapering to a flickering tip.
    float tip = 0.55 + 0.45 * (0.5 + 0.5 * sin(uTime * 9.0 + seed * 50.0));
    float width = max(0.0, 1.0 - v / tip);
    shape = smoothstep(0.0, 0.35, width - abs(across) * (0.4 + 0.6 * v));
  #endif
    // Orange at the foot, danger red above.
    vec3 hot = mix(vec3(1.0, 0.5, 0.3), uColor * 1.3, smoothstep(0.0, 0.5, v));
    float alpha = shape * (1.0 - 0.4 * v);
    gl_FragColor = vec4(hot, alpha);
  }
`;

/** The fire's material: additive, see-through, clipped like the crate (a hole's floor line). */
function fireMaterial(look, color) {
  return new ShaderMaterial({
    uniforms: { uTime: HOLO_TIME, uColor: { value: new Color(color) } },
    defines: look === 'wave' ? { WAVE: '' } : {},
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
 * A crate's cracked top: the crack lines and the fire, positioned for the
 * cell at `at`.
 * @param {'flame'|'wave'} look
 * @param {number[]} at cell [x, y, z]
 * @param {number|string} [color] the fire's tip and the crack
 */
export function createCrack(look, at, color = PALETTE.danger) {
  const group = new Group();
  const crack = neonLines(crackSegments(at), lineMaterial({ color, width: 2, brightness: 2 }));
  crack.renderOrder = 3;
  group.add(crack);

  const positions = [];
  const info = [];
  const quads = fireQuads(look, at);
  for (const quad of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(quad[i][0], quad[i][1], quad[i][2]);
      info.push(quad[i][3], quad[i][4], quad[i][5]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aInfo', new Float32BufferAttribute(info, 3));
  const fire = new Mesh(geometry, fireMaterial(look, color));
  fire.renderOrder = 4;
  fire.frustumCulled = false;
  group.add(fire);
  return group;
}
