/**
 * Where an edited room goes (D56): in the dev server, straight to
 * data/rooms/<id>.json through the data plugin (tools/room-save.js), which
 * checks it first; in a build, a download of the JSON file.
 */

/** URL the dev server takes rooms at (tools/vite-plugin-data.js). */
export const SAVE_ROOM_URL = '/__editor/save-room';

/**
 * Send a room to the dev server to be checked and written.
 * @param {object} room room data
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
export async function saveRoomFile(room) {
  try {
    const response = await fetch(SAVE_ROOM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, errors: [`could not reach the dev server (${err.message})`] };
  }
}

/**
 * Download a room file (the deployed build has nowhere to save it).
 * @param {string} id room id, the file name
 * @param {string} text file contents
 */
export function downloadRoomFile(id, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `${id}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
