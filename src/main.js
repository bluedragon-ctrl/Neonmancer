// Entry point: load and validate the game data, show the title screen over
// the start room (or load the access key in the URL hash), run the loop.
// Any startup problem shows the error screen instead.
import { DT, FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { say } from './core/messages.js';
import { DATA_FILES, DEV_SERVER, SCHEMA_ERRORS, onDataSaved } from './data/bundle.js';
import { DataError, loadGameData } from './data/load.js';
import { DebugOverlay } from './debug/overlay.js';
import { DebugReadout } from './debug/readout.js';
import { Editor } from './editor/editor.js';
import { readDataFiles } from './editor/save.js';
import { Game } from './game.js';
import { PLAYER } from './entities/player.js';
import { PlayerView } from './render/entity-view.js';
import { HOLO_TIME } from './render/holo.js';
import { bootState } from './render/boot-fx.js';
import { AutoQuality } from './render/quality.js';
import { Renderer } from './render/renderer.js';
import { RoomScene } from './render/room-scene.js';
import { showErrorScreen } from './ui/error-screen.js';
import { toggleFullscreen, wantsFullscreenHint } from './ui/fullscreen.js';
import { BootScreen } from './ui/boot-screen.js';
import { Hud } from './ui/hud.js';
import { MapScreen } from './ui/map-screen.js';
import { MenuScreen } from './ui/menu-screen.js';
import { MenuFlow } from './ui/menus.js';
import { copyText, hashKey, keyLink, storeKey, storedKey, writeHash } from './ui/saves.js';
import { Settings } from './ui/settings.js';
import { readSave, saveGame } from './world/save-game.js';

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
  // Templates and rooms saved in the monster editor or the world map (D119).
  onDataSaved(async (paths) => editor.takeSaved(await readDataFiles(paths.filter((path) => path === 'defs.json' || path.startsWith('rooms/')))));
  if (DEV_SERVER && params.has('edit')) editor.open();

  // The title screen first; the world map tool's links go straight in,
  // and so does a link with an access key (#KEY, D105).
  // Volumes and visual settings: stubs, stored but not applied yet (D109).
  const settings = Settings.load();
  const devLink = Boolean(devRoom || (DEV_SERVER && params.has('edit')));
  const linked = devLink ? null : hashKey(location.hash);
  const linkedSave = linked && readSave(content, linked);
  const flow = new MenuFlow(devLink || linkedSave?.ok ? 'playing' : 'title', settings);
  flow.canContinue = readSave(content, storedKey() ?? '').ok;
  if (linkedSave && !linkedSave.ok) flow.notice = 'key.error.link';
  // A key pasted into the address bar of this page changes only the hash: load it afresh.
  window.addEventListener('hashchange', () => location.reload());

  /** A menu command (ui/menus.js): a new game, a save, a load, a copy, back to the title, or a setting changed. */
  function run(command) {
    if (command === 'settings') settings.save();
    if (command === 'start') newGame();
    // The title shows the start room behind it again.
    if (command === 'quit') newGame({ quiet: true });
    if (command === 'save') {
      const key = saveGame(game);
      writeHash(key);
      storeKey(key);
      flow.saved(key);
    }
    if (command === 'continue') load(storedKey() ?? '');
    if (command === 'loadKey') load(menuScreen.keyText());
    if (command === 'copyKey' || command === 'copyLink') {
      const link = command === 'copyLink';
      copyText(link ? keyLink(flow.key) : flow.key).then((copied) => {
        flow.notice = copied ? (link ? 'menu.copiedLink' : 'menu.copiedKey') : 'menu.copyFailed';
      });
    }
  }

  /**
   * Load an access key (D105): the game starts over in the saved room,
   * reset, with what the key holds, and the boot sequence plays. The key
   * goes into the URL hash, so the page's address is this save's link.
   * A refused key says why under the menu.
   * @param {string} text
   */
  function load(text) {
    const save = readSave(content, text);
    if (!save.ok) {
      flow.refused(save.error);
      return;
    }
    writeHash(save.key);
    flow.loaded(save.key);
    newGame({ load: save.options });
  }
  const menuScreen = new MenuScreen(renderer.stage, content.strings, {
    onHover: (index) => flow.select(index),
    onClick: (index) => {
      flow.select(index);
      run(flow.choose());
    },
    onStep: (index, step) => {
      flow.select(index);
      run(flow.adjust(step));
    },
    onSubmit: () => {
      if (flow.top?.id === 'enterKey') run('loadKey');
    },
    onBack: () => flow.back(),
  });
  const mapScreen = new MapScreen(renderer.stage, content.strings);
  const bootScreen = new BootScreen(renderer.stage, renderer.camera);
  /** Seconds into the boot sequence after Start (D110), or null when none runs. */
  let boot = null;

  /** Was the game running loaded from a key (a different greeting)? */
  let restored = false;

  /**
   * Start over: in the start room with nothing found, or from a loaded
   * save (`load`: Game.reset() options from readSave()). Unless `quiet`
   * (behind the title), the boot sequence plays: the room compiles and
   * the wizard pops in (D110).
   * @param {{ quiet?: boolean, load?: object }} [options]
   */
  function newGame({ quiet = false, load } = {}) {
    hud.clear();
    game.reset(load ?? { start: devRoom });
    restored = Boolean(load);
    // The room's banner waits until he is in (finishBoot()).
    hud.clear();
    if (quiet) {
      showTitleShape();
      return;
    }
    showRoom();
    playerView.group.visible = true;
    say('msg.loading', { room: content.rooms.get(game.room.id).name.toUpperCase() });
    bootScreen.start(game.room.size);
    boot = 0;
  }

  /** The boot sequence is over (or skipped): the banner, the greeting, and he is yours. */
  function finishBoot() {
    boot = null;
    bootScreen.stop();
    game.announceRoom();
    say('msg.boot');
    say(restored ? 'msg.restored' : 'msg.welcome');
  }
  /** Behind the title only the start room's empty shape, without him: the room loads after Start. */
  function showTitleShape() {
    roomScene.showShape(game);
    debug.setRoom(game.room, [], []);
    playerView.group.visible = false;
  }
  if (linkedSave?.ok) {
    writeHash(linkedSave.key);
    flow.loaded(linkedSave.key);
    newGame({ load: linkedSave.options });
  } else if (flow.playing) {
    say('msg.boot');
    say('msg.welcome');
  } else showTitleShape();

  const input = new Input();
  input.attach(window);
  // Leaving the window pauses the game (checked in the next tick).
  let blurred = false;
  window.addEventListener('blur', () => (blurred = true));

  function update() {
    input.sample();
    if (input.pressed('fullscreen')) toggleFullscreen(document.documentElement);
    if (input.pressed('debug')) debug.toggle();
    if (input.pressed('editor') && flow.playing) editor.toggle();
    // The game stands still while the room is being edited.
    if (editor.active) {
      blurred = false;
      readout.countTick();
      return;
    }
    // The boot sequence holds the game too; a menu key skips it.
    if (boot !== null) {
      boot += DT;
      blurred = false;
      if (bootState(boot).done || ['confirm', 'jump', 'pause'].some((action) => input.pressed(action))) finishBoot();
      readout.countTick();
      return;
    }
    // The title screen and pause menu hold the game; the tick that closes
    // one doesn't run it either, so its key does nothing in the game.
    const wasPlaying = flow.playing;
    if (blurred && !hud.winShown) flow.pause();
    blurred = false;
    run(flow.update(input));
    if (!wasPlaying || !flow.playing) {
      readout.countTick();
      return;
    }
    // The end-of-game screen holds the game until it is closed (D101).
    if (hud.winShown) {
      if (input.pressed('confirm')) hud.hideWin();
      readout.countTick();
      return;
    }
    if (input.pressed('movementMode')) game.toggleMovementMode();
    if (debug.active) {
      if (input.pressed('debugRoomNext') && game.debugJumpRoom(1)) showRoom();
      if (input.pressed('debugRoomPrev') && game.debugJumpRoom(-1)) showRoom();
      if (input.pressed('debugInvincible')) game.invincible = !game.invincible;
      if (input.pressed('debugDamage')) game.hurt(1);
      if (input.pressed('debugFragments')) game.debugGrantFragments();
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
    // Behind a menu the game stands still: no animation, no interpolation.
    // While booting nothing moves either, but the room animates.
    const dt = flow.playing ? Math.min(time - lastFrame, 0.1) : 0;
    lastFrame = time;
    if (!flow.playing || boot !== null) alpha = 1;

    const booting = boot === null ? null : bootState(boot);
    menuScreen.show(flow, booting?.logo ?? null);
    mapScreen.show(flow, game);
    bootScreen.show(booting?.wipe ?? null);
    playerView.boot = booting;
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
    if (event.type === 'access' || event.type === 'win') roomScene.flashCore();
    if (event.type === 'win') hud.showWin(game.score, game.completion);
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
  hud.setScore(game.score, game.completion);
  hud.setFragments(game.fragmentSlots(), game.fragmentRules.required, game.progress.accessLevel);
  hud.setMovementMode(game.movementMode);
  hud.setHintWanted(wantsFullscreenHint(renderer.stageHeight, window.devicePixelRatio, !!document.fullscreenElement));
  hud.update(dt);
}
