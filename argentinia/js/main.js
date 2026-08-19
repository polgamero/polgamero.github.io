import { addToStack, spellStack, replaceSpellStackFromSync, resolveGameEffect, canResolveGameEffectWithoutTarget, canResolveGameEffectWithTarget } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { executeLocalAttack, executeRivalAttack, resolveCombatDamage, checkDeaths } from './combatRules.js';
import { checkRivalCounterOrResponse } from './bot.js';
import { setupBoardLayout, render, logMsg, els, showGameOverOverlay, getTargetRules, showDeckSelectionModal, showPlayDeckPickerModal, showMainMenu, updateAccountUI, showMulliganModal, showBottomCardsModal, showLoyaltyAbilityModal, showXValueModal, showModalSpellChoice, showScrySurveilModal, showProliferateModal, showKickerModal, showAbandonConfirmModal, showReconnectPrompt, showCounterTaxDecisionModal, showSacrificeEffectModal, showGraveyardChoiceModal, showHandDiscardChoiceModal, showActivatedAbilityModal, showMultiplayerReadyBarrier, hideMultiplayerReadyBarrier, showAlternativeCostModal, showPrivateZoneChoiceModal, showDailyLoginRewardModal } from './ui.js';
import { buildRandomDeck, buildDeckFromCardIds, parseManaCost, sumManaCosts, getLandColor, sleep, shuffle, moveBattlefieldCardToZone, isSacrificeCandidate, removeRandomCardsFromHand, moveCounteredStackItemToDestination, createRemoteDecisionQueue, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming, normalizeCompositeCost, getCompositeCostManaString, cardMatchesDiscardCost, describeCompositeCost, compositeCostHasNonMana, combineManaCostStrings, getProliferateCandidates } from './utils.js';
import { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority, resolveBothPassed, processMyTurnStart, beginActivePlayerPriorityWindow, resetPriorityClock, syncPriorityClockFromNetwork } from './turnManager.js';
import { hasKeyword, canBlock, getProtectionMatch } from './keywords.js';
import { preloadFirebaseClient, onAuthChange, loadUserProfile, createUserProfile, registerDailyLogin, awardPoints, loadGameConfig, publishMyPublicState, publishMyPrivateState, listenToMatch, fetchMatchForReconnect, clearActiveMatchId, uploadTelemetrySession, setMatchPlayerReady, publishPrivateSelectionOffer, fetchPrivateSelectionOffer, deletePrivateSelectionOffer } from './firebaseClient.js';
import { POINTS, applyGameConfig } from './store.js';
import { buildMyPublicPatch, buildMyPrivatePatch, extractRivalStateFromPublicDoc, extractSharedStateFromPublicDoc, extractMyStateFromPublicDoc, serializeStackForPublic, deserializeStackFromPublic, serializeStackTarget, deserializeStackTarget, otherRole, refreshStackBoardRefs, relinkEquipmentAttachments } from './matchSync.js';
import { initTelemetry, startTelemetrySession, endTelemetrySession, recordTelemetryEvent, recordTelemetryNetwork, recordTelemetryDecision, recordTelemetryInitialDecks } from './telemetry.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, ENGINE_BUILD_LABEL, BUILD_MANIFEST_URL, isExactMultiplayerVersionCompatible } from './version.js';
import { MULTIPLAYER_TEST_DECK_NAME, buildMultiplayerTestDeck } from './testDeck.js';
import { stampCardOwner, zoneForCardOwner } from './zoneOwnership.js';
import { PRIVATE_ZONE_VISIBILITY, PRIVATE_ZONE_FILTERS, buildPrivateZoneOffer, resolvePrivateZoneSelection } from './privateZoneProtocol.js';

globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('main_module_evaluated');

const COLOR_LABELS = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde' };

// Fase 1: rastrea la carga (asíncrona) del perfil de Firestore del usuario logueado.
// initGame la espera ANTES de decidir si hay que crear una colección inicial — sin esto,
// si alguien logueado aprieta "Jugar" muy rápido después de loguearse, state.userProfile
// todavía podría estar en null aunque YA tenga una cuenta real, y le pisaríamos la
// colección/puntos existentes con una colección "inicial" nueva por error de timing.
let userProfileLoadPromise = Promise.resolve();

// 23.13.0 — una sola puerta para registrar el login diario después de tener un perfil real.
// Firestore hace la operación idempotente, así que un callback duplicado/reload el mismo día
// no duplica streak ni premio. La UI de claim aparece sólo en el primer login calendario.
async function processDailyLoginRewards() {
  if (!state.currentUser || !state.userProfile) return null;
  try {
    const result = await registerDailyLogin(state.currentUser.uid);
    state.userProfile = { ...result.profile, rewardDebugOffsetDays: result.login?.debugOffsetDays || 0 };
    updateAccountUI(state.currentUser);
    if (result.login?.newCalendarLogin) {
      setTimeout(() => showDailyLoginRewardModal(result.login), 0);
    }
    return result;
  } catch (err) {
    console.error('No se pudo registrar la recompensa diaria:', err);
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
  botDifficulty: 'hard',

  // Fase 0 del multiplayer: null si no hay nadie logueado (Solitario funciona igual, sin
  // persistencia — el login es opcional). Si hay sesión, es un objeto chico normalizado
  // { uid, displayName, photoURL, email } — se actualiza solo desde onAuthChange en boot()
  // (main.js), nunca hay que tocarlo a mano desde otro lado.
  currentUser: null,
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

  // ENTREGA 23.10: transacción de casteo 601.2. Guarda propuesta/elecciones/targets/costo
  // bloqueado ANTES de activar fuentes de maná. No viaja por Firestore.
  pendingCastTransaction: null,
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
// devuelve SOLO el nombre de pila de Google si hay sesión (nunca el apellido completo, por
// privacidad — no queremos doxear a nadie), o "El Gaucho" si no hay sesión.
export function getLocalPlayerName() {
  if (state.currentUser && state.currentUser.displayName) {
    const firstName = state.currentUser.displayName.trim().split(/\s+/)[0];
    if (firstName) return firstName;
  }
  return 'El Gaucho';
}

// BUGFIX: nombre a mostrar para el RIVAL — "El Tano" en Solitario (el bot de siempre), o
// el nombre de pila real del rival en una partida multiplayer (ya viene recortado a primer
// nombre desde showMultiplayerLobby, ver renderMatched en ui.js). Reemplaza los mensajes
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
        () => {
          state.gameOver = true; // evita que checkGameOver procese esto como otra cosa
          // ENTREGA 23: cerrar la caja negra ANTES de iniciar las escrituras de abandono /
          // recarga. El upload final corre en paralelo mientras se aplica la penalidad.
          endTelemetrySession('abandon_local');
          // FASE 4, ETAPA 6: en multiplayer, el rival tiene que ENTERARSE de que abandoné —
          // se publica ANTES de recargar, para que le llegue por sync incluso si mi
          // pantalla ya se está yendo. Su propio checkGameOver() (turnManager.js) detecta
          // abandonedBy:'rival' y se premia a sí mismo con la victoria — nunca puedo
          // hacerlo yo por él (no tengo permiso de escritura sobre su cuenta).
          if (state.currentMatch) {
            state.abandonedBy = 'local';
            publishMatchState();
          }
          if (state.currentUser) {
            awardPoints(state.currentUser.uid, POINTS.abandonPenalty)
              .then(newTotal => {
                logMsg(`🏳️ Abandonaste la partida — te descontamos ${Math.abs(POINTS.abandonPenalty)} puntos. Te quedan ${newTotal} en total.`);
              })
              .catch(err => console.error('No se pudo aplicar la penalidad de abandono:', err))
              .finally(() => location.reload());
          } else {
            location.reload();
          }
        },
        () => {} // "Seguir jugando": no hace falta hacer nada, el modal ya se cerró solo
      );
    });
  }

  // Mejor esfuerzo, NO 100% confiable — es una limitación real de la plataforma web, no del
  // código: los navegadores no garantizan que un pedido de red termine de completarse
  // durante beforeunload. El mecanismo confiable de verdad es el botón de arriba; esto es
  // solo una red de contención para cuando alguien cierra la pestaña sin pasar por él.
  window.addEventListener('beforeunload', () => {
    if (!state.gameOver && state.currentUser) {
      awardPoints(state.currentUser.uid, POINTS.abandonPenalty).catch(() => {});
      // Mismo mejor esfuerzo para avisarle al rival, si había una partida multiplayer activa.
      if (state.currentMatch) {
        state.abandonedBy = 'local';
        publishMatchState().catch(() => {});
      }
    }
  });
}

async function initGame(deckSource) {
  logMsg("Cargando el mazo...");

  await mobileSoloYield('before_board_layout');
  setupBoardLayout();
  replaceSpellStackFromSync([]);
  await mobileSoloYield('board_layout_ready');

  let deckLabel;
  if (deckSource.type === 'saved') {
    state.localDeck = buildDeckFromCardIds(deckSource.deck.cardIds, state.userProfile && state.userProfile.enhancements);
    deckLabel = deckSource.deck.name;
  } else {
    state.localDeck = buildRandomDeck(deckSource.identity);
    deckLabel = deckSource.identity.join('/');
  }
  await mobileSoloYield('local_deck_ready', { count: state.localDeck.length });
  state.rivalDeck = buildRandomDeck();
  await mobileSoloYield('rival_deck_ready', { count: state.rivalDeck.length });

  // ENTREGA 22: sesión diagnóstica aislada para esta partida contra el Tano. Se arranca
  // después de construir ambos mazos y ANTES de robar, así el log conserva el orden inicial
  // completo de las dos bibliotecas sin intervenir en ningún RNG ni regla.
  startTelemetrySession({
    mode: 'solo',
    difficulty: state.botDifficulty,
    deckLabel
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
    if (!state.userProfile) {
      const starterCardIds = state.localDeck.map(c => c.id);
      try {
        state.userProfile = await createUserProfile(state.currentUser.uid, state.currentUser, starterCardIds);
        await processDailyLoginRewards();
        logMsg("🎁 ¡Se guardó tu colección inicial de 60 cartas en tu cuenta!");
      } catch (err) {
        console.error('No se pudo guardar la colección inicial:', err);
        logMsg("⚠️ No se pudo guardar tu colección inicial — revisá tu conexión. Podés seguir jugando igual.");
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
    hookGameplayButtons();
    render();
    logMsg(`¡Arranca la partida! Jugás con "${deckLabel}".`);
    logMsg("¡Tu turno! Bajá una tierra para empezar.");
  };

  await mobileSoloYield('before_mulligan_ui', { local: state.localHand.length });
  startLocalMulliganFlow(finishSetup);
  await mobileSoloYield('mulligan_ui_open');
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
    logMsg(`🃏 El Tano hizo mulligan ${count} vez(es) y dejó ${count} carta(s) al fondo de su mazo.`);
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
          logMsg("Te quedaste con tu mano inicial.");
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
          logMsg(`Dejaste tu mano entera (${allCards.length} carta(s)) al fondo del mazo. Arrancás con 0 cartas en mano.`);
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
          logMsg(`Dejaste ${countToBottom} carta(s) al fondo del mazo. Mano final: ${state.localHand.length} cartas.`);
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
      const starterDeck = buildRandomDeck(chosenIdentity);
      try {
        state.userProfile = await createUserProfile(state.currentUser.uid, state.currentUser, starterDeck.map(c => c.id));
        await processDailyLoginRewards();
        logMsg(`🎁 ¡Tu colección inicial (${chosenIdentity.join('/')}) quedó guardada para siempre!`);
      } catch (err) {
        console.error('No se pudo guardar la colección inicial:', err);
        logMsg("⚠️ No se pudo guardar tu colección inicial — revisá tu conexión. Volvé a entrar para reintentarlo.");
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
    const ok = manifest?.engineVersion === ENGINE_VERSION && manifest?.engineProtocolVersion === ENGINE_PROTOCOL_VERSION;
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

  // Fase 0 del multiplayer: se engancha UNA sola vez, apenas arranca la página, sin
  // importar qué pantalla esté mostrándose en ese momento (menú, Opciones, Enciclopedia, o
  // ya en medio de una partida) — updateAccountUI decide sola qué actualizar según qué haya
  // en el DOM en ese instante. Esto es lo que hace que loguearte desde cualquier lado
  // refresque el avatar y el widget de cuenta sin tener que reabrir nada a mano.
  onAuthChange((firebaseUser) => {
    state.currentUser = firebaseUser ? {
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      email: firebaseUser.email
    } : null;
    updateAccountUI(state.currentUser);

    if (state.currentUser) {
      // 23.11.6 mobile: Firebase queda fuera del camino crítico hasta que el usuario
      // activa explícitamente una función online (por ejemplo Login). Una vez que Auth
      // ya cargó el SDK y entrega un usuario real, recuperamos también la configuración
      // remota para recuperar paridad con desktop SIN volver a bloquear el primer menú.
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

      // Fase 1: apenas se loguea, buscamos si ya tiene perfil guardado. Si lo tiene, lo
      // cargamos y le refrescamos la marca de última conexión; si no (primera vez de
      // verdad, o la cuenta se acaba de borrar), le mostramos YA el modal de mazo inicial
      // — no hace falta esperar a que apriete "Jugar".
      userProfileLoadPromise = loadUserProfile(state.currentUser.uid)
        .then(async profile => {
          state.userProfile = profile;
          if (profile) {
            await processDailyLoginRewards();
            // FASE 4, ETAPA 6: si el perfil trae una partida marcada como en curso, se la
            // consultamos a Firestore para confirmar que sigue siendo real antes de
            // ofrecer reconectar (ver offerReconnectIfStillActive).
            if (profile.activeMatchId) {
              offerReconnectIfStillActive(profile.activeMatchId);
            }
          } else {
            promptStarterDeckSelection();
          }
        })
        .catch(err => {
          console.error('No se pudo cargar el perfil de Firestore:', err);
          state.userProfile = null;
        });
    } else {
      state.userProfile = null;
      userProfileLoadPromise = Promise.resolve();
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
    document.body.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08100b;color:#f0e0b0;font-family:system-ui;padding:24px"><div style="max-width:680px;border:2px solid #d4af37;border-radius:14px;padding:24px;text-align:center;background:#111a13"><h2>${title}</h2><p>${body}</p><p style="opacity:.8">Motor ${ENGINE_VERSION} · Pool esperado: 511 cartas.</p></div></div>`;
    return;
  } finally {
    const loadingOverlay = document.getElementById('boot-loading-overlay');
    if (loadingOverlay) loadingOverlay.remove();
  }

  markEngineBootState('ready', { engineVersion: ENGINE_VERSION });
  showMainMenu(startPlayFlow, startMultiplayerFlow);
  // Firebase queda fuera del critical path, pero se precalienta cuando el menú ya está
  // visible. Así el click de Google puede abrir el popup dentro de la activación del usuario.
  scheduleMobileFirebasePrewarm();
}

// FASE 3, ETAPA 4: si el jugador logueado ya tiene al menos un mazo guardado, "Jugar" le
// pregunta con cuál de los suyos quiere entrar (showPlayDeckPickerModal) — con la opción de
// igual armar uno random si prefiere. Sin sesión, o con sesión pero sin ningún mazo
// guardado todavía (no debería pasar en la práctica, pero por las dudas), el comportamiento
// es EXACTAMENTE el de siempre: selector de identidad, mazo random.
function startPlayFlow() {
  const savedDecks = (state.currentUser && state.userProfile && state.userProfile.decks) || [];
  // FEATURE (#9): logueado, siempre elegís uno de tus propios mazos — nunca la opción de
  // mazo random, que solo tenía sentido para alguien sin cuenta (nada propio para armar).
  // "Volver" te devuelve al menú principal en vez de dejarte sin salida.
  if (state.currentUser && savedDecks.length > 0) {
    showPlayDeckPickerModal(
      (chosenDeck) => initGame({ type: 'saved', deck: chosenDeck }),
      null,
      () => showMainMenu(startPlayFlow, startMultiplayerFlow)
    );
  } else {
    showDeckSelectionModal(
      (chosenIdentity) => initGame({ type: 'random', identity: chosenIdentity }),
      {},
      () => showMainMenu(startPlayFlow, startMultiplayerFlow)
    );
  }
}

// FASE 4 (CIERRE DEL ROADMAP): se llama desde showMultiplayerLobby (ui.js) apenas dos
// jugadores se emparejan — elegís tu mazo exactamente con el mismo picker que Solitario. No
// hace falta coordinar nada con el rival para esto: cada mazo/mano es privado por diseño,
// así que cada cliente arma el suyo de forma totalmente independiente.
function startMultiplayerFlow(matchId, myRole, rivalName, rivalPhotoURL = '') {
  // Multiplayer normal sigue sin mazos random. 23.8.1 agrega una ÚNICA excepción de QA:
  // "Mazo de pruebas", determinista y no persistente, visible al pie del picker.
  showPlayDeckPickerModal(
    (chosenDeck) => startMultiplayerMatch(matchId, myRole, { type: 'saved', deck: chosenDeck }, rivalName, rivalPhotoURL),
    null,
    () => showMainMenu(startPlayFlow, startMultiplayerFlow),
    () => startMultiplayerMatch(matchId, myRole, { type: 'test' }, rivalName, rivalPhotoURL)
  );
}

// FASE 4 (CIERRE DEL ROADMAP): arranca una partida multiplayer real — cada cliente arma SU
// PROPIO mazo/mano (el rival NUNCA se arma acá, es una persona de verdad del otro lado; su
// mano/mazo llegan solos por sync una vez que publique lo suyo). "Quién arranca" se decide
// con una regla FIJA que ambos clientes calculan por su cuenta con su propio myRole, sin
// coordinar nada ni sortear nada: el host siempre juega primero.
function startMultiplayerMatch(matchId, myRole, deckSource, rivalName, rivalPhotoURL = '') {
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

  // BUGFIX: guardamos el nombre real del rival acá — getRivalName() (más arriba en este
  // archivo) lo usa en vez de "El Tano" en todos los mensajes que corren tanto en
  // Solitario como en multiplayer (motor de combate, efectos, turnos).
  state.currentMatch = { matchId, myRole, rivalName: rivalName || 'tu rival', rivalPhotoURL: rivalPhotoURL || '', engineVersion: ENGINE_VERSION, engineProtocolVersion: ENGINE_PROTOCOL_VERSION };
  state.activePlayer = myRole === 'host' ? 'local' : 'rival';
  state.priorityPlayer = state.activePlayer;
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
      logMsg(`¡Arranca la partida! Jugás con "${deckLabel}".`);
      logMsg(state.activePlayer === 'local' ? "¡Tu turno! Bajá una tierra para empezar." : "Esperando a que tu rival juegue...");
    });
  };

  startLocalMulliganFlow(() => { finishSetup().catch(err => {
    console.error('No se pudo completar la barrera de inicio multiplayer:', err);
    state.multiplayerWaitingForReady = false;
    hideMultiplayerReadyBarrier();
    alert('No se pudo sincronizar el inicio de la partida. Volvé al menú e intentá nuevamente.');
  }); });
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
  graveyard.push(...discardedCards);
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
    const t = req.target === 'own_artifact' ? 'artifact' : req.target === 'own_creature' ? 'creature' : null;
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
  const permanentType = spec.target === 'own_artifact' ? 'artifact' : spec.target === 'own_creature' ? 'creature' : null;
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
  }

  if (selectedDiscards.length) {
    const entries = selectedDiscards.map(c => ({ card:c, index:hand.indexOf(c) })).sort((a,b) => b.index-a.index);
    const removed = [];
    entries.forEach(e => { if (e.index >= 0) removed.push({ card:hand.splice(e.index,1)[0], index:e.index }); });
    removed.sort((a,b) => a.index-b.index);
    grave.push(...removed.map(e => e.card));
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
  }

  if (selectedSacrifices.length) performSacrificeBatch(selectedSacrifices, isLocal);

  if (bundle.life > 0 || selectedDiscards.length || selectedSacrifices.length || selectedGraveyard.length) {
    if (isLocal) state.pendingSpellCostsIrreversible = true;
    const paid = [];
    if (bundle.life) paid.push(`${bundle.life} de vida`);
    if (selectedDiscards.length) paid.push(`descartó ${selectedDiscards.map(c=>c.name).join(', ')}`);
    if (selectedSacrifices.length) paid.push(`sacrificó ${selectedSacrifices.map(i=>i.card.name).join(', ')}`);
    if (selectedGraveyard.length) paid.push(`exilió ${selectedGraveyard.map(c=>c.name).join(', ')} del cementerio`);
    logMsg(`💳 ${card.name}: ${useAlternative ? 'costo alternativo' : 'costo adicional'} pagado (${paid.join('; ')}).`);
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
  if (decision.type === 'private_zone_offer') {
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
      const idx = targetItem ? state.localCombat.indexOf(targetItem) : -1;
      if (idx === -1 || target?.type !== 'creature' || target?.isLocal !== true || targetItem?._syncTombstone) {
        state.respondingToDecision = false;
        render();
        respondToDecision(decision.requestId, {
          completed: false,
          reason: 'target_not_found',
          cardName: decision.cardName || decision.target?.cardName || null
        });
        return;
      }

      state.localCombat.splice(idx, 1);
      detachEquipmentFrom(targetItem, true);
      sendAurasToGraveyard(targetItem, true);
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
        ? `🗑️ ${decision.cardName || 'Efecto rival'}: descartaste ${result.discardedNames.join(', ')}.`
        : `🗑️ ${decision.cardName || 'Efecto rival'}: no descartaste ninguna carta.`);
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
      state.localGraveyard.push(card);
      discardedNames.push(card.name);
    });
    logMsg(discardedNames.length > 0
      ? `🗑️ ¡${decision.cardName} de tu rival te hizo descartar: ${discardedNames.join(', ')}!`
      : `🗑️ ¡${decision.cardName} de tu rival intentó hacerte descartar, pero no tenías cartas!`);
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

    // El eco de MI propia escritura es un ACK de transporte, no una orden de gameplay.
    // 23.6 frenó el re-publish del snapshot remoto; 23.7 además impide que un snapshot local
    // viejo vuelva a aplicar consecutivePasses/phase sobre un estado que ya avanzó.
    if ((writerClientId && writerClientId === matchSyncClientId) || (writerRole && writerRole === myRole)) {
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
      if ((!touchedKeys || touchedKeys.has('priorityClockSerial')) && Number.isFinite(Number(publicDoc.priorityClockSerial))) {
        syncPriorityClockFromNetwork({
          serial: Number(publicDoc.priorityClockSerial),
          durationMs: Number(publicDoc.priorityClockDurationMs) || 15000,
          receivedAtClientMs: receiveClientMs,
          source: 'self_ack',
          serverCommittedAtMs
        });
      }
      return;
    }

    const writerKey = writerClientId || writerRole || null;
    if (writerKey && Number.isFinite(writerSeq)) {
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

    const writtenByRival = writerRole ? writerRole !== myRole : false;

    const incoming = {
      // Si el ÚLTIMO write fue del rival, puede contener cambios autoritativos sobre MI
      // battlefield (daño, removal, bounce, etc.). Sólo importamos las keys que ese write
      // declaró haber tocado; nunca leemos de rebote campos viejos del documento mergeado.
      ...(writtenByRival ? extractMyStateFromPublicDoc(publicDoc, myRole, touchedKeys) : {}),
      ...extractRivalStateFromPublicDoc(publicDoc, myRole, touchedKeys),
      ...extractSharedStateFromPublicDoc(publicDoc, myRole, touchedKeys)
    };

    // ENTREGA 23.6: la Stack es parte del snapshot público, pero necesita traducción de
    // perspectiva host/guest <-> local/rival. Comparamos en formato canónico para que un
    // eco de nuestro propio publish no parezca un cambio sólo porque `isLocal` se invierte.
    const hasIncomingStack = (!touchedKeys || touchedKeys.has('stackState')) && Object.prototype.hasOwnProperty.call(publicDoc, 'stackState') && Array.isArray(publicDoc.stackState);
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
      if ((!touchedKeys || touchedKeys.has('priorityClockSerial')) && Number.isFinite(Number(publicDoc.priorityClockSerial))) {
        syncPriorityClockFromNetwork({
          serial: Number(publicDoc.priorityClockSerial),
          durationMs: Number(publicDoc.priorityClockDurationMs) || 15000,
          receivedAtClientMs: receiveClientMs,
          source: 'remote_sync',
          serverCommittedAtMs
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
  state.currentMatch = { matchId, myRole, rivalName: rivalName || 'tu rival', rivalPhotoURL: rivalPhotoURL || '', engineVersion: ENGINE_VERSION, engineProtocolVersion: ENGINE_PROTOCOL_VERSION };
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
  logMsg("🔄 Te reconectaste a tu partida en curso.");
}

// FASE 4, ETAPA 6: se llama apenas carga el perfil en boot() — si trae un activeMatchId,
// confirmamos con Firestore que la partida SIGUE siendo real (no terminada, no borrada)
// antes de ofrecer reconectar. Nunca confiamos ciegamente en el marcador solo: podría estar
// desactualizado (ej. el otro cliente falló al limpiarlo).
function offerReconnectIfStillActive(matchId) {
  fetchMatchForReconnect(matchId, state.currentUser.uid)
    .then(matchData => {
      if (!matchData) {
        clearActiveMatchId(state.currentUser.uid).catch(() => {});
        return;
      }
      if (matchData.incompatible) {
        const remote = matchData.engineVersion || 'versión anterior/desconocida';
        window.alert(`La partida guardada usa ${remote} y esta pestaña usa ${ENGINE_VERSION}. No se puede reconectar con motores distintos. Actualizá ambas notebooks.`);
        return;
      }
      const myRole = matchData.publicDoc.hostUid === state.currentUser.uid ? 'host' : 'guest';
      // BUGFIX: mismo criterio de privacidad de siempre — solo el nombre de pila.
      const rivalUid = myRole === 'host' ? matchData.publicDoc.guestUid : matchData.publicDoc.hostUid;
      const rivalProfile = (matchData.publicDoc.players && matchData.publicDoc.players[rivalUid]) || {};
      const rivalFullName = rivalProfile.displayName || '';
      const rivalName = (rivalFullName.trim().split(/\s+/)[0]) || 'tu rival';
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
            awardPoints(state.currentUser.uid, POINTS.abandonPenalty).catch(() => {});
          }
          clearActiveMatchId(state.currentUser.uid).catch(() => {});
        }
      );
    })
    .catch(err => console.error('No se pudo revisar la partida en curso:', err));
}

export function getEffectivePower(itemObj) {
  const card = itemObj.card || itemObj;
  let p = card.power || 0;
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
  let t = card.toughness || 0;
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
  const base = card.keywords || [];
  const fromAuras = (itemObj.auras || []).flatMap(a => (a.auraEffect && a.auraEffect.keywords) || []);
  const fromEquipment = getEquipmentOn(itemObj).flatMap(eq => (eq.card.equipment && eq.card.equipment.grantedKeywords) || []);
  const fromStatic = getStaticTeamModifiers(itemObj)
    .filter(m => m.type === 'team_keyword')
    .map(m => m.keyword);
  const fromTemp = (itemObj.tempEffects || []).flatMap(t => t.keywords || []);
  // FASE 3 (revisión post-Etapa 4): la mejora por Fichas YA NO se busca acá dinámicamente
  // — antes esto aplicaba a CUALQUIER copia con el mismo ID, lo cual estaba mal (el pedido
  // es que sea UNA sola copia puntual, elegible). Ahora la keyword de la mejora se hornea
  // directo en card.keywords de esa copia específica al armar el mazo (ver
  // buildDeckFromCardIds en utils.js), así que ya viene incluida en `base` de acá arriba.
  return [...new Set([...base, ...fromAuras, ...fromEquipment, ...fromStatic, ...fromTemp])];
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

export function getGraveyardChoiceCandidates(zoneIsLocal, filter = 'any') {
  const graveyard = zoneIsLocal ? state.localGraveyard : state.rivalGraveyard;
  return graveyard
    .map((card, index) => ({ card, index }))
    .filter(entry => cardMatchesGraveyardFilter(entry.card, filter));
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
    botStrategy = 'highest_value'
  } = options || {};
  if (!GRAVEYARD_FILTERS.includes(filter)) {
    logMsg(`⚠️ ${cardName}: filtro de cementerio desconocido "${filter}".`);
    return [];
  }

  const candidates = getGraveyardChoiceCandidates(zoneIsLocal, filter);
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
      zoneOwnerRole, filter, amount: count, cardName, actionLabel, botStrategy
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
  const suffix = targetKind === 'creature' ? 'Creature' : targetKind === 'permanent' ? 'Permanent' : 'Planeswalker';
  return !!rules[`allow${sameSide ? 'Local' : 'Rival'}${suffix}`];
}

export function isResolvedEffectTargetLegal(targetObj, options) {
  if (!targetObj || !options?.effect) return false;
  const controllerIsLocal = options.controllerIsLocal !== false;
  const sourceCard = options.sourceCard || { name: options.cardName || 'Efecto', colors: [] };
  const cardLike = resolvedEffectTargetCard(sourceCard, options.effect, options.cardName);
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
    if (options.effect.type === 'grant_keyword_temp' && options.effect.keyword && hasKeyword(unit, options.effect.keyword)) return false;
    return true;
  }

  if (targetObj.type === 'permanent') {
    const zone = targetObj.isLocal ? state.localSupport : state.rivalSupport;
    if (!targetObj.item || !zone.includes(targetObj.item)) return false;
    return !rules.permanentFilter || targetObj.item.card.type.includes(rules.permanentFilter);
  }

  if (targetObj.type === 'planeswalker') {
    const zone = targetObj.isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
    return !!targetObj.item && zone.includes(targetObj.item);
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

  if (['pump', 'grant_keyword_temp', 'attach_equipment'].includes(effect.type) || (effect.type === 'add_counter' && effect.counterType !== 'minusOne')) {
    return strongest(candidates.filter(t => t.type === 'creature' && own(t))) || candidates.find(own) || candidates[0];
  }
  if (effect.type === 'heal') return candidates.find(t => t.type === 'player' && own(t)) || candidates[0];
  if (['discard', 'poison', 'exile_graveyard', 'prevent_attack'].includes(effect.type)) {
    return candidates.find(t => t.type === 'player' && opponent(t)) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'damage') {
    const killablePw = candidates.find(t => t.type === 'planeswalker' && opponent(t) && t.item.loyalty <= (effect.amount || 0));
    return killablePw || candidates.find(t => t.type === 'player' && opponent(t)) || strongest(candidates.filter(t => t.type === 'creature' && opponent(t))) || candidates[0];
  }
  if (['destroy_creature', 'exile_creature', 'bounce', 'fight', 'cant_attack_next_turn'].includes(effect.type) || (effect.type === 'add_counter' && effect.counterType === 'minusOne')) {
    return strongest(candidates.filter(t => t.type === 'creature' && opponent(t))) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'destroy_artifact') {
    // Puede vivir en Support o en Combat (Criatura Artefacto / Vehículo tripulado).
    return strongest(candidates.filter(t => (t.type === 'permanent' || t.type === 'creature') && opponent(t))) || candidates.find(opponent) || candidates[0];
  }
  if (effect.type === 'destroy_enchantment') {
    return strongest(candidates.filter(t => t.type === 'permanent' && opponent(t))) || candidates.find(opponent) || candidates[0];
  }
  return candidates.find(opponent) || candidates[0];
}

function serializeResolvedEffectTarget(targetObj) {
  if (!targetObj || !state.currentMatch) return null;
  const myRole = state.currentMatch.myRole;
  const ownerRole = targetObj.isLocal ? myRole : otherRole(myRole);
  if (targetObj.type === 'player') return { type: 'player', ownerRole };
  const zone = targetObj.type === 'creature'
    ? (targetObj.isLocal ? state.localCombat : state.rivalCombat)
    : targetObj.type === 'permanent'
      ? (targetObj.isLocal ? state.localSupport : state.rivalSupport)
      : (targetObj.isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers);
  const index = targetObj.index ?? zone.indexOf(targetObj.item);
  if (index < 0) return null;
  return {
    type: targetObj.type,
    ownerRole,
    index,
    cardId: targetObj.item?.card?.id || null,
    cardName: targetObj.item?.card?.name || null
  };
}

function deserializeResolvedEffectTarget(descriptor) {
  if (!descriptor || !state.currentMatch) return null;
  const isLocal = descriptor.ownerRole === state.currentMatch.myRole;
  if (descriptor.type === 'player') return { type: 'player', isLocal };
  const zone = descriptor.type === 'creature'
    ? (isLocal ? state.localCombat : state.rivalCombat)
    : descriptor.type === 'permanent'
      ? (isLocal ? state.localSupport : state.rivalSupport)
      : descriptor.type === 'planeswalker'
        ? (isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers)
        : null;
  if (!zone) return null;
  const item = zone[descriptor.index];
  if (!item) return null;
  if (descriptor.cardId && item.card?.id && descriptor.cardId !== item.card.id) return null;
  if (!descriptor.cardId && descriptor.cardName && item.card?.name !== descriptor.cardName) return null;
  return { type: descriptor.type, isLocal, index: descriptor.index, item };
}

function finishPendingResolvedEffectTarget(targetObj) {
  const pending = state.pendingResolvedEffectTargetChoice;
  if (!pending) return false;
  if (!isResolvedEffectTargetLegal(targetObj, pending.options)) {
    logMsg(`Ese no es un objetivo válido para ${pending.cardName}.`);
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
    logMsg(`⚠️ ${cardName}: no hay objetivos legales.`);
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
    logMsg(`🎯 ${cardName}: elegí un objetivo.`);
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
      logMsg(`⚠️ ${cardName}: el objetivo remoto dejó de ser legal.`);
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
  return [];
}

// --- SACRIFICAR COMO COSTO ---
// API histórica: un solo permanente. Se mantiene independiente para no cambiar ninguna
// ruta preexistente; comparte exactamente las reglas de salida con el nuevo batch.
export function performSacrifice(item, isLocal) {
  const zones = isLocal
    ? [state.localCombat, state.localSupport, state.localLands]
    : [state.rivalCombat, state.rivalSupport, state.rivalLands];
  const grave = isLocal ? state.localGraveyard : state.rivalGraveyard;

  for (const zone of zones) {
    const idx = zone.indexOf(item);
    if (idx === -1) continue;
    const isCreatureZone = (zone === state.localCombat || zone === state.rivalCombat);
    zone.splice(idx, 1);
    if (isCreatureZone) {
      detachEquipmentFrom(item, isLocal);
      sendAurasToGraveyard(item, isLocal);
      cleanupIfVehicle(item);
    }
    moveBattlefieldCardToZone(item.card, grave);
    logMsg(`🔪 ¡Sacrificaste a ${item.card.name}!${item.card.isToken ? ' Al ser ficha, dejó de existir.' : ''}`);
    if (isCreatureZone) {
      triggerCreatureDies(item, isLocal);
      triggerAnyCreatureDeath(item, isLocal);
    }
    return true;
  }
  logMsg(`⚠️ No se pudo sacrificar a ${item.card.name}: ya no está en el campo.`);
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
  const grave = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const deathWatchersSnapshot = [
    ...state.localCombat.map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.map(unit => ({ unit, isLocal: false }))
  ];

  const removed = [];
  for (const item of uniqueItems) {
    let foundZone = null;
    let idx = -1;
    for (const zone of zones) {
      idx = zone.indexOf(item);
      if (idx !== -1) { foundZone = zone; break; }
    }
    if (!foundZone) continue;

    const isCreatureZone = foundZone === combat;
    foundZone.splice(idx, 1);
    if (isCreatureZone) {
      detachEquipmentFrom(item, isLocal);
      sendAurasToGraveyard(item, isLocal);
      cleanupIfVehicle(item);
    }
    moveBattlefieldCardToZone(item.card, grave);
    removed.push({ item, isCreature: isCreatureZone });
    logMsg(`🔪 ¡Sacrificaste a ${item.card.name}!${item.card.isToken ? ' Al ser ficha, dejó de existir.' : ''}`);
  }

  queueCreatureDeathBatch(
    removed.filter(entry => entry.isCreature).map(entry => ({ unit: entry.item, isLocal })),
    deathWatchersSnapshot
  );
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

  const ownSupport = inLocalBattlefield ? state.localSupport : state.rivalSupport;
  const oppSupport = inLocalBattlefield ? state.rivalSupport : state.localSupport;
  const mods = [];
  ownSupport.forEach(s => {
    const eff = s.card.staticEffect;
    if (eff && (eff.scope || 'own') === 'own') mods.push({ ...eff, sourceName: s.card.name });
  });
  oppSupport.forEach(s => {
    const eff = s.card.staticEffect;
    if (eff && eff.scope === 'opponent') mods.push({ ...eff, sourceName: s.card.name });
  });
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
  reanimate_etb: 'ETB reanimado', return_etb: 'ETB al volver'
};

export function queueTriggeredAbility({
  effect, sourceCard, sourceItem = null, isLocal = true, triggerType = 'trigger',
  targetObj = null, selfTarget = false, eventCard = null, eventItem = null
} = {}) {
  if (!effect || !effect.type || !sourceCard) return null;
  const triggerLabel = TRIGGER_LABELS[triggerType] || triggerType;
  const stackItem = {
    card: sourceCard,
    isLocal,
    targetObj,
    type: 'ability',
    abilityKind: 'triggered',
    triggerType,
    triggerLabel,
    ability: { effect: { ...effect } },
    source: {
      type: 'triggered', triggerType, sourceItem, sourceCardId: sourceCard.id || null,
      selfTarget: !!selfTarget, eventCard: eventCard || null, eventItem: eventItem || null
    }
  };
  addToStack(stackItem);
  state.triggerStackSerial = (state.triggerStackSerial || 0) + 1;
  // Un trigger nuevo invalida pases previos: nadie puede haber pasado respecto de un objeto
  // que todavía no existía. Esto es crítico cuando los bloqueadores se declararon tras un pase.
  state.consecutivePasses = 0;
  return stackItem;
}

// AP/NAP simplificado para un lote detectado como simultáneo: el jugador activo coloca
// primero sus disparos y el no-activo después, por lo que los del no-activo quedan arriba.
// Como la Stack es LIFO, invertimos cada grupo al INSERTAR para que, sin UI manual de orden,
// la resolución dentro de cada controlador conserve el orden histórico del snapshot.
export function queueTriggeredAbilities(entries = []) {
  const valid = entries.filter(e => e && e.effect && e.sourceCard);
  const activeIsLocal = state.activePlayer === 'local';
  const activeEntries = valid.filter(e => !!e.isLocal === activeIsLocal).reverse();
  const nonActiveEntries = valid.filter(e => !!e.isLocal !== activeIsLocal).reverse();
  return [...activeEntries, ...nonActiveEntries].map(queueTriggeredAbility).filter(Boolean);
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
  return queueTriggeredAbilities(
    watchers.map(item => ({
      effect: item.card.creatureEtbTrigger, sourceCard: item.card, sourceItem: item, isLocal,
      triggerType: 'creature_etb', eventCard: enteredCard, eventItem: enteredItem
    }))
  );
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
  ].filter(entry => entry.card && entry.card.landEtbTrigger);

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

    logMsg(`🌿 Landfall — ${card.name} reaccionó a ${landCard?.name || 'una Tierra'}.`);
    entries.push({
      effect, sourceCard: card, sourceItem: item, isLocal, targetObj: implicitTarget,
      selfTarget: implicitSelfCreature, triggerType: 'land_etb', eventCard: landCard, eventItem: landItem
    });
  }
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
  ].filter(entry => entry.card && entry.card.spellCastTrigger);

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

    logMsg(`✨ Spellslinger — ${card.name} reaccionó a ${castCard.name}.`);
    entries.push({
      effect, sourceCard: card, sourceItem: item, isLocal, targetObj: implicitTarget,
      selfTarget: implicitSelfCreature, triggerType: 'spell_cast', eventCard: castCard, eventItem: stackItem
    });
  }
  return queueTriggeredAbilities(entries);
}

// Lote de muertes simultáneas. Todos los disparos del mismo evento se recolectan ANTES de
// apilarse, usando el snapshot previo a las muertes. Esto evita que un Blood-Artist-like que
// también murió deje de "ver" a las otras criaturas y, además, permite aplicar AP/NAP al
// conjunto completo en vez de apilar muerte por muerte según el orden accidental de arrays.
export function queueCreatureDeathBatch(deadEntries = [], watchersSnapshot = null) {
  const dead = (deadEntries || []).filter(entry => entry?.unit?.card);
  if (dead.length === 0) return [];
  const snapshot = watchersSnapshot || [
    ...state.localCombat.map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.map(unit => ({ unit, isLocal: false })),
    ...dead.filter(entry => !state.localCombat.includes(entry.unit) && !state.rivalCombat.includes(entry.unit))
  ];
  const entries = [];

  for (const { unit, isLocal } of dead) {
    if (unit.card.diesTrigger) {
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
      if (!item.card?.opponentDeathTrigger) return;
      entries.push({
        effect: item.card.opponentDeathTrigger, sourceCard: item.card, sourceItem: item,
        isLocal: watcherIsLocal, triggerType: 'opponent_death', eventCard: unit.card, eventItem: unit
      });
    });
    snapshot.forEach(({ unit: watcher, isLocal: watcherLocal }) => {
      if (watcherLocal !== watcherIsLocal || !watcher?.card?.opponentDeathTrigger) return;
      entries.push({
        effect: watcher.card.opponentDeathTrigger, sourceCard: watcher.card, sourceItem: watcher,
        isLocal: watcherLocal, triggerType: 'opponent_death', eventCard: unit.card, eventItem: unit
      });
    });

    snapshot.forEach(({ unit: watcher, isLocal: watcherLocal }) => {
      if (!watcher?.card?.anyCreatureDiesTrigger) return;
      entries.push({
        effect: watcher.card.anyCreatureDiesTrigger, sourceCard: watcher.card, sourceItem: watcher,
        isLocal: watcherLocal, triggerType: 'any_creature_dies', eventCard: unit.card, eventItem: unit
      });
    });
  }
  return queueTriggeredAbilities(entries);
}

// Habilidad Disparada: "Cuando esta criatura muera..." (la de la criatura misma, no importa
// cómo haya muerto — combate, un removal, o el día de mañana un sacrificio). Es la contraparte
// de triggerCreatureEtb, pero para la salida en vez de la entrada.
export function triggerCreatureDies(unit, isLocal) {
  const trig = unit?.card?.diesTrigger;
  if (!trig) return null;
  return queueTriggeredAbility({
    effect: trig, sourceCard: unit.card, sourceItem: unit, isLocal, triggerType: 'dies',
    eventCard: unit.card, eventItem: unit
  });
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
    if (!trig) return;
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
      if (opponentTrig) entries.push({
        effect: opponentTrig, sourceCard: unit.card, sourceItem: unit, isLocal,
        triggerType: 'opponent_death', eventCard: deadUnit?.card, eventItem: deadUnit
      });
    }
    const trig = unit?.card?.anyCreatureDiesTrigger;
    if (!trig) return;
    entries.push({
      effect: trig, sourceCard: unit.card, sourceItem: unit, isLocal,
      triggerType: 'any_creature_dies', eventCard: deadUnit?.card, eventItem: deadUnit
    });
  });

  return queueTriggeredAbilities(entries);
}

// --- EQUIPAMIENTO REAL (Equip) ---
// Devuelve los items de la zona de soporte (Equipos) adjuntos a esta criatura.
function sameBattlefieldObject(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aId = a._syncObjectId || a._syncDescriptor?.syncObjectId || null;
  const bId = b._syncObjectId || b._syncDescriptor?.syncObjectId || null;
  return !!aId && !!bId && aId === bId;
}

export function getEquipmentOn(itemObj) {
  const localCombat = Array.isArray(state.localCombat) ? state.localCombat : [];
  const isLocal = localCombat.some(unit => sameBattlefieldObject(unit, itemObj));
  const supportZone = isLocal
    ? (Array.isArray(state.localSupport) ? state.localSupport : [])
    : (Array.isArray(state.rivalSupport) ? state.rivalSupport : []);
  return supportZone.filter(s => s && sameBattlefieldObject(s.attachedTo, itemObj));
}

// Cuando una criatura sale del campo de batalla por cualquier vía (muerte, rebote,
// destrucción, arrasada), el Equipo que tuviera puesto se cae y se queda en tu campo:
// nunca va al cementerio con la criatura.
export function detachEquipmentFrom(creatureItem, isLocal) {
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  supportZone.forEach(s => {
    if (sameBattlefieldObject(s.attachedTo, creatureItem)) {
      logMsg(`🗡️ ${s.card.name} se cae al piso, pero sigue en tu campo listo para volver a equiparse.`);
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
    const grave = zoneForCardOwner(auraCard, state.localGraveyard, state.rivalGraveyard, isLocal, myRole);
    logMsg(`💔 ${auraCard.name} se desprendió de ${unit.card.name} y fue al cementerio de su dueño.`);
    grave.push(auraCard);
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
  const myRole = state.currentMatch?.myRole || null;
  const checkZone = (combatArray, hostIsLocal) => {
    combatArray.forEach(unit => {
      if (!unit.auras || unit.auras.length === 0) return;
      const stillLegal = [];
      unit.auras.forEach(auraCard => {
        const illegalColor = getProtectionMatch(unit, auraCard.colors || []);
        if (illegalColor) {
          logMsg(`💔 ¡${unit.card.name} tiene Protección de ${illegalColor} y ${auraCard.name} ya no puede seguir pegada! Se cae al cementerio de su dueño.`);
          zoneForCardOwner(auraCard, state.localGraveyard, state.rivalGraveyard, hostIsLocal, myRole).push(auraCard);
        } else {
          stillLegal.push(auraCard);
        }
      });
      unit.auras = stillLegal;
    });
  };
  checkZone(state.localCombat, true);
  checkZone(state.rivalCombat, false);
}

// SBA (regla real 704.5m — el caso simétrico de checkAuraLegality de arriba, pero para
// Equipos): un Equipo pegado a una criatura que ganó Protección de su color DESPUÉS de que
// ya estaba puesto también queda ilegalmente adjunto — pero a diferencia de un Aura, un
// Equipo NO va al cementerio (no depende de estar pegado a algo para existir). Se
// desprende solo y se queda como permanente en tu campo, listo para volver a equiparse en
// otra criatura apenas puedas pagar el costo de Equipar de nuevo.
export function checkEquipmentLegality() {
  const checkZone = (supportZone) => {
    supportZone.forEach(item => {
      if (!item.attachedTo) return;
      const illegalColor = getProtectionMatch(item.attachedTo, item.card.colors || []);
      if (illegalColor) {
        logMsg(`🛡️ ¡${item.attachedTo.card.name} tiene Protección de ${illegalColor} y ${item.card.name} ya no puede seguir puesto! Se cae, pero se queda en tu campo.`);
        item.attachedTo = null;
      }
    });
  };
  checkZone(state.localSupport);
  checkZone(state.rivalSupport);
}

// Si un Vehículo tripulado (que "es una criatura hasta el final del turno") sale del campo
// por cualquier camino que no sea llegar a Limpieza normalmente — muere en combate, lo
// sacrifican, lo rebotan, lo arrasa un board wipe — hay que sacarle el power/toughness de
// criatura ACÁ, en el momento, o se queda pegado ese estado (ej. se vería con stats en el
// cementerio o en la mano, como si siguiera siendo una criatura). Se llama junto con
// sendAurasToGraveyard/detachEquipmentFrom en todos los caminos de salida del campo.
export function cleanupIfVehicle(unit) {
  if (unit.isVehicle) {
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
  logMsg(`🔮 ${pwItem.card.name} activó "${ability.name}" (Lealtad ahora: ${pwItem.loyalty}). La habilidad está en la pila.`);

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
    logMsg("Las habilidades de Lealtad solo se pueden usar en tus Fases Principales.");
    return;
  }
  if (state.activePlayer !== controller) {
    logMsg("Solo podés activar la habilidad de un Planeswalker en tu propio turno.");
    return;
  }
  if (state.priorityPlayer !== controller) {
    logMsg("Necesitás tener prioridad para activar una habilidad de Lealtad.");
    return;
  }
  if (spellStack.length > 0) {
    logMsg("Las habilidades de Lealtad usan timing de conjuro: la pila tiene que estar vacía.");
    return;
  }
  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingFightChoice || state.pendingXChoice || state.pendingModeChoice || state.pendingLoyaltyTargetChoice || state.pendingMultiTargetChoice || state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0 || state.pendingResolvedEffectTargetChoice || (state.resolvingResolvedEffectTargetChoices || 0) > 0 || state.pendingEscapeExileChoice || state.pendingKickerChoice || state.pendingRampChoice) {
    logMsg("Terminá lo que tenés pendiente antes de activar esto.");
    return;
  }
  if (pwItem.abilityUsedThisTurn) {
    logMsg(`${pwItem.card.name} ya usó su habilidad de Lealtad este turno.`);
    return;
  }
  const ability = pwItem.card.loyaltyAbilities[abilityIndex];
  if (!ability || !ability.effect) return;
  if (ability.cost < 0 && pwItem.loyalty < Math.abs(ability.cost)) {
    logMsg(`${pwItem.card.name} no tiene suficiente Lealtad para esa habilidad (tiene ${pwItem.loyalty}).`);
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
      logMsg(`⚠️ ${pwItem.card.name}: "${ability.name}" no tiene ningún objetivo legal.`);
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
      logMsg(`⚠️ ${pwItem.card.name}: la activación dejó de ser legal antes de pagar la Lealtad.`);
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
    logMsg(`Ese no es un objetivo válido para "${ability.name}".`);
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
  logMsg(`🔮 "${ability.name}" de ${pwItem.card.name} retomó su activación legacy y quedó en la pila.`);
  checkPlaneswalkerDeaths();
  render();
  checkRivalCounterOrResponse();
}

// Regla de estado: un Planeswalker con Lealtad 0 o menos muere — se revisa después de
// activar una habilidad (puede costar lealtad) y después de recibir daño de combate.
export function checkPlaneswalkerDeaths() {
  [
    { zone: state.localPlaneswalkers, grave: state.localGraveyard },
    { zone: state.rivalPlaneswalkers, grave: state.rivalGraveyard }
  ].forEach(({ zone, grave }) => {
    for (let i = zone.length - 1; i >= 0; i--) {
      if (zone[i].loyalty <= 0) {
        logMsg(`💀 ¡${zone[i].card.name} se quedó sin Lealtad y murió!`);
        grave.push(zone[i].card);
        zone.splice(i, 1);
      }
    }
  });
}

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
      logMsg(`🔮 ¡${attacker.card.name} redirige su ataque a ${pwItem.card.name}!`);
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
    if (!allowed) {
      logMsg("Ese no es un objetivo válido para este target del hechizo.");
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
    if (!allowed) {
      logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
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
  const combatZone = isLocal ? state.localCombat : state.rivalCombat;

  toReturn.forEach(entry => {
    const idx = exileZone.indexOf(entry.card);
    if (idx !== -1) exileZone.splice(idx, 1);

    const newUnit = {
      card: entry.card, tapped: false, summoningSickness: true, isAttacking: false,
      blockingIndex: null, damageTaken: 0, auras: []
    };
    if (hasKeyword(newUnit, 'haste')) newUnit.summoningSickness = false;

    combatZone.push(newUnit);
    logMsg(`🌀 ¡${entry.card.name} volvió del Exilio, como si acabara de entrar al campo!`);
    triggerCreatureEtb(isLocal, entry.card, newUnit);

    if (entry.card.type.includes('Legendaria')) {
      const duplicate = combatZone.find(u => u !== newUnit && u.card.name === entry.card.name);
      if (duplicate) {
        logMsg(`⚖️ Regla de Leyenda: ya tenías a ${entry.card.name} en el campo. La que vuelve del Exilio se sacrifica.`);
        performSacrifice(newUnit, isLocal);
      }
    }

    if (entry.card.etbEffect && !entry.card.requiresTarget) {
      queueTriggeredAbility({
        effect: entry.card.etbEffect, sourceCard: entry.card, sourceItem: newUnit, isLocal,
        triggerType: 'return_etb', eventCard: entry.card, eventItem: newUnit
      });
    }
  });
}

export function attachAura(auraCard, creatureItem, ownerIsLocal = null) {
  if (ownerIsLocal !== null) stampCardOwner(auraCard, !!ownerIsLocal, state.currentMatch?.myRole || null);
  if (!creatureItem.auras) creatureItem.auras = [];
  creatureItem.auras.push(auraCard);
  logMsg(`✨ ¡${auraCard.name} se pegó a ${creatureItem.card.name}!`);
}

// Sistema real de contadores +1/+1 y -1/-1 (antes se simulaban con "auras falsas" que ni
// siquiera eran cartas reales — sin id, sin type — y que además terminaban empujadas al
// cementerio cuando la criatura moría, como si fueran una carta de verdad).
// Viven directo acá, en el item de combate: cuando la criatura muere, el item se saca del
// array y los contadores desaparecen solos con él — no van a ningún lado, como en MTG real.
export function addCounters(item, type, amount) {
  if (!item.counters) item.counters = { plusOne: 0, minusOne: 0 };
  item.counters[type] = (item.counters[type] || 0) + amount;

  // Regla de estado: un contador +1/+1 y uno -1/-1 en la misma criatura se cancelan de a
  // pares (no pueden convivir).
  const cancel = Math.min(item.counters.plusOne, item.counters.minusOne);
  if (cancel > 0) {
    item.counters.plusOne -= cancel;
    item.counters.minusOne -= cancel;
  }
}

export function getCounterStats(itemObj) {
  const c = itemObj.counters;
  if (!c) return 0;
  return (c.plusOne || 0) - (c.minusOne || 0);
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
  if (state.pendingActivatedAbilityChoice) { logMsg("Elegí primero qué habilidad querés activar."); return; }
  if (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) {
    logMsg("Terminá primero el descarte pendiente.");
    return;
  }

  if (state.pendingResolvedEffectTargetChoice) {
    finishPendingResolvedEffectTarget({ type: 'creature', isLocal, index, item });
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
      logMsg("Elegí una criatura TUYA para que pelee.");
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
    const matchesFilter = !rules.creatureFilter || item.card.type.includes(rules.creatureFilter);
    if (!allowed || !matchesFilter) {
      logMsg("Ese no es un objetivo válido para esa habilidad.");
      return;
    }
    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(`🛡️ ${item.card.name} tiene Intocable. No podés elegirla.`);
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
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
    const matchesFilter = !rules.creatureFilter || item.card.type.includes(rules.creatureFilter);
    if (!allowed || !matchesFilter) {
      logMsg("Ese no es un objetivo válido para este target del hechizo.");
      return;
    }
    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(`🛡️ ${item.card.name} tiene Intocable. No podés elegirla.`);
      return;
    }
    advanceMultiTargetChoice({ type: 'creature', isLocal, index, item });
    return;
  }

  if (state.pendingSacrificeChoice) {
    tryResolveSacrificeChoice(item, isLocal);
    return;
  }

  if (state.pendingTargetCard) {
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
      logMsg("¡Ojo! Un counterspell debe apuntar a la pila, no a una criatura.");
      return;
    }

    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(`🛡️ ¡Epa! ${item.card.name} tiene Intocable. No podés seleccionarlo como objetivo.`);
      return;
    }

    // Protección de [color]: a diferencia de Intocable, esto aplica SIEMPRE (hasta a tu
    // propia criatura, si por algo le apuntás con algo de ese color — así es en MTG real,
    // no depende de quién controle el hechizo). Cubre de yapa "no puede ser Encantada ni
    // Equipada" de esa cosa, porque adjuntar una Aura o un Equipo también pasa por acá.
    const sourceColors = state.pendingTargetCard.colors || [];
    const protectedColor = getProtectionMatch(item, sourceColors);
    if (protectedColor) {
      logMsg(`🛡️ ¡Epa! ${item.card.name} tiene Protección de ${COLOR_LABELS[protectedColor] || protectedColor}. ${state.pendingTargetCard.name} no le puede hacer nada.`);
      return;
    }
    
    const rules = getTargetRules(state.pendingTargetCard);
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
    const matchesFilter = !rules.creatureFilter || item.card.type.includes(rules.creatureFilter);

    if (!allowed || !matchesFilter) {
      logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
      return;
    }

    // No dejar apilar una habilidad redundante: si ya tiene Vuela, no le vuelvas a poner
    // algo que otorgue Vuela (aunque venga de una fuente distinta).
    const grantedKeywords = getKeywordsGrantedByPendingSpell(state.pendingTargetCard);
    const redundant = grantedKeywords.find(k => hasKeyword(item, k));
    if (redundant) {
      logMsg(`${item.card.name} ya tiene esa habilidad — no hace falta repetirla.`);
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
      logMsg(`🔶 ¡${item.card.name} tiene Ward ${wardCost}! Pagá ${wardCost} de maná extra o tu hechizo se pierde sin efecto.`);
      render();
      return;
    }

    // Pelear (fight) desde un hechizo: ya elegiste a la criatura rival (arriba se validó
    // que sea un objetivo legal) — ahora pausamos y pedimos CUÁL de las tuyas pelea, en vez
    // de auto-elegir la más fuerte como antes. Las habilidades propias de una criatura (ej.
    // Alberto Samid) no pasan por acá: para esas, "quién pelea" ya está claro de antemano.
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type === 'fight' && !state.pendingTargetSource) {
      state.pendingFightChoice = { opponentItem: item, opponentIndex: index, opponentIsLocal: isLocal };
      logMsg(`Elegiste a ${item.card.name} como rival. Ahora elegí CUÁL de tus criaturas pelea contra ella.`);
      render();
      return;
    }

    executeSpellOnTarget({ type: 'creature', isLocal, index, item });
    return;
  }

 // Declarar atacantes solo en sub-paso de atacantes
  if (state.phase === 'combat_attackers' && isLocal && state.activePlayer === 'local' && state.priorityPlayer === 'local') {
    if ((state.localAttackersDeclaredThisTurn || 0) > 0) {
      logMsg('⚔️ Los atacantes ya fueron declarados para este combate.');
      return;
    }
    if (hasKeyword(item, 'defender')) {
      logMsg(`🛡️ ${item.card.name} es Defensor y no puede atacar.`);
      return;
    }
    if (item.summoningSickness) {
      logMsg(`Tu ${item.card.name} está mareado y no puede atacar este turno.`);
      return;
    }
    const attackLock = (state.activeEffects || []).find(effect =>
      effect.effectType === 'cant_attack_next_turn' &&
      effect.targetPlayer === 'local' &&
      effect.appliesThisCombat === true &&
      effect.targetObjectId && effect.targetObjectId === item._effectObjectId
    );
    if (attackLock) {
      logMsg(`🚫 ${item.card.name} no puede atacar en este combate por ${attackLock.sourceName || 'un efecto'}.`);
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
      logMsg(`Elegí un Planeswalker rival para redirigir el ataque de ${item.card.name}, o clickealo de nuevo para sacarlo del combate.`);
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
      logMsg('🛡️ Los bloqueadores ya fueron declarados para este combate.');
      return;
    }
    if (isLocal) {
      if (item.tapped) {
        logMsg("No podés bloquear con una criatura girada.");
        return;
      }
      state.pendingBlockerIndex = index;
      logMsg(`Seleccionaste ${item.card.name}. Ahora hacé clic en el atacante de ${getRivalName()} que querés bloquear.`);
      render();
    } else {
      if (state.pendingBlockerIndex !== null && item.isAttacking) {
        const localUnit = state.localCombat[state.pendingBlockerIndex];
        if (!canBlock(item, localUnit)) {
           logMsg(`❌ Bloqueo ilegal: ${item.card.name} tiene Volar. Tu ${localUnit.card.name} necesita Volar o Alcance.`);
           return;
        }

        state.localCombat[state.pendingBlockerIndex].blockingIndex = index;
        logMsg(`Asignaste a ${state.localCombat[state.pendingBlockerIndex].card.name} a bloquear a ${item.card.name}.`);
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
  const intrinsicSorceryOnly = ability.crewCost !== undefined || ability.effect?.type === 'crew_vehicle' || ability.effect?.type === 'attach_equipment';

  // Equipar/Tripular son acciones que este motor modela como sorcery-speed por naturaleza.
  // Marcar una de ellas como `timing:"instant"` es un contrato inválido, no una forma de
  // esquivar esa regla especial.
  if (intrinsicSorceryOnly && timing === 'instant') return false;

  if (timing === 'instant') return true;
  if (!ownMain) return false;
  if (timing === 'sorcery') return spellStack.length === 0;
  return true; // legacy: comportamiento pre-Punto-12, sin cambio silencioso.
}

function activatedTimingFailureMessage(ability) {
  const timing = getActivatedAbilityTiming(ability);
  if (timing === 'invalid') return `⚠️ Timing de habilidad desconocido: "${ability?.timing}".`;
  if ((ability?.crewCost !== undefined || ability?.effect?.type === 'crew_vehicle' || ability?.effect?.type === 'attach_equipment') && timing === 'instant') {
    return '⚠️ Equipar/Tripular no pueden declararse con timing instantáneo.';
  }
  if (state.priorityPlayer !== 'local') return 'No tenés prioridad para activar esa habilidad.';
  const isEquip = ability?.effect?.type === 'attach_equipment';
  if (isEquip && spellStack.length > 0) {
    return 'Equipar usa timing de conjuro: primero tiene que quedar vacía la pila.';
  }
  if (isEquip && !(state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2'))) {
    return 'Equipar sólo se puede activar en una de tus fases principales. Si el Equipo tiene Destello, Destello sólo cambia cuándo podés LANZAR la carta; no vuelve instantánea la habilidad de Equipar.';
  }
  if (timing === 'sorcery' && spellStack.length > 0) return 'Esa habilidad necesita timing de conjuro: la pila debe estar vacía.';
  return 'Esa habilidad sólo se puede activar en una ventana válida para su timing.';
}

function buildCreatureActivatedAbilityOptions(creatureItem, isLocal, creatureIndex) {
  const options = [];

  getActivatedAbilities(creatureItem.card).forEach((ability, abilityIndex) => {
    // Un Vehículo ya tripulado conserva en su carta la habilidad de Tripular, pero esa
    // habilidad sólo existe mientras el Vehículo está en Support/Tierras. Si además tiene
    // otra habilidad propia, ESA sí debe seguir disponible en Combat.
    if (ability.crewCost !== undefined) return;
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
  return getActivatedAbilities(item.card).map((ability, abilityIndex) => ({
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

  // Revalidación al confirmar: el modal puede haber estado abierto mientras cambió el estado
  // por sync. Nunca pagamos/giramos nada si el timing ya no es legal.
  if (!canActivateActivatedAbilityNow(ability, source.isLocal)) {
    logMsg(activatedTimingFailureMessage(ability));
    render();
    return true;
  }

  if (state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew !== null) {
    logMsg("Terminá el casteo o pago anterior antes de activar otra cosa.");
    return true;
  }

  // Tripular sigue siendo una acción especial (se paga girando criaturas, no maná ni pila),
  // pero ahora puede convivir en el MISMO permanent con otras habilidades del array.
  if (ability.crewCost !== undefined) {
    if (state.phase !== 'main1' && state.phase !== 'main2') return true;
    startCrewing(source.item, source.isLocal, ability);
    return true;
  }

  if (ability.effect?.type === 'attach_equipment' && state.localCombat.length === 0) {
    logMsg(`⚠️ No tenés ninguna criatura para equipar con ${source.item.card.name}.`);
    return true;
  }

  const costStr = ability.cost || "";
  const requiresTap = costStr.includes('{T}');
  const tapTarget = source.tapTarget || source.item;

  if (requiresTap && tapTarget.tapped) {
    logMsg(`⏳ ${tapTarget.card.name} ya está girado.`);
    return true;
  }

  // {T} en una criatura está sujeto al mareo; {T} en un Artefacto/Tierra no. Esto conserva
  // exactamente la diferencia histórica entre habilidades propias de criatura y soporte.
  const combatZone = source.isLocal ? state.localCombat : state.rivalCombat;
  if (requiresTap && combatZone.includes(tapTarget) && tapTarget.summoningSickness) {
    logMsg(`${tapTarget.card.name} tiene mareo de invocación: todavía no puede usar la habilidad de ${source.sourceName || displayName}.`);
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
    state.pendingTargetCard = { ...card, effect: ability.effect, requiresTarget: true };
    state.pendingTargetSource = source;
    state.pendingCost = null;
    logMsg(`🎯 Elegí un objetivo para la habilidad de ${card.name} antes de pagar.`);
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

  const totalMana = manaCost.W + manaCost.U + manaCost.B + manaCost.R + manaCost.G + manaCost.generic;
  if (totalMana === 0) {
    checkPaymentComplete();
  } else {
    const prefix = source.chosenTarget ? 'Objetivo fijado. ' : '';
    logMsg(`${prefix}Activando la habilidad de ${source.activationDisplayName || source.sourceName || source.item.card.name}. Elegí tierras para pagar el costo.`);
    render();
  }
  return true;
}

function presentActivatedAbilityChoice(displayName, options) {
  if (!options || options.length === 0) return false;
  if (state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew !== null) {
    logMsg("Terminá el casteo o pago anterior antes de activar otra cosa.");
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
    logMsg(`${creatureItem.card.name} ya está tripulado — no hay una habilidad activada disponible desde Combate.`);
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
    const matchesFilter = !rules.permanentFilter || item.card.type.includes(rules.permanentFilter);
    if (!allowed || !matchesFilter) {
      logMsg("Ese no es un objetivo válido para este target del hechizo.");
      return;
    }
    advanceMultiTargetChoice({ type: 'permanent', isLocal, index, item });
    return;
  }

  if (!state.pendingTargetCard) return;

  if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
    logMsg("¡Ojo! Un counterspell debe apuntar a la pila, no a un permanente.");
    return;
  }

  const rules = getTargetRules(state.pendingTargetCard);
  const allowed = isLocal ? rules.allowLocalPermanent : rules.allowRivalPermanent;
  const matchesFilter = !rules.permanentFilter || item.card.type.includes(rules.permanentFilter);

  if (!allowed || !matchesFilter) {
    logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
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
      logMsg("Este objetivo del hechizo necesita una criatura, no un jugador.");
      return;
    }
    if (spec.effect?.target === 'opponent_player' && isLocal) {
      logMsg("Ese efecto debe apuntar al jugador rival.");
      return;
    }
    advanceMultiTargetChoice({ type: 'player', isLocal });
    return;
  }

  if (state.pendingTargetCard) {
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
      logMsg("¡Ojo! Un counterspell debe apuntar a la pila, no a un jugador.");
      return;
    }
    
    const rules = getTargetRules(state.pendingTargetCard);
    if (!rules.allowPlayer) {
      logMsg(`${state.pendingTargetCard.name} necesita una criatura como objetivo, no un jugador.`);
      return;
    }
    if (state.pendingTargetCard.effect?.target === 'opponent_player' && isLocal) {
      logMsg(`${state.pendingTargetCard.name} debe apuntar al jugador rival.`);
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
    logMsg("Cancelaste la Pelea a mitad de camino.");
    state.pendingFightChoice = null;
    // El hechizo sigue esperando su primer target — volvés a poder elegir a quién pelear.
    render();
    return;
  }
  if (state.pendingMultiTargetChoice) {
    logMsg("Cancelaste la selección de objetivos — el hechizo vuelve atrás y el pago se revierte.");
    state.pendingMultiTargetChoice = null;
    state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
    restorePaymentManaSources();
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
    logMsg("⚠️ Terminá primero la selección de componentes del costo que está en curso.");
    return;
  }
  if (state.pendingAbilitySource && state.pendingAbilitySource.sacrificePaid) {
    logMsg("⚠️ Ya pagaste el sacrificio de esta habilidad — no se puede cancelar. Tenés que terminar de elegir el objetivo.");
    return;
  }
  if (state.pendingSpellIndex !== null && state.pendingSpellCostsIrreversible) {
    logMsg("⚠️ Ya pagaste un componente irreversible del costo de este hechizo — no se puede cancelar. Tenés que terminar de castearlo.");
    return;
  }

  state.tappedLandsThisSpell.forEach(land => land.tapped = false);
  restorePaymentManaSources();

  // Si esto era un Flashback/Escape a mitad de pago (o esperando target), la carta está
  // "prestada" en la mano — hay que devolverla a su cementerio, no dejarla ahí pegada como
  // si fuera una carta de mano real y gratis.
  if (state.pendingCastFrom && state.pendingSpellIndex !== null) {
    const returningCard = state.localHand.splice(state.pendingSpellIndex, 1)[0];
    if (returningCard) {
      state.localGraveyard.push(returningCard);
      logMsg(`${returningCard.name} vuelve a tu cementerio.`);
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
  logMsg("Cancelaste la acción. Se revirtió el pago de maná (tierras/fuentes enderezadas y fuentes sacrificadas restauradas).");
  render();
}

export function canPlayCard(card) {
  if (state.gameOver || state.pendingCastTransaction || state.pendingAlternativeCostChoice || state.pendingPrivateZoneChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingActivatedAbilityChoice || state.pendingCrew !== null || state.pendingWardChoice !== null || state.pendingCounterUnlessPay !== null || state.pendingFightChoice !== null || state.pendingXChoice !== null || state.pendingModeChoice !== null || state.pendingLoyaltyTargetChoice !== null || state.pendingMultiTargetChoice !== null || state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingHandFilterChoice || state.pendingDiscardChoice || state.pendingSacrificeEffectChoice || state.pendingGraveyardChoice || state.pendingResolvedEffectTargetChoice || state.pendingCompositeCostPayment || (state.resolvingCardFilterEffects || 0) > 0 || (state.resolvingDiscardEffects || 0) > 0 || (state.resolvingSacrificeEffects || 0) > 0 || (state.resolvingGraveyardChoices || 0) > 0 || (state.resolvingResolvedEffectTargetChoices || 0) > 0 || state.pendingEscapeExileChoice || state.pendingKickerChoice || state.damageModalOpen || state.pendingRampChoice || state.awaitingRivalDecision || state.respondingToDecision) return false;
  if (state.priorityPlayer !== 'local') return false; // Solo si poseés prioridad

  // Punto 8 legacy: preservamos esta prevalidación explícita para el schema histórico.
  if (card.additionalCost && card.additionalCost.type === 'discard') {
    const needed = Math.max(0, Math.floor(Number(card.additionalCost.amount || 1)));
    const available = state.localHand.filter(c => c !== card).length;
    if (available < needed) return false;
  }
  // Punto 14: los costos compuestos nuevos prevalidan TODOS sus componentes no-maná.
  if (card.additionalCost && !card.additionalCost.type && !canPayCastCompositeNonManaCosts(card, true, false, { excludeCard: card })) return false;
  
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
  ))));
}

function resetCastTransactionState() {
  state.pendingCastTransaction = null;
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
}

function abortCastTransaction(message = 'Cancelaste el casteo.') {
  const tx = state.pendingCastTransaction;
  if (!tx) return false;
  if (state.pendingSpellCostsIrreversible) {
    logMsg('⚠️ Los costos irreversibles ya fueron comprometidos; este lanzamiento ya no puede cancelarse.');
    return true;
  }
  state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
  restorePaymentManaSources();
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
  resetCastTransactionState();
  state.pendingCastFrom = null;
  logMsg(message);
  recordTelemetryEvent('cast_transaction_cancelled', { card:tx.card?.name || null, stage:tx.stage || null });
  render();
  return true;
}

function selectedCastBaseManaString(tx) {
  if (tx.castFrom && tx.baseOverride) return tx.baseOverride;
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
    handIndex: index,
    originalCard: card,
    card,
    castFrom: options.castFrom || null,
    baseOverride: options.baseOverride || null,
    useAlternative: options.castFrom ? false : (card.alternativeCost ? null : false),
    modeChosen: !(card.modal && Array.isArray(card.modes) && card.modes.length),
    xValue: null,
    kicked: card.kicker ? null : false,
    targetObj: undefined,
    preparedComposite: null,
    escapeExiles: [],
    // 601.2a conceptual: objeto propuesto interno. Todavía no se publica en spellStack.
    proposedStackItem: { card, isLocal:true, targetObj:null, type:buildCastStackType(card), xValue:null, castFrom:options.castFrom || null, kicked:false },
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
  if (!tx.castFrom && card.alternativeCost && tx.useAlternative === null) {
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
    logMsg(`⚠️ No tenés los recursos no-maná necesarios para el costo alternativo de ${tx.card.name}.`);
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
    logMsg(`🎯 ${card.name}: declarando objetivo 1 de ${card.targets.length} antes de pagar.`);
    render();
    return;
  }

  if (castNeedsTarget(card)) {
    state.pendingTargetCard = card;
    state.pendingTargetSource = null;
    let targetHint = `Elegí el objetivo de ${card.name} antes de pagar.`;
    if (card.adjunta) targetHint = `Elegí qué criatura va a encantar ${card.name} antes de pagar.`;
    else if (card.effect?.type?.startsWith('counter')) targetHint = `Elegí en la Pila qué va a contrarrestar ${card.name} antes de pagar.`;
    logMsg(`🎯 ${targetHint}`);
    render();
    return;
  }

  void completeCastTargetDeclaration(null);
}

function detectWardForDeclaredTarget(card, targetObj) {
  if (!targetObj || targetObj.type !== 'creature' || targetObj.isLocal) return null;
  const item = targetObj.item;
  const wardKw = (getEffectiveKeywords(item) || []).find(k => k.startsWith('ward_'));
  if (!wardKw) return null;
  const wardCost = parseInt(wardKw.split('_')[1], 10);
  return Number.isFinite(wardCost) && wardCost > 0 ? { wardCost, targetObj } : null;
}

async function prepareCastTransactionCosts(tx) {
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
  state.pendingCompositeCostPayment = false;
  tx.preparedComposite = preparedComposite;
  tx.escapeExiles = escapeExiles;
  state.pendingPreparedCastCosts = { preparedComposite, escapeExiles };
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

  // 601.2e/f — ya no hay decisiones de target abiertas. Ahora se determina y BLOQUEA el
  // costo completo y se eligen los objetos concretos de costos no-maná, todavía sin moverlos.
  const prepared = await prepareCastTransactionCosts(tx);
  if (!prepared) {
    logMsg(`⚠️ No se pudo preparar el costo completo de ${tx.card.name}. El lanzamiento vuelve atrás sin pagar nada.`);
    abortCastTransaction();
    return false;
  }

  const manaString = getCastingManaCostString(tx.card, {
    useAlternative:!!tx.useAlternative,
    kicked:!!tx.kicked,
    baseOverride:tx.baseOverride
  });
  const cost = parseManaCost(manaString);
  if (manaString?.includes('{X}')) cost.generic += Math.max(0, Number(tx.xValue) || 0);
  tx.lockedManaCost = { ...cost };
  tx.stage = 'payment';
  tx.proposedStackItem = {
    card:tx.card,
    isLocal:true,
    targetObj,
    type:buildCastStackType(tx.card),
    xValue:tx.xValue,
    castFrom:tx.castFrom,
    kicked:tx.kicked
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
    manaCost:manaString || '{0}', xValue:tx.xValue || 0, kicked:!!tx.kicked, alternative:!!tx.useAlternative
  });
  logMsg(`💳 ${tx.card.name}: objetivos fijados y costo bloqueado. Ahora activá fuentes de maná.`);
  checkPaymentComplete();
  render();
  return true;
}

async function commitCastTransactionAfterMana() {
  const tx = state.pendingCastTransaction;
  if (!tx || tx.stage !== 'payment') return false;
  const prepared = tx.preparedComposite;
  const useAlternative = !!tx.useAlternative;

  // 601.2h — commit atómico de costos no-maná preparados. No hubo ninguna mutación antes
  // de que el maná llegara a cero; si una referencia quedó inválida, aborta/rollback.
  if (!commitCastCompositeNonManaCosts(tx.card, true, prepared, useAlternative)) {
    logMsg(`⚠️ El costo de ${tx.card.name} dejó de ser pagable antes del commit. Se revierte el maná.`);
    abortCastTransaction();
    return false;
  }
  if (tx.escapeExiles?.length) {
    if (tx.escapeExiles.some(c => !state.localGraveyard.includes(c) || c === tx.card)) {
      logMsg(`⚠️ El costo de Escape de ${tx.card.name} dejó de ser válido.`);
      // A esta altura el costo compuesto podría haberse comprometido. No seguimos silenciosamente.
      state.pendingSpellCostsIrreversible = true;
      resetCastTransactionState();
      render();
      return false;
    }
    tx.escapeExiles.forEach(c => {
      const idx = state.localGraveyard.indexOf(c);
      if (idx >= 0) state.localGraveyard.splice(idx, 1);
    });
    state.localExile.push(...tx.escapeExiles);
    state.pendingSpellCostsIrreversible = true;
  }

  const cardIndex = state.localHand.indexOf(tx.card);
  if (cardIndex === -1) {
    logMsg(`⚠️ ${tx.card.name} ya no está en la zona de lanzamiento. No se pudo completar el casteo.`);
    resetCastTransactionState();
    render();
    return false;
  }
  state.localHand.splice(cardIndex, 1);
  const stackItem = { ...tx.proposedStackItem, card:tx.card };
  addToStack(stackItem);
  state.consecutivePasses = 0;
  const ward = tx.ward;
  const txId = tx.id;
  const cardName = tx.card.name;
  const castCard = tx.card;
  resetCastTransactionState();
  state.pendingCastFrom = null;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  logMsg(`⏳ ${cardName} completó 601.2 y entró a la pila.`);
  recordTelemetryEvent('cast_transaction_committed', { transactionId:txId, card:cardName, stackId:stackItem.id || null });
  render();
  await triggerSpellCast(true, castCard, stackItem);

  // Ward ya NO interrumpe la declaración/pago. Se dispara después de que el hechizo está
  // realmente casteado. Sigue siendo un prompt simplificado (la habilidad Ward aún no es
  // un objeto separado de Stack), pero su timing ya no viola 601.2.
  if (ward) {
    state.pendingWardChoice = { ...ward, stackId:stackItem.id, postCast:true };
    logMsg(`🔶 ${ward.targetObj.item.card.name} disparó Ward ${ward.wardCost}. El hechizo YA está en la pila: pagá o será contrarrestado.`);
    render();
  } else {
    checkRivalCounterOrResponse();
  }
  return true;
}

export function playCard(index) {
  const card = state.localHand[index];
  
  if (!canPlayCard(card)) {
    logMsg(`⚠️ No podés jugar ${card.name} en este momento.`);
    return;
  }

  if (card.type.includes('Tierra')) {
    if (state.localLandPlayedThisTurn) { logMsg("Ya bajaste una tierra en este turno."); return; }
    if (state.activePlayer !== 'local' || (state.phase !== 'main1' && state.phase !== 'main2')) {
      logMsg("Solo podés bajar tierras en tus Fases Principales.");
      return;
    }
    const entersTapped = !!card.entersTapped;
    const landItem = { card, tapped: entersTapped };
    state.localLands.push(landItem); state.localHand.splice(index, 1); state.localLandPlayedThisTurn = true;
    logMsg(entersTapped ? `Bajaste la tierra: ${card.name} (entra girada).` : `Bajaste la tierra: ${card.name}.`);
    // PUNTO 2: jugar una Tierra es una entrada real al campo y dispara Landfall. No esperamos
    // acá para conservar el contrato síncrono histórico de playCard(); triggerLandEtb se ocupa
    // de serializar internamente cualquier decisión interactiva y los flags bloquean la UI.
    triggerLandEtb(true, card, landItem).catch(err => {
      console.error('Error resolviendo Landfall al jugar una Tierra:', err);
      logMsg(`⚠️ Ocurrió un error resolviendo Landfall por ${card.name}.`);
      render();
    });
    resetPriorityClock('land_played');
    render(); return;
  }

  if (card.effect && card.effect.type && card.effect.type.startsWith('counter')) {
    if (!spellStack || spellStack.length === 0) {
      logMsg(`⚠️ No hay ningún hechizo en la pila para contrarrestar.`);
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
        logMsg(`Cancelaste ${card.name} antes de pagar: no había contadores proliferables visibles.`);
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

  if (state.gameOver || state.priorityPlayer !== 'local') { logMsg("No tenés prioridad ahora mismo."); return; }
  if (state.pendingCastTransaction || state.pendingAlternativeCostChoice || state.pendingPrivateZoneChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingFightChoice || state.pendingXChoice || state.pendingModeChoice || state.pendingLoyaltyTargetChoice || state.pendingMultiTargetChoice || state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0 || state.pendingEscapeExileChoice || state.pendingKickerChoice || state.pendingRampChoice) {
    logMsg(`Terminá lo que tenés pendiente antes de usar ${abilityLabel}.`);
    return;
  }

  // Punto 14: Flashback/Escape también pagan cualquier costo adicional compuesto. Como
  // la carta fuente todavía está en el cementerio, no hace falta excluirla de la mano.
  if (!canPayCastCompositeNonManaCosts(card, true, false)) {
    logMsg(`⚠️ No tenés recursos suficientes para pagar el costo adicional de ${card.name}.`);
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
      logMsg(`⚠️ Necesitás suficientes cartas distintas para Escape (${exileCount}) y otros costos de cementerio (${extraCostExiles}) de ${card.name}.`);
      return;
    }
  }

  const isInstant = card.type.includes('Instantáneo') || (card.keywords && card.keywords.includes('flash'));
  if (spellStack.length > 0 && !isInstant) {
    logMsg("Solo instantáneos (o con Flash) se pueden lanzar con la pila ocupada.");
    return;
  }
  if (!isInstant && !(state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2'))) {
    logMsg(`Solo podés usar ${abilityLabel} en esta carta durante tu Fase Principal.`);
    return;
  }

  const grave = state.localGraveyard;
  const idx = grave.indexOf(card);
  if (idx === -1) return;
  grave.splice(idx, 1);

  const newIndex = state.localHand.length;
  state.localHand.push(card);
  state.pendingCastFrom = source;
  logMsg(`🔄 ${card.name}: anunciando casteo con ${abilityLabel} (${ability.cost}).`);
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
    logMsg(`💉 ${card.name}: costo adicional pagado con ${ac.amount} de vida.`);
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
      if (result.discardedNames.length > 0) logMsg(`🗑️ ${card.name}: costo adicional pagado descartando ${result.discardedNames.join(', ')}.`);
      return result;
    });
  }
  if (!compositeCostHasNonMana(ac)) return null;
  return payCastCompositeNonManaCosts(card, isLocal, false);
}

// Aplica hasta `amount` de maná (de un color fijo, o eligiendo automáticamente entre
// varias opciones si es dual) al pago pendiente — el sobrante de un color siempre puede
// cubrir el costo genérico, como en MTG real. La comparten tierras y artefactos que
// producen maná, para no duplicar esta cuenta en dos lugares.
function applyManaToPendingCost(colorOrOptions, amount) {
  let remaining = amount;
  let used = false;

  if (Array.isArray(colorOrOptions)) {
    const bestColor = colorOrOptions.find(c => (state.pendingCost[c] || 0) > 0) || colorOrOptions[0];
    const takeFromColor = Math.min(remaining, state.pendingCost[bestColor] || 0);
    if (takeFromColor > 0) { state.pendingCost[bestColor] -= takeFromColor; remaining -= takeFromColor; used = true; }
  } else if (['W', 'U', 'B', 'R', 'G'].includes(colorOrOptions)) {
    const takeFromColor = Math.min(remaining, state.pendingCost[colorOrOptions] || 0);
    if (takeFromColor > 0) { state.pendingCost[colorOrOptions] -= takeFromColor; remaining -= takeFromColor; used = true; }
  }
  // maná genérico puro (ej. Billetera Vieja "{T}: Agregá {1}"), o el sobrante de arriba
  if (remaining > 0 && state.pendingCost.generic > 0) {
    const takeGeneric = Math.min(remaining, state.pendingCost.generic);
    state.pendingCost.generic -= takeGeneric;
    remaining -= takeGeneric;
    used = true;
  }
  return used;
}

function manaDescriptorCanPayPendingCost(colorOrOptions, amount = 1) {
  const cost = state.pendingCost;
  if (!cost || amount <= 0 || !colorOrOptions) return false;
  const genericNeeded = (cost.generic || 0) > 0;

  if (Array.isArray(colorOrOptions)) {
    if (colorOrOptions.some(color => (cost[color] || 0) > 0)) return true;
    return genericNeeded && colorOrOptions.length > 0;
  }
  if (['W', 'U', 'B', 'R', 'G'].includes(colorOrOptions)) {
    return (cost[colorOrOptions] || 0) > 0 || genericNeeded;
  }
  // Fuente incolora/genérica: sólo sirve para el componente genérico.
  return genericNeeded;
}

// Fuente única para lógica + UI: si esto devuelve true, el click real también puede gastar
// al menos 1 maná del costo pendiente. Evita el caso observado donde Fajo funcionaba al
// clickearlo pero no recibía el halo amarillo de "fuente utilizable".
export function canManaSourcePayPendingCost(card) {
  if (!card) return false;
  const isLand = typeof card.type === 'string' && card.type.toLowerCase().includes('tierra');
  const colorOrOptions = card.producesOptions || card.produces || (isLand ? getLandColor(card) : null);
  return manaDescriptorCanPayPendingCost(colorOrOptions, card.manaAmount || 1);
}

function rememberManaSourceRollback(item, isLocal) {
  if (!item?.card || !item.card.sacrificeOnTap) return;
  const zones = isLocal
    ? [['combat', state.localCombat], ['support', state.localSupport], ['lands', state.localLands]]
    : [['combat', state.rivalCombat], ['support', state.rivalSupport], ['lands', state.rivalLands]];
  for (const [zoneName, zone] of zones) {
    const index = zone.indexOf(item);
    if (index === -1) continue;
    state.paymentManaSourceRollbacks.push({ item, card: item.card, isLocal, zoneName, index });
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
    entry.item.tapped = false;
    zone.splice(Math.max(0, Math.min(entry.index, zone.length)), 0, entry.item);
  });
  state.paymentManaSourceRollbacks = [];
}

// Punto 13: una fuente de maná que ADEMÁS está pagando {T} para su propia habilidad
// utility no puede usarse dos veces en el mismo costo. Ej.: una Tierra con "{T}, {2}: ..."
// debe reservar su propio giro para {T}; las otras tierras pagan el {2}. La misma regla
// sirve defensivamente para mana rocks con habilidad propia.
//
// Fuentes de maná de mesa (Tierras o mana rocks / Treasures). Sólo producen maná cuando
// existe un pago pendiente: este motor no mantiene una mana pool flotante. Si además
// `sacrificeOnTap` es true (estilo Treasure), se sacrifica apenas rinde el maná.
function tapSupportManaSource(item, isLocal) {
  if (state.pendingAbilitySource?.requiresTap) {
    const reservedTapTarget = state.pendingAbilitySource.tapTarget || state.pendingAbilitySource.item;
    if (reservedTapTarget === item) {
      logMsg(`${item.card.name} está reservada para pagar el {T} de su propia habilidad; usá otra fuente para el maná.`);
      return;
    }
  }
  if (item.tapped) { logMsg(`${item.card.name} ya está girado.`); return; }
  const card = item.card;

  // 23.7.2: un mismo permanente no puede ser sacrificado dos veces para dos componentes
  // distintos del mismo costo. Si Chatarrero pide {1} + sacrificar un artefacto y este
  // Fajo es el ÚNICO artefacto elegible, consumirlo como mana source dejaría el costo
  // imposible. Lo frenamos antes de mutar nada; con otro artefacto presente sí es legal.
  const pendingSacrifice = state.pendingAbilitySource?.ability?.sacrifice;
  if (card.sacrificeOnTap && pendingSacrifice && pendingSacrifice !== 'self') {
    const ownPermanents = [...state.localCombat, ...state.localSupport];
    const remainingCandidates = ownPermanents.filter(candidate => candidate !== item && isSacrificeCandidate(candidate, pendingSacrifice));
    if (isSacrificeCandidate(item, pendingSacrifice) && remainingCandidates.length === 0) {
      logMsg(`⚠️ ${card.name} es tu único ${pendingSacrifice === 'artifact' ? 'artefacto' : 'permanente'} elegible para el otro componente del costo. No podés sacrificarlo para producir maná y sacrificarlo de nuevo.`);
      return;
    }
  }
  const amount = card.manaAmount || 1;
  const colorOrOptions = card.producesOptions || card.produces;
  const used = applyManaToPendingCost(colorOrOptions, amount);

  if (used) {
    item.tapped = true;
    state.tappedLandsThisSpell.push(item); // mismo array: si se cancela el pago, se des-gira
    if (card.sacrificeOnTap) {
      rememberManaSourceRollback(item, isLocal);
      performSacrifice(item, isLocal);
    }
    checkPaymentComplete();
  } else {
    logMsg(`${card.name} no te sirve para pagar esto.`);
  }
  render();
}

export function startCrewing(item, isLocal, ability = getActivatedAbilities(item.card).find(ab => ab.crewCost !== undefined)) {
  const required = ability?.crewCost;
  if (required === undefined) return;
  state.pendingCrew = { item, isLocal, required, selected: [], powerSoFar: 0 };
  logMsg(`Elegí criaturas para tripular a ${item.card.name} (necesitás ${required} de poder total). Podés cancelar si te arrepentís.`);
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
    logMsg("Solo tus propias criaturas pueden tripular.");
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
    logMsg(`${item.card.name} ya está girada — no puede sumar poder para tripular.`);
    return true;
  }

  pc.selected.push(item);
  item.tapped = true;
  pc.powerSoFar += getEffectivePower(item);
  logMsg(`${item.card.name} ayuda a tripular (${pc.powerSoFar}/${pc.required} de poder).`);
  if (pc.powerSoFar >= pc.required) {
    confirmCrew();
  } else {
    render();
  }
  return true;
}

export function confirmCrew() {
  const pc = state.pendingCrew;
  if (!pc) return;
  if (pc.powerSoFar < pc.required) {
    logMsg(`Todavía falta poder para tripular ${pc.item.card.name} (${pc.powerSoFar}/${pc.required}).`);
    return;
  }

  const card = pc.item.card;
  const supportZone = pc.isLocal ? state.localSupport : state.rivalSupport;
  const landsZone = pc.isLocal ? state.localLands : state.rivalLands;
  const combatZone = pc.isLocal ? state.localCombat : state.rivalCombat;

  let originZone = supportZone;
  let vIdx = supportZone.indexOf(pc.item);
  let fromLand = false;
  if (vIdx === -1) {
    vIdx = landsZone.indexOf(pc.item);
    originZone = landsZone;
    fromLand = true;
  }
  if (vIdx === -1) {
    logMsg(`⚠️ ${card.name} ya no está disponible.`);
    state.pendingCrew = null;
    render();
    return;
  }

  const vehicleItem = originZone.splice(vIdx, 1)[0];
  vehicleItem.card.power = card.baseStats.power;
  vehicleItem.card.toughness = card.baseStats.toughness;
  vehicleItem.isVehicle = true;
  vehicleItem.wasLand = fromLand;
  vehicleItem.summoningSickness = !!vehicleItem.enteredThisTurn;
  combatZone.push(vehicleItem);

  logMsg(`🚗 ¡${card.name} fue tripulado (${pc.powerSoFar} de poder) y aceleró al campo de batalla como un ${card.baseStats.power}/${card.baseStats.toughness}!`);
  state.pendingCrew = null;
  render();
}

export function cancelCrew() {
  const pc = state.pendingCrew;
  if (!pc) return;
  pc.selected.forEach(item => { item.tapped = false; });
  logMsg(`Cancelaste la tripulación de ${pc.item.card.name}.`);
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
    logMsg(`No tenés suficiente maná para pagar {${pc.amount}}. Tu hechizo se pierde.`);
    declineCounterTax();
    return;
  }
  logMsg(`💰 Pagaste {${pc.amount}}. "${pc.targetCardName}" sigue en la pila, sin cambios.`);
  // El counterspell (Impuesto País, etc.) ya cumplió su función — se va a destino igual
  // que cualquier otro hechizo resuelto (antes esto se perdía sin ir a ningún lado).
  sendCounterspellAway(pc);
  state.pendingCounterUnlessPay = null;
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  render();
}

// No pagar: el hechizo amenazado se contrarresta de verdad y se saca de la pila.
// ETAPA MOTOR 2: su destino depende de cómo fue lanzado (Flashback -> Exilio; normal/Escape -> Cementerio).
export function declineCounterTax() {
  const pc = state.pendingCounterUnlessPay;
  if (!pc) return;
  const targetIndex = spellStack.findIndex(s => s.id === pc.targetStackId);
  if (targetIndex !== -1) {
    const counteredItem = spellStack.splice(targetIndex, 1)[0];
    logMsg(`🚫 ¡No pagaste! "${counteredItem.card.name}" fue contrarrestado.`);
    // ETAPA MOTOR 2: Flashback contrarrestado se exilia; una habilidad contrarrestada no
    // manda su permanente fuente al cementerio. Misma regla que usa stackManager.js.
    moveCounteredStackItemToDestination(counteredItem, state);
  }
  sendCounterspellAway(pc);
  state.pendingCounterUnlessPay = null;
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  render();
}

// El counterspell que armó la amenaza también tiene que ir a destino (cementerio, o
// Exilio si vino por Flashback) — sea cual sea la decisión que se tomó.
function sendCounterspellAway(pc) {
  if (!pc.counterCard) return;
  if (pc.counterCastFrom === 'flashback') {
    (pc.counterIsLocal ? state.localExile : state.rivalExile).push(pc.counterCard);
  } else {
    (pc.counterIsLocal ? state.localGraveyard : state.rivalGraveyard).push(pc.counterCard);
  }
}

export function tapLocalLand(item) {
  if (state.gameOver) return;
  if (state.pendingActivatedAbilityChoice) { logMsg("Elegí primero qué habilidad querés activar."); return; }
  if (state.pendingSacrificeChoice) return; // Una tierra no es una opción válida de sacrificio hoy
  if (state.pendingCrew) { logMsg("Terminá de elegir criaturas para tripular, o cancelá, antes de otra cosa."); return; }
  if (state.pendingWardChoice) { logMsg("Resolvé el Ward pendiente (pagar o dejarlo perder) antes de otra cosa."); return; }
  if (state.pendingCounterUnlessPay) { logMsg("Resolvé el pago pendiente (pagar o dejarlo perder) antes de otra cosa."); return; }
  if (state.pendingFightChoice) { logMsg("Elegí primero cuál de tus criaturas pelea."); return; }
  if (state.pendingXChoice) { logMsg("Elegí primero el valor de X."); return; }
  if (state.pendingModeChoice) { logMsg("Elegí primero un modo para el hechizo."); return; }
  if (state.pendingLoyaltyTargetChoice) { logMsg("Elegí primero un objetivo para esa habilidad de Lealtad."); return; }
  if (state.pendingMultiTargetChoice) { logMsg("Elegí primero todos los objetivos del hechizo."); return; }
  if (state.pendingScrySurveilChoice) { logMsg("Terminá de elegir qué hacer con las cartas antes de otra cosa."); return; }
  if (state.pendingProliferateChoice) { logMsg("Terminá de elegir qué proliferar antes de otra cosa."); return; }
  if (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) { logMsg("Terminá primero el descarte pendiente."); return; }
  if (state.pendingResolvedEffectTargetChoice || (state.resolvingResolvedEffectTargetChoices || 0) > 0) { logMsg("Elegí primero el objetivo del ETB que está resolviéndose."); return; }
  if (state.pendingEscapeExileChoice) { logMsg("Terminá de elegir qué exiliar para el Escape antes de otra cosa."); return; }
  if (state.pendingKickerChoice) { logMsg("Terminá de decidir el Kicker antes de otra cosa."); return; }
  if (state.pendingRampChoice) { logMsg("Terminá de elegir el color de tierra antes de otra cosa."); return; }

  // PUNTO 13 — TIERRA DE MANÁ + UTILIDAD. Todas las Tierras con habilidades pasan por
  // el mismo dispatcher de permanentes. Ahí el contexto decide sin ambigüedad:
  //   - si estamos PAGANDO algo y la Tierra produce maná -> produce maná;
  //   - si no hay pago pendiente -> ofrece sus habilidades utility según timing.
  // No existe mana pool flotante en este motor, así que fuera de un pago "producir maná"
  // no es una segunda acción útil que necesite modal. Una Tierra simple sin habilidades
  // conserva exactamente el click histórico de fuente de maná durante pagos.
  if (getActivatedAbilities(item.card).length > 0) {
    const index = state.localLands.indexOf(item);
    handleSupportClick(item, true, index);
    return;
  }

  if (item.tapped) return;

  // 23.11.13: pendingAbilitySource puede existir mientras todavía estamos declarando el
  // target CR602. Eso NO significa que haya un costo abierto. Una tierra simple no puede
  // intentar aplicar maná hasta que pendingCost exista.
  if (!state.pendingCost) {
    if (state.pendingAbilitySource && state.pendingTargetCard) logMsg("Elegí primero el objetivo de la habilidad; todavía no hay ningún costo para pagar.");
    else logMsg("Seleccioná primero un hechizo o habilidad para pagar.");
    return;
  }
  
  // Soporte genérico para tierras que eventualmente produzcan más de 1 maná. Las duales
  // actuales (Constancia/Malvinas/Selva) usan producesOptions y rinden 1; el excedente de
  // cualquier fuente multi-maná futura puede cubrir costo genérico, como en MTG real.
  const amount = item.card.manaAmount || 1;
  const colorOrOptions = item.card.producesOptions || getLandColor(item.card);
  const used = applyManaToPendingCost(colorOrOptions, amount);

  if (used) { item.tapped = true; state.tappedLandsThisSpell.push(item); checkPaymentComplete(); } 
  else { logMsg(`Esa yerba no te sirve para este hechizo.`); }
  render();
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
    state.localHand[mc.index] = resolvedCard;
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
  logMsg(`Elegiste el modo "${chosenMode.text}" para ${mc.card.name}. Seleccioná tierras para pagar.`);
  checkPaymentComplete();
  render();
}

export function cancelModeChoice() {
  if (!state.pendingModeChoice) return;
  if (state.pendingCastTransaction) { abortCastTransaction(`Cancelaste ${state.pendingModeChoice.card.name}.`); return; }
  logMsg(`Cancelaste ${state.pendingModeChoice.card.name}.`);
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
  logMsg(`Elegiste X = ${xValue} para ${xc.card.name}. Seleccioná tierras para pagar (${xValue} de eso es solo por el X).`);
  checkPaymentComplete();
  render();
}

export function cancelXChoice() {
  if (!state.pendingXChoice) return;
  if (state.pendingCastTransaction) { abortCastTransaction(`Cancelaste ${state.pendingXChoice.card.name}.`); return; }
  logMsg(`Cancelaste ${state.pendingXChoice.card.name}.`);
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
    logMsg(`💪 ${card.name}: pagando también el Kicker (${card.kicker.cost}). Seleccioná tierras para pagar todo junto.`);
  } else {
    logMsg(`${card.name}: sin Kicker. Seleccioná tierras para pagar.`);
  }

  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];
  checkPaymentComplete();
  render();
}

export function cancelKickerChoice() {
  if (!state.pendingKickerChoice) return;
  if (state.pendingCastTransaction) { abortCastTransaction(`Cancelaste ${state.pendingKickerChoice.card.name}.`); return; }
  logMsg(`Cancelaste ${state.pendingKickerChoice.card.name}.`);
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
    logMsg(`⚠️ ${card.name} ya se está lanzando mediante ${state.pendingCastFrom}; no podés elegir otra vía alternativa.`);
    return;
  }
  if (!canPayCastCompositeNonManaCosts(card, true, true, { excludeCard: card })) {
    logMsg(`⚠️ No tenés los recursos no-maná necesarios para el costo alternativo de ${card.name}.`);
    return;
  }

  // Elegir la vía alternativa reemplaza SOLO el costo base. Kicker y additionalCost se
  // conservan. Cualquier tierra que hubieras girado probando la vía normal se devuelve.
  state.tappedLandsThisSpell.forEach(land => { land.tapped = false; });
  restorePaymentManaSources();
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

  logMsg(`🔀 Elegiste el costo alternativo de ${card.name}: ${describeCompositeCost(card.alternativeCost)}${state.pendingKicked ? ' + Kicker' : ''}.`);
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
    logMsg(`¡Maná pagado! Elegí el objetivo 1 de ${card.targets.length} para ${card.name}.`);
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

    logMsg(`¡Maná pagado! ${targetHint}`);
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

  logMsg(`⏳ ${card.name} entró a la pila.`);

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
      logMsg(`🌀 Escape de ${card.name}: elegí ${exileCount} carta(s) de tu cementerio para exiliar.`);
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
        logMsg(`🌀 ${card.name} (Escape): se exiliaron ${chosenCards.length} carta(s) de tu cementerio.`);
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
 
  if ((cost.W + cost.U + cost.B + cost.R + cost.G + cost.generic) === 0) {

    // SALVAGUARDA: esto no debería poder pasar nunca (canPlayCard ya lo previene),
    // pero si por algún motivo quedaran ambos pagos pendientes a la vez, mejor
    // frenar y avisar que resolver la carta equivocada.
    if (state.pendingSpellIndex !== null && state.pendingAbilitySource !== null) {
      logMsg("⚠️ Se detectó un conflicto de pagos pendientes. Cancelando ambos por seguridad.");
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
          logMsg(`⚠️ No se pudo pagar completamente el costo de ${card.name}; no se consumió ningún componente no-maná parcial.`);
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
      
      // Si el pago incluía {T}, giramos a quien corresponda (el permanente mismo,
      // o la criatura equipada si la habilidad viene de un Equipo).
      if (source.requiresTap) {
        tapTarget.tapped = true;
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
          logMsg(`¡Maná pagado! Elegí qué ${ability.sacrifice === 'creature' ? 'criatura' : 'artefacto'} sacrificar para pagar el costo de ${card.name}.`);
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
    logMsg(`⚠️ ${card.name}: faltó el objetivo declarado de la habilidad. Se cancela antes de entrar a la pila.`);
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

  logMsg(`Activaste la habilidad de ${card.name}.`);
  state.consecutivePasses = 0;
  state.pendingAbilitySource = null;
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingCost = null;
  state.tappedLandsThisSpell = [];
  state.paymentManaSourceRollbacks = [];

  // Igual que el pipeline 601: Ward se observa después de que el objeto targeteado ya está
  // realmente en la Stack. El prompt sigue siendo la simplificación histórica del motor,
  // pero target y costo de la habilidad ya respetan el orden de activación.
  const ward = detectWardForDeclaredTarget(card, targetObj);
  if (ward) {
    state.pendingWardChoice = { ...ward, stackId: stackItem.id, postCast: true };
    logMsg(`🔶 ${ward.targetObj.item.card.name} disparó Ward ${ward.wardCost}. La habilidad YA está en la pila: pagá o será contrarrestada.`);
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
    logMsg("Solo podés sacrificar tus propios permanentes.");
    return true;
  }

  // ETAPA MOTOR 1: no inferimos "artefacto = cualquier cosa que no sea criatura".
  // Se valida el tipo real, compartiendo exactamente la misma regla con el resaltado de UI.
  const matchesType = isSacrificeCandidate(item, pending.eligibleType);
  if (!matchesType) {
    logMsg(`Ese no es un ${pending.eligibleType === 'creature' ? 'criatura' : 'artefacto'} válido para sacrificar acá.`);
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
    logMsg(`Elegí el objetivo ${mtc.currentIndex + 1} de ${mtc.card.targets.length} para ${mtc.card.name}.`);
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

  logMsg(`⏳ ${card.name} entró a la pila (todos los objetivos elegidos).`);
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
export function tryAutoPayCounterTax(isLocal, amount) {
  const lands = isLocal ? state.localLands : state.rivalLands;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const sources = [...lands, ...support.filter(s => s.card.produces || s.card.producesOptions)].filter(s => !s.tapped);

  let need = amount;
  const toTap = [];
  for (const s of sources) {
    if (need <= 0) break;
    toTap.push(s);
    need -= (s.card.manaAmount || 1);
  }
  if (need > 0) return false;
  toTap.forEach(s => {
    s.tapped = true;
    // HOTFIX 1.1 — una fuente de un solo uso (Fajo de Dólares Blue / Treasure-like)
    // paga el impuesto Y se sacrifica, igual que cuando se usa en el pago normal.
    if (s.card.sacrificeOnTap) performSacrifice(s, isLocal);
  });
  return true;
}

export function payWard() {
  const wc = state.pendingWardChoice;
  if (!wc) return;

  const sources = [...state.localLands, ...state.localSupport.filter(s => s.card.produces || s.card.producesOptions)]
    .filter(s => !s.tapped);

  let need = wc.wardCost;
  const toTap = [];
  for (const s of sources) {
    if (need <= 0) break;
    toTap.push(s);
    need -= (s.card.manaAmount || 1);
  }

  if (need > 0) {
    logMsg(`No tenés suficiente maná disponible para pagar Ward ${wc.wardCost}. El hechizo se pierde sin efecto.`);
    declineWard();
    return;
  }

  toTap.forEach(s => {
    s.tapped = true;
    // HOTFIX 1.1 — Ward también consume correctamente las fuentes con sacrificeOnTap.
    if (s.card.sacrificeOnTap) performSacrifice(s, true);
  });
  logMsg(`💰 Pagaste Ward ${wc.wardCost}. El hechizo sigue su curso.`);
  const targetObj = wc.targetObj;
  state.pendingWardChoice = null;
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
  logMsg(`No pagaste Ward ${wc.wardCost} — el hechizo se pierde sin efecto.`);

  // 23.10: si Ward disparó DESPUÉS del casteo, contrarresta el objeto real que ya está en
  // la pila. Esto reemplaza la vieja simulación que sacaba la carta directamente de mano.
  if (wc.postCast && wc.stackId != null) {
    const idx = spellStack.findIndex(item => item.id === wc.stackId);
    if (idx !== -1) {
      const [countered] = spellStack.splice(idx, 1);
      moveCounteredStackItemToDestination(countered, state);
      logMsg(`🛡️ Ward contrarrestó ${countered.card.name}.`);
    }
    state.pendingWardChoice = null;
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
      moveCounteredStackItemToDestination({
        card,
        isLocal: true,
        type: 'spell',
        castFrom: state.pendingCastFrom
      }, state);
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
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingAbilitySource = null;
  render();
}

export function handleSupportClick(item, isLocal, index) {
  if (state.gameOver || !isLocal) return;
  if (state.pendingActivatedAbilityChoice) { logMsg("Elegí primero qué habilidad querés activar."); return; }

  if (state.pendingResolvedEffectTargetChoice || (state.resolvingResolvedEffectTargetChoices || 0) > 0) {
    logMsg("Elegí primero el objetivo del ETB que está resolviéndose.");
    return;
  }
  if (state.pendingDiscardChoice || (state.resolvingDiscardEffects || 0) > 0) {
    logMsg("Terminá primero el descarte pendiente.");
    return;
  }

  if (state.pendingSacrificeChoice) {
    tryResolveSacrificeChoice(item, isLocal);
    return;
  }

  // Si hay una tripulación pendiente, ningún otro permanente hace nada hasta que se
  // resuelva (clickear una criatura sigue yendo a handleCombatClick/handleCrewClick).
  if (state.pendingCrew) {
    logMsg("Terminá de elegir criaturas para tripular, o cancelá, antes de otra cosa.");
    return;
  }
  if (state.pendingWardChoice) {
    logMsg("Resolvé el Ward pendiente (pagar o dejarlo perder) antes de otra cosa.");
    return;
  }
  if (state.pendingCounterUnlessPay) {
    logMsg("Resolvé el pago pendiente (pagar o dejarlo perder) antes de otra cosa.");
    return;
  }
  if (state.pendingFightChoice) {
    logMsg("Elegí primero cuál de tus criaturas pelea.");
    return;
  }
  if (state.pendingXChoice) {
    logMsg("Elegí primero el valor de X.");
    return;
  }
  if (state.pendingModeChoice) {
    logMsg("Elegí primero un modo para el hechizo.");
    return;
  }
  if (state.pendingLoyaltyTargetChoice) {
    logMsg("Elegí primero un objetivo para esa habilidad de Lealtad.");
    return;
  }
  if (state.pendingMultiTargetChoice) {
    logMsg("Elegí primero todos los objetivos del hechizo.");
    return;
  }
  if (state.pendingScrySurveilChoice) {
    logMsg("Terminá de elegir qué hacer con las cartas antes de otra cosa.");
    return;
  }
  if (state.pendingProliferateChoice) {
    logMsg("Terminá de elegir qué proliferar antes de otra cosa.");
    return;
  }
  if (state.pendingEscapeExileChoice) {
    logMsg("Terminá de elegir qué exiliar para el Escape antes de otra cosa.");
    return;
  }
  if (state.pendingKickerChoice) {
    logMsg("Terminá de decidir el Kicker antes de otra cosa.");
    return;
  }
  if (state.pendingRampChoice) {
    logMsg("Terminá de elegir el color de tierra antes de otra cosa.");
    return;
  }

  const card = item.card;
  const abilityOptions = buildPermanentActivatedAbilityOptions(item, isLocal, index);

  // Punto 13: cualquier permanente que produzca maná (mana rock O Tierra) conserva
  // prioridad de fuente de maná mientras ya estamos pagando algo. Fuera de un pago, si
  // además tiene habilidades activadas, esas habilidades utility quedan disponibles.
  if (card.produces || card.producesOptions) {
    if (state.pendingCost && (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null)) {
      tapSupportManaSource(item, isLocal);
      return;
    }
    if (state.pendingAbilitySource && state.pendingTargetCard) {
      logMsg("Elegí primero el objetivo de la habilidad; todavía no hay ningún costo para pagar.");
      return;
    }
    if (abilityOptions.length === 0) {
      logMsg("Seleccioná primero un hechizo o habilidad para pagar.");
      return;
    }
  }

  // Punto 12: ya no hacemos un guard global de fase acá. Cada opción se valida por su
  // propio timing dentro de present/beginActivatedAbility. Las legacy siguen Main-only.
  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null) {
    logMsg("Terminá de pagar lo anterior antes de activar otra cosa.");
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
export function resumeAfterInteractiveEffect() {
  // Con Trigger Stack cada watcher es un objeto independiente: un modal pertenece a la
  // habilidad que está resolviendo y, cuando termina, la prioridad vuelve normalmente.
  checkRivalCounterOrResponse();
}


export function resolveSpellDirect(card, isLocal) { return resolveEffectDirect(card.effect, card.name, isLocal, card); }

// ENTREGA 23.8.5 — IMPORTANTE: index.html carga ./js/main.js SIN query-string.
// Todos los módulos internos que importan './main.js' resuelven exactamente la misma URL,
// por lo que existe un único singleton de state. El guard global de boot es una segunda
// barrera defensiva ante HTML viejo/cacheado o futuras entradas accidentales duplicadas.
boot();
