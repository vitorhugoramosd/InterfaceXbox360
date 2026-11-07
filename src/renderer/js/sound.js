// Sons da interface sintetizados com WebAudio (nenhum arquivo de áudio).
// blip ao mover, "whoosh" ao trocar de blade, sino ao selecionar, tom de voltar.

let ctx = null, master = null, noiseBuf = null;
let enabled = true;
let lastMove = 0;

export function setSoundEnabled(v) { enabled = !!v; }
export function soundEnabled() { return enabled; }

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
/** Chamar na primeira interação (política de autoplay do navegador) */
export function unlockAudio() { if (enabled) ensure(); }

function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.1, gain = 0.15, attack = 0.004, detune = 0, dest }) {
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
  o.connect(g).connect(dest || master);
  o.start(now);
  o.stop(now + dur + 0.05);
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

function whoosh({ t = 0, dur = 0.42, from = 350, peak = 2400, to = 600, gain = 0.32 } = {}) {
  const c = ctx, now = c.currentTime + t;
  const src = noise();
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(from, now);
  bp.frequency.exponentialRampToValueAtTime(peak, now + dur * 0.4);
  bp.frequency.exponentialRampToValueAtTime(to, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function play(fn) {
  if (!enabled) return;
  if (!ensure()) return;
  try { fn(); } catch (e) { /* áudio nunca deve quebrar a UI */ }
}

export const sfx = {
  move() {
    const t = performance.now();
    if (t - lastMove < 38) return;
    lastMove = t;
    play(() => {
      tone({ f0: 1480, f1: 1180, dur: 0.06, gain: 0.09 });
      tone({ f0: 2960, dur: 0.035, gain: 0.025 });
    });
  },
  blade() {
    play(() => {
      whoosh();
      tone({ type: 'sine', f0: 220, f1: 110, dur: 0.3, gain: 0.05 });
      tone({ f0: 1760, f1: 2200, t: 0.05, dur: 0.12, gain: 0.025 });
    });
  },
  select() {
    play(() => {
      tone({ f0: 1318.5, dur: 0.35, gain: 0.13 });
      tone({ f0: 1975.5, t: 0.07, dur: 0.5, gain: 0.11 });
      tone({ type: 'triangle', f0: 659.3, dur: 0.18, gain: 0.06 });
      tone({ f0: 2637, t: 0.07, dur: 0.25, gain: 0.025, detune: 6 });
    });
  },
  back() {
    play(() => {
      tone({ type: 'triangle', f0: 740, f1: 470, dur: 0.13, gain: 0.11 });
      tone({ f0: 370, t: 0.05, dur: 0.12, gain: 0.05 });
    });
  },
  open() {
    play(() => {
      tone({ f0: 523, f1: 880, dur: 0.16, gain: 0.08 });
      tone({ f0: 1568, t: 0.08, dur: 0.22, gain: 0.05 });
      whoosh({ dur: 0.28, from: 800, peak: 3200, to: 1500, gain: 0.08 });
    });
  },
  close() {
    play(() => {
      tone({ f0: 880, f1: 523, dur: 0.14, gain: 0.07 });
      whoosh({ dur: 0.22, from: 2400, peak: 1600, to: 500, gain: 0.06 });
    });
  },
  toggle() {
    play(() => {
      tone({ type: 'square', f0: 1800, dur: 0.025, gain: 0.03 });
      tone({ f0: 1200, t: 0.03, dur: 0.07, gain: 0.08 });
    });
  },
  error() {
    play(() => {
      tone({ type: 'triangle', f0: 233, dur: 0.18, gain: 0.16 });
      tone({ type: 'triangle', f0: 196, t: 0.17, dur: 0.28, gain: 0.16 });
    });
  },
  notify() {
    play(() => {
      tone({ f0: 987.8, dur: 0.25, gain: 0.08 });
      tone({ f0: 1318.5, t: 0.1, dur: 0.4, gain: 0.08 });
    });
  },
  boot() {
    play(() => {
      // pad que cresce + whoosh + sino no "estouro" do anel
      [110, 164.8, 220, 329.6, 440].forEach((f, i) => {
        const c = ctx, now = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f; o.detune.value = (i - 2) * 4;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.05, now + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
        o.connect(g).connect(master); o.start(now); o.stop(now + 2.7);
      });
      whoosh({ t: 0.6, dur: 0.8, from: 200, peak: 3000, to: 900, gain: 0.18 });
      tone({ f0: 1318.5, t: 1.25, dur: 1.1, gain: 0.09 });
      tone({ f0: 1975.5, t: 1.32, dur: 1.2, gain: 0.07 });
      tone({ f0: 2637, t: 1.4, dur: 1.0, gain: 0.04 });
    });
  },
};
