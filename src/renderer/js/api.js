// Ponte para window.dash (preload do Electron). Fora do Electron usa o mock.
// Toda chamada é "segura": se o método não existir, avisa no console e
// devolve uma Promise com undefined — a UI degrada sem quebrar.

let impl = window.dash;
export const isMock = !impl;
if (!impl) {
  const m = await import('./mock.js');
  impl = m.createMockDash();
}

const warned = new Set();
export const has = (name) => typeof impl[name] === 'function';

export const dash = new Proxy({}, {
  get(_t, name) {
    if (name === 'then' || typeof name === 'symbol') return undefined; // não é thenable
    return (...args) => {
      const fn = impl[name];
      if (typeof fn !== 'function') {
        if (!warned.has(name)) { warned.add(name); console.warn(`[blade-dash] dash.${String(name)} indisponível`); }
        return Promise.resolve(undefined);
      }
      try {
        return Promise.resolve(fn.apply(impl, args));
      } catch (e) {
        return Promise.reject(e);
      }
    };
  },
});
