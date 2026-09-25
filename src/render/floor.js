/**
 * Infinite grid floor fading into darkness.
 *
 * One large plane at y = 0 with a shader that draws unit grid lines. Lines
 * are brightest inside the room and fade out with distance from it; the
 * plane itself has the void color, so it melts into the background.
 */
import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
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
  uniform vec3 uVoid;
  uniform vec2 uRoomMin;
  uniform vec2 uRoomMax;
  uniform float uLineWidth;
  uniform float uFade;
  varying vec2 vPos;

  void main() {
    // Distance to the nearest grid line, in pixels.
    vec2 grid = abs(fract(vPos - 0.5) - 0.5) / fwidth(vPos);
    float halfWidth = uLineWidth * 0.5;
    float line = 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, min(grid.x, grid.y));

    // Brighter inside the room, fading out with distance outside it.
    vec2 outside = max(max(uRoomMin - vPos, vPos - uRoomMax), 0.0);
    float dist = length(outside);
    float strength = dist > 0.0 ? 0.22 : 0.4;
    strength *= 1.0 - smoothstep(0.0, uFade, dist);

    gl_FragColor = vec4(mix(uVoid, uColor, line * strength), 1.0);
  }
`;

/**
 * @param {number[]} size room size [x, y, z]
 * @param {number} [color] palette color of the grid lines
 */
export function createFloor([w, , d], color = PALETTE.cyan) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new Color(color) },
      uVoid: { value: new Color(PALETTE.void) },
      uRoomMin: { value: new Vector2(0, 0) },
      uRoomMax: { value: new Vector2(w, d) },
      uLineWidth: { value: LINE_WIDTH },
      uFade: { value: 10 },
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
