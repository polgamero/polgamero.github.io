// Argentinia 23.18.1 — Action Re-executor.
// Convierte Telemetría en frames causales action -> state transitions y verifica la cadena
// de hashes. Para fixtures headless, la re-ejecución fuerte se hace volviendo a correr el
// motor real con la misma seed; este kernel cubre logs humanos/browser.
import { applyReplayChanges, replayHash, buildReplayActionJournal } from './replayKernel.js';

export const ACTION_REEXECUTOR_VERSION = '23.18.1-v1';

const ACTION_TYPES = new Set([
  'starting_player_selected','ui_click','ui_key','priority_pass','advance_step_requested','phase_committed',
  'cast_transaction_begin','cast_cost_locked','cast_transaction_committed','blockers_declared','private_zone_commit',
  'remote_decision_response_sent','remote_decision_response_received','stack_push','stack_resolve_start','stack_resolve_end'
]);

function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}

export function buildCausalActionFrames(events = []) {
  const frames=[];
  let current=null;
  let prelude=[];
  for(const ev of events||[]){
    if(ACTION_TYPES.has(ev?.type)){
      if(current) frames.push(current);
      current={index:frames.length+1,action:{seq:Number(ev.seq||0),type:ev.type,data:clone(ev.data||{})},stateChanges:[],otherEvents:prelude};
      prelude=[];
      continue;
    }
    if(ev?.type==='state_change'){
      const target=current || (current={index:frames.length+1,action:{seq:0,type:'SESSION_PRELUDE',data:{}},stateChanges:[],otherEvents:prelude});
      prelude=[];
      target.stateChanges.push({seq:Number(ev.seq||0),reason:ev?.data?.reason||null,beforeHash:ev?.data?.beforeHash||null,afterHash:ev?.data?.afterHash||null,changes:clone(ev?.data?.changes||[])});
    } else if(current) current.otherEvents.push({seq:Number(ev?.seq||0),type:ev?.type||null});
    else prelude.push({seq:Number(ev?.seq||0),type:ev?.type||null});
  }
  if(current) frames.push(current);
  return frames;
}

export function reexecuteCausalActionFrames(frames = [], { stopAtFrame = Infinity } = {}) {
  let snapshot=null;
  const divergences=[];
  const executed=[];
  for(const frame of frames){
    if(frame.index>stopAtFrame) break;
    const beforeFrameHash=snapshot?replayHash(snapshot):null;
    for(const sc of frame.stateChanges||[]){
      if(sc.beforeHash && snapshot!==null){
        const actual=replayHash(snapshot);
        if(actual!==sc.beforeHash) divergences.push({frame:frame.index,seq:sc.seq,side:'before',expected:sc.beforeHash,actual,action:frame.action.type});
      }
      snapshot=applyReplayChanges(snapshot,sc.changes||[]);
      if(sc.afterHash && snapshot!==null){
        const actual=replayHash(snapshot);
        if(actual!==sc.afterHash) divergences.push({frame:frame.index,seq:sc.seq,side:'after',expected:sc.afterHash,actual,action:frame.action.type});
      }
    }
    executed.push({frame:frame.index,actionSeq:frame.action.seq,actionType:frame.action.type,beforeHash:beforeFrameHash,afterHash:snapshot?replayHash(snapshot):null,stateChangeCount:frame.stateChanges.length});
  }
  return {snapshot,finalHash:snapshot?replayHash(snapshot):null,divergences,executed};
}

export function auditActionReexecution(payload = {}, options = {}) {
  const events=Array.isArray(payload?.events)?payload.events:[];
  const frames=buildCausalActionFrames(events);
  const result=reexecuteCausalActionFrames(frames,options);
  return {
    version:ACTION_REEXECUTOR_VERSION,
    telemetryVersion:payload?.telemetryVersion||null,
    replayFormatVersion:payload?.replay?.formatVersion||0,
    frameCount:frames.length,
    actionJournalCount:buildReplayActionJournal(events).length,
    finalHash:result.finalHash,
    divergences:result.divergences,
    executed:result.executed,
    snapshot:result.snapshot
  };
}
