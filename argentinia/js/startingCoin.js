// js/startingCoin.js — Entrega 23.13.56
// Presentación local del sorteo de inicio. El resultado llega decidido; este módulo sólo anima.
// @game-text-surface strict

import { gameText } from './gameTexts.js';

function injectStartingCoinStyles() {
  if (document.getElementById('starting-coin-styles')) return;
  const style = document.createElement('style');
  style.id = 'starting-coin-styles';
  style.textContent = `
    .starting-coin-overlay{position:fixed;inset:0;z-index:13000;display:flex;align-items:center;justify-content:center;background:rgba(3,7,5,.78);backdrop-filter:blur(5px);}
    .starting-coin-panel{width:min(92vw,460px);padding:26px 24px 24px;text-align:center;border:1px solid rgba(212,175,55,.55);border-radius:20px;background:radial-gradient(circle at 50% 20%,rgba(93,72,20,.20),rgba(7,15,10,.97) 58%);box-shadow:0 22px 70px rgba(0,0,0,.58),inset 0 0 35px rgba(212,175,55,.06);}
    .starting-coin-title{font-size:22px;font-weight:900;color:#f2dda1;letter-spacing:.02em}.starting-coin-subtitle{margin-top:5px;color:#b9cbbf;font-size:13px}
    .starting-coin-stage{height:190px;display:flex;align-items:center;justify-content:center;perspective:900px}
    .starting-coin{width:132px;height:132px;position:relative;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;will-change:transform;border-radius:50%;filter:drop-shadow(0 13px 18px rgba(0,0,0,.45));}
    .starting-coin-face{position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;text-align:center;font-weight:900;font-size:16px;line-height:1.05;color:#241b08;border:5px double #7d5c12;background:radial-gradient(circle at 33% 28%,#fff2a6 0,#e8c759 22%,#bd8c20 58%,#74510e 100%);box-shadow:inset 0 0 0 3px rgba(255,244,170,.35),inset -9px -10px 18px rgba(72,43,4,.33),0 0 22px rgba(213,170,52,.24);}
    .starting-coin-face::before{content:'';position:absolute;inset:10px;border:1px dashed rgba(91,61,5,.42);border-radius:50%}.starting-coin-face span{position:relative;z-index:1;max-width:92px;word-break:break-word;text-shadow:0 1px rgba(255,246,190,.4)}
    .starting-coin-front{transform:rotateY(0deg) translateZ(1px)}.starting-coin-back{transform:rotateY(180deg) translateZ(1px)}.starting-coin.is-landed{transform:none!important;transition:none!important}.starting-coin.is-landed .starting-coin-face{transform:none!important;backface-visibility:visible;-webkit-backface-visibility:visible}.starting-coin.is-landed .starting-coin-face:not(.is-winner){opacity:0}.starting-coin.is-landed .starting-coin-face.is-winner{opacity:1}
    .starting-coin-result{min-height:30px;font-size:20px;font-weight:900;color:#f6e6ae;opacity:0;transform:translateY(5px);transition:opacity .22s ease,transform .22s ease}.starting-coin-result.is-visible{opacity:1;transform:none}
    @media (prefers-reduced-motion:reduce){.starting-coin{transition:none!important}}
  `;
  document.head.appendChild(style);
}

function safeName(name, fallback) {
  const clean = String(name || '').trim();
  return clean || fallback;
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
        <div class="starting-coin" aria-hidden="true">
          <div class="starting-coin-face starting-coin-front"><span></span></div>
          <div class="starting-coin-face starting-coin-back"><span></span></div>
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
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const duration = reduced ? 80 : 1450;
    const turns = reduced ? 0 : 5;
    const finalDegrees = turns * 360 + (winnerSide === 'rival' ? 180 : 0);
    requestAnimationFrame(() => {
      coin.style.transition = reduced ? 'none' : `transform ${duration}ms cubic-bezier(.18,.72,.16,1)`;
      coin.style.transform = `rotateY(${finalDegrees}deg) rotateX(${reduced ? 0 : 7}deg)`;
    });
    setTimeout(() => {
      // 23.13.56 — normalizamos el estado final de la moneda. Algunos motores 3D pueden
      // dejar visible el reverso espejado de la cara frontal al aterrizar exactamente a 180°.
      // El resultado ya está decidido, así que convertimos la cara ganadora en una cara plana
      // frontal y ocultamos explícitamente la perdedora antes de mostrar el resultado.
      const frontFace = overlay.querySelector('.starting-coin-front');
      const backFace = overlay.querySelector('.starting-coin-back');
      const winnerFace = winnerSide === 'rival' ? backFace : frontFace;
      winnerFace?.classList.add('is-winner');
      coin.classList.add('is-landed');
      result.classList.add('is-visible');
      setTimeout(() => {
        overlay.remove();
        resolve(winnerSide);
      }, reduced ? 350 : 850);
    }, duration + 60);
  });
}
