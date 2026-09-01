// js/flexibleMatching.js — Argentinia 23.15.5.1
// Matching bipartito determinista para recursos flexibles de pago.
// Mantiene una sola implementación para Vaquita y símbolos híbridos/Phyrexian.

export function maximumBipartiteAssignment(resources = [], demands = [], canMatch = null) {
  const resourceList = Array.isArray(resources) ? resources : [];
  const demandList = Array.isArray(demands) ? demands : [];
  const matches = typeof canMatch === 'function' ? canMatch : (() => false);
  const resourceToDemand = new Map();

  const tryAssign = (demandIndex, seenResources) => {
    const demand = demandList[demandIndex];
    for (let resourceIndex = 0; resourceIndex < resourceList.length; resourceIndex++) {
      if (seenResources.has(resourceIndex)) continue;
      if (!matches(resourceList[resourceIndex], demand, resourceIndex, demandIndex)) continue;
      seenResources.add(resourceIndex);
      const occupiedBy = resourceToDemand.get(resourceIndex);
      if (occupiedBy === undefined || tryAssign(occupiedBy, seenResources)) {
        resourceToDemand.set(resourceIndex, demandIndex);
        return true;
      }
    }
    return false;
  };

  // El orden de demands expresa prioridad. Al intentar los nuevos después de los viejos,
  // un demand posterior sólo desplaza a uno anterior si ese anterior puede reasignarse.
  for (let demandIndex = 0; demandIndex < demandList.length; demandIndex++) {
    tryAssign(demandIndex, new Set());
  }

  const assignments = [...resourceToDemand.entries()]
    .map(([resourceIndex, demandIndex]) => ({
      demandIndex,
      resourceIndex,
      demand: demandList[demandIndex],
      resource: resourceList[resourceIndex]
    }))
    .sort((a,b)=>a.demandIndex-b.demandIndex || a.resourceIndex-b.resourceIndex);
  const demandToResource = new Map(assignments.map(a=>[a.demandIndex,a.resourceIndex]));
  return { size: assignments.length, demandToResource, resourceToDemand, assignments };
}
