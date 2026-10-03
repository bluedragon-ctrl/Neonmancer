// `npm run check:reach`: can the wizard get everywhere, and in what order?
// Searches every room's grid with the abilities he has at each point of the
// game and flags what stays out of reach (src/world/reach.js, reach-world.js).
// Exits with 1 on a problem (used by CI); warnings are printed only.
//   node tools/check-reach.js [room_id] [--with a,b,c] [--rooms] [--json]
//   room_id: only that room (npm run check:reach -- room_id). The world is still
//     searched to know what he has when he gets there, but only that room is
//     reported, with what each exit and pickup needs
//   --with a,b,c: with a room_id, skip the world and take these abilities
//     (double_jump, zap, scan, pull, compile, fork, cut_paste, blink, warp, pause)
//   --from exit_id: with --with, arrive through that exit instead of at the spawn point
//   --rooms: all rooms: also list what each exit and pickup needs
//   --json: print the report as JSON instead
import { fileURLToPath } from 'node:url';
import { checkData, readDataFiles } from './check-data.js';
import { loadGameData } from '../src/data/load.js';
import { analyzeRoomAlone, analyzeWorld } from '../src/world/reach-world.js';
import { formatReach, formatRoom, roomOfReport } from '../src/world/reach-report.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const args = new Set(argv);
const withIndex = argv.indexOf('--with');
const abilities = withIndex >= 0 ? (argv[withIndex + 1] ?? '').split(',').filter(Boolean) : null;
const fromIndex = argv.indexOf('--from');
const from = fromIndex >= 0 ? argv[fromIndex + 1] : null;
const roomId = argv.find((arg, i) => !arg.startsWith('--') && (withIndex < 0 || i !== withIndex + 1) && (fromIndex < 0 || i !== fromIndex + 1));

const { errors: dataErrors } = checkData(root);
if (dataErrors.length > 0) {
  console.error(`Invalid game data (${dataErrors.length} problem(s)); run npm run validate:data first.`);
  process.exit(1);
}
const content = loadGameData(readDataFiles(root).files);
if (roomId && !content.rooms.has(roomId)) {
  console.error(`No room "${roomId}". Rooms: ${[...content.rooms.keys()].join(', ')}`);
  process.exit(1);
}
if ((abilities || from) && !roomId) {
  console.error('--with and --from need a room id: node tools/check-reach.js <room_id> --with a,b --from exit');
  process.exit(1);
}

if (roomId) {
  // One room: with the abilities given, or as the world's order has him arrive.
  let alone = null;
  try {
    if (abilities || from) alone = analyzeRoomAlone(content, roomId, { abilities: abilities ?? [], from });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const world = alone ? null : analyzeWorld(content);
  const part = alone ?? roomOfReport(world, roomId);
  const note = alone ? `${roomId} on its own with ${abilities?.length ? abilities.join(', ') : 'no abilities'}, from ${from ? `exit ${from}` : 'the spawn point'}:` : undefined;
  console.log(args.has('--json') ? JSON.stringify(part, null, 2) : formatRoom(roomId, part, note));
  process.exit(part.errors.length > 0 ? 1 : 0);
}

const report = analyzeWorld(content, { needs: args.has('--rooms') || args.has('--json') });

if (args.has('--json')) {
  console.log(JSON.stringify(formatReach(report, { json: true }), null, 2));
} else {
  console.log(formatReach(report, { rooms: args.has('--rooms') }));
}
process.exit(report.errors.length > 0 ? 1 : 0);
