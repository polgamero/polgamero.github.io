import {
  state,
  getEffectivePower,
  getEffectiveToughness,
  getEffectiveKeywords,
  getEquipmentOn,
  handleDiscardClick,
  playCard,
  canPlayCard,
  tapLocalLand,
  handleCombatClick,
  handleSupportClick,
  handleSupportTargetClick,
  handlePlayerTargetClick,
  cancelPayment,
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
  if (effectType === 'fight') {
    // Pelear: tu criatura (implícita) contra una criatura del rival.
    return { allowPlayer: false, allowLocalCreature: false, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
  }
  if (effectType === 'discard') {
    return { allowPlayer: true, allowLocalCreature: false, allowRivalCreature: false, allowLocalPermanent: false, allowRivalPermanent: false };
  }

  return { allowPlayer: true, allowLocalCreature: true, allowRivalCreature: true, allowLocalPermanent: false, allowRivalPermanent: false };
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
  }

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
  el.className = `card ${bgClass} ${card.rarity || 'Common'} ${isTapped ? 'tapped' : ''} ${isSick} ${isAttacking} ${isBlocking} ${isSelectedBlocker} ${targetClass}`;

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

    const KEYWORD_LABELS = { 
      flying: '🕊️ Vuela', trample: '🐘 Arrolla', hexproof: '🛡️ Intocable', haste: '⚡ Prisa', 
      menace: '👥 Amenaza', vigilance: '👁️ Vigilancia', reach: '🏹 Alcance', defender: '🧱 Defensora',
      lifelink: '❤️ Vínculo vital', deathtouch: '💀 Toque mortal', firststrike: '🗡️ Primer golpe', doublestrike: '⚔️ Doble golpe', indestructible: '💎 Indestructible'
    };
      
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

  const attachedEquipment = (zone === 'combat' && card.power !== undefined) ? getEquipmentOn(itemObj) : [];
  const equipmentBadgeHTML = attachedEquipment.length > 0
    ? `<div class="aura-badge" style="left: 4px; right: auto;" title="${attachedEquipment.map(e => e.card.name).join(', ')}">⚔️${attachedEquipment.length > 1 ? attachedEquipment.length : ''}</div>`
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
      ${equipmentBadgeHTML}
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
    }
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
      max-width: 880px; width: 92%; max-height: 90vh; overflow-y: auto;
      background: linear-gradient(180deg, rgba(18,25,15,0.97), rgba(11,19,14,0.99));
      border: 2px solid var(--gold, #d4af37);
      border-radius: 16px;
      padding: 28px 34px;
      box-shadow: 0 0 60px rgba(212,175,55,0.15), 0 20px 60px rgba(0,0,0,0.6);
      text-align: center;
    }
    .mulligan-title {
      font-size: 24px; font-weight: 700; color: var(--gold, #d4af37);
      margin-bottom: 6px; text-shadow: 0 0 20px rgba(212,175,55,0.4);
    }
    .mulligan-subtitle { font-size: 14px; color: #cfe0d4; margin-bottom: 22px; }
    .mulligan-hand-row {
      display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-bottom: 26px;
    }
    .mulligan-mini-card {
      width: 100px; border: 1.5px solid rgba(212,175,55,0.4); border-radius: 8px;
      background: #1a2419; padding: 6px; cursor: default;
      transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .mulligan-mini-card.selectable { cursor: pointer; }
    .mulligan-mini-card.selectable:hover { transform: translateY(-4px); border-color: var(--gold, #d4af37); }
    .mulligan-mini-card.chosen {
      border-color: #e74c3c; box-shadow: 0 0 14px rgba(231,76,60,0.5);
      transform: translateY(-6px);
    }
    .mulligan-mini-art {
      width: 100%; height: 70px; border-radius: 4px; margin-bottom: 6px;
      background-size: cover; background-position: center; background-color: #0e150c;
      display: flex; align-items: center; justify-content: center; font-size: 26px;
    }
    .mulligan-mini-name { font-size: 10px; font-weight: 700; color: #f0e8d0; line-height: 1.2; margin-bottom: 2px; }
    .mulligan-mini-type { font-size: 9px; color: #9db3a3; }
    .mulligan-buttons { display: flex; justify-content: center; gap: 14px; }
    .mulligan-btn {
      padding: 10px 22px; border-radius: 8px; border: none; cursor: pointer;
      font-weight: bold; font-size: 14px;
    }
    .mulligan-btn-keep { background: #e67e22; color: #fff; }
    .mulligan-btn-keep:hover { background: #f39c12; }
    .mulligan-btn-mull { background: #2c2c2c; color: #eee; border: 1px solid #555; }
    .mulligan-btn-mull:hover { background: #3a3a3a; }
    .mulligan-btn-confirm:disabled { background: #555; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}

function renderMulliganMiniCard(card, extraClass) {
  const icon = card.type.includes('Tierra') ? '⛰️' : (card.power !== undefined ? '⚔️' : '✨');
  return `
    <div class="mulligan-mini-card ${extraClass || ''}" data-card-id="${card.id}">
      <div class="mulligan-mini-art" style="${card.image ? `background-image:url('./assets/images/cards/${card.image}')` : ''}">${card.image ? '' : icon}</div>
      <div class="mulligan-mini-name">${card.name}</div>
      <div class="mulligan-mini-type">${card.manaCost || 'Tierra'}</div>
    </div>
  `;
}

// Paso 1: mostrar la mano y elegir Mulligan o Quedarse.
export function showMulliganModal(hand, mulliganCount, callbacks) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const cardsHTML = hand.map(c => renderMulliganMiniCard(c)).join('');
  const keepLabel = mulliganCount > 0
    ? `Quedarme (dejo ${mulliganCount} carta${mulliganCount > 1 ? 's' : ''} al fondo)`
    : 'Quedarme con esta mano';

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">${mulliganCount === 0 ? 'Tu mano inicial' : `Mano nueva (mulligan #${mulliganCount})`}</div>
      <div class="mulligan-subtitle">¿Te la quedás, o volvés a barajar y robás 7 de nuevo?</div>
      <div class="mulligan-hand-row">${cardsHTML}</div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-mull" id="btn-do-mulligan">🔄 Mulligan</button>
        <button class="mulligan-btn mulligan-btn-keep" id="btn-keep-hand">${keepLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-do-mulligan').addEventListener('click', () => {
    overlay.remove();
    callbacks.onMulligan();
  });
  overlay.querySelector('#btn-keep-hand').addEventListener('click', () => {
    overlay.remove();
    callbacks.onKeep();
  });
}

// Paso 2 (solo si mulliganeaste al menos una vez): elegir qué cartas van al fondo del mazo.
export function showBottomCardsModal(hand, countToBottom, onConfirm) {
  injectMulliganStyles();
  const overlay = document.createElement('div');
  overlay.id = 'mulligan-overlay';

  const chosen = new Set();
  const cardsHTML = hand.map(c => renderMulliganMiniCard(c, 'selectable')).join('');

  overlay.innerHTML = `
    <div class="mulligan-panel">
      <div class="mulligan-title">Elegí ${countToBottom} carta${countToBottom > 1 ? 's' : ''} para el fondo del mazo</div>
      <div class="mulligan-subtitle" id="mulligan-count-hint">Seleccionadas: 0 / ${countToBottom}</div>
      <div class="mulligan-hand-row">${cardsHTML}</div>
      <div class="mulligan-buttons">
        <button class="mulligan-btn mulligan-btn-keep mulligan-btn-confirm" id="btn-confirm-bottom" disabled>Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const hint = overlay.querySelector('#mulligan-count-hint');
  const confirmBtn = overlay.querySelector('#btn-confirm-bottom');

  overlay.querySelectorAll('.mulligan-mini-card').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const card = hand[idx];
      if (chosen.has(card)) {
        chosen.delete(card);
        el.classList.remove('chosen');
      } else if (chosen.size < countToBottom) {
        chosen.add(card);
        el.classList.add('chosen');
      }
      hint.textContent = `Seleccionadas: ${chosen.size} / ${countToBottom}`;
      confirmBtn.disabled = chosen.size !== countToBottom;
    });
  });

  confirmBtn.addEventListener('click', () => {
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
    let key = (zoneType === 'land' && item.card.produces) ? `land_${item.card.produces}` : item.card.name;
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

  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null) {
    els.paymentControls.classList.remove('hidden'); els.btnEndTurn.classList.add('hidden'); 
    els.localHand.classList.add('paying-mode'); els.localLands.classList.add('paying-mode');
    if (state.pendingSpellIndex !== null) {
      const pendingCardEl = els.localHand.children[state.pendingSpellIndex];
      if (pendingCardEl) pendingCardEl.classList.add('paying');
    }
    
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
