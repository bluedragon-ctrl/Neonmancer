// Push-puzzle solver for the sokoban-design skill: the room's whole crate
// state space, searched breadth first with the reachability checker's own
// rules (src/world/reach.js: he climbs crates and 1-high blocks, jumps
// 1-tile gaps, crates fall off ledges and plug holes, a spiked crate's top
// is no place to stand unless a crate covers it (D199), gates follow their
// switches). For each goal it prints the fewest pushes and the pushes
// themselves, and how unforgiving the room is: how many configurations
// can no longer reach the goal (traps: only a reset gets him out), and
// where along the solution a wrong push is a trap.
//   node .claude/skills/sokoban-design/scripts/solve.mjs <room_id | room.json | level.xsb>
//        [--level N] [--wall H|hole] [--streams thin] [--xsb-goal plate|socket] [--exit side:at[:y]] [--spiked] [--with a,b] [--from exit] [--goal g] [--max N]
// --level, --wall, --streams, --exit, --spiked: for an .xsb file, as in xsb.mjs; --xsb-goal is xsb.mjs's --goal
// --goal: switches (every plate and socket on at once), exit:<id>, pickup:<id>
//   (default: every exit and pickup, and switches when the room has any)
// --with: abilities (default none: pushes only; Pull and Cut & Paste moves show as spells)
// --max: most configurations searched (default 200000)
// Pushes read "crate_1 [3,0,2] +x (down)": the crate, where it stood, the
// way it went, and the key that pushes it (down +x, up -x, right -z, left +z).
// Walking is free and not counted; time races with room-design's sim.mjs.
// As a module: solve(data, content, options) for survey.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDataFiles } from '../../../../tools/check-data.js';
import { loadGameData } from '../../../../src/data/load.js';
import { buildRoom } from '../../../../src/world/room.js';
import { RoomModel, arrivalCells, collect, standsIn } from '../../../../src/world/reach.js';
import { parseXsb, wallOption, xsbToRoom } from './xsb.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The game's data (defs, biomes) the solver builds rooms with. */
export function loadContent() {
  return loadGameData(readDataFiles(ROOT).files);
}

const DIRS = [
  [1, 0, '+x (down)'],
  [-1, 0, '-x (up)'],
  [0, 1, '+z (left)'],
  [0, -1, '-z (right)'],
];

/**
 * @typedef {object} GoalResult
 * @property {string} goal
 * @property {number|null} pushes fewest pushes, null: unsolvable
 * @property {string[]} moves the pushes, described
 * @property {number} traps states that can't reach the goal any more
 * @property {string[]} steps "safe/all" pushes at each step of the solution
 * @property {number} decisions sharp steps: half or more of the pushes there are traps
 * @property {string[]} trap the shortest way into a trap
 */

/**
 * Solve a room's push puzzle.
 * @param {object} data room JSON (data/rooms shape)
 * @param {object} content loadContent()
 * @param {{ abilities?: string[], from?: string|null, goal?: string|null, max?: number }} [options]
 * @returns {{ id: string, configs: number, truncated: boolean, goals: GoalResult[] }}
 */
export function solve(data, content, { abilities = [], from = null, goal = null, max = 200000 } = {}) {
  const have = new Set(abilities);
  const room = buildRoom(data, content);
  const tuning = { scanRange: content.spells.scan?.range, blinkRange: content.spells.blink?.range };
  const model = new RoomModel(room, have, tuning);
  const starts = from ? arrivalCells(room, from) : [[Math.floor(room.spawn[0]), Math.round(room.spawn[1]), Math.floor(room.spawn[2])]];

  // Goals: what each configuration lets him touch.
  const hasSwitches = model.switches.some((s) => s.kind !== 'target');
  const goals = goal
    ? [goal]
    : [...(hasSwitches ? ['switches'] : []), ...room.exits.map((e) => `exit:${e.id}`), ...room.pickups.map((p) => `pickup:${p.id}`)];
  if (goals.length === 0) throw new Error('nothing to solve: no switches, exits or pickups (give --goal)');
  const hits = (cfg, stands) => {
    const reach = { pickups: new Set(), exits: Object.fromEntries(room.exits.map((e) => [e.id, false])), core: false };
    collect(model, cfg, stands, reach);
    return goals.filter((g) => {
      const [kind, id] = g.split(':');
      if (kind === 'switches') return model.forcedOn(null, cfg) || model.canPower(null, cfg, stands);
      return kind === 'exit' ? reach.exits[id] : reach.pickups.has(id);
    });
  };

  /** Pushes from a configuration: { cfg, move: { from, cell | plug, dir } }. */
  const pushes = (cfg, stands) => {
    const out = [];
    for (const c of cfg.crates) {
      const [x, y, z] = model.cell(c);
      if (cfg.crateSet.has(model.index(x, y + 1, z))) continue; // only the top of a stack moves
      for (const [dx, dz, dir] of DIRS) {
        if (!model.grid.isInside(x - dx, z - dz) || !stands.has(model.index(x - dx, y, z - dz)) || model.blockedCrate(x + dx, y, z + dz, cfg)) continue;
        const crates = cfg.crates.filter((o) => o !== c);
        const spiked = new Set(cfg.spiked); // a spiked crate stays spiked, unless it plugs a hole (D199)
        const wasSpiked = spiked.delete(c);
        const rest = model.settle(x + dx, y, z + dz, model.config(crates, cfg.plugged, spiked));
        const next =
          rest.plug !== undefined
            ? model.config(crates, new Set([...cfg.plugged, rest.plug]), spiked)
            : model.config([...crates, rest.cell], cfg.plugged, wasSpiked ? new Set([...spiked, rest.cell]) : spiked);
        out.push({ cfg: next, move: { from: c, ...rest, dir, back: [-dx, -dz] } });
      }
    }
    // Spell moves (Pull, Cut & Paste) the push list doesn't have.
    if (have.size) {
      const keys = new Set(out.map((o) => o.cfg.key));
      for (const next of model.successors(cfg, stands)) if (!keys.has(next.key)) out.push({ cfg: next, move: { spell: true } });
    }
    return out;
  };

  // Breadth first over states: the crates and where he is (after a push he
  // stands where the crate stood; a state is keyed by the lowest cell he can
  // reach from there). Every node keeps its parent and what it reaches.
  const region = (cfg, at) => {
    const stands = standsIn(model, cfg, at);
    return { stands, key: `${cfg.key}#${stands.size ? Math.min(...stands) : at.join()}` };
  };
  const pushedFrom = ({ from, back }) => {
    const [x, y, z] = model.cell(from);
    return model.blocked(x, y, z, model.config([], new Set())) ? [x + back[0], y, z + back[1]] : [x, y, z];
  };
  const first = model.config(model.crates, new Set(), model.spiked);
  const root = region(first, starts);
  const nodes = new Map([[root.key, { cfg: first, at: starts, parent: null, move: null, depth: 0, hits: [], next: [] }]]);
  const queue = [root.key];
  let truncated = false;
  for (let q = 0; q < queue.length; q++) {
    const node = nodes.get(queue[q]);
    const stands = standsIn(model, node.cfg, node.at);
    node.hits = hits(node.cfg, stands);
    for (const { cfg, move } of pushes(node.cfg, stands)) {
      // After a push he stands where the crate stood, or behind that cell when it is a crate stream (D198).
      const at = move.spell ? node.at : [pushedFrom(move)];
      const { key } = region(cfg, at);
      node.next.push(key);
      if (nodes.has(key)) continue;
      if (nodes.size >= max) {
        truncated = true;
        continue;
      }
      nodes.set(key, { cfg, at, parent: queue[q], move, depth: node.depth + 1, hits: [], next: [] });
      queue.push(key);
    }
  }

  // Crate names along a path: replay the moves from the room's crates.
  const crateIds = new Map(room.objects.filter((o) => o.kind === 'pushable').map((o) => [model.index(...o.at), o.id]));
  const pathTo = (key) => {
    const keys = [];
    for (let k = key; k !== null; k = nodes.get(k).parent) keys.unshift(k);
    return keys;
  };
  const describe = (keys) => {
    const names = new Map(crateIds);
    return keys.slice(1).map((k) => {
      const { move, cfg } = nodes.get(k);
      if (move.spell) return '(a spell move)';
      const name = names.get(move.from) ?? 'crate';
      names.delete(move.from);
      let end;
      if (move.plug !== undefined) end = `plugs hole [${move.plug % model.w},${Math.floor(move.plug / model.w)}]`;
      else {
        names.set(move.cell, name);
        const [x, y, z] = model.cell(move.cell);
        const [, fy] = model.cell(move.from);
        const stacked = y > 0 && cfg.crateSet.has(model.index(x, y - 1, z));
        end = [y < fy && `falls to y ${y}`, stacked && 'lands on a crate'].filter(Boolean).join(', ');
      }
      return `${name} [${model.cell(move.from)}] ${move.dir}${end ? `, ${end}` : ''}`;
    });
  };

  // Which nodes can still reach a goal (backwards from the nodes that touch it).
  const parentsOf = new Map();
  for (const [key, node] of nodes) for (const n of node.next) if (nodes.has(n)) (parentsOf.get(n) ?? parentsOf.set(n, []).get(n)).push(key);
  const alive = (g) => {
    const live = new Set();
    const todo = [...nodes].filter(([, n]) => n.hits.includes(g)).map(([k]) => k);
    for (const k of todo) live.add(k);
    while (todo.length) for (const p of parentsOf.get(todo.pop()) ?? []) if (!live.has(p)) live.add(p) && todo.push(p);
    return live;
  };

  const results = goals.map((g) => {
    // Breadth first: the first node in the queue that touches the goal is a shortest solution.
    const first = queue.find((k) => nodes.get(k).hits.includes(g));
    if (!first) return { goal: g, pushes: null, moves: [], traps: nodes.size, steps: [], decisions: 0, trap: [] };
    const live = alive(g);
    const keys = pathTo(first);
    // Along the solution: how many pushes there are, and how many of them keep the goal.
    const counts = keys.slice(0, -1).map((k) => {
      const next = nodes.get(k).next.filter((n) => nodes.has(n));
      return [next.filter((n) => live.has(n)).length, next.length];
    });
    const trap = queue.find((k) => !live.has(k));
    return {
      goal: g,
      pushes: nodes.get(first).depth,
      moves: describe(keys),
      traps: nodes.size - live.size,
      steps: counts.map(([safe, all]) => `${safe}/${all}`),
      decisions: counts.filter(([safe, all]) => safe * 2 <= all).length,
      trap: trap ? describe(pathTo(trap)) : [],
    };
  });
  return { id: data.id, configs: nodes.size, truncated, goals: results };
}

/** Room data from a room id, a room .json file or a level of an .xsb file. */
export function roomFrom(source, content, { level = 1, wall, goal, exits, streams, spiked } = {}) {
  if (source.endsWith('.xsb')) {
    const levels = parseXsb(fs.readFileSync(source, 'utf8'));
    const found = levels[level - 1];
    if (!found) throw new Error(`${source}: no level ${level} (${levels.length} levels)`);
    return { data: xsbToRoom(found, { wall, goal, exits, streams, spiked }), title: found.title };
  }
  const data = source.endsWith('.json') ? JSON.parse(fs.readFileSync(source, 'utf8')) : content.rooms.get(source);
  if (!data) throw new Error(`no room "${source}"`);
  return { data, title: '' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const valued = ['--level', '--wall', '--streams', '--xsb-goal', '--exit', '--with', '--from', '--goal', '--max'];
  const option = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const source = argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
  if (!source) {
    console.error('usage: node solve.mjs <room_id | room.json | level.xsb> [--level N] [--wall H|hole] [--streams thin] [--xsb-goal plate|socket] [--exit side:at[:y]] [--spiked] [--with a,b] [--from exit] [--goal g] [--max N]');
    process.exit(1);
  }
  const content = loadContent();
  const exits = argv.flatMap((a, i) => (a === '--exit' ? [argv[i + 1]] : []));
  const { data, title } = roomFrom(source, content, {
    level: Number(option('--level') ?? 1),
    wall: wallOption(option('--wall')),
    goal: option('--xsb-goal') ?? undefined,
    streams: option('--streams') ?? undefined,
    exits: exits.length ? exits : undefined,
    spiked: argv.includes('--spiked'),
  });
  if (title) console.log(`; ${title}`);
  const abilities = (option('--with') ?? '').split(',').filter(Boolean);
  const from = option('--from');
  const max = Number(option('--max') ?? 200000);
  const result = solve(data, content, { abilities, from, goal: option('--goal'), max });
  console.log(
    `${result.id}: ${result.configs} state(s) searched (crates + where he is)${result.truncated ? ` (stopped at --max ${max}: verdicts may miss solutions)` : ''}, abilities: ${abilities.join(', ') || 'none'}${from ? `, from ${from}` : ''}`,
  );
  for (const r of result.goals) {
    if (r.pushes === null) {
      console.log(`\n${r.goal}: UNSOLVABLE`);
      continue;
    }
    console.log(`\n${r.goal}: ${r.pushes} push(es)${r.pushes === 0 ? ' (free: no puzzle)' : ''}`);
    r.moves.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
    console.log(`  traps: ${r.traps} of ${result.configs} state(s) can't reach it any more (${Math.round((100 * r.traps) / result.configs)}%)${result.truncated ? ' (search cut off: an overcount)' : ''}`);
    if (r.steps.length) console.log(`  safe pushes / all pushes at each step: ${r.steps.join(' ')} (${r.decisions} sharp: half or more are traps)`);
    if (r.trap.length) console.log(`  shortest way into a trap: ${r.trap.join('; ')}`);
  }
}
