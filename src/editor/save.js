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
 * @param {{ rooms?: object[], world?: object, defs?: object, positions?: Record<string, number[]> }} edits whole room files, and world.json and
 *   defs.json if they changed; or map positions of moved rooms (the world map tool)
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
