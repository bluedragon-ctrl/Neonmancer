// Entry point: load and validate the game data, show the start room, run
// the loop. Any startup problem shows the error screen instead.
// The readout is temporary and moves into debug mode later.
import { GAME_VERSION } from './core/version.js';
import { FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { DATA_FILES, SCHEMA_ERRORS } from './data/bundle.js';
import { DataError, loadGameData } from './data/load.js';
import { buildRoom } from './world/room.js';
import { Renderer } from './render/renderer.js';
import { frameRoom } from './render/camera.js';
import { createFloor } from './render/floor.js';
import { createHoleView } from './render/hole-view.js';
import { createObjectView, createRoomView } from './render/room-view.js';
import { showErrorScreen } from './ui/error-screen.js';

const app = document.getElementById('app');

try {
  boot();
} catch (err) {
  showErrorScreen(app, err);
}

function boot() {
  // Schema errors (dev server only) come first: the later checks assume
  // well-formed data.
  if (SCHEMA_ERRORS.length > 0) throw new DataError(SCHEMA_ERRORS);
  const content = loadGameData(DATA_FILES);
  const room = buildRoom(content.rooms.get(content.world.start), content);

  // ?scale=0.5 tries a lower render scale until there is a settings menu.
  const renderScale = Number(new URLSearchParams(location.search).get('scale') ?? 1);
  const renderer = new Renderer(app, { renderScale });

  renderer.scene.add(
    createFloor(room.size, room.color, room.holes),
    createHoleView(room.holes, room.color),
    createRoomView(room),
  );
  for (const object of room.objects) renderer.scene.add(createObjectView(object));
  frameRoom(renderer.camera, room.size);

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
      `> ROOM ${room.id}\n` +
      `> TICK/S ${tps}  FPS ${fps}  ALPHA ${alpha.toFixed(2)}\n` +
      `> BUFFER ${renderer.bufferWidth}x${renderer.bufferHeight}\n` +
      `> ACTIONS ${actions}`;
  }

  new FixedLoop({ update, render }).start();
}
