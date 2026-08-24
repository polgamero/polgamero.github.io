// js/startingCoin.js — Entrega 23.13.66
// Presentación local del sorteo de inicio. El resultado llega decidido; este módulo sólo anima.
// 23.13.66 hotfix de render 3D: preserva el cilindro real, elimina flattening y deja el culling manual como única autoridad de caras.
// @game-text-surface strict

import { gameText } from './gameTexts.js';
import { playSfx } from './audioManager.js';

const COIN_RADIUS_PX = 71;
const COIN_THICKNESS_PX = 24;
const COIN_EDGE_SEGMENTS = 64;
const COIN_SPIN_MS = 3200;
const COIN_RESULT_HOLD_MS = 2000;
const COIN_TURNS = 8;

function injectStartingCoinStyles() {
  if (document.getElementById('starting-coin-styles')) return;
  const style = document.createElement('style');
  style.id = 'starting-coin-styles';
  style.textContent = `
    .starting-coin-overlay{position:fixed;inset:0;z-index:13000;display:flex;align-items:center;justify-content:center;background:rgba(3,7,5,.80);backdrop-filter:blur(5px);}
    .starting-coin-panel{width:min(92vw,470px);padding:28px 24px 26px;text-align:center;border:1px solid rgba(212,175,55,.55);border-radius:20px;background:radial-gradient(circle at 50% 20%,rgba(93,72,20,.20),rgba(7,15,10,.97) 58%);box-shadow:0 22px 70px rgba(0,0,0,.58),inset 0 0 35px rgba(212,175,55,.06);}
    .starting-coin-title{font-size:22px;font-weight:900;color:#f2dda1;letter-spacing:.02em}.starting-coin-subtitle{margin-top:5px;color:#b9cbbf;font-size:13px}
    .starting-coin-stage{height:226px;position:relative;display:flex;align-items:center;justify-content:center;perspective:920px;perspective-origin:50% 43%;}
    .starting-coin-flight{position:relative;width:160px;height:160px;display:flex;align-items:center;justify-content:center;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;will-change:transform;}
    .starting-coin{width:${COIN_RADIUS_PX*2}px;height:${COIN_RADIUS_PX*2}px;position:relative;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;will-change:transform;border-radius:50%;}

    /* Pared lateral REAL del cilindro: 64 rectángulos tangenciales. Su eje corto queda en
       Z; al pasar de canto forman una banda de ${COIN_THICKNESS_PX}px y dejan de verse como un disco flat. */
    .starting-coin-edge-segment{position:absolute;left:50%;top:50%;width:7.4px;height:${COIN_THICKNESS_PX}px;margin-left:-3.7px;margin-top:-${COIN_THICKNESS_PX/2}px;box-sizing:border-box;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transform:rotateZ(var(--coin-edge-angle)) translateY(-${COIN_RADIUS_PX-4}px) rotateX(90deg);background:linear-gradient(180deg,#4b2903 0%,#8c5710 12%,#e4ba55 36%,#f3d57b 50%,#b47a18 67%,#704207 88%,#3c2102 100%);border-top:2px solid rgba(255,228,125,.68);border-bottom:2px solid rgba(55,29,2,.78);border-left:1px solid rgba(255,226,123,.13);border-right:1px solid rgba(57,30,2,.28);box-shadow:inset 0 0 3px rgba(255,225,116,.18);backface-visibility:visible;-webkit-backface-visibility:visible;}
    .starting-coin-edge-segment:nth-child(3n){background:linear-gradient(180deg,#3f2202 0%,#744509 14%,#c08c2b 42%,#dfb957 52%,#8e5910 72%,#4a2903 100%)}
    .starting-coin-edge-segment:nth-child(4n){background:linear-gradient(180deg,#5b3405 0%,#a56d15 14%,#f0ca69 40%,#ffe39a 52%,#c98e24 72%,#704207 100%)}

    .starting-coin-face{position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:17px;box-sizing:border-box;overflow:hidden;text-align:center;font-weight:950;font-size:16px;line-height:1.05;color:#241b08;border:5px double #7d5c12;background:radial-gradient(circle at 33% 28%,#fff5b6 0,#e8c759 22%,#bd8c20 58%,#74510e 100%);box-shadow:inset 0 0 0 3px rgba(255,244,170,.35),inset -9px -10px 18px rgba(72,43,4,.33),0 0 22px rgba(213,170,52,.24);backface-visibility:visible;-webkit-backface-visibility:visible;will-change:opacity,visibility;}
    .starting-coin-face::before{content:'';position:absolute;inset:10px;border:1px dashed rgba(91,61,5,.42);border-radius:50%}.starting-coin-face::after{content:'';position:absolute;inset:17px;border:1px solid rgba(255,239,158,.22);border-radius:50%}
    .starting-coin-face span{position:relative;z-index:1;max-width:96px;word-break:break-word;text-shadow:0 1px rgba(255,246,190,.45)}
    .starting-coin-front{transform:translateZ(${COIN_THICKNESS_PX/2}px)}
    .starting-coin-back{transform:rotateX(180deg) translateZ(${COIN_THICKNESS_PX/2}px);background:radial-gradient(circle at 67% 72%,#fff5b6 0,#e8c759 22%,#bd8c20 58%,#74510e 100%)}
    .starting-coin-face.is-camera-hidden{opacity:0!important;visibility:hidden;}
    .starting-coin-face.is-camera-visible{opacity:1!important;visibility:visible;}

    .starting-coin-shadow{position:absolute;left:50%;bottom:24px;width:116px;height:22px;transform:translateX(-50%);border-radius:50%;background:rgba(0,0,0,.44);filter:blur(9px);opacity:.72;}
    .starting-coin-result{min-height:32px;font-size:21px;font-weight:900;color:#f6e6ae;opacity:0;transform:translateY(6px);transition:opacity .30s ease,transform .30s ease}.starting-coin-result.is-visible{opacity:1;transform:none}
    .starting-coin.has-landed .starting-coin-face.is-camera-visible{box-shadow:inset 0 0 0 3px rgba(255,244,170,.35),inset -9px -10px 18px rgba(72,43,4,.33),0 0 24px rgba(231,189,67,.30);}
    @media (prefers-reduced-motion:reduce){.starting-coin,.starting-coin-flight{animation:none!important;transition:none!important}}
  `;
  document.head.appendChild(style);
}

function safeName(name, fallback) {
  const clean = String(name || '').trim();
  return clean || fallback;
}

function buildEdgeSegments() {
  return Array.from({ length: COIN_EDGE_SEGMENTS }, (_, index) => {
    const angle = (360 / COIN_EDGE_SEGMENTS) * index;
    return `<i class="starting-coin-edge-segment" style="--coin-edge-angle:${angle.toFixed(3)}deg"></i>`;
  }).join('');
}

function normalizeDegrees(value) {
  const n = Number(value) || 0;
  return ((n % 360) + 360) % 360;
}

// Chrome puede aplanar un subtree 3D si el elemento transformado recibe filter/opacity de composición.
// Por eso .starting-coin NO lleva filter y ambas caras usan backface-visibility:visible. La única
// autoridad para decidir qué identidad se pinta es este culling manual por normal de cámara.
// No hay swapping de nombres ni "implantación" al final: ambas caras existen desde el primer frame.
function syncPhysicalFaceVisibility(frontFace, backFace, spinDegrees) {
  const angle = normalizeDegrees(spinDegrees);
  const facing = Math.cos(angle * Math.PI / 180);
  const nearEdge = Math.abs(facing) < 0.075;
  const frontVisible = !nearEdge && facing > 0;
  const backVisible = !nearEdge && facing < 0;
  frontFace?.classList.toggle('is-camera-visible', frontVisible);
  frontFace?.classList.toggle('is-camera-hidden', !frontVisible);
  backFace?.classList.toggle('is-camera-visible', backVisible);
  backFace?.classList.toggle('is-camera-hidden', !backVisible);
}

function bezierCoord(t, p1, p2) {
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}

function bezierDerivative(t, p1, p2) {
  const inv = 1 - t;
  return 3 * inv * inv * p1 + 6 * inv * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

// Equivalente numérico a cubic-bezier(.10,.72,.12,1), que era el timing aprobado visualmente.
function approvedSpinEase(progress) {
  const x = Math.max(0, Math.min(1, progress));
  let t = x;
  for (let i = 0; i < 5; i += 1) {
    const currentX = bezierCoord(t, .10, .12);
    const dx = bezierDerivative(t, .10, .12);
    if (Math.abs(dx) < 1e-5) break;
    t = Math.max(0, Math.min(1, t - ((currentX - x) / dx)));
  }
  return bezierCoord(t, .72, 1);
}

function animateCoinFlight({ coin, flight, shadow, frontFace, backFace, winnerSide, reduced }) {
  const duration = reduced ? 120 : COIN_SPIN_MS;
  const finalDegrees = COIN_TURNS * 360 + (winnerSide === 'rival' ? 180 : 0);

  if (reduced || typeof requestAnimationFrame !== 'function') {
    coin.style.transform = `rotateX(${finalDegrees}deg) rotateY(0deg) rotateZ(0deg)`;
    flight.style.transform = 'translateY(0)';
    syncPhysicalFaceVisibility(frontFace, backFace, finalDegrees);
    return { duration, finalDegrees };
  }

  const startedAt = performance.now();
  const frame = (now) => {
    const raw = Math.max(0, Math.min(1, (now - startedAt) / duration));
    const eased = approvedSpinEase(raw);
    const spinDegrees = finalDegrees * eased;
    // Giro principal de "coin toss" alrededor de X. Y/Z sólo aportan volumen y wobble,
    // pero se extinguen al aterrizar para que la cara ganadora quede perfectamente legible.
    const wobbleEnvelope = Math.sin(Math.PI * raw);
    const yaw = Math.sin(raw * Math.PI * 5) * 8 * wobbleEnvelope;
    const roll = Math.sin(raw * Math.PI * 3) * 3.5 * wobbleEnvelope;
    coin.style.transform = `rotateX(${spinDegrees}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)`;
    syncPhysicalFaceVisibility(frontFace, backFace, spinDegrees);

    const lift = -26 * Math.sin(Math.PI * raw);
    flight.style.transform = `translateY(${lift.toFixed(2)}px)`;
    const shadowScale = 1 - (0.28 * Math.sin(Math.PI * raw));
    const shadowOpacity = .72 - (.40 * Math.sin(Math.PI * raw));
    shadow.style.transform = `translateX(-50%) scale(${shadowScale.toFixed(3)})`;
    shadow.style.opacity = String(Math.max(.26, shadowOpacity));

    if (raw < 1) {
      requestAnimationFrame(frame);
      return;
    }

    coin.style.transform = `rotateX(${finalDegrees}deg) rotateY(0deg) rotateZ(0deg)`;
    flight.style.transform = 'translateY(0)';
    shadow.style.transform = 'translateX(-50%) scale(1)';
    shadow.style.opacity = '.72';
    syncPhysicalFaceVisibility(frontFace, backFace, finalDegrees);
  };
  requestAnimationFrame(frame);
  return { duration, finalDegrees };
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
            ${buildEdgeSegments()}
            <div class="starting-coin-face starting-coin-front is-camera-visible"><span></span></div>
            <div class="starting-coin-face starting-coin-back is-camera-hidden"><span></span></div>
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
    const frontFace = overlay.querySelector('.starting-coin-front');
    const backFace = overlay.querySelector('.starting-coin-back');
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    // EXACTAMENTE una reproducción por sorteo y justo antes del primer frame de animación.
    // El Audio Manager elige moneda.opus y deja moneda.mp3 como fallback; respeta SFX ON/OFF y volumen.
    playSfx('coinToss');
    const { duration } = animateCoinFlight({ coin, flight, shadow, frontFace, backFace, winnerSide, reduced });

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
