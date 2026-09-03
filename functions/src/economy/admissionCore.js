// v23.19.5.4 — Registration Admission Control pure policy.
export const ADMISSION_MODES = Object.freeze({ OPEN:'open', LIMITED:'limited', PAUSED:'paused' });

function intBound(value, fallback = 0, min = 0, max = 100000000) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeAdmissionPolicy(raw = {}) {
  const mode = Object.values(ADMISSION_MODES).includes(raw?.registrationMode)
    ? raw.registrationMode
    : ADMISSION_MODES.OPEN;
  return {
    registrationMode: mode,
    maxRegisteredUsers: intBound(raw?.maxRegisteredUsers, 0),
    maxRegistrationsPerDay: intBound(raw?.maxRegistrationsPerDay, 0, 0, 1000000)
  };
}

export function argentinaAdmissionDayKey(nowMs = Date.now()) {
  const shifted = new Date(Number(nowMs) - 3 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function evaluateAdmission({ policy, registeredUsers = 0, registrationsToday = 0 } = {}) {
  const p = normalizeAdmissionPolicy(policy);
  const registered = Math.max(0, Math.floor(Number(registeredUsers) || 0));
  const today = Math.max(0, Math.floor(Number(registrationsToday) || 0));
  if (p.registrationMode === ADMISSION_MODES.PAUSED) {
    return { allowed:false, reason:'paused', policy:p, registeredUsers:registered, registrationsToday:today };
  }
  if (p.registrationMode === ADMISSION_MODES.LIMITED) {
    if (p.maxRegisteredUsers > 0 && registered >= p.maxRegisteredUsers) {
      return { allowed:false, reason:'capacity', policy:p, registeredUsers:registered, registrationsToday:today };
    }
    if (p.maxRegistrationsPerDay > 0 && today >= p.maxRegistrationsPerDay) {
      return { allowed:false, reason:'daily_limit', policy:p, registeredUsers:registered, registrationsToday:today };
    }
  }
  return { allowed:true, reason:'open', policy:p, registeredUsers:registered, registrationsToday:today };
}
