/**
 * The map screen (D112): the run's map (world/run-map.js) drawn in SVG over
 * the standing game, seen from the same isometric angle as the rooms, so
 * east on the map is down-right on screen as in the game. Visited rooms in
 * their biome color, rooms a shrine showed as dim outlines, connections
 * (dashed across the map), stubs for exits not explored yet, a gold mark
 * where a fragment still lies, a magenta ring for a backup shrine and a
 * blinking dot for the wizard. Sizes use --u like the HUD; the map is
 * fitted to the rooms shown, never bigger than MIN_VIEW allows.
 */
import { ROOM_SIZE, STUB_LENGTH, mapModel } from '../world/run-map.js';
import { formatText } from './text.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Isometric projection of a map point [x, z] (cells) onto the screen, like the game's camera. */
export function projectCell([x, z]) {
  return [(x - z) * Math.cos(Math.PI / 6), (x + z) * Math.sin(Math.PI / 6)];
}

/** The smallest part of the map shown (projected units), so a few rooms don't fill the screen. */
const MIN_VIEW = [8, 4.5];

/** Space round the rooms shown, in projected units. */
const MARGIN = 0.8;

/**
 * The SVG viewBox that fits the rooms, centered on them.
 * @param {number[][]} cells the rooms' [x, z]
 * @returns {number[]} [x, y, width, height]
 */
export function fitView(cells) {
  const points = cells.flatMap(([x, z]) => square([x, z]).map(projectCell));
  if (points.length === 0) return [-MIN_VIEW[0] / 2, -MIN_VIEW[1] / 2, ...MIN_VIEW];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const width = Math.max(right - left + 2 * MARGIN, MIN_VIEW[0]);
  const height = Math.max(bottom - top + 2 * MARGIN, MIN_VIEW[1]);
  return [(left + right - width) / 2, (top + bottom - height) / 2, width, height];
}

/**
 * A square round a map point, [x, z] corners: a room's (half side
 * ROOM_SIZE / 2) or a mark's; the projection turns it into a diamond.
 */
function square([x, z], r = ROOM_SIZE / 2) {
  return [
    [x - r, z - r],
    [x + r, z - r],
    [x + r, z + r],
    [x - r, z + r],
  ];
}

/** SVG points attribute for map points. */
const points = (cells) => cells.map((cell) => projectCell(cell).join(',')).join(' ');

/** An SVG element with attributes. */
function svg(name, attributes = {}) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

export class MapScreen {
  /**
   * @param {HTMLElement} stage the renderer's stage
   * @param {Record<string, string>} strings
   */
  constructor(stage, strings) {
    this.strings = strings;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="map" hidden>
        <div class="map-heading"></div>
        <div class="map-room"></div>
        <svg class="map-view" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="map-legend"></div>
        <div class="map-help"></div>
      </div>`,
    );
    this.root = stage.querySelector('.map');
    this.heading = this.root.querySelector('.map-heading');
    this.room = this.root.querySelector('.map-room');
    this.view = this.root.querySelector('.map-view');
    this.heading.textContent = this.text('menu.heading.map');
    this.root.querySelector('.map-help').textContent = this.text('map.help');
    this.root.querySelector('.map-legend').innerHTML = [
      ['you', 'map.legend.you'],
      ['fragment', 'map.legend.fragment'],
      ['shrine', 'map.legend.shrine'],
      ['stub', 'map.legend.stub'],
    ]
      .map(([mark, key]) => `<span class="map-key-${mark}"><i></i>${this.text(key)}</span>`)
      .join('');
    /** Is the map up? It is drawn when it opens; nothing changes while it is. */
    this.open = false;
  }

  text(key, values) {
    return formatText(this.strings, key, values);
  }

  /**
   * Show or hide the map; call once a frame.
   * @param {import('./menus.js').MenuFlow} flow
   * @param {import('../game.js').Game} game
   */
  show(flow, game) {
    const open = flow.top?.id === 'map';
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
    if (open) this.draw(game);
  }

  /** Draw the run's map as it is now. @param {import('../game.js').Game} game */
  draw(game) {
    const { content } = game;
    const model = mapModel(content, game.map, { current: game.room.id, progress: game.progress });
    const data = content.rooms.get(game.room.id);
    this.room.textContent = this.text('map.room', { room: data.name, biome: content.biomes[data.biome]?.name ?? '' });
    this.view.setAttribute('viewBox', fitView(model.rooms.map((room) => room.cell)).join(' '));

    const links = svg('g', { class: 'map-links' });
    for (const link of model.links) {
      const [from, to] = [projectCell(link.from), projectCell(link.to)];
      const classes = ['map-link', link.adjacent ? '' : 'far', link.visited ? '' : 'dim'].filter(Boolean).join(' ');
      links.append(svg('line', { class: classes, x1: from[0], y1: from[1], x2: to[0], y2: to[1] }));
    }
    const stubs = svg('g', { class: 'map-stubs' });
    for (const { at, out } of model.stubs) {
      const [from, to] = [projectCell(at), projectCell([at[0] + out[0] * STUB_LENGTH, at[1] + out[1] * STUB_LENGTH])];
      stubs.append(svg('line', { class: 'map-stub', x1: from[0], y1: from[1], x2: to[0], y2: to[1] }));
    }
    const rooms = svg('g', { class: 'map-rooms' });
    const marks = svg('g', { class: 'map-marks' });
    for (const room of model.rooms) {
      const classes = ['map-room-tile', room.visited ? '' : 'dim', room.current ? 'current' : ''].filter(Boolean).join(' ');
      const tile = svg('polygon', { class: classes, points: points(square(room.cell)), style: `color: ${room.color}` });
      // A visited room's name under the mouse.
      if (room.visited) tile.append(Object.assign(svg('title'), { textContent: room.name }));
      rooms.append(tile);
      const [x, z] = room.cell;
      const q = ROOM_SIZE / 4;
      if (room.fragment) marks.append(svg('polygon', { class: 'map-fragment', points: points(square([x - q, z - q], 0.08)) }));
      if (room.shrine) {
        const [cx, cy] = projectCell([x + q, z + q]);
        marks.append(svg('circle', { class: 'map-shrine', cx, cy, r: 0.07 }));
      }
      if (room.current) {
        const [cx, cy] = projectCell(room.cell);
        marks.append(svg('circle', { class: 'map-you', cx, cy, r: 0.07 }));
      }
    }
    this.view.replaceChildren(links, rooms, stubs, marks);
  }
}
