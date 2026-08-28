// js/soloRecovery.js — Entrega 23.13.54
// Checkpoint local y reconexión real de partidas Solo vs El Tano.
// No toca economía ni Firestore: conserva estado de juego + Stack en localStorage.

import { ENGINE_VERSION } from './version.js';
import { serializeStackForPublic, deserializeStackFromPublic } from './matchSync.js';
import { getGameRngSnapshot, restoreGameRngSession } from './gameRng.js';

export const SOLO_RECOVERY_SCHEMA_VERSION = 2;
export const SOLO_RECOVERY_STORAGE_KEY = 'argentinia.solo.activeGame.v1';
export const SOLO_RECOVERY_HEARTBEAT_MS = 15_000;
export const SOLO_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const TELEMETRY_STALE_AFTER_MS = 2 * 60 * 1000;

const TRANSIENT_KEYS = new Set([
  'currentUser','userProfile','currentMatch','authInitialResolved','authIdentityReady',
  'matchSyncBusy','multiplayerWaitingForReady','stackResolutionAuthority','autoZeroBlockersQueued',
  'priorityClockDeadlineLocalMs','priorityClockRemainingMs','priorityClockPausedLocal','priorityClockPauseReasonLocal',
  'pendingCastTransaction','pendingPreparedCastCosts','pendingAlternativeCostChoice','pendingPrivateZoneChoice',
  'pendingSpellIndex','pendingCost','tappedLandsThisSpell','paymentManaSourceRollbacks','pendingTargetCard',
  'pendingAbilitySource','pendingActivatedAbilityChoice','pendingBlockerIndex','pendingTargetSource',
  'pendingSacrificeChoice','pendingCrew','pendingAttackRedirect','pendingWardChoice','pendingCounterUnlessPay',
  'pendingHybridLifePayment','pendingCompositeCostPayment','pendingSpellCostsIrreversible','pendingFightChoice',
  'pendingLegendChoice','pendingTriggerOrderChoice','pendingXChoice','pendingModeChoice','pendingLoyaltyTargetChoice','pendingMultiTargetChoice',
  'pendingScrySurveilChoice','pendingProliferateChoice','pendingHandFilterChoice','pendingDiscardChoice',
  'pendingSacrificeEffectChoice','pendingGraveyardChoice','pendingResolvedEffectTargetChoice',
  'pendingEscapeExileChoice','pendingKickerChoice','pendingRampChoice','pendingLandSearchChoice','pendingLibraryChoice','damageModalOpen','awaitingRivalDecision',
  'respondingToDecision','pendingDecision','decisionResponse','isDiscarding','cardsToDiscard',
  'resolvingDiscardEffects','resolvingSacrificeEffects','resolvingCardFilterEffects','resolvingGraveyardChoices','resolvingResolvedEffectTargetChoices'
]);

const PENDING_KEYS = [...TRANSIENT_KEYS].filter(k => k.startsWith('pending') || [
  'damageModalOpen','awaitingRivalDecision','respondingToDecision','isDiscarding','cardsToDiscard',
  'resolvingDiscardEffects','resolvingSacrificeEffects','resolvingCardFilterEffects','resolvingGraveyardChoices','resolvingResolvedEffectTargetChoices'
].includes(k));

let active = null;
let heartbeatTimer = null;

function nowMs() { return Date.now(); }
function iso(ms = nowMs()) { return new Date(ms).toISOString(); }

function makeId() {
  try {
    if (crypto?.randomUUID) return `solo_${crypto.randomUUID().replace(/-/g, '')}`;
  } catch {}
  return `solo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function cloneSerializable(value, ancestors = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
  if (typeof Node !== 'undefined' && value instanceof Node) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return undefined;
  if (ancestors.has(value)) return undefined;
  ancestors.add(value);
  let out;
  if (Array.isArray(value)) {
    out = value.map(v => cloneSerializable(v, ancestors)).filter(v => v !== undefined);
  } else {
    out = {};
    for (const [key, val] of Object.entries(value)) {
      const cloned = cloneSerializable(val, ancestors);
      if (cloned !== undefined) out[key] = cloned;
    }
  }
  ancestors.delete(value);
  return out;
}

function serializableGameState(state) {
  const out = {};
  for (const [key, value] of Object.entries(state || {})) {
    if (TRANSIENT_KEYS.has(key)) continue;
    const cloned = cloneSerializable(value);
    if (cloned !== undefined) out[key] = cloned;
  }
  // Seguridad: un checkpoint Solo jamás debe rehidratar una identidad/red vieja.
  out.gameOver = false;
  out.abandonedBy = null;
  out.abandonProcessedLocally = false;
  return out;
}

export function isSoloRecoveryStable(state) {
  if (!state || state.currentMatch || state.gameOver) return false;
  return !PENDING_KEYS.some(key => {
    const value = state[key];
    if (typeof value === 'number') {
      if (key.startsWith('pending')) return true; // índice 0 también significa elección activa
      return value > 0;
    }
    return !!value;
  });
}

export function createSoloGameId() { return makeId(); }

export function getSoloEffectiveElapsedMs(atMs = nowMs()) {
  if (!active) return 0;
  const live = Math.max(0, atMs - active.segmentStartedAtMs);
  return Math.max(0, Math.floor(active.activeElapsedBaseMs + live));
}

export function getActiveSoloGameId() { return active?.soloGameId || null; }
export function hasActiveSoloRecovery() { return !!active; }

function persist(payload) {
  try {
    localStorage.setItem(SOLO_RECOVERY_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn('No se pudo persistir el checkpoint Solo:', err);
    return false;
  }
}

export function checkpointSoloRecovery(state, stack, options = {}) {
  if (!active || state?.currentMatch || state?.gameOver) return false;
  if (!options.force && !isSoloRecoveryStable(state)) return false;
  const checkpointAtMs = nowMs();
  const payload = {
    schemaVersion: SOLO_RECOVERY_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    status: 'active',
    soloGameId: active.soloGameId,
    segmentIndex: active.segmentIndex,
    ownerUid: active.ownerUid || null,
    playerName: active.playerName || null,
    deckLabel: active.deckLabel || null,
    startedAt: active.startedAt,
    lastCheckpointAt: iso(checkpointAtMs),
    activeElapsedMs: getSoloEffectiveElapsedMs(checkpointAtMs),
    telemetrySessionId: options.telemetrySessionId || active.telemetrySessionId || null,
    rngState: getGameRngSnapshot(),
    state: serializableGameState(state),
    stackState: serializeStackForPublic(stack || [], state, 'host')
  };
  if (persist(payload)) {
    active.lastCheckpointAtMs = checkpointAtMs;
    active.telemetrySessionId = payload.telemetrySessionId;
    return true;
  }
  return false;
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat(getState, getStack, getTelemetrySessionId) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!active) return stopHeartbeat();
    try {
      checkpointSoloRecovery(getState(), getStack(), {
        telemetrySessionId: typeof getTelemetrySessionId === 'function' ? getTelemetrySessionId() : null
      });
    } catch (err) {
      console.warn('Heartbeat Solo no pudo guardar checkpoint:', err);
    }
  }, SOLO_RECOVERY_HEARTBEAT_MS);
}

export function beginSoloRecoverySession({ soloGameId, state, stack, deckLabel, ownerUid, playerName, telemetrySessionId, getState, getStack, getTelemetrySessionId }) {
  const started = nowMs();
  active = {
    soloGameId: soloGameId || makeId(),
    segmentIndex: 1,
    ownerUid: ownerUid || null,
    playerName: playerName || null,
    deckLabel: deckLabel || null,
    startedAt: iso(started),
    activeElapsedBaseMs: 0,
    segmentStartedAtMs: started,
    lastCheckpointAtMs: started,
    telemetrySessionId: telemetrySessionId || null
  };
  checkpointSoloRecovery(state, stack, { force: true, telemetrySessionId });
  if (getState && getStack) startHeartbeat(getState, getStack, getTelemetrySessionId);
  return active.soloGameId;
}

export function activateResumedSoloRecovery(candidate, { state, stack, telemetrySessionId, getState, getStack, getTelemetrySessionId }) {
  const resumedAt = nowMs();
  active = {
    soloGameId: candidate.soloGameId,
    segmentIndex: Math.max(1, Number(candidate.segmentIndex) || 1) + 1,
    ownerUid: candidate.ownerUid || null,
    playerName: candidate.playerName || null,
    deckLabel: candidate.deckLabel || null,
    startedAt: candidate.startedAt || iso(resumedAt),
    activeElapsedBaseMs: Math.max(0, Number(candidate.activeElapsedMs) || 0),
    segmentStartedAtMs: resumedAt,
    lastCheckpointAtMs: resumedAt,
    telemetrySessionId: telemetrySessionId || null
  };
  checkpointSoloRecovery(state, stack, { force: true, telemetrySessionId });
  if (getState && getStack) startHeartbeat(getState, getStack, getTelemetrySessionId);
  return active;
}

export function loadSoloRecoveryCandidate() {
  try {
    const raw = localStorage.getItem(SOLO_RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SOLO_RECOVERY_SCHEMA_VERSION || parsed.status !== 'active') return null;
    return parsed;
  } catch (err) {
    console.warn('Checkpoint Solo inválido:', err);
    return null;
  }
}

export function isSoloRecoveryExpired(candidate, atMs = nowMs()) {
  const checkpointMs = Date.parse(candidate?.lastCheckpointAt || '');
  return Number.isFinite(checkpointMs) && atMs - checkpointMs > SOLO_RECOVERY_MAX_AGE_MS;
}

export function isSoloRecoveryCompatible(candidate) {
  return !!candidate && candidate.engineVersion === ENGINE_VERSION && !!candidate.state && Array.isArray(candidate.stackState);
}

export function restoreSoloRecoveryState(candidate, state) {
  if (!isSoloRecoveryCompatible(candidate)) throw new Error('SOLO_RECOVERY_INCOMPATIBLE');
  const auth = {
    currentUser: state.currentUser,
    userProfile: state.userProfile,
    authInitialResolved: state.authInitialResolved,
    authIdentityReady: state.authIdentityReady,
    botDifficulty: candidate.state?.botDifficulty || state.botDifficulty
  };
  Object.assign(state, cloneSerializable(candidate.state));
  state.currentUser = auth.currentUser;
  state.userProfile = auth.userProfile;
  state.authInitialResolved = auth.authInitialResolved;
  state.authIdentityReady = auth.authIdentityReady;
  state.currentMatch = null;
  state.gameOver = false;
  state.abandonedBy = null;
  state.abandonProcessedLocally = false;
  state.matchSyncBusy = false;
  state.multiplayerWaitingForReady = false;
  state.stackResolutionAuthority = false;
  state.priorityClockDeadlineLocalMs = 0;
  state.priorityClockPausedLocal = true;
  state.priorityClockPauseReasonLocal = 'solo_recovery';
  if (candidate.rngState) restoreGameRngSession(candidate.rngState);
  return deserializeStackFromPublic(candidate.stackState || [], state, 'host');
}

export function clearSoloRecovery() {
  stopHeartbeat();
  active = null;
  try { localStorage.removeItem(SOLO_RECOVERY_STORAGE_KEY); } catch {}
}

export function finishSoloRecovery() {
  const result = active ? { soloGameId: active.soloGameId, durationMs: getSoloEffectiveElapsedMs(), segmentIndex: active.segmentIndex } : null;
  clearSoloRecovery();
  return result;
}

export const __soloRecoveryTest = {
  serializableGameState,
  cloneSerializable
};
