// Headless play helper for the room-design skill: play a room's solution
// tick by tick (timing, bounces, races the reachability checker can't see).
// Import it by absolute path from a scratch script (never a committed test:
// tests must not depend on rooms the author may flag, CLAUDE.md §10):
//   import { startRoom } from '/abs/path/.claude/skills/room-design/scripts/sim.mjs';
//   const sim = startRoom('cold_stairs', { abilities: ['zap', 'pause'] });
//   sim.walkTo([2.5, 0, 3.5]);                 // straight line, x then z
//   sim.cast('pause'); sim.run(20);            // select the spell, cast, wait
//   sim.log('after freeze');
// Directions: down +x, up -x, right -z, left +z (screen-diagonal axes).
import { fileURLToPath } from 'node:url';
import { readDataFiles } from '../../../../tools/check-data.js';
import { loadGameData } from '../../../../src/data/load.js';
import { Game } from '../../../../src/game.js';
import { pauseEnemy } from '../../../../src/combat.js';
import { Progress, saveBit } from '../../../../src/world/progress.js';

export { pauseEnemy };

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * A game in room `id`, the wizard at its spawn point (or `at`).
 * @param {string} id room id
 * @param {object} [options]
 * @param {string[]} [options.abilities] spell ids (defs.json spells) and/or 'double_jump'
 * @param {number[]} [options.at] feet-center point to place him at instead of the spawn
 */
export function startRoom(id, { abilities = [], at } = {}) {
  const content = loadGameData(readDataFiles(ROOT).files);
  const bits = abilities.map((name) => {
    if (content.spells[name]) return saveBit('spells', content.spells[name].slot);
    const upgrade = Object.values(content.pickupTypes).find((t) => t.kind === 'upgrade' && t.upgrade === name);
    if (upgrade) return saveBit('upgrades', upgrade.slot);
    throw new Error(`unknown ability "${name}"`);
  });
  const game = new Game(content, { start: id, progress: new Progress(bits) });
  if (at) game.player.place(at);
  let tick = 0;
  const events = [];

  /** One tick holding `held` actions and tapping `tap` actions; returns its events. */
  const step = (held = [], tap = []) => {
    const out = game.update({ down: (a) => held.includes(a) || tap.includes(a), pressed: (a) => tap.includes(a) });
    tick++;
    events.push(...out);
    return out;
  };
  /** `n` ticks holding `held`. */
  const run = (n, held = []) => {
    for (let i = 0; i < n; i++) step(held);
  };
  /** Hold `held` until `done()` (max ticks, then throw: a stuck run is a finding). */
  const until = (done, held = [], max = 600) => {
    for (let i = 0; i < max; i++) {
      if (done()) return;
      step(held);
    }
    throw new Error(`until: not done after ${max} ticks at [${game.player.pos.map((v) => v.toFixed(2))}]`);
  };
  /** Walk along x, then along z, to within 0.1 of `target` (feet-center). */
  const walkTo = ([x, , z]) => {
    const p = game.player.pos;
    until(() => Math.abs(p[0] - x) < 0.1, [p[0] < x ? 'down' : 'up']);
    until(() => Math.abs(p[2] - z) < 0.1, [p[2] < z ? 'left' : 'right']);
  };
  /** Select `spell` (Tab cycle) and cast it; returns the cast tick's events. */
  const cast = (spell) => {
    for (let i = 0; i < 16 && game.player.spell !== spell; i++) step([], ['spellNext']);
    if (game.player.spell !== spell) throw new Error(`he doesn't know "${spell}"`);
    return step([], ['cast']);
  };
  /** One line of state: tick, seconds, position, integrity, energy, gates, pickups. */
  const log = (label = '') => {
    const p = game.player;
    const gates = game.objects.filter((o) => o.kind === 'gate').map((g) => `${g.id ?? g.pos}:${g.state}`);
    const pickups = game.pickups.map((pk) => `${pk.data.id}:${pk.state}`);
    console.log(`${label} t=${tick} (${(tick / 60).toFixed(2)}s) room=${game.room.id} pos=[${p.pos.map((v) => v.toFixed(2))}] int=${p.integrity} en=${Math.round(p.energy)} gates=[${gates}] pickups=[${pickups}]`);
  };

  return { game, content, step, run, until, walkTo, cast, log, events, get tick() { return tick; } };
}
