// Entry point: load and validate the game data, show the start room, run
// the loop. Any startup problem shows the error screen instead.
import { Group } from 'three';
import { FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { DATA_FILES, SCHEMA_ERRORS } from './data/bundle.js';
import { DataError, loadGameData } from './data/load.js';
import { DebugOverlay } from './debug/overlay.js';
import { Game } from './game.js';
import { Renderer } from './render/renderer.js';
import { frameRoom } from './render/camera.js';
import { createFloor } from './render/floor.js';
import { createHoleView } from './render/hole-view.js';
import { createRoomView } from './render/room-view.js';
import { PlayerView, PushableView } from './render/entity-view.js';
import { ExitView } from './render/exit-view.js';
import { disposeTree } from './render/neon.js';
import { HOLO_TIME } from './render/holo.js';
import { showErrorScreen } from './ui/error-screen.js';
import { Hud } from './ui/hud.js';
import { say } from './core/messages.js';
import { toggleFullscreen, wantsFullscreenHint } from './ui/fullscreen.js';

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
  const game = new Game(content);

  // ?scale=0.5 tries a lower render scale until there is a settings menu.
  const renderScale = Number(new URLSearchParams(location.search).get('scale') ?? 1);
  const renderer = new Renderer(app, { renderScale });

  const hud = new Hud(renderer.hud, content.strings);
  renderer.hud.insertAdjacentHTML('beforeend', '<pre class="readout"></pre>');
  const readout = renderer.hud.querySelector('.readout');

  const debug = new DebugOverlay();
  renderer.scene.add(debug.group);

  // The room's views are rebuilt whenever the game rebuilds the room.
  let roomScene = new Group();
  let pushableViews = [];
  let exitViews = [];
  function showRoom() {
    renderer.scene.remove(roomScene);
    disposeTree(roomScene);
    const { room } = game;
    pushableViews = game.pushables.map((pushable) => new PushableView(game, pushable));
    exitViews = room.exits.map((exit) => new ExitView(exit, room.size, game.destinationColor(exit)));
    roomScene = new Group().add(
      createFloor(room.size, room.color, room.holes),
      createHoleView(room.holes, room.color),
      createRoomView(room),
      ...pushableViews.map((view) => view.group),
      ...exitViews.map((view) => view.group),
    );
    renderer.scene.add(roomScene);
    frameRoom(renderer.camera, room.size);
    debug.setRoom(room, game.pushables);
  }
  showRoom();
  const playerView = new PlayerView(game);
  renderer.scene.add(playerView.group);

  say('msg.boot');
  say('msg.welcome');

  const input = new Input();
  input.attach(window);

  // Rates measured over the last second.
  let ticksThisSecond = 0;
  let framesThisSecond = 0;
  let secondStart = performance.now();
  let tps = 0;
  let lastFrame = performance.now() / 1000;
  let fps = 0;

  function update() {
    input.sample();
    if (input.pressed('fullscreen')) toggleFullscreen(document.documentElement);
    if (input.pressed('movementMode')) game.toggleMovementMode();
    if (input.pressed('debug')) debug.toggle();
    if (debug.active) {
      if (input.pressed('debugRoomNext') && game.debugJumpRoom(1)) showRoom();
      if (input.pressed('debugRoomPrev') && game.debugJumpRoom(-1)) showRoom();
      if (input.pressed('debugInvincible')) game.invincible = !game.invincible;
      if (input.pressed('debugDamage')) game.hurt(1);
    }
    if (game.update(input).includes('room')) showRoom();
    ticksThisSecond++;
  }

  function render(alpha) {
    playerView.sync(alpha);
    for (const view of pushableViews) view.sync(alpha);
    debug.sync(game, alpha);
    renderer.setFade(game.fadeLevel(alpha));
    const time = performance.now() / 1000;
    const dt = Math.min(time - lastFrame, 0.1);
    lastFrame = time;
    for (const view of exitViews) view.update(dt);
    hud.setIntegrity(game.integrity, game.maxIntegrity);
    hud.setMovementMode(game.movementMode);
    hud.setHintWanted(wantsFullscreenHint(renderer.stageHeight, window.devicePixelRatio, !!document.fullscreenElement));
    hud.update(dt);
    HOLO_TIME.value = time;
    renderer.render();

    framesThisSecond++;
    const now = performance.now();
    if (now - secondStart >= 1000) {
      tps = ticksThisSecond;
      fps = framesThisSecond;
      ticksThisSecond = framesThisSecond = 0;
      secondStart = now;
    }

    readout.classList.toggle('shown', debug.active);
    if (debug.active) {
      const actions = input.activeActions().join(' ') || '-';
      readout.textContent =
        `> ROOM ${game.room.id}${game.invincible ? '  INVINCIBLE' : ''}\n` +
        `> TICK/S ${tps}  FPS ${fps}  ALPHA ${alpha.toFixed(2)}\n` +
        `> BUFFER ${renderer.bufferWidth}x${renderer.bufferHeight}\n` +
        `> ACTIONS ${actions}\n` +
        `> POS ${game.player.pos.map((v) => v.toFixed(2)).join(' ')}${game.player.grounded ? '  GROUNDED' : ''}\n` +
        `> [/] ROOM  I INVINCIBLE  H DAMAGE`;
    }
  }

  new FixedLoop({ update, render }).start();
}
