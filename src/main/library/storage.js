'use strict';
// Armazenamento: discos fixos + tamanho dos jogos (Steam SizeOnDisk, Epic InstallSize,
// demais: soma da pasta calculada em background, cache de 24 h em library.json).
const fs = require('fs');
const path = require('path');
const u = require('./util');

const SIZE_TTL_MS = 24 * 60 * 60 * 1000;
const FOLDER_TIME_CAP_MS = 60 * 1000;
const DRIVES_TTL_MS = 30 * 1000;

function driveOf(p) {
  const m = /^([a-zA-Z]):/.exec(String(p || ''));
  return m ? m[1].toUpperCase() + ':' : null;
}

/** Soma o tamanho de uma pasta (sem seguir links/junções). null se estourar o tempo ou falhar. */
async function folderSize(dir, deadline) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    if (Date.now() > deadline) return null;
    const d = stack.pop();
    let ents;
    try {
      ents = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    const files = [];
    for (const e of ents) {
      if (e.isSymbolicLink()) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) files.push(p);
    }
    for (let i = 0; i < files.length; i += 64) {
      const st = await Promise.all(files.slice(i, i + 64).map((f) => fs.promises.lstat(f).catch(() => null)));
      for (const s of st) if (s) total += s.size;
    }
  }
  return total;
}

/** Pasta de jogo custom só é somada se não for raiz de disco / pasta do sistema. */
function safeCustomDir(dir) {
  const n = u.normPath(dir);
  if (/^[a-z]:$/.test(n)) return false;
  const bad = [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.USERPROFILE,
    process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean).map(u.normPath);
  if (bad.some((b) => n === b)) return false;
  if (process.env.SystemRoot && u.isUnder(n, process.env.SystemRoot)) return false;
  return true;
}

class Storage {
  constructor(store) {
    this.store = store;
    this.drivesCache = null;
    this.drivesAt = 0;
    this.sizing = false;
  }

  /** Tamanho conhecido do jogo (bytes) ou null. */
  sizeOf(raw) {
    if (raw.sizeBytes) return raw.sizeBytes;
    const s = this.store.data.sizes[raw.id];
    return s && typeof s.bytes === 'number' ? s.bytes : null;
  }

  driveOf(raw) {
    return driveOf(raw.installDir);
  }

  /** Calcula, em background, tamanhos de pasta que faltam. onDone() se algo mudou. */
  queueSizes(raws, onDone) {
    if (this.sizing) return;
    const now = Date.now();
    const todo = (raws || []).filter((r) => {
      if (r.sizeBytes || !r.installDir) return false;
      if (r.source === 'custom' && !safeCustomDir(r.installDir)) return false;
      const s = this.store.data.sizes[r.id];
      return !s || now - s.at > SIZE_TTL_MS;
    });
    if (!todo.length) return;
    this.sizing = true;
    (async () => {
      let changed = false;
      for (const r of todo) {
        if (!u.isDir(r.installDir)) continue; // disco desconectado: tenta depois
        const bytes = await folderSize(r.installDir, Date.now() + FOLDER_TIME_CAP_MS);
        this.store.data.sizes[r.id] = { bytes, at: Date.now() };
        changed = true;
      }
      if (changed) {
        this.store.saveSoon();
        if (onDone) onDone();
      }
    })()
      .catch(() => {})
      .finally(() => {
        this.sizing = false;
      });
  }

  async drives() {
    if (this.drivesCache && Date.now() - this.drivesAt < DRIVES_TTL_MS) return this.drivesCache;
    let list = await u.runPSJson(
      "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,VolumeName,Size,FreeSpace)",
      { timeout: 15000 }
    );
    let out = [];
    if (Array.isArray(list)) {
      out = list
        .filter((d) => d && d.DeviceID)
        .map((d) => ({ drive: String(d.DeviceID).toUpperCase(), label: d.VolumeName || 'Disco local', total: +d.Size || 0, free: +d.FreeSpace || 0 }));
    }
    if (!out.length && fs.statfsSync) {
      // fallback sem PowerShell
      for (let c = 67; c <= 90; c++) {
        const drive = String.fromCharCode(c) + ':';
        try {
          const s = fs.statfsSync(drive + '\\');
          out.push({ drive, label: 'Disco local', total: s.blocks * s.bsize, free: s.bavail * s.bsize });
        } catch {}
      }
    }
    this.drivesCache = out;
    this.drivesAt = Date.now();
    return out;
  }

  /** Drive[] conforme o contrato. games: Game[] já montados (com sizeBytes/drive). */
  async getStorage(games) {
    const drives = await this.drives();
    return drives.map((d) => {
      const list = games
        .filter((g) => g.drive === d.drive && typeof g.sizeBytes === 'number')
        .map((g) => ({ id: g.id, name: g.name, bytes: g.sizeBytes }))
        .sort((a, b) => b.bytes - a.bytes);
      return { ...d, gamesBytes: list.reduce((s, g) => s + g.bytes, 0), games: list };
    });
  }
}

module.exports = { Storage, driveOf, folderSize };
