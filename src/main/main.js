const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const lib = require('./library');

let win = null;

// Só uma instância: abrir de novo traz a janela pra frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

// Ícone pessoal (assets/local, fora do git) tem prioridade sobre a orbe padrão.
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const ICON = require('fs').existsSync(path.join(ASSETS, 'local', 'icon.ico'))
  ? path.join(ASSETS, 'local', 'icon.ico')
  : path.join(ASSETS, 'icon.ico');

function applyAutostart(enabled) {
  if (!app.isPackaged) {
    // Em modo dev, registra electron.exe + caminho do app.
    // O Electron junta path + args sem aspas: com espaços no caminho (ex.: "Área de Trabalho") o Windows quebraria o comando.
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      name: 'Blade Dash',
      path: `"${process.execPath}"`,
      args: [`"${path.resolve(__dirname, '..', '..')}"`],
    });
  } else {
    app.setLoginItemSettings({ openAtLogin: !!enabled, name: 'Blade Dash' });
  }
}

function createWindow() {
  const settings = lib.getSettings();
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    fullscreen: settings.fullscreen !== false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1a06',
    title: 'Blade Dash',
    icon: ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => (win = null));
}

function send(ch, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(ch, payload);
}

function registerIpc() {
  ipcMain.handle('games:get', () => lib.getGames());
  ipcMain.handle('games:rescan', () => lib.rescan());
  ipcMain.handle('games:launch', async (_e, id) => {
    const r = await lib.launch(id);
    return r;
  });
  ipcMain.handle('games:update', (_e, id, patch) => lib.updateGame(id, patch));
  ipcMain.handle('games:addCustom', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Escolha o executável do jogo',
      filters: [{ name: 'Programas', extensions: ['exe', 'lnk', 'bat', 'url'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const exePath = r.filePaths[0];
    const name = path.basename(exePath).replace(/\.(exe|lnk|bat|url)$/i, '');
    return lib.addCustomGame({ name, exePath, args: '' });
  });
  ipcMain.handle('games:pickCover', async (_e, id) => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Escolha a capa do jogo',
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return lib.updateGame(id, { customCover: r.filePaths[0] });
  });
  ipcMain.handle('games:removeCustom', (_e, id) => lib.removeCustomGame(id));
  ipcMain.handle('games:uninstalled', () => lib.getUninstalled());
  ipcMain.handle('games:install', (_e, id) => lib.install(id));
  ipcMain.handle('games:downloads', () => lib.getDownloads());
  ipcMain.handle('storage:get', () => lib.getStorage());
  ipcMain.handle('offers:get', (_e, force) => lib.getOffers({ force: !!force }));
  ipcMain.handle('store:open', (_e, target) => lib.openStore(target));
  ipcMain.handle('settings:get', () => lib.getSettings());
  ipcMain.handle('settings:set', async (_e, patch) => {
    const s = await lib.setSettings(patch);
    if ('autostart' in patch) applyAutostart(s.autostart);
    if ('fullscreen' in patch && win) win.setFullScreen(!!s.fullscreen);
    return s;
  });
  ipcMain.handle('profile:get', () => {
    const n = os.userInfo().username || 'Jogador';
    return { name: n.charAt(0).toUpperCase() + n.slice(1) };
  });
  ipcMain.handle('win:minimize', () => win && win.minimize());
  ipcMain.handle('win:quit', () => app.quit());
  ipcMain.handle('win:fullscreen', () => win && win.setFullScreen(!win.isFullScreen()));
  ipcMain.handle('pc:shutdown', () => {
    execFile('shutdown', ['/s', '/t', '5']);
    setTimeout(() => app.quit(), 500);
  });
}

app.whenReady().then(async () => {
  await lib.init({ dataDir: app.getPath('userData') });

  lib.on('game-state', (s) => {
    send('game-state', s);
    // Jogo abriu: minimiza o dashboard. Fechou: volta pra frente.
    if (!win) return;
    if (s.running) {
      win.minimize();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  lib.on('covers-updated', (games) => send('games-updated', games));
  lib.on('downloads', (list) => send('downloads', list));
  lib.on('uninstalled-updated', (list) => send('uninstalled-updated', list));

  registerIpc();
  applyAutostart(lib.getSettings().autostart);
  createWindow();

  // Atalho global pra trazer o dashboard de volta a qualquer momento.
  globalShortcut.register('Control+Alt+Home', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
