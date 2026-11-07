// Blade "recentes": blocos grandes dos 6 últimos jogos jogados.
import { h, relTime, playtime, sourceLabel } from './util.js';
import { createCover, palette } from './cover.js';
import { state, on, visibleGames } from '../store.js';
import { sfx } from '../sound.js';
import { launchGame, toggleFavorite, openGameOptions } from './actions.js';

const COLS = 3, MAX = 6;

export function createRecentes() {
  let list = [], tiles = [], idx = 0, sig = '';
  const grid = h('div', { class: 'rec-grid' });
  const empty = h('div', { class: 'rec-empty', hidden: true },
    h('div', {}, h('div', { text: 'Você ainda não jogou nada por aqui.' }),
      h('div', { class: 'sub', text: 'Escolha um jogo na blade Jogos — os últimos 6 aparecem aqui.' })));
  const el = h('div', { class: 'recentes' }, grid, empty);

  function bgFor(g) {
    const p = palette(g.name);
    const wrap = h('div', { class: 'r-bg' }, h('div', { class: 'grad', style: { '--pa': p.a, '--pb': p.b } }));
    const url = g.hero || g.cover;
    if (url) {
      const img = h('img', { alt: '', decoding: 'async', class: g.hero ? '' : 'blur' });
      img.onload = () => img.classList.add('ok');
      img.onerror = () => img.remove();
      img.src = url;
      wrap.append(img);
    }
    return wrap;
  }

  function render() {
    const prevId = list[idx] && list[idx].id;
    list = visibleGames().filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, MAX);
    const nsig = list.map((g) => [g.id, g.cover, g.hero, g.name, g.lastPlayed, g.favorite, g.playtimeMinutes].join('~')).join('|') + state.running;
    if (nsig === sig) return;
    sig = nsig;
    tiles = list.map((g, i) => h('div', { class: 'rtile', dataset: { nav: 'rtile', i } },
      bgFor(g),
      h('div', { class: 'r-shade' }),
      h('div', { class: 'r-rank', text: String(i + 1) }),
      h('span', { class: 'badge ' + g.source, text: sourceLabel(g.source) }),
      createCover(g),
      h('div', { class: 'r-info' },
        h('div', { class: 'r-name', text: (g.favorite ? '★ ' : '') + g.name }),
        h('div', { class: 'r-meta' },
          state.running === g.id ? h('div', { text: '● Em jogo agora' }) : h('div', { text: 'Jogado ' + relTime(g.lastPlayed) }),
          h('div', { text: playtime(g.playtimeMinutes) })))));
    grid.replaceChildren(...tiles);
    empty.hidden = list.length > 0;
    const j = list.findIndex((g) => g.id === prevId);
    idx = j >= 0 ? j : Math.min(idx, Math.max(0, list.length - 1));
    paint();
  }
  const paint = () => tiles.forEach((t, i) => t.classList.toggle('focus', i === idx));
  const move = (i) => { if (i === idx || i < 0 || i >= list.length) return false; idx = i; sfx.move(); paint(); return true; };

  function handle(a) {
    const g = list[idx];
    const col = idx % COLS;
    switch (a) {
      case 'left': return col > 0 ? (move(idx - 1), true) : false;
      case 'right': return col < COLS - 1 && idx + 1 < list.length ? (move(idx + 1), true) : false;
      case 'up': if (idx - COLS >= 0) move(idx - COLS); return true;
      case 'down': if (idx + COLS < list.length) move(idx + COLS); return true;
      case 'a': if (g) launchGame(g); return !!g;
      case 'x': case 'start': if (g) openGameOptions(g); return !!g;
      case 'y': if (g) toggleFavorite(g); return !!g;
      default: return false;
    }
  }
  function hints() {
    if (!list.length) return [['lbrb', 'Trocar blade'], ['guide', 'Guia']];
    const g = list[idx];
    return [['a', 'Jogar'], ['x', 'Opções'], ['y', g && g.favorite ? 'Desfavoritar' : 'Favoritar'], ['lbrb', 'Trocar blade'], ['guide', 'Guia']];
  }
  function pointer(target, type) {
    const t = target.closest('[data-nav="rtile"]');
    if (!t) return;
    const i = +t.dataset.i;
    move(i);
    if (type === 'click') launchGame(list[i]);
  }

  on('games', render);
  on('running', () => { sig = ''; render(); });
  render();

  // atualiza "há X minutos" de tempos em tempos
  setInterval(() => { sig = ''; render(); }, 60000);

  return { key: 'recentes', title: 'recentes', theme: 'recentes', el, handle, hints, pointer, onEnter: () => { idx = 0; paint(); } };
}
