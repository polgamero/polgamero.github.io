// js/manaPool.js — Argentinia 23.14.1 · Mana Pool Foundation
// Modelo puro de reserva de maná. No conoce DOM ni `state`: se comparte entre humano,
// Tano, UI y sync sin introducir otro motor paralelo de pagos.

export const MANA_TYPES = Object.freeze(['W', 'U', 'B', 'R', 'G', 'C']);

export function emptyManaPool() {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function normalizeManaPool(pool) {
  const out = emptyManaPool();
  for (const type of MANA_TYPES) out[type] = Math.max(0, Math.floor(Number(pool?.[type]) || 0));
  return out;
}

export function cloneManaPool(pool) {
  return normalizeManaPool(pool);
}

export function manaPoolTotal(pool) {
  const p = normalizeManaPool(pool);
  return MANA_TYPES.reduce((sum, type) => sum + p[type], 0);
}

export function addMana(pool, type, amount = 1) {
  if (!MANA_TYPES.includes(type)) return false;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (n <= 0) return false;
  pool[type] = Math.max(0, Math.floor(Number(pool[type]) || 0)) + n;
  return true;
}

export function clearManaPool(pool) {
  for (const type of MANA_TYPES) pool[type] = 0;
  return pool;
}

export function manaCostTotal(cost) {
  if (!cost) return 0;
  return ['W', 'U', 'B', 'R', 'G', 'C', 'generic']
    .reduce((sum, key) => sum + Math.max(0, Math.floor(Number(cost[key]) || 0)), 0);
}

// Un click de un símbolo del pool paga primero su requisito específico y, si ya no hace
// falta ese símbolo, puede pagar genérico. {C} sólo puede pagarse con maná incoloro.
export function spendOneMana(pool, cost, type) {
  if (!pool || !cost || !MANA_TYPES.includes(type) || (pool[type] || 0) <= 0) return null;
  if ((cost[type] || 0) > 0) {
    pool[type] -= 1;
    cost[type] -= 1;
    return { type, paid: type };
  }
  if ((cost.generic || 0) > 0) {
    pool[type] -= 1;
    cost.generic -= 1;
    return { type, paid: 'generic' };
  }
  return null;
}

export function canPoolPayCost(pool, cost) {
  const p = normalizeManaPool(pool);
  const c = {
    W: Math.max(0, Number(cost?.W) || 0), U: Math.max(0, Number(cost?.U) || 0),
    B: Math.max(0, Number(cost?.B) || 0), R: Math.max(0, Number(cost?.R) || 0),
    G: Math.max(0, Number(cost?.G) || 0), C: Math.max(0, Number(cost?.C) || 0),
    generic: Math.max(0, Number(cost?.generic) || 0)
  };
  for (const type of MANA_TYPES) {
    if (p[type] < c[type]) return false;
    p[type] -= c[type];
  }
  return MANA_TYPES.reduce((sum, type) => sum + p[type], 0) >= c.generic;
}

// Pago determinista para IA/automatismos: requisitos específicos primero; después genérico
// en WUBRGC. Devuelve false sin mutar si el pool no alcanza.
export function spendCostAutomatically(pool, cost) {
  if (!canPoolPayCost(pool, cost)) return false;
  for (const type of MANA_TYPES) {
    const n = Math.max(0, Math.floor(Number(cost[type]) || 0));
    if (n > 0) {
      pool[type] -= n;
      cost[type] -= n;
    }
  }
  let generic = Math.max(0, Math.floor(Number(cost.generic) || 0));
  for (const type of MANA_TYPES) {
    if (generic <= 0) break;
    const use = Math.min(pool[type], generic);
    pool[type] -= use;
    generic -= use;
  }
  cost.generic = generic;
  return true;
}

// Consume todo el maná YA flotante que pueda contribuir a un coste, aunque no alcance para
// pagarlo entero. Es útil para IA, Ward/impuestos y otros pagos automáticos; nunca inventa
// maná ni consume un color que no pueda satisfacer un pip específico o genérico.
export function spendAvailableTowardCost(pool, cost) {
  if (!pool || !cost) return cost;
  // Primero preservamos la semántica de símbolos específicos, incluido {C}.
  for (const type of MANA_TYPES) {
    const need = Math.max(0, Math.floor(Number(cost[type]) || 0));
    if (!need) continue;
    const use = Math.min(Math.max(0, Number(pool[type]) || 0), need);
    pool[type] -= use;
    cost[type] -= use;
  }
  // Después cualquier maná sobrante puede cubrir genérico.
  let generic = Math.max(0, Math.floor(Number(cost.generic) || 0));
  for (const type of MANA_TYPES) {
    if (generic <= 0) break;
    const use = Math.min(Math.max(0, Number(pool[type]) || 0), generic);
    pool[type] -= use;
    generic -= use;
  }
  cost.generic = generic;
  return cost;
}
