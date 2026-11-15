// v23.19.5.6 — local terminal derivation retained under server-required economy cutover.
// This module is intentionally pure: synced `gameOver` is evidence that a terminal state was
// committed, but it is NOT the local once-only processing guard. Each client still has to
// classify the outcome from its own perspective and settle/show the ending exactly once.

import { deriveRulesResult } from './terminalRules.js';

export function derivePerspectiveTerminalOutcome(state={}) {
  // A local explicit abandon is settled by the abandon-penalty flow, never by the normal
  // loss-reward path. Rival abandon, however, is a normal local victory.
  if (state.abandonedBy === 'rival') return { won:true, reason:'rival_abandon' };
  if (state.abandonedBy === 'local') return null;

  const myRole=state.currentMatch?.myRole || 'local';
  const deckedOut=(state.deckOutReady || state.gameOver) ? state.deckedOutRole : null;
  const effect=state.terminalEffect;
  const failedDraws={local:deckedOut==='both' || deckedOut===myRole,rival:deckedOut==='both' || (!!deckedOut && deckedOut!==myRole)};
  const terminal=deriveRulesResult(state,{
    explicitDraw:effect?.kind==='draw',failedDraws,
    forcedLosses:effect?.kind==='loss' ? [effect.loserRole===myRole?'local':'rival'] : []
  });
  if (!terminal) return null;
  if (terminal.outcome==='draw') return {outcome:'draw',won:null,reason:'draw'};
  const cause=terminal.cause==='life'?'hp':terminal.cause;
  return {won:terminal.outcome==='win',reason:`${cause}_${terminal.outcome}`};
}
