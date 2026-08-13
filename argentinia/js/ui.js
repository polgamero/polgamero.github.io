import {
  state,
  getLocalPlayerName,
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
  handlePlaneswalkerClick,
  handleSupportTargetClick,
  handlePlayerTargetClick,
  cancelPayment,
  payWithAlternativeCost,
  payWard,
  payCounterTax,
  activateLoyaltyAbility,
  castFromGraveyard,
  checkGameOver,
  checkAuraLegality,
  checkEquipmentLegality,
  publishMatchState,
  passPriority // Importado del nuevo sistema
} from './main.js';

import { executeLocalAttack, executeRivalAttack } from './combatRules.js';
import { renderStack, spellStack } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { generatePackCards } from './utils.js';
import { signInWithGoogle, signOutUser, purchasePack, craftEnhancement, deleteUserProfile, createDeck, saveGameConfig, createMatch, joinMatchByCode, listenToMatch, cancelMatch, fetchAllUserProfiles, adminGrantCurrency, adminGrantCurrencyToAll, logAdminAction } from './firebaseClient.js';
import { PACK_COST, FICHAS_PER_ENHANCEMENT, ENHANCEMENT_KEYWORDS, DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, ENHANCED_SUFFIX, POINTS, MYTHIC_CHANCE_IN_RARE_SLOT, applyGameConfig, getDefaultGameConfig } from './store.js';
import { canBlock, hasKeyword } from './keywords.js';
import { ALL_COLORS, GUILD_PAIRS } from './utils.js';

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
        <p style="color:#cfe0d4; font-size: 14px; margin-bottom: 14px;">${card.text || ''}</p>
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

// Kicker: costo ADICIONAL y OPCIONAL — a diferencia de un hechizo modal (elegís UNO de
// varios modos), acá es sí/no sobre pagar más por un bonus extra, y el efecto base se
// lanza de todos modos elijas lo que elijas. Mismo esqueleto visual que showModalSpellChoice.
export function showKickerModal(card, onConfirm, onCancel) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  const bonusText = card.kicker.bonusText || 'un bonus adicional';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 440px;">
      <div class="gy-modal-header">
        <h3>💪 ${card.name} — Kicker</h3>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; padding: 16px;">
        <p style="color:#cfe0d4; font-size: 13px; margin: 0 0 4px;">Podés pagar ${card.kicker.cost} adicional. Si lo hacés: ${bonusText}.</p>
        <button class="loyalty-ability-btn" id="kicker-yes" style="justify-content: flex-start;">
          <span class="loyalty-ability-text">💪 Sí, pagar Kicker ${card.kicker.cost}</span>
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

// FASE 2: confirmación antes de abandonar — es una acción con penalidad real de puntos, así
// que nunca se ejecuta con un solo click. Mismo esqueleto que showKickerModal.
export function showAbandonConfirmModal(onConfirm, onCancel) {
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

export function showLoyaltyAbilityModal(pwItem, isLocal) {
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
  const gyArray = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const title = isLocal ? "Tu Cementerio" : "Cementerio del Tano";

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
        fbBtn.textContent = `🔄 Flashback ${cardObj.flashback.cost}`;
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
        escBtn.textContent = `🌀 Escape ${cardObj.escape.cost} + exiliar ${exileCount}`;
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
  const exileArray = isLocal ? state.localExile : state.rivalExile;
  const title = isLocal ? "Tu Exilio" : "Exilio del Tano";

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
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  els.gameLogBox.appendChild(entry);
  els.gameLogBox.scrollTop = els.gameLogBox.scrollHeight;
}

export function renderManaSymbols(manaCostStr) {
  if (!manaCostStr) return '';
  const matches = manaCostStr.match(/\{[^}]+\}/g);
  if (!matches) return '';
  return matches.map(m => {
    const val = m.replace(/[{}]/g, '');
    let colorClass = 'mana-c'; 
    if(val === 'W') colorClass = 'mana-w'; if(val === 'U') colorClass = 'mana-u'; if(val === 'B') colorClass = 'mana-b'; if(val === 'R') colorClass = 'mana-r'; if(val === 'G') colorClass = 'mana-g';
    const innerText = ['W','U','B','R','G'].includes(val) ? '' : val;
    // Números de 2+ dígitos (10, 12...) necesitan una fuente más chica para entrar
    // centrados en el mismo círculo sin desbordar — 1 dígito usa el tamaño normal.
    const fontSize = innerText.length >= 2 ? '3.2cqw' : '4.6cqw';
    const style = innerText ? ` style="font-size:${fontSize};"` : '';
    return `<span class="mana-symbol ${colorClass}"${style}>${innerText}</span>`;
  }).join('');
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
  const effectType = card.effect?.type || card.activatedAbility?.effect?.type || card.grantedAbility?.effect?.type;

  if (effectType === 'destroy_artifact') {
    return { allowPlayer: false, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: true, allowRivalPermanent: true, permanentFilter: 'Artefacto' };
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
    // Este efecto es "el jugador objetivo", no una criatura ni un permanente.
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
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
  if (effectType === 'add_counter') {
    // Contador permanente: +1/+1 solo tiene sentido en tu propia criatura (como "pump").
    // -1/-1 es remoción, así que puede apuntar a cualquier lado (como "destroy_creature").
    const counterType = card.effect?.counterType || card.activatedAbility?.effect?.counterType || card.grantedAbility?.effect?.counterType;
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
      isTargetable = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
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
    if (eligibleType === 'creature' && zone === 'combat') isTargetable = true;
    else if (eligibleType === 'artifact' && zone === 'support' && card.type.includes('Artefacto')) isTargetable = true;
  } else if (state.pendingCrew && isLocal && zone === 'combat') {
    // Elegible si está sin girar, o si ya la elegiste (clickearla de nuevo la saca).
    isTargetable = !itemObj.tapped || state.pendingCrew.selected.includes(itemObj);
  }

  const isCrewingSelected = (state.pendingCrew && state.pendingCrew.selected.includes(itemObj)) ? 'crewing-selected' : '';

  if (!isLocal && hasKeyword(itemObj, 'hexproof')) {
    isTargetable = false;
  }
  
  const targetClass = isTargetable ? 'targetable' : '';
  
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
  el.className = `card ${bgClass} ${card.rarity || 'Common'} ${isTapped ? 'tapped' : ''} ${isSick} ${isAttacking} ${isBlocking} ${isSelectedBlocker} ${targetClass} ${isCrewingSelected}`;

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
    formattedTextHTML = `<div class="card-text-box" style="display: flex; justify-content: center; align-items: center; background: rgba(255,255,255,0.85); padding: 0;">
        <img src="./assets/images/${landSymbolImg}" alt="Símbolo de maná" style="width: 120%; height: stretch; object-fit: cover; opacity: 0.9;" onerror="this.style.display='none'">
      </div>`;
  } else {
    let formattedText = card.text ? card.text.replace(/\{([WUBRGC])\}/g, (match, p1) => {
      let c = 'mana-c';
      if(p1==='W') c='mana-w'; if(p1==='U') c='mana-u'; if(p1==='B') c='mana-b'; if(p1==='R') c='mana-r'; if(p1==='G') c='mana-g';
      return `<span class="mana-symbol ${c}" style="display:inline-flex; width:4cqw; height:4cqw; font-size:2.5cqw; margin:0 2px; vertical-align:middle;"></span>`;
    }) : '';

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
    if (eqCard.grantedAbility) {
      const ab = eqCard.grantedAbility;
      parts.push(`${ab.cost}: ${ab.effect.type === 'damage' ? `${ab.effect.amount} de daño` : ab.effect.type}`);
    }
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

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-header"><span class="card-title" style="font-size: clamp(4px, ${(8 * fitScale(card.name, 13, 0.3)).toFixed(2)}cqw, 40px);">${card.name}</span><span class="card-cost">${renderManaSymbols(card.manaCost)}</span></div>
      <div class="card-art" style="position: relative; overflow: hidden;">
        <div style="position: absolute; inset: 0; display: flex; justify-content: center; align-items: center;">${icon}</div>
        ${card.image ? `<img src="./assets/images/cards/${card.image}" alt="${card.name}" style="position: absolute; width: 120%; height: 120%; object-fit: cover; object-position: center top; z-index: 2;" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="card-type-line"><span class="card-type-text" style="font-size: clamp(4px, ${(7 * fitScale(card.type, 16, 0.3)).toFixed(2)}cqw, 30px);">${card.type}</span><span class="rarity-icon">●</span></div>
      ${formattedTextHTML}
      ${card.power !== undefined ? `<div class="card-pt">${ptText}</div>` : ''}
      ${isPlaneswalker ? `<div class="card-pt card-loyalty">${loyaltyText}</div>` : ''}
      ${auraBadgeHTML}
    </div>
  `;

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
      el.addEventListener('click', () => {
        if (state.isDiscarding) handleDiscardClick(index);
        else playCard(index);
      });
    } else if (zone === 'land' && isLocal && !state.gameOver) {
      el.addEventListener('click', () => tapLocalLand(itemObj));
    } else if (zone === 'combat' && !state.gameOver) {
      el.addEventListener('click', () => handleCombatClick(itemObj, isLocal, index));
    } else if (zone === 'support' && isLocal && state.activePlayer === 'local' && state.phase.startsWith('main') && !state.gameOver) {
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
      position: absolute; left: 5vw; bottom: 8vh;
      display: flex; flex-direction: column; gap: 14px;
      width: 300px;
    }
    .main-menu-btn {
      display: block; width: 100%;
      background: linear-gradient(180deg, rgba(18,25,15,0.92), rgba(11,19,14,0.96));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 10px;
      color: #f0e0b0;
      font-size: 17px; font-weight: 700; letter-spacing: 0.5px;
      padding: 13px 20px; text-align: left;
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
      border-color: #f0e0b0; font-size: 19px;
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
      width: 3em; height: 1.1em; object-fit: contain; vertical-align: -0.15em; flex-shrink: 0;
    }
    .main-menu-logout-btn {
      background: none; border: none; color: #b8adc4; font-size: 11px;
      cursor: pointer; text-decoration: underline; padding: 0; display: block;
    }
    .main-menu-logout-btn:hover { color: #f0e0b0; }
    .main-menu-account-error { color: #e07a6b; font-size: 12px; max-width: 260px; text-align: right; }
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
const SOBRE_HTML = `<img class="sobre-expansion" src="./assets/images/ui/sobre.png" alt="✉️" onerror="this.outerHTML='✉️'">`;

// PANEL DE ADMIN: solo esta cuenta puede ver el botón — esto es puramente cosmético (ocultar
// el botón para todos los demás), NO es la protección real. Lo que de verdad impide que
// cualquier otra persona escriba en gameConfig es firestore.rules del lado del servidor,
// que chequea este mismo email de forma independiente — aunque alguien se saltee esta UI
// por completo (devtools, requests a mano), Firestore lo va a rechazar igual.
const ADMIN_EMAIL = 'pablogamero1@gmail.com';
const FICHA_ICON_HTML = `<img class="ficha-icon" src="./assets/images/ui/ficha.png" alt="🎫" onerror="this.outerHTML='🎫'">`;

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

// FASE 1: ya existe una colección real por cuenta (Firestore, users/{uid}.collection) —
// si hay sesión Y ya se terminó de cargar (o crear) su perfil, se devuelve esa colección
// de verdad. Sin sesión, o con sesión pero perfil todavía sin resolver (recién logueado,
// nunca jugó todavía), se sigue mostrando el pool completo — mismo criterio acordado desde
// que se armó la Enciclopedia, solo que ahora deja de ser el único camino posible.
export function getOwnedCardIds() {
  if (state.currentUser && state.userProfile && state.userProfile.collection) {
    return new Set(state.userProfile.collection);
  }
  return new Set(cardDb.allCards.map(c => c.id));
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
      flex: 1; overflow-y: auto;
      background: #F5F5F5;
      border: 2px solid rgba(212,175,55,0.3);
      border-radius: 12px;
      padding: 20px;
      display: flex; flex-wrap: wrap; align-content: flex-start; gap: 20px;
    }
    .encyclopedia-card-slot .card-inner { border-width: 6px; }
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
  `;
  document.head.appendChild(style);
}

export function showEncyclopedia(onBack) {
  injectEncyclopediaStyles();

  const ownedIds = getOwnedCardIds();
  // BUGFIX: para el filtro nuevo "Solo cartas mejoradas" — no cambia cómo se DIBUJA la
  // carta (sin badge, sin keyword de más, tal cual se pidió: "base de datos pura"), solo
  // decide cuáles entran en la grilla.
  const enhancedIds = new Set(Object.keys((state.userProfile && state.userProfile.enhancements) || {}));
  let activeTab = 'criaturas';
  let ownershipFilter = 'all'; // 'all' | 'owned' | 'enhanced'
  let searchQuery = '';
  const activeRarities = new Set(ENCYCLOPEDIA_RARITIES.map(r => r.key));

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
        <div class="encyclopedia-filter-section-title">Opciones</div>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="all" checked>
          Mostrar todas
        </label>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="owned">
          Mostrar solo cartas que poseo
        </label>
        <label class="encyclopedia-filter-option">
          <input type="radio" name="enc-ownership" value="enhanced">
          Solo cartas mejoradas
        </label>
        <div class="encyclopedia-filter-section-title">Rareza</div>
        ${rarityFiltersHTML}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const gridBox = overlay.querySelector('#enc-grid');

  // Normaliza (minúsculas + sin acentos) para que buscar "arara" encuentre "Yarará" sin
  // que el jugador tenga que acordarse de poner la tilde.
  function normalizeSearch(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function renderGrid() {
    gridBox.innerHTML = '';
    const query = normalizeSearch(searchQuery);
    const cards = cardDb.getByCategory(activeTab)
      .filter(c => activeRarities.has(c.rarity))
      .filter(c => {
        if (ownershipFilter === 'owned') return ownedIds.has(c.id);
        if (ownershipFilter === 'enhanced') return enhancedIds.has(c.id);
        return true; // 'all'
      })
      .filter(c => !query || normalizeSearch(c.name).includes(query));

    if (cards.length === 0) {
      gridBox.innerHTML = '<div class="encyclopedia-empty-msg">No hay cartas que coincidan con estos filtros.</div>';
      return;
    }

    cards.forEach(card => {
      const owned = ownedIds.has(card.id);
      const slot = document.createElement('div');
      slot.className = `encyclopedia-card-slot${owned ? '' : ' unowned'}`;
      // zone='encyclopedia' (una zona que no existe en el resto del motor) a propósito:
      // así createCardElement no le pega ningún handler de click de juego (declarar
      // ataque, activar habilidad, etc.) — acá es pura vidriera, sin acción.
      const cardEl = createCardElement(card, false, true, null, 'encyclopedia', null);
      slot.appendChild(cardEl);
      gridBox.appendChild(slot);
    });
  }

  overlay.querySelector('#enc-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderGrid();
  });

  overlay.querySelectorAll('.encyclopedia-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      overlay.querySelectorAll('.encyclopedia-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    });
  });

  overlay.querySelectorAll('input[name="enc-ownership"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ownershipFilter = radio.value;
      renderGrid();
    });
  });

  overlay.querySelectorAll('input[data-rarity]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const rarity = checkbox.getAttribute('data-rarity');
      if (checkbox.checked) activeRarities.add(rarity);
      else activeRarities.delete(rarity);
      renderGrid();
    });
  });

  overlay.querySelector('#enc-back').addEventListener('click', () => {
    overlay.remove();
    onBack();
  });

  renderGrid();
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
      font-size: 64px; margin-bottom: 10px;
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
export function showStoreScreen(onBack) {
  injectStoreStyles();
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
        <div class="store-pack-visual">${SOBRE_HTML}</div>
        <div class="store-section-title">Sobre — ${PACK_COST} puntos</div>
        <div class="store-section-desc">15 cartas (comunes, poco comunes, y una rara garantizada con chance de mítica) + 1 Ficha.</div>
        <button class="store-buy-btn" id="store-buy-pack" ${canBuyPack ? '' : 'disabled'}>Comprar sobre</button>
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
        const packCards = generatePackCards();
        const updated = await purchasePack(state.currentUser.uid, PACK_COST, packCards.map(c => c.id));
        state.userProfile = updated;
        renderPackRevealView(packCards);
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
    .deckbuilder-pool-card-wrap { position: relative; cursor: pointer; transition: transform 0.15s ease; }
    .deckbuilder-pool-card-wrap:hover { transform: translateY(-3px); }
    .deckbuilder-pool-card-wrap.maxed { opacity: 0.4; cursor: not-allowed; }
    .deckbuilder-pool-card-wrap.maxed:hover { transform: none; }
    .deckbuilder-pool-card-badge {
      position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.85); color: #f0e0b0;
      border: 1px solid var(--gold, #d4af37); border-radius: 6px; font-size: 11px; font-weight: 700;
      padding: 2px 6px; pointer-events: none;
      /* BUGFIX: la imagen de arte de la carta (createCardElement) tiene z-index:2 propio —
         sin un z-index explícito acá, el badge quedaba tapado detrás de esa imagen. Con
         esto gana siempre. */
      z-index: 10;
    }
    .deckbuilder-side { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; }
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
      background: rgba(0,0,0,0.2); border: 2px solid rgba(212,175,55,0.3); border-radius: 10px; padding: 10px;
    }
    .deckbuilder-list-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; color: #e8ddc8;
    }
    .deckbuilder-list-item:last-child { border-bottom: none; }
    .deckbuilder-list-remove {
      background: none; border: 1px solid rgba(224,122,107,0.5); color: #e07a6b; border-radius: 5px;
      width: 20px; height: 20px; cursor: pointer; font-size: 13px; line-height: 1; flex-shrink: 0;
    }
    .deckbuilder-list-remove:hover { background: rgba(224,122,107,0.15); }
    .deckbuilder-empty-hint { color: #7a7086; font-size: 13px; text-align: center; padding: 20px 10px; }
  `;
  document.head.appendChild(style);
}

// FASE 3, ETAPA 2: nombre del mazo nuevo, antes de entrar al constructor. Cualquier nombre
// no vacío sirve (sin la exigencia de escribir una palabra exacta como en borrar cuenta —
// acá no hay nada irreversible todavía, recién se guarda de verdad al final del constructor).
export function showDeckNameModal(defaultName, onConfirm, onCancel) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="gy-modal-content" style="max-width: 420px;">
      <div class="gy-modal-header"><h3>Nombrá tu mazo</h3></div>
      <div style="display:flex; flex-direction:column; gap:12px; padding: 16px;">
        <input type="text" class="encyclopedia-search-input" id="deckname-input" value="${defaultName}" maxlength="40" style="margin-bottom:0;">
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
export function showDeckBuilderScreen(deckName, onSaved, onCancel) {
  injectEncyclopediaStyles();
  injectDeckBuilderStyles();

  const ownedCounts = {};
  (state.userProfile.collection || []).forEach(id => { ownedCounts[id] = (ownedCounts[id] || 0) + 1; });

  let activeTab = 'criaturas';
  let searchQuery = '';
  const deckCounts = {}; // cardId -> cantidad agregada al mazo en construcción

  const overlay = document.createElement('div');
  overlay.id = 'deckbuilder-overlay';

  const tabsHTML = ENCYCLOPEDIA_TABS.map(t =>
    `<button class="encyclopedia-tab${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');

  overlay.innerHTML = `
    <div class="deckbuilder-header">
      <button class="encyclopedia-back-btn" id="deckbuilder-cancel">← Cancelar</button>
      <div class="deckbuilder-name">${deckName}</div>
      <button class="store-buy-btn" id="deckbuilder-save" disabled>💾 Guardar mazo</button>
    </div>
    <div class="store-error-msg" id="deckbuilder-error" style="text-align:left;"></div>
    <div class="encyclopedia-tabs">${tabsHTML}</div>
    <input type="text" class="encyclopedia-search-input" id="deckbuilder-search" placeholder="Buscar carta...">
    <div class="deckbuilder-body">
      <div class="deckbuilder-pool">
        <div class="encyclopedia-grid-box" id="deckbuilder-grid"></div>
      </div>
      <div class="deckbuilder-side">
        <div class="deckbuilder-side-title" id="deckbuilder-count">Tu mazo (0 / ${DECK_SIZE_EXACT} cartas)</div>
        <div class="deckbuilder-list" id="deckbuilder-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const grid = overlay.querySelector('#deckbuilder-grid');
  const list = overlay.querySelector('#deckbuilder-list');
  const countLabel = overlay.querySelector('#deckbuilder-count');
  const errorBox = overlay.querySelector('#deckbuilder-error');

  function normalizeSearch(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function totalInDeck() {
    return Object.values(deckCounts).reduce((sum, n) => sum + n, 0);
  }

  // Cuántas cartas mejoradas ya hay en el mazo en construcción — el tope
  // MAX_ENHANCED_CARDS_PER_DECK (default 3, admin-editable) cuenta esto, no las copias de
  // una sola carta puntual (eso ya lo maneja el cap normal de 1 por tile mejorado).
  function totalEnhancedInDeck() {
    return Object.entries(deckCounts)
      .filter(([key]) => key.endsWith(ENHANCED_SUFFIX))
      .reduce((sum, [, n]) => sum + n, 0);
  }

  function renderPool() {
    grid.innerHTML = '';
    const query = normalizeSearch(searchQuery);
    const cards = cardDb.getByCategory(activeTab)
      .filter(c => (ownedCounts[c.id] || 0) > 0)
      .filter(c => !query || normalizeSearch(c.name).includes(query));

    if (cards.length === 0) {
      grid.innerHTML = '<div class="encyclopedia-empty-msg">No tenés cartas de este tipo (o ninguna coincide con la búsqueda).</div>';
      return;
    }

    const enhancements = (state.userProfile && state.userProfile.enhancements) || {};

    // Dibuja UN tile del pool. trackingKey es la clave que se usa en deckCounts (puede
    // traer el sufijo ENHANCED_SUFFIX) — displayCard es lo que se le pasa a
    // createCardElement (con la keyword ya mezclada adentro si es la copia mejorada).
    function renderPoolTile(displayCard, trackingKey, ownedForThisSlot, isEnhancedTile) {
      const isBasicLand = displayCard.type.includes('básica');
      const cap = isBasicLand ? ownedForThisSlot : Math.min(ownedForThisSlot, MAX_COPIES_PER_CARD);
      const inDeck = deckCounts[trackingKey] || 0;
      const deckFull = totalInDeck() >= DECK_SIZE_EXACT;
      // Tope aparte para cartas mejoradas: aunque a ESTA carta puntual todavía le quede
      // margen (inDeck < cap), si ya llegaste al máximo de mejoradas del mazo entero
      // (MAX_ENHANCED_CARDS_PER_DECK, admin-editable, default 3) no se puede agregar una
      // mejorada DISTINTA — por eso es un chequeo separado, no alcanza con el cap normal.
      const enhancedDeckCapReached = isEnhancedTile && inDeck === 0 && totalEnhancedInDeck() >= MAX_ENHANCED_CARDS_PER_DECK;
      const maxed = inDeck >= cap || deckFull || enhancedDeckCapReached;

      const wrap = document.createElement('div');
      wrap.className = `deckbuilder-pool-card-wrap${maxed ? ' maxed' : ''}${isEnhancedTile ? ' enhanced' : ''}`;
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
        if ((deckCounts[trackingKey] || 0) >= cap) return; // ya llegaste al máximo de copias de ESTE slot
        if (totalInDeck() >= DECK_SIZE_EXACT) return; // ya llegaste a las 60 del mazo entero
        if (isEnhancedTile && (deckCounts[trackingKey] || 0) === 0 && totalEnhancedInDeck() >= MAX_ENHANCED_CARDS_PER_DECK) return; // tope de mejoradas por mazo
        deckCounts[trackingKey] = (deckCounts[trackingKey] || 0) + 1;
        renderPool();
        renderList();
      });

      grid.appendChild(wrap);
    }

    cards.forEach(card => {
      const owned = ownedCounts[card.id] || 0;
      const enhancementKeyword = enhancements[card.id];

      if (enhancementKeyword) {
        // BUGFIX (revisión post-Etapa 4): la carta tiene una mejora crafteada — se muestra
        // como un slot SEPARADO y distinguible ("✨ Mejorada"), siempre con tope de 1 copia
        // (solo existe UNA copia mejorada, sin importar cuántas tengas en total). El resto
        // de tus copias (si te queda alguna) se muestra aparte, como una carta normal.
        const enhancedDisplayCard = { ...card, keywords: [...(card.keywords || []), enhancementKeyword] };
        renderPoolTile(enhancedDisplayCard, `${card.id}${ENHANCED_SUFFIX}`, 1, true);

        const remainingOwned = Math.max(0, owned - 1);
        if (remainingOwned > 0) renderPoolTile(card, card.id, remainingOwned, false);
      } else {
        renderPoolTile(card, card.id, owned, false);
      }
    });
  }

  function renderList() {
    const entries = Object.entries(deckCounts).filter(([, n]) => n > 0);
    const total = totalInDeck();
    countLabel.textContent = `Tu mazo (${total} / ${DECK_SIZE_EXACT} cartas)`;
    countLabel.style.color = total === DECK_SIZE_EXACT ? '#7cbf7c' : '#f0e0b0';

    const saveBtn = overlay.querySelector('#deckbuilder-save');
    saveBtn.disabled = total !== DECK_SIZE_EXACT;

    if (entries.length === 0) {
      list.innerHTML = '<div class="deckbuilder-empty-hint">Todavía no agregaste ninguna carta — hacé click en una de la izquierda.</div>';
      return;
    }

    list.innerHTML = '';
    entries
      .map(([trackingKey, count]) => {
        const isEnhanced = trackingKey.endsWith(ENHANCED_SUFFIX);
        const baseId = isEnhanced ? trackingKey.slice(0, -ENHANCED_SUFFIX.length) : trackingKey;
        return { trackingKey, card: cardDb.getById(baseId), count, isEnhanced };
      })
      .filter(e => e.card)
      .sort((a, b) => a.card.name.localeCompare(b.card.name))
      .forEach(({ trackingKey, card, count, isEnhanced }) => {
        const item = document.createElement('div');
        item.className = 'deckbuilder-list-item';
        const label = document.createElement('span');
        label.textContent = isEnhanced ? `${count}x ${card.name} ✨` : `${count}x ${card.name}`;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'deckbuilder-list-remove';
        removeBtn.textContent = '−';
        removeBtn.addEventListener('click', () => {
          deckCounts[trackingKey] = Math.max(0, (deckCounts[trackingKey] || 0) - 1);
          renderPool();
          renderList();
        });
        item.appendChild(label);
        item.appendChild(removeBtn);
        list.appendChild(item);
      });
  }

  overlay.querySelector('#deckbuilder-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderPool();
  });

  overlay.querySelectorAll('.encyclopedia-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      overlay.querySelectorAll('.encyclopedia-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPool();
    });
  });

  overlay.querySelector('#deckbuilder-cancel').addEventListener('click', () => {
    overlay.remove();
    onCancel();
  });

  overlay.querySelector('#deckbuilder-save').addEventListener('click', async () => {
    const cardIds = [];
    Object.entries(deckCounts).forEach(([id, count]) => {
      for (let i = 0; i < count; i++) cardIds.push(id);
    });
    // Chequeo defensivo: el botón ya debería estar deshabilitado salvo que sean
    // exactamente DECK_SIZE_EXACT cartas, pero no confiamos solo en eso.
    if (cardIds.length !== DECK_SIZE_EXACT) {
      errorBox.textContent = `El mazo tiene que tener exactamente ${DECK_SIZE_EXACT} cartas (tiene ${cardIds.length}).`;
      return;
    }
    errorBox.textContent = '';
    const saveBtn = overlay.querySelector('#deckbuilder-save');
    saveBtn.disabled = true;
    try {
      const updated = await createDeck(state.currentUser.uid, deckName, cardIds);
      state.userProfile = updated;
      overlay.remove();
      onSaved();
    } catch (err) {
      console.error('No se pudo guardar el mazo:', err);
      errorBox.textContent = err.message || 'No se pudo guardar el mazo. Probá de nuevo.';
      saveBtn.disabled = false;
    }
  });

  renderPool();
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
export function showPlayDeckPickerModal(onChooseDeck, onPlayRandom) {
  injectMyDecksStyles();
  injectStoreStyles(); // reusa .store-back-link para el link de "jugar random"

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
      <div class="mydecks-title">¿Con qué mazo jugás?</div>
    </div>
    <div class="mydecks-body">
      <div class="mydecks-slots-grid">${slotsHTML}</div>
      <div style="text-align:center; margin-top: 24px;">
        <button class="store-back-link" id="playpicker-random">🎲 Jugar con un mazo random en cambio</button>
      </div>
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

  overlay.querySelector('#playpicker-random').addEventListener('click', () => {
    overlay.remove();
    onPlayRandom();
  });
}

export function showMyDecksScreen(onBack) {
  injectMyDecksStyles();
  injectEncyclopediaStyles(); // reusamos .encyclopedia-grid-box para la vista de detalle
  injectDeckBuilderStyles(); // reusamos .deckbuilder-enhanced-marker para marcar la copia mejorada
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
      </div>
      <div class="encyclopedia-grid-box" id="mydecks-detail-grid"></div>
    `;
    body.querySelector('#mydecks-detail-back').addEventListener('click', renderListView);

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
// Fase 0 del multiplayer: widget de cuenta (login/logout con Google). Se usa en dos
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
    container.innerHTML = `
      ${adminBtnHTML}
      <div class="main-menu-account-info">
        <img class="main-menu-account-photo" src="${user.photoURL || ''}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="main-menu-account-name">${getLocalPlayerName()}</div>
          ${pointsHTML}
          <button class="main-menu-logout-btn" id="menu-logout">Cerrar sesión</button>
        </div>
      </div>
    `;
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
    .admin-body { flex: 1; overflow-y: auto; max-width: 700px; width: 100%; margin: 0 auto; padding-bottom: 40px; }
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
  injectEncyclopediaStyles(); // reusa .encyclopedia-back-btn

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
    { section: 'Puntos', id: 'winVsHumano', label: 'Victoria vs Humano (PvP, a futuro)', value: POINTS.winVsHumano, step: '1' },
    { section: 'Puntos', id: 'lossVsHumano', label: 'Derrota vs Humano (PvP, a futuro)', value: POINTS.lossVsHumano, step: '1' },
    { section: 'Puntos', id: 'abandonPenalty', label: 'Penalidad por abandonar', value: POINTS.abandonPenalty, step: '1' },
    { section: 'Sobres', id: 'packCost', label: 'Costo del sobre (puntos)', value: PACK_COST, step: '1' },
    { section: 'Sobres', id: 'mythicChancePercent', label: 'Probabilidad de carta mítica (%)', value: +(MYTHIC_CHANCE_IN_RARE_SLOT * 100).toFixed(2), step: '0.1' },
    { section: 'Fichas', id: 'fichasPerEnhancement', label: 'Fichas necesarias para craftear', value: FICHAS_PER_ENHANCEMENT, step: '1' },
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

  // Placeholders a propósito — mismo criterio que Multijugador en el menú principal: no
  // prometen algo que todavía no toca ningún sistema real del juego.
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

  // FASE 4 (post-roadmap): "regalar puntos/Fichas" — sección aparte de la config de
  // balance de arriba, con su propio botón de Enviar (no se guarda junto con "Guardar
  // cambios"; son dos acciones distintas). El desplegable de destinatarios arranca vacío y
  // se llena async más abajo (fetchAllUserProfiles) — no tiene sentido bloquear el resto
  // del panel esperando esa consulta.
  const grantHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Regalar Puntos o Fichas</div>
      <div class="admin-field-row">
        <span class="admin-field-label">Cantidad</span>
        <input type="number" class="admin-field-input" id="grant-amount" value="0" step="1">
      </div>
      <div class="admin-field-row">
        <span class="admin-field-label">Moneda</span>
        <select class="admin-field-input" id="grant-currency" style="text-align:left;">
          <option value="points">Puntos</option>
          <option value="fichas">Fichas</option>
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

  overlay.innerHTML = `
    <div class="admin-header">
      <button class="encyclopedia-back-btn" id="admin-back">← Volver</button>
      <div class="admin-title">🛠️ Panel de Admin</div>
    </div>
    <div class="admin-body">
      ${sectionsHTML}
      ${grantHTML}
      ${placeholdersHTML}
      <button class="admin-save-btn" id="admin-save">💾 Guardar cambios</button>
      <div class="store-error-msg" id="admin-error" style="text-align:center;"></div>
      <div class="admin-success-msg" id="admin-success"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Carga la lista real de usuarios de forma asíncrona — no bloquea el resto del panel,
  // que ya se ve de entrada mientras esto termina.
  const recipientSelect = overlay.querySelector('#grant-recipient');
  fetchAllUserProfiles()
    .then(profiles => {
      const options = ['<option value="ALL">Todos los usuarios</option>']
        .concat(profiles.map(p => `<option value="${p.uid}">${p.displayName || p.email || p.uid}</option>`));
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
    const currencyLabel = currencyField === 'points' ? 'puntos' : 'Fichas';

    if (!Number.isInteger(amount) || amount === 0) {
      grantErrorBox.textContent = 'La cantidad tiene que ser un número entero distinto de cero.';
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
        const result = await adminGrantCurrencyToAll(currencyField, amount);
        grantSuccessBox.textContent = `✅ Aplicado a ${result.succeeded}/${result.total} cuentas${result.failed > 0 ? ` (${result.failed} fallaron)` : ''}.`;
        await logAdminAction({ adminUid: state.currentUser.uid, targetUid: 'ALL', currencyField, amount, reason }).catch(() => {});
      } else {
        const newValue = await adminGrantCurrency(recipient, currencyField, amount);
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
      deckSizeExact: readNumber('deckSizeExact'),
      maxCopiesPerCard: readNumber('maxCopiesPerCard'),
      maxEnhancedCardsPerDeck: readNumber('maxEnhancedCardsPerDeck')
    };

    if (Object.values(newConfig).some(v => typeof v !== 'number' || Number.isNaN(v))) {
      errorBox.textContent = 'Todos los campos tienen que ser números válidos.';
      return;
    }
    // Un par de chequeos de sanidad mínimos — no reemplazan el criterio del admin, pero
    // evitan un typo catastrófico (ej. mazo de 0 cartas) que dejaría el juego injugable.
    if (newConfig.deckSizeExact <= 0 || newConfig.maxCopiesPerCard <= 0 || newConfig.packCost < 0 || newConfig.fichasPerEnhancement <= 0) {
      errorBox.textContent = 'Algún valor no tiene sentido (¿cero o negativo donde no correspondía?). Revisá antes de guardar.';
      return;
    }

    const saveBtn = overlay.querySelector('#admin-save');
    saveBtn.disabled = true;
    try {
      await saveGameConfig(newConfig);
      applyGameConfig(newConfig); // ya queda activo en ESTA sesión, sin recargar
      successBox.textContent = '✅ Guardado — ya está activo para todos los jugadores.';
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
      try { await cancelMatch(code); } catch (err) { console.error('No se pudo cancelar la partida:', err); }
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
    const myUid = state.currentUser.uid;
    const myRole = match.hostUid === myUid ? 'host' : 'guest';
    const rivalUid = myRole === 'host' ? match.guestUid : match.hostUid;
    const rivalName = (match.players && match.players[rivalUid] && match.players[rivalUid].displayName) || 'tu rival';

    body.innerHTML = `
      <div class="mp-section">
        <div class="mp-section-title">🎉 ¡Emparejado con ${rivalName}!</div>
        <div class="mp-section-desc">Elegí con qué mazo vas a jugar esta partida.</div>
        <button class="store-buy-btn" id="mp-start">Elegir mazo y arrancar</button>
      </div>
    `;
    body.querySelector('#mp-start').addEventListener('click', () => {
      overlay.remove();
      onMatched(match.code, myRole);
    });
  }

  renderHome();
}

export function showMainMenu(onPlay, onMultiplayerMatched) {
  injectMainMenuStyles();
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
  `;
  document.body.appendChild(overlay);
  renderAccountBox(overlay.querySelector('#main-menu-account'), state.currentUser);
  updateMainMenuLoginGatedButtons(overlay);

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

// Confirmación con texto escrito a propósito (no un simple sí/no) — borrar la cuenta es
// irreversible y destruye colección + puntos + Fichas + mazos, así que el botón de
// confirmar se queda deshabilitado hasta que el jugador escriba la palabra exacta.
export function showDeleteAccountModal(onConfirm, onCancel) {
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

export function showDeckSelectionModal(onChoose, titleOverrides = {}) {
  injectDeckSelectionStyles();

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

  overlay.innerHTML = `
    <div class="deck-select-panel">
      <div class="deck-select-title">${title}</div>
      <div class="deck-select-subtitle">${subtitle}</div>
      <div class="deck-select-mono-row">${monoButtonsHTML}</div>
      <div class="deck-select-divider">o combina dos colores</div>
      <div class="deck-select-pairs-grid">${pairButtonsHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);

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
  hand.forEach(card => {
    const cardEl = createCardElement(card, false, true, null, 'mulligan-pick', null);
    cardEl.classList.add('mulligan-card-slot');
    if (selectable) {
      cardEl.classList.add('selectable');
      cardEl.addEventListener('click', () => onCardClick(card, cardEl));
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
// PERMANENTES del campo (criaturas con contadores, Planeswalkers). Reusamos el mismo
// createCardElement que dibuja el resto del tablero (así se ve la carta real, con su
// badge de contadores o su cuadrito de Lealtad ya calculados solos) pero con zone='combat'
// y un customClick propio — eso pisa por completo el handler por defecto de esa zona
// (ver createCardElement: "if (customClick) ... else { ...zona... }"), así clickear una
// carta acá adentro NUNCA dispara handleCombatClick/handlePlaneswalkerClick del juego real.
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
          <span style="font-size:12px; font-weight:bold;">Veneno de ${entry.ownerIsLocal ? 'Vos' : 'El Tano'}</span>
          <span style="font-size:11px; color:#a89bb5;">(${poisonCount} actual)</span>
        </div>
      `;
      cardEl.addEventListener('click', toggle);
      row.appendChild(cardEl);
      return;
    }

    cardEl = createCardElement(entry.item, !!entry.item.tapped, entry.ownerIsLocal, null, 'combat', toggle);
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

// Escape: elegir N cartas del cementerio para exiliar como costo adicional. Mismo
// esqueleto exacto que showBottomCardsModal (selección hasta llegar a la cantidad exacta,
// confirmar deshabilitado hasta entonces) — reusamos buildMulliganCardRow porque acá los
// elegibles SON cartas de verdad (del cementerio), a diferencia de Proliferar que elige
// permanentes del campo.
export function showEscapeExileModal(graveyardCards, exileCount, onConfirm) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">🌀 Escape: elegí ${exileCount} carta${exileCount > 1 ? 's' : ''} de tu cementerio para exiliar</div>
      <div class="mulligan-subtitle" id="mulligan-count-hint-escape">Seleccionadas: 0 / ${exileCount}</div>
      <div class="mulligan-hand-row-slot"></div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-escape" disabled>Confirmar</button>
      </div>
    </div>
  `;

  const hint = () => overlay.querySelector('#mulligan-count-hint-escape');
  const confirmBtn = () => overlay.querySelector('#btn-confirm-escape');

  const row = buildMulliganCardRow(graveyardCards, true, (card, cardEl) => {
    if (chosen.has(card)) {
      chosen.delete(card);
      cardEl.classList.remove('chosen');
    } else if (chosen.size < exileCount) {
      chosen.add(card);
      cardEl.classList.add('chosen');
    }
    hint().textContent = `Seleccionadas: ${chosen.size} / ${exileCount}`;
    confirmBtn().disabled = chosen.size !== exileCount;
  });
  overlay.querySelector('.mulligan-hand-row-slot').replaceWith(row);
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-confirm-escape').addEventListener('click', () => {
    overlay.remove();
    onConfirm([...chosen]);
  });
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
  els.gameOverTitle.textContent = didWin ? "🏆 ¡Ganaste! Hiciste morder el polvo al Tano." : "💀 Perdiste. El Tano te ganó esta partida.";
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
        if (isLocal && state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2')) {
          const readySupport = group.ready[0];
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
export function render() {
  state.localHP = Math.max(0, Math.min(20, state.localHP));
  state.rivalHP = Math.max(0, Math.min(20, state.rivalHP));

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
  const turnOwnerBadge = document.getElementById('turn-owner-badge');
  if (turnOwnerBadge) {
      turnOwnerBadge.textContent = state.activePlayer === 'local' ? `Turno de: ${getLocalPlayerName()}` : "Turno de: El Tano";
      turnOwnerBadge.className = `turn-owner-badge ${state.activePlayer === 'local' ? 'local-active' : 'rival-active'}`;
  }

// Despintamos todos (solo quitamos los estados activos para no romper el layout)
  ['dot-upkeep', 'dot-main1', 'dot-combat', 'dot-main2', 'dot-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active', 'blinking');
  });

  // Pintamos según progreso
  if (state.phase === 'untap' || state.phase === 'upkeep' || state.phase === 'draw') document.getElementById('dot-upkeep')?.classList.add('active', 'blinking');
  if (state.phase === 'main1') document.getElementById('dot-main1')?.classList.add('active', 'blinking');
  if (state.phase.startsWith('combat')) document.getElementById('dot-combat')?.classList.add('active', 'blinking');
  if (state.phase === 'main2') document.getElementById('dot-main2')?.classList.add('active', 'blinking');
  if (state.phase === 'end_step' || state.phase === 'cleanup') document.getElementById('dot-end')?.classList.add('active', 'blinking');

  const subphaseText = document.getElementById('combat-subphase-text');
  if (state.phase.startsWith('combat_')) {
      const labels = {
          'combat_begin': 'Inicio',
          'combat_attackers': 'Atacantes',
          'combat_blockers': 'Bloqueadores',
          'combat_damage': 'Daño',
          'combat_end': 'Fin'
      };
      if (subphaseText) subphaseText.textContent = `- ${labels[state.phase]}`;
  } else {
      if (subphaseText) subphaseText.textContent = '';
  }

  // --- 2. GESTIÓN DEL BOTÓN DE ACCIÓN / PASAR PRIORIDAD ---
  els.btnEndTurn.disabled = (state.priorityPlayer !== 'local' || state.gameOver || state.isDiscarding);

  if (state.phase === 'combat_attackers' && state.activePlayer === 'local') {
    const isAttacking = state.localCombat.some(c => c.isAttacking);
    els.btnEndTurn.textContent = isAttacking ? "Confirmar Ataque ⚔️" : "Saltar Ataque ➔";
    els.btnEndTurn.onclick = executeLocalAttack;
    els.btnEndTurn.style.backgroundColor = isAttacking ? "#e74c3c" : "#e67e22";
  } else if (state.phase === 'combat_blockers' && state.activePlayer === 'rival') {
    els.btnEndTurn.textContent = "Confirmar Bloqueos 🛡️";
    els.btnEndTurn.onclick = executeRivalAttack;
    els.btnEndTurn.style.backgroundColor = "#3498db";
  } else {
    els.btnEndTurn.textContent = "Pasar Prioridad ➔";
    els.btnEndTurn.onclick = () => passPriority('local');
    els.btnEndTurn.style.backgroundColor = ""; // Defecto
  }

  // --- GESTIÓN DE COSTOS PENDIENTES ---
  if (state.isDiscarding) els.localHand.classList.add('discard-warning');
  else els.localHand.classList.remove('discard-warning');

  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay) {
    els.paymentControls.classList.remove('hidden'); els.btnEndTurn.classList.add('hidden'); 
    els.localHand.classList.add('paying-mode');
    if (!state.pendingCrew && !state.pendingWardChoice && !state.pendingCounterUnlessPay) els.localLands.classList.add('paying-mode');
    if (state.pendingSpellIndex !== null) {
      const pendingCardEl = els.localHand.children[state.pendingSpellIndex];
      if (pendingCardEl) pendingCardEl.classList.add('paying');
    }
    
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
      statusText = state.pendingTargetCard ? "¡Maná pagado! Elegí un objetivo brillante ✨" : "Falta: ";
      if (!state.pendingTargetCard) {
        if (state.pendingCost.W > 0) statusText += `${state.pendingCost.W} Blanco `;
        if (state.pendingCost.U > 0) statusText += `${state.pendingCost.U} Azul `;
        if (state.pendingCost.B > 0) statusText += `${state.pendingCost.B} Negro `;
        if (state.pendingCost.R > 0) statusText += `${state.pendingCost.R} Rojo `;
        if (state.pendingCost.G > 0) statusText += `${state.pendingCost.G} Verde `;
        if (state.pendingCost.generic > 0) statusText += `${state.pendingCost.generic} Genérico`;
        if (state.pendingHybridLifePayment) statusText += ` (+ ${state.pendingHybridLifePayment} de vida al terminar)`;
      }
    }
    els.paymentStatus.textContent = statusText;

    // Costo alternativo (pagar con vida en vez de maná): el botón solo aparece mientras
    // seguís pagando el maná normal — una vez que ya elegiste un camino (pagaste maná del
    // todo, o ya estás eligiendo objetivo) no tiene sentido seguir ofreciéndolo.
    const pendingCard = state.pendingSpellIndex !== null ? state.localHand[state.pendingSpellIndex] : null;
    if (pendingCard && pendingCard.alternativeCost && !state.pendingTargetCard && !state.pendingCrew && !state.pendingWardChoice && !state.pendingCounterUnlessPay && !state.pendingHybridLifePayment) {
      els.btnAltCost.classList.remove('hidden');
      const ac = pendingCard.alternativeCost;
      const altLabel = ac.type === 'life' ? `💉 Pagar con ${ac.amount} de vida en vez de maná`
        : ac.type === 'hybrid' ? `💉 Pagar con ${ac.manaCost} + ${ac.life} de vida en vez del costo completo`
        : `Pagar costo alternativo`;
      els.btnAltCost.textContent = altLabel;
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
    els.localHand.classList.remove('paying-mode'); els.localLands.classList.remove('paying-mode');
  }
  renderStack();
  checkAuraLegality();
  checkEquipmentLegality();
  checkGameOver();

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
  if (e.key === 'Escape' && (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null)) {
    cancelPayment(); 
  }
  
  // Pasar prioridad / Avanzar turno con la barra espaciadora
  if (e.code === 'Space') {
    // Si el botón está habilitado y visible, simulamos el click
    if (!els.btnEndTurn.disabled && !els.btnEndTurn.classList.contains('hidden')) {
      e.preventDefault(); // Evitamos que la pantalla scrollee para abajo
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
  const trampleTargetName = attackerItem.attackTarget ? attackerItem.attackTarget.card.name : 'al Tano';
  const trampleLabel = attackerItem.attackTarget ? `a ${trampleTargetName}` : trampleTargetName;

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
