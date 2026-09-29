/**
 * The boot key (D101): the 64 key fragments are the modules of one 8×8
 * code, QR-like, with finder squares in three corners. Fragment slot n is
 * the module in row n / 8, column n % 8; a found fragment shows its module
 * in the HUD, so the code fills in as he collects them, and the core
 * reads the whole key to reboot the Grid. Each module is dark (drawn,
 * filled) or light (an empty cell). Plain data and logic, no browser.
 */

/** The code, row by row from the top: # a dark module, . a light one. */
export const BOOT_KEY = [
  '###.####', //
  '#.#..#.#',
  '###.####',
  '..#.#...',
  '#.##..#.',
  '###.#.##',
  '#.#.##..',
  '###.#..#',
];

/** Modules per side. */
export const BOOT_KEY_SIZE = BOOT_KEY.length;

/**
 * The module of fragment `slot`: its column and row, and whether it is dark.
 * @param {number} slot 0–63
 * @returns {{ col: number, row: number, dark: boolean }}
 */
export function keyModule(slot) {
  const row = Math.floor(slot / BOOT_KEY_SIZE);
  const col = slot % BOOT_KEY_SIZE;
  return { col, row, dark: BOOT_KEY[row][col] === '#' };
}
