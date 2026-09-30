/**
 * Game-rule constants shared by the engine and the data validator
 * (CLAUDE.md §4).
 */

/** Player collision box [x, y, z]; the hat is visual only (D3). */
export const PLAYER_HITBOX = [0.6, 1.5, 0.6];

/** Largest allowed room width + depth, so every room fits the fixed camera. */
export const MAX_ROOM_FOOTPRINT = 32;

/** Room height limits (room.schema.json "size"): the wizard's 2 blocks of headroom, 6 at most. */
export const ROOM_HEIGHT = { min: 2, max: 6 };

/** Highest access level (D91, D101): what an access-locked exit may ask for. */
export const MAX_ACCESS_LEVEL = 15;

/** Highest maximum integrity the save key's 4-bit health field holds (CLAUDE.md §8). */
export const MAX_SAVED_INTEGRITY = 15;
