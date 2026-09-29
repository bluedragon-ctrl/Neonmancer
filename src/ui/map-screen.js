/**
 * The map screen (D112): the run's map (world/run-map.js) drawn in SVG over
 * the standing game, seen from the same isometric angle as the rooms, so
 * east on the map is down-right on screen as in the game. Visited rooms in
 * their biome color, rooms a shrine showed as dim outlines, connections
 * (dashed across the map) and stubs for exits not explored yet. Each
 * visited room has a label: its name, and under it a row of icons, the
 * wizard's blinking dot, a gold mark where a fragment still lies, a
 * magenta ring for a backup shrine. Sizes use --u like the HUD; the map is
 * fitted to the rooms shown, never bigger than MIN_VIEW allows, and the
 * labels shrink with it (down to LABEL_SCALE_MIN).
 */
import { ROOM_SIZE, STUB_LENGTH, mapModel } from '../world/run-map.js';
import { formatText } from './text.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Isometric projection of a map point [x, z] (cells) onto the screen, like the game's camera. */
export function projectCell([x, z]) {
  return [(x - z) * Math.cos(Math.PI / 6), (x + z) * Math.sin(Math.PI / 6)];
}

/** Width / height of the map's area on screen (its CSS size, 1600 × 740 --u). */
export const MAP_ASPECT = 1600 / 740;

/** The smallest part of the map shown (projected units, MAP_ASPECT wide), so a few rooms don't fill the screen. */
const MIN_VIEW = [8, 8 / MAP_ASPECT];

/** The labels shrink with the map, but not below this. */
const LABEL_SCALE_MIN = 0.6;

/** Space round the rooms shown, in projected units. */
const MARGIN = 0.8;

/**
 * The SVG viewBox that fits the rooms, centered on them, in the map area's
 * shape (MAP_ASPECT), so a point's place on screen is a plain percentage.
 * @param {number[][]} cells the rooms' [x, z]
 * @returns {number[]} [x, y, width, height]
 */
export function fitView(cells) {
  const points = cells.flatMap(([x, z]) => square([x, z]).map(projectCell));
  if (points.length === 0) return [-MIN_VIEW[0] / 2, -MIN_VIEW[1] / 2, ...MIN_VIEW];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const width = Math.max(right - left + 2 * MARGIN, (bottom - top + 2 * MARGIN) * MAP_ASPECT, MIN_VIEW[0]);
  const height = width / MAP_ASPECT;
  return [(left + right - width) / 2, (top + bottom - height) / 2, width, height];
}

/**
 * A room's square on the map round its cell, [x, z] corners (half side
 * ROOM_SIZE / 2); the projection turns it into a diamond.
 */
function square([x, z]) {
  const r = ROOM_SIZE / 2;
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
        <div class="map-area">
          <svg class="map-view" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="map-labels"></div>
        </div>
        <div class="map-legend"></div>
        <div class="map-help"></div>
      </div>`,
    );
    this.root = stage.querySelector('.map');
    this.heading = this.root.querySelector('.map-heading');
    this.room = this.root.querySelector('.map-room');
    this.area = this.root.querySelector('.map-area');
    this.view = this.root.querySelector('.map-view');
    this.labels = this.root.querySelector('.map-labels');
    this.heading.textContent = this.text('menu.heading.map');
    this.root.querySelector('.map-help').textContent = this.text('map.help');
    this.root.querySelector('.map-legend').innerHTML = [
      ['you', 'map.legend.you'],
      ['fragment', 'map.legend.fragment'],
      ['shrine', 'map.legend.shrine'],
      ['stub', 'map.legend.stub'],
    ]
      .map(([mark, key]) => `<span><i class="map-icon ${mark}"></i>${this.text(key)}</span>`)
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
    const view = fitView(model.rooms.map((room) => room.cell));
    this.view.setAttribute('viewBox', view.join(' '));
    this.area.style.setProperty('--map-scale', String(Math.max(Math.min(MIN_VIEW[0] / view[2], 1), LABEL_SCALE_MIN)));
    this.labels.replaceChildren(...model.rooms.filter((room) => room.visited).map((room) => this.label(room, view)));

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
    for (const room of model.rooms) {
      const classes = ['map-room-tile', room.visited ? '' : 'dim', room.current ? 'current' : ''].filter(Boolean).join(' ');
      rooms.append(svg('polygon', { class: classes, points: points(square(room.cell)), style: `color: ${room.color}` }));
    }
    this.view.replaceChildren(links, rooms, stubs);
  }

  /**
   * A visited room's label, centered on its tile: its name, and under it
   * the icons that apply (he is here, a fragment left, a backup shrine).
   * @param {object} room a mapModel() room
   * @param {number[]} view the viewBox
   */
  label(room, [vx, vy, vw, vh]) {
    const [x, y] = projectCell(room.cell);
    const label = document.createElement('div');
    label.className = room.current ? 'map-label current' : 'map-label';
    label.style.left = `${((x - vx) / vw) * 100}%`;
    label.style.top = `${((y - vy) / vh) * 100}%`;
    const name = document.createElement('div');
    name.className = 'map-label-name';
    name.textContent = room.name;
    label.append(name);
    const icons = ['you', 'fragment', 'shrine'].filter((icon) => (icon === 'you' ? room.current : room[icon]));
    if (icons.length > 0) {
      const row = document.createElement('div');
      row.className = 'map-label-icons';
      row.innerHTML = icons.map((icon) => `<i class="map-icon ${icon}"></i>`).join('');
      label.append(row);
    }
    return label;
  }
}
