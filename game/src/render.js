// The renderer: paints `state` onto the canvas. Pure drawing — it never
// changes the world. Every screen (title, play, paused, game over) is drawn
// here, so a screenshot of any screen shows the full game at a glance.

import { COLORS, FIELD, PICKUPS, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

function polygon(ctx, x, y, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rotation + (i / sides) * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawGlow(ctx, x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(canvas.width / FIELD.width, 0, 0, canvas.height / FIELD.height, 0, 0);
  }

  function drawBackground(time) {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Faint grid + a slow pulsing vignette: the arena reads as a place, not a void.
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < FIELD.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 80; y < FIELD.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    const pulse = 0.05 + 0.02 * Math.sin(time * 0.8);
    const edge = ctx.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.75,
    );
    edge.addColorStop(0, 'rgba(80, 60, 255, 0)');
    edge.addColorStop(1, `rgba(80, 60, 255, ${pulse})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Arena border.
    ctx.strokeStyle = 'rgba(120, 140, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, FIELD.width - 8, FIELD.height - 8);
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      const def = PICKUPS[pickup.kind];
      const bob = Math.sin(pickup.age * 4) * 2;
      const blink = pickup.life < 3 ? (Math.sin(pickup.age * 12) > 0 ? 1 : 0.35) : 1;
      ctx.globalAlpha = blink;
      drawGlow(ctx, pickup.x, pickup.y + bob, 30, def.color, 0.5);
      ctx.fillStyle = def.color;
      polygon(ctx, pickup.x, pickup.y + bob, 13, 6, pickup.age);
      ctx.fill();
      ctx.fillStyle = '#07070f';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = pickup.kind === 'heart' ? '+' : pickup.kind === 'rapid' ? '»' : pickup.kind === 'spread' ? '⁂' : '◈';
      ctx.fillText(glyph, pickup.x, pickup.y + bob + 0.5);
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      const flash = enemy.flash > 0;
      const fadeIn = Math.min(1, enemy.spawnAge / 0.35);
      ctx.globalAlpha = fadeIn;
      drawGlow(ctx, enemy.x, enemy.y, enemy.radius * 2.4, enemy.color, 0.35);
      ctx.fillStyle = flash ? '#ffffff' : enemy.color;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5;
      if (enemy.kind === 'chaser') {
        polygon(ctx, enemy.x, enemy.y, enemy.radius, 4, enemy.angle);
        ctx.fill();
        ctx.stroke();
      } else if (enemy.kind === 'shooter') {
        polygon(ctx, enemy.x, enemy.y, enemy.radius, 4, Math.PI / 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#07070f';
        polygon(ctx, enemy.x, enemy.y, enemy.radius * 0.45, 4, Math.PI / 4);
        ctx.fill();
      } else if (enemy.kind === 'splitter') {
        polygon(ctx, enemy.x, enemy.y, enemy.radius, 6, enemy.wobble * 0.4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(7,7,15,0.85)';
        polygon(ctx, enemy.x, enemy.y, enemy.radius * 0.5, 6, -enemy.wobble * 0.4);
        ctx.fill();
      } else {
        // mini: small fast triangle
        polygon(ctx, enemy.x, enemy.y, enemy.radius, 3, enemy.angle);
        ctx.fill();
      }
      // HP bar for tougher enemies.
      if (enemy.maxHp > 30 && enemy.hp < enemy.maxHp) {
        const w = enemy.radius * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w, 4);
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w * (enemy.hp / enemy.maxHp), 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.hp <= 0) return;
    const blink = player.invulnerable > 0 && Math.sin(state.time * 30) > 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    // Dash trail glow.
    if (player.dashTimer > 0) drawGlow(ctx, player.x, player.y, 60, COLORS.player, 0.8);
    drawGlow(ctx, player.x, player.y, 42, COLORS.player, 0.5);
    if (player.shield > 0) {
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 9 + Math.sin(state.time * 5) * 2, 0, TAU);
      ctx.stroke();
    }
    // Ship: a dart pointing at the aim angle.
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Dash cooldown ring under the ship.
    if (player.dashCooldown > 0) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - player.dashCooldown / 2.2));
      ctx.stroke();
    }
  }

  function drawBullets(state) {
    for (const b of state.playerBullets) {
      drawGlow(ctx, b.x, b.y, 12, COLORS.bullet, 0.8);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
    }
    for (const b of state.enemyBullets) {
      drawGlow(ctx, b.x, b.y, 16, COLORS.enemyBullet, 0.7);
      ctx.fillStyle = COLORS.enemyBullet;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff7cc';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.45, 0, TAU);
      ctx.fill();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, fraction, color, back) {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // The HUD is the scoreboard a screenshot reader scans first: HP, wave,
  // score, combo and the power-ups that are running.
  function drawHud(state, best) {
    const player = state.player;
    ctx.textBaseline = 'alphabetic';
    // Top-left: HP.
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.dimText;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('HULL', 24, 34);
    bar(24, 42, 220, 16, player.hp / PLAYER.maxHp, player.hp < 30 ? COLORS.hpLow : COLORS.hp, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(player.hp)} / ${PLAYER.maxHp}`, 252, 56);
    // Dash readiness.
    ctx.fillStyle = COLORS.dimText;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(player.dashCooldown <= 0 ? 'DASH READY  [SPACE]' : 'DASH …', 24, 82);
    if (player.dashCooldown > 0) bar(24, 90, 120, 6, 1 - player.dashCooldown / 2.2, COLORS.player, 'rgba(255,255,255,0.12)');
    // Active power-ups as chips.
    let chipX = 24;
    const chips = [];
    if (player.rapidTimer > 0) chips.push(['RAPID ' + Math.ceil(player.rapidTimer) + 's', PICKUPS.rapid.color]);
    if (player.spreadTimer > 0) chips.push(['SPREAD ' + Math.ceil(player.spreadTimer) + 's', PICKUPS.spread.color]);
    if (player.shield > 0) chips.push(['SHIELD ' + Math.ceil(player.shield) + 's', PICKUPS.shield.color]);
    for (const [label, color] of chips) {
      ctx.font = 'bold 13px system-ui, sans-serif';
      const w = ctx.measureText(label).width + 18;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(chipX, 108, w, 24);
      ctx.strokeStyle = color;
      ctx.strokeRect(chipX + 0.5, 108.5, w - 1, 23);
      ctx.fillStyle = color;
      ctx.fillText(label, chipX + 9, 125);
      chipX += w + 8;
    }
    // Top-centre: wave + enemies left.
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`WAVE ${Math.max(1, state.wave)}`, FIELD.width / 2, 44);
    ctx.fillStyle = COLORS.dimText;
    ctx.font = 'bold 14px system-ui, sans-serif';
    const remaining = state.enemies.length + (state.waveState === 'spawning' ? 1 : 0);
    ctx.fillText(state.waveState === 'break' ? 'NEXT WAVE INCOMING…' : `${state.enemies.length} HOSTILES LEFT`, FIELD.width / 2, 66);
    if (remaining === 0 && state.waveState === 'fighting') ctx.fillText('CLEAR!', FIELD.width / 2, 66);
    // Top-right: score, best, kills, combo.
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}`, FIELD.width - 24, 44);
    ctx.fillStyle = COLORS.dimText;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`BEST ${Math.max(best, state.score).toLocaleString('en-US')}   •   KILLS ${state.kills}`, FIELD.width - 24, 66);
    if (state.combo > 1) {
      ctx.fillStyle = '#ffd60a';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(`COMBO ×${state.combo}`, FIELD.width - 24, 96);
      bar(FIELD.width - 144, 104, 120, 6, state.comboTimer / 2.5, '#ffd60a', 'rgba(255,255,255,0.12)');
    }
    // Bottom hint.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(154, 163, 199, 0.85)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('WASD move  •  MOUSE aim  •  HOLD CLICK fire  •  SPACE dash  •  P pause', FIELD.width / 2, FIELD.height - 16);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10, 10, 24, 0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120, 140, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(7, 7, 15, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    const cx = FIELD.width / 2;
    // Logo.
    ctx.fillStyle = '#22d3ee';
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.fillText('NEON', cx, 218);
    ctx.fillStyle = '#ff2e88';
    ctx.fillText('SWARM', cx, 312);
    ctx.fillStyle = COLORS.dimText;
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('An arena survival shooter — outlast the swarm, chase the combo.', cx, 352);
    // How to play.
    panel(cx - 330, 392, 660, 168);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('HOW TO PLAY', cx, 424);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#c6cbe8';
    ctx.fillText('WASD / arrows — move      Mouse — aim      Hold click — fire', cx, 458);
    ctx.fillText('SPACE — dash through danger (2s cooldown)', cx, 488);
    ctx.fillText('Chain kills for a ×5 combo. Grab drops: heal, rapid fire, spread, shield.', cx, 518);
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('Survive every wave. One hull, no second chances.', cx, 544);
    if (best > 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${best.toLocaleString('en-US')}`, cx, 600);
    }
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('— CLICK OR PRESS ENTER TO START —', cx, 668);
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(7, 7, 15, 0.7)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
    ctx.fillStyle = COLORS.dimText;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Press P or Escape to resume', FIELD.width / 2, FIELD.height / 2 + 34);
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(7, 7, 15, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const cx = FIELD.width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.fillText('GAME OVER', cx, 250);
    ctx.fillStyle = COLORS.dimText;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('The swarm got you this time.', cx, 290);
    panel(cx - 260, 330, 520, 190);
    const rows = [
      ['SCORE', state.score.toLocaleString('en-US')],
      ['BEST', Math.max(best, state.score).toLocaleString('en-US')],
      ['WAVE REACHED', String(Math.max(1, state.wave))],
      ['KILLS', String(state.kills)],
      ['BEST COMBO', `×${Math.max(1, state.bestCombo)}`],
    ];
    ctx.font = 'bold 18px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = 368 + i * 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.dimText;
      ctx.fillText(label, cx - 220, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.text;
      ctx.fillText(value, cx + 220, y);
    });
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('— PRESS R OR CLICK TO PLAY AGAIN —', cx, 580);
    }
  }

  function draw(state, screen, best) {
    resize();
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackground(state.time);
    drawPickups(state);
    drawEnemies(state);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    ctx.restore();
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else drawHud(state, best);
  }

  return { draw, resize };
}
