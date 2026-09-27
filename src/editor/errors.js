/**
 * The room editor's error list (D57): validation errors grouped by file,
 * and where each one points in the editor (the room to open, the thing to
 * pick, the tool that edits it), so a click on an error goes there. Plain
 * logic, no browser.
 */

/** "rooms/lab.json › enemies[0].path: message" → file, path, message (see validate.js formatError()). */
const ERROR_FORMAT = /^(\S+\.json)(?: › (\S+))?: ([\s\S]*)$/;

/** An exit reference in a message: "room.exit". */
const EXIT_REF = /"([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)"/;

/** Tools that edit a room field, by the field an error path starts with. */
const FIELD_TOOLS = { spawn: 'spawn', reset: 'reset', blocks: 'block', holes: 'hole' };

/**
 * @param {string} error
 * @returns {{ file: string, path: string, message: string } | null}
 */
export function parseError(error) {
  const match = ERROR_FORMAT.exec(error);
  return match ? { file: match[1], path: match[2] ?? '', message: match[3] } : null;
}

/**
 * Errors grouped by file, in the order they came.
 * @param {string[]} errors
 * @returns {{ file: string, errors: { error: string, text: string }[] }[]} `text`: the error without its file
 */
export function groupErrors(errors) {
  const groups = new Map();
  for (const error of errors) {
    const parsed = parseError(error);
    const file = parsed?.file ?? '';
    const text = parsed ? (parsed.path ? `${parsed.path}: ${parsed.message}` : parsed.message) : error;
    if (!groups.has(file)) groups.set(file, { file, errors: [] });
    groups.get(file).errors.push({ error, text });
  }
  return [...groups.values()];
}

/**
 * Where an error points in the editor, or null (defs.json, or nothing to find).
 * @param {string} error
 * @param {object} context
 * @param {(id: string) => object|undefined} context.roomData a room's data as edited
 * @param {string[][]} context.connections world.json's connections
 * @returns {{ room: string, tool?: string, selected?: { kind: 'item'|'exit', id: string } } | null}
 */
export function errorTarget(error, { roomData, connections }) {
  const parsed = parseError(error);
  if (!parsed) return null;
  const { file, path, message } = parsed;
  if (file === 'world.json') {
    const pair = /^connections\[(\d+)\]/.exec(path);
    const ref = EXIT_REF.exec(message)?.slice(1) ?? connections[pair?.[1]]?.[0]?.split('.');
    if (!ref || !roomData(ref[0])) return null;
    const [room, exit] = ref;
    const found = (roomData(room).exits ?? []).some((e) => e.id === exit);
    return found ? { room, tool: 'exit', selected: { kind: 'exit', id: exit } } : { room };
  }
  const roomFile = /^rooms\/([a-z][a-z0-9_]*)\.json$/.exec(file);
  const data = roomFile && roomData(roomFile[1]);
  if (!data) return null;
  const room = roomFile[1];
  const item = /^(objects|enemies|pickups|exits)\[(\d+)\](\.path)?/.exec(path);
  if (item) {
    const [, key, index, onPath] = item;
    const id = data[key]?.[Number(index)]?.id;
    if (id === undefined) return { room };
    if (key === 'exits') return { room, tool: 'exit', selected: { kind: 'exit', id } };
    const tool = onPath ? 'path' : key === 'enemies' ? 'enemy' : 'object';
    return { room, tool, selected: { kind: 'item', id } };
  }
  const tool = FIELD_TOOLS[path.split(/[.[]/)[0]];
  return tool ? { room, tool } : { room };
}
