'use strict';
// Capas: resolve (síncrono, rápido) e baixa em background para <dataDir>/covers/.
// Prioridade: customCover > arquivo em cache > arte local (Steam librarycache / logo do pacote Xbox) > null.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { pathToFileURL } = require('url');
const u = require('./util');

const RETRY_MS = 24 * 60 * 60 * 1000;
const MIN_BYTES = 5 * 1024;
const CONCURRENCY = 4;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BladeDash/1.0';
const EXTS = ['.jpg', '.png', '.webp'];
const BAD_CANDIDATE = /soundtrack|season pass|\bdlc\b|\bost\b|artbook|\bdemo\b|upgrade|\bpack\b|bundle|expansion|costume|skin/i;

function keyOf(id) {
  return String(id).replace(/[^a-z0-9]+/gi, '_');
}

function fileUrl(p) {
  if (!p) return null;
  try {
    const st = fs.statSync(p);
    return pathToFileURL(p).href + '?v=' + Math.floor(st.mtimeMs);
  } catch {
    return null;
  }
}

/** GET com redirects, timeout e limite de tamanho. Resolve { status, type, buf } ou null. */
function fetchBuf(url, { timeout = 10000, maxRedirects = 5, maxBytes = 25 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let mod;
    try {
      mod = url.startsWith('https:') ? https : http;
    } catch {
      return finish(null);
    }
    const req = mod.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, timeout }, (res) => {
      const st = res.statusCode || 0;
      if (st >= 300 && st < 400 && res.headers.location && maxRedirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return fetchBuf(next, { timeout, maxRedirects: maxRedirects - 1, maxBytes }).then(finish);
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          finish(null);
        } else chunks.push(c);
      });
      res.on('end', () => finish({ status: st, type: String(res.headers['content-type'] || ''), buf: Buffer.concat(chunks) }));
      res.on('error', () => finish(null));
    });
    req.on('timeout', () => {
      req.destroy();
      finish(null);
    });
    req.on('error', () => finish(null));
  });
}

async function fetchJson(url) {
  const r = await fetchBuf(url, { timeout: 10000, maxBytes: 5 * 1024 * 1024 });
  if (!r) return { error: 'network' };
  if (r.status !== 200) return { error: 'status' };
  try {
    return { json: JSON.parse(r.buf.toString('utf8')) };
  } catch {
    return { error: 'parse' };
  }
}

function extForType(type, buf) {
  if (/png/i.test(type) || (buf[0] === 0x89 && buf[1] === 0x50)) return '.png';
  if (/webp/i.test(type)) return '.webp';
  return '.jpg';
}

// ---------- fuzzy match ----------
function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    out.set(b, (out.get(b) || 0) + 1);
  }
  return out;
}
function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}
function similarity(query, cand) {
  const q = u.normalizeName(query);
  const c = u.normalizeName(cand);
  if (!q || !c) return 0;
  if (q === c) return 1;
  const qt = q.split(' ');
  const ct = c.split(' ');
  let contain = 0;
  if (qt.length >= 2 && qt.every((t) => ct.includes(t))) {
    contain = qt.length / ct.length;
    if (c.startsWith(q + ' ')) contain += 0.1;
  }
  // query maior que o candidato (ex.: "X - Complete Edition" vs "X")
  if (ct.length >= 2 && ct.every((t) => qt.includes(t))) {
    contain = Math.max(contain, (ct.length / qt.length) * 0.95);
  }
  return Math.max(dice(q, c), Math.min(contain, 0.99));
}

class Covers {
  constructor(dataDir, { onUpdated } = {}) {
    this.dir = path.join(dataDir, 'covers');
    fs.mkdirSync(this.dir, { recursive: true });
    this.failFile = path.join(this.dir, 'failures.json');
    this.onUpdated = onUpdated || (() => {});
    this.failures = {};
    try {
      this.failures = JSON.parse(fs.readFileSync(this.failFile, 'utf8')) || {};
    } catch {}
    // Nome oficial (Steam) achado para jogos detectados em pastas (auto): key -> nome
    this.namesFile = path.join(this.dir, 'names.json');
    this.names = {};
    try {
      this.names = JSON.parse(fs.readFileSync(this.namesFile, 'utf8')) || {};
    } catch {}
    this.inflight = new Set();
    this.assetCache = new Map(); // appid -> Promise<{cover:[], hero:[]}>
    this.running = 0;
    this.idleWaiters = [];
    this._emitTimer = null;
  }

  /** Nome oficial encontrado na Steam para um jogo achado em pasta (ou null). */
  officialName(id) {
    return this.names[keyOf(id)] || null;
  }

  // ---------- resolução síncrona ----------
  cached(key, kind) {
    const base = kind === 'hero' ? key + '_hero' : key;
    for (const e of EXTS) {
      const p = path.join(this.dir, base + e);
      if (u.exists(p)) return p;
    }
    return null;
  }

  resolve(raw, override = {}) {
    const key = keyOf(raw.id);
    const h = raw.coverHints || {};
    let cover = null;
    if (override.customCover && u.exists(override.customCover)) cover = override.customCover;
    if (!cover) cover = this.cached(key, 'cover');
    if (!cover && h.localCover && u.exists(h.localCover)) cover = h.localCover;
    let hero = this.cached(key, 'hero');
    if (!hero && h.localHero && u.exists(h.localHero)) hero = h.localHero;
    return { cover: fileUrl(cover), hero: fileUrl(hero) };
  }

  /** Copia a imagem escolhida pelo usuário para o cache e devolve o novo caminho. */
  importCustom(id, src) {
    const ext = (path.extname(src) || '.jpg').toLowerCase();
    const key = keyOf(id);
    for (const e of ['.jpg', '.jpeg', '.png', '.webp']) {
      try {
        fs.unlinkSync(path.join(this.dir, key + '_custom' + e));
      } catch {}
    }
    const dest = path.join(this.dir, key + '_custom' + ext);
    fs.copyFileSync(src, dest);
    return dest;
  }

  // ---------- falhas ----------
  failedRecently(k) {
    const t = this.failures[k];
    return t && Date.now() - t < RETRY_MS;
  }
  markFailed(k) {
    this.failures[k] = Date.now();
    this._saveFailures();
  }
  clearFailed(k) {
    if (this.failures[k]) {
      delete this.failures[k];
      this._saveFailures();
    }
  }
  _saveFailures() {
    try {
      fs.writeFileSync(this.failFile + '.tmp', JSON.stringify(this.failures));
      fs.renameSync(this.failFile + '.tmp', this.failFile);
    } catch {}
  }

  // ---------- background ----------
  needs(raw) {
    const key = keyOf(raw.id);
    const h = raw.coverHints || {};
    const hasLocalGoodCover = h.localCover && h.localCoverHiRes && !h.localIsLogo && u.exists(h.localCover);
    const hasLocalHero = h.localHero && !h.localIsLogo && u.exists(h.localHero);
    return {
      cover: !this.cached(key, 'cover') && !hasLocalGoodCover && !this.failedRecently(key + ':cover'),
      hero: !this.cached(key, 'hero') && !hasLocalHero && !this.failedRecently(key + ':hero'),
    };
  }

  /** Enfileira downloads em background (não bloqueia). */
  queue(raws) {
    const jobs = [];
    for (const raw of raws || []) {
      const n = this.needs(raw);
      if ((n.cover || n.hero) && !this.inflight.has(raw.id)) {
        this.inflight.add(raw.id);
        jobs.push({ raw, n });
      }
    }
    if (!jobs.length) return;
    this.running++;
    const work = jobs.slice();
    const worker = async () => {
      while (work.length) {
        const j = work.shift();
        try {
          const changed = await this._process(j.raw, j.n);
          if (changed) this._scheduleEmit();
        } catch {}
        this.inflight.delete(j.raw.id);
      }
    };
    Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker)).then(() => {
      this.running--;
      if (this._emitTimer) {
        clearTimeout(this._emitTimer);
        this._emitTimer = null;
        this.onUpdated();
      }
      if (!this.running) this.idleWaiters.splice(0).forEach((f) => f());
    });
  }

  /** Promise que resolve quando não há downloads pendentes. */
  whenIdle() {
    if (!this.running) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  _scheduleEmit() {
    if (this._emitTimer) return;
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      this.onUpdated();
    }, 1500);
  }

  async _process(raw, need) {
    const key = keyOf(raw.id);
    const h = raw.coverHints || {};
    let appid = h.steamAppId || null;
    if (!appid) {
      const r = await this._searchSteam(h.searchName || raw.name);
      if (r.error) {
        // erro de rede: tenta de novo no próximo scan (sem marcar falha de 24h)
        return false;
      }
      appid = r.appid;
      if (appid && raw.auto && r.matched && r.score >= 0.75) {
        this.names[key] = u.cleanName(String(r.matched).replace(/’/g, "'"));
        try {
          fs.writeFileSync(this.namesFile, JSON.stringify(this.names));
        } catch {}
      }
      if (!appid) {
        if (need.cover) this.markFailed(key + ':cover');
        if (need.hero) this.markFailed(key + ':hero');
        return false;
      }
    }
    const urls = await this._assetUrls(appid);
    let changed = false;
    if (need.cover) {
      const ok = await this._downloadFirst(urls.cover, key);
      ok ? this.clearFailed(key + ':cover') : this.markFailed(key + ':cover');
      changed = changed || ok;
    }
    if (need.hero) {
      const ok = await this._downloadFirst(urls.hero, key + '_hero');
      ok ? this.clearFailed(key + ':hero') : this.markFailed(key + ':hero');
      changed = changed || ok;
    }
    return changed;
  }

  async _searchSteam(name) {
    const term = String(name || '').replace(/[™®©]/g, '').trim();
    if (!term) return { appid: null };
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`;
    const r = await fetchJson(url);
    if (r.error) return { error: r.error };
    const items = (r.json && r.json.items) || [];
    let best = null;
    let bestScore = 0;
    const qBad = BAD_CANDIDATE.test(term);
    for (const it of items) {
      if (!it || !it.id || (it.type && it.type !== 'app')) continue;
      if (!qBad && BAD_CANDIDATE.test(it.name || '')) continue;
      const s = similarity(term, it.name || '');
      if (s > bestScore) {
        bestScore = s;
        best = it;
      }
    }
    return { appid: best && bestScore >= 0.6 ? String(best.id) : null, matched: best && best.name, score: bestScore };
  }

  /** URLs candidatas (novo layout com hash via IStoreBrowseService + URLs clássicas). */
  _assetUrls(appid) {
    if (this.assetCache.has(appid)) return this.assetCache.get(appid);
    const p = (async () => {
      const cover = [];
      const hero = [];
      const input = {
        ids: [{ appid: +appid }],
        context: { language: 'english', country_code: 'US' },
        data_request: { include_assets: true },
      };
      const r = await fetchJson(
        'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify(input))
      );
      const item = r.json && r.json.response && (r.json.response.store_items || [])[0];
      const a = item && item.assets;
      if (a && a.asset_url_format) {
        const mk = (f) => 'https://shared.akamai.steamstatic.com/store_item_assets/' + a.asset_url_format.replace('${FILENAME}', f);
        if (a.library_capsule_2x) cover.push(mk(a.library_capsule_2x));
        if (a.library_capsule) cover.push(mk(a.library_capsule));
        if (a.library_hero) hero.push(mk(a.library_hero));
      }
      cover.push(
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900_2x.jpg`,
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
      );
      hero.push(
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`
      );
      return { cover: [...new Set(cover)], hero: [...new Set(hero)] };
    })();
    this.assetCache.set(appid, p);
    return p;
  }

  async _downloadFirst(urls, base) {
    for (const url of urls) {
      const r = await fetchBuf(url);
      if (!r || r.status !== 200 || !/^image\//i.test(r.type) || r.buf.length < MIN_BYTES) continue;
      const ext = extForType(r.type, r.buf);
      const dest = path.join(this.dir, base + ext);
      try {
        for (const e of EXTS) if (e !== ext) fs.rmSync(path.join(this.dir, base + e), { force: true });
        fs.writeFileSync(dest + '.tmp', r.buf);
        fs.renameSync(dest + '.tmp', dest);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

module.exports = { Covers, keyOf, similarity, fetchBuf };
