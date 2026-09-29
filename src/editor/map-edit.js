/**
 * The world as the world map tool edits it (D66, D77, D102, D103): room
 * positions, rooms added and removed, connections made and broken, exits
 * removed, and rolling back the last save. A connection made on the map
 * opens an exit in the middle of each room's facing wall (or takes a loose
 * exit already there); breaking one closes both exits (every exit must be
 * connected). Fine tuning (where along the wall, height, width) stays with
 * the room editor. Plain logic, no browser, so tests can drive it.
 */
import { OPPOSITE_SIDE, sideLength, withExitDefaults } from '../data/room-data.js';
import { validateData } from '../data/validate.js';
import { mapKey, nearestFreeCell } from '../world/map.js';
import { numberRooms } from '../world/room-numbers.js';
import { SIDE_NAMES, exitFields, exitsOverlap, newRoom, roomFileData, roomIdProblem } from './room-edit.js';

/** Undo steps kept. */
const UNDO_LIMIT = 200;

/** Width of an exit opened from the map (the schema default). */
const EXIT_WIDTH = withExitDefaults({}).width;

const roomFile = (id) => `rooms/${id}.json`;

/**
 * The side of room A that faces room B on the map: along the axis they are
 * further apart on (x when equal, e.g. diagonal neighbours).
 * @param {number[]} a [x, z] of room A
 * @param {number[]} b [x, z] of room B
 * @returns {string|null} '-x' | '+x' | '-z' | '+z', or null in the same cell
 */
export function facingSide([ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  if (dx === 0 && dz === 0) return null;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? '+x' : '-x';
  return dz > 0 ? '+z' : '-z';
}

/**
 * Where along a side an exit can start (`at`), the middle of the wall
 * first, then outwards (+1, −1, +2, …).
 * @param {number} length the side's length
 * @param {number} width the exit's width
 * @returns {number[]}
 */
export function exitSpots(length, width) {
  const last = length - width;
  if (last < 0) return [];
  const middle = Math.floor(last / 2);
  const spots = [middle];
  for (let step = 1; spots.length <= last; step++) {
    if (middle + step <= last) spots.push(middle + step);
    if (middle - step >= 0) spots.push(middle - step);
  }
  return spots;
}

export class MapEdit {
  /**
   * @param {Record<string, any>} files every data file, keyed like data/
   *   (world.json, rooms/*.json, and defs, biomes and strings for the checks)
   */
  constructor(files) {
    this.files = files;
    this.world = structuredClone(files['world.json']);
    this.world.positions ??= {};
    /** room id → room data as edited */
    this.rooms = new Map(
      Object.entries(files)
        .filter(([file]) => file.startsWith('rooms/'))
        .map(([, room]) => [room.id, structuredClone(room)]),
    );
    this.undoStack = [];
    this.markSaved();
    // A room file with no position yet (added by hand) gets a free cell
    // next to the start, saved with the next save.
    for (const id of this.rooms.keys()) {
      if (!this.positions[id]) this.positions[id] = nearestFreeCell(this.positions, this.positions[this.world.start] ?? [0, 0]);
    }
    // And a room number (D111).
    this.world.numbers = numberRooms(this.world.numbers, this.rooms.keys());
  }

  /** @returns {Record<string, number[]>} room id → [x, z] */
  get positions() {
    return this.world.positions;
  }

  /** @returns {string[][]} pairs of "room.exit" */
  get connections() {
    return this.world.connections;
  }

  /** The room in a map cell, or null. */
  roomAt(cell) {
    const key = mapKey(cell);
    return [...this.rooms.keys()].find((id) => mapKey(this.positions[id]) === key) ?? null;
  }

  /** Every data file as edited: removed rooms left out, for the checks. */
  dataFiles() {
    const files = Object.fromEntries(Object.entries(this.files).filter(([file]) => !file.startsWith('rooms/')));
    for (const [id, room] of this.rooms) files[roomFile(id)] = room;
    files['world.json'] = this.world;
    return files;
  }

  // --- Saving and undo -------------------------------------------------------

  /** The current state is what is on disk (after loading or saving). */
  markSaved() {
    this.saved = {
      world: structuredClone(this.world),
      rooms: new Map([...this.rooms].map(([id, room]) => [id, JSON.stringify(room)])),
    };
  }

  /**
   * What changed since the last save, as the dev server takes it
   * (tools/room-save.js): whole room files of new and changed rooms, the
   * ids of removed ones, the cells of moved and new rooms, and world.json
   * when its connections, start or room numbers changed.
   * @returns {{ rooms: object[], remove: string[], positions: Record<string, number[]>, world?: object,
   *   counts: { moved: number, added: number, removed: number, changed: number, links: boolean } }}
   */
  changes() {
    const saved = this.saved;
    const added = [...this.rooms.keys()].filter((id) => !saved.rooms.has(id));
    const changed = [...this.rooms.keys()].filter((id) => saved.rooms.has(id) && saved.rooms.get(id) !== JSON.stringify(this.rooms.get(id)));
    const remove = [...saved.rooms.keys()].filter((id) => !this.rooms.has(id));
    const placed = [...this.rooms.keys()].filter((id) => mapKey(this.positions[id]) !== mapKey(saved.world.positions?.[id] ?? [NaN, NaN]));
    const links = JSON.stringify(this.connections) !== JSON.stringify(saved.world.connections) || this.world.start !== saved.world.start;
    const numbered = JSON.stringify(this.world.numbers) !== JSON.stringify(saved.world.numbers);
    const out = {
      rooms: [...added, ...changed].map((id) => structuredClone(this.rooms.get(id))),
      remove,
      positions: Object.fromEntries(placed.map((id) => [id, [...this.positions[id]]])),
      counts: { moved: placed.filter((id) => !added.includes(id)).length, added: added.length, removed: remove.length, changed: changed.length, links },
    };
    if (links || numbered || remove.length > 0) out.world = structuredClone(this.world);
    return out;
  }

  /** Are there changes not saved yet? */
  get dirty() {
    const { rooms, remove, positions, world } = this.changes();
    return rooms.length > 0 || remove.length > 0 || Object.keys(positions).length > 0 || world !== undefined;
  }

  /** Ids of rooms whose cell changed since the last save (new rooms too). */
  movedRooms() {
    return Object.keys(this.changes().positions);
  }

  /**
   * Run an edit as one undo step; it is dropped if it reports no change.
   * @param {() => boolean} change
   */
  edit(change) {
    const before = this.snapshot();
    if (!change()) {
      this.restore(before);
      return false;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    return true;
  }

  /** @returns {boolean} whether there was a step to undo */
  undo() {
    const last = this.undoStack.pop();
    if (last) this.restore(last);
    return Boolean(last);
  }

  clearHistory() {
    this.undoStack = [];
  }

  /**
   * Before saving: what the save is about to overwrite, so it can be rolled
   * back (D103): world.json and each room the save writes or deletes, as on
   * disk (null for a room the save adds). Plain JSON, to keep over a reload.
   * @returns {{ world: object, rooms: Record<string, object|null> }}
   */
  rollbackPoint() {
    const { rooms, remove } = this.changes();
    const ids = [...rooms.map((room) => room.id), ...remove];
    return {
      world: structuredClone(this.saved.world),
      rooms: Object.fromEntries(ids.map((id) => [id, this.saved.rooms.has(id) ? JSON.parse(this.saved.rooms.get(id)) : null])),
    };
  }

  /**
   * Go back to a rollback point (one undo step, not saved yet): its rooms
   * come back as they were (a room it didn't have goes), and so does
   * world.json.
   * @param {{ world: object, rooms: Record<string, object|null> }} point from rollbackPoint()
   * @returns {boolean} whether anything changed
   */
  rollBack({ world, rooms }) {
    return this.edit(() => {
      const before = JSON.stringify([this.world, [...this.rooms]]);
      for (const [id, room] of Object.entries(rooms)) {
        if (room) this.rooms.set(id, structuredClone(room));
        else this.rooms.delete(id);
      }
      this.world = structuredClone(world);
      // A room the point's world.json doesn't know (made since) keeps a cell.
      for (const id of this.rooms.keys()) {
        if (!this.positions[id]) this.positions[id] = nearestFreeCell(this.positions, this.positions[this.world.start] ?? [0, 0]);
      }
      this.world.numbers = numberRooms(this.world.numbers, this.rooms.keys());
      return JSON.stringify([this.world, [...this.rooms]]) !== before;
    });
  }

  snapshot() {
    return { world: structuredClone(this.world), rooms: structuredClone(this.rooms) };
  }

  restore({ world, rooms }) {
    this.world = world;
    this.rooms = rooms;
  }

  // --- Rooms -----------------------------------------------------------------

  /**
   * Move a room to a free cell.
   * @returns {boolean} whether it moved
   */
  move(id, cell) {
    if (!this.rooms.has(id) || mapKey(this.positions[id]) === mapKey(cell) || this.roomAt(cell) !== null) return false;
    return this.edit(() => {
      this.positions[id] = [...cell];
      return true;
    });
  }

  /**
   * Add a new, empty room (12x4x12, no exits) in a free cell.
   * @param {string} id
   * @param {number[]} cell [x, z]
   * @param {string} biome biome id
   * @returns {string|null} why it can't be added, or null when it was
   */
  addRoom(id, cell, biome) {
    const problem = roomIdProblem(id, this.rooms.keys());
    if (problem) return problem;
    const other = this.roomAt(cell);
    if (other) return `That cell is ${other}'s.`;
    this.edit(() => {
      this.rooms.set(id, newRoom(id, biome));
      this.positions[id] = [...cell];
      this.world.numbers = numberRooms(this.world.numbers, [id]);
      return true;
    });
    return null;
  }

  /**
   * Remove a room: its file (on save), its map cell, its connections and
   * the exits of other rooms that led into it. Its number stays taken (D111).
   * @returns {string|null} why it can't be removed, or null when it was
   */
  removeRoom(id) {
    if (!this.rooms.has(id)) return `No room ${id}.`;
    if (id === this.world.start) return `${id} is the start room; it stays.`;
    this.edit(() => {
      for (const exit of this.rooms.get(id).exits ?? []) this.disconnectExit(`${id}.${exit.id}`);
      this.rooms.delete(id);
      delete this.positions[id];
      return true;
    });
    return null;
  }

  /**
   * A first free room id: `room_1`, `room_2`...
   * @param {string} [prefix]
   */
  freeRoomId(prefix = 'room') {
    let n = 1;
    while (this.rooms.has(`${prefix}_${n}`)) n++;
    return `${prefix}_${n}`;
  }

  // --- Exits and connections -------------------------------------------------

  /**
   * Connect two rooms: an exit in each one's wall facing the other (as they
   * sit on the map), in the middle of the wall or as near to it as it fits,
   * and the connection between them.
   * @returns {{ ref: string[]|null, problem: string|null }} the connected pair, or why not
   */
  connect(a, b) {
    if (a === b) return { ref: null, problem: 'A room connects to another room.' };
    if (!this.rooms.has(a) || !this.rooms.has(b)) return { ref: null, problem: 'Unknown room.' };
    const side = facingSide(this.positions[a], this.positions[b]);
    let pair = null;
    let problem = null;
    this.edit(() => {
      const exitA = this.looseExit(a, side) ?? this.addExit(a, side);
      const exitB = exitA && (this.looseExit(b, OPPOSITE_SIDE[side]) ?? this.addExit(b, OPPOSITE_SIDE[side]));
      if (!exitA || !exitB) {
        const full = exitA ? b : a;
        problem = `No room for another exit in ${full}'s ${SIDE_NAMES[exitA ? OPPOSITE_SIDE[side] : side]} wall.`;
        return false;
      }
      pair = [`${a}.${exitA}`, `${b}.${exitB}`];
      this.connections.push(pair);
      return true;
    });
    return { ref: pair, problem };
  }

  /**
   * Break a connection and close both its exits.
   * @param {number} index in the connections list
   * @returns {boolean} whether there was one
   */
  disconnect(index) {
    const pair = this.connections[index];
    if (!pair) return false;
    return this.edit(() => {
      this.disconnectExit(pair[0]);
      return true;
    });
  }

  /**
   * Remove one exit: a connected one with its connection and the exit at
   * the other end (an exit can't stay unconnected), a loose one alone.
   * @param {string} ref "room.exit"
   * @returns {string[]} the exits removed ("room.exit"), none if there was no such exit
   */
  removeExit(ref) {
    const [roomId, exitId] = ref.split('.');
    if (!this.rooms.get(roomId)?.exits?.some((e) => e.id === exitId)) return [];
    const refs = this.connections.find((pair) => pair.includes(ref)) ?? [ref];
    this.edit(() => this.disconnectExit(ref));
    return [...refs];
  }

  /**
   * An exit of the room not connected to anything, `EXIT_WIDTH` wide, in
   * `side` (the middle-most first), or null.
   * @param {string} roomId
   * @param {string} side
   * @returns {string|null} its id
   */
  looseExit(roomId, side) {
    const room = this.rooms.get(roomId);
    const middle = (sideLength(side, room.size) - EXIT_WIDTH) / 2;
    const loose = (room.exits ?? [])
      .filter((exit) => exit.side === side && withExitDefaults(exit).width === EXIT_WIDTH && !this.connected(`${roomId}.${exit.id}`))
      .sort((a, b) => Math.abs(a.at - middle) - Math.abs(b.at - middle));
    return loose[0]?.id ?? null;
  }

  /** Is the exit "room.exit" connected? */
  connected(ref) {
    return this.connections.some((pair) => pair.includes(ref));
  }

  /**
   * Hook for room edits: open a new exit in a room's side, in the middle of
   * the wall or as near to it as it fits (clear of other exits, and of
   * blocks, holes and the like inside the opening when it can be). Not
   * connected yet. No undo step of its own.
   * @param {string} roomId
   * @param {string} side '-x' | '+x' | '-z' | '+z'
   * @returns {string|null} the new exit's id, or null if the side has no room for it
   */
  addExit(roomId, side) {
    const room = this.rooms.get(roomId);
    const exits = room.exits ?? [];
    const spots = exitSpots(sideLength(side, room.size), EXIT_WIDTH).filter((at) => {
      const exit = withExitDefaults({ side, at });
      return !exits.some((other) => other.side === side && exitsOverlap(withExitDefaults(other), exit));
    });
    if (spots.length === 0) return null;
    const id = freeExitId(exits, side);
    const withExit = (at) => roomFileData({ ...room, exits: [...exits, exitFields(withExitDefaults({ id, side, at }))] });
    // The first spot whose opening the room's checks accept, else the middle-most.
    const at = spots.find((spot) => this.exitProblems(withExit(spot), exits.length).length === 0) ?? spots[0];
    this.rooms.set(roomId, withExit(at));
    return id;
  }

  /**
   * Hook for room edits: close an exit, and the one it is connected to in
   * the other room (an exit can't stay unconnected). No undo step of its own.
   * @param {string} ref "room.exit"
   * @returns {boolean} whether there was one
   */
  disconnectExit(ref) {
    const pair = this.connections.find((p) => p.includes(ref));
    const refs = pair ?? [ref];
    let found = false;
    for (const r of refs) {
      const [roomId, exitId] = r.split('.');
      const room = this.rooms.get(roomId);
      if (!room?.exits?.some((e) => e.id === exitId)) continue;
      found = true;
      this.rooms.set(roomId, roomFileData({ ...room, exits: room.exits.filter((e) => e.id !== exitId) }));
    }
    if (pair) this.world.connections = this.connections.filter((p) => p !== pair);
    return found || Boolean(pair);
  }

  /**
   * What the room's own checks say about one of its exits (opening past the
   * side, blocked by a block, a hole, a platform's path…).
   * @param {object} room
   * @param {number} index the exit's index
   * @returns {string[]}
   */
  exitProblems(room, index) {
    const files = {
      'defs.json': this.files['defs.json'],
      'biomes.json': this.files['biomes.json'],
      'strings.json': this.files['strings.json'],
      'world.json': { ...this.world, connections: [], positions: {} },
      [roomFile(room.id)]: room,
    };
    const prefix = `${roomFile(room.id)} › exits[${index}]`;
    return validateData(files).filter((error) => error.startsWith(prefix));
  }
}

/** `north`, `north_2`...: the first id for an exit in that side the room doesn't use. */
function freeExitId(exits, side) {
  const ids = new Set(exits.map((exit) => exit.id));
  const name = SIDE_NAMES[side];
  let id = name;
  for (let n = 2; ids.has(id); n++) id = `${name}_${n}`;
  return id;
}
