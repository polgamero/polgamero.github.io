import {chooseAttackPlan3,chooseBlockPlan3} from './combatBot3.js';
import {publicCombatState3} from './combatForecast3.js';
import {getBotCombatProfile} from './botDifficulty.js';
import {guidedMatchActive} from './guidedMatch.js';
const reportedFallbacks=new Set();

// The only state boundary. It selects public fields before the planner can see
// anything, and leaves all effects/targets/declarations to the existing engine.
export function planBotCombat3(state,helpers,kind,refs,options={}){
  if(state.currentMatch||guidedMatchActive()||!getBotCombatProfile(state.botDifficulty).enabled)return null;
  try {
  const publicState=publicCombatState3(state);
  if(options.crew){
    const {crew,vehicle}=options;
    publicState.rivalCombat=publicState.rivalCombat.map(u=>crew.includes(u)?{...u,tapped:true}:u);
    publicState.rivalSupport=publicState.rivalSupport.filter(u=>u!==vehicle);
  }
  const input={...refs,publicState,helpers,difficulty:state.botDifficulty,purpose:options.purpose};
  return kind==='attack'?chooseAttackPlan3(input):chooseBlockPlan3(input);
  }catch(error){
    // Never let an advisory search strand priority. Keep a bounded, non-secret
    // developer reason; regression tests require version 3, not this fallback.
    globalThis.__ARGENTINIA_COMBAT3_LAST_FALLBACK__={kind,reason:'forecast_exception',name:String(error?.name||'Error')};
    if(!reportedFallbacks.has(kind)){reportedFallbacks.add(kind);console.warn('[Combat Bot 3.0] No se pudo evaluar el combate; se usa la estrategia anterior.');}
    return null;
  }
}
