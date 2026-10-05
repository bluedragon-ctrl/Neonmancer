/**
 * The world map (D66): every room sits in one cell of a simple grid, at its
 * position in world.json ([x, z]: +x east, +z south, as in a room). Plain
 * logic shared by the world map tool, the room editor and validation; the
 * player's map screen (Phase 4) will use it too.
 */

/** "x,z" key of a map cell. */
export const mapKey = ([x, z]) => `${x},${z}`;

/**
 * The free cell nearest to `near`: its four neighbours first (east, south,
 * west, north), then rings further out, nearest first.
 * @param {Record<string, number[]>} positions room id → [x, z]
 * @param {number[]} near [x, z]
 * @returns {number[]} [x, z]
 */
export function nearestFreeCell(positions, near) {
  const taken = new Set(Object.values(positions).map(mapKey));
  const [nx, nz] = near;
  for (let ring = 1; ; ring++) {
    // Cells at this Chebyshev distance: nearest first, then clockwise from east.
    const cells = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === ring) cells.push([dx, dz]);
      }
    }
    const angle = ([dx, dz]) => (Math.atan2(dz, dx) + 2 * Math.PI) % (2 * Math.PI);
    const distance = ([dx, dz]) => dx * dx + dz * dz;
    cells.sort((a, b) => distance(a) - distance(b) || angle(a) - angle(b));
    const free = cells.map(([dx, dz]) => [nx + dx, nz + dz]).find((cell) => !taken.has(mapKey(cell)));
    if (free) return free;
  }
}

/**
 * How many rooms each room is from the start, going through connected exits.
 * @param {string} start room id
 * @param {string[][]} connections pairs of "room.exit"
 * @returns {Map<string, number>} room id → rooms away (the start is 0); rooms
 *   the start can't reach are missing
 */
export function roomDistances(start, connections) {
  /** room id → rooms connected to it */
  const next = new Map();
  for (const [a, b] of connections) {
    const [ra, rb] = [a.split('.')[0], b.split('.')[0]];
    if (!next.has(ra)) next.set(ra, new Set());
    if (!next.has(rb)) next.set(rb, new Set());
    next.get(ra).add(rb);
    next.get(rb).add(ra);
  }
  const distances = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const room = queue.shift();
    for (const other of next.get(room) ?? []) {
      if (distances.has(other)) continue;
      distances.set(other, distances.get(room) + 1);
      queue.push(other);
    }
  }
  return distances;
}

/**
 * What room validation can't see (D66): rooms the start can't reach through
 * exits. How far out a room lies is no warning (D178).
 * @param {{ start: string, connections: string[][] }} world
 * @param {Iterable<string>} roomIds every room
 * @returns {{ unreachable: string[] }}
 */
export function mapWarnings(world, roomIds) {
  const distances = roomDistances(world.start, world.connections);
  return { unreachable: [...roomIds].filter((id) => !distances.has(id)) };
}

/**
 * The room with a backup shrine nearest to `from` on the world map (D97):
 * fewest map cells apart counted along the grid (|dx| + |dz|), the room
 * itself first. Ties go to `preferred` (the shrine used last), then to room
 * order.
 * @param {Map<string, object>} rooms room data by id, in load order
 * @param {Record<string, number[]>} positions room id → [x, z]
 * @param {string} from the room he crashed in
 * @param {string|null} [preferred] the room of the shrine used last
 * @returns {string|null} room id, or null when no room has a shrine
 */
export function nearestShrine(rooms, positions, from, preferred = null) {
  const [fx, fz] = positions[from] ?? [0, 0];
  let best = null;
  let bestDistance = Infinity;
  for (const [id, room] of rooms) {
    if (!room.shrine || !positions[id]) continue;
    const [x, z] = positions[id];
    const distance = Math.abs(x - fx) + Math.abs(z - fz);
    if (distance < bestDistance || (distance === bestDistance && id === preferred)) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}
