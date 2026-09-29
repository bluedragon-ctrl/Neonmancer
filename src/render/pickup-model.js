/**
 * The model of a room pickup by its kind (D71, D93): a data disk
 * (disk.js), a buff chip (chip.js) or a refill (refill.js). The room view
 * and the install animation both build them here.
 */
import { createChip } from './chip.js';
import { createDisk } from './disk.js';
import { createRefill } from './refill.js';

/**
 * The model of a pickup: a refill, a buff chip or a data disk.
 * @param {object} content loaded game data
 * @param {object} data the pickup (buildRoom()) or its type
 * @param {boolean} [ghost] permanent and found already
 */
export function createPickupModel(content, data, ghost = false) {
  if (data.kind === 'refill') return createRefill(data.stat);
  if (data.kind === 'buff') return createChip({ stat: data.stat, slot: data.slot, ghost });
  return createDisk({ ...content.spells[data.spell], ghost });
}
