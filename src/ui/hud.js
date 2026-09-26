/**
 * The HUD: a DOM overlay on the stage with the integrity bar, the energy
 * bar, the room name banner, terminal messages and the fullscreen hint. It only shows state;
 * main.js feeds it every frame. Sizes use --u (one pixel at 1080p), so it
 * scales with the stage. All text comes from data/strings.json; terminal
 * messages and banners arrive through say() and announce()
 * (core/messages.js) from any module.
 */
import { takeAnnouncements, takeMessages } from '../core/messages.js';
import { GAME_VERSION } from '../core/version.js';
import { EnergyBar } from './energy-bar.js';
import { HINT_SECONDS } from './fullscreen.js';
import { Terminal, bannerState } from './terminal.js';
import { formatText, scrambleText } from './text.js';

/** Integrity at or below this blinks as a warning. */
const LOW_INTEGRITY = 2;

export class Hud {
  /**
   * @param {HTMLElement} root the renderer's HUD overlay
   * @param {Record<string, string>} strings
   */
  constructor(root, strings) {
    this.strings = strings;
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hud-integrity"><div class="hud-label"></div><div class="hud-cells"></div></div>
      <div class="brand"><span class="brand-title"></span> <span class="brand-version"></span></div>
      <div class="hud-banner"><div class="hud-banner-title"></div><div class="hud-banner-sub"></div></div>
      <div class="hud-terminal"></div>
      <div class="hud-hint"></div>
      <div class="hud-movement"></div>`,
    );
    const find = (selector) => root.querySelector(selector);
    find('.hud-label').textContent = this.text('hud.integrity');
    find('.brand-title').textContent = this.text('game.title');
    find('.brand-version').textContent = this.text('game.version', { version: GAME_VERSION });
    find('.hud-hint').textContent = this.text('hint.fullscreen');
    this.integrityBox = find('.hud-integrity');
    this.cellBox = find('.hud-cells');
    this.banner = find('.hud-banner');
    this.bannerTitle = find('.hud-banner-title');
    this.bannerSub = find('.hud-banner-sub');
    this.terminalBox = find('.hud-terminal');
    this.hint = find('.hud-hint');
    this.movementTag = find('.hud-movement');
    this.movementMode = null;
    this.energy = new EnergyBar(root, this.text('hud.energy'));

    this.cells = [];
    this.integrity = null;
    this.terminal = new Terminal();
    /** Seconds since the banner appeared; null when there is none. */
    this.bannerTime = null;
    this.bannerText = '';
    this.frame = 0;
    this.hintWanted = false;
    this.hintLeft = 0;
  }

  /** Text for a string key, with values filled in. */
  text(key, values) {
    return formatText(this.strings, key, values);
  }

  /**
   * Show integrity as a row of cells; lost cells flash as they empty.
   * @param {number} value
   * @param {number} max
   */
  setIntegrity(value, max) {
    if (value === this.integrity && this.cells.length === max) return;
    while (this.cells.length < max) {
      const cell = document.createElement('i');
      this.cellBox.append(cell);
      this.cells.push(cell);
    }
    this.cells.forEach((cell, i) => {
      const full = i < value;
      // Restart the flash animation on cells that were full a moment ago.
      if (!full && this.integrity !== null && i < this.integrity) {
        cell.classList.remove('lost');
        void cell.offsetWidth;
        cell.classList.add('lost');
      }
      if (full) cell.classList.remove('lost');
      cell.classList.toggle('full', full);
    });
    this.integrityBox.classList.toggle('low', value > 0 && value <= LOW_INTEGRITY);
    this.integrity = value;
  }

  /**
   * Show energy in segments of one cast each.
   * @param {number} value
   * @param {number} max
   * @param {number} cost energy per cast
   */
  setEnergy(value, max, cost) {
    this.energy.set(value, max, cost);
  }

  /** A cast failed for lack of energy: flash the energy bar. */
  denyEnergy() {
    this.energy.deny();
  }

  /**
   * Persistent corner tag naming the active movement scheme (D38).
   * @param {'grid'|'screen'} mode
   */
  setMovementMode(mode) {
    if (mode === this.movementMode) return;
    this.movementMode = mode;
    this.movementTag.textContent = this.text(mode === 'screen' ? 'hud.movementScreen' : 'hud.movementGrid');
  }

  /**
   * Show a banner (see announce() in core/messages.js), replacing the one showing.
   * @param {{ key: string, values?: object, sub?: string, subValues?: object, color?: string }} banner
   */
  showBanner({ key, values, sub, subValues, color }) {
    this.bannerText = this.text(key, values).toUpperCase();
    this.bannerSub.textContent = sub ? this.text(sub, subValues).toUpperCase() : '';
    if (color) this.banner.style.setProperty('--banner', color);
    else this.banner.style.removeProperty('--banner');
    this.bannerTime = 0;
  }

  /**
   * Show or hide the fullscreen hint; each time it becomes needed it stays
   * up for HINT_SECONDS.
   * @param {boolean} wanted
   */
  setHintWanted(wanted) {
    if (wanted && !this.hintWanted) this.hintLeft = HINT_SECONDS;
    this.hintWanted = wanted;
  }

  /** @param {number} dt seconds since the last frame */
  update(dt) {
    this.frame++;

    for (const { key, values } of takeMessages()) this.terminal.push(this.text(key, values));
    this.terminal.update(dt);
    const banner = takeAnnouncements().at(-1);
    if (banner) this.showBanner(banner);
    const lines = this.terminal.lines();
    while (this.terminalBox.children.length < lines.length) this.terminalBox.append(document.createElement('div'));
    while (this.terminalBox.children.length > lines.length) this.terminalBox.firstChild.remove();
    lines.forEach((line, i) => {
      const element = this.terminalBox.children[i];
      // Only write what changed: most frames nothing does.
      if (element.textContent !== line.text) element.textContent = line.text;
      element.classList.toggle('typing', line.typing);
      const opacity = String(line.opacity);
      if (element.style.opacity !== opacity) element.style.opacity = opacity;
    });

    if (this.bannerTime !== null) {
      this.bannerTime += dt;
      const { decoded, opacity } = bannerState(this.bannerTime);
      // New glyphs every other frame, so the decoding flickers but stays readable.
      const shown = Math.floor(decoded * this.bannerText.length);
      this.bannerTitle.textContent = scrambleText(this.bannerText, shown, this.frame >> 1);
      this.bannerSub.style.opacity = String(decoded);
      this.banner.style.opacity = String(opacity);
      if (opacity === 0) this.bannerTime = null;
    }

    this.hintLeft = Math.max(0, this.hintLeft - dt);
    this.hint.classList.toggle('shown', this.hintWanted && this.hintLeft > 0);
  }
}
