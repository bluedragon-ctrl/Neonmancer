/**
 * Runtime room, built fresh from data every time the player enters, so a
 * room fully resets on re-entry (CLAUDE.md §4). Nothing here points back
 * into the data, so the game can change it freely.
 */
import { ENEMY_DEFAULTS, OBJECT_STYLE_DEFAULTS, blockCells, holeTiles, withExitDefaults } from '../data/room-data.js';

/**
 * The room's block cells by type (D60): static types go into the grid;
 * each cell of a type with a kind (collapsing) becomes a room object.
 * @returns {{ blocks: Record<string, number[][]>, objects: object[] }}
 */
function blocksByType(data, blockTypes) {
  const blocks = {};
  const objects = [];
  for (const block of data.blocks ?? []) {
    const type = blockTypes[block.type ?? 'block'];
    const cells = blockCells(block);
    if (type.static) {
      (blocks[type.id] ??= []).push(...cells);
      continue;
    }
    // Its look and tuning come from the type (color, edges, faces, regrow...).
    const { id: _, static: __, extends: ___, ...values } = type;
    for (const at of cells) objects.push({ id: `${type.id}@${at.join(',')}`, type: type.id, at, ...OBJECT_STYLE_DEFAULTS, ...values });
  }
  return { blocks, objects };
}

/**
 * @param {object} data room file contents (validated)
 * @param {{ objectTypes: object, blockTypes: object, enemyTypes?: object, enemyModels?: Record<string, string>, pickupTypes?: object, biomes: object }} content loaded game data
 */
export function buildRoom(data, { objectTypes, blockTypes, enemyTypes = {}, enemyModels = {}, pickupTypes = {}, biomes }) {
  const fromBlocks = blocksByType(data, blockTypes);
  return {
    id: data.id,
    name: data.name,
    biome: data.biome,
    color: biomes[data.biome].color,
    /** Surroundings (background, outer and wall grid, bloom), only what the biome sets (D62). */
    look: { ...biomes[data.biome].look },
    size: [...data.size],
    spawn: [...data.spawn],
    /** Where the wizard reappears after dying here, however he entered (D39). */
    reset: [...(data.reset ?? data.spawn)],
    exits: (data.exits ?? []).map(withExitDefaults),
    /** Static block cells as [x, y, z], by block type (only types the room uses). */
    blocks: fromBlocks.blocks,
    /** Block types (defs.json "blocks", variants filled in): look, color and properties (D60). */
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
    })).concat(fromBlocks.objects),
    /** Enemies: type values (movement, hostility, speed...) merged with this enemy's overrides, id, cell and path. */
    enemies: (data.enemies ?? []).map((enemy) => ({
      ...ENEMY_DEFAULTS,
      ...structuredClone(enemyTypes[enemy.type]),
      ...enemy.overrides,
      id: enemy.id,
      type: enemy.type,
      /** The base type whose look it has (a template's base, D58). */
      model: enemyModels[enemy.type] ?? enemy.type,
      at: [...enemy.at],
      ...(enemy.path && { path: structuredClone(enemy.path) }),
    })),
    /** Pickups (D71): type values (kind, spell or stat and amount) with this pickup's id and cell. */
    pickups: (data.pickups ?? []).map((pickup) => ({
      ...structuredClone(pickupTypes[pickup.type]),
      id: pickup.id,
      type: pickup.type,
      at: [...pickup.at],
    })),
  };
}
