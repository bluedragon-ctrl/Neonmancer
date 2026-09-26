// Entry point: load and validate the game data, show the start room, run
// the loop. Any startup problem shows the error screen instead.
import { FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { say } from './core/messages.js';
import { DATA_FILES, SCHEMA_ERRORS } from './data/bundle.js';
import { DataError, loadGameData } from './data/load.js';
import { DebugOverlay } from './debug/overlay.js';
import { DebugReadout } from './debug/readout.js';
import { Game } from './game.js';
import { PlayerView } from './render/entity-view.js';
import { HOLO_TIME } from './render/holo.js';
import { Renderer } from './render/renderer.js';
import { RoomScene } from './render/room-scene.js';
import { showErrorScreen } from './ui/error-screen.js';
import { toggleFullscreen, wantsFullscreenHint } from './ui/fullscreen.js';
import { Hud } from './ui/hud.js';

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

  // ?scale=0.5 tries a lower render scale and ?msaa=0 turns multisampling
  // off, until there is a settings menu with quality presets.
  const params = new URLSearchParams(location.search);
  const renderer = new Renderer(app, {
    renderScale: Number(params.get('scale') ?? 1),
    multisampling: Number(params.get('msaa') ?? 4),
  });
  const hud = new Hud(renderer.hud, content.strings);
  const debug = new DebugOverlay();
  const readout = new DebugReadout(renderer.hud);
  renderer.scene.add(debug.group);

  const roomScene = new RoomScene(renderer);
  function showRoom() {
    roomScene.show(game);
    debug.setRoom(game.room, game.objects);
  }
  showRoom();
  const playerView = new PlayerView(game);
  renderer.scene.add(playerView.group);

  say('msg.boot');
  say('msg.welcome');

  const input = new Input();
  input.attach(window);

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
    const events = game.update(input);
    if (events.some((event) => event.type === 'room')) showRoom();
    if (events.some((event) => event.type === 'hurt')) hud.flashHit();
    for (const event of events) if (event.type === 'hurt' && event.cell) roomScene.flareHazard(event.cell);
    readout.countTick();
  }

  let lastFrame = performance.now() / 1000;
  function render(alpha) {
    const time = performance.now() / 1000;
    const dt = Math.min(time - lastFrame, 0.1);
    lastFrame = time;

    playerView.sync(alpha);
    roomScene.update(alpha, dt);
    debug.sync(game, alpha);
    renderer.setFade(game.fadeLevel(alpha));
    hud.setIntegrity(game.player.integrity, game.player.maxIntegrity);
    hud.setMovementMode(game.movementMode);
    hud.setHintWanted(wantsFullscreenHint(renderer.stageHeight, window.devicePixelRatio, !!document.fullscreenElement));
    hud.update(dt);
    HOLO_TIME.value = time;
    renderer.render();
    readout.update(debug.active, { game, input, renderer, alpha });
  }

  new FixedLoop({ update, render }).start();
}
