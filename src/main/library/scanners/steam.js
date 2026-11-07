'use strict';
// Scanner da Steam: registro -> libraryfolders.vdf -> appmanifest_*.acf
const fs = require('fs');
const path = require('path');
const vdf = require('../vdf');
const u = require('../util');

const SKIP_APPIDS = new Set(['228980', '1070560', '1391110', '1628350', '1826330', '250820']);
const SKIP_NAME = /redistributable|proton|steam linux runtime|steamvr|dedicated server|soundtrack|\bsdk\b|steamworks/i;

let cachedSteamPath;

async function findSteamPath() {
  if (cachedSteamPath !== undefined) return cachedSteamPath;
  const candidates = [];
  const reg1 = await u.regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (reg1) candidates.push(reg1);
  const reg2 = await u.regValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
  if (reg2) candidates.push(reg2);
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  cachedSteamPath = null;
  for (const c of candidates) {
    let p = path.normalize(c.replace(/\//g, '\\'));
    if (u.exists(path.join(p, 'steamapps'))) {
      try {
        p = fs.realpathSync.native(p); // corrige a caixa ("c:/program files (x86)/steam")
      } catch {}
      cachedSteamPath = p;
      break;
    }
  }
  return cachedSteamPath;
}

function libraryPaths(steamPath) {
  const libs = [steamPath];
  const txt = u.readText(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'));
  if (txt) {
    const root = vdf.parse(txt);
    const lf = u.getCI(root, 'libraryfolders') || u.getCI(root, 'LibraryFolders') || {};
    for (const k of Object.keys(lf)) {
      const v = lf[k];
      const p = typeof v === 'string' ? (/^\d+$/.test(k) ? v : null) : u.getCI(v, 'path');
      if (p) libs.push(path.normalize(p));
    }
  }
  const seen = new Set();
  return libs.filter((p) => {
    const k = u.normPath(p);
    if (seen.has(k) || !u.exists(path.join(p, 'steamapps'))) return false;
    seen.add(k);
    return true;
  });
}

/** Lê LastPlayed / Playtime de userdata/<id>/config/localconfig.vdf (todas as contas, pega o maior). */
function readLocalConfig(steamPath) {
  const info = {};
  const ud = path.join(steamPath, 'userdata');
  for (const uid of u.listDir(ud)) {
    const txt = u.readText(path.join(ud, uid, 'config', 'localconfig.vdf'));
    if (!txt) continue;
    let apps;
    try {
      apps = u.getPathCI(vdf.parse(txt), ['UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps']);
    } catch {
      apps = null;
    }
    if (!apps) continue;
    for (const appid of Object.keys(apps)) {
      const a = apps[appid];
      if (!a || typeof a !== 'object') continue;
      const lp = parseInt(u.getCI(a, 'LastPlayed') || '0', 10) || 0;
      const pt = parseInt(u.getCI(a, 'Playtime') || '0', 10) || 0;
      const cur = info[appid] || { lastPlayed: 0, playtime: 0 };
      info[appid] = { lastPlayed: Math.max(cur.lastPlayed, lp), playtime: Math.max(cur.playtime, pt) };
    }
  }
  return info;
}

/** Procura arquivos locais do cache da biblioteca Steam (layout antigo e novo com subpastas hash). */
function localArt(steamPath, appid) {
  const lc = path.join(steamPath, 'appcache', 'librarycache');
  const dir = path.join(lc, String(appid));
  const res = { cover: null, coverHiRes: false, hero: null };
  const direct = (names) => names.map((n) => path.join(dir, n)).find(u.exists);
  // cover 600x900
  res.cover = direct(['library_600x900_2x.jpg', 'library_600x900.jpg']) ||
    [path.join(lc, appid + '_library_600x900.jpg')].find(u.exists) || null;
  if (res.cover) res.coverHiRes = true;
  res.hero = direct(['library_hero.jpg']) || [path.join(lc, appid + '_library_hero.jpg')].find(u.exists) || null;
  // layout novo: <appid>/<hash>/library_capsule(_2x).jpg, <appid>/<hash>/library_hero.jpg
  if (!res.cover || !res.hero) {
    for (const sub of u.listDir(dir)) {
      const sd = path.join(dir, sub);
      if (!u.isDir(sd)) continue;
      if (!res.cover) {
        const c2 = path.join(sd, 'library_capsule_2x.jpg');
        const c1 = path.join(sd, 'library_capsule.jpg');
        if (u.exists(c2)) { res.cover = c2; res.coverHiRes = true; }
        else if (u.exists(c1)) res.cover = c1; // 300x450
      }
      if (!res.hero) {
        const h = path.join(sd, 'library_hero.jpg');
        if (u.exists(h)) res.hero = h;
      }
    }
  }
  return res;
}

async function scan() {
  const steamPath = await findSteamPath();
  if (!steamPath) return [];
  const local = readLocalConfig(steamPath);
  const out = [];
  const seen = new Set();
  for (const lib of libraryPaths(steamPath)) {
    const sa = path.join(lib, 'steamapps');
    for (const f of u.listDir(sa)) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      const txt = u.readText(path.join(sa, f));
      if (!txt) continue;
      let st;
      try {
        st = u.getCI(vdf.parse(txt), 'AppState');
      } catch {
        continue;
      }
      if (!st) continue;
      const appid = String(u.getCI(st, 'appid') || '');
      const rawName = u.getCI(st, 'name') || '';
      if (!appid || seen.has(appid)) continue;
      if (SKIP_APPIDS.has(appid) || SKIP_NAME.test(rawName)) continue;
      const flags = parseInt(u.getCI(st, 'StateFlags') || '0', 10);
      if (!(flags & 4)) continue; // não totalmente instalado (baixando pela 1ª vez)
      seen.add(appid);
      const installdir = u.getCI(st, 'installdir') || '';
      const installDir = installdir ? path.join(sa, 'common', installdir) : null;
      const lc = local[appid] || {};
      const acfLast = parseInt(u.getCI(st, 'LastPlayed') || '0', 10) || 0;
      const lastSec = Math.max(acfLast, lc.lastPlayed || 0);
      const art = localArt(steamPath, appid);
      out.push({
        source: 'steam',
        nativeId: appid,
        name: u.cleanName(rawName) || 'App ' + appid,
        installDir,
        trackDirs: installDir ? [installDir] : [],
        launch: { type: 'uri', target: 'steam://rungameid/' + appid, args: '' },
        coverHints: {
          steamAppId: appid,
          localCover: art.cover,
          localCoverHiRes: art.coverHiRes,
          localHero: art.hero,
        },
        lastPlayed: lastSec ? lastSec * 1000 : null,
        playtimeMinutes: lc.playtime || 0,
      });
    }
  }
  return out;
}

async function libraries() {
  const sp = await findSteamPath();
  return sp ? libraryPaths(sp) : [];
}

module.exports = { scan, findSteamPath, libraries, localArt };
