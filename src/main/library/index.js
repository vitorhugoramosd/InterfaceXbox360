'use strict';
// API do backend da biblioteca (ver CONTRACT.md). Sem dependência do electron:
// roda no processo main do Electron e também em `node` puro (scripts/scan-test.js).
//
// Comportamento de cache:
//  - getGames() devolve o cache do último scan na hora (se existir). Se o cache tiver mais
//    de 10 min, dispara um rescan em background e, quando terminar, emite 'covers-updated'
//    com a lista nova (o main repassa como 'games-updated'). Sem cache: faz o scan e espera.
//  - Downloads de capa sempre em background após getGames()/rescan(); ao terminar,
//    emite 'covers-updated' com a lista completa.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const u = require('./util');
const { Store } = require('./store');
const { Covers } = require('./covers');
const { Launcher } = require('./launcher');

const scanners = {
  steam: require('./scanners/steam'),
  epic: require('./scanners/epic'),
  ubisoft: require('./scanners/ubisoft'),
  xbox: require('./scanners/xbox'),
  ea: require('./scanners/ea'),
};
const customScanner = require('./scanners/custom');

const SOURCE_ORDER = ['steam', 'epic', 'ubisoft', 'xbox', 'ea']; // prioridade na deduplicação
const STALE_MS = 10 * 60 * 1000;
const SCANNER_TIMEOUT_MS = 60 * 1000;

const lib = new EventEmitter();
let store = null;
let covers = null;
let launcher = null;
let initPromise = null;
let scanPromise = null;

function ensureInit() {
  if (!store) throw new Error('Biblioteca não inicializada: chame init({ dataDir }) primeiro.');
}

function idOf(raw) {
  return `${raw.source}:${raw.nativeId}`;
}

function toGame(raw) {
  const ov = store.override(raw.id);
  const st = store.data.stats[raw.id] || {};
  const art = covers.resolve(raw, ov);
  const lp = Math.max(+st.lastPlayed || 0, +raw.lastPlayed || 0);
  return {
    id: raw.id,
    source: raw.source,
    name: (ov.customName && String(ov.customName).trim()) || raw.name,
    cover: art.cover,
    hero: art.hero,
    installDir: raw.installDir || null,
    lastPlayed: lp || null,
    playtimeMinutes: Math.round(Math.max(+st.playtimeMinutes || 0, +raw.playtimeMinutes || 0)),
    favorite: !!ov.favorite,
    hidden: !!ov.hidden,
    addedAt: st.addedAt || null,
    running: launcher ? launcher.isRunning(raw.id) : false,
  };
}

function buildGames() {
  return store.data.cache
    .map(toGame)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

function findRaw(id) {
  return store.data.cache.find((r) => r.id === id) || null;
}

async function runScanner(name) {
  try {
    const r = await u.withTimeout(Promise.resolve().then(() => scanners[name].scan()), SCANNER_TIMEOUT_MS, null);
    return Array.isArray(r) ? r : null;
  } catch {
    return null;
  }
}

async function doScan() {
  const results = await Promise.all(SOURCE_ORDER.map(runScanner));
  let steamLibs = [];
  try {
    steamLibs = (await scanners.steam.libraries()).map((l) => path.join(l, 'steamapps'));
  } catch {}

  const prev = store.data.cache;
  const all = [];
  SOURCE_ORDER.forEach((src, i) => {
    // scanner falhou (erro/timeout): mantém o que já se sabia dessa fonte
    const list = results[i] || prev.filter((r) => r.source === src);
    for (const r of list) all.push(r);
  });

  // Deduplicação: Steam vence, depois a ordem de SOURCE_ORDER.
  const names = new Set();
  const dirs = new Set();
  const out = [];
  for (const r of all) {
    r.id = idOf(r);
    const nn = u.normalizeName(r.name);
    const d = u.normPath(r.installDir);
    if (r.source !== 'steam') {
      if (nn && names.has(nn)) continue;
      if (d && dirs.has(d)) continue;
      if (d && steamLibs.some((l) => u.isUnder(d, l))) continue;
    }
    if (out.some((x) => x.id === r.id)) continue;
    if (nn) names.add(nn);
    if (d) dirs.add(d);
    out.push(r);
  }
  for (const r of customScanner.scan(store.data.custom)) {
    r.id = idOf(r);
    out.push(r);
  }

  const now = Date.now();
  for (const r of out) {
    const st = store.stat(r.id);
    if (!st.addedAt) st.addedAt = now;
  }
  store.data.cache = out;
  store.data.cacheAt = now;
  await store.save();
  return out;
}

function emitGames() {
  lib.emit('covers-updated', buildGames());
}

function queueCovers() {
  setImmediate(() => {
    try {
      covers.queue(store.data.cache);
    } catch {}
  });
}

// ---------------- API pública ----------------

lib.init = function init({ dataDir } = {}) {
  if (initPromise) return initPromise;
  if (!dataDir) throw new Error('init: dataDir é obrigatório');
  initPromise = (async () => {
    store = new Store(dataDir);
    store.load();
    covers = new Covers(dataDir, { onUpdated: emitGames });
    launcher = new Launcher(store);
    launcher.on('game-state', (s) => lib.emit('game-state', s));
  })();
  return initPromise;
};

lib.rescan = async function rescan() {
  ensureInit();
  if (!scanPromise) {
    scanPromise = doScan().finally(() => {
      scanPromise = null;
    });
  }
  await scanPromise;
  queueCovers();
  return buildGames();
};

lib.getGames = async function getGames() {
  ensureInit();
  if (!store.data.cacheAt) return lib.rescan();
  if (Date.now() - store.data.cacheAt > STALE_MS && !scanPromise) {
    lib.rescan().then(emitGames).catch(() => {});
  } else {
    queueCovers();
  }
  return buildGames();
};

lib.launch = async function launch(id) {
  try {
    ensureInit();
    const raw = findRaw(id);
    if (!raw) return { ok: false, error: 'Jogo não encontrado na biblioteca.' };
    return await launcher.launch(raw);
  } catch (e) {
    return { ok: false, error: 'Erro ao iniciar o jogo: ' + (e && e.message ? e.message : e) };
  }
};

lib.updateGame = async function updateGame(id, patch = {}) {
  ensureInit();
  const raw = findRaw(id);
  if (!raw) throw new Error('Jogo não encontrado na biblioteca.');
  const ov = { ...(store.data.overrides[id] || {}) };
  if ('favorite' in patch) ov.favorite = !!patch.favorite;
  if ('hidden' in patch) ov.hidden = !!patch.hidden;
  if ('customName' in patch) {
    const n = patch.customName == null ? '' : String(patch.customName).trim();
    if (n) ov.customName = n;
    else delete ov.customName;
  }
  if ('customCover' in patch) {
    const src = patch.customCover;
    if (src) {
      if (!u.exists(src)) throw new Error('Imagem não encontrada: ' + src);
      ov.customCover = covers.importCustom(id, src);
    } else {
      if (ov.customCover) {
        try {
          fs.unlinkSync(ov.customCover);
        } catch {}
      }
      delete ov.customCover;
    }
  }
  store.data.overrides[id] = ov;
  await store.save();
  return toGame(raw);
};

lib.addCustomGame = async function addCustomGame({ name, exePath, args } = {}) {
  ensureInit();
  if (!exePath || !u.exists(exePath)) throw new Error('Arquivo não encontrado: ' + (exePath || '(vazio)'));
  const full = path.resolve(exePath);
  const hash = crypto.createHash('sha1').update(u.normPath(full)).digest('hex').slice(0, 12);
  const id = 'custom:' + hash;
  const cleanName = u.cleanName(name) || path.basename(full, path.extname(full));
  let entry = store.data.custom.find((c) => c.id === id);
  if (entry) {
    entry.name = cleanName;
    entry.args = args || '';
  } else {
    entry = { id, name: cleanName, exePath: full, args: args || '', addedAt: Date.now() };
    store.data.custom.push(entry);
  }
  const raw = customScanner.scan([entry])[0];
  raw.id = id;
  store.data.cache = store.data.cache.filter((r) => r.id !== id).concat(raw);
  store.stat(id);
  await store.save();
  queueCovers();
  return toGame(raw);
};

lib.removeCustomGame = async function removeCustomGame(id) {
  ensureInit();
  store.data.custom = store.data.custom.filter((c) => c.id !== id);
  store.data.cache = store.data.cache.filter((r) => r.id !== id);
  const ov = store.data.overrides[id];
  if (ov && ov.customCover) {
    try {
      fs.unlinkSync(ov.customCover);
    } catch {}
  }
  delete store.data.overrides[id];
  await store.save();
};

lib.getSettings = function getSettings() {
  ensureInit();
  return store.getSettings();
};

lib.setSettings = async function setSettings(patch = {}) {
  ensureInit();
  const s = store.setSettings(patch);
  await store.save();
  return s;
};

/** Para testes: espera os downloads de capa pendentes. */
lib._coversIdle = () => (covers ? covers.whenIdle() : Promise.resolve());
lib._dispose = () => launcher && launcher.dispose();

module.exports = lib;
