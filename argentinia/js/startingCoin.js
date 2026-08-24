// js/startingCoin.js — Entrega 23.13.57
// Presentación local del sorteo de inicio. El resultado llega decidido; este módulo sólo anima.
// @game-text-surface strict

import { gameText } from './gameTexts.js';

const COIN_RIM_HALF_PX = 7;
const COIN_RIM_LAYERS = 15;
const COIN_SPIN_MS = 3200;
const COIN_RESULT_HOLD_MS = 2000;

function injectStartingCoinStyles() {
  if (document.getElementById('starting-coin-styles')) return;
  const style = document.createElement('style');
  style.id = 'starting-coin-styles';
  style.textContent = `
    .starting-coin-overlay{position:fixed;inset:0;z-index:13000;display:flex;align-items:center;justify-content:center;background:rgba(3,7,5,.80);backdrop-filter:blur(5px);}
    .starting-coin-panel{width:min(92vw,470px);padding:28px 24px 26px;text-align:center;border:1px solid rgba(212,175,55,.55);border-radius:20px;background:radial-gradient(circle at 50% 20%,rgba(93,72,20,.20),rgba(7,15,10,.97) 58%);box-shadow:0 22px 70px rgba(0,0,0,.58),inset 0 0 35px rgba(212,175,55,.06);}
    .starting-coin-title{font-size:22px;font-weight:900;color:#f2dda1;letter-spacing:.02em}.starting-coin-subtitle{margin-top:5px;color:#b9cbbf;font-size:13px}
    .starting-coin-stage{height:226px;position:relative;display:flex;align-items:center;justify-content:center;perspective:1050px;perspective-origin:50% 46%;}
    .starting-coin-flight{position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;}
    .starting-coin{width:142px;height:142px;position:relative;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;will-change:transform;border-radius:50%;filter:drop-shadow(0 16px 20px rgba(0,0,0,.46));}
    .starting-coin-rim-layer{position:absolute;inset:0;border-radius:50%;box-sizing:border-box;transform:translateZ(var(--coin-rim-z));background:radial-gradient(circle at 34% 27%,#e0b64f 0,#b17a18 45%,#74470b 78%,#482803 100%);border:5px solid #694009;box-shadow:inset 0 0 0 2px rgba(255,226,123,.12);backface-visibility:visible;-webkit-backface-visibility:visible;}
    .starting-coin-face{position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:17px;box-sizing:border-box;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;text-align:center;font-weight:950;font-size:16px;line-height:1.05;color:#241b08;border:5px double #7d5c12;background:radial-gradient(circle at 33% 28%,#fff5b6 0,#e8c759 22%,#bd8c20 58%,#74510e 100%);box-shadow:inset 0 0 0 3px rgba(255,244,170,.35),inset -9px -10px 18px rgba(72,43,4,.33),0 0 22px rgba(213,170,52,.24);}
    .starting-coin-face::before{content:'';position:absolute;inset:10px;border:1px dashed rgba(91,61,5,.42);border-radius:50%}.starting-coin-face::after{content:'';position:absolute;inset:17px;border:1px solid rgba(255,239,158,.22);border-radius:50%}
    .starting-coin-face span{position:relative;z-index:1;max-width:96px;word-break:break-word;text-shadow:0 1px rgba(255,246,190,.45)}
    .starting-coin-front{transform:translateZ(${COIN_RIM_HALF_PX + 1}px)}
    .starting-coin-back{transform:rotateY(180deg) translateZ(${COIN_RIM_HALF_PX + 1}px);background:radial-gradient(circle at 67% 28%,#fff5b6 0,#e8c759 22%,#bd8c20 58%,#74510e 100%)}
    .starting-coin-shadow{position:absolute;left:50%;bottom:24px;width:116px;height:22px;transform:translateX(-50%);border-radius:50%;background:rgba(0,0,0,.44);filter:blur(9px);opacity:.72;transition:opacity .28s ease,transform .28s ease;}
    .starting-coin-result{min-height:32px;font-size:21px;font-weight:900;color:#f6e6ae;opacity:0;transform:translateY(6px);transition:opacity .30s ease,transform .30s ease}.starting-coin-result.is-visible{opacity:1;transform:none}
    .starting-coin.has-landed{filter:drop-shadow(0 12px 18px rgba(0,0,0,.42)) drop-shadow(0 0 13px rgba(231,189,67,.22));}
    @media (prefers-reduced-motion:reduce){.starting-coin,.starting-coin-flight{animation:none!important;transition:none!important}}
  `;
  document.head.appendChild(style);
}

function safeName(name, fallback) {
  const clean = String(name || '').trim();
  return clean || fallback;
}

function buildRimLayers() {
  const step = (COIN_RIM_HALF_PX * 2) / Math.max(1, COIN_RIM_LAYERS - 1);
  return Array.from({ length: COIN_RIM_LAYERS }, (_, index) => {
    const z = -COIN_RIM_HALF_PX + step * index;
    return `<i class="starting-coin-rim-layer" style="--coin-rim-z:${z.toFixed(2)}px"></i>`;
  }).join('');
}

function animateCoinFlight({ coin, flight, shadow, winnerSide, reduced }) {
  const duration = reduced ? 120 : COIN_SPIN_MS;
  const turns = reduced ? 0 : 8;
  // Evitamos terminar exactamente sobre el plano 180° para no dejar la decisión de backface
  // en un punto numéricamente ambiguo del compositor 3D. La diferencia es subpixel/invisible.
  const landingNudge = winnerSide === 'rival' ? 0.04 : 0.02;
  const finalDegrees = turns * 360 + (winnerSide === 'rival' ? 180 : 0) + landingNudge;
  const finalTransform = `rotateY(${finalDegrees}deg) rotateX(0deg)`;

  if (reduced || typeof coin.animate !== 'function') {
    coin.style.transition = reduced ? 'none' : `transform ${duration}ms cubic-bezier(.10,.72,.12,1)`;
    coin.style.transform = finalTransform;
    return { duration, finalTransform };
  }

  const spin = coin.animate([
    { transform: 'rotateY(0deg) rotateX(8deg)', offset: 0 },
    { transform: `rotateY(${finalDegrees * 0.34}deg) rotateX(-12deg)`, offset: 0.34 },
    { transform: `rotateY(${finalDegrees * 0.67}deg) rotateX(9deg)`, offset: 0.67 },
    { transform: `rotateY(${finalDegrees * 0.90}deg) rotateX(-4deg)`, offset: 0.90 },
    { transform: finalTransform, offset: 1 }
  ], {
    duration,
    easing: 'cubic-bezier(.10,.72,.12,1)',
    fill: 'forwards'
  });

  flight?.animate?.([
    { transform: 'translateY(8px)', offset: 0 },
    { transform: 'translateY(-24px)', offset: 0.30 },
    { transform: 'translateY(-10px)', offset: 0.72 },
    { transform: 'translateY(0)', offset: 1 }
  ], { duration, easing: 'cubic-bezier(.18,.66,.20,1)', fill: 'forwards' });

  shadow?.animate?.([
    { opacity: .72, transform: 'translateX(-50%) scale(1)', offset: 0 },
    { opacity: .30, transform: 'translateX(-50%) scale(.72)', offset: 0.30 },
    { opacity: .48, transform: 'translateX(-50%) scale(.86)', offset: 0.72 },
    { opacity: .72, transform: 'translateX(-50%) scale(1)', offset: 1 }
  ], { duration, easing: 'ease-out', fill: 'forwards' });

  // Persistimos exactamente la misma orientación final que produjo la animación. No se
  // reemplazan caras, textos ni transforms: sólo se congela la moneda física donde cayó.
  spin.finished.then(() => {
    coin.style.transform = finalTransform;
    spin.cancel();
  }).catch(() => {});
  return { duration, finalTransform };
}

export function showStartingCoinToss({ localName, rivalName, winnerSide = 'local' } = {}) {
  injectStartingCoinStyles();
  document.getElementById('starting-coin-overlay')?.remove();
  const local = safeName(localName, 'El Gaucho');
  const rival = safeName(rivalName, 'El Tano');
  const winner = winnerSide === 'rival' ? rival : local;
  const overlay = document.createElement('div');
  overlay.id = 'starting-coin-overlay';
  overlay.className = 'starting-coin-overlay';
  overlay.innerHTML = `
    <div class="starting-coin-panel" role="dialog" aria-modal="true">
      <div class="starting-coin-title"></div>
      <div class="starting-coin-subtitle"></div>
      <div class="starting-coin-stage">
        <div class="starting-coin-shadow" aria-hidden="true"></div>
        <div class="starting-coin-flight">
          <div class="starting-coin" aria-hidden="true">
            ${buildRimLayers()}
            <div class="starting-coin-face starting-coin-front"><span></span></div>
            <div class="starting-coin-face starting-coin-back"><span></span></div>
          </div>
        </div>
      </div>
      <div class="starting-coin-result"></div>
    </div>`;
  overlay.querySelector('.starting-coin-title').textContent = gameText('game.start.coin.title');
  overlay.querySelector('.starting-coin-subtitle').textContent = gameText('game.start.coin.subtitle');
  overlay.querySelector('.starting-coin-front span').textContent = local;
  overlay.querySelector('.starting-coin-back span').textContent = rival;
  const result = overlay.querySelector('.starting-coin-result');
  result.textContent = gameText('game.start.coin.result', { player: winner });
  document.body.appendChild(overlay);

  return new Promise(resolve => {
    const coin = overlay.querySelector('.starting-coin');
    const flight = overlay.querySelector('.starting-coin-flight');
    const shadow = overlay.querySelector('.starting-coin-shadow');
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const { duration } = animateCoinFlight({ coin, flight, shadow, winnerSide, reduced });

    setTimeout(() => {
      coin.classList.add('has-landed');
      result.classList.add('is-visible');
      setTimeout(() => {
        overlay.remove();
        resolve(winnerSide);
      }, reduced ? 900 : COIN_RESULT_HOLD_MS);
    }, duration + (reduced ? 20 : 100));
  });
}
