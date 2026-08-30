import { hasKeyword, canBlock, predictDuel, getProtectionMatch } from './keywords.js';
import { recordTelemetryEvent } from './telemetry.js';
import { isCreaturePermanent, isArtifactPermanent, isLandPermanent, landMatchesFilter } from './permanentTypes.js';
import { getProliferateCandidates } from './utils.js';
import { getEffectiveLandManaAbility, getEffectiveLandActivatedAbilities, landMatchesEffectiveFilter } from './landCharacteristics.js';
import { cardHasSubtype, cardsShareCreatureType, resolveSubtypeReference } from './typalEngine.js';
import {
  state,
  logMsg,
  render,
  parseManaCost,
  getLandColor,
  sleep,
  getEffectivePower,
  getEffectiveToughness,
  performSacrifice,
  resolveEffectDirect,
  getKeywordsGrantedByPendingSpell,
  payAdditionalCost,
  getEffectiveKeywords,
  checkPlaneswalkerDeaths,
  putLoyaltyAbilityOnStack,
  detachEquipmentFrom,
  sendAurasToGraveyard,
  cleanupIfVehicle,
  triggerCreatureDies,
  triggerAnyCreatureDeath,
  triggerLandEtb,
  hasLandPlayFromGraveyardPermission,
  playLandFromGraveyardByIndex,
  canPlayCardFromExile,
  getExilePlayPermissionForCard,
  triggerSpellCast,
  chooseGraveyardCards,
  cardMatchesGraveyardFilter,
  chooseResolvedEffectTarget,
  getResolvedEffectTargetCandidates,
  waitForDiscardEffects,
  canPayCastCompositeNonManaCosts,
  payCastCompositeNonManaCosts,
  getCastingManaCostString,
  getFinalCastingManaCost,
  getCastCompositeCostBundle,
  passPriority, // Importado del nuevo turnManager / main
  beginActivePlayerPriorityWindow,
  landEntersTappedForBattlefield,
  handleLandTappedForManaEvent,
  captureLandTappedForManaEvent,
  flushDeferredLandManaTriggers,
  payBotActivatedDiscardCost,
  dispatchGameEvent
} from './main.js';

import { moveBattlefieldCardToZone, moveCounteredStackItemToDestination, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming, normalizeCompositeCost } from './utils.js';

import { assignBotBlockers, queueDeclaredAttackTriggers, queueDeclaredBlockTriggers, markDeclaredBlocks, checkDeaths } from './combatRules.js';
import { addToStack, spellStack, isStackItemLegalCounterTarget, isStackItemLegalCopyTarget, resolveGameEffect, canResolveGameEffectWithoutTarget, canResolveGameEffectWithTarget } from './stackManager.js';
import { gameText } from './gameTexts.js';
import { MANA_TYPES, cloneManaPool, addMana, manaPoolTotal, manaCostTotal, spendAvailableTowardCost } from './manaPool.js';
import { normalizeManaAbility, canActivateManaSourcePermanent } from './manaSources.js';
import { cardOwnerIsLocal } from './zoneOwnership.js';
import { getSpellPaymentMethods, getConvokeCandidates, applyConvokeToCost, applyDelveToCost, applyPhyrexianLifeToCost, parsedManaTotal } from './costEngine.js';
import { normalizeLibraryEffect, libraryCardMatchesFilter } from './libraryEngine.js';
import { permissionBaseManaOverride, consumeExilePlayPermission, clearExilePlayStateOnLeave, EXILE_PLAY_ENGINE_VERSION } from './exilePlayEngine.js';
import { SUSPEND_ENGINE_VERSION, clearSuspendState } from './suspendEngine.js';
import { canTransformPermanent } from './transformEngine.js';
import { botHasCapability, normalizeBotDifficulty } from './botDifficulty.js';
import { chooseHardAttackPlan, COMBAT_BOT_2_VERSION } from './combatBot2.js';
import { isCreatureReservedByBotStack, isStackObjectReservedByBotCounter } from './botTargetReservation.js';
import { getCounterCount } from './counterEngine.js';
import { previewReplacementEvent } from './replacementEngine.js';


const botThinkDelay = (ms) => globalThis.__ARGENTINIA_HEADLESS_ENGINE__ === true ? Promise.resolve() : sleep(ms);

function botEffectiveManaAbility(item, isLocal = false) {
  if (!item?.card) return null;
  const printed = normalizeManaAbility(item.card);
  return isLandPermanent(item) ? getEffectiveLandManaAbility(state, item, isLocal, printed) : printed;
}
function botManaOptions(item, isLocal = false) { return botEffectiveManaAbility(item, isLocal)?.options || []; }
function botManaAmount(item, isLocal = false) { return botEffectiveManaAbility(item, isLocal)?.amount || 0; }
function botManaRequiresTap(item, isLocal = false) { return !!botEffectiveManaAbility(item, isLocal)?.requiresTap; }
function botManaSacrifices(item, isLocal = false) { return !!botEffectiveManaAbility(item, isLocal)?.sacrificeSelf; }
function botCanActivateMana(item, isLocal = false) {
  const ability = botEffectiveManaAbility(item, isLocal);
  return !!ability && canActivateManaSourcePermanent(item, { hasHaste:hasKeyword(item, 'haste'), ability });
}

function moveBotCounteredSpell(stackItem, cause='ward') {
  if(!stackItem) return 'none';
  const destination=moveCounteredStackItemToDestination(stackItem,state);
  dispatchGameEvent({type:'spell_countered',controllerIsLocal:false,actorIsLocal:true,card:stackItem.card,item:stackItem,zoneFrom:'stack',zoneTo:destination,cause});
  if(destination==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:false,actorIsLocal:true,ownerIsLocal:cardOwnerIsLocal(stackItem.card,false,state.currentMatch?.myRole||null),card:stackItem.card,item:stackItem,zoneFrom:'stack',zoneTo:'exile',cause:stackItem.castFrom==='flashback'?'countered_flashback':'countered_replacement'});
  return destination;
}

// Punto 14: affordability de una ruta de casteo completa. La vía alternativa reemplaza
// sólo el costo base; Kicker y additionalCost siguen sumándose. El piso de 5 de vida es
// estrategia del Tano, NO una regla del motor.
function botPaymentMethodPlan(card, cost, options = {}) {
  const bundle = getCastCompositeCostBundle(card, !!options.useAlternative);
  const excludeItems = bundle.sacrifices?.length ? [...state.rivalCombat] : (options.excludeItems || []);
  const excludeCards = (bundle.graveyardExiles?.length || options.castFrom === 'escape') ? [...state.rivalGraveyard] : (options.excludeCards || []);
  const methods=getSpellPaymentMethods(card);
  let remaining={...cost,hybrid:cost?.hybrid?.map(x=>[...x]),phyrexian:cost?.phyrexian?[...cost.phyrexian]:undefined};
  const plan={convoke:[],convokePayments:[],delve:[],phyrexianLife:[],phyrexianLifeAmount:0};
  const affordable=()=>canRivalAfford({manaCost:null},{parsedCost:remaining,excludeItems:plan.convoke});

  // Estrategia Tano: si puede pagar con maná, conserva criaturas/cementerio. Sólo usa tantos
  // recursos alternativos como sean necesarios para volver pagable el coste final.
  if(!affordable()&&methods.some(m=>m.type==='convoke')){
    const value=item=>Number(item.card?.cmc||0)+Number(item.card?.power||0)*.35+Number(item.card?.toughness||0)*.25;
    const candidates=getConvokeCandidates(state,false,excludeItems).sort((a,b)=>value(a)-value(b));
    for(const item of candidates){
      if(affordable()) break;
      const before=parsedManaTotal(remaining);
      const applied=applyConvokeToCost(remaining,[item]);
      if(parsedManaTotal(applied.cost)>=before) continue;
      remaining=applied.cost; plan.convoke.push(...applied.usedItems); plan.convokePayments.push(...applied.payments);
    }
  }
  if(!affordable()&&methods.some(m=>m.type==='delve')&&remaining.generic>0){
    const excluded=new Set(excludeCards);
    const candidates=state.rivalGraveyard.filter(c=>c&&!excluded.has(c)).sort((a,b)=>Number(a.cmc||0)-Number(b.cmc||0));
    for(const graveCard of candidates){
      if(affordable()||remaining.generic<=0) break;
      const applied=applyDelveToCost(remaining,[graveCard]);
      if(!applied.usedCards.length) continue;
      remaining=applied.cost; plan.delve.push(...applied.usedCards);
    }
  }
  const floor=Math.max(0,Number(options.lifeFloor ?? 5)||0);
  while(Array.isArray(remaining.phyrexian)&&remaining.phyrexian.length && !affordable() &&
        state.rivalHP-(plan.phyrexianLifeAmount+2)>=floor){
    const applied=applyPhyrexianLifeToCost(remaining,[0]);
    remaining=applied.cost; plan.phyrexianLife.push(...applied.paidSymbols); plan.phyrexianLifeAmount+=applied.life;
  }
  return {cost:remaining,plan};
}

function canBotPayCastRoute(card, useAlternative = false, options = {}) {
  if (useAlternative && !card?.alternativeCost) return false;
  const final = getFinalCastingManaCost(card, {
    useAlternative,
    kicked:!!options.kicked,
    baseOverride:options.baseOverride ?? null,
    xValue:options.xValue ?? 0,
    isLocal:false
  });
  const planned = botPaymentMethodPlan(card,final.cost,{...options,useAlternative});
  if (!canRivalAfford({ manaCost:null }, { parsedCost:planned.cost })) return false;
  return canPayCastCompositeNonManaCosts(card, false, useAlternative, {
    excludeCard: options.excludeCard || null,
    lifeFloor: (options.lifeFloor ?? 5) + (planned.plan.phyrexianLifeAmount || 0)
  });
}

function chooseBotCastRoute(card, options = {}) {
  if (canBotPayCastRoute(card, false, options)) return false;
  if (canBotPayCastRoute(card, true, options)) return true;
  return null;
}

function commitBotPaymentMethodPlan(card, plan) {
  if (!plan) return true;
  const phyrexianLife=Math.max(0,Number(plan.phyrexianLifeAmount)||0);
  if (phyrexianLife>state.rivalHP) return false;
  if ((plan.convoke || []).some(item=>!state.rivalCombat.includes(item) || item.tapped || !isCreaturePermanent(item))) return false;
  if ((plan.delve || []).some(c=>!state.rivalGraveyard.includes(c))) return false;
  if(phyrexianLife>0){
    state.rivalHP-=phyrexianLife;
    dispatchGameEvent({type:'life_lost',controllerIsLocal:false,actorIsLocal:false,targetPlayerIsLocal:false,amount:phyrexianLife,cause:'phyrexian_cost'},{forceDeferNormalTriggers:true});
  }
  for (const item of plan.convoke || []) {
    item.tapped=true;
    dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(item.card,false,state.currentMatch?.myRole||null),card:item.card,item,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'convoke_cost'},{forceDeferNormalTriggers:true});
  }
  if ((plan.delve || []).length) {
    for (const c of plan.delve) { const i=state.rivalGraveyard.indexOf(c); if(i>=0) state.rivalGraveyard.splice(i,1); }
    state.rivalExile.push(...plan.delve);
    plan.delve.forEach(c=>dispatchGameEvent({type:'card_exiled',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:false,card:c,zoneFrom:'graveyard',zoneTo:'exile',cause:'delve_cost'},{forceDeferNormalTriggers:true}));
  }
  return true;
}

async function payBotCastRoute(card, useAlternative = false, options = {}) {
  const final = getFinalCastingManaCost(card, {
    useAlternative,
    kicked:!!options.kicked,
    baseOverride:options.baseOverride ?? null,
    xValue:options.xValue ?? 0,
    isLocal:false
  });
  const planned = botPaymentMethodPlan(card,final.cost,{...options,useAlternative});
  if (!canRivalAfford({manaCost:null},{parsedCost:planned.cost})) throw new Error(`Tano no puede pagar el costo final de ${card.name}`);
  if (!commitBotPaymentMethodPlan(card,planned.plan)) throw new Error(`Tano perdió recursos preparados de ${card.name}`);
  if (parsedManaTotal(planned.cost)>0) tapRivalLandsFor({ manaCost:null }, { parsedCost:planned.cost });
  await payCastCompositeNonManaCosts(card, false, useAlternative);
  return { final, planned };
}

// Mismo criterio en los 10 lugares donde el Tano elige objetivo para daño/remoción: nunca
// algo Intocable, y nunca algo protegido del color de LA CARTA que está usando (Protección
// de [color] hace que ese hechizo no le sirva de nada, así que ni tiene sentido intentarlo).
function isValidBotTarget(creatureItem, sourceColors) {
  if (hasKeyword(creatureItem, 'hexproof')) return false;
  if (getProtectionMatch(creatureItem, sourceColors || [])) return false;
  return true;
}

// ETAPA 2 (Grupo C, Pelear del Tano): antes, pelear SOLO se consideraba si era un cambio
// 100% gratis (mata y sobrevive) — cualquier otra situación, el Tano ni la evaluaba, aunque
// fuera un cambio parejo obviamente bueno (matar algo mucho más grande a cambio de perder
// algo chico). Un jugador real SÍ consideraría ese trade. Devuelve 'clean' (gratis), 'trade'
// (cambio que vale la pena) o null (ni siquiera vale pelear).
function previewFightDamage(sourceItem, targetItem, sourceIsLocal, targetIsLocal) {
  const sourcePower=Math.max(0,getEffectivePower(sourceItem)||0);
  const protection=getProtectionMatch(targetItem, sourceItem?.card?.colors || []);
  if (protection || sourcePower<=0) return 0;
  const preview=previewReplacementEvent(state,{
    type:'damage', amount:sourcePower, affectedIsLocal:!!targetIsLocal, targetIsLocal:!!targetIsLocal,
    card:targetItem?.card || null, targetCard:targetItem?.card || null, item:targetItem, targetItem,
    sourceCard:sourceItem?.card || null, sourceIsLocal:!!sourceIsLocal, combat:false, cause:'fight_preview'
  });
  return Math.max(0,Number(preview?.event?.amount)||0);
}

function fightCreatureDies(item, incomingDamage, sourceHasDeathtouch) {
  if (!item) return false;
  if (hasKeyword(item,'indestructible')) return false;
  const dealt=Math.max(0,Number(incomingDamage)||0);
  const totalMarked=Math.max(0,Number(item.damageTaken)||0)+dealt;
  if (sourceHasDeathtouch && dealt>0) return true;
  return totalMarked >= Math.max(1,getEffectiveToughness(item)||1);
}

// 23.19.4.6 — mismo modelo de daño/replacement que Fight real, pero en preview puro.
// Esto evita que el Tano "vea" un 3/3 vs 4/3 como trade si el 4/3 tiene Shield, prevención,
// Protección o Indestructible. El preview jamás consume el recurso real.
function predictFightOutcome(mine, theirs) {
  const toTheirs=previewFightDamage(mine,theirs,false,true);
  const toMine=previewFightDamage(theirs,mine,true,false);
  const theirsDies=fightCreatureDies(theirs,toTheirs,hasKeyword(mine,'deathtouch'));
  const mineDies=fightCreatureDies(mine,toMine,hasKeyword(theirs,'deathtouch'));
  return {
    toTheirs,toMine,theirsDies,mineDies,
    shieldStopsTheirs:toTheirs===0 && getCounterCount(theirs,'shield')>0 && getEffectivePower(mine)>0,
    shieldStopsMine:toMine===0 && getCounterCount(mine,'shield')>0 && getEffectivePower(theirs)>0
  };
}

function evaluateFight(mine, theirs) {
  const outcome=predictFightOutcome(mine,theirs);
  recordTelemetryEvent('bot_fight_evaluation',{
    source:mine?.card?.name || null,target:theirs?.card?.name || null,
    sourceDamage:outcome.toTheirs,targetDamage:outcome.toMine,
    sourceDies:outcome.mineDies,targetDies:outcome.theirsDies,
    targetShieldPrevented:outcome.shieldStopsTheirs,sourceShieldPrevented:outcome.shieldStopsMine
  });

  if (!outcome.theirsDies) return null; // si la pelea no retira el objetivo, no la propone
  if (!outcome.mineDies) return 'clean';

  // Si ambos mueren, sólo acepta un trade favorable y únicamente en dificultades que ya
  // habilitan fightTrades. La valoración usa stats efectivos, pero la supervivencia viene
  // del Replacement Engine real (preview), no de una aproximación aritmética.
  if (!botHasCapability(state.botDifficulty, 'fightTrades')) return null;
  const myValue = getEffectivePower(mine) + getEffectiveToughness(mine);
  const theirValue = getEffectivePower(theirs) + getEffectiveToughness(theirs);
  return theirValue > myValue ? 'trade' : null;
}

// Busca, entre TODOS los "theirs" válidos, cuál conviene más pelear contra "mine" —
// prefiere siempre un 'clean' por sobre un 'trade', y dentro de cada categoría prefiere
// al rival más grande (más valor removido). Devuelve { theirs, tier } o null.
function bestFightTargetFor(mine, candidates) {
  let best = null;
  candidates.forEach(theirs => {
    const tier = evaluateFight(mine, theirs);
    if (!tier) return;
    const theirValue = getEffectivePower(theirs) + getEffectiveToughness(theirs);
    const isBetter = !best
      || (tier === 'clean' && best.tier !== 'clean')
      || (tier === best.tier && theirValue > (getEffectivePower(best.theirs) + getEffectiveToughness(best.theirs)));
    if (isBetter) best = { theirs, tier };
  });
  return best;
}

// A quién ataca cada criatura del Tano: si tenés Planeswalkers en el campo, prioriza
// rematar al que tenga MENOS Lealtad, pero solo si el golpe alcanza para matarlo de una
// (no desperdicia ataques en un Planeswalker que va a sobrevivir igual) — si no hay un
// remate limpio disponible, ataca a la cara, que sigue siendo el objetivo principal.
function chooseBotAttackTarget(attackerItem, { forceFace=false } = {}) {
  if (forceFace) return null;
  if (state.localPlaneswalkers.length === 0) return null;
  const power = getEffectivePower(attackerItem);
  const weakest = [...state.localPlaneswalkers].sort((a, b) => a.loyalty - b.loyalty)[0];
  if (weakest && power >= weakest.loyalty) return weakest;
  return null;
}

// 23.9.2 — el Tano usa el MISMO carril de Stack que el humano para Loyalty. Conserva su
// criterio de elección, pero la habilidad ya no resuelve "de costado": fija target, paga
// Lealtad, entra como abilityKind:"loyalty" y corta su turno para abrir prioridad.
async function tryActivateBotPlaneswalkers() {
  if (state.phase !== 'main1' && state.phase !== 'main2') return false;
  if (state.activePlayer !== 'rival' || state.priorityPlayer !== 'rival' || spellStack.length > 0) return false;

  for (const pwItem of state.rivalPlaneswalkers) {
    if (pwItem.abilityUsedThisTurn) continue;
    const abilities = pwItem.card.loyaltyAbilities || [];
    if (abilities.length === 0) continue;

    const canAfford = (a) => !(a.cost < 0 && pwItem.loyalty < Math.abs(a.cost));
    const hasValidTarget = (a) => {
      if (!a.effect) return false;
      const effectType = a.effect.type;
      if (['attach_equipment', 'fight', 'crew_vehicle'].includes(effectType)) return false;
      if (!a.requiresTarget) return canResolveGameEffectWithoutTarget(effectType);
      if (!canResolveGameEffectWithTarget(effectType)) return false;
      const sourceCard = { ...pwItem.card, name: `${pwItem.card.name} — ${a.name}` };
      return getResolvedEffectTargetCandidates({
        effect: a.effect,
        sourceCard,
        controllerIsLocal: false,
        chooserIsLocal: false,
        cardName: a.name
      }).length > 0;
    };
    const affordable = abilities.map((a, idx) => ({ a, idx })).filter(({ a }) => a.effect && canAfford(a) && hasValidTarget(a));
    if (affordable.length === 0) continue;

    const sorted = [...affordable].sort((x, y) => x.a.cost - y.a.cost);
    let chosen = sorted[0];
    if (pwItem.loyalty + chosen.a.cost <= 0 && affordable.some(({ a }) => a.cost > 0)) {
      chosen = affordable.find(({ a }) => a.cost > 0);
    }

    const ability = chosen.a;
    const sourceCard = { ...pwItem.card, name: `${pwItem.card.name} — ${ability.name}` };
    let targetObj = null;
    if (ability.requiresTarget) {
      // Igual que el humano: target primero, costo después.
      targetObj = await chooseResolvedEffectTarget({
        effect: ability.effect,
        sourceCard,
        sourceItem: pwItem,
        controllerIsLocal: false,
        chooserIsLocal: false,
        cardName: `${pwItem.card.name} — ${ability.name}`
      });
      if (!targetObj) continue;

      // La elección no debe poder pagar un costo sobre una ventana que cambió mientras el
      // selector estaba activo (defensivo; en Solitario normalmente todo es síncrono).
      if (state.gameOver || state.activePlayer !== 'rival' || state.priorityPlayer !== 'rival' ||
          (state.phase !== 'main1' && state.phase !== 'main2') || spellStack.length > 0 ||
          pwItem.abilityUsedThisTurn || !canAfford(ability)) continue;
    }

    putLoyaltyAbilityOnStack(pwItem, ability, chosen.idx, false, targetObj);
    logMsg(gameText('bot.loyaltyStack', { ability: ability.name, card: pwItem.card.name }));
    return true;
  }
  return false;
}

// Ward: si el objetivo que el Tano eligió tiene esta keyword y te pertenece a vos (o sea,
// es "un rival" desde su perspectiva), tiene que pagar el costo extra o el hechizo se
// pierde. Se llama una sola vez, justo antes de cada addToStack que targetee una criatura
// — así no hace falta meter esto en cada una de las ramas que arman targetObj más arriba.
export function tryPayWardForBotTarget(targetObj) {
  if (!targetObj?.item || !targetObj.isLocal) return true; // Ward sólo contra permanentes del oponente humano
  const wardKw = (getEffectiveKeywords(targetObj.item) || []).find(k => k.startsWith('ward_'));
  if (!wardKw) return true;
  const wardCost = parseInt(wardKw.split('_')[1], 10);

  const sources = getRivalManaSources().filter(item => botCanActivateMana(item, false));
  const available = manaPoolTotal(state.rivalManaPool) + sources.reduce((sum,s) => sum + botManaAmount(s, false), 0);
  if (available < wardCost) {
    logMsg(gameText('bot.ward.cantPay', { target: targetObj.item.card.name, cost: wardCost }));
    return false;
  }
  const remaining = { W:0,U:0,B:0,R:0,G:0,C:0,generic:wardCost };
  spendAvailableTowardCost(state.rivalManaPool, remaining);
  for (const source of sources) {
    if (remaining.generic <= 0) break;
    const opts = botManaOptions(source, false);
    const type = opts.find(t => MANA_TYPES.includes(t));
    if (!type) continue;
    const tappedForMana = botManaRequiresTap(source, false);
    const wasTappedForMana=!!source.tapped;
    if (tappedForMana) {
      source.tapped = true;
      if(!wasTappedForMana) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(source.card,false,state.currentMatch?.myRole||null),card:source.card,item:source,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'mana_ability'}, {forceDeferNormalTriggers:true});
    }
    const landManaEventSnapshot = tappedForMana && isLandPermanent(source)
      ? captureLandTappedForManaEvent(source, false, type) : null;
    if (botManaSacrifices(source, false)) performSacrifice(source, false);
    const producedAmount = botManaAmount(source, false);
    addMana(state.rivalManaPool, type, producedAmount);
    if (landManaEventSnapshot) handleLandTappedForManaEvent(source, false, type, producedAmount, { eventSnapshot:landManaEventSnapshot });
    spendAvailableTowardCost(state.rivalManaPool, remaining);
  }
  logMsg(gameText('bot.ward.paid', { cost: wardCost }));
  return true;
}

// Fuentes de maná del Tano: Tierras, mana rocks/Treasures y criaturas/artefactos-criatura
// con manaAbility. `canActivateManaSourcePermanent` aplica {T}, tapped y mareo cuando corresponde.
// Un solo lugar para juntarlas evita repetir
// este filtro en cada función de abajo.
function getRivalManaSources(excludeItems = []) {
  const excluded = new Set(excludeItems || []);
  return [...state.rivalLands, ...state.rivalSupport, ...state.rivalCombat]
    .filter(item => !!botEffectiveManaAbility(item, false) && !excluded.has(item));
}

// Cuánto maná TOTAL (sumando todo lo que tiene sin girar) le queda disponible al Tano —
// no descuenta nada todavía, es la base para calcular cuánto puede gastar en X.
function getRivalTotalAvailableMana() {
  return manaPoolTotal(state.rivalManaPool) + getRivalManaSources().filter(item => botCanActivateMana(item, false)).reduce((sum, s) => sum + botManaAmount(s, false), 0);
}

// LAND 2: candidatos reales de destrucción de Tierras del oponente humano, incluyendo
// man-lands animadas que estén visualmente en Combat. La heurística prioriza no básicas
// y tierras utility/multicolor para no gastar Stone Rain-style removal en una básica si
// existe un blanco estratégicamente más importante.
function getBotLandDestructionTargets(effect = {}, sourceColors = []) {
  const filter = effect.type === 'destroy_nonbasic_land' ? 'nonbasic' : (effect.landFilter || 'any');
  const seen = new Set();
  const candidates = [...state.localLands, ...state.localCombat].filter(item => {
    if (!item || seen.has(item) || !isLandPermanent(item) || !landMatchesEffectiveFilter(state, item, true, filter)) return false;
    seen.add(item);
    if (hasKeyword(item, 'hexproof')) return false;
    if (getProtectionMatch(item, sourceColors || [])) return false;
    return true;
  });
  const score = item => {
    const c = item.card || {};
    return (landMatchesFilter(item, 'nonbasic') ? 100 : 0)
      + (c.activatedAbility || c.activatedAbilities ? 20 : 0)
      + (Array.isArray(c.producesOptions) ? c.producesOptions.length * 3 : 0)
      + Math.max(1, Number(c.manaAmount) || 1);
  };
  return candidates.sort((a,b) => score(b) - score(a));
}

function countBotMassLandVictims(effect = {}, landIsLocal) {
  const controller = effect.controller || 'all';
  const sourceIsLocal = false; // esta heurística corre para el Tano
  const controllerAllows = controller === 'all'
    || (controller === 'self' && landIsLocal === sourceIsLocal)
    || (controller === 'opponent' && landIsLocal !== sourceIsLocal);
  if (!controllerAllows) return 0;
  const filter = effect.landFilter || 'any';
  const zones = landIsLocal ? [state.localLands, state.localCombat] : [state.rivalLands, state.rivalCombat];
  const seen = new Set();
  return zones.flat().filter(item => {
    if (!item || seen.has(item) || !isLandPermanent(item) || !landMatchesEffectiveFilter(state, item, true, filter)) return false;
    seen.add(item);
    return !hasKeyword(item, 'indestructible');
  }).length;
}

// Flashback o Escape desde el cementerio del Tano: busca la primera carta que tenga
// cualquiera de las dos, le alcance el maná (y si es Escape, le alcancen las cartas de
// cementerio para exiliar), y si necesita target de remoción tenga un blanco válido — recién
// ahí se compromete, para no desperdiciar la carta sacándola sin necesidad. A diferencia de
// antes, ahora también contempla CRIATURAS (el uso más común de Escape en MTG real — un
// cuerpo que vuelve una y otra vez), no solo hechizos/instantáneos.
async function tryFlashbackOrEscapeFromBotGraveyard() {
  if (state.phase !== 'main1') return false;

  const getAbility = (c) => {
    if (c.flashback) return { source: 'flashback', ability: c.flashback };
    if (c.escape) return { source: 'escape', ability: c.escape };
    return null;
  };

  const isUsable = (c) => {
    const meta = getAbility(c);
    if (!meta || !canBotPayCastRoute(c, false, { baseOverride: meta.ability.cost, excludeCard: null })) return false;
    if (meta.source === 'escape') {
      const exileCount = meta.ability.exileCount || 0;
      const extraCostExiles = getCastCompositeCostBundle(c, false).graveyardExiles.reduce((sum, spec) => sum + (spec.amount || 0), 0);
      const otherCount = state.rivalGraveyard.filter(g => g !== c).length;
      if (otherCount < exileCount + extraCostExiles) return false;
    }
    if (c.power !== undefined) return true; // criatura: siempre vale la pena recuperarla
    if (c.effect && ['destroy_creature', 'exile_creature', 'bounce'].includes(c.effect.type)) {
      return state.localCombat.some(u => isValidBotTarget(u, c.colors));
    }
    if (c.effect && ['destroy_land', 'destroy_nonbasic_land'].includes(c.effect.type)) {
      return getBotLandDestructionTargets(c.effect, c.colors).length > 0;
    }
    if (c.effect?.type === 'heal') return shouldBotActivateHealing(c.effect, 'main2');
    return true;
  };

  const idx = state.rivalGraveyard.findIndex(isUsable);
  if (idx === -1) return false;

  // 601.2a: la carta deja conceptualmente el cementerio al anunciar el casteo. Todavía
  // no se activó ninguna fuente ni se pagó nada.
  const card = state.rivalGraveyard.splice(idx, 1)[0];
  const { source, ability } = getAbility(card);

  let aiTargetObj = null;
  if (card.effect) {
    if (card.effect.type === 'damage') {
      // Mismo criterio que en el turno principal: si remata un Planeswalker tuyo, lo prioriza.
      const killablePw = state.localPlaneswalkers.find(pw => pw.loyalty <= card.effect.amount);
      aiTargetObj = killablePw
        ? { type: 'planeswalker', isLocal: true, item: killablePw }
        : { type: 'player', isLocal: true };
    } else if (card.effect.type === 'heal' || card.effect.type === 'draw') {
      aiTargetObj = { type: 'player', isLocal: false };
    } else if (['destroy_creature', 'exile_creature', 'bounce'].includes(card.effect.type)) {
      const validTargets = state.localCombat.filter(c => isValidBotTarget(c, card.colors));
      const best = validTargets.reduce((prev, cur) =>
        (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
      );
      aiTargetObj = { type: 'creature', isLocal: true, item: best };
    } else if (['destroy_land', 'destroy_nonbasic_land'].includes(card.effect.type)) {
      const best = getBotLandDestructionTargets(card.effect, card.colors)[0];
      if (best) aiTargetObj = { type: 'land', isLocal: true, item: best };
    }
  }

  // Objetivo fijado: recién ahora fuentes y pago.
  await payBotCastRoute(card, false, { baseOverride: ability.cost });

  // Escape paga su exilio como parte del commit de costos, después de fijar objetivos.
  if (source === 'escape') {
    const exileCount = ability.exileCount || 0;
    const chosen = await chooseGraveyardCards({
      zoneIsLocal: false, chooserIsLocal: false, filter: 'any', amount: exileCount,
      cardName: card.name, actionLabel: 'elegí cartas para pagar Escape', botStrategy: 'last'
    });
    chosen.forEach(c => {
      const gyIdx = state.rivalGraveyard.indexOf(c);
      if (gyIdx !== -1) state.rivalGraveyard.splice(gyIdx, 1);
    });
    state.rivalExile.push(...chosen);
    logMsg(gameText('bot.escape.exile', { count: chosen.length, card: card.name }));
  }

  let stackType = 'spell';
  if (card.power !== undefined) stackType = 'summon';
  else if (card.type.includes('Planeswalker')) stackType = 'planeswalker';
  else if (card.type.includes('Instantáneo')) stackType = 'instant';

  const castStackItem = {
    card,
    isLocal: false,
    targetObj: aiTargetObj,
    type: stackType,
    castFrom: source
  };
  addToStack(castStackItem);
  flushDeferredLandManaTriggers();
  logMsg(gameText('bot.graveCast', { ability: source === 'escape' ? 'Escape' : 'Flashback', card: card.name }));
  await triggerSpellCast(false, card, castStackItem);
  if (!tryPayWardForBotTarget(aiTargetObj)) {
    const stackIndex = spellStack.indexOf(castStackItem);
    if (stackIndex >= 0) moveBotCounteredSpell(spellStack.splice(stackIndex,1)[0],'ward');
  }
  state.priorityPlayer = 'local';
  state.consecutivePasses = 0;
  // 23.17.5.1 — CRÍTICO: esta era la única ruta de casteo del Tano que devolvía la
  // prioridad internamente pero no renderizaba la nueva ventana. El hechizo quedaba en
  // Stack y el DOM seguía mostrando prioridad rival, por lo que Space/click parecían
  // muertos. Exile/Suspend/casteo normal ya hacen este render al entregar prioridad.
  render();
  return true;
}

// Elegir un valor de X: el Tano gasta TODO lo que le sobra después de pagar el resto del
// costo de la carta — más grande, mejor, no hay motivo real para guardarse maná en su
// propia fase principal (a diferencia de un truco reactivo, donde sí conviene guardar).
function chooseBotXValue(card) {
  const baseCost = parseManaCost(card.manaCost); // el {X} de la cadena no suma nada acá
  const baseTotal = baseCost.W + baseCost.U + baseCost.B + baseCost.R + baseCost.G + baseCost.generic;
  const totalAvailable = getRivalTotalAvailableMana();
  return Math.max(0, totalAvailable - baseTotal);
}

// Elegir TODOS los objetivos de un hechizo multi-target, uno por cada entrada de
// card.targets[], con el mismo criterio que el Tano ya usa para esa clase de efecto
// cuando aparece solo en una carta de target único. Si CUALQUIER target no encuentra un
// blanco válido, devuelve null — regla real: no podés castear sin objetivo legal para
// todos los que la carta pide, no hay forma de "completar a medias".
function chooseBotMultiTargets(card) {
  const chosen = [];
  for (const spec of card.targets) {
    const effect = spec.effect;
    let targetObj = null;

    if (effect.type === 'destroy_artifact' || effect.type === 'destroy_enchantment') {
      const filterType = effect.type === 'destroy_artifact' ? 'Artefacto' : 'Encantamiento';
      const supportTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
      const combatTargets = effect.type === 'destroy_artifact'
        ? state.localCombat.filter(c => c.card.type.includes('Artefacto') && isValidBotTarget(c, card.colors))
        : [];
      if (combatTargets.length > 0) {
        const best = combatTargets.reduce((prev, cur) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
        );
        targetObj = { type: 'creature', isLocal: true, item: best };
      } else if (supportTargets.length > 0) {
        targetObj = { type: 'permanent', isLocal: true, item: supportTargets[0] };
      }
    } else if (effect.type === 'destroy_land' || effect.type === 'destroy_nonbasic_land') {
      const best = getBotLandDestructionTargets(effect, card.colors)[0];
      if (best) targetObj = { type: 'land', isLocal: true, item: best };
    } else if (['destroy_creature', 'exile_creature', 'bounce', 'damage'].includes(effect.type)) {
      const validTargets = state.localCombat.filter(c => isValidBotTarget(c, card.colors));
      if (validTargets.length > 0) {
        const best = validTargets.reduce((prev, cur) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
        );
        targetObj = { type: 'creature', isLocal: true, item: best };
      } else if (effect.type === 'damage') {
        targetObj = { type: 'player', isLocal: true }; // sin criatura mejor, va a la cara
      }
    } else if (effect.type === 'pump') {
      if (state.rivalCombat.length > 0) {
        const best = state.rivalCombat.reduce((prev, cur) => getEffectivePower(cur) > getEffectivePower(prev) ? cur : prev);
        targetObj = { type: 'creature', isLocal: false, item: best };
      }
    } else if (effect.type === 'discard' || effect.type === 'private_zone_move') {
      targetObj = { type: 'player', isLocal: true };
    } else if (effect.type === 'draw') {
      targetObj = { type: 'player', isLocal: false };
    } else if (effect.type === 'heal') {
      targetObj = { type: 'player', isLocal: false };
    } else if (effect.type === 'exile_graveyard') {
      // Le sirve si vos tenés algo en el cementerio que valga la pena exiliar; si no,
      // mejor no gastarlo (aunque el hechizo en sí igual podría servir por el otro target).
      if (state.localGraveyard.length > 0) targetObj = { type: 'player', isLocal: true };
    }

    if (!targetObj) return null;
    chosen.push(targetObj);
  }
  return chosen;
}

// Elegir un modo para un hechizo modal: prioridad simple — 1) un modo de remoción si hay
// un buen blanco disponible, 2) si no, uno de ventaja de cartas (robar), 3) si no, el
// primero que no pida target (para no arriesgarse a que no haya nada que targetear), y
// si ninguno cumple, directamente el primero de la lista.
function chooseBotMode(card) {
  const modes = card.modes;

  let idx = modes.findIndex(m => {
    if (!m.effect || !['damage', 'destroy_creature', 'exile_creature', 'bounce'].includes(m.effect.type)) return false;
    if (!m.requiresTarget) return true;
    return state.localCombat.some(c => isValidBotTarget(c, card.colors));
  });
  if (idx !== -1) return idx;

  idx = modes.findIndex(m => m.effect && m.effect.type === 'draw');
  if (idx !== -1) return idx;

  idx = modes.findIndex(m => !m.requiresTarget);
  return idx !== -1 ? idx : 0;
}

export function canRivalAfford(card, options = null) {
  const excludeItems = options?.excludeItems || [];
  if (!card.manaCost && !options?.parsedCost) return true;
  const cost = options?.parsedCost ? { ...options.parsedCost } : parseManaCost(card.manaCost);
  const available = cloneManaPool(state.rivalManaPool);
  const flexible = [];

  getRivalManaSources(excludeItems).forEach(item => {
    if (!botCanActivateMana(item, false)) return;
    const amount = botManaAmount(item, false);
    const opts = botManaOptions(item, false);
    const legal = [...new Set(opts.filter(t => MANA_TYPES.includes(t)))];
    if (legal.length === 1) addMana(available, legal[0], amount);
    else if (legal.length > 1) flexible.push({ options: legal, amount });
  });

  // Pool + fuentes fijas cubren primero lo que puedan.
  const remaining = { ...cost };
  spendAvailableTowardCost(available, remaining);

  // Las fuentes flexibles se asignan primero a símbolos específicos que todavía falten.
  flexible.sort((a,b) => a.options.length - b.options.length).forEach(src => {
    let chosen = MANA_TYPES.find(t => src.options.includes(t) && (remaining[t] || 0) > 0);
    if (!chosen && remaining.generic > 0) chosen = src.options[0];
    if (!chosen) return;
    addMana(available, chosen, src.amount);
    spendAvailableTowardCost(available, remaining);
  });
  return manaCostTotal(remaining) === 0;
}

export function tapRivalLandsFor(card, options = null) {
  const excludeItems = options?.excludeItems || [];
  if (!card.manaCost && !options?.parsedCost) return;
  const remaining = options?.parsedCost ? { ...options.parsedCost } : parseManaCost(card.manaCost);
  if (!state.rivalManaPool) state.rivalManaPool = { W:0,U:0,B:0,R:0,G:0,C:0 };
  spendAvailableTowardCost(state.rivalManaPool, remaining);
  if (manaCostTotal(remaining) === 0) return;

  const sources = getRivalManaSources(excludeItems).filter(item => botCanActivateMana(item, false));
  sources.sort((a,b) => {
    const ao = botManaOptions(a, false).length;
    const bo = botManaOptions(b, false).length;
    return ao - bo;
  });

  for (const source of sources) {
    if (manaCostTotal(remaining) === 0) break;
    const opts = botManaOptions(source, false);
    const legal = [...new Set(opts.filter(t => MANA_TYPES.includes(t)))];
    if (!legal.length) continue;
    let chosen = MANA_TYPES.find(t => legal.includes(t) && (remaining[t] || 0) > 0);
    if (!chosen && remaining.generic > 0) chosen = legal[0];
    if (!chosen) continue;
    const amount = botManaAmount(source, false);
    const tappedForMana = botManaRequiresTap(source, false);
    const wasTappedForMana=!!source.tapped;
    if (tappedForMana) {
      source.tapped = true;
      if(!wasTappedForMana) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(source.card,false,state.currentMatch?.myRole||null),card:source.card,item:source,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'mana_ability'}, {forceDeferNormalTriggers:true});
    }
    const landManaEventSnapshot = tappedForMana && isLandPermanent(source)
      ? captureLandTappedForManaEvent(source, false, chosen) : null;
    if (botManaSacrifices(source, false)) performSacrifice(source, false);
    addMana(state.rivalManaPool, chosen, amount);
    if (landManaEventSnapshot) handleLandTappedForManaEvent(source, false, chosen, amount, { forceDeferNormalTriggers:true, eventSnapshot:landManaEventSnapshot });
    spendAvailableTowardCost(state.rivalManaPool, remaining);
  }
}

function shouldBotActivateHealing(effect, timing = 'legacy') {
  const hp=Math.max(0,Number(state.rivalHP)||0);
  const amount=Math.max(1,Number(effect?.amount)||1);
  // 23.19.4.6 — curarse por encima de 20 es legal, pero gastar un recurso de healing estando
  // sano no es automáticamente correcto. Guardamos Tuppers/activaciones salvo daño relevante.
  // En instantáneo la urgencia es mayor; en Main 2 aceptamos una ventana algo más amplia.
  const urgentFloor=Math.max(8,Math.min(12,amount*3));
  if(timing==='instant' && hp<=urgentFloor) return true;
  return state.phase==='main2' && hp<=16;
}

function isCounterSpell(card) {
  return card.effect && card.effect.type && card.effect.type.startsWith('counter');
}

function isStackCopySpell(card) {
  return ['copy_spell','copy_ability','copy_stack_object'].includes(card?.effect?.type);
}

function botTargetReservationHelpers() {
  return { isCounterSpell, hasKeyword, getCounterCount, getEffectiveToughness };
}

function isReservedReactiveCreatureTarget(item) {
  return isCreatureReservedByBotStack(item, spellStack, botTargetReservationHelpers());
}

function isReservedBotCounterTarget(stackItem) {
  return isStackObjectReservedByBotCounter(stackItem, spellStack, botTargetReservationHelpers());
}

function legalBotCounterTargets(effectType) {
  return spellStack.filter(item =>
    item?.isLocal === true
    && isStackItemLegalCounterTarget(effectType, item)
    && !isReservedBotCounterTarget(item)
  );
}

function legalReactiveRemovalTargets(card) {
  return state.localCombat.filter(item =>
    isValidBotTarget(item, card?.colors)
    && !isReservedReactiveCreatureTarget(item)
  );
}

// NUEVO: El Tano usa un instantáneo de daño como truco de combate cuando VOS declarás
// atacantes — antes de esto, el Tano jamás consideraba instantáneos salvo que hubiera algo
// en la pila para responder, así que nunca defendía proactivamente con una quema.
async function tryBotCombatTrick() {
  if (!botHasCapability(state.botDifficulty, 'combatTricks')) return false; // Fácil sin trucos; Medio conserva el viejo Difícil
  if (!(state.activePlayer === 'local' && state.phase === 'combat_attackers')) return false;

  const attackingUnits = state.localCombat.filter(c => c.isAttacking);
  if (attackingUnits.length === 0) return false;

  const cardIndex = state.rivalHand.findIndex(c =>
    c.type.includes('Instantáneo') && c.effect && c.effect.type === 'damage' && canRivalAfford(c)
  );
  if (cardIndex === -1) return false;

  const card = state.rivalHand[cardIndex];
  const target = attackingUnits.find(c => isValidBotTarget(c, card.colors) && getEffectiveToughness(c) <= card.effect.amount);
  if (!target) return false;

  const targetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(target), item: target };
  // Target fijado: recién ahora se compromete la carta y se activan fuentes.
  state.rivalHand.splice(cardIndex, 1);
  tapRivalLandsFor(card);

  const castStackItem = {
    card,
    isLocal: false,
    targetObj: targetObj,
    type: 'instant'
  };
  addToStack(castStackItem);
  flushDeferredLandManaTriggers();
  await triggerSpellCast(false, card, castStackItem);
  if (!tryPayWardForBotTarget(targetObj)) {
    const idx = spellStack.indexOf(castStackItem);
    if (idx >= 0) moveBotCounteredSpell(spellStack.splice(idx,1)[0],'ward');
  }

  state.priorityPlayer = 'local';
  state.consecutivePasses = 0;

  logMsg(gameText('bot.instantAttack', { card: card.name }));
  render();
  return true;
}

// ETAPA 1 (Grupo C, IA reactiva): mismo espíritu que tryBotCombatTrick de arriba, pero para
// DESPUÉS de que el Tano ya asignó bloqueadores — si alguno de sus bloqueos va a perder a
// la criatura tal como está, y tiene un instantáneo de pump que lo salve, lo usa antes de
// pasar prioridad. Antes de esto, el Tano bloqueaba "bien" (assignSmartBlock ya es
// inteligente) pero nunca consideraba que podía MEJORAR un bloqueo ya hecho con un truco.
async function tryBotPostBlockTrick() {
  if (!botHasCapability(state.botDifficulty, 'combatTricks')) return false; // Fácil sin trucos; Medio conserva el viejo Difícil
  const blockingPairs = state.rivalCombat.filter(c => c.blockingIndex !== null && c.blockingIndex !== undefined);

  for (const blocker of blockingPairs) {
    const attacker = state.localCombat[blocker.blockingIndex];
    if (!attacker || !attacker.isAttacking) continue;

    // Si este bloqueo ya está bien tal cual está (el bloqueador sobrevive), no hay nada que
    // mejorar — nos ahorramos gastar la carta de pump al pedo.
    if (!predictDuel(attacker, blocker).blockerDies) continue;

    const pumpIndex = state.rivalHand.findIndex(c => {
      const hasFlash = c.keywords && c.keywords.includes('flash');
      if (!(c.type.includes('Instantáneo') || hasFlash) || c.effect?.type !== 'pump' || !canRivalAfford(c)) return false;
      // X queda afuera a propósito: elegir X a ciegas en medio de una simulación de combate
      // es un caso raro que no vale la pena resolver acá.
      return typeof c.effect.powerMod === 'number' && typeof c.effect.toughnessMod === 'number';
    });
    if (pumpIndex === -1) continue;

    const pumpCard = state.rivalHand[pumpIndex];
    const trialMod = { powerMod: pumpCard.effect.powerMod || 0, toughnessMod: pumpCard.effect.toughnessMod || 0 };

    // Probamos el pump DIRECTO sobre el objeto real (después lo sacamos si no sirve) para
    // que getEffectivePower/getEffectiveToughness sigan contando bien auras/equipos/otros
    // trucos ya puestos — clonar el objeto rompería esas referencias.
    if (!blocker.tempEffects) blocker.tempEffects = [];
    blocker.tempEffects.push(trialMod);
    const survivesWithPump = !predictDuel(attacker, blocker).blockerDies;
    blocker.tempEffects.pop(); // fue solo una prueba

    if (!survivesWithPump) continue; // ni con el pump se salva, no vale la pena gastarlo

    state.rivalHand.splice(pumpIndex, 1);
    tapRivalLandsFor(pumpCard);
    blocker.tempEffects.push(trialMod); // ahora sí, lo dejamos puesto de verdad

    const castStackItem = {
      card: pumpCard,
      isLocal: false,
      targetObj: { type: 'creature', isLocal: false, item: blocker, index: state.rivalCombat.indexOf(blocker) },
      type: 'instant'
    };
    addToStack(castStackItem);
    flushDeferredLandManaTriggers();
    await triggerSpellCast(false, pumpCard, castStackItem);

    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;
    logMsg(gameText('bot.combatPump', { target: blocker.card.name, card: pumpCard.name }));
    render();
    return true;
  }
  return false;
}

export async function checkRivalCounterOrResponse() {
  // FASE 4, ETAPA 4: durante una partida multiplayer real (state.currentMatch existe), el
  // "rival" es una persona de verdad con su propio cliente — nunca este código decide por
  // ella. Se blinda ACÁ, en la entrada, en vez de en cada uno de los 6 lugares de main.js
  // que llaman a esto: así queda protegido sin importar desde dónde se lo llame, incluso si
  // en el futuro se agrega un séptimo lugar y alguien se olvida de este chequeo ahí.
  if (state.currentMatch) return false;
  if (spellStack.length === 0) return false;
  // Grupo C, Etapa 4: en Fácil, el Tano nunca juega en velocidad instantánea — ni
  // contrarresta, ni se defiende, ni responde a nada. Pasa prioridad y ya (comportamiento
  // de base, sin ningún truco reactivo, viejo o nuevo).
  if (!botHasCapability(state.botDifficulty, 'reactiveStack')) return false;

  await botThinkDelay(600);

  // ETAPA 1 (Grupo C, IA reactiva): si algo en la pila amenaza con destruir/exiliar/matar
  // (de daño letal) a una criatura del Tano, y tiene un instantáneo que le dé Intocable
  // temporal, lo usa ANTES de mirar cualquier otra respuesta — salvar una criatura vale más
  // que cualquier otro truco reactivo. "Bounce" queda afuera a propósito (no es grave
  // perder solo el tempo de que vuelva a la mano, no vale la pena gastar la protección).
  const threatened = spellStack.find(s => {
    if (!s.isLocal || !s.targetObj || s.targetObj.type !== 'creature' || s.targetObj.isLocal) return false;
    const eff = s.card.effect;
    if (!eff) return false;
    if (eff.type === 'destroy_creature' || eff.type === 'exile_creature') return true;
    if (eff.type === 'damage') {
      const target = s.targetObj.item;
      return (getEffectiveToughness(target) - (target.damageTaken || 0)) <= eff.amount;
    }
    return false;
  });

  if (threatened) {
    const protectIndex = state.rivalHand.findIndex(c => {
      const hasFlash = c.keywords && c.keywords.includes('flash');
      return (c.type.includes('Instantáneo') || hasFlash) && c.effect?.type === 'grant_keyword_temp' && c.effect.keyword === 'hexproof' && chooseBotCastRoute(c, { excludeCard: c }) !== null;
    });
    if (protectIndex !== -1) {
      const protectCard = state.rivalHand.splice(protectIndex, 1)[0];
      const savedCreature = threatened.targetObj.item;
      const useAlternative = chooseBotCastRoute(protectCard);
      if (useAlternative === null) { state.rivalHand.splice(protectIndex, 0, protectCard); return false; }
      await payBotCastRoute(protectCard, useAlternative);
      const castStackItem = {
        card: protectCard,
        isLocal: false,
        targetObj: { type: 'creature', isLocal: false, item: savedCreature, index: state.rivalCombat.indexOf(savedCreature) },
        type: 'instant'
      };
      addToStack(castStackItem);
      flushDeferredLandManaTriggers();
      await triggerSpellCast(false, protectCard, castStackItem);
      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(gameText('bot.protect', { target: savedCreature.card.name, card: protectCard.name }));
      render();
      return true;
    }
  }

  const responseIndex = state.rivalHand.findIndex(c => {
    const hasFlash = c.keywords && c.keywords.includes('flash');
    if (!(c.type.includes('Instantáneo') || hasFlash) || chooseBotCastRoute(c, { excludeCard: c }) === null) return false;

    if (isCounterSpell(c)) {
      // Un counter normal solo le sirve al Tano contra HECHIZOS (nunca habilidades) a
      // menos que la carta lo diga explícitamente — misma regla real de MTG.
      return legalBotCounterTargets(c.effect.type).length > 0;
    }
    if (isStackCopySpell(c)) {
      return spellStack.some(s => isStackItemLegalCopyTarget(c.effect.type,s,c.effect));
    }

    // Fuera de counters/copy, solo consideramos jugarla en respuesta si no necesita objetivo,
    // o si es un tipo que sabemos targetear bien acá abajo. Si no, la dejamos afuera del
    // camino reactivo (igual la puede jugar en su propia fase principal, donde SÍ sabe
    // targetear pump/fight/etc.) — mejor no jugarla que jugarla y que fallezca sin efecto.
    if (!c.requiresTarget) return true;
    if (c.effect?.type === 'damage') return true;
    if (c.effect?.type === 'destroy_creature' || c.effect?.type === 'bounce' || c.effect?.type === 'exile_creature' || c.effect?.type === 'exile_and_return') {
      return legalReactiveRemovalTargets(c).length > 0;
    }
    return false;
  });

  if (responseIndex !== -1) {
    const responseCard = state.rivalHand[responseIndex];
    const useAlternative = chooseBotCastRoute(responseCard, { excludeCard: responseCard });
    if (useAlternative === null) return false;

    // CR 601: targetear la Stack/campo ANTES de comprometer carta, fuentes o costos.
    let targetObj = null;
    if (isCounterSpell(responseCard)) {
      const topLocalSpell = legalBotCounterTargets(responseCard.effect.type).at(-1);
      if (topLocalSpell) targetObj = { type:'stack', stackId:topLocalSpell.id };
    } else if (isStackCopySpell(responseCard)) {
      // Copy Engine: el Tano prioriza una copia legal del objeto de mayor MV. No discrimina
      // dueño porque a veces duplicar su propio removal/truco es la mejor respuesta.
      const copyable=spellStack.filter(obj=>isStackItemLegalCopyTarget(responseCard.effect.type,obj,responseCard.effect));
      const chosen=copyable.reduce((best,obj)=>!best || Number(obj.card?.cmc||0)>Number(best.card?.cmc||0) ? obj : best,null);
      if(chosen) targetObj={type:'stack',stackId:chosen.id};
    } else if (responseCard.effect?.type === 'damage') {
      // Preferimos rematar una criatura vulnerable, pero nunca duplicamos daño letal sobre
      // una instancia que ya está cubierta por una respuesta propia pendiente. Si no hay
      // criatura útil, la quema sigue pudiendo ir a la cara.
      const vulnerable = state.localCombat.find(c =>
        isValidBotTarget(c, responseCard.colors)
        && !isReservedReactiveCreatureTarget(c)
        && getEffectiveToughness(c) - (c.damageTaken || 0) <= responseCard.effect.amount
      );
      targetObj = vulnerable
        ? { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable }
        : { type: 'player', isLocal: true };
    } else if (responseCard.effect?.type === 'destroy_creature' || responseCard.effect?.type === 'bounce' || responseCard.effect?.type === 'exile_creature' || responseCard.effect?.type === 'exile_and_return') {
      // La criatura tuya con más poder efectivo (la más peligrosa), EXCLUYENDO permanentes
      // ya cubiertos por removal propio pendiente. La reserva es por instancia física, nunca
      // por card.id/nombre, así dos criaturas iguales distintas siguen siendo objetivos válidos.
      const candidates = legalReactiveRemovalTargets(responseCard);
      if (candidates.length > 0) {
        const chosen = candidates.reduce((prev, cur) => getEffectivePower(prev) > getEffectivePower(cur) ? prev : cur);
        targetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(chosen), item: chosen };
      }
    }

    if (responseCard.requiresTarget && !targetObj) return false;

    state.rivalHand.splice(responseIndex, 1);
    await payBotCastRoute(responseCard, useAlternative);

    const castStackItem = {
      card: responseCard,
      isLocal: false,
      targetObj: targetObj,
      // Un permanente con Flash (artefacto/criatura) tiene que entrar al campo como
      // corresponde, no resolverse como si fuera un hechizo de una sola vez — antes esto
      // estaba fijo en 'instant' sin importar qué era la carta.
      type: responseCard.power !== undefined ? 'summon'
          : (responseCard.type.includes('Artefacto') || responseCard.type.includes('Encantamiento')) ? 'permanent'
          : 'instant'
    };
    addToStack(castStackItem);
    flushDeferredLandManaTriggers();
    await triggerSpellCast(false, responseCard, castStackItem);
    if (!tryPayWardForBotTarget(targetObj)) {
      const idx = spellStack.indexOf(castStackItem);
      if (idx >= 0) moveBotCounteredSpell(spellStack.splice(idx,1)[0],'ward');
    }

    // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;    // -----------------------------------------------
    
    logMsg(gameText('bot.instantResponse', { card: responseCard.name }));
    render();
    return true;
  }
  return false;
}

// --- EVALUACIÓN TÁCTICA DE ATAQUE ---
function shouldRivalAttackWith(attackerItem) {
  const atkPower = getEffectivePower(attackerItem);
  const atkHasMenace = hasKeyword(attackerItem, 'menace');
  const hasVigilance = hasKeyword(attackerItem, 'vigilance');

  const validBlockers = state.localCombat.filter(b => !b.tapped && canBlock(attackerItem, b));

  if (validBlockers.length === 0) return true;
  if (atkHasMenace && validBlockers.length < 2) return true;

  const dueledBlockers = validBlockers.map(b => ({ b, duel: predictDuel(attackerItem, b) }));

  const freeKillAvailable = dueledBlockers.some(({ duel }) => duel.attackerDies && !duel.blockerDies);
  if (freeKillAvailable) return false;

  const getsAGoodTrade = dueledBlockers.some(({ duel }) => duel.blockerDies);
  if (getsAGoodTrade) return true;

  return hasVigilance;
}

// Tripular un Vehículo del Tano: paga el coste girando criaturas y pone la habilidad en
// la Stack. La conversión a criatura ocurre recién al resolver, igual que para el humano.
// La IA evita tripular en upkeep/end step sin motivo: lo intenta en su Main/Beginning of
// Combat para atacar, o durante Declare Attackers rival para preparar un bloqueador.
function tryBotCrewVehicle(vehicleItem, zoneType, ability = getActivatedAbilities(vehicleItem.card).find(ab => ab.crewCost !== undefined)) {
  const usefulWindow =
    (state.activePlayer === 'rival' && ['main1','main2','combat_begin'].includes(state.phase)) ||
    (state.activePlayer === 'local' && state.phase === 'combat_attackers');
  if (!usefulWindow || state.priorityPlayer !== 'rival') return false;

  const required = ability?.crewCost;
  if (required === undefined) return false;
  const candidates = state.rivalCombat
    .filter(c => c !== vehicleItem && !c.tapped)
    .sort((a, b) => {
      if (a.summoningSickness !== b.summoningSickness) return a.summoningSickness ? -1 : 1;
      return getEffectivePower(a) - getEffectivePower(b);
    });

  const chosen = [];
  let powerSoFar = 0;
  for (const c of candidates) {
    if (powerSoFar >= required) break;
    chosen.push(c);
    powerSoFar += getEffectivePower(c);
  }
  if (powerSoFar < required) return false;

  const originZone = zoneType === 'land' ? state.rivalLands : state.rivalSupport;
  if (!originZone.includes(vehicleItem)) return false;

  chosen.forEach(c => {
    c.tapped = true;
    dispatchGameEvent({
      type:'permanent_tapped',controllerIsLocal:false,actorIsLocal:false,
      ownerIsLocal:cardOwnerIsLocal(c.card,false,state.currentMatch?.myRole||null),
      card:c.card,item:c,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'crew'
    }, {forceDeferNormalTriggers:true});
  });

  const abilityIndex = Math.max(0, getActivatedAbilities(vehicleItem.card).indexOf(ability));
  addToStack({
    card:vehicleItem.card,
    isLocal:false,
    targetObj:null,
    type:'ability',
    abilityKind:'own',
    ability:{...ability,effect:{...(ability?.effect||{}),type:'crew_vehicle'}},
    sourceItem:vehicleItem,
    source:{type:'crew_activation',abilityIndex,sourceItem:vehicleItem}
  });
  flushDeferredLandManaTriggers();
  state.priorityPlayer='local';
  state.consecutivePasses=0;
  logMsg(gameText('bot.crew.activated',{card:vehicleItem.card.name,count:chosen.length,power:powerSoFar,required}));
  render();
  return true;
}

// Punto 12: mismo contrato de timing para el Tano. Sin campo conserva la regla legacy;
// `sorcery` exige propia Main + pila vacía; `instant` sólo exige que el Tano tenga prioridad.
function botAbilityTimingAllowed(ability, { instantOnly = false } = {}) {
  if (!ability || state.gameOver || state.priorityPlayer !== 'rival') return false;
  const timing = getActivatedAbilityTiming(ability);
  if (timing === 'invalid') return false;
  const intrinsicSorceryOnly = ability.effect?.type === 'attach_equipment';
  if (intrinsicSorceryOnly && timing === 'instant') return false;
  if (instantOnly && timing !== 'instant') return false;
  if (timing === 'instant') return true;
  const ownMain = state.activePlayer === 'rival' && (state.phase === 'main1' || state.phase === 'main2');
  if (!ownMain) return false;
  if (timing === 'sorcery') return spellStack.length === 0;
  return true;
}

function hasPendingAnimateLandActivation(sourceItem) {
  if (!sourceItem) return false;
  return spellStack.some(entry =>
    entry?.type === 'ability' &&
    entry?.effect?.type === 'animate_land' &&
    (entry?.sourceItem === sourceItem || (sourceItem._syncObjectId && entry?.sourceItem?._syncObjectId === sourceItem._syncObjectId))
  );
}

function sameBotAbilitySource(a,b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return !!(a._syncObjectId && b._syncObjectId && a._syncObjectId === b._syncObjectId);
}

function hasPendingBotActivatedAbility(sourceItem, abilityIndex) {
  if (!sourceItem) return false;
  return spellStack.some(entry => entry?.isLocal === false && entry?.type === 'ability'
    && sameBotAbilitySource(entry?.sourceItem, sourceItem)
    && Number(entry?.source?.abilityIndex) === Number(abilityIndex));
}

// NUEVO: Evaluación táctica para activar artefactos y soporte
export function tryActivateBotAbilities({ instantOnly = false } = {}) {
  // Recorremos artefactos Y tierras de utilidad del Tano. Cada permanente puede exponer
  // varias habilidades propias; el Tano evalúa cada opción hasta encontrar una conveniente.
  const candidates = [
    ...state.rivalSupport.map((item, idx) => ({ item, index: idx, zoneType: 'support' })),
    ...state.rivalLands.map((item, idx) => ({ item, index: idx, zoneType: 'land' }))
  ];

  candidateLoop:
  for (const { item: supportItem, index: i, zoneType } of candidates) {
    const card = supportItem.card;
    const abilities = isLandPermanent(supportItem) ? getEffectiveLandActivatedAbilities(state, supportItem, false) : getActivatedAbilities(card);
    if (abilities.length === 0) continue;

    // Punto 13: una Tierra puede producir maná Y tener habilidades utility. Ya no se
    // descarta como candidata por tener `produces`; la IA evalúa la habilidad igual que
    // cualquier otra, reservando la propia Tierra si el costo incluye {T}.

    for (let abilityIndex = 0; abilityIndex < abilities.length; abilityIndex++) {
      const ability = abilities[abilityIndex];
      if (!ability) continue;
      if (!botAbilityTimingAllowed(ability, { instantOnly })) continue;
      if (hasPendingBotActivatedAbility(supportItem, abilityIndex)) continue;

      if (ability.crewCost !== undefined) {
        const crewed = tryBotCrewVehicle(supportItem, zoneType, ability);
        if (crewed) return true; // la habilidad ya está en Stack: abrimos prioridad humana
        continue;
      }

      const costStr = ability.cost || '';
      const requiresTap = costStr.includes('{T}');
      if (requiresTap && supportItem.tapped) continue;

      const manaCostString = costStr.replace('{T}', '').replace(',', '').trim();
      const dummyCardForCost = { manaCost: manaCostString || null };
      const reservedManaSources = requiresTap ? [supportItem] : [];
      if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost, { excludeItems: reservedManaSources })) continue;
      const timing = getActivatedAbilityTiming(ability);
      // Sin costo, sin {T} y sin sacrificio, una habilidad instantánea repetible podría hacer
      // que la IA se auto-encadene para siempre cada vez que recupera prioridad. El jugador
      // humano puede usarla; el Tano no la spamea automáticamente.
      if (instantOnly && !requiresTap && !dummyCardForCost.manaCost && !ability.sacrifice) continue;

      if (ability.sacrifice === 'creature' && state.rivalCombat.length === 0) continue;
      if (ability.sacrifice === 'artifact' && ![...state.rivalSupport, ...state.rivalCombat, ...state.rivalLands].some(isArtifactPermanent)) continue;
      if (ability.sacrifice === 'land' && ![...state.rivalLands, ...state.rivalCombat].some(isLandPermanent)) continue;
      const abilityAdditional = normalizeCompositeCost(ability.additionalCost);
      if (abilityAdditional && (abilityAdditional.life > 0 || abilityAdditional.manaCost || abilityAdditional.sacrifice || abilityAdditional.exileFromGraveyard || abilityAdditional.discard?.color)) continue;
      if ((abilityAdditional?.discard?.amount || 0) > state.rivalHand.length) continue;

      let shouldActivate = false;
      let aiTargetObj = null;
      const effect = ability.effect || {};

      if (effect.type === 'animate_land') {
        // 23.17.5.5 — si la misma Tierra ya está animada o ya tiene una activación de
        // animación esperando en la pila, volver a activarla no aporta nada y puede dejarla
        // girada al autopagarse el coste. El caso reportado de Plaza Mitre era una doble
        // activación redundante antes de la fase de combate.
        if (supportItem.isAnimatedLand || hasPendingAnimateLandActivation(supportItem)) continue;
        // En su Main 1 la anima para atacar; con prioridad instantánea durante bloqueadores
        // también puede animarla para defender. No la activa por puro valor fuera de combate.
        shouldActivate = state.phase === 'main1' || (timing === 'instant' && state.phase === 'combat_blockers' && state.activePlayer === 'local');
      }
      else if (effect.type === 'crew_vehicle') {
        if (state.phase === 'main1') shouldActivate = true;
      }
      else if (effect.type === 'attach_equipment') {
        if (state.phase === 'main1' && state.rivalCombat.length > 0) {
          const bestTargets = state.rivalCombat.filter(c => !c.tapped);
          if (bestTargets.length > 0) {
            const chosen = bestTargets.reduce((prev, current) =>
              (getEffectivePower(prev) > getEffectivePower(current)) ? prev : current
            );
            if (supportItem.attachedTo === chosen) continue;
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
            shouldActivate = true;
          }
        }
      }
      else if (effect.type === 'transform') {
        if (ability.requiresTarget) {
          const candidates=getResolvedEffectTargetCandidates({effect,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name});
          if (candidates.length > 0) { aiTargetObj=candidates[0]; shouldActivate=true; }
        } else if (canTransformPermanent(supportItem)) {
          shouldActivate = state.phase === 'main1' || state.phase === 'main2' || timing === 'instant';
        }
      }
      else if (effect.type === 'heal' || effect.type === 'draw') {
        const useful = effect.type === 'heal'
          ? shouldBotActivateHealing(effect,timing)
          : (state.phase === 'main2' || (timing === 'instant' && state.rivalHand.length <= 3));
        if (useful) {
          aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
          shouldActivate = true;
        }
      }
      else if (effect.type === 'damage') {
        if (state.localCombat.length > 0) {
          const vulnerable = state.localCombat.find(c =>
            isValidBotTarget(c, card.colors) && getEffectiveToughness(c) <= effect.amount
          );
          if (vulnerable) {
            aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable };
            shouldActivate = true;
          }
        }
        if (!shouldActivate && (state.phase === 'main2' || (timing === 'instant' && state.localHP <= effect.amount))) {
          aiTargetObj = { type: 'player', isLocal: true };
          shouldActivate = true;
        }
      }
      else if (effect.type === 'ramp' || effect.type === 'search_land') {
        if (state.phase === 'main1' && state.rivalDeck.some(c => landMatchesFilter(c, effect.type === 'ramp' ? 'basic' : (effect.filter || 'any')))) shouldActivate = true;
      }
      else if (effect.type === 'search_library' || effect.type === 'look_at_top') {
        const spec=normalizeLibraryEffect(effect);
        if (state.rivalDeck.length > 0 && (effect.type === 'look_at_top' || state.rivalDeck.some(c=>libraryCardMatchesFilter(c,spec.filter)))) shouldActivate = true;
      }
      else if (effect.type === 'return_from_graveyard' || effect.type === 'return_lands_from_graveyard' || effect.type === 'return_all_lands_from_graveyard') {
        const hasCandidate = state.rivalGraveyard.some(c => (effect.type === 'return_from_graveyard' ? cardMatchesGraveyardFilter(c, effect.filter || 'any') : String(c?.type || '').includes('Tierra')));
        if (hasCandidate && (state.phase === 'main2' || timing === 'instant')) shouldActivate = true;
      }
      else if (effect.type === 'draw_and_lose_life') {
        if ((state.phase === 'main2' || (timing === 'instant' && state.rivalHand.length <= 3)) && state.rivalHP > 8) shouldActivate = true;
      }

      if (!shouldActivate) continue;

      if (abilityAdditional?.discard?.amount > 0 && !payBotActivatedDiscardCost(abilityAdditional.discard.amount, card.name)) continue;
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost, { excludeItems: reservedManaSources });
      if (requiresTap) {
        const wasTapped=!!supportItem.tapped;
        supportItem.tapped = true;
        if(!wasTapped) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(supportItem.card,false,state.currentMatch?.myRole||null),card:supportItem.card,item:supportItem,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'activated_ability'}, {forceDeferNormalTriggers:true});
      }

      if (ability.sacrifice === 'self') {
        performSacrifice(supportItem, false);
      } else if (ability.sacrifice === 'creature') {
        const worst = state.rivalCombat.reduce((prev, current) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) < (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
        );
        performSacrifice(worst, false);
      } else if (ability.sacrifice === 'artifact') {
        const artifacts = [...state.rivalSupport, ...state.rivalCombat, ...state.rivalLands].filter(isArtifactPermanent);
        performSacrifice(artifacts[0], false);
      } else if (ability.sacrifice === 'land') {
        const lands = [...state.rivalLands, ...state.rivalCombat].filter(isLandPermanent);
        const chosen = lands.sort((a,b) => (Number(a.card?.manaAmount)||1) - (Number(b.card?.manaAmount)||1))[0];
        if (chosen) performSacrifice(chosen, false);
      }

      if (tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card,
          isLocal: false,
          targetObj: aiTargetObj,
          type: 'ability',
          source: { type: 'support_activation', index: i, abilityIndex },
          sourceItem: supportItem,
          ability
        });
      }
      flushDeferredLandManaTriggers();

      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(gameText('bot.ability.activated', { card: card.name }));
      render();
      return true;
    }
  }
  return false;
}

// NUEVO: El Tano usa las habilidades que un Equipo le presta a una criatura que ya tiene puesta
// (ej. Facón de Plata equipado: "{T}: hace 2 de daño"). Es la contraparte de tryActivateBotAbilities
// pero mirando las criaturas equipadas en vez de los permanentes de soporte.
export function tryActivateGrantedBotAbilities({ instantOnly = false } = {}) {
  for (let i = 0; i < state.rivalCombat.length; i++) {
    const creatureItem = state.rivalCombat[i];
    const supportZone = state.rivalSupport;
    const options = [];

    // Punto 11: la criatura conserva TODAS sus habilidades propias y además TODAS las
    // habilidades prestadas por cada Equipo. Tripular se omite porque un Vehículo ya está
    // en Combat y esa habilidad sólo se usa desde Support/Tierras.
    (isLandPermanent(creatureItem) ? getEffectiveLandActivatedAbilities(state, creatureItem, false) : getActivatedAbilities(creatureItem.card)).forEach((ability, abilityIndex) => {
      if (ability.crewCost !== undefined) return;
      options.push({ ability, abilityIndex, sourceCard: creatureItem.card, sourceItem: creatureItem, sourceIndex: i, abilityKind: 'own' });
    });
    supportZone.forEach((equipment, equipIndex) => {
      if (equipment.attachedTo !== creatureItem) return;
      getGrantedAbilities(equipment.card).forEach((ability, abilityIndex) => {
        options.push({ ability, abilityIndex, sourceCard: equipment.card, sourceItem: equipment, sourceIndex: equipIndex, abilityKind: 'granted' });
      });
    });

    for (const option of options) {
      const { ability, abilityIndex, sourceCard, sourceItem, sourceIndex, abilityKind } = option;
      if (!botAbilityTimingAllowed(ability, { instantOnly })) continue;
      if (hasPendingBotActivatedAbility(sourceItem, abilityIndex)) continue;
      const costStr = ability.cost || '';
      const requiresTap = costStr.includes('{T}');
      if (requiresTap && (creatureItem.tapped || creatureItem.summoningSickness)) continue;

      const manaCostString = costStr.replace('{T}', '').replace(',', '').trim();
      const dummyCardForCost = { manaCost: manaCostString || null };
      if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;
      const timing = getActivatedAbilityTiming(ability);
      if (instantOnly && !requiresTap && !dummyCardForCost.manaCost && !ability.sacrifice) continue;

      if (ability.sacrifice === 'creature' && state.rivalCombat.filter(c => c !== creatureItem).length === 0) continue;
      if (ability.sacrifice === 'artifact' && ![...state.rivalSupport, ...state.rivalCombat, ...state.rivalLands].some(isArtifactPermanent)) continue;
      if (ability.sacrifice === 'land' && ![...state.rivalLands, ...state.rivalCombat].some(isLandPermanent)) continue;
      const abilityAdditional = normalizeCompositeCost(ability.additionalCost);
      if (abilityAdditional && (abilityAdditional.life > 0 || abilityAdditional.manaCost || abilityAdditional.sacrifice || abilityAdditional.exileFromGraveyard || abilityAdditional.discard?.color)) continue;
      if ((abilityAdditional?.discard?.amount || 0) > state.rivalHand.length) continue;

      let shouldActivate = false;
      let aiTargetObj = null;
      const effect = ability.effect || {};

      if (effect.type === 'damage') {
        const vulnerable = state.localCombat.find(c =>
          isValidBotTarget(c, sourceCard.colors) && getEffectiveToughness(c) <= effect.amount
        );
        if (vulnerable) {
          aiTargetObj = ability.requiresTarget ? { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable } : null;
          shouldActivate = true;
        } else if (state.phase === 'main2' || (timing === 'instant' && state.localHP <= effect.amount)) {
          aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: true } : null;
          shouldActivate = true;
        }
      } else if (effect.type === 'transform') {
        if (ability.requiresTarget) {
          const candidates=getResolvedEffectTargetCandidates({effect,sourceCard,controllerIsLocal:false,chooserIsLocal:false,cardName:sourceCard.name});
          if (candidates.length > 0) { aiTargetObj=candidates[0]; shouldActivate=true; }
        } else if (canTransformPermanent(creatureItem)) {
          shouldActivate = state.phase === 'main1' || state.phase === 'main2' || timing === 'instant';
        }
      } else if (effect.type === 'heal' || effect.type === 'draw') {
        const useful = effect.type === 'heal'
          ? shouldBotActivateHealing(effect,timing)
          : (state.phase === 'main2' || (timing === 'instant' && state.rivalHand.length <= 3));
        if (useful) {
          aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
          shouldActivate = true;
        }
      } else if (effect.type === 'cant_attack_next_turn') {
        const validTargets = state.localCombat.filter(c => isValidBotTarget(c, sourceCard.colors));
        if (validTargets.length > 0 && (state.phase === 'main2' || state.activePlayer === 'local')) {
          const chosen = validTargets.reduce((prev, current) =>
            (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
          );
          aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(chosen), item: chosen };
          shouldActivate = true;
        }
      } else if (effect.type === 'ramp' || effect.type === 'search_land') {
        if (state.phase === 'main1' && state.rivalDeck.some(c => landMatchesFilter(c, effect.type === 'ramp' ? 'basic' : (effect.filter || 'any')))) shouldActivate = true;
      } else if (effect.type === 'search_library' || effect.type === 'look_at_top') {
        const spec=normalizeLibraryEffect(effect);
        if (state.rivalDeck.length > 0 && (effect.type === 'look_at_top' || state.rivalDeck.some(c=>libraryCardMatchesFilter(c,spec.filter)))) shouldActivate = true;
      } else if (effect.type === 'return_from_graveyard' || effect.type === 'return_lands_from_graveyard' || effect.type === 'return_all_lands_from_graveyard') {
        const hasCandidate = state.rivalGraveyard.some(c => (effect.type === 'return_from_graveyard' ? cardMatchesGraveyardFilter(c, effect.filter || 'any') : String(c?.type || '').includes('Tierra')));
        if (hasCandidate && (state.phase === 'main2' || timing === 'instant')) shouldActivate = true;
      } else if (effect.type === 'fight') {
        const candidates = state.localCombat.filter(c => isValidBotTarget(c, creatureItem.card.colors));
        const best = bestFightTargetFor(creatureItem, candidates);
        if (best) {
          aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(best.theirs), item: best.theirs };
          shouldActivate = true;
        }
      }

      if (!shouldActivate) continue;

      if (abilityAdditional?.discard?.amount > 0 && !payBotActivatedDiscardCost(abilityAdditional.discard.amount, sourceCard.name)) continue;
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) {
        const wasTapped=!!creatureItem.tapped;
        creatureItem.tapped = true;
        if(!wasTapped) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(creatureItem.card,false,state.currentMatch?.myRole||null),card:creatureItem.card,item:creatureItem,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'activated_ability'}, {forceDeferNormalTriggers:true});
      }

      if (ability.sacrifice === 'creature') {
        const candidates = state.rivalCombat.filter(c => c !== creatureItem);
        const worst = candidates.reduce((prev, current) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) < (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
        );
        performSacrifice(worst, false);
      } else if (ability.sacrifice === 'artifact') {
        const artifacts = [...state.rivalSupport, ...state.rivalCombat, ...state.rivalLands].filter(isArtifactPermanent);
        performSacrifice(artifacts[0], false);
      } else if (ability.sacrifice === 'land') {
        const lands = [...state.rivalLands, ...state.rivalCombat].filter(isLandPermanent);
        const chosen = lands.sort((a,b) => (Number(a.card?.manaAmount)||1) - (Number(b.card?.manaAmount)||1))[0];
        if (chosen) performSacrifice(chosen, false);
      } else if (ability.sacrifice === 'self') {
        // Conserva la semántica histórica de una habilidad activada desde criatura:
        // "self" refiere a la criatura que está usando la habilidad.
        performSacrifice(creatureItem, false);
      }

      if (tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card: sourceCard,
          isLocal: false,
          targetObj: aiTargetObj,
          type: 'ability',
          source: { type: abilityKind === 'own' ? 'support_activation' : 'equipped_activation', index: sourceIndex, abilityIndex },
          sourceItem,
          ability
        });
      }
      flushDeferredLandManaTriggers();

      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(gameText('bot.ability.usedWith', { source: sourceCard.name, target: creatureItem.card.name }));
      render();
      return true;
    }
  }
  return false;
}

// 23.11.3 — PRE-FLIGHT FORMAL DEL TANO PARA MAIN PHASE.
// Antes el selector principal sólo filtraba "pagable" y recién DESPUÉS de elegir una carta
// descubría si realmente existían los objetivos/condiciones que su heurística exigía. Si esa
// propuesta fallaba, el viejo `return` podía dejar la prioridad en `rival` sin callback futuro.
// Este pre-flight NO paga, NO saca la carta de la mano y NO publica nada: sólo responde si la
// carta puede convertirse AHORA en una propuesta de casteo legal/útil según los criterios que
// el propio Tano ya usa más abajo.
function resolveBotModalVariantForPreflight(card) {
  if (!card?.modal || !Array.isArray(card.modes) || card.modes.length === 0) return card;
  const chosenMode = card.modes[chooseBotMode(card)];
  return { ...card, effect: chosenMode.effect, requiresTarget: chosenMode.requiresTarget, chosenModeText: chosenMode.text };
}

function canBotBuildMainPhaseCastProposal(rawCard) {
  const card = resolveBotModalVariantForPreflight(rawCard);
  if (!card) return false;

  // Auras: replicamos exactamente el criterio del casteo real (maldición rival vs buff propio).
  if (card.adjunta) {
    if (card.alcance === 'criatura_rival') {
      return state.localCombat.some(c => isValidBotTarget(c, card.colors));
    }
    const grantedKeywords = getKeywordsGrantedByPendingSpell(card);
    return state.rivalCombat.some(c => !grantedKeywords.some(k => hasKeyword(c, k)));
  }

  // Todos los targets múltiples tienen que existir antes de que la carta compita por ser elegida.
  if (card.multiTarget && Array.isArray(card.targets) && card.targets.length > 0) {
    return Boolean(chooseBotMultiTargets(card));
  }

  // Criaturas/Planeswalkers sin ETB target no necesitan otra validación de target para castearse.
  if (card.power !== undefined || card.type?.includes('Planeswalker')) return true;

  const isPermanent = card.type?.includes('Artefacto') || (card.type?.includes('Encantamiento') && !card.adjunta);
  if (isPermanent && card.requiresTarget && card.etbEffect) {
    return getResolvedEffectTargetCandidates({
      effect: card.etbEffect,
      sourceCard: card,
      controllerIsLocal: false,
      chooserIsLocal: false,
      cardName: card.name
    }).length > 0;
  }

  if (!card.requiresTarget) return true;
  const effect = card.effect || {};

  if (['copy_spell','copy_ability','copy_stack_object'].includes(effect.type)) {
    return spellStack.some(obj=>isStackItemLegalCopyTarget(effect.type,obj,effect));
  }
  if (effect.type === 'create_token_copy' || effect.type === 'become_copy') {
    return getResolvedEffectTargetCandidates({effect,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name}).length > 0;
  }

  // Efectos cuyo target siempre puede ser un jugador adecuado.
  if (['damage', 'heal', 'poison', 'discard', 'private_zone_move', 'prevent_attack', 'prevent_damage'].includes(effect.type)) return true;

  // El Tano históricamente no desperdicia odio de cementerio sobre un cementerio vacío.
  if (effect.type === 'exile_graveyard') return state.localGraveyard.length > 0;

  // Remoción/freno: su heurística sólo los usa sobre una criatura rival válida.
  if (['destroy_creature', 'exile_creature', 'exile_and_return', 'bounce', 'cant_attack_next_turn', 'gain_control', 'gain_control_until_eot'].includes(effect.type)) {
    return state.localCombat.some(c => isValidBotTarget(c, card.colors));
  }
  if (effect.type === 'destroy_land' || effect.type === 'destroy_nonbasic_land') {
    return getBotLandDestructionTargets(effect, card.colors).length > 0;
  }

  // Buff/protección: sólo sobre una criatura propia real.
  if (effect.type === 'pump' || effect.type === 'grant_keyword_temp') return state.rivalCombat.length > 0;
  if (effect.type === 'add_counter' || effect.type === 'remove_counter') {
    return getResolvedEffectTargetCandidates({effect,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name}).length > 0;
  }

  // Fight agrega una condición estratégica: no basta con que haya dos criaturas; tiene que
  // existir al menos una pareja que el Tano considere una pelea aceptable.
  if (effect.type === 'fight') {
    const validTargets = state.localCombat.filter(c => isValidBotTarget(c, card.colors));
    return state.rivalCombat.some(mine => Boolean(bestFightTargetFor(mine, validTargets)));
  }

  if (effect.type === 'destroy_artifact') {
    return state.localCombat.some(c => c.card.type.includes('Artefacto') && isValidBotTarget(c, card.colors))
      || state.localSupport.some(s => s.card.type.includes('Artefacto'));
  }
  if (effect.type === 'destroy_enchantment') {
    return state.localSupport.some(s => s.card.type.includes('Encantamiento'));
  }

  // Cinturón genérico para futuros efectos targeteados: si el contrato universal sabe
  // enumerar al menos un target legal, la propuesta puede competir. Si no, queda afuera.
  return getResolvedEffectTargetCandidates({
    effect,
    sourceCard: card,
    controllerIsLocal: false,
    chooserIsLocal: false,
    cardName: card.name
  }).length > 0;
}


// 23.16.2 — Cast-from-Exile para Tano. Reusa Cost Engine, target universal y la misma Stack;
// no mueve la carta a la mano privada durante la propuesta.
async function tryBotCastFromExile({ instantOnly = false } = {}) {
  const entries=[
    ...state.rivalExile.map((card,index)=>({card,index,zone:state.rivalExile,zoneIsLocal:false})),
    ...state.localExile.map((card,index)=>({card,index,zone:state.localExile,zoneIsLocal:true}))
  ].filter(entry=>getExilePlayPermissionForCard(entry.card,false) && canPlayCardFromExile(entry.card,false));
  if(!entries.length) return false;

  for(const entry of entries){
    const original=entry.card;
    const permission=getExilePlayPermissionForCard(original,false);
    if(!permission) continue;
    const isLand=String(original.type||'').includes('Tierra');
    if(instantOnly && isLand) continue;
    if(instantOnly && permission.timing!=='any_time' && !original.type?.includes('Instantáneo') && !original.keywords?.includes('flash')) continue;

    if(isLand){
      if(state.rivalLandPlayedThisTurn || state.activePlayer!=='rival' || !['main1','main2'].includes(state.phase) || spellStack.length) continue;
      const liveIndex=entry.zone.indexOf(original); if(liveIndex<0) continue;
      entry.zone.splice(liveIndex,1);
      consumeExilePlayPermission(original,permission.permissionId); clearExilePlayStateOnLeave(original);
      const landItem={card:original,tapped:landEntersTappedForBattlefield(original,false),enteredThisTurn:true,permanentTypes:['land']};
      state.rivalLands.push(landItem); state.rivalLandPlayedThisTurn=true;
      dispatchGameEvent({type:'card_played_from_exile',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(original,false,state.currentMatch?.myRole||null),card:original,item:landItem,zoneFrom:'exile',zoneTo:'battlefield',cause:'exile_permission',metadata:{isLand:true}});
      await triggerLandEtb(false,original,landItem,'exile');
      logMsg(gameText('bot.land.played',{card:original.name})); render(); return true;
    }

    let card=original;
    if(card.modal && card.modes?.length){
      const modeIdx=chooseBotMode(card); const chosen=card.modes[modeIdx];
      card={...card,effect:chosen.effect,requiresTarget:chosen.requiresTarget,chosenModeText:chosen.text};
    }
    const baseOverride=permissionBaseManaOverride(permission);
    let useAlternative=false;
    if(baseOverride===null){
      useAlternative=chooseBotCastRoute(card,{baseOverride:null});
      if(useAlternative===null) continue;
    } else if(!canBotPayCastRoute(card,false,{baseOverride})) continue;

    let botKicked=false;
    if(permission.allowKicker!==false && card.kicker && canBotPayCastRoute(card,useAlternative,{baseOverride,kicked:true})) botKicked=true;
    const routeManaCost=getCastingManaCostString(card,{useAlternative,kicked:botKicked,baseOverride});
    let botXValue=0;
    if(routeManaCost?.includes('{X}')){
      botXValue=chooseBotXValue({...card,manaCost:routeManaCost});
      while(botXValue>0 && !canBotPayCastRoute(card,useAlternative,{baseOverride,kicked:botKicked,xValue:botXValue})) botXValue--;
      if(!canBotPayCastRoute(card,useAlternative,{baseOverride,kicked:botKicked,xValue:botXValue})) continue;
    }

    let targetObj=null;
    if(card.multiTarget && Array.isArray(card.targets) && card.targets.length){
      const targets=[]; let legal=true;
      for(const targetSpec of card.targets){
        const chosen=await chooseResolvedEffectTarget({effect:targetSpec.effect||targetSpec,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name});
        if(!chosen){legal=false;break;} targets.push(chosen);
      }
      if(!legal) continue;
      targetObj={type:'multi',targets};
    } else if(card.effect?.type?.startsWith('counter')){
      const target=legalBotCounterTargets(card.effect.type).at(-1);
      if(!target) continue;
      targetObj={type:'stack',stackId:target.id};
    } else if(card.adjunta){
      if(card.alcance==='criatura_rival'){
        const validTargets=state.localCombat.filter(c=>isValidBotTarget(c,card.colors));
        if(!validTargets.length) continue;
        const chosen=validTargets.reduce((prev,current)=>getEffectivePower(prev)>getEffectivePower(current)?prev:current);
        targetObj={type:'creature',isLocal:true,item:chosen};
      } else {
        const grantedKeywords=getKeywordsGrantedByPendingSpell(card);
        const validSelfTargets=state.rivalCombat.filter(c=>!grantedKeywords.some(k=>hasKeyword(c,k)));
        if(!validSelfTargets.length) continue;
        targetObj={type:'creature',isLocal:false,item:validSelfTargets[0]};
      }
    } else if(card.requiresTarget){
      const chosen=await chooseResolvedEffectTarget({effect:card.effect,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name});
      if(!chosen) continue;
      targetObj=chosen;
    }

    await payBotCastRoute(card,useAlternative,{baseOverride,kicked:botKicked,xValue:botXValue});
    const liveIndex=entry.zone.indexOf(original); if(liveIndex<0) continue;
    entry.zone.splice(liveIndex,1);
    consumeExilePlayPermission(original,permission.permissionId); clearExilePlayStateOnLeave(original);
    let stackType='spell';
    if(card.power!==undefined) stackType='summon';
    else if(card.type?.includes('Planeswalker')) stackType='planeswalker';
    else if(card.type?.includes('Artefacto') || (card.type?.includes('Encantamiento')&&!card.adjunta)) stackType='permanent';
    else if(card.type?.includes('Instantáneo')) stackType='instant';
    else if(card.adjunta) stackType='aura';
    const stackItem={card,isLocal:false,targetObj,type:stackType,xValue:botXValue,kicked:botKicked,castFrom:'exile',exilePermissionId:permission.permissionId,exilePlayEngineVersion:EXILE_PLAY_ENGINE_VERSION};
    addToStack(stackItem); flushDeferredLandManaTriggers();
    await triggerSpellCast(false,card,stackItem);
    if(!tryPayWardForBotTarget(targetObj)){
      const i=spellStack.indexOf(stackItem); if(i>=0) moveBotCounteredSpell(spellStack.splice(i,1)[0],'ward');
    }
    state.priorityPlayer='local'; state.consecutivePasses=0;
    logMsg(gameText('bot.stack.entered',{card:card.name})); render(); return true;
  }
  return false;
}


// 23.16.3 — resolución del trigger del último Time para Tano. El casteo es opcional;
// la IA acepta si puede pagar los adicionales y declarar objetivos legales. El coste base
// queda {0}, X=0 y nunca se selecciona un coste alternativo.
export async function castSuspendedCardForBot(original) {
  if(!original) return false;
  const entry=[
    ...state.rivalExile.map((card,index)=>({card,index,zone:state.rivalExile})),
    ...state.localExile.map((card,index)=>({card,index,zone:state.localExile}))
  ].find(e=>e.card===original);
  if(!entry) return false;
  let card=original;
  if(card.modal && card.modes?.length){
    const modeIdx=chooseBotMode(card); const chosen=card.modes[modeIdx];
    card={...card,effect:chosen.effect,requiresTarget:chosen.requiresTarget,chosenModeText:chosen.text};
  }
  const baseOverride='{0}';
  let botKicked=false;
  if(card.kicker && canBotPayCastRoute(card,false,{baseOverride,kicked:true,xValue:0,excludeCard:original})) botKicked=true;
  if(!canBotPayCastRoute(card,false,{baseOverride,kicked:botKicked,xValue:0,excludeCard:original})) return false;

  let targetObj=null;
  if(card.multiTarget && Array.isArray(card.targets) && card.targets.length){
    const targets=[];
    for(const targetSpec of card.targets){
      const chosen=await chooseResolvedEffectTarget({effect:targetSpec.effect||targetSpec,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name});
      if(!chosen) return false; targets.push(chosen);
    }
    targetObj={type:'multi',targets};
  } else if(card.effect?.type?.startsWith('counter')){
    const target=legalBotCounterTargets(card.effect.type).at(-1);
    if(!target) return false; targetObj={type:'stack',stackId:target.id};
  } else if(card.adjunta){
    const candidates=card.alcance==='criatura_rival' ? state.localCombat : state.rivalCombat;
    const valid=candidates.filter(c=>isValidBotTarget(c,card.colors)); if(!valid.length) return false;
    targetObj={type:'creature',isLocal:card.alcance==='criatura_rival',item:valid[0]};
  } else if(card.requiresTarget){
    const chosen=await chooseResolvedEffectTarget({effect:card.effect,sourceCard:card,controllerIsLocal:false,chooserIsLocal:false,cardName:card.name});
    if(!chosen) return false; targetObj=chosen;
  }

  try { await payBotCastRoute(card,false,{baseOverride,kicked:botKicked,xValue:0,excludeCard:original}); }
  catch { return false; }
  const liveIndex=entry.zone.indexOf(original); if(liveIndex<0) return false;
  entry.zone.splice(liveIndex,1); clearExilePlayStateOnLeave(original); clearSuspendState(original);
  if(card!==original){ clearExilePlayStateOnLeave(card); clearSuspendState(card); }
  let stackType='spell';
  if(card.power!==undefined) stackType='summon';
  else if(card.type?.includes('Planeswalker')) stackType='planeswalker';
  else if(card.type?.includes('Artefacto') || (card.type?.includes('Encantamiento')&&!card.adjunta)) stackType='permanent';
  else if(card.type?.includes('Instantáneo')) stackType='instant';
  else if(card.adjunta) stackType='aura';
  const stackItem={card,isLocal:false,targetObj,type:stackType,xValue:0,kicked:botKicked,castFrom:'suspend',suspendEngineVersion:SUSPEND_ENGINE_VERSION,suspendHaste:card.power!==undefined};
  addToStack(stackItem); flushDeferredLandManaTriggers(); await triggerSpellCast(false,card,stackItem);
  if(!tryPayWardForBotTarget(targetObj)){ const i=spellStack.indexOf(stackItem); if(i>=0) moveBotCounteredSpell(spellStack.splice(i,1)[0],'ward'); }
  state.priorityPlayer='local'; state.consecutivePasses=0;
  logMsg(gameText('bot.stack.entered',{card:card.name})); render(); return true;
}

// NUEVO: SISTEMA DE PRIORIDAD DEL BOT (Remplaza startRivalTurn)
export async function takeBotPriorityAction() {
  // FASE 4, ETAPA 4: mismo criterio que checkRivalCounterOrResponse acá arriba — durante
  // una partida multiplayer real, "esperar la jugada real del rival" significa exactamente
  // NO HACER NADA acá. El otro cliente (el de la persona de verdad) es quien procesa su
  // propia prioridad y publica el resultado — este cliente solo lo refleja (ver
  // startListeningToMatch, Etapa 3), nunca lo simula.
  if (state.currentMatch) return;
  if (state.gameOver || state.priorityPlayer !== 'rival') return;

  await botThinkDelay(600); // El Tano "piensa"

  // 1. Responder a la pila
  if (spellStack.length > 0) {
    const responded = await checkRivalCounterOrResponse();
    if (responded) return;
    // Punto 12: una habilidad `instant` también es una respuesta válida a la pila; hasta
    // ahora la IA sólo miraba cartas de la mano en esta ventana.
    if (tryActivateBotAbilities({ instantOnly: true })) return;
    if (tryActivateGrantedBotAbilities({ instantOnly: true })) return;
    if (await tryBotCastFromExile({ instantOnly:true })) return;
    logMsg(gameText('bot.priority.noResponse'));
    passPriority('rival');
    return;
  }

  // 1.5. Truco de combate: si vos declarás atacantes y la pila está vacía, el Tano puede
  // quemar a uno antes de que se asignen bloqueos.
  if (state.phase === 'combat_attackers' && state.activePlayer === 'local') {
    const trickUsed = await tryBotCombatTrick();
    if (trickUsed) return;
  }

  // Punto 12: con la pila vacía, el Tano también puede usar habilidades explícitamente
  // instantáneas durante upkeep/draw/combat/end step o en el turno humano.
  if (tryActivateBotAbilities({ instantOnly: true })) return;
  if (tryActivateGrantedBotAbilities({ instantOnly: true })) return;

  // 2. Acciones de Fase Principal (Solo en el turno del Tano)
  if (state.activePlayer === 'rival' && (state.phase === 'main1' || state.phase === 'main2')) {
    
    // Intentar bajar tierra
    const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
    if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
      const landCard = state.rivalHand.splice(landIndex, 1)[0];
      const entersTapped = landEntersTappedForBattlefield(landCard, false);
      const landItem = { card: landCard, tapped: entersTapped, enteredThisTurn: true, permanentTypes: ['land'] };
      state.rivalLands.push(landItem); 
      state.rivalLandPlayedThisTurn = true;
      logMsg(entersTapped ? gameText('bot.land.playedTapped', { card: landCard.name }) : gameText('bot.land.played', { card: landCard.name })); 
      // PUNTO 2: el Tano dispara el mismo evento Landfall que el jugador humano.
      await triggerLandEtb(false, landCard, landItem, 'hand');
      render(); 
      await botThinkDelay(800);
    }

    // LAND 4: si un permanente tipo Crucible/Ramunap le permite jugar Tierras desde su
    // cementerio y todavía conserva el land drop, usa una Tierra de ahí cuando no bajó una de mano.
    if (!state.rivalLandPlayedThisTurn && hasLandPlayFromGraveyardPermission(false)) {
      const gyLandIndex = state.rivalGraveyard.findIndex(c => String(c?.type || '').includes('Tierra'));
      if (gyLandIndex !== -1) {
        await playLandFromGraveyardByIndex(gyLandIndex, false);
        await botThinkDelay(600);
      }
    }

    // Planeswalkers propios: si activa Loyalty, ahora entra a la Stack y el Tano corta acá
    // para abrir la ventana de prioridad antes de seguir jugando su Main.
    if (await tryActivateBotPlaneswalkers()) {
      render();
      return;
    }

    // Flashback o Escape desde su propio cementerio: si tiene algo pagable, lo usa antes de
    // seguir con el resto de sus decisiones — esto SÍ pasa por la pila (a diferencia de
    // Lealtad), así que cortamos acá para esperar a que resuelva.
    if (await tryFlashbackOrEscapeFromBotGraveyard()) return;

    // 23.16.2: después del cementerio, aprovecha permisos públicos desde Exilio.
    if (await tryBotCastFromExile()) return;

    // --- NUEVO: Intentar activar habilidades de artefactos primero ---
    const abilityActivated = tryActivateBotAbilities();
    if (abilityActivated) return; // Si activó algo, la función corta y espera resolución

    // --- NUEVO: Intentar usar habilidades otorgadas por Equipos ya puestos ---
    const grantedActivated = tryActivateGrantedBotAbilities();
    if (grantedActivated) return;
    // -----------------------------------------------------------------
    
    // ETAPA 3 (Grupo C, "mejor jugada"): entre TODAS las cartas que puede pagar, antes
    // jugaba literalmente la primera en el orden de la mano (puro azar de robo). Ahora usa
    // un sistema de 3 niveles de prioridad — chico y explicable a propósito, no una IA real
    // de verdad: 1) remoción si hay una amenaza grande enfrente, 2) una criatura si el
    // campo está vacío, 3) lo que sea, como antes. Dentro de cada nivel, sigue siendo la
    // primera en orden de mano (no evalúa CUÁL remoción o CUÁL criatura es mejor entre sí).
    function isRemovalCard(c) {
      return c.effect && ['destroy_creature', 'exile_creature', 'fight'].includes(c.effect.type);
    }
    function pickBestMainPhaseCardIndex(affordableIndexes) {
      if (affordableIndexes.length === 0) return -1;

      // Grupo C, Etapa 4: en Fácil, directo la primera que puede pagar — sin ningún nivel
      // de prioridad (el comportamiento de base, antes de la Etapa 3).
      if (!botHasCapability(state.botDifficulty, 'strategicMainPhase')) return affordableIndexes[0];

      // Nivel 1: hay una amenaza grande de tu lado (poder+resistencia por encima de un piso
      // razonable) y el Tano tiene algo de remoción — la prioriza por sobre cualquier otra cosa.
      const biggestThreatValue = state.localCombat.reduce((max, u) => {
        const val = getEffectivePower(u) + getEffectiveToughness(u);
        return val > max ? val : max;
      }, 0);
      if (biggestThreatValue >= 6) {
        const removalIdx = affordableIndexes.find(i => isRemovalCard(state.rivalHand[i]));
        if (removalIdx !== undefined) return removalIdx;
      }

      // Nivel 2: el campo está vacío (o casi) — prioriza desarrollar con una criatura antes
      // que gastar la carta en otra cosa (drenar, robar, etc.), aunque también la pueda pagar.
      if (state.rivalCombat.length === 0) {
        const creatureIdx = affordableIndexes.find(i => state.rivalHand[i].power !== undefined);
        if (creatureIdx !== undefined) return creatureIdx;
      }

      // Nivel 3: sin ninguna prioridad especial, la primera que pueda pagar (comportamiento
      // de siempre).
      return affordableIndexes[0];
    }


    // Mismo filtro de siempre (afford, no counterspell, colchón de vida, gating de
    // destroy_all_creatures/proliferate) — antes devolvía solo el PRIMER índice que
    // pasaba (findIndex); ahora devuelve TODOS los que pasan (filter), para que
    // pickBestMainPhaseCardIndex pueda elegir entre ellos en vez de quedarse con el primero.
    const getAllAffordableMainPhaseCardIndexes = () => {
      const indexes = [];
      state.rivalHand.forEach((c, i) => {
        if (c.type.includes('Tierra')) return;
        // Punto 14: affordability de la ruta COMPLETA. Incluye maná adicional y todos los
        // componentes no-maná; si el normal no alcanza, contempla la vía alternativa.
        if (chooseBotCastRoute(c, { excludeCard: c }) === null) return;
        if (isCounterSpell(c)) return;
        // 23.19.4.6 — 20 es vida INICIAL, no máxima; aun así, una carta cuyo único valor
        // es curar no se gasta automáticamente estando sano. Mismo criterio health-aware
        // que Tuppers y otras habilidades activadas.
        if (c.effect?.type === 'heal' && !shouldBotActivateHealing(c.effect, 'main2')) return;
        // 23.11.3: una carta pagable no alcanza. Si no puede formar una propuesta legal/útil
        // con sus targets actuales, ni siquiera compite en la selección de Main.
        if (!canBotBuildMainPhaseCastProposal(c)) return;
        if (c.effect && (c.effect.type === 'ramp' || c.effect.type === 'search_land')) {
          const filter = c.effect.type === 'ramp' ? 'basic' : (c.effect.filter || 'any');
          if (!state.rivalDeck.some(card => landMatchesFilter(card, filter))) return;
        }
        if (c.effect && (c.effect.type === 'search_library' || c.effect.type === 'look_at_top')) {
          const spec=normalizeLibraryEffect(c.effect);
          if (state.rivalDeck.length===0) return;
          if (c.effect.type==='search_library' && !state.rivalDeck.some(card=>libraryCardMatchesFilter(card,spec.filter))) return;
        }
        // NUEVO: El Tano solo arrasa el campo si está en desventaja de poder
        if (c.effect && c.effect.type === 'destroy_all_creatures') {
          const localPower = state.localCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          const rivalPower = state.rivalCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          if (rivalPower >= localPower) return;
        }
        // LAND 2: un Armageddon-style no se castea porque sí. Si el efecto es unilateral
        // contra el rival alcanza con que destruya algo; si afecta a ambos, el Tano exige
        // destruir estrictamente más Tierras humanas que propias.
        if (c.effect && c.effect.type === 'destroy_all_lands') {
          const humanLost = countBotMassLandVictims(c.effect, true);
          const botLost = countBotMassLandVictims(c.effect, false);
          if (humanLost === 0 || (botLost > 0 && humanLost <= botLost)) return;
        }
        // NUEVO: no tiene sentido gastar Proliferar si no hay ni un solo contador en juego
        // (ni +1/+1, ni -1/-1, ni un Planeswalker con Lealtad) — se desperdiciaría entero.
        if (c.effect && c.effect.type === 'proliferate') {
          if (getProliferateCandidates(state).length === 0) return;
        }
        indexes.push(i);
      });
      return indexes;
    };

    let affordableIndex = pickBestMainPhaseCardIndex(getAllAffordableMainPhaseCardIndexes());
    
    if (affordableIndex !== -1) {
      // 23.10 / CR 601: se aparta conceptualmente la carta al anunciarla, pero no se
      // activan fuentes ni se pagan costos hasta fijar modo/ruta/X/Kicker y objetivos.
      const originalCardToPlay = state.rivalHand[affordableIndex];
      let cardToPlay = originalCardToPlay;

      // Hechizos modales: el Tano elige un modo ANTES de todo lo demás (mismo orden que
      // el jugador humano) — "resuelve" la carta en una versión con el effect/requiresTarget
      // del modo elegido ya fijados, y el resto de su lógica de casteo (más abajo) sigue
      // funcionando exactamente igual, sin saber que la carta era modal.
      if (cardToPlay.modal && cardToPlay.modes && cardToPlay.modes.length > 0) {
        const modeIdx = chooseBotMode(cardToPlay);
        const chosenMode = cardToPlay.modes[modeIdx];
        cardToPlay = { ...cardToPlay, effect: chosenMode.effect, requiresTarget: chosenMode.requiresTarget, chosenModeText: chosenMode.text };
        logMsg(gameText('bot.mode', { mode: chosenMode.text, card: cardToPlay.name }));
      }

      // Punto 14: primero fija la vía de costo. El Tano conserva su preferencia histórica:
      // paga normal si puede; sólo usa alternativa si la normal no alcanza.
      const useAlternative = chooseBotCastRoute(cardToPlay);
      if (useAlternative === null) {
        // Defensa ante un cambio de estado inesperado entre evaluación y compromiso. Como la
        // carta todavía NO salió de la mano, el rewind es gratis. Lo importante: nunca dejamos
        // la prioridad del bot huérfana.
        recordTelemetryEvent('bot_cast_proposal_rejected', { cardId: originalCardToPlay?.id || null, cardName: originalCardToPlay?.name || null, reason: 'route_became_unpayable', phase: state.phase });
        passPriority('rival');
        return;
      }

      // Kicker sigue siendo ADICIONAL a cualquiera de las dos vías. Antes elegir alternativa
      // podía borrar accidentalmente el Kicker; ahora se prueba contra la ruta ya elegida.
      let botKicked = false;
      if (cardToPlay.kicker && canBotPayCastRoute(cardToPlay, useAlternative, { kicked: true })) {
        botKicked = true;
        logMsg(gameText('bot.kicker.paid', { card: cardToPlay.name }));
      }

      // 601.2b: X queda anunciado antes de objetivos y antes de activar fuentes.
      const routeManaCost = getCastingManaCostString(cardToPlay, { useAlternative, kicked: botKicked });
      let botXValue = null;
      if (routeManaCost && routeManaCost.includes('{X}')) {
        const manaSourceCard = { ...cardToPlay, manaCost: routeManaCost };
        botXValue = chooseBotXValue(manaSourceCard);
        // 23.15.4: el estimador histórico no conocía taxes/reducciones/Convoke/Delve.
        // Ajustamos X hacia abajo hasta una ruta realmente pagable por el Cost Engine final.
        while (botXValue > 0 && !canBotPayCastRoute(cardToPlay,useAlternative,{kicked:botKicked,xValue:botXValue})) botXValue -= 1;
        if (!canBotPayCastRoute(cardToPlay,useAlternative,{kicked:botKicked,xValue:botXValue})) {
          recordTelemetryEvent('bot_cast_proposal_rejected',{cardId:originalCardToPlay?.id||null,cardName:originalCardToPlay?.name||null,reason:'final_cost_unpayable',phase:state.phase});
          passPriority('rival');
          return;
        }
        logMsg(gameText('bot.x.chosen', { x: botXValue, card: cardToPlay.name }));
      }

      const isPermanent = cardToPlay.type.includes('Artefacto') || (cardToPlay.type.includes('Encantamiento') && !cardToPlay.adjunta);
      
      let stackType = 'spell';
      let aiTargetObj = null;
      let validPlay = true;

      if (cardToPlay.power !== undefined) {
        stackType = 'summon';
      } else if (cardToPlay.type.includes('Planeswalker')) {
        stackType = 'planeswalker';
      } else if (isPermanent) {
        stackType = 'permanent';
        // --- LÓGICA HEXPROOF PARA EL BOT ---
        if (cardToPlay.requiresTarget && cardToPlay.etbEffect) {
          if (cardToPlay.etbEffect.type === 'damage') {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            const validLocalTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
            if (validLocalTargets.length > 0) {
              aiTargetObj = { type: 'creature', isLocal: true, index: 0, item: validLocalTargets[0] };
            } else {
              aiTargetObj = { type: 'player', isLocal: true };
            }
          }
        }
      } else if (cardToPlay.adjunta) {
        stackType = 'aura';
        // Maldiciones (alcance: criatura_rival) van a tu criatura más peligrosa;
        // las Auras normales (buff propio) van a la mejor criatura del Tano.
        if (cardToPlay.alcance === 'criatura_rival') {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          if (validTargets.length > 0) {
            const chosen = validTargets.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noTargets', { card: cardToPlay.name }));
          }
        } else if (state.rivalCombat.length > 0) {
          // Mismo criterio que del lado del jugador: no le vuelvas a poner una habilidad que
          // esa criatura ya tiene (de cualquier fuente) — antes siempre iba a rivalCombat[0]
          // sin chequear nada.
          const grantedKeywords = getKeywordsGrantedByPendingSpell(cardToPlay);
          const validSelfTargets = state.rivalCombat.filter(c =>
            !grantedKeywords.some(k => hasKeyword(c, k))
          );
          if (validSelfTargets.length > 0) {
            aiTargetObj = { type: 'creature', isLocal: false, item: validSelfTargets[0] };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noBeneficialCreature', { card: cardToPlay.name }));
          }
        } else {
          validPlay = false;
          logMsg(gameText('bot.cast.noAuraTarget', { card: cardToPlay.name }));
        }
      } else {
        stackType = cardToPlay.type.includes('Instantáneo') ? 'instant' : 'spell';

        // Objetivos múltiples: elige TODOS los targets de una, con el mismo criterio que
        // ya usa para cada tipo de efecto en solitario. Si falta uno solo, la carta entera
        // queda sin jugar — regla real: no podés castear sin objetivo legal para todos los
        // que pide.
        if (cardToPlay.multiTarget && cardToPlay.targets && cardToPlay.targets.length > 0) {
          const chosenTargets = chooseBotMultiTargets(cardToPlay);
          if (chosenTargets) {
            aiTargetObj = { type: 'multi', targets: chosenTargets };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noModalTargets', { card: cardToPlay.name }));
          }
        }
        else if (cardToPlay.effect && (cardToPlay.effect.targetSubtype || cardToPlay.effect.targetSubtypes || cardToPlay.effect.sharedCreatureTypeWithSource || cardToPlay.effect.sharesCreatureTypeWithSource)) {
          const eff=cardToPlay.effect;
          const beneficial=['pump','grant_keyword_temp','add_counter'].includes(eff.type);
          const side=eff.targetController==='self' ? false : eff.targetController==='opponent' ? true : !beneficial;
          const pool=side ? state.localCombat : state.rivalCombat;
          const wanted=resolveSubtypeReference(eff.targetSubtype ?? eff.targetSubtypes?.[0],{sourceCard:cardToPlay});
          const candidates=pool.filter(unit=>(!wanted || cardHasSubtype(unit.card,wanted)) && (!(eff.sharedCreatureTypeWithSource||eff.sharesCreatureTypeWithSource) || cardsShareCreatureType(unit.card,cardToPlay)) && (side===false || isValidBotTarget(unit,cardToPlay.colors)));
          if(candidates.length){
            const chosen=candidates.reduce((a,b)=>(getEffectivePower(a)+getEffectiveToughness(a)) >= (getEffectivePower(b)+getEffectiveToughness(b)) ? a : b);
            aiTargetObj={type:'creature',isLocal:side,item:chosen};
          } else { validPlay=false; logMsg(gameText('bot.cast.noTargets',{card:cardToPlay.name})); }
        }
        else if (cardToPlay.effect && cardToPlay.effect.type === 'damage') {
          // LÓGICA NUEVA (Cabo suelto #13): mismo criterio que ya usa en combate
          // (chooseBotAttackTarget) — si con esto remata un Planeswalker tuyo, lo prioriza
          // por sobre pegarte a la cara. Si no hay un remate limpio, va a la cara como antes.
          const killablePw = state.localPlaneswalkers.find(pw => pw.loyalty <= cardToPlay.effect.amount);
          aiTargetObj = killablePw
            ? { type: 'planeswalker', isLocal: true, item: killablePw }
            : { type: 'player', isLocal: true };
        } else if (cardToPlay.effect && cardToPlay.effect.type === 'heal') {
          aiTargetObj = { type: 'player', isLocal: false };
        }
        // LÓGICA NUEVA: VENENO DIRECTO — mismo criterio que daño, siempre apunta al jugador.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'poison') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: REMOCIÓN DE CRIATURA (Yuyo del Loco, etc.)
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_creature' || cardToPlay.effect.type === 'exile_creature' || cardToPlay.effect.type === 'exile_and_return')) {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura más grande (poder + resistencia) — si es
            // Exilio, además prioriza una Indestructible (a esa, "destruir" no le sirve
            // de nada, pero Exilio no le pregunta nada).
            const indestructibleTargets = validTargets.filter(c => hasKeyword(c, 'indestructible'));
            const pool = ((cardToPlay.effect.type === 'exile_creature' || cardToPlay.effect.type === 'exile_and_return') && indestructibleTargets.length > 0) ? indestructibleTargets : validTargets;
            const chosen = pool.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noTargets', { card: cardToPlay.name }));
          }
        }
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'gain_control' || cardToPlay.effect.type === 'gain_control_until_eot')) {
          const anyPermanent = cardToPlay.effect.targetKind === 'any_permanent';
          const candidates = [
            ...state.localCombat.map(item=>({type:'creature',item,score:(getEffectivePower(item)+getEffectiveToughness(item))*2+Number(item.card?.cmc||0)})),
            ...(anyPermanent ? state.localPlaneswalkers.map(item=>({type:'planeswalker',item,score:Number(item.loyalty||0)*2+Number(item.card?.cmc||0)})) : []),
            ...(anyPermanent ? state.localSupport.map(item=>({type:'permanent',item,score:Number(item.card?.cmc||0)+3})) : []),
            ...(anyPermanent ? state.localLands.map(item=>({type:'land',item,score:Number(item.card?.activatedAbility?4:1)})) : [])
          ];
          if (candidates.length) {
            candidates.sort((a,b)=>b.score-a.score);
            const chosen=candidates[0]; aiTargetObj={type:chosen.type,isLocal:true,item:chosen.item};
          } else { validPlay=false; logMsg(gameText('bot.cast.noTargets',{card:cardToPlay.name})); }
        }
        // LÓGICA NUEVA: REBOTE (Vuelto en Mano, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'bounce') {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura con más poder (la más amenazante en combate)
            const chosen = validTargets.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noTargets', { card: cardToPlay.name }));
          }
        }
        // LÓGICA NUEVA: DESCARTE (Corralito, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'discard') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // 23.10.1: Hand/Deck rival se TARGETEA como jugador durante casteo. La
        // identidad de la carta privada se elegirá recién cuando el hechizo resuelva.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'private_zone_move') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: EXILIAR CEMENTERIO — el Tano se lo tira a quien tenga más cartas
        // ahí (normalmente vos); si el rival tiene el cementerio vacío, mejor ni gastarla.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'exile_graveyard') {
          if (state.localGraveyard.length > 0) {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noGraveToExile', { card: cardToPlay.name }));
          }
        }
        // 23.9.3: impedir que UNA criatura ataque en el próximo turno de su controlador.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'cant_attack_next_turn') {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          if (validTargets.length > 0) {
            const chosen = validTargets.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen, index: state.localCombat.indexOf(chosen) };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noPreventTarget', { card: cardToPlay.name }));
          }
        }
        // PREVENIR COMBATE GLOBAL (Cuarentena Total)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'prevent_attack') {
          // El Tano te lo tira a vos para frenar tu próximo ataque completo.
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // Pool Expansion I: prevención dirigida. Es una heurística conservadora: si el
        // Tano tiene una criatura amenazada, protege su permanente de mayor valor; si no,
        // se protege a sí mismo. La legalidad real sigue revalidándose en resolución.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'prevent_damage') {
          if (state.rivalCombat.length > 0) {
            const chosen = state.rivalCombat.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type:'creature', isLocal:false, item:chosen };
          } else {
            aiTargetObj = { type:'player', isLocal:false };
          }
        }
        // LÓGICA NUEVA: TRUCO DE COMBATE (Fuerza de Toro, etc.) — a su mejor criatura
        else if (cardToPlay.effect && cardToPlay.effect.type === 'pump') {
          if (state.rivalCombat.length > 0) {
            const chosen = state.rivalCombat.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noBuffTarget', { card: cardToPlay.name }));
          }
        }
        // LÓGICA NUEVA: CONTADOR PERMANENTE (+1/+1 propio, o -1/-1 al rival) — mismo criterio
        // que pump (+1/+1 a su mejor criatura) y destroy_creature (-1/-1 a la más grande tuya).
        else if (cardToPlay.effect && ['add_counter','remove_counter'].includes(cardToPlay.effect.type)) {
          const chosen = await chooseResolvedEffectTarget({
            effect:cardToPlay.effect, sourceCard:cardToPlay,
            controllerIsLocal:false, chooserIsLocal:false, cardName:cardToPlay.name
          });
          if (chosen) aiTargetObj=chosen;
          else {
            validPlay=false;
            logMsg(gameText('bot.cast.noTargets',{card:cardToPlay.name}));
          }
        }
        // LÓGICA NUEVA: PROTECCIÓN TEMPORAL (A Cubierto, etc.) — protege a su criatura más grande
        else if (cardToPlay.effect && cardToPlay.effect.type === 'grant_keyword_temp') {
          if (state.rivalCombat.length > 0) {
            const chosen = state.rivalCombat.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noProtectTarget', { card: cardToPlay.name }));
          }
        }
        // ETAPA 2 (Grupo C, Pelear del Tano): antes solo consideraba un cambio 100% gratis
        // (mata y sobrevive) entre TODAS sus combinaciones posibles — ahora, si no hay
        // ninguna así, también acepta la mejor combinación de trade parejo disponible
        // (mata pero también muere, si el rival vale más que la propia). Mismo criterio
        // que la pelea por habilidad (bestFightTargetFor), pero acá también hay que elegir
        // CUÁL de sus criaturas pelea, no solo contra cuál.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'fight') {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          let bestPair = null, bestTier = null;
          state.rivalCombat.forEach(mine => {
            const best = bestFightTargetFor(mine, validTargets);
            if (!best) return;
            const theirValue = getEffectivePower(best.theirs) + getEffectiveToughness(best.theirs);
            const currentBestValue = bestPair ? getEffectivePower(bestPair.theirs) + getEffectiveToughness(bestPair.theirs) : -1;
            const isBetter = !bestPair
              || (best.tier === 'clean' && bestTier !== 'clean')
              || (best.tier === bestTier && theirValue > currentBestValue);
            if (isBetter) { bestPair = { mine, theirs: best.theirs }; bestTier = best.tier; }
          });
          if (bestPair) {
            aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(bestPair.theirs), item: bestPair.theirs, fightWithItem: bestPair.mine };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noGoodFight', { card: cardToPlay.name }));
          }
        }
        // LAND 2: destrucción puntual de Tierras. Incluye una man-land animada porque
        // conserva identidad Land aun cuando esté visualmente en Combat.
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_land' || cardToPlay.effect.type === 'destroy_nonbasic_land')) {
          const chosen = getBotLandDestructionTargets(cardToPlay.effect, cardToPlay.colors)[0];
          if (chosen) {
            aiTargetObj = { type: 'land', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noTargets', { card: cardToPlay.name }));
          }
        }
        // LÓGICA NUEVA: DESTRUIR PERMANENTE (Piedrazo a la Vidriera / Yuyerío Salvaje)
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_artifact' || cardToPlay.effect.type === 'destroy_enchantment')) {
          const filterType = cardToPlay.effect.type === 'destroy_artifact' ? 'Artefacto' : 'Encantamiento';
          const supportTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
          const combatTargets = cardToPlay.effect.type === 'destroy_artifact'
            ? state.localCombat.filter(c => c.card.type.includes('Artefacto') && isValidBotTarget(c, cardToPlay.colors))
            : [];
          if (combatTargets.length > 0) {
            const best = combatTargets.reduce((prev, cur) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: best };
          } else if (supportTargets.length > 0) {
            aiTargetObj = { type: 'permanent', isLocal: true, item: supportTargets[0] };
          } else {
            validPlay = false;
            logMsg(gameText('bot.cast.noTargets', { card: cardToPlay.name }));
          }
        }
      }

      if (!validPlay) {
        // 601.2e: propuesta ilegal -> rewind completo. En 23.11.3 la carta ni siquiera salió
        // de la mano. Este camino debería ser excepcional porque el pre-flight ya filtró las
        // propuestas conocidas; aun así, el fail-safe SIEMPRE devuelve la prioridad y jamás
        // vuelve a dejar al Tano congelado.
        recordTelemetryEvent('bot_cast_proposal_rejected', { cardId: originalCardToPlay?.id || null, cardName: originalCardToPlay?.name || null, reason: 'late_target_revalidation_failed', phase: state.phase });
        render();
        passPriority('rival');
        return;
      }

      // 601.2f-g-h: recién AHORA la propuesta quedó cerrada. Se retira la carta real de la
      // mano y, desde este punto, se comprometen fuentes/costos y el objeto entra a Stack.
      const committedHandIndex = state.rivalHand.indexOf(originalCardToPlay);
      if (committedHandIndex < 0) {
        recordTelemetryEvent('bot_cast_proposal_rejected', { cardId: originalCardToPlay?.id || null, cardName: originalCardToPlay?.name || null, reason: 'card_missing_before_commit', phase: state.phase });
        passPriority('rival');
        return;
      }
      state.rivalHand.splice(committedHandIndex, 1);

      // 601.2f-g-h: una única ruta para X/no-X; Cost Engine calcula modifiers y los
      // métodos de pago del Tano antes de activar fuentes.
      await payBotCastRoute(cardToPlay,useAlternative,{kicked:botKicked,xValue:botXValue||0});
      if (useAlternative) logMsg(gameText('bot.cast.altPaid', { card: cardToPlay.name }));

      const castStackItem = {
        card: cardToPlay,
        isLocal: false,
        targetObj: aiTargetObj,
        type: stackType,
        xValue: botXValue,
        kicked: botKicked
      };
      addToStack(castStackItem);
      flushDeferredLandManaTriggers();
      await triggerSpellCast(false, cardToPlay, castStackItem);

      // Ward es posterior al casteo. Aún se resuelve como prompt simplificado (no trigger
      // separado en Stack), pero ya no evita que el hechizo haya sido casteado primero.
      if (!tryPayWardForBotTarget(aiTargetObj)) {
        const stackIndex = spellStack.indexOf(castStackItem);
        if (stackIndex >= 0) {
          const [counteredItem] = spellStack.splice(stackIndex,1);
          moveBotCounteredSpell(counteredItem,'ward');
        }
      }

      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(gameText('bot.stack.entered', { card: cardToPlay.name }));
      render();
      return;
    }
  }

  // 3. Fase de Declaración de Atacantes (Turno del Tano)
  if (state.activePlayer === 'rival' && state.phase === 'combat_attackers') {
    // 23.7.1: si ya declaró atacantes y recupera prioridad en este mismo paso después de
    // resolver un trigger, no vuelve a declarar ni a disparar anyCreatureAttacks.
    if ((state.rivalAttackersDeclaredThisTurn || 0) > 0) {
      passPriority('rival');
      return;
    }

    const attackLockFor = (unit) => (state.activeEffects || []).find(effect =>
      effect.effectType === 'cant_attack_next_turn' &&
      effect.targetPlayer === 'rival' &&
      effect.appliesThisCombat === true &&
      effect.targetObjectId && effect.targetObjectId === unit._effectObjectId
    );

    // Combat Bot 2.0 sólo mira información pública: battlefield + vidas + keywords.
    // No inspecciona mano ni biblioteca humanas para decidir atacantes.
    let hardAttackIndexes = null;
    let hardAttackPlan = null;
    const eligibleAttackers=state.rivalCombat
      .map((unit,index)=>({unit,index}))
      .filter(({unit})=>!hasKeyword(unit,'defender') && !unit.tapped && !unit.summoningSickness && !attackLockFor(unit));
    const publicDefenders=state.localCombat
      .map((unit,index)=>({unit,index}))
      .filter(({unit})=>!unit.tapped);
    const hardCombat=botHasCapability(state.botDifficulty, 'combat2');
    // 23.19.4.6 — Medio conserva su identidad, pero en boards anchos deja de evaluar cada
    // atacante contra el MISMO mejor bloqueador imaginario. Cuando hay más atacantes que
    // bloqueadores usa el evaluador global público sólo para capturar saturación real.
    const mediumWideBoard=!hardCombat && normalizeBotDifficulty(state.botDifficulty)==='medium'
      && eligibleAttackers.length>publicDefenders.length && eligibleAttackers.length>=3;
    if (hardCombat || mediumWideBoard) {
      hardAttackPlan=chooseHardAttackPlan({
        eligibleAttackers, defenders:publicDefenders,
        botLife:state.rivalHP, opponentLife:state.localHP,
        helpers:{ getPower:getEffectivePower, getToughness:getEffectiveToughness, hasKeyword, canBlock, predictDuel }
      });
      hardAttackIndexes=new Set(hardAttackPlan.indexes);
      const telemetry={
        version:hardCombat?COMBAT_BOT_2_VERSION:'23.19.4.6-medium-wide', utility:hardAttackPlan.utility, expectedDamage:hardAttackPlan.damage,
        attackPower:hardAttackPlan.attackPower || 0, crackBack:hardAttackPlan.crackBack || 0,
        attackerCount:hardAttackPlan.indexes.length, eligibleAttackers:eligibleAttackers.length, defenders:publicDefenders.length, reason:hardAttackPlan.reason
      };
      if (hardCombat) recordTelemetryEvent('bot_combat2_attack_plan',telemetry);
      else recordTelemetryEvent('bot_attack_plan',telemetry);
    }

    let attackCount = 0;
    let heldBackCount = 0;
    const declaredAttackers = [];
    for (let unitIndex=0; unitIndex<state.rivalCombat.length; unitIndex++) {
      const unit=state.rivalCombat[unitIndex];
      if (hasKeyword(unit, 'defender')) continue;
      const attackLock = attackLockFor(unit);
      if (attackLock) {
        logMsg(gameText('bot.attackLocked', { card: unit.card.name, source: attackLock.sourceName || 'un efecto' }));
        continue;
      }

      if (!unit.tapped && !unit.summoningSickness) {
        const shouldAttack = hardAttackIndexes ? hardAttackIndexes.has(unitIndex) : shouldRivalAttackWith(unit);
        if (shouldAttack) {
          unit.isAttacking = true;
          // Si Combat 2.0 encontró lethal esperado, no desvía daño a un Planeswalker.
          unit.attackTarget = chooseBotAttackTarget(unit, { forceFace: !!hardAttackPlan && hardAttackPlan.damage >= state.localHP });
          declaredAttackers.push(unit);
          attackCount++;
          if (unit.attackTarget) {
            logMsg(gameText('bot.attack.planeswalker', { card: unit.card.name, target: unit.attackTarget.card.name }));
          }
        } else {
          heldBackCount++;
        }
      }
    }

    if (hardAttackPlan) logMsg(gameText('bot.attack.combat2', { count:attackCount }));
    if (heldBackCount > 0) logMsg(gameText('bot.attack.heldBack', { count: heldBackCount }));
    if (attackCount > 0) {
      queueDeclaredAttackTriggers(declaredAttackers, false);
      logMsg(gameText('bot.attack.count', { count: attackCount }));
    }
    else logMsg(gameText('bot.noAttack'));
    state.rivalAttackersDeclaredThisTurn = attackCount;
    
    render();
    passPriority('rival'); // Termina de declarar atacantes
    return;
  }

  // 4. Fase de Declaración de Bloqueadores (Tu Turno)
  if (state.activePlayer === 'local' && state.phase === 'combat_blockers') {
    // 23.9.3: la declaración del Tano también es idempotente si bloqueó CERO criaturas.
    // Inferirlo mirando blockingIndex fallaba exactamente en ese caso.
    if (!state.rivalBlockersDeclaredThisCombat) {
      assignBotBlockers(); // Llama a la lógica inteligente de combate
      markDeclaredBlocks(state.localCombat, state.rivalCombat);
      state.rivalBlockersDeclaredThisCombat = true;
      recordTelemetryEvent('blockers_declared', {
        player: 'rival', turnCount: state.turnCount, activePlayer: state.activePlayer, phase: state.phase,
        blockerCount: state.rivalCombat.filter(unit => unit.blockingIndex !== null && unit.blockingIndex !== undefined).length
      });
      queueDeclaredBlockTriggers(state.rivalCombat, false);

      // 23.13.39 — declarar bloqueadores NO es un pase de prioridad. 23.13.38 heredaba el
      // pase que el atacante había hecho para cederle el control al bot; el passPriority
      // de abajo se convertía entonces en el segundo pase y saltaba directo al daño.
      // Toda declaración (incluso 0 bloqueadores) abre una ventana NUEVA y empieza por el
      // jugador activo. Esto además garantiza que el Combat Map tenga una ventana real.
      beginActivePlayerPriorityWindow();
      return;
    }

    // Los trucos post-bloqueo del Tano ocurren recién cuando RECIBE prioridad en esa nueva
    // ventana, después de que el atacante haya podido responder a la declaración.
    if (state.priorityPlayer === 'rival') {
      if (await tryBotPostBlockTrick()) return;
      passPriority('rival');
    }
    return;
  }

  // 5. Si no hizo nada de lo anterior, pasa prioridad
  passPriority('rival');
}
