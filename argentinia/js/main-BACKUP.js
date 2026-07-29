import { cardDb } from './cardLoader.js';

const ICON_MAP = {
  'Diego': '⚽', 'San Martín': '🐎', 'Ricky': '🍫', 'Gauchito': '🚩', 'Mate': '🧉', 'Parrilla': '🥩', 'Tierra': '⛰️', 'Estancia': '🏡', 'Obelisco': '🏙️', 'Perro': '🐕', 'Luz Mala': '👻', 'Carpincho': '🐹', 'Colectivo': '🚌', 'Asado': '🥩', 'Dólar': '💵', 'Pombero': '👺'
};

const state = {
  turnCount: 1,
  isPlayerTurn: true,
  phase: 'main', 
  gameOver: false,

  localHP: 20,
  localDeck: [],
  localHand: [],
  localLands: [],
  localCombat: [],
  localGraveyard: [], 
  localLandPlayedThisTurn: false,

  rivalHP: 20,
  rivalDeck: [],
  rivalHand: [],
  rivalLands: [],
  rivalCombat: [],
  rivalGraveyard: [], 
  rivalLandPlayedThisTurn: false,

  pendingSpellIndex: null, 
  pendingCost: null,       
  tappedLandsThisSpell: [],
  pendingTargetCard: null,
  
  pendingBlockerIndex: null,
  
  localSupport: [],
  rivalSupport: [],
  pendingTargetSource: null, // Para saber de dónde viene el efecto (mano, etb, habilidad)

  isDiscarding: false,
  cardsToDiscard: 0
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

async function initGame() {
  logMsg("Cargando el mazo...");
  await cardDb.loadAll();

  setupBoardLayout();

  state.localDeck = buildRandomDeck();
  state.rivalDeck = buildRandomDeck();

  for (let i = 0; i < 7; i++) {
    state.localHand.push(state.localDeck.pop());
    state.rivalHand.push(state.rivalDeck.pop());
  }

  els.btnRestart.addEventListener('click', () => location.reload());
  els.btnRestartSidebar.addEventListener('click', () => location.reload());

  els.rivalHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(false));
  els.localHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(true));

  render();
  logMsg("¡Arranca la partida! Robaste tus 7 cartas iniciales.");
  logMsg("¡Tu turno! Bajá una estancia para empezar.");
}

function setupBoardLayout() {
  const rivalWrapper = document.getElementById('rival-wrapper');
  const localWrapper = document.getElementById('local-wrapper');

  // Zona Rival
  const rivalRowContainer = document.createElement('div');
  rivalRowContainer.className = 'zone-row-container';
  rivalWrapper.parentNode.insertBefore(rivalRowContainer, rivalWrapper);

  els.rivalDeckPile = createPileElement('MAZO');
  els.rivalGYPile = createPileElement('CEMENTERIO');
  els.rivalGYPile.addEventListener('click', () => openGraveyardModal(false));

  const rivalCenterZone = document.createElement('div');
  rivalCenterZone.className = 'lands-center-zone';
  rivalCenterZone.appendChild(rivalWrapper); // Ahora mete el wrapper entero

  rivalRowContainer.appendChild(els.rivalDeckPile);
  rivalRowContainer.appendChild(rivalCenterZone);
  rivalRowContainer.appendChild(els.rivalGYPile);

  // Zona Local
  const localRowContainer = document.createElement('div');
  localRowContainer.className = 'zone-row-container';
  localWrapper.parentNode.insertBefore(localRowContainer, localWrapper);

  els.localDeckPile = createPileElement('MAZO');
  els.localGYPile = createPileElement('CEMENTERIO');
  els.localGYPile.addEventListener('click', () => openGraveyardModal(true));

  const localCenterZone = document.createElement('div');
  localCenterZone.className = 'lands-center-zone';
  localCenterZone.appendChild(localWrapper); // Ahora mete el wrapper entero

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

function updatePilesUI() {
  // Mazo Rival
  els.rivalDeckPile.querySelector('.pile-badge').textContent = state.rivalDeck.length;
  const rivalDeckContent = els.rivalDeckPile.querySelector('.pile-content');
  rivalDeckContent.innerHTML = state.rivalDeck.length > 0 
    ? `<img src="./assets/images/card_back.png" style="width:100%; height:100%; object-fit:cover;">` 
    : `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;

  // Mazo Local
  els.localDeckPile.querySelector('.pile-badge').textContent = state.localDeck.length;
  const localDeckContent = els.localDeckPile.querySelector('.pile-content');
  localDeckContent.innerHTML = state.localDeck.length > 0 
    ? `<img src="./assets/images/card_back.png" style="width:100%; height:100%; object-fit:cover;">` 
    : `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;

  // Cementerio Rival
  els.rivalGYPile.querySelector('.pile-badge').textContent = state.rivalGraveyard.length;
  const rivalGYContent = els.rivalGYPile.querySelector('.pile-content');
  rivalGYContent.innerHTML = '';
  if (state.rivalGraveyard.length > 0) {
    const topCard = state.rivalGraveyard[state.rivalGraveyard.length - 1];
    // Renderizamos la carta completa con la función global
    const cardEl = createCardElement(topCard, false, false, null, 'graveyard');
    rivalGYContent.appendChild(cardEl);
  } else {
    rivalGYContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }

  // Cementerio Local
  els.localGYPile.querySelector('.pile-badge').textContent = state.localGraveyard.length;
  const localGYContent = els.localGYPile.querySelector('.pile-content');
  localGYContent.innerHTML = '';
  if (state.localGraveyard.length > 0) {
    const topCard = state.localGraveyard[state.localGraveyard.length - 1];
    // Renderizamos la carta completa con la función global
    const cardEl = createCardElement(topCard, false, true, null, 'graveyard');
    localGYContent.appendChild(cardEl);
  } else {
    localGYContent.innerHTML = `<span style="font-size:10px; color:#7f8c8d;">Vacío</span>`;
  }
}

function openGraveyardModal(isLocal) {
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
    // Generamos las cartas completas usando createCardElement para mantener consistencia
    gyArray.forEach((cardObj, idx) => {
      const cardEl = createCardElement(cardObj, false, isLocal, idx, 'modal');
      // Forzamos tamaño estándar similar a la mano para que el grid sea uniforme
      cardEl.style.width = '120px';
      cardEl.style.height = '168px';
      gridContent.appendChild(cardEl);
    });
  }

  modalOverlay.querySelector('.gy-close-btn').onclick = () => modalOverlay.remove();
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
}

function shuffle(array) { return array.sort(() => Math.random() - 0.5); }

function buildRandomDeck() {
  // 1. Separamos las cartas disponibles en dos grupos
  const landsPool = cardDb.allCards.filter(c => c.type.includes('Tierra'));
  const spellsPool = cardDb.allCards.filter(c => !c.type.includes('Tierra'));

  const deck = [];
  const TOTAL_LANDS = 24; // Proporción clásica de MTG
  const TOTAL_SPELLS = 36;

  // 2. Rellenamos con 24 tierras al azar
  for (let i = 0; i < TOTAL_LANDS; i++) {
    // Si por algún motivo no hay tierras en el JSON, evitamos que se rompa
    if (landsPool.length === 0) break; 
    const randomLand = landsPool[Math.floor(Math.random() * landsPool.length)];
    // El spread operator {...} clona la carta para que sean instancias independientes
    deck.push({ ...randomLand }); 
  }

  // 3. Rellenamos con 36 hechizos al azar
  for (let i = 0; i < TOTAL_SPELLS; i++) {
    if (spellsPool.length === 0) break;
    const randomSpell = spellsPool[Math.floor(Math.random() * spellsPool.length)];
    deck.push({ ...randomSpell });
  }

  // 4. Mezclamos el mazo resultante de 60 cartas y lo devolvemos
  return shuffle(deck);
}

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

  // Stats "efectivos": la base de la carta + lo que le suman/restan las Auras pegadas
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
      <div class="card-type-line">${card.type}</div>
      ${formattedTextHTML}
      ${card.power !== undefined ? `<div class="card-pt">${ptText}</div>` : ''}
      ${auraBadgeHTML}
    </div>
  `;

  if (zone === 'hand' && isLocal && state.isPlayerTurn && state.phase === 'main' && !state.gameOver) {
    el.addEventListener('click', () => {
      // Si está en modo descarte, descarta la carta
      if (state.isDiscarding) {
        handleDiscardClick(index);
      } else {
        // Sino, juega la carta normalmente
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

// Reglas de objetivo válido según la carta que se está lanzando.
// Por defecto (hechizos de daño/cura de siempre) se mantiene el comportamiento
// histórico: pueden apuntar a cualquier jugador o criatura. Las Auras (adjunta:true)
// sólo pueden apuntar a una criatura propia, porque se quedan pegadas a ella.
function getTargetRules(card) {
  if (card.adjunta) {
    return { allowPlayer: false, allowLocalCreature: true, allowRivalCreature: false };
  }
  return { allowPlayer: true, allowLocalCreature: true, allowRivalCreature: true };
}

// --- Stats efectivos: base de la carta + modificadores de todas las Auras pegadas ---
function getEffectivePower(itemObj) {
  const card = itemObj.card || itemObj;
  let p = card.power || 0;
  (itemObj.auras || []).forEach(auraCard => {
    const mod = auraCard.auraEffect && auraCard.auraEffect.stats;
    if (mod) p += (mod.signo === '-' ? -1 : 1) * mod.cantidad;
  });
  return p;
}
function getEffectiveToughness(itemObj) {
  const card = itemObj.card || itemObj;
  let t = card.toughness || 0;
  (itemObj.auras || []).forEach(auraCard => {
    const mod = auraCard.auraEffect && auraCard.auraEffect.stats;
    if (mod) t += (mod.signo === '-' ? -1 : 1) * mod.cantidad;
  });
  return t;
}
function getEffectiveKeywords(itemObj) {
  const card = itemObj.card || itemObj;
  const base = card.keywords || [];
  const fromAuras = (itemObj.auras || []).flatMap(a => (a.auraEffect && a.auraEffect.keywords) || []);
  return [...new Set([...base, ...fromAuras])];
}

// Pega un Aura a una criatura: queda registrada en su lista `auras` y modifica
// sus stats/keywords efectivos de ahí en más (hasta que la criatura muera).
function attachAura(auraCard, creatureItem) {
  if (!creatureItem.auras) creatureItem.auras = [];
  creatureItem.auras.push(auraCard);
  logMsg(`✨ ¡${auraCard.name} se pegó a ${creatureItem.card.name}!`);
}

function handleCombatClick(item, isLocal, index) {
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
    if (!allowed) {
      logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
      return;
    }
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
    const rules = getTargetRules(state.pendingTargetCard);
    if (!rules.allowPlayer) {
      logMsg(`${state.pendingTargetCard.name} necesita una criatura como objetivo, no un jugador.`);
      return;
    }
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
  [els.localHand, els.rivalHand, els.localLands, els.rivalLands, els.localCombat, els.rivalCombat,els.localSupport,els.rivalSupport].forEach(sizeCardsInRow);
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

function getLandColor(card) {
  if (card && card.produces) return card.produces;
  const cardText = card && card.text;
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
  const landColor = getLandColor(item.card); let used = false;
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
    
    const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);

    if (card.power !== undefined) {
      // (Tu código actual para criaturas)
      state.localHand.splice(state.pendingSpellIndex, 1);
      const newCreature = { 
        card, 
        tapped: false, 
        summoningSickness: true, 
        isAttacking: false, 
        blockingIndex: null, 
        damageTaken: 0, 
        auras: [] 
      };
      state.localCombat.push(newCreature);
      logMsg(`¡Invocaste a ${card.name}! (No puede atacar este turno)`);

      // === NUEVO: LÓGICA ETB PARA CRIATURAS ===
      if (card.etbEffect) {
        if (card.requiresTarget) {
          // Si el efecto pide que elijas a quién hacerle el daño/curación
          state.pendingTargetCard = card;
          state.pendingTargetSource = { type: 'etb', item: newCreature };
          logMsg(`¡Efecto activado! Elegí un objetivo para ${card.name}.`);
        } else {
          // Si es directo (como hacerle 3 de daño al Tano automáticamente)
          resolveEffectDirect(card.etbEffect, card.name, true);
          render();
        }
      }
      // =========================================

      // Limpiamos los estados de casteo
      state.pendingSpellIndex = null; 
      state.pendingCost = null; 
      state.tappedLandsThisSpell = [];
      
    } else if (isPermanent) {
      // NUEVO: Lógica de Artefactos y Encantamientos
      state.localHand.splice(state.pendingSpellIndex, 1);
      const supportItem = { card, tapped: false };
      state.localSupport.push(supportItem);
      logMsg(`¡Bajaste ${card.name} a tu zona de soporte!`);

      if (card.etbEffect) {
        if (card.requiresTarget) {
          state.pendingTargetCard = card;
          state.pendingTargetSource = { type: 'etb', item: supportItem };
          logMsg(`¡Efecto activado! Elegí un objetivo para ${card.name}.`);
        } else {
          resolveEffectDirect(card.etbEffect, card.name, true);
        }
      }
      state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = [];

    } else {
      // (Tu código actual para Instantaneos/Conjuros/Auras)
      const needsTarget = card.adjunta || (card.requiresTarget ?? (card.effect && (card.effect.type === 'damage' || card.effect.type === 'heal')));
      if (needsTarget) {
        state.pendingTargetCard = card;
        state.pendingTargetSource = null; // Viene de la mano
        const targetHint = card.adjunta ? `Hacé clic en una de tus criaturas para encantarla con ${card.name}.` : `Hacé clic en un jugador o criatura para aplicar ${card.name}.`;
        logMsg(`¡Maná pagado! ${targetHint}`);
      } else {
        state.localHand.splice(state.pendingSpellIndex, 1);
        resolveEffectDirect(card.effect, card.name, true);
        state.localGraveyard.push(card);
        state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = [];
      }
    }
  }
}

function executeSpellOnTarget(targetObj) {
  if (!state.pendingTargetCard) return;

  let card;
  let effectToApply;
  let isPermanentSource = state.pendingTargetSource !== null;

  // Extraemos la carta y el efecto correcto dependiendo de dónde provenga la acción
  if (isPermanentSource) {
    card = state.pendingTargetSource.item.card;
    effectToApply = state.pendingTargetSource.type === 'etb' ? card.etbEffect : card.activatedAbility.effect;
  } else {
    card = state.localHand.splice(state.pendingSpellIndex, 1)[0];
    effectToApply = card.effect;
  }

  // AURA
  if (card.adjunta && !isPermanentSource) {
    attachAura(card, targetObj.item);
    state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; state.pendingTargetCard = null;
    render();
    return;
  }

  if (targetObj.type === 'player') {
    const targetName = targetObj.isLocal ? "vos" : "el Tano";
    if (effectToApply.type === 'damage') {
      if (targetObj.isLocal) state.localHP -= effectToApply.amount; else state.rivalHP -= effectToApply.amount;
      logMsg(`💥 ¡${card.name}! Le hiciste ${effectToApply.amount} de daño a ${targetName}.`);
    } else if (effectToApply.type === 'heal') {
      if (targetObj.isLocal) state.localHP += effectToApply.amount; else state.rivalHP += effectToApply.amount;
      logMsg(`💚 ¡${card.name}! Le curaste ${effectToApply.amount} de HP a ${targetName}.`);
    }
  } else if (targetObj.type === 'creature') {
    const targetUnit = targetObj.item;
    if (effectToApply.type === 'damage') {
      targetUnit.damageTaken += effectToApply.amount;
      logMsg(`💥 ¡${card.name}! Le hiciste ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
      checkDeaths(state.localCombat, state.localGraveyard, "Vos");
      checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
    }
  }

  // Solo va al cementerio si fue un hechizo desde la mano
  if (!isPermanentSource) {
    state.localGraveyard.push(card);
    state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; 
  }
  
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  render();
}

  function handleSupportClick(item, isLocal, index) {
  if (!isLocal || !state.isPlayerTurn || state.phase !== 'main' || state.gameOver) return;

  const card = item.card;
  if (card.activatedAbility) {
    if (card.activatedAbility.cost === "{T}") {
      if (item.tapped) {
        logMsg(`El permanente ${card.name} ya está girado.`);
        return;
      }
      item.tapped = true;
      logMsg(`Giraste ${card.name} para usar su habilidad.`);

      if (card.activatedAbility.requiresTarget) {
        state.pendingTargetCard = card;
        state.pendingTargetSource = { type: 'support_activation', item };
        logMsg(`Seleccioná un objetivo para el efecto de ${card.name}.`);
        render();
      } else {
        resolveEffectDirect(card.activatedAbility.effect, card.name, true);
        render();
      }
    }
  }
}

function resolveEffectDirect(effect, cardName, isLocal) {
  if(!effect) return;
  const targetName = isLocal ? "vos" : "el Tano";
  if (effect.type === 'draw') {
    for(let i=0; i<effect.amount; i++) {
      if(isLocal && state.localDeck.length > 0) state.localHand.push(state.localDeck.pop());
      if(!isLocal && state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
    }
    logMsg(`🃏 ¡${cardName}! ${targetName} robó ${effect.amount} cartas extras.`);
  } else if (effect.type === 'heal') {
    if (isLocal) state.localHP += effect.amount; else state.rivalHP += effect.amount;
    logMsg(`💚 ¡${cardName}! ${targetName} recuperó ${effect.amount} de HP.`);
  } else if (effect.type === 'damage') {
    if (isLocal) state.rivalHP -= effect.amount; else state.localHP -= effect.amount;
    logMsg(`💥 ¡${cardName}! ${targetName} hizo ${effect.amount} de daño.`);
  }
}

// Retrocompatibilidad para tu código
function resolveSpellDirect(card, isLocal) { resolveEffectDirect(card.effect, card.name, isLocal); }

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
    const attackerPower = getEffectivePower(attacker);

    if (blockers.length === 0) {
      if (isLocalAttacking) state.rivalHP -= attackerPower;
      else state.localHP -= attackerPower;
      logMsg(`💥 ${attacker.card.name} conectó el golpe! Hizo ${attackerPower} de daño.`);
    } else {
      let blocker = blockers[0];
      const blockerPower = getEffectivePower(blocker);
      blocker.damageTaken += attackerPower;
      attacker.damageTaken += blockerPower;
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
    if (unit.damageTaken >= getEffectiveToughness(unit)) {
      logMsg(`💀 ${unit.card.name} de ${ownerName} murió y va al cementerio.`);
      graveyardArray.push(unit.card);
      if (unit.auras && unit.auras.length > 0) {
        unit.auras.forEach(auraCard => {
          logMsg(`💔 ${auraCard.name} se desprendió y también fue al cementerio.`);
          graveyardArray.push(auraCard);
        });
      }
      combatArray.splice(i, 1);
    }
  }
}

function attemptPassTurn() {
  if (!state.isPlayerTurn || state.gameOver) return;

  if (state.isDiscarding) {
    logMsg("❌ ¡Epa! Primero tenés que descartar las cartas que te sobran.");
    return;
  }

  const excess = state.localHand.length - 7;
  
  if (excess > 0) {
    // FASE DE DESCARTE MANUAL
    state.isDiscarding = true;
    state.cardsToDiscard = excess;
    logMsg(`⚠️ Tenés demasiadas cartas. Hacé clic en ${excess} carta(s) de tu mano para descartar.`);
    render(); // Para actualizar UI si le ponemos bordes rojos a la mano luego
  } else {
    // PASA EL TURNO NORMALMENTE
    logMsg("Terminás tu turno.");
    passTurnToRival();
  }
}

function handleDiscardClick(index) {
  // Sacamos la carta elegida y la mandamos al cementerio
  const discardedCard = state.localHand.splice(index, 1)[0];
  state.localGraveyard.push(discardedCard);
  state.cardsToDiscard--;
  
  logMsg(`🗑️ Descartaste ${discardedCard.name}.`);

  // Chequeamos si ya cumplió con el límite
  if (state.cardsToDiscard <= 0) {
    state.isDiscarding = false;
    logMsg("Mano en 7 cartas. ¡Turno del Tano!");
    passTurnToRival();
  }
  
  render();
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

function canRivalAfford(card) {
  if (!card.manaCost) return true;
  const cost = parseManaCost(card.manaCost);
  
  const available = { W: 0, U: 0, B: 0, R: 0, G: 0, total: 0 };
  
  // Contamos qué colores tiene disponibles el Tano en sus tierras enderezadas
  state.rivalLands.forEach(landItem => {
    if (!landItem.tapped) {
      const color = getLandColor(landItem.card);
      if (['W', 'U', 'B', 'R', 'G'].includes(color)) {
        available[color]++;
      }
      available.total++;
    }
  });

  // Verificamos que tenga los colores específicos
  if (available.W < cost.W) return false;
  if (available.U < cost.U) return false;
  if (available.B < cost.B) return false;
  if (available.R < cost.R) return false;
  if (available.G < cost.G) return false;

  // Verificamos si le sobran tierras para el maná genérico
  const remainingForGeneric = available.total - (cost.W + cost.U + cost.B + cost.R + cost.G);
  if (remainingForGeneric < cost.generic) return false;

  return true;
}

function tapRivalLandsFor(card) {
  if (!card.manaCost) return;
  const cost = parseManaCost(card.manaCost);
  
  // 1. Giramos primero las tierras de los colores específicos que pide la carta
  ['W', 'U', 'B', 'R', 'G'].forEach(color => {
    let needed = cost[color];
    for (let i = 0; i < state.rivalLands.length && needed > 0; i++) {
      const land = state.rivalLands[i];
      if (!land.tapped && getLandColor(land.card) === color) {
        land.tapped = true;
        needed--;
      }
    }
  });

  // 2. Giramos cualquier tierra que quede suelta para pagar el maná genérico
  let genericNeeded = cost.generic;
  for (let i = 0; i < state.rivalLands.length && genericNeeded > 0; i++) {
    const land = state.rivalLands[i];
    if (!land.tapped) {
      land.tapped = true;
      genericNeeded--;
    }
  }
}

async function startRivalTurn() {
  if (state.gameOver) return;
  state.rivalLandPlayedThisTurn = false;
  state.rivalLands.forEach(l => l.tapped = false);
  state.rivalCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
  state.rivalSupport.forEach(s => s.tapped = false);
  if (state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
  render(); if (state.gameOver) return; await sleep(1000); if (state.gameOver) return;

  const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
  if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
    const landCard = state.rivalHand.splice(landIndex, 1)[0];
    state.rivalLands.push({ card: landCard, tapped: false }); state.rivalLandPlayedThisTurn = true;
    logMsg(`El Tano bajó una estancia: ${landCard.name}.`); render(); if (state.gameOver) return; await sleep(1000);
  }

  let affordableIndex = state.rivalHand.findIndex(c => !c.type.includes('Tierra') && canRivalAfford(c));
  while(affordableIndex !== -1) {
    const cardToPlay = state.rivalHand.splice(affordableIndex, 1)[0];
    
    // Restamos del contador visual de maná
    const cost = parseManaCost(cardToPlay.manaCost);
    const totalCost = cost.W + cost.U + cost.B + cost.R + cost.G + cost.generic;
    
    // Giramos las tierras usando la nueva función
    tapRivalLandsFor(cardToPlay);

    const isPermanent = cardToPlay.type.includes('Artefacto') || (cardToPlay.type.includes('Encantamiento') && !cardToPlay.adjunta);

    if (cardToPlay.power !== undefined) {
      state.rivalCombat.push({ card: cardToPlay, tapped: false, summoningSickness: true, isAttacking: false, blockingIndex: null, damageTaken: 0, auras: [] });
      logMsg(`¡El Tano invocó a ${cardToPlay.name}!`);
    } else if (isPermanent) {
      // NUEVO: Manejo de Artefactos y Encantamientos para la IA
      const supportItem = { card: cardToPlay, tapped: false };
      state.rivalSupport.push(supportItem);
      logMsg(`¡El Tano bajó ${cardToPlay.name} a su zona de soporte!`);

      // Si la carta tiene efecto al entrar en juego (ETB)
      if (cardToPlay.etbEffect) {
        resolveEffectDirect(cardToPlay.etbEffect, cardToPlay.name, false);
      }
    } else if (cardToPlay.adjunta) {
      if (state.rivalCombat.length > 0) {
        attachAura(cardToPlay, state.rivalCombat[0]);
      } else {
        logMsg(`El Tano no tenía criaturas para encantar con ${cardToPlay.name} y lo descartó.`);
        state.rivalGraveyard.push(cardToPlay);
      }
    } else {
      logMsg(`El Tano usó: ${cardToPlay.name}`); 
      resolveSpellDirect(cardToPlay, false);
      state.rivalGraveyard.push(cardToPlay);
    }
    render(); if (state.gameOver) return; await sleep(1000);
    affordableIndex = state.rivalHand.findIndex(c => !c.type.includes('Tierra') && canRivalAfford(c));
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
        const rivalExcess = state.rivalHand.length - 7;
        if (rivalExcess > 0) {
          for (let i = 0; i < rivalExcess; i++) {
          // Por ahora, lógica simple: descarta cartas al azar
          const randomIndex = Math.floor(Math.random() * state.rivalHand.length);
          const discardedCard = state.rivalHand.splice(randomIndex, 1)[0];
          state.rivalGraveyard.push(discardedCard);
          logMsg(`🗑️ El Tano descartó ${discardedCard.name} por límite de mano.`);
          }
        }
      startLocalTurn();
    }
  } else {
    logMsg("El Tano no atacó con nada.");
    await sleep(1000);
      const rivalExcess = state.rivalHand.length - 7;
      if (rivalExcess > 0) {
      for (let i = 0; i < rivalExcess; i++) {
        // Por ahora, lógica simple: descarta cartas al azar
        const randomIndex = Math.floor(Math.random() * state.rivalHand.length);
        const discardedCard = state.rivalHand.splice(randomIndex, 1)[0];
        state.rivalGraveyard.push(discardedCard);
        logMsg(`🗑️ El Tano descartó ${discardedCard.name} por límite de mano.`);
        }
      }
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
  state.localSupport.forEach(s => s.tapped = false);

  if (state.localDeck.length > 0) {
    state.localHand.push(state.localDeck.pop());
    logMsg(`Turno ${state.turnCount}: Enderezaste y robaste una carta.`);
  }
  render();
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
let resizeTimeout = null; window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(sizeAllRows, 120); });

initGame();
