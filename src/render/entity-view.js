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
import { BUG, bounceSquash, bugPose, createBug, eyeMood, popPixels, setEyeMood } from './bug.js';
import { COLLAPSE_FX, COLLAPSE_PIXELS, collapseLook, collapsePixels } from './collapse-fx.js';
import { PALETTE, lineMaterial, neonLines, shared } from './neon.js';
import { fadingDrops } from './hole-view.js';
import { HIT_FX, derezPixels, hitFlash, wizardLook } from './hit-fx.js';
import { lerpAngle, lerpPosition, shadowScale } from './interp.js';
import { railSegments } from './rails.js';
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
 * A burst of glowing pixels: small additive cubes, taking turns in the
 * given colors, hidden until placePixels() shows some.
 * @param {number} count
 * @param {number} size edge of one cube
 * @param {(number|string)[]} colors
 */
export function createPixelBurst(count, size, colors) {
  const geometry = new BoxGeometry(size, size, size);
  const material = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new InstancedMesh(geometry, material, count);
  const tints = colors.map((color) => new Color(color).multiplyScalar(1.6));
  for (let i = 0; i < count; i++) mesh.setColorAt(i, tints[i % tints.length]);
  mesh.frustumCulled = false; // instances move far from the geometry's own bounds
  mesh.visible = false;
  return mesh;
}

/** The burst of pixels a derezzing wizard leaves (see hit-fx.js), in his colors. */
export function createDerezPixels() {
  return createPixelBurst(HIT_FX.pixels, HIT_FX.pixelSize, [PALETTE.cyan, PALETTE.magenta]);
}

const pixelMatrix = new Matrix4();

/**
 * Show a pixel burst around `pos`, or hide it when there are no pixels.
 * @param {InstancedMesh} mesh from createPixelBurst()
 * @param {{ offset: number[], scale: number }[]} pixels offsets from `pos`
 *   (e.g. from derezPixels() or collapsePixels())
 * @param {number[]} pos
 */
export function placePixels(mesh, pixels, pos) {
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
    placePixels(this.pixels, derezzing ? derezPixels(PLAYER.deathTicks - player.deathTimer + alpha) : [], pos);

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

export class PlatformView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/platform.js').Platform} platform
   */
  constructor(game, platform) {
    this.platform = platform;
    this.group = new Group();
    // The block is built at the origin and moved as a whole; the guide line
    // stays in room coordinates.
    this.block = createObjectView({ ...platform.object, at: [0, 0, 0] });
    this.rails = createRails(platform.track, platform.object.color);
    this.group.add(this.rails, this.block);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { platform } = this;
    const pos = lerpPosition(platform.prev, platform.pos, alpha);
    this.block.position.set(pos[0], pos[1], pos[2]);
  }
}

export class CollapsingView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/collapsing.js').Collapsing} block (or anything
   *   with its `pos`, `state`, `timer`, `regrown` and `object`, as in the showcase)
   */
  constructor(game, block) {
    this.block = block;
    // The object view is built centered on the origin, so it can shrink
    // around its center while it grows back.
    this.view = createObjectView({ ...block.object, at: [0, 0, 0] });
    this.view.position.set(-0.5, -0.5, -0.5);
    this.center = new Group().add(this.view);
    this.pixels = createPixelBurst(COLLAPSE_PIXELS, COLLAPSE_FX.pixelSize, [block.object.color]);
    // Pixels falling into a pit disappear at the floor, like objects.
    this.pixels.material.clippingPlanes = FLOOR_CLIP;
    this.group = new Group().add(this.center, this.pixels);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { block } = this;
    const [x, y, z] = block.pos;
    const look = collapseLook(block, alpha);
    this.center.visible = look.visible;
    this.center.position.set(x + 0.5 + look.offset[0], y + 0.5 + look.offset[1], z + 0.5 + look.offset[2]);
    this.center.scale.setScalar(look.scale);
    placePixels(this.pixels, block.state === 'gone' ? collapsePixels(block.timer + alpha) : [], block.pos);
  }
}

/**
 * The glowing guide line along a platform's path (render/rails.js), dimmer than its
 * edges so the platform itself stands out.
 * @param {Parameters<typeof railSegments>[0]} track
 * @param {number|string} color
 */
export function createRails(track, color) {
  return neonLines(railSegments(track), lineMaterial({ color, width: 1.5, brightness: 0.55 }));
}

/** The model of each enemy type (defs.json "enemies"), by type id. */
export const ENEMY_MODELS = { bug: createBug };

export class EnemyView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/enemy.js').Enemy} enemy
   */
  constructor(game, enemy) {
    this.game = game;
    this.enemy = enemy;
    const { color, bounce } = enemy.data;
    this.model = (ENEMY_MODELS[enemy.type] ?? createBug)(color, { bounce });
    this.shadow = createDropShadow(color);
    this.pixels = createPixelBurst(BUG.pop.pixels, BUG.pop.pixelSize, [color, 0xffffff]);
    this.mood = null;
    this.group = new Group().add(this.model, this.shadow, this.pixels);
    /** Angle the model faces now; it turns towards the enemy's facing. */
    this.angle = enemy.facing;
    /** Seconds, for the hop while standing. */
    this.time = 0;
  }

  /**
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(alpha, dt) {
    const { enemy } = this;
    const pos = lerpPosition(enemy.prev, enemy.pos, alpha);
    const feet = [pos[0] + 0.5, pos[1], pos[2] + 0.5];
    const dead = enemy.state === 'dead';
    this.model.visible = !dead;
    // Popped in a pit: the burst comes out at the floor.
    placePixels(this.pixels, dead ? popPixels(enemy.timer + alpha) : [], [feet[0], Math.max(feet[1], 0), feet[2]]);
    this.shadow.visible = !dead;
    if (dead) return;

    this.time += dt;
    this.angle += wrapAngle(enemy.facing - this.angle) * Math.min(1, dt * BUG.turnRate);
    this.model.position.set(...feet);
    this.model.rotation.y = this.angle;

    // One hop per cell while walking (the distance from the cell it left), small ones while standing.
    const { from } = enemy;
    const walked = enemy.state === 'walk' && from ? Math.abs(pos[0] - from[0]) + Math.abs(pos[2] - from[2]) : null;
    const pose =
      enemy.state === 'fall' ? { lift: 0, scale: [0.92, 1.15, 0.92] } : walked !== null ? bugPose(walked) : bugPose(this.time * BUG.idleRate, BUG.idleLift);
    const squash = bounceSquash(enemy.bounced === null ? null : enemy.bounced + alpha);
    const body = this.model.userData.body;
    body.position.y = pose.lift;
    body.scale.set(pose.scale[0] * (1 + squash * 0.5), pose.scale[1] * (1 - squash), pose.scale[2] * (1 + squash * 0.5));

    const mood = eyeMood(enemy);
    if (mood !== this.mood) setEyeMood(this.model, (this.mood = mood));

    const ground = this.game.shadowHeight(feet, enemy.size);
    placeShadow(this.shadow, feet[0], feet[2], pos[1], ground, 1.1);
  }
}

/** An angle difference brought into −π..π, so turning takes the short way round. */
function wrapAngle(a) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}
