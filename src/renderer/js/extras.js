// v2: não instalados, downloads, armazenamento e ofertas.
// Carrega os dados do backend, mantém no store e emite eventos:
//   'uninstalled', 'downloads', 'storage', 'offers'.
// Tudo degrada sem erro se o backend for antigo (métodos ausentes).
import { dash, has } from './api.js';
import { state, on, emit, getGame } from './store.js';
import { toast } from './ui/toast.js';
import { sfx } from './sound.js';
import { openConfirm, openMenu } from './ui/modal.js';
import { h, fmtPct } from './ui/util.js';

export const caps = {
  get uninstalled() { return has('getUninstalled'); },
  get install() { return has('install'); },
  get downloads() { return has('getDownloads'); },
  get storage() { return has('getStorage'); },
  get offers() { return has('getOffers'); },
  get store() { return has('openStore'); },
};

/* ------------------------------------------------------- não instalados */
export async function loadUninstalled() {
  if (!caps.uninstalled) return;
  try { setUninstalled(await dash.getUninstalled()); } catch (e) { console.error(e); }
}
function setUninstalled(list) {
  state.uninstalled = Array.isArray(list) ? list : [];
  emit('uninstalled', state.uninstalled);
}

/** Confirmação + dash.install(id) */
export async function confirmInstall(g, theme = 'jogos') {
  if (!g) return;
  if (!caps.install) { sfx.error(); toast('Instalação indisponível nesta versão.', { type: 'error' }); return; }
  const ok = await openConfirm({
    theme, title: `Baixar ${g.name}?`,
    text: 'A Steam vai abrir para você escolher o disco e confirmar.',
    yes: 'Baixar pela Steam', yesIcon: 'download',
  });
  if (!ok) return;
  try {
    const r = await dash.install(g.id);
    if (r && r.ok === false) { sfx.error(); toast(r.error || 'Não foi possível abrir a Steam.', { type: 'error', ms: 5000 }); }
    else toast(`Abrindo a Steam para instalar ${g.name}...`, { ms: 3600 });
  } catch (e) {
    console.error(e); sfx.error(); toast('Não foi possível abrir a Steam.', { type: 'error' });
  }
}

/* ------------------------------------------------------------ downloads */
const pending = new Map(); // id -> { name, until } — terminou, aguardando aparecer em getGames()

export const downloadFor = (id) => state.downloads.find((d) => d.id === id) || null;

/** Progresso agregado (ponderado pelos bytes quando houver) */
export function downloadsSummary() {
  const list = state.downloads;
  if (!list.length) return null;
  let done = 0, total = 0;
  for (const d of list) {
    if (d.bytesTotal > 0) { done += d.bytesDownloaded || 0; total += d.bytesTotal; }
  }
  const progress = total > 0 ? done / total : list.reduce((s, d) => s + (d.progress || 0), 0) / list.length;
  return { count: list.length, progress };
}

export function setDownloads(list) {
  const next = Array.isArray(list) ? list : [];
  const ids = new Set(next.map((d) => d.id));
  for (const d of state.downloads) {
    if (!ids.has(d.id)) {
      // sumiu da lista: terminou (ou foi cancelado). Confirma quando o jogo aparecer.
      pending.set(d.id, { name: d.name, until: Date.now() + 120000, wasInstalled: !!getGame(d.id) && d.state === 'updating' });
    }
  }
  state.downloads = next;
  checkFinished();
  emit('downloads', next);
}

function checkFinished() {
  const now = Date.now();
  for (const [id, p] of pending) {
    const g = getGame(id);
    if (g && !g.hidden && !downloadFor(id)) {
      pending.delete(id);
      sfx.notify();
      toast(p.wasInstalled ? `${g.name} foi atualizado` : `${g.name} está pronto para jogar!`, { ms: 5000 });
    } else if (now > p.until) pending.delete(id);
  }
}

/* -------------------------------------------------------- armazenamento */
export async function loadStorage() {
  if (!caps.storage) { state.storage = []; emit('storage', state.storage); return; }
  try {
    const d = await dash.getStorage();
    state.storage = Array.isArray(d) ? d : [];
  } catch (e) { console.error(e); state.storage = state.storage || []; }
  emit('storage', state.storage);
}

/* ---------------------------------------------------------------- ofertas */
export async function loadOffers(force = false) {
  if (!caps.offers) { state.offersStatus = 'error'; state.offers = { steam: [], epicFree: [], error: 'Ofertas indisponíveis nesta versão.' }; emit('offers', state.offers); return; }
  if (state.offersStatus === 'loading') return;
  state.offersStatus = 'loading';
  emit('offers', state.offers);
  try {
    const r = await dash.getOffers(!!force);
    const steam = (r && Array.isArray(r.steam)) ? r.steam : [];
    const epicFree = (r && Array.isArray(r.epicFree)) ? r.epicFree : [];
    state.offers = { ...(r || {}), steam, epicFree };
    state.offersStatus = steam.length || epicFree.length ? 'ok' : 'error';
    if (force && state.offersStatus === 'ok' && !offersStale()) toast('Ofertas atualizadas', { ms: 2200 });
  } catch (e) {
    console.error(e);
    state.offersStatus = state.offers && (state.offers.steam || []).length ? 'ok' : 'error';
    state.offers = { ...(state.offers || { steam: [], epicFree: [] }), error: 'Não foi possível carregar as ofertas.' };
  }
  emit('offers', state.offers);
}
/** Ofertas desatualizadas = backend devolveu erro junto do cache, ou cache com mais de 3 h */
export function offersStale() {
  const o = state.offers;
  if (!o) return false;
  return !!o.stale || !!o.error || (o.fetchedAt && Date.now() - o.fetchedAt > 3 * 3600 * 1000);
}

export async function openOffer(target, label = 'loja') {
  if (!target) return;
  if (!caps.store) { sfx.error(); toast('Abrir a loja não está disponível nesta versão.', { type: 'error' }); return; }
  sfx.select();
  try {
    const r = await dash.openStore(target);
    if (r && r.ok === false) { sfx.error(); toast(r.error || 'Não foi possível abrir a loja.', { type: 'error' }); }
    else toast(`Abrindo ${label}...`, { ms: 2400 });
  } catch (e) { console.error(e); sfx.error(); toast('Não foi possível abrir a loja.', { type: 'error' }); }
}

/** X numa oferta: detalhes + abrir na Steam */
export function offerDetails(o, theme = 'jogos') {
  openMenu({
    theme, title: o.name,
    sub: o.discount ? `-${o.discount}% · ${o.priceText || ''}` : (o.priceText || ''),
    body: h('p', {}, o.originalText ? `De ${o.originalText} por ${o.priceText}.` : (o.priceText || ''), o.owned ? ' Você já tem este jogo.' : ''),
    items: [
      { label: 'Abrir na Steam', icon: 'tag', silent: true, onSelect: () => openOffer('steam:' + o.appid, 'na Steam') },
      { label: 'Voltar', icon: 'back' },
    ],
  });
}

/* ---------------------------------------------------------------- init */
export function initExtras() {
  loadUninstalled();
  if (caps.downloads) {
    dash.getDownloads().then(setDownloads).catch(console.error);
    if (has('onDownloads')) dash.onDownloads((l) => setDownloads(l));
    else setInterval(() => dash.getDownloads().then(setDownloads).catch(() => {}), 5000); // backend sem evento
  }
  if (has('onUninstalledUpdated')) dash.onUninstalledUpdated((l) => setUninstalled(l));
  on('games', () => checkFinished());
}

/** Texto curto do estado do download */
export function downloadLabel(d) {
  if (!d) return '';
  const st = { downloading: 'Baixando', paused: 'Pausado', queued: 'Na fila', updating: 'Atualizando' }[d.state] || 'Baixando';
  return d.state === 'queued' ? st : `${st} ${fmtPct(d.progress)}`;
}
