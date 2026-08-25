// js/permanentTypes.js — 23.14.3 LAND 2 (base LAND 1 preservada)
// Identidad efectiva de permanentes independiente de la zona visual. Una man-land animada
// sigue siendo Tierra aunque se muestre en Combat, y simultáneamente cuenta como Criatura.

export function cardTypeString(itemOrCard) {
  const card = itemOrCard?.card || itemOrCard || {};
  return typeof card.type === 'string' ? card.type : '';
}

export function isBasicLandCard(itemOrCard) {
  return /Tierra\s+básica/i.test(cardTypeString(itemOrCard));
}

export function getPermanentTypes(itemOrCard) {
  const item = itemOrCard?.card ? itemOrCard : null;
  const card = item?.card || itemOrCard || {};
  const type = typeof card.type === 'string' ? card.type : '';
  const out = new Set(Array.isArray(item?.permanentTypes) ? item.permanentTypes : []);
  if (type.includes('Tierra')) out.add('land');
  if (type.includes('Criatura') || card.power !== undefined) out.add('creature');
  if (type.includes('Artefacto')) out.add('artifact');
  if (type.includes('Encantamiento')) out.add('enchantment');
  if (type.includes('Planeswalker')) out.add('planeswalker');
  if (item?.isAnimatedLand) { out.add('land'); out.add('creature'); }
  if (item?.isVehicle) { out.add('artifact'); out.add('creature'); }
  return [...out];
}

export function isLandPermanent(itemOrCard) { return getPermanentTypes(itemOrCard).includes('land'); }
export function isCreaturePermanent(itemOrCard) { return getPermanentTypes(itemOrCard).includes('creature'); }
export function isArtifactPermanent(itemOrCard) { return getPermanentTypes(itemOrCard).includes('artifact'); }
export function isEnchantmentPermanent(itemOrCard) { return getPermanentTypes(itemOrCard).includes('enchantment'); }
export function isNonbasicLandPermanent(itemOrCard) { return isLandPermanent(itemOrCard) && !isBasicLandCard(itemOrCard); }

export function landMatchesFilter(itemOrCard, filter = 'any') {
  if (!isLandPermanent(itemOrCard)) return false;
  if (!filter || filter === 'any') return true;
  if (filter === 'basic') return isBasicLandCard(itemOrCard);
  if (filter === 'nonbasic') return isNonbasicLandPermanent(itemOrCard);
  const type = cardTypeString(itemOrCard).toLowerCase();
  if (String(filter).startsWith('subtype:')) return type.includes(String(filter).slice(8).trim().toLowerCase());
  return false;
}
