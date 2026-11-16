// The screenshot scenes behind ?shot=start|play|surge|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame. The autopilot kites away
// from the nearest threat, chases pickups, and always fires at the nearest
// enemy; the end scene's pilot never dashes and never retreats, so the swarm
// catches it — exactly what a hurried player looks like.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 26;
const SURGE_SECONDS = 50;
const END_LIMIT_SECONDS = 600;

/** Nearest enemy (or null) and its distance. */
function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    const d = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = enemy;
    }
  }
  return best === null ? null : { enemy: best, d: bestD };
}

function nearestPickup(state) {
  let best = null;
  let bestD = Infinity;
  for (const pickup of state.pickups) {
    const d = Math.hypot(pickup.x - state.player.x, pickup.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = pickup;
    }
  }
  return best === null ? null : { pickup: best, d: bestD };
}

function nearestBullet(state) {
  let bestD = Infinity;
  for (const b of state.enemyBullets) {
    const d = Math.hypot(b.x - state.player.x, b.y - state.player.y);
    if (d < bestD) bestD = d;
  }
  return bestD;
}

/**
 * The autopilot's control for one step. `cautious` pilots kite and dash;
 * a reckless pilot stands its ground and dies.
 */
function autopilot(state, cautious) {
  const player = state.player;
  const threat = nearestEnemy(state);
  const loot = nearestPickup(state);
  const bulletD = nearestBullet(state);

  let mx = 0;
  let my = 0;
  if (cautious && threat !== null) {
    const dx = player.x - threat.enemy.x;
    const dy = player.y - threat.enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    // Inside the danger ring, run away; outside it, strafe toward the loot.
    if (threat.d < 190 || bulletD < 130) {
      mx = dx / d;
      my = dy / d;
    } else if (loot !== null && loot.d < 320) {
      mx = (loot.pickup.x - player.x) / loot.d;
      my = (loot.pickup.y - player.y) / loot.d;
    } else {
      // Orbit the arena centre so the frame stays busy.
      const cx = FIELD.width / 2 - player.x;
      const cy = FIELD.height / 2 - player.y;
      const cd = Math.hypot(cx, cy) || 1;
      mx = -cy / cd * 0.7 + cx / cd * 0.3;
      my = cx / cd * 0.7 + cy / cd * 0.3;
    }
    // Keep off the walls.
    if (player.x < 90) mx += 0.6;
    if (player.x > FIELD.width - 90) mx -= 0.6;
    if (player.y < 90) my += 0.6;
    if (player.y > FIELD.height - 90) my -= 0.6;
    // Mild pull toward the centre keeps the action framed mid-arena.
    const cx = FIELD.width / 2 - player.x;
    const cy = FIELD.height / 2 - player.y;
    const cd = Math.hypot(cx, cy) || 1;
    mx += (cx / cd) * 0.25;
    my += (cy / cd) * 0.25;
  }
  const len = Math.hypot(mx, my);
  const move = len > 0 ? { x: mx / len, y: my / len } : { x: 0, y: 0 };
  const aim = threat !== null
    ? { x: threat.enemy.x, y: threat.enemy.y }
    : { x: player.x + Math.cos(player.angle), y: player.y + Math.sin(player.angle) };
  return {
    move,
    aim,
    firing: true,
    dash: cautious && threat !== null && threat.d < 130 && player.dashCooldown <= 0,
  };
}

/**
 * Play the real simulation forward until the frame is busy — at least
 * `minEnemies` hostiles alive after `minTime` seconds — or the time cap.
 * The rule is fixed and seeded, so the same seed always stops on the same
 * frame; it only chooses WHEN to take the photo, mid-wave, instead of
 * catching the tail of a cleared wave.
 */
function simulateBusy(world, state, capSeconds, minTime, minEnemies, cautious) {
  for (let i = 0; i < capSeconds / STEP; i += 1) {
    const events = world.step(STEP, autopilot(state, cautious));
    if (events & EVENT_OVER) return true;
    if (state.time >= minTime && state.enemies.length >= minEnemies) return false;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Unknown names stage the title.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'surge' && name !== 'end') {
    // Title: let the first wave trickle in behind the title panel so the
    // backdrop is alive, then freeze on the title screen.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: state.player.x, y: state.player.y - 100 }, firing: false, dash: false });
    }
    return { screen: SCREEN_TITLE, best: 1250 };
  }
  if (name === 'play') {
    simulateBusy(world, state, PLAY_SECONDS, 9, 6, true);
  } else if (name === 'surge') {
    simulateBusy(world, state, SURGE_SECONDS, 20, 8, true);
  } else {
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      const events = world.step(STEP, autopilot(state, false));
      if (events & EVENT_OVER) break;
    }
  }
  const over = state.player.hp <= 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: Math.max(1250, state.score) };
}
