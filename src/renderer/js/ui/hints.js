// Barra de dicas de botões (A Selecionar, B Voltar, ...).
// Em modo teclado mostra também a tecla correspondente.
import { h } from './util.js';

const KEYS = { a: 'Enter', b: 'Esc', x: 'X', y: 'Y', lbrb: 'Q / E', back: 'G', start: 'X', guide: 'Home' };
let mode = 'kb';
let lastSig = '';

export function setHintMode(m) { if (m !== mode) { mode = m; lastSig = ''; } }
export const hintMode = () => mode;

/** Glyph de botão desenhado em CSS */
export function glyph(btn, extra = '') {
  switch (btn) {
    case 'a': case 'b': case 'x': case 'y':
      return h('span', { class: `glyph ${btn} ${extra}`, text: btn.toUpperCase() });
    case 'lb': return h('span', { class: `glyph pill ${extra}`, text: 'LB' });
    case 'rb': return h('span', { class: `glyph pill ${extra}`, text: 'RB' });
    case 'back': return h('span', { class: `glyph pill dark ${extra}`, text: '❐' });
    case 'start': return h('span', { class: `glyph pill dark ${extra}`, text: '☰' });
    case 'guide': return h('span', { class: `glyph ring ${extra}` });
    default: return h('span', { class: 'glyph' });
  }
}

/** list: [[botão, rótulo], ...]  botão 'lbrb' = LB/RB juntos */
export function renderHints(list) {
  const sig = mode + JSON.stringify(list);
  if (sig === lastSig) return;
  lastSig = sig;
  const bar = document.getElementById('hints');
  const items = [];
  const right = [];
  for (const [btn, label] of list) {
    const parts = btn === 'lbrb' ? [glyph('lb'), glyph('rb')] : [glyph(btn)];
    const el = h('div', { class: 'hint' }, parts, mode === 'kb' && KEYS[btn] ? h('span', { class: 'kcap', text: KEYS[btn] }) : null, h('span', { text: label }));
    (btn === 'guide' ? right : items).push(el);
  }
  bar.replaceChildren(...items, h('div', { class: 'spacer' }), ...right);
  bar.title = 'Teclado: setas/WASD mover · Enter/Espaço = A · Esc/Backspace = B · X/Tab = X · Y/F = Y · Q/E ou PgUp/PgDn = LB/RB · G = trocar visualização · Home = Guia';
}
