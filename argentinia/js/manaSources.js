// js/manaSources.js — Argentinia 23.14.5 · LAND 4 Mana Source Generalization
// Normaliza fuentes de maná de cualquier tipo de permanente sobre el Mana Pool de LAND 0.
// Compatibilidad total con schema legacy (`produces`, `producesOptions`, `manaAmount`,
// `sacrificeOnTap`) y soporte explícito de mana dorks / Lotus-style mediante `manaAbility`.

export const MANA_SOURCE_TYPES = Object.freeze(['W','U','B','R','G','C']);

function uniqMana(values) {
  return [...new Set((values || []).filter(v => MANA_SOURCE_TYPES.includes(v)))];
}

export function normalizeManaAbility(card) {
  if (!card) return null;
  const explicit = card.manaAbility && typeof card.manaAbility === 'object' ? card.manaAbility : null;
  const options = uniqMana(
    explicit
      ? (Array.isArray(explicit.producesOptions) ? explicit.producesOptions : (Array.isArray(explicit.produces) ? explicit.produces : [explicit.produces]))
      : (Array.isArray(card.producesOptions) ? card.producesOptions : [card.produces])
  );
  if (!options.length) return null;
  const amount = Math.max(1, Math.floor(Number(explicit?.amount ?? card.manaAmount) || 1));
  return {
    options,
    amount,
    // Legacy mana rocks/lands always used tap. Explicit manaAbility may opt out (Lotus Petal-style).
    requiresTap: explicit?.requiresTap !== undefined ? !!explicit.requiresTap : true,
    sacrificeSelf: explicit?.sacrificeSelf !== undefined ? !!explicit.sacrificeSelf : !!card.sacrificeOnTap,
    sourceSchema: explicit ? 'manaAbility' : 'legacy'
  };
}

export function isManaSourceCard(card) { return !!normalizeManaAbility(card); }
export function getManaSourceOptions(card) { return normalizeManaAbility(card)?.options || []; }
export function getManaSourceAmount(card) { return normalizeManaAbility(card)?.amount || 0; }
export function manaSourceRequiresTap(card) { return normalizeManaAbility(card)?.requiresTap ?? false; }
export function manaSourceSacrificesSelf(card) { return normalizeManaAbility(card)?.sacrificeSelf ?? false; }

export function isCreatureCardLike(itemOrCard) {
  const card = itemOrCard?.card || itemOrCard || {};
  return card.power !== undefined || String(card.type || '').includes('Criatura');
}

export function canActivateManaSourcePermanent(item, { hasHaste = false, ability: abilityOverride = undefined } = {}) {
  if (!item?.card) return false;
  const ability = abilityOverride === undefined ? normalizeManaAbility(item.card) : abilityOverride;
  if (!ability) return false;
  if (ability.requiresTap && item.tapped) return false;
  // CR 302.6: summoning sickness only blocks {T}/{Q} costs of creatures.
  if (ability.requiresTap && isCreatureCardLike(item) && item.summoningSickness && !hasHaste) return false;
  return true;
}
