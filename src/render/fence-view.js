/**
 * Fences drawn as streams of light (D167), from fenceLayout():
 *
 * - Beams: each a camera-facing ribbon of translucent light, a faintly
 *   white core fading out into the color, with packets of light (a bright head, a comet tail)
 *   running along it, unevenly spaced, over a faint ripple. The lower and
 *   upper beam of a level flow opposite ways; the rail on top is steadier
 *   and brighter. Beams fade out at their ends.
 * - Posts are emitters: a small glowing node where each beam meets a
 *   post, and a faint glow up the post, so the light seems to come out of
 *   something.
 *
 * Everything is additive light (no depth written), so a fence never hides
 * the wizard or sets off his x-ray; blocks in front still hide it. Sizes
 * are world units, so they follow the render size like the room does.
 * One instanced draw per part; all motion runs in the shaders on
 * HOLO_TIME.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
} from 'three';
import { fenceLayout } from './fence.js';
import { HOLO_TIME } from './holo.js';

/** Tuning: widths and sizes in units, speeds in units per second. */
export const FENCE = {
  beam: {
    /** Ribbon width (the halo; the core is a share of it). */
    width: 0.2,
    /** Core width as a share of the ribbon. */
    core: 0.18,
    /** How much light the beam gives: below 1 it reads as a translucent
     * shaft of light, not a solid tube, and the room shows through. */
    opacity: 0.5,
    /** How white-hot the core is, between packets and at a packet. */
    hot: 0.15,
    hotPacket: 0.4,
    /** Brightness of the core and the halo between packets. */
    glow: 1.3,
    halo: 0.35,
    /** Packets: one slot every `spacing` units, a share `density` of them lit. */
    spacing: 0.7,
    density: 0.55,
    speed: 1.4,
    /** How much brighter a packet head is than the beam, and its tail's length (share of a slot). */
    packet: 2.6,
    tail: 0.45,
    /** Ripple along the beam: depth (share of the glow), wavelength and speed. */
    ripple: 0.25,
    wave: 0.35,
    rippleSpeed: 2.5,
    /** Fade at the ends of a beam, in units. */
    fade: 0.18,
  },
  rail: { width: 0.24, glow: 1.9, halo: 0.45, opacity: 0.65, density: 0.25, speed: 0.9, packet: 1.6 },
  /** The faint glow up a post. */
  post: { width: 0.1, glow: 0.35, halo: 0.2, opacity: 1, hot: 0.35, density: 0, ripple: 0.4 },
  /** Emitter nodes: size of the glow, its core, brightness and a slow throb. */
  node: { size: 0.22, core: 0.25, glow: 1.6, throb: 0.25, throbSpeed: 1.7 },
};

// The packet pattern. `s` runs along the flow (units), moving with
// time; returns the packet light at that spot (0 between packets).
const packetGlsl = /* glsl */ `
  float hash1(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
  float packetAt(float s, float spacing, float density, float tail, float seed) {
    float slot = floor(s / spacing);
    float f = fract(s / spacing);
    float lit = step(hash1(slot + seed * 17.0), density);
    // Head at the front of the slot (f near 1), tail fading out behind it.
    float head = 1.0 - smoothstep(0.94, 1.0, f);
    float body = smoothstep(1.0 - tail, 0.94, f);
    return lit * head * body * body;
  }
`;

/** Unit quad corners: x along (0..1), y across (−1..1). */
function quadGeometry(instances, attributes) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('corner', new Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
  // three.js wants a position attribute; the shaders place every vertex.
  geometry.setAttribute('position', new Float32BufferAttribute(new Array(12).fill(0), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size, values] of attributes) geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(values), size));
  geometry.instanceCount = instances;
  return geometry;
}

function lightMaterial(vertexShader, fragmentShader, uniforms) {
  return new ShaderMaterial({
    uniforms: { uTime: HOLO_TIME, ...uniforms },
    vertexShader,
    fragmentShader,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    // A ribbon's winding depends on which way its beam runs.
    side: DoubleSide,
  });
}

function lightMesh(geometry, material) {
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

// ---- beams

const beamVertex = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aFlow;
  uniform float uWidth;
  varying float vAcross;
  varying float vDist;
  varying float vLength;
  varying float vFlow;
  varying float vSeed;
  void main() {
    vec3 a = (modelMatrix * vec4(aStart, 1.0)).xyz;
    vec3 b = (modelMatrix * vec4(aEnd, 1.0)).xyz;
    vec3 dir = normalize(b - a);
    // Ribbon across the beam, square to the view.
    vec3 camZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vec3 side = normalize(cross(dir, camZ));
    vec3 world = mix(a, b, corner.x) + side * corner.y * uWidth * 0.5;
    vAcross = corner.y;
    vLength = length(b - a);
    vDist = corner.x * vLength;
    vFlow = aFlow;
    vSeed = dot(aStart, vec3(1.7, 9.3, 4.1));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uCore;
  uniform float uGlow;
  uniform float uHalo;
  uniform float uSpacing;
  uniform float uDensity;
  uniform float uSpeed;
  uniform float uPacket;
  uniform float uTail;
  uniform float uRipple;
  uniform float uWave;
  uniform float uRippleSpeed;
  uniform float uFade;
  uniform float uOpacity;
  uniform float uHot;
  uniform float uHotPacket;
  varying float vAcross;
  varying float vDist;
  varying float vLength;
  varying float vFlow;
  varying float vSeed;
  ${packetGlsl}
  void main() {
    float across = abs(vAcross);
    float core = exp(-pow(across / uCore, 2.0));
    float halo = exp(-pow(across / 0.55, 2.0)) * (1.0 - across);
    float s = vDist * vFlow - uTime * uSpeed;
    float packet = packetAt(s, uSpacing, uDensity, uTail, vSeed);
    float ripple = 1.0 - uRipple + uRipple * (0.5 + 0.5 * sin((vDist * vFlow - uTime * uRippleSpeed) * 6.2832 / uWave));
    float ends = smoothstep(0.0, uFade, vDist) * smoothstep(0.0, uFade, vLength - vDist);
    float light = (core * uGlow * ripple + halo * uHalo) * (1.0 + packet * uPacket);
    // The core goes white-hot where a packet passes.
    vec3 color = mix(uColor, vec3(1.0), core * (uHot + uHotPacket * packet));
    gl_FragColor = vec4(color * light * ends * uOpacity, 1.0);
  }
`;

/**
 * Glowing ribbons along segments.
 * @param {{ segment: number[][], flow: number }[]} beams each flowing towards its end (1) or start (−1)
 * @param {Color} color
 * @param {object} style FENCE.beam with overrides
 */
export function beamMesh(beams, color, style) {
  const s = { ...FENCE.beam, ...style };
  const geometry = quadGeometry(beams.length, [
    ['aStart', 3, beams.flatMap(({ segment }) => segment[0])],
    ['aEnd', 3, beams.flatMap(({ segment }) => segment[1])],
    ['aFlow', 1, beams.map(({ flow }) => flow)],
  ]);
  const material = lightMaterial(beamVertex, beamFragment, {
    uColor: { value: color },
    uWidth: { value: s.width },
    uCore: { value: s.core },
    uGlow: { value: s.glow },
    uHalo: { value: s.halo },
    uSpacing: { value: s.spacing },
    uDensity: { value: s.density },
    uSpeed: { value: s.speed },
    uPacket: { value: s.packet },
    uTail: { value: s.tail },
    uRipple: { value: s.ripple },
    uWave: { value: s.wave },
    uRippleSpeed: { value: s.rippleSpeed },
    uFade: { value: s.fade },
    uOpacity: { value: s.opacity },
    uHot: { value: s.hot },
    uHotPacket: { value: s.hotPacket },
  });
  return lightMesh(geometry, material);
}

// ---- nodes

const nodeVertex = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 aCenter;
  uniform float uSize;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vec3 c = (modelMatrix * vec4(aCenter, 1.0)).xyz;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vUv = vec2(corner.x * 2.0 - 1.0, corner.y);
    vSeed = dot(aCenter, vec3(3.1, 7.7, 5.3));
    vec3 world = c + (right * vUv.x + up * vUv.y) * uSize * 0.5;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const nodeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uCore;
  uniform float uGlow;
  uniform float uThrob;
  uniform float uThrobSpeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    float r = length(vUv);
    float core = exp(-pow(r / uCore, 2.0));
    float halo = exp(-pow(r / 0.5, 2.0)) * max(0.0, 1.0 - r);
    float throb = 1.0 - uThrob + uThrob * (0.5 + 0.5 * sin(uTime * uThrobSpeed + vSeed));
    vec3 color = mix(uColor, vec3(1.0), core * 0.6);
    gl_FragColor = vec4(color * (core * uGlow + halo * 0.6) * throb, 1.0);
  }
`;

export function nodeMesh(points, color) {
  const s = FENCE.node;
  const geometry = quadGeometry(points.length, [['aCenter', 3, points.flat()]]);
  const material = lightMaterial(nodeVertex, nodeFragment, {
    uColor: { value: color },
    uSize: { value: s.size },
    uCore: { value: s.core },
    uGlow: { value: s.glow },
    uThrob: { value: s.throb },
    uThrobSpeed: { value: s.throbSpeed },
  });
  return lightMesh(geometry, material);
}

// ---- the view

/**
 * Beams of a layout with their flow: the lower beam of a level (at half
 * height) towards +x or +z, the upper one and the rail back.
 * @param {number[][][]} segments merged, each from its low end to its high end
 */
export function flowing(segments) {
  return segments.map((segment) => ({ segment, flow: segment[0][1] % 1 === 0.5 ? 1 : -1 }));
}

/**
 * Points where beams meet a post: each post's beam heights (half and full
 * height of every cell it stands in).
 * @param {number[][][]} posts merged vertical segments
 */
export function nodePoints(posts) {
  const points = [];
  for (const [from, to] of posts) {
    for (let y = from[1] + 0.5; y <= to[1] + 1e-9; y += 0.5) points.push([from[0], y, from[2]]);
  }
  return points;
}

/**
 * The crate stream's look (D198): a fence's streams of light with the top
 * beam like any other, since its top is no ledge.
 */
export const STREAM_STYLE = { rail: null };

/**
 * The fence cells of a room as streams of light.
 * @param {number[][]} cells [x, y, z]
 * @param {number|string} color edges (the room color by default, structure, D99)
 * @param {(x: number, y: number, z: number) => boolean} [solid] see fenceLayout()
 * @param {{ rail?: null }} [style] `rail: null`: the top beam looks like any
 *   other, no ledge (STREAM_STYLE)
 */
export function createFenceView(cells, color, solid, style = {}) {
  const { beams, rails, posts } = fenceLayout(cells, solid);
  const tint = new Color(color);
  const group = new Group();
  if (beams.length > 0) group.add(beamMesh(flowing(beams), tint, {}));
  if (rails.length > 0) group.add(beamMesh(flowing(rails), tint, style.rail === null ? {} : FENCE.rail));
  if (posts.length > 0) {
    group.add(beamMesh(posts.map((segment) => ({ segment, flow: 1 })), tint, FENCE.post));
    group.add(nodeMesh(nodePoints(posts), tint));
  }
  return group;
}
