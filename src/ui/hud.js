/**
 * The HUD: a DOM overlay on the stage with the integrity bar, the backups
 * under it, the energy bar with the selected spell under it (and the
 * Cut & Paste clipboard), the score and completion under the title (D100),
 * the key fragments and access level under them, the end-of-game screen
 * (D101), the room name banner, terminal messages and the fullscreen
 * hint. It only shows state;
 * main.js feeds it every frame. Sizes use --u (one pixel at 1080p), so it
 * scales with the stage. All text comes from data/strings.json; terminal
 * messages and banners arrive through say() and announce()
 * (core/messages.js) from any module.
 */
import { takeAnnouncements, takeMessages } from '../core/messages.js';
import { GAME_VERSION } from '../core/version.js';
import { clipIcon } from './clip-icon.js';
import { EnergyBar } from './energy-bar.js';
import { HINT_SECONDS } from './fullscreen.js';
import { Terminal, bannerState } from './terminal.js';
import { formatText, scrambleText } from './text.js';
import { BOOT_KEY_SIZE, keyModule } from '../world/boot-key.js';

/** Integrity at or below this blinks as a warning. */
const LOW_INTEGRITY = 2;

/** The score rolling up to a new value (D100): seconds it takes. */
export const SCORE_ROLL = 0.9;

/**
 * The score shown `t` seconds into a roll from `from` to `to`: fast at
 * first, settling on the new value (ease out), whole points only.
 * @param {number} from
 * @param {number} to
 * @param {number} t
 */
export function rollScore(from, to, t) {
  const k = Math.min(1, Math.max(0, t / SCORE_ROLL));
  return Math.round(from + (to - from) * (1 - (1 - k) ** 3));
}

/**
 * The boot key's 64 cells in `box`, row by row.
 * @param {HTMLElement} box
 * @returns {HTMLElement[]}
 */
function keyCells(box) {
  const cells = [];
  for (let i = 0; i < BOOT_KEY_SIZE * BOOT_KEY_SIZE; i++) {
    const cell = document.createElement('i');
    box.append(cell);
    cells.push(cell);
  }
  return cells;
}

/**
 * Show the boot key with the fragments `found`: a found dark module
 * filled, a found light one outlined, one not found yet a faint dot.
 * @param {HTMLElement[]} cells from keyCells()
 * @param {Set<number>} found slots
 */
function showKey(cells, found) {
  cells.forEach((cell, slot) => {
    const state = found.has(slot) ? (keyModule(slot).dark ? 'dark' : 'light') : '';
    if (cell.className !== state) cell.className = state;
  });
}

export class Hud {
  /**
   * @param {HTMLElement} root the renderer's HUD overlay
   * @param {Record<string, string>} strings
   */
  constructor(root, strings, { pauseColor = '#c9a2ff' } = {}) {
    this.strings = strings;
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hud-integrity"><div class="hud-label"></div><div class="hud-cells"></div></div>
      <div class="hud-backups"><span class="hud-backups-label"></span><span class="hud-pips"></span></div>
      <div class="brand"><span class="brand-title"></span> <span class="brand-version"></span></div>
      <div class="hud-score"><span class="hud-score-label"></span><span class="hud-score-value"></span><span class="hud-score-done"></span></div>
      <div class="hud-fragments" hidden><div class="hud-fragments-line"><span class="hud-fragments-label"></span><span class="hud-fragments-value"></span><span class="hud-access"></span></div><div class="hud-key"></div></div>
      <div class="hud-win" hidden><div class="hud-win-title"></div><div class="hud-key hud-win-key"></div><div class="hud-win-text"></div><div class="hud-win-score"></div><div class="hud-win-continue"></div></div>
      <div class="hud-banner"><div class="hud-banner-title"></div><div class="hud-banner-sub"></div></div>
      <div class="hud-terminal"></div>
      <div class="hud-hint"></div>
      <div class="hud-movement"></div>`,
    );
    const find = (selector) => root.querySelector(selector);
    find('.hud-label').textContent = this.text('hud.integrity');
    find('.hud-backups-label').textContent = this.text('hud.backups');
    find('.hud-score-label').textContent = this.text('hud.score');
    find('.hud-fragments-label').textContent = this.text('hud.fragments');
    find('.hud-win-title').textContent = this.text('win.title');
    find('.hud-win-text').textContent = this.text('win.text');
    find('.hud-win-continue').textContent = this.text('win.continue');
    find('.brand-title').textContent = this.text('game.title');
    find('.brand-version').textContent = this.text('game.version', { version: GAME_VERSION });
    find('.hud-hint').textContent = this.text('hint.fullscreen');
    this.integrityBox = find('.hud-integrity');
    this.cellBox = find('.hud-cells');
    this.pipBox = find('.hud-pips');
    this.pips = [];
    this.backups = null;
    this.banner = find('.hud-banner');
    this.bannerTitle = find('.hud-banner-title');
    this.bannerSub = find('.hud-banner-sub');
    this.terminalBox = find('.hud-terminal');
    this.hint = find('.hud-hint');
    this.movementTag = find('.hud-movement');
    this.scoreBox = find('.hud-score');
    this.scoreValue = find('.hud-score-value');
    this.scoreDone = find('.hud-score-done');
    this.fragmentBox = find('.hud-fragments');
    this.fragmentValue = find('.hud-fragments-value');
    this.accessTag = find('.hud-access');
    /** What the fragment line shows (found/total/level), so it is only written when it changes. */
    this.fragmentsShown = null;
    this.winBox = find('.hud-win');
    this.winScore = find('.hud-win-score');
    /** The boot key's cells (D101), in the corner and on the end screen, by fragment slot. */
    this.keyCells = keyCells(find('.hud-fragments .hud-key'));
    this.winKeyCells = keyCells(find('.hud-win-key'));
    /** The score to show, the one shown, and the roll towards it: { from, time } or null. */
    this.score = null;
    this.shownScore = 0;
    this.roll = null;
    this.done = null;
    this.movementMode = null;
    this.energy = new EnergyBar(root, this.text('hud.energy'));
    root.insertAdjacentHTML('beforeend', '<div class="hud-spell"><span class="hud-spell-name"></span><span class="hud-clip" hidden></span><span class="hud-spell-key"></span></div>');
    this.spellBox = find('.hud-spell');
    this.spellName = find('.hud-spell-name');
    this.spellKey = find('.hud-spell-key');
    this.spellKey.textContent = this.text('hud.spellSwitch');
    this.spell = null;
    this.clipBox = find('.hud-clip');
    /** What the clipboard slot shows (clipIcon() markup), or null while it is hidden. */
    this.clipShown = null;
    this.pauseColor = pauseColor;

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
    // Fewer after a new game (buffs gone).
    while (this.cells.length > max) this.cells.pop().remove();
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
   * Show the backups (D97) as a row of pips under the integrity bar; a
   * lost one flashes as it empties.
   * @param {number} value backups left
   * @param {number} max
   */
  setBackups(value, max) {
    if (value === this.backups && this.pips.length === max) return;
    while (this.pips.length < max) {
      const pip = document.createElement('i');
      this.pipBox.append(pip);
      this.pips.push(pip);
    }
    this.pips.forEach((pip, i) => {
      const full = i < value;
      if (!full && this.backups !== null && i < this.backups) {
        pip.classList.remove('lost');
        void pip.offsetWidth;
        pip.classList.add('lost');
      }
      if (full) pip.classList.remove('lost');
      pip.classList.toggle('full', full);
    });
    this.pipBox.parentElement.classList.toggle('none', value === 0);
    this.backups = value;
  }

  /**
   * Show energy in segments of 10 (D72). Hidden while he knows no spell:
   * energy is only for spells.
   * @param {number} value
   * @param {number} max
   * @param {boolean} shown whether he knows a spell
   */
  setEnergy(value, max, shown) {
    this.energy.box.hidden = !shown;
    if (shown) this.energy.set(value, max);
  }

  /**
   * The selected spell, under the energy bar; the switch key shows only
   * when he knows more than one. A new selection flashes. Hidden while he
   * knows no spell (before the first data disk).
   * @param {string|null} spell spell id
   * @param {number} known how many spells he knows
   * @param {string} [nameKey] its name's string: "spell.<id>", or its
   *   upgrade's (ZAP+, D95; Game.spellNameKey()); a new name flashes too
   */
  setSpell(spell, known, nameKey = `spell.${spell}`) {
    this.spellKey.hidden = known < 2;
    this.spellBox.hidden = spell === null;
    const shown = spell === null ? null : nameKey;
    if (shown === this.spell) return;
    const first = this.spell === null;
    this.spell = shown;
    if (spell === null) return;
    this.spellName.textContent = this.text(nameKey);
    if (first) return;
    this.spellBox.classList.remove('switched');
    void this.spellBox.offsetWidth; // restart the animation
    this.spellBox.classList.add('switched');
  }

  /**
   * The Cut & Paste clipboard (D87): a slot after the spell tag while the
   * spell is selected, empty or with an icon of what he holds.
   * @param {boolean} shown whether Cut & Paste is selected
   * @param {object|null} held Player.clipboard
   */
  setClipboard(shown, held) {
    const icon = shown ? clipIcon(held, this.pauseColor) : null;
    if (icon === this.clipShown) return;
    this.clipShown = icon;
    this.clipBox.hidden = icon === null;
    this.clipBox.innerHTML = icon ?? '';
  }

  /**
   * The score and how much of the world's permanent pickups he has found
   * (D100). A new score rolls up to its value and flashes while it rolls
   * (update()); the first one shows at once.
   * @param {number} score
   * @param {number} percent 0-100
   */
  setScore(score, percent) {
    if (percent !== this.done) {
      this.done = percent;
      this.scoreDone.textContent = `${percent}%`;
    }
    if (score === this.score) return;
    const first = this.score === null;
    this.score = score;
    if (first) {
      this.showScore(score);
      return;
    }
    this.roll = { from: this.shownScore, time: 0 };
    this.scoreBox.classList.add('rolling');
  }

  /**
   * Key fragments found and his access level (D101), under the score:
   * `FRAGMENTS 03/64 ACCESS 1` over the boot key, the 8×8 code the
   * fragments make up, each found one showing its module. Hidden until he
   * has a fragment or a level.
   * @param {number[]} slots the fragments found, by slot
   * @param {number} total fragments the core needs
   * @param {number} level
   */
  setFragments(slots, total, level) {
    const found = slots.length;
    const shown = `${slots.join(',')}/${total}/${level}`;
    if (shown === this.fragmentsShown) return;
    this.fragmentsShown = shown;
    showKey(this.keyCells, new Set(slots));
    this.fragmentBox.hidden = found === 0 && level === 0;
    this.fragmentValue.textContent = `${String(found).padStart(String(total).length, '0')}/${total}`;
    this.accessTag.textContent = level > 0 ? `${this.text('hud.access')} ${level}` : '';
  }

  /**
   * Forget the last game (a new one starts, ui/menus.js): its terminal
   * lines, banner and end screen go, messages still queued are dropped,
   * and the next score, integrity and backups show at once, without a
   * roll or a flash.
   */
  clear() {
    takeMessages();
    takeAnnouncements();
    this.terminal = new Terminal();
    this.terminalBox.replaceChildren();
    this.bannerTime = null;
    this.banner.style.opacity = '0';
    this.hideWin();
    this.score = null;
    this.roll = null;
    this.scoreBox.classList.remove('rolling');
    this.integrity = null;
    this.backups = null;
  }

  /** Is the end-of-game screen up? */
  get winShown() {
    return !this.winBox.hidden;
  }

  /**
   * The end-of-game screen (D101, a placeholder for a real ending): the
   * Grid rebooted, the final score and completion; `confirm` closes it
   * (main.js) and he plays on.
   * @param {number} score
   * @param {number} percent 0-100
   */
  showWin(score, percent) {
    showKey(this.winKeyCells, new Set(this.winKeyCells.keys()));
    this.winScore.textContent = `${this.text('win.score')} ${String(score).padStart(6, '0')}  ${percent}% ${this.text('win.done')}`;
    this.winBox.hidden = false;
  }

  hideWin() {
    this.winBox.hidden = true;
  }

  /** @param {number} value */
  showScore(value) {
    this.shownScore = value;
    this.scoreValue.textContent = String(value).padStart(6, '0');
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

    if (this.roll) {
      this.roll.time += dt;
      const value = rollScore(this.roll.from, this.score, this.roll.time);
      if (value !== this.shownScore) this.showScore(value);
      if (this.roll.time >= SCORE_ROLL) {
        this.roll = null;
        this.scoreBox.classList.remove('rolling');
      }
    }

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
