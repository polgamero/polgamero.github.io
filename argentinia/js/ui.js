import {
  state,
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
  passPriority // Importado del nuevo sistema
} from './main.js';

import { executeLocalAttack, executeRivalAttack } from './combatRules.js';
import { renderStack, spellStack } from './stackManager.js';
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

  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverTitle: document.getElementById('game-over-title'),
  btnRestart: document.getElementById('btn-restart'),

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
  if (effectType === 'exile_creature' || effectType === 'exile_and_return') {
    // Remoción: apunta a una criatura de cualquier lado (igual que destruir/rebotar). En
    // exile_and_return en particular, apuntar a tu PROPIA criatura suele ser justo el punto
    // (retriggerea su "cuando entra", le saca auras malas encima, resetea el daño marcado).
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
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

export function showDeckSelectionModal(onChoose) {
  injectDeckSelectionStyles();

  const overlay = document.createElement('div');
  overlay.id = 'deck-select-overlay';

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
      <div class="deck-select-title">Elegi tu mazo</div>
      <div class="deck-select-subtitle">El Tano ya barajo el suyo al azar. Vos elegis con que pelear.</div>
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

  els.localHpText.textContent = `${state.localHP} / 20 HP`; els.rivalHpText.textContent = `${state.rivalHP} / 20 HP`;
  els.localHpBar.style.width = `${(state.localHP / 20) * 100}%`; els.rivalHpBar.style.width = `${(state.rivalHP / 20) * 100}%`;

  // --- 1. GESTIÓN VISUAL DEL HUD Y FASES ---
  const turnOwnerBadge = document.getElementById('turn-owner-badge');
  if (turnOwnerBadge) {
      turnOwnerBadge.textContent = state.activePlayer === 'local' ? "Turno de: El Gaucho" : "Turno de: El Tano";
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
  checkGameOver();
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
      html += `
         <div class="damage-row trample-row">
           <div style="text-align: left;">
             <strong style="font-size: 1.1rem;">🐘 Arrollar al Tano</strong><br>
             <span style="font-size: 0.8rem; color: #aaa;">
               ${allLethalMet ? 'Se calcula automáticamente con lo que sobre.' : 'Asigná primero daño letal a todos los bloqueadores.'}
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
