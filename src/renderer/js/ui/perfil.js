// Blade "perfil": cartão de jogador, estatísticas, relógio, mais jogado.
import { h, fmtNum, hours, playtime, relTime, sourceLabel, fillAvatar, SOURCES } from './util.js';
import { createCover } from './cover.js';
import { state, on } from '../store.js';
import { sfx } from '../sound.js';
import { launchGame, openGameOptions } from './actions.js';

export function createPerfil() {
  let cards = [], targets = [], idx = 0;

  const avatar = h('div', { class: 'avatar' });
  const nameEl = h('span');
  const stats = h('div', { class: 'gstats' });
  const gcard = h('div', { class: 'gcard', dataset: { theme: 'perfil' } },
    h('div', { class: 'gcard-head' }, nameEl, h('small', { text: 'Cartão de jogador' })),
    h('div', { class: 'gcard-body' }, avatar, stats));
  const plat = h('div', { class: 'plat' });
  const clockT = h('div', { class: 't', dataset: { clock: '' } });
  const clockD = h('div', { class: 'd', dataset: { date: '' } });
  const cardsEl = h('div');
  const pcol = h('div', { class: 'pcol' }, h('div', { class: 'pclock' }, clockT, clockD), cardsEl);
  const el = h('div', { class: 'perfil' }, gcard, plat, pcol);

  const stat = (k, v, cls) => h('div', { class: 'gstat' }, h('span', { text: k }), h('b', { class: cls || '', text: v }));

  function render() {
    const name = state.profile.name || 'Jogador';
    nameEl.textContent = name;
    fillAvatar(avatar, name);
    const all = state.games.filter((g) => !g.hidden);
    const totalMin = all.reduce((s, g) => s + (g.playtimeMinutes || 0), 0);
    const most = all.filter((g) => g.playtimeMinutes > 0).sort((a, b) => b.playtimeMinutes - a.playtimeMinutes)[0] || null;
    const last = all.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed)[0] || null;
    stats.replaceChildren(
      stat('Jogos na biblioteca', fmtNum(all.length)),
      stat('Horas jogadas', hours(totalMin)),
      stat('Favoritos', fmtNum(all.filter((g) => g.favorite).length)),
      stat('Mais jogado', most ? most.name : '—', 'ell'));

    // por plataforma
    const counts = {};
    for (const g of all) counts[g.source] = (counts[g.source] || 0) + 1;
    const max = Math.max(1, ...Object.values(counts));
    const order = Object.keys(SOURCES).filter((s) => counts[s]).sort((a, b) => counts[b] - counts[a]);
    plat.replaceChildren(h('h3', { text: 'Jogos por plataforma' }),
      ...(order.length ? order.map((s) => h('div', { class: 'pbar' },
        h('span', { class: 'nm', text: sourceLabel(s) }),
        h('span', { class: 'tr' }, h('span', { class: 'fl', style: { width: (counts[s] / max * 100) + '%', display: 'block' } })),
        h('span', { class: 'n', text: String(counts[s]) }))) : [h('div', { class: 'pbar', text: 'Nenhum jogo ainda.' })]));

    // cartões focáveis
    targets = [];
    const card = (k, g, meta) => {
      if (!g) return h('div', { class: 'pcard empty', text: k + ': nada por enquanto' });
      const i = targets.length;
      targets.push(g);
      return h('div', { class: 'pcard', dataset: { nav: 'pcard', i } }, createCover(g),
        h('div', {}, h('div', { class: 'pk', text: k }), h('div', { class: 'pn', text: g.name }), h('div', { class: 'pm', text: meta })));
    };
    cards = [];
    cardsEl.replaceChildren(
      card('Mais jogado', most, most ? playtime(most.playtimeMinutes) : ''),
      card('Último jogado', last, last ? (state.running === last.id ? 'Em jogo agora' : 'Jogado ' + relTime(last.lastPlayed)) : ''));
    cards = [...cardsEl.querySelectorAll('.pcard[data-nav]')];
    idx = Math.min(idx, Math.max(0, cards.length - 1));
    paint();
  }
  const paint = () => cards.forEach((c, i) => c.classList.toggle('focus', i === idx));

  function handle(a) {
    switch (a) {
      case 'up': if (idx > 0) { idx--; sfx.move(); paint(); } return true;
      case 'down': if (idx < cards.length - 1) { idx++; sfx.move(); paint(); } return true;
      case 'a': if (targets[idx]) launchGame(targets[idx]); return !!targets[idx];
      case 'x': case 'start': if (targets[idx]) openGameOptions(targets[idx]); return !!targets[idx];
      default: return false;
    }
  }
  const hints = () => targets.length ? [['a', 'Jogar'], ['x', 'Opções'], ['lbrb', 'Trocar blade'], ['guide', 'Guia']] : [['lbrb', 'Trocar blade'], ['guide', 'Guia']];
  function pointer(target, type) {
    const c = target.closest('[data-nav="pcard"]');
    if (!c) return;
    const i = +c.dataset.i;
    if (i !== idx) { idx = i; sfx.move(); paint(); }
    if (type === 'click') launchGame(targets[i]);
  }

  on('games', render);
  on('profile', render);
  on('running', render);
  render();

  return { key: 'perfil', title: 'perfil', theme: 'perfil', el, handle, hints, pointer };
}
