// js/botDifficulty.js — 23.17.2
// Fuente única de verdad para los perfiles del Tano. La dificultad define capacidades,
// no reglas distintas del juego: ningún perfil recibe información privada del rival.

export const BOT_DIFFICULTIES = Object.freeze(['easy','medium','hard']);

// Search strength is independent of good/strong/elite deck construction. Stored
// difficulty enums and tournament/server settings remain backward compatible.
export const BOT_COMBAT_SEARCH_PROFILES=Object.freeze({
  easy:Object.freeze({id:'basic',enabled:false,attackCandidates:0,beam:0,defenseCandidates:0,forecasts:0,replyCandidates:0,finalists:0}),
  medium:Object.freeze({id:'competent',enabled:true,attackCandidates:12,beam:8,defenseCandidates:8,blockCandidates:24,forecasts:160,replyCandidates:0,finalists:0}),
  hard:Object.freeze({id:'elite',enabled:true,attackCandidates:32,beam:64,defenseCandidates:48,blockCandidates:256,forecasts:2400,replyCandidates:8,finalists:6})
});

export function getBotCombatProfile(difficulty){return BOT_COMBAT_SEARCH_PROFILES[normalizeBotDifficulty(difficulty)];}

export const BOT_DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    id:'easy', label:'Fácil', deckQuality:'good',
    reactiveStack:false, combatTricks:false, fightTrades:false,
    strategicMainPhase:false, strategicDiscard:false, combat2:false
  }),
  medium: Object.freeze({
    id:'medium', label:'Medio', deckQuality:'strong',
    // 23.19.5 DI2: MEDIO usa el builder avanzado/competente, pero NO el cierre elite.
    // Puede dejar pequeñas imperfecciones de coherencia/selección para que no juegue como pro.
    reactiveStack:true, combatTricks:true, fightTrades:true,
    strategicMainPhase:true, strategicDiscard:true, combat2:false
  }),
  hard: Object.freeze({
    id:'hard', label:'Difícil', deckQuality:'elite',
    // DI2: DIFÍCIL usa el potencial completo del builder (coherencia estricta + top percentile).
    reactiveStack:true, combatTricks:true, fightTrades:true,
    strategicMainPhase:true, strategicDiscard:true, combat2:true
  })
});

export function normalizeBotDifficulty(value, fallback='medium') {
  const key=String(value||'').toLowerCase();
  return BOT_DIFFICULTY_PROFILES[key] ? key : fallback;
}

export function getBotDifficultyProfile(value) {
  return BOT_DIFFICULTY_PROFILES[normalizeBotDifficulty(value)];
}

export function botDifficultyLabel(value) {
  return getBotDifficultyProfile(value).label;
}

export function botDeckQuality(value) {
  return getBotDifficultyProfile(value).deckQuality;
}

export function botHasCapability(value, capability) {
  return !!getBotDifficultyProfile(value)?.[capability];
}

export function nextBotDifficulty(value) {
  const current=normalizeBotDifficulty(value);
  const idx=BOT_DIFFICULTIES.indexOf(current);
  return BOT_DIFFICULTIES[(idx+1)%BOT_DIFFICULTIES.length];
}
