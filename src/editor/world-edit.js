/**
 * world.json while the room editor works: a new room gets a free cell on
 * the world map next to the room it was made from (D66), and its exits
 * lead to its neighbours there (D259). Plain logic, no browser.
 */
import { nearestFreeCell } from '../world/map.js';
import { FileEdit } from './file-edit.js';

export class WorldEdit extends FileEdit {
  /**
   * Put a new room on the world map, in the free cell nearest to another
   * room (to be moved in the world map tool afterwards).
   * @param {string} id the new room
   * @param {string} near the room it was made from
   */
  place(id, near) {
    const positions = (this.data.positions ??= {});
    positions[id] = nearestFreeCell(positions, positions[near] ?? [0, 0]);
  }

  /** Take a room off the world map (a new room thrown away). */
  unplace(id) {
    delete this.data.positions?.[id];
  }
}
