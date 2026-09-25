// `npm run validate:data`: check data/ against schemas/ plus the semantic
// rules, print every problem, exit with 1 if there are any (used by CI).
import { fileURLToPath } from 'node:url';
import { checkData } from './check-data.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const { errors } = checkData(root);

if (errors.length > 0) {
  console.error(`Invalid game data (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log('Game data is valid.');
