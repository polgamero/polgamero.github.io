// js/landCharacteristics.js — Argentinia 23.14.7 · LAND 6 Continuous Land Transformation
// Capa de características EFECTIVAS de Tierras. Nunca muta el JSON/base de la carta:
// calcula subtipos, texto/abilities suprimidas y producción de maná según efectos continuos
// presentes en battlefield. La separación impresa/efectiva permite Blood Moon-style sin
// destruir la identidad original necesaria cuando el efecto abandona el campo.

import { isLandPermanent, isBasicLandCard, cardTypeString } from './permanentTypes.js';
import { getActivatedAbilities } from './utils.js';
import { normalizeManaAbility } from './manaSources.js';

export const BASIC_LAND_MANA = Object.freeze({
  'Planicie':'W', 'Plains':'W',
  'Agua':'U', 'Island':'U',
  'Pantano':'B', 'Swamp':'B',
  'Montaña':'R', 'Mountain':'R',
  'Bosque':'G', 'Forest':'G'
});

const CHARACTERISTIC_EFFECT_TYPES = new Set([
  'land_type_set',       // Blood Moon-style: reemplaza subtipos de Tierra
  'land_type_add',       // Urborg-style: agrega subtipos sin borrar los anteriores
  'land_abilities_remove',
  'land_mana_override',
  'land_mana_add'
]);

function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

export function printedLandSubtypes(itemOrCard) {
  const type = cardTypeString(itemOrCard);
  const dash = type.match(/[—–-]\s*(.+)$/);
  if (!dash) return [];
  return uniq(String(dash[1] || '').split(/\s+/).map(s => s.trim()).filter(Boolean));
}

export function landTypePrefix(itemOrCard) {
  const type = cardTypeString(itemOrCard);
  const idx = type.search(/[—–-]/);
  return (idx >= 0 ? type.slice(0, idx) : type).trim() || 'Tierra';
}

function battlefieldEntries(state) {
  if (!state) return [];
  return [
    ...(state.localCombat || []).map(item => ({ item, isLocal:true })),
    ...(state.localSupport || []).map(item => ({ item, isLocal:true })),
    ...(state.localLands || []).map(item => ({ item, isLocal:true })),
    ...(state.localPlaneswalkers || []).map(item => ({ item, isLocal:true })),
    ...(state.rivalCombat || []).map(item => ({ item, isLocal:false })),
    ...(state.rivalSupport || []).map(item => ({ item, isLocal:false })),
    ...(state.rivalLands || []).map(item => ({ item, isLocal:false })),
    ...(state.rivalPlaneswalkers || []).map(item => ({ item, isLocal:false }))
  ];
}

function staticEffects(card) {
  if (!card) return [];
  return [card.staticEffect, ...(Array.isArray(card.staticEffects) ? card.staticEffects : [])].filter(Boolean);
}

function sourceEffectActive(item, effect) {
  if (!item || !effect) return false;
  if ((effect.whileSourceUntapped || effect.whileUntapped) && item.tapped) return false;
  return true;
}

function scopeApplies(scope, sourceIsLocal, targetIsLocal) {
  const normalized = scope || 'all';
  if (normalized === 'all' || normalized === 'each') return true;
  if (normalized === 'own' || normalized === 'self') return sourceIsLocal === targetIsLocal;
  if (normalized === 'opponent' || normalized === 'opponents') return sourceIsLocal !== targetIsLocal;
  return false;
}

function rawFilterMatches(itemOrCard, filter = 'any', currentSubtypes = null) {
  if (!isLandPermanent(itemOrCard)) return false;
  if (!filter || filter === 'any') return true;
  if (filter === 'basic') return isBasicLandCard(itemOrCard);
  if (filter === 'nonbasic') return !isBasicLandCard(itemOrCard);
  if (String(filter).startsWith('subtype:')) {
    const wanted = String(filter).slice(8).trim().toLowerCase();
    const subs = currentSubtypes || printedLandSubtypes(itemOrCard);
    return subs.some(s => String(s).toLowerCase() === wanted);
  }
  return false;
}

function effectSetSubtypes(effect) {
  const raw = effect?.setLandTypes ?? effect?.landTypes ?? effect?.subtypes ?? effect?.subtype ?? null;
  return uniq(Array.isArray(raw) ? raw : (raw ? [raw] : []));
}

function effectAddSubtypes(effect) {
  const raw = effect?.addLandTypes ?? effect?.landTypes ?? effect?.subtypes ?? effect?.subtype ?? null;
  return uniq(Array.isArray(raw) ? raw : (raw ? [raw] : []));
}

function isBasicLandSubtype(name) {
  return Object.prototype.hasOwnProperty.call(BASIC_LAND_MANA, String(name || ''));
}

function collectRawCharacteristicEffects(state) {
  const out = [];
  for (const { item, isLocal } of battlefieldEntries(state)) {
    for (const effect of staticEffects(item?.card)) {
      if (!CHARACTERISTIC_EFFECT_TYPES.has(effect?.type)) continue;
      if (!sourceEffectActive(item, effect)) continue;
      out.push({ effect, sourceItem:item, sourceCard:item.card, sourceIsLocal:isLocal });
    }
  }
  return out;
}

// Dependency mínimo pero importante: si una Tierra no básica que provee un efecto continuo
// pierde su texto por OTRO Blood Moon-style, su efecto impreso deja de ser fuente activa.
// Esto cubre el caso clásico Blood Moon vs. una utility land con efecto estático sin inventar
// una implementación parcial de las 7 capas completas para tipos de carta que Argentinia aún
// no modela. Los efectos no-Tierra nunca son suprimidos por esta ruta.
function sourcePrintedRulesSuppressedByOther(rawEffects, sourceItem, sourceIsLocal) {
  if (!isLandPermanent(sourceItem)) return false;
  for (const entry of rawEffects) {
    if (entry.sourceItem === sourceItem) continue;
    const e = entry.effect;
    if (!scopeApplies(e.scope || 'all', entry.sourceIsLocal, sourceIsLocal)) continue;
    if (!rawFilterMatches(sourceItem, e.landFilter || 'any')) continue;
    if (e.type === 'land_abilities_remove') return true;
    if (e.type === 'land_type_set') {
      const setTypes = effectSetSubtypes(e);
      if (e.losePrintedAbilities === true || setTypes.some(isBasicLandSubtype)) return true;
    }
  }
  return false;
}

export function collectActiveLandCharacteristicEffects(state) {
  const raw = collectRawCharacteristicEffects(state);
  return raw.filter(entry => !sourcePrintedRulesSuppressedByOther(raw, entry.sourceItem, entry.sourceIsLocal));
}

function normalizeManaOverride(effect) {
  if (!effect) return null;
  const raw = effect.manaAbility || effect;
  const optsRaw = raw.producesOptions ?? raw.produces ?? null;
  const options = uniq(Array.isArray(optsRaw) ? optsRaw : (optsRaw ? [optsRaw] : [])).filter(v => ['W','U','B','R','G','C'].includes(v));
  if (!options.length) return null;
  return {
    options,
    amount: Math.max(1, Math.floor(Number(raw.amount) || 1)),
    requiresTap: raw.requiresTap !== undefined ? !!raw.requiresTap : true,
    sacrificeSelf: raw.sacrificeSelf === true,
    sourceSchema:'land_continuous_override'
  };
}

export function getEffectiveLandCharacteristics(state, itemOrCard, targetIsLocal = true) {
  const card = itemOrCard?.card || itemOrCard || {};
  const isLand = isLandPermanent(itemOrCard);
  const printedSubtypes = isLand ? printedLandSubtypes(itemOrCard) : [];
  const result = {
    isLand,
    isBasic: isLand && isBasicLandCard(itemOrCard),
    isNonbasic: isLand && !isBasicLandCard(itemOrCard),
    printedSubtypes,
    subtypes:[...printedSubtypes],
    suppressPrintedAbilities:false,
    manaOverride:null,
    manaAdds:[],
    appliedEffects:[]
  };
  if (!isLand || !state) return result;

  for (const entry of collectActiveLandCharacteristicEffects(state)) {
    const effect = entry.effect;
    if (!scopeApplies(effect.scope || 'all', entry.sourceIsLocal, targetIsLocal)) continue;
    if (!rawFilterMatches(itemOrCard, effect.landFilter || 'any', result.subtypes)) continue;

    if (effect.type === 'land_type_set') {
      const setTypes = effectSetSubtypes(effect);
      if (!setTypes.length) continue;
      result.subtypes = [...setTypes];
      // CR 305.7: fijar uno o más tipos básicos de Tierra borra los tipos de Tierra previos
      // y las habilidades generadas por su rules text, aunque el efecto no lo repita.
      if (effect.losePrintedAbilities === true || setTypes.some(isBasicLandSubtype)) result.suppressPrintedAbilities = true;
      result.appliedEffects.push(entry);
      continue;
    }
    if (effect.type === 'land_type_add') {
      const addTypes = effectAddSubtypes(effect);
      result.subtypes = uniq([...result.subtypes, ...addTypes]);
      result.appliedEffects.push(entry);
      continue;
    }
    if (effect.type === 'land_abilities_remove') {
      result.suppressPrintedAbilities = true;
      result.appliedEffects.push(entry);
      continue;
    }
    if (effect.type === 'land_mana_override') {
      result.manaOverride = normalizeManaOverride(effect);
      result.appliedEffects.push(entry);
      continue;
    }
    if (effect.type === 'land_mana_add') {
      const add = normalizeManaOverride(effect);
      if (add) result.manaAdds.push(add);
      result.appliedEffects.push(entry);
    }
  }

  return result;
}

export function landRulesTextSuppressed(state, itemOrCard, targetIsLocal = true) {
  return getEffectiveLandCharacteristics(state, itemOrCard, targetIsLocal).suppressPrintedAbilities;
}

export function landMatchesEffectiveFilter(state, itemOrCard, targetIsLocal, filter = 'any') {
  const ch = getEffectiveLandCharacteristics(state, itemOrCard, targetIsLocal);
  if (!ch.isLand) return false;
  if (!filter || filter === 'any') return true;
  if (filter === 'basic') return ch.isBasic;
  if (filter === 'nonbasic') return ch.isNonbasic;
  if (String(filter).startsWith('subtype:')) {
    const wanted = String(filter).slice(8).trim().toLowerCase();
    return ch.subtypes.some(s => String(s).toLowerCase() === wanted);
  }
  return false;
}

export function getEffectiveLandTypeLine(state, itemOrCard, targetIsLocal = true) {
  const ch = getEffectiveLandCharacteristics(state, itemOrCard, targetIsLocal);
  if (!ch.isLand || !ch.appliedEffects.length) return cardTypeString(itemOrCard);
  const prefix = landTypePrefix(itemOrCard);
  return ch.subtypes.length ? `${prefix} — ${ch.subtypes.join(' ')}` : prefix;
}

function intrinsicManaOptions(subtypes) {
  return uniq((subtypes || []).map(t => BASIC_LAND_MANA[t]).filter(Boolean));
}

export function getEffectiveLandManaAbility(state, itemOrCard, targetIsLocal = true, printedAbility = undefined) {
  const card = itemOrCard?.card || itemOrCard || {};
  const base = printedAbility === undefined ? normalizeManaAbility(card) : printedAbility;
  const ch = getEffectiveLandCharacteristics(state, itemOrCard, targetIsLocal);
  if (!ch.isLand) return base;
  if (ch.manaOverride) return { ...ch.manaOverride };

  const intrinsic = intrinsicManaOptions(ch.subtypes);
  if (ch.suppressPrintedAbilities) {
    if (!intrinsic.length) return null;
    return { options:intrinsic, amount:1, requiresTap:true, sacrificeSelf:false, sourceSchema:'intrinsic_basic_land_type' };
  }

  // Un tipo básico AGREGADO concede su habilidad de maná intrínseca sin borrar el texto.
  // Nuestro schema actual representa las habilidades {T}:1 de colores distintos como una
  // única elección de color, equivalente mientras todas produzcan exactamente una unidad.
  let out = base ? { ...base, options:[...(base.options || [])] } : null;
  if (intrinsic.length) {
    if (!out) out = { options:intrinsic, amount:1, requiresTap:true, sacrificeSelf:false, sourceSchema:'intrinsic_basic_land_type' };
    else if (out.amount === 1 && out.requiresTap && !out.sacrificeSelf) out.options = uniq([...out.options, ...intrinsic]);
  }
  for (const add of ch.manaAdds) {
    if (!out) out = { ...add, options:[...add.options] };
    else if (out.amount === add.amount && out.requiresTap === add.requiresTap && out.sacrificeSelf === add.sacrificeSelf) out.options = uniq([...out.options, ...add.options]);
  }
  return out;
}

export function getEffectiveLandActivatedAbilities(state, itemOrCard, targetIsLocal = true) {
  if (!isLandPermanent(itemOrCard)) return getActivatedAbilities(itemOrCard?.card || itemOrCard);
  if (landRulesTextSuppressed(state, itemOrCard, targetIsLocal)) return [];
  return getActivatedAbilities(itemOrCard?.card || itemOrCard);
}

export function getEffectiveLandPrintedKeywords(state, itemOrCard, targetIsLocal = true) {
  const card = itemOrCard?.card || itemOrCard || {};
  if (isLandPermanent(itemOrCard) && landRulesTextSuppressed(state, itemOrCard, targetIsLocal)) return [];
  return Array.isArray(card.keywords) ? card.keywords : [];
}

export function describeLandTransformation(state, itemOrCard, targetIsLocal = true) {
  const ch = getEffectiveLandCharacteristics(state, itemOrCard, targetIsLocal);
  if (!ch.isLand || !ch.appliedEffects.length) return null;
  return {
    typeLine:getEffectiveLandTypeLine(state, itemOrCard, targetIsLocal),
    subtypes:[...ch.subtypes],
    printedAbilitiesSuppressed:ch.suppressPrintedAbilities,
    manaAbility:getEffectiveLandManaAbility(state, itemOrCard, targetIsLocal),
    sourceNames:uniq(ch.appliedEffects.map(e => e.sourceCard?.name).filter(Boolean))
  };
}
