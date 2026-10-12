// Local QA only. Disabled by default, never console/telemetry/Firestore/state.
// Enable BEFORE importing the engine on localhost: __ARGENTINIA_PRIORITY_QA__=true.
// Only scalar rule summaries are admitted; never card IDs, names, hands or targets.
const ALLOWED = new Set(['mode','reason','available','action','legalActions','legalReason',
  'category','phase','turnCount','activePlayer','priorityPlayer','consecutivePasses',
  'priorityClockSerial','triggerStackSerial','stackDepth','activity','blockingField',
  'generation','ticketSerial','lease','window','canPass','buttonDisabled','buttonHidden',
  'loadingHidden','blocker','stopCount','committed','elapsedMs',
  'networkReady','networkRevision','networkReason','ackConfirmed']);
export function priorityDiagnosticsEnabled() {
  return globalThis.__ARGENTINIA_PRIORITY_QA__ === true &&
    ['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname);
}
export function recordPriorityDiagnostic(event, summary = {}) {
  if (!priorityDiagnosticsEnabled()) return;
  const buffer = globalThis.__ARGENTINIA_PRIORITY_TRACE__ ||= [];
  const safe = {};
  for (const [key, value] of Object.entries(summary)) if (ALLOWED.has(key) &&
    (value === null || ['string','number','boolean'].includes(typeof value))) {
    safe[key] = typeof value === 'string' ? value.slice(0,160) : value;
  }
  buffer.push({ atMs: Math.round(performance.now()), event, ...safe });
  if (buffer.length > 1000) buffer.splice(0, buffer.length - 1000);
}

// Match overlays may remain mounted while hidden. Test actual rendering, including
// hidden ancestors; DOM presence alone must not suspend a playable priority window.
export function readPriorityVisibility(doc = globalThis.document) {
  if (!doc || doc.visibilityState === 'hidden') return { visible:false, blocker:'document_hidden' };
  const nodes = doc.querySelectorAll('#main-menu-overlay, #tournament-overlay, #multiplayer-overlay, #deck-select-overlay, #mulligan-overlay, #options-menu-overlay, #game-manual-overlay, .gy-modal-overlay, #game-over-overlay, #match-loading-overlay, #multiplayer-ready-barrier, #multiplayer-sync-barrier');
  for (const node of nodes) {
    if (node.closest('[hidden], .hidden') || !node.getClientRects().length) continue;
    const style = doc.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue;
    return { visible:false, blocker:node.id || 'gy-modal-overlay' };
  }
  return { visible:true, blocker:null };
}
