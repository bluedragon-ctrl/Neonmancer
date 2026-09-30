/**
 * The view of a decoration in the room (entities/deco.js, D117): its look
 * (data-pillar.js, screen.js) in the room's color, facing its way. A screen
 * with a text not read yet shows it (D118).
 */
import { DECO_LOOKS } from '../data/room-data.js';
import { createDataPillar } from './data-pillar.js';
import { createScreen } from './screen.js';

/** How each look is built, from its color, facing and size. */
const LOOKS = {
  data_pillar: ({ color, face, size }) => createDataPillar({ color, face, height: size[1] }),
  screen: ({ color, face }) => createScreen({ color, face }),
};

export class DecoView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/deco.js').Deco} deco
   */
  constructor(game, deco) {
    this.deco = deco;
    const { look, face, color } = deco.object;
    this.group = LOOKS[look]({ color, face, size: DECO_LOOKS[look].size });
    this.group.position.set(...deco.pos);
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    this.group.userData.setWaiting?.(!!this.deco.text && !this.deco.read);
    this.group.userData.update(dt);
  }
}
