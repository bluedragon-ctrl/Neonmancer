// Entry point. For now: title screen plus a live readout of the loop and
// input systems. The renderer replaces the title in the next Phase 1 step;
// the readout moves into debug mode later.
import { GAME_VERSION } from './core/version.js';
import { FixedLoop } from './core/loop.js';
import { Input } from './core/input.js';

const app = document.getElementById('app');
app.innerHTML = `
  <div class="title">
    <h1>NEONMANCER</h1>
    <p>&gt; BOOTING THE GRID... v${GAME_VERSION}</p>
    <pre class="readout"></pre>
  </div>
`;
const readout = app.querySelector('.readout');

const input = new Input();
input.attach(window);

// Rates measured over the last second.
let ticksThisSecond = 0;
let framesThisSecond = 0;
let secondStart = performance.now();
let tps = 0;
let fps = 0;

function update() {
  input.sample();
  ticksThisSecond++;
}

function render(alpha) {
  framesThisSecond++;
  const now = performance.now();
  if (now - secondStart >= 1000) {
    tps = ticksThisSecond;
    fps = framesThisSecond;
    ticksThisSecond = framesThisSecond = 0;
    secondStart = now;
  }

  const actions = input.activeActions().join(' ') || '-';
  readout.textContent =
    `> TICK    ${loop.tick}\n` +
    `> TICK/S  ${tps}   FPS ${fps}   ALPHA ${alpha.toFixed(2)}\n` +
    `> ACTIONS ${actions}`;
}

const loop = new FixedLoop({ update, render });
loop.start();
