// v23.19.5.6 — local terminal derivation retained under server-required economy cutover.
// This module is intentionally pure: synced `gameOver` is evidence that a terminal state was
// committed, but it is NOT the local once-only processing guard. Each client still has to
// classify the outcome from its own perspective and settle/show the ending exactly once.

const finite=value=>{ const n=Number(value); return Number.isFinite(n)?n:null; };

export function derivePerspectiveTerminalOutcome(state={}) {
  // A local explicit abandon is settled by the abandon-penalty flow, never by the normal
  // loss-reward path. Rival abandon, however, is a normal local victory.
  if (state.abandonedBy === 'rival') return { won:true, reason:'rival_abandon' };
  if (state.abandonedBy === 'local') return null;

  const localHP=finite(state.localHP), rivalHP=finite(state.rivalHP);
  const localPoison=finite(state.localPoison), rivalPoison=finite(state.rivalPoison);
  if (localHP !== null && localHP <= 0) return { won:false, reason:'hp_loss' };
  if (rivalHP !== null && rivalHP <= 0) return { won:true, reason:'hp_win' };
  if (localPoison !== null && localPoison >= 10) return { won:false, reason:'poison_loss' };
  if (rivalPoison !== null && rivalPoison >= 10) return { won:true, reason:'poison_win' };

  // A library merely being empty is not terminal until a draw was attempted. Therefore this
  // fallback is only legal once the synchronized state already says gameOver=true. It lets the
  // peer that did NOT execute the draw step still classify a remote deck-out.
  if (state.gameOver === true) {
    if (Array.isArray(state.localDeck) && state.localDeck.length === 0) return { won:false, reason:'deckout_loss' };
    if (Array.isArray(state.rivalDeck) && state.rivalDeck.length === 0) return { won:true, reason:'deckout_win' };
  }
  return null;
}
