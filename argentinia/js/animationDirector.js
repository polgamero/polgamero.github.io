// js/animationDirector.js — Entrega 23.19.4.1 Combat Impact II + Admin Animation Studio.
// Capa VISUAL descartable: jamás muta state ni decide reglas. El engine captura geometría,
// confirma el resultado mecánico y encola una escena. Con animaciones OFF, Admin OFF o
// prefers-reduced-motion, todas las APIs se convierten en no-op seguro.

import { playSfx } from './audioManager.js';

export const ANIMATION_SETTINGS_STORAGE_KEY = 'argentinia.animations.v1';
export const ANIMATION_SPEEDS = Object.freeze(['slow', 'normal', 'fast']);
export const ANIMATION_SPEED_MULTIPLIERS = Object.freeze({ slow: 1.35, normal: 1, fast: 0.68 });

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, speed: 'normal' });
const SPEED_MIN = 0.25;
const SPEED_MAX = 3;
let localSettings = loadStoredSettings();
let serverPolicy = {
  enabled: true,
  speedMultipliers: { ...ANIMATION_SPEED_MULTIPLIERS },
  source: 'default',
  updatedAt: null
};
let animationSerial = 0;
let cancelSerial = 0;
let queueTail = Promise.resolve();
let queuedCount = 0;
let activeCount = 0;
let completedCount = 0;
let skippedCount = 0;
let cloneCount = 0;
let lastEvent = null;

function normalizeSpeed(value) {
  const speed = String(value || '').toLowerCase();
  return ANIMATION_SPEEDS.includes(speed) ? speed : DEFAULT_SETTINGS.speed;
}

function clampSpeedMultiplier(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(n * 100) / 100));
}

export function normalizeAnimationSpeedMultipliers(raw = {}) {
  const source = raw?.speedMultipliers && typeof raw.speedMultipliers === 'object'
    ? raw.speedMultipliers
    : raw;
  return {
    slow: clampSpeedMultiplier(source?.slow ?? source?.slowMultiplier, ANIMATION_SPEED_MULTIPLIERS.slow),
    normal: clampSpeedMultiplier(source?.normal ?? source?.normalMultiplier, ANIMATION_SPEED_MULTIPLIERS.normal),
    fast: clampSpeedMultiplier(source?.fast ?? source?.fastMultiplier, ANIMATION_SPEED_MULTIPLIERS.fast)
  };
}

export function normalizeAnimationSettings(raw = {}) {
  return {
    enabled: raw?.enabled !== false,
    speed: normalizeSpeed(raw?.speed)
  };
}

function loadStoredSettings() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(ANIMATION_SETTINGS_STORAGE_KEY);
    return raw ? normalizeAnimationSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(ANIMATION_SETTINGS_STORAGE_KEY, JSON.stringify(localSettings)); } catch {}
}

function emitSettingsChanged() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('argentinia:animation-settings-changed', { detail:getAnimationSettings() })); } catch {}
}

function prefersReducedMotion() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

export function getAnimationSettings() {
  return { ...localSettings };
}

export function setAnimationsEnabled(enabled) {
  localSettings = { ...localSettings, enabled: !!enabled };
  persistSettings();
  emitSettingsChanged();
  if (!localSettings.enabled) clearAnimationLayer('user_disabled');
  return localSettings.enabled;
}

export function setAnimationSpeed(speed) {
  localSettings = { ...localSettings, speed:normalizeSpeed(speed) };
  persistSettings();
  emitSettingsChanged();
  return localSettings.speed;
}

export function cycleAnimationSpeed() {
  const idx = ANIMATION_SPEEDS.indexOf(localSettings.speed);
  return setAnimationSpeed(ANIMATION_SPEEDS[(idx + 1) % ANIMATION_SPEEDS.length]);
}

export function animationSpeedLabel(speed = localSettings.speed) {
  return normalizeSpeed(speed) === 'slow' ? 'Lenta' : normalizeSpeed(speed) === 'fast' ? 'Rápida' : 'Normal';
}

export function applyServerAnimationPolicy(raw = {}, source = 'firestore') {
  serverPolicy = {
    enabled: raw?.enabled !== false,
    speedMultipliers: normalizeAnimationSpeedMultipliers(raw),
    source,
    updatedAt: raw?.updatedAt || null
  };
  if (!serverPolicy.enabled) clearAnimationLayer('server_disabled');
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('argentinia:animation-policy-changed', { detail:getServerAnimationPolicy() })); } catch {}
  }
  return getServerAnimationPolicy();
}

export function getServerAnimationPolicy() {
  return { ...serverPolicy, speedMultipliers:{ ...serverPolicy.speedMultipliers } };
}

export function getEffectiveAnimationSpeedMultipliers() {
  return { ...serverPolicy.speedMultipliers };
}

export function animationsEffectivelyEnabled({ force = false } = {}) {
  if (force) return typeof document !== 'undefined';
  return typeof document !== 'undefined'
    && localSettings.enabled
    && serverPolicy.enabled
    && !prefersReducedMotion();
}

export function animationDuration(baseMs, speedOverride = null) {
  const base = Math.max(0, Number(baseMs) || 0);
  const speed = normalizeSpeed(speedOverride || localSettings.speed);
  const multiplier = serverPolicy.speedMultipliers?.[speed] ?? ANIMATION_SPEED_MULTIPLIERS[speed];
  return Math.max(1, Math.round(base * multiplier));
}

function durationFor(payload, baseMs) {
  return animationDuration(baseMs, payload?.speedOverride || null);
}

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function injectAnimationStyles() {
  if (typeof document === 'undefined' || document.getElementById('arg-game-animation-styles')) return;
  const style = document.createElement('style');
  style.id = 'arg-game-animation-styles';
  style.textContent = `
    #arg-game-animation-layer{position:fixed;inset:0;pointer-events:none;z-index:7600;overflow:hidden;contain:layout style paint;}
    .arg-anim-clone{position:fixed!important;margin:0!important;pointer-events:none!important;z-index:2!important;transform-origin:center center!important;will-change:transform,opacity,filter;box-sizing:border-box!important;}
    .arg-anim-impact-ring{position:fixed;z-index:3;border:3px solid rgba(255,222,120,.92);border-radius:999px;pointer-events:none;box-shadow:0 0 18px rgba(255,155,55,.8),inset 0 0 14px rgba(255,255,255,.45);}
    .arg-anim-impact-ring.deathtouch{border-color:rgba(180,88,255,.95);box-shadow:0 0 22px rgba(130,45,230,.88),inset 0 0 14px rgba(220,175,255,.5);}
    .arg-anim-impact-ring.first-strike{border-color:rgba(255,247,182,.98);box-shadow:0 0 26px rgba(255,235,112,.92),inset 0 0 18px rgba(255,255,255,.75);}
    .arg-anim-dust{position:fixed;z-index:4;width:8px;height:8px;border-radius:50%;pointer-events:none;background:rgba(196,166,111,.72);box-shadow:0 0 7px rgba(224,194,136,.38);}
    .arg-anim-damage-number{position:fixed;z-index:5;color:#ff6b5f;font:900 25px/1 system-ui,sans-serif;text-shadow:0 2px 4px #000,0 0 10px rgba(255,40,40,.65);pointer-events:none;}
    .arg-anim-step-label{position:fixed;z-index:6;padding:5px 9px;border:1px solid rgba(255,232,133,.85);border-radius:999px;background:rgba(20,18,12,.88);color:#ffe883;font:900 10px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;box-shadow:0 0 12px rgba(255,207,63,.35);}
    .arg-anim-shield-burst{position:fixed;z-index:4;border:3px solid rgba(104,211,255,.94);border-radius:50%;pointer-events:none;box-shadow:0 0 24px rgba(70,185,255,.85),inset 0 0 18px rgba(170,235,255,.45);}
    .arg-anim-indestructible-burst{position:fixed;z-index:4;border:3px solid rgba(255,220,91,.96);border-radius:10px;pointer-events:none;box-shadow:0 0 26px rgba(255,188,40,.82),inset 0 0 18px rgba(255,247,180,.55);}
    .player-card.arg-player-hit,.arg-animation-lab-player.arg-player-hit{filter:brightness(1.22) saturate(1.25);box-shadow:0 0 0 2px rgba(255,70,60,.85),0 0 24px rgba(255,40,40,.75)!important;}

    .arg-animation-lab{width:100%;color:#e8eadf;}
    .arg-animation-lab-toolbar{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px;}
    .arg-animation-lab-control{display:flex;flex-direction:column;gap:5px;color:#bcaeca;font:700 11px/1.2 system-ui;}
    .arg-animation-lab-control select{min-width:150px;padding:8px 10px;border-radius:8px;border:1px solid rgba(212,175,55,.55);background:#0c1511;color:#f0d56a;font-weight:800;}
    .arg-animation-lab-speed-note{color:#9e91aa;font:11px/1.35 system-ui;min-width:190px;text-align:right;}
    .arg-animation-lab-board-shell{position:relative;width:100%;aspect-ratio:16/9;min-height:480px;max-height:76vh;border:2px solid rgba(212,175,55,.55);border-radius:14px;overflow:hidden;background:#0b130e url('./assets/images/ui/fondo.png') center/100% 100% no-repeat;box-shadow:0 18px 50px rgba(0,0,0,.45);}
    .arg-animation-lab-game{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) 19%;}
    .arg-animation-lab-board{position:relative;display:grid;grid-template-rows:7% 33.5% 33.5% 20%;gap:.8%;padding:1% 1.2%;min-width:0;}
    .arg-animation-lab-hand,.arg-animation-lab-field-half{position:relative;display:flex;align-items:center;justify-content:center;min-height:0;}
    .arg-animation-lab-field-half{flex-direction:column;gap:4%;}
    .arg-animation-lab-zone-row{position:relative;width:100%;display:flex;align-items:center;justify-content:center;gap:1.1%;min-height:0;flex:1;}
    .arg-animation-lab-support-row{flex:.8;opacity:.82;}
    .arg-animation-lab-combat-row{flex:1.3;}
    .arg-animation-lab-card{position:relative;width:clamp(54px,6.5vw,104px);aspect-ratio:5/7;border:2px solid #111;border-radius:7px;background:linear-gradient(145deg,#d8c690,#806d45);box-shadow:2px 4px 10px rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#111;font:900 clamp(7px,.66vw,11px)/1.15 system-ui;overflow:hidden;flex:none;}
    .arg-animation-lab-card.rival{background:linear-gradient(145deg,#7fb3d5,#28516d);color:#08141d;}
    .arg-animation-lab-card.local{background:linear-gradient(145deg,#80ba72,#315c31);color:#071207;}
    .arg-animation-lab-card.land{background:linear-gradient(145deg,#b58a62,#65442e);color:#fff2d6;}
    .arg-animation-lab-card.back{background:linear-gradient(145deg,#442f24,#17100d);color:#d4af37;border-color:#7d6531;}
    .arg-animation-lab-card small{display:block;margin-top:4px;font-size:.8em;font-weight:700;opacity:.72;}
    .arg-animation-lab-sidebar{position:relative;background:linear-gradient(180deg,rgba(9,17,12,.88),rgba(4,9,6,.94));border-left:1px solid rgba(212,175,55,.3);padding:2.2% 4%;display:flex;flex-direction:column;justify-content:space-between;gap:10px;}
    .arg-animation-lab-player{position:relative;border:1px solid rgba(212,175,55,.55);border-radius:10px;background:rgba(22,25,23,.96);padding:10px 8px;color:white;text-align:center;font:800 clamp(8px,.75vw,12px)/1.25 system-ui;box-shadow:0 4px 14px rgba(0,0,0,.45);}
    .arg-animation-lab-player .hp{display:block;color:#8fda91;margin-top:4px;}
    .arg-animation-lab-log{min-height:42%;border:1px solid rgba(212,175,55,.18);border-radius:8px;background:rgba(3,7,4,.68);padding:8px;color:#9dafa4;font:9px/1.35 ui-monospace,monospace;overflow:hidden;}
    .arg-animation-lab-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px;}
    .arg-animation-lab-actions button{padding:8px 11px;border-radius:8px;border:1px solid #d4af37;background:#202d26;color:#f4e5b9;font-weight:800;cursor:pointer;font-size:11px;}
    .arg-animation-lab-actions button:hover{box-shadow:0 0 14px rgba(212,175,55,.28);}
    .arg-animation-lab-status{margin-top:9px;text-align:center;color:#a99bb5;font:11px/1.35 system-ui;}
    @media(max-width:1000px){.arg-animation-lab-board-shell{min-height:390px}.arg-animation-lab-game{grid-template-columns:minmax(0,1fr) 22%}.arg-animation-lab-card{width:clamp(45px,7vw,78px)}}
  `;
  document.head.appendChild(style);
}

function ensureAnimationLayer() {
  if (typeof document === 'undefined') return null;
  injectAnimationStyles();
  let layer = document.getElementById('arg-game-animation-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'arg-game-animation-layer';
    layer.setAttribute('aria-hidden', 'true');
    (document.body || document.documentElement)?.appendChild(layer);
  }
  return layer;
}

function stripDuplicateIds(root) {
  try {
    root.removeAttribute?.('id');
    root.querySelectorAll?.('[id]').forEach(node => node.removeAttribute('id'));
  } catch {}
}

function freezeClone(snapshot) {
  if (!snapshot?.clone || !snapshot?.rect) return null;
  const layer = ensureAnimationLayer();
  if (!layer) return null;
  const clone = snapshot.clone.cloneNode(true);
  stripDuplicateIds(clone);
  clone.classList?.add('arg-anim-clone');
  clone.removeAttribute?.('data-tooltip');
  Object.assign(clone.style, {
    left:`${snapshot.rect.left}px`, top:`${snapshot.rect.top}px`,
    width:`${snapshot.rect.width}px`, height:`${snapshot.rect.height}px`,
    opacity:'1', transform:'translate3d(0,0,0) rotate(0deg)',
    transition:'none', animation:'none'
  });
  layer.appendChild(clone);
  cloneCount += 1;
  return clone;
}

function rectSnapshot(el) {
  if (!el?.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!Number.isFinite(r.left) || r.width <= 0 || r.height <= 0) return null;
  return { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
}

function findCardElement(item, sideHint = null) {
  if (typeof document === 'undefined' || !item) return null;
  const debugEl = item?.__debugElement;
  if (debugEl?.getBoundingClientRect) return debugEl;
  const syncId = item?._syncObjectId;
  if (syncId) {
    const bySync = document.querySelector(`[data-sync-object-id="${String(syncId).replace(/"/g,'\\"')}"]`);
    if (bySync) return bySync;
  }
  const cardId = item?.card?.id;
  if (!cardId) return null;
  const selector = sideHint ? `[data-card-id="${cardId}"][data-side="${sideHint}"]` : `[data-card-id="${cardId}"]`;
  return document.querySelector(selector);
}

export function captureCardVisual(item, sideHint = null, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force })) return null;
  const el = findCardElement(item, sideHint);
  const rect = rectSnapshot(el);
  if (!el || !rect || typeof el.cloneNode !== 'function') return null;
  return { kind:'card', clone:el.cloneNode(true), rect, syncObjectId:item?._syncObjectId || null, cardId:item?.card?.id || null, cardName:item?.card?.name || null };
}

export function capturePlayerVisual(isLocal, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || typeof document === 'undefined') return null;
  const el = document.querySelector(isLocal ? '.player-card.local-card' : '.player-card.rival-card');
  const rect = rectSnapshot(el);
  return el && rect ? { kind:'player', element:el, rect, isLocal:!!isLocal } : null;
}

function runWebAnimation(el, keyframes, options) {
  if (!el) return Promise.resolve();
  const duration = Math.max(1, Number(options?.duration) || 1);
  try {
    if (typeof el.animate === 'function') {
      const anim = el.animate(keyframes, { ...options, duration, fill:options?.fill || 'forwards' });
      return anim.finished.catch(() => {});
    }
  } catch {}
  const last = keyframes[keyframes.length - 1] || {};
  Object.assign(el.style, last);
  return sleepMs(duration);
}

function center(rect) { return { x:rect.left + rect.width/2, y:rect.top + rect.height/2 }; }
function vectorBetween(aRect,bRect) {
  const a=center(aRect), b=center(bRect); const dx=b.x-a.x, dy=b.y-a.y; const d=Math.max(1,Math.hypot(dx,dy));
  return { dx,dy,d,nx:dx/d,ny:dy/d,angle:(Math.atan2(dy,dx)*180/Math.PI)+90 };
}

function removeNode(node) { try { node?.remove?.(); } catch {} }

async function impactBurst(x, y, payload = {}, variant = 'normal') {
  const layer = ensureAnimationLayer(); if (!layer) return;
  const ring=document.createElement('div'); ring.className=`arg-anim-impact-ring ${variant === 'deathtouch' ? 'deathtouch' : variant === 'first_strike' ? 'first-strike' : ''}`;
  Object.assign(ring.style,{left:`${x-16}px`,top:`${y-16}px`,width:'32px',height:'32px'}); layer.appendChild(ring);
  for(let i=0;i<7;i+=1){
    const p=document.createElement('div'); p.className='arg-anim-dust';
    const background = variant === 'deathtouch'
      ? (i%2?'rgba(189,119,255,.86)':'rgba(93,38,145,.86)')
      : (i%2?'rgba(255,211,107,.78)':'rgba(235,118,63,.78)');
    Object.assign(p.style,{left:`${x-4}px`,top:`${y-4}px`,background}); layer.appendChild(p);
    const a=(Math.PI*2*i)/7; const dist=22+(i%3)*8;
    void runWebAnimation(p,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*dist}px,${Math.sin(a)*dist}px) scale(.2)`,opacity:0}],{duration:durationFor(payload,300),easing:'ease-out'}).then(()=>removeNode(p));
  }
  await runWebAnimation(ring,[{transform:'scale(.3)',opacity:.95},{transform:'scale(1.55)',opacity:0}],{duration:durationFor(payload,330),easing:'ease-out'});
  removeNode(ring);
}

async function shieldBurst(rect, payload = {}) {
  const layer=ensureAnimationLayer(); if(!layer||!rect)return;
  const el=document.createElement('div');el.className='arg-anim-shield-burst';
  Object.assign(el.style,{left:`${rect.left-5}px`,top:`${rect.top-5}px`,width:`${rect.width+10}px`,height:`${rect.height+10}px`});layer.appendChild(el);
  await runWebAnimation(el,[{transform:'scale(.84)',opacity:0},{transform:'scale(1.04)',opacity:1},{transform:'scale(1.32)',opacity:0}],{duration:durationFor(payload,420),easing:'ease-out'});removeNode(el);
}

async function indestructibleBurst(rect, payload = {}) {
  const layer=ensureAnimationLayer(); if(!layer||!rect)return;
  const el=document.createElement('div');el.className='arg-anim-indestructible-burst';
  Object.assign(el.style,{left:`${rect.left-4}px`,top:`${rect.top-4}px`,width:`${rect.width+8}px`,height:`${rect.height+8}px`});layer.appendChild(el);
  await runWebAnimation(el,[{transform:'scale(.94)',opacity:0},{transform:'scale(1.02)',opacity:1},{transform:'scale(1.08)',opacity:0}],{duration:durationFor(payload,430),easing:'ease-out'});removeNode(el);
}

function animationEventCancelled(payload) { return Number(payload?.__cancelSerial) !== cancelSerial; }

function addStepLabel(snapshot, payload) {
  if (!snapshot?.rect || !payload?.stepKind || typeof document === 'undefined') return null;
  if (payload.stepKind !== 'first_strike' && !payload.doubleStrikePass) return null;
  const label=document.createElement('div');label.className='arg-anim-step-label';
  label.textContent=payload.stepKind==='first_strike' ? 'INICIATIVA' : 'DOBLE GOLPE';
  Object.assign(label.style,{left:`${snapshot.rect.left}px`,top:`${Math.max(4,snapshot.rect.top-24)}px`});ensureAnimationLayer()?.appendChild(label);
  return label;
}

async function fadeCombatClone(node, died, transform, payload) {
  if (!node) return;
  if (died) {
    await runWebAnimation(node,[
      {opacity:1,filter:'brightness(1)'},
      {opacity:.52,filter:'brightness(1.45) blur(1px)'},
      {opacity:0,filter:'brightness(.55) blur(7px)',transform:`${transform || ''} scale(.84)`}
    ],{duration:durationFor(payload,380),easing:'ease-in'});
  } else {
    await runWebAnimation(node,[{opacity:1},{opacity:0}],{duration:durationFor(payload,125),easing:'ease-out'});
  }
}

async function animateCombatImpact(payload) {
  const aSnap=payload?.attackerSnapshot, dSnap=payload?.defenderSnapshot;
  if(!aSnap||!dSnap) return false;
  return animateCombatSequence({
    ...payload,
    defenders:[{
      snapshot:dSnap,
      died:!!payload.defenderDied,
      shieldConsumed:!!payload.shieldConsumed,
      indestructibleSurvived:!!payload.indestructibleSurvived,
      deathtouchHit:!!payload.deathtouchHit
    }]
  });
}

async function animateCombatSequence(payload) {
  const aSnap=payload?.attackerSnapshot;
  const defenders=(Array.isArray(payload?.defenders)?payload.defenders:[]).filter(entry=>entry?.snapshot?.rect);
  const playerSnap=payload?.playerSnapshot?.rect ? payload.playerSnapshot : null;
  if(!aSnap || (!defenders.length && !playerSnap)) return false;
  const attacker=freezeClone(aSnap); if(!attacker)return false;
  const defenderClones=defenders.map(entry=>({entry,node:freezeClone(entry.snapshot),fadeStarted:false}));
  const stepLabel=addStepLabel(aSnap,payload);
  let currentTransform='translate3d(0,0,0) rotate(0deg) scale(1)';
  const recoilBase=payload?.stepKind==='first_strike'?18:24;
  const legBase=payload?.stepKind==='first_strike'?470:560;

  for (let i=0;i<defenderClones.length;i+=1) {
    const defenderVisual=defenderClones[i]; const {entry,node}=defenderVisual; if(!node)continue;
    const v=vectorBetween(aSnap.rect,entry.snapshot.rect);
    const stop=Math.max(20,v.d-Math.max(24,(aSnap.rect.height+entry.snapshot.rect.height)*.24));
    const hitX=v.nx*stop,hitY=v.ny*stop;
    const recoil=`translate3d(${-v.nx*recoilBase}px,${-v.ny*recoilBase}px,0) rotate(${v.angle*.18}deg) scale(.98)`;
    const aim=`translate3d(${-v.nx*8}px,${-v.ny*8}px,0) rotate(${v.angle}deg) scale(1)`;
    const hit=`translate3d(${hitX}px,${hitY}px,0) rotate(${v.angle}deg) scale(1.055)`;
    const move=runWebAnimation(attacker,[
      {transform:currentTransform,offset:0},
      {transform:recoil,offset:.26},
      {transform:aim,offset:.48},
      {transform:hit,offset:1}
    ],{duration:durationFor(payload,legBase),easing:'cubic-bezier(.2,.78,.18,1)'});
    await sleepMs(durationFor(payload,Math.round(legBase*.83)));
    if(animationEventCancelled(payload)){removeNode(attacker);defenderClones.forEach(x=>removeNode(x.node));removeNode(stepLabel);return false;}
    playSfx('cardImpact');
    const impact=center(entry.snapshot.rect);
    const variant=entry.deathtouchHit?'deathtouch':payload?.stepKind==='first_strike'?'first_strike':'normal';
    void impactBurst(impact.x,impact.y,payload,variant);
    void runWebAnimation(node,[{transform:'translate3d(0,0,0)'},{transform:`translate3d(${v.nx*9}px,${v.ny*9}px,0) rotate(${v.angle*.05}deg)`},{transform:'translate3d(0,0,0)'}],{duration:durationFor(payload,210),easing:'ease-out'});
    if(entry.shieldConsumed) void shieldBurst(entry.snapshot.rect,payload);
    if(entry.indestructibleSurvived) void indestructibleBurst(entry.snapshot.rect,payload);
    await move;
    currentTransform=`translate3d(${hitX-v.nx*12}px,${hitY-v.ny*12}px,0) rotate(${v.angle}deg) scale(1)`;
    if(entry.died){defenderVisual.fadeStarted=true;void fadeCombatClone(node,true,'',payload).then(()=>removeNode(node));} else if(i < defenderClones.length-1 || playerSnap) void runWebAnimation(node,[{opacity:1},{opacity:.35}],{duration:durationFor(payload,110)});
    if(i < defenderClones.length-1 || playerSnap) await sleepMs(durationFor(payload,95));
  }

  if(playerSnap && Number(payload?.playerDamage)>0) {
    const v=vectorBetween(aSnap.rect,playerSnap.rect);
    const stop=Math.max(20,v.d-Math.max(42,playerSnap.rect.width*.32));
    const hitX=v.nx*stop,hitY=v.ny*stop;
    const recoil=`translate3d(${-v.nx*20}px,${-v.ny*20}px,0) rotate(${v.angle*.18}deg) scale(.98)`;
    const hit=`translate3d(${hitX}px,${hitY}px,0) rotate(${v.angle}deg) scale(1.04)`;
    const move=runWebAnimation(attacker,[{transform:currentTransform},{transform:recoil},{transform:hit}],{duration:durationFor(payload,520),easing:'cubic-bezier(.2,.78,.2,1)'});
    await sleepMs(durationFor(payload,435));
    if(!animationEventCancelled(payload)) {
      playSfx('playerImpact');
      const impact=center(playerSnap.rect);void impactBurst(impact.x,impact.y,payload,payload?.stepKind==='first_strike'?'first_strike':'normal');
      const playerEl=playerSnap.element;
      try{playerEl?.classList?.add('arg-player-hit');}catch{}
      const damage=document.createElement('div');damage.className='arg-anim-damage-number';damage.textContent=`-${Math.max(0,Number(payload.playerDamage)||0)}`;
      Object.assign(damage.style,{left:`${impact.x+18}px`,top:`${impact.y-12}px`});ensureAnimationLayer()?.appendChild(damage);
      void runWebAnimation(damage,[{transform:'translateY(8px) scale(.8)',opacity:0},{transform:'translateY(0) scale(1.08)',opacity:1},{transform:'translateY(-28px) scale(1)',opacity:0}],{duration:durationFor(payload,650),easing:'ease-out'}).then(()=>removeNode(damage));
      try{if(playerEl?.animate)playerEl.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:durationFor(payload,230),easing:'ease-out'});}catch{}
      setTimeout(()=>{try{playerEl?.classList?.remove('arg-player-hit');}catch{}},durationFor(payload,420));
    }
    await move; currentTransform=hit;
  }

  const cleanup=[];
  defenderClones.forEach(({entry,node,fadeStarted})=>{if(node?.isConnected&&!fadeStarted)cleanup.push(fadeCombatClone(node,!!entry.died,'',payload));});
  cleanup.push(fadeCombatClone(attacker,!!payload?.attackerDied,currentTransform,payload));
  await Promise.all(cleanup);
  removeNode(attacker);defenderClones.forEach(x=>removeNode(x.node));removeNode(stepLabel);return true;
}

async function animatePlayerImpact(payload) {
  const aSnap=payload?.attackerSnapshot, pSnap=payload?.playerSnapshot;
  if(!aSnap||!pSnap) return false;
  const attacker=freezeClone(aSnap); if(!attacker) return false;
  const v=vectorBetween(aSnap.rect,pSnap.rect); const recoil=22; const stop=Math.max(20,v.d - Math.max(42,pSnap.rect.width*.32));
  const hitX=v.nx*stop, hitY=v.ny*stop; const impact=center(pSnap.rect);
  const move=runWebAnimation(attacker,[
    {transform:'translate3d(0,0,0) rotate(0deg)'},
    {transform:`translate3d(${-v.nx*recoil}px,${-v.ny*recoil}px,0) rotate(${v.angle*.2}deg)`},
    {transform:`translate3d(${hitX}px,${hitY}px,0) rotate(${v.angle}deg) scale(1.04)`}
  ],{duration:durationFor(payload,560),easing:'cubic-bezier(.2,.78,.2,1)'});
  await sleepMs(durationFor(payload,475));
  if (animationEventCancelled(payload)) { removeNode(attacker); return false; }
  playSfx('playerImpact'); void impactBurst(impact.x,impact.y,payload,payload?.stepKind==='first_strike'?'first_strike':'normal');
  const playerEl=pSnap.element;
  try { playerEl?.classList?.add('arg-player-hit'); } catch {}
  const damage=document.createElement('div'); damage.className='arg-anim-damage-number'; damage.textContent=`-${Math.max(0,Number(payload?.amount)||0)}`;
  Object.assign(damage.style,{left:`${impact.x+18}px`,top:`${impact.y-12}px`}); ensureAnimationLayer()?.appendChild(damage);
  void runWebAnimation(damage,[{transform:'translateY(8px) scale(.8)',opacity:0},{transform:'translateY(0) scale(1.08)',opacity:1},{transform:'translateY(-28px) scale(1)',opacity:0}],{duration:durationFor(payload,650),easing:'ease-out'}).then(()=>removeNode(damage));
  try {
    if(playerEl?.animate) playerEl.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:durationFor(payload,230),easing:'ease-out'});
  } catch {}
  setTimeout(()=>{ try{playerEl?.classList?.remove('arg-player-hit');}catch{} },durationFor(payload,420));
  await move; await runWebAnimation(attacker,[{opacity:1},{opacity:0}],{duration:durationFor(payload,130)}); removeNode(attacker); return true;
}

async function animateLandTap(payload) {
  const snap=payload?.snapshot; if(!snap) return false;
  const card=freezeClone(snap); if(!card) return false;
  const r=snap.rect; const dustOrigin={x:r.left+r.width*.52,y:r.top+r.height*.82};
  const layer=ensureAnimationLayer();
  for(let i=0;i<8;i+=1){
    const p=document.createElement('div'); p.className='arg-anim-dust';
    Object.assign(p.style,{left:`${dustOrigin.x+(i-4)*3}px`,top:`${dustOrigin.y}px`,width:`${5+(i%3)*2}px`,height:`${5+(i%3)*2}px`}); layer?.appendChild(p);
    const dx=(i-3.5)*7,dy=-12-(i%4)*5;
    void runWebAnimation(p,[{transform:'translate(0,0) scale(.7)',opacity:0},{transform:`translate(${dx*.3}px,${dy*.35}px) scale(1)`,opacity:.75},{transform:`translate(${dx}px,${dy}px) scale(1.5)`,opacity:0}],{duration:durationFor(payload,520),easing:'ease-out'}).then(()=>removeNode(p));
  }
  const anim=runWebAnimation(card,[
    {transform:'rotate(0deg) translateX(0)',filter:'brightness(1)'},
    {transform:'rotate(-4deg) translateX(-2px)',filter:'brightness(.96)'},
    {transform:'rotate(42deg) translateX(1px)',filter:'brightness(1.04)'},
    {transform:'rotate(94deg) translateX(0)',filter:'brightness(1.08)'},
    {transform:'rotate(90deg)',filter:'brightness(1)',opacity:1}
  ],{duration:durationFor(payload,470),easing:'cubic-bezier(.28,.72,.18,1)'});
  await sleepMs(durationFor(payload,215));
  if (animationEventCancelled(payload)) { removeNode(card); return false; }
  playSfx('landTap'); await anim;
  await runWebAnimation(card,[{opacity:1},{opacity:0}],{duration:durationFor(payload,100)}); removeNode(card); return true;
}

function enqueue(type, payload, runner, { force = false, speedOverride = null } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || !payload) { skippedCount += 1; return Promise.resolve(false); }
  const serial=++animationSerial; queuedCount += 1; lastEvent={serial,type,queuedAt:Date.now(),speedOverride:speedOverride||null};
  const queuedPayload = { ...payload, speedOverride: speedOverride || payload?.speedOverride || null, __cancelSerial:cancelSerial };
  const task=async()=>{
    if(!animationsEffectivelyEnabled({ force }) || animationEventCancelled(queuedPayload)){skippedCount+=1;return false;}
    activeCount+=1;
    try { return await runner(queuedPayload); }
    catch(err){ console.warn(`[AnimationDirector] ${type} falló sin afectar gameplay:`,err); return false; }
    finally { activeCount=Math.max(0,activeCount-1); completedCount+=1; }
  };
  queueTail=queueTail.then(task,task); return queueTail;
}

export function queueCombatImpactAnimation(payload, options) { return enqueue('combat_card_impact',payload,animateCombatImpact,options); }
export function queueCombatSequenceAnimation(payload, options) { return enqueue('combat_sequence',payload,animateCombatSequence,options); }
export function queuePlayerDamageAnimation(payload, options) { return enqueue('combat_player_impact',payload,animatePlayerImpact,options); }
export function queueLandTapAnimation(payload, options) { return enqueue('land_tap',payload,animateLandTap,options); }

export function clearAnimationLayer(reason = 'manual') {
  cancelSerial += 1;
  if (typeof document !== 'undefined') removeNode(document.getElementById('arg-game-animation-layer'));
  lastEvent = lastEvent ? { ...lastEvent, clearedReason:reason } : null;
}

export function getAnimationRuntimeStatus() {
  const layer = typeof document !== 'undefined' ? document.getElementById('arg-game-animation-layer') : null;
  return {
    effectiveEnabled:animationsEffectivelyEnabled(), local:getAnimationSettings(), server:getServerAnimationPolicy(), reducedMotion:prefersReducedMotion(),
    queuedCount, activeCount, completedCount, skippedCount, cloneCount, ghostNodes:layer?.children?.length || 0, lastEvent
  };
}

function labCapture(el) {
  const rect=rectSnapshot(el);return rect?{kind:'card',clone:el.cloneNode(true),rect,cardName:el.textContent}:null;
}
function labPlayerSnapshot(el,isLocal=false) {
  const rect=rectSnapshot(el);return rect?{kind:'player',element:el,rect,isLocal}:null;
}

function animationLabMarkup() {
  return `
    <div class="arg-animation-lab">
      <div class="arg-animation-lab-toolbar">
        <label class="arg-animation-lab-control">Velocidad del playtest
          <select data-animation-lab-speed>
            <option value="slow">Lenta</option>
            <option value="normal" selected>Normal</option>
            <option value="fast">Rápida</option>
          </select>
        </label>
        <div class="arg-animation-lab-speed-note" data-animation-lab-speed-note></div>
      </div>
      <div class="arg-animation-lab-board-shell">
        <div class="arg-animation-lab-game">
          <div class="arg-animation-lab-board">
            <div class="arg-animation-lab-hand">
              <div class="arg-animation-lab-card back">DORSO</div><div class="arg-animation-lab-card back">DORSO</div><div class="arg-animation-lab-card back">DORSO</div>
            </div>
            <div class="arg-animation-lab-field-half">
              <div class="arg-animation-lab-zone-row arg-animation-lab-support-row">
                <div class="arg-animation-lab-card land rival" data-lab-card="rival-land">TIERRA RIVAL<small>Isla</small></div>
                <div class="arg-animation-lab-card rival">SOPORTE<small>Artefacto</small></div>
              </div>
              <div class="arg-animation-lab-zone-row arg-animation-lab-combat-row">
                <div class="arg-animation-lab-card rival" data-lab-card="defender-1">DEFENSOR A<small>2/2</small></div>
                <div class="arg-animation-lab-card rival" data-lab-card="defender-2">DEFENSOR B<small>3/3</small></div>
                <div class="arg-animation-lab-card rival" data-lab-card="defender-3">DEFENSOR C<small>1/1</small></div>
              </div>
            </div>
            <div class="arg-animation-lab-field-half">
              <div class="arg-animation-lab-zone-row arg-animation-lab-combat-row">
                <div class="arg-animation-lab-card local" data-lab-card="attacker">ATACANTE<small>6/6</small></div>
                <div class="arg-animation-lab-card local">ALIADO<small>2/3</small></div>
              </div>
              <div class="arg-animation-lab-zone-row arg-animation-lab-support-row">
                <div class="arg-animation-lab-card land local" data-lab-card="local-land">TIERRA<small>Bosque</small></div>
                <div class="arg-animation-lab-card land local">TIERRA<small>Planicie</small></div>
              </div>
            </div>
            <div class="arg-animation-lab-hand">
              <div class="arg-animation-lab-card local">MANO</div><div class="arg-animation-lab-card local">MANO</div><div class="arg-animation-lab-card local">MANO</div>
            </div>
          </div>
          <div class="arg-animation-lab-sidebar">
            <div class="arg-animation-lab-player" data-lab-player="rival">🤠 TANO DUMMY<span class="hp">20 / 20 HP</span></div>
            <div class="arg-animation-lab-log" data-animation-lab-log>Animation Studio 23.19.4.1\nEl tablero es un dummy geométrico del board real.\nLos tests no tocan state ni Firestore.</div>
            <div class="arg-animation-lab-player" data-lab-player="local">🧉 VOS DUMMY<span class="hp">20 / 20 HP</span></div>
          </div>
        </div>
      </div>
      <div class="arg-animation-lab-actions">
        <button data-test="land">Tierra</button>
        <button data-test="clash">1 vs 1</button>
        <button data-test="multi">Multi ×3</button>
        <button data-test="trample">Arrollar</button>
        <button data-test="first">Iniciativa</button>
        <button data-test="double">Doble golpe</button>
        <button data-test="shield">Escudo</button>
        <button data-test="deathtouch">Toque mortal</button>
        <button data-test="indestructible">Indestructible</button>
        <button data-test="player">Daño jugador</button>
        <button data-test="all">Secuencia completa</button>
        <button data-test="clear">Limpiar</button>
      </div>
      <div class="arg-animation-lab-status" data-animation-lab-status></div>
    </div>`;
}

export function mountAnimationLab(root) {
  if (typeof document === 'undefined' || !root) return () => {};
  injectAnimationStyles();
  clearAnimationLayer('animation_lab_mount');
  const labLayer=ensureAnimationLayer();
  if(labLayer)labLayer.style.zIndex='31010';
  root.innerHTML=animationLabMarkup();
  const speedSelect=root.querySelector('[data-animation-lab-speed]');
  const speedNote=root.querySelector('[data-animation-lab-speed-note]');
  const status=root.querySelector('[data-animation-lab-status]');
  const log=root.querySelector('[data-animation-lab-log]');
  const attacker=()=>labCapture(root.querySelector('[data-lab-card="attacker"]'));
  const def=(n)=>labCapture(root.querySelector(`[data-lab-card="defender-${n}"]`));
  const player=()=>labPlayerSnapshot(root.querySelector('[data-lab-player="rival"]'),false);
  const land=()=>labCapture(root.querySelector('[data-lab-card="local-land"]'));
  const speed=()=>normalizeSpeed(speedSelect?.value || 'normal');
  const options=()=>({force:true,speedOverride:speed()});
  const updateSpeedNote=()=>{
    const refs=getEffectiveAnimationSpeedMultipliers();
    if(speedNote)speedNote.textContent=`Referencia servidor: Lenta ×${refs.slow.toFixed(2)} · Normal ×${refs.normal.toFixed(2)} · Rápida ×${refs.fast.toFixed(2)}. Test actual: ${animationSpeedLabel(speed())}.`;
  };
  const updateStatus=(message='')=>{
    const runtime=getAnimationRuntimeStatus();
    if(status)status.textContent=`${message}${message?' · ':''}cola ${runtime.activeCount}/${runtime.queuedCount} · completadas ${runtime.completedCount} · ghosts ${runtime.ghostNodes}`;
  };
  const note=(text)=>{if(log)log.textContent=`${text}\n\n${log.textContent.split('\n').slice(0,7).join('\n')}`;updateStatus(text);};
  const seq=(payload)=>queueCombatSequenceAnimation(payload,options());
  const scenarios={
    land:async()=>{note('Tierra: resistencia + giro + polvo.');await queueLandTapAnimation({snapshot:land()},options());},
    clash:async()=>{note('1 vs 1: choque clásico; defensor muere.');await queueCombatImpactAnimation({attackerSnapshot:attacker(),defenderSnapshot:def(2),defenderDied:true,attackerDied:false},options());},
    multi:async()=>{note('Multi ×3: el atacante recorre el orden de bloqueadores.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(1),died:true},{snapshot:def(2),died:false},{snapshot:def(3),died:true}],attackerDied:false,stepKind:'regular'});},
    trample:async()=>{note('Arrollar: bloqueadores y luego badge rival.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(1),died:true},{snapshot:def(3),died:true}],playerSnapshot:player(),playerDamage:3,attackerDied:false,stepKind:'regular'});},
    first:async()=>{note('Iniciativa: pase visual acelerado y etiqueta.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:true}],attackerDied:false,stepKind:'first_strike'});},
    double:async()=>{note('Doble golpe: iniciativa y segundo impacto regular.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:false}],attackerDied:false,stepKind:'first_strike'});await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:true}],attackerDied:false,stepKind:'regular',doubleStrikePass:true});},
    shield:async()=>{note('Escudo: absorbe el impacto y no desvanece la criatura.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:false,shieldConsumed:true}],attackerDied:false,stepKind:'regular'});},
    deathtouch:async()=>{note('Toque mortal: impacto violeta y muerte con 1+ daño.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:true,deathtouchHit:true}],attackerDied:false,stepKind:'regular'});},
    indestructible:async()=>{note('Indestructible: impacto letal visual, destello dorado, sin fade.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:false,indestructibleSurvived:true}],attackerDied:false,stepKind:'regular'});},
    player:async()=>{note('Daño directo: embestida al badge y -5.');await queuePlayerDamageAnimation({attackerSnapshot:attacker(),playerSnapshot:player(),amount:5},options());}
  };
  scenarios.all=async()=>{for(const key of ['land','clash','multi','trample','first','double','shield','deathtouch','indestructible','player'])await scenarios[key]();};
  const onClick=async(event)=>{
    const btn=event.target.closest?.('button[data-test]');if(!btn)return;
    const kind=btn.dataset.test;
    if(kind==='clear'){clearAnimationLayer('animation_lab_clear');note('Capa visual limpiada.');return;}
    const fn=scenarios[kind];if(!fn)return;
    btn.disabled=true;try{await fn();}finally{btn.disabled=false;updateStatus();}
  };
  root.addEventListener('click',onClick);
  speedSelect?.addEventListener('change',updateSpeedNote);
  updateSpeedNote();updateStatus('Lab listo');
  return ()=>{root.removeEventListener('click',onClick);clearAnimationLayer('animation_lab_unmount');};
}

// Compatibilidad para el botón/labs históricos: ahora abre el mismo Studio completo en overlay.
export async function runAnimationDebugShowcase() {
  if (typeof document === 'undefined') return false;
  injectAnimationStyles();
  document.getElementById('arg-animation-debug-overlay')?.remove();
  const overlay=document.createElement('div');overlay.id='arg-animation-debug-overlay';
  Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'30000',background:'rgba(4,7,8,.94)',padding:'18px',overflow:'auto'});
  overlay.innerHTML='<div style="max-width:1500px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font:900 20px system-ui;color:#f0cf64">🎬 Animation Studio 23.19.4.1</div><button data-overlay-close style="padding:8px 14px;border-radius:8px;border:1px solid #d4af37;background:#202d26;color:#f4e5b9;font-weight:800">Cerrar</button></div><div data-overlay-lab></div></div>';
  document.body.appendChild(overlay);
  const cleanup=mountAnimationLab(overlay.querySelector('[data-overlay-lab]'));
  overlay.querySelector('[data-overlay-close]')?.addEventListener('click',()=>{cleanup();overlay.remove();});
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide',()=>clearAnimationLayer('pagehide'));
  window.addEventListener('beforeunload',()=>clearAnimationLayer('beforeunload'));
}
