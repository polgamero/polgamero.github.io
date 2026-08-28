import { hasKeyword, canBlock, predictDuel, getProtectionMatch } from './keywords.js';
import { moveBattlefieldCardToZone } from './utils.js';

const COLOR_LABELS = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde' };

import { 
  state, 
  logMsg, 
  getEffectivePower, 
  getEffectiveToughness, 
  render, 
  passPriority, // Importado del main/turnManager
  beginActivePlayerPriorityWindow,
  detachEquipmentFrom,
  sendAurasToGraveyard,
  triggerCreatureDies,
  triggerAnyCreatureDeath,
  queueCreatureDeathBatch,
  queueTriggeredAbility,
  queueTriggeredAbilities,
  buildGenericEventTriggerEntries,
  dispatchGameEvent,
  dispatchReplacementCounterRemoval,
  cleanupIfVehicle,
  checkPlaneswalkerDeaths,
  addCounters,
  getRivalName,
  waitForDiscardEffects,
  runStateBasedActions
} from './main.js';
import { showDamageAssignmentModal } from './ui.js';
import { recordTelemetryEvent } from './telemetry.js';
import { gameText } from './gameTexts.js';
import { resolveReplacementEvent } from './replacementEngine.js';
import { botHasCapability } from './botDifficulty.js';
import { chooseHardBlockPlan, COMBAT_BOT_2_VERSION } from './combatBot2.js';

// Habilidades disparadas de combate: ahora se APILAN en vez de resolver durante la
// declaración/daño. `triggerKey` se traduce a una etiqueta estable para Stack/logs.
function buildCombatAbilityTriggerEntries(unit, triggerKey, isLocal, eventData = {}) {
  if (!unit?.card) return [];
  const trig = unit.card?.[triggerKey];
  const triggerType = triggerKey === 'attackTrigger' ? 'attack'
    : triggerKey === 'blockTrigger' ? 'block'
    : triggerKey === 'combatDamageTrigger' ? 'combat_damage'
    : triggerKey;
  const entries=[];
  if (trig) entries.push({ effect:trig, sourceCard:unit.card, sourceItem:unit, isLocal, triggerType });
  const eventType = triggerKey === 'attackTrigger' ? 'attack_declared'
    : triggerKey === 'blockTrigger' ? 'block_declared'
    : triggerKey === 'combatDamageTrigger' ? 'combat_damage_dealt'
    : null;
  if (eventType) entries.push(...buildGenericEventTriggerEntries({
    type:eventType, controllerIsLocal:isLocal, actorIsLocal:isLocal,
    card:unit.card, item:unit, sourceCard:unit.card, sourceItem:unit, combat:true, amount:eventData.amount ?? null,
    sourceControllerIsLocal:isLocal, targetPlayerIsLocal:eventData.targetPlayerIsLocal ?? null,
    metadata:eventData.metadata || null, zoneFrom:'battlefield', zoneTo:'battlefield'
  }));
  return entries;
}

export function triggerCombatAbility(unit, triggerKey, isLocal, eventData = {}) {
  return queueTriggeredAbilities(buildCombatAbilityTriggerEntries(unit, triggerKey, isLocal, eventData));
}

// Encantamientos/Artefactos que reaccionan a que una criatura ataque. Snapshot + batch para
// que todos los watchers del mismo evento entren juntos a la Stack.
function buildAnyCreatureAttacksTriggerEntries(isLocal) {
  const support = isLocal ? state.localSupport : state.rivalSupport;
  return support
    .filter(s => s.card?.anyCreatureAttacksTrigger)
    .map(s => ({
      effect: s.card.anyCreatureAttacksTrigger, sourceCard: s.card, sourceItem: s, isLocal,
      triggerType: 'any_creature_attacks'
    }));
}

export function triggerAnyCreatureAttacks(isLocal) {
  return queueTriggeredAbilities(buildAnyCreatureAttacksTriggerEntries(isLocal));
}

// Declarar atacantes es un único evento de turno. El tap por atacar y todos los triggers de
// ataque de esas criaturas deben entrar juntos al mismo batch AP/NAP; si los encolamos uno a
// uno el jugador pierde la elección correcta de orden entre "cuando se gira" y "cuando ataca".
export function queueDeclaredAttackTriggers(attackers, isLocal) {
  const entries=[];
  for (const unit of attackers || []) {
    if (!unit?.card) continue;
    const wasTapped=!!unit.tapped;
    if (!hasKeyword(unit, 'vigilance')) unit.tapped=true;
    if (!wasTapped && unit.tapped) entries.push(...buildGenericEventTriggerEntries({
      type:'permanent_tapped', controllerIsLocal:isLocal, actorIsLocal:isLocal,
      card:unit.card, item:unit, sourceCard:unit.card, sourceItem:unit,
      zoneFrom:'battlefield', zoneTo:'battlefield', cause:'attack', combat:true
    }));
    entries.push(...buildCombatAbilityTriggerEntries(unit,'attackTrigger',isLocal));
  }
  if ((attackers || []).length) entries.push(...buildAnyCreatureAttacksTriggerEntries(isLocal));
  return queueTriggeredAbilities(entries);
}

// Los blockTrigger deben dispararse al DECLARAR/confirmar bloqueadores, no al empezar el
// daño. Marcamos cada bloqueador para que una ronda de prioridad/IA no los duplique.
export function queueDeclaredBlockTriggers(defenders, defenderIsLocal) {
  const entries = [];
  defenders.forEach(unit => {
    if (unit.blockingIndex === null || unit.blockingIndex === undefined) return;
    if (unit.blockTriggerQueuedThisCombat) return;
    unit.blockTriggerQueuedThisCombat = true;
    if (unit.card?.blockTrigger) {
      entries.push({
        effect: unit.card.blockTrigger, sourceCard: unit.card, sourceItem: unit,
        isLocal: defenderIsLocal, triggerType: 'block'
      });
    }
    entries.push(...buildGenericEventTriggerEntries({
      type:'block_declared', controllerIsLocal:defenderIsLocal, actorIsLocal:defenderIsLocal,
      card:unit.card, item:unit, combat:true, zoneFrom:'battlefield', zoneTo:'battlefield'
    }));
  });
  return queueTriggeredAbilities(entries);
}

// --- BLOQUEO INTELIGENTE DEL TANO ---
function assignSmartBlock(att, aIdx, availableBlockers) {
  const atkPower = getEffectivePower(att);
  const atkTough = getEffectiveToughness(att);
  const atkHasTrample = hasKeyword(att, 'trample');

  const legalBlockers = availableBlockers.filter(obj => canBlock(att, obj.c));
  if (legalBlockers.length === 0) return;

  const kills = (blockerItem) => predictDuel(att, blockerItem.c).attackerDies;
  const blockerSurvives = (blockerItem) => !predictDuel(att, blockerItem.c).blockerDies;
  const valueOf = (blockerItem) => getEffectivePower(blockerItem.c) + getEffectiveToughness(blockerItem.c);

  const cleanKill = legalBlockers.find(obj => kills(obj) && blockerSurvives(obj));
  if (cleanKill) {
    commitBlock(cleanKill, aIdx, availableBlockers);
    logMsg(gameText('bot.block.cleanKill', { attacker: att.card.name, blocker: cleanKill.c.card.name }));
    return;
  }

  if (!atkHasTrample) {
    const safeBlockers = legalBlockers.filter(blockerSurvives);
    if (safeBlockers.length > 0) {
      const chosen = [...safeBlockers].sort((x, y) => valueOf(x) - valueOf(y))[0];
      commitBlock(chosen, aIdx, availableBlockers);
      logMsg(gameText('bot.block.safe', { attacker: att.card.name, blocker: chosen.c.card.name }));
      return;
    }

    const tradeKill = legalBlockers.find(kills);
    if (tradeKill) {
      commitBlock(tradeKill, aIdx, availableBlockers);
      logMsg(gameText('bot.block.trade', { attacker: att.card.name, blocker: tradeKill.c.card.name }));
      return;
    }

    const seriousHit = atkPower >= state.rivalHP * 0.3;
    const pureDefenders = legalBlockers.filter(obj => hasKeyword(obj.c, 'defender'));

    if (seriousHit || pureDefenders.length > 0) {
      const pool = pureDefenders.length > 0 ? pureDefenders : legalBlockers;
      const chump = [...pool].sort((x, y) => valueOf(x) - valueOf(y))[0];
      commitBlock(chump, aIdx, availableBlockers);
      logMsg(gameText('bot.block.chump', { attacker: att.card.name, blocker: chump.c.card.name }));
    }
    return;
  }

  const sortedByValue = [...legalBlockers].sort((x, y) => valueOf(x) - valueOf(y));

  let gang = [];
  let sumPower = 0;
  let sumTough = 0;
  for (const obj of sortedByValue) {
    gang.push(obj);
    sumPower += getEffectivePower(obj.c);
    sumTough += getEffectiveToughness(obj.c);
    if (sumPower >= atkTough && sumTough >= atkPower) break;
  }

  const willKillAttacker = sumPower >= atkTough;
  const willAbsorbAllTrample = sumTough >= atkPower;

  if (willKillAttacker || willAbsorbAllTrample) {
    gang.forEach(obj => commitBlock(obj, aIdx, availableBlockers));
    const names = gang.map(o => o.c.card.name).join(', ');
    if (willKillAttacker && willAbsorbAllTrample) {
      logMsg(gameText('bot.block.gangKillNoTrample', { attacker: att.card.name, blockers: names }));
    } else if (willKillAttacker) {
      logMsg(gameText('bot.block.gangKillTrample', { attacker: att.card.name, blockers: names }));
    } else {
      logMsg(gameText('bot.block.gangAbsorb', { attacker: att.card.name, blockers: names }));
    }
    return;
  }

  const seriousHit = atkPower >= state.rivalHP * 0.3;
  const pureDefenders = sortedByValue.filter(obj => hasKeyword(obj.c, 'defender'));
  if (seriousHit || pureDefenders.length > 0) {
    const chump = pureDefenders.length > 0 ? pureDefenders[0] : sortedByValue[0];
    commitBlock(chump, aIdx, availableBlockers);
    logMsg(gameText('bot.block.trampleChump', { attacker: att.card.name, blocker: chump.c.card.name }));
  }
}

function commitBlock(blockerItem, aIdx, availableBlockers) {
  state.rivalCombat[blockerItem.i].blockingIndex = aIdx;
  const idx = availableBlockers.indexOf(blockerItem);
  if (idx !== -1) availableBlockers.splice(idx, 1);
}

// NUEVA FUNCIÓN: Llamada por la IA durante la fase de bloqueadores
export function assignBotBlockers() {
  const attackers = state.localCombat.filter(c => c.isAttacking);
  if (attackers.length === 0) return;

  // 23.17.2 — Difícil usa Combat Bot 2.0: evalúa la asignación COMPLETA de
  // bloqueadores en vez de resolver atacante por atacante de manera greedy. Medio conserva
  // exactamente assignSmartBlock(), que era el viejo comportamiento Difícil.
  if (botHasCapability(state.botDifficulty, 'combat2')) {
    const attackerRefs = state.localCombat.map((unit,index)=>({unit,index})).filter(x=>x.unit.isAttacking);
    const blockerRefs = state.rivalCombat.map((unit,index)=>({unit,index})).filter(x=>!x.unit.tapped);
    const helpers={
      getPower:getEffectivePower, getToughness:getEffectiveToughness,
      hasKeyword, canBlock, predictDuel
    };
    const plan=chooseHardBlockPlan({
      attackers:attackerRefs, blockers:blockerRefs,
      botLife:state.rivalHP, opponentLife:state.localHP, helpers
    });
    blockerRefs.forEach((ref,b)=>{
      const localAttackIndex=plan.assignment[b];
      ref.unit.blockingIndex = localAttackIndex >= 0 ? attackerRefs[localAttackIndex].index : null;
    });
    const used=blockerRefs.filter((_,b)=>plan.assignment[b]>=0).length;
    logMsg(gameText('bot.block.combat2', { count:used }));
    recordTelemetryEvent('bot_combat2_block_plan', {
      version:COMBAT_BOT_2_VERSION, utility:plan.utility, expectedDamage:plan.damage,
      blockerCount:used, attackerCount:attackerRefs.length
    });
    return;
  }

  let availableBlockers = state.rivalCombat.map((c, i) => ({c, i})).filter(obj => !obj.c.tapped);

  const attackerIndexesSorted = state.localCombat
    .map((c, idx) => idx)
    .filter(idx => state.localCombat[idx].isAttacking)
    .sort((a, b) => {
      const A = state.localCombat[a], B = state.localCombat[b];
      const aTrample = hasKeyword(A, 'trample') ? 1 : 0;
      const bTrample = hasKeyword(B, 'trample') ? 1 : 0;
      if (aTrample !== bTrample) return bTrample - aTrample;
      return getEffectivePower(B) - getEffectivePower(A);
    });

  attackerIndexesSorted.forEach(aIdx => {
    const att = state.localCombat[aIdx];
    if (availableBlockers.length === 0) return;

    if (hasKeyword(att, 'menace')) {
      let validBlockersIndexes = [];
      for (let i = 0; i < availableBlockers.length; i++) {
        if (canBlock(att, availableBlockers[i].c)) {
          validBlockersIndexes.push(i);
          if (validBlockersIndexes.length === 2) break;
        }
      }
      if (validBlockersIndexes.length === 2) {
        validBlockersIndexes.reverse().forEach(idx => {
          let blockerObj = availableBlockers.splice(idx, 1)[0];
          state.rivalCombat[blockerObj.i].blockingIndex = aIdx;
        });
        logMsg(gameText('bot.block.menaceGang', { attacker: att.card.name }));
      }
      return;
    }
    assignSmartBlock(att, aIdx, availableBlockers);
  });
  logMsg(gameText('bot.block.done'));
}

// Conserva la información de "esta criatura fue bloqueada" aunque todos sus bloqueadores
// abandonen el campo antes del daño. Con Trigger Stack esto dejó de ser un edge hipotético:
// responder al blockTrigger destruyendo/rebotando al bloqueador no vuelve al atacante
// mágicamente "no bloqueado". Sin Arrollar, sigue sin pegar al jugador.
export function markDeclaredBlocks(attackers, defenders) {
  (attackers || []).forEach((attacker, aIdx) => {
    if (!attacker?.isAttacking) return;
    if ((defenders || []).some(defender => defender?.blockingIndex == aIdx)) {
      attacker.wasBlockedThisCombat = true;
    }
  });
}

function isUnitStillOnBattlefield(item) {
  return state.localCombat.includes(item) || state.rivalCombat.includes(item);
}

export async function executeLocalAttack() {
  // 23.7.1: declarar atacantes es una acción idempotente por paso de combate.
  // Si una habilidad disparada (ej. Bengala de Cancha) usa la pila y luego la prioridad
  // vuelve al atacante, NO hay que volver a "confirmar" los mismos atacantes ni disparar
  // otra vez los triggers de ataque.
  if ((state.localAttackersDeclaredThisTurn || 0) > 0) {
    logMsg(gameText('combat.attackers.already'));
    passPriority('local');
    return;
  }

  const attackers = state.localCombat.filter(c => c.isAttacking);
  state.localAttackersDeclaredThisTurn = attackers.length;
  
  if (attackers.length > 0) {
    queueDeclaredAttackTriggers(attackers, true);
    logMsg(gameText('combat.attackers.count', { count: attackers.length }));
  } else {
    logMsg(gameText('combat.attackers.none'));
  }
  render();
  passPriority('local'); // Pasamos la prioridad para avanzar la fase
}

export function executeRivalAttack() {
  // 23.9.3: declarar bloqueadores es idempotente, incluso si fueron CERO. La ventana
  // post-bloqueadores devuelve prioridad y NO debe volver a entrar a esta declaración.
  if (state.localBlockersDeclaredThisCombat) {
    logMsg(gameText('combat.blockers.already'));
    passPriority('local');
    return;
  }

  // --- VALIDACIÓN DE AMENAZA (JUGADOR DEFIENDE) ---
  // 23.17.5.2 — no escondemos la causa detrás de un segundo mensaje genérico. Si una
  // Amenaza quedó con exactamente un bloqueador, explicamos la regla y que reiniciamos
  // TODAS las asignaciones para que el jugador pueda reconstruir una declaración legal.
  const menaceViolations = [];

  state.rivalCombat.forEach((attacker, aIdx) => {
    if (attacker.isAttacking && hasKeyword(attacker, 'menace')) {
      const blockersCount = state.localCombat.filter(d => d.blockingIndex == aIdx).length;
      if (blockersCount === 1) menaceViolations.push({ attacker, blockersCount });
    }
  });

  if (menaceViolations.length) {
    state.localCombat.forEach(c => c.blockingIndex = null);
    menaceViolations.forEach(({ attacker, blockersCount }) => {
      logMsg(gameText('combat.block.menaceIllegal', {
        attacker: attacker.card.name,
        count: blockersCount
      }));
    });
    render();
    return; // Detenemos para que el jugador corrija
  }

  markDeclaredBlocks(state.rivalCombat, state.localCombat);
  state.localBlockersDeclaredThisCombat = true;
  recordTelemetryEvent('blockers_declared', {
    player: 'local',
    turnCount: state.turnCount,
    activePlayer: state.activePlayer,
    phase: state.phase,
    blockerCount: state.localCombat.filter(unit => unit.blockingIndex !== null && unit.blockingIndex !== undefined).length
  });
  queueDeclaredBlockTriggers(state.localCombat, true);
  logMsg(gameText('combat.block.confirmed'));
  // La declaración de bloqueadores abre una ventana NUEVA. El jugador activo recibe
  // prioridad primero; no heredamos el pase que hizo para llegar a este paso ni salteamos
  // directo al daño cuando se declararon cero bloqueadores.
  beginActivePlayerPriorityWindow();
}

// --- GOLPE PRIMERO (First Strike) Y DAÑO DOBLE (Double Strike) ---
function isCreatureDead(item) {
  const dmg = item.damageTaken || 0;
  return dmg >= getEffectiveToughness(item) || (item.tookDeathtouch && dmg > 0);
}

function dealsInFirstStrikeStep(item) {
  return hasKeyword(item, 'firststrike') || hasKeyword(item, 'doublestrike');
}
function dealsInRegularStep(item) {
  return !hasKeyword(item, 'firststrike') || hasKeyword(item, 'doublestrike');
}

// Trigger Stack: si el daño de iniciativa genera habilidades disparadas, hay que abrir una
// ventana de prioridad ANTES del daño regular. Conservamos el snapshot de pares en memoria
// para que una criatura muerta en iniciativa no desplace índices y reasigne bloqueos al volver.
let pendingCombatDamageContinuation = null;

export function hasPendingCombatDamageContinuation() {
  return !!pendingCombatDamageContinuation;
}

function finishCombatDamageStep(attackersArray, defendersArray) {
  attackersArray.forEach(c => {
    c.isAttacking = false;
    c.wasBlockedThisCombat = false;
    c.tookDeathtouch = false;
    c.blockTriggerQueuedThisCombat = false;
  });
  defendersArray.forEach(c => {
    c.blockingIndex = null;
    c.tookDeathtouch = false;
    c.blockTriggerQueuedThisCombat = false;
  });
  state.pendingBlockerIndex = null;
}

// Nota: se ejecuta automáticamente en turnManager en el paso 'combat_damage'. Si existe una
// continuación pendiente, esta llamada es la segunda mitad (daño regular después de que la
// Stack de iniciativa quedó vacía).
export async function resolveCombatDamage() {
  if (pendingCombatDamageContinuation) {
    const { combatPairs, isLocalAttacking, attackersArray, defendersArray } = pendingCombatDamageContinuation;
    pendingCombatDamageContinuation = null;
    logMsg(gameText('combat.damage.regularStep'));
    await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInRegularStep);
    await runStateBasedActions({ reason:'combat_damage_regular' });
    finishCombatDamageStep(attackersArray, defendersArray);
    return;
  }

  const isLocalAttacking = state.activePlayer === 'local';
  const attackersArray = isLocalAttacking ? state.localCombat : state.rivalCombat;
  const defendersArray = isLocalAttacking ? state.rivalCombat : state.localCombat;

  const combatPairs = attackersArray
    .filter(a => a.isAttacking)
    .map(attacker => ({
      attacker,
      blockers: defendersArray.filter(d => d.blockingIndex == attackersArray.indexOf(attacker))
    }));

  if (combatPairs.length === 0) {
    finishCombatDamageStep(attackersArray, defendersArray);
    return;
  }

  // Fog: no hay daño; tampoco nacen combatDamageTrigger. Se limpian flags normalmente.
  if (state.combatDamagePrevented) {
    logMsg(gameText('combat.damage.prevented'));
    finishCombatDamageStep(attackersArray, defendersArray);
    return;
  }

  const hayIniciativa = combatPairs.some(({ attacker, blockers }) =>
    dealsInFirstStrikeStep(attacker) || blockers.some(dealsInFirstStrikeStep)
  );

  if (hayIniciativa) {
    const serialBefore = state.triggerStackSerial || 0;
    logMsg(gameText('combat.damage.firstStrikeStep'));
    await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInFirstStrikeStep);
    await runStateBasedActions({ reason:'combat_damage_first_strike' });

    // Si iniciativa produjo combatDamage/dies/anyDies/etc., no seguimos de largo: esas
    // habilidades quedan en Stack y ambos jugadores pueden responder. Cuando la pila quede
    // vacía y vuelvan a pasar, turnManager reingresa acá para ejecutar el daño regular.
    if ((state.triggerStackSerial || 0) > serialBefore) {
      pendingCombatDamageContinuation = { combatPairs, isLocalAttacking, attackersArray, defendersArray };
      logMsg(gameText('combat.damage.waitTriggers'));
      return;
    }
    logMsg(gameText('combat.damage.regularStep'));
  }

  await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInRegularStep);
  await runStateBasedActions({ reason:'combat_damage_regular' });
  finishCombatDamageStep(attackersArray, defendersArray);
}

// Infectar (regla real 702.90): una criatura con Infectar hace TODO su daño de combate de
// forma alternativa — a otra criatura, en vez de dañarla normalmente, le pone contadores
// -1/-1 (que además YA reducen su resistencia efectiva sola, vía getEffectiveToughness —
// el mismo sistema que ya usa Proliferar y Lealtad); a un jugador, en vez de bajarle HP, le
// pone contadores de Veneno. A un Planeswalker NO le cambia nada: sigue siendo pérdida de
// Lealtad normal, como en MTG real (Infectar solo altera daño a jugadores y a criaturas).
function gainLifeFromCombat(isLocal, amount, sourceItem = null) {
  const n=Math.max(0,Number(amount)||0); if(n<=0) return;
  if(isLocal) state.localHP += n; else state.rivalHP += n;
  dispatchGameEvent({type:'life_gained',controllerIsLocal:isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,sourceCard:sourceItem?.card||null,sourceItem,amount:n,cause:'lifelink',combat:true});
}

function dealCombatDamageToCreature(source, targetItem, amount) {
  if (amount <= 0) return 0;
  const sourceIsLocal=state.localCombat.includes(source);
  const targetIsLocal=state.localCombat.includes(targetItem);
  const replacement=resolveReplacementEvent(state,{type:'damage',amount,affectedIsLocal:targetIsLocal,targetIsLocal,card:targetItem.card,item:targetItem,targetCard:targetItem.card,targetItem,sourceCard:source.card,sourceItem:source,combat:true,cause:'combat'});
  dispatchReplacementCounterRemoval(replacement,targetItem,{controllerIsLocal:targetIsLocal,actorIsLocal:targetIsLocal});
  const finalAmount=Math.max(0,Number(replacement.event.amount)||0);
  if(finalAmount<=0){ logMsg(gameText('replacement.damage.prevented',{target:targetItem.card.name})); return 0; }
  if (hasKeyword(source, 'infect')) {
    addCounters(targetItem, 'minusOne', finalAmount);
    logMsg(gameText('combat.infect.creature', { target: targetItem.card.name, amount:finalAmount, source: source.card.name }));
  } else {
    targetItem.damageTaken = (targetItem.damageTaken || 0) + finalAmount;
  }
  dispatchGameEvent({type:'combat_damage_dealt',controllerIsLocal:targetIsLocal,actorIsLocal:sourceIsLocal,sourceControllerIsLocal:sourceIsLocal,targetControllerIsLocal:targetIsLocal,card:targetItem.card,item:targetItem,sourceCard:source.card,sourceItem:source,targetCard:targetItem.card,targetItem,amount:finalAmount,combat:true,cause:'combat'});
  return finalAmount;
}

function dealCombatDamageToPlayer(source, isTargetLocal, amount) {
  if (amount <= 0) return 0;
  const sourceIsLocal=state.localCombat.includes(source);
  const replacement=resolveReplacementEvent(state,{type:'damage',amount,affectedIsLocal:isTargetLocal,targetIsLocal:isTargetLocal,sourceCard:source.card,sourceItem:source,combat:true,cause:'combat'});
  const finalAmount=Math.max(0,Number(replacement.event.amount)||0);
  if(finalAmount<=0){ logMsg(gameText('replacement.damage.prevented',{target:isTargetLocal?'Vos':getRivalName()})); return 0; }
  if (hasKeyword(source, 'infect')) {
    if (isTargetLocal) state.localPoison = (state.localPoison || 0) + finalAmount;
    else state.rivalPoison = (state.rivalPoison || 0) + finalAmount;
    logMsg(gameText('combat.infect.player', { source: source.card.name, amount:finalAmount, target: isTargetLocal ? 'Vos' : getRivalName() }));
  } else {
    if (isTargetLocal) state.localHP -= finalAmount;
    else state.rivalHP -= finalAmount;
    dispatchGameEvent({type:'life_lost',controllerIsLocal:isTargetLocal,actorIsLocal:sourceIsLocal,sourceControllerIsLocal:sourceIsLocal,targetPlayerIsLocal:isTargetLocal,sourceCard:source.card,sourceItem:source,amount:finalAmount,cause:'combat_damage',combat:true});
  }
  return finalAmount;
}

function dealCombatDamageToPlaneswalker(source, targetItem, amount) {
  if (amount <= 0 || !targetItem) return 0;
  const targetIsLocal=state.localPlaneswalkers.includes(targetItem);
  const targetIsRival=state.rivalPlaneswalkers.includes(targetItem);
  if (!targetIsLocal && !targetIsRival) return 0;
  const sourceIsLocal=state.localCombat.includes(source);
  const replacement=resolveReplacementEvent(state,{type:'damage',amount,affectedIsLocal:targetIsLocal,targetIsLocal,card:targetItem.card,item:targetItem,targetCard:targetItem.card,targetItem,sourceCard:source.card,sourceItem:source,combat:true,cause:'combat'});
  dispatchReplacementCounterRemoval(replacement,targetItem,{controllerIsLocal:targetIsLocal,actorIsLocal:targetIsLocal});
  const finalAmount=Math.max(0,Number(replacement.event.amount)||0);
  if(finalAmount<=0){ logMsg(gameText('replacement.damage.prevented',{target:targetItem.card.name})); return 0; }
  targetItem.loyalty -= finalAmount;
  dispatchGameEvent({type:'combat_damage_dealt',controllerIsLocal:targetIsLocal,actorIsLocal:sourceIsLocal,sourceControllerIsLocal:sourceIsLocal,targetControllerIsLocal:targetIsLocal,card:targetItem.card,item:targetItem,sourceCard:source.card,sourceItem:source,targetCard:targetItem.card,targetItem,amount:finalAmount,combat:true,cause:'combat'});
  checkPlaneswalkerDeaths();
  return finalAmount;
}

async function resolveDamageSubStep(combatPairs, isLocalAttacking, stepFilter) {
  for (const { attacker, blockers } of combatPairs) {
    // Entre Iniciativa y daño regular ahora puede resolverse una Stack completa. Una
    // criatura destruida/rebotada/exiliada durante esa ventana no puede seguir pegando
    // desde una referencia JS vieja guardada en combatPairs.
    if (!isUnitStillOnBattlefield(attacker) || isCreatureDead(attacker)) continue;

    const attackerDealsThisStep = stepFilter(attacker);
    const attackerPower = getEffectivePower(attacker);
    const attackerHasLifelink = hasKeyword(attacker, 'lifelink') || hasKeyword(attacker, 'life_link');
    const attackerHasDeathtouch = hasKeyword(attacker, 'deathtouch');
    const attackerHasTrample = hasKeyword(attacker, 'trample');

    const aliveBlockers = blockers.filter(b => isUnitStillOnBattlefield(b) && !isCreatureDead(b));

    aliveBlockers.forEach(blocker => {
      if (!stepFilter(blocker)) return; 

      const bPower = getEffectivePower(blocker);
      const blockerHasLifelink = hasKeyword(blocker, 'lifelink') || hasKeyword(blocker, 'life_link');
      const blockerHasDeathtouch = hasKeyword(blocker, 'deathtouch');

      // Protección de [color]: si el atacante tiene Protección del color de ESTE
      // bloqueador, ese bloqueador en particular no le hace nada — ni daño, ni Toque
      // Mortal, ni le da Vínculo Vital a su controlador (sin daño real, no hay nada que
      // curar). Caso raro (normalmente canBlock ya frena el bloqueo de entrada), pero
      // cubre situaciones donde el atacante gana Protección recién después de bloquearse.
      if (getProtectionMatch(attacker, blocker.card.colors || [])) {
        return;
      }

      // Se aplica POR bloqueador (no como un total acumulado) para que un bloqueo múltiple
      // con bloqueadores mezclados (algunos con Infectar, otros sin) redirija cada parte
      // por separado — cada uno decide su propio destino (contador -1/-1 o daño normal).
      const blockerDamageDealt = dealCombatDamageToCreature(blocker, attacker, bPower);

      if (blockerHasLifelink && blockerDamageDealt > 0) {
        if (isLocalAttacking) {
          gainLifeFromCombat(false,blockerDamageDealt,blocker);
          logMsg(gameText('combat.lifelink.defenderRival', { rival: getRivalName(), amount: blockerDamageDealt, card: blocker.card.name }));
        } else {
          gainLifeFromCombat(true,blockerDamageDealt,blocker);
          logMsg(gameText('combat.lifelink.defenderLocal', { amount: blockerDamageDealt, card: blocker.card.name }));
        }
      }
      if (blockerHasDeathtouch && blockerDamageDealt > 0) {
        attacker.tookDeathtouch = true;
      }
    });

    if (!attackerDealsThisStep) continue;

    // combatDamageTrigger ("cuando esta criatura le pega al jugador"): se acumula acá y se
    // dispara una sola vez al final, sea cual sea de los 4 caminos por los que el ataque
    // termine llegando al jugador (sin bloqueo, arrollar con todo muerto, arrollar
    // manual, o arrollar automático) — evitar repetir el disparo en cada rama por separado.
    let damageToPlayerThisStep = 0;

    const wasBlocked = !!attacker.wasBlockedThisCombat || blockers.length > 0;

    if (!wasBlocked) {
      if (attacker.attackTarget) {
        // Redirigido a un Planeswalker: el daño le resta Lealtad directo, nunca golpea al
        // jugador, y NO cuenta como "daño de combate al jugador" (no dispara
        // combatDamageTrigger — esa es específicamente sobre pegarle a un jugador).
        const damageDealt = dealCombatDamageToPlaneswalker(attacker, attacker.attackTarget, attackerPower);
        if (damageDealt > 0) logMsg(gameText('combat.attackPlaneswalker', { card: attacker.card.name, target: attacker.attackTarget.card.name, amount: damageDealt, loyalty: attacker.attackTarget.loyalty }));
        if (attackerHasLifelink && damageDealt > 0) {
          gainLifeFromCombat(isLocalAttacking,damageDealt,attacker);
          logMsg(gameText('combat.lifelink.attackLocal', { card: attacker.card.name, amount: damageDealt }));
        }
        continue;
      }
      const damageDealt = dealCombatDamageToPlayer(attacker, !isLocalAttacking, attackerPower);
      if (attackerHasLifelink && damageDealt > 0) {
        gainLifeFromCombat(isLocalAttacking,damageDealt,attacker);
        if (isLocalAttacking) logMsg(gameText('combat.lifelink.attackLocal', { card: attacker.card.name, amount: damageDealt }));
        else logMsg(gameText('combat.lifelink.attackRival', { card: attacker.card.name, amount: damageDealt, rival: getRivalName() }));
      }
      if (damageDealt > 0) logMsg(gameText('combat.hit', { card: attacker.card.name, amount: damageDealt }));
      damageToPlayerThisStep += damageDealt;
      if (damageToPlayerThisStep > 0) {
        triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking, { amount:damageToPlayerThisStep, targetPlayerIsLocal:!isLocalAttacking });
      }
      continue;
    }

    if (aliveBlockers.length === 0) {
      if (attackerHasTrample) {
        if (attacker.attackTarget) {
          const damageDealt = dealCombatDamageToPlaneswalker(attacker, attacker.attackTarget, attackerPower);
          if (damageDealt > 0) logMsg(gameText('combat.trample.allPlaneswalker', { card: attacker.card.name, amount: damageDealt, target: attacker.attackTarget.card.name }));
          if (attackerHasLifelink && damageDealt > 0) gainLifeFromCombat(isLocalAttacking,damageDealt,attacker);
          continue;
        }
        const damageDealt = dealCombatDamageToPlayer(attacker, !isLocalAttacking, attackerPower);
        if (attackerHasLifelink && damageDealt > 0) gainLifeFromCombat(isLocalAttacking,damageDealt,attacker);
        if (damageDealt > 0) logMsg(gameText('combat.trample.allPlayer', { card: attacker.card.name, amount: damageDealt }));
        damageToPlayerThisStep += damageDealt;
      } else {
        logMsg(gameText('combat.blockedNoTrample', { card: attacker.card.name }));
      }
      if (damageToPlayerThisStep > 0) {
        triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking, { amount:damageToPlayerThisStep, targetPlayerIsLocal:!isLocalAttacking });
      }
      continue;
    }

    let useManual = false;
    let manualDistribution = [];
    let manualPlayerDamage = 0;

    if (isLocalAttacking && (aliveBlockers.length > 1 || attackerHasTrample)) {
      const result = await new Promise((resolve) => {
        showDamageAssignmentModal(
          attacker,
          aliveBlockers,
          attackerPower,
          () => resolve({ type: 'auto' }),
          (distribucion, playerDmg) => resolve({ type: 'manual', distribucion, playerDmg })
        );
      });

      if (result.type === 'manual') {
        useManual = true;
        manualDistribution = result.distribucion;
        manualPlayerDamage = result.playerDmg;
      }
    }

    let remainingAttackerPower = attackerPower;
    let attackerLifelinkHeal = 0;

    aliveBlockers.forEach((blocker, bIdx) => {
      const bToughness = getEffectiveToughness(blocker);

      let damageToDeal = 0;

      if (useManual) {
        damageToDeal = manualDistribution[bIdx];
      } else {
        const currentDamage = blocker.damageTaken || 0;
        const remainingToughness = Math.max(0, bToughness - currentDamage);
        let damageToKill = attackerHasDeathtouch ? 1 : remainingToughness;

        damageToDeal = Math.min(remainingAttackerPower, damageToKill);

        if (bIdx === aliveBlockers.length - 1 && remainingAttackerPower > 0 && !attackerHasTrample) {
          damageToDeal = remainingAttackerPower;
        }
        remainingAttackerPower -= damageToDeal;
      }

      if (damageToDeal > 0) {
        const blockerProtected = getProtectionMatch(blocker, attacker.card.colors || []);
        if (blockerProtected) {
          // Protección de [color]: SÍ podía elegir bloquear (eso no se lo prohíbe), pero
          // el daño se previene entero al momento de aplicarse — mismo criterio que en
          // MTG real, la asignación ya ocurrió (no le "regala" ese poder a otro
          // bloqueador ni al jugador), simplemente ese daño puntual nunca llega a pasar.
          logMsg(gameText('combat.protection.prevented', { blocker: blocker.card.name, color: COLOR_LABELS[blockerProtected] || blockerProtected, attacker: attacker.card.name }));
        } else {
          const actualDamage = dealCombatDamageToCreature(attacker, blocker, damageToDeal);
          attackerLifelinkHeal += actualDamage;
          if (attackerHasDeathtouch && actualDamage > 0) blocker.tookDeathtouch = true;
        }
      }
    });

    if (useManual) {
      if (manualPlayerDamage > 0) {
        if (attacker.attackTarget) {
          // Arrollar redirigido a un Planeswalker: el sobrante también le come Lealtad a
          // ÉL, no a la cara del jugador — antes este camino (asignación manual) no
          // chequeaba attackTarget para nada y siempre le pegaba al jugador.
          const actualDamage = dealCombatDamageToPlaneswalker(attacker, attacker.attackTarget, manualPlayerDamage);
          if (actualDamage > 0) logMsg(gameText('combat.trample.manualPw', { card: attacker.card.name, amount: actualDamage, target: attacker.attackTarget.card.name, loyalty: attacker.attackTarget.loyalty }));
          attackerLifelinkHeal += actualDamage;
        } else {
          const actualDamage = dealCombatDamageToPlayer(attacker, !isLocalAttacking, manualPlayerDamage);
          attackerLifelinkHeal += actualDamage;
          if (actualDamage > 0) logMsg(gameText('combat.trample.manualPlayer', { card: attacker.card.name, amount: actualDamage }));
          damageToPlayerThisStep += actualDamage;
        }
      }
    } else if (attackerHasTrample && remainingAttackerPower > 0) {
      if (attacker.attackTarget) {
        // Mismo caso, para el reparto automático (sin asignación manual).
        const actualDamage = dealCombatDamageToPlaneswalker(attacker, attacker.attackTarget, remainingAttackerPower);
        if (actualDamage > 0) logMsg(gameText('combat.trample.autoPw', { card: attacker.card.name, amount: actualDamage, target: attacker.attackTarget.card.name, loyalty: attacker.attackTarget.loyalty }));
        attackerLifelinkHeal += actualDamage;
      } else if (isLocalAttacking) {
        const actualDamage = dealCombatDamageToPlayer(attacker, false, remainingAttackerPower);
        if (actualDamage > 0) logMsg(gameText('combat.trample.autoRival', { card: attacker.card.name, amount: actualDamage, rival: getRivalName() }));
        attackerLifelinkHeal += actualDamage;
        damageToPlayerThisStep += actualDamage;
      } else {
        const actualDamage = dealCombatDamageToPlayer(attacker, true, remainingAttackerPower);
        if (actualDamage > 0) logMsg(gameText('combat.trample.autoLocal', { card: attacker.card.name, rival: getRivalName(), amount: actualDamage }));
        attackerLifelinkHeal += actualDamage;
        damageToPlayerThisStep += actualDamage;
      }
    }

    if (damageToPlayerThisStep > 0) {
      triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking, { amount:damageToPlayerThisStep, targetPlayerIsLocal:!isLocalAttacking });
    }

    if (attackerHasLifelink && attackerLifelinkHeal > 0) {
      if (isLocalAttacking) {
        gainLifeFromCombat(true,attackerLifelinkHeal,attacker);
        logMsg(gameText('combat.lifelink.attackHealLocal', { amount: attackerLifelinkHeal, card: attacker.card.name }));
      } else {
        gainLifeFromCombat(false,attackerLifelinkHeal,attacker);
        logMsg(gameText('combat.lifelink.attackHealRival', { rival: getRivalName(), amount: attackerLifelinkHeal, card: attacker.card.name }));
      }
    }

    const blockNames = aliveBlockers.map(b => b.card.name).join(" y ");
    logMsg(gameText('combat.clash', { attacker: attacker.card.name, blockers: blockNames }));
  }
}

export function checkAllDeaths() {
  void runStateBasedActions({ reason:'legacy_check_all_deaths' });
  return [];
}

export function checkDeaths(combatArray, graveyardArray, ownerName) {
  void runStateBasedActions({ reason:'legacy_check_deaths' });
  return [];
}
