/**
 * The exit effect of a biome with `starExits` (D183, the Outer Buffer):
 * instead of dashes and arrows, small stars drift out through the exit,
 * fading in and out, each twinkling. One Points object with its own
 * shader; the stars' sizes follow the render height.
 *
 * A back doorway's stars drift from the doorway into the dark tunnel; a
 * front exit's from a little inside the room out over its edge.
 */
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial } from 'three';
import { isBackSide, sideAxes } from '../data/room-data.js';
import { scaleWithHeight } from './neon.js';

/** Tuning values (units, seconds, pixels at 1080p). */
export const STAR_EXIT = {
  /** Stars a unit of the exit's width. */
  density: 10,
  /** Size in pixels, and brightness (raw color; the bloom threshold is 0.12). */
  size: 7,
  brightness: 3,
  /** Share the stars are mixed towards white: stars are paler than the exit's color. */
  white: 0.5,
  /** Seconds for a star to drift its whole way, and how far it goes. */
  period: 3.2,
  travel: 1.1,
  /** Front exits: how far inside the room a star starts (it drifts that and `travel` more). */
  inside: 0.5,
  /** Front exits: how high above the floor the stars float. */
  frontHeight: 0.6,
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uLineWidth;
  uniform float uPeriod;
  uniform vec3 uDir;
  uniform float uTravel;
  uniform float uStart;
  attribute vec2 aSeed;
  varying float vAlpha;
  void main() {
    float f = fract(uTime / uPeriod + aSeed.x);
    float along = uStart + f * uTravel;
    vec3 p = position + uDir * along;
    // Fades in fast, then out over the rest of its way; twinkles on top.
    float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + 3.0 * aSeed.y) + aSeed.y * 40.0);
    vAlpha = smoothstep(0.0, 0.12, f) * (1.0 - f) * twinkle;
    gl_PointSize = uLineWidth * (0.6 + 0.8 * aSeed.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.0, 1.0, d);
    gl_FragColor = vec4(uColor * core * core * vAlpha, 1.0);
  }
`;

/** A star's seeds: where in its drift it is, and its size and twinkle. */
function seeded(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const hash = Math.abs(Math.sin(i * 12.9898 + 1.7) * 43758.5453) % 1;
    out.push((i * 0.754877) % 1, hash);
  }
  return out;
}

/**
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit defaults applied
 * @param {number[]} size room size [x, y, z]
 * @param {number|string} color
 * @returns {Points} with `userData.update(dt)`
 */
export function createExitStars(exit, size, color) {
  const { cross, along } = sideAxes(exit.side);
  const back = isBackSide(exit.side);
  const count = Math.max(4, Math.round(exit.width * STAR_EXIT.density));
  const seeds = seeded(count);
  const positions = [];
  for (let i = 0; i < count; i++) {
    // Spread over the doorway (back) or the exit tiles (front): evenly along, scattered across and up.
    const a = exit.at + (((i * 0.618034) % 1) * exit.width);
    const h = back ? exit.height : STAR_EXIT.frontHeight;
    const y = exit.y + (((i * 0.381966 + 0.3) % 1) * h);
    const p = [0, y, 0];
    p[along] = a;
    p[cross] = back ? 0 : size[cross];
    positions.push(...p);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 2));

  const dir = [0, 0, 0];
  dir[cross] = back ? -1 : 1;
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uLineWidth: { value: STAR_EXIT.size },
      uPeriod: { value: STAR_EXIT.period },
      uDir: { value: dir },
      uTravel: { value: STAR_EXIT.travel + (back ? 0 : STAR_EXIT.inside) },
      uStart: { value: back ? 0 : -STAR_EXIT.inside },
      uColor: { value: new Color(color).lerp(new Color(0xffffff), STAR_EXIT.white).multiplyScalar(STAR_EXIT.brightness) },
    },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  scaleWithHeight(material, STAR_EXIT.size);
  const stars = new Points(geometry, material);
  stars.frustumCulled = false;
  stars.renderOrder = 3;
  stars.userData.update = (dt) => {
    material.uniforms.uTime.value += dt;
  };
  return stars;
}
