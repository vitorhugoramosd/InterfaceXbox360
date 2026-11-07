// Animação de boot (~2,3 s): orbe surge, anel se desenha, pulso e estouro de luz.
// Qualquer entrada pula.
import { h } from './util.js';
import { sfx } from '../sound.js';

const DURATION = 2050;
let finish = null;
export let booting = true;

// Logo pessoal opcional (gerada por scripts/make-logo.js; fica fora do git).
const LOGO = '../../assets/local/logo.png';
function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = LOGO;
    setTimeout(() => resolve(false), 500);
  });
}

export function runBoot({ theme = 'blades' } = {}) {
  const boot = document.getElementById('boot');
  // Troca de visual recarrega a página: nesse caso não repete o boot.
  let skip = false;
  try { skip = sessionStorage.getItem('bladedash.skipBoot') === '1'; sessionStorage.removeItem('bladedash.skipBoot'); } catch { /* ok */ }
  if (skip) return runQuick(boot, true);
  return loadLogo().then((hasLogo) => {
    if (hasLogo) return runLogo(boot, theme);
    return theme === 'metro' ? runQuick(boot, false) : runBlades(boot);
  });
}

/** Boot com a logo: emblema surge no centro, brilho passa por cima, some (~2,4s). */
function runLogo(boot, theme) {
  boot.classList.add('logo-boot', theme === 'metro' ? 'logo-light' : 'logo-dark');
  const inner = boot.querySelector('.boot-inner');
  inner.innerHTML = `<div class="lb-wrap"><div class="lb-glow"></div>
    <img class="lb-logo" src="${LOGO}" alt=""><div class="lb-shine"></div></div>`;
  inner.append(h('div', { class: 'b-skip', text: 'Pressione qualquer botão para pular' }));
  sfx.boot();
  return new Promise((resolve) => {
    let done = false;
    finish = (fast) => {
      if (done) return;
      done = true;
      booting = false;
      boot.classList.toggle('fast', !!fast);
      boot.classList.add('out');
      document.body.classList.add('ready');
      setTimeout(() => boot.remove(), 600);
      resolve();
    };
    setTimeout(() => finish(false), 2400);
  });
}

function runBlades(boot) {
  const inner = boot.querySelector('.boot-inner');
  inner.innerHTML = `
    <div class="boot-orb">
      <div class="b-glow"></div>
      <div class="b-rays"></div>
      <div class="b-wave"></div>
      <div class="b-wave w2"></div>
      <div class="b-ring"><svg viewBox="0 0 330 330">
        <defs><linearGradient id="bootRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c8ff6a"/><stop offset="1" stop-color="#5fc400"/>
        </linearGradient></defs>
        <circle cx="165" cy="165" r="155"/></svg></div>
      <div class="b-core"></div>
    </div>
    <div class="b-flash"></div>
    <div class="b-title">blade dash</div>`;
  inner.append(h('div', { class: 'b-skip', text: 'Pressione qualquer botão para pular' }));
  sfx.boot();

  return new Promise((resolve) => {
    let done = false;
    finish = (fast) => {
      if (done) return;
      done = true;
      booting = false;
      boot.classList.toggle('fast', !!fast);
      boot.classList.add('out');
      document.body.classList.add('ready');
      setTimeout(() => { boot.remove(); }, 600);
      resolve();
    };
    setTimeout(() => finish(false), DURATION);
  });
}
/** Boot curto (Metro): fundo cinza aparece e os pivôs deslizam da direita (~1s) */
function runQuick(boot, instant) {
  boot.classList.add('quick');
  boot.querySelector('.boot-inner').replaceChildren();
  if (!instant) sfx.open();
  return new Promise((resolve) => {
    let done = false;
    finish = () => {
      if (done) return;
      done = true;
      booting = false;
      boot.classList.add('out', 'fast');
      document.body.classList.add('ready');
      setTimeout(() => boot.remove(), 400);
      resolve();
    };
    setTimeout(finish, instant ? 0 : 450);
  });
}

export function skipBoot() { if (finish) finish(true); }
