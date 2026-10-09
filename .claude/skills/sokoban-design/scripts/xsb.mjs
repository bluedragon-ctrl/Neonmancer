// XSB (the plain-text Sokoban format) to a Neonmancer room, for the
// sokoban-design skill: sketch a push puzzle as text, convert it, solve it
// with solve.mjs, then wire it as a real room (room-design skill).
//   node .claude/skills/sokoban-design/scripts/xsb.mjs <file.xsb> [--level N] [--id x] [--name "X"]
//        [--wall H|hole] [--goal plate|socket] [--exit side:at[:y]] [--spiked] [--out data/rooms/x.json]
// Without --out it prints the room JSON. Text rows are z, columns x: the
// top-left of the text is the back corner (x = 0, z = 0), the bottom-right
// faces the camera.
//
// Characters (standard XSB, then Neonmancer extras):
//   #  wall, --wall high (default 2); --wall hole makes walls holes
//   1-5  wall of that height
//   $  crate        .  goal: a plate, or a socket with --goal socket
//   *  crate on a goal (with --goal socket: a filled socket, plain floor)
//   @  wizard spawn +  spawn on a goal (a plate; no socket under him)
//   space - _  floor
//   ^  hole (a crate fills it)            o  socket (a goal hole, D194)
//   %  fence, 1 high (crates stop, he climbs it, bolts pass)
//   &  crate on a 1-high block (a ledge crate: pushed off, it falls)
//   !  spiked crate (crate_spiked, D198): its top hurts him, he can't stand on it;
//      --spiked makes every $ and * a spiked crate (a whole level built that way)
// Floor outside the outer wall becomes wall too; whole rows and columns
// of # at the edge are trimmed (the room's sides are walls already).
// Lines starting with ; are comments; levels are separated by blank lines
// or comment lines. Comment lines "; exit: side:at[:y]" (repeatable) and
// "; wall: H" before a level set its exits and wall height (options win).
// RLE levels (digits as counts) are not read: expand them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


/**
 * The levels of an XSB text: each { title, rows } (rows padded to one width).
 * @param {string} text
 */
export function parseXsb(text) {
  const levels = [];
  let rows = [];
  let notes = [];
  const flush = () => {
    if (rows.some((r) => /[#1-5]/.test(r))) {
      const width = Math.max(...rows.map((r) => r.length));
      const props = { exits: [], wall: null };
      const text = [];
      for (const note of notes) {
        const m = /^(exit|wall):\s*(\S+)/.exec(note);
        if (m?.[1] === 'exit') props.exits.push(m[2]);
        else if (m?.[1] === 'wall') props.wall = Number(m[2]);
        else text.push(note);
      }
      levels.push({ title: text.join(' ').trim(), rows: rows.map((r) => r.padEnd(width, ' ')), ...props });
      notes = [];
    }
    rows = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*;/.test(line)) {
      flush();
      notes.push(line.replace(/^\s*;\s?/, ''));
    } else if (line === '' && rows.length === 0) {
      notes = []; // a blank line ends a comment block that no level follows
    } else if (line === '' || !/^[#1-5$.*@+ \-_^o%&!]+$/.test(line)) {
      flush();
      if (line !== '') notes.push(line.trim());
    } else rows.push(line);
  }
  flush();
  return levels;
}

/**
 * A room (data/rooms JSON shape) from one level.
 * @param {{ rows: string[], title?: string }} level
 * @param {{ id?: string, name?: string, wall?: number|'hole', goal?: 'plate'|'socket', exits?: string[], spiked?: boolean }} [options]
 *   wall: the height of # walls, or 'hole': inside the trimmed edge they are holes (crates plug them, he jumps one)
 *   goal: what . is: a plate (anything holds it, a crate can leave it) or a socket (a crate fills it for good)
 *   spiked: every $ and * crate is a spiked crate (D198), as ! always is
 *   exits: "side:at[:y]" (e.g. "-x:3", "-z:4:3" a doorway 3 up); with plates or sockets they are locked on every switch
 */
export function xsbToRoom(level, { id = 'sokoban_draft', name = 'Sokoban Draft', wall = level.wall ?? 2, goal = 'plate', exits = level.exits ?? [], spiked = false } = {}) {
  let grid = level.rows.map((r) => [...r]);
  const H = grid.length;
  const W = grid[0].length;
  // Floor outside the walls (spaces reached from the edge) is wall too.
  const outside = new Set();
  const stack = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if ((z === 0 || x === 0 || z === H - 1 || x === W - 1) && grid[z][x] === ' ') stack.push([x, z]);
  while (stack.length) {
    const [x, z] = stack.pop();
    if (x < 0 || z < 0 || x >= W || z >= H || outside.has(`${x},${z}`) || grid[z][x] !== ' ') continue;
    outside.add(`${x},${z}`);
    stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  for (const key of outside) {
    const [x, z] = key.split(',').map(Number);
    grid[z][x] = '#';
  }
  // Trim whole rows and columns of plain wall (#) at the edges; walls of a set height stay.
  const solidRow = (r) => r.every((c) => c === '#');
  while (grid.length && solidRow(grid[0])) grid.shift();
  while (grid.length && solidRow(grid[grid.length - 1])) grid.pop();
  const solidCol = (x) => grid.every((r) => r[x] === '#');
  while (grid[0].length && solidCol(0)) grid = grid.map((r) => r.slice(1));
  while (grid[0].length && solidCol(grid[0].length - 1)) grid = grid.map((r) => r.slice(0, -1));
  const depth = grid.length;
  const width = grid[0].length;
  if (wall === 'hole') grid = grid.map((r) => r.map((c) => (c === '#' ? '^' : c)));
  const socket = goal === 'socket';
  if (socket && grid.some((r) => r.includes('+'))) throw new Error('--goal socket: the wizard starts on a goal, and a socket is a hole');

  const heightOf = (c) => (c === '#' ? wall : /[1-5]/.test(c) ? Number(c) : c === '%' || c === '&' ? 1 : 0);
  const blocks = [];
  let tallest = 0;
  for (let z = 0; z < depth; z++) {
    // Runs along x of one height and kind become one box.
    for (let x = 0; x < width; ) {
      const c = grid[z][x];
      const h = heightOf(c);
      if (h === 0) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < width && grid[z][end + 1] === c) end++;
      tallest = Math.max(tallest, h);
      blocks.push({ ...(c === '%' && { type: 'fence' }), at: [x, 0, z], ...(end > x || h > 1 ? { to: [end, h - 1, z] } : {}) });
      x = end + 1;
    }
  }
  const objects = [];
  const holes = [];
  let spawn = null;
  const count = { crate: 0, crate_spiked: 0, plate: 0, socket: 0 };
  const add = (type, x, z, y = 0) => objects.push({ id: `${type}_${++count[type]}`, type, at: [x, y, z] });
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++) {
      const c = grid[z][x];
      if (c === '@' || c === '+') spawn = [x + 0.5, 0, z + 0.5];
      if (c === '.') add(socket ? 'socket' : 'plate', x, z);
      if (!socket && (c === '*' || c === '+')) add('plate', x, z);
      if (c === '$' || (!socket && c === '*')) add(spiked ? 'crate_spiked' : 'crate', x, z);
      if (c === '!') add('crate_spiked', x, z);
      if (c === '&') add('crate', x, z, 1);
      if (c === 'o') add('socket', x, z);
      if (c === '^') holes.push({ at: [x, z] });
    }
  if (!spawn) throw new Error('the level has no @ (wizard)');
  const switches = count.plate + count.socket > 0;
  const room = {
    $schema: '../../schemas/room.schema.json',
    schemaVersion: 1,
    id,
    name,
    biome: 'home_lattice',
    size: [width, Math.min(6, Math.max(4, tallest + 2)), depth],
    spawn,
    exits: exits.map((spec, n) => {
      const [side, at, y] = spec.split(':');
      return { id: `exit_${n + 1}`, side, at: Number(at), ...(y && { y: Number(y) }), ...(switches && { requires: [{ switch: '*' }] }) };
    }),
    blocks,
    ...(holes.length && { holes }),
    objects,
  };
  return room;
}

/** A --wall value: a height, 'hole', or undefined (the level's own or 2). */
export function wallOption(value) {
  if (!value) return undefined;
  return value === 'hole' ? 'hole' : Number(value);
}

/** Room JSON as the repo writes it (formatJson, D-style spacing). */
export async function formatRoom(room) {
  const { formatJson } = await import('../../../../src/editor/format-json.js');
  return formatJson(room);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const option = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const valued = ['--level', '--id', '--name', '--wall', '--goal', '--exit', '--out'];
  const file = argv.find((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
  if (!file) {
    console.error('usage: node xsb.mjs <file.xsb> [--level N] [--id x] [--name "X"] [--wall H|hole] [--goal plate|socket] [--exit side:at[:y]]... [--spiked] [--out file]');
    process.exit(1);
  }
  const levels = parseXsb(fs.readFileSync(file, 'utf8'));
  const n = Number(option('--level') ?? 1);
  const level = levels[n - 1];
  if (!level) {
    console.error(`${file} has ${levels.length} level(s); no level ${n}`);
    process.exit(1);
  }
  const exits = argv.flatMap((a, i) => (a === '--exit' ? [argv[i + 1]] : []));
  const room = xsbToRoom(level, {
    id: option('--id') ?? undefined,
    name: option('--name') ?? undefined,
    wall: wallOption(option('--wall')),
    goal: option('--goal') ?? undefined,
    exits: exits.length ? exits : undefined,
    spiked: argv.includes('--spiked'),
  });
  const [w, , d] = room.size;
  if (w + d > 32) console.error(`warning: ${w}x${d} breaks x + z <= 32`);
  const text = await formatRoom(room);
  if (option('--out')) fs.writeFileSync(option('--out'), text);
  else process.stdout.write(text);
}
