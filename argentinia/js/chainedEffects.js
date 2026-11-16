import { getLibraryEligibleEntries } from './libraryEngine.js';

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function chainedResolutionKind(effect,target) {
  if (!target && effect?.type === 'pay_or_sacrifice_source' && positiveInteger(effect.amount)) return 'land-toll';
  if (!target && effect?.type === 'search_library' && effect.destination === 'top' &&
      (effect.amount ?? 1) === 1 && (effect.owner ?? 'self') === 'self' &&
      (effect.range ?? 'all') === 'all' && effect.allowFewer === false &&
      effect.shuffle !== false && effect.reveal !== true && positiveInteger(effect.lifeLossAfter)) return 'library-life';
  if (target?.type === 'graveyard' && effect?.type === 'move_target_graveyard_card' &&
      effect.destination === 'exile' && effect.cardType === 'creature' && effect.onCreatureExiled?.createTokens?.type === 'create_tokens') return 'graveyard-token';
  return null;
}

export function libraryDeckWithSelectionOnTop(deck,effect,index,shuffle) {
  const eligible = getLibraryEligibleEntries(deck,effect);
  if (!eligible.length && index === null) {
    const shuffled = [...deck];
    shuffle(shuffled);
    return shuffled;
  }
  if (!eligible.some(entry=>entry.index === index)) throw new Error('MULTIPLAYER_CHAIN_LIBRARY_CHOICE_STALE');
  const shuffled = [...deck];
  const [selected] = shuffled.splice(index,1);
  shuffle(shuffled);
  shuffled.push(selected);
  return shuffled;
}
