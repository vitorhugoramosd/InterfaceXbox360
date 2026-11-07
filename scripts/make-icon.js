// Gera assets/icon.ico (orbe verde) renderizando HTML offscreen.
// Uso: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = `<html><body style="margin:0;background:transparent">
<div style="width:256px;height:256px;display:flex;align-items:center;justify-content:center">
 <div style="width:232px;height:232px;border-radius:50%;position:relative;
   background:radial-gradient(circle at 50% 38%,#eaffd0 0%,#9be33a 22%,#4fa612 52%,#1f5c06 80%,#0d3002 100%);
   box-shadow:inset 0 -14px 30px rgba(0,0,0,.45),inset 0 10px 24px rgba(255,255,255,.35)">
  <div style="position:absolute;inset:34px;border-radius:50%;border:16px solid rgba(255,255,255,.88);
    box-shadow:0 0 18px rgba(220,255,170,.9),inset 0 0 14px rgba(220,255,170,.8)"></div>
  <div style="position:absolute;left:46px;top:16px;width:140px;height:70px;border-radius:50%;
    background:linear-gradient(rgba(255,255,255,.75),rgba(255,255,255,0))"></div>
 </div></div></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  const sizes = [256, 64, 48, 32, 16];
  const pngs = sizes.map((s) => (s === 256 ? img.resize({ width: 256, height: 256 }) : img.resize({ width: s, height: s, quality: 'best' })).toPNG());
  // ICO com PNGs embutidos
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((p, i) => {
    const s = sizes[i] === 256 ? 0 : sizes[i];
    dir.writeUInt8(s, i * 16); dir.writeUInt8(s, i * 16 + 1);
    dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(p.length, i * 16 + 8); dir.writeUInt32LE(offset, i * 16 + 12);
    offset += p.length;
  });
  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([header, dir, ...pngs]));
  fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0]);
  console.log('ok');
  app.exit(0);
});
