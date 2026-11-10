// v3: Gaming Wrapped — retrospectiva mensal/anual em "stories".
// Dados: dash.getWrappedPeriods / getWrapped / markWrappedSeen / onSessionsUpdated.
// O visualizador é um overlay de tela cheia compartilhado pelos dois temas.
import { dash, has } from './api.js';
import { state, emit } from './store.js';
import { h, fmtNum, sourceLabel } from './ui/util.js';
import { createCover, palette } from './ui/cover.js';
import { pushModal, closeModal, openMenu } from './ui/modal.js';
import { sfx } from './sound.js';
import { app } from './app.js';

export const wrappedCaps = () => has('getWrappedPeriods') && has('getWrapped');

state.wrappedPeriods = [];

/* ------------------------------------------------------------- dados */
export async function loadWrappedPeriods() {
  if (!wrappedCaps()) return;
  try {
    const l = await dash.getWrappedPeriods();
    state.wrappedPeriods = Array.isArray(l) ? l : [];
  } catch (e) { console.error(e); state.wrappedPeriods = []; }
  emit('wrapped', state.wrappedPeriods);
}
/** Período completo ainda não visto (o mais recente) */
export const unseenWrapped = () => state.wrappedPeriods.find((p) => p.complete && !p.seen) || null;

let reloadT = 0;
export function initWrapped() {
  if (!wrappedCaps()) return;
  loadWrappedPeriods();
  if (has('onSessionsUpdated')) dash.onSessionsUpdated(() => { clearTimeout(reloadT); reloadT = setTimeout(loadWrappedPeriods, 1500); });
}

/* --------------------------------------------------------- formatos */
export function hm(min) {
  min = Math.round(min || 0);
  const h_ = Math.floor(min / 60), m = min % 60;
  if (!h_) return `${m} min`;
  if (h_ >= 100) return `${fmtNum(h_)} h`;
  return m ? `${h_} h ${m} min` : `${h_} h`;
}
const hoursTxt = (min) => {
  const v = (min || 0) / 60;
  return (v < 10 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : fmtNum(Math.round(v))) + ' h';
};
const monthOf = (label) => String(label || '').split(' de ')[0];
const WD_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WD_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dm = (ms) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(ms));
const hhmm = (ms) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const wdOf = (ms) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(ms));

/** Título de chamada do período ("de outubro" / "de 2026") */
export const wrappedCallout = (p) => (p.period === 'year' ? `de ${p.label}` : `de ${monthOf(p.label)}`);

/** Equivalência divertida para o tempo total */
function equivalence(min) {
  const opts = [];
  if (min >= 24 * 60) opts.push(`isso é ${fmtNum(Math.floor(min / 1440))} ${Math.floor(min / 1440) === 1 ? 'dia inteiro' : 'dias inteiros'} sem parar`);
  if (min >= 240) opts.push(`dá pra assistir ${fmtNum(Math.round(min / 120))} filmes`);
  if (min >= 90) opts.push(`equivale a ${fmtNum(Math.round(min / 95))} partidas de futebol com acréscimos`);
  if (!opts.length) opts.push(`dá pra ouvir ${Math.max(1, Math.round(min / 3.5))} músicas`);
  return opts[Math.floor(min) % opts.length];
}

/* ------------------------------------------------------- seletor */
/** Seletor de período em menu (usado no tema Blades e como fallback) */
export async function openWrappedPicker() {
  if (!wrappedCaps()) return;
  await loadWrappedPeriods();
  const list = state.wrappedPeriods;
  if (!list.length) { openWrapped(null); return; }
  openMenu({
    theme: 'perfil', title: 'Gaming Wrapped', sub: 'Escolha o período',
    items: list.map((p) => ({
      label: p.label + (p.complete ? '' : ' · parcial') + (p.complete && !p.seen ? ' · novo' : ''),
      value: hoursTxt(p.minutes), icon: p.period === 'year' ? 'star' : 'clock',
      onSelect: () => openWrapped(p.key),
    })),
  });
}

/* ------------------------------------------------------ visualizador */
const SLIDE_MS = 7000;

export async function openWrapped(key) {
  sfx.open();
  const root = h('div', { class: 'wv' });
  const bars = h('div', { class: 'wv-bars' });
  const stage = h('div', { class: 'wv-stage' });
  const pauseEl = h('div', { class: 'wv-pause', text: 'pausado' });
  const brand = h('div', { class: 'wv-brand' }, h('span', { class: 'wv-dot' }), 'Gaming Wrapped');
  root.append(stage, bars, brand, pauseEl);
  stage.append(slideLoading());

  let slides = [], idx = -1, t0 = 0, elapsed = 0, paused = false, alive = true, raf = 0, data = null, seenSent = false;

  const m = {
    el: root, veil: true, blocking: true,
    handle(a, meta = {}) {
      if (a === 'a' || a === 'right' || a === 'rb') go(idx + 1, 1);
      else if (a === 'left' || a === 'lb') go(idx - 1, -1);
      else if (a === 'b') { if (meta.key === 'Escape' || idx <= 0) close(); else go(idx - 1, -1); }
      else if (a === 'x' || a === 'start') togglePause();
      return true;
    },
    pointer() {},
    hints: () => [['a', idx >= slides.length - 1 ? 'Fechar' : 'Próximo'], ['b', idx <= 0 ? 'Fechar' : 'Anterior'], ['x', paused ? 'Continuar' : 'Pausar'], ['lbrb', 'Navegar']],
    onClose: () => { alive = false; cancelAnimationFrame(raf); document.body.classList.remove('wrapped-open'); },
  };
  document.body.classList.add('wrapped-open');
  pushModal(m);
  app.refreshHints();

  // clique: metade direita avança, esquerda volta
  root.addEventListener('click', (e) => {
    const r = root.getBoundingClientRect();
    if (e.clientX - r.left > r.width / 2) go(idx + 1, 1); else go(idx - 1, -1);
  });

  function close() {
    if (!alive) return;
    sfx.close();
    m.blocking = false;
    closeModal(m);
    app.refreshHints();
  }
  function togglePause() {
    paused = !paused;
    if (!paused) t0 = performance.now() - elapsed;
    root.classList.toggle('paused', paused);
    sfx.toggle();
    app.refreshHints();
  }

  // carrega os dados
  try {
    if (key) data = await dash.getWrapped(key);
  } catch (e) { console.error(e); }
  if (!alive) return;
  slides = buildSlides(data);
  bars.replaceChildren(...slides.map(() => h('span', {}, h('i'))));
  go(0, 1, true);
  loop();

  function go(i, dir, first = false) {
    if (!slides.length) return;
    if (i < 0) { if (!first) sfx.back(); i = 0; }
    if (i >= slides.length) { close(); return; }
    if (i === idx) { t0 = performance.now(); elapsed = 0; return; }
    const prev = stage.lastElementChild; // o slide atual é sempre o último inserido
    idx = i;
    const el = slides[i]();
    el.classList.add(dir < 0 ? 'from-left' : 'from-right');
    stage.append(el);
    void el.offsetWidth;
    el.classList.add('on');
    if (prev) {
      prev.classList.remove('on');
      prev.classList.add(dir < 0 ? 'out-right' : 'out-left');
      setTimeout(() => prev.remove(), 600);
    }
    countUp(el, () => alive);
    if (!first) sfx.blade(dir);
    t0 = performance.now(); elapsed = 0;
    [...bars.children].forEach((b, j) => {
      b.classList.toggle('done', j < i);
      b.firstChild.style.transform = j < i ? 'scaleX(1)' : 'scaleX(0)';
    });
    // chegou ao resumo: marca como visto
    if (i === slides.length - 1 && data && data.hasData && key && !seenSent) {
      seenSent = true;
      if (has('markWrappedSeen')) Promise.resolve(dash.markWrappedSeen(key)).then(loadWrappedPeriods).catch(console.error);
    }
    app.refreshHints();
  }

  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (paused || idx < 0) return;
    elapsed = performance.now() - t0;
    const p = Math.min(1, elapsed / SLIDE_MS);
    const bar = bars.children[idx];
    if (bar) bar.firstChild.style.transform = `scaleX(${p})`;
    if (p >= 1 && idx < slides.length - 1) go(idx + 1, 1);
  }
}

/* ------------------------------------------------- animação de números */
const FMT = {
  int: (v) => fmtNum(Math.round(v)),
  hm: (v) => hm(v),
  h: (v) => hoursTxt(v),
  pct: (v) => Math.round(v) + '%',
};
function countUp(root, alive) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count, fmt = FMT[el.dataset.fmt || 'int'] || FMT.int;
    const delay = +(el.dataset.delay || 300), D = 1300;
    el.textContent = fmt(0);
    const start = performance.now() + delay;
    const step = (t) => {
      if (!alive()) return;
      const p = Math.max(0, Math.min(1, (t - start) / D));
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------- slides */
const count = (to, fmt, delay, cls = '') => h('span', { class: 'cnt ' + cls, dataset: { count: Math.round(to || 0), fmt, delay } });
/** Elemento com revelação escalonada */
const rv = (d, el) => { el.classList.add('rv'); el.style.setProperty('--d', d + 'ms'); return el; };

function slideBase(theme, ...kids) {
  return h('section', { class: 'ws ' + theme },
    h('div', { class: 'ws-bg' }),
    h('div', { class: 'ws-blob b1' }), h('div', { class: 'ws-blob b2' }), h('div', { class: 'ws-blob b3' }),
    h('div', { class: 'ws-body' }, ...kids));
}
/** Fundo com o hero do jogo, bem tingido */
function heroBg(g, theme) {
  const s = slideBase(theme);
  const url = g && (g.hero || g.cover);
  if (url) {
    const img = h('img', { class: 'ws-hero', alt: '', decoding: 'async' });
    img.onload = () => img.classList.add('ok');
    img.onerror = () => img.remove();
    img.src = url;
    s.querySelector('.ws-bg').append(img);
  } else if (g) {
    const p = palette(g.name);
    s.querySelector('.ws-bg').style.background = `linear-gradient(140deg, ${p.a}, ${p.b})`;
  }
  return s;
}
const coverOf = (g, cls = '') => {
  // newGames/longestSession não trazem a origem: completa com o jogo da biblioteca
  const lib = state.games.find((x) => x.id === g.id);
  const c = createCover({ name: g.name, source: g.source || (lib && lib.source) || '', cover: g.cover || (lib && lib.cover) || null }); c.classList.add(...(cls ? cls.split(' ') : [])); return c; };

function slideLoading() {
  return h('section', { class: 'ws t-intro on' }, h('div', { class: 'ws-bg' }),
    h('div', { class: 'ws-body center' }, h('div', { class: 'ws-kicker', text: 'preparando sua retrospectiva...' })));
}

function buildSlides(w) {
  const name = (state.profile && state.profile.name) || 'Jogador';
  if (!w || !w.hasData) {
    return [() => slideBase('t-intro', h('div', { class: 'ws-center' },
      rv(0, h('div', { class: 'ws-kicker', text: w && w.label ? w.label : 'Gaming Wrapped' })),
      rv(200, h('h1', { class: 'ws-title', text: 'Ainda não tem nada por aqui' })),
      rv(450, h('p', { class: 'ws-lead', text: 'Jogue um pouco e volte aqui — o Blade Dash registra seu tempo de jogo automaticamente.' }))))];
  }
  const S = [];
  const top = w.topGames || [];
  const g1 = top[0];
  const periodWord = w.period === 'year' ? 'ano' : 'mês';

  // 1. intro
  S.push(() => slideBase('t-intro', h('div', { class: 'ws-center' },
    rv(0, h('div', { class: 'ws-kicker', text: `${name}, chegou a hora` })),
    rv(200, h('h1', { class: 'ws-mega' }, 'Seu Gaming', h('br'), 'Wrapped')),
    rv(500, h('div', { class: 'ws-pill', text: w.label + (w.complete ? '' : ' · até agora') })),
    rv(800, h('p', { class: 'ws-lead', text: `Bora ver o que rolou no seu ${periodWord} de jogatina?` })))));

  // 2. tempo total
  if (w.totalMinutes > 0) {
    const prev = w.previous;
    const delta = prev && prev.deltaPct != null ? Math.round(prev.deltaPct) : null;
    S.push(() => slideBase('t-time', h('div', { class: 'ws-left' },
      rv(0, h('div', { class: 'ws-kicker', text: `Neste ${periodWord} você jogou` })),
      rv(150, h('div', { class: 'ws-huge' }, count(w.totalMinutes, 'hm', 350))),
      rv(700, h('p', { class: 'ws-lead', text: equivalence(w.totalMinutes) + '.' })),
      rv(1000, h('div', { class: 'ws-stats' },
        h('div', {}, count(w.sessions, 'int', 1100), h('small', { text: 'sessões' })),
        h('div', {}, count(w.daysPlayed, 'int', 1200), h('small', { text: 'dias com jogatina' })),
        h('div', {}, count(w.gamesPlayed, 'int', 1300), h('small', { text: w.gamesPlayed === 1 ? 'jogo' : 'jogos diferentes' })))),
      delta != null ? rv(1500, h('div', { class: 'ws-delta ' + (delta >= 0 ? 'up' : 'down'), text: `${delta >= 0 ? '+' : ''}${delta}% que ${monthOf(prev.label)}` })) : null)));
  }

  // 3. jogo nº 1
  if (g1) {
    S.push(() => {
      const s = heroBg(g1, 't-top1');
      s.querySelector('.ws-body').append(h('div', { class: 'ws-split' },
        rv(200, coverOf(g1, 'ws-cover big')),
        h('div', {},
          rv(0, h('div', { class: 'ws-kicker', text: 'Seu jogo nº 1' })),
          rv(300, h('h1', { class: 'ws-title', text: g1.name })),
          rv(600, h('div', { class: 'ws-big' }, count(g1.minutes, 'hm', 700))),
          rv(900, h('p', { class: 'ws-lead' }, count((g1.share || 0) * 100, 'pct', 1000, 'hl'), ' do seu tempo de jogo')),
          rv(1200, h('div', { class: 'ws-pill', text: `${fmtNum(g1.sessions || 0)} sessões · ${sourceLabel(g1.source)}` })))));
      return s;
    });
  }

  // 4. top 5
  if (top.length > 1) {
    const max = Math.max(...top.map((g) => g.minutes || 0), 1);
    S.push(() => slideBase('t-top5', h('div', { class: 'ws-left wide' },
      rv(0, h('div', { class: 'ws-kicker', text: 'Seu top ' + top.length })),
      h('div', { class: 'ws-rank' }, top.map((g, i) => rv(200 + i * 180, h('div', { class: 'wr-row' },
        h('span', { class: 'wr-n', text: String(i + 1) }),
        coverOf(g, 'wr-cover'),
        h('div', { class: 'wr-main' },
          h('div', { class: 'wr-name', text: g.name }),
          h('div', { class: 'wr-bar' }, h('i', { style: { '--w': ((g.minutes || 0) / max * 100) + '%' } }))),
        h('span', { class: 'wr-h', text: hoursTxt(g.minutes) }))))))));
  }

  // 5. maior maratona
  const ls = w.longestSession;
  if (ls && ls.minutes > 0) {
    S.push(() => {
      const s = heroBg(ls, 't-marathon');
      s.querySelector('.ws-body').append(h('div', { class: 'ws-left' },
        rv(0, h('div', { class: 'ws-kicker', text: 'Sua maior maratona' })),
        rv(250, h('div', { class: 'ws-huge' }, count(ls.minutes, 'hm', 400))),
        rv(700, h('h2', { class: 'ws-sub', text: `de ${ls.name}, sem largar o controle` })),
        ls.start ? rv(1000, h('div', { class: 'ws-pill', text: `${wdOf(ls.start)}, ${dm(ls.start)} · ${hhmm(ls.start)} → ${ls.end ? hhmm(ls.end) : '?'}` })) : null,
        rv(1300, h('p', { class: 'ws-lead', text: ls.minutes >= 300 ? 'Alguém lembrou de beber água?' : 'Foco total. Respeito.' }))));
      return s;
    });
  }

  // 6. horário favorito (relógio radial)
  const hist = Array.isArray(w.hourHistogram) && w.hourHistogram.length === 24 ? w.hourHistogram : null;
  if (hist && w.favoriteHour) {
    const fh = w.favoriteHour.hour;
    const late = w.lateNightMinutes || 0;
    const night = fh >= 22 || fh < 5;
    S.push(() => slideBase('t-hour', h('div', { class: 'ws-split' },
      rv(100, radialClock(hist, fh)),
      h('div', {},
        rv(0, h('div', { class: 'ws-kicker', text: 'Seu horário nobre' })),
        rv(300, h('h1', { class: 'ws-mega', text: `${fh}h` })),
        rv(600, h('p', { class: 'ws-lead', text: night ? 'Quando todo mundo dorme, você está no jogo.' : fh < 12 ? 'Gamer madrugador: o café vem com controle na mão.' : 'Nada como uma jogatina no meio do dia.' })),
        late >= 60 || late > w.totalMinutes * 0.1 ? rv(900, h('div', { class: 'ws-callout' }, h('b', { text: hm(late) }), ' jogados entre meia-noite e 5h. Corujão confirmado.')) : null))));
  }

  // 7. dia favorito + sequência
  const wh = Array.isArray(w.weekdayHistogram) && w.weekdayHistogram.length === 7 ? w.weekdayHistogram : null;
  if (wh && w.favoriteWeekday) {
    const maxd = Math.max(...wh, 1);
    const fd = w.favoriteWeekday.day;
    S.push(() => slideBase('t-week', h('div', { class: 'ws-left wide' },
      rv(0, h('div', { class: 'ws-kicker', text: 'Seu dia de jogar' })),
      rv(200, h('h1', { class: 'ws-title', text: (w.favoriteWeekday.label || WD_LONG[fd]) })),
      rv(400, h('div', { class: 'ws-week' }, wh.map((v, i) => h('div', { class: 'wk' + (i === fd ? ' on' : '') },
        h('i', { style: { '--h': (v / maxd * 100) + '%', '--d': (500 + i * 80) + 'ms' } }), h('span', { text: WD_SHORT[i] }))))),
      rv(900, h('div', { class: 'ws-stats' },
        w.longestStreakDays > 1 ? h('div', {}, count(w.longestStreakDays, 'int', 1000), h('small', { text: 'dias seguidos jogando' })) : null,
        w.busiestDay && w.busiestDay.minutes ? h('div', {}, h('span', { class: 'cnt', text: hm(w.busiestDay.minutes) }), h('small', { text: `no dia mais intenso (${dm(w.busiestDay.date)})` })) : null)))));
  }

  // 8. novos jogos
  const ng = w.newGames || [];
  if (ng.length) {
    S.push(() => slideBase('t-new', h('div', { class: 'ws-left wide' },
      rv(0, h('div', { class: 'ws-kicker', text: 'Território novo' })),
      rv(200, h('h1', { class: 'ws-title' }, `Você começou `, count(ng.length, 'int', 300, 'hl'), ng.length === 1 ? ' jogo novo' : ' jogos novos')),
      h('div', { class: 'ws-covers' }, ng.slice(0, 8).map((g, i) => rv(500 + i * 120, coverOf(g, 'ws-cover')))))));
  }

  // 9. personalidade
  const pers = w.personality;
  if (pers && pers.title) {
    S.push(() => slideBase('t-pers', h('div', { class: 'ws-center' },
      rv(0, h('div', { class: 'ws-kicker', text: 'Seu perfil de jogador é...' })),
      rv(700, h('div', { class: 'ws-card' },
        h('div', { class: 'wc-glow' }),
        h('h1', { class: 'ws-title', text: pers.title }),
        h('p', { class: 'ws-lead', text: pers.desc || '' }))))));
  }

  // 10. resumo
  S.push(() => slideBase('t-sum', h('div', { class: 'ws-summary' },
    h('div', { class: 'wsum-head' }, h('span', { class: 'wv-dot' }), h('b', { text: 'Gaming Wrapped' }), h('span', { text: w.label })),
    h('div', { class: 'wsum-grid' },
      g1 ? rv(100, coverOf(g1, 'ws-cover sum')) : h('div'),
      h('div', { class: 'wsum-info' },
        rv(200, h('div', { class: 'wsum-k', text: 'Tempo total' })),
        rv(250, h('div', { class: 'wsum-v big', text: hm(w.totalMinutes) })),
        rv(350, h('div', { class: 'wsum-k', text: 'Top jogos' })),
        rv(400, h('ol', { class: 'wsum-top' }, top.slice(0, 3).map((g) => h('li', {}, h('span', { text: g.name }), h('b', { text: hoursTxt(g.minutes) }))))),
        h('div', { class: 'wsum-row' },
          w.favoriteHour ? rv(500, h('div', {}, h('div', { class: 'wsum-k', text: 'Horário nobre' }), h('div', { class: 'wsum-v', text: w.favoriteHour.hour + 'h' }))) : null,
          rv(550, h('div', {}, h('div', { class: 'wsum-k', text: 'Sessões' }), h('div', { class: 'wsum-v', text: fmtNum(w.sessions || 0) }))),
          pers ? rv(600, h('div', {}, h('div', { class: 'wsum-k', text: 'Perfil' }), h('div', { class: 'wsum-v', text: pers.title }))) : null))),
    h('div', { class: 'wsum-foot', text: `${name} · Blade Dash` }))));
  return S;
}

/** Relógio radial de 24 h (SVG) com a hora favorita destacada */
function radialClock(hist, fav) {
  const max = Math.max(...hist, 1);
  const R0 = 120, R1 = 300, C = 330;
  const parts = [`<circle cx="${C}" cy="${C}" r="${R0 - 14}" class="rc-face"/>`];
  hist.forEach((v, hr) => {
    const a = (hr / 24) * Math.PI * 2 - Math.PI / 2;
    const len = 8 + (v / max) * (R1 - R0);
    const x1 = C + Math.cos(a) * R0, y1 = C + Math.sin(a) * R0;
    const x2 = C + Math.cos(a) * (R0 + len), y2 = C + Math.sin(a) * (R0 + len);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="rc-bar${hr === fav ? ' on' : ''}" style="--d:${300 + hr * 35}ms"/>`);
    if (hr % 6 === 0) {
      const lx = C + Math.cos(a) * (R0 - 40), ly = C + Math.sin(a) * (R0 - 40);
      parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + 10).toFixed(1)}" class="rc-lbl">${hr}h</text>`);
    }
  });
  const el = h('div', { class: 'ws-clock' });
  el.innerHTML = `<svg viewBox="0 0 ${C * 2} ${C * 2}">${parts.join('')}</svg>`;
  return el;
}
