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

/**
 * Verifica si un bloqueador es legal para un atacante específico (lógica de Flying/Reach).
 * @param {Object} attacker - La unidad que ataca (de localCombat o rivalCombat)
 * @param {Object} blocker - La unidad que intenta bloquear (de localCombat o rivalCombat)
 * @returns {Boolean}
 */
export function canBlock(attacker, blocker) {
  const attackerFlies = hasKeyword(attacker, 'flying');
  
  if (attackerFlies) {
    const blockerFlies = hasKeyword(blocker, 'flying');
    const blockerReaches = hasKeyword(blocker, 'reach');
    
    // Si el atacante vuela, el bloqueador SÍ O SÍ debe tener Flying o Reach
    return blockerFlies || blockerReaches;
  }
  
  // Si el atacante no vuela, cualquier criatura (con o sin volar/alcance) puede bloquearlo
  return true;
}
