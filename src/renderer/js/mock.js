// Mock de window.dash para desenvolver no navegador comum.
// Mesma API assíncrona do preload. Jogos fictícios; algumas capas são SVG
// geradas (data:), outras null (testa a capa gerada) e uma quebrada (onerror).
// Use ?many=1 na URL para +200 jogos (teste de desempenho) e ?empty=1 para
// começar com a biblioteca vazia (testa "Procurando seus jogos...").
// v2: ?nodl=1 sem downloads; ?offline=1 ofertas antigas com erro; ?offersfail=1 falha total.

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const GB = 1024 ** 3;

function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Arte de capa fictícia em SVG (retrato 600x900) */
function coverArt(name, hue, style = 0) {
  const words = name.toUpperCase().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 11) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  const text = lines.map((l, i) => `<text x="300" y="${700 + i * 74 - (lines.length - 1) * 37}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="900" font-size="70" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="3" paint-order="stroke">${esc(l)}</text>`).join('');
  const art = [
    `<circle cx="300" cy="330" r="190" fill="hsl(${hue + 30},90%,65%)" opacity=".9"/><circle cx="300" cy="330" r="130" fill="hsl(${hue},80%,30%)"/><path d="M0 560 L160 420 L260 500 L400 360 L600 540 L600 900 L0 900Z" fill="hsl(${hue - 20},60%,12%)"/>`,
    `<path d="M0 900 L300 140 L600 900Z" fill="hsl(${hue + 40},85%,55%)" opacity=".85"/><path d="M80 900 L300 300 L520 900Z" fill="hsl(${hue},70%,18%)"/><circle cx="460" cy="160" r="60" fill="#fff" opacity=".8"/>`,
    `${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 70 - 20}" y="${120 + (i % 3) * 60}" width="44" height="${380 - (i % 4) * 50}" fill="hsl(${hue + i * 6},80%,${40 + (i % 3) * 10}%)" opacity=".85"/>`).join('')}<rect y="520" width="600" height="380" fill="hsl(${hue},60%,10%)"/>`,
    `<g opacity=".9">${Array.from({ length: 7 }, (_, i) => `<circle cx="300" cy="360" r="${40 + i * 38}" fill="none" stroke="hsl(${hue + i * 12},90%,${55 + i * 3}%)" stroke-width="10"/>`).join('')}</g>`,
  ][style % 4];
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${hue + 50},70%,8%)"/></linearGradient></defs>
    <rect width="600" height="900" fill="url(#g)"/>${art}${text}</svg>`);
}

/** Arte larga (hero) */
function heroArt(hue) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620" viewBox="0 0 1920 620">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,60%)"/><stop offset="1" stop-color="hsl(${hue + 40},70%,12%)"/></linearGradient></defs>
    <rect width="1920" height="620" fill="url(#s)"/>
    <circle cx="1400" cy="230" r="150" fill="hsl(${hue + 30},100%,80%)" opacity=".85"/>
    <path d="M0 450 L300 300 L520 400 L800 220 L1100 420 L1400 330 L1920 470 L1920 620 L0 620Z" fill="hsl(${hue - 10},50%,15%)"/>
    <path d="M0 520 L400 430 L900 520 L1300 450 L1920 540 L1920 620 L0 620Z" fill="hsl(${hue - 20},40%,7%)"/></svg>`);
}

function seed() {
  const now = Date.now();
  const G = (id, source, name, o = {}) => ({
    id: `${source}:${id}`, source, name,
    cover: null, hero: null, installDir: `C:\\Jogos\\${name}`,
    lastPlayed: null, playtimeMinutes: 0, favorite: false, hidden: false, addedAt: now - 90 * DAY,
    sizeBytes: Math.round((2 + (id.length * 7919 + name.length * 104729) % 120) * GB * 0.97),
    drive: name.length % 3 === 0 ? 'C:' : 'D:',
    ...o,
  });
  return [
    G('1001', 'steam', 'Horizonte Vermelho', { cover: coverArt('Horizonte Vermelho', 8, 0), hero: heroArt(10), lastPlayed: now - 2 * DAY, playtimeMinutes: 754, favorite: true }),
    G('1002', 'steam', 'Cidade de Neon', { lastPlayed: now - 5 * HOUR, playtimeMinutes: 1230 }),
    G('abc', 'epic', 'Lendas do Vale', { cover: coverArt('Lendas do Vale', 130, 1), favorite: true }),
    G('55', 'ubisoft', 'Assassino das Dunas', { lastPlayed: now - 30 * DAY, playtimeMinutes: 3400, hero: heroArt(35) }),
    G('77', 'ea', 'Futebol Total 26', { cover: coverArt('Futebol Total 26', 100, 2), lastPlayed: now - 1 * DAY - HOUR, playtimeMinutes: 5100, favorite: true }),
    G('9N', 'xbox', 'Pista Infinita', { lastPlayed: now - 21 * DAY, playtimeMinutes: 640 }),
    G('emu', 'custom', 'Emulador Retrô', { installDir: 'C:\\Emuladores' , playtimeMinutes: 95, lastPlayed: now - 9 * DAY }),
    G('1003', 'steam', 'Ecos do Abismo', { cover: coverArt('Ecos do Abismo', 260, 3), hero: heroArt(250), lastPlayed: now - 10 * MIN, playtimeMinutes: 89 }),
    G('1004', 'steam', 'Fazenda Feliz', { cover: 'data:image/png;base64,AAAA' /* imagem inválida: testa o onerror */, playtimeMinutes: 15 }),
    G('def', 'epic', 'Operação Tempestade', { lastPlayed: now - 400 * DAY, playtimeMinutes: 60 }),
    G('1005', 'steam', 'Reino Esquecido: Edição Definitiva do Aniversário', {}),
    G('9Q', 'xbox', 'Voo Livre Simulador', { cover: coverArt('Voo Livre', 200, 1) }),
    G('1006', 'steam', 'Pixel Heróis', { hidden: true, cover: coverArt('Pixel Heróis', 300, 2) }),
    G('88', 'ea', 'Velocidade Máxima', { playtimeMinutes: 300, lastPlayed: now - 3 * DAY }),
  ];
}

function manyGames() {
  const a = ['Crônicas', 'Guerra', 'Lenda', 'Mistério', 'Caçadores', 'Estrelas', 'Reino', 'Projeto', 'Sombras', 'Ecos', 'Corrida', 'Fortaleza'];
  const b = ['do Norte', 'Perdidas', 'de Aço', 'Infinito', 'da Aurora', 'X', 'Zero', 'do Tempo', 'Selvagem', '2', 'Neon', 'do Abismo'];
  const src = ['steam', 'epic', 'ubisoft', 'ea', 'xbox', 'custom'];
  const out = [];
  for (let i = 0; i < 210; i++) {
    const name = `${a[i % a.length]} ${b[(i * 7) % b.length]} ${i}`;
    const s = src[i % 6];
    out.push({ id: `${s}:gen${i}`, source: s, name, cover: i % 3 === 0 ? coverArt(name, (i * 37) % 360, i) : null, hero: null, installDir: '', lastPlayed: i % 5 === 0 ? Date.now() - i * HOUR : null, playtimeMinutes: (i * 13) % 400, favorite: i % 17 === 0, hidden: false, addedAt: Date.now() });
  }
  return out;
}

/* ------------------------------------------------------------------ v2 */
const UNINST_NAMES = ['Cavaleiros de Bronze', 'Ilha dos Ventos', 'Metrópole Subterrânea', 'Piloto de Tempestade', 'Fronteira Gelada',
  'O Último Farol', 'Clã das Raposas', 'Rali Tropical', 'Dungeon de Papel', 'Guardiões do Cristal', 'Mar de Estrelas', 'Torre Arcana',
  'Cozinha Caótica', 'Esquadrão Ômega', 'Vila Assombrada', 'Planeta Laranja', 'Samurai Neon', 'Corredor Noturno', 'Reino de Areia',
  'Fábrica de Robôs', 'Detetive da Chuva', 'Liga de Basquete 26', 'Golfe Lunar', 'Cidade Flutuante', 'Caverna Perdida'];
function uninstalledSeed() {
  return UNINST_NAMES.map((name, i) => ({
    id: `steam:${2000 + i}`, source: 'steam', name, installed: false,
    cover: i % 3 === 1 ? null : coverArt(name, (i * 47) % 360, i),
    hero: i % 4 === 0 ? heroArt((i * 47) % 360) : null,
  }));
}
/** Cápsula larga (460x215) estilo loja */
function capsuleArt(name, hue) {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215">
    <defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},75%,50%)"/><stop offset="1" stop-color="hsl(${hue + 60},70%,14%)"/></linearGradient></defs>
    <rect width="460" height="215" fill="url(#c)"/><circle cx="380" cy="60" r="70" fill="hsl(${hue + 30},90%,70%)" opacity=".5"/>
    <path d="M0 170 L120 110 L220 150 L330 90 L460 160 L460 215 L0 215Z" fill="hsl(${hue - 20},50%,10%)" opacity=".8"/>
    <text x="24" y="70" font-family="Segoe UI, sans-serif" font-weight="900" font-size="34" fill="#fff">${esc(name.toUpperCase())}</text></svg>`);
}
const brl = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');
function offersSeed() {
  const names = ['Galáxia Rebelde', 'Pistoleiros do Oeste', 'Fazenda Feliz', 'Dragões de Gelo', 'Corrida Infinita', 'Cidade Pixel', 'Abismo Azul',
    'Arena dos Titãs', 'Mansão do Enigma', 'Futebol Total 26', 'Cosmonauta', 'Tática Medieval', 'Simulador de Trem', 'Neon Ronin', 'Vale Sombrio',
    'Ecos do Abismo', 'Batalha Naval X', 'Cartas Lendárias', 'Bosque Encantado', 'Comando Delta', 'Puzzle do Relojoeiro', 'Ritmo Total',
    'Sobrevivência Ártica', 'Império do Sol', 'Motoqueiros', 'Gato Ninja', 'Laboratório 9', 'Rei do Kart', 'Vikings do Norte', 'Horizonte Vermelho'];
  const owned = new Set(['Fazenda Feliz', 'Futebol Total 26', 'Ecos do Abismo', 'Horizonte Vermelho']);
  return names.map((name, i) => {
    const discount = [10, 20, 25, 33, 40, 50, 60, 66, 75, 80, 85, 90][(i * 5) % 12];
    const orig = [19.99, 29.99, 49.99, 59.99, 99.99, 129.9, 199.9, 249.9][(i * 3) % 8];
    const fin = Math.round(orig * (100 - discount)) / 100;
    return { appid: 3000 + i, name, image: capsuleArt(name, (i * 37) % 360), discount, originalPrice: Math.round(orig * 100), finalPrice: Math.round(fin * 100),
      priceText: brl(fin), originalText: brl(orig), url: `https://store.steampowered.com/app/${3000 + i}/`, owned: owned.has(name) };
  });
}
function epicSeed() {
  const now = Date.now();
  return [
    { title: 'Crônicas do Vento', image: capsuleArt('Crônicas do Vento', 200), url: 'https://store.epicgames.com/p/cronicas', startDate: now - 2 * DAY, endDate: now + 5 * DAY, current: true },
    { title: 'Mistério na Ilha', image: capsuleArt('Mistério na Ilha', 20), url: 'https://store.epicgames.com/p/misterio', startDate: now - 2 * DAY, endDate: now + 5 * DAY, current: true },
    { title: 'Robôs em Fúria', image: capsuleArt('Robôs em Fúria', 280), url: 'https://store.epicgames.com/p/robos', startDate: now + 5 * DAY, endDate: now + 12 * DAY, current: false },
  ];
}

/* ------------------------------------------------------------------ v3 */
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
/** PRNG determinístico por chave (dados estáveis entre chamadas) */
function rng(seed) {
  let x = 0;
  for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
const PERSONAS = [
  { key: 'corujao', title: 'Corujão', desc: 'Quando o mundo dorme, você aperta start. Suas melhores partidas acontecem depois da meia-noite.' },
  { key: 'maratonista', title: 'Maratonista', desc: 'Sessões longas, foco total. Pra você, "só mais uma" dura umas três horas.' },
  { key: 'fiel', title: 'Fiel ao Jogo', desc: 'Achou um jogo e casou com ele. Quase todo o seu tempo foi para um título só.' },
  { key: 'explorador', title: 'Explorador', desc: 'Você pula de mundo em mundo. Muitos jogos diferentes, sempre atrás da próxima novidade.' },
  { key: 'fim-de-semana', title: 'Guerreiro de Fim de Semana', desc: 'Durante a semana a vida chama; no sábado e domingo, o controle é seu.' },
];

function buildWrapped(key, games, now) {
  const isYear = !key.includes('-');
  const year = +key.slice(0, 4), month = isYear ? null : +key.slice(5) - 1;
  const from = isYear ? new Date(year, 0, 1).getTime() : new Date(year, month, 1).getTime();
  const to = isYear ? new Date(year + 1, 0, 1).getTime() : new Date(year, month + 1, 1).getTime();
  const r = rng(key);
  // base estável (ignora jogos que entram depois via download) para os números não mudarem
  const pool = games.filter((g) => !g.hidden && !/^steam:20\d\d$/.test(g.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = [...pool].sort(() => r() - 0.5).slice(0, 5);
  // período parcial: proporcional ao que já passou
  const frac = Math.min(1, Math.max(0.15, (Math.min(now, to) - from) / (to - from)));
  const scale = (isYear ? 9 : 1) * frac;
  const top = pick.map((g, i) => ({ g, minutes: Math.round((900 - i * 170 + r() * 120) * scale) }));
  // jogo nº 1 bem à frente às vezes
  if (r() > 0.4) top[0].minutes = Math.round(top[0].minutes * 1.8);
  top.sort((a, b) => b.minutes - a.minutes);
  const total = top.reduce((t, x) => t + x.minutes, 0);
  const topGames = top.map(({ g, minutes }) => ({ id: g.id, name: g.name, cover: g.cover, hero: g.hero, source: g.source, minutes, sessions: Math.max(1, Math.round(minutes / (70 + r() * 60))), share: minutes / total }));
  const hours = Array.from({ length: 24 }, (_, h) => {
    const night = h >= 20 || h <= 2 ? 3.2 : h >= 14 && h < 20 ? 1.6 : h >= 3 && h <= 9 ? 0.15 : 0.7;
    return night * (0.6 + r());
  });
  const hs = hours.reduce((a, b) => a + b, 0);
  const hourHistogram = hours.map((v) => Math.round(v / hs * total));
  const favHour = hourHistogram.indexOf(Math.max(...hourHistogram));
  const wd = [1.6, 0.6, 0.7, 0.8, 0.9, 1.3, 2.2].map((v) => v * (0.7 + r() * 0.6));
  const ws = wd.reduce((a, b) => a + b, 0);
  const weekdayHistogram = wd.map((v) => Math.round(v / ws * total));
  const favDay = weekdayHistogram.indexOf(Math.max(...weekdayHistogram));
  const lsGame = topGames[Math.floor(r() * 2)];
  const lsStart = from + Math.floor(r() * Math.max(1, Math.min(to, now) - from - DAY));
  const lsMin = Math.round(180 + r() * 220);
  const d0 = new Date(lsStart); d0.setHours(22, 10, 0, 0);
  const sessions = topGames.reduce((t, x) => t + x.sessions, 0);
  const persona = PERSONAS[Math.floor(r() * PERSONAS.length)];
  const prevLabel = isYear ? String(year - 1) : `${MONTHS[(month + 11) % 12]} de ${month ? year : year - 1}`;
  return {
    key, period: isYear ? 'year' : 'month', label: isYear ? String(year) : `${MONTHS[month]} de ${year}`, from, to, complete: to <= now, hasData: true,
    totalMinutes: total, sessions, daysPlayed: Math.min(isYear ? 220 : 28, Math.round(sessions * 0.7)), gamesPlayed: topGames.length + Math.floor(r() * 4),
    topGames,
    longestSession: { id: lsGame.id, name: lsGame.name, cover: lsGame.cover, hero: lsGame.hero, minutes: lsMin, start: d0.getTime(), end: d0.getTime() + lsMin * MIN },
    favoriteHour: { hour: favHour, minutes: hourHistogram[favHour] }, hourHistogram,
    favoriteWeekday: { day: favDay, label: WDAYS[favDay], minutes: weekdayHistogram[favDay] }, weekdayHistogram,
    longestStreakDays: 3 + Math.floor(r() * 9),
    busiestDay: { date: new Date(lsStart).setHours(0, 0, 0, 0), minutes: Math.round(lsMin * 1.3) },
    lateNightMinutes: hourHistogram.slice(0, 5).reduce((a, b) => a + b, 0),
    newGames: topGames.slice(2, 2 + 1 + Math.floor(r() * 3)).map(({ id, name, cover }) => ({ id, name, cover })),
    previous: isYear ? null : { label: prevLabel, totalMinutes: Math.round(total / (1 + (r() - 0.3))), deltaPct: Math.round((r() - 0.3) * 80) },
    personality: persona,
  };
}

export function createMockDash() {
  const params = new URLSearchParams(location.search);
  let games = params.has('empty') ? [] : seed();
  if (params.has('many')) games = games.concat(manyGames());
  const listeners = { state: [], games: [] };
  const clone = () => games.map((g) => ({ ...g }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const original = new Map(games.map((g) => [g.id, g.name]));
  let settings = { autostart: false, fullscreen: true, sounds: true, startView: 'jogos', theme: 'metro' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('bladedash.mock.settings') || '{}')); } catch { /* sem storage */ }
  let customN = 1;

  // v2: não instalados, downloads simulados, discos e ofertas
  const v2 = { games: [], downloads: [] };
  let uninstalled = params.has('empty') ? [] : uninstalledSeed();
  let downloads = [];
  const startDl = (u, state = 'downloading', progress = 0) => {
    const total = Math.round((8 + (u.name.length % 9) * 6) * GB);
    downloads.push({ id: u.id, name: u.name, cover: u.cover, state, progress, bytesDownloaded: Math.round(total * progress), bytesTotal: total, _u: u });
  };
  if (!params.has('empty') && !params.has('nodl')) {
    const a = uninstalled.splice(5, 1)[0], b = uninstalled.splice(9, 1)[0];
    startDl(a, 'downloading', 0.55);
    startDl(b, 'queued', 0);
  }
  const pubDl = () => downloads.map(({ _u, ...d }) => ({ ...d }));
  const emitDl = () => v2.downloads.forEach((cb) => cb(pubDl()));
  setInterval(() => {
    if (!downloads.length) return;
    let d = downloads.find((x) => x.state === 'downloading');
    if (!d) { downloads[0].state = 'downloading'; d = downloads[0]; }
    d.progress = Math.min(1, d.progress + 0.06);
    d.bytesDownloaded = Math.round(d.bytesTotal * d.progress);
    if (d.progress >= 1) {
      downloads = downloads.filter((x) => x !== d);
      const u = d._u;
      games.push({ id: u.id, source: 'steam', name: u.name, cover: u.cover, hero: u.hero, installDir: 'D:\\SteamLibrary\\' + u.name,
        lastPlayed: null, playtimeMinutes: 0, favorite: false, hidden: false, addedAt: Date.now(), sizeBytes: d.bytesTotal, drive: 'D:' });
      original.set(u.id, u.name);
      emitDl();
      setTimeout(() => listeners.games.forEach((cb) => cb(clone())), 400); // o jogo entra em getGames() logo depois
    } else emitDl();
  }, 1500);

  const drives = () => {
    const by = (dr) => games.filter((g) => g.drive === dr && g.sizeBytes).map((g) => ({ id: g.id, name: g.name, bytes: g.sizeBytes })).sort((a, b) => b.bytes - a.bytes);
    const sum = (l) => l.reduce((t, x) => t + x.bytes, 0);
    const c = by('C:'), d = by('D:');
    return [
      { drive: 'C:', label: 'Windows', total: 475 * GB, free: 120.4 * GB, gamesBytes: sum(c), games: c },
      { drive: 'D:', label: 'Jogos', total: 931 * GB, free: 212.7 * GB, gamesBytes: sum(d), games: d },
      { drive: 'E:', label: 'Externo', total: 1863 * GB, free: 1402 * GB, gamesBytes: 0, games: [] },
    ];
  };
  let offersCache = null;

  // v3: Gaming Wrapped — mês atual (parcial), mês anterior (completo, não visto), ano atual
  const wrappedSeen = new Set(['2026-09']);
  const wrappedKeys = () => {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth();
    const k = (yy, mm) => `${yy}-${String(mm + 1).padStart(2, '0')}`;
    const prev = m ? [y, m - 1] : [y - 1, 11], prev2 = m > 1 ? [y, m - 2] : [y - 1, 10 + m];
    // como o backend: mais recente primeiro, cada ano depois dos seus meses
    const months = [k(y, m), k(...prev), k(...prev2)];
    const out = [];
    for (const mk of months) { if (out.length && out[out.length - 1].length > 4 && out[out.length - 1].slice(0, 4) !== mk.slice(0, 4)) out.push(out[out.length - 1].slice(0, 4)); out.push(mk); }
    out.push(months[months.length - 1].slice(0, 4));
    return out;
  };
  const sessionCbs = [];

  // simula capa baixada em segundo plano
  setTimeout(() => {
    const g = games.find((x) => x.id === 'steam:1002');
    if (g && !g.cover) { g.cover = coverArt(g.name, 300, 3); g.hero = heroArt(290); listeners.games.forEach((cb) => cb(clone())); }
  }, 6000);

  return {
    async getGames() { await wait(120); return clone(); },
    async rescan() {
      await wait(1800);
      if (!games.length) games = seed();
      games.forEach((g) => original.set(g.id, original.get(g.id) || g.name));
      return clone();
    },
    async launch(id) {
      await wait(500);
      const g = games.find((x) => x.id === id);
      if (!g) return { ok: false, error: 'Jogo não encontrado.' };
      if (id === 'steam:1004') return { ok: false, error: 'Não foi possível iniciar Fazenda Feliz: executável não encontrado.' };
      setTimeout(() => listeners.state.forEach((cb) => cb({ id, running: true })), 1500);
      setTimeout(() => {
        g.lastPlayed = Date.now();
        g.playtimeMinutes += 3;
        listeners.state.forEach((cb) => cb({ id, running: false }));
        sessionCbs.forEach((cb) => cb());
      }, 12000);
      return { ok: true };
    },
    async updateGame(id, patch) {
      await wait(60);
      const g = games.find((x) => x.id === id);
      if (!g) return null;
      if ('favorite' in patch) g.favorite = !!patch.favorite;
      if ('hidden' in patch) g.hidden = !!patch.hidden;
      if ('customName' in patch) g.name = patch.customName || original.get(id) || g.name;
      if ('customCover' in patch) g.cover = patch.customCover;
      return { ...g };
    },
    async addCustomGame() {
      await wait(300);
      const name = `Meu Jogo ${customN++}`;
      const g = { id: `custom:mock${Date.now()}`, source: 'custom', name, cover: null, hero: null, installDir: 'C:\\Jogos', lastPlayed: null, playtimeMinutes: 0, favorite: false, hidden: false, addedAt: Date.now() };
      games.push(g); original.set(g.id, name);
      return { ...g };
    },
    async pickCover(id) {
      await wait(300);
      const g = games.find((x) => x.id === id);
      if (!g) return null;
      g.cover = coverArt(g.name, Math.floor(Math.random() * 360), Math.floor(Math.random() * 4));
      return { ...g };
    },
    async removeCustomGame(id) { await wait(100); games = games.filter((g) => g.id !== id); },
    async getSettings() { return { ...settings }; },
    async setSettings(patch) {
      settings = { ...settings, ...patch };
      try { localStorage.setItem('bladedash.mock.settings', JSON.stringify(settings)); } catch { /* ok */ }
      return { ...settings };
    },
    async getProfile() { return { name: 'Vitor' }; },
    onGameState(cb) { listeners.state.push(cb); },
    onGamesUpdated(cb) { listeners.games.push(cb); },
    // ---- v2
    async getUninstalled() { await wait(200); return uninstalled.map((u) => ({ ...u })); },
    async install(id) {
      await wait(300);
      const i = uninstalled.findIndex((u) => u.id === id);
      if (i < 0) return { ok: false, error: 'Jogo não encontrado na biblioteca Steam.' };
      const [u] = uninstalled.splice(i, 1);
      setTimeout(() => { startDl(u, downloads.length ? 'queued' : 'downloading', 0); emitDl(); v2.games.forEach((cb) => cb(uninstalled.map((x) => ({ ...x })))); }, 1200);
      return { ok: true };
    },
    async getDownloads() { return pubDl(); },
    async getStorage() { await wait(250); return drives(); },
    async getOffers(force) {
      if (params.has('offersfail')) { await wait(900); return { fetchedAt: null, currency: 'BRL', steam: [], epicFree: [], error: 'Sem conexão' }; }
      await wait(force || !offersCache ? 1200 : 80);
      if (!offersCache || force) offersCache = { fetchedAt: force ? Date.now() : Date.now() - 12 * MIN, currency: 'BRL', steam: offersSeed(), epicFree: epicSeed() };
      if (params.has('offline')) return { ...offersCache, fetchedAt: Date.now() - 5 * HOUR, error: 'Sem conexão' };
      return { ...offersCache };
    },
    async openStore(target) { console.info('[mock] openStore', target); return { ok: true }; },
    onDownloads(cb) { v2.downloads.push(cb); },
    onUninstalledUpdated(cb) { v2.games.push(cb); },
    // ---- v3
    async getWrappedPeriods() {
      await wait(150);
      if (params.has('wrappedempty')) return [];
      const now = Date.now();
      return wrappedKeys().map((key) => {
        const w = buildWrapped(key, games, now);
        return { key, period: w.period, year: +key.slice(0, 4), month: w.period === 'month' ? +key.slice(5) : undefined, label: w.label, minutes: w.totalMinutes, complete: w.complete, seen: wrappedSeen.has(key) };
      });
    },
    async getWrapped(key) {
      await wait(400);
      if (params.has('wrappedempty') || !wrappedKeys().includes(key)) return { hasData: false, label: key };
      return buildWrapped(key, games, Date.now());
    },
    async markWrappedSeen(key) { wrappedSeen.add(key); return { ok: true }; },
    onSessionsUpdated(cb) { sessionCbs.push(cb); },
    minimize() { console.info('[mock] minimize'); },
    quit() { console.info('[mock] quit'); },
    toggleFullscreen() { console.info('[mock] toggleFullscreen'); },
    shutdownPC() { console.info('[mock] shutdownPC'); },
  };
}
