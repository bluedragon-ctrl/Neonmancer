/**
 * World map tool (CLAUDE.md §9, D66): the whole world at a glance for the
 * developer. Every room is a node in its biome color, in its cell of the
 * map grid (`positions` in world.json); lines join connected exits, drawn
 * from the side each exit is on. Flags what room validation can't see:
 * rooms the start can't reach, and test rooms more than two rooms from the
 * start (D49); authored rooms (D90) are marked and may lie further out.
 *
 * Tools (D77): Move drags a room to another free cell (click opens it in
 * the room editor); Add puts a new, empty room in a free cell; Connect
 * joins two rooms with an exit in the middle of each one's facing wall;
 * Delete removes a room (with the exits leading into it), a connection
 * (with both its exits) or an exit (D102: click its mark on the room's edge). Save sends it all to the dev server, which checks
 * it and writes the room files and world.json (MapEdit, editor/map-edit.js).
 *
 * F3 opens the pickup report: every permanent item (disks, upgrades,
 * buffs, fragments, secrets) by its save bit and the rooms it lies in, flagging items not
 * placed yet and items placed more than once (pickup-report.js).
 *
 * Open /tools/world-map.html in the dev server; it is not part of the
 * build, so players never see it (D67).
 */
import './world-map.css';
import { DATA_FILES, DEV_SERVER, SCHEMA_ERRORS } from '../src/data/bundle.js';
import { sideLength, withExitDefaults } from '../src/data/room-data.js';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { MapEdit } from '../src/editor/map-edit.js';
import { DATA_SAVED_EVENT, saveFiles } from '../src/editor/save.js';
import { BUFF_COLORS, SECRET_COLOR } from '../src/entities/pickup.js';
import { TEST_ROOM_REACH, mapKey, mapWarnings, roomDistances } from '../src/world/map.js';
import { pickupReport } from '../src/world/pickup-report.js';
import { analyzeWorld } from '../src/world/reach-world.js';
import { SAVE_BLOCKS } from '../src/world/progress.js';

/** Map units per grid cell, and a room node's size in them. */
const CELL = 180;
const NODE = 128;
/** An exit's mark on the node edge, and the area that takes a click: [along, across] in map units. */
const EXIT_MARK = [16, 6];
const EXIT_HIT = [24, 18];
/** Empty cells shown around the rooms, to drag them into. */
const MARGIN = 1;
/** Pointer travel (px) that turns a click into a drag. */
const DRAG_START = 5;
/** Session storage key of the status line kept over a reload after saving. */
const STATUS_KEY = 'neonmancer-world-map-status';
/** Session storage key of the last save's rollback point (D103), kept over a reload. */
const ROLLBACK_KEY = 'neonmancer-world-map-rollback';
/** Window the game opens in from here: one tab, reused. */
const GAME_WINDOW = 'neonmancer-game';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Unit vector [x, z] of each side on the map. */
const SIDE_DIR = { '-x': [-1, 0], '+x': [1, 0], '-z': [0, -1], '+z': [0, 1] };

/** The map's tools, in panel order; `key` is the digit that picks it. */
const TOOLS = [
  { id: 'move', label: 'Move', key: '1', help: 'Drag a room to a free cell; click it to open it in the room editor.' },
  { id: 'add', label: 'Add', key: '2', help: 'Click a free cell to put a new, empty room there (12×4×12, no exits).' },
  {
    id: 'connect',
    label: 'Connect',
    key: '3',
    help: 'Drag from one room to another (or click both): each gets an exit in the middle of the wall facing the other, or uses a loose exit already in that wall.',
  },
  {
    id: 'delete',
    label: 'Delete',
    key: '4',
    help: 'Click a room to remove it (and the exits into it), a connection to remove it and both its exits, or an exit mark on a room edge: a connected exit goes with its partner, a loose one (magenta) alone.',
  },
];

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

const biomes = DATA_FILES['biomes.json']?.biomes ?? {};
/** The world as edited: rooms, positions and connections (null without valid data). */
const edit = SCHEMA_ERRORS.length === 0 && DATA_FILES['world.json']?.connections ? new MapEdit(DATA_FILES) : null;

const state = {
  tool: 'move',
  /** Room pressed: { id, tool, screen, offset, point, cell, moved } (dragged when moved) */
  drag: null,
  /** Connect tool: the room clicked first, waiting for the second. */
  linkFrom: null,
  /** Add tool: the cell under the pointer. */
  hover: null,
  /** Room highlighted from the panel. */
  picked: null,
  /** Add tool: the new room's id (a free `room_N` when empty) and biome. */
  newId: '',
  newBiome: Object.keys(biomes)[0] ?? '',
  status: '',
  statusKind: '',
  saving: false,
  /** Ignore the dev server's saved event until then (it announces our own save). */
  quietUntil: 0,
  /** What the last save overwrote (MapEdit.rollbackPoint()), for Undo last save; null when there is none. */
  rollback: null,
  /** Data on disk changed (another page saved) while there are unsaved changes. */
  stale: false,
  /** The pickup report (F3) is open. */
  report: false,
};

/** Validation errors of the data as edited. */
function dataErrors() {
  if (SCHEMA_ERRORS.length > 0) return SCHEMA_ERRORS;
  return validateData(edit.dataFiles());
}

/**
 * Reachability of the data as edited (D131): problems and warnings from the
 * checker, or none while the data is invalid (the checks above say why).
 */
function reachReport() {
  if (dataErrors().length > 0) return { errors: [], warnings: [] };
  try {
    const { errors, warnings } = analyzeWorld(loadGameData(edit.dataFiles()), { needs: false });
    return { errors, warnings };
  } catch (error) {
    return { errors: [`reachability check failed: ${error.message}`], warnings: [] };
  }
}

/** The room a reachability message starts with ("room_id: ..."), if it is one. */
const roomOf = (message) => message.match(/^([a-z0-9_]+):/)?.[1];

/** Rooms with unsaved changes: moved, new, or with exits added or removed. */
function unsavedRooms() {
  const { rooms, positions } = edit.changes();
  return new Set([...rooms.map((room) => room.id), ...Object.keys(positions)]);
}

/** Save button text: what the save would send. */
function changesText() {
  const { moved, added, removed, changed, links } = edit.changes().counts;
  const parts = [];
  if (moved > 0) parts.push(`${moved} moved`);
  if (added > 0) parts.push(`${added} new`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (changed > 0) parts.push(`${changed} changed`);
  else if (links) parts.push('connections');
  return parts.length > 0 ? `Save: ${parts.join(', ')}` : 'Saved';
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
  const room = edit.rooms.get(roomId);
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
  const cells = Object.values(edit.positions);
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
  edit.connections.forEach(([refA, refB], index) => {
    const [roomA, exitA] = refA.split('.');
    const [roomB, exitB] = refB.split('.');
    if (!edit.positions[roomA] || !edit.positions[roomB]) return;
    const a = exitAnchor(roomA, exitA, centerOf(roomA));
    const b = exitAnchor(roomB, exitB, centerOf(roomB));
    // Neighbours that way round on the map: a plain line; otherwise dashed.
    const step = [edit.positions[roomB][0] - edit.positions[roomA][0], edit.positions[roomB][1] - edit.positions[roomA][1]];
    const across = step[0] !== a.dir[0] || step[1] !== a.dir[1];
    const d = linkPath(a, b);
    const group = svg('g', { class: 'link-group', 'data-link': index });
    // A wide invisible stroke to click (Delete tool).
    const hit = svg('path', { class: 'link-hit', d });
    hit.append(svg('title', {}, `${refA} ↔ ${refB}`));
    group.append(svg('path', { class: `link${across ? ' across' : ''}`, d }), hit);
    links.append(group);
  });
  svgEl.append(links);

  // Connect tool: the line being drawn.
  if (state.drag?.tool === 'connect' && state.drag.moved) {
    const [x1, z1] = cellCenter(edit.positions[state.drag.id]);
    svgEl.append(svg('line', { class: 'link-draft', x1, y1: z1, x2: state.drag.point[0], y2: state.drag.point[1] }));
  }

  const { unreachable, far } = mapWarnings(edit.world, edit.rooms.keys(), authoredRooms());
  const farBy = new Map(far.map(({ id, distance }) => [id, distance]));
  const unsaved = unsavedRooms();
  for (const id of edit.rooms.keys()) svgEl.append(roomNode(id, { unreachable: unreachable.includes(id), far: farBy.get(id), moved: unsaved.has(id) }));

  // Where a dragged room would land, or a new one go.
  const target = state.drag?.tool === 'move' && state.drag.moved ? state.drag.cell : state.tool === 'add' ? state.hover : null;
  if (target) {
    const [cx, cz] = cellCenter(target);
    const other = edit.roomAt(target);
    const taken = other !== null && other !== state.drag?.id;
    const half = NODE / 2 + 6;
    svgEl.append(svg('rect', { class: `target${taken ? ' taken' : ''}`, x: cx - half, y: cz - half, width: 2 * half, height: 2 * half }));
    if (state.tool === 'add' && !taken) svgEl.append(svg('text', { class: 'target-label', x: cx, y: cz + 6 }, newRoomId()));
  }

  mapEl.append(svgEl);
}

/** Ids of the author's real game rooms (D90). */
function authoredRooms() {
  return new Set([...edit.rooms].filter(([, room]) => room.authored).map(([id]) => id));
}

/** The id the Add tool gives the next room. */
function newRoomId() {
  return state.newId.trim() || edit.freeRoomId();
}

/** Center of a room's node: its cell, or under the pointer while dragged. */
function centerOf(id) {
  if (state.drag?.tool === 'move' && state.drag.id === id && state.drag.moved) return state.drag.point;
  return cellCenter(edit.positions[id]);
}

function roomNode(id, { unreachable, far, moved }) {
  const room = edit.rooms.get(id);
  const world = edit.world;
  const color = biomes[room.biome]?.color ?? '#ffb020';
  const [cx, cz] = centerOf(id);
  const dragged = state.drag?.tool === 'move' && state.drag.id === id && state.drag.moved;
  const linking = state.linkFrom === id || (state.drag?.tool === 'connect' && state.drag.id === id);
  const classes = ['room', unreachable && 'unreachable', dragged && 'dragging', state.picked === id && 'picked', linking && 'linking'];
  const g = svg('g', { class: classes.filter(Boolean).join(' '), transform: `translate(${cx} ${cz})`, 'data-room': id });
  const half = NODE / 2;
  if (id === world.start) g.append(svg('rect', { class: 'start', x: -half - 7, y: -half - 7, width: NODE + 14, height: NODE + 14 }));
  g.append(svg('rect', { class: 'box', x: -half, y: -half, width: NODE, height: NODE, stroke: color, style: `filter: drop-shadow(0 0 6px ${color})` }));
  for (const exit of room.exits ?? []) g.append(exitMark(id, exit));

  const name = wrap(room.name);
  name.forEach((line, i) => g.append(svg('text', { class: 'name', x: 0, y: -26 + i * 16 - (name.length - 1) * 8, fill: color }, line)));
  g.append(svg('text', { class: 'info', x: 0, y: 12 }, id));
  g.append(svg('text', { class: 'info', x: 0, y: 28 }, room.size.join('×')));
  if (id === world.start) g.append(svg('text', { class: 'flag', x: 0, y: 50, fill: 'var(--lime)' }, 'START'));
  else if (unreachable) g.append(svg('text', { class: 'flag', x: 0, y: 50, fill: 'var(--magenta)' }, 'UNREACHABLE'));
  else if (far !== undefined) g.append(svg('text', { class: 'flag', x: 0, y: 50, fill: 'var(--amber)' }, `${far} ROOMS OUT`));
  // Authored (D90): a real game room, left alone by development steps.
  if (room.authored) g.append(svg('text', { class: 'flag', x: 0, y: -half + 14, fill: 'var(--cyan)' }, 'AUTHORED'));
  if (moved) g.append(svg('circle', { class: 'moved', cx: half - 10, cy: -half + 10, r: 5 }, undefined));
  g.append(svg('title', {}, `${room.name} (${id})${room.authored ? ', authored' : ''}`));
  return g;
}

/** An exit's mark on its room's edge (in the node's own coordinates): cyan connected, magenta loose. */
function exitMark(roomId, exit) {
  const ref = `${roomId}.${exit.id}`;
  const { point, dir } = exitAnchor(roomId, exit.id, [0, 0]);
  // Long along the side, short across it.
  const [w, h] = dir[0] !== 0 ? [EXIT_MARK[1], EXIT_MARK[0]] : EXIT_MARK;
  const [hw, hh] = dir[0] !== 0 ? [EXIT_HIT[1], EXIT_HIT[0]] : EXIT_HIT;
  const loose = !edit.connected(ref);
  const g = svg('g', { class: `exit-mark${loose ? ' loose' : ''}`, 'data-exit': ref });
  g.append(
    svg('rect', { class: 'exit-hit', x: point[0] - hw / 2, y: point[1] - hh / 2, width: hw, height: hh }),
    svg('rect', { class: 'exit', x: point[0] - w / 2, y: point[1] - h / 2, width: w, height: h }),
    svg('title', {}, `${ref} (${exit.side}, at ${exit.at})${loose ? ' — not connected' : ` ↔ ${edit.connections.find((p) => p.includes(ref)).find((r) => r !== ref)}`}`),
  );
  return g;
}

function drawPanel() {
  panelEl.replaceChildren();
  panelEl.append(html('h1', '', 'WORLD MAP'));
  if (!edit) {
    const list = html('ul');
    for (const error of SCHEMA_ERRORS) list.append(html('li', 'error', error));
    if (list.children.length === 0) list.append(html('li', 'error', 'world.json has no connections list.'));
    panelEl.append(list);
    return;
  }
  const world = edit.world;
  panelEl.append(html('div', 'counts', `${edit.rooms.size} rooms · ${edit.connections.length} connections`));

  const buttons = html('div', 'actions');
  const undoButton = html('button', 'undo', edit.undoStack.length === 0 && state.rollback ? 'Undo last save' : 'Undo');
  undoButton.disabled = (edit.undoStack.length === 0 && !state.rollback) || state.saving;
  undoButton.title = 'Ctrl+Z';
  undoButton.addEventListener('click', undo);
  const save = html('button', '', changesText());
  save.disabled = !edit.dirty || state.saving;
  save.title = 'Ctrl+S';
  save.addEventListener('click', saveChanges);
  buttons.append(undoButton, save);
  panelEl.append(buttons);
  panelEl.append(html('div', `status ${state.statusKind}`, state.status));
  if (state.stale) panelEl.append(html('div', 'status warn', 'Data changed on disk (saved from another page). Save or undo your changes, then reload.'));

  panelEl.append(html('h2', '', 'TOOLS'));
  const tools = html('div', 'tools');
  for (const tool of TOOLS) {
    const button = html('button', `tool${state.tool === tool.id ? ' active' : ''}`, `${tool.key} ${tool.label}`);
    button.addEventListener('click', () => setTool(tool.id));
    tools.append(button);
  }
  panelEl.append(tools);
  panelEl.append(html('div', 'tool-help', TOOLS.find((tool) => tool.id === state.tool).help));
  if (state.tool === 'add') panelEl.append(newRoomFields());
  if (state.tool === 'connect' && state.linkFrom) panelEl.append(html('div', 'tool-help', `From ${state.linkFrom}: click the room to connect it to (Esc cancels).`));

  const errors = dataErrors();
  const rooms = edit.rooms;
  const distances = roomDistances(world.start, world.connections);
  const { unreachable, far } = mapWarnings(world, edit.rooms.keys(), authoredRooms());

  panelEl.append(html('h2', '', 'CHECKS'));
  const list = html('ul');
  for (const id of unreachable) list.append(roomItem(id, 'warn', `${id}: not reachable from ${world.start}`));
  for (const { id, distance } of far) {
    list.append(roomItem(id, 'warn', `${id}: ${distance} rooms from ${world.start}; test rooms stay within ${TEST_ROOM_REACH} (D49)`));
  }
  for (const error of errors) list.append(html('li', 'error', error));
  const reach = reachReport();
  const reachItem = (className, message) => (rooms.has(roomOf(message)) ? roomItem(roomOf(message), className, message) : html('li', className, message));
  for (const error of reach.errors) list.append(reachItem('error', error));
  for (const warning of reach.warnings) list.append(reachItem('warn', warning));
  if (list.children.length === 0) list.append(html('li', 'fine', `All ${distances.size} rooms reachable on the map and by the wizard's abilities, test rooms within ${TEST_ROOM_REACH} of the start.`));
  panelEl.append(list);

  const reportButton = html('button', '', 'F3 Pickup report');
  reportButton.addEventListener('click', () => toggleReport());
  panelEl.append(reportButton);

  panelEl.append(html('h2', '', 'HOW TO'));
  const help = html('ul', 'help');
  for (const line of [
    'Keys 1–4 pick a tool. Ctrl+Z undoes, Ctrl+S saves. F3: the pickup report.',
    'Undo last save (after Undo runs out) brings back what the last save changed or deleted; Save writes it.',
    'Move: click a room to open it in the room editor (F2 there to play).',
    'Exits made here sit in the middle of the wall; fine-tune them in the room editor.',
    'Solid line: neighbours on the map that way round. Dashed: connected across the map.',
  ]) {
    help.append(html('li', '', line));
  }
  panelEl.append(help);
}

/** Add tool: the new room's id and biome. */
function newRoomFields() {
  const box = html('div', 'fields');
  const id = Object.assign(html('input'), { type: 'text', value: state.newId, placeholder: edit.freeRoomId() });
  id.addEventListener('input', () => {
    state.newId = id.value;
  });
  const biome = html('select');
  for (const [key, { name }] of Object.entries(biomes)) biome.append(Object.assign(html('option', '', name ?? key), { value: key }));
  biome.value = state.newBiome;
  biome.addEventListener('change', () => {
    state.newBiome = biome.value;
  });
  const row = (label, input) => {
    const el = html('label', 'field');
    el.append(html('span', '', label), input);
    return el;
  };
  box.append(row('Id', id), row('Biome', biome));
  return box;
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
  drawReport();
}

// --- Pickup report (F3) ------------------------------------------------------

const reportEl = html('section', 'report');
reportEl.hidden = true;
// Over the map, outside it: its pointer handlers never see clicks in the report.
document.body.append(reportEl);

function toggleReport(open = !state.report) {
  state.report = open;
  drawReport();
}

/** An item's name and color: a spell's (strings.json, defs.json), a buff's, an upgrade's or a secret's (D100). */
function itemLook(type) {
  const defs = DATA_FILES['defs.json'];
  const strings = DATA_FILES['strings.json']?.strings ?? {};
  const data = defs.pickups[type];
  if (data.kind === 'disk') return { name: strings[`spell.${data.spell}`] ?? data.spell, color: defs.spells[data.spell].color };
  if (data.kind === 'upgrade') return { name: strings[`upgrade.${data.upgrade}`] ?? data.upgrade, color: data.color };
  if (data.kind === 'secret') return { name: `SECRET ${data.slot}`, color: SECRET_COLOR };
  if (data.kind === 'buff') {
    const stat = strings[`buff.${data.stat}`] ?? data.stat;
    return { name: data.stat === 'recharge' ? stat : `${stat} +${data.amount}`, color: BUFF_COLORS[data.stat] };
  }
  return { name: type, color: 'var(--dim)' };
}

/** A pickup's place: its room's name and cell; a click shows the room on the map. */
function placeLink({ room, at }) {
  const link = html('button', 'place', `${edit.rooms.get(room)?.name ?? room} [${at.join(',')}]`);
  link.addEventListener('click', () => {
    state.picked = room;
    toggleReport(false);
    draw();
  });
  return link;
}

/** One report row: count or bit, item, where it lies, status. */
function reportRow(first, item, places, status, flagged = false) {
  const row = html('tr', flagged ? 'flagged' : '');
  const where = html('td', 'where');
  for (const place of places) where.append(placeLink(place));
  row.append(html('td', 'bit', first), item, where, html('td', `status ${status[0]}`, status[1]));
  return row;
}

function drawReport() {
  reportEl.hidden = !state.report || !edit;
  if (reportEl.hidden) return;
  reportEl.replaceChildren();
  const defs = DATA_FILES['defs.json'];
  const { items, refills, unknown } = pickupReport(defs.pickups ?? {}, defs.spells ?? {}, edit.rooms);
  const missing = items.filter((item) => item.places.length === 0).length;
  const doubled = items.filter((item) => item.places.length > 1).length;

  const head = html('div', 'report-head');
  const close = html('button', '', 'F3 Close');
  close.addEventListener('click', () => toggleReport(false));
  head.append(html('h1', '', 'PICKUP REPORT'), close);
  const summary = html('p', 'counts', `${items.length} permanent items · ${items.length - missing} placed · `);
  summary.append(html('span', missing ? 'warn' : 'fine', `${missing} not placed`), ' · ');
  summary.append(html('span', doubled ? 'warn' : 'fine', `${doubled} placed more than once`));
  reportEl.append(head, summary);

  for (const [block, { size }] of Object.entries(SAVE_BLOCKS)) {
    const rows = items.filter((item) => item.block === block);
    reportEl.append(html('h2', '', `${block.toUpperCase()} · ${rows.length}/${size} bits defined`));
    if (rows.length === 0) {
      reportEl.append(html('p', 'none', 'None defined yet.'));
      continue;
    }
    const table = html('table');
    for (const { bit, types, places } of rows) {
      const { name, color } = itemLook(types[0]);
      const cell = html('td', 'item');
      const swatch = html('i', 'swatch');
      swatch.style.background = color;
      cell.append(swatch, html('span', '', name), html('small', '', types.join(', ')));
      const status = places.length === 0 ? ['warn', 'not placed'] : places.length > 1 ? ['warn', `×${places.length}`] : ['fine', 'ok'];
      table.append(reportRow(`${bit}`, cell, places, status, places.length !== 1));
    }
    reportEl.append(table);
  }

  reportEl.append(html('h2', '', 'REFILLS · temporary, back with the room'));
  const table = html('table');
  for (const { type, places } of refills) table.append(reportRow(`${places.length}×`, html('td', 'item', type), places, ['', '']));
  reportEl.append(table);

  if (unknown.length > 0) {
    reportEl.append(html('h2', '', 'UNKNOWN TYPES'));
    const list = html('ul');
    for (const { room, id, type } of unknown) list.append(html('li', 'error', `${room} › ${id}: unknown pickup type "${type}"`));
    reportEl.append(list);
  }
}

// --- Tools -------------------------------------------------------------------

function setTool(id) {
  state.tool = id;
  state.linkFrom = null;
  state.hover = null;
  mapEl.className = `tool-${id}`;
  setStatus('');
  render();
}

/** Pointer position in map units. */
function mapPoint(event) {
  const matrix = svgEl.getScreenCTM().inverse();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
  return [point.x, point.y];
}

/** The map cell under a point in map units. */
const cellAt = ([x, z]) => [Math.round(x / CELL), Math.round(z / CELL)];

/** Show the outcome of an edit: a problem, or the new state. */
function done(problem, text = '') {
  setStatus(problem ?? text, problem ? 'bad' : '');
  render();
}

mapEl.addEventListener('pointerdown', (event) => {
  if (!edit || event.button !== 0) return;
  const id = event.target.closest?.('.room')?.dataset.room;
  const point = mapPoint(event);
  if (state.tool === 'add') {
    const cell = cellAt(point);
    const roomId = newRoomId();
    const problem = edit.addRoom(roomId, cell, state.newBiome);
    if (!problem) state.newId = '';
    done(problem, `New room ${roomId}: connect it (3), then save.`);
    return;
  }
  if (state.tool === 'delete') {
    const link = event.target.closest?.('.link-group')?.dataset.link;
    const exit = event.target.closest?.('.exit-mark')?.dataset.exit;
    if (exit) {
      const removed = edit.removeExit(exit);
      done(null, `Removed ${removed.length > 1 ? 'exits' : 'exit'} ${removed.join(' and ')}.`);
    } else if (id) done(edit.removeRoom(id), `Removed ${id} and the exits into it.`);
    else if (link !== undefined) {
      const pair = edit.connections[Number(link)];
      edit.disconnect(Number(link));
      done(null, `Removed ${pair.join(' ↔ ')} and both exits.`);
    }
    return;
  }
  if (!id) return;
  const [cx, cz] = cellCenter(edit.positions[id]);
  const offset = state.tool === 'move' ? [point[0] - cx, point[1] - cz] : [0, 0];
  state.drag = { id, tool: state.tool, screen: [event.clientX, event.clientY], offset, point: [cx, cz], cell: edit.positions[id], moved: false };
  mapEl.setPointerCapture(event.pointerId);
});

mapEl.addEventListener('pointermove', (event) => {
  if (!edit) return;
  const drag = state.drag;
  if (!drag) {
    if (state.tool !== 'add') return;
    const cell = cellAt(mapPoint(event));
    if (state.hover && mapKey(state.hover) === mapKey(cell)) return;
    state.hover = cell;
    draw();
    return;
  }
  if (!drag.moved && Math.hypot(event.clientX - drag.screen[0], event.clientY - drag.screen[1]) < DRAG_START) return;
  drag.moved = true;
  const [px, pz] = mapPoint(event);
  drag.point = [px - drag.offset[0], pz - drag.offset[1]];
  drag.cell = cellAt(drag.point);
  draw();
});

mapEl.addEventListener('pointerleave', () => {
  if (!state.hover) return;
  state.hover = null;
  draw();
});

mapEl.addEventListener('pointerup', () => {
  const drag = state.drag;
  if (!drag) return;
  state.drag = null;
  if (drag.tool === 'connect') {
    // Dragged onto another room, or the second of two clicks.
    const to = drag.moved ? edit.roomAt(drag.cell) : state.linkFrom && state.linkFrom !== drag.id ? drag.id : null;
    const from = drag.moved ? drag.id : state.linkFrom;
    if (to && from && to !== from) {
      state.linkFrom = null;
      const { ref, problem } = edit.connect(from, to);
      done(problem, ref && `Connected ${ref.join(' ↔ ')}.`);
    } else {
      state.linkFrom = drag.moved || state.linkFrom === drag.id ? null : drag.id;
      done(null);
    }
    return;
  }
  if (!drag.moved) {
    openInEditor(drag.id);
    return;
  }
  const other = edit.roomAt(drag.cell);
  if (other === null) {
    edit.move(drag.id, drag.cell);
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
  if (!edit.saved.rooms.has(id)) {
    setStatus(`Save first: ${id} is not on disk yet.`, 'bad');
    drawPanel();
    return;
  }
  window.open(`/?room=${encodeURIComponent(id)}&edit`, GAME_WINDOW)?.focus();
}

window.addEventListener('keydown', (event) => {
  if (!edit) return;
  if (event.key === 'F3') {
    event.preventDefault();
    toggleReport();
    return;
  }
  if (event.key === 'Escape' && state.report) {
    toggleReport(false);
    return;
  }
  const typing = event.target.closest?.('input, select, textarea');
  if (event.key === 'Escape' && state.linkFrom) {
    state.linkFrom = null;
    render();
    return;
  }
  const tool = TOOLS.find((t) => t.key === event.key);
  if (tool && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    setTool(tool.id);
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !typing) {
    event.preventDefault();
    undo();
  } else if (key === 's') {
    event.preventDefault();
    saveChanges();
  }
});

/**
 * Undo the last edit; with none left, roll the last save back (D103): what
 * it overwrote comes back as unsaved changes, for Save to write.
 */
function undo() {
  if (!edit || state.saving) return;
  if (edit.undo()) {
    state.linkFrom = null;
    setStatus('Undid the last change.');
  } else if (state.rollback) {
    const rooms = Object.keys(state.rollback.rooms);
    edit.rollBack(state.rollback);
    keepRollback(null);
    state.linkFrom = null;
    setStatus(`Rolled back the last save${rooms.length > 0 ? ` (${rooms.join(', ')})` : ''}. Save to write it back; Undo takes the rollback back.`, 'ok');
  } else {
    return;
  }
  render();
}

/** Remember the last save's rollback point, also over a reload (null forgets it). */
function keepRollback(point) {
  state.rollback = point;
  try {
    if (point) sessionStorage.setItem(ROLLBACK_KEY, JSON.stringify(point));
    else sessionStorage.removeItem(ROLLBACK_KEY);
  } catch {
    // No session storage: Undo last save works until the page reloads.
  }
}

window.addEventListener('beforeunload', (event) => {
  if (edit?.dirty) event.preventDefault();
});

// --- Saving ------------------------------------------------------------------

function setStatus(text, kind = '') {
  state.status = text;
  state.statusKind = kind;
}

async function saveChanges() {
  if (!edit?.dirty || state.saving) return;
  state.saving = true;
  setStatus('Saving…');
  render();
  const { rooms, remove, positions, world, counts } = edit.changes();
  const point = edit.rollbackPoint();
  const result = await saveFiles({ rooms, remove, positions, world });
  state.saving = false;
  state.quietUntil = performance.now() + 1500;
  if (result.ok) {
    edit.markSaved();
    edit.clearHistory();
    keepRollback(point);
    const deleted = remove.map((id) => `data/rooms/${id}.json`);
    const written = result.files.filter((file) => !deleted.includes(file));
    setStatus([written.length > 0 && `Saved ${written.join(', ')}.`, deleted.length > 0 && `Deleted ${deleted.join(', ')}.`].filter(Boolean).join(' '), 'ok');
    // A room file added or removed reloads the page (the data bundle
    // changed): keep the line for the reloaded page.
    if (counts.added > 0 || counts.removed > 0 || state.stale) {
      try {
        sessionStorage.setItem(STATUS_KEY, state.status);
      } catch {
        // No session storage: the line is lost on reload, nothing else.
      }
    }
    // Another page's save came in meanwhile: it is on disk, so show it.
    if (state.stale) {
      location.reload();
      return;
    }
  } else {
    setStatus(`Not saved: ${result.errors.join(' · ')}`, 'bad');
  }
  render();
}

// Another page (the room editor) saved: show the data as it is now, unless
// that would lose changes not saved yet.
import.meta.hot?.on(DATA_SAVED_EVENT, () => {
  if (!edit || state.saving || performance.now() < state.quietUntil) return;
  // Rolling our last save back now would undo that page's save too.
  keepRollback(null);
  if (!edit.dirty) location.reload();
  else {
    state.stale = true;
    drawPanel();
  }
});

// --- Start -------------------------------------------------------------------

if (!DEV_SERVER) {
  panelEl.append(html('h1', '', 'WORLD MAP'), html('p', '', 'The world map tool runs in the dev server only (npm run dev).'));
} else if (!edit) {
  drawPanel();
} else {
  try {
    const saved = sessionStorage.getItem(STATUS_KEY);
    sessionStorage.removeItem(STATUS_KEY);
    if (saved) setStatus(saved, 'ok');
    state.rollback = JSON.parse(sessionStorage.getItem(ROLLBACK_KEY) ?? 'null');
  } catch {
    // No session storage: start without a status line.
  }
  mapEl.className = `tool-${state.tool}`;
  render();
}
