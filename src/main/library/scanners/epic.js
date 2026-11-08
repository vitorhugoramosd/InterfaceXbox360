'use strict';
// Scanner da Epic Games: manifests *.item (JSON) em ProgramData.
const path = require('path');
const u = require('../util');

function manifestsDir() {
  const pd = process.env.ProgramData || 'C:\\ProgramData';
  return path.join(pd, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
}

async function scan() {
  const dir = manifestsDir();
  const out = [];
  const seen = new Set();
  for (const f of u.listDir(dir)) {
    if (!/\.item$/i.test(f)) continue;
    const txt = u.readText(path.join(dir, f));
    if (!txt) continue;
    let m;
    try {
      m = JSON.parse(txt);
    } catch {
      continue;
    }
    if (!m || m.bIsIncompleteInstall) continue;
    const cats = Array.isArray(m.AppCategories) ? m.AppCategories.map((c) => String(c).toLowerCase()) : [];
    if (cats.length && !cats.includes('games')) continue;
    if (cats.includes('addons') || cats.includes('plugins') || cats.includes('engines')) continue;
    if (m.MainGameAppName && m.AppName && m.MainGameAppName !== m.AppName) continue; // DLC
    if (!m.AppName || seen.has(m.AppName)) continue;
    seen.add(m.AppName);
    const installDir = m.InstallLocation ? path.normalize(m.InstallLocation) : null;
    const ns = m.CatalogNamespace || '';
    const item = m.CatalogItemId || '';
    const target =
      ns && item
        ? `com.epicgames.launcher://apps/${ns}%3A${item}%3A${m.AppName}?action=launch&silent=true`
        : `com.epicgames.launcher://apps/${m.AppName}?action=launch&silent=true`;
    const name = u.cleanName(m.DisplayName || m.AppName);
    out.push({
      source: 'epic',
      nativeId: m.AppName,
      name,
      installDir,
      trackDirs: installDir ? [installDir] : [],
      launch: { type: 'uri', target, args: '' },
      coverHints: { searchName: name },
      lastPlayed: null,
      playtimeMinutes: 0,
      sizeBytes: +m.InstallSize || null,
    });
  }
  return out;
}

module.exports = { scan };
