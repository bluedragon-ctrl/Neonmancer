// Entry point. For now it only shows a placeholder title screen;
// the game loop and renderer arrive in the next Phase 1 steps.
import { GAME_VERSION } from './core/version.js';

const app = document.getElementById('app');
app.innerHTML = `
  <div class="title">
    <h1>NEONMANCER</h1>
    <p>&gt; BOOTING THE GRID... v${GAME_VERSION}</p>
  </div>
`;
