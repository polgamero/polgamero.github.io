import { addToStack, spellStack, replaceSpellStackFromSync, resolveGameEffect, canResolveGameEffectWithoutTarget, canResolveGameEffectWithTarget } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { executeLocalAttack, executeRivalAttack, resolveCombatDamage, checkDeaths } from './combatRules.js';
import { checkRivalCounterOrResponse, takeBotPriorityAction, castSuspendedCardForBot } from './bot.js';
import { setupBoardLayout, render, logMsg, els, showGameOverOverlay, getTargetRules, showDeckSelectionModal, showPlayDeckPickerModal, showMainMenu, updateAccountUI, showMulliganModal, showBottomCardsModal, showLoyaltyAbilityModal, showXValueModal, showModalSpellChoice, showScrySurveilModal, showProliferateModal, showKickerModal, showAbandonConfirmModal, showReconnectPrompt, showSoloRecoveryPrompt, showCounterTaxDecisionModal, showSacrificeEffectModal, showGraveyardChoiceModal, showHandDiscardChoiceModal, showActivatedAbilityModal, showMultiplayerReadyBarrier, hideMultiplayerReadyBarrier, showAlternativeCostModal, showPrivateZoneChoiceModal, showDailyLoginRewardModal, showManaColorChoiceModal, showManaOrAbilityChoiceModal, showLandSearchModal, showLibrarySearchModal, showLegendRuleChoiceModal, showTriggerOrderModal, showCostPaymentResourceModal, showPhyrexianCostChoiceModal, showCopyRetargetModal, showStackObjectChoiceModal, showSuspendCastModal, showSuspendedCardChoiceModal, showCreatureTypeChoiceModal } from './ui.js';
import { buildRandomDeck, getLastRandomDeckReport, buildDeckFromCardIds, parseManaCost, sumManaCosts, getLandColor, sleep, shuffle, moveBattlefieldCardToZone, isSacrificeCandidate, removeRandomCardsFromHand, moveCounteredStackItemToDestination, createRemoteDecisionQueue, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming, normalizeCompositeCost, getCompositeCostManaString, cardMatchesDiscardCost, describeCompositeCost, compositeCostHasNonMana, combineManaCostStrings, getProliferateCandidates } from './utils.js';
import { isLandPermanent, isCreaturePermanent, landMatchesFilter, getPermanentTypes } from './permanentTypes.js';
import { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority, resolveBothPassed, processMyTurnStart, beginActivePlayerPriorityWindow, resetPriorityClock, syncPriorityClockFromNetwork } from './turnManager.js';
import { hasKeyword, canBlock, getProtectionMatch } from './keywords.js';
import { preloadFirebaseClient, onAuthChange, waitForInitialAuthState, loadUserProfile, createUserProfile, reserveInitialUsername, signOutUser, registerDailyLogin, awardPoints, flushPendingGameRewards, loadGameConfig, loadGameTextOverrides, ensureClassifiedsSchedule, publishMyPublicState, publishMyPrivateState, listenToMatch, fetchMatchForReconnect, clearActiveMatchId, uploadTelemetrySession, setMatchPlayerReady, publishPrivateSelectionOffer, fetchPrivateSelectionOffer, deletePrivateSelectionOffer, bootstrapPlayerStatistics, recordPlayerGameResult, finalizeTelemetryLifecycleSession, touchMatchPresence } from './firebaseClient.js';
import { POINTS, applyGameConfig } from './store.js';
import { buildMyPublicPatch, buildMyPrivatePatch, extractRivalStateFromPublicDoc, extractSharedStateFromPublicDoc, extractMyStateFromPublicDoc, serializeStackForPublic, deserializeStackFromPublic, serializeStackTarget, deserializeStackTarget, serializeBoardItemRef, deserializeBoardItemRef, otherRole, refreshStackBoardRefs, relinkEquipmentAttachments } from './matchSync.js';
import { initTelemetry, startTelemetrySession, endTelemetrySession, recordTelemetryEvent, recordTelemetryNetwork, recordTelemetryDecision, recordTelemetryInitialDecks, getTelemetryStatus } from './telemetry.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, ENGINE_BUILD_LABEL, BUILD_MANIFEST_URL, isExactMultiplayerVersionCompatible } from './version.js';
import { MULTIPLAYER_TEST_DECK_NAME, buildMultiplayerTestDeck } from './testDeck.js';
import { stampCardOwner, zoneForCardOwner, cardOwnerIsLocal } from './zoneOwnership.js';
import { PRIVATE_ZONE_VISIBILITY, PRIVATE_ZONE_FILTERS, buildPrivateZoneOffer, resolvePrivateZoneSelection } from './privateZoneProtocol.js';
import { isUsernameConfigured } from './usernames.js';
import { showUsernameSetupModal } from './usernameUI.js';
import { applyGameTextOverrides, gameText } from './gameTexts.js';
import { POOL_BASELINE } from './poolContract.js';
import { chooseSoloStartingSide, normalizeStartingRole, startingSideForRole } from './startingPlayer.js';
import { showStartingCoinToss } from './startingCoin.js';
import { createSoloGameId, beginSoloRecoverySession, activateResumedSoloRecovery, loadSoloRecoveryCandidate, isSoloRecoveryCompatible, isSoloRecoveryExpired, restoreSoloRecoveryState, checkpointSoloRecovery, clearSoloRecovery, finishSoloRecovery, getSoloEffectiveElapsedMs, getActiveSoloGameId, hasActiveSoloRecovery } from './soloRecovery.js';
import { maybeShowAnnouncementPopup } from './campaignsUI.js';
import { enterGameplayAudio } from './audioManager.js';
import { emptyManaPool, cloneManaPool, addMana, manaPoolTotal, manaCostTotal, spendOneMana, spendAvailableTowardCost } from './manaPool.js';
import { normalizeManaAbility, isManaSourceCard, getManaSourceOptions, getManaSourceAmount, manaSourceRequiresTap, manaSourceSacrificesSelf, canActivateManaSourcePermanent } from './manaSources.js';
import { isLandCard, landGraveyardFilterMatches, hasLandPlayFromGraveyardPermission as hasLandGYPermission, playableLandGraveyardEntries } from './landGraveyard.js';
import { normalizeLandSearchEffect, getLandSearchCandidates, chooseBotLandSearchEntries, shuffleLibraryInPlace } from './landSearch.js';
import { normalizeLibraryEffect, getLibraryWindowEntries, getLibraryEligibleEntries, chooseBotLibraryEntries, libraryCardMatchesFilter, libraryCardCanMoveToDestination } from './libraryEngine.js';
import { shouldLandEnterTapped, getLandManaTriggerEntries, getLandManaBonuses } from './landStax.js';
import { getEffectiveLandManaAbility, getEffectiveLandActivatedAbilities, getEffectiveLandPrintedKeywords, landRulesTextSuppressed, landMatchesEffectiveFilter, getEffectiveLandTypeLine, describeLandTransformation } from './landCharacteristics.js';
import { evaluateStateBasedActions, hasMechanicalStateActions, SBA_MAX_PASSES } from './rulesKernel.js';
import { buildApnapTriggerGroups, stackPlacementFromResolutionOrders } from './triggerOrdering.js';
import { controllerRoleForSide, stampPermanentController, permanentControllerRole, makeControlEffect, addControlEffect, expireEndOfTurnControlEffects, removeSourceBoundControlEffects, deriveNextControlEffectSerial } from './controlEngine.js';
import { normalizeGameEvent, collectGenericEventMatches } from './eventEngine.js';
import { applySpellCostModifiers, getSpellPaymentMethods, getConvokeCandidates, applyConvokeToCost, applyDelveToCost, applyPhyrexianLifeToCost, planAutomaticPaymentMethods, parsedManaTotal, costEngineSummary } from './costEngine.js';
import { resolveReplacementEvent, replacementEngineSummary } from './replacementEngine.js';
import { normalizeCounterType, changeCounterCount, getCounterCount, counterStatDelta, resolveUntapAttempt, getCounterDefinition } from './counterEngine.js';
import { isSagaCard, buildSagaChapterTriggerDescriptors, shouldSacrificeSaga, getSagaFinalChapter, getSagaLoreCount } from './sagaEngine.js';
import { EXILE_PLAY_ENGINE_VERSION, ensureExileObjectId, grantExilePlayPermission, findExilePlayPermission, permissionBaseManaOverride, consumeExilePlayPermission, clearExilePlayStateOnLeave, expireExilePermissionsAtCleanup, isLandExileCard, exilePermissionSummary } from './exilePlayEngine.js';
import { SUSPEND_ENGINE_VERSION, normalizeSuspendSpec, hasSuspend, markCardSuspended, clearSuspendState, isSuspendedCard, suspendedTimeCount, buildSuspendUpkeepTrigger, removeSuspendTimeCounterStorage, addSuspendTimeCounterStorage, buildSuspendCastTrigger } from './suspendEngine.js';
import { initializeTransformPermanentItem, canTransformPermanent } from './transformEngine.js';
import { cardHasSubtype, cardsShareCreatureType, typalFilterMatches, buildCreatureTypeCatalog, chooseBestCreatureType, setChosenCreatureType } from './typalEngine.js';
import { botDeckQuality, normalizeBotDifficulty } from './botDifficulty.js';

globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('main_module_evaluated');

const COLOR_LABELS = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde', C: 'Incoloro' };

// Fase 1: rastrea la carga (asíncrona) del perfil de Firestore del usuario logueado.
// initGame la espera ANTES de decidir si hay que crear una colección inicial — sin esto,
// si alguien logueado aprieta "Jugar" muy rápido después de loguearse, state.userProfile
// todavía podría estar en null aunque YA tenga una cuenta real, y le pisaríamos la
// colección/puntos existentes con una colección "inicial" nueva por error de timing.
let userProfileLoadPromise = Promise.resolve();

export async function ensureMenuIdentityReady() {
  await waitForInitialAuthState();
  if (state.currentUser) await userProfileLoadPromise;
  if (state.currentUser && (!state.userProfile || state.userProfile.starterDeckPending === true)) throw new Error('AUTH_PROFILE_NOT_READY');
  return { authenticated: !!state.currentUser, user: state.currentUser, profile: state.userProfile };
}


let multiplayerPresenceTimer = null;
function stopMultiplayerPresenceHeartbeat() {
  if (multiplayerPresenceTimer !== null) clearInterval(multiplayerPresenceTimer);
  multiplayerPresenceTimer = null;
}
function startMultiplayerPresenceHeartbeat(matchId, myRole) {
  stopMultiplayerPresenceHeartbeat();
  if (!matchId || !['host','guest'].includes(myRole)) return;
  const beat = () => {
    if (!state.currentMatch || state.currentMatch.matchId !== matchId || state.gameOver) {
      stopMultiplayerPresenceHeartbeat();
      return;
    }
    touchMatchPresence(matchId, myRole).catch(err => console.warn('No se pudo publicar heartbeat multiplayer:', err));
  };
  beat();
  multiplayerPresenceTimer = setInterval(beat, 30000);
}

function currentSoloLifecycleDurationMs() {
  return hasActiveSoloRecovery() ? getSoloEffectiveElapsedMs() : (getTelemetryStatus().elapsedMs || 0);
}


// 23.13.0 — una sola puerta para registrar el login diario después de tener un perfil real.
// Firestore hace la operación idempotente, así que un callback duplicado/reload el mismo día
// no duplica streak ni premio. La UI de claim aparece sólo en el primer login calendario.
async function processDailyLoginRewards({ showModal = true } = {}) {
  if (!state.currentUser || !state.userProfile) return null;
  try {
    const result = await registerDailyLogin(state.currentUser.uid);
    state.userProfile = { ...result.profile, rewardDebugOffsetDays: result.login?.debugOffsetDays || 0 };
    updateAccountUI(state.currentUser);
    // En bootstrap 23.13.62 el modal se difiere deliberadamente para serializar overlays:
    // Daily primero, anuncio después. Los otros callers conservan el comportamiento previo.
    if (showModal && result.login?.newCalendarLogin) {
      void showDailyLoginRewardModal(result.login);
    }
    return result;
  } catch (err) {
    console.error('No se pudo registrar la recompensa diaria:', err);
    recordTelemetryEvent('daily_login_reward_failed', {
      code: err?.code || err?.name || 'ERROR',
      message: err?.message || String(err)
    }, 'warning');
    // No bloquea login ni gameplay: el usuario puede seguir jugando y reintentar al volver.
    return null;
  }
}


async function mobileSoloYield(stage, detail = null) {
  if (globalThis.__ARGENTINIA_PHONE_SURFACE__ !== true) return;
  try {
    const payload = JSON.stringify({ stage, detail, at: Date.now(), engineVersion: ENGINE_VERSION });
    sessionStorage.setItem('argentinia.mobile.lastRuntimeStage.v1', payload);
    localStorage.setItem('argentinia.mobile.lastRuntimeStage.v1', payload);
  } catch {}
  globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('solo_start_stage', { stage, detail });
  // Corta el arranque de Solitario en tareas pequeñas para que Chrome pueda pintar y
  // procesar input entre board/decks/telemetría/mulligan. Desktop no entra acá.
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function scheduleMobileFirebasePrewarm() {
  if (globalThis.__ARGENTINIA_PHONE_SURFACE__ !== true) return;
  const run = () => {
    globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('firebase_mobile_prewarm_start');
    preloadFirebaseClient()
      .then(() => globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('firebase_mobile_prewarm_ready'))
      .catch(error => globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('firebase_mobile_prewarm_failed', { code: error?.code || null, message: error?.message || String(error) }));
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 900);
}

export { logMsg, render } from './ui.js';
export { parseManaCost, getLandColor, sleep } from './utils.js';


function battlefieldControllerRole(isLocal) {
  return controllerRoleForSide(!!isLocal, state.currentMatch?.myRole || null);
}

function findBattlefieldItemLocation(item) {
  const specs = [
    ['combat', true, state.localCombat], ['combat', false, state.rivalCombat],
    ['support', true, state.localSupport], ['support', false, state.rivalSupport],
    ['land', true, state.localLands], ['land', false, state.rivalLands],
    ['planeswalker', true, state.localPlaneswalkers], ['planeswalker', false, state.rivalPlaneswalkers]
  ];
  for (const [zoneName,isLocal,zone] of specs) {
    const index = zone.indexOf(item);
    if (index >= 0) return { zoneName, isLocal, zone, index };
  }
  return null;
}

function battlefieldZoneForController(zoneName, isLocal) {
  if (zoneName === 'combat') return isLocal ? state.localCombat : state.rivalCombat;
  if (zoneName === 'support') return isLocal ? state.localSupport : state.rivalSupport;
  if (zoneName === 'land') return isLocal ? state.localLands : state.rivalLands;
  if (zoneName === 'planeswalker') return isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
  return null;
}

function repairCombatLinksAfterControllerMove({ fromIsLocal, fromIndex, zoneName }) {
  if (zoneName !== 'combat' || fromIndex == null || fromIndex < 0) return;
  // blockingIndex siempre apunta al índice del atacante del bando activo. Si el permanente
  // removido pertenecía a ese array, los bloqueadores que lo señalaban dejan de bloquearlo
  // y los índices mayores se corren una posición por el splice.
  const removedFromActiveAttackers = (state.activePlayer === 'local' && fromIsLocal) || (state.activePlayer === 'rival' && !fromIsLocal);
  if (!removedFromActiveAttackers) return;
  const defenders = fromIsLocal ? state.rivalCombat : state.localCombat;
  for (const defender of defenders) {
    const idx = defender?.blockingIndex;
    if (idx === null || idx === undefined) continue;
    if (idx === fromIndex) defender.blockingIndex = null;
    else if (idx > fromIndex) defender.blockingIndex = idx - 1;
  }
}

function isRoleLocal(role) {
  const myRole = state.currentMatch?.myRole || null;
  if (myRole === 'host' || myRole === 'guest') return role === myRole;
  return role !== 'rival';
}

function ensureControlEffectSerialAfterHydration() {
  const current = Math.max(1, Number(state.controlEffectSerial) || 1);
  const derived = deriveNextControlEffectSerial(state);
  state.controlEffectSerial = Math.max(current, derived);
  return state.controlEffectSerial;
}

export function changePermanentController(item, toIsLocal, options = {}) {
  const loc = findBattlefieldItemLocation(item);
  if (!loc) return false;
  const myRole = state.currentMatch?.myRole || null;
  stampCardOwner(item.card, loc.isLocal, myRole);
  stampPermanentController(item, loc.isLocal, myRole);
  const previousRole = permanentControllerRole(item, loc.isLocal, myRole);
  const newRole = battlefieldControllerRole(!!toIsLocal);
  const effect = makeControlEffect({
    controllerRole: newRole,
    duration: options.duration || 'indefinite',
    sourceId: options.sourceId || null,
    expiresAtTurn: options.expiresAtTurn ?? (options.duration === 'until_end_of_turn' ? state.turnCount : null),
    serial: state.controlEffectSerial++
  });
  addControlEffect(item, effect);
  if (loc.isLocal !== !!toIsLocal) {
    // Suspend 702.62: la criatura obtiene Haste sólo hasta que su controlador la pierda.
    // El flag pertenece al objeto permanente, no a la carta copiable.
    if (item._suspendHaste) item._suspendHaste = false;
    loc.zone.splice(loc.index, 1);
    repairCombatLinksAfterControllerMove({ fromIsLocal: loc.isLocal, fromIndex: loc.index, zoneName: loc.zoneName });
    const destination = battlefieldZoneForController(loc.zoneName, !!toIsLocal);
    destination.push(item);
  }
  // 302.6 / LAND 1 — cambiar de controlador reinicia el reloj de control continuo.
  // `enteredThisTurn` es también el flag histórico que consultan man-lands/Vehículos al
  // convertirse en criatura; por eso una Tierra/Vehicle robada no puede atacar de inmediato.
  if (loc.isLocal !== !!toIsLocal) item.enteredThisTurn = true;
  // 506.4: un permanente que cambia de controlador deja de atacar/bloquear.
  if (loc.zoneName === 'combat' && loc.isLocal !== !!toIsLocal) {
    item.isAttacking = false;
    item.blockingIndex = null;
    item.attackTarget = null;
    item.summoningSickness = !hasKeyword(item, 'haste');
  }
  if (options.untap) attemptUntapPermanent(item,{cause:'control_change',actorIsLocal:!!toIsLocal});
  if (options.grantHaste && loc.zoneName === 'combat') {
    item.tempEffects = Array.isArray(item.tempEffects) ? item.tempEffects : [];
    item.tempEffects.push({ type:'keyword', keyword:'haste', until:'end_of_turn', sourceName: options.sourceName || 'Cambio de control' });
    item.summoningSickness = false;
  }
  item._controllerRole = newRole;
  logMsg(gameText('control.gained', { card:item.card?.name || gameText('control.permanentFallback'), controller: toIsLocal ? getLocalPlayerName() : getRivalName() }));
  recordTelemetryEvent('permanent_control_changed', { card:item.card?.name || null, previousRole, newRole, duration:effect.duration, zone:loc.zoneName });
  return true;
}

function relocatePermanentToEffectiveController(item) {
  const loc = findBattlefieldItemLocation(item);
  if (!loc) return false;
  const role = permanentControllerRole(item, loc.isLocal, state.currentMatch?.myRole || null);
  const shouldLocal = isRoleLocal(role);
  if (shouldLocal === loc.isLocal) return false;
  loc.zone.splice(loc.index,1);
  repairCombatLinksAfterControllerMove({ fromIsLocal: loc.isLocal, fromIndex: loc.index, zoneName: loc.zoneName });
  battlefieldZoneForController(loc.zoneName, shouldLocal).push(item);
  item.enteredThisTurn = true;
  if (loc.zoneName === 'combat') {
    item.isAttacking=false;
    item.blockingIndex=null;
    item.attackTarget=null;
    item.summoningSickness = !hasKeyword(item,'haste');
  }
  return true;
}

export function removeControlEffectFromPermanent(item, sourceId, { silent = false } = {}) {
  const before = findBattlefieldItemLocation(item);
  if (!before) return false;
  const removed = removeSourceBoundControlEffects(item, sourceId);
  if (!removed.length) return false;
  const moved = relocatePermanentToEffectiveController(item);
  if (!silent) logMsg(gameText('control.auraEnded', { card:item.card?.name || gameText('control.permanentFallback') }));
  return moved || true;
}

export function expireTemporaryControlEffects() {
  const all=[...state.localCombat,...state.rivalCombat,...state.localSupport,...state.rivalSupport,...state.localLands,...state.rivalLands,...state.localPlaneswalkers,...state.rivalPlaneswalkers];
  const unique=[...new Set(all)];
  let changed=0;
  for (const item of unique) {
    const beforeRole = permanentControllerRole(item, !!findBattlefieldItemLocation(item)?.isLocal, state.currentMatch?.myRole || null);
    const removed=expireEndOfTurnControlEffects(item,state.turnCount);
    if (!removed.length) continue;
    const moved=relocatePermanentToEffectiveController(item);
    const after=findBattlefieldItemLocation(item);
    if (moved && after) logMsg(gameText('control.returned', { card:item.card?.name || gameText('control.permanentFallback'), controller: after.isLocal ? getLocalPlayerName() : getRivalName() }));
    if (beforeRole !== permanentControllerRole(item, after?.isLocal ?? true, state.currentMatch?.myRole || null)) changed++;
  }
  return changed;
}
export { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority, beginActivePlayerPriorityWindow } from './turnManager.js';

export const state = {
  turnCount: 1,
  isPlayerTurn: true,
  activePlayer: 'local',    // 'local' o 'rival'
  priorityPlayer: 'local',  // 'local' o 'rival'
  consecutivePasses: 0,
  // ENTREGA 23.9: reloj de prioridad multiplayer. serial/duración/activity son públicos;
  // deadline/remaining/paused son locales y nunca cruzan Firestore.
  priorityClockSerial: 0,
  priorityClockDurationMs: 15000,
  priorityActivity: null,
  priorityClockDeadlineLocalMs: 0,
  priorityClockRemainingMs: 15000,
  priorityClockPausedLocal: true,
  priorityClockPauseReasonLocal: 'not_started',
  // Entrega 20 / Trigger Stack: serial local monotónico para detectar si un evento
  // automático generó habilidades disparadas que abren una ventana de prioridad.
  triggerStackSerial: 0,
  
  // Fases: 'untap', 'upkeep', 'draw', 'main1', 
  // 'combat_begin', 'combat_attackers', 'combat_blockers', 'combat_damage', 'combat_end',
  // 'main2', 'end_step', 'cleanup'
  phase: 'main1', 
  gameOver: false,

  // Dificultad del Tano (Grupo C, Etapa 4): 'hard' (default) usa todo lo construido en las
  // Etapas 1-3 (reacciona en velocidad instantánea, evalúa trades al Pelear, prioriza
  // remoción/desarrollo al elegir carta). 'easy' vuelve al comportamiento de base: solo
  // actúa en su propio turno, pelea únicamente si es gratis, y juega la primera carta que
  // puede pagar sin ningún criterio de prioridad. Se cambia desde el menú de Opciones
  // (ver showOptionsMenu en ui.js) — no hay forma de cambiarla a mitad de partida.
  botDifficulty: 'medium',
  // 23.17.1 — diagnóstico del constructor competitivo; no participa de reglas/sync.
  localDeckBuildReport: null,
  rivalDeckBuildReport: null,

  // Fase 0 del multiplayer: null si no hay nadie logueado (Solitario funciona igual, sin
  // persistencia — el login es opcional). Si hay sesión, es un objeto chico normalizado
  // { uid, displayName, photoURL, email, username?, usernameKey? } — Auth conserva los datos
  // Google internamente, pero TODO nombre visible usa username Argentinia (23.13.24).
  // (main.js), nunca hay que tocarlo a mano desde otro lado.
  currentUser: null,
  // 23.13.52 — identity bootstrap gate: no se decide guest vs. usuario real mientras
  // Firebase Auth/perfil todavía están restaurando la sesión después de F5.
  authInitialResolved: false,
  authIdentityReady: false,
  // Fase 1: el documento de Firestore del jugador logueado (puntos, colección de cartas,
  // mazos) — null si no hay sesión, O si hay sesión pero todavía no se determinó si ya
  // existe (mientras se está cargando) o si es su primera vez (ver userProfileLoadPromise
  // en boot(), main.js). getOwnedCardIds() en ui.js lee esto para el grisado real de la
  // Enciclopedia; si es null, por ahora se ve el pool completo (mismo criterio de siempre).
  userProfile: null,

  // Fase 4, Etapa 2: null durante Solitario (el 100% de las partidas hasta que el
  // multiplayer esté completo) — nunca se publica nada a Firestore en ese caso. Cuando una
  // partida multiplayer arranca de verdad, pasa a { matchId, myRole } ('host' o 'guest'),
  // y ahí sí render() (ui.js) publica mi mitad del estado después de cada cambio real.
  currentMatch: null,
  // Fase 4, Etapa 6: null mientras nadie abandonó. 'local' si abandoné yo (mi propio botón
  // ya lo maneja directo, sin pasar por acá); 'rival' si el rival abandonó — esto es lo que
  // mi sync trae de vuelta y checkGameOver() usa para saber que gané por abandono ajeno.
  abandonedBy: null,
  // Puramente local — NUNCA se sincroniza (no es parte de matchSync.js). gameOver y
  // abandonedBy llegan JUNTOS en el mismo publish cuando el rival abandona, así que
  // checkGameOver() no puede usar el propio state.gameOver como guard de "ya lo procesé" en
  // este caso puntual (ya llegaría en true). Este flag cumple ese rol aparte.
  abandonProcessedLocally: false,
  // ENTREGA 23.6: bandera LOCAL (no viaja por matchSync) que se activa sólo mientras este
  // cliente está resolviendo un objeto de Stack que controla. Durante esa ventana puede
  // publicar también las mutaciones públicas del rival causadas por SU propio hechizo,
  // aunque el turno activo pertenezca al otro jugador.
  stackResolutionAuthority: false,
  // ENTREGA 23.7: indicador PURAMENTE local de backpressure. Se activa mientras existe una
  // escritura multiplayer en vuelo y queda disponible para HUD/telemetría; no viaja por
  // Firestore ni bloquea por sí solo acciones encadenadas del motor (render() suele publicar
  // en mitad de una misma acción síncrona).
  matchSyncBusy: false,
  // 23.7.2: barrera puramente local hasta que ambos clientes terminaron deck+mulligan.
  multiplayerWaitingForReady: false,
  autoZeroBlockersQueued: false,
  // 23.15.1 — decisiones reglamentarias sin prioridad.
  pendingLegendChoice: null,
  pendingTriggerOrderChoice: null,
  sbaKernelRunning: false,
  sbaHeldTriggerBatches: [],
  // 23.15.2.1 — serial local monotónico; tras hydrate/F5 se eleva por encima de todos los efectos persistidos.
  controlEffectSerial: 1,

  localHP: 20,
  // Veneno (regla real 104.3c, junto a Infectar en 702.90): condición de derrota
  // ALTERNATIVA a quedarse en 0 HP — con 10 o más contadores de Veneno, perdés igual sin
  // importar cuánta vida tengas. Infectar es la vía normal de conseguirlos (combatRules.js);
  // Proliferar también puede multiplicarlos si ya tenés alguno.
  localPoison: 0,
  localDeck: [],
  localHand: [],
  localLands: [],
  localCombat: [],
  localGraveyard: [], 
  localExile: [], // Zona de Exilio: separada del cementerio — lo que va acá no vuelve
                   // (salvo que algo lo diga explícitamente), y no cuenta como "murió".
  localPlaneswalkers: [], // { card, loyalty, abilityUsedThisTurn } — no son criaturas, no
                           // atacan ni bloquean, pero SÍ se los puede atacar en su lugar.
  localLandPlayedThisTurn: false,
  // 23.14.1 — reserva de maná pública y persistente sólo dentro del paso/fase actual.
  // Se vacía al final de CADA paso y fase (CR 106.4 / 500.5).
  localManaPool: emptyManaPool(),

  rivalHP: 20,
  rivalPoison: 0,
  rivalDeck: [],
  rivalHand: [],
  rivalLands: [],
  rivalCombat: [],
  rivalGraveyard: [], 
  rivalExile: [],
  rivalPlaneswalkers: [],
  rivalLandPlayedThisTurn: false,
  rivalManaPool: emptyManaPool(),

  // ENTREGA 23.10: transacción de casteo 601.2. Guarda propuesta/elecciones/targets/costo
  // bloqueado ANTES de activar fuentes de maná. No viaja por Firestore.
  pendingCastTransaction: null,
  // 23.16.3 — acción especial de Suspend. Reusa la UI/transacción reversible de pago de maná
  // pero NO es un casteo ni usa la Stack.
  pendingSuspendTransaction: null,
  pendingPreparedCastCosts: null,
  pendingAlternativeCostChoice: null,
  pendingPrivateZoneChoice: null,

  pendingSpellIndex: null, 
  pendingCost: null,       
  tappedLandsThisSpell: [],
  // ENTREGA 23.7 — mini transacción de pago para fuentes de maná "de un uso" (Fajo de
  // Dólares Blue / Treasure-like). Si el jugador cancela ANTES de que el hechizo/habilidad
  // llegue a la pila, estas fuentes vuelven exactamente a la zona/posición de donde salieron.
  paymentManaSourceRollbacks: [],
  // Snapshot de la reserva justo antes de la primera acción de pago. Cancelar un casteo
  // restaura exactamente este pool además de enderezar/restaurar fuentes reversibles.
  paymentManaPoolSnapshot: null,
  pendingTargetCard: null,
  pendingAbilitySource: null,
  // Punto 11: mientras se elige entre dos o más habilidades activadas del mismo permanente
  // (incluidas las prestadas por Equipos), bloqueamos otros clicks para no iniciar dos pagos.
  pendingActivatedAbilityChoice: null,
  
  pendingBlockerIndex: null,
  
  localSupport: [],
  rivalSupport: [],
  pendingTargetSource: null, 

  // Efectos diferidos de combate. `prevent_attack` sigue siendo global por jugador
  // (Cuarentena Total). 23.9.3 agrega `cant_attack_next_turn` por OBJETO de criatura:
  // { id, effectType, targetPlayer, targetObjectId, createdTurnCount, appliesThisCombat, sourceName }.
  // El targetObjectId vive en el item de battlefield y NO se copia al blink/retorno.
  activeEffects: [],

  // Fog: cuando es true, se previene TODO el daño de combate de este turno (ambos bandos).
  // Se resetea solo en Limpieza. Los tempEffects ("hasta el final del turno" de los
  // trucos de combate como Fuerza de Toro) viven directo en cada criatura (itemObj.tempEffects)
  // y también se limpian en ese mismo paso.
  combatDamagePrevented: false,

  // Sacrificar como costo: cuando una habilidad pide "Sacrificá una criatura" o "un artefacto"
  // (no "esta misma"), pausamos acá hasta que el jugador elija cuál. `source` guarda todo lo
  // necesario para retomar la activación (target, pila) una vez resuelto el sacrificio.
  pendingSacrificeChoice: null,
  // Tripular un Vehículo: { item, isLocal, required, selected:[], powerSoFar } — se paga
  // GIRANDO criaturas propias hasta sumar el poder pedido, nunca con maná (regla 702.121).
  pendingCrew: null,
  // Parpadeo temporal (exile_and_return): { card, isLocal } por cada criatura exiliada que
  // tiene que volver — se revisa en cada Paso Final (ver resolveScheduledReturns).
  scheduledReturns: [],
  // Redirigir un ataque a un Planeswalker rival en vez de a la cara: { attackerIndex } —
  // se activa clickeando DE NUEVO a una atacante ya declarada, y se completa clickeando
  // el Planeswalker objetivo.
  pendingAttackRedirect: null,
  // Ward: se activa la primera vez que un hechizo/habilidad de un RIVAL apunta a algo con
  // esta keyword — pausa el casteo hasta que el que targeteó decida pagar o dejarlo perder.
  pendingWardChoice: null,
  // "Contrarresta a menos que pague" (Impuesto País, etc.): pausa la resolución del
  // counterspell hasta que el CONTROLADOR del hechizo amenazado decida pagar o perderlo.
  pendingCounterUnlessPay: null,
  // Costo híbrido elegido (maná reducido + vida, ej. "{1} y 1 de vida" en vez del costo
  // completo): cuánta vida falta cobrar cuando termine de pagarse el maná reducido.
  pendingHybridLifePayment: null, // legacy: se conserva por compatibilidad de estado; Punto 14 usa pendingAlternativeCostChosen.
  // Punto 14: costo alternativo compuesto elegido para el hechizo actualmente en pago.
  pendingAlternativeCostChosen: false,
  // True mientras se están seleccionando/preparando componentes no-maná de un costo de casteo.
  pendingCompositeCostPayment: false,
  // LAND 3: selector de biblioteca para search_land/ramp. La elección ocurre sólo al resolver.
  pendingLandSearchChoice: null,
  // 23.15.6: selector universal de biblioteca para search_library / look_at_top.
  pendingLibraryChoice: null,
  // LAND 5: elección de Tierras a enderezar bajo Winter Orb-style y triggers de maná
  // diferidos hasta que termine el casteo/activación que estaba pagando.
  pendingUntapLandChoice: null,
  deferredLandManaTriggers: [],
  // Una vez que vida/descarte/sacrificio/exilio se comprometieron, cancelar ya no puede
  // devolver sólo el maná dejando esos otros costos perdidos.
  pendingSpellCostsIrreversible: false,
  // Pelear (fight) desde un hechizo: ya elegiste a la criatura rival, ahora esperamos que
  // elijas CUÁL de las tuyas pelea — { opponentItem, opponentIndex }.
  pendingFightChoice: null,
  // Costo de maná variable ({X}): { index, card } mientras se elige el valor; una vez
  // confirmado, se guarda en pendingXValue hasta que el hechizo termine de pagarse del todo.
  pendingXChoice: null,
  pendingXValue: null,
  // Kicker: costo ADICIONAL y OPCIONAL (a diferencia de additionalCost, que es obligatorio
  // y siempre se paga). { index, card } mientras se decide sí/no; una vez confirmado, se
  // guarda en pendingKicked (true/false) hasta que el hechizo entre a la pila, momento en
  // el que viaja con el ítem de la pila para saber, al resolver, si hay que aplicar el
  // bonus del Kicker.
  pendingKickerChoice: null,
  pendingKickerResolutionContinuation: null,
  pendingKicked: null,
  // Flashback/Escape: 'flashback' o 'escape' mientras se está pagando una carta lanzada
  // desde el cementerio por esa vía — se adjunta al ítem de la pila para saber, al resolver,
  // si hay que exiliarla (Flashback) o dejarla ir a destino normal (Escape).
  pendingCastFrom: null,
  // Scry/Surveil: true mientras el modal está abierto esperando que el jugador decida qué
  // hacer con las cartas — bloquea que el resto del juego siga de largo mientras tanto
  // (era el bug real: antes esto no pausaba nada).
  pendingScrySurveilChoice: false,
  // Proliferar: true mientras el modal de selección de permanentes está abierto — mismo
  // criterio de pausa que Scry/Surveil (bloquea el resto del juego hasta que se confirme).
  pendingProliferateChoice: false,
  // Punto 4: Loot/Rummage. Mientras el jugador elige qué carta(s) de SU mano descartar,
  // este objeto mantiene bloqueadas las demás acciones. Es completamente distinto de
  // `isDiscarding`, que pertenece al descarte obligatorio de Cleanup y al terminar avanza
  // el turno. Acá sólo termina un efecto que está resolviéndose.
  pendingHandFilterChoice: null,
  // Punto 8: descarte elegido general (efectos de "descarta N" y costos adicionales).
  // Separado de Loot/Rummage para que un costo de casteo nunca pueda confundirse con un
  // filtro de mano que roba cartas. `resolvingDiscardEffects` cubre también las elecciones
  // encoladas y bloquea prioridad hasta que toda la instrucción terminó.
  pendingDiscardChoice: null,
  resolvingDiscardEffects: 0,
  // Punto 5: selección obligatoria de permanentes al resolver un efecto \"sacrifice\".
  pendingSacrificeEffectChoice: null,
  resolvingSacrificeEffects: 0,
  // Punto 6: selector general de Cementerio. Mantiene bloqueada la UI mientras el jugador
  // elige cartas de un cementerio público. `resolvingGraveyardChoices` también cubre selecciones
  // encoladas para que dos triggers no abran modales superpuestos.
  pendingGraveyardChoice: null,
  resolvingGraveyardChoices: 0,
  // Punto 7: target de un ETB que nació DURANTE una resolución (hoy, al reanimar). A
  // diferencia de pendingTargetCard normal, acá no hay una carta esperando entrar a la
  // pila: la criatura ya entró y su trigger necesita declarar un objetivo antes de resolver.
  pendingResolvedEffectTargetChoice: null,
  resolvingResolvedEffectTargetChoices: 0,
  // Cantidad de efectos Loot/Rummage activos o encolados. Evita una ventana de prioridad
  // entre dos filtros de mano disparados por el mismo evento. Nunca viaja por Firestore.
  resolvingCardFilterEffects: 0,
  // Escape: { card, exileCount } mientras se elige qué N cartas del cementerio se exilian
  // como costo adicional — se resuelve DESPUÉS del maná, antes de que la carta termine de
  // entrar a la pila (mismo momento que cualquier otro costo adicional).
  pendingEscapeExileChoice: null,
  // Hechizos modales ("Elegí uno —"): { index, card } mientras se elige el modo.
  pendingModeChoice: null,
  // Habilidad de Lealtad con target: { pwItem, ability } mientras se elige la criatura.
  pendingLoyaltyTargetChoice: null,
  // Objetivos múltiples de un mismo hechizo: { card, chosenTargets: [], currentIndex } —
  // se van eligiendo uno por uno; card.targets[currentIndex] dice qué efecto/regla aplica
  // al que se está por elegir ahora.
  pendingMultiTargetChoice: null,

  isDiscarding: false,
  cardsToDiscard: 0,

  damageModalOpen: false,
  // BUG 2 (post-lanzamiento): mismo patrón que damageModalOpen — true mientras el modal de
  // elegir color de tierra (ramp) está esperando tu click, para bloquear otras acciones
  // mientras tanto (ver canPlayCard y el cálculo de btnEndTurn.disabled).
  pendingRampChoice: false,
  // Punto 3: profundidad local de una secuencia de triggers por casteo. NO se sincroniza
  // por Firestore; sólo evita que un modal interno entregue prioridad antes de que terminen
  // todos los watchers Spellslinger del mismo hechizo.

  // Mecanismo GENERAL de decisión remota (contrarrestar-a-menos-que-pagues fue el primer
  // caso, pero está pensado para cualquier futura decisión que le pertenezca al RIVAL en
  // multiplayer) — ver requestRivalDecision/handleIncomingDecisionRequest más abajo.
  // A diferencia de todos los demás pending*, ESTOS DOS SÍ viajan por Firestore (ver
  // matchSync.js, SHARED_FIELDS) — son el canal de comunicación en sí entre los clientes.
  pendingDecision: null,   // quien PREGUNTA publica acá: {type, forRole, requestId, ...datos}
  decisionResponse: null,  // quien RESPONDE publica acá: {requestId, ...respuesta}
  // Puramente local (nunca se publica) — true en MI pantalla mientras espero que el rival
  // responda una pregunta mía. Bloquea mis propias otras acciones mientras tanto (ver
  // canPlayCard y btnEndTurn.disabled).
  awaitingRivalDecision: false,
  // Puramente local — true en MI pantalla mientras el modal de responder una pregunta del
  // rival está abierto (ver handleIncomingDecisionRequest). Aparte de pendingCounterUnlessPay
  // a propósito: ese otro campo tiene su propia UI de estado permanente (el botón de la
  // barra de estado, payCounterTax/declineCounterTax) — mezclarlos generaría UI duplicada.
  respondingToDecision: false,

  // Contadores por turno para condiciones de gatillos (ej. Hinchada Fervorosa:
  // "si atacaste con 2 o más criaturas este turno"). Se resetean en el Enderezar de cada uno.
  localAttackersDeclaredThisTurn: 0,
  rivalAttackersDeclaredThisTurn: 0,
  // 23.9.3: declaración de bloqueadores idempotente por combate. A diferencia del viejo
  // autoZeroBlockersQueued, estas banderas sobreviven a la ventana post-bloqueadores.
  localBlockersDeclaredThisCombat: false,
  rivalBlockersDeclaredThisCombat: false
};

// BUGFIX (revisión post-Fase 3): nombre del jugador local, en UN solo lugar — antes
// "El Gaucho" estaba hardcodeado suelto en varios mensajes distintos (el log de
// enderezar, el cartel de "Turno de:", el nombre del HUD), y cuando se agregó el login
// cada uno se actualizaba por separado (o se olvidaba). Ahora todo el juego pasa por acá:
// devuelve el username Argentinia si hay sesión/perfil, un alias neutro mientras la identidad
// todavía está cargando, o "El Gaucho" si no hay sesión. El displayName de Google no se muestra.
export function getLocalPlayerName() {
  const profileName = String(state.userProfile?.username || '').trim();
  if (profileName) return profileName;
  const authSessionName = String(state.currentUser?.username || '').trim();
  if (authSessionName) return authSessionName;
  // Desde 23.13.24 jamás mostramos el displayName de Google. Durante los milisegundos entre
  // Auth y la carga/prompt de identidad usamos un alias neutro; sin sesión conserva Gaucho.
  return state.currentUser ? 'Jugador' : 'El Gaucho';
}

// BUGFIX: nombre a mostrar para el RIVAL — "El Tano" en Solitario (el bot de siempre), o
// el username Argentinia del rival en una partida multiplayer (transportado en players{}).
// Reemplaza los mensajes
// que antes decían "El Tano" hardcodeado incluso jugando contra una persona de verdad.
export function getRivalName() {
  if (state.currentMatch && state.currentMatch.rivalName) {
    return state.currentMatch.rivalName;
  }
  return 'El Tano';
}

// FASE 3, ETAPA 4: deckSource es { type: 'random', identity: [...] } (comportamiento de
// siempre, disponible con o sin sesión) o { type: 'saved', deck: {...} } (uno de tus
// mazos guardados de verdad, armado 100% desde tu colección). El del Tano SIEMPRE es al
// azar — no tiene colección propia.
//
// FASE 4, ETAPA 5 (nota de auditoría): esta función es 100% Solitario — arma un
// state.rivalDeck real de mentira (buildRandomDeck) y resuelve su mulligan con
// resolveBotMulligan(), que SÍ mira el contenido real de state.rivalHand (nunca pasa por
// isHiddenRivalZone). Nunca se llama con una partida multiplayer activa todavía — armar
// una partida multiplayer real (mazos de ambos jugadores, mulligan de cada uno por su
// cuenta) es trabajo de una etapa futura, no de esta. Si eso llega a rutear por acá algún
// día, hay que revisar esto de nuevo.
// FASE 4, ETAPA 6: extraído de lo que antes vivía inline dentro de initGame — hace falta
// engancharlo también al RECONECTARSE a una partida en curso (resumeReconnectedMatch, más
// abajo), no solo al arrancar una nueva. Todo lo que toca acá ya es módulo/global (els,
// state, funciones importadas) — nada de esto dependía de variables locales de initGame,
// así que sacarlo de ahí no cambia el comportamiento en absoluto.
function recordLocalAbandonStatsBestEffort() {
  // 23.13.40 — este camino JAMÁS puede abortar la salida de la partida. 23.13.39
  // consultaba getTelemetryStatus() fuera de un guard y un typo interno de Telemetría podía
  // rechazar por completo el callback async de Abandonar antes de alcanzar el deadline/reload.
  try {
    if (!state.currentUser) return Promise.resolve(null);
    const telemetry = getTelemetryStatus();
    const soloGameId = !state.currentMatch ? getActiveSoloGameId() : null;
    const receiptId = soloGameId || telemetry.sessionId;
    if (!receiptId) return Promise.resolve(null);
    return recordPlayerGameResult(state.currentUser.uid, {
      sessionId: receiptId,
      mode: state.currentMatch ? 'multiplayer' : 'solo',
      won: false,
      abandoned: true,
      durationMs: state.currentMatch ? (telemetry.elapsedMs || 0) : currentSoloLifecycleDurationMs()
    }).catch(err => {
      console.warn('No se pudieron registrar las estadísticas del abandono:', err);
      return null;
    });
  } catch (err) {
    console.warn('No se pudieron preparar las estadísticas del abandono:', err);
    return Promise.resolve(null);
  }
}

function hookGameplayButtons() {
  els.btnRestart.addEventListener('click', () => location.reload());
  els.rivalHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(false));
  els.localHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(true));

  // FASE 2: abandonar tiene una penalidad más dura que perder jugando hasta el final — por
  // eso el botón pide confirmación (showAbandonConfirmModal) antes de aplicar nada.
  if (els.btnAbandonGame) {
    els.btnAbandonGame.addEventListener('click', () => {
      if (state.gameOver) return; // ya terminó de una forma normal, "abandonar" no tiene sentido
      showAbandonConfirmModal(
        async () => {
          state.gameOver = true; // evita que checkGameOver procese esto como otra cosa
          const cleanupTasks = [];
          let timedOut = false;

          // 23.13.40 — cinturón de seguridad TOTAL: no alcanza con poner timeout a Promises.
          // Cualquier excepción síncrona previa al Promise.race también debe terminar en finally
          // para que Abandonar nunca pueda dejar la pantalla congelada.
          try {
            recordTelemetryEvent('abandon_cleanup_start', {
              mode: state.currentMatch ? 'multiplayer' : 'solo',
              turnCount: state.turnCount,
              phase: state.phase
            });

            // 23.13.39 — NO cerramos Telemetría antes de estas escrituras. En 23.13.38, si
            // awardPoints()/Statistics quedaba pendiente, la pantalla parecía congelada y los
            // eventos posteriores quedaban fuera del último upload final.

            // FASE 4, ETAPA 6: en multiplayer, el rival tiene que ENTERARSE de que abandoné.
            if (state.currentMatch) {
              state.abandonedBy = 'local';
              try {
                cleanupTasks.push(Promise.resolve(publishMatchState({ force: true })));
              } catch (err) {
                cleanupTasks.push(Promise.reject(err));
              }
            }

            if (state.currentUser) {
              cleanupTasks.push(recordLocalAbandonStatsBestEffort());
              try {
                cleanupTasks.push(
                  Promise.resolve(awardPoints(state.currentUser.uid, POINTS.abandonPenalty))
                    .catch(err => {
                      console.error('No se pudo aplicar la penalidad de abandono:', err);
                      return null;
                    })
                );
              } catch (err) {
                console.error('No se pudo preparar la penalidad de abandono:', err);
                cleanupTasks.push(Promise.resolve(null));
              }
            }

            const settle = Promise.allSettled(cleanupTasks);
            const deadline = sleep(3000).then(() => { timedOut = true; return null; });
            await Promise.race([settle, deadline]);

            recordTelemetryEvent('abandon_cleanup_end', {
              timedOut,
              taskCount: cleanupTasks.length
            }, timedOut ? 'warning' : 'info');
          } catch (err) {
            console.error('Error inesperado durante el cleanup de abandono:', err);
            try {
              recordTelemetryEvent('abandon_cleanup_exception', {
                name: err?.name || 'Error',
                message: err?.message || String(err),
                taskCount: cleanupTasks.length
              }, 'error');
            } catch {}
          } finally {
            try { endTelemetrySession('abandon_local'); } catch (err) {
              console.error('No se pudo cerrar Telemetría al abandonar:', err);
            }
            if (state.currentMatch) stopMultiplayerPresenceHeartbeat();
            else finishSoloRecovery();
            // La salida NO depende de Firestore, Statistics, Telemetry ni de ninguna otra Promise.
            location.reload();
          }
        },
        () => {} // "Seguir jugando": no hace falta hacer nada, el modal ya se cerró solo
      );
    });
  }

  // 23.13.54 — F5/cerrar pestaña YA NO equivale a abandono. Un unload puede ser refresh,
  // crash, actualización o pérdida breve de conexión. Guardamos checkpoint Solo y dejamos
  // el match multiplayer reanudable; la penalidad sólo ocurre ante Abandonar explícito o
  // cuando un recovery Solo vence tras 24 h y el jugador vuelve.
  window.addEventListener('beforeunload', (event) => {
    if (state.gameOver) return;
    if (hasActiveSoloRecovery()) {
      checkpointSoloRecovery(state, spellStack, { telemetrySessionId: getTelemetryStatus().sessionId });
    }
    if (hasActiveSoloRecovery() || state.currentMatch) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => {
    if (!state.gameOver && hasActiveSoloRecovery()) {
      checkpointSoloRecovery(state, spellStack, { telemetrySessionId: getTelemetryStatus().sessionId });
    }
  });
}

async function initGame(deckSource) {
  enterGameplayAudio();
  logMsg(gameText('game.loadingDeck'));

  await mobileSoloYield('before_board_layout');
  setupBoardLayout();
  replaceSpellStackFromSync([]);
  state.localManaPool = emptyManaPool();
  state.rivalManaPool = emptyManaPool();
  await mobileSoloYield('board_layout_ready');

  let deckLabel;
  if (deckSource.type === 'saved') {
    state.localDeck = buildDeckFromCardIds(deckSource.deck.cardIds, state.userProfile && state.userProfile.enhancements);
    deckLabel = deckSource.deck.name;
  } else {
    state.localDeck = buildRandomDeck(deckSource.identity, { quality: 'competitive' });
    state.localDeckBuildReport = getLastRandomDeckReport();
    deckLabel = deckSource.identity.join('/');
  }
  await mobileSoloYield('local_deck_ready', { count: state.localDeck.length });
  state.botDifficulty = normalizeBotDifficulty(state.botDifficulty);
  const botQuality = botDeckQuality(state.botDifficulty);
  state.rivalDeck = buildRandomDeck(undefined, { quality: botQuality });
  state.rivalDeckBuildReport = getLastRandomDeckReport();
  await mobileSoloYield('rival_deck_ready', { count: state.rivalDeck.length, archetype: state.rivalDeckBuildReport?.archetypeId, quality: botQuality });

  // 23.13.52 — ya no existe el supuesto histórico "el humano siempre empieza".
  // El resultado se fija una sola vez antes del mulligan para que esa información pueda
  // influir en la decisión de quedarse o cambiar la mano, igual que en un TCG real.
  const soloStartingSide = chooseSoloStartingSide();
  state.activePlayer = soloStartingSide;
  state.priorityPlayer = soloStartingSide;
  state.consecutivePasses = 0;
  state.phase = 'main1';
  state.turnCount = 1;

  // ENTREGA 22: sesión diagnóstica aislada para esta partida contra el Tano. Se arranca
  // después de construir ambos mazos y ANTES de robar, así el log conserva el orden inicial
  // completo de las dos bibliotecas sin intervenir en ningún RNG ni regla.
  const soloGameId = createSoloGameId();
  startTelemetrySession({
    mode: 'solo',
    difficulty: state.botDifficulty,
    deckLabel,
    soloGameId,
    segmentIndex: 1,
    activeElapsedBaseMs: 0
  });
  recordTelemetryEvent('starting_player_selected', {
    mode: 'solo',
    startingSide: soloStartingSide,
    winner: soloStartingSide === 'local' ? getLocalPlayerName() : 'El Tano'
  });
  recordTelemetryInitialDecks({ revealRival: true });
  await mobileSoloYield('telemetry_ready');

  // FASE 1: red de contención para cuando el perfil todavía no existe — el camino normal
  // ahora es promptStarterDeckSelection (se dispara solo apenas hay login, ver boot() más
  // abajo), así que esto casi nunca debería disparar en la práctica. Solo tiene sentido
  // para el camino RANDOM: si ya se llegó a elegir un mazo GUARDADO, por definición ya
  // existía un perfil (no hay forma de tener un mazo guardado sin uno).
  if (deckSource.type === 'random' && state.currentUser) {
    await userProfileLoadPromise;
    if (!state.userProfile || state.userProfile.starterDeckPending === true) {
      const starterCardIds = state.localDeck.map(c => c.id);
      try {
        state.userProfile = await createUserProfile(state.currentUser.uid, state.currentUser, starterCardIds);
        await processDailyLoginRewards();
        logMsg(gameText('account.starter.saved60'));
      } catch (err) {
        console.error('No se pudo guardar la colección inicial:', err);
        logMsg(gameText('account.starter.saveErrorContinue'));
      }
    }
  }

  for (let i = 0; i < 7; i++) {
    state.localHand.push(state.localDeck.pop());
    state.rivalHand.push(state.rivalDeck.pop());
  }

  // El Tano resuelve su propio mulligan solo, sin UI (ver resolveBotMulligan).
  resolveBotMulligan();
  await mobileSoloYield('opening_hands_ready', { local: state.localHand.length, rival: state.rivalHand.length });

  // El jugador humano decide el suyo de forma interactiva. La partida arranca de
  // verdad recién cuando termina de resolver su mano (finishSetup).
  const finishSetup = () => {
    beginSoloRecoverySession({
      soloGameId,
      state,
      stack: spellStack,
      deckLabel,
      ownerUid: state.currentUser?.uid || null,
      playerName: getLocalPlayerName(),
      telemetrySessionId: getTelemetryStatus().sessionId,
      getState: () => state,
      getStack: () => spellStack,
      getTelemetrySessionId: () => getTelemetryStatus().sessionId
    });
    hookGameplayButtons();
    render();
    logMsg(gameText('game.start.deck', { deck: deckLabel }));
    if (state.activePlayer === 'local') {
      logMsg(gameText('game.start.yourTurnHint'));
    } else {
      logMsg(gameText('game.start.waitingRival'));
      setTimeout(() => { takeBotPriorityAction().catch(err => console.error('Falló el primer turno del Tano:', err)); }, 180);
    }
  };

  await showStartingCoinToss({
    localName: getLocalPlayerName(),
    rivalName: 'El Tano',
    winnerSide: soloStartingSide
  });
  await mobileSoloYield('before_mulligan_ui', { local: state.localHand.length, startingSide: soloStartingSide });
  startLocalMulliganFlow(finishSetup);
  await mobileSoloYield('mulligan_ui_open');
}

async function abandonRecoveredSolo(candidate, { expired = false } = {}) {
  const durationMs = Math.max(0, Number(candidate?.activeElapsedMs) || 0);
  const endedAtClient = candidate?.lastCheckpointAt || new Date().toISOString();
  if (candidate?.telemetrySessionId && state.currentUser) {
    try {
      await finalizeTelemetryLifecycleSession(candidate.telemetrySessionId, {
        status: 'completed',
        endedAtClient,
        endReason: expired ? 'abandon_recovery_expired' : 'abandon_recovery',
        effectiveDurationMs: durationMs,
        soloGameId: candidate.soloGameId,
        segmentIndex: candidate.segmentIndex
      });
    } catch (err) {
      console.warn('No se pudo cerrar la sesión de Telemetría recuperada:', err);
    }
  }
  if (state.currentUser && (!candidate?.ownerUid || candidate.ownerUid === state.currentUser.uid)) {
    try {
      await recordPlayerGameResult(state.currentUser.uid, {
        sessionId: candidate.soloGameId || candidate.telemetrySessionId,
        mode: 'solo', won: false, abandoned: true, durationMs
      });
    } catch (err) { console.warn('No se pudieron registrar stats del recovery abandonado:', err); }
    try {
      const result = await awardPoints(state.currentUser.uid, POINTS.abandonPenalty);
      if (state.userProfile && result?.total !== undefined) state.userProfile.points = result.total;
      updateAccountUI(state.currentUser);
    } catch (err) { console.warn('No se pudo aplicar penalidad del recovery abandonado:', err); }
  }
  clearSoloRecovery();
  if (expired) window.alert(gameText('solo.recovery.expired'));
}

async function resumeSoloRecoveryGame(candidate) {
  document.querySelectorAll('#main-menu-overlay, #solo-recovery-overlay').forEach(el => el.remove());
  setupBoardLayout();

  if (candidate.telemetrySessionId && state.currentUser) {
    void finalizeTelemetryLifecycleSession(candidate.telemetrySessionId, {
      status: 'interrupted',
      endedAtClient: candidate.lastCheckpointAt,
      endReason: 'interrupted_reconnected',
      effectiveDurationMs: Math.max(0, Number(candidate.activeElapsedMs) || 0),
      soloGameId: candidate.soloGameId,
      segmentIndex: candidate.segmentIndex
    }).catch(err => console.warn('No se pudo marcar el segmento anterior como interrumpido:', err));
  }

  const restoredStack = restoreSoloRecoveryState(candidate, state);
  ensureControlEffectSerialAfterHydration();
  replaceSpellStackFromSync(restoredStack);
  const nextSegment = Math.max(1, Number(candidate.segmentIndex) || 1) + 1;
  startTelemetrySession({
    mode: 'solo_reconnect',
    difficulty: state.botDifficulty,
    deckLabel: candidate.deckLabel || 'reconnect',
    soloGameId: candidate.soloGameId,
    segmentIndex: nextSegment,
    activeElapsedBaseMs: Math.max(0, Number(candidate.activeElapsedMs) || 0)
  });
  recordTelemetryEvent('solo_reconnect_state_loaded', {
    soloGameId: candidate.soloGameId,
    previousSegment: candidate.segmentIndex,
    segmentIndex: nextSegment,
    activeElapsedBaseMs: Math.max(0, Number(candidate.activeElapsedMs) || 0),
    turnCount: state.turnCount,
    phase: state.phase,
    stackDepth: spellStack.length
  });
  activateResumedSoloRecovery(candidate, {
    state,
    stack: spellStack,
    telemetrySessionId: getTelemetryStatus().sessionId,
    getState: () => state,
    getStack: () => spellStack,
    getTelemetrySessionId: () => getTelemetryStatus().sessionId
  });
  hookGameplayButtons();
  render();
  logMsg(gameText('solo.recovery.restored'));
  if (!state.gameOver && state.priorityPlayer === 'rival') {
    setTimeout(() => takeBotPriorityAction().catch(err => console.error('Falló la reanudación de prioridad del Tano:', err)), 180);
  }
}

async function offerSoloRecoveryIfAvailable() {
  const candidate = loadSoloRecoveryCandidate();
  if (!candidate) return;
  if (!isSoloRecoveryCompatible(candidate)) {
    console.warn('Se descartó un recovery Solo incompatible con este motor.', { saved: candidate.engineVersion, current: ENGINE_VERSION });
    clearSoloRecovery();
    return;
  }
  // Una partida multiplayer persistida tiene prioridad para no superponer dos prompts.
  if (state.userProfile?.activeMatchId) return;
  if (candidate.ownerUid && candidate.ownerUid !== state.currentUser?.uid) return;
  if (!candidate.ownerUid && state.currentUser) return;
  if (isSoloRecoveryExpired(candidate)) {
    await abandonRecoveredSolo(candidate, { expired: true });
    return;
  }
  showSoloRecoveryPrompt(
    candidate,
    () => { void resumeSoloRecoveryGame(candidate); },
    () => { void abandonRecoveredSolo(candidate); },
    { penalty: state.currentUser ? POINTS.abandonPenalty : 0 }
  );
}

// Mulligan de Londres simplificado: mientras la mano no tenga entre 2 y 5 tierras (una
// mano "razonable"), vuelve a barajar y robar 7. Como no hay UI para el Tano, resuelve
// todo de una y deja al fondo del mazo tantas cartas como veces mulliganeó (las de más
// costo primero, para priorizar quedarse con lo barato jugable).
function resolveBotMulligan() {
  const MAX_MULLIGANS = 2;
  let count = 0;

  while (count < MAX_MULLIGANS) {
    const lands = state.rivalHand.filter(c => c.type.includes('Tierra')).length;
    if (lands >= 2 && lands <= 5) break;

    state.rivalDeck.push(...state.rivalHand);
    state.rivalHand = [];
    state.rivalDeck = shuffle(state.rivalDeck);
    for (let i = 0; i < 7; i++) state.rivalHand.push(state.rivalDeck.pop());
    count++;
  }

  if (count > 0) {
    const toBottom = [...state.rivalHand].sort((a, b) => (b.cmc || 0) - (a.cmc || 0)).slice(0, count);
    toBottom.forEach(c => {
      const idx = state.rivalHand.indexOf(c);
      if (idx !== -1) {
        state.rivalHand.splice(idx, 1);
        state.rivalDeck.unshift(c);
      }
    });
    logMsg(gameText('game.mulligan.bot', { count }));
  }
}

// Flujo interactivo del jugador humano: muestra la mano, deja mulliganear las veces que
// quiera, y si se queda con una mano después de mulliganear, le pide elegir qué cartas
// van al fondo del mazo (regla real de MTG desde 2019 — "mulligan de Londres").
function startLocalMulliganFlow(onDone) {
  const MAX_MULLIGANS = 7; // en MTG real podés mulliganear hasta quedarte con mano de 0
  let mulliganCount = 0;

  const askPlayer = () => {
    const canMulliganMore = mulliganCount < MAX_MULLIGANS;
    showMulliganModal(state.localHand, mulliganCount, canMulliganMore, {
      onMulligan: () => {
        if (!canMulliganMore) return; // seguridad extra, no debería poder llegar acá
        recordTelemetryEvent('mulligan_requested', {
          mulliganNumber: mulliganCount + 1,
          handBefore: state.localHand.map(c => ({ id: c?.id ?? null, name: c?.name ?? null }))
        });
        state.localDeck.push(...state.localHand);
        state.localHand = [];
        state.localDeck = shuffle(state.localDeck);
        for (let i = 0; i < 7; i++) state.localHand.push(state.localDeck.pop());
        mulliganCount++;
        askPlayer();
      },
      onKeep: () => {
        if (mulliganCount === 0) {
          logMsg(gameText('game.mulligan.keep'));
          onDone();
          return;
        }
        // Si hay que dejar la mano ENTERA (tope de 7 mulligans), no tiene sentido pedir
        // que se seleccionen una por una — van todas al fondo directo.
        const countToBottom = Math.min(mulliganCount, state.localHand.length);
        if (countToBottom >= state.localHand.length) {
          const allCards = [...state.localHand];
          allCards.forEach(c => {
            const idx = state.localHand.indexOf(c);
            if (idx !== -1) {
              state.localHand.splice(idx, 1);
              state.localDeck.unshift(c);
            }
          });
          logMsg(gameText('game.mulligan.allBottom', { count: allCards.length }));
          onDone();
          return;
        }
        showBottomCardsModal(state.localHand, countToBottom, (chosenCards) => {
          chosenCards.forEach(c => {
            const idx = state.localHand.indexOf(c);
            if (idx !== -1) {
              state.localHand.splice(idx, 1);
              state.localDeck.unshift(c);
            }
          });
          logMsg(gameText('game.mulligan.bottom', { bottom: countToBottom, hand: state.localHand.length }));
          onDone();
        });
      }
    });
  };

  askPlayer();
}

// Carga la base de cartas primero (para que el modal ya pueda arrancar el juego apenas
// el jugador elige) y recién ahí muestra el modal de selección de color. El juego en sí
// no arranca hasta que el jugador elige — initGame() se llama desde el callback del modal.
// Se muestra automáticamente apenas se detecta una cuenta logueada SIN perfil todavía —
// primera vez de verdad, o después de un borrado de cuenta desde Opciones. Reusa el MISMO
// modal que "Jugar" (mismo mecanismo de elegir identidad, mismo buildRandomDeck), pero con
// un título distinto que deja bien claro que ESTA elección es para siempre. La partida NO
// arranca acá — solo se guarda la colección; el jugador vuelve al menú y juega cuando quiera.
function promptStarterDeckSelection() {
  showDeckSelectionModal(
    async (chosenIdentity) => {
      const starterDeck = buildRandomDeck(chosenIdentity, { quality: 'starter' });
      try {
        state.userProfile = await createUserProfile(state.currentUser.uid, state.currentUser, starterDeck.map(c => c.id));
        await processDailyLoginRewards();
        logMsg(gameText('account.starter.savedIdentity', { identity: chosenIdentity.join('/') }));
      } catch (err) {
        console.error('No se pudo guardar la colección inicial:', err);
        logMsg(gameText('account.starter.saveErrorRetry'));
      }
    },
    {
      title: 'Elegí tu mazo inicial',
      subtitle: 'Estas cartas te van a acompañar para siempre — pensalo bien, no se puede cambiar después.'
    }
  );
}

const BUILD_FRESHNESS_TIMEOUT_MS = 5000;

function markEngineBootState(status, detail = {}) {
  try {
    document.documentElement.dataset.argEngineBoot = status;
    document.documentElement.classList.toggle('arg-mobile-engine-ready', status === 'ready');
    globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.(`engine_${status}`, detail);
    if (status === 'ready') globalThis.__ARGENTINIA_BOOT_DIAG__?.releaseFallbackIfReady?.();
    window.dispatchEvent(new CustomEvent('argentinia:boot-status', { detail: { status, ...detail } }));
  } catch {
    // Diagnóstico best-effort: jamás puede romper el boot por falta de CustomEvent/DOM.
  }
}

async function fetchBuildManifestWithTimeout(url, timeoutMs = BUILD_FRESHNESS_TIMEOUT_MS) {
  if (typeof AbortController === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('build_freshness_timeout'), timeoutMs);
    try {
      return await fetch(url, { cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  return await Promise.race([
    fetch(url, { cache: 'no-store' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('BUILD_FRESHNESS_TIMEOUT')), timeoutMs))
  ]);
}

async function checkBuildFreshness() {
  try {
    const url = `${BUILD_MANIFEST_URL}?fresh=${Date.now()}`;
    const response = await fetchBuildManifestWithTimeout(url);
    if (!response.ok) return { ok: true, unverifiable: true };
    const manifest = await response.json();
    const manifestProtocolVersion = manifest?.engineProtocolVersion ?? manifest?.protocolVersion ?? null;
    const ok = manifest?.engineVersion === ENGINE_VERSION && manifestProtocolVersion === ENGINE_PROTOCOL_VERSION;
    if (!ok) {
      console.error('BUILD_MISMATCH', { loaded: ENGINE_VERSION, manifest });
      return { ok: false, manifest };
    }
    return { ok: true, manifest };
  } catch (error) {
    // Offline/manifest no disponible no impide Solitario; el handshake multiplayer sigue
    // bloqueando builds distintas del otro lado.
    return { ok: true, unverifiable: true, error };
  }
}

async function boot() {
  // ENTREGA 23.8.5 — guard GLOBAL, no sólo module-local. Si por un HTML viejo/cacheado
  // main.js llegara a evaluarse bajo dos URLs distintas, sólo la primera instancia puede
  // arrancar la app. Esto evita dos listeners de Auth, dos menús y dos estados compitiendo.
  if (globalThis.__ARGENTINIA_BOOT_STARTED__) {
    console.error('[BOOT_GUARD] Se bloqueó un segundo boot de Argentinia.', {
      firstVersion: globalThis.__ARGENTINIA_BOOT_VERSION__ || null,
      attemptedVersion: ENGINE_VERSION,
      moduleUrl: import.meta.url
    });
    return;
  }
  globalThis.__ARGENTINIA_BOOT_STARTED__ = true;
  globalThis.__ARGENTINIA_BOOT_VERSION__ = ENGINE_VERSION;
  globalThis.__ARGENTINIA_BOOT_MODULE_URL__ = import.meta.url;
  markEngineBootState('loading', { engineVersion: ENGINE_VERSION });

  // ENTREGA 22: instala listeners de errores/interacciones y el pequeño panel de exportación.
  // Los providers son funciones para evitar copias: la telemetría lee el estado actual sólo
  // cuando necesita capturarlo. No se conecta a Firebase ni muta el motor.
  initTelemetry({
    getState: () => state,
    getStack: () => spellStack,
    getLocalPlayerName,
    getRivalName,
    getCurrentUser: () => state.currentUser,
    uploadRemote: uploadTelemetrySession
  });

  const phoneBoot = globalThis.__ARGENTINIA_PHONE_SURFACE__ === true;
  globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('engine_core_boot_path', { phoneBoot, firebaseDeferred: phoneBoot });

  // 23.11.6: desktop conserva el boot online histórico. En smartphone el primer menú y
  // Solitario NO dependen del SDK remoto de Firebase; la fachada lazy lo cargará bajo
  // demanda al tocar Login/Multiplayer/Tienda/Admin. Esto evita que Auth/Firestore forme
  // parte del camino crítico antes del primer menú mobile.
  if (!phoneBoot) {
    await preloadFirebaseClient();
  }

  const freshness = await checkBuildFreshness();
  if (!freshness.ok) {
    const serverVersion = freshness.manifest?.engineVersion || 'más nueva';
    markEngineBootState('error', { code: 'BUILD_MISMATCH', serverVersion });
    const loadingOverlay = document.getElementById('boot-loading-overlay');
    if (loadingOverlay) loadingOverlay.remove();
    document.body.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08100b;color:#f0e0b0;font-family:system-ui;padding:24px"><div style="max-width:620px;border:2px solid #d4af37;border-radius:14px;padding:24px;text-align:center;background:#111a13"><h2>♻️ Actualización disponible</h2><p>Esta pestaña cargó Argentinia ${ENGINE_VERSION}, pero el servidor publica ${serverVersion}.</p><p>Recargá la página con Ctrl+F5 / recarga completa antes de jugar.</p></div></div>`;
    return;
  }

  // 23.13.24 — cada login autenticado debe tener username Argentinia ANTES de Rewards,
  // mazo inicial o reconnect. El modal es obligatorio; la única salida sin elegir es cerrar
  // sesión. authIdentitySerial evita que una respuesta vieja escriba estado después de logout.
  let authIdentitySerial = 0;
  function applyUsernameIdentity(profile) {
    if (!state.currentUser || !profile) return;
    state.currentUser.username = profile.username || '';
    state.currentUser.usernameKey = profile.usernameKey || '';
  }
  function requestMandatoryUsername(profile, serial) {
    return new Promise((resolve) => {
      showUsernameSetupModal({
        onSave: async ({ username, usernameKey }) => {
          const saved = await reserveInitialUsername(
            state.currentUser.uid,
            username,
            usernameKey,
            state.currentUser
          );
          if (serial !== authIdentitySerial) return saved;
          resolve(saved);
          return saved;
        },
        onSignOut: async () => {
          resolve(null);
          await signOutUser();
        }
      });
    });
  }

  // Fase 0 del multiplayer: se engancha UNA sola vez, apenas arranca la página, sin
  // importar qué pantalla esté mostrándose en ese momento (menú, Opciones, Enciclopedia, o
  // ya en medio de una partida) — updateAccountUI decide sola qué actualizar según qué haya
  // en el DOM en ese instante. Esto es lo que hace que loguearte desde cualquier lado
  // refresque el avatar y el widget de cuenta sin tener que reabrir nada a mano.
  onAuthChange((firebaseUser) => {
    const serial = ++authIdentitySerial;
    state.authInitialResolved = true;
    state.authIdentityReady = !firebaseUser;
    state.currentUser = firebaseUser ? {
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName, // dato Auth interno; NO se muestra como nombre de juego
      photoURL: firebaseUser.photoURL,
      email: firebaseUser.email,
      username: '',
      usernameKey: ''
    } : null;
    state.userProfile = null;
    updateAccountUI(state.currentUser);

    if (state.currentUser) {
      if (phoneBoot) {
        loadGameConfig()
          .then(config => {
            applyGameConfig(config);
            globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('firebase_config_loaded_after_auth_mobile');
          })
          .catch(err => {
            console.error('No se pudo cargar la configuración del juego tras autenticar en mobile — se mantienen los valores por defecto:', err);
          });
      }

      userProfileLoadPromise = (async () => {
        let profile = await loadUserProfile(state.currentUser.uid);
        if (serial !== authIdentitySerial || !state.currentUser) return null;

        // Migración obligatoria y también alta de cuentas nuevas. reserveInitialUsername
        // crea un perfil mínimo starterDeckPending cuando users/{uid} todavía no existe.
        if (!isUsernameConfigured(profile)) {
          profile = await requestMandatoryUsername(profile, serial);
          if (!profile || serial !== authIdentitySerial || !state.currentUser) return null;
        }

        state.userProfile = profile;
        applyUsernameIdentity(profile);
        updateAccountUI(state.currentUser);

        // 23.13.25 — no bloquea el login ni el boot: para usuarios normales devuelve
        // inmediatamente `not_admin`; para Admin mantiene publicada una ventana semanal
        // trusted de Clasificados. cardDb.loadAll() es idempotente si aún estaba en curso.
        void ensureClassifiedsSchedule().catch(err => {
          console.error('No se pudo mantener el calendario de Avisos Clasificados:', err);
        });

        // Cuenta recién creada: primero termina la colección/mazo inicial. Si cerró la
        // pestaña después del username, este flag permite retomar exactamente acá.
        if (profile.starterDeckPending === true) {
          promptStarterDeckSelection();
          return profile;
        }

        // 23.13.59 — antes de abrir el menú, liquida cualquier premio de partida que haya
        // quedado localmente pendiente por caída de red/cierre de pestaña. Si la transacción
        // original sí había entrado, el receipt remoto lo vuelve un no-op idempotente.
        try {
          const recoveredRewards = await flushPendingGameRewards(state.currentUser.uid);
          if (Number.isFinite(Number(recoveredRewards?.latestTotal))) {
            state.userProfile.points = Number(recoveredRewards.latestTotal);
            profile.points = Number(recoveredRewards.latestTotal);
            updateAccountUI(state.currentUser);
          }
          if (recoveredRewards?.attempted) {
            console.info('[GameReward 23.13.62] Reconciliación de pendientes:', recoveredRewards);
          }
        } catch (rewardErr) {
          console.warn('[GameReward 23.13.62] No se pudieron reconciliar premios pendientes; se reintentará luego:', rewardErr);
        }

        // 23.13.60 — serializamos las escrituras de bootstrap sobre users/{uid}. Antes,
        // playerStats arrancaba en paralelo y su transacción verificaba una versión del
        // perfil que Daily Rewards modificaba milisegundos después: Firestore reintentaba
        // con failed-precondition y ensuciaba consola/boot. Primero economía + daily; recién
        // después se reconcilia el espejo público.
        const dailyResult = await processDailyLoginRewards({ showModal: false });
        profile = state.userProfile || profile;
        if (dailyResult) {
          console.info('[DailyRewards 23.13.62] Decisión de bootstrap:', {
            newCalendarLogin: !!dailyResult.login?.newCalendarLogin,
            rewardDay: dailyResult.login?.rewardDay ?? null,
            streak: dailyResult.login?.streak ?? null,
            streakReset: !!dailyResult.login?.streakReset,
            repairApplied: !!dailyResult.login?.repairApplied,
            legacyMigration: !!dailyResult.diagnostics?.legacyMigration,
            previous: dailyResult.diagnostics || null
          });
        }
        // Startup overlay queue: Daily Rewards tiene prioridad. Sólo cuando el usuario
        // termina con ese modal se evalúa el anuncio activo con la identidad real cargada.
        // Así un usuario autenticado nunca ve el anuncio como "guest" ni se superponen overlays.
        let dailyModalResult = null;
        if (dailyResult?.login?.newCalendarLogin) {
          dailyModalResult = await showDailyLoginRewardModal(dailyResult.login);
        }
        if (serial === authIdentitySerial && state.currentUser && dailyModalResult !== 'view_rewards') {
          await maybeShowAnnouncementPopup({ currentUser: state.currentUser });
        }
        if (serial !== authIdentitySerial || !state.currentUser) return profile;
        void bootstrapPlayerStatistics(state.currentUser.uid).catch(statsErr => {
          console.warn('No se pudieron preparar las estadísticas del jugador:', statsErr);
        });
        if (profile.activeMatchId) offerReconnectIfStillActive(profile.activeMatchId);
        return profile;
      })().catch(err => {
        if (serial !== authIdentitySerial) return null;
        console.error('No se pudo cargar/preparar el perfil de Firestore:', err);
        state.userProfile = null;
        return null;
      }).finally(() => {
        if (serial !== authIdentitySerial || !state.currentUser) return;
        state.authIdentityReady = !!state.userProfile;
        updateAccountUI(state.currentUser);
      });
    } else {
      state.userProfile = null;
      state.authIdentityReady = true;
      userProfileLoadPromise = Promise.resolve();
      updateAccountUI(null);
    }
  });

  // FEATURE (#6): todo lo que sigue queda envuelto en un finally que saca la pantalla de
  // carga pase lo que pase — si cardDb.loadAll() (sin su propio try/catch, a propósito: sin
  // cartas el juego no puede arrancar igual) llegara a fallar, es preferible mostrar el
  // menú roto/vacío (con su propio error en la consola) antes que dejar a alguien mirando
  // un círculo girando para siempre sin ninguna pista de qué pasó.
  try {
    globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('card_pool_load_start');
    await cardDb.loadAll();
    globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('card_pool_load_ready', { total: cardDb.allCards.length });

    // PANEL DE ADMIN / balance remoto: desktop conserva la carga previa al menú. En phone
    // boot usamos defaults hasta que el usuario invoque una función online; así Firebase
    // queda completamente fuera del camino crítico de Solitario/mobile.
    if (!phoneBoot) {
      try {
        const config = await loadGameConfig();
        applyGameConfig(config);
      } catch (err) {
        console.error('No se pudo cargar la configuración del juego — se usan los valores por defecto:', err);
      }
    } else {
      globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('firebase_config_deferred_mobile');
    }
  } catch (err) {
    console.error('[BOOT_FATAL] No se pudo cargar/validar el pool de cartas:', err);
    markEngineBootState('error', { code: err?.code || 'BOOT_FATAL', message: err?.message || String(err) });
    const rateLimited = err?.code === 'GITHUB_PAGES_RATE_LIMIT' || err?.status === 429;
    const poolMismatch = err?.code === 'POOL_CONTRACT_VIOLATION';
    const title = rateLimited ? '⏳ GitHub Pages limitó temporalmente las solicitudes'
      : poolMismatch ? '🛑 El pool de cartas no coincide con esta versión'
      : '🛑 No se pudo cargar la base de cartas';
    const body = rateLimited
      ? 'No sigas refrescando repetidamente: eso puede prolongar el bloqueo. Esperá unos minutos y reintentá una sola vez.'
      : poolMismatch
        ? 'Argentinia se detuvo antes de jugar para evitar arrancar con cartas faltantes, duplicadas o de otra entrega.'
        : 'Revisá la conexión y la consola. El juego no habilitará gameplay con una carga parcial.';
    document.body.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08100b;color:#f0e0b0;font-family:system-ui;padding:24px"><div style="max-width:680px;border:2px solid #d4af37;border-radius:14px;padding:24px;text-align:center;background:#111a13"><h2>${title}</h2><p>${body}</p><p style="opacity:.8">Motor ${ENGINE_VERSION} · Pool esperado: ${POOL_BASELINE.total} cartas.</p></div></div>`;
    return;
  } finally {
    const loadingOverlay = document.getElementById('boot-loading-overlay');
    if (loadingOverlay) loadingOverlay.remove();
  }

  markEngineBootState('ready', { engineVersion: ENGINE_VERSION });
  showMainMenu(startPlayFlow, startMultiplayerFlow);

  // 23.13.61 — el popup de anuncios ya no nace dentro de showMainMenu antes de que Auth
  // resuelva. Para guest se muestra recién cuando sabemos que realmente NO hay usuario;
  // para cuentas autenticadas lo muestra userProfileLoadPromise después de Daily Rewards.
  void (async () => {
    try {
      await waitForInitialAuthState();
      if (!state.currentUser) await maybeShowAnnouncementPopup({ currentUser: null });
    } catch (err) {
      console.warn('No se pudo revisar el anuncio de inicio:', err);
    }
  })();

  // 23.13.54 — el prompt Solo se decide recién cuando Auth dejó de estar UNKNOWN, para
  // no ofrecer un recovery de Gaucho a una cuenta que todavía se está restaurando.
  void (async () => {
    try {
      await waitForInitialAuthState();
      if (state.currentUser) await userProfileLoadPromise;
      await offerSoloRecoveryIfAvailable();
    } catch (err) {
      console.warn('No se pudo revisar recovery Solo al arrancar:', err);
    }
  })();

  // 23.13.29 — Textos del Juego se carga DESPUÉS de mostrar el primer menú. Es un doc
  // público y opcional: jamás bloquea boot/Solitario/mobile. Al llegar, aplica overrides
  // válidos y avisa a la UI para refrescar el menú que ya estaba visible.
  void loadGameTextOverrides()
    .then(documentData => {
      applyGameTextOverrides(documentData);
      try { window.dispatchEvent(new CustomEvent('argentinia:game-texts-updated')); } catch {}
      globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('game_texts_loaded_after_first_menu');
    })
    .catch(error => {
      console.error('No se pudieron cargar los Textos del Juego — se mantienen los originales locales:', error);
    });

  // Firebase queda fuera del critical path, pero se precalienta cuando el menú ya está
  // visible. Así el click de Google puede abrir el popup dentro de la activación del usuario.
  scheduleMobileFirebasePrewarm();
}

// FASE 3, ETAPA 4: si el jugador logueado ya tiene al menos un mazo guardado, "Jugar" le
// pregunta con cuál de los suyos quiere entrar (showPlayDeckPickerModal) — con la opción de
// igual armar uno random si prefiere. Sin sesión, o con sesión pero sin ningún mazo
// guardado todavía (no debería pasar en la práctica, pero por las dudas), el comportamiento
// es EXACTAMENTE el de siempre: selector de identidad, mazo random.
async function startPlayFlow() {
  try {
    await ensureMenuIdentityReady();
  } catch (err) {
    console.error('No se pudo iniciar Jugar sin una identidad resuelta:', err);
    showMainMenu(startPlayFlow, startMultiplayerFlow);
    return;
  }
  const savedDecks = (state.currentUser && state.userProfile && state.userProfile.decks) || [];
  // 23.13.52 — FAIL CLOSED: si Auth dice que sos usuario real, jamás caemos al camino
  // random de invitado por falta/transición de perfil. Esa era exactamente la carrera F5.
  if (state.currentUser) {
    if (savedDecks.length <= 0) {
      window.alert(gameText('menu.noDecksReady'));
      showMainMenu(startPlayFlow, startMultiplayerFlow);
      return;
    }
    showPlayDeckPickerModal(
      (chosenDeck) => initGame({ type: 'saved', deck: chosenDeck }),
      null,
      () => showMainMenu(startPlayFlow, startMultiplayerFlow)
    );
    return;
  }

  // Sólo una identidad Auth resuelta explícitamente como null puede jugar como Gaucho/random.
  showDeckSelectionModal(
    (chosenIdentity) => initGame({ type: 'random', identity: chosenIdentity }),
    {},
    () => showMainMenu(startPlayFlow, startMultiplayerFlow)
  );
}

// FASE 4 (CIERRE DEL ROADMAP): se llama desde showMultiplayerLobby (ui.js) apenas dos
// jugadores se emparejan — elegís tu mazo exactamente con el mismo picker que Solitario. No
// hace falta coordinar nada con el rival para esto: cada mazo/mano es privado por diseño,
// así que cada cliente arma el suyo de forma totalmente independiente.
function startMultiplayerFlow(matchId, myRole, rivalName, rivalPhotoURL = '', startingRole = 'host') {
  // Multiplayer normal sigue sin mazos random. 23.8.1 agrega una ÚNICA excepción de QA:
  // "Mazo de pruebas", determinista y no persistente, visible al pie del picker.
  showPlayDeckPickerModal(
    (chosenDeck) => startMultiplayerMatch(matchId, myRole, { type: 'saved', deck: chosenDeck }, rivalName, rivalPhotoURL, startingRole),
    null,
    () => showMainMenu(startPlayFlow, startMultiplayerFlow),
    () => startMultiplayerMatch(matchId, myRole, { type: 'test' }, rivalName, rivalPhotoURL, startingRole)
  );
}

// FASE 4 (CIERRE DEL ROADMAP): arranca una partida multiplayer real — cada cliente arma SU
// PROPIO mazo/mano (el rival NUNCA se arma acá, es una persona de verdad del otro lado; su
// mano/mazo llegan solos por sync una vez que publique lo suyo). Desde 23.13.52 el lobby
// trae un startingRole 50/50 decidido una sola vez al crearse; ambos clientes convierten
// ese mismo rol compartido a su perspectiva local/rival.
function startMultiplayerMatch(matchId, myRole, deckSource, rivalName, rivalPhotoURL = '', rawStartingRole = 'host') {
  enterGameplayAudio();
  // ENTREGA 23.8.5 — al entrar a gameplay no puede sobrevivir ningún overlay del flujo
  // menú/lobby/picker. Antes el menú quedaba oculto (display:none) debajo del tablero; con
  // el doble boot podía quedar una SEGUNDA copia visible y parecía que la partida explotaba.
  document.querySelectorAll('#main-menu-overlay, #multiplayer-overlay, #mydecks-overlay').forEach(el => el.remove());

  if (state.currentMatch?.engineVersion && !isExactMultiplayerVersionCompatible(state.currentMatch.engineVersion, state.currentMatch.engineProtocolVersion)) {
    throw new Error(`No se puede iniciar multiplayer con builds distintas (${ENGINE_VERSION} vs ${state.currentMatch.engineVersion}).`);
  }
  const isSavedDeck = deckSource?.type === 'saved' && !!deckSource.deck;
  const isTestDeck = deckSource?.type === 'test';
  if (!isSavedDeck && !isTestDeck) {
    throw new Error('Multijugador sólo admite mazos propios guardados o el Mazo de pruebas de QA.');
  }

  setupBoardLayout();
  replaceSpellStackFromSync([]);
  state.localManaPool = emptyManaPool();
  state.rivalManaPool = emptyManaPool();
  lastKnownPublicWire = null;
  lastKnownPrivateWire = null;
  lastAppliedWriterSeq.clear();

  const deckLabel = isTestDeck ? MULTIPLAYER_TEST_DECK_NAME : deckSource.deck.name;
  state.localDeck = isTestDeck
    ? buildMultiplayerTestDeck()
    : buildDeckFromCardIds(deckSource.deck.cardIds, state.userProfile && state.userProfile.enhancements);

  // Arrancan vacíos a propósito — se llenan solos apenas llegue el primer sync del rival
  // con las cantidades reales (ver startListeningToMatch, matchSync.js).
  state.rivalHand = [];
  state.rivalDeck = [];

  for (let i = 0; i < 7; i++) {
    state.localHand.push(state.localDeck.pop());
  }

  // 23.13.52 — el lobby ya trae un resultado 50/50 persistido en Firestore. Ambos
  // clientes convierten el MISMO startingRole a su perspectiva local/rival.
  const startingRole = normalizeStartingRole(rawStartingRole);
  const multiplayerStartingSide = startingSideForRole(startingRole, myRole);

  // BUGFIX: guardamos el nombre real del rival acá — getRivalName() (más arriba en este
  // archivo) lo usa en vez de "El Tano" en todos los mensajes que corren tanto en
  // Solitario como en multiplayer (motor de combate, efectos, turnos).
  state.currentMatch = { matchId, myRole, rivalName: rivalName || 'tu rival', rivalPhotoURL: rivalPhotoURL || '', startingRole, engineVersion: ENGINE_VERSION, engineProtocolVersion: ENGINE_PROTOCOL_VERSION };
  startMultiplayerPresenceHeartbeat(matchId, myRole);
  state.activePlayer = multiplayerStartingSide;
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  state.phase = 'main1';
  state.turnCount = 1;

  // ENTREGA 22: en multiplayer el start ocurre acá (la mano inicial de 7 ya fue robada
  // localmente). recordTelemetryInitialDecks reconstruye el orden original de las 60 cartas
  // como biblioteca restante + mano inicial invertida; del rival guarda sólo cantidad.
  startTelemetrySession({
    mode: 'multiplayer',
    matchId,
    myRole,
    deckLabel
  });
  recordTelemetryEvent('starting_player_selected', {
    mode: 'multiplayer',
    startingRole,
    myRole,
    startingSide: multiplayerStartingSide,
    winner: multiplayerStartingSide === 'local' ? getLocalPlayerName() : (rivalName || 'tu rival')
  });
  recordTelemetryInitialDecks({ revealRival: false, reconstructLocalOpeningHand: true });

  // El mulligan es 100% local (solo mira tu propia mano/mazo) — se reusa TAL CUAL de
  // Solitario, sin ningún cambio: nunca necesitó saber nada del rival para funcionar bien.
  const finishSetup = async () => {
    state.multiplayerWaitingForReady = true;
    showMultiplayerReadyBarrier(rivalName || 'tu rival', true, false);

    // Primero publicamos el estado POST-mulligan completo (incluida mano privada), y sólo
    // después levantamos nuestro ready. Así "ready" significa de verdad "ya podés leer mi
    // estado inicial consistente", no simplemente "cerré el modal".
    render();
    await publishMatchState({ force: true });
    await setMatchPlayerReady(matchId, myRole, true);

    const stopReadyListener = listenToMatch(matchId, (doc) => {
      if (!doc) return;
      const bothReady = doc.hostReady === true && doc.guestReady === true;
      showMultiplayerReadyBarrier(rivalName || 'tu rival', true, bothReady);
      if (!bothReady) return;

      stopReadyListener();
      // El snapshot que confirmó bothReady ya contiene el estado inicial post-mulligan de
      // ambos. Lo aplicamos ANTES de quitar el overlay: así el host nunca puede actuar en
      // un tablero donde todavía ve 0 cartas/0 mazo del guest por unos milisegundos.
      Object.assign(state,
        extractRivalStateFromPublicDoc(doc, myRole),
        extractSharedStateFromPublicDoc(doc, myRole)
      );
      relinkEquipmentAttachments(state);
      if (Array.isArray(doc.stackState)) replaceSpellStackFromSync(deserializeStackFromPublic(doc.stackState, state, myRole));
      lastKnownPublicWire = wireClone(doc);

      state.multiplayerWaitingForReady = false;
      hideMultiplayerReadyBarrier();
      startListeningToMatch(matchId, myRole);
      hookGameplayButtons();
      if (state.priorityPlayer === 'local') resetPriorityClock('match_start');
      render();
      recordTelemetryEvent('multiplayer_both_ready', { matchId, myRole, hostReady: true, guestReady: true });
      logMsg(gameText('game.start.deck', { deck: deckLabel }));
      logMsg(state.activePlayer === 'local' ? gameText('game.start.yourTurnHint') : gameText('game.start.waitingRival'));
    });
  };

  showStartingCoinToss({
    localName: getLocalPlayerName(),
    rivalName: rivalName || 'tu rival',
    winnerSide: multiplayerStartingSide
  }).then(() => {
    startLocalMulliganFlow(() => { finishSetup().catch(err => {
      console.error('No se pudo completar la barrera de inicio multiplayer:', err);
      state.multiplayerWaitingForReady = false;
      hideMultiplayerReadyBarrier();
      alert('No se pudo sincronizar el inicio de la partida. Volvé al menú e intentá nuevamente.');
    }); });
  }).catch(err => {
    console.error('Falló la presentación del sorteo inicial; se continúa con el resultado ya fijado:', err);
    startLocalMulliganFlow(() => { finishSetup().catch(setupErr => {
      console.error('No se pudo completar la barrera de inicio multiplayer:', setupErr);
      state.multiplayerWaitingForReady = false;
      hideMultiplayerReadyBarrier();
    }); });
  });
}

// FASE 4, ETAPA 2: publica MI mitad del estado en Firestore — se llama desde render()
// (ui.js) después de CUALQUIER cambio real al tablero, sin excepción. Si no estoy en una
// partida multiplayer activa (state.currentMatch en null — el caso de Solitario, que sigue
// siendo el 100% de las partidas hasta que el multiplayer esté completo), no hace
// ABSOLUTAMENTE nada: nunca se intenta escribir en Firestore durante una partida contra el
// Tano. "Fire and forget" a propósito (no se espera con await desde render(), que es
// síncrona) — un fallo de red acá no debe trabar ni romper el renderizado del juego.
// FASE 4, ETAPA 5: true si la zona que se está por tocar es la mano/mazo del RIVAL durante
// una partida multiplayer real — ahí este cliente NUNCA tiene las cartas de verdad (por
// diseño, ver matchSync.js: solo se sincroniza la CANTIDAD). Cualquier efecto que necesite
// buscar, nombrar o mover una carta puntual de esa zona a una zona PÚBLICA (cementerio,
// exilio, campo) no se puede resolver bien todavía — haría falta que el propio cliente del
// rival aplique el efecto sobre sus datos privados, algo que no existe todavía. Se usa para
// saltear esos efectos con un aviso honesto, en vez de arriesgar un crash (revisar
// propiedades de un valor vacío) o corromper una zona pública con un valor inventado.
export function isHiddenRivalZone(isTargetLocal) {
  return !!state.currentMatch && !isTargetLocal;
}


// ENTREGA 23.6 — frontera de sincronización remota.
// Mientras aplicamos un snapshot que VINO de Firestore, render() puede hacer todo su trabajo
// visual/diagnóstico normal, pero publishMatchState() NO debe devolver ese mismo snapshot al
// servidor. Éste era el eco que convertía un cambio remoto en otro write y, en combate,
// podía reinyectar una fase vieja hasta formar una tormenta.
let remoteSyncApplyDepth = 0;

// Un solo publish público/privado puede estar en vuelo por cliente. Si el motor cambia de
// nuevo mientras espera a Firestore, no abrimos una segunda escritura: marcamos `queued` y,
// cuando termine la actual, publicamos UNA sola vez el estado más fresco disponible.
let matchPublishInFlight = null;
let matchPublishQueued = false;
let matchSyncWriterSeq = 0;
const matchSyncClientId = `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
let lastKnownPublicWire = null;
let lastKnownPrivateWire = null;
const lastAppliedWriterSeq = new Map();

function wireClone(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function stableWireValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map(v => stableWireValue(v, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  Object.keys(value).sort().forEach(key => {
    const v = value[key];
    if (v !== undefined && typeof v !== 'function') out[key] = stableWireValue(v, seen);
  });
  seen.delete(value);
  return out;
}

function stableWireStringify(value) {
  try { return JSON.stringify(stableWireValue(value)); }
  catch { try { return JSON.stringify(value); } catch { return String(value); } }
}

function wireEqual(a, b) {
  return stableWireStringify(a) === stableWireStringify(b);
}

// ENTREGA 23.7 — publica DELTAS, no snapshots completos. Ésta es la barrera que evita que
// un cliente pasivo vuelva a escribir una phase/turnCount vieja simplemente porque hizo
// click en "Pasar prioridad" después de recibir el estado nuevo del rival.
function buildWireDelta(candidate, baseline) {
  if (!candidate || typeof candidate !== 'object') return {};
  if (!baseline || typeof baseline !== 'object') return { ...candidate };
  const delta = {};
  Object.entries(candidate).forEach(([key, value]) => {
    if (!wireEqual(value, baseline[key])) delta[key] = value;
  });
  return delta;
}

function mergeWireBaseline(baseline, patch) {
  return { ...(baseline || {}), ...(wireClone(patch) || {}) };
}

async function drainMatchPublishQueue() {
  while (matchPublishQueued && state.currentMatch && state.currentUser) {
    matchPublishQueued = false;
    const { matchId, myRole } = state.currentMatch;
    const publicCandidate = buildMyPublicPatch(state, myRole, spellStack);
    const privateCandidate = buildMyPrivatePatch(state);
    const publicPatch = buildWireDelta(publicCandidate, lastKnownPublicWire);
    const privatePatch = buildWireDelta(privateCandidate, lastKnownPrivateWire);

    const publicKeys = Object.keys(publicPatch);
    const privateKeys = Object.keys(privatePatch);
    if (publicKeys.length === 0 && privateKeys.length === 0) continue;

    // Metadato de transporte: como el documento usa merge:true, un listener no puede saber
    // qué campos pertenecen AL ÚLTIMO write mirando sólo el snapshot final. Guardamos la
    // lista exacta de keys tocadas y el rol que escribió. Así el rival puede aceptar cambios
    // legítimos sobre SU propio battlefield (daño/removal resuelto por el jugador activo)
    // sin confundir campos viejos que simplemente quedaron almacenados en el documento.
    const writerSeq = ++matchSyncWriterSeq;
    const publishId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (publicKeys.length > 0) {
      publicPatch.syncMeta = {
        writerRole: myRole,
        writerClientId: matchSyncClientId,
        writerSeq,
        publishId,
        engineVersion: ENGINE_VERSION,
        engineProtocolVersion: ENGINE_PROTOCOL_VERSION,
        touchedKeys: [...publicKeys]
      };
    }

    const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    recordTelemetryNetwork('sync_publish_start', {
      publishId,
      matchId,
      myRole,
      turnCount: publicCandidate.turnCount,
      phase: publicCandidate.phase,
      activePlayer: publicCandidate.activePlayer,
      priorityPlayer: publicCandidate.priorityPlayer,
      consecutivePasses: publicCandidate.consecutivePasses,
      stackDepth: Array.isArray(publicCandidate.stackState) ? publicCandidate.stackState.length : 0,
      writerSeq,
      writerClientId: matchSyncClientId,
      publicKeys,
      privateKeys,
      pendingDecision: publicCandidate.pendingDecision ? {
        type: publicCandidate.pendingDecision.type,
        forRole: publicCandidate.pendingDecision.forRole,
        requestId: publicCandidate.pendingDecision.requestId
      } : null,
      decisionResponse: publicCandidate.decisionResponse ? {
        type: publicCandidate.decisionResponse.type,
        requestId: publicCandidate.decisionResponse.requestId
      } : null,
      localHandCount: privateCandidate.hand?.length ?? null,
      localDeckCount: privateCandidate.deck?.length ?? null
    });

    state.matchSyncBusy = true;
    try {
      const writes = [];
      if (publicKeys.length > 0) writes.push(publishMyPublicState(matchId, publicPatch));
      if (privateKeys.length > 0) writes.push(publishMyPrivateState(matchId, state.currentUser.uid, privatePatch));
      await Promise.all(writes);
      if (publicKeys.length > 0) lastKnownPublicWire = mergeWireBaseline(lastKnownPublicWire, publicPatch);
      if (privateKeys.length > 0) lastKnownPrivateWire = mergeWireBaseline(lastKnownPrivateWire, privatePatch);
      const endedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      recordTelemetryNetwork('sync_publish_ok', {
        publishId,
        durationMs: Math.round(endedAt - startedAt)
      });
    } catch (err) {
      const endedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      recordTelemetryNetwork('sync_publish_error', {
        publishId,
        durationMs: Math.round(endedAt - startedAt),
        error: err
      }, 'error');
      console.error('No se pudo publicar el estado de la partida:', err);
      // No hacemos loop apretado ante una caída de red. El próximo cambio real/render o
      // checkpoint de gameplay volverá a pedir publish; el fingerprint no se confirma si
      // este write falló.
    } finally {
      state.matchSyncBusy = false;
    }
  }
}

export function publishMatchState(options = {}) {
  if (!state.currentMatch || !state.currentUser) return Promise.resolve(false);
  if (remoteSyncApplyDepth > 0 && !options.force) return Promise.resolve(false);

  matchPublishQueued = true;
  if (!matchPublishInFlight) {
    matchPublishInFlight = drainMatchPublishQueue().finally(() => {
      matchPublishInFlight = null;
      // Puede haberse encolado un cambio en el micro-instante entre el último chequeo del
      // while y este finally. Lo drenamos en otro microtask, siempre serializado.
      if (matchPublishQueued) publishMatchState().catch(() => {});
    });
  }
  return matchPublishInFlight;
}

// FASE 4, ETAPA 3 + ETAPA MOTOR 3: el documento público conserva UN solo buzón de
// decisión (`pendingDecision`/`decisionResponse`), pero ya no asumimos que el motor genera
// "a lo sumo una" pregunta. Los triggers directos son síncronos y pueden disparar varias
// decisiones remotas en el mismo evento; por eso una cola LOCAL serializa las preguntas y
// publica exactamente una por vez. Las Promises se correlacionan por requestId y una
// respuesta vieja/ajena nunca puede resolver otra petición.
//
// Vive fuera de `state` a propósito: la cola contiene resolvers de Promise (funciones), que
// jamás deben viajar por Firestore. `state.awaitingRivalDecision`, en cambio, sí refleja si
// queda al menos una decisión activa/encolada y bloquea acciones locales hasta vaciarla.
const remoteDecisionQueue = createRemoteDecisionQueue({
  onActivate: (request) => {
    recordTelemetryDecision('remote_decision_activate', {
      type: request.type,
      forRole: request.forRole,
      requestId: request.requestId
    });
    state.awaitingRivalDecision = true;
    state.pendingDecision = request;
    state.decisionResponse = null;
    render(); // publica YA la siguiente pregunta; no espera a otro tick/render incidental
  },
  onIdle: () => {
    recordTelemetryDecision('remote_decision_queue_idle');
    state.pendingDecision = null;
    state.decisionResponse = null;
    state.awaitingRivalDecision = false;
    render(); // limpia el buzón público al terminar TODA la cola
  }
});

// MECANISMO GENERAL DE DECISIÓN REMOTA — cada llamada obtiene su propia Promise, pero si ya
// hay otra pregunta en vuelo queda encolada sin tocar el buzón publicado. Esto permite que
// múltiples `discard` de gatillos simultáneos se resuelvan realmente uno detrás de otro en
// la mano privada del rival, sin sobrescribir resolvers ni perder respuestas.
export function requestRivalDecision(type, forRole, data) {
  const requestId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  recordTelemetryDecision('remote_decision_enqueue', {
    type,
    forRole,
    requestId,
    data
  });
  return remoteDecisionQueue.enqueue({ type, forRole, requestId, ...data });
}

// 23.16.5 — chooseCreatureType comparte una sola decisión humano/Tano/multiplayer.
export async function chooseCreatureTypeForEffect(effect={},isLocal=true,sourceItem=null,sourceCard=null){
  const fullCatalog=buildCreatureTypeCatalog(cardDb.allCards,{minCount:Math.max(1,Number(effect.minPoolCount)||1)});
  let catalog=fullCatalog;
  if(Array.isArray(effect.options) && effect.options.length){
    const allowed=new Set(effect.options.map(x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
    catalog=fullCatalog.filter(x=>allowed.has(x.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
  }
  if(!catalog.length) return null;
  let chosen=null;
  if(isLocal){
    chosen=await new Promise(resolve=>showCreatureTypeChoiceModal(catalog,{title:effect.title||'Elegí un tipo de criatura',cardName:sourceCard?.name||sourceItem?.card?.name||''},resolve,()=>resolve(null)));
  } else if(state.currentMatch){
    const response=await requestRivalDecision('typal_choose_creature_type',otherRole(state.currentMatch.myRole),{
      options:catalog, title:effect.title||'Elegí un tipo de criatura', cardName:sourceCard?.name||sourceItem?.card?.name||'', sourceSyncObjectId:sourceItem?._syncObjectId||null
    });
    chosen=response?.chosenType||null;
  } else {
    const preferred=[...(state.rivalCombat||[]),...(state.rivalSupport||[])].map(x=>x.card);
    chosen=chooseBestCreatureType(cardDb.allCards,preferred);
    if(chosen && !catalog.some(x=>x.name===chosen)) chosen=catalog[0].name;
  }
  if(!chosen) return null;
  if(sourceItem) setChosenCreatureType(sourceItem,chosen);
  dispatchGameEvent({type:'creature_type_chosen',controllerIsLocal:isLocal,actorIsLocal:isLocal,card:sourceItem?.card||sourceCard||null,item:sourceItem,sourceCard:sourceCard||sourceItem?.card||null,sourceItem,metadata:{creatureType:chosen}});
  logMsg(`🧬 ${sourceCard?.name||sourceItem?.card?.name||'Efecto'}: se eligió ${chosen}.`);
  render();
  return chosen;
}


// ENTREGA 23.10 — PROTOCOLO PRIVADO UNIVERSAL.
// El dueño de una zona privada crea una oferta temporal tokenizada. La identidad real de
// cada token queda SÓLO en este Map del cliente dueño. El chooser recibe por Firestore
// participant-only únicamente slots opacos (default) o descriptores saneados si una regla
// dice expresamente que puede mirar/revelar esas cartas.
const privateZoneOfferMemory = new Map();

function privateZoneCardMatchesFilter(card, filter = 'any') {
  if (!card) return false;
  if (!PRIVATE_ZONE_FILTERS.includes(filter)) return false;
  if (filter === 'any') return true;
  const type = typeof card.type === 'string' ? card.type : '';
  const isLand = type.includes('Tierra');
  const isCreature = card.power !== undefined || type.includes('Criatura');
  if (filter === 'land') return isLand;
  if (filter === 'nonland') return !isLand;
  if (filter === 'creature') return isCreature;
  if (filter === 'noncreature') return !isCreature;
  if (filter === 'instant') return type.includes('Instantáneo');
  if (filter === 'sorcery') return type.includes('Conjuro');
  if (filter === 'artifact') return type.includes('Artefacto');
  if (filter === 'enchantment') return type.includes('Encantamiento');
  if (filter === 'planeswalker') return type.includes('Planeswalker');
  return false;
}

function getPrivateZoneCardsForOffer(zone, range = 'all', rangeCount = null, ownerIsLocal = true) {
  const raw = zone === 'deck'
    ? (ownerIsLocal ? state.localDeck : state.rivalDeck)
    : (ownerIsLocal ? state.localHand : state.rivalHand);
  if (!Array.isArray(raw)) return [];
  let candidates;
  if (zone === 'deck' && range === 'top_n') {
    const n = Math.max(0, Math.min(raw.length, Math.floor(Number(rangeCount) || 0)));
    // En Argentinia el tope del mazo es deck[deck.length - 1] (draw usa pop()).
    candidates = raw.slice(Math.max(0, raw.length - n));
  } else {
    candidates = [...raw];
  }
  return candidates;
}

function removePrivateZoneCard(zone, ownerIsLocal, card) {
  const array = zone === 'deck'
    ? (ownerIsLocal ? state.localDeck : state.rivalDeck)
    : (ownerIsLocal ? state.localHand : state.rivalHand);
  const idx = array.indexOf(card);
  if (idx === -1) return false;
  array.splice(idx, 1);
  return true;
}

function moveSelectedPrivateCards(cards, { zone, ownerIsLocal, destination }) {
  const grave = ownerIsLocal ? state.localGraveyard : state.rivalGraveyard;
  const exile = ownerIsLocal ? state.localExile : state.rivalExile;
  const hand = ownerIsLocal ? state.localHand : state.rivalHand;
  const deck = ownerIsLocal ? state.localDeck : state.rivalDeck;
  const moved = [];
  for (const card of cards) {
    if (!removePrivateZoneCard(zone, ownerIsLocal, card)) continue;
    if (destination === 'graveyard') grave.push(card);
    else if (destination === 'exile') exile.push(card);
    else if (destination === 'hand') hand.push(card);
    else if (destination === 'bottom') deck.unshift(card);
    else if (destination === 'top') deck.push(card);
    else throw new Error(`Destino privado no soportado: ${destination}`);
    moved.push(card);
  }
  return moved;
}

function choosePrivateZoneOfferLocally(offer, cardName, { optional = false } = {}) {
  state.pendingPrivateZoneChoice = { requestId: offer.requestId, zone: offer.zone, amount: offer.amount, mandatory: !optional };
  render();
  return new Promise((resolve, reject) => {
    const finish = tokens => {
      state.pendingPrivateZoneChoice = null;
      render();
      resolve(tokens);
    };
    const cancel = optional ? (() => {
      state.pendingPrivateZoneChoice = null;
      render();
      reject(new Error('private_zone_choice_cancelled'));
    }) : null;
    showPrivateZoneChoiceModal(offer, cardName, finish, cancel);
  });
}

function choosePrivateZoneOfferForBot(offer, tokenMap) {
  const candidates = Array.isArray(offer?.candidates) ? offer.candidates.filter(entry => entry.selectable !== false) : [];
  const amount = Math.max(0, Number(offer?.amount || 0));
  if (amount <= 0) return [];
  if (offer?.visibility === PRIVATE_ZONE_VISIBILITY.OPAQUE) {
    // Una selección opaca no autoriza al bot a usar identidad: elige slots al azar.
    const pool = [...candidates];
    const picked = [];
    while (picked.length < amount && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].token);
    }
    return picked;
  }
  const value = entry => {
    const card = tokenMap?.get(entry.token) || entry.card || {};
    const body = card.power !== undefined ? (Number(card.power || 0) + Number(card.toughness || 0)) * 0.15 : 0;
    return Number(card.cmc || 0) + body;
  };
  return candidates.sort((a, b) => value(b) - value(a) || a.slot - b.slot).slice(0, amount).map(entry => entry.token);
}

// API de alto nivel para cartas futuras del estilo "elegí una carta de la mano del rival"
// o "elegí una de las primeras N cartas de su mazo". NO escribe nunca en rivalHand/rivalDeck
// en multiplayer. `visibility:'opaque_slots'` permite elegir un objeto real sin conocer su
// identidad; `reveal_candidates` sirve para efectos que sí autorizan mirar esas cartas.
export async function requestPrivateZoneChoice(options = {}) {
  const zone = options.zone === 'deck' ? 'deck' : 'hand';
  const amount = Math.max(0, Math.floor(Number(options.amount ?? 1) || 0));
  const visibility = options.visibility === PRIVATE_ZONE_VISIBILITY.REVEAL
    ? PRIVATE_ZONE_VISIBILITY.REVEAL : PRIVATE_ZONE_VISIBILITY.OPAQUE;
  const destination = options.destination || (zone === 'hand' ? 'graveyard' : 'exile');
  const range = options.range || (zone === 'deck' ? 'top_n' : 'all');
  const rangeCount = options.rangeCount ?? (zone === 'deck' ? amount : null);
  const filter = PRIVATE_ZONE_FILTERS.includes(options.filter) ? options.filter : 'any';
  const cardName = options.cardName || 'Efecto';
  const optional = options.optional === true;
  if (visibility === PRIVATE_ZONE_VISIBILITY.OPAQUE && filter !== 'any') {
    throw new Error('private_zone_opaque_filter_would_leak_information');
  }

  // ENTREGA 23.10.1 — BLINDAJE ANTI-PEEK.
  // Mirar/seleccionar información privada es parte del EFECTO EN RESOLUCIÓN, nunca del
  // anuncio/target/costo de CR 601. Si una carta futura intenta llamar este protocolo
  // mientras el casteo todavía puede cancelarse, abortamos antes de crear/publicar oferta.
  if (state.pendingCastTransaction) {
    recordTelemetryDecision('private_zone_choice_blocked_during_cast', {
      zone, amount, visibility, range, rangeCount, filter, cardName
    });
    throw new Error('private_zone_choice_not_during_cast');
  }

  if (amount <= 0) return { completed: true, movedNames: [], selectedCount: 0 };

  // Solitario también usa la misma frontera offer/token/commit. `ownerIsLocal` y
  // `chooserIsLocal` permiten reutilizarla cuando la habilidad la controla El Tano.
  if (!state.currentMatch) {
    const ownerIsLocal = options.ownerIsLocal === true;
    const chooserIsLocal = options.chooserIsLocal !== false;
    const cards = getPrivateZoneCardsForOffer(zone, range, rangeCount, ownerIsLocal);
    const eligibleCards = cards.filter(card => privateZoneCardMatchesFilter(card, filter));
    const requestId = `pz_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const built = buildPrivateZoneOffer({
      requestId,
      ownerRole: ownerIsLocal ? 'local' : 'rival',
      chooserRole: chooserIsLocal ? 'local' : 'rival',
      zone, cards, eligibleCards, visibility, amount,
      operation: options.operation || 'move',
      range, filter
    });
    if (built.offer.amount <= 0) {
      return { completed:true, movedNames:[], selectedCount:0, reason:'no_candidates' };
    }
    const tokens = chooserIsLocal
      ? await choosePrivateZoneOfferLocally(built.offer, cardName, { optional })
      : choosePrivateZoneOfferForBot(built.offer, built.tokenMap);
    const selected = resolvePrivateZoneSelection(built.tokenMap, built.offer, tokens);
    if (!selected.ok) return { completed:false, movedNames:[], selectedCount:0, reason:selected.reason };
    const moved = moveSelectedPrivateCards(selected.cards, { zone, ownerIsLocal, destination });
    render();
    return {
      completed:moved.length === built.offer.amount,
      movedNames:['graveyard','exile'].includes(destination) ? moved.map(c=>c.name) : [],
      selectedCount:moved.length
    };
  }

  const myRole = state.currentMatch.myRole;
  const ownerRole = options.ownerRole || otherRole(myRole);
  if (ownerRole === myRole) throw new Error('requestPrivateZoneChoice está pensado para elegir sobre una zona privada del rival.');

  const offerAck = await requestRivalDecision('private_zone_offer', ownerRole, {
    zone, amount, visibility, range, rangeCount, filter,
    operation: options.operation || 'move', destination, cardName,
    chooserRole: myRole, optional
  });
  if (!offerAck?.completed) return { completed:false, movedNames:[], selectedCount:0, reason:offerAck?.reason || 'offer_failed' };

  const offer = await fetchPrivateSelectionOffer(state.currentMatch.matchId, offerAck.offerId);
  if (!offer) return { completed:false, movedNames:[], selectedCount:0, reason:'offer_not_found' };
  recordTelemetryDecision('private_zone_offer_received', {
    requestId: offer.requestId, zone: offer.zone, visibility: offer.visibility,
    candidateCount: offer.candidateCount, amount: offer.amount, filter:offer.filter || 'any'
    // Deliberadamente NO se registran identidades de candidates.
  });
  if (Number(offer.amount || 0) <= 0) {
    try { await deletePrivateSelectionOffer(state.currentMatch.matchId, offerAck.offerId); } catch (_) {}
    return { completed:true, movedNames:[], selectedCount:0, reason:'no_candidates' };
  }
  const selectedTokens = await choosePrivateZoneOfferLocally(offer, cardName, { optional });
  const commit = await requestRivalDecision('private_zone_commit', ownerRole, {
    offerId: offerAck.offerId, selectedTokens, destination, cardName
  });
  try { await deletePrivateSelectionOffer(state.currentMatch.matchId, offerAck.offerId); } catch (_) {}
  return {
    completed: commit?.completed !== false,
    movedNames: commit?.movedNames || [],
    selectedCount: Number(commit?.selectedCount || 0),
    reason: commit?.reason || null
  };
}


// =========================================================================
// 23.14.4 LAND 3 — búsqueda avanzada de Tierras en biblioteca.
// La elección de una carta concreta ocurre durante la RESOLUCIÓN, nunca durante el casteo.
// `entries` conserva índices de slot para distinguir copias idénticas que compartan definición.
// =========================================================================
function landSearchFilterCopy(filter = 'any') {
  if (filter === 'basic') return gameText('land.search.filter.basic');
  if (filter === 'nonbasic') return gameText('land.search.filter.nonbasic');
  if (String(filter).startsWith('subtype:')) return gameText('land.search.filter.subtype', { subtype: String(filter).slice(8).trim() });
  return gameText('land.search.filter.any');
}

function landSearchDestinationCopy(destination = 'battlefield') {
  if (destination === 'hand') return gameText('land.search.destination.hand');
  if (destination === 'battlefield_tapped') return gameText('land.search.destination.battlefieldTapped');
  return gameText('land.search.destination.battlefield');
}

async function chooseLandSearchEntries({ ownerIsLocal, chooserIsLocal, spec, cardName }) {
  const deck = ownerIsLocal ? state.localDeck : state.rivalDeck;
  const candidates = getLandSearchCandidates(deck, spec.filter);
  const maxCount = Math.min(spec.amount, candidates.length);
  if (maxCount <= 0) return [];

  if (!chooserIsLocal) {
    return chooseBotLandSearchEntries(deck, spec.filter, maxCount, spec.destination);
  }

  state.pendingLandSearchChoice = {
    cardName,
    amount: spec.amount,
    maxCount,
    filter: spec.filter,
    destination: spec.destination
  };
  render();
  return new Promise(resolve => {
    showLandSearchModal({
      candidates,
      maxCount,
      cardName,
      filterLabel: landSearchFilterCopy(spec.filter),
      destinationLabel: landSearchDestinationCopy(spec.destination),
      allowFewer: spec.allowFewer
    }, chosenIndexes => {
      state.pendingLandSearchChoice = null;
      render();
      const byIndex = new Map(candidates.map(entry => [entry.index, entry]));
      const unique = [...new Set((chosenIndexes || []).map(Number))]
        .filter(Number.isInteger)
        .map(index => byIndex.get(index))
        .filter(Boolean)
        .slice(0, maxCount);
      resolve(unique);
    });
  });
}

async function commitLandSearchEntries({ ownerIsLocal, entries, spec, cardName }) {
  const deck = ownerIsLocal ? state.localDeck : state.rivalDeck;
  const hand = ownerIsLocal ? state.localHand : state.rivalHand;
  const lands = ownerIsLocal ? state.localLands : state.rivalLands;

  // Revalidar slots ANTES de mutar; la selección estuvo pausando resolución/prioridad.
  const valid = (entries || []).filter(entry =>
    Number.isInteger(entry?.index) && entry.index >= 0 && entry.index < deck.length &&
    deck[entry.index] === entry.card && landMatchesFilter(entry.card, spec.filter)
  );
  const cardsInSelectionOrder = valid.map(entry => entry.card);

  // Quitar desde índice mayor a menor para no desplazar slots todavía no retirados.
  [...valid].sort((a, b) => b.index - a.index).forEach(entry => deck.splice(entry.index, 1));

  const movedNames = cardsInSelectionOrder.map(card => card.name);
  if (spec.destination === 'hand') {
    cardsInSelectionOrder.forEach(landCard => hand.push(landCard));
  } else {
    // Si una instrucción encuentra varias Tierras, entran como un mismo evento. Determinamos
    // TODOS los replacement effects antes de poner la primera en mesa; así una Tierra Stax
    // que forma parte del mismo lote no empieza a modificar artificialmente a sus compañeras.
    const entering = cardsInSelectionOrder.map(landCard => {
      stampCardOwner(landCard, ownerIsLocal, state.currentMatch?.myRole || null);
      const landItem = {
        card:landCard,
        tapped:landEntersTappedForBattlefield(landCard, ownerIsLocal, spec.destination === 'battlefield_tapped'),
        enteredThisTurn:true,
        permanentTypes:['land']
      };
      initializeTransformPermanentItem(landItem,landCard,{face:'front'});
      stampPermanentController(landItem, ownerIsLocal, state.currentMatch?.myRole || null);
      return { card:landCard, item:landItem };
    });
    entering.forEach(entry => lands.push(entry.item));
    // Cada entrada genera su propio evento Landfall, pero todos los permanentes del lote ya
    // están presentes cuando se detectan esos triggers.
    for (const entry of entering) await triggerLandEtb(ownerIsLocal, entry.card, entry.item);
  }

  // El efecto dice "buscá ... luego barajá": también se baraja si se eligió encontrar 0.
  shuffleLibraryInPlace(deck);
  const identityIsPublic = spec.reveal || spec.destination !== 'hand';
  const publicMovedNames = identityIsPublic ? movedNames : [];
  recordTelemetryEvent('land_search_resolved', {
    source: cardName,
    filter: spec.filter,
    destination: spec.destination,
    selectedCount: movedNames.length,
    selectedNames: publicMovedNames
  });
  render();
  return { completed: true, selectedCount: movedNames.length, movedNames: publicMovedNames };
}

// API compartida por `search_land` y por el efecto legacy `ramp`. En multiplayer, si el
// controlador es el rival, este cliente jamás inspecciona rivalDeck: el dueño real elige,
// mueve y baraja en su propia pantalla. Sólo publica identidad si el efecto la revela o si
// el destino es una zona pública como battlefield.
export async function searchLibraryForLands({ isLocal = true, effect = {}, cardName = 'Efecto' } = {}) {
  const spec = normalizeLandSearchEffect(effect);
  if (spec.amount <= 0) return { completed: true, selectedCount: 0, movedNames: [] };

  if (isHiddenRivalZone(isLocal)) {
    const rivalRole = otherRole(state.currentMatch.myRole);
    const response = await requestRivalDecision('self_search_land', rivalRole, {
      amount: spec.amount,
      filter: spec.filter,
      destination: spec.destination,
      allowFewer: spec.allowFewer,
      reveal: spec.reveal,
      cardName
    });
    return {
      completed: response?.completed !== false,
      selectedCount: Number(response?.selectedCount || 0),
      movedNames: Array.isArray(response?.movedNames) ? response.movedNames : []
    };
  }

  const entries = await chooseLandSearchEntries({
    ownerIsLocal: isLocal,
    chooserIsLocal: isLocal,
    spec,
    cardName
  });
  return commitLandSearchEntries({ ownerIsLocal: isLocal, entries, spec, cardName });
}


// =========================================================================
// 23.15.6 — GENERIC LIBRARY / TUTOR / LOOK-AT-N.
// El mazo usa pop() para robar, por lo que deck[deck.length - 1] es la cima. El motor puro
// vive en libraryEngine.js; acá sólo hacemos selección privada, commits y ETB reales.
// =========================================================================
function libraryFilterCopy(filter = {}) {
  const f=filter || {};
  const parts=[];
  const typeLabels={
    any:'carta',spell:'hechizo',permanent:'permanente',land:'Tierra',nonland:'carta que no sea Tierra',
    creature:'criatura',noncreature:'carta que no sea criatura',instant:'instantáneo',sorcery:'conjuro',
    instant_or_sorcery:'instantáneo o conjuro',artifact:'artefacto',enchantment:'encantamiento',planeswalker:'Planeswalker'
  };
  parts.push(typeLabels[f.cardType] || 'carta');
  if(Array.isArray(f.subtypes) && f.subtypes.length) parts.push(`con subtipo ${f.subtypes.join('/')}`);
  if(Array.isArray(f.colors) && f.colors.length) parts.push(`de color ${f.colors.join('/')}`);
  if(f.exactManaValue!==null && f.exactManaValue!==undefined) parts.push(`con valor de maná ${f.exactManaValue}`);
  else {
    if(f.minManaValue!==null && f.minManaValue!==undefined) parts.push(`con valor de maná ${f.minManaValue} o más`);
    if(f.maxManaValue!==null && f.maxManaValue!==undefined) parts.push(`con valor de maná ${f.maxManaValue} o menos`);
  }
  if(f.landKind==='basic') parts.push('básica');
  if(f.landKind==='nonbasic') parts.push('no básica');
  if(f.legendary===true) parts.push('legendaria');
  return parts.join(' ');
}

function libraryDestinationCopy(destination='hand') {
  const labels={
    hand:'poner en tu mano',battlefield:'poner en el campo de batalla',battlefield_tapped:'poner girada en el campo de batalla',
    graveyard:'poner en tu cementerio',exile:'exiliar',top:'poner en la cima',bottom:'poner en el fondo'
  };
  return labels[destination] || destination;
}

async function chooseLibraryEntries({ ownerIsLocal, chooserIsLocal, spec, cardName }) {
  const deck=ownerIsLocal ? state.localDeck : state.rivalDeck;
  const windowEntries=getLibraryWindowEntries(deck,spec).map(entry=>({
    ...entry,
    selectable: libraryCardMatchesFilter(entry.card,spec.filter) && libraryCardCanMoveToDestination(entry.card,spec.destination)
  }));
  const eligible=windowEntries.filter(entry=>entry.selectable);
  const maxCount=Math.min(spec.amount,eligible.length);
  if(maxCount<=0) return [];
  if(!chooserIsLocal) return chooseBotLibraryEntries(deck,spec).slice(0,maxCount);

  state.pendingLibraryChoice={cardName,amount:spec.amount,maxCount,range:spec.range,rangeCount:spec.rangeCount,destination:spec.destination};
  render();
  return new Promise(resolve=>{
    showLibrarySearchModal({
      candidates:windowEntries,
      maxCount,
      cardName,
      filterLabel:libraryFilterCopy(spec.filter),
      destinationLabel:libraryDestinationCopy(spec.destination),
      allowFewer:spec.allowFewer,
      lookCount:spec.range==='top_n' ? spec.rangeCount : null
    }, chosenIndexes=>{
      state.pendingLibraryChoice=null;
      render();
      const byIndex=new Map(windowEntries.map(entry=>[entry.index,entry]));
      const unique=[...new Set((chosenIndexes||[]).map(Number))]
        .filter(Number.isInteger)
        .map(index=>byIndex.get(index))
        .filter(entry=>entry?.selectable)
        .slice(0,maxCount);
      resolve(unique);
    });
  });
}

async function buildOwnEtbAfterLibraryEntry(card,item,isLocal) {
  if(!card?.etbEffect) return null;
  let etbTarget=null;
  if(card.requiresTarget){
    etbTarget=await chooseResolvedEffectTarget({
      effect:card.etbEffect,sourceCard:card,sourceItem:item,cardName:`ETB de ${card.name}`,
      controllerIsLocal:isLocal,chooserIsLocal:isLocal
    });
  }
  if(!card.requiresTarget || etbTarget){
    return {effect:card.etbEffect,sourceCard:card,sourceItem:item,isLocal,targetObj:etbTarget,triggerType:'library_etb'};
  }
  logMsg(gameText('effect.etb.noLegalTarget',{card:card.name}));
  return null;
}

async function putLibraryCardsOntoBattlefield(cards, ownerIsLocal, tappedByInstruction=false) {
  const prepared=[];
  for(const card of cards||[]){
    if(!libraryCardCanMoveToDestination(card,'battlefield')) continue;
    stampCardOwner(card,ownerIsLocal,state.currentMatch?.myRole||null);
    const type=String(card.type||'');
    let item,kind;
    if(isLandPermanent(card)){
      item={card,tapped:landEntersTappedForBattlefield(card,ownerIsLocal,!!tappedByInstruction),enteredThisTurn:true,permanentTypes:['land']}; kind='land';
    } else if(card.power!==undefined || type.includes('Criatura')){
      item={card,tapped:!!tappedByInstruction,summoningSickness:true,isAttacking:false,blockingIndex:null,damageTaken:0,auras:[]};
      if(hasKeyword(item,'haste')) item.summoningSickness=false; kind='creature';
    } else if(type.includes('Planeswalker')){
      item={card,loyalty:Math.max(0,Number(card.loyalty)||0),abilityUsedThisTurn:false,tapped:!!tappedByInstruction}; kind='planeswalker';
    } else {
      item={card,tapped:!!tappedByInstruction,enteredThisTurn:true}; if(card.equipment) item.attachedTo=null; kind='support';
    }
    stampPermanentController(item,ownerIsLocal,state.currentMatch?.myRole||null);
    prepared.push({card,item,kind});
  }

  // Todos entran físicamente antes de detectar el primer ETB: una instrucción que pone
  // varias cartas en battlefield representa un único evento simultáneo de entrada.
  for(const entry of prepared){
    const zone=entry.kind==='land' ? (ownerIsLocal?state.localLands:state.rivalLands)
      : entry.kind==='creature' ? (ownerIsLocal?state.localCombat:state.rivalCombat)
      : entry.kind==='planeswalker' ? (ownerIsLocal?state.localPlaneswalkers:state.rivalPlaneswalkers)
      : (ownerIsLocal?state.localSupport:state.rivalSupport);
    zone.push(entry.item);
  }
  // Todos los ETB nacidos del mismo movimiento se agrupan antes de tocar la Stack.
  // Esto preserva simultaneidad + AP/NAP incluso si el lote mezcla Tierras, criaturas y Support/PW.
  const triggerEntries=[];
  const creatureEntries=prepared.filter(entry=>entry.kind==='creature').map(({card,item})=>({card,item}));
  const landEntries=prepared.filter(entry=>entry.kind==='land').map(({card,item})=>({card,item}));
  if(creatureEntries.length) triggerEntries.push(...collectCreatureEtbBatchEntries(ownerIsLocal,creatureEntries));
  if(landEntries.length) triggerEntries.push(...collectLandEtbBatchEntries(ownerIsLocal,landEntries));
  for(const entry of prepared.filter(entry=>entry.kind!=='creature' && entry.kind!=='land')){
    triggerEntries.push(...buildGenericEventTriggerEntries({type:'permanent_entered',controllerIsLocal:ownerIsLocal,actorIsLocal:ownerIsLocal,ownerIsLocal,card:entry.card,item:entry.item,zoneFrom:'library',zoneTo:'battlefield',cause:'library'}));
  }
  for(const entry of prepared){
    const own=await buildOwnEtbAfterLibraryEntry(entry.card,entry.item,ownerIsLocal);
    if(own) triggerEntries.push(own);
  }
  if(triggerEntries.length) queueTriggeredAbilities(triggerEntries);
  if(prepared.some(entry=>entry.card.staticEffect || entry.card.replacementEffect)){
    await runStateBasedActions({reason:'library_permanent_batch_entered'}); await waitForStateBasedActions();
  }
  return prepared.map(entry=>entry.item);
}

function placeCardsAtLibraryTop(deck,cardsTopFirst){ cardsTopFirst.slice().reverse().forEach(card=>deck.push(card)); }
function placeCardsAtLibraryBottom(deck,cardsTopFirst){ deck.unshift(...cardsTopFirst); }

function moveLibraryCardToPublicZone(card,ownerIsLocal,destination,sourceCardName,sourceIsLocal=ownerIsLocal){
  if(destination==='graveyard'){
    const plan=replacementCardZonePlan(card,ownerIsLocal,'library','graveyard','library_effect',{sourceCard:{name:sourceCardName},sourceIsLocal});
    plan.destination.push(card);
    if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:ownerIsLocal,actorIsLocal:ownerIsLocal,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'library',zoneTo:'exile',cause:'library_effect'});
    return plan.zoneTo;
  }
  if(destination==='exile'){
    (ownerIsLocal?state.localExile:state.rivalExile).push(card);
    dispatchGameEvent({type:'card_exiled',controllerIsLocal:ownerIsLocal,actorIsLocal:ownerIsLocal,ownerIsLocal,card,zoneFrom:'library',zoneTo:'exile',cause:'library_effect'});
    return 'exile';
  }
  return destination;
}

async function commitLibraryEntries({ownerIsLocal,sourceIsLocal=ownerIsLocal,entries,spec,cardName}){
  const deck=ownerIsLocal?state.localDeck:state.rivalDeck;
  const hand=ownerIsLocal?state.localHand:state.rivalHand;
  const window=getLibraryWindowEntries(deck,spec);
  const byIndex=new Map(window.map(e=>[e.index,e]));
  const selected=(entries||[]).map(original=>{ const current=byIndex.get(original?.index); return current && current.card===original.card ? current : null; }).filter(e=>e && libraryCardMatchesFilter(e.card,spec.filter) && libraryCardCanMoveToDestination(e.card,spec.destination));
  const selectedCards=[...new Set(selected.map(e=>e.card))].slice(0,spec.amount);
  const selectedSet=new Set(selectedCards);
  const remainderCards=spec.range==='top_n' ? window.map(e=>e.card).filter(c=>!selectedSet.has(c)) : [];

  // Retirar primero la ventana/selección completa para que índices y orden no se corrompan.
  if(spec.range==='top_n'){
    const n=Math.min(deck.length,Math.max(0,Number(spec.rangeCount)||0));
    deck.splice(deck.length-n,n);
  } else {
    [...selected].sort((a,b)=>b.index-a.index).forEach(e=>{ const idx=deck.indexOf(e.card); if(idx>=0) deck.splice(idx,1); });
  }

  // Una búsqueda de biblioteca baraja el resto antes de colocar un tutor a top/bottom.
  if(spec.shuffle) shuffleLibraryInPlace(deck);

  // Resolver primero el resto del look-at-N; luego las seleccionadas tienen precedencia
  // visual cuando ambas instrucciones usan top/bottom.
  if(remainderCards.length){
    if(spec.remainderDestination==='top' || spec.remainderDestination==='stay') placeCardsAtLibraryTop(deck,remainderCards);
    else if(spec.remainderDestination==='bottom') placeCardsAtLibraryBottom(deck,remainderCards);
    else if(spec.remainderDestination==='graveyard' || spec.remainderDestination==='exile') {
      remainderCards.forEach(c=>moveLibraryCardToPublicZone(c,ownerIsLocal,spec.remainderDestination,cardName,sourceIsLocal));
    }
  }

  const movedNames=selectedCards.map(card=>card.name);
  if(spec.destination==='top') placeCardsAtLibraryTop(deck,selectedCards);
  else if(spec.destination==='bottom') placeCardsAtLibraryBottom(deck,selectedCards);
  else if(spec.destination==='battlefield' || spec.destination==='battlefield_tapped') {
    await putLibraryCardsOntoBattlefield(selectedCards,ownerIsLocal,spec.destination==='battlefield_tapped');
  } else {
    for(const card of selectedCards){
      if(spec.destination==='hand') hand.push(card);
      else if(spec.destination==='graveyard' || spec.destination==='exile') moveLibraryCardToPublicZone(card,ownerIsLocal,spec.destination,cardName,sourceIsLocal);
    }
  }

  const identityPublic=spec.reveal || ['battlefield','battlefield_tapped','graveyard','exile'].includes(spec.destination);
  recordTelemetryEvent('library_effect_resolved',{
    source:cardName,effectType:spec.type,range:spec.range,rangeCount:spec.rangeCount,
    destination:spec.destination,remainderDestination:spec.remainderDestination,selectedCount:selectedCards.length,
    selectedNames:identityPublic?movedNames:[]
  });
  render();
  return {completed:true,selectedCount:selectedCards.length,movedNames:identityPublic?movedNames:[]};
}

export async function resolveLibraryEffect({isLocal=true,effect={},cardName='Efecto'}={}){
  const spec=normalizeLibraryEffect(effect);
  if(spec.amount<=0) return {completed:true,selectedCount:0,movedNames:[]};
  const ownerIsLocal=spec.owner==='opponent' ? !isLocal : isLocal;
  // 23.15.6 soporta que el DUEÑO de la biblioteca haga la elección. Efectos futuros donde
  // el controlador mira/elije en la biblioteca rival deben usar el protocolo privado 23.10
  // y se mantienen fail-closed hasta declarar explícitamente esa visibilidad.
  if(spec.chooser!=='owner') throw new Error('library_chooser_not_supported');
  if(isHiddenRivalZone(ownerIsLocal)){
    const ownerRole=otherRole(state.currentMatch.myRole);
    const response=await requestRivalDecision('self_library_action',ownerRole,{spec,cardName,sourceControllerRole:state.currentMatch?.myRole||null});
    return {completed:response?.completed!==false,selectedCount:Number(response?.selectedCount||0),movedNames:Array.isArray(response?.movedNames)?response.movedNames:[],reason:response?.reason||null};
  }
  const entries=await chooseLibraryEntries({ownerIsLocal,chooserIsLocal:ownerIsLocal,spec,cardName});
  return commitLibraryEntries({ownerIsLocal,sourceIsLocal:isLocal,entries,spec,cardName});
}

// BUGFIX (post-lanzamiento, Etapa 5 revisada): antes, un efecto que obligaba al RIVAL a
// descartar en multiplayer simplemente se salteaba entero — ni una carta se iba a ningún
// lado, con un aviso de "no se puede resolver". Esto era HONESTO (no fingía un resultado
// falso) pero dejaba el efecto de la carta completamente sin cumplir, algo peor que
// resolverlo bien. Reusa el mecanismo general de decisión remota: le pide al cliente REAL
// del rival que aplique el descarte sobre SU mano real — su cementerio real se entera del
// resultado por el sync normal de siempre (Graveyard es un campo público), así que del otro
// lado el nombre de la carta descartada aparece de verdad, no un placeholder.
export async function resolveForcedDiscardOnRival(amount, cardName) {
  // Compatibilidad con mensajes/tests viejos: este canal conserva la semántica RANDOM del
  // hotfix histórico. El descarte normal del Punto 8 usa `self_discard` y, por default, lo
  // ELIGE el jugador afectado.
  const rivalRole = otherRole(state.currentMatch.myRole);
  const response = await requestRivalDecision('forced_discard', rivalRole, { amount, cardName });
  return response.discardedNames || [];
}

// PUNTO 8 PRE-500 — DESCARTE ELEGIDO / SELF-DISCARD INTERACTIVO.
// Una sola infraestructura decide y MUEVE cartas desde una mano a su cementerio. El default
// de `discard` pasa a ser la regla natural del juego: el JUGADOR AFECTADO elige qué descarta.
// Para cartas futuras que digan expresamente "al azar", el JSON puede usar
//   { "type":"discard", "amount":1, "selection":"random" }.
//
// En multiplayer la mano rival sigue siendo privada: este cliente nunca ve sus cartas; le
// manda `self_discard` al dueño real, que hace la elección sobre SU mano y sólo devuelve los
// nombres ya públicos por haber ido al cementerio.
let discardChoiceChain = Promise.resolve();

function chooseRandomDiscardEntries(entries, count) {
  const pool = [...entries];
  const chosen = [];
  while (chosen.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

function chooseBotDiscardEntries(entries, count) {
  if (state.botDifficulty === 'easy') return chooseRandomDiscardEntries(entries, count);

  // En Difícil el Tano intenta perder las cartas menos valiosas. Es deliberadamente simple:
  // tierras sobrantes primero; después CMC bajo. No pretende "leer" sinergias del mazo.
  const landsInPlay = state.rivalLands.length;
  const score = entry => {
    const card = entry.card || {};
    const isLand = !!(card.type && card.type.includes('Tierra'));
    if (isLand && landsInPlay >= 4) return -10;
    const body = card.power !== undefined ? (Number(card.power || 0) + Number(card.toughness || 0)) * 0.15 : 0;
    return Number(card.cmc || 0) + body;
  };
  return [...entries].sort((a, b) => score(a) - score(b) || a.index - b.index).slice(0, count);
}

async function discardCardsFromHandNow(options) {
  options = options || {};
  const victimIsLocal = options.victimIsLocal !== false;
  const parsedAmount = Number(options.amount ?? 1);
  const amount = Number.isFinite(parsedAmount) ? Math.max(0, Math.floor(parsedAmount)) : 1;
  const selection = options.selection === 'random' ? 'random' : 'choice';
  const cardName = options.cardName || 'Efecto';
  const reason = options.reason || 'effect';
  const requireExact = !!options.requireExact;
  const excludeCard = options.excludeCard || null;

  if (amount <= 0) return { completed: true, discardedCards: [], discardedNames: [] };

  // Mano rival oculta en multiplayer: la elección/movimiento ocurre enteramente del otro lado.
  if (state.currentMatch && !victimIsLocal) {
    const response = await requestRivalDecision('self_discard', otherRole(state.currentMatch.myRole), {
      amount, selection, cardName, reason, requireExact
    });
    return {
      completed: response.completed !== false,
      discardedCards: [],
      discardedNames: response.discardedNames || []
    };
  }

  const hand = victimIsLocal ? state.localHand : state.rivalHand;
  const graveyard = victimIsLocal ? state.localGraveyard : state.rivalGraveyard;
  const entries = hand
    .map((card, index) => ({ card, index }))
    .filter(entry => entry.card && entry.card !== excludeCard);

  if (requireExact && entries.length < amount) {
    return { completed: false, discardedCards: [], discardedNames: [] };
  }

  const count = Math.min(amount, entries.length);
  if (count <= 0) return { completed: !requireExact, discardedCards: [], discardedNames: [] };

  let chosenEntries;
  if (selection === 'random') {
    chosenEntries = chooseRandomDiscardEntries(entries, count);
  } else if (victimIsLocal) {
    state.pendingDiscardChoice = { cardName, amount: count, reason, selection };
    render();
    try {
      const snapshot = entries.map(entry => entry.card);
      const actionLabel = reason === 'additional_cost'
        ? `Costo adicional: elegí ${count} carta${count > 1 ? 's' : ''} para descartar`
        : `Elegí ${count} carta${count > 1 ? 's' : ''} para descartar`;
      const selectedSnapshotIndexes = await new Promise(resolve =>
        showHandDiscardChoiceModal(snapshot, count, cardName, actionLabel, resolve)
      );
      chosenEntries = [...new Set(selectedSnapshotIndexes)]
        .filter(i => Number.isInteger(i) && i >= 0 && i < entries.length)
        .map(i => entries[i])
        .slice(0, count);
    } finally {
      state.pendingDiscardChoice = null;
      render();
    }
  } else {
    chosenEntries = chooseBotDiscardEntries(entries, count);
  }

  // Defensa de costo: el modal normal sólo habilita Confirmar cuando hay exactamente N,
  // pero si algún callback externo/malformado devolviera menos slots NO consumimos una parte
  // de un costo obligatorio. Un efecto normal sí puede descartar hasta lo disponible.
  if (requireExact && chosenEntries.length !== amount) {
    return { completed: false, discardedCards: [], discardedNames: [] };
  }

  // Los slots elegidos pertenecen al snapshot original: sacamos de mayor a menor para no
  // desplazar índices. Volvemos a ordenar al final sólo para que logs/tests sean estables.
  const removed = [];
  [...chosenEntries]
    .sort((a, b) => b.index - a.index)
    .forEach(entry => {
      const currentIndex = hand.indexOf(entry.card);
      if (currentIndex === -1 || entry.card === excludeCard) return;
      const card = hand.splice(currentIndex, 1)[0];
      removed.push({ card, originalIndex: entry.index });
    });
  // El splice debe ir de mayor a menor, pero el Cementerio recibe las cartas en el orden
  // estable de los slots originales. Así un descarte múltiple no invierte accidentalmente
  // el array y las mecánicas que miran "lo más reciente" conservan un orden determinista.
  removed.sort((a, b) => a.originalIndex - b.originalIndex);
  const discardedCards = removed.map(entry => entry.card);
  for (const discardedCard of discardedCards) {
    const plan=replacementCardZonePlan(discardedCard,victimIsLocal,'hand','graveyard',reason);
    plan.destination.push(discardedCard);
    dispatchGameEvent({
      type:'card_discarded', controllerIsLocal:victimIsLocal, actorIsLocal:victimIsLocal,
      ownerIsLocal:plan.ownerIsLocal, card:discardedCard, zoneFrom:'hand', zoneTo:plan.zoneTo, cause:reason
    });
    if(plan.zoneTo==='exile') dispatchGameEvent({
      type:'card_exiled',controllerIsLocal:victimIsLocal,actorIsLocal:victimIsLocal,ownerIsLocal:plan.ownerIsLocal,
      card:discardedCard,zoneFrom:'hand',zoneTo:'exile',cause:reason
    });
  }
  return { completed: !requireExact || discardedCards.length === amount, discardedCards, discardedNames: discardedCards.map(c => c.name) };
}

export function discardCardsFromHand(options) {
  state.resolvingDiscardEffects = (state.resolvingDiscardEffects || 0) + 1;
  render();
  const run = discardChoiceChain.then(() => discardCardsFromHandNow(options), () => discardCardsFromHandNow(options));
  discardChoiceChain = run.catch(() => {});
  return run.finally(() => {
    state.resolvingDiscardEffects = Math.max(0, (state.resolvingDiscardEffects || 1) - 1);
    if (state.resolvingDiscardEffects === 0) render();
  });
}

// 23.15.7 — contraparte síncrona para Tano. En Solo la mano rival es real y local al
// proceso, así que no necesita modal ni canal remoto. Se usa exclusivamente como COSTO
// activado y conserva replacements + eventos igual que el helper humano.
export function payBotActivatedDiscardCost(amount = 1, cardName = 'Habilidad') {
  const count=Math.max(0,Math.floor(Number(amount)||0));
  if(count===0) return true;
  const entries=state.rivalHand.map((card,index)=>({card,index})).filter(e=>e.card);
  if(entries.length<count) return false;
  const chosen=chooseBotDiscardEntries(entries,count).sort((a,b)=>b.index-a.index);
  const removed=[];
  for(const entry of chosen){
    const idx=state.rivalHand.indexOf(entry.card); if(idx===-1) return false;
    removed.push({card:state.rivalHand.splice(idx,1)[0],index:entry.index});
  }
  removed.sort((a,b)=>a.index-b.index);
  for(const {card} of removed){
    const plan=replacementCardZonePlan(card,false,'hand','graveyard','activated_cost');
    plan.destination.push(card);
    dispatchGameEvent({type:'card_discarded',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'hand',zoneTo:plan.zoneTo,cause:'activated_cost'}, {forceDeferNormalTriggers:true});
    if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'hand',zoneTo:'exile',cause:'activated_cost'}, {forceDeferNormalTriggers:true});
  }
  logMsg(gameText('ability.additionalDiscard.botPaid',{card:cardName,count:removed.length}));
  return removed.length===count;
}

// Punto 8: frontera reutilizable para rutas históricas de triggers directos que no esperan
// el Promise devuelto por resolveEffectDirect(). El contador se incrementa SINCRÓNICAMENTE
// al encolar el descarte, así que esperar acá garantiza que no se entregue prioridad ni se
// avance una fase mientras el jugador todavía está eligiendo cartas de su mano.
export async function waitForDiscardEffects() {
  while (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) {
    await sleep(20);
  }
}

// PUNTO 14 — COSTOS COMPUESTOS DE CASTEO.
// `alternativeCost` reemplaza SOLO el costo base de maná. Kicker y `additionalCost` siguen
// sumándose. Los componentes no-maná se PREPARAN todos antes de mover una sola carta/permanente:
// si falta algún recurso, no se cobra vida, no se descarta, no se sacrifica ni se exilia nada.
export function getCastCompositeCostBundle(card, useAlternative = false) {
  const alternative = useAlternative ? normalizeCompositeCost(card?.alternativeCost) : null;
  const additional = normalizeCompositeCost(card?.additionalCost);
  return {
    alternative,
    additional,
    life: (alternative?.life || 0) + (additional?.life || 0),
    discards: [alternative?.discard, additional?.discard].filter(c => c && c.amount > 0),
    sacrifices: [alternative?.sacrifice, additional?.sacrifice].filter(c => c && c.amount > 0),
    graveyardExiles: [alternative?.exileFromGraveyard, additional?.exileFromGraveyard].filter(c => c && c.amount > 0)
  };
}

export function getCastingManaCostString(card, options = {}) {
  const useAlternative = !!options.useAlternative;
  const kicked = !!options.kicked;
  const baseOverride = options.baseOverride ?? null;
  const alt = useAlternative ? normalizeCompositeCost(card?.alternativeCost) : null;
  const add = normalizeCompositeCost(card?.additionalCost);
  const base = useAlternative ? (alt?.manaCost || null) : (baseOverride ?? card?.manaCost ?? null);
  const kicker = kicked ? card?.kicker?.cost : null;
  return combineManaCostStrings(base, kicker, add?.manaCost || null);
}


// 23.15.4 — CR 601.2f. El string anterior describe base/alternativa + Kicker + adicionales;
// esta función convierte esa ruta en el coste FINAL bloqueable, incluyendo X y todos los
// aumentos/reducciones/floors activos del battlefield. Es la única frontera que humano/Tano
// deben consultar antes de decidir cómo pagarlo.
export function getFinalCastingManaCost(card, options = {}) {
  const manaString = getCastingManaCostString(card, options);
  const baseCost = parseManaCost(manaString);
  if (manaString?.includes('{X}')) baseCost.generic += Math.max(0, Math.floor(Number(options.xValue) || 0));
  const casterIsLocal = options.isLocal !== false;
  const result = applySpellCostModifiers(state, card, casterIsLocal, baseCost, options);
  return { ...result, manaString, baseCost };
}

function canAssignDistinctResources(resources, requirements, matches) {
  if (requirements.length === 0) return true;
  if (resources.length < requirements.length) return false;
  const ordered = requirements
    .map((req, idx) => ({ req, idx, options: resources.map((r, i) => matches(r, req) ? i : -1).filter(i => i >= 0) }))
    .sort((a, b) => a.options.length - b.options.length);
  if (ordered.some(x => x.options.length === 0)) return false;
  const used = new Set();
  const walk = pos => {
    if (pos >= ordered.length) return true;
    for (const i of ordered[pos].options) {
      if (used.has(i)) continue;
      used.add(i);
      if (walk(pos + 1)) return true;
      used.delete(i);
    }
    return false;
  };
  return walk(0);
}

function expandCostRequirements(specs) {
  return specs.flatMap(spec => Array.from({ length: Math.max(0, spec.amount || 0) }, () => spec));
}

export function canPayCastCompositeNonManaCosts(card, isLocal, useAlternative = false, options = {}) {
  const bundle = getCastCompositeCostBundle(card, useAlternative);
  const hp = isLocal ? state.localHP : state.rivalHP;
  const lifeFloor = Math.max(0, Number(options.lifeFloor) || 0);
  if (bundle.life > 0 && hp - bundle.life < lifeFloor) return false;

  const hand = isLocal ? state.localHand : state.rivalHand;
  const excludeCard = options.excludeCard || null;
  const handResources = hand.filter(c => c && c !== excludeCard);
  const discardReqs = expandCostRequirements(bundle.discards);
  if (!canAssignDistinctResources(handResources, discardReqs, (c, req) => cardMatchesDiscardCost(c, req))) return false;

  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const battlefield = [...combat, ...support, ...lands];
  const sacrificeReqs = expandCostRequirements(bundle.sacrifices);
  if (!canAssignDistinctResources(battlefield, sacrificeReqs, (item, req) => {
    const t = req.target === 'own_artifact' ? 'artifact' : req.target === 'own_creature' ? 'creature' : req.target === 'own_land' ? 'land' : null;
    return !!t && isSacrificeCandidate(item, t);
  })) return false;

  const graveyard = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const graveReqs = expandCostRequirements(bundle.graveyardExiles);
  if (!canAssignDistinctResources(graveyard, graveReqs, (c, req) => cardMatchesGraveyardFilter(c, req.filter || 'any'))) return false;
  return true;
}

function chooseHandCardsForCompositeCost(isLocal, spec, card, excludeCards = []) {
  const hand = isLocal ? state.localHand : state.rivalHand;
  const excluded = new Set(excludeCards.filter(Boolean));
  const entries = hand.map((c, index) => ({ card: c, index }))
    .filter(e => !excluded.has(e.card) && cardMatchesDiscardCost(e.card, spec));
  const count = Math.max(0, spec.amount || 0);
  if (entries.length < count) return Promise.resolve(null);
  if (count === 0) return Promise.resolve([]);
  if (entries.length === count) return Promise.resolve(entries.map(e => e.card));

  if (!isLocal) {
    const chosen = spec.selection === 'random'
      ? chooseRandomDiscardEntries(entries, count)
      : chooseBotDiscardEntries(entries, count);
    return Promise.resolve(chosen.map(e => e.card));
  }

  if (spec.selection === 'random') {
    return Promise.resolve(chooseRandomDiscardEntries(entries, count).map(e => e.card));
  }

  const snapshot = entries.map(e => e.card);
  const colorNames = { W:'blanca', U:'azul', B:'negra', R:'roja', G:'verde' };
  const colorText = spec.color ? ` ${colorNames[spec.color] || spec.color}` : '';
  state.pendingDiscardChoice = { cardName: card.name, amount: count, reason: 'cast_cost', selection: 'choice' };
  render();
  return new Promise(resolve => {
    showHandDiscardChoiceModal(snapshot, count, card.name,
      `Costo de ${card.name}: elegí ${count} carta${count > 1 ? 's' : ''}${colorText} para descartar`, indexes => {
        state.pendingDiscardChoice = null;
        render();
        const chosen = [...new Set(indexes)]
          .filter(i => Number.isInteger(i) && i >= 0 && i < snapshot.length)
          .map(i => snapshot[i])
          .slice(0, count);
        resolve(chosen.length === count ? chosen : null);
      });
  });
}

function chooseSacrificeItemsForCompositeCost(isLocal, spec, card, excludeItems = []) {
  const permanentType = spec.target === 'own_artifact' ? 'artifact' : spec.target === 'own_creature' ? 'creature' : spec.target === 'own_land' ? 'land' : null;
  if (!permanentType) return Promise.resolve(null);
  const excluded = new Set(excludeItems.filter(Boolean));
  const candidates = getSacrificeEffectCandidates(isLocal, permanentType).filter(item => !excluded.has(item));
  const count = Math.max(0, spec.amount || 0);
  if (candidates.length < count) return Promise.resolve(null);
  if (count === 0) return Promise.resolve([]);
  if (candidates.length === count) return Promise.resolve([...candidates]);

  if (!isLocal) {
    const value = item => Number(item.card?.cmc || 0) + Number(item.card?.power || 0) * .2 + Number(item.card?.toughness || 0) * .2;
    return Promise.resolve([...candidates].sort((a,b) => value(a)-value(b)).slice(0,count));
  }

  state.pendingSacrificeEffectChoice = { permanentType, amount: count, cardName: card.name, reason: 'cast_cost' };
  render();
  return new Promise(resolve => {
    showSacrificeEffectModal(candidates, count, card.name, permanentType, chosen => {
      state.pendingSacrificeEffectChoice = null;
      render();
      const valid = (chosen || []).filter(item => candidates.includes(item)).slice(0, count);
      resolve(valid.length === count ? valid : null);
    });
  });
}

function chooseGraveyardCardsForCompositeCost(isLocal, spec, card, excludeCards = []) {
  const excluded = new Set(excludeCards.filter(Boolean));
  const candidates = getGraveyardChoiceCandidates(isLocal, spec.filter || 'any').filter(e => !excluded.has(e.card));
  const count = Math.max(0, spec.amount || 0);
  if (candidates.length < count) return Promise.resolve(null);
  if (count === 0) return Promise.resolve([]);
  if (candidates.length === count) return Promise.resolve(candidates.map(e => e.card));
  if (!isLocal) return Promise.resolve(chooseBotGraveyardEntries(candidates, count, 'lowest_value').map(e => e.card));

  state.pendingGraveyardChoice = { zoneIsLocal:true, filter:spec.filter || 'any', amount:count, cardName:card.name, reason:'cast_cost' };
  render();
  return new Promise(resolve => {
    showGraveyardChoiceModal(candidates, count, card.name, graveyardFilterLabel(spec.filter || 'any'),
      `Costo de ${card.name}: elegí ${count} carta${count > 1 ? 's' : ''} para exiliar`, chosenIndexes => {
        state.pendingGraveyardChoice = null;
        render();
        const graveyard = state.localGraveyard;
        const chosen = [...new Set(chosenIndexes)]
          .map(i => graveyard[i])
          .filter(c => c && !excluded.has(c) && cardMatchesGraveyardFilter(c, spec.filter || 'any'))
          .slice(0, count);
        resolve(chosen.length === count ? chosen : null);
      });
  });
}

async function prepareCastCompositeNonManaCosts(card, isLocal, useAlternative) {
  const bundle = getCastCompositeCostBundle(card, useAlternative);
  if (!canPayCastCompositeNonManaCosts(card, isLocal, useAlternative, { excludeCard: isLocal ? card : null })) return null;

  const selectedDiscards = [];
  for (const spec of bundle.discards) {
    const chosen = await chooseHandCardsForCompositeCost(isLocal, spec, card, [isLocal ? card : null, ...selectedDiscards]);
    if (!chosen) return null;
    selectedDiscards.push(...chosen);
  }

  const selectedSacrifices = [];
  for (const spec of bundle.sacrifices) {
    const chosen = await chooseSacrificeItemsForCompositeCost(isLocal, spec, card, selectedSacrifices);
    if (!chosen) return null;
    selectedSacrifices.push(...chosen);
  }

  const selectedGraveyard = [];
  for (const spec of bundle.graveyardExiles) {
    const chosen = await chooseGraveyardCardsForCompositeCost(isLocal, spec, card, selectedGraveyard);
    if (!chosen) return null;
    selectedGraveyard.push(...chosen);
  }

  // Revalidación final: ninguna decisión previa movió recursos todavía. La vida puede haber
  // cambiado por otra consecuencia síncrona, así que se vuelve a comprobar justo antes del commit.
  const hp = isLocal ? state.localHP : state.rivalHP;
  if (hp < bundle.life) return null;
  return { bundle, selectedDiscards, selectedSacrifices, selectedGraveyard };
}

function commitCastCompositeNonManaCosts(card, isLocal, prepared, useAlternative) {
  if (!prepared) return false;
  const { bundle, selectedDiscards, selectedSacrifices, selectedGraveyard } = prepared;
  const hand = isLocal ? state.localHand : state.rivalHand;
  const grave = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const exile = isLocal ? state.localExile : state.rivalExile;

  // Revalidamos referencias antes de mutar: costo atómico o nada.
  if (selectedDiscards.some(c => !hand.includes(c) || (isLocal && c === card))) return false;
  const allBattlefield = isLocal ? [...state.localCombat, ...state.localSupport, ...state.localLands] : [...state.rivalCombat, ...state.rivalSupport, ...state.rivalLands];
  if (selectedSacrifices.some(item => !allBattlefield.includes(item))) return false;
  if (selectedGraveyard.some(c => !grave.includes(c))) return false;
  const hp = isLocal ? state.localHP : state.rivalHP;
  if (hp < bundle.life) return false;

  if (bundle.life > 0) {
    if (isLocal) state.localHP -= bundle.life; else state.rivalHP -= bundle.life;
    dispatchGameEvent({type:'life_lost',controllerIsLocal:isLocal,actorIsLocal:isLocal,targetPlayerIsLocal:isLocal,amount:bundle.life,cause:'cost'});
  }

  if (selectedDiscards.length) {
    const entries = selectedDiscards.map(c => ({ card:c, index:hand.indexOf(c) })).sort((a,b) => b.index-a.index);
    const removed = [];
    entries.forEach(e => { if (e.index >= 0) removed.push({ card:hand.splice(e.index,1)[0], index:e.index }); });
    removed.sort((a,b) => a.index-b.index);
    removed.forEach(({card:discardedCard}) => {
      const plan=replacementCardZonePlan(discardedCard,isLocal,'hand','graveyard','cost');
      plan.destination.push(discardedCard);
      dispatchGameEvent({
        type:'card_discarded',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:plan.ownerIsLocal,
        card:discardedCard,zoneFrom:'hand',zoneTo:plan.zoneTo,cause:'cost'
      },{forceDeferNormalTriggers:true});
      if(plan.zoneTo==='exile') dispatchGameEvent({
        type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:plan.ownerIsLocal,
        card:discardedCard,zoneFrom:'hand',zoneTo:'exile',cause:'cost'
      },{forceDeferNormalTriggers:true});
    });
  }

  // Exilio antes que sacrificio: performSacrificeBatch puede disparar triggers de muerte
  // inmediatamente en la arquitectura actual. Todos los demás componentes deben estar ya
  // comprometidos antes de que esos triggers tengan oportunidad de resolver.
  if (selectedGraveyard.length) {
    selectedGraveyard.forEach(c => {
      const idx = grave.indexOf(c);
      if (idx !== -1) grave.splice(idx,1);
    });
    exile.push(...selectedGraveyard);
    selectedGraveyard.forEach(exiledCard => dispatchGameEvent({
      type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,
      card:exiledCard,zoneFrom:'graveyard',zoneTo:'exile',cause:'cost'
    }));
  }

  if (selectedSacrifices.length) performSacrificeBatch(selectedSacrifices, isLocal);

  if (bundle.life > 0 || selectedDiscards.length || selectedSacrifices.length || selectedGraveyard.length) {
    if (isLocal) state.pendingSpellCostsIrreversible = true;
    const paid = [];
    if (bundle.life) paid.push(`${bundle.life} de vida`);
    if (selectedDiscards.length) paid.push(`descartó ${selectedDiscards.map(c=>c.name).join(', ')}`);
    if (selectedSacrifices.length) paid.push(`sacrificó ${selectedSacrifices.map(i=>i.card.name).join(', ')}`);
    if (selectedGraveyard.length) paid.push(`exilió ${selectedGraveyard.map(c=>c.name).join(', ')} del cementerio`);
    logMsg(gameText('cost.composite.paid', { card: card.name, route: useAlternative ? 'costo alternativo' : 'costo adicional', details: paid.join('; ') }));
  }
  return true;
}

export async function payCastCompositeNonManaCosts(card, isLocal, useAlternative = false) {
  const prepared = await prepareCastCompositeNonManaCosts(card, isLocal, useAlternative);
  if (!prepared || !commitCastCompositeNonManaCosts(card, isLocal, prepared, useAlternative)) {
    throw new Error(`No se pudo pagar completamente el costo ${useAlternative ? 'alternativo' : 'adicional'} de ${card.name}.`);
  }
  return prepared;
}

// Punto 5: selección humana local para una decisión de sacrificio. Devuelve exactamente
// los permanentes elegidos (o todos los disponibles si hay menos que la cantidad pedida).
function chooseLocalSacrificeForEffect(permanentType, amount, cardName) {
  const candidates = getSacrificeEffectCandidates(true, permanentType);
  const count = Math.min(Math.max(0, amount || 1), candidates.length);
  if (count === 0) return Promise.resolve([]);

  state.pendingSacrificeEffectChoice = { permanentType, amount: count, cardName };
  render();
  return new Promise(resolve => {
    showSacrificeEffectModal(candidates, count, cardName, permanentType, chosen => {
      state.pendingSacrificeEffectChoice = null;
      const removed = performSacrificeBatch(chosen, true);
      render();
      resolve(removed);
    });
  });
}

// Se llama en la pantalla del RIVAL cuando les llega una pregunta para ellos — despacha
// según el tipo. El patrón (aplicar/mostrar lo que corresponda, y al final llamar a
// respondToDecision) es el mismo para cualquier tipo nuevo.
function handleIncomingDecisionRequest(decision) {
  if (decision.type === 'legend_choice') {
    state.respondingToDecision = true;
    (async()=>{
      try {
        const all=[...state.localCombat,...state.localSupport,...state.localLands,...state.localPlaneswalkers];
        const candidates=all.filter(item=>item?.card?.name===decision.cardName);
        const entries=candidates.map(item=>{ const loc=findBattlefieldItemLocation(item); return {item,card:item.card,zone:loc?.zoneName||'combat',index:loc?.index??-1,isLocal:true}; });
        const chosen=entries.length>1 ? await showLegendRuleChoiceModal(entries,decision.cardName) : entries[0];
        const responseIndex=Math.max(0,entries.indexOf(chosen));
        state.respondingToDecision=false; render();
        respondToDecision(decision.requestId,{completed:true,index:responseIndex,syncObjectId:chosen?.item?._syncObjectId||null});
      }catch(err){ state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{completed:false,index:0}); }
    })();
  } else if (decision.type === 'trigger_order') {
    state.respondingToDecision=true;
    (async()=>{
      const entries=(decision.entries||[]).map((entry,index)=>({
        _remoteIndex:Number(entry.id ?? index), isLocal:true,
        sourceCard:{name:entry.sourceName||'Habilidad'}, triggerType:entry.triggerLabel||'trigger', effect:{type:'noop'}
      }));
      try{
        const ordered=entries.length>1 ? await showTriggerOrderModal(entries) : entries;
        state.respondingToDecision=false; render();
        respondToDecision(decision.requestId,{completed:true,order:ordered.map(e=>e._remoteIndex)});
      }catch(err){ state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{completed:false,order:entries.map(e=>e._remoteIndex)}); }
    })();
  } else if (decision.type === 'private_zone_offer') {
    state.respondingToDecision = true;
    render();
    (async () => {
      try {
        const zone = decision.zone === 'deck' ? 'deck' : 'hand';
        const filter = PRIVATE_ZONE_FILTERS.includes(decision.filter) ? decision.filter : 'any';
        const cards = getPrivateZoneCardsForOffer(zone, decision.range || 'all', decision.rangeCount, true);
        const eligibleCards = cards.filter(card => privateZoneCardMatchesFilter(card, filter));
        const amount = Math.max(0, Math.floor(Number(decision.amount || 0)));
        const built = buildPrivateZoneOffer({
          requestId: decision.requestId,
          ownerRole: state.currentMatch?.myRole || 'local',
          chooserRole: decision.chooserRole || otherRole(state.currentMatch?.myRole),
          zone,
          cards,
          eligibleCards,
          visibility: decision.visibility || PRIVATE_ZONE_VISIBILITY.OPAQUE,
          amount,
          operation: decision.operation || 'move',
          range: decision.range || 'all',
          filter
        });
        privateZoneOfferMemory.set(decision.requestId, {
          offer: built.offer,
          tokenMap: built.tokenMap,
          destination: decision.destination || (zone === 'hand' ? 'graveyard' : 'exile'),
          cardName: decision.cardName || 'Efecto'
        });
        await publishPrivateSelectionOffer(state.currentMatch.matchId, decision.requestId, built.offer);
        recordTelemetryDecision('private_zone_offer_published', {
          requestId: decision.requestId, zone, visibility: built.offer.visibility,
          candidateCount: built.offer.candidateCount, amount: built.offer.amount, filter
        });
        state.respondingToDecision = false;
        render();
        respondToDecision(decision.requestId, { completed:true, offerId:decision.requestId, candidateCount:built.offer.candidateCount });
      } catch (err) {
        console.error('Error creando oferta privada:', err);
        privateZoneOfferMemory.delete(decision.requestId);
        state.respondingToDecision = false;
        render();
        respondToDecision(decision.requestId, { completed:false, reason:'offer_exception' });
      }
    })();
  } else if (decision.type === 'private_zone_commit') {
    state.respondingToDecision = true;
    render();
    (async () => {
      const memory = privateZoneOfferMemory.get(decision.offerId);
      try {
        if (!memory) throw new Error('stale_offer');
        const selected = resolvePrivateZoneSelection(memory.tokenMap, memory.offer, decision.selectedTokens || []);
        if (!selected.ok) throw new Error(selected.reason || 'invalid_selection');
        const destination = decision.destination || memory.destination;
        const moved = moveSelectedPrivateCards(selected.cards, { zone:memory.offer.zone, ownerIsLocal:true, destination });
        if (moved.length !== memory.offer.amount) throw new Error('zone_changed_before_commit');
        privateZoneOfferMemory.delete(decision.offerId);
        try { await deletePrivateSelectionOffer(state.currentMatch.matchId, decision.offerId); } catch (_) {}
        state.respondingToDecision = false;
        render();
        const publicNames = ['graveyard','exile'].includes(destination) ? moved.map(c=>c.name) : [];
        recordTelemetryDecision('private_zone_commit', {
          requestId: decision.offerId, zone:memory.offer.zone, destination,
          selectedCount:moved.length, identitiesBecamePublic:publicNames.length
        });
        respondToDecision(decision.requestId, { completed:true, selectedCount:moved.length, movedNames:publicNames });
      } catch (err) {
        console.error('Error confirmando selección privada:', err);
        privateZoneOfferMemory.delete(decision.offerId);
        try { if (state.currentMatch) await deletePrivateSelectionOffer(state.currentMatch.matchId, decision.offerId); } catch (_) {}
        state.respondingToDecision = false;
        render();
        respondToDecision(decision.requestId, { completed:false, selectedCount:0, movedNames:[], reason:String(err?.message || err) });
      }
    })();
  } else if (decision.type === 'typal_choose_creature_type') {
    state.respondingToDecision=true; render();
    showCreatureTypeChoiceModal(decision.options||[],{title:decision.title||'Elegí un tipo de criatura',cardName:decision.cardName||''},chosen=>{
      const all=[...(state.localCombat||[]),...(state.localSupport||[]),...(state.localLands||[]),...(state.localPlaneswalkers||[])];
      const source=decision.sourceSyncObjectId ? all.find(x=>x?._syncObjectId===decision.sourceSyncObjectId) : null;
      if(source) setChosenCreatureType(source,chosen);
      state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{chosenType:chosen});
    },()=>{state.respondingToDecision=false;render();respondToDecision(decision.requestId,{chosenType:null});});
  } else if (decision.type === 'counter_unless_pay') {
    state.respondingToDecision = true;
    // ETAPA MOTOR 3: actualizar la UI ANTES de abrir el modal. El listener hizo render()
    // cuando todavía era false; sin este render el botón/atajo de Pasar Prioridad podía
    // quedar visualmente habilitado durante una decisión remota aunque canPlayCard ya la
    // considerara bloqueante.
    render();
    showCounterTaxDecisionModal(decision.amount, decision.targetCardName,
      () => {
        // "Pagar": tryAutoPayCounterTax(true, ...) — el `true` es correcto ACÁ porque esto
        // corre en la pantalla de quien está respondiendo, así que "sus propias tierras"
        // siempre son state.localLands para ellos mismos, sin importar qué rol tengan.
        state.respondingToDecision = false;
        const paid = tryAutoPayCounterTax(true, decision.amount);
        respondToDecision(decision.requestId, { paid });
      },
      () => {
        state.respondingToDecision = false;
        respondToDecision(decision.requestId, { paid: false });
      }
    );
  } else if (decision.type === 'self_card_filter') {
    // Punto 4: una carta del rival necesita Loot/Rummage sobre SU PROPIA mano/mazo.
    // Esas zonas son privadas, así que el cliente dueño ejecuta el efecto completo sobre
    // sus datos reales y sólo confirma al solicitante cuando terminó. Si es Loot/Rummage
    // humano, resolveGameEffect abre acá mismo el modal local de selección.
    state.respondingToDecision = true;
    render();
    resolveGameEffect({ type: decision.filterType, amount: decision.amount }, {
      sourceCard: { name: decision.cardName || 'Efecto rival', colors: [] },
      cardName: decision.cardName || 'Efecto rival',
      isLocal: true,
      targetObj: null
    }).then(() => {
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, { completed: true });
    }).catch(err => {
      console.error('Error resolviendo Loot/Rummage remoto:', err);
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, { completed: false });
    });
  } else if (decision.type === 'self_sacrifice') {
    // Punto 5: el dueño REAL de los permanentes hace su propia elección. En multiplayer
    // nunca elegimos por el rival desde placeholders/copia pública: su cliente abre el modal
    // sobre su battlefield local y recién después confirma los nombres sacrificados.
    state.respondingToDecision = true;
    render();
    chooseLocalSacrificeForEffect(decision.permanentType, decision.amount, decision.cardName || 'Efecto rival')
      .then(removed => {
        state.respondingToDecision = false;
        respondToDecision(decision.requestId, {
          completed: true,
          sacrificedNames: removed.map(item => item.card.name)
        });
      })
      .catch(err => {
        console.error('Error resolviendo sacrificio remoto:', err);
        state.pendingSacrificeEffectChoice = null;
        state.respondingToDecision = false;
        respondToDecision(decision.requestId, { completed: false, sacrificedNames: [] });
      });
  } else if (decision.type === 'move_public_card_to_private_hand') {
    // ENTREGA 23.7 — una carta pública del campo del dueño tiene que entrar en SU mano
    // privada. El cliente que lanzó el bounce jamás escribe la carta real en `rivalHand`:
    // pide esta operación al dueño, que valida el permanente por syncObjectId, lo mueve en
    // su estado real y publica sólo el nuevo handCount + el battlefield público.
    state.respondingToDecision = true;
    render();
    try {
      const target = deserializeStackTarget(decision.target, state, state.currentMatch?.myRole);
      const targetItem = target?.item || null;
      const loc = targetItem ? findBattlefieldItemLocation(targetItem) : null;
      const ownerIsLocal = targetItem ? cardOwnerIsLocal(targetItem.card, loc?.isLocal ?? true, state.currentMatch?.myRole || null) : false;
      if (!loc || target?.type !== 'creature' || !ownerIsLocal || targetItem?._syncTombstone) {
        state.respondingToDecision = false;
        render();
        respondToDecision(decision.requestId, {
          completed: false,
          reason: 'target_not_found',
          cardName: decision.cardName || decision.target?.cardName || null
        });
        return;
      }

      loc.zone.splice(loc.index, 1);
      repairCombatLinksAfterControllerMove({ fromIsLocal: loc.isLocal, fromIndex: loc.index, zoneName: loc.zoneName });
      detachEquipmentFrom(targetItem, loc.isLocal);
      sendAurasToGraveyard(targetItem, loc.isLocal);
      cleanupIfVehicle(targetItem);
      const movedCard = targetItem.card;
      if (!movedCard?.isToken) state.localHand.push(movedCard);

      state.respondingToDecision = false;
      // Este render publica PRIMERO el movimiento real del dueño. La cola de publish es
      // serial, así que el ACK de `respondToDecision` no puede adelantar este cambio.
      render();
      respondToDecision(decision.requestId, {
        completed: true,
        cardName: movedCard?.name || decision.cardName || null,
        tokenCeasedToExist: !!movedCard?.isToken
      });
    } catch (err) {
      console.error('Error moviendo permanente remoto a mano privada:', err);
      state.respondingToDecision = false;
      render();
      respondToDecision(decision.requestId, { completed: false, reason: 'exception' });
    }
  } else if (decision.type === 'self_return_from_graveyard') {
    // Punto 15: una carta controlada por el rival devuelve cartas de SU cementerio a SU
    // mano. El cementerio es público pero la mano es privada, por eso el dueño real hace
    // tanto la elección como el movimiento en su propio cliente y sólo devuelve los nombres
    // que ya quedaron revelados por la propia acción.
    state.respondingToDecision = true;
    render();
    chooseGraveyardCards({
      zoneIsLocal: true,
      chooserIsLocal: true,
      filter: decision.filter || 'any',
      landFilter: decision.landFilter || null,
      amount: decision.amount || 1,
      cardName: decision.cardName || 'Efecto rival',
      actionLabel: `elegí ${decision.amount || 1} carta${(decision.amount || 1) > 1 ? 's' : ''} para devolver a tu mano`,
      botStrategy: 'highest_value'
    }).then(chosenCards => {
      const returnedNames = [];
      for (const chosenCard of chosenCards) {
        const idx = state.localGraveyard.indexOf(chosenCard);
        if (idx === -1 || chosenCard?.isToken) continue;
        const [returnedCard] = state.localGraveyard.splice(idx, 1);
        state.localHand.push(returnedCard);
        returnedNames.push(returnedCard.name);
      }
      state.respondingToDecision = false;
      render();
      respondToDecision(decision.requestId, { completed: true, returnedNames });
    }).catch(err => {
      console.error('Error devolviendo carta remota del cementerio a la mano:', err);
      state.pendingGraveyardChoice = null;
      state.respondingToDecision = false;
      render();
      respondToDecision(decision.requestId, { completed: false, returnedNames: [] });
    });
  } else if (decision.type === 'self_search_land') {
    // LAND 3: una carta controlada por este jugador busca en SU biblioteca privada. El
    // cliente remoto nunca recibe el mazo; sólo recibe nombres legalmente públicos (reveal explícito
    // o destino battlefield). Una búsqueda a mano sin reveal mantiene la identidad privada.
    state.respondingToDecision = true;
    render();
    const spec = normalizeLandSearchEffect({
      amount: decision.amount,
      filter: decision.filter,
      destination: decision.destination,
      allowFewer: decision.allowFewer,
      reveal: decision.reveal
    });
    chooseLandSearchEntries({
      ownerIsLocal: true,
      chooserIsLocal: true,
      spec,
      cardName: decision.cardName || 'Efecto rival'
    }).then(entries => commitLandSearchEntries({
      ownerIsLocal: true,
      entries,
      spec,
      cardName: decision.cardName || 'Efecto rival'
    })).then(result => {
      state.respondingToDecision = false;
      render();
      respondToDecision(decision.requestId, result);
    }).catch(err => {
      console.error('Error buscando Tierra remota en biblioteca:', err);
      state.pendingLandSearchChoice = null;
      state.respondingToDecision = false;
      render();
      respondToDecision(decision.requestId, { completed: false, selectedCount: 0, movedNames: [] });
    });
  } else if (decision.type === 'self_library_action') {
    // 23.15.6: una carta controlada por este jugador opera sobre SU biblioteca privada.
    // El cliente contrario sólo recibe nombres si la propia instrucción hace pública la identidad.
    state.respondingToDecision=true;
    render();
    const spec=normalizeLibraryEffect(decision.spec || {});
    chooseLibraryEntries({ownerIsLocal:true,chooserIsLocal:true,spec,cardName:decision.cardName||'Efecto rival'})
      .then(entries=>commitLibraryEntries({ownerIsLocal:true,sourceIsLocal:decision.sourceControllerRole===state.currentMatch?.myRole,entries,spec,cardName:decision.cardName||'Efecto rival'}))
      .then(result=>{ state.respondingToDecision=false; render(); respondToDecision(decision.requestId,result); })
      .catch(err=>{
        console.error('Error resolviendo acción remota de biblioteca:',err);
        state.pendingLibraryChoice=null;
        state.respondingToDecision=false;
        render();
        respondToDecision(decision.requestId,{completed:false,selectedCount:0,movedNames:[],reason:String(err?.message||err)});
      });
  } else if (decision.type === 'graveyard_choice') {
    // Punto 6: el jugador remoto elige desde el cementerio indicado por rol fijo. Al llegar
    // a SU pantalla, ese rol se traduce otra vez a local/rival y el mismo selector general
    // abre el modal sobre los slots reales de esa zona pública.
    state.respondingToDecision = true;
    render();
    const zoneIsLocal = !!state.currentMatch && decision.zoneOwnerRole === state.currentMatch.myRole;
    chooseGraveyardCards({
      zoneIsLocal,
      chooserIsLocal: true,
      filter: decision.filter || 'any',
      landFilter: decision.landFilter || null,
      amount: decision.amount || 1,
      cardName: decision.cardName || 'Efecto rival',
      actionLabel: decision.actionLabel || null,
      botStrategy: decision.botStrategy || 'highest_value'
    }).then(chosenCards => {
      const graveyard = zoneIsLocal ? state.localGraveyard : state.rivalGraveyard;
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, {
        completed: true,
        selectedIndexes: chosenCards.map(card => graveyard.indexOf(card)).filter(i => i >= 0),
        selectedNames: chosenCards.map(card => card.name)
      });
    }).catch(err => {
      console.error('Error resolviendo selección remota de cementerio:', err);
      state.pendingGraveyardChoice = null;
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, { completed: false, selectedIndexes: [], selectedNames: [] });
    });
  } else if (decision.type === 'copy_retarget_decision') {
    // 23.15.9 — el controlador REMOTO de la copia decide si conserva o cambia este target.
    state.respondingToDecision=true;
    render();
    showCopyRetargetModal(decision.cardName||'Copia',decision.targetLabel||'objetivo',
      ()=>{ state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{changeTargets:false}); },
      ()=>{ state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{changeTargets:true}); }
    );
  } else if (decision.type === 'copy_stack_target') {
    // Elegir un nuevo target que también vive en la Stack. El solicitante manda sólo IDs
    // legales; este cliente vuelve a cruzarlos con su Stack pública antes de ofrecerlos.
    state.respondingToDecision=true;
    render();
    const allowed=new Set((decision.candidateIds||[]).map(Number));
    const candidates=spellStack.filter(obj=>allowed.has(Number(obj.id))).map(obj=>({
      id:obj.id,cardName:obj.card?.name||'Objeto',label:`#${obj.id} · ${obj.card?.name||'Objeto'}${obj.type==='ability'?' · habilidad':''}`
    }));
    showStackObjectChoiceModal(candidates,gameText('copy.stackChoice.title'),entry=>{
      state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{stackId:entry?.id??null});
    },()=>{
      state.respondingToDecision=false; render(); respondToDecision(decision.requestId,{stackId:null});
    });
  } else if (decision.type === 'resolved_effect_target') {
    // Punto 7: un ETB del rival nació durante resolución y necesita target. El controlador
    // real elige en SU pantalla; la respuesta vuelve como descriptor público de zona/slot.
    state.respondingToDecision = true;
    render();
    chooseResolvedEffectTarget({
      effect: decision.effect,
      sourceCard: decision.sourceCard || { name: decision.cardName || 'ETB rival', colors: [] },
      cardName: decision.cardName || 'ETB rival',
      controllerIsLocal: true,
      chooserIsLocal: true
    }).then(target => {
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, { completed: !!target, target: serializeResolvedEffectTarget(target) });
    }).catch(err => {
      console.error('Error eligiendo target remoto de ETB reanimado:', err);
      pendingResolvedEffectTargetResolver = null;
      state.pendingResolvedEffectTargetChoice = null;
      state.pendingTargetCard = null;
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, { completed: false, target: null });
    });
  } else if (decision.type === 'self_discard') {
    // Punto 8: el jugador AFECTADO decide sobre SU mano privada. Para `selection:random`
    // el mismo helper hace el azar localmente sin revelar la mano; para `choice` abre el
    // selector genérico. El solicitante sólo recibe los nombres que ya quedaron públicos
    // al ir al cementerio.
    state.respondingToDecision = true;
    render();
    discardCardsFromHand({
      victimIsLocal: true,
      amount: decision.amount || 1,
      selection: decision.selection || 'choice',
      cardName: decision.cardName || 'Efecto rival',
      reason: decision.reason || 'effect',
      requireExact: !!decision.requireExact
    }).then(result => {
      state.respondingToDecision = false;
      logMsg(result.discardedNames.length > 0
        ? gameText('discard.remote.chosen', { card: decision.cardName || 'Efecto rival', cards: result.discardedNames.join(', ') })
        : gameText('discard.remote.none', { card: decision.cardName || 'Efecto rival' }));
      respondToDecision(decision.requestId, {
        completed: result.completed,
        discardedNames: result.discardedNames
      });
    }).catch(err => {
      console.error('Error resolviendo descarte remoto elegido:', err);
      state.pendingDiscardChoice = null;
      state.respondingToDecision = false;
      respondToDecision(decision.requestId, { completed: false, discardedNames: [] });
    });
  } else if (decision.type === 'forced_discard') {
    // Compatibilidad con el canal viejo: descarte forzado RANDOM. Las cartas normales con
    // `effect.type:"discard"` ya usan `self_discard` y elección del jugador afectado.
    // Esto corre en
    // MI PROPIA pantalla (yo soy quien recibió la pregunta), así que "mi mano" es de
    // verdad state.localHand — nada de placeholders acá, esto SÍ tiene las cartas reales.
    // ETAPA MOTOR 1: el descarte remoto ahora es realmente AL AZAR. Antes siempre
    // quitaba la última carta del array de mano: era oculto para el rival, pero no random.
    const discarded = removeRandomCardsFromHand(state.localHand, decision.amount);
    const discardedNames = [];
    discarded.forEach(card => {
      const plan=replacementCardZonePlan(card,true,'hand','graveyard','forced_discard');
      plan.destination.push(card);
      discardedNames.push(card.name);
      dispatchGameEvent({type:'card_discarded',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'hand',zoneTo:plan.zoneTo,cause:'forced_discard'});
      if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'hand',zoneTo:'exile',cause:'forced_discard'});
    });
    logMsg(discardedNames.length > 0
      ? gameText('discard.remote.random', { card: decision.cardName, cards: discardedNames.join(', ') })
      : gameText('discard.remote.randomNone', { card: decision.cardName }));
    render(); // publica mi mano/cementerio REALES ya actualizados, por el sync normal de siempre
    respondToDecision(decision.requestId, { discardedNames });
  }
}

// Publica mi respuesta a una pregunta que me llegó — el cliente que preguntó la recibe por
// sync y resuelve su Promise pendiente (ver el listener en startListeningToMatch).
function respondToDecision(requestId, responseData) {
  recordTelemetryDecision('remote_decision_response_sent', {
    requestId,
    responseData
  });
  state.decisionResponse = { requestId, ...responseData };
  render();
}

export function startListeningToMatch(matchId, myRole) {
  // Evita procesar la MISMA pregunta dos veces si el listener vuelve a disparar por algo
  // no relacionado mientras pendingDecision sigue siendo la misma — sin esto, podría
  // mostrarse el modal de "Pagar/No pagar" repetido.
  const handledDecisionIds = new Set();

  return listenToMatch(matchId, (publicDoc, snapshotMeta = {}) => {
    if (!publicDoc) return;
    const receivePerfStarted = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const receiveClientMs = Number(snapshotMeta.receivedAtClientMs || Date.now());

    const syncMeta = publicDoc.syncMeta && typeof publicDoc.syncMeta === 'object' ? publicDoc.syncMeta : null;
    const touchedKeys = syncMeta && Array.isArray(syncMeta.touchedKeys) ? new Set(syncMeta.touchedKeys) : null;
    const writerRole = syncMeta?.writerRole || null;
    const writerClientId = syncMeta?.writerClientId || null;
    const writerSeq = Number(syncMeta?.writerSeq);
    const syncPublishId = syncMeta?.publishId || null;
    const serverCommittedAtMs = syncMeta?.serverCommittedAt && typeof syncMeta.serverCommittedAt.toMillis === 'function'
      ? syncMeta.serverCommittedAt.toMillis()
      : (Number(syncMeta?.serverCommittedAt?.seconds) * 1000 + Number(syncMeta?.serverCommittedAt?.nanoseconds || 0) / 1e6 || null);
    const serverToReceiveApproxMs = Number.isFinite(serverCommittedAtMs)
      ? Math.round(receiveClientMs - serverCommittedAtMs)
      : null;

    // El eco de MI propia escritura suele ser sólo un ACK. Pero Firestore entrega el
    // DOCUMENTO mergeado completo: si el rival escribió otra key casi al mismo tiempo,
    // nuestro snapshot con syncMeta propio puede traer también ese cambio remoto. Ignorar
    // el snapshot entero hacía desaparecer esa key (caso real 23.13.35: host publicó
    // priorityPlayer=host mientras el guest publicaba sólo priorityClockSerial/activity, y
    // ambos terminaron viendo prioridad local).
    const isSelfEcho = (writerClientId && writerClientId === matchSyncClientId) || (writerRole && writerRole === myRole);
    let effectiveTouchedKeys = touchedKeys;
    let coalescedRemoteKeys = null;
    if (isSelfEcho) {
      if ((!touchedKeys || touchedKeys.has('priorityClockSerial')) && Number.isFinite(Number(publicDoc.priorityClockSerial))) {
        syncPriorityClockFromNetwork({
          serial: Number(publicDoc.priorityClockSerial),
          durationMs: Number(publicDoc.priorityClockDurationMs) || 15000,
          receivedAtClientMs: receiveClientMs,
          source: 'self_ack',
          serverCommittedAtMs
        });
      }

      // Con touchedKeys conocemos exactamente qué intentó escribir ESTE cliente. Cualquier
      // otra key que difiera del baseline observado necesariamente llegó coalescida desde
      // otro write y debe procesarse como remota antes de actualizar el baseline.
      if (touchedKeys && lastKnownPublicWire && typeof lastKnownPublicWire === 'object') {
        coalescedRemoteKeys = new Set();
        Object.keys(publicDoc).forEach(key => {
          if (key === 'syncMeta' || touchedKeys.has(key)) return;
          if (!wireEqual(publicDoc[key], lastKnownPublicWire[key])) coalescedRemoteKeys.add(key);
        });
      }

      if (!coalescedRemoteKeys || coalescedRemoteKeys.size === 0) {
        lastKnownPublicWire = wireClone(publicDoc);
        if (writerClientId && Number.isFinite(writerSeq)) lastAppliedWriterSeq.set(writerClientId, writerSeq);
        recordTelemetryNetwork('sync_self_echo_ignored', {
          matchId,
          myRole,
          writerRole,
          writerClientId,
          writerSeq: Number.isFinite(writerSeq) ? writerSeq : null,
          reason: writerClientId === matchSyncClientId ? 'same_client' : 'same_role'
        });
        return;
      }

      effectiveTouchedKeys = coalescedRemoteKeys;
      if (writerClientId && Number.isFinite(writerSeq)) lastAppliedWriterSeq.set(writerClientId, writerSeq);
      recordTelemetryNetwork('sync_self_echo_coalesced_remote', {
        matchId,
        myRole,
        writerRole,
        writerClientId,
        writerSeq: Number.isFinite(writerSeq) ? writerSeq : null,
        coalescedKeys: [...coalescedRemoteKeys]
      }, 'warning');
    }

    const writerKey = writerClientId || writerRole || null;
    if (!isSelfEcho && writerKey && Number.isFinite(writerSeq)) {
      const previousSeq = lastAppliedWriterSeq.get(writerKey) || 0;
      if (writerSeq <= previousSeq) {
        recordTelemetryNetwork('sync_stale_snapshot_ignored', {
          matchId,
          myRole,
          writerRole,
          writerClientId,
          writerSeq,
          previousSeq
        }, 'warning');
        return;
      }
      lastAppliedWriterSeq.set(writerKey, writerSeq);
    }

    const writtenByRival = isSelfEcho ? true : (writerRole ? writerRole !== myRole : false);

    const incoming = {
      // Si el ÚLTIMO write fue del rival, puede contener cambios autoritativos sobre MI
      // battlefield (daño, removal, bounce, etc.). Sólo importamos las keys que ese write
      // declaró haber tocado; nunca leemos de rebote campos viejos del documento mergeado.
      ...(writtenByRival ? extractMyStateFromPublicDoc(publicDoc, myRole, effectiveTouchedKeys) : {}),
      ...extractRivalStateFromPublicDoc(publicDoc, myRole, effectiveTouchedKeys),
      ...extractSharedStateFromPublicDoc(publicDoc, myRole, effectiveTouchedKeys)
    };

    // ENTREGA 23.6: la Stack es parte del snapshot público, pero necesita traducción de
    // perspectiva host/guest <-> local/rival. Comparamos en formato canónico para que un
    // eco de nuestro propio publish no parezca un cambio sólo porque `isLocal` se invierte.
    const hasIncomingStack = (!effectiveTouchedKeys || effectiveTouchedKeys.has('stackState')) && Object.prototype.hasOwnProperty.call(publicDoc, 'stackState') && Array.isArray(publicDoc.stackState);
    const currentCanonicalStack = hasIncomingStack ? serializeStackForPublic(spellStack, state, myRole) : null;
    const stackChanged = hasIncomingStack && !wireEqual(currentCanonicalStack, publicDoc.stackState);

    const changedKeys = Object.keys(incoming).filter(key => !wireEqual(state[key], incoming[key]));
    if (stackChanged) changedKeys.push('spellStack');
    // El documento completo recién observado pasa a ser el baseline de deltas incluso si
    // no cambió ningún campo que este cliente materializa en `state`.
    lastKnownPublicWire = wireClone(publicDoc);
    if (changedKeys.length === 0) return;

    recordTelemetryNetwork('sync_receive', {
      matchId,
      myRole,
      changedKeys,
      writerRole,
      writerClientId,
      writerSeq: Number.isFinite(writerSeq) ? writerSeq : null,
      publishId: syncPublishId,
      serverCommittedAtMs: Number.isFinite(serverCommittedAtMs) ? serverCommittedAtMs : null,
      serverToReceiveApproxMs,
      snapshotFromCache: !!snapshotMeta.fromCache,
      snapshotHasPendingWrites: !!snapshotMeta.hasPendingWrites,
      coalescedFromSelfEcho: !!isSelfEcho,
      turnCount: incoming.turnCount ?? state.turnCount,
      phase: incoming.phase ?? state.phase,
      activePlayer: incoming.activePlayer ?? state.activePlayer,
      priorityPlayer: incoming.priorityPlayer ?? state.priorityPlayer,
      consecutivePasses: incoming.consecutivePasses ?? state.consecutivePasses,
      stackDepth: hasIncomingStack ? publicDoc.stackState.length : spellStack.length,
      pendingDecision: incoming.pendingDecision ? {
        type: incoming.pendingDecision.type,
        forRole: incoming.pendingDecision.forRole,
        requestId: incoming.pendingDecision.requestId
      } : null,
      decisionResponse: incoming.decisionResponse ? {
        type: incoming.decisionResponse.type,
        requestId: incoming.decisionResponse.requestId
      } : null
    });

    // CRÍTICO: renderizar un snapshot remoto NO lo vuelve a publicar. Aplicamos primero
    // zonas/campos, después rehidratamos targets/fuentes de la Stack contra esas zonas ya
    // frescas, y recién entonces renderizamos con la frontera de publish cerrada.
    remoteSyncApplyDepth++;
    try {
      Object.assign(state, incoming);
      ensureControlEffectSerialAfterHydration();
      if ((!effectiveTouchedKeys || effectiveTouchedKeys.has('priorityClockSerial')) && Number.isFinite(Number(publicDoc.priorityClockSerial))) {
        syncPriorityClockFromNetwork({
          serial: Number(publicDoc.priorityClockSerial),
          durationMs: Number(publicDoc.priorityClockDurationMs) || 15000,
          receivedAtClientMs: receiveClientMs,
          source: isSelfEcho ? 'coalesced_remote' : 'remote_sync',
          serverCommittedAtMs: isSelfEcho ? null : serverCommittedAtMs
        });
      }
      relinkEquipmentAttachments(state);
      if (hasIncomingStack) {
        replaceSpellStackFromSync(deserializeStackFromPublic(publicDoc.stackState, state, myRole));
      } else {
        refreshStackBoardRefs(spellStack, state, myRole);
      }
      render();
      const renderEnded = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      recordTelemetryNetwork('sync_render_applied', {
        matchId,
        myRole,
        publishId: syncPublishId,
        writerRole,
        writerSeq: Number.isFinite(writerSeq) ? writerSeq : null,
        receiveToRenderMs: Math.max(0, Math.round(renderEnded - receivePerfStarted)),
        serverCommittedAtMs: Number.isFinite(serverCommittedAtMs) ? serverCommittedAtMs : null,
        serverToReceiveApproxMs
      });
    } finally {
      remoteSyncApplyDepth = Math.max(0, remoteSyncApplyDepth - 1);
    }

    // Mecanismo GENERAL de decisión remota (ver requestRivalDecision más abajo) — dos
    // casos posibles acá: (a) me llegó la RESPUESTA a algo que YO le pregunté al rival
    // (resuelve mi Promise pendiente y listo), o (b) me llegó una PREGUNTA para MÍ (le
    // muestro la UI correspondiente). El requestId es lo que evita procesar ecos o la
    // misma pregunta/respuesta más de una vez.
    if (state.decisionResponse) {
      // ETAPA MOTOR 3: sólo la respuesta cuyo requestId coincide con la decisión ACTIVA
      // avanza la cola. Ecos atrasados o respuestas de otro request se ignoran sin tocarla.
      recordTelemetryDecision('remote_decision_response_received', {
        type: state.decisionResponse.type,
        requestId: state.decisionResponse.requestId
      });
      remoteDecisionQueue.resolveResponse(state.decisionResponse);
    }

    if (state.pendingDecision && state.pendingDecision.forRole === myRole && !handledDecisionIds.has(state.pendingDecision.requestId)) {
      handledDecisionIds.add(state.pendingDecision.requestId);
      recordTelemetryDecision('remote_decision_request_received', {
        type: state.pendingDecision.type,
        forRole: state.pendingDecision.forRole,
        requestId: state.pendingDecision.requestId
      });
      handleIncomingDecisionRequest(state.pendingDecision);
    }

    // FASE 4, ETAPA 4: si lo que acaba de llegar deja "ambos pasaron prioridad" (consecutivePasses
    // >= 2) Y ahora es MI turno, tengo la autoridad para resolver qué pasa después (ver
    // resolveBothPassed en turnManager.js, y por qué esto tiene que ser así) — el rival, al
    // pasar, no pudo resolverlo porque no era su turno. Sin este llamado, nadie en este
    // cliente se enteraría de que le toca procesar la resolución.
    if (!state.gameOver && state.consecutivePasses >= 2) {
      const topStackItem = spellStack.length > 0 ? spellStack[spellStack.length - 1] : null;
      const ownsResolution = topStackItem ? !!topStackItem.isLocal : state.activePlayer === 'local';
      if (ownsResolution) resolveBothPassed();
    }

    // FASE 4, ETAPA 4 (la parte más delicada): si el turno recién me llegó (el rival lo dejó
    // así a propósito, con activePlayer:'local' para mí y phase:'untap' sin procesar — ver el
    // comentario en advanceStep(), turnManager.js), me toca enderezar MI PROPIO tablero acá.
    if (!state.gameOver && state.activePlayer === 'local' && state.phase === 'untap') {
      processMyTurnStart();
    }
  });
}

// FASE 4, ETAPA 6 (reconexión): reconstruye el `state` local COMPLETO desde lo último
// publicado en Firestore — se usa cuando alguien recarga la página a mitad de una partida
// multiplayer, momento en el que el `state` en memoria (todo lo de siempre: mano, mazo,
// campo de batalla, turno) se pierde por completo, igual que si la partida jamás hubiera
// arrancado. Mi propia mitad se reconstruye del documento PÚBLICO (extractMyStateFromPublicDoc
// — es simétrico a cómo ya reconstruyo la mitad del rival), y mi mano/mazo REALES vienen del
// documento PRIVADO (nunca del público, por diseño — ver Etapa 5). No arranca la escucha en
// tiempo real ni prepara el tablero — eso es responsabilidad de quien llama a esto.
export function reconstructStateFromMatch(publicDoc, privateDoc, myRole) {
  Object.assign(
    state,
    extractMyStateFromPublicDoc(publicDoc, myRole),
    extractRivalStateFromPublicDoc(publicDoc, myRole),
    extractSharedStateFromPublicDoc(publicDoc, myRole)
  );
  state.localHand = privateDoc.hand || [];
  state.localDeck = privateDoc.deck || [];
  if (!state.localManaPool) state.localManaPool = emptyManaPool();
  if (!state.rivalManaPool) state.rivalManaPool = emptyManaPool();
  ensureControlEffectSerialAfterHydration();
  relinkEquipmentAttachments(state);
  lastKnownPublicWire = wireClone(publicDoc || {});
  lastKnownPrivateWire = wireClone(privateDoc || {});
  replaceSpellStackFromSync(deserializeStackFromPublic(publicDoc.stackState || [], state, myRole));
}

// FASE 4, ETAPA 6: retoma una partida multiplayer después de un reload — arma el tablero
// desde cero (setupBoardLayout, igual que un initGame normal), pero en vez de barajar
// mazos nuevos y hacer mulligan, reconstruye TODO desde lo último publicado en Firestore
// (reconstructStateFromMatch) y arranca la escucha en tiempo real donde había quedado.
function resumeReconnectedMatch(matchId, myRole, publicDoc, privateDoc, rivalName, rivalPhotoURL = '') {
  const mainMenuOverlay = document.getElementById('main-menu-overlay');
  if (mainMenuOverlay) mainMenuOverlay.remove();

  setupBoardLayout();
  state.currentMatch = { matchId, myRole, rivalName: rivalName || 'tu rival', rivalPhotoURL: rivalPhotoURL || '', startingRole: normalizeStartingRole(publicDoc?.startingRole), engineVersion: ENGINE_VERSION, engineProtocolVersion: ENGINE_PROTOCOL_VERSION };
  startMultiplayerPresenceHeartbeat(matchId, myRole);
  reconstructStateFromMatch(publicDoc, privateDoc, myRole);

  // ENTREGA 22: un refresh corta la ejecución JS anterior, pero su backup queda exportable
  // como "Anterior". La reconexión abre una sesión nueva correlacionada por el mismo matchId.
  startTelemetrySession({
    mode: 'multiplayer_reconnect',
    matchId,
    myRole,
    deckLabel: 'reconnect'
  });
  recordTelemetryEvent('reconnect_state_loaded', {
    localHandCount: state.localHand.length,
    localDeckCount: state.localDeck.length,
    turnCount: state.turnCount,
    phase: state.phase
  });

  startListeningToMatch(matchId, myRole);
  hookGameplayButtons();

  render();
  logMsg(gameText('game.reconnected'));
}

// FASE 4, ETAPA 6: se llama apenas carga el perfil en boot() — si trae un activeMatchId,
// confirmamos con Firestore que la partida SIGUE siendo real (no terminada, no borrada)
// antes de ofrecer reconectar. Nunca confiamos ciegamente en el marcador solo: podría estar
// desactualizado (ej. el otro cliente falló al limpiarlo).
function offerReconnectIfStillActive(matchId) {
  fetchMatchForReconnect(matchId, state.currentUser.uid)
    .then(matchData => {
      if (!matchData) {
        clearActiveMatchId(state.currentUser.uid)
          .then(() => { if (state.userProfile) state.userProfile.activeMatchId = null; })
          .catch(() => {});
        return;
      }
      if (matchData.incompatible) {
        const remote = matchData.engineVersion || 'versión anterior/desconocida';
        window.alert(`La partida guardada usa ${remote} y esta pestaña usa ${ENGINE_VERSION}. No se puede reconectar con motores distintos. Actualizá ambas notebooks.`);
        return;
      }
      const myRole = matchData.publicDoc.hostUid === state.currentUser.uid ? 'host' : 'guest';
      // 23.13.24: identidad visible del rival = username Argentinia; displayName sólo fallback legacy.
      const rivalUid = myRole === 'host' ? matchData.publicDoc.guestUid : matchData.publicDoc.hostUid;
      const rivalProfile = (matchData.publicDoc.players && matchData.publicDoc.players[rivalUid]) || {};
      const rivalName = String(rivalProfile.username || rivalProfile.displayName || '').trim() || 'tu rival';
      const rivalPhotoURL = rivalProfile.photoURL || '';

      showReconnectPrompt(
        () => resumeReconnectedMatch(matchId, myRole, matchData.publicDoc, matchData.privateDoc, rivalName, rivalPhotoURL),
        () => {
          // "Abandonarla": mismo efecto que el botón de abandonar de siempre, pero sin
          // necesidad de volver a entrar a la partida primero — le avisamos al rival igual.
          state.currentMatch = { matchId, myRole, rivalName, rivalPhotoURL };
          Object.assign(state, extractSharedStateFromPublicDoc(matchData.publicDoc, myRole));
          state.abandonedBy = 'local';
          publishMatchState().catch(() => {});
          if (state.currentUser) {
            recordLocalAbandonStatsBestEffort();
            awardPoints(state.currentUser.uid, POINTS.abandonPenalty).catch(() => {});
          }
          clearActiveMatchId(state.currentUser.uid)
            .then(() => { if (state.userProfile) state.userProfile.activeMatchId = null; })
            .catch(() => {});
        }
      );
    })
    .catch(err => console.error('No se pudo revisar la partida en curso:', err));
}

export function getEffectivePower(itemObj) {
  const card = itemObj.card || itemObj;
  let p = itemObj?.animatedBasePower ?? card.power ?? 0;
  p += getCounterStats(itemObj);
  (itemObj.auras || []).forEach(attached => {
    const mod = attached.auraEffect && attached.auraEffect.stats;
    // Soporte para stats asimétricos nuevos
    if (mod && mod.powerMod !== undefined) {
      p += mod.powerMod;
    } 
    // Compatibilidad con el formato viejo (auras simétricas)
    else if (mod && mod.cantidad) {
      p += (mod.signo === '-' ? -1 : 1) * mod.cantidad;
    }
  });
  // Bonos de Equipamiento adjunto (estáticos, ej. Poncho de Diamante +0/+2)
  getEquipmentOn(itemObj).forEach(eq => {
    const stats = eq.card.equipment && eq.card.equipment.grantedStats;
    if (stats && stats.powerMod !== undefined) p += stats.powerMod;
  });
  // Encantamientos estáticos globales (ej. "Tus criaturas obtienen +1/+1")
  getStaticTeamModifiers(itemObj).forEach(m => {
    if (m.type === 'team_buff' && m.powerMod !== undefined) p += m.powerMod;
  });
  // Trucos de combate "hasta el final del turno" (ej. Fuerza de Toro +3/+3)
  (itemObj.tempEffects || []).forEach(t => {
    if (t.powerMod !== undefined) p += t.powerMod;
  });
  return p;
}

export function getEffectiveToughness(itemObj) {
  const card = itemObj.card || itemObj;
  let t = itemObj?.animatedBaseToughness ?? card.toughness ?? 0;
  t += getCounterStats(itemObj);
  (itemObj.auras || []).forEach(attached => {
    const mod = attached.auraEffect && attached.auraEffect.stats;
    if (mod && mod.toughnessMod !== undefined) {
      t += mod.toughnessMod;
    } 
    else if (mod && mod.cantidad) {
      t += (mod.signo === '-' ? -1 : 1) * mod.cantidad;
    }
  });
  getEquipmentOn(itemObj).forEach(eq => {
    const stats = eq.card.equipment && eq.card.equipment.grantedStats;
    if (stats && stats.toughnessMod !== undefined) t += stats.toughnessMod;
  });
  getStaticTeamModifiers(itemObj).forEach(m => {
    if (m.type === 'team_buff' && m.toughnessMod !== undefined) t += m.toughnessMod;
  });
  (itemObj.tempEffects || []).forEach(t2 => {
    if (t2.toughnessMod !== undefined) t += t2.toughnessMod;
  });
  return t;
}

export function getEffectiveKeywords(itemObj) {
  const card = itemObj.card || itemObj;
  const itemIsLocal = !!itemObj?.card && (state.localCombat.includes(itemObj) || state.localSupport.includes(itemObj) || state.localLands.includes(itemObj) || state.localPlaneswalkers.includes(itemObj));
  const itemIsRival = !!itemObj?.card && (state.rivalCombat.includes(itemObj) || state.rivalSupport.includes(itemObj) || state.rivalLands.includes(itemObj) || state.rivalPlaneswalkers.includes(itemObj));
  // LAND 6: Blood Moon-style elimina keywords/abilities impresas de una Tierra afectada,
  // pero no borra habilidades concedidas por animación, Auras, Equipos o efectos posteriores.
  const base = (itemIsLocal || itemIsRival)
    ? getEffectiveLandPrintedKeywords(state, itemObj, itemIsLocal)
    : (card.keywords || []);
  const fromAuras = (itemObj.auras || []).flatMap(a => (a.auraEffect && a.auraEffect.keywords) || []);
  const fromEquipment = getEquipmentOn(itemObj).flatMap(eq => (eq.card.equipment && eq.card.equipment.grantedKeywords) || []);
  const fromStatic = getStaticTeamModifiers(itemObj)
    .filter(m => m.type === 'team_keyword')
    .map(m => m.keyword);
  const fromTemp = (itemObj.tempEffects || []).flatMap(t => t.keywords || []);
  const fromAnimation = itemObj?.isAnimatedLand ? (itemObj.animationKeywords || []) : [];
  const fromSuspend = itemObj?._suspendHaste ? ['haste'] : [];
  // FASE 3 (revisión post-Etapa 4): la mejora por Fichas YA NO se busca acá dinámicamente
  // — antes esto aplicaba a CUALQUIER copia con el mismo ID, lo cual estaba mal (el pedido
  // es que sea UNA sola copia puntual, elegible). Ahora la keyword de la mejora se hornea
  // directo en card.keywords de esa copia específica al armar el mazo (ver
  // buildDeckFromCardIds en utils.js), así que ya viene incluida en `base` de acá arriba.
  return [...new Set([...base, ...fromAnimation, ...fromSuspend, ...fromAuras, ...fromEquipment, ...fromStatic, ...fromTemp])];
}

// Punto 6: infraestructura GENERAL de selección de Cementerio. Separamos expresamente
// el dueño de la zona (`zoneIsLocal`) de quién toma la decisión (`chooserIsLocal`): eso
// permite reutilizar exactamente el mismo selector tanto para "elegí de TU cementerio"
// como para "elegí del cementerio RIVAL" sin duplicar lógica.
export const GRAVEYARD_FILTERS = ['any', 'creature', 'instant', 'sorcery', 'land', 'artifact', 'enchantment', 'planeswalker'];

export function cardMatchesGraveyardFilter(card, filter = 'any') {
  if (!card || card.isToken) return false; // una ficha no debería persistir nunca en GY
  if (!GRAVEYARD_FILTERS.includes(filter)) return false;
  if (filter === 'any') return true;
  const type = typeof card.type === 'string' ? card.type : '';
  if (filter === 'creature') return card.power !== undefined || type.includes('Criatura');
  if (filter === 'instant') return type.includes('Instantáneo');
  if (filter === 'sorcery') return type.includes('Conjuro');
  if (filter === 'land') return type.includes('Tierra');
  if (filter === 'artifact') return type.includes('Artefacto');
  if (filter === 'enchantment') return type.includes('Encantamiento');
  if (filter === 'planeswalker') return type.includes('Planeswalker');
  return false;
}

export function getGraveyardChoiceCandidates(zoneIsLocal, filter = 'any', landFilter = null) {
  const graveyard = zoneIsLocal ? state.localGraveyard : state.rivalGraveyard;
  return graveyard
    .map((card, index) => ({ card, index }))
    .filter(entry => cardMatchesGraveyardFilter(entry.card, filter))
    .filter(entry => !landFilter || filter !== 'land' || landGraveyardFilterMatches(entry.card, landFilter));
}

function graveyardFilterLabel(filter) {
  return ({
    any: 'cualquier carta', creature: 'criaturas', instant: 'instantáneos', sorcery: 'conjuros',
    land: 'tierras', artifact: 'artefactos', enchantment: 'encantamientos', planeswalker: 'planeswalkers'
  })[filter] || filter;
}

function chooseBotGraveyardEntries(entries, count, strategy = 'highest_value') {
  const copy = [...entries];
  if (strategy === 'last') return copy.slice(-count);
  const value = e => (e.card.cmc || 0) + (e.card.power !== undefined ? ((e.card.power || 0) + (e.card.toughness || 0)) / 10 : 0);
  copy.sort((a, b) => strategy === 'lowest_value' ? value(a) - value(b) : value(b) - value(a));
  return copy.slice(0, count);
}

let graveyardChoiceChain = Promise.resolve();

async function chooseGraveyardCardsNow(options) {
  const {
    zoneIsLocal = true,
    chooserIsLocal = true,
    filter = 'any',
    amount = 1,
    cardName = 'Efecto',
    actionLabel = null,
    botStrategy = 'highest_value',
    landFilter = null
  } = options || {};
  if (!GRAVEYARD_FILTERS.includes(filter)) {
    logMsg(`⚠️ ${cardName}: filtro de cementerio desconocido "${filter}".`);
    return [];
  }

  const candidates = getGraveyardChoiceCandidates(zoneIsLocal, filter, landFilter);
  const count = Math.min(Math.max(0, Number(amount) || 0), candidates.length);
  if (count <= 0) return [];

  // Si todas las cartas elegibles deben elegirse, no existe decisión real que mostrar/pedir.
  if (candidates.length === count) return candidates.map(e => e.card);

  if (chooserIsLocal) {
    state.pendingGraveyardChoice = { zoneIsLocal, filter, amount: count, cardName };
    render();
    const chosenIndexes = await new Promise(resolve => {
      showGraveyardChoiceModal(
        candidates,
        count,
        cardName,
        graveyardFilterLabel(filter),
        actionLabel || `elegí ${count} carta${count > 1 ? 's' : ''} del cementerio`,
        resolve
      );
    });
    state.pendingGraveyardChoice = null;
    render();
    const graveyard = zoneIsLocal ? state.localGraveyard : state.rivalGraveyard;
    return chosenIndexes
      .map(index => graveyard[index])
      .filter(card => cardMatchesGraveyardFilter(card, filter));
  }

  // En multiplayer la decisión del otro jugador se toma en SU cliente. El cementerio es
  // público, pero quién ELIGE sigue siendo una regla de juego; devolvemos índices de slots
  // para distinguir copias idénticas sin revelar nada adicional.
  if (state.currentMatch) {
    const myRole = state.currentMatch.myRole;
    const zoneOwnerRole = zoneIsLocal ? myRole : otherRole(myRole);
    const response = await requestRivalDecision('graveyard_choice', otherRole(myRole), {
      zoneOwnerRole, filter, landFilter, amount: count, cardName, actionLabel, botStrategy
    });
    const graveyard = zoneIsLocal ? state.localGraveyard : state.rivalGraveyard;
    return (response.selectedIndexes || [])
      .map(index => graveyard[index])
      .filter(card => cardMatchesGraveyardFilter(card, filter))
      .slice(0, count);
  }

  return chooseBotGraveyardEntries(candidates, count, botStrategy).map(e => e.card);
}

export function chooseGraveyardCards(options) {
  options = options || {};
  state.resolvingGraveyardChoices = (state.resolvingGraveyardChoices || 0) + 1;
  render();
  const run = graveyardChoiceChain.then(() => chooseGraveyardCardsNow(options), () => chooseGraveyardCardsNow(options));
  graveyardChoiceChain = run.catch(() => {});
  return run.finally(() => {
    state.resolvingGraveyardChoices = Math.max(0, (state.resolvingGraveyardChoices || 1) - 1);
    if (state.resolvingGraveyardChoices === 0) render();
  });
}

// PUNTO 7 PRE-500 — TARGET ASÍNCRONO PARA ETB REANIMADOS.
// Los ETB de criaturas casteadas normalmente ya declaran su target ANTES de entrar a la
// pila. Reanimate descubre qué criatura vuelve recién durante la resolución, así que ese
// camino necesita declarar el objetivo en ese momento. Reutilizamos getTargetRules y los
// clicks normales del battlefield, pero NO executeSpellOnTarget: no hay un hechizo nuevo
// que castear ni una segunda entrada a la pila.
let pendingResolvedEffectTargetResolver = null;
let resolvedEffectTargetChoiceChain = Promise.resolve();

function resolvedEffectTargetCard(sourceCard, effect, cardName) {
  return {
    id: sourceCard?.id || `resolved_effect_${Date.now()}`,
    name: cardName || sourceCard?.name || 'Habilidad disparada',
    colors: sourceCard?.colors || [],
    effect,
    requiresTarget: true
  };
}

function controllerAllowsTargetSide(rules, targetKind, targetIsLocal, controllerIsLocal) {
  if (targetKind === 'player') return !!rules.allowPlayer;
  const sameSide = targetIsLocal === controllerIsLocal;
  const suffix = targetKind === 'creature' ? 'Creature' : targetKind === 'permanent' ? 'Permanent' : targetKind === 'land' ? 'Land' : 'Planeswalker';
  return !!rules[`allow${sameSide ? 'Local' : 'Rival'}${suffix}`];
}

export function isResolvedEffectTargetLegal(targetObj, options) {
  if (!targetObj || (!options?.effect && !options?.cardLike)) return false;
  const controllerIsLocal = options.controllerIsLocal !== false;
  const sourceCard = options.sourceCard || options.cardLike || { name: options.cardName || 'Efecto', colors: [] };
  const cardLike = options.cardLike || resolvedEffectTargetCard(sourceCard, options.effect, options.cardName);
  const rules = getTargetRules(cardLike);

  if (!controllerAllowsTargetSide(rules, targetObj.type, targetObj.isLocal, controllerIsLocal)) return false;
  if (targetObj.type === 'player' && options.effect.target === 'opponent_player' && targetObj.isLocal === controllerIsLocal) return false;

  if (targetObj.type === 'creature') {
    const unit = targetObj.item;
    if (!unit) return false;
    const board = targetObj.isLocal ? state.localCombat : state.rivalCombat;
    if (!board.includes(unit)) return false;
    // Intocable sólo impide ser objetivo de un OPONENTE. Protección de color impide el
    // target sin importar quién controle la fuente, igual que en el selector normal.
    if (targetObj.isLocal !== controllerIsLocal && hasKeyword(unit, 'hexproof')) return false;
    if (getProtectionMatch(unit, sourceCard.colors || [])) return false;
    if (rules.creatureFilter && !unit.card.type.includes(rules.creatureFilter)) return false;
    if (rules.subtypeFilter && !cardHasSubtype(unit.card,rules.subtypeFilter)) return false;
    if (rules.sharedCreatureTypeWithSource && !cardsShareCreatureType(unit.card,sourceCard)) return false;
    if (rules.transformableOnly && !canTransformPermanent(unit)) return false;
    if (options.effect?.type === 'grant_keyword_temp' && options.effect.keyword && hasKeyword(unit, options.effect.keyword)) return false;
    return true;
  }

  if (targetObj.type === 'permanent') {
    const zone = targetObj.isLocal ? state.localSupport : state.rivalSupport;
    if (!targetObj.item || !zone.includes(targetObj.item)) return false;
    if (targetObj.isLocal !== controllerIsLocal && hasKeyword(targetObj.item, 'hexproof')) return false;
    if (getProtectionMatch(targetObj.item, sourceCard.colors || [])) return false;
    if (rules.transformableOnly && !canTransformPermanent(targetObj.item)) return false;
    if (rules.subtypeFilter && !cardHasSubtype(targetObj.item.card,rules.subtypeFilter)) return false;
    if (rules.sharedCreatureTypeWithSource && !cardsShareCreatureType(targetObj.item.card,sourceCard)) return false;
    return !rules.permanentFilter || targetObj.item.card.type.includes(rules.permanentFilter);
  }

  if (targetObj.type === 'land') {
    const lands = targetObj.isLocal ? state.localLands : state.rivalLands;
    const combat = targetObj.isLocal ? state.localCombat : state.rivalCombat;
    if (!targetObj.item || (!lands.includes(targetObj.item) && !(combat.includes(targetObj.item) && isLandPermanent(targetObj.item)))) return false;
    if (targetObj.isLocal !== controllerIsLocal && hasKeyword(targetObj.item, 'hexproof')) return false;
    if (getProtectionMatch(targetObj.item, sourceCard.colors || [])) return false;
    if (rules.transformableOnly && !canTransformPermanent(targetObj.item)) return false;
    if (rules.subtypeFilter && !cardHasSubtype(targetObj.item.card,rules.subtypeFilter)) return false;
    return landMatchesEffectiveFilter(state, targetObj.item, targetObj.isLocal, rules.landFilter || 'any');
  }

  if (targetObj.type === 'planeswalker') {
    const zone = targetObj.isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
    if (!targetObj.item || !zone.includes(targetObj.item)) return false;
    if (targetObj.isLocal !== controllerIsLocal && hasKeyword(targetObj.item, 'hexproof')) return false;
    if (getProtectionMatch(targetObj.item, sourceCard.colors || [])) return false;
    if (rules.transformableOnly && !canTransformPermanent(targetObj.item)) return false;
    if (rules.subtypeFilter && !cardHasSubtype(targetObj.item.card,rules.subtypeFilter)) return false;
    return true;
  }

  return targetObj.type === 'player';
}

export function getResolvedEffectTargetCandidates(options) {
  const controllerIsLocal = options?.controllerIsLocal !== false;
  const sourceCard = options?.sourceCard || { name: options?.cardName || 'Efecto', colors: [] };
  const effect = options?.effect;
  if (!effect) return [];
  const rules = getTargetRules(resolvedEffectTargetCard(sourceCard, effect, options?.cardName));
  const candidates = [];

  if (rules.allowPlayer) {
    candidates.push({ type: 'player', isLocal: true }, { type: 'player', isLocal: false });
  }
  for (const [isLocal, board] of [[true, state.localCombat], [false, state.rivalCombat]]) {
    if (!controllerAllowsTargetSide(rules, 'creature', isLocal, controllerIsLocal)) continue;
    board.forEach((item, index) => {
      const target = { type: 'creature', isLocal, index, item };
      if (isResolvedEffectTargetLegal(target, options)) candidates.push(target);
    });
  }
  for (const [isLocal, zone] of [[true, state.localSupport], [false, state.rivalSupport]]) {
    if (!controllerAllowsTargetSide(rules, 'permanent', isLocal, controllerIsLocal)) continue;
    zone.forEach((item, index) => {
      const target = { type: 'permanent', isLocal, index, item };
      if (isResolvedEffectTargetLegal(target, options)) candidates.push(target);
    });
  }
  for (const [isLocal, pair] of [[true, [state.localLands, state.localCombat]], [false, [state.rivalLands, state.rivalCombat]]]) {
    if (!controllerAllowsTargetSide(rules, 'land', isLocal, controllerIsLocal)) continue;
    const seen = new Set();
    pair.flat().forEach(item => {
      if (!isLandPermanent(item) || seen.has(item)) return;
      seen.add(item);
      const home = pair[0].includes(item) ? pair[0] : pair[1];
      const target = { type: 'land', isLocal, index: home.indexOf(item), item };
      if (isResolvedEffectTargetLegal(target, options)) candidates.push(target);
    });
  }
  for (const [isLocal, zone] of [[true, state.localPlaneswalkers], [false, state.rivalPlaneswalkers]]) {
    if (!controllerAllowsTargetSide(rules, 'planeswalker', isLocal, controllerIsLocal)) continue;
    zone.forEach((item, index) => {
      const target = { type: 'planeswalker', isLocal, index, item };
      if (isResolvedEffectTargetLegal(target, options)) candidates.push(target);
    });
  }
  return candidates;
}

function chooseBotResolvedEffectTarget(candidates, options) {
  if (candidates.length === 0) return null;
  const controllerIsLocal = options.controllerIsLocal !== false;
  const effect = options.effect || {};
  const own = t => t.isLocal === controllerIsLocal;
  const opponent = t => !own(t);
  const strongest = arr => arr.reduce((best, t) => {
    const value = t.item?.card ? (t.item.card.cmc || 0) + ((t.item.card.power || 0) + (t.item.card.toughness || 0)) / 10 : 0;
    const bestValue = best?.item?.card ? (best.item.card.cmc || 0) + ((best.item.card.power || 0) + (best.item.card.toughness || 0)) / 10 : -1;
    return value > bestValue ? t : best;
  }, null);

  if (['pump', 'grant_keyword_temp', 'attach_equipment'].includes(effect.type)) {
    return strongest(candidates.filter(t => t.type === 'creature' && own(t))) || candidates.find(own) || candidates[0];
  }
  if (effect.type === 'add_counter' || effect.type === 'remove_counter') {
    const polarity=getCounterDefinition(effect.counterType).polarity;
    const adding=effect.type==='add_counter';
    const wantsOpponent=adding ? polarity==='negative' : polarity==='positive';
    const preferred=candidates.filter(wantsOpponent ? opponent : own);
    return strongest(preferred.filter(t=>t.item)) || preferred[0] || candidates[0];
  }
  if (effect.type === 'heal') return candidates.find(t => t.type === 'player' && own(t)) || candidates[0];
  if (['discard', 'poison', 'exile_graveyard', 'prevent_attack'].includes(effect.type)) {
    return candidates.find(t => t.type === 'player' && opponent(t)) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'damage') {
    const killablePw = candidates.find(t => t.type === 'planeswalker' && opponent(t) && t.item.loyalty <= (effect.amount || 0));
    return killablePw || candidates.find(t => t.type === 'player' && opponent(t)) || strongest(candidates.filter(t => t.type === 'creature' && opponent(t))) || candidates[0];
  }
  if (['destroy_creature', 'exile_creature', 'bounce', 'fight', 'cant_attack_next_turn'].includes(effect.type)) {
    return strongest(candidates.filter(t => t.type === 'creature' && opponent(t))) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'destroy_artifact') {
    // Puede vivir en Support o en Combat (Criatura Artefacto / Vehículo tripulado).
    return strongest(candidates.filter(t => (t.type === 'permanent' || t.type === 'creature') && opponent(t))) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'destroy_enchantment') {
    return strongest(candidates.filter(t => t.type === 'permanent' && opponent(t))) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'destroy_land' || effect.type === 'destroy_nonbasic_land') {
    const landScore = t => {
      const item = t?.item || {};
      const c = item.card || {};
      // El Tano prioriza tierras no básicas/utility y, a igualdad, las fuentes de mayor producción.
      return (landMatchesFilter(item, 'nonbasic') ? 100 : 0)
        + (c.activatedAbility || c.activatedAbilities ? 20 : 0)
        + (Array.isArray(c.producesOptions) ? c.producesOptions.length * 3 : 0)
        + Math.max(1, Number(c.manaAmount) || 1);
    };
    const lands = candidates.filter(t => t.type === 'land' && opponent(t));
    return lands.reduce((best, cur) => !best || landScore(cur) > landScore(best) ? cur : best, null) || candidates.find(opponent) || candidates[0];
  }
  return candidates.find(opponent) || candidates[0];
}

function serializeResolvedEffectTarget(targetObj) {
  if (!targetObj || !state.currentMatch) return null;
  const myRole = state.currentMatch.myRole;
  if (targetObj.type === 'player') {
    return { type:'player', ownerRole: targetObj.isLocal ? myRole : otherRole(myRole) };
  }
  const ref = serializeBoardItemRef(targetObj.item, state, myRole);
  if (!ref) return null;
  return { ...ref, type: targetObj.type };
}

function deserializeResolvedEffectTarget(descriptor) {
  if (!descriptor || !state.currentMatch) return null;
  const myRole = state.currentMatch.myRole;
  if (descriptor.type === 'player') return { type:'player', isLocal: descriptor.ownerRole === myRole };

  // Compatibilidad con descriptors 23.15.2 que todavía omitían `zone` salvo en Tierras.
  const normalized = { ...descriptor };
  if (!normalized.zone) {
    if (normalized.type === 'creature') normalized.zone = 'combat';
    else if (normalized.type === 'permanent') normalized.zone = 'support';
    else if (normalized.type === 'planeswalker') normalized.zone = 'planeswalkers';
    else if (normalized.type === 'land') normalized.zone = descriptor.zone === 'combat' ? 'combat' : 'lands';
  }
  const item = deserializeBoardItemRef(normalized, state, myRole);
  if (!item) return null;
  const loc = findBattlefieldItemLocation(item);
  if (!loc) return null;
  return { type: descriptor.type, isLocal: loc.isLocal, index: loc.index, item };
}

function finishPendingResolvedEffectTarget(targetObj) {
  const pending = state.pendingResolvedEffectTargetChoice;
  if (!pending) return false;
  if (!isResolvedEffectTargetLegal(targetObj, pending.options)) {
    logMsg(gameText('target.invalid.generic', { source: pending.cardName }));
    return true;
  }
  const resolver = pendingResolvedEffectTargetResolver;
  pendingResolvedEffectTargetResolver = null;
  state.pendingResolvedEffectTargetChoice = null;
  // pendingTargetCard se usa sólo como adaptador visual para que el battlefield ilumine
  // targets con las mismas reglas que un hechizo normal. Nunca llega a executeSpellOnTarget.
  state.pendingTargetCard = null;
  render();
  if (resolver) resolver(targetObj);
  return true;
}

async function chooseResolvedEffectTargetNow(options) {
  options = options || {};
  const effect = options.effect;
  const sourceCard = options.sourceCard || { name: options.cardName || 'Habilidad disparada', colors: [] };
  const controllerIsLocal = options.controllerIsLocal !== false;
  const chooserIsLocal = options.chooserIsLocal !== false;
  const cardName = options.cardName || `ETB de ${sourceCard.name}`;
  if (!effect) return null;

  const candidates = getResolvedEffectTargetCandidates({ ...options, sourceCard, controllerIsLocal });
  if (candidates.length === 0) {
    logMsg(gameText('target.noneLegal', { source: cardName }));
    return null;
  }
  if (candidates.length === 1) return candidates[0];

  if (chooserIsLocal) {
    const cardLike = resolvedEffectTargetCard(sourceCard, effect, cardName);
    state.pendingResolvedEffectTargetChoice = {
      cardName,
      options: { ...options, sourceCard, controllerIsLocal, chooserIsLocal: true }
    };
    // Reutilizamos el resaltado/estado de targeting de UI, pero los handlers interceptan
    // pendingResolvedEffectTargetChoice ANTES del flujo normal de casteo.
    state.pendingTargetCard = cardLike;
    logMsg(gameText('target.choose', { source: cardName }));
    render();
    return new Promise(resolve => { pendingResolvedEffectTargetResolver = resolve; });
  }

  if (state.currentMatch) {
    const response = await requestRivalDecision('resolved_effect_target', otherRole(state.currentMatch.myRole), {
      effect,
      sourceCard: { id: sourceCard.id || null, name: sourceCard.name, colors: sourceCard.colors || [] },
      cardName
    });
    const target = deserializeResolvedEffectTarget(response.target || null);
    if (!target || !isResolvedEffectTargetLegal(target, { ...options, sourceCard, controllerIsLocal })) {
      logMsg(gameText('target.remoteBecameIllegal', { source: cardName }));
      return null;
    }
    return target;
  }

  return chooseBotResolvedEffectTarget(candidates, { ...options, sourceCard, controllerIsLocal });
}

export function chooseResolvedEffectTarget(options) {
  state.resolvingResolvedEffectTargetChoices = (state.resolvingResolvedEffectTargetChoices || 0) + 1;
  render();
  const run = resolvedEffectTargetChoiceChain.then(
    () => chooseResolvedEffectTargetNow(options),
    () => chooseResolvedEffectTargetNow(options)
  );
  resolvedEffectTargetChoiceChain = run.catch(() => {});
  return run.finally(() => {
    state.resolvingResolvedEffectTargetChoices = Math.max(0, (state.resolvingResolvedEffectTargetChoices || 1) - 1);
    if (state.resolvingResolvedEffectTargetChoices === 0) render();
  });
}

// --- SACRIFICAR COMO COSTO ---
// Saca un permanente propio del campo de batalla y lo manda al cementerio, como parte de
// pagar el costo de una habilidad (no como resultado de daño ni de un "destroy"). Por eso
// NO chequea Indestructible: en MTG real, Indestructible no protege contra un sacrificio.
// Busca en las 3 zonas posibles (criaturas, soporte, tierras) porque lo que se sacrifica
// puede ser cualquiera de los tres.
export function getSacrificeEffectCandidates(isLocal, permanentType) {
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const lands = isLocal ? state.localLands : state.rivalLands;

  if (permanentType === 'creature') return [...combat];
  if (permanentType === 'artifact') {
    return [...combat, ...support, ...lands].filter(item =>
      item && item.card && typeof item.card.type === 'string' && item.card.type.includes('Artefacto')
    );
  }
  if (permanentType === 'land') {
    return [...combat, ...lands].filter(item => isLandPermanent(item));
  }
  return [];
}

// --- SACRIFICAR COMO COSTO ---
// API histórica: un solo permanente. Se mantiene independiente para no cambiar ninguna
// ruta preexistente; comparte exactamente las reglas de salida con el nuevo batch.
export function performSacrifice(item, isLocal) {
  const genericWatchersSnapshot=genericBattlefieldWatchers();
  const zones = isLocal
    ? [state.localCombat, state.localSupport, state.localLands]
    : [state.rivalCombat, state.rivalSupport, state.rivalLands];

  for (const zone of zones) {
    const idx = zone.indexOf(item);
    if (idx === -1) continue;
    const isCreatureZone = (zone === state.localCombat || zone === state.rivalCombat);
    const exitPlan = replacementExitPlan(item,isLocal,'sacrifice','graveyard');
    zone.splice(idx, 1);
    if (isCreatureZone) {
      detachEquipmentFrom(item, isLocal);
      sendAurasToGraveyard(item, isLocal);
      cleanupIfVehicle(item);
    }
    moveBattlefieldCardToZone(item.card, exitPlan.destination);
    logMsg(gameText('sacrifice.self', { card: item.card.name, token: item.card.isToken ? gameText('sacrifice.tokenSuffix') : '' }));
    const sacrificeEntries = buildGenericEventTriggerEntries({
      type:'permanent_sacrificed', controllerIsLocal:isLocal, actorIsLocal:isLocal,
      ownerIsLocal:cardOwnerIsLocal(item.card,isLocal,state.currentMatch?.myRole||null),
      card:item.card, item, zoneFrom:'battlefield', zoneTo:exitPlan.zoneTo, cause:'sacrifice'
    }, {watchersSnapshot:genericWatchersSnapshot});
    if (exitPlan.zoneTo==='exile') sacrificeEntries.push(...buildGenericEventTriggerEntries({
      type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,
      ownerIsLocal:cardOwnerIsLocal(item.card,isLocal,state.currentMatch?.myRole||null),
      card:item.card,item,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
    }, {watchersSnapshot:genericWatchersSnapshot}));
    if (isCreatureZone && exitPlan.zoneTo==='graveyard') {
      const deathWatchersSnapshot = genericWatchersSnapshot
        .filter(entry => state.localCombat.includes(entry.item) || state.rivalCombat.includes(entry.item) || entry.item === item)
        .map(entry => ({ unit: entry.item, isLocal: entry.isLocal }));
      queueCreatureDeathBatch([{ unit:item, isLocal }], deathWatchersSnapshot, sacrificeEntries);
    } else if (sacrificeEntries.length) {
      if (shouldDeferLandManaTriggers()) state.deferredLandManaTriggers.push(...sacrificeEntries);
      else queueTriggeredAbilities(sacrificeEntries);
    }
    return true;
  }
  logMsg(gameText('sacrifice.missing', { card: item.card.name }));
  return false;
}

// Punto 5: sacrifica varios permanentes como UNA misma instrucción. Primero salen todos y
// recién después se disparan sus muertes, preservando watchers simultáneos.
export function performSacrificeBatch(items, isLocal) {
  const uniqueItems = [...new Set((items || []).filter(Boolean))];
  if (uniqueItems.length === 0) return [];

  const zones = isLocal
    ? [state.localCombat, state.localSupport, state.localLands]
    : [state.rivalCombat, state.rivalSupport, state.rivalLands];
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const deathWatchersSnapshot = [
    ...state.localCombat.map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.map(unit => ({ unit, isLocal: false }))
  ];
  const genericWatchersSnapshot=genericBattlefieldWatchers();
  const sacrificeTriggerEntries=[];

  // Los replacement effects de una instrucción simultánea se determinan antes de mover
  // el primer permanente, para que una fuente que también se sacrifica vea todo el lote.
  const planned=[];
  for (const item of uniqueItems) {
    let foundZone=null, idx=-1;
    for (const zone of zones) { idx=zone.indexOf(item); if(idx!==-1){foundZone=zone;break;} }
    if(!foundZone) continue;
    planned.push({item,foundZone,isCreature:foundZone===combat,exitPlan:replacementExitPlan(item,isLocal,'sacrifice','graveyard')});
  }

  const removed = [];
  for (const plan of planned) {
    const {item,foundZone,isCreature,exitPlan}=plan;
    const idx=foundZone.indexOf(item); if(idx===-1) continue;
    foundZone.splice(idx,1);
    if (isCreature) {
      detachEquipmentFrom(item, isLocal);
      sendAurasToGraveyard(item, isLocal);
      cleanupIfVehicle(item);
    }
    moveBattlefieldCardToZone(item.card, exitPlan.destination);
    removed.push({ item, isCreature, zoneTo:exitPlan.zoneTo });
    logMsg(gameText('sacrifice.self', { card: item.card.name, token: item.card.isToken ? gameText('sacrifice.tokenSuffix') : '' }));
    sacrificeTriggerEntries.push(...buildGenericEventTriggerEntries({
      type:'permanent_sacrificed', controllerIsLocal:isLocal, actorIsLocal:isLocal,
      ownerIsLocal:cardOwnerIsLocal(item.card,isLocal,state.currentMatch?.myRole||null),
      card:item.card, item, zoneFrom:'battlefield', zoneTo:exitPlan.zoneTo, cause:'sacrifice'
    }, {watchersSnapshot:genericWatchersSnapshot}));
    if(exitPlan.zoneTo==='exile') sacrificeTriggerEntries.push(...buildGenericEventTriggerEntries({
      type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,
      ownerIsLocal:cardOwnerIsLocal(item.card,isLocal,state.currentMatch?.myRole||null),
      card:item.card,item,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
    }, {watchersSnapshot:genericWatchersSnapshot}));
  }

  const deadEntries = removed.filter(entry => entry.isCreature && entry.zoneTo==='graveyard').map(entry => ({ unit: entry.item, isLocal }));
  if (deadEntries.length) {
    queueCreatureDeathBatch(deadEntries, deathWatchersSnapshot, sacrificeTriggerEntries);
  } else if (sacrificeTriggerEntries.length) {
    if (shouldDeferLandManaTriggers()) state.deferredLandManaTriggers.push(...sacrificeTriggerEntries);
    else queueTriggeredAbilities(sacrificeTriggerEntries);
  }
  return removed.map(entry => entry.item);
}

// --- ENCANTAMIENTOS ESTÁTICOS GLOBALES ---
// Busca, en la zona de soporte del dueño (y del rival, para efectos "scope: opponent"),
// permanentes con `card.staticEffect` y devuelve los que aplican a esta criatura.
// No usan la pila: mientras el Encantamiento esté en el campo, el efecto está activo.
export function getStaticTeamModifiers(itemObj) {
  // 23.13.7 — ANTHEM SCOPE HARDENING.
  // Un efecto estático de battlefield (team_buff/team_keyword) sólo puede modificar un
  // permanente que esté REALMENTE en una zona de criaturas del battlefield. Antes se
  // infería "rival" para cualquier objeto que no estuviera en localCombat; eso hacía que
  // una carta de criatura renderizada en la MANO local consultara rivalSupport y pudiera
  // heredar, por ejemplo, el +1/+0 de Bandera de la Cuadra del Tano.
  const inLocalBattlefield = state.localCombat.includes(itemObj);
  const inRivalBattlefield = state.rivalCombat.includes(itemObj);
  if (!inLocalBattlefield && !inRivalBattlefield) return [];

  const ownSources = inLocalBattlefield
    ? [...state.localCombat,...state.localSupport,...state.localLands,...state.localPlaneswalkers]
    : [...state.rivalCombat,...state.rivalSupport,...state.rivalLands,...state.rivalPlaneswalkers];
  const oppSources = inLocalBattlefield
    ? [...state.rivalCombat,...state.rivalSupport,...state.rivalLands,...state.rivalPlaneswalkers]
    : [...state.localCombat,...state.localSupport,...state.localLands,...state.localPlaneswalkers];
  const mods = [];
  const collect=(source,scope)=>{
    const effects=Array.isArray(source.card?.staticEffects) ? source.card.staticEffects : (source.card?.staticEffect ? [source.card.staticEffect] : []);
    for(const eff of effects){
      if(!eff || !['team_buff','team_keyword'].includes(eff.type) || (eff.scope || 'own')!==scope) continue;
      const typal=eff.filter || {subtype:eff.subtype,subtypes:eff.subtypes,other:eff.other,sharedCreatureTypeWithSource:eff.sharedCreatureTypeWithSource};
      if(!typalFilterMatches(itemObj,typal,{sourceItem:source,sourceCard:source.card})) continue;
      mods.push({ ...eff, sourceName:source.card.name, sourceItem:source });
    }
  };
  ownSources.forEach(s=>collect(s,'own'));
  oppSources.forEach(s=>collect(s,'opponent'));
  return mods;
}

// ---------------------------------------------------------------------------
// ENTREGA 20 — TRIGGER STACK
// ---------------------------------------------------------------------------
// Desde esta entrega, una habilidad disparada NO ejecuta su efecto al detectarse. Se crea
// un objeto real `type:"ability"` en la misma Stack de hechizos/habilidades activadas.
// La fuente puede abandonar el campo después: el objeto de Stack conserva el snapshot de
// `card` + `ability.effect`. Contrarrestar la habilidad solo remueve ese objeto; nunca la fuente.
const TRIGGER_LABELS = {
  etb: 'ETB', creature_etb: 'entrada de criatura', land_etb: 'Landfall', spell_cast: 'Spellslinger',
  dies: 'al morir', any_creature_dies: 'muerte de criatura', opponent_death: 'muerte rival',
  attack: 'al atacar', any_creature_attacks: 'ataque', block: 'al bloquear',
  combat_damage: 'daño de combate', upkeep: 'mantenimiento', end_step: 'paso final',
  land_tapped_for_mana: gameText('land.stax.triggerLabel'),
  reanimate_etb: 'ETB reanimado', return_etb: 'ETB al volver',
  permanent_entered: 'entrada de permanente', creature_entered: 'entrada de criatura',
  land_entered: 'entrada de Tierra', creature_died: 'muerte de criatura',
  spell_cast_generic: 'hechizo casteado', attack_declared: 'ataque declarado',
  block_declared: 'bloqueo declarado', combat_damage_dealt: 'daño de combate',
  upkeep_started: 'mantenimiento', end_step_started: 'paso final',
  card_drawn: 'robo de carta', card_discarded: 'descarte', permanent_sacrificed: 'sacrificio',
  life_gained: 'vida ganada', life_lost: 'vida perdida', counter_added: 'contador agregado', counter_removed: 'contador removido',
  token_created: 'ficha creada', permanent_tapped: 'permanente girado', spell_countered: 'hechizo contrarrestado',
  spell_copied: 'hechizo copiado', ability_copied: 'habilidad copiada', permanent_became_copy: 'permanente copiado',
  saga_chapter: 'capítulo de Saga', suspend_tick: 'Suspend — Tiempo', suspend_cast: 'Suspend — último Tiempo',
  creature_type_chosen: 'tipo de criatura elegido'
};

let triggerOrderingChain = Promise.resolve();
let sbaLegendChoiceMemory = new Map();
let sagaTriggerSerial = 1;

function sameBattlefieldObject(a,b){
  if(!a || !b) return false;
  if(a===b) return true;
  const aid=a._syncObjectId || a._effectObjectId || null;
  const bid=b._syncObjectId || b._effectObjectId || null;
  return !!aid && aid===bid;
}

function markSagaChapterPending(entry){
  if(entry?.triggerType!=='saga_chapter' || !entry?.sourceItem) return entry;
  const key=entry.sagaPendingKey || `saga_${entry.sourceItem._syncObjectId || entry.sourceCard?.id || 'card'}_${entry.sagaChapter || 0}_${sagaTriggerSerial++}`;
  if(!Array.isArray(entry.sourceItem._sagaPendingChapterKeys)) entry.sourceItem._sagaPendingChapterKeys=[];
  if(!entry.sourceItem._sagaPendingChapterKeys.includes(key)) entry.sourceItem._sagaPendingChapterKeys.push(key);
  entry.sagaPendingKey=key;
  return entry;
}

function clearSagaChapterPending(entry){
  if(entry?.triggerType!=='saga_chapter' || !entry?.sourceItem || !entry?.sagaPendingKey) return;
  const keys=Array.isArray(entry.sourceItem._sagaPendingChapterKeys) ? entry.sourceItem._sagaPendingChapterKeys : [];
  entry.sourceItem._sagaPendingChapterKeys=keys.filter(key=>key!==entry.sagaPendingKey);
}

export function hasPendingSagaChapter(item){
  if(!item?.card || !isSagaCard(item.card)) return false;
  if(Array.isArray(item._sagaPendingChapterKeys) && item._sagaPendingChapterKeys.length>0) return true;
  return spellStack.some(stackItem => {
    if(stackItem?.isCopy || stackItem?.type!=='ability' || stackItem?.triggerType!=='saga_chapter') return false;
    if(sameBattlefieldObject(stackItem.sourceItem,item) || sameBattlefieldObject(stackItem.source?.sourceItem,item)) return true;
    const syncId=item._syncObjectId || null;
    return !!syncId && (stackItem._sourceItemRef?.syncObjectId===syncId || stackItem.source?._sourceItemRef?.syncObjectId===syncId);
  });
}

function enqueueTriggerStackItem(entry) {
  if (!entry?.effect || !entry?.sourceCard) return null;
  const triggerType = entry.triggerType || 'trigger';
  const triggerLabel = TRIGGER_LABELS[triggerType] || triggerType;
  const stackItem = {
    card: entry.sourceCard,
    isLocal: entry.isLocal !== false,
    targetObj: entry.targetObj || null,
    type: 'ability', abilityKind: 'triggered', triggerType, triggerLabel,
    ability: { effect: { ...entry.effect } },
    sagaChapter: entry.sagaChapter ?? null,
    sagaChapterRoman: entry.sagaChapterRoman ?? null,
    sagaChapterSpecKey: entry.sagaChapterSpecKey ?? null,
    sagaLoreBefore: entry.sagaLoreBefore ?? null,
    sagaLoreAfter: entry.sagaLoreAfter ?? null,
    sagaPendingKey: entry.sagaPendingKey ?? null,
    source: {
      type:'triggered', triggerType, sourceItem:entry.sourceItem || null,
      sourceCardId:entry.sourceCard.id || null, selfTarget:!!entry.selfTarget,
      eventCard:entry.eventCard || null, eventItem:entry.eventItem || null,
      sagaChapter:entry.sagaChapter ?? null, sagaPendingKey:entry.sagaPendingKey ?? null
    }
  };
  addToStack(stackItem);
  clearSagaChapterPending(entry);
  state.triggerStackSerial=(state.triggerStackSerial||0)+1;
  state.consecutivePasses=0;
  return stackItem;
}

function humanControlsEntry(entry) {
  return entry?.isLocal === true;
}

async function chooseTriggerResolutionOrder(entries, label = '') {
  if (!Array.isArray(entries) || entries.length <= 1) return entries || [];
  // En multiplayer, si las habilidades pertenecen al rival, su cliente ordena el lote.
  if (state.currentMatch && entries.every(e => !humanControlsEntry(e))) {
    const response = await requestRivalDecision('trigger_order', otherRole(state.currentMatch.myRole), {
      entries: entries.map((e,i)=>({ id:i, sourceName:e.sourceCard?.name || 'Habilidad', triggerLabel:TRIGGER_LABELS[e.triggerType] || e.triggerType || 'trigger' })),
      label
    });
    const order=Array.isArray(response?.order) ? response.order : entries.map((_,i)=>i);
    return order.map(i=>entries[Number(i)]).filter(Boolean);
  }
  if (entries.some(humanControlsEntry)) {
    state.pendingTriggerOrderChoice={ count:entries.length, label };
    try { return await showTriggerOrderModal(entries); }
    finally { state.pendingTriggerOrderChoice=null; }
  }
  // Tano: orden estable. La heurística estratégica puede vivir luego en Bot 2.0.
  return entries;
}

async function prepareTriggeredEntry(entry){
  if(!entry?.effect || !entry?.sourceCard) return null;
  if(entry.triggerType==='saga_chapter') markSagaChapterPending(entry);
  if(entry.targetObj) return entry;
  const relation=String(typeof entry.target==='string' ? entry.target : entry.target?.relation || '').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(['self','source','this'].includes(relation)) entry.targetObj=genericItemTarget(entry.sourceItem);
  else if(['controller','you','your_player','controller_player'].includes(relation)) entry.targetObj={type:'player',isLocal:entry.isLocal!==false};
  else if(['opponent','opponent_player','rival_player'].includes(relation)) entry.targetObj={type:'player',isLocal:entry.isLocal===false};
  if(entry.targetObj) return entry;
  if(entry.requiresTarget===true){
    const target=await chooseResolvedEffectTarget({
      effect:entry.effect, sourceCard:entry.sourceCard, sourceItem:entry.sourceItem,
      cardName:`${entry.sourceCard.name} — ${entry.triggerLabel || TRIGGER_LABELS[entry.triggerType] || 'habilidad'}`,
      controllerIsLocal:entry.isLocal!==false, chooserIsLocal:entry.isLocal!==false
    });
    if(!target){ clearSagaChapterPending(entry); return null; }
    entry.targetObj=target;
  }
  return entry;
}

async function processTriggerBatch(entries = []) {
  const raw=entries.filter(e=>e?.effect && e?.sourceCard);
  if (!raw.length) return [];
  // Un capítulo ya disparado mantiene viva a la Saga mientras espera AP/NAP/orden/targets,
  // incluso antes de haber sido materializado como objeto de Stack.
  raw.forEach(markSagaChapterPending);
  const activeIsLocal=state.activePlayer==='local';
  const groups=buildApnapTriggerGroups(raw,activeIsLocal);
  const activeOrder=await chooseTriggerResolutionOrder(groups.active,'AP');
  const nonActiveOrder=await chooseTriggerResolutionOrder(groups.nonActive,'NAP');
  const placement=stackPlacementFromResolutionOrders(activeOrder,nonActiveOrder);
  const stacked=[];
  // Targets se eligen al poner cada habilidad en Stack, en el orden AP/NAP ya decidido.
  // Si un capítulo obligatorio no tiene ningún target legal, desaparece y libera su pending key.
  for(const entry of placement){
    const prepared=await prepareTriggeredEntry(entry);
    if(!prepared) continue;
    const stackItem=enqueueTriggerStackItem(prepared);
    if(stackItem) stacked.push(stackItem);
  }
  return stacked;
}

export function waitForTriggerOrdering() { return triggerOrderingChain; }

export function queueTriggeredAbility(entry = {}) {
  if (!entry.effect || !entry.effect.type || !entry.sourceCard) return null;
  if (state.sbaKernelRunning) {
    state.sbaHeldTriggerBatches.push([entry]);
    return { held:true, sourceCard:entry.sourceCard };
  }
  triggerOrderingChain=triggerOrderingChain.then(()=>processTriggerBatch([entry])).catch(err=>{ console.error('Trigger ordering:',err); });
  return { queued:true, sourceCard:entry.sourceCard };
}

export function queueTriggeredAbilities(entries = []) {
  const valid=entries.filter(e=>e?.effect && e?.sourceCard);
  if (!valid.length) return [];
  if (state.sbaKernelRunning) {
    state.sbaHeldTriggerBatches.push(valid);
    return valid.map(entry=>({held:true,sourceCard:entry.sourceCard}));
  }
  triggerOrderingChain=triggerOrderingChain.then(()=>processTriggerBatch(valid)).catch(err=>{ console.error('Trigger ordering:',err); });
  return valid;
}

export async function flushSbaHeldTriggers() {
  const batches=state.sbaHeldTriggerBatches.splice(0);
  for (const batch of batches) await processTriggerBatch(batch);
  await waitForTriggerOrdering();
}


function genericBattlefieldWatchers(extraSnapshot = null) {
  const out = [
    ...state.localCombat.map(item => ({ item, isLocal:true })),
    ...state.rivalCombat.map(item => ({ item, isLocal:false })),
    ...state.localSupport.map(item => ({ item, isLocal:true })),
    ...state.rivalSupport.map(item => ({ item, isLocal:false })),
    ...state.localLands.map(item => ({ item, isLocal:true })),
    ...state.rivalLands.map(item => ({ item, isLocal:false })),
    ...state.localPlaneswalkers.map(item => ({ item, isLocal:true })),
    ...state.rivalPlaneswalkers.map(item => ({ item, isLocal:false }))
  ];
  for (const entry of extraSnapshot || []) {
    const item=entry?.item || entry?.unit || null;
    if(!item?.card) continue;
    const id=item._syncObjectId || item._effectObjectId || null;
    if(out.some(w => w.item===item || (id && (w.item?._syncObjectId===id || w.item?._effectObjectId===id)))) continue;
    out.push({ item, isLocal:entry.isLocal===true });
  }
  return out;
}

function genericItemTarget(item) {
  if(!item) return null;
  const loc=findBattlefieldItemLocation(item);
  if(!loc) return null;
  if(loc.zoneName==='combat') return { type:'creature', isLocal:loc.isLocal, item };
  if(loc.zoneName==='land') return { type:'land', isLocal:loc.isLocal, item };
  if(loc.zoneName==='planeswalker') return { type:'planeswalker', isLocal:loc.isLocal, item };
  return { type:'permanent', isLocal:loc.isLocal, item };
}

// Targets ligados al propio evento no requieren abrir una elección: permiten expresar
// "poné un contador sobre ESTA criatura que entró", "hacé daño a ESE jugador", etc.
// Los targets realmente elegibles ("cualquier objetivo") siguen usando la UX de target
// existente y quedan fuera del contrato declarativo de 23.15.3.
function genericDeclaredTarget(match, event) {
  const raw=match?.spec?.target;
  const relation=typeof raw==='string' ? raw : raw?.relation;
  const key=String(relation || '').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(!key && match?.spec?.selfTarget!==true) return null;
  if(match?.spec?.selfTarget===true || ['self','source','this'].includes(key)) return genericItemTarget(match.sourceItem);
  if(['event','event_item','event_permanent','subject'].includes(key)) return genericItemTarget(event.item);
  if(['event_source','damage_source'].includes(key)) return genericItemTarget(event.sourceItem);
  if(['event_target','damaged_permanent'].includes(key)) return genericItemTarget(event.targetItem);
  if(['controller','you','your_player','controller_player'].includes(key)) return { type:'player', isLocal:match.sourceIsLocal };
  if(['opponent','opponent_player','rival_player'].includes(key)) return { type:'player', isLocal:!match.sourceIsLocal };
  if(['event_player','target_player'].includes(key) && (event.targetPlayerIsLocal===true || event.targetPlayerIsLocal===false)) {
    return { type:'player', isLocal:event.targetPlayerIsLocal };
  }
  return null;
}

// 23.15.3 — bridge entre el Event Engine puro y la Trigger Stack existente. Las cartas
// nuevas pueden declarar `triggers:[{event,filter,effect}]`; las 643 legacy conservan sus
// campos históricos. Ambos caminos terminan en los mismos queue/AP-NAP/SBA contracts.
function initializeSagaForBattlefieldEntry(rawEvent = {}) {
  const rawType=String(rawEvent?.type || '').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(!['permanent_entered','creature_entered','land_entered'].includes(rawType)) return [];
  const item=rawEvent?.item || null;
  if(!item?.card || !isSagaCard(item.card) || item._sagaEntryInitialized===true) return [];
  const loc=findBattlefieldItemLocation(item);
  const isLocal=(rawEvent.controllerIsLocal===true || rawEvent.controllerIsLocal===false) ? rawEvent.controllerIsLocal : loc?.isLocal;
  if(isLocal!==true && isLocal!==false) return [];
  // Sólo sellamos la entrada cuando ya pudimos atribuirla a un controlador; un evento
  // prematuro sin ubicación no debe quemar para siempre el Lore inicial.
  item._sagaEntryInitialized=true;
  const result=addCountersDetailed(item,'lore',1,{queue:false,cause:'saga_entry',actorIsLocal:isLocal});
  if(result.added>0) logMsg(gameText('saga.enterLore',{card:item.card.name,lore:result.after}));
  return result.entries;
}

export function buildGenericEventTriggerEntries(rawEvent = {}, { watchersSnapshot=null } = {}) {
  const sagaEntryEntries=initializeSagaForBattlefieldEntry(rawEvent);
  const event=normalizeGameEvent({
    ...rawEvent,
    activePlayerIsLocal: rawEvent.activePlayerIsLocal ?? (state.activePlayer==='local'),
    phase: rawEvent.phase || state.phase,
    turnCount: rawEvent.turnCount ?? state.turnCount
  });
  const matches=collectGenericEventMatches({
    event,
    watchers:genericBattlefieldWatchers(watchersSnapshot),
    isSuppressed:(item,isLocal)=>isLandPermanent(item) && landRulesTextSuppressed(state,item,isLocal)
  });
  const entries=[];
  for(const match of matches){
    const effect=match.spec.effect;
    const hasTargetDeclaration=match.spec.target!=null || match.spec.selfTarget===true;
    const targetObj=genericDeclaredTarget(match,event);
    if(!targetObj && !canResolveGameEffectWithoutTarget(effect.type)){
      // 23.15.3 auto-liga self/event/player cuando el schema lo declara. No inventa una
      // elección para "cualquier objetivo": eso debe seguir pasando por la UX legal existente.
      const reason=hasTargetDeclaration ? 'no pudo resolver el objetivo declarado' : 'necesita un objetivo no declarado';
      logMsg(`⚠️ ${match.sourceCard.name}: trigger genérico ${match.spec.event} usa "${effect.type}" y ${reason}.`);
      continue;
    }
    if(targetObj && !canResolveGameEffectWithTarget(effect.type) && !canResolveGameEffectWithoutTarget(effect.type)){
      logMsg(`⚠️ ${match.sourceCard.name}: trigger genérico ${match.spec.event} usa "${effect.type}" sin resolver compatible.`);
      continue;
    }
    entries.push({
      effect, sourceCard:match.sourceCard, sourceItem:match.sourceItem, isLocal:match.sourceIsLocal,
      targetObj, selfTarget:!!targetObj && (match.spec.selfTarget===true || ['self','source','this'].includes(String(typeof match.spec.target==='string'?match.spec.target:match.spec.target?.relation || '').toLowerCase())),
      triggerType:match.spec.label || match.spec.event,
      eventCard:event.card || null, eventItem:event.item || null,
      genericEvent:event, genericTriggerIndex:match.spec._index
    });
  }
  return [...sagaEntryEntries,...entries];
}

export function dispatchReplacementCounterRemoval(result, item, { controllerIsLocal=null, actorIsLocal=null, cause=null } = {}) {
  const info=result?.event?.counterRemovedByReplacement;
  const amount=Math.max(0,Number(info?.amount)||0);
  if(!info || amount<=0 || !item?.card) return false;
  const loc=findBattlefieldItemLocation(item);
  const side=(controllerIsLocal===true || controllerIsLocal===false) ? controllerIsLocal : loc?.isLocal;
  if(side!==true && side!==false) return false;
  const actor=(actorIsLocal===true || actorIsLocal===false) ? actorIsLocal : side;
  dispatchGameEvent({
    type:'counter_removed',
    controllerIsLocal:side,
    actorIsLocal:actor,
    ownerIsLocal:cardOwnerIsLocal(item.card,side,state.currentMatch?.myRole||null),
    card:item.card,
    item,
    amount,
    cause:cause || info.cause || 'replacement_counter_removed',
    metadata:{counterType:normalizeCounterType(info.counterType)}
  });
  return true;
}

function queueGeneratedTriggerEntries(entries = [], eventType = 'event', options = {}) {
  const valid=(entries || []).filter(entry=>entry?.effect && entry?.sourceCard);
  if(!valid.length) return [];
  const defer = options.forceDeferNormalTriggers === true ||
    (options.forceImmediate !== true && shouldDeferLandManaTriggers());
  if(defer){
    state.deferredLandManaTriggers.push(...valid);
    recordTelemetryEvent('generic_event_triggers_deferred',{event:eventType,count:valid.length});
    return valid.map(entry=>({deferred:true,sourceCard:entry.sourceCard}));
  }
  recordTelemetryEvent('generic_event_triggers_queued',{event:eventType,count:valid.length});
  return queueTriggeredAbilities(valid);
}

export function dispatchGameEvent(rawEvent = {}, options = {}) {
  const entries=buildGenericEventTriggerEntries(rawEvent,options);
  const eventType=normalizeGameEvent(rawEvent).type;
  return queueGeneratedTriggerEntries(entries,eventType,options);
}

function ownerGraveForItem(item, fallbackIsLocal) {
  return zoneForCardOwner(item?.card, state.localGraveyard, state.rivalGraveyard, !!fallbackIsLocal, state.currentMatch?.myRole || null);
}

function ownerExileForItem(item, fallbackIsLocal) {
  return zoneForCardOwner(item?.card, state.localExile, state.rivalExile, !!fallbackIsLocal, state.currentMatch?.myRole || null);
}

function replacementCardZonePlan(card, fallbackIsLocal, zoneFrom, zoneTo='graveyard', cause='effect', extra={}) {
  const ownerIsLocal=cardOwnerIsLocal(card,!!fallbackIsLocal,state.currentMatch?.myRole||null);
  const result=resolveReplacementEvent(state,{
    type:'zone_change', affectedIsLocal:ownerIsLocal, targetIsLocal:ownerIsLocal,
    card:card || null, targetCard:card || null,
    item:extra.item || null, targetItem:extra.item || null,
    sourceCard:extra.sourceCard || null, sourceIsLocal:extra.sourceIsLocal,
    zoneFrom, zoneTo, cause
  });
  const finalZone=result.event.zoneTo || zoneTo;
  const destination=finalZone==='exile'
    ? zoneForCardOwner(card,state.localExile,state.rivalExile,!!fallbackIsLocal,state.currentMatch?.myRole||null)
    : zoneForCardOwner(card,state.localGraveyard,state.rivalGraveyard,!!fallbackIsLocal,state.currentMatch?.myRole||null);
  return {result,zoneTo:finalZone,destination,ownerIsLocal};
}

function replacementExitPlan(item, fallbackIsLocal, cause='effect', zoneTo='graveyard') {
  return replacementCardZonePlan(item?.card, fallbackIsLocal, 'battlefield', zoneTo, cause, {item});
}

function replacementDestroyExitPlan(item, fallbackIsLocal, cause='destroy') {
  const destroyResult=resolveReplacementEvent(state,{
    type:'destroy', affectedIsLocal:!!fallbackIsLocal, targetIsLocal:!!fallbackIsLocal,
    card:item?.card || null, targetCard:item?.card || null, item, targetItem:item,
    zoneFrom:'battlefield', zoneTo:'graveyard', cause
  });
  dispatchReplacementCounterRemoval(destroyResult,item,{controllerIsLocal:!!fallbackIsLocal,actorIsLocal:!!fallbackIsLocal});
  if(destroyResult.prevented) return {prevented:true,result:destroyResult,zoneTo:'battlefield',destination:null};
  const exitPlan=replacementExitPlan(item,fallbackIsLocal,cause,destroyResult.event.zoneTo || 'graveyard');
  return {...exitPlan,prevented:false,result:{...exitPlan.result,applied:[...(destroyResult.applied||[]),...(exitPlan.result.applied||[])]}};
}

function removeSbaCreature(entry, watchersSnapshot) {
  const { item, isLocal, reason }=entry;
  const zone=isLocal ? state.localCombat : state.rivalCombat;
  const idx=zone.indexOf(item); if(idx<0) return {removed:false};
  // Resistencia <=0 no es destrucción; daño letal/Toque mortal sí. Luego, en ambos casos,
  // el movimiento al cementerio puede ser reemplazado por otra zona.
  const plan=(reason==='lethal_damage' || reason==='deathtouch')
    ? replacementDestroyExitPlan(item,isLocal,reason)
    : replacementExitPlan(item,isLocal,reason,'graveyard');
  if(plan.prevented) return {removed:false,prevented:true};
  zone.splice(idx,1);
  detachEquipmentFrom(item,isLocal); sendAurasToGraveyard(item,isLocal); cleanupIfVehicle(item);
  moveBattlefieldCardToZone(item.card,plan.destination);
  logMsg(gameText(`sba.${reason}`,{card:item.card?.name || 'Criatura'}));
  return {removed:true,died:plan.zoneTo==='graveyard',zoneTo:plan.zoneTo,item,isLocal};
}

function removeSbaPlaneswalker(entry) {
  const zone=entry.isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
  const idx=zone.indexOf(entry.item); if(idx<0) return {removed:false};
  const plan=replacementExitPlan(entry.item,entry.isLocal,'planeswalker_zero','graveyard');
  zone.splice(idx,1); moveBattlefieldCardToZone(entry.item.card,plan.destination);
  logMsg(gameText('sba.planeswalkerZero',{card:entry.item.card?.name || 'Planeswalker'}));
  return {removed:true,zoneTo:plan.zoneTo,item:entry.item,isLocal:entry.isLocal};
}

function removeSbaSaga(entry, watchersSnapshot) {
  const loc=findBattlefieldItemLocation(entry.item);
  if(!loc) return {removed:false};
  const isCreature=loc.zoneName==='combat';
  const plan=replacementExitPlan(entry.item,loc.isLocal,'saga_complete','graveyard');
  loc.zone.splice(loc.index,1);
  if(isCreature){ detachEquipmentFrom(entry.item,loc.isLocal); sendAurasToGraveyard(entry.item,loc.isLocal); cleanupIfVehicle(entry.item); }
  moveBattlefieldCardToZone(entry.item.card,plan.destination);
  logMsg(gameText('saga.completed',{card:entry.item.card?.name || 'Saga',lore:entry.lore,chapter:entry.finalChapter}));
  const entries=buildGenericEventTriggerEntries({
    type:'permanent_sacrificed',controllerIsLocal:loc.isLocal,actorIsLocal:loc.isLocal,
    ownerIsLocal:cardOwnerIsLocal(entry.item.card,loc.isLocal,state.currentMatch?.myRole||null),
    card:entry.item.card,item:entry.item,zoneFrom:'battlefield',zoneTo:plan.zoneTo,cause:'saga_complete'
  },{watchersSnapshot});
  if(plan.zoneTo==='exile') entries.push(...buildGenericEventTriggerEntries({
    type:'card_exiled',controllerIsLocal:loc.isLocal,actorIsLocal:loc.isLocal,
    ownerIsLocal:cardOwnerIsLocal(entry.item.card,loc.isLocal,state.currentMatch?.myRole||null),
    card:entry.item.card,item:entry.item,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
  },{watchersSnapshot}));
  return {removed:true,died:isCreature && plan.zoneTo==='graveyard',zoneTo:plan.zoneTo,item:entry.item,isLocal:loc.isLocal,triggerEntries:entries};
}

async function chooseLegendKeeper(group) {
  if (!group?.entries?.length) return null;
  const remembered=sbaLegendChoiceMemory.get(group.key);
  if (remembered) {
    const hit=group.entries.find(e=>e.item?._syncObjectId===remembered);
    if(hit) return hit;
  }
  if (group.isLocal) {
    state.pendingLegendChoice={ groupKey:group.key, cardName:group.name, count:group.entries.length };
    try {
      const chosen=await showLegendRuleChoiceModal(group.entries,group.name);
      if(chosen?.item?._syncObjectId) sbaLegendChoiceMemory.set(group.key,chosen.item._syncObjectId);
      return chosen || group.entries[0];
    } finally { state.pendingLegendChoice=null; }
  }
  if (state.currentMatch) {
    const response=await requestRivalDecision('legend_choice',otherRole(state.currentMatch.myRole),{
      cardName:group.name,
      entries:group.entries.map((e,i)=>({index:i,syncObjectId:e.item?._syncObjectId || null,zone:e.zone}))
    });
    return group.entries[Number(response?.index)] || group.entries[0];
  }
  return group.entries[0];
}

function removeLegendEntry(entry, watchersSnapshot) {
  const loc=findBattlefieldItemLocation(entry.item); if(!loc) return {removed:false};
  const wasCreature=loc.zoneName==='combat';
  const plan=replacementExitPlan(entry.item,loc.isLocal,'legend_rule','graveyard');
  loc.zone.splice(loc.index,1);
  if(wasCreature){ detachEquipmentFrom(entry.item,loc.isLocal); sendAurasToGraveyard(entry.item,loc.isLocal); cleanupIfVehicle(entry.item); }
  moveBattlefieldCardToZone(entry.item.card,plan.destination);
  logMsg(gameText('sba.legend.moved',{card:entry.item.card?.name || 'Legendaria'}));
  return {removed:true,died:wasCreature && plan.zoneTo==='graveyard',zoneTo:plan.zoneTo,item:entry.item,isLocal:loc.isLocal,wasCreature};
}

export function hasStateBasedActionsToProcess() {
  const snap=evaluateStateBasedActions(state,{getEffectiveToughness,hasKeyword,getProtectionMatch,hasPendingSagaChapter});
  return hasMechanicalStateActions(snap) || (snap.legends||[]).length>0;
}

export async function runStateBasedActions({ reason='rules_check' }={}) {
  if(state.sbaKernelRunning) return false;
  state.sbaKernelRunning=true;
  let changed=false;
  try {
    for(let pass=0; pass<SBA_MAX_PASSES; pass++){
      const snap=evaluateStateBasedActions(state,{getEffectiveToughness,hasKeyword,getProtectionMatch,hasPendingSagaChapter});
      const legends=snap.legends||[];
      if(!hasMechanicalStateActions(snap) && legends.length===0) break;
      const watchersSnapshot=[...state.localCombat.map(unit=>({unit,isLocal:true})),...state.rivalCombat.map(unit=>({unit,isLocal:false}))];
      const genericWatchersSnapshot=genericBattlefieldWatchers();
      const deaths=[];
      const nonCreatureLeaveEntries=[];
      // Legend rule choices are decisions made before this SBA batch is applied.
      for(const group of legends){
        const keeper=await chooseLegendKeeper(group);
        for(const entry of group.entries){
          if(entry===keeper) continue;
          const result=removeLegendEntry(entry,watchersSnapshot);
          if(!result.removed) continue;
          changed=true;
          if(result.died) deaths.push({unit:result.item,isLocal:result.isLocal});
          else nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
            type:'permanent_left_battlefield',controllerIsLocal:result.isLocal,actorIsLocal:result.isLocal,
            ownerIsLocal:cardOwnerIsLocal(result.item.card,result.isLocal,state.currentMatch?.myRole||null),
            card:result.item.card,item:result.item,zoneFrom:'battlefield',zoneTo:result.zoneTo,cause:'legend_rule'
          }, {watchersSnapshot:genericWatchersSnapshot}));
          if(result.zoneTo==='exile') nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
            type:'card_exiled',controllerIsLocal:result.isLocal,actorIsLocal:result.isLocal,
            ownerIsLocal:cardOwnerIsLocal(result.item.card,result.isLocal,state.currentMatch?.myRole||null),
            card:result.item.card,item:result.item,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
          }, {watchersSnapshot:genericWatchersSnapshot}));
        }
      }
      for(const entry of snap.sagas||[]){
        if(!findBattlefieldItemLocation(entry.item)) continue;
        const result=removeSbaSaga(entry,genericWatchersSnapshot);
        if(!result.removed) continue;
        changed=true;
        if(result.died) deaths.push({unit:result.item,isLocal:result.isLocal});
        nonCreatureLeaveEntries.push(...(result.triggerEntries||[]));
      }
      for(const entry of snap.creatures||[]){
        if(!findBattlefieldItemLocation(entry.item)) continue;
        const result=removeSbaCreature(entry,watchersSnapshot);
        if(!result.removed) continue;
        changed=true;
        if(result.died) deaths.push({unit:entry.item,isLocal:entry.isLocal});
        else {
          nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
            type:'permanent_left_battlefield',controllerIsLocal:entry.isLocal,actorIsLocal:entry.isLocal,
            ownerIsLocal:cardOwnerIsLocal(entry.item.card,entry.isLocal,state.currentMatch?.myRole||null),
            card:entry.item.card,item:entry.item,zoneFrom:'battlefield',zoneTo:result.zoneTo,cause:entry.reason
          }, {watchersSnapshot:genericWatchersSnapshot}));
          if(result.zoneTo==='exile') nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
            type:'card_exiled',controllerIsLocal:entry.isLocal,actorIsLocal:entry.isLocal,
            ownerIsLocal:cardOwnerIsLocal(entry.item.card,entry.isLocal,state.currentMatch?.myRole||null),
            card:entry.item.card,item:entry.item,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
          }, {watchersSnapshot:genericWatchersSnapshot}));
        }
      }
      for(const entry of snap.planeswalkers||[]){
        if(!findBattlefieldItemLocation(entry.item)) continue;
        const result=removeSbaPlaneswalker(entry);
        if(!result.removed) continue;
        changed=true;
        nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
          type:'permanent_left_battlefield',controllerIsLocal:entry.isLocal,actorIsLocal:entry.isLocal,
          ownerIsLocal:cardOwnerIsLocal(entry.item.card,entry.isLocal,state.currentMatch?.myRole||null),
          card:entry.item.card,item:entry.item,zoneFrom:'battlefield',zoneTo:result.zoneTo,cause:'planeswalker_zero'
        }, {watchersSnapshot:genericWatchersSnapshot}));
        if(result.zoneTo==='exile') nonCreatureLeaveEntries.push(...buildGenericEventTriggerEntries({
          type:'card_exiled',controllerIsLocal:entry.isLocal,actorIsLocal:entry.isLocal,
          ownerIsLocal:cardOwnerIsLocal(entry.item.card,entry.isLocal,state.currentMatch?.myRole||null),
          card:entry.item.card,item:entry.item,zoneFrom:'battlefield',zoneTo:'exile',cause:'replacement'
        }, {watchersSnapshot:genericWatchersSnapshot}));
      }
      for(const action of snap.counterCancellations||[]){
        const c=action.item.counters||{}; c.plusOne=Math.max(0,Number(c.plusOne||0)-action.amount); c.minusOne=Math.max(0,Number(c.minusOne||0)-action.amount); action.item.counters=c; changed=true;
        logMsg(gameText('sba.counterCancel',{card:action.item.card?.name || 'Permanente',count:action.amount}));
      }
      // Remove tokens from hidden/public nonbattlefield zones back-to-front.
      const byZone=new Map(); for(const action of snap.tokenCeases||[]){ if(!byZone.has(action.zone))byZone.set(action.zone,[]);byZone.get(action.zone).push(action); }
      for(const [zone,actions] of byZone){ actions.sort((a,b)=>b.index-a.index).forEach(a=>{ if(zone[a.index]?.isToken){zone.splice(a.index,1);changed=true;logMsg(gameText('sba.tokenCeases',{card:a.card?.name||'Ficha'}));} }); }
      if(deaths.length) queueCreatureDeathBatch(deaths,watchersSnapshot,nonCreatureLeaveEntries);
      else if(nonCreatureLeaveEntries.length) queueTriggeredAbilities(nonCreatureLeaveEntries);
      // Attachments are SBA too; these helpers are idempotent and may mutate.
      if (checkAuraLegality() > 0) changed = true;
      if (checkEquipmentLegality() > 0) changed = true;
    }
  } finally {
    state.sbaKernelRunning=false;
  }
  await flushSbaHeldTriggers();
  recordTelemetryEvent('sba_stabilized',{reason,changed});
  return changed;
}

export async function waitForStateBasedActions(){
  while(state.sbaKernelRunning || state.pendingLegendChoice || state.pendingTriggerOrderChoice) await sleep(10);
  await waitForTriggerOrdering();
  // Una habilidad de capítulo que no pudo adquirir objetivo puede desaparecer durante el
  // ordenamiento. Rechequeamos SBA antes de devolver prioridad para que la Saga finalizada
  // no quede viva sólo porque su último capítulo nunca llegó a Stack.
  if(!state.sbaKernelRunning && hasStateBasedActionsToProcess()) {
    await runStateBasedActions({reason:'post_trigger_ordering'});
  }
}

// Multiplayer helper name retained as explicit contract: the local client is always the
// authority for its own non-priority Legend Rule choice.
export async function applyLocalLegendChoiceForMultiplayer(group){ return chooseLegendKeeper(group); }

export function collectCreatureEtbBatchEntries(isLocal, entries = []) {
  const combat=isLocal?state.localCombat:state.rivalCombat, support=isLocal?state.localSupport:state.rivalSupport,
    lands=isLocal?state.localLands:state.rivalLands, pws=isLocal?state.localPlaneswalkers:state.rivalPlaneswalkers;
  const watchers=[...combat,...support,...lands,...pws].filter(item=>item?.card?.creatureEtbTrigger);
  const queued=entries.flatMap(({card,item})=>watchers.map(w=>({effect:w.card.creatureEtbTrigger,sourceCard:w.card,sourceItem:w,isLocal,triggerType:'creature_etb',eventCard:card,eventItem:item})));
  for(const {card,item} of entries) queued.push(...buildGenericEventTriggerEntries({ type:'creature_entered', controllerIsLocal:isLocal, ownerIsLocal:cardOwnerIsLocal(card,isLocal,state.currentMatch?.myRole||null), card, item, zoneFrom:'unknown', zoneTo:'battlefield' }));
  return queued;
}
export function triggerCreatureEtbBatch(isLocal, entries = []) {
  return queueTriggeredAbilities(collectCreatureEtbBatchEntries(isLocal,entries));
}
export function collectLandEtbBatchEntries(isLocal, entries = []) {
  const all=[...(isLocal?state.localCombat:state.rivalCombat),...(isLocal?state.localSupport:state.rivalSupport),...(isLocal?state.localLands:state.rivalLands),...(isLocal?state.localPlaneswalkers:state.rivalPlaneswalkers)];
  const watchers=all.filter(item=>item?.card?.landEtbTrigger && !(isLandPermanent(item)&&landRulesTextSuppressed(state,item,isLocal)));
  const queued=entries.flatMap(({card,item})=>watchers.map(w=>({effect:w.card.landEtbTrigger,sourceCard:w.card,sourceItem:w,isLocal,triggerType:'land_etb',eventCard:card,eventItem:item})));
  for(const {card,item} of entries) queued.push(...buildGenericEventTriggerEntries({ type:'land_entered', controllerIsLocal:isLocal, ownerIsLocal:cardOwnerIsLocal(card,isLocal,state.currentMatch?.myRole||null), card, item, zoneFrom:'unknown', zoneTo:'battlefield' }));
  return queued;
}
export function triggerLandEtbBatch(isLocal, entries = []) {
  return queueTriggeredAbilities(collectLandEtbBatchEntries(isLocal,entries));
}

// "Siempre que una criatura entre bajo tu control". Detecta y APILA; no resuelve.
export function triggerCreatureEtb(isLocal, enteredCard = null, enteredItem = null) {
  // Un watcher de ETB puede ser cualquier permanente propio, no sólo un Encantamiento/Artefacto
  // en Soporte. Esto es especialmente importante para criaturas como Campanera de la Procesión:
  // cuando entra al campo ya está en Combat y debe poder ver su propia entrada y las siguientes.
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const planeswalkers = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
  const watchers = [...combat, ...support, ...lands, ...planeswalkers]
    .filter(item => item?.card?.creatureEtbTrigger);
  const entries=watchers.map(item => ({
    effect: item.card.creatureEtbTrigger, sourceCard: item.card, sourceItem: item, isLocal,
    triggerType: 'creature_etb', eventCard: enteredCard, eventItem: enteredItem
  }));
  entries.push(...buildGenericEventTriggerEntries({
    type:'creature_entered', controllerIsLocal:isLocal,
    ownerIsLocal:cardOwnerIsLocal(enteredCard,isLocal,state.currentMatch?.myRole||null),
    card:enteredCard, item:enteredItem, zoneFrom:'unknown', zoneTo:'battlefield'
  }));
  return queueTriggeredAbilities(entries);
}

// PUNTO 2 PRE-500 — LANDFALL / "cuando una Tierra entre bajo tu control".
// Contrato JSON opt-in y retrocompatible:
//   "landEtbTrigger": { "type": "draw", "amount": 1 }
// Ninguna carta actual necesita este campo. El evento se dispara tanto al jugar una Tierra
// desde la mano como cuando un efecto de Ramp la pone directamente en el campo.
//
// Tomamos un SNAPSHOT de los permanentes que ya estaban presentes justo después de entrar
// la Tierra. Así cada uno dispara una sola vez por esa entrada, aunque una resolución previa
// quite a otro watcher del campo, y un permanente que aparezca DURANTE la resolución no puede
// "ver hacia atrás" una Tierra que entró antes que él.
//
// Landfall no abre selección de target propia en este punto: reutiliza efectos discretos que
// el resolver universal sabe ejecutar SIN objetivo (draw, drain, tokens, ramp, scry, etc.).
// Si algún JSON futuro intenta usar un efecto que exige target, lo rechazamos con log explícito
// en vez de fallar silenciosamente.
export async function triggerLandEtb(isLocal, landCard, landItem = null) {
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const planeswalkers = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;

  const watchers = [
    ...combat.map(item => ({ card: item.card, item })),
    ...support.map(item => ({ card: item.card, item })),
    ...lands.map(item => ({ card: item.card, item })),
    ...planeswalkers.map(item => ({ card: item.card, item }))
  ].filter(entry => {
    if (!entry.card || !entry.card.landEtbTrigger) return false;
    if (isLandPermanent(entry.item) && landRulesTextSuppressed(state, entry.item, isLocal)) return false;
    return true;
  });

  const entries = [];
  for (const { card, item } of watchers) {
    const effect = card.landEtbTrigger;
    const implicitSelfCreature = ['add_counter', 'pump', 'grant_keyword_temp'].includes(effect.type)
      && combat.includes(item);
    const implicitTarget = implicitSelfCreature ? { type: 'creature', isLocal, item } : null;

    if (!implicitTarget && !canResolveGameEffectWithoutTarget(effect.type)) {
      logMsg(`⚠️ ${card.name}: su landEtbTrigger usa "${effect.type}", que necesita elegir un objetivo externo o no es válido en Landfall.`);
      continue;
    }

    logMsg(gameText('trigger.landfall', { card: card.name, land: landCard?.name || 'una Tierra' }));
    entries.push({
      effect, sourceCard: card, sourceItem: item, isLocal, targetObj: implicitTarget,
      selfTarget: implicitSelfCreature, triggerType: 'land_etb', eventCard: landCard, eventItem: landItem
    });
  }
  entries.push(...buildGenericEventTriggerEntries({
    type:'land_entered', controllerIsLocal:isLocal,
    ownerIsLocal:cardOwnerIsLocal(landCard,isLocal,state.currentMatch?.myRole||null),
    card:landCard, item:landItem, zoneFrom:'unknown', zoneTo:'battlefield'
  }));
  return queueTriggeredAbilities(entries);
}

// PUNTO 3 PRE-500 — SPELLSLINGER / "cuando casteás un Instantáneo o Conjuro".
// Contrato JSON recomendado (opt-in y retrocompatible):
//   "spellCastTrigger": {
//     "filter": "instant_or_sorcery",
//     "effect": { "type": "draw", "amount": 1 }
//   }
//
// También aceptamos defensivamente la forma corta estilo Landfall
//   "spellCastTrigger": { "type": "draw", "amount": 1 }
// que equivale al filtro default instant_or_sorcery. Ninguna carta actual usa este campo.
//
// El evento ocurre DESPUÉS de que el hechizo ya entró a la pila. Por eso un hechizo que
// más tarde sea contrarrestado igualmente ya disparó estos watchers. No se dispara al
// seleccionar/pagar la carta, ni por habilidades activadas, ni por permanentes con Flash:
// el filtro mira el TIPO REAL de la carta casteada.
export function spellCastTriggerMatches(castCard, filter = 'instant_or_sorcery') {
  if (!castCard || typeof castCard.type !== 'string') return false;
  const isInstant = castCard.type.includes('Instantáneo');
  const isSorcery = castCard.type.includes('Conjuro');
  if (filter === 'instant') return isInstant;
  if (filter === 'sorcery') return isSorcery;
  if (filter === 'instant_or_sorcery') return isInstant || isSorcery;
  return false;
}

export async function triggerSpellCast(isLocal, castCard, stackItem = null) {
  if (!castCard) return [];
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const planeswalkers = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;

  const watchers = [
    ...combat.map(item => ({ card: item.card, item })),
    ...support.map(item => ({ card: item.card, item })),
    ...lands.map(item => ({ card: item.card, item })),
    ...planeswalkers.map(item => ({ card: item.card, item }))
  ].filter(entry => entry.card && entry.card.spellCastTrigger && !(isLandPermanent(entry.item) && landRulesTextSuppressed(state, entry.item, isLocal)));

  const entries = [];
  for (const { card, item } of watchers) {
    const spec = card.spellCastTrigger;
    const filter = spec.filter || 'instant_or_sorcery';
    const effect = spec.effect || (spec.type ? spec : null);
    if (!['instant_or_sorcery', 'instant', 'sorcery'].includes(filter)) {
      logMsg(`⚠️ ${card.name}: spellCastTrigger usa el filtro desconocido "${filter}".`);
      continue;
    }
    if (!spellCastTriggerMatches(castCard, filter)) continue;
    if (!effect || !effect.type) {
      logMsg(`⚠️ ${card.name}: spellCastTrigger no tiene un effect válido.`);
      continue;
    }

    const implicitSelfCreature = ['add_counter', 'pump', 'grant_keyword_temp'].includes(effect.type)
      && combat.includes(item);
    const implicitTarget = implicitSelfCreature ? { type: 'creature', isLocal, item } : null;
    if (!implicitTarget && !canResolveGameEffectWithoutTarget(effect.type)) {
      logMsg(`⚠️ ${card.name}: su spellCastTrigger usa "${effect.type}", que necesita elegir un objetivo externo o no es válido en Spellslinger.`);
      continue;
    }

    logMsg(gameText('trigger.spellslinger', { card: card.name, spell: castCard.name }));
    entries.push({
      effect, sourceCard: card, sourceItem: item, isLocal, targetObj: implicitTarget,
      selfTarget: implicitSelfCreature, triggerType: 'spell_cast', eventCard: castCard, eventItem: stackItem
    });
  }
  const castEvent={
    type:'spell_cast', controllerIsLocal:isLocal,
    ownerIsLocal:cardOwnerIsLocal(castCard,isLocal,state.currentMatch?.myRole||null),
    card:castCard, item:stackItem,
    zoneFrom:['flashback','escape'].includes(stackItem?.castFrom) ? 'graveyard' : (['exile','suspend'].includes(stackItem?.castFrom) ? 'exile' : 'hand'),
    zoneTo:'stack', cause:stackItem?.castFrom || 'normal_cast'
  };
  entries.push(...buildGenericEventTriggerEntries(castEvent));
  // 23.16.2: evento especializado opt-in para payoffs de "cuando casteás desde Exilio".
  // Sigue siendo además spell_cast: no duplica el casteo, sólo ofrece un predicado más fino.
  if(['exile','suspend'].includes(stackItem?.castFrom)) {
    const exileMetadata={permissionId:stackItem?.exilePermissionId||null,isLand:false,suspend:stackItem?.castFrom==='suspend'};
    entries.push(...buildGenericEventTriggerEntries({
      ...castEvent,type:'cast_from_exile',cause:stackItem?.castFrom === 'suspend' ? 'suspend' : 'exile_permission',metadata:exileMetadata
    }));
    entries.push(...buildGenericEventTriggerEntries({
      ...castEvent,type:'card_played_from_exile',cause:stackItem?.castFrom === 'suspend' ? 'suspend' : 'exile_permission',metadata:exileMetadata
    }));
  }
  return queueTriggeredAbilities(entries);
}

// 23.13.33 — anyCreatureDiesTrigger es un trigger de PERMANENTE, no sólo de criatura.
// Los watchers criatura necesitan snapshot previo a las muertes; Soporte/Tierras/PW no salen
// del campo por una muerte de criatura y se pueden recolectar directamente. Esto permite que
// Encantamientos como Velorio bajo el Ceibo/Mesa Larga funcionen sin inventar schema nuevo.
function getNonCreatureAnyDeathWatchers() {
  return [
    ...state.localSupport.map(unit => ({ unit, isLocal: true })),
    ...state.rivalSupport.map(unit => ({ unit, isLocal: false })),
    ...state.localLands.map(unit => ({ unit, isLocal: true })),
    ...state.rivalLands.map(unit => ({ unit, isLocal: false })),
    ...state.localPlaneswalkers.map(unit => ({ unit, isLocal: true })),
    ...state.rivalPlaneswalkers.map(unit => ({ unit, isLocal: false }))
  ].filter(({ unit, isLocal }) => unit?.card?.anyCreatureDiesTrigger && !(isLandPermanent(unit) && landRulesTextSuppressed(state, unit, isLocal)));
}

// Lote de muertes simultáneas. Todos los disparos del mismo evento se recolectan ANTES de
// apilarse, usando el snapshot previo a las muertes. Esto evita que un Blood-Artist-like que
// también murió deje de "ver" a las otras criaturas y, además, permite aplicar AP/NAP al
// conjunto completo en vez de apilar muerte por muerte según el orden accidental de arrays.
export function queueCreatureDeathBatch(deadEntries = [], watchersSnapshot = null, extraEntries = []) {
  const dead = (deadEntries || []).filter(entry => entry?.unit?.card);
  if (dead.length === 0) return (extraEntries || []).length ? queueTriggeredAbilities(extraEntries) : [];
  const snapshot = watchersSnapshot || [
    ...state.localCombat.map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.map(unit => ({ unit, isLocal: false })),
    ...dead.filter(entry => !state.localCombat.includes(entry.unit) && !state.rivalCombat.includes(entry.unit))
  ];
  const entries = [...(extraEntries || [])];
  const nonCreatureAnyDeathWatchers = getNonCreatureAnyDeathWatchers();

  for (const { unit, isLocal } of dead) {
    if (unit.card.diesTrigger && !(isLandPermanent(unit) && landRulesTextSuppressed(state, unit, isLocal))) {
      entries.push({
        effect: unit.card.diesTrigger, sourceCard: unit.card, sourceItem: unit, isLocal,
        triggerType: 'dies', eventCard: unit.card, eventItem: unit
      });
    }

    const watcherIsLocal = !isLocal;
    // opponentDeathTrigger puede vivir en cualquier permanente. Los watchers de Combat salen
    // del snapshot PREVIO a la muerte para que incluso uno que muere simultáneamente alcance a
    // ver la muerte rival; Soporte/Tierras/PW siguen vivos fuera de ese snapshot de criaturas.
    const watcherSupport = watcherIsLocal ? state.localSupport : state.rivalSupport;
    const watcherLands = watcherIsLocal ? state.localLands : state.rivalLands;
    const watcherPlaneswalkers = watcherIsLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
    [...watcherSupport, ...watcherLands, ...watcherPlaneswalkers].forEach(item => {
      if (!item.card?.opponentDeathTrigger || (isLandPermanent(item) && landRulesTextSuppressed(state, item, watcherIsLocal))) return;
      entries.push({
        effect: item.card.opponentDeathTrigger, sourceCard: item.card, sourceItem: item,
        isLocal: watcherIsLocal, triggerType: 'opponent_death', eventCard: unit.card, eventItem: unit
      });
    });
    snapshot.forEach(({ unit: watcher, isLocal: watcherLocal }) => {
      if (watcherLocal !== watcherIsLocal || !watcher?.card?.opponentDeathTrigger || (isLandPermanent(watcher) && landRulesTextSuppressed(state, watcher, watcherLocal))) return;
      entries.push({
        effect: watcher.card.opponentDeathTrigger, sourceCard: watcher.card, sourceItem: watcher,
        isLocal: watcherLocal, triggerType: 'opponent_death', eventCard: unit.card, eventItem: unit
      });
    });

    snapshot.forEach(({ unit: watcher, isLocal: watcherLocal }) => {
      if (!watcher?.card?.anyCreatureDiesTrigger || (isLandPermanent(watcher) && landRulesTextSuppressed(state, watcher, watcherLocal))) return;
      entries.push({
        effect: watcher.card.anyCreatureDiesTrigger, sourceCard: watcher.card, sourceItem: watcher,
        isLocal: watcherLocal, triggerType: 'any_creature_dies', eventCard: unit.card, eventItem: unit
      });
    });
    nonCreatureAnyDeathWatchers.forEach(({ unit: watcher, isLocal: watcherLocal }) => {
      entries.push({
        effect: watcher.card.anyCreatureDiesTrigger, sourceCard: watcher.card, sourceItem: watcher,
        isLocal: watcherLocal, triggerType: 'any_creature_dies', eventCard: unit.card, eventItem: unit
      });
    });
    entries.push(...buildGenericEventTriggerEntries({
      type:'creature_died', controllerIsLocal:isLocal,
      ownerIsLocal:cardOwnerIsLocal(unit.card,isLocal,state.currentMatch?.myRole||null),
      card:unit.card, item:unit, zoneFrom:'battlefield', zoneTo:'graveyard', cause:'death'
    }, { watchersSnapshot:snapshot }));
  }
  if (shouldDeferLandManaTriggers()) {
    state.deferredLandManaTriggers.push(...entries);
    return entries.map(entry=>({deferred:true,sourceCard:entry.sourceCard}));
  }
  return queueTriggeredAbilities(entries);
}

// Habilidad Disparada: "Cuando esta criatura muera..." (la de la criatura misma, no importa
// cómo haya muerto — combate, un removal, o el día de mañana un sacrificio). Es la contraparte
// de triggerCreatureEtb, pero para la salida en vez de la entrada.
export function triggerCreatureDies(unit, isLocal) {
  if (!unit?.card) return null;
  const entries=[];
  const trig = unit.card.diesTrigger;
  if (trig && !(isLandPermanent(unit) && landRulesTextSuppressed(state, unit, isLocal))) entries.push({
    effect: trig, sourceCard: unit.card, sourceItem: unit, isLocal, triggerType: 'dies',
    eventCard: unit.card, eventItem: unit
  });
  entries.push(...buildGenericEventTriggerEntries({
    type:'creature_died', controllerIsLocal:isLocal,
    ownerIsLocal:cardOwnerIsLocal(unit.card,isLocal,state.currentMatch?.myRole||null),
    card:unit.card, item:unit, zoneFrom:'battlefield', zoneTo:'graveyard', cause:'death'
  }, { watchersSnapshot:[{unit,isLocal}] }));
  return queueTriggeredAbilities(entries);
}

// "Muere cualquier criatura" / "muere criatura rival". El snapshot preserva watchers de
// un evento simultáneo aunque sus fuentes también hayan muerto. Ahora todos se APILAN.
export function triggerAnyCreatureDeath(deadUnit, deadUnitIsLocal, watchersSnapshot = null) {
  const entries = [];

  const watcherIsLocal = !deadUnitIsLocal;
  const watcherSupport = watcherIsLocal ? state.localSupport : state.rivalSupport;
  const watcherLands = watcherIsLocal ? state.localLands : state.rivalLands;
  const watcherPlaneswalkers = watcherIsLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
  [...watcherSupport, ...watcherLands, ...watcherPlaneswalkers].forEach(item => {
    const trig = item.card?.opponentDeathTrigger;
    if (!trig || (isLandPermanent(item) && landRulesTextSuppressed(state, item, watcherIsLocal))) return;
    entries.push({
      effect: trig, sourceCard: item.card, sourceItem: item, isLocal: watcherIsLocal,
      triggerType: 'opponent_death', eventCard: deadUnit?.card, eventItem: deadUnit
    });
  });

  const watchers = watchersSnapshot || [
    ...state.localCombat.filter(u => u !== deadUnit).map(u => ({ unit: u, isLocal: true })),
    ...state.rivalCombat.filter(u => u !== deadUnit).map(u => ({ unit: u, isLocal: false })),
    ...(deadUnit ? [{ unit: deadUnit, isLocal: deadUnitIsLocal }] : [])
  ];
  watchers.forEach(({ unit, isLocal }) => {
    if (isLocal === watcherIsLocal) {
      const opponentTrig = unit?.card?.opponentDeathTrigger;
      if (opponentTrig && !(isLandPermanent(unit) && landRulesTextSuppressed(state, unit, isLocal))) entries.push({
        effect: opponentTrig, sourceCard: unit.card, sourceItem: unit, isLocal,
        triggerType: 'opponent_death', eventCard: deadUnit?.card, eventItem: deadUnit
      });
    }
    const trig = unit?.card?.anyCreatureDiesTrigger;
    if (!trig || (isLandPermanent(unit) && landRulesTextSuppressed(state, unit, isLocal))) return;
    entries.push({
      effect: trig, sourceCard: unit.card, sourceItem: unit, isLocal,
      triggerType: 'any_creature_dies', eventCard: deadUnit?.card, eventItem: deadUnit
    });
  });
  getNonCreatureAnyDeathWatchers().forEach(({ unit, isLocal }) => {
    entries.push({
      effect: unit.card.anyCreatureDiesTrigger, sourceCard: unit.card, sourceItem: unit, isLocal,
      triggerType: 'any_creature_dies', eventCard: deadUnit?.card, eventItem: deadUnit
    });
  });

  return queueTriggeredAbilities(entries);
}

// --- EQUIPAMIENTO REAL (Equip) ---
// Devuelve los items de la zona de soporte (Equipos) adjuntos a esta criatura.
function sameAttachmentBattlefieldObject(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aId = a._syncObjectId || a._syncDescriptor?.syncObjectId || null;
  const bId = b._syncObjectId || b._syncDescriptor?.syncObjectId || null;
  return !!aId && !!bId && aId === bId;
}

export function getEquipmentOn(itemObj) {
  // 23.15.2: cambiar el control de una criatura NO cambia el control de sus Equipos.
  // Por eso un Equipo puede estar en la zona de soporte del otro jugador y seguir adjunto.
  return [...(state.localSupport||[]),...(state.rivalSupport||[])]
    .filter(s => s && sameAttachmentBattlefieldObject(s.attachedTo, itemObj));
}

// Cuando una criatura sale del campo de batalla por cualquier vía (muerte, rebote,
// destrucción, arrasada), el Equipo que tuviera puesto se cae y se queda en tu campo:
// nunca va al cementerio con la criatura.
export function detachEquipmentFrom(creatureItem, isLocal) {
  [...(state.localSupport||[]),...(state.rivalSupport||[])].forEach(s => {
    if (sameAttachmentBattlefieldObject(s.attachedTo, creatureItem)) {
      logMsg(gameText('attachment.equipment.detached', { equipment: s.card.name }));
      s.attachedTo = null;
    }
  });
}

// Cuando una criatura sale del campo por CUALQUIER vía que no sea "morir en combate"
// (rebote, sacrificio, un removal puntual, un arrase total), sus Auras —y los contadores
// +1/+1, que hoy viven en ese mismo array— no pueden seguir existiendo sin ella: van al
// cementerio de su dueño, no se pierden de la memoria del juego.
export function sendAurasToGraveyard(unit, isLocal) {
  if (!unit.auras || unit.auras.length === 0) return;
  const myRole = state.currentMatch?.myRole || null;
  unit.auras.forEach(auraCard => {
    // 23.12.2 — el Aura va al cementerio de SU PROPIETARIO, no al del permanente
    // encantado. Esto importa especialmente para maldiciones propias sobre criaturas rivales.
    if (auraCard?._controlEffectId) removeControlEffectFromPermanent(unit, auraCard._controlEffectId, { silent:true });
    const plan=replacementCardZonePlan(auraCard,isLocal,'battlefield','graveyard','aura_detached',{item:null});
    logMsg(gameText('attachment.aura.detached', { aura: auraCard.name, creature: unit.card.name }));
    plan.destination.push(auraCard);
    if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:plan.ownerIsLocal,card:auraCard,zoneFrom:'battlefield',zoneTo:'exile',cause:'aura_detached'});
  });
  unit.auras = [];
}

// SBA (regla real 704.5n): un Aura pegada a un permanente que YA NO es un objetivo legal
// para ella se desprende sola y va al cementerio de su dueño — nadie tiene que destruirla.
// El caso real que puede pasar en este juego: la criatura encantada gana Protección de un
// color que el Aura tiene DESPUÉS de que ya estaba pegada (ej. la equipan con Amuleto
// Bendito mientras ya tenía puesta una Aura Negra) — el chequeo de legalidad que ya existe
// al LANZAR el Aura (getTargetRules) no alcanza para esto, porque es un estado que puede
// cambiar recién más tarde. Se corre junto a checkGameOver en cada render(), como el resto
// de las state-based actions de este motor.
export function checkAuraLegality() {
  let changed = 0;
  const checkZone = (zone, hostIsLocal) => {
    for (const unit of [...(zone||[])]) {
      if (!unit?.auras || unit.auras.length === 0) continue;
      const stillLegal = [];
      for (const auraCard of [...unit.auras]) {
        const illegalColor = getProtectionMatch(unit, auraCard.colors || []);
        const illegalTargetType = !isCreaturePermanent(unit); // contrato actual: todas encantan criatura
        if (illegalColor || illegalTargetType) {
          if (auraCard?._controlEffectId) removeControlEffectFromPermanent(unit, auraCard._controlEffectId, { silent:false });
          if(illegalColor) logMsg(gameText('attachment.aura.protection', { creature: unit.card.name, color: illegalColor, aura: auraCard.name }));
          else logMsg(gameText('attachment.aura.detached', { aura:auraCard.name, creature:unit.card.name }));
          const plan=replacementCardZonePlan(auraCard,hostIsLocal,'battlefield','graveyard','illegal_attachment');
          plan.destination.push(auraCard);
          if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:hostIsLocal,actorIsLocal:hostIsLocal,ownerIsLocal:plan.ownerIsLocal,card:auraCard,zoneFrom:'battlefield',zoneTo:'exile',cause:'illegal_attachment'});
          changed++;
        } else stillLegal.push(auraCard);
      }
      unit.auras = stillLegal;
    }
  };
  for(const [zone,isLocal] of [
    [state.localCombat,true],[state.rivalCombat,false],[state.localSupport,true],[state.rivalSupport,false],
    [state.localLands,true],[state.rivalLands,false],[state.localPlaneswalkers,true],[state.rivalPlaneswalkers,false]
  ]) checkZone(zone,isLocal);
  return changed;
}

// SBA (regla real 704.5m — el caso simétrico de checkAuraLegality de arriba, pero para
// Equipos): un Equipo pegado a una criatura que ganó Protección de su color DESPUÉS de que
// ya estaba puesto también queda ilegalmente adjunto — pero a diferencia de un Aura, un
// Equipo NO va al cementerio (no depende de estar pegado a algo para existir). Se
// desprende solo y se queda como permanente en tu campo, listo para volver a equiparse en
// otra criatura apenas puedas pagar el costo de Equipar de nuevo.
export function checkEquipmentLegality() {
  let changed = 0;
  const checkZone = (supportZone) => {
    for (const item of [...supportZone]) {
      if (!item.attachedTo) continue;
      const loc=findBattlefieldItemLocation(item.attachedTo);
      const illegalTargetType = !loc || !isCreaturePermanent(item.attachedTo);
      const illegalColor = !illegalTargetType ? getProtectionMatch(item.attachedTo, item.card.colors || []) : null;
      if (illegalColor || illegalTargetType) {
        if(illegalColor) logMsg(gameText('attachment.equipment.protection', { creature: item.attachedTo.card.name, color: illegalColor, equipment: item.card.name }));
        else logMsg(gameText('attachment.equipment.detached', { equipment:item.card.name }));
        item.attachedTo = null;
        changed++;
      }
    }
  };
  checkZone(state.localSupport);
  checkZone(state.rivalSupport);
  return changed;
}

// Si un Vehículo tripulado (que "es una criatura hasta el final del turno") sale del campo
// por cualquier camino que no sea llegar a Limpieza normalmente — muere en combate, lo
// sacrifican, lo rebotan, lo arrasa un board wipe — hay que sacarle el power/toughness de
// criatura ACÁ, en el momento, o se queda pegado ese estado (ej. se vería con stats en el
// cementerio o en la mano, como si siguiera siendo una criatura). Se llama junto con
// sendAurasToGraveyard/detachEquipmentFrom en todos los caminos de salida del campo.
export function revertAnimatedLandState(unit) {
  if (!unit?.isAnimatedLand) return false;
  unit.isAnimatedLand = false;
  unit.permanentTypes = ['land'];
  delete unit.animatedBasePower;
  delete unit.animatedBaseToughness;
  delete unit.animationKeywords;
  delete unit.animationUntil;
  unit.summoningSickness = false;
  unit.isAttacking = false;
  unit.blockingIndex = null;
  unit.damageTaken = 0;
  return true;
}

export function animateLandPermanent(unit, isLocal, effect = {}) {
  if (!unit || !isLandPermanent(unit)) return false;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  if (unit.isAnimatedLand && combat.includes(unit)) return true;
  const idx = lands.indexOf(unit);
  if (idx < 0) return false;
  lands.splice(idx, 1);
  unit.isAnimatedLand = true;
  unit.permanentTypes = ['land', 'creature'];
  unit.animatedBasePower = Number(effect.power ?? unit.card?.baseStats?.power ?? 0);
  unit.animatedBaseToughness = Number(effect.toughness ?? unit.card?.baseStats?.toughness ?? 0);
  unit.animationKeywords = [...new Set(effect.keywords || unit.card?.keywords || [])];
  unit.animationUntil = effect.duration || 'end_of_turn';
  unit.damageTaken = unit.damageTaken || 0;
  unit.isAttacking = false;
  unit.blockingIndex = null;
  unit.summoningSickness = !!unit.enteredThisTurn && !unit.animationKeywords.includes('haste') && !hasKeyword(unit, 'haste');
  combat.push(unit);
  recordTelemetryEvent('land_animated', { card: unit.card?.name || null, isLocal, power: unit.animatedBasePower, toughness: unit.animatedBaseToughness, enteredThisTurn: !!unit.enteredThisTurn });
  return true;
}

// Conservamos el nombre histórico porque muchos removals ya llaman este helper. Desde LAND 1
// limpia cualquier estado temporal de "se volvió criatura", sea Vehículo o man-land.
export function cleanupIfVehicle(unit) {
  if (unit?.isAnimatedLand) revertAnimatedLandState(unit);
  if (unit?.isVehicle) {
    delete unit.card.power;
    delete unit.card.toughness;
    unit.isVehicle = false;
    unit.wasLand = false;
  }
}

// PLANESWALKERS: no son criaturas (no atacan ni bloquean), pero SÍ se los puede atacar en
// vez de al jugador. Tienen Lealtad en vez de vida y una sola habilidad de Lealtad por
// turno. Desde 23.9.2 las Loyalty abilities son habilidades activadas REALES: se activan
// sólo con timing de conjuro (tu Main, tu prioridad, Stack vacía), fijan objetivos ANTES de
// pagar el costo, pagan Lealtad de forma irreversible y crean un objeto `type:"ability"`
// con `abilityKind:"loyalty"` en la Stack pública. La fuente puede morir al pagar y la
// habilidad sigue existiendo/puede ser respondida o contrarrestada normalmente.
function loyaltyEffectSourceCard(pwItem, ability) {
  return { ...pwItem.card, name: `${pwItem.card.name} — ${ability.name}` };
}

// Frontera única de "activar Loyalty": humano y Tano terminan acá después de elegir target.
// IMPORTANTE: el target ya está fijado; recién ahora se paga el costo y la activación queda
// comprometida. Nunca se resuelve el efecto en esta función.
export function putLoyaltyAbilityOnStack(pwItem, ability, abilityIndex, isLocal, targetObj = null) {
  if (!pwItem || !ability?.effect) return null;

  pwItem.loyalty += ability.cost;
  pwItem.abilityUsedThisTurn = true;

  const stackItem = {
    card: pwItem.card,
    isLocal,
    targetObj,
    type: 'ability',
    abilityKind: 'loyalty',
    ability: { ...ability, effect: { ...ability.effect } },
    sourceItem: pwItem,
    source: {
      type: 'loyalty_activation',
      abilityIndex,
      sourceItem: pwItem,
      sourceCardId: pwItem.card.id || null
    }
  };
  addToStack(stackItem);
  state.consecutivePasses = 0;
  logMsg(gameText('loyalty.activated', { card: pwItem.card.name, ability: ability.name, loyalty: pwItem.loyalty }));

  // SBA después de completar la activación: si el costo dejó al PW en 0, la fuente muere
  // pero el objeto de habilidad ya quedó independizado en la Stack.
  checkPlaneswalkerDeaths();
  render();

  // En Solitario, el Tano recibe su ventana normal para responder. En multiplayer esta
  // función ya no simula al rival: checkRivalCounterOrResponse sale inmediatamente y el
  // otro cliente ve el objeto por el Stack sync público.
  if (isLocal) checkRivalCounterOrResponse();
  return stackItem;
}

export async function activateLoyaltyAbility(pwItem, abilityIndex, isLocal) {
  const controller = isLocal ? 'local' : 'rival';
  if (state.phase !== 'main1' && state.phase !== 'main2') {
    logMsg(gameText('loyalty.onlyMain'));
    return;
  }
  if (state.activePlayer !== controller) {
    logMsg(gameText('loyalty.onlyOwnTurn'));
    return;
  }
  if (state.priorityPlayer !== controller) {
    logMsg(gameText('loyalty.needPriority'));
    return;
  }
  if (spellStack.length > 0) {
    logMsg(gameText('loyalty.stackEmpty'));
    return;
  }
  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingFightChoice || state.pendingXChoice || state.pendingModeChoice || state.pendingLoyaltyTargetChoice || state.pendingMultiTargetChoice || state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0 || state.pendingResolvedEffectTargetChoice || (state.resolvingResolvedEffectTargetChoices || 0) > 0 || state.pendingEscapeExileChoice || state.pendingKickerChoice || state.pendingRampChoice) {
    logMsg(gameText('loyalty.pending'));
    return;
  }
  if (pwItem.abilityUsedThisTurn) {
    logMsg(gameText('loyalty.used', { card: pwItem.card.name }));
    return;
  }
  const ability = pwItem.card.loyaltyAbilities[abilityIndex];
  if (!ability || !ability.effect) return;
  if (ability.cost < 0 && pwItem.loyalty < Math.abs(ability.cost)) {
    logMsg(gameText('loyalty.notEnough', { card: pwItem.card.name, loyalty: pwItem.loyalty }));
    return;
  }

  const sourceCard = loyaltyEffectSourceCard(pwItem, ability);

  // Validación contractual antes de empezar una activación. Fight/Equip/Crew requieren una
  // fuente de otro tipo y siguen fuera del vocabulario de Loyalty.
  const effectType = ability.effect.type;
  const sourceSpecificUnsupported = ['attach_equipment', 'fight', 'crew_vehicle'].includes(effectType);
  const executionShapeSupported = ability.requiresTarget
    ? canResolveGameEffectWithTarget(effectType)
    : canResolveGameEffectWithoutTarget(effectType);
  if (!executionShapeSupported || sourceSpecificUnsupported) {
    logMsg(`⚠️ ${pwItem.card.name}: "${ability.name}" usa ${effectType}, que no es compatible con una habilidad de Lealtad ${ability.requiresTarget ? 'dirigida' : 'sin objetivo'} en el motor actual.`);
    return;
  }

  let targetObj = null;
  if (ability.requiresTarget) {
    const candidates = getResolvedEffectTargetCandidates({
      effect: ability.effect,
      sourceCard,
      controllerIsLocal: isLocal,
      chooserIsLocal: isLocal,
      cardName: ability.name
    });
    if (candidates.length === 0) {
      logMsg(gameText('loyalty.noTargets', { card: pwItem.card.name, ability: ability.name }));
      return;
    }

    // Regla de activación: el objetivo se anuncia/fija ANTES de pagar el costo de Lealtad.
    targetObj = await chooseResolvedEffectTarget({
      effect: ability.effect,
      sourceCard,
      sourceItem: pwItem,
      controllerIsLocal: isLocal,
      chooserIsLocal: isLocal,
      cardName: `${pwItem.card.name} — ${ability.name}`
    });
    if (!targetObj) {
      render();
      return;
    }

    // Revalidamos que la ventana siga siendo legal mientras estuvo abierto el selector.
    if (state.gameOver || state.priorityPlayer !== controller || state.activePlayer !== controller ||
        (state.phase !== 'main1' && state.phase !== 'main2') || spellStack.length > 0 || pwItem.abilityUsedThisTurn ||
        (ability.cost < 0 && pwItem.loyalty < Math.abs(ability.cost))) {
      logMsg(gameText('loyalty.becameIllegal', { card: pwItem.card.name }));
      render();
      return;
    }
  }

  putLoyaltyAbilityOnStack(pwItem, ability, abilityIndex, isLocal, targetObj);
}

// Compatibilidad defensiva con estados viejos/hot-reload que conservaran el selector
// `pendingLoyaltyTargetChoice`. Ese estado legacy ya había pagado el costo antes de pedir el
// target, por eso NO volvemos a modificar Lealtad: sólo convertimos la activación pendiente
// en un objeto Loyalty real de Stack y cerramos la vieja ruta directa.
export async function resolveLoyaltyTargetChoice(targetUnit, isTargetLocal) {
  const ltc = state.pendingLoyaltyTargetChoice;
  if (!ltc) return;
  const { pwItem, ability } = ltc;
  state.pendingLoyaltyTargetChoice = null;
  const sourceCard = loyaltyEffectSourceCard(pwItem, ability);
  const targetObj = { type: 'creature', isLocal: isTargetLocal, item: targetUnit };
  const legal = isResolvedEffectTargetLegal(targetObj, {
    effect: ability.effect,
    sourceCard,
    controllerIsLocal: true
  });
  if (!legal) {
    logMsg(gameText('loyalty.invalidTarget', { ability: ability.name }));
    render();
    return;
  }

  const abilityIndex = Math.max(0, (pwItem.card.loyaltyAbilities || []).indexOf(ability));
  addToStack({
    card: pwItem.card,
    isLocal: true,
    targetObj,
    type: 'ability',
    abilityKind: 'loyalty',
    ability: { ...ability, effect: { ...ability.effect } },
    sourceItem: pwItem,
    source: { type: 'loyalty_activation', abilityIndex, sourceItem: pwItem, sourceCardId: pwItem.card.id || null }
  });
  state.consecutivePasses = 0;
  logMsg(gameText('loyalty.legacyResume', { ability: ability.name, card: pwItem.card.name }));
  checkPlaneswalkerDeaths();
  render();
  checkRivalCounterOrResponse();
}

// Regla de estado: un Planeswalker con Lealtad 0 o menos muere — se revisa después de
// activar una habilidad (puede costar lealtad) y después de recibir daño de combate.
export function checkPlaneswalkerDeaths() { void runStateBasedActions({ reason:'legacy_planeswalker_deaths' }); return []; }

export function handlePlaneswalkerClick(pwItem, isLocal, index) {
  if (state.gameOver) return;

  if (state.pendingResolvedEffectTargetChoice) {
    finishPendingResolvedEffectTarget({ type: 'planeswalker', isLocal, index, item: pwItem });
    return;
  }

  // Completar una redirección de ataque: clickear un Planeswalker RIVAL mientras hay una
  // atacante local esperando a dónde mandarse.
  if (state.pendingAttackRedirect && !isLocal) {
    const attacker = state.localCombat[state.pendingAttackRedirect.attackerIndex];
    if (attacker) {
      attacker.attackTarget = pwItem;
      logMsg(gameText('loyalty.redirectAttack', { attacker: attacker.card.name, planeswalker: pwItem.card.name }));
    }
    state.pendingAttackRedirect = null;
    render();
    return;
  }

  // Objetivos múltiples con un Planeswalker como blanco (ej. el sub-target de daño de un
  // hechizo con varios efectos): mismo reuso de getTargetRules que el resto del motor.
  if (state.pendingMultiTargetChoice) {
    const mtc = state.pendingMultiTargetChoice;
    const spec = mtc.card.targets[mtc.currentIndex];
    const rules = getTargetRules({ effect: spec.effect });
    const allowed = isLocal ? rules.allowLocalPlaneswalker : rules.allowRivalPlaneswalker;
    if (!allowed || (rules.transformableOnly && !canTransformPermanent(pwItem))) {
      logMsg(gameText('target.invalid.spellTarget'));
      return;
    }
    advanceMultiTargetChoice({ type: 'planeswalker', isLocal, item: pwItem });
    return;
  }

  // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #13): un hechizo de daño a "cualquier objetivo"
  // (jugador o criatura) no contemplaba a los Planeswalkers para nada — ni como opción de
  // click. Un Planeswalker SÍ es un objetivo legal real en MTG (le resta Lealtad en vez de
  // HP), así que si el efecto lo permite (getTargetRules), un click acá ahora cuenta.
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    const allowed = isLocal ? rules.allowLocalPlaneswalker : rules.allowRivalPlaneswalker;
    if (!allowed || (rules.transformableOnly && !canTransformPermanent(pwItem))) {
      logMsg(gameText('target.invalid.generic', { source: state.pendingTargetCard.name }));
      return;
    }
    executeSpellOnTarget({ type: 'planeswalker', isLocal, item: pwItem });
    return;
  }

  // Click normal sobre tu propio Planeswalker: abrir el menú de sus habilidades (mismo
  // patrón imperativo que el resto de los modales del juego).
  if (isLocal) {
    showLoyaltyAbilityModal(pwItem, isLocal);
  }
}

// Parpadeo temporal (exile_and_return): la criatura vuelve como un OBJETO NUEVO — mareo de
// invocación fresco, sin auras/equipos/contadores viejos (ya se habían perdido al salir del
// campo, es la regla real de MTG). Reusa el mismo patrón de entrada que un summon normal:
// dispara "cuando entra una criatura" del controlador Y el etbEffect propio de la carta (si
// no pide target — un caso raro que no tenemos hoy entre las cartas del proyecto).
export function resolveScheduledReturns(isLocal) {
  const toReturn = state.scheduledReturns.filter(entry => entry.isLocal === isLocal);
  if (toReturn.length === 0) return;
  state.scheduledReturns = state.scheduledReturns.filter(entry => entry.isLocal !== isLocal);

  const exileZone = isLocal ? state.localExile : state.rivalExile;

  toReturn.forEach(entry => {
    const idx = exileZone.indexOf(entry.card);
    if (idx === -1) return; // si dejó Exilio antes, el delayed return perdió su objeto
    exileZone.splice(idx, 1);
    clearExilePlayStateOnLeave(entry.card);

    // 23.16.4 — una TDFC vuelve como cara frontal salvo que un efecto diga explícitamente
    // "transformed". exile_and_return no lo dice. La cara frontal puede NO ser criatura
    // aunque la cara que fue exiliada sí lo fuera, así que elegimos la zona por el tipo
    // frontal real en vez de asumir Combat.
    const types=new Set(getPermanentTypes(entry.card));
    let newItem=null;
    let kind='support';
    if(types.has('creature')){
      kind='creature';
      newItem={card:entry.card,tapped:false,summoningSickness:true,isAttacking:false,blockingIndex:null,damageTaken:0,auras:[]};
    } else if(types.has('planeswalker')){
      kind='planeswalker';
      newItem={card:entry.card,loyalty:Math.max(0,Number(entry.card.loyalty)||0),abilityUsedThisTurn:false,enteredThisTurn:true};
    } else if(types.has('land')){
      kind='land';
      newItem={card:entry.card,tapped:landEntersTappedForBattlefield(entry.card,isLocal),enteredThisTurn:true,permanentTypes:['land']};
    } else {
      newItem={card:entry.card,tapped:false,enteredThisTurn:true};
      if(entry.card.equipment) newItem.attachedTo=null;
    }
    initializeTransformPermanentItem(newItem,entry.card,{face:'front'});
    stampPermanentController(newItem,isLocal,state.currentMatch?.myRole||null);
    if(kind==='creature' && hasKeyword(newItem,'haste')) newItem.summoningSickness=false;

    if(kind==='creature') (isLocal?state.localCombat:state.rivalCombat).push(newItem);
    else if(kind==='land') (isLocal?state.localLands:state.rivalLands).push(newItem);
    else if(kind==='planeswalker') (isLocal?state.localPlaneswalkers:state.rivalPlaneswalkers).push(newItem);
    else (isLocal?state.localSupport:state.rivalSupport).push(newItem);

    logMsg(gameText('exile.returned', { card: entry.card.name }));
    if(kind==='creature') triggerCreatureEtb(isLocal,newItem.card,newItem);
    else if(kind==='land') triggerLandEtb(isLocal,newItem.card,newItem);
    else dispatchGameEvent({type:'permanent_entered',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:isLocal,card:newItem.card,item:newItem,zoneFrom:'exile',zoneTo:'battlefield',cause:'exile_and_return'});

    const etbCard=newItem.card;
    if (etbCard.etbEffect && !etbCard.requiresTarget) {
      queueTriggeredAbility({
        effect: etbCard.etbEffect, sourceCard: etbCard, sourceItem: newItem, isLocal,
        triggerType: 'return_etb', eventCard: etbCard, eventItem: newItem
      });
    }
  });
}

export function attachAura(auraCard, creatureItem, ownerIsLocal = null) {
  if (ownerIsLocal !== null) stampCardOwner(auraCard, !!ownerIsLocal, state.currentMatch?.myRole || null);
  if (!creatureItem.auras) creatureItem.auras = [];
  creatureItem.auras.push(auraCard);
  // Control Magic-style: el Aura conserva su propio controlador; mientras siga adjunta,
  // ese efecto de control compite por timestamp con otros cambios de control.
  if (auraCard?.auraEffect?.controlAttachedCreature || auraCard?.controlAttachedCreature) {
    const auraControllerIsLocal = ownerIsLocal !== null ? !!ownerIsLocal : true;
    auraCard._controlEffectId = auraCard._controlEffectId || `aura_control_${auraCard.id || Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    changePermanentController(creatureItem, auraControllerIsLocal, { duration:'while_source', sourceId:auraCard._controlEffectId, sourceName:auraCard.name });
  }
  logMsg(gameText('attachment.aura.attached', { aura: auraCard.name, creature: creatureItem.card.name }));
}

// Sistema real de contadores +1/+1 y -1/-1 (antes se simulaban con "auras falsas" que ni
// siquiera eran cartas reales — sin id, sin type — y que además terminaban empujadas al
// cementerio cuando la criatura moría, como si fueran una carta de verdad).
// Viven directo acá, en el item de combate: cuando la criatura muere, el item se saca del
// array y los contadores desaparecen solos con él — no van a ningún lado, como en MTG real.
function addCountersDetailed(item, type, amount, options = {}) {
  const key=normalizeCounterType(type);
  const loc=findBattlefieldItemLocation(item);
  let finalAmount=Math.max(0,Math.floor(Number(amount)||0));
  const before = key==='loyalty' && item?.card?.type?.includes('Planeswalker')
    ? Math.max(0,Number(item.loyalty||0))
    : getCounterCount(item,key);
  // Poner contadores es reemplazable ANTES del commit para todos los tipos, incluido Lore.
  if(loc && finalAmount>0){
    const replacement=resolveReplacementEvent(state,{
      type:'counter_add', amount:finalAmount, counterType:key,
      affectedIsLocal:loc.isLocal, targetIsLocal:loc.isLocal,
      card:item.card, targetCard:item.card, item, targetItem:item,
      zoneFrom:'battlefield', zoneTo:'battlefield', cause:options.cause || 'effect'
    });
    finalAmount=Math.max(0,Math.floor(Number(replacement.event.amount)||0));
  }
  if(finalAmount<=0) return {added:0,removed:0,before,after:before,entries:[],counterType:key};
  let result;
  if(key==='loyalty' && item?.card?.type?.includes('Planeswalker')){
    item.loyalty=before+finalAmount;
    result={added:finalAmount,removed:0};
  } else {
    result=changeCounterCount(item,key,finalAmount);
  }
  const after = key==='loyalty' && item?.card?.type?.includes('Planeswalker')
    ? Math.max(0,Number(item.loyalty||0))
    : getCounterCount(item,key);
  const entries=[];
  if(loc && result.added>0){
    const actorIsLocal=(options.actorIsLocal===true || options.actorIsLocal===false) ? options.actorIsLocal : loc.isLocal;
    entries.push(...buildGenericEventTriggerEntries({
      type:'counter_added', controllerIsLocal:loc.isLocal, actorIsLocal,
      ownerIsLocal:cardOwnerIsLocal(item.card,loc.isLocal,state.currentMatch?.myRole||null),
      card:item.card, item, amount:result.added, cause:options.cause || 'effect',
      metadata:{ counterType:key }
    }));
    if(key==='lore' && isSagaCard(item.card)){
      const chapterEntries=buildSagaChapterTriggerDescriptors(item,loc.isLocal,before,after,{cause:options.cause || 'lore_counter_added'});
      chapterEntries.forEach(markSagaChapterPending);
      entries.push(...chapterEntries);
      for(const chapterEntry of chapterEntries){
        entries.push(...buildGenericEventTriggerEntries({
          type:'saga_chapter_triggered', controllerIsLocal:loc.isLocal, actorIsLocal,
          ownerIsLocal:cardOwnerIsLocal(item.card,loc.isLocal,state.currentMatch?.myRole||null),
          card:item.card, item, amount:1, cause:options.cause || 'effect',
          metadata:{
            chapter:chapterEntry.sagaChapter,
            chapterRoman:chapterEntry.sagaChapterRoman,
            loreBefore:before, loreAfter:after
          }
        }));
      }
      if(chapterEntries.length) {
        recordTelemetryEvent('saga_chapters_triggered',{
          cardId:item.card.id||null,cardName:item.card.name||null,beforeLore:before,afterLore:after,
          chapters:chapterEntries.map(entry=>entry.sagaChapter),cause:options.cause || 'effect'
        });
      }
    }
  }
  if(options.queue!==false && entries.length) queueGeneratedTriggerEntries(entries,key==='lore'?'saga_lore_added':'counter_added',options);
  return {added:result.added||0,removed:0,before,after,entries,counterType:key};
}

export function addCounters(item, type, amount, options = {}) {
  return addCountersDetailed(item,type,amount,options).added;
}

export function removeCounters(item, type, amount=1, { cause='effect', actorIsLocal=null } = {}) {
  const key=normalizeCounterType(type);
  const requested=Math.max(0,Math.floor(Number(amount)||0));
  if(requested<=0) return 0;
  const loc=findBattlefieldItemLocation(item);
  let result;
  if(key==='loyalty' && item?.card?.type?.includes('Planeswalker')){
    const before=Math.max(0,Number(item.loyalty||0));
    const removed=Math.min(before,requested);
    item.loyalty=before-removed;
    result={added:0,removed};
  } else {
    result=changeCounterCount(item,key,-requested);
  }
  if(loc && result.removed>0) dispatchGameEvent({
    type:'counter_removed', controllerIsLocal:loc.isLocal,
    actorIsLocal:actorIsLocal===null ? loc.isLocal : !!actorIsLocal,
    ownerIsLocal:cardOwnerIsLocal(item.card,loc.isLocal,state.currentMatch?.myRole||null),
    card:item.card, item, amount:result.removed, cause,
    metadata:{ counterType:key }
  });
  return result.removed;
}

export function getCounterStats(itemObj) {
  const delta=counterStatDelta(itemObj);
  // API histórica: criaturas sólo consumen un delta simétrico. Hoy sólo +1/+1/-1/-1
  // modifican stats; custom counters permanecen visibles/proliferables sin alterar P/T.
  return delta.power;
}

export function attemptUntapPermanent(item, { cause='effect', actorIsLocal=null } = {}) {
  const loc=findBattlefieldItemLocation(item);
  const result=resolveUntapAttempt(item);
  if(!result.attempted) return result;
  if(result.stunConsumed && loc){
    dispatchGameEvent({
      type:'counter_removed', controllerIsLocal:loc.isLocal,
      actorIsLocal:actorIsLocal===null ? loc.isLocal : !!actorIsLocal,
      ownerIsLocal:cardOwnerIsLocal(item.card,loc.isLocal,state.currentMatch?.myRole||null),
      card:item.card,item,amount:1,cause:'stun_untap_replacement',metadata:{counterType:'stun'}
    });
    logMsg(gameText('counter.stun.consumed',{card:item.card?.name || gameText('control.permanentFallback')}));
  }
  if(result.untapped && loc){
    dispatchGameEvent({type:'permanent_untapped',controllerIsLocal:loc.isLocal,actorIsLocal:actorIsLocal===null?loc.isLocal:!!actorIsLocal,card:item.card,item,zoneFrom:'battlefield',zoneTo:'battlefield',cause});
  }
  return result;
}

// Bug reportado: se podían apilar 2 Alpargatas Aladas (o cualquier Aura/Equipo/efecto que
// otorgue una keyword) en la MISMA criatura, aunque ya tuviera esa habilidad de cualquier
// fuente. Esta función identifica qué keyword(s) otorgaría el hechizo/habilidad pendiente,
// sea cual sea su forma (Aura, Equipo, o un efecto puntual tipo grant_keyword_temp) — así
// el chequeo de destino es uno solo y cubre los 3 casos por igual.
export function getKeywordsGrantedByPendingSpell(pendingCard) {
  if (pendingCard.adjunta && pendingCard.auraEffect && pendingCard.auraEffect.keywords) {
    return pendingCard.auraEffect.keywords;
  }
  if (pendingCard.equipment && pendingCard.equipment.grantedKeywords) {
    return pendingCard.equipment.grantedKeywords;
  }
  if (pendingCard.effect && pendingCard.effect.type === 'grant_keyword_temp' && pendingCard.effect.keyword) {
    return [pendingCard.effect.keyword];
  }
  return [];
}

export function handleCombatClick(item, isLocal, index) {
  if (state.damageModalOpen) return;
  if (state.pendingActivatedAbilityChoice) { logMsg(gameText('pending.ability')); return; }
  if (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) {
    logMsg(gameText('pending.discard'));
    return;
  }

  if (state.pendingResolvedEffectTargetChoice) {
    const pendingEffect = state.pendingResolvedEffectTargetChoice.effect;
    const rules = pendingEffect ? getTargetRules({ effect: pendingEffect }) : null;
    const landAllowed = item.isAnimatedLand && rules && (isLocal ? rules.allowLocalLand : rules.allowRivalLand);
    finishPendingResolvedEffectTarget({ type: landAllowed ? 'land' : 'creature', isLocal, index, item });
    return;
  }

  if (state.pendingCrew) {
    handleCrewClick(item, isLocal);
    return;
  }

  // Pelear (fight) desde un hechizo, segundo paso: ya elegiste a la criatura rival, esto
  // tiene que ser TUYA — la que va a pelear.
  if (state.pendingFightChoice) {
    if (!isLocal) {
      logMsg(gameText('target.chooseFightOwn'));
      return;
    }
    const fc = state.pendingFightChoice;
    state.pendingFightChoice = null;
    executeSpellOnTarget({ type: 'creature', isLocal: fc.opponentIsLocal, index: fc.opponentIndex, item: fc.opponentItem, fightWithItem: item });
    return;
  }

  // Habilidad de Lealtad con target: reusamos getTargetRules con el effect de LA HABILIDAD
  // (no de una carta) para saber qué lado es válido — funciona igual porque getTargetRules
  // solo mira effect.type, no le importa de dónde viene el objeto.
  if (state.pendingLoyaltyTargetChoice) {
    const rules = getTargetRules({ effect: state.pendingLoyaltyTargetChoice.ability.effect });
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
    const matchesFilter = (!rules.creatureFilter || item.card.type.includes(rules.creatureFilter)) && (!rules.subtypeFilter || cardHasSubtype(item.card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(item.card,rules.typalSourceCard));
    if (!allowed || !matchesFilter || (rules.transformableOnly && !canTransformPermanent(item))) {
      logMsg(gameText('target.invalid.ability'));
      return;
    }
    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(gameText('target.hexproof', { target: item.card.name }));
      return;
    }
    resolveLoyaltyTargetChoice(item, isLocal);
    return;
  }

  // Objetivos múltiples: cada paso valida contra el effect de ESE target específico
  // (card.targets[currentIndex].effect) — mismo reuso de getTargetRules que arriba.
  if (state.pendingMultiTargetChoice) {
    const mtc = state.pendingMultiTargetChoice;
    const spec = mtc.card.targets[mtc.currentIndex];
    const rules = getTargetRules({ effect: spec.effect });
    const transformable = !rules.transformableOnly || canTransformPermanent(item);
    const landAllowed = item.isAnimatedLand && (isLocal ? rules.allowLocalLand : rules.allowRivalLand) && landMatchesEffectiveFilter(state, item, isLocal, rules.landFilter || 'any') && transformable;
    const creatureAllowed = (isLocal ? rules.allowLocalCreature : rules.allowRivalCreature) && (!rules.creatureFilter || item.card.type.includes(rules.creatureFilter)) && (!rules.subtypeFilter || cardHasSubtype(item.card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(item.card,rules.typalSourceCard)) && transformable;
    if (!landAllowed && !creatureAllowed) {
      logMsg(gameText('target.invalid.spellTarget'));
      return;
    }
    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(gameText('target.hexproof', { target: item.card.name }));
      return;
    }
    advanceMultiTargetChoice({ type: landAllowed ? 'land' : 'creature', isLocal, index, item });
    return;
  }

  if (state.pendingSacrificeChoice) {
    tryResolveSacrificeChoice(item, isLocal);
    return;
  }

  if (state.pendingTargetCard) {
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
      logMsg(gameText('target.counter.creature'));
      return;
    }

    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(gameText('target.hexproof.emphatic', { target: item.card.name }));
      return;
    }

    // Protección de [color]: a diferencia de Intocable, esto aplica SIEMPRE (hasta a tu
    // propia criatura, si por algo le apuntás con algo de ese color — así es en MTG real,
    // no depende de quién controle el hechizo). Cubre de yapa "no puede ser Encantada ni
    // Equipada" de esa cosa, porque adjuntar una Aura o un Equipo también pasa por acá.
    const sourceColors = state.pendingTargetCard.colors || [];
    const protectedColor = getProtectionMatch(item, sourceColors);
    if (protectedColor) {
      logMsg(gameText('target.protection', { target: item.card.name, color: COLOR_LABELS[protectedColor] || protectedColor, source: state.pendingTargetCard.name }));
      return;
    }
    
    const rules = getTargetRules(state.pendingTargetCard);
    const transformable = !rules.transformableOnly || canTransformPermanent(item);
    const landAllowed = item.isAnimatedLand && (isLocal ? rules.allowLocalLand : rules.allowRivalLand) && landMatchesEffectiveFilter(state, item, isLocal, rules.landFilter || 'any') && transformable;
    const creatureAllowed = (isLocal ? rules.allowLocalCreature : rules.allowRivalCreature) && (!rules.creatureFilter || item.card.type.includes(rules.creatureFilter)) && (!rules.subtypeFilter || cardHasSubtype(item.card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(item.card,rules.typalSourceCard)) && transformable;

    if (!landAllowed && !creatureAllowed) {
      logMsg(gameText('target.invalid.generic', { source: state.pendingTargetCard.name }));
      return;
    }

    // No dejar apilar una habilidad redundante: si ya tiene Vuela, no le vuelvas a poner
    // algo que otorgue Vuela (aunque venga de una fuente distinta).
    const grantedKeywords = getKeywordsGrantedByPendingSpell(state.pendingTargetCard);
    const redundant = grantedKeywords.find(k => hasKeyword(item, k));
    if (redundant) {
      logMsg(gameText('ability.keyword.already', { card: item.card.name }));
      return;
    }

    // Ward: solo se activa contra un hechizo/habilidad de un RIVAL del controlador (nunca
    // contra tu propio target — así es en MTG real, "an opponent controls"). Pausa acá:
    // no resolvemos el target todavía, esperamos a que el jugador local (quien está
    // casteando en este flujo) decida pagar el maná extra o dejar que se pierda.
    const wardKw = (getEffectiveKeywords(item) || []).find(k => k.startsWith('ward_'));
    if (wardKw && !isLocal && !state.pendingCastTransaction && !state.pendingTargetSource) {
      const wardCost = parseInt(wardKw.split('_')[1], 10);
      state.pendingWardChoice = { targetObj: { type: 'creature', isLocal, index, item }, wardCost };
      logMsg(gameText('ward.prompt', { card: item.card.name, cost: wardCost }));
      render();
      return;
    }

    // Pelear (fight) desde un hechizo: ya elegiste a la criatura rival (arriba se validó
    // que sea un objetivo legal) — ahora pausamos y pedimos CUÁL de las tuyas pelea, en vez
    // de auto-elegir la más fuerte como antes. Las habilidades propias de una criatura (ej.
    // Alberto Samid) no pasan por acá: para esas, "quién pelea" ya está claro de antemano.
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type === 'fight' && !state.pendingTargetSource) {
      state.pendingFightChoice = { opponentItem: item, opponentIndex: index, opponentIsLocal: isLocal };
      logMsg(gameText('target.fightOpponentChosen', { target: item.card.name }));
      render();
      return;
    }

    executeSpellOnTarget({ type: landAllowed ? 'land' : 'creature', isLocal, index, item });
    return;
  }

  // LAND 4 — mana dorks / artefactos-criatura productores. Fuera de una declaración
  // de combate pendiente, clickear una criatura fuente de maná activa su mana ability con
  // las mismas reglas de LAND 0. Si requiere {T}, el mareo de invocación la bloquea.
  const combatManaAbility = effectiveManaAbilityForItem(item, isLocal);
  if (isLocal && combatManaAbility?.requiresTap && item.summoningSickness && state.priorityPlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2') && !getEffectiveKeywords(item).some(k => String(k).toLowerCase() === 'haste')) {
    logMsg(gameText('mana.source.summoningSick', { card:item.card.name }));
    return;
  }
  if (isLocal && combatManaAbility && canActivateLocalManaAbility(item)) {
    const ownAbilities = (isLandPermanent(item) ? getEffectiveLandActivatedAbilities(state, item, isLocal) : getActivatedAbilities(item.card)).filter(ab => ab?.effect?.type !== 'animate_land');
    if (ownAbilities.length > 0) {
      showManaOrAbilityChoiceModal(item.card.name, () => chooseAndProduceMana(item, true), () => presentActivatedAbilityChoice(item.card.name, buildCreatureActivatedAbilityOptions(item, true, index)));
    } else {
      chooseAndProduceMana(item, true);
    }
    return;
  }

 // Declarar atacantes solo en sub-paso de atacantes
  if (state.phase === 'combat_attackers' && isLocal && state.activePlayer === 'local' && state.priorityPlayer === 'local') {
    if ((state.localAttackersDeclaredThisTurn || 0) > 0) {
      logMsg(gameText('combat.local.attackersAlready'));
      return;
    }
    if (hasKeyword(item, 'defender')) {
      logMsg(gameText('combat.local.defender', { card: item.card.name }));
      return;
    }
    if (item.summoningSickness) {
      logMsg(gameText('combat.local.summoningSick', { card: item.card.name }));
      return;
    }
    const attackLock = (state.activeEffects || []).find(effect =>
      effect.effectType === 'cant_attack_next_turn' &&
      effect.targetPlayer === 'local' &&
      effect.appliesThisCombat === true &&
      effect.targetObjectId && effect.targetObjectId === item._effectObjectId
    );
    if (attackLock) {
      logMsg(gameText('combat.local.attackLocked', { card: item.card.name, source: attackLock.sourceName || 'un efecto' }));
      return;
    }
    if (item.tapped) return; 

    if (!item.isAttacking) {
      item.isAttacking = true;
      item.attackTarget = null; // por defecto, ataca al jugador
      state.pendingAttackRedirect = null;
      render();
      return;
    }

    // Ya estaba atacando. Si el rival tiene Planeswalkers, un segundo click abre el modo
    // de redirección (clickeá un Planeswalker rival para mandarle el ataque a él en vez de
    // a la cara); un tercer click sobre la misma criatura la saca del combate.
    if (state.rivalPlaneswalkers.length > 0 && state.pendingAttackRedirect?.attackerIndex !== index) {
      state.pendingAttackRedirect = { attackerIndex: index };
      logMsg(gameText('combat.local.choosePlaneswalker', { card: item.card.name }));
      render();
      return;
    }

    item.isAttacking = false;
    item.attackTarget = null;
    state.pendingAttackRedirect = null;
    render();
  }
  else if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local') {
    if (state.localBlockersDeclaredThisCombat) {
      logMsg(gameText('combat.local.blockersAlready'));
      return;
    }
    if (isLocal) {
      if (item.tapped) {
        logMsg(gameText('combat.local.tappedBlocker'));
        return;
      }
      state.pendingBlockerIndex = index;
      logMsg(gameText('combat.local.blockerSelected', { blocker: item.card.name, rival: getRivalName() }));
      render();
    } else {
      if (state.pendingBlockerIndex !== null && item.isAttacking) {
        const localUnit = state.localCombat[state.pendingBlockerIndex];
        if (!canBlock(item, localUnit)) {
           logMsg(gameText('combat.local.flyingIllegal', { attacker: item.card.name, blocker: localUnit.card.name }));
           return;
        }

        state.localCombat[state.pendingBlockerIndex].blockingIndex = index;
        logMsg(gameText('combat.local.blockAssigned', { blocker: state.localCombat[state.pendingBlockerIndex].card.name, attacker: item.card.name }));
        state.pendingBlockerIndex = null;
        render();
      }
    }
  }
  // Si el click no fue consumido por declarar atacante/bloqueador, una criatura propia
  // puede intentar activar habilidades. `presentActivatedAbilityChoice` filtra por timing:
  // las cartas legacy siguen siendo Main-only; las `instant` funcionan con prioridad.
  else if (isLocal && state.priorityPlayer === 'local') {
    tryActivateGrantedAbility(item, isLocal, index);
  }
}

// PUNTO 12 PRE-500 — TIMING CONFIGURABLE DE HABILIDADES ACTIVADAS.
// IMPORTANTE: las cartas legacy sin `timing` usan 'legacy', que
// conserva exactamente la regla histórica (propia Main + prioridad, incluso si la pila no
// está vacía). Las cartas nuevas pueden declarar 'sorcery' (Main + prioridad + pila vacía)
// o 'instant' (cualquier ventana donde su controlador tenga prioridad).
export function canActivateActivatedAbilityNow(ability, isLocal = true) {
  if (!ability || state.gameOver) return false;
  const controller = isLocal ? 'local' : 'rival';
  if (state.priorityPlayer !== controller) return false;

  const timing = getActivatedAbilityTiming(ability);
  if (timing === 'invalid') return false;

  const ownMain = state.activePlayer === controller && (state.phase === 'main1' || state.phase === 'main2');
  const intrinsicSorceryOnly = ability.effect?.type === 'attach_equipment';

  // Equipar conserva su restricción especial de velocidad de conjuro. Tripular, en cambio,
  // es una habilidad activada normal: puede activarse en cualquier ventana de prioridad.
  if (intrinsicSorceryOnly && timing === 'instant') return false;

  if (timing === 'instant') return true;
  if (!ownMain) return false;
  if (timing === 'sorcery') return spellStack.length === 0;
  return true; // legacy: comportamiento pre-Punto-12, sin cambio silencioso.
}

function activatedTimingFailureMessage(ability) {
  const timing = getActivatedAbilityTiming(ability);
  if (timing === 'invalid') return gameText('ability.timing.unknown', { timing: ability?.timing || '—' });
  if (ability?.effect?.type === 'attach_equipment' && timing === 'instant') return gameText('ability.timing.intrinsicSorcery');
  if (state.priorityPlayer !== 'local') return gameText('ability.timing.needPriority');
  const isEquip = ability?.effect?.type === 'attach_equipment';
  if (isEquip && spellStack.length > 0) return gameText('ability.timing.equipStack');
  if (isEquip && !(state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2'))) return gameText('ability.timing.equipMain');
  if (timing === 'sorcery' && spellStack.length > 0) return gameText('ability.timing.sorceryStack');
  return gameText('ability.timing.sorceryTurn');
}

function buildCreatureActivatedAbilityOptions(creatureItem, isLocal, creatureIndex) {
  const options = [];

  getActivatedAbilities(creatureItem.card).forEach((ability, abilityIndex) => {
    // Un Vehículo ya tripulado conserva en su carta la habilidad de Tripular, pero esa
    // habilidad sólo existe mientras el Vehículo está en Support/Tierras. Si además tiene
    // otra habilidad propia, ESA sí debe seguir disponible en Combat.
    if (ability.crewCost !== undefined) return;
    if (creatureItem.isAnimatedLand && ability.effect?.type === 'animate_land') return;
    options.push({
      ability,
      abilityIndex,
      abilityKind: 'own',
      item: creatureItem,
      tapTarget: creatureItem,
      index: creatureIndex,
      isLocal,
      sourceName: creatureItem.card.name
    });
  });

  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  for (const equipment of getEquipmentOn(creatureItem)) {
    const equipIndex = supportZone.indexOf(equipment);
    getGrantedAbilities(equipment.card).forEach((ability, abilityIndex) => {
      options.push({
        ability,
        abilityIndex,
        abilityKind: 'granted',
        item: equipment,
        tapTarget: creatureItem,
        index: equipIndex,
        isLocal,
        sourceName: equipment.card.name
      });
    });
  }

  return options;
}

function buildPermanentActivatedAbilityOptions(item, isLocal, index) {
  const ownAbilities = isLandPermanent(item) ? getEffectiveLandActivatedAbilities(state, item, isLocal) : getActivatedAbilities(item.card);
  return ownAbilities.map((ability, abilityIndex) => ({
    ability,
    abilityIndex,
    abilityKind: 'own',
    item,
    tapTarget: item,
    index,
    isLocal,
    sourceName: item.card.name
  }));
}

function beginActivatedAbility(source, displayName = source.sourceName || source.item.card.name) {
  const ability = source.ability;
  if (!ability) return false;

  // LAND 6: un modal pudo abrirse y luego entrar un Blood Moon-style antes de confirmar.
  // Si la habilidad impresa de esa Tierra ya no existe, no se pagan costes ni se usa Stack.
  if (isLandPermanent(source.item) && !getEffectiveLandActivatedAbilities(state, source.item, source.isLocal).includes(ability)) {
    logMsg(gameText('land.transform.abilityGone', { card:source.item?.card?.name || displayName }));
    render();
    return true;
  }

  // Revalidación al confirmar: el modal puede haber estado abierto mientras cambió el estado
  // por sync. Nunca pagamos/giramos nada si el timing ya no es legal.
  if (!canActivateActivatedAbilityNow(ability, source.isLocal)) {
    logMsg(activatedTimingFailureMessage(ability));
    render();
    return true;
  }

  // 23.15.7 — las habilidades activadas pueden declarar un `additionalCost` de descarte.
  // Es la pieza que permite representar una ficha Sangre real. Se valida ANTES de abrir
  // el pago de maná para no consumir recursos si la mano no puede completar el costo.
  const abilityAdditionalCost = normalizeCompositeCost(ability.additionalCost);
  if (abilityAdditionalCost) {
    const unsupported = abilityAdditionalCost.life > 0 || !!abilityAdditionalCost.sacrifice || !!abilityAdditionalCost.exileFromGraveyard || !!abilityAdditionalCost.manaCost;
    if (unsupported) {
      logMsg(`⚠️ ${displayName}: additionalCost activado no soportado en 23.15.7 (sólo discard).`);
      return true;
    }
    if (abilityAdditionalCost.discard?.amount > 0) {
      if (abilityAdditionalCost.discard.color) {
        logMsg(`⚠️ ${displayName}: el descarte de habilidad activada todavía no admite filtro de color.`);
        return true;
      }
      const hand = source.isLocal ? state.localHand : state.rivalHand;
      if ((hand?.length || 0) < abilityAdditionalCost.discard.amount) {
        logMsg(gameText('ability.additionalDiscard.missing', { card:displayName, count:abilityAdditionalCost.discard.amount }));
        return true;
      }
    }
  }

  if (state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew !== null) {
    logMsg(gameText('ability.pendingPayment'));
    return true;
  }

  // Tripular usa una selección especial para pagar el coste de girar criaturas, pero la
  // habilidad resultante SÍ entra en la Stack como cualquier habilidad activada.
  if (ability.crewCost !== undefined) {
    startCrewing(source.item, source.isLocal, ability, source.abilityIndex);
    return true;
  }

  if (ability.effect?.type === 'attach_equipment' && state.localCombat.length === 0) {
    logMsg(gameText('ability.noEquipTarget', { card: source.item.card.name }));
    return true;
  }

  if (ability.sacrifice && ability.sacrifice !== 'self') {
    const candidates = getSacrificeEffectCandidates(source.isLocal, ability.sacrifice);
    if (candidates.length === 0) {
      const kind = ability.sacrifice === 'creature' ? gameText('sacrifice.kind.creature') : ability.sacrifice === 'land' ? gameText('sacrifice.kind.land') : gameText('sacrifice.kind.artifact');
      logMsg(gameText('ability.noSacrificeCandidate', { card: source.item.card.name, kind }));
      return true;
    }
  }

  const costStr = ability.cost || "";
  const requiresTap = costStr.includes('{T}');
  const tapTarget = source.tapTarget || source.item;

  if (requiresTap && tapTarget.tapped) {
    logMsg(gameText('ability.tapAlready', { card: tapTarget.card.name }));
    return true;
  }

  // {T} en una criatura está sujeto al mareo; {T} en un Artefacto/Tierra no. Esto conserva
  // exactamente la diferencia histórica entre habilidades propias de criatura y soporte.
  const combatZone = source.isLocal ? state.localCombat : state.rivalCombat;
  if (requiresTap && combatZone.includes(tapTarget) && tapTarget.summoningSickness) {
    logMsg(gameText('ability.summoningSick', { card: tapTarget.card.name, source: source.sourceName || displayName }));
    return true;
  }

  source.requiresTap = requiresTap;
  source.tapTarget = tapTarget;
  source.activationDisplayName = source.sourceName || displayName;
  source.chosenTarget = null;

  // 23.11.13 — CR602 humano: una habilidad targeteada declara su target ANTES de pagar
  // maná, {T} o sacrificios. El source queda reservado pero todavía no se toca ningún costo.
  // Esto replica el orden que 602.2b hereda de 601.2b–i y evita el bug visto con Amuleto.
  state.pendingAbilitySource = source;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];

  if (ability.requiresTarget) {
    const card = source.item.card;
    state.pendingTargetCard = { ...card, _chosenCreatureType:source.item._chosenCreatureType || null, effect: ability.effect, requiresTarget: true };
    state.pendingTargetSource = source;
    state.pendingCost = null;
    logMsg(gameText('target.ability.beforePay', { card: card.name }));
    render();
    return true;
  }

  beginActivatedAbilityPayment(source);
  return true;
}

function beginActivatedAbilityPayment(source) {
  const ability = source?.ability;
  if (!ability) return false;
  const costStr = ability.cost || "";
  const manaCostStr = costStr.replace('{T}', '').trim();
  const manaCost = parseManaCost(manaCostStr || "");
  state.pendingAbilitySource = source;
  state.pendingCost = manaCost;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];

  const totalMana = manaCost.W + manaCost.U + manaCost.B + manaCost.R + manaCost.G + (manaCost.C || 0) + manaCost.generic;
  if (totalMana === 0) {
    checkPaymentComplete();
  } else {
    const prefix = source.chosenTarget ? 'Objetivo fijado. ' : '';
    logMsg(gameText('ability.payPrompt', { prefix, source: source.activationDisplayName || source.sourceName || source.item.card.name }));
    render();
  }
  return true;
}

function presentActivatedAbilityChoice(displayName, options) {
  if (!options || options.length === 0) return false;
  if (state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew !== null) {
    logMsg(gameText('ability.pendingPayment'));
    return true;
  }

  const legalOptions = options.filter(option => canActivateActivatedAbilityNow(option.ability, option.isLocal));
  if (legalOptions.length === 0) {
    logMsg(activatedTimingFailureMessage(options[0]?.ability));
    render();
    return true;
  }

  if (legalOptions.length === 1) return beginActivatedAbility(legalOptions[0], displayName);

  state.pendingActivatedAbilityChoice = { displayName, options: legalOptions };
  render();
  showActivatedAbilityModal(displayName, legalOptions, (choiceIndex) => {
    const pending = state.pendingActivatedAbilityChoice;
    state.pendingActivatedAbilityChoice = null;
    if (!pending) return;
    const chosen = pending.options[choiceIndex];
    if (!chosen) { render(); return; }
    beginActivatedAbility(chosen, pending.displayName);
  }, () => {
    state.pendingActivatedAbilityChoice = null;
    render();
  });
  return true;
}

function tryActivateGrantedAbility(creatureItem, isLocal, creatureIndex) {
  const options = buildCreatureActivatedAbilityOptions(creatureItem, isLocal, creatureIndex);
  if (options.length === 0 && getActivatedAbilities(creatureItem.card).some(ab => ab.crewCost !== undefined)) {
    logMsg(gameText('ability.vehicleAlreadyCrewed', { card: creatureItem.card.name }));
    return true;
  }
  return presentActivatedAbilityChoice(creatureItem.card.name, options);
}

// Acceso UI independiente para timing instantáneo. En los subpasos de declarar atacantes o
// bloqueadores, el click principal de la criatura ya tiene otro significado; el botón ⚡
// llama acá y evita que activar una habilidad cambie accidentalmente la declaración de combate.
export function handleInstantActivatedAbilityClick(item, isLocal, index, zoneType = 'combat') {
  if (state.gameOver || !isLocal) return false;
  let resolvedIndex = index;
  let options = [];
  if (zoneType === 'combat') {
    if (resolvedIndex === null || resolvedIndex === undefined) resolvedIndex = state.localCombat.indexOf(item);
    options = buildCreatureActivatedAbilityOptions(item, true, resolvedIndex);
  } else {
    const zone = zoneType === 'land' ? state.localLands : state.localSupport;
    if (resolvedIndex === null || resolvedIndex === undefined) resolvedIndex = zone.indexOf(item);
    options = buildPermanentActivatedAbilityOptions(item, true, resolvedIndex);
  }
  const instantOptions = options.filter(option => getActivatedAbilityTiming(option.ability) === 'instant');
  if (instantOptions.length === 0) return false;
  return presentActivatedAbilityChoice(item.card.name, instantOptions);
}

export function handleLandTargetClick(item, isLocal, index) {
  if (state.damageModalOpen || !item || !isLandPermanent(item)) return;
  if (state.pendingResolvedEffectTargetChoice) {
    finishPendingResolvedEffectTarget({ type: 'land', isLocal, index, item });
    return;
  }
  if (state.pendingMultiTargetChoice) {
    const mtc = state.pendingMultiTargetChoice;
    const spec = mtc.card.targets[mtc.currentIndex];
    const rules = getTargetRules({ effect: spec.effect });
    const allowed = isLocal ? rules.allowLocalLand : rules.allowRivalLand;
    if (!allowed || !landMatchesEffectiveFilter(state, item, isLocal, rules.landFilter || 'any') || (rules.subtypeFilter && !cardHasSubtype(item.card,rules.subtypeFilter)) || (rules.transformableOnly && !canTransformPermanent(item))) { logMsg(gameText('target.invalid.spellTarget')); return; }
    advanceMultiTargetChoice({ type: 'land', isLocal, index, item });
    return;
  }
  if (!state.pendingTargetCard) return;
  const rules = getTargetRules(state.pendingTargetCard);
  const allowed = isLocal ? rules.allowLocalLand : rules.allowRivalLand;
  if (!allowed || !landMatchesEffectiveFilter(state, item, isLocal, rules.landFilter || 'any') || (rules.subtypeFilter && !cardHasSubtype(item.card,rules.subtypeFilter)) || (rules.transformableOnly && !canTransformPermanent(item))) {
    logMsg(gameText('target.invalid.generic', { source: state.pendingTargetCard.name }));
    return;
  }
  // LAND 2: las Tierras usan las mismas reglas de targeting que cualquier otro permanente.
  if (!isLocal && hasKeyword(item, 'hexproof')) {
    logMsg(gameText('target.hexproof', { target: item.card.name }));
    return;
  }
  const protectedColor = getProtectionMatch(item, state.pendingTargetCard.colors || []);
  if (protectedColor) {
    logMsg(gameText('target.protection', { target: item.card.name, color: COLOR_LABELS[protectedColor] || protectedColor, source: state.pendingTargetCard.name }));
    return;
  }
  executeSpellOnTarget({ type: 'land', isLocal, index, item });
}

export function handleSupportTargetClick(item, isLocal, index) {
  if (state.damageModalOpen) return;

  if (state.pendingResolvedEffectTargetChoice) {
    finishPendingResolvedEffectTarget({ type: 'permanent', isLocal, index, item });
    return;
  }

  // Objetivos múltiples: un target puede ser un permanente (artefacto/encantamiento) en
  // vez de una criatura o jugador — mismo reuso de getTargetRules con el effect del target
  // actual, incluido el filtro fino de qué TIPO de permanente (permanentFilter).
  if (state.pendingMultiTargetChoice) {
    const mtc = state.pendingMultiTargetChoice;
    const spec = mtc.card.targets[mtc.currentIndex];
    const rules = getTargetRules({ effect: spec.effect });
    const allowed = isLocal ? rules.allowLocalPermanent : rules.allowRivalPermanent;
    const matchesFilter = (!rules.permanentFilter || item.card.type.includes(rules.permanentFilter)) && (!rules.subtypeFilter || cardHasSubtype(item.card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(item.card,rules.typalSourceCard)) && (!rules.transformableOnly || canTransformPermanent(item));
    if (!allowed || !matchesFilter) {
      logMsg(gameText('target.invalid.spellTarget'));
      return;
    }
    advanceMultiTargetChoice({ type: 'permanent', isLocal, index, item });
    return;
  }

  if (!state.pendingTargetCard) return;

  if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
    logMsg(gameText('target.counter.permanent'));
    return;
  }

  const rules = getTargetRules(state.pendingTargetCard);
  const allowed = isLocal ? rules.allowLocalPermanent : rules.allowRivalPermanent;
  const matchesFilter = (!rules.permanentFilter || item.card.type.includes(rules.permanentFilter)) && (!rules.subtypeFilter || cardHasSubtype(item.card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(item.card,rules.typalSourceCard)) && (!rules.transformableOnly || canTransformPermanent(item));

  if (!allowed || !matchesFilter) {
    logMsg(gameText('target.invalid.generic', { source: state.pendingTargetCard.name }));
    return;
  }

  executeSpellOnTarget({ type: 'permanent', isLocal, index, item });
}

export function handlePlayerTargetClick(isLocal) {
  if (state.damageModalOpen) return;

  if (state.pendingResolvedEffectTargetChoice) {
    finishPendingResolvedEffectTarget({ type: 'player', isLocal });
    return;
  }

  // Objetivos múltiples: mismo reuso de getTargetRules con el effect del target actual.
  if (state.pendingMultiTargetChoice) {
    const mtc = state.pendingMultiTargetChoice;
    const spec = mtc.card.targets[mtc.currentIndex];
    const rules = getTargetRules({ effect: spec.effect });
    if (!rules.allowPlayer) {
      logMsg(gameText('target.needCreature'));
      return;
    }
    if (spec.effect?.target === 'opponent_player' && isLocal) {
      logMsg(gameText('target.mustRivalPlayer'));
      return;
    }
    advanceMultiTargetChoice({ type: 'player', isLocal });
    return;
  }

  if (state.pendingTargetCard) {
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
      logMsg(gameText('target.counter.player'));
      return;
    }
    
    const rules = getTargetRules(state.pendingTargetCard);
    if (!rules.allowPlayer) {
      logMsg(gameText('target.cardNeedCreature', { source: state.pendingTargetCard.name }));
      return;
    }
    if (state.pendingTargetCard.effect?.target === 'opponent_player' && isLocal) {
      logMsg(gameText('target.cardMustRival', { source: state.pendingTargetCard.name }));
      return;
    }
    executeSpellOnTarget({ type: 'player', isLocal });
  }
}

export function cancelPayment() {
  if (state.pendingCrew) { cancelCrew(); return; }
  if (state.pendingWardChoice) { declineWard(); return; }
  if (state.pendingCounterUnlessPay) { declineCounterTax(); return; }
  if (state.pendingCastTransaction && !state.pendingCompositeCostPayment) {
    abortCastTransaction(`Cancelaste ${state.pendingCastTransaction.card?.name || 'el casteo'}.`);
    return;
  }
  if (state.pendingFightChoice) {
    logMsg(gameText('target.fightCancel'));
    state.pendingFightChoice = null;
    // El hechizo sigue esperando su primer target — volvés a poder elegir a quién pelear.
    render();
    return;
  }
  if (state.pendingMultiTargetChoice) {
    logMsg(gameText('target.selectionCancel'));
    state.pendingMultiTargetChoice = null;
    state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
    restorePaymentManaSources();
    restoreManaPaymentSnapshot();
    state.tappedLandsThisSpell = [];
    state.paymentManaSourceRollbacks = [];
    state.pendingSpellIndex = null;
    state.pendingCost = null;
    render();
    return;
  }
  if (state.pendingSpellIndex === null && state.pendingAbilitySource === null && state.pendingSacrificeChoice === null) return;

  // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #10): una vez que el costo de Sacrificar ya se
  // pagó DE VERDAD (la criatura/artefacto ya está en el cementerio — sea porque el costo
  // era "self" y se pagó automático, o porque ya elegiste cuál), "Cancelar" dejaba de tener
  // sentido pero el juego lo permitía igual: borraba todo el estado pendiente sin devolver
  // nada, perdiendo el permanente sacrificado sin que la habilidad llegara a pasar nunca.
  // En MTG real, una vez pagado un costo (sacrificio incluido) la activación queda
  // irrevocablemente comprometida — acá replicamos eso negando el cancelar y obligando a
  // terminar de elegir el objetivo (si la habilidad lo pide).
  if (state.pendingCompositeCostPayment) {
    logMsg(gameText('payment.cancel.components'));
    return;
  }
  if (state.pendingAbilitySource && state.pendingAbilitySource.sacrificePaid) {
    logMsg(gameText('payment.cancel.sacAbility'));
    return;
  }
  if (state.pendingSpellIndex !== null && state.pendingSpellCostsIrreversible) {
    logMsg(gameText('payment.cancel.irreversibleSpell'));
    return;
  }

  state.tappedLandsThisSpell.forEach(land => land.tapped = false);
  restorePaymentManaSources();
  restoreManaPaymentSnapshot();

  // Si esto era un Flashback/Escape a mitad de pago (o esperando target), la carta está
  // "prestada" en la mano — hay que devolverla a su cementerio, no dejarla ahí pegada como
  // si fuera una carta de mano real y gratis.
  if (state.pendingCastFrom && state.pendingSpellIndex !== null) {
    const returningCard = state.localHand.splice(state.pendingSpellIndex, 1)[0];
    if (returningCard) {
      state.localGraveyard.push(returningCard);
      logMsg(gameText('exile.returnToGraveyard', { card: returningCard.name }));
    }
  }

  // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #10, parte 2): si la habilidad pedía {T} ADEMÁS
  // de "Sacrificá una criatura/artefacto" (no "self"), cancelar mientras todavía estabas
  // ELIGIENDO qué sacrificar enderezaba las tierras de maná... pero nunca al permanente que
  // había activado la habilidad, que se quedaba girado para siempre sin haber logrado nada.
  if (state.pendingAbilitySource && state.pendingAbilitySource.requiresTap) {
    const tapTarget = state.pendingAbilitySource.tapTarget || state.pendingAbilitySource.item;
    if (tapTarget) tapTarget.tapped = false;
  }

  state.pendingSpellIndex = null; 
  state.pendingAbilitySource = null; // <- Agregado
  state.pendingSacrificeChoice = null;
  state.pendingCost = null; 
  state.pendingCastFrom = null;
  state.pendingKicked = null;
  state.pendingAlternativeCostChosen = false;
  state.pendingCompositeCostPayment = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingHybridLifePayment = null;
  state.tappedLandsThisSpell = []; 
  state.paymentManaSourceRollbacks = [];
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  logMsg(gameText('payment.cancel.reverted'));
  render();
}

// LAND 4 — permisos tipo Crucible/Ramunap. Jugar una Tierra desde cementerio NO es
// lanzar un hechizo: usa el land drop normal, exige timing normal de Tierra y no usa Stack.
export function hasLandPlayFromGraveyardPermission(isLocal = true) {
  const battlefield = isLocal
    ? [...state.localCombat, ...state.localSupport, ...state.localLands, ...state.localPlaneswalkers]
    : [...state.rivalCombat, ...state.rivalSupport, ...state.rivalLands, ...state.rivalPlaneswalkers];
  return hasLandGYPermission(battlefield);
}

export function canPlayLandFromGraveyard(card, isLocal = true) {
  if (!isLandCard(card) || !hasLandPlayFromGraveyardPermission(isLocal)) return false;
  const controller = isLocal ? 'local' : 'rival';
  if (state.gameOver || state.activePlayer !== controller || state.priorityPlayer !== controller) return false;
  if (state.phase !== 'main1' && state.phase !== 'main2') return false;
  if (spellStack.length > 0) return false;
  if (isLocal ? state.localLandPlayedThisTurn : state.rivalLandPlayedThisTurn) return false;
  if (state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingTargetCard || state.pendingGraveyardChoice || state.pendingLandSearchChoice || state.pendingLibraryChoice) return false;
  return true;
}

export async function playLandFromGraveyardByIndex(index, isLocal = true) {
  const graveyard = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const card = graveyard[index];
  if (!card || !canPlayLandFromGraveyard(card, isLocal)) return false;
  graveyard.splice(index, 1);
  stampCardOwner(card, isLocal, state.currentMatch?.myRole || null);
  const landItem = { card, tapped: landEntersTappedForBattlefield(card, isLocal), enteredThisTurn: true, permanentTypes:['land'] };
  initializeTransformPermanentItem(landItem,card,{face:'front'});
  stampPermanentController(landItem, isLocal, state.currentMatch?.myRole || null);
  lands.push(landItem);
  if (isLocal) state.localLandPlayedThisTurn = true; else state.rivalLandPlayedThisTurn = true;
  logMsg(gameText('land.grave.played', { card: card.name }));
  recordTelemetryEvent('land_played_from_graveyard', { card:card.name, isLocal, tapped:!!landItem.tapped });
  await triggerLandEtb(isLocal, card, landItem);
  resetPriorityClock('land_played_from_graveyard');
  render();
  return true;
}

export function openLandFromGraveyardPlayChoice() {
  if (!hasLandPlayFromGraveyardPermission(true)) { logMsg(gameText('land.grave.noPermission')); return false; }
  const entries = playableLandGraveyardEntries(state.localGraveyard).filter(entry => canPlayLandFromGraveyard(entry.card, true));
  if (!entries.length) { logMsg(gameText('land.grave.nonePlayable')); return false; }
  state.pendingGraveyardChoice = { zoneIsLocal:true, filter:'land', amount:1, cardName:gameText('land.grave.playTitle') };
  render();
  showGraveyardChoiceModal(entries, 1, gameText('land.grave.playTitle'), gameText('land.grave.filter'), gameText('land.grave.action'), async (indexes) => {
    state.pendingGraveyardChoice = null;
    const index = indexes?.[0];
    if (Number.isInteger(index)) await playLandFromGraveyardByIndex(index, true);
    else render();
  });
  return true;
}


// ============================================================================
// 23.16.2 — CAST-FROM-EXILE ENGINE
// ============================================================================
function engineRoleForSide(isLocal = true) {
  const myRole = state.currentMatch?.myRole || null;
  if (myRole === 'host' || myRole === 'guest') return isLocal ? myRole : otherRole(myRole);
  return isLocal ? 'local' : 'rival';
}

function exileLocationForCard(card) {
  let index = state.localExile.indexOf(card);
  if (index >= 0) return { zone:state.localExile, isLocal:true, index };
  index = state.rivalExile.indexOf(card);
  if (index >= 0) return { zone:state.rivalExile, isLocal:false, index };
  return null;
}

export function getExilePlayPermissionForCard(card, controllerIsLocal = true) {
  return findExilePlayPermission(card, engineRoleForSide(controllerIsLocal));
}

export function grantPlayPermissionForExiledCard(card, controllerIsLocal = true, permissionSpec = {}, sourceCard = null) {
  const location = exileLocationForCard(card);
  if (!location) return null;
  const permission = grantExilePlayPermission(card, {
    spec:permissionSpec,
    controllerRole:engineRoleForSide(controllerIsLocal),
    ownerRole:card?._ownerRole || engineRoleForSide(location.isLocal),
    activePlayerRole:engineRoleForSide(state.activePlayer === 'local'),
    turnCount:state.turnCount,
    sourceCard
  });
  recordTelemetryEvent('exile_play_permission_granted', {
    cardId:card?.id || null, cardName:card?.name || null,
    controller:controllerIsLocal?'local':'rival', permissionId:permission?.permissionId || null,
    duration:permission?.duration || null, playMode:permission?.playMode || null,
    timing:permission?.timing || null, costMode:permission?.costMode || null
  });
  return permission;
}

export function canPlayCardFromExile(card, controllerIsLocal = true) {
  if (!card || state.gameOver) return false;
  const location = exileLocationForCard(card);
  if (!location) return false;
  const permission = getExilePlayPermissionForCard(card, controllerIsLocal);
  if (!permission) return false;
  const controller = controllerIsLocal ? 'local' : 'rival';
  if (state.priorityPlayer !== controller) return false;

  if (isLandExileCard(card)) {
    if (permission.playMode === 'spell') return false;
    if (state.activePlayer !== controller || !['main1','main2'].includes(state.phase)) return false;
    if (spellStack.length > 0) return false;
    if (controllerIsLocal ? state.localLandPlayedThisTurn : state.rivalLandPlayedThisTurn) return false;
    return true;
  }
  if (permission.playMode === 'land') return false;

  // Para el humano reaprovechamos TODAS las puertas existentes de canPlayCard. Un permiso
  // explícito any_time sólo agrega Flash para timing; no altera target, costos ni prioridad.
  if (controllerIsLocal) {
    if (permission.timing === 'any_time') {
      const keywords = [...new Set([...(Array.isArray(card.keywords) ? card.keywords : []), 'flash'])];
      return canPlayCard({ ...card, keywords });
    }
    return canPlayCard(card);
  }

  // Tano/Solitario: espejo mínimo del timing. La affordability completa se decide en bot.js.
  const instantTiming = permission.timing === 'any_time' || card.type?.includes('Instantáneo') || card.keywords?.includes('flash');
  if (spellStack.length > 0) return !!instantTiming;
  if (instantTiming) return true;
  return state.activePlayer === 'rival' && ['main1','main2'].includes(state.phase);
}

export async function playCardFromExile(card, controllerIsLocal = true) {
  if (!controllerIsLocal) return false; // el Tano usa su integración directa en bot.js.
  const location = exileLocationForCard(card);
  const permission = getExilePlayPermissionForCard(card, true);
  if (!location || !permission || !canPlayCardFromExile(card, true)) {
    logMsg(gameText('exilePlay.cantPlay', { card:card?.name || 'esa carta' }));
    return false;
  }

  if (isLandExileCard(card)) {
    location.zone.splice(location.index, 1);
    consumeExilePlayPermission(card, permission.permissionId);
    clearExilePlayStateOnLeave(card);
    stampCardOwner(card, location.isLocal, state.currentMatch?.myRole || null);
    const landItem = { card, tapped:landEntersTappedForBattlefield(card,true), enteredThisTurn:true, permanentTypes:['land'] };
    initializeTransformPermanentItem(landItem,card,{face:'front'});
    stampPermanentController(landItem, true, state.currentMatch?.myRole || null);
    state.localLands.push(landItem);
    state.localLandPlayedThisTurn = true;
    dispatchGameEvent({
      type:'card_played_from_exile',controllerIsLocal:true,actorIsLocal:true,
      ownerIsLocal:cardOwnerIsLocal(card,location.isLocal,state.currentMatch?.myRole||null),
      card,item:landItem,zoneFrom:'exile',zoneTo:'battlefield',cause:'exile_permission',metadata:{isLand:true}
    });
    logMsg(gameText('exilePlay.landPlayed', { card:card.name }));
    recordTelemetryEvent('land_played_from_exile',{cardId:card.id||null,cardName:card.name,permissionId:permission.permissionId});
    await triggerLandEtb(true, card, landItem);
    resetPriorityClock('land_played_from_exile');
    render();
    return true;
  }

  const baseOverride = permissionBaseManaOverride(permission);
  state.pendingCastFrom = 'exile';
  logMsg(gameText('exilePlay.castAnnounce', { card:card.name, permission:exilePermissionSummary(permission) }));
  beginHumanCastTransaction(null, card, {
    castFrom:'exile',
    originZone:'exile',
    originIndex:location.index,
    originExileIsLocal:location.isLocal,
    exilePermissionId:permission.permissionId,
    baseOverride,
    disableAlternative:baseOverride !== null,
    allowKicker:permission.allowKicker !== false
  });
  return true;
}

// Vocabulario de contenido para Pool Expansion V: exilia N cartas de la cima y les concede
// un permiso real. No revela ni mueve mano privada: Library top -> Exile es público.
export function exileTopCardsWithPlayPermission({ ownerIsLocal = true, controllerIsLocal = ownerIsLocal, amount = 1, permission = {}, sourceCard = null } = {}) {
  const deck = ownerIsLocal ? state.localDeck : state.rivalDeck;
  const exile = ownerIsLocal ? state.localExile : state.rivalExile;
  const moved = [];
  const count = Math.min(deck.length, Math.max(0, Math.floor(Number(amount) || 0)));
  for (let i=0;i<count;i++) {
    const card = deck.pop();
    if (!card) break;
    stampCardOwner(card, ownerIsLocal, state.currentMatch?.myRole || null);
    ensureExileObjectId(card, card._ownerRole || engineRoleForSide(ownerIsLocal));
    exile.push(card);
    const granted = grantPlayPermissionForExiledCard(card, controllerIsLocal, permission, sourceCard);
    dispatchGameEvent({
      type:'card_exiled',controllerIsLocal:controllerIsLocal,actorIsLocal:controllerIsLocal,
      ownerIsLocal,card,zoneFrom:'library',zoneTo:'exile',cause:'exile_top_with_permission',
      metadata:{permissionId:granted?.permissionId || null,duration:granted?.duration || null}
    });
    moved.push({card,permission:granted});
  }
  if (moved.length) render();
  return moved;
}

export function expireExilePlayPermissionsForCleanup(endingPlayerIsLocal = true) {
  const options = { endingPlayerRole:engineRoleForSide(endingPlayerIsLocal), turnCount:state.turnCount };
  const expired = [
    ...expireExilePermissionsAtCleanup(state.localExile, options),
    ...expireExilePermissionsAtCleanup(state.rivalExile, options)
  ];
  expired.forEach(({card,permission}) => recordTelemetryEvent('exile_play_permission_expired',{
    cardId:card?.id||null,cardName:card?.name||null,permissionId:permission?.permissionId||null,duration:permission?.duration||null
  }));
  return expired;
}


function suspendTimingAllows(card) {
  if (!card || state.gameOver || state.priorityPlayer !== 'local') return false;
  const isInstant = String(card.type || '').includes('Instantáneo') || (card.keywords || []).includes('flash');
  if (isInstant) return true;
  return spellStack.length === 0 && state.activePlayer === 'local' && ['main1','main2'].includes(state.phase);
}

export function canSuspendCardFromHand(card) {
  if (!hasSuspend(card) || !state.localHand.includes(card)) return false;
  if (state.pendingSuspendTransaction || state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCompositeCostPayment || state.awaitingRivalDecision || state.respondingToDecision) return false;
  return suspendTimingAllows(card);
}

function clearSuspendPaymentState({rollback=true} = {}) {
  if (rollback) {
    state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
    restorePaymentManaSources();
    restoreManaPaymentSnapshot();
  }
  state.tappedLandsThisSpell=[];
  state.paymentManaSourceRollbacks=[];
  state.pendingCost=null;
  state.pendingSuspendTransaction=null;
  state.paymentManaPoolSnapshot=null;
}

export function suspendCardFromHand(index) {
  const card=state.localHand[index];
  if (!card || !canSuspendCardFromHand(card)) { logMsg(gameText('suspend.cant')); return false; }
  const spec=normalizeSuspendSpec(card.suspend);
  if (!spec || !spec.cost) { logMsg(gameText('suspend.cant')); return false; }
  state.pendingSuspendTransaction={ card, handIndex:index, spec, stage:'payment' };
  state.pendingCost=parseManaCost(spec.cost);
  state.tappedLandsThisSpell=[];
  state.paymentManaSourceRollbacks=[];
  state.paymentManaPoolSnapshot=cloneManaPool(state.localManaPool);
  logMsg(gameText('suspend.payment',{card:card.name,cost:spec.cost,time:spec.time}));
  checkPaymentComplete(); render(); return true;
}

function commitSuspendAction() {
  const tx=state.pendingSuspendTransaction;
  if (!tx) return false;
  const card=tx.card;
  const idx=state.localHand.indexOf(card);
  if (idx<0 || !suspendTimingAllows(card)) { clearSuspendPaymentState({rollback:true}); logMsg(gameText('suspend.cant')); render(); return false; }
  state.localHand.splice(idx,1);
  stampCardOwner(card,true,state.currentMatch?.myRole||null);
  ensureExileObjectId(card,'local');
  state.localExile.push(card);
  markCardSuspended(card,{ exileObjectId:card._exileObjectId, ownerRole:state.currentMatch?.myRole||'local', suspendedByRole:state.currentMatch?.myRole||'local' });
  dispatchGameEvent({type:'card_exiled',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:true,card,zoneFrom:'hand',zoneTo:'exile',cause:'suspend_action'});
  dispatchGameEvent({type:'counter_added',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:true,card,amount:tx.spec.time,zoneFrom:'exile',zoneTo:'exile',cause:'suspend_action',metadata:{counterType:'time',suspended:true}});
  clearSuspendPaymentState({rollback:false});
  state.consecutivePasses=0; resetPriorityClock();
  logMsg(gameText('suspend.exiled',{card:card.name,time:tx.spec.time}));
  render(); publishMatchState(); return true;
}

function suspendedEntryByObjectId(exileObjectId) {
  for (const [zoneIsLocal,zone] of [[true,state.localExile],[false,state.rivalExile]]) {
    const index=zone.findIndex(card=>card?._exileObjectId===exileObjectId);
    if(index>=0) return {card:zone[index],index,zone,zoneIsLocal};
  }
  return null;
}

export function collectSuspendUpkeepTriggers(isLocal) {
  const zone=isLocal ? state.localExile : state.rivalExile;
  return zone.filter(isSuspendedCard).map(card=>buildSuspendUpkeepTrigger(card,isLocal)).filter(Boolean);
}

function dispatchSuspendedCounterEvent(type,entry,amount,cause,transition={}) {
  if(!entry?.card || amount<=0) return;
  dispatchGameEvent({
    type,controllerIsLocal:entry.zoneIsLocal,actorIsLocal:entry.zoneIsLocal,
    ownerIsLocal:cardOwnerIsLocal(entry.card,entry.zoneIsLocal,state.currentMatch?.myRole||null),
    card:entry.card,amount,zoneFrom:'exile',zoneTo:'exile',cause,
    metadata:{
      counterType:'time',suspended:true,
      before:Number.isFinite(Number(transition.before))?Number(transition.before):undefined,
      after:Number.isFinite(Number(transition.after))?Number(transition.after):undefined,
      lastRemoved:transition.lastRemoved===true
    }
  });
}

export function resolveSuspendRemoveTimeEffect(effect, isLocal) {
  const entry=suspendedEntryByObjectId(effect?.exileObjectId);
  if(!entry || !isSuspendedCard(entry.card)) return false;
  const result=removeSuspendTimeCounterStorage(entry.card,1);
  if(result.removed>0) dispatchSuspendedCounterEvent('counter_removed',entry,result.removed,'suspend_upkeep',result);
  if(result.lastRemoved){
    const castEntry=buildSuspendCastTrigger(entry.card,entry.zoneIsLocal,{cause:'last_time_removed'});
    if(castEntry) queueTriggeredAbility(castEntry);
  }
  logMsg(gameText('suspend.timeRemoved',{card:entry.card.name,time:result.after}));
  render(); return result.removed>0;
}

export function getSuspendedCardCandidates(owner='any') {
  const entries=[...state.localExile.map((card,index)=>({card,index,zoneIsLocal:true,time:suspendedTimeCount(card)})),...state.rivalExile.map((card,index)=>({card,index,zoneIsLocal:false,time:suspendedTimeCount(card)}))].filter(e=>isSuspendedCard(e.card));
  if(owner==='you' || owner==='self') return entries.filter(e=>e.zoneIsLocal);
  if(owner==='opponent' || owner==='rival') return entries.filter(e=>!e.zoneIsLocal);
  return entries;
}

export async function adjustSuspendedTimeCounters(effect={},controllerIsLocal=true) {
  const action=effect.type==='add_time_counter_suspended' ? 'add' : 'remove';
  const amount=Math.max(1,Math.floor(Number(effect.amount)||1));
  let entries=getSuspendedCardCandidates(effect.owner||effect.targetController||'any');
  if(!entries.length) return false;
  let chosen;
  if(controllerIsLocal) chosen=entries.length===1?entries[0]:await showSuspendedCardChoiceModal(entries,{title:action==='add'?'Agregar Tiempo':'Remover Tiempo'});
  else chosen=entries.sort((a,b)=>action==='remove'?a.time-b.time:b.time-a.time)[0];
  if(!chosen) return false;
  const entry=suspendedEntryByObjectId(chosen.card._exileObjectId); if(!entry) return false;
  if(action==='add'){
    const result=addSuspendTimeCounterStorage(entry.card,amount);
    dispatchSuspendedCounterEvent('counter_added',entry,result.added,'time_counter_effect',result);
    logMsg(gameText('suspend.timeAdded',{card:entry.card.name,time:result.after}));
  }else{
    const result=removeSuspendTimeCounterStorage(entry.card,amount);
    dispatchSuspendedCounterEvent('counter_removed',entry,result.removed,'time_counter_effect',result);
    if(result.lastRemoved){ const castEntry=buildSuspendCastTrigger(entry.card,entry.zoneIsLocal,{cause:'time_counter_effect'}); if(castEntry) queueTriggeredAbility(castEntry); }
    logMsg(gameText('suspend.timeRemoved',{card:entry.card.name,time:result.after}));
  }
  render(); return true;
}

let suspendCastResolutionResolver=null;
function settleSuspendCastResolution(value){ if(suspendCastResolutionResolver){ const fn=suspendCastResolutionResolver; suspendCastResolutionResolver=null; fn(!!value); } }

export function handleCounteredSuspendTrigger(stackItem) {
  if (stackItem?.triggerType !== 'suspend_cast') return false;
  const exileObjectId=stackItem?.ability?.effect?.exileObjectId || stackItem?.source?.eventCard?._exileObjectId || null;
  const entry=suspendedEntryByObjectId(exileObjectId);
  if (!entry?.card) return false;
  entry.card._suspendCastPending=false;
  clearSuspendState(entry.card,{clearTime:false});
  render();
  return true;
}

export async function resolveSuspendCastFromExile(effect,isLocal) {
  const entry=suspendedEntryByObjectId(effect?.exileObjectId);
  if(!entry?.card || suspendedTimeCount(entry.card)!==0) return false;
  const card=entry.card;
  if(!isLocal && !state.currentMatch){
    const result=await castSuspendedCardForBot(card);
    card._suspendCastPending=false;
    if(!result) clearSuspendState(card,{clearTime:false});
    return result;
  }
  const accept=await showSuspendCastModal(card,{engineVersion:SUSPEND_ENGINE_VERSION});
  if(!accept){ card._suspendCastPending=false; clearSuspendState(card,{clearTime:false}); logMsg(gameText('suspend.castDeclined',{card:card.name})); render(); return false; }
  const role=state.currentMatch?.myRole||'local';
  const permission=grantExilePlayPermission(card,{controllerRole:role,duration:'while_exiled',playMode:'spell',timing:'any_time',costMode:'without_paying_mana_cost',allowKicker:true,singleUse:true,label:'Suspend'});
  state.pendingCastFrom='suspend';
  beginHumanCastTransaction(null,card,{castFrom:'suspend',originZone:'exile',originIndex:entry.index,originExileIsLocal:entry.zoneIsLocal,exilePermissionId:permission.permissionId,baseOverride:'{0}',disableAlternative:true,allowKicker:true,suspendEngineVersion:SUSPEND_ENGINE_VERSION,suspendHaste:card.power!==undefined});
  return await new Promise(resolve=>{ suspendCastResolutionResolver=resolve; });
}

export function canPlayCard(card) {
  if (state.gameOver || state.pendingSuspendTransaction || state.pendingCastTransaction || state.pendingAlternativeCostChoice || state.pendingPrivateZoneChoice || state.pendingLandSearchChoice || state.pendingLibraryChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingActivatedAbilityChoice || state.pendingCrew !== null || state.pendingWardChoice !== null || state.pendingCounterUnlessPay !== null || state.pendingFightChoice !== null || state.pendingXChoice !== null || state.pendingModeChoice !== null || state.pendingLoyaltyTargetChoice !== null || state.pendingMultiTargetChoice !== null || state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingHandFilterChoice || state.pendingDiscardChoice || state.pendingSacrificeEffectChoice || state.pendingGraveyardChoice || state.pendingResolvedEffectTargetChoice || state.pendingCompositeCostPayment || (state.resolvingCardFilterEffects || 0) > 0 || (state.resolvingDiscardEffects || 0) > 0 || (state.resolvingSacrificeEffects || 0) > 0 || (state.resolvingGraveyardChoices || 0) > 0 || (state.resolvingResolvedEffectTargetChoices || 0) > 0 || state.pendingEscapeExileChoice || state.pendingKickerChoice || state.damageModalOpen || state.pendingRampChoice || state.awaitingRivalDecision || state.respondingToDecision) return false;
  if (state.priorityPlayer !== 'local') return false; // Solo si poseés prioridad

  // LAND 3 / Punto 14: cualquier costo adicional no-maná, tanto schema legacy
  // (`type:'discard'`, `type:'sacrifice'`) como compuesto, se prevalida ANTES de anunciar.
  // Esto permite que un Crop Rotation-style con `type:'sacrifice', target:'own_land'`
  // sea directamente incasteable si no controlás una Tierra sacrificable.
  if (card.additionalCost && compositeCostHasNonMana(card.additionalCost) &&
      !canPayCastCompositeNonManaCosts(card, true, false, { excludeCard: card })) return false;
  
  // Flash: un permanente con esta keyword se puede jugar como si fuera un instantáneo,
  // aunque su tipo real sea Artefacto/Criatura/Encantamiento (no cambia qué ES la carta,
  // solo relaja CUÁNDO se puede jugar).
  const isInstant = card.type.includes('Instantáneo') || (card.keywords && card.keywords.includes('flash'));

  // Si la pila no está vacía, solo instantáneos
  if (spellStack && spellStack.length > 0) return isInstant;

  if (card.effect && card.effect.type && card.effect.type.startsWith('counter')) {
    const rivalSpells = spellStack.filter(s => !s.isLocal);
    if (rivalSpells.length === 0) return false; 
  }
  
  // Si la pila está vacía, sorceries/creaturas solo en sus fases principales con su turno activo
  if (isInstant) return true;
  return state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2');
}


// ============================================================================
// ENTREGA 23.10 — PIPELINE FORMAL DE CASTEO (CR 601.2b-i)
// ============================================================================
// `spellStack` sigue siendo la pila PÚBLICA y sólo recibe el objeto cuando el lanzamiento
// quedó completamente legal/pagado. Durante 601.2a-h existe una propuesta interna en
// pendingCastTransaction.proposedStackItem: evita publicar un hechizo "a medio castear" y
// permite cancelar/revertir sin que el rival vea estados privados intermedios.
function buildCastStackType(card) {
  const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);
  if (card.power !== undefined) return 'summon';
  if (card.type.includes('Planeswalker')) return 'planeswalker';
  if (isPermanent) return 'permanent';
  if (card.adjunta) return 'aura';
  if (card.type.includes('Instantáneo')) return 'instant';
  return 'spell';
}

function castNeedsTarget(card) {
  return !!(card.adjunta || (card.requiresTarget ?? (card.effect && (
    card.effect.type === 'damage' || card.effect.type === 'heal' || card.effect.type.startsWith('counter')
    || card.effect.type === 'destroy_land' || card.effect.type === 'destroy_nonbasic_land'
  ))));
}

function resetCastTransactionState() {
  state.pendingCastTransaction = null;
  state.pendingSuspendTransaction = null;
  state.pendingPreparedCastCosts = null;
  state.pendingAlternativeCostChoice = null;
  state.pendingSpellIndex = null;
  state.pendingCost = null;
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingMultiTargetChoice = null;
  state.pendingModeChoice = null;
  state.pendingXChoice = null;
  state.pendingKickerChoice = null;
  state.pendingXValue = null;
  state.pendingKicked = null;
  state.pendingAlternativeCostChosen = false;
  state.pendingCompositeCostPayment = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingHybridLifePayment = null;
  state.pendingEscapeExileChoice = null;
  state.pendingFightChoice = null;
  state.paymentManaPoolSnapshot = null;
}

function abortCastTransaction(message = 'Cancelaste el casteo.') {
  const tx = state.pendingCastTransaction;
  if (!tx) return false;
  if (state.pendingSpellCostsIrreversible) {
    logMsg(gameText('payment.cancel.irreversibleCommitted'));
    return true;
  }
  state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
  restorePaymentManaSources();
  restoreManaPaymentSnapshot();
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];

  // Flashback/Escape todavía reutilizan temporalmente la mano, pero la transacción recuerda
  // el origen: si se cancela antes del commit, vuelve exactamente al cementerio.
  if (tx.castFrom && tx.card && state.localHand.includes(tx.card)) {
    const idx = state.localHand.indexOf(tx.card);
    state.localHand.splice(idx, 1);
    if (!state.localGraveyard.includes(tx.originalCard || tx.card)) state.localGraveyard.push(tx.originalCard || tx.card);
  } else if (!tx.castFrom && tx.card !== tx.originalCard) {
    const idx = state.localHand.indexOf(tx.card);
    if (idx !== -1) state.localHand[idx] = tx.originalCard;
  }
  const wasSuspendCast = tx.castFrom === 'suspend';
  resetCastTransactionState();
  state.pendingCastFrom = null;
  if (wasSuspendCast) settleSuspendCastResolution(false);
  logMsg(message);
  recordTelemetryEvent('cast_transaction_cancelled', { card:tx.card?.name || null, stage:tx.stage || null });
  render();
  return true;
}

function selectedCastBaseManaString(tx) {
  if (tx.baseOverride) return tx.baseOverride;
  const alt = tx.useAlternative ? normalizeCompositeCost(tx.card?.alternativeCost) : null;
  return tx.useAlternative ? (alt?.manaCost || null) : (tx.card?.manaCost || null);
}

function castRouteContainsX(tx) {
  const base = selectedCastBaseManaString(tx);
  return typeof base === 'string' && base.includes('{X}');
}

function beginHumanCastTransaction(index, card, options = {}) {
  const txId = `cast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  state.pendingAlternativeCostChosen = false;
  state.pendingCompositeCostPayment = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingHybridLifePayment = null;
  state.pendingCastTransaction = {
    id: txId,
    stage: 'announce',
    handIndex: Number.isInteger(index) ? index : null,
    originalCard: card,
    card,
    castFrom: options.castFrom || null,
    originZone: options.originZone || 'hand',
    originIndex: Number.isInteger(options.originIndex) ? options.originIndex : (Number.isInteger(index) ? index : null),
    exilePermissionId: options.exilePermissionId || null,
    originExileIsLocal: options.originExileIsLocal !== false,
    exilePlayEngineVersion: options.originZone === 'exile' ? EXILE_PLAY_ENGINE_VERSION : null,
    suspendEngineVersion: options.suspendEngineVersion || null,
    suspendHaste: !!options.suspendHaste,
    baseOverride: options.baseOverride || null,
    disableAlternative: options.disableAlternative === true || !!options.baseOverride,
    useAlternative: (options.disableAlternative === true || options.baseOverride) ? false : (card.alternativeCost ? null : false),
    modeChosen: !(card.modal && Array.isArray(card.modes) && card.modes.length),
    xValue: null,
    kicked: (options.allowKicker === false || !card.kicker) ? false : null,
    targetObj: undefined,
    preparedComposite: null,
    escapeExiles: [],
    // 601.2a conceptual: objeto propuesto interno. Todavía no se publica en spellStack.
    proposedStackItem: { card, isLocal:true, targetObj:null, type:buildCastStackType(card), xValue:null, castFrom:options.castFrom || null, kicked:false, exilePermissionId:options.exilePermissionId || null, exilePlayEngineVersion:options.originZone === 'exile' ? EXILE_PLAY_ENGINE_VERSION : null, suspendEngineVersion:options.suspendEngineVersion || null, suspendHaste:!!options.suspendHaste },
    ward: null
  };
  recordTelemetryEvent('cast_transaction_begin', { transactionId:txId, card:card.name, castFrom:options.castFrom || null });
  advanceCastAnnouncement();
}

function advanceCastAnnouncement() {
  const tx = state.pendingCastTransaction;
  if (!tx) return;
  const card = tx.card;

  // 601.2b — modos primero.
  if (!tx.modeChosen && card.modal && card.modes?.length) {
    state.pendingModeChoice = { index:tx.handIndex, card, castTransactionId:tx.id };
    showModalSpellChoice(card, confirmModeChoice, cancelModeChoice);
    render();
    return;
  }

  // 601.2b — vía alternativa/adicional antes de fijar X y antes de targets.
  if (!tx.disableAlternative && card.alternativeCost && tx.useAlternative === null) {
    state.pendingAlternativeCostChoice = { transactionId:tx.id, card };
    showAlternativeCostModal(card, describeCompositeCost(card.alternativeCost), confirmAlternativeCostChoice, cancelAlternativeCostChoice);
    render();
    return;
  }

  // Kicker es una elección de costo adicional. Se fija antes de X/targets.
  if (card.kicker && tx.kicked === null) {
    state.pendingKickerChoice = { index:tx.handIndex, card, castTransactionId:tx.id };
    showKickerModal(card, confirmKickerChoice, cancelKickerChoice);
    render();
    return;
  }

  // X corresponde a la VÍA elegida: una alternativa fija no hereda el X del costo normal.
  if (castRouteContainsX(tx) && tx.xValue === null) {
    state.pendingXChoice = { index:tx.handIndex, card, castTransactionId:tx.id };
    showXValueModal(card, confirmXValue, cancelXChoice);
    render();
    return;
  }
  if (!castRouteContainsX(tx) && tx.xValue === null) tx.xValue = 0;

  beginCastTargetDeclaration();
}

export function confirmAlternativeCostChoice(useAlternative) {
  const tx = state.pendingCastTransaction;
  if (!tx || !state.pendingAlternativeCostChoice) return;
  if (useAlternative && !canPayCastCompositeNonManaCosts(tx.card, true, true, { excludeCard:tx.card })) {
    logMsg(gameText('cast.altNonManaUnavailable', { card: tx.card.name }));
    return;
  }
  tx.useAlternative = !!useAlternative;
  state.pendingAlternativeCostChosen = !!useAlternative;
  state.pendingAlternativeCostChoice = null;
  recordTelemetryEvent('cast_route_chosen', { transactionId:tx.id, card:tx.card.name, alternative:!!useAlternative });
  advanceCastAnnouncement();
}

export function cancelAlternativeCostChoice() {
  abortCastTransaction('Cancelaste la elección de vía de casteo.');
}

function beginCastTargetDeclaration() {
  const tx = state.pendingCastTransaction;
  if (!tx) return;
  tx.stage = 'targets';
  const card = tx.card;
  state.pendingXValue = tx.xValue;
  state.pendingKicked = tx.kicked;

  if (card.multiTarget && Array.isArray(card.targets) && card.targets.length > 0) {
    state.pendingMultiTargetChoice = { card, chosenTargets:[], currentIndex:0, castTransactionId:tx.id };
    logMsg(gameText('cast.targetAnnounce', { card: card.name, total: card.targets.length }));
    render();
    return;
  }

  if (castNeedsTarget(card)) {
    state.pendingTargetCard = card;
    state.pendingTargetSource = null;
    let targetHint = `Elegí el objetivo de ${card.name} antes de pagar.`;
    if (card.adjunta) targetHint = `Elegí qué criatura va a encantar ${card.name} antes de pagar.`;
    else if (card.effect?.type?.startsWith('counter')) targetHint = `Elegí en la Pila qué va a contrarrestar ${card.name} antes de pagar.`;
    logMsg(gameText('cast.targetHint', { hint: targetHint }));
    render();
    return;
  }

  void completeCastTargetDeclaration(null);
}

function detectWardForDeclaredTarget(card, targetObj) {
  // LAND 2: Ward es una habilidad de PERMANENTE, no de criatura. Una Tierra con Ward futura
  // debe disparar igual que una criatura, un artefacto o un planeswalker al ser objetivo rival.
  if (!targetObj || !targetObj.item || targetObj.isLocal) return null;
  const item = targetObj.item;
  const wardKw = (getEffectiveKeywords(item) || []).find(k => k.startsWith('ward_'));
  if (!wardKw) return null;
  const wardCost = parseInt(wardKw.split('_')[1], 10);
  return Number.isFinite(wardCost) && wardCost > 0 ? { wardCost, targetObj } : null;
}

async function prepareOptionalCastPaymentMethods(tx, determinedCost, preparedComposite, escapeExiles) {
  let cost = { ...determinedCost };
  const plan = { convoke:[], convokePayments:[], delve:[], phyrexianLife:[], phyrexianLifeAmount:0 };
  const methods = getSpellPaymentMethods(tx.card);

  // Phyrexian no es un paymentMethod de carta: es semántica del propio símbolo. La elección
  // de vida se prepara antes de Convoke para que los símbolos restantes todavía puedan ser
  // pagados por criaturas del color correcto.
  if (Array.isArray(cost.phyrexian) && cost.phyrexian.length) {
    const mandatoryLife = Math.max(0, Number(preparedComposite?.bundle?.life) || 0);
    const availableForPhyrexian = Math.max(0, state.localHP - mandatoryLife);
    const maxLifePayments = Math.floor(availableForPhyrexian / 2);
    if (maxLifePayments > 0) {
      const chosenIndexes = await showPhyrexianCostChoiceModal(cost.phyrexian, tx.card.name, maxLifePayments);
      const applied = applyPhyrexianLifeToCost(cost, chosenIndexes || []);
      cost = applied.cost;
      plan.phyrexianLife = applied.paidSymbols;
      plan.phyrexianLifeAmount = applied.life;
    }
  }

  if (methods.some(m=>m.type === 'convoke') && parsedManaTotal(cost) > (cost.C || 0)) {
    const excludedItems = preparedComposite?.selectedSacrifices || [];
    const candidates = getConvokeCandidates(state, true, excludedItems);
    const payableSymbols = Math.max(0, parsedManaTotal(cost) - (cost.C || 0));
    if (candidates.length && payableSymbols > 0) {
      const selected = await showCostPaymentResourceModal(candidates, {
        mode:'convoke', cardName:tx.card.name, max:Math.min(candidates.length,payableSymbols)
      });
      const applied = applyConvokeToCost(cost, selected || []);
      cost = applied.cost;
      plan.convoke = applied.usedItems;
      plan.convokePayments = applied.payments;
    }
  }

  if (methods.some(m=>m.type === 'delve') && cost.generic > 0) {
    const excludedCards = new Set([tx.card, ...(preparedComposite?.selectedGraveyard || []), ...(escapeExiles || [])].filter(Boolean));
    const candidates = state.localGraveyard.filter(card=>card && !excludedCards.has(card));
    if (candidates.length) {
      const selected = await showCostPaymentResourceModal(candidates, {
        mode:'delve', cardName:tx.card.name, max:Math.min(candidates.length,cost.generic)
      });
      const applied = applyDelveToCost(cost, selected || []);
      cost = applied.cost;
      plan.delve = applied.usedCards;
    }
  }
  return { cost, plan };
}

function validatePreparedCastPaymentMethods(plan) {
  if (!plan) return true;
  if ((plan.convoke || []).some(item => !state.localCombat.includes(item) || item.tapped || !isCreaturePermanent(item))) return false;
  if ((plan.delve || []).some(card => !state.localGraveyard.includes(card))) return false;
  return true;
}

function commitPreparedCastPaymentMethods(card, plan) {
  if (!plan) return true;
  let irreversible = false;
  const phyrexianLife=Math.max(0,Number(plan.phyrexianLifeAmount)||0);
  if (phyrexianLife > state.localHP) return false;
  for (const item of plan.convoke || []) {
    if (!state.localCombat.includes(item) || item.tapped || !isCreaturePermanent(item)) return false;
  }
  for (const graveCard of plan.delve || []) if (!state.localGraveyard.includes(graveCard)) return false;

  if (phyrexianLife > 0) {
    state.localHP -= phyrexianLife;
    dispatchGameEvent({type:'life_lost',controllerIsLocal:true,actorIsLocal:true,targetPlayerIsLocal:true,amount:phyrexianLife,cause:'phyrexian_cost'});
    logMsg(gameText('cost.phyrexian.paid',{card:card.name,life:phyrexianLife,count:plan.phyrexianLife?.length||0}));
    irreversible = true;
  }

  for (const item of plan.convoke || []) {
    item.tapped = true;
    dispatchGameEvent({
      type:'permanent_tapped', controllerIsLocal:true, actorIsLocal:true,
      ownerIsLocal:cardOwnerIsLocal(item.card,true,state.currentMatch?.myRole||null),
      card:item.card,item,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'convoke_cost'
    });
    irreversible = true;
  }
  if ((plan.convoke || []).length) logMsg(gameText('cost.convoke.paid',{card:card.name,count:plan.convoke.length}));

  if ((plan.delve || []).length) {
    for (const graveCard of plan.delve) {
      const idx=state.localGraveyard.indexOf(graveCard);
      if(idx>=0) state.localGraveyard.splice(idx,1);
    }
    state.localExile.push(...plan.delve);
    plan.delve.forEach(exiledCard=>dispatchGameEvent({
      type:'card_exiled',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:true,
      card:exiledCard,zoneFrom:'graveyard',zoneTo:'exile',cause:'delve_cost'
    }));
    logMsg(gameText('cost.delve.paid',{card:card.name,count:plan.delve.length}));
    irreversible = true;
  }
  if (irreversible) state.pendingSpellCostsIrreversible = true;
  return true;
}

async function prepareCastTransactionCosts(tx, determinedCost) {
  const useAlternative = !!tx.useAlternative;
  if (!canPayCastCompositeNonManaCosts(tx.card, true, useAlternative, { excludeCard:tx.card })) return false;
  state.pendingCompositeCostPayment = true;
  render();
  const preparedComposite = await prepareCastCompositeNonManaCosts(tx.card, true, useAlternative);
  if (!preparedComposite) { state.pendingCompositeCostPayment = false; return false; }

  let escapeExiles = [];
  if (tx.castFrom === 'escape' && tx.card.escape?.exileCount > 0) {
    const spec = { filter:'any', amount:tx.card.escape.exileCount };
    state.pendingEscapeExileChoice = { card:tx.card, exileCount:spec.amount, prepayment:true };
    escapeExiles = await chooseGraveyardCardsForCompositeCost(true, spec, tx.card, [tx.card, ...preparedComposite.selectedGraveyard]);
    state.pendingEscapeExileChoice = null;
    if (!escapeExiles) { state.pendingCompositeCostPayment = false; return false; }
  }

  const optional = await prepareOptionalCastPaymentMethods(tx, determinedCost, preparedComposite, escapeExiles);
  state.pendingCompositeCostPayment = false;
  tx.preparedComposite = preparedComposite;
  tx.escapeExiles = escapeExiles;
  tx.preparedPaymentMethods = optional.plan;
  tx.payableManaCost = optional.cost;
  state.pendingPreparedCastCosts = { preparedComposite, escapeExiles, paymentMethods:optional.plan };
  return true;
}

export async function completeCastTargetDeclaration(targetObj) {
  const tx = state.pendingCastTransaction;
  if (!tx || tx.stage !== 'targets') return false;
  tx.targetObj = targetObj;
  tx.ward = detectWardForDeclaredTarget(tx.card, targetObj);
  state.pendingTargetCard = null;
  state.pendingMultiTargetChoice = null;
  state.pendingFightChoice = null;
  tx.stage = 'cost_lock';

  // 601.2f — primero se determina el coste final COMPLETO: base/alternativa + Kicker +
  // adicionales + X, luego aumentos, reducciones y floors. Recién con ese número cerrado se
  // preparan recursos opcionales de pago como Convoke/Delve; ninguno se muta todavía.
  const finalCost = getFinalCastingManaCost(tx.card, {
    useAlternative:!!tx.useAlternative,
    kicked:!!tx.kicked,
    baseOverride:tx.baseOverride,
    xValue:tx.xValue,
    isLocal:true
  });
  tx.lockedManaCost = { ...finalCost.cost };
  tx.costModifierTrace = finalCost.trace || [];
  tx.costManaString = finalCost.manaString;
  if (tx.costModifierTrace.length) {
    logMsg(gameText('cost.modified',{card:tx.card.name,cost:costEngineSummary(finalCost),modifiers:tx.costModifierTrace.length}));
  }
  const prepared = await prepareCastTransactionCosts(tx, finalCost.cost);
  if (!prepared) {
    logMsg(gameText('cast.prepareCostFailed', { card: tx.card.name }));
    abortCastTransaction();
    return false;
  }

  const manaString = finalCost.manaString;
  const cost = { ...(tx.payableManaCost || finalCost.cost) };
  tx.stage = 'payment';
  tx.proposedStackItem = {
    card:tx.card,
    isLocal:true,
    targetObj,
    type:buildCastStackType(tx.card),
    xValue:tx.xValue,
    castFrom:tx.castFrom,
    kicked:tx.kicked,
    exilePermissionId:tx.exilePermissionId || null,
    exilePlayEngineVersion:tx.exilePlayEngineVersion || null,
    suspendEngineVersion:tx.suspendEngineVersion || null,
    suspendHaste:!!tx.suspendHaste
  };
  state.pendingSpellIndex = tx.handIndex;
  state.pendingCost = cost;
  state.pendingAlternativeCostChosen = !!tx.useAlternative;
  state.pendingXValue = tx.xValue;
  state.pendingKicked = tx.kicked;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  recordTelemetryEvent('cast_cost_locked', {
    transactionId:tx.id, card:tx.card.name, targetCount:targetObj?.type === 'multi' ? targetObj.targets.length : (targetObj ? 1 : 0),
    manaCost:manaString || '{0}', finalManaCost:costEngineSummary({cost}), modifierCount:tx.costModifierTrace?.length||0,
    convokeCount:tx.preparedPaymentMethods?.convoke?.length||0, delveCount:tx.preparedPaymentMethods?.delve?.length||0,
    xValue:tx.xValue || 0, kicked:!!tx.kicked, alternative:!!tx.useAlternative
  });
  logMsg(gameText('cast.costLocked', { card: tx.card.name }));
  checkPaymentComplete();
  render();
  return true;
}

async function commitCastTransactionAfterMana() {
  const tx = state.pendingCastTransaction;
  if (!tx || tx.stage !== 'payment') return false;
  const prepared = tx.preparedComposite;
  const useAlternative = !!tx.useAlternative;

  // 23.15.4 — validar TODOS los recursos preparados antes de mutar ninguno. Convoke/Delve
  // son costos reales, no descuentos: si una criatura se giró por otra vía o una carta dejó
  // el cementerio durante el intento, el lanzamiento se revierte mientras todavía sea posible.
  if (!validatePreparedCastPaymentMethods(tx.preparedPaymentMethods) ||
      (tx.escapeExiles?.length && tx.escapeExiles.some(c => !state.localGraveyard.includes(c) || c === tx.card))) {
    logMsg(gameText('cast.costBecameUnpayable', { card: tx.card.name }));
    abortCastTransaction();
    return false;
  }

  // El origen público se revalida ANTES de comprometer vida/sacrificios/descartes/Delve.
  // En multiplayer un snapshot reentrante no puede hacer que pagues costos irreversibles por
  // una carta cuyo permiso u objeto exiliado ya dejó de existir.
  let exileCommitContext=null;
  if (tx.originZone === 'exile') {
    const originExile = tx.originExileIsLocal === false ? state.rivalExile : state.localExile;
    const physicalCard = tx.originalCard || tx.card;
    const exileIndex = originExile.indexOf(physicalCard);
    const controllerRole = state.currentMatch?.myRole || 'local';
    const permission = findExilePlayPermission(physicalCard, controllerRole);
    if (exileIndex === -1 || !permission || permission.permissionId !== tx.exilePermissionId) {
      logMsg(gameText('cast.originMissing', { card: tx.card.name }));
      abortCastTransaction();
      return false;
    }
    exileCommitContext={originExile,physicalCard,permission};
  }

  // 601.2h — commit atómico de costos no-maná preparados. No hubo ninguna mutación antes
  // de que el maná llegara a cero; si una referencia quedó inválida, aborta/rollback.
  if (!commitCastCompositeNonManaCosts(tx.card, true, prepared, useAlternative)) {
    logMsg(gameText('cast.costBecameUnpayable', { card: tx.card.name }));
    abortCastTransaction();
    return false;
  }
  if (tx.escapeExiles?.length) {
    tx.escapeExiles.forEach(c => {
      const idx = state.localGraveyard.indexOf(c);
      if (idx >= 0) state.localGraveyard.splice(idx, 1);
    });
    state.localExile.push(...tx.escapeExiles);
    tx.escapeExiles.forEach(exiledCard => dispatchGameEvent({
      type:'card_exiled',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:true,
      card:exiledCard,zoneFrom:'graveyard',zoneTo:'exile',cause:'escape_cost'
    }));
    state.pendingSpellCostsIrreversible = true;
  }

  if (!commitPreparedCastPaymentMethods(tx.card, tx.preparedPaymentMethods)) {
    // La validación previa debería hacer este camino inalcanzable salvo mutación reentrante.
    state.pendingSpellCostsIrreversible = true;
    resetCastTransactionState();
    render();
    return false;
  }

  // 23.16.2 — la carta puede originarse realmente en Exilio. A diferencia del legacy
  // Flashback/Escape, NO la prestamos a la mano durante anuncio/targets/pago: permanece
  // públicamente en Exilio hasta el commit CR601.2h, evitando un parpadeo público→privado
  // durante multiplayer.
  if (tx.originZone === 'exile') {
    const {originExile,physicalCard}=exileCommitContext;
    // Una carta modal usa un snapshot resuelto para el Stack, pero el objeto físico que sigue
    // en Exilio es originalCard. La identidad ya fue validada antes de comprometer costos.
    const exileIndex=originExile.indexOf(physicalCard);
    originExile.splice(exileIndex, 1);
    consumeExilePlayPermission(physicalCard, tx.exilePermissionId);
    clearExilePlayStateOnLeave(physicalCard);
    if (physicalCard?._suspendState) clearSuspendState(physicalCard);
    // Si modos crearon un snapshot distinto, éste tampoco debe llevar metadata de un objeto
    // que ya no está exiliado al Stack.
    if (tx.card !== physicalCard) { clearExilePlayStateOnLeave(tx.card); if (tx.card?._suspendState) clearSuspendState(tx.card); }
  } else {
    const cardIndex = state.localHand.indexOf(tx.card);
    if (cardIndex === -1) {
      logMsg(gameText('cast.originMissing', { card: tx.card.name }));
      resetCastTransactionState();
      render();
      return false;
    }
    state.localHand.splice(cardIndex, 1);
  }
  const stackItem = { ...tx.proposedStackItem, card:tx.card };
  addToStack(stackItem);
  flushDeferredLandManaTriggers();
  state.consecutivePasses = 0;
  const ward = tx.ward;
  const txId = tx.id;
  const cardName = tx.card.name;
  const castCard = tx.card;
  resetCastTransactionState();
  state.pendingCastFrom = null;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  logMsg(gameText('cast.cr601Complete', { card: cardName }));
  recordTelemetryEvent('cast_transaction_committed', { transactionId:txId, card:cardName, stackId:stackItem.id || null });
  render();
  await triggerSpellCast(true, castCard, stackItem);
  if (tx.castFrom === 'suspend') settleSuspendCastResolution(true);

  // Ward ya NO interrumpe la declaración/pago. Se dispara después de que el hechizo está
  // realmente casteado. Sigue siendo un prompt simplificado (la habilidad Ward aún no es
  // un objeto separado de Stack), pero su timing ya no viola 601.2.
  if (ward) {
    state.pendingWardChoice = { ...ward, stackId:stackItem.id, postCast:true };
    logMsg(gameText('ward.triggered', { target: ward.targetObj.item.card.name, cost: ward.wardCost }));
    render();
  } else {
    checkRivalCounterOrResponse();
  }
  return true;
}

export function playCard(index) {
  const card = state.localHand[index];
  
  if (!canPlayCard(card)) {
    logMsg(gameText('cast.cantPlay', { card: card.name }));
    return;
  }

  if (card.type.includes('Tierra')) {
    if (state.localLandPlayedThisTurn) { logMsg(gameText('cast.landAlready')); return; }
    if (state.activePlayer !== 'local' || (state.phase !== 'main1' && state.phase !== 'main2')) {
      logMsg(gameText('cast.landMainOnly'));
      return;
    }
    const entersTapped = landEntersTappedForBattlefield(card, true);
    stampCardOwner(card, true, state.currentMatch?.myRole || null);
    const landItem = { card, tapped: entersTapped, enteredThisTurn: true, permanentTypes: ['land'] };
    initializeTransformPermanentItem(landItem,card,{face:'front'});
    stampPermanentController(landItem, true, state.currentMatch?.myRole || null);
    state.localLands.push(landItem); state.localHand.splice(index, 1); state.localLandPlayedThisTurn = true;
    logMsg(entersTapped ? gameText('cast.landPlayedTapped', { card: card.name }) : gameText('cast.landPlayed', { card: card.name }));
    // PUNTO 2: jugar una Tierra es una entrada real al campo y dispara Landfall. No esperamos
    // acá para conservar el contrato síncrono histórico de playCard(); triggerLandEtb se ocupa
    // de serializar internamente cualquier decisión interactiva y los flags bloquean la UI.
    triggerLandEtb(true, card, landItem).catch(err => {
      console.error('Error resolviendo Landfall al jugar una Tierra:', err);
      logMsg(gameText('trigger.landfallError', { card: card.name }));
      render();
    });
    resetPriorityClock('land_played');
    render(); return;
  }

  if (card.effect && card.effect.type && card.effect.type.startsWith('counter')) {
    if (!spellStack || spellStack.length === 0) {
      logMsg(gameText('counter.noSpell'));
      return;
    }
  }

  if (card.effect?.type === 'proliferate') {
    const proliferables = getProliferateCandidates(state);
    recordTelemetryEvent('proliferate_precast_scan', {
      card: card.name,
      eligibleCount: proliferables.length,
      eligible: proliferables.map(entry => ({
        side: entry.ownerIsLocal ? 'local' : 'rival',
        kind: entry.kind,
        cardId: entry.item?.card?.id || null,
        cardName: entry.item?.card?.name || null,
        counterTypes: entry.counterTypes || []
      }))
    });
    if (proliferables.length === 0 && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(`⚠️ ${card.name}: ahora mismo no se detecta ningún permanente o jugador con contadores. Proliferar puede elegir cero, así que el hechizo es legal pero podría no hacer nada. ¿Querés lanzarlo igual?`);
      if (!ok) {
        logMsg(gameText('proliferate.cancelNoCounters', { card: card.name }));
        return;
      }
    }
  }

  // ENTREGA 23.10: desde acá TODO hechizo entra al pipeline único de anuncio/targets/costos/pago.
  // La carta no puede saltar a payment por una rama modal particular.
  beginHumanCastTransaction(index, card);
}

// Lanzar una carta con Flashback desde el cementerio: la movemos TEMPORALMENTE a la mano
// para reusar TODO el flujo normal de pago y targeting sin duplicar código (el resto del
// motor ya sabe hacer esto bien) — con el costo de Flashback en vez del normal. Al
// resolverse, stackManager.js la manda a Exilio en vez de al cementerio (regla real).
// Lanzar una carta desde el cementerio, ya sea por Flashback o por Escape. Comparten TODO
// el mismo esqueleto (mover temporalmente a la mano, pagar un costo de maná propio,
// resolver como cualquier otra carta) — lo único que cambia es de dónde sale el costo, y
// que Escape pide ADEMÁS exiliar N cartas más del cementerio (eso se resuelve más
// adelante, en checkPaymentComplete, al mismo tiempo que cualquier otro costo adicional).
export function castFromGraveyard(card, isLocal) {
  if (!isLocal) return; // nunca podés lanzar del cementerio del Tano
  const source = card.flashback ? 'flashback' : (card.escape ? 'escape' : null);
  if (!source) return;
  const ability = source === 'flashback' ? card.flashback : card.escape;
  const abilityLabel = source === 'flashback' ? 'Flashback' : 'Escape';

  if (state.gameOver || state.priorityPlayer !== 'local') { logMsg(gameText('cast.needPriority')); return; }
  if (state.pendingCastTransaction || state.pendingAlternativeCostChoice || state.pendingPrivateZoneChoice || state.pendingLandSearchChoice || state.pendingLibraryChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingFightChoice || state.pendingXChoice || state.pendingModeChoice || state.pendingLoyaltyTargetChoice || state.pendingMultiTargetChoice || state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0 || state.pendingEscapeExileChoice || state.pendingKickerChoice || state.pendingRampChoice) {
    logMsg(gameText('cast.pending', { ability: abilityLabel }));
    return;
  }

  // Punto 14: Flashback/Escape también pagan cualquier costo adicional compuesto. Como
  // la carta fuente todavía está en el cementerio, no hace falta excluirla de la mano.
  if (!canPayCastCompositeNonManaCosts(card, true, false)) {
    logMsg(gameText('cast.additionalInsufficient', { card: card.name }));
    return;
  }

  // Escape (regla real 702.130): además del costo de maná, pide exiliar N cartas MÁS de tu
  // cementerio (sin contar a la carta misma). Si no hay suficientes, ni arranca — no tiene
  // sentido sacarla de la mano para después descubrir que no se puede pagar.
  if (source === 'escape') {
    const exileCount = ability.exileCount || 0;
    const extraCostExiles = getCastCompositeCostBundle(card, false).graveyardExiles.reduce((sum, spec) => sum + (spec.amount || 0), 0);
    const otherCount = state.localGraveyard.filter(c => c !== card).length;
    if (otherCount < exileCount + extraCostExiles) {
      logMsg(gameText('cast.escapeOverlap', { escape: exileCount, extra: extraCostExiles, card: card.name }));
      return;
    }
  }

  const isInstant = card.type.includes('Instantáneo') || (card.keywords && card.keywords.includes('flash'));
  if (spellStack.length > 0 && !isInstant) {
    logMsg(gameText('cast.stackInstantOnly'));
    return;
  }
  if (!isInstant && !(state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2'))) {
    logMsg(gameText('cast.graveMainOnly', { ability: abilityLabel }));
    return;
  }

  const grave = state.localGraveyard;
  const idx = grave.indexOf(card);
  if (idx === -1) return;
  grave.splice(idx, 1);

  const newIndex = state.localHand.length;
  state.localHand.push(card);
  state.pendingCastFrom = source;
  logMsg(gameText('cast.graveAnnounce', { card: card.name, ability: abilityLabel, cost: ability.cost }));
  beginHumanCastTransaction(newIndex, card, { castFrom:source, baseOverride:ability.cost });
}


// Costo adicional obligatorio de una carta (vida o descarte), distinto de un costo
// ALTERNATIVO (que reemplaza al maná — ver payWithAlternativeCost más abajo): este se paga
// SIEMPRE, además del maná normal, sin excepción — como "Costo adicional: descartá una
// carta" en MTG real. `card` ya está desconectado de si sigue físicamente en la mano o no
// en este punto exacto (según si necesita target o no), así que lo excluimos por referencia,
// no por índice, para nunca descartarse a sí misma por error.
export function payAdditionalCost(card, isLocal) {
  if (!card?.additionalCost) return null;
  const ac = card.additionalCost;
  // API legacy preservada byte-semánticamente para callers externos y tests antiguos.
  if (ac.type === 'life') {
    if (isLocal) state.localHP -= ac.amount; else state.rivalHP -= ac.amount;
    logMsg(gameText('cast.additionalLifePaid', { card: card.name, amount: ac.amount }));
    return null;
  }
  if (ac.type === 'discard') {
    return discardCardsFromHand({
      victimIsLocal: isLocal,
      amount: ac.amount || 1,
      selection: ac.selection || 'choice',
      cardName: card.name,
      reason: 'additional_cost',
      requireExact: true,
      excludeCard: isLocal ? card : null
    }).then(result => {
      if (!result.completed) throw new Error(`No hay suficientes cartas para pagar el costo adicional de ${card.name}.`);
      if (result.discardedNames.length > 0) logMsg(gameText('cast.additionalDiscardPaid', { card: card.name, cards: result.discardedNames.join(', ') }));
      return result;
    });
  }
  if (!compositeCostHasNonMana(ac)) return null;
  return payCastCompositeNonManaCosts(card, isLocal, false);
}

// LAND 5 — puerta única para reemplazos de entrada de Tierras. Todas las rutas (mano,
// tutor, cementerio, bot) deben consultar esta función para que Root Maze/Thalia-style no
// dependa del origen desde el que la Tierra llegó.
export function landEntersTappedForBattlefield(card, isLocal = true, forcedTapped = false) {
  return shouldLandEnterTapped(state, card, isLocal, forcedTapped);
}

function shouldDeferLandManaTriggers() {
  return !!(state.pendingCost || state.pendingCastTransaction || state.pendingSpellIndex !== null ||
    state.pendingAbilitySource || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay ||
    state.pendingCompositeCostPayment);
}

export function flushDeferredLandManaTriggers() {
  const pending = Array.isArray(state.deferredLandManaTriggers) ? state.deferredLandManaTriggers.splice(0) : [];
  if (!pending.length) return [];
  const queued = queueTriggeredAbilities(pending);
  recordTelemetryEvent('land_mana_triggers_flushed', { count:queued.length });
  return queued;
}


// 23.16.1 — acción de turno de Saga. Ocurre una sola vez al COMENZAR main1, antes de que
// el jugador activo reciba prioridad. No corre en main2 y no depende de Upkeep.
export async function advanceSagaLoreForPrecombatMainPhase(isLocal) {
  const side=isLocal!==false;
  const entries=[];
  const seen=new Set();
  for(const watcher of genericBattlefieldWatchers()){
    if(watcher.isLocal!==side || !watcher.item?.card || !isSagaCard(watcher.item.card)) continue;
    const identity=watcher.item._syncObjectId || watcher.item._effectObjectId || watcher.item;
    if(seen.has(identity)) continue; seen.add(identity);
    const result=addCountersDetailed(watcher.item,'lore',1,{queue:false,cause:'saga_precombat_main',actorIsLocal:side});
    entries.push(...result.entries);
    if(result.added>0) logMsg(gameText('saga.mainLore',{card:watcher.item.card.name,lore:result.after}));
  }
  if(entries.length) {
    queueGeneratedTriggerEntries(entries,'saga_precombat_main',{forceImmediate:true});
    // A diferencia de un hechizo resolviéndose, main1 no tiene un StackManager que haga
    // el chequeo posterior por nosotros. Orden/targets y SBA deben terminar ANTES de prioridad.
    await waitForTriggerOrdering();
    if(hasStateBasedActionsToProcess()) await runStateBasedActions({reason:'saga_precombat_main'});
  }
  return entries;
}

// Captura el evento EN EL MOMENTO DEL TAP, antes de que un coste adicional pueda sacrificar
// la propia Tierra. Eso preserva LKI suficiente para que una fuente que dispara por su propio
// tap no pierda el trigger simplemente porque también se sacrificó para producir maná.
export function captureLandTappedForManaEvent(item, isLocal, producedType) {
  if (!item?.card || !isLandPermanent(item)) return { bonuses:[], triggers:[] };
  return {
    bonuses:getLandManaBonuses(state, isLocal, item, producedType),
    triggers:getLandManaTriggerEntries(state, isLocal, item)
  };
}

// Evento central "una Tierra fue girada para maná". Mana Flare-style bonus es una triggered
// mana ability y resuelve YA; Manabarbs-style es un trigger normal y usa Stack. Si el evento
// nació durante 601/602, ese trigger normal se difiere hasta que el objeto pagado esté en Stack.
export function handleLandTappedForManaEvent(item, isLocal, producedType, producedAmount = 1, options = {}) {
  if (!item?.card || !isLandPermanent(item)) return { bonuses:[], triggers:[] };
  const pool = isLocal ? state.localManaPool : state.rivalManaPool;
  const snapshot = options?.eventSnapshot || captureLandTappedForManaEvent(item, isLocal, producedType);
  const bonuses = snapshot.bonuses || [];
  for (const bonus of bonuses) {
    addMana(pool, bonus.type, bonus.amount);
    logMsg(gameText('land.stax.manaBonus', { card:bonus.sourceCard?.name || gameText('land.stax.unknownSource'), amount:bonus.amount, mana:`{${bonus.type}}` }));
  }
  const entries = snapshot.triggers || [];
  const deferNormalTriggers = options?.forceDeferNormalTriggers === true || shouldDeferLandManaTriggers();
  if (entries.length) {
    if (deferNormalTriggers) state.deferredLandManaTriggers.push(...entries);
    else queueTriggeredAbilities(entries);
  }
  recordTelemetryEvent('land_tapped_for_mana', {
    player:isLocal?'local':'rival', card:item.card.name, producedType, producedAmount,
    bonusMana:bonuses.reduce((n,b)=>n+b.amount,0), triggerCount:entries.length,
    deferred:entries.length > 0 && deferNormalTriggers
  });
  return { bonuses, triggers:entries };
}

// 23.14.1 — MANA POOL REAL. Toda fuente primero AGREGA maná a la reserva; pagar es una
// acción separada sobre los símbolos del pool. Esto permite flotar maná, conservar sobrantes
// de fuentes multi-maná y usar maná producido antes de empezar a castear.
function ensureManaPaymentSnapshot() {
  if (!state.pendingCost || state.paymentManaPoolSnapshot) return;
  state.paymentManaPoolSnapshot = cloneManaPool(state.localManaPool);
}

function restoreManaPaymentSnapshot() {
  if (!state.paymentManaPoolSnapshot) return;
  state.localManaPool = cloneManaPool(state.paymentManaPoolSnapshot);
  state.paymentManaPoolSnapshot = null;
  // Cancelar/rehacer un pago revierte las mana abilities activadas durante ese intento. Los
  // triggers normales LAND 5 capturados por esos taps deben revertirse junto con ellas; de
  // lo contrario un casteo cancelado podría dejar un Manabarbs fantasma para el próximo spell.
  if (Array.isArray(state.deferredLandManaTriggers)) state.deferredLandManaTriggers.splice(0);
}

function commitManaPaymentSnapshot() {
  state.paymentManaPoolSnapshot = null;
}

function effectiveManaAbilityForItem(item, isLocal = true) {
  if (!item?.card) return null;
  const printed = normalizeManaAbility(item.card);
  return isLandPermanent(item) ? getEffectiveLandManaAbility(state, item, isLocal, printed) : printed;
}

function manaSourceOptions(source, isLocal = true) {
  if (source?.card) return effectiveManaAbilityForItem(source, isLocal)?.options || [];
  return getManaSourceOptions(source);
}

function manaSourceAmount(source, isLocal = true) {
  if (source?.card) return effectiveManaAbilityForItem(source, isLocal)?.amount || 0;
  return getManaSourceAmount(source);
}

function manaSourceRequiresTapEffective(source, isLocal = true) {
  if (source?.card) return !!effectiveManaAbilityForItem(source, isLocal)?.requiresTap;
  return manaSourceRequiresTap(source);
}

function manaSourceSacrificesEffective(source, isLocal = true) {
  if (source?.card) return !!effectiveManaAbilityForItem(source, isLocal)?.sacrificeSelf;
  return manaSourceSacrificesSelf(source);
}

export function canActivateLocalManaAbility(item) {
  if (!item?.card || state.gameOver) return false;
  if (state.pendingCastTransaction?.preparedPaymentMethods?.convoke?.includes(item)) return false;
  if (!canActivateManaSourcePermanent(item, { hasHaste: getEffectiveKeywords(item).some(k => String(k).toLowerCase() === 'haste'), ability: effectiveManaAbilityForItem(item, true) })) return false;
  // CR 605.3a: durante 601/602 una mana ability puede activarse en la ventana de pago aun
  // sin prioridad. Fuera de un pago requiere prioridad; Enderezar/Limpieza no la conceden
  // en el modelo normal de Argentinia.
  if (state.pendingCost && (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCastTransaction?.stage === 'payment')) return true;
  // CR 605.3a también habilita mana abilities cuando una regla/efecto pide un pago durante
  // resolución. Ward y "contrarrestar a menos que pagues" son las ventanas reales que hoy
  // existen en el pool; no requieren que el jugador tenga prioridad en ese instante.
  if (state.pendingWardChoice || state.pendingCounterUnlessPay) return true;
  if (state.priorityPlayer !== 'local') return false;
  if (state.phase === 'untap' || state.phase === 'cleanup') return false;
  // Declarar atacantes/bloqueadores es una acción basada en turno ANTES de que se otorgue
  // prioridad en ese paso. El HUD del motor comparte la pantalla con esa selección, así que
  // cerramos la ventana de maná hasta que la declaración quede confirmada. Si alguna futura
  // regla exige pagar PARA declarar, entrará por la excepción de pago de arriba (CR 605.3a).
  if (state.phase === 'combat_attackers' && state.activePlayer === 'local' && (state.localAttackersDeclaredThisTurn || 0) === 0) return false;
  if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && !state.localBlockersDeclaredThisCombat) return false;
  if (state.multiplayerWaitingForReady || state.damageModalOpen || state.awaitingRivalDecision || state.respondingToDecision) return false;
  // No se abre una mana ability a mitad de otra elección 601/602 anterior a la ventana 601.2g.
  if (state.pendingTargetCard || state.pendingModeChoice || state.pendingXChoice || state.pendingKickerChoice ||
      state.pendingLoyaltyTargetChoice || state.pendingMultiTargetChoice || state.pendingScrySurveilChoice ||
      state.pendingProliferateChoice || state.pendingDiscardChoice || state.pendingSacrificeChoice ||
      state.pendingResolvedEffectTargetChoice || state.pendingRampChoice || state.pendingCrew) return false;
  return true;
}

function produceManaFromSource(item, isLocal, chosenType) {
  if (!item?.card || !canActivateManaSourcePermanent(item, { hasHaste: getEffectiveKeywords(item).some(k => String(k).toLowerCase() === 'haste'), ability: effectiveManaAbilityForItem(item, isLocal) })) return false;
  const options = manaSourceOptions(item, isLocal);
  const type = chosenType || (options.length === 1 ? options[0] : null);
  if (!type || !options.includes(type)) return false;
  if (isLocal) {
    if (!canActivateLocalManaAbility(item)) {
      logMsg(gameText('mana.noWindow'));
      return false;
    }
    if (state.pendingCost) ensureManaPaymentSnapshot();
  }
  const pool = isLocal ? state.localManaPool : state.rivalManaPool;
  const ability = effectiveManaAbilityForItem(item, isLocal);
  const amount = manaSourceAmount(item, isLocal);
  const wasTapped = !!item.tapped;
  // CR 602/605: primero se pagan los costes de la habilidad ({T}, sacrificar, etc.) y
  // recién después su efecto agrega maná. Como es una mana ability, todo ocurre sin Stack
  // ni ventana de respuesta entre costo y producción.
  if (ability.sacrificeSelf && isLocal && state.pendingCost) rememberManaSourceRollback(item, isLocal, wasTapped, ability);
  if (ability.requiresTap) {
    item.tapped = true;
    if(!wasTapped) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(item.card,isLocal,state.currentMatch?.myRole||null),card:item.card,item,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'mana_ability'});
  }
  if (isLocal && state.pendingCost && ability.requiresTap) state.tappedLandsThisSpell.push(item);
  const landManaEventSnapshot = ability.requiresTap && isLandPermanent(item)
    ? captureLandTappedForManaEvent(item, isLocal, type) : null;
  if (ability.sacrificeSelf) performSacrifice(item, isLocal);
  addMana(pool, type, amount);
  const landManaEvent = landManaEventSnapshot
    ? handleLandTappedForManaEvent(item, isLocal, type, amount, { eventSnapshot:landManaEventSnapshot })
    : { bonuses:[] };

  // UX tipo Arena + regla real: durante 601.2g/602, clickear una fuente puede pagar el
  // coste directamente. La producción COMPLETA entra primero al pool; consumimos como máximo
  // lo que esa activación acaba de producir y todo excedente queda flotando. El maná que ya
  // estaba en el pool antes de clickear la fuente NO se auto-gasta: el jugador lo elige desde
  // los iconos del HUD.
  let autoSpent = 0;
  if (isLocal && state.pendingCost) {
    for (let i = 0; i < amount; i += 1) {
      const spent = spendOneMana(pool, state.pendingCost, type);
      if (!spent) break;
      autoSpent += 1;
    }
    for (const bonus of landManaEvent.bonuses || []) {
      for (let i = 0; i < bonus.amount; i += 1) {
        const spent = spendOneMana(pool, state.pendingCost, bonus.type);
        if (!spent) break;
        autoSpent += 1;
      }
    }
  }

  logMsg(gameText('mana.added', { card: item.card.name, amount, mana: `{${type}}` }));
  recordTelemetryEvent('mana_added_to_pool', { player: isLocal ? 'local' : 'rival', card:item.card.name, type, amount, autoSpent, duringPayment:!!state.pendingCost });
  if (isLocal && autoSpent > 0) checkPaymentComplete();
  render();
  return true;
}

function chooseAndProduceMana(item, isLocal) {
  const options = manaSourceOptions(item, isLocal);
  if (options.length <= 1) return produceManaFromSource(item, isLocal, options[0]);
  if (!isLocal) return produceManaFromSource(item, false, options[0]);
  showManaColorChoiceModal(item.card.name, options, (type) => {
    produceManaFromSource(item, true, type);
  });
  return true;
}

// Click de un símbolo real del HUD: sirve para gastar maná que ya estaba flotando o que
// sobró de una fuente. Consume exactamente UNA unidad. Maná de color paga primero su pip
// específico y después genérico; {C} paga {C} o genérico.
export function spendLocalManaFromPool(type) {
  if (!state.pendingCost) {
    logMsg(gameText('mana.pool.noPayment'));
    return false;
  }
  ensureManaPaymentSnapshot();
  const spent = spendOneMana(state.localManaPool, state.pendingCost, type);
  if (!spent) {
    logMsg(gameText('mana.pool.cannotSpend', { mana:`{${type}}` }));
    render();
    return false;
  }
  recordTelemetryEvent('mana_spent_from_pool', { type, paid:spent.paid, remaining:manaPoolTotal(state.localManaPool) });
  checkPaymentComplete();
  render();
  return true;
}

export function activateLocalManaSource(item) {
  if (!canActivateLocalManaAbility(item)) {
    logMsg(item?.tapped ? gameText('mana.sourceAlreadyTapped', { card:item?.card?.name || 'La fuente' }) : gameText('mana.noWindow'));
    return false;
  }
  return chooseAndProduceMana(item, true);
}

// Para automatismos/IA: agrega al pool rival con el color elegido y no usa la Stack.
export function activateRivalManaSource(item, chosenType = null) {
  return produceManaFromSource(item, false, chosenType || manaSourceOptions(item, false)[0]);
}

export function getManaSourceProductionOptions(card) { return manaSourceOptions(card); }

// Nombre legacy conservado para UI/tests: en 23.14.1 una fuente de maná ya no "paga"
// directamente el coste; si hay un pago abierto, cualquier fuente real puede activarse y
// agregar su producción completa al pool, incluso si queda maná sobrante.
export function canManaSourcePayPendingCost(source, isLocal = true) {
  return !!state.pendingCost && manaSourceOptions(source, isLocal).length > 0;
}

function rememberManaSourceRollback(item, isLocal, originalTapped = false, effectiveAbility = null) {
  if (!item?.card || !(effectiveAbility?.sacrificeSelf ?? manaSourceSacrificesEffective(item, isLocal))) return;
  const zones = isLocal
    ? [['combat', state.localCombat], ['support', state.localSupport], ['lands', state.localLands]]
    : [['combat', state.rivalCombat], ['support', state.rivalSupport], ['lands', state.rivalLands]];
  for (const [zoneName, zone] of zones) {
    const index = zone.indexOf(item);
    if (index === -1) continue;
    state.paymentManaSourceRollbacks.push({ item, card: item.card, isLocal, zoneName, index, originalTapped:!!originalTapped });
    return;
  }
}

function restorePaymentManaSources() {
  const rollbacks = Array.isArray(state.paymentManaSourceRollbacks) ? [...state.paymentManaSourceRollbacks] : [];
  // Restauramos en orden inverso para preservar índices si alguna vez se sacrifican varias
  // fuentes de la misma zona durante un único pago.
  rollbacks.reverse().forEach(entry => {
    const grave = entry.isLocal ? state.localGraveyard : state.rivalGraveyard;
    const zoneMap = entry.isLocal
      ? { combat: state.localCombat, support: state.localSupport, lands: state.localLands }
      : { combat: state.rivalCombat, support: state.rivalSupport, lands: state.rivalLands };
    const zone = zoneMap[entry.zoneName];
    if (!zone || zone.includes(entry.item)) return;
    const graveIdx = grave.indexOf(entry.card);
    if (graveIdx !== -1) grave.splice(graveIdx, 1);
    entry.item.tapped = !!entry.originalTapped;
    zone.splice(Math.max(0, Math.min(entry.index, zone.length)), 0, entry.item);
  });
  state.paymentManaSourceRollbacks = [];
}

// Punto 13: una fuente de maná que ADEMÁS está pagando {T} para su propia habilidad
// utility no puede usarse dos veces en el mismo costo. Ej.: una Tierra con "{T}, {2}: ..."
// debe reservar su propio giro para {T}; las otras tierras pagan el {2}. La misma regla
// sirve defensivamente para mana rocks con habilidad propia.
//
// Fuentes de maná de mesa (Tierras o mana rocks / Treasures). Desde 23.14.1 producen
// maná hacia una reserva flotante real aun fuera de un pago cuando CR 605.3a lo permite.
// Si `sacrificeOnTap` es true (estilo Treasure), se sacrifica apenas rinde el maná.
function tapSupportManaSource(item, isLocal) {
  if (state.pendingAbilitySource?.requiresTap) {
    const reservedTapTarget = state.pendingAbilitySource.tapTarget || state.pendingAbilitySource.item;
    if (reservedTapTarget === item) {
      logMsg(gameText('mana.sourceReservedTap', { card: item.card.name }));
      return;
    }
  }
  if (item.tapped) { logMsg(gameText('mana.sourceAlreadyTapped', { card: item.card.name })); return; }
  const card = item.card;

  // 23.7.2: un mismo permanente no puede ser sacrificado dos veces para dos componentes
  // distintos del mismo costo. Si Chatarrero pide {1} + sacrificar un artefacto y este
  // Fajo es el ÚNICO artefacto elegible, consumirlo como mana source dejaría el costo
  // imposible. Lo frenamos antes de mutar nada; con otro artefacto presente sí es legal.
  const pendingSacrifice = state.pendingAbilitySource?.ability?.sacrifice;
  if (manaSourceSacrificesSelf(card) && pendingSacrifice && pendingSacrifice !== 'self') {
    const ownPermanents = [...state.localCombat, ...state.localSupport];
    const remainingCandidates = ownPermanents.filter(candidate => candidate !== item && isSacrificeCandidate(candidate, pendingSacrifice));
    if (isSacrificeCandidate(item, pendingSacrifice) && remainingCandidates.length === 0) {
      logMsg(gameText('mana.sacrificeConflict', { card: card.name, kind: pendingSacrifice === 'artifact' ? 'artefacto' : 'permanente' }));
      return;
    }
  }
  // 23.14.1: producir y pagar son acciones distintas. La fuente puede generar de sobra;
  // todo entra primero al pool y el sobrante permanece hasta el final del paso/fase.
  chooseAndProduceMana(item, isLocal);
}

export function startCrewing(item, isLocal, ability = getActivatedAbilities(item.card).find(ab => ab.crewCost !== undefined), abilityIndex = null) {
  const required = ability?.crewCost;
  if (required === undefined) return;
  if (abilityIndex === null || abilityIndex === undefined) abilityIndex = Math.max(0, getActivatedAbilities(item.card).indexOf(ability));
  state.pendingCrew = { item, isLocal, required, ability, abilityIndex, selected: [], powerSoFar: 0 };
  logMsg(gameText('crew.choose', { card: item.card.name, required }));
  render();
}

// Clickear una criatura propia mientras hay una tripulación pendiente: la suma (girándola)
// o la saca (des-girándola) si ya estaba elegida. Sin restricción de mareo de invocación:
// tripular NO es "usar la habilidad de la criatura" ni "atacar", así que el mareo no aplica
// acá (regla 302.6) — una criatura recién bajada SÍ puede ayudar a tripular.
export function handleCrewClick(item, isLocal) {
  const pc = state.pendingCrew;
  if (!pc) return false;

  if (!isLocal) {
    logMsg(gameText('crew.ownOnly'));
    return true;
  }

  // Desde NEO/CR 702.122: un Vehicle no puede pagar su propia habilidad de Crew.
  // Esto importa si ya es criatura (por Crew previo u otra animación) y por eso aparece
  // entre los candidatos del Combat.
  if (item === pc.item) {
    logMsg(gameText('crew.selfNotAllowed', { card: item.card.name }));
    return true;
  }

  const alreadyIdx = pc.selected.indexOf(item);
  if (alreadyIdx !== -1) {
    pc.selected.splice(alreadyIdx, 1);
    item.tapped = false;
    pc.powerSoFar -= getEffectivePower(item);
    render();
    return true;
  }

  if (item.tapped) {
    logMsg(gameText('crew.tapped', { card: item.card.name }));
    return true;
  }

  pc.selected.push(item);
  item.tapped = true;
  // La selección de Crew es reversible hasta confirmar. El evento real de tap se emite en
  // confirmCrew(), para que quitar una criatura de la selección o cancelar no genere triggers fantasma.
  pc.powerSoFar += getEffectivePower(item);
  logMsg(gameText('crew.added', { card: item.card.name, power: pc.powerSoFar, required: pc.required }));
  // Crew permite girar CUALQUIER cantidad de criaturas cuya fuerza total alcance el coste.
  // No auto-confirmamos al llegar a N: el jugador puede elegir tripulantes adicionales y
  // compromete el coste recién al pulsar «Confirmar Tripular».
  render();
  return true;
}

export function confirmCrew() {
  const pc = state.pendingCrew;
  if (!pc) return;
  if (pc.powerSoFar < pc.required) {
    logMsg(gameText('crew.needMore', { card: pc.item.card.name, power: pc.powerSoFar, required: pc.required }));
    return;
  }

  // Revalidación final antes de comprometer el coste: la fuente debe seguir en battlefield
  // bajo nuestro control y debemos conservar prioridad. Las criaturas elegidas ya están
  // giradas provisionalmente; si esto falla, cancelCrew() las devuelve a su estado previo.
  const sourceLocation = findBattlefieldItemLocation(pc.item);
  const expectedController = pc.isLocal ? 'local' : 'rival';
  if (!sourceLocation || (sourceLocation.isLocal ? 'local' : 'rival') !== expectedController || state.priorityPlayer !== expectedController) {
    logMsg(gameText('crew.unavailable', { card: pc.item.card.name }));
    cancelCrew();
    return;
  }

  // Girar criaturas es el COSTE de Crew. Los triggers que nazcan por esos taps se difieren
  // hasta que la habilidad de Crew haya sido puesta en la Stack; después se apilan encima.
  for (const crewItem of pc.selected) {
    dispatchGameEvent({
      type:'permanent_tapped', controllerIsLocal:pc.isLocal!==false, actorIsLocal:pc.isLocal!==false,
      ownerIsLocal:cardOwnerIsLocal(crewItem.card,pc.isLocal!==false,state.currentMatch?.myRole||null),
      card:crewItem.card, item:crewItem, zoneFrom:'battlefield', zoneTo:'battlefield', cause:'crew'
    });
  }

  const ability = pc.ability || getActivatedAbilities(pc.item.card).find(ab => ab.crewCost !== undefined);
  const stackItem = {
    card: pc.item.card,
    isLocal: pc.isLocal,
    targetObj: null,
    type: 'ability',
    abilityKind: 'own',
    ability: { ...ability, effect: { ...(ability?.effect || {}), type:'crew_vehicle' } },
    sourceItem: pc.item,
    source: { type:'crew_activation', abilityIndex: pc.abilityIndex ?? 0, sourceItem:pc.item }
  };
  addToStack(stackItem);
  state.pendingCrew = null;
  flushDeferredLandManaTriggers();
  state.consecutivePasses = 0;
  logMsg(gameText('crew.activated', { card: pc.item.card.name, power: pc.powerSoFar, required: pc.required }));
  render();
  if (pc.isLocal) checkRivalCounterOrResponse();
}

export function cancelCrew() {
  const pc = state.pendingCrew;
  if (!pc) return;
  pc.selected.forEach(item => { item.tapped = false; });
  logMsg(gameText('crew.cancel', { card: pc.item.card.name }));
  state.pendingCrew = null;
  render();
}

// Pagar el impuesto de "contrarresta a menos que pague": tu hechizo amenazado sigue en la
// pila sin cambios, y el counterspell que lo amenazaba no hizo nada más — se resolvió sin
// efecto (regla real de MTG: pagar la condición hace que el hechizo de contrarrestar
// simplemente no cuente para nada).
export function payCounterTax() {
  const pc = state.pendingCounterUnlessPay;
  if (!pc) return;
  const paid = tryAutoPayCounterTax(true, pc.amount);
  if (!paid) {
    logMsg(gameText('counterTax.noMana', { cost: `{${pc.amount}}` }));
    declineCounterTax();
    return;
  }
  logMsg(gameText('counterTax.paid', { cost: `{${pc.amount}}`, card: pc.targetCardName }));
  // El counterspell (Impuesto País, etc.) ya cumplió su función — se va a destino igual
  // que cualquier otro hechizo resuelto (antes esto se perdía sin ir a ningún lado).
  sendCounterspellAway(pc);
  state.pendingCounterUnlessPay = null;
  flushDeferredLandManaTriggers();
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  render();
  resumeAfterInteractiveEffect();
}

// No pagar: el hechizo amenazado se contrarresta de verdad y se saca de la pila.
// ETAPA MOTOR 2: su destino depende de cómo fue lanzado (Flashback -> Exilio; normal/Escape -> Cementerio).
export function declineCounterTax() {
  const pc = state.pendingCounterUnlessPay;
  if (!pc) return;
  const targetIndex = spellStack.findIndex(s => s.id === pc.targetStackId);
  if (targetIndex !== -1) {
    const counteredItem = spellStack.splice(targetIndex, 1)[0];
    logMsg(gameText('counterTax.declined', { card: counteredItem.card.name }));
    // ETAPA MOTOR 2: Flashback contrarrestado se exilia; una habilidad contrarrestada no
    // manda su permanente fuente al cementerio. Misma regla que usa stackManager.js.
    const destination=moveCounteredStackItemToDestination(counteredItem,state);
    dispatchGameEvent({type:'spell_countered',controllerIsLocal:counteredItem.isLocal!==false,actorIsLocal:pc.counterIsLocal!==false,card:counteredItem.card,item:counteredItem,zoneFrom:'stack',zoneTo:destination,cause:'counter_tax'});
    if(destination==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:counteredItem.isLocal!==false,actorIsLocal:pc.counterIsLocal!==false,ownerIsLocal:cardOwnerIsLocal(counteredItem.card,counteredItem.isLocal!==false,state.currentMatch?.myRole||null),card:counteredItem.card,item:counteredItem,zoneFrom:'stack',zoneTo:'exile',cause:counteredItem.castFrom==='flashback'?'countered_flashback':'countered_replacement'});
  }
  sendCounterspellAway(pc);
  state.pendingCounterUnlessPay = null;
  flushDeferredLandManaTriggers();
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  render();
  resumeAfterInteractiveEffect();
}

// El counterspell que armó la amenaza también tiene que ir a destino (cementerio, o
// Exilio si vino por Flashback) — sea cual sea la decisión que se tomó.
function sendCounterspellAway(pc) {
  if (!pc.counterCard) return;
  if (pc.counterCastFrom === 'flashback') {
    zoneForCardOwner(pc.counterCard,state.localExile,state.rivalExile,!!pc.counterIsLocal,state.currentMatch?.myRole||null).push(pc.counterCard);
    dispatchGameEvent({type:'card_exiled',controllerIsLocal:!!pc.counterIsLocal,actorIsLocal:!!pc.counterIsLocal,ownerIsLocal:cardOwnerIsLocal(pc.counterCard,!!pc.counterIsLocal,state.currentMatch?.myRole||null),card:pc.counterCard,zoneFrom:'stack',zoneTo:'exile',cause:'flashback'});
  } else {
    const plan=replacementCardZonePlan(pc.counterCard,!!pc.counterIsLocal,'stack','graveyard','resolved_counterspell');
    plan.destination.push(pc.counterCard);
    if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:!!pc.counterIsLocal,actorIsLocal:!!pc.counterIsLocal,ownerIsLocal:plan.ownerIsLocal,card:pc.counterCard,zoneFrom:'stack',zoneTo:'exile',cause:'resolved_counterspell'});
  }
}

export function tapLocalLand(item) {
  if (state.gameOver) return;
  if (state.pendingActivatedAbilityChoice) { logMsg(gameText('pending.ability')); return; }
  if (state.pendingSacrificeChoice) { tryResolveSacrificeChoice(item, true); return; }
  if (state.pendingCrew) { logMsg(gameText('pending.crew')); return; }
  if (state.pendingWardChoice) {
    if (manaSourceOptions(item, true).length > 0) chooseAndProduceMana(item, true);
    else logMsg(gameText('pending.ward'));
    return;
  }
  if (state.pendingCounterUnlessPay) {
    if (manaSourceOptions(item, true).length > 0) chooseAndProduceMana(item, true);
    else logMsg(gameText('pending.counterTax'));
    return;
  }
  if (state.pendingFightChoice) { logMsg(gameText('pending.fight')); return; }
  if (state.pendingXChoice) { logMsg(gameText('pending.x')); return; }
  if (state.pendingModeChoice) { logMsg(gameText('pending.mode')); return; }
  if (state.pendingLoyaltyTargetChoice) { logMsg(gameText('pending.loyaltyTarget')); return; }
  if (state.pendingMultiTargetChoice) { logMsg(gameText('pending.multiTarget')); return; }
  if (state.pendingScrySurveilChoice) { logMsg(gameText('pending.scry')); return; }
  if (state.pendingProliferateChoice) { logMsg(gameText('pending.proliferate')); return; }
  if (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) { logMsg(gameText('pending.discard')); return; }
  if (state.pendingResolvedEffectTargetChoice || (state.resolvingResolvedEffectTargetChoices || 0) > 0) { logMsg(gameText('pending.resolvedEtb')); return; }
  if (state.pendingEscapeExileChoice) { logMsg(gameText('pending.escape')); return; }
  if (state.pendingKickerChoice) { logMsg(gameText('pending.kicker')); return; }
  if (state.pendingLandSearchChoice) { logMsg(gameText('pending.landSearch')); return; }
  if (state.pendingLibraryChoice) { logMsg(gameText('pending.library')); return; }
  if (state.pendingRampChoice) { logMsg(gameText('pending.ramp')); return; }

  // PUNTO 13 — TIERRA DE MANÁ + UTILIDAD. Todas las Tierras con habilidades pasan por
  // el mismo dispatcher de permanentes. Ahí el contexto decide sin ambigüedad:
  //   - si estamos PAGANDO algo y la Tierra produce maná -> produce maná;
  //   - si no hay pago pendiente -> ofrece sus habilidades utility según timing.
  // Desde 23.14.1 sí existe reserva flotante: fuera de un pago, una Tierra que también tiene
  // habilidad utility ofrece una elección explícita entre producir maná o activar esa habilidad.
  const landAbilities = getEffectiveLandActivatedAbilities(state, item, true);
  const hasMana = manaSourceOptions(item, true).length > 0;
  if (item.tapped) { logMsg(gameText('mana.sourceAlreadyTapped', { card:item.card.name })); return; }

  // Durante 601.2g/602 el click de una fuente productora significa maná. Fuera de un pago,
  // una Tierra que además tiene habilidad utility ofrece la elección explícita Arena-like.
  if (state.pendingCost && hasMana) {
    chooseAndProduceMana(item, true);
    return;
  }
  if (landAbilities.length > 0 && hasMana && canActivateLocalManaAbility(item)) {
    const index = state.localLands.indexOf(item);
    showManaOrAbilityChoiceModal(item.card.name, () => chooseAndProduceMana(item, true), () => presentActivatedAbilityChoice(item.card.name, buildPermanentActivatedAbilityOptions(item, true, index)));
    return;
  }
  if (landAbilities.length > 0) {
    const index = state.localLands.indexOf(item);
    handleSupportClick(item, true, index);
    return;
  }
  if (!hasMana) return;
  if (!canActivateLocalManaAbility(item)) {
    logMsg(gameText('mana.noWindow'));
    return;
  }

  // 23.14.1: una Tierra simple puede activar su habilidad de maná siempre que exista una
  // ventana legal. Fuera de un pago, todo queda flotando. Durante 601.2g/602, su producción
  // recién agregada se aplica automáticamente sólo hasta cubrir lo útil y cualquier exceso
  // permanece en el pool; el maná que ya flotaba de antes se elige desde el HUD.
  chooseAndProduceMana(item, true);
}

// Confirmar el modo elegido de un hechizo modal: "resolvemos" la carta reemplazándola en
// la mano por una versión con el effect/requiresTarget de ESE modo ya fijados. El costo de
// maná NO cambia según el modo — sigue siendo el de la carta entera.
export function confirmModeChoice(modeIndex) {
  const mc = state.pendingModeChoice;
  if (!mc) return;
  const chosenMode = mc.card.modes[modeIndex];
  if (!chosenMode) return;

  const resolvedCard = { ...mc.card, effect: chosenMode.effect, requiresTarget: chosenMode.requiresTarget, chosenModeText: chosenMode.text };
  if (state.pendingCastTransaction && mc.castTransactionId === state.pendingCastTransaction.id) {
    if (Number.isInteger(mc.index)) state.localHand[mc.index] = resolvedCard;
    state.pendingCastTransaction.card = resolvedCard;
    state.pendingCastTransaction.modeChosen = true;
    state.pendingModeChoice = null;
    recordTelemetryEvent('cast_mode_chosen', { transactionId:state.pendingCastTransaction.id, card:mc.card.name, modeIndex, modeText:chosenMode.text });
    advanceCastAnnouncement();
    return;
  }
  state.localHand[mc.index] = resolvedCard;

  state.pendingModeChoice = null;
  state.pendingSpellIndex = mc.index;
  state.pendingAlternativeCostChosen = false;
  state.pendingCompositeCostPayment = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingCost = parseManaCost(getCastingManaCostString(resolvedCard));
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  logMsg(gameText('mode.chosen', { mode: chosenMode.text, card: mc.card.name }));
  checkPaymentComplete();
  render();
}

export function cancelModeChoice() {
  if (!state.pendingModeChoice) return;
  if (state.pendingCastTransaction) { abortCastTransaction(`Cancelaste ${state.pendingModeChoice.card.name}.`); return; }
  logMsg(gameText('mode.cancel', { card: state.pendingModeChoice.card.name }));
  state.pendingModeChoice = null;
  render();
}

// Costo ALTERNATIVO (distinto del adicional): reemplaza al maná por completo — "pagá X de
// vida en vez del costo de maná", como el maná Phyrexiano en MTG real. Es una elección del
// jugador, nunca automática.
// Confirmar el valor de X elegido: recién ACÁ armamos el costo real (el resto de la carta
// + X de genérico), porque hasta este momento no existía ningún pendingCost todavía.
export function confirmXValue(xValueRaw) {
  const xc = state.pendingXChoice;
  if (!xc) return;
  const xValue = Math.max(0, Math.floor(Number(xValueRaw) || 0)); // nunca negativo (regla real: X puede ser 0, no menos)

  if (state.pendingCastTransaction && xc.castTransactionId === state.pendingCastTransaction.id) {
    state.pendingXChoice = null;
    state.pendingCastTransaction.xValue = xValue;
    state.pendingXValue = xValue;
    recordTelemetryEvent('cast_x_chosen', { transactionId:state.pendingCastTransaction.id, card:xc.card.name, xValue });
    advanceCastAnnouncement();
    return;
  }

  state.pendingXChoice = null;
  state.pendingXValue = xValue;
  state.pendingSpellIndex = xc.index;
  let cost = parseManaCost(xc.card.manaCost); // el {X} de la cadena no suma nada acá
  cost.generic += xValue;
  const addMana = getCompositeCostManaString(xc.card.additionalCost);
  if (addMana) cost = sumManaCosts(cost, parseManaCost(addMana));
  state.pendingAlternativeCostChosen = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingCompositeCostPayment = false;
  state.pendingCost = cost;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  logMsg(gameText('x.chosen', { value: xValue, card: xc.card.name }));
  checkPaymentComplete();
  render();
}

export function cancelXChoice() {
  if (!state.pendingXChoice) return;
  if (state.pendingCastTransaction) { abortCastTransaction(`Cancelaste ${state.pendingXChoice.card.name}.`); return; }
  logMsg(gameText('x.cancel', { card: state.pendingXChoice.card.name }));
  state.pendingXChoice = null;
  render();
}

// Kicker: costo ADICIONAL y OPCIONAL (a diferencia de additionalCost, que es obligatorio).
// Se resuelve ANTES de armar el costo real, igual que X — recién acá sabemos si hay que
// sumarle el costo del Kicker al costo de maná normal de la carta.
export function confirmKickerChoice(paidKicker) {
  const kc = state.pendingKickerChoice;
  if (!kc) return;
  const { index, card } = kc;

  if (state.pendingCastTransaction && kc.castTransactionId === state.pendingCastTransaction.id) {
    state.pendingKickerChoice = null;
    state.pendingCastTransaction.kicked = !!paidKicker;
    state.pendingKicked = !!paidKicker;
    recordTelemetryEvent('cast_kicker_chosen', { transactionId:state.pendingCastTransaction.id, card:card.name, kicked:!!paidKicker });
    advanceCastAnnouncement();
    return;
  }

  state.pendingKickerChoice = null;
  state.pendingKicked = paidKicker;
  state.pendingSpellIndex = index;

  state.pendingAlternativeCostChosen = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingCompositeCostPayment = false;
  state.pendingCost = parseManaCost(getCastingManaCostString(card, { kicked: paidKicker }));
  if (paidKicker) {
    logMsg(gameText('kicker.pay', { card: card.name, cost: card.kicker.cost }));
  } else {
    logMsg(gameText('kicker.skip', { card: card.name }));
  }

  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  checkPaymentComplete();
  render();
}

export function cancelKickerChoice() {
  if (!state.pendingKickerChoice) return;
  if (state.pendingCastTransaction) { abortCastTransaction(`Cancelaste ${state.pendingKickerChoice.card.name}.`); return; }
  logMsg(gameText('kicker.cancel', { card: state.pendingKickerChoice.card.name }));
  state.pendingKickerChoice = null;
  render();
}

export function payWithAlternativeCost() {
  // Compatibilidad programática/tests: en 23.10 la alternativa se elige ANTES de target/pago.
  if (state.pendingCastTransaction && state.pendingAlternativeCostChoice) {
    confirmAlternativeCostChoice(true);
    return;
  }
  if (state.pendingSpellIndex === null) return;
  const card = state.localHand[state.pendingSpellIndex];
  if (!card || !card.alternativeCost) return;
  if (state.pendingCastFrom) {
    logMsg(gameText('alternative.alreadyRoute', { card: card.name, route: state.pendingCastFrom }));
    return;
  }
  if (!canPayCastCompositeNonManaCosts(card, true, true, { excludeCard: card })) {
    logMsg(gameText('alternative.resources', { card: card.name }));
    return;
  }

  // Elegir la vía alternativa reemplaza SOLO el costo base. Kicker y additionalCost se
  // conservan. Cualquier tierra que hubieras girado probando la vía normal se devuelve.
  state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
  restorePaymentManaSources();
  restoreManaPaymentSnapshot();
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  state.pendingAlternativeCostChosen = true;
  state.pendingSpellCostsIrreversible = false;
  state.pendingCompositeCostPayment = false;
  state.pendingHybridLifePayment = null;
  const altManaString = getCastingManaCostString(card, {
    useAlternative: true,
    kicked: !!state.pendingKicked
  });
  state.pendingCost = parseManaCost(altManaString);
  if (altManaString && altManaString.includes('{X}')) {
    state.pendingCost.generic += Math.max(0, Number(state.pendingXValue) || 0);
  } else if (card.manaCost && card.manaCost.includes('{X}')) {
    // Contrato simple y seguro: una alternativa fija que no declara {X} no compra un X gratis.
    state.pendingXValue = 0;
  }

  logMsg(gameText('alternative.chosen', { card: card.name, cost: describeCompositeCost(card.alternativeCost), kicker: state.pendingKicked ? ' + Kicker' : '' }));
  checkPaymentComplete();
  render();
}


// Termina de castear una carta de la mano una vez que TODOS los costos (maná, adicional,
// y si era Escape, las cartas exiliadas) ya están pagados: pide objetivo(s) si hace falta,
// o manda directo a la pila. Separado de checkPaymentComplete para poder pausar en el medio
// (el modal de Escape) y retomar exactamente acá cuando el jugador confirme qué exilia.
async function finishCastingHandCard(card) {
  const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);

  // Objetivos múltiples (ej. "Destruye el artefacto objetivo. Destruye el encantamiento
  // objetivo."): cada target de la carta tiene su PROPIO efecto — se eligen uno por uno,
  // en orden, y recién cuando están todos se manda el hechizo entero a la pila.
  if (card.multiTarget && card.targets && card.targets.length > 0) {
    state.pendingMultiTargetChoice = { card, chosenTargets: [], currentIndex: 0 };
    logMsg(gameText('target.multi.firstPaid', { total: card.targets.length, card: card.name }));
    render();
    return;
  }

  const needsTarget = card.adjunta || (card.requiresTarget ?? (card.effect && (card.effect.type === 'damage' || card.effect.type === 'heal' || card.effect.type.startsWith('counter'))));
  if (needsTarget) {
    state.pendingTargetCard = card;
    state.pendingTargetSource = null;

    let targetHint = `Hacé clic en un jugador o criatura para aplicar ${card.name}.`;
    if (card.adjunta) targetHint = `Hacé clic en una de tus criaturas para encantarla con ${card.name}.`;
    else if (card.effect && card.effect.type.startsWith('counter')) {
      targetHint = `Hacé clic en el hechizo de la Pila que querés contrarrestar.`;
    }

    logMsg(gameText('mana.paidTargetHint', { hint: targetHint }));
    render();
    return;
  }

  state.localHand.splice(state.pendingSpellIndex, 1);

  let stackType = 'spell';
  if (card.power !== undefined) stackType = 'summon';
  else if (card.type.includes('Planeswalker')) stackType = 'planeswalker';
  else if (isPermanent) stackType = 'permanent';
  else if (card.type.includes('Instantáneo')) stackType = 'instant';

  const stackItem = {
    card: card,
    isLocal: true,
    targetObj: null,
    type: stackType,
    xValue: state.pendingXValue,
    castFrom: state.pendingCastFrom,
    kicked: state.pendingKicked
  };
  addToStack(stackItem);
  flushDeferredLandManaTriggers();

  logMsg(gameText('cast.stackEntered', { card: card.name }));

  // --- LIMPIEZA DE ESTADO QUE FALTABA (espejo del CASO B) ---
  state.consecutivePasses = 0;
  state.pendingSpellIndex = null;
  state.pendingCost = null;
  state.pendingXValue = null;
  state.pendingCastFrom = null;
  state.pendingKicked = null;
  state.pendingAlternativeCostChosen = false;
  state.pendingCompositeCostPayment = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingHybridLifePayment = null;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  commitManaPaymentSnapshot();
  render();

  // PUNTO 3: el spell ya está casteado y en la pila. Sus watchers disparan AHORA, antes
  // de entregar prioridad para respuestas. Si después lo contrarrestan, el trigger ya ocurrió.
  await triggerSpellCast(true, card, stackItem);
  checkRivalCounterOrResponse();
}

function continueCastingAfterAdditionalCosts(card) {
  // Escape: el costo adicional de exiliar N cartas del cementerio se paga después del
  // descarte/vida obligatorio y antes de que el hechizo entre a la pila.
  if (state.pendingCastFrom === 'escape' && card.escape) {
    const exileCount = card.escape.exileCount || 0;
    if (exileCount > 0) {
      state.pendingEscapeExileChoice = { card, exileCount };
      logMsg(gameText('escape.choose', { card: card.name, count: exileCount }));
      render();
      void chooseGraveyardCards({
        zoneIsLocal: true, chooserIsLocal: true, filter: 'any', amount: exileCount,
        cardName: card.name, actionLabel: `elegí ${exileCount} carta(s) para pagar Escape`
      }).then(chosenCards => {
        chosenCards.forEach(c => {
          const idx = state.localGraveyard.indexOf(c);
          if (idx !== -1) state.localGraveyard.splice(idx, 1);
        });
        state.localExile.push(...chosenCards);
        chosenCards.forEach(exiledCard => dispatchGameEvent({
          type:'card_exiled',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:true,
          card:exiledCard,zoneFrom:'graveyard',zoneTo:'exile',cause:'escape_cost'
        }));
        logMsg(gameText('escape.exiled', { card: card.name, count: chosenCards.length }));
        state.pendingEscapeExileChoice = null;
        void finishCastingHandCard(card);
      }).catch(err => {
        console.error('Error eligiendo cartas para Escape:', err);
        state.pendingEscapeExileChoice = null;
        cancelPayment();
      });
      return;
    }
  }

  void finishCastingHandCard(card);
}

function checkPaymentComplete() {
  const cost = state.pendingCost;
  if (!cost) return;
 
  if (manaCostTotal(cost) === 0) {

    if (state.pendingSuspendTransaction) { commitSuspendAction(); return; }

    // SALVAGUARDA: esto no debería poder pasar nunca (canPlayCard ya lo previene),
    // pero si por algún motivo quedaran ambos pagos pendientes a la vez, mejor
    // frenar y avisar que resolver la carta equivocada.
    if (state.pendingSpellIndex !== null && state.pendingAbilitySource !== null) {
      logMsg(gameText('cast.paymentConflict'));
      cancelPayment();
      return;
    }

    // ENTREGA 23.10: una transacción 601.2 ya eligió targets y PREPARÓ todos los
    // costos no-maná antes de habilitar fuentes. Al llegar maná=0 sólo falta el commit.
    if (state.pendingCastTransaction?.stage === 'payment') {
      if (state.pendingCompositeCostPayment) return;
      state.pendingCompositeCostPayment = true;
      void commitCastTransactionAfterMana().finally(() => {
        state.pendingCompositeCostPayment = false;
      });
      return;
    }

    // CASO A LEGACY: callers históricos que todavía entren al pago sin transacción.
    if (state.pendingSpellIndex !== null) {
      const card = state.localHand[state.pendingSpellIndex];

      // Punto 14: una vez terminado TODO el maná, preparamos y comprometemos juntos los
      // componentes no-maná de la vía elegida (alternativa + adicional). El flag evita que
      // un render/callback reentrante inicie el pago dos veces.
      if (state.pendingCompositeCostPayment) return;
      const useAlternative = !!state.pendingAlternativeCostChosen;
      const bundle = getCastCompositeCostBundle(card, useAlternative);
      const hasNonMana = bundle.life > 0 || bundle.discards.length > 0 || bundle.sacrifices.length > 0 || bundle.graveyardExiles.length > 0;
      if (hasNonMana) {
        state.pendingCompositeCostPayment = true;
        render();
        payCastCompositeNonManaCosts(card, true, useAlternative).then(() => {
          state.pendingCompositeCostPayment = false;
          continueCastingAfterAdditionalCosts(card);
        }).catch(err => {
          state.pendingCompositeCostPayment = false;
          console.error('No se pudo pagar el costo compuesto:', err);
          logMsg(gameText('cast.partialCostFailed', { card: card.name }));
          cancelPayment();
        });
        return;
      }

      continueCastingAfterAdditionalCosts(card);
    } 
    
    // CASO B: ESTAMOS PAGANDO UNA HABILIDAD DE LA MESA (propia, o de un Equipo otorgada a una criatura)
    else if (state.pendingAbilitySource !== null) {
      const source = state.pendingAbilitySource;
      const card = source.item.card;
      const isGranted = source.abilityKind === 'granted';
      const ability = source.ability || (isGranted ? getGrantedAbilities(card)[0] : getActivatedAbilities(card)[0]);
      const tapTarget = source.tapTarget || source.item;

      // 23.15.7 — coste adicional de descarte para habilidades activadas (Blood-like).
      // El maná ya está pagado, pero todavía no se giró/sacrificó la fuente ni entró la
      // habilidad en Stack. El modal no ofrece cancelación parcial: o paga exactamente N
      // o se aborta la activación. Replacement/Events de descarte siguen funcionando.
      const abilityAdditionalCost = normalizeCompositeCost(ability.additionalCost);
      if (abilityAdditionalCost?.discard?.amount > 0 && !source.additionalDiscardPaid) {
        if (source.additionalDiscardPending) return;
        source.additionalDiscardPending = true;
        render();
        void discardCardsFromHand({
          victimIsLocal: source.isLocal !== false,
          amount: abilityAdditionalCost.discard.amount,
          selection: abilityAdditionalCost.discard.selection || 'choice',
          cardName: source.activationDisplayName || card.name,
          reason: 'activated_cost',
          requireExact: true
        }).then(result => {
          source.additionalDiscardPending = false;
          if (!result.completed) {
            logMsg(gameText('ability.additionalDiscard.failed', { card:source.activationDisplayName || card.name }));
            cancelPayment();
            return;
          }
          source.additionalDiscardPaid = true;
          checkPaymentComplete();
        }).catch(err => {
          console.error('No se pudo pagar descarte de habilidad activada:', err);
          source.additionalDiscardPending = false;
          cancelPayment();
        });
        return;
      }
      
      // Si el pago incluía {T}, giramos a quien corresponda (el permanente mismo,
      // o la criatura equipada si la habilidad viene de un Equipo).
      if (source.requiresTap) {
        const wasTapped=!!tapTarget.tapped;
        tapTarget.tapped = true;
        if(!wasTapped) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:source.isLocal!==false,actorIsLocal:source.isLocal!==false,ownerIsLocal:cardOwnerIsLocal(tapTarget.card,source.isLocal!==false,state.currentMatch?.myRole||null),card:tapTarget.card,item:tapTarget,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'activated_ability'});
      }

      // Si el costo incluye Sacrificar, se paga acá, antes de que la habilidad llegue
      // a la pila (así es en MTG real: los costos se pagan en el momento de activar).
      if (ability.sacrifice) {
        if (ability.sacrifice === 'self') {
          performSacrifice(source.item, source.isLocal);
          // Costo IRREVERSIBLE ya pagado: a partir de acá, "Cancelar" ya no puede desandar
          // nada (ver cancelPayment) — si todavía falta elegir target, hay que completarlo.
          source.sacrificePaid = true;
          finalizeAbilityActivation(source, ability, card);
        } else {
          // 'creature' o 'artifact': hay que elegir cuál. Pausamos acá.
          state.pendingSacrificeChoice = { source, ability, card, eligibleType: ability.sacrifice };
          logMsg(gameText('mana.paidChooseSacrifice', { kind: ability.sacrifice === 'creature' ? 'criatura' : ability.sacrifice === 'land' ? 'tierra' : 'artefacto', card: card.name }));
          render();
        }
        return;
      }

      finalizeAbilityActivation(source, ability, card);
    }
  }
}

// Segunda mitad de la activación de una habilidad: todos los targets ya fueron declarados
// antes de pagar. Esta función sólo compromete la propuesta completa en la Stack después de
// maná/{T}/sacrificios. Se puede retomar desde una elección de sacrificio sin reabrir targets.
function finalizeAbilityActivation(source, ability, card) {
  const isGranted = source.abilityKind === 'granted';
  const targetObj = ability.requiresTarget ? source.chosenTarget : null;
  if (ability.requiresTarget && !targetObj) {
    logMsg(gameText('target.ability.missing', { card: card.name }));
    cancelPayment();
    return;
  }

  const stackItem = {
    card,
    isLocal: source.isLocal,
    targetObj,
    type: 'ability',
    source: { type: isGranted ? 'equipped_activation' : 'support_activation', index: source.index, abilityIndex: source.abilityIndex },
    sourceItem: source.item,
    ability
  };
  addToStack(stackItem);
  flushDeferredLandManaTriggers();

  logMsg(gameText('ability.activated', { card: card.name }));
  state.consecutivePasses = 0;
  state.pendingAbilitySource = null;
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingCost = null;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  commitManaPaymentSnapshot();

  // Igual que el pipeline 601: Ward se observa después de que el objeto targeteado ya está
  // realmente en la Stack. El prompt sigue siendo la simplificación histórica del motor,
  // pero target y costo de la habilidad ya respetan el orden de activación.
  const ward = detectWardForDeclaredTarget(card, targetObj);
  if (ward) {
    state.pendingWardChoice = { ...ward, stackId: stackItem.id, postCast: true };
    logMsg(gameText('ward.triggered', { card: ward.targetObj.item.card.name, cost: ward.wardCost }));
    render();
    return;
  }

  render();
  checkRivalCounterOrResponse();
}

// Se llama cuando el jugador local elige qué sacrificar (criatura o artefacto propio) para
// completar el costo de una habilidad pendiente. Devuelve true si el click era para esto,
// así el llamador (handleCombatClick / handleSupportClick) sabe si debe frenar ahí.
export function tryResolveSacrificeChoice(item, isLocal) {
  const pending = state.pendingSacrificeChoice;
  if (!pending) return false;
  if (!isLocal) {
    logMsg(gameText('sacrifice.ownOnly'));
    return true;
  }

  // ETAPA MOTOR 1: no inferimos "artefacto = cualquier cosa que no sea criatura".
  // Se valida el tipo real, compartiendo exactamente la misma regla con el resaltado de UI.
  const matchesType = isSacrificeCandidate(item, pending.eligibleType);
  if (!matchesType) {
    logMsg(gameText('sacrifice.invalid', { type: pending.eligibleType === 'creature' ? 'criatura' : pending.eligibleType === 'land' ? 'tierra' : 'artefacto' }));
    return true;
  }

  performSacrifice(item, isLocal);
  const { source, ability, card } = pending;
  // Costo IRREVERSIBLE ya pagado — mismo criterio que la rama 'self' de arriba.
  source.sacrificePaid = true;
  state.pendingSacrificeChoice = null;
  finalizeAbilityActivation(source, ability, card);
  return true;
}

// Avanza un objetivo múltiple: guarda el target recién elegido, y o pide el siguiente o
// (si ya están todos) manda el hechizo entero a la pila con la lista completa adjunta.
async function advanceMultiTargetChoice(targetObj) {
  const mtc = state.pendingMultiTargetChoice;
  mtc.chosenTargets.push(targetObj);
  mtc.currentIndex++;

  if (mtc.currentIndex < mtc.card.targets.length) {
    logMsg(gameText('target.multi.next', { current: mtc.currentIndex + 1, total: mtc.card.targets.length, card: mtc.card.name }));
    render();
    return;
  }

  state.pendingMultiTargetChoice = null;
  if (state.pendingCastTransaction && mtc.castTransactionId === state.pendingCastTransaction.id) {
    await completeCastTargetDeclaration({ type:'multi', targets:mtc.chosenTargets });
    return;
  }
  const card = state.localHand.splice(state.pendingSpellIndex, 1)[0];
  const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);
  let stackType = 'spell';
  if (card.power !== undefined) stackType = 'summon';
  else if (isPermanent) stackType = 'permanent';
  else if (card.type.includes('Instantáneo')) stackType = 'instant';

  const stackItem = {
    card: card,
    isLocal: true,
    targetObj: { type: 'multi', targets: mtc.chosenTargets },
    type: stackType,
    xValue: state.pendingXValue,
    castFrom: state.pendingCastFrom
  };
  addToStack(stackItem);
  flushDeferredLandManaTriggers();

  logMsg(gameText('cast.stackEnteredAllTargets', { card: card.name }));
  state.consecutivePasses = 0;
  state.pendingSpellIndex = null;
  state.pendingCost = null;
  state.pendingXValue = null;
  state.pendingCastFrom = null;
  state.pendingAlternativeCostChosen = false;
  state.pendingCompositeCostPayment = false;
  state.pendingSpellCostsIrreversible = false;
  state.pendingHybridLifePayment = null;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  commitManaPaymentSnapshot();
  render();
  await triggerSpellCast(true, card, stackItem);
  checkRivalCounterOrResponse();
}

async function executeSpellOnTarget(targetObj) {
  if (!state.pendingTargetCard) return;

  let card;
  let castStackItem = null;
  let isPermanentSource = state.pendingTargetSource !== null;

  if (!isPermanentSource && state.pendingCastTransaction?.stage === 'targets') {
    await completeCastTargetDeclaration(targetObj);
    return;
  }

  if (isPermanentSource) {
    // 23.11.13 — CR602 humano: seleccionar un target NO compromete todavía el costo.
    // Guardamos el target legal dentro de la propuesta de activación, cerramos el targeter
    // visual y recién entonces abrimos el pago de maná/{T}/sacrificio.
    const src = state.pendingTargetSource;
    card = src.item.card;
    src.chosenTarget = targetObj;
    state.pendingTargetCard = null;
    state.pendingTargetSource = null;
    beginActivatedAbilityPayment(src);
    return;
  }
  else {
    card = state.localHand.splice(state.pendingSpellIndex, 1)[0];

    let stackType = 'spell';
    const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);
    
    if (card.power !== undefined) stackType = 'summon';
    else if (card.type.includes('Planeswalker')) stackType = 'planeswalker';
    else if (isPermanent) stackType = 'permanent';
    else if (card.adjunta) stackType = 'aura';
    else if (card.type.includes('Instantáneo')) stackType = 'instant';

    castStackItem = {
      card: card,
      isLocal: true,
      targetObj: targetObj,
      type: stackType,
      xValue: state.pendingXValue,
      castFrom: state.pendingCastFrom,
      kicked: state.pendingKicked
    };
    addToStack(castStackItem);
    flushDeferredLandManaTriggers();

    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.pendingXValue = null;
    state.pendingCastFrom = null;
    state.pendingKicked = null;
    state.pendingAlternativeCostChosen = false;
    state.pendingCompositeCostPayment = false;
    state.pendingSpellCostsIrreversible = false;
    state.pendingHybridLifePayment = null;
    state.tappedLandsThisSpell = [];
    state.paymentManaSourceRollbacks = [];
    commitManaPaymentSnapshot();
  }

  state.consecutivePasses = 0;
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingAbilitySource = null;
  render();

  // Las habilidades activadas usan el mismo selector, pero NO son hechizos casteados.
  if (!isPermanentSource && castStackItem) {
    await triggerSpellCast(true, card, castStackItem);
  }
  checkRivalCounterOrResponse();
}

// Pagar Ward: buscamos maná disponible entre tierras y artefactos que produzcan (Ward
// siempre pide genérico, así que no importa el color) y lo giramos automáticamente hasta
// cubrir el costo — simplificación consciente, no hace falta elegir cuáles una por una,
// a diferencia del pago normal de un hechizo.
// Costo de "contrarrestar a menos que pague" (Impuesto País, etc.): busca maná disponible
// entre tierras y artefactos que produzcan (siempre genérico, no importa el color) y lo
// gira automáticamente — mismo criterio que Ward, reusable para el jugador humano y para
// la decisión automática del Tano.
function autoPayGenericManaCost(isLocal, amount) {
  const pool = isLocal ? state.localManaPool : state.rivalManaPool;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const sources = [...lands, ...support, ...combat]
    .filter(s => {
      const ability = effectiveManaAbilityForItem(s, isLocal);
      return !!ability && canActivateManaSourcePermanent(s, { hasHaste: getEffectiveKeywords(s).some(k => String(k).toLowerCase() === 'haste'), ability });
    });
  const required = Math.max(0, Math.floor(Number(amount) || 0));
  const available = manaPoolTotal(pool) + sources.reduce((sum,s) => sum + manaSourceAmount(s, isLocal), 0);
  if (available < required) return false;

  const remaining = { W:0,U:0,B:0,R:0,G:0,C:0,generic:required };
  spendAvailableTowardCost(pool, remaining);
  for (const source of sources) {
    if (remaining.generic <= 0) break;
    const options = manaSourceOptions(source, isLocal);
    if (!options.length) continue;
    const type = options[0]; // El coste es genérico; cualquier elección legal es equivalente.
    const produced = manaSourceAmount(source, isLocal);
    const tappedForMana = manaSourceRequiresTapEffective(source, isLocal);
    if (tappedForMana) {
      const wasTapped=!!source.tapped;
      source.tapped = true;
      if(!wasTapped) dispatchGameEvent({type:'permanent_tapped',controllerIsLocal:isLocal,actorIsLocal:isLocal,ownerIsLocal:cardOwnerIsLocal(source.card,isLocal,state.currentMatch?.myRole||null),card:source.card,item:source,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'mana_ability'});
    }
    const landManaEventSnapshot = tappedForMana && isLandPermanent(source)
      ? captureLandTappedForManaEvent(source, isLocal, type) : null;
    if (manaSourceSacrificesEffective(source, isLocal)) performSacrifice(source, isLocal);
    addMana(pool, type, produced);
    if (landManaEventSnapshot) handleLandTappedForManaEvent(source, isLocal, type, produced, { eventSnapshot:landManaEventSnapshot });
    spendAvailableTowardCost(pool, remaining);
  }
  return remaining.generic === 0;
}

export function tryAutoPayCounterTax(isLocal, amount) {
  return autoPayGenericManaCost(isLocal, amount);
}

export function payWard() {
  const wc = state.pendingWardChoice;
  if (!wc) return;

  if (!autoPayGenericManaCost(true, wc.wardCost)) {
    logMsg(gameText('ward.noMana', { cost: wc.wardCost }));
    declineWard();
    return;
  }
  logMsg(gameText('ward.paid', { cost: wc.wardCost }));
  const targetObj = wc.targetObj;
  state.pendingWardChoice = null;
  flushDeferredLandManaTriggers();
  if (wc.postCast && wc.stackId != null) {
    render();
    checkRivalCounterOrResponse();
    return;
  }
  executeSpellOnTarget(targetObj);
}

// No pagar Ward: el hechizo se pierde. Si era una carta de la mano, se comporta como un
// counterspell real — se gasta igual y va al cementerio sin resolver su efecto. Si era una
// habilidad activada, el costo para activarla ya se había pagado antes (no se devuelve,
// como en MTG real), simplemente no logra su objetivo.
export function declineWard() {
  const wc = state.pendingWardChoice;
  if (!wc) return;
  logMsg(gameText('ward.declined', { cost: wc.wardCost }));

  // 23.10: si Ward disparó DESPUÉS del casteo, contrarresta el objeto real que ya está en
  // la pila. Esto reemplaza la vieja simulación que sacaba la carta directamente de mano.
  if (wc.postCast && wc.stackId != null) {
    const idx = spellStack.findIndex(item => item.id === wc.stackId);
    if (idx !== -1) {
      const [countered] = spellStack.splice(idx, 1);
      const destination=moveCounteredStackItemToDestination(countered,state);
      dispatchGameEvent({type:'spell_countered',controllerIsLocal:countered.isLocal!==false,actorIsLocal:false,card:countered.card,item:countered,zoneFrom:'stack',zoneTo:destination,cause:'ward'});
      if(destination==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:countered.isLocal!==false,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(countered.card,countered.isLocal!==false,state.currentMatch?.myRole||null),card:countered.card,item:countered,zoneFrom:'stack',zoneTo:'exile',cause:countered.castFrom==='flashback'?'ward_flashback':'ward_replacement'});
      logMsg(gameText('ward.countered', { card: countered.card.name }));
    }
    state.pendingWardChoice = null;
    flushDeferredLandManaTriggers();
    render();
    checkRivalCounterOrResponse();
    return;
  }

  if (state.pendingTargetSource === null && state.pendingSpellIndex !== null) {
    const card = state.localHand[state.pendingSpellIndex];
    if (card) {
      state.localHand.splice(state.pendingSpellIndex, 1);
      // AUDITORÍA PRE-FASE 3: Ward contrarresta ANTES de que esta ruta llegue a addToStack,
      // pero el destino es exactamente el mismo que si el objeto ya estuviera en la pila:
      // Flashback -> Exilio; Escape/normal -> Cementerio.
      if(state.pendingCastFrom==='flashback') {
        zoneForCardOwner(card,state.localExile,state.rivalExile,true,state.currentMatch?.myRole||null).push(card);
        dispatchGameEvent({type:'card_exiled',controllerIsLocal:true,actorIsLocal:false,ownerIsLocal:cardOwnerIsLocal(card,true,state.currentMatch?.myRole||null),card,zoneFrom:'hand',zoneTo:'exile',cause:'ward_flashback'});
      } else {
        const plan=replacementCardZonePlan(card,true,'hand','graveyard','ward');
        plan.destination.push(card);
        if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:true,actorIsLocal:false,ownerIsLocal:plan.ownerIsLocal,card,zoneFrom:'hand',zoneTo:'exile',cause:'ward_replacement'});
      }
    }
    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.pendingXValue = null;
    state.pendingCastFrom = null;
    state.pendingKicked = null;
    state.pendingAlternativeCostChosen = false;
    state.pendingCompositeCostPayment = false;
    state.pendingSpellCostsIrreversible = false;
    state.pendingHybridLifePayment = null;
    state.tappedLandsThisSpell = [];
    state.paymentManaSourceRollbacks = [];
  }

  state.pendingWardChoice = null;
  flushDeferredLandManaTriggers();
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingAbilitySource = null;
  render();
}

export function handleSupportClick(item, isLocal, index) {
  if (state.gameOver || !isLocal) return;
  if (state.pendingActivatedAbilityChoice) { logMsg(gameText('pending.ability')); return; }

  if (state.pendingResolvedEffectTargetChoice || (state.resolvingResolvedEffectTargetChoices || 0) > 0) {
    logMsg(gameText('pending.resolvedEtb'));
    return;
  }
  if (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) {
    logMsg(gameText('pending.discard'));
    return;
  }

  if (state.pendingSacrificeChoice) {
    tryResolveSacrificeChoice(item, isLocal);
    return;
  }

  // Si hay una tripulación pendiente, ningún otro permanente hace nada hasta que se
  // resuelva (clickear una criatura sigue yendo a handleCombatClick/handleCrewClick).
  if (state.pendingCrew) {
    logMsg(gameText('pending.crew'));
    return;
  }
  if (state.pendingWardChoice) {
    if (manaSourceOptions(item, true).length > 0) chooseAndProduceMana(item, true);
    else logMsg(gameText('pending.ward'));
    return;
  }
  if (state.pendingCounterUnlessPay) {
    if (manaSourceOptions(item, true).length > 0) chooseAndProduceMana(item, true);
    else logMsg(gameText('pending.counterTax'));
    return;
  }
  if (state.pendingFightChoice) {
    logMsg(gameText('pending.fight'));
    return;
  }
  if (state.pendingXChoice) {
    logMsg(gameText('pending.x'));
    return;
  }
  if (state.pendingModeChoice) {
    logMsg(gameText('pending.mode'));
    return;
  }
  if (state.pendingLoyaltyTargetChoice) {
    logMsg(gameText('pending.loyaltyTarget'));
    return;
  }
  if (state.pendingMultiTargetChoice) {
    logMsg(gameText('pending.multiTarget'));
    return;
  }
  if (state.pendingScrySurveilChoice) {
    logMsg(gameText('pending.scry'));
    return;
  }
  if (state.pendingProliferateChoice) {
    logMsg(gameText('pending.proliferate'));
    return;
  }
  if (state.pendingEscapeExileChoice) {
    logMsg(gameText('pending.escape'));
    return;
  }
  if (state.pendingKickerChoice) {
    logMsg(gameText('pending.kicker'));
    return;
  }
  if (state.pendingRampChoice) {
    logMsg(gameText('pending.ramp'));
    return;
  }

  const card = item.card;
  const abilityOptions = buildPermanentActivatedAbilityOptions(item, isLocal, index);

  // Punto 13: cualquier permanente que produzca maná (mana rock O Tierra) conserva
  // prioridad de fuente de maná mientras ya estamos pagando algo. Fuera de un pago, si
  // además tiene habilidades activadas, esas habilidades utility quedan disponibles.
  if (isManaSourceCard(card)) {
    if (state.pendingCost && (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCastTransaction?.stage === 'payment')) {
      tapSupportManaSource(item, isLocal);
      return;
    }
    if (state.pendingAbilitySource && state.pendingTargetCard) {
      logMsg(gameText('pending.abilityTarget'));
      return;
    }
    if (isLocal && canActivateLocalManaAbility(item)) {
      if (abilityOptions.length === 0) { chooseAndProduceMana(item, true); return; }
      showManaOrAbilityChoiceModal(card.name, () => chooseAndProduceMana(item, true), () => presentActivatedAbilityChoice(card.name, abilityOptions));
      return;
    }
    if (abilityOptions.length === 0) { logMsg(gameText('mana.noWindow')); return; }
  }

  // Punto 12: ya no hacemos un guard global de fase acá. Cada opción se valida por su
  // propio timing dentro de present/beginActivatedAbility. Las legacy siguen Main-only.
  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null) {
    logMsg(gameText('pending.payPrevious'));
    return;
  }

  if (abilityOptions.length === 0) return;
  presentActivatedAbilityChoice(card.name, abilityOptions);
}

export function resolveEffectDirect(effect, cardName, isLocal, sourceCard = null, sourceItem = null) {
  if (!effect) return Promise.resolve({ handled: false, reason: 'no_effect' });
  const card = sourceCard || { name: cardName, colors: [] };
  const pending = resolveGameEffect(effect, {
    sourceCard: card,
    cardName,
    isLocal,
    sourceItem,
    targetObj: null
  });
  // Compatibilidad deliberada: el sistema histórico de triggers llama esta función sin
  // `await`. Los efectos síncronos mutan el estado antes del primer await; los interactivos
  // (descarte remoto, Ramp, etc.) ya tienen sus propios flags/colas de bloqueo.
  pending.catch(err => {
    console.error(`Error resolviendo efecto directo de ${cardName}:`, err);
    logMsg(`⚠️ ${cardName}: ocurrió un error resolviendo su efecto.`);
    render();
  });
  return pending;
}

// Lo usa el resolver universal cuando termina un modal interactivo (Scry/Surveil/
// Proliferate). Mantiene el mismo comportamiento anterior sin crear una dependencia
// stackManager -> bot adicional: stackManager ya depende de main.js y este wrapper
// conserva el borde existente main -> bot.
let interactiveResolutionResumeRunning = false;
export async function resumeAfterInteractiveEffect() {
  if (interactiveResolutionResumeRunning) return;
  interactiveResolutionResumeRunning = true;
  try {
    // 23.15.5.1: si el efecto base de un hechizo con Kicker abrió una decisión asíncrona
    // (Scry/Surveil/Proliferate/counter-tax), el bonus NO puede adelantarse ni perderse.
    // resolveTopStackItem guarda esta continuación y el último modal la retoma acá.
    const pending = state.pendingKickerResolutionContinuation;
    if (pending && !state.pendingCounterUnlessPay && !state.pendingScrySurveilChoice && !state.pendingProliferateChoice) {
      state.pendingKickerResolutionContinuation = null;
      logMsg(gameText('stack.kickerBonus', { card: pending.card.name }));
      await resolveGameEffect(pending.bonusEffect, {
        sourceCard: pending.card, isLocal: pending.isLocal, targetObj: null,
        stackItem: pending.stackItem || null, xValue: pending.xValue || 0
      });
      await runStateBasedActions({ reason:'kicker_bonus_resolved' });
      await waitForStateBasedActions();
      // El propio bonus puede abrir otra decisión interactiva. En ese caso ese modal volverá
      // a llamar esta función al terminar y recién entonces se entrega prioridad.
      if (state.pendingCounterUnlessPay || state.pendingScrySurveilChoice || state.pendingProliferateChoice) return;
    }
    state.priorityPlayer = state.activePlayer;
    state.consecutivePasses = 0;
    checkRivalCounterOrResponse();
  } finally {
    interactiveResolutionResumeRunning = false;
  }
}


export function resolveSpellDirect(card, isLocal) { return resolveEffectDirect(card.effect, card.name, isLocal, card); }

// ENTREGA 23.8.5 — IMPORTANTE: index.html carga ./js/main.js SIN query-string.
// Todos los módulos internos que importan './main.js' resuelven exactamente la misma URL,
// por lo que existe un único singleton de state. El guard global de boot es una segunda
// barrera defensiva ante HTML viejo/cacheado o futuras entradas accidentales duplicadas.
boot();
