// Argentinia 23.15.2.1 — Ownership & Control Engine hardening
// Mantiene separadas la identidad del propietario de una carta y el controlador actual
// del permanente. Las funciones de este módulo son puras respecto del game state: main.js
// se ocupa de mover el item entre las zonas visuales/controladas local/rival.

let fallbackControlSerial = 1;

export function controllerRoleForSide(isLocal, myRole = null) {
  if (myRole === 'host' || myRole === 'guest') return isLocal ? myRole : (myRole === 'host' ? 'guest' : 'host');
  return isLocal ? 'local' : 'rival';
}

export function otherControllerRole(role) {
  if (role === 'host') return 'guest';
  if (role === 'guest') return 'host';
  if (role === 'local') return 'rival';
  if (role === 'rival') return 'local';
  return null;
}

export function stampPermanentController(item, isLocal, myRole = null) {
  if (!item || typeof item !== 'object') return item;
  const role = controllerRoleForSide(!!isLocal, myRole);
  if (!item._baseControllerRole) item._baseControllerRole = role;
  if (!item._controllerRole) item._controllerRole = role;
  if (!Array.isArray(item._controlEffects)) item._controlEffects = [];
  return item;
}

export function permanentControllerRole(item, fallbackIsLocal = true, myRole = null) {
  const role = item?._controllerRole || item?._baseControllerRole || null;
  if (role) return role;
  return controllerRoleForSide(!!fallbackIsLocal, myRole);
}

export function permanentControllerIsLocal(item, fallbackIsLocal = true, myRole = null) {
  const role = permanentControllerRole(item, fallbackIsLocal, myRole);
  if (myRole === 'host' || myRole === 'guest') return role === myRole;
  return role !== 'rival';
}

export function makeControlEffect({ controllerRole, duration = 'indefinite', sourceId = null, expiresAtTurn = null, serial = null } = {}) {
  const resolvedSerial = Number(serial ?? fallbackControlSerial++);
  return {
    id: `control_${resolvedSerial}`,
    controllerRole,
    duration,
    sourceId: sourceId || null,
    expiresAtTurn: Number.isFinite(Number(expiresAtTurn)) ? Number(expiresAtTurn) : null,
    serial: resolvedSerial
  };
}

export function ensureControlEffects(item) {
  if (!item || typeof item !== 'object') return [];
  if (!Array.isArray(item._controlEffects)) item._controlEffects = [];
  return item._controlEffects;
}

export function effectiveControllerFromEffects(item) {
  const effects = ensureControlEffects(item).filter(e => e && e.controllerRole);
  if (!effects.length) return item?._baseControllerRole || item?._controllerRole || null;
  return [...effects].sort((a,b) => Number(a.serial||0)-Number(b.serial||0)).at(-1)?.controllerRole || item?._baseControllerRole || null;
}

export function addControlEffect(item, effect) {
  if (!item || !effect?.controllerRole) return null;
  const list = ensureControlEffects(item);
  const normalized = { ...effect, serial: Number(effect.serial || fallbackControlSerial++) };
  list.push(normalized);
  item._controllerRole = effectiveControllerFromEffects(item) || normalized.controllerRole;
  return normalized;
}

export function removeControlEffects(item, predicate) {
  if (!item || !Array.isArray(item._controlEffects)) return [];
  const removed = [];
  item._controlEffects = item._controlEffects.filter(effect => {
    if (predicate(effect)) { removed.push(effect); return false; }
    return true;
  });
  item._controllerRole = effectiveControllerFromEffects(item) || item._baseControllerRole || item._controllerRole;
  return removed;
}

export function expireEndOfTurnControlEffects(item, currentTurn = null) {
  return removeControlEffects(item, effect => effect?.duration === 'until_end_of_turn' && (effect.expiresAtTurn == null || currentTurn == null || Number(effect.expiresAtTurn) <= Number(currentTurn)));
}

export function removeSourceBoundControlEffects(item, sourceId) {
  if (!sourceId) return [];
  return removeControlEffects(item, effect => effect?.duration === 'while_source' && effect.sourceId === sourceId);
}

export function clearControlEffectsOnZoneChange(item) {
  if (!item || typeof item !== 'object') return item;
  item._controlEffects = [];
  item._controllerRole = item._baseControllerRole || item._controllerRole;
  return item;
}

export function deriveNextControlEffectSerial(state) {
  const keys = [
    'localCombat','rivalCombat','localSupport','rivalSupport',
    'localLands','rivalLands','localPlaneswalkers','rivalPlaneswalkers'
  ];
  let maxSerial = 0;
  for (const key of keys) {
    const zone = Array.isArray(state?.[key]) ? state[key] : [];
    for (const item of zone) {
      for (const effect of (Array.isArray(item?._controlEffects) ? item._controlEffects : [])) {
        const serial = Number(effect?.serial);
        if (Number.isFinite(serial)) maxSerial = Math.max(maxSerial, serial);
      }
    }
  }
  return Math.max(1, Math.floor(maxSerial) + 1);
}
