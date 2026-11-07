'use strict';
// Persistência em <dataDir>/library.json com escrita atômica (tmp + rename) e serializada.
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = { autostart: true, fullscreen: true, sounds: true, startView: 'games', theme: 'metro' };
const THEMES = ['metro', 'blades'];

function emptyData() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    overrides: {}, // id -> { favorite, hidden, customName, customCover }
    custom: [], // [{ id, name, exePath, args, addedAt }]
    stats: {}, // id -> { lastPlayed, playtimeMinutes, addedAt }
    cache: [], // entradas brutas do último scan
    cacheAt: 0,
  };
}

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'library.json');
    this.data = emptyData();
    this._chain = Promise.resolve();
    this._timer = null;
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    let raw = null;
    for (const f of [this.file, this.file + '.tmp']) {
      try {
        raw = JSON.parse(fs.readFileSync(f, 'utf8'));
        break;
      } catch {}
    }
    const d = emptyData();
    if (raw && typeof raw === 'object') {
      d.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
      d.overrides = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {};
      d.custom = Array.isArray(raw.custom) ? raw.custom : [];
      d.stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
      d.cache = Array.isArray(raw.cache) ? raw.cache : [];
      d.cacheAt = +raw.cacheAt || 0;
    }
    this.data = d;
    return d;
  }

  /** Salva (serializado; várias chamadas seguidas viram uma escrita). */
  save() {
    this._chain = this._chain.then(() => this._write()).catch(() => {});
    return this._chain;
  }

  /** Salva em até ~1s (para atualizações frequentes, ex. playtime). */
  saveSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.save();
    }, 1000);
  }

  async _write() {
    const tmp = this.file + '.tmp';
    const json = JSON.stringify(this.data, null, 1);
    await fs.promises.writeFile(tmp, json, 'utf8');
    for (let i = 0; i < 5; i++) {
      try {
        await fs.promises.rename(tmp, this.file);
        return;
      } catch (e) {
        // antivírus/indexador pode segurar o arquivo por um instante no Windows
        if (i === 4) throw e;
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
  }

  getSettings() {
    return { ...DEFAULT_SETTINGS, ...this.data.settings };
  }

  setSettings(patch) {
    const allowed = Object.keys(DEFAULT_SETTINGS);
    for (const k of Object.keys(patch || {})) {
      if (!allowed.includes(k)) continue;
      const v = patch[k];
      if (k === 'startView') this.data.settings[k] = String(v || 'games');
      else if (k === 'theme') this.data.settings[k] = THEMES.includes(v) ? v : 'metro';
      else this.data.settings[k] = !!v;
    }
    return this.getSettings();
  }

  stat(id) {
    if (!this.data.stats[id]) this.data.stats[id] = { lastPlayed: null, playtimeMinutes: 0, addedAt: Date.now() };
    return this.data.stats[id];
  }

  override(id) {
    return this.data.overrides[id] || {};
  }
}

module.exports = { Store, DEFAULT_SETTINGS };
