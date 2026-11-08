const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('dash', {
  getGames: invoke('games:get'),
  rescan: invoke('games:rescan'),
  launch: invoke('games:launch'),
  updateGame: invoke('games:update'),
  addCustomGame: invoke('games:addCustom'),
  pickCover: invoke('games:pickCover'),
  removeCustomGame: invoke('games:removeCustom'),
  getUninstalled: invoke('games:uninstalled'),
  install: invoke('games:install'),
  getDownloads: invoke('games:downloads'),
  getStorage: invoke('storage:get'),
  getOffers: invoke('offers:get'),
  openStore: invoke('store:open'),
  onDownloads: (cb) => ipcRenderer.on('downloads', (_e, l) => cb(l)),
  onUninstalledUpdated: (cb) => ipcRenderer.on('uninstalled-updated', (_e, l) => cb(l)),
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  getProfile: invoke('profile:get'),
  onGameState: (cb) => ipcRenderer.on('game-state', (_e, s) => cb(s)),
  onGamesUpdated: (cb) => ipcRenderer.on('games-updated', (_e, g) => cb(g)),
  minimize: invoke('win:minimize'),
  quit: invoke('win:quit'),
  toggleFullscreen: invoke('win:fullscreen'),
  shutdownPC: invoke('pc:shutdown'),
});
