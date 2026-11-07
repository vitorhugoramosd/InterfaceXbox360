'use strict';
// Scanner do Ubisoft Connect: HKLM\...\Ubisoft\Launcher\Installs\<id>\InstallDir
const path = require('path');
const u = require('../util');

const PS = `
$res = @()
$roots = @('HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs','HKLM:\\SOFTWARE\\Ubisoft\\Launcher\\Installs')
$seen = @{}
foreach ($r in $roots) {
  foreach ($k in (Get-ChildItem $r)) {
    $id = $k.PSChildName
    if ($seen.ContainsKey($id)) { continue }
    $dir = (Get-ItemProperty -LiteralPath $k.PSPath).InstallDir
    if (-not $dir) { continue }
    $seen[$id] = 1
    $name = $null
    foreach ($un in @('HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall')) {
      $p = Get-ItemProperty -LiteralPath ($un + '\\Uplay Install ' + $id)
      if ($p -and $p.DisplayName) { $name = $p.DisplayName; break }
    }
    $res += [pscustomobject]@{ id = $id; dir = $dir; name = $name }
  }
}
ConvertTo-Json -Compress -InputObject @($res)
`;

async function scan() {
  const list = await u.runPSJson(PS, { timeout: 20000 });
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && e.id && e.dir)
    .map((e) => {
      const installDir = path.normalize(String(e.dir).replace(/\//g, '\\')).replace(/\\+$/, '');
      const name = u.cleanName(e.name || path.basename(installDir));
      return {
        source: 'ubisoft',
        nativeId: String(e.id),
        name,
        installDir,
        installed: u.isDir(installDir),
        trackDirs: [installDir],
        launch: { type: 'uri', target: `uplay://launch/${e.id}/0`, args: '' },
        coverHints: { searchName: name },
        lastPlayed: null,
        playtimeMinutes: 0,
      };
    });
}

module.exports = { scan };
