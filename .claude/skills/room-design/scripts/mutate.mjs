// Mutation test for the room-design skill: is the puzzle enforced?
// Takes each piece of a room away in turn (in memory, no file changes) and
// re-runs the reachability checker on the room alone:
// - a helper (crate, platform, enemy, bridge, collapsing or plain block) is removed;
// - an obstacle (a gate that starts solid) becomes a plain block for good.
// Then lists, per exit and pickup, the pieces it depends on (taking one away
// changes what it needs), and the pieces nothing depends on. A key crate,
// enemy, bridge or gate that nothing depends on means a bypass.
// Switches (plates, targets) and decorations are left alone: sealing their
// gates already tests them.
//   node .claude/skills/room-design/scripts/mutate.mjs <room_id> [--with a,b] [--from exit] [--without id,id]
// --with: the abilities to search with (default: all, so each target shows
// the smallest sets that reach it); --from: arrive through that exit;
// --without: take these objects/enemies out first (interchangeable crates
// hide each other when taken one at a time: take all but one out together).
import { fileURLToPath } from 'node:url';
import { readDataFiles } from '../../../../tools/check-data.js';
import { loadGameData } from '../../../../src/data/load.js';
import { analyzeRoomAlone } from '../../../../src/world/reach-world.js';
import { ABILITIES } from '../../../../src/world/reach.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const argv = process.argv.slice(2);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const abilities = option('--with') !== null ? option('--with').split(',').filter(Boolean) : ABILITIES;
const from = option('--from');
const without = (option('--without') ?? '').split(',').filter(Boolean);
const id = argv.find((arg, i) => !arg.startsWith('--') && !['--with', '--from', '--without'].includes(argv[i - 1]));
if (!id) {
  console.error('usage: node .claude/skills/room-design/scripts/mutate.mjs <room_id> [--with a,b] [--from exit] [--without id,id]');
  process.exit(1);
}

const content = loadGameData(readDataFiles(ROOT).files);
const room = content.rooms.get(id);
if (!room) {
  console.error(`No room "${id}".`);
  process.exit(1);
}
for (const list of ['objects', 'enemies']) room[list] = (room[list] ?? []).filter((item) => !without.includes(item.id));

/** Map "pickup fragment_6" → "pause" / "free" / "never", and whether the crate search was cut off. */
function verdict() {
  const { targets, warnings } = analyzeRoomAlone(content, id, { abilities, from });
  const needs = new Map(targets.map(({ kind, id: t, needs }) => [`${kind} ${t}`, needs ? needs.map((n) => n.join('+') || 'free').join(' or ') : 'never']));
  return { needs, truncated: warnings.length > 0 };
}

const base = verdict();
console.log(`${id} with ${abilities === ABILITIES ? 'any abilities' : abilities.join(', ') || 'no abilities'}${from ? `, from ${from}` : ''}${without.length ? `, without ${without.join(', ')}` : ''}:`);
for (const [target, need] of base.needs) console.log(`  ${target}: ${need}`);
let truncated = base.truncated;

const dependents = new Map([...base.needs.keys()].map((t) => [t, []]));
const unused = [];
const SKIP = ['plate', 'target', 'deco', 'core'];
for (const list of ['objects', 'enemies', 'blocks']) {
  const items = room[list] ?? [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (list === 'objects' && SKIP.includes(content.objectTypes[item.type]?.kind)) continue;
    const type = list === 'blocks' ? content.blockTypes[item.type ?? 'block'] : null;
    const seal = type?.kind === 'gate' && (type.start ?? 'solid') === 'solid';
    const wall = list === 'blocks' && !type?.kind;
    if (seal) items[i] = { at: item.at, ...(item.to && { to: item.to }) };
    else items.splice(i, 1);
    const label = `${seal ? 'sealed ' : ''}${item.id ?? item.type ?? 'block'} [${item.at}]${item.to ? `-[${item.to}]` : ''}`;
    try {
      const result = verdict();
      truncated ||= result.truncated;
      let used = false;
      for (const [target, need] of result.needs) {
        if (need === base.needs.get(target)) continue;
        used = true;
        dependents.get(target)?.push(`${label} (→ ${need})`);
      }
      // A wall nothing depends on is just a wall; anything else is suspicious.
      if (!used && !wall) unused.push(label);
    } catch (error) {
      console.log(`  error with ${label} changed: ${error.message}`);
    } finally {
      if (seal) items[i] = item;
      else items.splice(i, 0, item);
    }
  }
}
console.log('Depends on:');
for (const [target, pieces] of dependents) console.log(`  ${target}: ${pieces.length ? pieces.join(', ') : 'nothing'}`);
console.log(unused.length ? `NO EFFECT (spare, scenery, or a bypass): ${unused.join(', ')}` : 'Every helper and gate matters.');
if (truncated) console.log('warning: the crate search was truncated (MAX_CONFIGS); verdicts may miss solutions');
