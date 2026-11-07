// Notificações "toast" (pílula que sobe na parte de baixo, estilo da época).
import { h } from './util.js';

let stack = null;

export function toast(text, { type = 'info', ms = 3600 } = {}) {
  if (!stack) {
    stack = h('div', { class: 'toast-stack' });
    document.getElementById('toasts').append(stack);
  }
  const el = h('div', { class: 'toast ' + type, role: 'status' },
    h('div', { class: 't-icon' }),
    h('div', { class: 't-text', text }));
  stack.prepend(el);
  while (stack.children.length > 3) stack.lastElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, ms);
  return el;
}
