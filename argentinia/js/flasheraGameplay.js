// Flasheras Stage31 — physical finish is a property of the PRINTED COPY, not copiable rules text.
// No economy writes, card definition duplication, or random generation in this module.
import { parseCardVariantId } from './cardVariant.js';

export function isPhysicalFlashera(cardOrItem) {
  const card = cardOrItem?.card || cardOrItem;
  return !!card && card.isToken !== true && (
    card.flashera === true || card._flashera === true || card.finish === 'flashera' ||
    (typeof card.variantId === 'string' && parseCardVariantId(card.variantId).flashera)
  );
}

export function putPhysicalFlashera(card, variantId) {
  if (!card || card.isToken === true) throw new Error('Una ficha no puede recibir acabado Flashera.');
  const variant = parseCardVariantId(variantId);
  if (!variant.valid || !variant.flashera || String(card.id) !== variant.baseId) {
    throw new Error('Variante Flashera física inválida para la carta.');
  }
  // These three markers are presentation-only. card.id stays the base gameplay identity.
  return { ...card, flashera: true, finish: 'flashera', variantId: variant.canonicalId };
}

export function stripPhysicalFinish(card) {
  if (!card || typeof card !== 'object') return card;
  const result = { ...card };
  delete result.flashera; delete result._flashera; delete result.finish;
  delete result.variantId; delete result.cardVariantId;
  return result;
}

export function preservePhysicalFinish(target, copiedCharacteristics) {
  // The permanent that BECOMES a copy keeps its own coating, never that of the source.
  const clean = stripPhysicalFinish(copiedCharacteristics);
  return isPhysicalFlashera(target) ? {
    ...clean, flashera: true, finish: 'flashera',
    ...(target.variantId ? {variantId:target.variantId} : {})
  } : clean;
}
