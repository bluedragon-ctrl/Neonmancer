/**
 * The title screen and pause menu as plain logic, without DOM (the view is
 * ui/menu-screen.js): which screen is up, the menus stacked on it, the
 * item selected in each, and what choosing an item does. main.js runs the
 * commands it returns and feeds it input once a tick.
 *
 * Menus stack: a panel such as the options, the controls or the quit
 * question opens over the menu that opened it, and Back (Esc / P) closes
 * the top one. Closing the pause menu itself resumes the game; the title
 * menu stays. The map screen (D112) is a menu without items: M opens it
 * over the game (or Map in the pause menu), and M, Esc, P or Enter close it.
 */
import { SETTINGS, Settings } from './settings.js';

/**
 * The menus by id: their items, in order. An item is an id; its label is
 * the string `menu.<id>`, its effect in MenuFlow.choose(). An item named
 * after a setting (ui/settings.js) shows and adjusts that setting.
 * Continue is only there when a save is stored (MenuFlow.items()).
 */
export const MENUS = {
  title: ['continue', 'start', 'enterKey', 'options', 'controls'],
  pause: ['resume', 'map', 'save', 'copyKey', 'copyLink', 'options', 'controls', 'quit'],
  enterKey: ['loadKey', 'back'],
  options: ['music', 'sound', 'visuals', 'back'],
  visuals: ['quality', 'renderScale', 'effects', 'back'],
  controls: ['back'],
  quit: ['quitNo', 'quitYes'],
  map: [],
};

/** Items that open another menu. */
const SUBMENUS = ['options', 'visuals', 'controls', 'quit', 'enterKey', 'map'];

/**
 * Something main.js does for a chosen item: start a new game from the
 * title, load the stored save (continue) or the key typed in (loadKey),
 * save the game, copy the save's key or a link with it, quit to the title
 * (the game starts over, D105: nothing saves on its own), or store the
 * settings after a change. main.js answers a save or a load with saved(),
 * loaded() or refused().
 * @typedef {'start' | 'continue' | 'loadKey' | 'save' | 'copyKey' | 'copyLink' | 'quit' | 'settings'} MenuCommand
 */

/** @param {string} item @returns {boolean} whether it is a setting */
export function isSetting(item) {
  return Object.hasOwn(SETTINGS, item);
}

export class MenuFlow {
  /**
   * @param {'title' | 'playing'} [screen] the title screen first, or straight into the game (dev links)
   * @param {Settings} [settings] what the options menus change
   */
  constructor(screen = 'title', settings = new Settings()) {
    this.settings = settings;
    /** @type {{ id: string, selected: number }[]} menus open, the top one last; none while playing */
    this.stack = [];
    /** A short line under the items (a string key), e.g. a key refused; cleared by the next move. */
    this.notice = null;
    /** The key of this game's last save or load (D105), for Copy key and Copy link; null before one. */
    this.key = null;
    /** Is a save stored (localStorage)? The title offers Continue then. */
    this.canContinue = false;
    /** @type {(name: string) => void} Called with a UI sound name (ui_move, ui_open, ui_back, ui_choose, ui_adjust, ui_deny); main.js plays it (D139). */
    this.onSound = () => {};
    if (screen === 'title') this.open('title');
  }

  /** Is the game running (no menu up)? */
  get playing() {
    return this.stack.length === 0;
  }

  /** Is the title screen up (under any panel it opened)? */
  get onTitle() {
    return this.stack[0]?.id === 'title';
  }

  /** The menu on top, or null while playing. */
  get top() {
    return this.stack.at(-1) ?? null;
  }

  /** The selected item's id, or null while playing. */
  get item() {
    const menu = this.top;
    return menu ? this.items(menu.id)[menu.selected] : null;
  }

  /**
   * A menu's items as shown: the title's Continue only with a save stored.
   * @param {string} id a MENUS key
   * @returns {string[]}
   */
  items(id) {
    return id === 'title' && !this.canContinue ? MENUS.title.filter((item) => item !== 'continue') : MENUS[id];
  }

  /** @param {string} id a MENUS key */
  open(id) {
    this.stack.push({ id, selected: 0 });
    this.notice = null;
    this.onSound('ui_open');
  }

  /** The pause menu, over the running game (Esc / P, or the window lost focus). */
  pause() {
    if (this.playing) this.open('pause');
  }

  /** Close the top menu; the title menu stays. */
  back() {
    this.notice = null;
    if (this.stack.length === 1 && this.onTitle) return;
    this.stack.pop();
    this.onSound('ui_back');
  }

  /**
   * Move the selection, wrapping round.
   * @param {number} step +1 down, -1 up
   */
  move(step) {
    const menu = this.top;
    if (!menu) return;
    const count = this.items(menu.id).length;
    if (count === 0) return;
    menu.selected = (menu.selected + step + count) % count;
    this.notice = null;
    this.onSound('ui_move');
  }

  /** @param {number} index an item of the top menu (a mouse hover) */
  select(index) {
    const menu = this.top;
    if (!menu || index < 0 || index >= this.items(menu.id).length || index === menu.selected) return;
    menu.selected = index;
    this.notice = null;
    this.onSound('ui_move');
  }

  /**
   * Adjust the selected item if it is a setting (left / right).
   * @param {number} step +1 or -1
   * @param {boolean} [wrap] a range goes round at its ends
   * @returns {MenuCommand | null} 'settings' when it changed
   */
  adjust(step, wrap = false) {
    const item = this.item;
    if (!item || !isSetting(item)) return null;
    if (!this.settings.step(item, step, wrap)) return null;
    this.onSound('ui_adjust');
    return 'settings';
  }

  /**
   * Choose the selected item of the top menu.
   * @returns {MenuCommand | null} what main.js has to do, if anything
   */
  choose() {
    const command = this.pick();
    // Submenus and back play their own sounds, a setting its adjust sound.
    if (command && command !== 'settings') this.onSound('ui_choose');
    return command;
  }

  /** The choice itself, see choose(). @returns {MenuCommand | null} */
  pick() {
    const item = this.item;
    if (!item) return null;
    // Enter on a setting steps it forward, round and round.
    if (isSetting(item)) return this.adjust(1, true);
    if (SUBMENUS.includes(item)) {
      this.open(item);
      return null;
    }
    switch (item) {
      case 'start':
        this.stack = [];
        this.key = null;
        return 'start';
      case 'resume':
        this.stack = [];
        return null;
      // main.js answers these with loaded() or refused(), saved().
      case 'continue':
      case 'loadKey':
      case 'save':
        return item;
      case 'copyKey':
      case 'copyLink':
        if (this.key) return item;
        this.notice = 'menu.saveFirst';
        this.onSound('ui_deny');
        return null;
      case 'quitYes':
        this.stack = [];
        this.key = null;
        this.open('title');
        return 'quit';
      default: // back, quitNo
        this.back();
        return null;
    }
  }

  /**
   * The game was saved: its key, for copying; a stored save to continue.
   * @param {string} key
   */
  saved(key) {
    this.key = key;
    this.canContinue = true;
    this.notice = 'menu.saved';
  }

  /**
   * A key was loaded: into the game, with its key for copying.
   * @param {string} key
   */
  loaded(key) {
    this.key = key;
    this.stack = [];
    this.notice = null;
  }

  /**
   * A key was refused: why, under the items.
   * @param {string} error save-key.js's reason (empty, length, character, checksum, version)
   */
  refused(error) {
    this.notice = `key.error.${error}`;
    this.onSound('ui_deny');
  }

  /**
   * Read the menu actions of one tick: up and down move, left and right
   * adjust a setting, Enter or Space choose, Esc or P go back; while
   * playing, Esc or P pause and M opens the map, which M, Esc, P, Enter
   * or Space close.
   * @param {{ pressed(action: string): boolean }} input
   * @returns {MenuCommand | null}
   */
  update(input) {
    if (this.playing) {
      if (input.pressed('pause')) this.pause();
      else if (input.pressed('map')) this.open('map');
      return null;
    }
    if (this.top.id === 'map') {
      if (['map', 'pause', 'confirm', 'jump'].some((action) => input.pressed(action))) this.back();
      return null;
    }
    if (input.pressed('pause')) {
      this.back();
      return null;
    }
    if (input.pressed('up')) this.move(-1);
    if (input.pressed('down')) this.move(1);
    if (input.pressed('left')) return this.adjust(-1);
    if (input.pressed('right')) return this.adjust(1);
    if (input.pressed('confirm') || input.pressed('jump')) return this.choose();
    return null;
  }
}
