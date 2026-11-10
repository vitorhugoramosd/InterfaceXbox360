'use strict';
// Lança jogos e detecta quando abrem/fecham (processo com executável dentro da pasta do jogo).
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const u = require('./util');

const START_TIMEOUT_MS = 3 * 60 * 1000;
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
    try {
      this.proc.unref();
      for (const st of [this.proc.stdin, this.proc.stdout]) if (st && st.unref) st.unref();
    } catch {}
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

// ---------------------------------------------------------------------------------------------
// Monitor de jogos (sempre ligado depois de start()):
//  - 1 consulta Win32_Process (PowerShell persistente) a cada 20 s em repouso, 10 s com jogo
//    rodando e 3 s enquanto espera um jogo aberto pelo dash aparecer (até 3 min).
//  - Um processo conta se o executável está dentro da pasta de um jogo instalado e online
//    (Steam: steamapps\common\<dir>; Xbox: pasta Content; etc.). Pastas que contêm o próprio
//    cliente (Steam, Epic Launcher, Ubisoft Connect, EA app, raiz de disco...) são ignoradas.
//  - Um jogo rodando = no máx. 1 sessão aberta (via "dash" se aberto pelo dash, senão "detected").
//  - Se o intervalo entre checagens passar muito do esperado (PC suspenso), a sessão é fechada
//    no último "visto" e outra começa agora — suspensão não conta como tempo jogado.
const IDLE_MS = 20000;
const RUNNING_MS = 10000;
const PENDING_MS = 3000;
const INDEX_TTL_MS = 60000;

function launcherDirs() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pd = process.env.ProgramData || 'C:\\ProgramData';
  return [
    path.join(pf86, 'Steam'),
    path.join(pf, 'Steam'),
    path.join(pf86, 'Epic Games', 'Launcher'),
    path.join(pf, 'Epic Games', 'Launcher'),
    path.join(pf86, 'Ubisoft', 'Ubisoft Game Launcher'),
    path.join(pf, 'Electronic Arts', 'EA Desktop'),
    path.join(pf, 'EA Games', 'EA Desktop'),
    path.join(pf86, 'Origin'),
    path.join(pd, 'Epic'),
    process.env.SystemRoot || 'C:\\Windows',
    pf,
    pf86,
    process.env.USERPROFILE,
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
  ]
    .filter(Boolean)
    .map(u.normPath);
}

/** Pasta serve para identificar um jogo? (não pode ser raiz de disco nem conter um launcher/pasta de sistema) */
function usableGameDir(d, bad) {
  if (!d || /^[a-z]:$/.test(d)) return false;
  if (/\\windowsapps\\microsoft\.gamingapp/.test(d)) return false;
  return !bad.some((b) => b === d || b.startsWith(d + '\\'));
}

class Launcher extends EventEmitter {
  /**
   * @param store Store
   * @param opts { sessions: SessionLog, getRaws: () => raw[] (jogos instalados), nameOf: (id) => string }
   */
  constructor(store, opts = {}) {
    super();
    this.store = store;
    this.sessions = opts.sessions || null;
    this.getRaws = opts.getRaws || (() => []);
    this.nameOf = opts.nameOf || ((id) => id);
    this.pending = new Map(); // id -> { dirs, launchedAt }  (aberto pelo dash, esperando aparecer)
    this.running = new Map(); // id -> { via, lastTick, misses, interval }
    this.watcher = new ProcWatcher();
    this.timer = null;
    this.ticking = false;
    this.started = false;
    this._index = null;
    this._indexAt = 0;
    this._indexSrc = null;
    this.badDirs = launcherDirs();
    this.lastCheck = { at: 0, ms: 0, processes: 0, matched: 0 };
  }

  isRunning(id) {
    return this.running.has(id);
  }

  /** Liga o monitor global. */
  start() {
    if (this.started) return;
    this.started = true;
    this._schedule(2000);
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
    const dirs = this._dirsOf(raw);
    if (!dirs.length) return; // sem pasta conhecida: só registra lastPlayed
    if (this.running.has(raw.id)) return; // já rodando
    this.pending.set(raw.id, { dirs, launchedAt: Date.now() });
    this.started = true;
    this._schedule(PENDING_MS);
  }

  _dirsOf(raw) {
    const list = raw.trackDirs && raw.trackDirs.length ? raw.trackDirs : raw.installDir ? [raw.installDir] : [];
    return list.map(u.normPath).filter((d) => usableGameDir(d, this.badDirs));
  }

  /** Índice [ { dir, id } ] ordenado do caminho mais longo para o mais curto. */
  _getIndex() {
    const raws = this.getRaws() || [];
    if (this._index && this._indexSrc === raws && Date.now() - this._indexAt < INDEX_TTL_MS) return this._index;
    const idx = [];
    for (const r of raws) {
      if (!r || !r.id || r.offline) continue;
      for (const d of this._dirsOf(r)) idx.push({ dir: d, id: r.id });
    }
    idx.sort((a, b) => b.dir.length - a.dir.length);
    this._index = idx;
    this._indexSrc = raws;
    this._indexAt = Date.now();
    return idx;
  }

  _schedule(ms) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this._tick(), ms);
    if (this.timer.unref) this.timer.unref();
  }

  _nextInterval() {
    if (this.pending.size) return PENDING_MS;
    if (this.running.size) return RUNNING_MS;
    return IDLE_MS;
  }

  async _tick() {
    this.timer = null;
    if (this.ticking) return;
    this.ticking = true;
    const t0 = Date.now();
    try {
      const list = await this.watcher.query();
      if (!list) return;
      const now = Date.now();
      const idx = this._getIndex();
      const extra = [];
      for (const [id, p] of this.pending) for (const d of p.dirs) extra.push({ dir: d, id });
      const seen = new Set();
      for (const raw of list) {
        const p = raw.toLowerCase();
        let hit = null;
        for (const e of idx) {
          if (p.startsWith(e.dir + '\\')) {
            hit = e.id;
            break;
          }
        }
        if (!hit) for (const e of extra) if (p.startsWith(e.dir + '\\')) { hit = e.id; break; }
        if (hit) seen.add(hit);
      }
      this.lastCheck = { at: now, ms: now - t0, processes: list.length, matched: seen.size };
      this._apply(seen, now);
    } catch {
      // nunca derruba o monitor
    } finally {
      this.ticking = false;
      if (this.started) this._schedule(this._nextInterval());
    }
  }

  /** Aplica o resultado de uma checagem (separado para testes). */
  _apply(seen, now) {
    for (const id of seen) {
      const r = this.running.get(id);
      if (r) {
        const delta = now - r.lastTick;
        if (delta > r.interval * 2 + 15000) {
          // checagens pararam (PC suspenso): não conta o buraco
          if (this.sessions) {
            this.sessions.close(id);
            this.sessions.start(id, this.nameOf(id), r.via, now);
          }
        } else {
          const st = this.store.stat(id);
          st.playtimeMinutes = (+st.playtimeMinutes || 0) + delta / 60000;
          st.lastPlayed = now;
          if (this.sessions) this.sessions.seen(id, now);
          this.store.saveSoon();
        }
        r.lastTick = now;
        r.misses = 0;
        r.interval = this._nextInterval();
      } else {
        const via = this.pending.has(id) ? 'dash' : 'detected';
        this.pending.delete(id);
        this.running.set(id, { via, lastTick: now, misses: 0, interval: this._nextInterval() });
        const st = this.store.stat(id);
        st.lastPlayed = now;
        if (this.sessions) this.sessions.start(id, this.nameOf(id), via, now);
        this.emit('game-state', { id, running: true });
      }
    }
    for (const [id, r] of this.running) {
      if (seen.has(id)) continue;
      if (++r.misses >= 2) {
        this.running.delete(id);
        if (this.sessions) this.sessions.close(id);
        this.store.save();
        this.emit('game-state', { id, running: false });
      }
    }
    for (const [id, p] of this.pending) {
      if (!seen.has(id) && now - p.launchedAt > START_TIMEOUT_MS) {
        this.pending.delete(id);
        this.emit('game-state', { id, running: false });
      }
    }
  }

  dispose() {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.sessions) this.sessions.closeAll();
    this.watcher.stop();
  }
}

module.exports = { Launcher, ProcWatcher, openUri };
