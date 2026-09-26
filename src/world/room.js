/**
 * Runtime room, built fresh from data every time the player enters, so a
 * room fully resets on re-entry (CLAUDE.md §4). Nothing here points back
 * into the data, so the game can change it freely.
 */
import { OBJECT_STYLE_DEFAULTS, blockCells, holeTiles, withExitDefaults } from '../data/room-data.js';

/** Cells of the room's blocks of one type ("type" defaults to "block"). */
function blocksOfType(data, type) {
  return (data.blocks ?? []).filter((block) => (block.type ?? 'block') === type).flatMap(blockCells);
}

/**
 * @param {object} data room file contents (validated)
 * @param {{ objectTypes: object, blockTypes: object, biomes: object }} content loaded game data
 */
export function buildRoom(data, { objectTypes, blockTypes, biomes }) {
  return {
    id: data.id,
    name: data.name,
    biome: data.biome,
    color: biomes[data.biome].color,
    size: [...data.size],
    spawn: [...data.spawn],
    /** Where the wizard reappears after dying here, however he entered (D39). */
    reset: [...(data.reset ?? data.spawn)],
    exits: (data.exits ?? []).map(withExitDefaults),
    /** Plain static block cells as [x, y, z]. */
    cells: blocksOfType(data, 'block'),
    /** Cells of the other static block types (D40), by type. */
    typedCells: { hazard: blocksOfType(data, 'hazard'), void: blocksOfType(data, 'void') },
    /** Color and rules of those block types (defs.json "blocks"). */
    blockTypes: structuredClone(blockTypes),
    /** Hole floor tiles as [x, z]. */
    holes: (data.holes ?? []).flatMap(holeTiles),
    /** Typed objects: type defaults merged with this object's overrides. */
    objects: (data.objects ?? []).map((object) => ({
      id: object.id,
      type: object.type,
      at: [...object.at],
      ...OBJECT_STYLE_DEFAULTS,
      ...objectTypes[object.type],
      ...object.overrides,
      // Moving platforms: the path they follow (world/path.js).
      ...(object.path && { path: structuredClone(object.path) }),
      // Collapsing blocks: seconds until they grow back (none: they never do).
      ...(object.regrow !== undefined && { regrow: object.regrow }),
    })),
  };
}
