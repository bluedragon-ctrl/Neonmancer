/**
 * The logic class for each object kind (the "kind" of an object type in
 * defs.json, listed in schemas/defs.schema.json). A new kind of object is
 * a class here and a view in render/room-scene.js.
 *
 * Every object class has: `id`, `kind` (from its type), `pos` and `prev`
 * ([x, y, z]; lower corner), `size`, `savePrevious()`, `box()` (it is a
 * body others collide with) and `update(game)`, returning an event type or
 * null. Optional: `push(dir, game)` for objects the wizard can push.
 */
import { Platform } from './platform.js';
import { Pushable } from './pushable.js';

export const OBJECT_KINDS = {
  pushable: Pushable,
  platform: Platform,
};

/**
 * The runtime object for a room object, by its kind.
 * @param {object} object runtime room object (see world/room.js)
 */
export function createObject(object) {
  return new OBJECT_KINDS[object.kind](object);
}
