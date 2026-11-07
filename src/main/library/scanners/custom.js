'use strict';
// Jogos adicionados manualmente pelo usuário (persistidos em store.custom).
const path = require('path');
const u = require('../util');

/** custom: [{ id, name, exePath, args, addedAt }] */
function scan(customList) {
  return (customList || []).map((c) => {
    const exe = c.exePath;
    const isExe = /\.exe$/i.test(exe);
    const installDir = exe ? path.dirname(exe) : null;
    return {
      source: 'custom',
      nativeId: String(c.id).replace(/^custom:/, ''),
      name: u.cleanName(c.name) || path.basename(exe || '', path.extname(exe || '')),
      installDir,
      // só rastreia processo para .exe (atalhos podem apontar para qualquer lugar)
      trackDirs: isExe && installDir ? [installDir] : [],
      launch: { type: 'exe', target: exe, args: c.args || '' },
      coverHints: { searchName: c.name },
      lastPlayed: null,
      playtimeMinutes: 0,
    };
  });
}

module.exports = { scan };
