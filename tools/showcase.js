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
import { createDropShadow } from '../src/render/entity-view.js';
import { createFloor } from '../src/render/floor.js';
import { PALETTE } from '../src/render/neon.js';
import { Renderer } from '../src/render/renderer.js';
import { ASPECT } from '../src/render/viewport.js';
import { createObjectView, createRoomView } from '../src/render/room-view.js';
import { ExitView } from '../src/render/exit-view.js';
import { HOLO_TIME } from '../src/render/holo.js';
import { createWizard } from '../src/render/wizard.js';

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
  // Every object type from defs.json, in its own style.
  ...Object.entries(defs.objects).map(([type, props]) => ({
    label: type,
    build: () => {
      const view = createObjectView({ ...OBJECT_STYLE_DEFAULTS, ...props, at: [0, 0, 0] });
      view.position.set(-0.5, 0, -0.5);
      return new Group().add(view);
    },
  })),
  { label: 'exits', span: 5.5, build: buildExits },
];

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
const ASSETS = ALL_ASSETS.filter(({ label }) => !only || only.split(',').includes(label));

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
