/**
 * Views of moving things: they read the game state once per frame and
 * place their meshes at the interpolated position between the last two
 * ticks, so motion is smooth at any refresh rate.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { PLAYER } from '../entities/player.js';
import { PALETTE, shared } from './neon.js';
import { fadingDrops } from './hole-view.js';
import { HIT_FX, derezPixels, hitFlash, wizardLook } from './hit-fx.js';
import { lerpAngle, lerpPosition, shadowScale } from './interp.js';
import { createObjectView } from './room-view.js';
import { createWizard } from './wizard.js';

/** Shadow lift above the surface, so it never fights with the floor or block tops. */
const SHADOW_LIFT = 0.01;

const shadowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A glowing ring with a soft filled center, fading to nothing at the edge.
const shadowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float ring = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.8, 1.0, r));
    float fill = 0.12 * (1.0 - smoothstep(0.0, 0.8, r));
    gl_FragColor = vec4(uColor * (ring * 0.5 + fill) * uOpacity, 1.0);
  }
`;

/**
 * Glowing drop shadow directly under a body (CLAUDE.md §4): additive, so it
 * glows on dark surfaces; smaller and fainter the higher the body is.
 * @param {number|string} color
 */
export function createDropShadow(color) {
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 1 },
    },
    vertexShader: shadowVertex,
    fragmentShader: shadowFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(SHADOW_PLANE, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

/** Unit plane shared by every drop shadow. */
const SHADOW_PLANE = shared(new PlaneGeometry(1, 1));

/**
 * Show a drop shadow on the surface at height `ground` under a body whose
 * bottom is at `bottom`, or hide it when there is none (ground null).
 * @param {Mesh} shadow from createDropShadow()
 * @param {number} x center of the shadow
 * @param {number} z
 * @param {number} bottom height of the body's bottom
 * @param {number|null} ground
 * @param {number} diameter at the surface
 */
function placeShadow(shadow, x, z, bottom, ground, diameter) {
  shadow.visible = ground !== null;
  if (ground === null) return;
  const { scale, opacity } = shadowScale(bottom - ground);
  shadow.position.set(x, ground + SHADOW_LIFT, z);
  shadow.scale.set(diameter * scale, diameter * scale, 1);
  shadow.material.uniforms.uOpacity.value = opacity;
}

/**
 * The burst of glowing pixels a derezzing wizard leaves (see hit-fx.js):
 * small additive cubes in his colors, hidden unless he derezzes.
 */
export function createDerezPixels() {
  const geometry = new BoxGeometry(HIT_FX.pixelSize, HIT_FX.pixelSize, HIT_FX.pixelSize);
  const material = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new InstancedMesh(geometry, material, HIT_FX.pixels);
  const colors = [new Color(PALETTE.cyan), new Color(PALETTE.magenta)];
  for (let i = 0; i < HIT_FX.pixels; i++) mesh.setColorAt(i, colors[i % 2].clone().multiplyScalar(1.6));
  mesh.frustumCulled = false; // instances move far from the geometry's own bounds
  mesh.visible = false;
  return mesh;
}

const pixelMatrix = new Matrix4();

/**
 * Show the derez pixels around the feet center `pos`, or hide them when
 * there are none.
 * @param {InstancedMesh} mesh from createDerezPixels()
 * @param {ReturnType<typeof derezPixels>} pixels
 * @param {number[]} pos feet center
 */
export function placeDerezPixels(mesh, pixels, pos) {
  mesh.visible = pixels.length > 0;
  pixels.forEach(({ offset: [x, y, z], scale }, i) => {
    pixelMatrix.makeScale(scale, scale, scale).setPosition(pos[0] + x, pos[1] + y, pos[2] + z);
    mesh.setMatrixAt(i, pixelMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Set a wizard model's flash uniforms from hitFlash().
 * @param {import('three').Object3D} wizard from createWizard()
 * @param {{ amount: number, color: 'white'|'magenta' }} flash
 */
export function showHitFlash(wizard, { amount, color }) {
  const uniforms = wizard.userData.flash;
  uniforms.amount.value = amount;
  uniforms.color.value.set(color === 'white' ? 0xffffff : PALETTE.magenta);
}

export class PlayerView {
  /**
   * @param {import('../game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new Group();
    this.wizard = createWizard();
    this.shadow = createDropShadow(PALETTE.cyan);
    this.pixels = createDerezPixels();
    this.group.add(this.wizard, this.shadow, this.pixels);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const player = this.game.player;
    const pos = lerpPosition(player.prev, player.pos, alpha);

    this.wizard.position.set(pos[0], pos[1], pos[2]);
    this.wizard.rotation.y = lerpAngle(player.prevFacing, player.facing, alpha);
    // Blinking after a hit; derezzing when he dies out of a hole.
    const look = wizardLook(player, PLAYER.deathTicks);
    this.wizard.visible = look.visible;
    this.wizard.scale.set(...look.scale);
    showHitFlash(this.wizard, hitFlash(player));
    const derezzing = player.dead && player.deathCause !== 'hole';
    placeDerezPixels(this.pixels, derezzing ? derezPixels(PLAYER.deathTicks - player.deathTimer + alpha) : [], pos);

    const ground = player.dead ? null : this.game.shadowHeight(pos, player.size);
    placeShadow(this.shadow, pos[0], pos[2], pos[1], ground, player.size[0] * 1.5);
  }
}

/**
 * Nothing of an object is drawn below the floor: one sinking into a hole
 * disappears into the pit, and a plugged hole shows only the object's top,
 * flush with the floor, plus short corner lines fading into the pit like
 * the pit's own. (A hair below 0, so edges lying on the floor stay.)
 */
const FLOOR_CLIP = [new Plane(new Vector3(0, 1, 0), 0.01)];

export class PushableView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pushable.js').Pushable} pushable
   */
  constructor(game, pushable) {
    this.game = game;
    this.pushable = pushable;
    this.group = new Group();
    // The object view is built at the origin and moved as a whole.
    this.block = createObjectView({ ...pushable.object, at: [0, 0, 0] });
    this.block.traverse((node) => {
      for (const material of [node.material ?? []].flat()) material.clippingPlanes = FLOOR_CLIP;
    });
    this.shadow = createDropShadow(pushable.object.color);
    /** Made once the object plugs a hole (most never do): its vertical edges fade into the pit. */
    this.plugDrops = null;
    this.group.add(this.block, this.shadow);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { pushable } = this;
    const pos = lerpPosition(pushable.prev, pushable.pos, alpha);
    this.block.position.set(pos[0], pos[1], pos[2]);
    if (pushable.state === 'plugged' && !this.plugDrops) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
      this.plugDrops = fadingDrops(corners, 1, pushable.object.color, 1, 2.5);
      this.plugDrops.position.set(...pushable.pos); // a plugged object never moves again
      this.group.add(this.plugDrops);
    }

    // Drop shadow only while falling (CLAUDE.md §4).
    const ground = pushable.state === 'fall' ? this.game.objectShadowHeight(pushable, pos) : null;
    placeShadow(this.shadow, pos[0] + 0.5, pos[2] + 0.5, pos[1], ground, 1.3);
  }
}
