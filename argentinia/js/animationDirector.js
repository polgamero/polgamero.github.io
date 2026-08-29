// js/animationDirector.js — Entrega 23.19.4 Animation Foundation + Combat Impact I.
// Capa VISUAL descartable: jamás muta state ni decide reglas. El engine captura geometría,
// confirma el resultado mecánico y encola una escena. Con animaciones OFF, Admin OFF o
// prefers-reduced-motion, todas las APIs se convierten en no-op seguro.

import { playSfx } from './audioManager.js';

export const ANIMATION_SETTINGS_STORAGE_KEY = 'argentinia.animations.v1';
export const ANIMATION_SPEEDS = Object.freeze(['slow', 'normal', 'fast']);
export const ANIMATION_SPEED_MULTIPLIERS = Object.freeze({ slow: 1.35, normal: 1, fast: 0.68 });

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, speed: 'normal' });
let localSettings = loadStoredSettings();
let serverPolicy = { enabled: true, source: 'default', updatedAt: null };
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
  return { ...serverPolicy };
}

export function animationsEffectivelyEnabled({ force = false } = {}) {
  if (force) return typeof document !== 'undefined';
  return typeof document !== 'undefined'
    && localSettings.enabled
    && serverPolicy.enabled
    && !prefersReducedMotion();
}

export function animationDuration(baseMs) {
  const base = Math.max(0, Number(baseMs) || 0);
  return Math.max(1, Math.round(base * ANIMATION_SPEED_MULTIPLIERS[localSettings.speed]));
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
    .arg-anim-dust{position:fixed;z-index:4;width:8px;height:8px;border-radius:50%;pointer-events:none;background:rgba(196,166,111,.72);box-shadow:0 0 7px rgba(224,194,136,.38);}
    .arg-anim-damage-number{position:fixed;z-index:5;color:#ff6b5f;font:900 25px/1 system-ui,sans-serif;text-shadow:0 2px 4px #000,0 0 10px rgba(255,40,40,.65);pointer-events:none;}
    .player-card.arg-player-hit{filter:brightness(1.22) saturate(1.25);box-shadow:0 0 0 2px rgba(255,70,60,.85),0 0 24px rgba(255,40,40,.75)!important;}
    #arg-animation-debug-overlay{position:fixed;inset:0;z-index:30000;background:rgba(4,7,8,.92);display:flex;align-items:center;justify-content:center;padding:24px;}
    .arg-animation-debug-panel{width:min(900px,94vw);border:2px solid #d4af37;border-radius:16px;background:#111a16;padding:18px;color:#e8eadf;box-shadow:0 25px 70px rgba(0,0,0,.6);}
    .arg-animation-debug-stage{position:relative;height:390px;border:1px solid rgba(212,175,55,.35);border-radius:12px;background:radial-gradient(circle at center,#20382f,#0c1511);overflow:hidden;margin:14px 0;}
    .arg-animation-debug-card{position:absolute;width:126px;height:176px;border:3px solid #d4af37;border-radius:10px;background:linear-gradient(145deg,#304b42,#15261f);display:grid;place-items:center;text-align:center;font:800 14px/1.2 system-ui;color:#f3e8c0;box-shadow:0 8px 18px rgba(0,0,0,.5);}
    .arg-animation-debug-player{position:absolute;right:28px;top:150px;width:150px;padding:14px;border:2px solid #8d6d24;border-radius:12px;background:#181a1b;color:#fff;font:800 14px system-ui;text-align:center;}
    .arg-animation-debug-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.arg-animation-debug-actions button{padding:9px 14px;border-radius:9px;border:1px solid #d4af37;background:#2a332e;color:#f4e5b9;font-weight:800;cursor:pointer;}
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

async function impactBurst(x, y) {
  const layer = ensureAnimationLayer(); if (!layer) return;
  const ring=document.createElement('div'); ring.className='arg-anim-impact-ring';
  Object.assign(ring.style,{left:`${x-16}px`,top:`${y-16}px`,width:'32px',height:'32px'}); layer.appendChild(ring);
  const particles=[];
  for(let i=0;i<7;i+=1){
    const p=document.createElement('div'); p.className='arg-anim-dust';
    Object.assign(p.style,{left:`${x-4}px`,top:`${y-4}px`,background:i%2?'rgba(255,211,107,.78)':'rgba(235,118,63,.78)'}); layer.appendChild(p); particles.push(p);
    const a=(Math.PI*2*i)/7; const dist=22+(i%3)*8;
    void runWebAnimation(p,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*dist}px,${Math.sin(a)*dist}px) scale(.2)`,opacity:0}],{duration:animationDuration(300),easing:'ease-out'}).then(()=>removeNode(p));
  }
  await runWebAnimation(ring,[{transform:'scale(.3)',opacity:.95},{transform:'scale(1.55)',opacity:0}],{duration:animationDuration(330),easing:'ease-out'});
  removeNode(ring);
}

function animationEventCancelled(payload) { return Number(payload?.__cancelSerial) !== cancelSerial; }

async function animateCombatImpact(payload) {
  const aSnap=payload?.attackerSnapshot, dSnap=payload?.defenderSnapshot;
  if(!aSnap||!dSnap) return false;
  const attacker=freezeClone(aSnap), defender=freezeClone(dSnap); if(!attacker||!defender){removeNode(attacker);removeNode(defender);return false;}
  const v=vectorBetween(aSnap.rect,dSnap.rect);
  const recoil=24; const stop=Math.max(20,v.d - Math.max(24,(aSnap.rect.height+dSnap.rect.height)*0.24));
  const hitX=v.nx*stop, hitY=v.ny*stop;
  const impact=center(dSnap.rect);
  const movePromise=runWebAnimation(attacker,[
    {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',offset:0},
    {transform:`translate3d(${-v.nx*recoil}px,${-v.ny*recoil}px,0) rotate(${v.angle*.18}deg) scale(.98)`,offset:.22},
    {transform:`translate3d(${-v.nx*10}px,${-v.ny*10}px,0) rotate(${v.angle}deg) scale(1)`,offset:.42},
    {transform:`translate3d(${hitX}px,${hitY}px,0) rotate(${v.angle}deg) scale(1.055)`,offset:.78},
    {transform:`translate3d(${hitX-v.nx*12}px,${hitY-v.ny*12}px,0) rotate(${v.angle}deg) scale(1)`,offset:1}
  ],{duration:animationDuration(620),easing:'cubic-bezier(.2,.75,.18,1)'});
  const waitToHit=sleepMs(animationDuration(465));
  await waitToHit;
  if (animationEventCancelled(payload)) { removeNode(attacker); removeNode(defender); return false; }
  playSfx('cardImpact');
  void impactBurst(impact.x,impact.y);
  void runWebAnimation(defender,[{transform:'translate3d(0,0,0) rotate(0deg)'},{transform:`translate3d(${v.nx*8}px,${v.ny*8}px,0) rotate(${v.angle*.04}deg)`},{transform:'translate3d(0,0,0) rotate(0deg)'}],{duration:animationDuration(210),easing:'ease-out'});
  await movePromise;
  const fades=[];
  if(payload.defenderDied) fades.push(runWebAnimation(defender,[{opacity:1,filter:'brightness(1)'},{opacity:.5,filter:'brightness(1.5) blur(1px)'},{opacity:0,filter:'brightness(.55) blur(7px)',transform:'scale(.84)'}],{duration:animationDuration(380),easing:'ease-in'}));
  else fades.push(runWebAnimation(defender,[{opacity:1},{opacity:0}],{duration:animationDuration(120)}));
  if(payload.attackerDied) fades.push(runWebAnimation(attacker,[{opacity:1},{opacity:.45,filter:'blur(2px)'},{opacity:0,filter:'blur(7px)',transform:`translate3d(${hitX-v.nx*12}px,${hitY-v.ny*12}px,0) rotate(${v.angle}deg) scale(.82)`}],{duration:animationDuration(380),easing:'ease-in'}));
  else fades.push(runWebAnimation(attacker,[{opacity:1},{opacity:0}],{duration:animationDuration(150)}));
  await Promise.all(fades); removeNode(attacker); removeNode(defender); return true;
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
  ],{duration:animationDuration(560),easing:'cubic-bezier(.2,.78,.2,1)'});
  await sleepMs(animationDuration(475));
  if (animationEventCancelled(payload)) { removeNode(attacker); return false; }
  playSfx('playerImpact'); void impactBurst(impact.x,impact.y);
  const playerEl=pSnap.element;
  try { playerEl?.classList?.add('arg-player-hit'); } catch {}
  const damage=document.createElement('div'); damage.className='arg-anim-damage-number'; damage.textContent=`-${Math.max(0,Number(payload?.amount)||0)}`;
  Object.assign(damage.style,{left:`${impact.x+18}px`,top:`${impact.y-12}px`}); ensureAnimationLayer()?.appendChild(damage);
  void runWebAnimation(damage,[{transform:'translateY(8px) scale(.8)',opacity:0},{transform:'translateY(0) scale(1.08)',opacity:1},{transform:'translateY(-28px) scale(1)',opacity:0}],{duration:animationDuration(650),easing:'ease-out'}).then(()=>removeNode(damage));
  try {
    if(playerEl?.animate) playerEl.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:animationDuration(230),easing:'ease-out'});
  } catch {}
  setTimeout(()=>{ try{playerEl?.classList?.remove('arg-player-hit');}catch{} },animationDuration(420));
  await move; await runWebAnimation(attacker,[{opacity:1},{opacity:0}],{duration:animationDuration(130)}); removeNode(attacker); return true;
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
    void runWebAnimation(p,[{transform:'translate(0,0) scale(.7)',opacity:0},{transform:`translate(${dx*.3}px,${dy*.35}px) scale(1)`,opacity:.75},{transform:`translate(${dx}px,${dy}px) scale(1.5)`,opacity:0}],{duration:animationDuration(520),easing:'ease-out'}).then(()=>removeNode(p));
  }
  const anim=runWebAnimation(card,[
    {transform:'rotate(0deg) translateX(0)',filter:'brightness(1)'},
    {transform:'rotate(-4deg) translateX(-2px)',filter:'brightness(.96)'},
    {transform:'rotate(42deg) translateX(1px)',filter:'brightness(1.04)'},
    {transform:'rotate(94deg) translateX(0)',filter:'brightness(1.08)'},
    {transform:'rotate(90deg)',filter:'brightness(1)',opacity:1}
  ],{duration:animationDuration(470),easing:'cubic-bezier(.28,.72,.18,1)'});
  await sleepMs(animationDuration(215));
  if (animationEventCancelled(payload)) { removeNode(card); return false; }
  playSfx('landTap'); await anim;
  await runWebAnimation(card,[{opacity:1},{opacity:0}],{duration:animationDuration(100)}); removeNode(card); return true;
}

function enqueue(type, payload, runner, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || !payload) { skippedCount += 1; return Promise.resolve(false); }
  const serial=++animationSerial; queuedCount += 1; lastEvent={serial,type,queuedAt:Date.now()};
  const queuedPayload = { ...payload, __cancelSerial:cancelSerial };
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

export async function runAnimationDebugShowcase() {
  if (typeof document === 'undefined') return false;
  injectAnimationStyles();
  document.getElementById('arg-animation-debug-overlay')?.remove();
  const overlay=document.createElement('div'); overlay.id='arg-animation-debug-overlay';
  overlay.innerHTML=`<div class="arg-animation-debug-panel"><div style="font:900 20px system-ui;color:#f0cf64">🎬 Animation Lab 23.19.4</div><div style="font:12px system-ui;color:#aebbb4;margin-top:4px">Preview forzada: sirve aunque el kill switch global esté apagado. No toca state ni Firestore.</div><div class="arg-animation-debug-stage"><div class="arg-animation-debug-card" id="arg-debug-attacker" style="left:85px;bottom:32px">ATACANTE</div><div class="arg-animation-debug-card" id="arg-debug-defender" style="left:360px;top:32px">DEFENSOR</div><div class="arg-animation-debug-card" id="arg-debug-land" style="left:80px;top:40px">TIERRA</div><div class="arg-animation-debug-player">JUGADOR<br><span style="color:#8fda91">20 HP</span></div></div><div class="arg-animation-debug-actions"><button data-test="land">Tierra</button><button data-test="clash">Choque 1v1</button><button data-test="player">Daño jugador</button><button data-test="all">Secuencia</button><button data-test="close">Cerrar</button></div></div>`;
  document.body.appendChild(overlay);
  const debugLayer=ensureAnimationLayer();
  if (debugLayer) debugLayer.style.zIndex='31010';
  const stage=overlay.querySelector('.arg-animation-debug-stage');
  const mockItem=(el,name)=>({card:{id:name,name},_syncObjectId:null,__debugElement:el});
  const captureDebug=el=>{const rect=rectSnapshot(el);return rect?{kind:'card',clone:el.cloneNode(true),rect,cardName:el.textContent}:null;};
  const playerEl=overlay.querySelector('.arg-animation-debug-player');
  const playerSnap=()=>({kind:'player',element:playerEl,rect:rectSnapshot(playerEl),isLocal:false});
  const land=()=>queueLandTapAnimation({snapshot:captureDebug(overlay.querySelector('#arg-debug-land'))},{force:true});
  const clash=()=>queueCombatImpactAnimation({attackerSnapshot:captureDebug(overlay.querySelector('#arg-debug-attacker')),defenderSnapshot:captureDebug(overlay.querySelector('#arg-debug-defender')),attackerDied:false,defenderDied:true},{force:true});
  const player=()=>queuePlayerDamageAnimation({attackerSnapshot:captureDebug(overlay.querySelector('#arg-debug-attacker')),playerSnapshot:playerSnap(),amount:5},{force:true});
  overlay.addEventListener('click',async e=>{
    const btn=e.target.closest?.('button[data-test]'); if(!btn)return;
    const kind=btn.dataset.test;
    if(kind==='close'){overlay.remove();clearAnimationLayer('debug_close');return;}
    if(kind==='land') await land(); else if(kind==='clash') await clash(); else if(kind==='player') await player(); else if(kind==='all'){await land();await clash();await player();}
  });
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide',()=>clearAnimationLayer('pagehide'));
  window.addEventListener('beforeunload',()=>clearAnimationLayer('beforeunload'));
}
