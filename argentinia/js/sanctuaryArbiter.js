// Argentinia · Santuario Stage 18 — árbitro unificado Sello + Resonancia.
// Este módulo es puro respecto de cámara/backend: decide UNA única fuente activa y
// administra la ventana de prioridad Barcode antes del fallback por Resonancia.

export const SANCTUARY_ARBITER_STAGE = 18;
export const SANCTUARY_BARCODE_PRIORITY_WINDOW_MS = 4200;

export const SANCTUARY_ARBITER_STATES = Object.freeze({
  IDLE: 'IDLE',
  SCANNING_BARCODE: 'SCANNING_BARCODE',
  SCANNING_RESONANCE: 'SCANNING_RESONANCE',
  SCANNING_BOTH: 'SCANNING_BOTH',
  RESONANCE_CANDIDATE: 'RESONANCE_CANDIDATE',
  RESOLVING: 'RESOLVING',
  PREPARED: 'PREPARED',
  CLAIMING: 'CLAIMING',
  RITUAL: 'RITUAL',
  ABORTED: 'ABORTED'
});

const SOURCE_BARCODE = 'barcode';
const SOURCE_RESONANCE = 'resonance';

function cleanInput(value) {
  return String(value || '').trim();
}

function defaultSetTimer(fn, delay) {
  return setTimeout(fn, delay);
}
function defaultClearTimer(timer) {
  clearTimeout(timer);
}

export function createSanctuarySourceArbiter({
  barcodeEnabled = false,
  resonanceEnabled = false,
  priorityWindowMs = SANCTUARY_BARCODE_PRIORITY_WINDOW_MS,
  now = () => Date.now(),
  setTimer = defaultSetTimer,
  clearTimer = defaultClearTimer,
  onDecision = null,
  onFallbackOpen = null
} = {}) {
  const barcode = !!barcodeEnabled;
  const resonance = !!resonanceEnabled;
  const windowMs = Math.max(1000, Math.floor(Number(priorityWindowMs) || SANCTUARY_BARCODE_PRIORITY_WINDOW_MS));
  let state = SANCTUARY_ARBITER_STATES.IDLE;
  let generation = 0;
  let startedAtMs = 0;
  let priorityDeadlineMs = 0;
  let fallbackOpen = !barcode;
  let resonanceCandidate = '';
  let resolutionType = '';
  let resolutionInput = '';
  let timer = null;
  let lastDecision = null;

  const clearPriorityTimer = () => {
    if (timer !== null) {
      try { clearTimer(timer); } catch {}
      timer = null;
    }
  };

  const isScanning = () => state === SANCTUARY_ARBITER_STATES.SCANNING_BARCODE
    || state === SANCTUARY_ARBITER_STATES.SCANNING_RESONANCE
    || state === SANCTUARY_ARBITER_STATES.SCANNING_BOTH
    || state === SANCTUARY_ARBITER_STATES.RESONANCE_CANDIDATE;

  const emitDecision = (source, input, reason, decidedAtMs = Number(now()) || Date.now()) => {
    const clean = cleanInput(input);
    if (!clean || !isScanning() || resolutionType) return null;
    if (source === SOURCE_BARCODE && !barcode) return null;
    if (source === SOURCE_RESONANCE && !resonance) return null;
    clearPriorityTimer();
    resolutionType = source;
    resolutionInput = clean;
    state = SANCTUARY_ARBITER_STATES.RESOLVING;
    const decision = Object.freeze({
      source,
      input: clean,
      reason: String(reason || ''),
      generation,
      decidedAtMs,
      priorityDeadlineMs
    });
    lastDecision = decision;
    if (typeof onDecision === 'function') {
      try {
        const maybePromise = onDecision(decision);
        if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => {});
      } catch {}
    }
    return decision;
  };

  const openFallback = (atMs = Number(now()) || Date.now()) => {
    if (!barcode || !resonance || !isScanning() || resolutionType) return null;
    fallbackOpen = true;
    if (typeof onFallbackOpen === 'function') {
      try { onFallbackOpen(snapshot()); } catch {}
    }
    if (resonanceCandidate) return emitDecision(SOURCE_RESONANCE, resonanceCandidate, 'barcode_priority_timeout', atMs);
    state = SANCTUARY_ARBITER_STATES.SCANNING_BOTH;
    return null;
  };

  const schedulePriorityTimer = () => {
    clearPriorityTimer();
    if (!barcode || !resonance || fallbackOpen || !isScanning()) return;
    const delay = Math.max(0, priorityDeadlineMs - (Number(now()) || Date.now()));
    timer = setTimer(() => {
      timer = null;
      openFallback(Number(now()) || Date.now());
    }, delay);
  };

  const start = (atMs = Number(now()) || Date.now()) => {
    clearPriorityTimer();
    generation += 1;
    startedAtMs = Number(atMs) || Date.now();
    priorityDeadlineMs = barcode && resonance ? startedAtMs + windowMs : 0;
    fallbackOpen = !barcode;
    resonanceCandidate = '';
    resolutionType = '';
    resolutionInput = '';
    lastDecision = null;
    if (barcode && resonance) state = SANCTUARY_ARBITER_STATES.SCANNING_BOTH;
    else if (barcode) state = SANCTUARY_ARBITER_STATES.SCANNING_BARCODE;
    else if (resonance) state = SANCTUARY_ARBITER_STATES.SCANNING_RESONANCE;
    else state = SANCTUARY_ARBITER_STATES.IDLE;
    schedulePriorityTimer();
    return snapshot();
  };

  const offerBarcode = (gtin, atMs = Number(now()) || Date.now()) => {
    const clean = cleanInput(gtin);
    if (!clean || !barcode || !isScanning() || resolutionType) return null;
    const time = Number(atMs) || Date.now();
    // La prioridad del Sello es dura sólo DENTRO de la ventana contractual.
    // Si el event loop demoró el timer pero ya venció el deadline, promovemos primero
    // cualquier Resonancia que ya estaba estable esperando; así el resultado depende
    // del reloj contractual y no del orden accidental de callbacks del navegador.
    if (resonance && !fallbackOpen && priorityDeadlineMs && time >= priorityDeadlineMs) {
      openFallback(time);
      if (resolutionType) return null;
    }
    // Con fallback abierto y sin candidato previo todavía puede ganar el primer Sello
    // estable, siempre que Resonancia no haya sido seleccionada antes.
    return emitDecision(SOURCE_BARCODE, clean, 'barcode_stable', time);
  };

  const offerResonance = (signature, atMs = Number(now()) || Date.now()) => {
    const clean = cleanInput(signature);
    if (!clean || !resonance || !isScanning() || resolutionType) return null;
    resonanceCandidate = clean;
    const time = Number(atMs) || Date.now();
    if (!barcode) return emitDecision(SOURCE_RESONANCE, clean, 'resonance_only', time);
    if (fallbackOpen || (priorityDeadlineMs && time >= priorityDeadlineMs)) {
      fallbackOpen = true;
      return emitDecision(SOURCE_RESONANCE, clean, 'barcode_priority_elapsed', time);
    }
    state = SANCTUARY_ARBITER_STATES.RESONANCE_CANDIDATE;
    return null;
  };

  const markPrepared = source => {
    if (cleanInput(source) !== resolutionType || !resolutionType) return false;
    if (state !== SANCTUARY_ARBITER_STATES.RESOLVING && state !== SANCTUARY_ARBITER_STATES.CLAIMING && state !== SANCTUARY_ARBITER_STATES.PREPARED) return false;
    state = SANCTUARY_ARBITER_STATES.PREPARED;
    return true;
  };

  const markClaiming = source => {
    if (cleanInput(source) !== resolutionType || state !== SANCTUARY_ARBITER_STATES.PREPARED) return false;
    state = SANCTUARY_ARBITER_STATES.CLAIMING;
    return true;
  };

  const markRitual = source => {
    if (cleanInput(source) !== resolutionType || state !== SANCTUARY_ARBITER_STATES.CLAIMING) return false;
    state = SANCTUARY_ARBITER_STATES.RITUAL;
    return true;
  };

  const abort = () => {
    clearPriorityTimer();
    generation += 1;
    state = SANCTUARY_ARBITER_STATES.ABORTED;
    resonanceCandidate = '';
    resolutionType = '';
    resolutionInput = '';
    lastDecision = null;
    return snapshot();
  };

  function snapshot() {
    return Object.freeze({
      stage: SANCTUARY_ARBITER_STAGE,
      state,
      generation,
      barcodeEnabled: barcode,
      resonanceEnabled: resonance,
      priorityWindowMs: windowMs,
      startedAtMs,
      priorityDeadlineMs,
      fallbackOpen,
      resonanceCandidate,
      resolutionType,
      resolutionInput,
      lastDecision
    });
  }

  return Object.freeze({
    start,
    offerBarcode,
    offerResonance,
    openFallback,
    markPrepared,
    markClaiming,
    markRitual,
    abort,
    snapshot
  });
}
