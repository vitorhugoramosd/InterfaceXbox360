'use strict';
// Extras da Steam: jogos da biblioteca não instalados e downloads em andamento.
//  - Não instalados: pastas appid em appcache/librarycache (= biblioteca da conta) menos os instalados
//    (appmanifest em qualquer biblioteca + apps listados em libraryfolders.vdf, inclusive de discos
//    desconectados). Nome/tipo vêm do appinfo.vdf binário; só type "game". Fallback: API appdetails.
//  - Downloads: appmanifest_*.acf (StateFlags + bytes), fs.watch nas pastas steamapps e poll de 5s
//    só enquanto houver download ativo ou até 2 min depois de install().
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const u = require('./util');
const vdf = require('./vdf');
const steam = require('./scanners/steam');
const { readAppInfo } = require('./appinfo');
const { fetchBuf } = require('./covers');

const POLL_MS = 5000;
const INSTALL_WATCH_MS = 2 * 60 * 1000;
const APPDETAILS_GAP_MS = 1500;

// StateFlags da Steam
const F = {
  UPDATE_REQUIRED: 2,
  FULLY_INSTALLED: 4,
  UPDATE_RUNNING: 256,
  UPDATE_PAUSED: 512,
  UPDATE_STARTED: 1024,
  ADDING_FILES: 262144,
  PREALLOCATING: 524288,
  DOWNLOADING: 1048576,
  STAGING: 2097152,
  COMMITTING: 4194304,
  VALIDATING: 131072,
};
const ACTIVE = F.UPDATE_RUNNING | F.ADDING_FILES | F.PREALLOCATING | F.DOWNLOADING | F.STAGING | F.COMMITTING | F.VALIDATING;

function readAcf(file) {
  const txt = u.readText(file);
  if (!txt) return null;
  try {
    const st = u.getCI(vdf.parse(txt), 'AppState');
    if (!st) return null;
    const num = (k) => +u.getCI(st, k) || 0;
    return {
      appid: String(u.getCI(st, 'appid') || ''),
      name: u.cleanName(u.getCI(st, 'name') || ''),
      flags: num('StateFlags'),
      bytesDownloaded: num('BytesDownloaded'),
      bytesToDownload: num('BytesToDownload'),
      bytesStaged: num('BytesStaged'),
      bytesToStage: num('BytesToStage'),
    };
  } catch {
    return null;
  }
}

/** Classifica o manifest; null = nada em andamento. */
function downloadState(m) {
  const f = m.flags;
  const installed = !!(f & F.FULLY_INSTALLED);
  const pendingBytes = m.bytesToDownload > 0 && m.bytesDownloaded < m.bytesToDownload;
  if (f & F.UPDATE_PAUSED) return 'paused';
  if (f & ACTIVE) return installed ? 'updating' : 'downloading';
  if (f & F.UPDATE_STARTED) return 'queued';
  if (!installed) return 'queued'; // manifest recém-criado (instalação pedida)
  if (f & F.UPDATE_REQUIRED && pendingBytes) return 'queued';
  return null;
}

class SteamLib extends EventEmitter {
  constructor({ store, covers }) {
    super();
    this.store = store;
    this.covers = covers;
    this.steamPath = null;
    this.watchers = new Map(); // dir -> FSWatcher
    this.downloads = [];
    this._dlKey = '[]';
    this.installedSet = null; // appids totalmente instalados (para detectar fim de download)
    this.installWatchUntil = 0;
    this.pollTimer = null;
    this.debounce = null;
    this.namesQueue = [];
    this.namesRunning = false;
    this.namesTried = new Set(); // uma tentativa por sessão (evita loop se a rede falhar)
  }

  async init() {
    try {
      this.steamPath = await steam.findSteamPath();
    } catch {
      this.steamPath = null;
    }
    if (!this.steamPath) return;
    this.syncWatchers();
    this.refreshDownloads(true);
  }

  libraries() {
    return this.steamPath ? steam.libraryPaths(this.steamPath) : [];
  }

  /** Appids listados em libraryfolders.vdf (todas as bibliotecas, mesmo offline). */
  libraryFolderApps() {
    const out = new Set();
    if (!this.steamPath) return out;
    const txt = u.readText(path.join(this.steamPath, 'steamapps', 'libraryfolders.vdf'));
    if (!txt) return out;
    try {
      const lf = u.getCI(vdf.parse(txt), 'libraryfolders') || {};
      for (const k of Object.keys(lf)) {
        const apps = typeof lf[k] === 'object' ? u.getCI(lf[k], 'apps') : null;
        if (apps) Object.keys(apps).forEach((a) => out.add(a));
      }
    } catch {}
    return out;
  }

  manifests() {
    const list = [];
    for (const lib of this.libraries()) {
      const sa = path.join(lib, 'steamapps');
      for (const f of u.listDir(sa)) {
        if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
        const m = readAcf(path.join(sa, f));
        if (m && m.appid) list.push(m);
      }
    }
    return list;
  }

  /** Appids presentes no librarycache (biblioteca da conta). */
  libraryCacheIds() {
    if (!this.steamPath) return [];
    return u.listDir(path.join(this.steamPath, 'appcache', 'librarycache')).filter((x) => /^\d+$/.test(x));
  }

  ownedSet() {
    const s = new Set(this.libraryCacheIds());
    for (const m of this.manifests()) s.add(m.appid);
    return s;
  }

  // ---------------- não instalados ----------------

  computeUninstalled() {
    if (!this.steamPath) return [];
    const installed = new Set(this.manifests().map((m) => m.appid));
    for (const a of this.libraryFolderApps()) installed.add(a);
    const cands = this.libraryCacheIds().filter((a) => !installed.has(a) && !steam.SKIP_APPIDS.has(a));
    let info = new Map();
    try {
      info = readAppInfo(path.join(this.steamPath, 'appcache', 'appinfo.vdf'), new Set(cands));
    } catch {
      info = new Map();
    }
    const out = [];
    const missing = [];
    for (const appid of cands) {
      const i = info.get(appid) || this.store.data.appNames[appid];
      if (!i || !i.type) {
        missing.push(appid);
        continue;
      }
      if (i.type !== 'game' || !i.name || steam.SKIP_NAME.test(i.name)) continue;
      const art = steam.localArt(this.steamPath, appid);
      out.push({
        id: 'steam:' + appid,
        source: 'steam',
        nativeId: appid,
        name: u.cleanName(i.name),
        coverHints: { steamAppId: appid, localCover: art.cover, localCoverHiRes: art.coverHiRes, localHero: art.hero },
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    this.store.data.uninstalled = out;
    if (missing.length) this._queueNames(missing);
    return out;
  }

  /** Fallback: nome/tipo pela API da loja, 1 pedido a cada 1,5 s, cache permanente. */
  _queueNames(ids) {
    for (const id of ids) {
      if (this.namesTried.has(id)) continue;
      this.namesTried.add(id);
      this.namesQueue.push(id);
    }
    if (this.namesRunning) return;
    this.namesRunning = true;
    (async () => {
      let first = true;
      while (this.namesQueue.length) {
        if (!first) await new Promise((res) => setTimeout(res, APPDETAILS_GAP_MS));
        first = false;
        const appid = this.namesQueue.shift();
        const r = await fetchBuf(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic&l=portuguese`, {
          timeout: 10000,
          maxBytes: 2 * 1024 * 1024,
        });
        if (!r || r.status !== 200) continue; // rede/limite: tenta no próximo rescan
        try {
          const j = JSON.parse(r.buf.toString('utf8'))[appid];
          // success:false = sem página na loja (ferramenta, removido...) -> não entra na lista
          this.store.data.appNames[appid] =
            j && j.success && j.data
              ? { name: j.data.name, type: String(j.data.type || '').toLowerCase() }
              : { name: null, type: 'unknown' };
        } catch {
          continue;
        }
        this.computeUninstalled();
        this.store.saveSoon();
        this.emit('uninstalled-changed');
      }
    })()
      .catch(() => {})
      .finally(() => {
        this.namesRunning = false;
      });
  }

  // ---------------- downloads ----------------

  getDownloads() {
    return this.downloads;
  }

  refreshDownloads(initial = false) {
    let manifests;
    try {
      manifests = this.manifests();
    } catch {
      return;
    }
    const list = [];
    const installedNow = new Set();
    for (const m of manifests) {
      const state = downloadState(m);
      if (state && (steam.SKIP_APPIDS.has(m.appid) || steam.SKIP_NAME.test(m.name))) continue; // redistribuíveis etc.
      if (m.flags & F.FULLY_INSTALLED && state !== 'downloading') installedNow.add(m.appid);
      if (!state) continue;
      let done = m.bytesDownloaded;
      let total = m.bytesToDownload;
      if (!total && m.bytesToStage) {
        done = m.bytesStaged;
        total = m.bytesToStage;
      }
      const raw = { id: 'steam:' + m.appid, coverHints: this._artHints(m.appid) };
      const art = this.covers.resolve(raw, this.store.override(raw.id));
      list.push({
        id: raw.id,
        name: m.name || 'App ' + m.appid,
        cover: art.cover,
        state,
        progress: total > 0 ? Math.max(0, Math.min(1, done / total)) : 0,
        bytesDownloaded: done,
        bytesTotal: total,
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.downloads = list;
    const key = JSON.stringify(list);
    if (key !== this._dlKey) {
      this._dlKey = key;
      if (!initial) this.emit('downloads', list);
    }
    // jogo terminou de instalar (ou foi desinstalado): avisa para reescanear
    if (this.installedSet && !initial) {
      const changed =
        installedNow.size !== this.installedSet.size || [...installedNow].some((a) => !this.installedSet.has(a));
      if (changed) this.emit('installed-changed');
    }
    this.installedSet = installedNow;
    this._updatePoll();
  }

  _artHints(appid) {
    const art = steam.localArt(this.steamPath, appid);
    return { steamAppId: appid, localCover: art.cover, localCoverHiRes: art.coverHiRes, localHero: art.hero };
  }

  _schedule() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.refreshDownloads();
    }, 1000);
    if (this.debounce.unref) this.debounce.unref();
  }

  _updatePoll() {
    const want = this.downloads.length > 0 || Date.now() < this.installWatchUntil;
    if (want && !this.pollTimer) {
      this.pollTimer = setInterval(() => this.refreshDownloads(), POLL_MS);
      if (this.pollTimer.unref) this.pollTimer.unref();
    } else if (!want && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Chamado após install(): acompanha por 2 min mesmo sem manifest ainda. */
  watchInstall() {
    this.installWatchUntil = Date.now() + INSTALL_WATCH_MS;
    this.syncWatchers();
    this._updatePoll();
  }

  /** fs.watch (não mantém o processo vivo) em cada steamapps online. */
  syncWatchers() {
    const dirs = new Set(this.libraries().map((l) => path.join(l, 'steamapps')));
    for (const [d, w] of this.watchers) {
      if (!dirs.has(d)) {
        try {
          w.close();
        } catch {}
        this.watchers.delete(d);
      }
    }
    for (const d of dirs) {
      if (this.watchers.has(d)) continue;
      try {
        const w = fs.watch(d, { persistent: false }, (_ev, file) => {
          if (!file || /\.acf$/i.test(String(file))) this._schedule();
        });
        w.on('error', () => {
          try {
            w.close();
          } catch {}
          this.watchers.delete(d);
        });
        this.watchers.set(d, w);
      } catch {}
    }
  }

  dispose() {
    for (const w of this.watchers.values()) {
      try {
        w.close();
      } catch {}
    }
    this.watchers.clear();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.debounce) clearTimeout(this.debounce);
    this.pollTimer = this.debounce = null;
  }
}

module.exports = { SteamLib, downloadState, readAcf };
