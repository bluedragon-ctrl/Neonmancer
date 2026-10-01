/**
 * Reachability of the whole world (D131; plain logic): which rooms,
 * exits and pickups the wizard can get to, in some order, starting at the
 * start room with nothing. Rooms are searched by reach.js; this chains them.
 *
 * It plays the game as a fixpoint: from what he has (abilities from the
 * disks and upgrades found, the access level the core gave him) it
 * searches every room he has entered, collects the pickups and opens the
 * exits he can reach, and repeats until nothing new turns up. Every round
 * that adds something is recorded, which is the order the world can be
 * finished in (D67). The rest follows from the final state: what stays
 * out of reach is a problem, and for what is reachable the report tells
 * which abilities each exit and pickup needs (the smallest sets of one or
 * two; more is reported as "several").
 */
import { buildRoom } from './room.js';
import { ABILITIES, analyzeRoom, arrivalCells } from './reach.js';

/** Largest ability set tried when working out what a target needs. */
const NEEDS_SIZE = 2;

/** @param {object} type a pickup type @returns {string|null} the id of the movement ability it gives */
function abilityOf(type) {
  if (type.kind === 'disk') return type.spell;
  if (type.kind === 'upgrade') return type.upgrade;
  return null;
}

/** All subsets of `items` of exactly `size`. */
function subsets(items, size) {
  if (size === 0) return [[]];
  const out = [];
  items.forEach((item, i) => {
    for (const rest of subsets(items.slice(i + 1), size - 1)) out.push([item, ...rest]);
  });
  return out;
}

/**
 * @typedef {object} WorldReach
 * @property {Map<string, { entries: Map<string, { have: string[], access: number }>, reach: object|null }>} rooms
 *   by room id: how the wizard first entered it (by the exit he came in through, with what he had then; the start is "start"), and what he reaches in it at the end
 * @property {{ round: number, rooms: string[], gained: string[], access: number }[]} rounds the order
 * @property {string[]} abilities everything he ends up with (spells and upgrades)
 * @property {number} access final access level
 * @property {Set<string>} fragments the fragment pickup types found, by id
 * @property {boolean} coreReached
 * @property {{ room: string, kind: 'pickup'|'exit', id: string, needs: string[][]|null, access?: number }[]} targets what the rooms hold in reach: the smallest ability sets each needs ([[]]: nothing); null: never reachable
 * @property {string[]} errors problems: rooms, pickups or exits he can never reach
 * @property {string[]} warnings things to look at: rooms not connected, a search cut short, a way back missing
 */

/**
 * @param {object} content loaded game data (data/load.js loadGameData)
 * @param {{ needs?: boolean }} [options] `needs: false` skips the per-target ability sets
 * @returns {WorldReach}
 */
export function analyzeWorld(content, { needs = true } = {}) {
  const { world, links } = content;
  const rooms = new Map([...content.rooms].map(([id, data]) => [id, buildRoom(data, content)]));
  const tuning = { scanRange: content.spells.scan?.range, blinkRange: content.spells.blink?.range };
  const thresholds = world.fragments?.access ?? [];

  const state = new Map(); // room id → { entries, reach }
  for (const id of rooms.keys()) state.set(id, { entries: new Map(), reach: null });
  const have = new Set();
  const fragments = new Set();
  let access = 0;
  let coreReached = false;
  const rounds = [];
  const warnings = [];

  const startRoom = rooms.get(world.start);
  state.get(world.start).entries.set('start', { have: [], access: 0, cells: [[Math.floor(startRoom.spawn[0]), Math.round(startRoom.spawn[1]), Math.floor(startRoom.spawn[2])]] });

  // The fixpoint: search every entered room with what he has now, until a round changes nothing.
  let signature = '';
  for (let round = 1; round <= 200; round++) {
    // A round searches with what he had when it began; what it finds counts from the next one.
    const roomsNew = [];
    const gained = [];
    const accessBefore = access;
    const abilities = new Set(have);
    const pending = [];
    for (const [id, room] of rooms) {
      const entry = state.get(id);
      if (entry.entries.size === 0) continue;
      const starts = [...entry.entries.values()].flatMap((e) => e.cells);
      const reach = analyzeRoom(room, { abilities, starts, tuning });
      if (reach.truncated && !entry.truncated) {
        entry.truncated = true;
        warnings.push(`${id}: crate search stopped at ${reach.configs} configurations; the verdict may miss a solution`);
      }
      entry.reach = reach;
      if (!entry.seen) {
        entry.seen = true;
        roomsNew.push(id);
      }
      for (const pickup of room.pickups) {
        if (!reach.pickups.has(pickup.id)) continue;
        const ability = abilityOf(pickup);
        if (ability && !have.has(ability)) {
          have.add(ability);
          gained.push(ability);
        }
        if (pickup.kind === 'fragment') fragments.add(pickup.type);
        if (pickup.kind === 'access' && pickup.level > access) access = pickup.level;
      }
      if (reach.core) {
        coreReached = true;
        const level = thresholds.filter((n) => fragments.size >= n).length;
        if (level > access) access = level;
      }
      for (const exit of room.exits) {
        if (!reach.exits[exit.id] || (exit.access ?? 0) > accessBefore) continue;
        const other = links.get(`${id}.${exit.id}`);
        if (!other || state.get(other.room).entries.has(other.exit) || pending.some((p) => p.key === `${other.room}.${other.exit}`)) continue;
        pending.push({ key: `${other.room}.${other.exit}`, room: other.room, exit: other.exit, have: [...abilities], access: accessBefore });
      }
    }
    for (const { room, exit, have: had, access: level } of pending) state.get(room).entries.set(exit, { have: had, access: level, cells: arrivalCells(rooms.get(room), exit) });
    if (roomsNew.length > 0 || gained.length > 0 || access !== accessBefore || pending.length > 0) rounds.push({ round, rooms: roomsNew, gained, access });
    const next = JSON.stringify([have.size, access, fragments.size, [...state.values()].map((s) => [s.entries.size, s.reach?.stands.size, s.reach && Object.values(s.reach.exits).filter(Boolean).length, s.reach?.pickups.size])]);
    if (next === signature) break;
    signature = next;
  }

  const errors = [];
  const targets = [];
  const entered = [...state].filter(([, s]) => s.entries.size > 0).map(([id]) => id);
  const connected = connectedRooms(world.start, rooms, links);
  for (const id of rooms.keys()) {
    if (entered.includes(id)) continue;
    if (connected.has(id)) errors.push(`${id}: no way in, the exits to it never open (with every ability found)`);
    else warnings.push(`${id}: not connected to the start room`);
  }
  for (const id of entered) {
    const room = rooms.get(id);
    const { reach, entries } = state.get(id);
    if (reach.deadStart) errors.push(`${id}: every cell he arrives on is a hole, hazard or void`);
    for (const pickup of room.pickups) {
      if (!reach.pickups.has(pickup.id)) errors.push(`${id}: pickup "${pickup.id}" at [${pickup.at}] can't be reached`);
    }
    for (const exit of room.exits) {
      if (reach.exits[exit.id]) continue;
      if (exit.access && exit.access > access) errors.push(`${id}: exit "${exit.id}" needs access level ${exit.access}, but he only gets ${access}`);
      else errors.push(`${id}: exit "${exit.id}" can't be reached`);
    }
    // The way back: from where he arrived, with what he had then, he must reach the exit he came through.
    for (const [exitId, entry] of entries) {
      if (exitId === 'start') continue;
      const back = analyzeRoom(room, { abilities: entry.have, starts: entry.cells, tuning });
      if (!reach.exits[exitId] && !back.stands.size) continue;
      if (!entry.cells.some(([x, y, z]) => back.stands.has(`${x},${y},${z}`))) warnings.push(`${id}: after arriving through "${exitId}" with ${entry.have.join(', ') || 'nothing'} he can't get back out the way he came`);
    }
    for (const pickup of room.pickups) targets.push({ room: id, kind: 'pickup', id: pickup.id, needs: reach.pickups.has(pickup.id) ? [[]] : null });
    for (const exit of room.exits) targets.push({ room: id, kind: 'exit', id: exit.id, needs: reach.exits[exit.id] ? [[]] : null, ...(exit.access && { access: exit.access }) });
  }
  if (needs) {
    for (const id of entered) {
      const found = findNeeds(rooms.get(id), [...state.get(id).entries.values()][0].cells, ABILITIES.filter((a) => have.has(a)), tuning);
      for (const target of targets) if (target.room === id && target.needs) target.needs = found.get(`${target.kind}:${target.id}`) ?? [];
    }
  }

  const required = world.fragments?.required ?? 0;
  const total = new Set([...rooms.values()].flatMap((room) => room.pickups.filter((p) => p.kind === 'fragment').map((p) => p.type))).size;
  if (total < required) warnings.push(`the world holds ${total} of the ${required} key fragments the core asks for, so it can't be finished yet`);
  else if (fragments.size < required) errors.push(`only ${fragments.size} of the ${required} key fragments can be reached`);
  if (![...rooms.values()].some((room) => room.objects.some((o) => o.kind === 'core'))) warnings.push('no core in any room');
  else if (!coreReached) errors.push('the core can\'t be reached');

  return { rooms: state, rounds, abilities: [...have], access, fragments, coreReached, targets, errors, warnings };
}

/** Rooms joined to the start by connections alone (no abilities asked). */
function connectedRooms(start, rooms, links) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.pop();
    for (const exit of rooms.get(id).exits) {
      const other = links.get(`${id}.${exit.id}`);
      if (other && !seen.has(other.room)) {
        seen.add(other.room);
        queue.push(other.room);
      }
    }
  }
  return seen;
}

/**
 * The smallest ability sets (up to NEEDS_SIZE) from `pool` with which each
 * exit and pickup of a room is reachable from `starts`. An empty list: it
 * needs more than that ("several"). Measured from where he first arrives:
 * arriving later through another exit means he has been across already.
 * @returns {Map<string, string[][]>} by "pickup:<id>" or "exit:<id>"
 */
function findNeeds(room, starts, pool, tuning) {
  const keys = [...room.pickups.map((p) => `pickup:${p.id}`), ...room.exits.map((e) => `exit:${e.id}`)];
  const found = new Map(keys.map((key) => [key, []]));
  for (let size = 0; size <= NEEDS_SIZE; size++) {
    for (const set of subsets(pool, size)) {
      const open = keys.filter((key) => !found.get(key).some((smaller) => smaller.every((a) => set.includes(a))));
      if (open.length === 0) return found;
      const reach = analyzeRoom(room, { abilities: set, starts, tuning });
      for (const key of open) {
        const [kind, id] = key.split(':');
        if (kind === 'pickup' ? reach.pickups.has(id) : reach.exits[id]) found.get(key).push(set);
      }
    }
  }
  return found;
}

/**
 * One room on its own (D131), without searching the world: what the wizard
 * reaches in it with the abilities given, from the spawn point or, with
 * `from`, the arrival cells of that exit. For designing a room; the world-level check says
 * which abilities he really has by the time he gets there.
 * @param {object} content loaded game data
 * @param {string} id room id
 * @param {{ abilities?: string[], needs?: boolean, from?: string|null }} [options]
 * @returns {{ errors: string[], warnings: string[], targets: WorldReach['targets'] }}
 */
export function analyzeRoomAlone(content, id, { abilities = [], needs = true, from = null } = {}) {
  const data = content.rooms.get(id);
  if (!data) throw new Error(`no room "${id}"`);
  const room = buildRoom(data, content);
  const tuning = { scanRange: content.spells.scan?.range, blinkRange: content.spells.blink?.range };
  const spawn = [Math.floor(room.spawn[0]), Math.round(room.spawn[1]), Math.floor(room.spawn[2])];
  if (from && !room.exits.some((exit) => exit.id === from)) throw new Error(`room "${id}" has no exit "${from}"`);
  const starts = from ? arrivalCells(room, from) : [spawn];
  const reach = analyzeRoom(room, { abilities, starts, tuning });
  const errors = [];
  const warnings = [];
  if (reach.truncated) warnings.push(`${id}: crate search stopped at ${reach.configs} configurations; the verdict may miss a solution`);
  const found = needs ? findNeeds(room, starts, abilities.filter((a) => ABILITIES.includes(a)), tuning) : new Map();
  const targets = [];
  for (const pickup of room.pickups) {
    const ok = reach.pickups.has(pickup.id);
    if (!ok) errors.push(`${id}: pickup "${pickup.id}" at [${pickup.at}] can't be reached`);
    targets.push({ room: id, kind: 'pickup', id: pickup.id, needs: ok ? found.get(`pickup:${pickup.id}`) ?? [[]] : null });
  }
  for (const exit of room.exits) {
    const ok = reach.exits[exit.id];
    if (!ok) errors.push(`${id}: exit "${exit.id}" can't be reached`);
    targets.push({ room: id, kind: 'exit', id: exit.id, needs: ok ? found.get(`exit:${exit.id}`) ?? [[]] : null, ...(exit.access && { access: exit.access }) });
  }
  return { errors, warnings, targets };
}
