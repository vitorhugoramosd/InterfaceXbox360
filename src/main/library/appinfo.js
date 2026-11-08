'use strict';
// Parser do appcache/appinfo.vdf (formato binário da Steam).
// Suporta v27 (0x07564427), v28 (0x07564428) e v29 (0x07564429, chaves via tabela de strings).
// Lê só o necessário: common.name e common.type por appid.
const fs = require('fs');

const MAGIC_27 = 0x07564427;
const MAGIC_28 = 0x07564428;
const MAGIC_29 = 0x07564429;

/** Lê KeyValues binário a partir de `pos`. Retorna { obj, pos }. */
function readKV(buf, pos, end, strings) {
  const obj = {};
  while (pos < end) {
    const type = buf[pos++];
    if (type === 0x08) return { obj, pos }; // fim de seção
    let key;
    if (strings) {
      const idx = buf.readUInt32LE(pos);
      pos += 4;
      key = strings[idx];
    } else {
      const z = buf.indexOf(0, pos);
      key = buf.toString('utf8', pos, z);
      pos = z + 1;
    }
    switch (type) {
      case 0x00: {
        const r = readKV(buf, pos, end, strings);
        obj[key] = r.obj;
        pos = r.pos;
        break;
      }
      case 0x01: {
        const z = buf.indexOf(0, pos);
        obj[key] = buf.toString('utf8', pos, z);
        pos = z + 1;
        break;
      }
      case 0x02:
      case 0x06: // ptr/color
        obj[key] = buf.readInt32LE(pos);
        pos += 4;
        break;
      case 0x03:
        obj[key] = buf.readFloatLE(pos);
        pos += 4;
        break;
      case 0x07:
        obj[key] = buf.readBigUInt64LE(pos).toString();
        pos += 8;
        break;
      case 0x0a:
        obj[key] = buf.readBigInt64LE(pos).toString();
        pos += 8;
        break;
      default:
        throw new Error('appinfo: tipo KV desconhecido ' + type + ' em ' + pos);
    }
  }
  return { obj, pos };
}

/**
 * Lê appinfo.vdf e devolve Map<appid(string), { name, type }>.
 * `only` (Set de appids) limita o parse de KV aos apps de interesse (mais rápido).
 */
function readAppInfo(file, only) {
  const buf = fs.readFileSync(file);
  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC_27 && magic !== MAGIC_28 && magic !== MAGIC_29) throw new Error('appinfo: versão desconhecida');
  let pos = 8;
  let strings = null;
  if (magic === MAGIC_29) {
    const off = Number(buf.readBigInt64LE(8));
    pos = 16;
    let p = off;
    const count = buf.readUInt32LE(p);
    p += 4;
    strings = new Array(count);
    for (let i = 0; i < count; i++) {
      const z = buf.indexOf(0, p);
      strings[i] = buf.toString('utf8', p, z);
      p = z + 1;
    }
  }
  // cabeçalho do app após `size`: infoState(4) lastUpdated(4) picsToken(8) sha1(20) changeNumber(4) [binarySha1(20) em v28+]
  const headerLen = magic === MAGIC_27 ? 40 : 60;
  const out = new Map();
  while (pos + 8 <= buf.length) {
    const appid = buf.readUInt32LE(pos);
    if (appid === 0) break;
    const size = buf.readUInt32LE(pos + 4);
    const start = pos + 8;
    const end = start + size;
    if (end > buf.length) break;
    const id = String(appid);
    if (!only || only.has(id)) {
      try {
        const { obj } = readKV(buf, start + headerLen, end, strings);
        const appinfo = obj.appinfo || obj;
        const common = appinfo.common || {};
        out.set(id, {
          name: common.name || null,
          type: common.type ? String(common.type).toLowerCase() : null,
        });
      } catch {
        // entrada corrompida/formato inesperado: ignora só ela
      }
    }
    pos = end;
  }
  return out;
}

module.exports = { readAppInfo };
