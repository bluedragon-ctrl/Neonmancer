/**
 * The title screen and pause menu as plain logic, without DOM (the view is
 * ui/menu-screen.js): which screen is up, the menus stacked on it, the
 * item selected in each, and what choosing an item does. main.js runs the
 * commands it returns and feeds it input once a tick.
 *
 * Menus stack: a panel such as the options, the controls or the quit
 * question opens over the menu that opened it, and Back (Esc / P) closes
 * the top one. Closing the pause menu itself resumes the game; the title
 * menu stays.
 */
import { SETTINGS, Settings } from './settings.js';

/**
 * The menus by id: their items, in order. An item is an id; its label is
 * the string `menu.<id>`, its effect in MenuFlow.choose(). An item named
 * after a setting (ui/settings.js) shows and adjusts that setting.
 */
export const MENUS = {
  title: ['start', 'options', 'controls'],
  pause: ['resume', 'save', 'options', 'controls', 'quit'],
  options: ['music', 'sound', 'visuals', 'back'],
  visuals: ['quality', 'renderScale', 'effects', 'back'],
  controls: ['back'],
  quit: ['quitNo', 'quitYes'],
};

/** Items that open another menu. */
const SUBMENUS = ['options', 'visuals', 'controls', 'quit'];

/**
 * Something main.js does for a chosen item: start a new game from the
 * title, quit to the title (the game starts over, D105: nothing saves on
 * its own), or store the settings after a change.
 * @typedef {'start' | 'quit' | 'settings'} MenuCommand
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
    /** A short line under the items (a string key), e.g. why Save does nothing yet; cleared by the next move. */
    this.notice = null;
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
    return menu ? MENUS[menu.id][menu.selected] : null;
  }

  /** @param {string} id a MENUS key */
  open(id) {
    this.stack.push({ id, selected: 0 });
    this.notice = null;
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
  }

  /**
   * Move the selection, wrapping round.
   * @param {number} step +1 down, -1 up
   */
  move(step) {
    const menu = this.top;
    if (!menu) return;
    const count = MENUS[menu.id].length;
    menu.selected = (menu.selected + step + count) % count;
    this.notice = null;
  }

  /** @param {number} index an item of the top menu (a mouse hover) */
  select(index) {
    const menu = this.top;
    if (!menu || index < 0 || index >= MENUS[menu.id].length || index === menu.selected) return;
    menu.selected = index;
    this.notice = null;
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
    return this.settings.step(item, step, wrap) ? 'settings' : null;
  }

  /**
   * Choose the selected item of the top menu.
   * @returns {MenuCommand | null} what main.js has to do, if anything
   */
  choose() {
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
        return 'start';
      case 'resume':
        this.stack = [];
        return null;
      case 'save':
        // A stub until saving comes (D105): the item is there, it only says so.
        this.notice = 'menu.saveSoon';
        return null;
      case 'quitYes':
        this.stack = [];
        this.open('title');
        return 'quit';
      default: // back, quitNo
        this.back();
        return null;
    }
  }

  /**
   * Read the menu actions of one tick: up and down move, left and right
   * adjust a setting, Enter or Space choose, Esc or P go back; while
   * playing, Esc or P pause.
   * @param {{ pressed(action: string): boolean }} input
   * @returns {MenuCommand | null}
   */
  update(input) {
    if (this.playing) {
      if (input.pressed('pause')) this.pause();
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
