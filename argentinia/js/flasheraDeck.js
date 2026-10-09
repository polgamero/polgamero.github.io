// Flasheras Stage30 — read-only, canonical inventory/deck presentation contracts.
// Physical state and cosmetic finish remain orthogonal. Never mint cards in this module.
import { parseCardVariantId, cardVariantId } from './cardVariant.js';
import { reconcileFlasheraCopies } from './flasheraContract.js';

export function flasheraTotalForBase(profile = {}, baseId = '') {
  return physicalCardVariants(profile,baseId).reduce((n,row)=>n+(row.flashera?row.count:0),0);
}
export function physicalCardVariants(profile = {}, baseId = '', { virtualNormalBaseCount = 0 } = {}) {
  const result = [];
  const owned = (Array.isArray(profile?.collection) ? profile.collection : []).reduce((n,id) => n + (id === baseId ? 1 : 0),0);
  const enhancement = !!profile?.enhancements?.[baseId];
  const stageRaw = profile?.evolutions?.[baseId];
  const stage = Math.max(0,Math.min(2,Math.floor(Number(stageRaw?.stage ?? stageRaw) || 0)));
  // Reserve enhanced first, then evolved, then ordinary. Never represent two
  // distinct special cards if the legacy collection contains only one physical copy.
  const enhancedCapacity = enhancement && owned > 0 ? 1 : 0;
  const evolvedCapacity = stage > 0 && owned > enhancedCapacity ? 1 : 0;
  const states = {
    enhanced: enhancedCapacity,
    evo1: stage === 1 ? evolvedCapacity : 0,
    evo2: stage === 2 ? evolvedCapacity : 0,
    base: Math.max(0,owned - enhancedCapacity - evolvedCapacity)
  };
  const premium = reconcileFlasheraCopies(profile);
  for (const state of ['enhanced','evo1','evo2','base']) {
    const plainId = cardVariantId(baseId,{state});
    const foilId = cardVariantId(baseId,{state,flashera:true});
    if (!plainId || !foilId) continue;
    const count = states[state];
    const foilCount = Math.min(count,premium[plainId] || 0);
    let normalCount = count - foilCount;
    // Admin's historical virtual catalog is only NORMAL. No phantom premium grants.
    if (state === 'base' && virtualNormalBaseCount > 0) normalCount = Math.max(normalCount, Math.floor(virtualNormalBaseCount));
    if (normalCount > 0) result.push(Object.freeze({id:plainId,baseId,state,flashera:false,count:normalCount}));
    if (foilCount > 0) result.push(Object.freeze({id:foilId,baseId,state,flashera:true,count:foilCount}));
  }
  return result;
}
export function countDeckBaseCopies(deckCounts = {}, baseId = '') {
  let result = 0;
  for (const [rawId, count] of Object.entries(deckCounts || {})) {
    const parsed = parseCardVariantId(rawId);
    if (parsed.valid && parsed.baseId === baseId) result += Math.max(0, Math.floor(Number(count) || 0));
  }
  return result;
}
export function assertDeckFlasheraOwnership(profile = {}, cardIds = [], {allowVirtualAdminPool = false, maxCopiesPerCard = 4, isBasicLand = () => false} = {}) {
  if (!Array.isArray(cardIds)) throw new Error('Las cartas del mazo deben ser una lista.');
  const requested = new Map();
  const perBase = new Map();
  for (const id of cardIds) {
    const parsed = parseCardVariantId(id);
    if (!parsed.valid) throw new Error('El mazo contiene una variante de carta inválida.');
    requested.set(id, (requested.get(id) || 0) + 1);
    perBase.set(parsed.baseId, (perBase.get(parsed.baseId) || 0) + 1);
  }
  // The cosmetic finish does not reset the four-copy rule (except basic lands).
  for (const [baseId, count] of perBase) {
    if (!isBasicLand(baseId) && count > maxCopiesPerCard) {
      throw new Error(`No podés incluir más de ${maxCopiesPerCard} copias combinadas de ${baseId} (normal y Flashera).`);
    }
  }
  for (const [id, count] of requested) {
    const parsed = parseCardVariantId(id);
    const capacity = physicalCardVariants(profile, parsed.baseId).find(row=>row.id===id)?.count || 0;
    // Admin may use the virtual unmodified pool, but never a foil or other special slot.
    if (allowVirtualAdminPool && !parsed.flashera && parsed.state === 'base') continue;
    if (count > capacity) {
      const finish = parsed.flashera ? ' FLASHERA' : '';
      throw new Error(`No tenés ${count} copia(s) disponibles de ${parsed.baseId}${parsed.state === 'base' ? '' : ` (${parsed.state})`}${finish}. Máximo real: ${capacity}.`);
    }
  }
  if (!allowVirtualAdminPool) {
    const owned = new Map();
    for (const raw of profile?.collection || []) owned.set(String(raw), (owned.get(String(raw)) || 0) + 1);
    for (const [baseId, count] of perBase) {
      if (count > (owned.get(baseId) || 0)) throw new Error(`El mazo excede la cantidad física de ${baseId}.`);
    }
  }
  return true;
}
export function isFlasheraDeck(cardIds = []) {
  return Array.isArray(cardIds) && cardIds.some(id => parseCardVariantId(id).flashera);
}
