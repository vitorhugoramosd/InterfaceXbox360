'use strict';
// Jogos "soltos" (instalados por fora de launchers) em pastas de jogos de qualquer disco:
// <X>:\Games\<jogo>\... e <X>:\Jogos\<jogo>\...  — o executável principal é o maior .exe
// (até 2 níveis abaixo) que não seja instalador/redistribuível/crash handler.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const u = require('../util');

const ROOT_NAMES = ['Games', 'Jogos'];
const SKIP_EXE = /^(unins\d*|uninstall.*|setup.*|.*redist.*|vc_?redist.*|dxwebsetup|dxsetup|directx.*|crs-.*|unitycrashhandler.*|crashreport.*|crashhandler.*|quicksfv|autorun|uplayinstaller|easyanticheat.*|eac.*setup|dotnet.*|oalinst|physx.*|ue4prereq.*|ueprereq.*|.*installer.*|.*updater.*|notification_helper|cefprocess|.*helper)\.exe$/i;
const SKIP_DIRS = /^(_?redist|_commonredist|commonredist|directx|dotnet|vcredist|support|__installer|installer|.egstore|easyanticheat|battleye)$/i;
const MIN_EXE_BYTES = 2 * 1024 * 1024;

function driveRoots() {
  const out = [];
  for (let c = 67; c <= 90; c++) { // C..Z
    const root = String.fromCharCode(c) + ':\\';
    try { if (fs.existsSync(root)) out.push(root); } catch {}
  }
  return out;
}

function gameRoots() {
  const out = [];
  for (const d of driveRoots()) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory() && ROOT_NAMES.some((n) => n.toLowerCase() === e.name.toLowerCase())) {
        out.push(path.join(d, e.name));
      }
    }
  }
  return out;
}

function findMainExe(dir, depth = 0, best = null) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return best; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXE.test(e.name)) {
      let size = 0;
      try { size = fs.statSync(p).size; } catch {}
      if (size >= MIN_EXE_BYTES && (!best || size > best.size)) best = { path: p, size };
    } else if (e.isDirectory() && depth < 2 && !SKIP_DIRS.test(e.name)) {
      best = findMainExe(p, depth + 1, best);
    }
  }
  return best;
}

function prettyName(folder) {
  return u.cleanName(
    folder
      .replace(/[_.]+/g, ' ')
      .replace(/\s+-\s+/g, ' - ')
      .replace(/([a-z])([A-Z])/g, '$1 $2') // SpiderMan -> Spider Man
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Retorna entradas brutas (source 'custom', auto: true). */
function scan() {
  const out = [];
  for (const root of gameRoots()) {
    let dirs = [];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { continue; }
    for (const d of dirs) {
      const dir = path.join(root, d.name);
      const exe = findMainExe(dir);
      if (!exe) continue; // pasta vazia / ainda instalando / sem executável
      const id = 'dir-' + crypto.createHash('sha1').update(u.normPath(dir)).digest('hex').slice(0, 12);
      const name = prettyName(d.name);
      out.push({
        source: 'custom',
        nativeId: id,
        auto: true,
        name,
        installDir: dir,
        trackDirs: [dir],
        launch: { type: 'exe', target: exe.path, args: '' },
        coverHints: { searchName: name },
        lastPlayed: null,
        playtimeMinutes: 0,
      });
    }
  }
  return out;
}

module.exports = { scan, driveRoots };
