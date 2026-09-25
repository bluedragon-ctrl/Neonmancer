/**
 * Full-screen error message shown when the game cannot start, e.g. because
 * the data is invalid. Lists every data problem so they can be fixed in
 * one go.
 */

/**
 * @param {HTMLElement} container
 * @param {Error & { errors?: string[] }} error
 */
export function showErrorScreen(container, error) {
  console.error(error);
  const screen = document.createElement('div');
  screen.className = 'error-screen';

  const title = document.createElement('h1');
  title.textContent = '> SYSTEM ERROR';
  const summary = document.createElement('p');
  summary.textContent = error.message;
  screen.append(title, summary);

  if (error.errors?.length) {
    const list = document.createElement('ul');
    for (const text of error.errors) {
      const item = document.createElement('li');
      item.textContent = text; // text, never HTML
      list.append(item);
    }
    screen.append(list);
  }
  container.replaceChildren(screen);
}
