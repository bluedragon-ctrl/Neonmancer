/**
 * Warm motes (D179, a biome's `motes`): small soft dots of light rising
 * slowly through the room, each from its own spot on the floor, swaying a
 * little and fading in and out on the way up. Home Lattice's ambience.
 *
 * One Points object; every mote's path is worked out in the vertex shader
 * from its seeds and the time, so nothing moves on the CPU. Drawn additive,
 * depth-tested (blocks hide the motes behind them), writing no depth.
 * Their pixel size follows the render height like line widths.
 */
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Vector2 } from 'three';
import { scaleWithHeight } from './neon.js';

/** Tuning; brightness is a raw color (the bloom threshold is 0.12). */
export const MOTES = {
  /** Dot size in pixels at 1080p (the largest; each mote is 60–100% of it). */
  size: 5,
  /** Rise speed range (units a second). */
  speed: [0.22, 0.4],
  /** Sideways sway: amplitude (units) and how fast (radians a second). */
  sway: 0.12,
  swayRate: 0.8,
  /** Brightness at the middle of the rise. */
  brightness: 0.9,
  /** Mixed this much towards white: warm light, not paint. */
  whiten: 0.25,
  /** Most motes in a room, whatever its size. */
  max: 120,
};

const vertexShader = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform vec2 uSpeed;
  uniform float uSway;
  uniform float uSwayRate;
  uniform float uLineWidth;
  varying float vFade;
  void main() {
    float speed = mix(uSpeed.x, uSpeed.y, aSeed.x);
    // Seconds to rise from the floor to the top, and where along it now.
    float t = fract(uTime * speed / uHeight + aSeed.y);
    vec3 p = position;
    p.y = t * uHeight;
    float phase = aSeed.z * 6.2832;
    p.x += uSway * sin(uTime * uSwayRate + phase);
    p.z += uSway * cos(uTime * uSwayRate * 0.8 + phase);
    vFade = sin(3.14159 * t);
    gl_PointSize = uLineWidth * (0.6 + 0.4 * aSeed.w);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    // A soft round dot.
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float glow = 1.0 - smoothstep(0.3, 1.0, r);
    gl_FragColor = vec4(uColor * glow * vFade, 1.0);
  }
`;

/**
 * Where the motes start: a spot on the floor each and four seeds (speed,
 * phase, sway phase, size), all from `random` (pure).
 * @param {number[]} size room size [x, y, z]
 * @param {number} density motes per floor tile
 * @param {() => number} [random] 0..1
 * @returns {{ at: number[], seed: number[] }[]}
 */
export function moteLayout([w, , d], density, random = Math.random) {
  const count = Math.min(MOTES.max, Math.round(Math.max(0, density) * w * d));
  return Array.from({ length: count }, () => ({
    at: [random() * w, 0, random() * d],
    seed: [random(), random(), random(), random()],
  }));
}

/**
 * @param {number[]} size room size [x, y, z]
 * @param {number|string} color room color
 * @param {number} density motes per floor tile (biome look `motes`)
 * @returns {Points|null} with `userData.update(dt)`; null without motes
 */
export function createMotes(size, color, density) {
  const motes = moteLayout(size, density);
  if (motes.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(motes.flatMap((m) => m.at), 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(motes.flatMap((m) => m.seed), 4));
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: size[1] },
      uSpeed: { value: new Vector2(...MOTES.speed) },
      uSway: { value: MOTES.sway },
      uSwayRate: { value: MOTES.swayRate },
      uLineWidth: { value: MOTES.size },
      uColor: { value: new Color(color).lerp(new Color(0xffffff), MOTES.whiten).multiplyScalar(MOTES.brightness) },
    },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  scaleWithHeight(material, MOTES.size);
  const points = new Points(geometry, material);
  // They move in the shader: keep three.js from culling them by their start points.
  points.frustumCulled = false;
  points.userData.update = (dt) => {
    material.uniforms.uTime.value += dt;
  };
  return points;
}
