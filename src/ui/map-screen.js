/**
 * The map screen (D112): the run's map (world/run-map.js) as a 3D scene
 * built from the game's own look (render/map-view.js), which the renderer
 * draws instead of the room while the map is up, with this overlay over
 * it: the heading and the room he is in, a label on each visited room (its
 * name, and under it a row of icons: he is here, a fragment he hasn't
 * found, a backup shrine, the central core), the legend and the keys. Sizes use --u like the
 * HUD; the labels shrink with the map when it is zoomed out to fit (down
 * to LABEL_SCALE_MIN).
 */
import { MapView } from '../render/map-view.js';
import { mapModel } from '../world/run-map.js';
import { formatText } from './text.js';

/** The labels shrink with the map, but not below this. */
const LABEL_SCALE_MIN = 0.6;

export class MapScreen {
  /**
   * @param {HTMLElement} stage the renderer's stage
   * @param {Record<string, string>} strings
   */
  constructor(stage, strings) {
    this.stage = stage;
    this.strings = strings;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="map" hidden>
        <div class="map-labels"></div>
        <div class="map-heading"></div>
        <div class="map-room"></div>
        <div class="map-area"></div>
        <div class="map-legend"></div>
        <div class="map-help"></div>
      </div>`,
    );
    this.root = stage.querySelector('.map');
    this.heading = this.root.querySelector('.map-heading');
    this.room = this.root.querySelector('.map-room');
    this.area = this.root.querySelector('.map-area');
    this.labels = this.root.querySelector('.map-labels');
    this.heading.textContent = this.text('menu.heading.map');
    this.root.querySelector('.map-help').textContent = this.text('map.help');
    this.root.querySelector('.map-legend').innerHTML = [
      ['you', 'map.legend.you'],
      ['fragment', 'map.legend.fragment'],
      ['shrine', 'map.legend.shrine'],
      ['core', 'map.legend.core'],
      ['stub', 'map.legend.stub'],
    ]
      .map(([mark, key]) => `<span><i class="map-icon ${mark}"></i>${this.text(key)}</span>`)
      .join('');
    /** The map's scene while it is up, else null. It is built when the map opens; nothing changes while it is. */
    this.view = null;
  }

  text(key, values) {
    return formatText(this.strings, key, values);
  }

  /** Is the map up? */
  get open() {
    return this.view !== null;
  }

  /**
   * Show or hide the map and animate it; call once a frame.
   * @param {import('./menus.js').MenuFlow} flow
   * @param {import('../game.js').Game} game
   * @param {number} time seconds
   */
  show(flow, game, time) {
    const open = flow.top?.id === 'map';
    if (open !== this.open) {
      this.root.hidden = !open;
      this.stage.classList.toggle('map-open', open);
      if (open) this.draw(game);
      else {
        this.view.dispose();
        this.view = null;
        this.labels.replaceChildren();
      }
    }
    this.view?.update(time);
  }

  /** Build the run's map as it is now. @param {import('../game.js').Game} game */
  draw(game) {
    const { content } = game;
    const model = mapModel(content, game.map, { current: game.room.id, progress: game.progress });
    const data = content.rooms.get(game.room.id);
    this.room.textContent = this.text('map.room', { room: data.name, biome: content.biomes[data.biome]?.name ?? '' });
    this.view = new MapView(model);
    // The map fills the space between the heading and the legend.
    const stage = this.root.getBoundingClientRect();
    const area = this.area.getBoundingClientRect();
    const scale = this.view.fit({
      x: (area.left - stage.left) / stage.width,
      y: (area.top - stage.top) / stage.height,
      width: area.width / stage.width,
      height: area.height / stage.height,
    });
    this.labels.style.setProperty('--map-scale', String(Math.max(scale, LABEL_SCALE_MIN)));
    this.labels.replaceChildren(...this.view.layout.rooms.filter(({ room }) => room.visited).map((placed) => this.label(placed)));
  }

  /**
   * A visited room's label, on its block's top: its name, and under it the
   * icons that apply (he is here, a fragment left, a backup shrine, the core).
   * @param {{ room: object, center: number[] }} placed a map-view.js mapLayout() room
   */
  label({ room, center }) {
    const [x, y] = this.view.place(center);
    const label = document.createElement('div');
    label.className = room.current ? 'map-label current' : 'map-label';
    label.style.left = `${x * 100}%`;
    label.style.top = `${y * 100}%`;
    label.style.setProperty('--room', room.color);
    const name = document.createElement('div');
    name.className = 'map-label-name';
    name.textContent = room.name;
    label.append(name);
    const icons = ['you', 'fragment', 'shrine', 'core'].filter((icon) => (icon === 'you' ? room.current : room[icon]));
    if (icons.length > 0) {
      const row = document.createElement('div');
      row.className = 'map-label-icons';
      row.innerHTML = icons.map((icon) => `<i class="map-icon ${icon}"></i>`).join('');
      label.append(row);
    }
    return label;
  }
}
