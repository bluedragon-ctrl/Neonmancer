// `npm run check:reach`: can the wizard get everywhere, and in what order?
// Searches every room's grid with the abilities he has at each point of the
// game and flags what stays out of reach (src/world/reach.js, reach-world.js).
// Exits with 1 on a problem (used by CI); warnings are printed only.
//   node tools/check-reach.js [--rooms] [--json]
//   --rooms: also list, per room, what each exit and pickup needs
//   --json: print the whole report as JSON instead
import { fileURLToPath } from 'node:url';
import { checkData, readDataFiles } from './check-data.js';
import { loadGameData } from '../src/data/load.js';
import { analyzeWorld } from '../src/world/reach-world.js';
import { formatReach } from '../src/world/reach-report.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));

const { errors: dataErrors } = checkData(root);
if (dataErrors.length > 0) {
  console.error(`Invalid game data (${dataErrors.length} problem(s)); run npm run validate:data first.`);
  process.exit(1);
}
const content = loadGameData(readDataFiles(root).files);
const report = analyzeWorld(content, { needs: args.has('--rooms') || args.has('--json') });

if (args.has('--json')) {
  console.log(JSON.stringify(formatReach(report, { json: true }), null, 2));
} else {
  console.log(formatReach(report, { rooms: args.has('--rooms') }));
}
process.exit(report.errors.length > 0 ? 1 : 0);
