/**
 * The map screen's 3D scene (D112): the run's map (world/run-map.js) built
 * from the game's own pieces, so it looks like the game. The rooms stand
 * on the gray floor grid that surrounds a room, each a block of frosted
 * glass (glass.js) with neon edges in its biome's color; a room a shrine
 * showed but he hasn't been in is only a dashed outline. Neon lines join
 * the rooms, cyan stubs stick out where an exit leads somewhere not on the
 * map, and a magenta diamond floats over the room he is in. Seen through
 * the game's isometric camera angle and bloom; the renderer draws this
 * scene instead of the room while the map is up (ui/map-screen.js).
 *
 * The layout is pure (mapLayout()); MapView builds and animates it.
 */
import { BoxGeometry, Color, EdgesGeometry, Group, Mesh, OctahedronGeometry, OrthographicCamera, Scene, Vector3 } from 'three';
import { ISO_DIRECTION } from './camera.js';
import { createFloor } from './floor.js';
import { glassFaceMaterial } from './glass.js';
import { PALETTE, disposeTree, fadingLines, lineMaterial, neonLines } from './neon.js';
import { ASPECT } from './viewport.js';
import { ROOM_SIZE, STUB_LENGTH } from '../world/run-map.js';

export const MAP_LOOK = {
  /** World units (floor tiles) per map cell. */
  cell: 5,
  /** A room block's height, and the height its links and stubs run at. */
  height: 1,
  lineY: 0.5,
  /** Floor tiles round the rooms before the grid starts to fade. */
  margin: 1,
  /** Room edges: width (pixels at 1080p) and brightness, his room's brighter. */
  edgeWidth: 2.5,
  edge: 1.2,
  currentEdge: 2.2,
  /** Glass tint of his room (the others use glass.js's). */
  currentTint: 0.32,
  /** A revealed room's dashed outline. */
  dimEdge: 0.45,
  /** Links: width, brightness; a link to a room not visited yet is dimmer. */
  linkWidth: 3,
  link: 1.5,
  dimLink: 0.5,
  stubWidth: 3.5,
  stub: 1.6,
  /** His marker: size, height over the block, bob (units, seconds), turn speed (rad/s). */
  marker: 0.4,
  markerLift: 1.9,
  bob: 0.15,
  bobTime: 1.6,
  spin: 1.2,
  /** Smallest part of the world shown from top to bottom (the game camera's VIEW_HEIGHT). */
  minView: 20,
  /** Space round the blocks in the fitted view, in world units. */
  viewMargin: 1.5,
};

/** Grid line color on the map, so inside the map's floor it matches the outer grid (floor.js draws it at 40%). */
const GRID_COLOR = new Color(PALETTE.outerGrid).multiplyScalar(2.5);

/**
 * Where everything goes in the map scene, in world units (x, z on the
 * floor). The rooms are placed on whole floor tiles, the lowest map cell at
 * the margin, so their blocks sit on the grid.
 * @param {ReturnType<import('../world/run-map.js').mapModel>} model
 * @returns {{
 *   size: number[],
 *   rooms: { room: object, min: number[], center: number[] }[],
 *   links: { from: number[], to: number[], link: object }[],
 *   stubs: { from: number[], to: number[] }[],
 * }} size: the map's floor [width, depth]; from, to: [x, z]
 */
export function mapLayout(model) {
  const { cell, margin } = MAP_LOOK;
  const side = ROOM_SIZE * cell;
  const cells = model.rooms.map((room) => room.cell);
  const low = [0, 1].map((i) => (cells.length > 0 ? Math.min(...cells.map((c) => c[i])) : 0));
  const high = [0, 1].map((i) => (cells.length > 0 ? Math.max(...cells.map((c) => c[i])) : 0));
  // A map point (cells, from the room's center) → world.
  const world = (p) => p.map((v, i) => (v - low[i]) * cell + margin + side / 2);
  const rooms = model.rooms.map((room) => {
    const center = world(room.cell);
    return { room, center, min: center.map((v) => v - side / 2) };
  });
  // Links run center to center, but only show between the blocks: cut where they leave each square.
  const links = model.links.map((link) => {
    const [a, b] = [world(link.from), world(link.to)];
    const d = [b[0] - a[0], b[1] - a[1]];
    const t = side / 2 / Math.max(Math.abs(d[0]), Math.abs(d[1]));
    return { from: [a[0] + d[0] * t, a[1] + d[1] * t], to: [b[0] - d[0] * t, b[1] - d[1] * t], link };
  });
  const stubs = model.stubs.map(({ at, out }) => {
    const from = world(at);
    return { from, to: [from[0] + out[0] * STUB_LENGTH * cell, from[1] + out[1] * STUB_LENGTH * cell] };
  });
  const size = [0, 1].map((i) => (high[i] - low[i]) * cell + side + 2 * margin);
  return { size, rooms, links, stubs };
}

/** The 12 edges of a box on the floor, [x, z] corner `min`, side × height × side. */
function boxEdges([x, z], side, height) {
  const [x1, z1] = [x + side, z + side];
  const corners = [
    [x, z],
    [x1, z],
    [x1, z1],
    [x, z1],
  ];
  const segments = [];
  corners.forEach(([cx, cz], i) => {
    const [nx, nz] = corners[(i + 1) % 4];
    segments.push([[cx, 0, cz], [nx, 0, nz]], [[cx, height, cz], [nx, height, nz]], [[cx, 0, cz], [cx, height, cz]]);
  });
  return segments;
}

const flat = ([x, z], y) => [x, y, z];

export class MapView {
  /**
   * @param {ReturnType<import('../world/run-map.js').mapModel>} model
   */
  constructor(model) {
    const look = MAP_LOOK;
    const layout = mapLayout(model);
    this.layout = layout;
    this.scene = new Scene();
    this.scene.background = new Color(PALETTE.void);
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 1, 400);
    this.root = new Group();
    this.scene.add(this.root);

    const [w, d] = layout.size;
    this.root.add(createFloor([w, 0, d], GRID_COLOR, [], {}));

    const side = ROOM_SIZE * look.cell;
    // The glass shader works in a unit cell: its geometry runs 0..1 and the mesh is scaled.
    const unit = new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
    for (const { room, min } of layout.rooms) {
      const segments = boxEdges(min, side, look.height);
      if (!room.visited) {
        this.root.add(neonLines(segments, lineMaterial({ color: room.color, width: 2, brightness: look.dimEdge, dashed: true })));
        continue;
      }
      const glass = new Mesh(unit, glassFaceMaterial(room.color, room.current ? { tint: look.currentTint } : {}));
      glass.scale.set(side, look.height, side);
      glass.position.set(min[0], 0, min[1]);
      const brightness = room.current ? look.currentEdge : look.edge;
      this.root.add(glass, neonLines(segments, lineMaterial({ color: room.color, width: look.edgeWidth, brightness })));
    }

    for (const { from, to, link } of layout.links) {
      const material = lineMaterial({
        color: 0xdfe6ff,
        width: look.linkWidth,
        brightness: link.visited ? look.link : look.dimLink,
        dashed: !link.adjacent,
      });
      this.root.add(neonLines([[flat(from, look.lineY), flat(to, look.lineY)]], material));
    }
    if (layout.stubs.length > 0) {
      const stubs = layout.stubs.map(({ from, to }) => [flat(from, look.lineY), flat(to, look.lineY)]);
      this.root.add(neonLines(stubs, lineMaterial({ color: PALETTE.cyan, width: look.stubWidth, brightness: look.stub })));
    }

    const here = layout.rooms.find(({ room }) => room.current);
    /** His marker over his room, a spinning magenta diamond with a beam down to the block. */
    this.marker = null;
    if (here) {
      const top = flat(here.center, look.height);
      const lift = look.markerLift;
      const beam = fadingLines([[[top[0], top[1] + lift - look.marker, top[2]], top]], { color: PALETTE.magenta, width: 2, brightness: 1.2 });
      const edges = new EdgesGeometry(new OctahedronGeometry(look.marker));
      const positions = edges.getAttribute('position').array;
      const segments = [];
      for (let i = 0; i < positions.length; i += 6) segments.push([[...positions.slice(i, i + 3)], [...positions.slice(i + 3, i + 6)]]);
      edges.dispose();
      this.marker = neonLines(segments, lineMaterial({ color: PALETTE.magenta, width: 2.5, brightness: 2 }));
      this.marker.scale.y = 1.4;
      this.markerBase = [top[0], top[1] + lift, top[2]];
      this.marker.position.set(...this.markerBase);
      this.root.add(beam, this.marker);
    }
  }

  /**
   * Fit the camera so every block shows inside a part of the screen,
   * centered in it, never closer than the game camera (MAP_LOOK.minView).
   * @param {{ x: number, y: number, width: number, height: number }} area
   *   the part of the screen, as shares of the stage (y down)
   * @returns {number} how much smaller than in the game the map is drawn (1 or less)
   */
  fit(area) {
    const look = MAP_LOOK;
    const [w, d] = this.layout.size;
    const target = new Vector3(w / 2, 0, d / 2);
    this.camera.position.copy(target).addScaledVector(ISO_DIRECTION, 100);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    // The blocks' corners in camera space.
    const side = ROOM_SIZE * look.cell;
    const inverse = this.camera.matrixWorldInverse;
    let [left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const { min } of this.layout.rooms) {
      for (const [dx, dz] of [
        [0, 0],
        [side, 0],
        [0, side],
        [side, side],
      ]) {
        for (const y of [0, look.height + look.markerLift + look.marker]) {
          const p = new Vector3(min[0] + dx, y, min[1] + dz).applyMatrix4(inverse);
          [left, right, bottom, top] = [Math.min(left, p.x), Math.max(right, p.x), Math.min(bottom, p.y), Math.max(top, p.y)];
        }
      }
    }
    if (left === Infinity) [left, right, bottom, top] = [0, 0, 0, 0];
    const m = look.viewMargin;
    const height = Math.max((right - left + 2 * m) / (area.width * ASPECT), (top - bottom + 2 * m) / area.height, look.minView);
    const width = height * ASPECT;
    // The blocks' middle lands on the area's middle.
    const [cx, cy] = [(left + right) / 2, (top + bottom) / 2];
    this.camera.left = cx - (area.x + area.width / 2) * width;
    this.camera.right = this.camera.left + width;
    this.camera.top = cy + (area.y + area.height / 2) * height;
    this.camera.bottom = this.camera.top - height;
    this.camera.updateProjectionMatrix();
    return look.minView / height;
  }

  /**
   * Where a room's top face center is on the stage, as shares (y down).
   * @param {number[]} center the room's [x, z] (mapLayout())
   */
  place(center) {
    const p = new Vector3(center[0], MAP_LOOK.height, center[1]).project(this.camera);
    return [(p.x + 1) / 2, (1 - p.y) / 2];
  }

  /** Animate his marker. @param {number} time seconds */
  update(time) {
    if (!this.marker) return;
    const look = MAP_LOOK;
    this.marker.rotation.y = time * look.spin;
    this.marker.position.y = this.markerBase[1] + Math.sin((time / look.bobTime) * Math.PI * 2) * look.bob;
  }

  dispose() {
    disposeTree(this.scene);
  }
}
