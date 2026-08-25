// js/telemetry.js
//
// ENTREGA 23.1 — Telemetría diagnóstica local + checkpoints remotos Firestore-only.
//
// Objetivo: observar el motor SIN participar de sus reglas. Este módulo no muta `state`,
// no resuelve efectos ni cambia reglas. Firebase se usa exclusivamente como destino de logs:
//   1) registra eventos semánticos (log visible, clicks, sync, decisiones remotas),
//   2) toma snapshots compactos del estado comprometido por render(),
//   3) calcula diffs entre snapshots,
//   4) corre invariantes defensivas para señalar estados sospechosos,
//   5) persiste el log localmente para sobrevivir a refresh/crash,
//   6) exporta UN JSON autocontenido para auditoría posterior,
//   7) sube sólo eventos nuevos como chunks de Firestore cada 30 s (sin Cloud Storage).
//
// Los datos de Auth (uid, email, tokens, credenciales) se excluyen/redactan a propósito.
// En multiplayer la mano/mazo rival siguen siendo sólo cantidades/placeholders, exactamente
// igual que en el motor: la telemetría no intenta saltarse la privacidad de Firestore.

import { ENGINE_VERSION, ENGINE_VERSION_SHORT, ENGINE_BASELINE } from './version.js';

export const TELEMETRY_SCHEMA_VERSION = 4;
export const TELEMETRY_VERSION = ENGINE_VERSION;

const STORAGE_CURRENT = 'argentinia.telemetry.current.v1';
const STORAGE_RECOVERED = 'argentinia.telemetry.recovered.v1';
const MAX_EVENTS = 12000;
const MAX_PERSIST_CHARS = 3_500_000;
export const REMOTE_CHECKPOINT_MS = 30_000;
const VALID_PHASES = new Set([
  'untap', 'upkeep', 'draw', 'main1',
  'combat_begin', 'combat_attackers', 'combat_blockers', 'combat_damage', 'combat_end',
  'main2', 'end_step', 'cleanup'
]);
const PENDING_KEYS = [
  'pendingSpellIndex', 'pendingCost', 'pendingTargetCard', 'pendingAbilitySource',
  'pendingActivatedAbilityChoice', 'pendingBlockerIndex', 'pendingTargetSource',
  'pendingSacrificeChoice', 'pendingCrew', 'pendingAttackRedirect', 'pendingWardChoice',
  'pendingCounterUnlessPay', 'pendingHybridLifePayment', 'pendingAlternativeCostChosen',
  'preparingCompositeCastCosts', 'pendingFightChoice', 'pendingXChoice', 'pendingModeChoice',
  'pendingLoyaltyTargetChoice', 'pendingMultiTargetChoice', 'pendingScrySurveilChoice',
  'pendingProliferateChoice', 'pendingHandFilterChoice', 'pendingDiscardChoice',
  'pendingSacrificeEffectChoice', 'pendingGraveyardChoice', 'pendingResolvedEffectTargetChoice', 'pendingLandSearchChoice',
  'pendingDecision', 'decisionResponse', 'awaitingRivalDecision', 'isDiscarding',
  'cardsToDiscard', 'damageModalOpen', 'resolvingDiscardEffects', 'resolvingSacrificeEffects'
];

let providers = {
  getState: null,
  getStack: null,
  getLocalPlayerName: null,
  getRivalName: null,
  getCurrentUser: null,
  uploadRemote: null
};
let currentSession = null;
let recoveredSession = null;
let lastSnapshot = null;
let lastSnapshotJson = '';
let installed = false;
let persistTimer = null;
let panel = null;
let statusEl = null;
let cloudEl = null;
let bugsEl = null;
let uploadBtn = null;
let remoteCheckpointTimer = null;
let botPriorityWatchdogTimer = null;
let botPriorityStallSince = null;
let botPriorityWatchdogKey = null;
let botPriorityStallReportedKey = null;
let botPriorityProgressSerial = 0;
let botPriorityLastProgressEventSeq = 0;
let remoteUploadInFlight = null;
let remoteFinalPending = null;
let remoteFinalUploadedSessionId = null;
let remoteState = {
  status: 'idle',
  lastUploadAt: null,
  lastError: null,
  uploadCount: 0,
  lastKind: null,
  lastUploadedSeq: 0,
  lastUploadedBugCount: 0,
  chunkCount: 0,
  lastChunkIds: []
};
let originalConsoleError = null;
let originalConsoleWarn = null;
const networkPublishesInFlight = new Set();
const networkPublishStartSeq = new Map();
let lastCompletedPublishStartSeq = 0;
const recentEventTimes = new Map();
const blockerDeclarationCounts = new Map();
const emittedInvariantFingerprints = new Map();
let cardInstanceIds = new WeakMap();
let nextCardInstanceId = 1;

function getCardInstanceId(card) {
  if (!card || typeof card !== 'object') return null;
  let id = cardInstanceIds.get(card);
  if (!id) {
    id = `ci_${nextCardInstanceId++}`;
    cardInstanceIds.set(card, id);
  }
  return id;
}

function nowIso() {
  return new Date().toISOString();
}

function perfNow() {
  try {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  } catch {
    return Date.now();
  }
}

function makeId(prefix) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

function safeStorageGet(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {}
}

function redactKey(key) {
  return /(?:^|_)(?:uid|email|photoURL|token|credential|password|auth)(?:$|_)/i.test(String(key));
}

function safeClone(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return String(value);
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack || null };
  }
  if (depth > 6) return '[MaxDepth]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    const out = value.slice(0, 120).map(v => safeClone(v, depth + 1, seen));
    if (value.length > 120) out.push(`[+${value.length - 120} items]`);
    return out;
  }

  const out = {};
  Object.keys(value).slice(0, 120).forEach(key => {
    if (redactKey(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = safeClone(value[key], depth + 1, seen);
    }
  });
  return out;
}

function cardSummary(card) {
  if (!card) return null;
  return {
    instanceId: getCardInstanceId(card),
    id: card.id ?? null,
    name: card.name ?? '(sin nombre)',
    type: card.type ?? null,
    cmc: card.cmc ?? null,
    isToken: !!card.isToken
  };
}

function compactEffect(effect) {
  if (!effect) return null;
  if (typeof effect !== 'object') return effect;
  const keys = [
    'type', 'amount', 'target', 'counterType', 'filter', 'powerMod', 'toughnessMod',
    'keyword', 'duration', 'lifeLoss', 'permanentType'
  ];
  const out = {};
  keys.forEach(k => {
    if (effect[k] !== undefined) out[k] = safeClone(effect[k]);
  });
  return out;
}

function permanentSummary(item) {
  if (!item) return null;
  const card = item.card || item;
  const out = {
    card: cardSummary(card)
  };
  [
    'tapped', 'summoningSickness', 'isAttacking', 'blockingIndex', 'damageTaken',
    'enteredThisTurn', 'isVehicle', 'wasLand', 'isAnimatedLand', 'permanentTypes', 'animatedBasePower', 'animatedBaseToughness', 'animationKeywords', 'loyalty', 'abilityUsedThisTurn',
    'attackTarget'
  ].forEach(key => {
    if (item[key] !== undefined && item[key] !== null && item[key] !== false) {
      out[key] = safeClone(item[key]);
    }
  });
  if (item.counters && Object.keys(item.counters).length) out.counters = safeClone(item.counters);
  if (Array.isArray(item.tempEffects) && item.tempEffects.length) {
    out.tempEffects = item.tempEffects.map(compactEffect);
  }
  if (Array.isArray(item.auras) && item.auras.length) {
    out.auras = item.auras.map(cardSummary);
  }
  if (item.attachedTo) {
    out.attachedTo = item.attachedTo.card ? cardSummary(item.attachedTo.card) : '[permanent]';
  }
  return out;
}

function zoneSummary(zone, mode = 'card') {
  if (!Array.isArray(zone)) return { invalid: true, receivedType: typeof zone };
  return zone.map(item => mode === 'permanent' ? permanentSummary(item) : cardSummary(item?.card || item));
}

function hiddenZoneSummary(zone, reveal) {
  if (!Array.isArray(zone)) return { invalid: true, receivedType: typeof zone };
  if (!reveal) return { count: zone.length };
  return { count: zone.length, cards: zone.map(card => cardSummary(card?.card || card)) };
}

function stackItemSummary(item) {
  if (!item) return null;
  return {
    id: item.id ?? null,
    type: item.type ?? null,
    abilityKind: item.abilityKind ?? null,
    card: cardSummary(item.card),
    isLocal: item.isLocal ?? null,
    target: item.targetObj?.card ? cardSummary(item.targetObj.card)
      : item.targetObj?.name ? cardSummary(item.targetObj)
      : item.targetObj ? '[target]' : null,
    effect: compactEffect(item.ability?.effect || item.card?.effect),
    xValue: item.xValue ?? null,
    kicked: !!item.kicked,
    castFrom: item.castFrom ?? null,
    triggerType: item.triggerType ?? null,
    triggerLabel: item.triggerLabel ?? null
  };
}

function pendingSummary(state) {
  const result = {};
  PENDING_KEYS.forEach(key => {
    const value = state[key];
    const active = value !== null && value !== undefined && value !== false &&
      !(typeof value === 'number' && value === 0);
    if (!active) return;

    if (key === 'pendingTargetCard') {
      result[key] = cardSummary(value);
    } else if (key === 'pendingDecision' || key === 'decisionResponse') {
      result[key] = value ? {
        type: value.type ?? null,
        forRole: value.forRole ?? null,
        requestId: value.requestId ?? null,
        paid: value.paid ?? null,
        accepted: value.accepted ?? null
      } : null;
    } else if (typeof value === 'object') {
      result[key] = safeClone(value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

function buildSnapshot(state, stack) {
  const multiplayer = !!state.currentMatch;
  const revealRivalHidden = !multiplayer;
  return {
    turn: {
      turnCount: state.turnCount,
      phase: state.phase,
      activePlayer: state.activePlayer,
      priorityPlayer: state.priorityPlayer,
      consecutivePasses: state.consecutivePasses,
      gameOver: !!state.gameOver,
      abandonedBy: state.abandonedBy ?? null
    },
    mode: multiplayer ? {
      kind: 'multiplayer',
      matchId: state.currentMatch?.matchId ?? null,
      myRole: state.currentMatch?.myRole ?? null
    } : {
      kind: 'solo',
      difficulty: state.botDifficulty ?? null
    },
    local: {
      hp: state.localHP,
      poison: state.localPoison,
      manaPool: state.localManaPool || {W:0,U:0,B:0,R:0,G:0,C:0},
      deck: hiddenZoneSummary(state.localDeck, false),
      hand: hiddenZoneSummary(state.localHand, true),
      lands: zoneSummary(state.localLands, 'permanent'),
      combat: zoneSummary(state.localCombat, 'permanent'),
      support: zoneSummary(state.localSupport, 'permanent'),
      planeswalkers: zoneSummary(state.localPlaneswalkers, 'permanent'),
      graveyard: zoneSummary(state.localGraveyard),
      exile: zoneSummary(state.localExile),
      landPlayedThisTurn: !!state.localLandPlayedThisTurn,
      attackersDeclaredThisTurn: state.localAttackersDeclaredThisTurn ?? 0
    },
    rival: {
      hp: state.rivalHP,
      poison: state.rivalPoison,
      manaPool: state.rivalManaPool || {W:0,U:0,B:0,R:0,G:0,C:0},
      deck: hiddenZoneSummary(state.rivalDeck, revealRivalHidden),
      hand: hiddenZoneSummary(state.rivalHand, revealRivalHidden),
      lands: zoneSummary(state.rivalLands, 'permanent'),
      combat: zoneSummary(state.rivalCombat, 'permanent'),
      support: zoneSummary(state.rivalSupport, 'permanent'),
      planeswalkers: zoneSummary(state.rivalPlaneswalkers, 'permanent'),
      graveyard: zoneSummary(state.rivalGraveyard),
      exile: zoneSummary(state.rivalExile),
      landPlayedThisTurn: !!state.rivalLandPlayedThisTurn,
      attackersDeclaredThisTurn: state.rivalAttackersDeclaredThisTurn ?? 0
    },
    stack: Array.isArray(stack) ? stack.map(stackItemSummary) : [],
    shared: {
      combatDamagePrevented: !!state.combatDamagePrevented,
      activeEffects: safeClone(state.activeEffects || []),
      scheduledReturns: (state.scheduledReturns || []).map(r => ({
        card: cardSummary(r?.card),
        isLocal: r?.isLocal ?? null
      })),
      triggerStackSerial: state.triggerStackSerial ?? 0
    },
    pending: pendingSummary(state)
  };
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffSnapshots(before, after, path = '', out = []) {
  if (valuesEqual(before, after)) return out;
  const beforeObj = before && typeof before === 'object' && !Array.isArray(before);
  const afterObj = after && typeof after === 'object' && !Array.isArray(after);

  if (!beforeObj || !afterObj) {
    out.push({ path: path || '$', before: safeClone(before), after: safeClone(after) });
    return out;
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const nextPath = path ? `${path}.${key}` : key;
    const a = before[key];
    const b = after[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!valuesEqual(a, b)) out.push({ path: nextPath, before: safeClone(a), after: safeClone(b) });
    } else if (
      a && b && typeof a === 'object' && typeof b === 'object'
    ) {
      diffSnapshots(a, b, nextPath, out);
    } else if (!valuesEqual(a, b)) {
      out.push({ path: nextPath, before: safeClone(a), after: safeClone(b) });
    }
    if (out.length >= 160) {
      out.push({ path: '$', truncated: true });
      break;
    }
  }
  return out;
}

function physicalCardRef(item) {
  return item?.card || item || null;
}

function collectPhysicalZoneRefs(state) {
  const zones = [
    'localDeck', 'localHand', 'localLands', 'localCombat', 'localGraveyard', 'localExile',
    'localSupport', 'localPlaneswalkers',
    'rivalDeck', 'rivalHand', 'rivalLands', 'rivalCombat', 'rivalGraveyard', 'rivalExile',
    'rivalSupport', 'rivalPlaneswalkers'
  ];
  const refs = new Map();
  zones.forEach(zoneName => {
    const zone = state[zoneName];
    if (!Array.isArray(zone)) return;
    zone.forEach((item, index) => {
      if (item == null) return; // placeholders multiplayer son legítimos
      const ref = physicalCardRef(item);
      if (!ref || typeof ref !== 'object') return;
      const where = `${zoneName}[${index}]`;
      const list = refs.get(ref) || [];
      list.push(where);
      refs.set(ref, list);
    });
  });
  return refs;
}

function invariantFindings(state, stack) {
  const findings = [];
  const push = (code, message, details = {}, severity = 'warning') => {
    findings.push({ code, message, details: safeClone(details), severity });
  };

  if (!VALID_PHASES.has(state.phase)) {
    push('INVALID_PHASE', `Fase desconocida: ${String(state.phase)}`, { phase: state.phase }, 'error');
  }
  if (!['local', 'rival'].includes(state.activePlayer)) {
    push('INVALID_ACTIVE_PLAYER', 'activePlayer no es local/rival', { activePlayer: state.activePlayer }, 'error');
  }
  if (!['local', 'rival'].includes(state.priorityPlayer)) {
    push('INVALID_PRIORITY_PLAYER', 'priorityPlayer no es local/rival', { priorityPlayer: state.priorityPlayer }, 'error');
  }
  if (!Number.isInteger(state.turnCount) || state.turnCount < 1) {
    push('INVALID_TURN_COUNT', 'turnCount inválido', { turnCount: state.turnCount });
  }
  if (!Number.isInteger(state.consecutivePasses) || state.consecutivePasses < 0 || state.consecutivePasses > 2) {
    push('INVALID_PASS_COUNT', 'consecutivePasses fuera de 0..2', { consecutivePasses: state.consecutivePasses }, 'error');
  }

  ['localHP', 'rivalHP', 'localPoison', 'rivalPoison'].forEach(key => {
    if (!Number.isFinite(state[key])) push('NON_FINITE_NUMBER', `${key} no es finito`, { key, value: state[key] }, 'error');
  });
  ['localPoison', 'rivalPoison'].forEach(key => {
    if (Number.isFinite(state[key]) && (state[key] < 0 || !Number.isInteger(state[key]))) {
      push('INVALID_POISON', `${key} inválido`, { key, value: state[key] });
    }
  });

  ['localManaPool', 'rivalManaPool'].forEach(key => {
    const pool = state[key];
    if (!pool || typeof pool !== 'object' || Array.isArray(pool)) {
      push('INVALID_MANA_POOL', `${key} no es un mapa de maná`, { key, value: pool }, 'error');
      return;
    }
    for (const type of ['W','U','B','R','G','C']) {
      const amount = pool[type];
      if (!Number.isInteger(amount) || amount < 0) {
        push('INVALID_MANA_POOL', `${key}.${type} inválido`, { key, type, amount }, 'error');
      }
    }
  });

  const arrayZones = [
    'localDeck', 'localHand', 'localLands', 'localCombat', 'localGraveyard', 'localExile',
    'localSupport', 'localPlaneswalkers', 'rivalDeck', 'rivalHand', 'rivalLands',
    'rivalCombat', 'rivalGraveyard', 'rivalExile', 'rivalSupport', 'rivalPlaneswalkers',
    'activeEffects', 'scheduledReturns'
  ];
  arrayZones.forEach(key => {
    if (!Array.isArray(state[key])) push('ZONE_NOT_ARRAY', `${key} dejó de ser Array`, { key, type: typeof state[key] }, 'error');
  });

  if (state.currentMatch && Array.isArray(state.rivalHand) && state.rivalHand.some(v => v !== null)) {
    push('HIDDEN_HAND_LEAK', 'En multiplayer rivalHand contiene cartas reales en vez de placeholders.', {
      nonNullCount: state.rivalHand.filter(v => v !== null).length
    }, 'error');
  }
  if (state.currentMatch && Array.isArray(state.rivalDeck) && state.rivalDeck.some(v => v !== null)) {
    push('HIDDEN_DECK_LEAK', 'En multiplayer rivalDeck contiene cartas reales en vez de placeholders.', {
      nonNullCount: state.rivalDeck.filter(v => v !== null).length
    }, 'error');
  }
  if (!state.currentMatch && (state.pendingDecision || state.decisionResponse || state.awaitingRivalDecision)) {
    push('REMOTE_DECISION_IN_SOLO', 'Hay estado de decisión remota en una partida sin currentMatch.', {
      pendingDecision: state.pendingDecision?.requestId || null,
      decisionResponse: state.decisionResponse?.requestId || null,
      awaitingRivalDecision: !!state.awaitingRivalDecision
    });
  }

  if (state.pendingDecision && !state.pendingDecision.requestId) {
    push('DECISION_WITHOUT_ID', 'pendingDecision no tiene requestId.', { pendingDecision: state.pendingDecision }, 'error');
  }
  if (state.decisionResponse && !state.decisionResponse.requestId) {
    push('RESPONSE_WITHOUT_ID', 'decisionResponse no tiene requestId.', { decisionResponse: state.decisionResponse }, 'error');
  }

  if (Array.isArray(state.localCombat) && Array.isArray(state.rivalCombat)) {
    state.localCombat.forEach((unit, index) => {
      if (unit?.blockingIndex != null && (!Number.isInteger(unit.blockingIndex) || unit.blockingIndex < 0 || unit.blockingIndex >= state.rivalCombat.length)) {
        push('INVALID_BLOCK_INDEX', 'Bloqueador local apunta a índice rival inexistente.', {
          side: 'local', index, blockingIndex: unit.blockingIndex, rivalCombatLength: state.rivalCombat.length
        }, 'error');
      }
      if (unit?.damageTaken != null && (!Number.isFinite(unit.damageTaken) || unit.damageTaken < 0)) {
        push('INVALID_DAMAGE_MARK', 'damageTaken local inválido.', { index, damageTaken: unit.damageTaken });
      }
    });
    state.rivalCombat.forEach((unit, index) => {
      if (unit?.blockingIndex != null && (!Number.isInteger(unit.blockingIndex) || unit.blockingIndex < 0 || unit.blockingIndex >= state.localCombat.length)) {
        push('INVALID_BLOCK_INDEX', 'Bloqueador rival apunta a índice local inexistente.', {
          side: 'rival', index, blockingIndex: unit.blockingIndex, localCombatLength: state.localCombat.length
        }, 'error');
      }
      if (unit?.damageTaken != null && (!Number.isFinite(unit.damageTaken) || unit.damageTaken < 0)) {
        push('INVALID_DAMAGE_MARK', 'damageTaken rival inválido.', { index, damageTaken: unit.damageTaken });
      }
    });
  }

  const physicalRefs = collectPhysicalZoneRefs(state);
  for (const [ref, paths] of physicalRefs.entries()) {
    if (paths.length > 1) {
      push('CARD_REFERENCE_IN_MULTIPLE_ZONES', 'La misma instancia de carta aparece en más de una zona física.', {
        card: cardSummary(ref),
        paths
      }, 'error');
    }
  }

  if (Array.isArray(stack)) {
    const ids = new Set();
    stack.forEach((item, index) => {
      if (!item || !item.card) push('INVALID_STACK_ITEM', 'Objeto de Stack sin card.', { index, item }, 'error');
      if (item?.id != null) {
        if (ids.has(item.id)) push('DUPLICATE_STACK_ID', 'Dos objetos de Stack comparten ID.', { id: item.id }, 'error');
        ids.add(item.id);
      }
    });
  }

  return findings;
}

function bugRootCauseKey(finding) {
  const code = finding?.code || 'UNKNOWN';
  const details = finding?.details || {};
  if (code === 'JS_ERROR') {
    return `JS_ERROR|${details.filename || ''}|${details.lineno || ''}|${details.colno || ''}|${finding?.message || ''}`;
  }
  if (code === 'UNHANDLED_REJECTION') {
    const reason = details?.reason?.message || details?.reason?.name || String(details?.reason || '');
    return `UNHANDLED_REJECTION|${reason}`;
  }
  if (code === 'SYNC_PUBLISH_ERROR') {
    return `SYNC_PUBLISH_ERROR|${details.errorName || ''}|${details.errorMessage || ''}`;
  }
  if (code === 'SYNC_PUBLISH_OVERLAP' || code === 'POSSIBLE_SYNC_RENDER_STORM' || code === 'INVALID_PASS_COUNT' || code === 'BLOCKER_DECLARATION_LOOP' || code === 'BOT_PRIORITY_STALL') {
    return code;
  }
  return `${code}|${JSON.stringify(details)}`;
}

function shouldAggregateBug(finding) {
  return new Set(['JS_ERROR', 'UNHANDLED_REJECTION', 'SYNC_PUBLISH_OVERLAP', 'SYNC_PUBLISH_ERROR', 'POSSIBLE_SYNC_RENDER_STORM', 'INVALID_PASS_COUNT', 'BLOCKER_DECLARATION_LOOP', 'BOT_PRIORITY_STALL']).has(finding?.code);
}

function addBugCandidate(finding, eventSeq = null) {
  if (!currentSession) return;
  const rootCauseKey = bugRootCauseKey(finding);
  const now = Date.now();

  if (shouldAggregateBug(finding)) {
    const existing = currentSession.bugCandidates.find(candidate => candidate?.rootCauseKey === rootCauseKey);
    if (existing) {
      existing.occurrences = Math.max(1, Number(existing.occurrences || 1)) + 1;
      existing.lastDetectedAt = nowIso();
      existing.lastEventSeq = eventSeq;
      existing.lastDetails = safeClone(finding.details || {});
      updatePanelStatus();
      schedulePersist();
      return existing;
    }
  } else {
    // Invariantes de estado no agregadas por causa raíz mantienen una ventana corta para
    // evitar repetir el MISMO snapshot roto en cada render.
    const previous = emittedInvariantFingerprints.get(rootCauseKey);
    if (previous && now - previous < 15000) return;
    emittedInvariantFingerprints.set(rootCauseKey, now);
  }

  const detectedAt = nowIso();
  const candidate = {
    id: makeId('bug'),
    detectedAt,
    firstDetectedAt: detectedAt,
    lastDetectedAt: detectedAt,
    eventSeq,
    lastEventSeq: eventSeq,
    severity: finding.severity || 'warning',
    code: finding.code,
    rootCauseKey,
    occurrences: 1,
    message: finding.message,
    details: safeClone(finding.details || {})
  };
  currentSession.bugCandidates.push(candidate);
  updatePanelStatus();
  schedulePersist();
  return candidate;
}

function recordStormSample(type) {
  const now = Date.now();
  const samples = recentEventTimes.get(type) || [];
  samples.push(now);
  while (samples.length && now - samples[0] > 2000) samples.shift();
  recentEventTimes.set(type, samples);
  if (type === 'sync_publish_start' && samples.length === 20) {
    addBugCandidate({
      code: 'POSSIBLE_SYNC_RENDER_STORM',
      severity: 'warning',
      message: 'Se registraron 20 publicaciones de sync en <=2 s.',
      details: { count: samples.length, windowMs: 2000 }
    });
  }
}

function eventRelativeMs() {
  if (!currentSession) return 0;
  return Math.round(perfNow() - currentSession._perfStarted);
}

const BOT_PRIORITY_PROGRESS_EVENT_TYPES = new Set([
  'state_change', 'priority_pass', 'advance_step_requested', 'phase_committed',
  'stack_push', 'stack_resolve_start', 'stack_resolve_end',
  'cast_transaction_begin', 'cast_cost_locked', 'cast_transaction_committed',
  'blockers_declared'
]);

export function isBotPriorityProgressEvent(type) {
  return BOT_PRIORITY_PROGRESS_EVENT_TYPES.has(type);
}

export function recordTelemetryEvent(type, data = {}, severity = 'info') {
  if (!currentSession) return null;
  const event = {
    seq: ++currentSession._seq,
    at: nowIso(),
    relativeMs: eventRelativeMs(),
    type,
    severity,
    data: safeClone(data)
  };
  currentSession.events.push(event);

  // 23.11.4: `BOT_PRIORITY_STALL` mide una MISMA ventana de prioridad, no simplemente
  // el hecho de observar `priorityPlayer === rival` en dos polls separados. Cualquier
  // progreso semántico del motor invalida el reloj previo aunque el watchdog no haya
  // alcanzado a observar el estado intermedio (race real vista en el log 23.11.3).
  if (isBotPriorityProgressEvent(type)) {
    botPriorityProgressSerial += 1;
    botPriorityLastProgressEventSeq = event.seq;
  }

  if (currentSession.events.length > MAX_EVENTS) {
    currentSession.events.splice(0, currentSession.events.length - MAX_EVENTS);
    currentSession.truncated = true;
  }

  recordStormSample(type);

  // 23.9.3: progreso temporal de combate. Dos declaraciones de bloqueadores para el mismo
  // defensor/turno son imposibles en el motor actual y fueron exactamente la firma del
  // hard-lock observado en combat_blockers con cero bloqueadores legales.
  if (type === 'blockers_declared') {
    const declarationKey = `${data.turnCount}|${data.activePlayer}|${data.player}`;
    const count = (blockerDeclarationCounts.get(declarationKey) || 0) + 1;
    blockerDeclarationCounts.set(declarationKey, count);
    if (count >= 2) {
      addBugCandidate({
        code: 'BLOCKER_DECLARATION_LOOP',
        severity: 'error',
        message: 'Se declararon bloqueadores más de una vez en el mismo combate; posible loop de progreso.',
        details: {
          turnCount: data.turnCount, activePlayer: data.activePlayer, player: data.player,
          phase: data.phase, declarationCount: count
        }
      }, event.seq);
    }
  }

  // 23.13.39 — abandonar nunca puede dejar la UI esperando Firestore indefinidamente.
  // Si el cleanup alcanza su deadline, queda como bug automático antes del upload final.
  if (type === 'abandon_cleanup_end' && data?.timedOut) {
    addBugCandidate({
      code: 'ABANDON_CLEANUP_TIMEOUT',
      severity: 'warning',
      message: 'El cierre de abandono agotó su deadline; la salida continuó por fallback.',
      details: { taskCount: data?.taskCount || 0 }
    }, event.seq);
  }

  // 23.13.40 — una excepción inesperada durante el cleanup también debe quedar en la caja negra.
  if (type === 'abandon_cleanup_exception') {
    addBugCandidate({
      code: 'ABANDON_CLEANUP_EXCEPTION',
      severity: 'error',
      message: 'El cierre de abandono encontró una excepción; la salida continuó por finally.',
      details: {
        name: data?.name || 'Error',
        message: data?.message || '',
        taskCount: data?.taskCount || 0
      }
    }, event.seq);
  }


  // 23.13.59 — economía y racha no pueden volver a fallar silenciosamente. Estos eventos
  // vienen de operaciones best-effort, pero quedan promovidos a bugCandidate automático.
  if (type === 'daily_login_reward_failed') {
    addBugCandidate({
      code: 'DAILY_REWARD_LOGIN_FAILED',
      severity: 'error',
      message: 'Falló el registro autoritativo de la racha diaria.',
      details: { code: data?.code || '', message: data?.message || '' }
    }, event.seq);
  }
  if (type === 'game_reward_deferred') {
    addBugCandidate({
      code: 'GAME_REWARD_SETTLEMENT_DEFERRED',
      severity: 'warning',
      message: 'El premio de fin de partida no pudo liquidarse en el primer intento y quedó pendiente.',
      details: {
        receiptId: data?.receiptId || '', mode: data?.mode || '', outcome: data?.outcome || '',
        baseDelta: data?.baseDelta || 0, code: data?.code || '', message: data?.message || ''
      }
    }, event.seq);
  }

  if (type === 'sync_publish_start' && data.publishId) {
    networkPublishesInFlight.add(data.publishId);
    networkPublishStartSeq.set(data.publishId, event.seq);
    if (networkPublishesInFlight.size > 1) {
      addBugCandidate({
        code: 'SYNC_PUBLISH_OVERLAP',
        severity: 'warning',
        message: 'Hay más de una publicación Firestore en vuelo al mismo tiempo.',
        details: { inFlight: [...networkPublishesInFlight] }
      }, event.seq);
    }
  } else if ((type === 'sync_publish_ok' || type === 'sync_publish_error') && data.publishId) {
    const startSeq = networkPublishStartSeq.get(data.publishId) || 0;
    if (type === 'sync_publish_ok' && startSeq && startSeq < lastCompletedPublishStartSeq) {
      addBugCandidate({
        code: 'SYNC_PUBLISH_COMPLETION_OUT_OF_ORDER',
        severity: 'warning',
        message: 'Una publicación Firestore iniciada antes terminó después de otra más nueva.',
        details: {
          publishId: data.publishId,
          publishStartSeq: startSeq,
          lastCompletedPublishStartSeq
        }
      }, event.seq);
    }
    if (type === 'sync_publish_ok') lastCompletedPublishStartSeq = Math.max(lastCompletedPublishStartSeq, startSeq);
    if (type === 'sync_publish_error') {
      addBugCandidate({
        code: 'SYNC_PUBLISH_ERROR',
        severity: 'error',
        message: 'Falló una publicación de estado multiplayer a Firestore; los clientes pueden divergir.',
        details: {
          errorName: data?.error?.name || null,
          errorMessage: data?.error?.message || String(data?.error || ''),
          publishId: data.publishId || null
        }
      }, event.seq);
    }
    networkPublishesInFlight.delete(data.publishId);
    networkPublishStartSeq.delete(data.publishId);
  }

  schedulePersist();
  updatePanelStatus();
  return event;
}

export function recordTelemetryUiLog(message) {
  return recordTelemetryEvent('ui_log', { message: String(message) });
}

export function recordTelemetryNetwork(type, data = {}, severity = 'info') {
  return recordTelemetryEvent(type, data, severity);
}

export function recordTelemetryDecision(type, data = {}, severity = 'info') {
  return recordTelemetryEvent(type, data, severity);
}


const BOT_PRIORITY_STALL_MS = 6000;

export function buildBotPriorityWatchdogKey(state, stackLength, pending, progressSerial) {
  return [
    state?.turnCount ?? '?',
    state?.phase ?? '?',
    state?.activePlayer ?? '?',
    state?.priorityPlayer ?? '?',
    Number(stackLength) || 0,
    Object.keys(pending || {}).sort().join(','),
    Number(progressSerial) || 0
  ].join('|');
}

function resetBotPriorityWatchdogWindow() {
  botPriorityStallSince = null;
  botPriorityWatchdogKey = null;
  botPriorityStallReportedKey = null;
}

function stopBotPriorityWatchdog() {
  if (botPriorityWatchdogTimer) clearInterval(botPriorityWatchdogTimer);
  botPriorityWatchdogTimer = null;
  resetBotPriorityWatchdogWindow();
}

function pollBotPriorityWatchdog() {
  if (!currentSession || currentSession.endedAt || currentSession.meta?.mode !== 'solo' || typeof providers.getState !== 'function') {
    resetBotPriorityWatchdogWindow();
    return;
  }
  const state = providers.getState();
  const stack = typeof providers.getStack === 'function' ? providers.getStack() : [];
  const pending = pendingSummary(state);
  const suspicious = !state?.gameOver
    && !state?.currentMatch
    && state?.priorityPlayer === 'rival'
    && Array.isArray(stack) && stack.length === 0
    && Object.keys(pending).length === 0;

  if (!suspicious) {
    resetBotPriorityWatchdogWindow();
    return;
  }

  const now = Date.now();
  const windowKey = buildBotPriorityWatchdogKey(state, stack.length, pending, botPriorityProgressSerial);

  // Si hubo cualquier progreso entre polls, aunque terminemos otra vez con prioridad del
  // Tano en la misma fase, es OTRA ventana temporal y su reloj comienza de cero.
  if (botPriorityWatchdogKey !== windowKey) {
    botPriorityWatchdogKey = windowKey;
    botPriorityStallSince = now;
    botPriorityStallReportedKey = null;
    return;
  }

  if (botPriorityStallSince == null) {
    botPriorityStallSince = now;
    return;
  }
  if (now - botPriorityStallSince < BOT_PRIORITY_STALL_MS) return;
  if (botPriorityStallReportedKey === windowKey) return;
  botPriorityStallReportedKey = windowKey;

  const event = recordTelemetryEvent('bot_priority_stall_detected', {
    turnCount: state.turnCount,
    phase: state.phase,
    activePlayer: state.activePlayer,
    priorityPlayer: state.priorityPlayer,
    stackLength: stack.length,
    pending,
    stalledForMs: now - botPriorityStallSince,
    watchdogWindowKey: windowKey,
    progressSerial: botPriorityProgressSerial,
    lastProgressEventSeq: botPriorityLastProgressEventSeq
  }, 'warning');
  addBugCandidate({
    code: 'BOT_PRIORITY_STALL',
    severity: 'error',
    message: 'El Tano conserva la misma ventana de prioridad sin Stack, decisión pendiente ni progreso durante demasiado tiempo.',
    details: {
      turnCount: state.turnCount,
      phase: state.phase,
      activePlayer: state.activePlayer,
      priorityPlayer: state.priorityPlayer,
      stackLength: stack.length,
      pending,
      thresholdMs: BOT_PRIORITY_STALL_MS,
      watchdogWindowKey: windowKey,
      progressSerial: botPriorityProgressSerial,
      lastProgressEventSeq: botPriorityLastProgressEventSeq
    }
  }, event?.seq ?? currentSession._seq);
}

function startBotPriorityWatchdog() {
  stopBotPriorityWatchdog();
  botPriorityWatchdogTimer = setInterval(pollBotPriorityWatchdog, 1000);
}


function resetRemoteState() {
  remoteState = {
    status: 'idle',
    lastUploadAt: null,
    lastError: null,
    uploadCount: 0,
    lastKind: null,
    lastUploadedSeq: 0,
    lastUploadedBugCount: 0,
    chunkCount: 0,
    lastChunkIds: []
  };
  remoteFinalPending = null;
  remoteFinalUploadedSessionId = null;
  updatePanelStatus();
}

function stopRemoteCheckpointLoop() {
  if (remoteCheckpointTimer) clearInterval(remoteCheckpointTimer);
  remoteCheckpointTimer = null;
}

function startRemoteCheckpointLoop() {
  stopRemoteCheckpointLoop();
  remoteCheckpointTimer = setInterval(() => {
    requestRemoteTelemetryUpload('interval_30s', { kind: 'latest', capture: true }).catch(() => {});
  }, REMOTE_CHECKPOINT_MS);
}

function remoteExportSummary() {
  return {
    checkpointIntervalMs: REMOTE_CHECKPOINT_MS,
    status: remoteState.status,
    lastUploadAt: remoteState.lastUploadAt,
    lastError: remoteState.lastError,
    uploadCount: remoteState.uploadCount,
    lastKind: remoteState.lastKind,
    lastUploadedSeq: remoteState.lastUploadedSeq,
    lastUploadedBugCount: remoteState.lastUploadedBugCount,
    chunkCount: remoteState.chunkCount
  };
}

function cloneRemoteDeltaList(items) {
  // `safeClone(array)` limita arrays genéricos a 120 elementos para proteger snapshots UI.
  // Un delta REMOTO no puede usar ese límite: perder un evento y después adelantar
  // lastUploadedSeq lo vuelve irrecuperable. Clonamos cada entrada por separado (cada evento
  // sigue teniendo sus propios límites internos), pero nunca truncamos la lista exterior.
  return (Array.isArray(items) ? items : []).map(item => safeClone(item, 0, new WeakSet()));
}

function buildRemoteCheckpoint(session, kind, reason) {
  const lastSeq = remoteState.lastUploadedSeq || 0;
  const lastBugCount = remoteState.lastUploadedBugCount || 0;
  const events = session.events.filter(event => Number(event?.seq || 0) > lastSeq);
  const bugCandidates = session.bugCandidates.slice(lastBugCount);
  const earliestAvailableSeq = session.events[0]?.seq || null;
  const gapDetected = earliestAvailableSeq != null && lastSeq > 0 && earliestAvailableSeq > lastSeq + 1;
  const throughSeq = events.length ? Number(events[events.length - 1]?.seq || lastSeq) : lastSeq;
  const throughBugCount = lastBugCount + bugCandidates.length;

  return {
    sessionId: session.sessionId,
    kind,
    reason,
    throughSeq,
    throughBugCount,
    gapDetected,
    gapAfterSeq: gapDetected ? lastSeq : null,
    earliestAvailableSeq,
    events: cloneRemoteDeltaList(events),
    bugCandidates: cloneRemoteDeltaList(bugCandidates),
    summary: {
      schemaVersion: session.schemaVersion,
      telemetryVersion: session.telemetryVersion,
      engineBaseline: session.engineBaseline,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      endReason: session.endReason,
      meta: safeClone(session.meta),
      remote: remoteExportSummary(),
      stats: buildStats(session),
      finalSnapshot: safeClone(session.finalSnapshot),
      bugCandidates: safeClone(session.bugCandidates),
      truncated: !!session.truncated
    }
  };
}

async function performRemoteTelemetryUpload(session, user, kind, reason) {
  if (typeof providers.uploadRemote !== 'function') {
    remoteState.status = 'disabled';
    updatePanelStatus();
    return false;
  }

  // Checkpoint incremental de verdad: si en estos 30 s no apareció ningún evento ni bug
  // nuevo, no hay nada que escribir. Esto evita escrituras de Firestore por puro heartbeat.
  let checkpoint = buildRemoteCheckpoint(session, kind, reason);
  if (kind !== 'final' && !checkpoint.gapDetected && checkpoint.events.length === 0 && checkpoint.bugCandidates.length === 0) {
    remoteState.status = 'ok';
    remoteState.lastError = null;
    updatePanelStatus();
    return true;
  }

  remoteState.status = 'syncing';
  remoteState.lastError = null;
  updatePanelStatus();
  if (checkpoint.gapDetected) {
    addBugCandidate({
      code: 'REMOTE_TELEMETRY_GAP',
      severity: 'error',
      message: 'La cola local se truncó antes de que todos los eventos pudieran confirmarse remotamente.',
      details: {
        lastUploadedSeq: remoteState.lastUploadedSeq,
        earliestAvailableSeq: checkpoint.earliestAvailableSeq
      }
    }, checkpoint.earliestAvailableSeq);
    // Incluye el propio hallazgo de gap en este mismo checkpoint (importante si era final).
    checkpoint = buildRemoteCheckpoint(session, kind, reason);
  }

  const promise = Promise.resolve(providers.uploadRemote({
    uid: user.uid,
    playerName: session.meta?.localPlayerName || 'Jugador',
    checkpoint,
    reason
  }));
  remoteUploadInFlight = promise;

  try {
    const result = await promise;
    remoteState.status = 'ok';
    remoteState.lastUploadAt = nowIso();
    remoteState.lastError = null;
    remoteState.uploadCount += 1;
    remoteState.lastKind = kind;
    remoteState.lastUploadedSeq = Math.max(remoteState.lastUploadedSeq || 0, result?.uploadedThroughSeq ?? checkpoint.throughSeq ?? 0);
    remoteState.lastUploadedBugCount = Math.max(remoteState.lastUploadedBugCount || 0, result?.uploadedThroughBugCount ?? checkpoint.throughBugCount ?? 0);
    remoteState.chunkCount += result?.chunkCount || 0;
    remoteState.lastChunkIds = Array.isArray(result?.chunkIds) ? result.chunkIds.slice(-6) : [];
    if (kind === 'final') remoteFinalUploadedSessionId = session.sessionId;
    // No registramos un evento de "upload OK" dentro del propio stream: hacerlo dejaba
    // siempre un evento pendiente y provocaba una escritura inútil en el checkpoint siguiente.
    return true;
  } catch (error) {
    remoteState.status = 'error';
    remoteState.lastError = String(error?.message || error || 'Error desconocido').slice(0, 500);
    recordTelemetryEvent('telemetry_remote_upload_error', {
      kind,
      reason,
      error
    }, 'error');
    // Un final fallido no queda abandonado: mientras la pestaña siga viva, reintenta a los
    // 30 s. Los checkpoints normales ya tienen su propio próximo intento periódico.
    if (kind === 'final' && session === currentSession) {
      setTimeout(() => {
        if (remoteFinalUploadedSessionId !== session.sessionId) {
          requestRemoteTelemetryUpload('final_retry_30s', { kind: 'final', capture: false }).catch(() => {});
        }
      }, REMOTE_CHECKPOINT_MS);
    }
    return false;
  } finally {
    remoteUploadInFlight = null;
    updatePanelStatus();
    const pending = remoteFinalPending;
    remoteFinalPending = null;
    if (pending && pending.session === currentSession && remoteFinalUploadedSessionId !== pending.session.sessionId) {
      setTimeout(() => {
        requestRemoteTelemetryUpload(pending.reason, { kind: 'final', capture: false }).catch(() => {});
      }, 0);
    }
  }
}

export async function requestRemoteTelemetryUpload(reason = 'manual', options = {}) {
  const session = currentSession;
  if (!session) return false;

  if (options.capture !== false) captureTelemetryState(`remote_${reason}`);
  let kind = options.kind === 'final' ? 'final' : 'latest';
  if (session.endedAt) kind = 'final';
  if (kind === 'final' && remoteFinalUploadedSessionId === session.sessionId) return true;

  const user = typeof providers.getCurrentUser === 'function' ? providers.getCurrentUser() : null;
  if (!user?.uid) {
    remoteState.status = 'no_auth';
    remoteState.lastError = null;
    updatePanelStatus();
    return false;
  }

  if (remoteUploadInFlight) {
    if (kind === 'final') {
      remoteFinalPending = { session, reason };
      remoteState.status = 'final_pending';
      updatePanelStatus();
    }
    return false;
  }

  return performRemoteTelemetryUpload(session, user, kind, reason);
}

export function startTelemetrySession(meta = {}) {
  if (currentSession && currentSession.events.length > 0) {
    recoveredSession = exportableSession(currentSession);
    safeStorageSet(STORAGE_RECOVERED, recoveredSession);
  }

  const state = typeof providers.getState === 'function' ? providers.getState() : null;
  currentSession = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    telemetryVersion: TELEMETRY_VERSION,
    engineBaseline: ENGINE_BASELINE,
    sessionId: makeId('game'),
    startedAt: nowIso(),
    endedAt: null,
    endReason: null,
    meta: {
      mode: meta.mode || (state?.currentMatch ? 'multiplayer' : 'solo'),
      difficulty: meta.difficulty ?? state?.botDifficulty ?? null,
      matchId: meta.matchId ?? state?.currentMatch?.matchId ?? null,
      myRole: meta.myRole ?? state?.currentMatch?.myRole ?? null,
      deckLabel: meta.deckLabel ?? null,
      soloGameId: meta.soloGameId ?? null,
      segmentIndex: Number.isFinite(Number(meta.segmentIndex)) ? Number(meta.segmentIndex) : null,
      activeElapsedBaseMs: Math.max(0, Number(meta.activeElapsedBaseMs) || 0),
      engineVersion: ENGINE_VERSION,
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      page: typeof location !== 'undefined' ? location.pathname : null,
      localPlayerName: typeof providers.getLocalPlayerName === 'function' ? providers.getLocalPlayerName() : null,
      rivalName: typeof providers.getRivalName === 'function' ? providers.getRivalName() : null
    },
    events: [],
    bugCandidates: [],
    truncated: false,
    finalSnapshot: null,
    stats: null,
    _perfStarted: perfNow(),
    _seq: 0
  };
  lastSnapshot = null;
  lastSnapshotJson = '';
  emittedInvariantFingerprints.clear();
  networkPublishesInFlight.clear();
  networkPublishStartSeq.clear();
  lastCompletedPublishStartSeq = 0;
  recentEventTimes.clear();
  blockerDeclarationCounts.clear();
  cardInstanceIds = new WeakMap();
  nextCardInstanceId = 1;
  stopRemoteCheckpointLoop();
  resetRemoteState();
  recordTelemetryEvent('session_start', currentSession.meta);
  captureTelemetryState('session_start');
  safeStorageRemove(STORAGE_CURRENT);
  schedulePersist();
  updatePanelStatus();
  startRemoteCheckpointLoop();
  startBotPriorityWatchdog();
  // Primer checkpoint apenas nace la sesión; después, uno incremental cada 30 s.
  setTimeout(() => requestRemoteTelemetryUpload('session_start', { kind: 'latest', capture: true }).catch(() => {}), 0);
  return currentSession.sessionId;
}

export function recordTelemetryInitialDecks(options = {}) {
  if (!currentSession || typeof providers.getState !== 'function') return;
  const state = providers.getState();
  const revealRival = options.revealRival ?? !state.currentMatch;
  const reconstructLocalOpening = !!options.reconstructLocalOpeningHand;
  const localDeckCards = Array.isArray(state.localDeck) ? [...state.localDeck] : [];
  if (reconstructLocalOpening && Array.isArray(state.localHand)) {
    localDeckCards.push(...[...state.localHand].reverse());
  }
  recordTelemetryEvent('initial_decks', {
    local: {
      count: localDeckCards.length,
      reconstructedFromOpeningHand: reconstructLocalOpening,
      cardsBottomToTop: localDeckCards.map(cardSummary)
    },
    rival: revealRival ? {
      count: Array.isArray(state.rivalDeck) ? state.rivalDeck.length : null,
      cardsBottomToTop: Array.isArray(state.rivalDeck) ? state.rivalDeck.map(cardSummary) : []
    } : {
      count: Array.isArray(state.rivalDeck) ? state.rivalDeck.length : null,
      hidden: true
    }
  });
}

export function captureTelemetryState(reason = 'render') {
  if (!currentSession || typeof providers.getState !== 'function') return null;
  const state = providers.getState();
  const stack = typeof providers.getStack === 'function' ? providers.getStack() : [];
  const snapshot = buildSnapshot(state, stack);
  const snapshotJson = JSON.stringify(snapshot);

  let event = null;
  if (snapshotJson !== lastSnapshotJson) {
    const changes = lastSnapshot ? diffSnapshots(lastSnapshot, snapshot) : [{ path: '$', before: null, after: snapshot }];
    event = recordTelemetryEvent('state_change', {
      reason,
      changes
    });
    lastSnapshot = snapshot;
    lastSnapshotJson = snapshotJson;
  }

  const findings = invariantFindings(state, stack);
  findings.forEach(finding => addBugCandidate(finding, event?.seq ?? currentSession._seq));

  if (snapshot.turn.gameOver && !currentSession.endedAt) {
    currentSession.endedAt = nowIso();
    currentSession.endReason = 'game_over_detected';
    recordTelemetryEvent('session_end_detected', {
      turnCount: snapshot.turn.turnCount,
      phase: snapshot.turn.phase
    });
    stopRemoteCheckpointLoop();
    stopBotPriorityWatchdog();
    // No bloquea render(): el final se sube en segundo plano y queda serializado si había
    // un checkpoint periódico todavía en vuelo.
    setTimeout(() => requestRemoteTelemetryUpload('game_over_detected', { kind: 'final', capture: false }).catch(() => {}), 0);
  }

  currentSession.finalSnapshot = snapshot;
  schedulePersist();
  return snapshot;
}

export function endTelemetrySession(reason = 'manual') {
  if (!currentSession) return;
  captureTelemetryState('session_end');
  if (!currentSession.endedAt) currentSession.endedAt = nowIso();
  currentSession.endReason = reason;
  recordTelemetryEvent('session_end', { reason });
  schedulePersist(true);
  stopRemoteCheckpointLoop();
  stopBotPriorityWatchdog();
  requestRemoteTelemetryUpload(reason, { kind: 'final', capture: false }).catch(() => {});
}

function summarizeTarget(target) {
  if (!target) return null;
  const cardEl = typeof target.closest === 'function' ? target.closest('.card') : null;
  const buttonEl = typeof target.closest === 'function' ? target.closest('button') : null;
  const el = buttonEl || cardEl || target;
  const dataset = {};
  if (el?.dataset) {
    Object.keys(el.dataset).slice(0, 12).forEach(key => { dataset[key] = el.dataset[key]; });
  }
  return {
    tag: el?.tagName || null,
    id: el?.id || null,
    className: typeof el?.className === 'string' ? el.className.slice(0, 220) : null,
    title: el?.title ? String(el.title).slice(0, 160) : null,
    text: el?.textContent ? String(el.textContent).replace(/\s+/g, ' ').trim().slice(0, 180) : null,
    dataset
  };
}

function installInteractionCapture() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', event => {
    if (!currentSession) return;
    if (panel && panel.contains && panel.contains(event.target)) return;
    recordTelemetryEvent('ui_click', summarizeTarget(event.target));
  }, true);

  document.addEventListener('keydown', event => {
    if (!currentSession) return;
    if (event.repeat) return;
    if (![' ', 'Escape', 'Enter'].includes(event.key)) return;
    recordTelemetryEvent('ui_key', {
      key: event.key === ' ' ? 'Space' : event.key,
      target: summarizeTarget(event.target)
    });
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!currentSession) return;
    recordTelemetryEvent('visibility_change', { visibilityState: document.visibilityState });
  });
}

function installRuntimeCapture() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', event => {
    if (!currentSession) return;
    const ev = recordTelemetryEvent('js_error', {
      message: event.message || event.error?.message || 'Error desconocido',
      filename: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
      error: event.error || null
    }, 'error');
    addBugCandidate({
      code: 'JS_ERROR',
      severity: 'error',
      message: event.message || event.error?.message || 'Error JavaScript',
      details: { filename: event.filename, lineno: event.lineno, colno: event.colno }
    }, ev?.seq);
  });

  window.addEventListener('unhandledrejection', event => {
    if (!currentSession) return;
    const reason = event.reason instanceof Error ? event.reason : safeClone(event.reason);
    const ev = recordTelemetryEvent('unhandled_rejection', { reason }, 'error');
    addBugCandidate({
      code: 'UNHANDLED_REJECTION',
      severity: 'error',
      message: event.reason?.message || 'Promise rechazada sin handler',
      details: { reason }
    }, ev?.seq);
  });

  window.addEventListener('online', () => {
    if (currentSession) recordTelemetryEvent('network_status', { online: true });
  });
  window.addEventListener('offline', () => {
    if (currentSession) recordTelemetryEvent('network_status', { online: false }, 'warning');
  });

  if (typeof console !== 'undefined') {
    originalConsoleError = console.error.bind(console);
    originalConsoleWarn = console.warn.bind(console);
    console.error = (...args) => {
      if (currentSession) recordTelemetryEvent('console_error', { args }, 'error');
      originalConsoleError(...args);
    };
    console.warn = (...args) => {
      if (currentSession) recordTelemetryEvent('console_warn', { args }, 'warning');
      originalConsoleWarn(...args);
    };
  }
}

function humanSummary(session) {
  const typeCounts = {};
  session.events.forEach(ev => { typeCounts[ev.type] = (typeCounts[ev.type] || 0) + 1; });
  const errors = session.events.filter(ev => ev.severity === 'error').length;
  const warnings = session.events.filter(ev => ev.severity === 'warning').length;
  const manual = session.bugCandidates.filter(b => b.code === 'MANUAL_BUG_MARKER').length;
  const auto = session.bugCandidates.length - manual;

  return [
    `Argentinia — Diagnóstico de partida`,
    `Sesión: ${session.sessionId}`,
    `Motor base: ${session.engineBaseline}`,
    `Telemetría: ${session.telemetryVersion} / schema ${session.schemaVersion}`,
    `Inicio: ${session.startedAt}`,
    `Fin: ${session.endedAt || '(sesión todavía abierta)'}`,
    `Modo: ${session.meta.mode || '?'}`,
    session.meta.matchId ? `Match: ${session.meta.matchId} (${session.meta.myRole || '?'})` : null,
    `Eventos: ${session.events.length} | errores: ${errors} | warnings: ${warnings}`,
    `Candidatos de bug: ${session.bugCandidates.length} (manuales: ${manual}, automáticos: ${auto})`,
    `Tipos de evento: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`
  ].filter(Boolean).join('\n');
}

function buildStats(session) {
  const byType = {};
  const bySeverity = {};
  session.events.forEach(ev => {
    byType[ev.type] = (byType[ev.type] || 0) + 1;
    bySeverity[ev.severity] = (bySeverity[ev.severity] || 0) + 1;
  });
  const manualBugMarkerCount = session.bugCandidates.filter(b => b?.code === 'MANUAL_BUG_MARKER').length;
  const automaticBugCandidateCount = Math.max(0, session.bugCandidates.length - manualBugMarkerCount);
  const automaticBugOccurrenceCount = session.bugCandidates
    .filter(b => b?.code !== 'MANUAL_BUG_MARKER')
    .reduce((sum, b) => sum + Math.max(1, Number(b?.occurrences || 1)), 0);
  return {
    eventCount: session.events.length,
    bugCandidateCount: session.bugCandidates.length,
    automaticBugCandidateCount,
    automaticBugOccurrenceCount,
    manualBugMarkerCount,
    elapsedMs: Math.max(0, ...session.events.map(ev => Number(ev?.relativeMs) || 0)),
    byType,
    bySeverity,
    truncated: !!session.truncated
  };
}

function exportableSession(session) {
  if (!session) return null;
  const clean = {
    schemaVersion: session.schemaVersion,
    telemetryVersion: session.telemetryVersion,
    engineBaseline: session.engineBaseline,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    endReason: session.endReason,
    meta: safeClone(session.meta),
    remote: safeClone(session === currentSession ? remoteExportSummary() : (session.remote || null)),
    stats: buildStats(session),
    humanSummary: humanSummary(session),
    bugCandidates: safeClone(session.bugCandidates),
    finalSnapshot: safeClone(session.finalSnapshot),
    events: safeClone(session.events),
    truncated: !!session.truncated
  };
  return clean;
}

function schedulePersist(immediate = false) {
  if (!currentSession) return;
  if (persistTimer) clearTimeout(persistTimer);
  const run = () => {
    persistTimer = null;
    let exportable = exportableSession(currentSession);
    let raw = '';
    try { raw = JSON.stringify(exportable); } catch { return; }

    if (raw.length > MAX_PERSIST_CHARS) {
      // Conserva errores/bugs y el tramo más reciente. El archivo exportado durante ESTA
      // pestaña mantiene los eventos completos (hasta MAX_EVENTS); sólo el backup de crash
      // se recorta para no reventar la cuota típica de localStorage.
      const important = currentSession.events.filter(ev =>
        ev.severity === 'error' || ev.severity === 'warning' || ev.type === 'manual_bug_marker'
      );
      const recent = currentSession.events.slice(-3500);
      const merged = [...important, ...recent]
        .sort((a, b) => a.seq - b.seq)
        .filter((ev, idx, arr) => idx === 0 || ev.seq !== arr[idx - 1].seq);
      exportable = { ...exportable, events: safeClone(merged), persistedTruncated: true };
    }
    safeStorageSet(STORAGE_CURRENT, exportable);
  };
  if (immediate) run();
  else persistTimer = setTimeout(run, 300);
}

function downloadObject(obj, filename) {
  if (!obj || typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function safeFilenamePart(value) {
  return String(value || 'partida').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'partida';
}

export function exportTelemetry(session = currentSession) {
  if (!session) return false;
  if (session === currentSession) captureTelemetryState('export');
  const payload = exportableSession(session);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mode = safeFilenamePart(payload.meta?.mode);
  const role = payload.meta?.myRole ? `_${safeFilenamePart(payload.meta.myRole)}` : '';
  const filename = `Argentinia_Diagnostico_${mode}${role}_${stamp}_${safeFilenamePart(payload.sessionId)}.json`;
  const ok = downloadObject(payload, filename);
  if (session === currentSession) recordTelemetryEvent('diagnostic_export', { filename, ok });
  return ok;
}

export function markTelemetryBug(note = null) {
  if (!currentSession) return false;
  captureTelemetryState('manual_bug_marker');
  let finalNote = note;
  if (finalNote == null && typeof window !== 'undefined' && typeof window.prompt === 'function') {
    finalNote = window.prompt('¿Qué viste raro? (podés dejarlo vacío y aceptar)');
    if (finalNote === null) return false;
  }
  const event = recordTelemetryEvent('manual_bug_marker', {
    note: String(finalNote || '').trim() || '(sin descripción)',
    snapshotTurn: lastSnapshot?.turn || null
  }, 'warning');
  addBugCandidate({
    code: 'MANUAL_BUG_MARKER',
    severity: 'warning',
    message: String(finalNote || '').trim() || 'Bug marcado manualmente por el jugador.',
    details: { snapshotTurn: lastSnapshot?.turn || null }
  }, event?.seq);
  flashPanel('🐞 Marcado');
  // El bug manual es el instante de mayor valor diagnóstico: además del ciclo de 30 s,
  // fuerza un checkpoint Firestore inmediato para no perder ese contexto si la pestaña muere después.
  requestRemoteTelemetryUpload('manual_bug_marker', { kind: 'latest', capture: false }).catch(() => {});
  return true;
}

function flashPanel(text) {
  if (!statusEl) return;
  const old = statusEl.textContent;
  statusEl.textContent = text;
  setTimeout(() => updatePanelStatus(), 1200);
  return old;
}

function button(label, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.className = 'telemetry-btn';
  b.addEventListener('click', onClick);
  return b;
}

function buildPanel() {
  if (typeof document === 'undefined' || !document.body || panel) return;
  panel = document.createElement('div');
  panel.id = 'argentinia-telemetry-panel';
  panel.className = 'telemetry-panel';

  statusEl = document.createElement('span');
  statusEl.className = 'telemetry-status';
  cloudEl = document.createElement('span');
  cloudEl.className = 'telemetry-cloud';
  bugsEl = document.createElement('span');
  bugsEl.className = 'telemetry-bugs';

  // ENTREGA 23.13.55: el REC usa el mismo patrón colapsable en desktop y mobile.
  // El toggle nace acá (capa común), por lo que mobileUI sólo queda como fallback legacy
  // y nunca crea un segundo botón si Telemetry ya construyó el control universal.
  const recToggle = document.createElement('button');
  recToggle.id = 'arg-mobile-telemetry-toggle';
  recToggle.className = 'arg-mobile-telemetry-toggle';
  recToggle.type = 'button';
  recToggle.textContent = '🔴 REC';
  recToggle.setAttribute('aria-expanded', 'false');
  recToggle.setAttribute('aria-label', 'Desplegar panel de reporte de bugs');
  recToggle.addEventListener('click', () => {
    const expanded = panel.classList.toggle('arg-mobile-telemetry-expanded');
    recToggle.textContent = expanded ? '✕ REC' : '🔴 REC';
    recToggle.setAttribute('aria-expanded', String(expanded));
    recToggle.setAttribute('aria-label', expanded ? 'Colapsar panel de reporte de bugs' : 'Desplegar panel de reporte de bugs');
  });

  const markBtn = button('🐞 Marcar', 'Marcar este instante como bug observado y subir checkpoint inmediato', () => markTelemetryBug());
  uploadBtn = button('☁️ Subir ahora', 'Forzar un checkpoint remoto ahora mismo', () => {
    requestRemoteTelemetryUpload('hud_manual', { kind: 'latest', capture: true }).catch(() => {});
  });

  // ENTREGA 23.5.1: la descarga central vive en Admin > DEBUGGING. Conservamos
  // exportTelemetry()/recovery internamente como red de seguridad, pero quitamos los dos
  // controles redundantes del HUD para no tapar superficie de juego.
  panel.append(recToggle, statusEl, cloudEl, bugsEl, markBtn, uploadBtn);
  document.body.appendChild(panel);
  updatePanelStatus();
}

function updatePanelStatus() {
  if (!statusEl || !bugsEl) return;
  if (!currentSession) {
    statusEl.textContent = `🧪 v${ENGINE_VERSION_SHORT}`;
    bugsEl.textContent = '🐞 0';
  } else {
    const ended = !!currentSession.endedAt;
    statusEl.textContent = ended ? `🧪 v${ENGINE_VERSION_SHORT} · ${currentSession.events.length}` : `🔴 v${ENGINE_VERSION_SHORT} · ${currentSession.events.length}`;
    bugsEl.textContent = `🐞 ${currentSession.bugCandidates.length}`;
  }

  if (cloudEl) {
    const labels = {
      idle: '☁️ listo',
      syncing: '☁️ subiendo…',
      ok: '☁️ Sync ✓',
      error: '☁️ error',
      no_auth: '☁️ sin login',
      disabled: '☁️ desactivado',
      final_pending: '☁️ final…'
    };
    cloudEl.textContent = labels[remoteState.status] || '☁️ listo';
    const details = [];
    if (remoteState.lastUploadAt) details.push(`Última subida: ${remoteState.lastUploadAt}`);
    if (remoteState.lastUploadedSeq) details.push(`Confirmado hasta evento #${remoteState.lastUploadedSeq}`);
    if (remoteState.chunkCount) details.push(`Chunks escritos: ${remoteState.chunkCount}`);
    if (remoteState.lastError) details.push(`Error: ${remoteState.lastError}`);
    cloudEl.title = details.join(' | ');
  }
  if (uploadBtn) uploadBtn.disabled = !currentSession || remoteState.status === 'syncing';
}

function recoverStoredSession() {
  const current = safeStorageGet(STORAGE_CURRENT);
  const recovered = safeStorageGet(STORAGE_RECOVERED);
  recoveredSession = current || recovered || null;
  if (recoveredSession) safeStorageSet(STORAGE_RECOVERED, recoveredSession);
}

export function initTelemetry(options = {}) {
  providers = {
    ...providers,
    ...options
  };
  if (installed) return;
  installed = true;
  recoverStoredSession();
  installRuntimeCapture();
  installInteractionCapture();
  if (typeof document !== 'undefined') {
    if (document.body) buildPanel();
    else document.addEventListener('DOMContentLoaded', buildPanel, { once: true });
  }
}

export function getTelemetryStatus() {
  return {
    installed,
    active: !!currentSession,
    sessionId: currentSession?.sessionId || null,
    startedAt: currentSession?.startedAt || null,
    elapsedMs: currentSession ? eventRelativeMs() : 0,
    eventCount: currentSession?.events.length || 0,
    bugCandidateCount: currentSession?.bugCandidates.length || 0,
    endedAt: currentSession?.endedAt || null,
    recoveredAvailable: !!recoveredSession,
    remote: remoteExportSummary()
  };
}

// Exportadas para tests de contrato sin necesitar DOM.
export const __telemetryTest = {
  safeClone,
  cardSummary,
  buildSnapshot,
  diffSnapshots,
  invariantFindings,
  exportableSession,
  remoteExportSummary,
  buildRemoteCheckpoint,
  bugRootCauseKey,
  addBugCandidate,
  getCurrentSession: () => currentSession
};
