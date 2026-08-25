// js/matchSync.js
//
// Traductor puro entre el state local/rival del motor y el documento host/guest de
// Firestore. Entrega 23.6 agregó las primeras garantías críticas; 23.7 endurece
// autoridad, identidad estable de permanentes y operaciones públicas→privadas:
//   1) snapshots parciales nunca pisan arrays válidos con `undefined`;
//   2) la Stack viaja como estado público canónico y se rehidrata desde la perspectiva
//      de cada cliente, incluyendo targets y fuentes de habilidades.
import { deriveLocalPriorityActivity } from './priorityUX.js';

export const PER_PLAYER_FIELDS = [
  'HP', 'Poison', 'ManaPool', 'Lands', 'Combat', 'Graveyard', 'Exile', 'Support', 'Planeswalkers',
  'LandPlayedThisTurn', 'AttackersDeclaredThisTurn', 'BlockersDeclaredThisCombat'
];

export const SHARED_FIELDS = [
  'turnCount', 'phase', 'gameOver', 'consecutivePasses', 'combatDamagePrevented',
  'activeEffects', 'scheduledReturns',
  'pendingDecision', 'decisionResponse',
  'priorityClockSerial', 'priorityClockDurationMs', 'priorityActivity'
];

export function otherRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function touchedAllows(touchedKeys, key) {
  if (!touchedKeys) return true; // compatibilidad con documentos pre-23.6
  return touchedKeys.has ? touchedKeys.has(key) : Array.isArray(touchedKeys) ? touchedKeys.includes(key) : true;
}

const BOARD_ZONE_SPECS = [
  ['combat', 'localCombat', 'rivalCombat'],
  ['support', 'localSupport', 'rivalSupport'],
  ['lands', 'localLands', 'rivalLands'],
  ['planeswalkers', 'localPlaneswalkers', 'rivalPlaneswalkers']
];

// ENTREGA 23.7 — identidad pública ESTABLE de permanentes. La telemetría ya tenía IDs
// locales, pero eran deliberadamente diagnósticos y se regeneraban al rehidratar un
// snapshot. Para operaciones multiplayer que cruzan una zona pública hacia una privada
// (por ejemplo, "Che, Volvé" -> mano del dueño) necesitamos nombrar inequívocamente AL
// OBJETO DE CAMPO, incluso si hay dos copias de la misma carta. Este ID viaja dentro del
// item público y sobrevive sync/reconexión; nunca contiene información privada.
let nextSyncObjectSerial = 1;

function makeSyncObjectId(ownerRole) {
  const randomPart = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${(nextSyncObjectSerial++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${ownerRole || 'p'}_${randomPart}`;
}

function ensureItemSyncId(item, ownerRole) {
  if (!item || typeof item !== 'object') return null;
  if (!item._syncObjectId) item._syncObjectId = makeSyncObjectId(ownerRole);
  return item._syncObjectId;
}

export function ensureBoardItemSyncIds(state, myRole) {
  if (!state || !myRole) return;
  for (const [, localKey, rivalKey] of BOARD_ZONE_SPECS) {
    (Array.isArray(state[localKey]) ? state[localKey] : []).forEach(item => ensureItemSyncId(item, myRole));
    (Array.isArray(state[rivalKey]) ? state[rivalKey] : []).forEach(item => ensureItemSyncId(item, otherRole(myRole)));
  }
}

function zoneArray(state, zoneName, isLocal) {
  const spec = BOARD_ZONE_SPECS.find(([wire]) => wire === zoneName);
  if (!spec) return null;
  const key = isLocal ? spec[1] : spec[2];
  return Array.isArray(state?.[key]) ? state[key] : null;
}

export function serializeBoardItemRef(item, state, myRole) {
  if (!item || !state) return null;
  for (const [zoneName, localKey, rivalKey] of BOARD_ZONE_SPECS) {
    for (const [isLocal, key] of [[true, localKey], [false, rivalKey]]) {
      const zone = Array.isArray(state[key]) ? state[key] : [];
      // 23.7.2: Firestore rehidrata objetos JS nuevos. Si `item` es una referencia vieja
      // de una habilidad en Stack, `indexOf(item)` falla aunque el mismo permanente siga
      // vivo. La identidad pública estable manda primero.
      const syncId = item?._syncObjectId || item?._syncDescriptor?.syncObjectId || null;
      let index = syncId ? zone.findIndex(candidate => candidate?._syncObjectId === syncId) : -1;
      if (index < 0) index = zone.indexOf(item);
      if (index !== -1) {
        const liveItem = zone[index];
        const ownerRole = isLocal ? myRole : otherRole(myRole);
        return {
          ownerRole,
          zone: zoneName,
          index,
          syncObjectId: ensureItemSyncId(liveItem, ownerRole),
          cardId: liveItem?.card?.id || item?.card?.id || null,
          cardName: liveItem?.card?.name || item?.card?.name || null
        };
      }
    }
  }
  return null;
}

export function deserializeBoardItemRef(ref, state, myRole) {
  if (!ref || !state) return null;
  const isLocal = ref.ownerRole === myRole;
  const zone = zoneArray(state, ref.zone, isLocal);
  if (!zone) return null;
  let item = null;
  if (ref.syncObjectId) item = zone.find(candidate => candidate?._syncObjectId === ref.syncObjectId) || null;
  if (!item) item = zone[Number(ref.index)];
  if (!item) return null;
  if (ref.cardId && item?.card?.id && ref.cardId !== item.card.id) return null;
  if (!ref.cardId && ref.cardName && item?.card?.name !== ref.cardName) return null;
  return item;
}

function targetZoneName(type) {
  if (type === 'creature') return 'combat';
  if (type === 'permanent') return 'support';
  if (type === 'land') return 'lands';
  if (type === 'planeswalker') return 'planeswalkers';
  return null;
}

export function serializeStackTarget(targetObj, state, myRole) {
  if (!targetObj) return null;
  if (targetObj.type === 'stack') return { type: 'stack', stackId: targetObj.stackId };
  if (targetObj.type === 'multi') {
    return { type: 'multi', targets: (targetObj.targets || []).map(t => serializeStackTarget(t, state, myRole)) };
  }
  if (targetObj.type === 'player') {
    return { type: 'player', ownerRole: targetObj.isLocal ? myRole : otherRole(myRole) };
  }

  let zoneName = targetZoneName(targetObj.type);
  if (!zoneName) return null;
  const isLocal = !!targetObj.isLocal;
  if (targetObj.type === 'land') {
    const lands = zoneArray(state, 'lands', isLocal) || [];
    const combat = zoneArray(state, 'combat', isLocal) || [];
    if (!lands.includes(targetObj.item) && combat.includes(targetObj.item)) zoneName = 'combat';
  }
  const zone = zoneArray(state, zoneName, isLocal) || [];
  let index = Number.isInteger(targetObj.index) ? targetObj.index : zone.indexOf(targetObj.item);
  if (index < 0 && targetObj._syncDescriptor && Number.isInteger(targetObj._syncDescriptor.index)) {
    index = targetObj._syncDescriptor.index;
  }
  const item = targetObj.item || (index >= 0 ? zone[index] : null);
  const ownerRole = isLocal ? myRole : otherRole(myRole);
  const descriptor = {
    type: targetObj.type,
    ownerRole,
    zone: zoneName,
    index,
    syncObjectId: item ? ensureItemSyncId(item, ownerRole) : (targetObj._syncDescriptor?.syncObjectId || null),
    cardId: item?.card?.id || targetObj._syncDescriptor?.cardId || null,
    cardName: item?.card?.name || targetObj._syncDescriptor?.cardName || null,
    cardSnapshot: item?.card ? {
      id: item.card.id || null,
      name: item.card.name || null,
      type: item.card.type || null,
      power: item.card.power ?? null,
      toughness: item.card.toughness ?? null
    } : (targetObj._syncDescriptor?.cardSnapshot || null)
  };
  if (targetObj.fightWithItem) descriptor.fightWithRef = serializeBoardItemRef(targetObj.fightWithItem, state, myRole);
  return descriptor;
}

export function deserializeStackTarget(descriptor, state, myRole) {
  if (!descriptor) return null;
  if (descriptor.type === 'stack') return { type: 'stack', stackId: descriptor.stackId };
  if (descriptor.type === 'multi') {
    return { type: 'multi', targets: (descriptor.targets || []).map(t => deserializeStackTarget(t, state, myRole)) };
  }
  const isLocal = descriptor.ownerRole === myRole;
  if (descriptor.type === 'player') return { type: 'player', isLocal };

  const zoneName = descriptor.zone || targetZoneName(descriptor.type);
  const zone = zoneArray(state, zoneName, isLocal) || [];
  const index = Number(descriptor.index);
  let item = descriptor.syncObjectId
    ? (zone.find(candidate => candidate?._syncObjectId === descriptor.syncObjectId) || null)
    : null;
  if (!item) item = Number.isInteger(index) && index >= 0 ? zone[index] : null;
  if (item && descriptor.cardId && item?.card?.id && descriptor.cardId !== item.card.id) item = null;
  if (item && !descriptor.cardId && descriptor.cardName && item?.card?.name !== descriptor.cardName) item = null;
  // Si resolvimos por el fallback de índice (snapshot viejo/reconexión) heredamos la identidad
  // pública del descriptor. Así volver a serializar no inventa otro syncObjectId distinto.
  if (item && descriptor.syncObjectId && !item._syncObjectId) item._syncObjectId = descriptor.syncObjectId;

  // Si el target ya abandonó la zona (o una reconexión ocurre después), conservamos un
  // tombstone mínimo para que la UI pueda nombrarlo y el resolver lo trate como ausente
  // del battlefield en vez de explotar leyendo `.card` de null.
  if (!item && descriptor.cardSnapshot) item = { card: { ...descriptor.cardSnapshot }, _syncTombstone: true };

  const target = {
    type: descriptor.type,
    isLocal,
    index: Number.isInteger(index) ? index : -1,
    item,
    _syncDescriptor: descriptor
  };
  if (descriptor.fightWithRef) target.fightWithItem = deserializeBoardItemRef(descriptor.fightWithRef, state, myRole);
  return target;
}

function serializeStackSource(source, state, myRole) {
  if (!source) return null;
  const out = {};
  ['type', 'triggerType', 'sourceCardId', 'selfTarget', 'index', 'abilityIndex'].forEach(key => {
    if (hasOwn(source, key)) out[key] = source[key];
  });
  if (source.eventCard) out.eventCard = source.eventCard;
  const sourceItemRef = serializeBoardItemRef(source.sourceItem, state, myRole) || source._sourceItemRef || null;
  const eventItemRef = serializeBoardItemRef(source.eventItem, state, myRole) || source._eventItemRef || null;
  if (sourceItemRef) {
    out.sourceItemRef = sourceItemRef;
    source._sourceItemRef = sourceItemRef;
  }
  if (eventItemRef) {
    out.eventItemRef = eventItemRef;
    source._eventItemRef = eventItemRef;
  }
  return out;
}

function deserializeStackSource(source, state, myRole) {
  if (!source) return null;
  const out = { ...source };
  if (source.sourceItemRef) {
    out._sourceItemRef = source.sourceItemRef;
    out.sourceItem = deserializeBoardItemRef(source.sourceItemRef, state, myRole);
  }
  if (source.eventItemRef) {
    out._eventItemRef = source.eventItemRef;
    out.eventItem = deserializeBoardItemRef(source.eventItemRef, state, myRole);
  }
  delete out.sourceItemRef;
  delete out.eventItemRef;
  return out;
}

export function serializeStackForPublic(stack, state, myRole) {
  if (!Array.isArray(stack)) return [];
  return stack.map(item => {
    const sourceItemRef = serializeBoardItemRef(item?.sourceItem, state, myRole) || item?._sourceItemRef || null;
    const wire = {
      id: item?.id ?? null,
      controllerRole: item?.isLocal ? myRole : otherRole(myRole),
      type: item?.type || null,
      card: item?.card || null,
      target: serializeStackTarget(item?.targetObj, state, myRole),
      xValue: item?.xValue ?? null,
      castFrom: item?.castFrom ?? null,
      kicked: item?.kicked ?? null,
      abilityKind: item?.abilityKind ?? null,
      triggerType: item?.triggerType ?? null,
      triggerLabel: item?.triggerLabel ?? null,
      ability: item?.ability || null,
      source: serializeStackSource(item?.source, state, myRole)
    };
    if (sourceItemRef) {
      wire.sourceItemRef = sourceItemRef;
      // Persistimos el descriptor también en el objeto local de Stack. El eco propio no se
      // rehidrata (correctamente), así que sin esto el controlador podría conservar un
      // puntero JS viejo si su Support cambia mientras la habilidad espera resolución.
      item._sourceItemRef = sourceItemRef;
    }
    return wire;
  });
}

export function deserializeStackFromPublic(stackState, state, myRole) {
  if (!Array.isArray(stackState)) return [];
  return stackState.map(wire => {
    const item = {
      id: wire?.id ?? null,
      card: wire?.card || null,
      isLocal: wire?.controllerRole === myRole,
      targetObj: deserializeStackTarget(wire?.target, state, myRole),
      type: wire?.type || null,
      xValue: wire?.xValue ?? null,
      castFrom: wire?.castFrom ?? null,
      kicked: wire?.kicked ?? null,
      abilityKind: wire?.abilityKind ?? null,
      triggerType: wire?.triggerType ?? null,
      triggerLabel: wire?.triggerLabel ?? null,
      ability: wire?.ability || null,
      source: deserializeStackSource(wire?.source, state, myRole)
    };
    if (wire?.sourceItemRef) {
      item._sourceItemRef = wire.sourceItemRef;
      item.sourceItem = deserializeBoardItemRef(wire.sourceItemRef, state, myRole);
    }
    return item;
  });
}

export function buildMyPublicPatch(state, myRole, stack = []) {
  const rivalRole = otherRole(myRole);
  const patch = {};
  const hasAuthority = state.activePlayer === 'local' || state.stackResolutionAuthority === true;

  ensureBoardItemSyncIds(state, myRole);

  PER_PLAYER_FIELDS.forEach(field => {
    const value = state[`local${field}`];
    if (value !== undefined) patch[`${myRole}${field}`] = value;
  });
  patch[`${myRole}HandCount`] = Array.isArray(state.localHand) ? state.localHand.length : 0;
  patch[`${myRole}DeckCount`] = Array.isArray(state.localDeck) ? state.localDeck.length : 0;

  if (hasAuthority) {
    PER_PLAYER_FIELDS.forEach(field => {
      const value = state[`rival${field}`];
      if (value !== undefined) patch[`${rivalRole}${field}`] = value;
    });
    patch[`${rivalRole}HandCount`] = Array.isArray(state.rivalHand) ? state.rivalHand.length : 0;
    patch[`${rivalRole}DeckCount`] = Array.isArray(state.rivalDeck) ? state.rivalDeck.length : 0;
  }

  SHARED_FIELDS.forEach(field => {
    if (field === 'activeEffects') {
      // 23.9.3: `local/rival` es perspectiva del navegador, no identidad wire. Conservamos
      // targetPlayer por compatibilidad diagnóstica, pero targetRole es la autoridad canónica.
      patch.activeEffects = (Array.isArray(state.activeEffects) ? state.activeEffects : []).map(effect => ({
        ...effect,
        targetRole: effect?.targetPlayer === 'local' ? myRole
          : effect?.targetPlayer === 'rival' ? rivalRole
          : (effect?.targetRole || null)
      }));
      return;
    }
    if (field === 'priorityActivity') {
      // Sólo el dueño actual de la prioridad deriva actividad desde sus flags privados.
      // El otro cliente conserva el valor sincronizado para no borrar un "está pagando" remoto.
      patch.priorityActivity = state.priorityPlayer === 'local'
        ? deriveLocalPriorityActivity(state)
        : (state.priorityActivity || null);
      return;
    }
    if (state[field] !== undefined) patch[field] = state[field];
  });
  patch.activePlayer = state.activePlayer === 'local' ? myRole : rivalRole;
  patch.priorityPlayer = state.priorityPlayer === 'local' ? myRole : rivalRole;
  patch.abandonedBy = state.abandonedBy === 'local' ? myRole : (state.abandonedBy === 'rival' ? rivalRole : null);
  patch.stackState = serializeStackForPublic(stack, state, myRole);

  return patch;
}

export function extractRivalStateFromPublicDoc(publicDoc, myRole, touchedKeys = null) {
  const rivalRole = otherRole(myRole);
  const result = {};

  PER_PLAYER_FIELDS.forEach(field => {
    const key = `${rivalRole}${field}`;
    if (touchedAllows(touchedKeys, key) && hasOwn(publicDoc, key) && publicDoc[key] !== undefined) result[`rival${field}`] = publicDoc[key];
  });

  const handKey = `${rivalRole}HandCount`;
  const deckKey = `${rivalRole}DeckCount`;
  if (touchedAllows(touchedKeys, handKey) && hasOwn(publicDoc, handKey)) result.rivalHand = Array(Math.max(0, Number(publicDoc[handKey]) || 0)).fill(null);
  if (touchedAllows(touchedKeys, deckKey) && hasOwn(publicDoc, deckKey)) result.rivalDeck = Array(Math.max(0, Number(publicDoc[deckKey]) || 0)).fill(null);

  return result;
}

export function extractMyStateFromPublicDoc(publicDoc, myRole, touchedKeys = null) {
  const result = {};
  PER_PLAYER_FIELDS.forEach(field => {
    const key = `${myRole}${field}`;
    if (touchedAllows(touchedKeys, key) && hasOwn(publicDoc, key) && publicDoc[key] !== undefined) result[`local${field}`] = publicDoc[key];
  });
  return result;
}

export function extractSharedStateFromPublicDoc(publicDoc, myRole, touchedKeys = null) {
  const result = {};
  SHARED_FIELDS.forEach(field => {
    if (!touchedAllows(touchedKeys, field) || !hasOwn(publicDoc, field) || publicDoc[field] === undefined) return;
    if (field === 'activeEffects') {
      result.activeEffects = (Array.isArray(publicDoc.activeEffects) ? publicDoc.activeEffects : []).map(effect => {
        if (!effect?.targetRole) return effect; // compatibilidad con snapshots pre-23.9.3
        return {
          ...effect,
          targetPlayer: effect.targetRole === myRole ? 'local' : effect.targetRole === otherRole(myRole) ? 'rival' : effect.targetPlayer
        };
      });
      return;
    }
    result[field] = publicDoc[field];
  });
  if (touchedAllows(touchedKeys, 'activePlayer') && hasOwn(publicDoc, 'activePlayer')) result.activePlayer = publicDoc.activePlayer === myRole ? 'local' : 'rival';
  if (touchedAllows(touchedKeys, 'priorityPlayer') && hasOwn(publicDoc, 'priorityPlayer')) result.priorityPlayer = publicDoc.priorityPlayer === myRole ? 'local' : 'rival';
  if (touchedAllows(touchedKeys, 'abandonedBy') && hasOwn(publicDoc, 'abandonedBy')) {
    result.abandonedBy = publicDoc.abandonedBy === myRole ? 'local' : (publicDoc.abandonedBy === otherRole(myRole) ? 'rival' : null);
  }
  return result;
}

export function buildMyPrivatePatch(state) {
  return {
    hand: Array.isArray(state.localHand) ? state.localHand : [],
    deck: Array.isArray(state.localDeck) ? state.localDeck : []
  };
}

// 23.7.2: re-adquiere referencias VIVAS justo antes de render/resolución. Un Stack item
// puede sobrevivir a una rehidratación legítima de Support/Combat; nunca debe depender de
// que el objeto JS original siga siendo el mismo.
export function refreshStackItemBoardRefs(item, state, myRole) {
  if (!item || !state || !myRole) return item;
  if (item._sourceItemRef) item.sourceItem = deserializeBoardItemRef(item._sourceItemRef, state, myRole);
  if (item.source?._sourceItemRef) item.source.sourceItem = deserializeBoardItemRef(item.source._sourceItemRef, state, myRole);
  if (item.source?._eventItemRef) item.source.eventItem = deserializeBoardItemRef(item.source._eventItemRef, state, myRole);
  if (item.targetObj?._syncDescriptor) item.targetObj = deserializeStackTarget(item.targetObj._syncDescriptor, state, myRole);
  if (item.targetObj?.type === 'multi' && Array.isArray(item.targetObj.targets)) {
    item.targetObj.targets = item.targetObj.targets.map(target =>
      target?._syncDescriptor ? deserializeStackTarget(target._syncDescriptor, state, myRole) : target
    );
  }
  return item;
}

export function refreshStackBoardRefs(stack, state, myRole) {
  (Array.isArray(stack) ? stack : []).forEach(item => refreshStackItemBoardRefs(item, state, myRole));
  return stack;
}

// 23.7.2: Equipment.attachedTo también cruza Firestore como un objeto serializado y,
// por definición, vuelve como OTRA referencia JS. Re-enlazamos cada Equipo con la criatura
// viva usando _syncObjectId. Si la criatura ya no existe, el Equipo queda desadjuntado.
export function relinkEquipmentAttachments(state) {
  if (!state) return state;
  const relink = (supportZone, combatZone) => {
    const support = Array.isArray(supportZone) ? supportZone : [];
    const combat = Array.isArray(combatZone) ? combatZone : [];
    support.forEach(item => {
      if (!item?.attachedTo) return;
      const targetId = item.attachedTo?._syncObjectId || item.attachedTo?._syncDescriptor?.syncObjectId || null;
      if (!targetId) return;
      item.attachedTo = combat.find(unit => unit?._syncObjectId === targetId) || null;
    });
  };
  relink(state.localSupport, state.localCombat);
  relink(state.rivalSupport, state.rivalCombat);
  return state;
}
