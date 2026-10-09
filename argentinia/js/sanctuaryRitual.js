import { gameText } from './gameTexts.js';
import { playSfx } from './audioManager.js';
import { decorateFlasheraCard } from './flasheraRenderer.js';

const STYLE_ID = 'sanctuary-stage14-ritual-styles';
const CARD_BACK_IMAGE = './assets/images/card_back.png';

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function reducedMotion() {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; }
  catch { return false; }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #sanctuary-overlay.sanctuary-cinematic-active .sanctuary-topbar,
    #sanctuary-overlay.sanctuary-cinematic-active .sanctuary-shell-dock {
      opacity:0; pointer-events:none; transition:opacity .28s ease;
    }
    #sanctuary-overlay.sanctuary-cinematic-active .sanctuary-ritual-core { opacity:0; transform:scale(.88); transition:opacity .28s ease,transform .28s ease; }
    #sanctuary-overlay.sanctuary-cinematic-active .sanctuary-ritual-ring { opacity:.82; transform:scale(1.06); transition:.5s ease; }

    .sanctuary-reveal-layer {
      --sanctuary-reveal-card-w:clamp(126px,min(30vw,43vh),250px);
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      z-index:45; width:min(94vw,760px); height:min(92vh,650px);
      display:grid; place-items:center; pointer-events:none; overflow:visible;
      text-align:center; isolation:isolate;
    }
    .sanctuary-reveal-layer::before,
    .sanctuary-reveal-layer::after {
      content:''; position:absolute; left:50%; top:50%; width:min(80vmin,590px); aspect-ratio:1;
      transform:translate(-50%,-50%); border-radius:50%; pointer-events:none; opacity:0;
    }
    .sanctuary-reveal-layer::before {
      background:repeating-conic-gradient(from 0deg,transparent 0 10deg,rgba(244,214,119,.18) 11deg 11.7deg,transparent 12.2deg 26deg);
      mask:radial-gradient(circle,transparent 0 31%,#000 45%,transparent 71%);
      -webkit-mask:radial-gradient(circle,transparent 0 31%,#000 45%,transparent 71%);
    }
    .sanctuary-reveal-layer::after {
      width:min(62vmin,460px); border:1px solid rgba(244,214,119,.22);
      box-shadow:0 0 54px rgba(237,190,67,.15),inset 0 0 42px rgba(244,221,147,.08);
    }
    .sanctuary-reveal-layer.is-awake::before { opacity:.36; animation:sanctuary-reveal-rays 14s linear infinite; }
    .sanctuary-reveal-layer.is-symbols::before { opacity:.68; animation-duration:8s; }
    .sanctuary-reveal-layer.is-charging::before { opacity:.92; animation-duration:2.6s; }
    .sanctuary-reveal-layer.is-charging::after { opacity:.85; animation:sanctuary-reveal-pulse .6s ease-in-out infinite alternate; }
    .sanctuary-reveal-layer.is-revealed::before { opacity:.50; }
    .sanctuary-reveal-layer.is-revealed::after { opacity:.55; }

    .sanctuary-reveal-mist {
      position:absolute; left:50%; top:50%; width:min(86vmin,680px); height:min(58vmin,410px);
      transform:translate(-50%,-50%); border-radius:50%; opacity:0; pointer-events:none;
      background:
        radial-gradient(ellipse at 24% 48%,rgba(232,224,190,.18),transparent 34%),
        radial-gradient(ellipse at 70% 56%,rgba(211,205,181,.16),transparent 38%),
        radial-gradient(ellipse at 52% 48%,rgba(255,245,206,.10),transparent 52%);
      filter:blur(13px); transition:opacity .55s ease,transform 1.2s ease;
    }
    .sanctuary-reveal-layer.is-mist .sanctuary-reveal-mist { opacity:.92; transform:translate(-50%,-50%) scale(1.12); }
    .sanctuary-reveal-layer.is-card-ready .sanctuary-reveal-mist { opacity:.18; }

    .sanctuary-reveal-word {
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.95);
      width:min(90vw,660px); padding:10px 16px; box-sizing:border-box;
      color:#fff0b9; font:950 clamp(18px,3.2vmin,34px)/1.08 inherit; letter-spacing:.04em;
      text-shadow:0 3px 14px #000,0 0 28px rgba(245,211,106,.38);
      opacity:0; transition:opacity .28s ease,transform .38s ease; z-index:8;
    }
    .sanctuary-reveal-word.is-visible { opacity:1; transform:translate(-50%,-50%) scale(1); }

    .sanctuary-reveal-card-zone {
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.72);
      width:calc(var(--sanctuary-reveal-card-w) + 84px); height:calc(var(--sanctuary-reveal-card-w) * 1.4 + 70px);
      display:grid; place-items:center; perspective:1400px; opacity:0; z-index:12;
      transition:opacity .45s ease,transform .62s cubic-bezier(.2,.85,.18,1);
    }
    .sanctuary-reveal-layer.is-card-ready .sanctuary-reveal-card-zone { opacity:1; transform:translate(-50%,-50%) scale(1); }
    .sanctuary-reveal-halo {
      position:absolute; width:calc(var(--sanctuary-reveal-card-w) * 1.85); aspect-ratio:1; border-radius:50%;
      background:rgba(238,198,72,.44); filter:blur(25px); opacity:.36; transform:scale(.74);
      transition:opacity .4s ease,transform .55s ease;
    }
    .sanctuary-reveal-layer.is-charging .sanctuary-reveal-halo { opacity:.95; transform:scale(1.22); animation:sanctuary-reveal-pulse .45s ease-in-out infinite alternate; }
    .sanctuary-reveal-layer.is-revealed .sanctuary-reveal-halo { opacity:.72; transform:scale(1.10); }

    .sanctuary-reveal-card-shell {
      position:relative; width:var(--sanctuary-reveal-card-w); aspect-ratio:5/7;
      transform-style:preserve-3d; transition:transform .78s cubic-bezier(.18,.82,.18,1);
      filter:drop-shadow(0 22px 34px rgba(0,0,0,.70));
    }
    .sanctuary-reveal-layer.is-charging .sanctuary-reveal-card-shell { animation:sanctuary-reveal-shiver .14s ease-in-out infinite alternate; }
    .sanctuary-reveal-layer.is-flipped .sanctuary-reveal-card-shell { transform:rotateY(180deg); animation:none; }
    .sanctuary-reveal-face {
      position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden;
      display:flex; align-items:center; justify-content:center;
    }
    .sanctuary-reveal-front { transform:rotateY(180deg); }
    .sanctuary-reveal-back-card {
      width:100%; height:100%; border:5px solid #111; border-radius:9px; box-sizing:border-box;
      background:#321b09 repeating-linear-gradient(45deg,#321b09 0 7px,#492709 7px 14px);
      overflow:hidden; box-shadow:0 18px 38px rgba(0,0,0,.72);
    }
    .sanctuary-reveal-back-card img { width:100%; height:100%; display:block; object-fit:cover; }
    .sanctuary-reveal-front .card {
      --card-w:var(--sanctuary-reveal-card-w); width:var(--sanctuary-reveal-card-w)!important;
      min-width:0!important; max-width:none!important; height:auto!important; min-height:0!important;
      transform:none!important; transform-origin:center!important; box-shadow:0 18px 40px rgba(0,0,0,.72)!important;
      pointer-events:none!important;
    }
    .sanctuary-reveal-front .card:hover { transform:none!important; }

    .sanctuary-reveal-result {
      position:absolute; left:50%; top:50%; transform:translate(-50%,calc(-50% + var(--sanctuary-reveal-card-w) * .92));
      width:min(90vw,620px); z-index:15; opacity:0; transition:opacity .35s ease,transform .35s ease;
      pointer-events:none;
    }
    .sanctuary-reveal-layer.is-final .sanctuary-reveal-result { opacity:1; transform:translate(-50%,calc(-50% + var(--sanctuary-reveal-card-w) * 1.00)); }
    .sanctuary-reveal-layer[data-flashera='yes'].is-revealed .sanctuary-reveal-halo { background:conic-gradient(from 20deg,#eaa7fc,#a6ffd3,#f9e5a5,#9dc9ff,#eaa7fc);filter:blur(30px); }
    .sanctuary-reveal-layer[data-flashera='yes'].is-final .sanctuary-reveal-success {color:#fff2c1;text-shadow:0 0 15px #d87ef7,0 0 28px #7affde;}
    .sanctuary-reveal-success { color:#dfc668; font-size:10px; font-weight:950; letter-spacing:.18em; text-transform:uppercase; text-shadow:0 2px 8px #000; }
    .sanctuary-reveal-name { margin-top:4px; color:#fff1bb; font:950 clamp(15px,2.5vmin,25px)/1.05 inherit; text-shadow:0 2px 10px #000; }
    .sanctuary-reveal-admin { margin-top:5px; color:#d7c5e9; font-size:9px; font-weight:850; }
    .sanctuary-reveal-continue {
      margin-top:9px; appearance:none; pointer-events:auto; cursor:pointer; min-width:150px;
      border:2px solid #d4af37; border-radius:10px; padding:8px 17px;
      background:linear-gradient(180deg,rgba(212,175,55,.30),rgba(20,17,8,.95)); color:#f6e7b2;
      font:950 11px/1 inherit; letter-spacing:.08em; box-shadow:0 8px 22px rgba(0,0,0,.45),0 0 20px rgba(212,175,55,.12);
    }
    .sanctuary-reveal-continue:focus-visible { outline:2px solid #fff0a4; outline-offset:3px; }

    @keyframes sanctuary-reveal-rays { to { transform:translate(-50%,-50%) rotate(360deg); } }
    @keyframes sanctuary-reveal-pulse { to { transform:scale(1.18); filter:blur(31px); } }
    @keyframes sanctuary-reveal-shiver { from { transform:translateX(-1px) rotate(-.25deg); } to { transform:translateX(1px) rotate(.25deg); } }

    @media(max-height:520px), (max-width:900px) {
      .sanctuary-reveal-layer { --sanctuary-reveal-card-w:clamp(118px,min(27vw,41vh),180px); }
      .sanctuary-reveal-word { font-size:clamp(16px,4vmin,25px); }
      .sanctuary-reveal-result { transform:translate(-50%,calc(-50% + var(--sanctuary-reveal-card-w) * .93)); }
      .sanctuary-reveal-layer.is-final .sanctuary-reveal-result { transform:translate(-50%,calc(-50% + var(--sanctuary-reveal-card-w) * 1.02)); }
      .sanctuary-reveal-continue { padding:6px 13px; min-width:128px; font-size:9px; }
    }
    @media (prefers-reduced-motion:reduce) {
      .sanctuary-reveal-layer *, .sanctuary-reveal-layer::before, .sanctuary-reveal-layer::after {
        animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function safePlay(id, options = {}) {
  try { return playSfx(id, options); } catch { return null; }
}

export async function runSanctuaryRitual({ overlay, card, renderCard, adminBypass = false, onContinue = null, source = 'barcode', flashera = false } = {}) {
  if (!(overlay instanceof HTMLElement)) throw new Error('SANCTUARY_RITUAL_OVERLAY_REQUIRED');
  if (!card?.id) throw new Error('SANCTUARY_RITUAL_CARD_REQUIRED');
  if (typeof renderCard !== 'function') throw new Error('SANCTUARY_RITUAL_RENDERER_REQUIRED');
  injectStyles();

  const anchor = overlay.querySelector('#sanctuary-ritual-anchor');
  if (!anchor) throw new Error('SANCTUARY_RITUAL_ANCHOR_MISSING');
  anchor.querySelector('.sanctuary-reveal-layer')?.remove();

  const token = Symbol('sanctuary-ritual');
  const ritualSource = String(source || 'barcode').toLowerCase() === 'resonance' ? 'resonance' : 'barcode';
  overlay.__sanctuaryRitualToken = token;
  overlay.classList.add('sanctuary-cinematic-active');
  overlay.dataset.sanctuaryShellState = `RITUAL_${ritualSource.toUpperCase()}`;

  const layer = document.createElement('div');
  layer.className = 'sanctuary-reveal-layer';
  layer.dataset.source = ritualSource;
  layer.dataset.flashera = flashera===true?'yes':'no';
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  layer.innerHTML = `
    <div class="sanctuary-reveal-mist" aria-hidden="true"></div>
    <div class="sanctuary-reveal-word"></div>
    <div class="sanctuary-reveal-card-zone" aria-hidden="true">
      <div class="sanctuary-reveal-halo"></div>
      <div class="sanctuary-reveal-card-shell">
        <div class="sanctuary-reveal-face sanctuary-reveal-back">
          <div class="sanctuary-reveal-back-card"><img src="${CARD_BACK_IMAGE}" alt="" onerror="this.style.display='none'"></div>
        </div>
        <div class="sanctuary-reveal-face sanctuary-reveal-front"></div>
      </div>
    </div>
    <div class="sanctuary-reveal-result">
      <div class="sanctuary-reveal-success">${flashera===true?'✨ FLASHERA · DESCUBRIMIENTO':esc(gameText('sanctuary.ritual.success'))}</div>
      <div class="sanctuary-reveal-name">${esc(card.name || card.id)}</div>
      ${adminBypass ? `<div class="sanctuary-reveal-admin">${esc(gameText('sanctuary.ritual.adminUnlimited'))}</div>` : ''}
      <button type="button" class="sanctuary-reveal-continue">${esc(gameText('sanctuary.ritual.continue'))}</button>
    </div>`;
  anchor.appendChild(layer);

  const front = layer.querySelector('.sanctuary-reveal-front');
  const rendered = renderCard(card);
  if (!(rendered instanceof HTMLElement)) throw new Error('SANCTUARY_RITUAL_RENDER_INVALID');
  rendered.style.setProperty('--card-w', 'var(--sanctuary-reveal-card-w)');
  front.appendChild(rendered);
  if(flashera===true) decorateFlasheraCard(rendered,{mode:'full'});

  const word = layer.querySelector('.sanctuary-reveal-word');
  const alive = () => document.body.contains(overlay) && overlay.__sanctuaryRitualToken === token;
  const timings = reducedMotion()
    ? { phrase:35, mist:35, symbols:35, bind:35, card:55, charge:50, flip:60, final:40 }
    : { phrase:620, mist:700, symbols:720, bind:720, card:620, charge:850, flip:820, final:440 };

  const say = async (text, hold) => {
    if (!alive()) return false;
    word.textContent = text;
    word.classList.add('is-visible');
    await wait(hold);
    if (!alive()) return false;
    word.classList.remove('is-visible');
    await wait(reducedMotion() ? 5 : 170);
    return alive();
  };

  layer.classList.add('is-awake');
  safePlay('spellCast', { volumeMultiplier:.58 });
  if (!(await say(gameText('sanctuary.ritual.awakens'), timings.phrase))) return null;

  layer.classList.add('is-mist');
  safePlay('fogGlobal', { volumeMultiplier:.48 });
  if (!(await say(gameText('sanctuary.ritual.mist'), timings.mist))) return null;

  layer.classList.add('is-symbols');
  safePlay('proliferatePulse', { volumeMultiplier:.50 });
  if (!(await say(gameText('sanctuary.ritual.symbols'), timings.symbols))) return null;

  const bindingTextKey = ritualSource === 'resonance' ? 'sanctuary.ritual.binding' : 'sanctuary.ritual.sealBinding';
  if (!(await say(gameText(bindingTextKey), timings.bind))) return null;

  word.textContent = gameText('sanctuary.ritual.revealing');
  word.classList.add('is-visible');
  layer.classList.add('is-card-ready');
  safePlay('spellCast', { volumeMultiplier:.68 });
  await wait(timings.card);
  if (!alive()) return null;
  word.classList.remove('is-visible');
  layer.classList.add('is-charging');
  safePlay('proliferatePulse', { volumeMultiplier:.68 });
  await wait(timings.charge);
  if (!alive()) return null;

  layer.classList.remove('is-charging');
  layer.classList.add('is-flipped');
  safePlay('permanentTransformed', { volumeMultiplier:.84 });
  await wait(timings.flip);
  if (!alive()) return null;

  layer.classList.add('is-revealed');
  if(flashera===true) safePlay('flasheraReveal',{volumeMultiplier:.90});
  await wait(timings.final);
  if (!alive()) return null;
  layer.classList.add('is-final');
  overlay.dataset.sanctuaryShellState = 'RITUAL_REVEALED';

  const continueBtn = layer.querySelector('.sanctuary-reveal-continue');
  continueBtn?.addEventListener('click', () => {
    if (!alive()) return;
    overlay.__sanctuaryRitualToken = null;
    overlay.classList.remove('sanctuary-cinematic-active');
    layer.remove();
    overlay.dataset.sanctuaryShellState = 'RITUAL_COMPLETE';
    onContinue?.();
  }, { once:true });
  requestAnimationFrame(() => continueBtn?.focus());
  return { layer, continueButton:continueBtn };
}

// Alias histórico Stage 14. Stage 18 reutiliza el mismo ritual para Barcode y Resonancia.
export function runSanctuaryBarcodeRitual(options = {}) {
  return runSanctuaryRitual({ ...options, source: options?.source || 'barcode' });
}

export function cancelSanctuaryRitual(overlay) {
  if (!(overlay instanceof HTMLElement)) return;
  overlay.__sanctuaryRitualToken = null;
  overlay.classList.remove('sanctuary-cinematic-active');
  overlay.querySelector('.sanctuary-reveal-layer')?.remove();
}
