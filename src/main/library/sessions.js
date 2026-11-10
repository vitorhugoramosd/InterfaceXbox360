'use strict';
// Registro de sessões de jogo (library.json: sessions + openSessions).
//  - open(): processo do jogo visto rodando pela 1ª vez (não no clique).
//  - seen(): ainda rodando; grava lastSeen (salvamento no máx. 1x/min).
//  - close(): fecha em `end` (normalmente o último "visto rodando"). Pausa < 3 min do mesmo jogo
//    é unida à sessão anterior; sessões < 1 min são descartadas.
//  - recover(): no init, sessões que ficaram abertas (app/PC fechou) são fechadas no lastSeen,
//    então nunca se conta tempo com o app fechado.
const { EventEmitter } = require('events');

const MIN_SESSION_MS = 60 * 1000;
const MERGE_GAP_MS = 3 * 60 * 1000;
const MAX_SESSIONS = 20000;
const SEEN_SAVE_MS = 60 * 1000;

class SessionLog extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.lastSeenSave = 0;
  }

  get list() {
    if (!Array.isArray(this.store.data.sessions)) this.store.data.sessions = [];
    return this.store.data.sessions;
  }

  get open() {
    if (!this.store.data.openSessions || typeof this.store.data.openSessions !== 'object') this.store.data.openSessions = {};
    return this.store.data.openSessions;
  }

  isOpen(gameId) {
    return !!this.open[gameId];
  }

  /** Fecha sessões que ficaram abertas na execução anterior. */
  recover() {
    let changed = false;
    for (const id of Object.keys(this.open)) {
      const s = this.open[id];
      delete this.open[id];
      if (s && s.start && s.lastSeen) this._commit({ gameId: id, name: s.name, start: s.start, end: s.lastSeen, via: s.via });
      changed = true;
    }
    if (changed) this.store.save();
    return changed;
  }

  start(gameId, name, via, now = Date.now()) {
    if (this.open[gameId]) {
      this.seen(gameId, now);
      return;
    }
    this.open[gameId] = { name: name || gameId, start: now, lastSeen: now, via: via === 'dash' ? 'dash' : 'detected' };
    this.store.save();
    this.emit('updated');
  }

  seen(gameId, now = Date.now()) {
    const s = this.open[gameId];
    if (!s) return;
    s.lastSeen = now;
    if (now - this.lastSeenSave >= SEEN_SAVE_MS) {
      this.lastSeenSave = now;
      this.store.saveSoon();
    }
  }

  /** Fecha a sessão aberta do jogo em `end` (padrão: lastSeen). */
  close(gameId, end) {
    const s = this.open[gameId];
    if (!s) return null;
    delete this.open[gameId];
    const r = this._commit({ gameId, name: s.name, start: s.start, end: Math.max(s.start, end || s.lastSeen), via: s.via });
    this.store.save();
    this.emit('updated');
    return r;
  }

  closeAll() {
    for (const id of Object.keys(this.open)) this.close(id);
  }

  /** Grava uma sessão fechada aplicando merge (< 3 min) e descarte (< 1 min). */
  _commit(sess) {
    const list = this.list;
    // última sessão desse jogo (procura do fim; sessões são gravadas em ordem)
    for (let i = list.length - 1; i >= 0 && i >= list.length - 200; i--) {
      const p = list[i];
      if (p.gameId !== sess.gameId) continue;
      if (sess.start >= p.end - 1000 && sess.start - p.end < MERGE_GAP_MS) {
        p.end = Math.max(p.end, sess.end);
        if (sess.via === 'dash') p.via = 'dash';
        return p;
      }
      break;
    }
    if (sess.end - sess.start < MIN_SESSION_MS) return null;
    const rec = { gameId: sess.gameId, name: sess.name, start: sess.start, end: sess.end, via: sess.via };
    list.push(rec);
    if (list.length > MAX_SESSIONS) list.splice(0, list.length - MAX_SESSIONS);
    return rec;
  }

  /** Sessões fechadas + abertas (até lastSeen), para estatísticas. */
  all() {
    const out = this.list.slice();
    for (const id of Object.keys(this.open)) {
      const s = this.open[id];
      if (s.lastSeen - s.start >= MIN_SESSION_MS) out.push({ gameId: id, name: s.name, start: s.start, end: s.lastSeen, via: s.via, open: true });
    }
    return out;
  }
}

module.exports = { SessionLog, MIN_SESSION_MS, MERGE_GAP_MS };
