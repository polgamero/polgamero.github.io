import { sleep, moveBattlefieldCardToZone, moveCounteredStackItemToDestination, getProliferateCandidates } from './utils.js';
import { isLandPermanent, isCreaturePermanent, isNonbasicLandPermanent, landMatchesFilter } from './permanentTypes.js';
import { landMatchesEffectiveFilter } from './landCharacteristics.js';
import { normalizeLandGraveyardReturnEffect, landGraveyardFilterMatches } from './landGraveyard.js';
import { state, resumeAfterInteractiveEffect, attachAura, cancelPayment, detachEquipmentFrom, sendAurasToGraveyard, queueTriggeredAbility, queueTriggeredAbilities, buildGenericEventTriggerEntries, triggerCreatureEtb, triggerLandEtb, triggerSpellCast, triggerCreatureDies, triggerAnyCreatureDeath, queueCreatureDeathBatch, getEffectivePower, getEffectiveToughness, performSacrifice, performSacrificeBatch, getSacrificeEffectCandidates, chooseGraveyardCards, chooseResolvedEffectTarget, addCounters, cleanupIfVehicle, animateLandPermanent, tryAutoPayCounterTax, checkPlaneswalkerDeaths, isHiddenRivalZone, getRivalName, requestRivalDecision, discardCardsFromHand, waitForDiscardEffects, isResolvedEffectTargetLegal, completeCastTargetDeclaration, requestPrivateZoneChoice, searchLibraryForLands, landEntersTappedForBattlefield, runStateBasedActions, waitForStateBasedActions, changePermanentController, dispatchGameEvent } from './main.js';
import { otherRole, serializeStackTarget, refreshStackItemBoardRefs } from './matchSync.js';
import { stampCardOwner, zoneForCardOwner, cardOwnerIsLocal } from './zoneOwnership.js';
import { stampPermanentController } from './controlEngine.js';
import { logMsg, render, createCardElement, showScrySurveilModal, showProliferateModal, showHandFilterDiscardModal, showSacrificeEffectModal } from './ui.js';
import { checkDeaths, checkAllDeaths } from './combatRules.js';
import { hasKeyword, getProtectionMatch } from './keywords.js';

const COLOR_LABELS = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde' };
import { passPriority, checkGameOver, resetPriorityClock } from './turnManager.js';
import { recordTelemetryEvent } from './telemetry.js';
import { gameText } from './gameTexts.js';
import { resolveReplacementEvent } from './replacementEngine.js';


function replacementDamageAmount({ amount, targetItem = null, targetIsLocal, sourceCard = null, sourceIsLocal = true, combat = false, cause = 'effect' }) {
  const result = resolveReplacementEvent(state, {
    type:'damage', amount:Math.max(0,Number(amount)||0),
    affectedIsLocal:!!targetIsLocal, targetIsLocal:!!targetIsLocal,
    card:targetItem?.card || null, targetCard:targetItem?.card || null,
    item:targetItem, targetItem, sourceCard,
    sourceIsLocal:!!sourceIsLocal, combat:!!combat, cause
  });
  return { amount:Math.max(0,Number(result.event.amount)||0), result };
}

function replacementDestroyOutcome(targetItem, targetIsLocal, sourceCard, sourceIsLocal, cause='destroy') {
  const destroyResult=resolveReplacementEvent(state, {
    type:'destroy', affectedIsLocal:!!targetIsLocal, targetIsLocal:!!targetIsLocal,
    card:targetItem?.card || null, targetCard:targetItem?.card || null,
    item:targetItem, targetItem, sourceCard,
    sourceIsLocal:!!sourceIsLocal, zoneFrom:'battlefield', zoneTo:'graveyard', cause
  });
  if(destroyResult.prevented) return destroyResult;
  const zoneResult=resolveReplacementEvent(state, {
    ...destroyResult.event, type:'zone_change', zoneFrom:'battlefield', zoneTo:destroyResult.event.zoneTo || 'graveyard', cause
  });
  return { ...zoneResult, applied:[...(destroyResult.applied||[]),...(zoneResult.applied||[])], changed:destroyResult.changed||zoneResult.changed };
}

function ownerDestinationZone(card, fallbackIsLocal, zoneTo='graveyard') {
  if (zoneTo === 'exile') return zoneForCardOwner(card, state.localExile, state.rivalExile, fallbackIsLocal, state.currentMatch?.myRole || null);
  return zoneForCardOwner(card, state.localGraveyard, state.rivalGraveyard, fallbackIsLocal, state.currentMatch?.myRole || null);
}

function replacementCardZoneOutcome(card, fallbackIsLocal, zoneFrom, zoneTo='graveyard', cause='effect', extra={}) {
  const ownerIsLocal=cardOwnerIsLocal(card,!!fallbackIsLocal,state.currentMatch?.myRole||null);
  const result=resolveReplacementEvent(state,{
    type:'zone_change',affectedIsLocal:ownerIsLocal,targetIsLocal:ownerIsLocal,
    card,targetCard:card,item:extra.item||null,targetItem:extra.item||null,
    sourceCard:extra.sourceCard||null,sourceIsLocal:extra.sourceIsLocal,
    zoneFrom,zoneTo,cause
  });
  const finalZone=result.event.zoneTo || zoneTo;
  return {result,zoneTo:finalZone,ownerIsLocal,destination:ownerDestinationZone(card,fallbackIsLocal,finalZone)};
}

function moveResolvedSpellCard(card, item, isLocal) {
  if(item?.castFrom==='flashback') {
    ownerDestinationZone(card,isLocal,'exile').push(card);
    dispatchGameEvent({type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(card,isLocal,state.currentMatch?.myRole||null),card,zoneFrom:'stack',zoneTo:'exile',cause:'flashback'});
    logMsg(gameText('flashback.exileAfterResolve',{card:card.name}));
    return 'exile';
  }
  const plan=replacementCardZoneOutcome(card,isLocal,'stack','graveyard','resolved',{item,sourceCard:card,sourceIsLocal:isLocal});
  plan.destination.push(card);
  if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'stack',zoneTo:'exile',cause:'resolved'});
  return plan.zoneTo;
}

function logReplacementPrevented(kind, targetName) {
  logMsg(gameText(kind === 'destroy' ? 'replacement.destroy.prevented' : 'replacement.damage.prevented', { target: targetName || 'objetivo' }));
}

// A qué le puede apuntar cada variante de "contrarrestar" — regla real de MTG (702.61 y
// glosario de counterspells): un counterspell normal SOLO frena HECHIZOS en la pila, nunca
// habilidades activadas ni disparadas, a menos que la carta lo diga explícitamente (como
// Stifle/Tale's End, que hacen lo contrario — solo habilidades — o Disallow, que hace las
// dos cosas). Antes esto no se chequeaba en ningún lado: cualquier counter servía contra
// cualquier cosa en la pila, hechizo o habilidad, indistinto.
export function getCounterTargetRestriction(effectType) {
  if (effectType === 'counter_ability') return { allowSpell: false, allowAbility: true };
  if (effectType === 'counter_any') return { allowSpell: true, allowAbility: true };
  // counter, counter_creature, counter_non_creature, counter_instant, counter_unless_pay: solo hechizos.
  return { allowSpell: true, allowAbility: false };
}

export function isStackItemLegalCounterTarget(effectType, item) {
  if (!effectType || !item) return false;
  const isAbility = item.type === 'ability';
  const restriction = getCounterTargetRestriction(effectType);
  if (isAbility) return !!restriction.allowAbility;
  if (!restriction.allowSpell) return false;

  const isCreatureSpell = item.type === 'summon' || item.card?.power !== undefined || item.card?.type?.includes('Criatura');
  const isInstantSpell = item.type === 'instant' || item.card?.type?.includes('Instantáneo');
  if (effectType === 'counter_creature') return !!isCreatureSpell;
  if (effectType === 'counter_non_creature') return !isCreatureSpell;
  if (effectType === 'counter_instant') return !!isInstantSpell;
  return true;
}

// Sustituye el valor de X en un efecto, en TODOS los campos donde podría aparecer como
// texto literal "X" — no solo `amount` (daño/cura/robar), sino también `powerMod`/
// `toughnessMod` (un bufo con X, ej. "+X/+X hasta el final del turno"). Antes solo se
// chequeaba `amount`, así que un pump con X nunca se resolvía bien.
function resolveXInEffect(effect, xValue) {
  if (!effect) return effect;
  const resolved = { ...effect };
  ['amount', 'powerMod', 'toughnessMod', 'lifeLoss'].forEach(key => {
    if (resolved[key] === 'X') resolved[key] = xValue;
  });
  return resolved;
}

export const spellStack = [];
let nextStackId = 1;
let nextEffectId = 1;
let nextEffectObjectId = 1;

function ensureEffectObjectId(unit) {
  if (!unit || typeof unit !== 'object') return null;
  if (!unit._effectObjectId) {
    unit._effectObjectId = `fxobj_${Date.now().toString(36)}_${(nextEffectObjectId++).toString(36)}`;
  }
  return unit._effectObjectId;
}

// ENTREGA 23.6 — la Stack es estado público compartido en multiplayer. `spellStack`
// conserva la MISMA referencia de array porque otros módulos la importan directamente;
// por eso el sync reemplaza su contenido con splice en vez de reasignarla. Al recibir IDs
// remotos adelantamos el contador local para que la próxima respuesta nunca reutilice un ID.
export function replaceSpellStackFromSync(items = []) {
  const incoming = Array.isArray(items) ? items : [];
  spellStack.splice(0, spellStack.length, ...incoming);
  const numericIds = incoming.map(item => Number(item?.id)).filter(Number.isFinite);
  if (numericIds.length) nextStackId = Math.max(nextStackId, Math.max(...numericIds) + 1);
}


// Punto 4: Loot/Rummage puede aparecer en varios triggers directos que históricamente no
// esperan Promises. Serializamos el EFECTO ENTERO (no sólo el modal) para conservar el orden
// semántico: dos Loot simultáneos deben hacer "robar->descartar" uno completo y recién luego
// el siguiente, nunca robar dos veces antes de mostrar el primer descarte.
let cardFilterResolutionChain = Promise.resolve();

function enqueueCardFilterResolution(task) {
  state.resolvingCardFilterEffects = (state.resolvingCardFilterEffects || 0) + 1;
  render();
  const run = cardFilterResolutionChain.then(task, task);
  cardFilterResolutionChain = run.catch(() => {});
  return run.finally(() => {
    state.resolvingCardFilterEffects = Math.max(0, (state.resolvingCardFilterEffects || 1) - 1);
    if (state.resolvingCardFilterEffects === 0) render();
  });
}

// Punto 5: igual que Loot/Rummage, un sacrificio puede nacer de varios triggers directos
// que históricamente no esperan Promises. La cola serializa cada INSTRUCCIÓN completa:
// nunca abre dos modales de sacrificio simultáneos y los triggers de muerte de la primera
// instrucción pueden encolar otra detrás sin reentrar el resolver a mitad del evento.
let sacrificeResolutionChain = Promise.resolve();

function enqueueSacrificeResolution(task) {
  state.resolvingSacrificeEffects = (state.resolvingSacrificeEffects || 0) + 1;
  render();
  const run = sacrificeResolutionChain.then(task, task);
  sacrificeResolutionChain = run.catch(() => {});
  return run.finally(() => {
    state.resolvingSacrificeEffects = Math.max(0, (state.resolvingSacrificeEffects || 1) - 1);
    if (state.resolvingSacrificeEffects === 0) render();
  });
}



export function getTriggerProvenance(item) {
  if (!item || item.abilityKind !== 'triggered') return '';
  const triggerType = item.triggerType || item.source?.triggerType || '';
  const eventCard = item.source?.eventCard || null;
  const name = eventCard?.name || '';
  switch (triggerType) {
    case 'dies':
    case 'any_creature_dies':
    case 'opponent_death':
      return name ? `Murió ${name}` : 'Murió una criatura';
    case 'creature_etb':
      return name ? `Entró ${name}` : 'Entró una criatura';
    case 'etb':
    case 'reanimate_etb':
    case 'return_etb':
      return name ? `Entró ${name}` : 'La fuente entró al campo';
    case 'land_etb':
      return name ? `Entró la tierra ${name}` : 'Entró una tierra';
    case 'spell_cast':
      return name ? `Se lanzó ${name}` : 'Se lanzó un hechizo';
    case 'attack':
    case 'any_creature_attacks':
      return name ? `Atacó ${name}` : 'Atacó una criatura';
    case 'block':
      return name ? `Bloqueó ${name}` : 'Se declaró un bloqueo';
    case 'combat_damage':
      return name ? `${name} hizo daño de combate` : 'Se hizo daño de combate';
    case 'upkeep':
      return 'Comenzó el mantenimiento';
    case 'end_step':
      return 'Comenzó el paso final';
    default:
      return name ? `Evento: ${name}` : '';
  }
}

export function addToStack(item) {
  item.id = nextStackId++;
  spellStack.push(item);
  const triggerProvenance = getTriggerProvenance(item);
  recordTelemetryEvent('stack_push', {
    stackId: item.id,
    type: item.type || null,
    abilityKind: item.abilityKind || null,
    triggerType: item.triggerType || null,
    triggerProvenance: triggerProvenance || null,
    eventCard: item.source?.eventCard ? { id: item.source.eventCard.id ?? null, name: item.source.eventCard.name ?? null } : null,
    card: { id: item.card?.id ?? null, name: item.card?.name ?? null },
    isLocal: item.isLocal ?? null,
    stackDepth: spellStack.length
  });
  if (item.abilityKind === 'triggered') {
    const label = item.triggerLabel ? ` — ${item.triggerLabel}` : '';
    const provenance = triggerProvenance ? ` · ${triggerProvenance}` : '';
    logMsg(gameText('stack.add.trigger', { card: item.card.name, label, provenance, id: item.id }));
  } else if (item.abilityKind === 'loyalty') {
    logMsg(gameText('stack.add.loyalty', { card: item.card.name, ability: item.ability?.name || 'Loyalty', id: item.id }));
  } else {
    logMsg(gameText('stack.add.spell', { card: item.card.name, id: item.id }));
  }
  if (state.currentMatch && item.isLocal) resetPriorityClock('stack_push');
  renderStack();
}

export async function resolveTopStackItem() {
  if (spellStack.length === 0) return;

  const item = spellStack.pop();
  if (state.currentMatch?.myRole) refreshStackItemBoardRefs(item, state, state.currentMatch.myRole);
  const telemetryStartedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  recordTelemetryEvent('stack_resolve_start', {
    stackId: item.id ?? null,
    type: item.type || null,
    abilityKind: item.abilityKind || null,
    card: { id: item.card?.id ?? null, name: item.card?.name ?? null },
    stackDepthAfterPop: spellStack.length
  });
  logMsg(gameText('stack.resolve', { card: item.card.name }));
  
  await executeStackItem(item);
  await runStateBasedActions({ reason:'stack_item_resolved' });
  await waitForStateBasedActions();

  // Si el efecto BASE abrió una decisión asíncrona, el bonus de Kicker debe esperar.
  // Guardamos una continuación explícita porque este objeto YA fue retirado de la Stack:
  // un simple `return` antes del bonus lo perdería para siempre.
  const basePendingInteractive = state.pendingCounterUnlessPay || state.pendingScrySurveilChoice || state.pendingProliferateChoice;
  if (basePendingInteractive && item.kicked && item.card.kicker?.bonusEffect) {
    state.pendingKickerResolutionContinuation = {
      card:item.card, isLocal:item.isLocal, bonusEffect:item.card.kicker.bonusEffect,
      xValue:item.xValue || 0, stackItem:item
    };
  }

  // Kicker: si no hay una decisión base pendiente, el bonus se aplica ahora. Si la hay,
  // resumeAfterInteractiveEffect() ejecutará exactamente este bonus cuando termine.
  if (!basePendingInteractive && item.kicked && item.card.kicker?.bonusEffect) {
    logMsg(gameText('stack.kickerBonus', { card: item.card.name }));
    await resolveGameEffect(item.card.kicker.bonusEffect, {
      sourceCard: item.card, isLocal: item.isLocal, targetObj: null, stackItem: item, xValue: item.xValue || 0
    });
    await runStateBasedActions({ reason:'kicker_bonus_resolved' });
    await waitForStateBasedActions();
  }

  // Si quedó pausado esperando que alguien decida pagar "contrarresta a menos que...", no
  // terminamos de resolver todavía — la prioridad NO se resetea hasta que se decida
  // (payCounterTax / declineCounterTax hacen eso ellos mismos al terminar).
  if (state.pendingCounterUnlessPay) {
    recordTelemetryEvent('stack_resolve_paused', { stackId: item.id ?? null, card: item.card?.name ?? null, reason: 'pendingCounterUnlessPay' });
    return;
  }

  // BUG ENCONTRADO Y ARREGLADO: Scry/Surveil abría el modal para elegir qué hacer con las
  // cartas, pero nunca pausaba el resto del juego — la prioridad se reseteaba igual y el
  // Tano podía tomar otra acción mientras el humano todavía estaba decidiendo, chocando
  // contra un estado a medio terminar y rompiendo el juego. Mismo criterio que el pago de
  // Ward/CounterTax: no seguimos hasta que se resuelva (finishScrySurveil en main.js hace
  // el reseteo de prioridad ella misma al terminar).
  if (state.pendingScrySurveilChoice) {
    recordTelemetryEvent('stack_resolve_paused', { stackId: item.id ?? null, card: item.card?.name ?? null, reason: 'pendingScrySurveilChoice' });
    return;
  }

  // Mismo criterio: Proliferar abre su propio modal (elegir permanentes) y no puede seguir
  // de largo hasta que se confirme — finishProliferate en main.js resetea la prioridad ella
  // misma al terminar.
  if (state.pendingProliferateChoice) {
    recordTelemetryEvent('stack_resolve_paused', { stackId: item.id ?? null, card: item.card?.name ?? null, reason: 'pendingProliferateChoice' });
    return;
  }

  // Punto 8: barrera defensiva para cualquier cadena de descarte interactivo iniciada por
  // el objeto que acaba de resolverse. Con Trigger Stack los disparos ya no resuelven de
  // costado, pero mantenemos la garantía de no devolver prioridad con un descarte a medias.
  await waitForDiscardEffects();

  // Tras resolver un objeto, la prioridad vuelve al jugador activo
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  resetPriorityClock('stack_resolved');

  const telemetryEndedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  recordTelemetryEvent('stack_resolve_end', {
    stackId: item.id ?? null,
    card: item.card?.name ?? null,
    durationMs: Math.round(telemetryEndedAt - telemetryStartedAt),
    stackDepth: spellStack.length,
    priorityPlayer: state.priorityPlayer
  });

  renderStack();
  
  if (typeof render === 'function') {
    render();
  }
}

// Aplica UN efecto a UN target puntual (criatura o jugador) — extraído para reusarlo en
// objetivos múltiples, donde cada target de la carta tiene su propio efecto. Replica
// exactamente los mismos pasos que ya usa la resolución de un target único (girar
// Indestructible, sacar Equipos/Auras, avisar Vehículos) para no tener dos reglas
// distintas para lo mismo.
// La antigua applyEffectToSingleTarget fue absorbida por resolveGameEffect.
// Esto evita mantener dos implementaciones distintas de daño/remoción/targets.



// ---------------------------------------------------------------------------
// RESOLVER UNIVERSAL DE EFECTOS — Punto 1 pre-500
// ---------------------------------------------------------------------------
// Esta función contiene el vocabulario SIN objetivo que antes vivía en main.js.
// No cambia ningún JSON: draw/heal/damage/drain/discard/scry/surveil/proliferate, etc.
// conservan exactamente su estructura y comportamiento.
function chooseBotCardFilterDiscardIndexes(hand, count) {
  // Heurística deliberadamente simple: en Difícil prioriza soltar tierras sobrantes y luego
  // las cartas más caras; en Fácil elige slots al azar. La REGLA del efecto es la misma en
  // ambos casos, sólo cambia la calidad de la decisión.
  const wanted = Math.min(count, hand.length);
  if (wanted <= 0) return [];
  if (state.botDifficulty === 'easy') {
    const pool = hand.map((_, i) => i);
    const chosen = [];
    while (chosen.length < wanted && pool.length > 0) {
      const pick = Math.floor(Math.random() * pool.length);
      chosen.push(pool.splice(pick, 1)[0]);
    }
    return chosen;
  }

  const landCount = hand.filter(c => c && c.type && c.type.includes('Tierra')).length;
  return hand.map((card, index) => {
    const isLand = !!(card && card.type && card.type.includes('Tierra'));
    const extraLandBonus = isLand && landCount > 4 ? 100 : 0;
    return { index, score: extraLandBonus + (card?.cmc || 0) };
  }).sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, wanted)
    .map(x => x.index);
}

async function resolveCardFilterEffect(effect, cardName, isLocal) {
  return enqueueCardFilterResolution(async () => {
    const amount = Math.max(0, Math.floor(Number(effect.amount ?? 1)));
    if (amount === 0) return;

    // En multiplayer, la mano/mazo del rival son privados. Si por cualquier camino este
    // cliente tiene que resolver un Loot/Rummage controlado por el rival, no toca placeholders:
    // le pide al cliente dueño que ejecute el efecto completo sobre sus zonas reales.
    if (isHiddenRivalZone(isLocal)) {
      const rivalRole = otherRole(state.currentMatch.myRole);
      await requestRivalDecision('self_card_filter', rivalRole, {
        filterType: effect.type,
        amount,
        cardName
      });
      logMsg(gameText('effect.lootRemote', { card: cardName, rival: getRivalName(), kind: effect.type === 'loot' ? 'Loot' : 'Rummage' }));
      return;
    }

    const hand = isLocal ? state.localHand : state.rivalHand;
    const deck = isLocal ? state.localDeck : state.rivalDeck;
    const grave = isLocal ? state.localGraveyard : state.rivalGraveyard;
    const who = isLocal ? 'Vos' : getRivalName();

    const drawAmount = () => {
      let drawn = 0;
      for (let i = 0; i < amount; i++) {
        if (deck.length === 0) break;
        const drawnCard=deck.pop();
        hand.push(drawnCard);
        drawn++;
        dispatchGameEvent({ type:'card_drawn', controllerIsLocal:isLocal, actorIsLocal:isLocal, ownerIsLocal:isLocal, card:drawnCard, zoneFrom:'library', zoneTo:'hand', cause:effect.type });
      }
      return drawn;
    };

    const discardAmount = async () => {
      const needed = Math.min(amount, hand.length);
      if (needed <= 0) return [];

      let indexes;
      if (isLocal) {
        state.pendingHandFilterChoice = { cardName, mode: effect.type, amount: needed };
        render();
        try {
          const handSnapshot = [...hand];
          indexes = await new Promise(resolve =>
            showHandFilterDiscardModal(handSnapshot, needed, cardName, effect.type, resolve)
          );
        } finally {
          state.pendingHandFilterChoice = null;
        }
      } else {
        indexes = chooseBotCardFilterDiscardIndexes(hand, needed);
      }

      // Los índices pertenecen al snapshot de la mano. Sacamos de mayor a menor para no
      // desplazar los slots restantes. Esto además permite descartar dos copias idénticas.
      const discarded = [];
      [...new Set(indexes)]
        .filter(i => Number.isInteger(i) && i >= 0 && i < hand.length)
        .sort((a, b) => b - a)
        .forEach(i => {
          const card = hand.splice(i, 1)[0];
          if (card) {
            grave.push(card);
            discarded.push(card);
          }
        });
      discarded.reverse();
      return discarded;
    };

    let drawn = 0;
    let discarded = [];
    if (effect.type === 'loot') {
      drawn = drawAmount();
      discarded = await discardAmount();
    } else {
      discarded = await discardAmount();
      drawn = drawAmount();
    }

    const names = discarded.map(c => c.name).join(', ');
    const orderText = effect.type === 'loot' ? 'robó y luego descartó' : 'descartó y luego robó';
    logMsg(gameText('effect.lootSummary', { card: cardName, who, order: orderText, drawn, discarded: discarded.length, names: names ? ` (${names})` : '' }));
    render();
  });
}

function chooseBotSacrificeCandidates(candidates, count, permanentType) {
  const pool = [...candidates];
  if (state.botDifficulty === 'easy') {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  const score = item => {
    const cmc = Number(item.card.cmc || 0);
    if (permanentType === 'creature') {
      return getEffectivePower(item) + getEffectiveToughness(item) + cmc * 0.35;
    }
    return cmc;
  };
  return pool.sort((a, b) => score(a) - score(b)).slice(0, count);
}

async function resolveSacrificeEffect(effect, cardName, sourceIsLocal) {
  return enqueueSacrificeResolution(async () => {
    const target = effect.target;
    let victimIsLocal;
    let permanentType;

    if (target === 'own_creature') {
      victimIsLocal = sourceIsLocal; permanentType = 'creature';
    } else if (target === 'own_artifact') {
      victimIsLocal = sourceIsLocal; permanentType = 'artifact';
    } else if (target === 'opponent_creature') {
      victimIsLocal = !sourceIsLocal; permanentType = 'creature';
    } else {
      logMsg(`⚠️ ${cardName}: sacrifice usa target desconocido "${target}".`);
      return [];
    }

    const parsedAmount = Number(effect.amount ?? 1);
    const amount = Number.isFinite(parsedAmount) ? Math.max(1, Math.floor(parsedAmount)) : 1;

    if (isHiddenRivalZone(victimIsLocal)) {
      const rivalRole = otherRole(state.currentMatch.myRole);
      const response = await requestRivalDecision('self_sacrifice', rivalRole, {
        amount, permanentType, cardName
      });
      const names = response.sacrificedNames || [];
      logMsg(names.length > 0
        ? gameText('effect.sacrifice.remoteDone', { card: cardName, rival: getRivalName(), cards: names.join(', ') })
        : gameText('effect.sacrifice.remoteNone', { card: cardName, rival: getRivalName(), kind: permanentType === 'creature' ? 'criaturas' : 'artefactos' }));
      return names;
    }

    const candidates = getSacrificeEffectCandidates(victimIsLocal, permanentType);
    const count = Math.min(amount, candidates.length);
    if (count === 0) {
      logMsg(gameText('effect.sacrifice.none', { card: cardName, kind: permanentType === 'creature' ? 'criaturas' : 'artefactos' }));
      return [];
    }

    let chosen;
    if (victimIsLocal) {
      state.pendingSacrificeEffectChoice = { permanentType, amount: count, cardName };
      render();
      chosen = await new Promise(resolve => {
        showSacrificeEffectModal(candidates, count, cardName, permanentType, selected => {
          state.pendingSacrificeEffectChoice = null;
          render();
          resolve(selected);
        });
      });
    } else {
      chosen = chooseBotSacrificeCandidates(candidates, count, permanentType);
    }

    const removed = performSacrificeBatch(chosen, victimIsLocal);
    if (removed.length > 0) {
      const who = victimIsLocal ? 'Vos' : getRivalName();
      logMsg(gameText('effect.sacrifice.done', { card: cardName, who, verb: victimIsLocal ? 'sacrificaste' : 'sacrificó', cards: removed.map(item => item.card.name).join(', ') }));
    }
    return removed;
  });
}

async function resolveSimpleDirectEffect(effect, sourceCard, isLocal) {
  if(!effect) return;
  const card = (sourceCard && typeof sourceCard === 'object') ? sourceCard : { name:String(sourceCard || 'Efecto'), colors:[] };
  const cardName = card.name || 'Efecto';
  const targetName = isLocal ? "vos" : getRivalName();
  if (effect.type === 'draw') {
    for(let i=0; i<effect.amount; i++) {
      const deck=isLocal?state.localDeck:state.rivalDeck, hand=isLocal?state.localHand:state.rivalHand;
      if(deck.length > 0){ const drawnCard=deck.pop(); hand.push(drawnCard); dispatchGameEvent({type:'card_drawn',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card:drawnCard,zoneFrom:'library',zoneTo:'hand',cause:'effect'}); }
    }
    logMsg(gameText('effect.drawExtra', { card: cardName, target: targetName, amount: effect.amount }));
  } else if (effect.type === 'loot' || effect.type === 'rummage') {
    await resolveCardFilterEffect(effect, cardName, isLocal);
  } else if (effect.type === 'sacrifice') {
    await resolveSacrificeEffect(effect, cardName, isLocal);
  } else if (effect.type === 'heal') {
    if (isLocal) state.localHP += effect.amount; else state.rivalHP += effect.amount;
    dispatchGameEvent({type:'life_gained',controllerIsLocal:isLocal,actorIsLocal:isLocal,amount:effect.amount,cause:'effect'});
    logMsg(gameText('effect.heal', { card: cardName, target: targetName, amount: effect.amount }));
  } else if (effect.type === 'damage') {
    // Pool Expansion I: el daño sin target (p. ej. triggers declarativos tipo Prowess/Alarma)
    // pasa por el MISMO pipeline Replacement/Prevention que el daño dirigido. Antes esta
    // ruta restaba HP directo y podía ignorar shields/prevention estáticos.
    const victimIsLocal=!isLocal;
    const damage = replacementDamageAmount({ amount:effect.amount, targetIsLocal:victimIsLocal, sourceCard:card, sourceIsLocal:isLocal, combat:false, cause:'spell_or_ability' });
    if (damage.amount <= 0) {
      logReplacementPrevented('damage', victimIsLocal ? 'vos' : getRivalName());
    } else {
      if (isLocal) state.rivalHP -= damage.amount; else state.localHP -= damage.amount;
      dispatchGameEvent({type:'life_lost',controllerIsLocal:victimIsLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetPlayerIsLocal:victimIsLocal,sourceCard:card,amount:damage.amount,cause:'damage'});
      dispatchGameEvent({type:'damage_dealt',controllerIsLocal:victimIsLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetPlayerIsLocal:victimIsLocal,sourceCard:card,amount:damage.amount,cause:'spell_or_ability'});
      logMsg(gameText('effect.damage', { card: cardName, target: victimIsLocal ? 'vos' : getRivalName(), amount: damage.amount }));
    }
  } else if (effect.type === 'fog') {
    state.combatDamagePrevented = true;
    logMsg(gameText('effect.fog', { card: cardName }));
  } else if (effect.type === 'draw_and_lose_life') {
    // El vocabulario ya declaraba `amount`, pero históricamente esta rama robaba sólo una
    // carta porque todas las cartas legacy tenían amount=1. Pool Expansion I estrena amount=2.
    const deck=isLocal?state.localDeck:state.rivalDeck, hand=isLocal?state.localHand:state.rivalHand;
    const drawAmount=Math.max(0,Math.floor(Number(effect.amount ?? 1)||0));
    for(let i=0;i<drawAmount;i++){
      if(deck.length<=0) break;
      const drawnCard=deck.pop(); hand.push(drawnCard);
      dispatchGameEvent({type:'card_drawn',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card:drawnCard,zoneFrom:'library',zoneTo:'hand',cause:'effect'});
    }
    const lifeLoss=Math.max(0,Number(effect.lifeLoss ?? effect.amount ?? 1)||0);
    if (isLocal) state.localHP -= lifeLoss; else state.rivalHP -= lifeLoss;
    if(lifeLoss>0) dispatchGameEvent({type:'life_lost',controllerIsLocal:isLocal,actorIsLocal:isLocal,amount:lifeLoss,cause:'effect'});
    logMsg(gameText('effect.drawLoseLife', { card: cardName, target: targetName, life: lifeLoss }));
  } else if (effect.type === 'drain') {
    // Genérico para cualquier disparador (diesTrigger, upkeepTrigger, etc.), no solo los
    // dos casos de muerte que ya tenían su propio código a mano.
    if (isLocal) { state.rivalHP -= effect.amount; state.localHP += effect.amount; }
    else { state.localHP -= effect.amount; state.rivalHP += effect.amount; }
    dispatchGameEvent({type:'life_lost',controllerIsLocal:!isLocal,actorIsLocal:isLocal,amount:effect.amount,cause:'drain'});
    dispatchGameEvent({type:'life_gained',controllerIsLocal:isLocal,actorIsLocal:isLocal,amount:effect.amount,cause:'drain'});
    logMsg(gameText('effect.drain', { card: cardName, amount: effect.amount }));
  } else if (effect.type === 'discard') {
    // Punto 8: descarte sin target explícito (ETB/trigger) afecta al oponente del
    // controlador, pero QUIEN elige qué cartas soltar es el jugador afectado. `selection`
    // permite reservar la variante explícitamente aleatoria para cartas futuras.
    const victimIsLocal = !isLocal;
    const opponentName = victimIsLocal ? 'vos' : getRivalName();
    const result = await discardCardsFromHand({
      victimIsLocal,
      amount: effect.amount || 1,
      selection: effect.selection || 'choice',
      cardName,
      reason: 'effect'
    });
    logMsg(result.discardedNames.length > 0
      ? gameText('effect.discard.done', { card: cardName, target: opponentName, cards: result.discardedNames.join(', ') })
      : gameText('effect.discard.none', { card: cardName, target: opponentName }));
  } else if (effect.type === 'scry' || effect.type === 'surveil') {
    // Convención del mazo en este proyecto: pop() saca del FINAL del array, así que el
    // final = la cima del mazo. Sacamos las últimas N cartas y las damos vuelta para que
    // topCards[0] sea la más arriba de todas (más natural para mostrar en el modal).
    const deck = isLocal ? state.localDeck : state.rivalDeck;
    const amount = Math.min(effect.amount, deck.length);
    if (amount === 0) { logMsg(gameText('effect.look.empty', { card: cardName })); return; }
    const topCards = deck.splice(deck.length - amount, amount).reverse();

    const finishScrySurveil = (moved, kept) => {
      // "kept" vuelve arriba en el mismo orden relativo: las empujamos al revés para que
      // pop() siga sacando kept[0] primero, como si nada se hubiera movido.
      kept.slice().reverse().forEach(c => deck.push(c));
      let surveilExiled=0;
      if (effect.type === 'surveil') {
        moved.forEach(c => {
          const plan=replacementCardZoneOutcome(c,isLocal,'library','graveyard','surveil',{sourceCard:sourceCard || card,sourceIsLocal:isLocal});
          plan.destination.push(c);
          if(plan.zoneTo==='exile') {
            surveilExiled+=1;
            dispatchGameEvent({type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:plan.ownerIsLocal,card:c,zoneFrom:'library',zoneTo:'exile',cause:'surveil'});
          }
        });
      } else {
        deck.unshift(...moved); // al fondo del array = al fondo del mazo
      }
      const destino = effect.type === 'surveil'
        ? (surveilExiled===0 ? 'al cementerio' : surveilExiled===moved.length ? 'al Exilio' : 'entre cementerio y Exilio')
        : 'al fondo';
      logMsg(gameText('effect.look.summary', { icon: effect.type === 'surveil' ? '👁️' : '🔮', card: cardName, kept: kept.length, moved: moved.length, destination: destino }));

      // Recién ACÁ termina de resolverse de verdad — hacemos nosotros mismos lo que
      // resolveTopStackItem hace normalmente al final (se había frenado por el flag).
      state.pendingScrySurveilChoice = false;
      state.priorityPlayer = state.activePlayer;
      state.consecutivePasses = 0;
      render();
      resumeAfterInteractiveEffect();
    };

    if (isLocal) {
      state.pendingScrySurveilChoice = true;
      showScrySurveilModal(topCards, effect.type, finishScrySurveil);
    } else {
      // El Tano: heurística simple — si ya tiene 5 o más tierras en juego, manda las
      // tierras de más para abajo/cementerio; todo lo demás se lo queda arriba.
      const landsInPlay = state.rivalLands.length;
      const kept = [], moved = [];
      topCards.forEach(c => {
        if (c.type.includes('Tierra') && landsInPlay >= 5) moved.push(c); else kept.push(c);
      });
      finishScrySurveil(moved, kept);
    }
  } else if (effect.type === 'proliferate') {
    // Proliferar (regla real 701.30): elegís CUALQUIER cantidad de permanentes (acá:
    // criaturas con contadores +1/+1 o -1/-1, y Planeswalkers, que siempre tienen Lealtad)
    // y a cada uno elegido le sumás UN contador más de CADA tipo que ya tenga. No es un
    // target de verdad (por eso Intocable/Protección no lo frenan, a diferencia de todo lo
    // demás que se resuelve en esta función).
    const eligible = getProliferateCandidates(state);
    recordTelemetryEvent('proliferate_scan', {
      card: cardName,
      eligibleCount: eligible.length,
      eligible: eligible.map(entry => ({
        side: entry.ownerIsLocal ? 'local' : 'rival',
        kind: entry.kind,
        cardId: entry.item?.card?.id || null,
        cardName: entry.item?.card?.name || null,
        counterTypes: entry.counterTypes || []
      }))
    });

    if (eligible.length === 0) {
      logMsg(gameText('effect.proliferate.none', { card: cardName }));
      return;
    }

    const applyProliferate = (entry) => {
      const { item, kind, ownerIsLocal } = entry;
      if (kind === 'planeswalker') {
        item.loyalty += 1;
        logMsg(gameText('effect.proliferate.loyalty', { card: item.card.name, loyalty: item.loyalty }));
      } else if (kind === 'player_poison') {
        if (ownerIsLocal) state.localPoison += 1; else state.rivalPoison += 1;
        logMsg(gameText('effect.proliferate.poison', { owner: ownerIsLocal ? 'Vos' : getRivalName(), verb: ownerIsLocal ? 'recibiste' : 'recibió', poison: ownerIsLocal ? state.localPoison : state.rivalPoison }));
      } else {
        const types = (entry.counterTypes || Object.keys(item?.counters || {})).filter(type => Number(item?.counters?.[type]) > 0);
        types.forEach(type => {
          if (type === 'plusOne' || type === 'minusOne') addCounters(item, type, 1);
          else item.counters[type] = Number(item.counters[type] || 0) + 1;
        });
        logMsg(gameText('effect.proliferate.counters', { card: item.card.name }));
      }
    };

    const finishProliferate = (chosen) => {
      chosen.forEach(applyProliferate);
      // Un -1/-1 de más puede terminar de matar a alguna criatura (SBA).
      checkAllDeaths();
      logMsg(chosen.length > 0
        ? gameText('effect.proliferate.done', { card: cardName, count: chosen.length })
        : gameText('effect.proliferate.zero', { card: cardName }));

      state.pendingProliferateChoice = false;
      state.priorityPlayer = state.activePlayer;
      state.consecutivePasses = 0;
      render();
      resumeAfterInteractiveEffect();
      checkGameOver(); // el Veneno proliferado puede llegar justo a 10 y terminar la partida
    };

    if (isLocal) {
      state.pendingProliferateChoice = true;
      showProliferateModal(eligible, finishProliferate);
    } else {
      // El Tano: elige SIEMPRE lo que lo beneficia a ÉL — sus propios +1/+1 y Planeswalkers,
      // los -1/-1 que ya tenga el jugador humano, y TU Veneno (al revés que el resto de los
      // contadores: el Veneno es malo para quien lo tiene, así que le conviene el tuyo, no
      // el suyo). Nunca ayuda al rival ni se perjudica.
      const chosen = eligible.filter(e => {
        if (e.kind === 'planeswalker') return !e.ownerIsLocal;
        if (e.kind === 'player_poison') return e.ownerIsLocal;
        const c = e.item?.counters || {};
        if (e.ownerIsLocal) return (c.minusOne || 0) > 0; // rival debilitado: le conviene profundizar -1/-1
        // En sus propios permanentes, cualquier contador modelado salvo -1/-1 se presume beneficioso.
        return (e.counterTypes || []).some(type => type !== 'minusOne');
      });
      finishProliferate(chosen);
    }
  }

}

// Resolución de un efecto con objetivo explícito. Es el MISMO bloque que usaba
// executeStackItem; se extrajo sin cambiar reglas para que ETB, hechizos y futuras
// habilidades puedan pasar por una sola puerta de entrada.
async function resolveTargetedGameEffect(effectToApply, targetObj, context) {
  const { card, item, isLocal, enforceProtectionAll = false } = context;

  // 23.15.2 — Ownership & Control Engine. Cambiar de controlador no hace que el permanente deje/reentre al battlefield.
  if (effectToApply.type === 'gain_control' || effectToApply.type === 'gain_control_until_eot') {
    const targetItem = targetObj?.item || null;
    if (!targetItem || targetItem._syncTombstone) { logMsg(gameText('control.targetGone')); return; }
    const onBattlefield = [state.localCombat,state.rivalCombat,state.localSupport,state.rivalSupport,state.localLands,state.rivalLands,state.localPlaneswalkers,state.rivalPlaneswalkers].some(zone=>zone.includes(targetItem));
    if (!onBattlefield) { logMsg(gameText('control.targetGone')); return; }
    const duration = effectToApply.type === 'gain_control_until_eot' ? 'until_end_of_turn' : (effectToApply.duration || 'indefinite');
    changePermanentController(targetItem, isLocal, { duration, untap:!!effectToApply.untap, grantHaste:!!effectToApply.grantHaste, sourceName:card.name });
    return;
  }

  // Compatibilidad exacta con el viejo helper de multi-target: en ese camino la
  // Protección de color se comprobaba para CUALQUIER efecto sobre criatura antes de
  // resolverlo. El targeting simple ya la valida al elegir objetivo, pero multi-target
  // necesitaba este blindaje en resolución.
  if (enforceProtectionAll && targetObj.type === 'creature') {
    const protectedColor = getProtectionMatch(targetObj.item, card.colors || []);
    if (protectedColor) {
      logMsg(gameText('effect.protectionNoEffect', { target: targetObj.item.card.name, color: COLOR_LABELS[protectedColor] || protectedColor, card: card.name }));
      return;
    }
  }

      if (targetObj.type === 'player') {
        const targetName = targetObj.isLocal ? "vos" : getRivalName();
        if (effectToApply.type === 'damage') {
          const damage = replacementDamageAmount({ amount:effectToApply.amount, targetIsLocal:targetObj.isLocal, sourceCard:card, sourceIsLocal:isLocal, combat:false, cause:'spell_or_ability' });
          if (damage.amount <= 0) {
            logReplacementPrevented('damage', targetName);
          } else {
            if (targetObj.isLocal) state.localHP -= damage.amount; else state.rivalHP -= damage.amount;
            dispatchGameEvent({type:'life_lost',controllerIsLocal:targetObj.isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetPlayerIsLocal:targetObj.isLocal,sourceCard:card,amount:damage.amount,cause:'damage'});
            dispatchGameEvent({type:'damage_dealt',controllerIsLocal:targetObj.isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetPlayerIsLocal:targetObj.isLocal,sourceCard:card,amount:damage.amount,cause:'spell_or_ability'});
            logMsg(gameText('effect.targetDamage', { card: card.name, amount: damage.amount, target: targetName }));
          }
        } else if (effectToApply.type === 'heal') {
          if (targetObj.isLocal) state.localHP += effectToApply.amount; 
          else state.rivalHP += effectToApply.amount;
          dispatchGameEvent({type:'life_gained',controllerIsLocal:targetObj.isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetPlayerIsLocal:targetObj.isLocal,sourceCard:card,amount:effectToApply.amount,cause:'effect'});
          logMsg(gameText('effect.targetHeal', { card: card.name, amount: effectToApply.amount, target: targetName }));
        }
        else if (effectToApply.type === 'prevent_damage') {
          state.activeEffects.push({ id:nextEffectId++, effectType:'prevent_damage', targetPlayer:targetObj.isLocal?'local':'rival', remaining:effectToApply.amount ?? 'all', combatOnly:!!effectToApply.combatOnly, noncombatOnly:!!effectToApply.noncombatOnly, sourceName:card.name, expiresAtCleanup:effectToApply.expiresAtCleanup!==false });
          logMsg(gameText('replacement.prevention.created', { card:card.name, target:targetName, amount:effectToApply.amount ?? 'todo' }));
        }
        // LÓGICA NUEVA: VENENO DIRECTO (sin pasar por combate/Infectar) — solo existe para
        // jugadores, nunca para criaturas (regla real: los contadores de Veneno son de
        // jugador, distinto de los -1/-1 que sí van en criaturas).
        else if (effectToApply.type === 'poison') {
          if (targetObj.isLocal) state.localPoison = (state.localPoison || 0) + effectToApply.amount;
          else state.rivalPoison = (state.rivalPoison || 0) + effectToApply.amount;
          // BUGFIX: antes comparaba targetName === 'el Tano' (string fija) para decidir si
          // agregar "al Tano" al final — con un nombre real de rival, esa comparación
          // nunca daba true. Ahora usa targetObj.isLocal directo, sin depender del string.
          logMsg(gameText('effect.poison', { card: card.name, target: targetObj.isLocal ? 'Vos' : targetName, amount: effectToApply.amount }));
        }
        // PUNTO 8: DESCARTE ELEGIDO. Por default el jugador objetivo decide qué cartas
        // descarta. Una carta futura puede pedir explícitamente `selection:"random"`.
        else if (effectToApply.type === 'discard') {
          const result = await discardCardsFromHand({
            victimIsLocal: targetObj.isLocal,
            amount: effectToApply.amount || 1,
            selection: effectToApply.selection || 'choice',
            cardName: card.name,
            reason: 'effect'
          });
          if (result.discardedNames.length > 0) {
            logMsg(gameText('effect.discard.done', { card: card.name, target: targetName, cards: result.discardedNames.join(', ') }));
          } else {
            logMsg(gameText('effect.discard.none', { card: card.name, target: targetName }));
          }
        }
        // ENTREGA 23.10.1 — EFECTO SOBRE ZONA PRIVADA RIVAL.
        // El target declarado por CR 601 es el JUGADOR. La carta concreta NO se mira ni
        // se elige hasta que este bloque corre durante la RESOLUCIÓN del objeto de Stack.
        // Así no existe el exploit "miro la mano y cancelo antes de pagar".
        else if (effectToApply.type === 'private_zone_move') {
          const result = await requestPrivateZoneChoice({
            zone: effectToApply.zone || 'hand',
            amount: effectToApply.amount || 1,
            visibility: effectToApply.visibility || 'reveal_candidates',
            destination: effectToApply.destination || 'graveyard',
            range: effectToApply.range || (effectToApply.zone === 'deck' ? 'top_n' : 'all'),
            rangeCount: effectToApply.rangeCount,
            filter: effectToApply.filter || 'any',
            operation: 'move',
            cardName: card.name,
            ownerIsLocal: targetObj.isLocal,
            chooserIsLocal: isLocal
          });
          if (result.selectedCount > 0) {
            const publicNames = Array.isArray(result.movedNames) && result.movedNames.length
              ? `: ${result.movedNames.join(', ')}` : '';
            logMsg(gameText('effect.private.move', { card: card.name, count: result.selectedCount, target: targetName, names: publicNames }));
          } else {
            logMsg(gameText('effect.private.none', { card: card.name, target: targetName }));
          }
        }
        // LÓGICA NUEVA: EXILIAR CEMENTERIO ENTERO (odio de cementerio)
        else if (effectToApply.type === 'exile_graveyard') {
          const targetGraveyard = targetObj.isLocal ? state.localGraveyard : state.rivalGraveyard;
          const targetExile = targetObj.isLocal ? state.localExile : state.rivalExile;
          const count = targetGraveyard.length;
          if (count > 0) {
            const exiledCards=[...targetGraveyard];
            targetExile.push(...exiledCards);
            targetGraveyard.length = 0;
            exiledCards.forEach(exiledCard => dispatchGameEvent({
              type:'card_exiled',controllerIsLocal:targetObj.isLocal,actorIsLocal:isLocal,ownerIsLocal:targetObj.isLocal,
              sourceControllerIsLocal:isLocal,card:exiledCard,sourceCard:card,zoneFrom:'graveyard',zoneTo:'exile',cause:'effect'
            }));
            logMsg(gameText('effect.graveExile.done', { card: card.name, count, target: targetName }));
          } else {
            logMsg(gameText('effect.graveExile.empty', { card: card.name, target: targetName }));
          }
        }
        // LÓGICA NUEVA: EFECTO GENÉRICO DE UNA SOLA APLICACIÓN (ej. Cuarentena Total)
        else if (effectToApply.type === 'prevent_attack') {
          const targetPlayer = targetObj.isLocal ? 'local' : 'rival';
          state.activeEffects.push({
            id: nextEffectId++,
            effectType: 'prevent_attack',
            targetPlayer,
            sourceName: card.name
          });
          logMsg(gameText('effect.preventAttack.player', { card: card.name, target: targetName }));
        }
      } else if (targetObj.type === 'creature') {
        const targetUnit = targetObj.item;
        if (effectToApply.type === 'damage') {
          const protectedColor = getProtectionMatch(targetUnit, card.colors || []);
          if (protectedColor) {
            logMsg(gameText('effect.damagePrevented', { target: targetUnit.card.name, color: COLOR_LABELS[protectedColor] || protectedColor, card: card.name }));
          } else {
            const damage = replacementDamageAmount({ amount:effectToApply.amount, targetItem:targetUnit, targetIsLocal:targetObj.isLocal, sourceCard:card, sourceIsLocal:isLocal, combat:false, cause:'spell_or_ability' });
            if (damage.amount <= 0) logReplacementPrevented('damage', targetUnit.card.name);
            else {
              targetUnit.damageTaken += damage.amount;
              dispatchGameEvent({type:'damage_dealt',controllerIsLocal:targetObj.isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:targetObj.isLocal,card:targetUnit.card,item:targetUnit,sourceCard:card,targetCard:targetUnit.card,targetItem:targetUnit,amount:damage.amount,combat:false,cause:'spell_or_ability'});
              logMsg(gameText('effect.targetDamage', { card: card.name, amount: damage.amount, target: targetUnit.card.name }));
              checkAllDeaths();
            }
          }
        } 
        else if (effectToApply.type === 'prevent_damage') {
          const targetObjectId=targetUnit._syncObjectId || ensureEffectObjectId(targetUnit);
          state.activeEffects.push({ id:nextEffectId++, effectType:'prevent_damage', targetObjectId, remaining:effectToApply.amount ?? 'all', combatOnly:!!effectToApply.combatOnly, noncombatOnly:!!effectToApply.noncombatOnly, sourceName:card.name, expiresAtCleanup:effectToApply.expiresAtCleanup!==false });
          logMsg(gameText('replacement.prevention.created', { card:card.name, target:targetUnit.card.name, amount:effectToApply.amount ?? 'todo' }));
        }
        // 23.9.3: restricción INDIVIDUAL de ataque. No comparte semántica con
        // prevent_attack (que sigue siendo global por jugador para Cuarentena Total).
        // La identidad vive en el item de battlefield: si sale y vuelve, es un objeto nuevo
        // y no hereda esta restricción.
        else if (effectToApply.type === 'cant_attack_next_turn') {
          const board = targetObj.isLocal ? state.localCombat : state.rivalCombat;
          if (!board.includes(targetUnit)) {
            logMsg(gameText('effect.targetGone', { card: card.name }));
          } else {
            const targetObjectId = ensureEffectObjectId(targetUnit);
            const targetPlayer = targetObj.isLocal ? 'local' : 'rival';
            state.activeEffects.push({
              id: nextEffectId++,
              effectType: 'cant_attack_next_turn',
              targetPlayer,
              targetObjectId,
              createdTurnCount: state.turnCount,
              appliesThisCombat: false,
              sourceName: card.name
            });
            logMsg(gameText('effect.preventAttack.creature', { card: card.name, creature: targetUnit.card.name }));
          }
        }
        // LÓGICA NUEVA: EQUIPAR (real) — el Equipo que activó esta habilidad se adjunta a la criatura.
        // No se copia a `auras`: el Equipo sigue siendo su propio permanente en la zona de soporte,
        // simplemente ahora apunta con `attachedTo` a la criatura equipada.
        else if (effectToApply.type === 'attach_equipment') {
          const equipmentItem = item.sourceItem;
          const protectedColor = getProtectionMatch(targetUnit, card.colors || []);
          if (protectedColor) {
            logMsg(gameText('effect.equipProtection', { target: targetUnit.card.name, color: COLOR_LABELS[protectedColor] || protectedColor, card: card.name }));
          } else if (equipmentItem) {
            equipmentItem.attachedTo = targetUnit;
            logMsg(gameText('effect.equip', { card: card.name, target: targetUnit.card.name }));
          } else {
            logMsg(gameText('effect.equip.sourceMissing', { card: card.name }));
          }
        }
        // LÓGICA NUEVA: PELEAR — la criatura "atacante" (la que activó esto, o si viene de
        // un hechizo, tu criatura con más poder) y la criatura objetivo se hacen daño mutuo
        // igual a su fuerza. No usa la pila para elegir la propia: viene resuelta de antemano.
        else if (effectToApply.type === 'fight') {
          // Prioridad: la criatura que el jugador ELIGIÓ manualmente (targetObj.fightWithItem,
          // ver el paso 2 de selección en handleCombatClick) > la fuente de una habilidad
          // propia (ej. Alberto Samid, donde "quién pelea" ya está claro de antemano) > el
          // viejo fallback de auto-elegir tu criatura más fuerte, por si algo llega sin
          // ninguna de las dos anteriores.
          let selfUnit = targetObj.fightWithItem || item.sourceItem;
          if (!selfUnit) {
            const ownBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (ownBoard.length > 0) {
              selfUnit = ownBoard.reduce((prev, current) => getEffectivePower(prev) > getEffectivePower(current) ? prev : current);
            }
          }
          if (selfUnit) {
            // Pelear (fight) NO es daño de combate — son reglas propias (regla 701.12 y
            // el comprehensive rules glossary de "fight"). Repasado contra las reglas
            // oficiales: Primer Golpe, Doble Golpe y Arrollar NO participan (el daño
            // siempre es simultáneo, una sola vez, y nunca hay jugador de por medio) — por
            // eso ninguno de los dos se chequea acá abajo. Toque Mortal, Vínculo Vital,
            // Indestructible y Protección SÍ participan igual que en combate normal.
            const selfPower = getEffectivePower(selfUnit);
            const targetPower = getEffectivePower(targetUnit);
            const selfHasDeathtouch = hasKeyword(selfUnit, 'deathtouch');
            const targetHasDeathtouch = hasKeyword(targetUnit, 'deathtouch');
            const selfHasLifelink = hasKeyword(selfUnit, 'lifelink');
            const targetHasLifelink = hasKeyword(targetUnit, 'lifelink');

            // Protección corre en las dos direcciones: cada uno puede estar a salvo del
            // color del otro sin que eso frene la pelea en sí, solo el daño de ese lado.
            const targetProtectedFromSelf = getProtectionMatch(targetUnit, selfUnit.card.colors || []);
            const selfProtectedFromTarget = getProtectionMatch(selfUnit, targetUnit.card.colors || []);

            // Los dos daños de Fight se determinan antes de commitear ninguno; cada uno pasa
            // por Replacement/Prevention independientemente y Lifelink usa daño REAL causado.
            const toTarget = targetProtectedFromSelf ? 0 : replacementDamageAmount({amount:selfPower,targetItem:targetUnit,targetIsLocal:targetObj.isLocal,sourceCard:selfUnit.card,sourceIsLocal:isLocal,combat:false,cause:'fight'}).amount;
            const toSelf = selfProtectedFromTarget ? 0 : replacementDamageAmount({amount:targetPower,targetItem:selfUnit,targetIsLocal:isLocal,sourceCard:targetUnit.card,sourceIsLocal:!isLocal,combat:false,cause:'fight'}).amount;

            if (targetProtectedFromSelf) {
              logMsg(gameText('effect.protection.prevent', { target: targetUnit.card.name, color: COLOR_LABELS[targetProtectedFromSelf] || targetProtectedFromSelf, source: selfUnit.card.name }));
            } else if (selfPower > 0 && toTarget<=0) logReplacementPrevented('damage',targetUnit.card.name);
            else if (toTarget > 0) {
              targetUnit.damageTaken = (targetUnit.damageTaken || 0) + toTarget;
              if (selfHasDeathtouch) targetUnit.tookDeathtouch = true;
              dispatchGameEvent({type:'damage_dealt',controllerIsLocal:targetObj.isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:targetObj.isLocal,card:targetUnit.card,item:targetUnit,sourceCard:selfUnit.card,sourceItem:selfUnit,targetCard:targetUnit.card,targetItem:targetUnit,amount:toTarget,combat:false,cause:'fight'});
              if (selfHasLifelink) {
                if (isLocal) state.localHP += toTarget; else state.rivalHP += toTarget;
                dispatchGameEvent({type:'life_gained',controllerIsLocal:isLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,sourceCard:selfUnit.card,sourceItem:selfUnit,amount:toTarget,cause:'lifelink'});
                logMsg(gameText('effect.lifelink.controller', { card: selfUnit.card.name, amount: toTarget }));
              }
            }

            if (selfProtectedFromTarget) {
              logMsg(gameText('effect.protection.prevent', { target: selfUnit.card.name, color: COLOR_LABELS[selfProtectedFromTarget] || selfProtectedFromTarget, source: targetUnit.card.name }));
            } else if (targetPower > 0 && toSelf<=0) logReplacementPrevented('damage',selfUnit.card.name);
            else if (toSelf > 0) {
              selfUnit.damageTaken = (selfUnit.damageTaken || 0) + toSelf;
              if (targetHasDeathtouch) selfUnit.tookDeathtouch = true;
              dispatchGameEvent({type:'damage_dealt',controllerIsLocal:isLocal,actorIsLocal:targetObj.isLocal,sourceControllerIsLocal:targetObj.isLocal,targetControllerIsLocal:isLocal,card:selfUnit.card,item:selfUnit,sourceCard:targetUnit.card,sourceItem:targetUnit,targetCard:selfUnit.card,targetItem:selfUnit,amount:toSelf,combat:false,cause:'fight'});
              if (targetHasLifelink) {
                if (targetObj.isLocal) state.localHP += toSelf; else state.rivalHP += toSelf;
                dispatchGameEvent({type:'life_gained',controllerIsLocal:targetObj.isLocal,actorIsLocal:targetObj.isLocal,sourceControllerIsLocal:targetObj.isLocal,sourceCard:targetUnit.card,sourceItem:targetUnit,amount:toSelf,cause:'lifelink'});
                logMsg(gameText('effect.lifelink.controller', { card: targetUnit.card.name, amount: toSelf }));
              }
            }

            logMsg(gameText('effect.fight', { a: selfUnit.card.name, b: targetUnit.card.name, pa: selfPower, pb: targetPower }));
            checkAllDeaths();
          } else {
            logMsg(gameText('effect.fight.none', { card: card.name }));
          }
        }
        // LÓGICA NUEVA: TRUCO DE COMBATE — +X/+X hasta el final del turno (ej. Fuerza de Toro)
        else if (effectToApply.type === 'pump') {
          if (!targetUnit.tempEffects) targetUnit.tempEffects = [];
          targetUnit.tempEffects.push({ name: card.name, powerMod: effectToApply.powerMod, toughnessMod: effectToApply.toughnessMod, keywords:[...(effectToApply.keywords || (effectToApply.keyword ? [effectToApply.keyword] : []))] });
          const pText = `${effectToApply.powerMod >= 0 ? '+' : ''}${effectToApply.powerMod}/${effectToApply.toughnessMod >= 0 ? '+' : ''}${effectToApply.toughnessMod}`;
          logMsg(gameText('effect.pump', { card: card.name, target: targetUnit.card.name, stats: pText }));
        }
        // LÓGICA NUEVA: CONTADOR PERMANENTE +1/+1 o -1/-1 — a diferencia de "pump" (temporal,
        // se borra en Limpieza), esto usa el mismo sistema real de contadores que ya tienen
        // los Planeswalkers (addCounters), así que se queda mientras la criatura viva Y
        // Proliferar lo puede multiplicar más adelante.
        else if (effectToApply.type === 'add_counter') {
          const counterType = effectToApply.counterType === 'minusOne' ? 'minusOne' : 'plusOne';
          const amount = effectToApply.amount || 1;
          addCounters(targetUnit, counterType, amount);
          const signo = counterType === 'plusOne' ? '+' : '-';
          logMsg(gameText('effect.counter', { card: card.name, target: targetUnit.card.name, amount, stats: `${signo}${amount}/${signo}${amount}` }));
          checkAllDeaths();
        }
        // LÓGICA NUEVA: PROTECCIÓN TEMPORAL — otorga una keyword hasta el final del turno (ej. A Cubierto)
        else if (effectToApply.type === 'grant_keyword_temp') {
          if (!targetUnit.tempEffects) targetUnit.tempEffects = [];
          targetUnit.tempEffects.push({ name: card.name, keywords: [effectToApply.keyword] });
          logMsg(gameText('effect.keyword', { card: card.name, target: targetUnit.card.name, keyword: effectToApply.keyword }));
        }
        // PUNTO 10 PRE-500: destruir una unidad en Combat puede venir de removal de
        // criatura O de removal de artefacto si la unidad conserva tipo Artefacto
        // (Criatura Artefacto / Vehículo tripulado). La zona no borra el tipo real.
        else if (effectToApply.type === 'destroy_creature' || effectToApply.type === 'destroy_artifact') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const grave = zoneForCardOwner(targetUnit.card, state.localGraveyard, state.rivalGraveyard, isTargetLocal, state.currentMatch?.myRole || null);
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            if (effectToApply.type === 'destroy_artifact' && !targetUnit.card.type.includes('Artefacto')) {
              logMsg(gameText('effect.destroy.invalidArtifact', { card: card.name, target: targetUnit.card.name }));
            } else if (hasKeyword(targetUnit, 'indestructible')) {
              logMsg(gameText('effect.indestructible', { target: targetUnit.card.name, card: card.name }));
            } else {
              const replacement = replacementDestroyOutcome(targetUnit, isTargetLocal, card, isLocal);
              if (replacement.prevented) {
                logReplacementPrevented('destroy', targetUnit.card.name);
              } else {
                const zoneTo = replacement.event.zoneTo || 'graveyard';
                board.splice(idx, 1);
                detachEquipmentFrom(targetUnit, isTargetLocal);
                sendAurasToGraveyard(targetUnit, isTargetLocal);
                cleanupIfVehicle(targetUnit); // si era un Vehículo tripulado, saca el power/toughness "prestado"
                moveBattlefieldCardToZone(targetUnit.card, ownerDestinationZone(targetUnit.card, isTargetLocal, zoneTo));
                logMsg(gameText('effect.destroy', { card: card.name, target: targetUnit.card.name, token: targetUnit.card.isToken ? ' Al ser ficha, dejó de existir.' : '' }));
                if (zoneTo === 'graveyard') {
                  triggerCreatureDies(targetUnit, isTargetLocal);
                  triggerAnyCreatureDeath(targetUnit, isTargetLocal);
                } else {
                  dispatchGameEvent({type:'permanent_left_battlefield',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetUnit.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetUnit.card,item:targetUnit,sourceCard:card,targetCard:targetUnit.card,targetItem:targetUnit,zoneFrom:'battlefield',zoneTo,cause:'destroy'});
                  if (zoneTo === 'exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(targetUnit.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetUnit.card,sourceCard:card,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'});
                }
              }
            }
          } else {
            logMsg(gameText('effect.targetGone', { card: card.name }));
          }
        }
        // LÓGICA NUEVA: EXILIAR CRIATURA — a diferencia de destruir, el Exilio NO es
        // "destrucción" en las reglas reales: Indestructible NO lo frena. Tampoco cuenta
        // como que la criatura "murió" (morir = ir al cementerio desde el campo), así que
        // NO dispara triggerCreatureDies ni triggerAnyCreatureDeath ("cuando muera una
        // criatura..."). Y como no pasa por el cementerio, cartas como Reanimar no la
        // pueden traer de vuelta — es la diferencia clave que hace valioso al Exilio.
        // LÓGICA NUEVA: PARPADEO TEMPORAL — exilia y programa el regreso para el próximo
        // Paso Final DEL CONTROLADOR (no necesariamente el que viene ahora mismo: si se
        // tira en el turno rival, vuelve recién en tu próximo turno). Al volver entra como
        // un objeto totalmente nuevo — sin auras, sin equipos, sin contadores, con mareo de
        // invocación fresco — tal cual la regla real de MTG. Como pasa por el Exilio,
        // Indestructible tampoco frena esto.
        else if (effectToApply.type === 'exile_and_return') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const exileZone = zoneForCardOwner(targetUnit.card, state.localExile, state.rivalExile, isTargetLocal, state.currentMatch?.myRole || null);
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            board.splice(idx, 1);
            detachEquipmentFrom(targetUnit, isTargetLocal);
            sendAurasToGraveyard(targetUnit, isTargetLocal);
            cleanupIfVehicle(targetUnit);
            const persisted = moveBattlefieldCardToZone(targetUnit.card, exileZone);
            dispatchGameEvent({type:'card_exiled',aliases:['permanent_left_battlefield'],controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetUnit.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetUnit.card,item:targetUnit,sourceCard:card,targetCard:targetUnit.card,targetItem:targetUnit,zoneFrom:'battlefield',zoneTo:'exile',cause:'exile_and_return'}, {watchersSnapshot:[{item:targetUnit,isLocal:isTargetLocal}]});
            if (persisted) {
              state.scheduledReturns.push({ card: targetUnit.card, isLocal: cardOwnerIsLocal(targetUnit.card, isTargetLocal, state.currentMatch?.myRole || null) });
              logMsg(gameText('effect.exile.returnEnd', { card: card.name, target: targetUnit.card.name }));
            } else {
              logMsg(gameText('effect.exile.tokenGone', { card: card.name, target: targetUnit.card.name }));
            }
          } else {
            logMsg(gameText('effect.targetGone', { card: card.name }));
          }
        }
        else if (effectToApply.type === 'exile_creature') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const exileZone = zoneForCardOwner(targetUnit.card, state.localExile, state.rivalExile, isTargetLocal, state.currentMatch?.myRole || null);
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            board.splice(idx, 1);
            detachEquipmentFrom(targetUnit, isTargetLocal);
            sendAurasToGraveyard(targetUnit, isTargetLocal);
            cleanupIfVehicle(targetUnit);
            moveBattlefieldCardToZone(targetUnit.card, exileZone);
            dispatchGameEvent({type:'card_exiled',aliases:['permanent_left_battlefield'],controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetUnit.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetUnit.card,item:targetUnit,sourceCard:card,targetCard:targetUnit.card,targetItem:targetUnit,zoneFrom:'battlefield',zoneTo:'exile',cause:'exile'}, {watchersSnapshot:[{item:targetUnit,isLocal:isTargetLocal}]});
            logMsg(targetUnit.card.isToken
              ? gameText('effect.exile.permanentTokenGone', { card: card.name, target: targetUnit.card.name })
              : gameText('effect.exile.permanent', { card: card.name, target: targetUnit.card.name }));
          } else {
            logMsg(gameText('effect.targetGone', { card: card.name }));
          }
        }
        // LÓGICA NUEVA: REBOTE A LA MANO
        else if (effectToApply.type === 'bounce') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const idx = board.indexOf(targetUnit);
          if (idx === -1) {
            logMsg(gameText('effect.targetGone', { card: card.name }));
          } else if (state.currentMatch && !cardOwnerIsLocal(targetUnit.card, isTargetLocal, state.currentMatch?.myRole || null)) {
            // ENTREGA 23.7 — la mano rival es PRIVADA. No insertar jamás `targetUnit.card`
            // en state.rivalHand: eso era el HIDDEN_HAND_LEAK y además el dueño real nunca
            // recibía la carta. La operación la ejecuta el cliente propietario, referenciando
            // el permanente público con su syncObjectId estable.
            const targetDescriptor = serializeStackTarget(targetObj, state, state.currentMatch.myRole);
            const response = await requestRivalDecision(
              'move_public_card_to_private_hand',
              otherRole(state.currentMatch.myRole),
              { target: targetDescriptor, cardName: targetUnit.card.name, sourceCardName: card.name }
            );
            if (response?.completed) {
              dispatchGameEvent({type:'permanent_left_battlefield',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetUnit.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetUnit.card,item:targetUnit,sourceCard:card,targetCard:targetUnit.card,targetItem:targetUnit,zoneFrom:'battlefield',zoneTo:'hand',cause:'bounce'}, {watchersSnapshot:[{item:targetUnit,isLocal:isTargetLocal}]});
              logMsg(response.tokenCeasedToExist
                ? gameText('effect.bounce.tokenGone', { card: card.name, target: targetUnit.card.name })
                : gameText('effect.bounce.done', { card: card.name, target: targetUnit.card.name }));
            } else {
              logMsg(gameText('effect.bounce.remoteFailed', { card: card.name, target: targetUnit.card.name }));
            }
          } else {
            // Local/single-player: la mano real está disponible en este mismo cliente.
            board.splice(idx, 1);
            detachEquipmentFrom(targetUnit, isTargetLocal);
            sendAurasToGraveyard(targetUnit, isTargetLocal);
            cleanupIfVehicle(targetUnit); // si era un Vehículo tripulado, saca el power/toughness "prestado"
            const ownerHand = zoneForCardOwner(
              targetUnit.card, state.localHand, state.rivalHand, isTargetLocal, state.currentMatch?.myRole || null
            );
            moveBattlefieldCardToZone(targetUnit.card, ownerHand);
            dispatchGameEvent({type:'permanent_left_battlefield',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetUnit.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetUnit.card,item:targetUnit,sourceCard:card,targetCard:targetUnit.card,targetItem:targetUnit,zoneFrom:'battlefield',zoneTo:'hand',cause:'bounce'}, {watchersSnapshot:[{item:targetUnit,isLocal:isTargetLocal}]});
            logMsg(targetUnit.card.isToken
              ? gameText('effect.bounce.tokenGone', { card: card.name, target: targetUnit.card.name })
              : gameText('effect.bounce.done', { card: card.name, target: targetUnit.card.name }));
          }
        }
      }
      // LAND 2 — DESTRUCCIÓN DE TIERRAS. Una man-land animada puede estar visualmente
      // en Combat pero conserva identidad Land; si es destruida mientras también es Criatura,
      // además MUERE y dispara los triggers de muerte correspondientes.
      else if (targetObj.type === 'land') {
        const targetItem = targetObj.item;
        const isTargetLocal = targetObj.isLocal;
        const landZone = isTargetLocal ? state.localLands : state.rivalLands;
        const combatZone = isTargetLocal ? state.localCombat : state.rivalCombat;
        const grave = zoneForCardOwner(targetItem?.card, state.localGraveyard, state.rivalGraveyard, isTargetLocal, state.currentMatch?.myRole || null);
        const inLandRow = landZone.includes(targetItem);
        const inCombat = combatZone.includes(targetItem) && isLandPermanent(targetItem);
        const stillLand = !!targetItem && (inLandRow || inCombat) && isLandPermanent(targetItem);
        const filter = effectToApply.type === 'destroy_nonbasic_land' ? 'nonbasic' : (effectToApply.landFilter || 'any');

        if (!stillLand) {
          logMsg(gameText('effect.targetGone', { card: card.name }));
        } else if (!landMatchesEffectiveFilter(state, targetItem, isTargetLocal, filter)) {
          logMsg(gameText('land.destroy.invalid', { card: card.name, target: targetItem.card.name }));
        } else if (isTargetLocal !== isLocal && hasKeyword(targetItem, 'hexproof')) {
          // Si ganó Intocable después de ser targeteada, el objetivo ya no es legal al resolver.
          logMsg(gameText('effect.targetGone', { card: card.name }));
        } else {
          const protectedColor = getProtectionMatch(targetItem, card.colors || []);
          if (protectedColor) {
            logMsg(gameText('effect.protectionNoEffect', { target: targetItem.card.name, color: COLOR_LABELS[protectedColor] || protectedColor, card: card.name }));
            return;
          }
          if (hasKeyword(targetItem, 'indestructible')) {
            logMsg(gameText('effect.indestructible', { target: targetItem.card.name, card: card.name }));
          } else {
            const replacement = replacementDestroyOutcome(targetItem, isTargetLocal, card, isLocal);
            if (replacement.prevented) {
              logReplacementPrevented('destroy', targetItem.card.name);
            } else {
              const zoneTo = replacement.event.zoneTo || 'graveyard';
              const wasCreature = inCombat && isCreaturePermanent(targetItem);
              const zone = inCombat ? combatZone : landZone;
              const idx = zone.indexOf(targetItem);
              if (idx !== -1) zone.splice(idx, 1);
              if (wasCreature) {
                detachEquipmentFrom(targetItem, isTargetLocal);
                sendAurasToGraveyard(targetItem, isTargetLocal);
              }
              moveBattlefieldCardToZone(targetItem.card, ownerDestinationZone(targetItem.card, isTargetLocal, zoneTo));
              logMsg(gameText('land.destroy.done', { card: card.name, target: targetItem.card.name }));
              recordTelemetryEvent('land_destroyed', { source: card.name, target: targetItem.card.name, nonbasic: isNonbasicLandPermanent(targetItem), animatedCreature: wasCreature, isTargetLocal, zoneTo });
              if (!wasCreature || zoneTo !== 'graveyard') dispatchGameEvent({type:'permanent_left_battlefield',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetItem.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetItem.card,item:targetItem,sourceCard:card,targetCard:targetItem.card,targetItem,zoneFrom:'battlefield',zoneTo,cause:'destroy'}, {watchersSnapshot:[{item:targetItem,isLocal:isTargetLocal}]});
              if (wasCreature && zoneTo === 'graveyard') {
                triggerCreatureDies(targetItem, isTargetLocal);
                triggerAnyCreatureDeath(targetItem, isTargetLocal);
              }
              if (zoneTo === 'exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(targetItem.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetItem.card,sourceCard:card,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'});
            }
          }
        }
      }
      // LÓGICA NUEVA: DESTRUIR PERMANENTE (Artefacto / Encantamiento en la zona de soporte)
      else if (targetObj.type === 'permanent') {
        const targetItem = targetObj.item;
        const isTargetLocal = state.localSupport.includes(targetItem);
        const supportZone = isTargetLocal ? state.localSupport : state.rivalSupport;
        const grave = zoneForCardOwner(targetItem?.card, state.localGraveyard, state.rivalGraveyard, isTargetLocal, state.currentMatch?.myRole || null);
        const idx = supportZone.indexOf(targetItem);
        const matchesType = effectToApply.type === 'destroy_artifact'
          ? targetItem.card.type.includes('Artefacto')
          : effectToApply.type === 'destroy_enchantment'
            ? targetItem.card.type.includes('Encantamiento')
            : false;
        if (matchesType && idx !== -1) {
          const replacement = replacementDestroyOutcome(targetItem, isTargetLocal, card, isLocal);
          if (replacement.prevented) {
            logReplacementPrevented('destroy', targetItem.card.name);
          } else {
            const zoneTo = replacement.event.zoneTo || 'graveyard';
            supportZone.splice(idx, 1);
            moveBattlefieldCardToZone(targetItem.card, ownerDestinationZone(targetItem.card, isTargetLocal, zoneTo));
            dispatchGameEvent({type:'permanent_left_battlefield',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,ownerIsLocal:cardOwnerIsLocal(targetItem.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetItem.card,item:targetItem,sourceCard:card,targetCard:targetItem.card,targetItem,zoneFrom:'battlefield',zoneTo,cause:'destroy'}, {watchersSnapshot:[{item:targetItem,isLocal:isTargetLocal}]});
            if (zoneTo === 'exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(targetItem.card,isTargetLocal,state.currentMatch?.myRole||null),card:targetItem.card,sourceCard:card,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'});
            logMsg(gameText('effect.destroy.done', { card: card.name, target: targetItem.card.name }));
            // Si era un Encantamiento estático (ej. Fuerza de la Manada), alguna criatura
            // que dependía de ese +1/+1 para sobrevivir podría morir ahora.
            if (targetItem.card.staticEffect) checkAllDeaths();
          }
        } else if (idx === -1) {
          logMsg(gameText('effect.targetGone', { card: card.name }));
        }
      }
      // LÓGICA NUEVA (Cabo suelto #13): DAÑO A UN PLANESWALKER — un hechizo de daño a
      // "cualquier objetivo" ahora también puede apuntarle a uno (regla real moderna). Le
      // resta Lealtad en vez de HP; el resto de los tipos de efecto no tiene sentido acá
      // (curar/robar/etc. son cosas de jugador, no de Planeswalker) así que no se listan.
      else if (targetObj.type === 'planeswalker') {
        const pwItem = targetObj.item;
        const isTargetLocal = state.localPlaneswalkers.includes(pwItem);
        const zone = isTargetLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
        if (!zone.includes(pwItem)) {
          logMsg(gameText('effect.targetGone', { card: card.name }));
        } else if (effectToApply.type === 'damage') {
          const damage = replacementDamageAmount({ amount:effectToApply.amount, targetItem:pwItem, targetIsLocal:isTargetLocal, sourceCard:card, sourceIsLocal:isLocal, combat:false, cause:'spell_or_ability' });
          if (damage.amount <= 0) logReplacementPrevented('damage', pwItem.card.name);
          else {
            pwItem.loyalty -= damage.amount;
            dispatchGameEvent({type:'damage_dealt',controllerIsLocal:isTargetLocal,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,targetControllerIsLocal:isTargetLocal,card:pwItem.card,item:pwItem,sourceCard:card,targetCard:pwItem.card,targetItem:pwItem,amount:damage.amount,combat:false,cause:'spell_or_ability'});
            logMsg(gameText('effect.pwDamage', { card: card.name, amount: damage.amount, target: pwItem.card.name, loyalty: pwItem.loyalty }));
            checkPlaneswalkerDeaths();
          }
        } else if (effectToApply.type === 'prevent_damage') {
          const targetObjectId=pwItem._syncObjectId || ensureEffectObjectId(pwItem);
          state.activeEffects.push({ id:nextEffectId++, effectType:'prevent_damage', targetObjectId, remaining:effectToApply.amount ?? 'all', combatOnly:!!effectToApply.combatOnly, noncombatOnly:!!effectToApply.noncombatOnly, sourceName:card.name, expiresAtCleanup:effectToApply.expiresAtCleanup!==false });
          logMsg(gameText('replacement.prevention.created', { card:card.name, target:pwItem.card.name, amount:effectToApply.amount ?? 'todo' }));
        }
      }
    
}

// Resolución de un efecto sin objetivo explícito. Incluye los efectos complejos que
// antes solo existían en la rama de hechizos (Crew/man-land, wipe, fichas, Reanimate,
// Ramp) y finalmente delega los efectos directos clásicos al helper de arriba.
async function resolveReturnFromGraveyardEffect(effectToApply, card, isLocal) {
  const amount = Math.max(0, Math.floor(Number(effectToApply.amount ?? 1)));
  const filter = effectToApply.filter || 'any';
  if (amount <= 0) return [];

  // En multiplayer la mano del rival es privada. Si el efecto pertenece al jugador remoto,
  // este cliente NO mueve una carta pública del cementerio a un array de placeholders: le
  // pide al dueño real que elija y complete el movimiento en su propia pantalla.
  if (isHiddenRivalZone(isLocal)) {
    const rivalRole = otherRole(state.currentMatch.myRole);
    const response = await requestRivalDecision('self_return_from_graveyard', rivalRole, {
      amount,
      filter,
      cardName: card.name || 'Efecto rival'
    });
    return response.returnedNames || [];
  }

  const graveyard = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const hand = isLocal ? state.localHand : state.rivalHand;
  const chosenCards = await chooseGraveyardCards({
    zoneIsLocal: isLocal,
    chooserIsLocal: isLocal,
    filter,
    amount,
    cardName: card.name,
    actionLabel: `elegí ${amount} carta${amount > 1 ? 's' : ''} para devolver a tu mano`,
    botStrategy: 'highest_value'
  });

  const returnedNames = [];
  for (const chosenCard of chosenCards) {
    // Revalidación al comprometer el movimiento: otra interacción pudo haber movido esa
    // carta mientras el selector estaba abierto. `indexOf` repetido también soporta dos
    // copias que, defensivamente, compartan la misma referencia de definición.
    const idx = graveyard.indexOf(chosenCard);
    if (idx === -1 || chosenCard?.isToken) continue;
    const [returnedCard] = graveyard.splice(idx, 1);
    hand.push(returnedCard);
    returnedNames.push(returnedCard.name);
  }
  return returnedNames;
}


async function resolveReturnLandsFromGraveyardEffect(effectToApply, card, isLocal) {
  const spec = normalizeLandGraveyardReturnEffect(effectToApply);
  const graveyard = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const candidates = graveyard.filter(c => landGraveyardFilterMatches(c, spec.filter));
  if (!candidates.length) return [];
  const wanted = spec.all ? candidates.length : Math.min(spec.amount, candidates.length);
  const chosenCards = spec.all
    ? [...candidates]
    : await chooseGraveyardCards({
        zoneIsLocal: isLocal,
        chooserIsLocal: isLocal,
        filter: 'land',
        landFilter: spec.filter,
        amount: wanted,
        cardName: card.name,
        actionLabel: gameText('land.grave.returnAction', { count:wanted }),
        botStrategy: 'highest_value'
      });

  const validChosenCards = chosenCards.filter(chosenCard =>
    graveyard.includes(chosenCard) && landGraveyardFilterMatches(chosenCard, spec.filter)
  );
  // Snapshot de replacement effects ANTES de que entre ninguna carta del lote.
  const entered = validChosenCards.map(chosenCard => {
    stampCardOwner(chosenCard, isLocal, state.currentMatch?.myRole || null);
    const landItem = {
      card:chosenCard,
      tapped:landEntersTappedForBattlefield(chosenCard, isLocal, spec.destination === 'battlefield_tapped'),
      enteredThisTurn:true,
      permanentTypes:['land']
    };
    stampPermanentController(landItem, isLocal, state.currentMatch?.myRole || null);
    return { card:chosenCard, item:landItem };
  });
  for (const chosenCard of validChosenCards) {
    const gyIdx = graveyard.indexOf(chosenCard);
    if (gyIdx !== -1) graveyard.splice(gyIdx, 1);
  }
  entered.forEach(entry => lands.push(entry.item));
  // Las Tierras entraron simultáneamente; recién después encolamos Landfall por cada entrada.
  // Así permanentes que entraron juntos pueden verse entre sí, como en MTG real.
  for (const entry of entered) await triggerLandEtb(isLocal, entry.card, entry.item);
  return entered.map(e => e.card.name);
}

async function resolveUntargetedGameEffect(effectToApply, context) {
  const { card, item, isLocal } = context;

      // LAND 1 — man-land real: la fuente mantiene identidad Land + Creature.
      if (effectToApply.type === 'animate_land') {
        const sourceItem = item?.sourceItem || item?.source?.sourceItem || null;
        if (sourceItem && animateLandPermanent(sourceItem, isLocal, effectToApply)) {
          logMsg(gameText('land.animate.done', { card: card.name, power: effectToApply.power ?? card.baseStats?.power ?? 0, toughness: effectToApply.toughness ?? card.baseStats?.toughness ?? 0 }));
        } else {
          logMsg(gameText('land.animate.unavailable', { card: card.name }));
        }
      }
      // Crew real (23.15.5.4): el coste ya se pagó al activar; recién al resolver esta
      // habilidad el Vehicle se vuelve criatura hasta EOT. Si la fuente dejó battlefield,
      // la habilidad resuelve sin efecto. Si cambió de controlador, se mueve al Combat de
      // su controlador ACTUAL, no necesariamente al jugador que activó Crew.
      else if (effectToApply.type === 'crew_vehicle') {
        const sourceItem = item?.sourceItem || item?.source?.sourceItem || null;
        const locations = [
          { zone:state.localSupport, combat:state.localCombat, isLocal:true, wasLand:false },
          { zone:state.rivalSupport, combat:state.rivalCombat, isLocal:false, wasLand:false },
          { zone:state.localLands, combat:state.localCombat, isLocal:true, wasLand:true },
          { zone:state.rivalLands, combat:state.rivalCombat, isLocal:false, wasLand:true }
        ];
        const alreadyCombat = state.localCombat.includes(sourceItem) || state.rivalCombat.includes(sourceItem);
        if (alreadyCombat && sourceItem?.isVehicle) {
          logMsg(gameText('effect.crew.alreadyCreature', { card:card.name }));
        } else {
          const loc = locations.find(entry => entry.zone.includes(sourceItem));
          if (!sourceItem || !loc) {
            logMsg(gameText('crew.unavailable', { card:card.name }));
          } else {
            loc.zone.splice(loc.zone.indexOf(sourceItem), 1);
            sourceItem.card.power = card.baseStats?.power ?? card.power ?? 0;
            sourceItem.card.toughness = card.baseStats?.toughness ?? card.toughness ?? 0;
            sourceItem.isVehicle = true;
            sourceItem.wasLand = loc.wasLand;
            sourceItem.summoningSickness = !!sourceItem.enteredThisTurn && !hasKeyword(sourceItem, 'haste');
            sourceItem.damageTaken = sourceItem.damageTaken || 0;
            sourceItem.isAttacking = false;
            sourceItem.blockingIndex = null;
            loc.combat.push(sourceItem);
            logMsg(gameText('effect.crew.done', { card:card.name, power:sourceItem.card.power, toughness:sourceItem.card.toughness }));
          }
        }
      }
      // LÓGICA NUEVA: ARRASAR EL CAMPO (board wipe)
      else if (effectToApply.type === 'destroy_all_creatures') {
        // ETAPA MOTOR 2: las muertes de un wipe son simultáneas. Primero fotografiamos TODOS
        // los watchers, después sacamos del campo a todos los que realmente mueren, y recién
        // entonces resolvemos sus triggers. Así un Blood Artist que también muere ve a todas
        // las demás criaturas del mismo arrase, no sólo a las que casualmente salieron antes.
        const deathWatchersSnapshot = [
          ...state.localCombat.map(unit => ({ unit, isLocal: true })),
          ...state.rivalCombat.map(unit => ({ unit, isLocal: false }))
        ];
        const doomed = [];
        state.localCombat.forEach(unit => { if (!hasKeyword(unit, 'indestructible')) doomed.push({ unit, isLocal: true }); });
        state.rivalCombat.forEach(unit => { if (!hasKeyword(unit, 'indestructible')) doomed.push({ unit, isLocal: false }); });

        // Resolver TODOS los replacements antes de mover el primer objeto preserva la foto
        // simultánea del wipe (una fuente que también muere puede afectar a sus compañeros).
        const planned = doomed.map(({unit,isLocal:isLocalZone}) => ({unit,isLocal:isLocalZone,replacement:replacementDestroyOutcome(unit,isLocalZone,card,isLocal)}));
        const genericWatchersSnapshot = [
          ...state.localCombat.map(item=>({item,isLocal:true})), ...state.rivalCombat.map(item=>({item,isLocal:false})),
          ...state.localSupport.map(item=>({item,isLocal:true})), ...state.rivalSupport.map(item=>({item,isLocal:false})),
          ...state.localLands.map(item=>({item,isLocal:true})), ...state.rivalLands.map(item=>({item,isLocal:false})),
          ...state.localPlaneswalkers.map(item=>({item,isLocal:true})), ...state.rivalPlaneswalkers.map(item=>({item,isLocal:false}))
        ];
        let localCount = 0, rivalCount = 0;
        const actualDeaths=[];
        const extraEntries=[];
        for (const {unit,isLocal:isLocalZone,replacement} of planned) {
          if (replacement.prevented) continue;
          const zoneTo=replacement.event.zoneTo || 'graveyard';
          const combatZone = isLocalZone ? state.localCombat : state.rivalCombat;
          const idx = combatZone.indexOf(unit);
          if (idx === -1) continue;
          combatZone.splice(idx, 1);
          detachEquipmentFrom(unit, isLocalZone);
          sendAurasToGraveyard(unit, isLocalZone);
          cleanupIfVehicle(unit);
          moveBattlefieldCardToZone(unit.card, ownerDestinationZone(unit.card,isLocalZone,zoneTo));
          if(zoneTo==='graveyard') actualDeaths.push({unit,isLocal:isLocalZone});
          else {
            extraEntries.push(...buildGenericEventTriggerEntries({type:'permanent_left_battlefield',controllerIsLocal:isLocalZone,actorIsLocal:isLocal,sourceControllerIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(unit.card,isLocalZone,state.currentMatch?.myRole||null),card:unit.card,item:unit,sourceCard:card,zoneFrom:'battlefield',zoneTo,cause:'destroy'}, {watchersSnapshot:genericWatchersSnapshot}));
            if(zoneTo==='exile') extraEntries.push(...buildGenericEventTriggerEntries({type:'card_exiled',controllerIsLocal:isLocalZone,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(unit.card,isLocalZone,state.currentMatch?.myRole||null),card:unit.card,item:unit,sourceCard:card,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'}, {watchersSnapshot:genericWatchersSnapshot}));
          }
          if (isLocalZone) localCount++; else rivalCount++;
        }

        if(actualDeaths.length) queueCreatureDeathBatch(actualDeaths, deathWatchersSnapshot, extraEntries);
        else if(extraEntries.length) queueTriggeredAbilities(extraEntries);
        logMsg(gameText('effect.wrath', { card: card.name, local: localCount, rivalCount, rival: getRivalName() }));
      }
      // LAND 2 — DESTRUCCIÓN MASIVA DE TIERRAS. Por default afecta a ambos jugadores,
      // pero `controller` puede ser self/opponent y `landFilter` permite futuras Ruination-style
      // sin crear otro efecto ad hoc. Todo se destruye simultáneamente y respeta Indestructible.
      else if (effectToApply.type === 'destroy_all_lands') {
        const controller = effectToApply.controller || 'all';
        const filter = effectToApply.landFilter || 'any';
        const controllerAllows = (landIsLocal) => controller === 'all'
          || (controller === 'self' && landIsLocal === isLocal)
          || (controller === 'opponent' && landIsLocal !== isLocal);
        const watchersSnapshot = [
          ...state.localCombat.map(unit => ({ unit, isLocal: true })),
          ...state.rivalCombat.map(unit => ({ unit, isLocal: false }))
        ];
        const genericWatchersSnapshot = [
          ...state.localCombat.map(item => ({ item, isLocal:true })), ...state.rivalCombat.map(item => ({ item, isLocal:false })),
          ...state.localSupport.map(item => ({ item, isLocal:true })), ...state.rivalSupport.map(item => ({ item, isLocal:false })),
          ...state.localLands.map(item => ({ item, isLocal:true })), ...state.rivalLands.map(item => ({ item, isLocal:false })),
          ...state.localPlaneswalkers.map(item => ({ item, isLocal:true })), ...state.rivalPlaneswalkers.map(item => ({ item, isLocal:false }))
        ];
        const doomed = [];
        const seen = new Set();
        for (const [landIsLocal, zones] of [[true, [state.localLands, state.localCombat]], [false, [state.rivalLands, state.rivalCombat]]]) {
          if (!controllerAllows(landIsLocal)) continue;
          for (const unit of zones.flat()) {
            if (!unit || seen.has(unit) || !isLandPermanent(unit) || !landMatchesEffectiveFilter(state, unit, landIsLocal, filter)) continue;
            seen.add(unit);
            if (hasKeyword(unit, 'indestructible')) continue;
            const inCombat = (landIsLocal ? state.localCombat : state.rivalCombat).includes(unit);
            doomed.push({ unit, isLocal: landIsLocal, wasCreature: inCombat && isCreaturePermanent(unit) });
          }
        }

        const plannedDoomed=doomed.map(entry=>({...entry,replacement:replacementDestroyOutcome(entry.unit,entry.isLocal,card,isLocal)}));
        let localCount = 0, rivalCount = 0;
        const deadCreatures = [];
        const nonCreatureLeaveEntries = [];
        for (const entry of plannedDoomed) {
          const { unit, isLocal: landIsLocal, wasCreature, replacement } = entry;
          if(replacement.prevented) continue;
          const zoneTo=replacement.event.zoneTo || 'graveyard';
          const landZone = landIsLocal ? state.localLands : state.rivalLands;
          const combatZone = landIsLocal ? state.localCombat : state.rivalCombat;
          const zone = combatZone.includes(unit) ? combatZone : landZone;
          const idx = zone.indexOf(unit);
          if (idx === -1) continue;
          zone.splice(idx, 1);
          if (wasCreature) {
            detachEquipmentFrom(unit, landIsLocal);
            sendAurasToGraveyard(unit, landIsLocal);
            if(zoneTo==='graveyard') deadCreatures.push({ unit, isLocal: landIsLocal });
          }
          moveBattlefieldCardToZone(unit.card, ownerDestinationZone(unit.card,landIsLocal,zoneTo));
          if (!wasCreature || zoneTo!=='graveyard') nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
            type:'permanent_left_battlefield',controllerIsLocal:landIsLocal,actorIsLocal:isLocal,
            sourceControllerIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(unit.card,landIsLocal,state.currentMatch?.myRole||null),
            card:unit.card,item:unit,sourceCard:card,zoneFrom:'battlefield',zoneTo,cause:'destroy'
          }, {watchersSnapshot:genericWatchersSnapshot}));
          if(zoneTo==='exile') nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
            type:'card_exiled',controllerIsLocal:landIsLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(unit.card,landIsLocal,state.currentMatch?.myRole||null),
            card:unit.card,item:unit,sourceCard:card,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
          }, {watchersSnapshot:genericWatchersSnapshot}));
          if (landIsLocal) localCount += 1; else rivalCount += 1;
        }
        if (deadCreatures.length) {
          // Legacy LAND 2 contract marker: queueCreatureDeathBatch(deadCreatures, watchersSnapshot)
          // 23.15.3 agrega nonCreatureLeaveEntries al mismo batch AP/NAP sin perder simultaneidad.
          queueCreatureDeathBatch(deadCreatures, watchersSnapshot, nonCreatureLeaveEntries);
        }
        else if (nonCreatureLeaveEntries.length) queueTriggeredAbilities(nonCreatureLeaveEntries);
        logMsg(gameText('land.destroy.mass', { card: card.name, local: localCount, rivalCount, rival: getRivalName() }));
        recordTelemetryEvent('lands_destroyed_mass', { source: card.name, localCount, rivalCount, filter, controller });
      }
      // LÓGICA NUEVA: CREAR FICHAS
      else if (effectToApply.type === 'create_tokens') {
        const board = isLocal ? state.localCombat : state.rivalCombat;
        const tokenReplacement = resolveReplacementEvent(state, {
          type:'token_create', amount:Math.max(0,Number(effectToApply.amount || 1)),
          affectedIsLocal:isLocal, targetIsLocal:isLocal, sourceCard:card,
          card:null, zoneFrom:'none', zoneTo:'battlefield', cause:'effect'
        });
        const amount = Math.max(0,Math.floor(Number(tokenReplacement.event.amount)||0));
        for (let i = 0; i < amount; i++) {
          const tokenCard = {
            id: `token_${card.id}_${Date.now()}_${i}`,
            name: effectToApply.tokenName || 'Ficha',
            type: 'Criatura Token',
            manaCost: null,
            image: effectToApply.image ?? null,
            cmc: 0,
            rarity: 'Common',
            colors: card.colors || [],
            power: effectToApply.tokenStats?.power ?? 1,
            toughness: effectToApply.tokenStats?.toughness ?? 1,
            text: 'Token de criatura.',
            flavorText: '',
            keywords: effectToApply.tokenKeywords || [],
            isToken: true
          };
          stampCardOwner(tokenCard, isLocal, state.currentMatch?.myRole || null);
          const newTokenUnit = {
            card: tokenCard, tapped: false, summoningSickness: true, isAttacking: false,
            blockingIndex: null, damageTaken: 0, auras: []
          };
          stampPermanentController(newTokenUnit, isLocal, state.currentMatch?.myRole || null);
          if (hasKeyword(newTokenUnit, 'haste')) newTokenUnit.summoningSickness = false;
          board.push(newTokenUnit);
          dispatchGameEvent({type:'token_created',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card:tokenCard,item:newTokenUnit,amount:1,zoneFrom:'none',zoneTo:'battlefield',cause:'effect'});
          triggerCreatureEtb(isLocal, tokenCard, newTokenUnit);
        }
        logMsg(gameText('effect.token.create', { card: card.name, amount, token: effectToApply.tokenName }));
      }
      // PUNTO 7: REANIMAR DESDE EL CEMENTERIO — ahora el controlador ELIGE qué
      // criatura vuelve usando el selector general del Punto 6. El JSON histórico no cambia:
      // { type:'reanimate', amount:N } sigue siendo válido. En Solitario el Tano conserva su
      // criterio histórico de tomar la criatura válida más reciente (`botStrategy:'last'`).
      else if (effectToApply.type === 'reanimate') {
        const graveyard = isLocal ? state.localGraveyard : state.rivalGraveyard;
        const board = isLocal ? state.localCombat : state.rivalCombat;
        const amount = effectToApply.amount || 1;
        const chosenCards = await chooseGraveyardCards({
          zoneIsLocal: isLocal,
          chooserIsLocal: isLocal,
          filter: 'creature',
          amount,
          cardName: card.name,
          actionLabel: `elegí ${amount} criatura${amount > 1 ? 's' : ''} para reanimar`,
          botStrategy: 'last'
        });

        let revivedCount = 0;
        for (const revivedCard of chosenCards) {
          // La elección y la resolución pueden estar separadas por otro efecto interactivo.
          // Si una carta elegida ya abandonó el cementerio mientras tanto, simplemente no
          // puede reanimarse dos veces.
          const targetIdx = graveyard.indexOf(revivedCard);
          if (targetIdx === -1 || revivedCard.isToken || revivedCard.power === undefined) continue;
          graveyard.splice(targetIdx, 1);

          const newUnit = {
            card: revivedCard, tapped: false, summoningSickness: true, isAttacking: false,
            blockingIndex: null, damageTaken: 0, auras: []
          };
          if (hasKeyword(newUnit, 'haste')) newUnit.summoningSickness = false;
          stampPermanentController(newUnit, isLocal, state.currentMatch?.myRole || null);
          board.push(newUnit);
          triggerCreatureEtb(isLocal, revivedCard, newUnit);
          }

          if (revivedCard.etbEffect) {
            let etbTarget = null;
            if (revivedCard.requiresTarget) {
              // El target de una habilidad disparada se elige ANTES de que esa habilidad
              // entre a la Stack. Reusamos el selector general del Punto 7.
              etbTarget = await chooseResolvedEffectTarget({
                effect: revivedCard.etbEffect,
                sourceCard: revivedCard,
                sourceItem: newUnit,
                cardName: `ETB de ${revivedCard.name}`,
                controllerIsLocal: isLocal,
                chooserIsLocal: isLocal
              });
            }

            if (!revivedCard.requiresTarget || etbTarget) {
              queueTriggeredAbility({
                effect: revivedCard.etbEffect,
                sourceCard: revivedCard,
                sourceItem: newUnit,
                isLocal,
                targetObj: etbTarget,
                triggerType: 'reanimate_etb'
              });
            } else {
              logMsg(gameText('effect.etb.noLegalTarget', { card: revivedCard.name }));
            }
          }

          revivedCount++;
        }
        if (revivedCount > 0) {
          logMsg(gameText('effect.reanimate.done', { card: card.name, count: revivedCount }));
        } else {
          logMsg(gameText('effect.reanimate.none', { card: card.name }));
        }
      }
      // PUNTO 15 PRE-500: RECUPERAR CARTAS DEL CEMENTERIO A LA MANO.
      // El selector del Punto 6 decide QUÉ carta(s); esta rama sólo compromete el movimiento.
      // No usa target externo: siempre recupera desde el cementerio del controlador hacia
      // su propia mano. En multiplayer remoto, el dueño real ejecuta el movimiento.
      else if (effectToApply.type === 'return_lands_from_graveyard' || effectToApply.type === 'return_all_lands_from_graveyard') {
        const returnedNames = await resolveReturnLandsFromGraveyardEffect(effectToApply, card, isLocal);
        if (returnedNames.length > 0) logMsg(gameText('land.grave.returned', { card: card.name, count: returnedNames.length, cards: returnedNames.join(', ') }));
        else logMsg(gameText('land.grave.noneToReturn', { card: card.name }));
        recordTelemetryEvent('lands_returned_from_graveyard', { source:card.name, isLocal, count:returnedNames.length, type:effectToApply.type });
      }
      // PUNTO 15 PRE-500: RECUPERAR CARTAS DEL CEMENTERIO A LA MANO.
      else if (effectToApply.type === 'return_from_graveyard') {
        const returnedNames = await resolveReturnFromGraveyardEffect(effectToApply, card, isLocal);
        if (returnedNames.length > 0) {
          logMsg(gameText('effect.returnGrave.done', { card: card.name, cards: returnedNames.join(', ') }));
        } else {
          logMsg(gameText('effect.returnGrave.none', { card: card.name }));
        }
      }
      // LAND 3 — tutor avanzado de Tierras. `ramp` legacy queda como alias de
      // search_land(filter=basic,destination=battlefield) para que las cartas existentes
      // usen el mismo selector por carta, privacidad multiplayer, Landfall y mareo.
      else if (effectToApply.type === 'search_land' || effectToApply.type === 'ramp') {
        const searchEffect = effectToApply.type === 'ramp'
          ? {
              type: 'search_land',
              amount: effectToApply.amount || 1,
              filter: effectToApply.filter || 'basic',
              destination: effectToApply.destination || 'battlefield',
              allowFewer: true,
              reveal: false
            }
          : effectToApply;
        const result = await searchLibraryForLands({ isLocal, effect: searchEffect, cardName: card.name });
        if (result.selectedCount > 0) {
          logMsg(gameText('land.search.done', {
            card: card.name,
            count: result.selectedCount,
            cards: result.movedNames?.length ? result.movedNames.join(', ') : gameText('land.search.revealedFallback')
          }));
        } else {
          logMsg(gameText('land.search.none', { card: card.name }));
        }
      }
      else {
        await resolveSimpleDirectEffect(effectToApply, card, isLocal);
      }
    
}

// Clasificación única del vocabulario de efectos. Sirve desde ahora como contrato entre
// los JSON y el motor, y más adelante la va a reutilizar el validador formal del Card DB.
// Los efectos continuos (team_buff/team_keyword) no "resuelven" una vez: se consultan
// dinámicamente mientras el permanente está en mesa. Los counter* son control de la pila.
// Introspección del resolver para triggers SIN objetivo (Landfall hoy; el validador de
// Card DB podrá reutilizarla más adelante). No agrega un vocabulario paralelo: enumera los
// efectos discretos cuya semántica actual ya está definida sin target explícito.
export function canResolveGameEffectWithoutTarget(effectType) {
  return [
    'draw', 'loot', 'rummage', 'sacrifice', 'heal', 'damage', 'fog', 'draw_and_lose_life', 'drain', 'discard',
    'scry', 'surveil', 'proliferate', 'destroy_all_creatures', 'create_tokens',
    'reanimate', 'return_from_graveyard', 'return_lands_from_graveyard', 'return_all_lands_from_graveyard', 'ramp', 'search_land', 'animate_land', 'destroy_all_lands'
  ].includes(effectType);
}

// Complemento del contrato anterior: efectos que tienen una implementación REAL con
// targetObj en resolveTargetedGameEffect. Esto evita que una UI ofrezca `requiresTarget`
// sobre un tipo que el resolver sólo sabe ejecutar sin objetivo (p. ej. create_tokens).
// También lo reutilizan las habilidades de Lealtad del Punto 9 y el futuro validador JSON.
export function canResolveGameEffectWithTarget(effectType) {
  return [
    'damage', 'heal', 'prevent_damage', 'poison', 'discard', 'private_zone_move', 'exile_graveyard', 'prevent_attack', 'cant_attack_next_turn', 'gain_control', 'gain_control_until_eot',
    'pump', 'grant_keyword_temp', 'attach_equipment', 'fight', 'add_counter',
    'destroy_creature', 'exile_creature', 'exile_and_return', 'bounce',
    'destroy_artifact', 'destroy_enchantment', 'destroy_land', 'destroy_nonbasic_land'
  ].includes(effectType);
}

export function getEffectExecutionClass(effectType) {
  if ([
    'counter', 'counter_creature', 'counter_non_creature', 'counter_instant', 'counter_unless_pay',
    'counter_ability', 'counter_any'
  ].includes(effectType)) return 'stack_control';
  if (['team_buff', 'team_keyword'].includes(effectType)) return 'continuous';
  if ([
    'draw', 'loot', 'rummage', 'sacrifice', 'heal', 'damage', 'fog', 'draw_and_lose_life', 'drain', 'discard',
    'scry', 'surveil', 'proliferate', 'poison', 'prevent_damage', 'private_zone_move', 'exile_graveyard', 'prevent_attack', 'cant_attack_next_turn', 'gain_control', 'gain_control_until_eot',
    'pump', 'grant_keyword_temp', 'attach_equipment', 'fight', 'add_counter',
    'destroy_creature', 'exile_creature', 'exile_and_return', 'bounce',
    'destroy_artifact', 'destroy_enchantment', 'destroy_land', 'destroy_nonbasic_land', 'crew_vehicle', 'animate_land',
    'destroy_all_creatures', 'destroy_all_lands', 'create_tokens', 'reanimate', 'return_from_graveyard', 'return_lands_from_graveyard', 'return_all_lands_from_graveyard', 'ramp', 'search_land'
  ].includes(effectType)) return 'discrete';
  return 'unknown';
}

// ÚNICA puerta pública para ejecutar efectos discretos del juego.
// Retrocompatible: recibe los mismos objetos `effect` de los JSON actuales.
// `context` aporta el origen y, si existe, el target; el JSON NO necesita conocer
// nada de esta estructura interna. Los counterspells siguen siendo una operación de
// control de la pila y se orquestan en executeStackItem, pero el resto del vocabulario
// de efectos pasa por acá.
export async function resolveGameEffect(effect, context) {
  context = context || {};
  if (!effect) return { handled: false, reason: 'no_effect' };
  const card = context.sourceCard || {
    id: context.sourceId || `effect_${Date.now()}`,
    name: context.cardName || 'Efecto',
    colors: context.sourceColors || []
  };
  const item = context.stackItem || { sourceItem: context.sourceItem || null };
  const isLocal = context.isLocal !== false;
  const targetObj = context.targetObj || null;
  const effectToApply = resolveXInEffect(effect, context.xValue || 0);

  const executionClass = getEffectExecutionClass(effectToApply.type);
  if (executionClass !== 'discrete') {
    return { handled: false, reason: executionClass };
  }

  if (targetObj) {
    // CR 608.2b — puerta única de revalidación al resolver para TODOS los efectos discretos
    // con objetivo, no sólo triggered/loyalty. Si ganó Intocable/Protección, cambió de zona
    // o dejó de cumplir el filtro, el efecto no se aplica. Multi-target pasa por esta misma
    // puerta entrada por entrada, así que los objetivos restantes siguen resolviendo.
    if (targetObj.type !== 'stack' && !isResolvedEffectTargetLegal(targetObj, {
      effect: effectToApply, sourceCard: card, controllerIsLocal: isLocal, cardName: card.name
    })) {
      logMsg(gameText('stack.targetIllegalOnResolve', { kind:'hechizo o habilidad', ability:'', card:card.name }));
      return { handled:true, targetIllegal:true };
    }
    await resolveTargetedGameEffect(effectToApply, targetObj, {
      card, item, isLocal, enforceProtectionAll: !!context.enforceProtectionAll
    });
  } else {
    await resolveUntargetedGameEffect(effectToApply, { card, item, isLocal });
  }
  return { handled: true };
}

async function executeStackItem(item) {
  const { card, isLocal, targetObj, type } = item;

  // Mandar la carta que se está resolviendo a donde corresponda (cementerio normal, o
  // Exilio si vino por Flashback) — se llama en cada lugar donde el hechizo termina de
  // resolverse ANTES de llegar al final natural de la función (contrarrestar algo mal
  // targeteado, pagar/no pagar un "contrarresta a menos que", etc.), para que la carta
  // nunca desaparezca del juego sin ir a ningún lado.
  const sendResolvedCardAway = () => {
    // Una habilidad (activada o disparada) no es una carta física en la Stack: al terminar
    // o fallar, su fuente permanece donde esté. Este guard también protege futuras
    // habilidades disparadas que controlen la pila.
    if (type === 'ability') return;
    if (item.castFrom === 'flashback') {
      (isLocal ? state.localExile : state.rivalExile).push(card);
      dispatchGameEvent({type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card,zoneFrom:'stack',zoneTo:'exile',cause:'flashback'});
      logMsg(gameText('flashback.exileAfterResolve', { card: card.name }));
    } else {
      (isLocal ? state.localGraveyard : state.rivalGraveyard).push(card);
    }
  };

  if (type === 'planeswalker') {
    stampCardOwner(card, isLocal, state.currentMatch?.myRole || null);
    const pwZone = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
    const newPw = { card, loyalty: card.loyalty, abilityUsedThisTurn: false };
    stampPermanentController(newPw, isLocal, state.currentMatch?.myRole || null);
    pwZone.push(newPw);
    dispatchGameEvent({type:'permanent_entered',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card,item:newPw,zoneFrom:'stack',zoneTo:'battlefield',cause:'resolve'});
    logMsg(gameText('permanent.pw.enter', { card: card.name, loyalty: card.loyalty }));
    return;
  }

  if (type === 'summon' || type === 'permanent') {
    stampCardOwner(card, isLocal, state.currentMatch?.myRole || null);
    let newPermanentItem; 

    if (card.power !== undefined) {
      newPermanentItem = { 
        card, tapped: false, summoningSickness: true, isAttacking: false, 
        blockingIndex: null, damageTaken: 0, auras: [] 
      };

      if (hasKeyword(newPermanentItem, 'haste')) {
        newPermanentItem.summoningSickness = false;
      }
      
      stampPermanentController(newPermanentItem, isLocal, state.currentMatch?.myRole || null);
      const board = isLocal ? state.localCombat : state.rivalCombat;
      board.push(newPermanentItem);
      logMsg(gameText('permanent.creature.enter', { card: card.name }));
      triggerCreatureEtb(isLocal, card, newPermanentItem);

    } else {
      // enteredThisTurn: para que un Vehículo recién jugado y tripulado en el mismo turno
      // respete el mareo de invocación al convertirse en criatura (ver animate_land / LAND 1).
      newPermanentItem = { card, tapped: false, enteredThisTurn: true };
      // Los Equipos entran al campo sin equipar a nadie todavía (se equipan pagando Equipar).
      if (card.equipment) newPermanentItem.attachedTo = null;
      stampPermanentController(newPermanentItem, isLocal, state.currentMatch?.myRole || null);
      const supportZone = isLocal ? state.localSupport : state.rivalSupport;
      supportZone.push(newPermanentItem);
      dispatchGameEvent({type:'permanent_entered',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card,item:newPermanentItem,zoneFrom:'stack',zoneTo:'battlefield',cause:'resolve'});
      logMsg(gameText('permanent.support.enter', { card: card.name }));

      // Si es un Encantamiento estático que puede llevar resistencias a 0 (ej. Toque de
      // Queda), chequeamos muertes de inmediato, no solo tras el próximo daño de combate.
      if (card.staticEffect) {
        checkAllDeaths();
      }
    }

    if (card.etbEffect) {
      queueTriggeredAbility({
        effect: card.etbEffect,
        sourceCard: card,
        sourceItem: newPermanentItem,
        isLocal,
        targetObj: card.requiresTarget ? targetObj : null,
        triggerType: 'etb'
      });
    }
    return;
  }

  if (type === 'aura' && targetObj && targetObj.item) {
    // Un Aura es un hechizo dirigido mientras está en la Stack. Revalida Intocable,
    // Protección, lado permitido y presencia en battlefield justo antes de anexarse.
    if (!isResolvedEffectTargetLegal(targetObj, {
      cardLike: card, sourceCard: card, controllerIsLocal: isLocal, cardName: card.name
    })) {
      logMsg(gameText('stack.targetIllegalOnResolve', { kind:'Aura', ability:'', card:card.name }));
      sendResolvedCardAway();
      return;
    }
    stampCardOwner(card, isLocal, state.currentMatch?.myRole || null);
    attachAura(card, targetObj.item, isLocal);
    // Si es una Aura-maldición (-X/-X), la criatura puede morir en el acto.
    checkAllDeaths();
    return;
  }

  // Objetivos múltiples: cada entrada de card.targets[] tiene su propio efecto, ya
  // emparejado en orden con targetObj.targets[] (el jugador/el Tano los eligió uno por
  // uno, en ese mismo orden, al castear el hechizo).
  if (targetObj && targetObj.type === 'multi') {
    for (let i = 0; i < (card.targets || []).length; i++) {
      const spec = card.targets[i];
      const chosen = targetObj.targets[i];
      if (!chosen) continue;
      await resolveGameEffect(spec.effect, {
        sourceCard: card, isLocal, targetObj: chosen, stackItem: item, xValue: item.xValue || 0,
        enforceProtectionAll: true
      });
    }
    // BUG encontrado y arreglado: esto hacía return sin mandar la carta a ningún lado —
    // un hechizo multi-target resuelto desaparecía del juego entero, ni cementerio ni
    // Exilio. Mismo criterio de Flashback que el resto de los hechizos.
    moveResolvedSpellCard(card,item,isLocal);
    return;
  }

  if (type === 'spell' || type === 'instant' || type === 'ability') {
    let effectToApply = card.effect;
    
    if (type === 'ability') {
      if (item.source && item.source.type === 'etb') {
        effectToApply = card.etbEffect;
      } else if (item.ability?.effect) {
        // Punto 11: la pila conserva un snapshot/referencia de LA habilidad activada. Con
        // varias habilidades por permanente no podemos reconstruirla leyendo la primera.
        effectToApply = item.ability.effect;
      } else if (item.source && item.source.type === 'support_activation' && card.activatedAbility) {
        // Compatibilidad defensiva con objetos de pila viejos/pre-Punto-11.
        effectToApply = card.activatedAbility.effect;
      } else if (item.source && item.source.type === 'equipped_activation' && card.grantedAbility) {
        effectToApply = card.grantedAbility.effect;
      }
    }

    // Costo de maná variable ({X}): si el efecto usa "X" como cantidad, lo resolvemos acá
    // al valor real que el jugador (o el Tano) fijó al lanzar el hechizo — nunca antes.
    if (effectToApply) {
      effectToApply = resolveXInEffect(effectToApply, item.xValue || 0);
    }

    // Las habilidades disparadas y las Loyalty conservan el target fijado al entrar a la
    // Stack, pero ese objetivo se revalida al resolver. La fuente NO necesita seguir en
    // mesa: una Loyalty sigue existiendo aunque pagar el costo haya matado al Planeswalker.
    if (type === 'ability' && ['triggered', 'loyalty'].includes(item.abilityKind) && targetObj && targetObj.type !== 'stack') {
      const targetStillLegal = isResolvedEffectTargetLegal(targetObj, {
        effect: effectToApply,
        sourceCard: card,
        controllerIsLocal: isLocal,
        cardName: card.name
      });
      if (!targetStillLegal) {
        const kindLabel = item.abilityKind === 'loyalty' ? 'habilidad de Lealtad' : 'habilidad disparada';
        const abilityLabel = item.abilityKind === 'loyalty' && item.ability?.name ? ` "${item.ability.name}"` : '';
        logMsg(gameText('stack.targetIllegalOnResolve', { kind: kindLabel, ability: abilityLabel, card: card.name }));
        return;
      }
    }

    if (effectToApply && effectToApply.type && effectToApply.type.startsWith('counter')) {
      if (targetObj && targetObj.type === 'stack') {
        const targetIndex = spellStack.findIndex(s => s.id === targetObj.stackId);
        if (targetIndex !== -1) {
          const targetItem = spellStack[targetIndex];

          // Red de seguridad (además de lo que ya valida handleStackCardClick del lado
          // humano): un counter normal no puede frenar una habilidad, y uno tipo Stifle no
          // puede frenar un hechizo. Cubre sobre todo al Tano, que no pasa por esa validación.
          const targetIsAbility = targetItem.type === 'ability';
          const restriction = getCounterTargetRestriction(effectToApply.type);
          const targetTypeAllowed = targetIsAbility ? restriction.allowAbility : restriction.allowSpell;
          const targetIsCreatureSpell = !targetIsAbility && (
            targetItem.type === 'summon' ||
            targetItem.card?.power !== undefined ||
            targetItem.card?.type?.includes('Criatura')
          );
          const targetIsInstantSpell = !targetIsAbility && (
            targetItem.type === 'instant' ||
            targetItem.card?.type?.includes('Instantáneo')
          );
          const targetSubtypeAllowed =
            effectToApply.type !== 'counter_creature' || targetIsCreatureSpell;
          const targetNonCreatureAllowed =
            effectToApply.type !== 'counter_non_creature' || !targetIsCreatureSpell;
          const targetInstantAllowed =
            effectToApply.type !== 'counter_instant' || targetIsInstantSpell;
          if (!targetTypeAllowed || !targetSubtypeAllowed || !targetNonCreatureAllowed || !targetInstantAllowed) {
            const reason = effectToApply.type === 'counter_instant'
              ? 'no es un hechizo instantáneo'
              : (targetIsAbility ? 'es una habilidad, no un hechizo' : 'no coincide con la restricción de este counter');
            logMsg(gameText('counter.illegal', { card: card.name, target: targetItem.card.name, reason }));
            sendResolvedCardAway();
            return;
          }

          // "Contrarresta a menos que pague": el CONTROLADOR del hechizo amenazado decide,
          // no quien tira el counterspell. Si es tuyo, pausamos y te dejamos elegir. Si es
          // del rival: en Solitario, el Tano decide solo (paga si puede, sin UI — no hay
          // nadie del otro lado a quien preguntarle). En MULTIPLAYER, la decisión es de
          // VERDAD del rival — se la preguntamos por sync, en SU propia pantalla, en vez de
          // decidir nosotros mismos por él (ver requestRivalDecision, main.js — mecanismo
          // GENERAL, reusable para cualquier otra decisión futura del rival).
          if (effectToApply.type === 'counter_unless_pay') {
            const amount = effectToApply.amount;
            if (targetItem.isLocal) {
              // Guardamos también el propio counterspell (card/isLocal/castFrom) para que
              // payCounterTax/declineCounterTax lo puedan mandar a destino cuando
              // terminen de resolver esto — si no, se perdía sin ir a ningún lado.
              state.pendingCounterUnlessPay = { targetStackId: targetObj.stackId, amount, targetCardName: targetItem.card.name, counterCard: card, counterIsLocal: isLocal, counterCastFrom: item.castFrom };
              logMsg(gameText('counter.tax.ask', { card: card.name, target: targetItem.card.name, cost: `{${amount}}` }));
              return;
            } else if (state.currentMatch) {
              const rivalRole = otherRole(state.currentMatch.myRole);
              const response = await requestRivalDecision('counter_unless_pay', rivalRole, { amount, targetCardName: targetItem.card.name });
              if (response.paid) {
                logMsg(gameText('counter.tax.rivalPaid', { rival: getRivalName(), cost: `{${amount}}`, target: targetItem.card.name }));
                sendResolvedCardAway();
                return;
              }
              logMsg(gameText('counter.tax.rivalDeclined', { rival: getRivalName(), cost: `{${amount}}`, target: targetItem.card.name }));
              // sigue de largo: se contrarresta de verdad, como cualquier counter normal
            } else {
              const paid = tryAutoPayCounterTax(false, amount);
              if (paid) {
                logMsg(gameText('counter.tax.rivalPaid', { rival: getRivalName(), cost: `{${amount}}`, target: targetItem.card.name }));
                sendResolvedCardAway();
                return;
              }
              logMsg(gameText('counter.tax.rivalCantPay', { rival: getRivalName(), cost: `{${amount}}`, target: targetItem.card.name }));
              // sigue de largo: se contrarresta de verdad, como cualquier counter normal
            }
          }

          const counteredItem = spellStack.splice(targetIndex, 1)[0];
          logMsg(gameText('counter.done', { card: card.name, target: counteredItem.card.name }));
          // 23.15.5: primero resolvemos el destino real; luego el evento spell_countered
          // publica esa zona final (incluido un replacement Cementerio -> Exilio).
          const counterDestination=moveCounteredStackItemToDestination(counteredItem,state);
          dispatchGameEvent({type:'spell_countered',controllerIsLocal:counteredItem.isLocal!==false,actorIsLocal:isLocal,card:counteredItem.card,item:counteredItem,zoneFrom:'stack',zoneTo:counterDestination,cause:'counter'});
          if(counterDestination==='exile') dispatchGameEvent({
            type:'card_exiled',controllerIsLocal:counteredItem.isLocal!==false,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(counteredItem.card,counteredItem.isLocal!==false,state.currentMatch?.myRole||null),
            card:counteredItem.card,item:counteredItem,zoneFrom:'stack',zoneTo:'exile',cause:counteredItem.castFrom==='flashback'?'countered_flashback':'countered_replacement'
          });
          
          if (card.secondaryEffect && card.secondaryEffect.type === 'add_counter') {
            const friendlyBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (friendlyBoard.length > 0) {
              // Simplificación consciente: "hasta una criatura objetivo que controlás" pediría
              // una segunda selección de objetivo, independiente de a quién le contrarrestás el
              // hechizo — elegimos automáticamente tu criatura más fuerte en vez de sumar esa UI.
              const buffTarget = friendlyBoard.reduce((best, cur) =>
                getEffectivePower(cur) + getEffectiveToughness(cur) > getEffectivePower(best) + getEffectiveToughness(best) ? cur : best
              );
              addCounters(buffTarget, 'plusOne', card.secondaryEffect.amount || 1);
              logMsg(gameText('counter.buff', { card: card.name, target: buffTarget.card.name }));
            }
          }

        } else {
          logMsg(gameText('counter.targetGone', { card: card.name }));
        }
      } else {
        if (spellStack.length > 0) {
          const counteredItem = spellStack.pop();
          logMsg(gameText('counter.done', { card: card.name, target: counteredItem.card.name }));
          const counterDestination=moveCounteredStackItemToDestination(counteredItem,state);
          dispatchGameEvent({type:'spell_countered',controllerIsLocal:counteredItem.isLocal!==false,actorIsLocal:isLocal,card:counteredItem.card,item:counteredItem,zoneFrom:'stack',zoneTo:counterDestination,cause:'counter'});
          if(counterDestination==='exile') dispatchGameEvent({
            type:'card_exiled',controllerIsLocal:counteredItem.isLocal!==false,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(counteredItem.card,counteredItem.isLocal!==false,state.currentMatch?.myRole||null),
            card:counteredItem.card,item:counteredItem,zoneFrom:'stack',zoneTo:'exile',cause:counteredItem.castFrom==='flashback'?'countered_flashback':'countered_replacement'
          });
        } else {
          logMsg(gameText('stack.resolvedNoEffect', { card: card.name }));
        }
      }
    } 
    else {
      await resolveGameEffect(effectToApply, {
        sourceCard: card,
        isLocal,
        targetObj,
        stackItem: item,
        xValue: item.xValue || 0
      });
    }
    
    if (type !== 'ability') {
      // Flashback: al resolver, se exilía en vez de volver al cementerio (regla real de
      // Flashback — "úsala una vez, después se va del todo"). Cualquier otro casteo normal
      // sigue yendo al cementerio como siempre.
      moveResolvedSpellCard(card,item,isLocal);
    }
  }
}

export async function handleStackCardClick(item) {
  if (!state.pendingTargetCard) return;

  const effectType = state.pendingTargetCard.effect?.type;

  if (effectType && effectType.startsWith('counter')) {
    const isAbility = item.type === 'ability';
    const restriction = getCounterTargetRestriction(effectType);

    if (isAbility && !restriction.allowAbility) {
      logMsg(gameText('stack.counter.onlySpells'));
      return;
    }
    if (!isAbility && !restriction.allowSpell) {
      logMsg(gameText('counter.onlyAbilities'));
      return;
    }

    const isCreatureSpell = item.type === 'summon' || item.card?.power !== undefined;

    if (effectType === 'counter_creature' && !isCreatureSpell) {
      logMsg(gameText('counter.onlyCreature'));
      return;
    }

    if (effectType === 'counter_non_creature' && isCreatureSpell) {
      logMsg(gameText('counter.onlyNonCreature'));
      return;
    }

    const isInstantSpell = !isAbility && (item.type === 'instant' || item.card?.type?.includes('Instantáneo'));
    if (effectType === 'counter_instant' && !isInstantSpell) {
      logMsg(gameText('counter.onlyInstant'));
      return;
    }

    if (state.pendingCastTransaction?.stage === 'targets') {
      await completeCastTargetDeclaration({ type:'stack', stackId:item.id });
      return;
    }

    const spellIndex = state.pendingSpellIndex;
    const playedCard = state.localHand.splice(spellIndex, 1)[0];

    const castStackItem = {
      card: playedCard,
      isLocal: true,
      targetObj: { type: 'stack', stackId: item.id },
      type: 'instant',
      castFrom: state.pendingCastFrom,
      kicked: state.pendingKicked
    };
    addToStack(castStackItem);

    state.consecutivePasses = 0;
    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.pendingTargetCard = null;
    state.pendingCastFrom = null;
    state.pendingKicked = null;
    state.pendingAlternativeCostChosen = false;
    state.pendingCompositeCostPayment = false;
    state.pendingSpellCostsIrreversible = false;
    state.pendingHybridLifePayment = null;
    state.tappedLandsThisSpell = [];

    logMsg(gameText('stack.targeted', { card: playedCard.name, target: item.card.name }));
    render();
    await triggerSpellCast(true, playedCard, castStackItem);
    // Este selector especial no vuelve por main.executeSpellOnTarget; reanudamos por el
    // wrapper existente recién DESPUÉS de completar todos los triggers de casteo.
    resumeAfterInteractiveEffect();
  }
}

let stackPreviewEl = null;
function getStackPreviewEl() {
  if (!stackPreviewEl) {
    stackPreviewEl = document.createElement('div');
    stackPreviewEl.id = 'stack-hover-preview';
    document.body.appendChild(stackPreviewEl);
  }
  return stackPreviewEl;
}

function showStackHoverPreview(item, anchorEl) {
  const preview = getStackPreviewEl();
  preview.innerHTML = '';

  // zone: 'preview' no matchea ninguna rama de clicks de createCardElement, así que
  // esta carta queda puramente decorativa (no se le puede hacer click).
  const cardEl = createCardElement(item, false, item.isLocal, null, 'preview');
  cardEl.style.width = '190px';
  cardEl.style.height = `${190 * 7 / 5}px`;
  preview.appendChild(cardEl);

  const stackContainer = document.getElementById('stack-container');
  const containerRect = stackContainer.getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();

  preview.style.left = `${containerRect.left - 210}px`;
  const previewHeight = 190 * 7 / 5;
  let top = anchorRect.top + (anchorRect.height / 2) - (previewHeight / 2);
  top = Math.max(10, Math.min(top, window.innerHeight - previewHeight - 10));
  preview.style.top = `${top}px`;

  preview.classList.add('visible');
}

function hideStackHoverPreview() {
  if (stackPreviewEl) stackPreviewEl.classList.remove('visible');
}

export function renderStack() {
  const container = document.getElementById('stack-container');
  const list = document.getElementById('stack-list');
  const countSpan = document.getElementById('stack-count');

  if (!container || !list) return;

  if (spellStack.length === 0) {
    container.classList.add('hidden');
    hideStackHoverPreview();
    return;
  }

  container.classList.remove('hidden');
  countSpan.textContent = spellStack.length;
  list.innerHTML = '';

  const pendingEffect = state.pendingTargetCard?.effect?.type;
  
  spellStack.forEach((item, index) => {
    const isTop = index === spellStack.length - 1;
    const cardDiv = document.createElement('div');

    const isCreatureSpell = item.type === 'summon' || item.card?.power !== undefined;
    const isAbilityItem = item.type === 'ability';

    let isTargetingCounter = false;
    if (pendingEffect && pendingEffect.startsWith('counter')) {
      const restriction = getCounterTargetRestriction(pendingEffect);
      const typeAllowed = isAbilityItem ? restriction.allowAbility : restriction.allowSpell;
      if (typeAllowed) {
        isTargetingCounter = isStackItemLegalCounterTarget(pendingEffect, item);
      }
    }
    const targetableClass = isTargetingCounter ? 'targetable-stack' : '';

    cardDiv.className = `stack-item-card ${item.isLocal ? 'local' : 'rival'} ${isTop ? 'top-item' : ''} ${targetableClass}`;
    
    let targetText = 'Sin objetivo';
    if (item.targetObj) {
      if (item.targetObj.type === 'player') {
        targetText = `Objetivo: ${item.targetObj.isLocal ? 'Vos' : 'Rival'}`;
      } else if (item.targetObj.type === 'creature') {
        targetText = `Objetivo: ${item.targetObj.item?.card?.name || 'objetivo ausente'}`;
      } else if (item.targetObj.type === 'permanent') {
        targetText = `Objetivo: ${item.targetObj.item?.card?.name || 'objetivo ausente'}`;
      } else if (item.targetObj.type === 'stack') {
        targetText = `Objetivo: Hechizo en pila #${item.targetObj.stackId}`;
      }
    }

    const ownerText = item.isLocal ? 'Vos' : getRivalName();
    const isTriggeredAbility = item.type === 'ability' && item.abilityKind === 'triggered';
    const isLoyaltyAbility = item.type === 'ability' && item.abilityKind === 'loyalty';
    const itemTitle = isTriggeredAbility
      ? `${item.card.name} — ${item.triggerLabel || 'Habilidad disparada'}`
      : isLoyaltyAbility
        ? `${item.card.name} — ${item.ability?.name || 'Habilidad de Lealtad'}`
        : item.card.name;
    const ownerLabel = (isTriggeredAbility || isLoyaltyAbility) ? 'Controlada por' : 'Lanzado por';
    const kindText = isTriggeredAbility
      ? '<div class="stack-item-meta"><strong>Habilidad disparada</strong></div>'
      : isLoyaltyAbility
        ? '<div class="stack-item-meta"><strong>Habilidad de Lealtad</strong></div>'
        : '';
    const triggerProvenance = isTriggeredAbility ? getTriggerProvenance(item) : '';
    const provenanceText = triggerProvenance
      ? `<div class="stack-item-meta stack-trigger-provenance">Disparada por: <strong>${triggerProvenance}</strong></div>`
      : '';

    cardDiv.innerHTML = `
      <div class="stack-item-title">${isTop ? '▶ ' : ''}${itemTitle}</div>
      ${kindText}
      ${provenanceText}
      <div class="stack-item-meta">${ownerLabel}: <strong>${ownerText}</strong></div>
      <div class="stack-item-meta">${targetText}</div>
    `;

    if (isTargetingCounter) {
      cardDiv.addEventListener('click', () => handleStackCardClick(item));
    }

    // Vista previa completa de la carta al pasar el mouse — así un jugador que no
    // conoce todas las cartas de memoria puede ver qué hace antes de decidir si
    // contrarrestarla o dejarla pasar.
    cardDiv.addEventListener('mouseenter', () => showStackHoverPreview(item, cardDiv));
    cardDiv.addEventListener('mouseleave', hideStackHoverPreview);

    list.appendChild(cardDiv);
  });

}
