/**
 * Infinite grid floor fading into darkness.
 *
 * One large plane at y = 0 with a shader that draws unit grid lines. Lines
 * use the room color inside the room; outside they are dark gray (clearly
 * not part of the room) and fade out with distance from it; the
 * plane itself has the void color, so it melts into the background.
 * Hole tiles are cut out of the plane (a small mask texture), so the pit
 * below them shows through.
 */
import {
  Color,
  DataTexture,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  Vector2,
} from 'three';
import { PALETTE, scaleWithHeight } from './neon.js';

/** Floor plane size; far larger than anything the camera can see. */
const EXTENT = 400;

/** Grid line width in pixels at 1080p. */
const LINE_WIDTH = 1.5;

const vertexShader = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPos = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uOuterColor;
  uniform vec3 uVoid;
  uniform vec2 uRoomMin;
  uniform vec2 uRoomMax;
  uniform float uLineWidth;
  uniform float uFade;
  uniform sampler2D uHoles;
  varying vec2 vPos;

  void main() {
    vec2 outside = max(max(uRoomMin - vPos, vPos - uRoomMax), 0.0);
    float dist = length(outside);

    // Cut out hole tiles (one mask texel per floor tile).
    if (dist == 0.0) {
      vec2 tile = min(floor(vPos - uRoomMin), uRoomMax - uRoomMin - 1.0);
      if (texture2D(uHoles, (tile + 0.5) / (uRoomMax - uRoomMin)).r > 0.5) discard;
    }

    // Distance to the nearest grid line, in pixels.
    vec2 grid = abs(fract(vPos - 0.5) - 0.5) / fwidth(vPos);
    float halfWidth = uLineWidth * 0.5;
    float line = 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, min(grid.x, grid.y));

    // Room color inside the room; dim gray outside, fading with distance.
    vec3 color = dist > 0.0 ? uOuterColor : uColor * 0.4;
    float strength = 1.0 - smoothstep(0.0, uFade, dist);

    // The room floor is faintly tinted, so black pits stand out against it.
    vec3 base = dist > 0.0 ? uVoid : mix(uVoid, uColor, 0.025);
    gl_FragColor = vec4(mix(base, color, line * strength), 1.0);
  }
`;

/**
 * Mask texture with one texel per floor tile: 255 where there is a hole.
 * @param {number} w room width
 * @param {number} d room depth
 * @param {number[][]} holes hole tiles as [x, z]
 */
function holeMask(w, d, holes) {
  const data = new Uint8Array(w * d);
  for (const [x, z] of holes) data[z * w + x] = 255;
  const texture = new DataTexture(data, w, d, RedFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.unpackAlignment = 1; // rows are w bytes, not padded to 4
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {number[]} size room size [x, y, z]
 * @param {number|string} [color] color of the grid lines inside the room
 * @param {number[][]} [holes] hole tiles as [x, z]
 */
export function createFloor([w, , d], color = PALETTE.amber, holes = []) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new Color(color) },
      uOuterColor: { value: new Color(PALETTE.outerGrid) },
      uVoid: { value: new Color(PALETTE.void) },
      uRoomMin: { value: new Vector2(0, 0) },
      uRoomMax: { value: new Vector2(w, d) },
      uLineWidth: { value: LINE_WIDTH },
      uFade: { value: 5 },
      uHoles: { value: holeMask(w, d, holes) },
    },
    // Keep the floor behind edges and faces lying on y = 0.
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  scaleWithHeight(material, LINE_WIDTH);

  const floor = new Mesh(new PlaneGeometry(EXTENT, EXTENT), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, d / 2);
  return floor;
}
