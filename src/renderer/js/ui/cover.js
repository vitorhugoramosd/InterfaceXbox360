// Capas: imagem real quando existir; senão (ou em erro) uma capa gerada bonita.
import { h, hashStr, sourceShort } from './util.js';

/** Paleta determinística a partir do nome */
export function palette(name) {
  const x = hashStr(name || '?');
  const hue = x % 360;
  const hue2 = (hue + 25 + ((x >>> 9) % 70)) % 360;
  return {
    a: `hsl(${hue} 62% 44%)`,
    b: `hsl(${hue2} 70% 11%)`,
    c: `hsl(${(hue + 10) % 360} 95% 68%)`,
    pattern: (x >>> 17) % 4,
  };
}

function sizeClass(name) {
  // largura média de maiúscula pesada ~0,68em; área útil ~84cqw
  const n = (name || '').length;
  const longest = Math.max(0, ...(name || '').split(/\s+/).map((w) => w.length));
  if (n <= 12 && longest <= 6) return 'xl';
  if (n <= 22 && longest <= 8) return 'l';
  if (n <= 36 && longest <= 10) return 'm';
  if (longest <= 13) return 's';
  return 'xs';
}

/** IntersectionObserver para carregar capas só quando aparecem no contêiner */
export function lazyObserver(root) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.unobserve(e.target); loadArt(e.target); }
    }
  }, { root, rootMargin: '500px' });
  return io;
}

/** Cria o elemento .cover para um jogo */
export function createCover(game, opts = {}) {
  const el = h('div', { class: 'cover' + (opts.cls ? ' ' + opts.cls : '') });
  el._ph = h('div', { class: 'ph' });
  el._gloss = h('div', { class: 'gloss' });
  el.append(el._ph, el._gloss);
  setCover(el, game, opts.lazy);
  return el;
}

/** Atualiza uma capa existente (troca de jogo ou capa baixada) */
export function setCover(el, game, lazy) {
  const g = game || { name: '', source: '' };
  const key = g.name + '|' + g.source;
  if (el._phKey !== key) {
    el._phKey = key;
    const p = palette(g.name);
    el._ph.style.setProperty('--pa', p.a);
    el._ph.style.setProperty('--pb', p.b);
    el._ph.style.setProperty('--pc', p.c);
    el._ph.replaceChildren(
      h('div', { class: 'ph-pattern p' + p.pattern }),
      h('div', { class: 'ph-band', text: sourceShort(g.source) }),
      h('div', { class: 'ph-name ' + sizeClass(g.name), text: g.name || '' }),
    );
  }
  const url = g.cover || null;
  if (el._url === url) return;
  el._url = url;
  if (el._img) { el._img.remove(); el._img = null; }
  if (!url) return;
  if (lazy) lazy.observe(el);
  else loadArt(el);
}

function loadArt(el) {
  const url = el._url;
  if (!url || (el._img && el._img._url === url)) return;
  const img = new Image();
  img.className = 'art';
  img.alt = '';
  img.decoding = 'async';
  img._url = url;
  img.onload = () => { if (el._url === url) img.classList.add('ok'); };
  img.onerror = () => { img.remove(); if (el._img === img) el._img = null; }; // fica o placeholder
  img.src = url;
  el._img = img;
  el.insertBefore(img, el._gloss);
}

/** Pré-carrega uma imagem (para fundos); resolve com a URL ou null */
export function preload(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(url);
    i.onerror = () => res(null);
    i.src = url;
  });
}
