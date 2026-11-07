// Ações sobre jogos e telas globais: iniciar (splash), opções (X), guia,
// adicionar jogo, atualizar biblioteca.
import { h, sourceLabel, timeFmt } from './util.js';
import { createCover } from './cover.js';
import { openMenu, openConfirm, openTextInput, pushModal, closeModal, closeAll, topModal } from './modal.js';
import { toast } from './toast.js';
import { sfx } from '../sound.js';
import { dash, has } from '../api.js';
import { state, patchGame, refreshGames, setGames, getGame, replaceGame, setLoading, emit } from '../store.js';
import { setSoundEnabled } from '../sound.js';
import { app } from '../app.js';

const MIN_SPLASH = 2600;
let launching = false;

/* ------------------------------------------------------------ Iniciar */
export async function launchGame(game) {
  if (!game || launching) return;
  launching = true;
  sfx.select();

  const splash = document.getElementById('splash');
  const inner = splash.querySelector('.splash-inner');
  const status = h('div', { class: 'sp-status', text: 'Preparando...' });
  inner.replaceChildren(
    createCover(game),
    h('div', { class: 'sp-text' },
      h('div', { class: 'sp-k', text: 'Iniciando' }),
      h('div', { class: 'sp-name', text: game.name + '...' }),
      h('span', { class: 'badge ' + game.source, text: sourceLabel(game.source) }),
      h('div', { class: 'sp-row' },
        h('div', { class: 'ring-loader', html: '<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44"/><circle class="seg" cx="50" cy="50" r="44"/><circle class="seg s2" cx="50" cy="50" r="44"/></svg>' }),
        status)));
  splash.classList.remove('out');
  splash.hidden = false;

  // modal "bloqueante": engole a entrada enquanto a splash está na tela
  let dismissed = false;
  const blocker = { el: h('div'), veil: false, blocking: true, handle: (a) => { if (a === 'b') dismissed = true; return true; }, pointer() {}, hints: () => [['b', 'Ocultar']] };
  pushModal(blocker);
  app.refreshHints();

  const t0 = performance.now();
  let res;
  try {
    const p = dash.launch(game.id);
    setTimeout(() => { status.textContent = 'Abrindo o jogo...'; }, 900);
    res = await p;
  } catch (e) {
    res = { ok: false, error: String(e && e.message || e) };
  }
  if (res == null) res = { ok: false, error: 'O backend não respondeu.' };
  if (res.ok) {
    // espera um tempo mínimo para a animação respirar (B encurta)
    while (!dismissed && performance.now() - t0 < MIN_SPLASH) await new Promise((r) => setTimeout(r, 60));
  }
  splash.classList.add('out');
  setTimeout(() => { splash.hidden = true; inner.replaceChildren(); }, 450);
  blocker.blocking = false;
  closeModal(blocker);
  launching = false;
  app.refreshHints();

  if (!res.ok) {
    sfx.error();
    toast(res.error || `Não foi possível iniciar ${game.name}.`, { type: 'error', ms: 5200 });
  } else {
    refreshGames();
  }
}

/* --------------------------------------------------------- Favoritar */
export async function toggleFavorite(game) {
  if (!game) return;
  const fav = !game.favorite;
  sfx.toggle();
  try {
    await patchGame(game.id, { favorite: fav });
    toast(fav ? `${game.name} adicionado aos favoritos` : `${game.name} removido dos favoritos`, { ms: 2200 });
  } catch {
    sfx.error(); toast('Não foi possível atualizar o favorito.', { type: 'error' });
  }
}

/* ------------------------------------------------------ Opções (X) */
export function openGameOptions(game) {
  if (!game) return;
  const items = [
    { label: 'Jogar', icon: 'play', silent: true, onSelect: () => launchGame(game) },
    { label: game.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos', icon: 'star', silent: true, onSelect: () => toggleFavorite(getGame(game.id) || game) },
    { label: 'Renomear', icon: 'edit', onSelect: () => renameGame(game) },
    { label: 'Trocar capa', icon: 'image', onSelect: () => changeCover(game) },
    { label: 'Ocultar', icon: 'eye', onSelect: () => hideGame(game) },
  ];
  if (game.source === 'custom') items.push({ label: 'Remover', icon: 'trash', danger: true, onSelect: () => removeGame(game) });
  openMenu({
    theme: 'jogos', title: game.name, sub: sourceLabel(game.source),
    cover: createCover(game), items,
  });
}

async function renameGame(game) {
  const v = await openTextInput({ title: 'Renomear jogo', sub: 'Deixe em branco para voltar ao nome original', value: game.name, cover: createCover(game) });
  if (v == null) return;
  const name = v.trim();
  if (name === game.name) return;
  try {
    await patchGame(game.id, { customName: name || null });
    toast(name ? `Renomeado para ${name}` : 'Nome original restaurado', { ms: 2400 });
  } catch { sfx.error(); toast('Não foi possível renomear.', { type: 'error' }); }
}

async function changeCover(game) {
  try {
    const g = await dash.pickCover(game.id);
    if (g && g.id) { replaceGame(g); toast('Capa atualizada', { ms: 2200 }); }
  } catch { sfx.error(); toast('Não foi possível trocar a capa.', { type: 'error' }); }
}

async function hideGame(game) {
  try {
    await patchGame(game.id, { hidden: true });
    toast(`${game.name} foi ocultado — reexiba em Sistema › Jogos ocultos`, { ms: 4200 });
  } catch { sfx.error(); toast('Não foi possível ocultar.', { type: 'error' }); }
}

async function removeGame(game) {
  const ok = await openConfirm({ theme: 'jogos', title: 'Remover jogo?', text: `"${game.name}" sairá da biblioteca do Blade Dash. Os arquivos do jogo não são apagados.`, yes: 'Remover', yesIcon: 'trash', danger: true });
  if (!ok) return;
  try {
    await dash.removeCustomGame(game.id);
    setGames(state.games.filter((g) => g.id !== game.id));
    toast(`${game.name} removido`, { ms: 2400 });
    refreshGames();
  } catch { sfx.error(); toast('Não foi possível remover.', { type: 'error' }); }
}

/* ------------------------------------------- Adicionar / Atualizar */
export async function addGame() {
  try {
    const g = await dash.addCustomGame();
    if (!g) return;
    replaceGame(g);
    sfx.notify();
    toast(`${g.name} adicionado à biblioteca`);
    app.focusGame(g.id);
  } catch (e) {
    console.error(e); sfx.error(); toast('Não foi possível adicionar o jogo.', { type: 'error' });
  }
}

export async function rescan({ quiet = false } = {}) {
  if (state.loading) return;
  setLoading(true);
  if (!quiet) toast('Procurando seus jogos...', { ms: 2600 });
  try {
    const list = await dash.rescan();
    if (Array.isArray(list)) setGames(list); else await refreshGames();
    const n = state.games.filter((g) => !g.hidden).length;
    sfx.notify();
    toast(n ? `Biblioteca atualizada: ${n} ${n === 1 ? 'jogo' : 'jogos'}` : 'Nenhum jogo encontrado nos launchers instalados', { ms: 3600 });
  } catch (e) {
    console.error(e); sfx.error(); toast('Falha ao atualizar a biblioteca.', { type: 'error' });
  } finally {
    setLoading(false);
  }
}

/* --------------------------------------------------------- Desligar */
export async function confirmShutdown() {
  const ok = await openConfirm({ title: 'Desligar o PC?', text: 'O computador será desligado em alguns segundos. Salve seu progresso nos jogos abertos.', yes: 'Desligar o PC', yesIcon: 'power', danger: true });
  if (ok) {
    toast('Desligando...', { ms: 5000 });
    dash.shutdownPC();
  }
}

/* ------------------------------------------------------------- Guia */
export function toggleGuide() {
  const top = topModal();
  if (top && top.isGuide) { sfx.close(); closeModal(top); return; }
  if (top && top.blocking) return;
  closeAll();
  openGuide();
}

function openGuide() {
  const run = state.running ? getGame(state.running) : null;
  const body = run
    ? h('div', { class: 'g-run' }, createCover(run), h('div', {}, h('div', { class: 'k', text: 'Em jogo' }), h('div', { class: 'n', text: run.name })))
    : null;
  openMenu({
    theme: 'jogos', cls: 'guide', isGuide: true,
    head: h('div', { class: 'g-orb' }),
    title: state.profile.name || 'Jogador',
    sub: 'Guia · ' + timeFmt.format(new Date()),
    body,
    items: [
      { label: 'Voltar ao Dashboard', icon: 'home', onSelect: () => app.goHome() },
      { label: 'Configurações', icon: 'gear', onSelect: () => app.goSettings() },
      { label: 'Minimizar', icon: 'min', disabled: !has('minimize'), onSelect: () => dash.minimize() },
      { label: 'Desligar', icon: 'power', danger: true, onSelect: () => confirmShutdown() },
    ],
  });
}

/* ------------------------------------------------- Configurações */
/** Alterna uma configuração booleana (autostart, fullscreen, sounds) */
export async function toggleSetting(key) {
  const v = !state.settings[key];
  sfx.toggle();
  if (key === 'sounds') setSoundEnabled(v);
  state.settings = { ...state.settings, [key]: v };
  emit('settings', state.settings);
  try {
    const s = await dash.setSettings({ [key]: v });
    if (s && typeof s === 'object') state.settings = { ...state.settings, ...s };
  } catch (e) {
    console.error(e); sfx.error(); toast('Não foi possível salvar a configuração.', { type: 'error' });
  }
  setSoundEnabled(state.settings.sounds !== false);
  emit('settings', state.settings);
}

export const THEMES = { metro: 'Metro (2011)', blades: 'Blades (2005)' };
export const currentTheme = () => (state.settings.theme === 'blades' ? 'blades' : 'metro');

/** Troca o visual do dashboard e recarrega o renderer (sem repetir o boot) */
export async function switchTheme() {
  const next = currentTheme() === 'metro' ? 'blades' : 'metro';
  sfx.select();
  try {
    await dash.setSettings({ theme: next });
  } catch (e) {
    console.error(e); sfx.error(); toast('Não foi possível trocar o visual.', { type: 'error' }); return;
  }
  try { sessionStorage.setItem('bladedash.skipBoot', '1'); } catch { /* ok */ }
  document.body.classList.add('theme-switching');
  setTimeout(() => location.reload(), 280);
}

/** Reexibe um jogo oculto */
export async function unhideGame(g) {
  sfx.select();
  try {
    await patchGame(g.id, { hidden: false });
    toast(`${g.name} voltou para a biblioteca`, { ms: 2600 });
  } catch { sfx.error(); toast('Não foi possível reexibir.', { type: 'error' }); }
}
