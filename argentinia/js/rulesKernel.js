import { isCreaturePermanent } from './permanentTypes.js';
// Argentinia 23.15.2.1 — Rules Kernel / State-Based Actions 2.0 hardening
// ---------------------------------------------------------------------------
// Este módulo NO muta el juego. Toma un snapshot del estado público de battlefield y
// devuelve todas las acciones basadas en estado aplicables en ESE chequeo. main.js aplica
// el lote simultáneamente, repite hasta estabilizar y recién entonces libera disparos.
// Mantener la detección pura evita que cada resolver invente su propia versión de 704.x.

export const SBA_MAX_PASSES = 32;

export function isLegendaryPermanentCard(card) {
  if (!card || typeof card !== 'object') return false;
  const type = String(card.type || '');
  const text = String(card.text || '');
  const supertypes = Array.isArray(card.supertypes) ? card.supertypes.join(' ') : String(card.supertype || '');
  return card.legendary === true || /Legendari[oa]/i.test(type) || /Legendari[oa]/i.test(supertypes) || /Planeswalker\s+Legendari[oa]/i.test(text);
}

export function legendGroupKey(isLocal, cardName) {
  return `${isLocal ? 'local' : 'rival'}::${String(cardName || '').trim().toLocaleLowerCase('es')}`;
}

export function battlefieldEntriesForSide(state, isLocal) {
  const specs = isLocal
    ? [
        ['combat', state.localCombat],
        ['support', state.localSupport],
        ['land', state.localLands],
        ['planeswalker', state.localPlaneswalkers]
      ]
    : [
        ['combat', state.rivalCombat],
        ['support', state.rivalSupport],
        ['land', state.rivalLands],
        ['planeswalker', state.rivalPlaneswalkers]
      ];
  const entries = [];
  for (const [zone, array] of specs) {
    if (!Array.isArray(array)) continue;
    array.forEach((item, index) => {
      if (item?.card) entries.push({ item, card: item.card, zone, index, isLocal });
    });
  }
  return entries;
}

export function collectLegendGroups(state) {
  const groups = [];
  for (const isLocal of [true, false]) {
    const byName = new Map();
    for (const entry of battlefieldEntriesForSide(state, isLocal)) {
      if (!isLegendaryPermanentCard(entry.card)) continue;
      const name = String(entry.card.name || '').trim();
      if (!name) continue;
      const key = legendGroupKey(isLocal, name);
      if (!byName.has(key)) byName.set(key, { key, name, isLocal, entries: [] });
      byName.get(key).entries.push(entry);
    }
    for (const group of byName.values()) {
      if (group.entries.length > 1) groups.push(group);
    }
  }
  return groups;
}

export function collectCreatureStateActions(state, { getEffectiveToughness, hasKeyword } = {}) {
  const out = [];
  const scan = (zone, isLocal) => {
    if (!Array.isArray(zone)) return;
    for (const item of zone) {
      if (!item?.card) continue;
      const toughness = Number(getEffectiveToughness?.(item) ?? item.card.toughness ?? 0);
      const damage = Math.max(0, Number(item.damageTaken || 0));
      const indestructible = !!hasKeyword?.(item, 'indestructible');
      const zeroToughness = toughness <= 0;
      const lethalDamage = !indestructible && toughness > 0 && damage > 0 && damage >= toughness;
      const deathtouchDamage = !indestructible && toughness > 0 && damage > 0 && !!item.tookDeathtouch;
      if (zeroToughness || lethalDamage || deathtouchDamage) {
        out.push({
          item, isLocal, zone: 'combat', toughness, damage,
          reason: zeroToughness ? 'zero_toughness' : (deathtouchDamage ? 'deathtouch' : 'lethal_damage')
        });
      }
    }
  };
  scan(state.localCombat, true);
  scan(state.rivalCombat, false);
  return out;
}

export function collectPlaneswalkerStateActions(state) {
  const out = [];
  const scan = (zone, isLocal) => {
    if (!Array.isArray(zone)) return;
    for (const item of zone) {
      if (item?.card && Number(item.loyalty || 0) <= 0) out.push({ item, isLocal, zone: 'planeswalker', reason: 'zero_loyalty' });
    }
  };
  scan(state.localPlaneswalkers, true);
  scan(state.rivalPlaneswalkers, false);
  return out;
}

export function collectCounterCancellationActions(state) {
  const out = [];
  const scan = (zone, isLocal, zoneName) => {
    if (!Array.isArray(zone)) return;
    for (const item of zone) {
      const plus = Math.max(0, Number(item?.counters?.plusOne || 0));
      const minus = Math.max(0, Number(item?.counters?.minusOne || 0));
      const amount = Math.min(plus, minus);
      if (amount > 0) out.push({ item, isLocal, zone:zoneName, amount, reason: 'counter_annihilation' });
    }
  };
  for (const [isLocal, specs] of [
    [true, [['combat',state.localCombat],['support',state.localSupport],['land',state.localLands],['planeswalker',state.localPlaneswalkers]]],
    [false,[['combat',state.rivalCombat],['support',state.rivalSupport],['land',state.rivalLands],['planeswalker',state.rivalPlaneswalkers]]]
  ]) specs.forEach(([name,zone]) => scan(zone,isLocal,name));
  return out;
}

// Compatibilidad/recuperación: desde hace varias versiones los movimientos normales ya
// impiden persistir fichas fuera del battlefield. Este barrido convierte esa garantía en
// una SBA explícita y también limpia snapshots legacy/F5 que pudieran contenerlas.
export function collectTokenCeaseActions(state) {
  const out = [];
  const zones = [
    ['localGraveyard', state.localGraveyard], ['rivalGraveyard', state.rivalGraveyard],
    ['localExile', state.localExile], ['rivalExile', state.rivalExile],
    ['localHand', state.localHand], ['rivalHand', state.rivalHand],
    ['localDeck', state.localDeck], ['rivalDeck', state.rivalDeck]
  ];
  for (const [zoneName, zone] of zones) {
    if (!Array.isArray(zone)) continue;
    zone.forEach((card, index) => {
      if (card?.isToken) out.push({ zone, zoneName, card, index, reason: 'token_ceases' });
    });
  }
  return out;
}


export function collectAttachmentStateActions(state, { getProtectionMatch } = {}) {
  const out = [];
  const allBattlefield = [
    ...(state.localCombat||[]),...(state.rivalCombat||[]),
    ...(state.localSupport||[]),...(state.rivalSupport||[]),
    ...(state.localLands||[]),...(state.rivalLands||[]),
    ...(state.localPlaneswalkers||[]),...(state.rivalPlaneswalkers||[])
  ];
  const battlefieldSet=new Set(allBattlefield);
  const scanAuras = (zone, isLocal) => {
    if (!Array.isArray(zone)) return;
    for (const unit of zone) {
      if (!unit?.card || !Array.isArray(unit.auras) || unit.auras.length === 0) continue;
      for (const auraCard of unit.auras) {
        const illegalColor = getProtectionMatch?.(unit, auraCard?.colors || []);
        const illegalTargetType = !isCreaturePermanent(unit); // todas las Auras actuales encantan criatura
        if (illegalColor || illegalTargetType) out.push({ kind:'aura', unit, auraCard, isLocal, illegalColor, illegalTargetType, reason:'illegal_attachment' });
      }
    }
  };
  const scanEquipment = (zone, isLocal) => {
    if (!Array.isArray(zone)) return;
    for (const item of zone) {
      if (!item?.card || !item.attachedTo) continue;
      const targetExists=battlefieldSet.has(item.attachedTo);
      const illegalColor = targetExists ? getProtectionMatch?.(item.attachedTo, item.card?.colors || []) : null;
      const illegalTargetType = !targetExists || !isCreaturePermanent(item.attachedTo);
      if (illegalColor || illegalTargetType) out.push({ kind:'equipment', item, target:item.attachedTo, isLocal, illegalColor, illegalTargetType, reason:'illegal_attachment' });
    }
  };
  for(const [zone,isLocal] of [
    [state.localCombat,true],[state.rivalCombat,false],[state.localSupport,true],[state.rivalSupport,false],
    [state.localLands,true],[state.rivalLands,false],[state.localPlaneswalkers,true],[state.rivalPlaneswalkers,false]
  ]) scanAuras(zone,isLocal);
  scanEquipment(state.localSupport, true);
  scanEquipment(state.rivalSupport, false);
  return out;
}

export function evaluateStateBasedActions(state, helpers = {}) {
  return {
    legends: collectLegendGroups(state),
    creatures: collectCreatureStateActions(state, helpers),
    planeswalkers: collectPlaneswalkerStateActions(state),
    counterCancellations: collectCounterCancellationActions(state),
    tokenCeases: collectTokenCeaseActions(state),
    attachments: collectAttachmentStateActions(state, helpers)
  };
}

export function hasMechanicalStateActions(snapshot) {
  if (!snapshot) return false;
  return ['creatures', 'planeswalkers', 'counterCancellations', 'tokenCeases', 'attachments']
    .some(key => Array.isArray(snapshot[key]) && snapshot[key].length > 0);
}
