'use strict';
// Utilitários compartilhados (somente módulos nativos do Node; nada de electron).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/** Remove ™ ® ©, normaliza espaços. Nome exibido na UI. */
function cleanName(name) {
  return String(name || '')
    .replace(/[\u2122\u00AE\u00A9]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:,])/g, '$1')
    .trim();
}

/** Nome normalizado para comparação / deduplicação. */
function normalizeName(name) {
  return cleanName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readText(p) {
  try {
    let s = fs.readFileSync(p, 'utf8');
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s;
  } catch {
    return null;
  }
}

function listDir(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

/** Caminho normalizado p/ comparação: absoluto, barras invertidas, minúsculo, sem barra final. */
function normPath(p) {
  if (!p) return '';
  return path.resolve(String(p)).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function isUnder(child, parent) {
  const c = normPath(child);
  const p = normPath(parent);
  if (!c || !p) return false;
  return c === p || c.startsWith(p + '\\');
}

/** Executa um comando e devolve stdout (string). Nunca rejeita: devolve null em erro. */
function run(cmd, args, { timeout = 20000, encoding = 'utf8' } = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding },
      (err, stdout) => {
        if (err && !stdout) return resolve(null);
        resolve(stdout);
      }
    );
  });
}

/**
 * Executa um script PowerShell (via -EncodedCommand, sem problemas de aspas) e
 * devolve o JSON parseado. O script deve escrever JSON no stdout.
 */
async function runPSJson(script, { timeout = 30000 } = {}) {
  const prelude =
    "$ErrorActionPreference='SilentlyContinue';$ProgressPreference='SilentlyContinue';" +
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;';
  const encoded = Buffer.from(prelude + script, 'utf16le').toString('base64');
  const out = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeout }
  );
  if (!out) return null;
  const txt = out.replace(/^\uFEFF/, '').trim();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/** Lê um valor REG_SZ via `reg query`. */
async function regValue(key, name) {
  const out = await run('reg', ['query', key, '/v', name], { timeout: 8000 });
  if (!out) return null;
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s+(.*)$/);
    if (m && m[1].toLowerCase() === name.toLowerCase()) return m[2].trim();
  }
  return null;
}

/** Busca case-insensitive de chave num objeto. */
function getCI(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const lk = key.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lk) return obj[k];
  return undefined;
}

function getPathCI(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    cur = getCI(cur, k);
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Divide string de argumentos estilo linha de comando (respeita aspas). */
function splitArgs(s) {
  if (Array.isArray(s)) return s.map(String);
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(s || '')))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

/** Decodifica entidades XML básicas. */
function xmlDecode(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}

/** Lê atributo de uma tag XML (primeira ocorrência). */
function xmlAttr(xml, tag, attr) {
  const re = new RegExp('<(?:\\w+:)?' + tag + '\\b([^>]*)>', 'i');
  const m = String(xml || '').match(re);
  if (!m) return null;
  const a = m[1].match(new RegExp('\\b' + attr + '\\s*=\\s*"([^"]*)"', 'i'));
  return a ? xmlDecode(a[1]) : null;
}

function xmlText(xml, tag) {
  const re = new RegExp('<(?:\\w+:)?' + tag + '\\b[^>]*>([^<]*)</(?:\\w+:)?' + tag + '>', 'i');
  const m = String(xml || '').match(re);
  return m ? xmlDecode(m[1]).trim() : null;
}

function withTimeout(promise, ms, fallback) {
  let t;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      t = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

module.exports = {
  cleanName,
  normalizeName,
  exists,
  isDir,
  readText,
  listDir,
  normPath,
  isUnder,
  run,
  runPSJson,
  regValue,
  getCI,
  getPathCI,
  splitArgs,
  xmlDecode,
  xmlAttr,
  xmlText,
  withTimeout,
};
