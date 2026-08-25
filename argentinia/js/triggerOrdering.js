// Argentinia 23.15.1 — AP/NAP trigger ordering helpers (CR 603.3b)
// Funciones puras: main.js conserva decisiones/UI, este módulo sólo define cómo se
// particiona un lote y cómo un orden de RESOLUCIÓN se coloca sobre una Stack LIFO.

export function buildApnapTriggerGroups(entries = [], activeIsLocal = true) {
  const valid = (entries || []).filter(Boolean);
  return {
    active: valid.filter(entry => !!entry.isLocal === !!activeIsLocal),
    nonActive: valid.filter(entry => !!entry.isLocal !== !!activeIsLocal)
  };
}

export function stackPlacementFromResolutionOrders(activeResolutionOrder = [], nonActiveResolutionOrder = []) {
  // AP coloca primero sus disparos; NAP después. Dentro de cada grupo, si la UI expresa
  // "primero en resolver -> último en resolver", se invierte para una Stack LIFO.
  return [
    ...[...(activeResolutionOrder || [])].reverse(),
    ...[...(nonActiveResolutionOrder || [])].reverse()
  ];
}

export function triggerBatchNeedsHumanOrder(entries = [], activeIsLocal = true, { multiplayer = false } = {}) {
  if (!Array.isArray(entries) || entries.length <= 1) return false;
  const { active, nonActive } = buildApnapTriggerGroups(entries, activeIsLocal);
  if (multiplayer) return active.length > 1 || nonActive.length > 1;
  return entries.filter(entry => !!entry.isLocal).length > 1;
}
