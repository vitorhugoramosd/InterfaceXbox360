// Pilha de blades: as anteriores ficam empilhadas à esquerda (lombadas),
// as seguintes à direita; a ativa abre no meio. Trocar desliza como páginas.
import { h } from './util.js';
import { sfx } from '../sound.js';

const AREA_W = 1800; // largura de #blades
const SPINE = 64;    // largura de cada lombada

export class BladeStack {
  /** screens: [{ key, title, theme, el, sub?, handle, hints, pointer, onEnter, onLeave }] */
  constructor(container, screens, onChange) {
    this.container = container;
    this.screens = screens;
    this.onChange = onChange;
    this.active = 0;
    this.width = AREA_W - (screens.length - 1) * SPINE;
    this.blades = screens.map((s, i) => {
      const spineL = h('div', { class: 'spine l', dataset: { nav: 'spine', i } }, h('span', { class: 'lbl', text: s.title }));
      const spineR = h('div', { class: 'spine r', dataset: { nav: 'spine', i } }, h('span', { class: 'lbl', text: s.title }));
      const body = h('div', { class: 'blade-body' }, s.el);
      const el = h('section', { class: 'blade', dataset: { theme: s.theme, key: s.key, screen: s.key }, style: { '--bw': this.width + 'px' } },
        h('div', { class: 'blade-title', text: s.title }),
        s.sub || null,
        body, spineL, spineR);
      s.bladeEl = el;
      container.append(el);
      return el;
    });
    this.layout(false);
  }

  get current() { return this.screens[this.active]; }
  indexOf(key) { return this.screens.findIndex((s) => s.key === key); }

  layout(animate = true) {
    const n = this.screens.length, a = this.active, W = this.width;
    this.blades.forEach((el, i) => {
      let x;
      if (i < a) x = i * SPINE + SPINE - W;            // só a borda direita aparece
      else if (i === a) x = a * SPINE;
      else x = AREA_W - (n - i) * SPINE;               // só a borda esquerda aparece
      if (!animate) el.style.transition = 'none';
      el.style.transform = `translate3d(${x}px,0,0)`;
      // pilha esquerda: a mais à esquerda fica por cima; pilha direita: a mais à direita por cima
      el.style.zIndex = i === a ? 50 : i < a ? 20 - i : 20 + i;
      el.classList.toggle('active', i === a);
      el.classList.toggle('stack-l', i < a);
      el.classList.toggle('stack-r', i > a);
      if (!animate) { void el.offsetWidth; el.style.transition = ''; }
    });
    document.documentElement.dataset.blade = this.screens[a].theme;
  }

  go(i, { silent = false } = {}) {
    if (i < 0 || i >= this.screens.length || i === this.active) return false;
    const prev = this.current;
    prev.onLeave && prev.onLeave();
    const dir = i > this.active ? 1 : -1;
    this.active = i;
    this.layout(true);
    const el = this.blades[i];
    el.classList.remove('sweep'); void el.offsetWidth; el.classList.add('sweep');
    if (!silent) sfx.blade(dir);
    this.current.onEnter && this.current.onEnter();
    this.onChange && this.onChange(this.current);
    return true;
  }
  next() { return this.go(this.active + 1); }
  prev() { return this.go(this.active - 1); }
}
