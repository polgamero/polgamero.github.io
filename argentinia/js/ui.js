import {
  state,
  getLocalPlayerName,
  getRivalName,
  getEffectivePower,
  getEffectiveToughness,
  getEffectiveKeywords,
  getEquipmentOn,
  getStaticTeamModifiers,
  handleDiscardClick,
  playCard,
  canPlayCard,
  tapLocalLand,
  handleCombatClick,
  handleSupportClick,
  handleInstantActivatedAbilityClick,
  handlePlaneswalkerClick,
  handleSupportTargetClick,
  handleLandTargetClick,
  handlePlayerTargetClick,
  cancelPayment,
  confirmCrew,
  payWithAlternativeCost,
  canPayCastCompositeNonManaCosts,
  payWard,
  payCounterTax,
  activateLoyaltyAbility,
  castFromGraveyard,
  playCardFromExile,
  canPlayCardFromExile,
  suspendCardFromHand,
  canSuspendCardFromHand,
  getExilePlayPermissionForCard,
  canManaSourcePayPendingCost,
  canActivateLocalManaAbility,
  spendLocalManaFromPool,
  checkGameOver,
  checkAuraLegality,
  checkEquipmentLegality,
  runStateBasedActions,
  publishMatchState,
  ensureMenuIdentityReady,
  hasLandPlayFromGraveyardPermission,
  openLandFromGraveyardPlayChoice,
  passPriority // Importado del nuevo sistema
} from './main.js';
import { canTransformPermanent, isTransformingDoubleFacedCard, currentTransformFace, normalizeTransformSpec, buildTransformFaceCard, transformFaceLayoutId } from './transformEngine.js';
import { cardHasSubtype, cardsShareCreatureType, resolveSubtypeReference, getChosenCreatureType } from './typalEngine.js';

import { executeLocalAttack, executeRivalAttack, hasPendingCombatDamageContinuation } from './combatRules.js';
import { renderStack, spellStack } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { listCounters, compactCounterText, counterTooltipLines, normalizeCounterType, getCounterDefinition } from './counterEngine.js';
import { hasSuspend, normalizeSuspendSpec, suspendedTimeCount } from './suspendEngine.js';
import { generatePackCards, generateGuaranteedMythicCard, isSacrificeCandidate, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming, describeCompositeCost } from './utils.js';
import { signInWithGoogle, signOutUser, purchasePack, openInventoryPack, openGuaranteedMythic, loadUserProfileFromServer, claimDailyReward, craftEnhancement, deleteUserProfile, renameUsername, createDeck, updateDeck, deleteDeck, saveGameConfig, loadGameTextOverrides, saveGameTextOverrides, ensureClassifiedsSchedule, fetchCurrentClassifieds, purchaseClassifiedCard, purchasePrebuiltDeck, createMatch, joinMatchByCode, listenToMatch, cancelMatch, fetchAllUserProfiles, adminGrantCurrency, adminGrantCurrencyToAll, adminGrantPacks, adminGrantPacksToAll, adminAdvanceDailyRewardDebugDay, adminResetDailyRewardDebug, registerDailyLogin, logAdminAction, fetchAnnouncements, fetchCampaignSnapshot, fetchTelemetrySessionsForAdmin, fetchTelemetrySessionArchive, adminCloseStaleTelemetrySessions, fetchPublicPlayerStats, adminSyncPublicPlayerStats } from './firebaseClient.js';
import { PACK_COST, FICHAS_PER_ENHANCEMENT, ENHANCEMENT_KEYWORDS, DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, ENHANCED_SUFFIX, POINTS, MYTHIC_CHANCE_IN_RARE_SLOT, CLASSIFIEDS_COMMON_POINTS, CLASSIFIEDS_COMMON_FICHAS, CLASSIFIEDS_UNCOMMON_POINTS, CLASSIFIEDS_UNCOMMON_FICHAS, CLASSIFIEDS_RARE_POINTS, CLASSIFIEDS_RARE_FICHAS, CLASSIFIEDS_MYTHIC_POINTS, CLASSIFIEDS_MYTHIC_FICHAS, CLASSIFIEDS_MYTHIC_CHANCE, PVP_LIMITS, PREBUILT_DECK_POINTS, PREBUILT_DECK_FICHAS, MAX_SAVED_DECKS, applyGameConfig, getDefaultGameConfig, isEnhancementEligibleCard } from './store.js';
import { canBlock, hasKeyword, getProtectionMatch } from './keywords.js';
import { ALL_COLORS, GUILD_PAIRS } from './utils.js';
import { recordTelemetryUiLog, captureTelemetryState, getTelemetryStatus } from './telemetry.js';
import { checkpointSoloRecovery } from './soloRecovery.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, ENGINE_VERSION_SHORT } from './version.js';
import { getPriorityUxCopy, getEffectivePriorityActivity, canPriorityClockRun, PRIORITY_CLOCK_DURATION_MS } from './priorityUX.js';
import { DAILY_REWARD_SCHEDULE, normalizeInventory, normalizeDailyRewardsState, unclaimedUnlockedDays, CHEST_ITEM_KEYS, rewardForDay } from './rewards.js';
import { showPackOpeningExperience, showGuaranteedMythicExperience } from './packOpening.js';
import { beginGuaranteedMythicReveal, getPendingGuaranteedMythicReveal, markGuaranteedMythicRevealCommitted, clearPendingGuaranteedMythicReveal, inferGuaranteedMythicRevealState } from './rewardRevealRecovery.js';
import { applyCardZoom } from './cardZoom.js';
import { announcePhaseTransition } from './phaseBanner.js';
import { buildDeckComposition, formatManaValue } from './deckComposition.js';
import { buildDeckStatistics, analyzeDeckHealth, simulateOpeningHands } from './deckStatistics.js';
import { getCardBrowserSortOptions, normalizeCardBrowserSort, compareCardsForBrowser } from './cardBrowser.js';
import { registerCardArtImage, hasCustomArtLayout, ensureArtLayoutsLoaded } from './artLayout.js';
import { openArtLayoutEditor } from './artLayoutEditor.js';
import { registerCardTextBox, hasCustomCardTextLayout, ensureCardTextLayoutsLoaded } from './textLayout.js';
import { openCardTextLayoutEditor } from './textLayoutEditor.js';
import { USERNAME_RENAME_COST } from './usernames.js';
import { showUsernameRenameModal } from './usernameUI.js';
import { classifiedsNextRotationAt, getClassifiedsProfileState, countOwnedClassifiedCard } from './classifieds.js';
import { loadPrebuiltDeckCatalog, summarizePrebuiltDeck, getPrebuiltPurchaseIds } from './prebuiltDecks.js';
import { gameText } from './gameTexts.js';
import { createGameTextsAdminPane } from './gameTextsAdmin.js';
import { showGlobalRanking } from './rankingUI.js';
import { summarizeGlobalTelemetry, summarizeProfiles, formatDuration, winRate, telemetryDurationMs } from './statistics.js';
import { buildCardTextLayout } from './cardTextFormatter.js';
import { MANA_ICON_URLS, manaIconKeyForSymbol } from './manaSymbolCatalog.js';
import { POOL_BASELINE } from './poolContract.js';
import { effectivePackCost, campaignStatus } from './campaigns.js';
import { mountAdminCampaignsPane, renderActiveEventsStrip } from './campaignsUI.js';
import { scheduleCombatMapRender } from './combatMap.js';
import { buildTokenCatalog, tokenArtLayoutId } from './tokenCatalog.js';
import { enterMenuAudio, getAudioSettings, toggleMusic, setMusicEnabled, setMusicVolume, setSfxEnabled, setSfxVolume } from './audioManager.js';
import { MANA_TYPES, manaPoolTotal } from './manaPool.js';
import { isLandPermanent, isCreaturePermanent, landMatchesFilter } from './permanentTypes.js';
import { landMatchesEffectiveFilter, getEffectiveLandTypeLine, getEffectiveLandActivatedAbilities, describeLandTransformation } from './landCharacteristics.js';
import { isSagaCard, sagaUiState } from './sagaEngine.js';
import { botDifficultyLabel, nextBotDifficulty, normalizeBotDifficulty } from './botDifficulty.js';
import * as headlessChoice from './headlessChoiceEngine.js';

const HEADLESS_ENGINE = globalThis.__ARGENTINIA_HEADLESS_ENGINE__ === true;

const ICON_MAP = {
  'Diego': '⚽', 'San Martín': '🐎', 'Ricky': '🍫', 'Gauchito': '🚩', 'Mate': '🧉', 'Parrilla': '🥩', 'Tierra': '⛰️', 'Estancia': '🏡', 'Obelisco': '🏙️', 'Perro': '🐕', 'Luz Mala': '👻', 'Carpincho': '🐹', 'Colectivo': '🚌', 'Asado': '🥩', 'Dólar': '💵', 'Pombero': '👺'
};

export const els = {
  localHand: document.getElementById('local-hand'),
  rivalHand: document.getElementById('rival-hand'),
  localLands: document.getElementById('local-lands'),
  localCombat: document.getElementById('local-combat'),
  rivalLands: document.getElementById('rival-lands'),
  rivalCombat: document.getElementById('rival-combat'),
  gameLogBox: document.getElementById('game-log-box'),
  btnEndTurn: document.getElementById('btn-end-turn'),
  
  localHpBar: document.getElementById('local-hp-bar'),
  rivalHpBar: document.getElementById('rival-hp-bar'),
  localHpText: document.getElementById('local-hp-text'),
  rivalHpText: document.getElementById('rival-hp-text'),
  localAvatar: document.getElementById('local-avatar'),
  localPlayerName: document.getElementById('local-player-name'),
  rivalAvatar: document.getElementById('rival-avatar'),
  rivalPlayerName: document.querySelector('.rival-card .player-info h3'),
  localManaPool: document.getElementById('local-mana-pool'),
  rivalManaPool: document.getElementById('rival-mana-pool'),
  localManaPoolHint: document.getElementById('local-mana-pool-hint'),
  localPlayerCard: document.querySelector('.player-card.local-card'),
  rivalPlayerCard: document.querySelector('.player-card.rival-card'),
  turnPriorityHud: document.getElementById('turn-priority-hud'),
  turnOwnerBadge: document.getElementById('turn-owner-badge'),
  turnPhaseBadge: document.getElementById('turn-phase-badge'),
  priorityOwnerBadge: document.getElementById('priority-owner-badge'),
  priorityStateChip: document.getElementById('priority-state-chip'),
  priorityContextLabel: document.getElementById('priority-context-label'),
  priorityClock: document.getElementById('priority-clock'),
  priorityFuseFill: document.getElementById('priority-fuse-fill'),
  priorityFuseSpark: document.getElementById('priority-fuse-spark'),
  priorityCountdown: document.getElementById('priority-countdown'),
  priorityPauseLabel: document.getElementById('priority-pause-label'),

  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverTitle: document.getElementById('game-over-title'),
  gameOverRewardStatus: document.getElementById('game-over-reward-status'),
  btnRestart: document.getElementById('btn-restart'),
  btnAbandonGame: document.getElementById('btn-abandon-game'),

  paymentControls : document.getElementById('payment-controls'),
  paymentStatus : document.getElementById('payment-status'),
  btnCancelSpell : document.getElementById('btn-cancel-spell'),
  btnAltCost : document.getElementById('btn-alt-cost'),
  btnPayWard : document.getElementById('btn-pay-ward'),
  btnPayCounterTax : document.getElementById('btn-pay-counter-tax'),
  btnConfirmCrew : document.getElementById('btn-confirm-crew'),

  rivalDeckPile: null,
  rivalGYPile: null,
  rivalExilePile: null,
  localDeckPile: null,
  localGYPile: null,
  localExilePile: null,
  
  localSupport: document.getElementById('local-support'),
  rivalSupport: document.getElementById('rival-support'),
  localPlaneswalkers: document.getElementById('local-planeswalkers'),
  rivalPlaneswalkers: document.getElementById('rival-planeswalkers'),
};

export function setupBoardLayout() {
  const rivalWrapper = document.getElementById('rival-wrapper');
  const localWrapper = document.getElementById('local-wrapper');

  const rivalRowContainer = document.createElement('div');
  rivalRowContainer.className = 'zone-row-container';
  rivalWrapper.parentNode.insertBefore(rivalRowContainer, rivalWrapper);

  els.rivalDeckPile = createPileElement('MAZO');
  els.rivalGYPile = createPileElement('CEMENTERIO');
  els.rivalGYPile.addEventListener('click', () => openGraveyardModal(false));
  els.rivalExilePile = createPileElement('EXILIO');
  els.rivalExilePile.addEventListener('click', () => openExileModal(false));

  const rivalCenterZone = document.createElement('div');
  rivalCenterZone.className = 'lands-center-zone';
  rivalCenterZone.appendChild(rivalWrapper); 

  rivalRowContainer.appendChild(els.rivalDeckPile);
  rivalRowContainer.appendChild(rivalCenterZone);
  rivalRowContainer.appendChild(els.rivalGYPile);
  rivalRowContainer.appendChild(els.rivalExilePile);

  const localRowContainer = document.createElement('div');
  localRowContainer.className = 'zone-row-container';
  localWrapper.parentNode.insertBefore(localRowContainer, localWrapper);

  els.localDeckPile = createPileElement('MAZO');
  els.localGYPile = createPileElement('CEMENTERIO');
  els.localGYPile.addEventListener('click', () => openGraveyardModal(true));
  els.localExilePile = createPileElement('EXILIO');
  els.localExilePile.addEventListener('click', () => openExileModal(true));

  const localCenterZone = document.createElement('div');
  localCenterZone.className = 'lands-center-zone';
  localCenterZone.appendChild(localWrapper); 

  localRowContainer.appendChild(els.localDeckPile);
  localRowContainer.appendChild(localCenterZone);
  localRowContainer.appendChild(els.localGYPile);
  localRowContainer.appendChild(els.localExilePile);
}

function createPileElement(label) {
  const div = document.createElement('div');
  div.className = 'side-pile';
  div.innerHTML = `
    <div class="pile-badge">0</div>
    <div class="pile-content"></div>
    <div class="pile-label">${label}</div>
  `;
  return div;
}

export function updatePilesUI() {
  els.rivalDeckPile.querySelector('.pile-badge').textContent = state.rivalDeck.length;
  const rivalDeckContent = els.rivalDeckPile.querySelector('.pile-content');
  rivalDeckContent.innerHTML = state.rivalDeck.length > 0 
    ? `<img src="./assets/images/card_back.png" style="width:100%; height:100%; object-fit:cover;">` 
    : `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;

  els.localDeckPile.querySelector('.pile-badge').textContent = state.localDeck.length;
  const localDeckContent = els.localDeckPile.querySelector('.pile-content');
  localDeckContent.innerHTML = state.localDeck.length > 0 
    ? `<img src="./assets/images/card_back.png" style="width:100%; height:100%; object-fit:cover;">` 
    : `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;

  els.rivalGYPile.querySelector('.pile-badge').textContent = state.rivalGraveyard.length;
  const rivalGYContent = els.rivalGYPile.querySelector('.pile-content');
  rivalGYContent.innerHTML = '';
  if (state.rivalGraveyard.length > 0) {
    const topCard = state.rivalGraveyard[state.rivalGraveyard.length - 1];
    const cardEl = createCardElement(topCard, false, false, null, 'graveyard');
    rivalGYContent.appendChild(cardEl);
  } else {
    rivalGYContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }

  els.localGYPile.querySelector('.pile-badge').textContent = state.localGraveyard.length;
  const localGYContent = els.localGYPile.querySelector('.pile-content');
  localGYContent.innerHTML = '';
  if (state.localGraveyard.length > 0) {
    const topCard = state.localGraveyard[state.localGraveyard.length - 1];
    const cardEl = createCardElement(topCard, false, true, null, 'graveyard');
    localGYContent.appendChild(cardEl);
    if (hasLandPlayFromGraveyardPermission(true)) {
      const playLandBtn = document.createElement('button');
      playLandBtn.type = 'button';
      playLandBtn.className = 'graveyard-play-land-btn';
      playLandBtn.textContent = '🌱';
      playLandBtn.title = gameText('land.grave.buttonTitle');
      playLandBtn.setAttribute('aria-label', gameText('land.grave.buttonAria'));
      playLandBtn.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        openLandFromGraveyardPlayChoice();
      });
      localGYContent.appendChild(playLandBtn);
    }
  } else {
    localGYContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }

  els.rivalExilePile.querySelector('.pile-badge').textContent = state.rivalExile.length;
  const rivalExileContent = els.rivalExilePile.querySelector('.pile-content');
  rivalExileContent.innerHTML = '';
  if (state.rivalExile.length > 0) {
    const topCard = state.rivalExile[state.rivalExile.length - 1];
    const cardEl = createCardElement(topCard, false, false, null, 'graveyard');
    rivalExileContent.appendChild(cardEl);
  } else {
    rivalExileContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }

  els.localExilePile.querySelector('.pile-badge').textContent = state.localExile.length;
  const localExileContent = els.localExilePile.querySelector('.pile-content');
  localExileContent.innerHTML = '';
  if (state.localExile.length > 0) {
    const topCard = state.localExile[state.localExile.length - 1];
    const cardEl = createCardElement(topCard, false, true, null, 'graveyard');
    localExileContent.appendChild(cardEl);
  } else {
    localExileContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }
}

// Menú de habilidades de Lealtad de un Planeswalker: se abre al clickear el tuyo propio.
// Cada botón muestra el costo (+N/-N/0) y el texto de la habilidad; se deshabilita solo si
// ya usó su habilidad este turno, o si el costo es negativo y no tiene Lealtad suficiente
// — el resto de las restricciones (fase, turno) las valida activateLoyaltyAbility al elegir,
// así que acá alcanza con un chequeo simple para no ofrecer botones obviamente inválidos.
// Elegir el valor de X (regla 107.3/601.2b: se anuncia y se fija ANTES de pagar nada). El
// hint de "maná disponible" es solo informativo — no le impide al jugador probar un X más
// alto (si no le alcanza, simplemente no va a poder terminar de pagar y puede cancelar).
// Elegir modo de un hechizo modal ("Elegí uno —", regla 700.2/601.2b): un botón por modo,
// mostrando su texto completo — se elige ANTES de pagar nada, así que acá no hay ningún
// chequeo de maná ni de targets todavía (eso viene después, ya con el modo fijado).
export function showModalSpellChoice(card, onConfirm, onCancel) {
  if (HEADLESS_ENGINE) { const idx=headlessChoice.chooseModeIndex(card); if(idx===null) onCancel?.(); else onConfirm?.(idx); return; }
  injectMulliganStyles(); // BUGFIX: blindaje defensivo, ver el comentario en showDeckNameModal
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const modesHTML = card.modes.map((mode, idx) => `
    <button class="loyalty-ability-btn" data-idx="${idx}" style="justify-content: flex-start;">
      <span class="loyalty-ability-text">${mode.text}</span>
    </button>
  `).join('');

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml('modal.mode.title', { card: card.name })}</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        ${modesHTML}
        <button id="modal-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">${gameTextHtml('modal.mode.cancel')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  modalOverlay.querySelectorAll('.loyalty-ability-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      modalOverlay.remove();
      onConfirm(idx);
    });
  });
  modalOverlay.querySelector('#modal-cancel').addEventListener('click', () => {
    modalOverlay.remove();
    onCancel();
  });
}

export function showXValueModal(card, onConfirm, onCancel) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseXValue()); return; }
  injectMulliganStyles();
  const untappedLands = state.localLands.filter(l => !l.tapped).length;
  const untappedRocks = state.localSupport.filter(s => !s.tapped && (s.card.produces || s.card.producesOptions)).length;
  const baseCost = { ...card };
  const restOfCostSymbols = (card.manaCost.match(/\{[^}]+\}/g) || []).filter(s => s !== '{X}').length;
  const roughMaxX = Math.max(0, manaPoolTotal(state.localManaPool) + untappedLands + untappedRocks - restOfCostSymbols);

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 380px;">
      <div class="gy-modal-header">
        <h3>✨ ${card.name}</h3>
      </div>
      <div style="padding: 20px; text-align: center;">
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 14px;">${renderInlineGameSymbols(card.text || '')}</p>
        <p style="color:#a89bb5; font-size: 12px; margin-bottom: 16px;">${gameTextHtml('modal.x.approx', { max: roughMaxX })}</p>
        <div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom: 20px;">
          <button id="x-minus" class="mulligan-btn mulligan-btn-mull" style="padding: 8px 16px;">−</button>
          <span id="x-value-display" style="font-size: 28px; font-weight: bold; color: var(--gold, #d4af37); min-width: 50px;">0</span>
          <button id="x-plus" class="mulligan-btn mulligan-btn-mull" style="padding: 8px 16px;">+</button>
        </div>
        <div class="mulligan-buttons">
          <button id="x-cancel" class="mulligan-btn mulligan-btn-mull">${gameTextHtml('modal.x.cancel')}</button>
          <button id="x-confirm" class="mulligan-btn mulligan-btn-keep">${gameTextHtml('modal.x.confirm')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  let xValue = 0;
  const display = modalOverlay.querySelector('#x-value-display');
  modalOverlay.querySelector('#x-minus').addEventListener('click', () => {
    xValue = Math.max(0, xValue - 1);
    display.textContent = xValue;
  });
  modalOverlay.querySelector('#x-plus').addEventListener('click', () => {
    xValue += 1;
    display.textContent = xValue;
  });
  modalOverlay.querySelector('#x-confirm').addEventListener('click', () => {
    modalOverlay.remove();
    onConfirm(xValue);
  });
  modalOverlay.querySelector('#x-cancel').addEventListener('click', () => {
    modalOverlay.remove();
    onCancel();
  });
}

// BUG 2 (post-lanzamiento): "Buena Cosecha" (Siembra de Otoño) antes traía la primera
// tierra básica que encontraba en el mazo, sin dejarte elegir de qué color — este modal es
// el arreglo. availableColors ya viene FILTRADO (solo los colores que el jugador REALMENTE
// tiene en el mazo — no tiene sentido ofrecer un color sin ninguna tierra de ese tipo).
// Reusa .deck-select-mono-btn tal cual (mismas imágenes de color que ya usa la pantalla de
// elegir mazo random) en vez de inventar clases nuevas para lo mismo.
// MECANISMO GENERAL DE DECISIÓN REMOTA (ver requestRivalDecision/handleIncomingDecisionRequest,
// main.js) — este es el primer caso concreto: te llegó por sync que el RIVAL amenaza con
// contrarrestar TU hechizo a menos que pagues. Corre en TU PROPIA pantalla, tripulando tus
// propias tierras si elegís pagar — a diferencia de antes, donde el cliente del rival
// decidía esto por vos sin preguntarte nada.
export function showCounterTaxDecisionModal(amount, targetCardName, onPay, onDecline) {
  if (HEADLESS_ENGINE) { headlessChoice.chooseCounterTax()==='pay' ? onPay?.() : onDecline?.(); return; }
  injectMulliganStyles();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 420px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml('modal.counterTax.title')}</h3>
      </div>
      <div style="padding: 20px; text-align: center;">
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 18px;">
          ${gameTextManaHtml('modal.counterTax.description', { card: targetCardName, cost: `{${amount}}` })}
        </p>
        <div class="mulligan-buttons">
          <button id="counter-tax-decline" class="mulligan-btn mulligan-btn-mull">${gameTextHtml('modal.counterTax.decline')}</button>
          <button id="counter-tax-pay" class="mulligan-btn mulligan-btn-keep">${gameTextManaHtml('modal.counterTax.pay', { cost: `{${amount}}` })}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#counter-tax-pay').addEventListener('click', () => {
    modalOverlay.remove();
    onPay();
  });
  modalOverlay.querySelector('#counter-tax-decline').addEventListener('click', () => {
    modalOverlay.remove();
    onDecline();
  });
}

// LAND 3 — selector de biblioteca para tutores de Tierras. A diferencia del viejo Ramp
// por color, muestra las cartas REALES que cumplen el filtro y permite encontrar menos
// (incluso 0) cuando la búsqueda en zona oculta lo autoriza.
export function showLandSearchModal(options, onConfirm) {
  if (HEADLESS_ENGINE) { const c=Array.isArray(options?.candidates)?options.candidates:[]; onConfirm?.(headlessChoice.chooseLandSearchIndexes(c,options?.maxCount,{allowFewer:options?.allowFewer!==false})); return; }
  injectMulliganStyles();
  const candidates = Array.isArray(options?.candidates) ? options.candidates : [];
  const maxCount = Math.max(0, Math.floor(Number(options?.maxCount || 0)));
  const allowFewer = options?.allowFewer !== false;
  const cardName = options?.cardName || gameText('selection.private.effectFallback');
  const chosen = new Set();
  state.pendingLandSearchChoice = state.pendingLandSearchChoice || { cardName, maxCount };

  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';
  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('land.search.title', { card: cardName })}</div>
      <div class="mulligan-subtitle" id="land-search-hint">${gameTextHtml('land.search.subtitle', {
        count: maxCount,
        filter: options?.filterLabel || gameText('land.search.filter.any'),
        destination: options?.destinationLabel || gameText('land.search.destination.battlefield'),
        selected: 0
      })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-land-search">${gameTextHtml('land.search.confirm')}</button>
      </div>
    </div>`;

  const hint = () => overlay.querySelector('#land-search-hint');
  const confirm = () => overlay.querySelector('#btn-confirm-land-search');
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';
  candidates.forEach(entry => {
    let cardEl;
    const toggle = () => {
      if (chosen.has(entry.index)) {
        chosen.delete(entry.index);
        cardEl.classList.remove('chosen');
      } else if (chosen.size < maxCount) {
        chosen.add(entry.index);
        cardEl.classList.add('chosen');
      }
      hint().textContent = gameText('land.search.subtitle', {
        count: maxCount,
        filter: options?.filterLabel || gameText('land.search.filter.any'),
        destination: options?.destinationLabel || gameText('land.search.destination.battlefield'),
        selected: chosen.size
      });
      confirm().disabled = !allowFewer && chosen.size !== maxCount;
      confirm().textContent = chosen.size === 0 ? gameText('land.search.failToFind') : gameText('land.search.confirm');
    };
    cardEl = createCardElement({ card: entry.card }, false, true, null, 'mulligan-pick', toggle);
    cardEl.classList.add('mulligan-card-slot', 'selectable');
    row.appendChild(cardEl);
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);
  confirm().disabled = !allowFewer && maxCount > 0;
  confirm().textContent = gameText('land.search.failToFind');
  confirm().addEventListener('click', () => {
    if (!allowFewer && chosen.size !== maxCount) return;
    overlay.remove();
    onConfirm([...chosen]);
  });
}


// 23.15.6 — selector universal de biblioteca. Para look-at-N muestra también las cartas
// no elegibles (porque el efecto autoriza mirarlas) pero las deshabilita visualmente.
export function showLibrarySearchModal(options, onConfirm) {
  if (HEADLESS_ENGINE) { const c=Array.isArray(options?.candidates)?options.candidates:[]; onConfirm?.(headlessChoice.chooseLibraryIndexes(c,options?.maxCount,{allowFewer:options?.allowFewer!==false})); return; }
  injectMulliganStyles();
  const candidates=Array.isArray(options?.candidates)?options.candidates:[];
  const maxCount=Math.max(0,Math.floor(Number(options?.maxCount||0)));
  const allowFewer=options?.allowFewer!==false;
  const cardName=options?.cardName || gameText('selection.private.effectFallback');
  const chosen=new Set();
  state.pendingLibraryChoice=state.pendingLibraryChoice || {cardName,maxCount};
  const isLook=Number(options?.lookCount)>0;

  const overlay=document.createElement('div');
  overlay.id='mulligan-overlay';
  overlay.innerHTML=`
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml(isLook?'library.look.title':'library.search.title',{card:cardName,count:options?.lookCount||0})}</div>
      <div class="mulligan-subtitle" id="library-search-hint">${gameTextHtml('library.search.subtitle',{
        count:maxCount,filter:options?.filterLabel||gameText('library.filter.any'),destination:options?.destinationLabel||gameText('library.destination.hand'),selected:0
      })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-library-search">${gameTextHtml('library.search.confirm')}</button>
      </div>
    </div>`;
  const hint=()=>overlay.querySelector('#library-search-hint');
  const confirm=()=>overlay.querySelector('#btn-confirm-library-search');
  const row=document.createElement('div'); row.className='mulligan-hand-row';
  candidates.forEach(entry=>{
    let cardEl;
    const selectable=entry.selectable!==false;
    const toggle=()=>{
      if(!selectable) return;
      if(chosen.has(entry.index)){ chosen.delete(entry.index); cardEl.classList.remove('chosen'); }
      else if(chosen.size<maxCount){ chosen.add(entry.index); cardEl.classList.add('chosen'); }
      hint().textContent=gameText('library.search.subtitle',{count:maxCount,filter:options?.filterLabel||gameText('library.filter.any'),destination:options?.destinationLabel||gameText('library.destination.hand'),selected:chosen.size});
      confirm().disabled=!allowFewer && chosen.size!==maxCount;
      confirm().textContent=chosen.size===0 && allowFewer ? gameText('library.search.chooseNone') : gameText('library.search.confirm');
    };
    cardEl=createCardElement({card:entry.card},false,true,null,'mulligan-pick',toggle);
    cardEl.classList.add('mulligan-card-slot');
    if(selectable) cardEl.classList.add('selectable');
    else { cardEl.classList.add('disabled'); cardEl.style.opacity='0.46'; cardEl.title=gameText('library.search.ineligible'); }
    row.appendChild(cardEl);
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);
  confirm().disabled=!allowFewer && maxCount>0;
  confirm().textContent=allowFewer?gameText('library.search.chooseNone'):gameText('library.search.confirm');
  confirm().addEventListener('click',()=>{
    if(!allowFewer && chosen.size!==maxCount) return;
    overlay.remove(); onConfirm([...chosen]);
  });
}

export function showRampLandChoiceModal(availableColors, cardName, onChoose) {
  if (HEADLESS_ENGINE) { const c=headlessChoice.chooseRampColor(availableColors); state.pendingRampChoice=false; if(c!==null) onChoose?.(c); return; }
  injectMulliganStyles();
  injectDeckSelectionStyles();
  state.pendingRampChoice = true;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const buttonsHTML = availableColors.map(colorKey => {
    const info = COLOR_INFO[colorKey];
    return `
      <button class="deck-select-mono-btn" data-color="${colorKey}" title="${info.name}">
        <div class="deck-select-circle-big" style="${circleStyle(colorKey)}"></div>
        <span class="deck-select-mono-label">${info.name}</span>
      </button>
    `;
  }).join('');

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 420px;">
      <div class="gy-modal-header">
        <h3>🌱 ${cardName}</h3>
      </div>
      <div style="padding: 20px; text-align: center;">
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 18px;">${gameTextHtml('modal.ramp.prompt')}</p>
        <div class="deck-select-mono-row">${buttonsHTML}</div>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  modalOverlay.querySelectorAll('.deck-select-mono-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      state.pendingRampChoice = false;
      modalOverlay.remove();
      onChoose(color);
    });
  });
}

// Kicker: costo ADICIONAL y OPCIONAL — a diferencia de un hechizo modal (elegís UNO de
// varios modos), acá es sí/no sobre pagar más por un bonus extra, y el efecto base se
// lanza de todos modos elijas lo que elijas. Mismo esqueleto visual que showModalSpellChoice.
export function showKickerModal(card, onConfirm, onCancel) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseKicker(card)); return; }
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const bonusText = card.kicker.bonusText || 'un bonus adicional';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml('modal.kicker.title', { card: card.name })}</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0 0 4px;">${gameTextManaHtml('modal.kicker.description', { cost: card.kicker.cost, bonus: bonusText })}</p>
        <button class="loyalty-ability-btn" id="kicker-yes" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">${gameTextManaHtml('modal.kicker.yes', { cost: card.kicker.cost })}</span>
        </button>
        <button class="loyalty-ability-btn" id="kicker-no" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">${gameTextHtml('modal.kicker.no')}</span>
        </button>
        <button id="modal-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">${gameTextHtml('modal.mode.cancel')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#kicker-yes').addEventListener('click', () => {
    modalOverlay.remove();
    onConfirm(true);
  });
  modalOverlay.querySelector('#kicker-no').addEventListener('click', () => {
    modalOverlay.remove();
    onConfirm(false);
  });
  modalOverlay.querySelector('#modal-cancel').addEventListener('click', () => {
    modalOverlay.remove();
    onCancel();
  });
}


// ENTREGA 23.10 — elegir VÍA de casteo antes de targets/pago. Una alternativa es una
// decisión de 601.2b, no un botón que aparece cuando ya empezaste a girar tierras.
export function showAlternativeCostModal(card, alternativeLabel, onConfirm, onCancel) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseAlternativeCost(card)); return; }
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 460px;">
      <div class="gy-modal-header"><h3>${gameTextHtml('modal.castRoute.title', { card: card.name })}</h3></div>
      <div style="display:flex; flex-direction:column; gap:10px; padding:16px;">
        <p style="color:#cfe0d4;font-size:13px;margin:0 0 4px;">${gameTextHtml('modal.castRoute.description')}</p>
        <button class="loyalty-ability-btn" id="cast-normal"><span class="loyalty-ability-text">${gameTextManaHtml('modal.castRoute.normal', { cost: card.manaCost || '{0}' })}</span></button>
        <button class="loyalty-ability-btn" id="cast-alt"><span class="loyalty-ability-text">${gameTextManaHtml('modal.castRoute.alternative', { cost: alternativeLabel })}</span></button>
        <button id="cast-route-cancel" class="mulligan-btn mulligan-btn-mull">${gameTextHtml('modal.mode.cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(modalOverlay);
  modalOverlay.querySelector('#cast-normal').addEventListener('click', () => { modalOverlay.remove(); onConfirm(false); });
  modalOverlay.querySelector('#cast-alt').addEventListener('click', () => { modalOverlay.remove(); onConfirm(true); });
  modalOverlay.querySelector('#cast-route-cancel').addEventListener('click', () => { modalOverlay.remove(); onCancel(); });
}

// ENTREGA 23.10 — selector universal de una OFERTA privada saneada. En opaque_slots la UI
// recibe únicamente tokens y posiciones: no existe card.name/id en este cliente. Si una
// regla futura dice explícitamente "mirá/revelá", reveal_candidates puede mostrar sólo los
// descriptores temporales autorizados sin materializar rivalHand/rivalDeck.
export function showPrivateZoneChoiceModal(offer, cardName, onConfirm, onCancel = null) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.choosePrivateZoneTokens(offer)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.className = 'gy-modal-overlay';
  const amount = Math.max(0, Number(offer?.amount || 0));
  const chosen = new Set();
  const zoneLabel = offer?.zone === 'deck' ? gameText('selection.private.zoneDeck') : gameText('selection.private.zoneHand');
  overlay.innerHTML = `
    <div class="gy-modal-content" style="max-width:760px;">
      <div class="gy-modal-header"><h3>${gameTextHtml('selection.private.title', { card: cardName || gameText('selection.private.effectFallback'), zone: zoneLabel })}</h3></div>
      <div style="padding:16px;">
        <p id="private-zone-hint" style="color:#cfe0d4;font-size:13px;">${gameTextHtml('selection.chooseCount', { total: amount, selected: 0 })}</p>
        <div id="private-zone-row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:16px 0;"></div>
        <div class="mulligan-buttons">
          ${onCancel ? `<button id="private-zone-cancel" class="mulligan-btn mulligan-btn-mull">${gameTextHtml('modal.mode.cancel')}</button>` : ''}
          <button id="private-zone-confirm" class="mulligan-btn mulligan-btn-keep" disabled>${gameTextHtml('selection.confirmChoice')}</button>
        </div>
      </div>
    </div>`;
  const row = overlay.querySelector('#private-zone-row');
  const hint = overlay.querySelector('#private-zone-hint');
  const confirm = overlay.querySelector('#private-zone-confirm');
  (offer?.candidates || []).forEach((entry, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loyalty-ability-btn';
    btn.style.cssText = 'width:128px;min-height:170px;display:flex;align-items:center;justify-content:center;text-align:center;';
    btn.dataset.token = entry.token;
    if (entry.selectable === false) {
      btn.disabled = true;
      btn.style.opacity = '0.45';
      btn.title = gameText('selection.private.invalid');
    }
    if (offer.visibility === 'reveal_candidates' && entry.card) {
      btn.innerHTML = `<span class="loyalty-ability-text"><strong>${entry.card.name || gameText('selection.private.cardFallback')}</strong><br><small>${entry.card.type || ''}</small></span>`;
    } else {
      btn.innerHTML = `<span class="loyalty-ability-text" style="font-size:30px;">🂠<br><small>${gameTextHtml('selection.private.slot', { index: idx + 1 })}</small></span>`;
      btn.title = gameText('selection.private.hidden');
    }
    btn.addEventListener('click', () => {
      if (entry.selectable === false) return;
      const token = entry.token;
      if (chosen.has(token)) { chosen.delete(token); btn.classList.remove('chosen'); }
      else if (chosen.size < amount) { chosen.add(token); btn.classList.add('chosen'); }
      hint.textContent = gameText('selection.chooseCount', { total: amount, selected: chosen.size });
      confirm.disabled = chosen.size !== amount;
    });
    row.appendChild(btn);
  });
  document.body.appendChild(overlay);
  confirm.addEventListener('click', () => {
    if (chosen.size !== amount) return;
    const tokens = [...chosen];
    overlay.remove();
    onConfirm(tokens);
  });
  if (onCancel) overlay.querySelector('#private-zone-cancel').addEventListener('click', () => { overlay.remove(); onCancel(); });
}

// FASE 2: confirmación antes de abandonar — es una acción con penalidad real de puntos, así
// que nunca se ejecuta con un solo click. Mismo esqueleto que showKickerModal.
export function showAbandonConfirmModal(onConfirm, onCancel) {
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml('modal.abandon.title')}</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0 0 4px;">${gameTextHtml('modal.abandon.description')}</p>
        <button class="loyalty-ability-btn" id="abandon-yes" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">${gameTextHtml('modal.abandon.confirm')}</span>
        </button>
        <button id="abandon-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">${gameTextHtml('modal.abandon.cancel')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#abandon-yes').addEventListener('click', () => {
    modalOverlay.remove();
    onConfirm();
  });
  modalOverlay.querySelector('#abandon-cancel').addEventListener('click', () => {
    modalOverlay.remove();
    onCancel();
  });
}

export function showActivatedAbilityModal(cardName, options, onChoose, onCancel) {
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const describeEffect = (ability) => {
    if (ability.name) return ability.name;
    if (ability.text) return ability.text;
    if (ability.crewCost !== undefined) return gameText('ability.cost.crew', { cost: ability.crewCost });
    const effect = ability.effect || {};
    const labelKeys = {
      draw: 'ability.effect.draw', heal: 'ability.effect.heal', damage: 'ability.effect.damage', drain: 'ability.effect.drain',
      fight: 'ability.effect.fight', attach_equipment: 'ability.effect.attach_equipment', exile_creature: 'ability.effect.exile_creature',
      exile_and_return: 'ability.effect.exile_and_return', ramp: 'ability.effect.ramp', create_tokens: 'ability.effect.create_tokens',
      grant_keyword_temp: 'ability.effect.grant_keyword_temp', draw_and_lose_life: 'ability.effect.draw_and_lose_life',
      discard: 'ability.effect.discard', sacrifice: 'ability.effect.sacrifice', reanimate: 'ability.effect.reanimate', search_land: 'ability.effect.search_land',
      search_library: 'ability.effect.search_library', look_at_top: 'ability.effect.look_at_top',
      destroy_land: 'ability.effect.destroy_land', destroy_nonbasic_land: 'ability.effect.destroy_nonbasic_land', animate_land: 'ability.effect.animate_land',
      return_lands_from_graveyard: 'ability.effect.return_lands_from_graveyard',
      scry: 'ability.effect.scry', surveil: 'ability.effect.surveil', proliferate: 'ability.effect.proliferate'
    };
    const base = labelKeys[effect.type] ? gameText(labelKeys[effect.type]) : (effect.type || gameText('ability.effect.generic'));
    const amount = effect.amount !== undefined ? ` ${effect.amount}` : '';
    return `${base}${amount}`;
  };
  const describeCost = (ability) => {
    if (ability.crewCost !== undefined) return gameText('ability.cost.crew', { cost: ability.crewCost });
    const bits = [];
    if (ability.cost) bits.push(ability.cost);
    if (ability.sacrifice) {
      const sac = ability.sacrifice === 'self' ? gameText('ability.cost.sacSelf') : (ability.sacrifice === 'creature' ? gameText('ability.cost.sacCreature') : ability.sacrifice === 'land' ? gameText('ability.cost.sacLand') : gameText('ability.cost.sacArtifact'));
      bits.push(sac);
    }
    return bits.join(', ') || '{0}';
  };

  const optionsHTML = options.map((option, idx) => {
    const sourceSuffix = option.sourceName && option.sourceName !== cardName ? ` — ${option.sourceName}` : '';
    const timing = getActivatedAbilityTiming(option.ability);
    const timingSuffix = timing === 'instant' ? gameText('ability.timing.instantLabel') : (timing === 'sorcery' ? gameText('ability.timing.sorceryLabel') : '');
    return `
      <button class="loyalty-ability-btn" data-idx="${idx}">
        <span class="loyalty-cost" style="min-width:105px;">${renderInlineGameSymbols(describeCost(option.ability))}</span>
        <span class="loyalty-ability-text">${describeEffect(option.ability)}${sourceSuffix}${timingSuffix}</span>
      </button>
    `;
  }).join('');

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 520px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml('ability.modal.title', { card: cardName })}</h3>
        <button class="gy-close-btn">${gameTextHtml('ability.modal.close')}</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding:16px;">
        ${optionsHTML}
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  modalOverlay.querySelectorAll('.loyalty-ability-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      modalOverlay.remove();
      onChoose(idx);
    });
  });
  const cancel = () => {
    modalOverlay.remove();
    if (onCancel) onCancel();
  };
  modalOverlay.querySelector('.gy-close-btn').onclick = cancel;
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) cancel(); };
}

export function showLoyaltyAbilityModal(pwItem, isLocal) {
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const alreadyUsed = pwItem.abilityUsedThisTurn;
  const abilitiesHTML = (pwItem.card.loyaltyAbilities || []).map((ability, idx) => {
    const costLabel = ability.cost > 0 ? `+${ability.cost}` : `${ability.cost}`;
    const cantAfford = ability.cost < 0 && pwItem.loyalty < Math.abs(ability.cost);
    const disabled = alreadyUsed || cantAfford;
    return `
      <button class="loyalty-ability-btn ${disabled ? 'disabled' : ''}" data-idx="${idx}" ${disabled ? 'disabled' : ''}>
        <span class="loyalty-cost">${costLabel}</span>
        <span class="loyalty-ability-text">${ability.name}${ability.text ? ' — ' + ability.text : ''}</span>
      </button>
    `;
  }).join('');

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 480px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml('ability.modal.loyaltyTitle', { card: pwItem.card.name, loyalty: pwItem.loyalty })}</h3>
        <button class="gy-close-btn">${gameTextHtml('ability.modal.close')}</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        ${alreadyUsed ? `<div style="color:#e67e22; font-style:italic;">${gameTextHtml('ability.modal.usedLoyalty')}</div>` : ''}
        ${abilitiesHTML}
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  modalOverlay.querySelectorAll('.loyalty-ability-btn:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      modalOverlay.remove();
      activateLoyaltyAbility(pwItem, idx, isLocal);
    });
  });

  modalOverlay.querySelector('.gy-close-btn').onclick = () => modalOverlay.remove();
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
}

export function openGraveyardModal(isLocal) {
  injectMulliganStyles();
  const gyArray = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const title = isLocal ? "Tu Cementerio" : `Cementerio de ${getRivalName()}`;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  
  modalOverlay.innerHTML = `
    <div class="gy-modal-content">
      <div class="gy-modal-header">
        <h3>🪦 ${title} (${gyArray.length})</h3>
        <button class="gy-close-btn">Cerrar ✖</button>
      </div>
      <div class="gy-modal-grid" id="gy-modal-grid-content"></div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const gridContent = modalOverlay.querySelector('#gy-modal-grid-content');

  if (gyArray.length === 0) {
    gridContent.innerHTML = `<div style="color:#bdc3c7; font-style:italic; padding:40px;">No hay cartas en el cementerio todavía.</div>`;
  } else {
    gyArray.forEach((cardObj, idx) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '4px';

      const cardEl = createCardElement(cardObj, false, isLocal, idx, 'modal');
      cardEl.style.width = '120px';
      cardEl.style.height = '168px';
      wrapper.appendChild(cardEl);

      // Flashback: solo en TU cementerio, solo si la carta lo tiene.
      if (isLocal && cardObj.flashback) {
        const fbBtn = document.createElement('button');
        fbBtn.className = 'mulligan-btn mulligan-btn-keep';
        fbBtn.style.fontSize = '11px';
        fbBtn.style.padding = '4px 8px';
        fbBtn.innerHTML = `🔄 Flashback ${renderInlineGameSymbols(cardObj.flashback.cost)}`;
        fbBtn.addEventListener('click', () => {
          modalOverlay.remove();
          castFromGraveyard(cardObj, isLocal);
        });
        wrapper.appendChild(fbBtn);
      }

      // Escape: solo en TU cementerio, solo si la carta lo tiene. Mostramos el costo de
      // maná Y cuántas cartas más hay que exiliar, para que sepas de entrada si te alcanza
      // el cementerio antes de siquiera intentarlo.
      if (isLocal && cardObj.escape) {
        const escBtn = document.createElement('button');
        escBtn.className = 'mulligan-btn mulligan-btn-keep';
        escBtn.style.fontSize = '11px';
        escBtn.style.padding = '4px 8px';
        escBtn.style.background = '#6c3483';
        escBtn.style.borderColor = '#9b59b6';
        const exileCount = cardObj.escape.exileCount || 0;
        escBtn.innerHTML = `🌀 Escape ${renderInlineGameSymbols(cardObj.escape.cost)} + exiliar ${exileCount}`;
        escBtn.addEventListener('click', () => {
          modalOverlay.remove();
          castFromGraveyard(cardObj, isLocal);
        });
        wrapper.appendChild(escBtn);
      }

      gridContent.appendChild(wrapper);
    });
  }

  modalOverlay.querySelector('.gy-close-btn').onclick = () => modalOverlay.remove();
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
}

export function openExileModal(isLocal) {
  injectMulliganStyles();
  const exileArray = isLocal ? state.localExile : state.rivalExile;
  const title = isLocal ? "Tu Exilio" : `Exilio de ${getRivalName()}`;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content">
      <div class="gy-modal-header">
        <h3>🌀 ${title} (${exileArray.length})</h3>
        <button class="gy-close-btn">Cerrar ✖</button>
      </div>
      <div class="gy-modal-grid" id="exile-modal-grid-content"></div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const gridContent = modalOverlay.querySelector('#exile-modal-grid-content');

  if (exileArray.length === 0) {
    gridContent.innerHTML = `<div style="color:#bdc3c7; font-style:italic; padding:40px;">No hay cartas exiliadas todavía.</div>`;
  } else {
    exileArray.forEach((cardObj, idx) => {
      const wrapper=document.createElement('div');
      wrapper.style.display='flex';
      wrapper.style.flexDirection='column';
      wrapper.style.alignItems='center';
      wrapper.style.gap='4px';
      const cardEl = createCardElement(cardObj, false, isLocal, idx, 'modal');
      cardEl.style.width = '120px';
      cardEl.style.height = '168px';
      wrapper.appendChild(cardEl);

      // 23.16.2: el permiso pertenece al CONTROLADOR autorizado, no necesariamente al
      // propietario de la zona. Por eso incluso una carta en Exilio rival puede ofrecer
      // botón si un efecto futuro explícitamente nos permite jugarla.
      const timeCount=suspendedTimeCount(cardObj);
      if(cardObj?._suspendState){
        const status=document.createElement('div');
        status.className='suspend-exile-status';
        status.style.cssText='font-size:11px;font-weight:700;color:#f7d774;text-align:center;max-width:126px;';
        status.textContent=timeCount>0 ? `⏳ Suspendida · ${timeCount} Tiempo${timeCount===1?'':'s'}` : '⏳ Suspend · esperando casteo';
        wrapper.appendChild(status);
      }
      const permission=getExilePlayPermissionForCard(cardObj,true);
      if(permission && !cardObj?._suspendState){
        const playBtn=document.createElement('button');
        playBtn.className='mulligan-btn mulligan-btn-keep';
        playBtn.style.fontSize='11px';
        playBtn.style.padding='4px 8px';
        const isLand=String(cardObj.type||'').includes('Tierra');
        playBtn.innerHTML=isLand ? '▶ Jugar desde Exilio' : '✨ Castear desde Exilio';
        playBtn.disabled=!canPlayCardFromExile(cardObj,true);
        const duration=permission.duration==='until_end_of_next_turn' ? 'hasta fin de tu próximo turno'
          : permission.duration==='while_exiled' ? 'mientras siga exiliada' : 'hasta fin de turno';
        playBtn.title=`Permiso ${duration}`;
        playBtn.addEventListener('click',()=>{
          modalOverlay.remove();
          void playCardFromExile(cardObj,true);
        });
        wrapper.appendChild(playBtn);
      }
      gridContent.appendChild(wrapper);
    });
  }

  modalOverlay.querySelector('.gy-close-btn').onclick = () => modalOverlay.remove();
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
}


export function showSuspendCastModal(card) {
  return new Promise(resolve=>{
    injectMulliganStyles();
    const overlay=document.createElement('div'); overlay.className='gy-modal-overlay suspend-cast-modal';
    overlay.innerHTML=`<div class="gy-modal-content" style="max-width:460px"><div class="gy-modal-header"><h3>⏳ Suspend — último contador de Tiempo</h3></div><div style="padding:18px;display:flex;gap:16px;align-items:center"><div id="suspend-card-preview"></div><div style="flex:1"><p><b>${card.name}</b> está lista para salir de Suspend.</p><p style="font-size:13px;color:#bdc3c7">Podés castear este hechizo ahora sin pagar su coste de maná. Los costes adicionales siguen aplicando.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="mulligan-btn mulligan-btn-keep" data-choice="cast">✨ Castear gratis</button><button class="mulligan-btn" data-choice="leave">Dejar en Exilio</button></div></div></div></div>`;
    document.body.appendChild(overlay);
    const preview=overlay.querySelector('#suspend-card-preview');
    const cardEl=createCardElement(card,false,true,null,'preview',()=>{}); cardEl.style.width='120px';cardEl.style.height='168px'; preview.appendChild(cardEl);
    const finish=value=>{ overlay.remove(); resolve(value); };
    overlay.querySelector('[data-choice="cast"]').onclick=()=>finish(true);
    overlay.querySelector('[data-choice="leave"]').onclick=()=>finish(false);
  });
}

export function showSuspendedCardChoiceModal(entries,{title='Elegí una carta suspendida'}={}) {
  return new Promise(resolve=>{
    injectMulliganStyles();
    const overlay=document.createElement('div'); overlay.className='gy-modal-overlay';
    overlay.innerHTML=`<div class="gy-modal-content"><div class="gy-modal-header"><h3>⏳ ${title}</h3><button class="gy-close-btn">Cancelar ✖</button></div><div class="gy-modal-grid" data-grid></div></div>`;
    document.body.appendChild(overlay); const grid=overlay.querySelector('[data-grid]');
    const finish=value=>{overlay.remove();resolve(value)};
    entries.forEach(entry=>{
      const wrap=document.createElement('button'); wrap.type='button'; wrap.style.cssText='background:transparent;border:1px solid #596275;border-radius:8px;padding:6px;color:white;cursor:pointer;';
      const ce=createCardElement(entry.card,false,entry.zoneIsLocal,null,'preview',()=>{}); ce.style.width='105px';ce.style.height='147px';wrap.appendChild(ce);
      const label=document.createElement('div');label.textContent=`⏳ ${entry.time}`;label.style.cssText='font-weight:700;margin-top:4px';wrap.appendChild(label);
      wrap.onclick=()=>finish(entry);grid.appendChild(wrap);
    });
    overlay.querySelector('.gy-close-btn').onclick=()=>finish(null);
    overlay.onclick=e=>{if(e.target===overlay)finish(null)};
  });
}

export function showCreatureTypeChoiceModal(options,{title='Elegí un tipo de criatura',cardName=''}={},onChoose,onCancel) {
  const list=(options||[]).map(x=>typeof x==='string'?{name:x,count:null}:x).filter(x=>x?.name);
  const overlay=document.createElement('div'); overlay.className='gy-modal-overlay typal-choice-modal';
  const buttons=list.map((entry,i)=>`<button class="mulligan-btn" data-typal-index="${i}">${escapeHtml(entry.name)}${entry.count!=null?` <span style="opacity:.65">(${entry.count})</span>`:''}</button>`).join('');
  overlay.innerHTML=`<div class="gy-modal-content" style="max-width:560px"><div class="gy-modal-header"><h3>🧬 ${escapeHtml(title)}</h3></div>${cardName?`<p style="padding:0 18px">${escapeHtml(cardName)}</p>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap;padding:16px;max-height:55vh;overflow:auto">${buttons}</div><button class="mulligan-btn mulligan-btn-mull typal-cancel">Cancelar</button></div>`;
  document.body.appendChild(overlay);
  const finish=value=>{overlay.remove(); if(value) onChoose?.(value); else onCancel?.();};
  overlay.querySelectorAll('[data-typal-index]').forEach(btn=>btn.onclick=()=>finish(list[Number(btn.dataset.typalIndex)]?.name||null));
  overlay.querySelector('.typal-cancel').onclick=()=>finish(null); overlay.onclick=e=>{if(e.target===overlay)finish(null)};
}

export function showManaColorChoiceModal(cardName, options, onChoose) {
  const normalized = [...new Set((options || []).filter(t => MANA_TYPES.includes(t)))];
  if (!normalized.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'gy-modal-overlay';
  const choices = normalized.map(type => `
    <button class="mana-choice-btn" data-mana-type="${type}">
      ${renderManaIcon(type, 'mana-icon-inline')}
      <span>${gameText(`mana.color.${type}`)}</span>
    </button>`).join('');
  overlay.innerHTML = `
    <div class="gy-modal-content mana-choice-modal">
      <div class="gy-modal-header"><h3>${gameTextHtml('mana.chooseColor.title', { card: cardName })}</h3></div>
      <div class="mana-choice-grid">${choices}</div>
      <button class="mulligan-btn mulligan-btn-mull mana-choice-cancel">${gameTextHtml('common.cancel')}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-mana-type]').forEach(btn => btn.addEventListener('click', () => {
    const type = btn.dataset.manaType;
    overlay.remove();
    onChoose?.(type);
  }));
  const close = () => overlay.remove();
  overlay.querySelector('.mana-choice-cancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

export function showManaOrAbilityChoiceModal(cardName, onMana, onAbility) {
  const overlay = document.createElement('div');
  overlay.className = 'gy-modal-overlay';
  overlay.innerHTML = `
    <div class="gy-modal-content mana-choice-modal">
      <div class="gy-modal-header"><h3>${gameTextHtml('mana.sourceChoice.title', { card: cardName })}</h3></div>
      <div class="mana-source-choice-actions">
        <button class="mulligan-btn mulligan-btn-keep" data-source-action="mana">${gameTextHtml('mana.sourceChoice.addMana')}</button>
        <button class="mulligan-btn" data-source-action="ability">${gameTextHtml('mana.sourceChoice.ability')}</button>
      </div>
      <button class="mulligan-btn mulligan-btn-mull mana-choice-cancel">${gameTextHtml('common.cancel')}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-source-action="mana"]').onclick = () => { overlay.remove(); onMana?.(); };
  overlay.querySelector('[data-source-action="ability"]').onclick = () => { overlay.remove(); onAbility?.(); };
  const close = () => overlay.remove();
  overlay.querySelector('.mana-choice-cancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

let lastRenderedLocalManaPoolTotal = 0;
let lastManaPoolEducationTurn = null;
let manaPoolEducationTimer = null;

function showManaPoolEducationHint() {
  const hint = els.localManaPoolHint;
  if (!hint || HEADLESS_ENGINE) return;
  hint.textContent = gameText('mana.pool.educationHint');
  hint.classList.remove('hidden');
  if (manaPoolEducationTimer) clearTimeout(manaPoolEducationTimer);
  manaPoolEducationTimer = setTimeout(() => hint.classList.add('hidden'), 5200);
}

function renderManaPoolHud() {
  const renderOne = (container, pool, isLocal) => {
    if (!container) return;
    container.innerHTML = '';
    const total = manaPoolTotal(pool);
    container.classList.toggle('mana-pool-empty', total <= 0);
    container.setAttribute('aria-label', isLocal ? gameText('mana.pool.localAria') : gameText('mana.pool.rivalAria'));
    if (total <= 0) return;
    for (const type of MANA_TYPES) {
      const amount = Math.max(0, Number(pool?.[type]) || 0);
      if (!amount) continue;
      const chip = document.createElement(isLocal ? 'button' : 'span');
      chip.className = `mana-pool-chip mana-pool-${type.toLowerCase()}${isLocal && state.pendingCost ? ' mana-pool-spendable' : ''}`;
      chip.innerHTML = `${renderManaIcon(type, 'mana-icon-pool')}<span class="mana-pool-count">${amount}</span>`;
      chip.title = isLocal
        ? (state.pendingCost ? gameText('mana.pool.clickSpend', { mana:`{${type}}`, amount }) : gameText('mana.pool.floating', { mana:`{${type}}`, amount }))
        : gameText('mana.pool.rivalFloating', { mana:`{${type}}`, amount });
      if (isLocal) {
        chip.type = 'button';
        chip.disabled = !state.pendingCost;
        chip.onclick = () => spendLocalManaFromPool(type);
      }
      container.appendChild(chip);
    }
  };
  const localTotal = manaPoolTotal(state.localManaPool);
  renderOne(els.localManaPool, state.localManaPool, true);
  renderOne(els.rivalManaPool, state.rivalManaPool, false);

  // Tutorial contextual: sólo cuando el pool pasa de vacío a no-vacío FUERA de un pago y
  // como máximo una vez por turno. Enseña el concepto sin spamear cada land tap.
  if (localTotal > 0 && lastRenderedLocalManaPoolTotal <= 0 && !state.pendingCost && lastManaPoolEducationTurn !== state.turnCount) {
    lastManaPoolEducationTurn = state.turnCount;
    showManaPoolEducationHint();
  }
  if (localTotal <= 0 && els.localManaPoolHint && !els.localManaPoolHint.classList.contains('hidden')) {
    els.localManaPoolHint.classList.add('hidden');
  }
  lastRenderedLocalManaPoolTotal = localTotal;
}

export function logMsg(msg) {
  recordTelemetryUiLog(msg);
  if (HEADLESS_ENGINE) { globalThis.__ARGENTINIA_HEADLESS_LOG__?.push?.(String(msg)); return; }
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  els.gameLogBox.appendChild(entry);
  els.gameLogBox.scrollTop = els.gameLogBox.scrollHeight;
}

// 23.13.21 — set visual completo de símbolos de maná, ahora también {0} e incoloro {C}. IMPORTANTE: estas URLs son relativas
// al DOCUMENTO, no al archivo js/ui.js. En GitHub Pages, si la app vive en /argentinia/,
// `./assets/...` resuelve correctamente a /argentinia/assets/... sin asumir el root del dominio.
// 23.15.5.3 — catálogo de símbolos centralizado en manaSymbolCatalog.js.
function renderManaIcon(symbol, extraClass = '') {
  const key = manaIconKeyForSymbol(symbol);
  const src = MANA_ICON_URLS[key];
  if (!src) return '';
  const cls = extraClass ? `mana-icon ${extraClass}` : 'mana-icon';
  return `<img class="${cls}" src="${src}" alt="{${symbol}}" draggable="false" decoding="async">`;
}

export function renderManaSymbols(manaCostStr) {
  if (!manaCostStr) return '';
  const matches = manaCostStr.match(/\{[^}]+\}/g);
  if (!matches) return '';
  return matches.map(m => {
    const val = m.replace(/[{}]/g, '').toUpperCase();
    const key = manaIconKeyForSymbol(val);
    if (MANA_ICON_URLS[key]) return renderManaIcon(val, 'mana-icon-card-cost');

    // Fallback para símbolos sin PNG propio (principalmente genéricos >9).
    const innerText = val;
    const fontSize = innerText.length >= 2 ? '3.2cqw' : '4.6cqw';
    return `<span class="mana-symbol mana-c" style="font-size:${fontSize};">${innerText}</span>`;
  }).join('');
}

// Para reglas, tierras, modales y reminder text. Todos los símbolos conocidos usan PNG;
// cualquier genérico sin asset propio conserva el círculo CSS.
export function renderInlineGameSymbols(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/\{([^}]+)\}/g, (match, raw) => {
    const val = String(raw).toUpperCase();
    const key = manaIconKeyForSymbol(val);
    if (MANA_ICON_URLS[key]) return renderManaIcon(val, 'mana-icon-inline');
    if (/^(?:\d+|C)$/.test(val)) {
      const wide = val.length >= 2 ? ' mana-symbol-inline-wide' : '';
      return `<span class="mana-symbol mana-c mana-symbol-inline${wide}">${val}</span>`;
    }
    return match;
  });
}

function escapeCardTextHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getTargetRules(card) {
  if (card.adjunta) {
    // `alcance` decide a quién se le puede adjuntar: "criatura_propia" (default, ej. Poncho del
    // Paisano), "criatura_rival" (Auras-maldición, ej. Maldición del Yaguareté) o "cualquier_criatura".
    const alcance = card.alcance || 'criatura_propia';
    return {
      allowPlayer: false,
      allowLocalCreature: alcance !== 'criatura_rival',
      allowRivalCreature: alcance === 'criatura_rival' || alcance === 'cualquier_criatura',
      allowLocalPermanent: false,
      allowRivalPermanent: false
    };
  }
  // Un objeto en la pila puede llegar con requiresTarget desde una carta (spell/instant) o desde
  // una habilidad activada (source de tablero) — buscamos el effect en cualquiera de los dos lugares.
  const firstActivated = Array.isArray(card.activatedAbilities) ? card.activatedAbilities[0] : card.activatedAbility;
  const firstGranted = Array.isArray(card.grantedAbilities) ? card.grantedAbilities[0] : card.grantedAbility;
  const effectType = card.effect?.type || card.etbEffect?.type || firstActivated?.effect?.type || firstGranted?.effect?.type;

  const effect = card.effect || card.etbEffect || firstActivated?.effect || firstGranted?.effect || {};
  // 23.16.5 Typal: cualquier efecto puede acotar su target por subtipo exacto o por
  // compartir tipo de criatura con la fuente sin inventar una rama por effect.type.
  if (effect.targetSubtype || effect.targetSubtypes || effect.sharedCreatureTypeWithSource || effect.sharesCreatureTypeWithSource) {
    const controller=effect.targetController || 'any';
    const allowLocal=controller!=='opponent', allowRival=controller!=='self';
    const targetKind=effect.targetKind || 'creature';
    const anyPermanent=['any_permanent','permanent'].includes(targetKind);
    return {
      allowPlayer:false,
      allowLocalCreature:(targetKind==='creature'||anyPermanent)&&allowLocal, allowRivalCreature:(targetKind==='creature'||anyPermanent)&&allowRival,
      allowLocalPermanent:(targetKind==='support'||anyPermanent)&&allowLocal, allowRivalPermanent:(targetKind==='support'||anyPermanent)&&allowRival,
      allowLocalLand:(targetKind==='land'||anyPermanent)&&allowLocal, allowRivalLand:(targetKind==='land'||anyPermanent)&&allowRival,
      allowLocalPlaneswalker:(targetKind==='planeswalker'||anyPermanent)&&allowLocal, allowRivalPlaneswalker:(targetKind==='planeswalker'||anyPermanent)&&allowRival,
      subtypeFilter:resolveSubtypeReference(effect.targetSubtype ?? effect.targetSubtypes?.[0],{sourceCard:card}),
      sharedCreatureTypeWithSource:effect.sharedCreatureTypeWithSource===true || effect.sharesCreatureTypeWithSource===true,
      typalSourceCard:card
    };
  }
  // LAND 1/2: contrato genérico de target Tierra + vocabulario nativo de destrucción.
  // destroy_land apunta a cualquier Tierra; destroy_nonbasic_land fuerza el filtro nonbasic.
  // targetController permite reutilizar la misma infraestructura para futuras habilidades propias/rivales.
  if (effect.targetKind === 'land' || effectType === 'destroy_land' || effectType === 'destroy_nonbasic_land') {
    const controller = effect.targetController || 'any';
    const landFilter = effectType === 'destroy_nonbasic_land' ? 'nonbasic' : (effect.landFilter || 'any');
    return {
      allowPlayer: false, allowLocalCreature: false, allowRivalCreature: false,
      allowLocalPermanent: false, allowRivalPermanent: false,
      allowLocalLand: controller !== 'opponent',
      allowRivalLand: controller !== 'self',
      allowLocalPlaneswalker: false, allowRivalPlaneswalker: false,
      landFilter
    };
  }

  if (effectType === 'transform') {
    // 23.16.4 — Transform sólo puede apuntar a una TDFC física que pueda transformarse.
    // El filtro se vuelve a validar en main/Stack al resolver para no depender sólo del brillo UI.
    const controller = effect.targetController || 'any';
    const allowLocal = controller !== 'opponent';
    const allowRival = controller !== 'self';
    const targetKind = effect.targetKind || 'any_permanent';
    const anyPermanent = ['any_permanent','permanent'].includes(targetKind);
    return {
      allowPlayer:false,
      allowLocalCreature:(targetKind==='creature' || anyPermanent) && allowLocal,
      allowRivalCreature:(targetKind==='creature' || anyPermanent) && allowRival,
      allowLocalPermanent:(targetKind==='support' || anyPermanent) && allowLocal,
      allowRivalPermanent:(targetKind==='support' || anyPermanent) && allowRival,
      allowLocalLand:(targetKind==='land' || anyPermanent) && allowLocal,
      allowRivalLand:(targetKind==='land' || anyPermanent) && allowRival,
      allowLocalPlaneswalker:(targetKind==='planeswalker' || anyPermanent) && allowLocal,
      allowRivalPlaneswalker:(targetKind==='planeswalker' || anyPermanent) && allowRival,
      transformableOnly:true
    };
  }

  if (['copy_spell','copy_ability','copy_stack_object'].includes(effectType)) {
    // Estos efectos targetean un objeto de la STACK; el battlefield no debe brillar ni
    // aceptar clicks mientras se declara ese objetivo.
    return {allowPlayer:false,allowLocalCreature:false,allowRivalCreature:false,allowLocalPermanent:false,allowRivalPermanent:false,allowLocalLand:false,allowRivalLand:false,allowLocalPlaneswalker:false,allowRivalPlaneswalker:false};
  }
  if (effectType === 'create_token_copy' || effectType === 'become_copy') {
    // 23.15.9 — el objeto elegido es el MOLDE que se copia. Por default puede ser cualquier
    // permanente de cualquier lado; targetKind/targetController permiten acotar el contrato.
    const targetKind = effect.targetKind || 'any_permanent';
    const controller = effect.targetController || 'any';
    const allowLocal = controller !== 'opponent';
    const allowRival = controller !== 'self';
    const anyPermanent = ['any_permanent','permanent'].includes(targetKind);
    return {
      allowPlayer:false,
      allowLocalCreature:(targetKind==='creature' || anyPermanent) && allowLocal,
      allowRivalCreature:(targetKind==='creature' || anyPermanent) && allowRival,
      allowLocalPermanent:(targetKind==='support' || anyPermanent) && allowLocal,
      allowRivalPermanent:(targetKind==='support' || anyPermanent) && allowRival,
      allowLocalLand:(targetKind==='land' || anyPermanent) && allowLocal,
      allowRivalLand:(targetKind==='land' || anyPermanent) && allowRival,
      allowLocalPlaneswalker:(targetKind==='planeswalker' || anyPermanent) && allowLocal,
      allowRivalPlaneswalker:(targetKind==='planeswalker' || anyPermanent) && allowRival
    };
  }

  if (effectType === 'gain_control' || effectType === 'gain_control_until_eot') {
    const controller = effect.targetController || 'opponent';
    const anyPermanent = effect.targetKind === 'any_permanent';
    const creatureOnly = !anyPermanent && (effect.targetKind === 'creature' || !effect.targetKind);
    return {
      allowPlayer:false,
      allowLocalCreature: creatureOnly ? controller !== 'opponent' : controller !== 'opponent',
      allowRivalCreature: creatureOnly ? controller !== 'self' : controller !== 'self',
      allowLocalPermanent: anyPermanent && controller !== 'opponent',
      allowRivalPermanent: anyPermanent && controller !== 'self',
      allowLocalLand: anyPermanent && controller !== 'opponent',
      allowRivalLand: anyPermanent && controller !== 'self',
      allowLocalPlaneswalker: anyPermanent && controller !== 'opponent',
      allowRivalPlaneswalker: anyPermanent && controller !== 'self'
    };
  }

  if (effectType === 'destroy_artifact') {
    // PUNTO 10 PRE-500: un Artefacto sigue siendo Artefacto aunque esté representado en
    // Combat (Criatura Artefacto / Vehículo tripulado). Separamos tipo de carta de zona:
    // Support usa permanentFilter y Combat usa creatureFilter, ambos con el mismo subtipo.
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: true, creatureFilter: 'Artefacto', allowLocalPermanent: true, allowRivalPermanent: true, permanentFilter: 'Artefacto' };
  }
  if (effectType === 'heal') {
    // Curar modifica HP de jugador; el resolver dirigido no tiene una semántica de
    // "curar criatura". Dejarlo caer al default ofrecía criaturas como targets que luego
    // no hacían nada. Punto 9 formaliza esta frontera para Loyalty y el resto del motor.
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPlaneswalker: false, allowRivalPlaneswalker: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'damage') {
    // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #13): "cualquier objetivo" caía en el default
    // de más abajo, que solo contemplaba jugador o criatura — un Planeswalker (regla real
    // moderna: el daño no discrimina) ni aparecía como opción. Ahora sí: le resta Lealtad
    // en vez de HP, mismo criterio que la habilidad de Lealtad con target (item 12).
    return { allowPlayer: true, allowLocalCreature: true, allowRivalCreature: true, allowLocalPlaneswalker: true, allowRivalPlaneswalker: true, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'destroy_enchantment') {
    return { allowPlayer: false, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: true, allowRivalPermanent: true, permanentFilter: 'Encantamiento' };
  }
  if (effectType === 'prevent_attack') {
    // Efecto GLOBAL: el jugador objetivo no puede declarar combate (Cuarentena Total).
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'cant_attack_next_turn') {
    // 23.9.3: contrato distinto — una criatura concreta no puede atacar en el próximo turno
    // de su controlador. No debe colapsar al jugador entero como hacía prevent_attack.
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'pump' || effectType === 'grant_keyword_temp') {
    // Trucos de combate: solo tiene sentido apuntar a tu propia criatura.
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'attach_equipment') {
    // Equipar: nunca a una criatura rival. Este caso faltaba del todo (caía en el
    // default, que permite ambos lados) — por eso se podía "equipar" al Firulais del Tano.
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'fight') {
    // Pelear: tu criatura (implícita) contra una criatura del rival.
    return { allowPlayer: false, allowLocalCreature: false, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'discard') {
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'private_zone_move') {
    // El objeto elegido durante CR 601/602 es el JUGADOR; la carta concreta de Hand/Deck
    // se conoce recién durante resolución a través del protocolo privado.
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'poison') {
    // Los contadores de Veneno son de JUGADOR, nunca de criatura (a diferencia de -1/-1).
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'exile_creature' || effectType === 'exile_and_return') {
    // Remoción: apunta a una criatura de cualquier lado (igual que destruir/rebotar). En
    // exile_and_return en particular, apuntar a tu PROPIA criatura suele ser justo el punto
    // (retriggerea su "cuando entra", le saca auras malas encima, resetea el daño marcado).
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  // ETAPA MOTOR 1: estos dos efectos antes caían en el default genérico, que también
  // permitía seleccionar jugadores. La resolución solo entiende criaturas, así que ofrecer
  // la cara del jugador como target era una jugada ilegal que terminaba sin efecto.
  if (effectType === 'destroy_creature' || effectType === 'bounce') {
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'add_counter' || effectType === 'remove_counter') {
    // 23.15.8 — counters genéricos. Legacy +1/+1/-1/-1 conserva su targeting histórico;
    // contenido nuevo puede declarar targetKind:any_permanent|creature|support|land|planeswalker
    // y targetController:self|opponent|any sin inventar una rama por tipo de contador.
    const rawCounterType = effect.counterType;
    const counterType = normalizeCounterType(rawCounterType);
    const targetKind = effect.targetKind || 'creature';
    const polarity=getCounterDefinition(counterType).polarity;
    const defaultController = effectType === 'remove_counter' ? 'any' : (polarity === 'negative' ? 'opponent' : 'self');
    const controller = effect.targetController || defaultController;
    const allowLocal = controller !== 'opponent';
    const allowRival = controller !== 'self';
    const anyPermanent = ['any_permanent','permanent'].includes(targetKind);
    return {
      allowPlayer:false,
      allowLocalCreature:(targetKind==='creature' || anyPermanent) && allowLocal,
      allowRivalCreature:(targetKind==='creature' || anyPermanent) && allowRival,
      allowLocalPermanent:(targetKind==='support' || anyPermanent) && allowLocal,
      allowRivalPermanent:(targetKind==='support' || anyPermanent) && allowRival,
      allowLocalLand:(targetKind==='land' || anyPermanent) && allowLocal,
      allowRivalLand:(targetKind==='land' || anyPermanent) && allowRival,
      allowLocalPlaneswalker:(targetKind==='planeswalker' || anyPermanent) && allowLocal,
      allowRivalPlaneswalker:(targetKind==='planeswalker' || anyPermanent) && allowRival,
      // 23.16.1.1 — POOL EXPANSION IV: filtro declarativo fino para counters de
      // permanentes. Permite, por ejemplo, que Lore apunte realmente a una Saga y no a
      // cualquier objeto de Support. La legalidad al resolver ya consume permanentFilter.
      permanentFilter: effect.permanentFilter || null,
      creatureFilter: effect.creatureFilter || null
    };
  }
  if (effectType === 'exile_graveyard') {
    // Odio de cementerio: el objetivo es el JUGADOR (se exilia TODO su cementerio), nunca
    // una criatura en el campo.
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }

  return { allowPlayer: true, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
}

// El tamaño de letra de la carta usa cqw (proporcional al ancho de LA CARTA), así que
// agrandar la carta no alcanza para que un nombre largo entre — el texto escala junto con
// la carta, mantiene la misma proporción relativa. Esto reduce la fuente según el largo del
// texto, para que "El Flaco Spinetta" entre igual de bien que "El Firulais".
function fitScale(text, idealChars, minScale = 0.55) {
  if (!text) return 1;
  return fitScaleByLength(text.length, idealChars, minScale);
}
function fitScaleByLength(len, idealChars, minScale = 0.55) {
  if (len <= idealChars) return 1;
  return Math.max(minScale, idealChars / len);
}

export function createCardElement(itemObj, isTapped = false, isLocal = true, index = null, zone = 'hand', customClick = null) {
  const card = itemObj.card || itemObj;
  const isBattlefieldLand = !!itemObj?.card && isLandPermanent(itemObj) && (zone === 'land' || zone === 'combat' || zone === 'support');
  const el = document.createElement('div');
  
  const isSick = itemObj.summoningSickness ? 'sick' : '';
  const isAttacking = itemObj.isAttacking === true ? 'attacking' : '';
  const isBlocking = (itemObj.blockingIndex !== null && itemObj.blockingIndex !== undefined) ? 'blocking' : '';
  const isSelectedBlocker = (state.pendingBlockerIndex === index && zone === 'combat' && isLocal) ? 'selected-blocker' : '';

  let isTargetable = false;
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    if (zone === 'combat') {
      const allowCreatureSide = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
      const creatureMatch = allowCreatureSide && (!rules.creatureFilter || card.type.includes(rules.creatureFilter)) && (!rules.subtypeFilter || cardHasSubtype(card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(card,rules.typalSourceCard)) && (!rules.transformableOnly || canTransformPermanent(itemObj));
      const allowLandSide = isLocal ? rules.allowLocalLand : rules.allowRivalLand;
      const landMatch = isLandPermanent(itemObj) && !!allowLandSide && landMatchesEffectiveFilter(state, itemObj, isLocal, rules.landFilter || 'any') && (!rules.transformableOnly || canTransformPermanent(itemObj));
      isTargetable = creatureMatch || landMatch;
    } else if (zone === 'support') {
      const allowThisSide = isLocal ? rules.allowLocalPermanent : rules.allowRivalPermanent;
      const matchesFilter = (!rules.permanentFilter || card.type.includes(rules.permanentFilter)) && (!rules.subtypeFilter || cardHasSubtype(card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(card,rules.typalSourceCard));
      isTargetable = allowThisSide && matchesFilter && (!rules.transformableOnly || canTransformPermanent(itemObj));
    } else if (zone === 'land') {
      const allowThisSide = isLocal ? rules.allowLocalLand : rules.allowRivalLand;
      isTargetable = !!allowThisSide && landMatchesEffectiveFilter(state, itemObj, isLocal, rules.landFilter || 'any') && (!rules.transformableOnly || canTransformPermanent(itemObj));
    } else if (zone === 'planeswalker') {
      // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #13, parte visual): el click ya funcionaba
      // una vez arreglado en handlePlaneswalkerClick, pero el brillo dorado de "esto se
      // puede targetear" nunca se prendía acá — el jugador no tenía forma de SABER que un
      // Planeswalker era una opción válida sin adivinarlo.
      isTargetable = (isLocal ? rules.allowLocalPlaneswalker : rules.allowRivalPlaneswalker) && (!rules.transformableOnly || canTransformPermanent(itemObj));
    }
  } else if (state.pendingSacrificeChoice && isLocal) {
    // Resaltamos qué se puede elegir para pagar un costo de Sacrificar.
    const { eligibleType } = state.pendingSacrificeChoice;
    // ETAPA MOTOR 1: el brillo usa la MISMA validación real que el click. Un Encantamiento
    // ya no puede disfrazarse de "artefacto", y un Vehículo tripulado sigue siendo Artefacto.
    const zoneCanContainSacrifice = zone === 'combat' || zone === 'support' || zone === 'land';
    if (zoneCanContainSacrifice && isSacrificeCandidate(itemObj, eligibleType)) isTargetable = true;
  } else if (state.pendingCrew && isLocal && zone === 'combat') {
    // Elegible si está sin girar, o si ya la elegiste (clickearla de nuevo la saca).
    // El propio Vehicle que origina Crew nunca puede pagarse a sí mismo.
    isTargetable = itemObj !== state.pendingCrew.item && (!itemObj.tapped || state.pendingCrew.selected.includes(itemObj));
  }

  const isCrewingSelected = (state.pendingCrew && state.pendingCrew.selected.includes(itemObj)) ? 'crewing-selected' : '';

  if (!isLocal && hasKeyword(itemObj, 'hexproof')) {
    isTargetable = false;
  }
  
  const targetClass = isTargetable ? 'targetable' : '';
  // ENTREGA 23.7: una sola fuente de verdad para las fuentes de maná utilizables.
  // Si el motor aceptaría esta fuente para el costo pendiente, la UI la marca también.
  const isManaPayable = isLocal && !itemObj.tapped &&
    (zone === 'land' || zone === 'support') &&
    canManaSourcePayPendingCost(itemObj, isLocal);
  const manaPayableClass = isManaPayable ? 'mana-payable' : '';

  // Punto 12: acceso separado para habilidades instantáneas. En Combat el click normal puede
  // estar ocupado declarando ataque/bloqueo, así que un pequeño botón ⚡ evita ambigüedad.
  const ownInstantAbility = (isBattlefieldLand ? getEffectiveLandActivatedAbilities(state, itemObj, isLocal) : getActivatedAbilities(card)).some(ab => getActivatedAbilityTiming(ab) === 'instant');
  const grantedInstantAbility = zone === 'combat' && isLocal && (getEquipmentOn(itemObj) || []).some(eq =>
    getGrantedAbilities(eq.card).some(ab => getActivatedAbilityTiming(ab) === 'instant')
  );
  const hasExplicitInstantAbility = ownInstantAbility || grantedInstantAbility;
  
  // --- NUEVA LÓGICA DE COLORES MTG ---
  let bgClass = 'bg-colorless'; // Default para incoloras y artefactos
  
  if (card.type && card.type.toLowerCase().includes('tierra')) {
    bgClass = 'bg-land';
  } else if (card.colors && card.colors.length > 0) {
    if (card.colors.length >= 2) {
      bgClass = 'bg-gold';
    } else {
      const c = card.colors[0].toUpperCase();
      if (c === 'W') bgClass = 'bg-w';
      else if (c === 'U') bgClass = 'bg-u';
      else if (c === 'B') bgClass = 'bg-b';
      else if (c === 'R') bgClass = 'bg-r';
      else if (c === 'G') bgClass = 'bg-g';
    }
  }

  // Agregamos bgClass a la lista de clases
  el.className = `card ${bgClass} ${card.rarity || 'Common'} ${isTapped ? 'tapped' : ''} ${isSick} ${isAttacking} ${isBlocking} ${isSelectedBlocker} ${targetClass} ${isCrewingSelected} ${manaPayableClass}`;

  // 23.13.38 — identidad DOM presentation-only para el Combat Map. Nunca participa del sync.
  el.dataset.cardId = card.id || '';
  if (itemObj?._syncObjectId) el.dataset.syncObjectId = itemObj._syncObjectId;
  if (index !== null && index !== undefined) el.dataset.zoneIndex = String(index);
  el.dataset.zone = zone;
  el.dataset.side = isLocal ? 'local' : 'rival';

  let icon = '🃏';
  for (const key in ICON_MAP) { if (card.name.includes(key)) icon = ICON_MAP[key]; }

  const isBasicLand = card.type.includes('Tierra básica');
  let landSymbolImg = '';
  if (isBasicLand) {
    if (card.type.includes('Planicie')) landSymbolImg = 'planicie.png';
    if (card.type.includes('Agua')) landSymbolImg = 'agua.png';
    if (card.type.includes('Pantano')) landSymbolImg = 'pantano.png';
    if (card.type.includes('Montaña')) landSymbolImg = 'montaña.png';
    if (card.type.includes('Bosque')) landSymbolImg = 'bosque.png';
  }

  // 23.15.3.1 — scope hotfix: este dato se usa después de ambas ramas de render.
  // Debe existir también cuando la carta usa la rama especial de Tierra básica.
  const hasCreatureStats = isCreaturePermanent(itemObj);
  const hasCornerStat = hasCreatureStats || card.type.includes('Planeswalker');

  let formattedTextHTML = '';
  if (isBasicLand && landSymbolImg) {
    const landSymbolUrl = `./assets/images/${landSymbolImg}`;
    // 23.13.17 — una sola capa real. El asset ocupa toda la caja inferior con cover;
    // el PNG puede prepararse con margen/expansión vertical sin que el renderer duplique el
    // mismo dibujo como fondo + foreground (artefacto visual que se notaba especialmente en móvil).
    formattedTextHTML = `<div class="card-text-box basic-land-symbol-box" style="display:flex; justify-content:center; align-items:center; padding:0; position:relative; overflow:hidden;">
        <img class="basic-land-symbol-main" src="${landSymbolUrl}" alt="Símbolo de maná" style="width:100%; height:100%; object-fit:cover; object-position:center;" onerror="this.style.display='none'">
      </div>`;
  } else {
    // 23.15.5.3 — el rules box ya no concatena flavor + texto en bold. Se construye una
    // jerarquía presentation-only: keywords -> reglas/habilidades -> flavor al final.
    const landTransformation = isBattlefieldLand ? describeLandTransformation(state, itemObj, isLocal) : null;
    let rulesTextOverride = null;
    if (landTransformation?.printedAbilitiesSuppressed) {
      const manaOptions = landTransformation.manaAbility?.options || [];
      const manaText = manaOptions.map(m => `{${m}}`).join(' / ');
      rulesTextOverride = manaText
        ? gameText('land.transform.rulesText', { mana:manaText })
        : gameText('land.transform.noAbilities');
    }

    // En criaturas usamos keywords efectivas (Auras/Equipment/buffs); en permanentes que
    // todavía no son criatura —especialmente Vehículos— mostramos sus keywords impresas.
    const effKeywords = hasCreatureStats
      ? getEffectiveKeywords(itemObj)
      : [...(Array.isArray(card.keywords) ? card.keywords : [])];
    const textLayout = buildCardTextLayout(card, {
      effectiveKeywords: effKeywords,
      rulesTextOverride
    });

    const keywordsHTML = textLayout.keywordLabels.length
      ? `<div class="card-keyword-line">${textLayout.keywordLabels.map(escapeCardTextHtml).join(', ')}</div>`
      : '';

    const keywordReminderHTML = textLayout.keywordReminders.map(entry =>
      `<div class="card-keyword-reminder">(${renderInlineGameSymbols(escapeCardTextHtml(entry.text))})</div>`
    ).join('');

    const rulesHTML = textLayout.paragraphs.map(entry => {
      const abilityWord = entry.abilityWord
        ? `<span class="card-ability-word">${escapeCardTextHtml(entry.abilityWord)} — </span>`
        : '';
      const rule = renderInlineGameSymbols(escapeCardTextHtml(entry.text));
      const reminder = entry.reminder
        ? ` <span class="card-reminder-text">(${renderInlineGameSymbols(escapeCardTextHtml(entry.reminder))})</span>`
        : '';
      const kindClass = entry.kind === 'mode-option' ? ' card-mode-option' : entry.kind === 'mode-header' ? ' card-mode-header' : '';
      return `<div class="card-rule-paragraph${kindClass}">${abilityWord}${rule}${reminder}</div>`;
    }).join('');

    const flavorHTML = textLayout.flavorText
      ? `<div class="card-flavor-text">${escapeCardTextHtml(textLayout.flavorText)}</div>`
      : '';

    // El fit considera reminder text y separación real en párrafos. No altera el contenido;
    // sólo reduce tipografía cuando hace falta para conservar la caja fija de la carta.
    const reminderLen = textLayout.paragraphs.reduce((n, p) => n + (p.reminder || '').length, 0)
      + textLayout.keywordReminders.reduce((n, p) => n + p.text.length, 0);
    const totalTextLen = textLayout.flavorText.length
      + textLayout.paragraphs.reduce((n, p) => n + p.text.length + (p.abilityWord || '').length, 0)
      + textLayout.keywordLabels.join(', ').length
      + Math.round(reminderLen * 0.72)
      + (textLayout.paragraphs.length * 14);
    const textBoxScale = fitScaleByLength(totalTextLen, 115);

    formattedTextHTML = `<div class="card-text-box card-text-box-structured${hasCornerStat ? ' card-text-box-stat-reserve' : ''}" data-auto-text-cqw="${(6 * textBoxScale).toFixed(2)}" style="--card-text-effective-size:${(6 * textBoxScale).toFixed(2)}cqw; font-size:clamp(3px, var(--card-text-effective-size), 26px);">${keywordsHTML}${keywordReminderHTML}<div class="card-rules-list">${rulesHTML}</div>${flavorHTML}</div>`;
  }

  const effPower = hasCreatureStats ? getEffectivePower(itemObj) : undefined;
  const effToughness = hasCreatureStats ? getEffectiveToughness(itemObj) : undefined;
  const basePowerForUi = itemObj.animatedBasePower ?? card.power;
  const baseToughnessForUi = itemObj.animatedBaseToughness ?? card.toughness;
  const isBuffed = effPower !== undefined && (effPower !== basePowerForUi || effToughness !== baseToughnessForUi);

  let ptText = hasCreatureStats ? `${effPower}/${effToughness}` : '';
  if (itemObj.damageTaken > 0 && hasCreatureStats) {
    ptText = `${effPower}/<span style="color:#e74c3c;">${effToughness - itemObj.damageTaken}</span>`;
  } else if (isBuffed) {
    ptText = `<span style="color:#27ae60;">${effPower}/${effToughness}</span>`;
  }

  // Lealtad de un Planeswalker: mismo cuadrito que Poder/Resistencia, pero con su propio
  // color (violeta, como en las cartas reales) para diferenciarlo de un vistazo.
  const isPlaneswalker = card.type.includes('Planeswalker');
  const effectiveLandType = isBattlefieldLand ? getEffectiveLandTypeLine(state, itemObj, isLocal) : card.type;
  const displayType = itemObj.isAnimatedLand ? `${effectiveLandType} · Criatura` : effectiveLandType;
  const loyaltyText = isPlaneswalker ? `${itemObj.loyalty}` : '';

  const attachedAuras = itemObj.auras || [];
  const attachedEquipment = (zone === 'combat' && card.power !== undefined) ? getEquipmentOn(itemObj) : [];
  const staticMods = (zone === 'combat' && card.power !== undefined) ? getStaticTeamModifiers(itemObj) : [];
  const tempMods = (zone === 'combat' && card.power !== undefined) ? (itemObj.tempEffects || []) : [];
  const counters = ['combat','support','land','planeswalker'].includes(zone) ? itemObj.counters : null;

  // Describe en criollo qué hace cada modificador (no solo su nombre), para el tooltip
  // de abajo — "Facón de Plata: {T}: 2 de daño", "Poncho del Paisano: +1/+1",
  // "Fuerza de la Manada: +1/+1 (mientras esté en el campo)", "Fuerza de Toro: +3/+3 (hasta fin de turno)".
  const KEYWORD_LABELS_SHORT = {
    flying: 'Vuela', trample: 'Arrolla', hexproof: 'Intocable', haste: 'Prisa',
    menace: 'Amenaza', vigilance: 'Vigilancia', reach: 'Alcance', defender: 'Defensora',
    lifelink: 'Vínculo vital', deathtouch: 'Toque mortal', firststrike: 'Primer golpe',
    doublestrike: 'Doble golpe', indestructible: 'Indestructible',
    protection_W: 'Protección de Blanco', protection_U: 'Protección de Azul', protection_B: 'Protección de Negro',
    protection_R: 'Protección de Rojo', protection_G: 'Protección de Verde'
  };
  const shortLabelFor = (k) => {
    if (k.startsWith('ward_')) return `Ward ${k.split('_')[1]}`;
    return KEYWORD_LABELS_SHORT[k] || k;
  };
  const describeStats = (stats) => {
    if (!stats) return '';
    const p = stats.powerMod !== undefined ? stats.powerMod : (stats.cantidad ? (stats.signo === '-' ? -stats.cantidad : stats.cantidad) : 0);
    const t = stats.toughnessMod !== undefined ? stats.toughnessMod : (stats.cantidad ? (stats.signo === '-' ? -stats.cantidad : stats.cantidad) : 0);
    if (p === 0 && t === 0) return '';
    return `${p >= 0 ? '+' : ''}${p}/${t >= 0 ? '+' : ''}${t}`;
  };
  const describeAura = (auraCard) => {
    const eff = auraCard.auraEffect;
    if (!eff) return 'Adjunta';
    const parts = [];
    const statsText = describeStats(eff.stats);
    if (statsText) parts.push(statsText);
    if (eff.keywords && eff.keywords.length > 0) parts.push(eff.keywords.map(shortLabelFor).join(', '));
    return parts.join(' · ') || 'Adjunta';
  };
  const describeEquipment = (equipItem) => {
    const eqCard = equipItem.card;
    const eq = eqCard.equipment;
    const parts = [];
    const statsText = eq ? describeStats(eq.grantedStats) : '';
    if (statsText) parts.push(statsText);
    if (eq && eq.grantedKeywords && eq.grantedKeywords.length > 0) parts.push(eq.grantedKeywords.map(shortLabelFor).join(', '));
    const grantedAbilities = getGrantedAbilities(eqCard);
    grantedAbilities.forEach(ab => {
      const cost = ab.crewCost !== undefined ? `Tripular ${ab.crewCost}` : (ab.cost || '{0}');
      parts.push(`${cost}: ${ab.effect?.type === 'damage' ? `${ab.effect.amount} de daño` : (ab.name || ab.text || ab.effect?.type || 'habilidad')}`);
    });
    return parts.join(' · ') || 'Equipado';
  };
  const describeStaticMod = (m) => {
    if (m.type === 'team_buff') return describeStats({ powerMod: m.powerMod, toughnessMod: m.toughnessMod });
    if (m.type === 'team_keyword') return KEYWORD_LABELS_SHORT[m.keyword] || m.keyword;
    return '';
  };
  const describeTempMod = (t) => {
    const parts = [];
    const statsText = describeStats(t);
    if (statsText) parts.push(statsText);
    if (t.keywords && t.keywords.length > 0) parts.push(t.keywords.map(shortLabelFor).join(', '));
    return parts.join(' · ');
  };

  // Un solo badge combinado (evita amontonar iconos distintos en las esquinas de una
  // carta chica). Muestra los iconos de lo que esté activo, y el tooltip lista cada
  // modificador por separado con su propio icono adelante.
  const counterEntries = counters ? listCounters(itemObj) : [];
  const counterLine = counterEntries.length > 0
    ? [`🔵 Contadores: ${counterEntries.map(c => `${c.label} ×${c.amount}`).join(' · ')}`]
    : [];
  const modifierLines = [
    ...attachedAuras.map(a => `✨ ${a.name}: ${describeAura(a)}`),
    ...attachedEquipment.map(e => `⚔️ ${e.card.name}: ${describeEquipment(e)}`),
    ...staticMods.map(m => `🌐 ${m.sourceName}: ${describeStaticMod(m)} (mientras esté en el campo)`),
    ...tempMods.map(t => `⏳ ${t.name || 'Efecto'}: ${describeTempMod(t)} (hasta fin de turno)`)
  ];
  const modifierIcons = [
    attachedAuras.length > 0 ? '✨' : '',
    attachedEquipment.length > 0 ? '⚔️' : '',
    staticMods.length > 0 ? '🌐' : '',
    tempMods.length > 0 ? '⏳' : ''
  ].join('');

  const counterTooltipText = counterTooltipLines(itemObj).join(' · ');
  const counterBadgeHTML = counterEntries.length > 0
    ? `<div class="counter-badge" title="${escapeHtml(counterTooltipText)}" aria-label="${escapeHtml(counterTooltipText)}">${compactCounterText(itemObj)}</div>`
    : '';

  const auraTooltipText = modifierLines.join(' · ');
  const auraBadgeHTML = modifierLines.length > 0
    ? `<div class="aura-badge" title="${escapeHtml(auraTooltipText)}" aria-label="${escapeHtml(auraTooltipText)}">${modifierIcons}</div>`
    : '';

  // 23.16.4 — indicador presentation-only de TDFC. En Battlefield muestra la cara
  // física actual; fuera de Battlefield el objeto canónico vuelve a ser siempre la frontal.
  const dfcSpec = normalizeTransformSpec(itemObj);
  const dfcFace = dfcSpec ? currentTransformFace(itemObj) : null;
  const dfcBackName = dfcSpec?.backFace?.name || 'cara posterior';
  const dfcBadgeHTML = dfcSpec
    // 23.17.5.2 — title nativo a propósito: el badge vive sobre un área de arte recortada
    // y un ::after interno siempre puede ser clippeado por overflow. El tooltip del browser
    // escapa de ese stacking context y nunca queda cortado por la carta.
    ? `<div class="dfc-face-badge" title="${(dfcFace === 'back' ? `Cara posterior · ${card.name}` : `Transforma en ${dfcBackName}`).replace(/"/g, '&quot;')}" aria-label="${(dfcFace === 'back' ? `Cara posterior · ${card.name}` : `Transforma en ${dfcBackName}`).replace(/"/g, '&quot;')}">↻ ${dfcFace === 'back' ? 'B' : 'A'}</div>`
    : '';
  const chosenCreatureType=getChosenCreatureType(itemObj);
  const typalTooltipText = chosenCreatureType ? `Tipo de criatura elegido: ${String(chosenCreatureType)}` : '';
  const typalChoiceBadgeHTML=chosenCreatureType
    ? `<div class="typal-choice-badge" title="${escapeHtml(typalTooltipText)}" aria-label="${escapeHtml(typalTooltipText)}">🧬 ${String(chosenCreatureType).replace(/</g,'&lt;')}</div>`
    : '';

  const sagaState = isSagaCard(card) ? sagaUiState(itemObj) : null;
  const sagaTooltipText = sagaState && sagaState.chapters.length > 0
    ? `Lore ${sagaState.lore}/${sagaState.finalChapter} · ${sagaState.chapters.map(ch => `${ch.roman}: ${ch.label || ''}`.trim()).join(' · ')}`
    : '';
  const sagaChapterHTML = sagaState && sagaState.chapters.length > 0
    ? `<div class="saga-chapter-track" title="${escapeHtml(sagaTooltipText)}" aria-label="${escapeHtml(sagaTooltipText)}">${sagaState.chapters.map(ch => `<span class="saga-chapter-pill${sagaState.lore >= ch.number ? ' reached' : ''}${sagaState.lore === ch.number ? ' current' : ''}"><span class="saga-chapter-pill-label">${ch.roman}</span></span>`).join('')}</div>`
    : '';

  // 23.12.0 — las vistas catálogo/deckbuilder pueden mostrar cientos de cartas. Sus
  // imágenes no deben salir todas juntas contra el hosting: el navegador sólo pide las que
  // se acercan al viewport y las decodifica fuera del camino crítico. En el tablero real
  // mantenemos carga inmediata para no introducir latencia durante una partida.
  const browserImageAttrs = zone === 'encyclopedia'
    ? ' loading="lazy" decoding="async" fetchpriority="low"'
    : ' decoding="async"';

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-header"><span class="card-title" style="font-size: clamp(4px, ${(8 * fitScale(card.name, 13, 0.3)).toFixed(2)}cqw, 40px);">${card.name}</span><span class="card-cost">${renderManaSymbols(card.manaCost)}</span></div>
      <div class="card-art" style="position: relative; overflow: hidden;">
        <div class="card-art-fallback" aria-hidden="true">${icon}</div>
        ${card.image ? `<img class="card-art-image" src="./assets/images/cards/${card.image}" alt="${card.name}"${browserImageAttrs} style="position: absolute; width: 120%; height: 120%; object-fit: cover; object-position: center top; z-index: 2;" onerror="this.style.display='none'">` : ''}
        ${counterBadgeHTML}
        ${sagaChapterHTML}
        ${dfcBadgeHTML}
        ${typalChoiceBadgeHTML}
      </div>
      <div class="card-type-line"><span class="card-type-text" style="font-size: clamp(4px, ${(7 * fitScale(displayType, 16, 0.3)).toFixed(2)}cqw, 30px);">${displayType}</span><span class="rarity-icon">●</span></div>
      ${formattedTextHTML}
      ${hasCreatureStats ? `<div class="card-pt">${ptText}</div>` : ''}
      ${isPlaneswalker ? `<div class="card-pt card-loyalty">${loyaltyText}</div>` : ''}
      ${auraBadgeHTML}
    </div>
  `;

  // 23.13.23 — encuadre de arte NO destructivo. Sin layout personalizado no agrega ningún
  // transform y conserva pixel-a-pixel el renderer histórico. La primera imagen visible
  // dispara una carga lazy compartida de gameConfig/artLayouts; nunca bloquea createCardElement.
  const cardArtImg = el.querySelector('.card-art-image');
  const cardArtLayoutId = card?.isToken ? tokenArtLayoutId(card.image, card.name) : transformFaceLayoutId(itemObj);
  if (cardArtImg && cardArtLayoutId) registerCardArtImage(cardArtImg, cardArtLayoutId);

  // 23.15.10 — ajuste presentation-only del texto persistido por card.id. La carga
  // remota es lazy y el contenido de reglas/flavor sigue perteneciendo a los JSON.
  const cardTextBox = el.querySelector('.card-text-box');
  const cardTextLayoutId = transformFaceLayoutId(itemObj);
  if (cardTextBox && cardTextLayoutId) registerCardTextBox(cardTextBox, cardTextLayoutId);

  // El botón separado sólo hace falta en Combat, donde el click normal puede significar
  // declarar atacante/bloqueador. Support y Tierras ya tienen un click inequívoco y el
  // group renderer elige la copia lista correcta si hay varias apiladas visualmente.
  const instantButtonAllowedZone = zone === 'combat';
  if (isLocal && instantButtonAllowedZone && hasExplicitInstantAbility && state.priorityPlayer === 'local' && !state.gameOver) {
    // La acción instantánea sigue anclada a la carta, pero visualmente queda fuera del
    // contenido: pequeña, centrada y debajo de todo para no tapar texto/PT.
    el.classList.add('card-with-bottom-fab');
    const instantBtn = document.createElement('button');
    instantBtn.type = 'button';
    instantBtn.textContent = '⚡';
    instantBtn.title = gameText('ability.instant.button');
    instantBtn.setAttribute('aria-label', gameText('ability.instant.aria', { card: card.name }));
    instantBtn.classList.add('card-bottom-fab', 'instant-ability-fab');
    instantBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handleInstantActivatedAbilityClick(itemObj, true, index, zone);
    });
    el.appendChild(instantBtn);
  }


  // 23.16.3 — Suspend es una acción especial desde la mano. Tiene un control propio porque
  // puede ser legal aunque la carta no pueda castearse normalmente (por coste/targets), y no
  // usa la Stack. Usa el mismo tratamiento visual mínimo del botón ⚡: centrado abajo y fuera
  // del contenido de la carta para no tapar texto ni crecer con hover interno.
  if (zone === 'hand' && isLocal && hasSuspend(card) && !state.gameOver) {
    const spec=normalizeSuspendSpec(card);
    const suspendBtn=document.createElement('button');
    suspendBtn.type='button';
    suspendBtn.textContent='⏳';
    suspendBtn.title=`Suspender ${spec?.time || ''} — ${spec?.cost || '{0}'}`;
    suspendBtn.setAttribute('aria-label', `Suspender ${card.name} por ${spec?.time || 0} Tiempo pagando ${spec?.cost || '{0}'}`);
    suspendBtn.classList.add('card-bottom-fab', 'suspend-action-fab');
    suspendBtn.disabled=!canSuspendCardFromHand(card);
    suspendBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();suspendCardFromHand(index);});
    el.classList.add('card-with-bottom-fab');
    el.appendChild(suspendBtn);
  }

  if (customClick) {
    el.addEventListener('click', customClick);
  } else {
// Antes acá se reimplementaba una versión más estricta de "¿puedo jugar esto?" (solo tu
// fase principal, o responder algo que ya está en la pila), lo que dejaba a los instantáneos
// sin poder jugarse fuera de esos dos casos — por ejemplo, como truco de combate en el turno
// del rival con la pila vacía. canPlayCard ya tiene la regla correcta (cualquier instantáneo
// se puede jugar siempre que tengas prioridad), así que la consultamos directo en vez de
// duplicar la lógica acá.
// Agregamos state.isDiscarding para que las cartas respondan al clic en la fase de limpieza
    if (zone === 'hand' && isLocal && (canPlayCard(card) || state.isDiscarding) && !state.gameOver) {
      el.addEventListener('click', async () => {
        if (state.isDiscarding) await handleDiscardClick(index);
        else playCard(index);
      });
    } else if (zone === 'land' && !state.gameOver) {
      el.addEventListener('click', () => {
        if (state.pendingTargetCard || state.pendingMultiTargetChoice || state.pendingResolvedEffectTargetChoice) {
          handleLandTargetClick(itemObj, isLocal, index);
          return;
        }
        if (isLocal) tapLocalLand(itemObj);
      });
    } else if (zone === 'combat' && !state.gameOver) {
      el.addEventListener('click', () => handleCombatClick(itemObj, isLocal, index));
    } else if (zone === 'support' && isLocal && !state.gameOver && (
      (state.activePlayer === 'local' && state.phase.startsWith('main')) ||
      (state.priorityPlayer === 'local' && hasExplicitInstantAbility) ||
      (canActivateLocalManaAbility(itemObj))
    )) {
      // HOTFIX 1.1 — fuentes de maná de Soporte (ej. Fajo de Dólares Blue) también deben
      // poder clickearse mientras pagás un instantáneo fuera de tu propia fase principal.
      // El timing de las demás habilidades de Soporte sigue exactamente igual que antes.
      el.addEventListener('click', () => handleSupportClick(itemObj, isLocal, index));
    } else if (zone === 'planeswalker' && !state.gameOver) {
      // Sin restricción de fase acá: clickear tu PROPIO Planeswalker (para abrir el menú de
      // habilidades) y clickear uno RIVAL (para completar una redirección de ataque en
      // combate) necesitan poder pasar en momentos distintos del turno — cada caso valida
      // su propio momento correcto adentro de handlePlaneswalkerClick.
      el.addEventListener('click', () => handlePlaneswalkerClick(itemObj, isLocal, index));
    }
  }

  return el;
}

const CARD_ASPECT = 5 / 7;
const CARD_ASPECT_INV = 7 / 5; // cuánto más ancha es una carta girada, respecto de una vertical
function getIdealCardHeightPx() { return window.innerHeight * 0.175; }
export function sizeCardsInRow(rowEl) {
  const cards = rowEl.querySelectorAll('.card');
  const n = cards.length;
  if (n === 0) return;
  const rowStyles = getComputedStyle(rowEl);
  const gap = parseFloat(rowStyles.columnGap) || parseFloat(rowStyles.gap) || 6;
  const availableWidth = rowEl.clientWidth - 6;
  const availableHeight = rowEl.clientHeight - 6;

  // Las giradas ocupan 7/5 del ancho de una vertical (intercambian sus medidas). Si no las
  // contamos aparte acá, el "cuántas entran" queda mal apenas hay una girada en la fila —
  // esto es lo que hacía que las cartas se empezaran a pisar entre sí.
  let tappedCount = 0;
  cards.forEach(c => { if (c.classList.contains('tapped')) tappedCount++; });
  const untappedCount = n - tappedCount;
  const effectiveUnits = (tappedCount * CARD_ASPECT_INV) + untappedCount;

  let cardHeight = Math.min(getIdealCardHeightPx(), availableHeight);
  let cardWidth = cardHeight * CARD_ASPECT;
  const widthIfFit = (availableWidth - (gap * Math.max(0, n - 1))) / effectiveUnits;
  if (widthIfFit < cardWidth) { cardWidth = Math.max(widthIfFit, 24); cardHeight = cardWidth / CARD_ASPECT; }

  cards.forEach(c => {
    const inner = c.querySelector('.card-inner');
    if (c.classList.contains('tapped')) {
      // Girada: el layout tiene que reservar el rectángulo APAISADO (ancho/alto
      // intercambiados) — es el footprint real que ocupa en pantalla una vez rotada.
      // .card-inner mantiene las medidas ORIGINALES (verticales) y es quien rota
      // adentro (ver CSS), centrado, para que nunca invada a sus vecinas.
      c.style.width = `${cardHeight}px`;
      c.style.height = `${cardWidth}px`;
      if (inner) {
        inner.style.width = `${cardWidth}px`;
        inner.style.height = `${cardHeight}px`;
      }
    } else {
      c.style.width = `${cardWidth}px`;
      c.style.height = `${cardHeight}px`;
      if (inner) {
        inner.style.width = '';
        inner.style.height = '';
      }
    }
  });
}

export function sizeAllRows() {
  [els.localHand, els.rivalHand, els.localLands, els.rivalLands, els.localCombat, els.rivalCombat, els.localSupport, els.rivalSupport, els.localPlaneswalkers, els.rivalPlaneswalkers].forEach(sizeCardsInRow);
}

// --- MODAL DE SELECCIÓN DE MAZO INICIAL ---
// Se muestra apenas carga la página, antes de que arranque la partida. 100% autocontenido:
// inyecta su propio <style> y elementos, no depende de nada que ya exista en el HTML.

const COLOR_INFO = {
  W: { name: 'Blanco', file: 'blanco.png', bg: '#d8c9a0', desc: 'Orden y sacrificio. Vidas que se recuperan, ejercitos que se multiplican, reglas que doblegan al rival.' },
  U: { name: 'Azul',   file: 'azul.png',   bg: '#3b6ea5', desc: 'Conocimiento y control. Cartas de sobra, hechizos que se esfuman, criaturas que planean por encima de todo.' },
  B: { name: 'Negro',  file: 'negro.png',  bg: '#4a3a5c', desc: 'Ambicion sin limites. La muerte no es el final: es una herramienta mas.' },
  R: { name: 'Rojo',   file: 'rojo.png',   bg: '#a5423b', desc: 'Fuego y velocidad. Golpeas primero, golpeas fuerte, y no pedis permiso.' },
  G: { name: 'Verde',  file: 'verde.png',  bg: '#437a45', desc: 'Fuerza bruta de la naturaleza. Criaturas gigantes, mana de sobra, y pelea directa cuando hace falta.' },
};

const PAIR_INFO = {
  WU: { title: 'Control Celeste',      desc: 'Contencion total: contrarrestas lo que no podes permitir, y volas por encima del resto.' },
  UB: { title: 'Sombra y Sigilo',      desc: 'Cada respuesta tuya es una trampa. El rival nunca sabe que le espera.' },
  BR: { title: 'Caos Sangriento',      desc: 'Agresivo y sin piedad: sacrificas lo que haga falta para ganar mas rapido de lo que el rival puede reaccionar.' },
  RG: { title: 'Furia Salvaje',        desc: 'Criaturas enormes que pegan fuerte y rapido. Sin sutilezas.' },
  GW: { title: 'Comunidad y Vida',     desc: 'Un ejercito que crece turno a turno, respaldado por vida de sobra.' },
  WB: { title: 'Drenaje Implacable',   desc: 'Cada punto de vida que le sacas al rival es un punto que ganas vos.' },
  UR: { title: 'Tormenta de Hechizos', desc: 'Velocidad mental pura: respuestas instantaneas y quema directa.' },
  BG: { title: 'Ciclo Eterno',         desc: 'Nada se pierde del todo. Todo vuelve del cementerio para pelear de nuevo.' },
  RW: { title: 'Ofensiva Total',       desc: 'Atacas rapido, atacas en masa, y no le das tiempo al rival de organizarse.' },
  GU: { title: 'Evolucion Constante',  desc: 'Mana de sobra y criaturas que crecen turno tras turno hasta ser imparables.' },
};

function injectDeckSelectionStyles() {
  if (document.getElementById('deck-select-styles')) return;
  const style = document.createElement('style');
  style.id = 'deck-select-styles';
  style.textContent = `
    #deck-select-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; align-items: center; justify-content: center;
    }
    .deck-select-panel {
      max-width: 920px; width: 92%; max-height: 90vh; overflow-y: auto;
      background: linear-gradient(180deg, rgba(18,25,15,0.97), rgba(11,19,14,0.99));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 16px;
      padding: 32px 36px;
      box-shadow: 0 0 60px rgba(212,175,55,0.15), 0 20px 60px rgba(0,0,0,0.6);
    }
    .deck-select-title {
      text-align: center; font-size: 26px; font-weight: 700;
      color: #f0e0b0; letter-spacing: 0.5px; margin-bottom: 4px;
      text-shadow: 0 0 20px rgba(212,175,55,0.4);
    }
    .deck-select-subtitle {
      text-align: center; font-size: 14px; color: #a89bb5; margin-bottom: 28px;
    }
    .deck-select-mono-row {
      display: flex; justify-content: center; gap: 22px; margin-bottom: 32px; flex-wrap: wrap;
    }
    .deck-select-mono-btn {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      background: none; border: none; cursor: pointer; padding: 8px;
      transition: transform 0.15s ease;
    }
    .deck-select-mono-btn:hover { transform: translateY(-4px) scale(1.06); }
    .deck-select-circle-big {
      width: 76px; height: 76px; border-radius: 50%;
      border: 2px solid rgba(212,175,55,0.5);
      background-size: cover; background-position: center;
      box-shadow: 0 4px 18px rgba(0,0,0,0.5);
    }
    .deck-select-mono-btn:hover .deck-select-circle-big {
      border-color: #f0e0b0; box-shadow: 0 4px 24px rgba(212,175,55,0.5);
    }
    .deck-select-mono-label { color: #e8ddc8; font-size: 14px; font-weight: 600; }
    .deck-select-divider {
      display: flex; align-items: center; gap: 12px; margin: 8px 0 20px 0;
      color: #6e6478; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px;
    }
    .deck-select-divider::before, .deck-select-divider::after {
      content: ''; flex: 1; height: 1px; background: rgba(212,175,55,0.25);
    }
    .deck-select-pairs-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;
    }
    .deck-select-pair-btn {
      display: flex; align-items: center; gap: 12px; text-align: left;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(212,175,55,0.18);
      border-radius: 10px; padding: 10px 14px; cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .deck-select-pair-btn:hover {
      background: rgba(212,175,55,0.08); border-color: rgba(212,175,55,0.55);
      transform: translateY(-2px);
    }
    .deck-select-pair-icons { display: flex; flex-shrink: 0; }
    .deck-select-circle-small {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1.5px solid rgba(240,224,176,0.6);
      background-size: cover; background-position: center;
    }
    .deck-select-circle-small + .deck-select-circle-small { margin-left: -10px; }
    .deck-select-pair-text { flex: 1; }
    .deck-select-pair-title { color: #f0e0b0; font-size: 14px; font-weight: 700; margin-bottom: 2px; }
    .deck-select-pair-desc { color: #b8adc4; font-size: 12px; line-height: 1.35; }
  `;
  document.head.appendChild(style);
}

function circleStyle(colorKey) {
  const info = COLOR_INFO[colorKey];
  return `background-color:${info.bg}; background-image:url('./assets/images/ui/${info.file}');`;
}

function injectMainMenuStyles() {
  if (document.getElementById('main-menu-styles')) return;
  const style = document.createElement('style');
  style.id = 'main-menu-styles';
  style.textContent = `
    #main-menu-overlay, #options-menu-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background-color: #0b130e; /* fallback si menu.png todavía no está subida */
      background-image:
        linear-gradient(180deg, rgba(11,19,14,0.15) 0%, rgba(11,19,14,0.8) 100%),
        url('./assets/images/ui/menu.png');
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
    }
    .main-menu-logo-wrap {
      position: absolute; top: 5vh; left: 0; right: 0;
      display: flex; justify-content: center;
      /* BUG ENCONTRADO Y ARREGLADO: este div ocupa TODO el ancho de la pantalla (left:0;
         right:0) aunque visualmente solo se vea el logo centrado — el resto es "aire"
         invisible, pero seguía interceptando clicks. Como en el HTML viene DESPUÉS de
         .main-menu-account, pintaba ENCIMA y tapaba el botón de login/logout salvo en el
         borde de arriba, donde todavía no llegaba a superponerse. Es puramente decorativo,
         nunca necesita recibir clicks. */
      pointer-events: none;
    }
    .main-menu-logo {
      max-width: 55vw; max-height: 32vh; width: auto; height: auto;
      filter: drop-shadow(0 8px 30px rgba(0,0,0,0.6));
    }
.main-menu-buttons {
    position: absolute;
    left: 5vw;
    bottom: 8vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 230px;
}
.main-menu-btn {
    display: block;
    width: 100%;
    background: linear-gradient(180deg, rgba(18,25,15,0.92), rgba(11,19,14,0.96));
    border: 2px solid var(--gold, #d4af37);
    border-radius: 10px;
    color: #f0e0b0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 7px 10px;
    text-align: left;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
    .main-menu-btn:hover {
      transform: translateX(6px);
      background: linear-gradient(180deg, rgba(212,175,55,0.18), rgba(11,19,14,0.96));
      box-shadow: 0 4px 22px rgba(212,175,55,0.35);
    }
.main-menu-btn-primary {
    border-color: #f0e0b0;
    font-size: 18px;
    background: linear-gradient(180deg, rgba(212,175,55,0.25), rgba(11,19,14,0.96));
}
    .main-menu-btn-primary:hover { box-shadow: 0 4px 26px rgba(212,175,55,0.55); }
    .main-menu-btn-disabled { opacity: 0.45; cursor: not-allowed; position: relative; }
    .main-menu-btn-disabled:hover {
      transform: none;
      background: linear-gradient(180deg, rgba(18,25,15,0.92), rgba(11,19,14,0.96));
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .main-menu-btn-disabled:hover::after {
      content: attr(data-tooltip);
      position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%);
      background: rgba(0,0,0,0.92); color: #f0e0b0;
      padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap;
      border: 1px solid var(--gold, #d4af37); pointer-events: none; z-index: 10;
    }
    .main-menu-account { position: absolute; top: 24px; right: 32px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .main-menu-login-btn {
      display: flex; align-items: center; gap: 8px;
      background: linear-gradient(180deg, rgba(18,25,15,0.92), rgba(11,19,14,0.96));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 10px;
      color: #f0e0b0; font-size: 14px; font-weight: 700;
      padding: 9px 16px; cursor: pointer;
      transition: background 0.15s ease, box-shadow 0.15s ease;
    }
    .main-menu-login-btn:hover { background: rgba(212,175,55,0.18); box-shadow: 0 4px 18px rgba(212,175,55,0.3); }
    .main-menu-account-info {
      display: flex; align-items: center; gap: 10px;
      background: rgba(11,19,14,0.75);
      border: 2px solid var(--gold, #d4af37);
      border-radius: 10px;
      padding: 6px 14px 6px 6px;
    }
    .main-menu-account-photo {
      width: 34px; height: 34px; border-radius: 50%;
      object-fit: cover; border: 1.5px solid var(--gold, #d4af37);
      background: #222; flex-shrink: 0;
    }
    .main-menu-account-name {
      color: #f0e0b0; font-size: 13px; font-weight: 700; max-width: 160px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .main-menu-account-points {
      color: #d4af37; font-size: 11px; font-weight: 600; margin: 1px 0 2px;
      display: flex; align-items: center; gap: 4px;
    }
    .coin-icon, .ficha-icon {
      width: 3em; height: 3em; object-fit: contain; vertical-align: middle; flex-shrink: 0;
    }
    .main-menu-logout-btn {
      background: none; border: none; color: #b8adc4; font-size: 11px;
      cursor: pointer; text-decoration: underline; padding: 0; display: block;
    }
    .main-menu-logout-btn:hover { color: #f0e0b0; }
    .main-menu-rename-btn { border:0; background:none; padding:0; color:#d6bd69; font-size:11px; cursor:pointer; text-align:left; }
    .main-menu-rename-btn:hover { color:#f2d77c; text-decoration:underline; }
    .main-menu-rename-btn:disabled { color:#756f62; cursor:not-allowed; text-decoration:none; }
    .main-menu-account-error { color: #e07a6b; font-size: 12px; max-width: 260px; text-align: right; }
.main-menu-news {
    position: absolute;
    bottom: 8vh;
    right: 32px;
    width: 350px;
    max-height: 220px;
    background: rgba(11,19,14,0.85);
    border: 2px solid var(--gold);
    border-radius: 12px 0 0 12px;
    padding: 12px 14px;
    overflow-y: auto;
    z-index: 5;
}
    .main-menu-news-title {
      color: #f0e0b0; font-size: 13px; font-weight: 700; margin-bottom: 8px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .main-menu-news-item { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .main-menu-news-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .main-menu-news-date { color: #8a9a8e; font-size: 10px; margin-bottom: 2px; }
    .main-menu-news-text { color: #cfe0d4; font-size: 12px; line-height: 1.4; white-space: pre-wrap; }
    .main-menu-news-empty { color: #8a9a8e; font-size: 12px; font-style: italic; }
    .main-menu-admin-btn {
      background: linear-gradient(180deg, rgba(120,60,180,0.28), rgba(11,19,14,0.96));
      border: 2px solid #b06ad4; border-radius: 8px;
      color: #e8d4f5; font-size: 12px; font-weight: 700;
      padding: 6px 14px; cursor: pointer; transition: box-shadow 0.15s ease;
    }
    .main-menu-admin-btn:hover { box-shadow: 0 4px 16px rgba(176,106,212,0.4); }
    #options-menu-overlay { display: flex; align-items: center; justify-content: center; }
    .options-menu-panel {
      max-width: 520px; width: 92%;
      background: linear-gradient(180deg, rgba(18,25,15,0.97), rgba(11,19,14,0.99));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 16px;
      padding: 32px 36px;
      box-shadow: 0 0 60px rgba(212,175,55,0.15), 0 20px 60px rgba(0,0,0,0.6);
    }
    .options-menu-title {
      text-align: center; font-size: 24px; font-weight: 700;
      color: #f0e0b0; margin-bottom: 24px;
      text-shadow: 0 0 20px rgba(212,175,55,0.4);
    }
    .options-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 4px;
      border-bottom: 1px solid rgba(212,175,55,0.15);
    }
    .options-row:last-of-type { border-bottom: none; }
    .options-label { color: #e8ddc8; font-size: 15px; }
    .options-toggle-btn {
      background: rgba(255,255,255,0.05);
      border: 1.5px solid rgba(212,175,55,0.4);
      border-radius: 8px;
      color: #f0e0b0;
      font-size: 14px; font-weight: 600;
      padding: 7px 16px;
      cursor: pointer;
      min-width: 90px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .options-toggle-btn:hover { background: rgba(212,175,55,0.15); border-color: #f0e0b0; }
    .options-section-title {
      color: #d4af37; font-size: 11px; font-weight: 800; letter-spacing: 0.9px;
      text-transform: uppercase; margin-top: 18px; padding: 0 4px 5px;
    }
    .options-audio-row { gap: 18px; }
    .options-audio-controls { display:flex; align-items:center; justify-content:flex-end; gap:10px; min-width: 310px; }
    .options-volume-slider { width: 150px; accent-color: #d4af37; cursor: pointer; }
    .options-volume-value { width: 42px; text-align:right; color:#cfe0d4; font-size:12px; font-variant-numeric: tabular-nums; }
    .main-menu-music-btn {
      flex:0 0 34px; width:34px; height:30px; min-width:34px; padding:0; margin:0; align-self:auto;
      border: 1px solid rgba(212,175,55,0.45); border-radius: 8px;
      background: rgba(11,19,14,0.82); color:#f0e0b0; cursor:pointer;
      display:inline-flex; align-items:center; justify-content:center;
      font-size: 15px; line-height: 1; transition: background .15s ease, border-color .15s ease, opacity .15s ease;
    }
    .main-menu-music-btn:hover { background: rgba(212,175,55,0.14); border-color:#f0e0b0; }
    .main-menu-music-btn.is-muted { opacity: .62; }
    @media (max-width: 620px) {
      .options-menu-panel { padding: 24px 18px; }
      .options-audio-row { align-items:flex-start; flex-direction:column; gap:8px; }
      .options-audio-controls { width:100%; min-width:0; justify-content:space-between; }
      .options-volume-slider { flex:1; min-width: 100px; }
    }
    .options-row-disabled .options-label { opacity: 0.5; }
    .options-row-disabled .options-toggle-btn { opacity: 0.45; cursor: not-allowed; position: relative; }
    .options-row-disabled .options-toggle-btn:hover {
      background: rgba(255,255,255,0.05); border-color: rgba(212,175,55,0.4);
    }
    .options-row-disabled .options-toggle-btn:hover::after {
      content: attr(data-tooltip);
      position: absolute; right: 0; top: 100%; margin-top: 6px;
      background: rgba(0,0,0,0.92); color: #f0e0b0;
      padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap;
      border: 1px solid var(--gold, #d4af37); pointer-events: none; z-index: 10;
    }
    .options-danger-zone {
      margin-top: 26px; padding-top: 18px; border-top: 1px solid rgba(224,122,107,0.3);
    }
    .options-danger-title {
      color: #e07a6b; font-size: 12px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 10px;
    }
    .options-danger-btn {
      background: transparent; border: 1.5px solid #6e3a33; border-radius: 8px;
      color: #b06a5f; font-size: 13px; font-weight: 600; padding: 9px 16px;
      cursor: pointer; width: 100%; transition: background 0.15s ease, color 0.15s ease;
    }
    .options-danger-btn:hover { background: rgba(224,122,107,0.12); color: #e07a6b; }
    .delete-confirm-input {
      width: 100%; box-sizing: border-box;
      background: rgba(255,255,255,0.05); border: 1.5px solid #6e3a33; border-radius: 8px;
      color: #f0e0b0; font-size: 14px; padding: 9px 12px; text-align: center;
      letter-spacing: 1px; font-weight: 700;
    }
    .delete-confirm-input:focus { outline: none; border-color: #e07a6b; }
    .delete-confirm-btn {
      background: #6e3a33; border: 2px solid #e07a6b; border-radius: 10px;
      color: #f0e0b0; font-size: 14px; font-weight: 700; padding: 10px 20px; cursor: pointer;
      transition: background 0.15s ease;
    }
    .delete-confirm-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .delete-confirm-btn:not(:disabled):hover { background: #8a4a41; }
  `;
  document.head.appendChild(style);
}

// Enciclopedia: reusa TODO lo que ya existe (createCardElement, la paleta de colores por
// maná, el cardDb ya cargado en boot()) — nada de esto es exclusivo de la Enciclopedia a
// propósito, porque la idea es reusar esta misma UI (grilla + solapas + filtros) el día que
// exista la pantalla de armado de mazos ("Mis Mazos").
// BUGFIX: íconos reales para puntos y Fichas (moneda.png / ficha.png en
// assets/images/ui/), reemplazando los emojis 🪙/🎫 en toda la UI estructurada (widget de
// cuenta, Tienda). Con onerror que cae al emoji de siempre si el archivo todavía no está
// subido — así nunca se ve un ícono roto mientras tanto.
const COIN_ICON_HTML = `<img class="coin-icon" src="./assets/images/ui/moneda.png" alt="🪙" onerror="this.outerHTML='🪙'">`;

// PANEL DE ADMIN: solo esta cuenta puede ver el botón — esto es puramente cosmético (ocultar
// el botón para todos los demás), NO es la protección real. Lo que de verdad impide que
// cualquier otra persona escriba en gameConfig es firestore.rules del lado del servidor,
// que chequea este mismo email de forma independiente — aunque alguien se saltee esta UI
// por completo (devtools, requests a mano), Firestore lo va a rechazar igual.
const ADMIN_EMAIL = 'pablogamero1@gmail.com';

export function isAdminUser(user = state.currentUser) {
  return String(user?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

// "Noticias": texto libre que escribe el admin — se escapa antes de insertarlo como HTML,
// simple buena práctica aunque la fuente sea de confianza (evita romper el layout si el
// texto trae "<" o similar).
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function gameTextHtml(key, variables = {}) {
  return escapeHtml(gameText(key, variables));
}

function gameTextManaHtml(key, variables = {}) {
  return renderInlineGameSymbols(gameTextHtml(key, variables));
}

function notifyGameTextsApplied() {
  try { window.dispatchEvent(new CustomEvent('argentinia:game-texts-updated')); } catch {}
}

function formatAnnouncementDate(date) {
  if (!date) return '';
  const datePart = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}
const FICHA_ICON_HTML = `<img class="ficha-icon" src="./assets/images/ui/ficha.png" alt="🎫" onerror="this.outerHTML='🎫'">`;

const PACK_ICON_HTML = `<img class="reward-pack-icon" src="./assets/images/ui/sobres.png" alt="📦" onerror="this.outerHTML='📦'">`;

function injectRewardsStyles() {
  if (document.getElementById('rewards-system-styles')) return;
  const style = document.createElement('style');
  style.id = 'rewards-system-styles';
  style.textContent = `
    #chest-overlay, #daily-rewards-overlay {
      position: fixed; inset: 0; z-index: 10020;
      background:
        radial-gradient(circle at 50% 10%, rgba(212,175,55,.12), transparent 32%),
        linear-gradient(180deg, #0d1710 0%, #07100a 100%);
      color: #f0e0b0; display: flex; flex-direction: column; padding: 24px 32px;
    }
    .reward-screen-header { display:flex; align-items:center; gap:18px; flex-shrink:0; margin-bottom:18px; }
    .reward-screen-title { font-size:26px; font-weight:800; color:#f0e0b0; letter-spacing:.3px; }
    .reward-screen-subtitle { color:#9fb0a2; font-size:12px; margin-left:auto; text-align:right; }
    .reward-screen-body { flex:1; min-height:0; overflow:auto; max-width:1180px; width:100%; margin:0 auto; padding:4px 4px 30px; }
    .chest-summary { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:14px; margin-bottom:18px; }
    .chest-item {
      position:relative; min-height:190px; background:linear-gradient(180deg,rgba(24,36,27,.94),rgba(10,18,12,.98));
      border:2px solid rgba(212,175,55,.42); border-radius:16px; padding:18px;
      display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
      box-shadow:0 12px 36px rgba(0,0,0,.28); overflow:hidden;
    }
    .chest-item.chest-mythic { border-color:#d9792f; box-shadow:0 0 30px rgba(217,121,47,.14),0 12px 36px rgba(0,0,0,.3); }
    .chest-item-icon { min-height:72px; display:flex; align-items:center; justify-content:center; font-size:54px; }
    .chest-item .coin-icon, .chest-item .ficha-icon { width:68px; height:68px; }
    .reward-pack-icon { width:120px; height:120px; object-fit:contain; vertical-align:middle; }
    .chest-item-title { font-size:16px; font-weight:800; margin-top:7px; }
    .chest-item-count { font-size:28px; font-weight:900; color:#d4af37; margin:4px 0 9px; }
    .chest-mythic .chest-item-count { color:#ef9b52; }
    .chest-item-desc { color:#aebcaf; font-size:11px; line-height:1.35; min-height:31px; }
    .reward-action-btn {
      margin-top:12px; border:2px solid #d4af37; border-radius:10px; padding:8px 16px; min-width:120px;
      background:linear-gradient(180deg,rgba(212,175,55,.24),rgba(16,25,17,.95)); color:#f0e0b0;
      font-size:12px; font-weight:800; cursor:pointer;
    }
    .reward-action-btn:hover:not(:disabled) { box-shadow:0 0 20px rgba(212,175,55,.3); transform:translateY(-1px); }
    .reward-action-btn:disabled { opacity:.35; cursor:not-allowed; }
    .chest-mythic .reward-action-btn { border-color:#d9792f; background:linear-gradient(180deg,rgba(217,121,47,.24),rgba(16,25,17,.95)); }
    .chest-future { border:1px dashed rgba(212,175,55,.28); border-radius:12px; color:#829087; padding:13px 16px; text-align:center; font-size:11px; }
    .daily-pass-intro { text-align:center; margin:0 auto 18px; max-width:760px; color:#c9d4cb; line-height:1.45; }
    .daily-pass-streak { font-size:22px; font-weight:900; color:#f0e0b0; margin-bottom:4px; }
    .daily-pass-reset { color:#89978d; font-size:11px; }
    .daily-reward-track { display:grid; grid-template-columns:repeat(7,minmax(105px,1fr)); gap:12px; min-width:805px; padding:14px 4px 20px; }
    .daily-reward-day { display:flex; flex-direction:column; align-items:center; gap:7px; min-width:0; }
    .daily-reward-circle {
      width:104px; height:104px; border-radius:50%; box-sizing:border-box;
      border:3px solid #49544c; background:radial-gradient(circle,#1d2920,#0b120d 72%);
      display:flex; align-items:center; justify-content:center; flex-direction:column; position:relative;
      filter:saturate(.55); opacity:.7; transition:.18s ease;
    }
    .daily-reward-day.current-streak .daily-reward-circle { border-color:#d4af37; filter:none; opacity:1; box-shadow:0 0 22px rgba(212,175,55,.2); }
    .daily-reward-day.unlocked .daily-reward-circle { border-color:#f0d56a; filter:none; opacity:1; box-shadow:0 0 28px rgba(212,175,55,.3); }
    .daily-reward-day.claimed .daily-reward-circle { border-color:#6abf78; filter:none; opacity:1; box-shadow:0 0 18px rgba(68,163,84,.18); }
    .daily-reward-day.day-7 .daily-reward-circle { border-color:#9e5424; background:radial-gradient(circle,rgba(217,121,47,.28),#17100a 72%); }
    .daily-reward-day.day-7.unlocked .daily-reward-circle, .daily-reward-day.day-7.claimed .daily-reward-circle { box-shadow:0 0 34px rgba(217,121,47,.38); }
    .daily-reward-label { font-size:11px; font-weight:800; color:#c8d0ca; text-transform:uppercase; }
    .daily-reward-icons { display:flex; align-items:center; justify-content:center; gap:2px; min-height:42px; max-width:82px; flex-wrap:wrap; }
    .daily-reward-icons .coin-icon, .daily-reward-icons .ficha-icon { width:30px; height:30px; }
    .daily-reward-icons .reward-pack-icon { width:38px; height:38px; }
    .daily-reward-amount { font-size:11px; font-weight:900; color:#f0e0b0; }
    .daily-reward-check { position:absolute; right:-3px; top:-5px; width:27px; height:27px; border-radius:50%; background:#346c3d; border:2px solid #8bd397; display:flex; align-items:center; justify-content:center; color:white; font-weight:900; }
    .daily-reward-status { min-height:30px; font-size:10px; color:#8e9b91; text-align:center; }
    .daily-reward-day.unlocked .daily-reward-status { color:#f0d56a; font-weight:700; }
    .daily-reward-day.claimed .daily-reward-status { color:#7fc58a; }
    .daily-rewards-scroll { overflow-x:auto; overflow-y:hidden; padding-bottom:4px; }
    .daily-rewards-help { margin-top:12px; text-align:center; color:#8b998f; font-size:11px; }
    .daily-admin-debug { margin:0 auto 12px; max-width:760px; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; padding:8px 10px; border:1px dashed rgba(191,105,255,.65); border-radius:10px; color:#d7b8ef; background:rgba(90,38,120,.12); font-size:10px; }
    .main-menu-account-actions { display:flex; gap:6px; align-items:center; justify-content:flex-end; }
    .main-menu-reward-btn {
      background:linear-gradient(180deg,rgba(212,175,55,.18),rgba(11,19,14,.96));
      border:1.5px solid #d4af37; border-radius:8px; color:#f0e0b0; font-size:11px; font-weight:800;
      padding:6px 10px; cursor:pointer; position:relative; white-space:nowrap;
    }
    .main-menu-reward-btn:hover { box-shadow:0 3px 14px rgba(212,175,55,.3); }
    .main-menu-reward-badge { position:absolute; min-width:15px; height:15px; line-height:15px; padding:0 3px; box-sizing:border-box; border-radius:9px; right:-6px; top:-7px; background:#c63d34; color:#fff; font-size:9px; text-align:center; border:1px solid #ffd0cc; }
    #daily-login-reward-modal, #reward-reveal-modal {
      position:fixed; inset:0; z-index:12050; background:rgba(0,0,0,.76); display:flex; align-items:center; justify-content:center; padding:18px;
    }
    .daily-login-panel, .reward-reveal-panel {
      width:min(620px,94vw); max-height:90vh; overflow:auto; box-sizing:border-box;
      background:radial-gradient(circle at 50% 0%,rgba(212,175,55,.18),transparent 36%),linear-gradient(180deg,#172219,#08100b);
      border:3px solid #d4af37; border-radius:20px; box-shadow:0 0 60px rgba(212,175,55,.24),0 24px 90px rgba(0,0,0,.7);
      padding:26px 30px; text-align:center; color:#f0e0b0;
    }
    .daily-login-kicker { color:#d4af37; font-size:11px; text-transform:uppercase; letter-spacing:1.6px; font-weight:900; }
    .daily-login-title { font-size:28px; line-height:1.1; font-weight:900; margin:8px 0; }
    .daily-login-copy { color:#c2cdc4; font-size:14px; line-height:1.45; }
    .daily-login-reward { margin:18px auto 6px; display:flex; align-items:center; justify-content:center; gap:12px; min-height:70px; }
    .daily-login-reward .coin-icon, .daily-login-reward .ficha-icon { width:60px; height:60px; }
    .daily-login-reward .reward-pack-icon { width:120px; height:120px; }
    .daily-login-reward-text { font-size:18px; font-weight:900; color:#f0d56a; }
    .daily-login-actions { display:flex; justify-content:center; gap:10px; margin-top:20px; flex-wrap:wrap; }
    .reward-secondary-btn { border:1.5px solid #637067; border-radius:10px; padding:8px 14px; background:rgba(255,255,255,.035); color:#bdc8bf; font-weight:700; cursor:pointer; }
    .reward-reveal-cards { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:16px 0; }
    .reward-reveal-cards .card { --card-w:92px; }
    .reward-reveal-panel.mythic-reveal { border-color:#d9792f; box-shadow:0 0 70px rgba(217,121,47,.42),0 24px 90px rgba(0,0,0,.75); }
    .reward-reveal-panel.mythic-reveal .reward-reveal-cards .card { --card-w:210px; filter:drop-shadow(0 0 24px rgba(217,121,47,.55)); }
  `;
  document.head.appendChild(style);
}

function rewardIconHTML(reward) {
  const amount = Math.max(0, Number(reward?.amount) || 0);
  if (reward?.type === 'points') return `${COIN_ICON_HTML}<span class="daily-reward-amount">${amount}</span>`;
  if (reward?.type === 'fichas') return `${FICHA_ICON_HTML}<span class="daily-reward-amount">${amount}</span>`;
  if (reward?.type === 'standardPack') return `${PACK_ICON_HTML}<span class="daily-reward-amount">×${amount}</span>`;
  if (reward?.type === 'guaranteedMythic') return `<span style="font-size:37px;filter:drop-shadow(0 0 9px rgba(217,121,47,.65))">✦</span><span class="daily-reward-amount">Mítica</span>`;
  return `<span class="daily-reward-amount">${amount}</span>`;
}

function rewardDescription(entry) {
  if (!entry) return '';
  return (entry.rewards || []).map(reward => {
    const n = Number(reward.amount) || 0;
    if (reward.type === 'points') return `${n} puntos`;
    if (reward.type === 'fichas') return `${n} Ficha${n === 1 ? '' : 's'} de mejora`;
    if (reward.type === 'standardPack') return `${n} sobre${n === 1 ? '' : 's'}`;
    if (reward.type === 'guaranteedMythic') return '1 carta mítica asegurada';
    return `${n} ${reward.type}`;
  }).join(' + ');
}

function renderRewardRevealModal({ title, cards, subtitle = '', mythic = false, onClose }) {
  injectRewardsStyles();
  document.getElementById('reward-reveal-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'reward-reveal-modal';
  const cardHTML = (cards || []).map(card => createCardElement(card, false, true, null, 'encyclopedia', null).outerHTML).join('');
  modal.innerHTML = `
    <div class="reward-reveal-panel${mythic ? ' mythic-reveal' : ''}">
      <div class="daily-login-kicker">${mythic ? '✦ RECOMPENSA MÍTICA ✦' : 'MI COFRE'}</div>
      <div class="daily-login-title">${title}</div>
      ${subtitle ? `<div class="daily-login-copy">${subtitle}</div>` : ''}
      <div class="reward-reveal-cards">${cardHTML}</div>
      <button class="reward-action-btn" id="reward-reveal-close">Continuar</button>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#reward-reveal-close').addEventListener('click', () => {
    modal.remove();
    onClose?.();
  });
}

export function showChestScreen(onBack) {
  injectRewardsStyles();
  injectEncyclopediaStyles();
  document.getElementById('chest-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'chest-overlay';
  overlay.innerHTML = `
    <div class="reward-screen-header">
      <button class="encyclopedia-back-btn" id="chest-back">← ${gameTextHtml('common.back')}</button>
      <div class="reward-screen-title">${gameTextHtml('chest.title')}</div>
      <div class="reward-screen-subtitle">${gameTextHtml('chest.subtitle')}</div>
    </div>
    <div class="reward-screen-body" id="chest-body"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#chest-back').addEventListener('click', () => { overlay.remove(); onBack?.(); });
  const body = overlay.querySelector('#chest-body');
  let recoveryChecked = false;
  let recoveryInFlight = false;

  function showMythicReveal(card) {
    if (!card) return;
    showGuaranteedMythicExperience({
      card,
      renderCard: rewardCard => createCardElement(rewardCard, false, true, null, 'pack-opening', () => {}),
      // El journal sólo se limpia cuando la carta llegó físicamente al frente. Si hay F5
      // durante la carga audiovisual, la próxima entrada a Mi Cofre reanuda esta misma carta.
      onReveal: revealedCard => {
        clearPendingGuaranteedMythicReveal(state.currentUser?.uid, revealedCard?.id || card.id);
      },
      onClose: renderChest,
      autoStart: true
    });
  }

  async function reconcilePendingMythic({ autoResume = false } = {}) {
    if (!state.currentUser || recoveryInFlight) return null;
    const pending = getPendingGuaranteedMythicReveal(state.currentUser.uid);
    if (!pending) return null;
    recoveryInFlight = true;
    try {
      let profile = state.userProfile;
      let status = inferGuaranteedMythicRevealState(profile, pending);
      // Un journal "prepared" puede corresponder a una transacción cuyo response se perdió
      // por F5/corte. Leemos servidor antes de volver a gastar el item: jamás adivinamos.
      if (status !== 'committed') {
        try {
          const serverProfile = await loadUserProfileFromServer(state.currentUser.uid);
          if (serverProfile) {
            profile = serverProfile;
            state.userProfile = serverProfile;
            updateAccountUI(state.currentUser);
          }
          status = inferGuaranteedMythicRevealState(profile, pending);
        } catch (err) {
          console.warn('[RewardReveal 23.13.67] No se pudo reconciliar contra servidor:', err);
        }
      }
      if (status === 'committed') {
        markGuaranteedMythicRevealCommitted(state.currentUser.uid, pending.cardId);
        const card = cardDb.getById(pending.cardId);
        if (!card || card.rarity !== 'Mythic') {
          clearPendingGuaranteedMythicReveal(state.currentUser.uid, pending.cardId);
          return { committed: true, card: null, pending };
        }
        if (autoResume && document.body.contains(overlay)) showMythicReveal(card);
        return { committed: true, card, pending };
      }
      return { committed: false, card: cardDb.getById(pending.cardId), pending };
    } finally {
      recoveryInFlight = false;
    }
  }

  function renderChest() {
    if (!state.currentUser || !state.userProfile) {
      body.innerHTML = `<div class="chest-future">${gameTextHtml('chest.loginRequired')}</div>`;
      return;
    }
    const inventory = normalizeInventory(state.userProfile.inventory);
    const points = Number(state.userProfile.points) || 0;
    const fichas = Number(state.userProfile.fichas) || 0;
    const packs = inventory[CHEST_ITEM_KEYS.standardPack];
    const mythics = inventory[CHEST_ITEM_KEYS.guaranteedMythic];
    const pendingMythic = getPendingGuaranteedMythicReveal(state.currentUser.uid);
    const pendingState = pendingMythic ? inferGuaranteedMythicRevealState(state.userProfile, pendingMythic) : 'none';
    const mythicActionLabel = pendingMythic && pendingState !== 'committed'
      ? gameTextHtml('chest.mythic.resumeAction')
      : gameTextHtml('chest.mythic.action');
    const mythicButtonDisabled = mythics < 1 && !pendingMythic;
    body.innerHTML = `
      <div class="chest-summary">
        <div class="chest-item">
          <div class="chest-item-icon">${COIN_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.points.title')}</div><div class="chest-item-count">${points}</div>
          <div class="chest-item-desc">${gameTextHtml('chest.points.description')}</div>
        </div>
        <div class="chest-item">
          <div class="chest-item-icon">${FICHA_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.fichas.title')}</div><div class="chest-item-count">${fichas}</div>
          <div class="chest-item-desc">${gameTextHtml('chest.fichas.description')}</div>
          <button class="reward-action-btn" id="chest-use-fichas" ${fichas < FICHAS_PER_ENHANCEMENT ? 'disabled' : ''}>${gameTextHtml('chest.fichas.action')}</button>
        </div>
        <div class="chest-item">
          <div class="chest-item-icon">${PACK_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.packs.title')}</div><div class="chest-item-count">${packs}</div>
          <div class="chest-item-desc">${gameTextHtml('chest.packs.description')}</div>
          <button class="reward-action-btn" id="chest-open-pack" ${packs < 1 ? 'disabled' : ''}>${gameTextHtml('chest.packs.action')}</button>
        </div>
        <div class="chest-item chest-mythic">
          <div class="chest-item-icon">✦</div><div class="chest-item-title">${gameTextHtml('chest.mythic.title')}</div><div class="chest-item-count">${mythics}</div>
          <div class="chest-item-desc">${pendingMythic ? gameTextHtml('chest.mythic.pendingDescription') : gameTextHtml('chest.mythic.description')}</div>
          <button class="reward-action-btn" id="chest-open-mythic" ${mythicButtonDisabled ? 'disabled' : ''}>${mythicActionLabel}</button>
        </div>
      </div>
      <div class="chest-future">${gameTextHtml('chest.future')}</div>`;

    body.querySelector('#chest-use-fichas')?.addEventListener('click', () => {
      overlay.remove();
      showStoreScreen(() => showChestScreen(onBack), { initialView: 'craft' });
    });

    body.querySelector('#chest-open-pack')?.addEventListener('click', async () => {
      const btn = body.querySelector('#chest-open-pack');
      btn.disabled = true;
      try {
        const packCards = generatePackCards();
        state.userProfile = await openInventoryPack(state.currentUser.uid, packCards.map(c => c.id));
        updateAccountUI(state.currentUser);
        // 23.13.1 — la economía YA terminó antes de empezar el show. La animación es una
        // presentación de recompensas acreditadas, así cerrar/saltar/girar no puede repetir
        // ni perder el sobre. Usamos el mismo renderer real de cartas, no una tarjeta falsa.
        showPackOpeningExperience({
          cards: packCards,
          fichaTotal: state.userProfile.fichas || 0,
          renderCard: card => createCardElement(card, false, true, null, 'pack-opening', () => {}),
          onClose: renderChest
        });
      } catch (err) {
        console.error('No se pudo abrir el sobre del Cofre:', err);
        showSimpleAlertModal(err.message || 'No se pudo abrir el sobre. Probá de nuevo.');
        renderChest();
      }
    });

    body.querySelector('#chest-open-mythic')?.addEventListener('click', async () => {
      const btn = body.querySelector('#chest-open-mythic');
      btn.disabled = true;
      try {
        let pending = getPendingGuaranteedMythicReveal(state.currentUser.uid);
        if (pending) {
          const reconciled = await reconcilePendingMythic({ autoResume: false });
          if (reconciled?.committed && reconciled.card) {
            showMythicReveal(reconciled.card);
            return;
          }
          pending = reconciled?.pending || pending;
        }

        // Nuevo contrato 23.13.67: el click REVELAR elige la carta, deja journal ANTES del
        // await y luego hace la transacción atómica. Todo lo que sigue es sólo experiencia.
        let card = pending ? cardDb.getById(pending.cardId) : null;
        if (!card || card.rarity !== 'Mythic') {
          if (pending) clearPendingGuaranteedMythicReveal(state.currentUser.uid, pending.cardId);
          card = generateGuaranteedMythicCard();
          pending = beginGuaranteedMythicReveal(state.currentUser.uid, card.id, state.userProfile);
        }
        if (!pending) pending = beginGuaranteedMythicReveal(state.currentUser.uid, card.id, state.userProfile);

        state.userProfile = await openGuaranteedMythic(state.currentUser.uid, card.id);
        markGuaranteedMythicRevealCommitted(state.currentUser.uid, card.id);
        updateAccountUI(state.currentUser);
        // NO hay "PREPARAR REVELACIÓN". Entramos directamente en la cinemática.
        showMythicReveal(card);
      } catch (err) {
        console.error('No se pudo revelar la recompensa mítica:', err);
        // El journal se conserva deliberadamente: al volver a Mi Cofre primero se consulta
        // el servidor para decidir si la transacción llegó a commit o hay que reintentar.
        showSimpleAlertModal(gameText('chest.mythic.reconcileError'));
        renderChest();
      }
    });
  }
  renderChest();

  // Si F5 ocurrió después del commit pero antes de ver la carta, Mi Cofre reabre la MISMA
  // Mythic automáticamente. Un journal sólo "prepared" se verifica contra servidor primero.
  if (!recoveryChecked && state.currentUser && getPendingGuaranteedMythicReveal(state.currentUser.uid)) {
    recoveryChecked = true;
    window.setTimeout(() => { void reconcilePendingMythic({ autoResume: true }).then(result => {
      if (result && !result.committed) renderChest();
    }); }, 0);
  }
}

export function showDailyRewardsScreen(onBack) {
  injectRewardsStyles();
  injectEncyclopediaStyles();
  document.getElementById('daily-rewards-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'daily-rewards-overlay';
  overlay.innerHTML = `
    <div class="reward-screen-header">
      <button class="encyclopedia-back-btn" id="daily-rewards-back">← ${gameTextHtml('common.back')}</button>
      <div class="reward-screen-title">${gameTextHtml('daily.title')}</div>
      <div class="reward-screen-subtitle">${gameTextHtml('daily.subtitle')}</div>
    </div>
    <div class="reward-screen-body" id="daily-rewards-body"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#daily-rewards-back').addEventListener('click', () => { overlay.remove(); onBack?.(); });
  const body = overlay.querySelector('#daily-rewards-body');

  function renderRewards() {
    if (!state.currentUser || !state.userProfile) {
      body.innerHTML = `<div class="chest-future">${gameTextHtml('daily.loginRequired')}</div>`;
      return;
    }
    const daily = normalizeDailyRewardsState(state.userProfile.dailyRewards);
    const pending = unclaimedUnlockedDays(daily);
    const daysHTML = DAILY_REWARD_SCHEDULE.map(entry => {
      const claimed = daily.claimedDays.includes(entry.day);
      const unlocked = daily.unlockedDays.includes(entry.day) && !claimed;
      const current = entry.day <= daily.streak;
      const classes = ['daily-reward-day', `day-${entry.day}`, claimed ? 'claimed' : '', unlocked ? 'unlocked' : '', current ? 'current-streak' : ''].filter(Boolean).join(' ');
      const icons = entry.rewards.map(rewardIconHTML).join('');
      const status = claimed ? gameText('daily.status.claimed') : unlocked ? gameText('daily.status.available') : entry.day <= daily.streak ? gameText('daily.status.unlocked') : gameText('daily.status.locked');
      return `<div class="${classes}" data-reward-day="${entry.day}">
        <div class="daily-reward-label">${gameTextHtml('daily.day', { day: entry.day })}</div>
        <div class="daily-reward-circle">${claimed ? '<span class="daily-reward-check">✓</span>' : ''}<div class="daily-reward-icons">${icons}</div></div>
        <div class="daily-reward-status">${status}</div>
        ${unlocked ? `<button class="reward-action-btn" data-claim-day="${entry.day}">${gameTextHtml('daily.claim')}</button>` : ''}
      </div>`;
    }).join('');
    body.innerHTML = `
      <div class="daily-pass-intro">
        <div class="daily-pass-streak">${gameTextHtml('daily.streak', { streak: daily.streak })}</div>
        <div>${gameTextHtml('daily.intro')}</div>
        <div class="daily-pass-reset">${pending.length ? gameTextHtml('daily.cycle.pending', { count: pending.length }) : gameTextHtml('daily.cycle.none')}</div>
      </div>
      ${isAdminUser() ? `<div class="daily-admin-debug">
        <div><strong>🧪 ADMIN DEBUG</strong> · reloj oficial + <span id="daily-debug-offset">${Number(state.userProfile?.rewardDebugOffsetDays) || 0}</span> día(s)</div>
        <button class="reward-secondary-btn" id="daily-debug-next">+1 DÍA</button>
        <button class="reward-secondary-btn" id="daily-debug-reset">RESET</button>
      </div>` : ''}
      <div class="daily-rewards-scroll"><div class="daily-reward-track">${daysHTML}</div></div>
      <div class="daily-rewards-help">${gameTextHtml('daily.help')}</div>`;
    body.querySelector('#daily-debug-next')?.addEventListener('click', async () => {
      const btn = body.querySelector('#daily-debug-next');
      btn.disabled = true;
      try {
        // 23.13.62 — +1 DÍA es atómico: reloj QA + Daily avanzan juntos o ninguno cambia.
        const result = await adminAdvanceDailyRewardDebugDay(state.currentUser.uid);
        state.userProfile = result.profile;
        updateAccountUI(state.currentUser);
        renderRewards();
        if (result.login?.newCalendarLogin) showDailyLoginRewardModal(result.login);
      } catch (err) {
        console.error('No se pudo avanzar el día de debug:', err);
        showSimpleAlertModal(err.message || 'No se pudo avanzar el día de debug.');
        renderRewards();
      }
    });
    body.querySelector('#daily-debug-reset')?.addEventListener('click', async () => {
      const btn = body.querySelector('#daily-debug-reset');
      btn.disabled = true;
      try {
        // 23.13.62 — RESET también es atómico: offset=0 + resincronización D1 en una sola tx.
        const result = await adminResetDailyRewardDebug(state.currentUser.uid);
        state.userProfile = result.profile;
        updateAccountUI(state.currentUser);
        renderRewards();
        if (result.login?.newCalendarLogin) showDailyLoginRewardModal(result.login);
      } catch (err) {
        console.error('No se pudo resetear el reloj de debug:', err);
        showSimpleAlertModal(err.message || 'No se pudo resetear el reloj de debug.');
        renderRewards();
      }
    });

    body.querySelectorAll('[data-claim-day]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const day = Number(btn.dataset.claimDay);
        btn.disabled = true;
        try {
          state.userProfile = await claimDailyReward(state.currentUser.uid, day);
          updateAccountUI(state.currentUser);
          renderRewards();
        } catch (err) {
          console.error('No se pudo reclamar premio diario:', err);
          showSimpleAlertModal(err.message || 'No se pudo reclamar el premio.');
          renderRewards();
        }
      });
    });
  }
  renderRewards();
}

export function showDailyLoginRewardModal(loginInfo) {
  if (!loginInfo?.newCalendarLogin) return Promise.resolve('skipped');
  injectRewardsStyles();
  document.getElementById('daily-login-reward-modal')?.remove();
  const reward = rewardForDay(loginInfo.rewardDay);
  const modal = document.createElement('div');
  modal.id = 'daily-login-reward-modal';
  const canClaim = !!loginInfo.rewardUnlocked && !!reward;
  modal.innerHTML = `
    <div class="daily-login-panel">
      <div class="daily-login-kicker">RECOMPENSA DIARIA</div>
      <div class="daily-login-title">¡Felicitaciones!</div>
      <div class="daily-login-copy">Llevás <strong>${loginInfo.streak} logueo${loginInfo.streak === 1 ? '' : 's'} seguido${loginInfo.streak === 1 ? '' : 's'} de 7</strong>.${loginInfo.streakReset ? '<br>Tu racha anterior se cortó y hoy empezaste una nueva.' : ''}</div>
      ${reward ? `<div class="daily-login-reward"><div class="daily-reward-icons">${reward.rewards.map(rewardIconHTML).join('')}</div><div class="daily-login-reward-text">${rewardDescription(reward)}</div></div>` : ''}
      <div class="daily-login-copy" id="daily-login-result">${canClaim ? 'Tu premio está listo para reclamar.' : 'Este premio ya fue reclamado en el ciclo activo.'}</div>
      <div class="daily-login-actions">
        ${canClaim ? '<button class="reward-action-btn" id="daily-login-claim">RECLAMAR PREMIO</button>' : ''}
        <button class="reward-secondary-btn" id="daily-login-view">Ver los 7 días</button>
        <button class="reward-secondary-btn" id="daily-login-close">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  let resolveClosed;
  let closed = false;
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  const finish = reason => {
    if (closed) return;
    closed = true;
    modal.remove();
    resolveClosed?.(reason);
  };
  modal.querySelector('#daily-login-close').addEventListener('click', () => finish('closed'));
  modal.querySelector('#daily-login-view').addEventListener('click', () => {
    finish('view_rewards');
    const menu = document.getElementById('main-menu-overlay');
    if (menu) menu.style.display = 'none';
    showDailyRewardsScreen(() => { if (menu) menu.style.display = ''; });
  });
  modal.querySelector('#daily-login-claim')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#daily-login-claim');
    const result = modal.querySelector('#daily-login-result');
    btn.disabled = true;
    try {
      state.userProfile = await claimDailyReward(state.currentUser.uid, loginInfo.rewardDay);
      updateAccountUI(state.currentUser);
      result.innerHTML = `✅ <strong>¡Premio reclamado!</strong>${reward?.rewards.some(r => r.type === 'standardPack' || r.type === 'guaranteedMythic') ? ' Los items quedaron guardados en Mi Cofre.' : ''}`;
      btn.remove();
    } catch (err) {
      console.error('No se pudo reclamar el premio del login:', err);
      result.textContent = err.message || 'No se pudo reclamar el premio. Probá de nuevo.';
      btn.disabled = false;
    }
  });
  return closedPromise;
}

const ENCYCLOPEDIA_TABS = [
  { key: 'criaturas', label: 'Criaturas' },
  { key: 'instantaneos', label: 'Instantáneos' },
  { key: 'conjuros', label: 'Conjuros' },
  { key: 'encantamientos', label: 'Encantamientos' },
  { key: 'artefactos', label: 'Artefactos' },
  { key: 'planeswalkers', label: 'Planeswalkers' },
  { key: 'tierras', label: 'Tierras' }
];

const ENCYCLOPEDIA_RARITIES = [
  { key: 'Mythic', label: 'Legendarias' },
  { key: 'Rare', label: 'Raras' },
  { key: 'Uncommon', label: 'Poco Comunes' },
  { key: 'Common', label: 'Comunes' }
];

// 23.12.0 — filtros compartidos por Enciclopedia y Constructor. Multicolores coinciden
// con cualquiera de sus colores; "Incoloras" significa colors vacío. Los arquetipos son
// etiquetas mecánicas derivadas del JSON (no texto libre), por eso sirven igual en ambos
// navegadores y no requieren migrar las 511 cartas.
const CARD_BROWSER_COLORS = [
  { key: 'W', label: '⚪ Blancas' },
  { key: 'U', label: '🔵 Azules' },
  { key: 'B', label: '⚫ Negras' },
  { key: 'R', label: '🔴 Rojas' },
  { key: 'G', label: '🟢 Verdes' },
  { key: 'C', label: '◇ Incoloras' }
];

const CARD_BROWSER_ARCHETYPES = [
  { key: 'poison', label: '☠️ Veneno', effectTypes: ['poison', 'proliferate'] },
  { key: 'draw', label: '🃏 Robo', effectTypes: ['draw', 'draw_and_lose_life', 'loot', 'rummage'] },
  { key: 'heal', label: '❤️ Curación', effectTypes: ['heal', 'drain'], keywords: ['lifelink'] },
  { key: 'tokens', label: '👥 Tokens', effectTypes: ['create_tokens'] }
];

function collectCardMechanics(card) {
  const effectTypes = new Set();
  const visit = value => {
    if (!value) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value !== 'object') return;
    if (typeof value.type === 'string') effectTypes.add(value.type);
    Object.values(value).forEach(visit);
  };
  [
    'effect','secondaryEffect','etbEffect','diesTrigger','attackTrigger','combatDamageTrigger',
    'landEtbTrigger','upkeepTrigger','spellCastTrigger','creatureEtbTrigger','staticEffect',
    'equipment','auraEffect','activatedAbility','activatedAbilities','loyaltyAbilities',
    'blockTrigger','anyCreatureDiesTrigger','anyCreatureAttacksTrigger','opponentDeathTrigger',
    'endStepTrigger','grantedAbility','triggers','genericTriggers'
  ].forEach(key => visit(card?.[key]));
  return effectTypes;
}

function getCardArchetypes(card) {
  const mechanics = collectCardMechanics(card);
  const keywords = new Set((card?.keywords || []).map(k => String(k).toLowerCase()));
  const result = new Set();
  CARD_BROWSER_ARCHETYPES.forEach(def => {
    if (def.effectTypes.some(type => mechanics.has(type)) ||
        (def.keywords || []).some(keyword => keywords.has(keyword))) {
      result.add(def.key);
    }
  });
  return result;
}

function cardMatchesColorFilter(card, activeColors) {
  if (activeColors.size === CARD_BROWSER_COLORS.length) return true;
  const colors = Array.isArray(card?.colors) ? card.colors : [];
  if (colors.length === 0) return activeColors.has('C');
  return colors.some(color => activeColors.has(String(color).toUpperCase()));
}

function cardMatchesArchetypeFilter(card, activeArchetypes) {
  if (activeArchetypes.size === 0) return true;
  const cardArchetypes = getCardArchetypes(card);
  return [...activeArchetypes].some(key => cardArchetypes.has(key));
}

function browserColorFiltersHTML(prefix) {
  return CARD_BROWSER_COLORS.map(color => `
    <label class="encyclopedia-filter-option">
      <input type="checkbox" data-browser-color="${color.key}" data-filter-prefix="${prefix}" checked>
      ${color.label}
    </label>`).join('');
}

function browserArchetypeFiltersHTML(prefix) {
  return CARD_BROWSER_ARCHETYPES.map(archetype => `
    <label class="encyclopedia-filter-option">
      <input type="checkbox" data-browser-archetype="${archetype.key}" data-filter-prefix="${prefix}">
      ${archetype.label}
    </label>`).join('');
}

function setBrowserCardZoom(overlay, value) {
  return applyCardZoom(overlay, value, { cssVar: '--card-w', unit: 'vh', min: 8, max: 50, fallback: 12 });
}

// 23.17.4 — UX desktop: las superficies largas siguen usando wheel nativo, pero además
// permiten click + drag sobre zonas no interactivas. En touch no interferimos con el scroll
// del navegador ni con cartas/botones/inputs.
function enableDesktopDragScroll(container, { axis = 'y' } = {}) {
  if (!container || window.matchMedia?.('(pointer: coarse)')?.matches) return;
  let active = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const interactive = 'button, a, input, select, textarea, .card, [role="button"], [contenteditable="true"]';
  const end = (event) => {
    if (!active) return;
    active = false;
    container.classList.remove('drag-scroll-active');
    try { if (event?.pointerId != null && container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId); } catch {}
  };
  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target?.closest?.(interactive)) return;
    active = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = container.scrollLeft;
    startTop = container.scrollTop;
    container.classList.add('drag-scroll-active');
    try { container.setPointerCapture?.(event.pointerId); } catch {}
  });
  container.addEventListener('pointermove', (event) => {
    if (!active) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    if (axis !== 'y') container.scrollLeft = startLeft - dx;
    if (axis !== 'x') container.scrollTop = startTop - dy;
    event.preventDefault();
  });
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
  container.addEventListener('lostpointercapture', end);
}

function browserSortOptionsHTML(categoryKey, selectedKey = 'cmc') {
  return getCardBrowserSortOptions(categoryKey)
    .map(option => `<option value="${option.key}"${option.key === selectedKey ? ' selected' : ''}>${option.label}</option>`)
    .join('');
}

function syncBrowserSortControls(root, prefix, categoryKey, sortState) {
  const normalized = normalizeCardBrowserSort(categoryKey, sortState);
  const select = root.querySelector(`#${prefix}-sort-key`);
  const direction = root.querySelector(`#${prefix}-sort-direction`);
  if (select) {
    select.innerHTML = browserSortOptionsHTML(categoryKey, normalized.key);
    select.value = normalized.key;
  }
  if (direction) {
    direction.textContent = normalized.direction === 'desc' ? '↓' : '↑';
    direction.title = normalized.direction === 'desc' ? 'Orden decreciente' : 'Orden creciente';
    direction.setAttribute('aria-label', direction.title);
  }
  return normalized;
}

function createBrowserTabPane(host, cache, tabKey) {
  let entry = cache.get(tabKey);
  if (entry) return entry;
  const pane = document.createElement('div');
  pane.className = 'card-browser-tab-pane';
  pane.dataset.browserTab = tabKey;
  pane.hidden = true;
  host.appendChild(pane);
  entry = { pane, records: [], empty: null };
  cache.set(tabKey, entry);
  return entry;
}

function activateBrowserTab(cache, tabKey) {
  cache.forEach((entry, key) => { entry.pane.hidden = key !== tabKey; });
}

function debounce(fn, wait = 120) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// FASE 1: ya existe una colección real por cuenta (Firestore, users/{uid}.collection) —
// si hay sesión Y ya se terminó de cargar (o crear) su perfil, se devuelve esa colección
// de verdad. Sin sesión, o con sesión pero perfil todavía sin resolver (recién logueado,
// nunca jugó todavía), se sigue mostrando el pool completo — mismo criterio acordado desde
// que se armó la Enciclopedia, solo que ahora deja de ser el único camino posible.
export function getOwnedCardIds() {
  // 23.11.13 — laboratorio admin: Pablo ve el pool completo como poseído sin mutar ni
  // inflar users/{uid}.collection. Esto afecta sólo Enciclopedia/Deckbuilder de su cuenta.
  if (isAdminUser()) return new Set(cardDb.allCards.map(c => c.id));
  if (state.currentUser && state.userProfile && state.userProfile.collection) {
    return new Set(state.userProfile.collection);
  }
  return new Set(cardDb.allCards.map(c => c.id));
}

export function getDeckBuilderOwnedCounts() {
  const counts = {};
  if (isAdminUser()) {
    cardDb.allCards.forEach(card => {
      counts[card.id] = card.type?.includes('básica') ? DECK_SIZE_EXACT : MAX_COPIES_PER_CARD;
    });
    return counts;
  }
  (state.userProfile?.collection || []).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  return counts;
}

function injectEncyclopediaStyles() {
  if (document.getElementById('encyclopedia-styles')) return;
  const style = document.createElement('style');
  style.id = 'encyclopedia-styles';
  style.textContent = `
    #encyclopedia-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; flex-direction: column;
      padding: 24px 32px;
      /* Mucho más grande que el --card-w de 12.5vh del tablero, a propósito — "tamaño
         grande, como el hover-zoom" que pidió el usuario. */
      --card-w: 32vh;
    }
    .encyclopedia-header { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; flex-shrink: 0; }
    .encyclopedia-title {
      font-size: 26px; font-weight: 700; color: #f0e0b0;
      text-shadow: 0 0 20px rgba(212,175,55,0.4);
    }
    .encyclopedia-progress { margin-left:auto; color:#d6c99d; font-size:13px; font-weight:650; text-align:right; }
    .encyclopedia-progress strong { color:#f0e0b0; }
    .encyclopedia-back-btn {
      background: linear-gradient(180deg, rgba(18,25,15,0.92), rgba(11,19,14,0.96));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 8px; color: #f0e0b0; font-weight: 700; font-size: 14px;
      padding: 8px 16px; cursor: pointer; transition: background 0.15s ease;
    }
    .encyclopedia-back-btn:hover { background: rgba(212,175,55,0.15); }
    .encyclopedia-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; flex-shrink: 0; }
    .encyclopedia-tab {
      background: rgba(255,255,255,0.03);
      border: 1.5px solid rgba(212,175,55,0.25);
      border-radius: 8px 8px 0 0;
      color: #b8adc4; font-size: 14px; font-weight: 600;
      padding: 8px 18px; cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .encyclopedia-tab:hover { background: rgba(212,175,55,0.1); color: #f0e0b0; }
    .encyclopedia-tab.active {
      background: rgba(212,175,55,0.18); border-color: var(--gold, #d4af37); color: #f0e0b0;
    }
    .encyclopedia-body { flex: 1; display: flex; gap: 20px; min-height: 0; }
.encyclopedia-grid-box {
    flex: 1;
    overflow-y: auto;
    background: #F5F5F5;
    border: 2px solid rgba(212,175,55,0.3);
    border-radius: 12px 0 0 12px;
    padding: 20px;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 20px;
}
    .encyclopedia-card-slot { content-visibility: auto; contain-intrinsic-size: 180px 252px; position:relative; }
    .encyclopedia-card-slot .card-inner { border-width: 6px; }
    .encyclopedia-art-edit-btn {
      position:absolute; top:5px; right:5px; z-index:35; width:24px; height:24px; padding:0;
      display:flex; align-items:center; justify-content:center; border-radius:50%; cursor:pointer;
      border:1.5px solid rgba(212,175,55,.88); background:rgba(7,10,8,.90); color:#f0e0b0;
      font-size:12px; line-height:1; box-shadow:0 2px 7px rgba(0,0,0,.62);
      transition:transform .12s ease,background .12s ease,box-shadow .12s ease;
    }
    .encyclopedia-art-edit-btn:hover { transform:scale(1.12); background:rgba(67,55,17,.96); }
    .encyclopedia-art-edit-btn.has-custom-layout {
      background:#d4af37; color:#17120a; box-shadow:0 0 0 2px rgba(212,175,55,.25),0 2px 8px rgba(0,0,0,.72);
    }
    .encyclopedia-text-edit-btn {
      position:absolute; top:4px; right:4px; z-index:12; width:22px; height:22px; padding:0;
      display:flex; align-items:center; justify-content:center; border-radius:50%; cursor:pointer;
      border:1.5px solid rgba(60,45,30,.72); background:rgba(253,251,247,.94); color:#2a2118;
      font-size:11px; line-height:1; box-shadow:0 2px 6px rgba(0,0,0,.32);
      transition:transform .12s ease,background .12s ease,box-shadow .12s ease;
    }
    .encyclopedia-text-edit-btn:hover { transform:scale(1.12); background:#fff8df; }
    .encyclopedia-text-edit-btn.has-custom-layout {
      background:#d4af37; color:#17120a; box-shadow:0 0 0 2px rgba(212,175,55,.22),0 2px 7px rgba(0,0,0,.45);
    }
    :is(#encyclopedia-overlay,#deckbuilder-overlay,#mydecks-overlay) .card-inner {
      /* 23.12.2 — override más específico: el marco acompaña el zoom. El 6px histórico
         queda arriba para preservar el baseline, pero este selector con IDs manda en browser. */
      border-width: clamp(1px, calc(var(--card-w) * 0.02), 6px);
      border-radius: clamp(2px, calc(var(--card-w) * 0.018), 4px);
    }
    /* BUGFIX (revisión post-Etapa 4): antes esto grisaba la carta ENTERA (nombre, texto,
       poder/resistencia incluidos) — ahora, a pedido, solo el ARTE se reemplaza por un
       rectángulo negro con el logo del juego (genera intriga, invita a comprar sobres); el
       resto de la carta (nombre, tipo, texto, P/T) queda exactamente igual que si la
       tuvieras. .card-art ya es un contenedor propio con overflow:hidden (ver
       createCardElement en ui.js), así que tocar solo ese contenedor no pisa nada del
       resto del layout de la carta. */
    .encyclopedia-card-slot.unowned .card-art {
      background-color: #0b0b0b;
      background-image: url('./assets/images/ui/logo.png');
      background-repeat: no-repeat;
      background-position: center center;
      background-size: 55% auto;
    }
    .encyclopedia-card-slot.unowned .card-art img,
    .encyclopedia-card-slot.unowned .card-art > div {
      visibility: hidden;
    }
    .encyclopedia-token-slot .card-inner { box-shadow:0 0 0 1px rgba(212,175,55,.22), 0 10px 25px rgba(0,0,0,.25); }
    #encyclopedia-overlay.encyclopedia-asset-mode .encyclopedia-progress { display:none; }
    #encyclopedia-overlay.encyclopedia-asset-mode .encyclopedia-filters > :not(#enc-search):not(.card-browser-zoom) { display:none !important; }
    .encyclopedia-dfc-back-slot .card-inner { box-shadow:0 0 0 1px rgba(120,190,255,.28), 0 10px 25px rgba(0,0,0,.25); }
    .encyclopedia-empty-msg { color: #5a5266; font-size: 14px; margin: auto; text-align: center; }
    .encyclopedia-filters {
      width: 260px; flex-shrink: 0;
      background: rgba(18,25,15,0.6);
      border: 2px solid rgba(212,175,55,0.3);
      border-radius: 12px;
      padding: 20px; overflow-y: auto;
    }
    .encyclopedia-filter-section-title {
      color: #f0e0b0; font-size: 13px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; margin: 18px 0 10px 0;
    }
    .encyclopedia-filter-section-title:first-child { margin-top: 0; }
    .encyclopedia-filter-option {
      display: flex; align-items: center; gap: 8px;
      color: #e8ddc8; font-size: 14px;
      padding: 6px 4px; cursor: pointer; border-radius: 6px;
    }
    .encyclopedia-filter-option:hover { background: rgba(212,175,55,0.08); }
    .encyclopedia-filter-option input { accent-color: var(--gold, #d4af37); width: 16px; height: 16px; cursor: pointer; }
    .encyclopedia-search-input {
      width: 100%; box-sizing: border-box;
      background: rgba(255,255,255,0.05);
      border: 1.5px solid rgba(212,175,55,0.4);
      border-radius: 8px;
      color: #f0e0b0; font-size: 14px;
      padding: 9px 12px;
      margin-bottom: 18px;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .encyclopedia-search-input::placeholder { color: #8a8095; }
    .encyclopedia-search-input:focus {
      outline: none; border-color: #f0e0b0; background: rgba(255,255,255,0.08);
    }
    .card-browser-zoom {
      display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center;
      color: #e8ddc8; font-size: 12px; margin: 0 0 12px 0;
    }
    .card-browser-zoom input[type="range"] { width: 100%; accent-color: var(--gold, #d4af37); cursor: pointer; }
    .card-browser-filter-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px; }
    .card-browser-filter-grid .encyclopedia-filter-option { min-width: 0; }
    .card-browser-filter-grid.archetypes { grid-template-columns: 1fr; }
  `;
  document.head.appendChild(style);
}

export function showEncyclopedia(onBack) {
  injectEncyclopediaStyles();

  const ownedIds = getOwnedCardIds();
  const enhancedIds = new Set(Object.keys((state.userProfile && state.userProfile.enhancements) || {}).filter(id => isEnhancementEligibleCard(cardDb.getById(id))));
  const encyclopediaTabs = [
    ...ENCYCLOPEDIA_TABS,
    ...(isAdminUser() ? [
      { key: 'dfc-backs', label: gameText('encyclopedia.tab.dfcBacks') },
      { key: 'tokens', label: gameText('encyclopedia.tab.tokens') }
    ] : [])
  ];
  let activeTab = 'criaturas';
  let ownershipFilter = 'all'; // 'all' | 'owned'
  let enhancedOnly = false;
  let searchQuery = '';
  const activeRarities = new Set(ENCYCLOPEDIA_RARITIES.map(r => r.key));
  const activeColors = new Set(CARD_BROWSER_COLORS.map(c => c.key));
  const activeArchetypes = new Set();
  const sortByTab = new Map(encyclopediaTabs.map(tab => [tab.key, { key: 'cmc', direction: 'asc' }]));

  const overlay = document.createElement('div');
  overlay.id = 'encyclopedia-overlay';

  const tabsHTML = encyclopediaTabs.map(t =>
    `<button class="encyclopedia-tab${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');

  const rarityFiltersHTML = ENCYCLOPEDIA_RARITIES.map(r =>
    `<label class="encyclopedia-filter-option">
       <input type="checkbox" data-rarity="${r.key}" checked>
       ${r.label}
     </label>`
  ).join('');

  const defaultZoom = document.documentElement.classList.contains('argentinia-mobile') ? 24 : 32;
  const encyclopediaMinZoom = 16;

  overlay.innerHTML = `
    <div class="encyclopedia-header">
      <button class="encyclopedia-back-btn" id="enc-back">← ${gameTextHtml('common.back')}</button>
      <div class="encyclopedia-title">${gameTextHtml('encyclopedia.title')}</div>
      <div class="encyclopedia-progress">${gameTextHtml('encyclopedia.progress', { owned: state.userProfile ? new Set(state.userProfile.collection || []).size : 0, total: POOL_BASELINE.total })}</div>
    </div>
    <div class="encyclopedia-tabs">${tabsHTML}</div>
    <div class="encyclopedia-body">
      <div class="encyclopedia-grid-box" id="enc-grid"></div>
      <div class="encyclopedia-filters">
        <input type="text" class="encyclopedia-search-input" id="enc-search" placeholder="${gameTextHtml('encyclopedia.search.placeholder')}">
        <div class="card-browser-zoom" title="${gameTextHtml('encyclopedia.zoom.title')}">
          <span>🔍</span>
          <input type="range" id="enc-card-zoom" min="${encyclopediaMinZoom}" max="45" step="1" value="${defaultZoom}">
          <span id="enc-card-zoom-value">${defaultZoom}</span>
        </div>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.sort')}</div>
        <div class="card-browser-sort">
          <select id="enc-sort-key" aria-label="Ordenar cartas por">${browserSortOptionsHTML(activeTab, 'cmc')}</select>
          <button type="button" id="enc-sort-direction" class="card-browser-sort-direction" aria-label="Orden creciente" title="Orden creciente">↑</button>
        </div>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.options')}</div>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="all" checked>
          ${gameTextHtml('encyclopedia.filter.all')}
        </label>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="owned">
          ${gameTextHtml('encyclopedia.filter.owned')}
        </label>
        <label class="encyclopedia-filter-option">
          <input type="checkbox" id="enc-enhanced-only">
          ${gameTextHtml('encyclopedia.filter.enhanced')}
        </label>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.color')}</div>
        <div class="card-browser-filter-grid">${browserColorFiltersHTML('enc')}</div>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.rarity')}</div>
        <div class="card-browser-filter-grid">${rarityFiltersHTML}</div>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.archetype')}</div>
        <div class="card-browser-filter-grid archetypes">${browserArchetypeFiltersHTML('enc')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  applyCardZoom(overlay, defaultZoom, { cssVar: '--card-w', unit: 'vh', min: encyclopediaMinZoom, max: 50, fallback: defaultZoom });

  const gridBox = overlay.querySelector('#enc-grid');

  function normalizeSearch(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // 23.13.15 — cada solapa se construye UNA sola vez por apertura de Enciclopedia.
  // Después, filtros/orden sólo ocultan o reordenan los mismos nodos. Volver de
  // Instantáneos a Criaturas ya no recrea 210 <img> ni vuelve a generar candidatos HTTP.
  const tabCache = new Map();

  function ensureTab(tabKey) {
    const entry = createBrowserTabPane(gridBox, tabCache, tabKey);
    if (entry.records.length || entry.empty) return entry;

    const fragment = document.createDocumentFragment();
    const isTokenTab = tabKey === 'tokens';
    const isDfcBackTab = tabKey === 'dfc-backs';
    const isAssetTab = isTokenTab || isDfcBackTab;
    const sourceCards = isTokenTab
      ? buildTokenCatalog(cardDb.allCards)
      : isDfcBackTab
        ? cardDb.allCards.filter(isTransformingDoubleFacedCard).map(card => buildTransformFaceCard(card, 'back'))
        : cardDb.getByCategory(tabKey);
    sourceCards.forEach(card => {
      // Tokens y reversos DFC son superficies Admin de assets, no objetos adicionales de
      // colección: siempre se renderizan a pleno color y no participan de "poseo".
      const owned = isAssetTab ? true : ownedIds.has(card.id);
      const slot = document.createElement('div');
      slot.className = `encyclopedia-card-slot${owned ? '' : ' unowned'}${isTokenTab ? ' encyclopedia-token-slot' : ''}${isDfcBackTab ? ' encyclopedia-dfc-back-slot' : ''}`;
      slot.appendChild(createCardElement(card, false, true, null, 'encyclopedia', null));

      // 23.13.23 — el editor existe EXCLUSIVAMENTE en Enciclopedia y sólo para Admin.
      // La seguridad real del SAVE sigue en Firestore Rules; este gate es además UX.
      if (isAdminUser() && card.image) {
        const artLayoutId = card.isToken ? tokenArtLayoutId(card.image, card.name) : transformFaceLayoutId(card);
        const editArtBtn = document.createElement('button');
        editArtBtn.type = 'button';
        editArtBtn.className = `encyclopedia-art-edit-btn${hasCustomArtLayout(artLayoutId) ? ' has-custom-layout' : ''}`;
        editArtBtn.textContent = '✏️';
        editArtBtn.title = hasCustomArtLayout(artLayoutId)
          ? 'Editar encuadre del arte (personalizado)'
          : 'Editar encuadre del arte';
        editArtBtn.setAttribute('aria-label', `Editar encuadre del arte de ${card.name}`);
        editArtBtn.dataset.artCardId = artLayoutId;
        editArtBtn.addEventListener('click', async event => {
          event.preventDefault();
          event.stopPropagation();
          editArtBtn.disabled = true;
          try {
            await openArtLayoutEditor({
              card,
              layoutId: artLayoutId,
              renderCard: previewCard => createCardElement(previewCard, false, true, null, 'preview', null),
              onSaved: (_layout, meta) => {
                editArtBtn.classList.toggle('has-custom-layout', !!meta?.custom);
                editArtBtn.title = meta?.custom
                  ? 'Editar encuadre del arte (personalizado)'
                  : 'Editar encuadre del arte';
              }
            });
          } catch (error) {
            console.error('No se pudo abrir el editor de arte:', error);
            window.alert(`No se pudo abrir el editor de arte: ${error?.message || error}`);
          } finally {
            if (editArtBtn.isConnected) editArtBtn.disabled = false;
          }
        });
        slot.appendChild(editArtBtn);
      }

      // 23.15.10 — lápiz DENTRO del rules box. Sólo Admin y sólo presentación: no toca
      // el contenido de los JSON. El ajuste se guarda por card.id igual que el encuadre.
      if (isAdminUser()) {
        const textBox = slot.querySelector('.card-text-box');
        const textLayoutId = transformFaceLayoutId(card);
        if (textBox && textLayoutId) {
          textBox.style.position = 'relative';
          const editTextBtn = document.createElement('button');
          editTextBtn.type = 'button';
          editTextBtn.className = `encyclopedia-text-edit-btn${hasCustomCardTextLayout(textLayoutId) ? ' has-custom-layout' : ''}`;
          editTextBtn.textContent = '✏️';
          editTextBtn.title = hasCustomCardTextLayout(textLayoutId)
            ? 'Ajustar texto de la carta (personalizado)'
            : 'Ajustar texto de la carta';
          editTextBtn.setAttribute('aria-label', `Ajustar presentación del texto de ${card.name}`);
          editTextBtn.dataset.textCardId = textLayoutId;
          editTextBtn.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            editTextBtn.disabled = true;
            try {
              await openCardTextLayoutEditor({
                card,
                layoutId: textLayoutId,
                renderCard: previewCard => createCardElement(previewCard, false, true, null, 'preview', null),
                onSaved: (_layout, meta) => {
                  editTextBtn.classList.toggle('has-custom-layout', !!meta?.custom);
                  editTextBtn.title = meta?.custom
                    ? 'Ajustar texto de la carta (personalizado)'
                    : 'Ajustar texto de la carta';
                }
              });
            } catch (error) {
              console.error('No se pudo abrir el editor de texto:', error);
              window.alert(`No se pudo abrir el editor de texto: ${error?.message || error}`);
            } finally {
              if (editTextBtn.isConnected) editTextBtn.disabled = false;
            }
          });
          textBox.appendChild(editTextBtn);
        }
      }

      fragment.appendChild(slot);
      entry.records.push({ card, node: slot, owned, enhanced: isAssetTab ? false : enhancedIds.has(card.id), token: isTokenTab, dfcBack: isDfcBackTab, assetOnly: isAssetTab });
    });
    entry.pane.appendChild(fragment);
    entry.empty = document.createElement('div');
    entry.empty.className = 'encyclopedia-empty-msg';
    entry.empty.textContent = gameText('encyclopedia.empty');
    entry.empty.hidden = true;
    entry.pane.appendChild(entry.empty);
    return entry;
  }

  function refreshGrid() {
    const entry = ensureTab(activeTab);
    activateBrowserTab(tabCache, activeTab);
    const query = normalizeSearch(searchQuery);
    const sort = normalizeCardBrowserSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, sort);
    syncBrowserSortControls(overlay, 'enc', activeTab, sort);

    entry.records.sort((a, b) => compareCardsForBrowser(a.card, b.card, sort));
    let visible = 0;
    entry.records.forEach(record => {
      const card = record.card;
      const matches = record.assetOnly
        ? (!query || normalizeSearch(card.name).includes(query) || normalizeSearch(card.image).includes(query) || normalizeSearch(card.id).includes(query))
        : activeRarities.has(card.rarity) &&
          cardMatchesColorFilter(card, activeColors) &&
          cardMatchesArchetypeFilter(card, activeArchetypes) &&
          (ownershipFilter !== 'owned' || record.owned) &&
          (!enhancedOnly || record.enhanced) &&
          (!query || normalizeSearch(card.name).includes(query));
      record.node.hidden = !matches;
      if (matches) visible += 1;
      entry.pane.appendChild(record.node); // mueve el nodo existente; no recrea su <img>
    });
    entry.empty.textContent = activeTab === 'tokens'
      ? gameText('encyclopedia.tokens.empty')
      : activeTab === 'dfc-backs'
        ? gameText('encyclopedia.dfcBacks.empty')
        : gameText('encyclopedia.empty');
    entry.empty.hidden = visible !== 0;
    entry.pane.appendChild(entry.empty);
    overlay.classList.toggle('encyclopedia-asset-mode', activeTab === 'tokens' || activeTab === 'dfc-backs');
    const searchInput = overlay.querySelector('#enc-search');
    if (searchInput) searchInput.placeholder = activeTab === 'tokens'
      ? gameText('encyclopedia.tokens.search.placeholder')
      : activeTab === 'dfc-backs'
        ? gameText('encyclopedia.dfcBacks.search.placeholder')
        : gameText('encyclopedia.search.placeholder');
  }

  const debouncedSearch = debounce(value => {
    searchQuery = value;
    refreshGrid();
  });
  overlay.querySelector('#enc-search').addEventListener('input', (e) => debouncedSearch(e.target.value));

  overlay.querySelector('#enc-card-zoom').addEventListener('input', e => {
    const zoom = applyCardZoom(overlay, e.target.value, { cssVar: '--card-w', unit: 'vh', min: encyclopediaMinZoom, max: 50, fallback: defaultZoom });
    overlay.querySelector('#enc-card-zoom-value').textContent = zoom;
  });

  overlay.querySelector('#enc-sort-key').addEventListener('change', e => {
    const current = normalizeCardBrowserSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, { ...current, key: e.target.value });
    refreshGrid();
  });
  overlay.querySelector('#enc-sort-direction').addEventListener('click', () => {
    const current = normalizeCardBrowserSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' });
    refreshGrid();
  });

  overlay.querySelectorAll('.encyclopedia-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      overlay.querySelectorAll('.encyclopedia-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshGrid();
    });
  });

  overlay.querySelectorAll('input[name="enc-ownership"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ownershipFilter = radio.value;
      refreshGrid();
    });
  });

  overlay.querySelector('#enc-enhanced-only').addEventListener('change', e => {
    enhancedOnly = e.target.checked;
    refreshGrid();
  });

  overlay.querySelectorAll('input[data-rarity]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const rarity = checkbox.getAttribute('data-rarity');
      if (checkbox.checked) activeRarities.add(rarity);
      else activeRarities.delete(rarity);
      refreshGrid();
    });
  });

  overlay.querySelectorAll('input[data-browser-color][data-filter-prefix="enc"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const color = checkbox.getAttribute('data-browser-color');
      if (checkbox.checked) activeColors.add(color);
      else activeColors.delete(color);
      refreshGrid();
    });
  });

  overlay.querySelectorAll('input[data-browser-archetype][data-filter-prefix="enc"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const archetype = checkbox.getAttribute('data-browser-archetype');
      if (checkbox.checked) activeArchetypes.add(archetype);
      else activeArchetypes.delete(archetype);
      refreshGrid();
    });
  });

  overlay.querySelector('#enc-back').addEventListener('click', () => {
    overlay.remove();
    onBack();
  });

  refreshGrid();

  // Si el Admin entra desde un navegador sin cache, los lápices pueden haberse creado antes
  // de que llegue Firestore. Al completar ambas cargas remotas sincronizamos los indicadores
  // dorados; arte y texto ya actualizan sus superficies visibles desde sus propios módulos.
  if (isAdminUser()) {
    Promise.allSettled([ensureArtLayoutsLoaded(), ensureCardTextLayoutsLoaded()]).then(() => {
      if (!overlay.isConnected) return;
      overlay.querySelectorAll('.encyclopedia-art-edit-btn[data-art-card-id]').forEach(btn => {
        const custom = hasCustomArtLayout(btn.dataset.artCardId || '');
        btn.classList.toggle('has-custom-layout', custom);
        btn.title = custom ? 'Editar encuadre del arte (personalizado)' : 'Editar encuadre del arte';
      });
      overlay.querySelectorAll('.encyclopedia-text-edit-btn[data-text-card-id]').forEach(btn => {
        const custom = hasCustomCardTextLayout(btn.dataset.textCardId || '');
        btn.classList.toggle('has-custom-layout', custom);
        btn.title = custom ? 'Ajustar texto de la carta (personalizado)' : 'Ajustar texto de la carta';
      });
    }).catch(() => {});
  }
}

function injectStoreStyles() {
  if (document.getElementById('store-styles')) return;
  const style = document.createElement('style');
  style.id = 'store-styles';
  style.textContent = `
    #store-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; flex-direction: column;
      padding: 24px 32px;
    }
    .store-header {
      display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-shrink:0; flex-wrap:wrap;
      min-height:48px;
    }
    .store-title { font-size:26px; font-weight:700; color:#f0e0b0; text-shadow:0 0 20px rgba(212,175,55,0.4); white-space:nowrap; }
    .store-header-wallet {
      display:flex; align-items:center; gap:12px; min-width:0; flex-wrap:wrap;
      margin-left:4px;
    }
    .store-header-wallet[hidden] { display:none !important; }
    .store-header-wallet-item {
      display:inline-flex; align-items:center; gap:6px; color:#f0e0b0; font-size:18px; font-weight:850; white-space:nowrap;
    }
    .store-header-wallet-item :is(.coin-icon,.ficha-icon) { width:34px; height:34px; object-fit:contain; }
    .store-header-points-link {
      appearance:none; border:0; background:none; color:#d7c881; padding:4px 0; margin:0;
      font-size:11px; line-height:1.2; text-decoration:underline; text-underline-offset:3px; cursor:pointer; white-space:nowrap;
    }
    .store-header-points-link:hover { color:#fff0b8; }
    .store-body { flex:1; overflow-y:auto; overflow-x:hidden; max-width:1220px; width:100%; margin:0 auto; padding:2px 3px 24px; overscroll-behavior:contain; }
    .store-body.drag-scroll-active { user-select:none; cursor:grabbing; }
    .store-balance-row { display:flex; gap:12px; margin-bottom:18px; justify-content:center; }
    .store-balance-chip {
      background:rgba(18,25,15,0.7); border:1px solid rgba(212,175,55,.55); border-radius:10px;
      padding:9px 14px; text-align:center; min-width:120px;
    }
    .store-balance-value { color:#f0e0b0; font-size:20px; font-weight:700; }
    .store-balance-label { color:#b8adc4; font-size:10px; margin-top:1px; }
    .store-section {
      background: rgba(18,25,15,0.5); border: 2px solid rgba(212,175,55,0.3); border-radius: 14px;
      padding: 24px; margin-bottom: 20px; text-align: center;
    }
    .store-section-title { color: #f0e0b0; font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .store-section-desc { color: #cfe0d4; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }
.store-pack-visual {
    width: 20em;
    height: 20em;
    object-fit: contain;
    margin: 0 auto 10px;
    display: block;
    filter: drop-shadow(0 6px 16px rgba(212,175,55,0.3));
}
    .store-buy-btn {
      background: linear-gradient(180deg, rgba(212,175,55,0.28), rgba(11,19,14,0.96));
      border: 2px solid var(--gold, #d4af37); border-radius: 10px;
      color: #f0e0b0; font-size: 15px; font-weight: 700;
      padding: 11px 26px; cursor: pointer; transition: box-shadow 0.15s ease;
    }
    .store-buy-btn:hover { box-shadow: 0 4px 22px rgba(212,175,55,0.4); }
    .store-buy-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
    .store-error-msg { color: #e07a6b; font-size: 13px; margin-top: 12px; }
    .store-points-info { text-align: left; }
    .store-points-info .store-section-title { text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .store-points-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .store-points-list li {
      color: #cfe0d4; font-size: 13px; padding: 8px 12px;
      background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid rgba(212,175,55,0.5);
    }
    .store-points-list li strong { color: #f0e0b0; }
    .store-points-list li.store-points-penalty { border-left-color: #e07a6b; }
    .store-points-list li.store-points-penalty strong { color: #e07a6b; }
    .store-balance-points { position:relative; }
    .store-points-how-link {
      appearance:none; border:0; background:none; color:#d7c881; padding:5px 0 0; margin:2px 0 -3px;
      font-size:11px; line-height:1.2; text-decoration:underline; text-underline-offset:2px; cursor:pointer;
    }
    .store-points-how-link:hover { color:#fff0b8; }
    .store-points-info { position:relative; margin-top:-10px; }
    .store-points-info[hidden] { display:none !important; }
    .store-points-info-close {
      position:absolute; top:8px; right:10px; width:30px; height:30px; border-radius:50%;
      border:1px solid rgba(212,175,55,.48); background:rgba(8,14,10,.9); color:#f0e0b0;
      font-size:21px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;
    }
    .store-points-info-close:hover { border-color:#d4af37; box-shadow:0 0 14px rgba(212,175,55,.18); }
    .store-market-strip-shell { overflow:visible; margin:0 0 20px; background:transparent; border:0; }
    .store-market-strip {
      display:grid; grid-template-columns:repeat(auto-fit,minmax(245px,1fr)); align-items:stretch; gap:16px;
      overflow:visible; padding:0;
    }
    .store-market-item { min-width:0; max-width:none; min-height:300px; justify-content:flex-start; }
    .store-market-item .chest-item-icon { min-height:112px; }
    .store-market-item .chest-item-desc { flex:1; min-height:0; margin-top:2px; }
    .store-market-count { font-size:23px; line-height:1.15; margin:5px 0 8px; white-space:normal; }
    .store-market-count-classifieds { color:#8dc5e4; }
    .store-market-item .reward-action-btn { width:100%; min-height:42px; }
    .store-market-item .store-error-msg { min-height:16px; margin-top:7px; }
    .store-discount-note { display:inline-block; font-size:11px; color:#f5d777; margin-left:3px; }
    .store-classifieds-icon { width:120px; height:120px; object-fit:contain; filter:drop-shadow(0 5px 12px rgba(116,172,223,.24)); }
    .store-card-grid {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;
      --card-w: 14vh;
      margin: 20px 0;
    }
    .store-ficha-visual { font-size: 40px; }
    .store-craft-list {
      max-height: 50vh; overflow-y: auto;
      display: flex; flex-wrap: wrap; justify-content: center; align-items:flex-start; gap: 14px;
      --card-w: 14vh;
      padding: 10px;
    }
    .store-craft-zoom { max-width:520px; margin:0 auto 12px; }
    .store-craft-card-btn { cursor: pointer; border-radius: 8px; transition: transform 0.15s ease; background: none; border: none; padding: 0; text-align:left; }
    .store-craft-card-btn .card { text-align:left; }
    .store-craft-card-btn:hover { transform: translateY(-4px); }
    .store-keyword-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; }
    .store-keyword-btn {
      background: rgba(255,255,255,0.05); border: 1.5px solid rgba(212,175,55,0.4); border-radius: 8px;
      color: #f0e0b0; font-size: 14px; font-weight: 600; padding: 12px; cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .store-keyword-btn:hover { background: rgba(212,175,55,0.18); border-color: #f0e0b0; }
    .store-back-link {
      appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px;
      background:linear-gradient(180deg,rgba(212,175,55,.10),rgba(8,14,10,.78));
      border:1px solid rgba(212,175,55,.48); border-radius:8px; color:#e7d9af;
      font-size:12px; font-weight:750; line-height:1; cursor:pointer; text-decoration:none;
      min-height:34px; padding:8px 13px; margin-top:10px; transition:background .14s ease,border-color .14s ease,transform .14s ease;
    }
    .store-back-link:hover { color:#fff0c4; border-color:#d4af37; background:rgba(212,175,55,.15); transform:translateY(-1px); }

    /* 23.13.27 — Avisos Clasificados: UI únicamente. La economía/semana provienen del
       backend 23.13.26 y la compra sigue validada por Firestore Rules. */
    .store-classifieds-entry {
      border-color: rgba(116,172,223,0.6);
      background: linear-gradient(135deg, rgba(24,48,58,0.72), rgba(18,25,15,0.62));
      box-shadow: inset 0 0 28px rgba(116,172,223,0.06);
    }
    .classifieds-loading { padding: 42px 18px; color: #cfe0d4; text-align: center; }
    .classifieds-topbar {
      display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .classifieds-week-info { text-align: left; }
    .classifieds-week-title { color:#f0e0b0; font-size:20px; font-weight:800; }
    .classifieds-week-subtitle { color:#b8c9cf; font-size:12px; line-height:1.4; margin-top:3px; }
    .classifieds-countdown {
      min-width: 190px; padding: 9px 13px; border-radius: 10px;
      border: 1px solid rgba(116,172,223,0.5); background: rgba(4,17,22,0.65);
      color:#d8edf5; font-size:12px; font-weight:700; text-align:center;
    }
    .classifieds-balance-row { margin-bottom: 12px; }
    /* 23.13.30 — una sola vidriera horizontal para las siete ofertas. Nada de separar
       Common/Uncommon/Premium en bloques: la rareza queda sólo como acento visual del slot. */
    .classifieds-strip-shell { margin:8px 0 14px; overflow:visible; border:0; background:transparent; }
    .classifieds-strip {
      display:grid; grid-template-columns:repeat(auto-fit,minmax(205px,1fr)); align-items:start; gap:16px;
      overflow:visible; padding:0;
    }
    .classifieds-card-slot {
      --card-w:min(180px,100%); position:relative; display:flex; width:100%; min-width:0; box-sizing:border-box;
      flex-direction:column; align-items:center; gap:8px; padding:11px 9px 12px; border-radius:11px;
      background:rgba(255,255,255,0.028); border:1px solid rgba(255,255,255,0.09);
    }
    .classifieds-card-slot.classifieds-purchased { opacity:.72; }
    .classifieds-card-slot.classifieds-rarity-Mythic { box-shadow:0 0 20px rgba(230,126,34,0.22); border-color:rgba(230,126,34,.34); }
    .classifieds-card-slot.classifieds-rarity-Rare { box-shadow:0 0 18px rgba(212,175,55,0.16); border-color:rgba(212,175,55,.27); }
    .classifieds-card-slot .card { cursor:zoom-in; transition:transform .12s ease, box-shadow .12s ease; }
    .classifieds-card-slot .card:hover { transform:translateY(-3px); box-shadow:0 8px 22px rgba(0,0,0,.55); }
    .classifieds-purchased-badge {
      position:absolute; z-index:4; top:5px; right:5px; padding:4px 7px; border-radius:999px;
      background:rgba(33,92,59,.94); border:1px solid rgba(125,220,160,.7);
      color:#e6ffef; font-size:9px; font-weight:900; letter-spacing:.04em;
    }
    .classifieds-owned { min-height:16px; color:#a9c9b2; font-size:11px; font-weight:700; }
    .classifieds-price {
      display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;
      color:#f0e0b0; font-size:12px; font-weight:800; min-height:21px;
    }
    .classifieds-price-part { display:inline-flex; align-items:center; gap:4px; }
    .classifieds-price :is(.coin-icon,.ficha-icon) { width:16px; height:16px; }
    .classifieds-buy-btn { width:100%; padding:8px 9px; font-size:12px; }
    .classifieds-card-error { min-height:14px; color:#e07a6b; font-size:10px; line-height:1.25; text-align:center; }
    .classifieds-global-error { color:#eaa194; font-size:12px; margin:8px 0 10px; text-align:center; }
    .classifieds-refresh-row { text-align:center; margin-top:6px; }

    .classifieds-preview-overlay {
      position:fixed; inset:0; z-index:10060; display:flex; align-items:center; justify-content:center;
      padding:20px; background:rgba(0,0,0,.82); backdrop-filter:blur(5px); cursor:zoom-out;
    }
    .classifieds-preview-panel {
      --card-w:min(320px, calc(84vh * 5 / 7), 72vw); position:relative; display:flex; align-items:center; justify-content:center;
      filter:drop-shadow(0 20px 38px rgba(0,0,0,.85)); cursor:default;
    }
    .classifieds-preview-panel .card { cursor:default !important; }
    .classifieds-preview-close {
      position:absolute; z-index:8; top:-14px; right:-14px; width:34px; height:34px; border-radius:50%;
      border:1.5px solid rgba(212,175,55,.8); background:#10150f; color:#f0e0b0; font-size:22px; line-height:1;
      display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 5px 16px rgba(0,0,0,.65);
    }

    html.argentinia-mobile #store-overlay { padding:14px 12px; }
    html.argentinia-mobile .store-header { gap:8px 10px; margin-bottom:10px; }
    html.argentinia-mobile .store-title { font-size:19px; }
    html.argentinia-mobile .store-header-wallet { gap:7px; flex:1 1 100%; padding-left:2px; }
    html.argentinia-mobile .store-header-wallet-item { font-size:14px; gap:4px; }
    html.argentinia-mobile .store-header-wallet-item :is(.coin-icon,.ficha-icon) { width:25px; height:25px; }
    html.argentinia-mobile .store-header-points-link { font-size:9px; }
    html.argentinia-mobile .store-body { max-width:none; padding-bottom:16px; }
    html.argentinia-mobile .store-balance-row { gap:8px; margin-bottom:12px; }
    html.argentinia-mobile .store-balance-chip { min-width:0; flex:1; padding:8px 6px; }
    html.argentinia-mobile .store-balance-value { font-size:17px; }
    html.argentinia-mobile .store-market-strip { grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:10px; padding:0; }
    html.argentinia-mobile .store-market-item { min-width:0; min-height:260px; padding:14px; }
    html.argentinia-mobile .store-market-item .chest-item-icon { min-height:92px; }
    html.argentinia-mobile .store-market-item .reward-pack-icon { width:96px; height:96px; }
    html.argentinia-mobile .store-market-item .store-classifieds-icon { width:96px; height:96px; }
    html.argentinia-mobile .store-points-info { margin-top:-4px; padding:20px 16px 16px; }
    html.argentinia-mobile .classifieds-topbar { margin-bottom:8px; }
    html.argentinia-mobile .classifieds-week-title { font-size:15px; }
    html.argentinia-mobile .classifieds-week-subtitle { font-size:9px; }
    html.argentinia-mobile .classifieds-countdown { min-width:150px; padding:6px 9px; font-size:9px; }
    html.argentinia-mobile .classifieds-strip { grid-template-columns:repeat(auto-fit,minmax(158px,1fr)); gap:9px; padding:0; }
    html.argentinia-mobile .classifieds-card-slot { --card-w:min(40dvh,154px); width:100%; min-width:0; padding:7px 7px 8px; gap:5px; }
    html.argentinia-mobile .classifieds-card-slot .card:hover { transform:none; box-shadow:2px 2px 5px rgba(0,0,0,0.5); }
    html.argentinia-mobile .classifieds-owned,
    html.argentinia-mobile .classifieds-price { font-size:9px; min-height:12px; }
    html.argentinia-mobile .classifieds-price :is(.coin-icon,.ficha-icon) { width:13px; height:13px; }
    html.argentinia-mobile .classifieds-buy-btn { padding:6px 7px; font-size:9px; border-width:1px; }
    html.argentinia-mobile .classifieds-card-error { font-size:8px; min-height:10px; }
    html.argentinia-mobile .classifieds-preview-overlay { padding:8px; }
    html.argentinia-mobile .classifieds-preview-panel { --card-w:min(72vw, calc(84dvh * 5 / 7), 280px); }
    .store-section-compact { padding:14px 18px; margin-bottom:14px; }
    .store-section-compact .store-section-desc { margin-bottom:0; }
    .store-nav-row { display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; margin:12px 0 4px; }
    .store-nav-row .store-back-link { margin-top:0; }
    .store-prebuilt-entry { border-color:rgba(112,184,135,.3); }
    .store-prebuilt-icon-wrap { width:120px; height:120px; display:flex; align-items:center; justify-content:center; }
    .store-prebuilt-icon-wrap.image-missing::after { content:'🃏'; font-size:72px; line-height:1; }
    .store-prebuilt-icon { width:120px; height:120px; object-fit:contain; filter:drop-shadow(0 5px 12px rgba(112,184,135,.28)); }
    .prebuilt-strip-shell { overflow:visible; margin-top:10px; }
    .prebuilt-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(235px,1fr)); gap:16px; overflow:visible; padding:6px 0 8px; }
    .prebuilt-product { min-width:0; width:100%; box-sizing:border-box; border:1px solid rgba(212,175,55,.24); border-radius:13px; background:rgba(8,5,12,.62); padding:13px; display:flex; flex-direction:column; gap:7px; }
    .prebuilt-product.purchased { opacity:.68; }
    .prebuilt-product-image { width:100%; aspect-ratio:4/3; object-fit:contain; border-radius:9px; background:rgba(0,0,0,.22); }
    .prebuilt-product-title { color:#f0e0b0; font-size:16px; font-weight:800; line-height:1.15; }
    .prebuilt-product-meta { color:#a9c9b2; font-size:11px; min-height:16px; }
    .prebuilt-price { display:flex; gap:8px; align-items:center; color:#e9d9ad; font-size:12px; }
    .prebuilt-price :is(.coin-icon,.ficha-icon){ width:16px; height:16px; }
    .prebuilt-preview-overlay { position:fixed; inset:0; z-index:12000; background:rgba(0,0,0,.78); display:flex; align-items:center; justify-content:center; padding:18px; }
    .prebuilt-preview-panel { width:min(760px,96vw); max-height:92dvh; overflow:auto; background:linear-gradient(180deg,#191220,#0d0911); border:1px solid rgba(212,175,55,.45); border-radius:16px; padding:20px; box-shadow:0 20px 60px rgba(0,0,0,.65); }
    .prebuilt-preview-top { display:grid; grid-template-columns:minmax(180px,280px) 1fr; gap:20px; align-items:start; }
    .prebuilt-preview-title { color:#f0e0b0; font-size:24px; font-weight:900; }
    .prebuilt-preview-sub { color:#b8c9cf; margin:4px 0 12px; }
    .prebuilt-summary-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 12px; font-size:12px; color:#d7cadb; }
    .prebuilt-summary-grid strong { color:#f0e0b0; }
    .prebuilt-mechanics { margin-top:12px; color:#a9c9b2; font-size:12px; }
    .prebuilt-name-step { margin-top:16px; padding-top:14px; border-top:1px solid rgba(212,175,55,.2); }
    .prebuilt-name-input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid rgba(212,175,55,.35); background:#100b14; color:#f4e7c5; font-size:15px; }
    .prebuilt-actions { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
    .prebuilt-actions .store-buy-btn { flex:1; min-width:170px; }
    html.argentinia-mobile .store-prebuilt-icon-wrap, html.argentinia-mobile .store-prebuilt-icon { width:96px; height:96px; }
    html.argentinia-mobile .store-prebuilt-icon-wrap.image-missing::after { font-size:58px; }
    html.argentinia-mobile .prebuilt-strip { grid-template-columns:repeat(auto-fit,minmax(205px,1fr)); gap:10px; }
    html.argentinia-mobile .prebuilt-product { min-width:0; width:100%; }
    html.argentinia-mobile .prebuilt-preview-top { grid-template-columns:1fr; }
  `;
  document.head.appendChild(style);
}

// FASE 2: Tienda — comprar sobres con puntos, y craftear mejoras permanentes con Fichas.
// Como con la Enciclopedia, reusa createCardElement para dibujar cartas (acá con zone=
// 'encyclopedia', el mismo truco de "zona inerte" para que ningún click dispare una acción
// de juego real) — nada de esto necesitó inventar una forma nueva de mostrar una carta.
export function showStoreScreen(onBack, options = {}) {
  injectStoreStyles();
  injectRewardsStyles(); // 23.13.64 — reutiliza el lenguaje visual exacto de Mi Cofre en la vidriera horizontal.
  injectEncyclopediaStyles(); // .encyclopedia-back-btn: no depender del orden de navegación
  const overlay = document.createElement('div');
  overlay.id = 'store-overlay';
  overlay.innerHTML = `
    <div class="store-header">
      <button class="encyclopedia-back-btn" id="store-back">← ${gameTextHtml('common.back')}</button>
      <div class="store-title" id="store-title">${gameTextHtml('store.title')}</div>
      <div class="store-header-wallet" id="store-header-wallet" hidden></div>
    </div>
    <div class="store-body" id="store-body"></div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#store-back').addEventListener('click', () => {
    leaveClassifiedsView();
    overlay.remove();
    onBack();
  });

  const body = overlay.querySelector('#store-body');
  const storeTitle = overlay.querySelector('#store-title');
  const storeWallet = overlay.querySelector('#store-header-wallet');
  enableDesktopDragScroll(body, { axis: 'y' });

  function renderStoreHeader(title = gameText('store.title'), { showWallet = true } = {}) {
    if (storeTitle) storeTitle.textContent = title;
    if (!storeWallet) return;
    if (!showWallet || !state.currentUser || !state.userProfile) {
      storeWallet.hidden = true;
      storeWallet.replaceChildren();
      return;
    }
    const points = Math.max(0, Math.floor(Number(state.userProfile.points) || 0));
    const fichas = Math.max(0, Math.floor(Number(state.userProfile.fichas) || 0));
    storeWallet.hidden = false;
    storeWallet.innerHTML = `
      <span class="store-header-wallet-item" title="Puntos">${COIN_ICON_HTML}<strong>${points}</strong></span>
      <span class="store-header-wallet-item" title="Fichas">${FICHA_ICON_HTML}<strong>${fichas}</strong></span>
      <button class="store-header-points-link" id="store-header-points-how" type="button">${gameTextHtml('store.pointsHow.link')}</button>
    `;
    storeWallet.querySelector('#store-header-points-how')?.addEventListener('click', () => {
      void renderMainView({ openPointsInfo: true });
    });
  }

  let craftSelectedCardId = null;
  // 23.13.37 craft hotfix — tamaño persistente dentro del selector de criaturas.
  let craftCardZoom = document.documentElement.classList.contains('argentinia-mobile') ? 20 : 14;
  let classifiedsTimerId = null;
  let classifiedsViewSerial = 0;

  function stopClassifiedsTimer() {
    if (classifiedsTimerId !== null) {
      clearInterval(classifiedsTimerId);
      classifiedsTimerId = null;
    }
  }

  function leaveClassifiedsView() {
    classifiedsViewSerial += 1;
    stopClassifiedsTimer();
  }

  // 23.13.64 — "Cómo conseguir puntos" deja de ocupar una sección permanente de la Tienda.
  // Se conserva EXACTAMENTE la misma lista/fuente de valores, pero vive en un panel desplegable
  // asociado al saldo de Puntos. Esto evita duplicar reglas de economía o textos.
  const pointsInfoPanelHTML = `
    <div class="store-section store-points-info" id="store-points-info-panel" hidden>
      <button class="store-points-info-close" id="store-points-info-close" type="button" aria-label="Cerrar">×</button>
      <div class="store-section-title">${COIN_ICON_HTML} ${gameTextHtml('store.pointsHow.title')}</div>
      <ul class="store-points-list">
        <li>${gameTextHtml('store.pointsHow.winHard', { points: POINTS.winVsTanoDificil })}</li>
        <li>${gameTextHtml('store.pointsHow.winMedium', { points: POINTS.winVsTanoMedio })}</li>
        <li>${gameTextHtml('store.pointsHow.winEasy', { points: POINTS.winVsTanoFacil })}</li>
        <li>${gameTextHtml('store.pointsHow.lossSolo', { points: POINTS.lossVsTano })}</li>
        <li>${gameTextHtml('store.pointsHow.winPvp', { points: POINTS.winVsHumano })}</li>
        <li>${gameTextHtml('store.pointsHow.lossPvp', { points: POINTS.lossVsHumano })}</li>
        <li class="store-points-penalty">${gameTextHtml('store.pointsHow.abandon', { points: POINTS.abandonPenalty })}</li>
        <li>${gameTextHtml('store.pointsHow.pvpLimits', { minutes: PVP_LIMITS.minRewardMinutes, turns: PVP_LIMITS.minCompletedTurns, matches: PVP_LIMITS.maxRewardedMatchesPerPairDaily, cap: PVP_LIMITS.maxPointsPerDay })}</li>
      </ul>
    </div>
  `;

  async function renderMainView({ openPointsInfo = false } = {}) {
    leaveClassifiedsView();
    renderStoreHeader(gameText('store.title'), { showWallet: !!state.userProfile });
    if (!state.currentUser) {
      body.innerHTML = `<div id="store-active-events"></div><div class="store-section"><div class="store-section-desc">${gameTextHtml('store.loginRequired')}</div></div>`;
      void renderActiveEventsStrip(body.querySelector('#store-active-events'));
      return;
    }
    if (!state.userProfile) {
      body.innerHTML = `<div id="store-active-events"></div><div class="store-section"><div class="store-section-desc">${gameTextHtml('store.profileMissing')}</div></div>`;
      void renderActiveEventsStrip(body.querySelector('#store-active-events'));
      return;
    }

    const points = state.userProfile.points || 0;
    const fichas = state.userProfile.fichas || 0;
    let campaignSnapshot = null;
    try { campaignSnapshot = await fetchCampaignSnapshot(); } catch {}
    const effectiveCost = effectivePackCost(PACK_COST, campaignSnapshot);
    const packDiscountActive = effectiveCost < PACK_COST;
    const canBuyPack = points >= effectiveCost;
    const canCraft = fichas >= FICHAS_PER_ENHANCEMENT;

    body.innerHTML = `
      <div id="store-active-events"></div>
      ${pointsInfoPanelHTML}
      <div class="store-market-strip-shell">
        <div class="store-market-strip" aria-label="Opciones de la Tienda">
          <div class="chest-item store-market-item store-market-pack">
            <div class="chest-item-icon">${PACK_ICON_HTML}</div>
            <div class="chest-item-title">${gameTextHtml('store.pack.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count">${gameTextHtml('store.pack.showcaseCost', { cost: effectiveCost })}${packDiscountActive ? ` <span class="store-discount-note">(${PACK_COST} → ${effectiveCost})</span>` : ''}</div>
            <div class="chest-item-desc">${gameTextHtml('store.pack.description')}</div>
            <button class="reward-action-btn" id="store-buy-pack" ${canBuyPack ? '' : 'disabled'}>${gameTextHtml('store.pack.buy')}</button>
            <div class="store-error-msg" id="store-buy-error"></div>
          </div>
          <div class="chest-item store-market-item store-market-craft">
            <div class="chest-item-icon">${FICHA_ICON_HTML}</div>
            <div class="chest-item-title">${gameTextHtml('store.craft.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count">${gameTextHtml('store.craft.showcaseCost', { cost: FICHAS_PER_ENHANCEMENT })}</div>
            <div class="chest-item-desc">${gameTextHtml('store.craft.description')}</div>
            <button class="reward-action-btn" id="store-craft" ${canCraft ? '' : 'disabled'}>${canCraft ? gameTextHtml('store.craft.action') : gameTextHtml('store.craft.missing', { count: FICHAS_PER_ENHANCEMENT - fichas })}</button>
          </div>
          <div class="chest-item store-market-item store-prebuilt-entry">
            <div class="chest-item-icon"><div class="store-prebuilt-icon-wrap"><img class="store-prebuilt-icon" src="./assets/images/ui/mazos_prearmados.png" alt="Mazos Prearmados" onerror="this.parentElement.classList.add('image-missing');this.remove()"></div></div>
            <div class="chest-item-title">${gameTextHtml('store.prebuilt.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count">${gameTextHtml('store.prebuilt.showcaseCount')}</div>
            <div class="chest-item-desc">${gameTextHtml('store.prebuilt.description')}</div>
            <button class="reward-action-btn" id="store-prebuilt">${gameTextHtml('store.prebuilt.open')}</button>
          </div>
          <div class="chest-item store-market-item store-classifieds-entry">
            <div class="chest-item-icon"><img class="store-classifieds-icon" src="./assets/images/ui/clasificados.png" alt="Avisos Clasificados"></div>
            <div class="chest-item-title">${gameTextHtml('store.classifieds.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count store-market-count-classifieds">${gameTextHtml('store.classifieds.showcaseCount')}</div>
            <div class="chest-item-desc">${gameTextHtml('store.classifieds.description')}</div>
            <button class="reward-action-btn" id="store-classifieds">${gameTextHtml('store.classifieds.open')}</button>
          </div>
        </div>
      </div>
    `;

    void renderActiveEventsStrip(body.querySelector('#store-active-events'));

    const pointsPanel = body.querySelector('#store-points-info-panel');
    const closePointsPanel = body.querySelector('#store-points-info-close');
    const setPointsPanelOpen = open => {
      if (!pointsPanel) return;
      pointsPanel.hidden = !open;
      if (open) pointsPanel.scrollIntoView({ behavior:'smooth', block:'nearest' });
    };
    closePointsPanel?.addEventListener('click', () => setPointsPanelOpen(false));
    if (openPointsInfo) requestAnimationFrame(() => setPointsPanelOpen(true));

    body.querySelector('#store-prebuilt')?.addEventListener('click', () => {
      void renderPrebuiltDecksView();
    });

    body.querySelector('#store-classifieds').addEventListener('click', () => {
      void renderClassifiedsView();
    });

    body.querySelector('#store-buy-pack').addEventListener('click', async () => {
      const btn = body.querySelector('#store-buy-pack');
      const errBox = body.querySelector('#store-buy-error');
      btn.disabled = true;
      errBox.textContent = '';
      try {
        const purchase = await purchasePack(state.currentUser.uid, PACK_COST);
        state.userProfile = purchase.profile;
        updateAccountUI(state.currentUser);
        renderStoreHeader(gameText('store.title'));
        body.innerHTML = `
          <div class="store-section">
            <img class="store-pack-visual" src="./assets/images/ui/sobres.png" alt="📦" onerror="this.outerHTML='📦'">
            <div class="store-section-title">${gameTextHtml('store.pack.purchasedTitle')}</div>
            <div class="store-section-desc">${gameTextHtml('store.pack.purchasedDescription')}</div>
            <button class="store-buy-btn" id="store-go-chest">${gameTextHtml('store.pack.goChest')}</button>
            <button class="store-back-link" id="store-buy-more">${gameTextHtml('store.pack.backStore')}</button>
          </div>`;
        body.querySelector('#store-go-chest').addEventListener('click', () => {
          overlay.remove();
          showChestScreen(() => showStoreScreen(onBack));
        });
        body.querySelector('#store-buy-more').addEventListener('click', renderMainView);
      } catch (err) {
        console.error('No se pudo comprar el sobre:', err);
        errBox.textContent = err.message || 'No se pudo comprar el sobre. Probá de nuevo.';
        btn.disabled = !canBuyPack;
      }
    });

    if (canCraft) {
      body.querySelector('#store-craft').addEventListener('click', () => renderCraftPickCardView());
    }
  }


  function prebuiltColorLabel(colors=[]) {
    const icons={W:'⚪',U:'🔵',B:'⚫',R:'🔴',G:'🟢'};
    return colors.map(c=>icons[c]||c).join('');
  }

  function prebuiltFriendlyError(error) {
    switch(error?.code) {
      case 'PREBUILT_ALREADY_PURCHASED': return gameText('prebuilt.error.alreadyPurchased');
      case 'PREBUILT_INSUFFICIENT_FUNDS': return gameText('prebuilt.error.insufficientFunds');
      case 'PREBUILT_DECK_LIMIT': return gameText('prebuilt.error.deckLimit');
      case 'PREBUILT_RULES_STALE': return gameText('prebuilt.error.rulesStale');
      default: return error?.message || gameText('prebuilt.error.generic');
    }
  }

  function prebuiltLandSummary(summary) {
    const labels={W:'⚪',U:'🔵',B:'⚫',R:'🔴',G:'🟢',C:'◇',Other:'↔'};
    const parts=Object.entries(summary.landColors||{}).filter(([,n])=>n>0).map(([c,n])=>`${labels[c]||c} ${n}`);
    return parts.length?parts.join(' · '):String(summary.lands||0);
  }

  function openPrebuiltDeckModal(product, summary, purchased) {
    document.querySelectorAll('.prebuilt-preview-overlay').forEach(el=>el.remove());
    const modal=document.createElement('div');
    modal.className='prebuilt-preview-overlay';
    const panel=document.createElement('div'); panel.className='prebuilt-preview-panel';
    const other=Math.max(0,summary.total-summary.lands-summary.creatures);
    const commonLike=(summary.rarity.Common||0);
    const themes=(summary.topThemes||[]).map(t=>t.name).join(' · ') || product.archetypeLabel;
    panel.innerHTML=`
      <div class="prebuilt-preview-top">
        <img class="prebuilt-product-image" src="./assets/images/ui/${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none'">
        <div>
          <div class="prebuilt-preview-title">${escapeHtml(product.name)}</div>
          <div class="prebuilt-preview-sub">${prebuiltColorLabel(product.colors)} · ${escapeHtml(product.archetypeLabel||product.archetypeId)}</div>
          <div class="prebuilt-summary-grid">
            <div><strong>${gameTextHtml('prebuilt.deckSize',{count:summary.total})}</strong></div>
            <div>${gameTextHtml('prebuilt.summary.curve',{average:summary.averageManaValue})}</div>
            <div>${gameTextHtml('prebuilt.summary.types',{lands:summary.lands,creatures:summary.creatures,other})}</div>
            <div>${gameTextHtml('prebuilt.summary.rarity',{mythic:summary.rarity.Mythic||0,rare:summary.rarity.Rare||0,uncommon:summary.rarity.Uncommon||0,common:commonLike})}</div>
            <div style="grid-column:1/-1">${gameTextHtml('prebuilt.summary.lands',{lands:prebuiltLandSummary(summary)})}</div>
          </div>
          <div class="prebuilt-mechanics">${gameTextHtml('prebuilt.summary.mechanics',{themes})}</div>
          <div class="prebuilt-price">${COIN_ICON_HTML} ${PREBUILT_DECK_POINTS} <span>+</span> ${FICHA_ICON_HTML} ${PREBUILT_DECK_FICHAS}</div>
          <div class="prebuilt-actions">
            <button class="store-buy-btn" id="prebuilt-buy" ${purchased?'disabled':''}>${purchased?gameTextHtml('prebuilt.purchased'):gameTextHtml('prebuilt.buy')}</button>
            <button class="store-back-link" id="prebuilt-close">${gameTextHtml('common.close')}</button>
          </div>
          <div class="store-error-msg" id="prebuilt-modal-error"></div>
          <div class="prebuilt-name-step" id="prebuilt-name-step" hidden>
            <label for="prebuilt-name"><strong>${gameTextHtml('prebuilt.nameLabel')}</strong></label>
            <input id="prebuilt-name" class="prebuilt-name-input" maxlength="30" value="${escapeHtml(product.name)}">
            <div class="store-section-desc">${gameTextHtml('prebuilt.nameHint')}</div>
            <button class="store-buy-btn" id="prebuilt-confirm">${gameTextHtml('prebuilt.confirm')}</button>
          </div>
        </div>
      </div>`;
    modal.appendChild(panel); document.body.appendChild(modal);
    const close=()=>modal.remove();
    panel.querySelector('#prebuilt-close').addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    const buy=panel.querySelector('#prebuilt-buy');
    buy?.addEventListener('click',()=>{
      panel.querySelector('#prebuilt-name-step').hidden=false;
      panel.querySelector('#prebuilt-name')?.focus();
      buy.hidden=true;
    });
    panel.querySelector('#prebuilt-confirm')?.addEventListener('click',async()=>{
      const confirm=panel.querySelector('#prebuilt-confirm');
      const err=panel.querySelector('#prebuilt-modal-error');
      const input=panel.querySelector('#prebuilt-name');
      const name=String(input?.value||'').trim();
      if(!name){ err.textContent=gameText('prebuilt.nameLabel'); return; }
      confirm.disabled=true; confirm.textContent=gameText('prebuilt.buying'); err.textContent='';
      try {
        const result=await purchasePrebuiltDeck(state.currentUser.uid,product.id,name);
        state.userProfile=result.profile;
        updateAccountUI(state.currentUser);
        renderStoreHeader(gameText('prebuilt.title'));
        panel.innerHTML=`<div class="prebuilt-preview-title">${gameTextHtml('prebuilt.success')}</div>
          <div class="prebuilt-preview-sub">${escapeHtml(result.deck?.name||name)}</div>
          <div class="prebuilt-actions"><button class="store-buy-btn" id="prebuilt-go-decks">${gameTextHtml('prebuilt.goDecks')}</button><button class="store-back-link" id="prebuilt-success-close">${gameTextHtml('prebuilt.backStore')}</button></div>`;
        panel.querySelector('#prebuilt-go-decks').addEventListener('click',()=>{ modal.remove(); overlay.remove(); showMyDecksScreen(()=>showStoreScreen(onBack,{initialView:'prebuilt'})); });
        panel.querySelector('#prebuilt-success-close').addEventListener('click',()=>{ modal.remove(); void renderPrebuiltDecksView(); });
      } catch(error) {
        console.error('No se pudo comprar el mazo prearmado:',error);
        err.textContent=prebuiltFriendlyError(error);
        confirm.disabled=false; confirm.textContent=gameText('prebuilt.confirm');
      }
    });
  }

  async function renderPrebuiltDecksView() {
    leaveClassifiedsView();
    renderStoreHeader(gameText('prebuilt.title'));
    body.innerHTML=`<div class="store-section classifieds-loading">${gameTextHtml('common.loading')}</div>`;
    try {
      await cardDb.loadAll();
      const catalog=await loadPrebuiltDeckCatalog();
      const purchasedIds=new Set(getPrebuiltPurchaseIds(state.userProfile));
      body.innerHTML=`
        <div class="store-section store-section-compact">
          <div class="store-section-desc">${gameTextHtml('prebuilt.subtitle')}</div>
        </div>
        <div class="prebuilt-strip-shell"><div class="prebuilt-strip" id="prebuilt-strip"></div></div>
        <div class="store-nav-row"><button class="store-back-link" id="prebuilt-back">${gameTextHtml('prebuilt.backStore')}</button></div>`;
      const strip=body.querySelector('#prebuilt-strip');
      for(const product of catalog.products) {
        const purchased=purchasedIds.has(product.id);
        const summary=summarizePrebuiltDeck(product,cardDb.allCards);
        const card=document.createElement('div'); card.className=`prebuilt-product${purchased?' purchased':''}`;
        card.innerHTML=`<img class="prebuilt-product-image" src="./assets/images/ui/${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.style.visibility='hidden'">
          <div class="prebuilt-product-title">${escapeHtml(product.name)}</div>
          <div class="prebuilt-product-meta">${prebuiltColorLabel(product.colors)} · ${escapeHtml(product.archetypeLabel||product.archetypeId)} · ${summary.lands} Tierras</div>
          <div class="prebuilt-price">${COIN_ICON_HTML} ${PREBUILT_DECK_POINTS} <span>+</span> ${FICHA_ICON_HTML} ${PREBUILT_DECK_FICHAS}</div>
          <button class="store-buy-btn prebuilt-view">${purchased?gameTextHtml('prebuilt.purchased'):gameTextHtml('prebuilt.view')}</button>`;
        card.querySelector('.prebuilt-view').addEventListener('click',()=>openPrebuiltDeckModal(product,summary,purchased));
        strip.appendChild(card);
      }
      body.querySelector('#prebuilt-back').addEventListener('click',renderMainView);
    } catch(error) {
      console.error('No se pudo cargar Mazos Prearmados:',error);
      body.innerHTML=`<div class="store-section"><div class="store-section-title">${gameTextHtml('prebuilt.title')}</div><div class="store-error-msg">${escapeHtml(error?.message||gameText('prebuilt.error.generic'))}</div><button class="store-back-link" id="prebuilt-error-back">${gameTextHtml('prebuilt.backStore')}</button></div>`;
      body.querySelector('#prebuilt-error-back').addEventListener('click',renderMainView);
    }
  }

  function toClassifiedsDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatClassifiedsCountdown(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  function formatClassifiedsRotationDate(date) {
    const d = toClassifiedsDate(date);
    if (!d) return 'próximo lunes a las 00:00';
    try {
      return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch (_) {
      return 'próximo lunes a las 00:00';
    }
  }

  function classifiedsFriendlyError(error) {
    switch (error?.code) {
      case 'CLASSIFIEDS_ALREADY_PURCHASED': return gameText('classifieds.error.alreadyPurchased');
      case 'CLASSIFIEDS_INSUFFICIENT_FUNDS': return gameText('classifieds.error.insufficientFunds');
      case 'CLASSIFIEDS_CARD_NOT_OFFERED': return gameText('classifieds.error.offerChanged');
      case 'CLASSIFIEDS_WEEK_NOT_PUBLISHED': return gameText('classifieds.error.notPublished');
      default: return error?.message || gameText('classifieds.error.generic');
    }
  }

  function syncClassifiedsOfferWithProfile(offer, profile) {
    if (!offer || !profile) return offer;
    const weekly = getClassifiedsProfileState(profile, offer.weekKey);
    return {
      ...offer,
      profile,
      purchased: weekly.purchased,
      purchaseCounts: weekly.counts,
      entries: (offer.entries || []).map(entry => ({
        ...entry,
        ownedCount: countOwnedClassifiedCard(profile, entry.cardId),
        purchased: weekly.purchased.includes(entry.cardId)
      }))
    };
  }

  function showClassifiedsCardPreview(card) {
    if (!card) return;
    document.querySelectorAll('.classifieds-preview-overlay').forEach(el => el.remove());
    const preview = document.createElement('div');
    preview.className = 'classifieds-preview-overlay';
    preview.setAttribute('role', 'dialog');
    preview.setAttribute('aria-modal', 'true');
    preview.setAttribute('aria-label', `Vista ampliada de ${card.name || 'carta'}`);

    const panel = document.createElement('div');
    panel.className = 'classifieds-preview-panel';
    panel.addEventListener('click', event => event.stopPropagation());
    panel.appendChild(createCardElement(card, false, true, null, 'preview', null));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'classifieds-preview-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Cerrar vista ampliada');
    panel.appendChild(close);
    preview.appendChild(panel);
    document.body.appendChild(preview);

    const closePreview = () => {
      document.removeEventListener('keydown', onKeyDown);
      preview.remove();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') closePreview();
    };
    preview.addEventListener('click', closePreview);
    close.addEventListener('click', event => { event.stopPropagation(); closePreview(); });
    document.addEventListener('keydown', onKeyDown);
  }

  function renderClassifiedsOffer(offer, viewSerial) {
    if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
    stopClassifiedsTimer();

    state.userProfile = offer.profile || state.userProfile;
    updateAccountUI(state.currentUser);
    const points = Math.max(0, Math.floor(Number(state.userProfile?.points) || 0));
    const fichas = Math.max(0, Math.floor(Number(state.userProfile?.fichas) || 0));
    const serverNow = toClassifiedsDate(offer.serverNow) || new Date();
    const rotationAt = toClassifiedsDate(offer.nextRotationAt) || classifiedsNextRotationAt(serverNow);
    const serverAnchorMs = serverNow.getTime();
    const localAnchorMs = Date.now();
    const premiumLabel = offer.premiumRarity === 'Mythic' ? 'Mítica' : 'Rara';

    renderStoreHeader(gameText('classifieds.title'));
    body.innerHTML = `
      <div class="classifieds-topbar">
        <div class="classifieds-week-info">
          <div class="classifieds-week-subtitle">${gameTextHtml('classifieds.weekSubtitle', { weekKey: offer.weekKey, premium: premiumLabel })}</div>
        </div>
        <div class="classifieds-countdown" id="classifieds-countdown"></div>
      </div>
      <div class="classifieds-global-error" id="classifieds-global-error"></div>
      <div class="classifieds-strip-shell">
        <div class="classifieds-strip" id="classifieds-strip" aria-label="Siete Avisos Clasificados de esta semana"></div>
      </div>
      <div class="classifieds-refresh-row store-nav-row">
        <button class="store-back-link" id="classifieds-back">${gameTextHtml('classifieds.backStore')}</button>
        <button class="store-back-link" id="classifieds-refresh">↻ ${gameTextHtml('classifieds.refresh')}</button>
      </div>
    `;

    const countdown = body.querySelector('#classifieds-countdown');
    const tick = () => {
      if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return stopClassifiedsTimer();
      const estimatedServerNow = serverAnchorMs + (Date.now() - localAnchorMs);
      const remaining = rotationAt.getTime() - estimatedServerNow;
      countdown.textContent = remaining > 0
        ? gameText('classifieds.countdown', { remaining: formatClassifiedsCountdown(remaining), rotation: formatClassifiedsRotationDate(rotationAt) })
        : gameText('classifieds.rotating');
      if (remaining <= 0) {
        stopClassifiedsTimer();
        setTimeout(() => {
          if (overlay.isConnected && viewSerial === classifiedsViewSerial) void renderClassifiedsView();
        }, 250);
      }
    };
    tick();
    classifiedsTimerId = window.setInterval(tick, 30000);

    const strip = body.querySelector('#classifieds-strip');

    (offer.entries || []).forEach(entry => {
      const card = cardDb.getById(entry.cardId);
      if (!card) return;
      const slot = document.createElement('div');
      slot.className = `classifieds-card-slot classifieds-rarity-${entry.rarity}${entry.purchased ? ' classifieds-purchased' : ''}`;
      if (entry.purchased) {
        const badge = document.createElement('div');
        badge.className = 'classifieds-purchased-badge';
        badge.textContent = gameText('classifieds.purchased');
        slot.appendChild(badge);
      }

      const cardEl = createCardElement(card, false, true, null, 'encyclopedia', null);
      cardEl.setAttribute('role', 'button');
      cardEl.setAttribute('tabindex', '0');
      cardEl.setAttribute('aria-label', `Ver ${card.name || 'carta'} en grande`);
      cardEl.addEventListener('click', event => { event.stopPropagation(); showClassifiedsCardPreview(card); });
      cardEl.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showClassifiedsCardPreview(card);
        }
      });
      slot.appendChild(cardEl);

      const owned = document.createElement('div');
      owned.className = 'classifieds-owned';
      owned.textContent = entry.ownedCount > 0 ? gameText('classifieds.owned', { count: entry.ownedCount }) : '';
      slot.appendChild(owned);

      const price = document.createElement('div');
      price.className = 'classifieds-price';
      price.innerHTML = `<span class="classifieds-price-part">${COIN_ICON_HTML} ${entry.points}</span><span>+</span><span class="classifieds-price-part">${FICHA_ICON_HTML} ${entry.fichas}</span>`;
      slot.appendChild(price);

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'store-buy-btn classifieds-buy-btn';
      const canAfford = points >= entry.points && fichas >= entry.fichas;
      buy.disabled = entry.purchased || !canAfford;
      buy.textContent = entry.purchased ? gameText('classifieds.purchased') : (canAfford ? gameText('classifieds.buy') : gameText('classifieds.noFunds'));
      slot.appendChild(buy);

      const errorBox = document.createElement('div');
      errorBox.className = 'classifieds-card-error';
      slot.appendChild(errorBox);

      if (!entry.purchased) {
        buy.addEventListener('click', async () => {
          if (!state.currentUser || buy.disabled) return;
          buy.disabled = true;
          errorBox.textContent = '';
          const oldLabel = buy.textContent;
          buy.textContent = gameText('classifieds.buying');
          try {
            const updatedProfile = await purchaseClassifiedCard(state.currentUser.uid, entry.cardId);
            if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
            state.userProfile = updatedProfile;
            updateAccountUI(state.currentUser);
            renderStoreHeader(gameText('classifieds.title'));
            const synced = syncClassifiedsOfferWithProfile(offer, updatedProfile);
            // Conserva el ancla temporal real: no reiniciamos el countdown al serverNow
            // viejo cada vez que se compra una carta. También preservamos scroll para que
            // comprar una oferta de abajo no te mande de vuelta al comienzo de la lista.
            synced.serverNow = new Date(serverAnchorMs + (Date.now() - localAnchorMs));
            synced.nextRotationAt = rotationAt;
            const previousScrollTop = body.scrollTop;
            renderClassifiedsOffer(synced, viewSerial);
            body.scrollTop = previousScrollTop;
          } catch (error) {
            console.error('No se pudo comprar el Aviso Clasificado:', error);
            if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
            errorBox.textContent = classifiedsFriendlyError(error);
            buy.textContent = oldLabel;
            buy.disabled = !canAfford;
            if (['CLASSIFIEDS_ALREADY_PURCHASED', 'CLASSIFIEDS_CARD_NOT_OFFERED', 'CLASSIFIEDS_WEEK_NOT_PUBLISHED'].includes(error?.code)) {
              setTimeout(() => {
                if (overlay.isConnected && viewSerial === classifiedsViewSerial) void renderClassifiedsView();
              }, 500);
            }
          }
        });
      }

      strip?.appendChild(slot);
    });

    body.querySelector('#classifieds-back').addEventListener('click', renderMainView);
    body.querySelector('#classifieds-refresh').addEventListener('click', () => void renderClassifiedsView());
  }

  async function renderClassifiedsView() {
    if (!state.currentUser || !state.userProfile) return renderMainView();
    leaveClassifiedsView();
    renderStoreHeader(gameText('classifieds.title'));
    const viewSerial = classifiedsViewSerial;
    body.innerHTML = `<div class="store-section classifieds-loading">${gameTextHtml('classifieds.loading')}</div>`;
    try {
      let offer;
      try {
        offer = await fetchCurrentClassifieds(state.currentUser.uid);
      } catch (error) {
        // El Admin puede haber desplegado una release nueva antes de que exista el primer
        // calendario. Intentamos publicarlo una sola vez y reconsultamos; usuarios normales
        // jamás reciben este privilegio porque ensureClassifiedsSchedule() retorna not_admin.
        if (error?.code === 'CLASSIFIEDS_WEEK_NOT_PUBLISHED' && isAdminUser()) {
          await ensureClassifiedsSchedule();
          offer = await fetchCurrentClassifieds(state.currentUser.uid);
        } else {
          throw error;
        }
      }
      if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
      renderClassifiedsOffer(offer, viewSerial);
    } catch (error) {
      console.error('No se pudieron cargar los Avisos Clasificados:', error);
      if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
      body.innerHTML = `
        <div class="store-section">
          <div class="store-section-title">${gameTextHtml('classifieds.title')}</div>
          <div class="store-error-msg" id="classifieds-load-error"></div>
          <button class="store-buy-btn" id="classifieds-retry">${gameTextHtml('common.retry')}</button>
          <button class="store-back-link" id="classifieds-error-back">${gameTextHtml('classifieds.backStore')}</button>
        </div>`;
      body.querySelector('#classifieds-load-error').textContent = classifiedsFriendlyError(error);
      body.querySelector('#classifieds-retry').addEventListener('click', () => void renderClassifiedsView());
      body.querySelector('#classifieds-error-back').addEventListener('click', renderMainView);
    }
  }

  function renderPackRevealView(packCards) {
    const gridHTML = packCards.map(card => {
      const el = createCardElement(card, false, true, null, 'encyclopedia', null);
      return el.outerHTML;
    }).join('');

    body.innerHTML = `
      <div class="store-section">
        <div class="store-section-title">🎉 ¡Sobre abierto!</div>
        <div class="store-section-desc">${FICHA_ICON_HTML} +1 Ficha (van ${state.userProfile.fichas || 0} en total)</div>
      </div>
      <div class="store-card-grid">${gridHTML}</div>
      <div style="text-align:center;"><button class="store-buy-btn" id="store-continue">Continuar</button></div>
    `;
    body.querySelector('#store-continue').addEventListener('click', renderMainView);
  }

  function renderCraftPickCardView() {
    const enhancements = state.userProfile.enhancements || {};
    const ownedUnique = [...new Set(state.userProfile.collection || [])];
    const eligibleCards = ownedUnique
      .filter(id => !enhancements[id])
      .map(id => cardDb.getById(id))
      .filter(card => isEnhancementEligibleCard(card));

    if (eligibleCards.length === 0) {
      body.innerHTML = `
        <div class="store-section">
          <div class="store-section-desc">${gameTextHtml('store.craft.noneEligible')}</div>
          <button class="store-back-link" id="store-craft-back">← ${gameTextHtml('common.back')}</button>
        </div>
      `;
      body.querySelector('#store-craft-back').addEventListener('click', renderMainView);
      return;
    }

    body.innerHTML = `
      <div class="store-section">
        <div class="store-section-title">${gameTextHtml('store.craft.chooseTitle')}</div>
        <div class="store-section-desc">${gameTextHtml('store.craft.chooseDescription', { cost: FICHAS_PER_ENHANCEMENT })}</div>
        <div class="card-browser-zoom store-craft-zoom" title="Cambiar tamaño de las criaturas">
          <span>🔍</span>
          <input type="range" id="store-craft-card-zoom" min="8" max="40" step="1" value="${craftCardZoom}">
          <span id="store-craft-card-zoom-value">${craftCardZoom}</span>
        </div>
        <div class="store-craft-list" id="store-craft-list"></div>
        <button class="store-back-link" id="store-craft-cancel">← ${gameTextHtml('common.cancel')}</button>
      </div>
    `;

    const list = body.querySelector('#store-craft-list');
    const zoomSlider = body.querySelector('#store-craft-card-zoom');
    const zoomValue = body.querySelector('#store-craft-card-zoom-value');
    const syncCraftZoom = () => {
      craftCardZoom = setBrowserCardZoom(list, zoomSlider.value);
      if (zoomValue) zoomValue.textContent = String(craftCardZoom);
    };
    zoomSlider.addEventListener('input', syncCraftZoom);
    syncCraftZoom();

    eligibleCards.forEach(card => {
      const btn = document.createElement('button');
      btn.className = 'store-craft-card-btn';
      const cardEl = createCardElement(card, false, true, null, 'encyclopedia', null);
      btn.appendChild(cardEl);
      btn.addEventListener('click', () => {
        craftSelectedCardId = card.id;
        renderCraftPickKeywordView(card);
      });
      list.appendChild(btn);
    });

    body.querySelector('#store-craft-cancel').addEventListener('click', renderMainView);
  }

  function renderCraftPickKeywordView(card) {
    const keywordButtonsHTML = ENHANCEMENT_KEYWORDS.map(k =>
      `<button class="store-keyword-btn" data-keyword="${k.key}">${k.label}</button>`
    ).join('');

    body.innerHTML = `
      <div class="store-section">
        <div class="store-section-title">${card.name} — elegí la keyword</div>
        <div class="store-keyword-grid">${keywordButtonsHTML}</div>
        <div class="store-error-msg" id="store-craft-error"></div>
        <button class="store-back-link" id="store-craft-back">← Elegir otra carta</button>
      </div>
    `;

    body.querySelectorAll('.store-keyword-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const keyword = btn.getAttribute('data-keyword');
        const errBox = body.querySelector('#store-craft-error');
        body.querySelectorAll('.store-keyword-btn').forEach(b => b.disabled = true);
        try {
          const updated = await craftEnhancement(state.currentUser.uid, craftSelectedCardId, keyword, FICHAS_PER_ENHANCEMENT);
          state.userProfile = updated;
          renderMainView();
        } catch (err) {
          console.error('No se pudo craftear la mejora:', err);
          errBox.textContent = err.message || 'No se pudo craftear la mejora. Probá de nuevo.';
          body.querySelectorAll('.store-keyword-btn').forEach(b => b.disabled = false);
        }
      });
    });

    body.querySelector('#store-craft-back').addEventListener('click', renderCraftPickCardView);
  }

  renderMainView();
  if (options.initialView === 'craft' && state.userProfile && (state.userProfile.fichas || 0) >= FICHAS_PER_ENHANCEMENT) {
    renderCraftPickCardView();
  } else if (options.initialView === 'classifieds' && state.userProfile) {
    void renderClassifiedsView();
  } else if (options.initialView === 'prebuilt' && state.userProfile) {
    void renderPrebuiltDecksView();
  }
}

function injectMyDecksStyles() {
  if (document.getElementById('mydecks-styles')) return;
  const style = document.createElement('style');
  style.id = 'mydecks-styles';
  style.textContent = `
    #mydecks-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; flex-direction: column;
      padding: 24px 32px;
      --card-w: 14vh;
    }
    .mydecks-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-shrink: 0; }
    .mydecks-title { font-size: 26px; font-weight: 700; color: #f0e0b0; text-shadow: 0 0 20px rgba(212,175,55,0.4); }
    .mydecks-body { flex:1; overflow-y:auto; max-width:1180px; width:100%; margin:0 auto; padding:2px 3px 24px; overscroll-behavior:contain; }
    .mydecks-body.drag-scroll-active { user-select:none; cursor:grabbing; }
    .mydecks-slots-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px;
    }
    .mydecks-slot {
      appearance:none; -webkit-appearance:none; width:100%; font:inherit; color:inherit;
      border-radius: 12px; padding: 20px; text-align: center; min-height: 100px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    }
    .mydecks-slot-filled {
      background: linear-gradient(180deg, rgba(18,25,15,0.92), rgba(11,19,14,0.96));
      border: 2px solid var(--gold, #d4af37);
      cursor: pointer; transition: box-shadow 0.15s ease, transform 0.15s ease;
    }
    .mydecks-slot-filled:hover { box-shadow: 0 4px 22px rgba(212,175,55,0.35); transform: translateY(-3px); }
    .mydecks-slot-name { color: #f0e0b0; font-size: 16px; font-weight: 700; }
    .mydecks-slot-count { color: #b8adc4; font-size: 12px; }
    .mydecks-slot-badge {
      background: rgba(212,175,55,0.2); border: 1px solid var(--gold, #d4af37); border-radius: 6px;
      color: #f0e0b0; font-size: 10px; font-weight: 700; padding: 2px 8px; text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .mydecks-slot-empty {
      background: rgba(255,255,255,0.02); border: 1.5px dashed rgba(212,175,55,0.4);
      color: #d4af37; font-size: 14px; cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .mydecks-slot-empty:hover { background: rgba(212,175,55,0.08); border-color: #f0e0b0; color: #f0e0b0; }
    .mydecks-detail-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
    .mydecks-detail-title { color:#f0e0b0; font-size:18px; font-weight:700; flex:1 1 260px; }
    .mydecks-detail-zoom { width:min(280px,100%); margin:0; flex:0 1 280px; }
    @media (max-width:700px) {
      #mydecks-overlay { padding:14px 12px; }
      .mydecks-header { gap:10px; margin-bottom:12px; }
      .mydecks-title { font-size:20px; }
      .mydecks-detail-title { flex-basis:100%; order:-1; }
      .mydecks-detail-zoom { flex:1 1 100%; width:100%; }
    }
  `;
  document.head.appendChild(style);
}

function injectDeckBuilderStyles() {
  if (document.getElementById('deckbuilder-styles')) return;
  const style = document.createElement('style');
  style.id = 'deckbuilder-styles';
  style.textContent = `
    #deckbuilder-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; flex-direction: column;
      padding: 24px 32px;
      --card-w: 12vh;
    }
    .deckbuilder-header { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; flex-shrink: 0; flex-wrap: wrap; }
    .deckbuilder-name { color: #f0e0b0; font-size: 20px; font-weight: 700; flex: 1; }
    .deckbuilder-body { flex: 1; display: flex; gap: 16px; min-height: 0; margin-top: 12px; }
    .deckbuilder-pool { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    .deckbuilder-pool-card-wrap {
      position: relative; cursor: pointer; transition: transform 0.15s ease; overflow: visible;
      /* No content-visibility acá: su paint containment recortaba el badge x/4 que vive
         deliberadamente fuera de la carta. Las imágenes siguen loading=lazy/fetchpriority=low. */
    }
    #deckbuilder-grid { padding-top: 34px; row-gap: 30px; }
    .deckbuilder-pool-card-wrap:hover { transform: translateY(-3px); }
    .deckbuilder-pool-card-wrap.maxed { opacity: 0.4; cursor: not-allowed; }
    .deckbuilder-pool-card-wrap.maxed:hover { transform: none; }
    .deckbuilder-pool-card-badge {
      position: absolute; top: -20px; left: 50%; right: auto; transform: translateX(-50%);
      background: rgba(0,0,0,0.88); color: #f0e0b0;
      border: 1px solid var(--gold, #d4af37); border-radius: 999px; font-size: 11px; font-weight: 700;
      padding: 2px 7px; pointer-events: none; white-space: nowrap; z-index: 20;
    }
    .deckbuilder-filters { width: 220px; flex-shrink: 0; }
    .deckbuilder-side { width: 330px; flex-shrink: 0; display: flex; flex-direction: column; min-width: 0; }
    .deckbuilder-side-title { color: #f0e0b0; font-size: 14px; font-weight: 700; margin-bottom: 8px; }
    .deckbuilder-pool-card-wrap.enhanced .card { outline: 2px solid #d4af37; outline-offset: 2px; border-radius: 8px; }
    .deckbuilder-enhanced-marker {
      position: absolute; bottom: 4px; left: 4px; right: 4px; text-align: center;
      background: rgba(212,175,55,0.92); color: #1a1408;
      border-radius: 6px; font-size: 10px; font-weight: 700; padding: 2px 4px;
      pointer-events: none; z-index: 10;
    }
    .deckbuilder-list {
      flex: 1; overflow-y: auto;
      background: rgba(0,0,0,0.2); border: 2px solid rgba(212,175,55,0.3); border-radius: 10px; padding: 8px;
    }
    .deckbuilder-type-group + .deckbuilder-type-group { margin-top: 12px; }
    .deckbuilder-type-header {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:7px 8px; border-radius:7px;
      background:linear-gradient(90deg,rgba(212,175,55,.18),rgba(212,175,55,.04));
      border-left:3px solid #d4af37; color:#f5e7bd; font-size:11px; font-weight:800; letter-spacing:.45px;
    }
    .deckbuilder-type-header-count { color:#fff3cc; white-space:nowrap; }
    .deckbuilder-type-header-mv { color:#cbbf9f; font-size:10px; font-weight:700; white-space:nowrap; }
    .deckbuilder-cmc-group { margin-top:5px; padding-left:7px; }
    .deckbuilder-cmc-title {
      color:#a99362; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.55px;
      padding:4px 3px 2px; border-bottom:1px solid rgba(212,175,55,.12);
    }
    .deckbuilder-list-item {
      display:flex; align-items:center; justify-content:space-between; gap:6px;
      min-width:0; padding:4px 2px 4px 6px; border-bottom:1px solid rgba(255,255,255,0.045); font-size:12px; color:#e8ddc8;
    }
    .deckbuilder-list-item:last-child { border-bottom:none; }
    .deckbuilder-list-card-name {
      flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:help;
      border-radius:4px; padding:2px 3px; transition:background .12s ease,color .12s ease;
    }
    .deckbuilder-list-card-name:hover { background:rgba(212,175,55,.12); color:#fff1c5; }
    .deckbuilder-list-remove {
      background:none; border:1px solid rgba(224,122,107,0.5); color:#e07a6b; border-radius:5px;
      width:20px; height:20px; cursor:pointer; font-size:13px; line-height:1; flex-shrink:0;
    }
    .deckbuilder-list-remove:hover { background:rgba(224,122,107,0.15); }
    .deckbuilder-empty-hint { color:#7a7086; font-size:13px; text-align:center; padding:20px 10px; }
    .deckbuilder-card-preview {
      position:fixed; z-index:10060; pointer-events:none; opacity:0;
      transform:scale(.94); transform-origin:center; transition:opacity .12s ease,transform .12s ease;
      filter:drop-shadow(0 14px 24px rgba(0,0,0,.65));
    }
    .deckbuilder-card-preview.visible { opacity:1; transform:scale(1); }
    .deckbuilder-card-preview .card { cursor:default !important; }
    .deckbuilder-card-preview-close { display:none; }
    .deckbuilder-card-preview.touch {
      left:50% !important; top:50% !important; transform:translate(-50%,-50%) scale(.96);
      pointer-events:auto; padding:10px; border-radius:12px;
      background:rgba(9,16,12,.96); border:1px solid rgba(212,175,55,.75);
      box-shadow:0 18px 50px rgba(0,0,0,.75); filter:none;
    }
    .deckbuilder-card-preview.touch.visible { transform:translate(-50%,-50%) scale(1); }
    .deckbuilder-card-preview.touch .deckbuilder-card-preview-close {
      display:block; position:absolute; right:-9px; top:-9px; width:26px; height:26px; border-radius:50%;
      border:1px solid #d4af37; background:#151a16; color:#f5e7bd; font-weight:900; cursor:pointer; z-index:2;
    }
    .deckbuilder-name-input {
      flex:1; min-width:180px; max-width:420px; height:38px; padding:7px 11px; border-radius:8px;
      border:1.5px solid rgba(212,175,55,.72); background:rgba(4,12,8,.86); color:#f0e0b0;
      font:700 18px Georgia,serif; outline:none;
    }
    .deckbuilder-name-input:focus { border-color:#f0d26a; box-shadow:0 0 0 2px rgba(212,175,55,.13); }
    .deckbuilder-stats-btn {
      width:100%; margin:0 0 8px; padding:9px 10px; border-radius:8px; cursor:pointer;
      border:1px solid rgba(212,175,55,.62); color:#f6e7b7; background:linear-gradient(180deg,rgba(43,55,31,.92),rgba(14,24,17,.96));
      font-weight:800; letter-spacing:.15px;
    }
    .deckbuilder-stats-btn:hover { border-color:#f2d267; box-shadow:0 0 16px rgba(212,175,55,.18); }
    .deck-stats-overlay { position:fixed; inset:0; z-index:10120; background:rgba(2,7,4,.82); display:grid; place-items:center; padding:24px; }
    .deck-stats-modal {
      width:min(980px,94vw); max-height:90vh; overflow:auto; border:2px solid rgba(212,175,55,.7); border-radius:16px;
      background:radial-gradient(circle at 50% 0%,rgba(45,58,37,.98),rgba(8,16,11,.99) 58%); color:#e9dfc9;
      box-shadow:0 26px 80px rgba(0,0,0,.78); padding:18px;
    }
    .deck-stats-header { display:flex; align-items:center; gap:12px; position:sticky; top:-18px; z-index:2; padding:10px 0 12px; background:rgba(8,16,11,.96); }
    .deck-stats-title { flex:1; color:#f4e3ae; font:800 23px Georgia,serif; }
    .deck-stats-close { width:34px; height:34px; border-radius:50%; border:1px solid #d4af37; background:#151a16; color:#f5e7bd; font-size:20px; cursor:pointer; }
    .deck-stats-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .deck-stats-panel { background:rgba(0,0,0,.2); border:1px solid rgba(212,175,55,.25); border-radius:12px; padding:13px; min-width:0; }
    .deck-stats-panel.wide { grid-column:1/-1; }
    .deck-stats-panel h4 { margin:0 0 10px; color:#e8ce7b; font-size:13px; letter-spacing:.6px; text-transform:uppercase; }
    .deck-stats-kpis { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
    .deck-stats-kpi { text-align:center; padding:9px 5px; border-radius:9px; background:rgba(255,255,255,.035); }
    .deck-stats-kpi strong { display:block; color:#fff0bd; font-size:20px; }
    .deck-stats-kpi span { color:#a99e87; font-size:10px; }
    .deck-curve-row,.deck-color-row { display:grid; grid-template-columns:42px 1fr 34px; align-items:center; gap:8px; margin:6px 0; font-size:11px; }
    .deck-curve-track { height:11px; background:rgba(255,255,255,.07); border-radius:999px; overflow:hidden; }
    .deck-curve-fill { height:100%; background:linear-gradient(90deg,#866c27,#e3bf49); border-radius:inherit; }
    .deck-color-row { grid-template-columns:115px 1fr; }
    .deck-color-row .deck-color-values { display:flex; justify-content:flex-end; gap:14px; font-variant-numeric:tabular-nums; }
    .deck-health-list { display:flex; flex-direction:column; gap:7px; }
    .deck-health-item { border-radius:8px; padding:8px 10px; font-size:11px; border-left:4px solid #8c805d; background:rgba(255,255,255,.03); }
    .deck-health-item.ok { border-color:#58b875; }.deck-health-item.warn { border-color:#d6a73a; }.deck-health-item.danger { border-color:#df655b; }
    .deck-health-item strong { color:#f1e7ce; }.deck-health-item span { color:#aaa08d; }
    .deck-hand-sim-intro { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .deck-hand-sim-btn { border:1px solid #d4af37; background:#272314; color:#f7e8b5; border-radius:9px; padding:9px 14px; font-weight:800; cursor:pointer; }
    .deck-hand-results { margin-top:11px; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    .deck-hand-metric { border-radius:9px; background:rgba(255,255,255,.035); padding:9px; text-align:center; }
    .deck-hand-metric strong { display:block; color:#fff0bd; font-size:18px; }.deck-hand-metric span { color:#a79d89; font-size:9px; }
    .deck-hand-distribution { margin-top:14px; display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:5px; align-items:end; min-height:86px; }
    .deck-hand-dist-col { min-width:0; display:grid; grid-template-rows:62px auto auto; align-items:end; text-align:center; font-size:8px; color:#9f947d; }
    .deck-hand-dist-bar-slot { height:62px; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; }
    .deck-hand-dist-bar { width:70%; min-height:1px; height:var(--deck-hand-bar-height,1%); background:#c5a23b; border-radius:4px 4px 0 0; }
    .deck-stats-note { color:#918873; font-size:10px; margin-top:8px; line-height:1.35; }
  `;
  document.head.appendChild(style);
}

// FASE 3, ETAPA 2: nombre del mazo nuevo, antes de entrar al constructor. Cualquier nombre
// no vacío sirve (sin la exigencia de escribir una palabra exacta como en borrar cuenta —
// acá no hay nada irreversible todavía, recién se guarda de verdad al final del constructor).
export function showDeckNameModal(defaultName, onConfirm, onCancel) {
  // BUGFIX: este modal usa clases de otros módulos (.store-buy-btn, .mulligan-btn,
  // .encyclopedia-search-input) sin nunca haberlas inyectado — si nadie más lo hizo antes
  // en esa sesión de navegación, los botones salían con el estilo por defecto del
  // navegador (gris, sin bordes redondeados, texto negro). Con esto, siempre están.
  injectStoreStyles();
  injectMulliganStyles();
  injectEncyclopediaStyles();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 420px;">
      <div class="gy-modal-header"><h3>Nombrá tu mazo</h3></div>
      <div style="display:flex; flex-direction:column; gap:12px; padding: 16px;">
        <input type="text" class="encyclopedia-search-input" id="deckname-input" value="${defaultName}" maxlength="30" style="margin-bottom:0;">
        <button class="store-buy-btn" id="deckname-confirm-btn">Continuar</button>
        <button id="deckname-cancel-btn" class="mulligan-btn mulligan-btn-mull">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  const input = modalOverlay.querySelector('#deckname-input');
  input.focus();
  input.select();

  modalOverlay.querySelector('#deckname-confirm-btn').addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) return; // no dejamos continuar sin nombre — el input se queda como está
    modalOverlay.remove();
    onConfirm(name);
  });
  modalOverlay.querySelector('#deckname-cancel-btn').addEventListener('click', () => {
    modalOverlay.remove();
    onCancel();
  });
}

// FASE 3, ETAPA 2: constructor de mazos — pool de la izquierda (SOLO cartas que ya tenés,
// con solapas por tipo y buscador, igual que la Enciclopedia) y el mazo en construcción a
// la derecha. Nunca deja agregar más copias de una carta de las que realmente tenés — el
// tope real y definitivo lo pone igual la transacción de Firestore (createDeck), esto es
// solo para que la experiencia de armar no se sienta rota antes de llegar a guardar.
// FASE 3, ETAPA 2 (extendido más adelante para editar): sin existingDeck, arma un mazo
// nuevo desde cero (comportamiento de siempre). Con existingDeck, arranca con sus cartas
// ya puestas — mismas reglas, mismo pool, mismo tope — y al guardar actualiza ESE mazo en
// vez de crear uno nuevo.
export function showDeckBuilderScreen(deckName, onSaved, onCancel, existingDeck) {
  injectEncyclopediaStyles();
  injectStoreStyles();
  injectDeckBuilderStyles();

  const ownedCounts = getDeckBuilderOwnedCounts();
  const enhancements = (state.userProfile && state.userProfile.enhancements) || {};
  const enhancedIds = new Set(Object.keys(enhancements).filter(id => isEnhancementEligibleCard(cardDb.getById(id))));

  let activeTab = 'criaturas';
  let searchQuery = '';
  let enhancedOnly = false;
  const activeRarities = new Set(ENCYCLOPEDIA_RARITIES.map(r => r.key));
  const activeColors = new Set(CARD_BROWSER_COLORS.map(c => c.key));
  const activeArchetypes = new Set();
  const sortByTab = new Map(ENCYCLOPEDIA_TABS.map(tab => [tab.key, { key: 'cmc', direction: 'asc' }]));
  const deckCounts = {};
  let workingDeckName = String(deckName || '').trim();
  if (existingDeck) {
    (existingDeck.cardIds || []).forEach(id => { deckCounts[id] = (deckCounts[id] || 0) + 1; });
  }

  const overlay = document.createElement('div');
  overlay.id = 'deckbuilder-overlay';

  const tabsHTML = ENCYCLOPEDIA_TABS.map(t =>
    `<button class="encyclopedia-tab${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');
  const rarityFiltersHTML = ENCYCLOPEDIA_RARITIES.map(r =>
    `<label class="encyclopedia-filter-option">
       <input type="checkbox" data-deck-rarity="${r.key}" checked>
       ${r.label}
     </label>`
  ).join('');
  const defaultZoom = document.documentElement.classList.contains('argentinia-mobile') ? 20 : 12;

  overlay.innerHTML = `
    <div class="deckbuilder-header">
      <button class="encyclopedia-back-btn" id="deckbuilder-cancel">← Cancelar</button>
      ${existingDeck
        ? `<input class="deckbuilder-name-input" id="deckbuilder-name-input" maxlength="30" value="${escapeHtml(workingDeckName)}" aria-label="Nombre del mazo">`
        : `<div class="deckbuilder-name">${escapeHtml(workingDeckName)}</div>`}
      <button class="store-buy-btn" id="deckbuilder-save" disabled>💾 Guardar mazo</button>
    </div>
    <div class="store-error-msg" id="deckbuilder-error" style="text-align:left;"></div>
    <div class="encyclopedia-tabs">${tabsHTML}</div>
    <div class="deckbuilder-body">
      <div class="deckbuilder-pool">
        <div class="encyclopedia-grid-box" id="deckbuilder-grid"></div>
      </div>
      <div class="encyclopedia-filters deckbuilder-filters">
        <input type="text" class="encyclopedia-search-input" id="deckbuilder-search" placeholder="Buscar carta...">
        <div class="card-browser-zoom" title="Cambiar tamaño de las cartas">
          <span>🔍</span>
          <input type="range" id="deckbuilder-card-zoom" min="8" max="40" step="1" value="${defaultZoom}">
          <span id="deckbuilder-card-zoom-value">${defaultZoom}</span>
        </div>
        <div class="encyclopedia-filter-section-title">Ordenar</div>
        <div class="card-browser-sort">
          <select id="deck-sort-key" aria-label="Ordenar cartas por">${browserSortOptionsHTML(activeTab, 'cmc')}</select>
          <button type="button" id="deck-sort-direction" class="card-browser-sort-direction" aria-label="Orden creciente" title="Orden creciente">↑</button>
        </div>
        <div class="encyclopedia-filter-section-title">Opciones</div>
        <label class="encyclopedia-filter-option">
          <input type="checkbox" id="deckbuilder-enhanced-only">
          ✨ Solo mejoradas
        </label>
        <div class="encyclopedia-filter-section-title">Color</div>
        <div class="card-browser-filter-grid">${browserColorFiltersHTML('deck')}</div>
        <div class="encyclopedia-filter-section-title">Rareza</div>
        <div class="card-browser-filter-grid">${rarityFiltersHTML}</div>
        <div class="encyclopedia-filter-section-title">Arquetipo</div>
        <div class="card-browser-filter-grid archetypes">${browserArchetypeFiltersHTML('deck')}</div>
      </div>
      <div class="deckbuilder-side">
        <button class="deckbuilder-stats-btn" id="deckbuilder-stats" type="button">📊 Estadísticas del mazo</button>
        <div class="deckbuilder-side-title" id="deckbuilder-count">Tu mazo (0 / ${DECK_SIZE_EXACT} cartas)</div>
        <div class="deckbuilder-list" id="deckbuilder-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setBrowserCardZoom(overlay, defaultZoom);

  const grid = overlay.querySelector('#deckbuilder-grid');
  const list = overlay.querySelector('#deckbuilder-list');
  const countLabel = overlay.querySelector('#deckbuilder-count');
  const errorBox = overlay.querySelector('#deckbuilder-error');
  const nameInput = overlay.querySelector('#deckbuilder-name-input');

  // 23.13.11 — el input de rename vive en el Constructor, no en Enciclopedia.
  // 23.13.10 renderizaba el campo correctamente pero el listener quedó insertado
  // accidentalmente en showEncyclopediaScreen(), por lo que workingDeckName jamás
  // cambiaba y updateDeck() recibía silenciosamente el nombre anterior.
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      workingDeckName = nameInput.value.trim();
      updateDeckSaveState();
    });
  }

  const deckCategoryById = new Map();
  ENCYCLOPEDIA_TABS.forEach(tab => cardDb.getByCategory(tab.key).forEach(card => deckCategoryById.set(card.id, tab.key)));

  const cardPreview = document.createElement('div');
  cardPreview.className = 'deckbuilder-card-preview';
  overlay.appendChild(cardPreview);
  const usesTouchPreview = document.documentElement.classList.contains('argentinia-mobile') ||
    !!window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches;

  function hideDeckCardPreview() {
    cardPreview.classList.remove('visible', 'touch');
    cardPreview.innerHTML = '';
  }

  function showDeckCardPreview(entry, anchorEl, touch = false) {
    if (!entry?.card) return;
    cardPreview.innerHTML = '';
    cardPreview.classList.toggle('touch', touch);

    const enhancementKeyword = entry.isEnhanced ? enhancements[entry.card.id] : null;
    const displayCard = enhancementKeyword
      ? { ...entry.card, keywords: [...(entry.card.keywords || []), enhancementKeyword] }
      : entry.card;
    const cardEl = createCardElement(displayCard, false, true, null, 'preview', null);
    const previewWidth = touch ? Math.min(190, Math.max(145, window.innerHeight * 0.48)) : 190;
    cardEl.style.width = `${previewWidth}px`;
    cardEl.style.height = `${previewWidth * 7 / 5}px`;
    cardPreview.appendChild(cardEl);

    if (touch) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'deckbuilder-card-preview-close';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', 'Cerrar vista previa');
      closeBtn.addEventListener('click', event => { event.stopPropagation(); hideDeckCardPreview(); });
      cardPreview.appendChild(closeBtn);
    } else {
      const anchorRect = anchorEl.getBoundingClientRect();
      const previewHeight = previewWidth * 7 / 5;
      const left = Math.max(10, anchorRect.left - previewWidth - 18);
      let top = anchorRect.top + anchorRect.height / 2 - previewHeight / 2;
      top = Math.max(10, Math.min(top, window.innerHeight - previewHeight - 10));
      cardPreview.style.left = `${left}px`;
      cardPreview.style.top = `${top}px`;
    }
    cardPreview.classList.add('visible');
  }

  function normalizeSearch(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function totalInDeck() {
    return Object.values(deckCounts).reduce((sum, n) => sum + n, 0);
  }

  function getCurrentDeckEntries() {
    return Object.entries(deckCounts)
      .filter(([, n]) => n > 0)
      .map(([trackingKey, count]) => {
        const isEnhanced = trackingKey.endsWith(ENHANCED_SUFFIX);
        const baseId = isEnhanced ? trackingKey.slice(0, -ENHANCED_SUFFIX.length) : trackingKey;
        const card = cardDb.getById(baseId);
        return { trackingKey, card, count, isEnhanced, categoryKey: card ? deckCategoryById.get(card.id) : null };
      })
      .filter(entry => entry.card);
  }

  function updateDeckSaveState() {
    const saveBtn = overlay.querySelector('#deckbuilder-save');
    const validName = !!workingDeckName && workingDeckName.length <= 30;
    saveBtn.disabled = totalInDeck() !== DECK_SIZE_EXACT || !validName;
  }

  function totalEnhancedInDeck() {
    return Object.entries(deckCounts)
      .filter(([key]) => key.endsWith(ENHANCED_SUFFIX))
      .reduce((sum, [, n]) => sum + n, 0);
  }

  function isTileMaxed(trackingKey, cap, isEnhancedTile) {
    const inDeck = deckCounts[trackingKey] || 0;
    const deckFull = totalInDeck() >= DECK_SIZE_EXACT;
    const enhancedDeckCapReached = isEnhancedTile && inDeck === 0 && totalEnhancedInDeck() >= MAX_ENHANCED_CARDS_PER_DECK;
    return inDeck >= cap || deckFull || enhancedDeckCapReached;
  }

  // 23.12.0 — agregar/quitar una carta ya NO destruye y reconstruye toda la grilla.
  // Antes, en Criaturas, un solo click podía recrear hasta 210 <img>; al construir 60
  // cartas eso generaba una tormenta de elementos/request candidates contra GitHub Pages.
  function refreshPoolTileStates() {
    grid.querySelectorAll('.deckbuilder-pool-card-wrap').forEach(wrap => {
      const trackingKey = wrap.dataset.trackingKey;
      const cap = Number(wrap.dataset.cap || 0);
      const isEnhancedTile = wrap.dataset.enhanced === '1';
      const inDeck = deckCounts[trackingKey] || 0;
      wrap.classList.toggle('maxed', isTileMaxed(trackingKey, cap, isEnhancedTile));
      const badge = wrap.querySelector('.deckbuilder-pool-card-badge');
      if (badge) badge.textContent = `${inDeck}/${cap}`;
    });
  }

  // 23.13.15 — cache DOM por solapa. El pool se materializa una sola vez por categoría;
  // filtros, orden y volver a una solapa mueven/ocultan esos mismos nodos. Agregar/quitar
  // cartas sigue usando refreshPoolTileStates() y tampoco reconstruye imágenes.
  const poolTabCache = new Map();

  function ensurePoolTab(tabKey) {
    const entry = createBrowserTabPane(grid, poolTabCache, tabKey);
    if (entry.records.length || entry.empty) return entry;

    const fragment = document.createDocumentFragment();

    function createPoolRecord(baseCard, displayCard, trackingKey, ownedForThisSlot, isEnhancedTile) {
      const isBasicLand = displayCard.type.includes('básica');
      const cap = isBasicLand ? ownedForThisSlot : Math.min(ownedForThisSlot, MAX_COPIES_PER_CARD);
      const inDeck = deckCounts[trackingKey] || 0;
      const maxed = isTileMaxed(trackingKey, cap, isEnhancedTile);

      const wrap = document.createElement('div');
      wrap.className = `deckbuilder-pool-card-wrap${maxed ? ' maxed' : ''}${isEnhancedTile ? ' enhanced' : ''}`;
      wrap.dataset.trackingKey = trackingKey;
      wrap.dataset.cap = String(cap);
      wrap.dataset.enhanced = isEnhancedTile ? '1' : '0';
      wrap.appendChild(createCardElement(displayCard, false, true, null, 'encyclopedia', null));

      if (isEnhancedTile) {
        const star = document.createElement('div');
        star.className = 'deckbuilder-enhanced-marker';
        star.textContent = '✨ Mejorada';
        wrap.appendChild(star);
      }

      const badge = document.createElement('div');
      badge.className = 'deckbuilder-pool-card-badge';
      badge.textContent = `${inDeck}/${cap}`;
      wrap.appendChild(badge);

      wrap.addEventListener('click', () => {
        if (isTileMaxed(trackingKey, cap, isEnhancedTile)) return;
        deckCounts[trackingKey] = (deckCounts[trackingKey] || 0) + 1;
        refreshPoolTileStates();
        renderList();
      });

      fragment.appendChild(wrap);
      entry.records.push({ card: baseCard, displayCard, node: wrap, trackingKey, isEnhancedTile });
    }

    cardDb.getByCategory(tabKey).forEach(card => {
      const owned = ownedCounts[card.id] || 0;
      if (owned <= 0) return;
      const enhancementKeyword = enhancements[card.id];
      if (enhancementKeyword) {
        const enhancedDisplayCard = { ...card, keywords: [...(card.keywords || []), enhancementKeyword] };
        createPoolRecord(card, enhancedDisplayCard, `${card.id}${ENHANCED_SUFFIX}`, 1, true);
        const remainingOwned = Math.max(0, owned - 1);
        if (remainingOwned > 0) createPoolRecord(card, card, card.id, remainingOwned, false);
      } else {
        createPoolRecord(card, card, card.id, owned, false);
      }
    });

    entry.pane.appendChild(fragment);
    entry.empty = document.createElement('div');
    entry.empty.className = 'encyclopedia-empty-msg';
    entry.empty.textContent = 'No tenés cartas que coincidan con estos filtros.';
    entry.empty.hidden = true;
    entry.pane.appendChild(entry.empty);
    return entry;
  }

  function refreshPool() {
    const entry = ensurePoolTab(activeTab);
    activateBrowserTab(poolTabCache, activeTab);
    const query = normalizeSearch(searchQuery);
    const sort = normalizeCardBrowserSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, sort);
    syncBrowserSortControls(overlay, 'deck', activeTab, sort);

    entry.records.sort((a, b) => {
      const byCard = compareCardsForBrowser(a.card, b.card, sort);
      if (byCard !== 0) return byCard;
      if (a.isEnhancedTile !== b.isEnhancedTile) return a.isEnhancedTile ? -1 : 1;
      return a.trackingKey.localeCompare(b.trackingKey);
    });

    let visible = 0;
    entry.records.forEach(record => {
      const card = record.card;
      const matches = activeRarities.has(card.rarity) &&
        cardMatchesColorFilter(card, activeColors) &&
        cardMatchesArchetypeFilter(card, activeArchetypes) &&
        (!enhancedOnly || record.isEnhancedTile) &&
        (!query || normalizeSearch(card.name).includes(query));
      record.node.hidden = !matches;
      if (matches) visible += 1;
      entry.pane.appendChild(record.node); // mueve el nodo existente; mantiene su <img>
    });
    entry.empty.hidden = visible !== 0;
    entry.pane.appendChild(entry.empty);
    refreshPoolTileStates();
  }

  function showDeckStatisticsModal() {
    const entries = getCurrentDeckEntries();
    const stats = buildDeckStatistics(entries);
    const health = analyzeDeckHealth(stats);
    const modal = document.createElement('div');
    modal.className = 'deck-stats-overlay';

    const curveKeys = ['0','1','2','3','4','5','6+'];
    const curveMax = Math.max(1, ...curveKeys.map(key => stats.curve[key] || 0));
    const curveHTML = curveKeys.map(key => {
      const count = stats.curve[key] || 0;
      const width = Math.round((count / curveMax) * 100);
      return `<div class="deck-curve-row"><strong>${key === '6+' ? '6+' : `CMC ${key}`}</strong><div class="deck-curve-track"><div class="deck-curve-fill" style="width:${width}%"></div></div><span>${count}</span></div>`;
    }).join('');

    const colorMeta = [
      ['W','⚪ Blanco'],['U','🔵 Azul'],['B','⚫ Negro'],['R','🔴 Rojo'],['G','🟢 Verde'],['C','◇ Incoloro']
    ];
    const colorHTML = colorMeta.map(([key,label]) => `
      <div class="deck-color-row">
        <strong>${label}</strong>
        <div class="deck-color-values"><span>demanda <b>${stats.demand[key] || 0}</b></span><span>fuentes <b>${stats.sources[key] || 0}</b></span></div>
      </div>`).join('');

    const healthHTML = health.map(item => `<div class="deck-health-item ${item.level}"><strong>${escapeHtml(item.title)}</strong> <span>— ${escapeHtml(item.detail)}</span></div>`).join('');

    modal.innerHTML = `
      <div class="deck-stats-modal" role="dialog" aria-modal="true" aria-label="Estadísticas del mazo">
        <div class="deck-stats-header"><div class="deck-stats-title">📊 Estadísticas — ${escapeHtml(workingDeckName || 'Mazo')}</div><button class="deck-stats-close" type="button" aria-label="Cerrar">×</button></div>
        <div class="deck-stats-grid">
          <section class="deck-stats-panel wide">
            <h4>Resumen general</h4>
            <div class="deck-stats-kpis">
              <div class="deck-stats-kpi"><strong>${stats.total}</strong><span>cartas</span></div>
              <div class="deck-stats-kpi"><strong>${stats.lands}</strong><span>tierras</span></div>
              <div class="deck-stats-kpi"><strong>${stats.creatures}</strong><span>criaturas</span></div>
              <div class="deck-stats-kpi"><strong>${stats.nonlands}</strong><span>no-tierras</span></div>
              <div class="deck-stats-kpi"><strong>${formatManaValue(stats.averageManaValue)}</strong><span>MV sin tierras</span></div>
            </div>
          </section>
          <section class="deck-stats-panel"><h4>Curva de maná</h4>${curveHTML}</section>
          <section class="deck-stats-panel"><h4>Demanda de color vs fuentes</h4>${colorHTML}<div class="deck-stats-note">“Demanda” cuenta símbolos coloreados en los costes. “Fuentes” cuenta permanentes del mazo capaces de producir ese color; las fuentes de cualquier color cuentan para cada color que pueden pagar.${stats.flexibleSources ? ` · ${stats.flexibleSources} fuente(s) flexible(s).` : ''}</div></section>
          <section class="deck-stats-panel wide"><h4>Salud del mazo · orientativo</h4><div class="deck-health-list">${healthHTML}</div><div class="deck-stats-note">Estas señales no bloquean el guardado ni pretenden definir un único estilo correcto de construcción.</div></section>
          <section class="deck-stats-panel wide">
            <h4>🎲 Probar mano · simulación Monte Carlo</h4>
            <div class="deck-hand-sim-intro"><button class="deck-hand-sim-btn" type="button">Simular 100 manos</button><span>100 manos aleatorias de 7 cartas, sin mulligan previo.</span></div>
            <div class="deck-hand-results" hidden></div>
            <div class="deck-hand-distribution" hidden></div>
            <div class="deck-stats-note">Criterios: “equilibrada” = 2–4 tierras + al menos un hechizo CMC ≤3; “salida temprana” = 2–4 tierras + al menos una jugada CMC 1–2; “mulligan probable” = 0–1 o 6–7 tierras. Son métricas de referencia, no reglas universales.</div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.deck-stats-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });

    modal.querySelector('.deck-hand-sim-btn').addEventListener('click', () => {
      const result = simulateOpeningHands(entries, 100);
      const results = modal.querySelector('.deck-hand-results');
      const dist = modal.querySelector('.deck-hand-distribution');
      results.hidden = false;
      dist.hidden = false;
      const metrics = [
        ['Mano equilibrada',`${result.balancedPct}%`],
        ['Salida temprana',`${result.earlyPlayPct}%`],
        ['Mulligan probable',`${result.mulliganPct}%`],
        ['3–4 tierras',`${result.threeFourLandsPct}%`],
        ['0 tierras',`${result.zeroLandPct}%`],
        ['1 tierra',`${result.oneLandPct}%`],
        ['5+ tierras',`${result.fivePlusLandsPct}%`],
        ['Prom. tierras',result.averageLands.toFixed(2)],
        ['Prom. criaturas',result.averageCreatures.toFixed(2)],
        ['Con criatura',`${result.creatureHandPct}%`]
      ];
      results.innerHTML = metrics.map(([label,value]) => `<div class="deck-hand-metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
      const max = Math.max(1, ...result.landHistogram);
      dist.innerHTML = result.landHistogram.map((pct,index) => {
        const barPct = Math.max(1, Math.round((pct / max) * 100));
        return `<div class="deck-hand-dist-col"><div class="deck-hand-dist-bar-slot"><div class="deck-hand-dist-bar" style="--deck-hand-bar-height:${barPct}%"></div></div><b>${index}</b><span>${pct}%</span></div>`;
      }).join('');
    });
  }

  function renderList() {
    const entries = getCurrentDeckEntries();

    const total = totalInDeck();
    countLabel.textContent = `Tu mazo (${total} / ${DECK_SIZE_EXACT} cartas)`;
    countLabel.style.color = total === DECK_SIZE_EXACT ? '#7cbf7c' : '#f0e0b0';

    updateDeckSaveState();

    hideDeckCardPreview();
    if (entries.length === 0) {
      list.innerHTML = '<div class="deckbuilder-empty-hint">Todavía no agregaste ninguna carta — hacé click en una de la izquierda.</div>';
      return;
    }

    list.innerHTML = '';
    const composition = buildDeckComposition(entries);

    composition.forEach(group => {
      const groupEl = document.createElement('section');
      groupEl.className = 'deckbuilder-type-group';

      const header = document.createElement('div');
      header.className = 'deckbuilder-type-header';
      const headerMain = document.createElement('span');
      headerMain.innerHTML = `${group.label} <span class="deckbuilder-type-header-count">(${group.count})</span>`;
      header.appendChild(headerMain);
      if (group.showManaValue) {
        const mv = document.createElement('span');
        mv.className = 'deckbuilder-type-header-mv';
        mv.textContent = `MV = ${formatManaValue(group.manaValue)}`;
        header.appendChild(mv);
      }
      groupEl.appendChild(header);

      const renderEntries = (parent, cmcEntries) => {
        cmcEntries.forEach(entry => {
          const item = document.createElement('div');
          item.className = 'deckbuilder-list-item';
          const label = document.createElement('span');
          label.className = 'deckbuilder-list-card-name';
          label.textContent = `${entry.count > 1 ? `${entry.count}× ` : ''}${entry.card.name}${entry.isEnhanced ? ' ✨' : ''}`;
          label.title = usesTouchPreview ? 'Tocá para ver la carta completa' : 'Pasá el mouse para ver la carta completa';

          if (usesTouchPreview) {
            label.addEventListener('click', event => {
              event.stopPropagation();
              showDeckCardPreview(entry, label, true);
            });
          } else {
            label.addEventListener('mouseenter', () => showDeckCardPreview(entry, label, false));
            label.addEventListener('mouseleave', hideDeckCardPreview);
          }

          const removeBtn = document.createElement('button');
          removeBtn.className = 'deckbuilder-list-remove';
          removeBtn.type = 'button';
          removeBtn.textContent = '−';
          removeBtn.setAttribute('aria-label', `Quitar una copia de ${entry.card.name}`);
          removeBtn.addEventListener('click', () => {
            const trackingKey = entry.trackingKey;
            deckCounts[trackingKey] = Math.max(0, (deckCounts[trackingKey] || 0) - 1);
            refreshPoolTileStates();
            renderList();
          });
          item.appendChild(label);
          item.appendChild(removeBtn);
          parent.appendChild(item);
        });
      };

      if (group.key === 'tierras') {
        const flat = group.cmcGroups.flatMap(cmcGroup => cmcGroup.entries);
        renderEntries(groupEl, flat);
      } else {
        group.cmcGroups.forEach(cmcGroup => {
          const cmcEl = document.createElement('div');
          cmcEl.className = 'deckbuilder-cmc-group';
          const cmcTitle = document.createElement('div');
          cmcTitle.className = 'deckbuilder-cmc-title';
          cmcTitle.textContent = `CMC: ${cmcGroup.cmc}`;
          cmcEl.appendChild(cmcTitle);
          renderEntries(cmcEl, cmcGroup.entries);
          groupEl.appendChild(cmcEl);
        });
      }
      list.appendChild(groupEl);
    });
  }

  const debouncedSearch = debounce(value => {
    searchQuery = value;
    refreshPool();
  });
  overlay.querySelector('#deckbuilder-search').addEventListener('input', e => debouncedSearch(e.target.value));

  overlay.querySelector('#deckbuilder-card-zoom').addEventListener('input', e => {
    setBrowserCardZoom(overlay, e.target.value);
    overlay.querySelector('#deckbuilder-card-zoom-value').textContent = e.target.value;
  });

  overlay.querySelector('#deck-sort-key').addEventListener('change', e => {
    const current = normalizeCardBrowserSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, { ...current, key: e.target.value });
    refreshPool();
  });
  overlay.querySelector('#deck-sort-direction').addEventListener('click', () => {
    const current = normalizeCardBrowserSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' });
    refreshPool();
  });

  overlay.querySelectorAll('.encyclopedia-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      overlay.querySelectorAll('.encyclopedia-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshPool();
    });
  });

  overlay.querySelector('#deckbuilder-enhanced-only').addEventListener('change', e => {
    enhancedOnly = e.target.checked;
    refreshPool();
  });

  overlay.querySelectorAll('input[data-deck-rarity]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const rarity = checkbox.getAttribute('data-deck-rarity');
      if (checkbox.checked) activeRarities.add(rarity);
      else activeRarities.delete(rarity);
      refreshPool();
    });
  });

  overlay.querySelectorAll('input[data-browser-color][data-filter-prefix="deck"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const color = checkbox.getAttribute('data-browser-color');
      if (checkbox.checked) activeColors.add(color);
      else activeColors.delete(color);
      refreshPool();
    });
  });

  overlay.querySelectorAll('input[data-browser-archetype][data-filter-prefix="deck"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const archetype = checkbox.getAttribute('data-browser-archetype');
      if (checkbox.checked) activeArchetypes.add(archetype);
      else activeArchetypes.delete(archetype);
      refreshPool();
    });
  });

  overlay.querySelector('#deckbuilder-stats').addEventListener('click', showDeckStatisticsModal);

  overlay.querySelector('#deckbuilder-cancel').addEventListener('click', () => {
    overlay.remove();
    onCancel();
  });

  overlay.querySelector('#deckbuilder-save').addEventListener('click', async () => {
    const cardIds = [];
    Object.entries(deckCounts).forEach(([id, count]) => {
      for (let i = 0; i < count; i++) cardIds.push(id);
    });
    if (cardIds.length !== DECK_SIZE_EXACT) {
      errorBox.textContent = `El mazo tiene que tener exactamente ${DECK_SIZE_EXACT} cartas (tiene ${cardIds.length}).`;
      return;
    }
    errorBox.textContent = '';
    const saveBtn = overlay.querySelector('#deckbuilder-save');
    saveBtn.disabled = true;
    try {
      const updated = existingDeck
        ? await updateDeck(state.currentUser.uid, existingDeck.id, workingDeckName, cardIds)
        : await createDeck(state.currentUser.uid, workingDeckName, cardIds);
      state.userProfile = updated;
      overlay.remove();
      onSaved();
    } catch (err) {
      console.error('No se pudo guardar el mazo:', err);
      errorBox.textContent = err.message || 'No se pudo guardar el mazo. Probá de nuevo.';
      saveBtn.disabled = false;
    }
  });

  refreshPool();
  renderList();
}

// FASE 3: "Mis Mazos" — lista los mazos guardados hasta el límite admin-editable
// (default 12; arranca con 1: el mazo inicial random, marcado como default), permite crear
// los restantes armándolos 100% desde tu colección real (Etapa 2, showDeckBuilderScreen más
// abajo). Reusa createCardElement y hasta el mismo .encyclopedia-grid-box que la
// Enciclopedia para la vista de detalle — la reutilización de UI que veníamos buscando.
// FASE 3, ETAPA 4: elegir con qué mazo jugar — se muestra en vez del selector random de
// siempre cuando el jugador logueado ya tiene al menos un mazo guardado. Reusa el MISMO
// estilo de slot que "Mis Mazos" (ver injectMyDecksStyles más arriba), pero acá el click
// ELIGE ese mazo para arrancar la partida, no abre el detalle de solo lectura. Sin sesión,
// o sin ningún mazo guardado todavía, ni se llega a esta pantalla — el llamador
// (showMainMenu → boot() en main.js) decide eso antes de invocarla.
// FEATURE (#9): "onPlayRandom" ahora es OPCIONAL — cuando no se pasa (logueado, jugando en
// Solitario), el link de "jugar con un mazo random" directamente no se muestra: estando
// logueado, siempre elegís uno de tus propios mazos. Sin sesión, el llamador ni siquiera
// pasa por acá (no hay mazos guardados que elegir). También se suma "Volver" — antes este
// modal no tenía ninguna salida más que elegir un mazo o clickear random.
export function showPlayDeckPickerModal(onChooseDeck, onPlayRandom, onCancel, onPlayTestDeck = null) {
  injectMyDecksStyles();
  injectStoreStyles(); // reusa .store-back-link para el link de "jugar random"
  injectEncyclopediaStyles(); // reusa .encyclopedia-back-btn para "Volver"

  const overlay = document.createElement('div');
  overlay.id = 'mydecks-overlay';
  const decks = (state.userProfile && state.userProfile.decks) || [];

  const slotsHTML = decks.map(deck => `
    <button type="button" class="mydecks-slot mydecks-slot-filled" data-deck-id="${deck.id}">
      <span class="mydecks-slot-name">${deck.name}</span>
      ${deck.isDefault ? '<span class="mydecks-slot-badge">Default</span>' : ''}
      <span class="mydecks-slot-count">${(deck.cardIds || []).length} cartas</span>
    </button>
  `).join('');

  overlay.innerHTML = `
    <div class="mydecks-header">
      <button class="encyclopedia-back-btn" id="playpicker-back">← Volver</button>
      <div class="mydecks-title">¿Con qué mazo jugás?</div>
    </div>
    <div class="mydecks-body">
      <div class="mydecks-slots-grid">${slotsHTML}</div>
      ${onPlayRandom ? `
      <div style="text-align:center; margin-top: 24px;">
        <button class="store-back-link" id="playpicker-random">🎲 Jugar con un mazo random en cambio</button>
      </div>
      ` : ''}
      ${onPlayTestDeck ? `
      <div style="text-align:center; margin-top: 28px; padding-top: 16px; border-top: 1px solid rgba(212,175,55,.25);">
        <button class="store-back-link" id="playpicker-testdeck" style="color:var(--gold, #d4af37); font-weight:700;">Usar &quot;Mazo de pruebas&quot;</button>
      </div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.mydecks-slot-filled').forEach(el => {
    el.addEventListener('click', () => {
      const deckId = el.getAttribute('data-deck-id');
      const deck = decks.find(d => d.id === deckId);
      if (deck) {
        overlay.remove();
        onChooseDeck(deck);
      }
    });
  });

  if (onPlayRandom) {
    overlay.querySelector('#playpicker-random').addEventListener('click', () => {
      overlay.remove();
      onPlayRandom();
    });
  }

  if (onPlayTestDeck) {
    overlay.querySelector('#playpicker-testdeck').addEventListener('click', () => {
      overlay.remove();
      onPlayTestDeck();
    });
  }

  overlay.querySelector('#playpicker-back').addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });
}

export function showMyDecksScreen(onBack) {
  injectMyDecksStyles();
  injectEncyclopediaStyles(); // reusamos .encyclopedia-grid-box para la vista de detalle
  injectDeckBuilderStyles(); // reusamos .deckbuilder-enhanced-marker para marcar la copia mejorada
  injectStoreStyles(); // .store-back-link/.store-section: siempre disponibles
  const overlay = document.createElement('div');
  overlay.id = 'mydecks-overlay';
  overlay.innerHTML = `
    <div class="mydecks-header">
      <button class="encyclopedia-back-btn" id="mydecks-back">← Volver</button>
      <div class="mydecks-title">Mis Mazos</div>
    </div>
    <div class="mydecks-body" id="mydecks-body"></div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#mydecks-back').addEventListener('click', () => {
    overlay.remove();
    onBack();
  });

  const body = overlay.querySelector('#mydecks-body');
  enableDesktopDragScroll(body, { axis:'y' });
  let myDecksDetailZoom = document.documentElement.classList.contains('argentinia-mobile') ? 20 : 14;
  const MAX_DECKS = MAX_SAVED_DECKS;

  function renderListView() {
    if (!state.currentUser) {
      body.innerHTML = `<div class="store-section"><div class="store-section-desc">Iniciá sesión desde el menú principal para acceder a tus mazos — son por cuenta.</div></div>`;
      return;
    }
    if (!state.userProfile) {
      body.innerHTML = `<div class="store-section"><div class="store-section-desc">Todavía no tenés un perfil guardado — jugá tu primera partida logueado para arrancar tu colección, y volvé acá.</div></div>`;
      return;
    }

    const decks = state.userProfile.decks || [];
    const slotsHTML = [];

    decks.forEach(deck => {
      slotsHTML.push(`
        <button type="button" class="mydecks-slot mydecks-slot-filled" data-deck-id="${deck.id}">
          <span class="mydecks-slot-name">${deck.name}</span>
          ${deck.isDefault ? '<span class="mydecks-slot-badge">Default</span>' : ''}
          <span class="mydecks-slot-count">${(deck.cardIds || []).length} cartas</span>
        </button>
      `);
    });

    for (let i = decks.length; i < MAX_DECKS; i++) {
      slotsHTML.push(`
        <button type="button" class="mydecks-slot mydecks-slot-empty">+ Crear mazo</button>
      `);
    }

    body.innerHTML = `<div class="mydecks-slots-grid">${slotsHTML.join('')}</div>`;

    body.querySelectorAll('.mydecks-slot-filled').forEach(el => {
      el.addEventListener('click', () => {
        const deckId = el.getAttribute('data-deck-id');
        const deck = decks.find(d => d.id === deckId);
        if (deck) renderDetailView(deck);
      });
    });

    // FASE 3, ETAPA 2: un slot vacío ahora arma un mazo de verdad — primero el nombre,
    // después el constructor (grilla + búsqueda, igual que la Enciclopedia, pero solo con
    // lo que ya tenés). Al volver de cualquiera de los dos caminos (guardó o canceló),
    // se refresca la lista sola.
    body.querySelectorAll('.mydecks-slot-empty').forEach(el => {
      el.addEventListener('click', () => {
        const nextNumber = decks.length + 1;
        showDeckNameModal(`Mazo ${nextNumber}`,
          (name) => {
            showDeckBuilderScreen(name, renderListView, renderListView);
          },
          () => {} // canceló el nombre: no hace falta hacer nada
        );
      });
    });
  }

  function renderDetailView(deck) {
    // BUGFIX (revisión post-Etapa 4): resuelve el sufijo ENHANCED_SUFFIX para mostrar la
    // copia mejorada con su keyword de más y el marcador visual — mismo criterio que el
    // constructor de mazos, para que se vea igual acá y ahí.
    const enhancements = (state.userProfile && state.userProfile.enhancements) || {};
    const cards = (deck.cardIds || [])
      .map(id => {
        const isEnhanced = id.endsWith(ENHANCED_SUFFIX);
        const baseId = isEnhanced ? id.slice(0, -ENHANCED_SUFFIX.length) : id;
        const cardDef = cardDb.getById(baseId);
        if (!cardDef) return null;
        const keyword = isEnhanced ? enhancements[baseId] : null;
        return {
          displayCard: keyword ? { ...cardDef, keywords: [...(cardDef.keywords || []), keyword] } : cardDef,
          isEnhanced: !!keyword
        };
      })
      .filter(Boolean);

    body.innerHTML = `
      <div class="mydecks-detail-header">
        <button class="store-back-link" id="mydecks-detail-back">← Mis Mazos</button>
        <div class="mydecks-detail-title">${deck.name} — ${cards.length} cartas</div>
        <div class="card-browser-zoom mydecks-detail-zoom" title="Cambiar tamaño de las cartas">
          <span>🔍</span>
          <input type="range" id="mydecks-detail-zoom" min="8" max="40" step="1" value="${myDecksDetailZoom}">
          <span id="mydecks-detail-zoom-value">${myDecksDetailZoom}</span>
        </div>
        <button class="admin-save-btn" id="mydecks-detail-edit" style="width:auto; padding:8px 18px;">✏️ Editar</button>
        <button class="delete-confirm-btn" id="mydecks-detail-delete" style="width:auto; padding:8px 18px;">🗑️ Eliminar</button>
      </div>
      <div class="encyclopedia-grid-box" id="mydecks-detail-grid"></div>
    `;
    body.querySelector('#mydecks-detail-back').addEventListener('click', renderListView);

    // "Editar": reabre el constructor con este mazo precargado — al guardar, actualiza
    // ESTE mazo en vez de crear uno nuevo (ver updateDeck, firebaseClient.js).
    body.querySelector('#mydecks-detail-edit').addEventListener('click', () => {
      showDeckBuilderScreen(deck.name, renderListView, () => renderDetailView(deck), deck);
    });

    // "Eliminar": pide confirmación con texto escrito (mismo criterio que borrar la
    // cuenta — es irreversible) y nunca deja la cuenta sin ningún mazo.
    body.querySelector('#mydecks-detail-delete').addEventListener('click', () => {
      const currentDecks = (state.userProfile.decks || []);
      if (currentDecks.length <= 1) {
        showSimpleAlertModal('No podés eliminar tu único mazo — siempre tiene que quedar al menos uno guardado.');
        return;
      }
      showDeleteDeckConfirmModal(deck.name, async () => {
        try {
          const updated = await deleteDeck(state.currentUser.uid, deck.id);
          state.userProfile = updated;
          renderListView();
        } catch (err) {
          console.error('No se pudo eliminar el mazo:', err);
          showSimpleAlertModal(err.message || 'No se pudo eliminar el mazo. Probá de nuevo.');
        }
      });
    });

    const grid = body.querySelector('#mydecks-detail-grid');
    const detailZoom = body.querySelector('#mydecks-detail-zoom');
    const detailZoomValue = body.querySelector('#mydecks-detail-zoom-value');
    const syncDetailZoom = () => {
      if (!detailZoom) return;
      myDecksDetailZoom = setBrowserCardZoom(grid, detailZoom.value);
      if (detailZoomValue) detailZoomValue.textContent = String(myDecksDetailZoom);
    };
    detailZoom?.addEventListener('input', syncDetailZoom);
    syncDetailZoom();

    cards.forEach(({ displayCard, isEnhanced }) => {
      const slot = document.createElement('div');
      slot.className = 'encyclopedia-card-slot';
      slot.style.position = 'relative';
      // Acá nunca hay grisado: todo lo que está en un mazo, por definición, es tuyo.
      slot.appendChild(createCardElement(displayCard, false, true, null, 'encyclopedia', null));
      if (isEnhanced) {
        const marker = document.createElement('div');
        marker.className = 'deckbuilder-enhanced-marker';
        marker.textContent = '✨ Mejorada';
        slot.appendChild(marker);
      }
      grid.appendChild(slot);
    });
  }

  renderListView();
}

// Menú principal: primer cimiento de cara al multiplayer — todo lo que hoy arranca directo
// (boot() en main.js) ahora pasa por acá primero. Jugar/Opciones son reales; Multijugador,
// Mi Mazo y Enciclopedia quedan con el placeholder deshabilitado hasta que existan de
// verdad (no tiene sentido prometer algo que todavía no está armado).
// Fase 0/23.13.24: widget de cuenta (Auth Google, identidad visible Username Argentinia). Se usa en dos
// momentos distintos con la MISMA función — el render inicial dentro de showMainMenu, y
// cada vez que cambia el estado de sesión (login/logout/recarga con sesión activa), vía
// updateAccountUI más abajo, que ya está enganchado en boot() (main.js) apenas arranca la
// página, sin importar qué pantalla esté mostrándose en ese momento.
function bindMainMenuMusicQuickButton(root) {
  const musicQuickBtn = root?.querySelector?.('#menu-music-toggle');
  if (!musicQuickBtn) return;
  const refresh = () => {
    const audio = getAudioSettings();
    const pct = Math.round(audio.musicVolume * 100);
    musicQuickBtn.textContent = audio.musicEnabled ? '🔊' : '🔇';
    musicQuickBtn.classList.toggle('is-muted', !audio.musicEnabled);
    musicQuickBtn.title = `${gameText('options.music')}: ${audio.musicEnabled ? gameText('options.enabled') : gameText('options.off')} · ${pct}%`;
    musicQuickBtn.setAttribute('aria-pressed', audio.musicEnabled ? 'true' : 'false');
  };
  refresh();
  musicQuickBtn.addEventListener('click', () => {
    toggleMusic();
    refresh();
  });
  const onAudioSettingsChanged = () => {
    if (!musicQuickBtn.isConnected) {
      window.removeEventListener('argentinia:audio-settings-changed', onAudioSettingsChanged);
      return;
    }
    refresh();
  };
  window.addEventListener('argentinia:audio-settings-changed', onAudioSettingsChanged);
}

function renderAccountBox(container, user) {
  if (!container) return;

  if (user) {
    // Fase 2: los puntos viven en el perfil de Firestore (state.userProfile), no en el
    // objeto de auth — puede no estar cargado todavía (recién logueado) o no existir aún
    // (nunca jugó una partida), así que se muestra solo cuando hay un número real.
    const pointsHTML = state.userProfile && typeof state.userProfile.points === 'number'
      ? `<div class="main-menu-account-points">${COIN_ICON_HTML} ${gameTextHtml('account.points', { points: state.userProfile.points })}</div>`
      : '';
    // PANEL DE ADMIN: el botón solo se arma si el email logueado coincide EXACTO — para
    // cualquier otra cuenta, ni siquiera existe en el DOM (no es solo "oculto con CSS").
    const adminBtnHTML = user.email === ADMIN_EMAIL
      ? `<button class="main-menu-admin-btn" id="menu-admin">${gameTextHtml('account.admin')}</button>`
      : '';
    const inventory = normalizeInventory(state.userProfile?.inventory);
    const chestPending = inventory[CHEST_ITEM_KEYS.standardPack] + inventory[CHEST_ITEM_KEYS.guaranteedMythic];
    const rewardsPending = state.userProfile ? unclaimedUnlockedDays(state.userProfile.dailyRewards).length : 0;
    const rewardActionsHTML = `
      <div class="main-menu-account-actions">
        <button class="main-menu-reward-btn" id="menu-chest">${gameTextHtml('account.chest')}${chestPending ? `<span class="main-menu-reward-badge">${chestPending}</span>` : ''}</button>
        <button class="main-menu-reward-btn" id="menu-daily-rewards">${gameTextHtml('account.dailyRewards')}${rewardsPending ? `<span class="main-menu-reward-badge">${rewardsPending}</span>` : ''}</button>
        <button class="main-menu-music-btn" id="menu-music-toggle" type="button" aria-label="Música">🔊</button>
      </div>`;
    container.innerHTML = `
      ${adminBtnHTML}
      ${rewardActionsHTML}
      <div class="main-menu-account-info">
        <img class="main-menu-account-photo" src="${user.photoURL || ''}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="main-menu-account-name">${getLocalPlayerName()}</div>
          ${pointsHTML}
          <button class="main-menu-rename-btn" id="menu-rename" ${state.userProfile ? '' : 'disabled'}>${gameTextHtml('account.rename', { cost: USERNAME_RENAME_COST })}</button>
          <button class="main-menu-logout-btn" id="menu-logout">${gameTextHtml('account.logout')}</button>
        </div>
      </div>
    `;
    bindMainMenuMusicQuickButton(container);
    container.querySelector('#menu-chest').addEventListener('click', () => {
      if (!state.userProfile) return;
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      showChestScreen(() => {
        if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        renderAccountBox(container, state.currentUser);
      });
    });
    container.querySelector('#menu-daily-rewards').addEventListener('click', () => {
      if (!state.userProfile) return;
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      showDailyRewardsScreen(() => {
        if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        renderAccountBox(container, state.currentUser);
      });
    });
    if (user.email === ADMIN_EMAIL) {
      container.querySelector('#menu-admin').addEventListener('click', () => {
        const mainMenuOverlay = document.getElementById('main-menu-overlay');
        if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
        showAdminPanel(() => {
          if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        });
      });
    }
    container.querySelector('#menu-rename')?.addEventListener('click', () => {
      if (!state.currentUser || !state.userProfile) return;
      if (state.currentMatch || state.userProfile.activeMatchId) {
        showSimpleAlertModal(gameText('account.renameActiveMatch'));
        return;
      }
      if ((Number(state.userProfile.fichas) || 0) < USERNAME_RENAME_COST) {
        showSimpleAlertModal(gameText('account.renameNeedFichas', { cost: USERNAME_RENAME_COST }));
        return;
      }
      showUsernameRenameModal({
        currentUsername: getLocalPlayerName(),
        fichas: Number(state.userProfile.fichas) || 0,
        onSave: async ({ username, usernameKey }) => {
          const updated = await renameUsername(
            state.currentUser.uid,
            username,
            usernameKey,
            USERNAME_RENAME_COST
          );
          state.userProfile = updated;
          state.currentUser.username = updated.username;
          state.currentUser.usernameKey = updated.usernameKey;
          // 23.13.30 — el rename ya fue confirmado por Firestore. Refrescamos la identidad
          // visible usando el renderer REAL de cuenta/HUD. El helper anterior nunca existió
          // en este módulo: lanzaba ReferenceError DESPUÉS del commit exitoso,
          // dejando el modal abierto y pudiendo conservar copy/estado visual viejo.
          updateAccountUI(state.currentUser);
          return updated;
        }
      });
    });

    container.querySelector('#menu-logout').addEventListener('click', () => {
      signOutUser().catch(err => {
        console.error('Error al cerrar sesión:', err);
      });
    });
  } else {
    container.innerHTML = `<button class="main-menu-login-btn" id="menu-login">${gameTextHtml('account.loginGoogle')}</button>`;
    container.querySelector('#menu-login').addEventListener('click', () => {
      container.innerHTML = `<button class="main-menu-login-btn" id="menu-login" disabled>${gameTextHtml('account.connecting')}</button>`;
      signInWithGoogle().catch(err => {
        // El caso más común acá ni siquiera es un error real: el jugador cerró el popup
        // sin elegir cuenta (auth/popup-closed-by-user) — no hace falta asustarlo por eso.
        console.error('Error al iniciar sesión:', err);
        renderAccountBox(container, null);
        const errMsg = document.createElement('div');
        errMsg.className = 'main-menu-account-error';
        errMsg.textContent = err.code === 'auth/popup-closed-by-user'
          ? ''
          : gameText('account.loginError');
        if (errMsg.textContent) container.appendChild(errMsg);
      });
    });
  }
}

// Se llama desde boot() (main.js) cada vez que Firebase avisa un cambio de sesión — no
// asume que haya un menú o un tablero en pantalla, chequea cada pieza por separado antes de
// tocarla, porque el login puede pasar en cualquier momento de la vida de la página.
// BUGFIX (revisión post-Etapa 4): Enciclopedia/Mis Mazos/Tienda pasan a "deshabilitado"
// (mismo look que Multijugador) sin sesión, y a botón normal con sesión — se llama al
// armar el menú Y cada vez que cambia el login (por si alguien se loguea con el menú ya
// abierto, sin tener que cerrar y volver a entrar para que se note).
function updateMainMenuLoginGatedButtons(overlay) {
  const identityReady = state.authInitialResolved === true && state.authIdentityReady === true;
  const loggedInReady = identityReady && !!state.currentUser && !!state.userProfile;
  const guestReady = identityReady && !state.currentUser;

  const setGate = (id, enabled, tooltip) => {
    const btn = overlay.querySelector(`#${id}`);
    if (!btn) return;
    if (enabled) {
      btn.classList.remove('main-menu-btn-disabled');
      btn.removeAttribute('data-tooltip');
    } else {
      btn.classList.add('main-menu-btn-disabled');
      btn.setAttribute('data-tooltip', tooltip);
    }
  };

  const authTooltip = identityReady
    ? gameText('menu.loginRequiredTooltip')
    : gameText('menu.authCheckingTooltip');

  // Jugar puede ser guest, pero JAMÁS mientras todavía no sabemos si existe una sesión
  // persistida. Las superficies privadas además exigen perfil Firestore listo.
  setGate('menu-play', guestReady || loggedInReady, authTooltip);
  ['menu-multiplayer', 'menu-encyclopedia', 'menu-mydecks', 'menu-store'].forEach(id => {
    setGate(id, loggedInReady, authTooltip);
  });
}



// 23.13.29 — el primer menú puede haberse dibujado antes de que llegue gameConfig/texts.
// Cuando el documento remoto se aplica (o Admin guarda un override), refrescamos sólo la
// copy visible del menú/cuenta; las demás pantallas consumirán gameText() al abrirse.
function refreshVisibleGameTextCopy() {
  const menu = document.getElementById('main-menu-overlay');
  if (!menu) return;
  const labels = {
    'menu-play': 'menu.play',
    'menu-multiplayer': 'menu.multiplayer',
    'menu-mydecks': 'menu.myDecks',
    'menu-ranking': 'menu.ranking',
    'menu-encyclopedia': 'menu.encyclopedia',
    'menu-store': 'menu.store',
    'menu-options': 'menu.options'
  };
  Object.entries(labels).forEach(([id, key]) => {
    const el = menu.querySelector(`#${id}`);
    if (el) el.textContent = gameText(key);
  });
  const newsTitle = menu.querySelector('.main-menu-news-title');
  if (newsTitle) newsTitle.textContent = gameText('menu.news.title');
  const account = menu.querySelector('#main-menu-account');
  if (account) renderAccountBox(account, state.currentUser);
  updateMainMenuLoginGatedButtons(menu);
}

if (typeof window !== 'undefined') {
  window.addEventListener('argentinia:game-texts-updated', refreshVisibleGameTextCopy);
}

// FASE 4 / HOTFIX 23.4.2: el documento público del match ya contiene el perfil
// básico de ambos jugadores ({ username, displayName legacy, photoURL }). La lógica de gameplay usa
// getRivalName(), pero el HUD superior seguía mostrando el fallback estático del HTML.
// 23.17.5.7: Solitario usa una imagen propia del Tano desde assets/images/ui/tano.png sin
// cambiar la geometría histórica del avatar (el círculo sigue midiendo 2.4rem). Multiplayer
// conserva foto de perfil del rival y emoji sólo como fallback si esa foto no existe/falla.
const TANO_AVATAR_SRC = 'assets/images/ui/tano.png';

function setAvatarImageOrFallback(container, src, fallbackText, className='') {
  if (!container) return;
  container.textContent = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  if (className) img.className = className;
  img.addEventListener('error', () => {
    container.textContent = fallbackText;
  }, { once: true });
  container.appendChild(img);
}

function updateRivalAccountUI() {
  if (!els.rivalAvatar && !els.rivalPlayerName) return;

  const multiplayer = !!state.currentMatch;
  const rivalName = multiplayer ? getRivalName() : 'El Tano';
  const rivalPhotoURL = multiplayer ? (state.currentMatch.rivalPhotoURL || '') : '';

  if (els.rivalPlayerName) {
    els.rivalPlayerName.textContent = multiplayer ? `${rivalName} (TU RIVAL)` : 'El Tano (TU RIVAL)';
  }

  if (els.rivalAvatar) {
    const identityKey = multiplayer ? `mp|${rivalPhotoURL}` : `solo|${TANO_AVATAR_SRC}`;
    if (els.rivalAvatar.dataset.identityKey !== identityKey) {
      els.rivalAvatar.dataset.identityKey = identityKey;
      if (!multiplayer) {
        setAvatarImageOrFallback(els.rivalAvatar, TANO_AVATAR_SRC, '🤠', 'tano-avatar-img');
      } else if (rivalPhotoURL) {
        setAvatarImageOrFallback(els.rivalAvatar, rivalPhotoURL, '🤠');
      } else {
        els.rivalAvatar.textContent = '🤠';
      }
    }
  }
}

export function updateAccountUI(user) {
  if (els.localAvatar) {
    els.localAvatar.innerHTML = (user && user.photoURL)
      ? `<img src="${user.photoURL}" alt="" onerror="this.parentElement.textContent='🧉'">`
      : '🧉';
  }
  if (els.localPlayerName) {
    // BUGFIX: sin sesión, "El Gaucho (VOS)" como siempre. Con sesión, SOLO el nombre de
    // pila (sin apellido, por privacidad) y sin el "(VOS)" — ya queda claro que sos vos
    // por el contexto del HUD.
    els.localPlayerName.textContent = user ? getLocalPlayerName() : 'El Gaucho (VOS)';
  }
  renderAccountBox(document.getElementById('main-menu-account'), user);
  const mainMenuOverlay = document.getElementById('main-menu-overlay');
  if (mainMenuOverlay) updateMainMenuLoginGatedButtons(mainMenuOverlay);
}

function injectAdminPanelStyles() {
  if (document.getElementById('admin-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-panel-styles';
  style.textContent = `
    #admin-panel-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #1f1530 0%, #0b0713 100%);
      display: flex; flex-direction: column;
      padding: 24px 32px;
    }
    .admin-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-shrink: 0; }
    .admin-title { font-size: 26px; font-weight: 700; color: #e8d4f5; text-shadow: 0 0 20px rgba(176,106,212,0.4); }
    .admin-body { flex: 1; overflow-y: auto; max-width: 1180px; width: 100%; margin: 0 auto; padding-bottom: 40px; }
    .admin-section {
      background: rgba(30,20,45,0.5); border: 2px solid rgba(176,106,212,0.3); border-radius: 14px;
      padding: 20px 24px; margin-bottom: 18px;
    }
    .admin-section-title {
      color: #e8d4f5; font-size: 15px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 14px; padding-bottom: 8px;
      border-bottom: 1px solid rgba(176,106,212,0.2);
    }
    .admin-field-row {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 8px 0;
    }
    .admin-field-label { color: #d8c4e8; font-size: 13px; flex: 1; }
    .admin-field-input {
      width: 100px; box-sizing: border-box;
      background: rgba(255,255,255,0.06); border: 1.5px solid rgba(176,106,212,0.4); border-radius: 6px;
      color: #f0e0b0; font-size: 14px; font-weight: 600; padding: 6px 10px; text-align: right;
    }
    .admin-field-input:focus { outline: none; border-color: #b06ad4; }
    /* 23.13.65 — todos los SELECT dentro del Admin usan fondo oscuro Argentinia.
       Conservamos tipografía gold pero eliminamos el popup blanco ilegible del navegador. */
    #admin-panel-overlay select {
      background-color:#0b130e !important; color:#f0d56a !important; color-scheme:dark;
      border-color:rgba(212,175,55,.48);
    }
    #admin-panel-overlay select option, #admin-panel-overlay select optgroup {
      background-color:#0b130e !important; color:#f0d56a !important;
    }
    .admin-field-row-disabled .admin-field-label { opacity: 0.5; }
    .admin-field-row-disabled .admin-field-input { opacity: 0.4; cursor: not-allowed; }
    .admin-save-btn {
      background: linear-gradient(180deg, rgba(176,106,212,0.3), rgba(11,19,14,0.96));
      border: 2px solid #b06ad4; border-radius: 10px;
      color: #f0e0b0; font-size: 15px; font-weight: 700;
      padding: 12px 28px; cursor: pointer; width: 100%; margin-top: 8px;
      transition: box-shadow 0.15s ease;
    }
    .admin-save-btn:hover { box-shadow: 0 4px 22px rgba(176,106,212,0.4); }
    .admin-save-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
    .admin-success-msg { color: #7cbf7c; font-size: 13px; margin-top: 10px; text-align: center; }
    .admin-pane-narrow { max-width: 700px; margin: 0 auto; }
    .admin-tab-pane.hidden { display: none !important; }
    .admin-future-box { text-align: center; padding: 46px 24px; color: #bda9cd; }
    .admin-future-icon { display:block; font-size:42px; margin-bottom:12px; }
    .admin-debug-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .admin-debug-summary { color:#cdb9dc; font-size:13px; }
    .admin-debug-refresh { width:auto; margin:0; padding:8px 14px; font-size:13px; }
    .admin-debug-table-wrap { overflow:auto; border:1px solid rgba(176,106,212,0.25); border-radius:10px; background:rgba(8,5,12,0.45); }
    .admin-debug-table { width:100%; border-collapse:collapse; min-width:920px; font-size:12px; }
    .admin-debug-table th { position:sticky; top:0; z-index:2; background:#24162f; color:#ead9f4; text-align:left; padding:10px 9px; border-bottom:1px solid rgba(176,106,212,0.35); white-space:nowrap; }
    .admin-debug-table td { padding:9px; border-bottom:1px solid rgba(176,106,212,0.13); color:#d9cce2; vertical-align:middle; }
    .admin-debug-table tr:last-child td { border-bottom:none; }
    .admin-debug-table tbody tr:hover { background:rgba(176,106,212,0.07); }
    .admin-debug-mode { display:inline-block; border:1px solid rgba(212,175,55,0.45); border-radius:999px; padding:3px 7px; color:#f0e0b0; white-space:nowrap; }
    .admin-debug-match { color:#8f7aa0; font-size:10px; margin-top:3px; font-family:monospace; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .admin-debug-bug-auto { color:#e8a35a; font-weight:700; white-space:nowrap; }
    .admin-debug-bug-manual { color:#d790ce; font-size:10px; white-space:nowrap; }
    .admin-debug-status { display:inline-block; padding:3px 7px; border-radius:999px; background:rgba(255,255,255,0.06); white-space:nowrap; }
    .admin-debug-status.completed { color:#81c784; }
    .admin-debug-status.running { color:#ffd166; }
    .admin-debug-status.interrupted { color:#ff9f6e; background:rgba(255,120,75,.10); }
    .admin-stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(175px,1fr)); gap:10px; margin-top:12px; }
    .admin-stat-card { border:1px solid rgba(176,106,212,.25); border-radius:10px; padding:12px; background:rgba(8,5,12,.45); }
    .admin-stat-label { color:#a997b6; font-size:11px; text-transform:uppercase; letter-spacing:.45px; }
    .admin-stat-value { color:#f1dfb4; font-size:24px; font-weight:800; margin-top:4px; }
    .admin-stat-sub { color:#8f8298; font-size:10px; margin-top:3px; }
    .admin-debug-download { width:auto; margin:0; padding:7px 10px; font-size:12px; white-space:nowrap; }
    .admin-debug-empty { padding:30px; color:#a995b8; text-align:center; font-style:italic; }
    .admin-debug-error { padding:18px; color:#e07a6b; text-align:center; }
  `;
  document.head.appendChild(style);
}

// PANEL DE ADMIN: formulario de balance, con GUARDAR escribiendo de verdad en Firestore
// (gameConfig/settings) y aplicando el cambio YA en esta misma sesión (applyGameConfig),
// sin necesitar recargar la página. El acceso real está blindado del lado del servidor
// (firestore.rules) — acá solo hay un chequeo defensivo extra, por si algo raro hiciera
// llegar a alguien que no sea el admin hasta este punto.
export function showAdminPanel(onBack) {
  injectAdminPanelStyles();
  injectEncyclopediaStyles(); // reusa tabs + botón Volver con el mismo lenguaje visual
  injectStoreStyles(); // .store-error-msg y demás compartidos

  if (!state.currentUser || state.currentUser.email !== ADMIN_EMAIL) {
    console.error('showAdminPanel: acceso bloqueado, la cuenta actual no es la del admin.');
    onBack();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'admin-panel-overlay';

  const fields = [
    { section: 'Puntos', id: 'winVsTanoFacil', label: 'Victoria vs Tano (Fácil)', value: POINTS.winVsTanoFacil, step: '1' },
    { section: 'Puntos', id: 'winVsTanoMedio', label: 'Victoria vs Tano (Medio)', value: POINTS.winVsTanoMedio, step: '1' },
    { section: 'Puntos', id: 'winVsTanoDificil', label: 'Victoria vs Tano (Difícil)', value: POINTS.winVsTanoDificil, step: '1' },
    { section: 'Puntos', id: 'lossVsTano', label: 'Derrota vs Tano', value: POINTS.lossVsTano, step: '1' },
    { section: 'Puntos', id: 'winVsHumano', label: 'Victoria vs Humano (PvP)', value: POINTS.winVsHumano, step: '1' },
    { section: 'Puntos', id: 'lossVsHumano', label: 'Derrota vs Humano (PvP)', value: POINTS.lossVsHumano, step: '1' },
    { section: 'Puntos', id: 'abandonPenalty', label: 'Penalidad por abandonar', value: POINTS.abandonPenalty, step: '1' },
    { section: 'PUNTOS Y LÍMITES DIARIOS', id: 'pvpMinRewardMinutes', label: 'PvP · minutos mínimos para puntuar por abandono', value: PVP_LIMITS.minRewardMinutes, step: '1' },
    { section: 'PUNTOS Y LÍMITES DIARIOS', id: 'pvpMinCompletedTurns', label: 'PvP · turnos completos mínimos para puntuar por abandono', value: PVP_LIMITS.minCompletedTurns, step: '1' },
    { section: 'PUNTOS Y LÍMITES DIARIOS', id: 'pvpMaxRewardedMatchesPerPairDaily', label: 'PvP · máximo de partidas puntuadas por pareja de UID / día', value: PVP_LIMITS.maxRewardedMatchesPerPairDaily, step: '1' },
    { section: 'PUNTOS Y LÍMITES DIARIOS', id: 'pvpMaxPointsPerDay', label: 'PvP · máximo de puntos por cuenta / día', value: PVP_LIMITS.maxPointsPerDay, step: '1' },
    { section: 'Sobres', id: 'packCost', label: 'Costo del sobre (puntos)', value: PACK_COST, step: '1' },
    { section: 'Sobres', id: 'mythicChancePercent', label: 'Probabilidad de carta mítica (%)', value: +(MYTHIC_CHANCE_IN_RARE_SLOT * 100).toFixed(2), step: '0.1' },
    { section: 'Fichas', id: 'fichasPerEnhancement', label: 'Fichas necesarias para craftear', value: FICHAS_PER_ENHANCEMENT, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsCommonPoints', label: 'Common · puntos', value: CLASSIFIEDS_COMMON_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsCommonFichas', label: 'Common · Fichas', value: CLASSIFIEDS_COMMON_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsUncommonPoints', label: 'Uncommon · puntos', value: CLASSIFIEDS_UNCOMMON_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsUncommonFichas', label: 'Uncommon · Fichas', value: CLASSIFIEDS_UNCOMMON_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsRarePoints', label: 'Rare · puntos', value: CLASSIFIEDS_RARE_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsRareFichas', label: 'Rare · Fichas', value: CLASSIFIEDS_RARE_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsMythicPoints', label: 'Mythic · puntos', value: CLASSIFIEDS_MYTHIC_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsMythicFichas', label: 'Mythic · Fichas', value: CLASSIFIEDS_MYTHIC_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsMythicChancePercent', label: 'Chance Mythic en slot premium (%)', value: +(CLASSIFIEDS_MYTHIC_CHANCE * 100).toFixed(2), step: '0.1' },
    { section: 'Mazos', id: 'deckSizeExact', label: 'Cartas exactas por mazo', value: DECK_SIZE_EXACT, step: '1' },
    { section: 'Mazos', id: 'maxCopiesPerCard', label: 'Máximo de copias iguales por mazo', value: MAX_COPIES_PER_CARD, step: '1' },
    { section: 'Mazos', id: 'maxEnhancedCardsPerDeck', label: 'Máximo de cartas mejoradas por mazo', value: MAX_ENHANCED_CARDS_PER_DECK, step: '1' },
    { section: 'Mazos', id: 'maxSavedDecks', label: 'Máximo de mazos guardados por cuenta', value: MAX_SAVED_DECKS, step: '1' },
    { section: 'Mazos Prearmados', id: 'prebuiltDeckPoints', label: 'Costo global · puntos', value: PREBUILT_DECK_POINTS, step: '1' },
    { section: 'Mazos Prearmados', id: 'prebuiltDeckFichas', label: 'Costo global · Fichas', value: PREBUILT_DECK_FICHAS, step: '1' }
  ];

  const sections = [...new Set(fields.map(f => f.section))];
  const sectionsHTML = sections.map(sectionName => {
    const rowsHTML = fields.filter(f => f.section === sectionName).map(f => `
      <div class="admin-field-row">
        <span class="admin-field-label">${f.label}</span>
        <input type="number" class="admin-field-input" id="cfg-${f.id}" value="${f.value}" step="${f.step}">
      </div>
    `).join('');
    return `<div class="admin-section"><div class="admin-section-title">${sectionName}</div>${rowsHTML}</div>`;
  }).join('');

  const placeholdersHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Próximamente</div>
      <div class="admin-field-row admin-field-row-disabled">
        <span class="admin-field-label">Vida inicial de cada jugador</span>
        <input type="number" class="admin-field-input" value="20" disabled>
      </div>
      <div class="admin-field-row admin-field-row-disabled">
        <span class="admin-field-label">Tamaño de mano inicial</span>
        <input type="number" class="admin-field-input" value="7" disabled>
      </div>
    </div>
  `;

  const grantHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Regalar Puntos, Fichas o Sobres</div>
      <div class="admin-field-row">
        <span class="admin-field-label">Cantidad</span>
        <input type="number" class="admin-field-input" id="grant-amount" value="0" step="1">
      </div>
      <div class="admin-field-row">
        <span class="admin-field-label">Moneda</span>
        <select class="admin-field-input" id="grant-currency" style="text-align:left;">
          <option value="points">Puntos</option>
          <option value="fichas">Fichas</option>
          <option value="standardPacks">Sobres para Mi Cofre</option>
        </select>
      </div>
      <div class="admin-field-row">
        <span class="admin-field-label">Para</span>
        <select class="admin-field-input" id="grant-recipient" style="text-align:left; max-width: 220px;">
          <option value="">Cargando usuarios…</option>
        </select>
      </div>
      <div class="admin-field-row">
        <span class="admin-field-label">Motivo (opcional)</span>
        <input type="text" class="admin-field-input" id="grant-reason" placeholder="ej: compensación por bug" style="text-align:left; width:220px;">
      </div>
      <button class="admin-save-btn" id="admin-grant-send">📤 Enviar</button>
      <div class="store-error-msg" id="admin-grant-error" style="text-align:center;"></div>
      <div class="admin-success-msg" id="admin-grant-success"></div>
    </div>
  `;


  const adminTabs = [
    { key: 'game', label: 'AJUSTES DEL JUEGO' },
    { key: 'texts', label: 'TEXTOS DEL JUEGO' },
    { key: 'messages', label: 'MENSAJES Y USUARIOS' },
    { key: 'campaigns', label: gameText('admin.tab.campaigns') },
    { key: 'stats', label: gameText('admin.tab.statistics') },
    { key: 'debug', label: 'DEBUGGING' }
  ];
  const tabsHTML = adminTabs.map((tab, idx) =>
    `<button class="encyclopedia-tab${idx === 0 ? ' active' : ''}" data-admin-tab="${tab.key}">${tab.label}</button>`
  ).join('');

  overlay.innerHTML = `
    <div class="admin-header">
      <button class="encyclopedia-back-btn" id="admin-back">← Volver</button>
      <div class="admin-title">🛠️ Panel de Admin <span style="font-size:12px;color:#d4af37;opacity:.92">· Motor ${ENGINE_VERSION}</span></div>
    </div>
    <div class="admin-body">
      <div class="encyclopedia-tabs" id="admin-tabs">${tabsHTML}</div>

      <div class="admin-tab-pane" data-admin-pane="game">
        <div class="admin-pane-narrow">
          ${sectionsHTML}
          ${placeholdersHTML}
          <button class="admin-save-btn" id="admin-save">💾 Guardar cambios</button>
          <div class="store-error-msg" id="admin-error" style="text-align:center;"></div>
          <div class="admin-success-msg" id="admin-success"></div>
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="texts">
        <div id="admin-game-texts-root"></div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="messages">
        <div class="admin-pane-narrow">
          ${grantHTML}
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="campaigns">
        <div id="admin-campaigns-root"></div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="stats">
        <div class="admin-section">
          <div class="admin-debug-toolbar">
            <div><div class="admin-section-title">${gameTextHtml('admin.stats.title')}</div><div class="admin-debug-summary" id="admin-stats-summary">${gameTextHtml('admin.stats.initial')}</div></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <button class="admin-save-btn" id="admin-stats-sync">${gameTextHtml('admin.stats.sync')}</button>
              <button class="admin-save-btn" id="admin-stats-refresh">${gameTextHtml('admin.stats.refresh')}</button>
            </div>
          </div>
          <div id="admin-stats-cards" class="admin-stats-grid"></div>
          <div class="admin-debug-table-wrap" id="admin-stats-detail" style="margin-top:14px;"></div>
          <div class="admin-debug-summary" style="margin-top:10px;">${gameTextHtml('admin.stats.methodNote')}</div>
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="debug">
        <div class="admin-section">
          <div class="admin-section-title">${gameTextHtml('admin.images.title')}</div>
          <div class="admin-debug-toolbar">
            <div class="admin-debug-summary" id="admin-image-summary">${gameTextHtml('admin.images.initial')}</div>
            <button class="admin-save-btn admin-debug-refresh" id="admin-image-refresh">${gameTextHtml('admin.images.refresh')}</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
            <button class="admin-save-btn" id="admin-image-toggle" style="display:none;">${gameTextHtml('admin.images.showAll')}</button>
            <button class="admin-save-btn" id="admin-image-download-txt" disabled>${gameTextHtml('admin.images.downloadTxt')}</button>
            <button class="admin-save-btn" id="admin-image-download-json" disabled>${gameTextHtml('admin.images.downloadJson')}</button>
          </div>
          <div class="admin-debug-table-wrap" id="admin-image-table-wrap">
            <div class="admin-debug-empty">${gameTextHtml('admin.images.initialLoading')}</div>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-title">Caja negra — historial de partidas</div>
          <div class="admin-debug-toolbar">
            <div class="admin-debug-summary" id="admin-debug-summary">Entrá a esta solapa para cargar los logs.</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <button class="admin-save-btn admin-debug-refresh" id="admin-debug-cleanup">${gameTextHtml('admin.debug.cleanupStale')}</button>
              <button class="admin-save-btn admin-debug-refresh" id="admin-debug-refresh">🔄 Actualizar</button>
            </div>
          </div>
          <div class="admin-debug-table-wrap" id="admin-debug-table-wrap">
            <div class="admin-debug-empty">Cargando historial…</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const gameTextsAdminPane = createGameTextsAdminPane({
    loadDocument: loadGameTextOverrides,
    saveDocument: saveGameTextOverrides,
    onApplied: notifyGameTextsApplied
  });
  overlay.querySelector('#admin-game-texts-root')?.appendChild(gameTextsAdminPane.element);
  let gameTextsAdminLoaded = false;

  let debugLoaded = false;
  let debugLoading = false;
  let debugSessions = [];
  let imageAuditLoaded = false;
  let imageAuditLoading = false;
  let imageAuditShowAll = false;
  let imageAudit = null;

  function parseAdminJson(value, fallback = {}) {
    if (typeof value !== 'string' || !value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function formatTelemetryDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' });
  }

  function normalizeTelemetryMode(rawMode) {
    const raw = String(rawMode || '').toLowerCase();
    if (raw.startsWith('multiplayer')) return raw.includes('reconnect') ? 'Multijugador · reconexión' : 'Multijugador';
    if (raw === 'solo') return 'Solo';
    return rawMode || '—';
  }

  function safeDownloadPart(value) {
    return String(value || 'partida').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'partida';
  }

  function downloadAdminJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadAdminText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderImageAudit(audit) {
    const wrap = overlay.querySelector('#admin-image-table-wrap');
    const summary = overlay.querySelector('#admin-image-summary');
    const toggle = overlay.querySelector('#admin-image-toggle');
    const txtBtn = overlay.querySelector('#admin-image-download-txt');
    const jsonBtn = overlay.querySelector('#admin-image-download-json');
    const missingCards = Array.isArray(audit?.missing) ? audit.missing : [];
    const missingFronts = missingCards.filter(entry => entry?.face !== 'back');
    const missingBacks = missingCards.filter(entry => entry?.face === 'back');
    const tokenManifestPresent = !!audit?.tokenImages && Array.isArray(audit?.missingTokenImages) && Array.isArray(audit?.tokenEffectsWithoutImage);
    const missingTokenEffects = tokenManifestPresent ? audit.missingTokenImages : [];
    const unassignedTokenEffects = tokenManifestPresent ? audit.tokenEffectsWithoutImage : [];
    const generated = audit?.generatedAt ? formatTelemetryDate(audit.generatedAt) : '—';

    const tokenGroupsMap = new Map();
    missingTokenEffects.forEach(entry => {
      const key = `${entry.image || '—'}::${entry.tokenName || 'Ficha'}`;
      if (!tokenGroupsMap.has(key)) tokenGroupsMap.set(key, { image: entry.image || '', tokenName: entry.tokenName || 'Ficha', entries: [] });
      tokenGroupsMap.get(key).entries.push(entry);
    });
    const tokenGroups = [...tokenGroupsMap.values()].sort((a,b) => String(a.tokenName).localeCompare(String(b.tokenName), 'es-AR'));

    summary.textContent = tokenManifestPresent
      ? gameText('admin.images.summary', { fronts: missingFronts.length, backs: missingBacks.length, tokenFiles: tokenGroups.length, tokenEffects: missingTokenEffects.length, unassigned: unassignedTokenEffects.length, generated })
      : gameText('admin.images.legacySummary', { cards: missingCards.length, generated });
    txtBtn.disabled = false;
    jsonBtn.disabled = false;

    const blocks = [];
    if (!tokenManifestPresent) blocks.push(`<div class="admin-debug-error">${escapeHtml(gameText('admin.images.oldManifest'))}</div>`);

    const pushCardFaceBlock = (entries, titleKey, faceLabel) => {
      if (!entries.length) return;
      const visible = imageAuditShowAll ? entries : entries.slice(0, 20);
      const rows = visible.map(entry => `
        <tr><td><code>${escapeHtml(entry.id || '—')}</code></td><td>${escapeHtml(entry.name || '—')}</td><td>${escapeHtml(faceLabel)}</td><td>${escapeHtml(entry.category || '—')}</td><td><code>${escapeHtml(entry.image || '—')}</code></td></tr>
      `).join('');
      blocks.push(`
        <div class="admin-section-title" style="font-size:13px;margin-top:8px;">${escapeHtml(gameText(titleKey, { count: entries.length }))}</div>
        <table class="admin-debug-table"><thead><tr><th>${escapeHtml(gameText('admin.images.col.id'))}</th><th>${escapeHtml(gameText('admin.images.col.card'))}</th><th>${escapeHtml(gameText('admin.images.col.face'))}</th><th>${escapeHtml(gameText('admin.images.col.category'))}</th><th>${escapeHtml(gameText('admin.images.col.png'))}</th></tr></thead><tbody>${rows}</tbody></table>
        ${!imageAuditShowAll && entries.length > 20 ? `<div class="admin-debug-empty">${escapeHtml(gameText('admin.images.first20'))}</div>` : ''}
      `);
    };
    pushCardFaceBlock(missingFronts, 'admin.images.frontsTitle', 'Frente');
    pushCardFaceBlock(missingBacks, 'admin.images.backsTitle', 'Reverso');

    if (tokenManifestPresent && tokenGroups.length) {
      const visible = imageAuditShowAll ? tokenGroups : tokenGroups.slice(0, 20);
      const rows = visible.map(group => {
        const producers = group.entries.map(entry => `${entry.cardId || '—'} · ${entry.cardName || '—'}`).join(' / ');
        const categories = [...new Set(group.entries.map(entry => entry.category || '—'))].join(' / ');
        const amounts = [...new Set(group.entries.map(entry => Number(entry.amount) || 1))].join(' / ');
        const paths = [...new Set(group.entries.map(entry => entry.path || '—'))].join(' / ');
        return `<tr><td>${escapeHtml(group.tokenName)}</td><td>${escapeHtml(producers)}</td><td>${escapeHtml(categories)}</td><td>${escapeHtml(amounts)}</td><td><code>${escapeHtml(group.image)}</code></td><td><code>${escapeHtml(paths)}</code></td></tr>`;
      }).join('');
      blocks.push(`
        <div class="admin-section-title" style="font-size:13px;margin-top:16px;">${escapeHtml(gameText('admin.images.tokensTitle', { files: tokenGroups.length, effects: missingTokenEffects.length }))}</div>
        <table class="admin-debug-table"><thead><tr><th>${escapeHtml(gameText('admin.images.col.token'))}</th><th>${escapeHtml(gameText('admin.images.col.card'))}</th><th>${escapeHtml(gameText('admin.images.col.category'))}</th><th>${escapeHtml(gameText('admin.images.col.amount'))}</th><th>${escapeHtml(gameText('admin.images.col.png'))}</th><th>${escapeHtml(gameText('admin.images.col.path'))}</th></tr></thead><tbody>${rows}</tbody></table>
        ${!imageAuditShowAll && tokenGroups.length > 20 ? `<div class="admin-debug-empty">${escapeHtml(gameText('admin.images.first20'))}</div>` : ''}
      `);
    }

    if (tokenManifestPresent && unassignedTokenEffects.length) {
      const visible = imageAuditShowAll ? unassignedTokenEffects : unassignedTokenEffects.slice(0, 20);
      const rows = visible.map(entry => `<tr><td>${escapeHtml(entry.tokenName || 'Ficha')}</td><td><code>${escapeHtml(entry.cardId || '—')}</code> · ${escapeHtml(entry.cardName || '—')}</td><td><code>${escapeHtml(entry.path || '—')}</code></td></tr>`).join('');
      blocks.push(`
        <div class="admin-section-title" style="font-size:13px;margin-top:16px;color:#e6a46f;">${escapeHtml(gameText('admin.images.unassignedTitle', { count: unassignedTokenEffects.length }))}</div>
        <table class="admin-debug-table"><thead><tr><th>${escapeHtml(gameText('admin.images.col.token'))}</th><th>${escapeHtml(gameText('admin.images.col.card'))}</th><th>${escapeHtml(gameText('admin.images.col.path'))}</th></tr></thead><tbody>${rows}</tbody></table>
      `);
    }

    if (!missingCards.length && tokenManifestPresent && !tokenGroups.length && !unassignedTokenEffects.length) {
      blocks.push(`<div class="admin-debug-empty">${escapeHtml(gameText('admin.images.allOk'))}</div>`);
    }

    const needToggle = missingFronts.length > 20 || missingBacks.length > 20 || tokenGroups.length > 20 || unassignedTokenEffects.length > 20;
    toggle.style.display = needToggle ? '' : 'none';
    toggle.textContent = imageAuditShowAll ? gameText('admin.images.showFirst') : gameText('admin.images.showAll');
    wrap.innerHTML = blocks.join('');
  }

  async function reloadImageAudit(force = false) {
    if (imageAuditLoading) return;
    imageAuditLoading = true;
    const refreshBtn = overlay.querySelector('#admin-image-refresh');
    const wrap = overlay.querySelector('#admin-image-table-wrap');
    refreshBtn.disabled = true;
    refreshBtn.textContent = gameText('admin.images.refreshLoading');
    wrap.innerHTML = `<div class="admin-debug-empty">${escapeHtml(gameText('admin.images.loading'))}</div>`;
    try {
      imageAudit = await cardDb.getImageAudit({ force });
      imageAuditLoaded = true;
      renderImageAudit(imageAudit);
    } catch (err) {
      console.error('No se pudo cargar el manifiesto de imágenes:', err);
      imageAuditLoaded = false;
      overlay.querySelector('#admin-image-summary').textContent = gameText('admin.images.unavailable');
      wrap.innerHTML = `<div class="admin-debug-error">${escapeHtml(gameText('admin.images.loadError', { message: err?.message || String(err) }))}</div>`;
    } finally {
      imageAuditLoading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = gameText('admin.images.refresh');
    }
  }

  function telemetryBugCounts(session) {
    const total = Number(session.bugCandidateCount || 0);
    const stats = parseAdminJson(session.statsJson, {});
    if (Number.isFinite(stats.automaticBugCandidateCount) && Number.isFinite(stats.manualBugMarkerCount)) {
      return {
        total,
        automatic: stats.automaticBugCandidateCount,
        automaticOccurrences: Number.isFinite(stats.automaticBugOccurrenceCount) ? stats.automaticBugOccurrenceCount : stats.automaticBugCandidateCount,
        manual: stats.manualBugMarkerCount,
        exactSplit: true
      };
    }
    const summaries = parseAdminJson(session.bugCandidatesJson, []);
    const manualKnown = Array.isArray(summaries) ? summaries.filter(b => b?.code === 'MANUAL_BUG_MARKER').length : 0;
    const splitIsComplete = Array.isArray(summaries) && summaries.length >= total;
    return {
      total,
      automatic: splitIsComplete ? Math.max(0, total - manualKnown) : total,
      automaticOccurrences: splitIsComplete ? Math.max(0, total - manualKnown) : total,
      manual: manualKnown,
      exactSplit: splitIsComplete
    };
  }

  function adminTelemetryTimestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function telemetryAdminDisplayStatus(session) {
    const persisted = String(session?.status || 'running');
    if (persisted === 'completed') return { status: 'completed', label: 'Completo' };
    if (persisted === 'interrupted') return { status: 'interrupted', label: gameText('admin.debug.status.interrupted') };
    if (persisted === 'ended_unfinalized') return { status: 'partial', label: 'Parcial' };
    const lastMs = adminTelemetryTimestampMs(session?.updatedAt) || Date.parse(session?.startedAtClient || '') || 0;
    if (lastMs && Date.now() - lastMs > 120000) return { status: 'interrupted', label: gameText('admin.debug.status.interrupted') };
    return { status: 'running', label: 'En curso' };
  }

  function renderTelemetrySessions(sessions) {
    const wrap = overlay.querySelector('#admin-debug-table-wrap');
    const summary = overlay.querySelector('#admin-debug-summary');
    summary.textContent = `${sessions.length} sesión${sessions.length === 1 ? '' : 'es'} encontrada${sessions.length === 1 ? '' : 's'} en Firestore.`;
    if (sessions.length === 0) {
      wrap.innerHTML = '<div class="admin-debug-empty">Todavía no hay logs remotos subidos.</div>';
      return;
    }

    const rows = sessions.map(session => {
      const meta = parseAdminJson(session.metaJson, {});
      const mode = normalizeTelemetryMode(session.mode || meta.mode);
      const localName = session.playerName || meta.localPlayerName || 'Jugador';
      const rivalName = meta.rivalName || (String(session.mode || '').startsWith('multi') ? 'Rival' : 'El Tano');
      const bugs = telemetryBugCounts(session);
      const displayStatus = telemetryAdminDisplayStatus(session);
      const status = displayStatus.status;
      const statusLabel = displayStatus.label;
      const date = session.startedAtClient || session.endedAtClient || null;
      const bugSplitTitle = bugs.exactSplit ? '' : ' title="Sesión legacy: el total es exacto; el desglose auto/manual puede ser parcial."';
      return `
        <tr>
          <td>${escapeHtml(formatTelemetryDate(date))}</td>
          <td><span class="admin-debug-mode">${escapeHtml(mode)}</span>${session.matchId ? `<div class="admin-debug-match" title="${escapeHtml(session.matchId)}">${escapeHtml(session.matchId)}</div>` : ''}</td>
          <td>${(session.endedAtClient || status === 'interrupted') ? escapeHtml(formatDuration(telemetryDurationMs(session) || Math.max(0, (adminTelemetryTimestampMs(session.updatedAt) || 0) - (Date.parse(session.startedAtClient || '') || 0)))) : '—'}</td>
          <td><strong>${escapeHtml(localName)}</strong><br><span style="color:#9987a7;">vs ${escapeHtml(rivalName)}</span></td>
          <td><span class="admin-debug-mode">v${escapeHtml(session.telemetryVersion || meta.engineVersion || '?')}</span></td>
          <td${bugSplitTitle}><div class="admin-debug-bug-auto">⚙️ ${bugs.automatic} auto${bugs.automaticOccurrences > bugs.automatic ? ` · ${bugs.automaticOccurrences} ocurr.` : ''}</div><div class="admin-debug-bug-manual">🐞 ${bugs.manual} marcado${bugs.manual === 1 ? '' : 's'} · ${bugs.total} total</div></td>
          <td>${Number(session.eventCount || 0).toLocaleString('es-AR')}</td>
          <td><span class="admin-debug-status ${status}">${statusLabel}</span></td>
          <td><button class="admin-save-btn admin-debug-download" data-telemetry-download="${escapeHtml(session.id || session.sessionId || '')}">⬇ JSON</button></td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="admin-debug-table">
        <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>${escapeHtml(gameText('admin.debug.col.duration'))}</th><th>Quién jugó contra quién</th><th>Motor</th><th>Bugs</th><th>Eventos</th><th>Estado</th><th>Log</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    wrap.querySelectorAll('[data-telemetry-download]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sessionId = btn.dataset.telemetryDownload;
        const session = debugSessions.find(s => (s.id || s.sessionId) === sessionId);
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Armando…';
        try {
          const archive = await fetchTelemetrySessionArchive(sessionId);
          const meta = archive.meta || {};
          const mode = normalizeTelemetryMode(meta.mode || session?.mode);
          const player = session?.playerName || meta.localPlayerName || 'Jugador';
          const rival = meta.rivalName || (String(session?.mode || '').startsWith('multi') ? 'Rival' : 'El-Tano');
          const stamp = String(archive.startedAt || new Date().toISOString()).replace(/[:.]/g, '-');
          const filename = `Argentinia_Log_${safeDownloadPart(mode)}_${safeDownloadPart(player)}-vs-${safeDownloadPart(rival)}_${stamp}_${safeDownloadPart(sessionId)}.json`;
          downloadAdminJson(archive, filename);
          btn.textContent = '✅ Bajado';
          setTimeout(() => { if (btn.isConnected) btn.textContent = oldText; }, 1400);
        } catch (err) {
          console.error('No se pudo reconstruir el log de Firestore:', err);
          btn.textContent = gameText('admin.stats.error', { message: '' }).replace(/:\s*$/, '');
          window.alert(`No se pudo descargar este log: ${err?.message || err}`);
          setTimeout(() => { if (btn.isConnected) btn.textContent = oldText; }, 1800);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function reloadTelemetryHistory() {
    if (debugLoading) return;
    debugLoading = true;
    const refreshBtn = overlay.querySelector('#admin-debug-refresh');
    const wrap = overlay.querySelector('#admin-debug-table-wrap');
    refreshBtn.disabled = true;
    refreshBtn.textContent = gameText('admin.images.refreshLoading');
    wrap.innerHTML = '<div class="admin-debug-empty">Leyendo telemetrySessions…</div>';
    try {
      debugSessions = await fetchTelemetrySessionsForAdmin();
      debugLoaded = true;
      renderTelemetrySessions(debugSessions);
    } catch (err) {
      console.error('No se pudo cargar el historial de telemetría:', err);
      wrap.innerHTML = `<div class="admin-debug-error">No se pudo leer el historial de logs.<br>${escapeHtml(err?.message || String(err))}</div>`;
      overlay.querySelector('#admin-debug-summary').textContent = 'Error leyendo Firestore.';
    } finally {
      debugLoading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = gameText('admin.images.refresh');
    }
  }

  let statsLoaded = false;
  let statsLoading = false;
  let statsProfilesCache = [];
  let statsSessionsCache = [];

  function trackedTotals(publicRows) {
    return (publicRows || []).reduce((acc, row) => {
      for (const key of Object.keys(acc)) acc[key] += Number(row?.[key]) || 0;
      return acc;
    }, { pointsEarned: 0, pointsSpent: 0, pointsLost: 0, fichasEarned: 0, fichasSpent: 0, packsReceived: 0, packsOpened: 0, guaranteedMythicsOpened: 0 });
  }

  function renderAdminStatistics(profiles, sessions, publicRows) {
    const profileStats = summarizeProfiles(profiles);
    const games = summarizeGlobalTelemetry(sessions);
    const tracked = trackedTotals(publicRows);
    const cards = [
      [gameText('admin.stats.registered.label'), profileStats.registeredPlayers, gameText('admin.stats.registered.sub', { new7d: profileStats.new7d, new30d: profileStats.new30d })],
      [gameText('admin.stats.active.label'), profileStats.active24h, gameText('admin.stats.active.sub', { active7d: profileStats.active7d, active30d: profileStats.active30d })],
      [gameText('admin.stats.games.label'), games.totalGames, gameText('admin.stats.games.sub', { solo: games.soloGames, multi: games.multiplayerGames })],
      [gameText('admin.stats.duration.label'), formatDuration(games.averageDurationMs), gameText('admin.stats.duration.sub', { total: formatDuration(games.totalDurationMs), max: formatDuration(games.longestDurationMs) })],
      [gameText('admin.stats.points.label'), tracked.pointsEarned.toLocaleString('es-AR'), gameText('admin.stats.points.sub', { spent: tracked.pointsSpent.toLocaleString('es-AR'), lost: tracked.pointsLost.toLocaleString('es-AR'), circulation: profileStats.pointsInCirculation.toLocaleString('es-AR') })],
      [gameText('admin.stats.fichas.label'), tracked.fichasEarned.toLocaleString('es-AR'), gameText('admin.stats.fichas.sub', { spent: tracked.fichasSpent.toLocaleString('es-AR'), circulation: profileStats.fichasInCirculation.toLocaleString('es-AR') })],
      [gameText('admin.stats.packs.label'), tracked.packsOpened.toLocaleString('es-AR'), gameText('admin.stats.packs.sub', { received: tracked.packsReceived.toLocaleString('es-AR'), chests: profileStats.packsInChests.toLocaleString('es-AR'), mythics: tracked.guaranteedMythicsOpened.toLocaleString('es-AR') })],
      [gameText('admin.stats.collection.label'), profileStats.cardsOwned.toLocaleString('es-AR'), gameText('admin.stats.collection.sub', { unique: profileStats.communityUniqueCards, total: POOL_BASELINE.total, average: profileStats.averageUniqueCards.toFixed(1) })],
      [gameText('admin.stats.abandons.label'), games.abandonedGames.toLocaleString('es-AR'), gameText('admin.stats.abandons.sub', { sessions: games.completedSessions })]
    ];
    overlay.querySelector('#admin-stats-cards').innerHTML = cards.map(([label,value,sub]) => `<div class="admin-stat-card"><div class="admin-stat-label">${escapeHtml(label)}</div><div class="admin-stat-value">${escapeHtml(value)}</div><div class="admin-stat-sub">${escapeHtml(sub)}</div></div>`).join('');
    overlay.querySelector('#admin-stats-summary').textContent = gameText('admin.stats.summary', { profiles: profiles.length, sessions: sessions.length });
    const rows = [...publicRows].sort((a,b)=>(Number(b.gamesPlayed)||0)-(Number(a.gamesPlayed)||0)).map(r=>`<tr><td><strong>${escapeHtml(r.username || gameText('ranking.playerFallback'))}</strong></td><td>${Number(r.gamesPlayed||0)}</td><td>${Number(r.soloGames||0)} / ${Number(r.multiplayerGames||0)}</td><td>${Number(r.wins||0)}</td><td>${winRate(r).toFixed(1)}%</td><td>${Number(r.pointsEarned||0)}</td><td>${Number(r.fichasEarned||0)}</td><td>${Number(r.packsOpened||0)}</td><td>${Number(r.uniqueCards||0)} / ${POOL_BASELINE.total}</td><td>${formatDuration(r.totalDurationMs||0)}</td></tr>`).join('');
    const headers = [
      'admin.stats.col.player','admin.stats.col.games','admin.stats.col.soloMulti','admin.stats.col.wins','admin.stats.col.winRate',
      'admin.stats.col.points','admin.stats.col.fichas','admin.stats.col.packs','admin.stats.col.discovered','admin.stats.col.time'
    ].map(key => `<th>${escapeHtml(gameText(key))}</th>`).join('');
    overlay.querySelector('#admin-stats-detail').innerHTML = `<table class="admin-debug-table"><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="10">${escapeHtml(gameText('admin.stats.empty'))}</td></tr>`}</tbody></table>`;
  }

  async function reloadAdminStatistics() {
    if (statsLoading) return;
    statsLoading = true;
    const refresh = overlay.querySelector('#admin-stats-refresh');
    if (refresh) { refresh.disabled = true; refresh.textContent = gameText('admin.stats.loading'); }
    try {
      const [profiles, sessions, publicRows] = await Promise.all([fetchAllUserProfiles(), fetchTelemetrySessionsForAdmin(), fetchPublicPlayerStats()]);
      statsProfilesCache = profiles;
      statsSessionsCache = sessions;
      renderAdminStatistics(profiles, sessions, publicRows);
      statsLoaded = true;
    } catch (err) {
      console.error('No se pudieron cargar Estadísticas:', err);
      overlay.querySelector('#admin-stats-summary').textContent = gameText('admin.stats.error', { message: err?.message || err });
    } finally {
      statsLoading = false;
      if (refresh) { refresh.disabled = false; refresh.textContent = gameText('admin.stats.refresh'); }
    }
  }

  async function syncAdminRanking() {
    const btn = overlay.querySelector('#admin-stats-sync');
    btn.disabled = true; btn.textContent = gameText('admin.stats.syncing');
    try {
      if (!statsProfilesCache.length && !statsSessionsCache.length) await reloadAdminStatistics();
      const result = await adminSyncPublicPlayerStats(statsProfilesCache, statsSessionsCache);
      btn.textContent = gameText('admin.stats.syncDone', { count: result.updated });
      await reloadAdminStatistics();
    } catch (err) {
      console.error('No se pudo sincronizar Ranking:', err);
      btn.textContent = gameText('admin.stats.syncError');
    } finally {
      setTimeout(() => { if (btn.isConnected) { btn.disabled = false; btn.textContent = gameText('admin.stats.sync'); } }, 1600);
    }
  }

  function activateAdminTab(key) {
    overlay.querySelectorAll('[data-admin-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.adminTab === key));
    overlay.querySelectorAll('[data-admin-pane]').forEach(pane => pane.classList.toggle('hidden', pane.dataset.adminPane !== key));
    if (key === 'texts' && !gameTextsAdminLoaded) {
      gameTextsAdminLoaded = true;
      void gameTextsAdminPane.load();
    }
    if (key === 'stats' && !statsLoaded) reloadAdminStatistics();
    if (key === 'debug') {
      if (!debugLoaded) reloadTelemetryHistory();
      if (!imageAuditLoaded) reloadImageAudit(false);
    }
  }

  overlay.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateAdminTab(btn.dataset.adminTab));
  });
  overlay.querySelector('#admin-stats-refresh').addEventListener('click', reloadAdminStatistics);
  overlay.querySelector('#admin-stats-sync').addEventListener('click', syncAdminRanking);
  overlay.querySelector('#admin-debug-refresh').addEventListener('click', reloadTelemetryHistory);
  overlay.querySelector('#admin-debug-cleanup').addEventListener('click', async () => {
    if (!window.confirm(gameText('admin.debug.cleanupConfirm'))) return;
    const btn = overlay.querySelector('#admin-debug-cleanup');
    btn.disabled = true;
    try {
      const result = await adminCloseStaleTelemetrySessions(120000);
      window.alert(gameText('admin.debug.cleanupDone', { count: result?.count || 0 }));
      await reloadTelemetryHistory();
    } catch (err) {
      console.error('No se pudieron cerrar sesiones huérfanas:', err);
      window.alert(err?.message || String(err));
    } finally { btn.disabled = false; }
  });
  overlay.querySelector('#admin-image-refresh').addEventListener('click', () => reloadImageAudit(true));
  overlay.querySelector('#admin-image-toggle').addEventListener('click', () => {
    imageAuditShowAll = !imageAuditShowAll;
    if (imageAudit) renderImageAudit(imageAudit);
  });
  overlay.querySelector('#admin-image-download-txt').addEventListener('click', () => {
    if (!imageAudit) return;
    const missing = Array.isArray(imageAudit.missing) ? imageAudit.missing : [];
    const tokenMissing = Array.isArray(imageAudit.missingTokenImages) ? imageAudit.missingTokenImages : [];
    const tokenUnassigned = Array.isArray(imageAudit.tokenEffectsWithoutImage) ? imageAudit.tokenEffectsWithoutImage : [];
    const tokenFiles = [...new Set(tokenMissing.map(entry => entry.image).filter(Boolean))].sort();
    const fronts = missing.filter(entry => entry?.face !== 'back');
    const backs = missing.filter(entry => entry?.face === 'back');
    const lines = [
      '[CARAS_FRONTALES_SIN_PNG]', ...fronts.map(entry => entry.image), '',
      '[CARAS_DFC_REVERSO_SIN_PNG]', ...backs.map(entry => `${entry.id} | ${entry.name} | ${entry.image}`), '',
      '[TOKENS_SIN_PNG]', ...tokenFiles, '',
      '[TOKENS_SIN_FILENAME]', ...tokenUnassigned.map(entry => `${entry.cardId} | ${entry.cardName} | ${entry.tokenName} | ${entry.path}`), ''
    ];
    downloadAdminText(lines.join('\n'), `Argentinia_imagenes_faltantes_v${ENGINE_VERSION}.txt`);
  });
  overlay.querySelector('#admin-image-download-json').addEventListener('click', () => {
    if (!imageAudit) return;
    downloadAdminJson(imageAudit, `Argentinia_auditoria_imagenes_v${ENGINE_VERSION}.json`);
  });

  // Carga la lista real de usuarios de forma asíncrona — no bloquea el resto del panel.
  const recipientSelect = overlay.querySelector('#grant-recipient');
  fetchAllUserProfiles()
    .then(profiles => {
      const options = ['<option value="ALL">Todos los usuarios</option>']
        .concat(profiles.map(p => `<option value="${p.uid}">${escapeHtml(p.username || 'Sin username')} · ${escapeHtml(String(p.uid).slice(-6))}</option>`));
      recipientSelect.innerHTML = options.join('');
    })
    .catch(err => {
      console.error('No se pudo cargar la lista de usuarios:', err);
      recipientSelect.innerHTML = '<option value="">No se pudo cargar la lista de usuarios</option>';
    });

  overlay.querySelector('#admin-grant-send').addEventListener('click', async () => {
    const grantErrorBox = overlay.querySelector('#admin-grant-error');
    const grantSuccessBox = overlay.querySelector('#admin-grant-success');
    grantErrorBox.textContent = '';
    grantSuccessBox.textContent = '';

    const amount = parseInt(overlay.querySelector('#grant-amount').value, 10);
    const currencyField = overlay.querySelector('#grant-currency').value;
    const recipient = overlay.querySelector('#grant-recipient').value;
    const reason = overlay.querySelector('#grant-reason').value.trim();
    const currencyLabel = currencyField === 'points' ? 'puntos' : currencyField === 'fichas' ? 'Fichas' : 'sobres';

    if (!Number.isInteger(amount) || amount === 0) {
      grantErrorBox.textContent = 'La cantidad tiene que ser un número entero distinto de cero.';
      return;
    }
    if (currencyField === 'standardPacks' && amount < 1) {
      grantErrorBox.textContent = 'Los sobres se pueden regalar, no quitar. Usá una cantidad positiva.';
      return;
    }
    if (!recipient) {
      grantErrorBox.textContent = 'Elegí a quién regalarle.';
      return;
    }

    const recipientOption = overlay.querySelector('#grant-recipient').selectedOptions[0];
    const recipientLabel = recipient === 'ALL' ? 'TODOS los usuarios' : (recipientOption ? recipientOption.textContent : recipient);
    if (!window.confirm(`¿Confirmás dar ${amount} ${currencyLabel} a ${recipientLabel}?`)) return;

    const sendBtn = overlay.querySelector('#admin-grant-send');
    sendBtn.disabled = true;
    try {
      if (recipient === 'ALL') {
        const result = currencyField === 'standardPacks'
          ? await adminGrantPacksToAll(amount)
          : await adminGrantCurrencyToAll(currencyField, amount);
        grantSuccessBox.textContent = `✅ Aplicado a ${result.succeeded}/${result.total} cuentas${result.failed > 0 ? ` (${result.failed} fallaron)` : ''}.`;
        await logAdminAction({ adminUid: state.currentUser.uid, targetUid: 'ALL', currencyField, amount, reason }).catch(() => {});
      } else {
        const newValue = currencyField === 'standardPacks'
          ? await adminGrantPacks(recipient, amount)
          : await adminGrantCurrency(recipient, currencyField, amount);
        grantSuccessBox.textContent = `✅ Listo — esa cuenta ahora tiene ${newValue} ${currencyLabel}.`;
        await logAdminAction({ adminUid: state.currentUser.uid, targetUid: recipient, currencyField, amount, reason }).catch(() => {});
      }
    } catch (err) {
      console.error('No se pudo aplicar el regalo:', err);
      grantErrorBox.textContent = err.message || 'No se pudo aplicar. Probá de nuevo.';
    } finally {
      sendBtn.disabled = false;
    }
  });

  mountAdminCampaignsPane(overlay.querySelector('#admin-campaigns-root'), { currentUser: state.currentUser });

  overlay.querySelector('#admin-back').addEventListener('click', () => {
    overlay.remove();
    onBack();
  });

  overlay.querySelector('#admin-save').addEventListener('click', async () => {
    const errorBox = overlay.querySelector('#admin-error');
    const successBox = overlay.querySelector('#admin-success');
    errorBox.textContent = '';
    successBox.textContent = '';

    const readNumber = (id) => {
      const raw = overlay.querySelector(`#cfg-${id}`).value;
      return raw === '' ? NaN : Number(raw);
    };

    const newConfig = {
      winVsTanoFacil: readNumber('winVsTanoFacil'),
      winVsTanoMedio: readNumber('winVsTanoMedio'),
      winVsTanoDificil: readNumber('winVsTanoDificil'),
      lossVsTano: readNumber('lossVsTano'),
      winVsHumano: readNumber('winVsHumano'),
      lossVsHumano: readNumber('lossVsHumano'),
      abandonPenalty: readNumber('abandonPenalty'),
      pvpMinRewardMinutes: readNumber('pvpMinRewardMinutes'),
      pvpMinCompletedTurns: readNumber('pvpMinCompletedTurns'),
      pvpMaxRewardedMatchesPerPairDaily: readNumber('pvpMaxRewardedMatchesPerPairDaily'),
      pvpMaxPointsPerDay: readNumber('pvpMaxPointsPerDay'),
      packCost: readNumber('packCost'),
      mythicChance: readNumber('mythicChancePercent') / 100,
      fichasPerEnhancement: readNumber('fichasPerEnhancement'),
      classifiedsCommonPoints: readNumber('classifiedsCommonPoints'),
      classifiedsCommonFichas: readNumber('classifiedsCommonFichas'),
      classifiedsUncommonPoints: readNumber('classifiedsUncommonPoints'),
      classifiedsUncommonFichas: readNumber('classifiedsUncommonFichas'),
      classifiedsRarePoints: readNumber('classifiedsRarePoints'),
      classifiedsRareFichas: readNumber('classifiedsRareFichas'),
      classifiedsMythicPoints: readNumber('classifiedsMythicPoints'),
      classifiedsMythicFichas: readNumber('classifiedsMythicFichas'),
      classifiedsMythicChance: readNumber('classifiedsMythicChancePercent') / 100,
      deckSizeExact: readNumber('deckSizeExact'),
      maxCopiesPerCard: readNumber('maxCopiesPerCard'),
      maxEnhancedCardsPerDeck: readNumber('maxEnhancedCardsPerDeck'),
      maxSavedDecks: readNumber('maxSavedDecks'),
      prebuiltDeckPoints: readNumber('prebuiltDeckPoints'),
      prebuiltDeckFichas: readNumber('prebuiltDeckFichas')
    };

    if (Object.values(newConfig).some(v => typeof v !== 'number' || Number.isNaN(v))) {
      errorBox.textContent = 'Todos los campos tienen que ser números válidos.';
      return;
    }
    const pvpIntegerFields = [
      newConfig.pvpMinRewardMinutes, newConfig.pvpMinCompletedTurns,
      newConfig.pvpMaxRewardedMatchesPerPairDaily, newConfig.pvpMaxPointsPerDay
    ].every(Number.isInteger);
    const classifiedsNonNegative = [
      newConfig.classifiedsCommonPoints, newConfig.classifiedsCommonFichas,
      newConfig.classifiedsUncommonPoints, newConfig.classifiedsUncommonFichas,
      newConfig.classifiedsRarePoints, newConfig.classifiedsRareFichas,
      newConfig.classifiedsMythicPoints, newConfig.classifiedsMythicFichas
    ].every(value => value >= 0);
    if (newConfig.deckSizeExact <= 0 || newConfig.maxCopiesPerCard <= 0 || newConfig.maxSavedDecks <= 0
      || !Number.isInteger(newConfig.maxSavedDecks) || newConfig.prebuiltDeckPoints < 0 || newConfig.prebuiltDeckFichas < 0
      || !Number.isInteger(newConfig.prebuiltDeckPoints) || !Number.isInteger(newConfig.prebuiltDeckFichas)
      || newConfig.packCost < 0 || newConfig.fichasPerEnhancement <= 0
      || newConfig.pvpMinRewardMinutes < 0 || newConfig.pvpMinCompletedTurns < 0
      || newConfig.pvpMaxRewardedMatchesPerPairDaily < 0 || newConfig.pvpMaxPointsPerDay < 0 || !pvpIntegerFields
      || !classifiedsNonNegative || newConfig.classifiedsMythicChance < 0 || newConfig.classifiedsMythicChance > 1) {
      errorBox.textContent = 'Algún valor no tiene sentido (¿negativo, porcentaje fuera de 0–100 o un límite PvP no entero?). Revisá antes de guardar.';
      return;
    }

    const saveBtn = overlay.querySelector('#admin-save');
    saveBtn.disabled = true;
    try {
      await saveGameConfig(newConfig);
      applyGameConfig(newConfig);
      // 23.13.25: la semana actual queda congelada; el scheduler Admin detecta el nuevo
      // fingerprint económico y republica únicamente semanas futuras con estos valores.
      await ensureClassifiedsSchedule();
      successBox.textContent = '✅ Guardado — ya está activo; Clasificados conserva la semana actual y actualizó las futuras.';
    } catch (err) {
      console.error('No se pudo guardar la configuración:', err);
      errorBox.textContent = err.message || 'No se pudo guardar. Probá de nuevo.';
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function injectMultiplayerLobbyStyles() {
  if (document.getElementById('multiplayer-lobby-styles')) return;
  const style = document.createElement('style');
  style.id = 'multiplayer-lobby-styles';
  style.textContent = `
    #multiplayer-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; flex-direction: column;
      padding: 24px 32px;
    }
    .mp-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-shrink: 0; }
    .mp-title { font-size: 26px; font-weight: 700; color: #f0e0b0; text-shadow: 0 0 20px rgba(212,175,55,0.4); }
    .mp-body { flex: 1; overflow-y: auto; max-width: 560px; width: 100%; margin: 0 auto; }
    .mp-section {
      background: rgba(18,25,15,0.5); border: 2px solid rgba(212,175,55,0.3); border-radius: 14px;
      padding: 24px; margin-bottom: 20px; text-align: center;
    }
    .mp-section-title { color: #f0e0b0; font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .mp-section-desc { color: #cfe0d4; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }
    .mp-code-display {
      font-size: 40px; font-weight: 700; letter-spacing: 6px; color: #f0e0b0;
      background: rgba(0,0,0,0.3); border: 2px dashed rgba(212,175,55,0.5); border-radius: 10px;
      padding: 16px; margin: 12px 0 18px;
    }
    .mp-spinner { font-size: 28px; margin-bottom: 4px; animation: mp-pulse 1.4s ease-in-out infinite; }
    @keyframes mp-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

function injectMultiplayerMatchBannerStyles() {
  if (document.getElementById('multiplayer-match-banner-styles')) return;
  const style = document.createElement('style');
  style.id = 'multiplayer-match-banner-styles';
  style.textContent = `
    .mp-versus-banner {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0,1fr) auto minmax(0,1fr);
      align-items: center;
      gap: 18px;
      margin: 18px auto 20px;
      padding: 18px 20px;
      background:
        radial-gradient(circle at center, rgba(212,175,55,0.16), transparent 42%),
        linear-gradient(180deg, rgba(29,38,24,0.96), rgba(8,14,10,0.98));
      border: 2px solid #d4af37;
      border-radius: 14px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.48), inset 0 0 22px rgba(212,175,55,0.08);
      overflow: hidden;
    }
    .mp-versus-banner::before,
    .mp-versus-banner::after {
      content: "";
      position: absolute;
      top: 10px; bottom: 10px;
      width: 1px;
      background: linear-gradient(transparent, rgba(212,175,55,0.45), transparent);
    }
    .mp-versus-banner::before { left: 43%; }
    .mp-versus-banner::after { right: 43%; }
    .mp-versus-player {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
    }
    .mp-versus-role {
      color: #9fb6a5;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.8px;
    }
    .mp-versus-avatar {
      width: 78px;
      height: 78px;
      border-radius: 50%;
      border: 3px solid #d4af37;
      object-fit: cover;
      background: #111a13;
      box-shadow: 0 0 0 3px rgba(240,224,176,0.08), 0 5px 16px rgba(0,0,0,0.5);
    }
    .mp-versus-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 42px;
      line-height: 1;
    }
    .mp-versus-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #f0e0b0;
      font-size: 17px;
      font-weight: 800;
      text-shadow: 0 0 12px rgba(212,175,55,0.28);
    }
    .mp-versus-vs {
      color: #d4af37;
      font-family: Georgia, serif;
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 2px;
      text-shadow: 0 0 18px rgba(212,175,55,0.48);
    }
    @media (max-width: 560px) {
      .mp-versus-banner { gap: 10px; padding: 15px 10px; }
      .mp-versus-avatar { width: 62px; height: 62px; }
      .mp-versus-name { max-width: 115px; font-size: 14px; }
      .mp-versus-vs { font-size: 24px; }
      .mp-versus-banner::before,
      .mp-versus-banner::after { display: none; }
    }
  `;
  document.head.appendChild(style);
}

function multiplayerProfileBannerHTML(profile, roleLabel, fallbackName) {
  const username = String(profile?.username || profile?.displayName || '').trim() || fallbackName;
  const photoURL = String(profile?.photoURL || '').trim();
  const avatar = photoURL
    ? `<img class="mp-versus-avatar" src="${escapeHtml(photoURL)}" alt="${escapeHtml(username)}" onerror="this.outerHTML='<div class=&quot;mp-versus-avatar mp-versus-avatar-fallback&quot;>🤠</div>'">`
    : `<div class="mp-versus-avatar mp-versus-avatar-fallback">🤠</div>`;
  return `
    <div class="mp-versus-player">
      <div class="mp-versus-role">${escapeHtml(roleLabel)}</div>
      ${avatar}
      <div class="mp-versus-name">${escapeHtml(username)}</div>
    </div>
  `;
}

// FASE 4: cimiento de matchmaking — crear partida (código de 6 caracteres para compartir),
// unirse con un código, sala de espera en tiempo real. LA SINCRONIZACIÓN DE LA PARTIDA EN
// SÍ (mano, campo, turnos) todavía NO existe — eso es la próxima etapa. Esto solo resuelve
// "cómo se encuentran dos jugadores", a propósito, para no prometer más de lo que hay.
// FASE 4, ETAPA 6: se muestra al arrancar SOLO si el perfil trae un activeMatchId con una
// partida genuinamente en curso (main.js ya la validó con fetchMatchForReconnect antes de
// llamar a esto — nunca se ofrece reconectar a algo que ya terminó o no existe más).
export function showSoloRecoveryPrompt(recovery, onResume, onAbandon, options = {}) {
  injectStoreStyles();
  const overlay = document.createElement('div');
  overlay.id = 'solo-recovery-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:10020; background:rgba(0,0,0,0.88); display:flex; align-items:center; justify-content:center; padding:18px;';
  const activeMs = Math.max(0, Number(recovery?.activeElapsedMs) || 0);
  const turn = Math.max(1, Number(recovery?.state?.turnCount) || 1);
  const phase = recovery?.state?.phase ? String(recovery.state.phase) : '—';
  const penalty = Number(options.penalty || 0);
  const abandonLabel = penalty ? gameTextHtml('solo.recovery.abandon', { points: Math.abs(penalty) }) : gameTextHtml('solo.recovery.abandonGuest');
  overlay.innerHTML = `
    <div style="background:#16211a;border:2px solid rgba(212,175,55,.62);border-radius:16px;padding:30px;max-width:480px;width:min(92vw,480px);text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.7);">
      <div style="font-size:21px;font-weight:800;color:#f0e0b0;margin-bottom:10px;">${gameTextHtml('solo.recovery.title')}</div>
      <div style="color:#cfe0d4;font-size:14px;line-height:1.55;margin-bottom:14px;">${gameTextHtml('solo.recovery.description')}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0 22px;">
        <div style="background:rgba(255,255,255,.04);border-radius:9px;padding:9px;"><b style="color:#f0e0b0;">${gameTextHtml('solo.recovery.turn')}</b><br>${turn}</div>
        <div style="background:rgba(255,255,255,.04);border-radius:9px;padding:9px;"><b style="color:#f0e0b0;">${gameTextHtml('solo.recovery.phase')}</b><br>${escapeHtml(phase)}</div>
        <div style="background:rgba(255,255,255,.04);border-radius:9px;padding:9px;"><b style="color:#f0e0b0;">${gameTextHtml('solo.recovery.played')}</b><br>${escapeHtml(formatDuration(activeMs))}</div>
      </div>
      <button class="store-buy-btn" id="solo-recovery-yes">${gameTextHtml('solo.recovery.resume')}</button>
      <div style="height:10px"></div>
      <button class="store-back-link" id="solo-recovery-no">${abandonLabel}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#solo-recovery-yes').addEventListener('click', () => { overlay.remove(); onResume(); });
  overlay.querySelector('#solo-recovery-no').addEventListener('click', () => { overlay.remove(); onAbandon(); });
}

export function showReconnectPrompt(onReconnect, onAbandon, options = {}) {
  injectStoreStyles(); // reusa .store-buy-btn / .store-back-link
  const canReconnect = options.canReconnect !== false;
  const overlay = document.createElement('div');
  overlay.id = 'reconnect-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#16211a; border:2px solid rgba(212,175,55,0.5); border-radius:16px; padding:32px; max-width:460px; text-align:center;">
      <div style="font-size:20px; font-weight:700; color:#f0e0b0; margin-bottom:12px;">🔄 Tenés una partida en curso</div>
      <div id="reconnect-detail" style="color:#cfe0d4; font-size:14px; margin-bottom:24px; line-height:1.5;"></div>
      <button class="store-buy-btn" id="reconnect-yes" ${canReconnect ? '' : 'disabled'}>${canReconnect ? 'Reconectarme' : 'Reconexión no segura'}</button>
      <br><br>
      <button class="store-back-link" id="reconnect-no">Abandonarla</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const detail = overlay.querySelector('#reconnect-detail');
  if (detail) detail.textContent = options.message || 'Parece que recargaste la página a mitad de una partida multiplayer. ¿Querés volver a ella?';

  const yes = overlay.querySelector('#reconnect-yes');
  if (canReconnect) yes.addEventListener('click', () => {
    overlay.remove();
    onReconnect();
  });
  overlay.querySelector('#reconnect-no').addEventListener('click', () => {
    overlay.remove();
    onAbandon();
  });
}

export function showMultiplayerLobby(onBack, onMatched) {
  injectMultiplayerLobbyStyles();
  injectMultiplayerMatchBannerStyles();
  injectStoreStyles(); // reusa .store-buy-btn / .store-back-link / .store-error-msg
  injectEncyclopediaStyles(); // reusa .encyclopedia-back-btn / .encyclopedia-search-input

  const overlay = document.createElement('div');
  overlay.id = 'multiplayer-overlay';
  overlay.innerHTML = `
    <div class="mp-header">
      <button class="encyclopedia-back-btn" id="mp-back">← ${gameTextHtml('common.back')}</button>
      <div class="mp-title">${gameTextHtml('multiplayer.title')}</div>
    </div>
    <div class="mp-body" id="mp-body"></div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('#mp-body');
  let unsubscribe = null;

  function cleanup() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  overlay.querySelector('#mp-back').addEventListener('click', () => {
    cleanup();
    overlay.remove();
    onBack();
  });

  function renderHome() {
    cleanup();
    body.innerHTML = `
      <div class="mp-section">
        <div class="mp-section-title">${gameTextHtml('multiplayer.create.title')}</div>
        <div class="mp-section-desc">${gameTextHtml('multiplayer.create.description')}</div>
        <button class="store-buy-btn" id="mp-create">${gameTextHtml('multiplayer.create.action')}</button>
        <div class="store-error-msg" id="mp-create-error"></div>
      </div>
      <div class="mp-section">
        <div class="mp-section-title">${gameTextHtml('multiplayer.join.title')}</div>
        <input type="text" class="encyclopedia-search-input" id="mp-code-input" placeholder="${gameTextHtml('multiplayer.join.placeholder')}" maxlength="6">
        <button class="store-buy-btn" id="mp-join">${gameTextHtml('multiplayer.join.action')}</button>
        <div class="store-error-msg" id="mp-join-error"></div>
      </div>
    `;

    body.querySelector('#mp-create').addEventListener('click', async () => {
      const btn = body.querySelector('#mp-create');
      const errBox = body.querySelector('#mp-create-error');
      btn.disabled = true;
      errBox.textContent = '';
      try {
        const match = await createMatch(state.currentUser.uid, state.currentUser);
        renderWaitingRoom(match.code);
      } catch (err) {
        console.error('No se pudo crear la partida:', err);
        errBox.textContent = err.message || gameText('multiplayer.create.error');
        btn.disabled = false;
      }
    });

    body.querySelector('#mp-join').addEventListener('click', async () => {
      const input = body.querySelector('#mp-code-input');
      const btn = body.querySelector('#mp-join');
      const errBox = body.querySelector('#mp-join-error');
      const code = input.value.trim();
      if (!code) { errBox.textContent = gameText('multiplayer.join.empty'); return; }
      btn.disabled = true;
      errBox.textContent = '';
      try {
        const match = await joinMatchByCode(state.currentUser.uid, code, state.currentUser);
        renderMatched(match);
      } catch (err) {
        console.error('No se pudo unir a la partida:', err);
        errBox.textContent = err.message || gameText('multiplayer.join.error');
        btn.disabled = false;
      }
    });
  }

  function renderWaitingRoom(code) {
    cleanup();
    body.innerHTML = `
      <div class="mp-section">
        <div class="mp-spinner">⏳</div>
        <div class="mp-section-title">${gameTextHtml('multiplayer.waiting.title')}</div>
        <div class="mp-code-display">${code}</div>
        <div class="mp-section-desc">${gameTextHtml('multiplayer.waiting.description')}</div>
        <button class="store-back-link" id="mp-cancel">${gameTextHtml('common.cancel')}</button>
      </div>
    `;

    unsubscribe = listenToMatch(code, (data) => {
      if (!data) { renderHome(); return; } // se canceló/borró desde otro lado
      if (data.status === 'active' && data.guestUid) {
        renderMatched({ code, ...data });
      }
    });

    body.querySelector('#mp-cancel').addEventListener('click', async () => {
      cleanup();
      try { await cancelMatch(code, state.currentUser?.uid || null); } catch (err) { console.error('No se pudo cancelar la partida:', err); }
      renderHome();
    });
  }

  // FASE 4 (cierre del roadmap): ya no es un cartel de "todavía no está listo" — con las
  // Etapas 1 a 6 completas, emparejarse de verdad lleva a elegir mazo y arrancar una
  // partida sincronizada real. myRole (host o guest) se calcula acá, comparando MI uid
  // contra hostUid del match — es la ÚNICA vez que se calcula, y de acá en más viaja tal
  // cual a onMatched, así main.js nunca tiene que volver a derivarlo.
  function renderMatched(match) {
    cleanup();
    const remoteEngine = match.engineVersion || null;
    const remoteProtocol = match.engineProtocolVersion || null;
    const guestEngine = match.guestEngineVersion || null;
    const incompatible = remoteEngine !== ENGINE_VERSION || remoteProtocol !== ENGINE_PROTOCOL_VERSION || (match.guestUid && guestEngine !== ENGINE_VERSION);
    if (incompatible) {
      body.innerHTML = `
        <div class="mp-section">
          <div class="mp-section-title">${gameTextHtml('multiplayer.incompatible.title')}</div>
          <div class="mp-section-desc">${gameTextHtml('multiplayer.incompatible.description', { localVersion: ENGINE_VERSION, remoteVersion: remoteEngine || guestEngine || 'versión anterior/desconocida' })}</div>
          <button class="store-back-link" id="mp-incompatible-back">← ${gameTextHtml('common.back')}</button>
        </div>`;
      body.querySelector('#mp-incompatible-back').addEventListener('click', renderHome);
      return;
    }
    const myUid = state.currentUser.uid;
    const myRole = match.hostUid === myUid ? 'host' : 'guest';
    const rivalUid = myRole === 'host' ? match.guestUid : match.hostUid;
    // 23.13.24: el snapshot multiplayer transporta el username Argentinia. displayName
    // queda sólo como fallback de compatibilidad y en builds nuevos contiene el MISMO alias,
    // nunca el nombre Google.
    const rivalProfile = (match.players && match.players[rivalUid]) || {};
    const rivalName = String(rivalProfile.username || rivalProfile.displayName || '').trim() || 'tu rival';
    const rivalPhotoURL = rivalProfile.photoURL || '';
    const hostProfile = (match.players && match.players[match.hostUid]) || {};
    const guestProfile = (match.players && match.players[match.guestUid]) || {};

    body.innerHTML = `
      <div class="mp-section">
        <div class="mp-section-title">${gameTextHtml('multiplayer.matched.title', { rival: rivalName })}</div>
        <div class="mp-versus-banner" aria-label="Enfrentamiento confirmado">
          ${multiplayerProfileBannerHTML(hostProfile, 'HOST', 'Host')}
          <div class="mp-versus-vs">VS.</div>
          ${multiplayerProfileBannerHTML(guestProfile, 'GUEST', 'Guest')}
        </div>
        <div class="mp-section-desc">${gameTextHtml('multiplayer.matched.description')}<br><span style="color:#a99362;font-size:11px">Motor v${ENGINE_VERSION} · protocolo ${ENGINE_PROTOCOL_VERSION}</span></div>
        <button class="store-buy-btn" id="mp-start">${gameTextHtml('multiplayer.matched.start')}</button>
      </div>
    `;
    body.querySelector('#mp-start').addEventListener('click', () => {
      overlay.remove();
      onMatched(match.code, myRole, rivalName, rivalPhotoURL, match.startingRole || 'host');
    });
  }

  renderHome();
}

export function showMainMenu(onPlay, onMultiplayerMatched) {
  injectMainMenuStyles();
  injectRewardsStyles();
  // ENTREGA 23.8.5 — el menú principal es singleton DOM. Aunque un flujo viejo o una
  // llamada accidental intente abrirlo dos veces, nunca quedan dos #main-menu-overlay.
  document.querySelectorAll('#main-menu-overlay').forEach(el => el.remove());
  const overlay = document.createElement('div');
  overlay.id = 'main-menu-overlay';
  overlay.innerHTML = `
    <div class="main-menu-account" id="main-menu-account"></div>
    <div class="main-menu-logo-wrap">
      <img class="main-menu-logo" src="./assets/images/ui/logo.png" alt="Argentinia" onerror="this.style.display='none'">
    </div>
    <div class="main-menu-buttons">
      <button class="main-menu-btn main-menu-btn-primary" id="menu-play">${gameTextHtml('menu.play')}</button>
      <button class="main-menu-btn" id="menu-multiplayer">${gameTextHtml('menu.multiplayer')}</button>
      <button class="main-menu-btn" id="menu-mydecks">${gameTextHtml('menu.myDecks')}</button>
      <button class="main-menu-btn" id="menu-ranking">${gameTextHtml('menu.ranking')}</button>
      <button class="main-menu-btn" id="menu-encyclopedia">${gameTextHtml('menu.encyclopedia')}</button>
      <button class="main-menu-btn" id="menu-store">${gameTextHtml('menu.store')}</button>
      <button class="main-menu-btn" id="menu-options">${gameTextHtml('menu.options')}</button>
    </div>
    <div id="main-menu-active-events"></div>
    <div class="main-menu-news" id="main-menu-news">
      <div class="main-menu-news-title">${gameTextHtml('menu.news.title')}</div>
      <div class="main-menu-news-list" id="main-menu-news-list">
        <div class="main-menu-news-empty">${gameTextHtml('menu.news.loading')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  enterMenuAudio();


  renderAccountBox(overlay.querySelector('#main-menu-account'), state.currentUser);
  updateMainMenuLoginGatedButtons(overlay);
  void renderActiveEventsStrip(overlay.querySelector('#main-menu-active-events'));

  // "Noticias": públicas para cualquiera, con o sin sesión (ver firestore.rules) — no
  // bloquea el resto del menú, que ya se ve de entrada mientras esto carga.
  const newsListEl = overlay.querySelector('#main-menu-news-list');
  Promise.all([fetchAnnouncements(), fetchCampaignSnapshot()])
    .then(([announcements, campaignSnapshot]) => {
      const now = campaignSnapshot?.now || new Date();
      const visible = announcements.filter(a => a.showInNews !== false && campaignStatus(a, now) === 'active');
      if (visible.length === 0) {
        newsListEl.innerHTML = `<div class="main-menu-news-empty">${gameTextHtml('menu.news.empty')}</div>`;
        return;
      }
      newsListEl.innerHTML = visible.map(a => `
        <div class="main-menu-news-item">
          <div class="main-menu-news-date">${formatAnnouncementDate(a.startAt || a.createdAt)}</div>
          <div class="main-menu-news-text"><strong>${escapeHtml(a.title || '')}</strong>${a.subtitle ? `<br>${escapeHtml(a.subtitle)}` : ''}${a.text ? `<br>${escapeHtml(a.text)}` : ''}</div>
        </div>
      `).join('');
    })
    .catch(err => {
      console.error('No se pudieron cargar las noticias:', err);
      newsListEl.innerHTML = `<div class="main-menu-news-empty">${gameTextHtml('menu.news.error')}</div>`;
    });

  let menuIdentityActionPending = false;
  async function awaitMenuIdentityOrStay() {
    if (menuIdentityActionPending) return false;
    menuIdentityActionPending = true;
    try {
      await ensureMenuIdentityReady();
      updateMainMenuLoginGatedButtons(overlay);
      return true;
    } catch (err) {
      menuIdentityActionPending = false;
      console.error('No se pudo resolver la identidad antes de abrir el menú solicitado:', err);
      window.alert(gameText('menu.profileUnavailable'));
      updateMainMenuLoginGatedButtons(overlay);
      return false;
    }
  }
  const releaseMenuIdentityAction = () => { menuIdentityActionPending = false; };

  overlay.querySelector('#menu-play').addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    overlay.remove();
    await onPlay();
  });

  // FASE 4 (cierre del roadmap): Multijugador ya conecta con una partida jugable de
  // verdad — onMultiplayerMatched (pasado desde main.js) es quien arma el mazo/mano y
  // arranca la sincronización real, una vez emparejados. Mismo gateo por sesión que
  // Enciclopedia/Mis Mazos/Tienda: sin cuenta no hay con quién identificarte frente a un rival.
  overlay.querySelector('#menu-multiplayer').addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    if (!state.currentUser || !state.userProfile) { releaseMenuIdentityAction(); return; }
    overlay.style.display = 'none';
    showMultiplayerLobby(() => { overlay.style.display = ''; releaseMenuIdentityAction(); }, onMultiplayerMatched);
  });

  // BUGFIX (revisión post-Etapa 4): Enciclopedia/Mis Mazos/Tienda ahora quedan
  // DESHABILITADAS de verdad sin sesión (mismo look que Multijugador), en vez de dejar
  // entrar y mostrar un cartel adentro — updateMainMenuLoginGatedButtons (más abajo) las
  // pinta como corresponde, y acá el click no hace nada si no hay sesión.
  overlay.querySelector('#menu-ranking').addEventListener('click', () => {
    overlay.style.display = 'none';
    showGlobalRanking(() => { overlay.style.display = ''; });
  });

  overlay.querySelector('#menu-encyclopedia').addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    if (!state.currentUser || !state.userProfile) { releaseMenuIdentityAction(); return; }
    overlay.style.display = 'none';
    showEncyclopedia(() => { overlay.style.display = ''; releaseMenuIdentityAction(); });
  });

  overlay.querySelector('#menu-mydecks').addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    if (!state.currentUser || !state.userProfile) { releaseMenuIdentityAction(); return; }
    overlay.style.display = 'none';
    showMyDecksScreen(() => { overlay.style.display = ''; releaseMenuIdentityAction(); });
  });

  overlay.querySelector('#menu-store').addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    if (!state.currentUser || !state.userProfile) { releaseMenuIdentityAction(); return; }
    overlay.style.display = 'none';
    showStoreScreen(() => { overlay.style.display = ''; releaseMenuIdentityAction(); });
  });

  overlay.querySelector('#menu-options').addEventListener('click', () => {
    overlay.style.display = 'none';
    showOptionsMenu(() => { overlay.style.display = ''; });
  });
}

// Opciones: Dificultad + Audio son settings reales. Audio vive enteramente en localStorage
// y está separado en Música/SFX desde 23.13.63 para poder sumar pistas y efectos sin volver
// a diseñar el menú ni mezclar volúmenes. Velocidad de animaciones sigue como placeholder.
export function showOptionsMenu(onBack) {
  injectMainMenuStyles();
  const overlay = document.createElement('div');
  overlay.id = 'options-menu-overlay';

  const difficultyLabel = () => botDifficultyLabel(state.botDifficulty);
  const initialAudio = getAudioSettings();
  const percent = value => Math.round(Number(value || 0) * 100);

  // Zona de Peligro: pensada para testing/desarrollo (reiniciar tu propia cuenta sin tener
  // que andar borrando el documento a mano en la consola de Firestore) — solo tiene sentido
  // si hay sesión iniciada, así que directamente no se muestra sin login.
  const dangerZoneHTML = state.currentUser ? `
    <div class="options-danger-zone">
      <div class="options-danger-title">Zona de Peligro</div>
      <button class="options-danger-btn" id="opt-delete-account">🗑️ Borrar mi cuenta (colección, puntos, todo)</button>
    </div>
  ` : '';

  overlay.innerHTML = `
    <div class="options-menu-panel">
      <div class="options-menu-title">${escapeHtml(gameText('options.title'))}</div>
      <div class="options-row">
        <span class="options-label">${escapeHtml(gameText('options.difficulty'))}</span>
        <button class="options-toggle-btn" id="opt-difficulty">${difficultyLabel()}</button>
      </div>
      <div class="options-row options-row-disabled">
        <span class="options-label">${escapeHtml(gameText('options.animationSpeed'))}</span>
        <button class="options-toggle-btn" data-tooltip="${escapeHtml(gameText('options.disabled'))}">${escapeHtml(gameText('options.normal'))}</button>
      </div>

      <div class="options-section-title">${escapeHtml(gameText('options.audio'))}</div>
      <div class="options-row options-audio-row">
        <span class="options-label">${escapeHtml(gameText('options.music'))}</span>
        <div class="options-audio-controls">
          <button class="options-toggle-btn" id="opt-music-toggle">${initialAudio.musicEnabled ? escapeHtml(gameText('options.enabled')) : escapeHtml(gameText('options.off'))}</button>
          <input class="options-volume-slider" id="opt-music-volume" type="range" min="0" max="100" step="1" value="${percent(initialAudio.musicVolume)}" aria-label="${escapeHtml(gameText('options.musicVolume'))}">
          <span class="options-volume-value" id="opt-music-value">${percent(initialAudio.musicVolume)}%</span>
        </div>
      </div>
      <div class="options-row options-audio-row">
        <span class="options-label">${escapeHtml(gameText('options.effects'))}</span>
        <div class="options-audio-controls">
          <button class="options-toggle-btn" id="opt-sfx-toggle">${initialAudio.sfxEnabled ? escapeHtml(gameText('options.enabled')) : escapeHtml(gameText('options.off'))}</button>
          <input class="options-volume-slider" id="opt-sfx-volume" type="range" min="0" max="100" step="1" value="${percent(initialAudio.sfxVolume)}" aria-label="${escapeHtml(gameText('options.effectsVolume'))}">
          <span class="options-volume-value" id="opt-sfx-value">${percent(initialAudio.sfxVolume)}%</span>
        </div>
      </div>
      ${dangerZoneHTML}
      <button class="main-menu-btn" id="opt-back" style="margin-top: 24px;">Volver</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const diffBtn = overlay.querySelector('#opt-difficulty');
  diffBtn.addEventListener('click', () => {
    state.botDifficulty = nextBotDifficulty(normalizeBotDifficulty(state.botDifficulty));
    diffBtn.textContent = difficultyLabel();
    logMsg(gameText('options.difficulty.changed', { difficulty: difficultyLabel() }));
  });

  const musicToggle = overlay.querySelector('#opt-music-toggle');
  const musicSlider = overlay.querySelector('#opt-music-volume');
  const musicValue = overlay.querySelector('#opt-music-value');
  const sfxToggle = overlay.querySelector('#opt-sfx-toggle');
  const sfxSlider = overlay.querySelector('#opt-sfx-volume');
  const sfxValue = overlay.querySelector('#opt-sfx-value');

  const refreshAudioControls = () => {
    const audio = getAudioSettings();
    musicToggle.textContent = audio.musicEnabled ? gameText('options.enabled') : gameText('options.off');
    musicSlider.value = String(percent(audio.musicVolume));
    musicValue.textContent = `${percent(audio.musicVolume)}%`;
    sfxToggle.textContent = audio.sfxEnabled ? gameText('options.enabled') : gameText('options.off');
    sfxSlider.value = String(percent(audio.sfxVolume));
    sfxValue.textContent = `${percent(audio.sfxVolume)}%`;
  };

  musicToggle.addEventListener('click', () => {
    setMusicEnabled(!getAudioSettings().musicEnabled);
    refreshAudioControls();
  });
  musicSlider.addEventListener('input', () => {
    setMusicVolume(Number(musicSlider.value) / 100);
    musicValue.textContent = `${musicSlider.value}%`;
  });
  sfxToggle.addEventListener('click', () => {
    setSfxEnabled(!getAudioSettings().sfxEnabled);
    refreshAudioControls();
  });
  sfxSlider.addEventListener('input', () => {
    setSfxVolume(Number(sfxSlider.value) / 100);
    sfxValue.textContent = `${sfxSlider.value}%`;
  });

  if (state.currentUser) {
    overlay.querySelector('#opt-delete-account').addEventListener('click', () => {
      showDeleteAccountModal(async () => {
        try {
          await deleteUserProfile(state.currentUser.uid);
          state.userProfile = null;
          logMsg(gameText('account.delete.success'));
        } catch (err) {
          console.error('No se pudo borrar la cuenta:', err);
          logMsg(gameText('account.delete.error'));
        } finally {
          location.reload();
        }
      }, () => {});
    });
  }

  overlay.querySelector('#opt-back').addEventListener('click', () => {
    overlay.remove();
    onBack();
  });
}

// Alerta simple de un solo botón — para avisos que no necesitan "sí/no", solo "entendido"
// (ej. "no podés eliminar tu único mazo"). Distinto de showAbandonConfirmModal y compañía,
// que sí piden una decisión.
export function showSimpleAlertModal(message) {
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 420px;">
      <div style="display:flex; flex-direction:column; gap:14px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 14px; margin: 0; line-height: 1.5;">${message}</p>
        <button id="simple-alert-ok" class="mulligan-btn mulligan-btn-keep">Entendido</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);
  modalOverlay.querySelector('#simple-alert-ok').addEventListener('click', () => modalOverlay.remove());
}

// Confirmar eliminar un mazo — simple sí/no, a diferencia de borrar la cuenta (esto no pide
// escribir nada): perder un mazo es recuperable rearmándolo desde tu colección, perder la
// cuenta entera no.
export function showDeleteDeckConfirmModal(deckName, onConfirm, onCancel) {
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header"><h3>🗑️ Eliminar "${escapeHtml(deckName)}"</h3></div>
      <div style="display:flex; flex-direction:column; gap:12px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0;">Esto borra el mazo para siempre. No se puede deshacer.</p>
        <button id="delete-deck-confirm-btn" class="delete-confirm-btn">Sí, eliminar</button>
        <button id="delete-deck-cancel-btn" class="mulligan-btn mulligan-btn-mull">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);
  modalOverlay.querySelector('#delete-deck-confirm-btn').addEventListener('click', () => {
    modalOverlay.remove();
    onConfirm();
  });
  modalOverlay.querySelector('#delete-deck-cancel-btn').addEventListener('click', () => {
    modalOverlay.remove();
    if (onCancel) onCancel();
  });
}

// Confirmación con texto escrito a propósito (no un simple sí/no) — borrar la cuenta es
// irreversible y destruye colección + puntos + Fichas + mazos, así que el botón de
// confirmar se queda deshabilitado hasta que el jugador escriba la palabra exacta.
export function showDeleteAccountModal(onConfirm, onCancel) {
  // BUGFIX: el botón "Cancelar" usa .mulligan-btn sin nunca haberla inyectado — mismo caso
  // que showDeckNameModal. .delete-confirm-input/.delete-confirm-btn ya venían bien porque
  // viven en injectMainMenuStyles(), que ya corrió antes para llegar hasta acá (siempre se
  // pasa por el menú principal para abrir Opciones).
  injectMulliganStyles();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 460px;">
      <div class="gy-modal-header"><h3>⚠️ Borrar tu cuenta</h3></div>
      <div style="display:flex; flex-direction:column; gap:12px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0;">Esto borra tu colección, tus puntos, tus Fichas y tus mazos guardados — PARA SIEMPRE. No se puede deshacer.</p>
        <p style="color:#cfe0d4; font-size: 13px; margin: 0;">Escribí <strong>ELIMINAR</strong> para confirmar:</p>
        <input type="text" class="delete-confirm-input" id="delete-confirm-input" placeholder="ELIMINAR" autocomplete="off">
        <button class="delete-confirm-btn" id="delete-confirm-btn" disabled>Borrar todo</button>
        <button id="delete-cancel-btn" class="mulligan-btn mulligan-btn-mull">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  const input = modalOverlay.querySelector('#delete-confirm-input');
  const confirmBtn = modalOverlay.querySelector('#delete-confirm-btn');

  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value !== 'ELIMINAR';
  });

  confirmBtn.addEventListener('click', () => {
    if (input.value !== 'ELIMINAR') return; // defensivo: no debería poder llegar acá igual
    modalOverlay.remove();
    onConfirm();
  });

  modalOverlay.querySelector('#delete-cancel-btn').addEventListener('click', () => {
    modalOverlay.remove();
    onCancel();
  });
}

export function showDeckSelectionModal(onChoose, titleOverrides = {}, onCancel) {
  injectDeckSelectionStyles();
  injectEncyclopediaStyles(); // reusa .encyclopedia-back-btn para "Volver"

  const overlay = document.createElement('div');
  overlay.id = 'deck-select-overlay';

  const title = titleOverrides.title || 'Elegi tu mazo';
  const subtitle = titleOverrides.subtitle || 'El Tano ya barajo el suyo al azar. Vos elegis con que pelear.';

  const monoButtonsHTML = ALL_COLORS.map(colorKey => {
    const info = COLOR_INFO[colorKey];
    return `
      <button class="deck-select-mono-btn" data-mono="${colorKey}" title="${info.desc}">
        <div class="deck-select-circle-big" style="${circleStyle(colorKey)}"></div>
        <span class="deck-select-mono-label">${info.name}</span>
      </button>
    `;
  }).join('');

  const pairButtonsHTML = GUILD_PAIRS.map(([a, b]) => {
    const key = a + b;
    const pair = PAIR_INFO[key];
    return `
      <button class="deck-select-pair-btn" data-pair="${key}">
        <div class="deck-select-pair-icons">
          <div class="deck-select-circle-small" style="${circleStyle(a)}"></div>
          <div class="deck-select-circle-small" style="${circleStyle(b)}"></div>
        </div>
        <div class="deck-select-pair-text">
          <div class="deck-select-pair-title">${pair.title}</div>
          <div class="deck-select-pair-desc">${pair.desc}</div>
        </div>
      </button>
    `;
  }).join('');

  // BUGFIX (#9): antes este modal no tenía NINGUNA salida — ni back, ni cancelar. "Volver"
  // es opcional en su comportamiento (si no hay onCancel, solo cierra el modal), pero el
  // botón siempre está.
  overlay.innerHTML = `
    <div class="deck-select-panel">
      <button class="encyclopedia-back-btn" id="deckselect-back" style="margin-bottom: 12px;">← Volver</button>
      <div class="deck-select-title">${title}</div>
      <div class="deck-select-subtitle">${subtitle}</div>
      <div class="deck-select-mono-row">${monoButtonsHTML}</div>
      <div class="deck-select-divider">o combina dos colores</div>
      <div class="deck-select-pairs-grid">${pairButtonsHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#deckselect-back').addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });

  overlay.querySelectorAll('[data-mono]').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-mono');
      overlay.remove();
      onChoose([color]);
    });
  });

  overlay.querySelectorAll('[data-pair]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-pair');
      overlay.remove();
      onChoose([key[0], key[1]]);
    });
  });
}

let mulliganScrollInteractionsInstalled = false;
let mulliganScrollGesture = null;
let mulliganHoverPreview = null;
let mulliganHoverSource = null;

function clearMulliganHoverPreview() {
  mulliganHoverPreview?.remove?.();
  mulliganHoverPreview = null;
  mulliganHoverSource = null;
}

function showMulliganHoverPreview(cardEl) {
  if (!cardEl || typeof document === 'undefined') return;
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) return;
  if (mulliganScrollGesture?.dragging) return;
  if (mulliganHoverSource === cardEl && mulliganHoverPreview?.isConnected) return;
  clearMulliganHoverPreview();

  const rect = cardEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scale = 2;
  const pad = 12;
  const displayW = rect.width * scale;
  const displayH = rect.height * scale;
  const maxLeft = Math.max(pad, window.innerWidth - displayW - pad);
  const maxTop = Math.max(pad, window.innerHeight - displayH - pad);
  const left = Math.min(maxLeft, Math.max(pad, rect.left - rect.width / 2));
  const top = Math.min(maxTop, Math.max(pad, rect.top - rect.height / 2));

  const preview = cardEl.cloneNode(true);
  preview.querySelectorAll?.('[id]').forEach?.(node => node.removeAttribute('id'));
  preview.classList.remove('selectable', 'chosen', 'disabled');
  preview.classList.add('mulligan-card-hover-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.querySelectorAll?.('img').forEach?.(img => { img.draggable = false; });
  document.body.appendChild(preview);
  mulliganHoverPreview = preview;
  mulliganHoverSource = cardEl;
}

function installMulliganScrollInteractions() {
  if (mulliganScrollInteractionsInstalled || typeof document === 'undefined') return;
  mulliganScrollInteractionsInstalled = true;

  const rowFromEvent = (event) => event?.target?.closest?.('.mulligan-hand-row') || null;
  const cardFromEvent = (event) => event?.target?.closest?.('.mulligan-card-slot') || null;
  const hasHorizontalOverflow = (row) => !!row && row.scrollWidth > row.clientWidth + 2;

  // Browser-native image drag produces a ghost card and steals pointermove from our scroller.
  // These modal rows own the drag gesture, so native drag is always disabled inside them.
  document.addEventListener('dragstart', (event) => {
    if (!rowFromEvent(event)) return;
    event.preventDefault();
  }, true);

  // Desktop hover preview lives OUTSIDE the scroll viewport. This avoids the unavoidable
  // clipping caused by overflow-x:auto while keeping the real row safely scrollable.
  document.addEventListener('pointerover', (event) => {
    const cardEl = cardFromEvent(event);
    if (!cardEl || event.pointerType === 'touch') return;
    if (cardEl.contains(event.relatedTarget)) return;
    showMulliganHoverPreview(cardEl);
  }, true);
  document.addEventListener('pointerout', (event) => {
    const cardEl = cardFromEvent(event);
    if (!cardEl || cardEl !== mulliganHoverSource) return;
    if (cardEl.contains(event.relatedTarget)) return;
    clearMulliganHoverPreview();
  }, true);
  document.addEventListener('scroll', clearMulliganHoverPreview, true);

  // Desktop: una rueda vertical normal desplaza horizontalmente los selectores de cartas.
  // Trackpads que ya entregan deltaX conservan su desplazamiento nativo.
  document.addEventListener('wheel', (event) => {
    const row = rowFromEvent(event);
    if (!hasHorizontalOverflow(row)) return;
    clearMulliganHoverPreview();
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
  }, { passive: false, capture: true });

  // Desktop: click+drag puede comenzar SOBRE una carta. Un click corto sigue seleccionándola;
  // sólo a partir de 7 px se convierte en scroll y se suprime el click posterior.
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return; // touch usa pan-x nativo
    const row = rowFromEvent(event);
    if (!hasHorizontalOverflow(row)) return;
    if (event.target?.closest?.('button,a,input,select,textarea,label')) return;
    clearMulliganHoverPreview();
    mulliganScrollGesture = {
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: row.scrollLeft,
      dragging: false
    };
  }, true);

  document.addEventListener('pointermove', (event) => {
    const g = mulliganScrollGesture;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.startX;
    if (!g.dragging && Math.abs(dx) < 7) return;
    if (!g.dragging) {
      g.dragging = true;
      clearMulliganHoverPreview();
      g.row.classList.add('dragging');
      try { g.row.setPointerCapture?.(event.pointerId); } catch {}
    }
    event.preventDefault();
    g.row.scrollLeft = g.startScrollLeft - dx;
  }, { passive: false, capture: true });

  const finishDrag = (event) => {
    const g = mulliganScrollGesture;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.dragging) {
      g.row.dataset.suppressSelectionClickUntil = String(Date.now() + 260);
      g.row.classList.remove('dragging');
      try { g.row.releasePointerCapture?.(event.pointerId); } catch {}
    }
    mulliganScrollGesture = null;
  };
  document.addEventListener('pointerup', finishDrag, true);
  document.addEventListener('pointercancel', finishDrag, true);

  document.addEventListener('click', (event) => {
    const row = rowFromEvent(event);
    if (!row) return;
    const until = Number(row.dataset.suppressSelectionClickUntil || 0);
    if (until > Date.now()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

function injectMulliganStyles() {
  installMulliganScrollInteractions();
  if (document.getElementById('mulligan-styles')) return;
  const style = document.createElement('style');
  style.id = 'mulligan-styles';
  style.textContent = `
    #mulligan-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display: flex; align-items: center; justify-content: center;
    }
    .mulligan-panel {
      max-width: 980px; width: 95%; max-height: 90vh; overflow-x: hidden; overflow-y: auto;
      background: linear-gradient(180deg, rgba(18,25,15,0.97), rgba(11,19,14,0.99));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 16px;
      padding: 28px 30px;
      box-shadow: 0 0 60px rgba(212,175,55,0.15), 0 20px 60px rgba(0,0,0,0.6);
    }
    .mulligan-title {
      text-align: center; font-size: 24px; font-weight: 700; color: var(--gold, #d4af37);
      margin-bottom: 6px; text-shadow: 0 0 20px rgba(212,175,55,0.4);
    }
    .mulligan-subtitle { text-align: center; font-size: 14px; color: #cfe0d4; margin-bottom: 22px; }
    .mulligan-hand-row {
      display: flex; justify-content: flex-start; gap: 8px; flex-wrap: nowrap; margin: -8px 0 2px;
      min-height: 174px; width: 100%; max-width: 100%; box-sizing: border-box;
      padding: 16px 8px 20px; overflow-x: auto; overflow-y: hidden;
      scrollbar-width: thin; scrollbar-color: var(--gold, #d4af37) rgba(0,0,0,.2);
      overscroll-behavior-x: contain; touch-action: pan-x; scroll-behavior: smooth;
      user-select: none; -webkit-user-select: none; cursor: grab;
    }
    #mulligan-overlay.mulligan-flow-overlay .mulligan-hand-row {
      justify-content: safe center;
    }
    .mulligan-hand-row::-webkit-scrollbar { height: 9px; }
    .mulligan-hand-row::-webkit-scrollbar-track { background: rgba(0,0,0,.18); border-radius: 999px; }
    .mulligan-hand-row::-webkit-scrollbar-thumb { background: var(--gold, #d4af37); border-radius: 999px; }
    .mulligan-hand-row.dragging { cursor: grabbing; user-select: none; scroll-behavior: auto; }
    .mulligan-hand-row img, .mulligan-card-slot img { -webkit-user-drag: none; user-drag: none; }
    .mulligan-card-slot {
      width: 100px !important; height: 140px !important;
      transition: box-shadow 0.15s ease, filter 0.15s ease;
      flex-shrink: 0;
    }
    .mulligan-card-slot:hover { z-index: 2; filter: brightness(1.04); }
    .mulligan-card-hover-preview {
      position: fixed !important; z-index: 10020 !important; margin: 0 !important;
      pointer-events: none !important; transform: scale(2) !important; transform-origin: top left !important;
      box-shadow: 0 18px 48px rgba(0,0,0,.62), 0 0 0 1px rgba(212,175,55,.55) !important;
      transition: none !important; filter: none !important;
    }
    .mulligan-card-slot.chosen {
      box-shadow: 0 0 0 3px #e74c3c, 0 0 16px rgba(231,76,60,0.6);
    }
    .mulligan-buttons { display: flex; justify-content: center; gap: 14px; }
    .mulligan-btn {
      padding: 10px 22px; border-radius: 8px; border: none; cursor: pointer;
      font-weight: bold; font-size: 14px;
    }
    .mulligan-btn-keep { background: #e67e22; color: #fff; }
    .mulligan-btn-keep:hover { background: #f39c12; }
    .mulligan-btn-mull { background: #2c2c2c; color: #eee; border: 1px solid #555; }
    .mulligan-btn-mull:hover { background: #3a3a3a; }
    .mulligan-btn:disabled { background: #444; color: #888; cursor: not-allowed; border-color: #444; }
  `;
  document.head.appendChild(style);
}

// Construye una fila de cartas REALES (el mismo createCardElement que usa todo el resto
// del juego), no una versión mini simplificada — así el jugador ve la carta completa y
// tiene el mismo hover-zoom para leerla bien, en vez de una tarjetita con datos sueltos.
// zone='mulligan-pick' evita que createCardElement le pegue cualquier click-handler propio.
function buildMulliganCardRow(hand, selectable, onCardClick) {
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';
  hand.forEach((card, cardIndex) => {
    const cardEl = createCardElement(card, false, true, null, 'mulligan-pick', null);
    cardEl.classList.add('mulligan-card-slot');
    cardEl.querySelectorAll?.('img').forEach?.(img => { img.draggable = false; });
    if (selectable) {
      cardEl.classList.add('selectable');
      cardEl.addEventListener('click', () => onCardClick(card, cardEl, cardIndex));
    } else {
      cardEl.style.cursor = 'default';
    }
    row.appendChild(cardEl);
  });
  return row;
}

// Paso 1: mostrar la mano y elegir Mulligan o Quedarse.
export function showMulliganModal(hand, mulliganCount, canMulliganMore, callbacks) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';
  overlay.classList.add('mulligan-flow-overlay');

  const keepLabel = mulliganCount > 0
    ? gameText('mulligan.keepWithBottom', { count: mulliganCount })
    : gameText('mulligan.keep');
  const subtitle = canMulliganMore
    ? gameText('mulligan.subtitle.can')
    : gameText('mulligan.subtitle.max');
  const mulliganAction = gameTextHtml('mulligan.action');
  const mulliganBtnHTML = canMulliganMore
    ? `<button class="mulligan-btn mulligan-btn-mull" id="btn-do-mulligan">${mulliganAction}</button>`
    : `<button class="mulligan-btn mulligan-btn-mull" disabled>${mulliganAction}</button>`;

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml(mulliganCount === 0 ? 'mulligan.title.initial' : 'mulligan.title.repeat', { count: mulliganCount })}</div>
      <div class="mulligan-subtitle">${subtitle}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        ${mulliganBtnHTML}
        <button class="mulligan-btn mulligan-btn-keep" id="btn-keep-hand">${keepLabel}</button>
      </div>
    </div>
  `;
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(buildMulliganCardRow(hand, false, null));
  document.body.appendChild(overlay);

  const mullBtn = overlay.querySelector('#btn-do-mulligan');
  if (mullBtn) {
    mullBtn.addEventListener('click', () => {
      overlay.remove();
      callbacks.onMulligan();
    });
  }
  overlay.querySelector('#btn-keep-hand').addEventListener('click', () => {
    overlay.remove();
    callbacks.onKeep();
  });
}

// Paso 2 (solo si mulliganeaste al menos una vez): elegir qué cartas van al fondo del mazo.
// Scry N / Surveil N: mirás las N cartas de arriba del mazo y decidís, una por una, si se
// quedan arriba o se van — al fondo del mazo (Scry) o al cementerio (Surveil). Reusa el
// mismo armado de fila de cartas seleccionables que ya usa el Mulligan. El botón de
// Confirmar SIEMPRE está habilitado (a diferencia de "elegir para el fondo" del Mulligan,
// acá 0 cartas elegidas es perfectamente legal — significa "todas se quedan arriba").
export function showScrySurveilModal(cards, mode, onConfirm) {
  if (HEADLESS_ENGINE) { const x=headlessChoice.chooseScrySurveil(cards,mode); onConfirm?.(x.moved,x.kept); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const isSurveil = mode === 'surveil';
  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml(isSurveil ? 'surveil.title' : 'scry.title', { count: cards.length })}</div>
      <div class="mulligan-subtitle">${gameTextHtml(isSurveil ? 'surveil.subtitle' : 'scry.subtitle')}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-scry">${gameTextHtml('selection.confirm')}</button>
      </div>
    </div>
  `;

  const row = buildMulliganCardRow(cards, true, (card, cardEl) => {
    if (chosen.has(card)) {
      chosen.delete(card);
      cardEl.classList.remove('chosen');
    } else {
      chosen.add(card);
      cardEl.classList.add('chosen');
    }
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-scry').addEventListener('click', () => {
    overlay.remove();
    onConfirm(cards.filter(c => chosen.has(c)), cards.filter(c => !chosen.has(c)));
  });
}

// Proliferar: a diferencia de Scry/Surveil (cartas de la mano/mazo), acá elegimos entre
// CUALQUIER permanente/jugador que ya tenga contadores: criaturas, Support, Tierras,
// Planeswalkers y Veneno, de ambos jugadores. Reusamos createCardElement con la zona REAL
// del permanente y un customClick propio; por lo tanto el selector nunca dispara la acción
// normal de esa carta en el tablero.
export function showProliferateModal(eligible, onConfirm) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseProliferate(eligible)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('proliferate.title')}</div>
      <div class="mulligan-subtitle">${gameTextHtml('proliferate.subtitle')}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-proliferate">${gameTextHtml('selection.confirm')}</button>
      </div>
    </div>
  `;

  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';
  eligible.forEach(entry => {
    let cardEl;
    const toggle = () => {
      if (chosen.has(entry)) {
        chosen.delete(entry);
        cardEl.classList.remove('chosen');
      } else {
        chosen.add(entry);
        cardEl.classList.add('chosen');
      }
    };

    if (entry.kind === 'player_poison') {
      // El Veneno es del JUGADOR, no una carta — no hay nada que pasarle a
      // createCardElement, así que armamos un chip propio con la misma clase .chosen para
      // que se vea igual de seleccionable que el resto de las entradas.
      cardEl = document.createElement('div');
      cardEl.className = 'mulligan-card-slot selectable';
      const poisonCount = entry.ownerIsLocal ? state.localPoison : state.rivalPoison;
      cardEl.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:6px; color:#cfe0d4; text-align:center; padding: 8px;">
          <span style="font-size:28px;">☠️</span>
          <span style="font-size:12px; font-weight:bold;">${gameTextHtml('proliferate.poison', { player: entry.ownerIsLocal ? 'Vos' : getRivalName() })}</span>
          <span style="font-size:11px; color:#a89bb5;">${gameTextHtml('proliferate.poisonCurrent', { count: poisonCount })}</span>
        </div>
      `;
      cardEl.addEventListener('click', toggle);
      row.appendChild(cardEl);
      return;
    }

    const modalZone = entry.kind === 'planeswalker' ? 'planeswalker'
      : entry.kind === 'support' ? 'support'
      : entry.kind === 'land' ? 'land'
      : 'combat';
    cardEl = createCardElement(entry.item, !!entry.item.tapped, entry.ownerIsLocal, null, modalZone, toggle);
    cardEl.classList.add('mulligan-card-slot', 'selectable');
    row.appendChild(cardEl);
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-proliferate').addEventListener('click', () => {
    overlay.remove();
    onConfirm([...chosen]);
  });
}


// LAND 5 — Winter Orb-style: durante Enderezar no hay prioridad, pero el jugador activo
// sí debe determinar QUÉ Tierras endereza cuando existe un límite. Este modal no permite
// acciones paralelas y exige exactamente la cantidad que las reglas normales harían enderezar.
export function showUntapLandChoiceModal(entries, countToChoose, onConfirm) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseUntapIndexes(entries,countToChoose)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';
  const chosenIndexes = new Set();
  const count = Math.max(0, Math.min(Number(countToChoose) || 0, entries.length));
  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('land.stax.untap.title', { count })}</div>
      <div class="mulligan-subtitle" id="land-untap-count-hint">${gameTextHtml('selection.count', { selected:0, total:count })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-land-untap" disabled>${gameTextHtml('land.stax.untap.confirm')}</button>
      </div>
    </div>`;
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';
  entries.forEach(entry => {
    let cardEl;
    const toggle = () => {
      if (chosenIndexes.has(entry.index)) {
        chosenIndexes.delete(entry.index);
        cardEl.classList.remove('chosen');
      } else if (chosenIndexes.size < count) {
        chosenIndexes.add(entry.index);
        cardEl.classList.add('chosen');
      }
      overlay.querySelector('#land-untap-count-hint').textContent = gameText('selection.count', { selected:chosenIndexes.size, total:count });
      overlay.querySelector('#btn-confirm-land-untap').disabled = chosenIndexes.size !== count;
    };
    cardEl = createCardElement(entry.item, true, true, null, 'land', toggle);
    cardEl.classList.add('mulligan-card-slot', 'selectable');
    row.appendChild(cardEl);
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);
  overlay.querySelector('#btn-confirm-land-untap').addEventListener('click', () => {
    if (chosenIndexes.size !== count) return;
    overlay.remove();
    onConfirm([...chosenIndexes].sort((a,b)=>a-b));
  });
}

// Punto 6: selector GENERAL de Cementerio. Recibe entries {card, index} para que dos
// copias idénticas sigan siendo distinguibles por slot. `filterLabel` y `actionLabel` son
// puramente visuales; la validación real de elegibilidad vive en main.js. No hay Cancelar:
// cuando se abre, la selección forma parte de una instrucción que ya está resolviéndose.
export function showGraveyardChoiceModal(entries, countToChoose, cardName, filterLabel, actionLabel, onConfirm) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseGraveyardIndexes(entries,countToChoose)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosenIndexes = new Set();
  const count = Math.max(0, Math.min(countToChoose || 1, entries.length));
  const noun = count === 1 ? 'carta' : 'cartas';

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('graveyard.choice.title', { card: cardName, action: actionLabel || gameText('graveyard.choice.defaultAction', { count, noun }) })}</div>
      <div class="mulligan-subtitle" id="graveyard-choice-count-hint">${filterLabel ? `${escapeHtml(filterLabel)} · ` : ''}${gameTextHtml('selection.count', { selected: 0, total: count })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-graveyard-choice" disabled>${gameTextHtml('graveyard.choice.confirm')}</button>
      </div>
    </div>
  `;

  const hint = () => overlay.querySelector('#graveyard-choice-count-hint');
  const confirmBtn = () => overlay.querySelector('#btn-confirm-graveyard-choice');
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';

  entries.forEach(entry => {
    let cardEl;
    const toggle = () => {
      if (chosenIndexes.has(entry.index)) {
        chosenIndexes.delete(entry.index);
        cardEl.classList.remove('chosen');
      } else if (chosenIndexes.size < count) {
        chosenIndexes.add(entry.index);
        cardEl.classList.add('chosen');
      }
      hint().textContent = `${filterLabel ? `${filterLabel} · ` : ''}${gameText('selection.count', { selected: chosenIndexes.size, total: count })}`;
      confirmBtn().disabled = chosenIndexes.size !== count;
    };
    cardEl = createCardElement({ card: entry.card }, false, true, null, 'graveyard', toggle);
    cardEl.classList.add('mulligan-card-slot', 'selectable');
    row.appendChild(cardEl);
  });

  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-graveyard-choice').addEventListener('click', () => {
    if (chosenIndexes.size !== count) return;
    overlay.remove();
    onConfirm([...chosenIndexes].sort((a, b) => a - b));
  });
}

// Escape: elegir N cartas del cementerio para exiliar como costo adicional. Mismo
// esqueleto exacto que showBottomCardsModal (selección hasta llegar a la cantidad exacta,
// confirmar deshabilitado hasta entonces) — reusamos buildMulliganCardRow porque acá los
// elegibles SON cartas de verdad (del cementerio), a diferencia de Proliferar que elige
// permanentes del campo.
export function showEscapeExileModal(graveyardCards, exileCount, onConfirm) {
  const entries = graveyardCards.map((card, index) => ({ card, index }));
  showGraveyardChoiceModal(
    entries,
    exileCount,
    'Escape',
    gameText('escape.choice.filter'),
    gameText('escape.choice.action', { count: exileCount }),
    chosenIndexes => onConfirm(chosenIndexes.map(i => graveyardCards[i]).filter(Boolean))
  );
}

// Punto 5: el dueño elige exactamente N permanentes propios para sacrificar como EFECTO.
// No hay Cancelar: el efecto ya está resolviéndose. Recibe items de battlefield reales,
// por eso varias copias idénticas siguen siendo seleccionables como objetos distintos.
export function showSacrificeEffectModal(candidates, countToSacrifice, cardName, permanentType, onConfirm) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseSacrificeEntries(candidates,countToSacrifice)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();
  const typeLabel = permanentType === 'artifact' ? 'artefacto' : permanentType === 'land' ? 'tierra' : 'criatura';

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('sacrifice.choice.title', { card: cardName, count: countToSacrifice, type: `${typeLabel}${countToSacrifice > 1 ? 's' : ''}` })}</div>
      <div class="mulligan-subtitle" id="sacrifice-effect-count-hint">${gameTextHtml('selection.count', { selected: 0, total: countToSacrifice })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-sacrifice-effect" disabled>${gameTextHtml('sacrifice.choice.confirm')}</button>
      </div>
    </div>
  `;

  const hint = () => overlay.querySelector('#sacrifice-effect-count-hint');
  const confirmBtn = () => overlay.querySelector('#btn-confirm-sacrifice-effect');
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';

  candidates.forEach(item => {
    let cardEl;
    const toggle = () => {
      if (chosen.has(item)) {
        chosen.delete(item);
        cardEl.classList.remove('chosen');
      } else if (chosen.size < countToSacrifice) {
        chosen.add(item);
        cardEl.classList.add('chosen');
      }
      hint().textContent = gameText('selection.count', { selected: chosen.size, total: countToSacrifice });
      confirmBtn().disabled = chosen.size !== countToSacrifice;
    };

    const zone = state.localCombat.includes(item) ? 'combat'
      : state.localLands.includes(item) ? 'land'
      : 'support';
    cardEl = createCardElement(item, !!item.tapped, true, null, zone, toggle);
    cardEl.classList.add('mulligan-card-slot', 'selectable');
    row.appendChild(cardEl);
  });

  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-sacrifice-effect').addEventListener('click', () => {
    if (chosen.size !== countToSacrifice) return;
    overlay.remove();
    onConfirm([...chosen]);
  });
}

// Punto 8: selector GENÉRICO de descarte desde la propia mano. Lo reutilizan el descarte
// elegido normal, los costos adicionales y, mediante el wrapper de abajo, Loot/Rummage.
// Usa ÍNDICES de slot, no Set(card): dos copias idénticas tienen que seguir siendo dos
// elecciones distintas. No hay botón Cancelar porque, cuando aparece, una instrucción o
// un costo ya está a mitad de resolución.

// 23.15.4 — Phyrexian mana se decide antes de abrir fuentes: cada símbolo elegido se
// prepara como 2 de vida; los no elegidos permanecen en pendingCost y pueden pagarse con
// maná del color correspondiente (o Convoke). No muta vida hasta el commit 601.2h.
export function showPhyrexianCostChoiceModal(symbols, cardName, maxLifePayments = Infinity) {
  if (HEADLESS_ENGINE) return Promise.resolve([]);
  const list=Array.isArray(symbols)?symbols:[];
  if(!list.length||maxLifePayments<=0) return Promise.resolve([]);
  injectMulliganStyles();
  const overlay=document.createElement('div');
  overlay.id='mulligan-overlay';
  const chosen=new Set();
  const max=Math.min(list.length,Math.max(0,Math.floor(Number(maxLifePayments)||0)));
  overlay.innerHTML=`
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('cost.phyrexian.choice.title',{card:cardName})}</div>
      <div class="mulligan-subtitle" id="phyrexian-choice-hint">${gameTextHtml('cost.phyrexian.choice.count',{selected:0,max})}</div>
      <div class="mulligan-hand-row" id="phyrexian-symbol-row"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-mull" id="btn-phyrexian-none">${gameTextHtml('cost.phyrexian.choice.none')}</button>
        <button class="mulligan-btn mulligan-btn-keep" id="btn-phyrexian-confirm">${gameTextHtml('cost.phyrexian.choice.confirm')}</button>
      </div>
    </div>`;
  const row=overlay.querySelector('#phyrexian-symbol-row');
  list.forEach((color,index)=>{
    const btn=document.createElement('button');
    btn.type='button'; btn.className='mulligan-btn';
    btn.textContent=`{${color}/P} → 2 vida`;
    btn.addEventListener('click',()=>{
      if(chosen.has(index)){chosen.delete(index);btn.classList.remove('chosen');}
      else if(chosen.size<max){chosen.add(index);btn.classList.add('chosen');}
      overlay.querySelector('#phyrexian-choice-hint').textContent=gameText('cost.phyrexian.choice.count',{selected:chosen.size,max});
    });
    row.appendChild(btn);
  });
  document.body.appendChild(overlay);
  return new Promise(resolve=>{
    overlay.querySelector('#btn-phyrexian-none').addEventListener('click',()=>{overlay.remove();resolve([]);});
    overlay.querySelector('#btn-phyrexian-confirm').addEventListener('click',()=>{overlay.remove();resolve([...chosen].sort((a,b)=>a-b));});
  });
}

// 23.15.4 — selector opcional de recursos de pago (Convoke/Delve). A diferencia de los
// selectores de costos obligatorios, permite confirmar 0..máximo y por eso siempre ofrece
// "seguir sin usar". No muta permanentes/zonas: sólo devuelve la selección preparada.
export function showCostPaymentResourceModal(entries, options = {}) {
  if (HEADLESS_ENGINE) return Promise.resolve([]);
  injectMulliganStyles();
  const list = Array.isArray(entries) ? entries : [];
  const max = Math.max(0, Math.min(list.length, Math.floor(Number(options.max) || 0)));
  if (max === 0 || list.length === 0) return Promise.resolve([]);
  const mode = options.mode === 'delve' ? 'delve' : 'convoke';
  const cardName = options.cardName || 'Hechizo';
  const chosen = new Set();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';
  const titleKey = mode === 'delve' ? 'cost.delve.choice.title' : 'cost.convoke.choice.title';
  const confirmKey = mode === 'delve' ? 'cost.delve.choice.confirm' : 'cost.convoke.choice.confirm';
  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml(titleKey, { card:cardName, max })}</div>
      <div class="mulligan-subtitle" id="cost-resource-count-hint">${gameTextHtml('cost.resource.choice.count', { selected:0, max })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-mull" id="btn-skip-cost-resource">${gameTextHtml('cost.resource.choice.skip')}</button>
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-cost-resource">${gameTextHtml(confirmKey)}</button>
      </div>
    </div>`;
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row';
  const hint = () => overlay.querySelector('#cost-resource-count-hint');
  list.forEach(entry => {
    const value = entry?.item || entry?.card || entry;
    let cardEl;
    const toggle = () => {
      if (chosen.has(value)) { chosen.delete(value); cardEl.classList.remove('chosen'); }
      else if (chosen.size < max) { chosen.add(value); cardEl.classList.add('chosen'); }
      hint().textContent = gameText('cost.resource.choice.count', { selected:chosen.size, max });
    };
    if (mode === 'convoke') {
      const item = value;
      const zone = state.localCombat.includes(item) ? 'combat' : state.localSupport.includes(item) ? 'support' : state.localLands.includes(item) ? 'land' : 'combat';
      cardEl = createCardElement(item, !!item?.tapped, true, null, zone, toggle);
    } else {
      const card = value?.card || value;
      cardEl = createCardElement(card, false, true, null, 'graveyard', toggle);
    }
    cardEl.classList.add('mulligan-card-slot','selectable');
    row.appendChild(cardEl);
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);
  return new Promise(resolve => {
    overlay.querySelector('#btn-skip-cost-resource').addEventListener('click',()=>{ overlay.remove(); resolve([]); });
    overlay.querySelector('#btn-confirm-cost-resource').addEventListener('click',()=>{ overlay.remove(); resolve([...chosen]); });
  });
}

export function showHandDiscardChoiceModal(hand, countToDiscard, cardName, actionLabel, onConfirm) {
  if (HEADLESS_ENGINE) { onConfirm?.(headlessChoice.chooseHandIndexes(hand,countToDiscard)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosenIndexes = new Set();
  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('discard.choice.title', { card: cardName, action: actionLabel || gameText('discard.choice.defaultAction') })}</div>
      <div class="mulligan-subtitle" id="hand-discard-count-hint">${gameTextHtml('selection.count', { selected: 0, total: countToDiscard })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-hand-discard" disabled>${gameTextHtml('discard.choice.confirm')}</button>
      </div>
    </div>
  `;

  const hint = () => overlay.querySelector('#hand-discard-count-hint');
  const confirmBtn = () => overlay.querySelector('#btn-confirm-hand-discard');
  const row = buildMulliganCardRow(hand, true, (_card, cardEl, cardIndex) => {
    if (chosenIndexes.has(cardIndex)) {
      chosenIndexes.delete(cardIndex);
      cardEl.classList.remove('chosen');
    } else if (chosenIndexes.size < countToDiscard) {
      chosenIndexes.add(cardIndex);
      cardEl.classList.add('chosen');
    }
    hint().textContent = gameText('selection.count', { selected: chosenIndexes.size, total: countToDiscard });
    confirmBtn().disabled = chosenIndexes.size !== countToDiscard;
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-hand-discard').addEventListener('click', () => {
    if (chosenIndexes.size !== countToDiscard) return;
    overlay.remove();
    onConfirm([...chosenIndexes].sort((a, b) => a - b));
  });
}

// Punto 4: Loot/Rummage conserva su API y textos, pero usa el selector genérico del Punto 8.
export function showHandFilterDiscardModal(hand, countToDiscard, cardName, mode, onConfirm) {
  const actionLabel = mode === 'loot'
    ? gameText('discard.loot.action')
    : gameText('discard.rummage.action');
  return showHandDiscardChoiceModal(hand, countToDiscard, cardName, actionLabel, onConfirm);
}

export function showBottomCardsModal(hand, countToBottom, onConfirm) {
  if (HEADLESS_ENGINE) { const idx=headlessChoice.chooseHandIndexes(hand,countToBottom); onConfirm?.(idx.map(i=>hand[i]).filter(Boolean)); return; }
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';
  overlay.classList.add('mulligan-flow-overlay');

  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('mulligan.bottom.title', { count: countToBottom })}</div>
      <div class="mulligan-subtitle" id="mulligan-count-hint">${gameTextHtml('selection.count', { selected: 0, total: countToBottom })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-bottom" disabled>${gameTextHtml('selection.confirm')}</button>
      </div>
    </div>
  `;

  const hint = () => overlay.querySelector('#mulligan-count-hint');
  const confirmBtn = () => overlay.querySelector('#btn-confirm-bottom');

  const row = buildMulliganCardRow(hand, true, (card, cardEl) => {
    if (chosen.has(card)) {
      chosen.delete(card);
      cardEl.classList.remove('chosen');
    } else if (chosen.size < countToBottom) {
      chosen.add(card);
      cardEl.classList.add('chosen');
    }
    hint().textContent = gameText('selection.count', { selected: chosen.size, total: countToBottom });
    confirmBtn().disabled = chosen.size !== countToBottom;
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-bottom').addEventListener('click', () => {
    overlay.remove();
    onConfirm([...chosen]);
  });
}

// 23.15.9 — Copy Engine. Antes de retargetear una copia, el controlador puede
// conservar el target copiado. El modal es deliberadamente pequeño y reutiliza el shell
// visual de las selecciones de Mulligan para no sumar otra familia de overlays.
export function showCopyRetargetModal(cardName, targetLabel, onKeep, onChange) {
  if (HEADLESS_ENGINE) { headlessChoice.chooseCopyRetarget()==='keep' ? onKeep?.() : onChange?.(); return; }
  injectMulliganStyles();
  const overlay=document.createElement('div');
  overlay.id='mulligan-overlay';
  overlay.innerHTML=`
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('copy.retarget.title')}</div>
      <div class="mulligan-subtitle">${gameTextHtml('copy.retarget.subtitle',{card:cardName||'objeto',target:targetLabel||'objetivo'})}</div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn" data-copy-keep>${gameTextHtml('copy.retarget.keep')}</button>
        <button class="mulligan-btn mulligan-btn-keep" data-copy-change>${gameTextHtml('copy.retarget.change')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const finish=cb=>{ overlay.remove(); cb?.(); };
  overlay.querySelector('[data-copy-keep]').onclick=()=>finish(onKeep);
  overlay.querySelector('[data-copy-change]').onclick=()=>finish(onChange);
}

export function showStackObjectChoiceModal(entries = [], title = null, onConfirm, onCancel = null) {
  if (HEADLESS_ENGINE) { const x=headlessChoice.chooseStackEntry(entries); x ? onConfirm?.(x) : onCancel?.(); return; }
  injectMulliganStyles();
  const overlay=document.createElement('div');
  overlay.id='mulligan-overlay';
  const rows=entries.map((entry,i)=>`<button class="mulligan-btn" data-stack-choice="${i}" style="width:100%;margin:4px 0;">${escapeCardTextHtml(entry.label||entry.cardName||`Objeto #${entry.id}`)}</button>`).join('');
  overlay.innerHTML=`
    <div class="mulligan-panel">
      <div class="mulligan-title">${escapeCardTextHtml(title || gameText('copy.stackChoice.title'))}</div>
      <div class="mulligan-subtitle">${rows || 'No hay objetos legales.'}</div>
      <div class="mulligan-buttons"><button class="mulligan-btn" data-stack-cancel>${gameTextHtml('common.cancel')}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-stack-choice]').forEach(btn=>btn.onclick=()=>{
    const entry=entries[Number(btn.dataset.stackChoice)]; overlay.remove(); onConfirm?.(entry || null);
  });
  overlay.querySelector('[data-stack-cancel]').onclick=()=>{ overlay.remove(); onCancel?.(); };
}

export function showGameOverOverlay(didWin) {
  if (HEADLESS_ENGINE) { globalThis.__ARGENTINIA_HEADLESS_GAME_OVER__ = { didWin: !!didWin, at: Date.now() }; return; }
  els.gameOverTitle.textContent = didWin ? gameText('game.over.overlayWin', { rival: getRivalName() }) : gameText('game.over.overlayLoss', { rival: getRivalName() });
  if (els.gameOverRewardStatus) {
    els.gameOverRewardStatus.textContent = state.currentMatch && state.currentUser ? gameText('game.points.pvpChecking') : '';
    els.gameOverRewardStatus.classList.toggle('hidden', !els.gameOverRewardStatus.textContent);
  }
  els.gameOverOverlay.classList.remove('hidden'); els.btnEndTurn.disabled = true;
}

export function showGameRewardStatus(message, kind = 'info') {
  if (!els.gameOverRewardStatus) return;
  const text = String(message || '').trim();
  els.gameOverRewardStatus.textContent = text;
  els.gameOverRewardStatus.dataset.kind = kind;
  els.gameOverRewardStatus.classList.toggle('hidden', !text);
}

function zoneGroupingKey(item, idx, zoneType) {
  const baseKey = item?.card?.id || item?.card?.name || `item_${idx}`;
  // 23.17.5.5 — las Sagas iguales NO se apilan visualmente: dos copias con capítulos
  // distintos deben verse como instancias separadas para poder seguir su progreso real.
  // La identidad estable prioriza _syncObjectId; si no existe aún, caemos a instance/id+idx.
  if (zoneType === 'support' && isSagaCard(item?.card)) {
    const sagaInstanceKey = item?._syncObjectId || item?.card?.instanceId || item?._effectObjectId || `${baseKey}_${idx}`;
    return `saga_${sagaInstanceKey}`;
  }
  return baseKey;
}

function groupAndRenderZone(zoneArray, containerEl, isLocal, zoneType) {
  containerEl.innerHTML = '';
  const groups = {};
  
  zoneArray.forEach((item, idx) => {
    // Antes se agrupaba por COLOR que produce (`land_${produces}`) — mezclaba a Las Malvinas
    // (maná x2) con cualquier tierra básica del mismo color en el MISMO stack visual, aunque
    // sean cartas totalmente distintas. Clickear el stack giraba "la primera que caiga" sin
    // ninguna garantía de cuál era, dando de maná lo que le tocara a esa (y el contador del
    // badge no reflejaba bien la mezcla). Agrupar por identidad de carta (id) es siempre
    // correcto: junta copias de la MISMA carta (ej. 3 tierras básicas iguales) y nunca mezcla
    // cartas mecánicamente distintas, aunque compartan color. Excepción: Sagas, que se separan
    // por instancia para preservar visiblemente sus capítulos independientes.
    const key = zoneGroupingKey(item, idx, zoneType);
    if (!groups[key]) groups[key] = { items: [], ready: [], tapped: [] };
    groups[key].items.push({ item, originalIndex: idx });
    if (item.tapped) groups[key].tapped.push(item);
    else groups[key].ready.push(item);
  });

  Object.values(groups).forEach(group => {
    const isAllTapped = group.ready.length === 0;
    const visualItem = group.items[0].item;
    
    const customClick = () => {
      if (state.gameOver) return;
      if (zoneType === 'land') {
        const { item: targetItem, originalIndex } = group.items[0];
        if (state.pendingTargetCard || state.pendingMultiTargetChoice || state.pendingResolvedEffectTargetChoice) {
          handleLandTargetClick(targetItem, isLocal, originalIndex);
          return;
        }
        if (isLocal) {
          const readyLand = group.ready[0];
          if (readyLand) tapLocalLand(readyLand);
        }
      } else if (zoneType === 'support') {
        // 23.7.2 P0: si estamos eligiendo el artefacto de un costo de sacrificio, ESE click
        // tiene prioridad absoluta. Antes el renderer agrupado intentaba tratar al Fajo como
        // fuente de maná y podía explotar antes de llegar a tryResolveSacrificeChoice().
        if (state.pendingSacrificeChoice && isLocal) {
          const { item: targetItem, originalIndex } = group.items[0];
          handleSupportClick(targetItem, true, originalIndex);
          return;
        }
        // Si hay un hechizo esperando un objetivo tipo permanente, prioriza eso sobre activar la habilidad
        if (state.pendingTargetCard) {
          const rules = getTargetRules(state.pendingTargetCard);
          const allowThisSide = isLocal ? rules.allowLocalPermanent : rules.allowRivalPermanent;
          const matchesFilter = (!rules.permanentFilter || group.items[0].item.card.type.includes(rules.permanentFilter)) && (!rules.subtypeFilter || cardHasSubtype(group.items[0].item.card,rules.subtypeFilter)) && (!rules.sharedCreatureTypeWithSource || cardsShareCreatureType(group.items[0].item.card,rules.typalSourceCard)) && (!rules.transformableOnly || canTransformPermanent(group.items[0].item));
          if (allowThisSide && matchesFilter) {
            const { item: targetItem, originalIndex } = group.items[0];
            handleSupportTargetClick(targetItem, isLocal, originalIndex);
            return;
          }
        }
        const supportHasAbility = (isLandPermanent(group.items[0].item) ? getEffectiveLandActivatedAbilities(state, group.items[0].item, true) : getActivatedAbilities(group.items[0].item.card)).length > 0;
        const supportCanPayNow = !!state.pendingCost &&
          group.ready.some(x => canManaSourcePayPendingCost(x.card));
        // 23.7.1: con prioridad dejamos que el click llegue al validador central de timing.
        // Antes la UI tragaba silenciosamente clicks sobre Equipar/sorcery-speed en turno
        // rival, por eso Daga Escondida no explicaba que Destello sólo permite lanzarla.
        const supportTimingAllowsClick = supportCanPayNow ||
          (state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2')) ||
          (state.priorityPlayer === 'local' && supportHasAbility);
        if (isLocal && supportTimingAllowsClick) {
          const readySupport = supportCanPayNow
            ? group.ready.find(x => canManaSourcePayPendingCost(x.card))
            : group.ready[0];
          if (readySupport) {
            const originalIdx = group.items.find(x => x.item === readySupport).originalIndex;
            handleSupportClick(readySupport, isLocal, originalIdx);
          }
        }
      }
    };

    const cardEl = createCardElement(visualItem, isAllTapped, isLocal, null, zoneType, customClick);
    
    if (group.items.length > 1 || group.tapped.length > 0) {
      const badgeContainer = document.createElement('div');
      badgeContainer.className = 'stack-counter-container';
      if (group.ready.length > 0) badgeContainer.innerHTML += `<div class="stack-badge badge-ready" title="Disponibles">${group.ready.length}</div>`;
      if (group.tapped.length > 0) badgeContainer.innerHTML += `<div class="stack-badge badge-tapped" title="Giradas">${group.tapped.length}</div>`;
      cardEl.appendChild(badgeContainer);
    }
    
    containerEl.appendChild(cardEl);
  });
}

// --- ACTUALIZACIÓN MASIVA DE UI RENDER (HUD y Botones Adaptables a Prioridad) ---


function getStackTopDisplayName() {
  const top = spellStack.length ? spellStack[spellStack.length - 1] : null;
  if (!top) return '';
  if (top.type === 'ability' && top.abilityKind === 'triggered') {
    return `${top.card?.name || 'habilidad'} (${top.triggerLabel || 'habilidad disparada'})`;
  }
  return top.card?.name || 'la cima de la pila';
}

function getPriorityPauseLabel(activity) {
  const keys = {
    ready: 'priority.activity.ready.pause', resolving: 'priority.activity.resolving.pause', discarding: 'priority.activity.discarding.pause',
    paying_mana: 'priority.activity.paying_mana.pause', choosing_target: 'priority.activity.choosing_target.pause', choosing_ability: 'priority.activity.choosing_ability.pause',
    choosing_sacrifice: 'priority.activity.choosing_sacrifice.pause', choosing_attackers: 'priority.activity.choosing_attackers.pause', choosing_blockers: 'priority.activity.choosing_blockers.pause',
    assigning_damage: 'priority.activity.assigning_damage.pause', remote_decision: 'priority.activity.remote_decision.pause', choosing_cards: 'priority.activity.choosing_cards.pause',
    choosing_mode: 'priority.activity.choosing_mode.pause', resolution_choice: 'priority.activity.resolution_choice.pause', blocked: 'priority.activity.blocked.pause'
  };
  return keys[activity] ? gameText(keys[activity]) : String(activity || 'PAUSADO').replaceAll('_', ' ').toUpperCase();
}

export function refreshTurnPriorityHudClock() {
  if (!els.priorityClock || !els.priorityFuseFill || !els.priorityCountdown) return;
  const isMulti = !!state.currentMatch && !state.gameOver;
  if (!isMulti) {
    els.priorityClock.classList.add('hidden');
    els.priorityPauseLabel?.classList.add('hidden');
    return;
  }

  els.priorityClock.classList.remove('hidden');
  const activity = getEffectivePriorityActivity(state);
  const running = canPriorityClockRun(state);
  // 23.13.36: ATACANTES/BLOQUEADORES pueden mostrar chip de actividad sin congelar la mecha.
  const paused = !!(state.priorityClockPausedLocal || !running);
  const duration = Math.max(1000, Number(state.priorityClockDurationMs) || PRIORITY_CLOCK_DURATION_MS);
  const remaining = Math.max(0, Math.min(duration, Number(state.priorityClockRemainingMs ?? duration)));
  const fraction = Math.max(0, Math.min(1, remaining / duration));
  const seconds = Math.ceil(remaining / 1000);
  els.priorityFuseFill.style.width = `${(fraction * 100).toFixed(2)}%`;
  if (els.priorityFuseSpark) els.priorityFuseSpark.style.left = `calc(${(fraction * 100).toFixed(2)}% - 8px)`;
  // 23.9.1: el número queda CONGELADO y visible durante la pausa. El usuario ve cuánto
  // tiempo conserva; el motivo aparece debajo. No mostramos sólo "⏸", que ocultaba información.
  els.priorityCountdown.textContent = `${seconds}`;
  els.priorityClock.classList.toggle('paused', paused);
  els.priorityClock.classList.toggle('danger', running && remaining <= 5000);
  els.priorityClock.classList.toggle('expired', running && remaining <= 0);
  if (els.priorityPauseLabel) {
    const reason = activity || state.priorityClockPauseReasonLocal;
    els.priorityPauseLabel.textContent = gameText('priority.pause.prefix', { reason: getPriorityPauseLabel(reason) });
    els.priorityPauseLabel.classList.toggle('hidden', !paused || !reason);
  }
}

function renderTurnPriorityHud() {
  const topName = getStackTopDisplayName();
  const copy = getPriorityUxCopy(state, getLocalPlayerName(), getRivalName(), topName);
  if (els.turnOwnerBadge) els.turnOwnerBadge.textContent = copy.turnOwnerText;
  if (els.turnPhaseBadge) els.turnPhaseBadge.textContent = copy.phaseText;
  if (els.priorityOwnerBadge) els.priorityOwnerBadge.textContent = copy.priorityText;
  if (els.priorityContextLabel) els.priorityContextLabel.textContent = copy.contextText;
  if (els.priorityStateChip) {
    els.priorityStateChip.textContent = copy.stateChipText;
    els.priorityStateChip.className = `priority-state-chip ${copy.stateChipKind || ''}`.trim();
  }
  if (els.turnPriorityHud) {
    els.turnPriorityHud.classList.toggle('my-priority', copy.isMyPriority && (state.consecutivePasses || 0) < 2);
    els.turnPriorityHud.classList.toggle('rival-priority', !copy.isMyPriority && (state.consecutivePasses || 0) < 2);
    els.turnPriorityHud.classList.toggle('my-turn', copy.isMyTurn);
    els.turnPriorityHud.classList.toggle('rival-turn', !copy.isMyTurn);
    els.turnPriorityHud.classList.toggle('resolving', (state.consecutivePasses || 0) >= 2);
  }
  if (els.localPlayerCard) {
    els.localPlayerCard.classList.toggle('active-turn-player', copy.isMyTurn);
    els.localPlayerCard.classList.toggle('has-priority-player', copy.isMyPriority && (state.consecutivePasses || 0) < 2);
  }
  if (els.rivalPlayerCard) {
    els.rivalPlayerCard.classList.toggle('active-turn-player', !copy.isMyTurn);
    els.rivalPlayerCard.classList.toggle('has-priority-player', !copy.isMyPriority && (state.consecutivePasses || 0) < 2);
  }
  refreshTurnPriorityHudClock();
}

function renderPhaseProgress() {
  const phaseOrder = [
    ['dot-untap', 'untap'], ['dot-upkeep', 'upkeep'], ['dot-draw', 'draw'], ['dot-main1', 'main1'],
    ['dot-combat', 'combat'], ['dot-main2', 'main2'], ['dot-end', 'end_step'], ['dot-cleanup', 'cleanup']
  ];
  const phaseIndex = state.phase?.startsWith('combat')
    ? 4
    : phaseOrder.findIndex(([, key]) => key === state.phase);

  phaseOrder.forEach(([id], idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active', 'completed', 'blinking');
    if (phaseIndex >= 0 && idx < phaseIndex) el.classList.add('completed');
    if (phaseIndex >= 0 && idx === phaseIndex) el.classList.add('active', 'blinking');
  });

  const combatDot = document.getElementById('dot-combat');
  if (combatDot) {
    const keys = {
      combat_begin: 'phase.tooltip.begin', combat_attackers: 'phase.tooltip.attackers',
      combat_blockers: 'phase.tooltip.blockers', combat_damage: 'phase.tooltip.damage', combat_end: 'phase.tooltip.end'
    };
    const label = keys[state.phase] ? gameText(keys[state.phase]) : gameText('phase.tooltip.generic');
    combatDot.dataset.phaseLabel = label;
    combatDot.title = label;
    combatDot.setAttribute('aria-label', label);
  }

  // 23.13.7 — banner de macrofase: deduplicado por turno/jugador/fase en el módulo.
  // Un rerender por prioridad o por un hover nunca vuelve a disparar el aviso.
  announcePhaseTransition({ phase: state.phase, turnCount: state.turnCount, activePlayer: state.activePlayer });
}
function scheduleCurrentCombatMap() {
  scheduleCombatMapRender({
    state,
    getPower: getEffectivePower,
    getToughness: getEffectiveToughness,
    hasKeyword,
    getProtectionMatch,
    getLocalPlayerName,
    getRivalName,
    regularOnly: state.phase === 'combat_damage' && hasPendingCombatDamageContinuation(),
    gameText
  });
}

// Un scroll horizontal del battlefield o un resize cambia las coordenadas aunque no cambie
// el state. Recalculamos únicamente el SVG; no llama render() ni publica nada.
window.addEventListener('resize', scheduleCurrentCombatMap, { passive: true });
[els.localCombat, els.rivalCombat, els.localPlaneswalkers, els.rivalPlaneswalkers].forEach(zone => {
  zone?.addEventListener('scroll', scheduleCurrentCombatMap, { passive: true });
});

export function render() {
  if (HEADLESS_ENGINE) {
    state.localHP = Math.max(0, Math.min(20, state.localHP));
    state.rivalHP = Math.max(0, Math.min(20, state.rivalHP));
    try { captureTelemetryState('headless_render'); } catch {}
    return;
  }
  state.localHP = Math.max(0, Math.min(20, state.localHP));
  state.rivalHP = Math.max(0, Math.min(20, state.rivalHP));
  updateRivalAccountUI();
  renderManaPoolHud();

  els.localHand.innerHTML = ''; state.localHand.forEach((card, idx) => els.localHand.appendChild(createCardElement(card, false, true, idx, 'hand')));
  els.rivalHand.innerHTML = ''; state.rivalHand.forEach(() => {
    const back = document.createElement('div'); back.className = 'card card-back';
    back.innerHTML = `<img src="./assets/images/card_back.png" alt="Reverso" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;" onerror="this.style.display='none'">`;
    els.rivalHand.appendChild(back);
  });

  groupAndRenderZone(state.localLands, els.localLands, true, 'land');
  groupAndRenderZone(state.rivalLands, els.rivalLands, false, 'land');
  groupAndRenderZone(state.localSupport, els.localSupport, true, 'support');
  groupAndRenderZone(state.rivalSupport, els.rivalSupport, false, 'support');

  els.localPlaneswalkers.innerHTML = ''; state.localPlaneswalkers.forEach((item, idx) => els.localPlaneswalkers.appendChild(createCardElement(item, false, true, idx, 'planeswalker')));
  els.rivalPlaneswalkers.innerHTML = ''; state.rivalPlaneswalkers.forEach((item, idx) => els.rivalPlaneswalkers.appendChild(createCardElement(item, false, false, idx, 'planeswalker')));

  els.localCombat.innerHTML = ''; state.localCombat.forEach((item, idx) => els.localCombat.appendChild(createCardElement(item, item.tapped, true, idx, 'combat')));
  els.rivalCombat.innerHTML = ''; state.rivalCombat.forEach((item, idx) => els.rivalCombat.appendChild(createCardElement(item, item.tapped, false, idx, 'combat')));
  
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    els.rivalHpBar.parentElement.classList.toggle('targetable', rules.allowPlayer);
    els.localHpBar.parentElement.classList.toggle('targetable', rules.allowPlayer);
  } else {
    els.rivalHpBar.parentElement.classList.remove('targetable');
    els.localHpBar.parentElement.classList.remove('targetable');
  }

  sizeAllRows();
  updatePilesUI();

  // 23.13.38 — mapa derivado de combate. Se dibuja DESPUÉS de reconstruir el DOM,
  // nunca toca estado ni Firestore. En la ventana entre iniciativa y daño regular filtramos
  // quienes ya no vuelven a pegar salvo Daño Doble.
  scheduleCurrentCombatMap();

  // El Veneno se muestra pegado al HP, y solo si tenés alguno (0 no ensucia el HUD). Con
  // 10 llegás a la derrota alternativa — checkGameOver() más abajo ya lo controla solo.
  const localPoisonText = state.localPoison > 0 ? ` ☠️${state.localPoison}` : '';
  const rivalPoisonText = state.rivalPoison > 0 ? ` ☠️${state.rivalPoison}` : '';
  els.localHpText.textContent = `${state.localHP} / 20 HP${localPoisonText}`; els.rivalHpText.textContent = `${state.rivalHP} / 20 HP${rivalPoisonText}`;
  els.localHpBar.style.width = `${(state.localHP / 20) * 100}%`; els.rivalHpBar.style.width = `${(state.rivalHP / 20) * 100}%`;

  // --- 1. GESTIÓN VISUAL DEL HUD Y FASES ---
  renderTurnPriorityHud();

// 23.9.1: progreso de fase mínimo — puntos + tooltip, sin texto persistente.
  renderPhaseProgress();

  // --- 2. GESTIÓN DEL BOTÓN DE ACCIÓN / PASAR PRIORIDAD ---
  // BUGFIX: antes solo chequeaba damageModalOpen/pendingRampChoice — "Pasar Prioridad"
  // (botón O el atajo de la barra espaciadora) se podía disparar mientras CUALQUIER otra
  // elección a medio resolver seguía esperando tu click (tripular, pagar Ward, elegir
  // modo, elegir objetivos, Scry/Surveil, Proliferar, Escape, Kicker, contrarrestar a
  // menos que pagues, etc.) — arriesgando una condición de carrera con esa resolución.
  // Misma lista que ya usa canPlayCard (más pendingTargetCard/pendingSacrificeChoice/
  // pendingHybridLifePayment, que faltaban ahí también).
  const anyPendingChoice = !!state.pendingSuspendTransaction || !!state.pendingCastTransaction || !!state.pendingAlternativeCostChoice || !!state.pendingPrivateZoneChoice || !!state.pendingLandSearchChoice || !!state.pendingLibraryChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingActivatedAbilityChoice !== null ||
    state.pendingTargetCard !== null || state.pendingCrew !== null || state.pendingWardChoice !== null ||
    state.pendingCounterUnlessPay !== null || state.pendingHybridLifePayment !== null ||
    state.pendingFightChoice !== null || state.pendingXChoice !== null || state.pendingModeChoice !== null ||
    state.pendingLoyaltyTargetChoice !== null || state.pendingMultiTargetChoice !== null ||
    state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingHandFilterChoice || state.pendingDiscardChoice || state.pendingSacrificeEffectChoice || state.pendingGraveyardChoice || state.pendingResolvedEffectTargetChoice || (state.resolvingSacrificeEffects || 0) > 0 ||
    (state.resolvingCardFilterEffects || 0) > 0 || (state.resolvingDiscardEffects || 0) > 0 || (state.resolvingGraveyardChoices || 0) > 0 || (state.resolvingResolvedEffectTargetChoices || 0) > 0 || state.pendingEscapeExileChoice ||
    state.pendingKickerChoice || state.pendingRampChoice || state.pendingSacrificeChoice !== null ||
    state.damageModalOpen || state.awaitingRivalDecision || state.respondingToDecision;

  const multiplayerInteractionBlocked = !!state.currentMatch && (state.multiplayerSyncBlocked || state.multiplayerSessionSuperseded);
  els.btnEndTurn.disabled = (multiplayerInteractionBlocked || !!state.multiplayerWaitingForReady || state.priorityPlayer !== 'local' || state.gameOver || state.isDiscarding || anyPendingChoice || (state.consecutivePasses || 0) >= 2);

  // 23.7.2: si el defensor no tiene NINGÚN bloqueador legal, declarar cero es
  // automático. No salteamos el paso: executeRivalAttack abre la ventana post-bloqueadores,
  // así instantáneos/habilidades antes del daño siguen existiendo.
  let autoZeroBlockersPending = false;
  if (!multiplayerInteractionBlocked && state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local' && (state.consecutivePasses || 0) === 1 && !state.localBlockersDeclaredThisCombat) {
    const attackers = state.rivalCombat.filter(attacker => attacker.isAttacking);
    const hasLegalBlocker = state.localCombat.some(defender => !defender.tapped && attackers.some(attacker => canBlock(attacker, defender)));
    autoZeroBlockersPending = !hasLegalBlocker;
    if (!hasLegalBlocker && !state.autoZeroBlockersQueued) {
      state.autoZeroBlockersQueued = true;
      queueMicrotask(() => {
        state.autoZeroBlockersQueued = false;
        if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local' && !state.localBlockersDeclaredThisCombat) {
          logMsg(gameText('combat.autoZeroBlockers'));
          executeRivalAttack();
        }
      });
    }
  }

  if (state.phase === 'combat_attackers' && state.activePlayer === 'local') {
    const attackersAlreadyDeclared = (state.localAttackersDeclaredThisTurn || 0) > 0;
    const isAttacking = state.localCombat.some(c => c.isAttacking);
    if (attackersAlreadyDeclared) {
      // 23.7.1: tras resolver triggers de ataque, seguimos en este paso pero la declaración
      // ya ocurrió. El botón pasa prioridad; jamás vuelve a declarar/disparar el mismo ataque.
      els.btnEndTurn.textContent = gameText('priority.button.pass');
      els.btnEndTurn.onclick = () => passPriority('local');
      els.btnEndTurn.style.backgroundColor = "";
    } else {
      els.btnEndTurn.textContent = isAttacking ? "Confirmar Ataque ⚔️" : "Saltar Ataque ➔";
      els.btnEndTurn.onclick = executeLocalAttack;
      els.btnEndTurn.style.backgroundColor = isAttacking ? "#e74c3c" : "#e67e22";
    }
  } else if (state.phase === 'combat_blockers' && state.activePlayer === 'rival') {
    if (state.localBlockersDeclaredThisCombat) {
      els.btnEndTurn.textContent = gameText('priority.button.pass');
      els.btnEndTurn.onclick = () => passPriority('local');
      els.btnEndTurn.style.backgroundColor = "";
    } else if (autoZeroBlockersPending) {
      els.btnEndTurn.textContent = gameText('priority.button.noBlockers');
      els.btnEndTurn.onclick = null;
      els.btnEndTurn.disabled = true;
      els.btnEndTurn.style.backgroundColor = "#3498db";
    } else {
      els.btnEndTurn.textContent = gameText('priority.button.confirmBlocks');
      els.btnEndTurn.onclick = executeRivalAttack;
      els.btnEndTurn.style.backgroundColor = "#3498db";
    }
  } else {
    els.btnEndTurn.textContent = gameText('priority.button.pass');
    els.btnEndTurn.onclick = () => passPriority('local');
    els.btnEndTurn.style.backgroundColor = ""; // Defecto
  }

  // El control principal nunca miente: si la prioridad no es nuestra, deja de parecer una
  // acción disponible. Con Stack profunda esto reemplaza el viejo botón verde ambiguo.
  if ((state.consecutivePasses || 0) >= 2) {
    els.btnEndTurn.textContent = spellStack.length > 0 ? "Resolviendo la pila…" : "Avanzando…";
    els.btnEndTurn.onclick = null;
    els.btnEndTurn.disabled = true;
    els.btnEndTurn.style.backgroundColor = "#665d39";
  } else if (state.priorityPlayer !== 'local' && !state.gameOver) {
    els.btnEndTurn.textContent = gameText('priority.button.waiting', { rival: getRivalName() });
    els.btnEndTurn.onclick = null;
    els.btnEndTurn.disabled = true;
    els.btnEndTurn.style.backgroundColor = "#34495e";
  }

  // --- GESTIÓN DE COSTOS PENDIENTES ---
  if (state.isDiscarding) els.localHand.classList.add('discard-warning');
  else els.localHand.classList.remove('discard-warning');

  if (state.pendingSuspendTransaction || state.pendingSpellIndex !== null || state.pendingCastTransaction?.stage === 'targets' || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay) {
    els.paymentControls.classList.remove('hidden'); els.btnEndTurn.classList.add('hidden'); 
    els.localHand.classList.add('paying-mode');
    if (!state.pendingCrew && !state.pendingWardChoice && !state.pendingCounterUnlessPay) {
      els.localLands.classList.add('paying-mode');
      els.localSupport.classList.add('paying-mode');
    }
    const castHandIndex = state.pendingCastTransaction?.handIndex;
    const visiblePendingIndex = state.pendingSpellIndex !== null ? state.pendingSpellIndex : (Number.isInteger(castHandIndex) ? castHandIndex : null);
    if (visiblePendingIndex !== null) {
      const pendingCardEl = els.localHand.children[visiblePendingIndex];
      if (pendingCardEl) pendingCardEl.classList.add('paying');
    }
    
    const pendingCard = state.pendingSuspendTransaction?.card || state.pendingCastTransaction?.card || (state.pendingSpellIndex !== null ? state.localHand[state.pendingSpellIndex] : null);
    let statusText;
    if (state.pendingSuspendTransaction) {
      statusText = `⏳ Suspendiendo ${state.pendingSuspendTransaction.card.name} — pagá ${state.pendingSuspendTransaction.spec.cost}`;
    } else if (state.pendingCrew) {
      statusText = gameText('payment.status.crew', { card: state.pendingCrew.item.card.name, power: state.pendingCrew.powerSoFar, required: state.pendingCrew.required });
    } else if (state.pendingWardChoice) {
      statusText = gameText('payment.status.ward', { card: state.pendingWardChoice.targetObj.item.card.name, cost: state.pendingWardChoice.wardCost });
    } else if (state.pendingCounterUnlessPay) {
      statusText = gameText('payment.status.counterTax', { card: state.pendingCounterUnlessPay.targetCardName, cost: `{${state.pendingCounterUnlessPay.amount}}` });
    } else if (state.pendingFightChoice) {
      statusText = gameText('payment.status.fight', { target: state.pendingFightChoice.opponentItem.card.name });
    } else {
      statusText = state.pendingCastTransaction?.stage === 'targets' ? gameText('payment.status.targets') : (state.pendingTargetCard ? gameText('payment.status.chooseTarget') : gameText('payment.status.missing'));
      if (!state.pendingTargetCard && state.pendingCastTransaction?.stage !== 'targets') {
        // Defensa de UI: nunca asumir que pendingCost existe sólo porque hay alguna acción
        // pendiente. Un cancel/interacción solapada no debe poder tirar todo el render.
        const pendingCost = state.pendingCost || { W:0, U:0, B:0, R:0, G:0, C:0, generic:0 };
        if (pendingCost.W > 0) statusText += gameText('payment.color.white', { amount: pendingCost.W });
        if (pendingCost.U > 0) statusText += gameText('payment.color.blue', { amount: pendingCost.U });
        if (pendingCost.B > 0) statusText += gameText('payment.color.black', { amount: pendingCost.B });
        if (pendingCost.R > 0) statusText += gameText('payment.color.red', { amount: pendingCost.R });
        if (pendingCost.G > 0) statusText += gameText('payment.color.green', { amount: pendingCost.G });
        if (pendingCost.C > 0) statusText += gameText('payment.color.colorless', { amount: pendingCost.C });
        if (Array.isArray(pendingCost.hybrid)) pendingCost.hybrid.forEach(symbol=>{ statusText += gameText('payment.color.hybrid',{symbol:`{${symbol.join('/')}}`}); });
        if (Array.isArray(pendingCost.phyrexian)) pendingCost.phyrexian.forEach(color=>{ statusText += gameText('payment.color.phyrexian',{symbol:`{${color}/P}`}); });
        if (pendingCost.generic > 0) statusText += gameText('payment.color.generic', { amount: pendingCost.generic });
        if (state.pendingAlternativeCostChosen && pendingCard?.alternativeCost) statusText += gameText('payment.altSuffix', { cost: describeCompositeCost(pendingCard.alternativeCost) });
      }
    }
    els.paymentStatus.textContent = statusText;

    // Punto 14: el costo alternativo puede combinar maná/vida/descarte/sacrificio/exilio.
    // Sólo se ofrece antes de comprometer una vía, nunca sobre Flashback/Escape, y sólo si
    // los componentes no-maná son legalmente pagables (el maná se elige manualmente después).
    const canOfferAlt = pendingCard && !state.pendingCastTransaction && pendingCard.alternativeCost && !state.pendingAlternativeCostChosen && !state.pendingCastFrom &&
      !state.pendingTargetCard && !state.pendingCrew && !state.pendingWardChoice && !state.pendingCounterUnlessPay &&
      !state.pendingCompositeCostPayment && canPayCastCompositeNonManaCosts(pendingCard, true, true, { excludeCard: pendingCard });
    if (canOfferAlt) {
      els.btnAltCost.classList.remove('hidden');
      els.btnAltCost.textContent = gameText('payment.button.alternative', { cost: describeCompositeCost(pendingCard.alternativeCost) });
    } else {
      els.btnAltCost.classList.add('hidden');
    }

    if (state.pendingWardChoice) {
      els.btnPayWard.classList.remove('hidden');
      els.btnPayWard.textContent = gameText('payment.button.ward', { cost: state.pendingWardChoice.wardCost });
    } else {
      els.btnPayWard.classList.add('hidden');
    }

    if (state.pendingCounterUnlessPay) {
      els.btnPayCounterTax.classList.remove('hidden');
      els.btnPayCounterTax.textContent = gameText('payment.button.counterTax', { cost: `{${state.pendingCounterUnlessPay.amount}}` });
    } else {
      els.btnPayCounterTax.classList.add('hidden');
    }

    if (state.pendingSuspendTransaction) {
      statusText = `⏳ Suspendiendo ${state.pendingSuspendTransaction.card.name} — pagá ${state.pendingSuspendTransaction.spec.cost}`;
    } else if (state.pendingCrew) {
      els.btnConfirmCrew.classList.remove('hidden');
      els.btnConfirmCrew.disabled = state.pendingCrew.powerSoFar < state.pendingCrew.required;
      els.btnConfirmCrew.textContent = gameText('payment.button.crew', {
        power: state.pendingCrew.powerSoFar,
        required: state.pendingCrew.required
      });
    } else {
      els.btnConfirmCrew.classList.add('hidden');
      els.btnConfirmCrew.disabled = false;
    }
  } else {
    els.paymentControls.classList.add('hidden'); els.btnEndTurn.classList.remove('hidden');
    els.localHand.classList.remove('paying-mode'); els.localLands.classList.remove('paying-mode'); els.localSupport.classList.remove('paying-mode');
  }
  renderStack();
  void runStateBasedActions({ reason:'render' });
  checkGameOver();

  // ENTREGA 22+: snapshot diagnóstico del estado estabilizado por este render.
  captureTelemetryState('render');

  // 23.13.54 — cada render Solo estabilizado es también un checkpoint reanudable.
  // El módulo ignora multiplayer/gameOver/elecciones transitorias y no toca reglas.
  checkpointSoloRecovery(state, spellStack, { telemetrySessionId: getTelemetryStatus().sessionId });

  // FASE 4, ETAPA 2: publica mi mitad del estado en Firestore después de CUALQUIER cambio
  // real al tablero — no se espera (render() es síncrona), y si no hay una partida
  // multiplayer activa no hace nada en absoluto (ver el guard adentro de la función).
  publishMatchState();
}

els.btnCancelSpell.addEventListener('click', cancelPayment);
els.btnAltCost.addEventListener('click', payWithAlternativeCost);
els.btnPayWard.addEventListener('click', payWard);
els.btnPayCounterTax.addEventListener('click', payCounterTax);
els.btnConfirmCrew.addEventListener('click', confirmCrew);

// ACTUALIZADO: Controles de teclado globales (Escape y Barra Espaciadora)
document.addEventListener('keydown', (e) => { 
  // Cancelar pagos pendientes
  if (e.key === 'Escape' && (state.pendingSuspendTransaction || state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew)) {
    cancelPayment(); 
  }

  // BUGFIX: la barra espaciadora es el atajo de "Pasar Turno", pero antes se activaba
  // SIEMPRE, sin importar dónde estuviera el foco — así que escribir un espacio en
  // CUALQUIER campo de texto de la página (ej. el "Motivo" del panel de Admin, o el nombre
  // de un mazo) quedaba bloqueado, porque el atajo llamaba a preventDefault() de todos
  // modos. Ahora se ignora por completo mientras el foco esté en un input/textarea/campo
  // editable — ahí la barra espaciadora tiene que escribir un espacio de verdad.
  const activeTag = document.activeElement && document.activeElement.tagName;
  const isTypingInField = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);

  // Pasar prioridad / Avanzar turno con la barra espaciadora
  if (e.code === 'Space' && !isTypingInField) {
    e.preventDefault(); // Evitamos scroll y también el click nativo del botón enfocado.
    e.stopPropagation();
    // Una pulsación física = una sola acción. Mantener la barra apretada no vuelve a
    // disparar prioridad ni genera cientos de eventos diagnósticos.
    if (e.repeat) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    if (!els.btnEndTurn.disabled && !els.btnEndTurn.classList.contains('hidden')) {
      els.btnEndTurn.click();
    }
  }
});

let resizeTimeout = null; 
window.addEventListener('resize', () => { 
  clearTimeout(resizeTimeout); 
  resizeTimeout = setTimeout(sizeAllRows, 120); 
});

// --- PANEL MANUAL DE ASIGNACIÓN DE DAÑO (INTACTO) ---
export function showDamageAssignmentModal(attackerItem, blockersArray, totalDamage, onAuto, onConfirmManual) {
  if (HEADLESS_ENGINE) { onAuto?.(); return; }
  const overlay = document.getElementById('damage-modal-overlay');
  const content = document.getElementById('damage-modal-content');
  const btnAuto = document.getElementById('btn-dmg-auto');
  const btnManual = document.getElementById('btn-dmg-manual');
  const confirmContainer = document.getElementById('damage-modal-confirm-container');
  const btnConfirm = document.getElementById('btn-dmg-confirm');
  const initialButtons = document.getElementById('damage-modal-initial-buttons');

  const attacker = attackerItem.card;
  const canTrample = hasKeyword(attackerItem, 'trample');
  const attackerHasDeathtouch = hasKeyword(attackerItem, 'deathtouch');

  // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #14): el modal decía "Arrollar al Tano" siempre,
  // sin importar que el ataque estuviera redirigido a un Planeswalker (attackerItem.attackTarget)
  // — los mensajes de log del resto del motor (combatRules.js) ya distinguían esto bien, pero
  // acá, en el ÚNICO lugar donde el jugador decide la distribución, se quedaba desactualizado.
  const trampleTargetName = attackerItem.attackTarget ? attackerItem.attackTarget.card.name : getRivalName();
  const trampleLabel = `a ${trampleTargetName}`;

  function lethalNeeded(bItem) {
    const remaining = Math.max(0, bItem.card.toughness - (bItem.damageTaken || 0));
    if (remaining === 0) return 0;
    return attackerHasDeathtouch ? 1 : remaining;
  }

  let currentDistribution = blockersArray.map(() => 0);
  let unassigned = totalDamage;

  content.innerHTML = `
    <p style="margin-bottom: 1.2rem; font-size: 1.1rem; color: #eee;">
      ${gameTextHtml('damage.modal.intro', { card: attacker.name, power: totalDamage })}<br>
      <span style="font-size: 0.85rem; color: #aaa;">${gameTextHtml('damage.modal.question')}</span>
    </p>`;
  
  initialButtons.classList.remove('hidden');
  confirmContainer.classList.add('hidden');
  if (btnAuto) btnAuto.textContent = gameText('damage.modal.auto');
  if (btnManual) btnManual.textContent = gameText('damage.modal.manual');
  overlay.classList.remove('hidden');
  state.damageModalOpen = true; 

  btnAuto.onclick = () => {
    overlay.classList.add('hidden');
    state.damageModalOpen = false;
    onAuto();
  };

  btnManual.onclick = () => {
    initialButtons.classList.add('hidden');
    confirmContainer.classList.remove('hidden');
    renderManualUI();
  };

  function renderManualUI() {
    let html = `<div style="margin-bottom: 15px; font-size: 1rem;">${gameTextHtml('damage.modal.remaining', { damage: unassigned }).replace(String(unassigned), `<strong id="dmg-unassigned" style="color: var(--gold); font-size: 1.6rem;">${unassigned}</strong>`)}</div>`;

    blockersArray.forEach((bItem, idx) => {
       const hp = bItem.card.toughness - (bItem.damageTaken || 0);
       const needed = lethalNeeded(bItem);
       const met = currentDistribution[idx] >= needed;
       html += `
         <div class="damage-row">
           <div style="text-align: left; line-height: 1.2;">
             <strong style="font-size: 1.1rem;">${bItem.card.name}</strong><br>
             <span style="font-size: 0.8rem; color: ${met ? '#7ed6a5' : '#e67e22'};">
               ${gameTextHtml('damage.modal.toughness', { toughness: hp })} ${needed > 0 ? gameTextHtml('damage.modal.lethal', { lethal: needed }) : gameTextHtml('damage.modal.noMore')}
             </span>
           </div>
           <div class="damage-controls">
             <button class="btn-arrow" data-idx="${idx}" data-action="minus">-</button>
             <span class="damage-value" id="val-blocker-${idx}">${currentDistribution[idx]}</span>
             <button class="btn-arrow" data-idx="${idx}" data-action="plus">+</button>
           </div>
         </div>
       `;
    });

    if (canTrample) {
      const allLethalMet = blockersArray.every((b, i) => currentDistribution[i] >= lethalNeeded(b));
      const overflow = allLethalMet ? unassigned : 0;
      const overflowNoun = attackerItem.attackTarget ? 'Lealtad' : 'HP';
      html += `
         <div class="damage-row trample-row">
           <div style="text-align: left;">
             <strong style="font-size: 1.1rem;">${gameTextHtml('damage.modal.trample', { target: trampleLabel })}</strong><br>
             <span style="font-size: 0.8rem; color: #aaa;">
               ${allLethalMet ? gameTextHtml('damage.modal.trampleAuto', { resource: overflowNoun }) : gameTextHtml('damage.modal.trampleNeedLethal')}
             </span>
           </div>
           <div class="damage-controls">
             <span class="damage-value" id="val-player">${overflow}</span>
           </div>
         </div>
      `;
    }

    content.innerHTML = html;

    content.querySelectorAll('.btn-arrow').forEach(btn => {
       btn.onclick = (e) => {
          const idx = e.target.getAttribute('data-idx');
          const action = e.target.getAttribute('data-action');
          handleDamageChange(idx, action);
       };
    });

    updateConfirmButton();
  }

  function handleDamageChange(idx, action) {
    const i = parseInt(idx);
    let currentValue = currentDistribution[i];

    if (action === 'plus' && unassigned > 0) {
      currentValue++;
      unassigned--;
    } else if (action === 'minus' && currentValue > 0) {
      currentValue--;
      unassigned++;
    } else return;

    currentDistribution[i] = currentValue;
    renderManualUI(); 
  }

  function updateConfirmButton() {
    const allLethalMet = blockersArray.every((b, i) => currentDistribution[i] >= lethalNeeded(b));

    let canConfirm;
    if (unassigned === 0) canConfirm = true;
    else if (canTrample && allLethalMet) canConfirm = true;
    else canConfirm = false;

    btnConfirm.disabled = !canConfirm;
    btnConfirm.style.opacity = canConfirm ? '1' : '0.5';

    if (canConfirm) btnConfirm.textContent = gameText('damage.modal.confirm');
    else if (!allLethalMet) btnConfirm.textContent = gameText('damage.modal.needLethal');
    else btnConfirm.textContent = gameText('damage.modal.needAll');
  }

  btnConfirm.onclick = () => {
    const allLethalMet = blockersArray.every((b, i) => currentDistribution[i] >= lethalNeeded(b));
    if (unassigned > 0 && !(canTrample && allLethalMet)) return;

    const overflowToPlayer = canTrample ? unassigned : 0;
    overlay.classList.add('hidden');
    state.damageModalOpen = false;
    onConfirmManual(currentDistribution, overflowToPlayer);
  };
}

// ENTREGA 23.7.2 — overlay bloqueante entre mulligan local y comienzo REAL de la partida.
// No reemplaza el lobby: evita que el jugador que terminó primero pueda bajar tierra/pasar
// prioridad mientras el otro todavía está eligiendo mazo o mulligan.
export function showMultiplayerReadyBarrier(rivalName, localReady = true, rivalReady = false) {
  let overlay = document.getElementById('multiplayer-ready-barrier');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'multiplayer-ready-barrier';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147482500;background:rgba(5,9,7,.82);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div class="mp-ready-card" style="min-width:min(520px,86vw);max-width:720px;padding:26px 30px;border:2px solid var(--gold,#d4af37);border-radius:16px;background:linear-gradient(180deg,rgba(18,25,15,.98),rgba(8,14,10,.98));box-shadow:0 14px 50px rgba(0,0,0,.6);text-align:center;color:#f0e0b0;font-family:system-ui,sans-serif"><div style="font-size:30px;margin-bottom:8px">⏳</div><div id="mp-ready-title" style="font-size:22px;font-weight:800;letter-spacing:.5px"></div><div id="mp-ready-detail" style="margin-top:10px;color:#cfe0d4;font-size:14px"></div></div>';
    document.body.appendChild(overlay);
  }
  const safeName = rivalName || 'tu rival';
  const title = overlay.querySelector('#mp-ready-title');
  const detail = overlay.querySelector('#mp-ready-detail');
  if (title) title.textContent = rivalReady ? gameText('multiplayer.ready.both') : gameText('multiplayer.ready.waiting', { rival: safeName });
  if (detail) detail.textContent = rivalReady
    ? gameText('multiplayer.ready.sync')
    : (localReady ? gameText('multiplayer.ready.localDone') : gameText('multiplayer.ready.preparing'));
  overlay.classList.remove('hidden');
}

export function hideMultiplayerReadyBarrier() {
  const overlay = document.getElementById('multiplayer-ready-barrier');
  if (overlay) overlay.remove();
}

// 23.19.1 — barrera FAIL-CLOSED para una partición de red local o una sesión duplicada.
// No modifica el state del juego: sólo impide input humano mientras main.js intenta volver
// a confirmar el snapshot. En HEADLESS no existe interacción humana que bloquear.
export function showMultiplayerSyncBarrier(kind = 'reconnecting') {
  if (HEADLESS_ENGINE || typeof document === 'undefined') return;
  let overlay = document.getElementById('multiplayer-sync-barrier');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'multiplayer-sync-barrier';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(4,7,6,.88);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;pointer-events:auto;';
    overlay.innerHTML = '<div style="min-width:min(520px,86vw);max-width:720px;padding:26px 30px;border:2px solid var(--gold,#d4af37);border-radius:16px;background:linear-gradient(180deg,rgba(18,25,15,.99),rgba(8,14,10,.99));box-shadow:0 14px 50px rgba(0,0,0,.68);text-align:center;color:#f0e0b0;font-family:system-ui,sans-serif"><div id="mp-sync-icon" style="font-size:30px;margin-bottom:8px">🔄</div><div id="mp-sync-title" style="font-size:22px;font-weight:800;letter-spacing:.4px"></div><div id="mp-sync-detail" style="margin-top:10px;color:#cfe0d4;font-size:14px;line-height:1.5"></div></div>';
    document.body.appendChild(overlay);
  }
  const icon = overlay.querySelector('#mp-sync-icon');
  const title = overlay.querySelector('#mp-sync-title');
  const detail = overlay.querySelector('#mp-sync-detail');
  const superseded = kind === 'session_superseded';
  if (icon) icon.textContent = superseded ? '🔒' : '🔄';
  if (title) title.textContent = superseded ? gameText('multiplayer.session.superseded') : gameText('multiplayer.sync.reconnecting');
  if (detail) detail.textContent = superseded ? gameText('multiplayer.session.supersededDetail') : gameText('multiplayer.sync.reconnectingDetail');
  overlay.dataset.kind = kind;
}

export function hideMultiplayerSyncBarrier() {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('multiplayer-sync-barrier');
  if (overlay) overlay.remove();
}


// 23.15.1 — Regla de Leyenda: decisión sin prioridad.
export function showLegendRuleChoiceModal(entries = [], cardName = 'Permanente legendario') {
  if (HEADLESS_ENGINE) return Promise.resolve(headlessChoice.chooseLegendEntry(entries));
  return new Promise(resolve => {
    const overlay=document.createElement('div'); overlay.className='gy-modal-overlay';
    overlay.innerHTML=`<div class="gy-modal-content"><div class="gy-modal-header"><h3>${gameTextHtml('sba.legend.title')}</h3></div><div style="margin:8px 0 14px">${gameTextHtml('sba.legend.subtitle',{card:cardName})}</div><div class="legend-choice-grid"></div></div>`;
    document.body.appendChild(overlay); const grid=overlay.querySelector('.legend-choice-grid');
    entries.forEach((entry,index)=>{ const btn=document.createElement('button'); btn.className='mulligan-btn'; btn.textContent=gameText('sba.legend.confirm',{card:entry.card?.name||cardName}); btn.onclick=()=>{overlay.remove();resolve(entry)}; grid.appendChild(btn); });
  });
}

// UI expresa orden de RESOLUCIÓN (arriba resuelve primero); triggerOrdering.js lo convierte a LIFO.
const TRIGGER_ORDER_LABELS = Object.freeze({
  etb:'entrada al campo', creature_etb:'entrada de criatura', land_etb:'Landfall', spell_cast:'hechizo lanzado',
  dies:'al morir', any_creature_dies:'muerte de criatura', opponent_death:'muerte rival', attack:'al atacar',
  any_creature_attacks:'ataque', block:'al bloquear', combat_damage:'daño de combate', upkeep:'mantenimiento',
  end_step:'paso final', permanent_entered:'entrada de permanente', creature_entered:'entrada de criatura',
  land_entered:'entrada de Tierra', creature_died:'muerte de criatura', spell_cast_generic:'hechizo lanzado',
  attack_declared:'ataque declarado', block_declared:'bloqueo declarado', combat_damage_dealt:'daño de combate',
  card_drawn:'robo de carta', card_discarded:'descarte', permanent_sacrificed:'sacrificio', life_gained:'vida ganada',
  life_lost:'vida perdida', counter_added:'contador agregado', counter_removed:'contador removido', token_created:'ficha creada',
  permanent_tapped:'permanente girado', spell_countered:'hechizo contrarrestado', spell_copied:'hechizo copiado',
  ability_copied:'habilidad copiada', permanent_became_copy:'permanente copiado', permanent_transformed:'transformación',
  saga_chapter:'capítulo de Saga', suspend_tick:'Suspend — Tiempo', suspend_cast:'Suspend — último Tiempo'
});

function triggerOrderEffectSummary(effect = {}) {
  const labels = {
    draw:'Robá', heal:'Ganás vida', damage:'Hacé daño', drain:'Drená vida', fight:'Peleá', ramp:'Buscá una Tierra',
    create_tokens:'Creá fichas', discard:'Descartá', sacrifice:'Sacrificá', reanimate:'Reanimá', search_land:'Buscá una Tierra',
    search_library:'Buscá en tu biblioteca', look_at_top:'Mirá la parte superior', scry:'Adiviná', surveil:'Vigilá', proliferate:'Proliferá'
  };
  const base = labels[effect?.type] || String(effect?.type || 'Habilidad disparada').replaceAll('_',' ');
  const amount = effect?.amount !== undefined ? ` ${effect.amount}` : '';
  return `${base}${amount}`.trim();
}

function triggerOrderDescription(entry = {}) {
  const text = String(entry.sourceCard?.text || '').trim();
  if (text) {
    const pieces = text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
    const matcher = {
      any_creature_dies: /muera una criatura|criatura[^.]*muera/i,
      dies: /cuando[^.]*muera|al morir/i,
      attack: /siempre que[^.]*ataque|cuando[^.]*ataque/i,
      block: /siempre que[^.]*bloquee|cuando[^.]*bloquee/i,
      upkeep: /mantenimiento/i,
      end_step: /paso final|final de tu turno/i,
      etb: /entre al campo|entra al campo/i,
      creature_etb: /criatura[^.]*entre al campo|criatura[^.]*entra al campo/i
    }[entry.triggerType];
    const matched = matcher ? pieces.find(piece=>matcher.test(piece)) : null;
    const chosen = matched || pieces[0] || text;
    return chosen.length > 220 ? `${chosen.slice(0,217)}…` : chosen;
  }
  const label = TRIGGER_ORDER_LABELS[entry.triggerType] || String(entry.triggerType || 'habilidad').replaceAll('_',' ');
  return `${label} — ${triggerOrderEffectSummary(entry.effect)}`;
}

function triggerOrderEventSummary(entry = {}) {
  if (!entry.eventCard?.name) return '';
  const role = entry.eventCard?._ownerRole || null;
  const myRole = state.currentMatch?.myRole || null;
  const own = myRole === 'host' || myRole === 'guest'
    ? role === myRole
    : role === 'local';
  const rival = myRole === 'host' || myRole === 'guest'
    ? (role === 'host' || role === 'guest') && role !== myRole
    : role === 'rival';
  const key = own ? 'trigger.order.eventOwn' : (rival ? 'trigger.order.eventRival' : 'trigger.order.event');
  return gameText(key, { event: entry.eventCard.name });
}

export function showTriggerOrderModal(entries = []) {
  if (HEADLESS_ENGINE) return Promise.resolve(headlessChoice.chooseTriggerOrder(entries));
  return new Promise(resolve => {
    if(entries.length<=1){resolve(entries);return;}
    const ordered=[...entries];
    const overlay=document.createElement('div');
    overlay.className='gy-modal-overlay trigger-order-overlay';
    overlay.innerHTML=`<div class="gy-modal-content trigger-order-modal"><div class="gy-modal-header"><h3>${gameTextHtml('trigger.order.title')}</h3></div><div class="trigger-order-subtitle">${gameTextHtml('trigger.order.subtitle')}</div><div class="trigger-order-list"></div><button class="mulligan-btn mulligan-btn-keep trigger-order-confirm">${gameTextHtml('trigger.order.confirm')}</button></div>`;
    document.body.appendChild(overlay);
    const list=overlay.querySelector('.trigger-order-list');
    const draw=()=>{
      list.innerHTML='';
      ordered.forEach((entry,i)=>{
        const row=document.createElement('div');
        row.className='trigger-order-row';
        const eventSummary=triggerOrderEventSummary(entry);
        row.innerHTML=`
          <div class="trigger-order-rank">${i+1}</div>
          <div class="trigger-order-copy">
            <div class="trigger-order-source">${escapeHtml(entry.sourceCard?.name||'Habilidad')}</div>
            <div class="trigger-order-description">${escapeHtml(triggerOrderDescription(entry))}</div>
            ${eventSummary ? `<div class="trigger-order-event">${escapeHtml(eventSummary)}</div>` : ''}
          </div>
          <div class="trigger-order-controls">
            <button type="button" class="trigger-order-arrow" data-up="${i}" aria-label="${escapeHtml(gameText('trigger.order.upAria'))}" title="${escapeHtml(gameText('trigger.order.up'))}" ${i===0?'disabled':''}>↑</button>
            <button type="button" class="trigger-order-arrow" data-down="${i}" aria-label="${escapeHtml(gameText('trigger.order.downAria'))}" title="${escapeHtml(gameText('trigger.order.down'))}" ${i===ordered.length-1?'disabled':''}>↓</button>
          </div>`;
        list.appendChild(row);
      });
      list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;if(i>0){[ordered[i-1],ordered[i]]=[ordered[i],ordered[i-1]];draw();}});
      list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.down;if(i<ordered.length-1){[ordered[i+1],ordered[i]]=[ordered[i],ordered[i+1]];draw();}});
    };
    draw();
    overlay.querySelector('.trigger-order-confirm').onclick=()=>{overlay.remove();resolve(ordered);};
  });
}
