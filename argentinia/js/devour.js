import { isCreaturePermanent } from './permanentTypes.js';
import { getCounterCount } from './counterEngine.js';

export function devourMultiplier(card) {
  const amount = card?.devour;
  return isCreaturePermanent(card) && Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

export function devourResolutionKind(top, graveyard = [], started = false) {
  if (!top) return null;
  const effect = top.type === 'ability' ? top.ability?.effect : top.card?.effect;
  if (['summon','permanent'].includes(top.type) && devourMultiplier(top.card)) return 'devour-cast';
  if (effect?.type === 'return_exiled_permanent' && effect.exileObjectId &&
      ['host','guest','local','rival'].includes(effect.ownerRole) && devourMultiplier(top.card)) return 'devour-return';
  if (effect?.type === 'reanimate' && (!effect.amount || Number.isSafeInteger(effect.amount) && effect.amount > 0) &&
      (started || graveyard.some(card=>card && !card.isToken && devourMultiplier(card)))) return 'devour-reanimate';
  return null;
}

export function sourceAmount(effect, source, lastCounters = 0) {
  if (effect?.amountFrom === 'devoured') return source?.devouredCount || 0;
  if (effect?.amountFrom === 'source_plus_counters') return source ? getCounterCount(source,'+1/+1') : lastCounters;
  return effect?.amount;
}

// Prefer expendable creatures and leave the rest of the board in play. One extra
// point of power/toughness does not generally justify sacrificing a healthy non-token.
export function chooseBotDevourSacrifices(candidates, card, boardValue) {
  const multiplier = devourMultiplier(card);
  if (!multiplier) return [];
  const value = unit => boardValue(unit) + (unit.card?.diesTrigger ? -2 : 0) - (unit.card?.isToken ? 2 : 0);
  const budget = multiplier * 2 + (card.etbEffect?.amountFrom === 'devoured' ? 2 : 0);
  const ranked = [...candidates].sort((a,b)=>value(a)-value(b)).filter(unit=>value(unit)<budget);
  return ranked.slice(0,Math.min(multiplier,candidates.length));
}
