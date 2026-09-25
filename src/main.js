// Entry point. For now: the renderer showing a hand-made demo room, plus a
// live readout of the loop and input systems (moves into debug mode later).
import { GAME_VERSION } from './core/version.js';
import { FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { Renderer } from './render/renderer.js';
import { frameRoom } from './render/camera.js';
import { createFloor } from './render/floor.js';
import { createRoomView } from './render/room-view.js';
import { DEMO_ROOM } from './demo-room.js';

// ?scale=0.5 tries a lower render scale until there is a settings menu.
const renderScale = Number(new URLSearchParams(location.search).get('scale') ?? 1);
const renderer = new Renderer(document.getElementById('app'), { renderScale });

renderer.scene.add(createFloor(DEMO_ROOM.size), createRoomView(DEMO_ROOM));
frameRoom(renderer.camera, DEMO_ROOM.size);

renderer.hud.innerHTML = `
  <div class="brand">NEONMANCER <span>v${GAME_VERSION}</span></div>
  <pre class="readout"></pre>
`;
const readout = renderer.hud.querySelector('.readout');

const input = new Input();
input.attach(window);

// Rates measured over the last second.
let ticksThisSecond = 0;
let framesThisSecond = 0;
let secondStart = performance.now();
let tps = 0;
let fps = 0;

function update() {
  input.sample();
  ticksThisSecond++;
}

function render(alpha) {
  renderer.render();

  framesThisSecond++;
  const now = performance.now();
  if (now - secondStart >= 1000) {
    tps = ticksThisSecond;
    fps = framesThisSecond;
    ticksThisSecond = framesThisSecond = 0;
    secondStart = now;
  }

  const actions = input.activeActions().join(' ') || '-';
  readout.textContent =
    `> TICK/S ${tps}  FPS ${fps}  ALPHA ${alpha.toFixed(2)}\n` +
    `> BUFFER ${renderer.bufferWidth}x${renderer.bufferHeight}\n` +
    `> ACTIONS ${actions}`;
}

const loop = new FixedLoop({ update, render });
loop.start();
