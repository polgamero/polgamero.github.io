import { devourResolutionKind } from './devour.js';
import { chainedResolutionKind } from './chainedEffects.js';
import { redirectFinishingStack, redirectPlan, redirectStep } from './redirectResolution.js';
import { isSpellControlEffect, spellControlApplies, spellControlFinalStack, spellControlPlan, spellControlStep } from './spellControl.js';

const roles = ['host', 'guest'];
const moves = ['discard', 'shuffle'];
const refillOperations = ['move', 'move', 'draw', 'draw', 'finish'];

export const SHARED_REFILL_PROTOCOL = 'mp-23.19.2-fl45';

function requireRefill(condition, reason) {
  if (!condition) throw new Error('MULTIPLAYER_SHARED_REFILL_' + reason);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasOnlyKeys(record, allowed) {
  return record && typeof record === 'object' && !Array.isArray(record) &&
    Object.keys(record).every(key => allowed.includes(key));
}

function sameWire(left, right) {
  const stable = value => JSON.stringify(value,(_,item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
  return stable(left) === stable(right);
}

function triggerIndexes(rows, role) {
  return rows.flatMap((row,index) => row.controllerRole === role ? [index] : []);
}

function validOrder(indexes, order) {
  return Array.isArray(order) && order.length === indexes.length &&
    new Set(order).size === indexes.length && order.every(index => indexes.includes(index));
}

function triggerOrderRoles(plan, rows) {
  return [plan.activeRole, roles.find(role => role !== plan.activeRole)].filter(role => {
    const indexes = triggerIndexes(rows,role);
    return indexes.some(index => !sameWire(rows[index],rows[indexes[0]]));
  });
}

function triggerPlacement(plan, rows, answers) {
  return [plan.activeRole,roles.find(role => role !== plan.activeRole)].flatMap(role => {
    const selected = answers.find(answer => answer.role === role);
    return [...(selected?.indexes ?? triggerIndexes(rows,role))].reverse();
  });
}

function needsTarget(row) {
  return row.requiresTarget === true && !row.target;
}

function targetIndexes(plan,batch) {
  return triggerPlacement(plan,batch.rows,batch.answers).filter(index => needsTarget(batch.rows[index]));
}

function validPublicTarget(room,target) {
  if (target === null) return true;
  if (!target || !roles.includes(target.ownerRole)) return false;
  const {ownerRole,type} = target;
  if (type === 'player') return hasOnlyKeys(target,['type','ownerRole']);
  if (type === 'graveyard' || type === 'aura') {
    if (!hasOnlyKeys(target,['type','ownerRole','objectId','cardName']) || !target.objectId) return false;
    const cards = type === 'graveyard' ? room[ownerRole + 'Graveyard']
      : roles.flatMap(role => ['Combat','Lands','Support','Planeswalkers']
        .flatMap(zone => (room[role + zone] || []).flatMap(item => item.auras || [])));
    const key = type === 'graveyard' ? '_graveyardObjectId' : '_auraObjectId';
    return !!cards?.some(card => card[key] === target.objectId && (card.name || null) === target.cardName);
  }
  const zones = {creature:['combat','support'],permanent:['support'],land:['lands','combat'],planeswalker:['planeswalkers']};
  if (!zones[type]?.includes(target.zone) || target.controllerRole !== ownerRole ||
      !roles.includes(target.cardOwnerRole) || target.strict !== true ||
      !target.syncObjectId || !nonNegativeInteger(target.index) ||
      !hasOnlyKeys(target,['type','ownerRole','controllerRole','cardOwnerRole','zone','index',
        'syncObjectId','cardId','cardName','strict'])) return false;
  const zone = room[ownerRole + target.zone[0].toUpperCase() + target.zone.slice(1)];
  const item = zone?.[target.index];
  return item?._syncObjectId === target.syncObjectId && item.card?.id === target.cardId &&
    (item.card?.name || null) === target.cardName && (item.card?._ownerRole || ownerRole) === target.cardOwnerRole;
}

function validTriggerBatch(plan, batch) {
  if (!hasOnlyKeys(batch,['rows','answers','targets','deadlineMs','wardCosts','wardAnswers']) ||
      !Array.isArray(batch.rows) || !batch.rows.length || !Array.isArray(batch.answers) ||
      !Array.isArray(batch.targets) ||
      !nonNegativeInteger(batch.deadlineMs)) return false;
  if (!validTriggerRows(batch.rows)) return false;
  const pending = triggerOrderRoles(plan,batch.rows);
  if (batch.answers.length > pending.length ||
      !batch.answers.every((answer,index) => hasOnlyKeys(answer,['role','indexes']) &&
        answer.role === pending[index] && validOrder(triggerIndexes(batch.rows,answer.role),answer.indexes))) return false;
  if (batch.answers.length < pending.length) return batch.targets.length === 0 && !batch.wardCosts;
  const indexes = targetIndexes(plan,batch);
  if (batch.targets.length > indexes.length || !batch.targets.every((choice,index) =>
    hasOnlyKeys(choice,['index','target']) && choice.index === indexes[index] && Object.hasOwn(choice,'target'))) return false;
  if (!batch.wardCosts) return !Object.hasOwn(batch,'wardAnswers');
  const {wardCosts,wardAnswers} = batch;
  return batch.targets.length === indexes.length && Array.isArray(wardCosts) && wardCosts.length > 0 &&
    new Set(wardCosts.map(cost=>cost?.index)).size === wardCosts.length && wardCosts.every(cost=>
      hasOnlyKeys(cost,['index','amount']) && nonNegativeInteger(cost.index) && nonNegativeInteger(cost.amount) &&
      cost.amount > 0 && !!(batch.rows[cost.index]?.target || batch.targets.find(choice=>choice.index===cost.index)?.target)
    ) && Array.isArray(wardAnswers) && wardAnswers.length <= wardCosts.length &&
    wardAnswers.every((answer,index)=>hasOnlyKeys(answer,['index','paid','rows']) && answer.index === wardCosts[index].index &&
      typeof answer.paid === 'boolean' && Array.isArray(answer.rows) && (answer.paid || !answer.rows.length) && validTriggerRows(answer.rows));
}

function validTriggerRows(rows) {
  return !rows.some(row => row?.type !== 'ability' || row.abilityKind !== 'triggered' ||
      !roles.includes(row.controllerRole) || !row.card?.id || !row.ability?.effect?.type ||
      (!row.target && row.targetRelation) ||
      (row.triggerType === 'card_drawn' && row.source?.eventCard));
}

export function makeSharedRefillTriggerPlan(plan, rows, deadlineMs, {force=false} = {}) {
  if (!rows.length || (!force && !triggerOrderRoles(plan,rows).length && !rows.some(needsTarget))) return null;
  const batch = {rows,answers:[],targets:[],deadlineMs};
  requireRefill(validTriggerBatch(plan,batch),'INVALID_TRIGGER_PLAN');
  return batch;
}

export function sharedRefillTriggerChoices(refill) {
  return triggerIndexes(refill.progress.triggerOrder.rows,refill.step.role);
}

export function sharedRefillStackRows(plan, rows, answers = [], targets = [], wards = [], batchNumber = 0) {
  return triggerPlacement(plan,rows,answers).flatMap(index => {
    if (wards.some(ward => ward.index === index && !ward.paid)) return [];
    const {requiresTarget,targetRelation,...row} = rows[index];
    const unresolved = needsTarget(rows[index]);
    const target = unresolved ? targets.find(choice => choice.index === index)?.target : row.target;
    if (unresolved && !target) return [];
    return [{...row,...(target ? {target} : {}),id:`refill_${plan.stackId}_trigger_${batchNumber}_${index}`}];
  });
}

export function phaseSevenBatchStack(plan,progress) {
  const {triggerOrder:batch} = progress;
  return sharedRefillStackRows(plan,batch.rows,batch.answers,batch.targets,batch.wardAnswers,progress.sealedTriggers?.length || 0);
}

export function phaseSevenEffectKind(cardEffect, target) {
  if (chainedResolutionKind(cardEffect,target)) return 'chained';
  if (isSpellControlEffect(cardEffect)) return 'control';
  if (cardEffect?.type === 'redirect_stack_target' && target?.type === 'stack') return 'redirect';
  if (cardEffect?.type === 'refill_each_hand' && moves.includes(cardEffect.move) &&
      nonNegativeInteger(cardEffect.amount) && cardEffect.amount > 0) return 'refill';
  if (cardEffect?.type === 'sacrifice_each_player') return 'sacrifice';
  if (typeof cardEffect?.mayConfirm !== 'string' || !cardEffect.mayConfirm) return null;
  if (cardEffect.type === 'create_tokens' && !target) return 'tokens';
  if (cardEffect.type === 'discard' && cardEffect.selection === 'random' && cardEffect.amount === 1 &&
      (target?.type === 'player' || !target)) return 'discard';
  return null;
}

function topEffect(room) {
  const top = Array.isArray(room?.stackState) ? room.stackState.at(-1) : null;
  if (!top?.id || !roles.includes(top.controllerRole) || !roles.includes(room.activePlayer)) return null;
  const effect = top.type === 'ability' ? top.ability?.effect : top.card?.effect;
  const entryKind = devourResolutionKind(top,room[top.controllerRole+'Graveyard'] || [],
    room.multiplayerResolutionMarker?.sharedHandRefill?.chain != null);
  const devour = entryKind!=='devour-return' || roles.includes(effect.ownerRole) ? entryKind : null;
  const chainKind = devour || chainedResolutionKind(effect,top.target);
  const kind = devour ? 'chained' : phaseSevenEffectKind(effect,top.target);
  return kind ? {top,effect,kind,chainKind} : null;
}

export function planSharedHandRefill(room) {
  const source = topEffect(room);
  if (!source || room.gameOver) return null;
  const {top,effect,kind,chainKind} = source;
  return {
    kind,effect,
    stackId: top.id,
    authorityRole: top.controllerRole,
    activeRole: room.activePlayer,
    move: effect?.move,
    amount: kind === 'refill' ? effect.amount : kind === 'discard' ? 1 : 0,
    ...(kind === 'redirect' ? {redirect:redirectPlan(room,top,effect)} : {}),
    ...(kind === 'control' ? {control:spellControlPlan(room,top,effect)} : {}),
    ...(kind === 'chained' ? {chainKind,chainRole:chainKind === 'devour-return' ? effect.ownerRole : top.controllerRole} : {}),
    victimRole: top.target?.ownerRole || roles.find(role => role !== top.controllerRole)
  };
}

export function sharedHandRefillStep(plan, cursor) {
  if (!nonNegativeInteger(cursor) || cursor >= refillOperations.length) return null;
  const operation = refillOperations[cursor];
  const role = operation === 'finish' ? plan.authorityRole
    : cursor % 2 === 0 ? plan.activeRole : roles.find(role => role !== plan.activeRole);
  return {operation, role};
}

function phaseSevenStep(plan,progress,room) {
  const {cursor,actions,deadlineMs} = progress;
  if (!Array.isArray(actions) || !nonNegativeInteger(deadlineMs)) return null;
  if (plan.kind === 'redirect') return !actions.length ? redirectStep(plan,progress) : null;
  if (plan.kind === 'control') return !actions.length ? spellControlStep(plan,progress) : null;
  const finish = {operation:'finish',role:plan.authorityRole};
  if (plan.kind === 'chained') {
    if (cursor > 1 || actions.length || !hasOnlyKeys(progress.chain,['rows']) ||
        !Array.isArray(progress.chain.rows) || !validTriggerRows(progress.chain.rows) || (!cursor && progress.chain.rows.length)) return null;
    return cursor === 0 ? {operation:'chain-apply',role:plan.chainRole} : finish;
  }
  if (plan.kind === 'sacrifice') {
    const turnOrder = [plan.activeRole,roles.find(role=>role!==plan.activeRole)];
    if (cursor > 3 || actions.length !== Math.min(2,cursor) ||
        !actions.every(id=>id === null || typeof id === 'string' && id.length > 0)) return null;
    if (cursor < 3 && actions.some((id,index) => !validSacrificeChoice(room,turnOrder[index],id))) return null;
    if (cursor < 2) return {operation:'sacrifice-choice',role:turnOrder[cursor]};
    return cursor === 2 ? {operation:'apply',role:plan.authorityRole} : finish;
  }
  if (cursor > 2 || actions.length !== Math.min(cursor,1) ||
      actions.some(answer=>typeof answer!=='boolean')) return null;
  if (!cursor) return {operation:'confirm',role:plan.authorityRole};
  if (cursor === 2) return actions[0] ? finish : null;
  if (!actions[0]) return finish;
  return plan.kind === 'discard' ? {operation:'discard-one',role:plan.victimRole} : {operation:'apply',role:plan.authorityRole};
}

function validSacrificeChoice(room,role,id) {
  const candidates = room[role + 'Combat'] || [];
  return id === null ? candidates.length === 0 : candidates.some(item=>item._syncObjectId===id);
}

function expectedMarker(room, marker) {
  const plan = planSharedHandRefill(room);
  if (!plan || !hasOnlyKeys(marker, ['kind', 'stackId', 'authorityRole', 'turnCount', 'phase',
    'startedAtClientMs', 'sharedHandRefill']) ||
      (Object.hasOwn(marker, 'startedAtClientMs') && !nonNegativeInteger(marker.startedAtClientMs)) ||
      marker.kind !== 'stack_resolution' || marker.stackId !== plan.stackId ||
      marker.authorityRole !== plan.authorityRole || marker.turnCount !== room.turnCount ||
      marker.phase !== room.phase) return null;
  const progress = marker.sharedHandRefill;
  if (!hasOnlyKeys(progress, ['cursor', 'drawn', 'failed', 'discarded', 'triggerOrder','actions','deadlineMs','sealedTriggers','redirect','control','chain']) ||
      !Array.isArray(progress.drawn) || !Array.isArray(progress.failed)) return null;
  if (!nonNegativeInteger(progress.cursor) || (plan.kind === 'chained') !== Object.hasOwn(progress,'chain')) return null;
  let step = plan.kind === 'refill' ? sharedHandRefillStep(plan,progress.cursor) : phaseSevenStep(plan,progress,room);
  if (!step) return null;
  const redirectDraw = plan.kind === 'redirect' && progress.cursor === 4 && !progress.redirect.taxPaid ? plan.redirect.draw : 0;
  const expectedDraws = plan.kind === 'refill' ? Math.max(0, progress.cursor - 2) : Number(redirectDraw > 0);
  if (progress.drawn.length !== expectedDraws || progress.failed.length !== expectedDraws ||
      !progress.drawn.every((drawn, index) => nonNegativeInteger(drawn) &&
        nonNegativeInteger(progress.failed[index]) && drawn + progress.failed[index] === (plan.kind === 'redirect' ? redirectDraw : plan.amount))) return null;
  const discarded = progress.discarded;
  if (!Array.isArray(discarded) || ((plan.kind !== 'refill' && plan.kind !== 'discard' || plan.move === 'shuffle') &&
      discarded.length > 0) || (plan.kind === 'discard' && discarded.length > (progress.cursor === 2 ? 1 : 0))) return null;
  const seen = new Set();
  for (const ref of discarded) {
    if (!hasOnlyKeys(ref, ['role', 'zone', 'index']) || !roles.includes(ref.role) ||
        !['Graveyard', 'Exile'].includes(ref.zone) || !nonNegativeInteger(ref.index)) return null;
    const key = ref.role + ref.zone + ref.index;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  const batch = progress.triggerOrder;
  if (Object.hasOwn(progress,'triggerOrder')) {
    if (step.operation !== 'finish' || !validTriggerBatch(plan,batch) ||
        (!batch.wardCosts && !batch.targets.every(choice => validPublicTarget(room,choice.target)))) return null;
    if (Object.hasOwn(progress,'sealedTriggers') && (!Array.isArray(progress.sealedTriggers) ||
        progress.sealedTriggers.some(row=>row?.type!=='ability' || typeof row.id!=='string'))) return null;
    const nextRole = triggerOrderRoles(plan,batch.rows)[batch.answers.length];
    if (nextRole) step = {operation:'order',role:nextRole};
    else {
      const index = targetIndexes(plan,batch)[batch.targets.length];
      if (index !== undefined) step = {operation:'target',role:batch.rows[index].controllerRole,index};
      else {
        const cost = batch.wardCosts?.[batch.wardAnswers.length];
        if (cost) step = {operation:'ward',role:batch.rows[cost.index].controllerRole,...cost};
      }
    }
  }
  return {plan, step, progress};
}

export function readSharedHandRefill(room) {
  if (room?.engineProtocolVersion !== SHARED_REFILL_PROTOCOL || room.gameOver ||
      room.consecutivePasses !== 2 || room.pendingDecision || room.decisionResponse) return null;
  if (room.multiplayerResolutionMarker) {
    return expectedMarker(room, room.multiplayerResolutionMarker);
  }
  const plan = planSharedHandRefill(room);
  return plan ? {plan, step: {operation: 'start', role: plan.authorityRole}, progress: null} : null;
}

export function sharedHandRefillExpectation(refill) {
  return {stackId: refill.plan.stackId, cursor: refill.progress?.cursor ?? null,
    orderIndex:refill.progress?.triggerOrder?.answers.length ?? null,
    targetIndex:refill.progress?.triggerOrder?.targets.length ?? null,
    wardIndex:refill.progress?.triggerOrder?.wardAnswers?.length ?? refill.progress?.control?.wardIndex ?? null,
    sealedCount:refill.progress?.sealedTriggers?.length ?? 0};
}

export function matchesSharedHandRefillExpectation(refill, expected) {
  return !!refill && !!expected && refill.plan.stackId === expected.stackId &&
    (refill.progress?.cursor ?? null) === expected.cursor &&
    (refill.progress?.triggerOrder?.answers.length ?? null) === (expected.orderIndex ?? null) &&
    (refill.progress?.triggerOrder?.targets.length ?? null) === (expected.targetIndex ?? null) &&
    (refill.progress?.triggerOrder?.wardAnswers?.length ?? refill.progress?.control?.wardIndex ?? null) === (expected.wardIndex ?? null) &&
    (refill.progress?.sealedTriggers?.length ?? 0) === (expected.sealedCount ?? 0);
}

export function prepareSharedRefillOrderCommit(room, indexes, deadlineMs) {
  const refill = readSharedHandRefill(room);
  requireRefill(refill?.step.operation === 'order' &&
    validOrder(sharedRefillTriggerChoices(refill),indexes),'INVALID_TRIGGER_ORDER');
  const marker = room.multiplayerResolutionMarker;
  const batch = refill.progress.triggerOrder;
  return {publicPatch:{multiplayerResolutionMarker:{...marker,sharedHandRefill:{
    ...refill.progress,triggerOrder:{
      ...batch,deadlineMs,answers:[...batch.answers,{role:refill.step.role,indexes}]
    }
  }}},privatePatch:{}};
}

export function prepareSharedRefillTargetCommit(room, target, deadlineMs) {
  const refill = readSharedHandRefill(room);
  requireRefill(refill?.step.operation === 'target' && validPublicTarget(room,target),'INVALID_TRIGGER_TARGET');
  const marker = room.multiplayerResolutionMarker;
  const batch = refill.progress.triggerOrder;
  const choice = {index:refill.step.index,target};
  return {publicPatch:{multiplayerResolutionMarker:{...marker,sharedHandRefill:{
    ...refill.progress,triggerOrder:{...batch,deadlineMs,targets:[...batch.targets,choice]}
  }}},privatePatch:{}};
}

export function preparePhaseSevenWardCommit(room,payment,deadlineMs) {
  const {step,progress} = readSharedHandRefill(room);
  requireRefill(step.operation === 'ward','INVALID_WARD_STEP');
  const batch = progress.triggerOrder;
  const receipt = {index:step.index,paid:payment.applied,rows:payment.rows};
  return {publicPatch:{...payment.publicPatch,multiplayerResolutionMarker:{
    ...room.multiplayerResolutionMarker,sharedHandRefill:{...progress,triggerOrder:{
      ...batch,deadlineMs,wardAnswers:[...batch.wardAnswers,receipt]
    }}
  }},privatePatch:{}};
}

export function prepareSharedHandRefillCommit(room, ownZones, {discard, shuffle, fromGraveyard,deadlineMs=0}) {
  const {plan, step, progress} = readSharedHandRefill(room);
  const {role, operation} = step;
  if (operation === 'start') {
    return {publicPatch: {multiplayerResolutionMarker: {
      kind: 'stack_resolution', stackId: plan.stackId, authorityRole: plan.authorityRole,
      turnCount: room.turnCount, phase: room.phase,
      sharedHandRefill: {cursor: 0, drawn: [], failed: [], discarded: [],
        ...(plan.kind === 'refill' ? {} : {actions:[],deadlineMs}),
        ...(plan.kind === 'redirect' ? {redirect:{index:plan.redirect.index,rows:[]}} : {}),
        ...(plan.kind === 'control' ? {control:{index:plan.control.index}} : {}),
        ...(plan.kind === 'chained' ? {chain:{rows:[]}} : {})}
    }}, privatePatch: {}};
  }
  requireRefill(operation === 'move' || operation === 'draw', 'FINISH_REQUIRES_ENGINE');
  requireRefill(ownZones?.hand?.length === room[role + 'HandCount'] &&
    ownZones?.deck?.length === room[role + 'DeckCount'], 'PRIVATE_ZONE_MISMATCH');
  const hand = [...ownZones.hand];
  const deck = [...ownZones.deck];
  const publicPatch = {};
  const privatePatch = {};
  const next = {...progress, cursor: progress.cursor + 1};

  if (operation === 'draw') {
    const drawn = Math.min(plan.amount, deck.length);
    hand.push(...deck.splice(deck.length - drawn, drawn).reverse());
    next.drawn = [...progress.drawn, drawn];
    next.failed = [...progress.failed, plan.amount - drawn];
  } else if (plan.move === 'shuffle') {
    deck.push(...hand.splice(0), ...room[role + 'Graveyard'].map(fromGraveyard));
    shuffle(deck);
    publicPatch[role + 'Graveyard'] = [];
    // Even a shuffle with zero moved cards may change the order.
    privatePatch.deck = deck;
  } else {
    const zones = {Graveyard: [...room[role + 'Graveyard']], Exile: [...room[role + 'Exile']]};
    next.discarded = [...progress.discarded];
    for (const card of hand.splice(0)) {
      const {zone, entry} = discard(card, next.discarded.length);
      next.discarded.push({role, zone, index: zones[zone].length});
      zones[zone].push(entry);
    }
    for (const zone of Object.keys(zones)) {
      if (zones[zone].length !== room[role + zone].length) publicPatch[role + zone] = zones[zone];
    }
  }
  for (const [key, cards] of [['hand', hand], ['deck', deck]]) {
    if (cards.length === ownZones[key].length) continue;
    privatePatch[key] = cards;
    publicPatch[role + (key === 'hand' ? 'HandCount' : 'DeckCount')] = cards.length;
  }
  publicPatch.multiplayerResolutionMarker = {...room.multiplayerResolutionMarker, sharedHandRefill: next};
  return {publicPatch, privatePatch};
}

function nextPhaseSevenCommit(room,extra,publicPatch={},privatePatch={}) {
  const marker = room.multiplayerResolutionMarker;
  const progress = marker.sharedHandRefill;
  return {publicPatch:{...publicPatch,multiplayerResolutionMarker:{
    ...marker,sharedHandRefill:{...progress,cursor:progress.cursor+1,...extra}
  }},privatePatch};
}

export function prepareChainedCommit(room,result) {
  return nextPhaseSevenCommit(room,{chain:{rows:result.rows}},result.publicPatch,result.privatePatch);
}

function assertChainedCommit(room,role,old,next,publicPatch,privatePatch) {
  requireRefill(next?.cursor === 1 && old.progress.cursor === 0 && !next.triggerOrder,'INVALID_CHAIN_STEP');
  const fields = ['syncMeta','multiplayerResolutionMarker'];
  if (old.plan.chainKind === 'library-life') {
    fields.push(role+'HP');
    const deckCount = readCount(room,{},role+'DeckCount');
    requireRefill(hasOnlyKeys(privatePatch,['deck']) &&
      (deckCount ? Array.isArray(privatePatch.deck) && privatePatch.deck.length === deckCount : !Object.keys(privatePatch).length) &&
      publicPatch[role+'HP'] === room[role+'HP']-old.plan.effect.lifeLossAfter,'INVALID_PRIVATE_LIBRARY_CHAIN');
  } else {
    fields.push(...phaseSevenPublicMutationKeys);
    requireRefill(!Object.keys(privatePatch).length,'INVALID_CHAIN_PRIVATE_MUTATION');
  }
  requireRefill(hasOnlyKeys(publicPatch,fields),'INVALID_CHAIN_PUBLIC_MUTATION');
}

export function prepareRedirectCommit(room,change,deadlineMs) {
  const {progress} = readSharedHandRefill(room);
  return nextPhaseSevenCommit(room,{
    deadlineMs,...change.drawReceipt,redirect:{...progress.redirect,...change.redirect}
  },change.publicPatch,change.privatePatch);
}

export function prepareControlCommit(room,control,publicPatch,deadlineMs,{sameCursor=false}={}) {
  const {progress}=readSharedHandRefill(room);
  return nextPhaseSevenCommit(room,{
    deadlineMs,control:{...progress.control,...control},...(sameCursor ? {cursor:progress.cursor} : {})
  },publicPatch);
}

function assertControlCommit(old,next,publicPatch,privatePatch) {
  const operation=old.step.operation;
  const prior=old.progress.control;
  const current=next?.control;
  const intermediate=operation==='control-ward' && next?.cursor===old.progress.cursor;
  const paid=operation==='control-ward' && (intermediate || (prior.wards.length && current?.wardPaid));
  requireRefill(current && (intermediate || next.cursor===old.progress.cursor+1) && !next.triggerOrder &&
    !Object.keys(privatePatch).length,'INVALID_CONTROL_STEP');
  const expectedFields={
    'control-answer':['outcome','coinId'],'control-present':[],
    'control-targets':['target','wards','rows','wardIndex'],'control-ward':['wardPaid','rows','wardIndex']
  }[operation];
  const changed=Object.keys(current).filter(key=>!sameWire(current[key],prior[key]));
  requireRefill(changed.every(key=>expectedFields.includes(key)) &&
    Object.keys(prior).every(key=>Object.hasOwn(current,key)),'INVALID_CONTROL_RECEIPT');
  requireRefill(hasOnlyKeys(publicPatch,['syncMeta','multiplayerResolutionMarker',
    ...(paid ? phaseSevenPublicMutationKeys : [])]),'INVALID_CONTROL_FIELDS');
  if (operation==='control-ward') requireRefill(validTriggerRows(current.rows) &&
    sameWire(current.rows.slice(0,prior.rows.length),prior.rows) &&
    current.wardIndex===prior.wardIndex+Number(!!paid) &&
    (!intermediate || current.wardIndex<current.wards.length && !Object.hasOwn(current,'wardPaid')) &&
    (!paid || Object.keys(publicPatch).some(key=>phaseSevenPublicMutationKeys.includes(key))),'INVALID_CONTROL_TRIGGERS');
}

function assertRedirectCommit(room,old,next,publicPatch,privatePatch) {
  const {plan,step,progress} = old;
  const {redirect} = next || {};
  requireRefill(redirect && next.cursor === progress.cursor+1 && !next.triggerOrder,'INVALID_REDIRECT_STEP');
  const before = progress.redirect;
  const fields = ['syncMeta','multiplayerResolutionMarker'];
  if (step.operation === 'redirect-tax' || step.operation === 'redirect-ward') {
    const key = step.operation === 'redirect-tax' ? 'taxPaid' : 'wardPaid';
    fields.push(...phaseSevenPublicMutationKeys);
    requireRefill(sameWire({...before,[key]:redirect[key],rows:redirect.rows},redirect) &&
      sameWire(redirect.rows.slice(0,before.rows.length),before.rows) && validTriggerRows(redirect.rows) &&
      redirect[key] === Object.keys(publicPatch).some(name=>phaseSevenPublicMutationKeys.includes(name)), 'INVALID_REDIRECT_PAYMENT');
  } else if (step.operation === 'redirect-target' || step.operation === 'redirect-skip-target') {
    const target = redirect.target;
    const original = room.stackState[plan.redirect.index];
    const stackTarget = target?.type === 'stack' && hasOnlyKeys(target,['type','stackId']) &&
      target.stackId !== original?.id && room.stackState.some(item=>item.id === target.stackId);
    requireRefill(sameWire({...before,target,ward:redirect.ward},redirect) && (stackTarget || validPublicTarget(room,target)) &&
      (step.operation !== 'redirect-skip-target' || target === null) && (target || redirect.ward === 0),'INVALID_REDIRECT_TARGET');
  } else if (step.operation === 'redirect-apply') {
    fields.push(...phaseSevenPublicMutationKeys,plan.authorityRole+'HP',plan.authorityRole+'HandCount',plan.authorityRole+'DeckCount');
    requireRefill(sameWire({...before,rows:redirect.rows},redirect) && validTriggerRows(redirect.rows) &&
      sameWire(redirect.rows.slice(0,before.rows.length),before.rows),'INVALID_REDIRECT_FOLLOW_UP');
    const {authorityRole:role} = plan;
    const oldHand = readCount(room,{},role+'HandCount'), oldDeck = readCount(room,{},role+'DeckCount');
    const drawn = Math.min(oldDeck,progress.redirect.taxPaid ? 0 : plan.redirect.draw);
    const hand = readCount(room,publicPatch,role+'HandCount'), deck = readCount(room,publicPatch,role+'DeckCount');
    requireRefill(hand === oldHand+drawn && deck === oldDeck-drawn && (next.drawn[0] || 0) === drawn,'INVALID_REDIRECT_DRAW');
    checkPrivateCounts(privatePatch,oldHand,hand,oldDeck,deck);
  } else {
    const expected = step.operation === 'redirect-skip-tax' ? {taxPaid:false} : {wardPaid:true};
    requireRefill(sameWire({...before,...expected},redirect),'INVALID_REDIRECT_SKIP');
  }
  requireRefill(hasOnlyKeys(publicPatch,fields) && (step.operation === 'redirect-apply' || !Object.keys(privatePatch).length),'INVALID_REDIRECT_FIELDS');
}

export function preparePhaseSevenCommit(room,ownZones,choice,{deadlineMs,discard,random,draft}) {
  const {plan,step,progress} = readSharedHandRefill(room);
  if (step.operation === 'confirm' || step.operation === 'sacrifice-choice') {
    return nextPhaseSevenCommit(room,{actions:[...progress.actions,choice],deadlineMs});
  }
  if (step.operation === 'apply') {
    const result = draft(plan,progress);
    return nextPhaseSevenCommit(room,result.batch ? {triggerOrder:result.batch} : {},result.publicPatch);
  }
  requireRefill(step.operation === 'discard-one','INVALID_EFFECT_STAGE');
  const role = step.role;
  const hand = [...ownZones.hand];
  if (!hand.length) return nextPhaseSevenCommit(room,{});
  const [card] = hand.splice(random(hand.length),1);
  const {zone,entry} = discard(card,0);
  const zoneKey = role + zone;
  return nextPhaseSevenCommit(room,{discarded:[{role,zone,index:room[zoneKey].length}]},{
    [zoneKey]:[...room[zoneKey],entry],[role+'HandCount']:hand.length
  },{hand});
}

function assertPhaseSevenCommit(room,role,old,next,publicPatch,privatePatch) {
  const {step,progress} = old;
  requireRefill(next && next.cursor === progress.cursor + 1 &&
    sameWire(next.actions.slice(0,progress.actions.length),progress.actions),'STALE_OR_SKIPPED_STEP');
  const fields = ['syncMeta','multiplayerResolutionMarker'];
  if (step.operation === 'apply') {
    fields.push(...phaseSevenPublicMutationKeys);
    requireRefill(!Object.keys(privatePatch).length,'INVALID_EFFECT_MUTATION');
  } else if (step.operation === 'discard-one') {
    const beforeHand = readCount(room,{},role+'HandCount');
    const afterHand = readCount(room,publicPatch,role+'HandCount');
    fields.push(role+'HandCount',role+'Graveyard',role+'Exile');
    const ref = next.discarded?.[0];
    const zones = ['Graveyard','Exile'];
    requireRefill(afterHand === Math.max(0,beforeHand-1) &&
      (beforeHand ? ref?.role === role && zones.includes(ref.zone) : !ref) &&
      zones.every(zone=>{
        const previous = countPublicCards(room,{},role+zone);
        return countPublicCards(room,publicPatch,role+zone) === previous + Number(ref?.zone === zone) &&
          (ref?.zone !== zone || ref.index === previous);
      }) &&
      hasOnlyKeys(privatePatch,['hand']) &&
      (!beforeHand || Array.isArray(privatePatch.hand) && privatePatch.hand.length === afterHand),'INVALID_OPTIONAL_DISCARD');
  } else {
    requireRefill(!Object.keys(privatePatch).length && !next.triggerOrder,'INVALID_EFFECT_DECISION');
  }
  requireRefill(hasOnlyKeys(publicPatch,fields),'UNEXPECTED_PUBLIC_FIELDS');
}

export const phaseSevenPublicMutationKeys = roles.flatMap(role =>
  ['Lands','Support','Combat','Planeswalkers','Graveyard','Exile','ManaPool','PermanentExitTurn'].map(zone=>role+zone));

function readCount(room, patch, field) {
  const count = Object.hasOwn(patch, field) ? patch[field] : room[field];
  requireRefill(nonNegativeInteger(count), 'INVALID_ZONE_COUNT');
  return count;
}

function countPublicCards(room, patch, field) {
  const zone = Object.hasOwn(patch, field) ? patch[field] : room[field];
  requireRefill(Array.isArray(zone), 'INVALID_PUBLIC_ZONE');
  return zone.length;
}

function checkPrivateCounts(privatePatch, oldHand, hand, oldDeck, deck) {
  for (const [zone, before, after] of [['hand', oldHand, hand], ['deck', oldDeck, deck]]) {
    if (before !== after || Object.hasOwn(privatePatch, zone)) {
      requireRefill(Array.isArray(privatePatch[zone]) && privatePatch[zone].length === after, 'PRIVATE_ZONE_MISMATCH');
    }
  }
}

// Called inside the public/private Firestore transaction, after checking the role session.
// The room reread by a retry must still have the cursor for this exact write.
export function assertSharedHandRefillCommit(room, role, publicPatch, privatePatch) {
  const marker = room.multiplayerResolutionMarker;
  const nextMarker = publicPatch.multiplayerResolutionMarker;
  const writesMarker = Object.hasOwn(publicPatch, 'multiplayerResolutionMarker');
  const usesSharedRefill = marker?.sharedHandRefill != null || nextMarker?.sharedHandRefill != null;
  if (!usesSharedRefill) return;

  requireRefill(room.engineProtocolVersion === SHARED_REFILL_PROTOCOL, 'INCOMPATIBLE_PROTOCOL');
  requireRefill(writesMarker && !room.gameOver, 'EXPECTED_PROGRESS_WRITE');
  requireRefill(hasOnlyKeys(privatePatch, ['hand', 'deck']), 'INVALID_PRIVATE_PATCH');
  if (!marker) {
    const initial = expectedMarker(room, nextMarker);
    requireRefill(initial && initial.progress.cursor === 0 && room.consecutivePasses === 2 &&
      role === initial.plan.authorityRole && Object.keys(privatePatch).length === 0 &&
      hasOnlyKeys(publicPatch, ['syncMeta', 'multiplayerResolutionMarker']), 'INVALID_START');
    return;
  }

  const current = readSharedHandRefill(room);
  requireRefill(current && role === current.step.role, 'WRONG_STEP_OWNER');
  const beforeBatch = current.progress.triggerOrder;
  if (['order','target','ward'].includes(current.step.operation) ||
      (current.step.operation === 'finish' && nextMarker !== null)) {
    const next = expectedMarker(room,nextMarker)?.progress;
    const batch = next?.triggerOrder;
    requireRefill(batch && Object.keys(privatePatch).length === 0 &&
      hasOnlyKeys(publicPatch,['syncMeta','multiplayerResolutionMarker',...(current.step.operation === 'ward' ? phaseSevenPublicMutationKeys : [])]) &&
      sameWire({...next,triggerOrder:null,sealedTriggers:null},{...current.progress,triggerOrder:null,sealedTriggers:null}), 'INVALID_TRIGGER_COMMIT');
    const sameSealed = sameWire(next.sealedTriggers,current.progress.sealedTriggers);
    if (!beforeBatch) requireRefill(batch.answers.length === 0 && batch.targets.length === 0 &&
      !batch.wardCosts && sameSealed,'INVALID_TRIGGER_PLAN');
    else if (current.step.operation === 'finish' && beforeBatch.wardCosts) {
      requireRefill(sameWire(batch.rows,beforeBatch.wardAnswers.flatMap(answer=>answer.rows)) &&
        sameWire(next.sealedTriggers,[...(current.progress.sealedTriggers || []),...phaseSevenBatchStack(current.plan,current.progress)]) &&
        batch.answers.length === 0 && batch.targets.length === 0 && !batch.wardCosts,'INVALID_WARD_TRIGGERS');
    }
    else {
      requireRefill(sameWire(batch.rows,beforeBatch.rows) && sameSealed,'INVALID_TRIGGER_PLAN');
      if (current.step.operation === 'order') {
        requireRefill(batch.answers.length === beforeBatch.answers.length + 1 &&
          sameWire(batch.answers.slice(0,-1),beforeBatch.answers) &&
          sameWire(batch.targets,beforeBatch.targets),'INVALID_TRIGGER_ORDER');
      } else if (current.step.operation === 'target') {
        requireRefill(sameWire(batch.answers,beforeBatch.answers) &&
          batch.targets.length === beforeBatch.targets.length + 1 &&
          sameWire(batch.targets.slice(0,-1),beforeBatch.targets) &&
          validPublicTarget(room,batch.targets.at(-1).target),'INVALID_TRIGGER_TARGET');
      } else {
        requireRefill(sameWire(batch.answers,beforeBatch.answers) && sameWire(batch.targets,beforeBatch.targets) &&
          !!batch.wardCosts,'INVALID_WARD_STEP');
        if (current.step.operation === 'finish') requireRefill(batch.wardAnswers.length === 0,'INVALID_WARD_STEP');
        else {
          requireRefill(sameWire(batch.wardCosts,beforeBatch.wardCosts) &&
            batch.wardAnswers.length === beforeBatch.wardAnswers.length + 1 &&
            sameWire(batch.wardAnswers.slice(0,-1),beforeBatch.wardAnswers),'INVALID_WARD_RECEIPT');
          requireRefill(batch.wardAnswers.at(-1).paid === Object.keys(publicPatch)
            .some(key=>phaseSevenPublicMutationKeys.includes(key)),'INVALID_WARD_PAYMENT');
        }
      }
    }
    return;
  }
  if (current.step.operation === 'finish') {
    requireRefill(nextMarker === null && Array.isArray(publicPatch.stackState) &&
      !publicPatch.stackState.some(item => item.id === current.plan.stackId) &&
      Object.keys(privatePatch).length === 0, 'INVALID_FINISH');
    if ((beforeBatch || ['redirect','control','chained'].includes(current.plan.kind)) && !publicPatch.gameOver) requireRefill(sameWire(publicPatch.stackState,[
      ...(current.plan.kind==='control' ? spellControlFinalStack(room,current.plan,current.progress.control,
        spellControlApplies(room,current.plan,current.progress.control))
        : current.plan.kind === 'redirect' ? redirectFinishingStack(room,current.plan,current.progress) : room.stackState.slice(0,-1)),
      ...(current.progress.sealedTriggers || []),
      ...(beforeBatch ? phaseSevenBatchStack(current.plan,current.progress) : [])
    ]),'INVALID_TRIGGER_STACK');
    return;
  }

  const next = expectedMarker(room, nextMarker);
  if (current.plan.kind === 'chained') {
    assertChainedCommit(room,role,current,next?.progress,publicPatch,privatePatch);
    return;
  }
  if (current.plan.kind==='control') {
    assertControlCommit(current,next?.progress,publicPatch,privatePatch);
    return;
  }
  if (current.plan.kind === 'redirect') {
    assertRedirectCommit(room,current,next?.progress,publicPatch,privatePatch);
    return;
  }
  if (current.plan.kind !== 'refill') {
    assertPhaseSevenCommit(room,role,current,next?.progress,publicPatch,privatePatch);
    return;
  }
  requireRefill(next && next.progress.cursor === current.progress.cursor + 1 &&
    current.progress.drawn.every((count, index) => count === next.progress.drawn[index]) &&
    current.progress.failed.every((count, index) => count === next.progress.failed[index]), 'STALE_OR_SKIPPED_STEP');
  const handField = role + 'HandCount';
  const deckField = role + 'DeckCount';
  const graveyardField = role + 'Graveyard';
  const exileField = role + 'Exile';
  const writesMove = current.step.operation === 'move';
  const fields = ['syncMeta', 'multiplayerResolutionMarker', handField, deckField];
  if (writesMove) fields.push(graveyardField);
  if (writesMove && current.plan.move === 'discard') fields.push(exileField);
  requireRefill(hasOnlyKeys(publicPatch, fields), 'UNEXPECTED_PUBLIC_FIELDS');

  const oldHand = readCount(room, {}, handField);
  const oldDeck = readCount(room, {}, deckField);
  const hand = readCount(room, publicPatch, handField);
  const deck = readCount(room, publicPatch, deckField);
  checkPrivateCounts(privatePatch, oldHand, hand, oldDeck, deck);
  const previousDiscards = current.progress.discarded;
  const discardCount = writesMove && current.plan.move === 'discard' ? oldHand : 0;
  requireRefill(next.progress.discarded.length === previousDiscards.length + discardCount &&
    previousDiscards.every((ref, index) => {
      const other = next.progress.discarded[index];
      return ref.role === other.role && ref.zone === other.zone && ref.index === other.index;
    }), 'INVALID_DISCARD_RECEIPTS');
  if (!writesMove) {
    const drawn = Math.min(oldDeck, current.plan.amount);
    requireRefill(hand === oldHand + drawn && deck === oldDeck - drawn &&
      next.progress.drawn.at(-1) === drawn &&
      next.progress.failed.at(-1) === current.plan.amount - drawn, 'INVALID_DRAW');
    return;
  }

  const oldGraveyard = countPublicCards(room, {}, graveyardField);
  const graveyard = countPublicCards(room, publicPatch, graveyardField);
  if (current.plan.move === 'shuffle') {
    requireRefill(hand === 0 && graveyard === 0 && deck === oldDeck + oldHand + oldGraveyard, 'INVALID_SHUFFLE');
  } else {
    const oldExile = countPublicCards(room, {}, exileField);
    const exile = countPublicCards(room, publicPatch, exileField);
    requireRefill(hand === 0 && deck === oldDeck && graveyard >= oldGraveyard &&
      exile >= oldExile && graveyard + exile === oldGraveyard + oldExile + oldHand, 'INVALID_DISCARD');
    requireRefill(next.progress.discarded.slice(previousDiscards.length).every(ref => ref.role === role &&
      (ref.zone === 'Graveyard' ? ref.index >= oldGraveyard && ref.index < graveyard
        : ref.index >= oldExile && ref.index < exile)), 'INVALID_DISCARD_RECEIPTS');
  }
}
