// Tema Metro: os cinco pivôs (início, jogos, recentes, plataformas, configurações).
// Cada pivô é um TilePage alimentado pelos dados reais do store.
import { h, relTime, playtime, hours, fmtNum, sortAlpha, sourceLabel, fillAvatar, SOURCES } from '../ui/util.js';
import { state, on, visibleGames } from '../store.js';
import { launchGame, toggleFavorite, openGameOptions, addGame, rescan, confirmShutdown, toggleSetting, switchTheme, unhideGame, THEMES, currentTheme } from '../ui/actions.js';
import { dash, has } from '../api.js';
import { sfx } from '../sound.js';
import { toast } from '../ui/toast.js';
import { TilePage, AREA_H, GAP } from './page.js';
import { solidTile, imageTile, coverTile, artLayer, gameSig, micon } from './tiles.js';

const G1 = '#107c10';   // verde escuro
const G2 = '#4ea72a';   // verde claro
const GRAY = '#6b6b6b';

const byRecent = (list) => list.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);

/** Ações padrão de um bloco de jogo (A jogar, X opções, Y favoritar) */
function gameActions(g) {
  return {
    a: () => launchGame(g),
    opts: () => openGameOptions(g),
    fav: () => toggleFavorite(g),
    hints: [['a', 'Jogar'], ['x', 'Opções'], ['y', g.favorite ? 'Desfavoritar' : 'Favoritar']],
  };
}

/** Grade horizontal de capas em N linhas (Metro rola para o lado) */
function coverGrid(games, { x0 = 0, y0 = 0, rows = 2, keyPrefix = 'g:', actions = gameActions } = {}) {
  const th = Math.floor((AREA_H - y0 - GAP * (rows - 1)) / rows);
  const tw = Math.round(th * 2 / 3);
  return games.map((g, i) => ({
    key: keyPrefix + g.id,
    x: x0 + Math.floor(i / rows) * (tw + GAP), y: y0 + (i % rows) * (th + GAP), w: tw, h: th,
    sig: gameSig(g), cls: 'cover',
    render: (lazy) => coverTile(g, lazy),
    ...actions(g),
  }));
}

function loadingTile(x, y, w, hgt, text = 'procurando seus jogos...') {
  return {
    key: 'loading', x, y, w, h: hgt, color: GRAY, sig: 'loading:' + text,
    render: () => h('div', { class: 'mt-solid ico-center' },
      h('div', { class: 'ring-loader sm', html: '<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44"/><circle class="seg" cx="50" cy="50" r="44"/></svg>' }),
      h('div', { class: 'mt-label', text })),
  };
}

/* =============================== início =============================== */
export function createInicio(nav) {
  const page = new TilePage({ key: 'inicio', title: 'início' });
  const RH = Math.floor((AREA_H - 2 * GAP) / 3);         // 228
  const L = 300, C = 420, R = 300;
  const xC = L + GAP, xC2 = xC + C + GAP, xR = xC2 + C + GAP;

  // destaque com rotação e crossfade
  let pool = [], fi = 0, featEl = null, featGame = null, sub = null, featSig = '';
  const featLabel = (g) => (g.lastPlayed ? 'Continuar: ' : 'Destaque: ') + g.name;
  function renderFeat() {
    featEl = h('div', { class: 'mt-image mt-feat' });
    paintFeat(true);
    return featEl;
  }
  function paintFeat(instant) {
    if (!featEl || !featGame) return;
    const g = featGame;
    featSig = gameSig(g);
    const layer = h('div', { class: 'feat-layer' + (instant ? ' on' : '') },
      artLayer(g, true), h('div', { class: 'mt-grad' }),
      g.favorite ? h('div', { class: 'mt-star', text: '★' }) : null,
      h('div', { class: 'mt-label big' }, h('div', { class: 'mt-name', text: featLabel(g) }),
        h('div', { class: 'mt-sub', text: g.lastPlayed ? 'Jogado ' + relTime(g.lastPlayed) + ' · ' + playtime(g.playtimeMinutes) : sourceLabel(g.source) })));
    featEl.append(layer);
    if (!instant) { void layer.offsetWidth; layer.classList.add('on'); }
    const olds = [...featEl.children].filter((c) => c !== layer);
    setTimeout(() => olds.forEach((o) => o.remove()), 900);
  }
  setInterval(() => {
    if (sub || pool.length < 2) return;
    if (page.active && page.focusKey === 'feat') return; // pausa com foco
    fi = (fi + 1) % pool.length;
    featGame = pool[fi];
    paintFeat(false);
  }, 8000);

  function build() {
    if (sub) return buildFavs();
    page.onBack = null;
    page.setHeader('');
    const vis = visibleGames();
    const rec = byRecent(vis);
    const favs = sortAlpha(vis.filter((g) => g.favorite));
    const alpha = sortAlpha(vis);
    // pool do destaque: recentes + favoritos (até 5), senão os primeiros da biblioteca
    const seen = new Set();
    const last0 = rec[0] || null;
    // o último jogado já tem bloco próprio: o destaque começa pelos seguintes
    let cand = [...rec.slice(1), ...favs, ...alpha].filter((g) => !seen.has(g.id) && seen.add(g.id) && (!last0 || g.id !== last0.id));
    if (!cand.length && last0) cand = [last0];
    pool = cand.slice(0, 5);
    if (featGame) {
      const same = pool.find((g) => g.id === featGame.id);
      if (same) { fi = pool.indexOf(same); featGame = same; } else { fi = 0; featGame = pool[0] || null; }
    } else featGame = pool[0] || null;

    const used = new Set(featGame ? [featGame.id] : []);
    const take = () => { const g = [...rec, ...alpha].find((x) => !used.has(x.id)); if (g) used.add(g.id); return g || null; };
    const last = rec[0] || null;
    if (last) used.add(last.id);
    const w1 = take(), w2 = take(), r1 = take();

    const specs = [];
    // coluna esquerda
    if (last) specs.push({ key: 'last', x: 0, y: 0, w: L, h: RH, sig: 'last' + gameSig(last), render: () => imageTile(last, { label: 'Jogar ' + last.name, wide: true }), ...gameActions(last) });
    else specs.push({ key: 'last', x: 0, y: 0, w: L, h: RH, color: G1, sig: 'lib', render: () => solidTile({ icon: 'grid', label: 'Biblioteca de jogos' }), a: () => nav.go('jogos') });
    specs.push({ key: 'favs', x: 0, y: RH + GAP, w: L, h: RH, color: G2, sig: 'favs' + favs.length, render: () => solidTile({ icon: 'star', label: 'Meus Favoritos', value: favs.length ? String(favs.length) : null }), a: () => { sfx.select(); openFavs(); } });
    specs.push({ key: 'recs', x: 0, y: 2 * (RH + GAP), w: L, h: RH, color: G1, sig: 'recs', render: () => solidTile({ icon: 'clock', label: 'Recentes' }), a: () => nav.go('recentes') });
    // destaque grande
    if (featGame) {
      specs.push({ key: 'feat', x: xC, y: 0, w: C * 2 + GAP, h: RH * 2 + GAP, sig: 'feat', render: renderFeat,
        a: () => featGame && launchGame(featGame), opts: () => featGame && openGameOptions(featGame), fav: () => featGame && toggleFavorite(featGame),
        hints: [['a', 'Jogar'], ['x', 'Opções'], ['y', featGame.favorite ? 'Desfavoritar' : 'Favoritar']] });
    } else if (state.loading) specs.push({ ...loadingTile(xC, 0, C * 2 + GAP, RH * 2 + GAP), key: 'feat' });
    else specs.push({ key: 'feat', x: xC, y: 0, w: C * 2 + GAP, h: RH * 2 + GAP, color: G2, sig: 'feat-empty', render: () => solidTile({ icon: 'plus', label: 'Adicione seus jogos', sub: 'Nenhum jogo encontrado. Pressione A para adicionar um jogo.' }), a: () => { sfx.select(); addGame(); } });
    // dois largos embaixo
    [[w1, xC], [w2, xC2]].forEach(([g, x], i) => {
      const key = 'w' + i;
      if (g) specs.push({ key, x, y: 2 * (RH + GAP), w: C, h: RH, sig: key + gameSig(g), render: () => imageTile(g, { sub: g.lastPlayed ? 'Jogado ' + relTime(g.lastPlayed) : sourceLabel(g.source) }), ...gameActions(g) });
      else specs.push({ key, x, y: 2 * (RH + GAP), w: C, h: RH, color: GRAY, sig: key + 'plat', render: () => solidTile({ icon: i ? 'screen' : 'grid', label: i ? 'Plataformas' : 'Todos os jogos', iconPos: 'left' }), a: () => nav.go(i ? 'plataformas' : 'jogos') });
    });
    // coluna direita
    if (r1) specs.push({ key: 'r1', x: xR, y: 0, w: R, h: RH, sig: 'r1' + gameSig(r1), render: () => imageTile(r1, {}), ...gameActions(r1) });
    else specs.push({ key: 'r1', x: xR, y: 0, w: R, h: RH, color: GRAY, sig: 'r1cfg', render: () => solidTile({ icon: 'pad', label: 'Configurações' }), a: () => nav.go('config') });
    specs.push({ key: 'add', x: xR, y: RH + GAP, w: R, h: RH, color: G1, sig: 'add', render: () => solidTile({ icon: 'plus', label: 'Adicionar Jogo' }), a: () => { sfx.select(); addGame(); } });
    specs.push({ key: 'scan', x: xR, y: 2 * (RH + GAP), w: R, h: RH, color: G2, sig: 'scan' + state.loading, render: () => solidTile({ icon: 'refresh', label: state.loading ? 'Atualizando...' : 'Atualizar Biblioteca' }), a: () => { sfx.select(); rescan(); } });
    if (!page.focusKey) page.focusKey = 'feat';
    page.setTiles(specs);
    if (featEl && featGame) refreshFeatIfChanged();
  }
  function refreshFeatIfChanged() {
    const s = gameSig(featGame);
    if (s !== featSig) { featSig = s; paintFeat(true); }
  }

  // sub-vista: favoritos
  function openFavs() { sub = 'favs'; page.focusKey = null; build(); }
  function buildFavs() {
    const favs = sortAlpha(visibleGames().filter((g) => g.favorite));
    page.setHeader('meus favoritos');
    page.onBack = () => { sub = null; page.focusKey = 'favs'; build(); };
    const specs = favs.length ? coverGrid(favs, { y0: 64 })
      : [{ key: 'none', x: 0, y: 64, w: 560, h: 300, color: GRAY, sig: 'nofav', render: () => solidTile({ icon: 'star', label: 'Nenhum favorito ainda', sub: 'Pressione Y em um jogo para favoritá-lo.' }) }];
    page.setTiles(specs);
  }

  on('games', build); on('running', build); on('loading', build);
  build();
  page.focusKey = 'feat';
  return page;
}

/* ================================ jogos ================================ */
export function createJogosPivot() {
  const page = new TilePage({ key: 'jogos', title: 'jogos' });
  const TH = Math.floor((AREA_H - GAP) / 2), TW = Math.round(TH * 2 / 3);
  function build() {
    const games = sortAlpha(visibleGames());
    const specs = [
      { key: 'add', x: 0, y: 0, w: TW, h: TH, color: G1, sig: 'add', render: () => solidTile({ icon: 'plus', label: 'Adicionar Jogo' }), a: () => { sfx.select(); addGame(); } },
      { key: 'scan', x: 0, y: TH + GAP, w: TW, h: TH, color: G2, sig: 'scan' + state.loading, render: () => solidTile({ icon: 'refresh', label: state.loading ? 'Atualizando...' : 'Atualizar Biblioteca' }), a: () => { sfx.select(); rescan(); } },
    ];
    if (games.length) specs.push(...coverGrid(games, { x0: TW + GAP }));
    else if (state.loading) specs.push(loadingTile(TW + GAP, 0, TW * 2 + GAP, TH));
    else specs.push({ key: 'none', x: TW + GAP, y: 0, w: TW * 2 + GAP, h: TH, color: GRAY, sig: 'none', render: () => solidTile({ icon: 'search', label: 'Nenhum jogo encontrado', sub: 'Use Atualizar Biblioteca ou Adicionar Jogo.' }) });
    // enquanto o usuário não entrou no pivô, o foco inicial fica no primeiro jogo (não no botão)
    if (!page.active && games.length && (!page.focusKey || page.focusKey === 'add' || page.focusKey === 'scan' || page.focusKey === 'loading' || page.focusKey === 'none')) {
      page.focusKey = 'g:' + games[0].id;
      page.tx = 0;
    }
    page.setTiles(specs);
    page.setHeader('');
  }
  on('games', build); on('running', build); on('loading', build);
  build();
  page.focusGame = (id) => page.focus('g:' + id);
  return page;
}

/* =============================== recentes =============================== */
export function createRecentesPivot() {
  const page = new TilePage({ key: 'recentes', title: 'recentes' });
  const TH = Math.floor((AREA_H - GAP) / 2), TW = 560;
  function build() {
    const rec = byRecent(visibleGames()).slice(0, 12);
    const specs = rec.map((g, i) => ({
      key: 'r:' + g.id, x: Math.floor(i / 2) * (TW + GAP), y: (i % 2) * (TH + GAP), w: TW, h: TH,
      sig: 'r' + gameSig(g),
      render: () => imageTile(g, { sub: (state.running === g.id ? 'Em jogo agora' : 'Jogado ' + relTime(g.lastPlayed)) + ' · ' + playtime(g.playtimeMinutes) }),
      ...gameActions(g),
    }));
    if (!specs.length) specs.push({ key: 'none', x: 0, y: 0, w: TW, h: TH, color: GRAY, sig: 'none', render: () => solidTile({ icon: 'clock', label: 'Nada jogado ainda', sub: 'Os jogos que você abrir pelo dashboard aparecem aqui.' }) });
    page.setTiles(specs);
  }
  on('games', build); on('running', build);
  setInterval(build, 60000); // "há X minutos"
  build();
  return page;
}

/* ============================= plataformas ============================= */
const SRC_COLORS = { steam: '#2a5b84', epic: '#3f3f3f', ubisoft: '#1f5fd6', ea: '#c8323b', xbox: G1, custom: '#7a4fb8' };
export function createPlataformas() {
  const page = new TilePage({ key: 'plataformas', title: 'plataformas' });
  const T = Math.floor((AREA_H - GAP) / 2);
  let sub = null; // fonte aberta
  function build() {
    const vis = visibleGames();
    if (sub) {
      const games = sortAlpha(vis.filter((g) => g.source === sub));
      page.setHeader(sourceLabel(sub).toLowerCase());
      page.onBack = () => { const k = 's:' + sub; sub = null; build(); page.focus(k); };
      page.setTiles(games.length ? coverGrid(games, { y0: 64 }) : [{ key: 'none', x: 0, y: 64, w: 560, h: 300, color: GRAY, sig: 'none', render: () => solidTile({ label: 'Nenhum jogo desta plataforma' }) }]);
      return;
    }
    page.setHeader('');
    page.onBack = null;
    const counts = {};
    for (const g of vis) counts[g.source] = (counts[g.source] || 0) + 1;
    const srcs = Object.keys(SOURCES).filter((s) => counts[s]);
    const specs = srcs.map((s, i) => ({
      key: 's:' + s, x: Math.floor(i / 2) * (T + GAP), y: (i % 2) * (T + GAP), w: T, h: T, color: SRC_COLORS[s],
      sig: s + counts[s],
      render: () => h('div', { class: 'mt-solid ico-left' },
        h('div', { class: 'mt-src', text: sourceLabel(s) }),
        h('div', { class: 'mt-value', text: fmtNum(counts[s]) }),
        h('div', { class: 'mt-label', text: counts[s] === 1 ? 'jogo' : 'jogos' })),
      a: () => { sfx.select(); sub = s; page.focusKey = null; build(); },
      hints: [['a', 'Ver jogos']],
    }));
    if (!specs.length) specs.push(state.loading ? loadingTile(0, 0, T, T) : { key: 'none', x: 0, y: 0, w: T * 2, h: T, color: GRAY, sig: 'none', render: () => solidTile({ icon: 'search', label: 'Nenhuma plataforma com jogos' }) });
    page.setTiles(specs);
  }
  on('games', build); on('running', build); on('loading', build);
  build();
  return page;
}

/* ============================ configurações ============================ */
export function createConfig() {
  const page = new TilePage({ key: 'config', title: 'configurações' });
  const RH = Math.floor((AREA_H - 2 * GAP) / 3), SW = 300, PW = 460;
  let sub = null;
  const onOff = (k) => (state.settings[k] ? 'Ligado' : 'Desligado');

  function profileTile() {
    const all = visibleGames();
    const total = all.reduce((s, g) => s + (g.playtimeMinutes || 0), 0);
    const most = all.filter((g) => g.playtimeMinutes > 0).sort((a, b) => b.playtimeMinutes - a.playtimeMinutes)[0];
    const av = h('div', { class: 'avatar m-avatar' });
    fillAvatar(av, state.profile.name);
    const row = (k, v) => h('div', { class: 'mp-row' }, h('span', { text: k }), h('b', { text: v }));
    return h('div', { class: 'mt-profile' },
      h('div', { class: 'mp-head' }, av, h('div', {}, h('div', { class: 'mp-name', text: state.profile.name || 'Jogador' }), h('div', { class: 'mp-clock', dataset: { clock: '' } }))),
      row('jogos', fmtNum(all.length)),
      row('horas jogadas', hours(total)),
      row('favoritos', fmtNum(all.filter((g) => g.favorite).length)),
      row('mais jogado', most ? most.name : '—'));
  }

  function build() {
    if (sub === 'hidden') return buildHidden();
    page.setHeader('');
    page.onBack = null;
    const hiddenN = state.games.filter((g) => g.hidden).length;
    const theme = currentTheme();
    const items = [
      { key: 'autostart', icon: 'boot', label: 'Iniciar com o Windows', value: onOff('autostart'), color: G1, a: () => toggleSetting('autostart'), hints: [['a', 'Alternar']] },
      { key: 'fullscreen', icon: 'screen', label: 'Tela cheia', value: onOff('fullscreen'), color: G2, a: () => toggleSetting('fullscreen'), hints: [['a', 'Alternar']] },
      { key: 'sounds', icon: 'sound', label: 'Sons da interface', value: onOff('sounds'), color: G1, a: () => toggleSetting('sounds'), hints: [['a', 'Alternar']] },
      { key: 'theme', icon: 'theme', label: 'Visual do dashboard', value: THEMES[theme], color: G2, a: () => switchTheme(), hints: [['a', 'Usar ' + THEMES[theme === 'metro' ? 'blades' : 'metro']]] },
      { key: 'hidden', icon: 'eye', label: 'Jogos ocultos', value: fmtNum(hiddenN), color: GRAY, a: () => { if (!hiddenN) { sfx.error(); return; } sfx.select(); sub = 'hidden'; page.focusKey = null; build(); }, hints: [['a', 'Abrir']] },
      { key: 'minimize', icon: 'min', label: 'Minimizar', color: GRAY, a: () => { sfx.select(); has('minimize') ? dash.minimize() : toast('Indisponível neste modo.'); } },
      { key: 'quit', icon: 'exit', label: 'Sair para a área de trabalho', color: GRAY, a: () => { sfx.select(); dash.quit(); } },
      { key: 'shutdown', icon: 'power', label: 'Desligar o PC', color: '#4a4a4a', a: () => { sfx.select(); confirmShutdown(); } },
    ];
    const specs = [{ key: 'profile', x: 0, y: 0, w: PW, h: AREA_H, color: '#2f2f2f', sig: null, render: profileTile }];
    items.forEach((it, i) => specs.push({
      key: it.key, x: PW + GAP + Math.floor(i / 3) * (SW + GAP), y: (i % 3) * (RH + GAP), w: SW, h: RH, color: it.color,
      sig: it.key + (it.value || ''),
      render: () => solidTile({ icon: it.icon, label: it.label, sub: it.value, iconPos: 'left' }),
      a: it.a, hints: it.hints,
    }));
    page.setTiles(specs);
  }
  function buildHidden() {
    const hidden = sortAlpha(state.games.filter((g) => g.hidden));
    if (!hidden.length) { sub = null; page.focusKey = 'hidden'; return build(); }
    page.setHeader('jogos ocultos');
    page.onBack = () => { sub = null; page.focusKey = 'hidden'; build(); };
    page.setTiles(coverGrid(hidden, { y0: 64, keyPrefix: 'h:', actions: (g) => ({ a: () => unhideGame(g), hints: [['a', 'Reexibir']] }) }));
  }
  if (!page.focusKey) page.focusKey = 'autostart';
  on('games', build); on('settings', build); on('profile', build);
  build();
  page.focusKey = 'autostart';
  page.paint(false);
  return page;
}

export { micon };
