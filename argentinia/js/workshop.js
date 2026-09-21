// HF23.3.12 — Mi Taller Foundation.
// Pure helpers only: layout is public config; unlock ownership is stored per user.

export const WORKSHOP_MACHINE_IDS = Object.freeze(['machine1','machine2','machine3','machine4']);

export const DEFAULT_WORKSHOP_LAYOUT = Object.freeze({
  schemaVersion: 1,
  machines: Object.freeze({
    machine1: Object.freeze({ xPct: 16.5, yPct: 58, widthPct: 19 }),
    machine2: Object.freeze({ xPct: 38.5, yPct: 57, widthPct: 19 }),
    machine3: Object.freeze({ xPct: 61.5, yPct: 57, widthPct: 19 }),
    machine4: Object.freeze({ xPct: 83.5, yPct: 58, widthPct: 19 })
  })
});

const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function normalizeWorkshopLayout(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const machines = {};
  for (const id of WORKSHOP_MACHINE_IDS) {
    const fallback = DEFAULT_WORKSHOP_LAYOUT.machines[id];
    const row = source?.machines?.[id] || {};
    machines[id] = {
      xPct: clamp(finite(row.xPct, fallback.xPct), -20, 120),
      yPct: clamp(finite(row.yPct, fallback.yPct), -20, 120),
      widthPct: clamp(finite(row.widthPct, fallback.widthPct), 2, 60)
    };
  }
  return { schemaVersion: 1, machines };
}

export function normalizeWorkshopProfile(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const unlocked = source.unlockedMachines && typeof source.unlockedMachines === 'object' && !Array.isArray(source.unlockedMachines)
    ? source.unlockedMachines : {};
  const unlockedMachines = {};
  for (const id of WORKSHOP_MACHINE_IDS) unlockedMachines[id] = unlocked[id] === true;
  return {
    ...source,
    unlockedMachines,
    enhancementsCrafted: Math.max(0, Math.floor(Number(source.enhancementsCrafted) || 0))
  };
}

export function isWorkshopMachineUnlocked(profile, machineId) {
  return normalizeWorkshopProfile(profile?.workshop).unlockedMachines[String(machineId || '')] === true;
}

export function workshopMachineAsset(machineId) {
  const idx = WORKSHOP_MACHINE_IDS.indexOf(String(machineId || ''));
  return idx >= 0 ? `maquina${idx + 1}.png` : '';
}
