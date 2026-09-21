// HF23.3.12 — Mi Taller server authority.
import { economyError } from '../shared/errors.js';

export const WORKSHOP_MACHINE_IDS = Object.freeze(['machine1','machine2','machine3','machine4']);

const nonneg = v => Math.max(0, Math.floor(Number(v) || 0));
const boolOr = (v, fallback) => typeof v === 'boolean' ? v : fallback;

export function normalizeWorkshopSettings(raw = {}) {
  return Object.freeze({
    enabled: boolOr(raw.workshopEnabled, true),
    machine1: Object.freeze({ available: boolOr(raw.workshopMachine1Available, true), points: nonneg(raw.workshopMachine1UnlockPoints ?? 1000), fichas: nonneg(raw.workshopMachine1UnlockFichas ?? 0) }),
    machine2: Object.freeze({ available: boolOr(raw.workshopMachine2Available, false), points: nonneg(raw.workshopMachine2UnlockPoints ?? 2000), fichas: nonneg(raw.workshopMachine2UnlockFichas ?? 20) }),
    machine3: Object.freeze({ available: boolOr(raw.workshopMachine3Available, false), points: nonneg(raw.workshopMachine3UnlockPoints ?? 3000), fichas: nonneg(raw.workshopMachine3UnlockFichas ?? 50) }),
    machine4: Object.freeze({ available: boolOr(raw.workshopMachine4Available, false), points: nonneg(raw.workshopMachine4UnlockPoints ?? 0), fichas: nonneg(raw.workshopMachine4UnlockFichas ?? 0) })
  });
}

export function normalizeWorkshopProfile(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const unlocked = source.unlockedMachines && typeof source.unlockedMachines === 'object' && !Array.isArray(source.unlockedMachines) ? source.unlockedMachines : {};
  const unlockedMachines = {};
  for (const id of WORKSHOP_MACHINE_IDS) unlockedMachines[id] = unlocked[id] === true;
  return { ...source, unlockedMachines };
}

export async function unlockWorkshopMachineTx({ db, tx, uid, machineId }) {
  const id = String(machineId || '').trim();
  if (!WORKSHOP_MACHINE_IDS.includes(id)) throw economyError('WORKSHOP_MACHINE_INVALID');
  const userRef = db.collection('users').doc(uid);
  const settingsRef = db.doc('gameConfig/settings');
  const [userSnap, settingsSnap] = await Promise.all([tx.get(userRef), tx.get(settingsRef)]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile = userSnap.data() || {};
  const settings = normalizeWorkshopSettings(settingsSnap.exists ? settingsSnap.data() || {} : {});
  if (!settings.enabled) throw economyError('WORKSHOP_DISABLED');
  const policy = settings[id];
  const workshop = normalizeWorkshopProfile(profile.workshop);
  if (workshop.unlockedMachines[id]) {
    return { kind:'workshopUnlock', machineId:id, duplicate:true, pointsCost:0, fichasCost:0, pointsAfter:nonneg(profile.points), fichasAfter:nonneg(profile.fichas) };
  }
  if (!policy.available) throw economyError('WORKSHOP_MACHINE_UNAVAILABLE');
  const pointsBefore = nonneg(profile.points), fichasBefore = nonneg(profile.fichas);
  if (pointsBefore < policy.points) throw economyError('WORKSHOP_INSUFFICIENT_FUNDS', { currency:'points', required:policy.points, available:pointsBefore });
  if (fichasBefore < policy.fichas) throw economyError('WORKSHOP_INSUFFICIENT_FUNDS', { currency:'fichas', required:policy.fichas, available:fichasBefore });
  const pointsAfter = pointsBefore - policy.points, fichasAfter = fichasBefore - policy.fichas;
  const unlockedMachines = { ...workshop.unlockedMachines, [id]:true };
  tx.update(userRef, {
    points: pointsAfter,
    fichas: fichasAfter,
    workshop: { ...workshop, unlockedMachines, [`${id}UnlockedAtMs`]: Date.now() }
  });
  return { kind:'workshopUnlock', machineId:id, duplicate:false, pointsCost:policy.points, fichasCost:policy.fichas, pointsAfter, fichasAfter };
}
