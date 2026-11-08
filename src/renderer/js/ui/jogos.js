// Blade "jogos": menu à esquerda + vitrine (capa em destaque, fundo
// desfocado e fileira/grade de capas).
import { h, put, icon, relTime, playtime, sourceLabel, sortAlpha, fmtNum, clamp } from './util.js';
import { createCover, setCover, lazyObserver, palette } from './cover.js';
import { state, on, visibleGames } from '../store.js';
import { sfx } from '../sound.js';
import { launchGame, toggleFavorite, openGameOptions, addGame, rescan } from './actions.js';
import { glyph } from './hints.js';
import { mouseActive } from '../input.js';
import { caps, confirmInstall, downloadFor, downloadLabel } from '../extras.js';

const BASE_MENU = [
  { key: 'lib',  label: 'Biblioteca de Jogos',  icon: 'lib' },
  { key: 'fav',  label: 'Favoritos',            icon: 'star' },
  { key: 'rec',  label: 'Jogados Recentemente', icon: 'clock' },
  { key: 'uninst', label: 'Não Instalados',     icon: 'download' },
  { key: 'add',  label: 'Adicionar Jogo',       icon: 'plus', action: true },
  { key: 'scan', label: 'Atualizar Biblioteca', icon: 'refresh', action: true },
];
const EMPTY = {
  lib: ['Nenhum jogo na biblioteca.', 'Use “Adicionar Jogo” ou “Atualizar Biblioteca”.'],
  fav: ['Nenhum favorito ainda.', 'Pressione Y em um jogo para favoritá-lo.'],
  rec: ['Nada jogado recentemente.', 'Os jogos que você abrir pelo Blade Dash aparecem aqui.'],
  uninst: ['Nenhum jogo para baixar.', 'Todos os jogos da sua biblioteca Steam já estão instalados.'],
};

export function createJogos() {
  // 'Não Instalados' só aparece se o backend suporta (v2)
  const MENU = BASE_MENU.filter((m) => m.key !== 'uninst' || caps.uninstalled);
  let zone = 'menu';           // 'menu' | 'games'
  let menuIdx = 0;
  let listKey = 'lib';
  let view = 'row';            // 'row' | 'grid'
  let cols = 7;
  const lists = { lib: [], fav: [], rec: [], uninst: [] };
  const pos = { lib: 0, fav: 0, rec: 0, uninst: 0 };
  const focusId = { lib: null, fav: null, rec: null, uninst: null };
  let tiles = [], tileSig = '', focusedTile = null;
  let lazy = null;

  // ---------- DOM
  const menuRows = [];
  const menuEl = h('div', { class: 'menu' });
  MENU.forEach((m, i) => {
    if (m.key === 'add') menuEl.append(h('div', { class: 'sep' }));
    const row = h('div', { class: 'mi', dataset: { nav: 'menu', i, key: m.key } }, icon(m.icon), h('span', { text: m.label }), m.action ? null : h('span', { class: 'cnt' }));
    menuRows.push(row);
    menuEl.append(row);
  });
  const foot = h('div', { class: 'j-foot' });

  const bgEl = h('div', { class: 'sc-bg' });
  let bgKey = null, bgTimer = 0;

  const featCover = createCover(null, { cls: 'feat-cover' });
  featCover.dataset.nav = 'feat';
  const featName = h('div', { class: 'feat-name' });
  const featBadges = h('div', { class: 'feat-badges' });
  const featLast = h('div'), featTime = h('div');
  const featPos = h('div', { class: 'feat-pos' });
  const featCta = h('div', { class: 'feat-cta' }, glyph('a'), h('span', { text: 'Jogar' }), h('span', { style: { width: '18px' } }), glyph('x'), h('span', { text: 'Opções' }));
  const feat = h('div', { class: 'feat' }, featCover,
    h('div', { class: 'feat-info' }, featPos, featName, featBadges, h('div', { class: 'feat-meta' }, featLast, featTime), featCta));
  const listEl = h('div', { class: 'sc-list' });
  const emptyEl = h('div', { class: 'sc-empty', hidden: true });
  const showcase = h('div', { class: 'showcase' }, bgEl, h('div', { class: 'sc-shade' }), h('div', { class: 'sc-floor' }), feat, listEl, emptyEl);

  const el = h('div', { class: 'jogos' }, h('div', { class: 'j-menu' }, menuEl, foot), showcase);

  // ---------- dados
  const cur = () => lists[listKey];
  const curGame = () => cur()[pos[listKey]] || null;

  function computeLists() {
    const vis = visibleGames();
    lists.lib = sortAlpha(vis);
    lists.fav = sortAlpha(vis.filter((g) => g.favorite));
    lists.rec = vis.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
    lists.uninst = sortAlpha(state.uninstalled || []);
    for (const k of Object.keys(lists)) {
      const L = lists[k];
      const i = focusId[k] ? L.findIndex((g) => g.id === focusId[k]) : -1;
      pos[k] = i >= 0 ? i : clamp(pos[k], 0, Math.max(0, L.length - 1));
      focusId[k] = L[pos[k]] ? L[pos[k]].id : null;
    }
    menuRows[0].querySelector('.cnt').textContent = fmtNum(lists.lib.length);
    menuRows[1].querySelector('.cnt').textContent = fmtNum(lists.fav.length);
    menuRows[2].querySelector('.cnt').textContent = fmtNum(lists.rec.length);
    if (rowOf('uninst')) rowOf('uninst').querySelector('.cnt').textContent = fmtNum(lists.uninst.length);
    const hidden = state.games.length - vis.length;
    const total = vis.reduce((s, g) => s + (g.playtimeMinutes || 0), 0);
    put(foot, 
      h('div', {}, h('b', { text: fmtNum(vis.length) }), vis.length === 1 ? ' jogo na biblioteca' : ' jogos na biblioteca'),
      h('div', {}, h('b', { text: fmtNum(Math.round(total / 60)) }), ' horas jogadas'),
      hidden ? h('div', { text: `${hidden} oculto${hidden > 1 ? 's' : ''}` }) : null);
  }

  /** barra de download na miniatura (v2) */
  function paintDl(t, g) {
    const d = downloadFor(g.id);
    let el = t.querySelector('.tdl');
    if (!d) { if (el) el.remove(); return; }
    if (!el) { el = h('div', { class: 'tdl' }, h('span'), h('b', {}, h('i'))); t.append(el); }
    el.firstChild.textContent = downloadLabel(d);
    el.querySelector('i').style.width = Math.round((d.progress || 0) * 100) + '%';
  }
  const rowOf = (key) => menuRows.find((r) => r.dataset.key === key);

  // ---------- render da lista
  function renderList() {
    const L = cur();
    const sig = listKey + ':' + L.map((g) => g.id).join('|');
    if (sig !== tileSig) {
      tileSig = sig;
      if (lazy) lazy.disconnect();
      lazy = lazyObserver(listEl);
      tiles = L.map((g, i) => {
        const t = h('div', { class: 'tile' + (g.favorite ? ' fav' : '') + (state.running === g.id ? ' running' : '') + (listKey === 'uninst' ? ' uninst' : ''), dataset: { nav: 'tile', i } },
          createCover(g, { lazy }), h('div', { class: 'tbadge', text: '★' }), listKey === 'uninst' ? h('div', { class: 'tdown', text: '⬇' }) : null);
        paintDl(t, g);
        return t;
      });
      focusedTile = null;
      listEl.replaceChildren(...tiles);
      listEl.scrollLeft = 0; listEl.scrollTop = 0;
      requestAnimationFrame(() => { computeCols(); scrollToFocus(false); });
    } else {
      // mesma lista: atualiza só capas/estados sem perder a posição
      L.forEach((g, i) => {
        const t = tiles[i];
        setCover(t.firstChild, g, lazy);
        t.classList.toggle('fav', !!g.favorite);
        t.classList.toggle('running', state.running === g.id);
        paintDl(t, g);
      });
    }
    const empty = L.length === 0;
    emptyEl.hidden = !empty;
    showcase.classList.toggle('empty', empty);
    feat.hidden = empty;
    listEl.hidden = empty;
    if (empty) {
      if (state.loading && listKey === 'lib') {
        emptyEl.replaceChildren(h('div', {},
          h('div', { class: 'ring-loader', html: '<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44"/><circle class="seg" cx="50" cy="50" r="44"/><circle class="seg s2" cx="50" cy="50" r="44"/></svg>' }),
          h('div', { text: 'Procurando seus jogos...' }),
          h('div', { class: 'sub', text: 'Steam, Epic, Ubisoft, EA e Xbox' })));
      } else {
        const [a, b] = EMPTY[listKey];
        emptyEl.replaceChildren(h('div', {}, h('div', { text: a }), h('div', { class: 'sub', text: b })));
      }
      if (zone === 'games') zone = 'menu';
    }
    paintFocus(false);
    updateFeatured();
  }

  function computeCols() {
    if (view === 'row' || tiles.length < 2) { cols = Math.max(1, tiles.length); return; }
    const top = tiles[0].offsetTop;
    let c = 1;
    while (c < tiles.length && tiles[c].offsetTop === top) c++;
    cols = c;
  }

  function paintFocus(scroll = true) {
    menuRows.forEach((r, i) => {
      r.classList.toggle('focus', zone === 'menu' && i === menuIdx);
      r.classList.toggle('sel', zone === 'games' && MENU[i].key === listKey);
    });
    const t = tiles[pos[listKey]] || null;
    if (focusedTile && focusedTile !== t) focusedTile.classList.remove('focus', 'cur');
    if (t) {
      t.classList.toggle('focus', zone === 'games');
      t.classList.toggle('cur', zone !== 'games');
    }
    focusedTile = t;
    if (scroll && t) scrollToFocus(true);
  }

  function scrollToFocus(smooth) {
    const t = tiles[pos[listKey]];
    if (!t) return;
    const behavior = smooth ? 'smooth' : 'instant';
    if (view === 'row') {
      const step = t.offsetWidth + 22;
      listEl.scrollTo({ left: Math.max(0, t.offsetLeft - 40 - step), behavior });
    } else {
      const step = t.offsetHeight + 30;
      listEl.scrollTo({ top: Math.max(0, t.offsetTop - 28 - step * 0.5), behavior });
    }
  }

  // ---------- destaque
  function updateFeatured() {
    const g = curGame();
    if (!g) return;
    setCover(featCover, g);
    featCover.style.animation = 'none'; void featCover.offsetWidth; featCover.style.animation = '';
    featName.textContent = g.name;
    put(featBadges, 
      h('span', { class: 'badge ' + g.source, text: sourceLabel(g.source) }),
      g.favorite ? h('span', { class: 'badge fav', text: '★ Favorito' }) : null,
      state.running === g.id ? h('span', { class: 'badge run', text: '● Em jogo' }) : null);
    const un = listKey === 'uninst';
    featCta.children[1].textContent = un ? 'Baixar' : 'Jogar';
    for (const i of [2, 3, 4]) featCta.children[i].style.display = un ? 'none' : '';
    if (un) {
      const d = downloadFor(g.id);
      featBadges.append(h('span', { class: 'badge custom', text: 'Não instalado' }));
      featLast.replaceChildren(h('span', { class: 'k', text: 'Estado: ' }), d ? downloadLabel(d) : 'disponível para baixar');
      featTime.replaceChildren(h('span', { class: 'k', text: 'Pressione A para baixar pela Steam' }));
    } else {
      featLast.replaceChildren(h('span', { class: 'k', text: 'Jogado pela última vez: ' }), g.lastPlayed ? relTime(g.lastPlayed) : 'nunca');
      featTime.replaceChildren(h('span', { class: 'k', text: 'Tempo de jogo: ' }), playtime(g.playtimeMinutes));
    }
    featPos.textContent = `${pos[listKey] + 1} de ${cur().length}`;
    clearTimeout(bgTimer);
    bgTimer = setTimeout(() => setBackdrop(g), 140);
  }

  function setBackdrop(g) {
    const url = g.hero || g.cover || null;
    const key = url || 'grad:' + g.name;
    if (key === bgKey) return;
    bgKey = key;
    const show = (node) => {
      if (bgKey !== key) return;
      bgEl.append(node);
      void node.offsetWidth;
      node.classList.add('on');
      const olds = [...bgEl.children].filter((c) => c !== node);
      setTimeout(() => olds.forEach((o) => o.remove()), 700);
    };
    if (url) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => show(img);
      img.onerror = () => show(gradEl(g));
      img.src = url;
    } else show(gradEl(g));
  }
  function gradEl(g) {
    const p = palette(g.name);
    return h('div', { class: 'sc-grad', style: { background: `radial-gradient(80% 90% at 25% 30%, ${p.c}, transparent 70%), linear-gradient(150deg, ${p.a}, ${p.b})` } });
  }

  // ---------- navegação
  function setMenu(i) {
    if (i < 0 || i >= MENU.length || i === menuIdx) return false;
    menuIdx = i;
    sfx.move();
    const m = MENU[i];
    if (!m.action && m.key !== listKey) { listKey = m.key; renderList(); }
    paintFocus(false);
    return true;
  }
  function enterGames() {
    if (!cur().length) return false;
    zone = 'games';
    sfx.move();
    paintFocus();
    updateFeatured();
    return true;
  }
  function toMenu(sound = true) {
    zone = 'menu';
    const mi = MENU.findIndex((m) => m.key === listKey);
    menuIdx = mi;
    if (sound) sfx.back();
    paintFocus(false);
  }
  function moveTo(i) {
    const L = cur();
    i = clamp(i, 0, L.length - 1);
    if (i === pos[listKey]) return false;
    pos[listKey] = i;
    focusId[listKey] = L[i].id;
    sfx.move();
    paintFocus();
    updateFeatured();
    return true;
  }
  function toggleView() {
    view = view === 'row' ? 'grid' : 'row';
    showcase.classList.toggle('grid', view === 'grid');
    sfx.toggle();
    requestAnimationFrame(() => { computeCols(); scrollToFocus(false); });
  }

  function handle(a, meta) {
    if (a === 'back') { toggleView(); return true; }
    if (zone === 'menu') {
      switch (a) {
        case 'up': setMenu(menuIdx - 1); return true;
        case 'down': setMenu(menuIdx + 1); return true;
        case 'right': return enterGames() || false;
        case 'a': {
          const m = MENU[menuIdx];
          if (m.key === 'add') { sfx.select(); addGame(); }
          else if (m.key === 'scan') { sfx.select(); rescan(); }
          else if (!enterGames()) sfx.error();
          return true;
        }
        default: return false;
      }
    }
    const L = cur(), p = pos[listKey], g = L[p];
    switch (a) {
      case 'left':
        if (view === 'row' ? p > 0 : p % cols > 0) moveTo(p - 1);
        else if (!meta.repeat) { toMenu(false); sfx.move(); }
        return true;
      case 'right':
        if (p >= L.length - 1 || (view === 'grid' && p % cols === cols - 1)) return false;
        moveTo(p + 1); return true;
      case 'up':
        if (view === 'grid' && p - cols >= 0) moveTo(p - cols);
        return true;
      case 'down':
        if (view === 'grid') {
          if (p + cols < L.length) moveTo(p + cols);
          else if (Math.floor(p / cols) < Math.floor((L.length - 1) / cols)) moveTo(L.length - 1);
        }
        return true;
      case 'a': if (listKey === 'uninst') confirmInstall(g); else launchGame(g); return true;
      case 'b': toMenu(); return true;
      case 'x': case 'start': if (listKey !== 'uninst') openGameOptions(g); return true;
      case 'y': if (listKey !== 'uninst') toggleFavorite(g); return true;
      default: return false;
    }
  }

  function hints() {
    if (zone === 'menu') {
      const m = MENU[menuIdx];
      return [['a', m.action ? 'Selecionar' : 'Abrir'], ['back', view === 'row' ? 'Grade' : 'Fileira'], ['lbrb', 'Trocar blade'], ['guide', 'Guia']];
    }
    const g = curGame();
    if (listKey === 'uninst') return [['a', 'Baixar'], ['b', 'Voltar'], ['back', view === 'row' ? 'Grade' : 'Fileira'], ['lbrb', 'Trocar blade'], ['guide', 'Guia']];
    return [['a', 'Jogar'], ['b', 'Voltar'], ['x', 'Opções'], ['y', g && g.favorite ? 'Desfavoritar' : 'Favoritar'], ['back', view === 'row' ? 'Grade' : 'Fileira'], ['lbrb', 'Trocar blade'], ['guide', 'Guia']];
  }

  function pointer(target, type) {
    const nav = target.closest('[data-nav]');
    if (!nav) return;
    const kind = nav.dataset.nav;
    if (kind === 'menu') {
      const i = +nav.dataset.i;
      if (zone !== 'menu') { zone = 'menu'; menuIdx = -1; }
      setMenu(i);
      if (type === 'click') handle('a', {});
    } else if (kind === 'tile') {
      const i = +nav.dataset.i;
      if (zone !== 'games') { zone = 'games'; paintFocus(false); }
      if (i !== pos[listKey]) {
        pos[listKey] = i; focusId[listKey] = cur()[i].id;
        sfx.move(); paintFocus(false); updateFeatured();
      }
      if (type === 'click') { if (listKey === 'uninst') confirmInstall(cur()[i]); else launchGame(cur()[i]); }
    } else if (kind === 'feat' && type === 'click') {
      launchGame(curGame());
    }
  }

  // roda do mouse rola a fileira/grade movendo o foco
  let wheelT = 0;
  listEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const t = performance.now();
    if (t - wheelT < 70) return;
    wheelT = t;
    if (zone !== 'games') { zone = 'games'; }
    const d = (e.deltaY || e.deltaX) > 0 ? 1 : -1;
    moveTo(pos[listKey] + d * (view === 'grid' ? cols : 1));
  }, { passive: false });

  window.addEventListener('resize', () => requestAnimationFrame(computeCols));

  on('games', () => { computeLists(); renderList(); });
  on('uninstalled', () => { computeLists(); renderList(); });
  on('downloads', () => { renderList(); if (listKey === 'uninst' || zone === 'games') updateFeatured(); });
  on('loading', () => renderList());
  on('running', () => renderList());

  computeLists();
  renderList();

  return {
    key: 'jogos', title: 'jogos', theme: 'jogos', el,
    handle, hints, pointer,
    onEnter() { paintFocus(false); },
    /** foca um jogo específico (ex.: recém-adicionado) */
    focusGame(id) {
      listKey = 'lib'; computeLists();
      const i = lists.lib.findIndex((g) => g.id === id);
      if (i >= 0) { pos.lib = i; focusId.lib = id; }
      renderList();
      zone = lists.lib.length ? 'games' : 'menu';
      paintFocus(); updateFeatured();
    },
  };
}
