/**
 * Casting the wizard's spells: what each one does once cast. Functions of
 * the Game (game.js); they change its state and report through
 * game.emit(). A new spell adds its effect to SPELL_EFFECTS.
 */
import { DT } from './core/loop.js';
import { hitEnemy } from './combat.js';
import { Bolt } from './entities/bolt.js';
import { cutTarget, pasteCell } from './entities/clip.js';
import { Enemy } from './entities/enemy.js';
import { createObject } from './entities/kinds.js';
import { pullTarget } from './entities/pull.js';
import { warpTarget } from './entities/warp.js';

/**
 * What each spell does once cast (Player.cast() spent the energy), by
 * spell id; `spell` is its tuning from defs.json. An effect returning false
 * fizzled: the energy goes back (castSpell()).
 */
const SPELL_EFFECTS = {
  /** A bolt from his hands the way he aims (entities/bolt.js); with Zap+ it bounces off walls (D95). */
  zap: (game, spell) => {
    const bounces = game.player.upgrades.get('zap_plus')?.bounces ?? 0;
    game.bolts.push(Bolt.cast(game.player.pos, game.player.aim(), { ...spell, bounces }));
  },
  /** A ring of electricity round him for a while that blocks ranged attacks (D73, D84); with Shield+ it reflects bolts (D95). */
  shield: (game, spell) => game.player.raiseShield('shield', Math.round(spell.duration / DT), game.player.upgrades.has('shield_plus')),
  /** A ring like the Shield that also blocks touch and burns enemies touching it (D84). */
  firewall: (game, spell) => game.player.raiseShield('firewall', Math.round(spell.duration / DT)),
  /** A bolt the way he aims that freezes the first enemy it hits (D85). */
  pause: (game, spell) => game.bolts.push(Bolt.cast(game.player.pos, game.player.aim(), { ...spell, freeze: Math.round(spell.duration / DT) })),
  /** A short teleport the way he aims, hitting the enemies it passes; cut short by a wall, it hurts him (D86). */
  blink: (game, spell) => teleport(game, 'blink', spell),
  /** A teleport the way he aims, as far as the first wall or object, harmless (D86). */
  warp: (game, spell) => teleport(game, 'warp', spell),
  /** Cut the crate or frozen enemy in front of him into his clipboard, or paste what it holds (D87). */
  cut_paste: (game) => cutOrPaste(game),
  /** Pull the first crate or enemy in line one cell towards him (D124). */
  pull: (game, spell) => pull(game, spell),
};

/**
 * The wizard casts his selected spell (the cast action), if he has the
 * energy ('cast'); without it the cast fails ('deny'). Nothing while he
 * cools down from the last cast.
 * @param {import('./game.js').Game} game
 */
export function castSpell(game) {
  const { player } = game;
  const id = player.spell;
  if (!id) return;
  const spell = game.content.spells[id];
  // Pasting costs its own (D87): nothing by default.
  const cost = player.clipboard && spell.pasteCost !== undefined ? spell.pasteCost : spell.cost;
  const result = player.cast(cost, Math.round(spell.cooldown / DT));
  if (result === 'cast' && SPELL_EFFECTS[id](game, spell) === false) {
    player.refund(cost);
    game.emit('fizzle', { spell: id });
    return;
  }
  if (result) game.emit(result, { spell: id });
}

/**
 * Blink or Warp (D86): the wizard teleports the way he aims, level,
 * through open space (entities/warp.js), at most the spell's `range`
 * units (Warp: no limit). Nowhere to go (right against a wall), the
 * spell fizzles. Blink hits every enemy it passes through for its
 * `hitDamage`, and when a wall, an object or the room's side cuts it
 * short he takes its `damage` after landing.
 * @param {import('./game.js').Game} game
 * @param {'blink'|'warp'} id
 * @param {object} spell its tuning from defs.json
 * @returns {boolean} false if it fizzled
 */
function teleport(game, id, { range = Infinity, damage = 0, hitDamage = 0 }) {
  const { player } = game;
  const objects = game.solids.filter((body) => !(body instanceof Enemy));
  const target = warpTarget(player.pos, player.size, player.aim(), range, game.grid, objects, game.liveEnemies);
  if (!target) return false;
  player.teleport(id, target.to);
  game.emit('warp', { spell: id, from: player.warp.from, to: target.to });
  if (hitDamage > 0) for (const enemy of target.passed) hitEnemy(game, enemy, hitDamage, 'blink');
  if (target.cut && damage > 0) game.hurt(damage);
  return true;
}

/**
 * Cut & Paste (D87): with an empty clipboard, cut the crate or frozen
 * enemy in front of him (entities/clip.js) out of the room into it
 * ('cut'); holding something, paste it into the free cell in front of
 * him ('paste'), in this room or another. A pasted crate keeps its
 * integrity; a pasted enemy its integrity, provocation, facing and what
 * was left of its freeze (paused while held), and its patrol path moves
 * with it. Nothing to cut, or no room to paste: it fizzles.
 * @param {import('./game.js').Game} game
 * @returns {boolean} false if it fizzled
 */
function cutOrPaste(game) {
  const { player } = game;
  if (player.clipboard) return paste(game);
  const target = cutTarget(game);
  if (!target) return false;
  const { object, enemy, cell } = target;
  if (object) {
    game.objects.splice(game.objects.indexOf(object), 1);
    game.updateOrder.splice(game.updateOrder.indexOf(object), 1);
    player.clipboard = { kind: 'object', data: object.object, integrity: object.integrity };
  } else {
    game.enemies.splice(game.enemies.indexOf(enemy), 1);
    const { data, integrity, provoked, frozen, facing } = enemy;
    player.clipboard = { kind: 'enemy', data, integrity, provoked, frozen: { ...frozen }, facing };
  }
  player.clip = { mode: 'cut', target: object ?? enemy, tick: 0 };
  game.refreshBodies();
  game.emit('cut', { ...(object ? { object } : { enemy }), cell });
  return true;
}

/**
 * Paste what the wizard holds into the free cell in front of him (D87),
 * as a new object or enemy of this room; it falls from there. See
 * cutOrPaste().
 * @param {import('./game.js').Game} game
 * @returns {boolean} false if there is no room (it fizzled)
 */
function paste(game) {
  const { player } = game;
  const cell = pasteCell(game);
  if (!cell) return false;
  const held = player.clipboard;
  player.clipboard = null;
  const id = `${held.data.id.split('~')[0]}~${++game.pastes}`;
  let target;
  if (held.kind === 'object') {
    target = createObject({ ...held.data, id, at: cell });
    target.integrity = held.integrity;
    game.objects.push(target);
    game.updateOrder.push(target);
    game.emit('paste', { object: target, cell });
  } else {
    const { path } = held.data;
    const offset = cell.map((v, i) => v - held.data.at[i]);
    const moved = path && { ...path, points: path.points.map((point) => point.map((v, i) => v + offset[i])) };
    target = new Enemy({ ...held.data, id, at: cell, ...(moved && { path: moved }) });
    Object.assign(target, { integrity: held.integrity, provoked: held.provoked, frozen: { ...held.frozen }, facing: held.facing });
    game.enemies.push(target);
    game.emit('paste', { enemy: target, cell });
  }
  player.clip = { mode: 'paste', target, tick: 0 };
  game.refreshBodies();
  return true;
}

/**
 * Pull (D124): the first crate or enemy in line the way he aims, within
 * the spell's `range` (entities/pull.js), slides one cell towards him: a
 * crate as if pushed (Pushable.push()), an enemy as if it walked, but over
 * anything (Enemy.pull()), so it may drop into a hole and pop. Pulling an
 * enemy provokes it and alarms it (D81): he gets the blame. Nothing in
 * line, or it can't move (right in front of him, a load on the crate,
 * something in the cell): it fizzles.
 * @param {import('./game.js').Game} game
 * @param {object} spell its tuning from defs.json
 * @returns {boolean} false if it fizzled
 */
function pull(game, { range }) {
  const { player } = game;
  const found = pullTarget(game, range);
  if (!found) return false;
  const { object, enemy, dir, cell } = found;
  if (object && !object.push(dir, game)) return false;
  if (enemy) {
    if (!enemy.pull(dir, game)) return false;
    enemy.provoke();
    if (enemy.alarm(player)) game.emit('alert', { enemy });
  }
  player.pull = { target: object ?? enemy, tick: 0 };
  game.emit('pull', { ...(object ? { object } : { enemy }), cell });
  return true;
}
