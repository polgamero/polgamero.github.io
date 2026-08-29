// js/animationDirector.js — Entrega 23.19.4.5 Animation Actor Parity + SFX Cue Semantics.
// Capa VISUAL descartable: jamás muta state ni decide reglas. El engine captura geometría,
// confirma el resultado mecánico y encola una escena. Con animaciones OFF, Admin OFF o
// prefers-reduced-motion, todas las APIs se convierten en no-op seguro.

import { AUDIO_CATALOG, playSfx } from './audioManager.js';

export const ANIMATION_SETTINGS_STORAGE_KEY = 'argentinia.animations.v1';
export const ANIMATION_SPEEDS = Object.freeze(['slow', 'normal', 'fast']);
export const ANIMATION_SPEED_MULTIPLIERS = Object.freeze({ slow: 1.35, normal: 1, fast: 0.68 });
export const ANIMATION_TUNING_CATALOG = Object.freeze([
  Object.freeze({ key:'land', label:'Tierra', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['landTap']) }),
  Object.freeze({ key:'clash', label:'Impacto 1 vs 1', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['cardImpact']) }),
  Object.freeze({ key:'multi', label:'Combate Multi ×3', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['cardImpact']) }),
  Object.freeze({ key:'trample', label:'Arrollar', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['cardImpact','playerImpact']) }),
  Object.freeze({ key:'first', label:'Iniciativa', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['firstStrike']) }),
  Object.freeze({ key:'double', label:'Doble golpe', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['doubleStrike']) }),
  Object.freeze({ key:'shield', label:'Escudo', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['shieldImpact']) }),
  Object.freeze({ key:'deathtouch', label:'Toque mortal', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['deathtouchImpact']) }),
  Object.freeze({ key:'indestructible', label:'Indestructible', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['indestructibleImpact']) }),
  Object.freeze({ key:'player', label:'Daño al jugador', defaultRelativeSpeed:1, defaultSfxMoment:'key', sfxCadence:'per_impact', sfxIds:Object.freeze(['playerImpact']) }),
  Object.freeze({ key:'counter', label:'Counter', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['spellCountered']) }),
  Object.freeze({ key:'exile', label:'Exilio', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardExiled']) }),
  Object.freeze({ key:'bounce', label:'Volver a mano', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardBounced']) }),
  Object.freeze({ key:'draw', label:'Robo', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardDrawn']) }),
  Object.freeze({ key:'discard', label:'Descarte', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardDiscarded']) }),
  Object.freeze({ key:'sacrifice', label:'Sacrificio', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardSacrificed']) }),
  Object.freeze({ key:'graveyard', label:'Cementerio', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardToGraveyard']) }),
  Object.freeze({ key:'reanimate', label:'Reanimar', defaultRelativeSpeed:1, defaultSfxMoment:'start', sfxCadence:'single', sfxIds:Object.freeze(['cardReanimated']) })
]);

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, speed: 'normal' });
const SPEED_MIN = 0.25;
const SPEED_MAX = 3;
const RELATIVE_SPEED_MIN = 0.25;
const RELATIVE_SPEED_MAX = 3;
let localSettings = loadStoredSettings();
let serverPolicy = {
  enabled: true,
  speedMultipliers: { ...ANIMATION_SPEED_MULTIPLIERS },
  animationTunings: normalizeAnimationTunings(),
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
let presentationCueEmitter = null;

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

export function normalizeAnimationTunings(raw = {}) {
  const source = raw?.animationTunings && typeof raw.animationTunings === 'object'
    ? raw.animationTunings
    : raw;
  const normalized = {};
  for (const def of ANIMATION_TUNING_CATALOG) {
    const entry = source?.[def.key] && typeof source[def.key] === 'object' ? source[def.key] : {};
    const n = Number(entry?.relativeSpeed ?? entry?.speedMultiplier ?? def.defaultRelativeSpeed);
    const relativeSpeed = Number.isFinite(n)
      ? Math.max(RELATIVE_SPEED_MIN, Math.min(RELATIVE_SPEED_MAX, Math.round(n * 100) / 100))
      : def.defaultRelativeSpeed;
    const legacyMoment = entry?.sfxTiming === 'end' ? 'key' : entry?.sfxTiming;
    normalized[def.key] = {
      relativeSpeed,
      sfxMoment: entry?.sfxMoment === 'key' ? 'key' : entry?.sfxMoment === 'start' ? 'start'
        : legacyMoment === 'key' ? 'key' : legacyMoment === 'start' ? 'start' : def.defaultSfxMoment,
      sfxCadence: def.sfxCadence
    };
  }
  return normalized;
}

function audioAssetFilename(src) {
  const clean=String(src || '').split(/[?#]/)[0];
  return clean.split('/').filter(Boolean).pop() || clean;
}

function animationAudioTargets(def) {
  return (Array.isArray(def?.sfxIds) ? def.sfxIds : []).map(id => {
    const sources=AUDIO_CATALOG?.sfx?.[id]?.sources || [];
    const opus=sources.find(source => String(source?.src || '').toLowerCase().endsWith('.opus'));
    const mp3=sources.find(source => String(source?.src || '').toLowerCase().endsWith('.mp3'));
    return Object.freeze({
      id,
      opus:audioAssetFilename(opus?.src),
      mp3:audioAssetFilename(mp3?.src)
    });
  });
}

export function getAnimationTuningCatalog() {
  return ANIMATION_TUNING_CATALOG.map(def => ({
    ...def,
    sfxIds:[...(def.sfxIds || [])],
    audioTargets:animationAudioTargets(def).map(target => ({ ...target }))
  }));
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
    animationTunings: normalizeAnimationTunings(raw),
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
  return {
    ...serverPolicy,
    speedMultipliers:{ ...serverPolicy.speedMultipliers },
    animationTunings:Object.fromEntries(Object.entries(serverPolicy.animationTunings || {}).map(([key,value]) => [key,{ ...value }]))
  };
}

export function getEffectiveAnimationSpeedMultipliers() {
  return { ...serverPolicy.speedMultipliers };
}

export function getEffectiveAnimationTunings() {
  return Object.fromEntries(Object.entries(serverPolicy.animationTunings || {}).map(([key,value]) => [key,{ ...value }]));
}

export function getAnimationTuning(key) {
  const def = ANIMATION_TUNING_CATALOG.find(entry => entry.key === key) || ANIMATION_TUNING_CATALOG[0];
  const current = serverPolicy.animationTunings?.[def.key] || {};
  return {
    relativeSpeed: Number(current.relativeSpeed) || def.defaultRelativeSpeed,
    sfxMoment: current.sfxMoment === 'key' ? 'key' : current.sfxMoment === 'start' ? 'start' : def.defaultSfxMoment,
    sfxCadence: def.sfxCadence
  };
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

export function animationTunedDuration(baseMs, tuningKey, speedOverride = null) {
  const globalDuration = animationDuration(baseMs, speedOverride || null);
  const relativeSpeed = tuningKey ? getAnimationTuning(tuningKey).relativeSpeed : 1;
  return Math.max(1, Math.round(globalDuration / Math.max(RELATIVE_SPEED_MIN, relativeSpeed || 1)));
}

function durationFor(payload, baseMs, tuningKey = null) {
  return animationTunedDuration(baseMs, tuningKey || payload?.animationTuningKey || null, payload?.speedOverride || null);
}

function withAnimationTuning(payload, tuningKey) {
  return payload?.animationTuningKey ? payload : { ...(payload || {}), animationTuningKey:tuningKey };
}

function animationSfxMoment(tuningKey) {
  return getAnimationTuning(tuningKey).sfxMoment;
}

function playAnimationSfx(id, tuningKey, moment) {
  if (animationSfxMoment(tuningKey) !== moment) return null;
  return playSfx(id);
}

export function setPresentationCueEmitter(emitter) {
  presentationCueEmitter = typeof emitter === 'function' ? emitter : null;
}

function emitPresentationCue(cue, options = {}) {
  if (options?.broadcast === false || options?.remoteCue === true || !presentationCueEmitter || !cue?.kind) return false;
  try { return presentationCueEmitter(cue) === true; } catch { return false; }
}

function cueVisualRef(snapshot) {
  if (!snapshot) return null;
  return {
    kind: snapshot.kind || 'card',
    syncObjectId: snapshot.syncObjectId || null,
    stackId: snapshot.stackId ?? null,
    cardId: snapshot.cardId || null,
    cardName: snapshot.cardName || null
  };
}

function resolveCombatTuningKey(payload, defenders = []) {
  if (payload?.animationTuningKey) return payload.animationTuningKey;
  if (defenders.some(({entry}) => entry?.shieldConsumed) || defenders.some(entry => entry?.shieldConsumed)) return 'shield';
  if (defenders.some(({entry}) => entry?.indestructibleSurvived) || defenders.some(entry => entry?.indestructibleSurvived)) return 'indestructible';
  if (defenders.some(({entry}) => entry?.deathtouchHit) || defenders.some(entry => entry?.deathtouchHit)) return 'deathtouch';
  if (payload?.doubleStrikePass) return 'double';
  if (payload?.stepKind === 'first_strike') return 'first';
  if (Number(payload?.playerDamage) > 0 && defenders.length) return 'trample';
  if (defenders.length > 1) return 'multi';
  return 'clash';
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
    .arg-anim-zone-proxy{position:fixed;z-index:2;border:2px solid rgba(20,20,20,.96);border-radius:7px;background:linear-gradient(150deg,#d8c690,#6d5a39);color:#15110b;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;font:900 10px/1.15 system-ui,sans-serif;box-shadow:0 7px 18px rgba(0,0,0,.58);overflow:hidden;will-change:transform,opacity,filter;}
    .arg-anim-zone-proxy.back{background:#17100d url('./assets/images/card_back.png') center/cover no-repeat;color:transparent;border-color:#80652f;}
    .arg-anim-zone-rift{position:fixed;z-index:4;border-radius:50%;border:2px solid rgba(196,224,255,.85);box-shadow:0 0 28px rgba(117,185,255,.72),inset 0 0 18px rgba(232,246,255,.55);pointer-events:none;}
    .arg-anim-zone-grave{position:fixed;z-index:4;width:30px;height:9px;border-radius:50%;background:rgba(5,4,4,.86);box-shadow:0 0 20px rgba(0,0,0,.9);pointer-events:none;}
    .arg-anim-zone-revive{position:fixed;z-index:4;border-radius:12px;border:2px solid rgba(136,255,155,.88);box-shadow:0 0 30px rgba(74,230,108,.78),inset 0 0 20px rgba(202,255,211,.42);pointer-events:none;}
    .player-card.arg-player-hit,.arg-animation-lab-player.arg-player-hit{filter:brightness(1.22) saturate(1.25);box-shadow:0 0 0 2px rgba(255,70,60,.85),0 0 24px rgba(255,40,40,.75)!important;}

    .arg-animation-lab{width:100%;color:#e8eadf;}
    .arg-animation-lab-toolbar{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px;}
    .arg-animation-lab-control{display:flex;flex-direction:column;gap:5px;color:#bcaeca;font:700 11px/1.2 system-ui;}
    .arg-animation-lab-control select{min-width:150px;padding:8px 10px;border-radius:8px;border:1px solid rgba(212,175,55,.55);background:#0c1511;color:#f0d56a;font-weight:800;}
    .arg-animation-lab-speed-note{color:#9e91aa;font:11px/1.35 system-ui;min-width:190px;text-align:right;}
    .arg-animation-lab-board-shell{position:relative;width:100%;aspect-ratio:16/9;min-height:760px;max-height:none;border:2px solid rgba(212,175,55,.55);border-radius:14px;overflow:hidden;background:#0b130e url('./assets/images/ui/fondo.png') center/100% 100% no-repeat;box-shadow:0 18px 50px rgba(0,0,0,.45);}
    .arg-animation-lab-game{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) 19%;}
    .arg-animation-lab-board{position:relative;display:grid;grid-template-rows:16% 32% 32% 16%;gap:1%;padding:1% 1.2%;min-width:0;}
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
    .arg-animation-lab-field-half .arg-animation-lab-card{height:84%;width:auto;max-width:104px;max-height:142px;}
    .arg-animation-lab-sidebar{position:relative;background:linear-gradient(180deg,rgba(9,17,12,.88),rgba(4,9,6,.94));border-left:1px solid rgba(212,175,55,.3);padding:2.2% 4%;display:flex;flex-direction:column;justify-content:space-between;gap:10px;}
    .arg-animation-lab-player{position:relative;border:1px solid rgba(212,175,55,.55);border-radius:10px;background:rgba(22,25,23,.96);padding:10px 8px;color:white;text-align:center;font:800 clamp(8px,.75vw,12px)/1.25 system-ui;box-shadow:0 4px 14px rgba(0,0,0,.45);}
    .arg-animation-lab-player .hp{display:block;color:#8fda91;margin-top:4px;}
    .arg-animation-lab-log{min-height:42%;border:1px solid rgba(212,175,55,.18);border-radius:8px;background:rgba(3,7,4,.68);padding:8px;color:#9dafa4;font:9px/1.35 ui-monospace,monospace;overflow:hidden;}
    .arg-animation-lab-floating-controls{position:absolute;z-index:40;top:14px;right:14px;width:min(340px,42%);max-height:calc(100% - 28px);overflow:auto;border:1px solid rgba(212,175,55,.72);border-radius:11px;background:rgba(8,13,10,.94);box-shadow:0 12px 32px rgba(0,0,0,.62);backdrop-filter:blur(4px);}
    .arg-animation-lab-drag-handle{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(212,175,55,.25);color:#f0d56a;font:900 11px/1.2 system-ui;letter-spacing:.04em;cursor:grab;user-select:none;touch-action:none;background:rgba(39,45,33,.96);position:sticky;top:0;z-index:2;}
    .arg-animation-lab-drag-handle:active{cursor:grabbing;}
    .arg-animation-lab-drag-handle span{color:#9e91aa;font-weight:700;font-size:9px;letter-spacing:0;}
    .arg-animation-lab-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-start;padding:9px;margin:0;}
    .arg-animation-lab-actions button{padding:7px 9px;border-radius:8px;border:1px solid #d4af37;background:#202d26;color:#f4e5b9;font-weight:800;cursor:pointer;font-size:10px;}
    .arg-animation-lab-actions button:hover{box-shadow:0 0 14px rgba(212,175,55,.28);}
    .arg-animation-lab-actions button[data-test="all"]{border-color:#7dd2ff;color:#cceeff;}
    .arg-animation-lab-actions button[data-test="clear"]{border-color:#e68779;color:#ffd3cc;}
    .arg-animation-lab-status{padding:0 9px 9px;text-align:left;color:#a99bb5;font:10px/1.35 system-ui;}
    .arg-animation-lab-piles{position:absolute;display:flex;gap:7px;z-index:8;}
    .arg-animation-lab-piles.rival{left:1.2%;top:18%;}
    .arg-animation-lab-piles.local{left:1.2%;bottom:18%;}
    .arg-animation-lab-pile{width:52px;height:70px;border:1px solid rgba(212,175,55,.5);border-radius:7px;background:rgba(10,15,12,.9);color:#e6cf83;display:flex;align-items:center;justify-content:center;text-align:center;font:900 8px/1.1 system-ui;box-shadow:0 3px 12px rgba(0,0,0,.45);}
    .arg-animation-lab-stack-dummy{position:absolute;right:2%;top:45%;width:86px;height:112px;border:2px solid #d7b84e;border-radius:8px;background:linear-gradient(145deg,#2b3040,#11141d);color:#f4e7bd;display:flex;align-items:center;justify-content:center;text-align:center;font:900 9px/1.15 system-ui;z-index:9;box-shadow:0 5px 16px rgba(0,0,0,.55);}
    @media(max-width:1000px){.arg-animation-lab-board-shell{min-height:680px}.arg-animation-lab-game{grid-template-columns:minmax(0,1fr) 22%}.arg-animation-lab-card{width:clamp(45px,7vw,78px)}.arg-animation-lab-field-half .arg-animation-lab-card{height:82%;width:auto;max-height:104px}.arg-animation-lab-floating-controls{width:min(320px,56%)}}
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
  return { kind:'card', clone:el.cloneNode(true), element:el, rect, syncObjectId:item?._syncObjectId || null, cardId:item?.card?.id || null, cardName:item?.card?.name || null };
}

export function capturePlayerVisual(isLocal, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || typeof document === 'undefined') return null;
  const el = document.querySelector(isLocal ? '.player-card.local-card' : '.player-card.rival-card');
  const rect = rectSnapshot(el);
  return el && rect ? { kind:'player', element:el, rect, isLocal:!!isLocal } : null;
}

function cssAttr(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

export function captureStackVisual(stackItem, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || typeof document === 'undefined' || !stackItem) return null;
  const stackId=stackItem.id ?? stackItem.stackId;
  const el=stackId!=null ? document.querySelector(`.stack-item-card[data-stack-id="${cssAttr(stackId)}"]`) : null;
  const rect=rectSnapshot(el);
  if(!el || !rect) return null;
  return {kind:'stack',clone:el.cloneNode(true),rect,stackId,cardId:stackItem?.card?.id||null,cardName:stackItem?.card?.name||null};
}

export function captureZoneAnchor(zone, isLocal, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || typeof document === 'undefined') return null;
  const side=isLocal?'local':'rival';
  const selectors={
    library:`.side-pile[data-animation-zone="library"][data-animation-side="${side}"]`,
    graveyard:`.side-pile[data-animation-zone="graveyard"][data-animation-side="${side}"]`,
    exile:`.side-pile[data-animation-zone="exile"][data-animation-side="${side}"]`,
    hand:isLocal?'#local-hand':'#rival-hand',
    battlefield:isLocal?'#local-combat':'#rival-combat',
    combat:isLocal?'#local-combat':'#rival-combat',
    support:isLocal?'#local-support':'#rival-support',
    land:isLocal?'#local-lands':'#rival-lands'
  };
  const el=document.querySelector(selectors[zone]||'');
  const rect=rectSnapshot(el);
  return el&&rect?{kind:'zone',element:el,rect,zone,isLocal:!!isLocal}:null;
}

export function captureHandCardVisual(card, isLocal, { force = false } = {}) {
  if (!animationsEffectivelyEnabled({ force }) || typeof document === 'undefined' || !card) return null;
  const side=isLocal?'local':'rival';
  const id=card.id||'';
  const el=document.querySelector(`[data-card-id="${cssAttr(id)}"][data-zone="hand"][data-side="${side}"]`);
  const rect=rectSnapshot(el);
  return el&&rect?{kind:'card',clone:el.cloneNode(true),rect,cardId:id,cardName:card.name||null}:null;
}

function proxySnapshot(card, rect, { faceDown=false } = {}) {
  if(typeof document==='undefined' || !rect) return null;
  const el=document.createElement('div');
  el.className=`arg-anim-zone-proxy${faceDown?' back':''}`;
  if(!faceDown) el.textContent=card?.name || 'CARTA';
  return {kind:'proxy',clone:el,rect:{...rect},cardId:card?.id||null,cardName:card?.name||null};
}

function sourceSnapshotForEvent(event, { force=false } = {}) {
  const side=event?.controllerIsLocal!==false;
  const zone=String(event?.zoneFrom||'').toLowerCase();
  if(zone==='stack') return captureStackVisual(event?.item,{force});
  if(zone==='battlefield') return captureCardVisual(event?.item,side? 'local':'rival',{force});
  if(zone==='hand') return captureHandCardVisual(event?.card,side,{force});
  const anchor=captureZoneAnchor(zone==='library'?'library':zone,side,{force});
  if(!anchor?.rect) return null;
  return proxySnapshot(event?.card, anchor.rect, {faceDown:zone==='library' || (!side && zone==='hand')});
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

function hideOriginalVisual(snapshot) {
  try { snapshot?.element?.classList?.add('arg-anim-source-hidden'); } catch {}
}

function updatePlayerHpPresentation(playerSnapshot, hpValue) {
  if (!playerSnapshot?.element || !Number.isFinite(Number(hpValue))) return;
  const hp=Math.max(0,Math.min(20,Number(hpValue)));
  const text=playerSnapshot.element.querySelector('.hp-text');
  const bar=playerSnapshot.element.querySelector('.hp-fill');
  if (text) {
    const suffix=(String(text.textContent||'').match(/HP(.*)$/)?.[1] || '');
    text.textContent=`${hp} / 20 HP${suffix}`;
  }
  if (bar) bar.style.width=`${(hp/20)*100}%`;
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
  const combatTuningKey=resolveCombatTuningKey(payload,defenders);
  payload=withAnimationTuning(payload,combatTuningKey);
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
    const impactTuningKey=entry.shieldConsumed ? 'shield'
      : entry.indestructibleSurvived ? 'indestructible'
      : entry.deathtouchHit ? 'deathtouch'
      : payload?.doubleStrikePass ? 'double'
      : payload?.stepKind==='first_strike' ? 'first'
      : combatTuningKey;
    const impactSfx=entry.shieldConsumed ? 'shieldImpact'
      : entry.indestructibleSurvived ? 'indestructibleImpact'
      : entry.deathtouchHit ? 'deathtouchImpact'
      : payload?.doubleStrikePass ? 'doubleStrike'
      : payload?.stepKind==='first_strike' ? 'firstStrike'
      : 'cardImpact';
    playAnimationSfx(impactSfx,impactTuningKey,'start');
    const move=runWebAnimation(attacker,[
      {transform:currentTransform,offset:0},
      {transform:recoil,offset:.26},
      {transform:aim,offset:.48},
      {transform:hit,offset:1}
    ],{duration:durationFor(payload,legBase),easing:'cubic-bezier(.2,.78,.18,1)'});
    await sleepMs(durationFor(payload,Math.round(legBase*.83)));
    if(animationEventCancelled(payload)){removeNode(attacker);defenderClones.forEach(x=>removeNode(x.node));removeNode(stepLabel);return false;}
    playAnimationSfx(impactSfx,impactTuningKey,'key');
    const impact=center(entry.snapshot.rect);
    const variant=entry.deathtouchHit?'deathtouch':payload?.stepKind==='first_strike'?'first_strike':'normal';
    void impactBurst(impact.x,impact.y,payload,variant);
    void runWebAnimation(node,[{transform:'translate3d(0,0,0)'},{transform:`translate3d(${v.nx*9}px,${v.ny*9}px,0) rotate(${v.angle*.05}deg)`},{transform:'translate3d(0,0,0)'}],{duration:durationFor(payload,210),easing:'ease-out'});
    if(entry.shieldConsumed) void shieldBurst(entry.snapshot.rect,payload);
    if(entry.indestructibleSurvived) void indestructibleBurst(entry.snapshot.rect,payload);
    await move;
    currentTransform=`translate3d(${hitX-v.nx*12}px,${hitY-v.ny*12}px,0) rotate(${v.angle}deg) scale(1)`;
    if(entry.died){hideOriginalVisual(entry.snapshot);defenderVisual.fadeStarted=true;void fadeCombatClone(node,true,'',payload).then(()=>removeNode(node));} else if(i < defenderClones.length-1 || playerSnap) void runWebAnimation(node,[{opacity:1},{opacity:.35}],{duration:durationFor(payload,110)});
    if(i < defenderClones.length-1 || playerSnap) await sleepMs(durationFor(payload,95));
  }

  if(playerSnap && Number(payload?.playerDamage)>0) {
    const v=vectorBetween(aSnap.rect,playerSnap.rect);
    const stop=Math.max(20,v.d-Math.max(42,playerSnap.rect.width*.32));
    const hitX=v.nx*stop,hitY=v.ny*stop;
    const recoil=`translate3d(${-v.nx*20}px,${-v.ny*20}px,0) rotate(${v.angle*.18}deg) scale(.98)`;
    const hit=`translate3d(${hitX}px,${hitY}px,0) rotate(${v.angle}deg) scale(1.04)`;
    const playerImpactTuningKey=combatTuningKey==='trample' ? 'trample' : 'player';
    playAnimationSfx('playerImpact',playerImpactTuningKey,'start');
    const move=runWebAnimation(attacker,[{transform:currentTransform},{transform:recoil},{transform:hit}],{duration:durationFor(payload,520),easing:'cubic-bezier(.2,.78,.2,1)'});
    await sleepMs(durationFor(payload,435));
    if(!animationEventCancelled(payload)) {
      playAnimationSfx('playerImpact',playerImpactTuningKey,'key');
      updatePlayerHpPresentation(playerSnap,payload?.playerHpAfter);
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
  if(payload?.attackerDied) hideOriginalVisual(aSnap);
  cleanup.push(fadeCombatClone(attacker,!!payload?.attackerDied,currentTransform,payload));
  await Promise.all(cleanup);
  removeNode(attacker);defenderClones.forEach(x=>removeNode(x.node));removeNode(stepLabel);return true;
}

async function animatePlayerImpact(payload) {
  payload=withAnimationTuning(payload,'player');
  const aSnap=payload?.attackerSnapshot, pSnap=payload?.playerSnapshot;
  if(!aSnap||!pSnap) return false;
  const attacker=freezeClone(aSnap); if(!attacker) return false;
  const v=vectorBetween(aSnap.rect,pSnap.rect); const recoil=22; const stop=Math.max(20,v.d - Math.max(42,pSnap.rect.width*.32));
  const hitX=v.nx*stop, hitY=v.ny*stop; const impact=center(pSnap.rect);
  playAnimationSfx('playerImpact','player','start');
  const move=runWebAnimation(attacker,[
    {transform:'translate3d(0,0,0) rotate(0deg)'},
    {transform:`translate3d(${-v.nx*recoil}px,${-v.ny*recoil}px,0) rotate(${v.angle*.2}deg)`},
    {transform:`translate3d(${hitX}px,${hitY}px,0) rotate(${v.angle}deg) scale(1.04)`}
  ],{duration:durationFor(payload,560),easing:'cubic-bezier(.2,.78,.2,1)'});
  await sleepMs(durationFor(payload,475));
  if (animationEventCancelled(payload)) { removeNode(attacker); return false; }
  playAnimationSfx('playerImpact','player','key'); updatePlayerHpPresentation(pSnap,payload?.playerHpAfter); void impactBurst(impact.x,impact.y,payload,payload?.stepKind==='first_strike'?'first_strike':'normal');
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
  payload=withAnimationTuning(payload,'land');
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
  playAnimationSfx('landTap','land','start');
  const anim=runWebAnimation(card,[
    {transform:'rotate(0deg) translateX(0)',filter:'brightness(1)'},
    {transform:'rotate(-4deg) translateX(-2px)',filter:'brightness(.96)'},
    {transform:'rotate(42deg) translateX(1px)',filter:'brightness(1.04)'},
    {transform:'rotate(94deg) translateX(0)',filter:'brightness(1.08)'},
    {transform:'rotate(90deg)',filter:'brightness(1)',opacity:1}
  ],{duration:durationFor(payload,470),easing:'cubic-bezier(.28,.72,.18,1)'});
  await anim;
  if (animationEventCancelled(payload)) { removeNode(card); return false; }
  playAnimationSfx('landTap','land','key');
  await runWebAnimation(card,[{opacity:1},{opacity:0}],{duration:durationFor(payload,100)}); removeNode(card); return true;
}

function targetDelta(sourceRect,targetRect){
  const a=center(sourceRect),b=center(targetRect);return {dx:b.x-a.x,dy:b.y-a.y};
}

async function zonePulse(rect, kind, payload={}){
  if(!rect||typeof document==='undefined')return;
  const layer=ensureAnimationLayer();if(!layer)return;
  const cls=kind==='reanimate'?'arg-anim-zone-revive':kind==='graveyard'||kind==='sacrifice'?'arg-anim-zone-grave':'arg-anim-zone-rift';
  const el=document.createElement('div');el.className=cls;
  if(cls==='arg-anim-zone-grave') Object.assign(el.style,{left:`${rect.left+rect.width/2-15}px`,top:`${rect.top+rect.height/2-4}px`});
  else Object.assign(el.style,{left:`${rect.left-6}px`,top:`${rect.top-6}px`,width:`${rect.width+12}px`,height:`${rect.height+12}px`});
  layer.appendChild(el);
  const frames=cls==='arg-anim-zone-grave'
    ? [{transform:'scale(.35)',opacity:0},{transform:'scale(1.25)',opacity:.9},{transform:'scale(1.7)',opacity:0}]
    : [{transform:'scale(.75)',opacity:0},{transform:'scale(1.02)',opacity:1},{transform:'scale(1.22)',opacity:0}];
  await runWebAnimation(el,frames,{duration:durationFor(payload,420),easing:'ease-out'});removeNode(el);
}

async function animateZoneTransition(payload){
  const source=payload?.sourceSnapshot,target=payload?.targetSnapshot;
  if(!source?.rect)return false;
  const card=freezeClone(source);if(!card)return false;
  const kind=String(payload?.transition||'graveyard');
  const zoneTuningKey=ANIMATION_TUNING_CATALOG.some(def=>def.key===kind) ? kind : 'graveyard';
  payload=withAnimationTuning(payload,zoneTuningKey);
  const targetRect=target?.rect||source.rect;
  const {dx,dy}=targetDelta(source.rect,targetRect);
  let sfx='cardToGraveyard';
  let frames=[];
  let duration=560;
  if(kind==='counter'){
    sfx='spellCountered';duration=520;
    frames=[
      {transform:'translate3d(0,0,0) scale(1)',filter:'brightness(1) saturate(1)',opacity:1},
      {transform:'translate3d(-4px,0,0) rotate(-2deg) scale(1.02)',filter:'brightness(1.65) saturate(.7)',opacity:1},
      {transform:'translate3d(5px,0,0) rotate(2deg) scale(.96)',filter:'brightness(1.2) saturate(.35) blur(1px)',opacity:.82},
      {transform:`translate3d(${dx*.22}px,${dy*.22}px,0) rotate(8deg) scale(.08)`,filter:'brightness(2) saturate(0) blur(6px)',opacity:0}
    ];
  } else if(kind==='exile'){
    sfx='cardExiled';duration=650;
    frames=[
      {transform:'translate3d(0,0,0) scale(1)',filter:'brightness(1) saturate(1)',opacity:1},
      {transform:'translate3d(0,-12px,0) scale(1.04)',filter:'brightness(1.45) saturate(.65)',opacity:.94},
      {transform:`translate3d(${dx*.55}px,${dy*.55-18}px,0) rotate(4deg) scale(.78)`,filter:'brightness(1.8) saturate(.25) blur(1px)',opacity:.62},
      {transform:`translate3d(${dx}px,${dy}px,0) rotate(10deg) scale(.3)`,filter:'brightness(2.2) saturate(0) blur(7px)',opacity:0}
    ];
  } else if(kind==='bounce'){
    sfx='cardBounced';duration=610;
    frames=[
      {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',opacity:1},
      {transform:`translate3d(${dx*.28}px,${dy*.18-35}px,0) rotate(-7deg) scale(1.05)`,opacity:1},
      {transform:`translate3d(${dx*.72}px,${dy*.62-48}px,0) rotate(6deg) scale(.82)`,opacity:.86},
      {transform:`translate3d(${dx}px,${dy}px,0) rotate(0deg) scale(.35)`,opacity:0}
    ];
  } else if(kind==='draw'){
    sfx='cardDrawn';duration=520;
    frames=[
      {transform:'translate3d(0,0,0) rotate(0deg) scale(.82)',opacity:.15},
      {transform:`translate3d(${dx*.35}px,${dy*.18-28}px,0) rotate(-8deg) scale(1.02)`,opacity:1},
      {transform:`translate3d(${dx*.78}px,${dy*.72-18}px,0) rotate(5deg) scale(.9)`,opacity:1},
      {transform:`translate3d(${dx}px,${dy}px,0) rotate(0deg) scale(.55)`,opacity:0}
    ];
  } else if(kind==='discard'){
    sfx='cardDiscarded';duration=580;
    frames=[
      {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',opacity:1},
      {transform:`translate3d(${dx*.25}px,${dy*.12-12}px,0) rotate(12deg) scale(.96)`,opacity:.96},
      {transform:`translate3d(${dx*.75}px,${dy*.72}px,0) rotate(25deg) scale(.64)`,filter:'brightness(.65)',opacity:.72},
      {transform:`translate3d(${dx}px,${dy}px,0) rotate(32deg) scale(.28)`,filter:'brightness(.4) blur(2px)',opacity:0}
    ];
  } else if(kind==='sacrifice'){
    sfx='cardSacrificed';duration=610;
    frames=[
      {transform:'translate3d(0,0,0) scale(1)',filter:'brightness(1)',opacity:1},
      {transform:'translate3d(-3px,1px,0) rotate(-2deg) scale(1.03)',filter:'brightness(.7) saturate(.65)',opacity:1},
      {transform:'translate3d(4px,-1px,0) rotate(2deg) scale(.94)',filter:'brightness(.45) saturate(.35)',opacity:.86},
      {transform:`translate3d(${dx}px,${dy}px,0) rotate(-16deg) scale(.18)`,filter:'brightness(.2) saturate(0) blur(5px)',opacity:0}
    ];
  } else if(kind==='reanimate'){
    sfx='cardReanimated';duration=720;
    frames=[
      {transform:'translate3d(0,0,0) scale(.25)',filter:'brightness(.35) saturate(.3) blur(4px)',opacity:0},
      {transform:`translate3d(${dx*.32}px,${dy*.22-30}px,0) scale(.68)`,filter:'brightness(1.5) saturate(1.3)',opacity:.72},
      {transform:`translate3d(${dx*.78}px,${dy*.7-18}px,0) scale(1.08)`,filter:'brightness(1.25) saturate(1.1)',opacity:1},
      {transform:`translate3d(${dx}px,${dy}px,0) scale(1)`,filter:'brightness(1)',opacity:0}
    ];
  } else {
    sfx='cardToGraveyard';duration=560;
    frames=[
      {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',filter:'brightness(1)',opacity:1},
      {transform:`translate3d(${dx*.28}px,${dy*.16}px,0) rotate(-4deg) scale(.92)`,filter:'brightness(.62)',opacity:.92},
      {transform:`translate3d(${dx}px,${dy}px,0) rotate(9deg) scale(.3)`,filter:'brightness(.3) saturate(.35) blur(3px)',opacity:0}
    ];
  }
  playAnimationSfx(sfx,zoneTuningKey,'start');
  void zonePulse(kind==='reanimate'?targetRect:source.rect,kind,payload);
  const move=runWebAnimation(card,frames,{duration:durationFor(payload,duration),easing:kind==='bounce'?'cubic-bezier(.2,.72,.18,1)':'cubic-bezier(.25,.7,.2,1)'});
  if(animationSfxMoment(zoneTuningKey)==='key') {
    await sleepMs(durationFor(payload,Math.round(duration*.86)));
    if(animationEventCancelled(payload)){removeNode(card);return false;}
    playAnimationSfx(sfx,zoneTuningKey,'key');
  }
  await move;
  removeNode(card);return true;
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

function emitCombatSequenceCue(payload, options = {}) {
  const sourceIsLocal = payload?.attackerIsLocal !== false;
  return emitPresentationCue({
    kind:'combat_sequence',
    sourceIsLocal,
    targetIsLocal:!sourceIsLocal,
    attacker:cueVisualRef(payload?.attackerSnapshot),
    defenders:(Array.isArray(payload?.defenders)?payload.defenders:[]).map(entry=>({
      ref:cueVisualRef(entry?.snapshot),
      died:!!entry?.died,
      shieldConsumed:!!entry?.shieldConsumed,
      indestructibleSurvived:!!entry?.indestructibleSurvived,
      deathtouchHit:!!entry?.deathtouchHit,
      damageDealt:Math.max(0,Number(entry?.damageDealt)||0)
    })),
    playerDamage:Math.max(0,Number(payload?.playerDamage)||0),
    playerHpBefore:Number.isFinite(Number(payload?.playerHpBefore)) ? Number(payload.playerHpBefore) : null,
    playerHpAfter:Number.isFinite(Number(payload?.playerHpAfter)) ? Number(payload.playerHpAfter) : null,
    attackerDied:!!payload?.attackerDied,
    stepKind:payload?.stepKind || 'regular',
    doubleStrikePass:!!payload?.doubleStrikePass,
    animationTuningKey:payload?.animationTuningKey || null
  },options);
}

export function queueCombatImpactAnimation(payload, options={}) {
  const sourceIsLocal=payload?.attackerIsLocal !== false;
  emitPresentationCue({
    kind:'combat_impact',sourceIsLocal,targetIsLocal:!sourceIsLocal,
    attacker:cueVisualRef(payload?.attackerSnapshot),defender:cueVisualRef(payload?.defenderSnapshot),
    defenderDied:!!payload?.defenderDied,attackerDied:!!payload?.attackerDied,
    shieldConsumed:!!payload?.shieldConsumed,indestructibleSurvived:!!payload?.indestructibleSurvived,
    deathtouchHit:!!payload?.deathtouchHit,animationTuningKey:payload?.animationTuningKey||null
  },options);
  return enqueue('combat_card_impact',payload,animateCombatImpact,options);
}
export function queueCombatSequenceAnimation(payload, options={}) {
  emitCombatSequenceCue(payload,options);
  return enqueue('combat_sequence',payload,animateCombatSequence,options);
}
export function queuePlayerDamageAnimation(payload, options={}) {
  const sourceIsLocal=payload?.attackerIsLocal !== false;
  emitPresentationCue({
    kind:'player_impact',sourceIsLocal,targetIsLocal:!sourceIsLocal,
    attacker:cueVisualRef(payload?.attackerSnapshot),amount:Math.max(0,Number(payload?.amount)||0),
    playerHpBefore:Number.isFinite(Number(payload?.playerHpBefore)) ? Number(payload.playerHpBefore) : null,
    playerHpAfter:Number.isFinite(Number(payload?.playerHpAfter)) ? Number(payload.playerHpAfter) : null,
    stepKind:payload?.stepKind || 'regular',animationTuningKey:payload?.animationTuningKey||null
  },options);
  return enqueue('combat_player_impact',payload,animatePlayerImpact,options);
}
export function queueLandTapAnimation(payload, options={}) {
  emitPresentationCue({
    kind:'land_tap',sourceIsLocal:payload?.isLocal !== false,source:cueVisualRef(payload?.snapshot),animationTuningKey:'land'
  },options);
  return enqueue('land_tap',payload,animateLandTap,options);
}
export function queueZoneTransitionAnimation(payload, options={}) {
  const controllerIsLocal=payload?.controllerIsLocal !== false;
  const zoneFrom=String(payload?.zoneFrom||'');
  const zoneTo=String(payload?.zoneTo||payload?.targetSnapshot?.zone||'');
  const privateIdentity = zoneFrom === 'library' && zoneTo === 'hand';
  const card=privateIdentity ? null : (payload?.card ? {id:payload.card.id||null,name:payload.card.name||null} : null);
  const sourceRef=privateIdentity ? {kind:payload?.sourceSnapshot?.kind||'proxy',syncObjectId:null,stackId:null,cardId:null,cardName:null} : cueVisualRef(payload?.sourceSnapshot);
  emitPresentationCue({
    kind:'zone_transition',sourceIsLocal:controllerIsLocal,targetIsLocal:controllerIsLocal,
    transition:String(payload?.transition||'graveyard'),zoneFrom,zoneTo,source:sourceRef,card,
    animationTuningKey:payload?.animationTuningKey||null
  },options);
  return enqueue(`zone_${payload?.transition||'move'}`,payload,animateZoneTransition,options);
}

export function queuePermanentExitAnimation({item,isLocal,transition='graveyard',destinationZone='graveyard',card=null}, options={}) {
  const sourceSnapshot=captureCardVisual(item,isLocal?'local':'rival',options);
  const targetSnapshot=captureZoneAnchor(destinationZone,isLocal,options);
  if(!sourceSnapshot)return Promise.resolve(false);
  return queueZoneTransitionAnimation({sourceSnapshot,targetSnapshot,transition,card:card||item?.card||null,controllerIsLocal:isLocal,zoneFrom:'battlefield',zoneTo:destinationZone},options);
}

export function queueReanimateAnimation({card,isLocal}, options={}) {
  const from=captureZoneAnchor('graveyard',isLocal,options);const to=captureZoneAnchor('battlefield',isLocal,options);
  if(!from?.rect||!to?.rect)return Promise.resolve(false);
  const startRect={left:from.rect.left+from.rect.width*.08,top:from.rect.top+from.rect.height*.08,width:Math.max(48,Math.min(86,from.rect.width*.84)),height:Math.max(68,Math.min(120,from.rect.height*.84))};
  return queueZoneTransitionAnimation({sourceSnapshot:proxySnapshot(card,startRect),targetSnapshot:to,transition:'reanimate',card,controllerIsLocal:isLocal,zoneFrom:'graveyard',zoneTo:'battlefield'},options);
}

export function queueGameEventAnimation(event={}, options={}) {
  if(!event?.type)return Promise.resolve(false);
  const type=String(event.type);const isLocal=event.controllerIsLocal!==false;
  if(type==='permanent_tapped' && event.cause==='mana_ability' && event.item && event.card) {
    const snapshot=captureCardVisual(event.item,isLocal?'local':'rival',options);
    return snapshot ? queueLandTapAnimation({snapshot,isLocal},options) : Promise.resolve(false);
  }
  let transition=null;
  if(type==='card_drawn') transition='draw';
  else if(type==='card_discarded') transition=event.zoneTo==='exile' ? 'exile' : 'discard';
  else if(type==='spell_countered') transition='counter';
  else if(type==='permanent_left_battlefield' && event.cause==='bounce') transition='bounce';
  else if(type==='permanent_left_battlefield' && event.cause==='destroy' && event.zoneTo==='graveyard') transition='graveyard';
  else if(type==='card_exiled') {
    if(event.zoneFrom==='hand' && ['cleanup_discard','forced_discard','cost','activated_cost'].includes(String(event.cause||''))) return Promise.resolve(false);
    if(event.zoneFrom==='stack' && String(event.cause||'').startsWith('countered_')) return Promise.resolve(false);
    transition='exile';
  }
  if(!transition)return Promise.resolve(false);
  const sourceSnapshot=sourceSnapshotForEvent(event,options);
  if(!sourceSnapshot)return Promise.resolve(false);
  const destination=transition==='draw'||transition==='bounce'?'hand':transition==='exile'?'exile':event.zoneTo==='exile'?'exile':'graveyard';
  const targetSnapshot=captureZoneAnchor(destination,isLocal,options);
  return queueZoneTransitionAnimation({sourceSnapshot,targetSnapshot,transition,card:event.card||event.item?.card||null,controllerIsLocal:isLocal,zoneFrom:event.zoneFrom||'',zoneTo:destination},options);
}

function cueCardObject(ref, fallbackCard=null) {
  const id=ref?.cardId || fallbackCard?.id || null;
  const name=ref?.cardName || fallbackCard?.name || null;
  return id || name ? {id,name} : null;
}

function captureCueCard(ref, isLocal, { force=false } = {}) {
  if(!ref)return null;
  if(ref.kind==='stack' && ref.stackId!=null) return captureStackVisual({id:ref.stackId,card:cueCardObject(ref)}, {force});
  if(ref.syncObjectId || ref.cardId) return captureCardVisual({_syncObjectId:ref.syncObjectId||null,card:cueCardObject(ref)},isLocal?'local':'rival',{force});
  return null;
}

export function preparePresentationCuePlayback(cue, myRole, options={}) {
  if(!cue?.id || !cue?.kind || !myRole)return null;
  const sourceIsLocal=cue.sourceRole===myRole;
  const targetIsLocal=cue.targetRole===myRole;
  const playbackOptions={...options,broadcast:false,remoteCue:true};
  if(cue.kind==='land_tap') {
    const snapshot=captureCueCard(cue.source,sourceIsLocal,options);
    if(!snapshot)return null;
    return ()=>queueLandTapAnimation({snapshot,isLocal:sourceIsLocal,animationTuningKey:'land'},playbackOptions);
  }
  if(cue.kind==='player_impact') {
    const attackerSnapshot=captureCueCard(cue.attacker,sourceIsLocal,options);
    const playerSnapshot=capturePlayerVisual(targetIsLocal,options);
    if(!attackerSnapshot||!playerSnapshot)return null;
    return ()=>{
      if(Number.isFinite(Number(cue.playerHpBefore))) updatePlayerHpPresentation(playerSnapshot,Number(cue.playerHpBefore));
      return queuePlayerDamageAnimation({attackerSnapshot,playerSnapshot,amount:cue.amount||0,attackerIsLocal:sourceIsLocal,
        playerHpBefore:cue.playerHpBefore,playerHpAfter:cue.playerHpAfter,stepKind:cue.stepKind||'regular',animationTuningKey:cue.animationTuningKey||'player'},playbackOptions);
    };
  }
  if(cue.kind==='combat_impact') {
    const attackerSnapshot=captureCueCard(cue.attacker,sourceIsLocal,options);
    const defenderSnapshot=captureCueCard(cue.defender,targetIsLocal,options);
    if(!attackerSnapshot||!defenderSnapshot)return null;
    return ()=>queueCombatImpactAnimation({attackerSnapshot,defenderSnapshot,attackerIsLocal:sourceIsLocal,defenderDied:!!cue.defenderDied,attackerDied:!!cue.attackerDied,
      shieldConsumed:!!cue.shieldConsumed,indestructibleSurvived:!!cue.indestructibleSurvived,deathtouchHit:!!cue.deathtouchHit,animationTuningKey:cue.animationTuningKey||'clash'},playbackOptions);
  }
  if(cue.kind==='combat_sequence') {
    const attackerSnapshot=captureCueCard(cue.attacker,sourceIsLocal,options);
    const defenders=(Array.isArray(cue.defenders)?cue.defenders:[]).map(entry=>({
      snapshot:captureCueCard(entry?.ref,targetIsLocal,options),died:!!entry?.died,shieldConsumed:!!entry?.shieldConsumed,
      indestructibleSurvived:!!entry?.indestructibleSurvived,deathtouchHit:!!entry?.deathtouchHit,damageDealt:Math.max(0,Number(entry?.damageDealt)||0)
    })).filter(entry=>entry.snapshot);
    const playerSnapshot=Number(cue.playerDamage)>0 ? capturePlayerVisual(targetIsLocal,options) : null;
    if(!attackerSnapshot || (!defenders.length && !playerSnapshot))return null;
    return ()=>{
      if(playerSnapshot && Number.isFinite(Number(cue.playerHpBefore))) updatePlayerHpPresentation(playerSnapshot,Number(cue.playerHpBefore));
      return queueCombatSequenceAnimation({attackerSnapshot,defenders,playerSnapshot,playerDamage:Math.max(0,Number(cue.playerDamage)||0),
        playerHpBefore:cue.playerHpBefore,playerHpAfter:cue.playerHpAfter,attackerDied:!!cue.attackerDied,attackerIsLocal:sourceIsLocal,
        stepKind:cue.stepKind||'regular',doubleStrikePass:!!cue.doubleStrikePass,animationTuningKey:cue.animationTuningKey||null},playbackOptions);
    };
  }
  if(cue.kind==='zone_transition') {
    const controllerIsLocal=sourceIsLocal;
    const card=cue.card || cueCardObject(cue.source);
    let sourceSnapshot=captureCueCard(cue.source,controllerIsLocal,options);
    if(!sourceSnapshot){
      if(cue.zoneFrom==='hand' && controllerIsLocal && card) sourceSnapshot=captureHandCardVisual(card,true,options);
      if(!sourceSnapshot){
        const from=captureZoneAnchor(cue.zoneFrom||'graveyard',controllerIsLocal,options);
        if(from?.rect) sourceSnapshot=proxySnapshot(card,from.rect,{faceDown:cue.zoneFrom==='library'||(!controllerIsLocal&&cue.zoneFrom==='hand')});
      }
    }
    if(!sourceSnapshot)return null;
    const destination=cue.zoneTo||((cue.transition==='draw'||cue.transition==='bounce')?'hand':cue.transition==='exile'?'exile':'graveyard');
    const targetSnapshot=captureZoneAnchor(destination,controllerIsLocal,options);
    return ()=>queueZoneTransitionAnimation({sourceSnapshot,targetSnapshot,transition:cue.transition||'graveyard',card,controllerIsLocal,zoneFrom:cue.zoneFrom||'',zoneTo:destination,animationTuningKey:cue.animationTuningKey||null},playbackOptions);
  }
  return null;
}

export function clearAnimationLayer(reason = 'manual') {
  cancelSerial += 1;
  if (typeof document !== 'undefined') {
    removeNode(document.getElementById('arg-game-animation-layer'));
    document.querySelectorAll('.arg-anim-source-hidden').forEach(el=>el.classList.remove('arg-anim-source-hidden'));
  }
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
        <div class="arg-animation-lab-floating-controls" data-animation-lab-floating-controls>
          <div class="arg-animation-lab-drag-handle" data-animation-lab-drag-handle>🎛 CONTROLES DE PRUEBA <span>arrastrar por el tablero</span></div>
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
            <button data-test="counter">Counter</button>
            <button data-test="exile">Exilio</button>
            <button data-test="bounce">Volver a mano</button>
            <button data-test="draw">Robo</button>
            <button data-test="discard">Descarte</button>
            <button data-test="sacrifice">Sacrificio</button>
            <button data-test="graveyard">Cementerio</button>
            <button data-test="reanimate">Reanimar</button>
            <button data-test="all">Secuencia completa</button>
            <button data-test="clear">Limpiar</button>
          </div>
          <div class="arg-animation-lab-status" data-animation-lab-status></div>
        </div>
        <div class="arg-animation-lab-game">
          <div class="arg-animation-lab-board">
            <div class="arg-animation-lab-piles rival">
              <div class="arg-animation-lab-pile" data-lab-zone="rival-library">MAZO</div>
              <div class="arg-animation-lab-pile" data-lab-zone="rival-graveyard">GY</div>
              <div class="arg-animation-lab-pile" data-lab-zone="rival-exile">EX</div>
            </div>
            <div class="arg-animation-lab-piles local">
              <div class="arg-animation-lab-pile" data-lab-zone="local-library">MAZO</div>
              <div class="arg-animation-lab-pile" data-lab-zone="local-graveyard">GY</div>
              <div class="arg-animation-lab-pile" data-lab-zone="local-exile">EX</div>
            </div>
            <div class="arg-animation-lab-stack-dummy" data-lab-stack>HECHIZO<br>EN PILA</div>
            <div class="arg-animation-lab-hand" data-lab-zone="rival-hand">
              <div class="arg-animation-lab-card back">DORSO</div><div class="arg-animation-lab-card back">DORSO</div><div class="arg-animation-lab-card back">DORSO</div>
            </div>
            <div class="arg-animation-lab-field-half">
              <div class="arg-animation-lab-zone-row arg-animation-lab-support-row">
                <div class="arg-animation-lab-card land rival" data-lab-card="rival-land">TIERRA RIVAL<small>Isla</small></div>
                <div class="arg-animation-lab-card rival">SOPORTE<small>Artefacto</small></div>
              </div>
              <div class="arg-animation-lab-zone-row arg-animation-lab-combat-row" data-lab-zone="rival-battlefield">
                <div class="arg-animation-lab-card rival" data-lab-card="defender-1">DEFENSOR A<small>2/2</small></div>
                <div class="arg-animation-lab-card rival" data-lab-card="defender-2">DEFENSOR B<small>3/3</small></div>
                <div class="arg-animation-lab-card rival" data-lab-card="defender-3">DEFENSOR C<small>1/1</small></div>
              </div>
            </div>
            <div class="arg-animation-lab-field-half">
              <div class="arg-animation-lab-zone-row arg-animation-lab-combat-row" data-lab-zone="local-battlefield">
                <div class="arg-animation-lab-card local" data-lab-card="attacker">ATACANTE<small>6/6</small></div>
                <div class="arg-animation-lab-card local">ALIADO<small>2/3</small></div>
              </div>
              <div class="arg-animation-lab-zone-row arg-animation-lab-support-row">
                <div class="arg-animation-lab-card land local" data-lab-card="local-land">TIERRA<small>Bosque</small></div>
                <div class="arg-animation-lab-card land local">TIERRA<small>Planicie</small></div>
              </div>
            </div>
            <div class="arg-animation-lab-hand" data-lab-zone="local-hand">
              <div class="arg-animation-lab-card local" data-lab-card="hand-card">MANO<small>Carta local</small></div><div class="arg-animation-lab-card local">MANO</div><div class="arg-animation-lab-card local">MANO</div>
            </div>
          </div>
          <div class="arg-animation-lab-sidebar">
            <div class="arg-animation-lab-player" data-lab-player="rival">🤠 TANO DUMMY<span class="hp">20 / 20 HP</span></div>
            <div class="arg-animation-lab-log" data-animation-lab-log>Animation Studio 23.19.4.4\nDummy del tablero real + Zone Transitions.\nLos tests no tocan state ni Firestore.</div>
            <div class="arg-animation-lab-player" data-lab-player="local">🧉 VOS DUMMY<span class="hp">20 / 20 HP</span></div>
          </div>
        </div>
      </div>
    </div>`;
}

function makeAnimationLabControlsDraggable(root) {
  const panel=root?.querySelector?.('[data-animation-lab-floating-controls]');
  const handle=root?.querySelector?.('[data-animation-lab-drag-handle]');
  const shell=root?.querySelector?.('.arg-animation-lab-board-shell');
  if(!panel||!handle||!shell) return ()=>{};
  let drag=null;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const onDown=(event)=>{
    if(event.button!=null&&event.button!==0)return;
    const panelRect=panel.getBoundingClientRect();
    const shellRect=shell.getBoundingClientRect();
    drag={pointerId:event.pointerId,offsetX:event.clientX-panelRect.left,offsetY:event.clientY-panelRect.top};
    panel.style.left=`${panelRect.left-shellRect.left}px`;
    panel.style.top=`${panelRect.top-shellRect.top}px`;
    panel.style.right='auto';
    try{handle.setPointerCapture?.(event.pointerId);}catch{}
    event.preventDefault();
  };
  const onMove=(event)=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const shellRect=shell.getBoundingClientRect();
    const panelRect=panel.getBoundingClientRect();
    const maxLeft=Math.max(0,shellRect.width-panelRect.width);
    const maxTop=Math.max(0,shellRect.height-panelRect.height);
    panel.style.left=`${clamp(event.clientX-shellRect.left-drag.offsetX,0,maxLeft)}px`;
    panel.style.top=`${clamp(event.clientY-shellRect.top-drag.offsetY,0,maxTop)}px`;
    event.preventDefault();
  };
  const onUp=(event)=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    try{handle.releasePointerCapture?.(event.pointerId);}catch{}
    drag=null;
  };
  handle.addEventListener('pointerdown',onDown);
  handle.addEventListener('pointermove',onMove);
  handle.addEventListener('pointerup',onUp);
  handle.addEventListener('pointercancel',onUp);
  return ()=>{
    handle.removeEventListener('pointerdown',onDown);
    handle.removeEventListener('pointermove',onMove);
    handle.removeEventListener('pointerup',onUp);
    handle.removeEventListener('pointercancel',onUp);
  };
}

export function mountAnimationLab(root) {
  if (typeof document === 'undefined' || !root) return () => {};
  injectAnimationStyles();
  clearAnimationLayer('animation_lab_mount');
  const labLayer=ensureAnimationLayer();
  if(labLayer)labLayer.style.zIndex='31010';
  root.innerHTML=animationLabMarkup();
  const cleanupDrag=makeAnimationLabControlsDraggable(root);
  const speedSelect=root.querySelector('[data-animation-lab-speed]');
  const speedNote=root.querySelector('[data-animation-lab-speed-note]');
  const status=root.querySelector('[data-animation-lab-status]');
  const log=root.querySelector('[data-animation-lab-log]');
  const attacker=()=>labCapture(root.querySelector('[data-lab-card="attacker"]'));
  const def=(n)=>labCapture(root.querySelector(`[data-lab-card="defender-${n}"]`));
  const player=()=>labPlayerSnapshot(root.querySelector('[data-lab-player="rival"]'),false);
  const land=()=>labCapture(root.querySelector('[data-lab-card="local-land"]'));
  const labZone=(zone,isLocal=true)=>{const el=root.querySelector(`[data-lab-zone="${isLocal?'local':'rival'}-${zone}"]`);const rect=rectSnapshot(el);return rect?{kind:'zone',element:el,rect,zone,isLocal}:null;};
  const handCard=()=>labCapture(root.querySelector('[data-lab-card="hand-card"]'));
  const stackCard=()=>labCapture(root.querySelector('[data-lab-stack]'));
  const proxyAt=(zone,isLocal,cardName,faceDown=false)=>{const z=labZone(zone,isLocal);return z?.rect?proxySnapshot({name:cardName}, {left:z.rect.left+4,top:z.rect.top+4,width:Math.max(44,Math.min(78,z.rect.width-8)),height:Math.max(62,Math.min(110,z.rect.height-8))},{faceDown}):null;};
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
    land:async()=>{note('Tierra: resistencia + giro + polvo.');await queueLandTapAnimation({snapshot:land(),animationTuningKey:'land'},options());},
    clash:async()=>{note('1 vs 1: choque clásico; defensor muere.');await queueCombatImpactAnimation({attackerSnapshot:attacker(),defenderSnapshot:def(2),defenderDied:true,attackerDied:false,animationTuningKey:'clash'},options());},
    multi:async()=>{note('Multi ×3: el atacante recorre el orden de bloqueadores.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(1),died:true},{snapshot:def(2),died:false},{snapshot:def(3),died:true}],attackerDied:false,stepKind:'regular',animationTuningKey:'multi'});},
    trample:async()=>{note('Arrollar: bloqueadores y luego badge rival.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(1),died:true},{snapshot:def(3),died:true}],playerSnapshot:player(),playerDamage:3,attackerDied:false,stepKind:'regular',animationTuningKey:'trample'});},
    first:async()=>{note('Iniciativa: pase visual acelerado y etiqueta.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:true}],attackerDied:false,stepKind:'first_strike',animationTuningKey:'first'});},
    double:async()=>{note('Doble golpe: iniciativa y segundo impacto regular.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:false}],attackerDied:false,stepKind:'first_strike',animationTuningKey:'double'});await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:true}],attackerDied:false,stepKind:'regular',doubleStrikePass:true,animationTuningKey:'double'});},
    shield:async()=>{note('Escudo: absorbe el impacto y no desvanece la criatura.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:false,shieldConsumed:true}],attackerDied:false,stepKind:'regular',animationTuningKey:'shield'});},
    deathtouch:async()=>{note('Toque mortal: impacto violeta y muerte con 1+ daño.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:true,deathtouchHit:true}],attackerDied:false,stepKind:'regular',animationTuningKey:'deathtouch'});},
    indestructible:async()=>{note('Indestructible: impacto letal visual, destello dorado, sin fade.');await seq({attackerSnapshot:attacker(),defenders:[{snapshot:def(2),died:false,indestructibleSurvived:true}],attackerDied:false,stepKind:'regular',animationTuningKey:'indestructible'});},
    player:async()=>{note('Daño directo: embestida al badge y -5.');await queuePlayerDamageAnimation({attackerSnapshot:attacker(),playerSnapshot:player(),amount:5,animationTuningKey:'player'},options());},
    counter:async()=>{note('Counter: el hechizo colapsa y desaparece de la pila.');await queueZoneTransitionAnimation({sourceSnapshot:stackCard(),targetSnapshot:labZone('graveyard',true),transition:'counter',card:{name:'Hechizo en pila'}},options());},
    exile:async()=>{note('Exilio: disolución luminosa hacia EX rival.');await queueZoneTransitionAnimation({sourceSnapshot:def(2),targetSnapshot:labZone('exile',false),transition:'exile',card:{name:'Defensor B'}},options());},
    bounce:async()=>{note('Volver a mano: arco desde battlefield hacia la mano rival.');await queueZoneTransitionAnimation({sourceSnapshot:def(2),targetSnapshot:labZone('hand',false),transition:'bounce',card:{name:'Defensor B'}},options());},
    draw:async()=>{note('Robo: carta desde MAZO local hacia MANO local.');await queueZoneTransitionAnimation({sourceSnapshot:proxyAt('library',true,'Carta robada',true),targetSnapshot:labZone('hand',true),transition:'draw',card:{name:'Carta robada'}},options());},
    discard:async()=>{note('Descarte: carta de mano cae al cementerio local.');await queueZoneTransitionAnimation({sourceSnapshot:handCard(),targetSnapshot:labZone('graveyard',true),transition:'discard',card:{name:'Carta local'}},options());},
    sacrifice:async()=>{note('Sacrificio: colapso oscuro desde battlefield al cementerio.');await queueZoneTransitionAnimation({sourceSnapshot:attacker(),targetSnapshot:labZone('graveyard',true),transition:'sacrifice',card:{name:'Atacante'}},options());},
    graveyard:async()=>{note('Cementerio: salida normal de permanente hacia GY.');await queueZoneTransitionAnimation({sourceSnapshot:def(1),targetSnapshot:labZone('graveyard',false),transition:'graveyard',card:{name:'Defensor A'}},options());},
    reanimate:async()=>{note('Reanimar: una carta emerge del GY local al battlefield.');await queueZoneTransitionAnimation({sourceSnapshot:proxyAt('graveyard',true,'Criatura reanimada'),targetSnapshot:labZone('battlefield',true),transition:'reanimate',card:{name:'Criatura reanimada'}},options());}
  };
  scenarios.all=async()=>{for(const key of ['land','clash','multi','trample','first','double','shield','deathtouch','indestructible','player','counter','exile','bounce','draw','discard','sacrifice','graveyard','reanimate'])await scenarios[key]();};
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
  return ()=>{cleanupDrag();root.removeEventListener('click',onClick);clearAnimationLayer('animation_lab_unmount');};
}

// Compatibilidad para el botón/labs históricos: ahora abre el mismo Studio completo en overlay.
export async function runAnimationDebugShowcase() {
  if (typeof document === 'undefined') return false;
  injectAnimationStyles();
  document.getElementById('arg-animation-debug-overlay')?.remove();
  const overlay=document.createElement('div');overlay.id='arg-animation-debug-overlay';
  Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'30000',background:'rgba(4,7,8,.94)',padding:'18px',overflow:'auto'});
  overlay.innerHTML='<div style="max-width:1500px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font:900 20px system-ui;color:#f0cf64">🎬 Animation Studio 23.19.4.4</div><button data-overlay-close style="padding:8px 14px;border-radius:8px;border:1px solid #d4af37;background:#202d26;color:#f4e5b9;font-weight:800">Cerrar</button></div><div data-overlay-lab></div></div>';
  document.body.appendChild(overlay);
  const cleanup=mountAnimationLab(overlay.querySelector('[data-overlay-lab]'));
  overlay.querySelector('[data-overlay-close]')?.addEventListener('click',()=>{cleanup();overlay.remove();});
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide',()=>clearAnimationLayer('pagehide'));
  window.addEventListener('beforeunload',()=>clearAnimationLayer('beforeunload'));
}
