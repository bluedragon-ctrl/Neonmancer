/**
 * The title screen and the pause menu on screen: the DOM view of a
 * MenuFlow (ui/menus.js). An overlay on the stage over the game and the
 * HUD; the title screen hides the HUD. Sizes use --u like the HUD. The
 * mouse works too: hovering an item selects it, a click chooses it, and a
 * click on a setting's ◄ or ► adjusts it. Enter key has a text field for
 * the key (the game's keys leave it alone, core/input.js); the pause menu
 * shows the last save's key, to select and copy by hand.
 */
import { GAME_VERSION } from '../core/version.js';
import { isSetting } from './menus.js';
import { SETTINGS } from './settings.js';
import { formatText, scrambleText } from './text.js';

/** The controls panel's rows: `controls.<id>` names the action, `controls.<id>Keys` its keys. */
export const CONTROL_ROWS = ['move', 'jump', 'cast', 'spell', 'pause', 'movementMode', 'fullscreen'];

/** Menus with text under the heading: `menu.<id>Text`, the controls table, the key field, or the pause menu's key. */
const BODIES = ['controls', 'quit', 'options', 'visuals', 'enterKey', 'pause'];

/**
 * A setting's value as shown: a range of 0–10 as a bar of ten cells
 * (render scale as a percentage), a choice by its string.
 * @param {(key: string) => string} text
 * @param {string} id
 * @param {number | string} value
 */
export function settingText(text, id, value) {
  const setting = SETTINGS[id];
  if (setting.type === 'choice') return text(`setting.${id}.${value}`);
  if (id === 'renderScale') return `${Number(value) * 10}%`;
  return '■'.repeat(Number(value)) + '□'.repeat(setting.max - Number(value));
}

export class MenuScreen {
  /**
   * @param {HTMLElement} stage the renderer's stage
   * @param {Record<string, string>} strings
   * @param {object} handlers
   * @param {(index: number) => void} handlers.onHover an item of the top menu is under the mouse
   * @param {(index: number) => void} handlers.onClick it was clicked
   * @param {(index: number, step: number) => void} handlers.onStep a setting's arrow was clicked (-1 or +1)
   * @param {() => void} handlers.onSubmit Enter in the key field
   * @param {() => void} handlers.onBack Esc in the key field
   */
  constructor(stage, strings, { onHover, onClick, onStep, onSubmit, onBack }) {
    this.strings = strings;
    this.stage = stage;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="menu" hidden>
        <div class="menu-logo"><div class="menu-logo-title"></div><div class="menu-logo-tag"></div></div>
        <div class="menu-heading"></div>
        <div class="menu-body"></div>
        <ul class="menu-items"></ul>
        <div class="menu-notice"></div>
        <div class="menu-help"></div>
        <div class="menu-version"></div>
      </div>`,
    );
    this.root = stage.querySelector('.menu');
    const find = (selector) => this.root.querySelector(selector);
    this.logo = find('.menu-logo');
    this.logoTitle = find('.menu-logo-title');
    this.logoTitle.textContent = this.text('game.title');
    find('.menu-logo-tag').textContent = this.text('title.tagline');
    find('.menu-version').textContent = this.text('game.version', { version: GAME_VERSION });
    this.heading = find('.menu-heading');
    this.body = find('.menu-body');
    this.items = find('.menu-items');
    this.notice = find('.menu-notice');
    this.help = find('.menu-help');
    this.items.addEventListener('mousemove', (e) => {
      const index = this.itemIndex(e.target);
      if (index >= 0) onHover(index);
    });
    this.items.addEventListener('click', (e) => {
      const index = this.itemIndex(e.target);
      if (index < 0) return;
      const step = Number(/** @type {HTMLElement} */ (e.target).closest?.('[data-step]')?.dataset.step);
      if (step) onStep(index, step);
      else onClick(index);
    });
    /** The key field of Enter key; the game's keys don't reach the menus while it has the focus. */
    this.keyField = document.createElement('input');
    this.keyField.className = 'menu-key-field';
    this.keyField.spellcheck = false;
    this.keyField.autocomplete = 'off';
    this.keyField.placeholder = this.text('menu.keyPlaceholder');
    this.keyField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSubmit();
      else if (e.key === 'Escape') onBack();
      else return;
      e.preventDefault();
    });
    /** What is shown (menus, selection, settings, notice), so the DOM is only written when it changes. */
    this.shown = null;
    /** The menu ids shown, to know when the items have to be made again. */
    this.menus = null;
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
   * @param {number | null} [leaving] after Start (D110): how far the title
   *   has gone, 0..1 (bootState().logo); null otherwise
   */
  show(flow, leaving = null) {
    const top = flow.top;
    if (!top && leaving !== null && leaving < 1) {
      this.showLeaving(leaving);
      return;
    }
    const menus = flow.stack.map((menu) => menu.id).join('/');
    const state = top ? `${menus}:${top.selected}:${JSON.stringify(flow.settings.values)}:${flow.notice}:${flow.key}:${flow.canContinue}` : '';
    if (state === this.shown) return;
    this.shown = state;
    const opened = menus !== this.menus || flow.key !== this.key || flow.canContinue !== this.canContinue;
    const typing = opened && top?.id === 'enterKey' && !this.menus?.endsWith('enterKey');
    this.menus = menus;
    this.key = flow.key;
    this.canContinue = flow.canContinue;

    this.root.hidden = !top;
    this.root.classList.remove('leaving');
    this.root.style.opacity = '';
    this.logoTitle.textContent = this.text('game.title');
    this.stage.classList.toggle('titled', flow.onTitle);
    if (top?.id !== 'enterKey') this.keyField.blur();
    if (!top) return;
    this.root.classList.toggle('title', flow.onTitle);
    // The logo only on the title's own menu; its panels have a heading.
    this.logo.hidden = top.id !== 'title';
    this.heading.hidden = top.id === 'title';
    this.heading.textContent = this.text(`menu.heading.${top.id}`);
    if (opened) this.fillBody(top.id, flow.key);
    if (typing) {
      this.keyField.value = '';
      this.keyField.focus();
    }

    const ids = flow.items(top.id);
    if (opened) this.items.replaceChildren(...ids.map((id) => this.makeItem(id)));
    ids.forEach((id, i) => {
      const item = this.items.children[i];
      item.classList.toggle('selected', i === top.selected);
      if (isSetting(id)) item.querySelector('.menu-value-text').textContent = settingText((key) => this.text(key), id, flow.settings.get(id));
    });
    this.notice.textContent = flow.notice ? this.text(flow.notice) : '';
    const settings = ids.some(isSetting);
    this.help.textContent = this.text(settings ? 'menu.helpAdjust' : flow.stack.length > 1 || top.id === 'pause' ? 'menu.helpBack' : 'menu.help');
  }

  /**
   * The title going away after Start: the menu gone at once, the logo
   * scrambling into glyphs and fading, the HUD back.
   * @param {number} leaving 0..1
   */
  showLeaving(leaving) {
    this.shown = 'leaving';
    this.menus = null;
    this.root.hidden = false;
    this.root.classList.add('title', 'leaving');
    this.stage.classList.remove('titled');
    this.root.style.opacity = String(1 - leaving);
    const title = this.text('game.title');
    this.logoTitle.textContent = scrambleText(title, Math.round((1 - leaving) * title.length), Math.floor(leaving * 40));
  }

  /** An item: its label, and for a setting its value between ◄ and ►. @param {string} id */
  makeItem(id) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = this.text(`menu.${id}`);
    item.append(label);
    if (!isSetting(id)) return item;
    item.classList.add('setting');
    const value = document.createElement('span');
    value.className = 'menu-value';
    value.innerHTML = '<b data-step="-1">◄</b><span class="menu-value-text"></span><b data-step="1">►</b>';
    item.append(value);
    return item;
  }

  /** What is typed in the key field. */
  keyText() {
    return this.keyField.value;
  }

  /**
   * The text under a menu's heading: the controls table, a note, the key
   * field, the last save's key, or nothing.
   * @param {string} id
   * @param {string | null} key the last save's key (the pause menu shows it)
   */
  fillBody(id, key) {
    this.body.replaceChildren();
    this.body.hidden = !BODIES.includes(id) || (id === 'pause' && !key);
    if (id === 'enterKey') {
      this.body.append(this.text('menu.enterKeyText'), this.keyField);
      return;
    }
    if (id === 'pause') {
      if (!key) return;
      const code = document.createElement('div');
      code.className = 'menu-key';
      code.textContent = key;
      this.body.append(this.text('menu.pauseText'), code);
      return;
    }
    if (id !== 'controls') {
      if (!this.body.hidden) this.body.textContent = this.text(`menu.${id}Text`);
      return;
    }
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
