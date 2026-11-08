'use strict';
// Teste da API v2 em node puro:  node scripts/v2-test.js [--force-offers]
// NÃO chama install()/openStore() com alvos válidos (nada é aberto); só testa as rejeições.
const path = require('path');
const lib = require('../src/main/library');

const dataDir = path.join(path.resolve(__dirname, '..'), '.devdata');
const pad = (s, n) => {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
};
const gb = (b) => (typeof b === 'number' ? (b / 1024 ** 3).toFixed(1) + ' GB' : '?');
const time = async (label, fn) => {
  const t = Date.now();
  const r = await fn();
  console.log(`\n== ${label} (${Date.now() - t} ms)`);
  return r;
};

(async () => {
  await time('init', () => lib.init({ dataDir }));
  let events = { downloads: 0, uninstalled: 0, covers: 0 };
  lib.on('downloads', () => events.downloads++);
  lib.on('uninstalled-updated', () => events.uninstalled++);
  lib.on('covers-updated', () => events.covers++);

  const games = await time('rescan', () => lib.rescan());
  console.log(`${games.length} jogos instalados`);
  for (const g of games) console.log('  ' + pad(g.id, 46) + pad(g.name, 36) + pad(g.drive, 4) + gb(g.sizeBytes));

  let un = await time('getUninstalled', () => lib.getUninstalled());
  console.log(`${un.length} não instalados; primeiros 20:`);
  for (const g of un.slice(0, 20)) console.log('  ' + pad(g.id, 16) + pad(g.name, 50) + (g.cover ? 'capa' : '-') + ' ' + (g.hero ? 'hero' : '-'));
  if (un[0]) console.log('shape:', JSON.stringify(un[0]));

  const dl = await time('getDownloads', () => lib.getDownloads());
  console.log(dl.length ? JSON.stringify(dl, null, 1) : '(nenhum download)');

  const st = await time('getStorage', () => lib.getStorage());
  for (const d of st) {
    console.log(`  ${d.drive} ${pad(d.label, 14)} total ${gb(d.total)}  livre ${gb(d.free)}  jogos ${gb(d.gamesBytes)} (${d.games.length})`);
    for (const g of d.games) console.log(`      ${pad(g.name, 40)} ${gb(g.bytes)}`);
  }
  if (st[0]) console.log('shape:', JSON.stringify({ ...st[0], games: st[0].games.slice(0, 1) }));

  const force = process.argv.includes('--force-offers');
  const of = await time('getOffers' + (force ? ' (force)' : ''), () => lib.getOffers({ force }));
  console.log(`fetchedAt ${of.fetchedAt && new Date(of.fetchedAt).toISOString()} stale=${!!of.stale} steam=${of.steam.length} epicFree=${of.epicFree.length}`);
  for (const o of of.steam.slice(0, 10))
    console.log(`  -${String(o.discount).padStart(2)}%  ${pad(o.name, 40)} ${pad(o.priceText, 11)} (de ${o.originalText})${o.owned ? '  [na biblioteca]' : ''}`);
  if (of.steam[0]) console.log('shape:', JSON.stringify(of.steam[0]));
  for (const e of of.epicFree)
    console.log(`  ${e.current ? 'AGORA ' : 'EM BREVE'} ${pad(e.title, 40)} ${new Date(e.startDate).toLocaleDateString('pt-BR')} → ${new Date(e.endDate).toLocaleDateString('pt-BR')}  ${e.url}`);
  if (of.epicFree[0]) console.log('shape:', JSON.stringify(of.epicFree[0]));
  const of2 = await time('getOffers (cache)', () => lib.getOffers({}));
  console.log('cache igual:', of2.fetchedAt === of.fetchedAt);

  console.log('\n== rejeições (nada é aberto)');
  console.log('install(epic:x):', JSON.stringify(await lib.install('epic:Turkey')));
  console.log('openStore(evil):', JSON.stringify(await lib.openStore('https://evil.example.com/')));
  console.log('openStore(http):', JSON.stringify(await lib.openStore('http://store.steampowered.com/app/1/')));
  console.log('openStore(file):', JSON.stringify(await lib.openStore('file:///C:/Windows/notepad.exe')));
  console.log('openStore(lixo):', JSON.stringify(await lib.openStore('steam:abc')));

  await new Promise((r) => setImmediate(r));
  await Promise.race([lib._coversIdle(), new Promise((r) => setTimeout(r, 60000))]);
  await new Promise((r) => setTimeout(r, 2500)); // fallback appdetails / debounce
  un = await lib.getUninstalled();
  console.log(`\nnão instalados com capa: ${un.filter((g) => g.cover).length}/${un.length}, com hero: ${un.filter((g) => g.hero).length}/${un.length}`);
  for (let i = 0; i < 120 && lib._sizingBusy(); i++) await new Promise((r) => setTimeout(r, 500));
  const st2 = await lib.getStorage();
  console.log('\nstorage depois do cálculo de pastas:');
  for (const d of st2) {
    console.log(`  ${d.drive} jogos ${gb(d.gamesBytes)} (${d.games.length})`);
    for (const g of d.games) console.log(`      ${pad(g.name, 40)} ${gb(g.bytes)}`);
  }
  console.log('eventos:', JSON.stringify(events));
  lib._dispose();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
