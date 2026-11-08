// Sons da interface.
// 1) Pacote pessoal opcional: arquivos em assets/local/sounds/<nome>.(wav|mp3|ogg) (fora do git).
//    Nomes: move, blade, select, back, open, close, toggle, error, notify, boot.
//    Se existir o arquivo, ele toca no lugar do som sintetizado.
// 2) Sem arquivo: sons próprios sintetizados com WebAudio (cliques suaves, whoosh arejado,
//    sinos com um leve eco de ambiente).

let ctx = null, master = null, wet = null, noiseBuf = null;
let enabled = true;
let lastMove = 0;

export function setSoundEnabled(v) { enabled = !!v; }
export function soundEnabled() { return enabled; }

// ---------- pacote pessoal ----------
const PACK_DIR = '../../assets/local/sounds/';
const NAMES = ['move', 'blade', 'select', 'back', 'open', 'close', 'toggle', 'error', 'notify', 'boot'];
const EXTS = ['wav', 'mp3', 'ogg'];
const pack = {}; // nome -> HTMLAudioElement pronto

function probe(name, i = 0) {
  if (i >= EXTS.length) return;
  const a = new Audio();
  a.preload = 'auto';
  a.addEventListener('canplaythrough', () => { pack[name] = a; }, { once: true });
  a.addEventListener('error', () => probe(name, i + 1), { once: true });
  a.src = PACK_DIR + name + '.' + EXTS[i];
}
NAMES.forEach((n) => probe(n));

/** Toca o arquivo do pacote (se houver). Retorna true se tocou. */
function playPack(name, volume = 0.8) {
  const a = pack[name];
  if (!a) return false;
  try {
    const c = a.cloneNode(); // permite sobrepor (ex.: mover rápido)
    c.volume = volume;
    c.play().catch(() => {});
  } catch { return false; }
  return true;
}
export const hasSoundPack = () => Object.keys(pack).length > 0;

// ---------- motor sintetizado ----------
function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp).connect(ctx.destination);
    // eco de ambiente curto (impulso gerado), mistura baixa
    const conv = ctx.createConvolver();
    conv.buffer = impulse(1.1, 3.2);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(conv).connect(comp);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
/** Chamar na primeira interação (política de autoplay do navegador) */
export function unlockAudio() { if (enabled) ensure(); }

function impulse(sec, decay) {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

/** Saída com pan estéreo e envio para o eco */
function out(pan = 0, send = 1) {
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (p.pan) p.pan.value = pan;
  p.connect(master);
  if (send > 0) {
    const s = ctx.createGain();
    s.gain.value = send;
    p.connect(s).connect(wet);
  }
  return p;
}

function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.1, gain = 0.15, attack = 0.004, detune = 0, pan = 0, send = 1 }) {
  const c = ctx, now = c.currentTime + t;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(out(pan, send));
  o.start(now);
  o.stop(now + dur + 0.05);
}

/** Sino suave: fundamental + parciais levemente desafinados (soa "vidro") */
function chime(f, { t = 0, dur = 0.6, gain = 0.1, pan = 0 } = {}) {
  tone({ f0: f, t, dur, gain, attack: 0.006, pan });
  tone({ f0: f * 2.01, t, dur: dur * 0.6, gain: gain * 0.35, attack: 0.004, pan, detune: 4 });
  tone({ f0: f * 3.02, t, dur: dur * 0.35, gain: gain * 0.15, attack: 0.003, pan, detune: -5 });
}

function noise() {
  if (!noiseBuf) {
    const len = ctx.sampleRate * 1.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function whoosh({ t = 0, dur = 0.42, from = 350, peak = 2400, to = 600, gain = 0.3, panFrom = 0, panTo = 0 } = {}) {
  const c = ctx, now = c.currentTime + t;
  const src = noise();
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(from, now);
  bp.frequency.exponentialRampToValueAtTime(peak, now + dur * 0.4);
  bp.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const o = out(panFrom, 0.6);
  if (o.pan) { o.pan.setValueAtTime(panFrom, now); o.pan.linearRampToValueAtTime(panTo, now + dur); }
  src.connect(bp).connect(g).connect(o);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function play(name, fn, vol) {
  if (!enabled) return;
  if (playPack(name, vol)) return;
  if (!ensure()) return;
  try { fn(); } catch (e) { /* áudio nunca deve quebrar a UI */ }
}

let bladeDir = 1;
export const sfx = {
  move() {
    const t = performance.now();
    if (t - lastMove < 38) return;
    lastMove = t;
    // clique curto e arredondado, quase um "tic" de vidro
    play('move', () => {
      tone({ f0: 2100, f1: 1500, dur: 0.045, gain: 0.07, attack: 0.002, send: 0.4 });
      tone({ type: 'triangle', f0: 900, f1: 700, dur: 0.05, gain: 0.04, attack: 0.002, send: 0.3 });
    }, 0.6);
  },
  blade(dir) {
    if (dir === -1 || dir === 1) bladeDir = dir;
    // whoosh arejado que atravessa o estéreo na direção da troca
    play('blade', () => {
      whoosh({ dur: 0.38, from: 500, peak: 3200, to: 900, gain: 0.22, panFrom: -0.5 * bladeDir, panTo: 0.5 * bladeDir });
      tone({ f0: 1600, f1: 2400, t: 0.06, dur: 0.14, gain: 0.025, pan: 0.3 * bladeDir });
    });
  },
  select() {
    // dois sinos ascendentes (quinta), brilhantes
    play('select', () => {
      chime(1046.5, { dur: 0.45, gain: 0.1 });
      chime(1568, { t: 0.075, dur: 0.6, gain: 0.09 });
      tone({ type: 'triangle', f0: 523.3, dur: 0.12, gain: 0.04, send: 0.2 });
    });
  },
  back() {
    // tom descendente macio
    play('back', () => {
      tone({ type: 'triangle', f0: 880, f1: 560, dur: 0.12, gain: 0.09 });
      tone({ f0: 1320, f1: 840, t: 0.02, dur: 0.1, gain: 0.03 });
    });
  },
  open() {
    play('open', () => {
      chime(784, { dur: 0.3, gain: 0.07 });
      chime(1174.7, { t: 0.06, dur: 0.4, gain: 0.06 });
      whoosh({ dur: 0.26, from: 900, peak: 3600, to: 1800, gain: 0.06 });
    });
  },
  close() {
    play('close', () => {
      tone({ f0: 1174.7, f1: 784, dur: 0.14, gain: 0.06 });
      whoosh({ dur: 0.2, from: 2600, peak: 1600, to: 600, gain: 0.05 });
    });
  },
  toggle() {
    play('toggle', () => {
      tone({ type: 'square', f0: 2000, dur: 0.018, gain: 0.02, send: 0 });
      chime(1396.9, { t: 0.02, dur: 0.18, gain: 0.06 });
    });
  },
  error() {
    play('error', () => {
      tone({ type: 'triangle', f0: 311, dur: 0.16, gain: 0.13 });
      tone({ type: 'triangle', f0: 247, t: 0.15, dur: 0.3, gain: 0.13 });
    });
  },
  notify() {
    play('notify', () => {
      chime(1318.5, { dur: 0.4, gain: 0.07 });
      chime(1760, { t: 0.12, dur: 0.6, gain: 0.07 });
    });
  },
  boot() {
    play('boot', () => {
      // pad que cresce + whoosh + sinos no "estouro" do anel
      [130.8, 196, 261.6, 392, 523.3].forEach((f, i) => {
        const c = ctx, now = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f; o.detune.value = (i - 2) * 5;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.045, now + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
        o.connect(g).connect(out((i - 2) * 0.25, 1)); o.start(now); o.stop(now + 2.9);
      });
      whoosh({ t: 0.55, dur: 0.85, from: 220, peak: 3400, to: 1000, gain: 0.16, panFrom: -0.4, panTo: 0.4 });
      chime(1046.5, { t: 1.2, dur: 1.3, gain: 0.08, pan: -0.15 });
      chime(1568, { t: 1.28, dur: 1.4, gain: 0.07, pan: 0.15 });
      chime(2093, { t: 1.36, dur: 1.1, gain: 0.035 });
    }, 0.9);
  },
};
