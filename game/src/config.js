// NEON SWARM — arena survival shooter. All tuning lives here so the world,
// the renderer and the screenshot autopilot agree on one set of numbers.

// Logical arena (the canvas is scaled to the window; the game always plays
// on this field, so screenshots and real play look identical).
export const FIELD = { width: 1280, height: 800 };

// Fixed simulation step (seconds). The loop feeds the world 1/60 s slices.
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 300,
  maxHp: 100,
  fireInterval: 0.14, // seconds between shots
  bulletSpeed: 640,
  bulletRadius: 5,
  bulletDamage: 25,
  dashSpeed: 900,
  dashTime: 0.22, // seconds of dash
  dashCooldown: 2.2, // seconds between dashes
  pickupRadius: 110, // pickups drift toward the player inside this radius
};

export const ENEMIES = {
  chaser: { radius: 16, hp: 30, speed: 115, damage: 12, score: 100, color: '#ff2e88' },
  shooter: { radius: 16, hp: 40, speed: 80, damage: 10, score: 150, color: '#ff9f1c' },
  splitter: { radius: 22, hp: 70, speed: 65, damage: 16, score: 200, color: '#2ee66b' },
  mini: { radius: 10, hp: 15, speed: 185, damage: 8, score: 50, color: '#7dff5e' },
};

// What each wave throws at the player. `mix` lists enemy kinds with weights;
// later waves add shooters, then splitters, then faster, tougher enemies.
export const WAVES = [
  { count: 12, mix: [['chaser', 1]] },
  { count: 16, mix: [['chaser', 3], ['shooter', 1]] },
  { count: 20, mix: [['chaser', 3], ['shooter', 2], ['splitter', 1]] },
  { count: 24, mix: [['chaser', 3], ['shooter', 2], ['splitter', 2]] },
  { count: 28, mix: [['chaser', 2], ['shooter', 2], ['splitter', 2], ['mini', 1]] },
];

export const PICKUPS = {
  heart: { color: '#ff4d6d', label: '+25 HP' },
  rapid: { color: '#ffd60a', label: 'RAPID FIRE' },
  spread: { color: '#4cc9f0', label: 'SPREAD SHOT' },
  shield: { color: '#b5179e', label: 'SHIELD' },
};

export const COMBO_WINDOW = 2.5; // seconds a kill chain stays alive
export const COMBO_MAX = 5; // x5 is the highest multiplier
export const DROP_CHANCE = 0.22; // chance a kill drops a pickup

export const BEST_KEY = 'neon-swarm-best';

// Colours for the neon-on-dark look.
export const COLORS = {
  background: '#07070f',
  grid: 'rgba(120, 140, 255, 0.07)',
  player: '#22d3ee',
  playerCore: '#e0faff',
  bullet: '#a5f3fc',
  enemyBullet: '#ffb703',
  text: '#e8eaf6',
  dimText: '#9aa3c7',
  hp: '#22d3ee',
  hpLow: '#ff4d6d',
};
