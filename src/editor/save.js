/**
 * Where edits go (D56, D57): in the dev server, straight to data/ through
 * the data plugin (tools/room-save.js), which checks them first; in a
 * build, downloads of the JSON files.
 */

/** URL the dev server takes edits at (tools/vite-plugin-data.js). */
export const SAVE_URL = '/__editor/save';

/** Vite custom event the dev server sends after a save, with the `files` written. */
export const DATA_SAVED_EVENT = 'neonmancer:data-saved';

/**
 * Send edited files to the dev server to be checked and written.
 * @param {{ rooms?: object[], world?: object, defs?: object, lore?: object, positions?: Record<string, number[]>, remove?: string[] }} edits whole room files,
 *   and world.json, defs.json and lore.json if they changed; from the world map tool also map positions of moved rooms and ids of removed rooms
 * @returns {Promise<{ ok: boolean, errors: string[], files: string[] }>}
 */
export async function saveFiles(edits) {
  try {
    const response = await fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, errors: [`could not reach the dev server (${err.message})`], files: [] };
  }
}

/**
 * Read data files as they are on disk now (dev server): what another page
 * saved.
 * @param {string[]} paths relative to data/, e.g. "defs.json"
 * @returns {Promise<Record<string, any>>} the parsed files by path; one that can't be read is left out
 */
export async function readDataFiles(paths) {
  const files = {};
  await Promise.all(
    paths.map(async (path) => {
      try {
        const response = await fetch(new URL(`../../data/${path}`, import.meta.url), { cache: 'no-store' });
        if (response.ok) files[path] = await response.json();
      } catch {
        // Removed or unreadable: nothing to take.
      }
    }),
  );
  return files;
}

/**
 * Download a file (the deployed build has nowhere to save it).
 * @param {string} name file name, e.g. `boot_sector.json`
 * @param {string} text file contents
 */
export function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
