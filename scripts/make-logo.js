// Recorta o emblema redondo de uma imagem de logo (fundo branco, emblema à esquerda)
// e gera assets/local/logo.png (512px, fundo transparente) + assets/local/icon.ico.
// assets/local/ fica fora do git: a logo é de uso pessoal.
// Uso: npx electron scripts/make-logo.js <imagem>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const src = path.resolve(process.argv[process.argv.length - 1]);

const page = `<html><body><canvas id=c></canvas><script>
async function run(url){
  const img = new Image(); img.src = url; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.getElementById('c'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H).data;
  // Emblema = pixels não-brancos na parte esquerda (antes do texto).
  const maxX = Math.floor(W * 0.285);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let i = 0; i < maxX; i++) {
    const p = (y * W + i) * 4;
    if (d[p] + d[p+1] + d[p+2] < 735 && d[p+3] > 200) {
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(x1 - x0, y1 - y0) / 2;
  const out = (size) => {
    const o = document.createElement('canvas'); o.width = o.height = size;
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.beginPath(); g.arc(size/2, size/2, size/2 - 0.5, 0, Math.PI*2); g.clip();
    const k = 0.985; // corta 1,5% da borda para não sobrar halo branco
    g.drawImage(img, cx - r*k, cy - r*k, 2*r*k, 2*r*k, 0, 0, size, size);
    return o.toDataURL('image/png').split(',')[1];
  };
  return { box: [x0, y0, x1, y1], pngs: [512, 256, 64, 48, 32, 16].map(out) };
}
</script></body></html>`;

function ico(pngs, sizes) {
  const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let off = 6 + dir.length;
  pngs.forEach((p, i) => {
    const s = sizes[i] >= 256 ? 0 : sizes[i];
    dir.writeUInt8(s, i * 16); dir.writeUInt8(s, i * 16 + 1);
    dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(p.length, i * 16 + 8); dir.writeUInt32LE(off, i * 16 + 12);
    off += p.length;
  });
  return Buffer.concat([header, dir, ...pngs]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false } });
  const tmp = path.join(app.getPath('temp'), 'blade-dash-make-logo.html');
  fs.writeFileSync(tmp, page);
  await win.loadFile(tmp);
  const r = await win.webContents.executeJavaScript(`run(${JSON.stringify(pathToFileURL(src).href)})`);
  const bufs = r.pngs.map((b) => Buffer.from(b, 'base64'));
  const dir = path.join(__dirname, '..', 'assets', 'local');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'logo.png'), bufs[0]);
  fs.writeFileSync(path.join(dir, 'icon.ico'), ico(bufs.slice(1), [256, 64, 48, 32, 16]));
  console.log('emblema em', r.box.join(','), '->', dir);
  app.exit(0);
});
