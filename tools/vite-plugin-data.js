/**
 * Vite plugin: checks data/ against schemas/ (D8).
 *
 * - Build: any data error fails the build, so invalid data never ships.
 * - Dev server: errors are printed in the terminal and passed to the game
 *   through the virtual module `virtual:data-schema-errors`, so its error
 *   screen can list them. Editing data or schemas reloads the page, except
 *   a file the room editor just saved (the editor already shows it).
 * - Dev server: the room editor saves rooms and world.json through SAVE_URL (D56, D57),
 *   the world map tool the rooms' positions (D66); every save is announced to
 *   open pages as DATA_SAVED_EVENT.
 */
import { checkData, relativeTo } from './check-data.js';
import { DATA_SAVED_EVENT, SAVE_URL, refuseSaveRequest, saveEdits } from './room-save.js';

const VIRTUAL_ID = 'virtual:data-schema-errors';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
/** A file change this soon after the editor saved that file is the save itself (ms). */
const EDITOR_SAVE_QUIET_MS = 2000;

export function dataValidation() {
  let root;
  let command;
  /** Files the editor wrote (relative to root) → when: no reload for those shortly after. */
  const saved = new Map();

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

    configureServer(server) {
      server.middlewares.use(SAVE_URL, (req, res) => {
        const refused = refuseSaveRequest(req);
        if (refused) {
          res.statusCode = refused;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          let result;
          try {
            result = saveEdits(root, JSON.parse(body));
          } catch (err) {
            result = { ok: false, errors: [`could not save (${err.message})`], files: [] };
          }
          for (const file of result.files) {
            saved.set(file, Date.now());
            console.log(`[editor] saved ${file}`);
          }
          // Pages that don't reload for it (the world map tool) can catch up.
          if (result.files.length > 0) server.ws.send({ type: 'custom', event: DATA_SAVED_EVENT, data: { files: result.files } });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        });
      });
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
      const justSaved = Date.now() - (saved.get(path) ?? -Infinity) < EDITOR_SAVE_QUIET_MS;
      if (!justSaved) server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
