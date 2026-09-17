// v23.19.5.4 — server-side registration admission control.
import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { ADMISSION_MODES, normalizeAdmissionPolicy, argentinaAdmissionDayKey, evaluateAdmission } from './admissionCore.js';

export const ADMISSION_CONFIG_PATH = 'gameConfig/admission';
export const ADMISSION_COUNTER_GLOBAL_PATH = 'admissionCounters/global';
export const ADMISSION_DAILY_COLLECTION = 'admissionDaily';
export const ADMISSION_COUNTER_SCOPE = 'human_only_v2';

export async function loadAdmissionPolicy(db, tx = null) {
  const ref = db.doc(ADMISSION_CONFIG_PATH);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return normalizeAdmissionPolicy(snap.exists ? snap.data() : {});
}

export async function countRegisteredUsers(db) {
  // HF23.3.5 — capacity belongs exclusively to real accounts. Ambient/system users live
  // in users/ for normal server-side behavior, but must never consume admission slots.
  const [totalSnap, systemSnap] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('users').where('isSystemBot','==',true).count().get()
  ]);
  const total = Math.max(0, Math.floor(Number(totalSnap.data()?.count) || 0));
  const system = Math.max(0, Math.floor(Number(systemSnap.data()?.count) || 0));
  return Math.max(0, total - system);
}

export async function prepareAdmissionObservation(db, nowMs = Date.now()) {
  return { observedRegisteredUsers: await countRegisteredUsers(db), dayKey: argentinaAdmissionDayKey(nowMs), nowMs };
}

export async function reserveRegistrationAdmissionTx({ db, tx, observation }) {
  const dayKey = String(observation?.dayKey || argentinaAdmissionDayKey());
  const policyRef = db.doc(ADMISSION_CONFIG_PATH);
  const globalRef = db.doc(ADMISSION_COUNTER_GLOBAL_PATH);
  const dailyRef = db.collection(ADMISSION_DAILY_COLLECTION).doc(dayKey);
  const [policySnap, globalSnap, dailySnap] = await Promise.all([tx.get(policyRef), tx.get(globalRef), tx.get(dailyRef)]);
  const policy = normalizeAdmissionPolicy(policySnap.exists ? policySnap.data() : {});
  const observed = Math.max(0, Math.floor(Number(observation?.observedRegisteredUsers) || 0));
  const globalData = globalSnap.exists ? globalSnap.data() || {} : {};
  const storedGlobal = Math.max(0, Math.floor(Number(globalData.registeredUsers) || 0));
  // Counters written before HF23.3.5 may include the five ambient accounts. Do not let
  // that legacy value pin capacity forever. Once the scope marker exists, max() still
  // protects concurrent registrations exactly as before.
  const currentRegistered = globalData.countScope === ADMISSION_COUNTER_SCOPE
    ? Math.max(observed, storedGlobal)
    : observed;
  const currentToday = dailySnap.exists ? Math.max(0, Math.floor(Number(dailySnap.data()?.registrations) || 0)) : 0;
  const verdict = evaluateAdmission({ policy, registeredUsers:currentRegistered, registrationsToday:currentToday });
  if (!verdict.allowed) {
    if (verdict.reason === 'paused') throw economyError('REGISTRATION_PAUSED');
    if (verdict.reason === 'capacity') throw economyError('REGISTRATION_CAPACITY_REACHED', { maxRegisteredUsers:policy.maxRegisteredUsers, registeredUsers:currentRegistered });
    if (verdict.reason === 'daily_limit') throw economyError('REGISTRATION_DAILY_LIMIT_REACHED', { maxRegistrationsPerDay:policy.maxRegistrationsPerDay, registrationsToday:currentToday });
    throw economyError('REGISTRATION_UNAVAILABLE');
  }
  const nextRegistered = currentRegistered + 1;
  const nextToday = currentToday + 1;
  tx.set(globalRef, { registeredUsers:nextRegistered, countScope:ADMISSION_COUNTER_SCOPE, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  tx.set(dailyRef, { dayKey, registrations:nextToday, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  return { policy, registeredUsersAfter:nextRegistered, registrationsTodayAfter:nextToday, dayKey };
}

export async function getAdmissionStatus(db, nowMs = Date.now()) {
  const dayKey = argentinaAdmissionDayKey(nowMs);
  const [policy, registeredUsers, dailySnap] = await Promise.all([
    loadAdmissionPolicy(db),
    countRegisteredUsers(db),
    db.collection(ADMISSION_DAILY_COLLECTION).doc(dayKey).get()
  ]);
  const registrationsToday = dailySnap.exists ? Math.max(0, Math.floor(Number(dailySnap.data()?.registrations) || 0)) : 0;
  const verdict = evaluateAdmission({ policy, registeredUsers, registrationsToday });
  return {
    ...policy,
    registeredUsers,
    registrationsToday,
    availableSlots: policy.maxRegisteredUsers > 0 ? Math.max(0, policy.maxRegisteredUsers - registeredUsers) : null,
    dailySlotsRemaining: policy.maxRegistrationsPerDay > 0 ? Math.max(0, policy.maxRegistrationsPerDay - registrationsToday) : null,
    currentlyAcceptingNewUsers: verdict.allowed,
    limitingReason: verdict.allowed ? null : verdict.reason,
    dayKey
  };
}

export async function setAdmissionPolicyAdmin({ db, registrationMode, maxRegisteredUsers, maxRegistrationsPerDay }) {
  const policy = normalizeAdmissionPolicy({ registrationMode, maxRegisteredUsers, maxRegistrationsPerDay });
  const registeredUsers = await countRegisteredUsers(db);
  const nowMs = Date.now();
  const dayKey = argentinaAdmissionDayKey(nowMs);
  await db.runTransaction(async tx => {
    const configRef = db.doc(ADMISSION_CONFIG_PATH);
    const globalRef = db.doc(ADMISSION_COUNTER_GLOBAL_PATH);
    const dailyRef = db.collection(ADMISSION_DAILY_COLLECTION).doc(dayKey);
    const dailySnap = await tx.get(dailyRef);
    tx.set(configRef, { ...policy, updatedAt:FieldValue.serverTimestamp() }, { merge:false });
    tx.set(globalRef, { registeredUsers, countScope:ADMISSION_COUNTER_SCOPE, reconciledAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    if (!dailySnap.exists) tx.create(dailyRef, { dayKey, registrations:0, updatedAt:FieldValue.serverTimestamp() });
  });
  return getAdmissionStatus(db, nowMs);
}

export { ADMISSION_MODES, normalizeAdmissionPolicy, evaluateAdmission } from './admissionCore.js';
