/**
 * Small seeded dice for game logic that must play the same way every
 * time (a boss's teleports, D135): never Math.random() in logic.
 */

/**
 * A generator of numbers in [0, 1) from `seed` (mulberry32).
 * @param {number} seed
 * @returns {() => number}
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seed from a string (FNV-1a), e.g. an enemy's id.
 * @param {string} text
 */
export function stringSeed(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}
