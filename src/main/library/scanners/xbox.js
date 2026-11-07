'use strict';
// Scanner Xbox / Microsoft Store (jogos GDK): pacotes Appx com MicrosoftGame.config.
const path = require('path');
const u = require('../util');

const PS = `
$res = @()
foreach ($p in (Get-AppxPackage)) {
  if ($p.IsFramework -or $p.IsResourcePackage -or -not $p.InstallLocation) { continue }
  if (-not (Test-Path -LiteralPath (Join-Path $p.InstallLocation 'MicrosoftGame.config'))) { continue }
  $res += [pscustomobject]@{ name = $p.Name; pfn = $p.PackageFamilyName; dir = $p.InstallLocation }
}
ConvertTo-Json -Compress -InputObject @($res)
`;

// O app Xbox e serviços de jogos não são jogos.
const EXCLUDE = /^Microsoft\.(GamingApp|XboxApp|GamingServices|Xbox[A-Za-z]*|XboxGamingOverlay|XboxIdentityProvider|XboxSpeechToTextOverlay|XboxGameCallableUI)$/i;

function isMsResource(s) {
  return !s || /^ms-resource:/i.test(s);
}

function prettify(pkgName) {
  const last = String(pkgName).split('.').pop();
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
}

/**
 * Resolve o arquivo real de um asset declarado ("Logo.png") que pode existir só com
 * qualificadores (Logo.scale-200.png, Logo.targetsize-256.png...). Prefere a maior escala.
 */
function resolveAsset(dir, rel) {
  if (!rel) return null;
  const full = path.join(dir, rel);
  if (u.exists(full)) return full;
  const d = path.dirname(full);
  const ext = path.extname(full).toLowerCase();
  const base = path.basename(full, path.extname(full)).toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const f of u.listDir(d)) {
    const lf = f.toLowerCase();
    if (!lf.startsWith(base + '.') || !lf.endsWith(ext)) continue;
    const q = lf.slice(base.length + 1, lf.length - ext.length);
    let score = 0;
    const sc = q.match(/scale-(\d+)/);
    const ts = q.match(/targetsize-(\d+)/);
    if (sc) score = +sc[1];
    else if (ts) score = +ts[1];
    if (/altform|contrast/.test(q)) score -= 1000;
    if (score > bestScore) {
      bestScore = score;
      best = path.join(d, f);
    }
  }
  return best;
}

/** Mapeia Identity Name -> pasta Content em <drive>:\XboxGames\*\Content */
function xboxGamesDirs() {
  const map = {};
  for (let c = 67; c <= 90; c++) {
    const root = String.fromCharCode(c) + ':\\XboxGames';
    if (!u.isDir(root)) continue;
    for (const g of u.listDir(root)) {
      const content = path.join(root, g, 'Content');
      const cfg = u.readText(path.join(content, 'MicrosoftGame.config'));
      if (!cfg) continue;
      const id = u.xmlAttr(cfg, 'Identity', 'Name');
      if (id) map[id.toLowerCase()] = content;
    }
  }
  return map;
}

async function scan() {
  const list = await u.runPSJson(PS, { timeout: 45000 });
  if (!Array.isArray(list)) return [];
  const contentDirs = xboxGamesDirs();
  const out = [];
  for (const p of list) {
    if (!p || !p.pfn || !p.dir || EXCLUDE.test(p.name)) continue;
    const dir = p.dir;
    const manifest = u.readText(path.join(dir, 'AppxManifest.xml')) || '';
    const cfg = u.readText(path.join(dir, 'MicrosoftGame.config')) || '';
    const appId = u.xmlAttr(manifest, 'Application', 'Id');
    if (!appId) continue;

    const candidates = [
      u.xmlAttr(cfg, 'ShellVisuals', 'DefaultDisplayName'),
      u.xmlText(manifest.split(/<Applications/i)[0], 'DisplayName'),
      u.xmlAttr(manifest, 'VisualElements', 'DisplayName'),
    ];
    const name = u.cleanName(candidates.find((x) => !isMsResource(x)) || prettify(p.name));

    // imagens: preferir as maiores
    const cover =
      resolveAsset(dir, u.xmlAttr(cfg, 'ShellVisuals', 'Square480x480Logo')) ||
      resolveAsset(dir, u.xmlAttr(cfg, 'ShellVisuals', 'Square150x150Logo')) ||
      resolveAsset(dir, u.xmlAttr(manifest, 'VisualElements', 'Square150x150Logo')) ||
      resolveAsset(dir, u.xmlAttr(cfg, 'ShellVisuals', 'StoreLogo')) ||
      resolveAsset(dir, u.xmlText(manifest, 'Logo'));
    const hero = resolveAsset(dir, u.xmlAttr(cfg, 'ShellVisuals', 'SplashScreenImage'));

    const content = contentDirs[String(p.name).toLowerCase()];
    const trackDirs = [dir];
    if (content && u.normPath(content) !== u.normPath(dir)) trackDirs.push(content);

    out.push({
      source: 'xbox',
      nativeId: p.pfn,
      name,
      installDir: content || dir,
      trackDirs,
      launch: { type: 'appx', target: `shell:AppsFolder\\${p.pfn}!${appId}`, args: '' },
      coverHints: { searchName: name, localCover: cover || null, localHero: hero || null, localIsLogo: true },
      lastPlayed: null,
      playtimeMinutes: 0,
    });
  }
  return out;
}

module.exports = { scan, resolveAsset };
