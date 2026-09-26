/**
 * A fixed pseudo-random number for effects that must look the same every
 * time (pixel bursts). Pure, no three.js.
 */

/**
 * A number in [0, 1) for pixel `i` and channel `k`; `seed` picks another
 * sequence.
 * @param {number} i
 * @param {number} k
 * @param {number[]} [seed]
 */
export function hash(i, k, [a, b] = [127.1, 311.7]) {
  const x = Math.sin(i * a + k * b) * 43758.5453;
  return x - Math.floor(x);
}
