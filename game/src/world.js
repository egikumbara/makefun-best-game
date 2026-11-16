// The world: everything that moves, collides and scores, advanced in fixed
// 1/60 s steps. It knows nothing about the DOM or the canvas — the renderer
// paints `state`, and the screenshot autopilot drives `step()` directly.

import { COMBO_MAX, COMBO_WINDOW, DROP_CHANCE, ENEMIES, FIELD, PICKUPS, PLAYER, STEP, WAVES } from './config.js';

export const EVENT_HIT = 1; // the player took damage this step
export const EVENT_OVER = 2; // the player died this step
export const EVENT_WAVE = 4; // a new wave started this step
export const EVENT_KILL = 8; // at least one enemy died this step

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const state = freshState();
  let spawnQueue = [];
  let spawnTimer = 0;
  let waveBreakTimer = 0;

  function freshState() {
    return {
      time: 0,
      player: {
        x: FIELD.width / 2,
        y: FIELD.height / 2,
        vx: 0,
        vy: 0,
        hp: PLAYER.maxHp,
        angle: -Math.PI / 2,
        fireTimer: 0,
        dashTimer: 0,
        dashCooldown: 0,
        dashX: 0,
        dashY: 0,
        invulnerable: 0,
        shield: 0,
        rapidTimer: 0,
        spreadTimer: 0,
      },
      enemies: [],
      playerBullets: [],
      enemyBullets: [],
      particles: [],
      pickups: [],
      floaters: [], // floating score popups
      score: 0,
      kills: 0,
      wave: 0,
      combo: 0,
      comboTimer: 0,
      bestCombo: 0,
      waveState: 'break', // 'break' | 'spawning' | 'fighting'
      shake: 0,
    };
  }

  function reset() {
    const fresh = freshState();
    for (const key of Object.keys(fresh)) state[key] = fresh[key];
    spawnQueue = [];
    spawnTimer = 0;
    waveBreakTimer = 2.0;
    state.waveState = 'break';
  }

  // Pick a spawn point on the arena edge, away from the player.
  function spawnPoint() {
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = random.int(0, 4);
      const point =
        edge === 0 ? { x: random.range(60, FIELD.width - 60), y: 56 } :
        edge === 1 ? { x: random.range(60, FIELD.width - 60), y: FIELD.height - 56 } :
        edge === 2 ? { x: 56, y: random.range(60, FIELD.height - 60) } :
          { x: FIELD.width - 56, y: random.range(60, FIELD.height - 60) };
      if (dist2(point, state.player) > 320 * 320) return point;
    }
    return { x: 36, y: 36 };
  }

  function startWave(index) {
    const spec = WAVES[Math.min(index, WAVES.length - 1)];
    const extra = Math.max(0, index - (WAVES.length - 1));
    const count = spec.count + extra * 4;
    const speedScale = 1 + Math.min(0.6, index * 0.06);
    const hpScale = 1 + Math.min(1.0, index * 0.12);
    spawnQueue = [];
    for (let i = 0; i < count; i += 1) {
      spawnQueue.push({ kind: random.weighted(spec.mix), speedScale, hpScale });
    }
    state.wave = index + 1;
    state.waveState = 'spawning';
    spawnTimer = 0.4;
  }

  function spawnEnemy(spec) {
    const def = ENEMIES[spec.kind];
    const point = spawnPoint();
    state.enemies.push({
      kind: spec.kind,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      radius: def.radius,
      hp: Math.round(def.hp * spec.hpScale),
      maxHp: Math.round(def.hp * spec.hpScale),
      speed: def.speed * spec.speedScale * random.range(0.9, 1.1),
      damage: def.damage,
      score: def.score,
      color: def.color,
      angle: random.range(0, TAU),
      fireTimer: random.range(1.2, 2.4),
      wobble: random.range(0, TAU),
      flash: 0,
      spawnAge: 0,
    });
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.range(0, TAU);
      const v = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: random.range(life * 0.5, life),
        maxLife: life,
        size: random.range(size * 0.6, size * 1.4),
        color,
      });
    }
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  function dropPickup(x, y) {
    const kinds = Object.keys(PICKUPS);
    const kind = kinds[random.int(0, kinds.length)];
    state.pickups.push({
      kind, x, y,
      vx: random.range(-30, 30),
      vy: random.range(-30, 30),
      age: 0,
      life: 12,
    });
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.kills += 1;
    // Kill chains build the combo: each kill inside the window raises the
    // multiplier, and the whole chain pays out at the current multiplier.
    if (state.comboTimer > 0) state.combo = Math.min(COMBO_MAX, state.combo + 1);
    else state.combo = 1;
    state.comboTimer = COMBO_WINDOW;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const gained = enemy.score * state.combo;
    state.score += gained;
    addFloater(enemy.x, enemy.y, `+${gained}`, state.combo > 1 ? '#ffd60a' : '#e8eaf6');
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === 'splitter' ? 26 : 16, 260, 0.55, 4);
    burst(enemy.x, enemy.y, '#ffffff', 6, 160, 0.3, 2.5);
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const mini = ENEMIES.mini;
        state.enemies.push({
          kind: 'mini',
          x: enemy.x + (i === 0 ? -14 : 14),
          y: enemy.y,
          vx: 0, vy: 0,
          radius: mini.radius,
          hp: mini.hp, maxHp: mini.hp,
          speed: mini.speed * random.range(0.95, 1.15),
          damage: mini.damage, score: mini.score, color: mini.color,
          angle: random.range(0, TAU),
          fireTimer: 0, wobble: random.range(0, TAU), flash: 0, spawnAge: 0,
        });
      }
    }
    if (random.next() < DROP_CHANCE) dropPickup(enemy.x, enemy.y);
  }

  function damagePlayer(amount, fromX, fromY) {
    const player = state.player;
    if (player.invulnerable > 0 || player.dashTimer > 0) return false;
    if (player.shield > 0) {
      player.shield = 0;
      player.invulnerable = 0.8;
      burst(player.x, player.y, '#b5179e', 18, 240, 0.5, 4);
      addFloater(player.x, player.y - 24, 'SHIELD DOWN', '#e879f9');
      return true;
    }
    player.hp -= amount;
    player.invulnerable = 0.7;
    state.shake = 14;
    burst(player.x, player.y, '#ff4d6d', 14, 220, 0.5, 4);
    const angle = Math.atan2(player.y - fromY, player.x - fromX);
    player.vx += Math.cos(angle) * 160;
    player.vy += Math.sin(angle) * 160;
    return true;
  }

  function fireBullet(angle) {
    const player = state.player;
    state.playerBullets.push({
      x: player.x + Math.cos(angle) * (PLAYER.radius + 6),
      y: player.y + Math.sin(angle) * (PLAYER.radius + 6),
      vx: Math.cos(angle) * PLAYER.bulletSpeed,
      vy: Math.sin(angle) * PLAYER.bulletSpeed,
      radius: PLAYER.bulletRadius,
      damage: PLAYER.bulletDamage,
      life: 1.1,
    });
  }

  // Advance the world one fixed step. `control` is { move:{x,y}, aim:{x,y},
  // firing:boolean, dash:boolean } — the live loop reads it from input, the
  // screenshot autopilot synthesises it. Returns an event bitmask.
  function step(dt, control) {
    const player = state.player;
    let events = 0;
    state.time += dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);

    // --- wave flow -------------------------------------------------------
    if (state.waveState === 'break') {
      waveBreakTimer -= dt;
      if (waveBreakTimer <= 0) {
        startWave(state.wave);
        events |= EVENT_WAVE;
      }
    } else if (state.waveState === 'spawning') {
      spawnTimer -= dt;
      if (spawnQueue.length > 0 && spawnTimer <= 0) {
        spawnEnemy(spawnQueue.shift());
        spawnTimer = 0.28;
      }
      if (spawnQueue.length === 0) state.waveState = 'fighting';
    } else if (state.waveState === 'fighting' && state.enemies.length === 0) {
      state.waveState = 'break';
      waveBreakTimer = 3.0;
      state.score += 250 * state.wave;
      addFloater(FIELD.width / 2, FIELD.height / 2 - 60, `WAVE ${state.wave} CLEAR  +${250 * state.wave}`, '#ffd60a');
    }

    // --- player ----------------------------------------------------------
    player.fireTimer -= dt;
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.shield = Math.max(0, player.shield - dt);
    player.rapidTimer = Math.max(0, player.rapidTimer - dt);
    player.spreadTimer = Math.max(0, player.spreadTimer - dt);

    if (control.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      const mx = control.move.x;
      const my = control.move.y;
      const len = Math.hypot(mx, my);
      const dx = len > 0 ? mx / len : Math.cos(player.angle);
      const dy = len > 0 ? my / len : Math.sin(player.angle);
      player.dashX = dx;
      player.dashY = dy;
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      burst(player.x, player.y, PLAYER.player, 10, 180, 0.35, 3.5);
    }

    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
    } else {
      const accel = 2600;
      player.vx += control.move.x * accel * dt;
      player.vy += control.move.y * accel * dt;
      // Strong damping keeps the ship tight and stop-on-a-dime.
      const damp = Math.exp(-8 * dt);
      player.vx *= damp;
      player.vy *= damp;
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > PLAYER.speed) {
        player.vx = (player.vx / speed) * PLAYER.speed;
        player.vy = (player.vy / speed) * PLAYER.speed;
      }
    }
    player.x = clamp(player.x + player.vx * dt, PLAYER.radius, FIELD.width - PLAYER.radius);
    player.y = clamp(player.y + player.vy * dt, PLAYER.radius, FIELD.height - PLAYER.radius);
    player.angle = Math.atan2(control.aim.y - player.y, control.aim.x - player.x);

    if (control.firing && player.fireTimer <= 0) {
      const interval = player.rapidTimer > 0 ? PLAYER.fireInterval * 0.62 : PLAYER.fireInterval;
      player.fireTimer = interval;
      if (player.spreadTimer > 0) {
        fireBullet(player.angle - 0.16);
        fireBullet(player.angle);
        fireBullet(player.angle + 0.16);
      } else {
        fireBullet(player.angle);
      }
      burst(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20, '#a5f3fc', 2, 120, 0.15, 2);
    }

    // --- enemies ---------------------------------------------------------
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = state.enemies[i];
      enemy.spawnAge += dt;
      enemy.flash = Math.max(0, enemy.flash - dt * 6);
      enemy.wobble += dt * 3;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      // A slow sideways wobble makes chasers weave instead of beelining.
      const wob = Math.sin(enemy.wobble) * 0.45;
      const px = -uy * wob;
      const py = ux * wob;

      if (enemy.kind === 'shooter') {
        // Shooters hold a ring around the player and fire aimed orbs.
        const want = 260;
        const toward = d > want + 30 ? 1 : d < want - 30 ? -0.7 : 0;
        enemy.vx = ux * enemy.speed * toward + px * enemy.speed * 0.4;
        enemy.vy = uy * enemy.speed * toward + py * enemy.speed * 0.4;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && d < 560 && enemy.spawnAge > 0.6) {
          enemy.fireTimer = 2.1;
          const aim = Math.atan2(dy, dx);
          state.enemyBullets.push({
            x: enemy.x + Math.cos(aim) * (enemy.radius + 4),
            y: enemy.y + Math.sin(aim) * (enemy.radius + 4),
            vx: Math.cos(aim) * 210,
            vy: Math.sin(aim) * 210,
            radius: 7,
            damage: ENEMIES.shooter.damage,
            life: 4,
          });
          burst(enemy.x, enemy.y, '#ffb703', 4, 100, 0.2, 2.5);
        }
      } else {
        enemy.vx = ux * enemy.speed + px * enemy.speed * 0.5;
        enemy.vy = uy * enemy.speed + py * enemy.speed * 0.5;
      }
      enemy.x = clamp(enemy.x + enemy.vx * dt, enemy.radius, FIELD.width - enemy.radius);
      enemy.y = clamp(enemy.y + enemy.vy * dt, enemy.radius, FIELD.height - enemy.radius);
      enemy.angle = Math.atan2(dy, dx);

      // Touching the player hurts (once per hit, then brief invulnerability).
      if (d < enemy.radius + PLAYER.radius - 2) {
        if (damagePlayer(enemy.damage, enemy.x, enemy.y)) events |= EVENT_HIT;
        // The enemy bounces off so it cannot drain the player in one frame.
        enemy.x -= ux * 26;
        enemy.y -= uy * 26;
      }
    }

    // --- player bullets ---------------------------------------------------
    for (let i = state.playerBullets.length - 1; i >= 0; i -= 1) {
      const b = state.playerBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = state.enemies[j];
          const rr = b.radius + enemy.radius;
          if (dist2(b, enemy) < rr * rr) {
            enemy.hp -= b.damage;
            enemy.flash = 1;
            burst(b.x, b.y, '#ffffff', 3, 140, 0.2, 2);
            dead = true;
            if (enemy.hp <= 0) {
              killEnemy(enemy, j);
              events |= EVENT_KILL;
            }
            break;
          }
        }
      }
      if (dead) state.playerBullets.splice(i, 1);
    }

    // --- enemy bullets -----------------------------------------------------
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        const rr = b.radius + PLAYER.radius;
        if (dist2(b, player) < rr * rr) {
          if (damagePlayer(b.damage, b.x - b.vx * 0.05, b.y - b.vy * 0.05)) events |= EVENT_HIT;
          dead = true;
        }
      }
      if (dead) state.enemyBullets.splice(i, 1);
    }

    // --- pickups ------------------------------------------------------------
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.age += dt;
      pickup.life -= dt;
      const d = Math.hypot(player.x - pickup.x, player.y - pickup.y) || 1;
      if (d < PLAYER.pickupRadius) {
        // Pickups drift toward the player when close — collecting feels good.
        pickup.vx += ((player.x - pickup.x) / d) * 900 * dt;
        pickup.vy += ((player.y - pickup.y) / d) * 900 * dt;
      } else {
        pickup.vx *= Math.exp(-2 * dt);
        pickup.vy *= Math.exp(-2 * dt);
      }
      pickup.x = clamp(pickup.x + pickup.vx * dt, 14, FIELD.width - 14);
      pickup.y = clamp(pickup.y + pickup.vy * dt, 14, FIELD.height - 14);
      if (pickup.life <= 0) {
        state.pickups.splice(i, 1);
        continue;
      }
      if (d < PLAYER.radius + 16) {
        state.pickups.splice(i, 1);
        if (pickup.kind === 'heart') {
          player.hp = Math.min(PLAYER.maxHp, player.hp + 25);
          addFloater(player.x, player.y - 26, '+25 HP', PICKUPS.heart.color);
        } else if (pickup.kind === 'rapid') {
          player.rapidTimer = 8;
          addFloater(player.x, player.y - 26, 'RAPID FIRE!', PICKUPS.rapid.color);
        } else if (pickup.kind === 'spread') {
          player.spreadTimer = 8;
          addFloater(player.x, player.y - 26, 'SPREAD SHOT!', PICKUPS.spread.color);
        } else if (pickup.kind === 'shield') {
          player.shield = 10;
          addFloater(player.x, player.y - 26, 'SHIELD UP', PICKUPS.shield.color);
        }
        burst(player.x, player.y, PICKUPS[pickup.kind].color, 10, 160, 0.4, 3);
      }
    }

    // --- particles & floaters ----------------------------------------------
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-3 * dt);
      p.vy *= Math.exp(-3 * dt);
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    // --- death ---------------------------------------------------------------
    if (player.hp <= 0) {
      player.hp = 0;
      burst(player.x, player.y, PLAYER.player, 40, 380, 0.9, 5);
      burst(player.x, player.y, '#ffffff', 20, 240, 0.6, 3);
      state.shake = 20;
      events |= EVENT_OVER;
    }
    return events;
  }

  return { state, reset, step };
}
