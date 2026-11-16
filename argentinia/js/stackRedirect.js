import { cardManaValue } from './libraryEngine.js';

export const REDIRECT_EFFECT = 'redirect_stack_target';

export function singleStackTarget(item) {
  if (!item || item.source?.selfTarget || item.ability?.effect?.type === 'pay_or_optional_draw') return null;
  const target = item.targetObj ?? item.target;
  if (target?.type !== 'multi') return target ? {target,index:null} : null;
  const slots = (target.targets || []).flatMap((entry,index)=>entry ? [{target:entry,index}] : []);
  return slots.length === 1 && slots[0].target.type !== 'multi' ? slots[0] : null;
}

export function canRedirectStackItem(effect,item,controllerIsLocal) {
  if (effect?.type !== REDIRECT_EFFECT) return false;
  const slot = singleStackTarget(item);
  if (!slot) return false;
  const isAbility = item.type === 'ability';
  const filter = effect.stackFilter || 'spell';
  if (filter === 'spell' && isAbility) return false;
  if (filter === 'ability' && !isAbility) return false;
  const activated = item.abilityKind ? ['activated','own','granted','loyalty'].includes(item.abilityKind)
    : ['support_activation','equipped_activation','crew_activation'].includes(item.source?.type);
  if (filter === 'activated_ability' && (!isAbility || !activated)) return false;
  const side = typeof controllerIsLocal === 'boolean' ? slot.target.isLocal : slot.target.ownerRole;
  if (effect.fromTarget === 'controller' && (slot.target.type !== 'player' || side !== controllerIsLocal)) return false;
  return true;
}

export function sameStackTarget(first,second) {
  if (!first || !second) return false;
  if (first.type === 'player' || second.type === 'player') return first.type === second.type && first.isLocal === second.isLocal;
  if (first.type === 'stack' || second.type === 'stack') return first.type === second.type && first.stackId === second.stackId;
  if (['aura','graveyard'].includes(first.type) || ['aura','graveyard'].includes(second.type)) {
    const id = first._syncDescriptor?.objectId;
    return first.type === second.type && ((first.card && first.card === second.card) || (!!id && id === second._syncDescriptor?.objectId));
  }
  const id = first.item?._syncObjectId || first._syncDescriptor?.syncObjectId;
  return (first.item && first.item === second.item) || (!!id && id === (second.item?._syncObjectId || second._syncDescriptor?.syncObjectId));
}

export function replaceSingleStackTarget(original,slot,replacement) {
  if (slot.index === null) return replacement;
  const targets = original.targets.slice();
  targets[slot.index] = replacement;
  return {...original,targets};
}

export function stackSpellManaValue(item) {
  if (!item?.card || item.type === 'ability') return 0;
  const countX = (String(item.card.manaCost || '').match(/\{X\}/gi) || []).length;
  return cardManaValue(item.card) + countX * Math.max(0,Number(item.xValue) || 0);
}
