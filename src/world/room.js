/**
 * Runtime room, built fresh from data every time the player enters, so a
 * room fully resets on re-entry (CLAUDE.md §4). Nothing here points back
 * into the data, so the game can change it freely.
 */
import { blockCells, withExitDefaults } from '../data/room-data.js';

/**
 * @param {object} data room file contents (validated)
 * @param {{ objectTypes: object, biomes: object }} content loaded game data
 */
export function buildRoom(data, { objectTypes, biomes }) {
  return {
    id: data.id,
    name: data.name,
    biome: data.biome,
    color: biomes[data.biome].color,
    size: [...data.size],
    spawn: [...data.spawn],
    exits: (data.exits ?? []).map(withExitDefaults),
    /** Static block cells as [x, y, z]. */
    cells: (data.blocks ?? []).flatMap(blockCells),
    /** Typed objects: type defaults merged with this object's overrides. */
    objects: (data.objects ?? []).map((object) => ({
      id: object.id,
      type: object.type,
      at: [...object.at],
      ...objectTypes[object.type],
      ...object.overrides,
    })),
  };
}
