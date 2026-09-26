/**
 * Asset showcase: every character and object look side by side, turning
 * slowly on a floor grid, rendered with the game's own renderer (neon
 * lines, bloom, drop shadows). For reviewing looks without playing.
 *
 * Open /tools/showcase.html in the dev server (or on the deployed site).
 * Space pauses the turning; ←/→ turn by hand. `?asset=wizard` shows one
 * asset close up, `?asset=wizard,crate` a few side by side.
 * New assets (monsters, pickups) are added to ASSETS below. Assets can take
 * more room (`span`) and animate (`update(dt, time)`, called every frame).
 */
import { Group, Vector3 } from 'three';
import defs from '../data/defs.json';
import { OBJECT_STYLE_DEFAULTS, withExitDefaults } from '../src/data/room-data.js';
import { VIEW_HEIGHT, frameRoom } from '../src/render/camera.js';
import { PLAYER } from '../src/entities/player.js';
import { COLLAPSING } from '../src/entities/collapsing.js';
import {
  CollapsingView,
  createDerezPixels,
  createPixelBurst,
  createDropShadow,
  createRails,
  placePixels,
  showHitFlash,
} from '../src/render/entity-view.js';
import { advance, buildTrack, positionOf, startState } from '../src/world/path.js';
import { derezPixels, hitFlash, wizardLook } from '../src/render/hit-fx.js';
import { createFloor } from '../src/render/floor.js';
import { PALETTE } from '../src/render/neon.js';
import { Renderer } from '../src/render/renderer.js';
import { ASPECT } from '../src/render/viewport.js';
import { createActiveBlockView, flareHazard } from '../src/render/block-fx.js';
import { createObjectView, createRoomView } from '../src/render/room-view.js';
import { ExitView } from '../src/render/exit-view.js';
import { HOLO_TIME } from '../src/render/holo.js';
import { createWizard } from '../src/render/wizard.js';
import { BUG, bounceSquash, bugPose, createBug, popPixels, setEyeMood } from '../src/render/bug.js';

/** Units between two assets (the default span of an asset). */
const SPACING = 3;
/** Turning speed in radians per second. */
const SPIN = 0.6;

/**
 * Showcased assets: a label and a function building the model centered on
 * the origin, standing on y = 0.
 */
const ALL_ASSETS = [
  { label: 'wizard', build: () => createWizard(), shadow: PALETTE.cyan },
  { label: 'wizard-hit', build: buildWizardHit, shadow: PALETTE.cyan },
  // Every object type from defs.json, in its own style.
  ...Object.entries(defs.objects).map(([type, props]) => ({
    label: type,
    build: () => {
      const view = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...props, at: [0, 0, 0] });
      view.position.set(-0.5, 0, -0.5);
      return new Group().add(view);
    },
  })),
  // Animated looks of the damaging block types (block-fx.js); the hazard
  // flares every 2 s as if it just hurt the wizard.
  { label: 'block-hazard', build: () => buildActiveBlock('hazard') },
  { label: 'block-void', build: () => buildActiveBlock('void') },
  { label: 'blocks-in-room', span: 5.5, build: buildBlocksInRoom },
  { label: 'exits', span: 5.5, build: buildExits },
  { label: 'platforms', span: 5.5, build: buildPlatforms },
  { label: 'collapsing-cycle', span: 4.5, build: buildCollapsingCycle },
  // Bugs (D48): walking hops in each mood, one being bounced on, a pop.
  { label: 'bug', group: 'bugs', build: () => buildBug('hostile') },
  { label: 'bug-provoked', group: 'bugs', build: () => buildBug('provoked') },
  { label: 'bug-peaceful', group: 'bugs', build: () => buildBug('peaceful') },
  { label: 'bug-bounce', group: 'bugs', build: () => buildBug('hostile', { bounced: true }) },
  { label: 'bug-pop', group: 'bugs', build: buildBugPop },
];

/**
 * A bug in a mood, hopping as it walks (3 cells per second); `bounced`:
 * it stands still and the wizard bounces off it every 1.2 s instead.
 * @param {'hostile'|'provoked'|'peaceful'} mood
 */
function buildBug(mood, { bounced = false } = {}) {
  const { color, speed } = defs.enemies.bug;
  const bug = createBug(color);
  setEyeMood(bug, mood);
  const asset = new Group().add(bug);
  asset.userData.update = (dt, time) => {
    const { body } = bug.userData;
    const pose = bounced ? bugPose(time * BUG.idleRate, BUG.idleLift) : bugPose(time * speed);
    const squash = bounced ? bounceSquash(((time % 1.2) / 1.2) * 72) : 0;
    body.position.y = pose.lift;
    body.scale.set(pose.scale[0] * (1 + squash * 0.5), pose.scale[1] * (1 - squash), pose.scale[2] * (1 + squash * 0.5));
  };
  return asset;
}

/** A bug popping into pixels, in a loop. */
function buildBugPop() {
  const { color } = defs.enemies.bug;
  const bug = createBug(color);
  const pixels = createPixelBurst(BUG.pop.pixels, BUG.pop.pixelSize, [color, 0xffffff]);
  const asset = new Group().add(bug, pixels);
  const loop = 90;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const popped = tick >= 40;
    bug.visible = !popped;
    placePixels(pixels, popped ? popPixels(tick - 40) : [], [0, 0, 0]);
  };
  return asset;
}

/**
 * The wizard getting hurt, in a loop: hit (a flash, then blinking while invulnerable),
 * a pause, then losing his last point (derez into pixels), then back.
 */
function buildWizardHit() {
  const wizard = createWizard();
  const pixels = createDerezPixels();
  const asset = new Group().add(wizard, pixels);
  const hitTicks = PLAYER.invulnerableTicks + 30;
  const loop = hitTicks + PLAYER.deathTicks + 30;
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    const derezTick = tick - hitTicks;
    const dead = derezTick >= 0 && derezTick < PLAYER.deathTicks;
    const player = {
      invulnerable: Math.max(0, PLAYER.invulnerableTicks - Math.floor(tick)),
      dead,
      deathCause: dead ? 'damage' : null,
      deathTimer: dead ? PLAYER.deathTicks - Math.floor(derezTick) : 0,
    };
    const look = wizardLook(player, PLAYER.deathTicks);
    wizard.visible = look.visible;
    wizard.scale.set(...look.scale);
    showHitFlash(wizard, hitFlash(player));
    placePixels(pixels, dead ? derezPixels(derezTick) : [], [0, 0, 0]);
  };
  return asset;
}

/** One block of a damaging type in its animated look. */
function buildActiveBlock(type) {
  const view = createActiveBlockView([[0, 0, 0]], type, defs.blocks[type].color);
  view.position.set(-0.5, 0, -0.5);
  const asset = new Group().add(view);
  if (type === 'hazard') {
    let time = 0;
    asset.userData.update = (dt) => {
      time = (time + dt) % 2;
      flareHazard(view.userData.faces, [0, 0, 0], time);
    };
  }
  return asset;
}

/**
 * The animated looks in context: a 4×4 room corner with plain blocks, a
 * hazard wall and a void patch crossed by a plain path.
 */
function buildBlocksInRoom() {
  const size = [4, 3, 4];
  const room = new Group().add(
    createRoomView({ size, cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [2, 0, 2], [2, 0, 3], [3, 0, 3]], color: PALETTE.amber }),
    createActiveBlockView([[0, 0, 2], [0, 0, 3], [1, 0, 3]], 'hazard', defs.blocks.hazard.color),
    createActiveBlockView([[2, 0, 1], [3, 0, 1], [3, 0, 2], [2, 0, 0]], 'void', defs.blocks.void.color),
  );
  room.position.set(-2, 0, -2);
  return new Group().add(room);
}

/**
 * Moving platforms on their guide lines in a 4×4 room corner: one gliding round
 * an L-shaped ping-pong path on the floor, a lift going up to a ledge.
 */
function buildPlatforms() {
  const size = [4, 3, 4];
  const color = defs.objects.platform.color;
  const style = { ...OBJECT_STYLE_DEFAULTS, ...defs.objects.platform, at: [0, 0, 0] };
  const paths = [
    buildTrack([0, 0, 1], { points: [[2, 0, 1], [2, 0, 3]], pause: 0.6 }),
    buildTrack([3, 0, 0], { points: [[3, 1, 0]], speed: 1.2, pause: 0.8 }),
  ];
  const room = new Group().add(createRoomView({ size, cells: [[2, 0, 0], [2, 1, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0], [0, 1, 0]], color: PALETTE.amber }));
  const movers = paths.map((track) => {
    const block = createObjectView(style);
    room.add(createRails(track, color), block);
    return { track, block, state: startState() };
  });
  room.position.set(-2, 0, -2);
  const asset = new Group().add(room);
  let carry = 0;
  asset.userData.update = (dt) => {
    // Step in whole ticks, like the game.
    for (carry += dt * 60; carry >= 1; carry--) {
      for (const mover of movers) mover.state = advance(mover.track, mover.state, mover.track.speed / 60);
    }
    for (const { track, block, state } of movers) block.position.set(...positionOf(track, state));
  };
  return asset;
}

/**
 * A row of three collapsing blocks going through their states in a loop,
 * one after the other like a bridge giving way under a runner: standing
 * still, shaking, breaking into pixels, and after a while growing back.
 */
function buildCollapsingCycle() {
  const object = { ...OBJECT_STYLE_DEFAULTS, ...defs.objects.collapsing };
  const solidTicks = 40;
  const goneTicks = 60;
  const loop = solidTicks + COLLAPSING.shakeTicks + goneTicks;
  const blocks = [0, 1, 2].map((i) => ({ object, pos: [i - 1.5, 0, -0.5], state: 'solid', timer: 0, regrown: false }));
  const views = blocks.map((block) => new CollapsingView(null, block));
  const asset = new Group().add(...views.map((view) => view.group));
  let tick = 0;
  asset.userData.update = (dt) => {
    tick = (tick + dt * 60) % loop;
    blocks.forEach((block, i) => {
      // Each block starts shaking 12 ticks after the one before.
      const t = (tick - i * 12 + loop) % loop;
      const whole = Math.floor(t);
      // Solid from the start of the loop: it just grew back.
      if (whole < solidTicks) Object.assign(block, { state: 'solid', timer: whole, regrown: true });
      else if (whole < solidTicks + COLLAPSING.shakeTicks) Object.assign(block, { state: 'shake', timer: whole - solidTicks });
      else Object.assign(block, { state: 'gone', timer: whole - solidTicks - COLLAPSING.shakeTicks });
    });
    for (const view of views) view.sync(0);
  };
  return asset;
}

/**
 * A 3×3 room corner with a back doorway leading to a magenta room and a
 * front exit leading to a cyan one.
 */
function buildExits() {
  const size = [3, 3, 3];
  const exits = [
    withExitDefaults({ id: 'back', side: '-z', at: 0 }),
    withExitDefaults({ id: 'front', side: '+x', at: 1 }),
  ];
  const views = [new ExitView(exits[0], size, PALETTE.magenta), new ExitView(exits[1], size, PALETTE.cyan)];
  const room = new Group().add(createRoomView({ size, cells: [], exits, color: PALETTE.amber }), ...views.map((v) => v.group));
  room.position.set(-1.5, 0, -1.5);
  const asset = new Group().add(room);
  asset.userData.update = (dt) => {
    for (const view of views) view.update(dt);
  };
  return asset;
}

const only = new URLSearchParams(location.search).get('asset');
const ASSETS = ALL_ASSETS.filter(({ label, group }) => !only || only.split(',').some((name) => name === label || name === group));

const renderer = new Renderer(document.getElementById('app'));
// Assets stand in a row that runs left to right on screen (world +x −z),
// through the middle of a square floor, zoomed so the row fills the view.
const spans = ASSETS.map(({ span = SPACING }) => span);
const total = spans.reduce((sum, span) => sum + span, 0);
const side = Math.ceil(total / Math.SQRT2) + 2;
// Height 2: the view centers on the middle of the assets, not their feet.
const size = [side, 2, side];
renderer.scene.add(createFloor(size, PALETTE.amber));
frameRoom(renderer.camera, size);
renderer.camera.zoom = Math.min(6, (VIEW_HEIGHT * ASPECT) / (total + SPACING));
renderer.camera.updateProjectionMatrix();

const turntables = ASSETS.map(({ label, build, shadow }, i) => {
  const turntable = new Group();
  const offset = spans.slice(0, i).reduce((sum, span) => sum + span, 0) + spans[i] / 2 - total / 2;
  const t = offset / Math.SQRT2;
  turntable.position.set(side / 2 + t, 0, side / 2 - t);
  const model = build();
  turntable.userData.update = model.userData.update;
  turntable.add(model);
  if (shadow) {
    const disc = createDropShadow(shadow);
    disc.position.y = 0.01;
    disc.scale.set(0.9, 0.9, 1);
    turntable.add(disc);
  }
  renderer.scene.add(turntable);

  // Label under the asset; the stage is always 16:9, so percentages stay put.
  const screen = new Vector3(turntable.position.x + spans[i] * 0.25, 0, turntable.position.z + spans[i] * 0.25).project(renderer.camera);
  const tag = document.createElement('div');
  tag.className = 'showcase-label';
  tag.textContent = label;
  tag.style.left = `${((screen.x + 1) / 2) * 100}%`;
  tag.style.top = `${((1 - screen.y) / 2) * 100}%`;
  renderer.hud.append(tag);
  return turntable;
});

renderer.hud.insertAdjacentHTML(
  'beforeend',
  '<div class="showcase-title">&gt; ASSET SHOWCASE<br>&gt; SPACE pause &nbsp; &larr;/&rarr; turn</div>',
);

let spinning = true;
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') spinning = !spinning;
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  HOLO_TIME.value = now / 1000;
  let turn = spinning ? SPIN : 0;
  if (held.has('ArrowLeft')) turn -= 2;
  if (held.has('ArrowRight')) turn += 2;
  for (const turntable of turntables) {
    turntable.rotation.y += turn * dt;
    turntable.userData.update?.(dt, now / 1000);
  }
  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
