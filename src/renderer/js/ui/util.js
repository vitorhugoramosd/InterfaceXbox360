// Utilitários de DOM e formatação (pt-BR).

/** Cria um elemento: h('div', {class:'x', onclick: fn, dataset:{a:1}}, filhos...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/** Hash FNV-1a de 32 bits (estável) */
export function hashStr(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

export const SOURCES = {
  steam:   { label: 'Steam',           short: 'Steam' },
  epic:    { label: 'Epic Games',      short: 'Epic' },
  ubisoft: { label: 'Ubisoft Connect', short: 'Ubisoft' },
  ea:      { label: 'EA app',          short: 'EA' },
  xbox:    { label: 'Xbox',            short: 'Xbox' },
  custom:  { label: 'Personalizado',   short: 'Personalizado' },
};
export const sourceLabel = (s) => (SOURCES[s] || { label: s || 'Jogo' }).label;
export const sourceShort = (s) => (SOURCES[s] || { short: s || 'Jogo' }).short;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "há 2 dias", "ontem", "agora mesmo"... */
export function relTime(ms, now = Date.now()) {
  if (!ms) return 'Nunca jogado';
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'agora mesmo';
  const m = Math.floor(s / 60);
  if (m < 60) return 'há ' + plural(m, 'minuto', 'minutos');
  const hr = Math.floor(m / 60);
  if (hr < 24) return 'há ' + plural(hr, 'hora', 'horas');
  const d = Math.floor(hr / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  if (d < 30) return 'há ' + plural(Math.floor(d / 7), 'semana', 'semanas');
  if (d < 365) return 'há ' + plural(Math.max(1, Math.floor(d / 30)), 'mês', 'meses');
  return 'há ' + plural(Math.floor(d / 365), 'ano', 'anos');
}

const nf = new Intl.NumberFormat('pt-BR');
export const fmtNum = (n) => nf.format(n);

/** Minutos -> "12 h 30 min" */
export function playtime(min) {
  min = Math.round(min || 0);
  if (min <= 0) return 'Nenhum tempo registrado';
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60), m = min % 60;
  if (hr >= 100) return `${fmtNum(hr)} h`;
  return m ? `${hr} h ${m} min` : `${hr} h`;
}
export function hours(min) {
  const hr = (min || 0) / 60;
  if (hr === 0) return '0 h';
  if (hr < 10) return hr.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
  return fmtNum(Math.round(hr)) + ' h';
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
export const sortAlpha = (list) => [...list].sort((a, b) => collator.compare(a.name || '', b.name || ''));

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
export const dateShort = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Ícones SVG simples (traço em currentColor) */
const ICONS = {
  lib:     '<path d="M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.6 1-3.4 13-3.6-1z"/>',
  star:    '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  clock:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
  plus:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M7.5 12h9"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.5 4.5v4h-4"/>',
  power:   '<path d="M12 3.5v8"/><path d="M7 6.5a7.5 7.5 0 1 0 10 0"/>',
  exit:    '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  min:     '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 15h8"/>',
  screen:  '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  sound:   '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  boot:    '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8l6 4-6 4z"/>',
  eye:     '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><path d="M4 20L20 4"/>',
  play:    '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
  edit:    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  image:   '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  trash:   '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  home:    '<path d="M4 11l8-7 8 7"/><path d="M6.5 9.5V20h11V9.5"/>',
  gear:    '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  back:    '<path d="M10 6l-6 6 6 6M4 12h16"/>',
};
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/** Avatar gerado: gradiente pelo hash do nome + inicial */
export function fillAvatar(el, name) {
  const hs = hashStr(name || 'J');
  const hue = (hs % 360);
  el.style.setProperty('--av1', `hsl(${hue} 75% 58%)`);
  el.style.setProperty('--av2', `hsl(${(hue + 40) % 360} 80% 22%)`);
  el.replaceChildren(h('span', { class: 'av-letter', text: (name || 'J').trim().charAt(0).toUpperCase() }));
}

/** replaceChildren que ignora null/false (replaceChildren nativo vira texto "null") */
export function put(el, ...kids) {
  el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  return el;
}
