'use strict';
// Lança jogos e detecta quando abrem/fecham (processo com executável dentro da pasta do jogo).
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const u = require('./util');

const POLL_MS = 3000;
const START_TIMEOUT_MS = 3 * 60 * 1000;
const MISSES_TO_STOP = 2; // ~6s sem o processo = fechou (cobre troca launcher -> jogo)
const MARK = '###BLADEDASH_END###';

/** PowerShell persistente: uma consulta Win32_Process por poll (~100ms) sem abrir processo novo. */
class ProcWatcher {
  constructor() {
    this.proc = null;
    this.buf = '';
    this.pending = null;
  }

  _start() {
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      this.proc = null;
      return false;
    }
    this.buf = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => {
      this.buf += d;
      const i = this.buf.indexOf(MARK);
      if (i >= 0 && this.pending) {
        const chunk = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + MARK.length);
        const p = this.pending;
        this.pending = null;
        p(chunk.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      }
    });
    const onExit = () => {
      this.proc = null;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        p(null);
      }
    };
    this.proc.on('exit', onExit);
    this.proc.on('error', onExit);
    this.proc.stdin.on('error', () => {});
    this.proc.stdin.write("$ErrorActionPreference='SilentlyContinue';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8\n");
    return true;
  }

  /** Lista de caminhos de executáveis em execução, ou null em falha. */
  query() {
    if (this.pending) return Promise.resolve(null);
    if (!this.proc && !this._start()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        if (this.pending) {
          this.pending = null;
          this.stop();
          resolve(null);
        }
      }, 15000);
      this.pending = (v) => {
        clearTimeout(t);
        resolve(v);
      };
      try {
        this.proc.stdin.write(
          'Get-CimInstance -ClassName Win32_Process -Property ExecutablePath | ForEach-Object { $_.ExecutablePath } | Where-Object { $_ }; ' +
            `'${MARK}'\n`
        );
      } catch {
        this.pending = null;
        clearTimeout(t);
        resolve(null);
      }
    });
  }

  stop() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
    }
    this.proc = null;
  }
}

function spawnDetached(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, ...opts });
    } catch (e) {
      return resolve({ ok: false, err: e });
    }
    child.once('error', (e) => resolve({ ok: false, err: e }));
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}

const SCHEME_NAMES = {
  steam: 'Steam',
  'com.epicgames.launcher': 'Epic Games Launcher',
  uplay: 'Ubisoft Connect',
  origin2: 'EA app',
  origin: 'EA app',
};

async function protocolRegistered(scheme) {
  const out = await u.run('reg', ['query', 'HKCR\\' + scheme, '/v', 'URL Protocol'], { timeout: 5000 });
  return !!out;
}

/**
 * Abre uma URI (steam://, uplay://, https://...) com o handler do Windows, sem passar pelo cmd
 * (o "&" das URIs fica intacto). Nunca lança. { ok } | { ok:false, error }
 */
async function openUri(target) {
  try {
    const scheme = String(target).split(':')[0].toLowerCase();
    if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) return { ok: false, error: 'Endereço inválido.' };
    if (scheme !== 'http' && scheme !== 'https' && !(await protocolRegistered(scheme))) {
      const app = SCHEME_NAMES[scheme] || scheme;
      return { ok: false, error: `${app} não está instalado (ou não registrou o protocolo ${scheme}://).` };
    }
    const r = await spawnDetached('rundll32.exe', ['url.dll,FileProtocolHandler', String(target)], { windowsHide: true });
    if (!r.ok) return { ok: false, error: 'Não foi possível abrir o endereço.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Não foi possível abrir o endereço.' };
  }
}

class Launcher extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.tracked = new Map(); // id -> { dirs, launchedAt, detectedAt, lastTick, misses }
    this.watcher = new ProcWatcher();
    this.timer = null;
    this.ticking = false;
  }

  isRunning(id) {
    const t = this.tracked.get(id);
    return !!(t && t.detectedAt);
  }

  async launch(raw) {
    try {
      const l = raw.launch || {};
      const target = l.target;
      if (!target) return { ok: false, error: 'Este jogo não tem um comando de inicialização.' };
      let r;
      if (l.type === 'uri') {
        const o = await openUri(target);
        if (!o.ok) return o;
        r = { ok: true };
      } else if (l.type === 'appx') {
        r = await spawnDetached('explorer.exe', [target], { windowsHide: true });
      } else {
        if (!u.exists(target)) return { ok: false, error: `Arquivo do jogo não encontrado: ${target}` };
        const cwd = path.dirname(target);
        if (/\.exe$/i.test(target)) {
          r = await spawnDetached(target, u.splitArgs(l.args), { cwd });
          if (!r.ok && !l.args) r = await spawnDetached('explorer.exe', [target], { cwd, windowsHide: true });
        } else {
          // .lnk / .url / .bat / .cmd: deixa o Windows abrir com o programa associado
          r = await spawnDetached('explorer.exe', [target], { cwd, windowsHide: true });
        }
      }
      if (!r || !r.ok) {
        const msg = r && r.err && r.err.code ? ` (${r.err.code})` : '';
        return { ok: false, error: `Não foi possível iniciar o jogo${msg}.` };
      }
      const st = this.store.stat(raw.id);
      st.lastPlayed = Date.now();
      this.store.save();
      this._track(raw);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Erro inesperado ao iniciar o jogo: ' + (e && e.message ? e.message : e) };
    }
  }

  _track(raw) {
    const dirs = (raw.trackDirs && raw.trackDirs.length ? raw.trackDirs : []).map(u.normPath).filter(Boolean);
    if (!dirs.length) return; // sem pasta conhecida: só registra lastPlayed
    const cur = this.tracked.get(raw.id);
    if (cur && cur.detectedAt) return; // já rodando
    this.tracked.set(raw.id, { dirs, launchedAt: Date.now(), detectedAt: null, lastTick: 0, misses: 0 });
    if (!this.timer) {
      this.timer = setInterval(() => this._tick(), POLL_MS);
      if (this.timer.unref) this.timer.unref();
    }
  }

  async _tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const list = await this.watcher.query();
      if (!list) return;
      const paths = list.map((p) => p.toLowerCase());
      const now = Date.now();
      for (const [id, t] of this.tracked) {
        const running = paths.some((p) => t.dirs.some((d) => p.startsWith(d + '\\')));
        if (running) {
          t.misses = 0;
          if (!t.detectedAt) {
            t.detectedAt = now;
            t.lastTick = now;
            this.emit('game-state', { id, running: true });
          } else {
            const st = this.store.stat(id);
            st.playtimeMinutes = (+st.playtimeMinutes || 0) + (now - t.lastTick) / 60000;
            t.lastTick = now;
            this.store.saveSoon();
          }
        } else if (t.detectedAt) {
          if (++t.misses >= MISSES_TO_STOP) {
            this.tracked.delete(id);
            this.store.save();
            this.emit('game-state', { id, running: false });
          }
        } else if (now - t.launchedAt > START_TIMEOUT_MS) {
          this.tracked.delete(id);
          this.emit('game-state', { id, running: false });
        }
      }
    } finally {
      this.ticking = false;
      if (!this.tracked.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
        this.watcher.stop();
      }
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.watcher.stop();
  }
}

module.exports = { Launcher, ProcWatcher, openUri };
