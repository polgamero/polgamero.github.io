// js/suspendEngine.js — Argentinia 23.16.3 · En espera + Time Counters Engine
// Capa pura: schema de En espera, identidad en Exilio, Time counters y descriptores de
// las dos habilidades disparadas que funcionan desde Exilio. UI/Stack/costos/sync viven
// en main/turnManager/stackManager.
import { getCounterCount, setCounterCount, changeCounterCount } from './counterEngine.js';

export const SUSPEND_ENGINE_VERSION = '23.16.3';

function normCost(value) {
  const raw=String(value ?? '').trim();
  return raw || '{0}';
}

export function normalizeSuspendSpec(cardOrSpec) {
  const raw=cardOrSpec?.suspend ?? cardOrSpec;
  if (!raw) return null;
  if (typeof raw === 'number') return { time:Math.max(1,Math.floor(raw)), cost:'{0}' };
  if (typeof raw === 'string') {
    const m=raw.match(/^\s*(\d+)\s*[-—:]\s*(.+)\s*$/);
    if (!m) return null;
    return { time:Math.max(1,Number(m[1])||1), cost:normCost(m[2]) };
  }
  if (typeof raw !== 'object') return null;
  const time=Math.max(0,Math.floor(Number(raw.time ?? raw.timeCounters ?? raw.count ?? raw.n) || 0));
  if (time <= 0) return null;
  return {
    time,
    cost:normCost(raw.cost ?? raw.suspendCost ?? raw.manaCost),
    label:String(raw.label || '').trim() || null
  };
}

export function hasSuspend(card) { return !!normalizeSuspendSpec(card); }

export function markCardSuspended(card, options = {}) {
  const spec=normalizeSuspendSpec(card);
  if (!card || !spec) return null;
  setCounterCount(card,'time',spec.time);
  card._suspendState={
    engineVersion:SUSPEND_ENGINE_VERSION,
    exileObjectId:options.exileObjectId || card._exileObjectId || null,
    ownerRole:options.ownerRole || card._ownerRole || null,
    suspendedByRole:options.suspendedByRole || options.ownerRole || card._ownerRole || null,
    originalTime:spec.time,
    cost:spec.cost,
    castTriggerSerial:0
  };
  return card._suspendState;
}

export function clearSuspendState(card,{clearTime=true}={}) {
  if (!card) return;
  delete card._suspendState;
  delete card._suspendCastPending;
  if (clearTime) setCounterCount(card,'time',0);
}

export function isSuspendedCard(card) {
  return !!(card?._suspendState && hasSuspend(card) && getCounterCount(card,'time')>0);
}

export function suspendedTimeCount(card) { return getCounterCount(card,'time'); }

export function buildSuspendUpkeepTrigger(card,isLocal) {
  if (!isSuspendedCard(card)) return null;
  return {
    effect:{
      type:'suspend_remove_time',
      exileObjectId:card._exileObjectId || card._suspendState?.exileObjectId || null,
      ownerIsLocal:isLocal!==false
    },
    sourceCard:card,
    sourceItem:null,
    isLocal:isLocal!==false,
    triggerType:'suspend_tick',
    triggerLabel:'En espera — remover Tiempo',
    eventCard:card
  };
}

export function removeSuspendTimeCounterStorage(card,amount=1) {
  const before=suspendedTimeCount(card);
  if (before<=0) return {before,after:before,removed:0,lastRemoved:false};
  const requested=Math.max(1,Math.floor(Number(amount)||1));
  const result=changeCounterCount(card,'time',-requested);
  const after=suspendedTimeCount(card);
  return {before,after,removed:result.removed||0,lastRemoved:before>0 && after===0 && (result.removed||0)>0};
}

export function addSuspendTimeCounterStorage(card,amount=1) {
  const before=suspendedTimeCount(card);
  const delta=Math.max(0,Math.floor(Number(amount)||0));
  if (!delta) return {before,after:before,added:0};
  const result=changeCounterCount(card,'time',delta);
  return {before,after:suspendedTimeCount(card),added:result.added||0};
}

export function buildSuspendCastTrigger(card,isLocal,options={}) {
  if (!card?._suspendState) return null;
  card._suspendState.castTriggerSerial=Math.max(0,Number(card._suspendState.castTriggerSerial)||0)+1;
  card._suspendCastPending=true;
  return {
    effect:{
      type:'suspend_cast_from_exile',
      exileObjectId:card._exileObjectId || card._suspendState.exileObjectId || null,
      ownerIsLocal:isLocal!==false,
      triggerSerial:card._suspendState.castTriggerSerial
    },
    sourceCard:card,
    sourceItem:null,
    isLocal:isLocal!==false,
    triggerType:'suspend_cast',
    triggerLabel:'En espera — jugar carta',
    eventCard:card,
    cause:options.cause || 'last_time_removed'
  };
}

export function suspendEngineSummary(){
  return Object.freeze({
    version:SUSPEND_ENGINE_VERSION,
    schema:'suspend:{time,cost}',
    handSpecialAction:true,
    upkeepTriggerUsesStack:true,
    lastTimeTriggerUsesStack:true,
    castOptional:true,
    castWithoutManaCost:true,
    xForcedZero:true,
    additionalCostsAllowed:true,
    alternativeCostsForbidden:true,
    creatureHasteUntilControlLost:true,
    proliferateSuspendedCards:false
  });
}
