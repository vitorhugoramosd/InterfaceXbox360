// Blade Dash — ponto de entrada do renderer.
import { dash, isMock } from './api.js';
import { state, emit, setGames, setRunning, refreshGames, getGame } from './store.js';
import { onAction, onPad, mouseActive } from './input.js';
import { sfx, setSoundEnabled, unlockAudio } from './sound.js';
import { app } from './app.js';
import { BladeStack } from './ui/blades.js';
import { createJogos } from './ui/jogos.js';
import { createRecentes } from './ui/recentes.js';
import { createSistema } from './ui/sistema.js';
import { createPerfil } from './ui/perfil.js';
import { topModal } from './ui/modal.js';
import { renderHints, setHintMode } from './ui/hints.js';
import { toast } from './ui/toast.js';
import { runBoot, skipBoot, booting } from './ui/boot.js';
import { toggleGuide, rescan } from './ui/actions.js';
import { fillAvatar, timeFmt, dateFmt } from './ui/util.js';

/* ------------------------------------------------ escala do palco 1920x1080 */
function applyScale() {
  const w = window.innerWidth, hgt = window.innerHeight;
  const s = Math.min(w / 1920, hgt / 1080);
  const root = document.documentElement.style;
  root.setProperty('--s', s);
  root.setProperty('--ox', (w - 1920 * s) / 2 + 'px');
  root.setProperty('--oy', (hgt - 1080 * s) / 2 + 'px');
}
applyScale();
window.addEventListener('resize', applyScale);

/* ------------------------------------------------------------- boot */
async function start() {
  // configurações primeiro (rápido) para respeitar "sons" já no boot
  try {
    const s = await Promise.race([dash.getSettings(), new Promise((r) => setTimeout(r, 400))]);
    if (s) state.settings = { ...state.settings, ...s };
  } catch (e) { console.error(e); }
  setSoundEnabled(state.settings.sounds !== false);

  const bootDone = runBoot();

  // carrega perfil e jogos em paralelo à animação
  const loadProfile = dash.getProfile().then((p) => { if (p && p.name) state.profile = p; }).catch(console.error);
  const loadGames = dash.getGames().then((g) => g).catch((e) => { console.error(e); return []; });

  await loadProfile;
  applyProfile();
  setGames(await loadGames);

  await bootDone;
  refreshHints();

  if (!state.games.length) rescan({ quiet: false });
  if (isMock) setTimeout(() => toast('Modo demonstração: dados de exemplo (fora do Electron)', { ms: 4200 }), 600);
}

/* ------------------------------------------------------------ blades */
const jogos = createJogos();
const screens = [jogos, createRecentes(), createSistema(), createPerfil()];
const blades = new BladeStack(document.getElementById('blades'), screens, () => refreshHints());

app.goBlade = (key) => { const i = blades.indexOf(key); if (i >= 0) blades.go(i); refreshHints(); };
app.focusGame = (id) => { blades.go(0, { silent: true }); jogos.focusGame(id); refreshHints(); };
app.refreshHints = () => refreshHints();

function refreshHints() {
  const top = topModal();
  renderHints(top ? top.hints() : blades.current.hints());
}

/* ------------------------------------------------------------ entrada */
onAction((action, meta) => {
  unlockAudio();
  setHintMode(meta.source === 'pad' ? 'pad' : 'kb');
  if (booting) { skipBoot(); return; }

  const top = topModal();
  if (top) {
    if (action === 'guide') toggleGuide();
    else top.handle(action, meta);
    refreshHints();
    return;
  }
  if (action === 'guide') { toggleGuide(); refreshHints(); return; }
  if (action === 'lb') { blades.prev(); refreshHints(); return; }
  if (action === 'rb') { blades.next(); refreshHints(); return; }

  const handled = blades.current.handle(action, meta);
  if (!handled) {
    if (action === 'left' && !meta.repeat) blades.prev();
    else if (action === 'right' && !meta.repeat) blades.next();
    else if (action === 'b' && meta.source === 'key' && meta.key === 'Escape') toggleGuide();
  }
  refreshHints();
});

// mouse: hover foca, clique seleciona (delegação)
function ownerFor(target) {
  const top = topModal();
  if (top) return top.el.contains(target) ? top : null;
  const blade = target.closest('.blade');
  if (!blade) return null;
  return blades.current.bladeEl === blade ? blades.current : null;
}
document.addEventListener('mouseover', (e) => {
  if (booting || !mouseActive()) return;
  const owner = ownerFor(e.target);
  if (owner && owner.pointer) { owner.pointer(e.target, 'hover'); refreshHints(); }
});
document.addEventListener('click', (e) => {
  unlockAudio();
  if (booting) { skipBoot(); return; }
  setHintMode('kb');
  const spine = e.target.closest('[data-nav="spine"]');
  if (spine && !topModal()) { blades.go(+spine.dataset.i); refreshHints(); return; }
  if (e.target.closest('#veil')) {
    const top = topModal();
    if (top && !top.blocking) top.handle('b', { source: 'mouse' });
    refreshHints();
    return;
  }
  const owner = ownerFor(e.target);
  if (owner && owner.pointer) { owner.pointer(e.target, 'click'); refreshHints(); }
});
// botão direito = voltar
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (booting) return;
  const top = topModal();
  if (top) top.handle('b', { source: 'mouse' });
  else blades.current.handle('b', { source: 'mouse' });
  refreshHints();
});

onPad(({ connected, id }) => {
  state.padConnected = navigator.getGamepads && [...navigator.getGamepads()].some((g) => g && g.connected);
  emit('pad', state.padConnected);
  if (connected) { setHintMode('pad'); sfx.notify(); toast('Controle conectado'); }
  else toast('Controle desconectado', { ms: 2600 });
  refreshHints();
});

/* -------------------------------------------------- eventos do backend */
dash.onGamesUpdated && dash.onGamesUpdated((list) => { if (Array.isArray(list)) setGames(list); });
dash.onGameState && dash.onGameState(({ id, running } = {}) => {
  if (running) setRunning(id);
  else {
    if (!state.running || state.running === id) setRunning(null);
    refreshGames(); // tempo de jogo / último jogado atualizados
  }
  renderRunning();
});

function renderRunning() {
  const ind = document.getElementById('running-ind');
  const g = state.running ? getGame(state.running) : null;
  ind.hidden = !g;
  if (g) ind.querySelector('.txt').textContent = 'Em jogo: ' + g.name;
}

function applyProfile() {
  document.getElementById('tb-name').textContent = state.profile.name || 'Jogador';
  fillAvatar(document.getElementById('tb-pic'), state.profile.name);
  emit('profile', state.profile);
}

/* ------------------------------------------------------------- relógio */
function tick() {
  const now = new Date();
  const t = timeFmt.format(now);
  const d = dateFmt.format(now);
  document.querySelectorAll('[data-clock]').forEach((el) => { if (el.textContent !== t) el.textContent = t; });
  document.querySelectorAll('[data-date]').forEach((el) => { if (el.textContent !== d) el.textContent = d; });
}
tick();
setInterval(tick, 1000);

refreshHints();
start();
