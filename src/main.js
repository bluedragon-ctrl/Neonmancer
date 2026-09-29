// Entry point: load and validate the game data, show the start room, run
// the loop. Any startup problem shows the error screen instead.
import { FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { say } from './core/messages.js';
import { DATA_FILES, DEV_SERVER, SCHEMA_ERRORS } from './data/bundle.js';
import { DataError, loadGameData } from './data/load.js';
import { DebugOverlay } from './debug/overlay.js';
import { DebugReadout } from './debug/readout.js';
import { Editor } from './editor/editor.js';
import { Game } from './game.js';
import { PLAYER } from './entities/player.js';
import { PlayerView } from './render/entity-view.js';
import { HOLO_TIME } from './render/holo.js';
import { AutoQuality } from './render/quality.js';
import { Renderer } from './render/renderer.js';
import { RoomScene } from './render/room-scene.js';
import { SHRINE_FX } from './render/shrine-view.js';
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
  const params = new URLSearchParams(location.search);
  // Dev server only (never for players, D67): ?room=<id> starts in that
  // room and ?edit opens the room editor on it (the world map tool's links).
  const devRoom = DEV_SERVER && content.rooms.has(params.get('room')) ? params.get('room') : undefined;
  const game = new Game(content, { start: devRoom });
  // The backup shrine look (D96) while the author picks one: ?shrine=white|gold|rainbow.
  if (SHRINE_FX.looks[params.get('shrine')]) SHRINE_FX.look = params.get('shrine');

  // Quality steps down by itself when frames run slow (D76). ?scale=0.5
  // and ?msaa=0 set it by hand instead, until there is a settings menu
  // with quality presets.
  const manualQuality = params.has('scale') || params.has('msaa');
  const autoQuality = manualQuality ? null : new AutoQuality();
  const renderer = new Renderer(
    app,
    autoQuality?.settings ?? { renderScale: Number(params.get('scale') ?? 1), multisampling: Number(params.get('msaa') ?? 4) },
  );
  const hud = new Hud(renderer.hud, content.strings, { pauseColor: content.spells.pause?.color });
  const debug = new DebugOverlay();
  const readout = new DebugReadout(renderer.hud);
  renderer.scene.add(debug.group);

  // The wizard's view is in the scene before the first room is shown, so
  // his effects' shaders are compiled with it (Renderer.compile()).
  const playerView = new PlayerView(game);
  renderer.scene.add(playerView.group);
  const roomScene = new RoomScene(renderer);
  /** @param {{ rebuild?: boolean }} [options] see RoomScene.show() */
  function showRoom(options) {
    roomScene.show(game, options);
    debug.setRoom(game.room, game.objects, game.enemies);
  }
  showRoom();

  // F2: the room editor (saves in the dev server, exports in a build).
  const editor = new Editor({ game, renderer, files: DATA_FILES, canSave: DEV_SERVER, onRoom: (options) => showRoom({ rebuild: true, ...options }) });
  if (DEV_SERVER && params.has('edit')) editor.open();

  say('msg.boot');
  say('msg.welcome');

  const input = new Input();
  input.attach(window);

  function update() {
    input.sample();
    if (input.pressed('fullscreen')) toggleFullscreen(document.documentElement);
    if (input.pressed('debug')) debug.toggle();
    if (input.pressed('editor')) editor.toggle();
    // The game stands still while the room is being edited.
    if (editor.active) {
      readout.countTick();
      return;
    }
    if (input.pressed('movementMode')) game.toggleMovementMode();
    if (debug.active) {
      if (input.pressed('debugRoomNext') && game.debugJumpRoom(1)) showRoom();
      if (input.pressed('debugRoomPrev') && game.debugJumpRoom(-1)) showRoom();
      if (input.pressed('debugInvincible')) game.invincible = !game.invincible;
      if (input.pressed('debugDamage')) game.hurt(1);
    }
    const events = game.update(input);
    if (events.some((event) => event.type === 'room')) showRoom();
    showEvents(events, { game, roomScene, hud, debug });
    readout.countTick();
  }

  let lastFrame = performance.now() / 1000;
  function render(alpha) {
    const time = performance.now() / 1000;
    const lowered = autoQuality?.frame(time - lastFrame);
    if (lowered) {
      renderer.setQuality(lowered);
      console.info(`Frames run slow: quality now MSAA ${renderer.multisampling}, render scale ${renderer.renderScale}`);
    }
    const dt = Math.min(time - lastFrame, 0.1);
    lastFrame = time;

    editor.frame();
    playerView.sync(alpha, dt);
    roomScene.update(alpha, dt);
    debug.sync(game, alpha);
    renderer.setFade(game.fadeLevel(alpha));
    syncHud(hud, game, renderer, dt);
    HOLO_TIME.value = time;
    renderer.render();
    readout.update(debug.active, { game, input, renderer, alpha, autoQuality });
  }

  new FixedLoop({ update, render }).start();
}

/**
 * One-off effects of a tick's game events in the views: flares, sparks,
 * the energy bar's denial, a cut or paste.
 * @param {import('./game.js').GameEvent[]} events
 */
function showEvents(events, { game, roomScene, hud, debug }) {
  for (const event of events) {
    if (event.type === 'hurt' && event.cell) roomScene.flareHazard(event.cell);
    if (event.type === 'hurt' && event.object) roomScene.flareObject(event.object);
    if (event.type === 'zap') roomScene.sparks(event.bolt);
    if (event.type === 'ricochet') roomScene.sparks(event.bolt, event.pos, event.dir);
    if (event.type === 'deny') hud.denyEnergy();
    if (event.type === 'shrine') roomScene.useShrine();
    if (event.type === 'cut' || event.type === 'paste') {
      roomScene.clip(event);
      debug.setRoom(game.room, game.objects, game.enemies);
    }
  }
}

/**
 * Show the wizard's state in the HUD, once a frame.
 * @param {Hud} hud
 * @param {Game} game
 * @param {Renderer} renderer
 * @param {number} dt seconds since the last frame
 */
function syncHud(hud, game, renderer, dt) {
  const { player } = game;
  hud.setIntegrity(player.integrity, player.maxIntegrity);
  hud.setBackups(player.backups, PLAYER.backups);
  // No energy bar before he knows a spell.
  hud.setEnergy(player.energy, player.maxEnergy, player.spell !== null);
  hud.setSpell(player.spell, player.spells.length, player.spell && game.spellNameKey(player.spell));
  hud.setClipboard(player.spell === 'cut_paste', player.clipboard);
  hud.setMovementMode(game.movementMode);
  hud.setHintWanted(wantsFullscreenHint(renderer.stageHeight, window.devicePixelRatio, !!document.fullscreenElement));
  hud.update(dt);
}
