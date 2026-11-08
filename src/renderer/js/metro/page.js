// Tema Metro: uma página (pivô) de blocos posicionados em pixels, com
// navegação espacial (blocos de tamanhos irregulares) e rolagem horizontal.
import { h } from '../ui/util.js';
import { lazyObserver } from '../ui/cover.js';
import { sfx } from '../sound.js';

export const AREA_H = 700;   // altura útil dos blocos
export const GAP = 8;

export class TilePage {
  constructor({ key, title }) {
    this.key = key;
    this.title = title;
    this.track = h('div', { class: 'mtrack' });
    this.head = h('div', { class: 'mhead' });
    this.el = h('section', { class: 'mpage', dataset: { screen: key } }, this.head, this.track);
    this.bladeEl = this.el; // interface usada pelo main.js
    this.lazy = lazyObserver(this.el);
    this.tiles = [];
    this.byKey = new Map();
    this.focusKey = null;
    this.tx = 0;
    this.active = false;
    this.onBack = null;
    this.viewW = 1700;

    let wheelT = 0;
    this.el.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      const t = performance.now();
      if (t - wheelT < 90) return;
      wheelT = t;
      this.nav((e.deltaY || e.deltaX) > 0 ? 'right' : 'left');
    }, { passive: false });
  }

  setHeader(text) {
    this.head.textContent = text || '';
    this.el.classList.toggle('has-head', !!text);
  }

  /**
   * specs: [{ key, x, y, w, h, sig, cls, color, render(lazy) -> Node,
   *           a(), opts(), fav(), hints: [[btn,label]] }]
   */
  setTiles(specs) {
    const prevIdx = Math.max(0, this.tiles.findIndex((t) => t.key === this.focusKey));
    const next = new Map();
    for (const s of specs) {
      const old = this.byKey.get(s.key);
      let el;
      if (old && s.sig != null && old.sig === s.sig) el = old.el;
      else {
        el = h('div', { class: 'mt', dataset: { nav: 'mt', key: s.key } });
        el.append(s.render(this.lazy));
      }
      el.className = 'mt' + (s.cls ? ' ' + s.cls : '');
      el.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;${s.color ? `background:${s.color};` : ''}`;
      s.el = el;
      next.set(s.key, s);
    }
    this.byKey = next;
    this.tiles = specs;
    this.track.replaceChildren(...specs.map((s) => s.el));
    this.contentW = specs.reduce((m, s) => Math.max(m, s.x + s.w), 0);
    if (!next.has(this.focusKey)) {
      const s = specs[Math.min(prevIdx, specs.length - 1)];
      this.focusKey = s ? s.key : null;
      this.tx = 0;
    }
    this.paint(false);
  }

  get focused() { return this.byKey.get(this.focusKey) || null; }

  focus(key, { scroll = true, sound = false } = {}) {
    if (!this.byKey.has(key)) return false;
    if (key !== this.focusKey && sound) sfx.move();
    this.focusKey = key;
    this.paint(scroll);
    return true;
  }

  setActive(v) {
    if (v && !this.active && this.onActivate) setTimeout(() => this.onActivate(), 0);
    this.active = v;
    this.el.classList.toggle('active', v);
    this.paint(false);
  }

  paint(scroll = true) {
    for (const s of this.tiles) s.el.classList.toggle('focus', this.active && s.key === this.focusKey);
    if (scroll) this.scrollToFocus();
    else this.applyTx(false);
  }

  scrollToFocus() {
    const s = this.focused;
    if (!s) return;
    const V = this.viewW;
    let tx = this.tx;
    const left = s.x + tx, right = s.x + s.w + tx;
    if (left < 0) tx = -s.x + (s.x > 0 ? 90 : 0);
    else if (right > V - 30) tx = V - 120 - (s.x + s.w);
    const minTx = Math.min(0, V - 40 - this.contentW);
    this.tx = Math.max(minTx, Math.min(0, tx));
    this.applyTx(true);
  }
  applyTx(anim) {
    const minTx = Math.min(0, this.viewW - 40 - (this.contentW || 0));
    this.tx = Math.max(minTx, Math.min(0, this.tx));
    this.track.style.transition = anim ? '' : 'none';
    this.track.style.transform = `translate3d(${this.tx}px,0,0)`;
  }

  /** Navegação espacial: escolhe o bloco mais próximo na direção */
  nav(dir) {
    const cur = this.focused;
    if (!cur) return false;
    let best = null, bestScore = Infinity;
    const cx = (r) => r.x + r.w / 2, cy = (r) => r.y + r.h / 2;
    for (const c of this.tiles) {
      if (c === cur) continue;
      let primary, gap, off;
      if (dir === 'right' || dir === 'left') {
        if (dir === 'right' ? c.x < cur.x + cur.w - 2 : c.x + c.w > cur.x + 2) continue;
        primary = dir === 'right' ? c.x - (cur.x + cur.w) : cur.x - (c.x + c.w);
        gap = Math.max(0, Math.max(c.y, cur.y) - Math.min(c.y + c.h, cur.y + cur.h));
        off = Math.abs(cy(c) - cy(cur));
      } else {
        if (dir === 'down' ? c.y < cur.y + cur.h - 2 : c.y + c.h > cur.y + 2) continue;
        primary = dir === 'down' ? c.y - (cur.y + cur.h) : cur.y - (c.y + c.h);
        gap = Math.max(0, Math.max(c.x, cur.x) - Math.min(c.x + c.w, cur.x + cur.w));
        // preferir o bloco cujo começo está mais perto (ex.: descer do destaque vai pro da esquerda)
        off = Math.min(Math.abs(cx(c) - cx(cur)), Math.abs(c.x - cur.x) + 1);
      }
      const score = primary + gap * 4 + off * 0.35;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best) return false;
    this.focusKey = best.key;
    sfx.move();
    this.paint(true);
    return true;
  }

  handle(a, meta = {}) {
    const s = this.focused;
    switch (a) {
      case 'left': case 'right': return this.nav(a);
      case 'up': case 'down': this.nav(a); return true;
      case 'a': if (s && s.a) { s.a(); return true; } return false;
      case 'x': case 'start': if (s && s.opts) { s.opts(); return true; } return false;
      case 'y': if (s && s.fav) { s.fav(); return true; } return false;
      case 'b': if (this.onBack) { sfx.back(); this.onBack(); return true; } return false;
      default: return false;
    }
  }

  hints() {
    const s = this.focused;
    const list = s && s.hints ? [...s.hints] : s && s.a ? [['a', 'Selecionar']] : [];
    if (this.onBack) list.push(['b', 'Voltar']);
    list.push(['lbrb', 'Trocar']);
    list.push(['guide', 'Guia']);
    return list;
  }

  pointer(target, type) {
    const t = target.closest('[data-nav="mt"]');
    if (!t) return;
    const key = t.dataset.key;
    if (key !== this.focusKey) { this.focusKey = key; sfx.move(); this.paint(false); }
    if (type === 'click') this.handle('a');
  }
}
