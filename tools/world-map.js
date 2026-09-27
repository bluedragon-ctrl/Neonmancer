/**
 * World map tool (CLAUDE.md §9, D66): the whole world at a glance for the
 * developer. Every room is a node in its biome color, in its cell of the
 * map grid (`positions` in world.json); lines join connected exits, drawn
 * from the side each exit is on. Flags what room validation can't see:
 * rooms the start can't reach, and test rooms more than two rooms from the
 * start (D49).
 *
 * Drag a room to another free cell and save (the dev server merges the
 * moves into world.json). Click a room to open it in the room editor.
 * Connections are edited in the room editor.
 *
 * Open /tools/world-map.html in the dev server; it is not part of the
 * build, so players never see it (D67).
 */
import './world-map.css';
import { DATA_FILES, DEV_SERVER, SCHEMA_ERRORS } from '../src/data/bundle.js';
import { sideLength, withExitDefaults } from '../src/data/room-data.js';
import { validateData } from '../src/data/validate.js';
import { DATA_SAVED_EVENT, saveFiles } from '../src/editor/save.js';
import { TEST_ROOM_REACH, mapKey, mapWarnings, nearestFreeCell, roomDistances } from '../src/world/map.js';

/** Map units per grid cell, and a room node's size in them. */
const CELL = 180;
const NODE = 128;
/** Empty cells shown around the rooms, to drag them into. */
const MARGIN = 1;
/** Pointer travel (px) that turns a click into a drag. */
const DRAG_START = 5;
/** Window the game opens in from here: one tab, reused. */
const GAME_WINDOW = 'neonmancer-game';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Unit vector [x, z] of each side on the map. */
const SIDE_DIR = { '-x': [-1, 0], '+x': [1, 0], '-z': [0, -1], '+z': [0, 1] };

const mapEl = document.getElementById('map');
const panelEl = document.getElementById('panel');

/** Create an SVG element with attributes (and optional text). */
function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Create an HTML element with a class and text. */
function html(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Room name split into lines of at most `max` characters, at spaces. */
function wrap(text, max = 16) {
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= max) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines.slice(0, 2);
}

const world = structuredClone(DATA_FILES['world.json']);
const biomes = DATA_FILES['biomes.json']?.biomes ?? {};
/** room id → room data */
const rooms = new Map(
  Object.entries(DATA_FILES)
    .filter(([file]) => file.startsWith('rooms/'))
    .map(([, room]) => [room.id, room]),
);

const state = {
  /** room id → [x, z], as shown (saved positions plus unsaved moves) */
  positions: structuredClone(world?.positions ?? {}),
  /** room id → [x, z] as saved */
  saved: structuredClone(world?.positions ?? {}),
  /** Moves, newest last, for undo: { id, from } */
  history: [],
  /** Room being dragged: { id, pointer, start, moved, offset } */
  drag: null,
  /** Room highlighted from the panel. */
  picked: null,
  status: '',
  statusKind: '',
  saving: false,
  /** Ignore the dev server's saved event until then (it announces our own save). */
  quietUntil: 0,
  /** Data on disk changed (another page saved) while there are unsaved moves. */
  stale: false,
};

/** Rooms without a position (a room file added by hand) get a free cell next to the start, unsaved. */
for (const id of rooms.keys()) {
  if (state.positions[id]) continue;
  state.positions[id] = nearestFreeCell(state.positions, state.positions[world.start] ?? [0, 0]);
}

/** Room ids whose position differs from the saved one. */
function movedRooms() {
  return [...rooms.keys()].filter((id) => mapKey(state.positions[id]) !== mapKey(state.saved[id] ?? [NaN, NaN]));
}

/** The room in a map cell, if any. */
function roomAt(cell) {
  const key = mapKey(cell);
  return [...rooms.keys()].find((id) => mapKey(state.positions[id]) === key) ?? null;
}

/** Validation errors of the data with the map as shown. */
function dataErrors() {
  if (SCHEMA_ERRORS.length > 0) return SCHEMA_ERRORS;
  return validateData({ ...DATA_FILES, 'world.json': { ...world, positions: state.positions } });
}

// --- Geometry ----------------------------------------------------------------

/** Center of a map cell, in map units. */
const cellCenter = ([x, z]) => [x * CELL, z * CELL];

/**
 * Where an exit leaves its room's node: on the node side it is on, as far
 * along it as the exit is along the room's side.
 * @returns {{ point: number[], dir: number[] }} map units, and the side's outward direction
 */
function exitAnchor(roomId, exitId, center) {
  const room = rooms.get(roomId);
  const exit = room?.exits?.find((e) => e.id === exitId);
  if (!exit) return { point: center, dir: [0, 0] };
  const { side, at, width } = withExitDefaults(exit);
  const t = (at + width / 2) / sideLength(side, room.size) - 0.5;
  const dir = SIDE_DIR[side];
  const half = NODE / 2;
  // Along the side: x for the ±z sides, z for the ±x sides.
  const along = t * NODE;
  const point = dir[0] !== 0 ? [center[0] + dir[0] * half, center[1] + along] : [center[0] + along, center[1] + dir[1] * half];
  return { point, dir };
}

/** Curve between two exit anchors, leaving each along its side's direction. */
function linkPath(a, b) {
  const reach = Math.max(CELL - NODE, Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1]) * 0.35);
  const c1 = [a.point[0] + a.dir[0] * reach, a.point[1] + a.dir[1] * reach];
  const c2 = [b.point[0] + b.dir[0] * reach, b.point[1] + b.dir[1] * reach];
  return `M ${a.point.join(' ')} C ${c1.join(' ')} ${c2.join(' ')} ${b.point.join(' ')}`;
}

/** Map cells to draw: around every room, with a margin. */
function bounds() {
  const cells = Object.values(state.positions);
  if (state.drag) cells.push(state.drag.cell);
  const xs = cells.map(([x]) => x);
  const zs = cells.map(([, z]) => z);
  return {
    minX: Math.min(0, ...xs) - MARGIN,
    maxX: Math.max(0, ...xs) + MARGIN,
    minZ: Math.min(0, ...zs) - MARGIN,
    maxZ: Math.max(0, ...zs) + MARGIN,
  };
}

// --- Drawing -----------------------------------------------------------------

let svgEl = null;
/** Bounds the view was framed for; kept while dragging so the map doesn't jump. */
let frame = null;

function draw() {
  if (!state.drag) frame = bounds();
  const { minX, maxX, minZ, maxZ } = frame;
  const x0 = (minX - 0.5) * CELL;
  const z0 = (minZ - 0.5) * CELL;
  svgEl?.remove();
  svgEl = svg('svg', { viewBox: `${x0} ${z0} ${(maxX - minX + 1) * CELL} ${(maxZ - minZ + 1) * CELL}` });

  // Grid: a dot in every cell.
  const grid = svg('g');
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) grid.append(svg('circle', { class: 'cell', cx: x * CELL, cy: z * CELL, r: 3 }));
  }
  svgEl.append(grid);

  // Connections under the rooms.
  const links = svg('g');
  for (const [refA, refB] of world.connections ?? []) {
    const [roomA, exitA] = refA.split('.');
    const [roomB, exitB] = refB.split('.');
    if (!state.positions[roomA] || !state.positions[roomB]) continue;
    const a = exitAnchor(roomA, exitA, centerOf(roomA));
    const b = exitAnchor(roomB, exitB, centerOf(roomB));
    // Neighbours that way round on the map: a plain line; otherwise dashed.
    const step = [state.positions[roomB][0] - state.positions[roomA][0], state.positions[roomB][1] - state.positions[roomA][1]];
    const across = step[0] !== a.dir[0] || step[1] !== a.dir[1];
    const path = svg('path', { class: `link${across ? ' across' : ''}`, d: linkPath(a, b) });
    path.append(svg('title', {}, `${refA} ↔ ${refB}`));
    links.append(path, svg('circle', { class: 'link-end', cx: a.point[0], cy: a.point[1], r: 4 }), svg('circle', { class: 'link-end', cx: b.point[0], cy: b.point[1], r: 4 }));
  }
  svgEl.append(links);

  const { unreachable, far } = mapWarnings(world, rooms.keys());
  const farBy = new Map(far.map(({ id, distance }) => [id, distance]));
  const moved = new Set(movedRooms());
  for (const id of rooms.keys()) svgEl.append(roomNode(id, { unreachable: unreachable.includes(id), far: farBy.get(id), moved: moved.has(id) }));

  // Where a dragged room would land.
  if (state.drag?.moved) {
    const [cx, cz] = cellCenter(state.drag.cell);
    const other = roomAt(state.drag.cell);
    const taken = other !== null && other !== state.drag.id;
    const half = NODE / 2 + 6;
    svgEl.append(svg('rect', { class: `target${taken ? ' taken' : ''}`, x: cx - half, y: cz - half, width: 2 * half, height: 2 * half }));
  }

  mapEl.append(svgEl);
}

/** Center of a room's node: its cell, or under the pointer while dragged. */
function centerOf(id) {
  if (state.drag?.id === id && state.drag.moved) return state.drag.point;
  return cellCenter(state.positions[id]);
}

function roomNode(id, { unreachable, far, moved }) {
  const room = rooms.get(id);
  const color = biomes[room.biome]?.color ?? '#ffb020';
  const [cx, cz] = centerOf(id);
  const classes = ['room', unreachable && 'unreachable', state.drag?.id === id && state.drag.moved && 'dragging', state.picked === id && 'picked'];
  const g = svg('g', { class: classes.filter(Boolean).join(' '), transform: `translate(${cx} ${cz})`, 'data-room': id });
  const half = NODE / 2;
  if (id === world.start) g.append(svg('rect', { class: 'start', x: -half - 7, y: -half - 7, width: NODE + 14, height: NODE + 14 }));
  g.append(svg('rect', { class: 'box', x: -half, y: -half, width: NODE, height: NODE, stroke: color, style: `filter: drop-shadow(0 0 6px ${color})` }));

  const name = wrap(room.name);
  name.forEach((line, i) => g.append(svg('text', { class: 'name', x: 0, y: -26 + i * 16 - (name.length - 1) * 8, fill: color }, line)));
  g.append(svg('text', { class: 'info', x: 0, y: 12 }, id));
  g.append(svg('text', { class: 'info', x: 0, y: 28 }, room.size.join('×')));
  if (id === world.start) g.append(svg('text', { class: 'flag', x: 0, y: 50, fill: 'var(--lime)' }, 'START'));
  else if (unreachable) g.append(svg('text', { class: 'flag', x: 0, y: 50, fill: 'var(--magenta)' }, 'UNREACHABLE'));
  else if (far !== undefined) g.append(svg('text', { class: 'flag', x: 0, y: 50, fill: 'var(--amber)' }, `${far} ROOMS OUT`));
  if (moved) g.append(svg('circle', { class: 'moved', cx: half - 10, cy: -half + 10, r: 5 }, undefined));
  g.append(svg('title', {}, `${room.name} (${id}) — click to edit, drag to move`));
  return g;
}

function drawPanel() {
  panelEl.replaceChildren();
  panelEl.append(html('h1', '', 'WORLD MAP'));
  const connections = world.connections?.length ?? 0;
  panelEl.append(html('div', 'counts', `${rooms.size} rooms · ${connections} connections`));

  const moved = movedRooms();
  const save = html('button', '', moved.length > 0 ? `Save ${moved.length} move${moved.length === 1 ? '' : 's'}` : 'Saved');
  save.disabled = moved.length === 0 || state.saving;
  save.addEventListener('click', saveMoves);
  panelEl.append(save);
  panelEl.append(html('div', `status ${state.statusKind}`, state.status));
  if (state.stale) panelEl.append(html('div', 'status warn', 'Data changed on disk (saved from another page). Save or undo your moves, then reload.'));

  const errors = dataErrors();
  const distances = roomDistances(world.start, world.connections ?? []);
  const { unreachable, far } = mapWarnings(world, rooms.keys());

  panelEl.append(html('h2', '', 'CHECKS'));
  const list = html('ul');
  for (const id of unreachable) list.append(roomItem(id, 'warn', `${id}: not reachable from ${world.start}`));
  for (const { id, distance } of far) {
    list.append(roomItem(id, 'warn', `${id}: ${distance} rooms from ${world.start}; test rooms stay within ${TEST_ROOM_REACH} (D49)`));
  }
  for (const error of errors) list.append(html('li', 'error', error));
  if (list.children.length === 0) list.append(html('li', 'fine', `All ${distances.size} rooms reachable, all within ${TEST_ROOM_REACH} of the start.`));
  panelEl.append(list);

  panelEl.append(html('h2', '', 'HOW TO'));
  const help = html('ul', 'help');
  for (const line of [
    'Drag a room to a free cell.',
    'Click a room to open it in the room editor (F2 there to play).',
    'Ctrl+Z undoes a move, Ctrl+S saves.',
    'Solid line: neighbours on the map that way round. Dashed: connected across the map.',
    'Connections are edited in the room editor.',
  ]) {
    help.append(html('li', '', line));
  }
  panelEl.append(help);
}

function roomItem(id, className, text) {
  const item = html('li', className, text);
  item.dataset.room = id;
  item.addEventListener('click', () => {
    state.picked = state.picked === id ? null : id;
    draw();
  });
  return item;
}

function render() {
  draw();
  drawPanel();
}

// --- Dragging and clicking ---------------------------------------------------

/** Pointer position in map units. */
function mapPoint(event) {
  const matrix = svgEl.getScreenCTM().inverse();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
  return [point.x, point.y];
}

mapEl.addEventListener('pointerdown', (event) => {
  const node = event.target.closest?.('.room');
  if (!node || event.button !== 0) return;
  const id = node.dataset.room;
  const point = mapPoint(event);
  const [cx, cz] = cellCenter(state.positions[id]);
  state.drag = { id, screen: [event.clientX, event.clientY], offset: [point[0] - cx, point[1] - cz], point: [cx, cz], cell: state.positions[id], moved: false };
  mapEl.setPointerCapture(event.pointerId);
});

mapEl.addEventListener('pointermove', (event) => {
  const drag = state.drag;
  if (!drag) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.screen[0], event.clientY - drag.screen[1]) < DRAG_START) return;
  drag.moved = true;
  const [px, pz] = mapPoint(event);
  drag.point = [px - drag.offset[0], pz - drag.offset[1]];
  drag.cell = [Math.round(drag.point[0] / CELL), Math.round(drag.point[1] / CELL)];
  draw();
});

mapEl.addEventListener('pointerup', () => {
  const drag = state.drag;
  if (!drag) return;
  state.drag = null;
  if (!drag.moved) {
    openInEditor(drag.id);
    return;
  }
  const other = roomAt(drag.cell);
  if (other === null) {
    state.history.push({ id: drag.id, from: state.positions[drag.id] });
    state.positions[drag.id] = drag.cell;
    setStatus('');
  } else if (other !== drag.id) {
    setStatus(`That cell is ${other}'s.`, 'bad');
  }
  render();
});

mapEl.addEventListener('pointercancel', () => {
  state.drag = null;
  draw();
});

function openInEditor(id) {
  window.open(`/?room=${encodeURIComponent(id)}&edit`, GAME_WINDOW)?.focus();
}

window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'z') {
    event.preventDefault();
    const last = state.history.pop();
    if (last) {
      state.positions[last.id] = last.from;
      setStatus(`Undid the move of ${last.id}.`);
      render();
    }
  } else if (key === 's') {
    event.preventDefault();
    saveMoves();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (movedRooms().length > 0) event.preventDefault();
});

// --- Saving ------------------------------------------------------------------

function setStatus(text, kind = '') {
  state.status = text;
  state.statusKind = kind;
}

async function saveMoves() {
  const moved = movedRooms();
  if (moved.length === 0 || state.saving) return;
  state.saving = true;
  setStatus('Saving…');
  render();
  const positions = Object.fromEntries(moved.map((id) => [id, state.positions[id]]));
  const result = await saveFiles({ positions });
  state.saving = false;
  state.quietUntil = performance.now() + 1500;
  if (result.ok) {
    Object.assign(state.saved, positions);
    state.history = [];
    // Another page's save came in meanwhile: it is on disk, so show it.
    if (state.stale) {
      location.reload();
      return;
    }
    setStatus(`Saved ${result.files.join(', ')}.`, 'ok');
  } else {
    setStatus(`Not saved: ${result.errors.join(' · ')}`, 'bad');
  }
  render();
}

// Another page (the room editor) saved: show the data as it is now, unless
// that would lose moves not saved yet.
import.meta.hot?.on(DATA_SAVED_EVENT, () => {
  if (state.saving || performance.now() < state.quietUntil) return;
  if (movedRooms().length === 0) location.reload();
  else {
    state.stale = true;
    drawPanel();
  }
});

// --- Start -------------------------------------------------------------------

if (!DEV_SERVER) {
  panelEl.append(html('h1', '', 'WORLD MAP'), html('p', '', 'The world map tool runs in the dev server only (npm run dev).'));
} else if (SCHEMA_ERRORS.length > 0 || !world?.connections) {
  drawPanel();
} else {
  render();
}
