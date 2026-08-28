// Argentinia 23.17.5.6 — Bot Reactive Target Reservation
// Pure helpers: this module intentionally does not import main.js/state so the reservation
// rules can be unit-tested without booting the browser game.

export const BOT_TARGET_RESERVATION_VERSION = '23.17.5.6';

export function permanentIdentity(item) {
  if (!item || typeof item !== 'object') return null;
  return item._syncObjectId
    || item._effectObjectId
    || item.card?.instanceId
    || item.instanceId
    || null;
}

export function samePermanentInstance(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aId = permanentIdentity(a);
  const bId = permanentIdentity(b);
  return !!aId && !!bId && aId === bId;
}

function effectOf(stackItem) {
  return stackItem?.effect || stackItem?.card?.effect || null;
}

function targetIsCreature(stackItem, target) {
  const targetObj = stackItem?.targetObj;
  return !!(
    targetObj
    && targetObj.type === 'creature'
    && targetObj.isLocal === true
    && samePermanentInstance(targetObj.item, target)
  );
}

function isPendingBotStackItemCountered(stackItem, stack, isCounterSpell) {
  if (!stackItem?.id || typeof isCounterSpell !== 'function') return false;
  return stack.some(entry =>
    entry?.isLocal === true
    && entry?.targetObj?.type === 'stack'
    && entry.targetObj.stackId === stackItem.id
    && isCounterSpell(entry.card)
  );
}

export function botStackItemReservesCreatureTarget(stackItem, target, stack = [], helpers = {}) {
  if (!stackItem || stackItem.isLocal !== false || !targetIsCreature(stackItem, target)) return false;

  // If the human already put a counter on this removal, the Tano is allowed to commit a
  // second answer to the same permanent; the first answer is no longer reliable coverage.
  if (isPendingBotStackItemCountered(stackItem, stack, helpers.isCounterSpell)) return false;

  const effect = effectOf(stackItem);
  if (!effect?.type) return false;

  const hasKeyword = typeof helpers.hasKeyword === 'function' ? helpers.hasKeyword : () => false;
  const getCounterCount = typeof helpers.getCounterCount === 'function'
    ? helpers.getCounterCount
    : (item, type) => Number(item?.counters?.[type] || 0);
  const getEffectiveToughness = typeof helpers.getEffectiveToughness === 'function'
    ? helpers.getEffectiveToughness
    : item => Number(item?.card?.toughness || item?.toughness || 0);

  if (['exile_creature', 'exile_and_return', 'bounce'].includes(effect.type)) return true;

  if (effect.type === 'destroy_creature') {
    // Shield can absorb the first destruction; Indestructible makes it fail completely.
    return !hasKeyword(target, 'indestructible') && getCounterCount(target, 'shield') <= 0;
  }

  if (effect.type === 'damage') {
    if (hasKeyword(target, 'indestructible') || getCounterCount(target, 'shield') > 0) return false;
    const amount = Number(effect.amount ?? stackItem.xValue ?? 0);
    const remaining = Math.max(0, Number(getEffectiveToughness(target) || 0) - Number(target.damageTaken || 0));
    return amount > 0 && amount >= remaining;
  }

  return false;
}

export function isCreatureReservedByBotStack(target, stack = [], helpers = {}) {
  if (!target) return false;
  return stack.some(stackItem => botStackItemReservesCreatureTarget(stackItem, target, stack, helpers));
}
