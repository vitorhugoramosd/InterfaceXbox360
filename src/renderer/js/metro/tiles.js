// Tema Metro: conteúdo dos blocos (tiles) — imagem, capa e cor sólida com ícone.
import { h } from '../ui/util.js';
import { createCover, palette } from '../ui/cover.js';
import { state } from '../store.js';
import { downloadFor, downloadLabel } from '../extras.js';
import { fmtBytes } from '../ui/util.js';

// Ícones de traço simples, desenhados para o tamanho grande dos blocos
const ICONS = {
  star:    '<path d="M24 6.5l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L24 33.6l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z"/>',
  clock:   '<circle cx="24" cy="24" r="17"/><path d="M24 13v11.5l7.5 4.5"/>',
  plus:    '<path d="M24 9v30M9 24h30"/>',
  refresh: '<path d="M38 24a14 14 0 1 1-4.1-9.9"/><path d="M39 7.5v8.5h-8.5"/>',
  power:   '<path d="M24 6v17"/><path d="M14 11.5a15 15 0 1 0 20 0"/>',
  exit:    '<path d="M20 8H9v32h11"/><path d="M29 15l9 9-9 9M38 24H18"/>',
  min:     '<rect x="7" y="9" width="34" height="28"/><path d="M15 29h18"/>',
  screen:  '<rect x="6" y="9" width="36" height="23"/><path d="M17 40h14M24 32v8"/>',
  sound:   '<path d="M7 19h7l9-7v24l-9-7H7z"/><path d="M30 18a8 8 0 0 1 0 12M35 13a15 15 0 0 1 0 22"/>',
  boot:    '<rect x="10" y="6" width="28" height="36"/><path d="M19 17l11 7-11 7z"/>',
  eye:     '<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="5"/><path d="M8 40L40 8"/>',
  theme:   '<rect x="6" y="8" width="16" height="14"/><rect x="26" y="8" width="16" height="32"/><rect x="6" y="26" width="16" height="14"/>',
  download:'<path d="M24 6v24M14 21l10 10 10-10M9 41h30"/>',
  disk:    '<rect x="5" y="12" width="38" height="24"/><path d="M12 28h10"/><circle cx="35" cy="28" r="1.6"/>',
  tag:     '<path d="M6 25V6h19l17 17-19 19z"/><circle cx="15" cy="15" r="3"/>',
  pad:     '<path d="M14 15h20a9 9 0 0 1 8.7 11.2l-2.3 9.3a4.5 4.5 0 0 1-7.9 1.7L29 33H19l-3.5 4.2a4.5 4.5 0 0 1-7.9-1.7l-2.3-9.3A9 9 0 0 1 14 15z"/><path d="M15 21v8M11 25h8"/><circle cx="31" cy="23" r="1.2"/><circle cx="35" cy="27" r="1.2"/>',
  user:    '<circle cx="24" cy="17" r="8"/><path d="M8 41c2-8 8.5-12 16-12s14 4 16 12"/>',
  grid:    '<rect x="7" y="7" width="15" height="15"/><rect x="26" y="7" width="15" height="15"/><rect x="7" y="26" width="15" height="15"/><rect x="26" y="26" width="15" height="15"/>',
  search:  '<circle cx="21" cy="21" r="12"/><path d="M30 30l10 10"/>',
};
export function micon(name, cls = '') {
  const s = document.createElement('span');
  s.className = 'm-ico ' + cls;
  s.innerHTML = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter">${ICONS[name] || ''}</svg>`;
  return s;
}

/** Bloco de cor sólida: ícone grande + rótulo embaixo à esquerda */
export function solidTile({ icon, label, value, sub, iconPos = 'center' }) {
  return h('div', { class: 'mt-solid ico-' + iconPos },
    icon ? micon(icon) : null,
    value != null ? h('div', { class: 'mt-value', text: value }) : null,
    h('div', { class: 'mt-label' }, h('div', { text: label }), sub ? h('div', { class: 'mt-sub', text: sub }) : null));
}

/** URL de imagem para bloco largo (hero) ou alto (capa) */
export function artUrl(g, wide) {
  if (!g) return null;
  return wide ? (g.hero || g.cover || null) : (g.cover || g.hero || null);
}

/** Fundo de imagem com fallback em gradiente + nome (nunca imagem quebrada) */
export function artLayer(g, wide = true) {
  const p = palette(g ? g.name : '?');
  const wrap = h('div', { class: 'mt-art' },
    h('div', { class: 'mt-fallback', style: { background: `radial-gradient(90% 90% at 20% 20%, ${p.c}, transparent 65%), linear-gradient(150deg, ${p.a}, ${p.b})` } },
      h('span', { text: g ? g.name : '' })));
  const url = artUrl(g, wide);
  if (url) {
    const img = h('img', { alt: '', decoding: 'async', class: !g.hero && wide ? 'from-cover' : '' });
    img.onload = () => img.classList.add('ok');
    img.onerror = () => img.remove();
    img.src = url;
    wrap.append(img);
  }
  return wrap;
}

/** Bloco com imagem (hero) + rótulo sobre gradiente escuro */
export function imageTile(g, { label, sub, wide = true } = {}) {
  return h('div', { class: 'mt-image' + (g && g.offline ? ' offline' : '') },
    artLayer(g, wide),
    h('div', { class: 'mt-grad' }),
    g && g.offline ? offlineTag(g) : null,
    g && g.favorite ? h('div', { class: 'mt-star', text: '★' }) : null,
    g && state.running === g.id ? h('div', { class: 'mt-run', text: 'em jogo' }) : null,
    g ? dlBar(g.id) : null,
    h('div', { class: 'mt-label' }, h('div', { class: 'mt-name', text: label || (g ? g.name : '') }), sub ? h('div', { class: 'mt-sub', text: sub }) : null));
}

/** Barra de progresso de download sobre o bloco do jogo (ou null) */
export function dlBar(id, { detail = false } = {}) {
  const d = downloadFor(id);
  if (!d) return null;
  const pct = Math.round((d.progress || 0) * 100);
  const txt = detail && d.bytesTotal ? `${downloadLabel(d)} · ${fmtBytes(d.bytesDownloaded)} de ${fmtBytes(d.bytesTotal)}` : downloadLabel(d);
  return h('div', { class: 'mt-dl' + (d.state === 'queued' || d.state === 'paused' ? ' idle' : '') },
    h('div', { class: 'mt-dl-txt', text: txt }),
    h('div', { class: 'mt-dl-bar' }, h('i', { style: { width: pct + '%' } })));
}

/** Bloco de capa (retrato) — nome aparece só com foco. uninst: não instalado (esmaecido + seta) */
export function coverTile(g, lazy, { uninst = false } = {}) {
  return h('div', { class: 'mt-cover' + (uninst ? ' uninst' : '') + (g.offline ? ' offline' : '') },
    createCover(g, { lazy }),
    g.offline ? offlineTag(g) : null,
    uninst ? h('div', { class: 'mt-dlbadge' }, micon('download')) : null,
    dlBar(g.id),
    g.favorite ? h('div', { class: 'mt-star', text: '★' }) : null,
    state.running === g.id ? h('div', { class: 'mt-run', text: 'em jogo' }) : null,
    h('div', { class: 'mt-grad' }),
    h('div', { class: 'mt-label' }, h('div', { class: 'mt-name', text: g.name })));
}

/** Etiqueta "HD desconectado" (jogo de disco removível que não está conectado) */
export function offlineTag(g) {
  return h('div', { class: 'mt-offline', text: `HD ${g.drive || ''} desconectado`.replace('  ', ' ') });
}

/** Assinatura de um jogo para reaproveitar o elemento quando nada mudou */
export const gameSig = (g) => {
  if (!g) return 'none';
  const d = downloadFor(g.id);
  return [g.id, g.name, g.cover, g.hero, g.favorite, state.running === g.id, g.lastPlayed, g.playtimeMinutes, g.offline, d ? d.state + Math.round(d.progress * 100) : ''].join('~');
};
