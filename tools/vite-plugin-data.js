/**
 * Vite plugin: checks data/ against schemas/ (D8).
 *
 * - Build: any data error fails the build, so invalid data never ships.
 * - Dev server: errors are printed in the terminal and passed to the game
 *   through the virtual module `virtual:data-schema-errors`, so its error
 *   screen can list them. Editing data or schemas reloads the page.
 */
import { checkData, relativeTo } from './check-data.js';

const VIRTUAL_ID = 'virtual:data-schema-errors';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export function dataValidation() {
  let root;
  let command;

  return {
    name: 'neonmancer-data-validation',

    configResolved(config) {
      root = config.root;
      command = config.command;
    },

    buildStart() {
      if (command !== 'build') return;
      const { errors } = checkData(root);
      if (errors.length > 0) this.error(`Invalid game data:\n  ${errors.join('\n  ')}`);
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id !== RESOLVED_ID) return;
      if (command === 'build') return 'export default [];';
      const { schemaErrors, errors } = checkData(root);
      if (errors.length > 0) {
        console.error(`\n[data] ${errors.length} problem(s):\n  ${errors.join('\n  ')}\n`);
      }
      return `export default ${JSON.stringify(schemaErrors)};`;
    },

    handleHotUpdate({ file, server }) {
      const path = relativeTo(root, file);
      if (!path.startsWith('data/') && !path.startsWith('schemas/')) return;
      // Re-run the check on the next load and reload the game.
      const module = server.moduleGraph.getModuleById(RESOLVED_ID);
      if (module) server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
