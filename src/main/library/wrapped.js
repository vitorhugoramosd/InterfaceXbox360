'use strict';
// "Gaming Wrapped": retrospectiva por mês ("YYYY-MM") e ano ("YYYY"), em horário local.
// Todas as sessões são recortadas em [from, to). Minutos são somados por hora real do relógio
// (sessão 22:30–01:10 -> 30 min às 22h, 60 às 23h, 60 às 0h, 10 à 1h, nos dias certos).
// Arredondamento: os totais são arredondados uma vez e os histogramas pelo método do maior resto,
// então sum(hourHistogram) === sum(weekdayHistogram) === totalMinutes.
//
// Personalidade (primeira regra que bate, nesta ordem):
//   corujao        >= 30% dos minutos entre 0h e 5h
//   maratonista    maior sessão >= 4 h  OU  média por sessão >= 2 h
//   fiel           jogo mais jogado >= 60% dos minutos
//   explorador     >= 6 jogos diferentes
//   fim-de-semana  >= 60% dos minutos no sábado/domingo
//   casual         nenhuma das anteriores

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const PERSONALITIES = {
  corujao: { title: 'Corujão', desc: 'O controle só esquenta depois da meia-noite.' },
  maratonista: { title: 'Maratonista', desc: 'Uma partidinha rápida? Você não conhece isso.' },
  fiel: { title: 'Fiel', desc: 'Achou o seu jogo e não larga por nada.' },
  explorador: { title: 'Explorador', desc: 'Biblioteca grande é pra ser usada: um jogo novo atrás do outro.' },
  'fim-de-semana': { title: 'Guerreiro de fim de semana', desc: 'Sábado e domingo são sagrados: é dia de jogar.' },
  casual: { title: 'Casual', desc: 'Joga quando dá vontade, sem pressa e sem culpa.' },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Faixa local [from, to) de uma chave. null se inválida. */
function rangeOf(key) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(key || ''));
  if (!m) return null;
  const year = +m[1];
  if (m[2]) {
    const month = +m[2];
    if (month < 1 || month > 12) return null;
    return {
      key: `${year}-${pad2(month)}`,
      period: 'month',
      year,
      month,
      from: new Date(year, month - 1, 1).getTime(),
      to: new Date(year, month, 1).getTime(),
      label: `${MONTHS[month - 1]} de ${year}`,
    };
  }
  return { key: String(year), period: 'year', year, from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime(), label: String(year) };
}

function previousKey(r) {
  if (r.period === 'year') return String(r.year - 1);
  const d = new Date(r.year, r.month - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function dayStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextHour(t) {
  const d = new Date(t);
  d.setMinutes(60, 0, 0); // próxima hora cheia local
  return d.getTime();
}

/** Chama cb(inicioDoTrecho, minutos) para cada trecho de [s, e) dentro de uma hora do relógio. */
function eachHour(s, e, cb) {
  let t = s;
  while (t < e) {
    const n = Math.min(nextHour(t), e);
    if (n <= t) break;
    cb(t, (n - t) / 60000);
    t = n;
  }
}

/** Arredonda um vetor para inteiros que somam exatamente `total` (maior resto). */
function roundTo(arr, total) {
  const fl = arr.map(Math.floor);
  let rest = total - fl.reduce((a, b) => a + b, 0);
  const order = arr.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) fl[order[k][1]]++;
  for (let k = order.length - 1; rest < 0 && k >= 0; k--, rest++) if (fl[order[k][1]] > 0) fl[order[k][1]]--;
  return fl;
}

function clip(sessions, from, to) {
  const out = [];
  for (const s of sessions) {
    const a = Math.max(s.start, from);
    const b = Math.min(s.end, to);
    if (b > a) out.push({ ...s, start: a, end: b, origStart: s.start });
  }
  return out;
}

/** Minutos totais por chave de período (meses e anos). */
function periodTotals(sessions) {
  const tot = new Map();
  for (const s of sessions) {
    let t = s.start;
    while (t < s.end) {
      const d = new Date(t);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const e = Math.min(nextMonth, s.end);
      const min = (e - t) / 60000;
      const mk = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const yk = String(d.getFullYear());
      tot.set(mk, (tot.get(mk) || 0) + min);
      tot.set(yk, (tot.get(yk) || 0) + min);
      t = e;
    }
  }
  return tot;
}

function periods(sessions, seenKeys, now = Date.now()) {
  const tot = periodTotals(sessions);
  const seen = new Set(seenKeys || []);
  const out = [];
  for (const [key, min] of tot) {
    if (min < 1) continue;
    const r = rangeOf(key);
    const p = { key: r.key, period: r.period, year: r.year, label: r.label, minutes: Math.round(min), complete: r.to <= now, seen: seen.has(r.key) };
    if (r.period === 'month') p.month = r.month;
    p._from = r.from;
    out.push(p);
  }
  // mais recente primeiro (pelo início); o ano vem depois dos meses dele
  out.sort((a, b) => b._from - a._from || (a.period === 'month' ? -1 : 1));
  return out.map(({ _from, ...p }) => p);
}

function pickPersonality(w) {
  const total = w.totalMinutes || 1;
  const weekend = (w.weekdayHistogram[0] + w.weekdayHistogram[6]) / total;
  const topShare = w.topGames[0] ? w.topGames[0].share : 0;
  const avg = w.sessions ? w.totalMinutes / w.sessions : 0;
  let key = 'casual';
  if (w.lateNightMinutes / total >= 0.3) key = 'corujao';
  else if ((w.longestSession && w.longestSession.minutes >= 240) || avg >= 120) key = 'maratonista';
  else if (topShare >= 0.6) key = 'fiel';
  else if (w.gamesPlayed >= 6) key = 'explorador';
  else if (weekend >= 0.6) key = 'fim-de-semana';
  return { key, ...PERSONALITIES[key] };
}

/**
 * @param sessions [{gameId,name,start,end}]
 * @param key "YYYY-MM" | "YYYY"
 * @param art (id) => { name, cover, hero, source } | null   (jogo ainda na biblioteca)
 */
function compute(sessions, key, art = () => null, now = Date.now()) {
  const r = rangeOf(key);
  if (!r) return { hasData: false, label: String(key || '') };
  const cs = clip(sessions, r.from, r.to);
  const rawTotal = cs.reduce((a, s) => a + (s.end - s.start) / 60000, 0);
  if (rawTotal < 1) return { hasData: false, label: r.label };

  const hours = new Array(24).fill(0);
  const wdays = new Array(7).fill(0);
  const days = new Map(); // dayStart -> min
  const games = new Map(); // id -> { minutes, sessions, name }
  let late = 0;
  let longest = null;
  for (const s of cs) {
    const min = (s.end - s.start) / 60000;
    const g = games.get(s.gameId) || { minutes: 0, sessions: 0, name: s.name };
    g.minutes += min;
    g.sessions++;
    games.set(s.gameId, g);
    if (!longest || min > longest.min) longest = { s, min };
    eachHour(s.start, s.end, (t, m) => {
      const d = new Date(t);
      const h = d.getHours();
      hours[h] += m;
      wdays[d.getDay()] += m;
      if (h < 5) late += m;
      const ds = dayStart(t);
      days.set(ds, (days.get(ds) || 0) + m);
    });
  }
  const totalMinutes = Math.round(rawTotal);
  const hourHistogram = roundTo(hours, totalMinutes);
  const weekdayHistogram = roundTo(wdays, totalMinutes);

  const info = (id, fallbackName) => {
    const a = art(id);
    return {
      id,
      name: (a && a.name) || fallbackName || id,
      cover: a ? a.cover || null : null,
      hero: a ? a.hero || null : null,
      source: (a && a.source) || String(id).split(':')[0],
    };
  };

  const topGames = [...games.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 5)
    .map(([id, g]) => ({ ...info(id, g.name), minutes: Math.round(g.minutes), sessions: g.sessions, share: g.minutes / rawTotal }));

  // sequência de dias seguidos com >= 1 min
  const playedDays = [...days.entries()].filter(([, m]) => m >= 1).map(([d]) => d).sort((a, b) => a - b);
  let streak = 0;
  let cur = 0;
  let prev = null;
  for (const d of playedDays) {
    if (prev !== null) {
      const nx = new Date(prev);
      nx.setDate(nx.getDate() + 1);
      cur = nx.getTime() === d ? cur + 1 : 1;
    } else cur = 1;
    streak = Math.max(streak, cur);
    prev = d;
  }
  let busiest = null;
  for (const [d, m] of days) if (!busiest || m > busiest.m) busiest = { d, m };

  const favH = hourHistogram.indexOf(Math.max(...hourHistogram));
  const favD = weekdayHistogram.indexOf(Math.max(...weekdayHistogram));

  // primeira sessão de cada jogo (em todo o histórico)
  const first = new Map();
  for (const s of sessions) if (!first.has(s.gameId) || s.start < first.get(s.gameId).start) first.set(s.gameId, s);
  const newGames = [...first.values()]
    .filter((s) => s.start >= r.from && s.start < r.to)
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      const i = info(s.gameId, s.name);
      return { id: i.id, name: i.name, cover: i.cover };
    });

  let previous = null;
  const pr = rangeOf(previousKey(r));
  const prevMin = clip(sessions, pr.from, pr.to).reduce((a, s) => a + (s.end - s.start) / 60000, 0);
  if (prevMin >= 1) {
    const pm = Math.round(prevMin);
    previous = { label: pr.label, totalMinutes: pm, deltaPct: Math.round(((totalMinutes - pm) / pm) * 100) };
  }

  const li = info(longest.s.gameId, longest.s.name);
  const w = {
    key: r.key,
    period: r.period,
    label: r.label,
    from: r.from,
    to: r.to,
    complete: r.to <= now,
    hasData: true,
    totalMinutes,
    sessions: cs.length,
    daysPlayed: playedDays.length,
    gamesPlayed: games.size,
    topGames,
    longestSession: { id: li.id, name: li.name, cover: li.cover, hero: li.hero, minutes: Math.round(longest.min), start: longest.s.start, end: longest.s.end },
    favoriteHour: { hour: favH, minutes: hourHistogram[favH] },
    hourHistogram,
    favoriteWeekday: { day: favD, label: WEEKDAYS[favD], minutes: weekdayHistogram[favD] },
    weekdayHistogram,
    longestStreakDays: streak,
    busiestDay: { date: busiest.d, minutes: Math.round(busiest.m) },
    lateNightMinutes: Math.round(late),
    newGames,
    previous,
  };
  w.personality = pickPersonality(w);
  return w;
}

module.exports = { compute, periods, rangeOf, roundTo, eachHour, PERSONALITIES };
