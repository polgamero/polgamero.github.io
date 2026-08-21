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
  handlePlayerTargetClick,
  cancelPayment,
  payWithAlternativeCost,
  canPayCastCompositeNonManaCosts,
  payWard,
  payCounterTax,
  activateLoyaltyAbility,
  castFromGraveyard,
  canManaSourcePayPendingCost,
  checkGameOver,
  checkAuraLegality,
  checkEquipmentLegality,
  publishMatchState,
  passPriority // Importado del nuevo sistema
} from './main.js';

import { executeLocalAttack, executeRivalAttack } from './combatRules.js';
import { renderStack, spellStack } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { generatePackCards, generateGuaranteedMythicCard, isSacrificeCandidate, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming, describeCompositeCost } from './utils.js';
import { signInWithGoogle, signOutUser, purchasePack, openInventoryPack, openGuaranteedMythic, claimDailyReward, craftEnhancement, deleteUserProfile, renameUsername, createDeck, updateDeck, deleteDeck, saveGameConfig, ensureClassifiedsSchedule, createMatch, joinMatchByCode, listenToMatch, cancelMatch, fetchAllUserProfiles, adminGrantCurrency, adminGrantCurrencyToAll, adminGrantPacks, adminGrantPacksToAll, adminAdvanceDailyRewardDebugDay, adminResetDailyRewardDebug, registerDailyLogin, logAdminAction, fetchAnnouncements, postAnnouncement, deleteAnnouncement, fetchTelemetrySessionsForAdmin, fetchTelemetrySessionArchive } from './firebaseClient.js';
import { PACK_COST, FICHAS_PER_ENHANCEMENT, ENHANCEMENT_KEYWORDS, DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, ENHANCED_SUFFIX, POINTS, MYTHIC_CHANCE_IN_RARE_SLOT, CLASSIFIEDS_COMMON_POINTS, CLASSIFIEDS_COMMON_FICHAS, CLASSIFIEDS_UNCOMMON_POINTS, CLASSIFIEDS_UNCOMMON_FICHAS, CLASSIFIEDS_RARE_POINTS, CLASSIFIEDS_RARE_FICHAS, CLASSIFIEDS_MYTHIC_POINTS, CLASSIFIEDS_MYTHIC_FICHAS, CLASSIFIEDS_MYTHIC_CHANCE, applyGameConfig, getDefaultGameConfig } from './store.js';
import { canBlock, hasKeyword } from './keywords.js';
import { ALL_COLORS, GUILD_PAIRS } from './utils.js';
import { recordTelemetryUiLog, captureTelemetryState } from './telemetry.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, ENGINE_VERSION_SHORT } from './version.js';
import { getPriorityUxCopy, getEffectivePriorityActivity, canPriorityClockRun, PRIORITY_CLOCK_DURATION_MS } from './priorityUX.js';
import { DAILY_REWARD_SCHEDULE, normalizeInventory, normalizeDailyRewardsState, unclaimedUnlockedDays, CHEST_ITEM_KEYS, rewardForDay } from './rewards.js';
import { showPackOpeningExperience, showGuaranteedMythicExperience } from './packOpening.js';
import { applyCardZoom } from './cardZoom.js';
import { announcePhaseTransition } from './phaseBanner.js';
import { buildDeckComposition, formatManaValue } from './deckComposition.js';
import { buildDeckStatistics, analyzeDeckHealth, simulateOpeningHands } from './deckStatistics.js';
import { getCardBrowserSortOptions, normalizeCardBrowserSort, compareCardsForBrowser } from './cardBrowser.js';
import { registerCardArtImage, hasCustomArtLayout, ensureArtLayoutsLoaded } from './artLayout.js';
import { openArtLayoutEditor } from './artLayoutEditor.js';
import { USERNAME_RENAME_COST } from './usernames.js';
import { showUsernameRenameModal } from './usernameUI.js';

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
  btnRestart: document.getElementById('btn-restart'),
  btnAbandonGame: document.getElementById('btn-abandon-game'),

  paymentControls : document.getElementById('payment-controls'),
  paymentStatus : document.getElementById('payment-status'),
  btnCancelSpell : document.getElementById('btn-cancel-spell'),
  btnAltCost : document.getElementById('btn-alt-cost'),
  btnPayWard : document.getElementById('btn-pay-ward'),
  btnPayCounterTax : document.getElementById('btn-pay-counter-tax'),

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
        <h3>🔀 ${card.name} — Elegí un modo</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        ${modesHTML}
        <button id="modal-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">❌ Cancelar</button>
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
  injectMulliganStyles();
  const untappedLands = state.localLands.filter(l => !l.tapped).length;
  const untappedRocks = state.localSupport.filter(s => !s.tapped && (s.card.produces || s.card.producesOptions)).length;
  const baseCost = { ...card };
  const restOfCostSymbols = (card.manaCost.match(/\{[^}]+\}/g) || []).filter(s => s !== '{X}').length;
  const roughMaxX = Math.max(0, (untappedLands + untappedRocks) - restOfCostSymbols);

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 380px;">
      <div class="gy-modal-header">
        <h3>✨ ${card.name}</h3>
      </div>
      <div style="padding: 20px; text-align: center;">
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 14px;">${renderInlineGameSymbols(card.text || '')}</p>
        <p style="color:#a89bb5; font-size: 12px; margin-bottom: 16px;">Maná disponible aprox.: podés pagar hasta X = ${roughMaxX} (con lo que tenés sin girar ahora).</p>
        <div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom: 20px;">
          <button id="x-minus" class="mulligan-btn mulligan-btn-mull" style="padding: 8px 16px;">−</button>
          <span id="x-value-display" style="font-size: 28px; font-weight: bold; color: var(--gold, #d4af37); min-width: 50px;">0</span>
          <button id="x-plus" class="mulligan-btn mulligan-btn-mull" style="padding: 8px 16px;">+</button>
        </div>
        <div class="mulligan-buttons">
          <button id="x-cancel" class="mulligan-btn mulligan-btn-mull">❌ Cancelar</button>
          <button id="x-confirm" class="mulligan-btn mulligan-btn-keep">Confirmar X</button>
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
  injectMulliganStyles();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 420px;">
      <div class="gy-modal-header">
        <h3>💰 ¡Te amenazan con contrarrestar!</h3>
      </div>
      <div style="padding: 20px; text-align: center;">
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 18px;">
          Tu rival quiere contrarrestar <strong>"${targetCardName}"</strong> a menos que pagues {${amount}}.
        </p>
        <div class="mulligan-buttons">
          <button id="counter-tax-decline" class="mulligan-btn mulligan-btn-mull">❌ No pagar</button>
          <button id="counter-tax-pay" class="mulligan-btn mulligan-btn-keep">💰 Pagar {${amount}}</button>
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

export function showRampLandChoiceModal(availableColors, cardName, onChoose) {
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
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 18px;">¿Qué color de tierra básica buscás en tu mazo?</p>
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
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const bonusText = card.kicker.bonusText || 'un bonus adicional';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header">
        <h3>💪 ${card.name} — Kicker</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0 0 4px;">Podés pagar ${renderInlineGameSymbols(card.kicker.cost)} adicional. Si lo hacés: ${bonusText}.</p>
        <button class="loyalty-ability-btn" id="kicker-yes" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">💪 Sí, pagar Kicker ${renderInlineGameSymbols(card.kicker.cost)}</span>
        </button>
        <button class="loyalty-ability-btn" id="kicker-no" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">➡️ No, lanzarlo sin Kicker</span>
        </button>
        <button id="modal-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">❌ Cancelar</button>
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
  injectMulliganStyles();
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 460px;">
      <div class="gy-modal-header"><h3>🔀 ${card.name} — Vía de casteo</h3></div>
      <div style="display:flex; flex-direction:column; gap:10px; padding:16px;">
        <p style="color:#cfe0d4;font-size:13px;margin:0 0 4px;">Elegí el costo base antes de declarar objetivos.</p>
        <button class="loyalty-ability-btn" id="cast-normal"><span class="loyalty-ability-text">💠 Normal: ${renderInlineGameSymbols(card.manaCost || '{0}')}</span></button>
        <button class="loyalty-ability-btn" id="cast-alt"><span class="loyalty-ability-text">🔀 Alternativo: ${renderInlineGameSymbols(alternativeLabel)}</span></button>
        <button id="cast-route-cancel" class="mulligan-btn mulligan-btn-mull">❌ Cancelar</button>
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
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.className = 'gy-modal-overlay';
  const amount = Math.max(0, Number(offer?.amount || 0));
  const chosen = new Set();
  const zoneLabel = offer?.zone === 'deck' ? 'mazo rival' : 'mano rival';
  overlay.innerHTML = `
    <div class="gy-modal-content" style="max-width:760px;">
      <div class="gy-modal-header"><h3>🔐 ${cardName || 'Efecto'} — ${zoneLabel}</h3></div>
      <div style="padding:16px;">
        <p id="private-zone-hint" style="color:#cfe0d4;font-size:13px;">Elegí ${amount} carta${amount===1?'':'s'} · 0/${amount}</p>
        <div id="private-zone-row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:16px 0;"></div>
        <div class="mulligan-buttons">
          ${onCancel ? '<button id="private-zone-cancel" class="mulligan-btn mulligan-btn-mull">❌ Cancelar</button>' : ''}
          <button id="private-zone-confirm" class="mulligan-btn mulligan-btn-keep" disabled>Confirmar elección</button>
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
      btn.title = 'Esta carta fue revelada, pero no cumple la restricción de elección.';
    }
    if (offer.visibility === 'reveal_candidates' && entry.card) {
      btn.innerHTML = `<span class="loyalty-ability-text"><strong>${entry.card.name || 'Carta'}</strong><br><small>${entry.card.type || ''}</small></span>`;
    } else {
      btn.innerHTML = `<span class="loyalty-ability-text" style="font-size:30px;">🂠<br><small>Carta ${idx + 1}</small></span>`;
      btn.title = 'Carta privada: identidad no revelada';
    }
    btn.addEventListener('click', () => {
      if (entry.selectable === false) return;
      const token = entry.token;
      if (chosen.has(token)) { chosen.delete(token); btn.classList.remove('chosen'); }
      else if (chosen.size < amount) { chosen.add(token); btn.classList.add('chosen'); }
      hint.textContent = `Elegí ${amount} carta${amount===1?'':'s'} · ${chosen.size}/${amount}`;
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
        <h3>🏳️ ¿Abandonar la partida?</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0 0 4px;">Vas a perder puntos por abandonar — más de lo que perderías si jugás hasta el final y perdés. Esto no se puede deshacer.</p>
        <button class="loyalty-ability-btn" id="abandon-yes" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">🏳️ Sí, abandonar de todos modos</span>
        </button>
        <button id="abandon-cancel" class="mulligan-btn mulligan-btn-mull" style="margin-top: 6px;">❌ Seguir jugando</button>
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
    if (ability.crewCost !== undefined) return `Tripular ${ability.crewCost}`;
    const effect = ability.effect || {};
    const labels = {
      draw: 'Robar cartas', heal: 'Ganar vida', damage: 'Hacer daño', drain: 'Drenar vida',
      fight: 'Pelear', attach_equipment: 'Equipar', exile_creature: 'Exiliar criatura',
      exile_and_return: 'Exiliar y devolver', ramp: 'Buscar tierra', create_tokens: 'Crear fichas',
      grant_keyword_temp: 'Otorgar habilidad', draw_and_lose_life: 'Robar y perder vida',
      discard: 'Descartar', sacrifice: 'Sacrificar', reanimate: 'Reanimar',
      scry: 'Adivinar', surveil: 'Vigilar', proliferate: 'Proliferar'
    };
    const base = labels[effect.type] || effect.type || 'Habilidad';
    const amount = effect.amount !== undefined ? ` ${effect.amount}` : '';
    return `${base}${amount}`;
  };
  const describeCost = (ability) => {
    if (ability.crewCost !== undefined) return `Tripular ${ability.crewCost}`;
    const bits = [];
    if (ability.cost) bits.push(ability.cost);
    if (ability.sacrifice) {
      const sac = ability.sacrifice === 'self' ? 'Sacrificar esta carta' : `Sacrificar ${ability.sacrifice === 'creature' ? 'criatura' : 'artefacto'}`;
      bits.push(sac);
    }
    return bits.join(', ') || '{0}';
  };

  const optionsHTML = options.map((option, idx) => {
    const sourceSuffix = option.sourceName && option.sourceName !== cardName ? ` — ${option.sourceName}` : '';
    const timing = getActivatedAbilityTiming(option.ability);
    const timingSuffix = timing === 'instant' ? ' · ⚡ Instantánea' : (timing === 'sorcery' ? ' · ⏳ Conjuro' : '');
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
        <h3>⚙️ ${cardName}: elegí una habilidad</h3>
        <button class="gy-close-btn">Cerrar ✖</button>
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
        <h3>🔮 ${pwItem.card.name} (Lealtad: ${pwItem.loyalty})</h3>
        <button class="gy-close-btn">Cerrar ✖</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        ${alreadyUsed ? `<div style="color:#e67e22; font-style:italic;">Ya usaste una habilidad de Lealtad este turno.</div>` : ''}
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
      const cardEl = createCardElement(cardObj, false, isLocal, idx, 'modal');
      cardEl.style.width = '120px';
      cardEl.style.height = '168px';
      gridContent.appendChild(cardEl);
    });
  }

  modalOverlay.querySelector('.gy-close-btn').onclick = () => modalOverlay.remove();
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
}

export function logMsg(msg) {
  recordTelemetryUiLog(msg);
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  els.gameLogBox.appendChild(entry);
  els.gameLogBox.scrollTop = els.gameLogBox.scrollHeight;
}

// 23.13.21 — set visual completo de símbolos de maná, ahora también {0} e incoloro {C}. IMPORTANTE: estas URLs son relativas
// al DOCUMENTO, no al archivo js/ui.js. En GitHub Pages, si la app vive en /argentinia/,
// `./assets/...` resuelve correctamente a /argentinia/assets/... sin asumir el root del dominio.
const MANA_ICON_URLS = Object.freeze({
  W: './assets/images/ui/mana_blanco.png',
  U: './assets/images/ui/mana_azul.png',
  B: './assets/images/ui/mana_negro.png',
  R: './assets/images/ui/mana_rojo.png',
  G: './assets/images/ui/mana_verde.png',
  '0': './assets/images/ui/mana_0.png',
  '1': './assets/images/ui/mana_1.png',
  '2': './assets/images/ui/mana_2.png',
  '3': './assets/images/ui/mana_3.png',
  '4': './assets/images/ui/mana_4.png',
  '5': './assets/images/ui/mana_5.png',
  '6': './assets/images/ui/mana_6.png',
  '7': './assets/images/ui/mana_7.png',
  '8': './assets/images/ui/mana_8.png',
  '9': './assets/images/ui/mana_9.png',
  C: './assets/images/ui/mana_incoloro.png',
  X: './assets/images/ui/mana_x.png',
  T: './assets/images/ui/girar.png'
});

function renderManaIcon(symbol, extraClass = '') {
  const src = MANA_ICON_URLS[symbol];
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
    if (MANA_ICON_URLS[val]) return renderManaIcon(val, 'mana-icon-card-cost');

    // Fallback para símbolos sin PNG propio (hoy principalmente genéricos >9).
    const innerText = val;
    const fontSize = innerText.length >= 2 ? '3.2cqw' : '4.6cqw';
    return `<span class="mana-symbol mana-c" style="font-size:${fontSize};">${innerText}</span>`;
  }).join('');
}

// Para reglas, tierras y modales: W/U/B/R/G, 0..9, C, X y T usan PNG.
// Cualquier genérico sin asset propio (>9) conserva el círculo CSS; otros símbolos permanecen textuales.
export function renderInlineGameSymbols(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/\{([^}]+)\}/g, (match, raw) => {
    const val = String(raw).toUpperCase();
    if (MANA_ICON_URLS[val]) return renderManaIcon(val, 'mana-icon-inline');
    if (/^(?:\d+|C)$/.test(val)) {
      const wide = val.length >= 2 ? ' mana-symbol-inline-wide' : '';
      return `<span class="mana-symbol mana-c mana-symbol-inline${wide}">${val}</span>`;
    }
    return match;
  });
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
  const effectType = card.effect?.type || firstActivated?.effect?.type || firstGranted?.effect?.type;

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
  if (effectType === 'add_counter') {
    // Contador permanente: +1/+1 solo tiene sentido en tu propia criatura (como "pump").
    // -1/-1 es remoción, así que puede apuntar a cualquier lado (como "destroy_creature").
    const counterType = card.effect?.counterType || firstActivated?.effect?.counterType || firstGranted?.effect?.counterType;
    if (counterType === 'minusOne') {
      return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
    }
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
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
  const el = document.createElement('div');
  
  const isSick = itemObj.summoningSickness ? 'sick' : '';
  const isAttacking = itemObj.isAttacking === true ? 'attacking' : '';
  const isBlocking = (itemObj.blockingIndex !== null && itemObj.blockingIndex !== undefined) ? 'blocking' : '';
  const isSelectedBlocker = (state.pendingBlockerIndex === index && zone === 'combat' && isLocal) ? 'selected-blocker' : '';

  let isTargetable = false;
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    if (zone === 'combat') {
      const allowThisSide = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
      const matchesFilter = !rules.creatureFilter || card.type.includes(rules.creatureFilter);
      isTargetable = allowThisSide && matchesFilter;
    } else if (zone === 'support') {
      const allowThisSide = isLocal ? rules.allowLocalPermanent : rules.allowRivalPermanent;
      const matchesFilter = !rules.permanentFilter || card.type.includes(rules.permanentFilter);
      isTargetable = allowThisSide && matchesFilter;
    } else if (zone === 'planeswalker') {
      // BUG ENCONTRADO Y ARREGLADO (Cabo suelto #13, parte visual): el click ya funcionaba
      // una vez arreglado en handlePlaneswalkerClick, pero el brillo dorado de "esto se
      // puede targetear" nunca se prendía acá — el jugador no tenía forma de SABER que un
      // Planeswalker era una opción válida sin adivinarlo.
      isTargetable = isLocal ? rules.allowLocalPlaneswalker : rules.allowRivalPlaneswalker;
    }
  } else if (state.pendingSacrificeChoice && isLocal) {
    // Resaltamos qué se puede elegir para pagar un costo de Sacrificar.
    const { eligibleType } = state.pendingSacrificeChoice;
    // ETAPA MOTOR 1: el brillo usa la MISMA validación real que el click. Un Encantamiento
    // ya no puede disfrazarse de "artefacto", y un Vehículo tripulado sigue siendo Artefacto.
    const zoneCanContainSacrifice = zone === 'combat' || zone === 'support';
    if (zoneCanContainSacrifice && isSacrificeCandidate(itemObj, eligibleType)) isTargetable = true;
  } else if (state.pendingCrew && isLocal && zone === 'combat') {
    // Elegible si está sin girar, o si ya la elegiste (clickearla de nuevo la saca).
    isTargetable = !itemObj.tapped || state.pendingCrew.selected.includes(itemObj);
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
    canManaSourcePayPendingCost(card);
  const manaPayableClass = isManaPayable ? 'mana-payable' : '';

  // Punto 12: acceso separado para habilidades instantáneas. En Combat el click normal puede
  // estar ocupado declarando ataque/bloqueo, así que un pequeño botón ⚡ evita ambigüedad.
  const ownInstantAbility = getActivatedAbilities(card).some(ab => getActivatedAbilityTiming(ab) === 'instant');
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
    // 23.13.20 — la misma capa visual sirve para costes de habilidades y para el maná
    // declarado por Tierras. Los JSON siguen canónicos ({W}/{U}/{B}/{R}/{G}); sólo cambia UI.
    let formattedText = card.text ? renderInlineGameSymbols(card.text) : '';

    const effKeywords = card.power !== undefined ? getEffectiveKeywords(itemObj) : [];

    const KEYWORD_LABELS = { 
      flying: '🕊️ Vuela', trample: '🐘 Arrolla', hexproof: '🛡️ Intocable', haste: '⚡ Prisa', 
      menace: '👥 Amenaza', vigilance: '👁️ Vigilancia', reach: '🏹 Alcance', defender: '🧱 Defensora',
      lifelink: '❤️ Vínculo vital', deathtouch: '💀 Toque mortal', firststrike: '🗡️ Primer golpe', doublestrike: '⚔️ Doble golpe', indestructible: '💎 Indestructible',
      protection_W: '🛡️ Protección de Blanco', protection_U: '🛡️ Protección de Azul', protection_B: '🛡️ Protección de Negro',
      protection_R: '🛡️ Protección de Rojo', protection_G: '🛡️ Protección de Verde'
    };
      
    // Ward N es dinámico (el número varía carta por carta), no puede vivir en el
    // diccionario fijo de arriba — se resuelve al vuelo acá.
    const labelFor = (k) => {
      if (k.startsWith('ward_')) return `🔶 Ward ${k.split('_')[1]}`;
      return KEYWORD_LABELS[k] || k;
    };
    const keywordsHTML = effKeywords.length > 0
      ? `<div class="keyword-strip">${effKeywords.map(k => `<span class="keyword-tag">${labelFor(k)}</span>`).join('')}</div>`
      : '';

    // Cartas con mucho texto (flavor + reglas + varias keywords) achican la letra para
    // entrar en la caja fija, en vez de desbordarse por abajo.
    const totalTextLen = (card.flavorText || '').length + (card.text || '').length + (effKeywords.length * 10);
    const textBoxScale = fitScaleByLength(totalTextLen, 90);

    formattedTextHTML = `<div class="card-text-box" style="font-size: clamp(4px, ${(6 * textBoxScale).toFixed(2)}cqw, 26px);">${keywordsHTML}<i>${card.flavorText || ''}</i><br><strong>${formattedText}</strong></div>`;
  }

  const effPower = card.power !== undefined ? getEffectivePower(itemObj) : undefined;
  const effToughness = card.toughness !== undefined ? getEffectiveToughness(itemObj) : undefined;
  const isBuffed = effPower !== undefined && (effPower !== card.power || effToughness !== card.toughness);

  let ptText = card.power !== undefined ? `${effPower}/${effToughness}` : '';
  if (itemObj.damageTaken > 0 && card.toughness !== undefined) {
    ptText = `${effPower}/<span style="color:#e74c3c;">${effToughness - itemObj.damageTaken}</span>`;
  } else if (isBuffed) {
    ptText = `<span style="color:#27ae60;">${effPower}/${effToughness}</span>`;
  }

  // Lealtad de un Planeswalker: mismo cuadrito que Poder/Resistencia, pero con su propio
  // color (violeta, como en las cartas reales) para diferenciarlo de un vistazo.
  const isPlaneswalker = card.type.includes('Planeswalker');
  const loyaltyText = isPlaneswalker ? `${itemObj.loyalty}` : '';

  const attachedAuras = itemObj.auras || [];
  const attachedEquipment = (zone === 'combat' && card.power !== undefined) ? getEquipmentOn(itemObj) : [];
  const staticMods = (zone === 'combat' && card.power !== undefined) ? getStaticTeamModifiers(itemObj) : [];
  const tempMods = (zone === 'combat' && card.power !== undefined) ? (itemObj.tempEffects || []) : [];
  const counters = (zone === 'combat' && card.power !== undefined) ? itemObj.counters : null;

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
  const counterLine = (counters && ((counters.plusOne || 0) > 0 || (counters.minusOne || 0) > 0))
    ? [`🔵 Contadores: ${(counters.plusOne||0) > 0 ? `+${counters.plusOne}/+${counters.plusOne}` : `-${counters.minusOne}/-${counters.minusOne}`}`]
    : [];
  const modifierLines = [
    ...counterLine,
    ...attachedAuras.map(a => `✨ ${a.name}: ${describeAura(a)}`),
    ...attachedEquipment.map(e => `⚔️ ${e.card.name}: ${describeEquipment(e)}`),
    ...staticMods.map(m => `🌐 ${m.sourceName}: ${describeStaticMod(m)} (mientras esté en el campo)`),
    ...tempMods.map(t => `⏳ ${t.name || 'Efecto'}: ${describeTempMod(t)} (hasta fin de turno)`)
  ];
  const modifierIcons = [
    counterLine.length > 0 ? '🔵' : '',
    attachedAuras.length > 0 ? '✨' : '',
    attachedEquipment.length > 0 ? '⚔️' : '',
    staticMods.length > 0 ? '🌐' : '',
    tempMods.length > 0 ? '⏳' : ''
  ].join('');

  const auraBadgeHTML = modifierLines.length > 0
    ? `<div class="aura-badge" data-tooltip="${modifierLines.join('\n').replace(/"/g, '&quot;')}">${modifierIcons}</div>`
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
        <div style="position: absolute; inset: 0; display: flex; justify-content: center; align-items: center;">${icon}</div>
        ${card.image ? `<img class="card-art-image" src="./assets/images/cards/${card.image}" alt="${card.name}"${browserImageAttrs} style="position: absolute; width: 120%; height: 120%; object-fit: cover; object-position: center top; z-index: 2;" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="card-type-line"><span class="card-type-text" style="font-size: clamp(4px, ${(7 * fitScale(card.type, 16, 0.3)).toFixed(2)}cqw, 30px);">${card.type}</span><span class="rarity-icon">●</span></div>
      ${formattedTextHTML}
      ${card.power !== undefined ? `<div class="card-pt">${ptText}</div>` : ''}
      ${isPlaneswalker ? `<div class="card-pt card-loyalty">${loyaltyText}</div>` : ''}
      ${auraBadgeHTML}
    </div>
  `;

  // 23.13.23 — encuadre de arte NO destructivo. Sin layout personalizado no agrega ningún
  // transform y conserva pixel-a-pixel el renderer histórico. La primera imagen visible
  // dispara una carga lazy compartida de gameConfig/artLayouts; nunca bloquea createCardElement.
  const cardArtImg = el.querySelector('.card-art-image');
  if (cardArtImg && card.id) registerCardArtImage(cardArtImg, card.id);

  // El botón separado sólo hace falta en Combat, donde el click normal puede significar
  // declarar atacante/bloqueador. Support y Tierras ya tienen un click inequívoco y el
  // group renderer elige la copia lista correcta si hay varias apiladas visualmente.
  const instantButtonAllowedZone = zone === 'combat';
  if (isLocal && instantButtonAllowedZone && hasExplicitInstantAbility && state.priorityPlayer === 'local' && !state.gameOver) {
    // La acción instantánea sigue anclada a la carta, pero visualmente queda fuera del
    // contenido: pequeña, centrada y debajo de todo para no tapar texto/PT.
    el.classList.add('card-with-instant-action');
    const instantBtn = document.createElement('button');
    instantBtn.type = 'button';
    instantBtn.textContent = '⚡';
    instantBtn.title = 'Activar habilidad instantánea';
    instantBtn.setAttribute('aria-label', `Activar habilidad instantánea de ${card.name}`);
    instantBtn.classList.add('instant-ability-fab');
    instantBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handleInstantActivatedAbilityClick(itemObj, true, index, zone);
    });
    el.appendChild(instantBtn);
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
    } else if (zone === 'land' && isLocal && !state.gameOver) {
      el.addEventListener('click', () => tapLocalLand(itemObj));
    } else if (zone === 'combat' && !state.gameOver) {
      el.addEventListener('click', () => handleCombatClick(itemObj, isLocal, index));
    } else if (zone === 'support' && isLocal && !state.gameOver && (
      (state.activePlayer === 'local' && state.phase.startsWith('main')) ||
      (state.priorityPlayer === 'local' && hasExplicitInstantAbility) ||
      ((card.produces || card.producesOptions) && state.pendingCost &&
       (state.pendingCost.W + state.pendingCost.U + state.pendingCost.B + state.pendingCost.R + state.pendingCost.G + state.pendingCost.generic) > 0)
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
      <button class="encyclopedia-back-btn" id="chest-back">← Volver</button>
      <div class="reward-screen-title">Mi Cofre</div>
      <div class="reward-screen-subtitle">Tus recompensas e items quedan guardados acá hasta que decidas usarlos.</div>
    </div>
    <div class="reward-screen-body" id="chest-body"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#chest-back').addEventListener('click', () => { overlay.remove(); onBack?.(); });
  const body = overlay.querySelector('#chest-body');

  function renderChest() {
    if (!state.currentUser || !state.userProfile) {
      body.innerHTML = '<div class="chest-future">Iniciá sesión y completá tu perfil para usar Mi Cofre.</div>';
      return;
    }
    const inventory = normalizeInventory(state.userProfile.inventory);
    const points = Number(state.userProfile.points) || 0;
    const fichas = Number(state.userProfile.fichas) || 0;
    const packs = inventory[CHEST_ITEM_KEYS.standardPack];
    const mythics = inventory[CHEST_ITEM_KEYS.guaranteedMythic];
    body.innerHTML = `
      <div class="chest-summary">
        <div class="chest-item">
          <div class="chest-item-icon">${COIN_ICON_HTML}</div><div class="chest-item-title">Puntos</div><div class="chest-item-count">${points}</div>
          <div class="chest-item-desc">Tu moneda para comprar sobres en la Tienda.</div>
        </div>
        <div class="chest-item">
          <div class="chest-item-icon">${FICHA_ICON_HTML}</div><div class="chest-item-title">Fichas de mejora</div><div class="chest-item-count">${fichas}</div>
          <div class="chest-item-desc">Usalas para mejorar permanentemente una carta de tu colección.</div>
          <button class="reward-action-btn" id="chest-use-fichas" ${fichas < FICHAS_PER_ENHANCEMENT ? 'disabled' : ''}>MEJORAR CARTA</button>
        </div>
        <div class="chest-item">
          <div class="chest-item-icon">${PACK_ICON_HTML}</div><div class="chest-item-title">Sobres</div><div class="chest-item-count">${packs}</div>
          <div class="chest-item-desc">15 cartas + 1 Ficha al abrir. Comprados y regalados usan el mismo inventario.</div>
          <button class="reward-action-btn" id="chest-open-pack" ${packs < 1 ? 'disabled' : ''}>ABRIR</button>
        </div>
        <div class="chest-item chest-mythic">
          <div class="chest-item-icon">✦</div><div class="chest-item-title">Carta mítica asegurada</div><div class="chest-item-count">${mythics}</div>
          <div class="chest-item-desc">Premio especial: al abrirlo recibís una mítica aleatoria real del pool.</div>
          <button class="reward-action-btn" id="chest-open-mythic" ${mythics < 1 ? 'disabled' : ''}>REVELAR</button>
        </div>
      </div>
      <div class="chest-future">El Cofre ya usa un inventario extensible: futuros cosméticos, tickets, regalos de eventos u otros items pueden sumarse sin rediseñar colección/puntos.</div>`;

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
        const card = generateGuaranteedMythicCard();
        state.userProfile = await openGuaranteedMythic(state.currentUser.uid, card.id);
        updateAccountUI(state.currentUser);
        // La Mythic del Día 7 comparte el lenguaje audiovisual del slot Mythic de un sobre,
        // pero la carta ya está acreditada antes de iniciar la revelación.
        showGuaranteedMythicExperience({
          card,
          renderCard: rewardCard => createCardElement(rewardCard, false, true, null, 'pack-opening', () => {}),
          onClose: renderChest
        });
      } catch (err) {
        console.error('No se pudo revelar la recompensa mítica:', err);
        showSimpleAlertModal(err.message || 'No se pudo abrir la recompensa mítica.');
        renderChest();
      }
    });
  }
  renderChest();
}

export function showDailyRewardsScreen(onBack) {
  injectRewardsStyles();
  injectEncyclopediaStyles();
  document.getElementById('daily-rewards-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'daily-rewards-overlay';
  overlay.innerHTML = `
    <div class="reward-screen-header">
      <button class="encyclopedia-back-btn" id="daily-rewards-back">← Volver</button>
      <div class="reward-screen-title">Recompensas diarias</div>
      <div class="reward-screen-subtitle">Racha de 7 accesos consecutivos</div>
    </div>
    <div class="reward-screen-body" id="daily-rewards-body"></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#daily-rewards-back').addEventListener('click', () => { overlay.remove(); onBack?.(); });
  const body = overlay.querySelector('#daily-rewards-body');

  function renderRewards() {
    if (!state.currentUser || !state.userProfile) {
      body.innerHTML = '<div class="chest-future">Iniciá sesión para participar del ciclo de recompensas.</div>';
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
      const status = claimed ? '✓ Reclamado' : unlocked ? 'Disponible' : entry.day <= daily.streak ? 'Desbloqueado' : 'Bloqueado';
      return `<div class="${classes}" data-reward-day="${entry.day}">
        <div class="daily-reward-label">Día ${entry.day}</div>
        <div class="daily-reward-circle">${claimed ? '<span class="daily-reward-check">✓</span>' : ''}<div class="daily-reward-icons">${icons}</div></div>
        <div class="daily-reward-status">${status}</div>
        ${unlocked ? `<button class="reward-action-btn" data-claim-day="${entry.day}">RECLAMAR</button>` : ''}
      </div>`;
    }).join('');
    body.innerHTML = `
      <div class="daily-pass-intro">
        <div class="daily-pass-streak">🔥 Racha actual: ${daily.streak} / 7</div>
        <div>Tu primer acceso es siempre el Día 1. Cada día consecutivo avanzás un escalón; si faltás un día, tu próximo acceso vuelve inmediatamente al Día 1.</div>
        <div class="daily-pass-reset">Después de completar el Día 7, el acceso del día siguiente empieza un ciclo nuevo. ${pending.length ? `Tenés ${pending.length} premio${pending.length === 1 ? '' : 's'} para reclamar.` : 'Tu premio del día aparecerá automáticamente en tu próximo acceso válido.'}</div>
      </div>
      ${isAdminUser() ? `<div class="daily-admin-debug">
        <div><strong>🧪 ADMIN DEBUG</strong> · reloj oficial + <span id="daily-debug-offset">${Number(state.userProfile?.rewardDebugOffsetDays) || 0}</span> día(s)</div>
        <button class="reward-secondary-btn" id="daily-debug-next">+1 DÍA</button>
        <button class="reward-secondary-btn" id="daily-debug-reset">RESET</button>
      </div>` : ''}
      <div class="daily-rewards-scroll"><div class="daily-reward-track">${daysHTML}</div></div>
      <div class="daily-rewards-help">El Día 6 entrega un sobre + 100 puntos. El Día 7 entrega una carta mítica aleatoria asegurada, guardada primero en Mi Cofre. La racha usa la fecha oficial de Firestore en Argentina/UTC−3, no el reloj del dispositivo.</div>`;
    body.querySelector('#daily-debug-next')?.addEventListener('click', async () => {
      const btn = body.querySelector('#daily-debug-next');
      btn.disabled = true;
      try {
        const offset = await adminAdvanceDailyRewardDebugDay(state.currentUser.uid);
        const result = await registerDailyLogin(state.currentUser.uid);
        state.userProfile = { ...result.profile, rewardDebugOffsetDays: offset };
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
        await adminResetDailyRewardDebug(state.currentUser.uid);
        // 23.13.6 — RESET es una operación QA completa: además de volver el offset a 0,
        // resincroniza inmediatamente la racha contra el día real del servidor. Si veníamos
        // simulando fechas futuras, advanceDailyLoginState detecta el retroceso y vuelve a D1.
        const result = await registerDailyLogin(state.currentUser.uid);
        state.userProfile = { ...result.profile, rewardDebugOffsetDays: 0 };
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
  if (!loginInfo?.newCalendarLogin) return;
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
  modal.querySelector('#daily-login-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#daily-login-view').addEventListener('click', () => {
    modal.remove();
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
    'endStepTrigger','grantedAbility'
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
  const enhancedIds = new Set(Object.keys((state.userProfile && state.userProfile.enhancements) || {}));
  let activeTab = 'criaturas';
  let ownershipFilter = 'all'; // 'all' | 'owned'
  let enhancedOnly = false;
  let searchQuery = '';
  const activeRarities = new Set(ENCYCLOPEDIA_RARITIES.map(r => r.key));
  const activeColors = new Set(CARD_BROWSER_COLORS.map(c => c.key));
  const activeArchetypes = new Set();
  const sortByTab = new Map(ENCYCLOPEDIA_TABS.map(tab => [tab.key, { key: 'cmc', direction: 'asc' }]));

  const overlay = document.createElement('div');
  overlay.id = 'encyclopedia-overlay';

  const tabsHTML = ENCYCLOPEDIA_TABS.map(t =>
    `<button class="encyclopedia-tab${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');

  const rarityFiltersHTML = ENCYCLOPEDIA_RARITIES.map(r =>
    `<label class="encyclopedia-filter-option">
       <input type="checkbox" data-rarity="${r.key}" checked>
       ${r.label}
     </label>`
  ).join('');

  const defaultZoom = document.documentElement.classList.contains('argentinia-mobile') ? 24 : 32;

  overlay.innerHTML = `
    <div class="encyclopedia-header">
      <button class="encyclopedia-back-btn" id="enc-back">← Volver</button>
      <div class="encyclopedia-title">Enciclopedia</div>
    </div>
    <div class="encyclopedia-tabs">${tabsHTML}</div>
    <div class="encyclopedia-body">
      <div class="encyclopedia-grid-box" id="enc-grid"></div>
      <div class="encyclopedia-filters">
        <input type="text" class="encyclopedia-search-input" id="enc-search" placeholder="Buscar carta...">
        <div class="card-browser-zoom" title="Cambiar tamaño de las cartas">
          <span>🔍</span>
          <input type="range" id="enc-card-zoom" min="12" max="45" step="1" value="${defaultZoom}">
          <span id="enc-card-zoom-value">${defaultZoom}</span>
        </div>
        <div class="encyclopedia-filter-section-title">Ordenar</div>
        <div class="card-browser-sort">
          <select id="enc-sort-key" aria-label="Ordenar cartas por">${browserSortOptionsHTML(activeTab, 'cmc')}</select>
          <button type="button" id="enc-sort-direction" class="card-browser-sort-direction" aria-label="Orden creciente" title="Orden creciente">↑</button>
        </div>
        <div class="encyclopedia-filter-section-title">Opciones</div>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="all" checked>
          Mostrar todas
        </label>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="owned">
          Solo cartas que poseo
        </label>
        <label class="encyclopedia-filter-option">
          <input type="checkbox" id="enc-enhanced-only">
          ✨ Solo mejoradas
        </label>
        <div class="encyclopedia-filter-section-title">Color</div>
        <div class="card-browser-filter-grid">${browserColorFiltersHTML('enc')}</div>
        <div class="encyclopedia-filter-section-title">Rareza</div>
        <div class="card-browser-filter-grid">${rarityFiltersHTML}</div>
        <div class="encyclopedia-filter-section-title">Arquetipo</div>
        <div class="card-browser-filter-grid archetypes">${browserArchetypeFiltersHTML('enc')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setBrowserCardZoom(overlay, defaultZoom);

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
    cardDb.getByCategory(tabKey).forEach(card => {
      const owned = ownedIds.has(card.id);
      const slot = document.createElement('div');
      slot.className = `encyclopedia-card-slot${owned ? '' : ' unowned'}`;
      slot.appendChild(createCardElement(card, false, true, null, 'encyclopedia', null));

      // 23.13.23 — el editor existe EXCLUSIVAMENTE en Enciclopedia y sólo para Admin.
      // La seguridad real del SAVE sigue en Firestore Rules; este gate es además UX.
      if (isAdminUser() && card.image) {
        const editArtBtn = document.createElement('button');
        editArtBtn.type = 'button';
        editArtBtn.className = `encyclopedia-art-edit-btn${hasCustomArtLayout(card.id) ? ' has-custom-layout' : ''}`;
        editArtBtn.textContent = '✏️';
        editArtBtn.title = hasCustomArtLayout(card.id)
          ? 'Editar encuadre del arte (personalizado)'
          : 'Editar encuadre del arte';
        editArtBtn.setAttribute('aria-label', `Editar encuadre del arte de ${card.name}`);
        editArtBtn.dataset.artCardId = card.id;
        editArtBtn.addEventListener('click', async event => {
          event.preventDefault();
          event.stopPropagation();
          editArtBtn.disabled = true;
          try {
            await openArtLayoutEditor({
              card,
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

      fragment.appendChild(slot);
      entry.records.push({ card, node: slot, owned, enhanced: enhancedIds.has(card.id) });
    });
    entry.pane.appendChild(fragment);
    entry.empty = document.createElement('div');
    entry.empty.className = 'encyclopedia-empty-msg';
    entry.empty.textContent = 'No hay cartas que coincidan con estos filtros.';
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
      const matches = activeRarities.has(card.rarity) &&
        cardMatchesColorFilter(card, activeColors) &&
        cardMatchesArchetypeFilter(card, activeArchetypes) &&
        (ownershipFilter !== 'owned' || record.owned) &&
        (!enhancedOnly || record.enhanced) &&
        (!query || normalizeSearch(card.name).includes(query));
      record.node.hidden = !matches;
      if (matches) visible += 1;
      entry.pane.appendChild(record.node); // mueve el nodo existente; no recrea su <img>
    });
    entry.empty.hidden = visible !== 0;
    entry.pane.appendChild(entry.empty);
  }

  const debouncedSearch = debounce(value => {
    searchQuery = value;
    refreshGrid();
  });
  overlay.querySelector('#enc-search').addEventListener('input', (e) => debouncedSearch(e.target.value));

  overlay.querySelector('#enc-card-zoom').addEventListener('input', e => {
    setBrowserCardZoom(overlay, e.target.value);
    overlay.querySelector('#enc-card-zoom-value').textContent = e.target.value;
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

  // Si el Admin entra desde un navegador sin cache, los botones pueden haberse creado antes
  // de que llegue Firestore. Cuando termina la carga remota, sincronizamos sólo su indicador
  // visual; las imágenes ya se actualizan globalmente desde artLayout.js.
  if (isAdminUser()) {
    ensureArtLayoutsLoaded().then(() => {
      if (!overlay.isConnected) return;
      overlay.querySelectorAll('.encyclopedia-art-edit-btn[data-art-card-id]').forEach(btn => {
        const custom = hasCustomArtLayout(btn.dataset.artCardId || '');
        btn.classList.toggle('has-custom-layout', custom);
        btn.title = custom
          ? 'Editar encuadre del arte (personalizado)'
          : 'Editar encuadre del arte';
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
    .store-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; flex-shrink: 0; }
    .store-title { font-size: 26px; font-weight: 700; color: #f0e0b0; text-shadow: 0 0 20px rgba(212,175,55,0.4); }
    .store-body { flex: 1; overflow-y: auto; max-width: 900px; width: 100%; margin: 0 auto; }
    .store-balance-row { display: flex; gap: 24px; margin-bottom: 28px; justify-content: center; }
    .store-balance-chip {
      background: rgba(18,25,15,0.7); border: 2px solid var(--gold, #d4af37); border-radius: 12px;
      padding: 14px 28px; text-align: center; min-width: 160px;
    }
    .store-balance-value { color: #f0e0b0; font-size: 26px; font-weight: 700; }
    .store-balance-label { color: #b8adc4; font-size: 12px; margin-top: 2px; }
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
    .store-card-grid {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;
      --card-w: 14vh;
      margin: 20px 0;
    }
    .store-ficha-visual { font-size: 40px; }
    .store-craft-list {
      max-height: 50vh; overflow-y: auto;
      display: flex; flex-wrap: wrap; justify-content: center; gap: 14px;
      --card-w: 12vh;
      padding: 10px;
    }
    .store-craft-card-btn { cursor: pointer; border-radius: 8px; transition: transform 0.15s ease; background: none; border: none; padding: 0; }
    .store-craft-card-btn:hover { transform: translateY(-4px); }
    .store-keyword-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; }
    .store-keyword-btn {
      background: rgba(255,255,255,0.05); border: 1.5px solid rgba(212,175,55,0.4); border-radius: 8px;
      color: #f0e0b0; font-size: 14px; font-weight: 600; padding: 12px; cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .store-keyword-btn:hover { background: rgba(212,175,55,0.18); border-color: #f0e0b0; }
    .store-back-link { background: none; border: none; color: #b8adc4; font-size: 13px; cursor: pointer; text-decoration: underline; margin-top: 10px; }
    .store-back-link:hover { color: #f0e0b0; }
  `;
  document.head.appendChild(style);
}

// FASE 2: Tienda — comprar sobres con puntos, y craftear mejoras permanentes con Fichas.
// Como con la Enciclopedia, reusa createCardElement para dibujar cartas (acá con zone=
// 'encyclopedia', el mismo truco de "zona inerte" para que ningún click dispare una acción
// de juego real) — nada de esto necesitó inventar una forma nueva de mostrar una carta.
export function showStoreScreen(onBack, options = {}) {
  injectStoreStyles();
  injectEncyclopediaStyles(); // .encyclopedia-back-btn: no depender del orden de navegación
  const overlay = document.createElement('div');
  overlay.id = 'store-overlay';
  overlay.innerHTML = `
    <div class="store-header">
      <button class="encyclopedia-back-btn" id="store-back">← Volver</button>
      <div class="store-title">Tienda</div>
    </div>
    <div class="store-body" id="store-body"></div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#store-back').addEventListener('click', () => {
    overlay.remove();
    onBack();
  });

  const body = overlay.querySelector('#store-body');
  let craftSelectedCardId = null;

  // BUGFIX: panel de "cómo conseguir puntos" — se muestra SIEMPRE, arriba de todo, sin
  // importar si hay sesión o no (así también le sirve a alguien que todavía no se logueó
  // y quiere entender el sistema antes de decidir). Lee los valores reales de store.js, así
  // nunca queda desactualizado si se reajusta el balance más adelante.
  const pointsInfoHTML = `
    <div class="store-section store-points-info">
      <div class="store-section-title">${COIN_ICON_HTML} Cómo conseguir puntos</div>
      <ul class="store-points-list">
        <li>Ganarle al Tano en <strong>Difícil</strong> — <strong>${POINTS.winVsTanoDificil} puntos</strong></li>
        <li>Ganarle al Tano en <strong>Fácil</strong> — <strong>${POINTS.winVsTanoFacil} puntos</strong></li>
        <li>Perder una partida — <strong>${POINTS.lossVsTano} puntos</strong> igual, por animarte a jugar</li>
        <li>Ganarle a un rival de verdad (Multijugador) — <strong>${POINTS.winVsHumano} puntos</strong></li>
        <li>Perder contra un rival de verdad — <strong>${POINTS.lossVsHumano} puntos</strong> igual</li>
        <li class="store-points-penalty">Abandonar a mitad de partida — <strong>${POINTS.abandonPenalty} puntos</strong></li>
      </ul>
    </div>
  `;

  function renderMainView() {
    if (!state.currentUser) {
      body.innerHTML = pointsInfoHTML + `<div class="store-section"><div class="store-section-desc">Iniciá sesión desde el menú principal para acceder a la Tienda — los puntos y la colección son por cuenta.</div></div>`;
      return;
    }
    if (!state.userProfile) {
      body.innerHTML = pointsInfoHTML + `<div class="store-section"><div class="store-section-desc">Todavía no tenés un perfil guardado — jugá tu primera partida logueado para arrancar tu colección, y volvé acá.</div></div>`;
      return;
    }

    const points = state.userProfile.points || 0;
    const fichas = state.userProfile.fichas || 0;
    const canBuyPack = points >= PACK_COST;
    const canCraft = fichas >= FICHAS_PER_ENHANCEMENT;

    body.innerHTML = pointsInfoHTML + `
      <div class="store-balance-row">
        <div class="store-balance-chip"><div class="store-balance-value">${COIN_ICON_HTML} ${points}</div><div class="store-balance-label">Puntos</div></div>
        <div class="store-balance-chip"><div class="store-balance-value">${FICHA_ICON_HTML} ${fichas}</div><div class="store-balance-label">Fichas</div></div>
      </div>
      <div class="store-section">
        <img class="store-pack-visual" src="./assets/images/ui/sobres.png" alt="📦" onerror="this.outerHTML='📦'">
        <div class="store-section-title">Sobre — ${PACK_COST} puntos</div>
        <div class="store-section-desc">La compra ya no abre el sobre automáticamente: queda guardado en <strong>Mi Cofre</strong>. Al abrirlo recibís 15 cartas + 1 Ficha.</div>
        <button class="store-buy-btn" id="store-buy-pack" ${canBuyPack ? '' : 'disabled'}>Comprar y guardar en Mi Cofre</button>
        <div class="store-error-msg" id="store-buy-error"></div>
      </div>
      <div class="store-section">
        <div class="store-ficha-visual">${FICHA_ICON_HTML}</div>
        <div class="store-section-title">Mejora permanente — ${FICHAS_PER_ENHANCEMENT} Fichas</div>
        <div class="store-section-desc">Elegí una carta que ya tengas (que todavía no esté mejorada) y dale una keyword para siempre, solo en tu colección.</div>
        <button class="store-buy-btn" id="store-craft" ${canCraft ? '' : 'disabled'}>${canCraft ? 'Craftear mejora' : `Te faltan ${FICHAS_PER_ENHANCEMENT - fichas} Ficha(s)`}</button>
      </div>
    `;

    body.querySelector('#store-buy-pack').addEventListener('click', async () => {
      const btn = body.querySelector('#store-buy-pack');
      const errBox = body.querySelector('#store-buy-error');
      btn.disabled = true;
      errBox.textContent = '';
      try {
        const updated = await purchasePack(state.currentUser.uid, PACK_COST);
        state.userProfile = updated;
        updateAccountUI(state.currentUser);
        body.innerHTML = `
          <div class="store-section">
            <img class="store-pack-visual" src="./assets/images/ui/sobres.png" alt="📦" onerror="this.outerHTML='📦'">
            <div class="store-section-title">✅ Sobre comprado</div>
            <div class="store-section-desc">No se abrió todavía: quedó guardado en <strong>Mi Cofre</strong> para que lo abras cuando quieras.</div>
            <button class="store-buy-btn" id="store-go-chest">Ir a Mi Cofre</button>
            <button class="store-back-link" id="store-buy-more">← Volver a la Tienda</button>
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
      .filter(Boolean);

    if (eligibleCards.length === 0) {
      body.innerHTML = `
        <div class="store-section">
          <div class="store-section-desc">No te queda ninguna carta sin mejorar todavía en tu colección.</div>
          <button class="store-back-link" id="store-craft-back">← Volver</button>
        </div>
      `;
      body.querySelector('#store-craft-back').addEventListener('click', renderMainView);
      return;
    }

    body.innerHTML = `
      <div class="store-section">
        <div class="store-section-title">Elegí qué carta mejorar</div>
        <div class="store-section-desc">Esto gasta ${FICHAS_PER_ENHANCEMENT} Fichas y es permanente — solo en tu colección.</div>
        <div class="store-craft-list" id="store-craft-list"></div>
        <button class="store-back-link" id="store-craft-cancel">← Cancelar</button>
      </div>
    `;

    const list = body.querySelector('#store-craft-list');
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
    .mydecks-body { flex: 1; overflow-y: auto; max-width: 900px; width: 100%; margin: 0 auto; }
    .mydecks-slots-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px;
    }
    .mydecks-slot {
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
    .mydecks-detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .mydecks-detail-title { color: #f0e0b0; font-size: 18px; font-weight: 700; }
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
  const enhancedIds = new Set(Object.keys(enhancements));

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

// FASE 3: "Mis Mazos" — lista tus hasta 5 mazos (arranca con 1: el mazo inicial random,
// marcado como default), te deja ver el contenido de cada uno (Etapa 1), y crear los 4
// restantes armándolos 100% desde tu colección real (Etapa 2, showDeckBuilderScreen más
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
    <div class="mydecks-slot mydecks-slot-filled" data-deck-id="${deck.id}">
      <div class="mydecks-slot-name">${deck.name}</div>
      ${deck.isDefault ? '<span class="mydecks-slot-badge">Default</span>' : ''}
      <div class="mydecks-slot-count">${(deck.cardIds || []).length} cartas</div>
    </div>
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
  const MAX_DECKS = 5;

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
        <div class="mydecks-slot mydecks-slot-filled" data-deck-id="${deck.id}">
          <div class="mydecks-slot-name">${deck.name}</div>
          ${deck.isDefault ? '<span class="mydecks-slot-badge">Default</span>' : ''}
          <div class="mydecks-slot-count">${(deck.cardIds || []).length} cartas</div>
        </div>
      `);
    });

    for (let i = decks.length; i < MAX_DECKS; i++) {
      slotsHTML.push(`
        <div class="mydecks-slot mydecks-slot-empty">+ Crear mazo</div>
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
function renderAccountBox(container, user) {
  if (!container) return;

  if (user) {
    // Fase 2: los puntos viven en el perfil de Firestore (state.userProfile), no en el
    // objeto de auth — puede no estar cargado todavía (recién logueado) o no existir aún
    // (nunca jugó una partida), así que se muestra solo cuando hay un número real.
    const pointsHTML = state.userProfile && typeof state.userProfile.points === 'number'
      ? `<div class="main-menu-account-points">${COIN_ICON_HTML} ${state.userProfile.points} puntos</div>`
      : '';
    // PANEL DE ADMIN: el botón solo se arma si el email logueado coincide EXACTO — para
    // cualquier otra cuenta, ni siquiera existe en el DOM (no es solo "oculto con CSS").
    const adminBtnHTML = user.email === ADMIN_EMAIL
      ? `<button class="main-menu-admin-btn" id="menu-admin">🛠️ Admin</button>`
      : '';
    const inventory = normalizeInventory(state.userProfile?.inventory);
    const chestPending = inventory[CHEST_ITEM_KEYS.standardPack] + inventory[CHEST_ITEM_KEYS.guaranteedMythic];
    const rewardsPending = state.userProfile ? unclaimedUnlockedDays(state.userProfile.dailyRewards).length : 0;
    const rewardActionsHTML = `
      <div class="main-menu-account-actions">
        <button class="main-menu-reward-btn" id="menu-chest">🎁 Mi Cofre${chestPending ? `<span class="main-menu-reward-badge">${chestPending}</span>` : ''}</button>
        <button class="main-menu-reward-btn" id="menu-daily-rewards">🔥 Recompensas diarias${rewardsPending ? `<span class="main-menu-reward-badge">${rewardsPending}</span>` : ''}</button>
      </div>`;
    container.innerHTML = `
      ${adminBtnHTML}
      ${rewardActionsHTML}
      <div class="main-menu-account-info">
        <img class="main-menu-account-photo" src="${user.photoURL || ''}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="main-menu-account-name">${getLocalPlayerName()}</div>
          ${pointsHTML}
          <button class="main-menu-rename-btn" id="menu-rename" ${state.userProfile ? '' : 'disabled'}>✏️ Cambiar nombre · ${USERNAME_RENAME_COST} Ficha</button>
          <button class="main-menu-logout-btn" id="menu-logout">Cerrar sesión</button>
        </div>
      </div>
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
        showSimpleAlertModal('Terminá tu partida multiplayer antes de cambiar el nombre.');
        return;
      }
      if ((Number(state.userProfile.fichas) || 0) < USERNAME_RENAME_COST) {
        showSimpleAlertModal(`Necesitás ${USERNAME_RENAME_COST} Ficha para cambiar el nombre.`);
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
          renderAccountBox(container, state.currentUser);
          updatePlayerIdentities();
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
    container.innerHTML = `<button class="main-menu-login-btn" id="menu-login">🔵 Iniciar sesión con Google</button>`;
    container.querySelector('#menu-login').addEventListener('click', () => {
      container.innerHTML = `<button class="main-menu-login-btn" id="menu-login" disabled>Conectando…</button>`;
      signInWithGoogle().catch(err => {
        // El caso más común acá ni siquiera es un error real: el jugador cerró el popup
        // sin elegir cuenta (auth/popup-closed-by-user) — no hace falta asustarlo por eso.
        console.error('Error al iniciar sesión:', err);
        renderAccountBox(container, null);
        const errMsg = document.createElement('div');
        errMsg.className = 'main-menu-account-error';
        errMsg.textContent = err.code === 'auth/popup-closed-by-user'
          ? ''
          : 'No se pudo iniciar sesión. Probá de nuevo.';
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
  const loggedIn = !!state.currentUser;
  ['menu-multiplayer', 'menu-encyclopedia', 'menu-mydecks', 'menu-store'].forEach(id => {
    const btn = overlay.querySelector(`#${id}`);
    if (!btn) return;
    if (loggedIn) {
      btn.classList.remove('main-menu-btn-disabled');
      btn.removeAttribute('data-tooltip');
    } else {
      btn.classList.add('main-menu-btn-disabled');
      btn.setAttribute('data-tooltip', 'Iniciá sesión para acceder');
    }
  });
}

// FASE 4 / HOTFIX 23.4.2: el documento público del match ya contiene el perfil
// básico de ambos jugadores ({ username, displayName legacy, photoURL }). La lógica de gameplay usa
// getRivalName(), pero el HUD superior seguía mostrando el fallback estático del HTML.
// Esta función mantiene Solitario exactamente como siempre (El Tano + 🤠) y, si hay un
// currentMatch real, pinta nombre de pila + foto Google del rival. No hace lecturas ni
// escrituras extra: usa únicamente los datos que ya llegaron durante el matchmaking o la
// reconexión y quedaron guardados en state.currentMatch.
function updateRivalAccountUI() {
  if (!els.rivalAvatar && !els.rivalPlayerName) return;

  const multiplayer = !!state.currentMatch;
  const rivalName = multiplayer ? getRivalName() : 'El Tano';
  const rivalPhotoURL = multiplayer ? (state.currentMatch.rivalPhotoURL || '') : '';

  if (els.rivalPlayerName) {
    els.rivalPlayerName.textContent = multiplayer ? `${rivalName} (TU RIVAL)` : 'El Tano (TU RIVAL)';
  }

  if (els.rivalAvatar) {
    const identityKey = `${multiplayer ? 'mp' : 'solo'}|${rivalPhotoURL}`;
    if (els.rivalAvatar.dataset.identityKey !== identityKey) {
      els.rivalAvatar.dataset.identityKey = identityKey;
      els.rivalAvatar.textContent = '';
      if (rivalPhotoURL) {
        const img = document.createElement('img');
        img.src = rivalPhotoURL;
        img.alt = '';
        img.addEventListener('error', () => {
          els.rivalAvatar.textContent = '🤠';
        }, { once: true });
        els.rivalAvatar.appendChild(img);
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
    { section: 'Puntos', id: 'winVsTanoDificil', label: 'Victoria vs Tano (Difícil)', value: POINTS.winVsTanoDificil, step: '1' },
    { section: 'Puntos', id: 'lossVsTano', label: 'Derrota vs Tano', value: POINTS.lossVsTano, step: '1' },
    { section: 'Puntos', id: 'winVsHumano', label: 'Victoria vs Humano (PvP)', value: POINTS.winVsHumano, step: '1' },
    { section: 'Puntos', id: 'lossVsHumano', label: 'Derrota vs Humano (PvP)', value: POINTS.lossVsHumano, step: '1' },
    { section: 'Puntos', id: 'abandonPenalty', label: 'Penalidad por abandonar', value: POINTS.abandonPenalty, step: '1' },
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
    { section: 'Mazos', id: 'maxEnhancedCardsPerDeck', label: 'Máximo de cartas mejoradas por mazo', value: MAX_ENHANCED_CARDS_PER_DECK, step: '1' }
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

  const announcementsHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Anuncios (Noticias del menú principal)</div>
      <textarea class="admin-field-input" id="announcement-text" placeholder="Escribí el anuncio…" rows="3" style="width:100%; box-sizing:border-box; text-align:left; resize:vertical;"></textarea>
      <button class="admin-save-btn" id="announcement-post" style="margin-top:10px;">📢 Publicar anuncio</button>
      <div class="store-error-msg" id="announcement-error" style="text-align:center;"></div>
      <div class="admin-success-msg" id="announcement-success"></div>
      <div id="announcement-list" style="margin-top:16px;"></div>
    </div>
  `;

  const adminTabs = [
    { key: 'game', label: 'AJUSTES DEL JUEGO' },
    { key: 'messages', label: 'MENSAJES Y USUARIOS' },
    { key: 'stats', label: 'ESTADÍSTICAS (a futuro)' },
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

      <div class="admin-tab-pane hidden" data-admin-pane="messages">
        <div class="admin-pane-narrow">
          ${grantHTML}
          ${announcementsHTML}
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="stats">
        <div class="admin-section admin-future-box">
          <span class="admin-future-icon">📊</span>
          <div class="admin-section-title">Estadísticas</div>
          <div>Esta solapa queda reservada para métricas agregadas del juego. No calcula ni publica nada todavía.</div>
        </div>
      </div>

      <div class="admin-tab-pane hidden" data-admin-pane="debug">
        <div class="admin-section">
          <div class="admin-section-title">🖼️ Auditoría de imágenes</div>
          <div class="admin-debug-toolbar">
            <div class="admin-debug-summary" id="admin-image-summary">Entrá a esta solapa para leer el manifiesto generado en el deploy.</div>
            <button class="admin-save-btn admin-debug-refresh" id="admin-image-refresh">🔄 Actualizar</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
            <button class="admin-save-btn" id="admin-image-toggle" style="display:none;">Ver todas</button>
            <button class="admin-save-btn" id="admin-image-download-txt" disabled>⬇ TXT de PNG faltantes</button>
            <button class="admin-save-btn" id="admin-image-download-json" disabled>⬇ JSON</button>
          </div>
          <div class="admin-debug-table-wrap" id="admin-image-table-wrap">
            <div class="admin-debug-empty">Cargando manifiesto…</div>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-title">Caja negra — historial de partidas</div>
          <div class="admin-debug-toolbar">
            <div class="admin-debug-summary" id="admin-debug-summary">Entrá a esta solapa para cargar los logs.</div>
            <button class="admin-save-btn admin-debug-refresh" id="admin-debug-refresh">🔄 Actualizar</button>
          </div>
          <div class="admin-debug-table-wrap" id="admin-debug-table-wrap">
            <div class="admin-debug-empty">Cargando historial…</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

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
    const missing = Array.isArray(audit?.missing) ? audit.missing : [];
    const stats = audit?.images || {};
    const generated = audit?.generatedAt ? formatTelemetryDate(audit.generatedAt) : '—';

    summary.textContent = `${missing.length} carta${missing.length === 1 ? '' : 's'} sin imagen · ${stats.existingFileCount ?? '?'} archivo${stats.existingFileCount === 1 ? '' : 's'} presente${stats.existingFileCount === 1 ? '' : 's'} · manifest ${generated}.`;
    txtBtn.disabled = false;
    jsonBtn.disabled = false;

    if (!missing.length) {
      toggle.style.display = 'none';
      wrap.innerHTML = '<div class="admin-debug-empty">✅ Todas las cartas con campo image tienen su archivo presente.</div>';
      return;
    }

    toggle.style.display = missing.length > 20 ? '' : 'none';
    toggle.textContent = imageAuditShowAll ? 'Mostrar primeras 20' : `Ver todas (${missing.length})`;
    const rows = (imageAuditShowAll ? missing : missing.slice(0, 20)).map(entry => `
      <tr>
        <td><code>${escapeHtml(entry.id || '—')}</code></td>
        <td>${escapeHtml(entry.name || '—')}</td>
        <td>${escapeHtml(entry.category || '—')}</td>
        <td><code>${escapeHtml(entry.image || '—')}</code></td>
      </tr>
    `).join('');
    wrap.innerHTML = `
      <table class="admin-debug-table">
        <thead><tr><th>ID</th><th>Carta</th><th>Categoría</th><th>PNG esperado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${!imageAuditShowAll && missing.length > 20 ? `<div class="admin-debug-empty">Mostrando 20 de ${missing.length}. No se hicieron requests a las imágenes.</div>` : ''}
    `;
  }

  async function reloadImageAudit(force = false) {
    if (imageAuditLoading) return;
    imageAuditLoading = true;
    const refreshBtn = overlay.querySelector('#admin-image-refresh');
    const wrap = overlay.querySelector('#admin-image-table-wrap');
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Cargando…';
    wrap.innerHTML = '<div class="admin-debug-empty">Leyendo un único cards-image-manifest.json…</div>';
    try {
      imageAudit = await cardDb.getImageAudit({ force });
      imageAuditLoaded = true;
      renderImageAudit(imageAudit);
    } catch (err) {
      console.error('No se pudo cargar el manifiesto de imágenes:', err);
      imageAuditLoaded = false;
      overlay.querySelector('#admin-image-summary').textContent = 'Manifest no disponible.';
      wrap.innerHTML = `<div class="admin-debug-error">No se encontró la auditoría automática de imágenes.<br>${escapeHtml(err?.message || String(err))}<br><br>En GitHub: Settings → Pages → Source: GitHub Actions. Luego hacé un deploy de esta versión.</div>`;
    } finally {
      imageAuditLoading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Actualizar';
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
      const status = session.status || 'running';
      const statusLabel = status === 'completed' ? 'Completo' : (status === 'running' ? 'En curso' : 'Parcial');
      const date = session.startedAtClient || session.endedAtClient || null;
      const bugSplitTitle = bugs.exactSplit ? '' : ' title="Sesión legacy: el total es exacto; el desglose auto/manual puede ser parcial."';
      return `
        <tr>
          <td>${escapeHtml(formatTelemetryDate(date))}</td>
          <td><span class="admin-debug-mode">${escapeHtml(mode)}</span>${session.matchId ? `<div class="admin-debug-match" title="${escapeHtml(session.matchId)}">${escapeHtml(session.matchId)}</div>` : ''}</td>
          <td><strong>${escapeHtml(localName)}</strong><br><span style="color:#9987a7;">vs ${escapeHtml(rivalName)}</span></td>
          <td><span class="admin-debug-mode">v${escapeHtml(session.telemetryVersion || meta.engineVersion || '?')}</span></td>
          <td${bugSplitTitle}><div class="admin-debug-bug-auto">⚙️ ${bugs.automatic} auto${bugs.automaticOccurrences > bugs.automatic ? ` · ${bugs.automaticOccurrences} ocurr.` : ''}</div><div class="admin-debug-bug-manual">🐞 ${bugs.manual} marcado${bugs.manual === 1 ? '' : 's'} · ${bugs.total} total</div></td>
          <td>${Number(session.eventCount || 0).toLocaleString('es-AR')}</td>
          <td><span class="admin-debug-status ${status === 'completed' ? 'completed' : 'running'}">${statusLabel}</span></td>
          <td><button class="admin-save-btn admin-debug-download" data-telemetry-download="${escapeHtml(session.id || session.sessionId || '')}">⬇ JSON</button></td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="admin-debug-table">
        <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Quién jugó contra quién</th><th>Motor</th><th>Bugs</th><th>Eventos</th><th>Estado</th><th>Log</th></tr></thead>
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
          btn.textContent = '❌ Error';
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
    refreshBtn.textContent = '⏳ Cargando…';
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
      refreshBtn.textContent = '🔄 Actualizar';
    }
  }

  function activateAdminTab(key) {
    overlay.querySelectorAll('[data-admin-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.adminTab === key));
    overlay.querySelectorAll('[data-admin-pane]').forEach(pane => pane.classList.toggle('hidden', pane.dataset.adminPane !== key));
    if (key === 'debug') {
      if (!debugLoaded) reloadTelemetryHistory();
      if (!imageAuditLoaded) reloadImageAudit(false);
    }
  }

  overlay.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateAdminTab(btn.dataset.adminTab));
  });
  overlay.querySelector('#admin-debug-refresh').addEventListener('click', reloadTelemetryHistory);
  overlay.querySelector('#admin-image-refresh').addEventListener('click', () => reloadImageAudit(true));
  overlay.querySelector('#admin-image-toggle').addEventListener('click', () => {
    imageAuditShowAll = !imageAuditShowAll;
    if (imageAudit) renderImageAudit(imageAudit);
  });
  overlay.querySelector('#admin-image-download-txt').addEventListener('click', () => {
    if (!imageAudit) return;
    const missing = Array.isArray(imageAudit.missing) ? imageAudit.missing : [];
    downloadAdminText(missing.map(entry => entry.image).join('\n') + (missing.length ? '\n' : ''), `Argentinia_imagenes_faltantes_v${ENGINE_VERSION}.txt`);
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

  function renderAnnouncementList(announcements) {
    const listEl = overlay.querySelector('#announcement-list');
    if (announcements.length === 0) {
      listEl.innerHTML = '<div class="admin-field-label">No hay anuncios publicados todavía.</div>';
      return;
    }
    listEl.innerHTML = announcements.map(a => `
      <div class="admin-field-row" data-announcement-id="${a.id}">
        <span class="admin-field-label" style="flex:1; text-align:left;">
          <strong>${formatAnnouncementDate(a.createdAt)}</strong> — ${escapeHtml(a.text)}
        </span>
        <button class="admin-announcement-delete" data-id="${a.id}" title="Borrar">🗑️</button>
      </div>
    `).join('');
    listEl.querySelectorAll('.admin-announcement-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('¿Borrar este anuncio? No se puede deshacer.')) return;
        btn.disabled = true;
        try {
          await deleteAnnouncement(btn.dataset.id);
          await reloadAnnouncements();
        } catch (err) {
          console.error('No se pudo borrar el anuncio:', err);
          btn.disabled = false;
        }
      });
    });
  }

  function reloadAnnouncements() {
    return fetchAnnouncements()
      .then(renderAnnouncementList)
      .catch(err => {
        console.error('No se pudieron cargar los anuncios:', err);
        overlay.querySelector('#announcement-list').innerHTML = '<div class="admin-field-label">No se pudieron cargar los anuncios.</div>';
      });
  }
  reloadAnnouncements();

  overlay.querySelector('#announcement-post').addEventListener('click', async () => {
    const errorBox = overlay.querySelector('#announcement-error');
    const successBox = overlay.querySelector('#announcement-success');
    errorBox.textContent = '';
    successBox.textContent = '';

    const textarea = overlay.querySelector('#announcement-text');
    const text = textarea.value.trim();
    if (!text) {
      errorBox.textContent = 'Escribí algo antes de publicar.';
      return;
    }

    const postBtn = overlay.querySelector('#announcement-post');
    postBtn.disabled = true;
    try {
      await postAnnouncement(state.currentUser.uid, text);
      textarea.value = '';
      successBox.textContent = '✅ Anuncio publicado — ya aparece en el menú principal.';
      await reloadAnnouncements();
    } catch (err) {
      console.error('No se pudo publicar el anuncio:', err);
      errorBox.textContent = err.message || 'No se pudo publicar. Probá de nuevo.';
    } finally {
      postBtn.disabled = false;
    }
  });

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
      winVsTanoDificil: readNumber('winVsTanoDificil'),
      lossVsTano: readNumber('lossVsTano'),
      winVsHumano: readNumber('winVsHumano'),
      lossVsHumano: readNumber('lossVsHumano'),
      abandonPenalty: readNumber('abandonPenalty'),
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
      maxEnhancedCardsPerDeck: readNumber('maxEnhancedCardsPerDeck')
    };

    if (Object.values(newConfig).some(v => typeof v !== 'number' || Number.isNaN(v))) {
      errorBox.textContent = 'Todos los campos tienen que ser números válidos.';
      return;
    }
    const classifiedsNonNegative = [
      newConfig.classifiedsCommonPoints, newConfig.classifiedsCommonFichas,
      newConfig.classifiedsUncommonPoints, newConfig.classifiedsUncommonFichas,
      newConfig.classifiedsRarePoints, newConfig.classifiedsRareFichas,
      newConfig.classifiedsMythicPoints, newConfig.classifiedsMythicFichas
    ].every(value => value >= 0);
    if (newConfig.deckSizeExact <= 0 || newConfig.maxCopiesPerCard <= 0 || newConfig.packCost < 0 || newConfig.fichasPerEnhancement <= 0
      || !classifiedsNonNegative || newConfig.classifiedsMythicChance < 0 || newConfig.classifiedsMythicChance > 1) {
      errorBox.textContent = 'Algún valor no tiene sentido (¿cero/negativo o un porcentaje fuera de 0–100?). Revisá antes de guardar.';
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
export function showReconnectPrompt(onReconnect, onAbandon) {
  injectStoreStyles(); // reusa .store-buy-btn / .store-back-link
  const overlay = document.createElement('div');
  overlay.id = 'reconnect-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#16211a; border:2px solid rgba(212,175,55,0.5); border-radius:16px; padding:32px; max-width:420px; text-align:center;">
      <div style="font-size:20px; font-weight:700; color:#f0e0b0; margin-bottom:12px;">🔄 Tenés una partida en curso</div>
      <div style="color:#cfe0d4; font-size:14px; margin-bottom:24px; line-height:1.5;">Parece que recargaste la página a mitad de una partida multiplayer. ¿Querés volver a ella?</div>
      <button class="store-buy-btn" id="reconnect-yes">Reconectarme</button>
      <br><br>
      <button class="store-back-link" id="reconnect-no">Abandonarla</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#reconnect-yes').addEventListener('click', () => {
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
      <button class="encyclopedia-back-btn" id="mp-back">← Volver</button>
      <div class="mp-title">Multijugador</div>
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
        <div class="mp-section-title">Crear partida</div>
        <div class="mp-section-desc">Genera un código de 6 caracteres para compartir con quien quieras que juegue.</div>
        <button class="store-buy-btn" id="mp-create">Crear partida</button>
        <div class="store-error-msg" id="mp-create-error"></div>
      </div>
      <div class="mp-section">
        <div class="mp-section-title">Unirse con un código</div>
        <input type="text" class="encyclopedia-search-input" id="mp-code-input" placeholder="Código de 6 caracteres" maxlength="6">
        <button class="store-buy-btn" id="mp-join">Unirse</button>
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
        errBox.textContent = err.message || 'No se pudo crear la partida. Probá de nuevo.';
        btn.disabled = false;
      }
    });

    body.querySelector('#mp-join').addEventListener('click', async () => {
      const input = body.querySelector('#mp-code-input');
      const btn = body.querySelector('#mp-join');
      const errBox = body.querySelector('#mp-join-error');
      const code = input.value.trim();
      if (!code) { errBox.textContent = 'Ingresá un código.'; return; }
      btn.disabled = true;
      errBox.textContent = '';
      try {
        const match = await joinMatchByCode(state.currentUser.uid, code, state.currentUser);
        renderMatched(match);
      } catch (err) {
        console.error('No se pudo unir a la partida:', err);
        errBox.textContent = err.message || 'No se pudo unir a la partida. Probá de nuevo.';
        btn.disabled = false;
      }
    });
  }

  function renderWaitingRoom(code) {
    cleanup();
    body.innerHTML = `
      <div class="mp-section">
        <div class="mp-spinner">⏳</div>
        <div class="mp-section-title">Esperando rival…</div>
        <div class="mp-code-display">${code}</div>
        <div class="mp-section-desc">Compartí este código con quien quieras que se una a la partida.</div>
        <button class="store-back-link" id="mp-cancel">Cancelar</button>
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
          <div class="mp-section-title">⚠️ Versiones incompatibles</div>
          <div class="mp-section-desc">Esta notebook usa <b>${ENGINE_VERSION}</b>, pero la partida informa <b>${escapeHtml(remoteEngine || guestEngine || 'versión anterior/desconocida')}</b>.<br>Actualizá ambas pestañas antes de jugar.</div>
          <button class="store-back-link" id="mp-incompatible-back">← Volver</button>
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
        <div class="mp-section-title">🎉 ¡Emparejado con ${escapeHtml(rivalName)}!</div>
        <div class="mp-versus-banner" aria-label="Enfrentamiento confirmado">
          ${multiplayerProfileBannerHTML(hostProfile, 'HOST', 'Host')}
          <div class="mp-versus-vs">VS.</div>
          ${multiplayerProfileBannerHTML(guestProfile, 'GUEST', 'Guest')}
        </div>
        <div class="mp-section-desc">Elegí con qué mazo propio vas a jugar esta partida.<br><span style="color:#a99362;font-size:11px">Motor v${ENGINE_VERSION} · protocolo ${ENGINE_PROTOCOL_VERSION}</span></div>
        <button class="store-buy-btn" id="mp-start">Elegir mazo y arrancar</button>
      </div>
    `;
    body.querySelector('#mp-start').addEventListener('click', () => {
      overlay.remove();
      onMatched(match.code, myRole, rivalName, rivalPhotoURL);
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
      <button class="main-menu-btn main-menu-btn-primary" id="menu-play">Jugar (Solitario)</button>
      <button class="main-menu-btn" id="menu-multiplayer">Multijugador</button>
      <button class="main-menu-btn" id="menu-mydecks">Mis Mazos</button>
      <button class="main-menu-btn" id="menu-encyclopedia">Enciclopedia</button>
      <button class="main-menu-btn" id="menu-store">Tienda</button>
      <button class="main-menu-btn" id="menu-options">Opciones</button>
    </div>
    <div class="main-menu-news" id="main-menu-news">
      <div class="main-menu-news-title">📰 Noticias</div>
      <div class="main-menu-news-list" id="main-menu-news-list">
        <div class="main-menu-news-empty">Cargando…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  renderAccountBox(overlay.querySelector('#main-menu-account'), state.currentUser);
  updateMainMenuLoginGatedButtons(overlay);

  // "Noticias": públicas para cualquiera, con o sin sesión (ver firestore.rules) — no
  // bloquea el resto del menú, que ya se ve de entrada mientras esto carga.
  const newsListEl = overlay.querySelector('#main-menu-news-list');
  fetchAnnouncements()
    .then(announcements => {
      if (announcements.length === 0) {
        newsListEl.innerHTML = '<div class="main-menu-news-empty">Sin noticias por ahora.</div>';
        return;
      }
      newsListEl.innerHTML = announcements.map(a => `
        <div class="main-menu-news-item">
          <div class="main-menu-news-date">${formatAnnouncementDate(a.createdAt)}</div>
          <div class="main-menu-news-text">${escapeHtml(a.text)}</div>
        </div>
      `).join('');
    })
    .catch(err => {
      console.error('No se pudieron cargar las noticias:', err);
      newsListEl.innerHTML = '<div class="main-menu-news-empty">No se pudieron cargar las noticias.</div>';
    });

  overlay.querySelector('#menu-play').addEventListener('click', () => {
    overlay.remove();
    onPlay();
  });

  // FASE 4 (cierre del roadmap): Multijugador ya conecta con una partida jugable de
  // verdad — onMultiplayerMatched (pasado desde main.js) es quien arma el mazo/mano y
  // arranca la sincronización real, una vez emparejados. Mismo gateo por sesión que
  // Enciclopedia/Mis Mazos/Tienda: sin cuenta no hay con quién identificarte frente a un rival.
  overlay.querySelector('#menu-multiplayer').addEventListener('click', () => {
    if (!state.currentUser) return;
    overlay.style.display = 'none';
    showMultiplayerLobby(() => { overlay.style.display = ''; }, onMultiplayerMatched);
  });

  // BUGFIX (revisión post-Etapa 4): Enciclopedia/Mis Mazos/Tienda ahora quedan
  // DESHABILITADAS de verdad sin sesión (mismo look que Multijugador), en vez de dejar
  // entrar y mostrar un cartel adentro — updateMainMenuLoginGatedButtons (más abajo) las
  // pinta como corresponde, y acá el click no hace nada si no hay sesión.
  overlay.querySelector('#menu-encyclopedia').addEventListener('click', () => {
    if (!state.currentUser) return;
    overlay.style.display = 'none';
    showEncyclopedia(() => { overlay.style.display = ''; });
  });

  overlay.querySelector('#menu-mydecks').addEventListener('click', () => {
    if (!state.currentUser) return;
    overlay.style.display = 'none';
    showMyDecksScreen(() => { overlay.style.display = ''; });
  });

  overlay.querySelector('#menu-store').addEventListener('click', () => {
    if (!state.currentUser) return;
    overlay.style.display = 'none';
    showStoreScreen(() => { overlay.style.display = ''; });
  });

  overlay.querySelector('#menu-options').addEventListener('click', () => {
    overlay.style.display = 'none';
    showOptionsMenu(() => { overlay.style.display = ''; });
  });
}

// Opciones: hoy solo Dificultad impacta de verdad en el juego (Grupo C, Etapas 1-4). Las
// otras dos quedan como placeholder deshabilitado — están para mostrar hacia dónde va esto,
// no porque hagan algo todavía (no hay sistema de sonido ni de animaciones configurables).
export function showOptionsMenu(onBack) {
  injectMainMenuStyles();
  const overlay = document.createElement('div');
  overlay.id = 'options-menu-overlay';

  const difficultyLabel = () => (state.botDifficulty === 'easy' ? 'Fácil' : 'Difícil');

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
      <div class="options-menu-title">Opciones</div>
      <div class="options-row">
        <span class="options-label">Dificultad del Tano</span>
        <button class="options-toggle-btn" id="opt-difficulty">${difficultyLabel()}</button>
      </div>
      <div class="options-row options-row-disabled">
        <span class="options-label">Velocidad de animaciones</span>
        <button class="options-toggle-btn" data-tooltip="Deshabilitado">Normal</button>
      </div>
      <div class="options-row options-row-disabled">
        <span class="options-label">Sonido</span>
        <button class="options-toggle-btn" data-tooltip="Deshabilitado">Activado</button>
      </div>
      ${dangerZoneHTML}
      <button class="main-menu-btn" id="opt-back" style="margin-top: 24px;">Volver</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const diffBtn = overlay.querySelector('#opt-difficulty');
  diffBtn.addEventListener('click', () => {
    state.botDifficulty = state.botDifficulty === 'easy' ? 'hard' : 'easy';
    diffBtn.textContent = difficultyLabel();
    logMsg(`🎚️ Dificultad del Tano: ${difficultyLabel()}.`);
  });

  if (state.currentUser) {
    overlay.querySelector('#opt-delete-account').addEventListener('click', () => {
      showDeleteAccountModal(async () => {
        try {
          await deleteUserProfile(state.currentUser.uid);
          state.userProfile = null;
          logMsg("🗑️ Tu cuenta se borró — la próxima vez que juegues, arrancás de cero.");
        } catch (err) {
          console.error('No se pudo borrar la cuenta:', err);
          logMsg("⚠️ No se pudo borrar la cuenta — revisá tu conexión e intentá de nuevo.");
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

function injectMulliganStyles() {
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
      max-width: 980px; width: 95%; max-height: 90vh; overflow: visible;
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
      display: flex; justify-content: center; gap: 8px; flex-wrap: nowrap; margin-bottom: 26px;
      min-height: 154px;
    }
    .mulligan-card-slot {
      width: 100px !important; height: 140px !important;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      flex-shrink: 0;
    }
    /* Las cartas del modal no tenían NINGÚN hover-zoom: las reglas de zoom del resto del
       juego están atadas a #local-hand / .field-row específicamente, y esta fila no es
       ninguna de esas dos. Le damos su propia regla, mismo criterio (bottom center). */
    .mulligan-card-slot:hover {
      transform: scale(2.0);
      z-index: 20;
    }
    .mulligan-card-slot.selectable:hover { transform: scale(2.0) translateY(-6px); z-index: 20; }
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

  const keepLabel = mulliganCount > 0
    ? `Quedarme (dejo ${mulliganCount} carta${mulliganCount > 1 ? 's' : ''} al fondo)`
    : 'Quedarme con esta mano';
  const subtitle = canMulliganMore
    ? '¿Te la quedás, o volvés a barajar y robás 7 de nuevo? Pasá el mouse por una carta para verla completa.'
    : 'Ya llegaste al máximo de 7 mulligans — esta vez tenés que quedarte con lo que hay.';
  const mulliganBtnHTML = canMulliganMore
    ? `<button class="mulligan-btn mulligan-btn-mull" id="btn-do-mulligan">🔄 Mulligan</button>`
    : `<button class="mulligan-btn mulligan-btn-mull" disabled>🔄 Mulligan</button>`;

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${mulliganCount === 0 ? 'Tu mano inicial' : `Mano nueva (mulligan #${mulliganCount})`}</div>
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
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const destino = mode === 'surveil' ? 'al cementerio' : 'al fondo del mazo';
  const icono = mode === 'surveil' ? '👁️' : '🔮';
  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${icono} ${mode === 'surveil' ? 'Surveil' : 'Scry'} ${cards.length}</div>
      <div class="mulligan-subtitle">Clickeá una carta para mandarla ${destino}. Las que no toques se quedan arriba, en el mismo orden.</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-scry">Confirmar</button>
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
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">🔵 Proliferar</div>
      <div class="mulligan-subtitle">Clickeá cualquier cantidad de permanentes para sumarles un contador más de cada tipo que ya tengan. Podés no elegir ninguno.</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-proliferate">Confirmar</button>
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
          <span style="font-size:12px; font-weight:bold;">Veneno de ${entry.ownerIsLocal ? 'Vos' : getRivalName()}</span>
          <span style="font-size:11px; color:#a89bb5;">(${poisonCount} actual)</span>
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


// Punto 6: selector GENERAL de Cementerio. Recibe entries {card, index} para que dos
// copias idénticas sigan siendo distinguibles por slot. `filterLabel` y `actionLabel` son
// puramente visuales; la validación real de elegibilidad vive en main.js. No hay Cancelar:
// cuando se abre, la selección forma parte de una instrucción que ya está resolviéndose.
export function showGraveyardChoiceModal(entries, countToChoose, cardName, filterLabel, actionLabel, onConfirm) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosenIndexes = new Set();
  const count = Math.max(0, Math.min(countToChoose || 1, entries.length));
  const noun = count === 1 ? 'carta' : 'cartas';

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">⚰️ ${cardName}: ${actionLabel || `elegí ${count} ${noun} del cementerio`}</div>
      <div class="mulligan-subtitle" id="graveyard-choice-count-hint">${filterLabel ? `${filterLabel} · ` : ''}Seleccionadas: 0 / ${count}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-graveyard-choice" disabled>Confirmar elección</button>
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
      hint().textContent = `${filterLabel ? `${filterLabel} · ` : ''}Seleccionadas: ${chosenIndexes.size} / ${count}`;
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
    'cualquier carta',
    `elegí ${exileCount} carta${exileCount > 1 ? 's' : ''} de tu cementerio para exiliar`,
    chosenIndexes => onConfirm(chosenIndexes.map(i => graveyardCards[i]).filter(Boolean))
  );
}

// Punto 5: el dueño elige exactamente N permanentes propios para sacrificar como EFECTO.
// No hay Cancelar: el efecto ya está resolviéndose. Recibe items de battlefield reales,
// por eso varias copias idénticas siguen siendo seleccionables como objetos distintos.
export function showSacrificeEffectModal(candidates, countToSacrifice, cardName, permanentType, onConfirm) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();
  const typeLabel = permanentType === 'artifact' ? 'artefacto' : 'criatura';

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">🔪 ${cardName}: sacrificá ${countToSacrifice} ${typeLabel}${countToSacrifice > 1 ? 's' : ''}</div>
      <div class="mulligan-subtitle" id="sacrifice-effect-count-hint">Seleccionadas: 0 / ${countToSacrifice}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-sacrifice-effect" disabled>Confirmar sacrificio</button>
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
      hint().textContent = `Seleccionadas: ${chosen.size} / ${countToSacrifice}`;
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
export function showHandDiscardChoiceModal(hand, countToDiscard, cardName, actionLabel, onConfirm) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosenIndexes = new Set();
  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">🃏 ${cardName}: ${actionLabel || 'Elegí qué descartar'}</div>
      <div class="mulligan-subtitle" id="hand-discard-count-hint">Seleccionadas: 0 / ${countToDiscard}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-hand-discard" disabled>Confirmar descarte</button>
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
    hint().textContent = `Seleccionadas: ${chosenIndexes.size} / ${countToDiscard}`;
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
    ? 'Después de robar, elegí qué descartar'
    : 'Elegí qué descartar antes de robar';
  return showHandDiscardChoiceModal(hand, countToDiscard, cardName, actionLabel, onConfirm);
}

export function showBottomCardsModal(hand, countToBottom, onConfirm) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">Elegí ${countToBottom} carta${countToBottom > 1 ? 's' : ''} para el fondo del mazo</div>
      <div class="mulligan-subtitle" id="mulligan-count-hint">Seleccionadas: 0 / ${countToBottom}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-bottom" disabled>Confirmar</button>
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
    hint().textContent = `Seleccionadas: ${chosen.size} / ${countToBottom}`;
    confirmBtn().disabled = chosen.size !== countToBottom;
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-bottom').addEventListener('click', () => {
    overlay.remove();
    onConfirm([...chosen]);
  });
}

export function showGameOverOverlay(didWin) {
  els.gameOverTitle.textContent = didWin ? `🏆 ¡Ganaste! Hiciste morder el polvo a ${getRivalName()}.` : `💀 Perdiste. ${getRivalName()} te ganó esta partida.`;
  els.gameOverOverlay.classList.remove('hidden'); els.btnEndTurn.disabled = true;
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
    // cartas mecánicamente distintas, aunque compartan color.
    let key = item.card.id || item.card.name;
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
      if (zoneType === 'land' && isLocal) {
        const readyLand = group.ready[0];
        if (readyLand) tapLocalLand(readyLand);
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
          const matchesFilter = !rules.permanentFilter || group.items[0].item.card.type.includes(rules.permanentFilter);
          if (allowThisSide && matchesFilter) {
            const { item: targetItem, originalIndex } = group.items[0];
            handleSupportTargetClick(targetItem, isLocal, originalIndex);
            return;
          }
        }
        const supportHasAbility = getActivatedAbilities(group.items[0].item.card).length > 0;
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
  const labels = {
    ready: 'SINCRONIZANDO', resolving: 'RESOLVIENDO', discarding: 'DESCARTANDO',
    paying_mana: 'PAGANDO COSTE', choosing_target: 'ELIGIENDO OBJETIVO', choosing_ability: 'ELIGIENDO HABILIDAD',
    choosing_sacrifice: 'ELIGIENDO SACRIFICIO', choosing_attackers: 'DECLARANDO ATACANTES', choosing_blockers: 'DECLARANDO BLOQUEADORES',
    assigning_damage: 'ASIGNANDO DAÑO', remote_decision: 'DECISIÓN PENDIENTE', choosing_cards: 'SELECCIONANDO CARTAS',
    choosing_mode: 'ELIGIENDO MODO', resolution_choice: 'ELECCIÓN DE RESOLUCIÓN', blocked: 'ACCIÓN OBLIGATORIA'
  };
  return labels[activity] || String(activity || 'PAUSADO').replaceAll('_', ' ').toUpperCase();
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
  const paused = !!(state.priorityClockPausedLocal || activity || !running);
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
    els.priorityPauseLabel.textContent = `⏸ PAUSADO · ${getPriorityPauseLabel(reason)}`;
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
    const labels = {
      combat_begin: 'Combate · Inicio', combat_attackers: 'Combate · Atacantes',
      combat_blockers: 'Combate · Bloqueadores', combat_damage: 'Combate · Daño', combat_end: 'Combate · Fin'
    };
    const label = labels[state.phase] || 'Combate';
    combatDot.dataset.phaseLabel = label;
    combatDot.title = label;
    combatDot.setAttribute('aria-label', label);
  }

  // 23.13.7 — banner de macrofase: deduplicado por turno/jugador/fase en el módulo.
  // Un rerender por prioridad o por un hover nunca vuelve a disparar el aviso.
  announcePhaseTransition({ phase: state.phase, turnCount: state.turnCount, activePlayer: state.activePlayer });
}
export function render() {
  state.localHP = Math.max(0, Math.min(20, state.localHP));
  state.rivalHP = Math.max(0, Math.min(20, state.rivalHP));
  updateRivalAccountUI();

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
  const anyPendingChoice = !!state.pendingCastTransaction || !!state.pendingAlternativeCostChoice || !!state.pendingPrivateZoneChoice || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingActivatedAbilityChoice !== null ||
    state.pendingTargetCard !== null || state.pendingCrew !== null || state.pendingWardChoice !== null ||
    state.pendingCounterUnlessPay !== null || state.pendingHybridLifePayment !== null ||
    state.pendingFightChoice !== null || state.pendingXChoice !== null || state.pendingModeChoice !== null ||
    state.pendingLoyaltyTargetChoice !== null || state.pendingMultiTargetChoice !== null ||
    state.pendingScrySurveilChoice || state.pendingProliferateChoice || state.pendingHandFilterChoice || state.pendingDiscardChoice || state.pendingSacrificeEffectChoice || state.pendingGraveyardChoice || state.pendingResolvedEffectTargetChoice || (state.resolvingSacrificeEffects || 0) > 0 ||
    (state.resolvingCardFilterEffects || 0) > 0 || (state.resolvingDiscardEffects || 0) > 0 || (state.resolvingGraveyardChoices || 0) > 0 || (state.resolvingResolvedEffectTargetChoices || 0) > 0 || state.pendingEscapeExileChoice ||
    state.pendingKickerChoice || state.pendingRampChoice || state.pendingSacrificeChoice !== null ||
    state.damageModalOpen || state.awaitingRivalDecision || state.respondingToDecision;

  els.btnEndTurn.disabled = (!!state.multiplayerWaitingForReady || state.priorityPlayer !== 'local' || state.gameOver || state.isDiscarding || anyPendingChoice || (state.consecutivePasses || 0) >= 2);

  // 23.7.2: si el defensor no tiene NINGÚN bloqueador legal, declarar cero es
  // automático. No salteamos el paso: executeRivalAttack abre la ventana post-bloqueadores,
  // así instantáneos/habilidades antes del daño siguen existiendo.
  let autoZeroBlockersPending = false;
  if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local' && (state.consecutivePasses || 0) === 1 && !state.localBlockersDeclaredThisCombat) {
    const attackers = state.rivalCombat.filter(attacker => attacker.isAttacking);
    const hasLegalBlocker = state.localCombat.some(defender => !defender.tapped && attackers.some(attacker => canBlock(attacker, defender)));
    autoZeroBlockersPending = !hasLegalBlocker;
    if (!hasLegalBlocker && !state.autoZeroBlockersQueued) {
      state.autoZeroBlockersQueued = true;
      queueMicrotask(() => {
        state.autoZeroBlockersQueued = false;
        if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local' && !state.localBlockersDeclaredThisCombat) {
          logMsg('🛡️ No tenés bloqueadores legales. Se declararon 0 bloqueadores automáticamente.');
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
      els.btnEndTurn.textContent = "Pasar Prioridad ➔";
      els.btnEndTurn.onclick = () => passPriority('local');
      els.btnEndTurn.style.backgroundColor = "";
    } else {
      els.btnEndTurn.textContent = isAttacking ? "Confirmar Ataque ⚔️" : "Saltar Ataque ➔";
      els.btnEndTurn.onclick = executeLocalAttack;
      els.btnEndTurn.style.backgroundColor = isAttacking ? "#e74c3c" : "#e67e22";
    }
  } else if (state.phase === 'combat_blockers' && state.activePlayer === 'rival') {
    if (state.localBlockersDeclaredThisCombat) {
      els.btnEndTurn.textContent = "Pasar Prioridad ➔";
      els.btnEndTurn.onclick = () => passPriority('local');
      els.btnEndTurn.style.backgroundColor = "";
    } else if (autoZeroBlockersPending) {
      els.btnEndTurn.textContent = "Sin bloqueadores — avanzando…";
      els.btnEndTurn.onclick = null;
      els.btnEndTurn.disabled = true;
      els.btnEndTurn.style.backgroundColor = "#3498db";
    } else {
      els.btnEndTurn.textContent = "Confirmar Bloqueos 🛡️";
      els.btnEndTurn.onclick = executeRivalAttack;
      els.btnEndTurn.style.backgroundColor = "#3498db";
    }
  } else {
    els.btnEndTurn.textContent = "Pasar Prioridad ➔";
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
    els.btnEndTurn.textContent = `Esperando a ${getRivalName()}…`;
    els.btnEndTurn.onclick = null;
    els.btnEndTurn.disabled = true;
    els.btnEndTurn.style.backgroundColor = "#34495e";
  }

  // --- GESTIÓN DE COSTOS PENDIENTES ---
  if (state.isDiscarding) els.localHand.classList.add('discard-warning');
  else els.localHand.classList.remove('discard-warning');

  if (state.pendingSpellIndex !== null || state.pendingCastTransaction?.stage === 'targets' || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay) {
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
    
    const pendingCard = state.pendingCastTransaction?.card || (state.pendingSpellIndex !== null ? state.localHand[state.pendingSpellIndex] : null);
    let statusText;
    if (state.pendingCrew) {
      statusText = `Tripulando ${state.pendingCrew.item.card.name}: ${state.pendingCrew.powerSoFar}/${state.pendingCrew.required} de poder — clickeá tus criaturas 🚗`;
    } else if (state.pendingWardChoice) {
      statusText = `🔶 ¡${state.pendingWardChoice.targetObj.item.card.name} tiene Ward ${state.pendingWardChoice.wardCost}! Pagá o el hechizo se pierde.`;
    } else if (state.pendingCounterUnlessPay) {
      statusText = `💰 ¡"${state.pendingCounterUnlessPay.targetCardName}" va a ser contrarrestado! Pagá {${state.pendingCounterUnlessPay.amount}} o se pierde.`;
    } else if (state.pendingFightChoice) {
      statusText = `🥊 Elegiste a ${state.pendingFightChoice.opponentItem.card.name} como rival. Ahora clickeá CUÁL de tus criaturas pelea.`;
    } else {
      statusText = state.pendingCastTransaction?.stage === 'targets' ? "🎯 Declarando objetivos — todavía no pagaste nada" : (state.pendingTargetCard ? "Elegí un objetivo brillante ✨" : "Falta: ");
      if (!state.pendingTargetCard && state.pendingCastTransaction?.stage !== 'targets') {
        // Defensa de UI: nunca asumir que pendingCost existe sólo porque hay alguna acción
        // pendiente. Un cancel/interacción solapada no debe poder tirar todo el render.
        const pendingCost = state.pendingCost || { W:0, U:0, B:0, R:0, G:0, generic:0 };
        if (pendingCost.W > 0) statusText += `${pendingCost.W} Blanco `;
        if (pendingCost.U > 0) statusText += `${pendingCost.U} Azul `;
        if (pendingCost.B > 0) statusText += `${pendingCost.B} Negro `;
        if (pendingCost.R > 0) statusText += `${pendingCost.R} Rojo `;
        if (pendingCost.G > 0) statusText += `${pendingCost.G} Verde `;
        if (pendingCost.generic > 0) statusText += `${pendingCost.generic} Genérico`;
        if (state.pendingAlternativeCostChosen && pendingCard?.alternativeCost) statusText += ` [alternativo: ${describeCompositeCost(pendingCard.alternativeCost)}]`;
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
      els.btnAltCost.textContent = `🔀 Pagar alternativo: ${describeCompositeCost(pendingCard.alternativeCost)}`;
    } else {
      els.btnAltCost.classList.add('hidden');
    }

    if (state.pendingWardChoice) {
      els.btnPayWard.classList.remove('hidden');
      els.btnPayWard.textContent = `🔶 Pagar Ward ${state.pendingWardChoice.wardCost}`;
    } else {
      els.btnPayWard.classList.add('hidden');
    }

    if (state.pendingCounterUnlessPay) {
      els.btnPayCounterTax.classList.remove('hidden');
      els.btnPayCounterTax.textContent = `💰 Pagar {${state.pendingCounterUnlessPay.amount}}`;
    } else {
      els.btnPayCounterTax.classList.add('hidden');
    }
  } else {
    els.paymentControls.classList.add('hidden'); els.btnEndTurn.classList.remove('hidden');
    els.localHand.classList.remove('paying-mode'); els.localLands.classList.remove('paying-mode'); els.localSupport.classList.remove('paying-mode');
  }
  renderStack();
  checkAuraLegality();
  checkEquipmentLegality();
  checkGameOver();

  // ENTREGA 22+: snapshot diagnóstico del estado estabilizado por este render.
  captureTelemetryState('render');

  // FASE 4, ETAPA 2: publica mi mitad del estado en Firestore después de CUALQUIER cambio
  // real al tablero — no se espera (render() es síncrona), y si no hay una partida
  // multiplayer activa no hace nada en absoluto (ver el guard adentro de la función).
  publishMatchState();
}

els.btnCancelSpell.addEventListener('click', cancelPayment);
els.btnAltCost.addEventListener('click', payWithAlternativeCost);
els.btnPayWard.addEventListener('click', payWard);
els.btnPayCounterTax.addEventListener('click', payCounterTax);

// ACTUALIZADO: Controles de teclado globales (Escape y Barra Espaciadora)
document.addEventListener('keydown', (e) => { 
  // Cancelar pagos pendientes
  if (e.key === 'Escape' && (state.pendingCastTransaction || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null)) {
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
      Tu <strong>${attacker.name}</strong> (Poder: ${totalDamage}) fue bloqueado.<br>
      <span style="font-size: 0.85rem; color: #aaa;">¿Cómo querés resolver el daño?</span>
    </p>`;
  
  initialButtons.classList.remove('hidden');
  confirmContainer.classList.add('hidden');
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
    let html = `<div style="margin-bottom: 15px; font-size: 1rem;">Daño restante para asignar: <strong id="dmg-unassigned" style="color: var(--gold); font-size: 1.6rem;">${unassigned}</strong></div>`;

    blockersArray.forEach((bItem, idx) => {
       const hp = bItem.card.toughness - (bItem.damageTaken || 0);
       const needed = lethalNeeded(bItem);
       const met = currentDistribution[idx] >= needed;
       html += `
         <div class="damage-row">
           <div style="text-align: left; line-height: 1.2;">
             <strong style="font-size: 1.1rem;">${bItem.card.name}</strong><br>
             <span style="font-size: 0.8rem; color: ${met ? '#7ed6a5' : '#e67e22'};">
               Resistencia actual: ${hp} ${needed > 0 ? `(letal: ${needed})` : '(ya no necesita más)'}
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
             <strong style="font-size: 1.1rem;">🐘 Arrollar ${trampleLabel}</strong><br>
             <span style="font-size: 0.8rem; color: #aaa;">
               ${allLethalMet ? `Se calcula automáticamente con lo que sobre (le come ${overflowNoun}).` : 'Asigná primero daño letal a todos los bloqueadores.'}
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

    if (canConfirm) btnConfirm.textContent = 'Confirmar Distribución';
    else if (!allLethalMet) btnConfirm.textContent = 'Asigná daño letal a todos los bloqueadores';
    else btnConfirm.textContent = 'Asigná todo el daño restante';
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
  if (title) title.textContent = rivalReady ? '¡Ambos listos!' : `Esperando a ${safeName}…`;
  if (detail) detail.textContent = rivalReady
    ? 'Sincronizando el primer turno…'
    : (localReady ? 'Tu mazo y mulligan ya están confirmados. La partida se habilita cuando el otro jugador termine.' : 'Preparando tu partida…');
  overlay.classList.remove('hidden');
}

export function hideMultiplayerReadyBarrier() {
  const overlay = document.getElementById('multiplayer-ready-barrier');
  if (overlay) overlay.remove();
}
