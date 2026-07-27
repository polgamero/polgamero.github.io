import { cardDb } from './cardLoader.js';

// Inyectamos estilos dinámicos para Combate, Tarjeteo, Pistas laterales y Modal de Cementerio
const style = document.createElement('style');
style.innerHTML = `
  .card.attacking { box-shadow: 0 0 0 4px #e74c3c !important; transform: translateY(-10px); }
  .card.blocking { box-shadow: 0 0 0 4px #3498db !important; }
  .card.selected-blocker { box-shadow: 0 0 15px 6px #3498db !important; transform: scale(1.05); }
  
  /* Pistas laterales (Mazo y Cementerio) */
  .zone-row-container { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 10px; }
  .lands-center-zone { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 100px; }
  .side-pile { width: 70px; height: 98px; border: 2px dashed rgba(255,255,255,0.3); border-radius: 6px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); cursor: pointer; transition: transform 0.2s, border-color 0.2s; }
  .side-pile:hover { transform: scale(1.05); border-color: rgba(255,255,255,0.7); }
  .side-pile .pile-label { position: absolute; bottom: -18px; font-size: 10px; font-weight: bold; color: #ccc; text-transform: uppercase; letter-spacing: 0.5px; }
  .side-pile .pile-badge { position: absolute; top: -6px; right: -6px; background: #2c3e50; color: #fff; border: 1px solid #fff; border-radius: 10px; font-size: 10px; padding: 1px 5px; font-weight: bold; z-index: 5; }
  
  /* Sistema de Tarjeteo (Targeting) */
  .targetable { cursor: crosshair !important; animation: pulse-gold 1.2s infinite alternate; border: 2px solid #f1c40f !important; }
  @keyframes pulse-gold {
    0% { box-shadow: 0 0 5px #f1c40f; }
    100% { box-shadow: 0 0 20px #f39c12, 0 0 30px #f1c40f; }
  }

  /* Modal de Cementerio */
  .gy-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
  .gy-modal-content { background: #1a252f; border: 2px solid #34495e; border-radius: 8px; width: 90%; max-width: 800px; max-height: 80vh; display: flex; flex-direction: column; padding: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.7); }
  .gy-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #34495e; padding-bottom: 10px; margin-bottom: 15px; color: #ecf0f1; }
  .gy-modal-grid { display: flex; flex-wrap: wrap; gap: 10px; overflow-y: auto; padding: 10px; justify-content: center; }
  .gy-close-btn { background: #e74c3c; color: white; border: none; padding: 6px 15px; border-radius: 4px; font-weight: bold; cursor: pointer; }
  .gy-close-btn:hover { background: #c0392b; }
`;
document.head.appendChild(style);

const ICON_MAP = {
  'Diego': '⚽', 'San Martín': '🐎', 'Ricky': '🍫', 'Gauchito': '🚩', 'Mate': '🧉', 'Parrilla': '🥩', 'Tierra': '⛰️', 'Estancia': '🏡', 'Obelisco': '🏙️', 'Perro': '🐕', 'Luz Mala': '👻', 'Carpincho': '🐹', 'Colectivo': '🚌', 'Asado': '🥩', 'Dólar': '💵', 'Pombero': '👺'
};

const state = {
  turnCount: 1,
  isPlayerTurn: true,
  phase: 'main', 
  gameOver: false,

  localHP: 20,
  localManaMax: 0,
  localManaCurrent: 0,
  localDeck: [],
  localHand: [],
  localLands: [],
  localCombat: [],
  localGraveyard: [], 
  localLandPlayedThisTurn: false,

  rivalHP: 20,
  rivalManaMax: 0,
  rivalManaCurrent: 0,
  rivalDeck: [],
  rivalHand: [],
  rivalLands: [],
  rivalCombat: [],
  rivalGraveyard: [], 
  rivalLandPlayedThisTurn: false,

  pendingSpellIndex: null, 
  pendingCost: null,       
  tappedLandsThisSpell: [],
  pendingTargetCard: null, // Para hechizos que requieren objetivo
  
  pendingBlockerIndex: null 
};

const els = {
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
  localMana: document.getElementById('local-mana-text'),
  rivalMana: document.getElementById('rival-mana-text'),

  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverTitle: document.getElementById('game-over-title'),
  btnRestart: document.getElementById('btn-restart'),

  paymentControls : document.getElementById('payment-controls'),
  paymentStatus : document.getElementById('payment-status'),
  btnCancelSpell : document.getElementById('btn-cancel-spell'),

  // Pistas dinámicas
  rivalDeckPile: null,
  rivalGYPile: null,
  localDeckPile: null,
  localGYPile: null
};

async function initGame() {
  logMsg("Cargando el mazo...");
  await cardDb.loadAll();

  setupBoardLayout(); // Armado visual de las pistas de Mazo/Cementerio

  state.localDeck = shuffle([...cardDb.allCards]);
  state.rivalDeck = shuffle([...cardDb.allCards]);

  for (let i = 0; i < 7; i++) {
    state.localHand.push(state.localDeck.pop());
    state.rivalHand.push(state.rivalDeck.pop());
  }

  els.btnRestart.addEventListener('click', () => location.reload());
  els.btnRestartSidebar.addEventListener('click', () => location.reload());

  // Listeners para targeting en Jugadores
  els.rivalHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(false));
  els.localHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(true));

  render();
  logMsg("¡Arranca la partida! Robaste tus 7 cartas iniciales.");
  logMsg("¡Tu turno! Bajá una estancia para empezar.");
}

// Restructuración dinámica del DOM para Mazo y Cementerio laterales
function setupBoardLayout() {
  const rivalLandsEl = document.getElementById('rival-lands');
  const localLandsEl = document.getElementById('local-lands');

  // Rival Row
  const rivalRowContainer = document.createElement('div');
  rivalRowContainer.className = 'zone-row-container';
  rivalLandsEl.parentNode.insertBefore(rivalRowContainer, rivalLandsEl);

  els.rivalDeckPile = createPileElement('MAZO', true);
  els.rivalGYPile = createPileElement('CEMENTERIO', false);
  els.rivalGYPile.addEventListener('click', () => openGraveyardModal(false));

  const rivalCenterZone = document.createElement('div');
  rivalCenterZone.className = 'lands-center-zone';
  rivalCenterZone.appendChild(rivalLandsEl);

  rivalRowContainer.appendChild(els.rivalDeckPile);
  rivalRowContainer.appendChild(rivalCenterZone);
  rivalRowContainer.appendChild(els.rivalGYPile);

  // Local Row
  const localRowContainer = document.createElement('div');
  localRowContainer.className = 'zone-row-container';
  localLandsEl.parentNode.insertBefore(localRowContainer, localLandsEl);

  els.localDeckPile = createPileElement('MAZO', true);
  els.localGYPile = createPileElement('CEMENTERIO', false);
  els.localGYPile.addEventListener('click', () => openGraveyardModal(true));

  const localCenterZone = document.createElement('div');
  localCenterZone.className = 'lands-center-zone';
  localCenterZone.appendChild(localLandsEl);

  localRowContainer.appendChild(els.localDeckPile);
  localRowContainer.appendChild(localCenterZone);
  localRowContainer.appendChild(els.localGYPile);
}

function createPileElement(label, isDeck) {
  const div = document.createElement('div');
  div.className = 'side-pile';
  div.innerHTML = `
    <div class="pile-badge">0</div>
    <div class="pile-content" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:4px;"></div>
    <div class="pile-label">${label}</div>
  `;
  return div;
}

function updatePilesUI() {
  // Rival Deck
  els.rivalDeckPile.querySelector('.pile-badge').textContent = state.rivalDeck.length;
  const rivalDeckContent = els.rivalDeckPile.querySelector('.pile-content');
  rivalDeckContent.innerHTML = state.rivalDeck.length > 0 
    ? `<img src="./assets/images/card_back.png" style="width:100%; height:100%; object-fit:cover;">` 
    : `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;

  // Local Deck
  els.localDeckPile.querySelector('.pile-badge').textContent = state.localDeck.length;
  const localDeckContent = els.localDeckPile.querySelector('.pile-content');
  localDeckContent.innerHTML = state.localDeck.length > 0 
    ? `<img src="./assets/images/card_back.png" style="width:100%; height:100%; object-fit:cover;">` 
    : `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;

  // Rival GY
  els.rivalGYPile.querySelector('.pile-badge').textContent = state.rivalGraveyard.length;
  const rivalGYContent = els.rivalGYPile.querySelector('.pile-content');
  if (state.rivalGraveyard.length > 0) {
    const topCard = state.rivalGraveyard[state.rivalGraveyard.length - 1];
    rivalGYContent.innerHTML = topCard.image 
      ? `<img src="./assets/images/cards/${topCard.image}" style="width:100%; height:100%; object-fit:cover;">`
      : `<div style="font-size:9px; text-align:center; padding:2px; color:#fff;">${topCard.name}</div>`;
  } else {
    rivalGYContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }

  // Local GY
  els.localGYPile.querySelector('.pile-badge').textContent = state.localGraveyard.length;
  const localGYContent = els.localGYPile.querySelector('.pile-content');
  if (state.localGraveyard.length > 0) {
    const topCard = state.localGraveyard[state.localGraveyard.length - 1];
    localGYContent.innerHTML = topCard.image 
      ? `<img src="./assets/images/cards/${topCard.image}" style="width:100%; height:100%; object-fit:cover;">`
      : `<div style="font-size:9px; text-align:center; padding:2px; color:#fff;">${topCard.name}</div>`;
  } else {
    localGYContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }
}

function openGraveyardModal(isLocal) {
  const gyArray = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const title = isLocal ? "Tu Cementerio" : "Cementerio del Tano";

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'gy-modal-overlay';
  
  let cardsHTML = '';
  if (gyArray.length === 0) {
    cardsHTML = `<div style="color:#bdc3c7; font-style:italic; padding:40px;">No hay cartas en el cementerio todavía.</div>`;
  } else {
    cardsHTML = gyArray.map(card => {
      let icon = '🃏';
      for (const key in ICON_MAP) { if (card.name.includes(key)) icon = ICON_MAP[key]; }
      return `
        <div class="card ${card.rarity || 'Common'}" style="width:100px; height:140px; position:relative; pointer-events:none;">
          <div class="card-inner">
            <div class="card-header"><span class="card-title" style="font-size:8px;">${card.name}</span></div>
            <div class="card-art" style="position:relative; overflow:hidden;">
              <div style="position:absolute; inset:0; display:flex; justify-content:center; align-items:center;">${icon}</div>
              ${card.image ? `<img src="./assets/images/cards/${card.image}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="card-type-line" style="font-size:7px;">${card.type}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  modalOverlay.innerHTML = `
    <div class="gy-modal-content">
      <div class="gy-modal-header">
        <h3>🪦 ${title} (${gyArray.length})</h3>
        <button class="gy-close-btn">Cerrar ✖</button>
      </div>
      <div class="gy-modal-grid">${cardsHTML}</div>
    </div>
  `;

  document.body.appendChild(modalOverlay);
  modalOverlay.querySelector('.gy-close-btn').onclick = () => modalOverlay.remove();
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
}

function shuffle(array) { return array.sort(() => Math.random() - 0.5); }

function logMsg(msg) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  els.gameLogBox.appendChild(entry);
  els.gameLogBox.scrollTop = els.gameLogBox.scrollHeight;
}

function renderManaSymbols(manaCostStr) {
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

function createCardElement(itemObj, isTapped = false, isLocal = true, index = null, zone = 'hand') {
  const card = itemObj.card || itemObj;
  const el = document.createElement('div');
  
  const isSick = itemObj.summoningSickness ? 'sick' : '';
  const isAttacking = itemObj.isAttacking === true ? 'attacking' : '';
  const isBlocking = (itemObj.blockingIndex !== null && itemObj.blockingIndex !== undefined) ? 'blocking' : '';
  const isSelectedBlocker = (state.pendingBlockerIndex === index && zone === 'combat' && isLocal) ? 'selected-blocker' : '';
  
  // Highlight de Targeting
  const isTargetable = (state.pendingTargetCard !== null && zone === 'combat');
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

  let textBoxHTML = '';
  if (isBasicLand && landSymbolImg) {
    textBoxHTML = `<div class="card-text-box" style="display: flex; justify-content: center; align-items: center; background: rgba(255,255,255,0.85); padding: 0;">
        <img src="./assets/images/${landSymbolImg}" alt="Símbolo de maná" style="width: 120%; height: auto; object-fit: contain; opacity: 0.9;" onerror="this.style.display='none'">
      </div>`;
  } else {
    let formattedText = card.text ? card.text.replace(/\{([WUBRGC])\}/g, (match, p1) => {
      let c = 'mana-c';
      if(p1==='W') c='mana-w'; if(p1==='U') c='mana-u'; if(p1==='B') c='mana-b'; if(p1==='R') c='mana-r'; if(p1==='G') c='mana-g';
      return `<span class="mana-symbol ${c}" style="display:inline-flex; width:4cqw; height:4cqw; font-size:2.5cqw; margin:0 2px; vertical-align:middle;">${p1}</span>`;
    }) : '';
    textBoxHTML = `<div class="card-text-box"><i>${card.flavorText || ''}</i><br><strong>${formattedText}</strong></div>`;
  }

  let ptText = card.power !== undefined ? `${card.power}/${card.toughness}` : '';
  if (itemObj.damageTaken > 0 && card.toughness !== undefined) {
    ptText = `${card.power}/<span style="color:red;">${card.toughness - itemObj.damageTaken}</span>`;
  }

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-header"><span class="card-title">${card.name}</span><span class="card-cost">${renderManaSymbols(card.manaCost)}</span></div>
      <div class="card-art" style="position: relative; overflow: hidden;">
        <div style="position: absolute; inset: 0; display: flex; justify-content: center; align-items: center;">${icon}</div>
        ${card.image ? `<img src="./assets/images/cards/${card.image}" alt="${card.name}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: cover; z-index: 2;" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="card-type-line">${card.type}</div>
      ${textBoxHTML}
      ${card.power !== undefined ? `<div class="card-pt">${ptText}</div>` : ''}
    </div>
  `;

  if (zone === 'hand' && isLocal && state.isPlayerTurn && state.phase === 'main' && !state.gameOver) {
    el.addEventListener('click', () => playCard(index));
  } else if (zone === 'land' && isLocal && state.isPlayerTurn && state.phase === 'main' && !state.gameOver) {
    el.addEventListener('click', () => tapLocalLand(itemObj));
  } else if (zone === 'combat' && !state.gameOver) {
    el.addEventListener('click', () => handleCombatClick(itemObj, isLocal, index));
  }

  return el;
}

function handleCombatClick(item, isLocal, index) {
  // Si estamos en modo selección de objetivo para un hechizo
  if (state.pendingTargetCard) {
    executeSpellOnTarget({ type: 'creature', isLocal, index, item });
    return;
  }

  if (state.phase === 'main' && isLocal && state.isPlayerTurn) {
    if (item.summoningSickness) {
      logMsg(`Tu ${item.card.name} está mareado y no puede atacar este turno.`);
      return;
    }
    if (item.tapped) return; 
    
    item.isAttacking = !item.isAttacking;
    render();
  } 
  else if (state.phase === 'local_block') {
    if (isLocal) {
      if (item.tapped) {
        logMsg("No podés bloquear con una criatura girada.");
        return;
      }
      state.pendingBlockerIndex = index;
      logMsg(`Seleccionaste ${item.card.name}. Ahora hacé clic en el atacante del Tano que querés bloquear.`);
      render();
    } else {
      if (state.pendingBlockerIndex !== null && item.isAttacking) {
        state.localCombat[state.pendingBlockerIndex].blockingIndex = index;
        logMsg(`Asignaste a ${state.localCombat[state.pendingBlockerIndex].card.name} a bloquear a ${item.card.name}.`);
        state.pendingBlockerIndex = null;
        render();
      }
    }
  }
}

function handlePlayerTargetClick(isLocal) {
  if (state.pendingTargetCard) {
    executeSpellOnTarget({ type: 'player', isLocal });
  }
}

const CARD_ASPECT = 5 / 7;
function getIdealCardHeightPx() { return window.innerHeight * 0.14; }
function sizeCardsInRow(rowEl) {
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
function sizeAllRows() {
  [els.localHand, els.rivalHand, els.localLands, els.rivalLands, els.localCombat, els.rivalCombat].forEach(sizeCardsInRow);
}

function render() {
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

  // Highlight de Jugadores si se busca objetivo
  if (state.pendingTargetCard) {
    els.rivalHpBar.parentElement.classList.add('targetable');
    els.localHpBar.parentElement.classList.add('targetable');
  } else {
    els.rivalHpBar.parentElement.classList.remove('targetable');
    els.localHpBar.parentElement.classList.remove('targetable');
  }

  sizeAllRows();
  updatePilesUI();

  els.localMana.textContent = `${state.localManaCurrent} / ${state.localManaMax}`;
  els.rivalMana.textContent = `${state.rivalManaCurrent} / ${state.rivalManaMax}`;
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
      els.btnEndTurn.onclick = passTurnToRival;
      els.btnEndTurn.style.backgroundColor = "";
    }
  } else if (state.phase === 'local_block') {
    els.btnEndTurn.disabled = state.gameOver;
    els.btnEndTurn.textContent = "Confirmar Bloqueos 🛡️";
    els.btnEndTurn.onclick = executeRivalAttack;
    els.btnEndTurn.style.backgroundColor = "#3498db";
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
  checkGameOver();
}

function parseManaCost(manaString) {
  const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, generic: 0 };
  if (!manaString) return cost;
  const matches = manaString.match(/\{[^}]+\}/g);
  if (!matches) return cost;
  matches.forEach(m => {
    const val = m.replace(/[{}]/g, '');
    if (['W', 'U', 'B', 'R', 'G'].includes(val)) cost[val] += 1;
    else if (!isNaN(val)) cost.generic += parseInt(val, 10);
  });
  return cost;
}

function getLandColor(cardText) {
  if (!cardText) return 'generic';
  if (cardText.includes('{W}')) return 'W'; if (cardText.includes('{U}')) return 'U'; if (cardText.includes('{B}')) return 'B'; if (cardText.includes('{R}')) return 'R'; if (cardText.includes('{G}')) return 'G';
  return 'generic'; 
}

function cancelPayment() {
  if (state.pendingSpellIndex === null) return;
  state.tappedLandsThisSpell.forEach(land => land.tapped = false);
  state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; state.pendingTargetCard = null;
  logMsg("Cancelaste el hechizo. Las tierras se enderezaron.");
  render();
}

els.btnCancelSpell.addEventListener('click', cancelPayment);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.pendingSpellIndex !== null) cancelPayment(); });

function checkGameOver() {
  if (state.gameOver) return;
  if (state.localHP <= 0) {
    state.gameOver = true; logMsg("💀 Te quedaste sin HP. ¡Ganó el Tano!"); showGameOverOverlay(false);
  } else if (state.rivalHP <= 0) {
    state.gameOver = true; logMsg("🏆 ¡VICTORIA! Hiciste morder el polvo al Tano."); showGameOverOverlay(true);
  }
}

function showGameOverOverlay(didWin) {
  els.gameOverTitle.textContent = didWin ? "🏆 ¡Ganaste! Hiciste morder el polvo al Tano." : "💀 Perdiste. El Tano te ganó esta partida.";
  els.gameOverOverlay.classList.remove('hidden'); els.btnEndTurn.disabled = true;
}

function playCard(index) {
  if (!state.isPlayerTurn || state.gameOver || state.pendingSpellIndex !== null) return; 
  const card = state.localHand[index];
  if (card.type.includes('Tierra')) {
    if (state.localLandPlayedThisTurn) { logMsg("Ya bajaste una estancia en este turno."); return; }
    state.localLands.push({ card, tapped: false }); state.localHand.splice(index, 1); state.localLandPlayedThisTurn = true;
    logMsg(`Bajaste la estancia: ${card.name}.`); render(); return;
  }
  state.pendingSpellIndex = index; state.pendingCost = parseManaCost(card.manaCost); state.tappedLandsThisSpell = [];
  logMsg(`Preparando: ${card.name}. Seleccioná tierras para pagar.`);
  checkPaymentComplete(); render();
}

function tapLocalLand(item) {
  if (!state.isPlayerTurn || state.gameOver || item.tapped) return;
  if (state.pendingSpellIndex === null) { logMsg("Seleccioná primero un hechizo de tu mano para pagar."); return; }
  const landColor = getLandColor(item.card.text); let used = false;
  if (['W', 'U', 'B', 'R', 'G'].includes(landColor) && state.pendingCost[landColor] > 0) { state.pendingCost[landColor] -= 1; used = true; } 
  else if (state.pendingCost.generic > 0) { state.pendingCost.generic -= 1; used = true; }
  if (used) { item.tapped = true; state.tappedLandsThisSpell.push(item); checkPaymentComplete(); } 
  else { logMsg(`Esa yerba (${landColor}) no te sirve para este hechizo.`); }
  render();
}

function checkPaymentComplete() {
  if (state.pendingSpellIndex === null) return;
  const cost = state.pendingCost;
  if ((cost.W + cost.U + cost.B + cost.R + cost.G + cost.generic) === 0) {
    const card = state.localHand[state.pendingSpellIndex];
    
    if (card.power !== undefined) {
      // Invocación de criatura
      state.localHand.splice(state.pendingSpellIndex, 1);
      state.localCombat.push({ card, tapped: false, summoningSickness: true, isAttacking: false, blockingIndex: null, damageTaken: 0 });
      logMsg(`¡Invocaste a ${card.name}! (No puede atacar este turno)`);
      state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = [];
    } else {
      // Es un hechizo/conjuro: Pedir objetivo o resolver
      if (card.effect && (card.effect.type === 'damage' || card.effect.type === 'heal')) {
        state.pendingTargetCard = card;
        logMsg(`¡Maná pagado! Hacé clic en un jugador o criatura para aplicar ${card.name}.`);
      } else {
        state.localHand.splice(state.pendingSpellIndex, 1);
        resolveSpellDirect(card, true);
        state.localGraveyard.push(card); // Al cementerio
        state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = [];
      }
    }
  }
}

function executeSpellOnTarget(targetObj) {
  if (!state.pendingTargetCard) return;
  const card = state.localHand.splice(state.pendingSpellIndex, 1)[0];
  const effect = card.effect;

  if (targetObj.type === 'player') {
    const targetName = targetObj.isLocal ? "vos" : "el Tano";
    if (effect.type === 'damage') {
      if (targetObj.isLocal) state.localHP -= effect.amount; else state.rivalHP -= effect.amount;
      logMsg(`💥 ¡${card.name}! Le hiciste ${effect.amount} de daño a ${targetName}.`);
    } else if (effect.type === 'heal') {
      if (targetObj.isLocal) state.localHP += effect.amount; else state.rivalHP += effect.amount;
      logMsg(`💚 ¡${card.name}! Le curaste ${effect.amount} de HP a ${targetName}.`);
    }
  } else if (targetObj.type === 'creature') {
    const targetUnit = targetObj.item;
    if (effect.type === 'damage') {
      targetUnit.damageTaken += effect.amount;
      logMsg(`💥 ¡${card.name}! Le hiciste ${effect.amount} de daño a ${targetUnit.card.name}.`);
      checkDeaths(state.localCombat, state.localGraveyard, "Vos");
      checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
    }
  }

  state.localGraveyard.push(card); // Va al cementerio
  state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; state.pendingTargetCard = null;
  render();
}

function resolveSpellDirect(card, isLocal) {
  const effect = card.effect; if(!effect) return;
  const targetName = isLocal ? "vos" : "el Tano";
  if (effect.type === 'draw') {
    for(let i=0; i<effect.amount; i++) {
      if(isLocal && state.localDeck.length > 0) state.localHand.push(state.localDeck.pop());
      if(!isLocal && state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
    }
    logMsg(`🃏 ¡${card.name}! ${targetName} robó ${effect.amount} cartas extras.`);
  }
}

async function executeLocalAttack() {
  const attackers = state.localCombat.filter(c => c.isAttacking);
  if (attackers.length === 0) return;

  attackers.forEach(a => a.tapped = true);
  logMsg(`🗡️ Declaraste ${attackers.length} atacantes.`);

  let availableBlockers = state.rivalCombat.map((c, i) => ({c, i})).filter(obj => !obj.c.tapped);
  
  state.localCombat.forEach((att, aIdx) => {
    if (att.isAttacking && availableBlockers.length > 0) {
      let blockerObj = availableBlockers.pop();
      state.rivalCombat[blockerObj.i].blockingIndex = aIdx;
      logMsg(`🛡️ El Tano bloquea a tu ${att.card.name} usando su ${blockerObj.c.card.name}.`);
    }
  });

  resolveCombatDamage(state.localCombat, state.rivalCombat, true);
  render();
}

function executeRivalAttack() {
  logMsg(`🛡️ Resolviendo combates...`);
  resolveCombatDamage(state.rivalCombat, state.localCombat, false);
  
  state.phase = 'main';
  startLocalTurn(); 
}

function resolveCombatDamage(attackersArray, defendersArray, isLocalAttacking) {
  attackersArray.forEach((attacker, aIdx) => {
    if (!attacker.isAttacking) return;

    let blockers = defendersArray.filter(d => d.blockingIndex === aIdx);

    if (blockers.length === 0) {
      if (isLocalAttacking) state.rivalHP -= attacker.card.power;
      else state.localHP -= attacker.card.power;
      logMsg(`💥 ${attacker.card.name} conectó el golpe! Hizo ${attacker.card.power} de daño.`);
    } else {
      let blocker = blockers[0];
      blocker.damageTaken += attacker.card.power;
      attacker.damageTaken += blocker.card.power;
      logMsg(`⚔️ Choque: ${attacker.card.name} y ${blocker.card.name} se hacen daño mutuo.`);
    }
  });

  checkDeaths(state.localCombat, state.localGraveyard, "Vos");
  checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");

  attackersArray.forEach(c => c.isAttacking = false);
  defendersArray.forEach(c => c.blockingIndex = null);
  state.pendingBlockerIndex = null;
}

function checkDeaths(combatArray, graveyardArray, ownerName) {
  for (let i = combatArray.length - 1; i >= 0; i--) {
    let unit = combatArray[i];
    if (unit.damageTaken >= unit.card.toughness) {
      logMsg(`💀 ${unit.card.name} de ${ownerName} murió y va al cementerio.`);
      graveyardArray.push(unit.card);
      combatArray.splice(i, 1);
    }
  }
}

async function passTurnToRival() {
  if (!state.isPlayerTurn || state.gameOver) return;
  state.isPlayerTurn = false;
  state.localCombat.forEach(c => c.isAttacking = false);
  els.btnEndTurn.textContent = "Turno Rival...";
  els.btnEndTurn.style.backgroundColor = "#7f8c8d";
  logMsg("Terminaste tu turno. El Tano está pensando...");
  
  state.localCombat.forEach(c => c.damageTaken = 0);
  state.rivalCombat.forEach(c => c.damageTaken = 0);
  
  render();
  setTimeout(startRivalTurn, 1500);
}

async function startRivalTurn() {
  if (state.gameOver) return;
  state.rivalLandPlayedThisTurn = false;
  state.rivalLands.forEach(l => l.tapped = false);
  state.rivalCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
  state.rivalManaCurrent = state.rivalManaMax;
  if (state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
  render(); if (state.gameOver) return; await sleep(1000); if (state.gameOver) return;

  const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
  if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
    const landCard = state.rivalHand.splice(landIndex, 1)[0];
    state.rivalLands.push({ card: landCard, tapped: false }); state.rivalLandPlayedThisTurn = true; state.rivalManaMax += 1; state.rivalManaCurrent += 1;
    logMsg(`El Tano bajó una estancia: ${landCard.name}.`); render(); if (state.gameOver) return; await sleep(1000);
  }

  let affordableIndex = state.rivalHand.findIndex(c => !c.type.includes('Tierra') && c.cmc <= state.rivalManaCurrent);
  while(affordableIndex !== -1) {
    const cardToPlay = state.rivalHand.splice(affordableIndex, 1)[0];
    state.rivalManaCurrent -= cardToPlay.cmc;
    let manaToTap = cardToPlay.cmc; state.rivalLands.forEach(l => { if (!l.tapped && manaToTap > 0) { l.tapped = true; manaToTap--; } });
    if (cardToPlay.power !== undefined) {
      state.rivalCombat.push({ card: cardToPlay, tapped: false, summoningSickness: true, isAttacking: false, blockingIndex: null, damageTaken: 0 });
      logMsg(`¡El Tano invocó a ${cardToPlay.name}!`);
    } else {
      logMsg(`El Tano usó: ${cardToPlay.name}`); 
      if (cardToPlay.effect && cardToPlay.effect.type === 'damage') {
        state.localHP -= cardToPlay.effect.amount; // IA apunta al jugador por ahora
      } else {
        resolveSpellDirect(cardToPlay, false);
      }
      state.rivalGraveyard.push(cardToPlay);
    }
    render(); if (state.gameOver) return; await sleep(1000);
    affordableIndex = state.rivalHand.findIndex(c => !c.type.includes('Tierra') && c.cmc <= state.rivalManaCurrent);
  }

  let attackCount = 0;
  state.rivalCombat.forEach(unit => {
    if (!unit.tapped && !unit.summoningSickness) {
      unit.isAttacking = true;
      unit.tapped = true; 
      attackCount++;
    }
  });

  if (attackCount > 0) {
    const localHasUntappedBlockers = state.localCombat.some(c => !c.tapped);
    
    if (localHasUntappedBlockers) {
      state.phase = 'local_block';
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s)! Asigná tus bloqueadores y confirmá (o dejá pasar el daño).`);
      render();
    } else {
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s) y no tenés defensores disponibles!`);
      resolveCombatDamage(state.rivalCombat, state.localCombat, false);
      await sleep(1500);
      startLocalTurn();
    }
  } else {
    logMsg("El Tano no atacó con nada.");
    await sleep(1000);
    startLocalTurn();
  }
}

function startLocalTurn() {
  if (state.gameOver) return;
  state.turnCount++;
  state.isPlayerTurn = true;
  state.phase = 'main';

  state.localLandPlayedThisTurn = false;
  state.localLands.forEach(l => l.tapped = false);
  state.localCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
  state.rivalCombat.forEach(c => c.damageTaken = 0); 
  state.localManaCurrent = state.localManaMax;

  if (state.localDeck.length > 0) {
    state.localHand.push(state.localDeck.pop());
    logMsg(`Turno ${state.turnCount}: Enderezaste y robaste una carta.`);
  }
  render();
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
let resizeTimeout = null; window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(sizeAllRows, 120); });

initGame();
