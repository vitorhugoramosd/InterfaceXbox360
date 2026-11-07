// Mock de window.dash para desenvolver no navegador comum.
// Mesma API assíncrona do preload. Jogos fictícios; algumas capas são SVG
// geradas (data:), outras null (testa a capa gerada) e uma quebrada (onerror).
// Use ?many=1 na URL para +200 jogos (teste de desempenho) e ?empty=1 para
// começar com a biblioteca vazia (testa "Procurando seus jogos...").

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

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
    minimize() { console.info('[mock] minimize'); },
    quit() { console.info('[mock] quit'); },
    toggleFullscreen() { console.info('[mock] toggleFullscreen'); },
    shutdownPC() { console.info('[mock] shutdownPC'); },
  };
}
