/**
 * Runtime room, built fresh from data every time the player enters, so a
 * room fully resets on re-entry (CLAUDE.md §4). Nothing here points back
 * into the data, so the game can change it freely.
 */
import { OBJECT_STYLE_DEFAULTS, blockCells, holeTiles, withEnemyDefaults, withExitDefaults, withObjectDefaults } from '../data/room-data.js';

/**
 * The room's block cells by type (D60): static types go into the grid;
 * each cell of a type with a kind (a gate, D141) becomes a room object,
 * with the switches of its entry.
 * @returns {{ blocks: Record<string, number[][]>, objects: object[] }}
 */
function blocksByType(data, blockTypes, roomColor) {
  const blocks = {};
  const objects = [];
  for (const block of data.blocks ?? []) {
    const type = blockTypes[block.type ?? 'block'];
    const cells = blockCells(block);
    if (type.static) {
      (blocks[type.id] ??= []).push(...cells);
      continue;
    }
    // Its look and tuning come from the type (color, edges, faces, regrow...);
    // without a color it is room structure and takes the room color (D99).
    const { id: _, static: __, extends: ___, ...values } = type;
    const look = { ...OBJECT_STYLE_DEFAULTS, color: roomColor, ...values };
    const switches = block.switches && { switches: [...block.switches] };
    for (const at of cells) objects.push({ id: `${type.id}@${at.join(',')}`, type: type.id, at, ...look, ...switches });
  }
  return { blocks, objects };
}

/**
 * @param {object} data room file contents (validated)
 * @param {{ objectTypes: object, blockTypes: object, enemyTemplates?: object, pickupTypes?: object, biomes: object }} content loaded game data
 */
export function buildRoom(data, { objectTypes, blockTypes, enemyTemplates = {}, pickupTypes = {}, biomes }) {
  const fromBlocks = blocksByType(data, blockTypes, biomes[data.biome].color);
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
    /** Seconds on the room's watchdog timer (D171), or null: no timer. */
    timer: data.timer ?? null,
    exits: (data.exits ?? []).map(withExitDefaults),
    /** Static block cells as [x, y, z], by block type (only types the room uses). */
    blocks: fromBlocks.blocks,
    /** Block types (defs.json "blocks", variants filled in): look, color and properties (D60). */
    blockTypes: structuredClone(blockTypes),
    /** Hole floor tiles as [x, z]. */
    holes: (data.holes ?? []).flatMap(holeTiles),
    /** The backup shrine floor tile [x, z] (D97), or null. */
    shrine: data.shrine ? [...data.shrine] : null,
    /**
     * Typed objects: type defaults merged with this object's overrides; a
     * type without a color (a decoration) is room structure and takes the
     * room color (D99).
     */
    objects: (data.objects ?? []).map((object) => ({
      id: object.id,
      type: object.type,
      at: [...object.at],
      color: biomes[data.biome].color,
      ...withObjectDefaults(objectTypes[object.type]),
      ...object.overrides,
      // Moving platforms: the path they follow (world/path.js).
      ...(object.path && { path: structuredClone(object.path) }),
      // A screen's text id (lore.json, D118).
      ...(object.text && { text: object.text }),
      // The switches that power a gate or run a platform (D140).
      ...(object.switches && { switches: [...object.switches] }),
    })).concat(fromBlocks.objects),
    /** Enemies: their template's values (look, movement, attack, speed...; D119) with this enemy's id, cell, path and a boss's drop. */
    enemies: (data.enemies ?? []).map((enemy) => ({
      ...withEnemyDefaults(structuredClone(enemyTemplates[enemy.template])),
      id: enemy.id,
      template: enemy.template,
      at: [...enemy.at],
      ...(enemy.path && { path: structuredClone(enemy.path) }),
      // A boss's drop: the id of the pickup it holds (D104).
      ...(enemy.drop && { drop: enemy.drop }),
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
