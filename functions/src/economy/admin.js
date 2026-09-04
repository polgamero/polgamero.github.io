// v23.19.5.5 — Admin Economy + Statistics / Immutable Audit Authority.
import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { ENGINE_VERSION, ECONOMY_SCHEMA_VERSION } from '../shared/constants.js';
import { normalizeMatchRewardConfig } from './matchCore.js';
import { playerStatsMirrorServer, normalizePlayerStatsServer } from './audit.js';

const GRANT_KINDS=new Set(['points','fichas','standardPacks']);
const BULK_PAGE_SIZE=10;
const safeId=v=>String(v||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,420);
const nonneg=v=>Math.max(0,Math.floor(Number(v)||0));
const signed=v=>Math.floor(Number(v)||0);
function normalizeInventory(raw={}){return {standardPacks:nonneg(raw.standardPacks),guaranteedMythics:nonneg(raw.guaranteedMythics)};}
export function normalizeAdminGrantRequest(data={}){
  const targetUid=String(data.targetUid||'').trim(), kind=String(data.kind||data.currencyField||'').trim(), amount=signed(data.amount), reason=String(data.reason||'').trim().slice(0,240);
  if(!targetUid||!GRANT_KINDS.has(kind)||!Number.isInteger(amount)||amount===0) throw economyError('ADMIN_GRANT_INVALID');
  if(kind==='standardPacks'&&amount<1) throw economyError('ADMIN_GRANT_INVALID');
  return {targetUid,kind,amount,reason};
}
function grantPatch(profile,kind,amount){
  if(kind==='points'){const before=nonneg(profile.points),after=Math.max(0,before+amount);return {patch:{points:after},before,after,applied:after-before};}
  if(kind==='fichas'){const before=nonneg(profile.fichas),after=Math.max(0,before+amount);return {patch:{fichas:after},before,after,applied:after-before};}
  const inventory=normalizeInventory(profile.inventory),before=inventory.standardPacks,after=before+amount;
  return {patch:{inventory:{...inventory,standardPacks:after}},before,after,applied:amount};
}
function grantStatDeltas(kind,applied){
  if(kind==='points') return applied>=0?{pointsEarned:applied}:{pointsLost:Math.abs(applied)};
  if(kind==='fichas') return applied>=0?{fichasEarned:applied}:{fichasSpent:Math.abs(applied)};
  return {packsReceived:Math.max(0,applied)};
}
function grantEventDeltas(kind,applied){return {pointsDelta:kind==='points'?applied:0,fichasDelta:kind==='fichas'?applied:0,packsDelta:kind==='standardPacks'?applied:0,cardsDelta:0};}

export async function adminGrantTx({db,tx,adminUid,operationId,targetUid,kind,amount,reason,bulkJobId=null}){
  const userRef=db.collection('users').doc(targetUid),statsRef=db.collection('playerStats').doc(targetUid);
  const suffix=safeId(operationId||`${adminUid}_${targetUid}_${kind}_${amount}`);
  const actionRef=db.collection('adminActions').doc(`grant_${suffix}`), eventRef=db.collection('economyEvents').doc(`admin_grant_${suffix}`);
  const [userSnap,statsSnap,actionSnap,eventSnap]=await Promise.all([tx.get(userRef),tx.get(statsRef),tx.get(actionRef),tx.get(eventRef)]);
  if(actionSnap.exists||eventSnap.exists){
    const prior=actionSnap.exists?(actionSnap.data()||{}):{};
    return {duplicate:true,targetUid,kind,requestedAmount:amount,appliedAmount:signed(prior.appliedAmount),newValue:nonneg(prior.newValue)};
  }
  if(!userSnap.exists) throw economyError('ADMIN_GRANT_USER_NOT_FOUND');
  const profile=userSnap.data()||{}, change=grantPatch(profile,kind,amount), afterProfile={...profile,...change.patch};
  tx.update(userRef,change.patch);
  tx.set(statsRef,playerStatsMirrorServer(targetUid,afterProfile,statsSnap.exists?(statsSnap.data()||{}):{},grantStatDeltas(kind,change.applied)),{merge:false});
  const now=FieldValue.serverTimestamp();
  tx.create(actionRef,{type:'economy_grant',adminUid,targetUid,kind,requestedAmount:amount,appliedAmount:change.applied,oldValue:change.before,newValue:change.after,reason,operationId,bulkJobId,authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:now});
  tx.create(eventRef,{actorUid:adminUid,targetUid,source:'admin_grant_server',operationId,bulkJobId,...grantEventDeltas(kind,change.applied),authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:now});
  return {duplicate:false,targetUid,kind,requestedAmount:amount,appliedAmount:change.applied,newValue:change.after};
}

export async function createOrReadBulkGrantJob(db,{adminUid,jobId,kind,amount,reason}){
  const id=safeId(jobId); if(!id||!GRANT_KINDS.has(kind)||!Number.isInteger(amount)||amount===0||(kind==='standardPacks'&&amount<1)) throw economyError('ADMIN_BULK_GRANT_INVALID');
  const ref=db.collection('adminBulkGrantJobs').doc(id), existing=await ref.get();
  if(existing.exists){const job=existing.data()||{}; if(job.adminUid!==adminUid||job.kind!==kind||Number(job.amount)!==amount||String(job.reason||'')!==reason) throw economyError('ADMIN_BULK_GRANT_JOB_MISMATCH'); return {ref,job:{id,...job},created:false};}
  const aggregate=await db.collection('users').count().get(), total=Number(aggregate.data().count)||0;
  const job={id,adminUid,kind,amount,reason,status:total===0?'committed':'running',total,succeeded:0,failed:0,processed:0,cursorUid:null,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION};
  await ref.create(job); return {ref,job:{...job},created:true};
}
export async function advanceBulkGrantJob(db,{adminUid,jobId,kind,amount,reason}){
  const {ref,job}=await createOrReadBulkGrantJob(db,{adminUid,jobId,kind,amount,reason});
  if(job.status==='committed') return job;
  let query=db.collection('users').orderBy('__name__').limit(BULK_PAGE_SIZE);
  if(job.cursorUid) query=query.startAfter(db.collection('users').doc(job.cursorUid));
  const page=await query.get();
  let succeeded=nonneg(job.succeeded),failed=nonneg(job.failed),processed=nonneg(job.processed),cursorUid=job.cursorUid||null;
  for(const docSnap of page.docs){
    const targetUid=docSnap.id, receiptRef=db.collection('adminBulkGrantReceipts').doc(safeId(`${job.id}_${targetUid}`));
    // Fail closed on a target error. We deliberately do NOT advance the persisted cursor
    // past a failed recipient. Successful targets from an interrupted page already have
    // receipts, so replaying the page counts them once in job progress without granting twice.
    await db.runTransaction(async tx=>{
      const receiptSnap=await tx.get(receiptRef); if(receiptSnap.exists) return {duplicate:true};
      const result=await adminGrantTx({db,tx,adminUid,operationId:`bulk:${job.id}:${targetUid}`,targetUid,kind,amount,reason,bulkJobId:job.id});
      tx.create(receiptRef,{jobId:job.id,targetUid,appliedAmount:result.appliedAmount,createdAt:FieldValue.serverTimestamp()}); return result;
    });
    succeeded+=1; processed+=1; cursorUid=targetUid;
  }
  const done=page.size<BULK_PAGE_SIZE||processed>=nonneg(job.total);
  const patch={succeeded,failed,processed,cursorUid,status:done?'committed':'running',updatedAt:FieldValue.serverTimestamp(),...(done?{committedAt:FieldValue.serverTimestamp()}:{})};
  await ref.set(patch,{merge:true}); return {...job,...patch};
}
export async function readBulkGrantJob(db,{adminUid,jobId}){
  const id=safeId(jobId),snap=await db.collection('adminBulkGrantJobs').doc(id).get(); if(!snap.exists) throw economyError('ADMIN_BULK_GRANT_NOT_FOUND');
  const job=snap.data()||{}; if(job.adminUid!==adminUid) throw economyError('ADMIN_REQUIRED'); return {id,...job};
}

export async function adminSyncPlayerStats(db,{targetUid=null}){
  const targets=[];
  if(targetUid){const snap=await db.collection('users').doc(String(targetUid)).get(); if(!snap.exists) throw economyError('ADMIN_GRANT_USER_NOT_FOUND'); targets.push(snap);}
  else {const snap=await db.collection('users').get(); targets.push(...snap.docs);}
  let updated=0;
  for(const userSnap of targets){
    await db.runTransaction(async tx=>{
      const statsRef=db.collection('playerStats').doc(userSnap.id),freshUser=await tx.get(userSnap.ref),statsSnap=await tx.get(statsRef);
      if(!freshUser.exists) return;
      tx.set(statsRef,playerStatsMirrorServer(userSnap.id,freshUser.data()||{},statsSnap.exists?(statsSnap.data()||{}):{},{}),{merge:false});
    }); updated+=1;
  }
  return {updated};
}

export async function adminRepairSoloRewardTx({db,tx,adminUid,targetUid,receiptId,telemetrySessionId,reason}){
  const userRef=db.collection('users').doc(targetUid),resultRef=db.collection('playerGameReceipts').doc(`${targetUid}_${receiptId}`),rewardRef=db.collection('gameRewardReceipts').doc(`${targetUid}_${receiptId}`),telemetryRef=db.collection('telemetrySessions').doc(telemetrySessionId),settingsRef=db.doc('gameConfig/settings'),statsRef=db.collection('playerStats').doc(targetUid);
  const suffix=safeId(`${targetUid}_${receiptId}`),actionRef=db.collection('adminActions').doc(`reward_repair_${suffix}`),eventRef=db.collection('economyEvents').doc(`reward_repair_${suffix}`);
  const [rewardSnap,userSnap,resultSnap,telemetrySnap,settingsSnap,statsSnap,actionSnap,eventSnap]=await Promise.all([tx.get(rewardRef),tx.get(userRef),tx.get(resultRef),tx.get(telemetryRef),tx.get(settingsRef),tx.get(statsRef),tx.get(actionRef),tx.get(eventRef)]);
  if(!userSnap.exists) throw economyError('ADMIN_REWARD_REPAIR_USER_NOT_FOUND');
  const current=nonneg(userSnap.data()?.points),rewardData=rewardSnap.exists?(rewardSnap.data()||{}):null;
  if(rewardData&&(rewardData.penalty===true||rewardData.abandoned===true||rewardData.terminalKind==='abandon'||rewardData.rewardReason==='abandon_penalty')) throw economyError('ADMIN_REWARD_REPAIR_ABANDONED');
  if(rewardSnap.exists) return {duplicate:true,appliedDelta:0,creditedDelta:nonneg(rewardData?.effectiveDelta),total:current,reward:rewardData};
  if(!resultSnap.exists||!telemetrySnap.exists) throw economyError('ADMIN_REWARD_REPAIR_EVIDENCE_MISSING');
  const game=resultSnap.data()||{},telemetry=telemetrySnap.data()||{};
  const endReason=String(telemetry.endReason||'');
  const abandoned=game.abandoned===true||game.terminalKind==='abandon'||endReason==='abandon_local'||endReason.startsWith('abandon_recovery');
  if(abandoned) throw economyError('ADMIN_REWARD_REPAIR_ABANDONED');
  const outcome=game.result==='win'?'win':(game.result==='loss'?'loss':null),difficulty=['easy','medium','hard'].includes(String(telemetry.difficulty||'').toLowerCase())?String(telemetry.difficulty).toLowerCase():null;
  const telemetryReceipt=String(telemetry.soloGameId||telemetry.sessionId||'');
  if(game.uid!==targetUid||game.receiptId!==receiptId||game.mode!=='solo'||!outcome||telemetry.ownerUid!==targetUid||telemetry.mode!=='solo'||telemetry.status!=='completed'||telemetryReceipt!==receiptId||!difficulty) throw economyError('ADMIN_REWARD_REPAIR_EVIDENCE_MISMATCH');
  const cfg=normalizeMatchRewardConfig(settingsSnap.exists?(settingsSnap.data()||{}):{}),baseDelta=outcome==='loss'?cfg.solo.loss:cfg.solo[difficulty]; if(baseDelta<=0) throw economyError('ADMIN_REWARD_REPAIR_CONFIG_INVALID');
  const next=current+baseDelta,profile={...(userSnap.data()||{}),points:next},now=FieldValue.serverTimestamp();
  tx.update(userRef,{points:next}); tx.set(statsRef,playerStatsMirrorServer(targetUid,profile,statsSnap.exists?(statsSnap.data()||{}):{},{pointsEarned:baseDelta}),{merge:false});
  tx.create(rewardRef,{uid:targetUid,receiptId,mode:'solo',outcome,difficulty,baseDelta,effectiveDelta:baseDelta,resultingTotal:next,rewardReason:'admin_repair',adminRepair:true,repairAdminUid:adminUid,telemetrySessionId,engineVersion:ENGINE_VERSION,createdAt:now});
  if(!actionSnap.exists) tx.create(actionRef,{type:'game_reward_manual_repair',adminUid,targetUid,telemetrySessionId,receiptId,outcome,difficulty,pointsDelta:baseDelta,reason:String(reason||'Caja Negra: liquidación faltante confirmada').slice(0,240),authority:'server',immutable:true,createdAt:now});
  if(!eventSnap.exists) tx.create(eventRef,{actorUid:adminUid,targetUid,source:'game_reward_admin_repair',pointsDelta:baseDelta,fichasDelta:0,packsDelta:0,cardsDelta:0,sessionId:receiptId,authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:now});
  return {duplicate:false,appliedDelta:baseDelta,creditedDelta:baseDelta,total:next,outcome,difficulty};
}
