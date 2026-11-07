// Tema Metro: abas de pivô no topo + páginas lado a lado que deslizam.
// Os pivôs vizinhos "espiam" nas bordas da tela.
import { h } from '../ui/util.js';
import { sfx } from '../sound.js';

const LEFT = 110;              // margem esquerda do pivô ativo
const PAGE_W = 1920 - 2 * LEFT;
const PAGE_GAP = 54;           // sobra ~56px do vizinho visível em cada borda

export class MetroShell {
  /** pages: TilePage[] (cada uma tem key, title, el, handle, hints, pointer) */
  constructor(container, pages, onChange) {
    this.screens = pages;
    this.onChange = onChange;
    this.active = 0;
    this.tabs = pages.map((p, i) => h('span', { class: 'mtab', dataset: { nav: 'spine', i }, text: p.title }));
    this.tabsEl = h('nav', { class: 'mtabs' }, this.tabs);
    this.pagesEl = h('div', { class: 'mpages' }, pages.map((p) => p.el));
    container.append(this.tabsEl, this.pagesEl);
    pages.forEach((p) => { p.viewW = PAGE_W; });
    this.layout(false);
  }
  get current() { return this.screens[this.active]; }
  indexOf(key) { return this.screens.findIndex((s) => s.key === key); }

  layout(animate = true) {
    const a = this.active;
    // à direita: posição fixa (o próximo pivô espia na borda direita);
    // à esquerda: o fim do conteúdo do pivô anterior encosta na borda esquerda.
    const xs = [];
    xs[a] = LEFT;
    for (let i = a + 1; i < this.screens.length; i++) xs[i] = xs[i - 1] + PAGE_W + PAGE_GAP;
    for (let i = a - 1; i >= 0; i--) {
      const p = this.screens[i];
      const visRight = Math.min(PAGE_W, Math.max(200, (p.contentW || PAGE_W) + (p.tx || 0)));
      xs[i] = xs[i + 1] - PAGE_GAP - visRight;
    }
    this.screens.forEach((p, i) => {
      const x = xs[i];
      p.el.style.transition = animate ? '' : 'none';
      p.el.style.transform = `translate3d(${x}px,0,0)`;
      p.el.classList.toggle('peek', Math.abs(i - a) === 1);
      p.el.classList.toggle('far', Math.abs(i - a) > 1);
      if (p.active !== (i === a)) p.setActive(i === a);
      if (!animate) { void p.el.offsetWidth; p.el.style.transition = ''; }
    });
    this.tabs.forEach((t, i) => t.classList.toggle('on', i === a));
    // as abas deslizam um pouco junto, como no original
    const off = this.tabs[a] ? this.tabs[a].offsetLeft - this.tabs[0].offsetLeft : 0;
    this.tabsEl.style.transform = `translate3d(${-Math.min(off, off * 0.35)}px,0,0)`;
    document.documentElement.dataset.blade = 'metro';
  }

  go(i, { silent = false } = {}) {
    if (i < 0 || i >= this.screens.length || i === this.active) return false;
    this.active = i;
    this.layout(true);
    if (!silent) sfx.blade();
    this.onChange && this.onChange(this.current);
    return true;
  }
  next() { return this.go(this.active + 1); }
  prev() { return this.go(this.active - 1); }
}
