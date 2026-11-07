'use strict';
// Scanner do EA app: chaves Uninstall (HKLM 32/64 + HKCU) com Publisher "Electronic Arts"
// ou InstallLocation contendo __Installer\installerdata.xml.
// Os dados próprios do EA Desktop (C:\ProgramData\EA Desktop\...\IS) são criptografados, por isso
// não são usados. Jogos EA comprados na Steam são removidos depois, na deduplicação (Steam vence).
const path = require('path');
const u = require('../util');

const PS = `
$res = @()
$roots = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
foreach ($r in $roots) {
  foreach ($k in (Get-ChildItem $r)) {
    try { $p = Get-ItemProperty -LiteralPath $k.PSPath } catch { continue }
    if (-not $p) { continue }
    $pub = [string]$p.Publisher
    $loc = [string]$p.InstallLocation
    $loc = $loc.Trim('"')
    $hasInst = $false
    if ($loc) { $hasInst = Test-Path -LiteralPath (Join-Path $loc '__Installer\\installerdata.xml') }
    if (($pub -match 'Electronic Arts') -or $hasInst) {
      $res += [pscustomobject]@{ key = $k.PSChildName; name = [string]$p.DisplayName; publisher = $pub; dir = $loc; icon = [string]$p.DisplayIcon; inst = $hasInst }
    }
  }
}
ConvertTo-Json -Compress -InputObject @($res)
`;

const NOT_GAMES = /^(ea app|ea desktop|origin|ea installer|ea anticheat|eaanticheat|ea javelin)/i;

function readInstallerData(dir) {
  const xml = u.readText(path.join(dir, '__Installer', 'installerdata.xml'));
  if (!xml) return {};
  const ids = [...xml.matchAll(/<contentID>([^<]+)<\/contentID>/gi)].map((m) => m[1].trim());
  const contentId = ids.find((x) => !/_sc$/i.test(x)) || ids[0] || null;
  const titles = [...xml.matchAll(/<gameTitle\s+locale="([^"]*)"\s*>([^<]+)<\/gameTitle>/gi)];
  const en = titles.find((m) => /^en_?us$/i.test(m[1])) || titles[0];
  return { contentId, title: en ? u.xmlDecode(en[2]).trim() : null };
}

function iconExe(icon) {
  if (!icon) return null;
  const p = icon.replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '');
  return /\.exe$/i.test(p) && u.exists(p) ? p : null;
}

async function scan() {
  const list = await u.runPSJson(PS, { timeout: 30000 });
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const e of list) {
    if (!e || !e.dir || NOT_GAMES.test(e.name || '')) continue;
    const installDir = path.normalize(e.dir).replace(/\\+$/, '');
    if (!u.isDir(installDir)) continue;
    const key = u.normPath(installDir);
    if (seen.has(key)) continue;
    const info = e.inst ? readInstallerData(installDir) : {};
    const exe = iconExe(e.icon);
    if (!info.contentId && !exe) continue; // sem forma confiável de abrir
    seen.add(key);
    const name = u.cleanName(info.title || e.name || path.basename(installDir));
    const launch = info.contentId
      ? { type: 'uri', target: `origin2://game/launch?offerIds=${encodeURIComponent(info.contentId)}&autoDownload=1`, args: '' }
      : { type: 'exe', target: exe, args: '' };
    out.push({
      source: 'ea',
      nativeId: info.contentId || String(e.key).replace(/[{}]/g, ''),
      name,
      installDir,
      trackDirs: [installDir],
      launch,
      coverHints: { searchName: name },
      lastPlayed: null,
      playtimeMinutes: 0,
    });
  }
  return out;
}

module.exports = { scan };
