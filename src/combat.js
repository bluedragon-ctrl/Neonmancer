/**
 * Fighting, one tick of it at a time: bolts in flight, enemies' charged
 * attacks, the wizard bouncing off, touching and burning enemies, and
 * enemies taking hits. Functions of the Game (game.js), which calls them in
 * its fixed update order; they change its state and report through
 * game.emit().
 */
import { DT } from './core/loop.js';
import { boxCenter, castRay, cellsAlong, direction, lineOfSight, reach } from './ai/sight.js';
import { Bolt, boltDirections } from './entities/bolt.js';
import { Enemy } from './entities/enemy.js';
import { cellBox, overlaps, overlapsBox, touchesBox } from './physics/collision.js';

/**
 * How far below a bouncy enemy's top his feet may have been last tick and
 * still bounce (it may have hopped up a little into him).
 */
const BOUNCE_REACH = 0.05;

/**
 * Bolts fly on. A bounce is reported ('ricochet', with where and the way
 * it came in, for sparks). One that stops is reported ('zap', for its
 * sparks) and gone. If it stopped at the wizard (an enemy's shot), he is
 * hurt, unless his ring absorbed it ('block', D84) or, with the Mirror, sent
 * it back ('reflect', D95); at an enemy, that takes its damage (hitEnemy()),
 * or a Pause bolt freezes it (pauseEnemy()). A room object only minds
 * the wizard's Zap: a destructible one 'hit' or 'break', a target
 * 'switch' (others shrug it off).
 * @param {import('./game.js').Game} game
 */
export function updateBolts(game) {
  const { player } = game;
  for (const bolt of game.bolts) {
    const stopped = bolt.update(game);
    for (const { pos, dir } of bolt.rebounds) game.emit('ricochet', { bolt, pos, dir });
    if (!stopped) continue;
    const { target, owner } = bolt;
    if (target === player && player.shield?.mirror) {
      reflect(game, bolt);
      continue;
    }
    game.emit('zap', { bolt });
    if (target === player) {
      if (player.shield) block(game, { enemy: owner, bolt });
      else game.hurt(bolt.damage, { enemy: owner });
      continue;
    }
    if (target instanceof Enemy) {
      if (bolt.freeze) pauseEnemy(game, target, bolt.freeze);
      else hitEnemy(game, target, bolt.damage, owner ? 'bolt' : 'zap');
      continue;
    }
    if (owner || bolt.freeze) continue;
    const event = target?.hit?.(bolt.damage, 'zap');
    if (!event) continue;
    game.emit(event, { object: target });
    // Whatever stood on a broken crate falls from the next tick.
    if (event === 'break') game.refreshBodies();
  }
  if (game.bolts.some((bolt) => bolt.stopped)) game.bolts = game.bolts.filter((bolt) => !bolt.stopped);
}

/**
 * An enemy takes a hit, from the wizard's spell or another enemy's
 * discharge or bolt: 'hit' or, with its last integrity, 'pop' (then
 * Game.refreshBodies()). Any hit that leaves it hostile alarms it (D80, D81):
 * the wizard gets the blame, so it turns to him ('alert').
 * @param {import('./game.js').Game} game
 * @param {Enemy} enemy
 * @param {number} damage
 * @param {'zap'|'discharge'|'bolt'|'firewall'|'blink'} cause
 */
export function hitEnemy(game, enemy, damage, cause) {
  const event = enemy.hit(damage, cause);
  if (!event) return;
  game.emit(event, { enemy });
  if (event === 'pop') game.refreshBodies();
  else if (enemy.alarm(game.player)) game.emit('alert', { enemy });
}

/**
 * A Pause bolt hits an enemy (D85): it freezes ('freeze') and turns
 * solid, but not for the wizard while he is inside it (Enemy.passable,
 * updateFrozen()). One that can't be paused shrugs it off; that still
 * counts as a hit, so it is alarmed (D81) like any enemy left unfrozen.
 * @param {import('./game.js').Game} game
 * @param {Enemy} enemy
 * @param {number} ticks
 */
export function pauseEnemy(game, enemy, ticks) {
  const { player } = game;
  const event = enemy.freeze(ticks);
  if (!event) {
    if (enemy.alarm(player)) game.emit('alert', { enemy });
    return;
  }
  enemy.passable = !player.dead && overlapsBox(player.box(), enemy.box());
  game.emit(event, { enemy });
  game.refreshBodies();
}

/**
 * A frozen enemy the wizard was inside turns solid for him once he has
 * stepped out of it (D85).
 * @param {import('./game.js').Game} game
 */
export function updateFrozen(game) {
  const { player } = game;
  const box = player.box();
  for (const enemy of game.liveEnemies) {
    if (!enemy.passable || (!player.dead && overlapsBox(box, enemy.box()))) continue;
    enemy.passable = false;
    game.refreshBodies();
  }
}

/**
 * Enemies' charged attacks (D78, D80): one starting to charge ('charge')
 * takes aim (an arc), one charged fires (discharge()).
 * @param {import('./game.js').Game} game
 */
export function updateAttacks(game) {
  for (const enemy of game.enemies) {
    const event = enemy.updateAttack(game);
    if (!event) continue;
    if (event === 'charge') aimDischarge(game, enemy);
    game.emit(event, { enemy });
    if (event === 'discharge') discharge(game, enemy);
  }
}

/**
 * An arc takes aim as it starts charging: at the wizard's middle, as far
 * as its range or the first block or object in the way (the aim line).
 * @param {import('./game.js').Game} game
 * @param {Enemy} enemy
 */
function aimDischarge(game, enemy) {
  if (enemy.data.attack !== 'arc') return;
  const from = enemy.middle();
  const dir = direction(from, boxCenter(game.player.box()));
  const { point } = castRay(from, dir, enemy.data.attackRange, game.grid, game.sightBlockers);
  enemy.aim = { dir, end: point };
}

/**
 * A charged attack fires (D78, D80, D81). Bolts fly off at the wizard's
 * middle as he is now, or four ways (boltDirections(); updateBolts()
 * resolves them). A burst hits every body within its range that it
 * could see: the wizard and other enemies. An arc flies along its aim
 * until a block or an object stops it (unharmed) or its range runs out,
 * and hits every body in the squares it passes through: the wizard and
 * other enemies.
 * @param {import('./game.js').Game} game
 * @param {Enemy} enemy
 */
function discharge(game, enemy) {
  const { player } = game;
  const { attack, attackRange } = enemy.data;
  const from = enemy.middle();
  if (attack === 'bolt') {
    for (const dir of boltDirections(enemy.data, from, boxCenter(player.box()), enemy.facing)) game.bolts.push(Bolt.shoot(enemy, dir));
    return;
  }
  let hits;
  if (attack === 'arc') {
    const { dir } = enemy.aim;
    const { point, distance } = castRay(from, dir, attackRange, game.grid, game.sightBlockers);
    enemy.boltEnd = point;
    const path = cellsAlong(from, dir, distance).map(cellBox);
    hits = (box) => path.some((cell) => overlapsBox(box, cell));
  } else {
    hits = (box) => reach(from, box) <= attackRange && lineOfSight(from, boxCenter(box), game.grid, game.sightBlockers);
  }
  const targets = [...(player.dead ? [] : [player]), ...game.liveEnemies.filter((other) => other !== enemy)];
  for (const body of targets) if (hits(body.box())) strike(game, body, enemy);
}

/**
 * A discharge from `enemy` hits the wizard (hurt; his Shield or Firewall
 * blocks it: 'block', D84) or another enemy (hitEnemy()).
 * @param {import('./game.js').Game} game
 * @param {import('./entities/player.js').Player|Enemy} body
 * @param {Enemy} enemy
 */
function strike(game, body, enemy) {
  const { damage } = enemy.data;
  if (body === game.player) {
    if (game.player.shield) return block(game, { enemy });
    return game.hurt(damage, { enemy });
  }
  hitEnemy(game, body, damage, 'discharge');
}

/**
 * The Mirror sends a shot back (D95): the ring flares as when it blocks,
 * sparks fly where it glanced off ('ricochet') and the bolt flies back
 * as his ('reflect').
 * @param {import('./game.js').Game} game
 * @param {Bolt} bolt
 */
function reflect(game, bolt) {
  const { shield } = game.player;
  const enemy = bolt.owner;
  shield.blockedAt = shield.tick;
  game.emit('ricochet', { bolt, pos: [...bolt.pos], dir: [...bolt.dir] });
  bolt.reflect();
  game.emit('reflect', { bolt, enemy });
}

/**
 * His Shield or Firewall blocked an attack (D84): it flares (its
 * `blockedAt` tick, for the view) and 'block' is reported.
 * @param {import('./game.js').Game} game
 * @param {{ enemy: Enemy, bolt?: Bolt }} details the attacker, and the bolt it absorbed
 */
function block(game, details) {
  const { shield } = game.player;
  shield.blockedAt = shield.tick;
  game.emit('block', details);
}

/**
 * Falling onto the top of a bouncy enemy (not a frozen one, D85) bounces the wizard up (D48),
 * harmlessly: his feet were above its top last tick and are at or below
 * it now (on it, if it is solid), over its footprint.
 * @param {import('./game.js').Game} game
 * @returns {Enemy|null} the enemy he bounced off
 */
export function bounceOffEnemies(game) {
  const { player } = game;
  if (player.dead || player.pos[1] >= player.prev[1]) return null;
  const [px, , pz] = player.box();
  for (const enemy of game.liveEnemies) {
    if (!enemy.bouncy) continue;
    const [bx, by, bz] = enemy.box();
    const top = by[1];
    if (player.prev[1] >= top - BOUNCE_REACH && player.pos[1] <= top + 1e-6 && overlaps(px, bx) && overlaps(pz, bz)) {
      player.bounce(top);
      enemy.bounced = 0;
      game.emit('bounce', { enemy });
      return enemy;
    }
  }
  return null;
}

/**
 * Touching a hostile enemy with a touch attack hurts the wizard (D43):
 * overlapping it, or leaning on or standing on a solid one (the hazard
 * rule, D44). Not the enemy he just bounced off, and nothing while his
 * Firewall is up (D84).
 * @param {import('./game.js').Game} game
 * @param {Enemy|null} bounced
 */
export function touchEnemies(game, bounced) {
  const { player } = game;
  if (player.dead || player.shield?.spell === 'firewall') return;
  const box = player.box();
  for (const enemy of game.liveEnemies) {
    if (!enemy.hurtsOnContact || enemy === bounced) continue;
    if (touchesBox(box, enemy.box())) {
      game.hurt(enemy.data.damage, { enemy });
      return;
    }
  }
}

/**
 * Firewall burns every live enemy touching its ring (D84): a hit of its
 * damage ('firewall'), then again every burnInterval while it stays.
 * @param {import('./game.js').Game} game
 */
export function burnEnemies(game) {
  const { player } = game;
  const { shield } = player;
  if (player.dead || shield?.spell !== 'firewall') return;
  const { damage, burnInterval } = game.content.spells.firewall;
  const box = player.shieldBox();
  for (const [enemy, ticks] of shield.burns) {
    if (ticks > 1) shield.burns.set(enemy, ticks - 1);
    else shield.burns.delete(enemy);
  }
  for (const enemy of game.liveEnemies) {
    if (shield.burns.has(enemy) || !touchesBox(box, enemy.box())) continue;
    shield.burns.set(enemy, Math.round(burnInterval / DT));
    hitEnemy(game, enemy, damage, 'firewall');
  }
}
