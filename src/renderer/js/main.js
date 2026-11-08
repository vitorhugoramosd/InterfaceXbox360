// Blade Dash — ponto de entrada do renderer.
import { dash, isMock } from './api.js';
import { state, emit, on, setGames, setRunning, refreshGames, getGame } from './store.js';
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
import { toggleGuide, rescan, currentTheme } from './ui/actions.js';
import { MetroShell } from './metro/shell.js';
import { createInicio, createJogosPivot, createRecentesPivot, createPlataformas, createLoja, createConfig } from './metro/pivots.js';
import { initExtras, downloadsSummary } from './extras.js';
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

  const theme = currentTheme();
  buildShell(theme);
  const bootDone = runBoot({ theme });

  // carrega perfil e jogos em paralelo à animação
  const loadProfile = dash.getProfile().then((p) => { if (p && p.name) state.profile = p; }).catch(console.error);
  const loadGames = dash.getGames().then((g) => g).catch((e) => { console.error(e); return []; });

  await loadProfile;
  applyProfile();
  setGames(await loadGames);
  initExtras(); // v2: não instalados, downloads (ofertas/discos carregam sob demanda)

  await bootDone;
  refreshHints();

  if (!state.games.length) rescan({ quiet: false });
  if (isMock) setTimeout(() => toast('Modo demonstração: dados de exemplo (fora do Electron)', { ms: 4200 }), 600);
}

/* ------------------------------------------------- shell por tema */
// "shell" = pilha de blades (2005) ou pivôs Metro (2011). Mesma interface:
// current, go(i), next(), prev(), indexOf(key); cada tela tem handle/hints/pointer/bladeEl.
let shell = null;

function buildShell(theme) {
  document.body.classList.add('theme-' + theme);
  if (theme === 'metro') {
    document.getElementById('blades').remove();
    const root = document.getElementById('metro');
    const jogosPivot = createJogosPivot();
    const pivots = [];
    const nav = { go: (key) => { const i = pivots.findIndex((p) => p.key === key); if (i >= 0) shell.go(i); refreshHints(); } };
    pivots.push(createInicio(nav), jogosPivot, createRecentesPivot(), createPlataformas(), createLoja(), createConfig());
    shell = new MetroShell(root, pivots, () => refreshHints());
    app.goHome = () => nav.go('inicio');
    app.goSettings = () => nav.go('config');
    app.focusGame = (id) => { nav.go('jogos'); jogosPivot.focusGame(id); refreshHints(); };
  } else {
    document.getElementById('metro').remove();
    const jogos = createJogos();
    const screens = [jogos, createRecentes(), createSistema(), createPerfil()];
    shell = new BladeStack(document.getElementById('blades'), screens, () => refreshHints());
    const goKey = (key) => { const i = shell.indexOf(key); if (i >= 0) shell.go(i); refreshHints(); };
    app.goHome = () => goKey('jogos');
    app.goSettings = () => goKey('sistema');
    app.focusGame = (id) => { shell.go(0, { silent: true }); jogos.focusGame(id); refreshHints(); };
  }
}
app.refreshHints = () => refreshHints();

function refreshHints() {
  const top = topModal();
  if (!shell) return;
  renderHints(top ? top.hints() : shell.current.hints());
}

/* ------------------------------------------------------------ entrada */
onAction((action, meta) => {
  unlockAudio();
  setHintMode(meta.source === 'pad' ? 'pad' : 'kb');
  if (booting) { skipBoot(); return; }
  if (!shell) return;

  const top = topModal();
  if (top) {
    if (action === 'guide') toggleGuide();
    else top.handle(action, meta);
    refreshHints();
    return;
  }
  if (action === 'guide') { toggleGuide(); refreshHints(); return; }
  if (action === 'lb') { shell.prev(); refreshHints(); return; }
  if (action === 'rb') { shell.next(); refreshHints(); return; }

  const handled = shell.current.handle(action, meta);
  if (!handled) {
    if (action === 'left' && !meta.repeat) shell.prev();
    else if (action === 'right' && !meta.repeat) shell.next();
    else if (action === 'b' && meta.source === 'key' && meta.key === 'Escape') toggleGuide();
  }
  refreshHints();
});

// mouse: hover foca, clique seleciona (delegação)
function ownerFor(target) {
  const top = topModal();
  if (top) return top.el.contains(target) ? top : null;
  if (!shell) return null;
  const scr = target.closest('[data-screen]');
  if (!scr) return null;
  return shell.current.bladeEl === scr ? shell.current : null;
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
  if (!shell) return;
  const spine = e.target.closest('[data-nav="spine"]');
  if (spine && !topModal()) { shell.go(+spine.dataset.i); refreshHints(); return; }
  // clique num pivô vizinho que está "espiando" na borda: vai para ele
  const peek = !topModal() && e.target.closest('[data-screen]');
  if (peek && peek !== shell.current.bladeEl) {
    const i = shell.screens.findIndex((p) => p.bladeEl === peek);
    if (i >= 0) { shell.go(i); refreshHints(); return; }
  }
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
  if (booting || !shell) return;
  const top = topModal();
  if (top) top.handle('b', { source: 'mouse' });
  else shell.current.handle('b', { source: 'mouse' });
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
on('running', () => { renderRunning(); refreshHints(); });
on('downloads', () => renderDownloads());
on('uninstalled', () => refreshHints());

/** Indicador no topo: "⬇ 2 downloads · 42%" */
function renderDownloads() {
  const el = document.getElementById('dl-ind');
  const sum = downloadsSummary();
  el.hidden = !sum;
  if (!sum) return;
  el.querySelector('.txt').textContent = `${sum.count} ${sum.count === 1 ? 'download' : 'downloads'} · ${Math.round(sum.progress * 100)}%`;
  el.querySelector('.bar i').style.width = Math.round(sum.progress * 100) + '%';
}
on('settings', () => refreshHints());
on('games', () => { renderRunning(); refreshHints(); });

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
