// Estado global simples + eventos.
import { dash } from './api.js';

export const state = {
  games: [],
  settings: { autostart: false, fullscreen: true, sounds: true },
  profile: { name: 'Jogador' },
  running: null,      // id do jogo em execução
  loading: false,     // reescaneando
  padConnected: false,
};

const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, data) {
  for (const fn of listeners.get(evt) || []) {
    try { fn(data); } catch (e) { console.error(e); }
  }
}

export function setGames(list) {
  state.games = Array.isArray(list) ? list : [];
  // O backend marca game.running: recupera o "Em jogo" se o dashboard foi reaberto com um jogo aberto.
  const run = state.games.find((g) => g.running);
  if (run && !state.running) setRunning(run.id);
  emit('games', state.games);
}
export async function refreshGames() {
  try { setGames(await dash.getGames()); } catch (e) { console.error(e); }
}
export const visibleGames = () => state.games.filter((g) => !g.hidden);
export const getGame = (id) => state.games.find((g) => g.id === id) || null;

/** Atualiza um jogo no backend e no estado local */
export async function patchGame(id, patch) {
  const old = getGame(id);
  // otimista: aplica já para a UI responder na hora
  if (old) {
    const opt = { ...old };
    if ('favorite' in patch) opt.favorite = patch.favorite;
    if ('hidden' in patch) opt.hidden = patch.hidden;
    if (patch.customName) opt.name = patch.customName;
    replaceGame(opt);
  }
  try {
    const g = await dash.updateGame(id, patch);
    if (g && g.id) replaceGame(g);
    else await refreshGames();
    return g;
  } catch (e) {
    console.error(e);
    if (old) replaceGame(old);
    throw e;
  }
}
export function replaceGame(g) {
  const i = state.games.findIndex((x) => x.id === g.id);
  if (i >= 0) state.games[i] = g; else state.games.push(g);
  setGames([...state.games]);
}

export function setRunning(id) {
  state.running = id;
  emit('running', id);
}
export function setLoading(v) {
  state.loading = v;
  emit('loading', v);
}
