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
