/**
 * The glow of the back walls' glass panels (D179, D180): a soft light in
 * the room color on the room side of each pane, brightest at its frame,
 * breathing slowly, each panel on its own rhythm. Now and then one panel
 * stutters for a moment (a quick dim-bright-dim, like a faulty display)
 * and settles; when, from a random seed per panel.
 *
 * One instanced quad per panel, additive, depth-tested, writing no depth;
 * everything moves in the shader, so a frame only advances the time.
 */
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';

/** Tuning; brightness values are raw colors (the bloom threshold is 0.12). */
export const PANEL_FX = {
  /** Glow at the frame; the middle of the pane gets `fill` of it. */
  glow: 0.35,
  fill: 0.3,
  /** How far in from the frame the glow fades (share of the pane). */
  edge: 0.35,
  /** Breathing: share of the glow it swings by, and its speed (radians a second). */
  breathe: 0.3,
  breatheRate: 1.1,
  /** A flicker every `every` seconds per panel (each its own, in this range), lasting `time` s. */
  every: [5, 15],
  time: 0.35,
  /** Flicker steps a second, and how dark and how bright a step gets (share of the glow). */
  steps: 24,
  low: 0.15,
  high: 2.2,
  /** Distance of the glow in front of the pane, into the room (no fighting with the glass). */
  lift: 0.004,
};

const vertexShader = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFill;
  uniform float uEdge;
  uniform float uBreathe;
  uniform float uBreatheRate;
  uniform vec2 uEvery;
  uniform float uFlickerTime;
  uniform float uSteps;
  uniform float uLow;
  uniform float uHigh;
  varying vec2 vUv;
  varying float vSeed;

  float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }

  void main() {
    // Brightest at the frame, fading towards the middle.
    float d = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edge = 1.0 - smoothstep(0.0, uEdge, d);
    float shape = uFill + (1.0 - uFill) * edge * edge;

    // Slow breathing, each panel at its own speed and phase.
    float breathe = 1.0 - uBreathe * (0.5 + 0.5 * sin(uTime * uBreatheRate * (0.7 + 0.6 * vSeed) + vSeed * 6.2832));

    // Now and then a short stutter: random steps between dark and bright.
    float every = mix(uEvery.x, uEvery.y, hash(vSeed * 91.7));
    float t = uTime + vSeed * every;
    float cycle = floor(t / every);
    float into = t - cycle * every;
    float flicker = 1.0;
    if (into < uFlickerTime) {
      float n = floor(into * uSteps);
      flicker = hash(n + cycle * 13.0 + vSeed * 57.0) < 0.5 ? uLow : uHigh;
    }

    gl_FragColor = vec4(uColor * shape * breathe * flicker, 1.0);
  }
`;

/**
 * Where each panel's glow lies (pure): the middle of its wall cell, just
 * in front of the wall, and which way it faces (+x for the x = 0 wall,
 * +z for the z = 0 wall).
 * @param {{ side: string, u: number, v: number }[]} panels
 * @returns {{ center: number[], facing: string }[]}
 */
export function panelGlowPlacement(panels) {
  return panels.map(({ side, u, v }) =>
    side === '-x'
      ? { center: [PANEL_FX.lift, v + 0.5, u + 0.5], facing: '+x' }
      : { center: [u + 0.5, v + 0.5, PANEL_FX.lift], facing: '+z' },
  );
}

/**
 * @param {{ side: string, u: number, v: number }[]} panels glass panels (walls.js pickPanels())
 * @param {number|string} color room color
 * @param {() => number} [random] 0..1, a seed per panel
 * @returns {InstancedMesh} with `userData.update(dt)`
 */
export function createPanelGlow(panels, color, random = Math.random) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new Color(color).multiplyScalar(PANEL_FX.glow) },
      uTime: { value: 0 },
      uFill: { value: PANEL_FX.fill },
      uEdge: { value: PANEL_FX.edge },
      uBreathe: { value: PANEL_FX.breathe },
      uBreatheRate: { value: PANEL_FX.breatheRate },
      uEvery: { value: new Vector2(...PANEL_FX.every) },
      uFlickerTime: { value: PANEL_FX.time },
      uSteps: { value: PANEL_FX.steps },
      uLow: { value: PANEL_FX.low },
      uHigh: { value: PANEL_FX.high },
    },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  // A unit quad facing +z, with a seed per panel.
  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(panels.map(() => random())), 1));
  const mesh = new InstancedMesh(geometry, material, panels.length);
  const matrix = new Matrix4();
  const turn = new Matrix4().makeRotationY(Math.PI / 2);
  panelGlowPlacement(panels).forEach(({ center, facing }, i) => {
    matrix.identity();
    if (facing === '+x') matrix.multiply(turn);
    matrix.setPosition(...center);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.computeBoundingSphere();
  mesh.renderOrder = 1;
  mesh.userData.update = (dt) => {
    material.uniforms.uTime.value += dt;
  };
  return mesh;
}
