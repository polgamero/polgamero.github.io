import { PACK_COMMONS, PACK_UNCOMMONS, PACK_LANDS } from './store.js';
import { bindCardZoomControl } from './cardZoom.js';
import { bindPackCardInspector } from './packCardInspector.js';

// 23.13.1 — Presentación pura. Este módulo NO compra, NO consume sobres y NO escribe
// Firestore. La economía debe haber terminado antes de invocarlo. Así cerrar/saltar la
// animación jamás puede duplicar ni perder recompensas.

const STYLE_ID = 'pack-opening-cinematic-styles';
const PACK_IMAGE = './assets/images/ui/sobres.png';
const CARD_BACK_IMAGE = './assets/images/card_back.png';
const PACK_REVEAL_INTRO_MS = 1200;
const FINAL_RARE_SUSPENSE_MS = 1050;
const FINAL_MYTHIC_SUSPENSE_MS = 1450;

export function buildPackRevealSequence(cards = []) {
  if (!Array.isArray(cards) || cards.length !== PACK_COMMONS + PACK_UNCOMMONS + PACK_LANDS + 1) {
    throw new Error('La apertura cinematográfica requiere un sobre completo de 15 cartas.');
  }

  const commons = cards.slice(0, PACK_COMMONS).map((card, index) => ({
    card, tier: 'common', tierIndex: index + 1, tierTotal: PACK_COMMONS, sourceIndex: index
  }));
  const uncommonsStart = PACK_COMMONS;
  const uncommons = cards.slice(uncommonsStart, uncommonsStart + PACK_UNCOMMONS).map((card, index) => ({
    card, tier: 'uncommon', tierIndex: index + 1, tierTotal: PACK_UNCOMMONS, sourceIndex: uncommonsStart + index
  }));
  const rareIndex = PACK_COMMONS + PACK_UNCOMMONS;
  const rareCard = cards[rareIndex];
  const lands = cards.slice(rareIndex + 1).map((card, index) => ({
    card, tier: 'land', tierIndex: index + 1, tierTotal: PACK_LANDS, sourceIndex: rareIndex + 1 + index
  }));
  const finalTier = rareCard?.rarity === 'Mythic' ? 'mythic' : 'rare';

  // La tierra se mueve visualmente antes de las Uncommon para garantizar que el último
  // reveal SIEMPRE sea el slot Rare/Mythic. No altera collection ni el orden acreditado.
  const sequence = [
    ...commons,
    ...lands,
    ...uncommons,
    { card: rareCard, tier: finalTier, tierIndex: 1, tierTotal: 1, sourceIndex: rareIndex, isFinal: true }
  ];
  return sequence.map((entry, index) => ({ ...entry, revealIndex: index, revealNumber: index + 1, revealTotal: sequence.length }));
}

export function tierPresentation(tier) {
  // 23.13.3 — la rareza gobierna color/halo internamente, pero no se anuncia antes del flip.
  // La sorpresa la construyen la luz, el ritmo y la propia carta; nunca texto spoiler.
  if (tier === 'mythic') return { label: '', kicker: '', className: 'tier-mythic' };
  if (tier === 'rare') return { label: '', kicker: '', className: 'tier-rare' };
  if (tier === 'uncommon') return { label: '', kicker: '', className: 'tier-uncommon' };
  if (tier === 'land') return { label: '', kicker: '', className: 'tier-land' };
  return { label: '', kicker: '', className: 'tier-common' };
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #pack-opening-overlay {
      --pack-card-w: clamp(118px, min(29vw, 39vh), 260px);
      position:fixed; inset:0; z-index:15050; color:#f3ead3;
      background:
        radial-gradient(circle at 50% 43%, rgba(226,183,20,.13), transparent 24%),
        radial-gradient(circle at 18% 20%, rgba(45,86,135,.16), transparent 30%),
        linear-gradient(145deg,#050807 0%,#101812 48%,#050806 100%);
      display:grid; grid-template-rows:auto 1fr auto; overflow:hidden; isolation:isolate;
      font-family:inherit; user-select:none; -webkit-user-select:none;
    }
    #pack-opening-overlay::before, #pack-opening-overlay::after {
      content:""; position:absolute; inset:-25%; pointer-events:none; z-index:-1; opacity:.32;
      background:conic-gradient(from 0deg,transparent 0 14deg,rgba(226,183,20,.08) 15deg,transparent 17deg 40deg);
      animation:pack-rays-spin 18s linear infinite;
    }
    #pack-opening-overlay::after { animation-direction:reverse; animation-duration:27s; opacity:.16; transform:scale(.82); }
    @keyframes pack-rays-spin { to { transform:rotate(360deg); } }

    .pack-opening-topbar { display:flex; align-items:center; gap:14px; padding:14px 18px 6px; min-height:48px; box-sizing:border-box; }
    .pack-opening-title { font-size:clamp(15px,2vw,23px); font-weight:900; color:#f0e0b0; letter-spacing:.5px; }
    .pack-opening-progress { margin-left:auto; font-size:12px; color:#aeb9af; font-weight:800; }
    .pack-opening-skip { border:1px solid rgba(240,224,176,.36); border-radius:8px; background:rgba(4,8,5,.48); color:#aeb9af; padding:6px 10px; font-size:10px; font-weight:800; cursor:pointer; }
    .pack-opening-skip:hover { color:#f0e0b0; border-color:#d4af37; }

    .pack-opening-stage { position:relative; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 14px; }
    .pack-opening-kicker { min-height:21px; font-size:clamp(11px,1.5vw,15px); font-weight:900; letter-spacing:1.4px; color:#aeb9af; text-transform:uppercase; text-align:center; }
    .pack-opening-rarity { margin-top:2px; min-height:20px; font-size:11px; font-weight:900; letter-spacing:2px; color:#d5d9d5; }
    .pack-opening-card-zone { position:relative; width:calc(var(--pack-card-w) + 76px); height:calc(var(--pack-card-w) * 1.4 + 32px); display:flex; align-items:center; justify-content:center; perspective:1200px; }
    .pack-opening-halo { position:absolute; width:calc(var(--pack-card-w) * 1.55); aspect-ratio:1; border-radius:50%; opacity:.22; filter:blur(18px); transform:scale(.78); transition:opacity .4s ease,transform .55s ease,background .4s ease; background:rgba(220,225,220,.28); }
    .pack-opening-card-shell { position:relative; width:var(--pack-card-w); aspect-ratio:5/7; transform-style:preserve-3d; transition:transform .62s cubic-bezier(.2,.8,.2,1); }
    .pack-opening-card-shell.is-revealed { transform:rotateY(180deg); }
    .pack-opening-face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; display:flex; align-items:center; justify-content:center; }
    .pack-opening-front { transform:rotateY(180deg); }
    .pack-opening-back-card { width:100%; height:100%; border:5px solid #111; border-radius:9px; box-sizing:border-box; background:#321b09 repeating-linear-gradient(45deg,#321b09 0 7px,#492709 7px 14px); box-shadow:0 18px 38px rgba(0,0,0,.68); overflow:hidden; }
    .pack-opening-back-card img { width:100%; height:100%; object-fit:cover; display:block; }
    .pack-opening-front .card { width:var(--pack-card-w) !important; max-width:none !important; min-width:0 !important; height:auto !important; min-height:0 !important; transform:none !important; transform-origin:center !important; box-shadow:0 18px 40px rgba(0,0,0,.72) !important; }
    .pack-opening-front .card:hover { transform:none !important; }

    #pack-opening-overlay.tier-uncommon .pack-opening-halo { background:rgba(190,205,220,.52); opacity:.42; }
    #pack-opening-overlay.tier-land .pack-opening-halo { background:rgba(159,117,75,.48); opacity:.34; }
    #pack-opening-overlay.tier-rare .pack-opening-halo { background:rgba(255,211,56,.73); opacity:.63; }
    #pack-opening-overlay.tier-mythic .pack-opening-halo { background:rgba(242,111,28,.82); opacity:.72; }
    #pack-opening-overlay.tier-rare .pack-opening-rarity { color:#f5d84e; }
    #pack-opening-overlay.tier-mythic .pack-opening-rarity { color:#ff8b38; text-shadow:0 0 14px rgba(255,112,33,.7); }
    #pack-opening-overlay.tier-uncommon .pack-opening-rarity { color:#d0dae1; }

    #pack-opening-overlay.is-charging .pack-opening-halo { opacity:.95; transform:scale(1.18); animation:pack-halo-pulse .48s ease-in-out infinite alternate; }
    #pack-opening-overlay.is-charging .pack-opening-card-shell { animation:pack-card-charge .14s ease-in-out infinite alternate; }
    #pack-opening-overlay.tier-mythic.is-charging .pack-opening-stage::before,
    #pack-opening-overlay.tier-rare.is-charging .pack-opening-stage::before {
      content:""; position:absolute; inset:4% 18%; pointer-events:none; opacity:.72;
      background:repeating-conic-gradient(from 0deg,transparent 0 8deg,currentColor 9deg 9.6deg,transparent 10deg 18deg);
      color:#f3d04b; mask:radial-gradient(circle,transparent 0 28%,#000 50%,transparent 72%);
      animation:pack-final-rays .75s linear infinite;
    }
    #pack-opening-overlay.tier-mythic.is-charging .pack-opening-stage::before { color:#ff792c; animation-duration:.48s; }
    @keyframes pack-halo-pulse { to { transform:scale(1.34); filter:blur(25px); } }
    @keyframes pack-card-charge { from { transform:translateX(-1px) rotate(-.2deg); } to { transform:translateX(1px) rotate(.2deg); } }
    @keyframes pack-final-rays { to { transform:rotate(360deg); } }
    #pack-opening-overlay.just-revealed .pack-opening-halo { transform:scale(1.34); opacity:.9; }

    .pack-opening-name { min-height:24px; margin-top:1px; font-size:clamp(13px,1.8vw,18px); font-weight:900; text-align:center; color:#f0e0b0; opacity:0; transform:translateY(6px); transition:.3s ease; }
    #pack-opening-overlay.just-revealed .pack-opening-name, #pack-opening-overlay.is-revealed-state .pack-opening-name { opacity:1; transform:none; }

    .pack-opening-controls { min-height:62px; display:flex; justify-content:center; align-items:center; gap:12px; padding:4px 16px 14px; box-sizing:border-box; }
    .pack-opening-primary { min-width:174px; min-height:42px; border:2px solid #d4af37; border-radius:11px; padding:8px 22px; cursor:pointer; color:#f5e9c2; font-weight:900; letter-spacing:.5px; background:linear-gradient(180deg,rgba(212,175,55,.28),rgba(15,22,16,.96)); box-shadow:0 8px 25px rgba(0,0,0,.38); }
    .pack-opening-primary:hover { box-shadow:0 0 24px rgba(212,175,55,.3),0 8px 25px rgba(0,0,0,.38); }
    .pack-opening-hint { color:#7f8d82; font-size:10px; }

    .pack-opening-intro-pack { width:clamp(94px,16vw,160px); filter:drop-shadow(0 20px 30px rgba(0,0,0,.65)); animation:pack-float 1.6s ease-in-out infinite alternate; }
    .pack-opening-intro-title { font-size:clamp(22px,4vw,42px); font-weight:950; color:#f0e0b0; margin:12px 0 4px; }
    .pack-opening-intro-copy { color:#aeb9af; max-width:560px; text-align:center; font-size:13px; line-height:1.4; }
    @keyframes pack-float { to { transform:translateY(-7px) rotate(1deg); } }

    .pack-opening-summary {
      --pack-summary-card-w:108px;
      position:absolute; inset:0; z-index:3; display:none; flex-direction:column;
      background:linear-gradient(180deg,rgba(8,13,9,.985),rgba(4,8,5,.995));
      padding:14px 20px 12px; box-sizing:border-box; overflow:hidden;
    }
    #pack-opening-overlay.show-summary .pack-opening-summary { display:flex; }
    #pack-opening-overlay.show-summary > .pack-opening-topbar,
    #pack-opening-overlay.show-summary > .pack-opening-stage,
    #pack-opening-overlay.show-summary > .pack-opening-controls { visibility:hidden; }
    .pack-opening-summary-title { text-align:center; font-size:clamp(20px,3vw,32px); font-weight:950; color:#f0e0b0; }
    .pack-opening-summary-sub { text-align:center; color:#9ead9f; font-size:12px; margin:3px 0 7px; }
    .pack-opening-summary-toolbar {
      display:flex; justify-content:center; align-items:center; gap:9px; flex:0 0 auto;
      width:min(560px,96%); margin:0 auto 8px; padding:6px 11px;
      border:1px solid rgba(212,175,55,.34); border-radius:10px; background:rgba(8,16,10,.74);
    }
    .pack-opening-summary-toolbar .zoom-icon { font-size:13px; }
    .pack-opening-summary-toolbar input[type="range"] { width:min(360px,68vw); accent-color:#d4af37; cursor:pointer; }
    .pack-opening-summary-toolbar .zoom-value { min-width:34px; color:#f0e0b0; font-size:10px; font-weight:900; text-align:right; }
    .pack-opening-summary-viewport {
      flex:1 1 auto; min-height:0; width:min(1240px,100%); margin:0 auto; overflow:auto;
      overscroll-behavior:contain; scrollbar-gutter:stable; touch-action:pan-x pan-y;
      border:1px solid rgba(212,175,55,.18); border-radius:12px;
      background:radial-gradient(circle at 50% 15%,rgba(212,175,55,.055),transparent 44%),rgba(0,0,0,.16);
    }
    .pack-opening-summary-grid {
      min-width:100%; width:max-content; min-height:100%; display:grid;
      grid-template-columns:repeat(5,var(--pack-summary-card-w));
      gap:16px 18px; padding:16px; box-sizing:border-box;
      justify-content:center; align-content:start; align-items:start;
    }
    .pack-opening-summary-card { width:var(--pack-summary-card-w); display:flex; justify-content:center; align-items:flex-start; min-width:0; min-height:0; }
    .pack-opening-summary-card .card {
      --card-w:var(--pack-summary-card-w); width:var(--pack-summary-card-w) !important;
      max-width:none !important; min-width:0 !important; height:auto !important; min-height:0 !important;
      aspect-ratio:5/7 !important; align-self:flex-start !important; flex:0 0 auto !important; transform:none !important;
    }
    .pack-opening-summary-card.final-rare .card { filter:drop-shadow(0 0 10px rgba(238,202,50,.55)); }
    .pack-opening-summary-card.final-mythic .card { filter:drop-shadow(0 0 12px rgba(242,111,28,.74)); }
    .pack-opening-summary-actions { display:flex; justify-content:center; flex:0 0 auto; padding-top:8px; }

    @media (max-height:520px), (max-width:900px) {
      #pack-opening-overlay { --pack-card-w:clamp(106px,min(25vw,42vh),166px); }
      .pack-opening-topbar { padding:7px 10px 2px; min-height:36px; }
      .pack-opening-title { font-size:14px; }
      .pack-opening-progress { font-size:9px; }
      .pack-opening-skip { padding:4px 7px; font-size:8px; }
      .pack-opening-stage { padding:0 8px; }
      .pack-opening-kicker { min-height:15px; font-size:9px; letter-spacing:1px; }
      .pack-opening-rarity { min-height:14px; font-size:8px; }
      .pack-opening-card-zone { height:calc(var(--pack-card-w) * 1.4 + 10px); width:calc(var(--pack-card-w) + 42px); }
      .pack-opening-name { min-height:16px; font-size:11px; }
      .pack-opening-controls { min-height:44px; padding:1px 8px 7px; gap:8px; }
      .pack-opening-primary { min-width:135px; min-height:32px; padding:5px 14px; font-size:10px; }
      .pack-opening-hint { display:none; }
      .pack-opening-summary { --pack-summary-card-w:92px; padding:6px 8px; }
      .pack-opening-summary-title { font-size:17px; }
      .pack-opening-summary-sub { font-size:9px; margin:1px 0 4px; }
      .pack-opening-summary-toolbar { width:min(430px,96%); padding:4px 8px; margin-bottom:5px; gap:6px; }
      .pack-opening-summary-toolbar input[type="range"] { width:min(300px,64vw); }
      .pack-opening-summary-viewport { border-radius:8px; }
      .pack-opening-summary-grid {
        grid-template-columns:repeat(5,var(--pack-summary-card-w)); gap:10px 11px; padding:10px;
        justify-content:start; align-items:flex-start; min-height:100%; touch-action:pan-x pan-y;
      }
      .pack-opening-summary-card { width:var(--pack-summary-card-w); flex:0 0 auto; align-self:flex-start; }
      .pack-opening-summary-card .card { --card-w:var(--pack-summary-card-w); width:var(--pack-summary-card-w) !important; height:auto !important; aspect-ratio:5/7 !important; flex:0 0 auto !important; }
      .pack-opening-summary-actions { padding-top:3px; }
      .pack-opening-intro-pack { width:78px; }
      .pack-opening-intro-title { font-size:20px; margin:6px 0 2px; }
      .pack-opening-intro-copy { font-size:9px; max-width:420px; }
    }
    @media (prefers-reduced-motion:reduce) {
      #pack-opening-overlay *, #pack-opening-overlay::before, #pack-opening-overlay::after { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; }
    }
  `;
  document.head.appendChild(style);
}


function preloadCardArtwork(card) {
  if (!card?.image || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = `./assets/images/cards/${card.image}`;
}

function createBackFace() {
  const face = document.createElement('div');
  face.className = 'pack-opening-face pack-opening-back';
  face.innerHTML = `<div class="pack-opening-back-card"><img src="${CARD_BACK_IMAGE}" alt="Reverso de Argentinia" onerror="this.style.display='none'"></div>`;
  return face;
}

function setTier(overlay, entry) {
  overlay.classList.remove('tier-common','tier-land','tier-uncommon','tier-rare','tier-mythic','is-charging','just-revealed','is-revealed-state');
  const presentation = tierPresentation(entry.tier);
  overlay.classList.add(presentation.className);
  overlay.querySelector('.pack-opening-kicker').textContent = presentation.kicker;
  overlay.querySelector('.pack-opening-rarity').textContent = presentation.label;
  overlay.querySelector('.pack-opening-progress').textContent = `Carta ${entry.revealNumber} de ${entry.revealTotal}`;
}

function renderFront(face, card, renderCard) {
  face.innerHTML = '';
  const cardEl = renderCard(card);
  if (!(cardEl instanceof HTMLElement)) throw new Error('El renderer de cartas no devolvió un elemento válido.');
  cardEl.style.setProperty('--card-w', 'var(--pack-card-w)');
  face.appendChild(cardEl);
}

function summaryCardElement(entry, renderCard) {
  const wrap = document.createElement('div');
  wrap.className = `pack-opening-summary-card${entry.isFinal ? ` final-${entry.tier}` : ''}`;
  const cardEl = renderCard(entry.card);
  wrap.appendChild(cardEl);
  return wrap;
}

export function showPackOpeningExperience({ cards, renderCard, fichaTotal = null, onClose = null }) {
  injectStyles();
  document.getElementById('pack-opening-overlay')?.remove();
  const sequence = buildPackRevealSequence(cards);
  const overlay = document.createElement('div');
  overlay.id = 'pack-opening-overlay';
  overlay.innerHTML = `
    <div class="pack-opening-topbar">
      <div class="pack-opening-title">ARGENTINIA · APERTURA DE SOBRE</div>
      <div class="pack-opening-progress">15 cartas</div>
      <button class="pack-opening-skip" type="button">Saltar animación</button>
    </div>
    <div class="pack-opening-stage">
      <img class="pack-opening-intro-pack" src="${PACK_IMAGE}" alt="Sobre" onerror="this.outerHTML='<div style=&quot;font-size:72px&quot;>📦</div>'">
      <div class="pack-opening-intro-title">Tu sobre está listo.</div>
      <div class="pack-opening-intro-copy">15 cartas. Tocá para descubrirlas una por una.</div>
      <div class="pack-opening-kicker" style="display:none"></div>
      <div class="pack-opening-rarity" style="display:none"></div>
      <div class="pack-opening-card-zone" style="display:none">
        <div class="pack-opening-halo"></div>
        <div class="pack-opening-card-shell">
          <div class="pack-opening-face pack-opening-back"></div>
          <div class="pack-opening-face pack-opening-front"></div>
        </div>
      </div>
      <div class="pack-opening-name"></div>
    </div>
    <div class="pack-opening-controls">
      <button class="pack-opening-primary" type="button">ABRIR SOBRE</button>
      <span class="pack-opening-hint">Click/tap · Enter · Espacio</span>
    </div>
    <div class="pack-opening-summary">
      <div class="pack-opening-summary-title">🎉 Sobre completo</div>
      <div class="pack-opening-summary-sub">${fichaTotal === null ? '+1 Ficha de mejora' : `+1 Ficha de mejora · Total: ${fichaTotal}`}.</div>
      <div class="pack-opening-summary-toolbar" title="Cambiar tamaño de las cartas">
        <span class="zoom-icon">🔍</span>
        <input class="pack-opening-summary-zoom" type="range" min="72" max="190" step="2" value="108" aria-label="Tamaño de cartas del resumen">
        <span class="zoom-value">108</span>
      </div>
      <div class="pack-opening-summary-viewport"><div class="pack-opening-summary-grid"></div></div>
      <div class="pack-opening-summary-actions"><button class="pack-opening-primary pack-opening-summary-close" type="button">VOLVER A MI COFRE</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const summaryPanel = overlay.querySelector('.pack-opening-summary');
  const summaryZoom = overlay.querySelector('.pack-opening-summary-zoom');
  const summaryZoomValue = overlay.querySelector('.pack-opening-summary-toolbar .zoom-value');
  const compactSummary = window.matchMedia?.('(max-height:520px), (max-width:900px)')?.matches;
  if (compactSummary) summaryZoom.value = '92';
  bindCardZoomControl({
    root: summaryPanel, slider: summaryZoom, valueLabel: summaryZoomValue,
    cssVar: '--pack-summary-card-w', unit: 'px', min: 72, max: 190,
    fallback: compactSummary ? 92 : 108
  });
  // Preload gradual: sólo las dos próximas ilustraciones. Evita blank-flips sin volver a
  // disparar un burst de 15 requests simultáneos contra el hosting.
  preloadCardArtwork(sequence[0]?.card);
  preloadCardArtwork(sequence[1]?.card);

  const stage = overlay.querySelector('.pack-opening-stage');
  const primary = overlay.querySelector('.pack-opening-primary');
  const skip = overlay.querySelector('.pack-opening-skip');
  const shell = overlay.querySelector('.pack-opening-card-shell');
  const backFace = overlay.querySelector('.pack-opening-back');
  const frontFace = overlay.querySelector('.pack-opening-front');
  const name = overlay.querySelector('.pack-opening-name');
  const kicker = overlay.querySelector('.pack-opening-kicker');
  const rarity = overlay.querySelector('.pack-opening-rarity');
  const cardZone = overlay.querySelector('.pack-opening-card-zone');
  const introPack = overlay.querySelector('.pack-opening-intro-pack');
  const introTitle = overlay.querySelector('.pack-opening-intro-title');
  const introCopy = overlay.querySelector('.pack-opening-intro-copy');
  const hint = overlay.querySelector('.pack-opening-hint');
  const inspector = bindPackCardInspector(shell, { frontFace, introMs: PACK_REVEAL_INTRO_MS });

  let index = -1;
  let revealed = false;
  let charging = false;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    inspector.destroy();
    overlay.remove();
    onClose?.();
  }

  function showSummary() {
    if (closed) return;
    overlay.classList.remove('is-charging');
    overlay.classList.add('show-summary');
    const grid = overlay.querySelector('.pack-opening-summary-grid');
    if (!grid.childElementCount) sequence.forEach(entry => grid.appendChild(summaryCardElement(entry, renderCard)));
  }

  // 23.13.18 — Direct Reveal se conserva para todo el sobre, pero la última carta
  // recupera EXACTAMENTE la fase de suspenso visual de 23.13.15 antes del flip. No vuelve
  // el botón REVELAR: al llegar a Rare/Mythic el charging arranca solo y desemboca solo en
  // el reveal. Así mantenemos el flujo ágil de 23.13.17 sin perder el clímax del pack.
  function revealPreparedEntry(entry, preparedIndex) {
    if (closed || index !== preparedIndex || overlay.classList.contains('show-summary')) return;
    renderFront(frontFace, entry.card, renderCard);
    shell.classList.add('is-revealed');
    inspector.startRevealIntro();
    overlay.classList.remove('is-charging');
    overlay.classList.add('just-revealed','is-revealed-state');
    name.textContent = entry.card?.name || 'Carta';
    revealed = true;

    // Mientras gira, ni Enter/Espacio ni el botón pueden adelantar una carta. El inspector
    // conserva también la protección drag→click de 23.13.15/17.
    charging = true;
    primary.disabled = true;
    primary.textContent = entry.isFinal ? 'VER RESUMEN' : 'SIGUIENTE';
    if (hint) hint.textContent = 'Esperá el giro · después arrastrá para inspeccionar';
    window.setTimeout(() => {
      if (closed || index !== preparedIndex) return;
      charging = false;
      primary.disabled = false;
      if (hint) hint.textContent = 'Arrastrá la carta para inspeccionarla · click/tap para seguir';
    }, PACK_REVEAL_INTRO_MS);
    window.setTimeout(() => overlay.classList.remove('just-revealed'), 520);
  }

  function prepareEntry(nextIndex) {
    index = nextIndex;
    revealed = false;
    charging = false;
    const entry = sequence[index];
    const preparedIndex = index;
    preloadCardArtwork(entry.card);
    preloadCardArtwork(sequence[index + 1]?.card);
    setTier(overlay, entry);
    inspector.reset();
    shell.classList.remove('is-revealed');
    backFace.replaceChildren(createBackFace().firstElementChild);
    frontFace.innerHTML = '';
    name.textContent = '';
    kicker.style.display = 'none';
    rarity.style.display = 'none';
    cardZone.style.display = '';
    introPack.style.display = 'none';
    introTitle.style.display = 'none';
    introCopy.style.display = 'none';

    if (entry.isFinal) {
      // Restauración quirúrgica de 23.13.15: halo pulsante + vibración + rayos y pausa
      // específica por rareza. La carta sigue revelándose automáticamente: cero clicks extra.
      charging = true;
      overlay.classList.add('is-charging');
      primary.disabled = true;
      primary.textContent = '···';
      if (hint) hint.textContent = '...';
      const suspenseMs = entry.tier === 'mythic' ? FINAL_MYTHIC_SUSPENSE_MS : FINAL_RARE_SUSPENSE_MS;
      window.setTimeout(() => revealPreparedEntry(entry, preparedIndex), suspenseMs);
      return;
    }

    revealPreparedEntry(entry, preparedIndex);
  }

  function advance() {
    if (closed || charging) return;
    if (index < 0) {
      prepareEntry(0);
      return;
    }
    if (sequence[index].isFinal) {
      showSummary();
      return;
    }
    prepareEntry(index + 1);
  }

  function onKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (overlay.classList.contains('show-summary')) return;
    event.preventDefault();
    advance();
  }

  primary.addEventListener('click', advance);
  shell.addEventListener('click', event => {
    if (inspector.consumeClickSuppression()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    advance();
  });
  skip.addEventListener('click', showSummary);
  overlay.querySelector('.pack-opening-summary-close').addEventListener('click', close);
  window.addEventListener('keydown', onKey);

  return { close, showSummary, sequence };
}

export function showGuaranteedMythicExperience({ card, renderCard, onClose = null }) {
  injectStyles();
  document.getElementById('pack-opening-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'pack-opening-overlay';
  overlay.classList.add('tier-mythic');
  overlay.innerHTML = `
    <div class="pack-opening-topbar"><div class="pack-opening-title">ARGENTINIA · RECOMPENSA</div><div class="pack-opening-progress">Día 7</div></div>
    <div class="pack-opening-stage">
      <div class="pack-opening-kicker"></div>
      <div class="pack-opening-rarity"></div>
      <div class="pack-opening-card-zone"><div class="pack-opening-halo"></div><div class="pack-opening-card-shell"><div class="pack-opening-face pack-opening-back"></div><div class="pack-opening-face pack-opening-front"></div></div></div>
      <div class="pack-opening-name"></div>
    </div>
    <div class="pack-opening-controls"><button class="pack-opening-primary" type="button">PREPARAR REVELACIÓN</button><span class="pack-opening-hint">Tu carta ya está segura en la colección.</span></div>`;
  document.body.appendChild(overlay);
  const shell = overlay.querySelector('.pack-opening-card-shell');
  const back = overlay.querySelector('.pack-opening-back');
  const front = overlay.querySelector('.pack-opening-front');
  const btn = overlay.querySelector('.pack-opening-primary');
  const name = overlay.querySelector('.pack-opening-name');
  const hint = overlay.querySelector('.pack-opening-hint');
  const inspector = bindPackCardInspector(shell, { frontFace: front });
  back.appendChild(createBackFace().firstElementChild);
  let revealed = false;
  let charging = false;

  function close() { window.removeEventListener('keydown', onKey); inspector.destroy(); overlay.remove(); onClose?.(); }
  function act() {
    if (charging) return;
    if (revealed) { close(); return; }
    charging = true;
    overlay.classList.add('is-charging');
    btn.disabled = true;
    btn.textContent = '···';
    window.setTimeout(() => {
      renderFront(front, card, renderCard);
      shell.classList.add('is-revealed');
      inspector.startRevealIntro();
      overlay.classList.remove('is-charging');
      overlay.classList.add('just-revealed','is-revealed-state');
      name.textContent = card?.name || 'Carta';
      btn.disabled = false;
      btn.textContent = 'VOLVER A MI COFRE';
      if (hint) hint.textContent = 'Arrastrá la carta para inspeccionarla';
      revealed = true;
      charging = false;
    }, 1500);
  }
  function onKey(e) { if ((e.key === 'Enter' || e.key === ' ') && !charging) { e.preventDefault(); act(); } }
  btn.addEventListener('click', act);
  shell.addEventListener('click', event => {
    if (inspector.consumeClickSuppression()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    act();
  });
  window.addEventListener('keydown', onKey);
  return { close };
}
