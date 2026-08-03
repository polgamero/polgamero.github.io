import { getEffectiveKeywords } from './main.js';

/**
 * Verifica si una unidad en el campo tiene una keyword específica.
 * @param {Object} itemObj - El objeto de la unidad (ej: del array state.localCombat)
 * @param {String} keyword - La keyword a buscar (ej: 'haste', 'vigilance')
 * @returns {Boolean}
 */
export function hasKeyword(itemObj, keyword) {
  if (!itemObj) return false;
  
  // Obtenemos todas las keywords base + auras usando tu función existente
  const keywords = getEffectiveKeywords(itemObj) || [];
  
  // Normalizamos a minúsculas para evitar errores de tipeo en los JSON
  return keywords.some(k => k.toLowerCase() === keyword.toLowerCase());
}
