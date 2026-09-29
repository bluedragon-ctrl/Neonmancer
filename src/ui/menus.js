/**
 * The title screen and pause menu as plain logic, without DOM (the view is
 * ui/menu-screen.js): which screen is up, the menus stacked on it, the
 * item selected in each, and what choosing an item does. main.js runs the
 * commands it returns and feeds it input once a tick.
 *
 * Menus stack: a panel such as the controls or the quit question opens over
 * the menu that opened it, and Back (Esc / P) closes the top one. Closing
 * the pause menu itself resumes the game; the title menu stays.
 */

/**
 * The menus by id: their items, in order. An item is an id; its label is
 * the string `menu.<id>`, its effect in MenuFlow.choose().
 */
export const MENUS = {
  title: ['start', 'controls'],
  pause: ['resume', 'controls', 'quit'],
  controls: ['back'],
  quit: ['quitNo', 'quitYes'],
};

/**
 * Something main.js does for a chosen item: start a new game from the
 * title, or quit to the title (the game starts over, D105: nothing saves on
 * its own).
 * @typedef {'start' | 'quit'} MenuCommand
 */

export class MenuFlow {
  /** @param {'title' | 'playing'} [screen] the title screen first, or straight into the game (dev links) */
  constructor(screen = 'title') {
    /** @type {{ id: string, selected: number }[]} menus open, the top one last; none while playing */
    this.stack = [];
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

  /** @param {string} id a MENUS key */
  open(id) {
    this.stack.push({ id, selected: 0 });
  }

  /** The pause menu, over the running game (Esc / P, or the window lost focus). */
  pause() {
    if (this.playing) this.open('pause');
  }

  /** Close the top menu; the title menu stays. */
  back() {
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
  }

  /** @param {number} index an item of the top menu (a mouse hover) */
  select(index) {
    const menu = this.top;
    if (menu && index >= 0 && index < MENUS[menu.id].length) menu.selected = index;
  }

  /**
   * Choose the selected item of the top menu.
   * @returns {MenuCommand | null} what main.js has to do, if anything
   */
  choose() {
    const menu = this.top;
    if (!menu) return null;
    switch (MENUS[menu.id][menu.selected]) {
      case 'start':
        this.stack = [];
        return 'start';
      case 'resume':
        this.stack = [];
        return null;
      case 'controls':
        this.open('controls');
        return null;
      case 'quit':
        this.open('quit');
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
   * Read the menu actions of one tick: up and down move, Enter or Space
   * choose, Esc or P go back; while playing, Esc or P pause.
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
    if (input.pressed('confirm') || input.pressed('jump')) return this.choose();
    return null;
  }
}
