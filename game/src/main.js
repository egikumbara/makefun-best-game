// NEON SWARM — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between four
// screens: title, play, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|surge|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_OVER } from './world.js';
import { ACTION_DASH, ACTION_PAUSE, ACTION_RESTART, ACTION_START, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. Wave 1. ${world.state.player.hp} hull.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function frame(now) {
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const action = input.action();

    if (screen === SCREEN_TITLE) {
      if (action === ACTION_START) startGame();
      // The title drifts: enemies from the first wave wander behind the panel.
      // The player is a ghost here — no damage, no death behind the title.
      world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, firing: false, dash: false });
      world.state.player.hp = 100;
      world.state.enemyBullets.length = 0;
    } else if (screen === SCREEN_PLAY) {
      if (action === ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const control = {
            move: input.move(),
            aim: input.aim(),
            firing: input.firing(),
            dash: action === ACTION_DASH,
          };
          const events = world.step(STEP, control);
          if (events & EVENT_HIT) announce(`Hit! Hull ${Math.ceil(world.state.player.hp)}.`);
          if (events & EVENT_OVER) {
            endGame();
            break;
          }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (action === ACTION_PAUSE || action === ACTION_START) {
        screen = SCREEN_PLAY;
        last = performance.now();
        announce('Resumed.');
      }
    } else if (screen === SCREEN_OVER) {
      if (action === ACTION_RESTART || action === ACTION_START) startGame();
    }

    input.clearPressed();
    renderer.draw(world.state, screen, best);
    requestAnimationFrame(frame);
  }

  renderer.draw(world.state, screen, best);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
