export function protectsController(state, side) {
  return ['Combat', 'Support'].some(zone =>
    (state[side + zone] || []).some(item => {
      const card=item?.card;
      if (!card || /tierra/i.test(String(card.type || ''))) return false;
      return [card?.staticEffect, ...(Array.isArray(card?.staticEffects) ? card.staticEffects : [])]
        .some(effect => effect?.type === 'prevent_match_loss');
    }));
}

export function collectMatchDefeats(state, {failedDraws = {}, forcedLosses = []} = {}) {
  const defeats = [];
  for (const side of ['local', 'rival']) {
    if (protectsController(state,side)) continue;
    const causes = [];
    const life = state[side + 'HP'];
    if (life !== null && life !== '' && Number.isFinite(Number(life)) && Number(life)<=0) causes.push('life');
    if (Number(state[side + 'Poison']) >= 10) causes.push('poison');
    if (Number(failedDraws[side]) > 0) causes.push('deckout');
    if (forcedLosses.includes(side)) causes.push('effect');
    if (causes.length) defeats.push({side,causes});
  }
  return defeats;
}

export function deriveRulesResult(state, {explicitDraw = false, ...evidence} = {}) {
  if (explicitDraw) return {outcome:'draw',cause:'effect',defeats:[]};
  const defeats = collectMatchDefeats(state,evidence);
  if (!defeats.length) return null;
  return {
    outcome:defeats.length === 2 ? 'draw' : defeats[0].side === 'local' ? 'loss' : 'win',
    cause:defeats.length === 2 ? 'simultaneous' : defeats[0].causes[0],
    defeats
  };
}
