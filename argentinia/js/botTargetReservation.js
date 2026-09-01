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
    // Shield can absorb the first destruction; Irrompible makes it fail completely.
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
// 23.19.3 — Reserva equivalente para OBJETOS DE PILA. El hotfix 23.17.5.6 cerró
// la duplicación de removal sobre una misma criatura, pero no la variante de dos counters
// propios apuntando al mismo hechizo rival. Un counter pendiente ya cubre ese stackId; el
// Tano conserva la segunda respuesta para otro objeto o para defender el primer counter.
export function botStackItemReservesStackTarget(stackItem, targetStackItem, stack = [], helpers = {}) {
  if (!stackItem || stackItem.isLocal !== false || !targetStackItem?.id) return false;
  if (stackItem?.targetObj?.type !== 'stack' || stackItem.targetObj.stackId !== targetStackItem.id) return false;

  const isCounterSpell = typeof helpers.isCounterSpell === 'function' ? helpers.isCounterSpell : () => false;
  if (!isCounterSpell(stackItem.card)) return false;

  // Si el counter del Tano ya está siendo contrarrestado por una respuesta humana, dejamos
  // de tratar su cobertura como segura. En la práctica el selector suele preferir ese nuevo
  // counter humano por estar arriba en la pila, pero este detalle mantiene la semántica de
  // reserva alineada con la de permanentes.
  if (isPendingBotStackItemCountered(stackItem, stack, isCounterSpell)) return false;
  return true;
}

export function isStackObjectReservedByBotCounter(targetStackItem, stack = [], helpers = {}) {
  if (!targetStackItem?.id) return false;
  return stack.some(stackItem => botStackItemReservesStackTarget(stackItem, targetStackItem, stack, helpers));
}

