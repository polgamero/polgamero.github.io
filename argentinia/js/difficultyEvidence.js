import { BOT_AI_VERSION } from './botDifficulty.js';
import { normalizeDifficultyObservation } from './difficultyIndicators.js';

export function botRuntimeObservation() {
  return { schemaVersion:1,botVersion:BOT_AI_VERSION,buildId:globalThis.__ARGENTINIA_PUBLIC_BUILD_ID__ || null };
}
export function beginDifficultyObservation(state, { deckQuality,deckSource } = {}) {
  if (!state || state.currentMatch || state.isGuidedLearningMatch) { if (state) state.difficultyObservation=null; return null; }
  state.difficultyObservation = normalizeDifficultyObservation({ ...botRuntimeObservation(),
    difficultyStart:state.botDifficulty,difficultyEnd:state.botDifficulty,deckQuality,deckSource,startedAtMs:Date.now() });
  return state.difficultyObservation;
}
export function noteDifficultyChange(state, next) {
  if (!state?.difficultyObservation || state.currentMatch) return;
  if (state.botDifficulty !== next) state.difficultyObservation.difficultyChanged = true;
  state.difficultyObservation.difficultyEnd = next;
}
export function currentDifficultyObservation(state,{observeRuntime=true}={}) {
  if (!state || state.currentMatch || state.isGuidedLearningMatch) return null;
  const observation = state.difficultyObservation;
  // A recovered legacy game must not acquire the version of the new page.
  if(!observation)return null;
  const next=normalizeDifficultyObservation({...observation,difficultyEnd:state.botDifficulty,
    botVersionEnd:observeRuntime?BOT_AI_VERSION:observation.botVersionEnd,
    buildIdEnd:observeRuntime?(globalThis.__ARGENTINIA_PUBLIC_BUILD_ID__ || observation.buildIdEnd):observation.buildIdEnd});
  state.difficultyObservation=next;
  return next;
}
export async function callWithDifficultyObservation(invoke, name, payload, observation) {
  if (!observation) return invoke(name,payload);
  try { return await invoke(name,{...payload,difficultyObservation:observation}); }
  catch (error) {
    const details=error?.details?.details || error?.details || {};
    if (details.unknownField !== 'difficultyObservation') throw error;
    // Old backends reject the optional field before their transaction begins.
    // Reuse the same operation and economic digest during a staged rollout.
    return invoke(name,payload);
  }
}
