/**
 * three.js pieces of the Zap look (timing and shapes in zap-fx.js): the
 * bolt, the flare at the wizard's hands and the sparks where a bolt stops.
 */
import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { PALETTE, lineMaterial, neonLines, shared } from './neon.js';
import { ZAP_FX, boltLook, castFlare, sparkPixels, trailPoints } from './zap-fx.js';
import { createPixelBurst, placePixels } from './entity-view.js';
import { lerpPosition } from './interp.js';

/** Unit sphere every bolt and flare shares. */
const BALL = shared(new SphereGeometry(1, 16, 8));

/** Additive glow in `color`, `brightness` times as bright (above 1 blooms). */
function glowMaterial(color, brightness, opacity = 1) {
  return shared(
    new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(brightness),
      blending: AdditiveBlending,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
}

const CORE = glowMaterial(0xffffff, 2.6);
const HALO = glowMaterial(PALETTE.cyan, 1.4, 0.55);
const FLARE = glowMaterial(PALETTE.cyan, 1.8, 0.8);

/** Trail lines: a wide cyan zigzag with a thin white-hot one inside. */
const TRAIL_OUTER = { color: PALETTE.cyan, width: 4, brightness: 2.2 };
const TRAIL_INNER = { color: 0xffffff, width: 1.5, brightness: 2.4 };

/** Consecutive points as segments [[a, b], [b, c], ...]. */
function polyline(points) {
  return points.slice(1).map((point, i) => [points[i], point]);
}

/**
 * A Zap bolt as a three.js group, flying along its own +z (turn it with
 * placeBolt()). `userData.trails` holds the zigzag variants, one shown at a
 * time; `userData.trail` scales them all along the flight.
 */
export function createBolt() {
  const { core, halo, trail } = ZAP_FX;
  const coreMesh = new Mesh(BALL, CORE);
  coreMesh.scale.set(core.width / 2, core.width / 2, core.length / 2);
  const haloMesh = new Mesh(BALL, HALO);
  haloMesh.scale.set(halo.width / 2, halo.width / 2, halo.length / 2);

  const trails = [];
  for (let v = 0; v < trail.variants; v++) {
    const segments = polyline(trailPoints(v));
    const lines = new Group().add(neonLines(segments, lineMaterial(TRAIL_OUTER)), neonLines(segments, lineMaterial(TRAIL_INNER)));
    lines.visible = false;
    trails.push(lines);
  }
  const trailGroup = new Group().add(...trails);
  const group = new Group().add(trailGroup, haloMesh, coreMesh);
  Object.assign(group.userData, { trails, trail: trailGroup, core: coreMesh, halo: haloMesh });
  return group;
}

/**
 * Show a bolt this frame.
 * @param {Group} bolt from createBolt()
 * @param {number[]} pos its core [x, y, z]
 * @param {number[]} dir flight direction [dx, dz] (need not be normalized)
 * @param {number} age ticks since it was cast
 * @param {number} traveled units flown so far
 */
export function placeBolt(bolt, pos, [dx, dz], age, traveled) {
  const { trails, trail, core, halo } = bolt.userData;
  const look = boltLook(age, traveled);
  bolt.position.set(...pos);
  bolt.rotation.y = Math.atan2(dx, dz);
  trails.forEach((lines, i) => (lines.visible = i === look.variant));
  trail.scale.z = Math.max(look.trail, 1e-3);
  const { width, length } = ZAP_FX.halo;
  halo.scale.set((width / 2) * look.pulse, (width / 2) * look.pulse, length / 2);
  core.scale.x = core.scale.y = (ZAP_FX.core.width / 2) * look.pulse;
}

/** The flare at the wizard's hands when he casts (placeCastFlare()). */
export function createCastFlare() {
  const hot = new Mesh(BALL, CORE);
  hot.scale.setScalar(0.45);
  const flare = new Group().add(new Mesh(BALL, FLARE), hot);
  flare.visible = false;
  return flare;
}

/**
 * Show the cast flare `tick` ticks after casting, in front of the wizard.
 * @param {Group} flare from createCastFlare()
 * @param {number[]} feet the wizard's feet center
 * @param {number} facing his facing angle (radians, 0 looks along +z)
 * @param {number} tick
 */
export function placeCastFlare(flare, feet, facing, tick) {
  const size = castFlare(tick);
  flare.visible = size > 0;
  if (!flare.visible) return;
  const { reach, height } = ZAP_FX;
  flare.position.set(feet[0] + Math.sin(facing) * reach, feet[1] + height, feet[2] + Math.cos(facing) * reach);
  flare.scale.setScalar(size);
}

/**
 * Sparks for where a bolt stops: a group turned like the bolt (placeSparks()),
 * holding the pixel burst in the bolt's frame.
 */
export function createSparks() {
  const burst = createPixelBurst(ZAP_FX.sparks.pixels, ZAP_FX.sparks.pixelSize, [PALETTE.cyan, 0xffffff]);
  const group = new Group().add(burst);
  group.userData.burst = burst;
  return group;
}

/**
 * Show the sparks `tick` ticks after a bolt stopped at `pos`, flying back
 * against its direction `dir` [dx, dz]; hidden once they are over.
 * @param {Group} sparks from createSparks()
 * @param {number[]} pos
 * @param {number[]} dir
 * @param {number} tick
 */
export function placeSparks(sparks, pos, [dx, dz], tick) {
  sparks.position.set(...pos);
  sparks.rotation.y = Math.atan2(dx, dz);
  placePixels(sparks.userData.burst, sparkPixels(tick), [0, 0, 0]);
}

/**
 * The room's bolts and sparks in flight: a view per bolt while it flies,
 * sparks where one stopped (spark(), from the 'zap' event). Views are
 * pooled, so casting makes no new meshes once the pools have grown.
 */
export class ZapView {
  /** @param {import('../game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.group = new Group();
    /** Bolt views by bolt, and the spare ones. */
    this.bolts = new Map();
    this.spareBolts = [];
    /** Sparks: { view, pos, dir, tick, done }; tick counts ticks (from frame times) since the stop. */
    this.sparks = [];
  }

  /**
   * A bolt stopped: sparks at where it is now, flying back against its flight.
   * @param {import('../entities/bolt.js').Bolt} bolt
   */
  spark(bolt) {
    let spark = this.sparks.find((s) => s.done);
    if (!spark) {
      spark = { view: createSparks() };
      this.sparks.push(spark);
      this.group.add(spark.view);
    }
    Object.assign(spark, { pos: [...bolt.pos], dir: bolt.dir, tick: 0, done: false });
  }

  /**
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(alpha, dt) {
    const live = this.game.bolts;
    for (const [bolt, view] of this.bolts) {
      if (live.includes(bolt)) continue;
      view.visible = false;
      this.bolts.delete(bolt);
      this.spareBolts.push(view);
    }
    for (const bolt of live) {
      let view = this.bolts.get(bolt);
      if (!view) {
        view = this.spareBolts.pop();
        if (!view) this.group.add((view = createBolt()));
        view.visible = true;
        this.bolts.set(bolt, view);
      }
      placeBolt(view, lerpPosition(bolt.prev, bolt.pos, alpha), bolt.dir, bolt.age - 1 + alpha, bolt.traveled);
    }
    for (const spark of this.sparks) {
      if (spark.done) continue;
      placeSparks(spark.view, spark.pos, spark.dir, spark.tick); // hides them once they are over
      spark.done = spark.tick >= ZAP_FX.sparks.ticks;
      spark.tick += dt * 60;
    }
  }
}
