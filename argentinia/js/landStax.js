// js/landStax.js — Argentinia 23.14.6 · LAND 5 Tax & Stax Foundation
// Helpers puros para efectos continuos/disparados que modifican el uso de Tierras.
// No importa `state`: recibe el estado explícitamente para evitar un segundo motor/ciclo.

import { isLandPermanent, landMatchesFilter } from './permanentTypes.js';
import { landMatchesEffectiveFilter, landRulesTextSuppressed, getEffectiveLandManaAbility, getEffectiveLandActivatedAbilities } from './landCharacteristics.js';

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

export function cardStaticEffects(card) {
  if (!card) return [];
  return [card.staticEffect, ...(Array.isArray(card.staticEffects) ? card.staticEffects : [])].filter(Boolean);
}

function sourceEffectActive(item, effect) {
  if (!item || !effect) return false;
  if ((effect.whileSourceUntapped || effect.whileUntapped) && item.tapped) return false;
  return true;
}

export function scopeApplies(scope, sourceIsLocal, targetIsLocal) {
  const normalized = scope || 'all';
  if (normalized === 'all' || normalized === 'each') return true;
  if (normalized === 'own' || normalized === 'self') return sourceIsLocal === targetIsLocal;
  if (normalized === 'opponent' || normalized === 'opponents') return sourceIsLocal !== targetIsLocal;
  return false;
}

function filterLand(effect, land, state = null, targetIsLocal = true) {
  if (!effect?.landFilter) return true;
  return state ? landMatchesEffectiveFilter(state, land, targetIsLocal, effect.landFilter) : landMatchesFilter(land, effect.landFilter);
}


export function collectLandRuleEffects(state, effectTypes = null) {
  const wanted = effectTypes == null ? null : new Set(Array.isArray(effectTypes) ? effectTypes : [effectTypes]);
  const out = [];
  for (const { item, isLocal } of battlefieldEntries(state)) {
    // LAND 6: una Tierra cuyo rules text fue removido por una transformación continua
    // (Blood Moon-style) ya no aporta sus staticEffects impresos al battlefield.
    if (isLandPermanent(item) && landRulesTextSuppressed(state, item, isLocal)) continue;
    for (const effect of cardStaticEffects(item?.card)) {
      if (!sourceEffectActive(item, effect)) continue;
      if (wanted && !wanted.has(effect.type)) continue;
      out.push({ effect, sourceItem:item, sourceCard:item.card, sourceIsLocal:isLocal });
    }
  }
  return out;
}

// Root Maze / Thalia-style replacement layer. `forcedTapped` represents an instruction
// explícita del efecto que está poniendo la Tierra (ej. battlefield_tapped).
export function shouldLandEnterTapped(state, landOrCard, targetIsLocal, forcedTapped = false) {
  if (forcedTapped) return true;
  const card = landOrCard?.card || landOrCard || {};
  // LAND 6 / CR 305.7: si un efecto que fija un tipo básico (Blood Moon-style) ya
  // suprimió las habilidades impresas mientras la Tierra entra, su propio `entersTapped`
  // no puede aplicarse. Los replacement effects externos LAND 5 sí se evalúan después.
  if (card.entersTapped && !landRulesTextSuppressed(state, landOrCard, targetIsLocal)) return true;
  const rules = collectLandRuleEffects(state, ['lands_enter_tapped','land_enters_tapped']);
  return rules.some(({ effect, sourceIsLocal }) =>
    scopeApplies(effect.scope || 'all', sourceIsLocal, targetIsLocal) && filterLand(effect, landOrCard, state, targetIsLocal)
  );
}

// Winter Orb-style GLOBAL cap. Returns Infinity when normal untap applies; multiple caps
// combine by taking the strictest maximum. Card-specific / filtered prevention is handled
// separately by `isLandPreventedFromUntapping`, so effects such as "nonbasic lands don't
// untap" do not accidentally freeze every land the player controls.
export function getLandUntapLimit(state, targetIsLocal) {
  let limit = Infinity;
  const rules = collectLandRuleEffects(state, 'land_untap_limit');
  for (const { effect, sourceIsLocal } of rules) {
    if (!scopeApplies(effect.scope || 'all', sourceIsLocal, targetIsLocal)) continue;
    const max = Math.max(0, Math.floor(Number(effect.max ?? effect.amount ?? 1) || 0));
    limit = Math.min(limit, max);
  }
  return limit;
}

// Stasis / filtered-stax primitive. Supports `landFilter` (any/basic/nonbasic/subtype:X).
// A matching land remains tapped during the normal untap step; effects outside the untap
// step can still untap it unless a future card says otherwise.
export function isLandPreventedFromUntapping(state, landItem, targetIsLocal) {
  if (!isLandPermanent(landItem)) return false;
  const rules = collectLandRuleEffects(state, 'lands_dont_untap');
  return rules.some(({ effect, sourceIsLocal }) =>
    scopeApplies(effect.scope || 'all', sourceIsLocal, targetIsLocal) && filterLand(effect, landItem, state, targetIsLocal)
  );
}

function landTapSpecFromCard(card) {
  const direct = card?.landManaTrigger;
  const staticSpecs = cardStaticEffects(card)
    .filter(effect => effect?.type === 'land_mana_trigger')
    .map(effect => ({ ...effect, effect: effect.effect || effect.triggerEffect || null }));
  return [direct, ...staticSpecs].filter(Boolean);
}

function landManaBonusSpecs(card) {
  const direct = card?.landManaBonus;
  const staticSpecs = cardStaticEffects(card).filter(effect => effect?.type === 'land_mana_bonus');
  return [direct, ...staticSpecs].filter(Boolean);
}

// Manabarbs/Burning Earth-style normal triggers. These DO use the Stack; main.js decides
// whether to queue immediately or defer until casting/activation has finished.
export function getLandManaTriggerEntries(state, tapperIsLocal, landItem) {
  if (!isLandPermanent(landItem)) return [];
  const entries = [];
  for (const { item, isLocal:sourceIsLocal } of battlefieldEntries(state)) {
    for (const spec of landTapSpecFromCard(item?.card)) {
      if (!sourceEffectActive(item, spec)) continue;
      if (!scopeApplies(spec.scope || 'all', sourceIsLocal, tapperIsLocal)) continue;
      if (!filterLand(spec, landItem, state, tapperIsLocal)) continue;
      const effect = spec.effect || (spec.type && spec.type !== 'land_mana_trigger' ? spec : null);
      if (!effect?.type) continue;
      entries.push({
        effect,
        sourceCard:item.card,
        sourceItem:item,
        isLocal:sourceIsLocal,
        triggerType:'land_tapped_for_mana',
        targetObj: spec.target === 'none' ? null : { type:'player', isLocal:tapperIsLocal },
        eventCard:landItem.card,
        eventItem:landItem
      });
    }
  }
  return entries;
}

// Mana Flare-style triggered mana abilities. Como pueden agregar maná y disparan desde una
// mana ability, se resuelven inmediatamente sin Stack (CR 605.1b/605.4a).
export function getLandManaBonuses(state, tapperIsLocal, landItem, producedType) {
  if (!isLandPermanent(landItem)) return [];
  const out = [];
  for (const { item, isLocal:sourceIsLocal } of battlefieldEntries(state)) {
    for (const spec of landManaBonusSpecs(item?.card)) {
      if (!sourceEffectActive(item, spec)) continue;
      if (!scopeApplies(spec.scope || 'all', sourceIsLocal, tapperIsLocal)) continue;
      if (!filterLand(spec, landItem, state, tapperIsLocal)) continue;
      const type = spec.mode === 'fixed' ? spec.produces : producedType;
      if (!['W','U','B','R','G','C'].includes(type)) continue;
      out.push({ sourceItem:item, sourceCard:item.card, sourceIsLocal, type, amount:Math.max(1, Math.floor(Number(spec.amount) || 1)) });
    }
  }
  return out;
}

export function scoreLandForUntap(item, state = null, isLocal = true) {
  const card = item?.card || {};
  let score = 10;
  const mana = state ? getEffectiveLandManaAbility(state, item, isLocal) : null;
  if (mana || card.manaAbility || card.produces || card.producesOptions) score += 30;
  const optionCount = mana?.options?.length ?? (Array.isArray(card.producesOptions) ? card.producesOptions.length : (card.produces ? 1 : 0));
  score += optionCount * 4;
  const abilities = state ? getEffectiveLandActivatedAbilities(state, item, isLocal) : [];
  if (abilities.length || card.activatedAbility || (Array.isArray(card.activatedAbilities) && card.activatedAbilities.length)) score += 15;
  if (!(state ? landMatchesEffectiveFilter(state, item, isLocal, 'basic') : landMatchesFilter(item, 'basic'))) score += 8;
  return score;
}
