const battlefieldTargetTypes = {
  creature: ['creature'],
  creature_or_planeswalker: ['creature', 'planeswalker'],
  permanent: ['creature', 'planeswalker', 'land', 'permanent', 'aura']
};

const targetedGraveyardCards = new WeakSet();
const targetedAuras = new WeakSet();

export function battlefieldEffectTargets(effect) {
  return effect?.type === 'move_target_permanent' ? battlefieldTargetTypes[effect.targetKind] || [] : null;
}

export function graveyardEffectTargets(effect) {
  return effect?.type === 'move_target_graveyard_card';
}

export function graveyardForSide(state, isLocal) {
  return isLocal ? state.localGraveyard : state.rivalGraveyard;
}

export function graveyardTargets(state, controllerIsLocal, effect) {
  const sides = effect.graveyard === 'own' ? [controllerIsLocal] : [true, false];
  return sides.flatMap(isLocal => graveyardForSide(state, isLocal).filter(card => card && !card.isToken)
    .map(card => ({type:'graveyard',isLocal,card})));
}

export function lockGraveyardTarget(target) {
  targetedGraveyardCards.add(target.card);
  return target;
}

// If a targeted card leaves and later returns, that entry is a new rules object.
export function graveyardEntryCard(card) {
  if (!card?._graveyardObjectId && !targetedGraveyardCards.has(card)) return card;
  const copy = {...card};
  delete copy._graveyardObjectId;
  return copy;
}

export function lockAuraTarget(target) {
  targetedAuras.add(target.card);
  return target;
}

export function auraEntryCard(card) {
  if (!card?._auraObjectId && !targetedAuras.has(card)) return card;
  const copy = {...card};
  delete copy._auraObjectId;
  delete copy._controlEffectId;
  return copy;
}

export function notePermanentExit(state, isLocal) {
  if (!state.permanentExitTurn || typeof isLocal !== 'boolean') return;
  state.permanentExitTurn[isLocal ? 'local' : 'rival'] = state.turnCount;
}

export function permanentLeftThisTurn(state, isLocal) {
  return state.permanentExitTurn?.[isLocal ? 'local' : 'rival'] === state.turnCount;
}

export function permanentMoveManaLimit(state, effect, isLocal) {
  const bonus = permanentLeftThisTurn(state,isLocal) ? Number(effect.exitManaValueBonus || 0) : 0;
  return effect.maxManaValue == null ? Infinity : effect.maxManaValue + bonus;
}
