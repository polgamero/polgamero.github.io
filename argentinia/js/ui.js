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
import { isSacrificeCandidate, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming, describeCompositeCost } from './utils.js';
import { signInWithGoogle, signOutUser, purchasePack, loadUserProfileFromServer, recordChestAuthorityStatsBestEffort, fetchStorefrontAuthority, openPackAuthorityServer, openGuaranteedMythicAuthorityServer, recoverEconomyOperationServer, claimDailyReward, craftEnhancement, unlockWorkshopMachine, claimAchievement, acknowledgeAchievementNotice, convertEssence, evolveCard, mixCards, bootstrapPlayerStatistics, deleteUserProfile, renameUsername, createDeck, updateDeck, deleteDeck, saveGameConfig, loadPublicGameConfigDocument, saveAdminGameConfigDocument, loadGameTextOverrides, saveGameTextOverrides, ensureClassifiedsSchedule, fetchCurrentClassifieds, purchaseClassifiedCard, purchaseClassifiedBasicLandPack, purchasePrebuiltDeck, purchaseEmote, adminSetEmoteCatalog, createMatch, joinMatchByCode, listenToMatch, cancelMatch, listenToPlayerPresence, listenToActiveMultiplayerMatches, listenToLobbyCommunication, sendLobbyCommunication, deleteLobbyCommunication, createDirectChallenge, resolveDirectChallenge, fetchAllUserProfiles, adminGrantCurrency, adminGrantCurrencyToAll, adminGrantPacks, adminGrantPacksToAll, adminAdvanceDailyRewardDebugDay, adminResetDailyRewardDebug, registerDailyLogin, getAdmissionStatus, adminSetAdmissionPolicy, fetchAnnouncements, fetchCampaignSnapshot, fetchTelemetrySessionsForAdmin, fetchGameRewardAuditForAdmin, fetchEconomyAuditForAdmin, fetchEconomyMovementsForAdmin, adminRepairSoloGameReward, fetchTelemetrySessionArchive, adminCloseStaleTelemetrySessions, fetchPublicPlayerStats, adminSyncPublicPlayerStats, saveAnimationPolicy, getTournamentState, startTournament, settleTournamentMatch, abandonTournament, getTradeMarket, createTradeListing, cancelTradeListing, createTradeOffer, cancelTradeOffer, rejectTradeOffer, acceptTradeOffer, getCommunityStatus, contactModeration, reportCommunityUser, reportLobbyMessage, getMyModerationCases, acknowledgeModerationCase, acknowledgeTradeNotification, createTradeDispute, adminGetCommunityDashboard, adminSetCommunityBlockedWords, adminBanCommunityUser, adminUnbanCommunityUser, adminResolveCommunityCase, refreshLobbyDirectoryAuthority, adminSetCommunityBots } from './firebaseClient.js';
import { PACK_COST, FICHAS_PER_ENHANCEMENT, ENHANCEMENT_KEYWORDS, DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, MAX_EVOLVED_CARDS_PER_DECK, ENHANCED_SUFFIX, POINTS, MYTHIC_CHANCE_IN_RARE_SLOT, CLASSIFIEDS_COMMON_POINTS, CLASSIFIEDS_COMMON_FICHAS, CLASSIFIEDS_UNCOMMON_POINTS, CLASSIFIEDS_UNCOMMON_FICHAS, CLASSIFIEDS_RARE_POINTS, CLASSIFIEDS_RARE_FICHAS, CLASSIFIEDS_MYTHIC_POINTS, CLASSIFIEDS_MYTHIC_FICHAS, CLASSIFIEDS_MYTHIC_CHANCE, CLASSIFIEDS_BASIC_LAND_PACK_PRICE, CLASSIFIEDS_BASIC_LAND_PACK_QUANTITY, PVP_LIMITS, PREBUILT_DECK_POINTS, PREBUILT_DECK_FICHAS, MAX_SAVED_DECKS, TRADE_MAX_ACTIVE_LISTINGS, TRADE_MAX_WANTED_CRITERIA, TRADE_MAX_OFFERS_PER_LISTING, TRADE_MAX_OUTGOING_OFFERS, TRADE_MAX_COMPLETED_PER_WEEK, WORKSHOP_POLICY, applyGameConfig, getDefaultGameConfig, isEnhancementEligibleCard, reconcileDeckEnhancementSlots } from './store.js';
import { TOURNAMENT_POLICY, applyTournamentConfig } from './tournamentConfig.js';
import { canBlock, hasKeyword, getProtectionMatch } from './keywords.js';
import { ALL_COLORS, GUILD_PAIRS } from './utils.js';
import { recordTelemetryUiLog, captureTelemetryState, getTelemetryStatus } from './telemetry.js';
import { checkpointSoloRecovery } from './soloRecovery.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, ENGINE_VERSION_SHORT } from './version.js';
import { withEconomyButtonPending, ensureEconomyPendingStyles } from './economyPending.js';
import { getPriorityUxCopy, getEffectivePriorityActivity, canPriorityClockRun, PRIORITY_CLOCK_DURATION_MS } from './priorityUX.js';
import { DAILY_REWARD_SCHEDULE, normalizeInventory, normalizeDailyRewardsState, unclaimedUnlockedDays, CHEST_ITEM_KEYS, rewardForDay } from './rewards.js';
import { showPackOpeningExperience, showGuaranteedMythicExperience } from './packOpening.js';
import { beginEconomyReveal, getPendingEconomyReveal, clearPendingEconomyReveal, createEconomyRevealOperationId } from './economyRevealRecovery.js';
import { applyCardZoom } from './cardZoom.js';
import { announcePhaseTransition } from './phaseBanner.js';
import { readTournamentPendingSettlement, clearTournamentPendingSettlement, clearTournamentActiveMatch, clearTournamentRecoveryMarkers, tournamentRecoveryMatchesActive } from './tournamentRecovery.js';
import { buildDeckComposition, formatManaValue } from './deckComposition.js';
import { buildDeckStatistics, analyzeDeckHealth, simulateOpeningHands } from './deckStatistics.js';
import { getCardBrowserSortOptions, normalizeCardBrowserSort, compareCardsForBrowser } from './cardBrowser.js';
import { registerCardArtImage, hasCustomArtLayout, ensureArtLayoutsLoaded } from './artLayout.js';
import { openArtLayoutEditor } from './artLayoutEditor.js';
import { registerCardTextBox, hasCustomCardTextLayout, ensureCardTextLayoutsLoaded } from './textLayout.js';
import { openCardTextLayoutEditor } from './textLayoutEditor.js';
import { saveCardCatalogOverride } from './cardPublication.js';
import { ARCHETYPE_IDS, inferCardDeckProfile, getArchetypeDefinition } from './deckIntelligence.js';
import { USERNAME_RENAME_COST } from './usernames.js';
import { showUsernameRenameModal } from './usernameUI.js';
import { classifiedsNextRotationAt, getClassifiedsProfileState, getClassifiedsBasicLandPackProfileState, countOwnedClassifiedCard } from './classifieds.js';
import { loadPrebuiltDeckCatalog, summarizePrebuiltDeck, getPrebuiltPurchaseIds } from './prebuiltDecks.js';
import { gameText } from './gameTexts.js';
import { WORKSHOP_MACHINE_IDS, normalizeWorkshopLayout, normalizeWorkshopProfile, isWorkshopMachineUnlocked, workshopMachineAsset } from './workshop.js';
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ICONS, achievementId, achievementTrophyPath, normalizeAchievementsConfig, normalizeAchievementProfile, achievementMetricValue } from './achievements.js';
import { EVOLUTION_PATHS, normalizeEvolutionProfile, evolutionStageForProfile, evolutionVariantId, parseEvolutionVariantId, applyEvolutionStage, isEvolutionEligibleCard, isEvolutionStageDiscovered } from './evolution.js';
import { createGameTextsAdminPane } from './gameTextsAdmin.js';
import { showGlobalRanking } from './rankingUI.js';
import { showPublicPlayerProfile, configurePublicProfileUI } from './publicProfileUI.js';
import { prepareGameManualUI, showGameManual } from './manualUI.js';
import { summarizeGlobalTelemetry, summarizeProfiles, formatDuration, winRate, telemetryDurationMs, telemetryOutcome } from './statistics.js';
import { buildCardTextLayout, buildLoyaltyAbilityDisplay } from './cardTextFormatter.js';
import { publicKeywordLabel, publicCardTypeLine, publicTerminologyText } from './publicTerminology.js';
import { MANA_ICON_URLS, manaIconKeyForSymbol } from './manaSymbolCatalog.js';
import { EMOTE_CATALOG, getEmoteDefinition, normalizeOwnedEmoteIds, emoteAssetCandidates, applyEmoteCatalogSnapshot } from './emoteCatalog.js';
import { mountAdminEmotesPane } from './emotesAdmin.js';
import { POOL_BASELINE } from './poolContract.js';
import { effectivePackCost, campaignStatus } from './campaigns.js';
import { mountAdminCampaignsPane, renderActiveEventsStrip } from './campaignsUI.js';
import { scheduleCombatMapRender } from './combatMap.js';
import { buildTokenCatalog, tokenArtLayoutId } from './tokenCatalog.js';
import { enterMenuAudio, getAudioSettings, setMusicEnabled, setMusicVolume, setSfxEnabled, setSfxVolume } from './audioManager.js';
import { setPlayerPresenceActivity, isPresenceOnline, isPresenceAvailable, describePresenceActivity, presenceTimestampMs, getChallengeInvitesEnabled, setChallengeInvitesEnabled } from './multiplayerPresence.js';
import { getAnimationSettings, getServerAnimationPolicy, getAnimationTuningCatalog, normalizeAnimationTunings, setAnimationsEnabled, cycleAnimationSpeed, animationSpeedLabel, applyServerAnimationPolicy, mountAnimationLab, clearAnimationLayer, ensureAnimationVisualIdentity, queueWorkshopEnhancementAnimation, queueWorkshopEvolutionAnimation, queueWorkshopMixerAnimation, queueWorkshopUnlockAnimation } from './animationDirector.js';
import { MANA_TYPES, manaPoolTotal } from './manaPool.js';
import { isLandPermanent, isCreaturePermanent, landMatchesFilter } from './permanentTypes.js';
import { landMatchesEffectiveFilter, getEffectiveLandTypeLine, getEffectiveLandActivatedAbilities, describeLandTransformation } from './landCharacteristics.js';
import { isSagaCard, sagaUiState } from './sagaEngine.js';
import { botDifficultyLabel, nextBotDifficulty, normalizeBotDifficulty } from './botDifficulty.js';
import * as headlessChoice from './headlessChoiceEngine.js';

const HEADLESS_ENGINE = globalThis.__ARGENTINIA_HEADLESS_ENGINE__ === true;

configurePublicProfileUI({
  getCurrentUid:()=>String(state.currentUser?.uid||''),
  getOwnedCardIds:()=>Array.isArray(state.userProfile?.collection)?state.userProfile.collection:[],
  getEnhancements:()=>state.userProfile?.enhancements&&typeof state.userProfile.enhancements==='object'?state.userProfile.enhancements:{},
  getEvolutions:()=>state.userProfile?.evolutions&&typeof state.userProfile.evolutions==='object'?state.userProfile.evolutions:{},
  renderCard:card=>createCardElement(card,false,true,null,'encyclopedia',null),
  onFavoriteChanged:cardId=>{ if(state.userProfile) state.userProfile={...state.userProfile,favoriteCardId:String(cardId||'')}; },
  openRename:onUpdated=>openCurrentUserRename({onUpdated})
});

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

export function teardownBoardLayout({ clearGameplay = false } = {}) {
  const restoreWrapper = (wrapperId, combatId, placeBeforeCombat) => {
    const wrapper = document.getElementById(wrapperId);
    const combat = document.getElementById(combatId);
    const fieldZone = combat?.closest?.('.field-zone-container') || wrapper?.closest?.('.field-zone-container');
    if (!wrapper || !fieldZone) return;

    // RC5.2 — setupBoardLayout used to wrap the same lands/support wrapper on every new
    // match. A soft return (no reload) therefore accumulated MAZO/CEMENTERIO/EXILIO DOM.
    // Move the canonical wrapper back to its original field-zone first, then remove every
    // generated row shell left by any previous match. This also repairs already-duplicated
    // sessions without requiring a page reload.
    if (placeBeforeCombat && combat) fieldZone.insertBefore(wrapper, combat);
    else fieldZone.appendChild(wrapper);
    fieldZone.querySelectorAll('.zone-row-container').forEach(node => node.remove());
  };

  restoreWrapper('rival-wrapper', 'rival-combat', true);
  restoreWrapper('local-wrapper', 'local-combat', false);

  els.rivalDeckPile = null;
  els.rivalGYPile = null;
  els.rivalExilePile = null;
  els.localDeckPile = null;
  els.localGYPile = null;
  els.localExilePile = null;

  if (clearGameplay) {
    [els.localHand, els.rivalHand, els.localLands, els.rivalLands, els.localCombat, els.rivalCombat,
      els.localSupport, els.rivalSupport, els.localPlaneswalkers, els.rivalPlaneswalkers]
      .filter(Boolean).forEach(node => { node.replaceChildren(); node.classList.remove('paying-mode'); });
    try { els.gameLogBox?.replaceChildren?.(); } catch {}
    document.querySelectorAll('#stack-container .stack-item,.mp-emote-burst,.floating-damage-number,.combat-arrow-layer').forEach(node => node.remove());
  }
}

export function setupBoardLayout() {
  // Idempotent by construction: normalize any previous match shell before generating one.
  teardownBoardLayout({ clearGameplay: false });
  const rivalWrapper = document.getElementById('rival-wrapper');
  const localWrapper = document.getElementById('local-wrapper');

  const rivalRowContainer = document.createElement('div');
  rivalRowContainer.className = 'zone-row-container';
  rivalRowContainer.dataset.boardSide = 'rival';
  rivalWrapper.parentNode.insertBefore(rivalRowContainer, rivalWrapper);

  els.rivalDeckPile = createPileElement('MAZO');
  els.rivalDeckPile.dataset.animationZone = 'library'; els.rivalDeckPile.dataset.animationSide = 'rival';
  els.rivalGYPile = createPileElement('CEMENTERIO');
  els.rivalGYPile.dataset.animationZone = 'graveyard'; els.rivalGYPile.dataset.animationSide = 'rival';
  els.rivalGYPile.addEventListener('click', () => openGraveyardModal(false));
  els.rivalExilePile = createPileElement('EXILIO');
  els.rivalExilePile.dataset.animationZone = 'exile'; els.rivalExilePile.dataset.animationSide = 'rival';
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
  localRowContainer.dataset.boardSide = 'local';
  localWrapper.parentNode.insertBefore(localRowContainer, localWrapper);

  els.localDeckPile = createPileElement('MAZO');
  els.localDeckPile.dataset.animationZone = 'library'; els.localDeckPile.dataset.animationSide = 'local';
  els.localGYPile = createPileElement('CEMENTERIO');
  els.localGYPile.dataset.animationZone = 'graveyard'; els.localGYPile.dataset.animationSide = 'local';
  els.localGYPile.addEventListener('click', () => openGraveyardModal(true));
  els.localExilePile = createPileElement('EXILIO');
  els.localExilePile.dataset.animationZone = 'exile'; els.localExilePile.dataset.animationSide = 'local';
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

// Menú de habilidades de Creencia de un Planeswalker: se abre al clickear el tuyo propio.
// Cada botón muestra el costo (+N/-N/0) y el texto de la habilidad; se deshabilita solo si
// ya usó su habilidad este turno, o si el costo es negativo y no tiene Creencia suficiente
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


export function showWardDecisionModal(amount, targetCardName, sourceCardName, onPay, onDecline) {
  if (HEADLESS_ENGINE) { headlessChoice.chooseCounterTax()==='pay' ? onPay?.() : onDecline?.(); return; }
  injectMulliganStyles();
  const modalOverlay=document.createElement('div');
  modalOverlay.className='gy-modal-overlay';
  modalOverlay.innerHTML=`
    <div class="gy-modal-content" style="max-width: 420px;">
      <div class="gy-modal-header"><h3>${gameTextHtml('modal.ward.title')}</h3></div>
      <div style="padding:20px;text-align:center;">
        <p style="color:#cfe0d4;font-size:14px;margin-bottom:18px;">${gameTextManaHtml('modal.ward.description',{source:sourceCardName || 'hechizo o habilidad',target:targetCardName || 'permanente',cost:`{${amount}}`})}</p>
        <div class="mulligan-buttons">
          <button id="ward-decline" class="mulligan-btn mulligan-btn-mull">${gameTextHtml('modal.ward.decline')}</button>
          <button id="ward-pay" class="mulligan-btn mulligan-btn-keep">${gameTextManaHtml('modal.ward.pay',{cost:`{${amount}}`})}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modalOverlay);
  modalOverlay.querySelector('#ward-pay').addEventListener('click',()=>{modalOverlay.remove();onPay?.();});
  modalOverlay.querySelector('#ward-decline').addEventListener('click',()=>{modalOverlay.remove();onDecline?.();});
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

// Yapa: costo ADICIONAL y OPCIONAL — a diferencia de un hechizo modal (elegís UNO de
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
  overlay.id = 'mulligan-overlay';
  overlay.classList.add('private-zone-selection-overlay');
  const amount = Math.max(0, Number(offer?.amount || 0));
  const chosen = new Set();
  const zoneLabel = offer?.zone === 'deck' ? gameText('selection.private.zoneDeck') : gameText('selection.private.zoneHand');

  overlay.innerHTML = `
    <div class="mulligan-panel private-zone-selection-panel">
      <div class="mulligan-title">${gameTextHtml('selection.private.title', { card: cardName || gameText('selection.private.effectFallback'), zone: zoneLabel })}</div>
      <div class="mulligan-subtitle" id="private-zone-hint">${gameTextHtml('selection.chooseCount', { total: amount, selected: 0 })}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        ${onCancel ? `<button id="private-zone-cancel" class="mulligan-btn mulligan-btn-mull">${gameTextHtml('modal.mode.cancel')}</button>` : ''}
        <button id="private-zone-confirm" class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" disabled>${gameTextHtml('selection.confirmChoice')}</button>
      </div>
    </div>`;

  const hint = () => overlay.querySelector('#private-zone-hint');
  const confirm = () => overlay.querySelector('#private-zone-confirm');
  const row = document.createElement('div');
  row.className = 'mulligan-hand-row private-zone-card-row';

  const update = () => {
    hint().textContent = gameText('selection.chooseCount', { total: amount, selected: chosen.size });
    confirm().disabled = chosen.size !== amount;
  };

  (offer?.candidates || []).forEach((entry, idx) => {
    let cardEl;
    const selectable = entry.selectable !== false;
    const toggle = () => {
      if (!selectable) return;
      const token = entry.token;
      if (chosen.has(token)) {
        chosen.delete(token);
        cardEl.classList.remove('chosen');
        cardEl.setAttribute('aria-pressed', 'false');
      } else if (chosen.size < amount) {
        chosen.add(token);
        cardEl.classList.add('chosen');
        cardEl.setAttribute('aria-pressed', 'true');
      }
      update();
    };

    if (offer.visibility === 'reveal_candidates' && entry.card) {
      // HF11: a rule that explicitly says "Mirá" authorizes the chooser to see the real
      // printed card. Reuse the canonical renderer instead of the old name/type fallback so
      // art, mana, rules, P/T, Transporte stats, improvements and DFC preview are consistent
      // with Mulligan / land search / every other finished card picker.
      cardEl = createCardElement(entry.card, false, true, null, 'mulligan-pick', toggle);
      cardEl.classList.add('mulligan-card-slot', 'private-zone-revealed-card');
      if (selectable) cardEl.classList.add('selectable');
      else {
        cardEl.classList.add('disabled');
        cardEl.style.opacity = '0.46';
        cardEl.title = gameText('selection.private.invalid');
      }
    } else {
      // Opaque offers intentionally remain card backs: revealing full card data here would
      // violate the private-zone protocol. They still use the same picker geometry/selection.
      cardEl = document.createElement('div');
      cardEl.className = `mulligan-card-slot private-zone-opaque-card${selectable ? ' selectable' : ' disabled'}`;
      cardEl.innerHTML = `<div class="private-zone-card-back"><span>🂠</span><small>${gameTextHtml('selection.private.slot', { index: idx + 1 })}</small></div>`;
      if (selectable) cardEl.addEventListener('click', toggle);
      else {
        cardEl.style.opacity = '0.46';
        cardEl.title = gameText('selection.private.invalid');
      }
    }

    cardEl.dataset.token = entry.token;
    cardEl.tabIndex = selectable ? 0 : -1;
    cardEl.setAttribute('role', 'button');
    cardEl.setAttribute('aria-pressed', 'false');
    if (!selectable) cardEl.setAttribute('aria-disabled', 'true');
    if (selectable) {
      cardEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      });
    }
    if (!entry.card) cardEl.title ||= gameText('selection.private.hidden');
    row.appendChild(cardEl);
  });

  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);
  update();

  confirm().addEventListener('click', () => {
    if (chosen.size !== amount) return;
    const tokens = [...chosen];
    clearMulliganHoverPreview();
    overlay.remove();
    onConfirm(tokens);
  });
  if (onCancel) overlay.querySelector('#private-zone-cancel').addEventListener('click', () => {
    clearMulliganHoverPreview();
    overlay.remove();
    onCancel();
  });
}

// FASE 2: confirmación antes de abandonar — es una acción con penalidad real de puntos, así
// que nunca se ejecuta con un solo click. Mismo esqueleto que showKickerModal.
export function showAbandonConfirmModal(onConfirm, onCancel, { tournament = false } = {}) {
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header">
        <h3>${gameTextHtml(tournament ? 'modal.tournamentAbandon.title' : 'modal.abandon.title')}</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0 0 4px;">${gameTextHtml(tournament ? 'modal.tournamentAbandon.description' : 'modal.abandon.description')}</p>
        <button class="loyalty-ability-btn" id="abandon-yes" style="justify-content:center; text-align:center;">
          <span class="loyalty-ability-text">${gameTextHtml(tournament ? 'modal.tournamentAbandon.confirm' : 'modal.abandon.confirm')}</span>
        </button>
        <button id="abandon-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">${gameTextHtml(tournament ? 'modal.tournamentAbandon.cancel' : 'modal.abandon.cancel')}</button>
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
    const display = buildLoyaltyAbilityDisplay(ability);
    const cantAfford = ability.cost < 0 && pwItem.loyalty < Math.abs(ability.cost);
    const disabled = alreadyUsed || cantAfford;
    const name = display.abilityName ? `<strong>${escapeCardTextHtml(display.abilityName)}</strong>${display.text ? ' — ' : ''}` : '';
    return `
      <button class="loyalty-ability-btn ${disabled ? 'disabled' : ''}" data-idx="${idx}" ${disabled ? 'disabled' : ''}>
        <span class="loyalty-cost">${escapeCardTextHtml(display.loyaltyCost)}</span>
        <span class="loyalty-ability-text">${name}${renderInlineGameSymbols(escapeCardTextHtml(display.text))}</span>
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
  installDesktopZoneBrowserHoverInteractions();
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
      cardEl.classList.add('zone-browser-card-slot');
      cardEl.style.width = '120px';
      cardEl.style.height = '168px';
      wrapper.appendChild(cardEl);

      // Otra vuelta: solo en TU cementerio, solo si la carta lo tiene.
      if (isLocal && cardObj.flashback) {
        const fbBtn = document.createElement('button');
        fbBtn.className = 'mulligan-btn mulligan-btn-keep';
        fbBtn.style.fontSize = '11px';
        fbBtn.style.padding = '4px 8px';
        fbBtn.innerHTML = `🔄 Otra vuelta ${renderInlineGameSymbols(cardObj.flashback.cost)}`;
        fbBtn.addEventListener('click', () => {
          clearDesktopZoneHoverPreview();
          modalOverlay.remove();
          castFromGraveyard(cardObj, isLocal);
        });
        wrapper.appendChild(fbBtn);
      }

      // Zafar: solo en TU cementerio, solo si la carta lo tiene. Mostramos el costo de
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
        escBtn.innerHTML = `🌀 Zafar ${renderInlineGameSymbols(cardObj.escape.cost)} + exiliar ${exileCount}`;
        escBtn.addEventListener('click', () => {
          clearDesktopZoneHoverPreview();
          modalOverlay.remove();
          castFromGraveyard(cardObj, isLocal);
        });
        wrapper.appendChild(escBtn);
      }

      gridContent.appendChild(wrapper);
    });
  }

  modalOverlay.querySelector('.gy-close-btn').onclick = () => { clearDesktopZoneHoverPreview(); modalOverlay.remove(); };
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) { clearDesktopZoneHoverPreview(); modalOverlay.remove(); } };
}

export function openExileModal(isLocal) {
  injectMulliganStyles();
  installDesktopZoneBrowserHoverInteractions();
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
      cardEl.classList.add('zone-browser-card-slot');
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
        status.textContent=timeCount>0 ? `⏳ En espera · ${timeCount} Tiempo${timeCount===1?'':'s'}` : '⏳ En espera · esperando casteo';
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
          clearDesktopZoneHoverPreview();
          modalOverlay.remove();
          void playCardFromExile(cardObj,true);
        });
        wrapper.appendChild(playBtn);
      }
      gridContent.appendChild(wrapper);
    });
  }

  modalOverlay.querySelector('.gy-close-btn').onclick = () => { clearDesktopZoneHoverPreview(); modalOverlay.remove(); };
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) { clearDesktopZoneHoverPreview(); modalOverlay.remove(); } };
}


export function showSuspendCastModal(card) {
  return new Promise(resolve=>{
    injectMulliganStyles();
    const overlay=document.createElement('div'); overlay.className='gy-modal-overlay suspend-cast-modal';
    overlay.innerHTML=`<div class="gy-modal-content" style="max-width:460px"><div class="gy-modal-header"><h3>⏳ En espera — último contador de Tiempo</h3></div><div style="padding:18px;display:flex;gap:16px;align-items:center"><div id="suspend-card-preview"></div><div style="flex:1"><p><b>${card.name}</b> está lista para salir de En espera.</p><p style="font-size:13px;color:#bdc3c7">Podés castear este hechizo ahora sin pagar su coste de maná. Los costes adicionales siguen aplicando.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="mulligan-btn mulligan-btn-keep" data-choice="cast">✨ Castear gratis</button><button class="mulligan-btn" data-choice="leave">Dejar en Exilio</button></div></div></div></div>`;
    document.body.appendChild(overlay);
    const preview=overlay.querySelector('#suspend-card-preview');
    const cardEl=createCardElement(card,false,true,null,'preview',()=>{}); cardEl.style.width='120px';cardEl.style.height='168px'; preview.appendChild(cardEl);
    const finish=value=>{ overlay.remove(); resolve(value); };
    overlay.querySelector('[data-choice="cast"]').onclick=()=>finish(true);
    overlay.querySelector('[data-choice="leave"]').onclick=()=>finish(false);
  });
}

export function showSuspendedCardChoiceModal(entries,{title='Elegí una carta en espera'}={}) {
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
  const publicMsg = publicTerminologyText(msg);
  recordTelemetryUiLog(publicMsg);
  if (HEADLESS_ENGINE) { globalThis.__ARGENTINIA_HEADLESS_LOG__?.push?.(String(publicMsg)); return; }
  const entry = document.createElement('div');
  entry.className = 'log-entry log-system-entry';
  entry.textContent = publicMsg;
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
    // moderna: el daño no discrimina) ni aparecía como opción. Ahora sí: le resta Creencia
    // en vez de HP, mismo criterio que la habilidad de Creencia con target (item 12).
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
      // permanentes. Permite, por ejemplo, que Capítulo apunte realmente a una Saga y no a
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
// texto, para que "Poeta del Rock Celeste" entre igual de bien que "El Firulais".
function fitScale(text, idealChars, minScale = 0.55) {
  if (!text) return 1;
  return fitScaleByLength(text.length, idealChars, minScale);
}
function fitScaleByLength(len, idealChars, minScale = 0.55) {
  if (len <= idealChars) return 1;
  return Math.max(minScale, idealChars / len);
}


// 23.21.6 HF9 — Preview global de la otra cara TDFC.
// El badge ↻ A/B existe en todas las superficies que reutilizan createCardElement, incluso
// las que después serializan la carta con outerHTML (Enciclopedia/Mercado). Por eso la
// interacción es delegada desde document y el badge sólo transporta card.id + cara actual.
// Desktop: hover/focus = popover. Touch/mobile: tap = modal bloqueante. Nunca propaga el
// tap/click hacia la acción propia de la carta (jugar/publicar/elegir/etc.).
let dfcFacePreviewLayer = null;
let dfcFacePreviewSource = null;
let dfcFacePreviewDelegationInstalled = false;

function closeDfcFacePreview() {
  dfcFacePreviewLayer?.remove?.();
  dfcFacePreviewLayer = null;
  dfcFacePreviewSource = null;
}

function dfcPreviewUsesHover() {
  return !!globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
}

// HF10 — iOS/WebKit landscape puede tener muy poca altura útil aunque el ancho sea enorme.
// Dimensionamos el modal por AMBOS ejes usando visualViewport cuando existe. La carta mantiene
// 5:7 y nunca debe desbordar por abajo; en viewports bajos ocultamos el rótulo redundante.
function fitDfcModalPreviewToViewport(panel) {
  if (!panel || typeof window === 'undefined') return;
  const viewport = window.visualViewport;
  const vw = Math.max(1, Number(viewport?.width || window.innerWidth || document.documentElement?.clientWidth || 0));
  const vh = Math.max(1, Number(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 0));
  const shortViewport = vh < 520;
  const verticalReserve = shortViewport ? 22 : 66; // close/safe-area + optional label
  const widthByHeight = Math.max(132, (vh - verticalReserve) * (5 / 7));
  const width = Math.max(132, Math.min(290, vw * 0.76, widthByHeight));
  panel.style.setProperty('--dfc-modal-panel-width', `${Math.floor(width)}px`);
  panel.classList.toggle('is-short-viewport', shortViewport);
}

function showDfcFacePreview(badge, { modal = false } = {}) {
  if (!badge || typeof document === 'undefined') return;
  const cardId = String(badge.dataset.dfcCardId || '').trim();
  const shownFace = badge.dataset.dfcFace === 'back' ? 'back' : 'front';
  const physical = cardDb.getById(cardId);
  if (!physical || !isTransformingDoubleFacedCard(physical)) return;
  const targetFace = shownFace === 'back' ? 'front' : 'back';

  if (dfcFacePreviewSource === badge && dfcFacePreviewLayer?.isConnected && dfcFacePreviewLayer.dataset.modal === String(!!modal)) return;
  closeDfcFacePreview();

  const faceCard = buildTransformFaceCard(physical, targetFace);
  const previewItem = { card: faceCard, _dfcPhysicalCard: physical, _dfcFace: targetFace };
  const layer = document.createElement('div');
  layer.className = `dfc-face-preview-layer${modal ? ' is-modal' : ' is-hover'}`;
  layer.dataset.modal = String(!!modal);
  layer.setAttribute('role', modal ? 'dialog' : 'tooltip');
  layer.setAttribute('aria-label', `${targetFace === 'back' ? 'Cara B' : 'Cara A'}: ${faceCard.name}`);

  const panel = document.createElement('div');
  panel.className = 'dfc-face-preview-panel';
  const label = document.createElement('div');
  label.className = 'dfc-face-preview-label';
  label.textContent = `${targetFace === 'back' ? 'CARA B' : 'CARA A'} · ${faceCard.name}`;
  const cardSlot = document.createElement('div');
  cardSlot.className = 'dfc-face-preview-card-slot';
  const previewCard = createCardElement(previewItem, false, true, null, 'dfc-preview', null);
  previewCard.classList.add('dfc-face-preview-card');
  cardSlot.appendChild(previewCard);
  panel.append(label, cardSlot);

  if (modal) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dfc-face-preview-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Cerrar vista de la otra cara');
    close.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); closeDfcFacePreview(); });
    panel.appendChild(close);
    layer.addEventListener('click', (event) => { if (event.target === layer) closeDfcFacePreview(); });
  }

  layer.appendChild(panel);
  document.body.appendChild(layer);
  dfcFacePreviewLayer = layer;
  dfcFacePreviewSource = badge;

  if (modal) fitDfcModalPreviewToViewport(panel);

  if (!modal) {
    const rect = badge.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 12;
    const leftCandidate = rect.right + margin;
    const left = leftCandidate + panelRect.width <= window.innerWidth - margin
      ? leftCandidate
      : Math.max(margin, rect.left - panelRect.width - margin);
    const top = Math.min(
      Math.max(margin, rect.top + rect.height / 2 - panelRect.height / 2),
      Math.max(margin, window.innerHeight - panelRect.height - margin)
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }
}

function ensureDfcFacePreviewInteractions() {
  if (dfcFacePreviewDelegationInstalled || typeof document === 'undefined') return;
  dfcFacePreviewDelegationInstalled = true;
  const badgeFrom = target => target?.closest?.('.dfc-face-badge[data-dfc-card-id]') || null;

  document.addEventListener('pointerover', event => {
    const badge = badgeFrom(event.target);
    if (!badge || !dfcPreviewUsesHover()) return;
    if (event.relatedTarget && badge.contains(event.relatedTarget)) return;
    showDfcFacePreview(badge, { modal:false });
  }, true);
  document.addEventListener('pointerout', event => {
    const badge = badgeFrom(event.target);
    if (!badge || !dfcPreviewUsesHover()) return;
    if (event.relatedTarget && badge.contains(event.relatedTarget)) return;
    if (dfcFacePreviewSource === badge && dfcFacePreviewLayer?.dataset.modal !== 'true') closeDfcFacePreview();
  }, true);
  document.addEventListener('focusin', event => {
    const badge = badgeFrom(event.target);
    if (badge) showDfcFacePreview(badge, { modal:!dfcPreviewUsesHover() });
  }, true);
  document.addEventListener('focusout', event => {
    const badge = badgeFrom(event.target);
    if (badge && dfcPreviewUsesHover() && dfcFacePreviewSource === badge) closeDfcFacePreview();
  }, true);
  document.addEventListener('pointerdown', event => {
    const badge = badgeFrom(event.target);
    if (badge) event.stopPropagation();
  }, true);
  document.addEventListener('click', event => {
    const badge = badgeFrom(event.target);
    if (!badge) return;
    event.preventDefault();
    event.stopPropagation();
    if (!dfcPreviewUsesHover()) showDfcFacePreview(badge, { modal:true });
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dfcFacePreviewLayer) closeDfcFacePreview();
  });
  window.addEventListener?.('scroll', () => {
    if (dfcFacePreviewLayer?.dataset.modal !== 'true') closeDfcFacePreview();
  }, true);
  const refitModal = () => {
    if (dfcFacePreviewLayer?.dataset.modal !== 'true') return;
    fitDfcModalPreviewToViewport(dfcFacePreviewLayer.querySelector('.dfc-face-preview-panel'));
  };
  window.addEventListener?.('resize', refitModal, { passive:true });
  window.visualViewport?.addEventListener?.('resize', refitModal, { passive:true });
}

export function createCardElement(itemObj, isTapped = false, isLocal = true, index = null, zone = 'hand', customClick = null) {
  const card = itemObj.card || itemObj;
  const isBattlefieldLand = !!itemObj?.card && isLandPermanent(itemObj) && (zone === 'land' || zone === 'combat' || zone === 'support');
  const el = document.createElement('div');
  
  // HF23.3.5 — una criatura puede conservar el flag histórico de mareo pero recibir
  // Apuro dinámicamente (Aura/Equipo/efecto). La UI debe reflejar la legalidad efectiva.
  const isSick = itemObj.summoningSickness && !getEffectiveKeywords(itemObj).some(k => String(k || '').trim().toLowerCase() === 'haste') ? 'sick' : '';
  const isAttacking = itemObj.isAttacking === true ? 'attacking' : '';
  const isBlocking = (itemObj.blockingIndex !== null && itemObj.blockingIndex !== undefined) ? 'blocking' : '';
  const isSelectedBlocker = (index !== null && index !== undefined && state.pendingBlockerIndex === index && zone === 'combat' && isLocal) ? 'selected-blocker' : '';

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
  
  // --- NUEVA LÓGICA DE COLORES Argentinia ---
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
  const animationObjectId = ensureAnimationVisualIdentity(itemObj);
  if (animationObjectId) el.dataset.animationObjectId = animationObjectId;
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
  // 23.21.6 HF7 — Transportes/Vehículos tienen P/T impresa aun cuando todavía son artefactos
  // no tripulados. Esto es PRESENTATION-ONLY: no los convierte en criatura ni altera reglas.
  const isVehicleCard = /(?:Vehículo|Transporte)/i.test(String(card.type || ''));
  const vehiclePrintedPower = Number(card?.baseStats?.power);
  const vehiclePrintedToughness = Number(card?.baseStats?.toughness);
  const hasVehiclePrintedStats = isVehicleCard && Number.isFinite(vehiclePrintedPower) && Number.isFinite(vehiclePrintedToughness);
  const hasDisplayCombatStats = hasCreatureStats || hasVehiclePrintedStats;
  const hasCornerStat = hasDisplayCombatStats || card.type.includes('Planeswalker');

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
      const rule = renderInlineGameSymbols(escapeCardTextHtml(entry.text));
      const reminder = entry.reminder
        ? ` <span class="card-reminder-text">(${renderInlineGameSymbols(escapeCardTextHtml(entry.reminder))})</span>`
        : '';
      if (entry.kind === 'loyalty-ability') {
        const abilityName = entry.abilityName
          ? `<span class="card-loyalty-ability-name">${escapeCardTextHtml(entry.abilityName)}</span>${entry.text ? ' — ' : ''}`
          : '';
        return `<div class="card-rule-paragraph card-loyalty-rule"><span class="card-loyalty-cost-inline">${escapeCardTextHtml(entry.loyaltyCost)}</span><span class="card-loyalty-rule-copy">${abilityName}${rule}${reminder}</span></div>`;
      }
      const abilityWord = entry.abilityWord
        ? `<span class="card-ability-word">${escapeCardTextHtml(entry.abilityWord)} — </span>`
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
      + textLayout.paragraphs.reduce((n, p) => n + p.text.length + (p.abilityWord || '').length + (p.abilityName || '').length + (p.loyaltyCost || '').length, 0)
      + textLayout.keywordLabels.join(', ').length
      + Math.round(reminderLen * 0.72)
      + (textLayout.paragraphs.length * 14);
    const textBoxScale = fitScaleByLength(totalTextLen, 115);

    formattedTextHTML = `<div class="card-text-box card-text-box-structured${hasCornerStat ? ' card-text-box-stat-reserve' : ''}" data-auto-text-cqw="${(6 * textBoxScale).toFixed(2)}" style="--card-text-effective-size:${(6 * textBoxScale).toFixed(2)}cqw; font-size:clamp(3px, var(--card-text-effective-size), 26px);">${keywordsHTML}${keywordReminderHTML}<div class="card-rules-list">${rulesHTML}</div>${flavorHTML}</div>`;
  }

  const effPower = hasCreatureStats ? getEffectivePower(itemObj) : (hasVehiclePrintedStats ? vehiclePrintedPower : undefined);
  const effToughness = hasCreatureStats ? getEffectiveToughness(itemObj) : (hasVehiclePrintedStats ? vehiclePrintedToughness : undefined);
  const basePowerForUi = itemObj.animatedBasePower ?? card.power;
  const baseToughnessForUi = itemObj.animatedBaseToughness ?? card.toughness;
  const isBuffed = hasCreatureStats && effPower !== undefined && (effPower !== basePowerForUi || effToughness !== baseToughnessForUi);

  let ptText = hasDisplayCombatStats ? `${effPower}/${effToughness}` : '';
  if (itemObj.damageTaken > 0 && hasCreatureStats) {
    ptText = `${effPower}/<span style="color:#e74c3c;">${effToughness - itemObj.damageTaken}</span>`;
  } else if (isBuffed) {
    ptText = `<span style="color:#27ae60;">${effPower}/${effToughness}</span>`;
  }

  // Creencia de un Planeswalker: mismo cuadrito que Poder/Resistencia, pero con su propio
  // color (violeta, como en las cartas reales) para diferenciarlo de un vistazo.
  const isPlaneswalker = card.type.includes('Planeswalker');
  const effectiveLandType = isBattlefieldLand ? getEffectiveLandTypeLine(state, itemObj, isLocal) : card.type;
  const displayType = publicCardTypeLine(itemObj.isAnimatedLand ? `${effectiveLandType} · Criatura` : effectiveLandType);
  const loyaltyText = isPlaneswalker ? `${itemObj.loyalty}` : '';

  const attachedAuras = itemObj.auras || [];
  const attachedEquipment = (zone === 'combat' && card.power !== undefined) ? getEquipmentOn(itemObj) : [];
  const staticMods = (zone === 'combat' && card.power !== undefined) ? getStaticTeamModifiers(itemObj) : [];
  const tempMods = (zone === 'combat' && card.power !== undefined) ? (itemObj.tempEffects || []) : [];
  const counters = ['combat','support','land','planeswalker'].includes(zone) ? itemObj.counters : null;

  // Describe en criollo qué hace cada modificador (no solo su nombre), para el tooltip
  // de abajo — "Facón de Plata: {T}: 2 de daño", "Poncho del Paisano: +1/+1",
  // "Fuerza de la Manada: +1/+1 (mientras esté en el campo)", "Fuerza de Toro: +3/+3 (hasta fin de turno)".
  const shortLabelFor = (k) => publicKeywordLabel(k);
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
    if (m.type === 'team_keyword') return publicKeywordLabel(m.keyword);
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
  const dfcBadgeHTML = dfcSpec && zone !== 'dfc-preview'
    ? `<div class="dfc-face-badge" role="button" tabindex="0" data-dfc-card-id="${escapeHtml(String(card.id || ''))}" data-dfc-face="${dfcFace === 'back' ? 'back' : 'front'}" title="${(dfcFace === 'back' ? `Ver cara A · ${dfcSpec.frontName || card.name}` : `Ver cara B · ${dfcBackName}`).replace(/"/g, '&quot;')}" aria-label="${(dfcFace === 'back' ? `Ver cara A · ${dfcSpec.frontName || card.name}` : `Ver cara B · ${dfcBackName}`).replace(/"/g, '&quot;')}">↻ ${dfcFace === 'back' ? 'B' : 'A'}</div>`
    : '';
  const chosenCreatureType=getChosenCreatureType(itemObj);
  const typalTooltipText = chosenCreatureType ? `Tipo de criatura elegido: ${String(chosenCreatureType)}` : '';
  const typalChoiceBadgeHTML=chosenCreatureType
    ? `<div class="typal-choice-badge" title="${escapeHtml(typalTooltipText)}" aria-label="${escapeHtml(typalTooltipText)}">🧬 ${String(chosenCreatureType).replace(/</g,'&lt;')}</div>`
    : '';

  const sagaState = isSagaCard(card) ? sagaUiState(itemObj) : null;
  const sagaRomanDisplay = (roman) => ({ I:'Ⅰ', II:'Ⅱ', III:'Ⅲ', IV:'Ⅳ', V:'Ⅴ', VI:'Ⅵ', VII:'Ⅶ', VIII:'Ⅷ', IX:'Ⅸ', X:'Ⅹ' }[roman] || roman);
  const sagaTooltipText = sagaState && sagaState.chapters.length > 0
    ? `Capítulo ${sagaState.lore}/${sagaState.finalChapter} · ${sagaState.chapters.map(ch => `${ch.roman}: ${ch.label || ''}`.trim()).join(' · ')}`
    : '';
  const sagaChapterHTML = sagaState && sagaState.chapters.length > 0
    ? `<div class="saga-chapter-track" title="${escapeHtml(sagaTooltipText)}" aria-label="${escapeHtml(sagaTooltipText)}">${sagaState.chapters.map(ch => `<span class="saga-chapter-pill${sagaState.lore >= ch.number ? ' reached' : ''}${sagaState.lore === ch.number ? ' current' : ''}"><span class="saga-chapter-pill-label">${sagaRomanDisplay(ch.roman)}</span></span>`).join('')}</div>`
    : '';

  // 23.12.0 — las vistas catálogo/deckbuilder pueden mostrar cientos de cartas. Sus
  // imágenes no deben salir todas juntas contra el hosting: el navegador sólo pide las que
  // se acercan al viewport y las decodifica fuera del camino crítico. En el tablero real
  // mantenemos carga inmediata para no introducir latencia durante una partida.
  const browserImageAttrs = zone === 'encyclopedia'
    ? ' loading="lazy" decoding="async" fetchpriority="low"'
    : ' decoding="async"';

  // HF23.3.7 — rarity is an actual compact UI asset, never a glyph. Keep the filename
  // mapping intentionally closed so arbitrary card data cannot escape assets/images/ui.
  const rarityKey = ({ Common:'common', Uncommon:'uncommon', Rare:'rare', Mythic:'mythic' })[String(card.rarity || 'Common')] || 'common';
  const rarityLabel = ({ common:'Común', uncommon:'Poco común', rare:'Rara', mythic:'Mítica' })[rarityKey];
  const rarityIconHTML = `<img class="rarity-icon" src="./assets/images/ui/${rarityKey}.png" alt="Rareza ${rarityLabel}" title="Rareza ${rarityLabel}" decoding="async" draggable="false" onerror="this.style.visibility='hidden'">`;
  const evolvableIconHTML = isEvolutionEligibleCard(card) && !card.evolutionStage
    ? `<img class="evolvable-icon" src="./assets/images/ui/evolucionable.png" alt="${gameTextHtml('card.evolvable.icon')}" title="${gameTextHtml('card.evolvable.icon')}" decoding="async" draggable="false" onerror="this.style.visibility='hidden'">`
    : '';
  const cardImageRoot = card.imageRoot === 'evolutions' ? 'evolutions' : 'cards';

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-header"><span class="card-title" data-auto-name-cqw="${(8 * fitScale(card.name, 13, 0.3)).toFixed(2)}" style="font-size: clamp(4px, ${(8 * fitScale(card.name, 13, 0.3)).toFixed(2)}cqw, 40px);">${card.name}</span><span class="card-cost">${renderManaSymbols(card.manaCost)}</span></div>
      <div class="card-art" style="position: relative; overflow: hidden;">
        <div class="card-art-fallback" aria-hidden="true">${icon}</div>
        ${card.image ? `<img class="card-art-image" src="./assets/images/${cardImageRoot}/${card.image}" alt="${card.name}"${browserImageAttrs} style="position: absolute; width: 120%; height: 120%; object-fit: cover; object-position: center top; z-index: 2;" onerror="this.style.display='none'">` : ''}
        ${counterBadgeHTML}
        ${sagaChapterHTML}
        ${dfcBadgeHTML}
        ${typalChoiceBadgeHTML}
      </div>
      <div class="card-type-line"><span class="card-type-text" style="font-size: clamp(4px, ${(7 * fitScale(displayType, 16, 0.3)).toFixed(2)}cqw, 30px);">${displayType}</span>${rarityIconHTML}${evolvableIconHTML}</div>
      ${formattedTextHTML}
      ${hasDisplayCombatStats ? `<div class="card-pt${hasVehiclePrintedStats && !hasCreatureStats ? ' vehicle-printed-pt' : ''}"${hasVehiclePrintedStats && !hasCreatureStats ? ' title="Poder/Resistencia al tripular este Transporte" aria-label="Poder/Resistencia al tripular este Transporte"' : ''}>${ptText}</div>` : ''}
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


  // 23.16.3 — En espera es una acción especial desde la mano. Tiene un control propio porque
  // puede ser legal aunque la carta no pueda castearse normalmente (por coste/targets), y no
  // usa la Stack. Usa el mismo tratamiento visual mínimo del botón ⚡: centrado abajo y fuera
  // del contenido de la carta para no tapar texto ni crecer con hover interno.
  if (zone === 'hand' && isLocal && hasSuspend(card) && !state.gameOver) {
    const spec=normalizeSuspendSpec(card);
    const suspendBtn=document.createElement('button');
    suspendBtn.type='button';
    suspendBtn.textContent='⏳';
    suspendBtn.title=`En espera ${spec?.time || ''} — ${spec?.cost || '{0}'}`;
    suspendBtn.setAttribute('aria-label', `Poner ${card.name} en espera por ${spec?.time || 0} Tiempo pagando ${spec?.cost || '{0}'}`);
    suspendBtn.classList.add('card-bottom-fab', 'suspend-action-fab');
    suspendBtn.disabled=!canSuspendCardFromHand(card);
    suspendBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();suspendCardFromHand(index);});
    el.classList.add('card-with-bottom-fab');
    el.appendChild(suspendBtn);
  }

  ensureDfcFacePreviewInteractions();

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
// UI-POLISH-3: en desktop una fila de permanentes deja de seguir encogiendo cartas cuando
// eso las llevaría por debajo del 88% de su tamaño ideal. A partir de ahí conserva lectura
// y pasa a overflow horizontal; mobile conserva íntegro su contrato de scroll nativo.
const DESKTOP_BATTLEFIELD_SCROLL_MIN_SCALE = 0.88;
let desktopBattlefieldScrollInteractionsInstalled = false;
let desktopBattlefieldScrollGesture = null;
let desktopBattlefieldHoverPreview = null;
let desktopBattlefieldHoverSource = null;

function getIdealCardHeightPx() { return window.innerHeight * 0.175; }

function clearDesktopBattlefieldHoverPreview() {
  desktopBattlefieldHoverPreview?.remove?.();
  desktopBattlefieldHoverPreview = null;
  desktopBattlefieldHoverSource = null;
}

function showDesktopBattlefieldHoverPreview(cardEl) {
  if (!cardEl || typeof document === 'undefined') return;
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) return;
  if (desktopBattlefieldScrollGesture?.dragging) return;
  const row = cardEl.closest?.('.field-row.desktop-overflow-scroll');
  if (!row) return;
  if (desktopBattlefieldHoverSource === cardEl && desktopBattlefieldHoverPreview?.isConnected) return;
  clearDesktopBattlefieldHoverPreview();

  const rect = cardEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const tapped = cardEl.classList.contains('tapped');
  const verticalSourceWidth = tapped ? rect.height : rect.width;
  // HF16: en overflow el portal es el ÚNICO hover. Lo hacemos comparable al hover histórico
  // (2.8x), pero con clamp por ancho Y alto de viewport para que siempre se vea completo.
  const pad = 12;
  const viewportW = window.visualViewport?.width || window.innerWidth;
  const viewportH = window.visualViewport?.height || window.innerHeight;
  const desiredW = Math.max(170, verticalSourceWidth * 2.65);
  const maxWByViewport = Math.max(120, viewportW - pad * 2);
  const maxWByHeight = Math.max(120, (viewportH - pad * 2) * CARD_ASPECT);
  const displayW = Math.min(desiredW, 300, maxWByViewport, maxWByHeight);
  const displayH = displayW / CARD_ASPECT;
  const viewportLeft = window.visualViewport?.offsetLeft || 0;
  const viewportTop = window.visualViewport?.offsetTop || 0;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const left = Math.min(Math.max(viewportLeft + pad, centerX - displayW / 2), Math.max(viewportLeft + pad, viewportLeft + viewportW - displayW - pad));
  const top = Math.min(Math.max(viewportTop + pad, centerY - displayH / 2), Math.max(viewportTop + pad, viewportTop + viewportH - displayH - pad));

  const preview = cardEl.cloneNode(true);
  preview.querySelectorAll?.('[id]').forEach?.(node => node.removeAttribute('id'));
  preview.classList.remove('tapped', 'targetable', 'attacking', 'selected-blocker', 'blocking');
  preview.classList.add('desktop-battlefield-hover-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
  preview.style.width = `${displayW}px`;
  preview.style.height = `${displayH}px`;
  const inner = preview.querySelector('.card-inner');
  if (inner) {
    inner.style.width = '';
    inner.style.height = '';
    inner.style.transform = 'none';
  }
  preview.querySelectorAll?.('img').forEach?.(img => { img.draggable = false; });
  document.body.appendChild(preview);
  desktopBattlefieldHoverPreview = preview;
  desktopBattlefieldHoverSource = cardEl;
}

function installDesktopBattlefieldScrollInteractions() {
  if (desktopBattlefieldScrollInteractionsInstalled || typeof document === 'undefined') return;
  desktopBattlefieldScrollInteractionsInstalled = true;

  const rowFromEvent = (event) => event?.target?.nodeType === 1 ? event.target.closest('.field-row.desktop-overflow-scroll') : null;
  const cardFromEvent = (event) => event?.target?.nodeType === 1 ? event.target.closest('.field-row.desktop-overflow-scroll .card') : null;
  const hasHorizontalOverflow = (row) => !!row && row.scrollWidth > row.clientWidth + 2;

  document.addEventListener('dragstart', (event) => {
    if (!rowFromEvent(event)) return;
    event.preventDefault();
  }, true);

  // El hover normal 2.8x quedaría recortado por overflow-x:auto. Igual que en Mulligan,
  // mostramos una copia fija FUERA del viewport del scroller sólo para filas desbordadas.
  document.addEventListener('pointerover', (event) => {
    const cardEl = cardFromEvent(event);
    if (!cardEl || event.pointerType === 'touch' || cardEl.contains(event.relatedTarget)) return;
    showDesktopBattlefieldHoverPreview(cardEl);
  }, true);
  document.addEventListener('pointerout', (event) => {
    const cardEl = cardFromEvent(event);
    if (!cardEl || cardEl !== desktopBattlefieldHoverSource || cardEl.contains(event.relatedTarget)) return;
    clearDesktopBattlefieldHoverPreview();
  }, true);

  // Rueda vertical sobre una fila desbordada = desplazamiento horizontal. Trackpads que
  // ya entregan deltaX mantienen su comportamiento nativo.
  document.addEventListener('wheel', (event) => {
    const row = rowFromEvent(event);
    if (!hasHorizontalOverflow(row)) return;
    clearDesktopBattlefieldHoverPreview();
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
  }, { passive: false, capture: true });

  // Click + drag con mouse. Un click corto sigue llegando a la carta; recién luego de 7 px
  // la interacción se convierte en paneo y se suprime el click residual del pointerup.
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const row = rowFromEvent(event);
    if (!hasHorizontalOverflow(row)) return;
    if (event.target?.closest?.('button,a,input,select,textarea,label')) return;
    clearDesktopBattlefieldHoverPreview();
    desktopBattlefieldScrollGesture = {
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: row.scrollLeft,
      dragging: false
    };
  }, true);

  document.addEventListener('pointermove', (event) => {
    const g = desktopBattlefieldScrollGesture;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.startX;
    if (!g.dragging && Math.abs(dx) < 7) return;
    if (!g.dragging) {
      g.dragging = true;
      clearDesktopBattlefieldHoverPreview();
      g.row.classList.add('is-dragging');
      try { g.row.setPointerCapture?.(event.pointerId); } catch {}
    }
    event.preventDefault();
    g.row.scrollLeft = g.startScrollLeft - dx;
  }, { passive: false, capture: true });

  const finishDrag = (event) => {
    const g = desktopBattlefieldScrollGesture;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.dragging) {
      g.row.dataset.suppressBattlefieldClickUntil = String(Date.now() + 260);
      g.row.classList.remove('is-dragging');
      try { g.row.releasePointerCapture?.(event.pointerId); } catch {}
    }
    desktopBattlefieldScrollGesture = null;
  };
  document.addEventListener('pointerup', finishDrag, true);
  document.addEventListener('pointercancel', finishDrag, true);
  document.addEventListener('click', (event) => {
    const row = rowFromEvent(event);
    if (!row) return;
    if (Number(row.dataset.suppressBattlefieldClickUntil || 0) > Date.now()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('scroll', (event) => {
    const row = event?.target?.closest?.('.field-row.desktop-overflow-scroll');
    if (!row) return;
    clearDesktopBattlefieldHoverPreview();
    if (row.classList.contains('combat-row') || row.classList.contains('planeswalker-row')) scheduleCurrentCombatMap();
  }, true);
}

export function sizeCardsInRow(rowEl) {
  const cards = rowEl.querySelectorAll('.card');
  const n = cards.length;
  if (n === 0) {
    rowEl.classList?.remove('desktop-overflow-scroll');
    if (rowEl.scrollLeft) rowEl.scrollLeft = 0;
    return;
  }

  // RC5.2 hand-geometry hotfix: mobile local-hand dimensions are a CSS invariant
  // (exact 5:7, identical for every card). Do not leave per-render inline width/height
  // behind, because those values can fight responsive d/svh sizing after fullscreen or
  // browser-chrome changes. Battlefield rows continue through the geometry engine below.
  if (document.documentElement?.classList?.contains('argentinia-mobile') && rowEl?.id === 'local-hand') {
    cards.forEach(c => {
      c.style.removeProperty('width');
      c.style.removeProperty('height');
      c.style.removeProperty('min-width');
      c.style.removeProperty('min-height');
      c.style.removeProperty('max-width');
      c.style.removeProperty('max-height');
      const inner = c.querySelector('.card-inner');
      inner?.style?.removeProperty('width');
      inner?.style?.removeProperty('height');
      inner?.style?.removeProperty('min-width');
      inner?.style?.removeProperty('min-height');
      inner?.style?.removeProperty('max-width');
      inner?.style?.removeProperty('max-height');
    });
    return;
  }
  if (document.documentElement?.classList?.contains('argentinia-mobile') && rowEl && (rowEl.id === 'rival-hand' || rowEl.classList?.contains('field-row'))) {
    cards.forEach(c => {
      c.style.removeProperty('width');
      c.style.removeProperty('height');
      c.style.removeProperty('min-width');
      c.style.removeProperty('min-height');
      c.style.removeProperty('max-width');
      c.style.removeProperty('max-height');
      const inner = c.querySelector('.card-inner');
      inner?.style?.removeProperty('width');
      inner?.style?.removeProperty('height');
      inner?.style?.removeProperty('min-width');
      inner?.style?.removeProperty('min-height');
      inner?.style?.removeProperty('max-width');
      inner?.style?.removeProperty('max-height');
    });
    return;
  }
  const rowStyles = getComputedStyle(rowEl);
  const gap = parseFloat(rowStyles.columnGap) || parseFloat(rowStyles.gap) || 6;
  const padX = (parseFloat(rowStyles.paddingLeft) || 0) + (parseFloat(rowStyles.paddingRight) || 0);
  const padY = (parseFloat(rowStyles.paddingTop) || 0) + (parseFloat(rowStyles.paddingBottom) || 0);
  const availableWidth = Math.max(24, rowEl.clientWidth - padX - 6);
  const availableHeight = Math.max(24, rowEl.clientHeight - padY - 6);

  // Las giradas ocupan 7/5 del ancho de una vertical (intercambian sus medidas). Si no las
  // contamos aparte acá, el "cuántas entran" queda mal apenas hay una girada en la fila —
  // esto es lo que hacía que las cartas se empezaran a pisar entre sí.
  let tappedCount = 0;
  cards.forEach(c => { if (c.classList.contains('tapped')) tappedCount++; });
  const untappedCount = n - tappedCount;
  const effectiveUnits = (tappedCount * CARD_ASPECT_INV) + untappedCount;

  let cardHeight = Math.min(getIdealCardHeightPx(), availableHeight);
  let cardWidth = cardHeight * CARD_ASPECT;
  const mobileScrollableRow = document.documentElement?.classList?.contains('argentinia-mobile');
  const widthIfFit = (availableWidth - (gap * Math.max(0, n - 1))) / effectiveUnits;
  const desktopBattlefieldRow = !mobileScrollableRow && rowEl.classList?.contains('field-row');
  const desktopOverflowScroll = desktopBattlefieldRow && n > 1 && widthIfFit < (cardWidth * DESKTOP_BATTLEFIELD_SCROLL_MIN_SCALE);
  rowEl.classList?.toggle('desktop-overflow-scroll', desktopOverflowScroll);
  if (!desktopOverflowScroll && rowEl.scrollLeft) rowEl.scrollLeft = 0;

  // RC5.1: en mobile las filas ya son scroll containers horizontales. UI-POLISH-3 extiende
  // el mismo principio a desktop SÓLO cuando seguir achicando volvería ilegible la fila.
  if (!mobileScrollableRow && !desktopOverflowScroll && widthIfFit < cardWidth) {
    cardWidth = Math.max(widthIfFit, 24);
    cardHeight = cardWidth / CARD_ASPECT;
  }

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
  clearDesktopBattlefieldHoverPreview();
  installDesktopBattlefieldScrollInteractions();
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
    #deck-select-overlay, #starter-deck-select-overlay {
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
    .deck-select-status {
      min-height: 20px; margin: -18px 0 18px; text-align: center;
      color: #d8cfb7; font-size: 12px; line-height: 1.35;
    }
    .deck-select-status-error { color: #ff9c9c; font-weight: 700; }
    .deck-select-mono-btn:disabled, .deck-select-pair-btn:disabled,
    #deckselect-exit:disabled {
      opacity: .55; cursor: wait; transform: none !important;
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
    width: max-content;
    --main-menu-button-width: 230px;
    --main-menu-button-height: 40px;
}
#main-menu-overlay .main-menu-buttons > .main-menu-btn { width: var(--main-menu-button-width); min-height: var(--main-menu-button-height); }
.main-menu-bottom-row { display:flex; align-items:stretch; gap:8px; width:max-content; }
.main-menu-bottom-row > #menu-options { width:var(--main-menu-button-width); min-height:var(--main-menu-button-height); flex:0 0 var(--main-menu-button-width); }
.main-menu-icon-btn {
    position:relative; flex:0 0 var(--main-menu-button-height); width:var(--main-menu-button-height); height:var(--main-menu-button-height);
    display:flex; align-items:center; justify-content:center; overflow:hidden; padding:0;
    background:linear-gradient(180deg,rgba(18,25,15,.92),rgba(11,19,14,.96));
    border:2px solid var(--gold,#d4af37); border-radius:10px; color:#f0e0b0;
    cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.4);
    transition:transform .15s ease,box-shadow .15s ease,background .15s ease;
}
.main-menu-icon-btn:hover { transform:translateY(-2px); background:linear-gradient(180deg,rgba(212,175,55,.18),rgba(11,19,14,.96)); box-shadow:0 4px 22px rgba(212,175,55,.35); }
.main-menu-icon-fallback { position:relative; z-index:1; font-size:21px; line-height:1; }
.main-menu-icon-image { position:absolute; inset:4px; z-index:2; width:calc(100% - 8px); height:calc(100% - 8px); object-fit:contain; object-position:center; pointer-events:none; }
.main-menu-icon-btn.main-menu-btn-disabled:hover { transform:none; }
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
    .main-menu-account { position: absolute; top: 24px; right: 32px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; --main-menu-button-height: 40px; }
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
    .main-menu-account-wallet {
      color:#d4af37; font-size:11px; font-weight:700; margin:3px 0 4px;
      display:flex; align-items:center; gap:9px; flex-wrap:nowrap;
    }
    .main-menu-account-wallet-item { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .main-menu-account-wallet .coin-icon, .main-menu-account-wallet .ficha-icon, .main-menu-account-wallet .essence-icon { width:20px; height:20px; }
    .coin-icon, .ficha-icon, .essence-icon {
      width: 3em; height: 3em; object-fit: contain; vertical-align: middle; flex-shrink: 0;
    }
    .main-menu-logout-btn {
      background: none; border: none; color: #b8adc4; font-size: 11px;
      cursor: pointer; text-decoration: underline; padding: 0; display: block;
    }
    .main-menu-logout-btn:hover { color: #f0e0b0; }
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
    #options-menu-overlay {
      display: flex; align-items: center; justify-content: center;
      box-sizing: border-box;
      padding: clamp(10px, 2vh, 24px);
      overflow: auto;
      overscroll-behavior: contain;
    }
    .options-menu-panel {
      width: min(940px, calc(100vw - 32px));
      max-width: 940px;
      max-height: calc(100vh - 32px);
      max-height: calc(100dvh - 32px);
      box-sizing: border-box;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-gutter: stable;
      overscroll-behavior: contain;
      background: linear-gradient(180deg, rgba(18,25,15,0.97), rgba(11,19,14,0.99));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 16px;
      padding: clamp(20px, 3vh, 30px) clamp(20px, 3vw, 34px);
      box-shadow: 0 0 60px rgba(212,175,55,0.15), 0 20px 60px rgba(0,0,0,0.6);
    }
    .options-menu-title {
      text-align: center; font-size: clamp(22px, 2vw, 28px); font-weight: 700;
      color: #f0e0b0; margin-bottom: clamp(14px, 2.2vh, 22px);
      text-shadow: 0 0 20px rgba(212,175,55,0.4);
    }
    .options-layout-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: clamp(18px, 2.4vw, 30px);
      align-items: start;
    }
    .options-column {
      min-width: 0;
      border: 1px solid rgba(212,175,55,0.14);
      border-radius: 12px;
      padding: 10px 14px 14px;
      background: rgba(0,0,0,0.08);
    }
    .options-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 14px;
      min-width: 0;
      padding: 11px 4px;
      border-bottom: 1px solid rgba(212,175,55,0.15);
    }
    .options-row:last-of-type { border-bottom: none; }
    .options-label { color: #e8ddc8; font-size: 15px; min-width: 0; }
    .options-toggle-btn {
      background: rgba(255,255,255,0.05);
      border: 1.5px solid rgba(212,175,55,0.4);
      border-radius: 8px;
      color: #f0e0b0;
      font-size: 14px; font-weight: 600;
      padding: 7px 16px;
      cursor: pointer;
      min-width: 90px;
      flex: 0 0 auto;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .options-toggle-btn:hover { background: rgba(212,175,55,0.15); border-color: #f0e0b0; }
    .options-section-title {
      color: #d4af37; font-size: 11px; font-weight: 800; letter-spacing: 0.9px;
      text-transform: uppercase; margin-top: 12px; padding: 0 4px 5px;
    }
    .options-section-title:first-child { margin-top: 2px; }
    .options-audio-row { gap: 12px; }
    .options-audio-controls {
      display:grid;
      grid-template-columns: minmax(92px, auto) minmax(90px, 1fr) 42px;
      align-items:center;
      gap:8px;
      min-width: 0;
      flex: 1 1 250px;
      max-width: 315px;
    }
    .options-volume-slider { width: 100%; min-width: 90px; accent-color: #d4af37; cursor: pointer; }
    .options-volume-value { width: 42px; text-align:right; color:#cfe0d4; font-size:12px; font-variant-numeric: tabular-nums; }
    .options-back-btn { margin-top: 18px !important; text-align: center; }
    .main-menu-music-btn {
      flex:0 0 34px; width:34px; height:30px; min-width:34px; padding:0; margin:0; align-self:auto;
      border: 1px solid rgba(212,175,55,0.45); border-radius: 8px;
      background: rgba(11,19,14,0.82); color:#f0e0b0; cursor:pointer;
      display:inline-flex; align-items:center; justify-content:center;
      font-size: 15px; line-height: 1; transition: background .15s ease, border-color .15s ease, opacity .15s ease;
    }
    .main-menu-music-btn:hover { background: rgba(212,175,55,0.14); border-color:#f0e0b0; }
    .main-menu-music-btn.is-muted { opacity: .62; }
    @media (max-width: 759px) {
      #options-menu-overlay { align-items: flex-start; padding: 10px; }
      .options-menu-panel {
        width: min(100%, 620px);
        max-height: calc(100vh - 20px);
        max-height: calc(100dvh - 20px);
        padding: 20px 16px;
      }
      .options-layout-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
      .options-column { padding: 8px 12px 12px; }
      .options-audio-row { align-items:flex-start; flex-direction:column; gap:8px; }
      .options-audio-controls { width:100%; max-width:none; grid-template-columns: minmax(92px, auto) minmax(100px, 1fr) 42px; }
    }
    @media (max-height: 640px) and (min-width: 760px) {
      #options-menu-overlay { padding: 8px 16px; }
      .options-menu-panel {
        max-height: calc(100vh - 16px);
        max-height: calc(100dvh - 16px);
        padding-top: 14px;
        padding-bottom: 14px;
      }
      .options-menu-title { margin-bottom: 10px; font-size: 22px; }
      .options-column { padding-top: 7px; padding-bottom: 9px; }
      .options-row { padding-top: 8px; padding-bottom: 8px; }
      .options-section-title { margin-top: 8px; }
      .options-danger-zone { margin-top: 14px; padding-top: 12px; }
      .options-back-btn { margin-top: 12px !important; }
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
      margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(224,122,107,0.3);
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
    .options-legal-links {
      margin: 12px 2px 0; display:flex; align-items:center; justify-content:center; gap:7px; flex-wrap:wrap;
      color:#878b83; font-size:11px; line-height:1.35; text-align:center;
    }
    .options-legal-links a { color:#bca967; text-decoration:none; }
    .options-legal-links a:hover { color:#ead789; text-decoration:underline; text-underline-offset:2px; }
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
const ESSENCE_ICON_HTML = `<img class="essence-icon" src="./assets/images/ui/esencia.png" alt="✦" onerror="this.outerHTML='✦'">`;
const MYTHIC_ICON_HTML = `<img class="mythic-icon" src="./assets/images/ui/mythic.png" alt="✦" onerror="this.outerHTML='✦'">`;

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
    .chest-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; margin-bottom:18px; }
    .chest-item {
      position:relative; min-height:190px; background:linear-gradient(180deg,rgba(24,36,27,.94),rgba(10,18,12,.98));
      border:2px solid rgba(212,175,55,.42); border-radius:16px; padding:18px;
      display:flex; flex-direction:column; align-items:center; justify-content:stretch; text-align:center;
      box-shadow:0 12px 36px rgba(0,0,0,.28); overflow:hidden;
    }
    .chest-item-content { flex:1 1 auto; min-height:0; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; }
    .chest-item > .reward-action-btn { flex:0 0 auto; margin-top:12px; }
    .chest-item.chest-mythic { border-color:#d9792f; box-shadow:0 0 30px rgba(217,121,47,.14),0 12px 36px rgba(0,0,0,.3); }
    .chest-item-icon { min-height:72px; display:flex; align-items:center; justify-content:center; font-size:54px; }
    .chest-item .coin-icon, .chest-item .ficha-icon, .chest-item .essence-icon, .chest-item .mythic-icon { width:68px; height:68px; object-fit:contain; }
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
    .daily-reward-icons .coin-icon, .daily-reward-icons .ficha-icon, .daily-reward-icons .essence-icon, .daily-reward-icons .mythic-icon { width:30px; height:30px; object-fit:contain; }
    .daily-reward-icons .reward-pack-icon { width:38px; height:38px; }
    .daily-reward-amount { font-size:11px; font-weight:900; color:#f0e0b0; }
    .daily-reward-check { position:absolute; right:-3px; top:-5px; width:27px; height:27px; border-radius:50%; background:#346c3d; border:2px solid #8bd397; display:flex; align-items:center; justify-content:center; color:white; font-weight:900; }
    .daily-reward-status { min-height:30px; font-size:10px; color:#8e9b91; text-align:center; }
    .daily-reward-day.unlocked .daily-reward-status { color:#f0d56a; font-weight:700; }
    .daily-reward-day.claimed .daily-reward-status { color:#7fc58a; }
    .daily-rewards-scroll { overflow-x:auto; overflow-y:hidden; padding-bottom:4px; }
    .daily-rewards-help { margin-top:12px; text-align:center; color:#8b998f; font-size:11px; }
    .daily-admin-debug { margin:0 auto 12px; max-width:760px; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; padding:8px 10px; border:1px dashed rgba(191,105,255,.65); border-radius:10px; color:#d7b8ef; background:rgba(90,38,120,.12); font-size:10px; }
    .main-menu-account-actions { display:flex; gap:6px; align-items:center; justify-content:flex-end; width:max-content; }
    /* HF23.3.16.2.19 — los badges pendientes de Cofre/Daily deben poder salir del marco
       cuadrado. Sólo abrimos overflow en la fila de cuenta; Tienda/Ranking/Mercado conservan
       su clipping histórico para que sus PNG sigan respetando el botón redondeado. */
    .main-menu-account-icon-btn { flex-shrink:0; overflow:visible; }
    .main-menu-reward-badge { position:absolute; z-index:8; min-width:15px; height:15px; line-height:15px; padding:0 3px; box-sizing:border-box; border-radius:9px; right:-6px; top:-7px; background:#c63d34; color:#fff; font-size:9px; text-align:center; border:1px solid #ffd0cc; pointer-events:none; box-shadow:0 1px 5px rgba(0,0,0,.65); }
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
    .daily-login-reward { margin:18px auto 6px; display:flex; align-items:center; justify-content:center; gap:16px; min-height:76px; }
    /* 23.21.6 HF3 — el resumen del modal no hereda el layout compacto de los 7 días.
       Los premios de un mismo día viven en UNA fila: sobre ×1 + moneda 100, sin wrap vertical. */
    .daily-login-reward .daily-reward-icons { max-width:none; min-height:68px; flex-wrap:nowrap; gap:7px; }
    .daily-login-reward .coin-icon, .daily-login-reward .ficha-icon, .daily-login-reward .essence-icon, .daily-login-reward .mythic-icon { width:60px; height:60px; flex:0 0 auto; object-fit:contain; }
    .daily-login-reward .reward-pack-icon { width:72px; height:72px; flex:0 0 auto; }
    .daily-login-reward .daily-reward-amount { font-size:14px; margin-right:5px; white-space:nowrap; }
    .daily-login-reward.daily-login-reward-mythic { flex-direction:column; gap:4px; }
    .daily-login-reward.daily-login-reward-mythic .daily-reward-icons { min-height:60px; }
    .daily-login-reward-text { font-size:18px; font-weight:900; color:#f0d56a; white-space:nowrap; }
    .daily-login-actions { display:flex; justify-content:center; align-items:stretch; gap:10px; margin-top:20px; flex-wrap:wrap; }
    /* El CTA principal tenía margin-top propio y quedaba desalineado respecto a secundarios. */
    .daily-login-actions .reward-action-btn,
    .daily-login-actions .reward-secondary-btn {
      margin-top:0; min-height:46px; box-sizing:border-box; padding:8px 16px;
      display:flex; align-items:center; justify-content:center; line-height:1.15;
    }
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
  if (reward?.type === 'guaranteedMythic') return `${MYTHIC_ICON_HTML}<span class="daily-reward-amount">Mítica</span>`;
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
  let recoveryInFlight = false;

  async function syncProfileAfterAuthority() {
    if (!state.currentUser?.uid) return null;
    const profile = await loadUserProfileFromServer(state.currentUser.uid);
    if (profile) {
      state.userProfile = profile;
      updateAccountUI(state.currentUser);
    }
    return profile;
  }

  function cardsFromIds(cardIds, expected = null) {
    const ids = Array.isArray(cardIds) ? cardIds : [];
    if (expected != null && ids.length !== expected) throw new Error('ECONOMY_REWARD_INVALID');
    const cards = ids.map(id => cardDb.getById(id));
    if (cards.some(card => !card)) throw new Error('ECONOMY_REWARD_UNKNOWN_CARD');
    return cards;
  }

  function economyChestMessage(err, fallback) {
    const code = String(err?.code || '');
    if (code === 'NO_PACKS_AVAILABLE') return 'No tenés sobres para abrir.';
    if (code === 'NO_MYTHICS_AVAILABLE') return 'No tenés recompensas míticas para abrir.';
    if (code === 'ECONOMY_DISABLED') return 'La economía está temporalmente pausada. Probá más tarde.';
    if (code === 'ECONOMY_CLIENT_TOO_OLD') return 'Actualizá la página para usar la versión económica vigente.';
    if (code === 'RESOURCE_EXHAUSTED') return 'Demasiadas operaciones seguidas. Esperá un momento y probá de nuevo.';
    return err?.message || fallback;
  }

  function showPackReveal(result, operationId = null) {
    const cards = cardsFromIds(result?.cardIds, 15);
    showPackOpeningExperience({
      cards,
      fichaTotal: Number(result?.fichasAfter ?? state.userProfile?.fichas ?? 0),
      renderCard: card => createCardElement(card, false, true, null, 'pack-opening', () => {}),
      onClose: () => {
        if (operationId) clearPendingEconomyReveal(state.currentUser?.uid, 'pack', operationId);
        renderChest();
      }
    });
  }

  function showMythicReveal(result) {
    const card = cardDb.getById(result?.cardId);
    if (!card || card.rarity !== 'Mythic') throw new Error('ECONOMY_MYTHIC_INVALID');
    showGuaranteedMythicExperience({
      card,
      renderCard: rewardCard => createCardElement(rewardCard, false, true, null, 'pack-opening', () => {}),
      onReveal: () => clearPendingEconomyReveal(state.currentUser?.uid, 'guaranteedMythic'),
      onClose: renderChest,
      autoStart: true
    });
  }

  async function recoverCommitted(type) {
    if (!state.currentUser?.uid || recoveryInFlight) return null;
    const pending = getPendingEconomyReveal(state.currentUser.uid, type);
    if (!pending) return null;
    recoveryInFlight = true;
    try {
      const recovered = await recoverEconomyOperationServer(pending.operationId);
      const operation = recovered?.operation;
      if (!operation) return { pending, committed: false };
      const expectedType = type === 'pack' ? 'chest.open_pack' : 'chest.open_guaranteed_mythic';
      if (operation.type !== expectedType || operation.status !== 'committed' || !operation.result) {
        throw new Error('ECONOMY_OPERATION_RECOVERY_MISMATCH');
      }
      await syncProfileAfterAuthority();
      return { pending, committed: true, result: operation.result };
    } finally {
      recoveryInFlight = false;
    }
  }

  async function runChestAuthority(type) {
    const uid = state.currentUser?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    let pending = getPendingEconomyReveal(uid, type);
    if (pending) {
      const recovered = await recoverCommitted(type);
      if (recovered?.committed) return { ...recovered, replayed: true };
    }
    if (!pending) {
      const operationId = createEconomyRevealOperationId(type);
      pending = beginEconomyReveal(uid, type, operationId);
      if (!pending) throw new Error('ECONOMY_RECOVERY_JOURNAL_FAILED');
    }
    const response = type === 'pack'
      ? await openPackAuthorityServer(pending.operationId)
      : await openGuaranteedMythicAuthorityServer(pending.operationId);
    const result = response?.result;
    if (!result) throw new Error('ECONOMY_REWARD_INVALID');
    await syncProfileAfterAuthority();
    return { pending, committed: true, result, replayed: response?.replayed === true };
  }

  function renderChest() {
    if (!state.currentUser || !state.userProfile) {
      body.innerHTML = `<div class="chest-future">${gameTextHtml('chest.loginRequired')}</div>`;
      return;
    }
    const inventory = normalizeInventory(state.userProfile.inventory);
    const points = Number(state.userProfile.points) || 0;
    const fichas = Number(state.userProfile.fichas) || 0;
    const essence = Number(state.userProfile.essence) || 0;
    const packs = inventory[CHEST_ITEM_KEYS.standardPack];
    const mythics = inventory[CHEST_ITEM_KEYS.guaranteedMythic];
    const pendingPack = getPendingEconomyReveal(state.currentUser.uid, 'pack');
    const pendingMythic = getPendingEconomyReveal(state.currentUser.uid, 'guaranteedMythic');
    const packAction = pendingPack ? 'REANUDAR APERTURA' : gameTextHtml('chest.packs.action');
    const mythicAction = pendingMythic ? gameTextHtml('chest.mythic.resumeAction') : gameTextHtml('chest.mythic.action');
    body.innerHTML = `
      <div class="chest-summary">
        <div class="chest-item">
          <div class="chest-item-content"><div class="chest-item-icon">${COIN_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.points.title')}</div><div class="chest-item-count">${points}</div>
          <div class="chest-item-desc">${gameTextHtml('chest.points.description')}</div></div>
        </div>
        <div class="chest-item">
          <div class="chest-item-content"><div class="chest-item-icon">${FICHA_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.fichas.title')}</div><div class="chest-item-count">${fichas}</div>
          <div class="chest-item-desc">${gameTextHtml('chest.fichas.description')}</div></div>
          <button class="reward-action-btn" id="chest-use-fichas" ${fichas < FICHAS_PER_ENHANCEMENT ? 'disabled' : ''}>${gameTextHtml('chest.fichas.action')}</button>
        </div>
        <div class="chest-item chest-essence">
          <div class="chest-item-content"><div class="chest-item-icon">${ESSENCE_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.essence.title')}</div><div class="chest-item-count">${essence}</div>
          <div class="chest-item-desc">${gameTextHtml('chest.essence.description')}</div></div>
          <button class="reward-action-btn" id="chest-use-essence">${gameTextHtml('chest.essence.action')}</button>
        </div>
        <div class="chest-item">
          <div class="chest-item-content"><div class="chest-item-icon">${PACK_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.packs.title')}</div><div class="chest-item-count">${packs}</div>
          <div class="chest-item-desc">${pendingPack ? 'Apertura pendiente: el servidor conserva exactamente el resultado acreditado.' : gameTextHtml('chest.packs.description')}</div></div>
          <button class="reward-action-btn" id="chest-open-pack" ${packs < 1 && !pendingPack ? 'disabled' : ''}>${packAction}</button>
        </div>
        <div class="chest-item chest-mythic">
          <div class="chest-item-content"><div class="chest-item-icon">${MYTHIC_ICON_HTML}</div><div class="chest-item-title">${gameTextHtml('chest.mythic.title')}</div><div class="chest-item-count">${mythics}</div>
          <div class="chest-item-desc">${pendingMythic ? gameTextHtml('chest.mythic.pendingDescription') : gameTextHtml('chest.mythic.description')}</div></div>
          <button class="reward-action-btn" id="chest-open-mythic" ${mythics < 1 && !pendingMythic ? 'disabled' : ''}>${mythicAction}</button>
        </div>
      </div>
      <div class="chest-future">${gameTextHtml('chest.future')}</div>`;

    body.querySelector('#chest-use-fichas')?.addEventListener('click', () => {
      overlay.remove();
      showWorkshopScreen(() => showChestScreen(onBack), { autoOpenMachine1: true });
    });

    body.querySelector('#chest-use-essence')?.addEventListener('click', () => {
      overlay.remove();
      showWorkshopScreen(() => showChestScreen(onBack));
    });

    body.querySelector('#chest-open-pack')?.addEventListener('click', async () => {
      const btn = body.querySelector('#chest-open-pack');
      try {
        await withEconomyButtonPending(btn, async () => {
          const outcome = await runChestAuthority('pack');
          if (!outcome.replayed) {
            void recordChestAuthorityStatsBestEffort(state.currentUser.uid, outcome.result)
              .catch(err => console.warn('[Economy 23.19.5.1] Stats de apertura de Pack no disponibles:', err));
          }
          showPackReveal(outcome.result, outcome.pending.operationId);
        }, { pendingLabel:'ABRIENDO...' });
      } catch (err) {
        console.error('No se pudo abrir el sobre server-authoritative:', err);
        showSimpleAlertModal(economyChestMessage(err, 'No se pudo abrir el sobre. Probá de nuevo.'));
        renderChest();
      }
    });

    body.querySelector('#chest-open-mythic')?.addEventListener('click', async () => {
      const btn = body.querySelector('#chest-open-mythic');
      try {
        await withEconomyButtonPending(btn, async () => {
          const outcome = await runChestAuthority('guaranteedMythic');
          if (!outcome.replayed) {
            void recordChestAuthorityStatsBestEffort(state.currentUser.uid, outcome.result)
              .catch(err => console.warn('[Economy 23.19.5.1] Stats de Mítica no disponibles:', err));
          }
          showMythicReveal(outcome.result);
        }, { pendingLabel:'REVELANDO...' });
      } catch (err) {
        console.error('No se pudo revelar la recompensa mítica server-authoritative:', err);
        showSimpleAlertModal(economyChestMessage(err, gameText('chest.mythic.reconcileError')));
        renderChest();
      }
    });
  }

  renderChest();

  // Durable recovery for BOTH chest item types. We do not automatically consume a fresh item;
  // only already-journaled operationIds are recovered. Pack auto-resume shows the exact 15
  // committed cards; Mythic auto-resume shows the exact committed server-selected card.
  window.setTimeout(async () => {
    if (!state.currentUser?.uid || !document.body.contains(overlay)) return;
    try {
      const pack = await recoverCommitted('pack');
      if (pack?.committed && document.body.contains(overlay)) {
        showPackReveal(pack.result, pack.pending.operationId);
        return;
      }
      const mythic = await recoverCommitted('guaranteedMythic');
      if (mythic?.committed && document.body.contains(overlay)) {
        showMythicReveal(mythic.result);
      }
    } catch (err) {
      console.warn('[Economy 23.19.5.1] No se pudo auto-reconciliar una apertura pendiente:', err);
      renderChest();
    }
  }, 0);
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
      try {
        await withEconomyButtonPending(btn, async () => {
          const result = await adminAdvanceDailyRewardDebugDay(state.currentUser.uid);
          state.userProfile = result.profile;
          updateAccountUI(state.currentUser);
          renderRewards();
          if (result.login?.newCalendarLogin) showDailyLoginRewardModal(result.login);
        }, { pendingLabel:'PROCESANDO...' });
      } catch (err) {
        console.error('No se pudo avanzar el día de debug:', err);
        showSimpleAlertModal(err.message || 'No se pudo avanzar el día de debug.');
        renderRewards();
      }
    });
    body.querySelector('#daily-debug-reset')?.addEventListener('click', async () => {
      const btn = body.querySelector('#daily-debug-reset');
      try {
        await withEconomyButtonPending(btn, async () => {
          const result = await adminResetDailyRewardDebug(state.currentUser.uid);
          state.userProfile = result.profile;
          updateAccountUI(state.currentUser);
          renderRewards();
          if (result.login?.newCalendarLogin) showDailyLoginRewardModal(result.login);
        }, { pendingLabel:'PROCESANDO...' });
      } catch (err) {
        console.error('No se pudo resetear el reloj de debug:', err);
        showSimpleAlertModal(err.message || 'No se pudo resetear el reloj de debug.');
        renderRewards();
      }
    });

    body.querySelectorAll('[data-claim-day]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const day = Number(btn.dataset.claimDay);
        try {
          await withEconomyButtonPending(btn, async () => {
            state.userProfile = await claimDailyReward(state.currentUser.uid, day);
            updateAccountUI(state.currentUser);
            renderRewards();
          }, { pendingLabel:'RECLAMANDO...' });
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
  const isMythicReward = !!reward?.rewards?.some(item => item?.type === 'guaranteedMythic');
  modal.innerHTML = `
    <div class="daily-login-panel">
      <div class="daily-login-kicker">RECOMPENSA DIARIA</div>
      <div class="daily-login-title">¡Felicitaciones!</div>
      <div class="daily-login-copy">Llevás <strong>${loginInfo.streak} logueo${loginInfo.streak === 1 ? '' : 's'} seguido${loginInfo.streak === 1 ? '' : 's'} de 7</strong>.${loginInfo.streakReset ? '<br>Tu racha anterior se cortó y hoy empezaste una nueva.' : ''}</div>
      ${reward ? `<div class="daily-login-reward${isMythicReward ? ' daily-login-reward-mythic' : ''}"><div class="daily-reward-icons">${reward.rewards.map(rewardIconHTML).join('')}</div><div class="daily-login-reward-text">${rewardDescription(reward)}</div></div>` : ''}
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
    if (closed) return;
    modal.remove();
    const menu = document.getElementById('main-menu-overlay');
    if (menu) menu.style.display = 'none';
    showDailyRewardsScreen(() => {
      if (menu) menu.style.display = '';
      finish('view_rewards');
    });
  });
  modal.querySelector('#daily-login-claim')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#daily-login-claim');
    const result = modal.querySelector('#daily-login-result');
    try {
      await withEconomyButtonPending(btn, async () => {
        state.userProfile = await claimDailyReward(state.currentUser.uid, loginInfo.rewardDay);
        updateAccountUI(state.currentUser);
        result.innerHTML = `✅ <strong>¡Premio reclamado!</strong>${reward?.rewards.some(r => r.type === 'standardPack' || r.type === 'guaranteedMythic') ? ' Los items quedaron guardados en Mi Cofre.' : ''}`;
        btn.remove();
      }, { pendingLabel:'RECLAMANDO...' });
    } catch (err) {
      console.error('No se pudo reclamar el premio del login:', err);
      result.textContent = err.message || 'No se pudo reclamar el premio. Probá de nuevo.';
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
  { key: 'planeswalkers', label: 'Semidioses' },
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

const ARCHETYPE_FILTER_ICONS = Object.freeze({
  aggro:'⚔️', tempo:'💨', midrange:'⚖️', control:'🛡️', tokens:'👥', counters:'➕', sacrifice:'🩸', graveyard:'⚰️', exile:'🔥', typal:'🧬', dragons:'🐉', artifacts:'⚙️', spells:'✨', suspend:'⏳', transform:'↻', ramp:'🌱'
});
const CARD_BROWSER_ARCHETYPES = ARCHETYPE_IDS.map(key => ({ key, label:`${ARCHETYPE_FILTER_ICONS[key] || '•'} ${getArchetypeDefinition(key)?.label || key}` }));
const CARD_BROWSER_MECHANICS = [
  { key:'poison', label:'☠️ Veneno', effectTypes:['poison','proliferate'] },
  { key:'draw', label:'🃏 Robo', effectTypes:['draw','draw_and_lose_life','loot','rummage'] },
  { key:'heal', label:'❤️ Curación', effectTypes:['heal','drain'], keywords:['lifelink'] }
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
  const profile = inferCardDeckProfile(card);
  const themes = new Set(profile.themes || []);
  const roles = new Set(profile.roles || []);
  const result = new Set();
  for (const id of ARCHETYPE_IDS) {
    let match = themes.has(id);
    if (id === 'tempo') match = themes.has('spells') && (themes.has('aggro') || roles.has('selection') || roles.has('broadInteraction')) && Number(profile.mv) <= 4;
    if (match) result.add(id);
  }
  return result;
}
function getCardMechanicTags(card) {
  const mechanics = collectCardMechanics(card);
  const keywords = new Set((card?.keywords || []).map(k => String(k).toLowerCase()));
  const result = new Set();
  CARD_BROWSER_MECHANICS.forEach(def => {
    if (def.effectTypes.some(type => mechanics.has(type)) || (def.keywords || []).some(keyword => keywords.has(keyword))) result.add(def.key);
  });
  return result;
}

function cardFilterColors(card) {
  // HF23.2 — una Tierra se filtra por el maná que produce, no por su color mecánico.
  // Para no-Tierras se conserva card.colors y las cartas sin color siguen perteneciendo a C.
  // Es autocontenido porque lo comparten Enciclopedia, Editar mazo y Mercado.
  const allowed = new Set(['W','U','B','R','G','C']);
  const normalizedType = String(card?.type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isLand = normalizedType.includes('tierra') || normalizedType.includes('land');
  if (!isLand) {
    const colors = Array.isArray(card?.colors) ? card.colors.map(value => String(value).toUpperCase()) : [];
    const filtered = [...new Set(colors.filter(value => allowed.has(value)))];
    return filtered.length ? filtered : ['C'];
  }
  const produced = [];
  if (card?.produces != null) produced.push(card.produces);
  if (Array.isArray(card?.producesOptions)) produced.push(...card.producesOptions);
  const colors = produced.map(value => String(value).toUpperCase()).filter(value => allowed.has(value));
  return [...new Set(colors.length ? colors : ['C'])];
}

function cardMatchesColorFilter(card, activeColors) {
  if (activeColors.size === CARD_BROWSER_COLORS.length) return true;
  return cardFilterColors(card).some(color => activeColors.has(color));
}

function cardMatchesTaxonomyFilter(card, activeArchetypes, activeMechanics) {
  const archetypeOk = activeArchetypes.size === 0 || [...activeArchetypes].some(key => getCardArchetypes(card).has(key));
  const mechanicOk = activeMechanics.size === 0 || [...activeMechanics].some(key => getCardMechanicTags(card).has(key));
  return archetypeOk && mechanicOk;
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

function browserMechanicFiltersHTML(prefix) {
  return CARD_BROWSER_MECHANICS.map(mechanic => `
    <label class="encyclopedia-filter-option">
      <input type="checkbox" data-browser-mechanic="${mechanic.key}" data-filter-prefix="${prefix}">
      ${mechanic.label}
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
  return new Set(cardDb.enabledCards.map(c => c.id));
}


const DECKBUILDER_RECENT_STORAGE_VERSION = 1;

function deckbuilderRecentStorageKey() {
  const uid = state.currentUser?.uid;
  return uid ? `argentinia.deckbuilderRecent.v${DECKBUILDER_RECENT_STORAGE_VERSION}.${uid}` : null;
}

function collectionCountsAndLastIndex(collection = []) {
  const counts = Object.create(null);
  const lastIndex = new Map();
  (Array.isArray(collection) ? collection : []).forEach((rawId, index) => {
    const id = String(rawId || '');
    if (!id) return;
    counts[id] = (counts[id] || 0) + 1;
    lastIndex.set(id, index);
  });
  return { counts, lastIndex };
}

function loadDeckbuilderRecentState(collection = []) {
  const key = deckbuilderRecentStorageKey();
  const snapshot = collectionCountsAndLastIndex(collection);
  if (!key || typeof localStorage === 'undefined') return { ...snapshot, newAt: Object.create(null), save(){} };

  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  const previousCounts = stored && stored.version === DECKBUILDER_RECENT_STORAGE_VERSION && stored.knownCounts && typeof stored.knownCounts === 'object'
    ? stored.knownCounts : null;
  const newAt = stored && stored.version === DECKBUILDER_RECENT_STORAGE_VERSION && stored.newAt && typeof stored.newAt === 'object'
    ? { ...stored.newAt } : Object.create(null);

  // First encounter establishes a baseline so a veteran account does not suddenly get
  // hundreds of historical NUEVA badges. From then on, every increase in owned copies
  // becomes new, regardless of whether it came from packs, classifieds, prebuilt or trade.
  if (previousCounts) {
    for (const [id, count] of Object.entries(snapshot.counts)) {
      if (count > Math.max(0, Number(previousCounts[id]) || 0)) {
        newAt[id] = snapshot.lastIndex.get(id) ?? 0;
      }
    }
    for (const id of Object.keys(newAt)) {
      if (!(snapshot.counts[id] > 0)) delete newAt[id];
    }
  }

  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify({
        version: DECKBUILDER_RECENT_STORAGE_VERSION,
        knownCounts: snapshot.counts,
        newAt
      }));
    } catch {}
  };
  persist();
  return { ...snapshot, newAt, save: persist };
}

export function getDeckBuilderOwnedCounts() {
  const counts = {};
  if (isAdminUser()) {
    cardDb.enabledCards.forEach(card => {
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
    .encyclopedia-publication-control { margin-top:7px; display:flex; align-items:center; justify-content:center; gap:7px; padding:5px 8px; border-radius:7px; border:1px solid rgba(45,77,52,.25); background:#eef2eb; color:#233225; font-size:11px; font-weight:850; letter-spacing:.04em; user-select:none; }
    .encyclopedia-publication-control.unpublished { background:#fff0ec; color:#8b2b22; border-color:rgba(139,43,34,.35); }
    .encyclopedia-publication-control input { accent-color:#347a43; }
    .encyclopedia-publication-control .publication-note { font-size:9px; font-weight:700; opacity:.75; letter-spacing:0; }
    .encyclopedia-art-edit-btn {
      position:absolute; top:30px; right:5px; z-index:35; width:24px; height:24px; padding:0;
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
    .encyclopedia-evolution-buttons { display:flex; justify-content:center; gap:6px; margin-top:7px; }
    .encyclopedia-evolution-btn { border:1px solid rgba(96,145,103,.58); background:#e8f0e8; color:#1f4c29; border-radius:7px; padding:4px 8px; font-size:10px; font-weight:900; letter-spacing:.035em; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.18); }
    .encyclopedia-evolution-btn:hover { background:#d6e8d8; transform:translateY(-1px); }
    .encyclopedia-evolution-btn.active { background:#315f39; border-color:#d4af37; color:#fff4c2; box-shadow:0 0 0 1px rgba(212,175,55,.3),0 2px 5px rgba(0,0,0,.25); }
    .encyclopedia-evolution-btn.locked:not(.active) { opacity:.72; }
    .encyclopedia-evolvable-filter-icon { width:16px; height:16px; object-fit:contain; flex:0 0 16px; filter:drop-shadow(0 0 2px rgba(0,0,0,.7)); }
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
  const evolutionProfile = normalizeEvolutionProfile(state.userProfile?.evolutions);
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
  let evolvableOnly = false;
  // 23.21.6 HF3 — superficie operativa sólo Admin para revisar/publicar expansiones nuevas.
  let unpublishedOnly = false;
  let searchQuery = '';
  const activeRarities = new Set(ENCYCLOPEDIA_RARITIES.map(r => r.key));
  const activeColors = new Set(CARD_BROWSER_COLORS.map(c => c.key));
  const activeArchetypes = new Set();
  const activeMechanics = new Set();
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
        <label class="encyclopedia-filter-option">
          <input type="checkbox" id="enc-evolvable-only">
          <img class="encyclopedia-evolvable-filter-icon" src="./assets/images/ui/evolucionable.png" alt="" aria-hidden="true">
          ${gameTextHtml('encyclopedia.filter.evolvable')}
        </label>
        ${isAdminUser() ? `<label class="encyclopedia-filter-option encyclopedia-admin-publication-filter">
          <input type="checkbox" id="enc-unpublished-only">
          ${gameTextHtml('encyclopedia.filter.unpublished')}
        </label>` : ''}
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.color')}</div>
        <div class="card-browser-filter-grid">${browserColorFiltersHTML('enc')}</div>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.rarity')}</div>
        <div class="card-browser-filter-grid">${rarityFiltersHTML}</div>
        <div class="encyclopedia-filter-section-title">${gameTextHtml('encyclopedia.filter.archetype')}</div>
        <div class="card-browser-filter-grid archetypes">${browserArchetypeFiltersHTML('enc')}</div>
        <div class="encyclopedia-filter-section-title">Mecánicas</div>
        <div class="card-browser-filter-grid archetypes">${browserMechanicFiltersHTML('enc')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  applyCardZoom(overlay, defaultZoom, { cssVar: '--card-w', unit: 'vh', min: encyclopediaMinZoom, max: 50, fallback: defaultZoom });

  const gridBox = overlay.querySelector('#enc-grid');

  function normalizeSearch(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // HF23.3.16.2.22 — evolución inline en Enciclopedia. Admin puede inspeccionar
  // Base/Evo1/Evo2 sin que eso altere la colección ni el stage persistido del perfil.
  function mountEncyclopediaTextEditor(slot, displayCard) {
    if (!isAdminUser()) return;
    const textBox = slot.querySelector(':scope > .card .card-text-box');
    const textLayoutId = transformFaceLayoutId(displayCard);
    if (!textBox || !textLayoutId) return;
    textBox.style.position = 'relative';
    const editTextBtn = document.createElement('button');
    editTextBtn.type = 'button';
    editTextBtn.className = `encyclopedia-text-edit-btn${hasCustomCardTextLayout(textLayoutId) ? ' has-custom-layout' : ''}`;
    editTextBtn.textContent = '✏️';
    editTextBtn.title = hasCustomCardTextLayout(textLayoutId) ? 'Ajustar texto de la carta (personalizado)' : 'Ajustar texto de la carta';
    editTextBtn.setAttribute('aria-label', `Ajustar presentación del texto de ${displayCard.name}`);
    editTextBtn.dataset.textCardId = textLayoutId;
    editTextBtn.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation(); editTextBtn.disabled = true;
      try {
        await openCardTextLayoutEditor({
          card: displayCard, layoutId: textLayoutId,
          renderCard: previewCard => createCardElement(previewCard, false, true, null, 'preview', null),
          onSaved: (_layout, meta) => {
            editTextBtn.classList.toggle('has-custom-layout', !!meta?.custom);
            editTextBtn.title = meta?.custom ? 'Ajustar texto de la carta (personalizado)' : 'Ajustar texto de la carta';
            if (meta?.nameChanged) setTimeout(() => { if (overlay.isConnected) { overlay.remove(); showEncyclopedia(onBack); } }, 450);
          }
        });
      } catch (error) {
        console.error('No se pudo abrir el editor de texto:', error);
        window.alert(`No se pudo abrir el editor de texto: ${error?.message || error}`);
      } finally { if (editTextBtn.isConnected) editTextBtn.disabled = false; }
    });
    textBox.appendChild(editTextBtn);
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
        : cardDb.getByCategory(tabKey, { includeDisabled: isAdminUser() });
    sourceCards.forEach(card => {
      // Tokens y reversos DFC son superficies Admin de assets, no objetos adicionales de
      // colección: siempre se renderizan a pleno color y no participan de "poseo".
      const owned = isAssetTab ? true : ownedIds.has(card.id);
      const slot = document.createElement('div');
      slot.className = `encyclopedia-card-slot${owned ? '' : ' unowned'}${isTokenTab ? ' encyclopedia-token-slot' : ''}${isDfcBackTab ? ' encyclopedia-dfc-back-slot' : ''}`;
      slot.__encyclopediaDisplayCard = card;
      slot.__encyclopediaEvolutionStage = 0;

      const evolutionStageVisible = stageNumber => stageNumber === 0 || isAdminUser() || isEvolutionStageDiscovered(evolutionProfile, card.id, stageNumber);
      const renderEncyclopediaStage = stageNumber => {
        const normalizedStage = isEvolutionEligibleCard(card) ? Math.max(0, Math.min(2, Number(stageNumber) || 0)) : 0;
        const displayCard = normalizedStage > 0 ? applyEvolutionStage(card, normalizedStage) : card;
        const visible = normalizedStage === 0 ? owned : evolutionStageVisible(normalizedStage);
        const nextCard = createCardElement(displayCard, false, true, null, 'encyclopedia', null);
        const currentCard = slot.querySelector(':scope > .card');
        if (currentCard) currentCard.replaceWith(nextCard); else slot.prepend(nextCard);
        slot.__encyclopediaDisplayCard = displayCard;
        slot.__encyclopediaEvolutionStage = normalizedStage;
        slot.classList.toggle('unowned', !visible);
        slot.querySelectorAll('.encyclopedia-evolution-btn').forEach(btn => {
          const active = Number(btn.dataset.evolutionStage || 0) === normalizedStage;
          btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        mountEncyclopediaTextEditor(slot, displayCard);
        slot.dispatchEvent(new CustomEvent('encyclopedia-stage-change', { detail:{ card:displayCard, stage:normalizedStage, visible } }));
      };
      renderEncyclopediaStage(0);

      // HF23.3.16.2.22 — Base/Evo1/Evo2 cambian la carta EN EL MISMO slot. Para jugadores
      // el arte no descubierto sigue oculto; Admin siempre puede inspeccionar los 40 stages
      // sin adquirirlos ni mutar users/{uid}.evolutions.
      if (!isAssetTab && isEvolutionEligibleCard(card)) {
        const evoButtons=document.createElement('div'); evoButtons.className='encyclopedia-evolution-buttons';
        for (const stageNumber of [0,1,2]) {
          const button=document.createElement('button'); button.type='button';
          button.className=`encyclopedia-evolution-btn${stageNumber===0?' active':''}`;
          button.textContent=stageNumber===0?gameText('encyclopedia.evolution.base'):gameText(`encyclopedia.evolution.stage${stageNumber}`);
          button.dataset.evolutionStage=String(stageNumber);
          button.setAttribute('aria-pressed', stageNumber===0?'true':'false');
          const visible=evolutionStageVisible(stageNumber);
          if (!visible) { button.classList.add('locked'); button.title=gameText('encyclopedia.evolution.locked'); }
          button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();renderEncyclopediaStage(stageNumber);});
          evoButtons.appendChild(button);
        }
        slot.appendChild(evoButtons);
      }

      // 23.13.23 — el editor existe EXCLUSIVAMENTE en Enciclopedia y sólo para Admin.
      // La seguridad real del SAVE sigue en Firestore Rules; este gate es además UX.
      if (isAdminUser() && card.image) {
        const editArtBtn = document.createElement('button');
        editArtBtn.type = 'button'; editArtBtn.className = 'encyclopedia-art-edit-btn'; editArtBtn.textContent = '✏️';
        const syncArtEditor = () => {
          const displayCard = slot.__encyclopediaDisplayCard || card;
          const artLayoutId = displayCard.isToken ? tokenArtLayoutId(displayCard.image, displayCard.name) : transformFaceLayoutId(displayCard);
          editArtBtn.dataset.artCardId = artLayoutId;
          editArtBtn.classList.toggle('has-custom-layout', hasCustomArtLayout(artLayoutId));
          editArtBtn.title = hasCustomArtLayout(artLayoutId) ? 'Editar encuadre del arte (personalizado)' : 'Editar encuadre del arte';
          editArtBtn.setAttribute('aria-label', `Editar encuadre del arte de ${displayCard.name}`);
        };
        editArtBtn.addEventListener('click', async event => {
          event.preventDefault(); event.stopPropagation(); editArtBtn.disabled = true;
          const displayCard = slot.__encyclopediaDisplayCard || card;
          const artLayoutId = displayCard.isToken ? tokenArtLayoutId(displayCard.image, displayCard.name) : transformFaceLayoutId(displayCard);
          try {
            await openArtLayoutEditor({ card:displayCard, layoutId:artLayoutId, renderCard: previewCard => createCardElement(previewCard, false, true, null, 'preview', null), onSaved: (_layout, meta) => { editArtBtn.classList.toggle('has-custom-layout', !!meta?.custom); editArtBtn.title = meta?.custom ? 'Editar encuadre del arte (personalizado)' : 'Editar encuadre del arte'; } });
          } catch (error) {
            console.error('No se pudo abrir el editor de arte:', error); window.alert(`No se pudo abrir el editor de arte: ${error?.message || error}`);
          } finally { if (editArtBtn.isConnected) editArtBtn.disabled = false; }
        });
        slot.addEventListener('encyclopedia-stage-change', syncArtEditor);
        slot.appendChild(editArtBtn); syncArtEditor();
      }

      // 23.21.5 — publication authority. Admin sees the entire physical catalog; players
      // only receive enabled cards. Historical 880 default enabled, future IDs default OFF.
      if (isAdminUser() && !isAssetTab) {
        const publication = document.createElement('label');
        publication.className = `encyclopedia-publication-control${card.enabled === false ? ' unpublished' : ''}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = card.enabled !== false;
        checkbox.dataset.publicationCardId = card.id;
        const labelText = document.createElement('span');
        labelText.textContent = 'HABILITADA';
        const note = document.createElement('span'); note.className='publication-note'; note.textContent = checkbox.checked ? 'PUBLICADA' : 'NO PUBLICADA';
        publication.append(checkbox,labelText,note);
        checkbox.addEventListener('change', async event => {
          event.preventDefault(); event.stopPropagation();
          const desired = checkbox.checked;
          checkbox.disabled = true;
          try {
            if (desired) {
              if (!card.image) throw new Error('La carta no tiene imagen asignada.');
              const manifest = await cardDb.loadImageManifest();
              const missing = Array.isArray(manifest?.missing) ? manifest.missing : [];
              if (missing.some(item => String(item?.id||'')===String(card.id) && item?.face !== 'back')) {
                throw new Error(`Falta la imagen ${card.image}. Subila antes de habilitar la carta.`);
              }
            }
            await saveCardCatalogOverride(card,{enabled:desired},{allCards:cardDb.allCards});
            cardDb.refreshPublicationState();
            card.enabled = desired;
            publication.classList.toggle('unpublished', !desired);
            note.textContent = desired ? 'PUBLICADA' : 'NO PUBLICADA';
            if (unpublishedOnly) refreshGrid();
          } catch (error) {
            checkbox.checked = !desired;
            window.alert(`No se pudo ${desired?'habilitar':'suspender'} la carta: ${error?.message || error}`);
          } finally { checkbox.disabled = false; }
        });
        slot.appendChild(publication);
      }

      fragment.appendChild(slot);
      entry.records.push({ card, node: slot, owned, enhanced: isAssetTab ? false : enhancedIds.has(card.id), evolvable: !isAssetTab && isEvolutionEligibleCard(card), token: isTokenTab, dfcBack: isDfcBackTab, assetOnly: isAssetTab });
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
          cardMatchesTaxonomyFilter(card, activeArchetypes, activeMechanics) &&
          (ownershipFilter !== 'owned' || record.owned) &&
          (!enhancedOnly || record.enhanced) &&
          (!evolvableOnly || record.evolvable) &&
          (!unpublishedOnly || card.enabled === false) &&
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

  overlay.querySelector('#enc-evolvable-only').addEventListener('change', e => {
    evolvableOnly = !!e.target.checked;
    refreshGrid();
  });

  overlay.querySelector('#enc-unpublished-only')?.addEventListener('change', e => {
    unpublishedOnly = !!e.target.checked;
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

  overlay.querySelectorAll('input[data-browser-mechanic][data-filter-prefix="enc"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const mechanic = checkbox.getAttribute('data-browser-mechanic');
      if (checkbox.checked) activeMechanics.add(mechanic); else activeMechanics.delete(mechanic);
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
    .store-loading-panel {
      min-height:min(520px,68dvh); display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:12px; padding:32px 20px; box-sizing:border-box; text-align:center; color:#cfe0d4;
      border:1px solid rgba(212,175,55,.18); border-radius:16px;
      background:radial-gradient(circle at center,rgba(32,49,37,.58),rgba(9,16,11,.34) 68%,rgba(9,16,11,.08));
    }
    .store-loading-spinner { width:36px; height:36px; border-width:3px; color:#d4af37; margin-bottom:4px; }
    .store-loading-title { color:#f0e0b0; font-size:20px; font-weight:850; letter-spacing:.02em; }
    .store-loading-desc { max-width:520px; color:#aebfb3; font-size:13px; line-height:1.5; }
    .store-loading-error { border-color:rgba(224,122,107,.35); }
    .store-loading-error .store-loading-title { color:#f0c2b8; }
    .store-loading-error .store-buy-btn { margin-top:6px; min-width:170px; }
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
    .store-market-item { min-width:0; max-width:none; min-height:300px; justify-content:stretch; }
    .store-market-item .chest-item-icon { min-height:112px; }
    .store-market-item .chest-item-desc { min-height:0; margin-top:2px; }
    .store-market-count { font-size:23px; line-height:1.15; margin:5px 0 8px; white-space:normal; }
    .store-market-count-classifieds { color:#8dc5e4; }
    .store-market-item .reward-action-btn { width:100%; min-height:42px; }
    .store-market-item .store-error-msg { min-height:16px; margin-top:7px; }
    .store-discount-note { display:inline-block; font-size:11px; color:#f5d777; margin-left:3px; }
    .store-classifieds-icon { width:120px; height:120px; object-fit:contain; filter:drop-shadow(0 5px 12px rgba(116,172,223,.24)); }
    .store-emote-showcase-icon { width:120px; height:120px; display:flex; align-items:center; justify-content:center; font-size:72px; line-height:1; }
    .store-emote-showcase-img { width:120px; height:120px; object-fit:contain; filter:drop-shadow(0 5px 12px rgba(116,172,223,.24)); }
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
    .store-craft-browser { margin:12px 0; }
    .store-craft-browser .trade-explore-results { min-height:180px; }
    .store-craft-browser .store-craft-list { margin:0; max-height:54vh; }
    .store-craft-filter-note { color:#8f856e; font-size:10px; line-height:1.3; }
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

    /* 23.21.4 — Packs de Tierras Básicas: sección deliberadamente separada de las
       siete ofertas semanales. Comparte weekKey/reset, pero no slots ni cupos 4/2/1. */
    .classifieds-basic-land-section {
      margin:24px 0 15px; padding:16px 14px 14px; border-radius:13px;
      border:1px solid rgba(116,172,223,.34);
      background:linear-gradient(180deg,rgba(17,38,48,.54),rgba(7,17,14,.48));
      box-shadow:inset 0 0 30px rgba(116,172,223,.035);
    }
    .classifieds-basic-land-header { text-align:center; margin:0 auto 14px; max-width:760px; }
    .classifieds-basic-land-title { color:#f0e0b0; font-size:18px; font-weight:900; letter-spacing:.055em; }
    .classifieds-basic-land-subtitle { color:#b8c9cf; font-size:11px; line-height:1.45; margin-top:5px; }
    .classifieds-basic-land-strip {
      display:grid; grid-template-columns:repeat(5,minmax(145px,1fr)); align-items:start; gap:13px;
    }
    .classifieds-land-pack-slot { --card-w:min(156px,100%); }
    .classifieds-land-pack-title { color:#d8edf5; font-size:11px; font-weight:850; text-align:center; min-height:16px; }
    .classifieds-land-pack-quantity-badge {
      position:absolute; z-index:5; top:4px; left:4px; min-width:44px; padding:5px 8px; border-radius:999px;
      background:rgba(8,14,18,.95); border:1px solid rgba(240,224,176,.76);
      color:#fff3c9; font-size:15px; font-weight:950; letter-spacing:.025em; text-align:center;
      box-shadow:0 3px 10px rgba(0,0,0,.48);
    }
    .classifieds-land-pack-price { min-height:21px; }
    .classifieds-land-pack-week { color:#8eb4c2; font-size:9px; text-align:center; min-height:12px; }

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
    html.argentinia-mobile .store-market-item .store-emote-showcase-icon,
    html.argentinia-mobile .store-market-item .store-emote-showcase-img { width:96px; height:96px; }
    html.argentinia-mobile .store-market-item .store-emote-showcase-icon { font-size:58px; }
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
    html.argentinia-mobile .classifieds-basic-land-section { margin-top:16px; padding:11px 8px 10px; }
    html.argentinia-mobile .classifieds-basic-land-title { font-size:14px; }
    html.argentinia-mobile .classifieds-basic-land-subtitle { font-size:9px; }
    html.argentinia-mobile .classifieds-basic-land-strip { grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:8px; }
    html.argentinia-mobile .classifieds-land-pack-slot { --card-w:min(37dvh,145px); }
    html.argentinia-mobile .classifieds-land-pack-quantity-badge { min-width:36px; padding:4px 6px; font-size:12px; }
    html.argentinia-mobile .classifieds-land-pack-title { font-size:9px; }
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
  const craftOnly = options.craftOnly === true;
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
    clearStoreLoadingSlowTimer();
    storeMainViewSerial += 1;
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
      if (!craftOnly) void renderMainView({ openPointsInfo: true });
    });
  }

  let craftSelectedCardId = null;
  // HF8 — browser de crafteo con el mismo lenguaje de filtros que Mis publicaciones.
  const craftFilters = { query:'', colors:new Set(), rarity:'' };
  // 23.13.37 craft hotfix — tamaño persistente dentro del selector de criaturas.
  let craftCardZoom = document.documentElement.classList.contains('argentinia-mobile') ? 20 : 14;
  let classifiedsTimerId = null;
  let classifiedsViewSerial = 0;
  let storefrontAuthority = null;
  let storefrontAuthorityAt = 0;
  let storefrontAuthorityPromise = null;
  let storeMainViewSerial = 0;
  let storeLoadingSlowTimerId = null;
  const STOREFRONT_AUTHORITY_CACHE_MS = 15000;
  const STOREFRONT_LOADING_SLOW_AFTER_MS = 2800;

  function clearStoreLoadingSlowTimer() {
    if (storeLoadingSlowTimerId !== null) {
      clearTimeout(storeLoadingSlowTimerId);
      storeLoadingSlowTimerId = null;
    }
  }

  function renderStoreLoadingState(renderSerial) {
    ensureEconomyPendingStyles();
    clearStoreLoadingSlowTimer();
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = `
      <div class="store-loading-panel" role="status" aria-live="polite">
        <span class="economy-pending-spinner store-loading-spinner" aria-hidden="true"></span>
        <div class="store-loading-title" id="store-loading-title">${gameTextHtml('store.loading.title')}</div>
        <div class="store-loading-desc" id="store-loading-desc">${gameTextHtml('store.loading.description')}</div>
      </div>`;
    storeLoadingSlowTimerId = setTimeout(() => {
      if (renderSerial !== storeMainViewSerial || !overlay.isConnected) return;
      const title = body.querySelector('#store-loading-title');
      const desc = body.querySelector('#store-loading-desc');
      if (title) title.textContent = gameText('store.loading.slow');
      if (desc) desc.textContent = gameText('store.loading.slowDescription');
    }, STOREFRONT_LOADING_SLOW_AFTER_MS);
  }

  function finishStoreLoadingState() {
    clearStoreLoadingSlowTimer();
    body.removeAttribute('aria-busy');
  }

  function renderStoreLoadingError(error, renderSerial) {
    if (renderSerial !== storeMainViewSerial || !overlay.isConnected) return;
    finishStoreLoadingState();
    console.warn('[Economy 23.19.5.5] No se pudo cargar storefront authority:', error);
    body.innerHTML = `
      <div class="store-loading-panel store-loading-error" role="alert">
        <div class="store-loading-title">${gameTextHtml('store.loading.errorTitle')}</div>
        <div class="store-loading-desc">${gameTextHtml('store.loading.errorDescription')}</div>
        <button class="store-buy-btn" id="store-loading-retry" type="button">${gameTextHtml('store.loading.retry')}</button>
      </div>`;
    body.querySelector('#store-loading-retry')?.addEventListener('click', () => {
      void renderMainView({ forceStorefront: true });
    });
  }

  async function loadStorefrontAuthorityCached({ force = false, throwOnError = false } = {}) {
    const now = Date.now();
    if (!force && storefrontAuthority && now - storefrontAuthorityAt < STOREFRONT_AUTHORITY_CACHE_MS) return storefrontAuthority;
    if (!storefrontAuthorityPromise) {
      storefrontAuthorityPromise = (async () => {
        const value = await fetchStorefrontAuthority();
        if (!value || typeof value !== 'object') throw new Error('STOREFRONT_AUTHORITY_EMPTY');
        storefrontAuthority = value;
        if (value?.emotes) applyEmoteCatalogSnapshot(value.emotes);
        storefrontAuthorityAt = Date.now();
        return storefrontAuthority;
      })().finally(() => {
        storefrontAuthorityPromise = null;
      });
    }
    try {
      return await storefrontAuthorityPromise;
    } catch (error) {
      if (throwOnError) throw error;
      console.warn('[Economy 23.19.5.5] No se pudo refrescar storefront authority; se conserva el último snapshot válido:', error);
      return storefrontAuthority;
    }
  }
  function currentCraftCost() {
    return Math.max(1, Math.floor(Number(storefrontAuthority?.craft?.fichasCost ?? FICHAS_PER_ENHANCEMENT) || FICHAS_PER_ENHANCEMENT));
  }
  function currentPrebuiltPointsCost() {
    return Math.max(0, Math.floor(Number(storefrontAuthority?.prebuilt?.pointsCost ?? PREBUILT_DECK_POINTS) || 0));
  }
  function currentPrebuiltFichasCost() {
    return Math.max(0, Math.floor(Number(storefrontAuthority?.prebuilt?.fichasCost ?? PREBUILT_DECK_FICHAS) || 0));
  }
  function currentEmoteActiveCount() {
    return EMOTE_CATALOG.filter(row => row?.active !== false).length;
  }

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

  async function renderMainView({ openPointsInfo = false, forceStorefront = false } = {}) {
    const renderSerial = ++storeMainViewSerial;
    leaveClassifiedsView();
    finishStoreLoadingState();
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
    renderStoreLoadingState(renderSerial);
    let authority = null;
    try {
      authority = await loadStorefrontAuthorityCached({ force: forceStorefront, throwOnError: true });
    } catch (error) {
      renderStoreLoadingError(error, renderSerial);
      return;
    }
    if (renderSerial !== storeMainViewSerial || !overlay.isConnected) return;
    let campaignSnapshot = null;
    if (!Number.isFinite(Number(authority?.pack?.effectiveCost))) {
      try { campaignSnapshot = await fetchCampaignSnapshot(); } catch {}
      if (renderSerial !== storeMainViewSerial || !overlay.isConnected) return;
    }
    finishStoreLoadingState();
    const packBaseCost = Math.max(0, Math.floor(Number(authority?.pack?.baseCost ?? PACK_COST) || 0));
    const effectiveCost = Number.isFinite(Number(authority?.pack?.effectiveCost))
      ? Math.max(0, Math.floor(Number(authority.pack.effectiveCost)))
      : effectivePackCost(packBaseCost, campaignSnapshot);
    const craftCost = currentCraftCost();
    const packDiscountActive = effectiveCost < packBaseCost;
    const canBuyPack = points >= effectiveCost;
    const canCraft = fichas >= craftCost;

    body.innerHTML = `
      <div id="store-active-events"></div>
      ${pointsInfoPanelHTML}
      <div class="store-market-strip-shell">
        <div class="store-market-strip" aria-label="Opciones de la Tienda">
          <div class="chest-item store-market-item store-market-pack">
            <div class="chest-item-content"><div class="chest-item-icon">${PACK_ICON_HTML}</div>
            <div class="chest-item-title">${gameTextHtml('store.pack.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count">${gameTextHtml('store.pack.showcaseCost', { cost: effectiveCost })}${packDiscountActive ? ` <span class="store-discount-note">(${packBaseCost} → ${effectiveCost})</span>` : ''}</div>
            <div class="chest-item-desc">${gameTextHtml('store.pack.description')}</div>
            <div class="store-error-msg" id="store-buy-error"></div></div>
            <button class="reward-action-btn" id="store-buy-pack" ${canBuyPack ? '' : 'disabled'}>${gameTextHtml('store.pack.buy')}</button>
          </div>
          <div class="chest-item store-market-item store-prebuilt-entry">
            <div class="chest-item-content"><div class="chest-item-icon"><div class="store-prebuilt-icon-wrap"><img class="store-prebuilt-icon" src="./assets/images/ui/mazos_prearmados.png" alt="Mazos Prearmados" onerror="this.parentElement.classList.add('image-missing');this.remove()"></div></div>
            <div class="chest-item-title">${gameTextHtml('store.prebuilt.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count">${gameTextHtml('store.prebuilt.showcaseCount')}</div>
            <div class="chest-item-desc">${gameTextHtml('store.prebuilt.description')}</div></div>
            <button class="reward-action-btn" id="store-prebuilt">${gameTextHtml('store.prebuilt.open')}</button>
          </div>
          <div class="chest-item store-market-item store-classifieds-entry">
            <div class="chest-item-content"><div class="chest-item-icon"><img class="store-classifieds-icon" src="./assets/images/ui/clasificados.png" alt="Avisos Clasificados"></div>
            <div class="chest-item-title">${gameTextHtml('store.classifieds.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count store-market-count-classifieds">${gameTextHtml('store.classifieds.showcaseCount')}</div>
            <div class="chest-item-desc">${gameTextHtml('store.classifieds.description')}</div></div>
            <button class="reward-action-btn" id="store-classifieds">${gameTextHtml('store.classifieds.open')}</button>
          </div>
          <div class="chest-item store-market-item store-emotes-entry">
            <div class="chest-item-content"><div class="chest-item-icon"><div class="store-emote-showcase-icon"><img class="store-emote-showcase-img" src="./assets/images/ui/emotes.png" alt="Emotes" onerror="this.parentElement.textContent='😏'"></div></div>
            <div class="chest-item-title">${gameTextHtml('store.emotes.showcaseTitle')}</div>
            <div class="chest-item-count store-market-count">${gameTextHtml('store.emotes.showcaseCount', { count: currentEmoteActiveCount() })}</div>
            <div class="chest-item-desc">${gameTextHtml('store.emotes.description')}</div></div>
            <button class="reward-action-btn" id="store-emotes">${gameTextHtml('store.emotes.open')}</button>
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

    body.querySelector('#store-emotes')?.addEventListener('click', () => {
      void renderEmotesStoreView();
    });

    body.querySelector('#store-buy-pack').addEventListener('click', async () => {
      const btn = body.querySelector('#store-buy-pack');
      const errBox = body.querySelector('#store-buy-error');
      errBox.textContent = '';
      try {
        await withEconomyButtonPending(btn, async () => {
          const purchase = await purchasePack(state.currentUser.uid, packBaseCost);
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
        }, { pendingLabel:'COMPRANDO...' });
      } catch (err) {
        console.error('No se pudo comprar el sobre:', err);
        errBox.textContent = err.message || 'No se pudo comprar el sobre. Probá de nuevo.';
      }
    });

    if (canCraft) {
    }
  }


  const storeEmoteAssetProbeCache = new Map();
  async function resolveStoreEmoteAsset(urls = []) {
    for (const url of Array.isArray(urls) ? urls : []) {
      if (!url) continue;
      if (storeEmoteAssetProbeCache.has(url)) {
        if (storeEmoteAssetProbeCache.get(url) === true) return url;
        continue;
      }
      try {
        const response = await fetch(url, { method:'HEAD', cache:'force-cache', credentials:'same-origin' });
        const ok = response.ok;
        storeEmoteAssetProbeCache.set(url, ok);
        if (ok) return url;
      } catch { storeEmoteAssetProbeCache.set(url, false); }
    }
    return null;
  }
  function mountStoreEmoteArt(holder, def) {
    if (!holder || !def) return;
    const fallback = () => {
      holder.replaceChildren();
      const span = document.createElement('span');
      span.className = 'store-emote-fallback'; span.textContent = def.fallback || '🙂';
      holder.appendChild(span);
    };
    fallback();
    const urls = emoteAssetCandidates(def);
    void resolveStoreEmoteAsset(urls).then(url => {
      if (!url || !holder.isConnected) return;
      const img = document.createElement('img');
      img.className = 'store-emote-art-img'; img.alt = def.label; img.decoding = 'async'; img.draggable = false;
      img.onerror = fallback; img.src = url; holder.replaceChildren(img);
    });
  }

  async function renderEmotesStoreView() {
    leaveClassifiedsView();
    renderStoreHeader(gameText('store.emotes.title'));
    if (storefrontAuthority?.emotes) applyEmoteCatalogSnapshot(storefrontAuthority.emotes);
    const owned = normalizeOwnedEmoteIds(state.userProfile);
    body.innerHTML = `
      <div class="store-section store-emotes-section">
        <div class="store-section-title">${gameTextHtml('store.emotes.title')}</div>
        <div class="store-section-desc">${gameTextHtml('store.emotes.longDescription')}</div>
        <div class="store-emote-grid" id="store-emote-grid"></div>
        <button class="store-back-link" id="store-emotes-back">${gameTextHtml('common.back')}</button>
      </div>`;
    const grid = body.querySelector('#store-emote-grid');
    for (const def of EMOTE_CATALOG.filter(row => row.active !== false)) {
      const trusted = def;
      const isOwned = owned.has(def.id);
      const card = document.createElement('div');
      card.className = `store-emote-card${def.premium ? ' premium' : ' free'}${isOwned ? ' owned' : ''}`;
      card.innerHTML = `
        <div class="store-emote-art" data-emote-art="${escapeHtml(def.id)}"></div>
        <div class="store-emote-name">${escapeHtml(def.label)}</div>
        <div class="store-emote-tier">${def.premium ? gameTextHtml('store.emotes.premium') : gameTextHtml('store.emotes.free')}</div>
        <button class="reward-action-btn store-emote-buy" type="button" data-emote-id="${escapeHtml(def.id)}" ${(!def.premium || isOwned) ? 'disabled' : ''}>
          ${!def.premium ? gameTextHtml('store.emotes.included') : (isOwned ? gameTextHtml('store.emotes.owned') : gameTextHtml('store.emotes.buy',{points:Math.max(0,Math.floor(Number(trusted.pricePoints)||0))}))}
        </button>
        <div class="store-error-msg"></div>`;
      grid.appendChild(card);
      mountStoreEmoteArt(card.querySelector('[data-emote-art]'), def);
    }
    grid.querySelectorAll('.store-emote-buy:not(:disabled)').forEach(btn => btn.addEventListener('click', async () => {
      const card = btn.closest('.store-emote-card'); const errorBox = card?.querySelector('.store-error-msg');
      if (errorBox) errorBox.textContent = '';
      try {
        await withEconomyButtonPending(btn, async () => {
          const result = await purchaseEmote(state.currentUser.uid, btn.dataset.emoteId);
          if (result?.profile) state.userProfile = result.profile;
          updateAccountUI(state.currentUser);
          renderStoreHeader(gameText('store.emotes.title'));
          await renderEmotesStoreView();
        }, { pendingLabel:gameText('store.emotes.buying') });
      } catch (error) {
        if (errorBox) errorBox.textContent = error?.message || gameText('store.emotes.error');
      }
    }));
    body.querySelector('#store-emotes-back')?.addEventListener('click', () => { void renderMainView(); });
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
          <div class="prebuilt-price">${COIN_ICON_HTML} ${currentPrebuiltPointsCost()} <span>+</span> ${FICHA_ICON_HTML} ${currentPrebuiltFichasCost()}</div>
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
      err.textContent='';
      try {
        await withEconomyButtonPending(confirm, async () => {
          const result=await purchasePrebuiltDeck(state.currentUser.uid,product.id,name);
          state.userProfile=result.profile;
          updateAccountUI(state.currentUser);
          renderStoreHeader(gameText('prebuilt.title'));
          panel.innerHTML=`<div class="prebuilt-preview-title">${gameTextHtml('prebuilt.success')}</div>
            <div class="prebuilt-preview-sub">${escapeHtml(result.deck?.name||name)}</div>
            <div class="prebuilt-actions"><button class="store-buy-btn" id="prebuilt-go-decks">${gameTextHtml('prebuilt.goDecks')}</button><button class="store-back-link" id="prebuilt-success-close">${gameTextHtml('prebuilt.backStore')}</button></div>`;
          panel.querySelector('#prebuilt-go-decks').addEventListener('click',()=>{ modal.remove(); overlay.remove(); showMyDecksScreen(()=>showStoreScreen(onBack,{initialView:'prebuilt'})); });
          panel.querySelector('#prebuilt-success-close').addEventListener('click',()=>{ modal.remove(); void renderPrebuiltDecksView(); });
        }, { pendingLabel:'COMPRANDO...' });
      } catch(error) {
        console.error('No se pudo comprar el mazo prearmado:',error);
        err.textContent=prebuiltFriendlyError(error);
      }
    });
  }

  async function renderPrebuiltDecksView() {
    leaveClassifiedsView();
    renderStoreHeader(gameText('prebuilt.title'));
    body.innerHTML=`<div class="store-section classifieds-loading">${gameTextHtml('common.loading')}</div>`;
    try {
      await cardDb.loadAll();
      await loadStorefrontAuthorityCached();
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
      case 'CLASSIFIEDS_BASIC_LAND_PACK_ALREADY_PURCHASED': return gameText('classifieds.basicLands.error.alreadyPurchased');
      case 'CLASSIFIEDS_BASIC_LAND_PACK_INSUFFICIENT_POINTS': return gameText('classifieds.basicLands.error.insufficientPoints');
      case 'CLASSIFIEDS_BASIC_LAND_PACK_INVALID_COLOR':
      case 'CLASSIFIEDS_BASIC_LAND_PACK_CATALOG_INVALID': return gameText('classifieds.basicLands.error.invalid');
      default: return error?.message || gameText('classifieds.error.generic');
    }
  }

  function syncClassifiedsOfferWithProfile(offer, profile) {
    if (!offer || !profile) return offer;
    const weekly = getClassifiedsProfileState(profile, offer.weekKey);
    const landWeekly = getClassifiedsBasicLandPackProfileState(profile, offer.weekKey);
    return {
      ...offer,
      profile,
      purchased: weekly.purchased,
      purchaseCounts: weekly.counts,
      basicLandPacksPurchased: landWeekly.purchasedColors,
      entries: (offer.entries || []).map(entry => ({
        ...entry,
        ownedCount: countOwnedClassifiedCard(profile, entry.cardId),
        purchased: weekly.purchased.includes(entry.cardId)
      })),
      basicLandPacks: (offer.basicLandPacks || []).map(entry => ({
        ...entry,
        ownedCount: countOwnedClassifiedCard(profile, entry.cardId),
        purchased: landWeekly.purchasedColors.includes(String(entry.color || '').toUpperCase())
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
      <section class="classifieds-basic-land-section" aria-labelledby="classifieds-basic-land-title">
        <div class="classifieds-basic-land-header">
          <div class="classifieds-basic-land-title" id="classifieds-basic-land-title">${gameTextHtml('classifieds.basicLands.title')}</div>
          <div class="classifieds-basic-land-subtitle">${gameTextHtml('classifieds.basicLands.subtitle')}</div>
        </div>
        <div class="classifieds-basic-land-strip" id="classifieds-basic-land-strip" aria-label="Cinco packs semanales de Tierras Básicas"></div>
      </section>
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
          errorBox.textContent = '';
          try {
            await withEconomyButtonPending(buy, async () => {
              const updatedProfile = await purchaseClassifiedCard(state.currentUser.uid, entry.cardId);
              if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
              state.userProfile = updatedProfile;
              updateAccountUI(state.currentUser);
              renderStoreHeader(gameText('classifieds.title'));
              const synced = syncClassifiedsOfferWithProfile(offer, updatedProfile);
              synced.serverNow = new Date(serverAnchorMs + (Date.now() - localAnchorMs));
              synced.nextRotationAt = rotationAt;
              const previousScrollTop = body.scrollTop;
              renderClassifiedsOffer(synced, viewSerial);
              body.scrollTop = previousScrollTop;
            }, { pendingLabel:'COMPRANDO...' });
          } catch (error) {
            console.error('No se pudo comprar el Aviso Clasificado:', error);
            if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
            errorBox.textContent = classifiedsFriendlyError(error);
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

    const landStrip = body.querySelector('#classifieds-basic-land-strip');
    (offer.basicLandPacks || []).forEach(entry => {
      const card = cardDb.getById(entry.cardId);
      if (!card) return;
      const slot = document.createElement('div');
      slot.className = `classifieds-card-slot classifieds-land-pack-slot classifieds-rarity-Common${entry.purchased ? ' classifieds-purchased' : ''}`;

      const quantityBadge = document.createElement('div');
      quantityBadge.className = 'classifieds-land-pack-quantity-badge';
      quantityBadge.textContent = `×${Math.max(1, Math.floor(Number(entry.quantity) || 1))}`;
      slot.appendChild(quantityBadge);

      if (entry.purchased) {
        const badge = document.createElement('div');
        badge.className = 'classifieds-purchased-badge';
        badge.textContent = gameText('classifieds.basicLands.purchased');
        slot.appendChild(badge);
      }

      const title = document.createElement('div');
      title.className = 'classifieds-land-pack-title';
      title.textContent = gameText('classifieds.basicLands.packTitle', { color: entry.label || entry.color });
      slot.appendChild(title);

      const cardEl = createCardElement(card, false, true, null, 'encyclopedia', null);
      cardEl.setAttribute('role', 'button');
      cardEl.setAttribute('tabindex', '0');
      cardEl.setAttribute('aria-label', `Ver ${card.name || 'Tierra básica'} en grande`);
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
      owned.textContent = gameText('classifieds.basicLands.owned', { count: Math.max(0, Number(entry.ownedCount) || 0) });
      slot.appendChild(owned);

      const price = document.createElement('div');
      price.className = 'classifieds-price classifieds-land-pack-price';
      price.innerHTML = `<span class="classifieds-price-part">${COIN_ICON_HTML} ${Math.max(0, Math.floor(Number(entry.points) || 0))}</span>`;
      slot.appendChild(price);

      const weekHint = document.createElement('div');
      weekHint.className = 'classifieds-land-pack-week';
      weekHint.textContent = gameText('classifieds.basicLands.weekHint');
      slot.appendChild(weekHint);

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'store-buy-btn classifieds-buy-btn';
      const canAfford = points >= Math.max(0, Number(entry.points) || 0);
      buy.disabled = entry.purchased || !canAfford;
      buy.textContent = entry.purchased
        ? gameText('classifieds.basicLands.purchased')
        : (canAfford ? gameText('classifieds.basicLands.buy') : gameText('classifieds.noFunds'));
      slot.appendChild(buy);

      const errorBox = document.createElement('div');
      errorBox.className = 'classifieds-card-error';
      slot.appendChild(errorBox);

      if (!entry.purchased) {
        buy.addEventListener('click', async () => {
          if (!state.currentUser || buy.disabled) return;
          errorBox.textContent = '';
          try {
            await withEconomyButtonPending(buy, async () => {
              const updatedProfile = await purchaseClassifiedBasicLandPack(state.currentUser.uid, entry.color);
              if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
              state.userProfile = updatedProfile;
              updateAccountUI(state.currentUser);
              renderStoreHeader(gameText('classifieds.title'));
              const synced = syncClassifiedsOfferWithProfile(offer, updatedProfile);
              synced.serverNow = new Date(serverAnchorMs + (Date.now() - localAnchorMs));
              synced.nextRotationAt = rotationAt;
              const previousScrollTop = body.scrollTop;
              renderClassifiedsOffer(synced, viewSerial);
              body.scrollTop = previousScrollTop;
            }, { pendingLabel:gameText('classifieds.basicLands.buying') });
          } catch (error) {
            console.error('No se pudo comprar el pack semanal de Tierras Básicas:', error);
            if (!overlay.isConnected || viewSerial !== classifiedsViewSerial) return;
            errorBox.textContent = classifiedsFriendlyError(error);
            if (['CLASSIFIEDS_BASIC_LAND_PACK_ALREADY_PURCHASED','CLASSIFIEDS_WEEK_NOT_PUBLISHED'].includes(error?.code)) {
              setTimeout(() => {
                if (overlay.isConnected && viewSerial === classifiedsViewSerial) void renderClassifiedsView();
              }, 500);
            }
          }
        });
      }
      landStrip?.appendChild(slot);
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

  function leaveCraftOnly() {
    if (!craftOnly) return renderMainView();
    leaveClassifiedsView();
    clearStoreLoadingSlowTimer();
    overlay.remove();
    onBack?.();
  }

  function renderCraftPickCardView() {
    if (craftOnly) renderStoreHeader(gameText('workshop.machine1.title'), { showWallet:true });
    const enhancements = state.userProfile.enhancements || {};
    const ownedUnique = [...new Set(state.userProfile.collection || [])];
    const eligibleCards = ownedUnique
      .filter(id => !enhancements[id])
      .map(id => cardDb.getById(id))
      .filter(card => isEnhancementEligibleCard(card))
      .sort((a, b) => (Number(a?.cmc) || 0) - (Number(b?.cmc) || 0) || String(a?.name || '').localeCompare(String(b?.name || ''), 'es'));

    if (eligibleCards.length === 0) {
      body.innerHTML = `
        <div class="store-section">
          <div class="store-section-desc">${gameTextHtml('store.craft.noneEligible')}</div>
          <button class="store-back-link" id="store-craft-back">← ${gameTextHtml('common.back')}</button>
        </div>
      `;
      body.querySelector('#store-craft-back').addEventListener('click', leaveCraftOnly);
      return;
    }

    const rarityOptions = TRADE_FILTER_RARITIES.map(r => `<option value="${r}" ${craftFilters.rarity === r ? 'selected' : ''}>${escapeHtml(tradeRarityLabel(r))}</option>`).join('');
    const colorChips = TRADE_FILTER_COLORS.map(c => `<button type="button" class="trade-filter-chip ${craftFilters.colors.has(c) ? 'active' : ''}" data-craft-color-filter="${c}">${escapeHtml(tradeColorLabel(c))}</button>`).join('');

    body.innerHTML = `
      <div class="store-section">
        <div class="store-section-title">${gameTextHtml('store.craft.chooseTitle')}</div>
        <div class="store-section-desc">${gameTextHtml('store.craft.chooseDescription', { cost: currentCraftCost() })}</div>
        <div class="card-browser-zoom store-craft-zoom" title="Cambiar tamaño de las criaturas">
          <span>🔍</span>
          <input type="range" id="store-craft-card-zoom" min="8" max="40" step="1" value="${craftCardZoom}">
          <span id="store-craft-card-zoom-value">${craftCardZoom}</span>
        </div>
        <div class="store-craft-browser trade-explore-layout">
          <section class="trade-explore-results">
            <div class="trade-results-meta"><span id="store-craft-filter-count"></span></div>
            <div class="store-craft-list" id="store-craft-list"></div>
            <div class="trade-empty" id="store-craft-filter-empty" hidden>No tenés criaturas que coincidan con esos filtros.</div>
          </section>
          <aside class="trade-explore-sidebar">
            <div class="trade-explore-toolbar">
              <div class="trade-filter-search"><label for="store-craft-search">Buscar carta</label><input id="store-craft-search" class="trade-input" type="search" autocomplete="off" placeholder="Nombre de la criatura..." value="${escapeHtml(craftFilters.query)}"></div>
              <div class="trade-filter-block"><span class="trade-filter-label">Color</span><div class="trade-filter-chips">${colorChips}</div></div>
              <div class="trade-filter-selects">
                <label>Rareza<select class="trade-select" id="store-craft-rarity"><option value="">Todas</option>${rarityOptions}</select></label>
                <label>Tipo<select class="trade-select" disabled><option>Criatura</option></select></label>
                <button type="button" class="trade-btn secondary trade-filter-clear" id="store-craft-filter-clear">Limpiar filtros</button>
              </div>
              <div class="store-craft-filter-note">Cada ID de carta admite una sola copia mejorada. Si tenés más copias, las restantes siguen siendo normales.</div>
            </div>
          </aside>
        </div>
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
      btn.dataset.craftCardSearch = tradeNormalizeSearch(card.name);
      btn.dataset.craftCardRarity = String(card.rarity || '');
      btn.dataset.craftCardColors = Array.isArray(card.colors) && card.colors.length ? card.colors.join(',') : 'C';
      const cardEl = createCardElement(card, false, true, null, 'encyclopedia', null);
      btn.appendChild(cardEl);
      btn.addEventListener('click', () => {
        craftSelectedCardId = card.id;
        renderCraftPickKeywordView(card);
      });
      list.appendChild(btn);
    });

    const applyCraftFilters = () => {
      const query = tradeNormalizeSearch(craftFilters.query);
      let visible = 0;
      list.querySelectorAll('.store-craft-card-btn').forEach(btn => {
        const colors = String(btn.dataset.craftCardColors || '').split(',').filter(Boolean);
        const matchesQuery = !query || String(btn.dataset.craftCardSearch || '').includes(query);
        const matchesColor = craftFilters.colors.size === 0 || [...craftFilters.colors].some(c => colors.includes(c));
        const matchesRarity = !craftFilters.rarity || btn.dataset.craftCardRarity === craftFilters.rarity;
        const show = matchesQuery && matchesColor && matchesRarity;
        btn.hidden = !show;
        if (show) visible += 1;
      });
      const count = body.querySelector('#store-craft-filter-count');
      if (count) count.textContent = `${visible} criatura${visible === 1 ? '' : 's'}`;
      const empty = body.querySelector('#store-craft-filter-empty');
      if (empty) empty.hidden = visible !== 0;
    };

    body.querySelector('#store-craft-search')?.addEventListener('input', e => { craftFilters.query = e.target.value; applyCraftFilters(); });
    body.querySelectorAll('[data-craft-color-filter]').forEach(btn => btn.addEventListener('click', () => {
      const color = btn.dataset.craftColorFilter;
      if (craftFilters.colors.has(color)) craftFilters.colors.delete(color); else craftFilters.colors.add(color);
      btn.classList.toggle('active', craftFilters.colors.has(color));
      applyCraftFilters();
    }));
    body.querySelector('#store-craft-rarity')?.addEventListener('change', e => { craftFilters.rarity = e.target.value || ''; applyCraftFilters(); });
    body.querySelector('#store-craft-filter-clear')?.addEventListener('click', () => {
      craftFilters.query = '';
      craftFilters.colors.clear();
      craftFilters.rarity = '';
      renderCraftPickCardView();
    });

    applyCraftFilters();
    body.querySelector('#store-craft-cancel').addEventListener('click', leaveCraftOnly);
  }

  function renderCraftPickKeywordView(card) {
    const intrinsicKeywords = new Set((Array.isArray(card?.keywords) ? card.keywords : []).map(k => String(k || '').trim().toLowerCase()));
    const availableKeywords = ENHANCEMENT_KEYWORDS.filter(k => !intrinsicKeywords.has(String(k.key).toLowerCase()));
    const keywordButtonsHTML = availableKeywords.map(k =>
      `<button class="store-keyword-btn" data-keyword="${k.key}">${k.label}</button>`
    ).join('');

    body.innerHTML = `
      <div class="store-section">
        <div class="store-section-title">${card.name} — elegí la keyword</div>
        <div class="store-section-desc">Las habilidades que la carta ya tiene de forma natural no se ofrecen como mejora.</div>
        <div class="store-keyword-grid">${keywordButtonsHTML}</div>
        <div class="store-error-msg" id="store-craft-error"></div>
        <button class="store-back-link" id="store-craft-back">← Elegir otra carta</button>
      </div>
    `;

    body.querySelectorAll('.store-keyword-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const keyword = btn.getAttribute('data-keyword');
        const errBox = body.querySelector('#store-craft-error');
        const peers = [...body.querySelectorAll('.store-keyword-btn')].filter(b => b !== btn);
        try {
          const updated = await withEconomyButtonPending(btn, async () => {
            return craftEnhancement(state.currentUser.uid, craftSelectedCardId, keyword, currentCraftCost());
          }, {
            pendingLabel:gameText('workshop.enhancement.pending'),
            slowLabel:gameText('workshop.server.slow'),
            disablePeers:peers
          });
          if (!updated) return;
          state.userProfile = updated;
          if (craftOnly && typeof options.onCraftSuccess === 'function') {
            leaveClassifiedsView();
            clearStoreLoadingSlowTimer();
            storeMainViewSerial += 1;
            overlay.remove();
            options.onCraftSuccess({ cardId:craftSelectedCardId, keyword });
          } else if (craftOnly) renderCraftPickCardView();
          else renderMainView();
        } catch (err) {
          console.error('No se pudo craftear la mejora:', err);
          errBox.textContent = err.message || 'No se pudo craftear la mejora. Probá de nuevo.';
        }
      });
    });

    body.querySelector('#store-craft-back').addEventListener('click', renderCraftPickCardView);
  }

  if (options.initialView === 'craft' && state.userProfile) {
    renderCraftPickCardView();
  } else {
    renderMainView();
    if (options.initialView === 'classifieds' && state.userProfile) {
      void renderClassifiedsView();
    } else if (options.initialView === 'prebuilt' && state.userProfile) {
      void renderPrebuiltDecksView();
    }
  }
}

export function showEnhancementCraftScreen(onBack, options = {}) {
  return showStoreScreen(onBack, { ...options, initialView:'craft', craftOnly:true });
}


function injectWorkshopStyles() {
  if (document.getElementById('workshop-styles')) return;
  const style = document.createElement('style');
  style.id = 'workshop-styles';
  style.textContent = `
    #workshop-overlay { position:fixed; inset:0; z-index:10030; overflow:hidden; background:#050505; color:#f3e8bd; }
    .workshop-stage { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); overflow:visible; }
    .workshop-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; user-select:none; -webkit-user-drag:none; pointer-events:none; }
    .workshop-topbar { position:absolute; z-index:25; left:18px; right:18px; top:16px; display:flex; align-items:center; justify-content:space-between; gap:12px; pointer-events:none; }
    .workshop-topbar > * { pointer-events:auto; }
    .workshop-title { font:800 clamp(20px,2.5vw,34px)/1.05 Georgia,serif; letter-spacing:.08em; text-shadow:0 2px 8px #000,0 0 18px #000; }
    .workshop-wallet { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .workshop-wallet-pill { display:flex; align-items:center; gap:5px; padding:7px 10px; border:1px solid rgba(212,175,55,.55); border-radius:999px; background:rgba(5,5,5,.76); box-shadow:0 2px 12px rgba(0,0,0,.55); font-weight:700; }
    .workshop-wallet-pill img { width:20px!important; height:20px!important; object-fit:contain; }
    .workshop-machine-slot { position:absolute; transform:translate(-50%,-50%); z-index:8; border:0; background:transparent; padding:0; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .workshop-machine-slot:focus-visible { outline:2px solid #f2cf61; outline-offset:4px; border-radius:12px; }
    .workshop-machine-img { display:block; width:100%; height:auto; object-fit:contain; filter:drop-shadow(0 8px 10px rgba(0,0,0,.7)); pointer-events:none; }
    .workshop-machine-slot.unlocked:hover .workshop-machine-img { filter:drop-shadow(0 0 12px rgba(255,224,116,.7)) drop-shadow(0 8px 10px rgba(0,0,0,.75)); }
    .workshop-machine-hitbox { width:100%; height:min(42vh,42vw); border:1px dashed rgba(255,255,255,.10); border-radius:18px; background:rgba(0,0,0,.01); }
    .workshop-machine-slot.locked:hover .workshop-machine-hitbox { border-color:rgba(246,206,84,.55); background:rgba(246,206,84,.06); }
    .workshop-machine-badge { position:absolute; left:50%; bottom:-6px; transform:translate(-50%,100%); white-space:nowrap; padding:5px 9px; border-radius:999px; background:rgba(0,0,0,.78); border:1px solid rgba(212,175,55,.45); font-size:11px; font-weight:800; letter-spacing:.04em; color:#f5dfa0; pointer-events:none; }
    .workshop-panel { position:absolute; z-index:30; left:50%; bottom:18px; transform:translateX(-50%); width:min(620px,calc(100vw - 28px)); padding:13px 15px; box-sizing:border-box; border:1px solid rgba(212,175,55,.6); border-radius:14px; background:rgba(6,8,7,.9); box-shadow:0 12px 38px rgba(0,0,0,.65); text-align:center; }
    .workshop-panel[hidden] { display:none; }
    .workshop-panel-title { font-size:18px; font-weight:850; color:#f4dd91; margin-bottom:4px; }
    .workshop-panel-desc { color:#d3cec0; line-height:1.35; font-size:13px; }
    .workshop-panel-cost { margin:8px 0; font-weight:800; color:#f7edc2; }
    .workshop-panel-actions { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .workshop-action-btn { appearance:none; border:1px solid #d4af37; background:linear-gradient(#5f481a,#332208); color:#fff1b6; border-radius:8px; padding:8px 14px; font-weight:850; cursor:pointer; }
    .workshop-action-btn.secondary { background:#242821; border-color:#777; color:#eee; }
    .workshop-action-btn:disabled { opacity:.45; cursor:not-allowed; }
    .workshop-status { min-height:18px; color:#ffcf6a; margin-top:6px; font-size:12px; }
    .workshop-evolution-picker { display:flex; gap:8px; align-items:center; justify-content:center; margin:9px 0; flex-wrap:wrap; }
    .workshop-evolution-picker select { max-width:min(380px,80vw); background:#111914; color:#f4edcf; border:1px solid rgba(212,175,55,.55); border-radius:7px; padding:7px 9px; }
    .workshop-evolution-preview { display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:start; margin:9px auto; max-width:480px; }
    .workshop-evolution-preview-block { display:flex; flex-direction:column; align-items:center; gap:5px; min-width:0; }
    .workshop-evolution-preview-label { font-size:10px; font-weight:900; letter-spacing:.08em; color:#e9d77f; }
    .workshop-evolution-preview .card { --card-w:min(178px,34vw); width:var(--card-w)!important; height:auto!important; aspect-ratio:5/7!important; max-width:none!important; transform:none!important; pointer-events:none!important; }
    .workshop-evolution-rule { font-size:11px; color:#bfc7bd; margin-top:6px; }

    .workshop-loading { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center; gap:10px; background:rgba(0,0,0,.7); font-weight:800; }
    .workshop-enhancement-success-overlay { position:fixed; inset:0; z-index:10070; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(0,7,18,.78); backdrop-filter:blur(6px); }
    .workshop-enhancement-success-modal { width:min(760px,96vw); max-height:94vh; overflow:auto; display:flex; flex-direction:column; align-items:center; gap:12px; padding:20px 22px 18px; border:1px solid rgba(123,221,255,.72); border-radius:18px; background:radial-gradient(circle at 50% 0,rgba(54,163,255,.20),transparent 38%),linear-gradient(180deg,rgba(7,22,40,.98),rgba(5,12,21,.98)); box-shadow:0 0 42px rgba(66,188,255,.28),0 24px 70px rgba(0,0,0,.68); text-align:center; }
    .workshop-enhancement-success-title { margin:0; color:#dff8ff; font:900 clamp(24px,4vw,38px)/1 Georgia,serif; letter-spacing:.06em; text-shadow:0 0 18px rgba(104,214,255,.56); }
    .workshop-enhancement-success-ability { color:#8ddcff; font-weight:900; font-size:13px; letter-spacing:.05em; }
    .workshop-enhancement-success-card { display:flex; justify-content:center; width:100%; padding:2px 0; }
    .workshop-enhancement-success-card .card { --card-w:min(300px,72vw); width:var(--card-w)!important; height:auto!important; aspect-ratio:5/7!important; max-width:none!important; transform:none!important; pointer-events:none!important; filter:drop-shadow(0 0 17px rgba(88,195,255,.42)) drop-shadow(0 18px 30px rgba(0,0,0,.72)); }
    .workshop-enhancement-success-reminder { max-width:640px; margin:0; color:#c9d7df; font-size:13px; line-height:1.45; }
    .workshop-evolution-success-overlay{position:fixed;inset:0;z-index:10064;background:rgba(3,2,8,.86);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px)}
    .workshop-evolution-success-modal{width:min(720px,96vw);max-height:94vh;overflow:auto;border:1px solid rgba(218,166,255,.72);border-radius:18px;background:radial-gradient(circle at 50% 0,rgba(75,42,108,.72),rgba(17,12,25,.98) 54%,rgba(8,7,12,.99));box-shadow:0 0 48px rgba(152,83,255,.3),0 22px 70px rgba(0,0,0,.78);padding:20px 22px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
    .workshop-evolution-success-title{margin:0;color:#f5ddff;font-size:28px;letter-spacing:.055em;text-shadow:0 0 16px rgba(198,125,255,.52)}
    .workshop-evolution-success-stage{font-size:13px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#ffd980;border:1px solid rgba(255,215,111,.42);background:rgba(94,62,12,.24);padding:5px 10px;border-radius:999px}
    .workshop-evolution-success-card{display:flex;justify-content:center;width:100%;padding:2px 0}.workshop-evolution-success-card .card{--card-w:min(300px,72vw);width:var(--card-w)!important;height:auto!important;aspect-ratio:5/7!important;max-width:none!important;transform:none!important;pointer-events:none!important;filter:drop-shadow(0 0 20px rgba(195,114,255,.5)) drop-shadow(0 18px 30px rgba(0,0,0,.74))}
    .workshop-evolution-success-reminder{max-width:640px;margin:0;color:#d7cbdf;font-size:13px;line-height:1.45}
    .workshop-mixer-success-overlay{position:fixed;inset:0;z-index:10064;background:rgba(2,8,6,.87);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(5px)}
    .workshop-mixer-success-modal{width:min(720px,96vw);max-height:94vh;overflow:auto;border:1px solid rgba(132,238,190,.72);border-radius:18px;background:radial-gradient(circle at 50% 0,rgba(39,112,85,.6),rgba(12,29,22,.98) 54%,rgba(6,12,9,.99));box-shadow:0 0 48px rgba(82,223,166,.25),0 22px 70px rgba(0,0,0,.78);padding:20px 22px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
    .workshop-mixer-success-title{margin:0;color:#dffff0;font-size:27px;letter-spacing:.035em;text-shadow:0 0 16px rgba(108,244,193,.42)}
    .workshop-mixer-success-rarity{font-size:13px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#ffe89a;border:1px solid rgba(255,226,121,.42);background:rgba(78,61,10,.22);padding:5px 10px;border-radius:999px}
    .workshop-mixer-success-card{display:flex;justify-content:center;width:100%;padding:2px 0}.workshop-mixer-success-card .card{--card-w:min(300px,72vw);width:var(--card-w)!important;height:auto!important;aspect-ratio:5/7!important;max-width:none!important;transform:none!important;pointer-events:none!important;filter:drop-shadow(0 0 20px rgba(86,226,171,.42)) drop-shadow(0 18px 30px rgba(0,0,0,.74))}
    .workshop-mixer-success-reminder{max-width:640px;margin:0;color:#c8dbd2;font-size:13px;line-height:1.45}
    @media(max-width:700px){ .workshop-topbar{left:8px;right:8px;top:8px}.workshop-title{font-size:18px}.workshop-wallet-pill{padding:5px 7px;font-size:11px}.workshop-panel{bottom:8px;padding:10px 11px}.workshop-panel.workshop-panel--machine-detail{max-height:calc(100dvh - 84px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;width:min(96vw,620px);padding-bottom:12px}.workshop-panel--machine-detail .workshop-evolution-preview{margin:6px auto;gap:6px}.workshop-panel--machine-detail .workshop-evolution-preview .card{--card-w:min(142px,31vw)}.workshop-panel--machine-detail .workshop-evolution-picker{margin:6px 0}.workshop-panel--machine-detail .workshop-panel-cost{margin:5px 0}.workshop-panel--machine-detail .workshop-panel-actions{margin-top:6px}.workshop-machine-badge{font-size:9px}.workshop-enhancement-success-modal,.workshop-evolution-success-modal,.workshop-mixer-success-modal{padding:14px 12px}.workshop-enhancement-success-card .card,.workshop-evolution-success-card .card,.workshop-mixer-success-card .card{--card-w:min(225px,68vw)}.workshop-evolution-success-title,.workshop-mixer-success-title{font-size:22px} }
    @media(max-width:850px){.workshop-panel.workshop-panel--machine-detail{bottom:8px;max-height:calc(100dvh - 76px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;width:min(96vw,620px);padding:10px 11px 12px}.workshop-panel--machine-detail .workshop-evolution-preview{margin:6px auto;gap:6px}.workshop-panel--machine-detail .workshop-evolution-preview .card{--card-w:min(142px,31vw)}.workshop-panel--machine-detail .workshop-evolution-picker{margin:6px 0}.workshop-panel--machine-detail .workshop-panel-cost{margin:5px 0}.workshop-panel--machine-detail .workshop-panel-actions{margin-top:6px}}
  `;
  document.head.appendChild(style);
}

function applyWorkshopStageCover(stage, image, host = window) {
  if (!stage || !image) return () => {};
  const sync = () => {
    const vw = Math.max(1, host.innerWidth || document.documentElement.clientWidth || 1);
    const vh = Math.max(1, host.innerHeight || document.documentElement.clientHeight || 1);
    const iw = Math.max(1, image.naturalWidth || 16);
    const ih = Math.max(1, image.naturalHeight || 9);
    const imageRatio = iw / ih;
    const viewportRatio = vw / vh;
    let width, height;
    if (viewportRatio > imageRatio) { width = vw; height = width / imageRatio; }
    else { height = vh; width = height * imageRatio; }
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
  };
  if (image.complete) sync(); else image.addEventListener('load', sync, { once:true });
  window.addEventListener('resize', sync);
  sync();
  return () => window.removeEventListener('resize', sync);
}

function machinePolicy(machineId) {
  return WORKSHOP_POLICY?.[machineId] || { available:false, points:0, fichas:0 };
}

export function showWorkshopScreen(onBack, options = {}) {
  injectWorkshopStyles();
  injectEncyclopediaStyles();
  ensureEconomyPendingStyles();
  document.getElementById('workshop-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'workshop-overlay';
  overlay.innerHTML = `
    <div class="workshop-stage" id="workshop-stage">
      <img class="workshop-bg" id="workshop-bg" src="./assets/images/ui/menu_taller.png" alt="">
      <div id="workshop-machines"></div>
    </div>
    <div class="workshop-topbar">
      <button class="encyclopedia-back-btn" id="workshop-back">← ${gameTextHtml('workshop.back')}</button>
      <div class="workshop-title">${gameTextHtml('workshop.title')}</div>
      <div class="workshop-wallet" id="workshop-wallet"></div>
    </div>
    <div class="workshop-panel" id="workshop-panel" hidden></div>
    <div class="workshop-loading" id="workshop-loading"><span class="economy-pending-spinner" aria-hidden="true"></span><span>${gameTextHtml('workshop.loading')}</span></div>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector('#workshop-stage');
  const bg = overlay.querySelector('#workshop-bg');
  const machineRoot = overlay.querySelector('#workshop-machines');
  const panel = overlay.querySelector('#workshop-panel');
  const loading = overlay.querySelector('#workshop-loading');
  const cleanupStage = applyWorkshopStageCover(stage, bg);
  let layout = normalizeWorkshopLayout(null);
  let selectedMachineId = null;

  const close = () => { cleanupStage(); overlay.remove(); onBack?.(); };
  overlay.querySelector('#workshop-back')?.addEventListener('click', close);

  const openMachine1Craft = () => {
    cleanupStage();
    overlay.remove();
    showEnhancementCraftScreen(
      () => showWorkshopScreen(onBack),
      { onCraftSuccess: celebration => showWorkshopScreen(onBack, { enhancementCelebration:celebration }) }
    );
  };

  function showEnhancementSuccessModal({ cardId, keyword } = {}) {
    const card=cardDb.getById(cardId);
    const persistedKeyword=state.userProfile?.enhancements?.[cardId] || keyword;
    if (!card || !persistedKeyword) return;
    const displayCard={ ...card, keywords:[...(card.keywords || []), persistedKeyword] };
    const keywordLabel=ENHANCEMENT_KEYWORDS.find(entry=>entry.key===persistedKeyword)?.label || persistedKeyword;
    const modal=document.createElement('div');
    modal.className='workshop-enhancement-success-overlay';
    modal.innerHTML=`<div class="workshop-enhancement-success-modal" role="dialog" aria-modal="true" aria-labelledby="workshop-enhancement-success-title">
      <h2 class="workshop-enhancement-success-title" id="workshop-enhancement-success-title">${gameTextHtml('workshop.enhancement.successTitle')}</h2>
      <div class="workshop-enhancement-success-ability">${gameTextHtml('workshop.enhancement.successAbility',{ability:keywordLabel})}</div>
      <div class="workshop-enhancement-success-card" id="workshop-enhancement-success-card"></div>
      <p class="workshop-enhancement-success-reminder">${gameTextHtml('workshop.enhancement.successReminder')}</p>
      <button class="workshop-action-btn" id="workshop-enhancement-success-close">${gameTextHtml('workshop.enhancement.continue')}</button>
    </div>`;
    document.body.appendChild(modal);
    const cardHost=modal.querySelector('#workshop-enhancement-success-card');
    const cardEl=createCardElement(displayCard,false,true,null,'preview',null);
    cardEl.setAttribute('aria-label',`${card.name} · ${keywordLabel}`);
    cardHost?.appendChild(cardEl);
    const dismiss=()=>modal.remove();
    modal.querySelector('#workshop-enhancement-success-close')?.addEventListener('click',dismiss);
  }


  function showEvolutionSuccessModal({ cardId, stage } = {}) {
    const baseCard=cardDb.getById(cardId);
    const persistedStage=evolutionStageForProfile(state.userProfile?.evolutions,cardId);
    const resolvedStage=Math.max(1,Math.min(2,Number(persistedStage || stage) || 1));
    if (!baseCard) return;
    const displayCard=applyEvolutionStage(baseCard,resolvedStage);
    const modal=document.createElement('div');
    modal.className='workshop-evolution-success-overlay';
    modal.innerHTML=`<div class="workshop-evolution-success-modal" role="dialog" aria-modal="true" aria-labelledby="workshop-evolution-success-title">
      <h2 class="workshop-evolution-success-title" id="workshop-evolution-success-title">${gameTextHtml('workshop.evolution.successTitle')}</h2>
      <div class="workshop-evolution-success-stage">${gameTextHtml('workshop.evolution.successStage',{stage:resolvedStage,rarity:displayCard.rarity||''})}</div>
      <div class="workshop-evolution-success-card" id="workshop-evolution-success-card"></div>
      <p class="workshop-evolution-success-reminder">${gameTextHtml('workshop.evolution.successReminder')}</p>
      <button class="workshop-action-btn" id="workshop-evolution-success-close">${gameTextHtml('workshop.evolution.continue')}</button>
    </div>`;
    document.body.appendChild(modal);
    const cardHost=modal.querySelector('#workshop-evolution-success-card');
    const cardEl=createCardElement(displayCard,false,true,null,'preview',null);
    cardEl.setAttribute('aria-label',`${displayCard.name} · EVO ${resolvedStage}`);
    cardHost?.appendChild(cardEl);
    const dismiss=()=>modal.remove();
    modal.querySelector('#workshop-evolution-success-close')?.addEventListener('click',dismiss);
  }


  function showMixerSuccessModal({ outputCardId, fromRarity, toRarity } = {}) {
    const displayCard=cardDb.getById(outputCardId); if(!displayCard)return;
    const modal=document.createElement('div'); modal.className='workshop-mixer-success-overlay';
    modal.innerHTML=`<div class="workshop-mixer-success-modal" role="dialog" aria-modal="true" aria-labelledby="workshop-mixer-success-title">
      <h2 class="workshop-mixer-success-title" id="workshop-mixer-success-title">${gameTextHtml('workshop.mixer.successTitle')}</h2>
      <div class="workshop-mixer-success-rarity">${gameTextHtml('workshop.mixer.successRarity',{from:fromRarity||'',to:toRarity||displayCard.rarity||''})}</div>
      <div class="workshop-mixer-success-card" id="workshop-mixer-success-card"></div>
      <p class="workshop-mixer-success-reminder">${gameTextHtml('workshop.mixer.successReminder')}</p>
      <button class="workshop-action-btn" id="workshop-mixer-success-close">${gameTextHtml('workshop.mixer.continue')}</button>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#workshop-mixer-success-card')?.appendChild(createCardElement(displayCard,false,true,null,'preview',null));
    modal.querySelector('#workshop-mixer-success-close')?.addEventListener('click',()=>modal.remove());
  }

  function renderWallet() {
    const points = Math.max(0, Math.floor(Number(state.userProfile?.points) || 0));
    const fichas = Math.max(0, Math.floor(Number(state.userProfile?.fichas) || 0));
    const essence = Math.max(0, Math.floor(Number(state.userProfile?.essence) || 0));
    const wallet = overlay.querySelector('#workshop-wallet');
    wallet.innerHTML = `<span class="workshop-wallet-pill">${COIN_ICON_HTML}<span>${gameTextHtml('workshop.wallet.points',{points})}</span></span><span class="workshop-wallet-pill">${FICHA_ICON_HTML}<span>${gameTextHtml('workshop.wallet.fichas',{fichas})}</span></span><span class="workshop-wallet-pill">${ESSENCE_ICON_HTML}<span>${gameTextHtml('workshop.wallet.essence',{essence})}</span></span><button class="workshop-action-btn" id="workshop-essence-open" style="padding:6px 9px;font-size:11px;">${gameTextHtml('workshop.essence.open')}</button>`;
    wallet.querySelector('#workshop-essence-open')?.addEventListener('click',openEssenceConverter);
  }

  function openEssenceConverter(){
    selectedMachineId=null;
    panel.classList.remove('workshop-panel--machine-detail');
    const policy=WORKSHOP_POLICY?.essence||{enabled:true,pointsPerUnit:500,fichasPerUnit:5,maxPerOperation:10};
    panel.hidden=false;
    panel.innerHTML=`<div class="workshop-panel-title">${gameTextHtml('workshop.essence.title')}</div><div class="workshop-panel-desc">${gameTextHtml('workshop.essence.description')}</div><div class="workshop-panel-cost">${gameTextHtml('workshop.essence.rate',{points:policy.pointsPerUnit,fichas:policy.fichasPerUnit})}</div><label style="display:flex;gap:8px;align-items:center;justify-content:center;margin:9px 0;"><span>${gameTextHtml('workshop.essence.quantity')}</span><input id="workshop-essence-quantity" type="number" min="1" max="${policy.maxPerOperation}" value="1" class="admin-field-input" style="width:90px;"></label><div class="workshop-panel-actions"><button class="workshop-action-btn" id="workshop-essence-convert" ${policy.enabled?'':'disabled'}>${gameTextHtml('workshop.essence.convert',{quantity:1})}</button><button class="workshop-action-btn secondary" id="workshop-panel-close">${gameTextHtml('common.close')}</button></div><div class="workshop-status" id="workshop-status"></div>`;
    const input=panel.querySelector('#workshop-essence-quantity'),btn=panel.querySelector('#workshop-essence-convert'),status=panel.querySelector('#workshop-status');
    const sync=()=>{const q=Math.min(policy.maxPerOperation,Math.max(1,Math.floor(Number(input?.value)||1)));if(input)input.value=String(q);if(btn)btn.textContent=gameText('workshop.essence.convert',{quantity:q});}; input?.addEventListener('input',sync);sync();
    panel.querySelector('#workshop-panel-close')?.addEventListener('click',()=>{panel.hidden=true;});
    btn?.addEventListener('click',async()=>{const quantity=Math.min(policy.maxPerOperation,Math.max(1,Math.floor(Number(input?.value)||1)));if(status)status.textContent='';try{const outcome=await withEconomyButtonPending(btn,()=>convertEssence(state.currentUser.uid,quantity),{pendingLabel:gameText('workshop.essence.pending'),slowLabel:gameText('workshop.server.slow')});if(outcome?.profile)state.userProfile=outcome.profile;renderWallet();if(status)status.textContent=gameText('workshop.essence.success',{quantity});}catch(err){console.error('No se pudo generar Esencia:',err);if(status)status.textContent=err?.message||gameText('workshop.essence.notEnough');}});
  }


  function openMachine2Evolution() {
    selectedMachineId='machine2';
    panel.classList.add('workshop-panel--machine-detail');
    const evolutions=normalizeEvolutionProfile(state.userProfile?.evolutions);
    const ownedCounts={};
    for(const id of (state.userProfile?.collection||[])) ownedCounts[id]=(ownedCounts[id]||0)+1;
    const candidates=EVOLUTION_PATHS.map(path=>({
      path,
      card:cardDb.getById(path.baseId),
      stage:evolutionStageForProfile(evolutions,path.baseId),
      owned:ownedCounts[path.baseId]||0
    })).filter(row=>row.card&&row.owned>0&&row.stage<2);
    panel.hidden=false;
    if(!candidates.length){
      panel.innerHTML=`<div class="workshop-panel-title">${gameTextHtml('workshop.evolution.title')}</div><div class="workshop-panel-desc">${gameTextHtml('workshop.evolution.empty')}</div><div class="workshop-panel-actions"><button class="workshop-action-btn secondary" id="workshop-panel-close">${gameTextHtml('common.close')}</button></div>`;
      panel.querySelector('#workshop-panel-close')?.addEventListener('click',()=>{panel.hidden=true;});
      return;
    }
    panel.innerHTML=`<div class="workshop-panel-title">${gameTextHtml('workshop.evolution.title')}</div><div class="workshop-panel-desc">${gameTextHtml('workshop.evolution.description')}</div><label class="workshop-evolution-picker"><span>${gameTextHtml('workshop.evolution.choose')}</span><select id="workshop-evolution-select">${candidates.map(row=>`<option value="${escapeHtml(row.path.baseId)}">${escapeHtml(row.card.name)} · ${row.stage?gameText('workshop.evolution.stage',{stage:row.stage}):gameText('workshop.evolution.base')}</option>`).join('')}</select></label><div id="workshop-evolution-detail"></div><div class="workshop-panel-actions"><button class="workshop-action-btn" id="workshop-evolution-action"></button><button class="workshop-action-btn secondary" id="workshop-panel-close">${gameTextHtml('common.close')}</button></div><div class="workshop-status" id="workshop-status"></div>`;
    const select=panel.querySelector('#workshop-evolution-select'),detail=panel.querySelector('#workshop-evolution-detail'),action=panel.querySelector('#workshop-evolution-action'),status=panel.querySelector('#workshop-status'),closeBtn=panel.querySelector('#workshop-panel-close');
    const renderDetail=()=>{
      const row=candidates.find(entry=>entry.path.baseId===select?.value)||candidates[0]; if(!row)return;
      const currentStage=evolutionStageForProfile(state.userProfile?.evolutions,row.path.baseId),nextStage=Math.min(2,currentStage+1);
      const currentCard=currentStage?applyEvolutionStage(row.card,currentStage):{...row.card};
      const nextCard=applyEvolutionStage(row.card,nextStage);
      const cost=WORKSHOP_POLICY?.evolution?.[`stage${nextStage}`]||{points:0,fichas:0,essence:0,copiesRequired:1};
      const owned=ownedCounts[row.path.baseId]||0, enhanced=!!state.userProfile?.enhancements?.[row.path.baseId];
      const physicalNeeded=Math.max(Number(cost.copiesRequired)||1,1+(enhanced?1:0));
      const hasFunds=(Number(state.userProfile?.points)||0)>=cost.points&&(Number(state.userProfile?.fichas)||0)>=cost.fichas&&(Number(state.userProfile?.essence)||0)>=cost.essence&&owned>=physicalNeeded;
      detail.replaceChildren();
      const preview=document.createElement('div');preview.className='workshop-evolution-preview';
      for(const [label,card] of [[gameText('workshop.evolution.current'),currentCard],[gameText('workshop.evolution.next'),nextCard]]){
        const block=document.createElement('div');block.className='workshop-evolution-preview-block';
        const title=document.createElement('div');title.className='workshop-evolution-preview-label';title.textContent=label;
        block.append(title,createCardElement(card,false,true,null,'preview',null));preview.appendChild(block);
      }
      const costEl=document.createElement('div');costEl.className='workshop-panel-cost';costEl.textContent=gameText('workshop.evolution.cost',{points:cost.points,fichas:cost.fichas,essence:cost.essence});
      const copies=document.createElement('div');copies.className='workshop-panel-desc';copies.textContent=gameText('workshop.evolution.copies',{required:physicalNeeded,owned});
      const rule=document.createElement('div');rule.className='workshop-evolution-rule';rule.textContent=gameText('workshop.evolution.deckRule');
      detail.append(preview,costEl,copies,rule);
      action.textContent=gameText('workshop.evolution.action',{stage:nextStage}); action.disabled=!hasFunds;
      action.dataset.cardId=row.path.baseId; action.dataset.nextStage=String(nextStage);
      if(status)status.textContent=hasFunds?'':gameText('workshop.evolution.notEnough');
    };
    select?.addEventListener('change',renderDetail); closeBtn?.addEventListener('click',()=>{panel.hidden=true;selectedMachineId=null;});
    action?.addEventListener('click',async()=>{
      const cardId=action.dataset.cardId,nextStage=Number(action.dataset.nextStage)||1,card=cardDb.getById(cardId); if(!card||!state.currentUser?.uid)return;
      if(status)status.textContent='';
      try{
        const outcome=await withEconomyButtonPending(action,()=>evolveCard(state.currentUser.uid,cardId),{pendingLabel:gameText('workshop.evolution.pending'),slowLabel:gameText('workshop.server.slow'),disablePeers:[select,closeBtn]});
        if(outcome?.profile)state.userProfile=outcome.profile;
        renderWallet();renderMachines();
        if(status)status.textContent=gameText('workshop.evolution.success',{card:card.name,stage:nextStage});
        cleanupStage();
        overlay.remove();
        showWorkshopScreen(onBack,{ evolutionCelebration:{cardId,stage:nextStage} });
      }catch(err){console.error('No se pudo evolucionar la carta:',err);if(status)status.textContent=err?.message||gameText('workshop.evolution.notEnough');}
    });
    renderDetail();
  }


  function clientMixerProtectedCopies(cardId){
    const baseId=String(cardId||''); let maxDeck=0;
    for(const deck of (state.userProfile?.decks||[])){
      let count=0; for(const raw of (deck?.cardIds||[])){const id=String(raw||''); const base=id.replace(/::(?:enhanced|evo1|evo2)$/,''); if(base===baseId)count+=1;}
      if(count>maxDeck)maxDeck=count;
    }
    const enhanced=state.userProfile?.enhancements?.[baseId]?1:0;
    const evolved=evolutionStageForProfile(state.userProfile?.evolutions,baseId)>0?1:0;
    return Math.max(1,maxDeck,enhanced+evolved);
  }
  function openMachine3Mixer(){
    selectedMachineId='machine3';
    panel.classList.add('workshop-panel--machine-detail');
    const ownedCounts={}; for(const id of (state.userProfile?.collection||[]))ownedCounts[id]=(ownedCounts[id]||0)+1;
    const candidates=(cardDb.enabledCards||cardDb.allCards||[]).filter(card=>['Common','Uncommon','Rare'].includes(card?.rarity)).map(card=>{
      const owned=ownedCounts[card.id]||0,protectedCopies=clientMixerProtectedCopies(card.id),freeEstimate=Math.max(0,owned-protectedCopies);
      return {card,owned,protectedCopies,freeEstimate};
    }).filter(row=>row.freeEstimate>=3).sort((a,b)=>String(a.card.name).localeCompare(String(b.card.name),'es'));
    panel.hidden=false;
    if(!candidates.length){panel.innerHTML=`<div class="workshop-panel-title">${gameTextHtml('workshop.mixer.title')}</div><div class="workshop-panel-desc">${gameTextHtml('workshop.mixer.empty')}</div><div class="workshop-panel-actions"><button class="workshop-action-btn secondary" id="workshop-panel-close">${gameTextHtml('common.close')}</button></div>`;panel.querySelector('#workshop-panel-close')?.addEventListener('click',()=>{panel.hidden=true;});return;}
    panel.innerHTML=`<div class="workshop-panel-title">${gameTextHtml('workshop.mixer.title')}</div><div class="workshop-panel-desc">${gameTextHtml('workshop.mixer.description')}</div><label class="workshop-evolution-picker"><span>${gameTextHtml('workshop.mixer.choose')}</span><select id="workshop-mixer-select">${candidates.map(row=>`<option value="${escapeHtml(row.card.id)}">${escapeHtml(row.card.name)} · ${escapeHtml(row.card.rarity)} · ${row.owned}×</option>`).join('')}</select></label><div id="workshop-mixer-detail"></div><div class="workshop-panel-actions"><button class="workshop-action-btn" id="workshop-mixer-action">${gameTextHtml('workshop.mixer.action')}</button><button class="workshop-action-btn secondary" id="workshop-panel-close">${gameTextHtml('common.close')}</button></div><div class="workshop-status" id="workshop-status"></div>`;
    const select=panel.querySelector('#workshop-mixer-select'),detail=panel.querySelector('#workshop-mixer-detail'),action=panel.querySelector('#workshop-mixer-action'),status=panel.querySelector('#workshop-status'),closeBtn=panel.querySelector('#workshop-panel-close');
    const nextRarity={Common:'Uncommon',Uncommon:'Rare',Rare:'Mythic'};
    const renderDetail=()=>{const row=candidates.find(r=>r.card.id===select?.value)||candidates[0];if(!row)return;const cost=WORKSHOP_POLICY?.mixer?.[row.card.rarity]||{points:0,fichas:0,essence:0};const to=nextRarity[row.card.rarity];const hasFunds=(Number(state.userProfile?.points)||0)>=cost.points&&(Number(state.userProfile?.fichas)||0)>=cost.fichas&&(Number(state.userProfile?.essence)||0)>=cost.essence&&row.freeEstimate>=3;detail.replaceChildren();const cardWrap=document.createElement('div');cardWrap.className='workshop-evolution-preview';cardWrap.style.gridTemplateColumns='1fr';const block=document.createElement('div');block.className='workshop-evolution-preview-block';block.appendChild(createCardElement(row.card,false,true,null,'preview',null));cardWrap.appendChild(block);const rarity=document.createElement('div');rarity.className='workshop-panel-cost';rarity.textContent=gameText('workshop.mixer.rarity',{from:row.card.rarity,to});const costEl=document.createElement('div');costEl.className='workshop-panel-cost';costEl.textContent=gameText('workshop.mixer.cost',{points:cost.points,fichas:cost.fichas,essence:cost.essence});const copies=document.createElement('div');copies.className='workshop-panel-desc';copies.textContent=gameText('workshop.mixer.copies',{owned:row.owned});const rule=document.createElement('div');rule.className='workshop-evolution-rule';rule.textContent=gameText('workshop.mixer.rule');detail.append(cardWrap,rarity,costEl,copies,rule);action.disabled=!hasFunds;action.dataset.cardId=row.card.id;if(status)status.textContent=hasFunds?'':gameText('workshop.mixer.notEnough');};
    select?.addEventListener('change',renderDetail);closeBtn?.addEventListener('click',()=>{panel.hidden=true;selectedMachineId=null;});
    action?.addEventListener('click',async()=>{const cardId=action.dataset.cardId;if(!cardId||!state.currentUser?.uid)return;if(status)status.textContent='';try{const outcome=await withEconomyButtonPending(action,()=>mixCards(state.currentUser.uid,cardId),{pendingLabel:gameText('workshop.mixer.pending'),slowLabel:gameText('workshop.server.slow'),disablePeers:[select,closeBtn]});if(outcome?.profile)state.userProfile=outcome.profile;const result=outcome?.result||{};renderWallet();renderMachines();cleanupStage();overlay.remove();showWorkshopScreen(onBack,{mixerCelebration:{outputCardId:result.outputCardId,fromRarity:result.fromRarity,toRarity:result.toRarity}});}catch(err){console.error('No se pudo mezclar la carta:',err);if(status)status.textContent=err?.message||gameText('workshop.mixer.notEnough');}});
    renderDetail();
  }

  function machineTitle(id) { return gameText(`workshop.${id}.title`); }
  function machineDescription(id) { return gameText(`workshop.${id}.description`); }

  function machineActionText(id) {
    if(id==='machine2') return gameText('workshop.machine2.action');
    if(id==='machine3') return gameText('workshop.machine3.action');
    return gameText('store.craft.action');
  }

  function renderPanel(machineId) {
    panel.classList.remove('workshop-panel--machine-detail');
    selectedMachineId = machineId;
    const policy = machinePolicy(machineId);
    const unlocked = isWorkshopMachineUnlocked(state.userProfile, machineId);
    const points = Math.max(0, Math.floor(Number(policy.points)||0));
    const fichas = Math.max(0, Math.floor(Number(policy.fichas)||0));
    const hasFunds = (Number(state.userProfile?.points)||0) >= points && (Number(state.userProfile?.fichas)||0) >= fichas;
    const future = !['machine1','machine2','machine3'].includes(machineId) || policy.available === false;
    panel.hidden = false;
    panel.innerHTML = `<div class="workshop-panel-title">${escapeHtml(machineTitle(machineId))}</div>
      <div class="workshop-panel-desc">${escapeHtml(machineDescription(machineId))}</div>
      ${unlocked ? `<div class="workshop-panel-cost">${gameTextHtml('workshop.unlocked')}</div>` : `<div class="workshop-panel-cost">${COIN_ICON_HTML} ${points} &nbsp; ${FICHA_ICON_HTML} ${fichas}</div>`}
      <div class="workshop-panel-actions">
        ${future ? `<button class="workshop-action-btn" disabled>${gameTextHtml('workshop.future')}</button>` : unlocked ? `<button class="workshop-action-btn" id="workshop-use-machine">${escapeHtml(machineActionText(machineId))}</button>` : `<button class="workshop-action-btn" id="workshop-unlock-machine" ${hasFunds?'':'disabled'}>${gameTextHtml('workshop.unlock')}</button>`}
        <button class="workshop-action-btn secondary" id="workshop-panel-close">${gameTextHtml('common.close')}</button>
      </div>
      <div class="workshop-status" id="workshop-status">${(!future && !unlocked && !hasFunds) ? gameTextHtml('workshop.unlock.notEnough') : ''}</div>`;
    panel.querySelector('#workshop-panel-close')?.addEventListener('click',()=>{ panel.hidden=true; selectedMachineId=null; });
    panel.querySelector('#workshop-use-machine')?.addEventListener('click',()=>{ if(machineId==='machine2') openMachine2Evolution(); else if(machineId==='machine3') openMachine3Mixer(); else openMachine1Craft(); });
    panel.querySelector('#workshop-unlock-machine')?.addEventListener('click', async event => {
      if (!state.currentUser?.uid || !state.userProfile) return;
      const btn=event.currentTarget, status=panel.querySelector('#workshop-status');
      const closeBtn=panel.querySelector('#workshop-panel-close');
      try {
        const outcome = await withEconomyButtonPending(btn, () => unlockWorkshopMachine(state.currentUser.uid, machineId), {
          pendingLabel:gameText('workshop.unlock.pending'),
          slowLabel:gameText('workshop.server.slow'),
          disablePeers:[closeBtn]
        });
        if (!outcome) return;
        if(outcome?.profile) state.userProfile=outcome.profile;
        renderWallet();
        panel.hidden=true;
        const machineEl=machineRoot.querySelector(`[data-machine-id="${machineId}"] .workshop-machine-hitbox`) || machineRoot.querySelector(`[data-machine-id="${machineId}"]`);
        await queueWorkshopUnlockAnimation({machineElement:machineEl,machineId});
        renderMachines();
        renderPanel(machineId);
        updateAccountUI(state.currentUser);
        const liveStatus=panel.querySelector('#workshop-status'); if(liveStatus) liveStatus.textContent=gameText('workshop.unlock.success',{machine:machineTitle(machineId)});
      } catch(err) {
        console.error('No se pudo desbloquear la máquina:',err);
        if(status) status.textContent=err?.message || gameText('workshop.unlock.notEnough');
      }
    });
  }

  function renderMachines() {
    machineRoot.replaceChildren();
    const profileWorkshop = normalizeWorkshopProfile(state.userProfile?.workshop);
    for (const machineId of WORKSHOP_MACHINE_IDS) {
      const item = layout.machines[machineId];
      const unlocked = !!profileWorkshop.unlockedMachines[machineId];
      const slot=document.createElement('button');
      slot.type='button'; slot.className=`workshop-machine-slot ${unlocked?'unlocked':'locked'}`;
      slot.dataset.machineId=machineId;
      slot.style.left=`${item.xPct}%`; slot.style.top=`${item.yPct}%`; slot.style.width=`${item.widthPct}%`;
      slot.setAttribute('aria-label',machineTitle(machineId));
      if(unlocked){
        const img=document.createElement('img'); img.className='workshop-machine-img'; img.src=`./assets/images/ui/${workshopMachineAsset(machineId)}`; img.alt=machineTitle(machineId);
        img.onerror=()=>{ console.warn('[Workshop] Asset faltante:',img.src); img.style.visibility='hidden'; };
        slot.appendChild(img);
      } else {
        const hit=document.createElement('span'); hit.className='workshop-machine-hitbox'; slot.appendChild(hit);
      }
      const badge=document.createElement('span'); badge.className='workshop-machine-badge'; badge.textContent=unlocked?gameText('workshop.unlocked'):(machinePolicy(machineId).available?gameText('workshop.locked'):gameText('workshop.future')); slot.appendChild(badge);
      slot.addEventListener('click',()=>renderPanel(machineId));
      machineRoot.appendChild(slot);
    }
  }

  (async()=>{
    try {
      if (!state.currentUser || !state.userProfile) {
        loading.textContent=gameText('workshop.loginRequired'); return;
      }
      if (WORKSHOP_POLICY.enabled === false) { loading.textContent=gameText('workshop.disabled'); return; }
      try { layout=normalizeWorkshopLayout(await loadPublicGameConfigDocument('workshop')); }
      catch(err){ console.warn('[Workshop] No se pudo cargar layout, se usan defaults.',err); }
      renderWallet(); renderMachines(); loading.remove();
      if(options.enhancementCelebration){
        const machineEl=machineRoot.querySelector('[data-machine-id="machine1"] .workshop-machine-img') || machineRoot.querySelector('[data-machine-id="machine1"]');
        await queueWorkshopEnhancementAnimation({ machineElement:machineEl });
        if (overlay.isConnected) showEnhancementSuccessModal(options.enhancementCelebration);
      } else if(options.evolutionCelebration){
        const machineEl=machineRoot.querySelector('[data-machine-id="machine2"] .workshop-machine-img') || machineRoot.querySelector('[data-machine-id="machine2"]');
        await queueWorkshopEvolutionAnimation({ machineElement:machineEl });
        if (overlay.isConnected) showEvolutionSuccessModal(options.evolutionCelebration);
      } else if(options.mixerCelebration){
        const machineEl=machineRoot.querySelector('[data-machine-id="machine3"] .workshop-machine-img') || machineRoot.querySelector('[data-machine-id="machine3"]');
        await queueWorkshopMixerAnimation({ machineElement:machineEl });
        if (overlay.isConnected) showMixerSuccessModal(options.mixerCelebration);
      } else if(options.autoOpenMachine1){
        if(isWorkshopMachineUnlocked(state.userProfile,'machine1')) openMachine1Craft();
        else renderPanel('machine1');
      }
    } catch(err){ console.error('[Workshop] Error al abrir Taller:',err); loading.textContent=err?.message||gameText('workshop.disabled'); }
  })();
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
    .deckbuilder-new-marker {
      position:absolute; top:-12px; left:-9px; z-index:25; pointer-events:none;
      padding:3px 7px; border-radius:999px; border:1px solid #fff0a0;
      background:linear-gradient(180deg,#e9b72f,#b77709); color:#171006;
      font-size:9px; font-weight:950; letter-spacing:.55px; box-shadow:0 2px 8px rgba(0,0,0,.55),0 0 10px rgba(231,178,42,.32);
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
  const recentAcquisitions = loadDeckbuilderRecentState(state.userProfile?.collection || []);
  const acquisitionLastIndex = recentAcquisitions.lastIndex;
  const enhancements = (state.userProfile && state.userProfile.enhancements) || {};
  const evolutions = normalizeEvolutionProfile(state.userProfile?.evolutions);
  const enhancedIds = new Set(Object.keys(enhancements).filter(id => isEnhancementEligibleCard(cardDb.getById(id))));

  let activeTab = 'criaturas';
  let searchQuery = '';
  let enhancedOnly = false;
  let evolvableOnly = false;
  const activeRarities = new Set(ENCYCLOPEDIA_RARITIES.map(r => r.key));
  const activeColors = new Set(CARD_BROWSER_COLORS.map(c => c.key));
  const activeArchetypes = new Set();
  const activeMechanics = new Set();
  const sortByTab = new Map(ENCYCLOPEDIA_TABS.map(tab => [tab.key, { key: 'cmc', direction: 'asc' }]));
  const RECENT_SORT_KEY = 'recent_obtained';
  const normalizeDeckSort = (tabKey, sort = {}) => sort?.key === RECENT_SORT_KEY
    ? { key: RECENT_SORT_KEY, direction: sort.direction === 'asc' ? 'asc' : 'desc' }
    : normalizeCardBrowserSort(tabKey, sort);
  const deckSortOptionsHTML = (tabKey, selectedKey) => `${browserSortOptionsHTML(tabKey, selectedKey)}<option value="${RECENT_SORT_KEY}"${selectedKey === RECENT_SORT_KEY ? ' selected' : ''}>Últimas obtenidas</option>`;
  const syncDeckSortControls = (sort) => {
    const normalized = normalizeDeckSort(activeTab, sort);
    const select = overlay.querySelector('#deck-sort-key');
    const direction = overlay.querySelector('#deck-sort-direction');
    if (select) { select.innerHTML = deckSortOptionsHTML(activeTab, normalized.key); select.value = normalized.key; }
    if (direction) {
      direction.textContent = normalized.direction === 'desc' ? '↓' : '↑';
      direction.title = normalized.direction === 'desc' ? 'Orden decreciente' : 'Orden creciente';
      direction.setAttribute('aria-label', direction.title);
    }
    return normalized;
  };
  let newOnly = false;
  const isNewlyObtained = cardId => Object.prototype.hasOwnProperty.call(recentAcquisitions.newAt, String(cardId));
  const markRecentlyObtainedSeen = cardId => {
    const id = String(cardId || '');
    if (!id || !isNewlyObtained(id)) return;
    delete recentAcquisitions.newAt[id];
    recentAcquisitions.save();
    overlay.querySelectorAll(`.deckbuilder-pool-card-wrap[data-base-card-id="${CSS.escape(id)}"] .deckbuilder-new-marker`).forEach(node => node.remove());
    if (newOnly) refreshPool();
  };
  const deckCounts = {};
  let workingDeckName = String(deckName || '').trim();
  if (existingDeck) {
    const normalizedExistingIds = reconcileDeckEnhancementSlots(existingDeck.cardIds || [], enhancements, ownedCounts, MAX_ENHANCED_CARDS_PER_DECK);
    normalizedExistingIds.forEach(id => { deckCounts[id] = (deckCounts[id] || 0) + 1; });
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
        <label class="encyclopedia-filter-option">
          <input type="checkbox" id="deckbuilder-evolvable-only">
          <img class="encyclopedia-evolvable-filter-icon" src="./assets/images/ui/evolucionable.png" alt="" aria-hidden="true">
          ${gameTextHtml('encyclopedia.filter.evolvable')}
        </label>
        <label class="encyclopedia-filter-option">
          <input type="checkbox" id="deckbuilder-new-only">
          🆕 Solo nuevas
        </label>
        <div class="encyclopedia-filter-section-title">Color</div>
        <div class="card-browser-filter-grid">${browserColorFiltersHTML('deck')}</div>
        <div class="encyclopedia-filter-section-title">Rareza</div>
        <div class="card-browser-filter-grid">${rarityFiltersHTML}</div>
        <div class="encyclopedia-filter-section-title">Arquetipo</div>
        <div class="card-browser-filter-grid archetypes">${browserArchetypeFiltersHTML('deck')}</div>
        <div class="encyclopedia-filter-section-title">Mecánicas</div>
        <div class="card-browser-filter-grid archetypes">${browserMechanicFiltersHTML('deck')}</div>
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

    const enhancementKeyword = entry.isEnhanced ? enhancements[entry.baseId || entry.card.id] : null;
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
        const parsedEvolution = isEnhanced ? {baseId:trackingKey,stage:0} : parseEvolutionVariantId(trackingKey);
        const baseId = isEnhanced ? trackingKey.slice(0, -ENHANCED_SUFFIX.length) : parsedEvolution.baseId;
        const baseCard = cardDb.getById(baseId);
        const card = baseCard && parsedEvolution.stage > 0 ? applyEvolutionStage(baseCard,parsedEvolution.stage) : baseCard;
        return { trackingKey, baseId, card, count, isEnhanced, isEvolved:parsedEvolution.stage>0, evolutionStage:parsedEvolution.stage, categoryKey: baseCard ? deckCategoryById.get(baseId) : null };
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

  function totalEvolvedInDeck() {
    return Object.entries(deckCounts)
      .filter(([key]) => parseEvolutionVariantId(key).stage > 0)
      .reduce((sum, [, n]) => sum + n, 0);
  }

  function isTileMaxed(trackingKey, cap, isEnhancedTile, isEvolvedTile=false) {
    const inDeck = deckCounts[trackingKey] || 0;
    const deckFull = totalInDeck() >= DECK_SIZE_EXACT;
    const enhancedDeckCapReached = isEnhancedTile && inDeck === 0 && totalEnhancedInDeck() >= MAX_ENHANCED_CARDS_PER_DECK;
    const evolvedDeckCapReached = isEvolvedTile && inDeck === 0 && totalEvolvedInDeck() >= MAX_EVOLVED_CARDS_PER_DECK;
    return inDeck >= cap || deckFull || enhancedDeckCapReached || evolvedDeckCapReached;
  }

  // 23.12.0 — agregar/quitar una carta ya NO destruye y reconstruye toda la grilla.
  // Antes, en Criaturas, un solo click podía recrear hasta 210 <img>; al construir 60
  // cartas eso generaba una tormenta de elementos/request candidates contra GitHub Pages.
  function refreshPoolTileStates() {
    grid.querySelectorAll('.deckbuilder-pool-card-wrap').forEach(wrap => {
      const trackingKey = wrap.dataset.trackingKey;
      const cap = Number(wrap.dataset.cap || 0);
      const isEnhancedTile = wrap.dataset.enhanced === '1';
      const isEvolvedTile = wrap.dataset.evolved === '1';
      const inDeck = deckCounts[trackingKey] || 0;
      wrap.classList.toggle('maxed', isTileMaxed(trackingKey, cap, isEnhancedTile, isEvolvedTile));
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

    function createPoolRecord(baseCard, displayCard, trackingKey, ownedForThisSlot, isEnhancedTile, isEvolvedTile=false) {
      const isBasicLand = displayCard.type.includes('básica');
      const cap = isBasicLand ? ownedForThisSlot : Math.min(ownedForThisSlot, MAX_COPIES_PER_CARD);
      const inDeck = deckCounts[trackingKey] || 0;
      const maxed = isTileMaxed(trackingKey, cap, isEnhancedTile, isEvolvedTile);

      const wrap = document.createElement('div');
      wrap.className = `deckbuilder-pool-card-wrap${maxed ? ' maxed' : ''}${isEnhancedTile ? ' enhanced' : ''}${isEvolvedTile ? ' evolved' : ''}`;
      wrap.dataset.trackingKey = trackingKey;
      wrap.dataset.baseCardId = baseCard.id;
      wrap.dataset.cap = String(cap);
      wrap.dataset.enhanced = isEnhancedTile ? '1' : '0';
      wrap.dataset.evolved = isEvolvedTile ? '1' : '0';
      wrap.appendChild(createCardElement(displayCard, false, true, null, 'encyclopedia', null));

      if (isNewlyObtained(baseCard.id)) {
        const newMarker = document.createElement('div');
        newMarker.className = 'deckbuilder-new-marker';
        newMarker.textContent = 'NUEVA';
        wrap.appendChild(newMarker);
      }

      if (isEnhancedTile) {
        const star = document.createElement('div');
        star.className = 'deckbuilder-enhanced-marker';
        star.textContent = '✨ Mejorada';
        wrap.appendChild(star);
      }
      if (isEvolvedTile) {
        const evo = document.createElement('div');
        evo.className = 'deckbuilder-enhanced-marker deckbuilder-evolved-marker';
        evo.textContent = gameText('workshop.evolution.badge',{stage:displayCard.evolutionStage || 1});
        wrap.appendChild(evo);
      }

      const badge = document.createElement('div');
      badge.className = 'deckbuilder-pool-card-badge';
      badge.textContent = `${inDeck}/${cap}`;
      wrap.appendChild(badge);

      wrap.addEventListener('click', () => {
        markRecentlyObtainedSeen(baseCard.id);
        if (isTileMaxed(trackingKey, cap, isEnhancedTile, isEvolvedTile)) return;
        deckCounts[trackingKey] = (deckCounts[trackingKey] || 0) + 1;
        refreshPoolTileStates();
        renderList();
      });

      fragment.appendChild(wrap);
      entry.records.push({ card: baseCard, displayCard, node: wrap, trackingKey, isEnhancedTile, isEvolvedTile });
    }

    cardDb.getByCategory(tabKey).forEach(card => {
      const owned = ownedCounts[card.id] || 0;
      if (owned <= 0) return;
      const enhancementKeyword = enhancements[card.id];
      const evolutionStage = evolutionStageForProfile(evolutions,card.id);
      let reserved=0;
      if (enhancementKeyword && owned-reserved>0) {
        const enhancedDisplayCard = { ...card, keywords: [...(card.keywords || []), enhancementKeyword] };
        createPoolRecord(card, enhancedDisplayCard, `${card.id}${ENHANCED_SUFFIX}`, 1, true, false);
        reserved += 1;
      }
      if (evolutionStage>0 && owned-reserved>0) {
        const evolvedDisplayCard=applyEvolutionStage(card,evolutionStage);
        createPoolRecord(card,evolvedDisplayCard,evolutionVariantId(card.id,evolutionStage),1,false,true);
        reserved += 1;
      }
      const remainingOwned=Math.max(0,owned-reserved);
      if (remainingOwned>0) createPoolRecord(card,card,card.id,remainingOwned,false,false);
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
    const sort = normalizeDeckSort(activeTab, sortByTab.get(activeTab));
    sortByTab.set(activeTab, sort);
    syncDeckSortControls(sort);

    entry.records.sort((a, b) => {
      let byCard = 0;
      if (sort.key === RECENT_SORT_KEY) {
        const aIndex = acquisitionLastIndex.has(a.card.id) ? acquisitionLastIndex.get(a.card.id) : -1;
        const bIndex = acquisitionLastIndex.has(b.card.id) ? acquisitionLastIndex.get(b.card.id) : -1;
        byCard = (aIndex - bIndex) * (sort.direction === 'desc' ? -1 : 1);
        if (byCard === 0) byCard = compareCardsForBrowser(a.card, b.card, { key:'cmc', direction:'asc' });
      } else {
        byCard = compareCardsForBrowser(a.card, b.card, sort);
      }
      if (byCard !== 0) return byCard;
      if (a.isEnhancedTile !== b.isEnhancedTile) return a.isEnhancedTile ? -1 : 1;
      if (a.isEvolvedTile !== b.isEvolvedTile) return a.isEvolvedTile ? -1 : 1;
      return a.trackingKey.localeCompare(b.trackingKey);
    });

    let visible = 0;
    entry.records.forEach(record => {
      const card = record.card;
      const matches = activeRarities.has(card.rarity) &&
        cardMatchesColorFilter(card, activeColors) &&
        cardMatchesTaxonomyFilter(card, activeArchetypes, activeMechanics) &&
        (!enhancedOnly || record.isEnhancedTile) &&
        (!evolvableOnly || isEvolutionEligibleCard(card)) &&
        (!newOnly || isNewlyObtained(card.id)) &&
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
          label.textContent = `${entry.count > 1 ? `${entry.count}× ` : ''}${entry.card.name}${entry.isEnhanced ? ' ✨' : ''}${entry.isEvolved ? ` · ${gameText('workshop.evolution.badge',{stage:entry.evolutionStage})}` : ''}`;
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
    const current = normalizeDeckSort(activeTab, sortByTab.get(activeTab));
    const nextKey = e.target.value;
    sortByTab.set(activeTab, { ...current, key: nextKey, direction: nextKey === RECENT_SORT_KEY ? 'desc' : current.direction });
    refreshPool();
  });
  overlay.querySelector('#deck-sort-direction').addEventListener('click', () => {
    const current = normalizeDeckSort(activeTab, sortByTab.get(activeTab));
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

  overlay.querySelector('#deckbuilder-evolvable-only').addEventListener('change', e => {
    evolvableOnly = !!e.target.checked;
    refreshPool();
  });

  overlay.querySelector('#deckbuilder-new-only').addEventListener('change', e => {
    newOnly = e.target.checked;
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

  overlay.querySelectorAll('input[data-browser-mechanic][data-filter-prefix="deck"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const mechanic = checkbox.getAttribute('data-browser-mechanic');
      if (checkbox.checked) activeMechanics.add(mechanic); else activeMechanics.delete(mechanic);
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
function showMatchLoadingBeforeGameplayCommit() {
  // HF17 — el cover se arma dentro del mismo click que confirma mazo/identidad, ANTES de
  // retirar el picker. Así ningún await posterior (Torneo server-side, Multiplayer, etc.)
  // puede dejar visible la mesa desnuda entre superficies.
  try { globalThis.__ARGENTINIA_SHOW_MATCH_LOADING__?.(); } catch {}
}

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
        showMatchLoadingBeforeGameplayCommit();
        overlay.remove();
        onChooseDeck(deck);
      }
    });
  });

  if (onPlayRandom) {
    overlay.querySelector('#playpicker-random').addEventListener('click', () => {
      showMatchLoadingBeforeGameplayCommit();
      overlay.remove();
      onPlayRandom();
    });
  }

  if (onPlayTestDeck) {
    overlay.querySelector('#playpicker-testdeck').addEventListener('click', () => {
      showMatchLoadingBeforeGameplayCommit();
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
    const evolutions = normalizeEvolutionProfile(state.userProfile?.evolutions);
    // HF8 — la vista previa del mazo usa un orden canónico legible: tipo (Criaturas →
    // Instantáneos → Conjuros → Encantamientos → Artefactos → Semidioses → Tierras),
    // luego CMC ascendente y finalmente nombre. La copia mejorada queda junto a su base.
    const detailCategoryOrder = new Map(ENCYCLOPEDIA_TABS.map((tab, index) => [tab.key, index]));
    const detailCategoryById = new Map();
    ENCYCLOPEDIA_TABS.forEach(tab => cardDb.getByCategory(tab.key).forEach(card => detailCategoryById.set(card.id, tab.key)));
    const displayOwnedCounts = getDeckBuilderOwnedCounts();
    const displayDeckIds = reconcileDeckEnhancementSlots(deck.cardIds || [], enhancements, displayOwnedCounts, MAX_ENHANCED_CARDS_PER_DECK);
    const cards = displayDeckIds
      .map(id => {
        const isEnhanced = id.endsWith(ENHANCED_SUFFIX);
        const parsedEvolution=isEnhanced?{baseId:id,stage:0}:parseEvolutionVariantId(id);
        const baseId = isEnhanced ? id.slice(0, -ENHANCED_SUFFIX.length) : parsedEvolution.baseId;
        const cardDef = cardDb.getById(baseId);
        if (!cardDef) return null;
        const keyword = isEnhanced ? enhancements[baseId] : null;
        let displayCard=parsedEvolution.stage>0?applyEvolutionStage(cardDef,parsedEvolution.stage):cardDef;
        if(keyword) displayCard={...displayCard,keywords:[...(displayCard.keywords||[]),keyword]};
        return {
          baseId,
          categoryKey: detailCategoryById.get(baseId) || 'otros',
          displayCard,
          isEnhanced: !!keyword,
          isEvolved: parsedEvolution.stage>0,
          evolutionStage: parsedEvolution.stage
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const typeDelta = (detailCategoryOrder.get(a.categoryKey) ?? 99) - (detailCategoryOrder.get(b.categoryKey) ?? 99);
        if (typeDelta) return typeDelta;
        const cmcDelta = (Number(a.displayCard?.cmc) || 0) - (Number(b.displayCard?.cmc) || 0);
        if (cmcDelta) return cmcDelta;
        const nameDelta = String(a.displayCard?.name || '').localeCompare(String(b.displayCard?.name || ''), 'es');
        if (nameDelta) return nameDelta;
        return (Number(b.isEvolved)-Number(a.isEvolved)) || (Number(b.isEnhanced)-Number(a.isEnhanced));
      });

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

    cards.forEach(({ displayCard, isEnhanced, isEvolved, evolutionStage }) => {
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
      if (isEvolved) {
        const marker = document.createElement('div');
        marker.className = 'deckbuilder-enhanced-marker deckbuilder-evolved-marker';
        marker.textContent = gameText('workshop.evolution.badge',{stage:evolutionStage});
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

function communityDateText(ms) {
  const value = Math.max(0, Number(ms) || 0);
  return value ? new Date(value).toLocaleString('es-AR') : '—';
}

function showModerationComposer({ title = 'Contactar Moderación', placeholder = 'Contanos qué pasó…', submitLabel = 'ENVIAR', onSubmit } = {}) {
  injectMulliganStyles();
  const layer = document.createElement('div');
  layer.className = 'gy-modal-overlay';
  layer.style.zIndex = '25050';
  layer.innerHTML = `<div class="gy-modal-content" style="max-width:520px;width:min(92vw,520px);">
    <div class="gy-modal-header"><h3>🛡️ ${escapeHtml(title)}</h3></div>
    <div style="display:flex;flex-direction:column;gap:10px;padding:16px;">
      <textarea id="moderation-compose-text" maxlength="1000" rows="6" placeholder="${escapeHtml(placeholder)}" style="width:100%;box-sizing:border-box;background:#111a14;color:#efe4bc;border:1px solid rgba(212,175,55,.5);border-radius:8px;padding:10px;resize:vertical;"></textarea>
      <div id="moderation-compose-status" style="min-height:18px;color:#e5c978;font-size:12px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;"><button class="mulligan-btn mulligan-btn-mull" id="moderation-compose-cancel">CANCELAR</button><button class="mulligan-btn mulligan-btn-keep" id="moderation-compose-send">${escapeHtml(submitLabel)}</button></div>
    </div>
  </div>`;
  document.body.appendChild(layer);
  const text = layer.querySelector('#moderation-compose-text');
  const status = layer.querySelector('#moderation-compose-status');
  const send = layer.querySelector('#moderation-compose-send');
  layer.querySelector('#moderation-compose-cancel')?.addEventListener('click', () => layer.remove());
  send?.addEventListener('click', async () => {
    const value = String(text?.value || '').replace(/\s+/g,' ').trim();
    if (!value) { status.textContent = 'Escribí un mensaje antes de enviar.'; return; }
    send.disabled = true; status.textContent = 'Enviando…';
    try {
      await onSubmit?.(value);
      status.textContent = '✓ Enviado a Moderación.';
      setTimeout(() => layer.remove(), 650);
    } catch (error) {
      status.textContent = error?.message || 'No se pudo enviar. Probá de nuevo.';
      send.disabled = false;
    }
  });
  setTimeout(() => text?.focus?.(), 0);
  return layer;
}

export async function showModerationCenter(onBack = null) {
  injectMulliganStyles();
  injectAdminPanelStyles();
  injectEncyclopediaStyles();
  document.getElementById('moderation-center-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'moderation-center-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:24000;background:radial-gradient(ellipse at center,#16211a 0%,#0b130e 100%);padding:24px;box-sizing:border-box;overflow:auto;color:#efe4bc;';
  overlay.innerHTML = `<div style="max-width:780px;margin:0 auto;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;"><button class="encyclopedia-back-btn" id="moderation-center-back" style="flex:0 0 auto;white-space:nowrap;">← Volver</button><h2 style="margin:0;color:#f0e0b0;flex:1 1 auto;min-width:150px;">🛡️ Moderación</h2><button class="admin-save-btn" id="moderation-center-new" style="width:auto;max-width:220px;flex:0 0 auto;margin:0 0 0 auto;white-space:nowrap;padding:10px 18px;">✉️ Nuevo mensaje</button></div>
    <div class="admin-section"><div class="admin-section-title">TUS CASOS Y RESPUESTAS</div><div id="moderation-center-status" class="admin-debug-summary">Cargando…</div><div id="moderation-center-cases" style="display:grid;gap:10px;margin-top:12px;"></div></div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); onBack?.(); };
  overlay.querySelector('#moderation-center-back')?.addEventListener('click', close);
  overlay.querySelector('#moderation-center-new')?.addEventListener('click', () => showModerationComposer({ onSubmit:text => contactModeration({ subject:'Mensaje del jugador', text }) }));
  const status = overlay.querySelector('#moderation-center-status');
  const list = overlay.querySelector('#moderation-center-cases');
  try {
    const cases = await getMyModerationCases();
    status.textContent = cases.length ? `${cases.length} caso${cases.length===1?'':'s'} registrado${cases.length===1?'':'s'}.` : 'Todavía no tenés casos.';
    list.innerHTML = cases.map(item => `<div style="border:1px solid rgba(212,175,55,.24);border-radius:9px;padding:11px;background:rgba(255,255,255,.025);">
      <div style="display:flex;gap:8px;justify-content:space-between;"><b>${item.status==='resolved'?'✅ Resuelto':'🟡 Abierto'} · ${escapeHtml(item.kind || 'consulta')}</b><span style="font-size:11px;color:#9ea99f;">${escapeHtml(communityDateText(item.createdAtMs))}</span></div>
      <div style="margin-top:7px;color:#d7ddd8;line-height:1.4;">${escapeHtml(item.text || '')}</div>
      ${item.response ? `<div style="margin-top:9px;padding:8px;border-left:3px solid #d4af37;background:rgba(212,175,55,.07);"><b>Moderación:</b> ${escapeHtml(item.response)}</div>` : ''}
    </div>`).join('');
    const unread=unreadModerationCases(cases); setCachedModerationPending(cases);
    if(unread.length){
      const acknowledgements=await Promise.allSettled(unread.map(item=>acknowledgeModerationCase(item.caseId)));
      const remaining=unread.filter((_,index)=>acknowledgements[index]?.status!=='fulfilled');
      mainMenuPendingState.moderationCount=remaining.length;
      setMainMenuActionBadge(document.getElementById('main-menu-account'),'menu-moderation',remaining.length);
    }
  } catch (error) {
    status.textContent = error?.message || 'No se pudieron cargar tus casos.';
  }
}

function showCommunityNotice({ title, bodyHtml, allowContact = false } = {}) {
  injectMulliganStyles();
  return new Promise(resolve => {
    const layer = document.createElement('div'); layer.className='gy-modal-overlay'; layer.style.zIndex='26000';
    layer.innerHTML=`<div class="gy-modal-content" style="max-width:500px;"><div class="gy-modal-header"><h3>${title}</h3></div><div style="padding:16px;display:flex;flex-direction:column;gap:12px;color:#dbe3dc;line-height:1.45;">${bodyHtml}<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">${allowContact?'<button class="mulligan-btn mulligan-btn-mull" id="community-notice-contact">Contactar Moderación</button>':''}<button class="mulligan-btn mulligan-btn-keep" id="community-notice-ok">Entendido</button></div></div></div>`;
    document.body.appendChild(layer);
    const done=()=>{ layer.remove(); resolve(); };
    layer.querySelector('#community-notice-ok')?.addEventListener('click',done);
    layer.querySelector('#community-notice-contact')?.addEventListener('click',()=>{ layer.remove(); showModerationComposer({ onSubmit:text=>contactModeration({subject:'Reclamo de moderación',text}) }); resolve(); });
  });
}

export async function showCommunityStatusAtBoot(status = null) {
  const ban = status?.ban || null;
  if (ban?.active) {
    const until = ban.permanent ? 'permanente' : `hasta ${communityDateText(ban.expiresAtMs)}`;
    await showCommunityNotice({ title:'⛔ Restricción de cuenta', allowContact:true, bodyHtml:`<div>Tu cuenta tiene un ban <b>${escapeHtml(until)}</b>.</div><div><b>Motivo:</b> ${escapeHtml(ban.reason || 'Moderación')}</div><div>Mientras esté activo no podés usar chat, desafíos ni iniciar/aceptar operaciones sociales de Mercado. Podés contactar Moderación desde este aviso.</div>` });
  }
  const cases=Array.isArray(status?.cases)?status.cases:[];
  const unread=unreadModerationCases(cases).sort((a,b)=>(b.resolvedAtMs||b.updatedAtMs||0)-(a.resolvedAtMs||a.updatedAtMs||0));
  setCachedModerationPending(cases);
  if (unread.length) {
    const item = unread[0];
    const hasResponse=!!String(item.response||'').trim();
    const title=hasResponse?'🛡️ Moderación respondió':'🛡️ Caso de Moderación cerrado';
    const bodyHtml=hasResponse
      ? `<div>${escapeHtml(item.response)}</div><div style="font-size:12px;color:#aab5ad;">Caso ${escapeHtml(item.caseId || '')}</div>`
      : `<div>Moderación cerró tu caso.</div><div style="font-size:12px;color:#aab5ad;">Caso ${escapeHtml(item.caseId || '')}</div>`;
    await showCommunityNotice({ title, bodyHtml });
    try {
      await acknowledgeModerationCase(item.caseId);
      mainMenuPendingState.moderationCount=Math.max(0,unread.length-1);
      setMainMenuActionBadge(document.getElementById('main-menu-account'),'menu-moderation',mainMenuPendingState.moderationCount);
    } catch (error) { console.warn('No se pudo confirmar lectura del caso:', error); }
  }
}


let achievementNoticeBusy=false;
let achievementClaimBusy=false;
function achievementRewardText(row={}){
  const parts=[];
  if(Number(row.points)>0) parts.push(gameText('achievements.reward.points',{amount:Number(row.points)}));
  if(Number(row.fichas)>0) parts.push(gameText('achievements.reward.fichas',{amount:Number(row.fichas)}));
  if(Number(row.essence)>0) parts.push(gameText('achievements.reward.essence',{amount:Number(row.essence)}));
  return parts.join(' · ') || gameText('achievements.reward.none');
}
function achievementFamilyLabel(id){ return gameText(`achievements.family.${id}`); }
function achievementMetricLabel(id){ return gameText(`achievements.metric.${id}`); }
function achievementTierLabel(tier){ return gameText(`achievements.tier.${tier}`); }
function achievementTrophyHtml(familyId,tier){
  const fallback=ACHIEVEMENT_TIER_ICONS[tier]||'🏆';
  const src=achievementTrophyPath(familyId,tier);
  return `<span class="achievement-trophy-media" aria-hidden="true"><img class="achievement-trophy-img" src="${escapeHtml(src)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="achievement-trophy-fallback" hidden>${fallback}</span></span>`;
}

function achievementRewardCardsHtml(row={}){
  const rewards=[
    {amount:Math.max(0,Number(row.points)||0),icon:COIN_ICON_HTML,label:gameTextHtml('admin.achievements.points')},
    {amount:Math.max(0,Number(row.fichas)||0),icon:FICHA_ICON_HTML,label:gameTextHtml('admin.achievements.fichas')},
    {amount:Math.max(0,Number(row.essence)||0),icon:ESSENCE_ICON_HTML,label:gameTextHtml('admin.achievements.essence')}
  ].filter(item=>item.amount>0);
  if(!rewards.length) return `<div class="achievement-claim-no-currency">${gameTextHtml('achievements.reward.none')}</div>`;
  return rewards.map(item=>`<div class="achievement-claim-resource"><div class="achievement-claim-resource-icon">${item.icon}</div><strong>+${item.amount.toLocaleString('es-AR')}</strong><span>${item.label}</span></div>`).join('');
}

function showAchievementClaimRewardModal(row={}){
  injectMulliganStyles();
  injectAchievementStyles();
  document.querySelector('.achievement-claim-success-overlay')?.remove();
  const familyId=String(row.familyId||'');
  const tier=String(row.tier||'');
  const modal=document.createElement('div');
  modal.className='gy-modal-overlay achievement-claim-success-overlay';
  modal.innerHTML=`<div class="gy-modal-content achievement-claim-success-modal">
    <div class="gy-modal-header achievement-claim-success-header"><h3>${gameTextHtml('achievements.claim.modalTitle')}</h3></div>
    <div class="achievement-claim-success-body">
      <div class="achievement-claim-success-trophy">${achievementTrophyHtml(familyId,tier)}</div>
      <div class="achievement-claim-success-name">${gameTextHtml('achievements.claim.modalSubtitle',{achievement:achievementFamilyLabel(familyId),tier:achievementTierLabel(tier)})}</div>
      <div class="achievement-claim-success-resources">${achievementRewardCardsHtml(row)}</div>
      <button class="mulligan-btn mulligan-btn-keep achievement-claim-success-ok" type="button">${gameTextHtml('achievements.claim.continue')}</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();
  modal.querySelector('.achievement-claim-success-ok')?.addEventListener('click',close);
}

function injectAchievementStyles(){
  if(document.getElementById('achievement-styles')) return;
  const style=document.createElement('style'); style.id='achievement-styles'; style.textContent=`
    #achievements-overlay{position:fixed;inset:0;z-index:10035;background:radial-gradient(circle at 50% 0,#1b1c23,#090a0d 58%,#030405);color:#eee;overflow:auto;padding:18px;box-sizing:border-box}
    .achievements-shell{width:min(1180px,100%);margin:0 auto 40px}.achievements-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 0 14px;background:linear-gradient(#090a0df5,#090a0dcc,transparent)}
    .achievements-heading{min-width:0;flex:1}.achievements-subtitle{font-size:12px;color:#9fb0a2;margin-top:4px}.achievements-wallet{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.achievements-wallet>span{display:flex;align-items:center;gap:4px;padding:6px 9px;border:1px solid rgba(212,175,55,.35);border-radius:999px;background:#111b;font-weight:800;font-size:12px}.achievements-wallet img{width:24px!important;height:24px!important;object-fit:contain;flex:0 0 auto}
    .achievement-family{margin:14px 0 20px;padding:14px;border:1px solid rgba(212,175,55,.28);border-radius:15px;background:linear-gradient(180deg,rgba(35,31,22,.78),rgba(11,12,14,.9));box-shadow:0 10px 28px rgba(0,0,0,.25)}
    .achievement-family-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:12px}.achievement-family-name{font-size:19px;font-weight:900;color:#f0d981}.achievement-family-metric{font-size:12px;color:#aaa}.achievement-family-value{font-size:17px;font-weight:900;color:#fff}
    .achievement-levels{display:grid;grid-template-columns:repeat(5,minmax(185px,1fr));gap:9px}.achievement-level{position:relative;padding:12px 10px;border:1px solid #3d3d3d;border-radius:12px;background:#111;min-height:286px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;overflow:hidden}.achievement-level.reached{border-color:#bd9b35;background:linear-gradient(180deg,#29200d,#111)}.achievement-level.claimed{border-color:#47734e;background:linear-gradient(180deg,#14251a,#101311)}.achievement-trophy{line-height:1;filter:drop-shadow(0 4px 8px #000)}.achievement-trophy-media{display:inline-flex;width:158px;height:158px;align-items:center;justify-content:center}.achievement-trophy-img{display:block;max-width:100%;max-height:100%;object-fit:contain}.achievement-trophy-fallback{font-size:92px;line-height:1}.achievement-tier{font-weight:900;text-transform:uppercase;letter-spacing:.06em}.achievement-progress{font-weight:800;font-size:12px}.achievement-bar{height:6px;width:100%;border-radius:99px;background:#303030;overflow:hidden}.achievement-bar>i{display:block;height:100%;background:linear-gradient(90deg,#688ac7,#8bdcff);border-radius:99px}.achievement-reward{font-size:11px;color:#d8c992;min-height:28px}.achievement-claim-btn{margin-top:auto;border:1px solid #d4af37;background:linear-gradient(#67501d,#382807);color:#fff2b8;border-radius:8px;padding:7px 10px;font-weight:900;cursor:pointer}.achievement-claim-btn:disabled{opacity:.48;cursor:default}.achievements-loading{padding:50px;text-align:center;font-weight:800;color:#dbc776;display:flex;align-items:center;justify-content:center;gap:9px}.achievements-loading .economy-pending-spinner{width:18px;height:18px;border-width:2px}
    .achievement-notice-trophy{display:flex;justify-content:center;margin:4px 0 10px}.achievement-notice-trophy .achievement-trophy-media{width:184px;height:184px}.achievement-notice-trophy .achievement-trophy-fallback{font-size:108px}.achievement-notice-body{font-weight:800;margin:4px 0 10px;text-align:center;color:#dbe3dc;line-height:1.45}.achievement-notice-reward{text-align:center;color:#d8c992;font-size:12px}.achievement-notice-actions{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap}
    .achievement-claim-success-overlay{z-index:20120!important;background:radial-gradient(circle at 50% 28%,rgba(212,175,55,.15),rgba(0,0,0,.9) 54%)!important;backdrop-filter:blur(5px)}
    .achievement-claim-success-modal{width:min(560px,94vw)!important;max-width:560px!important;border:1px solid rgba(212,175,55,.7)!important;border-radius:16px!important;background:radial-gradient(circle at 50% 0,rgba(109,82,17,.28),transparent 38%),linear-gradient(180deg,#17211b,#0c1210)!important;box-shadow:0 0 38px rgba(212,175,55,.18),0 22px 58px rgba(0,0,0,.72)!important;padding:16px 18px 18px!important}
    .achievement-claim-success-header{justify-content:center!important;border-bottom-color:rgba(212,175,55,.36)!important;margin-bottom:8px!important}.achievement-claim-success-header h3{margin:0;color:#f7e5a4;letter-spacing:.055em;text-align:center;font-size:22px}
    .achievement-claim-success-body{display:flex;flex-direction:column;align-items:center;gap:12px}.achievement-claim-success-trophy{display:flex;justify-content:center;filter:drop-shadow(0 8px 14px rgba(0,0,0,.5))}.achievement-claim-success-trophy .achievement-trophy-media{width:164px;height:164px}.achievement-claim-success-trophy .achievement-trophy-fallback{font-size:96px}
    .achievement-claim-success-name{font-size:15px;font-weight:900;color:#fff3c3;text-align:center}.achievement-claim-success-resources{width:100%;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.achievement-claim-resource{min-width:118px;display:grid;grid-template-columns:44px 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;padding:9px 11px;border:1px solid rgba(212,175,55,.28);border-radius:12px;background:rgba(0,0,0,.24);box-shadow:inset 0 0 18px rgba(255,255,255,.02)}.achievement-claim-resource-icon{grid-row:1/3;display:flex;align-items:center;justify-content:center}.achievement-claim-resource :is(.coin-icon,.ficha-icon,.essence-icon){width:42px!important;height:42px!important;object-fit:contain}.achievement-claim-resource strong{font-size:20px;line-height:1;color:#fff}.achievement-claim-resource span{font-size:10px;font-weight:800;letter-spacing:.055em;text-transform:uppercase;color:#d9c982}.achievement-claim-no-currency{padding:10px;color:#d9c982;font-weight:800}.achievement-claim-success-ok{min-width:180px;margin-top:2px}
    @media(max-width:850px){#achievements-overlay{padding:8px}.achievement-levels{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:7px}.achievement-level{min-width:174px;min-height:236px;scroll-snap-align:start}.achievement-trophy-media{width:108px;height:108px}.achievement-trophy-fallback{font-size:64px}.achievement-notice-trophy .achievement-trophy-media{width:132px;height:132px}.achievement-notice-trophy .achievement-trophy-fallback{font-size:78px}.achievements-header{align-items:flex-start}.achievements-wallet{max-width:none;display:grid;grid-template-columns:repeat(3,max-content);align-items:center;justify-content:end;gap:6px}.achievements-wallet>span{height:38px;box-sizing:border-box;justify-content:center;white-space:nowrap}.achievements-heading .encyclopedia-title{font-size:20px}.achievement-claim-success-modal{width:min(94vw,460px)!important;padding:12px!important}.achievement-claim-success-header h3{font-size:18px}.achievement-claim-success-trophy .achievement-trophy-media{width:122px;height:122px}.achievement-claim-success-trophy .achievement-trophy-fallback{font-size:72px}.achievement-claim-success-resources{gap:6px}.achievement-claim-resource{min-width:94px;grid-template-columns:34px 1fr;padding:7px 8px}.achievement-claim-resource :is(.coin-icon,.ficha-icon,.essence-icon){width:32px!important;height:32px!important}.achievement-claim-resource strong{font-size:17px}}
    @media(max-width:560px){.achievements-header{display:grid;grid-template-columns:auto 1fr;gap:8px}.achievements-heading{grid-column:2}.achievements-wallet{grid-column:1/-1;width:100%;grid-template-columns:repeat(3,1fr);justify-content:stretch}.achievements-wallet>span{min-width:0;padding:5px 7px}.achievements-wallet img{width:22px!important;height:22px!important}}
  `; document.head.appendChild(style);
}

async function loadAchievementRuntime(){
  const [stats,rawConfig]=await Promise.all([
    bootstrapPlayerStatistics(state.currentUser?.uid),
    loadPublicGameConfigDocument('achievements').catch(()=>null)
  ]);
  return {stats:stats||{},config:normalizeAchievementsConfig(rawConfig||{})};
}

const MAIN_MENU_PENDING_REFRESH_MS=5000;
const mainMenuPendingState={uid:'',achievementCount:null,moderationCount:null,refreshedAt:0,promise:null};
function pendingAchievementIds(runtime){
  if(!runtime?.config?.enabled||!state.userProfile) return [];
  const claimed=normalizeAchievementProfile(state.userProfile?.achievements).claimed;
  const ids=[];
  for(const family of ACHIEVEMENT_FAMILIES){
    const current=achievementMetricValue({profile:state.userProfile,stats:runtime.stats,metric:family.metric,cardLookup:id=>cardDb.getById(id)});
    for(const tier of ACHIEVEMENT_TIERS){const id=achievementId(family.id,tier),row=runtime.config.entries[id];if(row?.enabled&&current>=row.target&&!claimed[id])ids.push(id);}
  }
  return ids;
}
function unreadModerationCases(cases=[]){return (Array.isArray(cases)?cases:[]).filter(item=>item?.status==='resolved'&&!item?.acknowledgedAtMs);}
function mainMenuBadgeText(count){const n=Math.max(0,Math.floor(Number(count)||0));return n>99?'99+':String(n);}
function setMainMenuActionBadge(container,buttonId,count){
  const btn=container?.querySelector?.(`#${buttonId}`); if(!btn)return;
  btn.querySelector(':scope > .main-menu-reward-badge[data-account-pending]')?.remove();
  const n=Math.max(0,Math.floor(Number(count)||0)); if(!n)return;
  const badge=document.createElement('span');badge.className='main-menu-reward-badge';badge.dataset.accountPending='true';badge.textContent=mainMenuBadgeText(n);btn.appendChild(badge);
}
function setCachedModerationPending(cases){
  if(!state.currentUser?.uid)return;
  mainMenuPendingState.uid=state.currentUser.uid;mainMenuPendingState.moderationCount=unreadModerationCases(cases).length;
  setMainMenuActionBadge(document.getElementById('main-menu-account'),'menu-moderation',mainMenuPendingState.moderationCount);
}
function invalidateMainMenuPendingAchievements(){mainMenuPendingState.achievementCount=null;mainMenuPendingState.refreshedAt=0;}
async function refreshMainMenuPendingActions(container,user,{force=false}={}){
  const uid=String(user?.uid||''); if(!uid||uid!==String(state.currentUser?.uid||''))return;
  if(mainMenuPendingState.uid!==uid){mainMenuPendingState.uid=uid;mainMenuPendingState.achievementCount=null;mainMenuPendingState.moderationCount=null;mainMenuPendingState.refreshedAt=0;mainMenuPendingState.promise=null;}
  const fresh=!force&&mainMenuPendingState.refreshedAt&&(Date.now()-mainMenuPendingState.refreshedAt)<MAIN_MENU_PENDING_REFRESH_MS;
  if(fresh){setMainMenuActionBadge(container,'menu-achievements',mainMenuPendingState.achievementCount);setMainMenuActionBadge(container,'menu-moderation',mainMenuPendingState.moderationCount);return;}
  if(mainMenuPendingState.promise)return mainMenuPendingState.promise;
  const promise=Promise.allSettled([loadAchievementRuntime(),getMyModerationCases()]).then(results=>{
    if(uid!==String(state.currentUser?.uid||''))return;
    if(results[0].status==='fulfilled')mainMenuPendingState.achievementCount=pendingAchievementIds(results[0].value).length;
    if(results[1].status==='fulfilled')mainMenuPendingState.moderationCount=unreadModerationCases(results[1].value).length;
    mainMenuPendingState.refreshedAt=Date.now();
    setMainMenuActionBadge(container,'menu-achievements',mainMenuPendingState.achievementCount);
    setMainMenuActionBadge(container,'menu-moderation',mainMenuPendingState.moderationCount);
  }).finally(()=>{if(mainMenuPendingState.promise===promise)mainMenuPendingState.promise=null;});
  mainMenuPendingState.promise=promise; return promise;
}

export function showAchievementsScreen(onBack){
  if(!state.currentUser||!state.userProfile) return;
  injectEncyclopediaStyles(); // botones/titular estándar: independiente del orden de navegación
  injectAchievementStyles(); ensureEconomyPendingStyles();
  document.getElementById('achievements-overlay')?.remove();
  const overlay=document.createElement('div'); overlay.id='achievements-overlay';
  overlay.innerHTML=`<div class="achievements-shell"><div class="achievements-header"><button class="encyclopedia-back-btn" id="achievements-back">← ${gameTextHtml('achievements.back')}</button><div class="achievements-heading"><div class="encyclopedia-title">${gameTextHtml('achievements.title')}</div><div class="achievements-subtitle">${gameTextHtml('achievements.subtitle')}</div></div><div class="achievements-wallet" id="achievements-wallet"></div></div><div id="achievements-content" class="achievements-loading"><span class="economy-pending-spinner" aria-hidden="true"></span><span>${gameTextHtml('achievements.loading')}</span></div></div>`;
  document.body.appendChild(overlay);
  const content=overlay.querySelector('#achievements-content');
  const close=()=>{overlay.remove();onBack?.();}; overlay.querySelector('#achievements-back')?.addEventListener('click',close);
  let runtime=null;
  const renderWallet=()=>{const p=Math.max(0,Number(state.userProfile?.points)||0),f=Math.max(0,Number(state.userProfile?.fichas)||0),e=Math.max(0,Number(state.userProfile?.essence)||0);overlay.querySelector('#achievements-wallet').innerHTML=`<span>${COIN_ICON_HTML} ${p}</span><span>${FICHA_ICON_HTML} ${f}</span><span>${ESSENCE_ICON_HTML} ${e}</span>`;};
  const render=()=>{
    renderWallet(); if(!runtime) return;
    if(!runtime.config.enabled){content.innerHTML=`<div class="achievements-loading">${gameTextHtml('achievements.disabled')}</div>`;return;}
    const claimed=normalizeAchievementProfile(state.userProfile?.achievements).claimed;
    content.className='';
    content.innerHTML=ACHIEVEMENT_FAMILIES.map(family=>{
      const current=achievementMetricValue({profile:state.userProfile,stats:runtime.stats,metric:family.metric,cardLookup:id=>cardDb.getById(id)});
      const levels=ACHIEVEMENT_TIERS.map(tier=>{
        const id=achievementId(family.id,tier),row=runtime.config.entries[id]; if(!row?.enabled) return '';
        const isClaimed=!!claimed[id], reached=current>=row.target, pct=Math.max(0,Math.min(100,(current/Math.max(1,row.target))*100));
        return `<div class="achievement-level ${isClaimed?'claimed':reached?'reached':''}" data-achievement-id="${escapeHtml(id)}"><div class="achievement-trophy">${achievementTrophyHtml(family.id,tier)}</div><div class="achievement-tier">${escapeHtml(achievementTierLabel(tier))}</div><div class="achievement-progress">${gameTextHtml('achievements.progress',{current:Math.min(current,row.target),target:row.target})}</div><div class="achievement-bar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="achievement-reward">${gameTextHtml('achievements.reward',{reward:achievementRewardText(row)})}</div><button class="achievement-claim-btn" data-claim-achievement="${escapeHtml(id)}" ${(!reached||isClaimed)?'disabled':''}>${isClaimed?gameTextHtml('achievements.claimed'):reached?gameTextHtml('achievements.claim'):gameTextHtml('achievements.locked')}</button></div>`;
      }).join('');
      return `<section class="achievement-family"><div class="achievement-family-head"><div><div class="achievement-family-name">${escapeHtml(achievementFamilyLabel(family.id))}</div><div class="achievement-family-metric">${escapeHtml(achievementMetricLabel(family.id))}</div></div><div class="achievement-family-value">${current.toLocaleString('es-AR')}</div></div><div class="achievement-levels">${levels}</div></section>`;
    }).join('');
    content.querySelectorAll('[data-claim-achievement]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(achievementClaimBusy) return;
      const id=btn.dataset.claimAchievement,row=runtime.config.entries[id];
      const claimButtons=[...content.querySelectorAll('[data-claim-achievement]')];
      achievementClaimBusy=true;
      try{
        const outcome=await withEconomyButtonPending(btn,()=>claimAchievement(state.currentUser.uid,id),{pendingLabel:gameText('achievements.claiming'),slowLabel:gameText('workshop.server.slow'),disablePeers:claimButtons.filter(node=>node!==btn)});
        if(outcome?.profile) state.userProfile=outcome.profile;
        runtime.stats=await bootstrapPlayerStatistics(state.currentUser.uid)||runtime.stats;
        invalidateMainMenuPendingAchievements();
        showAchievementClaimRewardModal(row); render();
      }catch(err){console.error('No se pudo reclamar logro:',err);showSimpleAlertModal(escapeHtml(err?.message||gameText('achievements.error.generic')));}
      finally{achievementClaimBusy=false;}
    }));
  };
  renderWallet();
  void loadAchievementRuntime().then(value=>{runtime=value;render();}).catch(err=>{console.error('No se pudieron cargar Logros:',err);content.innerHTML=`<div class="achievements-loading">${escapeHtml(err?.message||gameText('achievements.error.generic'))}</div>`;});
}

async function maybeShowAchievementUnlockNotice(openAchievements){
  if(achievementNoticeBusy||!state.currentUser||!state.userProfile) return;
  const uid=state.currentUser.uid;
  achievementNoticeBusy=true;
  try{
    const {stats,config}=await loadAchievementRuntime(); if(!config.enabled) return;
    const achievementState=normalizeAchievementProfile(state.userProfile?.achievements),claimed=achievementState.claimed,serverNotified=achievementState.notified;
    // Compatibilidad de migración: avisos que ya se mostraron antes de HF23.3.16.2.24
    // siguen silenciados en este navegador mientras el nuevo ledger server-side gobierna los nuevos.
    const storageKey=`argentinia.achievementNotices.v1.${uid}`; let legacyNotified={}; try{legacyNotified=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
    let found=null;
    for(const family of ACHIEVEMENT_FAMILIES){const current=achievementMetricValue({profile:state.userProfile,stats,metric:family.metric,cardLookup:id=>cardDb.getById(id)});for(const tier of ACHIEVEMENT_TIERS){const id=achievementId(family.id,tier),row=config.entries[id];if(row?.enabled&&current>=row.target&&!claimed[id]&&!serverNotified[id]&&!legacyNotified[id]){found={id,row,family,tier};break;}}if(found)break;}
    if(!found) return;
    // Persistimos ANTES de abrir el modal: un F5, otro navegador o un segundo dispositivo
    // nunca deben volver a disparar el mismo "LOGRO OBTENIDO". Si el ACK falla, no mostramos
    // el modal y el pill de Mis Logros sigue dejando visible la recompensa pendiente.
    let noticeOutcome=null;
    try{noticeOutcome=await acknowledgeAchievementNotice(uid,found.id);}catch(error){console.warn('No se pudo persistir el aviso único de Logros; se omite el modal para evitar repeticiones:',error);return;}
    if(noticeOutcome?.profile)state.userProfile=noticeOutcome.profile;
    mainMenuPendingState.uid=uid; mainMenuPendingState.achievementCount=pendingAchievementIds({stats,config}).length; mainMenuPendingState.refreshedAt=Date.now();
    setMainMenuActionBadge(document.getElementById('main-menu-account'),'menu-achievements',mainMenuPendingState.achievementCount);
    legacyNotified[found.id]=Date.now();try{localStorage.setItem(storageKey,JSON.stringify(legacyNotified));}catch{}
    injectAchievementStyles();
    injectMulliganStyles(); // modal/botones estándar: no depende de haber abierto Taller u otra pantalla
    const modal=document.createElement('div');
    modal.className='gy-modal-overlay';
    modal.innerHTML=`<div class="gy-modal-content" style="max-width:500px;width:min(92vw,500px);"><div class="gy-modal-header"><h3>${gameTextHtml('achievements.unlocked.title')}</h3></div><div style="padding:6px 14px 14px;"><div class="achievement-notice-trophy">${achievementTrophyHtml(found.family.id,found.tier)}</div><div class="achievement-notice-body">${gameTextHtml('achievements.unlocked.body',{achievement:achievementFamilyLabel(found.family.id),tier:achievementTierLabel(found.tier)})}</div><div class="achievement-notice-reward">${gameTextHtml('achievements.reward',{reward:achievementRewardText(found.row)})}</div><div class="achievement-notice-actions"><button class="mulligan-btn mulligan-btn-keep" id="achievement-notice-open">${gameTextHtml('achievements.unlocked.action')}</button><button class="mulligan-btn mulligan-btn-mull" id="achievement-notice-close">${gameTextHtml('achievements.unlocked.later')}</button></div></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#achievement-notice-close')?.addEventListener('click',()=>modal.remove());
    modal.querySelector('#achievement-notice-open')?.addEventListener('click',()=>{modal.remove();openAchievements?.();});
  }catch(err){console.warn('No se pudo evaluar aviso de Logros:',err);}finally{achievementNoticeBusy=false;}
}

function openCurrentUserRename({onUpdated=null}={}) {
  if (!state.currentUser || !state.userProfile) return null;
  if (state.currentMatch || state.userProfile.activeMatchId) {
    showSimpleAlertModal(gameText('account.renameActiveMatch'));
    return null;
  }
  if ((Number(state.userProfile.fichas) || 0) < USERNAME_RENAME_COST) {
    showSimpleAlertModal(gameText('account.renameNeedFichas', { cost: USERNAME_RENAME_COST }));
    return null;
  }
  return showUsernameRenameModal({
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
      updateAccountUI(state.currentUser);
      onUpdated?.(updated);
      return updated;
    }
  });
}

function renderAccountBox(container, user) {
  if (!container) return;

  if (user) {
    // Fase 2: los puntos viven en el perfil de Firestore (state.userProfile), no en el
    // objeto de auth — puede no estar cargado todavía (recién logueado) o no existir aún
    // (nunca jugó una partida), así que se muestra solo cuando hay un número real.
    const walletHTML = state.userProfile
      ? `<div class="main-menu-account-wallet">
          <span class="main-menu-account-wallet-item">${COIN_ICON_HTML}<strong>${Math.max(0,Number(state.userProfile.points)||0).toLocaleString('es-AR')}</strong></span>
          <span class="main-menu-account-wallet-item">${FICHA_ICON_HTML}<strong>${Math.max(0,Number(state.userProfile.fichas)||0).toLocaleString('es-AR')}</strong></span>
          <span class="main-menu-account-wallet-item">${ESSENCE_ICON_HTML}<strong>${Math.max(0,Number(state.userProfile.essence)||0).toLocaleString('es-AR')}</strong></span>
        </div>`
      : '';
    // PANEL DE ADMIN: el botón solo se arma si el email logueado coincide EXACTO — para
    // cualquier otra cuenta, ni siquiera existe en el DOM (no es solo "oculto con CSS").
    const adminBtnHTML = user.email === ADMIN_EMAIL
      ? `<button class="main-menu-admin-btn" id="menu-admin">${gameTextHtml('account.admin')}</button>`
      : '';
    const inventory = normalizeInventory(state.userProfile?.inventory);
    const chestPending = inventory[CHEST_ITEM_KEYS.standardPack] + inventory[CHEST_ITEM_KEYS.guaranteedMythic];
    const rewardsPending = state.userProfile ? unclaimedUnlockedDays(state.userProfile.dailyRewards).length : 0;
    const cachedAchievementPending = mainMenuPendingState.uid===user.uid ? Math.max(0,Number(mainMenuPendingState.achievementCount)||0) : 0;
    const cachedModerationPending = mainMenuPendingState.uid===user.uid ? Math.max(0,Number(mainMenuPendingState.moderationCount)||0) : 0;
    // HF23.3.16.2.18 — Moderación vuelve a ser un acceso visible para toda sesión,
    // incluido Admin, para mantener la fila de seis iconos propia y consistente.
    const moderationBtnHTML = `<button class="main-menu-icon-btn main-menu-account-icon-btn" id="menu-moderation" title="Moderación" aria-label="Moderación"><span class="main-menu-icon-fallback" aria-hidden="true">🛡️</span><img class="main-menu-icon-image" src="./assets/images/ui/mod.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'">${cachedModerationPending ? `<span class="main-menu-reward-badge" data-account-pending="true">${mainMenuBadgeText(cachedModerationPending)}</span>` : ''}</button>`;
    const rewardActionsHTML = `
      <div class="main-menu-account-actions" aria-label="Accesos de cuenta">
        <button class="main-menu-icon-btn main-menu-account-icon-btn" id="menu-chest" title="Mi Cofre" aria-label="Mi Cofre"><span class="main-menu-icon-fallback" aria-hidden="true">🎁</span><img class="main-menu-icon-image" src="./assets/images/ui/cofre.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'">${chestPending ? `<span class="main-menu-reward-badge">${chestPending}</span>` : ''}</button>
        <button class="main-menu-icon-btn main-menu-account-icon-btn" id="menu-workshop" title="Mi Taller" aria-label="Mi Taller"><span class="main-menu-icon-fallback" aria-hidden="true">🛠️</span><img class="main-menu-icon-image" src="./assets/images/ui/taller.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'"></button>
        <button class="main-menu-icon-btn main-menu-account-icon-btn" id="menu-achievements" title="Mis Logros" aria-label="Mis Logros"><span class="main-menu-icon-fallback" aria-hidden="true">🏆</span><img class="main-menu-icon-image" src="./assets/images/ui/logros.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'">${cachedAchievementPending ? `<span class="main-menu-reward-badge" data-account-pending="true">${mainMenuBadgeText(cachedAchievementPending)}</span>` : ''}</button>
        <button class="main-menu-icon-btn main-menu-account-icon-btn" id="menu-public-profile" title="Mi Perfil" aria-label="Mi Perfil"><span class="main-menu-icon-fallback" aria-hidden="true">📋</span><img class="main-menu-icon-image" src="./assets/images/ui/perfil.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'"></button>
        <button class="main-menu-icon-btn main-menu-account-icon-btn" id="menu-daily-rewards" title="Recompensas diarias" aria-label="Recompensas diarias"><span class="main-menu-icon-fallback" aria-hidden="true">🔥</span><img class="main-menu-icon-image" src="./assets/images/ui/daily.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'">${rewardsPending ? `<span class="main-menu-reward-badge">${rewardsPending}</span>` : ''}</button>
        ${moderationBtnHTML}
      </div>`;
    container.innerHTML = `
      <div class="main-menu-account-info">
        <img class="main-menu-account-photo" src="${user.photoURL || ''}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="main-menu-account-name">${getLocalPlayerName()}</div>
          ${walletHTML}
          <button class="main-menu-logout-btn" id="menu-logout">${gameTextHtml('account.logout')}</button>
        </div>
      </div>
      ${rewardActionsHTML}
      ${adminBtnHTML}
    `;
    container.querySelector('#menu-chest').addEventListener('click', () => {
      if (!state.userProfile) return;
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      showChestScreen(() => {
        if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        renderAccountBox(container, state.currentUser);
      });
    });
    container.querySelector('#menu-workshop')?.addEventListener('click', () => {
      if (!state.userProfile) return;
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      showWorkshopScreen(() => {
        if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        renderAccountBox(container, state.currentUser);
      });
    });
    const openAchievementsFromMenu = () => {
      if (!state.userProfile) return;
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      showAchievementsScreen(() => {
        if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        renderAccountBox(container, state.currentUser);
      });
    };
    container.querySelector('#menu-achievements')?.addEventListener('click', openAchievementsFromMenu);
    container.querySelector('#menu-public-profile')?.addEventListener('click', () => {
      if (!state.currentUser?.uid) return;
      showPublicPlayerProfile(state.currentUser.uid);
    });
    setTimeout(() => void maybeShowAchievementUnlockNotice(openAchievementsFromMenu), 0);
    container.querySelector('#menu-daily-rewards').addEventListener('click', () => {
      if (!state.userProfile) return;
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      showDailyRewardsScreen(() => {
        if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        renderAccountBox(container, state.currentUser);
      });
    });
    container.querySelector('#menu-moderation')?.addEventListener('click', () => {
      const mainMenuOverlay = document.getElementById('main-menu-overlay');
      if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
      void showModerationCenter(() => { if (mainMenuOverlay) mainMenuOverlay.style.display = ''; });
    });
    void refreshMainMenuPendingActions(container,user);
    if (user.email === ADMIN_EMAIL) {
      container.querySelector('#menu-admin').addEventListener('click', () => {
        const mainMenuOverlay = document.getElementById('main-menu-overlay');
        if (mainMenuOverlay) mainMenuOverlay.style.display = 'none';
        showAdminPanel(() => {
          if (mainMenuOverlay) mainMenuOverlay.style.display = '';
        });
      });
    }


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
  const starterDeckPending = identityReady && !!state.currentUser && state.userProfile?.starterDeckPending === true;
  const loggedInReady = identityReady && !!state.currentUser && !!state.userProfile && !starterDeckPending;
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
  const privateTooltip = starterDeckPending
    ? gameText('menu.starterDeckRequiredTooltip')
    : authTooltip;

  // Jugar puede ser guest, pero JAMÁS mientras todavía no sabemos si existe una sesión
  // persistida. Un perfil starterDeckPending tampoco se considera listo: HF13 obliga a
  // terminar el onboarding antes de entrar a cualquier superficie dependiente de cuenta.
  setGate('menu-play', guestReady || loggedInReady, starterDeckPending ? privateTooltip : authTooltip);
  ['menu-tournament', 'menu-trade-market', 'menu-multiplayer', 'menu-encyclopedia', 'menu-mydecks', 'menu-store'].forEach(id => {
    setGate(id, loggedInReady, privateTooltip);
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
    'menu-tournament': 'menu.tournament',
    'menu-multiplayer': 'menu.multiplayer',
    'menu-mydecks': 'menu.myDecks',
    'menu-encyclopedia': 'menu.encyclopedia',
    'menu-options': 'menu.options',
    'menu-how-to-play': 'manual.menu.link'
  };
  Object.entries(labels).forEach(([id, key]) => {
    const el = menu.querySelector(`#${id}`);
    if (el) el.textContent = gameText(key);
  });
  const iconLabels = { 'menu-store':'menu.store', 'menu-ranking':'menu.ranking', 'menu-trade-market':'menu.tradeMarket' };
  Object.entries(iconLabels).forEach(([id,key])=>{
    const el=menu.querySelector(`#${id}`); if(!el)return; const label=gameText(key); el.title=label; el.setAttribute('aria-label',label);
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
  const tournament = !!state.currentTournamentMatch;
  const rivalName = getRivalName();
  const rivalPhotoURL = multiplayer
    ? (state.currentMatch.rivalPhotoURL || '')
    : (tournament ? (state.currentTournamentMatch?.opponent?.avatar || '') : TANO_AVATAR_SRC);

  if (els.rivalPlayerName) els.rivalPlayerName.textContent = rivalName;

  if (els.rivalAvatar) {
    const identityKey = multiplayer ? `mp|${rivalPhotoURL}` : (tournament ? `tournament|${rivalPhotoURL}|${rivalName}` : `solo|${TANO_AVATAR_SRC}`);
    if (els.rivalAvatar.dataset.identityKey !== identityKey) {
      els.rivalAvatar.dataset.identityKey = identityKey;
      if (rivalPhotoURL) setAvatarImageOrFallback(els.rivalAvatar, rivalPhotoURL, '🤠', tournament ? 'tano-avatar-img' : (multiplayer ? '' : 'tano-avatar-img'));
      else els.rivalAvatar.textContent = '🤠';
    }
  }
}

export function updateAccountUI(user) {
  // RC5.2g: prime the per-account acquisition tracker as soon as the authenticated
  // profile is visible to UI. This establishes the veteran baseline before the player
  // opens another pack/trade/classified, so only genuinely later acquisitions get NUEVA.
  if (user && Array.isArray(state.userProfile?.collection)) {
    loadDeckbuilderRecentState(state.userProfile.collection);
  }
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

let adminDebugScrollGesture = null;
let adminDebugScrollInteractionsInstalled = false;

function installAdminDebugScrollInteractions() {
  if (adminDebugScrollInteractionsInstalled || typeof document === 'undefined') return;
  adminDebugScrollInteractionsInstalled = true;
  const wrapFromEvent = (event) => event?.target?.closest?.('.admin-debug-table-wrap') || null;
  const hasOverflow = (wrap) => !!wrap && wrap.scrollWidth > wrap.clientWidth + 2;

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const wrap = wrapFromEvent(event);
    if (!hasOverflow(wrap)) return;
    if (event.target?.closest?.('button,a,input,select,textarea,label')) return;
    adminDebugScrollGesture = { wrap, pointerId:event.pointerId, startX:event.clientX, startScrollLeft:wrap.scrollLeft, dragging:false };
  }, true);

  document.addEventListener('pointermove', (event) => {
    const g = adminDebugScrollGesture;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.startX;
    if (!g.dragging && Math.abs(dx) < 7) return;
    if (!g.dragging) {
      g.dragging = true;
      g.wrap.classList.add('dragging');
      try { g.wrap.setPointerCapture?.(event.pointerId); } catch {}
    }
    event.preventDefault();
    g.wrap.scrollLeft = g.startScrollLeft - dx;
  }, { passive:false, capture:true });

  const finish = (event) => {
    const g = adminDebugScrollGesture;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.dragging) {
      g.wrap.dataset.suppressAdminClickUntil = String(Date.now() + 240);
      g.wrap.classList.remove('dragging');
      try { g.wrap.releasePointerCapture?.(event.pointerId); } catch {}
    }
    adminDebugScrollGesture = null;
  };
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
  document.addEventListener('click', (event) => {
    const wrap = wrapFromEvent(event);
    if (!wrap) return;
    if (Number(wrap.dataset.suppressAdminClickUntil || 0) > Date.now()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

function injectAdminPanelStyles() {
  installAdminDebugScrollInteractions();
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
    .admin-body { flex: 1; overflow-y: auto; max-width: 1600px; width: 100%; margin: 0 auto; padding-bottom: 40px; }
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
    /* HF23.3.16.2.19 — selector incremental de usuarios para Regalos/BAN. La lista visual
       queda acotada y el UID elegido vive en un input hidden, evitando <select> gigantes. */
    .admin-user-search { position:relative; width:min(360px,58vw); flex:0 0 auto; }
    .admin-user-search-input { width:100% !important; max-width:none !important; text-align:left !important; padding-right:30px; }
    .admin-user-search-input.admin-user-search-selected { border-color:#7cbf7c; box-shadow:0 0 0 1px rgba(124,191,124,.18); }
    .admin-user-search-clear { position:absolute; right:6px; top:50%; transform:translateY(-50%); width:22px; height:22px; display:none; align-items:center; justify-content:center; border:0; background:transparent; color:#bda9cd; cursor:pointer; font-size:16px; line-height:1; z-index:4; }
    .admin-user-search.has-selection .admin-user-search-clear { display:flex; }
    .admin-user-search-results { position:absolute; z-index:10020; left:0; right:0; top:calc(100% + 4px); max-height:260px; overflow:auto; background:#0b130e; border:1.5px solid rgba(176,106,212,.75); border-radius:8px; box-shadow:0 14px 34px rgba(0,0,0,.72); padding:4px; }
    .admin-user-search-results[hidden] { display:none !important; }
    .admin-user-search-result { width:100%; display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:8px 9px; border:0; border-radius:6px; background:transparent; color:#efe5f6; cursor:pointer; text-align:left; }
    .admin-user-search-result:hover, .admin-user-search-result.active { background:rgba(176,106,212,.2); }
    .admin-user-search-result strong { color:#f0e0b0; font-size:12px; }
    .admin-user-search-result span { color:#bda9cd; font-size:10px; overflow-wrap:anywhere; }
    .admin-user-search-result small { color:#8d7d99; font-size:9px; }
    .admin-user-search-result.all-users strong { color:#f0d56a; }
    .admin-user-search-empty { color:#a998b5; font-size:11px; padding:10px; text-align:left; }
    @media (max-width:700px) {
      .admin-user-search-row { flex-direction:column; align-items:stretch; gap:6px; }
      .admin-user-search-row .admin-field-label { width:100%; }
      .admin-user-search { width:100%; }
    }
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
    .admin-debug-table-wrap { overflow:auto; border:1px solid rgba(176,106,212,0.25); border-radius:10px; background:rgba(8,5,12,0.45); cursor:grab; scrollbar-gutter:stable; }
    .admin-debug-table-wrap.dragging { cursor:grabbing; user-select:none; }
    .admin-debug-table { width:100%; border-collapse:collapse; min-width:920px; font-size:12px; }
    .admin-debug-table th { position:sticky; top:0; z-index:2; background:#24162f; color:#ead9f4; text-align:left; padding:10px 9px; border-bottom:1px solid rgba(176,106,212,0.35); white-space:nowrap; }
    .admin-debug-table td { padding:9px; border-bottom:1px solid rgba(176,106,212,0.13); color:#d9cce2; vertical-align:middle; }
    .admin-debug-table.black-box-table { min-width:1120px; table-layout:auto; }
    .black-box-table th:nth-child(1), .black-box-table td:nth-child(1) { width:108px; max-width:108px; }
    .black-box-table th:nth-child(2), .black-box-table td:nth-child(2) { width:82px; max-width:105px; }
    .black-box-table th:nth-child(3), .black-box-table td:nth-child(3) { width:70px; white-space:nowrap; }
    .black-box-table th:nth-child(4), .black-box-table td:nth-child(4) { width:145px; max-width:160px; }
    .black-box-table th:nth-child(5), .black-box-table td:nth-child(5) { width:105px; }
    .black-box-table th:nth-child(6), .black-box-table td:nth-child(6) { min-width:178px; max-width:230px; }
    .black-box-table th:nth-child(7), .black-box-table td:nth-child(7) { width:78px; }
    .black-box-table th:nth-child(8), .black-box-table td:nth-child(8) { width:125px; }
    .black-box-table th:nth-child(9), .black-box-table td:nth-child(9) { width:70px; text-align:right; }
    .black-box-table th:nth-child(10), .black-box-table td:nth-child(10) { width:90px; }
    .black-box-table th:last-child { position:sticky; right:0; z-index:5; background:#24162f; box-shadow:-8px 0 12px rgba(8,5,12,.62); }
    .black-box-table td:last-child { position:sticky; right:0; z-index:3; background:#120b1a; box-shadow:-8px 0 12px rgba(8,5,12,.45); }
    .black-box-table tbody tr:hover td:last-child { background:#1b1025; }

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
    .admin-debug-result { display:inline-block; font-weight:800; white-space:nowrap; }
    .admin-debug-result.win { color:#8fd29a; }
    .admin-debug-result.loss { color:#e49388; }
    .admin-debug-reward { display:inline-block; font-weight:700; white-space:nowrap; }
    .admin-debug-reward.ok { color:#8fd29a; }
    .admin-debug-reward.penalty { color:#ff9f6e; }
    .admin-debug-reward.missing { color:#ff9f6e; }
    .admin-debug-reward.unknown { color:#8f8298; }
    .admin-debug-reward-note { color:#aa95b8; font-size:10px; margin-top:3px; white-space:nowrap; }
    .admin-debug-reward-repair { width:auto; margin:6px 0 0; padding:6px 9px; font-size:10px; border-color:#e89042; color:#ffd5a6; white-space:nowrap; }
    .admin-stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(175px,1fr)); gap:10px; margin-top:12px; }
    .admin-stat-card { border:1px solid rgba(176,106,212,.25); border-radius:10px; padding:12px; background:rgba(8,5,12,.45); }
    .admin-stat-label { color:#a997b6; font-size:11px; text-transform:uppercase; letter-spacing:.45px; }
    .admin-stat-value { color:#f1dfb4; font-size:24px; font-weight:800; margin-top:4px; }
    .admin-stat-sub { color:#8f8298; font-size:10px; margin-top:3px; }
    .admin-dashboard-group { margin-top:18px; }
    .admin-dashboard-group:first-child { margin-top:12px; }
    .admin-dashboard-group-title {
      color:#d9c0e8; font-size:12px; font-weight:900; letter-spacing:.065em; text-transform:uppercase;
      padding-bottom:6px; border-bottom:1px solid rgba(176,106,212,.22);
    }
    .admin-chart-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:18px; }
    .admin-chart-card { border:1px solid rgba(176,106,212,.24); border-radius:10px; padding:12px; background:rgba(8,5,12,.38); }
    .admin-chart-title { color:#f1dfb4; font-size:12px; font-weight:850; margin-bottom:10px; }
    .admin-chart-row { display:grid; grid-template-columns:minmax(90px,1fr) minmax(90px,2fr) auto; gap:8px; align-items:center; margin:7px 0; }
    .admin-chart-label { color:#b9a7c5; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .admin-chart-track { height:9px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.06); }
    .admin-chart-fill { height:100%; min-width:0; border-radius:999px; background:linear-gradient(90deg,rgba(176,106,212,.7),rgba(212,175,55,.72)); }
    .admin-chart-value { color:#e5d4ec; font-size:10px; font-weight:800; min-width:30px; text-align:right; }
    .admin-chart-empty { color:#7f7288; font-size:10px; font-style:italic; padding:8px 0 2px; }
    .admin-stats-export-note { color:#8f8298; font-size:9px; margin-top:5px; }
    .admin-debug-download { width:auto; margin:0; padding:7px 10px; font-size:12px; white-space:nowrap; }
    .admin-debug-empty { padding:30px; color:#a995b8; text-align:center; font-style:italic; }
    .admin-debug-error { padding:18px; color:#e07a6b; text-align:center; }
    .admin-animation-speed-grid { display:grid; grid-template-columns:repeat(3,minmax(150px,1fr)); gap:12px; margin:10px 0; }
    .admin-animation-speed-grid label { display:flex; flex-direction:column; gap:6px; color:#d8c4e8; font-size:12px; font-weight:700; }
    .admin-animation-speed-grid input { width:100%; background:rgba(255,255,255,.06); border:1.5px solid rgba(176,106,212,.4); border-radius:7px; color:#f0e0b0; font-size:14px; font-weight:800; padding:8px 10px; }
    .admin-animation-reference-help { color:#9e8aac; font-size:11px; line-height:1.5; margin:8px 0 12px; }
    .admin-animation-tuning-wrap { overflow:auto; border:1px solid rgba(176,106,212,.28); border-radius:10px; margin:12px 0; background:rgba(8,5,12,.28); }
    .admin-animation-tuning-table { width:100%; min-width:980px; border-collapse:collapse; font-size:12px; }
    .admin-animation-tuning-table th,.admin-animation-tuning-table td { padding:9px 10px; border-bottom:1px solid rgba(176,106,212,.16); text-align:left; }
    .admin-animation-tuning-table thead th { color:#e5d2ef; background:#1b1123; font-weight:800; }
    .admin-animation-tuning-table thead tr:nth-child(2) th { text-align:center; color:#c9b2d8; font-size:11px; }
    .admin-animation-tuning-table tbody tr:last-child td { border-bottom:none; }
    .admin-animation-tuning-table tbody tr:hover { background:rgba(176,106,212,.06); }
    .admin-animation-tuning-table td:nth-child(5),.admin-animation-tuning-table td:nth-child(6) { text-align:center; width:90px; }
    .admin-animation-tuning-speed { width:110px; background:rgba(255,255,255,.06); border:1.5px solid rgba(176,106,212,.4); border-radius:7px; color:#f0e0b0; font-size:13px; font-weight:800; padding:7px 9px; }
    .admin-animation-sfx-check { width:18px; height:18px; accent-color:#d4af37; cursor:pointer; }
    .admin-animation-name { color:#f1dfb4; font-weight:800; white-space:nowrap; }
    .admin-animation-audio { min-width:145px; color:#cbb8d8; }
    .admin-animation-audio code { display:block; width:max-content; max-width:210px; margin:2px 0; padding:2px 5px; border-radius:5px; background:rgba(255,255,255,.05); color:#e8d9ef; font-size:10.5px; white-space:nowrap; }
    .admin-animation-audio-empty { color:#74677d; font-style:italic; }
    .admin-animation-studio-section { padding-left:16px; padding-right:16px; }
    @media(max-width:900px){.admin-animation-speed-grid{grid-template-columns:1fr}.admin-animation-studio-section{padding-left:8px;padding-right:8px}}
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
    { section: 'Avisos Clasificados', id: 'classifiedsCommonPoints', label: 'Common · puntos', value: CLASSIFIEDS_COMMON_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsCommonFichas', label: 'Common · Fichas', value: CLASSIFIEDS_COMMON_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsUncommonPoints', label: 'Uncommon · puntos', value: CLASSIFIEDS_UNCOMMON_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsUncommonFichas', label: 'Uncommon · Fichas', value: CLASSIFIEDS_UNCOMMON_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsRarePoints', label: 'Rare · puntos', value: CLASSIFIEDS_RARE_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsRareFichas', label: 'Rare · Fichas', value: CLASSIFIEDS_RARE_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsMythicPoints', label: 'Mythic · puntos', value: CLASSIFIEDS_MYTHIC_POINTS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsMythicFichas', label: 'Mythic · Fichas', value: CLASSIFIEDS_MYTHIC_FICHAS, step: '1' },
    { section: 'Avisos Clasificados', id: 'classifiedsMythicChancePercent', label: 'Chance Mythic en slot premium (%)', value: +(CLASSIFIEDS_MYTHIC_CHANCE * 100).toFixed(2), step: '0.1' },
    { section: 'AVISOS CLASIFICADOS · PACKS DE TIERRAS BÁSICAS', id: 'classifiedBasicLandPackPrice', label: 'Costo de cada pack por color · puntos', value: CLASSIFIEDS_BASIC_LAND_PACK_PRICE, step: '1' },
    { section: 'AVISOS CLASIFICADOS · PACKS DE TIERRAS BÁSICAS', id: 'classifiedBasicLandPackQuantity', label: 'Tierras entregadas por pack · 1–100', value: CLASSIFIEDS_BASIC_LAND_PACK_QUANTITY, step: '1' },
    { section: 'Mazos', id: 'deckSizeExact', label: 'Cartas exactas por mazo', value: DECK_SIZE_EXACT, step: '1' },
    { section: 'Mazos', id: 'maxCopiesPerCard', label: 'Máximo de copias iguales por mazo', value: MAX_COPIES_PER_CARD, step: '1' },
    { section: 'Mazos', id: 'maxSavedDecks', label: 'Máximo de mazos guardados por cuenta', value: MAX_SAVED_DECKS, step: '1' },
    { section: 'Mazos Prearmados', id: 'prebuiltDeckPoints', label: 'Costo global · puntos', value: PREBUILT_DECK_POINTS, step: '1' },
    { section: 'Mazos Prearmados', id: 'prebuiltDeckFichas', label: 'Costo global · Fichas', value: PREBUILT_DECK_FICHAS, step: '1' },
    { section: 'MERCADO DE PASES · LÍMITES', id: 'tradeMaxActiveListings', label: 'Máximo de publicaciones activas por jugador · 1–10', value: TRADE_MAX_ACTIVE_LISTINGS, step: '1' },
    { section: 'MERCADO DE PASES · LÍMITES', id: 'tradeMaxWantedCriteria', label: 'Máximo de criterios BUSCO por publicación · 1–3', value: TRADE_MAX_WANTED_CRITERIA, step: '1' },
    { section: 'MERCADO DE PASES · LÍMITES', id: 'tradeMaxOffersPerListing', label: 'Máximo de ofertas activas por publicación · 1–50', value: TRADE_MAX_OFFERS_PER_LISTING, step: '1' },
    { section: 'MERCADO DE PASES · LÍMITES', id: 'tradeMaxOutgoingOffers', label: 'Máximo de ofertas salientes activas por jugador · 1–20', value: TRADE_MAX_OUTGOING_OFFERS, step: '1' },
    { section: 'MERCADO DE PASES · LÍMITES', id: 'tradeMaxCompletedPerWeek', label: 'Máximo de intercambios completados por jugador/semana · 1–20', value: TRADE_MAX_COMPLETED_PER_WEEK, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentRewardedStartsPerDay', label: 'Torneos premiados máximos por día · 0 = ilimitado', value: TOURNAMENT_POLICY.tournamentRewardedStartsPerDay, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentNpcRandomnessPercent', label: 'Randomness de simulación NPC (%)', value: TOURNAMENT_POLICY.tournamentNpcRandomnessPercent, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentRound16Points', label: 'Octavos · puntos', value: TOURNAMENT_POLICY.tournamentRound16Points, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentRound16LossPoints', label: 'Octavos · puntos por derrota', value: TOURNAMENT_POLICY.tournamentRound16LossPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentRound16Packs', label: 'Octavos · sobres', value: TOURNAMENT_POLICY.tournamentRound16Packs, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentQuarterPoints', label: 'Cuartos · puntos', value: TOURNAMENT_POLICY.tournamentQuarterPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentQuarterLossPoints', label: 'Cuartos · puntos por derrota', value: TOURNAMENT_POLICY.tournamentQuarterLossPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentQuarterPacks', label: 'Cuartos · sobres', value: TOURNAMENT_POLICY.tournamentQuarterPacks, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentSemiPoints', label: 'Semifinal · puntos', value: TOURNAMENT_POLICY.tournamentSemiPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentSemiLossPoints', label: 'Semifinal · puntos por derrota', value: TOURNAMENT_POLICY.tournamentSemiLossPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentSemiPacks', label: 'Semifinal · sobres', value: TOURNAMENT_POLICY.tournamentSemiPacks, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentFinalPoints', label: 'Final · puntos', value: TOURNAMENT_POLICY.tournamentFinalPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentFinalLossPoints', label: 'Final · puntos por derrota', value: TOURNAMENT_POLICY.tournamentFinalLossPoints, step: '1' },
    { section: 'TORNEO · PREMIOS Y LÍMITES', id: 'tournamentFinalPacks', label: 'Final · sobres', value: TOURNAMENT_POLICY.tournamentFinalPacks, step: '1' }
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

  const tournamentDifficultyHTML = `
    <div class="admin-section">
      <div class="admin-section-title">TORNEO · DIFICULTAD Y MAZOS</div>
      ${[['Round16','Octavos'],['Quarter','Cuartos'],['Semi','Semifinal'],['Final','Final']].map(([suffix,label]) => `
        <div class="admin-field-row"><span class="admin-field-label">${label} · dificultad IA</span><select class="admin-field-input" id="cfg-tournament${suffix}Difficulty"><option value="easy">Fácil</option><option value="medium">Medio</option><option value="hard">Difícil</option></select></div>
        <div class="admin-field-row"><span class="admin-field-label">${label} · calidad de mazo</span><select class="admin-field-input" id="cfg-tournament${suffix}DeckQuality"><option value="good">Good</option><option value="strong">Strong</option><option value="elite">Elite</option></select></div>
      `).join('')}
    </div>`;

  const admissionAdminHTML = `
    <div class="admin-section" id="admin-admission-section">
      <div class="admin-section-title">CONTROL DE ALTAS · Cost Safety</div>
      <div class="admin-debug-summary" style="margin-bottom:12px;line-height:1.5;">Limita solamente <b>cuentas nuevas de Argentinia</b>. Los usuarios ya registrados siguen entrando aunque el registro esté pausado.</div>
      <div class="admin-field-row">
        <span class="admin-field-label">Estado del registro</span>
        <select class="admin-field-input" id="cfg-registrationMode">
          <option value="open">🟢 ABIERTO · sin límites</option>
          <option value="limited">🟡 LIMITADO · aplicar cupos</option>
          <option value="paused">🔴 PAUSADO · sin nuevas altas</option>
        </select>
      </div>
      <div class="admin-field-row"><span class="admin-field-label">Máximo de usuarios registrados · 0 = ilimitado</span><input type="number" class="admin-field-input" id="cfg-maxRegisteredUsers" min="0" step="1" value="0"></div>
      <div class="admin-field-row"><span class="admin-field-label">Máximo de altas por día ART · 0 = ilimitado</span><input type="number" class="admin-field-input" id="cfg-maxRegistrationsPerDay" min="0" step="1" value="0"></div>
      <div class="admin-debug-summary" id="admin-admission-status">Cargando estado autoritativo…</div>
      <button class="admin-save-btn" id="admin-admission-save">🛡️ Aplicar control de altas</button>
      <div class="store-error-msg" id="admin-admission-error" style="text-align:center;"></div>
      <div class="admin-success-msg" id="admin-admission-success"></div>
    </div>`;

  const initialAnimationPolicy = getServerAnimationPolicy();
  const initialAnimationRefs = initialAnimationPolicy.speedMultipliers || { slow:1.35, normal:1, fast:0.68 };
  const animationTuningCatalog = getAnimationTuningCatalog();
  const initialAnimationTunings = normalizeAnimationTunings(initialAnimationPolicy.animationTunings || {});
  const animationTuningRowsHTML = animationTuningCatalog.map(def => {
    const tuning = initialAnimationTunings[def.key] || { relativeSpeed:1, relativeVolume:1, sfxMoment:def.defaultSfxMoment || 'start', sfxCadence:def.sfxCadence || 'single' };
    const cadence=(tuning.sfxCadence || def.sfxCadence);
    const cadenceLabel=cadence==='per_impact' ? 'Por impacto' : cadence==='per_batch' ? '1 vez por lote' : '1 vez';
    const audioTargets=Array.isArray(def.audioTargets) ? def.audioTargets : [];
    const opusHTML=audioTargets.length
      ? audioTargets.map(target => `<code>${escapeHtml(target.opus || '—')}</code>`).join('')
      : '<span class="admin-animation-audio-empty">—</span>';
    const mp3HTML=audioTargets.length
      ? audioTargets.map(target => `<code>${escapeHtml(target.mp3 || '—')}</code>`).join('')
      : '<span class="admin-animation-audio-empty">—</span>';
    const animationLabel=def.labelGameTextKey ? gameText(def.labelGameTextKey) : def.label;
    return `<tr data-animation-tuning-row="${def.key}">
      <td class="admin-animation-name">${escapeHtml(animationLabel)}</td>
      <td class="admin-animation-audio" data-animation-audio-opus="${def.key}">${opusHTML}</td>
      <td class="admin-animation-audio" data-animation-audio-mp3="${def.key}">${mp3HTML}</td>
      <td><input type="number" class="admin-animation-tuning-speed" data-animation-tuning-speed="${def.key}" value="${Number(tuning.relativeSpeed || 1).toFixed(2)}" min="0.25" max="3" step="0.05"></td>
      <td><input type="number" class="admin-animation-tuning-volume" data-animation-tuning-volume="${def.key}" value="${Number(tuning.relativeVolume || 1).toFixed(2)}" min="0.25" max="2" step="0.05"></td>
      <td><input type="checkbox" class="admin-animation-sfx-check" data-animation-sfx-moment="${def.key}" data-moment="start" ${tuning.sfxMoment === 'start' ? 'checked' : ''} aria-label="SFX al inicio para ${escapeHtml(animationLabel)}"></td>
      <td><input type="checkbox" class="admin-animation-sfx-check" data-animation-sfx-moment="${def.key}" data-moment="key" ${tuning.sfxMoment === 'key' ? 'checked' : ''} aria-label="SFX en el momento clave para ${escapeHtml(animationLabel)}"></td>
      <td class="admin-animation-cadence">${cadenceLabel}</td>
    </tr>`;
  }).join('');
  const animationAdminHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Política global y velocidades de referencia</div>
      <div class="admin-field-row">
        <span class="admin-field-label">Habilitadas globalmente</span>
        <label style="display:flex;align-items:center;gap:8px;color:#dcc8e7;font-size:12px;">
          <input type="checkbox" id="cfg-animations-enabled" ${initialAnimationPolicy.enabled ? 'checked' : ''}>
          <span>Kill switch remoto</span>
        </label>
      </div>
      <div style="color:#9e8aac;font-size:11px;line-height:1.5;margin:6px 0 14px;">OFF apaga la capa visual para todos los clientes conectados sin tocar reglas, state ni resultados. Cada jugador conserva además su propio OFF local.</div>
      <div class="admin-animation-speed-grid">
        <label><span>Lenta · multiplicador</span><input type="number" id="cfg-animation-speed-slow" value="${Number(initialAnimationRefs.slow || 1.35).toFixed(2)}" min="0.25" max="3" step="0.05"></label>
        <label><span>Normal · multiplicador</span><input type="number" id="cfg-animation-speed-normal" value="${Number(initialAnimationRefs.normal || 1).toFixed(2)}" min="0.25" max="3" step="0.05"></label>
        <label><span>Rápida · multiplicador</span><input type="number" id="cfg-animation-speed-fast" value="${Number(initialAnimationRefs.fast || 0.68).toFixed(2)}" min="0.25" max="3" step="0.05"></label>
      </div>
      <div class="admin-animation-reference-help">Estos tres valores son la referencia central que usa <b>Velocidad de animaciones</b> en Opciones. 1.00 = duración base; 1.35 = 35% más lenta; 0.68 = 32% más rápida. Rango seguro: 0.25–3.00.</div>
      <div class="admin-section-title" style="margin-top:18px;">Ajuste por animación</div>
      <div class="admin-animation-reference-help"><b>Velocidad relativa</b> multiplica la velocidad de esa animación sobre la referencia global elegida por el usuario. Ejemplo: <b>0.75</b> = 75% de velocidad, por lo tanto esa animación dura ≈33% más. <b>1.00</b> no altera la referencia global. En SFX, <b>Inicio</b> y <b>Momento clave</b> son excluyentes. La <b>Cadencia</b> es canónica: las escenas de combate disparan un SFX por cada impacto real; las fichas usan <b>1 vez por lote</b>; Tierra y transiciones simples lo hacen una sola vez. <b>Volumen relativo</b> multiplica el volumen SFX definido en OPCIONES para esa animación (1.00 = igual, 1.20 = +20%, sujeto al techo seguro del navegador). Las columnas <b>OPUS</b> y <b>fallback MP3</b> son informativas y salen del mismo catálogo de audio que usa el runtime; cuando una escena puede disparar más de un SFX (por ejemplo Arrollar), se muestran todos.</div>
      <div class="admin-animation-tuning-wrap">
        <table class="admin-animation-tuning-table">
          <thead>
            <tr><th rowspan="2">Animación</th><th rowspan="2">OPUS</th><th rowspan="2">fallback MP3</th><th rowspan="2">Velocidad relativa</th><th rowspan="2">Volumen relativo</th><th colspan="2" style="text-align:center;">Ejecución del SFX</th><th rowspan="2">Cadencia</th></tr>
            <tr><th>Inicio</th><th>Momento clave</th></tr>
          </thead>
          <tbody>${animationTuningRowsHTML}</tbody>
        </table>
      </div>
      <button class="admin-save-btn" id="admin-animation-policy-save">🎬 Guardar política, velocidades y animaciones</button>
      <div class="store-error-msg" id="admin-animation-error" style="text-align:center;"></div>
      <div class="admin-success-msg" id="admin-animation-success"></div>
    </div>
    <div class="admin-section admin-animation-studio-section">
      <div class="admin-section-title">Animation Test Lab · dummy del tablero real</div>
      <div class="admin-debug-summary" style="margin-bottom:12px;">Playtest aislado con fondo, proporciones, zonas de combate/tierras/manos y badges equivalentes al tablero. Elegí la velocidad dentro del propio lab: no cambia tu preferencia de Opciones.</div>
      <div id="admin-animation-lab-root"></div>
    </div>
  `;

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
      <div class="admin-section-title">${gameTextHtml('admin.gifts.title')}</div>
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
          <option value="guaranteedMythics">${gameTextHtml('admin.gifts.guaranteedMythic')}</option>
          <option value="essence">${gameTextHtml('admin.gifts.essenceFuture')}</option>
        </select>
      </div>
      <div class="admin-field-row admin-user-search-row">
        <span class="admin-field-label">Para</span>
        <div class="admin-user-search" id="grant-recipient-search-wrap">
          <input type="text" class="admin-field-input admin-user-search-input" id="grant-recipient-search" placeholder="Buscar username, email o UID…" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="grant-recipient-results">
          <button type="button" class="admin-user-search-clear" id="grant-recipient-clear" title="Limpiar destinatario" aria-label="Limpiar destinatario">×</button>
          <input type="hidden" id="grant-recipient" value="">
          <div class="admin-user-search-results" id="grant-recipient-results" role="listbox" hidden></div>
        </div>
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


  const communityAdminHTML = `
    <div class="admin-section" id="admin-community-section">
      <div class="admin-section-title">MODERACIÓN · Política y casos</div>
      <div class="admin-debug-summary" id="admin-community-summary">Entrá a esta solapa para cargar la autoridad de Moderación.</div>
      <div class="admin-field-row" style="align-items:flex-start;">
        <span class="admin-field-label">Palabras prohibidas adicionales</span>
        <textarea class="admin-field-input" id="admin-community-words" rows="5" placeholder="Una por línea o separadas por coma" style="text-align:left;min-width:260px;resize:vertical;"></textarea>
      </div>
      <button class="admin-save-btn" id="admin-community-words-save">🛡️ Guardar lista prohibida</button>
      <div class="admin-success-msg" id="admin-community-words-status"></div>
    </div>
    <div class="admin-section" id="admin-community-bots-section">
      <div class="admin-section-title">POBLACIÓN AMBIENTAL · 5 jugadores del sistema</div>
      <div class="admin-debug-summary" style="margin-bottom:10px;">Internamente quedan aislados como cuentas del sistema. Para jugadores reales se muestran como perfiles normales: sin etiqueta, sin acceso a partidas reales y sin afectar ELO/estadísticas humanas. Los desafíos siempre terminan rechazados después de una demora variable.</div>
      <div class="admin-field-row"><span class="admin-field-label">Estado</span><button class="options-toggle-btn" id="admin-community-bots-enabled" type="button">APAGADOS</button></div>
      <div class="admin-field-row"><span class="admin-field-label">Nombres</span><div style="display:grid;grid-template-columns:1fr;gap:6px;min-width:280px;">${[0,1,2,3,4].map(i=>`<input class="admin-field-input" id="admin-community-bot-name-${i}" maxlength="40" style="text-align:left;width:100%;" placeholder="Jugador ${i+1}">`).join('')}</div></div>
      <div class="admin-field-row"><span class="admin-field-label">Máx. visibles online</span><input type="number" min="0" max="5" class="admin-field-input" id="admin-community-bots-online-max" value="2"></div>
      <div class="admin-field-row"><span class="admin-field-label">Ventana horaria Argentina</span><div style="display:flex;gap:8px;align-items:center;"><input type="time" class="admin-field-input" id="admin-community-bots-start" value="06:00"><span>→</span><input type="time" class="admin-field-input" id="admin-community-bots-end" value="23:30"></div></div>
      <div class="admin-field-row"><span class="admin-field-label">Cambio de presencia</span><select class="admin-field-input" id="admin-community-bots-presence-slot"><option value="10">cada 10 min</option><option value="20" selected>cada 20 min</option><option value="30">cada 30 min</option><option value="60">cada 60 min</option></select></div>
      <div class="admin-field-row"><span class="admin-field-label">Prob. online por franja</span><input type="number" min="0" max="100" class="admin-field-input" id="admin-community-bots-online-pct" value="58"><span>%</span></div>
      <div class="admin-field-row"><span class="admin-field-label">Actividad simulada</span><select class="admin-field-input" id="admin-community-bots-activity-min"><option value="10">cada 10 min</option><option value="20" selected>cada 20 min</option><option value="30">cada 30 min</option><option value="60">cada 60 min</option></select></div>
      <div class="admin-field-row"><span class="admin-field-label">Partidas bot-vs-bot por ciclo</span><input type="number" min="0" max="3" class="admin-field-input" id="admin-community-bots-games" value="1"></div>
      <div class="admin-field-row"><span class="admin-field-label">Publicaciones máx. por jugador</span><input type="number" min="0" max="5" class="admin-field-input" id="admin-community-bots-listings" value="2"></div>
      <div class="admin-field-row"><span class="admin-field-label">Renovar publicaciones</span><div style="display:flex;gap:8px;align-items:center;"><input type="number" min="15" max="1440" class="admin-field-input" id="admin-community-bots-listing-life-min" value="90"><span>a</span><input type="number" min="15" max="2880" class="admin-field-input" id="admin-community-bots-listing-life-max" value="360"><span>min.</span></div></div>
      <div class="admin-debug-summary" style="margin:-2px 0 8px;">Cada publicación recibe una vida útil distinta dentro de ese rango. Sólo se renueva si no tiene ofertas pendientes.</div>
      <div class="admin-field-row"><span class="admin-field-label">Aceptar intercambio misma rareza</span><input type="number" min="0" max="100" class="admin-field-input" id="admin-community-bots-accept-equal" value="35"><span>%</span></div>
      <div class="admin-field-row"><span class="admin-field-label">Aceptar rareza superior</span><input type="number" min="0" max="100" class="admin-field-input" id="admin-community-bots-accept-higher" value="70"><span>%</span></div>
      <div class="admin-field-row"><span class="admin-field-label">Rechazar oferta elegible</span><input type="number" min="0" max="100" class="admin-field-input" id="admin-community-bots-reject-eligible" value="25"><span>%</span></div>
      <div class="admin-field-row"><span class="admin-field-label">Demora rechazo desafío</span><div style="display:flex;gap:8px;align-items:center;"><input type="number" min="3" max="15" class="admin-field-input" id="admin-community-bots-reject-min" value="5"><span>a</span><input type="number" min="5" max="20" class="admin-field-input" id="admin-community-bots-reject-max" value="13"><span>seg.</span></div></div>
      <button class="admin-save-btn" id="admin-community-bots-save">👥 Guardar población ambiental</button>
      <div class="admin-success-msg" id="admin-community-bots-status"></div>
    </div>
    <div class="admin-section">
      <div class="admin-section-title">BANS · UID como autoridad</div>
      <div class="admin-debug-summary" style="margin-bottom:10px;">El email y username se guardan sólo como snapshot de auditoría. Un ban activo bloquea chat, desafíos y creación/aceptación de operaciones de Mercado; siempre conserva contacto con Moderación.</div>
      <div class="admin-field-row admin-user-search-row"><span class="admin-field-label">Jugador</span><div class="admin-user-search" id="admin-community-ban-user-search-wrap"><input type="text" class="admin-field-input admin-user-search-input" id="admin-community-ban-user-search" placeholder="Buscar username, email o UID…" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="admin-community-ban-user-results"><button type="button" class="admin-user-search-clear" id="admin-community-ban-user-clear" title="Limpiar jugador" aria-label="Limpiar jugador">×</button><input type="hidden" id="admin-community-ban-user" value=""><div class="admin-user-search-results" id="admin-community-ban-user-results" role="listbox" hidden></div></div></div>
      <div class="admin-field-row"><span class="admin-field-label">Duración</span><select class="admin-field-input" id="admin-community-ban-duration"><option value="1h">1 hora</option><option value="24h">24 horas</option><option value="7d">7 días</option><option value="30d">30 días</option><option value="permanent">Permanente</option></select></div>
      <div class="admin-field-row"><span class="admin-field-label">Motivo</span><input class="admin-field-input" id="admin-community-ban-reason" maxlength="300" placeholder="Motivo obligatorio" style="text-align:left;min-width:260px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="admin-save-btn" id="admin-community-ban-apply">⛔ Aplicar ban</button></div>
      <div class="admin-success-msg" id="admin-community-ban-status"></div>
      <div class="admin-debug-summary" style="margin-top:10px;">Para levantar una restricción, usá <b>Quitar ban</b> en la fila exacta del ban activo.</div>
      <div class="admin-debug-table-wrap" id="admin-community-bans" style="margin-top:12px;"><div class="admin-debug-empty">Sin cargar.</div></div>
    </div>
    <div class="admin-section">
      <div class="admin-section-title">CASOS · Reportes y mensajes a Moderación</div>
      <div class="admin-debug-toolbar"><div class="admin-debug-summary">Casos abiertos primero; la respuesta queda visible para quien reportó.</div><button class="admin-save-btn" id="admin-community-refresh">🔄 Actualizar</button></div>
      <div class="admin-debug-table-wrap" id="admin-community-cases" style="margin-top:10px;"><div class="admin-debug-empty">Sin cargar.</div></div>
      <div id="admin-community-case-editor" class="hidden" style="margin-top:12px;padding:10px;border:1px solid rgba(212,175,55,.25);border-radius:8px;">
        <div class="admin-debug-summary" id="admin-community-case-selected"></div>
        <textarea class="admin-field-input" id="admin-community-case-response" rows="4" maxlength="1000" placeholder="Respuesta / resolución para el usuario" style="width:100%;text-align:left;resize:vertical;margin:8px 0;"></textarea>
        <button class="admin-save-btn" id="admin-community-case-resolve">✓ Resolver y responder</button>
      </div>
      <div class="admin-success-msg" id="admin-community-case-status"></div>
    </div>`;


  const workshopAdminHTML = `
    <div class="admin-pane-narrow" style="max-width:1250px;">
      <div class="admin-section">
        <div class="admin-section-title">${gameTextHtml('admin.workshop.title')}</div>
        <div class="admin-debug-summary">${gameTextHtml('admin.workshop.help')}</div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.enabled')}</span><input type="checkbox" id="admin-workshop-enabled"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.enhancementCost')}</span><input type="number" min="1" step="1" class="admin-field-input" id="admin-workshop-craft-fichas"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.maxEnhanced')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-max-enhanced"></div>
        <div class="admin-section-title" style="margin-top:14px;font-size:14px;">${gameTextHtml('admin.workshop.essenceTitle')}</div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.essenceEnabled')}</span><input type="checkbox" id="admin-workshop-essence-enabled"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.essencePoints')}</span><input type="number" min="1" step="1" class="admin-field-input" id="admin-workshop-essence-points"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.essenceFichas')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-essence-fichas"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.essenceMax')}</span><input type="number" min="1" max="100" step="1" class="admin-field-input" id="admin-workshop-essence-max"></div>
        <div class="admin-section-title" style="margin-top:14px;font-size:14px;">${gameTextHtml('admin.workshop.evolutionTitle')}</div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.evolutionEnabled')}</span><input type="checkbox" id="admin-workshop-evolution-enabled"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.maxEvolved')}</span><input type="number" min="0" max="20" step="1" class="admin-field-input" id="admin-workshop-max-evolved"></div>
        <div class="admin-workshop-machine-settings">
          ${[1,2].map(stage=>`<div class="admin-workshop-setting-card"><div class="admin-workshop-setting-title">${gameTextHtml('admin.workshop.evolutionStage',{stage})}</div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.evolutionPoints')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-evo${stage}-points"></div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.evolutionFichas')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-evo${stage}-fichas"></div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.evolutionEssence')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-evo${stage}-essence"></div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.evolutionCopies')}</span><input type="number" min="1" max="20" step="1" class="admin-field-input" id="admin-workshop-evo${stage}-copies"></div></div>`).join('')}
        </div>
        <div class="admin-section-title" style="margin-top:14px;font-size:14px;">${gameTextHtml('admin.workshop.mixerTitle')}</div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.mixerEnabled')}</span><input type="checkbox" id="admin-workshop-mixer-enabled"></div>
        <div class="admin-workshop-machine-settings">
          ${[['Common','Uncommon','common'],['Uncommon','Rare','uncommon'],['Rare','Mythic','rare']].map(([from,to,key])=>`<div class="admin-workshop-setting-card"><div class="admin-workshop-setting-title">${gameTextHtml('admin.workshop.mixerTier',{from,to})}</div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.mixerPoints')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-mixer-${key}-points"></div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.mixerFichas')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-mixer-${key}-fichas"></div>
            <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.mixerEssence')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-mixer-${key}-essence"></div></div>`).join('')}
        </div>
        <div class="admin-workshop-machine-settings" id="admin-workshop-machine-settings"></div>
        <button class="admin-save-btn" id="admin-workshop-save-settings">${gameTextHtml('admin.workshop.saveSettings')}</button>
        <div class="admin-success-msg" id="admin-workshop-settings-status"></div>
      </div>
      <div class="admin-section">
        <div class="admin-section-title">${gameTextHtml('admin.workshop.layoutTitle')}</div>
        <div class="admin-debug-summary" style="margin-bottom:10px;">${gameTextHtml('admin.workshop.layoutHelp')}</div>
        <div class="admin-workshop-preview-controls" id="admin-workshop-preview-controls"></div>
        <div class="admin-workshop-canvas-wrap"><div class="admin-workshop-canvas" id="admin-workshop-canvas"><img id="admin-workshop-bg" class="admin-workshop-bg" src="./assets/images/ui/menu_taller.png" alt=""><div id="admin-workshop-machines"></div></div></div>
        <div class="admin-debug-summary" id="admin-workshop-editor-status" style="margin-top:10px;"></div>
        <button class="admin-save-btn" id="admin-workshop-save-layout">${gameTextHtml('admin.workshop.saveLayout')}</button>
        <div class="admin-success-msg" id="admin-workshop-layout-status"></div>
      </div>
    </div>`;


  const achievementsAdminHTML = `
    <div class="admin-pane-narrow" style="max-width:1250px;">
      <div class="admin-section">
        <div class="admin-section-title">${gameTextHtml('admin.achievements.title')}</div>
        <div class="admin-debug-summary" style="margin-bottom:12px;">${gameTextHtml('admin.achievements.help')}</div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.achievements.enabled')}</span><input type="checkbox" id="admin-achievements-enabled"></div>
        <div class="admin-debug-table-wrap" id="admin-achievements-table"><div class="admin-debug-empty">${gameTextHtml('achievements.loading')}</div></div>
        <button class="admin-save-btn" id="admin-achievements-save">${gameTextHtml('admin.achievements.save')}</button>
        <div class="admin-success-msg" id="admin-achievements-status"></div>
      </div>
    </div>`;


  const adminTabs = [
    { key: 'game', label: 'AJUSTES DEL JUEGO' },
    { key: 'workshop', label: gameText('admin.tab.workshop') },
    { key: 'achievements', label: gameText('admin.tab.achievements') },
    { key: 'animations', label: 'ANIMACIONES' },
    { key: 'emotes', label: 'EMOTES' },
    { key: 'texts', label: 'TEXTOS DEL JUEGO' },
    { key: 'messages', label: 'MODERACIÓN Y USUARIOS' },
    { key: 'campaigns', label: gameText('admin.tab.campaigns') },
    { key: 'stats', label: gameText('admin.tab.statistics') },
    { key: 'economyAudit', label: gameText('admin.tab.economyAudit') },
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
          ${tournamentDifficultyHTML}
          ${placeholdersHTML}
          <button class="admin-save-btn" id="admin-save">💾 Guardar cambios</button>
          <div class="store-error-msg" id="admin-error" style="text-align:center;"></div>
          <div class="admin-success-msg" id="admin-success"></div>
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="workshop">
        ${workshopAdminHTML}
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="achievements">
        ${achievementsAdminHTML}
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="animations">
        ${animationAdminHTML}
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="emotes">
        <div id="admin-emotes-root"></div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="texts">
        <div id="admin-game-texts-root"></div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="messages">
        <div class="admin-pane-narrow">
          ${communityAdminHTML}
          ${admissionAdminHTML}
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
              <button class="admin-save-btn" id="admin-stats-export">${gameTextHtml('admin.stats.export')}</button>
              <button class="admin-save-btn" id="admin-stats-refresh">${gameTextHtml('admin.stats.refresh')}</button>
            </div>
          </div>
          <div id="admin-stats-cards"></div>
          <div id="admin-stats-charts" class="admin-chart-grid"></div>
          <div class="admin-debug-table-wrap" id="admin-stats-detail" style="margin-top:18px;"></div>
          <div class="admin-debug-summary" style="margin-top:10px;">${gameTextHtml('admin.stats.methodNote')}</div>
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="economyAudit">
        <div class="admin-section">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
            <button class="admin-save-btn active" data-economy-subtab="audit">${gameTextHtml('admin.movements.tab.audit')}</button>
            <button class="admin-save-btn" data-economy-subtab="movements">${gameTextHtml('admin.movements.tab.movements')}</button>
          </div>
          <div data-economy-subpane="audit">
            <div class="admin-debug-toolbar">
              <div>
                <div class="admin-section-title">${gameTextHtml('admin.audit.title')}</div>
                <div class="admin-debug-summary" id="admin-economy-audit-summary">${gameTextHtml('admin.audit.initial')}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                <button class="admin-save-btn" id="admin-economy-audit-export" disabled>${gameTextHtml('admin.audit.export')}</button>
                <button class="admin-save-btn" id="admin-economy-audit-refresh">${gameTextHtml('admin.audit.refresh')}</button>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px;">
              <select class="admin-field-input" id="admin-economy-audit-kind" style="max-width:220px;text-align:left;">
                <option value="all">${gameTextHtml('admin.audit.filterAll')}</option>
                <option value="economyEvent">${gameTextHtml('admin.audit.filterEconomy')}</option>
                <option value="adminAction">${gameTextHtml('admin.audit.filterAdmin')}</option>
              </select>
              <input class="admin-field-input" id="admin-economy-audit-search" type="search" placeholder="${gameTextHtml('admin.audit.searchPlaceholder')}" style="min-width:260px;flex:1;text-align:left;">
            </div>
            <div id="admin-economy-audit-cards" class="admin-stats-grid"></div>
            <div class="admin-debug-table-wrap" id="admin-economy-audit-table" style="margin-top:14px;"><div class="admin-debug-empty">${gameTextHtml('admin.audit.empty')}</div></div>
            <div class="admin-debug-summary" style="margin-top:10px;">${gameTextHtml('admin.audit.note')}</div>
          </div>
          <div data-economy-subpane="movements" class="hidden">
            <div class="admin-debug-toolbar">
              <div><div class="admin-section-title">${gameTextHtml('admin.movements.title')}</div><div class="admin-debug-summary" id="admin-movements-summary">${gameTextHtml('admin.movements.note')}</div></div>
              <button class="admin-save-btn" id="admin-movements-load">${gameTextHtml('admin.movements.load')}</button>
            </div>
            <div style="display:grid;grid-template-columns:minmax(180px,1.3fr) minmax(145px,.7fr) minmax(145px,.7fr);gap:8px;margin:10px 0 12px;">
              <label class="admin-field"><span>${gameTextHtml('admin.movements.user')}</span><select class="admin-field-input" id="admin-movements-user"></select></label>
              <label class="admin-field"><span>${gameTextHtml('admin.movements.from')}</span><input class="admin-field-input" type="date" id="admin-movements-from"></label>
              <label class="admin-field"><span>${gameTextHtml('admin.movements.to')}</span><input class="admin-field-input" type="date" id="admin-movements-to"></label>
            </div>
            <div id="admin-movements-cards" class="admin-stats-grid"></div>
            <div class="admin-debug-table-wrap" id="admin-movements-table" style="margin-top:14px;"><div class="admin-debug-empty">${gameTextHtml('admin.movements.empty')}</div></div>
            <div class="admin-debug-summary" style="margin-top:10px;">${gameTextHtml('admin.movements.note')}</div>
          </div>
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

  // 23.20.0 — Tournament balance strings are real gameConfig/settings values.
  for (const suffix of ['Round16','Quarter','Semi','Final']) {
    const difficultyEl = overlay.querySelector(`#cfg-tournament${suffix}Difficulty`);
    const qualityEl = overlay.querySelector(`#cfg-tournament${suffix}DeckQuality`);
    if (difficultyEl) difficultyEl.value = TOURNAMENT_POLICY[`tournament${suffix}Difficulty`];
    if (qualityEl) qualityEl.value = TOURNAMENT_POLICY[`tournament${suffix}DeckQuality`];
  }

  // 23.19.5.4 — Admission Control es independiente del save legacy de gameConfig/settings:
  // lee/escribe exclusivamente por Functions para que el navegador no pueda falsificar contadores.
  const admissionModeEl = overlay.querySelector('#cfg-registrationMode');
  const admissionMaxUsersEl = overlay.querySelector('#cfg-maxRegisteredUsers');
  const admissionMaxDailyEl = overlay.querySelector('#cfg-maxRegistrationsPerDay');
  const admissionStatusEl = overlay.querySelector('#admin-admission-status');
  const admissionErrorEl = overlay.querySelector('#admin-admission-error');
  const admissionSuccessEl = overlay.querySelector('#admin-admission-success');
  const admissionSaveBtn = overlay.querySelector('#admin-admission-save');
  const renderAdmissionStatus = status => {
    if (!status) return;
    admissionModeEl.value = status.registrationMode || 'open';
    admissionMaxUsersEl.value = Math.max(0, Math.floor(Number(status.maxRegisteredUsers) || 0));
    admissionMaxDailyEl.value = Math.max(0, Math.floor(Number(status.maxRegistrationsPerDay) || 0));
    const totalCap = status.maxRegisteredUsers > 0 ? `${status.registeredUsers}/${status.maxRegisteredUsers}` : `${status.registeredUsers}/∞`;
    const dayCap = status.maxRegistrationsPerDay > 0 ? `${status.registrationsToday}/${status.maxRegistrationsPerDay}` : `${status.registrationsToday}/∞`;
    const available = status.availableSlots == null ? '∞' : status.availableSlots;
    admissionStatusEl.innerHTML = `<b>Registrados:</b> ${totalCap} · <b>Cupos disponibles:</b> ${available} · <b>Altas hoy (${escapeHtml(status.dayKey || 'ART')}):</b> ${dayCap} · <b>Admite nuevas cuentas:</b> ${status.currentlyAcceptingNewUsers ? 'SÍ' : 'NO'}`;
  };
  let admissionStatusLoaded = false;
  async function ensureAdmissionStatusLoaded(force = false) {
    if (admissionStatusLoaded && !force) return;
    admissionStatusEl.textContent = 'Cargando estado autoritativo…';
    try {
      renderAdmissionStatus(await getAdmissionStatus());
      admissionStatusLoaded = true;
    } catch (error) {
      console.error('No se pudo cargar Admission Control:', error);
      admissionStatusEl.textContent = 'No se pudo leer el estado autoritativo de altas.';
    }
  }
  admissionSaveBtn?.addEventListener('click', async () => {
    admissionErrorEl.textContent = '';
    admissionSuccessEl.textContent = '';
    try {
      await withEconomyButtonPending(admissionSaveBtn, async () => {
        const status = await adminSetAdmissionPolicy({
          registrationMode: admissionModeEl.value,
          maxRegisteredUsers: Math.max(0, Math.floor(Number(admissionMaxUsersEl.value) || 0)),
          maxRegistrationsPerDay: Math.max(0, Math.floor(Number(admissionMaxDailyEl.value) || 0))
        });
        renderAdmissionStatus(status);
        admissionStatusLoaded = true;
        admissionSuccessEl.textContent = '✓ Control de altas actualizado en servidor.';
      }, { pendingLabel:'APLICANDO...' });
    } catch (error) {
      console.error('No se pudo guardar Admission Control:', error);
      admissionErrorEl.textContent = error?.message || 'No se pudo actualizar el control de altas.';
    }
  });

  // 23.19.5 RC2 — Admin instant-open: las solapas pesadas NO se construyen al abrir
  // el panel. Textos tiene 1242 definitions y antes se renderizaba aunque la solapa estuviera
  // oculta; Usuarios y Campañas además disparaban reads de Firestore sin que el admin entrara.
  let gameTextsAdminPane = null;
  let gameTextsAdminLoaded = false;
  function ensureGameTextsAdminPane() {
    if (gameTextsAdminPane) return gameTextsAdminPane;
    gameTextsAdminPane = createGameTextsAdminPane({
      loadDocument: loadGameTextOverrides,
      saveDocument: saveGameTextOverrides,
      onApplied: notifyGameTextsApplied
    });
    overlay.querySelector('#admin-game-texts-root')?.appendChild(gameTextsAdminPane.element);
    return gameTextsAdminPane;
  }

  let debugLoaded = false;
  let debugLoading = false;
  let debugSessions = [];
  let debugRewardAudit = { playerGameReceipts: [], gameRewardReceipts: [], tournamentReceipts: [], pvpEloReceipts: [], verification: {} };
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
    const missingEvolutionImages = Array.isArray(audit?.missingEvolutionImages) ? audit.missingEvolutionImages : [];
    const evolutionManifestPresent = audit?.evolutionManifestAvailable === true;
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
      ? gameText('admin.images.summary', { fronts: missingFronts.length, backs: missingBacks.length, evolutions: missingEvolutionImages.length, tokenFiles: tokenGroups.length, tokenEffects: missingTokenEffects.length, unassigned: unassignedTokenEffects.length, generated })
      : gameText('admin.images.legacySummary', { cards: missingCards.length, generated });
    txtBtn.disabled = false;
    jsonBtn.disabled = false;

    const blocks = [];
    if (!tokenManifestPresent) blocks.push(`<div class="admin-debug-error">${escapeHtml(gameText('admin.images.oldManifest'))}</div>`);
    if (!evolutionManifestPresent) blocks.push(`<div class="admin-debug-error">${escapeHtml(gameText('admin.images.evolutionManifestMissing'))}</div>`);

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

    if (missingEvolutionImages.length) {
      const visible=imageAuditShowAll?missingEvolutionImages:missingEvolutionImages.slice(0,20);
      const rows=visible.map(entry=>`<tr><td><code>${escapeHtml(entry.baseId||'—')}</code></td><td>${escapeHtml(entry.name||'—')}</td><td>EVO ${escapeHtml(String(entry.stage||'—'))}</td><td><code>${escapeHtml(entry.image||'—')}</code></td><td><code>${escapeHtml(entry.path||'—')}</code></td></tr>`).join('');
      blocks.push(`
        <div class="admin-section-title" style="font-size:13px;margin-top:16px;">${escapeHtml(gameText('admin.images.evolutionsTitle',{count:missingEvolutionImages.length}))}</div>
        <table class="admin-debug-table"><thead><tr><th>${escapeHtml(gameText('admin.images.col.id'))}</th><th>${escapeHtml(gameText('admin.images.col.card'))}</th><th>${escapeHtml(gameText('admin.images.col.stage'))}</th><th>${escapeHtml(gameText('admin.images.col.png'))}</th><th>${escapeHtml(gameText('admin.images.col.path'))}</th></tr></thead><tbody>${rows}</tbody></table>
        ${!imageAuditShowAll&&missingEvolutionImages.length>20?`<div class="admin-debug-empty">${escapeHtml(gameText('admin.images.first20'))}</div>`:''}
      `);
    }

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

    if (!missingCards.length && evolutionManifestPresent && !missingEvolutionImages.length && tokenManifestPresent && !tokenGroups.length && !unassignedTokenEffects.length) {
      blocks.push(`<div class="admin-debug-empty">${escapeHtml(gameText('admin.images.allOk'))}</div>`);
    }

    const needToggle = missingFronts.length > 20 || missingBacks.length > 20 || missingEvolutionImages.length > 20 || tokenGroups.length > 20 || unassignedTokenEffects.length > 20;
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

  function adminRewardReceiptIdForSession(session, meta = {}) {
    const ownerUid = String(session?.ownerUid || '');
    if (!ownerUid) return { ownerUid: '', receiptId: '', key: '' };
    const rawMode = String(session?.mode || meta?.mode || '').toLowerCase();
    let receiptId = '';
    if (rawMode.startsWith('multi')) {
      const matchId = String(session?.matchId || meta?.matchId || '').trim().toUpperCase();
      const role = String(session?.myRole || meta?.myRole || '').toLowerCase();
      if (matchId && ['host','guest'].includes(role)) receiptId = `match_${matchId}_${role}`;
    } else {
      receiptId = String(session?.soloGameId || meta?.soloGameId || session?.sessionId || session?.id || '');
    }
    return { ownerUid, receiptId, key: ownerUid && receiptId ? `${ownerUid}_${receiptId}` : '' };
  }

  function adminRewardMaps() {
    const tournaments=[...(debugRewardAudit?.tournamentReceipts || [])];
    const verification=debugRewardAudit?.verification || {};
    return {
      gameResults: new Map((debugRewardAudit?.playerGameReceipts || []).map(row => [String(row.id || ''), row])),
      rewards: new Map((debugRewardAudit?.gameRewardReceipts || []).map(row => [String(row.id || ''), row])),
      tournaments: new Map(tournaments.map(row => [String(row.id || ''), row])),
      tournamentRows: tournaments,
      verified: {
        playerGameReceipts: verification?.playerGameReceipts?.verified === true,
        gameRewardReceipts: verification?.gameRewardReceipts?.verified === true,
        tournamentReceipts: verification?.tournamentReceipts?.verified === true,
        pvpEloReceipts: verification?.pvpEloReceipts?.verified === true
      }
    };
  }

  function adminReceiptVerificationUnavailableHtml(label = 'receipt') {
    return `<span class="admin-debug-reward unknown" title="Firestore server no confirmó esta colección">${escapeHtml(gameText('admin.debug.receiptVerificationUnavailable', { label }))}</span>`;
  }

  function adminTournamentReceiptForSession(session, meta, maps) {
    const tournamentId=String(session?.tournamentId || meta?.tournamentId || '').trim();
    const matchId=String(session?.tournamentMatchId || session?.matchId || meta?.tournamentMatchId || meta?.matchId || '').trim();
    if(tournamentId && matchId){
      const exact=maps.tournaments.get(`${tournamentId}_${matchId}`);
      if(exact) return exact;
    }
    // Sesiones anteriores a 23.21.2 no indexaban tournamentId/matchId. Para ellas hacemos
    // un fallback acotado por UID y por cercanía temporal al fin de la partida.
    const uid=String(session?.ownerUid || '').trim();
    const ended=adminTelemetryTimestampMs(session?.finalizedAt || session?.updatedAt) || Date.parse(session?.endedAtClient || '') || 0;
    if(!uid || !ended) return null;
    let best=null,bestDist=Number.MAX_SAFE_INTEGER;
    for(const row of maps.tournamentRows||[]){
      if(String(row?.uid||'')!==uid) continue;
      const at=adminTelemetryTimestampMs(row?.createdAt);
      if(!at) continue;
      const dist=Math.abs(at-ended);
      if(dist<=5*60*1000 && dist<bestDist){best=row;bestDist=dist;}
    }
    return best;
  }

  function adminExpectedSoloBaseDelta(session, meta, outcome) {
    if (outcome === 'loss') return Math.max(0, Math.floor(Number(POINTS.lossVsTano) || 0));
    const difficulty = String(session?.difficulty || meta?.difficulty || '').toLowerCase();
    if (difficulty === 'hard') return Math.max(0, Math.floor(Number(POINTS.winVsTanoDificil) || 0));
    if (difficulty === 'medium') return Math.max(0, Math.floor(Number(POINTS.winVsTanoMedio) || 0));
    if (difficulty === 'easy') return Math.max(0, Math.floor(Number(POINTS.winVsTanoFacil) || 0));
    return 0;
  }

  function adminTelemetryOutcome(session, gameResult) {
    const authoritative = String(gameResult?.result || '');
    if (authoritative === 'win' || authoritative === 'loss') return { result: authoritative, authoritative: true };
    const fallback = telemetryOutcome(session)?.result || 'unknown';
    return { result: fallback, authoritative: false };
  }

  function adminRewardCells(session, meta, localName, rivalName, maps) {
    const modeRaw = String(session?.mode || meta?.mode || '').toLowerCase();
    if(modeRaw === 'tournament'){
      const receipt=adminTournamentReceiptForSession(session,meta,maps);
      const displayStatus=telemetryAdminDisplayStatus(session);
      if(receipt){
        const won=receipt.won===true;
        // La fila representa la perspectiva del owner de ESTE log: el ícono expresa si ese
        // jugador ganó/perdió y el nombre debe ser siempre el jugador local, nunca el ganador global.
        const resultHtml=`<span class="admin-debug-result ${won?'win':'loss'}" title="Receipt de Torneo server-authoritative">${won?'🏆':'💀'} ${escapeHtml(localName)}</span>`;
        const points=Math.max(0,Math.floor(Number(receipt.pointsGain)||0));
        const packs=Math.max(0,Math.floor(Number(receipt.packsGain)||0));
        const eligible=receipt.rewardEligible===true;
        const rewardHtml=won && eligible
          ? `<span class="admin-debug-reward ok" title="tournamentReceipt ${escapeHtml(receipt.id||'')}">✅ ${escapeHtml(gameText('admin.debug.tournamentReward',{points,packs}))}</span>`
          : `<span class="admin-debug-reward ok" title="tournamentReceipt ${escapeHtml(receipt.id||'')}">✅ ${escapeHtml(eligible?gameText('admin.debug.tournamentSettledZero'):gameText('admin.debug.tournamentPractice'))}</span>`;
        return {resultHtml,rewardHtml};
      }
      if(displayStatus.status==='interrupted') return {resultHtml:'<span class="admin-debug-reward unknown">—</span>',rewardHtml:'<span class="admin-debug-reward unknown">— Sin liquidación · sesión interrumpida</span>'};
      if (!maps.verified?.tournamentReceipts) {
        return {
          resultHtml:'<span class="admin-debug-reward unknown">—</span>',
          rewardHtml:adminReceiptVerificationUnavailableHtml('tournamentReceipt')
        };
      }
      return {
        resultHtml:'<span class="admin-debug-reward unknown">—</span>',
        rewardHtml:`<span class="admin-debug-reward missing">${escapeHtml(gameText('admin.debug.tournamentReceiptMissing'))}</span>`
      };
    }
    const identity = adminRewardReceiptIdForSession(session, meta);
    const gameResult = identity.key ? maps.gameResults.get(identity.key) : null;
    const reward = identity.key ? maps.rewards.get(identity.key) : null;
    const displayStatus = telemetryAdminDisplayStatus(session);
    const endReason = String(session?.endReason || '');
    const abandoned = gameResult?.abandoned === true
      || gameResult?.terminalKind === 'abandon'
      || endReason === 'abandon_local'
      || endReason.startsWith('abandon_recovery');
    const outcome = adminTelemetryOutcome(session, gameResult);
    // Igual que en Torneo, win/loss es relativo al owner de esta sesión. La calavera no
    // nombra al ganador: identifica que el jugador local perdió.
    let resultHtml = outcome.result === 'unknown'
      ? '<span class="admin-debug-reward unknown">—</span>'
      : `<span class="admin-debug-result ${outcome.result}" title="${outcome.authoritative ? 'Registrado en playerGameReceipt' : 'Inferido desde snapshot final'}">${outcome.result === 'win' ? '🏆' : '💀'} ${escapeHtml(localName)}</span>`;

    if (reward) {
      const effective = Math.floor(Number(reward.effectiveDelta) || 0);
      const isPenalty = reward.penalty === true || reward.abandoned === true || reward.terminalKind === 'abandon' || reward.rewardReason === 'abandon_penalty';
      if (isPenalty) {
        const signed = effective > 0 ? `+${effective}` : String(effective);
        return {
          resultHtml,
          rewardHtml: `<span class="admin-debug-reward penalty" title="Receipt económico terminal ${escapeHtml(identity.receiptId)}">⛔ ${escapeHtml(signed)} pts · penalidad de abandono</span>`
        };
      }
      const safeEffective = Math.max(0, effective);
      const reason = String(reward.rewardReason || (reward.adminRepair ? 'admin_repair' : 'rewarded'));
      const repair = reward.adminRepair === true ? ' · reparación Admin' : '';
      const label = safeEffective > 0 ? `✅ +${safeEffective} acreditados${repair}` : `✅ 0 pts · ${reason}`;
      return { resultHtml, rewardHtml: `<span class="admin-debug-reward ok" title="Receipt económico ${escapeHtml(identity.receiptId)}">${escapeHtml(label)}</span>` };
    }

    // Ausencia sólo es evidencia si ambas colecciones relevantes fueron confirmadas por
    // Firestore server en esta misma recarga. Si hubo DNS/offline/listener disruption, no
    // mostramos falsos "Sin receipt" ni ofrecemos reparación manual.
    if (!maps.verified?.playerGameReceipts || !maps.verified?.gameRewardReceipts) {
      const missingAuthority = !maps.verified?.playerGameReceipts ? 'playerGameReceipt' : 'receipt económico';
      return { resultHtml, rewardHtml: adminReceiptVerificationUnavailableHtml(missingAuthority) };
    }

    // Una sesión incompleta no es una derrota liquidable. En particular, la Caja Negra no
    // debe convertir una sesión huérfana/interrumpida en el +15 base de una derrota Solo.
    if (displayStatus.status === 'interrupted' && !abandoned) {
      resultHtml = '<span class="admin-debug-reward unknown">—</span>';
      return { resultHtml, rewardHtml: '<span class="admin-debug-reward unknown">— Sin liquidación · sesión interrumpida</span>' };
    }

    if (abandoned) {
      return {
        resultHtml,
        rewardHtml: `<div><span class="admin-debug-reward missing">⚠ Penalidad de abandono sin receipt económico</span>${gameResult ? '' : '<div class="admin-debug-reward-note">Sin playerGameReceipt terminal registrado</div>'}</div>`
      };
    }

    if (outcome.result === 'win' || outcome.result === 'loss') {
      const isMulti = modeRaw.startsWith('multi');
      const expected = isMulti
        ? Math.max(0, Math.floor(Number(outcome.result === 'win' ? POINTS.winVsHumano : POINTS.lossVsHumano) || 0))
        : adminExpectedSoloBaseDelta(session, meta, outcome.result);
      const authoritativeNote = gameResult ? '' : '<div class="admin-debug-reward-note">Sin playerGameReceipt registrado</div>';
      const sessionCompleted = displayStatus.status === 'completed';
      const canRepair = sessionCompleted && !isMulti && !!gameResult && !!identity.ownerUid && !!identity.receiptId && expected > 0;
      const repairButton = canRepair
        ? `<button class="admin-save-btn admin-debug-reward-repair" data-reward-repair="${escapeHtml(identity.receiptId)}" data-reward-owner="${escapeHtml(identity.ownerUid)}" data-reward-session="${escapeHtml(session.id || session.sessionId || '')}" data-reward-expected="${expected}">Acreditar manualmente</button>`
        : '';
      const expectedText = expected > 0 ? ` · base actual +${expected}` : '';
      const missingLabel = isMulti ? '❌ Sin receipt económico' : '❌ No acreditada';
      return {
        resultHtml,
        rewardHtml: `<div><span class="admin-debug-reward missing">${missingLabel}${escapeHtml(expectedText)}</span>${authoritativeNote}${repairButton}</div>`
      };
    }

    return { resultHtml, rewardHtml: '<span class="admin-debug-reward unknown">—</span>' };
  }

  function renderTelemetrySessions(sessions) {
    const wrap = overlay.querySelector('#admin-debug-table-wrap');
    const summary = overlay.querySelector('#admin-debug-summary');
    summary.textContent = `${sessions.length} sesión${sessions.length === 1 ? '' : 'es'} encontrada${sessions.length === 1 ? '' : 's'} en Firestore.`;
    if (sessions.length === 0) {
      wrap.innerHTML = '<div class="admin-debug-empty">Todavía no hay logs remotos subidos.</div>';
      return;
    }

    const rewardMaps = adminRewardMaps();
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
      const rewardCells = adminRewardCells(session, meta, localName, rivalName, rewardMaps);
      return `
        <tr>
          <td>${escapeHtml(formatTelemetryDate(date))}</td>
          <td><span class="admin-debug-mode">${escapeHtml(mode)}</span>${session.matchId ? `<div class="admin-debug-match" title="${escapeHtml(session.matchId)}">${escapeHtml(session.matchId)}</div>` : ''}</td>
          <td>${(session.endedAtClient || status === 'interrupted') ? escapeHtml(formatDuration(telemetryDurationMs(session) || Math.max(0, (adminTelemetryTimestampMs(session.updatedAt) || 0) - (Date.parse(session.startedAtClient || '') || 0)))) : '—'}</td>
          <td><strong>${escapeHtml(localName)}</strong><br><span style="color:#9987a7;">vs ${escapeHtml(rivalName)}</span></td>
          <td>${rewardCells.resultHtml}</td>
          <td>${rewardCells.rewardHtml}</td>
          <td><span class="admin-debug-mode">v${escapeHtml(session.telemetryVersion || meta.engineVersion || '?')}</span></td>
          <td${bugSplitTitle}><div class="admin-debug-bug-auto">⚙️ ${bugs.automatic} auto${bugs.automaticOccurrences > bugs.automatic ? ` · ${bugs.automaticOccurrences} ocurr.` : ''}</div><div class="admin-debug-bug-manual">🐞 ${bugs.manual} marcado${bugs.manual === 1 ? '' : 's'} · ${bugs.total} total</div></td>
          <td>${Number(session.eventCount || 0).toLocaleString('es-AR')}</td>
          <td><span class="admin-debug-status ${status}">${statusLabel}</span></td>
          <td><button class="admin-save-btn admin-debug-download" data-telemetry-download="${escapeHtml(session.id || session.sessionId || '')}">⬇ JSON</button></td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="admin-debug-table black-box-table">
        <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>${escapeHtml(gameText('admin.debug.col.duration'))}</th><th>Jugadores</th><th>Resultado</th><th>Recompensa</th><th>Motor</th><th>Bugs</th><th>Eventos</th><th>Estado</th><th>Log</th></tr></thead>
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


    wrap.querySelectorAll('[data-reward-repair]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const receiptId = btn.dataset.rewardRepair || '';
        const targetUid = btn.dataset.rewardOwner || '';
        const telemetrySessionId = btn.dataset.rewardSession || '';
        const expected = Math.max(0, Math.floor(Number(btn.dataset.rewardExpected) || 0));
        const session = debugSessions.find(row => (row.id || row.sessionId) === telemetrySessionId);
        const meta = parseAdminJson(session?.metaJson, {});
        const player = session?.playerName || meta.localPlayerName || 'Jugador';
        const difficulty = botDifficultyLabel(session?.difficulty || meta?.difficulty || 'medium');
        const ok = window.confirm(
          `¿Acreditar manualmente +${expected} puntos a ${player}?

` +
          `Solo · ${difficulty}
Receipt: ${receiptId}

` +
          'Se volverá a verificar en Firestore que la sesión esté completa, exista el resultado registrado y que NO exista ya un receipt económico. La operación es idempotente, queda auditada y acredita el premio base actual (sin reconstruir multiplicadores históricos de eventos).'
        );
        if (!ok) return;
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Verificando…';
        try {
          const result = await adminRepairSoloGameReward({
            targetUid,
            receiptId,
            telemetrySessionId,
            reason: 'Caja Negra: liquidación faltante confirmada por Admin'
          });
          if (result?.duplicate) {
            window.alert(`No se acreditó nada: el receipt económico ya existía. Total actual: ${Number(result.total || 0).toLocaleString('es-AR')} puntos.`);
          } else {
            window.alert(`✅ Reparación confirmada. Se acreditaron +${Number(result.appliedDelta || 0).toLocaleString('es-AR')} puntos a ${player}. Total: ${Number(result.total || 0).toLocaleString('es-AR')}.`);
          }
          await reloadTelemetryHistory();
        } catch (err) {
          console.error('No se pudo reparar la recompensa desde Caja Negra:', err);
          window.alert(`No se acreditaron puntos. Firestore rechazó o no pudo verificar la reparación: ${err?.message || err}`);
          btn.disabled = false;
          btn.textContent = oldText;
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
      const [sessions, rewardAudit] = await Promise.all([
        fetchTelemetrySessionsForAdmin(),
        fetchGameRewardAuditForAdmin()
      ]);
      debugSessions = sessions;
      debugRewardAudit = rewardAudit || { playerGameReceipts: [], gameRewardReceipts: [], tournamentReceipts: [], pvpEloReceipts: [], verification: {} };
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
  let statsPublicRowsCache = [];
  let statsMarketCache = null;

  const ADMIN_TRACKED_STAT_KEYS = Object.freeze([
    'gamesPlayed','soloGames','multiplayerGames','wins','losses','soloWins','soloLosses',
    'multiplayerWins','multiplayerLosses','abandons','totalDurationMs','pointsEarned','pointsSpent','pointsLost',
    'fichasEarned','fichasSpent','packsReceived','packsOpened','guaranteedMythicsOpened',
    'tournamentsPlayed','tournamentMatches','tournamentWins','tournamentLosses','tournamentQuarterfinals',
    'tournamentSemifinals','tournamentFinals','tournamentChampionships','tournamentForfeits','tradesCompleted',
    'eloGames','eloWins','eloLosses','basicLandPacksPurchased','basicLandsReceived','basicLandPacksWhite',
    'basicLandPacksBlue','basicLandPacksBlack','basicLandPacksRed','basicLandPacksGreen',
    'storePacksPurchased','enhancementsCrafted','prebuiltDecksPurchased','classifiedsCardsPurchased',
    'emotesPurchased','dailyRewardsClaimed','essenceEarned','essenceSpent','essenceCurrent','achievementClaims','industrialMixes'
  ]);

  function trackedTotals(publicRows) {
    const seed = Object.fromEntries(ADMIN_TRACKED_STAT_KEYS.map(key => [key, 0]));
    return (publicRows || []).reduce((acc, row) => {
      for (const key of ADMIN_TRACKED_STAT_KEYS) acc[key] += Number(row?.[key]) || 0;
      return acc;
    }, seed);
  }

  function adminRate(wins, losses) {
    const total = Math.max(0, Number(wins) || 0) + Math.max(0, Number(losses) || 0);
    return total ? (Math.max(0, Number(wins) || 0) / total) * 100 : 0;
  }

  function adminMetricCard(label, value, sub = '') {
    return `<div class="admin-stat-card"><div class="admin-stat-label">${escapeHtml(label)}</div><div class="admin-stat-value">${escapeHtml(value)}</div><div class="admin-stat-sub">${escapeHtml(sub)}</div></div>`;
  }

  function adminMetricGroup(title, cards) {
    return `<section class="admin-dashboard-group"><div class="admin-dashboard-group-title">${escapeHtml(title)}</div><div class="admin-stats-grid">${cards.join('')}</div></section>`;
  }

  function adminBarChart(title, items) {
    const normalized = (items || []).map(item => ({
      label: String(item?.label || ''),
      value: Math.max(0, Number(item?.value) || 0),
      display: item?.display == null ? Math.max(0, Number(item?.value) || 0).toLocaleString('es-AR') : String(item.display)
    }));
    const max = Math.max(0, ...normalized.map(item => item.value));
    const rows = normalized.map(item => {
      const width = max > 0 ? Math.max(item.value > 0 ? 2 : 0, Math.min(100, (item.value / max) * 100)) : 0;
      return `<div class="admin-chart-row"><div class="admin-chart-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div><div class="admin-chart-track"><div class="admin-chart-fill" style="width:${width.toFixed(2)}%"></div></div><div class="admin-chart-value">${escapeHtml(item.display)}</div></div>`;
    }).join('');
    return `<div class="admin-chart-card"><div class="admin-chart-title">${escapeHtml(title)}</div>${max > 0 ? rows : `<div class="admin-chart-empty">${escapeHtml(gameText('admin.stats.chart.empty'))}</div>`}</div>`;
  }

  function adminMarketSnapshot(market) {
    if (!market) return { available:false, activeListings:0, activeOffers:0, capped:false };
    const listings = [...(Array.isArray(market.listings) ? market.listings : [])];
    if (market.ownListing) listings.push(market.ownListing);
    const unique = new Map();
    for (const listing of listings) {
      const key = String(listing?.listingId || `${listing?.ownerUid || ''}:${listing?.cardId || ''}`);
      if (key) unique.set(key, listing);
    }
    const rows = [...unique.values()];
    return {
      available:true,
      activeListings:rows.length,
      activeOffers:rows.reduce((sum, listing) => sum + Math.max(0, Number(listing?.offerCount) || 0), 0),
      capped:(Array.isArray(market.listings) ? market.listings.length : 0) >= 100
    };
  }

  function buildAdminStatisticsSnapshot(profiles, sessions, publicRows, market) {
    const profileStats = summarizeProfiles(profiles);
    const games = summarizeGlobalTelemetry(sessions);
    const tracked = trackedTotals(publicRows);
    const marketNow = adminMarketSnapshot(market);
    const tradeParticipants = (publicRows || []).filter(row => (Number(row?.tradesCompleted) || 0) > 0).length;
    const completedTrades = Math.floor((Number(tracked.tradesCompleted) || 0) / 2);
    const eloPlayers = (publicRows || []).filter(row => (Number(row?.eloGames) || 0) > 0);
    const logicalEloMatches = Math.floor((Number(tracked.eloGames) || 0) / 2);
    const averageElo = eloPlayers.length
      ? Math.round(eloPlayers.reduce((sum, row) => sum + (Number(row?.eloRating) || 1200), 0) / eloPlayers.length)
      : 0;
    const topElo = eloPlayers.reduce((best, row) => !best || (Number(row?.eloRating) || 0) > (Number(best?.eloRating) || 0) ? row : best, null);
    const peakElo = eloPlayers.reduce((best, row) => !best || (Number(row?.eloPeak) || 0) > (Number(best?.eloPeak) || 0) ? row : best, null);
    const tournamentRate = adminRate(tracked.tournamentWins, tracked.tournamentLosses);
    const essenceInCirculation = (publicRows || []).reduce((sum,row)=>sum + Math.max(0, Number(row?.essenceCurrent) || 0), 0);
    return {
      profileStats, games, tracked, marketNow, tradeParticipants, completedTrades,
      eloPlayers, logicalEloMatches, averageElo, topElo, peakElo, tournamentRate, essenceInCirculation
    };
  }

  function renderAdminStatistics(profiles, sessions, publicRows, market = null) {
    const snap = buildAdminStatisticsSnapshot(profiles, sessions, publicRows, market);
    const { profileStats, games, tracked, marketNow } = snap;
    const marketSuffix = marketNow.capped ? gameText('admin.stats.market.capped') : gameText('admin.stats.market.live');
    const groups = [
      adminMetricGroup(gameText('admin.stats.group.activity'), [
        adminMetricCard(gameText('admin.stats.registered.label'), profileStats.registeredPlayers, gameText('admin.stats.registered.sub', { new7d:profileStats.new7d, new30d:profileStats.new30d })),
        adminMetricCard(gameText('admin.stats.active.label'), profileStats.active24h, gameText('admin.stats.active.sub', { active7d:profileStats.active7d, active30d:profileStats.active30d })),
        adminMetricCard(gameText('admin.stats.games.label'), games.totalGames, gameText('admin.stats.games.sub3', { solo:games.soloGames, multi:games.multiplayerGames, tournament:games.tournamentGames || 0 })),
        adminMetricCard(gameText('admin.stats.duration.label'), formatDuration(games.averageDurationMs), gameText('admin.stats.duration.sub', { total:formatDuration(games.totalDurationMs), max:formatDuration(games.longestDurationMs) })),
        adminMetricCard(gameText('admin.stats.abandons.label'), games.abandonedGames.toLocaleString('es-AR'), gameText('admin.stats.abandons.sub', { sessions:games.completedSessions }))
      ]),
      adminMetricGroup(gameText('admin.stats.group.competition'), [
        adminMetricCard(gameText('admin.stats.tournaments.started'), tracked.tournamentsPlayed.toLocaleString('es-AR'), `${tracked.tournamentMatches.toLocaleString('es-AR')} ${gameText('admin.stats.matches')}`),
        adminMetricCard(gameText('admin.stats.tournaments.record'), `${tracked.tournamentWins.toLocaleString('es-AR')}–${tracked.tournamentLosses.toLocaleString('es-AR')}`, `${snap.tournamentRate.toFixed(1)}% · ${tracked.tournamentForfeits.toLocaleString('es-AR')} ${gameText('admin.stats.forfeits')}`),
        adminMetricCard(gameText('admin.stats.tournaments.champions'), tracked.tournamentChampionships.toLocaleString('es-AR'), `${tracked.tournamentFinals.toLocaleString('es-AR')} ${gameText('admin.stats.finalsReached')}`),
        adminMetricCard(gameText('admin.stats.elo.players'), snap.eloPlayers.length.toLocaleString('es-AR'), `${snap.logicalEloMatches.toLocaleString('es-AR')} ${gameText('admin.stats.ratedMatches')}`),
        adminMetricCard(gameText('admin.stats.elo.average'), snap.averageElo ? snap.averageElo.toLocaleString('es-AR') : '—', snap.topElo ? `${gameText('admin.stats.elo.leader')}: ${snap.topElo.username || gameText('ranking.playerFallback')} · ${Number(snap.topElo.eloRating || 1200)}` : gameText('admin.stats.noRatedPlayers')),
        adminMetricCard(gameText('admin.stats.elo.peak'), snap.peakElo ? Number(snap.peakElo.eloPeak || 1200).toLocaleString('es-AR') : '—', snap.peakElo ? String(snap.peakElo.username || gameText('ranking.playerFallback')) : gameText('admin.stats.noRatedPlayers'))
      ]),
      adminMetricGroup(gameText('admin.stats.group.market'), [
        adminMetricCard(gameText('admin.stats.trades.label'), snap.completedTrades.toLocaleString('es-AR'), gameText('admin.stats.trades.sub', { participants:snap.tradeParticipants })),
        adminMetricCard(gameText('admin.stats.market.participants'), snap.tradeParticipants.toLocaleString('es-AR'), snap.tradeParticipants ? `${(snap.completedTrades / snap.tradeParticipants).toFixed(2)} ${gameText('admin.stats.market.tradesPerParticipant')}` : '—'),
        adminMetricCard(gameText('admin.stats.market.activeListings'), marketNow.available ? marketNow.activeListings.toLocaleString('es-AR') : '—', marketNow.available ? marketSuffix : gameText('admin.stats.market.unavailable')),
        adminMetricCard(gameText('admin.stats.market.activeOffers'), marketNow.available ? marketNow.activeOffers.toLocaleString('es-AR') : '—', marketNow.available ? marketSuffix : gameText('admin.stats.market.unavailable'))
      ]),
      adminMetricGroup(gameText('admin.stats.group.economy'), [
        adminMetricCard(gameText('admin.stats.points.label'), tracked.pointsEarned.toLocaleString('es-AR'), gameText('admin.stats.points.sub', { spent:tracked.pointsSpent.toLocaleString('es-AR'), lost:tracked.pointsLost.toLocaleString('es-AR'), circulation:profileStats.pointsInCirculation.toLocaleString('es-AR') })),
        adminMetricCard(gameText('admin.stats.fichas.label'), tracked.fichasEarned.toLocaleString('es-AR'), gameText('admin.stats.fichas.sub', { spent:tracked.fichasSpent.toLocaleString('es-AR'), circulation:profileStats.fichasInCirculation.toLocaleString('es-AR') })),
        adminMetricCard(gameText('admin.stats.packs.label'), tracked.packsOpened.toLocaleString('es-AR'), gameText('admin.stats.packs.sub', { received:tracked.packsReceived.toLocaleString('es-AR'), chests:profileStats.packsInChests.toLocaleString('es-AR'), mythics:tracked.guaranteedMythicsOpened.toLocaleString('es-AR') })),
        adminMetricCard(gameText('admin.stats.collection.label'), profileStats.cardsOwned.toLocaleString('es-AR'), gameText('admin.stats.collection.sub', { unique:profileStats.communityUniqueCards, total:POOL_BASELINE.total, average:profileStats.averageUniqueCards.toFixed(1) })),
        adminMetricCard(gameText('admin.stats.basicLands.packs'), tracked.basicLandPacksPurchased.toLocaleString('es-AR'), `${tracked.basicLandsReceived.toLocaleString('es-AR')} ${gameText('admin.stats.basicLands.received')}`),
        adminMetricCard(gameText('admin.stats.dailyClaims'), tracked.dailyRewardsClaimed.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314')),
        adminMetricCard(gameText('admin.stats.essence.current'), snap.essenceInCirculation.toLocaleString('es-AR'), gameText('admin.stats.essence.flow',{earned:tracked.essenceEarned.toLocaleString('es-AR'),spent:tracked.essenceSpent.toLocaleString('es-AR')})),
        adminMetricCard(gameText('admin.stats.achievements.claimed'), tracked.achievementClaims.toLocaleString('es-AR'), gameText('admin.stats.achievements.sub'))
      ]),
      adminMetricGroup(gameText('admin.stats.group.store'), [
        adminMetricCard(gameText('admin.stats.store.packPurchases'), tracked.storePacksPurchased.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314')),
        adminMetricCard(gameText('admin.stats.store.classifiedPurchases'), tracked.classifiedsCardsPurchased.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314')),
        adminMetricCard(gameText('admin.stats.store.prebuiltPurchases'), tracked.prebuiltDecksPurchased.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314')),
        adminMetricCard(gameText('admin.stats.store.enhancements'), tracked.enhancementsCrafted.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314')),
        adminMetricCard(gameText('admin.stats.store.mixes'), tracked.industrialMixes.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314')),
        adminMetricCard(gameText('admin.stats.store.emotes'), tracked.emotesPurchased.toLocaleString('es-AR'), gameText('admin.stats.trackingSince2314'))
      ])
    ];
    overlay.querySelector('#admin-stats-cards').innerHTML = groups.join('');

    overlay.querySelector('#admin-stats-charts').innerHTML = [
      adminBarChart(gameText('admin.stats.chart.tournamentFunnel'), [
        { label:gameText('admin.stats.chart.started'), value:tracked.tournamentsPlayed },
        { label:gameText('admin.stats.chart.quarters'), value:tracked.tournamentQuarterfinals },
        { label:gameText('admin.stats.chart.semis'), value:tracked.tournamentSemifinals },
        { label:gameText('admin.stats.chart.finals'), value:tracked.tournamentFinals },
        { label:gameText('admin.stats.chart.champions'), value:tracked.tournamentChampionships }
      ]),
      adminBarChart(gameText('admin.stats.chart.landsByColor'), [
        { label:gameText('admin.stats.color.white'), value:tracked.basicLandPacksWhite },
        { label:gameText('admin.stats.color.blue'), value:tracked.basicLandPacksBlue },
        { label:gameText('admin.stats.color.black'), value:tracked.basicLandPacksBlack },
        { label:gameText('admin.stats.color.red'), value:tracked.basicLandPacksRed },
        { label:gameText('admin.stats.color.green'), value:tracked.basicLandPacksGreen }
      ]),
      adminBarChart(gameText('admin.stats.chart.economy'), [
        { label:gameText('admin.stats.chart.pointsEarned'), value:tracked.pointsEarned },
        { label:gameText('admin.stats.chart.pointsSpent'), value:tracked.pointsSpent },
        { label:gameText('admin.stats.chart.pointsLost'), value:tracked.pointsLost }
      ]),
      adminBarChart(gameText('admin.stats.chart.market'), [
        { label:gameText('admin.stats.chart.trades'), value:snap.completedTrades },
        { label:gameText('admin.stats.chart.participants'), value:snap.tradeParticipants },
        { label:gameText('admin.stats.chart.activeListings'), value:marketNow.activeListings },
        { label:gameText('admin.stats.chart.activeOffers'), value:marketNow.activeOffers }
      ])
    ].join('');

    overlay.querySelector('#admin-stats-summary').textContent = gameText('admin.stats.summary', { profiles:profiles.length, sessions:sessions.length });

    const rows = [...(publicRows || [])].sort((a,b) => (Number(b.gamesPlayed)||0) - (Number(a.gamesPlayed)||0)).map(r => {
      const soloRecord = `${Number(r.soloWins||0)}–${Number(r.soloLosses||0)} (${adminRate(r.soloWins,r.soloLosses).toFixed(0)}%)`;
      const pvpRecord = `${Number(r.multiplayerWins||0)}–${Number(r.multiplayerLosses||0)} (${adminRate(r.multiplayerWins,r.multiplayerLosses).toFixed(0)}%)`;
      const tournamentRecord = `${Number(r.tournamentWins||0)}–${Number(r.tournamentLosses||0)} · 🏆 ${Number(r.tournamentChampionships||0)}`;
      const elo = Number(r.eloGames||0) > 0 ? `${Number(r.eloRating||1200)} / ${Number(r.eloPeak||1200)}` : '—';
      return `<tr><td><strong>${escapeHtml(r.username || gameText('ranking.playerFallback'))}</strong></td><td>${Number(r.gamesPlayed||0)}</td><td>${escapeHtml(soloRecord)}</td><td>${escapeHtml(pvpRecord)}</td><td>${Number(r.tournamentsPlayed||0)} · ${escapeHtml(tournamentRecord)}</td><td>${escapeHtml(elo)}</td><td>${Number(r.tradesCompleted||0)}</td><td>${Number(r.basicLandPacksPurchased||0)} / ${Number(r.basicLandsReceived||0)}</td><td>${Number(r.pointsEarned||0)}</td><td>${Number(r.fichasEarned||0)}</td><td>${Number(r.packsOpened||0)}</td><td>${Number(r.uniqueCards||0)} / ${POOL_BASELINE.total}</td><td>${Number(r.essenceCurrent||0)}</td><td>${Number(r.achievementClaims||0)}</td><td>${formatDuration(r.totalDurationMs||0)}</td></tr>`;
    }).join('');
    const headers = [
      'admin.stats.col.player','admin.stats.col.games','admin.stats.col.soloRecord','admin.stats.col.pvpRecord','admin.stats.col.tournaments',
      'admin.stats.col.elo','admin.stats.col.trades','admin.stats.col.landPacks','admin.stats.col.points','admin.stats.col.fichas',
      'admin.stats.col.packs','admin.stats.col.discovered','admin.stats.col.essence','admin.stats.col.achievementClaims','admin.stats.col.time'
    ].map(key => `<th>${escapeHtml(gameText(key))}</th>`).join('');
    overlay.querySelector('#admin-stats-detail').innerHTML = `<table class="admin-debug-table"><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="15">${escapeHtml(gameText('admin.stats.empty'))}</td></tr>`}</tbody></table>`;
  }

  function adminCsvCell(value) {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportAdminStatisticsCsv() {
    if (!statsProfilesCache.length && !statsPublicRowsCache.length) return;
    const snap = buildAdminStatisticsSnapshot(statsProfilesCache, statsSessionsCache, statsPublicRowsCache, statsMarketCache);
    const summary = [
      ['ARGENTINIA · ESTADÍSTICAS ADMIN', '23.21.4'],
      ['Exportado', new Date().toISOString()],
      ['Jugadores registrados', snap.profileStats.registeredPlayers],
      ['Activos 24h', snap.profileStats.active24h],
      ['Partidas telemetría', snap.games.totalGames],
      ['Solo', snap.games.soloGames],
      ['Multiplayer', snap.games.multiplayerGames],
      ['Torneo', snap.games.tournamentGames || 0],
      ['Torneos iniciados', snap.tracked.tournamentsPlayed],
      ['Partidas de torneo', snap.tracked.tournamentMatches],
      ['Campeonatos', snap.tracked.tournamentChampionships],
      ['Intercambios completados', snap.completedTrades],
      ['Participantes Mercado de Pases', snap.tradeParticipants],
      ['Publicaciones activas visibles', snap.marketNow.available ? snap.marketNow.activeListings : 'N/D'],
      ['Ofertas activas visibles', snap.marketNow.available ? snap.marketNow.activeOffers : 'N/D'],
      ['Jugadores con ELO', snap.eloPlayers.length],
      ['Partidas ELO', snap.logicalEloMatches],
      ['ELO promedio', snap.averageElo || 'N/D'],
      ['Packs de tierras comprados', snap.tracked.basicLandPacksPurchased],
      ['Tierras básicas entregadas', snap.tracked.basicLandsReceived],
      ['Puntos ganados', snap.tracked.pointsEarned],
      ['Puntos gastados', snap.tracked.pointsSpent],
      ['Fichas ganadas', snap.tracked.fichasEarned],
      ['Fichas gastadas', snap.tracked.fichasSpent],
      ['Sobres abiertos', snap.tracked.packsOpened],
      [gameText('admin.stats.essence.current'), snap.essenceInCirculation],
      [gameText('admin.stats.essence.earned'), snap.tracked.essenceEarned],
      [gameText('admin.stats.essence.spent'), snap.tracked.essenceSpent],
      [gameText('admin.stats.achievements.claimed'), snap.tracked.achievementClaims],
      ['Cartas en colecciones', snap.profileStats.cardsOwned]
    ];

    const playerHeader = [
      'Jugador','Partidas','Solo','Solo W','Solo L','PvP','PvP W','PvP L','Torneos','Torneo partidas','Torneo W','Torneo L',
      'Cuartos','Semis','Finales','Campeonatos','Forfeits','ELO','ELO peak','ELO partidas','Intercambios',
      'Packs tierras','Tierras recibidas','Puntos ganados','Puntos gastados','Fichas ganadas','Fichas gastadas',
      'Sobres recibidos','Sobres abiertos','Mythics aseguradas',gameText('admin.stats.col.essence'),gameText('admin.stats.essence.earned'),gameText('admin.stats.essence.spent'),gameText('admin.stats.col.achievementClaims'),'Cartas poseídas','Únicas','Tiempo ms'
    ];
    const playerRows = [...statsPublicRowsCache]
      .sort((a,b) => String(a.username || '').localeCompare(String(b.username || ''), 'es-AR'))
      .map(r => [
        r.username || 'Jugador',r.gamesPlayed||0,r.soloGames||0,r.soloWins||0,r.soloLosses||0,r.multiplayerGames||0,r.multiplayerWins||0,r.multiplayerLosses||0,
        r.tournamentsPlayed||0,r.tournamentMatches||0,r.tournamentWins||0,r.tournamentLosses||0,r.tournamentQuarterfinals||0,r.tournamentSemifinals||0,r.tournamentFinals||0,
        r.tournamentChampionships||0,r.tournamentForfeits||0,r.eloRating||1200,r.eloPeak||1200,r.eloGames||0,r.tradesCompleted||0,
        r.basicLandPacksPurchased||0,r.basicLandsReceived||0,r.pointsEarned||0,r.pointsSpent||0,r.fichasEarned||0,r.fichasSpent||0,
        r.packsReceived||0,r.packsOpened||0,r.guaranteedMythicsOpened||0,r.essenceCurrent||0,r.essenceEarned||0,r.essenceSpent||0,r.achievementClaims||0,r.cardsOwned||0,r.uniqueCards||0,r.totalDurationMs||0
      ]);
    const lines = [
      ...summary.map(row => row.map(adminCsvCell).join(';')),
      '',
      playerHeader.map(adminCsvCell).join(';'),
      ...playerRows.map(row => row.map(adminCsvCell).join(';'))
    ];
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Argentinia_Estadisticas_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function reloadAdminStatistics() {
    if (statsLoading) return;
    statsLoading = true;
    const refresh = overlay.querySelector('#admin-stats-refresh');
    if (refresh) { refresh.disabled = true; refresh.textContent = gameText('admin.stats.loading'); }
    try {
      const [profilesRaw, sessions, publicRowsRaw, market, communityForStats] = await Promise.all([
        fetchAllUserProfiles(),
        fetchTelemetrySessionsForAdmin(),
        fetchPublicPlayerStats(),
        getTradeMarket().catch(error => {
          console.warn('Estadísticas: no se pudo cargar snapshot vivo del Mercado de Pases:', error);
          return null;
        }),
        adminGetCommunityDashboard().catch(()=>null)
      ]);
      const ambientUids=new Set(Array.isArray(communityForStats?.bots?.botUids)?communityForStats.bots.botUids.map(String):[]);
      const profiles=(Array.isArray(profilesRaw)?profilesRaw:[]).filter(row=>!ambientUids.has(String(row.uid||row.id||'')));
      const publicRows=(Array.isArray(publicRowsRaw)?publicRowsRaw:[]).filter(row=>!ambientUids.has(String(row.uid||row.id||'')));
      statsProfilesCache = profiles;
      statsSessionsCache = sessions;
      statsPublicRowsCache = publicRows;
      statsMarketCache = market;
      renderAdminStatistics(profiles, sessions, publicRows, market);
      statsLoaded = true;
    } catch (err) {
      console.error('No se pudieron cargar Estadísticas:', err);
      overlay.querySelector('#admin-stats-summary').textContent = gameText('admin.stats.error', { message:err?.message || err });
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
      btn.textContent = gameText('admin.stats.syncDone', { count:result.updated });
      await reloadAdminStatistics();
    } catch (err) {
      console.error('No se pudo sincronizar Ranking:', err);
      btn.textContent = gameText('admin.stats.syncError');
    } finally {
      setTimeout(() => { if (btn.isConnected) { btn.disabled = false; btn.textContent = gameText('admin.stats.sync'); } }, 1600);
    }
  }

  let economyAuditLoaded = false;
  let economyAuditLoading = false;
  let economyAuditRows = [];
  let economyAuditUsernames = {};
  let economySubtab = 'audit';
  let movementUsersLoaded = false;
  let movementUsers = [];
  let movementLoading = false;
  let movementData = null;

  function activateEconomySubtab(key) {
    economySubtab = key === 'movements' ? 'movements' : 'audit';
    overlay.querySelectorAll('[data-economy-subtab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.economySubtab===economySubtab));
    overlay.querySelectorAll('[data-economy-subpane]').forEach(pane=>pane.classList.toggle('hidden',pane.dataset.economySubpane!==economySubtab));
    if(economySubtab==='audit'&&!economyAuditLoaded) void reloadEconomyAudit();
    if(economySubtab==='movements') void ensureMovementUsers();
  }

  async function ensureMovementUsers() {
    if(movementUsersLoaded)return;
    const select=overlay.querySelector('#admin-movements-user');
    if(select)select.innerHTML=`<option value="">${escapeHtml(gameText('common.loading'))}</option>`;
    try{
      const rows=await fetchAllUserProfiles();
      movementUsers=(Array.isArray(rows)?rows:[]).sort((a,b)=>String(a.username||a.displayName||'').localeCompare(String(b.username||b.displayName||''),'es-AR'));
      if(select){
        select.innerHTML=movementUsers.map(u=>`<option value="${escapeHtml(u.uid)}">${escapeHtml(u.username||u.displayName||u.uid)}</option>`).join('');
        const potato=movementUsers.find(u=>String(u.username||'').toLocaleLowerCase('es-AR')==='potato');
        if(potato)select.value=potato.uid;
      }
      const today=new Date(),from=new Date(today.getTime()-30*86400000);
      const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const fromEl=overlay.querySelector('#admin-movements-from'),toEl=overlay.querySelector('#admin-movements-to');
      if(fromEl&&!fromEl.value)fromEl.value=iso(from); if(toEl&&!toEl.value)toEl.value=iso(today);
      movementUsersLoaded=true;
    }catch(err){
      if(select)select.innerHTML='';
      overlay.querySelector('#admin-movements-summary').textContent=gameText('admin.movements.error',{message:err?.message||err});
    }
  }

  function movementSigned(value){const n=Math.floor(Number(value)||0);return n===0?'—':`${n>0?'+':''}${n.toLocaleString('es-AR')}`;}
  function renderEconomyMovements(){
    const table=overlay.querySelector('#admin-movements-table'),cards=overlay.querySelector('#admin-movements-cards'),summary=overlay.querySelector('#admin-movements-summary');
    if(!table||!cards||!summary)return;
    if(!movementData){cards.innerHTML='';table.innerHTML=`<div class="admin-debug-empty">${gameTextHtml('admin.movements.empty')}</div>`;return;}
    const fromRaw=overlay.querySelector('#admin-movements-from')?.value||'',toRaw=overlay.querySelector('#admin-movements-to')?.value||'';
    const fromMs=fromRaw?new Date(`${fromRaw}T00:00:00`).getTime():0,toMs=toRaw?new Date(`${toRaw}T23:59:59.999`).getTime():Number.MAX_SAFE_INTEGER;
    const all=[...(movementData.events||[])].sort((a,b)=>auditTimestampMs(b.createdAt)-auditTimestampMs(a.createdAt));
    let points=Number(movementData.current?.points)||0,fichas=Number(movementData.current?.fichas)||0,packs=Number(movementData.current?.packs)||0,essence=Number(movementData.current?.essence)||0;
    const reconstructed=all.map(row=>{
      const after={points,fichas,packs,essence};
      points-=Number(row.pointsDelta)||0; fichas-=Number(row.fichasDelta)||0; packs-=Number(row.packsDelta)||0; essence-=Number(row.essenceDelta)||0;
      return {...row,_after:after,_ms:auditTimestampMs(row.createdAt)};
    });
    const rows=reconstructed.filter(row=>row._ms>=fromMs&&row._ms<=toMs);
    cards.innerHTML=[
      [gameText('admin.movements.currentPoints'),Number(movementData.current?.points||0).toLocaleString('es-AR')],
      [gameText('admin.movements.currentFichas'),Number(movementData.current?.fichas||0).toLocaleString('es-AR')],
      [gameText('admin.movements.currentPacks'),Number(movementData.current?.packs||0).toLocaleString('es-AR')],
      [gameText('admin.movements.currentEssence'),Number(movementData.current?.essence||0).toLocaleString('es-AR')]
    ].map(([label,value])=>`<div class="admin-stat-card"><div class="admin-stat-label">${escapeHtml(label)}</div><div class="admin-stat-value">${escapeHtml(value)}</div><div class="admin-stat-sub">${escapeHtml(movementData.username||movementData.uid)}</div></div>`).join('');
    const body=rows.map(row=>`<tr><td>${escapeHtml(new Date(row._ms).toLocaleString('es-AR'))}</td><td>${escapeHtml(economyAuditLabel({...row,auditKind:'economyEvent'}))}</td><td>${escapeHtml(movementSigned(row.pointsDelta))}</td><td><strong>${Number(row._after.points).toLocaleString('es-AR')}</strong></td><td>${escapeHtml(movementSigned(row.fichasDelta))}</td><td>${Number(row._after.fichas).toLocaleString('es-AR')}</td><td>${escapeHtml(movementSigned(row.packsDelta))}</td><td>${Number(row._after.packs).toLocaleString('es-AR')}</td><td>${escapeHtml(movementSigned(row.essenceDelta))}</td><td>${Number(row._after.essence).toLocaleString('es-AR')}</td><td><code>${escapeHtml(row.operationId||row.id||'—')}</code></td></tr>`).join('');
    table.innerHTML=`<table class="admin-debug-table"><thead><tr><th>${gameTextHtml('admin.movements.col.date')}</th><th>${gameTextHtml('admin.movements.col.operation')}</th><th>${gameTextHtml('admin.movements.col.deltaPoints')}</th><th>${gameTextHtml('admin.movements.col.balancePoints')}</th><th>${gameTextHtml('admin.movements.col.deltaFichas')}</th><th>${gameTextHtml('admin.movements.col.balanceFichas')}</th><th>${gameTextHtml('admin.movements.col.deltaPacks')}</th><th>${gameTextHtml('admin.movements.col.balancePacks')}</th><th>${gameTextHtml('admin.movements.col.deltaEssence')}</th><th>${gameTextHtml('admin.movements.col.balanceEssence')}</th><th>${gameTextHtml('admin.movements.col.evidence')}</th></tr></thead><tbody>${body||`<tr><td colspan="11">${gameTextHtml('admin.movements.empty')}</td></tr>`}</tbody></table>`;
    summary.textContent=`${movementData.username||movementData.uid} · ${rows.length} movimientos visibles · ${all.length} eventos cargados`;
  }

  async function reloadEconomyMovements(){
    if(movementLoading)return;
    await ensureMovementUsers();
    const uid=overlay.querySelector('#admin-movements-user')?.value||''; if(!uid)return;
    movementLoading=true; const btn=overlay.querySelector('#admin-movements-load'); if(btn){btn.disabled=true;btn.textContent=gameText('admin.movements.loading');}
    try{movementData=await fetchEconomyMovementsForAdmin({targetUid:uid});renderEconomyMovements();}
    catch(err){movementData=null;overlay.querySelector('#admin-movements-summary').textContent=gameText('admin.movements.error',{message:err?.message||err});renderEconomyMovements();}
    finally{movementLoading=false;if(btn){btn.disabled=false;btn.textContent=gameText('admin.movements.load');}}
  }

  function auditTimestampMs(value) {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const n = Date.parse(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  function economyAuditLabel(row) {
    if(row?.auditKind!=='adminAction'&&(row?.type==='trade.complete'||row?.source==='trade_market_complete_server')){
      return gameText('admin.audit.operation.tradeComplete');
    }
    if(row?.auditKind!=='adminAction'&&(row?.type==='store.purchase_emote'||row?.source==='emote_purchase_server')){
      return gameText('admin.audit.operation.emotePurchase');
    }
    return row.auditKind === 'adminAction'
      ? String(row.type || 'admin_action')
      : String(row.source || row.type || 'economy_event');
  }

  function economyAuditIdentityHtml(uid) {
    const value=String(uid||'').trim();
    if(!value||value==='server') return '<span>server</span>';
    const username=String(economyAuditUsernames[value]||'').trim();
    const tooltip=gameText('admin.audit.uidTooltip',{uid:value});
    return username
      ? `<span class="admin-audit-user" title="${escapeHtml(tooltip)}">${escapeHtml(username)}</span>`
      : `<code title="${escapeHtml(tooltip)}">${escapeHtml(value)}</code>`;
  }

  function renderEconomyAudit() {
    const kind = overlay.querySelector('#admin-economy-audit-kind')?.value || 'all';
    const term = String(overlay.querySelector('#admin-economy-audit-search')?.value || '').trim().toLowerCase();
    const rows = economyAuditRows.filter(row => {
      if (kind !== 'all' && row.auditKind !== kind) return false;
      if (!term) return true;
      const haystack = [row.id,row.auditKind,row.type,row.source,row.operationId,row.targetUid,row.actorUid,row.adminUid,row.kind,row.reason,row.bulkJobId,row.sessionId,row.metadata?.tradeId,row.metadata?.listingId,row.metadata?.offerId,row.metadata?.ownerUsername,row.metadata?.offererUsername,row.metadata?.ownerGaveCardId,row.metadata?.offererGaveCardId,economyAuditUsernames[row.targetUid],economyAuditUsernames[row.actorUid],economyAuditUsernames[row.adminUid]].map(v=>String(v||'')).join(' ').toLowerCase();
      return haystack.includes(term);
    });
    const totalPoints = rows.reduce((n,r)=>n+(Number(r.pointsDelta)||Number(r.appliedAmount && r.kind==='points' ? r.appliedAmount : 0)||0),0);
    const totalFichas = rows.reduce((n,r)=>n+(Number(r.fichasDelta)||Number(r.appliedAmount && r.kind==='fichas' ? r.appliedAmount : 0)||0),0);
    const totalPacks = rows.reduce((n,r)=>n+(Number(r.packsDelta)||Number(r.appliedAmount && r.kind==='standardPacks' ? r.appliedAmount : 0)||0),0);
    const totalEssence = rows.reduce((n,r)=>n+(Number(r.essenceDelta)||Number(r.appliedAmount && r.kind==='essence' ? r.appliedAmount : 0)||0),0);
    const adminCount = rows.filter(r=>r.auditKind==='adminAction').length;
    const cards = [
      [gameText('admin.audit.kpi.visible'), rows.length, gameText('admin.audit.kpi.loaded',{count:economyAuditRows.length})],
      [gameText('admin.audit.kpi.points'), `${totalPoints>=0?'+':''}${totalPoints.toLocaleString('es-AR')}`, gameText('admin.audit.kpi.filtered')],
      [gameText('admin.audit.kpi.fichas'), `${totalFichas>=0?'+':''}${totalFichas.toLocaleString('es-AR')}`, gameText('admin.audit.kpi.filtered')],
      [gameText('admin.audit.kpi.packs'), `${totalPacks>=0?'+':''}${totalPacks.toLocaleString('es-AR')}`, gameText('admin.audit.kpi.filtered')],
      [gameText('admin.audit.kpi.essence'), `${totalEssence>=0?'+':''}${totalEssence.toLocaleString('es-AR')}`, gameText('admin.audit.kpi.adminActions',{count:adminCount})]
    ];
    overlay.querySelector('#admin-economy-audit-cards').innerHTML = cards.map(([label,value,sub])=>`<div class="admin-stat-card"><div class="admin-stat-label">${escapeHtml(label)}</div><div class="admin-stat-value">${escapeHtml(value)}</div><div class="admin-stat-sub">${escapeHtml(sub)}</div></div>`).join('');
    const body = rows.map(row => {
      const ms=auditTimestampMs(row.createdAt), when=ms?new Date(ms).toLocaleString('es-AR'):'—';
      const target=String(row.targetUid||''), op=String(row.operationId||row.bulkJobId||row.sessionId||'—');
      const points=Number(row.pointsDelta)||Number(row.kind==='points'?row.appliedAmount:0)||0;
      const fichas=Number(row.fichasDelta)||Number(row.kind==='fichas'?row.appliedAmount:0)||0;
      const packs=Number(row.packsDelta)||Number(row.kind==='standardPacks'?row.appliedAmount:0)||0;
      const essence=Number(row.essenceDelta)||Number(row.kind==='essence'?row.appliedAmount:0)||0;
      const delta=(row.type==='trade.complete'||row.source==='trade_market_complete_server')
        ? gameText('admin.audit.delta.trade')
        : ([points?`P ${points>0?'+':''}${points}`:'',fichas?`F ${fichas>0?'+':''}${fichas}`:'',packs?`S ${packs>0?'+':''}${packs}`:'',essence?`E ${essence>0?'+':''}${essence}`:''].filter(Boolean).join(' · ')||'—');
      const actor=String(row.adminUid||row.actorUid||'server');
      const detail=escapeHtml(JSON.stringify(row, (_k,v)=>typeof v?.toDate==='function'?v.toDate().toISOString():v));
      return `<tr title="${detail}"><td>${escapeHtml(when)}</td><td><strong>${escapeHtml(row.auditKind==='adminAction'?'ADMIN':'ECON')}</strong></td><td>${escapeHtml(economyAuditLabel(row))}</td><td>${target?economyAuditIdentityHtml(target):'—'}</td><td>${escapeHtml(delta)}</td><td><code>${escapeHtml(op)}</code></td><td>${economyAuditIdentityHtml(actor)}</td></tr>`;
    }).join('');
    overlay.querySelector('#admin-economy-audit-table').innerHTML = `<table class="admin-debug-table"><thead><tr><th>${gameTextHtml('admin.audit.col.date')}</th><th>${gameTextHtml('admin.audit.col.class')}</th><th>${gameTextHtml('admin.audit.col.operation')}</th><th>${gameTextHtml('admin.audit.col.user')}</th><th>${gameTextHtml('admin.audit.col.delta')}</th><th>${gameTextHtml('admin.audit.col.operationId')}</th><th>${gameTextHtml('admin.audit.col.actor')}</th></tr></thead><tbody>${body||`<tr><td colspan="7">${escapeHtml(gameText('admin.audit.empty'))}</td></tr>`}</tbody></table>`;
    overlay.querySelector('#admin-economy-audit-summary').textContent = gameText('admin.audit.summary',{count:economyAuditRows.length});
  }

  async function reloadEconomyAudit() {
    if (economyAuditLoading) return;
    economyAuditLoading = true;
    const btn=overlay.querySelector('#admin-economy-audit-refresh');
    if(btn){btn.disabled=true;btn.textContent=gameText('admin.audit.loading');}
    try {
      const audit=await fetchEconomyAuditForAdmin({limitCount:250});
      economyAuditUsernames={...(audit?.usernames||{})};
      economyAuditRows=[...(audit?.economyEvents||[]),...(audit?.adminActions||[])].sort((a,b)=>auditTimestampMs(b.createdAt)-auditTimestampMs(a.createdAt));
      economyAuditLoaded=true;
      renderEconomyAudit();
      overlay.querySelector('#admin-economy-audit-export').disabled=false;
    } catch(err) {
      console.error('No se pudo cargar Auditoría Económica:',err);
      overlay.querySelector('#admin-economy-audit-summary').textContent=gameText('admin.audit.error',{message:err?.message||err});
    } finally {
      economyAuditLoading=false;
      if(btn){btn.disabled=false;btn.textContent=gameText('admin.audit.refresh');}
    }
  }

  let animationLabCleanup = null;
  let animationLabMounted = false;
  let adminEmotesPane = null;
  function ensureAdminEmotesPane() {
    if (adminEmotesPane) return adminEmotesPane;
    const root = overlay.querySelector('#admin-emotes-root');
    if (!root) return null;
    adminEmotesPane = mountAdminEmotesPane(root, {
      loadCatalog: async () => {
        const storefront = await fetchStorefrontAuthority();
        return storefront?.emotes || null;
      },
      saveCatalog: async items => {
        const catalog = await adminSetEmoteCatalog(items);
        if (catalog?.items) applyEmoteCatalogSnapshot(catalog);
        return catalog;
      },
      onApplied: catalog => { if(catalog?.items) applyEmoteCatalogSnapshot(catalog); }
    });
    return adminEmotesPane;
  }

  function ensureAdminAnimationLab() {
    if (animationLabMounted) return;
    const root = overlay.querySelector('#admin-animation-lab-root');
    if (!root) return;
    animationLabCleanup = mountAnimationLab(root);
    animationLabMounted = true;
  }


  let adminWorkshopMounted = false;
  let adminWorkshopLayout = normalizeWorkshopLayout(null);
  const adminWorkshopPreview = Object.fromEntries(WORKSHOP_MACHINE_IDS.map(id => [id, false]));
  let adminWorkshopEditingId = null;

  async function ensureAdminWorkshopPane() {
    if (adminWorkshopMounted) return;
    adminWorkshopMounted = true;
    injectWorkshopStyles();
    const canvas = overlay.querySelector('#admin-workshop-canvas');
    const bg = overlay.querySelector('#admin-workshop-bg');
    const machinesRoot = overlay.querySelector('#admin-workshop-machines');
    const controls = overlay.querySelector('#admin-workshop-preview-controls');
    const editorStatus = overlay.querySelector('#admin-workshop-editor-status');
    const settingsStatus = overlay.querySelector('#admin-workshop-settings-status');
    const layoutStatus = overlay.querySelector('#admin-workshop-layout-status');
    const settingsRoot = overlay.querySelector('#admin-workshop-machine-settings');
    if (!canvas || !bg || !machinesRoot || !controls || !settingsRoot) return;

    if (!document.getElementById('admin-workshop-styles')) {
      const style=document.createElement('style'); style.id='admin-workshop-styles'; style.textContent=`
        .admin-workshop-machine-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin:12px 0}
        .admin-workshop-setting-card{border:1px solid rgba(212,175,55,.24);border-radius:10px;padding:10px;background:rgba(0,0,0,.17)}
        .admin-workshop-setting-title{font-weight:800;color:#ecd783;margin-bottom:7px}
        .admin-workshop-preview-controls{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
        .admin-workshop-preview-check{display:flex;gap:6px;align-items:center;padding:6px 9px;border:1px solid rgba(212,175,55,.28);border-radius:8px;background:rgba(0,0,0,.18);font-size:12px}
        .admin-workshop-canvas-wrap{overflow:auto;max-width:100%;border:1px solid rgba(212,175,55,.36);background:#050505;overscroll-behavior:contain}
        .admin-workshop-canvas{position:relative;width:100%;min-width:760px;aspect-ratio:16/9;overflow:hidden;background:#050505}
        .admin-workshop-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;user-select:none;-webkit-user-drag:none;pointer-events:none}
        .admin-workshop-machine{position:absolute;transform:translate(-50%,-50%);z-index:3;cursor:default}
        .admin-workshop-machine.editing{cursor:grab;outline:2px dashed #ffe278;outline-offset:3px}
        .admin-workshop-machine.dragging{cursor:grabbing}
        .admin-workshop-machine img{display:block;width:100%;height:auto;pointer-events:none;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 5px 8px rgba(0,0,0,.7))}
        .admin-workshop-pencil{position:absolute;right:-12px;top:-12px;width:30px;height:30px;border-radius:50%;border:1px solid #d4af37;background:#17150e;color:#ffdf72;cursor:pointer;z-index:5;font-size:15px}
      `; document.head.appendChild(style);
    }

    const syncAdminWorkshopAspect = () => {
      if (bg.naturalWidth > 0 && bg.naturalHeight > 0) canvas.style.aspectRatio = `${bg.naturalWidth}/${bg.naturalHeight}`;
    };
    if (bg.complete) syncAdminWorkshopAspect();
    else bg.addEventListener('load', syncAdminWorkshopAspect, { once:true });

    let settings = { ...getDefaultGameConfig(), ...(await loadPublicGameConfigDocument('settings').catch(()=>null) || {}) };
    adminWorkshopLayout = normalizeWorkshopLayout(await loadPublicGameConfigDocument('workshop').catch(()=>null));
    overlay.querySelector('#admin-workshop-enabled').checked = settings.workshopEnabled !== false;
    overlay.querySelector('#admin-workshop-craft-fichas').value = Number(settings.fichasPerEnhancement ?? FICHAS_PER_ENHANCEMENT);
    overlay.querySelector('#admin-workshop-max-enhanced').value = Number(settings.maxEnhancedCardsPerDeck ?? MAX_ENHANCED_CARDS_PER_DECK);
    overlay.querySelector('#admin-workshop-essence-enabled').checked = settings.essenceConversionEnabled !== false;
    overlay.querySelector('#admin-workshop-essence-points').value = Number(settings.essenceConversionPoints ?? WORKSHOP_POLICY.essence.pointsPerUnit);
    overlay.querySelector('#admin-workshop-essence-fichas').value = Number(settings.essenceConversionFichas ?? WORKSHOP_POLICY.essence.fichasPerUnit);
    overlay.querySelector('#admin-workshop-essence-max').value = Number(settings.essenceConversionMaxPerOperation ?? WORKSHOP_POLICY.essence.maxPerOperation);
    overlay.querySelector('#admin-workshop-evolution-enabled').checked = settings.evolutionEnabled !== false;
    overlay.querySelector('#admin-workshop-max-evolved').value = Number(settings.maxEvolvedCardsPerDeck ?? MAX_EVOLVED_CARDS_PER_DECK);
    for(const stage of [1,2]){
      const policy=WORKSHOP_POLICY.evolution[`stage${stage}`];
      overlay.querySelector(`#admin-workshop-evo${stage}-points`).value=Number(settings[`evolutionStage${stage}Points`] ?? policy.points);
      overlay.querySelector(`#admin-workshop-evo${stage}-fichas`).value=Number(settings[`evolutionStage${stage}Fichas`] ?? policy.fichas);
      overlay.querySelector(`#admin-workshop-evo${stage}-essence`).value=Number(settings[`evolutionStage${stage}Essence`] ?? policy.essence);
      overlay.querySelector(`#admin-workshop-evo${stage}-copies`).value=Number(settings[`evolutionStage${stage}CopiesRequired`] ?? policy.copiesRequired);
    }
    overlay.querySelector('#admin-workshop-mixer-enabled').checked = settings.industrialMixerEnabled !== false;
    for(const [rarity,key,prefix] of [['Common','common','industrialMixerCommon'],['Uncommon','uncommon','industrialMixerUncommon'],['Rare','rare','industrialMixerRare']]){
      const policy=WORKSHOP_POLICY.mixer[rarity];
      overlay.querySelector(`#admin-workshop-mixer-${key}-points`).value=Number(settings[`${prefix}Points`] ?? policy.points);
      overlay.querySelector(`#admin-workshop-mixer-${key}-fichas`).value=Number(settings[`${prefix}Fichas`] ?? policy.fichas);
      overlay.querySelector(`#admin-workshop-mixer-${key}-essence`).value=Number(settings[`${prefix}Essence`] ?? policy.essence);
    }

    settingsRoot.innerHTML = WORKSHOP_MACHINE_IDS.map((id,index)=>{
      const n=index+1;
      return `<div class="admin-workshop-setting-card"><div class="admin-workshop-setting-title">${escapeHtml(gameText(`workshop.${id}.title`))}</div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.available')}</span><input type="checkbox" id="admin-workshop-${id}-available" ${settings[`workshopMachine${n}Available`]?'checked':''}></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.unlockPoints')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-${id}-points" value="${Math.max(0,Number(settings[`workshopMachine${n}UnlockPoints`]||0))}"></div>
        <div class="admin-field-row"><span class="admin-field-label">${gameTextHtml('admin.workshop.unlockFichas')}</span><input type="number" min="0" step="1" class="admin-field-input" id="admin-workshop-${id}-fichas" value="${Math.max(0,Number(settings[`workshopMachine${n}UnlockFichas`]||0))}"></div></div>`;
    }).join('');

    controls.innerHTML = WORKSHOP_MACHINE_IDS.map(id=>`<label class="admin-workshop-preview-check"><input type="checkbox" data-workshop-preview="${id}"> ${gameTextHtml('admin.workshop.previewUnlock')} · ${escapeHtml(gameText(`workshop.${id}.title`))}</label>`).join('');

    const syncCanvasRatio=()=>{ if(bg.naturalWidth&&bg.naturalHeight) canvas.style.aspectRatio=`${bg.naturalWidth}/${bg.naturalHeight}`; };
    if(bg.complete) syncCanvasRatio(); else bg.addEventListener('load',syncCanvasRatio,{once:true});
    bg.addEventListener('error',()=>{ if(editorStatus) editorStatus.textContent=gameText('admin.workshop.assetsMissing'); });

    function renderAdminWorkshopMachines(){
      machinesRoot.replaceChildren();
      for(const id of WORKSHOP_MACHINE_IDS){
        if(!adminWorkshopPreview[id]) continue;
        const item=adminWorkshopLayout.machines[id];
        const wrap=document.createElement('div'); wrap.className=`admin-workshop-machine${adminWorkshopEditingId===id?' editing':''}`; wrap.dataset.machineId=id;
        wrap.style.left=`${item.xPct}%`; wrap.style.top=`${item.yPct}%`; wrap.style.width=`${item.widthPct}%`;
        const img=document.createElement('img'); img.src=`./assets/images/ui/${workshopMachineAsset(id)}`; img.alt=gameText(`workshop.${id}.title`); img.onerror=()=>{ if(editorStatus) editorStatus.textContent=gameText('admin.workshop.assetsMissing'); };
        const pencil=document.createElement('button'); pencil.type='button'; pencil.className='admin-workshop-pencil'; pencil.title=gameText('admin.workshop.edit'); pencil.textContent='✎';
        pencil.addEventListener('click',e=>{e.stopPropagation(); adminWorkshopEditingId=adminWorkshopEditingId===id?null:id; renderAdminWorkshopMachines(); if(editorStatus) editorStatus.textContent=adminWorkshopEditingId?gameText('admin.workshop.selected',{machine:gameText(`workshop.${id}.title`)}):'';});
        wrap.append(img,pencil);
        if(adminWorkshopEditingId===id){
          let drag=null;
          wrap.addEventListener('pointerdown',e=>{ if(e.target.closest('.admin-workshop-pencil')) return; e.preventDefault(); wrap.setPointerCapture(e.pointerId); drag={x:e.clientX,y:e.clientY,startX:item.xPct,startY:item.yPct}; wrap.classList.add('dragging'); });
          wrap.addEventListener('pointermove',e=>{ if(!drag) return; const rect=canvas.getBoundingClientRect(); item.xPct=Math.max(-20,Math.min(120,drag.startX+(e.clientX-drag.x)/rect.width*100)); item.yPct=Math.max(-20,Math.min(120,drag.startY+(e.clientY-drag.y)/rect.height*100)); wrap.style.left=`${item.xPct}%`;wrap.style.top=`${item.yPct}%`; });
          const end=()=>{drag=null;wrap.classList.remove('dragging');}; wrap.addEventListener('pointerup',end); wrap.addEventListener('pointercancel',end);
          wrap.addEventListener('wheel',e=>{e.preventDefault(); const delta=e.deltaY<0?0.6:-0.6; item.widthPct=Math.max(2,Math.min(60,item.widthPct+delta)); wrap.style.width=`${item.widthPct}%`;},{passive:false});
        }
        machinesRoot.appendChild(wrap);
      }
    }
    controls.querySelectorAll('[data-workshop-preview]').forEach(input=>input.addEventListener('change',()=>{const id=input.dataset.workshopPreview;adminWorkshopPreview[id]=input.checked;if(!input.checked&&adminWorkshopEditingId===id)adminWorkshopEditingId=null;renderAdminWorkshopMachines();}));
    renderAdminWorkshopMachines();

    overlay.querySelector('#admin-workshop-save-layout')?.addEventListener('click',async event=>{
      if(layoutStatus) layoutStatus.textContent='';
      try {
        await withEconomyButtonPending(event.currentTarget, () => saveAdminGameConfigDocument('workshop',{ schemaVersion:1, machines:adminWorkshopLayout.machines }), {
          pendingLabel:gameText('admin.workshop.saving'), slowLabel:gameText('workshop.server.slow')
        });
        if(layoutStatus) layoutStatus.textContent=gameText('admin.workshop.layoutSaved');
      } catch(err){ if(layoutStatus) layoutStatus.textContent=gameText('admin.workshop.saveError',{message:err?.message||'Error'}); }
    });
    overlay.querySelector('#admin-workshop-save-settings')?.addEventListener('click',async event=>{
      if(settingsStatus) settingsStatus.textContent='';
      try{
        const merged={...settings,workshopEnabled:overlay.querySelector('#admin-workshop-enabled').checked,
          fichasPerEnhancement:Math.max(1,Math.floor(Number(overlay.querySelector('#admin-workshop-craft-fichas').value)||1)),
          maxEnhancedCardsPerDeck:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-max-enhanced').value)||0)),
          essenceConversionEnabled:overlay.querySelector('#admin-workshop-essence-enabled').checked,
          essenceConversionPoints:Math.max(1,Math.floor(Number(overlay.querySelector('#admin-workshop-essence-points').value)||1)),
          essenceConversionFichas:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-essence-fichas').value)||0)),
          essenceConversionMaxPerOperation:Math.min(100,Math.max(1,Math.floor(Number(overlay.querySelector('#admin-workshop-essence-max').value)||1))),
          evolutionEnabled:overlay.querySelector('#admin-workshop-evolution-enabled').checked,
          maxEvolvedCardsPerDeck:Math.min(20,Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-max-evolved').value)||0))),
          evolutionStage1Points:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-evo1-points').value)||0)),
          evolutionStage1Fichas:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-evo1-fichas').value)||0)),
          evolutionStage1Essence:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-evo1-essence').value)||0)),
          evolutionStage1CopiesRequired:Math.min(20,Math.max(1,Math.floor(Number(overlay.querySelector('#admin-workshop-evo1-copies').value)||1))),
          evolutionStage2Points:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-evo2-points').value)||0)),
          evolutionStage2Fichas:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-evo2-fichas').value)||0)),
          evolutionStage2Essence:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-evo2-essence').value)||0)),
          evolutionStage2CopiesRequired:Math.min(20,Math.max(1,Math.floor(Number(overlay.querySelector('#admin-workshop-evo2-copies').value)||1))),
          industrialMixerEnabled:overlay.querySelector('#admin-workshop-mixer-enabled').checked,
          industrialMixerCommonPoints:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-common-points').value)||0)),
          industrialMixerCommonFichas:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-common-fichas').value)||0)),
          industrialMixerCommonEssence:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-common-essence').value)||0)),
          industrialMixerUncommonPoints:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-uncommon-points').value)||0)),
          industrialMixerUncommonFichas:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-uncommon-fichas').value)||0)),
          industrialMixerUncommonEssence:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-uncommon-essence').value)||0)),
          industrialMixerRarePoints:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-rare-points').value)||0)),
          industrialMixerRareFichas:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-rare-fichas').value)||0)),
          industrialMixerRareEssence:Math.max(0,Math.floor(Number(overlay.querySelector('#admin-workshop-mixer-rare-essence').value)||0))};
        WORKSHOP_MACHINE_IDS.forEach((id,index)=>{const n=index+1;merged[`workshopMachine${n}Available`]=overlay.querySelector(`#admin-workshop-${id}-available`).checked;merged[`workshopMachine${n}UnlockPoints`]=Math.max(0,Math.floor(Number(overlay.querySelector(`#admin-workshop-${id}-points`).value)||0));merged[`workshopMachine${n}UnlockFichas`]=Math.max(0,Math.floor(Number(overlay.querySelector(`#admin-workshop-${id}-fichas`).value)||0));});
        await withEconomyButtonPending(event.currentTarget, () => saveGameConfig(merged), {
          pendingLabel:gameText('admin.workshop.saving'), slowLabel:gameText('workshop.server.slow')
        });
        settings=merged; applyGameConfig(merged); if(settingsStatus)settingsStatus.textContent=gameText('admin.workshop.settingsSaved');
      }catch(err){if(settingsStatus)settingsStatus.textContent=gameText('admin.workshop.saveError',{message:err?.message||'Error'});}
    });
  }


  let adminAchievementsMounted=false;
  let adminAchievementsConfig=normalizeAchievementsConfig({});
  async function ensureAdminAchievementsPane(){
    if(adminAchievementsMounted) return;
    adminAchievementsMounted=true;
    const table=overlay.querySelector('#admin-achievements-table'),enabledEl=overlay.querySelector('#admin-achievements-enabled'),saveBtn=overlay.querySelector('#admin-achievements-save'),status=overlay.querySelector('#admin-achievements-status');
    if(!table||!enabledEl||!saveBtn) return;
    try{adminAchievementsConfig=normalizeAchievementsConfig(await loadPublicGameConfigDocument('achievements')||{});}catch(err){console.warn('No se pudo cargar config de Logros; se usan defaults:',err);adminAchievementsConfig=normalizeAchievementsConfig({});}
    enabledEl.checked=adminAchievementsConfig.enabled!==false;
    const rows=[];
    for(const family of ACHIEVEMENT_FAMILIES){
      for(const tier of ACHIEVEMENT_TIERS){
        const id=achievementId(family.id,tier),row=adminAchievementsConfig.entries[id];
        rows.push(`<tr data-achievement-row="${escapeHtml(id)}"><td><input type="checkbox" data-achievement-field="enabled" ${row.enabled?'checked':''}></td><td><strong>${escapeHtml(achievementFamilyLabel(family.id))}</strong><div style="font-size:11px;color:#999">${escapeHtml(achievementMetricLabel(family.id))}</div></td><td>${ACHIEVEMENT_TIER_ICONS[tier]||'🏆'} ${escapeHtml(achievementTierLabel(tier))}</td><td><input type="number" min="1" step="1" class="admin-field-input" data-achievement-field="target" value="${row.target}" style="width:90px"></td><td><input type="number" min="0" step="1" class="admin-field-input" data-achievement-field="points" value="${row.points}" style="width:82px"></td><td><input type="number" min="0" step="1" class="admin-field-input" data-achievement-field="fichas" value="${row.fichas}" style="width:72px"></td><td><input type="number" min="0" step="1" class="admin-field-input" data-achievement-field="essence" value="${row.essence}" style="width:72px"></td></tr>`);
      }
    }
    table.innerHTML=`<table class="admin-debug-table"><thead><tr><th>${gameTextHtml('admin.achievements.col.enabled')}</th><th>${gameTextHtml('admin.achievements.col.achievement')}</th><th>${gameTextHtml('admin.achievements.col.trophy')}</th><th>${gameTextHtml('admin.achievements.target')}</th><th>${gameTextHtml('admin.achievements.points')}</th><th>${gameTextHtml('admin.achievements.fichas')}</th><th>${gameTextHtml('admin.achievements.essence')}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    saveBtn.addEventListener('click',async()=>{
      if(status)status.textContent='';
      const entries={...adminAchievementsConfig.entries};
      table.querySelectorAll('[data-achievement-row]').forEach(tr=>{const id=tr.dataset.achievementRow,base=entries[id];entries[id]={...base,enabled:tr.querySelector('[data-achievement-field="enabled"]').checked,target:Math.max(1,Math.floor(Number(tr.querySelector('[data-achievement-field="target"]').value)||1)),points:Math.max(0,Math.floor(Number(tr.querySelector('[data-achievement-field="points"]').value)||0)),fichas:Math.max(0,Math.floor(Number(tr.querySelector('[data-achievement-field="fichas"]').value)||0)),essence:Math.max(0,Math.floor(Number(tr.querySelector('[data-achievement-field="essence"]').value)||0))};});
      const payload={schemaVersion:1,enabled:enabledEl.checked,entries};
      try{await withEconomyButtonPending(saveBtn,()=>saveAdminGameConfigDocument('achievements',payload),{pendingLabel:gameText('admin.achievements.saving'),slowLabel:gameText('workshop.server.slow')});adminAchievementsConfig=normalizeAchievementsConfig(payload);if(status)status.textContent=gameText('admin.achievements.saved');}catch(err){if(status)status.textContent=gameText('admin.achievements.saveError',{message:err?.message||'Error'});}
    });
  }

  function activateAdminTab(key) {
    overlay.querySelectorAll('[data-admin-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.adminTab === key));
    overlay.querySelectorAll('[data-admin-pane]').forEach(pane => pane.classList.toggle('hidden', pane.dataset.adminPane !== key));
    if (key === 'texts' && !gameTextsAdminLoaded) {
      gameTextsAdminLoaded = true;
      void ensureGameTextsAdminPane().load();
    }
    if (key === 'messages') void ensureAdminMessageUsers();
    if (key === 'workshop') void ensureAdminWorkshopPane();
    if (key === 'achievements') void ensureAdminAchievementsPane();
    if (key === 'campaigns') ensureAdminCampaignsPane();
    if (key === 'stats' && !statsLoaded) reloadAdminStatistics();
    if (key === 'economyAudit') activateEconomySubtab(economySubtab);
    if (key === 'animations') ensureAdminAnimationLab();
    if (key === 'emotes') void ensureAdminEmotesPane()?.load();
    if (key === 'debug') {
      if (!debugLoaded) reloadTelemetryHistory();
      if (!imageAuditLoaded) reloadImageAudit(false);
    }
  }

  overlay.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateAdminTab(btn.dataset.adminTab));
  });
  overlay.querySelectorAll('[data-economy-subtab]').forEach(btn => {
    btn.addEventListener('click', () => activateEconomySubtab(btn.dataset.economySubtab));
  });
  overlay.querySelector('#admin-movements-load')?.addEventListener('click', reloadEconomyMovements);
  overlay.querySelector('#admin-movements-user')?.addEventListener('change', () => { movementData=null; renderEconomyMovements(); });
  overlay.querySelector('#admin-movements-from')?.addEventListener('change', renderEconomyMovements);
  overlay.querySelector('#admin-movements-to')?.addEventListener('change', renderEconomyMovements);
  overlay.querySelector('#admin-stats-refresh').addEventListener('click', reloadAdminStatistics);
  overlay.querySelector('#admin-stats-sync').addEventListener('click', syncAdminRanking);
  overlay.querySelector('#admin-stats-export').addEventListener('click', exportAdminStatisticsCsv);
  overlay.querySelector('#admin-economy-audit-refresh').addEventListener('click', reloadEconomyAudit);
  overlay.querySelector('#admin-economy-audit-kind').addEventListener('change', renderEconomyAudit);
  overlay.querySelector('#admin-economy-audit-search').addEventListener('input', renderEconomyAudit);
  overlay.querySelector('#admin-economy-audit-export').addEventListener('click', () => {
    if (!economyAuditRows.length) return;
    downloadAdminJson({ engineVersion: ENGINE_VERSION, exportedAt: new Date().toISOString(), rows: economyAuditRows }, `Argentinia_auditoria_economica_v${ENGINE_VERSION}.json`);
  });
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
    const evolutionMissing = Array.isArray(imageAudit.missingEvolutionImages) ? imageAudit.missingEvolutionImages : [];
    const tokenMissing = Array.isArray(imageAudit.missingTokenImages) ? imageAudit.missingTokenImages : [];
    const tokenUnassigned = Array.isArray(imageAudit.tokenEffectsWithoutImage) ? imageAudit.tokenEffectsWithoutImage : [];
    const tokenFiles = [...new Set(tokenMissing.map(entry => entry.image).filter(Boolean))].sort();
    const fronts = missing.filter(entry => entry?.face !== 'back');
    const backs = missing.filter(entry => entry?.face === 'back');
    const lines = [
      '[CARAS_FRONTALES_SIN_PNG]', ...fronts.map(entry => entry.image), '',
      '[CARAS_DFC_REVERSO_SIN_PNG]', ...backs.map(entry => `${entry.id} | ${entry.name} | ${entry.image}`), '',
      '[EVOLUCIONES_SIN_PNG]', ...evolutionMissing.map(entry => `${entry.baseId} | EVO${entry.stage} | ${entry.name} | ${entry.path}`), '',
      '[TOKENS_SIN_PNG]', ...tokenFiles, '',
      '[TOKENS_SIN_FILENAME]', ...tokenUnassigned.map(entry => `${entry.cardId} | ${entry.cardName} | ${entry.tokenName} | ${entry.path}`), ''
    ];
    downloadAdminText(lines.join('\n'), `Argentinia_imagenes_faltantes_v${ENGINE_VERSION}.txt`);
  });
  overlay.querySelector('#admin-image-download-json').addEventListener('click', () => {
    if (!imageAudit) return;
    downloadAdminJson(imageAudit, `Argentinia_auditoria_imagenes_v${ENGINE_VERSION}.json`);
  });

  const adminAnimationCheckbox = overlay.querySelector('#cfg-animations-enabled');
  const adminAnimationSlow = overlay.querySelector('#cfg-animation-speed-slow');
  const adminAnimationNormal = overlay.querySelector('#cfg-animation-speed-normal');
  const adminAnimationFast = overlay.querySelector('#cfg-animation-speed-fast');
  const adminAnimationError = overlay.querySelector('#admin-animation-error');
  const adminAnimationSuccess = overlay.querySelector('#admin-animation-success');
  const animationTuningSpeedInputs = [...overlay.querySelectorAll('[data-animation-tuning-speed]')];
  const animationTuningVolumeInputs = [...overlay.querySelectorAll('[data-animation-tuning-volume]')];
  const animationSfxMomentChecks = [...overlay.querySelectorAll('[data-animation-sfx-moment]')];
  const readAnimationMultiplier = (input, fallback) => {
    const n=Number(input?.value);
    return Number.isFinite(n) ? Math.max(.25,Math.min(3,Math.round(n*100)/100)) : fallback;
  };
  const readAnimationVolume = (input, fallback=1) => {
    const n=Number(input?.value);
    return Number.isFinite(n) ? Math.max(.25,Math.min(2,Math.round(n*100)/100)) : fallback;
  };
  animationSfxMomentChecks.forEach(check => check.addEventListener('change', () => {
    const key=check.dataset.animationSfxMoment;
    const peers=animationSfxMomentChecks.filter(candidate => candidate.dataset.animationSfxMoment===key);
    if (check.checked) peers.forEach(candidate => { if(candidate!==check) candidate.checked=false; });
    else if (!peers.some(candidate => candidate.checked)) check.checked=true;
  }));
  const readAnimationTunings = () => {
    const raw={};
    for (const def of animationTuningCatalog) {
      const speedInput=animationTuningSpeedInputs.find(input => input.dataset.animationTuningSpeed===def.key);
      const volumeInput=animationTuningVolumeInputs.find(input => input.dataset.animationTuningVolume===def.key);
      const checked=animationSfxMomentChecks.find(input => input.dataset.animationSfxMoment===def.key && input.checked);
      raw[def.key]={
        relativeSpeed:readAnimationMultiplier(speedInput,def.defaultRelativeSpeed || 1),
        relativeVolume:readAnimationVolume(volumeInput,1),
        sfxMoment:checked?.dataset.moment==='key' ? 'key' : 'start'
      };
    }
    return normalizeAnimationTunings(raw);
  };
  overlay.querySelector('#admin-animation-policy-save')?.addEventListener('click', async () => {
    adminAnimationError.textContent = '';
    adminAnimationSuccess.textContent = '';
    const enabled = !!adminAnimationCheckbox.checked;
    const speedMultipliers = {
      slow:readAnimationMultiplier(adminAnimationSlow,1.35),
      normal:readAnimationMultiplier(adminAnimationNormal,1),
      fast:readAnimationMultiplier(adminAnimationFast,.68)
    };
    const animationTunings = readAnimationTunings();
    if (!(speedMultipliers.slow >= speedMultipliers.normal && speedMultipliers.normal >= speedMultipliers.fast)) {
      adminAnimationError.textContent = 'La referencia debe mantener Lenta ≥ Normal ≥ Rápida.';
      return;
    }
    try {
      await saveAnimationPolicy({ enabled, speedMultipliers, animationTunings });
      applyServerAnimationPolicy({ enabled, speedMultipliers, animationTunings }, 'admin_local_commit');
      adminAnimationSlow.value=speedMultipliers.slow.toFixed(2);
      adminAnimationNormal.value=speedMultipliers.normal.toFixed(2);
      adminAnimationFast.value=speedMultipliers.fast.toFixed(2);
      adminAnimationSuccess.textContent = enabled
        ? `✅ Política guardada · Lenta ×${speedMultipliers.slow.toFixed(2)} · Normal ×${speedMultipliers.normal.toFixed(2)} · Rápida ×${speedMultipliers.fast.toFixed(2)} · ${animationTuningCatalog.length} animaciones ajustables.`
        : '✅ Kill switch aplicado: animaciones globales deshabilitadas. Las referencias quedaron guardadas.';
    } catch (err) {
      console.error('No se pudo guardar la política global de animaciones:', err);
      adminAnimationError.textContent = err?.message || 'No se pudo aplicar la política de animaciones.';
    }
  });
  const onAdminAnimationPolicyChanged = (event) => {
    const detail=event?.detail || getServerAnimationPolicy();
    if (document.activeElement !== adminAnimationCheckbox) adminAnimationCheckbox.checked = detail?.enabled !== false;
    const refs=detail?.speedMultipliers || {};
    if(document.activeElement!==adminAnimationSlow && Number.isFinite(Number(refs.slow))) adminAnimationSlow.value=Number(refs.slow).toFixed(2);
    if(document.activeElement!==adminAnimationNormal && Number.isFinite(Number(refs.normal))) adminAnimationNormal.value=Number(refs.normal).toFixed(2);
    if(document.activeElement!==adminAnimationFast && Number.isFinite(Number(refs.fast))) adminAnimationFast.value=Number(refs.fast).toFixed(2);
    const tunings=normalizeAnimationTunings(detail?.animationTunings || {});
    for (const def of animationTuningCatalog) {
      const tuning=tunings[def.key];
      const speedInput=animationTuningSpeedInputs.find(input => input.dataset.animationTuningSpeed===def.key);
      if(speedInput && document.activeElement!==speedInput) speedInput.value=Number(tuning.relativeSpeed || 1).toFixed(2);
      const volumeInput=animationTuningVolumeInputs.find(input => input.dataset.animationTuningVolume===def.key);
      if(volumeInput && document.activeElement!==volumeInput) volumeInput.value=Number(tuning.relativeVolume || 1).toFixed(2);
      animationSfxMomentChecks.filter(input => input.dataset.animationSfxMoment===def.key).forEach(input => {
        if(document.activeElement!==input) input.checked=input.dataset.moment===tuning.sfxMoment;
      });
    }
  };
  window.addEventListener('argentinia:animation-policy-changed', onAdminAnimationPolicyChanged);

  // HF23.1 — Moderación y usuarios sigue siendo lazy: abrir Admin no hace reads de perfiles,
  // Admission ni Community. Todo se carga recién al entrar en la solapa.
  const recipientSelect = overlay.querySelector('#grant-recipient');
  const communityBanSelect = overlay.querySelector('#admin-community-ban-user');
  const recipientSearchInput = overlay.querySelector('#grant-recipient-search');
  const recipientSearchResults = overlay.querySelector('#grant-recipient-results');
  const recipientSearchWrap = overlay.querySelector('#grant-recipient-search-wrap');
  const recipientSearchClear = overlay.querySelector('#grant-recipient-clear');
  const communityBanSearchInput = overlay.querySelector('#admin-community-ban-user-search');
  const communityBanSearchResults = overlay.querySelector('#admin-community-ban-user-results');
  const communityBanSearchWrap = overlay.querySelector('#admin-community-ban-user-search-wrap');
  const communityBanSearchClear = overlay.querySelector('#admin-community-ban-user-clear');
  const communityWordsEl = overlay.querySelector('#admin-community-words');
  const communitySummaryEl = overlay.querySelector('#admin-community-summary');
  const communityBansEl = overlay.querySelector('#admin-community-bans');
  const communityCasesEl = overlay.querySelector('#admin-community-cases');
  const communityCaseEditor = overlay.querySelector('#admin-community-case-editor');
  const communityCaseSelected = overlay.querySelector('#admin-community-case-selected');
  const communityCaseResponse = overlay.querySelector('#admin-community-case-response');
  let communityDashboard = { policy:{ blockedWords:[] }, bans:[], cases:[], bots:{config:{},botUids:[],profiles:[],runtime:{}} };
  let selectedCommunityCaseId = '';
  let messagesUsersLoaded = false;
  let messagesUsersLoading = false;
  let adminMessageProfiles = [];

  // HF23.3.16.2.19 — Autocomplete local sobre la carga admin lazy. Mantiene como autoridad
  // un UID explícitamente elegido; escribir texto jamás alcanza para aplicar un regalo/ban.
  // La lista visible se limita a 12 coincidencias aunque existan miles de perfiles.
  const normalizeAdminUserSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const adminUserDisplayLabel = profile => {
    const username = String(profile?.username || 'Sin username').trim() || 'Sin username';
    const email = String(profile?.email || '').trim();
    return email ? `${username} · ${email}` : username;
  };
  const adminUserSearchHaystack = profile => normalizeAdminUserSearch([profile?.username, profile?.usernameKey, profile?.email, profile?.uid].filter(Boolean).join(' '));
  function createAdminUserSearch({ input, hidden, results, wrap, clearButton, allowAll = false }) {
    if (!input || !hidden || !results || !wrap) return null;
    let renderedEntries = [];
    let activeIndex = -1;
    const close = () => { results.hidden = true; activeIndex = -1; };
    const markSelection = (uid, label) => {
      hidden.value = String(uid || '');
      hidden.dataset.label = String(label || '');
      input.value = String(label || '');
      input.classList.toggle('admin-user-search-selected', !!uid);
      wrap.classList.toggle('has-selection', !!uid);
      close();
    };
    const clearSelection = ({ focus = false } = {}) => {
      hidden.value = ''; delete hidden.dataset.label; input.value = '';
      input.classList.remove('admin-user-search-selected'); wrap.classList.remove('has-selection');
      close(); if (focus) { input.focus(); render(); }
    };
    const scoreProfile = (profile, q) => {
      if (!q) return 2;
      const fields = [profile?.username, profile?.usernameKey, profile?.email, profile?.uid].map(normalizeAdminUserSearch);
      if (fields.some(field => field && field.startsWith(q))) return 0;
      if (fields.some(field => field && field.includes(q))) return 1;
      return 99;
    };
    const render = () => {
      if (input.disabled) { close(); return; }
      const q = normalizeAdminUserSearch(input.value);
      const rows = adminMessageProfiles
        .map(profile => ({ profile, score:scoreProfile(profile,q) }))
        .filter(row => row.score < 99)
        .sort((a,b) => a.score-b.score || String(a.profile?.username||'').localeCompare(String(b.profile?.username||''),'es',{sensitivity:'base'}))
        .slice(0,12)
        .map(row => ({ kind:'user', uid:String(row.profile?.uid||''), profile:row.profile, label:adminUserDisplayLabel(row.profile) }))
        .filter(row => row.uid);
      const allLabel = 'Todos los usuarios';
      const allMatch = allowAll && (!q || normalizeAdminUserSearch(allLabel).includes(q) || normalizeAdminUserSearch('todos').includes(q));
      renderedEntries = allMatch ? [{ kind:'all', uid:'ALL', label:allLabel }, ...rows].slice(0,13) : rows;
      activeIndex = -1;
      if (!renderedEntries.length) {
        results.innerHTML = `<div class="admin-user-search-empty">${messagesUsersLoading ? 'Cargando usuarios…' : 'Sin coincidencias. Probá con username, email o UID.'}</div>`;
      } else {
        results.innerHTML = renderedEntries.map((entry,index) => {
          if (entry.kind === 'all') return `<button type="button" class="admin-user-search-result all-users" role="option" data-admin-user-result-index="${index}"><strong>Todos los usuarios</strong><span>Aplicar a todas las cuentas registradas</span></button>`;
          const profile = entry.profile || {};
          const username = escapeHtml(profile.username || 'Sin username');
          const email = profile.email ? escapeHtml(profile.email) : 'Sin email';
          const uid = escapeHtml(String(profile.uid || ''));
          return `<button type="button" class="admin-user-search-result" role="option" data-admin-user-result-index="${index}"><strong>${username}</strong><span>${email}</span><small>UID …${uid.slice(-10)}</small></button>`;
        }).join('');
      }
      results.hidden = false;
    };
    const chooseIndex = index => {
      const entry = renderedEntries[index];
      if (!entry) return;
      markSelection(entry.uid, entry.label);
    };
    const updateActive = next => {
      const buttons = [...results.querySelectorAll('[data-admin-user-result-index]')];
      if (!buttons.length) return;
      activeIndex = Math.max(0,Math.min(buttons.length-1,next));
      buttons.forEach((button,index) => button.classList.toggle('active',index===activeIndex));
      buttons[activeIndex]?.scrollIntoView?.({block:'nearest'});
    };
    input.addEventListener('focus', render);
    input.addEventListener('input', () => {
      // Cambiar un solo carácter invalida la selección anterior hasta elegir otra fila.
      hidden.value = ''; delete hidden.dataset.label; input.classList.remove('admin-user-search-selected'); wrap.classList.remove('has-selection');
      render();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); if (results.hidden) render(); updateActive(activeIndex < 0 ? 0 : activeIndex + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); if (results.hidden) render(); updateActive(activeIndex < 0 ? 0 : activeIndex - 1); }
      else if (event.key === 'Enter' && !results.hidden && activeIndex >= 0) { event.preventDefault(); chooseIndex(activeIndex); }
      else if (event.key === 'Escape') { close(); }
    });
    results.addEventListener('mousedown', event => event.preventDefault());
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-admin-user-result-index]');
      if (!button) return;
      chooseIndex(Number(button.dataset.adminUserResultIndex));
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    clearButton?.addEventListener('click', () => clearSelection({ focus:true }));
    return {
      render, clearSelection,
      setLoading(loading) {
        input.disabled = !!loading;
        input.placeholder = loading ? 'Cargando usuarios…' : 'Buscar username, email o UID…';
        if (loading) close(); else if (document.activeElement === input) render();
      },
      setError(message) { input.disabled=false; input.placeholder=String(message||'No se pudieron cargar usuarios'); close(); },
      selectedLabel() { return String(hidden.dataset.label || input.value || hidden.value || ''); }
    };
  }
  const grantUserSearch = createAdminUserSearch({ input:recipientSearchInput, hidden:recipientSelect, results:recipientSearchResults, wrap:recipientSearchWrap, clearButton:recipientSearchClear, allowAll:true });
  const banUserSearch = createAdminUserSearch({ input:communityBanSearchInput, hidden:communityBanSelect, results:communityBanSearchResults, wrap:communityBanSearchWrap, clearButton:communityBanSearchClear, allowAll:false });

  const formatBanUntil = ban => ban?.permanent ? 'Permanente' : (ban?.expiresAtMs ? new Date(ban.expiresAtMs).toLocaleString('es-AR') : '—');
  const minuteToTimeInput = value => { const n=Math.max(0,Math.min(1439,Math.floor(Number(value)||0))); return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; };
  const timeInputToMinute = value => { const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/); return m ? Math.max(0,Math.min(1439,Number(m[1])*60+Number(m[2]))) : 0; };
  function renderCommunityBotConfig() {
    const cfg=communityDashboard?.bots?.config || {};
    const enabled=overlay.querySelector('#admin-community-bots-enabled');
    if(enabled){enabled.dataset.enabled=cfg.enabled===true?'1':'0';enabled.textContent=cfg.enabled===true?'ENCENDIDOS':'APAGADOS';enabled.classList.toggle('active',cfg.enabled===true);}
    const defaults=['Toto del 92','Mora del Oeste','Nico del Pasaje','La Flaca de Barracas','El Gallego de Parque Patricios'];
    for(let i=0;i<5;i++){const el=overlay.querySelector(`#admin-community-bot-name-${i}`);if(el&&document.activeElement!==el)el.value=String(cfg.names?.[i]||defaults[i]);}
    const set=(id,v)=>{const el=overlay.querySelector(id);if(el&&document.activeElement!==el)el.value=String(v);};
    set('#admin-community-bots-online-max',cfg.visibleOnlineMax??2); set('#admin-community-bots-presence-slot',cfg.presenceSlotMinutes??20);
    set('#admin-community-bots-online-pct',cfg.onlineChancePct??58); set('#admin-community-bots-activity-min',cfg.activityIntervalMinutes??20);
    set('#admin-community-bots-games',cfg.simulatedGamesPerTick??1); set('#admin-community-bots-listings',cfg.maxListingsPerBot??2);
    set('#admin-community-bots-listing-life-min',cfg.listingLifetimeMinMinutes??90); set('#admin-community-bots-listing-life-max',cfg.listingLifetimeMaxMinutes??360);
    set('#admin-community-bots-accept-equal',cfg.acceptEqualPct??35); set('#admin-community-bots-accept-higher',cfg.acceptHigherPct??70);
    set('#admin-community-bots-reject-eligible',cfg.rejectEligiblePct??25); set('#admin-community-bots-reject-min',cfg.challengeRejectMinSeconds??5); set('#admin-community-bots-reject-max',cfg.challengeRejectMaxSeconds??13);
    set('#admin-community-bots-start',minuteToTimeInput(cfg.activeStartMinute??360)); set('#admin-community-bots-end',minuteToTimeInput(cfg.activeEndMinute??1410));
  }
  function renderCommunityAdminDashboard() {
    const words = Array.isArray(communityDashboard?.policy?.blockedWords) ? communityDashboard.policy.blockedWords : [];
    renderCommunityBotConfig();
    if (communityWordsEl && document.activeElement !== communityWordsEl) communityWordsEl.value = words.join('\n');
    const bans = Array.isArray(communityDashboard?.bans) ? communityDashboard.bans : [];
    const cases = Array.isArray(communityDashboard?.cases) ? communityDashboard.cases : [];
    const openCount = cases.filter(item => item.status !== 'resolved').length;
    if (communitySummaryEl) communitySummaryEl.innerHTML = `<b>${words.length}</b> palabras ADMIN · <b>${bans.length}</b> bans activos · <b>${openCount}</b> casos abiertos`;
    if (communityBansEl) communityBansEl.innerHTML = bans.length ? `<table class="admin-debug-table"><thead><tr><th>Usuario</th><th>Hasta</th><th>Motivo</th><th>Acción</th></tr></thead><tbody>${bans.map(ban => `<tr><td>${escapeHtml(ban.usernameSnapshot || ban.uid)}${ban.emailSnapshot ? `<br><small>${escapeHtml(ban.emailSnapshot)}</small>` : ''}<br><small>UID …${escapeHtml(String(ban.uid||'').slice(-10))}</small></td><td>${escapeHtml(formatBanUntil(ban))}</td><td>${escapeHtml(ban.reason || '—')}</td><td><button type="button" class="admin-save-btn" data-community-unban-uid="${escapeHtml(ban.uid || '')}" data-community-unban-label="${escapeHtml(ban.usernameSnapshot || ban.emailSnapshot || ban.uid || 'jugador')}" style="width:auto;min-width:110px;padding:6px 10px;margin:0;white-space:nowrap;">✅ Quitar ban</button></td></tr>`).join('')}</tbody></table>` : '<div class="admin-debug-empty">No hay bans activos.</div>';
    communityBansEl?.querySelectorAll?.('[data-community-unban-uid]').forEach(btn => btn.addEventListener('click', async () => {
      const targetUid = btn.dataset.communityUnbanUid || '';
      const label = btn.dataset.communityUnbanLabel || targetUid;
      const status = overlay.querySelector('#admin-community-ban-status');
      if (!targetUid) return;
      if (!window.confirm(`¿Levantar el ban activo de ${label}?`)) return;
      const reason = overlay.querySelector('#admin-community-ban-reason')?.value?.trim() || '';
      btn.disabled = true;
      if (status) status.textContent = `Quitando ban de ${label}…`;
      try {
        await adminUnbanCommunityUser(targetUid, reason);
        await reloadCommunityAdminDashboard();
        if (status) status.textContent = `✓ Ban removido de ${label}.`;
      } catch (err) {
        if (status) status.textContent = err?.message || `No se pudo quitar el ban de ${label}.`;
        btn.disabled = false;
      }
    }));
    if (communityCasesEl) communityCasesEl.innerHTML = cases.length ? `<table class="admin-debug-table"><thead><tr><th>Estado</th><th>Usuario</th><th>Tipo</th><th>Detalle</th><th></th></tr></thead><tbody>${cases.map(item => `<tr><td>${item.status==='resolved'?'✅ Resuelto':'🟡 Abierto'}</td><td>${escapeHtml(item.reporterUsername || item.reporterUid || 'Jugador')}</td><td>${escapeHtml(item.kind || '')}</td><td>${escapeHtml((item.subject || item.text || '').slice(0,120))}</td><td><button type="button" class="admin-save-btn" data-community-case-id="${escapeHtml(item.caseId || '')}" style="padding:5px 8px;">Ver</button></td></tr>`).join('')}</tbody></table>` : '<div class="admin-debug-empty">No hay casos.</div>';
    communityCasesEl?.querySelectorAll?.('[data-community-case-id]').forEach(btn => btn.addEventListener('click', () => {
      selectedCommunityCaseId = btn.dataset.communityCaseId || '';
      const item = cases.find(row => row.caseId === selectedCommunityCaseId);
      if (!item) return;
      communityCaseEditor?.classList.remove('hidden');
      if (communityCaseSelected) communityCaseSelected.innerHTML = `<b>${escapeHtml(item.reporterUsername || item.reporterUid || 'Jugador')}</b> · ${escapeHtml(item.kind || '')}<br>${escapeHtml(item.text || '')}${item.messageSnapshot?.text ? `<br><br><b>Mensaje reportado:</b> “${escapeHtml(item.messageSnapshot.text)}”` : ''}${item.response ? `<br><br><b>Respuesta actual:</b> ${escapeHtml(item.response)}` : ''}`;
      if (communityCaseResponse) communityCaseResponse.value = item.response || '';
    }));
  }

  async function reloadCommunityAdminDashboard() {
    communitySummaryEl.textContent = 'Cargando autoridad de Moderación…';
    communityDashboard = await adminGetCommunityDashboard();
    renderCommunityAdminDashboard();
    return communityDashboard;
  }

  async function ensureAdminMessageUsers(force = false) {
    if (messagesUsersLoaded && !force) return;
    if (messagesUsersLoading) return;
    messagesUsersLoading = true;
    grantUserSearch?.setLoading(true);
    banUserSearch?.setLoading(true);
    try {
      const [profiles] = await Promise.all([fetchAllUserProfiles(), ensureAdmissionStatusLoaded(force), reloadCommunityAdminDashboard()]);
      adminMessageProfiles = Array.isArray(profiles) ? profiles.filter(profile => profile?.uid) : [];
      messagesUsersLoaded = true;
      grantUserSearch?.setLoading(false);
      banUserSearch?.setLoading(false);
    } catch (err) {
      console.error('No se pudo cargar Moderación y usuarios:', err);
      adminMessageProfiles = [];
      grantUserSearch?.setError('No se pudieron cargar usuarios');
      banUserSearch?.setError('No se pudieron cargar usuarios');
      if (communitySummaryEl) communitySummaryEl.textContent = err?.message || 'No se pudo cargar Moderación.';
    } finally {
      messagesUsersLoading = false;
    }
  }

  overlay.querySelector('#admin-community-refresh')?.addEventListener('click', async () => {
    try { await ensureAdminMessageUsers(true); } catch {}
  });
  overlay.querySelector('#admin-community-words-save')?.addEventListener('click', async () => {
    const status = overlay.querySelector('#admin-community-words-status');
    status.textContent = '';
    const words = String(communityWordsEl?.value || '').split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean);
    try {
      const policy = await adminSetCommunityBlockedWords(words);
      communityDashboard.policy = policy;
      renderCommunityAdminDashboard();
      status.textContent = `✓ Lista guardada: ${policy.blockedWords?.length || 0} palabras adicionales.`;
    } catch (err) { status.textContent = err?.message || 'No se pudo guardar la lista.'; }
  });
  overlay.querySelector('#admin-community-bots-enabled')?.addEventListener('click', event => {
    const button=event.currentTarget; const next=button.dataset.enabled!=='1'; button.dataset.enabled=next?'1':'0'; button.textContent=next?'ENCENDIDOS':'APAGADOS'; button.classList.toggle('active',next);
  });
  overlay.querySelector('#admin-community-bots-save')?.addEventListener('click', async () => {
    const status=overlay.querySelector('#admin-community-bots-status'); if(status)status.textContent='';
    const enabled=overlay.querySelector('#admin-community-bots-enabled')?.dataset.enabled==='1';
    const num=(id,fallback)=>{const n=Number(overlay.querySelector(id)?.value);return Number.isFinite(n)?n:fallback;};
    const botConfig={
      enabled,
      names:[0,1,2,3,4].map(i=>String(overlay.querySelector(`#admin-community-bot-name-${i}`)?.value||'').trim()),
      visibleOnlineMax:num('#admin-community-bots-online-max',2),
      activeStartMinute:timeInputToMinute(overlay.querySelector('#admin-community-bots-start')?.value||'06:00'),
      activeEndMinute:timeInputToMinute(overlay.querySelector('#admin-community-bots-end')?.value||'23:30'),
      presenceSlotMinutes:num('#admin-community-bots-presence-slot',20), onlineChancePct:num('#admin-community-bots-online-pct',58),
      activityIntervalMinutes:num('#admin-community-bots-activity-min',20), simulatedGamesPerTick:num('#admin-community-bots-games',1),
      maxListingsPerBot:num('#admin-community-bots-listings',2),
      listingLifetimeMinMinutes:num('#admin-community-bots-listing-life-min',90), listingLifetimeMaxMinutes:num('#admin-community-bots-listing-life-max',360),
      acceptEqualPct:num('#admin-community-bots-accept-equal',35),
      acceptHigherPct:num('#admin-community-bots-accept-higher',70), rejectEligiblePct:num('#admin-community-bots-reject-eligible',25),
      challengeRejectMinSeconds:num('#admin-community-bots-reject-min',5), challengeRejectMaxSeconds:num('#admin-community-bots-reject-max',13)
    };
    try {
      const bots=await adminSetCommunityBots(botConfig); communityDashboard.bots=bots; renderCommunityAdminDashboard();
      if(status)status.textContent=`✓ Población ambiental ${bots?.config?.enabled?'encendida':'apagada'} · ${bots?.profiles?.length||5} perfiles del sistema.`;
    } catch(err){if(status)status.textContent=err?.message||'No se pudo guardar la población ambiental.';}
  });

  overlay.querySelector('#admin-community-ban-apply')?.addEventListener('click', async () => {
    const status = overlay.querySelector('#admin-community-ban-status'); status.textContent='';
    const targetUid = communityBanSelect?.value || '';
    const duration = overlay.querySelector('#admin-community-ban-duration')?.value || '';
    const reason = overlay.querySelector('#admin-community-ban-reason')?.value?.trim() || '';
    if (!targetUid || !reason) { status.textContent='Elegí jugador y escribí un motivo.'; return; }
    try { await adminBanCommunityUser(targetUid,duration,reason); await reloadCommunityAdminDashboard(); status.textContent='✓ Ban aplicado por UID.'; }
    catch(err){ status.textContent=err?.message||'No se pudo aplicar el ban.'; }
  });
  overlay.querySelector('#admin-community-case-resolve')?.addEventListener('click', async () => {
    const status = overlay.querySelector('#admin-community-case-status'); status.textContent='';
    const response = communityCaseResponse?.value?.trim() || '';
    if (!selectedCommunityCaseId || !response) { status.textContent='Seleccioná un caso y escribí una respuesta.'; return; }
    try { await adminResolveCommunityCase(selectedCommunityCaseId,response); selectedCommunityCaseId=''; communityCaseEditor?.classList.add('hidden'); await reloadCommunityAdminDashboard(); status.textContent='✓ Caso resuelto y respuesta guardada.'; }
    catch(err){ status.textContent=err?.message||'No se pudo resolver el caso.'; }
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
    const currencyLabel = currencyField === 'points' ? 'puntos' : currencyField === 'fichas' ? 'Fichas' : currencyField === 'essence' ? gameText('admin.gifts.essenceFuture') : currencyField === 'guaranteedMythics' ? gameText('admin.gifts.guaranteedMythic') : 'sobres';

    if (!Number.isInteger(amount) || amount === 0) {
      grantErrorBox.textContent = 'La cantidad tiene que ser un número entero distinto de cero.';
      return;
    }
    if ((currencyField === 'standardPacks' || currencyField === 'guaranteedMythics') && amount < 1) {
      grantErrorBox.textContent = gameText('admin.gifts.chestPositiveOnly');
      return;
    }
    if (!recipient) {
      grantErrorBox.textContent = 'Elegí a quién regalarle.';
      return;
    }

    const recipientLabel = recipient === 'ALL' ? 'TODOS los usuarios' : (grantUserSearch?.selectedLabel() || recipient);
    if (!window.confirm(`¿Confirmás dar ${amount} ${currencyLabel} a ${recipientLabel}?`)) return;

    const sendBtn = overlay.querySelector('#admin-grant-send');
    try {
      if (recipient === 'ALL') {
        const result = await withEconomyButtonPending(sendBtn, () => currencyField === 'standardPacks'
          ? adminGrantPacksToAll(amount, reason)
          : adminGrantCurrencyToAll(currencyField, amount, reason), { pendingLabel:gameText('admin.workshop.saving'), slowLabel:gameText('workshop.server.slow') });
        grantSuccessBox.textContent = `✅ Aplicado a ${result.succeeded}/${result.total} cuentas${result.failed > 0 ? ` (${result.failed} fallaron)` : ''}.`;
      } else {
        const newValue = await withEconomyButtonPending(sendBtn, () => currencyField === 'standardPacks'
          ? adminGrantPacks(recipient, amount, reason)
          : adminGrantCurrency(recipient, currencyField, amount, reason), { pendingLabel:gameText('admin.workshop.saving'), slowLabel:gameText('workshop.server.slow') });
        grantSuccessBox.textContent = `✅ Listo — esa cuenta ahora tiene ${newValue} ${currencyLabel}.`;
      }
    } catch (err) {
      console.error('No se pudo aplicar el regalo:', err);
      grantErrorBox.textContent = err.message || 'No se pudo aplicar. Probá de nuevo.';
    }
  });

  // 23.19.5 RC2 — Campañas lazy: mountAdminCampaignsPane() ejecuta su reload inicial,
  // por lo que no debe existir hasta que esa solapa sea solicitada.
  let campaignsAdminMounted = false;
  function ensureAdminCampaignsPane() {
    if (campaignsAdminMounted) return;
    const root = overlay.querySelector('#admin-campaigns-root');
    if (!root) return;
    campaignsAdminMounted = true;
    mountAdminCampaignsPane(root, { currentUser: state.currentUser });
  }

  overlay.querySelector('#admin-back').addEventListener('click', () => {
    window.removeEventListener('argentinia:animation-policy-changed', onAdminAnimationPolicyChanged);
    try { animationLabCleanup?.(); } catch {}
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
      fichasPerEnhancement: FICHAS_PER_ENHANCEMENT,
      classifiedsCommonPoints: readNumber('classifiedsCommonPoints'),
      classifiedsCommonFichas: readNumber('classifiedsCommonFichas'),
      classifiedsUncommonPoints: readNumber('classifiedsUncommonPoints'),
      classifiedsUncommonFichas: readNumber('classifiedsUncommonFichas'),
      classifiedsRarePoints: readNumber('classifiedsRarePoints'),
      classifiedsRareFichas: readNumber('classifiedsRareFichas'),
      classifiedsMythicPoints: readNumber('classifiedsMythicPoints'),
      classifiedsMythicFichas: readNumber('classifiedsMythicFichas'),
      classifiedsMythicChance: readNumber('classifiedsMythicChancePercent') / 100,
      classifiedBasicLandPackPrice: readNumber('classifiedBasicLandPackPrice'),
      classifiedBasicLandPackQuantity: readNumber('classifiedBasicLandPackQuantity'),
      deckSizeExact: readNumber('deckSizeExact'),
      maxCopiesPerCard: readNumber('maxCopiesPerCard'),
      maxEnhancedCardsPerDeck: MAX_ENHANCED_CARDS_PER_DECK,
      maxSavedDecks: readNumber('maxSavedDecks'),
      prebuiltDeckPoints: readNumber('prebuiltDeckPoints'),
      prebuiltDeckFichas: readNumber('prebuiltDeckFichas'),
      tradeMaxActiveListings: readNumber('tradeMaxActiveListings'),
      tradeMaxWantedCriteria: readNumber('tradeMaxWantedCriteria'),
      tradeMaxOffersPerListing: readNumber('tradeMaxOffersPerListing'),
      tradeMaxOutgoingOffers: readNumber('tradeMaxOutgoingOffers'),
      tradeMaxCompletedPerWeek: readNumber('tradeMaxCompletedPerWeek'),
      tournamentRewardedStartsPerDay: readNumber('tournamentRewardedStartsPerDay'),
      tournamentNpcRandomnessPercent: readNumber('tournamentNpcRandomnessPercent'),
      tournamentRound16Points: readNumber('tournamentRound16Points'),
      tournamentRound16LossPoints: readNumber('tournamentRound16LossPoints'),
      tournamentRound16Packs: readNumber('tournamentRound16Packs'),
      tournamentRound16Difficulty: overlay.querySelector('#cfg-tournamentRound16Difficulty')?.value || 'medium',
      tournamentRound16DeckQuality: overlay.querySelector('#cfg-tournamentRound16DeckQuality')?.value || 'good',
      tournamentQuarterPoints: readNumber('tournamentQuarterPoints'),
      tournamentQuarterLossPoints: readNumber('tournamentQuarterLossPoints'),
      tournamentQuarterPacks: readNumber('tournamentQuarterPacks'),
      tournamentQuarterDifficulty: overlay.querySelector('#cfg-tournamentQuarterDifficulty')?.value || 'medium',
      tournamentQuarterDeckQuality: overlay.querySelector('#cfg-tournamentQuarterDeckQuality')?.value || 'strong',
      tournamentSemiPoints: readNumber('tournamentSemiPoints'),
      tournamentSemiLossPoints: readNumber('tournamentSemiLossPoints'),
      tournamentSemiPacks: readNumber('tournamentSemiPacks'),
      tournamentSemiDifficulty: overlay.querySelector('#cfg-tournamentSemiDifficulty')?.value || 'hard',
      tournamentSemiDeckQuality: overlay.querySelector('#cfg-tournamentSemiDeckQuality')?.value || 'strong',
      tournamentFinalPoints: readNumber('tournamentFinalPoints'),
      tournamentFinalLossPoints: readNumber('tournamentFinalLossPoints'),
      tournamentFinalPacks: readNumber('tournamentFinalPacks'),
      tournamentFinalDifficulty: overlay.querySelector('#cfg-tournamentFinalDifficulty')?.value || 'hard',
      tournamentFinalDeckQuality: overlay.querySelector('#cfg-tournamentFinalDeckQuality')?.value || 'elite'
    };

    if (Object.values(newConfig).some(v => typeof v === 'number' && Number.isNaN(v))) {
      errorBox.textContent = 'Todos los campos tienen que ser números válidos.';
      return;
    }
    const pointIntegerFields = [
      newConfig.winVsTanoFacil, newConfig.winVsTanoMedio, newConfig.winVsTanoDificil,
      newConfig.lossVsTano, newConfig.winVsHumano, newConfig.lossVsHumano, newConfig.abandonPenalty
    ];
    const pointsAreValidIntegers = pointIntegerFields.every(value => Number.isInteger(value))
      && [newConfig.winVsTanoFacil, newConfig.winVsTanoMedio, newConfig.winVsTanoDificil,
          newConfig.lossVsTano, newConfig.winVsHumano, newConfig.lossVsHumano].every(value => value >= 0);
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
    const basicLandPackConfigValid = Number.isInteger(newConfig.classifiedBasicLandPackPrice) && newConfig.classifiedBasicLandPackPrice >= 0
      && Number.isInteger(newConfig.classifiedBasicLandPackQuantity) && newConfig.classifiedBasicLandPackQuantity >= 1 && newConfig.classifiedBasicLandPackQuantity <= 100;
    const tradeLimitsValid = Number.isInteger(newConfig.tradeMaxActiveListings) && newConfig.tradeMaxActiveListings >= 1 && newConfig.tradeMaxActiveListings <= 10
      && Number.isInteger(newConfig.tradeMaxWantedCriteria) && newConfig.tradeMaxWantedCriteria >= 1 && newConfig.tradeMaxWantedCriteria <= 3
      && Number.isInteger(newConfig.tradeMaxOffersPerListing) && newConfig.tradeMaxOffersPerListing >= 1 && newConfig.tradeMaxOffersPerListing <= 50
      && Number.isInteger(newConfig.tradeMaxOutgoingOffers) && newConfig.tradeMaxOutgoingOffers >= 1 && newConfig.tradeMaxOutgoingOffers <= 20
      && Number.isInteger(newConfig.tradeMaxCompletedPerWeek) && newConfig.tradeMaxCompletedPerWeek >= 1 && newConfig.tradeMaxCompletedPerWeek <= 20;
    const tournamentNumeric = [
      newConfig.tournamentRewardedStartsPerDay,newConfig.tournamentNpcRandomnessPercent,
      newConfig.tournamentRound16Points,newConfig.tournamentRound16LossPoints,newConfig.tournamentRound16Packs,newConfig.tournamentQuarterPoints,newConfig.tournamentQuarterLossPoints,newConfig.tournamentQuarterPacks,
      newConfig.tournamentSemiPoints,newConfig.tournamentSemiLossPoints,newConfig.tournamentSemiPacks,newConfig.tournamentFinalPoints,newConfig.tournamentFinalLossPoints,newConfig.tournamentFinalPacks
    ];
    const tournamentNumbersValid = tournamentNumeric.every(v => Number.isInteger(v) && v >= 0)
      && newConfig.tournamentNpcRandomnessPercent <= 100;
    const tournamentEnumsValid = ['Round16','Quarter','Semi','Final'].every(suffix =>
      ['easy','medium','hard'].includes(newConfig[`tournament${suffix}Difficulty`])
      && ['good','strong','elite'].includes(newConfig[`tournament${suffix}DeckQuality`])
    );
    if (newConfig.deckSizeExact <= 0 || newConfig.maxCopiesPerCard <= 0 || newConfig.maxSavedDecks <= 0
      || !Number.isInteger(newConfig.maxSavedDecks) || newConfig.prebuiltDeckPoints < 0 || newConfig.prebuiltDeckFichas < 0
      || !Number.isInteger(newConfig.prebuiltDeckPoints) || !Number.isInteger(newConfig.prebuiltDeckFichas)
      || newConfig.packCost < 0 || newConfig.fichasPerEnhancement <= 0 || !pointsAreValidIntegers
      || newConfig.pvpMinRewardMinutes < 0 || newConfig.pvpMinCompletedTurns < 0
      || newConfig.pvpMaxRewardedMatchesPerPairDaily < 0 || newConfig.pvpMaxPointsPerDay < 0 || !pvpIntegerFields
      || !classifiedsNonNegative || newConfig.classifiedsMythicChance < 0 || newConfig.classifiedsMythicChance > 1
      || !basicLandPackConfigValid || !tradeLimitsValid || !tournamentNumbersValid || !tournamentEnumsValid) {
      errorBox.textContent = 'Algún valor no tiene sentido (¿puntos/límites no enteros, negativo o porcentaje fuera de 0–100?). Revisá antes de guardar.';
      return;
    }

    const saveBtn = overlay.querySelector('#admin-save');
    saveBtn.disabled = true;
    try {
      await saveGameConfig(newConfig);
      applyGameConfig(newConfig);
      applyTournamentConfig(newConfig);
      // 23.13.25: la semana actual queda congelada; el scheduler Admin detecta el nuevo
      // fingerprint económico y republica únicamente semanas futuras con estos valores.
      await ensureClassifiedsSchedule();
      successBox.textContent = '✅ Guardado — Packs de Tierras: precio/cantidad activos ahora. Las 7 cartas de Clasificados conservan la semana actual y actualizan las futuras.';
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
      position: fixed; inset: 0; z-index: 9999; box-sizing:border-box;
      background: radial-gradient(ellipse at center, #16211a 0%, #0b130e 100%);
      display:flex; flex-direction:column; padding:24px 32px; color:#f0e0b0; overflow:hidden;
    }
    #multiplayer-overlay .mp-header { margin-bottom:14px; min-width:0; align-items:center; min-height:46px; }
    #multiplayer-overlay .encyclopedia-back-btn { height:44px; min-height:44px; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; margin:0; line-height:1; }
    #multiplayer-overlay .mydecks-title { line-height:44px; height:44px; display:flex; align-items:center; }
    #multiplayer-overlay .mydecks-title { flex:0 0 auto; }
    .mp-header-connect { margin-left:auto; min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; flex:0 1 auto; }
    .mp-header-divider { width:1px; height:30px; background:rgba(212,175,55,.25); margin:0 3px; flex:0 0 auto; }
    .mp-header-connect .store-buy-btn { margin:0; white-space:nowrap; padding:0 13px; height:44px; min-height:44px; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
    .mp-header-code.encyclopedia-search-input { flex:0 0 112px; width:112px; min-width:112px; max-width:112px; height:44px; box-sizing:border-box; margin:0; padding:0 10px; text-transform:uppercase; letter-spacing:1.4px; text-align:center; line-height:44px; }
    .mp-header-status { min-width:0; max-width:220px; color:#d9b86b; font-size:11px; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mp-waiting-code { display:inline-flex; align-items:center; gap:8px; min-width:0; }
    .mp-waiting-label { color:#9fb6a5; font-size:11px; white-space:nowrap; }
    .mp-waiting-value { color:#fff0b7; font-size:18px; font-weight:900; letter-spacing:3px; }
    .mp-header-mini-btn { border:1px solid rgba(212,175,55,.45); background:rgba(212,175,55,.10); color:#f0e0b0; border-radius:8px; padding:7px 9px; cursor:pointer; font-size:11px; font-weight:800; white-space:nowrap; }
    .mp-header-mini-btn:hover { background:rgba(212,175,55,.18); }
    .mp-header-mini-btn.danger { border-color:rgba(190,82,74,.58); color:#ffd0c9; background:rgba(130,45,39,.16); }

    .mp-body { flex:1; min-height:0; max-width:1680px; width:100%; margin:0 auto; overflow:hidden; }
    .mp-live-grid { display:grid; grid-template-columns:minmax(280px,1.04fr) minmax(250px,.90fr) minmax(320px,1.10fr); gap:14px; height:100%; min-height:0; }
    .mp-live-panel,.mp-section {
      background:rgba(18,25,15,.72); border:2px solid rgba(212,175,55,.28); border-radius:14px;
      box-shadow:0 10px 26px rgba(0,0,0,.2);
    }
    .mp-live-panel { min-height:0; overflow:hidden; display:flex; flex-direction:column; }
    .mp-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:48px; box-sizing:border-box; padding:10px 14px; border-bottom:1px solid rgba(212,175,55,.16); flex:0 0 auto; }
    .mp-panel-title { font-size:16px; font-weight:800; color:#f0e0b0; min-width:0; line-height:24px; display:flex; align-items:center; }
    .mp-panel-count { min-width:28px; height:24px; padding:0 8px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:rgba(212,175,55,.12); color:#d4af37; font-size:12px; font-weight:800; }
    .mp-player-search-wrap { padding:9px 10px 5px; flex:0 0 auto; }
    .mp-player-search-wrap .encyclopedia-search-input { width:100%; max-width:none; box-sizing:border-box; height:36px; }
    .mp-panel-list { padding:7px; min-height:0; flex:1 1 auto; overflow:auto; overscroll-behavior:contain; }
    .mp-player-row,.mp-match-row { display:flex; align-items:center; gap:9px; min-height:54px; box-sizing:border-box; padding:8px 9px; border-radius:10px; border:1px solid transparent; }
    .mp-player-row:hover,.mp-match-row:hover { background:rgba(255,255,255,.035); border-color:rgba(212,175,55,.12); }
    .mp-presence-dot { width:9px; height:9px; border-radius:50%; flex:0 0 auto; background:#536056; box-shadow:none; }
    .mp-player-row.is-online .mp-presence-dot { background:#52d273; box-shadow:0 0 9px rgba(82,210,115,.72); }
    .mp-player-copy,.mp-match-copy { min-width:0; flex:1; }
    .mp-player-name,.mp-chat-name { display:inline-block; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:14px; font-weight:800; color:#77867b; cursor:pointer; }
    .mp-player-row.is-online .mp-player-name { color:#fff; }
    .mp-player-status,.mp-match-meta { color:#91a498; font-size:11px; line-height:1.35; margin-top:2px; }
    .mp-player-row.is-available .mp-player-status { color:#8fd7a0; }
    .mp-challenge-btn { border:1px solid rgba(212,175,55,.45); background:rgba(212,175,55,.1); color:#d4af37; border-radius:8px; padding:6px 9px; font-size:10px; font-weight:900; letter-spacing:.5px; }
    .mp-challenge-btn:disabled { opacity:.38; cursor:not-allowed; }
    .mp-match-versus { color:#f0e0b0; font-size:14px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mp-inline-profile-btn{border:0;background:none;padding:0;color:inherit;font:inherit;font-weight:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(212,175,55,.35);text-underline-offset:2px}.mp-inline-profile-btn:hover,.mp-inline-profile-btn:focus-visible{color:#fff4c6;text-decoration-color:#d4af37;outline:none}
    .mp-live-empty { padding:26px 15px; color:#7e9084; text-align:center; font-size:12px; line-height:1.5; }

    .mp-chat-list { min-height:0; flex:1 1 auto; overflow:auto; overscroll-behavior:contain; padding:8px 10px; display:flex; flex-direction:column; gap:7px; }
    .mp-chat-row { min-width:0; box-sizing:border-box; padding:8px 9px; border-radius:9px; background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.035); line-height:1.35; overflow:hidden; flex:0 0 auto; flex-shrink:0; height:auto; }
    .mp-chat-row.is-own { background:rgba(212,175,55,.055); border-color:rgba(212,175,55,.12); }
    .mp-chat-meta { min-width:0; display:flex; align-items:center; gap:7px; margin-bottom:4px; }
    .mp-chat-name { color:#f0e0b0; margin:0; font-size:12px; flex:1 1 auto; min-width:0; }
    .mp-chat-meta-actions { flex:0 0 auto; display:inline-flex; align-items:center; gap:5px; }
    .mp-chat-text { display:block; min-width:0; max-width:100%; color:#cfe0d4; font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; line-break:anywhere; }
    .mp-chat-time { color:#607267; font-size:9px; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .mp-chat-delete { width:18px; height:18px; min-width:18px; border:0; border-radius:5px; padding:0; background:transparent; color:#a96d66; font-size:13px; line-height:18px; cursor:pointer; }
    .mp-chat-delete:hover { color:#ff9b8f; background:rgba(216,91,77,.12); }
    .mp-player-popover { position:fixed; z-index:10040; max-width:min(290px,calc(100vw - 20px)); padding:8px 10px; border-radius:8px; border:1px solid rgba(212,175,55,.52); background:rgba(8,15,10,.98); color:#f0e0b0; box-shadow:0 12px 32px rgba(0,0,0,.52); font-size:11px; line-height:1.4; pointer-events:auto; }
    .mp-player-popover strong { color:#fff0b7; }
    .mp-chat-compose { flex:0 0 auto; border-top:1px solid rgba(212,175,55,.14); padding:9px; background:rgba(0,0,0,.10); }
    .mp-chat-compose-row { display:flex; gap:7px; align-items:center; min-height:38px; }
    .mp-chat-compose .encyclopedia-search-input { flex:1; width:auto; min-width:0; max-width:none; height:38px; box-sizing:border-box; margin:0; }
    .mp-chat-send { height:38px !important; min-height:38px; margin:0 !important; padding:0 11px !important; display:inline-flex; align-items:center; justify-content:center; }
    .mp-chat-status { min-height:14px; padding-top:4px; color:#87998d; font-size:10px; line-height:1.25; }
    .mp-chat-status.error { color:#ff9b8f; }

    .mp-challenge-layer { position:absolute; inset:0; z-index:6; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(2,7,4,.72); backdrop-filter:blur(2px); }
    .mp-challenge-card { width:min(430px,92vw); background:linear-gradient(180deg,#17231a,#0d160f); border:2px solid rgba(212,175,55,.72); border-radius:16px; box-shadow:0 24px 70px rgba(0,0,0,.68); padding:24px; text-align:center; }
    .mp-challenge-kicker { color:#8fd7a0; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; margin-bottom:7px; }
    .mp-challenge-title { color:#f0e0b0; font-size:21px; font-weight:900; line-height:1.25; margin-bottom:8px; }
    .mp-challenge-copy { color:#aebfb3; font-size:12px; line-height:1.45; }
    .mp-challenge-countdown { margin:16px auto; width:66px; height:66px; border:2px solid #d4af37; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff0b7; font-size:26px; font-weight:900; font-variant-numeric:tabular-nums; background:rgba(212,175,55,.06); }
    .mp-challenge-actions { display:flex; justify-content:center; gap:10px; }
    .mp-challenge-actions .store-buy-btn,.mp-challenge-actions .store-back-link { margin:0; min-width:122px; }
    .mp-lobby-toast { position:absolute; right:22px; top:82px; z-index:7; max-width:min(420px,70vw); padding:10px 13px; border-radius:9px; border:1px solid rgba(212,175,55,.44); background:rgba(12,20,14,.96); color:#dce8df; box-shadow:0 10px 28px rgba(0,0,0,.35); font-size:12px; line-height:1.35; }
    .mp-lobby-toast.error { border-color:rgba(216,91,77,.55); color:#ffc0b8; }

    .mp-section { padding:18px; margin:0; text-align:center; }
    .mp-section-title { color:#f0e0b0; font-size:17px; font-weight:700; margin-bottom:7px; }
    .mp-section-desc { color:#aebfb3; font-size:12px; margin-bottom:13px; line-height:1.45; }
    .mp-code-row { display:flex; align-items:center; justify-content:center; gap:8px; margin:12px 0 18px; }
    .mp-code-display { font-size:36px; font-weight:800; letter-spacing:6px; color:#f0e0b0; background:rgba(0,0,0,.3); border:2px dashed rgba(212,175,55,.5); border-radius:10px; padding:13px 16px; }
    .mp-copy-btn { border:1px solid rgba(212,175,55,.5); background:rgba(212,175,55,.12); color:#f0e0b0; border-radius:8px; padding:9px 10px; cursor:pointer; font-size:12px; }
    .mp-copy-btn:hover { background:rgba(212,175,55,.2); }
    .mp-spinner { font-size:28px; margin-bottom:4px; animation:mp-pulse 1.4s ease-in-out infinite; }
    @keyframes mp-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

    @media (max-width:1180px) {
      #multiplayer-overlay { padding:16px 18px; }
      #multiplayer-overlay .mp-header { gap:10px; margin-bottom:10px; }
      #multiplayer-overlay .mydecks-title { font-size:22px; }
      .mp-header-connect { gap:6px; }
      .mp-header-connect .store-buy-btn { padding:7px 10px; font-size:11px; }
      .mp-header-code.encyclopedia-search-input { flex-basis:104px; width:104px; min-width:104px; max-width:104px; }
      .mp-live-grid { grid-template-columns:minmax(230px,1fr) minmax(220px,.9fr) minmax(270px,1.1fr); gap:10px; }
      .mp-panel-title { font-size:14px; }
    }
    @media (max-width:860px), (max-height:560px) {
      #multiplayer-overlay { padding:10px 12px; }
      #multiplayer-overlay .mydecks-header { margin-bottom:8px; gap:8px; flex-wrap:nowrap; }
      #multiplayer-overlay .mydecks-title { font-size:18px; white-space:nowrap; height:36px; line-height:36px; }
      #multiplayer-overlay .encyclopedia-back-btn { padding:0 10px; font-size:12px; white-space:nowrap; height:36px; min-height:36px; }
      .mp-header-divider { display:none; }
      .mp-header-connect { gap:5px; overflow:hidden; }
      .mp-header-connect .store-buy-btn { padding:0 8px; height:36px; min-height:36px; font-size:10px; }
      .mp-header-code.encyclopedia-search-input { flex:0 0 88px; width:88px; min-width:88px; max-width:88px; height:36px; padding:0 6px; font-size:10px; letter-spacing:.7px; line-height:36px; }
      .mp-header-status { display:none; }
      .mp-live-grid { grid-template-columns:repeat(3,minmax(235px,1fr)); gap:8px; overflow-x:auto; overflow-y:hidden; scroll-snap-type:x proximity; padding-bottom:2px; }
      .mp-live-panel { scroll-snap-align:start; }
      .mp-panel-head { padding:9px 10px 7px; }
      .mp-panel-title { font-size:13px; }
      .mp-player-search-wrap { padding:6px 7px 2px; }
      .mp-player-search-wrap .encyclopedia-search-input { height:31px; font-size:10px; }
      .mp-player-row,.mp-match-row { padding:7px; }
      .mp-player-name,.mp-match-versus { font-size:12px; }
      .mp-player-status,.mp-match-meta,.mp-chat-text { font-size:10px; }
      .mp-challenge-btn { padding:5px 7px; font-size:9px; }
      .mp-chat-compose { padding:6px; }
      .mp-chat-compose .encyclopedia-search-input { height:32px; font-size:10px; }
      .mp-chat-send { min-height:32px; padding:5px 8px !important; font-size:10px; }
    }
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
      border:0;background:none;padding:0;cursor:pointer;font-family:inherit;
      text-decoration:underline;text-decoration-color:rgba(212,175,55,.35);text-underline-offset:3px;
    }
    .mp-versus-name:hover,.mp-versus-name:focus-visible{color:#fff3c0;text-decoration-color:#d4af37;outline:none}
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

function multiplayerProfileBannerHTML(profile, roleLabel, fallbackName, uid='') {
  const username = String(profile?.username || profile?.displayName || '').trim() || fallbackName;
  const photoURL = String(profile?.photoURL || '').trim();
  const avatar = photoURL
    ? `<img class="mp-versus-avatar" src="${escapeHtml(photoURL)}" alt="${escapeHtml(username)}" onerror="this.outerHTML='<div class=&quot;mp-versus-avatar mp-versus-avatar-fallback&quot;>🤠</div>'">`
    : `<div class="mp-versus-avatar mp-versus-avatar-fallback">🤠</div>`;
  return `
    <div class="mp-versus-player">
      <div class="mp-versus-role">${escapeHtml(roleLabel)}</div>
      ${avatar}
      <button type="button" class="mp-versus-name" data-open-public-profile="${escapeHtml(String(uid||''))}" title="${gameTextHtml('publicProfile.view')}">${escapeHtml(username)}</button>
      <div class="mp-versus-elo" data-mp-elo-user="${escapeHtml(username)}">ELO …</div>
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
  injectMyDecksStyles();
  injectMultiplayerLobbyStyles();
  injectMultiplayerMatchBannerStyles();
  injectStoreStyles();
  injectEncyclopediaStyles();

  const overlay = document.createElement('div');
  overlay.id = 'multiplayer-overlay';
  overlay.innerHTML = `
    <div class="mydecks-header mp-header">
      <button class="encyclopedia-back-btn" id="mp-back">← ${gameTextHtml('common.back')}</button>
      <div class="mydecks-title">${gameTextHtml('multiplayer.title')}</div>
      <div class="mp-header-connect" id="mp-header-connect"></div>
    </div>
    <div class="mp-body" id="mp-body"></div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('#mp-body');
  const headerConnect = overlay.querySelector('#mp-header-connect');
  let roomUnsubscribe = null;
  let presenceUnsubscribe = null;
  let matchesUnsubscribe = null;
  let lobbyChatUnsubscribe = null;

  let challengeTicker = null;
  let refreshTimer = null;
  let publicStats = [];
  let presenceRows = [];
  let activeMatches = [];
  let lobbyChatEvents = [];
  let challengeRows = [];
  let previousChallengeStatus = new Map();

  let playerQuery = '';
  let waitingCode = '';
  let sendingLobbyChat = false;
  let challengeActionPending = false;
  let acceptedChallengeCode = '';
  let toastTimer = null;
  const ACTIVE_MATCH_STALE_MS = 20 * 60_000;
  const DIRECT_CHALLENGE_TTL_MS = 20_000;
  const LOBBY_CHAT_RETENTION_MS = 2 * 60 * 60_000;

  function stopRoomListener() { if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; } }
  function stopDirectoryListeners() {
    if (presenceUnsubscribe) { presenceUnsubscribe(); presenceUnsubscribe = null; }
    if (matchesUnsubscribe) { matchesUnsubscribe(); matchesUnsubscribe = null; }
    if (lobbyChatUnsubscribe) { lobbyChatUnsubscribe(); lobbyChatUnsubscribe = null; }

    if (challengeTicker) { clearInterval(challengeTicker); challengeTicker = null; }
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }
  function cleanup() { stopRoomListener(); stopDirectoryListeners(); window.removeEventListener('argentinia:direct-challenges-updated', onGlobalChallengeRows); closePlayerStatsPopover(); }
  function tsMs(value) { return presenceTimestampMs(value); }
  function formatElapsed(startValue) {
    const start = tsMs(startValue);
    if (!start) return '';
    const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const hours = Math.floor(total / 3600);
    const min = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return hours > 0 ? `${hours}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${min}:${String(sec).padStart(2,'0')}`;
  }
  function phaseLabel(raw) {
    const map = { upkeep:'Mantenimiento', draw:'Robo', main1:'Principal 1', combat_attackers:'Atacantes', combat_blockers:'Bloqueadores', combat_damage:'Daño', main2:'Principal 2', end:'Final' };
    return map[String(raw || '')] || '';
  }
  async function copyCode(code, button) {
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch {}
    if (!ok) {
      const input = document.createElement('textarea'); input.value = code; input.style.position='fixed'; input.style.opacity='0';
      document.body.appendChild(input); input.select();
      try { ok = document.execCommand('copy'); } catch {} input.remove();
    }
    if (button) {
      const old = button.textContent; button.textContent = ok ? gameText('multiplayer.lobby.copied') : gameText('multiplayer.lobby.copy').replace(/^📋\s*/, '');
      setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1300);
    }
  }
  function statsForUid(uid) {
    return publicStats.find(row => String(row.id || row.uid || '') === String(uid || '')) || {};
  }
  function playerHoverText(stats = {}) {
    const elo = Math.max(1, Math.floor(Number(stats.eloRating) || 1200));
    const games = Math.max(0, Math.floor(Number(stats.eloGames) || 0));
    const wins = Math.max(0, Math.floor(Number(stats.eloWins) || 0));
    const losses = Math.max(0, Math.floor(Number(stats.eloLosses) || 0));
    return `ELO ${elo}${games < 10 ? ' · provisional' : ''} · ${wins}V / ${losses}D · ${games} partida${games===1?'':'s'} ELO`;
  }

  let playerPopoverHideTimer = null;
  function closePlayerStatsPopover() {
    if (playerPopoverHideTimer) { clearTimeout(playerPopoverHideTimer); playerPopoverHideTimer = null; }
    document.querySelector('#mp-player-popover')?.remove();
  }
  function showPlayerStatsPopover(anchorEl) {
    const uid = String(anchorEl?.dataset?.playerUid || '');
    if (!anchorEl || !uid) return;
    closePlayerStatsPopover();
    const stats = statsForUid(uid);
    const pop = document.createElement('div');
    pop.id = 'mp-player-popover'; pop.className = 'mp-player-popover';
    const canReport = uid !== String(state.currentUser?.uid || '');
    pop.innerHTML = `<strong>${escapeHtml(anchorEl.dataset.playerName || 'Jugador')}</strong><br>${escapeHtml(playerHoverText(stats))}<br><button type="button" class="mp-header-mini-btn" data-open-public-profile="${escapeHtml(uid)}" style="margin-top:8px;width:auto;padding:5px 10px;">${gameTextHtml('publicProfile.view')}</button>${canReport ? `<br><button type="button" class="mp-chat-delete" data-report-player="${escapeHtml(uid)}" style="margin-top:8px;width:auto;padding:4px 8px;">⚑ Reportar jugador</button>` : ''}`;
    document.body.appendChild(pop);
    pop.querySelector('[data-open-public-profile]')?.addEventListener('click', event => {
      event.stopPropagation();
      closePlayerStatsPopover();
      showPublicPlayerProfile(uid);
    });
    pop.querySelector('[data-report-player]')?.addEventListener('click', event => {
      event.stopPropagation();
      const targetUid = event.currentTarget.dataset.reportPlayer || uid;
      const targetName = anchorEl.dataset.playerName || 'Jugador';
      closePlayerStatsPopover();
      showModerationComposer({ title:`Reportar a ${targetName}`, placeholder:'Explicá brevemente el motivo del reporte…', submitLabel:'REPORTAR', onSubmit:reason=>reportCommunityUser(targetUid,reason) });
    });
    const r = anchorEl.getBoundingClientRect(); const pr = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth-pr.width-8, r.left))}px`;
    const below = r.bottom + 7;
    pop.style.top = `${below + pr.height <= window.innerHeight-8 ? below : Math.max(8,r.top-pr.height-7)}px`;
    pop.addEventListener('pointerenter', () => { if (playerPopoverHideTimer) clearTimeout(playerPopoverHideTimer); });
    pop.addEventListener('pointerleave', () => { playerPopoverHideTimer=setTimeout(closePlayerStatsPopover,120); });
  }
  function bindPlayerStatsInteractions(scope) {
    const finePointer = !!globalThis.matchMedia?.('(hover:hover) and (pointer:fine)')?.matches;
    scope?.querySelectorAll?.('.mp-player-name[data-player-uid],.mp-chat-name[data-player-uid]').forEach(node => {
      node.setAttribute('tabindex','0'); node.setAttribute('role','button');
      node.style.touchAction = 'manipulation';
      // HF23 P0: Safari/iOS puede convertir title en un tooltip nativo que exige long-press.
      // En superficies táctiles quitamos title y usamos pointerup para un tap corto real.
      if (!finePointer) node.removeAttribute('title');
      let suppressSyntheticClickUntil = 0;
      const togglePopover = event => {
        event?.stopPropagation?.();
        if (document.querySelector('#mp-player-popover')) closePlayerStatsPopover();
        else showPlayerStatsPopover(node);
      };
      node.addEventListener('pointerup', event => {
        if (finePointer || !event.isPrimary || !['touch','pen'].includes(String(event.pointerType || ''))) return;
        event.preventDefault();
        suppressSyntheticClickUntil = Date.now() + 650;
        togglePopover(event);
      });
      node.addEventListener('click', event => {
        if (Date.now() < suppressSyntheticClickUntil) { event.preventDefault(); event.stopPropagation(); return; }
        togglePopover(event);
      });
      node.addEventListener('keydown', event => {
        if (!['Enter',' '].includes(event.key)) return;
        event.preventDefault();
        togglePopover(event);
      });
      if (finePointer) {
        node.addEventListener('focus', () => showPlayerStatsPopover(node));
        node.addEventListener('blur', () => { playerPopoverHideTimer=setTimeout(closePlayerStatsPopover,120); });
        node.addEventListener('pointerenter', () => showPlayerStatsPopover(node));
        node.addEventListener('pointerleave', () => { playerPopoverHideTimer=setTimeout(closePlayerStatsPopover,120); });
      }
    });
  }

  function challengeExpiryMs(challenge) { return tsMs(challenge?.expiresAt); }
  function livePendingChallenges() {
    const now = Date.now();
    return challengeRows.filter(row => row?.status === 'pending' && challengeExpiryMs(row) > now);
  }
  function pendingChallengeForMe() {
    const me = String(state.currentUser?.uid || '');
    return livePendingChallenges().find(row => Array.isArray(row.participants) && row.participants.includes(me)) || null;
  }
  function showLobbyToast(message, error = false) {
    overlay.querySelector('.mp-lobby-toast')?.remove();
    if (toastTimer) clearTimeout(toastTimer);
    const toast = document.createElement('div');
    toast.className = `mp-lobby-toast${error ? ' error' : ''}`;
    toast.textContent = String(message || '');
    overlay.appendChild(toast);
    toastTimer = setTimeout(() => { toast.remove(); toastTimer = null; }, 3600);
  }
  function challengeErrorMessage(error) {
    const code = String(error?.details?.code || error?.customData?.details?.code || error?.code || '');
    if (code.includes('TARGET_UNAVAILABLE')) return gameText('multiplayer.challenge.targetUnavailable');
    if (code.includes('INVITER_UNAVAILABLE')) return gameText('multiplayer.challenge.selfUnavailable');
    if (code.includes('TARGET_BUSY')) return gameText('multiplayer.challenge.targetBusy');
    if (code.includes('ALREADY_PENDING')) return gameText('multiplayer.challenge.alreadyPending');
    if (code.includes('PAIR_COOLDOWN') || code.includes('RATE_LIMIT')) return gameText('multiplayer.challenge.rateLimit');
    if (code.includes('COMMUNITY_BANNED')) return 'La cuenta tiene una restricción activa de Moderación.';
    if (code.includes('EXPIRED')) return gameText('multiplayer.challenge.expired');
    if (code.includes('ACTIVE_MATCH')) return gameText('multiplayer.challenge.activeMatch');
    return error?.message || gameText('multiplayer.challenge.error');
  }
  async function sendChallengeTo(targetUid, targetUsername) {
    if (challengeActionPending || pendingChallengeForMe() || waitingCode) return;
    challengeActionPending = true;
    renderPlayers();
    try {
      await createDirectChallenge(targetUid);
      showLobbyToast(gameText('multiplayer.challenge.sent', { player: targetUsername }));
    } catch (error) {
      console.warn('No se pudo enviar invitación multiplayer:', error);
      showLobbyToast(challengeErrorMessage(error), true);
    } finally {
      challengeActionPending = false;
      renderPlayers();
      refreshHeaderControls();
    }
  }
  async function actOnChallenge(challengeId, action) {
    if (challengeActionPending) return null;
    challengeActionPending = true;
    try {
      return await resolveDirectChallenge(challengeId, action);
    } catch (error) {
      console.warn(`No se pudo ${action} la invitación multiplayer:`, error);
      showLobbyToast(challengeErrorMessage(error), true);
      throw error;
    } finally {
      challengeActionPending = false;
      renderPlayers();
      refreshHeaderControls();
    }
  }
  function onGlobalChallengeRows(event) {
    challengeRows = Array.isArray(event?.detail?.rows) ? event.detail.rows : [];
    renderPlayers();
    refreshHeaderControls();
  }


  function renderPlayers() {
    const list = body.querySelector('#mp-player-list');
    const count = body.querySelector('#mp-online-count');
    if (!list) return;
    const now = Date.now();
    const presenceByUid = new Map(presenceRows.map(row => [String(row.uid), row]));
    const statsByUid = new Map(publicStats.map(row => [String(row.id || row.uid || ''), row]));
    const ids = new Set([...statsByUid.keys(), ...presenceByUid.keys()].filter(Boolean));
    const me = String(state.currentUser?.uid || '');
    const allRows = [...ids].filter(uid => uid !== me).map(uid => {
      const stats = statsByUid.get(uid) || {};
      const presence = presenceByUid.get(uid) || {};
      const online = isPresenceOnline(presence, now);
      const available = isPresenceAvailable(presence, now);
      const username = String(stats.username || 'Jugador');
      return { uid, stats, presence, online, available, username };
    }).sort((a,b) => {
      const score = r => r.online ? (r.available ? 0 : (r.presence?.availability === 'away' ? 2 : 1)) : 3;
      return score(a)-score(b) || a.username.localeCompare(b.username,'es',{sensitivity:'base'});
    });
    const onlineCount = allRows.filter(r => r.online).length;
    if (count) count.textContent = String(onlineCount);
    const query = playerQuery.trim().toLocaleLowerCase('es-AR');
    const rows = query ? allRows.filter(r => r.username.toLocaleLowerCase('es-AR').includes(query)) : allRows;
    if (!rows.length) {
      list.innerHTML = `<div class="mp-live-empty">${query ? gameTextHtml('multiplayer.lobby.playersNoSearchResults') : gameTextHtml('multiplayer.lobby.playersEmpty')}</div>`;
      return;
    }
    list.innerHTML = rows.map(row => {
      const status = describePresenceActivity(row.presence, now);
      const pending = pendingChallengeForMe();
      const outgoing = pending && String(pending.inviterUid || '') === me && String(pending.inviteeUid || '') === row.uid ? pending : null;
      const lobbyAvailable = row.available && ['menu','multiplayer_lobby'].includes(String(row.presence?.activity || ''));
      const canChallenge = lobbyAvailable && !pending && !waitingCode && !challengeActionPending;
      const remaining = outgoing ? Math.max(0, Math.ceil((challengeExpiryMs(outgoing)-now)/1000)) : 0;
      const buttonText = outgoing ? gameText('multiplayer.challenge.cancelCountdown',{seconds:remaining}) : gameText('multiplayer.lobby.challengeAction');
      const disabled = outgoing ? challengeActionPending : !canChallenge;
      const title = outgoing ? gameText('multiplayer.challenge.cancelTitle') : (lobbyAvailable ? gameText('multiplayer.challenge.inviteTitle') : gameText('multiplayer.lobby.unavailable'));
      return `<div class="mp-player-row ${row.online?'is-online':''} ${row.available?'is-available':''}" data-presence-uid="${escapeHtml(row.uid)}">
        <span class="mp-presence-dot" aria-hidden="true"></span>
        <div class="mp-player-copy">
          <span class="mp-player-name" data-player-uid="${escapeHtml(row.uid)}" data-player-name="${escapeHtml(row.username)}" title="${escapeHtml(playerHoverText(row.stats))}">${escapeHtml(row.username)}</span>
          <div class="mp-player-status">${escapeHtml(status)}</div>
        </div>
        <button class="mp-challenge-btn" type="button" data-challenge-uid="${escapeHtml(row.uid)}" data-challenge-name="${escapeHtml(row.username)}" ${disabled?'disabled':''} title="${escapeHtml(title)}">${escapeHtml(buttonText)}</button>
      </div>`;
    }).join('');
    bindPlayerStatsInteractions(list);
    list.querySelectorAll('[data-challenge-uid]').forEach(button => {
      button.addEventListener('click', () => {
        const targetUid = button.dataset.challengeUid || '';
        const targetName = button.dataset.challengeName || 'Jugador';
        const pending = pendingChallengeForMe();
        if (pending && String(pending.inviterUid || '') === me && String(pending.inviteeUid || '') === targetUid) {
          void actOnChallenge(pending.challengeId || pending.id, 'cancel').catch(()=>{});
          return;
        }
        void sendChallengeTo(targetUid, targetName);
      });
    });
  }

  function isFreshActiveMatch(match) {
    if (!match || match.status !== 'active' || !match.hostUid || !match.guestUid) return false;
    if (String(match.hostUid) === String(match.guestUid)) return false;
    if (match.gameOver === true || match.endedAt || match.abandonedBy) return false;
    const touched = tsMs(match.updatedAt || match.bothReadyAt || match.createdAt);
    if (!touched || Date.now() - touched > ACTIVE_MATCH_STALE_MS) return false;
    return true;
  }
  function renderMatches() {
    const list = body.querySelector('#mp-match-list');
    const count = body.querySelector('#mp-match-count');
    if (!list) return;
    const rows = activeMatches.filter(isFreshActiveMatch).sort((a,b) => tsMs(b.updatedAt)-tsMs(a.updatedAt));
    if (count) count.textContent = String(rows.length);
    if (!rows.length) {
      list.innerHTML = `<div class="mp-live-empty">${gameTextHtml('multiplayer.lobby.matchesEmpty')}</div>`;
      return;
    }
    list.innerHTML = rows.map(match => {
      const hp = match.players?.[match.hostUid] || {};
      const gp = match.players?.[match.guestUid] || {};
      const host = String(hp.username || hp.displayName || 'Host');
      const guest = String(gp.username || gp.displayName || 'Guest');
      const turn = Math.max(1, Math.floor(Number(match.turnCount) || 1));
      const phase = phaseLabel(match.phase);
      const elapsed = formatElapsed(match.bothReadyAt || match.createdAt);
      const meta = match.bothReadyAt
        ? `Turno ${turn}${phase?` · ${escapeHtml(phase)}`:''}${elapsed?` · ${escapeHtml(elapsed)}`:''}`
        : `${gameTextHtml('multiplayer.lobby.matchPreparing')}${elapsed?` · ${escapeHtml(elapsed)}`:''}`;
      return `<div class="mp-match-row"><div class="mp-match-copy">
        <div class="mp-match-versus"><button type="button" class="mp-inline-profile-btn" data-open-public-profile="${escapeHtml(String(match.hostUid||''))}">${escapeHtml(host)}</button> <span style="color:#8fa296">vs.</span> <button type="button" class="mp-inline-profile-btn" data-open-public-profile="${escapeHtml(String(match.guestUid||''))}">${escapeHtml(guest)}</button></div>
        <div class="mp-match-meta">${meta}</div>
      </div></div>`;
    }).join('');
    list.querySelectorAll('[data-open-public-profile]').forEach(btn=>btn.addEventListener('click',event=>{event.stopPropagation();const uid=btn.dataset.openPublicProfile||'';if(uid)showPublicPlayerProfile(uid);}));
  }

  function renderLobbyChat() {
    const list = body.querySelector('#mp-lobby-chat-list');
    if (!list) return;
    const cutoff = Date.now() - LOBBY_CHAT_RETENTION_MS;
    const events = [...lobbyChatEvents].filter(event => event?.type === 'chat' && event?.text && Math.max(0,Number(event.createdAtMs)||0) >= cutoff).sort((a,b) => Number(a.seq||0)-Number(b.seq||0));
    if (!events.length) { list.innerHTML = `<div class="mp-live-empty">${gameTextHtml('multiplayer.lobby.chatEmpty')}</div>`; return; }
    const me = String(state.currentUser?.uid || '');
    const admin = isAdminUser(state.currentUser);
    list.innerHTML = events.map(event => {
      const stats = statsForUid(event.uid); const timeMs = Math.max(0, Number(event.createdAtMs)||0);
      const time = timeMs ? new Date(timeMs).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
      const username = String(event.username || 'Jugador'); const seq = Math.floor(Number(event.seq)||0);
      const own = String(event.uid||'')===me;
      return `<div class="mp-chat-row ${own?'is-own':''}" data-chat-seq="${seq}">
        <div class="mp-chat-meta"><span class="mp-chat-name" data-player-uid="${escapeHtml(String(event.uid||''))}" data-player-name="${escapeHtml(username)}" title="${escapeHtml(playerHoverText(stats))}">${escapeHtml(username)}</span><span class="mp-chat-meta-actions">${time?`<span class="mp-chat-time">${escapeHtml(time)}</span>`:''}${!own?`<button class="mp-chat-delete" type="button" data-report-chat-seq="${seq}" title="Reportar mensaje" aria-label="Reportar mensaje">⚑</button>`:''}${admin?`<button class="mp-chat-delete" type="button" data-delete-chat-seq="${seq}" title="${gameTextHtml('multiplayer.lobby.chatDeleteTitle')}" aria-label="${gameTextHtml('multiplayer.lobby.chatDeleteTitle')}">×</button>`:''}</span></div>
        <div class="mp-chat-text">${escapeHtml(event.text || '')}</div>
      </div>`;
    }).join('');
    bindPlayerStatsInteractions(list);
    list.querySelectorAll('[data-delete-chat-seq]').forEach(button => button.addEventListener('click', async event => {
      event.stopPropagation(); const seq=Math.floor(Number(button.dataset.deleteChatSeq)||0); if(!seq||!isAdminUser(state.currentUser)) return;
      button.disabled=true; try { await deleteLobbyCommunication(seq); } catch(error) { console.warn('No se pudo moderar mensaje del Lobby:',error); showLobbyToast(error?.message||gameText('multiplayer.lobby.chatDeleteError'),true); button.disabled=false; }
    }));
    list.querySelectorAll('[data-report-chat-seq]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      const seq=Math.floor(Number(button.dataset.reportChatSeq)||0); if(!seq) return;
      showModerationComposer({ title:'Reportar mensaje del Lobby', placeholder:'Explicá brevemente por qué reportás este mensaje…', submitLabel:'REPORTAR', onSubmit:reason=>reportLobbyMessage(seq,reason) });
    }));
    list.scrollTop = list.scrollHeight;
  }

  function lobbyChatErrorMessage(error) {
    const code = String(error?.details?.code || error?.customData?.details?.code || error?.code || '');
    if (code.includes('LOBBY_CHAT_PROFANITY')) return gameText('multiplayer.lobby.chatProfanity');
    if (code.includes('LOBBY_CHAT_DUPLICATE')) return gameText('multiplayer.lobby.chatDuplicate');
    if (code.includes('LOBBY_CHAT_RATE_LIMIT')) return gameText('multiplayer.lobby.chatRateLimit');
    if (code.includes('MULTIPLAYER_CHAT_INVALID')) return gameText('multiplayer.social.maxChars',{count:220});
    if (code.includes('COMMUNITY_BANNED')) return 'Tu cuenta tiene una restricción activa. Podés contactar Moderación desde el menú principal.';
    return error?.message || gameText('multiplayer.lobby.chatSendError');
  }
  async function sendLobbyChatMessage() {
    const input = body.querySelector('#mp-lobby-chat-input');
    const send = body.querySelector('#mp-lobby-chat-send');
    const status = body.querySelector('#mp-lobby-chat-status');
    if (!input || sendingLobbyChat) return;
    const text = String(input.value || '').replace(/\s+/g,' ').trim();
    if (!text) return;
    if (text.length > 220) { if(status){status.textContent=gameText('multiplayer.social.maxChars',{count:220});status.className='mp-chat-status error';} return; }
    sendingLobbyChat = true;
    if (send) send.disabled = true;
    if (status) { status.textContent=''; status.className='mp-chat-status'; }
    try {
      await sendLobbyCommunication(text);
      input.value = '';
      if (status) status.textContent = gameText('multiplayer.lobby.chatSent');
    } catch (error) {
      console.warn('No se pudo enviar mensaje al chat del Lobby:', error);
      if (status) { status.textContent = lobbyChatErrorMessage(error); status.className='mp-chat-status error'; }
    } finally {
      sendingLobbyChat = false;
      if (send?.isConnected) send.disabled = false;
      input?.focus?.();
    }
  }
  function bindLobbyPanelControls() {
    const search = body.querySelector('#mp-player-search');
    if (search) {
      search.value = playerQuery;
      search.addEventListener('input', () => { playerQuery = search.value; renderPlayers(); });
    }
    const input = body.querySelector('#mp-lobby-chat-input');
    const send = body.querySelector('#mp-lobby-chat-send');
    if (input) {
      input.maxLength = 220;
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendLobbyChatMessage(); }
      });
    }
    if (send) send.addEventListener('click', () => void sendLobbyChatMessage());
  }

  function refreshHeaderControls() {
    const pending = pendingChallengeForMe();
    const disabled = !!pending || challengeActionPending || !!waitingCode;
    const createBtn = headerConnect.querySelector('#mp-create');
    const joinBtn = headerConnect.querySelector('#mp-join');
    const input = headerConnect.querySelector('#mp-code-input');
    if (createBtn) createBtn.disabled = disabled;
    if (joinBtn) joinBtn.disabled = disabled;
    if (input) input.disabled = disabled;
  }

  function setHeaderStatus(message = '', error = false) {
    const el = headerConnect.querySelector('#mp-header-status');
    if (!el) return;
    el.textContent = String(message || '');
    el.style.color = error ? '#ff9b8f' : '#d9b86b';
  }
  function renderHeaderHome() {
    waitingCode = '';
    headerConnect.innerHTML = `
      <button class="store-buy-btn" id="mp-create">${gameTextHtml('multiplayer.create.action')}</button>
      <span class="mp-header-divider" aria-hidden="true"></span>
      <input type="text" class="encyclopedia-search-input mp-header-code" id="mp-code-input" placeholder="${gameTextHtml('multiplayer.join.placeholder')}" maxlength="6" autocomplete="off" spellcheck="false">
      <button class="store-buy-btn" id="mp-join">${gameTextHtml('multiplayer.join.action')}</button>
      <span class="mp-header-status" id="mp-header-status"></span>`;
    const createBtn = headerConnect.querySelector('#mp-create');
    const joinBtn = headerConnect.querySelector('#mp-join');
    const input = headerConnect.querySelector('#mp-code-input');
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true; joinBtn.disabled = true; setHeaderStatus('');
      try {
        const match = await createMatch(state.currentUser.uid, state.currentUser);
        beginWaitingRoom(match.code);
      } catch (err) {
        console.error('No se pudo crear la partida:', err);
        setHeaderStatus(err.message || gameText('multiplayer.create.error'), true);
        createBtn.disabled = false; joinBtn.disabled = false;
      }
    });
    const join = async () => {
      const code = String(input.value || '').trim().toUpperCase();
      if (!code) { setHeaderStatus(gameText('multiplayer.join.empty'), true); return; }
      createBtn.disabled = true; joinBtn.disabled = true; setHeaderStatus('');
      try { const match = await joinMatchByCode(state.currentUser.uid, code, state.currentUser); renderMatched(match); }
      catch (err) {
        console.error('No se pudo unir a la partida:', err);
        setHeaderStatus(err.message || gameText('multiplayer.join.error'), true);
        createBtn.disabled = false; joinBtn.disabled = false;
      }
    };
    joinBtn.addEventListener('click', () => void join());
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void join(); } });
    refreshHeaderControls();
  }
  function beginWaitingRoom(code) {
    stopRoomListener();
    waitingCode = String(code || '').trim().toUpperCase();
    setPlayerPresenceActivity('multiplayer_lobby', { availability:'busy' });
    headerConnect.innerHTML = `<div class="mp-waiting-code">
      <span class="mp-waiting-label">${gameTextHtml('multiplayer.waiting.title')}</span>
      <span class="mp-waiting-value">${escapeHtml(waitingCode)}</span>
      <button class="mp-header-mini-btn" id="mp-copy-code" type="button">${gameTextHtml('multiplayer.lobby.copy')}</button>
      <button class="mp-header-mini-btn danger" id="mp-cancel-room" type="button">${gameTextHtml('common.cancel')}</button>
    </div>`;
    headerConnect.querySelector('#mp-copy-code').addEventListener('click', event => void copyCode(waitingCode, event.currentTarget));
    headerConnect.querySelector('#mp-cancel-room').addEventListener('click', async () => {
      const codeToCancel = waitingCode;
      stopRoomListener(); waitingCode='';
      try { await cancelMatch(codeToCancel, state.currentUser?.uid || null); } catch (err) { console.error('No se pudo cancelar la partida:', err); }
      setPlayerPresenceActivity('multiplayer_lobby', { availability:'available' });
      renderHeaderHome();
    });
    roomUnsubscribe = listenToMatch(waitingCode, data => {
      if (!data) { stopRoomListener(); setPlayerPresenceActivity('multiplayer_lobby',{availability:'available'}); renderHeaderHome(); return; }
      if (data.status === 'active' && data.guestUid) renderMatched({ code:waitingCode, ...data });
    });
  }

  overlay.querySelector('#mp-back').addEventListener('click', async () => {
    const codeToCancel = waitingCode;
    cleanup();
    if (codeToCancel) { try { await cancelMatch(codeToCancel, state.currentUser?.uid || null); } catch {} }
    setPlayerPresenceActivity('menu', { availability:'available' });
    overlay.remove();
    onBack();
  });

  function startDirectoryListeners() {
    stopDirectoryListeners();
    // HF23.3: social activity is advanced opportunistically while somebody is actually using
    // the Lobby. The response carries no system-player metadata; presence arrives through the
    // exact same playerPresence listener as every other connected profile.
    void refreshLobbyDirectoryAuthority().catch(error => console.warn('No se pudo refrescar el directorio del Lobby:', error));
    void fetchPublicPlayerStats().then(rows => {
      publicStats = Array.isArray(rows) ? rows : [];
      renderPlayers(); renderLobbyChat();
    }).catch(error => {
      console.warn('No se pudo cargar ranking para el Lobby Multiplayer:', error);
      publicStats = [];
      renderPlayers(); renderLobbyChat();
    });
    presenceUnsubscribe = listenToPlayerPresence(rows => { presenceRows = Array.isArray(rows) ? rows : []; renderPlayers(); }, error => {
      console.warn('No se pudo escuchar presencia de jugadores:', error);
    });
    matchesUnsubscribe = listenToActiveMultiplayerMatches(rows => { activeMatches = Array.isArray(rows) ? rows : []; renderMatches(); }, error => {
      console.warn('No se pudieron escuchar partidas activas:', error);
    });
    lobbyChatUnsubscribe = listenToLobbyCommunication(rows => { lobbyChatEvents = Array.isArray(rows) ? rows : []; renderLobbyChat(); }, error => {
      console.warn('No se pudo escuchar chat del Lobby:', error);
      const status=body.querySelector('#mp-lobby-chat-status'); if(status){status.textContent=gameText('multiplayer.lobby.chatDisconnected');status.className='mp-chat-status error';}
    });
    window.addEventListener('argentinia:direct-challenges-updated', onGlobalChallengeRows);
    challengeRows = Array.isArray(globalThis.__ARGENTINIA_DIRECT_CHALLENGES__) ? globalThis.__ARGENTINIA_DIRECT_CHALLENGES__ : [];
    challengeTicker = setInterval(() => renderPlayers(), 500);
    refreshTimer = setInterval(() => {
      void refreshLobbyDirectoryAuthority().catch(()=>{});
      renderPlayers(); renderMatches();
    }, 30_000);
  }

  function renderHome() {
    stopRoomListener();
    setPlayerPresenceActivity('multiplayer_lobby', { availability:'available' });
    body.innerHTML = `
      <div class="mp-live-grid">
        <section class="mp-live-panel">
          <div class="mp-panel-head"><div class="mp-panel-title">${gameTextHtml('multiplayer.lobby.players')}</div><span class="mp-panel-count" id="mp-online-count">0</span></div>
          <div class="mp-player-search-wrap"><input type="search" class="encyclopedia-search-input" id="mp-player-search" placeholder="${gameTextHtml('multiplayer.lobby.playerSearch')}" autocomplete="off"></div>
          <div class="mp-panel-list" id="mp-player-list"><div class="mp-live-empty">${gameTextHtml('multiplayer.lobby.playersLoading')}</div></div>
        </section>
        <section class="mp-live-panel">
          <div class="mp-panel-head"><div class="mp-panel-title">${gameTextHtml('multiplayer.lobby.matches')}</div><span class="mp-panel-count" id="mp-match-count">0</span></div>
          <div class="mp-panel-list" id="mp-match-list"><div class="mp-live-empty">${gameTextHtml('multiplayer.lobby.matchesLoading')}</div></div>
        </section>
        <section class="mp-live-panel">
          <div class="mp-panel-head"><div class="mp-panel-title">${gameTextHtml('multiplayer.lobby.chatTitle')}</div><span class="mp-panel-count">💬</span></div>
          <div class="mp-chat-list" id="mp-lobby-chat-list"><div class="mp-live-empty">${gameTextHtml('multiplayer.lobby.chatLoading')}</div></div>
          <div class="mp-chat-compose">
            <div class="mp-chat-compose-row"><input type="text" class="encyclopedia-search-input" id="mp-lobby-chat-input" maxlength="220" placeholder="${gameTextHtml('multiplayer.lobby.chatPlaceholder')}" autocomplete="off"><button class="store-buy-btn mp-chat-send" id="mp-lobby-chat-send" type="button">${gameTextHtml('multiplayer.lobby.chatSend')}</button></div>
            <div class="mp-chat-status" id="mp-lobby-chat-status">${gameTextHtml('multiplayer.lobby.chatHint')}</div>
          </div>
        </section>
      </div>`;
    renderHeaderHome();
    bindLobbyPanelControls();
    startDirectoryListeners();
  }

  function renderMatched(match) {
    stopDirectoryListeners(); stopRoomListener(); waitingCode=''; acceptedChallengeCode='';
    setPlayerPresenceActivity('multiplayer_setup', { availability:'busy' });
    headerConnect.innerHTML = `<span class="mp-header-status" style="max-width:none">${gameTextHtml('multiplayer.lobby.matchFound')}</span>`;
    const remoteEngine = match.engineVersion || null;
    const remoteProtocol = match.engineProtocolVersion || null;
    const guestEngine = match.guestEngineVersion || null;
    const incompatible = remoteEngine !== ENGINE_VERSION || remoteProtocol !== ENGINE_PROTOCOL_VERSION || (match.guestUid && guestEngine !== ENGINE_VERSION);
    if (incompatible) {
      body.innerHTML = `<div class="mp-section" style="max-width:560px;margin:40px auto">
        <div class="mp-section-title">${gameTextHtml('multiplayer.incompatible.title')}</div>
        <div class="mp-section-desc">${gameTextHtml('multiplayer.incompatible.description', { localVersion: ENGINE_VERSION, remoteVersion: remoteEngine || guestEngine || 'versión anterior/desconocida' })}</div>
        <button class="store-back-link" id="mp-incompatible-back">← ${gameTextHtml('common.back')}</button></div>`;
      body.querySelector('#mp-incompatible-back').addEventListener('click', renderHome); return;
    }
    const myUid = state.currentUser.uid;
    const myRole = match.hostUid === myUid ? 'host' : 'guest';
    const rivalUid = myRole === 'host' ? match.guestUid : match.hostUid;
    const rivalProfile = (match.players && match.players[rivalUid]) || {};
    const rivalName = String(rivalProfile.username || rivalProfile.displayName || '').trim() || 'tu rival';
    const rivalPhotoURL = rivalProfile.photoURL || '';
    const hostProfile = (match.players && match.players[match.hostUid]) || {};
    const guestProfile = (match.players && match.players[match.guestUid]) || {};
    body.innerHTML = `<div class="mp-section" style="max-width:650px;margin:28px auto">
      <div class="mp-section-title">${gameTextHtml('multiplayer.matched.title', { rival: rivalName })}</div>
      <div class="mp-versus-banner" aria-label="Enfrentamiento confirmado">
        ${multiplayerProfileBannerHTML(hostProfile, 'HOST', 'Host', match.hostUid)}<div class="mp-versus-vs">VS.</div>${multiplayerProfileBannerHTML(guestProfile, 'GUEST', 'Guest', match.guestUid)}
      </div>
      <div class="mp-section-desc">${gameTextHtml('multiplayer.matched.description')}<br><span style="color:#a99362;font-size:11px">Motor v${ENGINE_VERSION} · protocolo ${ENGINE_PROTOCOL_VERSION}</span></div>
      <button class="store-buy-btn" id="mp-start">${gameTextHtml('multiplayer.matched.start')}</button></div>`;
    void fetchPublicPlayerStats().then(rows => {
      const byName=new Map((Array.isArray(rows)?rows:[]).map(row=>[String(row.username||'').trim().toLocaleLowerCase('es-AR'),row]));
      body.querySelectorAll('[data-mp-elo-user]').forEach(node=>{ const row=byName.get(String(node.dataset.mpEloUser||'').trim().toLocaleLowerCase('es-AR'))||{}; const rating=Math.max(1,Math.floor(Number(row.eloRating)||1200),1200); node.textContent=gameText((Number(row.eloGames)||0)<10?'ranking.elo.provisional':'ranking.elo.established',{rating}); node.title=node.textContent; });
    }).catch(()=>{});
    body.querySelectorAll('[data-open-public-profile]').forEach(btn=>btn.addEventListener('click',event=>{event.stopPropagation();const uid=btn.dataset.openPublicProfile||'';if(uid)showPublicPlayerProfile(uid);}));
    body.querySelector('#mp-start').addEventListener('click', () => { cleanup(); overlay.remove(); onMatched(match.code, myRole, rivalName, rivalPhotoURL, match.startingRole || 'host'); });
  }

  renderHome();
}


function injectTournamentStyles() {
  if (document.getElementById('tournament-styles')) return;
  const style=document.createElement('style'); style.id='tournament-styles';
  style.textContent=`
    #tournament-overlay{position:fixed;inset:0;z-index:9800;background:radial-gradient(ellipse at top,#201710 0%,#0b0907 70%);color:#f0e0b0;padding:16px 20px;overflow:auto}
    .tournament-shell{max-width:1500px;margin:0 auto}.tournament-header{display:flex;gap:18px;align-items:center;margin-bottom:12px}.tournament-header-copy{min-width:0}.tournament-title{font-size:27px;font-weight:900;letter-spacing:1.2px}.tournament-subtitle{font-size:12px;color:#c8b995}
    .tournament-panel{background:rgba(15,13,9,.82);border:1px solid rgba(212,175,55,.38);border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 12px 34px rgba(0,0,0,.25)}
    .tournament-rules{line-height:1.55;color:#dfd1ad}.tournament-rules-hero{display:flex;align-items:center;gap:16px;padding:18px 20px;border:1px solid rgba(212,175,55,.34);border-radius:14px;background:linear-gradient(135deg,rgba(80,58,21,.34),rgba(19,15,9,.75));margin-bottom:16px}.tournament-rules-trophy{font-size:42px;filter:drop-shadow(0 4px 12px rgba(0,0,0,.35))}.tournament-rules-hero h2{margin:0 0 4px;font-size:25px;letter-spacing:.7px;color:#fff0bf}.tournament-rules-lead{margin:0;color:#cdbf9c;font-size:14px}.tournament-rules-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.tournament-rule-card{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.035);border-radius:12px;padding:14px 15px}.tournament-rule-card h3{margin:0 0 9px;color:#e3be45;font-size:13px;letter-spacing:.6px}.tournament-rule-card ul{margin:0;padding-left:19px;display:grid;gap:7px}.tournament-rule-card li{color:#ded2b4;font-size:13px;line-height:1.45}.tournament-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.tournament-btn{border:1px solid #d4af37;background:linear-gradient(#44351c,#20170d);color:#ffe7a0;font-weight:800;border-radius:9px;padding:10px 16px;cursor:pointer}.tournament-btn.secondary{border-color:#766b56;background:#17130d;color:#d4cab5}.tournament-btn.danger{border-color:#a94d47;background:linear-gradient(#4e211e,#21100f);color:#ffd6cf}.tournament-btn:disabled{opacity:.45;cursor:wait}
    .tournament-status{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}.tournament-badge{border:1px solid rgba(212,175,55,.42);border-radius:999px;padding:5px 10px;font-size:12px}.tournament-practice{border-color:#7b7b99;color:#c9c9ef}.tournament-next{font-size:16px;font-weight:800;margin:7px 0}.tournament-warning{color:#f0b47a;font-size:12px;line-height:1.45}
    .tournament-recovery-banner{margin:10px 0 0;padding:11px 13px;border:1px solid rgba(240,180,122,.55);border-radius:10px;background:rgba(91,50,24,.2);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.tournament-recovery-banner.pending{border-color:rgba(212,175,55,.65);background:rgba(80,58,21,.23)}.tournament-recovery-copy{font-size:12px;line-height:1.45;color:#e9d7b4;max-width:900px}.tournament-recovery-actions{display:flex;gap:8px;flex-wrap:wrap}
    .tournament-fixture-panel{margin-top:12px;padding:12px}.tournament-fixture-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.tournament-fixture-head h2{font-size:16px;margin:0}.tournament-drag-hint{font-size:10px;color:#8f846b;white-space:nowrap}
    .tournament-fixture-wrap{overflow:auto;max-width:100%;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:radial-gradient(circle at 50% 45%,rgba(43,83,111,.16),transparent 31%),linear-gradient(180deg,rgba(14,24,30,.5),rgba(9,12,13,.55));cursor:grab;scrollbar-width:thin;overscroll-behavior:contain}.tournament-fixture-wrap.drag-scroll-active{cursor:grabbing;user-select:none}.tournament-fixture-wrap img{-webkit-user-drag:none;user-drag:none}
    .tournament-bracket-board{position:relative;width:1420px;height:560px;margin:0 auto;isolation:isolate;overflow:hidden}.tournament-bracket-connectors{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}.tournament-bracket-connectors path{fill:none;stroke:rgba(98,176,222,.55);stroke-width:2}.tournament-bracket-connectors path.final-line{stroke:rgba(212,175,55,.62);stroke-width:2.2}
    .tournament-round-column{position:absolute;top:0;height:560px;width:170px;z-index:2}.tournament-round-column.r16-left{left:20px}.tournament-round-column.qf-left{left:230px}.tournament-round-column.sf-left{left:440px}.tournament-round-column.sf-right{left:810px}.tournament-round-column.qf-right{left:1020px}.tournament-round-column.r16-right{left:1230px}.tournament-round-label{position:absolute;top:8px;left:0;right:0;text-align:center;color:#e8c85b;font-size:11px;font-weight:900;letter-spacing:.8px;text-transform:uppercase;text-shadow:0 2px 6px #000}.tournament-round-reward{display:block;margin-top:2px;font-size:8px;font-weight:600;letter-spacing:0;color:#a8a08d;text-transform:none;white-space:nowrap}
    .tournament-match{position:absolute;left:0;width:170px;min-height:92px;transform:translateY(-50%);box-sizing:border-box;border:1px solid rgba(115,187,228,.28);border-radius:10px;padding:6px;background:linear-gradient(180deg,rgba(17,39,52,.92),rgba(10,20,27,.96));box-shadow:0 8px 22px rgba(0,0,0,.23);display:grid;grid-template-columns:1fr 14px 1fr;align-items:center;gap:3px}.tournament-match.final{position:relative;left:auto;top:auto!important;transform:none;width:184px;min-height:100px;border-color:rgba(212,175,55,.55);background:linear-gradient(180deg,rgba(70,51,18,.74),rgba(17,22,21,.96));box-shadow:0 0 24px rgba(212,175,55,.12),0 8px 22px rgba(0,0,0,.3)}.tournament-vs{font-size:8px;font-weight:900;color:#728a99;text-align:center}.tournament-match.final .tournament-vs{color:#d1b958}
    .tournament-side{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:3px 2px;border-radius:8px;text-align:center;position:relative}.tournament-side.winner{background:rgba(80,140,75,.18);color:#d7ffd2}.tournament-side.loser{opacity:.42;filter:grayscale(.65)}.tournament-side.player{font-weight:900;box-shadow:inset 0 0 0 1px rgba(212,175,55,.42)}.tournament-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;background:radial-gradient(circle,#4a4230,#241e14);border:2px solid rgba(255,255,255,.18);box-shadow:0 3px 10px rgba(0,0,0,.35);flex:0 0 auto}.tournament-side.player .tournament-avatar{border-color:#d4af37;box-shadow:0 0 13px rgba(212,175,55,.25)}.tournament-avatar-fallback{display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:#e8d9ac}.tournament-entrant-name{display:block;width:100%;max-width:70px;font-size:9px;line-height:1.12;min-height:20px;overflow:hidden;text-overflow:ellipsis;word-break:break-word}.tournament-seed-empty{opacity:.38;font-style:italic}
    .tournament-center-stage{position:absolute;left:618px;top:14px;width:184px;height:532px;z-index:3;display:flex;flex-direction:column;align-items:center}.tournament-final-label{font-size:12px;color:#f0d56a;font-weight:900;letter-spacing:1px;margin:2px 0 7px}.tournament-final-slot{height:108px;display:flex;align-items:flex-start;justify-content:center}.tournament-cup-wrap{width:164px;height:250px;display:flex;align-items:center;justify-content:center;position:relative}.tournament-cup-image{max-width:150px;max-height:238px;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 14px 18px rgba(0,0,0,.38))}.tournament-cup-fallback{font-size:112px;line-height:1;filter:drop-shadow(0 10px 14px rgba(0,0,0,.38))}.tournament-champion-name{position:absolute;top:0;left:50%;transform:translate(-50%,-35%);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:4px 9px;border:1px solid rgba(212,175,55,.55);border-radius:999px;background:rgba(16,14,9,.9);color:#fff0bf;font-size:10px;font-weight:900}
    .tournament-final-rewards{width:184px;border:1px solid rgba(212,175,55,.38);border-radius:10px;background:rgba(14,18,15,.8);padding:8px 8px 7px;box-sizing:border-box;text-align:center}.tournament-final-rewards-title{font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#b9ab86;font-weight:900;margin-bottom:5px}.tournament-final-reward-row{display:flex;align-items:center;justify-content:center;gap:8px}.tournament-final-reward-item{display:flex;align-items:center;gap:3px;color:#f5df9c;font-size:11px;font-weight:900}.tournament-final-reward-item .coin-icon{width:24px;height:24px;object-fit:contain}.tournament-final-reward-item .reward-pack-icon{width:30px;height:30px;object-fit:contain}.tournament-final-loss{font-size:8px;color:#a99e83;margin-top:3px}
    @media(max-width:900px){.tournament-rules-grid{grid-template-columns:1fr}.tournament-drag-hint{display:none}}
    @media(max-width:700px){#tournament-overlay{padding:10px}.tournament-title{font-size:22px}.tournament-header{align-items:center;gap:9px}.tournament-rules-hero{align-items:flex-start;padding:14px}.tournament-rules-trophy{font-size:34px}.tournament-panel{padding:10px}.tournament-bracket-board{transform-origin:top left}.tournament-fixture-wrap{touch-action:pan-x pan-y}}
  `;
  document.head.appendChild(style);
}

function tournamentRoundTextKey(key){return `tournament.round.${key}`;}
function tournamentEntrantName(tournament,id){
  if(!id)return '—';
  return String(tournament?.entrants?.[id]?.name || (id==='player'?getLocalPlayerName():gameText('tournament.npc.fallback')));
}
function tournamentEntrantAvatar(tournament,id){
  if(!id)return '';
  if(id==='player') return String(state.currentUser?.photoURL || state.userProfile?.photoURL || '');
  return String(tournament?.entrants?.[id]?.avatar || '');
}
function tournamentMatchSideHTML(tournament,id,match){
  const winner=match?.winnerEntrantId; const lost=winner&&id&&winner!==id; const won=winner&&winner===id;
  const classes=['tournament-side',id==='player'?'player':'',won?'winner':'',lost?'loser':''].filter(Boolean).join(' ');
  const avatar=tournamentEntrantAvatar(tournament,id);
  const name=tournamentEntrantName(tournament,id);
  const initial=id?String(name||'?').trim().charAt(0).toUpperCase():'?';
  const avatarHtml=avatar
    ? `<img class="tournament-avatar" src="${escapeHtml(avatar)}" alt="" draggable="false" onerror="this.outerHTML='<span class=&quot;tournament-avatar tournament-avatar-fallback&quot;>${escapeHtml(initial)}</span>'">`
    : `<span class="tournament-avatar tournament-avatar-fallback">${escapeHtml(initial)}</span>`;
  return `<div class="${classes}">${avatarHtml}<span class="tournament-entrant-name ${id?'':'tournament-seed-empty'}" title="${escapeHtml(name)}">${escapeHtml(name)}</span></div>`;
}
function tournamentMatchCardHTML(tournament,match,{final=false,top=50}={}){
  if(!match)return '';
  return `<div class="tournament-match${final?' final':''}"${final?'':` style="top:${Number(top).toFixed(3)}%"`}>${tournamentMatchSideHTML(tournament,match.aEntrantId,match)}<span class="tournament-vs">VS</span>${tournamentMatchSideHTML(tournament,match.bEntrantId,match)}</div>`;
}
function tournamentRoundRewardHTML(tournament,key){
  const p=tournament?.policy?.[key]||{};
  const points=Math.max(0,Number(p.points)||0), loss=Math.max(0,Number(p.lossPoints)||0), packs=Math.max(0,Number(p.packs)||0);
  return `<span class="tournament-round-reward">+${points}${packs?` · ${packs} sobre${packs===1?'':'s'}`:''} · derrota +${loss}</span>`;
}
function tournamentRoundColumnHTML(tournament,key,matches,side){
  const classMap={round16:`r16-${side}`,quarter:`qf-${side}`,semi:`sf-${side}`};
  const slotMap={round16:[16,39,62,85],quarter:[27.5,73.5],semi:[50.5]};
  const slots=slotMap[key]||[];
  return `<section class="tournament-round-column ${classMap[key]||''}"><div class="tournament-round-label">${gameTextHtml(tournamentRoundTextKey(key))}${tournamentRoundRewardHTML(tournament,key)}</div>${matches.map((match,index)=>tournamentMatchCardHTML(tournament,match,{top:slots[index]??50})).join('')}</section>`;
}
function tournamentFinalRewardsHTML(tournament){
  const p=tournament?.policy?.final||{};
  const points=Math.max(0,Number(p.points)||0), packs=Math.max(0,Number(p.packs)||0), loss=Math.max(0,Number(p.lossPoints)||0);
  return `<div class="tournament-final-rewards"><div class="tournament-final-rewards-title">${gameTextHtml('tournament.finalRewards')}</div><div class="tournament-final-reward-row"><span class="tournament-final-reward-item">${COIN_ICON_HTML}<span>+${points}</span></span>${packs?`<span class="tournament-final-reward-item">${PACK_ICON_HTML}<span>×${packs}</span></span>`:''}</div><div class="tournament-final-loss">${gameTextHtml('tournament.finalLossReward',{points:loss})}</div></div>`;
}
function tournamentBracketConnectorsSVG(){
  return `<svg class="tournament-bracket-connectors" viewBox="0 0 1420 560" preserveAspectRatio="none" aria-hidden="true">
    <path d="M190 90 H210 V154 H230 M190 218 H210 V154 H230 M190 347 H210 V412 H230 M190 476 H210 V412 H230"/>
    <path d="M400 154 H420 V283 H440 M400 412 H420 V283 H440"/>
    <path class="final-line" d="M610 283 H616 V84 H618"/>
    <path class="final-line" d="M810 283 H804 V84 H802"/>
    <path d="M1020 154 H1000 V283 H980 M1020 412 H1000 V283 H980"/>
    <path d="M1230 90 H1210 V154 H1190 M1230 218 H1210 V154 H1190 M1230 347 H1210 V412 H1190 M1230 476 H1210 V412 H1190"/>
  </svg>`;
}
function tournamentFixtureHTML(tournament){
  const rounds=Object.fromEntries((tournament?.rounds||[]).map(round=>[round.key,round]));
  const r16=rounds.round16?.matches||[], quarter=rounds.quarter?.matches||[], semi=rounds.semi?.matches||[], final=rounds.final?.matches?.[0]||null;
  const championId=tournament?.championEntrantId||final?.winnerEntrantId||null;
  const championName=championId?tournamentEntrantName(tournament,championId):'';
  return `<div class="tournament-bracket-board">${tournamentBracketConnectorsSVG()}${tournamentRoundColumnHTML(tournament,'round16',r16.slice(0,4),'left')}${tournamentRoundColumnHTML(tournament,'quarter',quarter.slice(0,2),'left')}${tournamentRoundColumnHTML(tournament,'semi',semi.slice(0,1),'left')}<section class="tournament-center-stage"><div class="tournament-final-label">${gameTextHtml('tournament.round.final')}</div><div class="tournament-final-slot">${tournamentMatchCardHTML(tournament,final,{final:true})}</div><div class="tournament-cup-wrap">${championName?`<div class="tournament-champion-name">${escapeHtml(championName)}</div>`:''}<img class="tournament-cup-image" src="./assets/images/ui/copa_argentinia.png" alt="Copa Argentinia" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="tournament-cup-fallback" style="display:none">🏆</span></div>${tournamentFinalRewardsHTML(tournament)}</section>${tournamentRoundColumnHTML(tournament,'semi',semi.slice(1,2),'right')}${tournamentRoundColumnHTML(tournament,'quarter',quarter.slice(2,4),'right')}${tournamentRoundColumnHTML(tournament,'round16',r16.slice(4,8),'right')}</div>`;
}

function showTournamentBetweenMatchAbandonConfirm(onConfirm, onCancel) {
  injectMulliganStyles();
  const modalOverlay=document.createElement('div');
  modalOverlay.className='gy-modal-overlay';
  modalOverlay.innerHTML=`<div class="gy-modal-content" style="max-width:460px"><div class="gy-modal-header"><h3>${gameTextHtml('tournament.abandon.title')}</h3></div><div style="display:flex;flex-direction:column;gap:12px;padding:16px"><p style="color:#cfe0d4;font-size:13px;line-height:1.5;margin:0">${gameTextHtml('tournament.abandon.description')}</p><button class="loyalty-ability-btn" id="tournament-abandon-confirm" style="justify-content:center;text-align:center"><span class="loyalty-ability-text">${gameTextHtml('tournament.abandon.confirm')}</span></button><button class="mulligan-btn mulligan-btn-mull" id="tournament-abandon-cancel">${gameTextHtml('tournament.abandon.cancel')}</button></div></div>`;
  document.body.appendChild(modalOverlay);
  modalOverlay.querySelector('#tournament-abandon-confirm')?.addEventListener('click',()=>{modalOverlay.remove();onConfirm?.();});
  modalOverlay.querySelector('#tournament-abandon-cancel')?.addEventListener('click',()=>{modalOverlay.remove();onCancel?.();});
}

export function showTournamentScreen(onBack, onPlayMatch) {
  injectMainMenuStyles(); injectTournamentStyles(); injectEncyclopediaStyles();
  document.querySelectorAll('#tournament-overlay').forEach(el=>el.remove());
  const overlay=document.createElement('div'); overlay.id='tournament-overlay';
  overlay.innerHTML=`<div class="tournament-shell"><div class="tournament-header"><button class="encyclopedia-back-btn" id="tournament-back">← ${gameTextHtml('common.back')}</button><div class="tournament-header-copy"><div class="tournament-title">${gameTextHtml('tournament.title')}</div><div class="tournament-subtitle">${gameTextHtml('tournament.subtitle')}</div></div></div><div id="tournament-body" class="tournament-panel">${gameTextHtml('tournament.loading')}</div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#tournament-back')?.addEventListener('click',()=>{overlay.remove();onBack?.();});
  const body=overlay.querySelector('#tournament-body');
  let busy=false;
  const setBusy=value=>{busy=value;overlay.querySelectorAll('button').forEach(btn=>{if(btn.id!=='tournament-back')btn.disabled=value;});};

  const bindFixtureDrag=()=>{
    const wrap=body.querySelector('.tournament-fixture-wrap');
    if(wrap)enableDesktopDragScroll(wrap,{axis:'both'});
  };

  const retryPendingSettlement=async(tournament,pending)=>{
    if(busy||!pending?.tournamentId||!pending?.matchId)return;
    setBusy(true);
    try{
      await settleTournamentMatch(pending.tournamentId,pending.matchId,pending.won===true);
      clearTournamentRecoveryMarkers();
      renderState(await getTournamentState({resolveInterrupted:false}));
    }catch(error){
      console.error('Tournament pending settlement retry failed:',error);
      showSimpleAlertModal(gameText('tournament.recovery.retryError'));
    }finally{setBusy(false);}
  };

  const resolveInterruptedManually=async tournament=>{
    if(busy||!tournament?.activeMatch)return;
    if(!window.confirm(gameText('tournament.recovery.resolveConfirm')))return;
    setBusy(true);
    try{
      const resolved=await getTournamentState({resolveInterrupted:true});
      clearTournamentRecoveryMarkers();
      renderState(resolved);
    }catch(error){
      console.error('Tournament manual interrupted recovery failed:',error);
      showSimpleAlertModal(gameText('tournament.recovery.resolveError'));
    }finally{setBusy(false);}
  };

  const renderState=tournament=>{
    if(!tournament){
      body.innerHTML=`<div class="tournament-rules"><div class="tournament-rules-hero"><div class="tournament-rules-trophy">🏆</div><div><h2>${gameTextHtml('tournament.rules.title')}</h2><p class="tournament-rules-lead">${gameTextHtml('tournament.rules.lead')}</p></div></div><div class="tournament-rules-grid"><section class="tournament-rule-card"><h3>${gameTextHtml('tournament.rules.formatTitle')}</h3><ul><li>${gameTextHtml('tournament.rules.format1')}</li><li>${gameTextHtml('tournament.rules.format2')}</li></ul></section><section class="tournament-rule-card"><h3>${gameTextHtml('tournament.rules.resumeTitle')}</h3><ul><li>${gameTextHtml('tournament.rules.resume1')}</li><li>${gameTextHtml('tournament.rules.resume2')}</li></ul></section><section class="tournament-rule-card"><h3>${gameTextHtml('tournament.rules.rewardsTitle')}</h3><ul><li>${gameTextHtml('tournament.rules.rewards1')}</li><li>${gameTextHtml('tournament.rules.rewards2')}</li></ul></section></div><div class="tournament-actions"><button class="tournament-btn" id="tournament-start">${gameTextHtml('tournament.start')}</button></div></div>`;
      body.querySelector('#tournament-start')?.addEventListener('click',()=>void createNew()); return;
    }
    const ended=tournament.status!=='active'; const interrupted=tournament.eliminationReason==='interrupted_match';
    const currentRound=tournament.rounds?.[tournament.currentRoundIndex]; const playerMatch=currentRound?.matches?.find(m=>m.aEntrantId==='player'||m.bEntrantId==='player'); const opponentId=playerMatch?(playerMatch.aEntrantId==='player'?playerMatch.bEntrantId:playerMatch.aEntrantId):null;
    const opponent=tournamentEntrantName(tournament,opponentId); const roundKey=currentRound?.key||'final';
    const statusText=tournament.status==='champion'?gameText('tournament.status.champion'):tournament.status==='eliminated'?(interrupted?gameText('tournament.status.interrupted'):gameText('tournament.status.eliminated')):gameText('tournament.status.active',{round:gameText(tournamentRoundTextKey(roundKey)),opponent});
    const pending=readTournamentPendingSettlement();
    const pendingForActive=tournamentRecoveryMatchesActive(tournament,pending);
    const recovery=tournament.activeMatch
      ? `<div class="tournament-recovery-banner ${pendingForActive?'pending':''}"><div class="tournament-recovery-copy">${gameTextHtml(pendingForActive?'tournament.recovery.pending':'tournament.recovery.activeElsewhere')}</div><div class="tournament-recovery-actions">${pendingForActive?`<button class="tournament-btn" id="tournament-retry-settlement">${gameTextHtml('tournament.recovery.retry')}</button>`:`<button class="tournament-btn danger" id="tournament-resolve-interrupted">${gameTextHtml('tournament.recovery.resolve')}</button>`}</div></div>`
      : '';
    const actions=ended
      ? `<button class="tournament-btn" id="tournament-new">${gameTextHtml('tournament.new')}</button>`
      : tournament.activeMatch
        ? ''
        : `<button class="tournament-btn" id="tournament-play">${gameTextHtml('tournament.playRound',{round:gameText(tournamentRoundTextKey(roundKey))})}</button><button class="tournament-btn danger" id="tournament-abandon">${gameTextHtml('tournament.abandon')}</button>`;
    body.innerHTML=`<div class="tournament-status"><div><div class="tournament-badge ${tournament.rewardEligible?'':'tournament-practice'}">${gameTextHtml(tournament.rewardEligible?'tournament.rewarded':'tournament.practice')}</div><div class="tournament-next">${escapeHtml(statusText)}</div><div>${gameTextHtml('tournament.rewardsEarned',{points:Number(tournament.rewardsEarned?.points)||0,packs:Number(tournament.rewardsEarned?.packs)||0})}</div></div></div>${recovery}<div class="tournament-panel tournament-fixture-panel"><div class="tournament-fixture-head"><h2>${gameTextHtml('tournament.fixture')}</h2><span class="tournament-drag-hint">${gameTextHtml('tournament.fixtureDragHint')}</span></div><div class="tournament-fixture-wrap">${tournamentFixtureHTML(tournament)}</div></div><div class="tournament-actions">${actions}</div>${ended||tournament.activeMatch?'':`<div class="tournament-warning">${gameTextHtml('tournament.match.warning')}</div>`}`;
    bindFixtureDrag();
    body.querySelector('#tournament-new')?.addEventListener('click',()=>void createNew());
    body.querySelector('#tournament-play')?.addEventListener('click',()=>{if(busy)return;overlay.remove();onPlayMatch?.(tournament);});
    body.querySelector('#tournament-abandon')?.addEventListener('click',()=>{if(busy)return;showTournamentBetweenMatchAbandonConfirm(()=>void abandonCurrent(tournament),()=>{});});
    body.querySelector('#tournament-retry-settlement')?.addEventListener('click',()=>void retryPendingSettlement(tournament,pending));
    body.querySelector('#tournament-resolve-interrupted')?.addEventListener('click',()=>void resolveInterruptedManually(tournament));
  };
  const createNew=async()=>{if(busy)return;setBusy(true);body.innerHTML=gameTextHtml('tournament.starting');try{clearTournamentRecoveryMarkers();const result=await startTournament();renderState(result?.tournament||null);}catch(error){console.error('Tournament start failed:',error);body.innerHTML=`<div class="store-error-msg">${gameTextHtml('tournament.error.start')}</div><div class="tournament-actions"><button class="tournament-btn secondary" id="tournament-retry">${gameTextHtml('common.retry')}</button></div>`;body.querySelector('#tournament-retry')?.addEventListener('click',()=>void load());}finally{setBusy(false);}};
  const abandonCurrent=async tournament=>{if(busy||!tournament?.tournamentId)return;setBusy(true);const prior=body.innerHTML;body.innerHTML=`<div class="tournament-next">${gameTextHtml('tournament.abandon.working')}</div>`;try{await abandonTournament(tournament.tournamentId);clearTournamentRecoveryMarkers();overlay.remove();onBack?.();}catch(error){console.error('Tournament abandon failed:',error);body.innerHTML=prior;renderState(tournament);showSimpleAlertModal(gameText('tournament.error.abandon'));}finally{setBusy(false);}};
  // HF23.3.8: fixture/menu loads are strictly read-only. Only the explicit recovery paths
  // above may ask Functions to resolve an interrupted activeMatch.
  const load=async()=>{if(busy)return;setBusy(true);try{renderState(await getTournamentState({resolveInterrupted:false}));}catch(error){console.error('Tournament load failed:',error);body.innerHTML=`<div class="store-error-msg">${gameTextHtml('tournament.error.load')}</div><div class="tournament-actions"><button class="tournament-btn secondary" id="tournament-retry">${gameTextHtml('common.retry')}</button></div>`;body.querySelector('#tournament-retry')?.addEventListener('click',()=>void load());}finally{setBusy(false);}};
  void load();
  return overlay;
}

function injectTradeMarketStyles() {
  // 23.21.0 RC2 — los estilos del Mercado Visual viven en css/style.css + css/mobile.css.
  // Conservamos este marker por compatibilidad con aperturas viejas que esperan el hook.
  if (document.getElementById('trade-market-styles')) return;
  const style = document.createElement('style');
  style.id = 'trade-market-styles';
  style.textContent = '/* Argentinia 23.21.0 RC2 — Mercado de Pases Visual UX */';
  document.head.appendChild(style);
}

const TRADE_RARITY_KEYS = Object.freeze({ Common:'trade.rarity.Common', Uncommon:'trade.rarity.Uncommon', Rare:'trade.rarity.Rare', Mythic:'trade.rarity.Mythic' });
const TRADE_COLOR_KEYS = Object.freeze({ W:'trade.color.W', U:'trade.color.U', B:'trade.color.B', R:'trade.color.R', G:'trade.color.G', C:'trade.color.C' });
const TRADE_TYPE_KEYS = Object.freeze({ Creature:'trade.type.creature', Instant:'trade.type.instant', Sorcery:'trade.type.sorcery', Enchantment:'trade.type.enchantment', Artifact:'trade.type.artifact', Land:'trade.type.land', Planeswalker:'trade.type.planeswalker' });
const TRADE_FILTER_COLORS = Object.freeze(['W','U','B','R','G','C']);
const TRADE_FILTER_RARITIES = Object.freeze(['Common','Uncommon','Rare','Mythic']);
const TRADE_FILTER_TYPES = Object.freeze(['Creature','Instant','Sorcery','Enchantment','Artifact','Land','Planeswalker']);

function tradeRarityLabel(rarity){ return gameText(TRADE_RARITY_KEYS[rarity] || 'trade.criteria.anyRarity'); }
function tradeColorLabel(color){ return gameText(TRADE_COLOR_KEYS[color] || 'trade.criteria.anyColor'); }
function tradeTypeLabel(type){ return gameText(TRADE_TYPE_KEYS[type] || 'trade.filter.anyType'); }
function tradeCard(cardId){ return cardDb.getById(String(cardId||'')); }
function tradeCardName(cardId){ return tradeCard(cardId)?.name || gameText('trade.cardFallback'); }
function tradeNormalizeSearch(value){ return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }
function tradeCardTypeKeys(card){
  const type=tradeNormalizeSearch(card?.type),out=[];
  if(type.includes('criatura')) out.push('Creature');
  if(type.includes('instantaneo')) out.push('Instant');
  if(type.includes('conjuro')) out.push('Sorcery');
  if(type.includes('encantamiento')) out.push('Enchantment');
  if(type.includes('artefacto')) out.push('Artifact');
  if(type.includes('tierra')) out.push('Land');
  if(type.includes('planeswalker') || type.includes('semidios')) out.push('Planeswalker');
  return out;
}
function tradeCardTypeKey(card){return tradeCardTypeKeys(card)[0]||'';}
function tradeCardMatchesColor(card,color){
  if(!color)return true;
  return cardFilterColors(card).includes(String(color).toUpperCase());
}
function tradeCriterionText(c){
  if(c?.type==='exact_card') return tradeCardName(c.cardId);
  if(c?.type==='attributes'){
    const parts=[]; if(c.cardType) parts.push(tradeTypeLabel(c.cardType)); if(c.color) parts.push(tradeColorLabel(c.color)); if(c.rarity) parts.push(tradeRarityLabel(c.rarity));
    return parts.join(' + ') || gameText('trade.criteria.anyCard');
  }
  return gameText('trade.criteria.invalid');
}
function tradeListingWantedHtml(listing){
  if(listing?.acceptAnyCard===true) return gameTextHtml('trade.acceptAny');
  return (listing?.wantedCriteria||[]).map((c,i)=>`${i+1}. ${escapeHtml(tradeCriterionText(c))}`).join('<br>');
}
function tradeListingWantedChipsHtml(listing){
  if(listing?.acceptAnyCard===true) return `<span class="trade-wanted-chip trade-wanted-chip-any">${gameTextHtml('trade.acceptAny')}</span>`;
  const criteria=Array.isArray(listing?.wantedCriteria)?listing.wantedCriteria:[];
  return criteria.length?criteria.map(c=>`<span class="trade-wanted-chip">${escapeHtml(tradeCriterionText(c))}</span>`).join(''):`<span class="trade-wanted-chip">${gameTextHtml('trade.criteria.anyCard')}</span>`;
}
function tradeCardMatchesCriterion(card,c){
  if(!card||!c)return false;
  if(c.type==='exact_card')return String(card.id)===String(c.cardId);
  if(c.type!=='attributes')return false;
  if(c.cardType&&!tradeCardTypeKeys(card).includes(String(c.cardType)))return false;
  if(c.rarity&&String(card.rarity)!==String(c.rarity))return false;
  if(c.color&&!tradeCardMatchesColor(card,String(c.color)))return false;
  return true;
}
function tradeCardMatchesListing(card,listing){return listing?.acceptAnyCard===true||(listing?.wantedCriteria||[]).some(c=>tradeCardMatchesCriterion(card,c));}
function tradeAllCardsSorted(){ return [...cardDb.enabledCards].sort((a,b)=>String(a.name).localeCompare(String(b.name),'es')); }
function tradeFindCardsByNameQuery(value,{limit=18}={}){
  const needle=tradeNormalizeSearch(value);
  if(!needle)return [];
  const terms=needle.split(/\s+/).filter(Boolean);
  return tradeAllCardsSorted()
    .map(card=>{
      const hay=tradeNormalizeSearch(card?.name);
      if(!terms.every(term=>hay.includes(term)))return null;
      let score=4;
      if(hay===needle)score=0;
      else if(hay.startsWith(needle))score=1;
      else if(hay.includes(needle))score=2;
      else if(terms.every(term=>hay.split(/\s+/).some(word=>word.startsWith(term))))score=3;
      return {card,score};
    })
    .filter(Boolean)
    .sort((a,b)=>a.score-b.score||String(a.card.name).localeCompare(String(b.card.name),'es'))
    .slice(0,Math.max(1,Number(limit)||18))
    .map(entry=>entry.card);
}
function tradeFindCardByName(value){
  const needle=tradeNormalizeSearch(value);if(!needle)return null;
  return tradeAllCardsSorted().find(card=>tradeNormalizeSearch(card?.name)===needle)||null;
}
function tradeTradableEntries(market,listing=null){
  return Object.entries(market?.tradableCounts||{})
    .filter(([id,n])=>Number(n)>0&&(!listing||tradeCardMatchesListing(tradeCard(id),listing)))
    .map(([id,n])=>({card:tradeCard(id),id:String(id),n:Number(n)}))
    .filter(x=>x.card)
    .sort((a,b)=>String(a.card.name).localeCompare(String(b.card.name),'es'));
}
function tradeFormatDate(ms){
  const n=Number(ms)||0;
  if(!n)return '';
  try{return new Date(n).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return new Date(n).toLocaleString();}
}
function tradeVisualCardHtml(cardId,{label='',className='',showName=false}={}){
  const id=String(cardId||'');
  return `<div class="trade-visual-card ${label?'trade-has-label':''} ${className}" data-trade-visual-card="${escapeHtml(id)}">
    ${label?`<div class="trade-visual-label">${escapeHtml(label)}</div>`:''}
    <div class="trade-render-slot" data-trade-card-id="${escapeHtml(id)}" aria-label="${escapeHtml(tradeCardName(id))}"></div>
    <button type="button" class="trade-zoom-btn" data-trade-zoom-card="${escapeHtml(id)}" title="${gameTextHtml('trade.zoom')}" aria-label="${gameTextHtml('trade.zoomCard',{card:tradeCardName(id)})}">🔍</button>
    ${showName?`<div class="trade-card-name-large">${escapeHtml(tradeCardName(id))}</div>`:''}
  </div>`;
}
function tradePairHtml(leftId,rightId,{leftLabel='',rightLabel='',compact=false}={}){
  return `<div class="trade-pair ${compact?'compact':''}">${tradeVisualCardHtml(leftId,{label:leftLabel,className:'trade-pair-side',showName:true})}<div class="trade-pair-arrow" aria-hidden="true">↔</div>${tradeVisualCardHtml(rightId,{label:rightLabel,className:'trade-pair-side',showName:true})}</div>`;
}
function hydrateTradeCards(scope){
  if(!scope)return;
  scope.querySelectorAll('.trade-render-slot[data-trade-card-id]').forEach(slot=>{
    if(slot.dataset.tradeHydrated==='1')return;
    const card=tradeCard(slot.dataset.tradeCardId);
    if(!card){slot.textContent=gameText('trade.cardFallback');slot.dataset.tradeHydrated='1';return;}
    const el=createCardElement(card,false,true,null,'preview',null);
    el.classList.add('trade-rendered-card');
    slot.appendChild(el);
    slot.dataset.tradeHydrated='1';
  });
}

function showTradeNotificationModal(item = {}) {
  injectTradeMarketStyles();
  const accepted = String(item?.type || '') === 'accepted';
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.className = 'trade-modal trade-notification-modal';
    modal.dataset.tradeNotificationId = String(item?.notificationId || '');
    const owner = String(item?.listingOwnerUsername || gameText('ranking.playerFallback'));
    const titleKey = accepted ? 'trade.notification.accepted.title' : 'trade.notification.rejected.title';
    const bodyKey = accepted ? 'trade.notification.accepted.body' : 'trade.notification.rejected.body';
    const pair = accepted
      ? tradePairHtml(item.listedCardId, item.offeredCardId, { leftLabel:gameText('trade.pair.youReceived'), rightLabel:gameText('trade.pair.youGave') })
      : tradePairHtml(item.offeredCardId, item.listedCardId, { leftLabel:gameText('trade.pair.youOffer'), rightLabel:gameText('trade.pair.youWant') });
    modal.innerHTML = `<div class="trade-modal-panel trade-notification-panel">
      <button type="button" class="trade-modal-close" data-trade-notification-close aria-label="${gameTextHtml('common.close')}">×</button>
      <div class="trade-modal-title">${gameTextHtml(titleKey)}</div>
      <div class="trade-confirm-copy">${gameTextHtml(bodyKey,{username:owner})}</div>
      ${pair}
      <div class="trade-modal-actions"><button type="button" class="trade-btn" data-trade-notification-close>${gameTextHtml('common.continue')}</button></div>
    </div>`;
    let finishing = false;
    const finish = async () => {
      if (finishing) return;
      finishing = true;
      modal.querySelectorAll('[data-trade-notification-close]').forEach(btn => { btn.disabled = true; });
      const id = String(item?.notificationId || '');
      try {
        if (id) await acknowledgeTradeNotification(id);
      } catch (error) {
        // Fail open visually, fail closed persistently: if ACK fails, the notice remains
        // unread server-side and will be offered again on a later login.
        console.warn('No se pudo marcar la notificación de Mercado como leída:', error);
      } finally {
        document.removeEventListener('keydown', onKey);
        modal.remove();
        resolve();
      }
    };
    const onKey = event => {
      if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); void finish(); }
    };
    modal.querySelector('.trade-modal-panel')?.addEventListener('click', event => event.stopPropagation());
    modal.addEventListener('click', event => { if (event.target === modal) void finish(); });
    modal.querySelectorAll('[data-trade-notification-close]').forEach(btn => btn.addEventListener('click', () => void finish()));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    hydrateTradeCards(modal);
  });
}

export async function showTradeNotificationsAtBoot(notifications = []) {
  const queue = (Array.isArray(notifications) ? notifications : [])
    .filter(item => item && item.readAtMs == null && ['accepted','rejected'].includes(String(item.type || '')))
    .slice(0,20);
  for (const item of queue) await showTradeNotificationModal(item);
}

export function showTradeMarketScreen(onBack) {
  injectTradeMarketStyles();
  injectEncyclopediaStyles(); // 23.21.1 — mismo botón/posición de Volver que Tienda y Enciclopedia.
  document.querySelectorAll('#trade-market-overlay').forEach(el=>el.remove());
  const overlay=document.createElement('div'); overlay.id='trade-market-overlay';
  overlay.innerHTML=`<div class="trade-shell"><div class="trade-header"><button class="encyclopedia-back-btn" id="trade-back">← ${gameTextHtml('common.back')}</button><div class="trade-header-copy"><div class="trade-title">${gameTextHtml('trade.title')}</div><div class="trade-subtitle">${gameTextHtml('trade.subtitle')}</div></div></div><div id="trade-root"><div class="trade-panel trade-empty">${gameTextHtml('trade.loading')}</div></div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#trade-back')?.addEventListener('click',()=>{closeTransientTradeModal();overlay.remove();onBack?.();});
  const root=overlay.querySelector('#trade-root');
  let market=null;
  let tab='explore';
  let busy=false;
  let transientModal=null;
  let publishSelectedCardId='';
  const exploreFilters={query:'',colors:new Set(),rarity:'',type:''};
  const publishFilters={query:'',colors:new Set(),rarity:'',type:''};

  const closeTransientTradeModal=()=>{if(transientModal?.isConnected)transientModal.remove();transientModal=null;};
  const setBusy=v=>{busy=!!v;overlay.querySelectorAll('.trade-btn,.trade-select,.trade-input,.trade-card-suggestion,input,button[data-trade-offer-choice]').forEach(el=>{if(el.id!=='trade-back')el.disabled=busy;});};
  const errorText=e=>String(e?.message||e?.code||gameText('trade.error.generic'));

  async function refresh({profile=false}={}){
    if(busy)return;setBusy(true);
    try{market=await getTradeMarket();if(profile&&state.currentUser?.uid){const p=await loadUserProfileFromServer(state.currentUser.uid);if(p)state.userProfile=p;}render();}
    catch(e){console.error('Trade market load failed:',e);root.innerHTML=`<div class="trade-panel trade-error">${escapeHtml(errorText(e))}</div>`;}
    finally{setBusy(false);}
  }
  async function mutate(work,{profile=false}={}){
    if(busy)return false;setBusy(true);
    try{await work();market=await getTradeMarket();if(profile&&state.currentUser?.uid){const p=await loadUserProfileFromServer(state.currentUser.uid);if(p)state.userProfile=p;}render();return true;}
    catch(e){console.error('Trade market mutation failed:',e);showSimpleAlertModal(errorText(e));return false;}
    finally{setBusy(false);}
  }
  function limits(){
    return {
      maxActiveListings:Math.min(10,Math.max(1,Number(market?.limits?.maxActiveListings)||1)),
      maxWantedCriteria:Math.min(3,Math.max(1,Number(market?.limits?.maxWantedCriteria)||3)),
      maxOffersPerListing:Math.max(1,Number(market?.limits?.maxOffersPerListing)||10),
      maxOutgoingOffers:Math.max(1,Number(market?.limits?.maxOutgoingOffers)||5),
      maxCompletedPerWeek:Math.max(1,Number(market?.limits?.maxCompletedPerWeek)||3)
    };
  }
  function summary(){
    const l=limits();
    return `<div class="trade-summary"><span class="trade-chip">${gameTextHtml('trade.summary.listing',{used:(market?.ownListings||[]).length||(market?.ownListing?1:0),max:l.maxActiveListings})}</span><span class="trade-chip">${gameTextHtml('trade.summary.outgoing',{used:(market?.outgoingOffers||[]).length,max:l.maxOutgoingOffers})}</span><span class="trade-chip">${gameTextHtml('trade.summary.week',{used:Number(market?.completedThisWeek)||0,max:l.maxCompletedPerWeek})}</span></div><div class="trade-rules">${gameTextHtml('trade.rules',{maxCriteria:l.maxWantedCriteria})}<br><strong>${gameTextHtml('trade.rules.decksLabel')}:</strong> ${gameTextHtml('trade.rules.decksBody')}</div>`;
  }
  function tabs(){return `<div class="trade-tabs">${[['explore','trade.tab.explore'],['mine','trade.tab.mine'],['offers','trade.tab.offers'],['history','trade.tab.history']].map(([id,key])=>`<button class="trade-tab ${tab===id?'active':''}" data-trade-tab="${id}">${gameTextHtml(key)}</button>`).join('')}</div>`;}
  function bindTabs(){root.querySelectorAll('[data-trade-tab]').forEach(btn=>btn.addEventListener('click',()=>{closeTransientTradeModal();tab=btn.dataset.tradeTab;render();}));}

  function openTradeCardPreview(cardId){
    const card=tradeCard(cardId);if(!card)return;
    // La lupa puede abrirse ENCIMA del modal de oferta/aceptación sin destruirlo: al cerrar
    // la vista ampliada el jugador vuelve exactamente a su selección anterior.
    const modal=document.createElement('div');modal.className='trade-modal trade-preview-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    modal.innerHTML=`<div class="trade-modal-panel trade-preview-panel"><button type="button" class="trade-modal-close" data-trade-modal-close aria-label="${gameTextHtml('common.close')}">×</button><div class="trade-preview-title">${escapeHtml(card.name)}</div><div class="trade-preview-card-slot"></div></div>`;
    const panel=modal.querySelector('.trade-modal-panel');panel.addEventListener('click',e=>e.stopPropagation());
    modal.querySelector('.trade-preview-card-slot')?.appendChild(createCardElement(card,false,true,null,'preview',null));
    const close=()=>{document.removeEventListener('keydown',onKey,true);if(modal.isConnected)modal.remove();};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}};
    modal.addEventListener('click',close);modal.querySelector('[data-trade-modal-close]')?.addEventListener('click',close);document.addEventListener('keydown',onKey,true);
    document.body.appendChild(modal);
  }
  function bindTradeZoom(scope){scope?.querySelectorAll('[data-trade-zoom-card]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openTradeCardPreview(btn.dataset.tradeZoomCard);}));}

  function renderTradeFilterToolbar(filters,prefix){
    const isExplore=prefix==='trade-explore';
    const searchId=isExplore?'trade-explore-search':`${prefix}-search`;
    const rarityId=isExplore?'trade-filter-rarity':`${prefix}-filter-rarity`;
    const typeId=isExplore?'trade-filter-type':`${prefix}-filter-type`;
    const clearId=isExplore?'trade-filter-clear':`${prefix}-filter-clear`;
    return `<div class="trade-explore-toolbar" data-trade-filter-toolbar="${escapeHtml(prefix)}">
      <div class="trade-filter-search"><label for="${escapeHtml(searchId)}">${gameTextHtml('trade.filter.searchLabel')}</label><input id="${escapeHtml(searchId)}" class="trade-input" type="search" autocomplete="off" placeholder="${gameTextHtml('trade.filter.searchPlaceholder')}" value="${escapeHtml(filters.query)}"></div>
      <div class="trade-filter-block"><span class="trade-filter-label">${gameTextHtml('trade.filter.color')}</span><div class="trade-filter-chips">${TRADE_FILTER_COLORS.map(c=>`<button type="button" class="trade-filter-chip ${filters.colors.has(c)?'active':''}" data-trade-filter-prefix="${escapeHtml(prefix)}" data-trade-color-filter="${c}">${escapeHtml(tradeColorLabel(c))}</button>`).join('')}</div></div>
      <div class="trade-filter-selects"><label>${gameTextHtml('trade.filter.rarity')}<select class="trade-select" id="${escapeHtml(rarityId)}"><option value="">${gameTextHtml('trade.filter.all')}</option>${TRADE_FILTER_RARITIES.map(r=>`<option value="${r}" ${filters.rarity===r?'selected':''}>${escapeHtml(tradeRarityLabel(r))}</option>`).join('')}</select></label><label>${gameTextHtml('trade.filter.type')}<select class="trade-select" id="${escapeHtml(typeId)}"><option value="">${gameTextHtml('trade.filter.anyType')}</option>${TRADE_FILTER_TYPES.map(t=>`<option value="${t}" ${filters.type===t?'selected':''}>${escapeHtml(tradeTypeLabel(t))}</option>`).join('')}</select></label><button type="button" class="trade-btn secondary trade-filter-clear" id="${escapeHtml(clearId)}">${gameTextHtml('trade.filter.clear')}</button></div>
    </div>`;
  }
  function renderExploreFilters(){return renderTradeFilterToolbar(exploreFilters,'trade-explore');}
  function renderPublishFilters(){return renderTradeFilterToolbar(publishFilters,'trade-publish');}
  function renderExplore(){
    const listings=market?.listings||[], l=limits();
    if(!listings.length)return `<div class="trade-empty">${gameTextHtml('trade.empty')}</div>`;
    const outgoing=new Set((market?.outgoingOffers||[]).map(o=>String(o.listingId||'')));
    const cardsHtml=listings.map(item=>{
      const eligible=tradeTradableEntries(market,item),already=outgoing.has(String(item.listingId||'')),card=tradeCard(item.cardId);
      const search=tradeNormalizeSearch(card?.name);
      const colors=cardFilterColors(card).join(',');
      const type=tradeCardTypeKeys(card).join(',');
      return `<article class="trade-listing-card" data-trade-listing-owner="${escapeHtml(item.ownerUid)}" data-trade-listing-id="${escapeHtml(item.listingId)}" data-trade-card-search="${escapeHtml(search)}" data-trade-card-colors="${escapeHtml(colors)}" data-trade-card-rarity="${escapeHtml(card?.rarity||'')}" data-trade-card-type="${escapeHtml(type)}">
        <div class="trade-listing-visual">${tradeVisualCardHtml(item.cardId)}</div>
        <div class="trade-listing-body"><div class="trade-card-title">${escapeHtml(tradeCardName(item.cardId))}</div><div class="trade-muted">${gameTextHtml('trade.explore.offeredBy',{username:item.ownerUsername,count:item.offerCount,max:l.maxOffersPerListing})} <button type="button" class="trade-profile-link" data-open-public-profile="${escapeHtml(String(item.ownerUid||''))}">${gameTextHtml('publicProfile.view')}</button></div><div class="trade-busco"><strong>${gameTextHtml('trade.busco')}</strong><div class="trade-wanted-chips">${tradeListingWantedChipsHtml(item)}</div></div>${already?`<div class="trade-muted trade-listing-status">${gameTextHtml('trade.explore.alreadyOffered')}</div>`:eligible.length?`<button class="trade-btn trade-offer-cta" data-offer-owner="${escapeHtml(item.ownerUid)}" data-offer-listing="${escapeHtml(item.listingId)}">${gameTextHtml('trade.offer')}</button>`:`<div class="trade-muted trade-listing-status">${gameTextHtml('trade.explore.noMatching')}</div>`}</div>
      </article>`;
    }).join('');
    return `<div class="trade-explore-layout"><section class="trade-explore-results"><div class="trade-results-meta"><span id="trade-filter-result-count"></span></div><div class="trade-market-grid" id="trade-explore-grid">${cardsHtml}</div><div class="trade-empty" id="trade-filter-empty" hidden>${gameTextHtml('trade.filter.noResults')}</div></section><aside class="trade-explore-sidebar">${renderExploreFilters()}</aside></div>`;
  }
  function applyExploreFilters(){
    const query=tradeNormalizeSearch(exploreFilters.query);let visible=0;
    root.querySelectorAll('.trade-listing-card[data-trade-listing-owner]').forEach(node=>{
      const search=node.dataset.tradeCardSearch||'';
      const colors=String(node.dataset.tradeCardColors||'').split(',').filter(Boolean);
      const matchesQuery=!query||search.includes(query);
      const matchesColor=exploreFilters.colors.size===0||[...exploreFilters.colors].some(c=>colors.includes(c));
      const matchesRarity=!exploreFilters.rarity||node.dataset.tradeCardRarity===exploreFilters.rarity;
      const types=String(node.dataset.tradeCardType||'').split(',').filter(Boolean);
      const matchesType=!exploreFilters.type||types.includes(exploreFilters.type);
      const show=matchesQuery&&matchesColor&&matchesRarity&&matchesType;node.hidden=!show;if(show)visible++;
    });
    const count=root.querySelector('#trade-filter-result-count');if(count)count.textContent=gameText('trade.filter.resultCount',{count:visible});
    const empty=root.querySelector('#trade-filter-empty');if(empty)empty.hidden=visible!==0;
  }
  function openTradeOfferModal(listing){
    const eligible=tradeTradableEntries(market,listing);if(!eligible.length){showSimpleAlertModal(gameText('trade.explore.noMatching'));return;}
    closeTransientTradeModal();let selected='';
    const modal=document.createElement('div');modal.className='trade-modal trade-offer-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    modal.innerHTML=`<div class="trade-modal-panel trade-offer-panel"><button type="button" class="trade-modal-close" data-trade-modal-close aria-label="${gameTextHtml('common.close')}">×</button><div class="trade-modal-title">${gameTextHtml('trade.offerModal.title')}</div><div class="trade-offer-target"><div><div class="trade-section-kicker">${gameTextHtml('trade.offerModal.youWant')}</div>${tradeVisualCardHtml(listing.cardId,{className:'trade-offer-target-card'})}</div><div class="trade-offer-target-copy"><div class="trade-muted">${gameTextHtml('trade.explore.offeredBy',{username:listing.ownerUsername,count:listing.offerCount,max:limits().maxOffersPerListing})}</div><div class="trade-busco"><strong>${gameTextHtml('trade.busco')}</strong><div class="trade-wanted-chips">${tradeListingWantedChipsHtml(listing)}</div></div></div></div><div class="trade-modal-divider"></div><div class="trade-section-kicker">${gameTextHtml('trade.offerModal.eligible')}</div><div class="trade-offer-choice-grid">${eligible.map(entry=>`<div class="trade-offer-choice" role="button" tabindex="0" data-trade-offer-choice="${escapeHtml(entry.id)}">${tradeVisualCardHtml(entry.id)}<div class="trade-copy-count">${gameTextHtml('trade.freeCopies',{count:entry.n})}</div></div>`).join('')}</div><div class="trade-offer-selection-summary"><span>${gameTextHtml('trade.offerModal.selected')}</span><strong id="trade-offer-selected-name">${gameTextHtml('trade.offerModal.noneSelected')}</strong></div><div class="trade-modal-actions"><button type="button" class="trade-btn secondary" data-trade-modal-close>${gameTextHtml('common.cancel')}</button><button type="button" class="trade-btn" id="trade-offer-confirm" disabled>${gameTextHtml('trade.offerModal.confirm')}</button></div></div>`;
    const panel=modal.querySelector('.trade-modal-panel');panel.addEventListener('click',e=>e.stopPropagation());
    const close=()=>{document.removeEventListener('keydown',onKey);if(modal.isConnected)modal.remove();if(transientModal===modal)transientModal=null;};
    const onKey=e=>{if(e.key==='Escape')close();};
    const select=id=>{selected=String(id||'');modal.querySelectorAll('[data-trade-offer-choice]').forEach(node=>node.classList.toggle('is-selected',node.dataset.tradeOfferChoice===selected));const name=modal.querySelector('#trade-offer-selected-name');if(name)name.textContent=tradeCardName(selected);const confirm=modal.querySelector('#trade-offer-confirm');if(confirm)confirm.disabled=!selected;};
    modal.querySelectorAll('[data-trade-offer-choice]').forEach(node=>{const choose=e=>{if(e.target.closest('[data-trade-zoom-card]'))return;select(node.dataset.tradeOfferChoice);};node.addEventListener('click',choose);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(node.dataset.tradeOfferChoice);}});});
    modal.querySelector('#trade-offer-confirm')?.addEventListener('click',()=>{if(!selected)return;close();void mutate(()=>createTradeOffer(listing.ownerUid,listing.listingId,selected));});
    modal.addEventListener('click',close);modal.querySelectorAll('[data-trade-modal-close]').forEach(btn=>btn.addEventListener('click',close));document.addEventListener('keydown',onKey);
    document.body.appendChild(modal);transientModal=modal;hydrateTradeCards(modal);bindTradeZoom(modal);
  }
  function bindExplore(){
    const input=root.querySelector('#trade-explore-search');input?.addEventListener('input',e=>{exploreFilters.query=e.target.value;applyExploreFilters();});
    root.querySelectorAll('[data-trade-color-filter]').forEach(btn=>btn.addEventListener('click',()=>{const c=btn.dataset.tradeColorFilter;if(exploreFilters.colors.has(c))exploreFilters.colors.delete(c);else exploreFilters.colors.add(c);btn.classList.toggle('active',exploreFilters.colors.has(c));applyExploreFilters();}));
    root.querySelector('#trade-filter-rarity')?.addEventListener('change',e=>{exploreFilters.rarity=e.target.value||'';applyExploreFilters();});
    root.querySelector('#trade-filter-type')?.addEventListener('change',e=>{exploreFilters.type=e.target.value||'';applyExploreFilters();});
    root.querySelector('#trade-filter-clear')?.addEventListener('click',()=>{exploreFilters.query='';exploreFilters.colors.clear();exploreFilters.rarity='';exploreFilters.type='';render();});
    root.querySelectorAll('[data-offer-listing]').forEach(btn=>btn.addEventListener('click',()=>{const listing=(market?.listings||[]).find(x=>String(x.listingId)===String(btn.dataset.offerListing));if(listing)openTradeOfferModal(listing);}));
    applyExploreFilters();
  }

  function criterionRow(i){
    return `<div class="trade-criterion ${i?'disabled':''}" data-criterion-row="${i}"><div class="trade-criterion-controls"><label><input type="checkbox" data-criterion-use="${i}" ${i===0?'checked':''}> ${gameTextHtml('trade.criteria.slot',{index:i+1})}</label><select class="trade-select" data-criterion-type="${i}"><option value="exact_card">${gameTextHtml('trade.criteria.typeExact')}</option><option value="attributes">${gameTextHtml('trade.criteria.typeAttributes')}</option></select><div class="trade-criterion-exact-wrap" data-criterion-exact="${i}"><div class="trade-criterion-card-search"><input class="trade-input" type="search" autocomplete="off" data-criterion-card-search="${i}" aria-autocomplete="list" aria-expanded="false" aria-controls="trade-card-suggestions-${i}" placeholder="${gameTextHtml('trade.criteria.searchExactPlaceholder')}"><input type="hidden" data-criterion-card="${i}" value=""><div class="trade-card-suggestions" id="trade-card-suggestions-${i}" data-criterion-card-suggestions="${i}" role="listbox" hidden></div></div><div class="trade-criterion-preview" data-trade-criterion-preview="${i}"><div class="trade-criterion-preview-empty">${gameTextHtml('trade.criteria.searchExactHint')}</div></div></div><div class="trade-filter-triple" data-criterion-filter="${i}" style="display:none"><select class="trade-select" data-criterion-card-type="${i}"><option value="">${gameTextHtml('trade.filter.anyType')}</option>${TRADE_FILTER_TYPES.map(t=>`<option value="${t}">${escapeHtml(tradeTypeLabel(t))}</option>`).join('')}</select><select class="trade-select" data-criterion-color="${i}"><option value="">${gameTextHtml('trade.criteria.anyColor')}</option>${TRADE_FILTER_COLORS.map(c=>`<option value="${c}">${escapeHtml(tradeColorLabel(c))}</option>`).join('')}</select><select class="trade-select" data-criterion-rarity="${i}"><option value="">${gameTextHtml('trade.criteria.anyRarity')}</option>${TRADE_FILTER_RARITIES.map(r=>`<option value="${r}">${escapeHtml(tradeRarityLabel(r))}</option>`).join('')}</select></div></div></div>`;
  }
  function renderPublishCardChooser(entries){
    if(!entries.length)return '';
    if(!publishSelectedCardId||!entries.some(x=>x.id===publishSelectedCardId))publishSelectedCardId=entries[0].id;
    const cards=entries.map(entry=>{const card=entry.card;const search=tradeNormalizeSearch(card?.name);const colors=cardFilterColors(card).join(',');const type=tradeCardTypeKeys(card).join(',');return `<div class="trade-publish-card-choice ${entry.id===publishSelectedCardId?'is-selected':''}" role="button" tabindex="0" data-trade-publish-card="${escapeHtml(entry.id)}" data-trade-card-search="${escapeHtml(search)}" data-trade-card-colors="${escapeHtml(colors)}" data-trade-card-rarity="${escapeHtml(card?.rarity||'')}" data-trade-card-type="${escapeHtml(type)}">${tradeVisualCardHtml(entry.id)}<div class="trade-copy-count">${gameTextHtml('trade.freeCopies',{count:entry.n})}</div></div>`;}).join('');
    return `<div class="trade-section-kicker">${gameTextHtml('trade.mine.offerLabel')}</div><div class="trade-explore-layout trade-publish-browser"><section class="trade-explore-results"><div class="trade-results-meta"><span id="trade-publish-filter-result-count"></span></div><div class="trade-publish-card-grid" id="trade-publish-grid">${cards}</div><div class="trade-empty" id="trade-publish-filter-empty" hidden>${gameTextHtml('trade.publishFilter.noResults')}</div></section><aside class="trade-explore-sidebar">${renderPublishFilters()}</aside></div><div class="trade-publish-selected">${gameTextHtml('trade.mine.selectedCard')}: <strong id="trade-publish-selected-name">${escapeHtml(tradeCardName(publishSelectedCardId))}</strong></div>`;
  }
  function renderMine(){
    const l=limits();
    const items=(Array.isArray(market?.ownListings)&&market.ownListings.length)?market.ownListings:(market?.ownListing?[market.ownListing]:[]);
    const activeHtml=items.length?`<div class="trade-own-listings">${items.map(item=>{
      const offers=(market?.receivedOffers||[]).filter(o=>String(o.listingId)===String(item.listingId));
      return `<div class="trade-mine-layout"><section class="trade-panel trade-own-listing"><div class="trade-section-kicker">${gameTextHtml('trade.mine.active')}</div>${tradeVisualCardHtml(item.cardId,{className:'trade-own-listing-card'})}<div class="trade-card-title">${escapeHtml(tradeCardName(item.cardId))}</div><div class="trade-busco"><strong>${gameTextHtml('trade.busco')}</strong><div class="trade-wanted-chips">${tradeListingWantedChipsHtml(item)}</div></div><button class="trade-btn danger" data-cancel-listing="${escapeHtml(item.listingId)}">${gameTextHtml('trade.cancelListing')}</button></section><section class="trade-panel trade-received-offers"><h3>${gameTextHtml('trade.mine.received',{count:offers.length,max:l.maxOffersPerListing})}</h3>${offers.length?`<div class="trade-offer-list trade-received-offer-list">${offers.map(o=>`<article class="trade-received-offer"><div class="trade-muted trade-offer-user">${escapeHtml(o.offererUsername)} <button type="button" class="trade-profile-link" data-open-public-profile="${escapeHtml(String(o.offererUid||''))}">${gameTextHtml('publicProfile.view')}</button></div><div class="trade-received-card-wrap">${tradeVisualCardHtml(o.offeredCardId,{label:gameText('trade.pair.theyOffer'),className:'trade-received-offer-card',showName:true})}</div><div class="trade-row trade-offer-actions"><button class="trade-btn" data-accept-offer="${escapeHtml(o.offerId)}">${gameTextHtml('trade.accept')}</button><button class="trade-btn secondary" data-reject-offer="${escapeHtml(o.offerId)}">${gameTextHtml('trade.reject')}</button></div></article>`).join('')}</div>`:`<div class="trade-empty">${gameTextHtml('trade.mine.noneReceived')}</div>`}</section></div>`;
    }).join('')}</div>`:'';
    if(items.length>=l.maxActiveListings)return activeHtml||`<div class="trade-empty">${gameTextHtml('trade.mine.noneTradable')}</div>`;
    const entries=tradeTradableEntries(market);
    const publishHtml=entries.length?`<div class="trade-panel trade-publish">${renderPublishCardChooser(entries)}<label class="trade-row trade-accept-any"><input type="checkbox" id="trade-accept-any"> ${gameTextHtml('trade.acceptAny')}</label><div id="trade-criteria-wrap">${Array.from({length:l.maxWantedCriteria},(_,i)=>criterionRow(i)).join('')}</div><div class="trade-row trade-publish-actions"><button class="trade-btn" id="trade-publish">${gameTextHtml('trade.publish')}</button></div></div>`:`<div class="trade-empty">${gameTextHtml('trade.mine.noneTradable')}</div>`;
    return activeHtml+publishHtml;
  }
  function openTradeAcceptModal(offer){
    if(!offer)return;
    const ownItems=(Array.isArray(market?.ownListings)&&market.ownListings.length)?market.ownListings:(market?.ownListing?[market.ownListing]:[]);
    const listing=ownItems.find(item=>String(item.listingId)===String(offer.listingId));if(!listing)return;
    closeTransientTradeModal();
    const modal=document.createElement('div');modal.className='trade-modal trade-accept-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    modal.innerHTML=`<div class="trade-modal-panel trade-confirm-panel"><button type="button" class="trade-modal-close" data-trade-modal-close aria-label="${gameTextHtml('common.close')}">×</button><div class="trade-modal-title">${gameTextHtml('trade.acceptModal.title')}</div><div class="trade-confirm-copy">${gameTextHtml('trade.acceptModal.body',{username:offer.offererUsername})}</div>${tradePairHtml(listing.cardId,offer.offeredCardId,{leftLabel:gameText('trade.pair.youGive'),rightLabel:gameText('trade.pair.youReceive')})}<div class="trade-modal-actions"><button type="button" class="trade-btn secondary" data-trade-modal-close>${gameTextHtml('common.cancel')}</button><button type="button" class="trade-btn" id="trade-accept-confirm">${gameTextHtml('trade.acceptModal.confirm')}</button></div></div>`;
    const close=()=>{document.removeEventListener('keydown',onKey);if(modal.isConnected)modal.remove();if(transientModal===modal)transientModal=null;};const onKey=e=>{if(e.key==='Escape')close();};
    modal.querySelector('.trade-modal-panel')?.addEventListener('click',e=>e.stopPropagation());modal.addEventListener('click',close);modal.querySelectorAll('[data-trade-modal-close]').forEach(btn=>btn.addEventListener('click',close));modal.querySelector('#trade-accept-confirm')?.addEventListener('click',()=>{close();void mutate(()=>acceptTradeOffer(offer.offerId),{profile:true});});document.addEventListener('keydown',onKey);document.body.appendChild(modal);transientModal=modal;hydrateTradeCards(modal);bindTradeZoom(modal);
  }
  function refreshCriterionPreview(i,cardId){
    const host=root.querySelector(`[data-trade-criterion-preview="${i}"]`);if(!host)return;
    if(!cardId){host.innerHTML=`<div class="trade-criterion-preview-empty">${gameTextHtml('trade.criteria.searchExactHint')}</div>`;return;}
    host.innerHTML=`<div class="trade-render-slot" data-trade-card-id="${escapeHtml(cardId)}"></div><button type="button" class="trade-zoom-btn compact" data-trade-zoom-card="${escapeHtml(cardId)}">🔍</button>`;hydrateTradeCards(host);bindTradeZoom(host);
  }
  function applyPublishFilters(){
    const query=tradeNormalizeSearch(publishFilters.query);let visible=0;
    root.querySelectorAll('.trade-publish-card-choice[data-trade-publish-card]').forEach(node=>{
      const search=node.dataset.tradeCardSearch||'';
      const colors=String(node.dataset.tradeCardColors||'').split(',').filter(Boolean);
      const matchesQuery=!query||search.includes(query);
      const matchesColor=publishFilters.colors.size===0||[...publishFilters.colors].some(c=>colors.includes(c));
      const matchesRarity=!publishFilters.rarity||node.dataset.tradeCardRarity===publishFilters.rarity;
      const types=String(node.dataset.tradeCardType||'').split(',').filter(Boolean);
      const matchesType=!publishFilters.type||types.includes(publishFilters.type);
      const show=matchesQuery&&matchesColor&&matchesRarity&&matchesType;node.hidden=!show;if(show)visible++;
    });
    const count=root.querySelector('#trade-publish-filter-result-count');if(count)count.textContent=gameText('trade.publishFilter.resultCount',{count:visible});
    const empty=root.querySelector('#trade-publish-filter-empty');if(empty)empty.hidden=visible!==0;
  }
  function bindPublishFilters(){
    root.querySelector('#trade-publish-search')?.addEventListener('input',e=>{publishFilters.query=e.target.value;applyPublishFilters();});
    root.querySelectorAll('[data-trade-filter-prefix="trade-publish"][data-trade-color-filter]').forEach(btn=>btn.addEventListener('click',()=>{const c=btn.dataset.tradeColorFilter;if(publishFilters.colors.has(c))publishFilters.colors.delete(c);else publishFilters.colors.add(c);btn.classList.toggle('active',publishFilters.colors.has(c));applyPublishFilters();}));
    root.querySelector('#trade-publish-filter-rarity')?.addEventListener('change',e=>{publishFilters.rarity=e.target.value||'';applyPublishFilters();});
    root.querySelector('#trade-publish-filter-type')?.addEventListener('change',e=>{publishFilters.type=e.target.value||'';applyPublishFilters();});
    root.querySelector('#trade-publish-filter-clear')?.addEventListener('click',()=>{publishFilters.query='';publishFilters.colors.clear();publishFilters.rarity='';publishFilters.type='';render();});
    applyPublishFilters();
  }
  function bindMine(){
    root.querySelectorAll('[data-cancel-listing]').forEach(btn=>btn.addEventListener('click',()=>{if(window.confirm(gameText('trade.confirm.cancelListing')))void mutate(()=>cancelTradeListing(btn.dataset.cancelListing));}));
    root.querySelectorAll('[data-reject-offer]').forEach(btn=>btn.addEventListener('click',()=>void mutate(()=>rejectTradeOffer(btn.dataset.rejectOffer))));
    root.querySelectorAll('[data-accept-offer]').forEach(btn=>btn.addEventListener('click',()=>{const offer=(market.receivedOffers||[]).find(o=>o.offerId===btn.dataset.acceptOffer);if(offer)openTradeAcceptModal(offer);}));
    root.querySelectorAll('[data-trade-publish-card]').forEach(node=>{const select=()=>{publishSelectedCardId=node.dataset.tradePublishCard;root.querySelectorAll('[data-trade-publish-card]').forEach(x=>x.classList.toggle('is-selected',x.dataset.tradePublishCard===publishSelectedCardId));const name=root.querySelector('#trade-publish-selected-name');if(name)name.textContent=tradeCardName(publishSelectedCardId);};node.addEventListener('click',e=>{if(e.target.closest('[data-trade-zoom-card]'))return;select();});node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});});
    const acceptAny=root.querySelector('#trade-accept-any');
    const syncRows=()=>{const any=acceptAny?.checked===true;root.querySelector('#trade-criteria-wrap')?.classList.toggle('disabled',any);root.querySelectorAll('[data-criterion-row]').forEach(row=>{const i=row.dataset.criterionRow;const use=root.querySelector(`[data-criterion-use="${i}"]`);row.classList.toggle('disabled',any||!use?.checked);});};
    acceptAny?.addEventListener('change',syncRows);root.querySelectorAll('[data-criterion-use]').forEach(el=>el.addEventListener('change',syncRows));
    root.querySelectorAll('[data-criterion-type]').forEach(sel=>sel.addEventListener('change',()=>{const i=sel.dataset.criterionType;const exact=root.querySelector(`[data-criterion-exact="${i}"]`),filter=root.querySelector(`[data-criterion-filter="${i}"]`);if(exact)exact.style.display=sel.value==='exact_card'?'grid':'none';if(filter)filter.style.display=sel.value==='attributes'?'grid':'none';}));
    root.querySelectorAll('[data-criterion-card-search]').forEach(input=>{
      const i=input.dataset.criterionCardSearch;
      const hidden=root.querySelector(`[data-criterion-card="${i}"]`);
      const suggestions=root.querySelector(`[data-criterion-card-suggestions="${i}"]`);
      const closeSuggestions=()=>{if(suggestions){suggestions.hidden=true;suggestions.innerHTML='';}input.setAttribute('aria-expanded','false');};
      const selectCard=card=>{if(!card)return;if(hidden)hidden.value=String(card.id);input.value=String(card.name||'');refreshCriterionPreview(i,String(card.id));closeSuggestions();};
      const renderSuggestions=()=>{
        const typed=String(input.value||'');
        const exact=tradeFindCardByName(typed);
        if(hidden)hidden.value=exact?.id?String(exact.id):'';
        refreshCriterionPreview(i,exact?.id?String(exact.id):'');
        const matches=tradeFindCardsByNameQuery(typed,{limit:18});
        if(!suggestions||!tradeNormalizeSearch(typed)){closeSuggestions();return;}
        if(!matches.length){suggestions.innerHTML=`<div class="trade-card-suggestion-empty">${gameTextHtml('trade.criteria.searchExactNoResults')}</div>`;suggestions.hidden=false;input.setAttribute('aria-expanded','true');return;}
        suggestions.innerHTML=matches.map(card=>`<button type="button" class="trade-card-suggestion" role="option" data-trade-card-suggestion-id="${escapeHtml(card.id)}"><span class="trade-card-suggestion-name">${escapeHtml(card.name)}</span><span class="trade-card-suggestion-meta">${escapeHtml(tradeCardTypeKeys(card).map(tradeTypeLabel).join(' · ')||String(card.type||''))}${card.rarity?` · ${escapeHtml(tradeRarityLabel(card.rarity))}`:''}</span></button>`).join('');
        suggestions.hidden=false;input.setAttribute('aria-expanded','true');
        suggestions.querySelectorAll('[data-trade-card-suggestion-id]').forEach(btn=>btn.addEventListener('mousedown',e=>e.preventDefault()));
        suggestions.querySelectorAll('[data-trade-card-suggestion-id]').forEach(btn=>btn.addEventListener('click',()=>selectCard(tradeCard(btn.dataset.tradeCardSuggestionId))));
      };
      input.addEventListener('input',renderSuggestions);
      input.addEventListener('focus',renderSuggestions);
      input.addEventListener('change',()=>{const exact=tradeFindCardByName(input.value);if(exact)selectCard(exact);});
      input.addEventListener('keydown',e=>{if(e.key==='Escape')closeSuggestions();});
      input.addEventListener('blur',()=>setTimeout(closeSuggestions,120));
    });
    bindPublishFilters();
    syncRows();
    root.querySelector('#trade-publish')?.addEventListener('click',()=>{
      const cardId=publishSelectedCardId,any=acceptAny?.checked===true,wantedCriteria=[];
      if(!cardId){showSimpleAlertModal(gameText('trade.mine.chooseCard'));return;}
      if(!any){
        const maxCriteria=limits().maxWantedCriteria;
        for(let i=0;i<maxCriteria;i++){
          if(!root.querySelector(`[data-criterion-use="${i}"]`)?.checked)continue;
          const type=root.querySelector(`[data-criterion-type="${i}"]`)?.value;
          if(type==='exact_card'){
            const wantedCardId=root.querySelector(`[data-criterion-card="${i}"]`)?.value||'';
            if(!wantedCardId){showSimpleAlertModal(gameText('trade.criteria.needExact',{index:i+1}));return;}
            wantedCriteria.push({type,cardId:wantedCardId});
          }else{
            const cardType=root.querySelector(`[data-criterion-card-type="${i}"]`)?.value||null;
            const color=root.querySelector(`[data-criterion-color="${i}"]`)?.value||null;
            const rarity=root.querySelector(`[data-criterion-rarity="${i}"]`)?.value||null;
            if(!cardType&&!rarity&&!color){showSimpleAlertModal(gameText('trade.criteria.needAttribute',{index:i+1}));return;}
            wantedCriteria.push({type:'attributes',cardType,color,rarity});
          }
        }
        if(!wantedCriteria.length){showSimpleAlertModal(gameText('trade.criteria.needOneOrAny'));return;}
      }
      void mutate(()=>createTradeListing({cardId,wantedCriteria,acceptAnyCard:any}));
    });
  }

  function renderOffers(){
    const offers=market?.outgoingOffers||[];
    if(!offers.length)return `<div class="trade-empty">${gameTextHtml('trade.outgoing.none')}</div>`;
    return `<div class="trade-offer-list">${offers.map(o=>`<article class="trade-outgoing-offer"><div class="trade-offer-heading"><div><div class="trade-section-kicker">${gameTextHtml('trade.outgoing.pending')}</div><div class="trade-muted">${gameTextHtml('trade.outgoing.owner',{username:o.listingOwnerUsername})} <button type="button" class="trade-profile-link" data-open-public-profile="${escapeHtml(String(o.listingOwnerUid||''))}">${gameTextHtml('publicProfile.view')}</button></div></div><span class="trade-status-pill">${gameTextHtml('trade.status.pending')}</span></div>${tradePairHtml(o.offeredCardId,o.listedCardId,{leftLabel:gameText('trade.pair.youOffer'),rightLabel:gameText('trade.pair.youWant')})}<button class="trade-btn danger" data-cancel-offer="${escapeHtml(o.offerId)}">${gameTextHtml('trade.cancelOffer')}</button></article>`).join('')}</div>`;
  }
  function bindOffers(){root.querySelectorAll('[data-cancel-offer]').forEach(btn=>btn.addEventListener('click',()=>void mutate(()=>cancelTradeOffer(btn.dataset.cancelOffer))));}
  function renderHistory(){
    const rows=market?.history||[];
    if(!rows.length)return `<div class="trade-empty">${gameTextHtml('trade.history.none')}</div>`;
    return `<div class="trade-history-list">${rows.map(r=>{const me=state.currentUser?.uid;const owner=String(r.ownerUid)===String(me);const gave=owner?r.ownerGaveCardId:r.offererGaveCardId,got=owner?r.offererGaveCardId:r.ownerGaveCardId,other=owner?r.offererUsername:r.ownerUsername,otherUid=owner?r.offererUid:r.ownerUid;const when=tradeFormatDate(r.completedAtMs);const tradeId=String(r.tradeId||r.receiptId||'');return `<article class="trade-history-entry"><div class="trade-history-heading"><div><div class="trade-section-kicker">${gameTextHtml('trade.history.completed')}</div><div class="trade-muted">${gameTextHtml('trade.history.with',{username:other||gameText('ranking.playerFallback')})} <button type="button" class="trade-profile-link" data-open-public-profile="${escapeHtml(String(otherUid||''))}">${gameTextHtml('publicProfile.view')}</button>${when?` · ${escapeHtml(when)}`:''}</div></div><span class="trade-status-pill completed">${gameTextHtml('trade.status.completed')}</span></div>${tradePairHtml(gave,got,{leftLabel:gameText('trade.pair.youGave'),rightLabel:gameText('trade.pair.youReceived')})}${tradeId?`<div class="trade-history-actions"><button type="button" class="trade-btn secondary" data-open-trade-dispute="${escapeHtml(tradeId)}">${gameTextHtml('trade.history.dispute')}</button></div>`:''}</article>`;}).join('')}</div>`;
  }
  function bindHistory(){
    root.querySelectorAll('[data-open-trade-dispute]').forEach(btn=>btn.addEventListener('click',()=>{
      const tradeId=String(btn.dataset.openTradeDispute||'');
      const receipt=(market?.history||[]).find(row=>String(row.tradeId||row.receiptId||'')===tradeId);
      if(!receipt)return;
      const me=state.currentUser?.uid;
      const owner=String(receipt.ownerUid)===String(me);
      const other=owner?receipt.offererUsername:receipt.ownerUsername;
      showModerationComposer({
        title:gameText('trade.dispute.title'),
        placeholder:gameText('trade.dispute.placeholder',{username:other||gameText('ranking.playerFallback')}),
        submitLabel:gameText('trade.dispute.submit'),
        onSubmit:text=>createTradeDispute(tradeId,text)
      });
    }));
  }
  function render(){
    if(!market)return;
    closeTransientTradeModal();
    root.innerHTML=summary()+tabs()+`<div class="trade-panel trade-main-panel">${tab==='explore'?renderExplore():tab==='mine'?renderMine():tab==='offers'?renderOffers():renderHistory()}</div>`;
    bindTabs();hydrateTradeCards(root);bindTradeZoom(root);
    root.querySelectorAll('[data-open-public-profile]').forEach(btn=>btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const uid=btn.dataset.openPublicProfile||'';if(uid)showPublicPlayerProfile(uid);}));
    if(tab==='explore')bindExplore();if(tab==='mine')bindMine();if(tab==='offers')bindOffers();if(tab==='history')bindHistory();
  }
  void refresh();
  return overlay;
}

export function showMainMenu(onPlay, onMultiplayerMatched, onTournament) {
  clearAnimationLayer('main_menu');
  injectMainMenuStyles();
  injectRewardsStyles();
  prepareGameManualUI();
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
      <button class="main-menu-btn main-menu-btn-primary" id="menu-tournament">${gameTextHtml('menu.tournament')}</button>
      <button class="main-menu-btn" id="menu-multiplayer">${gameTextHtml('menu.multiplayer')}</button>
      <button class="main-menu-btn" id="menu-mydecks">${gameTextHtml('menu.myDecks')}</button>
      <button class="main-menu-btn" id="menu-encyclopedia">${gameTextHtml('menu.encyclopedia')}</button>
      <div class="main-menu-bottom-row">
        <button class="main-menu-btn" id="menu-options">${gameTextHtml('menu.options')}</button>
        <button class="main-menu-icon-btn" id="menu-store" title="${gameTextHtml('menu.store')}" aria-label="${gameTextHtml('menu.store')}"><span class="main-menu-icon-fallback" aria-hidden="true">🛒</span><img class="main-menu-icon-image" src="./assets/images/ui/icon_tienda.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'"></button>
        <button class="main-menu-icon-btn" id="menu-ranking" title="${gameTextHtml('menu.ranking')}" aria-label="${gameTextHtml('menu.ranking')}"><span class="main-menu-icon-fallback" aria-hidden="true">📊</span><img class="main-menu-icon-image" src="./assets/images/ui/icon_ranking.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'"></button>
        <button class="main-menu-icon-btn" id="menu-trade-market" title="${gameTextHtml('menu.tradeMarket')}" aria-label="${gameTextHtml('menu.tradeMarket')}"><span class="main-menu-icon-fallback" aria-hidden="true">🔄️</span><img class="main-menu-icon-image" src="./assets/images/ui/icon_mercado_pases.png" alt="" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.style.display='none'"></button>
        <button class="main-menu-help-link" id="menu-how-to-play" type="button">${gameTextHtml('manual.menu.link')}</button>
      </div>
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
      if (err?.code !== 'AUTH_STARTER_DECK_REQUIRED') {
        window.alert(gameText('menu.profileUnavailable'));
      }
      updateMainMenuLoginGatedButtons(overlay);
      return false;
    }
  }
  const releaseMenuIdentityAction = () => { menuIdentityActionPending = false; };

  overlay.querySelector('#menu-play').addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    // HF17 — no desnudar #game-app entre el menú y el selector. El destino monta primero
    // su superficie; recién entonces retiramos el menú que estaba cubriendo el tablero.
    await onPlay();
    overlay.remove();
  });

  overlay.querySelector('#menu-tournament')?.addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    if (!state.currentUser || !state.userProfile) { releaseMenuIdentityAction(); return; }
    if (typeof onTournament === 'function') await onTournament();
    overlay.remove();
  });

  overlay.querySelector('#menu-trade-market')?.addEventListener('click', async () => {
    if (!await awaitMenuIdentityOrStay()) return;
    if (!state.currentUser || !state.userProfile) { releaseMenuIdentityAction(); return; }
    overlay.style.display = 'none';
    showTradeMarketScreen(() => { overlay.style.display = ''; releaseMenuIdentityAction(); });
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
    try {
      showEncyclopedia(() => { overlay.style.display = ''; releaseMenuIdentityAction(); });
    } catch (error) {
      // 23.21.3 RC5.2i — un fallo de inicialización de una vista de menú jamás debe
      // revelar el game-app vacío que vive debajo del overlay principal.
      console.error('No se pudo abrir Enciclopedia:', error);
      overlay.style.display = '';
      releaseMenuIdentityAction();
    }
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

  overlay.querySelector('#menu-how-to-play')?.addEventListener('click', event => {
    showGameManual({ returnFocusTo: event.currentTarget });
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
  const initialAnimations = getAnimationSettings();
  const initialServerAnimationPolicy = getServerAnimationPolicy();
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
      <div class="options-layout-grid">
        <section class="options-column options-column-gameplay">
          <div class="options-section-title">${escapeHtml(gameText('options.gameplay'))}</div>
          <div class="options-row">
            <span class="options-label">${escapeHtml(gameText('options.difficulty'))}</span>
            <button class="options-toggle-btn" id="opt-difficulty">${difficultyLabel()}</button>
          </div>
          <div class="options-section-title">${escapeHtml(gameText('options.animations'))}</div>
          <div class="options-row">
            <span class="options-label">${escapeHtml(gameText('options.animations'))}</span>
            <button class="options-toggle-btn" id="opt-animations-toggle">${initialAnimations.enabled ? escapeHtml(gameText('options.enabled')) : escapeHtml(gameText('options.off'))}</button>
          </div>
          <div class="options-row" id="opt-animation-speed-row">
            <span class="options-label">${escapeHtml(gameText('options.animationSpeed'))}</span>
            <button class="options-toggle-btn" id="opt-animation-speed">${escapeHtml(animationSpeedLabel(initialAnimations.speed))}</button>
          </div>
          <div id="opt-animation-server-note" style="${initialServerAnimationPolicy.enabled ? 'display:none;' : ''}margin:4px 4px 2px;color:#d99b6b;font-size:11px;line-height:1.4;">${escapeHtml(gameText('options.animations.serverOff'))}</div>
          <div class="options-section-title">${escapeHtml(gameText('options.multiplayer'))}</div>
          <div class="options-row"><span class="options-label">${escapeHtml(gameText('options.challengeInvites'))}</span><button class="options-toggle-btn" id="opt-challenge-invites">${getChallengeInvitesEnabled()?escapeHtml(gameText('options.enabled')):escapeHtml(gameText('options.off'))}</button></div>
        </section>

        <section class="options-column options-column-audio">
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
          <div class="options-legal-links">
            <a href="/terminos/" target="_blank" rel="noopener noreferrer">${escapeHtml(gameText('legal.terms'))}</a>
            <span aria-hidden="true">·</span>
            <a href="/privacidad/" target="_blank" rel="noopener noreferrer">${escapeHtml(gameText('legal.privacy'))}</a>
          </div>
        </section>
      </div>
      <button class="main-menu-btn options-back-btn" id="opt-back">${escapeHtml(gameText('options.back'))}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const diffBtn = overlay.querySelector('#opt-difficulty');
  diffBtn.addEventListener('click', () => {
    state.botDifficulty = nextBotDifficulty(normalizeBotDifficulty(state.botDifficulty));
    diffBtn.textContent = difficultyLabel();
    logMsg(gameText('options.difficulty.changed', { difficulty: difficultyLabel() }));
  });

  const animationsToggle = overlay.querySelector('#opt-animations-toggle');
  const animationSpeedBtn = overlay.querySelector('#opt-animation-speed');
  const animationSpeedRow = overlay.querySelector('#opt-animation-speed-row');
  const animationServerNote = overlay.querySelector('#opt-animation-server-note');
  const refreshAnimationControls = () => {
    const anim = getAnimationSettings();
    const server = getServerAnimationPolicy();
    animationsToggle.textContent = anim.enabled ? gameText('options.enabled') : gameText('options.off');
    animationSpeedBtn.textContent = animationSpeedLabel(anim.speed);
    animationSpeedBtn.disabled = !anim.enabled || !server.enabled;
    animationSpeedRow.classList.toggle('options-row-disabled', !anim.enabled || !server.enabled);
    animationServerNote.style.display = server.enabled ? 'none' : '';
  };
  animationsToggle.addEventListener('click', () => {
    const enabled = setAnimationsEnabled(!getAnimationSettings().enabled);
    logMsg(gameText('options.animations.changed', { state: enabled ? gameText('options.enabled') : gameText('options.off') }));
    refreshAnimationControls();
  });
  animationSpeedBtn.addEventListener('click', () => {
    const speed = cycleAnimationSpeed();
    logMsg(gameText('options.animationSpeed.changed', { speed: animationSpeedLabel(speed) }));
    refreshAnimationControls();
  });
  const onAnimationPolicyChanged = () => refreshAnimationControls();
  window.addEventListener('argentinia:animation-policy-changed', onAnimationPolicyChanged);

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

  const onAudioSettingsChanged = () => refreshAudioControls();
  window.addEventListener('argentinia:audio-settings-changed', onAudioSettingsChanged);

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
  const challengeInvitesBtn=overlay.querySelector('#opt-challenge-invites');
  challengeInvitesBtn?.addEventListener('click',()=>{const enabled=setChallengeInvitesEnabled(!getChallengeInvitesEnabled());challengeInvitesBtn.textContent=enabled?gameText('options.enabled'):gameText('options.off');});

  if (state.currentUser) {
    const deleteAccountEntryBtn = overlay.querySelector('#opt-delete-account');
    deleteAccountEntryBtn.addEventListener('click', async () => {
      // El botón de Opciones todavía NO elimina nada: primero consulta reservas para decidir
      // si puede abrir el modal. Como ese preflight puede tardar varios segundos, damos
      // feedback inmediato con spinner pero conservamos literalmente el texto del botón.
      // La operación destructiva sigue ocurriendo únicamente dentro del modal de confirmación.
      const entryLabel = deleteAccountEntryBtn.textContent || '🗑️ Borrar mi cuenta (colección, puntos, todo)';
      await withEconomyButtonPending(deleteAccountEntryBtn, async () => {
        // 23.21.0 Mercado de Pases: una cuenta con cartas reservadas no puede borrarse.
        // El guard real vive además en Rules 23.13.81; este preflight sólo evita una UX
        // confusa y explica qué tiene que liberar el jugador antes de volver a intentar.
        try {
          const market = await getTradeMarket();
          const reservation = market?.ownReservation || {};
          if ((Array.isArray(reservation.activeListingIds) && reservation.activeListingIds.length > 0) || reservation.activeListingId || (Array.isArray(reservation.activeOfferIds) && reservation.activeOfferIds.length > 0)) {
            showSimpleAlertModal(gameText('account.delete.tradeReserved'));
            return;
          }
        } catch (err) {
          // Si el preflight no responde, no fingimos autoridad en cliente: Rules decide.
          console.warn('No se pudo verificar reservas antes de borrar cuenta; continúa el guard server-side.', err);
        }
        showDeleteAccountModal(async () => {
          try {
            await deleteUserProfile(state.currentUser.uid);
            state.userProfile = null;
            logMsg(gameText('account.delete.success'));
            location.reload();
          } catch (err) {
            console.error('No se pudo borrar la cuenta:', err);
            // Un permission-denied puede ser justamente el guard de reservas 23.13.81.
            // Reconsultamos sólo para dar un mensaje útil; si no, conservamos el error genérico.
            try {
              const market = await getTradeMarket();
              const reservation = market?.ownReservation || {};
              if ((Array.isArray(reservation.activeListingIds) && reservation.activeListingIds.length > 0) || reservation.activeListingId || (Array.isArray(reservation.activeOfferIds) && reservation.activeOfferIds.length > 0)) {
                logMsg(gameText('account.delete.tradeReserved'));
                return;
              }
            } catch {}
            logMsg(gameText('account.delete.error'));
          }
        }, () => {});
      }, {
        pendingLabel: entryLabel,
        slowAfterMs: 0
      });
    });
  }

  overlay.querySelector('#opt-back').addEventListener('click', () => {
    window.removeEventListener('argentinia:animation-policy-changed', onAnimationPolicyChanged);
    window.removeEventListener('argentinia:audio-settings-changed', onAudioSettingsChanged);
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

export function showDeckSelectionModal(onChoose, titleOverrides = {}, onCancel, options = {}) {
  injectDeckSelectionStyles();
  injectEncyclopediaStyles(); // reusa .encyclopedia-back-btn para "Volver"

  const mandatory = options?.mandatory === true;
  const overlay = document.createElement('div');
  overlay.id = options?.overlayId || 'deck-select-overlay';

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

  overlay.innerHTML = `
    <div class="deck-select-panel">
      ${mandatory
        ? `<button class="encyclopedia-back-btn" id="deckselect-exit" style="margin-bottom: 12px;">${escapeHtml(options?.exitText || gameText('account.logout'))}</button>`
        : '<button class="encyclopedia-back-btn" id="deckselect-back" style="margin-bottom: 12px;">← Volver</button>'}
      <div class="deck-select-title">${title}</div>
      <div class="deck-select-subtitle">${subtitle}</div>
      <div class="deck-select-status" id="deckselect-status" role="status" aria-live="polite"></div>
      <div class="deck-select-mono-row">${monoButtonsHTML}</div>
      <div class="deck-select-divider">o combina dos colores</div>
      <div class="deck-select-pairs-grid">${pairButtonsHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector('#deckselect-status');
  const choiceButtons = [...overlay.querySelectorAll('[data-mono], [data-pair]')];
  let busy = false;
  let closed = false;

  const closeOverlay = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    try { options?.onClose?.(); } catch (err) { console.warn('Error cerrando selector de mazo:', err); }
  };

  const setBusy = (value, message = '') => {
    busy = !!value;
    choiceButtons.forEach(btn => { btn.disabled = busy; });
    const exitBtn = overlay.querySelector('#deckselect-exit');
    if (exitBtn) exitBtn.disabled = busy;
    if (statusEl) {
      statusEl.textContent = message || '';
      statusEl.classList.toggle('deck-select-status-error', false);
    }
  };

  const failInline = (err) => {
    console.error('No se pudo completar la selección de mazo:', err);
    busy = false;
    choiceButtons.forEach(btn => { btn.disabled = false; });
    const exitBtn = overlay.querySelector('#deckselect-exit');
    if (exitBtn) exitBtn.disabled = false;
    if (statusEl) {
      statusEl.textContent = options?.errorText || gameText('account.starter.inlineError');
      statusEl.classList.add('deck-select-status-error');
    }
  };

  const commitChoice = async (identity) => {
    if (busy || closed) return;
    if (!mandatory) {
      showMatchLoadingBeforeGameplayCommit();
      closeOverlay();
      onChoose(identity);
      return;
    }
    setBusy(true, options?.savingText || '');
    try {
      const accepted = await onChoose(identity);
      if (accepted === false) throw new Error('DECK_SELECTION_NOT_ACCEPTED');
      closeOverlay();
    } catch (err) {
      failInline(err);
    }
  };

  if (mandatory) {
    overlay.querySelector('#deckselect-exit')?.addEventListener('click', async () => {
      if (busy || closed) return;
      setBusy(true, '');
      try {
        await options?.onExit?.();
        closeOverlay();
      } catch (err) {
        failInline(err);
      }
    });
  } else {
    overlay.querySelector('#deckselect-back').addEventListener('click', () => {
      closeOverlay();
      if (onCancel) onCancel();
    });
  }

  overlay.querySelectorAll('[data-mono]').forEach(btn => {
    btn.addEventListener('click', () => {
      void commitChoice([btn.getAttribute('data-mono')]);
    });
  });

  overlay.querySelectorAll('[data-pair]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-pair');
      void commitChoice([key[0], key[1]]);
    });
  });

  return overlay;
}

let desktopZoneHoverInteractionsInstalled = false;
let desktopZoneHoverPreview = null;
let desktopZoneHoverSource = null;

function clearDesktopZoneHoverPreview() {
  desktopZoneHoverPreview?.remove?.();
  desktopZoneHoverPreview = null;
  desktopZoneHoverSource = null;
}

function showDesktopZoneHoverPreview(cardEl) {
  if (!cardEl || typeof document === 'undefined') return;
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) return;
  if (desktopZoneHoverSource === cardEl && desktopZoneHoverPreview?.isConnected) return;
  clearDesktopZoneHoverPreview();

  const rect = cardEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pad = 12;
  const targetScale = 2.15; // HF11: materially larger than legacy 1.15x, readable text on desktop.
  const scale = Math.max(1, Math.min(
    targetScale,
    (window.innerWidth - pad * 2) / rect.width,
    (window.innerHeight - pad * 2) / rect.height
  ));
  const displayW = rect.width * scale;
  const displayH = rect.height * scale;
  const centerX = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(pad, window.innerWidth - displayW - pad),
    Math.max(pad, centerX - displayW / 2)
  );
  // Keep a TOP transform origin/growth direction. Only translate the whole portal upward
  // when the source sits too low to keep the complete enlarged card inside the viewport.
  const top = Math.min(
    Math.max(pad, rect.top),
    Math.max(pad, window.innerHeight - displayH - pad)
  );

  const preview = cardEl.cloneNode(true);
  preview.querySelectorAll?.('[id]').forEach?.(node => node.removeAttribute('id'));
  preview.classList.remove('zone-browser-card-slot');
  preview.classList.add('zone-card-hover-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.setProperty('--zone-hover-scale', String(scale));
  preview.querySelectorAll?.('img').forEach?.(img => { img.draggable = false; });
  document.body.appendChild(preview);
  desktopZoneHoverPreview = preview;
  desktopZoneHoverSource = cardEl;
}

function installDesktopZoneBrowserHoverInteractions() {
  if (desktopZoneHoverInteractionsInstalled || typeof document === 'undefined') return;
  desktopZoneHoverInteractionsInstalled = true;
  const cardFromEvent = event => event?.target?.closest?.('.zone-browser-card-slot') || null;
  document.addEventListener('pointerover', event => {
    const cardEl = cardFromEvent(event);
    if (!cardEl || event.pointerType === 'touch') return;
    if (cardEl.contains(event.relatedTarget)) return;
    showDesktopZoneHoverPreview(cardEl);
  }, true);
  document.addEventListener('pointerout', event => {
    const cardEl = cardFromEvent(event);
    if (!cardEl || cardEl !== desktopZoneHoverSource) return;
    if (cardEl.contains(event.relatedTarget)) return;
    clearDesktopZoneHoverPreview();
  }, true);
  document.addEventListener('scroll', clearDesktopZoneHoverPreview, true);
  window.addEventListener?.('resize', clearDesktopZoneHoverPreview, { passive:true });
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
    .private-zone-opaque-card {
      border: 2px solid rgba(212,175,55,.48); border-radius: 8px;
      background: radial-gradient(circle at 35% 28%, #3b465b 0%, #252940 42%, #171a2b 100%);
      color: #f7e9bd; display:flex; align-items:center; justify-content:center;
      box-shadow: inset 0 0 0 2px rgba(0,0,0,.32), 0 6px 16px rgba(0,0,0,.35);
    }
    .private-zone-card-back {
      height:100%; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:7px; text-align:center; padding:8px; box-sizing:border-box;
    }
    .private-zone-card-back > span { font-size:34px; line-height:1; }
    .private-zone-card-back > small { font-size:10px; line-height:1.15; color:#e7dec7; }
    .mulligan-card-hover-preview {
      position: fixed !important; z-index: 10020 !important; margin: 0 !important;
      pointer-events: none !important; transform: scale(2) !important; transform-origin: top left !important;
      box-shadow: 0 18px 48px rgba(0,0,0,.62), 0 0 0 1px rgba(212,175,55,.55) !important;
      transition: none !important; filter: none !important;
    }
    .mulligan-card-slot.chosen {
      box-shadow: 0 0 0 3px #e74c3c, 0 0 16px rgba(231,76,60,0.6) !important;
      outline: 2px solid rgba(255,210,205,.92) !important; outline-offset: 2px;
    }
    .proliferate-selection-count {
      margin-top:-14px; margin-bottom:12px; color:#f0d56a; font-weight:800;
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
// Scry N / Chusmeá N: mirás las N cartas de arriba del mazo y decidís, una por una, si se
// quedan arriba o se van — al fondo del mazo (Scry) o al cementerio (Chusmeá). Reusa el
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

// Amplificar: a diferencia de Scry/Chusmeá (cartas de la mano/mazo), acá elegimos entre
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
  const updateSelectionCount = () => {
    const hint = overlay.querySelector('#proliferate-selection-count');
    if (hint) hint.textContent = gameText('proliferate.selectionCount', { selected: chosen.size, total: eligible.length });
  };
  const sanitizeChoiceCard = (cardEl) => {
    // Un clon modal no debe heredar halos de interacción del tablero. En 23.19.2, como
    // index=null y pendingBlockerIndex=null, todas las criaturas se pintaban además como
    // selected-blocker; ese azul !important tapaba visualmente el rojo de .chosen.
    cardEl?.classList?.remove('selected-blocker', 'crewing-selected', 'targetable', 'mana-payable', 'paying', 'attacking', 'blocking');
    return cardEl;
  };

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${gameTextHtml('proliferate.title')}</div>
      <div class="mulligan-subtitle">${gameTextHtml('proliferate.subtitle')}</div>
      <div class="mulligan-subtitle proliferate-selection-count" id="proliferate-selection-count">${gameTextHtml('proliferate.selectionCount', { selected: 0, total: eligible.length })}</div>
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
      updateSelectionCount();
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
    cardEl = sanitizeChoiceCard(createCardElement(entry.item, !!entry.item.tapped, entry.ownerIsLocal, null, modalZone, toggle));
    cardEl.classList.add('mulligan-card-slot', 'selectable', 'proliferate-choice-card');
    const counterLabels = (entry.counterTypes || []).map(type => ({ plusOne:'+1/+1', minusOne:'-1/-1', shield:'Escudo', stun:'Aturdimiento', lore:'Capítulo', loyalty:'Creencia' }[type] || type));
    if (counterLabels.length) cardEl.title = `Amplificar agrega 1 de: ${counterLabels.join(', ')}`;
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

// Zafar: elegir N cartas del cementerio para exiliar como costo adicional. Mismo
// esqueleto exacto que showBottomCardsModal (selección hasta llegar a la cantidad exacta,
// confirmar deshabilitado hasta entonces) — reusamos buildMulliganCardRow porque acá los
// elegibles SON cartas de verdad (del cementerio), a diferencia de Amplificar que elige
// permanentes del campo.
export function showEscapeExileModal(graveyardCards, exileCount, onConfirm) {
  const entries = graveyardCards.map((card, index) => ({ card, index }));
  showGraveyardChoiceModal(
    entries,
    exileCount,
    'Zafar',
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
// maná del color correspondiente (o Vaquita). No muta vida hasta el commit 601.2h.
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
      <div class="mulligan-subtitle" style="margin-bottom:8px;">${gameTextHtml('cost.phyrexian.choice.explain')}</div>
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
    btn.textContent=`{${color}/P} → PAGAR 2 VIDAS`;
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

// 23.15.4 — selector opcional de recursos de pago (Vaquita/Rebuscar). A diferencia de los
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
    els.gameOverRewardStatus.textContent = state.currentTournamentMatch
      ? gameText('tournament.match.settling')
      : (state.currentUser ? (state.currentMatch ? gameText('game.points.pvpChecking') : gameText('game.points.botChecking')) : '');
    els.gameOverRewardStatus.classList.toggle('hidden', !els.gameOverRewardStatus.textContent);
  }
  // HF18 — el mismo nodo se reutiliza entre modos. Torneo cambia su copy a
  // "VOLVER AL FIXTURE", por lo que cada game-over debe rehidratar explícitamente
  // label + disabled y no heredar estado DOM de una partida anterior.
  if (els.btnRestart) {
    const tournamentGameOver = !!state.currentTournamentMatch;
    els.btnRestart.textContent = gameText(tournamentGameOver ? 'tournament.match.returnFixture' : 'game.over.backMenu');
    els.btnRestart.disabled = tournamentGameOver;
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
  // Sagas y Equipamientos conservan estado POR INSTANCIA y no pueden colapsarse
  // visualmente por card.id. Dos copias del mismo Equipo pueden estar adjuntas a criaturas
  // distintas; si se apilan acá, el click siempre cae en group.ready[0] y reequipa la
  // primera copia en vez de permitir activar la segunda (bug real: Atado con Alambre).
  if (zoneType === 'support' && (isSagaCard(item?.card) || !!item?.card?.equipment)) {
    const instanceKey = item?._syncObjectId || item?.card?.instanceId || item?._effectObjectId || `${baseKey}_${idx}`;
    const kind = isSagaCard(item?.card) ? 'saga' : 'equipment';
    return `${kind}_${instanceKey}`;
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
        // rival, por eso Daga Escondida no explicaba que Al toque sólo permite lanzarla.
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

function resolvedEffectTargetInstruction(choice) {
  const card=choice?.cardName || choice?.options?.cardName || choice?.options?.sourceCard?.name || 'Esta habilidad';
  const effect=choice?.options?.effect || choice?.effect || {};
  const type=String(effect?.type||'');
  if(type==='exile_creature' || type==='exile') return gameText('target.resolved.exileCreature',{card});
  if(type==='destroy' || type==='destroy_creature') return gameText('target.resolved.destroyCreature',{card});
  if(type==='damage' || type==='deal_damage') return gameText('target.resolved.damage',{card});
  if(type==='bounce' || type==='return_to_hand') return gameText('target.resolved.bounce',{card});
  if(type==='add_counter') return gameText('target.resolved.addCounter',{card});
  return gameText('target.resolved.generic',{card});
}

function renderResolvedEffectTargetHint() {
  if (typeof document === 'undefined') return;
  let el=document.getElementById('resolved-effect-target-hint');
  const choice=state.pendingResolvedEffectTargetChoice;
  if(!choice){el?.remove();return;}
  if(!el){
    el=document.createElement('div');el.id='resolved-effect-target-hint';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.style.cssText='position:fixed;left:50%;bottom:112px;transform:translateX(-50%);z-index:7003;pointer-events:none;max-width:min(760px,82vw);background:rgba(4,8,6,.92);border:1px solid rgba(255,187,52,.55);border-radius:999px;padding:8px 16px;color:#fff2cf;font-size:12px;font-weight:800;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,.42);';
    document.body.appendChild(el);
  }
  el.textContent=resolvedEffectTargetInstruction(choice);
  const type=String(choice?.options?.effect?.type||choice?.effect?.type||'');
  const destructive=['exile_creature','exile','destroy','destroy_creature','damage','deal_damage','bounce','return_to_hand'].includes(type);
  el.style.borderColor=destructive?'rgba(255,92,92,.72)':'rgba(255,187,52,.55)';
  el.style.color=destructive?'#ffd8d8':'#fff2cf';
}

function syncPaymentActionRow(isPaying) {
  const turnControls = els.btnEndTurn?.closest?.('.turn-controls');
  if (!turnControls || !els.btnCancelSpell || !els.paymentControls) return;
  if (isPaying) {
    if (els.btnCancelSpell.parentElement !== turnControls) {
      turnControls.insertBefore(els.btnCancelSpell, els.btnAbandonGame || null);
    }
  } else if (els.btnCancelSpell.parentElement !== els.paymentControls) {
    els.paymentControls.appendChild(els.btnCancelSpell);
  }
}

export function render() {
  if (HEADLESS_ENGINE) {
    try { captureTelemetryState('headless_render'); } catch {}
    return;
  }
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

  els.localPlaneswalkers.innerHTML = ''; state.localPlaneswalkers.forEach((item, idx) => els.localPlaneswalkers.appendChild(createCardElement(item, !!item.tapped, true, idx, 'planeswalker')));
  els.rivalPlaneswalkers.innerHTML = ''; state.rivalPlaneswalkers.forEach((item, idx) => els.rivalPlaneswalkers.appendChild(createCardElement(item, !!item.tapped, false, idx, 'planeswalker')));

  els.localCombat.innerHTML = ''; state.localCombat.forEach((item, idx) => els.localCombat.appendChild(createCardElement(item, item.tapped, true, idx, 'combat')));
  els.rivalCombat.innerHTML = ''; state.rivalCombat.forEach((item, idx) => els.rivalCombat.appendChild(createCardElement(item, item.tapped, false, idx, 'combat')));
  
  // UI-POLISH-3: si el target legal es un JUGADOR, la superficie visual/clickeable es el
  // badge entero — avatar + nombre + HP — y no la barrita de vida de 8px. Para efectos que
  // dicen explícitamente opponent_player tampoco iluminamos falsamente el badge propio.
  let allowLocalPlayerTarget = false;
  let allowRivalPlayerTarget = false;
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    if (rules.allowPlayer) {
      allowLocalPlayerTarget = true;
      allowRivalPlayerTarget = true;
      if (state.pendingTargetCard.effect?.target === 'opponent_player') allowLocalPlayerTarget = false;
    }
  } else if (state.pendingMultiTargetChoice) {
    const mtc = state.pendingMultiTargetChoice;
    const spec = mtc.card?.targets?.[mtc.currentIndex];
    const rules = spec ? getTargetRules({ effect: spec.effect }) : null;
    if (rules?.allowPlayer) {
      allowLocalPlayerTarget = true;
      allowRivalPlayerTarget = true;
      if (spec.effect?.target === 'opponent_player') allowLocalPlayerTarget = false;
    }
  }
  els.rivalPlayerCard?.classList.toggle('targetable', allowRivalPlayerTarget);
  els.localPlayerCard?.classList.toggle('targetable', allowLocalPlayerTarget);
  // Limpieza de compatibilidad: versiones anteriores aplicaban targetable al hp-bar-container.
  els.rivalHpBar?.parentElement?.classList.remove('targetable');
  els.localHpBar?.parentElement?.classList.remove('targetable');

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
  const localLife=Math.max(0,Number(state.localHP)||0), rivalLife=Math.max(0,Number(state.rivalHP)||0);
  els.localHpText.textContent = `${localLife} HP${localPoisonText}`; els.rivalHpText.textContent = `${rivalLife} HP${rivalPoisonText}`;
  els.localHpBar.style.width = `${Math.min(100,(localLife / 20) * 100)}%`; els.rivalHpBar.style.width = `${Math.min(100,(rivalLife / 20) * 100)}%`;
  renderResolvedEffectTargetHint();

  // --- 1. GESTIÓN VISUAL DEL HUD Y FASES ---
  renderTurnPriorityHud();

// 23.9.1: progreso de fase mínimo — puntos + tooltip, sin texto persistente.
  renderPhaseProgress();

  // --- 2. GESTIÓN DEL BOTÓN DE ACCIÓN / PASAR PRIORIDAD ---
  // BUGFIX: antes solo chequeaba damageModalOpen/pendingRampChoice — "Pasar Prioridad"
  // (botón O el atajo de la barra espaciadora) se podía disparar mientras CUALQUIER otra
  // elección a medio resolver seguía esperando tu click (tripular, pagar Impuesto, elegir
  // modo, elegir objetivos, Scry/Chusmeá, Amplificar, Zafar, Yapa, contrarrestar a
  // menos que pagues, etc.) — arriesgando una condición de carrera con esa resolución.
  // Misma lista que ya usa canPlayCard (más pendingTargetCard/pendingSacrificeChoice/
  // pendingHybridLifePayment, que faltaban ahí también).
  const anyPendingChoice = !!state.pendingSuspendTransaction || !!state.pendingSuspendCastChoice || !!state.pendingCastTransaction || !!state.pendingAlternativeCostChoice || !!state.pendingPrivateZoneChoice || !!state.pendingLandSearchChoice || !!state.pendingLibraryChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingActivatedAbilityChoice !== null ||
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

  // 23.19.4.6 — lectura pura para UX. La auto-declaración de cero bloqueadores ya
  // NO vive en render(): turnManager la ejecuta al entregar esta ventana de prioridad.
  // Acá sólo calculamos el estado visual por si un snapshot intermedio llega a pantalla.
  let autoZeroBlockersPending = false;
  if (!multiplayerInteractionBlocked && state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local' && (state.consecutivePasses || 0) === 1 && !state.localBlockersDeclaredThisCombat) {
    const attackers = state.rivalCombat.filter(attacker => attacker.isAttacking);
    const hasLegalBlocker = state.localCombat.some(defender => !defender.tapped && attackers.some(attacker => canBlock(attacker, defender)));
    autoZeroBlockersPending = !hasLegalBlocker;
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
      els.btnEndTurn.onclick = executeRivalAttack;
      els.btnEndTurn.disabled = multiplayerInteractionBlocked;
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
    syncPaymentActionRow(true);
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
      statusText = `⏳ Poniendo en espera ${state.pendingSuspendTransaction.card.name} — pagá ${state.pendingSuspendTransaction.spec.cost}`;
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
        const phyrexianLifeReserved = Math.max(0, Number(state.pendingCastTransaction?.preparedPaymentMethods?.phyrexianLifeAmount) || 0);
        if (phyrexianLifeReserved > 0) statusText += gameText('cost.phyrexian.lifeReserved', { life: phyrexianLifeReserved });
        if (state.pendingAlternativeCostChosen && pendingCard?.alternativeCost) statusText += gameText('payment.altSuffix', { cost: describeCompositeCost(pendingCard.alternativeCost) });
      }
    }
    els.paymentStatus.textContent = statusText;

    // Punto 14: el costo alternativo puede combinar maná/vida/descarte/sacrificio/exilio.
    // Sólo se ofrece antes de comprometer una vía, nunca sobre Otra vuelta/Zafar, y sólo si
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
      statusText = `⏳ Poniendo en espera ${state.pendingSuspendTransaction.card.name} — pagá ${state.pendingSuspendTransaction.spec.cost}`;
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
    syncPaymentActionRow(false);
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
      ${gameTextHtml('damage.modal.intro', { attacker: attacker.name, power: totalDamage })}<br>
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
               ${gameTextHtml('damage.modal.toughness', { hp })} ${needed > 0 ? gameTextHtml('damage.modal.lethal', { needed }) : gameTextHtml('damage.modal.noMore')}
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
      const overflowNoun = attackerItem.attackTarget ? 'Creencia' : 'HP';
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
  etb:'entrada al campo', creature_etb:'entrada de criatura', land_etb:'Arraigo', spell_cast:'hechizo lanzado',
  dies:'al morir', any_creature_dies:'muerte de criatura', opponent_death:'muerte rival', attack:'al atacar',
  any_creature_attacks:'ataque', block:'al bloquear', combat_damage:'daño de combate', upkeep:'mantenimiento',
  end_step:'paso final', permanent_entered:'entrada de permanente', creature_entered:'entrada de criatura',
  land_entered:'entrada de Tierra', creature_died:'muerte de criatura', spell_cast_generic:'hechizo lanzado',
  attack_declared:'ataque declarado', block_declared:'bloqueo declarado', combat_damage_dealt:'daño de combate',
  card_drawn:'robo de carta', card_discarded:'descarte', permanent_sacrificed:'sacrificio', life_gained:'vida ganada',
  life_lost:'vida perdida', counter_added:'contador agregado', counter_removed:'contador removido', token_created:'ficha creada',
  permanent_tapped:'permanente girado', spell_countered:'hechizo contrarrestado', spell_copied:'hechizo copiado',
  ability_copied:'habilidad copiada', permanent_became_copy:'permanente copiado', permanent_transformed:'transformación',
  saga_chapter:'capítulo de Crónica', suspend_tick:'En espera — Tiempo', suspend_cast:'En espera — último Tiempo'
});

function triggerOrderEffectSummary(effect = {}) {
  const labels = {
    draw:'Robá', heal:'Ganás vida', damage:'Hacé daño', drain:'Drená vida', fight:'Peleá', ramp:'Buscá una Tierra',
    create_tokens:'Creá fichas', discard:'Descartá', sacrifice:'Sacrificá', reanimate:'Reanimá', search_land:'Buscá una Tierra',
    search_library:'Buscá en tu biblioteca', look_at_top:'Mirá la parte superior', scry:'Anticipá', surveil:'Chusmeá', proliferate:'Amplificá'
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
