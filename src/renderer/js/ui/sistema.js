// Blade "sistema": configurações, jogos ocultos, sair/minimizar/desligar.
import { h, icon, sortAlpha, sourceLabel, fmtNum } from './util.js';
import { createCover } from './cover.js';
import { state, on } from '../store.js';
import { sfx } from '../sound.js';
import { dash, has, isMock } from '../api.js';
import { toast } from './toast.js';
import { confirmShutdown, toggleSetting, switchTheme, unhideGame, THEMES, currentTheme } from './actions.js';
import { caps, loadStorage } from '../extras.js';
import { fmtBytes } from './util.js';

const ITEMS = [
  { key: 'autostart', label: 'Iniciar com o Windows', icon: 'boot', type: 'toggle',
    desc: 'Abre o Blade Dash automaticamente quando você liga o PC, como um console.' },
  { key: 'fullscreen', label: 'Tela cheia', icon: 'screen', type: 'toggle',
    desc: 'Ocupa a tela inteira, sem bordas de janela. Recomendado para usar com controle na TV.' },
  { key: 'sounds', label: 'Sons da interface', icon: 'sound', type: 'toggle',
    desc: 'Sons ao navegar, trocar de blade e selecionar.' },
  { key: 'theme', label: 'Visual do dashboard', icon: 'screen', type: 'theme',
    desc: 'Escolha entre o visual Metro (2011), com abas e blocos, e o Blades (2005), com lâminas. A troca é aplicada na hora.' },
  { key: 'hidden', label: 'Jogos ocultos', icon: 'eye', type: 'list',
    desc: 'Jogos que você ocultou não aparecem na biblioteca. Selecione um para reexibi-lo.' },
  { key: 'storage', label: 'Armazenamento', icon: 'disk', type: 'storage',
    desc: 'Espaço livre em cada disco e os jogos que mais ocupam espaço.' },
  { sep: true },
  { key: 'minimize', label: 'Minimizar', icon: 'min', type: 'action',
    desc: 'Minimiza o Blade Dash e mostra a área de trabalho. Ele continua aberto em segundo plano.' },
  { key: 'quit', label: 'Sair para a área de trabalho', icon: 'exit', type: 'action',
    desc: 'Fecha o Blade Dash.' },
  { key: 'shutdown', label: 'Desligar o PC', icon: 'power', type: 'action', danger: true,
    desc: 'Desliga o computador (pede confirmação antes).' },
];

export function createSistema() {
  const items = ITEMS.filter((i) => !i.sep);
  let idx = 0, zone = 'items', hidIdx = 0, hidden = [];

  const rows = [];
  const menu = h('div', { class: 'menu' });
  let n = 0;
  for (const it of ITEMS) {
    if (it.sep) { menu.append(h('div', { class: 'sep' })); continue; }
    const extra = it.type === 'toggle' ? h('span', { class: 'switch val' }) : (it.type === 'list' || it.type === 'theme') ? h('span', { class: 'cnt' }) : null;
    const row = h('div', { class: 'mi', dataset: { nav: 'sys', i: n++ } }, icon(it.icon), h('span', { text: it.label }), extra);
    row._extra = extra;
    rows.push(row);
    menu.append(row);
  }
  const panel = h('div', { class: 'sys-panel' });
  const el = h('div', { class: 'sistema' }, h('div', { class: 'sys-menu' }, menu), panel);

  function paintToggles() {
    items.forEach((it, i) => {
      if (it.type === 'toggle') rows[i]._extra.classList.toggle('on', !!state.settings[it.key]);
      if (it.type === 'list') rows[i]._extra.textContent = fmtNum(hidden.length);
      if (it.type === 'theme') rows[i]._extra.textContent = 'Blades';
    });
  }
  function paint() {
    rows.forEach((r, i) => {
      r.classList.toggle('focus', zone === 'items' && i === idx);
      r.classList.toggle('sel', zone === 'hidden' && i === idx);
    });
    renderPanel();
  }

  function renderPanel() {
    const it = items[idx];
    const about = h('div', { class: 'sys-about' },
      h('span', { text: 'Blade Dash 1.0' }),
      h('span', { text: `${fmtNum(state.games.length)} jogos detectados` }),
      h('span', { text: state.padConnected ? 'Controle: conectado' : 'Controle: aperte um botão para detectar' }),
      isMock ? h('span', { text: 'Modo demonstração' }) : null);
    const kids = [h('h2', { text: it.label }), h('p', { text: it.desc })];
    if (it.type === 'toggle') {
      const v = !!state.settings[it.key];
      kids.push(h('div', { class: 'state' }, h('span', { class: 'switch' + (v ? ' on' : '') }), h('span', { text: v ? 'Ativado' : 'Desativado' })));
    }
    if (it.type === 'list') {
      if (!hidden.length) kids.push(h('div', { class: 'state', text: 'Nenhum jogo oculto.' }));
      else {
        const list = h('div', { class: 'hid-list' });
        hidden.forEach((g, i) => list.append(h('div', { class: 'hid-item' + (zone === 'hidden' && i === hidIdx ? ' focus' : ''), dataset: { nav: 'hid', i } },
          createCover(g), h('span', { text: g.name }), h('span', { class: 'src', text: zone === 'hidden' && i === hidIdx ? 'A: reexibir' : sourceLabel(g.source) }))));
        kids.push(list);
        // rola a lista para manter o item focado visível
        requestAnimationFrame(() => {
          const f = list.children[hidIdx];
          if (f) list.scrollTop = Math.max(0, f.offsetTop - list.clientHeight / 2);
        });
      }
    }
    if (it.type === 'theme') {
      const cur = currentTheme();
      kids.push(h('div', { class: 'state' }, h('span', { text: 'Atual: ' + THEMES[cur] + ' — pressione A para usar ' + THEMES[cur === 'metro' ? 'blades' : 'metro'] })));
    }
    if (it.type === 'storage') kids.push(storagePanel());
    if (it.key === 'shutdown') kids.push(h('div', { class: 'state warn', text: 'Salve seus jogos antes de desligar.' }));
    panel.replaceChildren(...kids, about);
  }

  // --- armazenamento (lido ao focar o item)
  let storageAsked = false;
  function storagePanel() {
    if (!caps.storage) return h('div', { class: 'state', text: 'Indisponível nesta versão.' });
    if (!storageAsked) { storageAsked = true; loadStorage(); }
    const l = state.storage;
    if (!l) return h('div', { class: 'state', text: 'Lendo os discos...' });
    if (!l.length) return h('div', { class: 'state', text: 'Informação de disco indisponível.' });
    const pct = (v, t) => (t > 0 ? (v / t * 100).toFixed(2) + '%' : '0');
    return h('div', { style: { marginTop: '20px', maxHeight: '360px', overflow: 'hidden' } }, l.map((d) => {
      const used = d.total - d.free, games = Math.min(used, d.gamesBytes || 0);
      return h('div', { class: 'drv' },
        h('h3', { text: `${d.drive} ${d.label || ''} — ${fmtBytes(d.free)} livres de ${fmtBytes(d.total)}` }),
        h('div', { class: 'dbar' }, h('i', { class: 'g', style: { width: pct(games, d.total) } }), h('i', { class: 'o', style: { width: pct(used - games, d.total) } })),
        h('div', { class: 'lg' }, h('span', { text: 'jogos ' + fmtBytes(games) }), h('span', { text: 'outros ' + fmtBytes(used - games) }), h('span', { text: 'livre ' + fmtBytes(d.free) })),
        (d.games || []).length ? h('div', { class: 'top' }, [...d.games].sort((a, b) => b.bytes - a.bytes).slice(0, 4).map((g) => h('div', {}, h('span', { text: g.name }), h('b', { text: fmtBytes(g.bytes) })))) : null);
    }));
  }

  async function toggle(it) {
    await toggleSetting(it.key);
    paintToggles(); renderPanel();
  }

  function activate() {
    const it = items[idx];
    if (it.type === 'toggle') return toggle(it);
    if (it.type === 'theme') return switchTheme();
    if (it.type === 'storage') { storageAsked = false; sfx.select(); return renderPanel(); } // A = reler os discos
    if (it.type === 'list') {
      if (hidden.length) { zone = 'hidden'; hidIdx = Math.min(hidIdx, hidden.length - 1); sfx.move(); paint(); }
      else sfx.error();
      return;
    }
    sfx.select();
    if (it.key === 'minimize') has('minimize') ? dash.minimize() : toast('Indisponível neste modo.');
    if (it.key === 'quit') dash.quit();
    if (it.key === 'shutdown') confirmShutdown();
  }

  const unhide = (g) => unhideGame(g);

  function handle(a, meta) {
    if (zone === 'hidden') {
      switch (a) {
        case 'up': if (hidIdx > 0) { hidIdx--; sfx.move(); paint(); } return true;
        case 'down': if (hidIdx < hidden.length - 1) { hidIdx++; sfx.move(); paint(); } return true;
        case 'a': if (hidden[hidIdx]) unhide(hidden[hidIdx]); return true;
        case 'b': case 'left': zone = 'items'; sfx.back(); paint(); return true;
        case 'right': return true;
        default: return false;
      }
    }
    switch (a) {
      case 'up': if (idx > 0) { idx--; sfx.move(); paint(); } return true;
      case 'down': if (idx < items.length - 1) { idx++; sfx.move(); paint(); } return true;
      case 'a': activate(); return true;
      case 'right':
        if (items[idx].type === 'list' && hidden.length && !meta.repeat) { zone = 'hidden'; sfx.move(); paint(); return true; }
        return false;
      default: return false;
    }
  }
  function hints() {
    if (zone === 'hidden') return [['a', 'Reexibir'], ['b', 'Voltar'], ['lbrb', 'Trocar blade'], ['guide', 'Guia']];
    const it = items[idx];
    const lbl = it.type === 'toggle' ? 'Alternar' : it.type === 'list' ? 'Abrir' : it.type === 'theme' ? 'Trocar visual' : it.type === 'storage' ? 'Atualizar' : 'Selecionar';
    return [['a', lbl], ['lbrb', 'Trocar blade'], ['guide', 'Guia']];
  }
  function pointer(target, type) {
    const nav = target.closest('[data-nav]');
    if (!nav) return;
    const i = +nav.dataset.i;
    if (nav.dataset.nav === 'sys') {
      if (zone !== 'items' || i !== idx) { zone = 'items'; idx = i; sfx.move(); paint(); }
      if (type === 'click') activate();
    } else if (nav.dataset.nav === 'hid') {
      if (zone !== 'hidden' || i !== hidIdx) { zone = 'hidden'; hidIdx = i; sfx.move(); paint(); }
      if (type === 'click') unhide(hidden[i]);
    }
  }

  function refresh() {
    hidden = sortAlpha(state.games.filter((g) => g.hidden));
    if (zone === 'hidden' && !hidden.length) zone = 'items';
    hidIdx = Math.min(hidIdx, Math.max(0, hidden.length - 1));
    paintToggles();
    paint();
  }
  on('games', refresh);
  on('settings', () => { paintToggles(); renderPanel(); });
  on('pad', () => renderPanel());
  on('storage', () => { if (items[idx] && items[idx].type === 'storage') renderPanel(); });
  refresh();

  return {
    key: 'sistema', title: 'sistema', theme: 'sistema', el, handle, hints, pointer,
    onEnter() { zone = 'items'; paint(); },
  };
}
