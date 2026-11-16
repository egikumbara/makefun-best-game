// Keyboard + mouse, read fresh every frame. Movement keys are WASD or arrows;
// Space dashes; P or Escape pauses; Enter starts; R restarts after game over.
// The mouse aims (canvas coordinates, scaled to the logical field) and the
// left button fires. Touch is not the target here: this is a desktop game.

export const ACTION_START = 'start';
export const ACTION_DASH = 'dash';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered: consumed once by the loop
  const mouse = { x: 0, y: 0, down: false };

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 1280, rect.height / 800);
    const offsetX = (rect.width - 1280 * scale) / 2;
    const offsetY = (rect.height - 800 * scale) / 2;
    mouse.x = (event.clientX - rect.left - offsetX) / scale;
    mouse.y = (event.clientY - rect.top - offsetY) / scale;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', toField);
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      toField(event);
      mouse.down = true;
      pressed.add('MouseLeft');
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    // Normalised movement vector from the keys held down right now.
    move() {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const dir = MOVE_KEYS[code];
        if (dir) {
          x += dir[0];
          y += dir[1];
        }
      }
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    firing() {
      return mouse.down;
    },
    // True once per physical press; the loop clears it each frame.
    wasPressed(code) {
      return pressed.has(code);
    },
    consume(code) {
      pressed.delete(code);
    },
    // Map a raw key/button press to a game action for this frame.
    action() {
      if (pressed.has('Enter') || pressed.has('MouseLeft')) return ACTION_START;
      if (pressed.has('Space')) return ACTION_DASH;
      if (pressed.has('KeyP') || pressed.has('Escape')) return ACTION_PAUSE;
      if (pressed.has('KeyR')) return ACTION_RESTART;
      return null;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
