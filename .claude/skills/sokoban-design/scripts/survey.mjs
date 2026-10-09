// Survey a collection of XSB levels for the sokoban-design skill: solve
// every level under classic Sokoban rules and under Neonmancer's, in each
// way a level can be built in the game, and print a Markdown table.
//   node .claude/skills/sokoban-design/scripts/survey.mjs <file.xsb> [--levels 1-40] [--max N] [--spiked-only] [--out file.md]
// Translations (columns): walls as 3-high blocks (he can't climb them),
// 1-high ledges (he walks over, crates stop) or holes (he jumps one, a
// crate plugs it); goals as plates (a crate can leave one) or sockets (a
// crate is spent in one, for good). 2-high walls are left out: in the
// first ten Microban levels they solved exactly like 3-high ones (the
// crates already let him climb); check one with solve.mjs --wall 2.
// A cell reads "pushes/sharp steps/trap %" (see solve.mjs): "free" needs no push,
// "-" is unsolvable, "?" hit --max (default 30000 states), "n/a" can't be
// built (a socket under the wizard's start). The last columns build every
// crate as a spiked crate (D198).
import fs from 'node:fs';
import { parseXsb, xsbToRoom } from './xsb.mjs';
import { loadContent, solve } from './solve.mjs';

/**
 * Classic Sokoban: fewest pushes, the player walking only over floor.
 * @param {string[]} rows
 * @returns {number|null|undefined} pushes, null unsolvable, undefined cut off
 */
export function classicPushes(rows, max = 200000) {
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  const at = (x, z) => rows[z]?.[x] ?? ' ';
  const wall = (x, z) => x < 0 || z < 0 || x >= W || z >= H || at(x, z) === '#';
  const goals = new Set();
  let boxes = [];
  let player = 0;
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const c = at(x, z);
      const i = z * W + x;
      if ('.*+'.includes(c)) goals.add(i);
      if ('$*'.includes(c)) boxes.push(i);
      if ('@+'.includes(c)) player = i;
    }
  const dirs = [1, -1, W, -W];
  const region = (boxSet, from) => {
    const seen = new Set([from]);
    const todo = [from];
    while (todo.length) {
      const i = todo.pop();
      for (const d of dirs) {
        const n = i + d;
        if (Math.abs(d) === 1 && Math.floor(n / W) !== Math.floor(i / W)) continue;
        if (seen.has(n) || wall(n % W, Math.floor(n / W)) || boxSet.has(n)) continue;
        seen.add(n);
        todo.push(n);
      }
    }
    return seen;
  };
  const keyOf = (bs, reg) => `${[...bs].sort((a, b) => a - b)}#${Math.min(...reg)}`;
  boxes = boxes.sort((a, b) => a - b);
  let frontier = [{ boxes, player }];
  const seen = new Set([keyOf(boxes, region(new Set(boxes), player))]);
  for (let depth = 0; frontier.length; depth++) {
    const next = [];
    for (const { boxes: bs, player: p } of frontier) {
      if (bs.every((b) => goals.has(b))) return depth;
      const boxSet = new Set(bs);
      const reg = region(boxSet, p);
      for (const b of bs)
        for (const d of dirs) {
          const from = b - d;
          const to = b + d;
          if (Math.abs(d) === 1 && (Math.floor(from / W) !== Math.floor(b / W) || Math.floor(to / W) !== Math.floor(b / W))) continue;
          if (!reg.has(from) || wall(to % W, Math.floor(to / W)) || boxSet.has(to)) continue;
          const moved = bs.map((o) => (o === b ? to : o)).sort((a, c) => a - c);
          const key = keyOf(moved, region(new Set(moved), b));
          if (seen.has(key)) continue;
          if (seen.size >= max) return undefined;
          seen.add(key);
          next.push({ boxes: moved, player: b });
        }
    }
    frontier = next;
  }
  return null;
}

export const VARIANTS = [
  { label: 'wall 3, plate', wall: 3, goal: 'plate' },
  { label: 'ledge 1, plate', wall: 1, goal: 'plate' },
  { label: 'holes, plate', wall: 'hole', goal: 'plate' },
  { label: 'wall 3, socket', wall: 3, goal: 'socket' },
  { label: 'holes, socket', wall: 'hole', goal: 'socket' },
  // Every crate spiked (D198): the wizard can't climb them, so the build should play like Classic.
  { label: 'wall 3, plate, spiked', wall: 3, goal: 'plate', spiked: true },
  { label: 'ledge 1, plate, spiked', wall: 1, goal: 'plate', spiked: true },
  { label: 'holes, plate, spiked', wall: 'hole', goal: 'plate', spiked: true },
];

/** One survey cell: "pushes/decisions/trap%", "free", "-", "?" or "n/a". */
export function surveyCell(level, variant, content, max) {
  let data;
  try {
    data = xsbToRoom(level, { wall: variant.wall, goal: variant.goal, exits: [], spiked: variant.spiked });
  } catch {
    return { text: 'n/a' };
  }
  const result = solve(data, content, { goal: 'switches', max });
  const [r] = result.goals;
  if (r.pushes === null) return { text: result.truncated ? '?' : '-' };
  if (r.pushes === 0) return { text: 'free', pushes: 0 };
  const trap = Math.round((100 * r.traps) / result.configs);
  return { text: `${r.pushes}/${r.decisions}/${trap}%${result.truncated ? '?' : ''}`, pushes: r.pushes, decisions: r.decisions };
}

if (process.argv[1]?.endsWith('survey.mjs')) {
  const argv = process.argv.slice(2);
  const option = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const file = argv.find((a, i) => !a.startsWith('--') && !['--levels', '--max', '--out'].includes(argv[i - 1]));
  // --spiked-only: just the spiked columns (the others never change with the spiked crate; split a long run by --levels)
  const variants = argv.includes('--spiked-only') ? VARIANTS.filter((v) => v.spiked) : VARIANTS;
  if (!file) {
    console.error('usage: node survey.mjs <file.xsb> [--levels 1-40] [--max N] [--spiked-only] [--out file.md]');
    process.exit(1);
  }
  const max = Number(option('--max') ?? 30000);
  const levels = parseXsb(fs.readFileSync(file, 'utf8'));
  const [lo, hi] = (option('--levels') ?? `1-${levels.length}`).split('-').map(Number);
  const content = loadContent();
  const lines = [
    `| # | Title | Size | Crates | Classic | ${variants.map((v) => v.label).join(' | ')} |`,
    `|---|---|---|---|---|${variants.map(() => '---').join('|')}|`,
  ];
  for (let n = lo; n <= Math.min(hi ?? lo, levels.length); n++) {
    const level = levels[n - 1];
    const room = xsbToRoom(level, { exits: [] });
    const [w, , d] = room.size;
    const crates = room.objects.filter((o) => o.type === 'crate' || o.type === 'crate_spiked').length;
    const classic = classicPushes(level.rows);
    const cells = variants.map((v) => surveyCell(level, v, content, max).text);
    const title = level.title.replace(/^.*?Microban \d+\s*/, '').replace(/\|/g, '/');
    lines.push(`| ${n} | ${title} | ${w}×${d}${w + d > 32 ? ' (big)' : ''} | ${crates} | ${classic ?? (classic === null ? '-' : '?')} | ${cells.join(' | ')} |`);
    process.stderr.write(`${n} `);
  }
  process.stderr.write('\n');
  const text = `${lines.join('\n')}\n`;
  if (option('--out')) fs.writeFileSync(option('--out'), text);
  else process.stdout.write(text);
}
