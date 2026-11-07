// Camada de entrada unificada: controle (Gamepad API), teclado e mouse.
// Emite ações semânticas: up down left right a b x y lb rb start back guide
// cb(action, { source: 'pad' | 'key', repeat: boolean, key?: string })

const REPEAT_DELAY = 350;
const REPEAT_RATE = 90;
const DEADZONE = 0.5;
const REPEATABLE = new Set(['up', 'down', 'left', 'right']);

const actionCbs = new Set();
const padCbs = new Set();
export const onAction = (fn) => (actionCbs.add(fn), () => actionCbs.delete(fn));
/** cb({ connected, id, index }) */
export const onPad = (fn) => (padCbs.add(fn), () => padCbs.delete(fn));

function emit(action, meta) {
  for (const fn of actionCbs) {
    try { fn(action, meta); } catch (e) { console.error(e); }
  }
}

// itens segurados -> { action, next, source, key }
const held = new Map();

function press(id, action, source, key) {
  emit(action, { source, repeat: false, key });
  if (REPEATABLE.has(action)) held.set(id, { action, source, key, next: performance.now() + REPEAT_DELAY });
}
function release(id) { held.delete(id); }

// ------------------------------------------------------------ teclado
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Enter: 'a', NumpadEnter: 'a', Space: 'a',
  Escape: 'b', Backspace: 'b',
  KeyX: 'x', Tab: 'x',
  KeyY: 'y', KeyF: 'y',
  KeyQ: 'lb', PageUp: 'lb',
  KeyE: 'rb', PageDown: 'rb',
  KeyG: 'back', Backquote: 'back',
  Home: 'guide', F1: 'guide',
};

function isTextField(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // Em campo de texto: só Enter/Esc viram ações; o resto é digitação normal.
  if (isTextField(document.activeElement)) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (!e.repeat) emit('a', { source: 'key', repeat: false, key: e.code }); }
    else if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) emit('b', { source: 'key', repeat: false, key: e.code }); }
    else if (e.code === 'Tab') e.preventDefault();
    return;
  }
  const action = KEYMAP[e.code];
  if (!action) return;
  e.preventDefault();
  if (e.repeat) return; // usamos nosso próprio auto-repeat (igual ao controle)
  press('k:' + e.code, action, 'key', e.code);
}, true);

window.addEventListener('keyup', (e) => release('k:' + e.code), true);
window.addEventListener('blur', () => held.clear());

// ------------------------------------------------------------ controle
// Mapeamento "standard": 0=A 1=B 2=X 3=Y 4=LB 5=RB 8=Back 9=Start 12-15=dpad 16=Guide
const BTN = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'back', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'guide' };
const padPrev = new Map(); // index -> Set(ids pressionados)
let anyPad = false;

function readPad(gp) {
  const now = new Set();
  const b = gp.buttons;
  for (const i in BTN) {
    const btn = b[i];
    if (btn && (btn.pressed || btn.value > 0.6)) now.add('b' + i);
  }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  // histerese leve: depois de ativado, solta só abaixo de 0.35
  const prev = padPrev.get(gp.index) || new Set();
  const th = (id) => (prev.has(id) ? 0.35 : DEADZONE);
  if (ax < -th('sl')) now.add('sl');
  if (ax > th('sr')) now.add('sr');
  if (ay < -th('su')) now.add('su');
  if (ay > th('sd')) now.add('sd');
  // diagonal no analógico: fica só o eixo dominante (evita duplo movimento)
  if ((now.has('sl') || now.has('sr')) && (now.has('su') || now.has('sd'))) {
    if (Math.abs(ax) > Math.abs(ay)) { now.delete('su'); now.delete('sd'); } else { now.delete('sl'); now.delete('sr'); }
  }
  return now;
}
const STICK = { sl: 'left', sr: 'right', su: 'up', sd: 'down' };

function pollPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const now = readPad(gp);
    const prev = padPrev.get(gp.index) || new Set();
    for (const id of now) {
      if (prev.has(id)) continue;
      const action = id[0] === 'b' ? BTN[id.slice(1)] : STICK[id];
      if (!anyPad) { anyPad = true; }
      press(`p${gp.index}:${id}`, action, 'pad');
    }
    for (const id of prev) if (!now.has(id)) release(`p${gp.index}:${id}`);
    padPrev.set(gp.index, now);
  }
}

window.addEventListener('gamepadconnected', (e) => {
  padPrev.set(e.gamepad.index, new Set());
  for (const fn of padCbs) fn({ connected: true, id: e.gamepad.id, index: e.gamepad.index });
});
window.addEventListener('gamepaddisconnected', (e) => {
  padPrev.delete(e.gamepad.index);
  for (const id of [...held.keys()]) if (id.startsWith(`p${e.gamepad.index}:`)) held.delete(id);
  for (const fn of padCbs) fn({ connected: false, id: e.gamepad.id, index: e.gamepad.index });
});

// ------------------------------------------------------------ loop
function loop() {
  pollPads();
  const t = performance.now();
  for (const h of held.values()) {
    if (t >= h.next) {
      h.next = t + REPEAT_RATE;
      emit(h.action, { source: h.source, repeat: true, key: h.key });
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ------------------------------------------------------------ mouse
// Esconde o cursor depois de 3s parado. Hover só vale se o mouse se mexeu
// de verdade (evita o conteúdo rolando por baixo "roubar" o foco).
let lastMove = 0, hideTimer = 0, lastX = -1, lastY = -1;
window.addEventListener('mousemove', (e) => {
  if (e.clientX === lastX && e.clientY === lastY) return;
  lastX = e.clientX; lastY = e.clientY;
  lastMove = performance.now();
  document.documentElement.classList.remove('no-cursor');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => document.documentElement.classList.add('no-cursor'), 3000);
}, { passive: true });
document.documentElement.classList.add('no-cursor');
export const mouseActive = () => performance.now() - lastMove < 250;
