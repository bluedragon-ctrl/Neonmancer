/**
 * Black mist (D99): a void block as a cube of dark fog instead
 * of a solid block. Black is a pit (the color rules): the mist hides the
 * floor and wall grid behind it, so it reads as a hole in the world, like
 * a floor hole. Faint gray wisps boil slowly inside it, sinking; a thin
 * outer shell of patchy mist softens its outline; thin dim edges keep its
 * exact extent readable (they never animate).
 *
 * The noise runs in room coordinates, so a patch of void blocks reads as
 * one cloud. Time comes from HOLO_TIME (advanced once per frame).
 */
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, NormalBlending, ShaderMaterial } from 'three';
import { blockEdges } from './edges.js';
import { UNIT_BOX } from './geometry.js';
import { HOLO_TIME } from './holo.js';
import { lineMaterial, neonLines, shared } from './neon.js';

/** Tuning; noise scale per unit, rates per second, brightness as raw colors. */
export const MIST = {
  /** Noise cells per unit, and how fast the mist sinks (units per second). */
  scale: 2.2,
  sink: 0.12,
  /** Wisps: brightness and how much of the fog they cover (0 = none, 1 = all). */
  wisp: 0.14,
  cover: 0,
  /** Outer shell: how far it reaches past the block (units) and how dark it gets. */
  shell: 0.07,
  shellOpacity: 0.75,
  /** Edges: a thin, dim frame. */
  edgeWidth: 1.2,
  edgeBrightness: 0.45,
};

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 local = instanceMatrix * vec4(position, 1.0);
    vPos = local.xyz;
    vNormal = normal;
    vec3 camZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vViewDir = transpose(mat3(modelMatrix)) * -camZ;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uSink;
  uniform float uWisp;
  uniform float uCover;
  uniform float uShellOpacity;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }
  float faceShade() {
    if (vNormal.y > 0.5) return 1.0;
    if (abs(vNormal.x) > 0.5) return 0.7;
    return 0.5;
  }
  void main() {
    // Sinking, slowly turning fog: sample the noise higher up as time goes on.
    vec3 drift = vec3(0.3 * uTime * uSink, uTime * uSink, 0.0);
  #ifdef SHELL
    // Patchy dark fog just outside the block: it darkens what's behind.
    float fog = smoothstep(0.35, 0.75, fbm((vPos + drift) * uScale));
    gl_FragColor = vec4(vec3(0.0), fog * uShellOpacity);
  #else
    // Thin wisps (ridges of the noise) on layers behind the face, fading
    // with depth, so the fog has volume.
    vec3 ray = normalize(vViewDir);
    float perDepth = 1.0 / max(dot(ray, -vNormal), 0.05);
    float light = 0.0;
    for (int i = 0; i < 4; i++) {
      float depth = 0.05 + float(i) * 0.22;
      vec3 p = vPos + ray * depth * perDepth;
      float n = fbm((p + drift) * uScale + float(i) * 5.0);
      float ridge = 1.0 - abs(2.0 * n - 1.0);
      light += pow(ridge, mix(24.0, 6.0, uCover)) * (1.0 - depth);
    }
    gl_FragColor = vec4(uColor * light * uWisp * faceShade(), 1.0);
  #endif
  }
`;

function mistMaterial(color, shell) {
  const fx = MIST;
  return new ShaderMaterial({
    uniforms: {
      uTime: HOLO_TIME,
      uColor: { value: new Color(color) },
      uScale: { value: fx.scale },
      uSink: { value: fx.sink },
      uWisp: { value: fx.wisp },
      uCover: { value: fx.cover },
      uShellOpacity: { value: fx.shellOpacity },
    },
    vertexShader,
    fragmentShader,
    ...(shell
      ? { defines: { SHELL: '' }, transparent: true, depthWrite: false, blending: NormalBlending }
      : { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  });
}

/** The shell: a cube a little larger than the block, round it. */
const SHELL_BOX = shared(new BoxGeometry(1 + 2 * MIST.shell, 1 + 2 * MIST.shell, 1 + 2 * MIST.shell).translate(0.5, 0.5, 0.5));

/**
 * Void blocks as black mist: instanced fog cubes, their soft shells and a
 * dim frame.
 * @param {number[][]} cells [x, y, z] cells
 * @param {number|string} color the wisps' color (defs.json, a neutral gray)
 * @param {Set<string>} [claimed] unit edges drawn by a more dangerous type, left out (edges.js)
 */
export function createMistView(cells, color, claimed = null) {
  const matrix = new Matrix4();
  const core = new InstancedMesh(UNIT_BOX, mistMaterial(color, false), cells.length);
  const shell = new InstancedMesh(SHELL_BOX, mistMaterial(color, true), cells.length);
  cells.forEach(([x, y, z], i) => {
    core.setMatrixAt(i, matrix.makeTranslation(x, y, z));
    shell.setMatrixAt(i, matrix.makeTranslation(x - MIST.shell, y - MIST.shell, z - MIST.shell));
  });
  const edges = neonLines(blockEdges(cells, claimed), lineMaterial({ color, width: MIST.edgeWidth, brightness: MIST.edgeBrightness }));
  edges.renderOrder = 3;
  const group = new Group().add(core, shell, edges);
  group.userData.faces = core.material;
  return group;
}
