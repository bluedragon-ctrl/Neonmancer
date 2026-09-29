/**
 * The central core (D101): three looks for the author to choose from in
 * the asset showcase (`?asset=core-reactor`, `core-monolith`, `core-heart`,
 * `cores-row`); the object type's `look` in defs.json picks one. The core
 * stands on a white pedestal (a mechanism, D99) in its 1×2×1 cell; gold
 * (FRAGMENT_COLOR) shows what the fragments gave: the access levels
 * reached and how many fragments are found.
 *
 * - reactor: a gold crystal floating over the pedestal, spinning, inside
 *   orbit rings, one per access level, each turning gold once reached.
 * - monolith: a tall server tower with a band of light per access level
 *   and gold data rising up its faces; a beam from its top grows with the
 *   fragments found.
 * - heart: a wireframe sphere beating in a white cage; its facets light up
 *   gold with the fragments found, one pip per access level on the pedestal.
 *
 * A touch that raises the level (or reboots the Grid) flashes it.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial } from 'three';
import { FRAGMENT_COLOR } from '../entities/pickup.js';
import { faceMaterial, lineMaterial, neonLines } from './neon.js';

/** The looks, as in the schema (defs.schema.json objectType.look). */
export const CORE_LOOKS = ['reactor', 'monolith', 'heart'];

/** Tuning (units, seconds). */
export const CORE_FX = {
  /** Pedestal: height, margin from the cell's sides. */
  pedestal: 0.32,
  margin: 0.1,
  /** Line brightness of the white parts; of gold parts not reached yet, and reached. */
  white: 1.4,
  dim: 0.35,
  lit: 2,
  /** Seconds a flash lasts; extra brightness at its start. */
  flash: 1.2,
  boost: 2.5,
  reactor: { crystal: [0.17, 0.42, 0.3], y: 1.12, bob: 0.05, spin: 0.9, ring: 0.44, ringSpin: 0.6 },
  monolith: { half: 0.28, top: 1.95, beam: 1.4, rise: 0.6, bits: 8 },
  heart: { cage: 0.38, y: 1.15, r: 0.26, beat: 1.1, pips: 0.12 },
};

const WHITE_FACE = new Color(0x070916);
const UNLIT = new Color(0xffffff);

/** Line segments of a box's 12 edges. */
function boxEdges([x0, y0, z0], [x1, y1, z1]) {
  const c = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.map(([a, b]) => [c(a), c(b)]);
}

/** Dark faces of a box. */
function boxFaces([x0, y0, z0], [x1, y1, z1], color = WHITE_FACE) {
  const c = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const positions = quads.flatMap(([a, b, d, e]) => [a, b, d, a, d, e].flatMap((i) => c(i)));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = faceMaterial(color);
  material.side = DoubleSide;
  return new Mesh(geometry, material);
}

/**
 * A circle of segments round the y axis, turned by `tilt` (radians about x).
 * @param {number} r
 * @param {number} [tilt]
 * @param {number} [n]
 */
export function ringSegments(r, tilt = 0, n = 40) {
  const point = (a) => {
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    return [x, -z * Math.sin(tilt), z * Math.cos(tilt)];
  };
  return Array.from({ length: n }, (_, i) => [point((i / n) * 2 * Math.PI), point(((i + 1) / n) * 2 * Math.PI)]);
}

/**
 * How lit each of `levels` level markers is: 1 for those reached (pure).
 * @param {number} level access level reached
 * @param {number} levels access levels the world has
 */
export function levelMarks(level, levels) {
  return Array.from({ length: levels }, (_, i) => (i < level ? 1 : 0));
}

/**
 * The flash of a touch that raised the level, `since` seconds ago: 1 at
 * once, fading to 0 (pure).
 * @param {number} since
 */
export function coreFlash(since) {
  if (!(since >= 0) || since >= CORE_FX.flash) return 0;
  return (1 - since / CORE_FX.flash) ** 2;
}

/** A line material whose color is set every frame. */
function liveLines(segments, width) {
  const material = lineMaterial({ color: 0xffffff, width });
  return { lines: neonLines(segments, material), material };
}

/**
 * The core, its lower corner at the origin, 1×2×1.
 * `userData.set({ level, share })`: the access level and the share of the
 * fragments found (0..1); `userData.flash()` flashes it; `userData.update(dt)`
 * animates it.
 * @param {object} [options]
 * @param {'reactor'|'monolith'|'heart'} [options.look]
 * @param {number|string} [options.color] its white (the object type's color)
 * @param {number} [options.levels] access levels the world has (world.json)
 */
export function createCore({ look = 'reactor', color = '#eef3ff', levels = 3 } = {}) {
  const base = new Color(color);
  const gold = new Color(FRAGMENT_COLOR);
  const group = new Group();
  const { pedestal: h, margin: m } = CORE_FX;
  const white = liveLines(boxEdges([m, 0, m], [1 - m, h, 1 - m]), 2);
  group.add(boxFaces([m, 0, m], [1 - m, h, 1 - m]), white.lines);
  /** Materials drawn in gold by how lit they are: { material, lit() }. */
  const golds = [];
  const state = { level: 0, share: 0, time: 0, since: Infinity };
  const parts = LOOKS[look]({ group, base, gold, golds, levels, whites: [white.material] });
  group.userData.set = ({ level = 0, share = 0 } = {}) => {
    state.level = level;
    state.share = share;
  };
  group.userData.flash = () => {
    state.since = 0;
  };
  group.userData.update = (dt) => {
    state.time += dt;
    state.since += dt;
    const boost = 1 + CORE_FX.boost * coreFlash(state.since);
    for (const material of parts.whites) material.color.copy(base).multiplyScalar(CORE_FX.white * boost);
    parts.animate(state, boost);
  };
  group.userData.update(0);
  return group;
}

/** Brightness of a gold part lit `t` (0..1). */
const goldLevel = (t) => CORE_FX.dim + (CORE_FX.lit - CORE_FX.dim) * t;

const LOOKS = {
  /** A gold crystal floating over the pedestal in orbit rings, one per level. */
  reactor({ group, gold, levels, whites }) {
    const fx = CORE_FX.reactor;
    const [r, up, down] = fx.crystal;
    const tips = [[0, up, 0], [0, -down, 0]];
    const around = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * r, 0, Math.sin((i * Math.PI) / 3) * r]);
    const segments = around.flatMap((p, i) => [[p, around[(i + 1) % 6]], [p, tips[0]], [p, tips[1]]]);
    const crystal = liveLines(segments, 2.6);
    const positions = around.flatMap((p, i) => tips.flatMap((tip) => [...tip, ...p, ...around[(i + 1) % 6]]));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const glow = new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const spin = new Group().add(new Mesh(geometry, glow), crystal.lines);
    spin.position.set(0.5, fx.y, 0.5);
    group.add(spin);
    // Rings round the crystal, tilted each its own way; they turn slowly.
    const rings = Array.from({ length: levels }, (_, i) => {
      const ring = liveLines(ringSegments(fx.ring - i * 0.04, 1.05 - (i * 0.9) / Math.max(1, levels - 1)), 1.8);
      const holder = new Group().add(ring.lines);
      holder.position.set(0.5, fx.y, 0.5);
      group.add(holder);
      return { ...ring, holder, angle: (i * 2 * Math.PI) / Math.max(3, levels), turn: fx.ringSpin * (i % 2 ? -1 : 1) };
    });
    return {
      whites,
      animate({ level, share, time }, boost) {
        spin.position.y = fx.y + fx.bob * Math.sin(time * 2);
        spin.rotation.y = time * fx.spin;
        crystal.material.color.copy(gold).multiplyScalar(goldLevel(0.4 + 0.6 * share) * boost);
        glow.opacity = (0.15 + 0.35 * share) * Math.min(boost, 2);
        levelMarks(level, levels).forEach((lit, i) => {
          const ring = rings[i];
          ring.holder.rotation.y = ring.angle + time * ring.turn;
          ring.material.color.copy(lit ? gold : UNLIT).multiplyScalar((lit ? CORE_FX.lit : 0.5) * boost);
        });
      },
    };
  },

  /** A tall server tower: a band per level, gold data rising, a beam from its top. */
  monolith({ group, gold, levels, whites }) {
    const fx = CORE_FX.monolith;
    const [a, b] = [0.5 - fx.half, 0.5 + fx.half];
    const y0 = CORE_FX.pedestal;
    const tower = liveLines(boxEdges([a, y0, a], [b, fx.top, b]), 2.2);
    group.add(boxFaces([a, y0, a], [b, fx.top, b]), tower.lines);
    whites.push(tower.material);
    const e = 0.012;
    const square = (y, s = fx.half + e) => [
      [[0.5 - s, y, 0.5 - s], [0.5 + s, y, 0.5 - s]],
      [[0.5 + s, y, 0.5 - s], [0.5 + s, y, 0.5 + s]],
      [[0.5 + s, y, 0.5 + s], [0.5 - s, y, 0.5 + s]],
      [[0.5 - s, y, 0.5 + s], [0.5 - s, y, 0.5 - s]],
    ];
    const bands = Array.from({ length: levels }, (_, i) => {
      const band = liveLines(square(y0 + ((i + 1) / (levels + 1)) * (fx.top - y0)), 2.4);
      group.add(band.lines);
      return band;
    });
    // Data bits rising up the two faces the camera sees (+x, +z).
    const bitGeometry = new BufferGeometry();
    const bitPositions = new Float32BufferAttribute(new Float32Array(fx.bits * 18), 3);
    bitGeometry.setAttribute('position', bitPositions);
    const bitSize = 0.035;
    const quad = (u, v, face) => {
      const p = (du, dv) => (face === 'x' ? [b + e, v + dv, u + du] : [u + du, v + dv, b + e]);
      return [p(-bitSize, -bitSize), p(bitSize, -bitSize), p(bitSize, bitSize), p(-bitSize, -bitSize), p(bitSize, bitSize), p(-bitSize, bitSize)].flat();
    };
    const bitMaterial = new MeshBasicMaterial({ color: gold, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const bits = new Mesh(bitGeometry, bitMaterial);
    group.add(bits);
    // The beam: two crossed additive planes over the top.
    const beamGeometry = new BufferGeometry();
    const w = 0.12;
    const t0 = fx.top;
    const t1 = fx.top + fx.beam;
    beamGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          [0.5 - w, t0, 0.5], [0.5 + w, t0, 0.5], [0.5 + w * 0.3, t1, 0.5], [0.5 - w, t0, 0.5], [0.5 + w * 0.3, t1, 0.5], [0.5 - w * 0.3, t1, 0.5],
          [0.5, t0, 0.5 - w], [0.5, t0, 0.5 + w], [0.5, t1, 0.5 + w * 0.3], [0.5, t0, 0.5 - w], [0.5, t1, 0.5 + w * 0.3], [0.5, t1, 0.5 - w * 0.3],
        ].flat(),
        3,
      ),
    );
    beamGeometry.setAttribute('color', new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0].concat([1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]), 3));
    const beamMaterial = new MeshBasicMaterial({ color: gold, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    group.add(new Mesh(beamGeometry, beamMaterial));
    return {
      whites,
      animate({ level, share, time }, boost) {
        levelMarks(level, levels).forEach((lit, i) => bands[i].material.color.copy(gold).multiplyScalar(goldLevel(lit) * boost));
        // As many rising bits as the fragments found call for (at least one while any are).
        const count = Math.ceil(share * fx.bits);
        for (let i = 0; i < count; i++) {
          const t = (time * fx.rise * (0.7 + ((i * 0.618) % 0.6)) + i * 0.37) % 1;
          const u = a + 0.06 + ((i * 0.381966 + 0.2) % 1) * (b - a - 0.12);
          bitPositions.array.set(quad(u, y0 + 0.05 + t * (fx.top - y0 - 0.1), i % 2 ? 'x' : 'z'), i * 18);
        }
        bitPositions.needsUpdate = true;
        bitGeometry.setDrawRange(0, count * 6);
        bitMaterial.opacity = Math.min(1, 0.6 * boost);
        beamMaterial.opacity = (0.08 + 0.5 * share) * boost;
      },
    };
  },

  /** A beating wireframe sphere in a white cage; facets lit by the fragments found, level pips. */
  heart({ group, gold, levels, whites }) {
    const fx = CORE_FX.heart;
    const c = fx.cage;
    const cage = liveLines(boxEdges([0.5 - c, CORE_FX.pedestal + 0.08, 0.5 - c], [0.5 + c, fx.y + c + 0.05, 0.5 + c]), 1.8);
    group.add(cage.lines);
    whites.push(cage.material);
    const ico = new IcosahedronGeometry(fx.r, 1).toNonIndexed();
    const position = ico.getAttribute('position');
    const facets = position.count / 3;
    const edgeSegments = [];
    for (let f = 0; f < facets; f++) {
      const v = [0, 1, 2].map((k) => [position.getX(3 * f + k), position.getY(3 * f + k), position.getZ(3 * f + k)]);
      edgeSegments.push([v[0], v[1]], [v[1], v[2]], [v[2], v[0]]);
    }
    const wire = liveLines(edgeSegments, 1.8);
    ico.setAttribute('color', new Float32BufferAttribute(new Array(position.count * 3).fill(0), 3));
    const fillMaterial = new MeshBasicMaterial({ color: gold, vertexColors: true, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const heart = new Group().add(new Mesh(ico, fillMaterial), wire.lines);
    heart.position.set(0.5, fx.y, 0.5);
    group.add(heart);
    // Level pips: small squares along the pedestal's +x and +z faces.
    const pips = Array.from({ length: levels }, (_, i) => {
      const s = fx.pips / 2;
      const u = 0.5 + (i - (levels - 1) / 2) * fx.pips * 1.8;
      const y = CORE_FX.pedestal / 2;
      const x = 1 - CORE_FX.margin + 0.005;
      const segments = [
        [[x, y - s, u - s], [x, y - s, u + s]], [[x, y - s, u + s], [x, y + s, u + s]], [[x, y + s, u + s], [x, y + s, u - s]], [[x, y + s, u - s], [x, y - s, u - s]],
        [[u - s, y - s, x], [u + s, y - s, x]], [[u + s, y - s, x], [u + s, y + s, x]], [[u + s, y + s, x], [u - s, y + s, x]], [[u - s, y + s, x], [u - s, y - s, x]],
      ];
      const pip = liveLines(segments, 2);
      group.add(pip.lines);
      return pip;
    });
    const colors = ico.getAttribute('color');
    // Facets light in a fixed scattered order, so found fragments spread over the sphere.
    const order = Array.from({ length: facets }, (_, i) => i).sort((p, q) => ((p * 0.618034) % 1) - ((q * 0.618034) % 1));
    let shownLit = -1;
    return {
      whites,
      animate({ level, share, time }, boost) {
        const beat = 1 + 0.06 * Math.max(0, Math.sin(time * fx.beat * 2 * Math.PI)) ** 8 + 0.03 * Math.sin(time * fx.beat * 2 * Math.PI);
        heart.scale.setScalar(beat);
        heart.rotation.y = time * 0.4;
        wire.material.color.copy(gold).multiplyScalar(goldLevel(0.3 + 0.7 * share) * boost);
        const lit = Math.round(share * facets);
        if (lit !== shownLit) {
          shownLit = lit;
          order.forEach((facet, rank) => {
            const on = rank < lit ? 1 : 0;
            for (let k = 0; k < 3; k++) colors.setXYZ(3 * facet + k, on, on, on);
          });
          colors.needsUpdate = true;
        }
        fillMaterial.opacity = 0.45 * Math.min(boost, 2);
        levelMarks(level, levels).forEach((on, i) => pips[i].material.color.copy(gold).multiplyScalar(goldLevel(on) * boost));
      },
    };
  },
};

/** The core in the room (entities/core.js): its level and fragments, and a flash when it raises the level. */
export class CoreView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/core.js').Core} core
   */
  constructor(game, core) {
    this.game = game;
    this.core = core;
    this.group = createCore({ look: core.object.look, color: core.object.color, levels: game.fragmentRules.access.length });
    this.group.position.set(...core.pos);
    this.sync(0);
  }

  /** The core took fragments: a level raised, or the Grid rebooted. */
  flash() {
    this.group.userData.flash();
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    const { progress, fragmentRules } = this.game;
    this.group.userData.set({ level: progress.accessLevel, share: Math.min(1, progress.count('fragments') / fragmentRules.required) });
    this.group.userData.update(dt);
  }
}
