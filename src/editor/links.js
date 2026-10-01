/**
 * Switch links in a room being edited (D140, D141), both ways: what a
 * switch powers (locked exits, switch gate blocks, platforms) and which
 * switches power those. Plain logic on room data, no browser, so tests
 * can drive it; the editor shows it in the hover line, the panel and as
 * lines over the room (overlay.js).
 */
import { blockCells, exitCells, withExitDefaults } from '../data/room-data.js';
import { SWITCH_KINDS } from '../entities/switch.js';

/**
 * @typedef {object} Powered
 * @property {'exit'|'gate'|'platform'} kind
 * @property {string} label how the editor names it: `exit east`, `gate blocks[2]`, `lift`
 * @property {string[]|null} switches the ids that power it, or null: every switch in the room
 * @property {number[][]} cells the cells it fills (an exit: its opening's cells inside the room)
 * @property {string} [id] an exit's or a platform's id
 * @property {number} [block] a gate's index in `blocks`
 */

/**
 * Is a block type a switch gate (D140, D141)?
 * @param {object} [type] resolved block type
 */
export function isSwitchGate(type) {
  return type?.kind === 'gate' && (type.trigger ?? 'switch') === 'switch';
}

/**
 * The room's switches (targets and plates).
 * @param {object} data room data
 * @param {Record<string, object>} objectTypes
 * @returns {object[]} room objects
 */
export function roomSwitches(data, objectTypes) {
  return (data.objects ?? []).filter((object) => SWITCH_KINDS.includes(objectTypes[object.type]?.kind));
}

/**
 * Everything in the room that switches power: locked exits, switch gate
 * block entries and platforms with switches.
 * @param {object} data room data
 * @param {{ objectTypes: Record<string, object>, blockTypes: Record<string, object> }} types
 * @returns {Powered[]}
 */
export function poweredThings(data, { objectTypes, blockTypes }) {
  const out = [];
  for (const exit of data.exits ?? []) {
    if (!exit.locked) continue;
    out.push({ kind: 'exit', id: exit.id, label: `exit ${exit.id}`, switches: exit.switches ?? null, cells: exitCells(withExitDefaults(exit), data.size).inside });
  }
  (data.blocks ?? []).forEach((block, i) => {
    if (!isSwitchGate(blockTypes[block.type ?? 'block'])) return;
    const cells = blockCells(block);
    out.push({ kind: 'gate', block: i, label: `${block.type} ×${cells.length}`, switches: block.switches ?? null, cells });
  });
  for (const object of data.objects ?? []) {
    if (objectTypes[object.type]?.kind !== 'platform' || !object.switches) continue;
    out.push({ kind: 'platform', id: object.id, label: object.id, switches: object.switches, cells: [object.at] });
  }
  return out;
}

/**
 * What switch `id` powers.
 * @param {Powered[]} powered from poweredThings()
 * @param {string} id
 */
export function poweredBy(powered, id) {
  return powered.filter((thing) => thing.switches === null || thing.switches.includes(id));
}

/**
 * The switches that power `thing` (all of the room's without a list).
 * @param {Powered} thing
 * @param {object[]} switches the room's switches (roomSwitches())
 */
export function switchesOf(thing, switches) {
  return thing.switches === null ? switches : switches.filter((object) => thing.switches.includes(object.id));
}

/** Same cell? */
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * The links of what is in a cell, or null when nothing there is linked:
 * a switch and what it powers, or a powered thing and its switches.
 * @param {object} data room data
 * @param {{ objectTypes: Record<string, object>, blockTypes: Record<string, object> }} types
 * @param {number[]} cell [x, y, z]
 * @returns {{ switches: object[], powered: Powered[], text: string }|null}
 *   `text` in words for the hover line and the panel
 */
export function linksAt(data, types, cell) {
  const switches = roomSwitches(data, types.objectTypes);
  const powered = poweredThings(data, types);
  const names = (list) => list.map((object) => object.id).join(', ');
  const zwitch = switches.find((object) => same(object.at, cell));
  if (zwitch) {
    const things = poweredBy(powered, zwitch.id);
    return { switches: [zwitch], powered: things, text: things.length > 0 ? `powers ${things.map((thing) => thing.label).join(', ')}` : 'powers nothing' };
  }
  const thing = powered.find((one) => one.cells.some((c) => same(c, cell)));
  if (!thing) return null;
  const linked = switchesOf(thing, switches);
  const which = thing.switches === null ? `every switch (${names(linked) || 'none'})` : names(linked) || 'none';
  return { switches: linked, powered: [thing], text: `${thing.kind === 'platform' ? 'runs on' : 'opens on'} ${which}` };
}

/**
 * Describe a switch's timer (D140) for the panel: its type's, or this
 * object's override.
 * @param {object} object room object
 * @param {Record<string, object>} objectTypes
 * @returns {number|null} seconds, or null for a plain switch
 */
export function switchTimer(object, objectTypes) {
  return object.overrides?.timer ?? objectTypes[object.type]?.timer ?? null;
}
