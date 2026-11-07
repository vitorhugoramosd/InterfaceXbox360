'use strict';
// Teste do backend em node puro (não lança jogos):  node scripts/scan-test.js [--fresh]
//   --fresh  apaga .devdata antes (força baixar capas de novo)
const fs = require('fs');
const path = require('path');
const lib = require('../src/main/library');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.devdata');

function pad(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
}

function table(games, raws) {
  console.log(pad('id', 46) + pad('nome', 36) + pad('capa', 6) + pad('hero', 6) + 'launch');
  console.log('-'.repeat(150));
  for (const g of games) {
    const r = raws.find((x) => x.id === g.id) || {};
    const t = r.launch ? `${r.launch.type}: ${r.launch.target}` : '';
    console.log(pad(g.id, 46) + pad(g.name, 36) + pad(g.cover ? 'sim' : '-', 6) + pad(g.hero ? 'sim' : '-', 6) + t);
  }
}

(async () => {
  if (process.argv.includes('--fresh')) fs.rmSync(dataDir, { recursive: true, force: true });
  await lib.init({ dataDir });

  let updates = 0;
  let last = null;
  lib.on('covers-updated', (g) => {
    updates++;
    last = g;
  });

  const t0 = Date.now();
  const games = await lib.rescan();
  console.log(`\nrescan: ${games.length} jogos em ${Date.now() - t0} ms\n`);
  const raws = JSON.parse(fs.readFileSync(path.join(dataDir, 'library.json'), 'utf8')).cache;
  table(games, raws);

  // espera downloads de capa (máx. 60s)
  await new Promise((r) => setImmediate(r));
  const t1 = Date.now();
  await Promise.race([lib._coversIdle(), new Promise((r) => setTimeout(r, 60000))]);
  const finalGames = last || (await lib.getGames());
  console.log(`\ncapas: ${Date.now() - t1} ms, eventos covers-updated: ${updates}`);
  table(finalGames, raws);
  const withCover = finalGames.filter((g) => g.cover).length;
  const withHero = finalGames.filter((g) => g.hero).length;
  console.log(`\n${withCover}/${finalGames.length} com capa, ${withHero}/${finalGames.length} com hero`);
  const missing = finalGames.filter((g) => !g.cover).map((g) => g.name);
  if (missing.length) console.log('sem capa: ' + missing.join(', '));
  console.log('settings:', lib.getSettings());
  lib._dispose();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
