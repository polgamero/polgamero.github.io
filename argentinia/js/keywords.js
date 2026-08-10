import { getEffectiveKeywords, getEffectivePower, getEffectiveToughness } from './main.js';

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

// Protección de [color]: se representa como una keyword más ('protection_W', 'protection_U',
// etc.) para reusar TODO el sistema de agregación que ya existe (getEffectiveKeywords ya
// suma base + Auras + Equipos + estáticos + efectos temporales) — así una Aura o un Equipo
// pueden otorgar Protección igual que cualquier otra keyword, sin código nuevo para eso.
export function hasProtectionFrom(itemObj, color) {
  return hasKeyword(itemObj, `protection_${color}`);
}

// Si `sourceColors` (los colores de un hechizo, habilidad, o criatura atacante) incluye
// algún color del que el objetivo tiene Protección, devuelve ESE color (para el mensaje);
// si no hay ninguna protección relevante, devuelve null.
export function getProtectionMatch(itemObj, sourceColors) {
  if (!sourceColors || sourceColors.length === 0) return null;
  return sourceColors.find(c => hasProtectionFrom(itemObj, c)) || null;
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
    if (!blockerFlies && !blockerReaches) return false;
  }

  // Protección de [color]: el atacante no puede ser bloqueado por una criatura de ese color.
  const blockerColors = (blocker.card.colors || []);
  if (getProtectionMatch(attacker, blockerColors)) return false;
  
  return true;
}

/**
 * NUEVO (Etapa 7.5): Simula un duelo 1 contra 1 respetando Golpe Primero y Daño
 * Doble, para que la IA del Tano (ataque y bloqueo) tome decisiones correctas
 * en vez de asumir siempre daño simultáneo. Replica la misma matemática de dos
 * sub-pasos que usa combatRules.js (resolveDamageSubStep), pero sin tocar el
 * estado real del juego — solo predice el resultado.
 * @param {Object} attacker - La unidad que ataca
 * @param {Object} blocker - La unidad que bloquea
 * @returns {{attackerDies: Boolean, blockerDies: Boolean}}
 */
export function predictDuel(attacker, blocker) {
  const atkPower = getEffectivePower(attacker);
  const atkTough = getEffectiveToughness(attacker);
  const bPower = getEffectivePower(blocker);
  const bTough = getEffectiveToughness(blocker);
  const atkHasDeathtouch = hasKeyword(attacker, 'deathtouch');
  const bHasDeathtouch = hasKeyword(blocker, 'deathtouch');

  // ¿En qué sub-paso pega cada uno? (mismo criterio que combatRules.js)
  const atkActsStep1 = hasKeyword(attacker, 'firststrike') || hasKeyword(attacker, 'doublestrike');
  const atkActsStep2 = !hasKeyword(attacker, 'firststrike') || hasKeyword(attacker, 'doublestrike');
  const bActsStep1 = hasKeyword(blocker, 'firststrike') || hasKeyword(blocker, 'doublestrike');
  const bActsStep2 = !hasKeyword(blocker, 'firststrike') || hasKeyword(blocker, 'doublestrike');

  let atkDmg = 0, bDmg = 0, atkGotDeathtouched = false, bGotDeathtouched = false;

  // --- Paso de Iniciativa ---
  if (atkActsStep1) { bDmg += atkPower; if (atkHasDeathtouch && atkPower > 0) bGotDeathtouched = true; }
  if (bActsStep1) { atkDmg += bPower; if (bHasDeathtouch && bPower > 0) atkGotDeathtouched = true; }

  let bDead = bDmg >= bTough || (bGotDeathtouched && bDmg > 0);
  let atkDead = atkDmg >= atkTough || (atkGotDeathtouched && atkDmg > 0);

  // --- Paso Regular --- (si alguno ya murió en Iniciativa, no hay revancha)
  if (!atkDead && !bDead) {
    if (atkActsStep2) { bDmg += atkPower; if (atkHasDeathtouch && atkPower > 0) bGotDeathtouched = true; }
    if (bActsStep2) { atkDmg += bPower; if (bHasDeathtouch && bPower > 0) atkGotDeathtouched = true; }
    bDead = bDmg >= bTough || (bGotDeathtouched && bDmg > 0);
    atkDead = atkDmg >= atkTough || (atkGotDeathtouched && atkDmg > 0);
  }

  return { attackerDies: atkDead, blockerDies: bDead };
}
