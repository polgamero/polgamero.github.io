// Bounded player decisions. Never casts/activates a spell or chooses payment sources.
import { gameRandomInt } from './gameRng.js';
export const DECISION_DURATION_MS = 30000;
const actionDecisions = new Set();

export function randomLegalSubset(entries, count = 1) {
  const pool = [...entries], selected = [];
  const needed = Math.min(pool.length, Math.max(0, Math.floor(Number(count) || 0)));
  while (selected.length < needed) selected.push(pool.splice(gameRandomInt(pool.length, 'decision_timeout'), 1)[0]);
  return selected;
}

// Callback shape and legal candidates belong to the original engine/UI adapter.
// Returns the same callback with an exactly-once, identity-fenced deadline.
export function timedDecision(overlay, state, callback, fallbackArgs, {
  action = false, abortArgs = () => [[]], notice = 'Al vencer el tiempo se elegirá al azar entre las opciones legales.',
  blocked = () => false, record = () => {}, durationMs = DECISION_DURATION_MS, remove = true, onActionExpire = null, isCurrent = () => true, clockHost = null
} = {}) {
  // Solo/Tournament do not have a PvP match or its deadline. They still need
  // the same modal lifetime: close BEFORE the engine callback, exactly once.
  // Returning callback directly left source/color selectors above a live payment.
  if (!state.currentMatch) {
    let settled = false;
    const stop = () => actionDecisions.delete(abort);
    const finish = (...args) => {
      if (settled) return;
      settled = true;
      stop();
      if (remove) overlay.remove();
      return callback?.(...args);
    };
    const abort = () => {
      if (!overlay.isConnected) { settled=true;stop();return; }
      finish(...abortArgs());
    };
    if (action) actionDecisions.add(abort);
    return finish;
  }
  if (state.gameOver) return callback;
  const match = state.currentMatch, uid = state.currentUser?.uid, serial=state.priorityClockSerial, deadline = Date.now() + durationMs;
  let settled = false, lastSeconds = null;
  const banner = document.createElement('div'); banner.className = 'arg-decision-clock';
  banner.style.cssText = 'box-sizing:border-box;flex:0 0 auto;width:100%;padding:10px 14px;border:1px solid #d4af37;border-radius:8px;background:#201a09;color:#ffe7a4;font:700 14px/1.4 system-ui;text-align:center';
  banner.setAttribute('role','status');
  const counter = document.createElement('strong'); counter.style.display = 'block';
  const copy = document.createElement('span'); copy.textContent = notice;
  const fuse=document.createElement('div');fuse.style.cssText='height:4px;margin-top:8px;background:#edb94b;width:100%;border-radius:3px';
  banner.append(counter,copy,fuse);
  (clockHost || overlay.querySelector('.mulligan-panel,.gy-modal-content,#damage-modal-content') || overlay).append(banner);
  const valid = () => state.currentMatch === match && state.currentUser?.uid === uid && !state.gameOver && isCurrent() && (!action || state.priorityClockSerial===serial);
  const fence = event => { if(!valid()){event.preventDefault();event.stopImmediatePropagation();if(remove)overlay.remove();} };
  overlay.addEventListener('click',fence,true);
  const stop = () => { clearInterval(interval);actionDecisions.delete(abort);overlay.removeEventListener('click',fence,true);banner.remove(); };
  const finish = (...args) => {
    if (settled) return; settled = true; stop();
    if (!valid()) { if(remove)overlay.remove();return; }
    if(remove)overlay.remove(); callback?.(...args);
  };
  const abort = () => { if(!overlay.isConnected){settled=true;stop();return;}finish(...abortArgs()); };
  const tick = () => {
    if (!valid() || !overlay.isConnected || overlay.hidden || overlay.classList.contains('hidden')) { settled = true; stop(); if(action&&remove)overlay.remove(); return; }
    const seconds = Math.max(0,Math.ceil((deadline-Date.now())/1000));
    if (seconds !== lastSeconds) { counter.textContent = `⏳ ${seconds} s`; fuse.style.width=`${Math.max(0,Math.min(100,(deadline-Date.now())/durationMs*100))}%`; lastSeconds = seconds; }
    if (seconds > 0 || blocked()) return;
    record('decision_timeout', { kind: action ? 'action_choice' : 'resolution_choice', durationMs });
    if(action)onActionExpire?.();
    if(settled)return;
    finish(...(action ? abortArgs() : fallbackArgs()));
  };
  const interval = setInterval(tick,125);
  if (action) actionDecisions.add(abort);
  // Run after the current function has attached the modal and its handlers.
  queueMicrotask(tick);
  return finish;
}

export function cancelActionDecisions() {
  for (const abort of [...actionDecisions]) abort();
}

// Consume a single priority window at half speed during announcement/payment.
// Cancel/reopen and repeated renders never create a fresh budget.
export function consumePriorityBudget(state, nowMs, rate = 1) {
  const now = Number(nowMs);
  const previous = Number(state.priorityClockSampleLocalMs) || now;
  const previousRate = Number(state.priorityClockRateLocal) || rate;
  const elapsed = Math.max(0,now-previous);
  state.priorityClockRemainingMs = Math.max(0,Number(state.priorityClockRemainingMs || 0)-elapsed*previousRate);
  state.priorityClockSampleLocalMs = now;
  state.priorityClockRateLocal = rate;
  state.priorityClockDeadlineLocalMs = now + state.priorityClockRemainingMs/rate;
  return state.priorityClockRemainingMs;
}
