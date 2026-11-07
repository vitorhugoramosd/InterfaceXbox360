// Teste de fumaça: abre o app real (dados reais), navega com teclado e salva prints.
// Uso: npx electron scripts/smoke-main.js <pasta-de-saida>
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = path.resolve(process.argv[process.argv.length - 1]);
fs.mkdirSync(out, { recursive: true });
app.setName('blade-dash');
app.setPath('userData', path.join(app.getPath('appData'), 'blade-dash'));

const errors = [];
app.on('browser-window-created', (_e, win) => {
  win.setFullScreen(false);
  win.setSize(1600, 900);
  win.webContents.on('console-message', (_ev, level, msg) => { if (level >= 2) errors.push(msg); });
  win.webContents.once('did-finish-load', () => run(win).catch((e) => { console.error(e); app.exit(1); }));
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function key(win, keyCode) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await wait(700);
}
async function shot(win, name) {
  win.setFullScreen(false);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, name + '.png'), img.toPNG());
  console.log('shot', name);
}

async function run(win) {
  await wait(5000);
  await shot(win, '1-jogos');
  await key(win, 'Down'); await key(win, 'Right'); await key(win, 'Right');
  await shot(win, '2-jogos-nav');
  await key(win, 'X');
  await shot(win, '3-opcoes');
  await key(win, 'Escape');
  for (const n of ['4-recentes', '5-sistema', '6-perfil']) { await key(win, 'E'); await wait(600); await shot(win, n); }
  const n = await win.webContents.executeJavaScript('document.querySelectorAll("img").length');
  console.log('imgs no DOM:', n);
  console.log('erros no console:', errors.length ? errors : 'nenhum');
  app.exit(0);
}

require('../src/main/main.js');
