// Pilha de modais (pop-ups): menu estilo blade, confirmação, texto.
// Cada modal tem { el, handle(action, meta) -> bool, pointer(el, type), hints() }.
import { h, icon } from './util.js';
import { glyph } from './hints.js';
import { sfx } from '../sound.js';

const stack = [];
const layer = () => document.getElementById('modal-layer');
export const topModal = () => stack[stack.length - 1] || null;
export const modalCount = () => stack.length;

function syncVeil() {
  document.body.classList.toggle('modal', stack.some((m) => m.veil !== false));
}
export function pushModal(m) {
  stack.push(m);
  layer().append(m.el);
  syncVeil();
}
export function closeModal(m) {
  const i = stack.indexOf(m);
  if (i < 0) return;
  stack.splice(i, 1);
  syncVeil();
  const el = m.el;
  el.classList.add('out');
  const done = () => el.remove();
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400);
  if (m.onClose) m.onClose();
}
export function closeAll() { [...stack].reverse().forEach((m) => { if (!m.blocking) closeModal(m); }); }

/**
 * Menu pop-up.
 * items: [{ label, icon, value, danger, disabled, silent, keep, onSelect }]
 * onClose: chamado só quando o menu é fechado sem escolha (B / fechar tudo)
 */
export function openMenu({ theme = 'jogos', title, sub, cover, head, body, items, cls = '', isGuide = false, startIndex = 0, onClose }) {
  let idx = Math.min(startIndex, items.length - 1);
  while (items[idx] && items[idx].disabled) idx++;

  const rows = items.map((it, i) => h('div', {
    class: 'mi' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : ''),
    dataset: { nav: 'mi', i },
  }, it.icon ? icon(it.icon) : null, h('span', { text: it.label }), it.value ? h('span', { class: 'cnt', text: it.value }) : null));

  const headEl = h('div', { class: 'pop-head' },
    head || null,
    cover || null,
    h('div', { class: 'ph-text' },
      h('div', { class: 'pop-title', text: title || '' }),
      sub ? h('div', { class: 'pop-sub', text: sub }) : null));

  const el = h('div', { class: 'pop ' + cls, dataset: { theme } },
    headEl,
    h('div', { class: 'pop-body' }, body || null, h('div', { class: 'menu' }, rows)));

  const paint = () => rows.forEach((r, i) => r.classList.toggle('focus', i === idx));
  const move = (d) => {
    let j = idx + d;
    while (items[j] && items[j].disabled) j += d;
    if (j < 0 || j >= items.length) return;
    idx = j; paint(); sfx.move();
  };
  const choose = () => {
    const it = items[idx];
    if (!it || it.disabled) return;
    if (!it.silent) sfx.select();
    if (!it.keep) { m.onClose = null; closeModal(m); } // escolha != cancelamento
    it.onSelect && it.onSelect();
  };

  const m = {
    el, isGuide, onClose,
    handle(a) {
      if (a === 'up') move(-1);
      else if (a === 'down') move(1);
      else if (a === 'a') choose();
      else if (a === 'b') { sfx.close(); closeModal(m); }
      return true;
    },
    pointer(target, type) {
      const row = target.closest('[data-nav="mi"]');
      if (!row) return;
      const i = +row.dataset.i;
      if (items[i].disabled) return;
      if (i !== idx) { idx = i; paint(); if (type === 'hover') sfx.move(); }
      if (type === 'click') choose();
    },
    hints: () => [['a', 'Selecionar'], ['b', 'Voltar']],
    close: () => closeModal(m),
  };
  paint();
  sfx.open();
  pushModal(m);
  return m;
}

/** Confirmação: resolve true/false */
export function openConfirm({ title, text, yes = 'Sim', no = 'Cancelar', theme = 'sistema', danger = false, yesIcon }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } };
    openMenu({
      theme, title,
      body: text ? h('p', { text }) : null,
      startIndex: 1, // foco em "Cancelar" por segurança
      items: [
        { label: yes, icon: yesIcon, danger, onSelect: () => answer(true) },
        { label: no, icon: 'back', onSelect: () => answer(false) },
      ],
      onClose: () => answer(false),
    });
  });
}

/** Campo de texto (teclado). resolve string | null */
export function openTextInput({ title, sub, value = '', placeholder = '', theme = 'jogos', cover }) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'txt-input', type: 'text', value, placeholder, maxlength: 120, spellcheck: 'false' });
    const hints = h('div', { class: 'pop-hints' },
      h('span', {}, glyph('a'), 'Salvar (Enter)'),
      h('span', {}, glyph('b'), 'Cancelar (Esc)'));
    const el = h('div', { class: 'pop', dataset: { theme } },
      h('div', { class: 'pop-head' }, cover || null, h('div', { class: 'ph-text' },
        h('div', { class: 'pop-title', text: title }),
        sub ? h('div', { class: 'pop-sub', text: sub }) : null)),
      h('div', { class: 'pop-body' }, input, hints));
    const finish = (v) => {
      if (done) return;
      done = true;
      input.blur();
      closeModal(m);
      resolve(v);
    };
    const m = {
      el,
      handle(a) {
        if (a === 'a') { sfx.select(); finish(input.value); }
        else if (a === 'b') { sfx.back(); finish(null); }
        return true;
      },
      pointer() {},
      hints: () => [['a', 'Salvar'], ['b', 'Cancelar']],
      onClose: () => { if (!done) { done = true; resolve(null); } },
    };
    sfx.open();
    pushModal(m);
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
