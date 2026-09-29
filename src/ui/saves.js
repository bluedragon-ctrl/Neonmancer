/**
 * Where access keys go in the browser (CLAUDE.md §8, D105): the URL hash
 * (`#KEY`, written with history.replaceState: no reload, no history
 * entry), localStorage (the last save, for Continue on the title) and the
 * clipboard. Every storage call is wrapped: blocked storage only means
 * the key lasts for this visit.
 */

/** localStorage key of the last save's access key (settings are apart, ui/settings.js). */
export const SAVE_STORAGE_KEY = 'neonmancer.save';

/** The last save's key, or null. @param {Storage} [storage] */
export function storedKey(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(SAVE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Keep a save's key; a blocked storage is ignored. @param {string} key @param {Storage} [storage] */
export function storeKey(key, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SAVE_STORAGE_KEY, key);
  } catch {
    // Private mode or blocked storage: the URL and the copied key still hold it.
  }
}

/** The key in a URL hash (`#KEY`), or null when there is none. @param {string} hash */
export function hashKey(hash) {
  let text = String(hash).replace(/^#/, '');
  try {
    text = decodeURIComponent(text);
  } catch {
    // A stray % : read it as it is (the key check refuses it).
  }
  return text.trim() || null;
}

/**
 * The page's address with the key as its hash: a link that loads it.
 * @param {string} key
 * @param {string} [href] the page's address; the current one by default
 */
export function keyLink(key, href = globalThis.location?.href ?? '') {
  return `${href.split('#')[0]}#${key}`;
}

/** Put the key in the address bar, replacing the page's history entry. @param {string} key */
export function writeHash(key) {
  try {
    history.replaceState(history.state, '', `#${key}`);
  } catch {
    // Some embedded pages refuse it; the key is still in localStorage.
  }
}

/**
 * Copy text to the clipboard: the Clipboard API, or a hidden text field
 * and the old copy command where that is refused.
 * @param {string} text
 * @returns {Promise<boolean>} whether it was copied
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    field.remove();
    return copied;
  }
}
