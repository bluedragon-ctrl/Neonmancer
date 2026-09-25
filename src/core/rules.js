/**
 * Game-rule constants shared by the engine and the data validator
 * (CLAUDE.md §4).
 */

/** Player collision box [x, y, z]; the hat is visual only (D3). */
export const PLAYER_HITBOX = [0.6, 1.5, 0.6];

/** Largest allowed room width + depth, so every room fits the fixed camera. */
export const MAX_ROOM_FOOTPRINT = 32;
