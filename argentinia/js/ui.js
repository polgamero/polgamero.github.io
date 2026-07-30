import {
  state,
  getEffectivePower,
  getEffectiveToughness,
  getEffectiveKeywords,
  handleDiscardClick,
  playCard,
  tapLocalLand,
  handleCombatClick,
  handleSupportClick,
  handlePlayerTargetClick,
  attemptPassTurn,
  cancelPayment,
  checkGameOver
} from './main.js';

import { executeLocalAttack, executeRivalAttack } from './combatRules.js';
import { renderStack, spellStack } from './stackManager.js';

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
  btnRestartSidebar: document.getElementById('btn-restart-sidebar'),

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

  rivalDeckPile: null,
  rivalGYPile: null,
  localDeckPile: null,
  localGYPile: null,
  
  localSupport: document.getElementById('local-support'),
  rivalSupport: document.getElementById('rival-support'),
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

  const rivalCenterZone = document.createElement('div');
  rivalCenterZone.className = 'lands-center-zone';
  rivalCenterZone.appendChild(rivalWrapper); 

  rivalRowContainer.appendChild(els.rivalDeckPile);
  rivalRowContainer.appendChild(rivalCenterZone);
  rivalRowContainer.appendChild(els.rivalGYPile);

  const localRowContainer = document.createElement('div');
  localRowContainer.className = 'zone-row-container';
  localWrapper.parentNode.insertBefore(localRowContainer, localWrapper);

  els.localDeckPile = createPileElement('MAZO');
  els.localGYPile = createPileElement('CEMENTERIO');
  els.localGYPile.addEventListener('click', () => openGraveyardModal(true));

  const localCenterZone = document.createElement('div');
  localCenterZone.className = 'lands-center-zone';
  localCenterZone.appendChild(localWrapper); 

  localRowContainer.appendChild(els.localDeckPile);
  localRowContainer.appendChild(localCenterZone);
  localRowContainer.appendChild(els.localGYPile);
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
    return `<span class="mana-symbol ${colorClass}">${innerText}</span>`;
  }).join('');
}

export function getTargetRules(card) {
  if (card.adjunta) {
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: false };
  }
  return { allowPlayer: true, allowLocalCreature: true, allowRivalCreature: true };
}

export function createCardElement(itemObj, isTapped = false, isLocal = true, index = null, zone = 'hand') {
  const card = itemObj.card || itemObj;
  const el = document.createElement('div');
  
  const isSick = itemObj.summoningSickness ? 'sick' : '';
  const isAttacking = itemObj.isAttacking === true ? 'attacking' : '';
  const isBlocking = (itemObj.blockingIndex !== null && itemObj.blockingIndex !== undefined) ? 'blocking' : '';
  const isSelectedBlocker = (state.pendingBlockerIndex === index && zone === 'combat' && isLocal) ? 'selected-blocker' : '';

  let isTargetable = false;
  if (state.pendingTargetCard && zone === 'combat') {
    const rules = getTargetRules(state.pendingTargetCard);
    isTargetable = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
  }
  const targetClass = isTargetable ? 'targetable' : '';

  el.className = `card ${card.rarity || 'Common'} ${isTapped ? 'tapped' : ''} ${isSick} ${isAttacking} ${isBlocking} ${isSelectedBlocker} ${targetClass}`;

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
        <img src="./assets/images/${landSymbolImg}" alt="Símbolo de maná" style="width: 120%; height: auto; object-fit: contain; opacity: 0.9;" onerror="this.style.display='none'">
      </div>`;
  } else {
    let formattedText = card.text ? card.text.replace(/\{([WUBRGC])\}/g, (match, p1) => {
      let c = 'mana-c';
      if(p1==='W') c='mana-w'; if(p1==='U') c='mana-u'; if(p1==='B') c='mana-b'; if(p1==='R') c='mana-r'; if(p1==='G') c='mana-g';
      return `<span class="mana-symbol ${c}" style="display:inline-flex; width:4cqw; height:4cqw; font-size:2.5cqw; margin:0 2px; vertical-align:middle;"></span>`;
    }) : '';

    const effKeywords = card.power !== undefined ? getEffectiveKeywords(itemObj) : [];
    const KEYWORD_LABELS = { flying: '🕊️ Vuela', trample: '🐘 Arrolla', lifelink: '❤️ Vínculo vital', hexproof: '🛡️ Intocable', haste: '⚡ Prisa', menace: '👥 Amenaza', vigilance: '👁️ Vigilancia' };
    const keywordsHTML = effKeywords.length > 0
      ? `<div class="keyword-strip">${effKeywords.map(k => `<span class="keyword-tag">${KEYWORD_LABELS[k] || k}</span>`).join('')}</div>`
      : '';

    formattedTextHTML = `<div class="card-text-box">${keywordsHTML}<i>${card.flavorText || ''}</i><br><strong>${formattedText}</strong></div>`;
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

  const attachedAuras = itemObj.auras || [];
  const auraBadgeHTML = (zone === 'combat' && attachedAuras.length > 0)
    ? `<div class="aura-badge" title="${attachedAuras.map(a => a.name).join(', ')}">✨${attachedAuras.length > 1 ? attachedAuras.length : ''}</div>`
    : '';

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-header"><span class="card-title">${card.name}</span><span class="card-cost">${renderManaSymbols(card.manaCost)}</span></div>
      <div class="card-art" style="position: relative; overflow: hidden;">
        <div style="position: absolute; inset: 0; display: flex; justify-content: center; align-items: center;">${icon}</div>
        ${card.image ? `<img src="./assets/images/cards/${card.image}" alt="${card.name}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: cover; z-index: 2;" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="card-type-line">${card.type}<span class="rarity-icon">●</span></div>
      ${formattedTextHTML}
      ${card.power !== undefined ? `<div class="card-pt">${ptText}</div>` : ''}
      ${auraBadgeHTML}
    </div>
  `;

  const isInstant = card.type && card.type.includes('Instantáneo');
  const canRespondToStack = (spellStack && spellStack.length > 0) && isInstant;
  const isMyMainTurn = state.isPlayerTurn && state.phase === 'main';

  if (zone === 'hand' && isLocal && (isMyMainTurn || canRespondToStack) && !state.gameOver) {
    el.addEventListener('click', () => {
      if (state.isDiscarding) {
        handleDiscardClick(index);
      } else {
        playCard(index);
      }
    });
  } else if (zone === 'land' && isLocal && state.isPlayerTurn && state.phase === 'main' && !state.gameOver) {
    el.addEventListener('click', () => tapLocalLand(itemObj));
  } else if (zone === 'combat' && !state.gameOver) {
    el.addEventListener('click', () => handleCombatClick(itemObj, isLocal, index));
  } else if (zone === 'support' && isLocal && state.isPlayerTurn && state.phase === 'main' && !state.gameOver) {
    el.addEventListener('click', () => handleSupportClick(itemObj, isLocal, index));
  }

  return el;
}

const CARD_ASPECT = 5 / 7;
function getIdealCardHeightPx() { return window.innerHeight * 0.14; }
export function sizeCardsInRow(rowEl) {
  const cards = rowEl.querySelectorAll('.card');
  const n = cards.length;
  if (n === 0) return;
  const rowStyles = getComputedStyle(rowEl);
  const gap = parseFloat(rowStyles.columnGap) || parseFloat(rowStyles.gap) || 6;
  const availableWidth = rowEl.clientWidth - 6;
  const availableHeight = rowEl.clientHeight - 6;
  let cardHeight = Math.min(getIdealCardHeightPx(), availableHeight);
  let cardWidth = cardHeight * CARD_ASPECT;
  const widthIfFit = (availableWidth - (gap * Math.max(0, n - 1))) / n;
  if (widthIfFit < cardWidth) { cardWidth = Math.max(widthIfFit, 30); cardHeight = cardWidth / CARD_ASPECT; }
  cards.forEach(c => { c.style.width = `${cardWidth}px`; c.style.height = `${cardHeight}px`; });
}

export function sizeAllRows() {
  [els.localHand, els.rivalHand, els.localLands, els.rivalLands, els.localCombat, els.rivalCombat, els.localSupport, els.rivalSupport].forEach(sizeCardsInRow);
}

export function showGameOverOverlay(didWin) {
  els.gameOverTitle.textContent = didWin ? "🏆 ¡Ganaste! Hiciste morder el polvo al Tano." : "💀 Perdiste. El Tano te ganó esta partida.";
  els.gameOverOverlay.classList.remove('hidden'); els.btnEndTurn.disabled = true;
}

export function render() {
  state.localHP = Math.max(0, Math.min(20, state.localHP));
  state.rivalHP = Math.max(0, Math.min(20, state.rivalHP));

  els.localHand.innerHTML = ''; state.localHand.forEach((card, idx) => els.localHand.appendChild(createCardElement(card, false, true, idx, 'hand')));
  els.rivalHand.innerHTML = ''; state.rivalHand.forEach(() => {
    const back = document.createElement('div'); back.className = 'card card-back';
    back.innerHTML = `<img src="./assets/images/card_back.png" alt="Reverso" style="width: 100%; height: 100%; object-fit: cover; border-radius: 2px;" onerror="this.style.display='none'">`;
    els.rivalHand.appendChild(back);
  });

  els.localLands.innerHTML = ''; state.localLands.forEach(item => els.localLands.appendChild(createCardElement(item, item.tapped, true, null, 'land')));
  els.rivalLands.innerHTML = ''; state.rivalLands.forEach(item => els.rivalLands.appendChild(createCardElement(item, item.tapped, false, null, 'land')));
  
  els.localCombat.innerHTML = ''; state.localCombat.forEach((item, idx) => els.localCombat.appendChild(createCardElement(item, item.tapped, true, idx, 'combat')));
  els.rivalCombat.innerHTML = ''; state.rivalCombat.forEach((item, idx) => els.rivalCombat.appendChild(createCardElement(item, item.tapped, false, idx, 'combat')));

  els.localSupport.innerHTML = ''; state.localSupport.forEach((item, idx) => els.localSupport.appendChild(createCardElement(item, item.tapped, true, idx, 'support')));
  els.rivalSupport.innerHTML = ''; state.rivalSupport.forEach((item, idx) => els.rivalSupport.appendChild(createCardElement(item, item.tapped, false, idx, 'support')));
  
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

  els.btnEndTurn.onclick = null; 
  
  if (state.phase === 'main') {
    els.btnEndTurn.disabled = !state.isPlayerTurn || state.gameOver;
    if (state.localCombat.some(c => c.isAttacking)) {
      els.btnEndTurn.textContent = "Confirmar Ataque ⚔️";
      els.btnEndTurn.onclick = executeLocalAttack;
      els.btnEndTurn.style.backgroundColor = "#e74c3c";
    } else {
      els.btnEndTurn.textContent = "Pasar Turno ➔";
      els.btnEndTurn.onclick = attemptPassTurn;
      els.btnEndTurn.style.backgroundColor = "";
    }
  } else if (state.phase === 'local_block') {
    els.btnEndTurn.disabled = state.gameOver;
    els.btnEndTurn.textContent = "Confirmar Bloqueos 🛡️";
    els.btnEndTurn.onclick = executeRivalAttack;
    els.btnEndTurn.style.backgroundColor = "#3498db";
  }

  if (state.isDiscarding) {
    els.localHand.classList.add('discard-warning');
  } else {
    els.localHand.classList.remove('discard-warning');
  }

  if (state.pendingSpellIndex !== null) {
    els.paymentControls.classList.remove('hidden'); els.btnEndTurn.classList.add('hidden'); 
    els.localHand.classList.add('paying-mode'); els.localLands.classList.add('paying-mode');
    const pendingCardEl = els.localHand.children[state.pendingSpellIndex];
    if (pendingCardEl) pendingCardEl.classList.add('paying');
    
    let statusText = state.pendingTargetCard ? "¡Maná pagado! Elegí un objetivo brillante ✨" : "Falta: ";
    if (!state.pendingTargetCard) {
      if (state.pendingCost.W > 0) statusText += `${state.pendingCost.W} Blanco `;
      if (state.pendingCost.U > 0) statusText += `${state.pendingCost.U} Azul `;
      if (state.pendingCost.B > 0) statusText += `${state.pendingCost.B} Negro `;
      if (state.pendingCost.R > 0) statusText += `${state.pendingCost.R} Rojo `;
      if (state.pendingCost.G > 0) statusText += `${state.pendingCost.G} Verde `;
      if (state.pendingCost.generic > 0) statusText += `${state.pendingCost.generic} Genérico`;
    }
    els.paymentStatus.textContent = statusText;
  } else {
    els.paymentControls.classList.add('hidden'); els.btnEndTurn.classList.remove('hidden');
    els.localHand.classList.remove('paying-mode'); els.localLands.classList.remove('paying-mode');
  }
  renderStack();
  checkGameOver();
}

els.btnCancelSpell.addEventListener('click', cancelPayment);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.pendingSpellIndex !== null) cancelPayment(); });

let resizeTimeout = null; window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(sizeAllRows, 120); });
