// Tema Metro: os pivôs (início, jogos, recentes, plataformas, loja, configurações).
// Cada pivô é um TilePage alimentado pelos dados reais do store.
import { h, relTime, playtime, hours, fmtNum, sortAlpha, sourceLabel, fillAvatar, SOURCES, fmtBytes, dateDM } from '../ui/util.js';
import { caps, confirmInstall, loadStorage, loadOffers, offersStale, openOffer, offerDetails, downloadsSummary } from '../extras.js';
import { state, on, visibleGames } from '../store.js';
import { launchGame, toggleFavorite, openGameOptions, addGame, rescan, confirmShutdown, toggleSetting, switchTheme, unhideGame, THEMES, currentTheme } from '../ui/actions.js';
import { dash, has } from '../api.js';
import { sfx } from '../sound.js';
import { toast } from '../ui/toast.js';
import { TilePage, AREA_H, GAP } from './page.js';
import { solidTile, imageTile, coverTile, artLayer, gameSig, micon, dlBar } from './tiles.js';

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
function coverGrid(games, { x0 = 0, y0 = 0, rows = 2, keyPrefix = 'g:', actions = gameActions, uninst = false } = {}) {
  const th = Math.floor((AREA_H - y0 - GAP * (rows - 1)) / rows);
  const tw = Math.round(th * 2 / 3);
  return games.map((g, i) => ({
    key: keyPrefix + g.id,
    x: x0 + Math.floor(i / rows) * (tw + GAP), y: y0 + (i % rows) * (th + GAP), w: tw, h: th,
    sig: (uninst ? 'u' : '') + gameSig(g), cls: 'cover',
    render: (lazy) => coverTile(g, lazy, { uninst }),
    ...actions(g),
  }));
}

const uninstActions = (g) => ({ a: () => confirmInstall(g), hints: [['a', 'Baixar']] });
/** Grade de jogos não instalados (capas esmaecidas + seta de download) */
const uninstGrid = (list, opts = {}) => coverGrid(sortAlpha(list), { ...opts, keyPrefix: 'u:', actions: uninstActions, uninst: true });
/** Largura ocupada por uma grade de capas de 2 linhas */
const gridWidth = (n, y0 = 0) => { const th = Math.floor((AREA_H - y0 - GAP) / 2); return Math.ceil(n / 2) * (Math.round(th * 2 / 3) + GAP); };

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
    const dl = state.downloads[0];
    if (dl) {
      const sum = downloadsSummary();
      specs.push({ key: 'r1', x: xR, y: 0, w: R, h: RH, sig: 'dl' + dl.id + dl.state + Math.round((dl.progress || 0) * 100) + sum.count,
        render: () => h('div', { class: 'mt-image' }, artLayer({ name: dl.name, cover: dl.cover, hero: null }, true), h('div', { class: 'mt-grad full' }),
          h('div', { class: 'mt-label' }, h('div', { class: 'mt-name', text: (dl.state === 'updating' ? 'Atualizando: ' : 'Baixando: ') + dl.name }),
            sum.count > 1 ? h('div', { class: 'mt-sub', text: `+${sum.count - 1} na fila` }) : null),
          dlBar(dl.id, { detail: true })),
        a: () => toast(sum.count > 1 ? `${sum.count} downloads em andamento — acompanhe na Steam` : `Baixando ${dl.name} pela Steam`),
        hints: [['a', 'Detalhes']] });
    } else if (r1) specs.push({ key: 'r1', x: xR, y: 0, w: R, h: RH, sig: 'r1' + gameSig(r1), render: () => imageTile(r1, {}), ...gameActions(r1) });
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

  on('games', build); on('running', build); on('loading', build); on('downloads', build);
  build();
  page.focusKey = 'feat';
  return page;
}

/* ================================ jogos ================================ */
export function createJogosPivot() {
  const page = new TilePage({ key: 'jogos', title: 'jogos' });
  const TH = Math.floor((AREA_H - GAP) / 2), TW = Math.round(TH * 2 / 3);
  const AH = Math.floor((AREA_H - 2 * GAP) / 3);   // blocos de ação: 3 empilhados
  let sub = null;
  function build() {
    if (sub === 'uninst') return buildUninst();
    page.setHeader('');
    page.onBack = null;
    const games = sortAlpha(visibleGames());
    const actH = caps.uninstalled ? AH : TH;
    const specs = [
      { key: 'add', x: 0, y: 0, w: TW, h: actH, color: G1, sig: 'add' + actH, render: () => solidTile({ icon: 'plus', label: 'Adicionar Jogo' }), a: () => { sfx.select(); addGame(); } },
      { key: 'scan', x: 0, y: actH + GAP, w: TW, h: actH, color: G2, sig: 'scan' + state.loading + actH, render: () => solidTile({ icon: 'refresh', label: state.loading ? 'Atualizando...' : 'Atualizar Biblioteca' }), a: () => { sfx.select(); rescan(); } },
    ];
    if (caps.uninstalled) {
      const n = state.uninstalled.length;
      specs.push({ key: 'uninst', x: 0, y: 2 * (AH + GAP), w: TW, h: AH, color: GRAY, sig: 'uninst' + n,
        render: () => solidTile({ icon: 'download', label: `Não instalados (${fmtNum(n)})` }),
        a: () => { sfx.select(); sub = 'uninst'; page.focusKey = null; build(); }, hints: [['a', 'Abrir']] });
    }
    if (games.length) specs.push(...coverGrid(games, { x0: TW + GAP }));
    else if (state.loading) specs.push(loadingTile(TW + GAP, 0, TW * 2 + GAP, TH));
    else specs.push({ key: 'none', x: TW + GAP, y: 0, w: TW * 2 + GAP, h: TH, color: GRAY, sig: 'none', render: () => solidTile({ icon: 'search', label: 'Nenhum jogo encontrado', sub: 'Use Atualizar Biblioteca ou Adicionar Jogo.' }) });
    // enquanto o usuário não entrou no pivô, o foco inicial fica no primeiro jogo (não no botão)
    if (!page.active && games.length && (!page.focusKey || ['add', 'scan', 'uninst', 'loading', 'none'].includes(page.focusKey))) {
      page.focusKey = 'g:' + games[0].id;
      page.tx = 0;
    }
    page.setTiles(specs);
  }
  function buildUninst() {
    page.setHeader('não instalados');
    page.onBack = () => { sub = null; page.focusKey = 'uninst'; build(); };
    const list = state.uninstalled;
    page.setTiles(list.length ? uninstGrid(list, { y0: 64 })
      : [{ key: 'none', x: 0, y: 64, w: 560, h: 300, color: GRAY, sig: 'none-u', render: () => solidTile({ icon: 'download', label: 'Nenhum jogo para baixar', sub: 'Todos os jogos da sua biblioteca Steam já estão instalados.' }) }]);
  }
  on('games', build); on('running', build); on('loading', build); on('uninstalled', build); on('downloads', build);
  build();
  page.focusGame = (id) => { if (sub) { sub = null; build(); } page.focus('g:' + id); };
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
  on('games', build); on('running', build); on('downloads', build);
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
      const specs = games.length ? coverGrid(games, { y0: 64 }) : [{ key: 'none', x: 0, y: 64, w: 560, h: 300, color: GRAY, sig: 'none', render: () => solidTile({ label: 'Nenhum jogo instalado desta plataforma' }) }];
      const un = state.uninstalled.filter((g) => g.source === sub);
      if (un.length) {
        const x0 = games.length ? gridWidth(games.length, 64) + GAP * 4 : 560 + GAP * 5;
        const lw = 210;
        specs.push({ key: 'sep-u', x: x0, y: 64, w: lw, h: AREA_H - 64, color: GRAY, sig: 'sepu' + un.length,
          render: () => solidTile({ icon: 'download', label: 'Não instalados', sub: `${fmtNum(un.length)} na sua biblioteca` }),
          a: () => { const f = page.tiles.find((t) => t.key.startsWith('u:')); if (f) page.focus(f.key, { sound: true }); }, hints: [['a', 'Ver']] });
        specs.push(...uninstGrid(un, { y0: 64, x0: x0 + lw + GAP }));
      }
      page.setTiles(specs);
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
  on('games', build); on('running', build); on('loading', build); on('uninstalled', build); on('downloads', build);
  build();
  return page;
}

/* ================================= loja ================================= */
export function createLoja() {
  const page = new TilePage({ key: 'loja', title: 'loja' });
  const TH = Math.floor((AREA_H - GAP) / 2);
  const CW = 230, EW = 460, SW = 560;
  let loaded = false;
  page.onActivate = () => { if (!loaded) { loaded = true; loadOffers(false); } };
  const refresh = () => { sfx.select(); loadOffers(true); };
  const commonY = { fav: refresh };

  function offerTile(o) {
    return h('div', { class: 'mt-offer' },
      h('div', { class: 'mo-img' }, artLayer({ name: o.name, cover: null, hero: o.image }, true)),
      o.owned ? h('div', { class: 'mt-run', text: 'na biblioteca' }) : null,
      h('div', { class: 'mo-info' },
        h('div', { class: 'mo-name', text: o.name }),
        h('div', { class: 'mo-price' },
          o.discount ? h('span', { class: 'mo-disc', text: `-${o.discount}%` }) : null,
          h('span', { class: 'mo-vals' },
            o.originalText && o.discount ? h('s', { text: o.originalText }) : null,
            h('b', { text: o.priceText || '' })))));
  }
  function epicTile(e) {
    const until = e.current ? 'até ' + dateDM(e.endDate) : 'a partir de ' + dateDM(e.startDate);
    return h('div', { class: 'mt-image mt-epic' + (e.current ? '' : ' soon') },
      artLayer({ name: e.title, cover: null, hero: e.image }, true), h('div', { class: 'mt-grad full' }),
      h('div', { class: 'me-k', text: e.current ? 'Grátis na Epic' : 'Em breve' }),
      h('div', { class: 'mt-label big' }, h('div', { class: 'mt-name', text: e.title }), h('div', { class: 'mt-sub', text: until })));
  }

  function build() {
    const o = state.offers;
    const status = state.offersStatus;
    const stale = offersStale() && o && (o.steam || []).length;
    page.setHeader(stale ? 'sem conexão — mostrando ofertas salvas' : '');
    const y0 = stale ? 64 : 0;
    const th = Math.floor((AREA_H - y0 - GAP) / 2);
    const upd = status === 'loading' ? 'Carregando...' : o && o.fetchedAt ? 'atualizado ' + relTime(o.fetchedAt).replace('agora mesmo', 'agora') : '';
    const specs = [
      { key: 'refresh', x: 0, y: y0, w: CW, h: th, color: G1, sig: 'ref' + upd,
        render: () => solidTile({ icon: 'refresh', label: 'Atualizar ofertas', sub: upd }), a: refresh, hints: [['a', 'Atualizar']], ...commonY },
      { key: 'steamstore', x: 0, y: y0 + th + GAP, w: CW, h: th, color: '#2a5b84', sig: 'ss',
        render: () => solidTile({ icon: 'tag', label: 'Promoções da Steam' }), a: () => openOffer('https://store.steampowered.com/specials', 'a loja da Steam'), hints: [['a', 'Abrir'], ['y', 'Atualizar']], ...commonY },
    ];
    let x = CW + GAP;
    if (!o && status !== 'error') {
      // esqueleto enquanto carrega
      for (let i = 0; i < 8; i++) specs.push({ key: 'sk' + i, x: x + Math.floor(i / 2) * (SW + GAP), y: y0 + (i % 2) * (th + GAP), w: SW, h: th, cls: 'skeleton', sig: 'sk', render: () => h('div') });
    } else if (status === 'error' && !(o && ((o.steam || []).length || (o.epicFree || []).length))) {
      specs.push({ key: 'err', x, y: y0, w: SW, h: th, color: GRAY, sig: 'err',
        render: () => solidTile({ icon: 'search', label: 'Não foi possível carregar as ofertas', sub: (o && o.error) || 'Verifique a conexão. Pressione A para tentar de novo.' }),
        a: refresh, hints: [['a', 'Tentar de novo']] });
    } else {
      const epic = [...(o.epicFree || [])].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
      epic.forEach((e, i) => specs.push({
        key: 'e' + i, x: x + Math.floor(i / 2) * (EW + GAP), y: y0 + (i % 2) * (th + GAP), w: EW, h: th, cls: e.current ? '' : 'dim',
        sig: 'e' + e.title + e.current, render: () => epicTile(e),
        a: () => openOffer(e.url, 'a Epic Games Store'), hints: [['a', 'Abrir na Epic'], ['y', 'Atualizar']], ...commonY,
      }));
      if (epic.length) x += Math.ceil(epic.length / 2) * (EW + GAP);
      (o.steam || []).forEach((of, i) => specs.push({
        key: 'o' + of.appid, x: x + Math.floor(i / 2) * (SW + GAP), y: y0 + (i % 2) * (th + GAP), w: SW, h: th, color: '#2b2b2b',
        sig: 'o' + of.appid + of.discount + of.priceText + of.owned, render: () => offerTile(of),
        a: () => openOffer('steam:' + of.appid, 'na Steam'), opts: () => offerDetails(of), ...commonY,
        hints: [['a', 'Abrir na Steam'], ['x', 'Detalhes'], ['y', 'Atualizar']],
      }));
    }
    page.setTiles(specs);
    if (!page.active && page.focusKey === 'refresh') {
      const first = specs.find((t) => t.key.startsWith('e') || t.key.startsWith('o'));
      if (first) { page.focusKey = first.key; page.paint(false); }
    }
  }
  on('offers', build);
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
    if (sub === 'storage') return buildStorage();
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
      { key: 'storage', icon: 'disk', label: 'Armazenamento', color: G1, custom: storageTile, sig: 'st' + storageSig(),
        a: () => { sfx.select(); sub = 'storage'; page.focusKey = null; loadStorage(); build(); }, hints: [['a', 'Abrir']] },
      { key: 'minimize', icon: 'min', label: 'Minimizar', color: GRAY, a: () => { sfx.select(); has('minimize') ? dash.minimize() : toast('Indisponível neste modo.'); } },
      { key: 'quit', icon: 'exit', label: 'Sair para a área de trabalho', color: GRAY, a: () => { sfx.select(); dash.quit(); } },
      { key: 'shutdown', icon: 'power', label: 'Desligar o PC', color: '#4a4a4a', a: () => { sfx.select(); confirmShutdown(); } },
    ];
    const specs = [{ key: 'profile', x: 0, y: 0, w: PW, h: AREA_H, color: '#2f2f2f', sig: null, render: profileTile }];
    items.forEach((it, i) => specs.push({
      key: it.key, x: PW + GAP + Math.floor(i / 3) * (SW + GAP), y: (i % 3) * (RH + GAP), w: SW, h: RH, color: it.color,
      sig: it.sig || it.key + (it.value || ''),
      render: it.custom || (() => solidTile({ icon: it.icon, label: it.label, sub: it.value, iconPos: 'left' })),
      a: it.a, hints: it.hints,
    }));
    page.setTiles(specs);
  }
  // --- armazenamento
  const mainDrive = () => {
    const l = state.storage || [];
    return l.find((d) => /^c:/i.test(d.drive)) || l[0] || null;
  };
  const storageSig = () => { const d = mainDrive(); return d ? d.drive + d.free + d.total : String(state.storage && state.storage.length); };
  function bar(d) {
    const used = d.total - d.free, games = Math.min(used, d.gamesBytes || 0);
    const pct = (v) => (d.total > 0 ? (v / d.total * 100).toFixed(2) + '%' : '0');
    return h('div', { class: 'm-dbar' }, h('i', { class: 'g', style: { width: pct(games) } }), h('i', { class: 'o', style: { width: pct(used - games) } }));
  }
  function storageTile() {
    const d = mainDrive();
    return h('div', { class: 'mt-solid ico-left' }, micon('disk'),
      h('div', { class: 'mt-label' },
        h('div', { text: 'Armazenamento' }),
        h('div', { class: 'mt-sub', text: d ? `${d.drive} ${fmtBytes(d.free)} livres de ${fmtBytes(d.total)}` : caps.storage ? (state.storage ? 'Sem informação de disco' : 'Carregando...') : 'Indisponível nesta versão' }),
        d ? bar(d) : null));
  }
  function driveTile(d) {
    const used = d.total - d.free, games = Math.min(used, d.gamesBytes || 0);
    return h('div', { class: 'mt-drive' },
      h('div', { class: 'md-head' }, h('span', { class: 'md-letter', text: d.drive }), h('span', { class: 'md-label', text: d.label || 'Disco local' })),
      h('div', { class: 'md-free', text: `${fmtBytes(d.free)} livres de ${fmtBytes(d.total)}` }),
      bar(d),
      h('div', { class: 'md-legend' },
        h('span', { class: 'g' }, `jogos ${fmtBytes(games)}`), h('span', { class: 'o' }, `outros ${fmtBytes(used - games)}`), h('span', { class: 'f' }, `livre ${fmtBytes(d.free)}`)),
      h('div', { class: 'md-list' }, (d.games || []).length
        ? [...d.games].sort((a, b) => b.bytes - a.bytes).slice(0, 9).map((g) => h('div', { class: 'md-row' }, h('span', { text: g.name }), h('b', { text: fmtBytes(g.bytes) })))
        : h('div', { class: 'md-row empty', text: 'Nenhum jogo neste disco' })));
  }
  function buildStorage() {
    page.setHeader('armazenamento');
    page.onBack = () => { sub = null; page.focusKey = 'storage'; build(); };
    const l = state.storage;
    if (!l) { page.setTiles([{ ...loadingTile(0, 64, 520, 300, 'lendo os discos...') }]); return; }
    if (!l.length) { page.setTiles([{ key: 'none', x: 0, y: 64, w: 560, h: 300, color: GRAY, sig: 'nost', render: () => solidTile({ icon: 'disk', label: 'Informação de disco indisponível' }) }]); return; }
    page.setTiles(l.map((d, i) => ({ key: 'd:' + d.drive, x: i * (520 + GAP), y: 64, w: 520, h: AREA_H - 64, color: '#2f2f2f',
      sig: JSON.stringify([d.drive, d.free, d.total, d.gamesBytes, (d.games || []).length]), render: () => driveTile(d), hints: [] })));
  }
  page.onActivate = () => { if (!state.storage) loadStorage(); };

  function buildHidden() {
    const hidden = sortAlpha(state.games.filter((g) => g.hidden));
    if (!hidden.length) { sub = null; page.focusKey = 'hidden'; return build(); }
    page.setHeader('jogos ocultos');
    page.onBack = () => { sub = null; page.focusKey = 'hidden'; build(); };
    page.setTiles(coverGrid(hidden, { y0: 64, keyPrefix: 'h:', actions: (g) => ({ a: () => unhideGame(g), hints: [['a', 'Reexibir']] }) }));
  }
  if (!page.focusKey) page.focusKey = 'autostart';
  on('games', build); on('settings', build); on('profile', build); on('storage', build);
  build();
  page.focusKey = 'autostart';
  page.paint(false);
  return page;
}

export { micon };
