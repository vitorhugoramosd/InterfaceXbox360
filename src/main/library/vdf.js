'use strict';
// Parser mínimo de VDF / KeyValues (formato texto da Valve).
// Suporta strings entre aspas com escapes, tokens sem aspas, blocos { },
// comentários // e condicionais [$WIN32] (ignorados). Chaves duplicadas: a última vence.

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') {
      i++;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '{' || c === '}') {
      tokens.push(c);
      i++;
    } else if (c === '[') {
      // condicional tipo [$WIN32] — ignora
      while (i < n && src[i] !== ']') i++;
      i++;
    } else if (c === '"') {
      i++;
      let s = '';
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) {
          const e = src[i + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else {
          s += src[i++];
        }
      }
      i++;
      tokens.push({ s });
    } else {
      let s = '';
      while (i < n && !/[\s{}"]/.test(src[i])) s += src[i++];
      tokens.push({ s });
    }
  }
  return tokens;
}

function parse(src) {
  const tokens = tokenize(String(src || ''));
  let pos = 0;
  function block() {
    const obj = {};
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t === '}') {
        pos++;
        return obj;
      }
      if (t === '{') {
        pos++;
        continue;
      }
      const key = t.s;
      pos++;
      const v = tokens[pos];
      if (v === '{') {
        pos++;
        obj[key] = block();
      } else if (v && v !== '}') {
        pos++;
        obj[key] = v.s;
      } else {
        obj[key] = '';
      }
    }
    return obj;
  }
  return block();
}

module.exports = { parse };
