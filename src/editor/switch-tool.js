/**
 * The room editor's Switch tool (D140, D142): what a click in the room
 * does, worked out before it is done (the cursor and the hover line say
 * it), and the panel's link checklists, from either side: a picked switch
 * ticks what it powers, a picked gate, platform or exit ticks its
 * switches. Plain logic on a RoomEdit, no browser, so tests can drive it.
 */
import { exitCells, withExitDefaults } from '../data/room-data.js';
import { boxFields } from './boxes.js';
import { isSwitchGate, roomSwitches } from './links.js';

/**
 * @typedef {object} Linkable something switches can power
 * @property {'exit'|'gate'|'platform'} kind
 * @property {string} key stable while the room is unchanged: `exit:east`, `gate:5,0,6`, `platform:lift`
 * @property {string} label `exit east`, `gate ×4 at 5,0,6`, `lift`
 * @property {string[]|null} switches its switch ids, null: every switch in
 *   the room (a gate, a locked exit), [] none (an exit not locked, a platform that always runs)
 * @property {number[][]} cells the cells it fills (an exit: its opening's cells inside the room)
 * @property {string} [id] an exit's or a platform's id
 */

/** Same cell? */
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Everything in the room switches can power: every exit (one not locked
 * yet too), every switch gate (the cells joined with the same type and
 * switches as one) and every platform.
 * @param {import('./room-edit.js').RoomEdit} edit
 * @param {{ objectTypes: Record<string, object>, blockTypes: Record<string, object> }} types
 * @returns {Linkable[]}
 */
export function linkables(edit, { objectTypes, blockTypes }) {
  const out = [];
  for (const raw of edit.exits) {
    const exit = withExitDefaults(raw);
    const switches = exit.locked ? (exit.switches ?? null) : [];
    out.push({ kind: 'exit', key: `exit:${exit.id}`, id: exit.id, label: `exit ${exit.id}`, switches, cells: exitCells(exit, edit.size).inside });
  }
  const seen = new Set();
  for (const { cell, type: key } of edit.blocks.cells()) {
    const { type, switches } = boxFields(key);
    if (seen.has(cell.join()) || !isSwitchGate(blockTypes[type])) continue;
    const cells = edit.joined(cell, key).sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
    for (const c of cells) seen.add(c.join());
    const at = cells[0].join(',');
    out.push({ kind: 'gate', key: `gate:${at}`, label: `${type} ×${cells.length} at ${at}`, switches, cells });
  }
  for (const object of edit.data.objects ?? []) {
    if (objectTypes[object.type]?.kind !== 'platform') continue;
    out.push({ kind: 'platform', key: `platform:${object.id}`, id: object.id, label: object.id, switches: object.switches ?? [], cells: [object.at] });
  }
  return out;
}

/** Does switch `id` power `thing`? */
export function linked(thing, id) {
  return thing.switches === null || thing.switches.includes(id);
}

/**
 * The linkable a pick stands for: an exit, a platform (an item) or a gate
 * (a cell of it); or null.
 * @param {Linkable[]} things from linkables()
 * @param {{ kind: string, id?: string, cell?: number[] }|null} selected
 */
export function pickedLinkable(things, selected) {
  if (selected?.kind === 'exit') return things.find((t) => t.key === `exit:${selected.id}`) ?? null;
  if (selected?.kind === 'item') return things.find((t) => t.key === `platform:${selected.id}`) ?? null;
  if (selected?.kind === 'gate') return things.find((t) => t.kind === 'gate' && t.cells.some((c) => same(c, selected.cell))) ?? null;
  return null;
}

/**
 * Link switch `id` to `thing` or unlink it, from a checklist tick: a thing
 * on every switch (no list) unticked names the others; an exit left with
 * none is no longer locked, a gate with none is on every switch again, a
 * platform with none always runs.
 * @param {import('./room-edit.js').RoomEdit} edit
 * @param {Linkable} thing
 * @param {string} id
 * @param {boolean} on
 * @param {string[]} all the room's switch ids
 * @returns {boolean} whether anything changed
 */
export function setLink(edit, thing, id, on, all) {
  const base = thing.switches ?? all;
  const next = on ? [...new Set([...base, id])] : base.filter((one) => one !== id);
  return setSwitches(edit, thing, next);
}

/**
 * Put a gate or a locked exit on every switch in the room (no list), or
 * name them all instead (the same power, ready to untick some).
 * @param {import('./room-edit.js').RoomEdit} edit
 * @param {Linkable} thing a gate or an exit
 * @param {boolean} every
 * @param {string[]} all the room's switch ids
 * @returns {boolean} whether anything changed
 */
export function setEvery(edit, thing, every, all) {
  if (thing.kind === 'exit') return edit.updateExit(thing.id, every ? { locked: true, switches: undefined } : { locked: all.length > 0, switches: all.length > 0 ? all : undefined });
  if (thing.kind === 'gate') return edit.setGateSwitches(thing.cells[0], every ? [] : all);
  return false;
}

/** Give `thing` the switches `ids`. */
function setSwitches(edit, thing, ids) {
  if (thing.kind === 'exit') return edit.updateExit(thing.id, ids.length > 0 ? { locked: true, switches: ids } : { locked: false, switches: undefined });
  if (thing.kind === 'gate') return edit.setGateSwitches(thing.cells[0], ids);
  return edit.setSwitches(thing.id, ids);
}

/**
 * The panel's link checklist for what is picked: a switch lists what it
 * can power, a gate, platform or exit the room's switches; or null.
 * @param {Linkable[]} things from linkables()
 * @param {object[]} switches the room's switches (roomSwitches())
 * @param {{ switch?: object|null, thing?: Linkable|null }} picked
 * @returns {{ picked: string, title: string, every: boolean|null, rows: { key: string, label: string, checked: boolean, disabled: boolean }[] }|null}
 *   `picked` names what is picked, `every` whether it is on every switch (null: no such choice)
 */
export function linkList(things, switches, picked) {
  const sw = picked.switch;
  if (sw) {
    const rows = things.map((thing) => ({ key: thing.key, label: thingLabel(thing), checked: linked(thing, sw.id), disabled: false }));
    return { picked: sw.id, title: rows.length > 0 ? `${sw.id} powers:` : `${sw.id}: nothing here to power yet (gates, platforms, exits).`, every: null, rows };
  }
  const thing = picked.thing;
  if (!thing) return null;
  const every = thing.kind === 'platform' ? null : thing.switches === null;
  const verb = thing.kind === 'platform' ? 'runs on' : 'opens on';
  const rows = switches.map((object) => ({ key: object.id, label: object.id, checked: linked(thing, object.id), disabled: !!every }));
  return { picked: thing.label, title: switches.length > 0 ? `${thing.label} ${verb}:` : `${thing.label}: no switches in the room yet.`, every, rows };
}

/** A thing's checklist label, with how it stands now. */
function thingLabel(thing) {
  if (thing.switches === null) return `${thing.label} (every switch)`;
  if (thing.kind === 'exit' && thing.switches.length === 0) return `${thing.label} (not locked)`;
  return thing.label;
}

/**
 * @typedef {object} SwitchClick what a left click of the Switch tool does
 * @property {'place'|'pick'|'link'|'unlink'|'none'} action
 * @property {string} text in words, for the hover line and the status
 * @property {{ kind: string, id?: string, cell?: number[] }} [pick] the pick (pick)
 * @property {Linkable} [thing] what is linked or unlinked (link, unlink)
 * @property {string} [switchId] the switch linked or unlinked (link, unlink)
 */

/**
 * What a left click of the Switch tool on `cell` does (D142). Nothing
 * picked: a click on a switch, a gate, a platform or an exit picks it, on
 * a free cell places a switch. A switch picked: a click on a gate,
 * platform or exit links or unlinks it. A gate, platform or exit picked: a
 * click on a switch links or unlinks it. With something picked a click
 * never places, and picks something else only with Shift.
 * @param {import('./room-edit.js').RoomEdit} edit
 * @param {{ objectTypes: Record<string, object>, blockTypes: Record<string, object> }} types
 * @param {object} options
 * @param {number[]} options.cell
 * @param {object|null} options.exit the exit in that cell (on the side the mouse is nearer), or null
 * @param {{ kind: string, id?: string, cell?: number[] }|null} options.selected the editor's pick
 * @param {boolean} [options.shift]
 * @param {string} options.switchType type of a switch placed
 * @returns {SwitchClick}
 */
export function switchClick(edit, types, { cell, exit, selected, shift = false, switchType }) {
  const switches = roomSwitches(edit.data, types.objectTypes);
  const things = linkables(edit, types);
  const here = edit.at(cell);
  const switchHere = here?.kind === 'object' ? (switches.find((object) => object.id === here.item.id) ?? null) : null;
  const thingHere =
    (exit && things.find((t) => t.key === `exit:${exit.id}`)) ||
    (here?.kind === 'object' && things.find((t) => t.key === `platform:${here.item.id}`)) ||
    ((here?.kind === 'block' || here?.kind === 'pickup') && things.find((t) => t.kind === 'gate' && t.cells.some((c) => same(c, cell)))) ||
    null;
  const pickedSwitch = selected?.kind === 'item' ? (switches.find((object) => object.id === selected.id) ?? null) : null;
  const pickedThing = pickedSwitch ? null : pickedLinkable(things, selected);
  const pickOf = (thing) => (thing.kind === 'gate' ? { kind: 'gate', cell: [...cell] } : thing.kind === 'exit' ? { kind: 'exit', id: thing.id } : { kind: 'item', id: thing.id });
  const pickSwitch = (object) => ({ action: 'pick', text: `pick ${object.id}`, pick: { kind: 'item', id: object.id } });
  const pickThing = (thing) => ({ action: 'pick', text: `pick ${thing.label}`, pick: pickOf(thing) });
  const toggle = (thing, id) => {
    const on = thing.switches !== null && thing.switches.includes(id);
    if (on) return { action: 'unlink', text: `unlink ${thing.label} from ${id}`, thing, switchId: id };
    const only = thing.switches === null ? ` only (it is on every switch)` : '';
    return { action: 'link', text: `link ${thing.label} to ${id}${only}`, thing, switchId: id };
  };
  const none = (text) => ({ action: 'none', text });

  if (!pickedSwitch && !pickedThing) {
    if (switchHere) return pickSwitch(switchHere);
    if (thingHere) return pickThing(thingHere);
    if (!here && !exit) return { action: 'place', text: `place ${switchType}` };
    return none('nothing to link here');
  }
  const name = pickedSwitch ? pickedSwitch.id : pickedThing.label;
  if (pickedSwitch) {
    if (thingHere) return toggle(thingHere, pickedSwitch.id);
    if (switchHere?.id === pickedSwitch.id) return none(`${name} is picked`);
    if (switchHere) return shift ? pickSwitch(switchHere) : none(`Shift+click picks ${switchHere.id} instead`);
  } else {
    if (switchHere) return toggle(pickedThing, switchHere.id);
    if (thingHere?.key === pickedThing.key) return none(`${name} is picked`);
    if (thingHere) return shift ? pickThing(thingHere) : none(`Shift+click picks ${thingHere.label} instead`);
  }
  return none(here || exit ? `${name} picked: nothing to link here` : `${name} picked: Esc first to place a switch`);
}
