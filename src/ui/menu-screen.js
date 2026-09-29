/**
 * The title screen and the pause menu on screen: the DOM view of a
 * MenuFlow (ui/menus.js). An overlay on the stage over the game and the
 * HUD; the title screen hides the HUD. Sizes use --u like the HUD. The
 * mouse works too: hovering an item selects it, a click chooses it.
 */
import { GAME_VERSION } from '../core/version.js';
import { MENUS } from './menus.js';
import { formatText } from './text.js';

/** The controls panel's rows: `controls.<id>` names the action, `controls.<id>Keys` its keys. */
export const CONTROL_ROWS = ['move', 'jump', 'cast', 'spell', 'pause', 'movementMode', 'fullscreen'];

export class MenuScreen {
  /**
   * @param {HTMLElement} stage the renderer's stage
   * @param {Record<string, string>} strings
   * @param {object} handlers
   * @param {(index: number) => void} handlers.onHover an item of the top menu is under the mouse
   * @param {(index: number) => void} handlers.onClick it was clicked
   */
  constructor(stage, strings, { onHover, onClick }) {
    this.strings = strings;
    this.stage = stage;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="menu" hidden>
        <div class="menu-logo"><div class="menu-logo-title"></div><div class="menu-logo-tag"></div></div>
        <div class="menu-heading"></div>
        <div class="menu-body"></div>
        <ul class="menu-items"></ul>
        <div class="menu-help"></div>
        <div class="menu-version"></div>
      </div>`,
    );
    this.root = stage.querySelector('.menu');
    const find = (selector) => this.root.querySelector(selector);
    this.logo = find('.menu-logo');
    find('.menu-logo-title').textContent = this.text('game.title');
    find('.menu-logo-tag').textContent = this.text('title.tagline');
    find('.menu-version').textContent = this.text('game.version', { version: GAME_VERSION });
    this.heading = find('.menu-heading');
    this.body = find('.menu-body');
    this.items = find('.menu-items');
    this.help = find('.menu-help');
    this.items.addEventListener('mousemove', (e) => {
      const index = this.itemIndex(e.target);
      if (index >= 0) onHover(index);
    });
    this.items.addEventListener('click', (e) => {
      const index = this.itemIndex(e.target);
      if (index >= 0) onClick(index);
    });
    /** What is shown (menu ids and selection), so the DOM is only written when it changes. */
    this.shown = null;
  }

  /** Text for a string key, with values filled in. */
  text(key, values) {
    return formatText(this.strings, key, values);
  }

  /** @param {EventTarget} target @returns {number} the item's index, or -1 */
  itemIndex(target) {
    const item = /** @type {HTMLElement} */ (target).closest?.('li');
    return item ? [...this.items.children].indexOf(item) : -1;
  }

  /**
   * Show the flow's state; call once a frame.
   * @param {import('./menus.js').MenuFlow} flow
   */
  show(flow) {
    const top = flow.top;
    const state = top ? `${flow.stack.map((menu) => menu.id).join('/')}:${top.selected}` : '';
    if (state === this.shown) return;
    const opened = !this.shown || !top || this.shown.split(':')[0] !== state.split(':')[0];
    this.shown = state;

    this.root.hidden = !top;
    this.stage.classList.toggle('titled', flow.onTitle);
    if (!top) return;
    this.root.classList.toggle('title', flow.onTitle);
    // The logo only on the title's own menu; its panels have a heading.
    this.logo.hidden = top.id !== 'title';
    this.heading.hidden = top.id === 'title';
    this.heading.textContent = this.text(`menu.heading.${top.id}`);
    if (opened) this.fillBody(top.id);

    const ids = MENUS[top.id];
    if (opened) {
      this.items.replaceChildren(
        ...ids.map((id) => {
          const item = document.createElement('li');
          item.textContent = this.text(`menu.${id}`);
          return item;
        }),
      );
    }
    [...this.items.children].forEach((item, i) => item.classList.toggle('selected', i === top.selected));
    this.help.textContent = this.text(flow.stack.length > 1 || top.id === 'pause' ? 'menu.helpBack' : 'menu.help');
  }

  /** The text under a menu's heading: the controls table, the quit warning, or nothing. */
  fillBody(id) {
    this.body.replaceChildren();
    this.body.hidden = id !== 'controls' && id !== 'quit';
    if (id === 'quit') {
      this.body.textContent = this.text('menu.quitText');
      return;
    }
    if (id !== 'controls') return;
    const table = document.createElement('dl');
    table.className = 'menu-controls';
    for (const row of CONTROL_ROWS) {
      const name = document.createElement('dt');
      name.textContent = this.text(`controls.${row}`);
      const keys = document.createElement('dd');
      keys.textContent = this.text(`controls.${row}Keys`);
      table.append(name, keys);
    }
    this.body.append(table);
  }
}
