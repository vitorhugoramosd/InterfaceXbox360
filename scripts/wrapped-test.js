'use strict';
// Teste do Gaming Wrapped (v3) em node puro, num dataDir descartável.
//   node scripts/wrapped-test.js           -> dados sintéticos (~90 dias) + asserts
//   node scripts/wrapped-test.js --live    -> também roda o monitor real por ~60 s (só leitura)
// O cache de jogos (somente o campo `cache`) é copiado de %APPDATA%\blade-dash\library.json, para
// os topGames terem capa; nada é escrito na pasta real.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const lib = require('../src/main/library');
const W = require('../src/main/library/wrapped');

const MIN = 60000;
const HOUR = 60 * MIN;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bladedash-wrapped-'));
const live = process.argv.includes('--live');

function seedCache() {
  const real = path.join(process.env.APPDATA || '', 'blade-dash', 'library.json');
  let cache = [];
  try {
    cache = JSON.parse(fs.readFileSync(real, 'utf8')).cache || [];
  } catch {}
  fs.writeFileSync(path.join(dataDir, 'library.json'), JSON.stringify({ cache, cacheAt: Date.now() }));
  return cache;
}

// gerador determinístico
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const at = (y, m, d, h, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

/** Minuto a minuto (força bruta) — referência independente para conferir o compute(). */
function brute(sessions, from, to) {
  const hours = new Array(24).fill(0);
  const wd = new Array(7).fill(0);
  const days = new Map();
  let total = 0;
  for (const s of sessions) {
    for (let t = Math.max(s.start, from); t < Math.min(s.end, to); t += MIN) {
      const step = Math.min(MIN, Math.min(s.end, to) - t) / MIN;
      const d = new Date(t);
      hours[d.getHours()] += step;
      wd[d.getDay()] += step;
      const k = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      days.set(k, (days.get(k) || 0) + step);
      total += step;
    }
  }
  const played = [...days.entries()].filter(([, m]) => m >= 1).map(([k]) => k).sort((a, b) => a - b);
  let streak = 0;
  let cur = 0;
  for (let i = 0; i < played.length; i++) {
    const prev = i && new Date(played[i - 1]);
    if (prev) prev.setDate(prev.getDate() + 1);
    cur = i && prev.getTime() === played[i] ? cur + 1 : 1;
    streak = Math.max(streak, cur);
  }
  return { hours, wd, total, daysPlayed: played.length, streak };
}

function show(w) {
  if (!w.hasData) return console.log('  (sem dados)', JSON.stringify(w));
  console.log(`  ${w.label}: ${w.totalMinutes} min em ${w.sessions} sessões, ${w.daysPlayed} dias, ${w.gamesPlayed} jogos, streak ${w.longestStreakDays}`);
  for (const g of w.topGames) console.log(`    ${String(g.minutes).padStart(5)} min ${(g.share * 100).toFixed(0).padStart(3)}%  ${g.name}${g.cover ? ' [capa]' : ''}`);
  console.log(`    maior sessão: ${w.longestSession.name} ${w.longestSession.minutes} min (${new Date(w.longestSession.start).toLocaleString('pt-BR')})`);
  console.log(`    hora favorita ${w.favoriteHour.hour}h (${w.favoriteHour.minutes} min), dia favorito ${w.favoriteWeekday.label}, madrugada ${w.lateNightMinutes} min`);
  console.log(`    dia mais cheio ${new Date(w.busiestDay.date).toLocaleDateString('pt-BR')} (${w.busiestDay.minutes} min); novos: ${w.newGames.map((g) => g.name).join(', ') || '-'}`);
  console.log(`    anterior: ${JSON.stringify(w.previous)}  personalidade: ${JSON.stringify(w.personality)}`);
}

(async () => {
  const cache = seedCache();
  await lib.init({ dataDir });
  const sess = lib._sessions();
  let updates = 0;
  lib.on('sessions-updated', () => updates++);

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const pm = cm === 1 ? 12 : cm - 1;
  const py = cm === 1 ? cy - 1 : cy;
  const lastDayPrev = new Date(cy, cm - 1, 0).getDate();

  // jogos: usa ids reais da biblioteca quando houver (capa), mais um jogo "removido"
  const lib0 = cache.filter((r) => !r.offline).slice(0, 6);
  const games = lib0.map((r) => ({ id: r.id, name: r.name }));
  while (games.length < 6) games.push({ id: 'custom:fake' + games.length, name: 'Jogo Falso ' + games.length });
  const removed = { id: 'steam:999999', name: 'Jogo Removido' };
  const fav = games[0];

  // ---- casos especiais (mês anterior) ----
  const special = [
    // cruza meia-noite: 22:30 -> 01:10
    { g: fav, start: at(py, pm, 10, 22, 30), end: at(py, pm, 11, 1, 10) },
    // maratona de 5 h
    { g: games[1], start: at(py, pm, 18, 14), end: at(py, pm, 18, 19) },
    // pausa de 2 min -> une (20:00-21:00 + 21:02-22:00 = 2 h)
    { g: games[2], start: at(py, pm, 20, 20), end: at(py, pm, 20, 21) },
    { g: games[2], start: at(py, pm, 20, 21, 2), end: at(py, pm, 20, 22) },
    // sessão de 30 s: descartada
    { g: games[3], start: at(py, pm, 21, 20), end: at(py, pm, 21, 20) + 30000 },
    // cruza a virada do mês: 23:00 do último dia -> 01:00 do dia 1
    { g: removed, start: at(py, pm, lastDayPrev, 23), end: at(cy, cm, 1, 1) },
  ];
  const specialDays = new Set([10, 11, 18, 20, 21, lastDayPrev].map((d) => new Date(py, pm - 1, d).toDateString()));
  specialDays.add(new Date(cy, cm - 1, 1).toDateString());

  // ---- ~90 dias aleatórios ----
  const gen = [...special];
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 90; i >= 1; i--) {
    const day = new Date(today0);
    day.setDate(day.getDate() - i);
    if (specialDays.has(day.toDateString()) || rnd() < 0.35) continue;
    const n = rnd() < 0.3 ? 2 : 1;
    let h = rnd() < 0.15 ? 1 : 18 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const g = rnd() < 0.5 ? fav : games[1 + Math.floor(rnd() * 5)];
      const start = day.getTime() + h * HOUR + Math.floor(rnd() * 30) * MIN;
      const dur = (20 + Math.floor(rnd() * 130)) * MIN;
      gen.push({ g, start, end: start + dur });
      h = new Date(start + dur).getHours() + 1;
    }
  }
  gen.sort((a, b) => a.start - b.start);
  for (const s of gen) {
    sess.start(s.g.id, s.g.name, 'detected', s.start);
    sess.seen(s.g.id, s.end);
    sess.close(s.g.id, s.end);
  }

  // ---- sessão que ficou aberta (app fechou): fecha no lastSeen ao "reiniciar" ----
  const openStart = today0.getTime() - 2 * HOUR; // ontem 22h
  lib._store().data.openSessions['custom:open-test'] = { name: 'Sessão Aberta', start: openStart, lastSeen: openStart + 40 * MIN, via: 'dash' };
  sess.recover();

  const all = sess.all();
  console.log(`dataDir: ${dataDir}\n${gen.length} sessões geradas -> ${all.length} gravadas, eventos sessions-updated: ${updates}`);

  // ---- asserts dos casos especiais ----
  const find = (id, start) => all.find((s) => s.gameId === id && s.start === start);
  const merged = find(games[2].id, at(py, pm, 20, 20));
  assert(merged && merged.end === at(py, pm, 20, 22), 'pausa < 3 min deve unir as sessões');
  assert(!all.some((s) => s.gameId === games[3].id && s.start === at(py, pm, 21, 20)), 'sessão < 1 min descartada');
  const rec = find('custom:open-test', openStart);
  assert(rec && rec.end === openStart + 40 * MIN && rec.via === 'dash', 'sessão aberta fecha no lastSeen');
  assert(!Object.keys(lib._store().data.openSessions).length, 'nenhuma sessão aberta sobrando');

  // meia-noite: contribuição por hora
  const mid = W.compute([{ gameId: 'x', name: 'x', start: at(py, pm, 10, 22, 30), end: at(py, pm, 11, 1, 10) }], `${py}-${String(pm).padStart(2, '0')}`);
  assert.deepStrictEqual([mid.hourHistogram[22], mid.hourHistogram[23], mid.hourHistogram[0], mid.hourHistogram[1]], [30, 60, 60, 10]);
  assert.strictEqual(mid.totalMinutes, 160);
  assert.strictEqual(mid.lateNightMinutes, 70);
  assert.strictEqual(mid.daysPlayed, 2);
  assert.strictEqual(mid.longestStreakDays, 2);

  // ---- períodos ----
  const periods = await lib.getWrappedPeriods();
  console.log('\nperíodos:', JSON.stringify(periods));
  const keyCur = `${cy}-${String(cm).padStart(2, '0')}`;
  const keyPrev = `${py}-${String(pm).padStart(2, '0')}`;

  for (const key of [keyCur, keyPrev, String(cy)]) {
    const w = await lib.getWrapped(key);
    console.log(`\n== getWrapped(${key})`);
    show(w);
    const r = W.rangeOf(key);
    const b = brute(all, r.from, r.to);
    assert.strictEqual(w.totalMinutes, Math.round(b.total), key + ': total');
    assert.strictEqual(w.hourHistogram.reduce((a, x) => a + x, 0), w.totalMinutes, key + ': soma das horas');
    assert.strictEqual(w.weekdayHistogram.reduce((a, x) => a + x, 0), w.totalMinutes, key + ': soma dos dias');
    b.hours.forEach((m, h) => assert(Math.abs(w.hourHistogram[h] - m) <= 1, `${key}: hora ${h}`));
    assert.strictEqual(w.daysPlayed, b.daysPlayed, key + ': dias');
    assert.strictEqual(w.longestStreakDays, b.streak, key + ': streak');
  }
  // recorte na virada do mês: 60 min do "Jogo Removido" em cada mês
  const wPrev = await lib.getWrapped(keyPrev);
  const wCur = await lib.getWrapped(keyCur);
  const rm = (w) => (w.topGames.find((g) => g.id === removed.id) || {}).minutes;
  const clipPrev = W.compute(all.filter((s) => s.gameId === removed.id), keyPrev);
  const clipCur = W.compute(all.filter((s) => s.gameId === removed.id), keyCur);
  assert.strictEqual(clipPrev.totalMinutes, 60, 'recorte: 60 min no mês anterior');
  assert.strictEqual(clipCur.totalMinutes, 60, 'recorte: 60 min no mês atual');
  assert(wPrev.longestSession.minutes === 300, 'maratona de 5 h é a maior sessão');
  console.log('\njogo removido no top do mês atual:', rm(wCur), 'min;', 'arte:', JSON.stringify(wCur.topGames.find((g) => g.id === removed.id) || null));

  const seenRes = await lib.markWrappedSeen(keyPrev);
  const p2 = await lib.getWrappedPeriods();
  assert(p2.find((p) => p.key === keyPrev).seen, 'markWrappedSeen');
  console.log('markWrappedSeen:', JSON.stringify(seenRes), '| inválido:', JSON.stringify(await lib.markWrappedSeen('xx')));
  console.log('getWrapped sem dados:', JSON.stringify(await lib.getWrapped('2001-01')), '| inválido:', JSON.stringify(await lib.getWrapped('abc')));
  console.log('\nshape completo (mês anterior):\n' + JSON.stringify(wPrev));
  console.log('\nOK: todos os asserts passaram');

  if (live) {
    const L = lib._launcher();
    console.log('\n== monitor real por ~60 s (checagem a cada 20 s)');
    lib.on('game-state', (s) => console.log('  game-state', JSON.stringify(s)));
    const costs = [];
    for (let i = 0; i < 4; i++) {
      const cpu0 = process.cpuUsage();
      const t0 = Date.now();
      const list = await L.watcher.query();
      const ms = Date.now() - t0;
      const cpu = process.cpuUsage(cpu0);
      costs.push({ ms, nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000), processes: list ? list.length : null });
      await new Promise((r) => setTimeout(r, 15000));
      console.log('  última checagem do monitor:', JSON.stringify(L.lastCheck), '| rodando:', JSON.stringify([...L.running.keys()]));
    }
    console.log('  custo por consulta:', JSON.stringify(costs));
    // CPU do processo PowerShell persistente
    const pid = L.watcher.proc && L.watcher.proc.pid;
    if (pid) {
      const out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}) | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress`]).toString();
      console.log('  PowerShell persistente (pid ' + pid + '):', out.trim());
    }
  }
  lib._dispose();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => {
  console.error('FALHOU:', e && e.stack ? e.stack : e);
  lib._dispose();
  process.exit(1);
});
