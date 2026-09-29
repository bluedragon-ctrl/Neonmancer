/**
 * The model of a room pickup by its kind (D71, D93, D95): a data disk
 * (disk.js), an upgrade card (card.js, D95), a buff chip (chip.js), a secret (secret.js, D100), a key fragment
 * (fragment.js, D101) or a refill (refill.js). The room view
 * and the install animation both build them here.
 */
import { createCard } from './card.js';
import { createChip } from './chip.js';
import { createDisk } from './disk.js';
import { createFragment } from './fragment.js';
import { createSecret } from './secret.js';
import { createRefill } from './refill.js';

/**
 * The model of a pickup: a refill, a buff chip, an upgrade card, a secret, a fragment or a data disk.
 * @param {object} content loaded game data
 * @param {object} data the pickup (buildRoom()) or its type
 * @param {boolean} [ghost] permanent and found already
 */
export function createPickupModel(content, data, ghost = false) {
  if (data.kind === 'refill') return createRefill(data.stat);
  if (data.kind === 'buff') return createChip({ stat: data.stat, slot: data.slot, ghost });
  if (data.kind === 'upgrade') return createCard({ color: data.color, slot: data.slot, ghost });
  if (data.kind === 'secret') return createSecret({ ghost });
  if (data.kind === 'fragment') return createFragment({ slot: data.slot, ghost });
  return createDisk({ ...content.spells[data.spell], ghost });
}
