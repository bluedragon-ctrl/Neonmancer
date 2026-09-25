/**
 * The wizard model: a cone body, a ball head, two small floating ball
 * hands and a pointy hat (cone + brim) tilted back, so the isometric
 * camera sees the face under the brim. Neon lines
 * over dark occluding faces (D5), slightly thicker than the environment's.
 *
 * The model stands on y = 0 around the y axis and looks along +z. It is
 * about 2.2 units tall; only the lower 1.5 is the hitbox (the hat is visual
 * only, D3). The hands float a little outside the hitbox.
 */
import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { flattenSegments } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial } from './neon.js';

/** Sides of the body cone, brim and hat (a flat side faces forward). */
const SIDES = 8;
/** Rotation of the first corner so a flat side faces +z. */
const START = Math.PI / SIDES;

/** Proportions in world units. */
export const WIZARD = {
  body: { y0: 0, y1: 0.75, r0: 0.3, r1: 0.07 },
  head: { y: 0.95, r: 0.21 },
  hands: { x: 0.33, y: 0.48, z: 0.06, r: 0.075 },
  brim: { y: 1.12, r: 0.31, thickness: 0.03 },
  hat: { y0: 1.14, r: 0.22, tipY: 1.88 },
  /** Backward tilt of the whole hat around the brim center, in radians. */
  hatTilt: 0.3,
};

/** Character lines are thicker than the environment's 2.5 px. */
const LINE_WIDTH = 3.5;
/** Ribs (upright cone lines, globe lines on the balls) are thinner and darker than the rims. */
const RIB_WIDTH = 2;
const RIB_BRIGHTNESS = 0.6;

/** Corners of a regular polygon ring at height y. */
function ring(r, y) {
  return Array.from({ length: SIDES }, (_, i) => {
    const a = START + (i * 2 * Math.PI) / SIDES;
    return [r * Math.sin(a), y, r * Math.cos(a)];
  });
}

/** Closed loop through the points. */
function loop(points) {
  return points.map((p, i) => [p, points[(i + 1) % points.length]]);
}

/**
 * A ball drawn as a globe: three great circles (horizontal, and two upright
 * ones through the front and the side).
 * @param {number[]} center
 * @param {number} r
 * @param {number} sides segments per circle
 */
function ball([cx, cy, cz], r, sides) {
  const circle = (point) =>
    loop(
      Array.from({ length: sides }, (_, i) => {
        const a = (i * 2 * Math.PI) / sides;
        const [x, y, z] = point(r * Math.cos(a), r * Math.sin(a));
        return [cx + x, cy + y, cz + z];
      }),
    );
  return [
    ...circle((u, v) => [u, 0, v]),
    ...circle((u, v) => [u, v, 0]),
    ...circle((u, v) => [0, v, u]),
  ];
}

/** Tilt a hat point back around the brim center (the tip moves to −z, the brim front up). */
function tiltHat([x, y, z]) {
  const a = -WIZARD.hatTilt;
  const dy = y - WIZARD.brim.y;
  return [x, WIZARD.brim.y + dy * Math.cos(a) - z * Math.sin(a), dy * Math.sin(a) + z * Math.cos(a)];
}

/**
 * Line segments of the wizard, split by color group (pure, tested).
 * Ribs are the upright lines of the body and hat cones; they and the globe
 * lines of the head and hands are drawn fainter than the rims.
 * @returns {{ body: number[][][], bodyRibs: number[][][], head: number[][][], hands: number[][][], hat: number[][][], hatRibs: number[][][], eyes: number[][][] }}
 */
export function wizardSegments() {
  const { body, head, hands, brim, hat } = WIZARD;

  // Body: a cone (frustum), bottom and top rings joined at the corners.
  const bottom = ring(body.r0, body.y0);
  const top = ring(body.r1, body.y1);
  const bodySegments = [...loop(bottom), ...loop(top)];
  const bodyRibs = bottom.map((p, i) => [p, top[i]]);

  // Head: a ball on top of the body.
  const headSegments = ball([0, head.y, 0], head.r, 16);

  // Hands: small balls floating beside the body.
  const handSegments = [-1, 1].flatMap((side) => ball([side * hands.x, hands.y, hands.z], hands.r, 8));

  // Hat: brim ring and a cone to the tip, tilted back.
  const base = ring(hat.r, hat.y0);
  const tip = [0, hat.tipY, 0];
  const tilt = (segments) => segments.map((segment) => segment.map(tiltHat));
  const hatSegments = tilt([...loop(ring(brim.r, brim.y)), ...loop(base)]);
  const hatRibs = tilt(base.map((p) => [p, tip]));

  // Eyes: two short bright ticks on the front of the head, just below the brim.
  const eyeY = head.y + 0.04;
  const eyeZ = Math.sqrt(head.r ** 2 - 0.08 ** 2 - 0.05 ** 2) + 0.01;
  const eyes = [
    [[-0.08, eyeY, eyeZ], [-0.03, eyeY, eyeZ + 0.01]],
    [[0.03, eyeY, eyeZ + 0.01], [0.08, eyeY, eyeZ]],
  ];

  return { body: bodySegments, bodyRibs, head: headSegments, hands: handSegments, hat: hatSegments, hatRibs, eyes };
}

/** Dark occluding solids matching the line model. */
function createFaces() {
  const { body, head, hands, brim, hat } = WIZARD;
  const material = faceMaterial();
  const solid = (geometry, x, y, z = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    return mesh;
  };

  // The hat solids sit in a group pivoting at the brim center, tilted like the lines.
  const hatFaces = new Group();
  hatFaces.position.y = brim.y;
  hatFaces.rotation.x = -WIZARD.hatTilt;
  hatFaces.add(
    solid(new CylinderGeometry(brim.r, brim.r, brim.thickness, SIDES, 1, false, START), 0, 0),
    solid(new ConeGeometry(hat.r, hat.tipY - hat.y0, SIDES, 1, false, START), 0, (hat.tipY + hat.y0) / 2 - brim.y),
  );

  // Balls are a hair smaller than their line circles, so the circles never
  // sink into their own solid.
  const handGeometry = new SphereGeometry(hands.r * 0.95, 8, 6);
  return [
    solid(new CylinderGeometry(body.r1, body.r0, body.y1 - body.y0, SIDES, 1, false, START), 0, (body.y0 + body.y1) / 2),
    solid(new SphereGeometry(head.r * 0.97, 16, 12), 0, head.y),
    solid(handGeometry, -hands.x, hands.y, hands.z),
    solid(handGeometry, hands.x, hands.y, hands.z),
    hatFaces,
  ];
}

function lines(segments, material) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(flattenSegments(segments));
  const line = new LineSegments2(geometry, material);
  line.renderOrder = 2;
  return line;
}

/**
 * The wizard as a three.js group (origin at the feet, looking along +z).
 * @param {object} [colors]
 * @param {number|string} [colors.body] body cone
 * @param {number|string} [colors.head] head and hands
 * @param {number|string} [colors.hat]
 */
export function createWizard({ body = PALETTE.magenta, head = PALETTE.cyan, hat = PALETTE.magenta } = {}) {
  const group = new Group();
  const segments = wizardSegments();
  const rim = (color) => lineMaterial({ color, width: LINE_WIDTH, brightness: 1.6 });
  const rib = (color) => lineMaterial({ color, width: RIB_WIDTH, brightness: RIB_BRIGHTNESS });
  const headRibs = rib(head);
  group.add(
    ...createFaces(),
    lines(segments.body, rim(body)),
    lines(segments.bodyRibs, rib(body)),
    lines(segments.head, headRibs),
    lines(segments.hands, headRibs),
    lines(segments.hat, rim(hat)),
    lines(segments.hatRibs, rib(hat)),
    lines(segments.eyes, lineMaterial({ color: 0xffffff, width: LINE_WIDTH, brightness: 2 })),
  );
  return group;
}
