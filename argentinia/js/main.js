import { addToStack, spellStack } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { executeLocalAttack, executeRivalAttack, resolveCombatDamage, checkDeaths } from './combatRules.js';
import { checkRivalCounterOrResponse } from './bot.js';
import { setupBoardLayout, render, logMsg, els, showGameOverOverlay, getTargetRules, showDeckSelectionModal, showMulliganModal, showBottomCardsModal } from './ui.js';
import { buildRandomDeck, parseManaCost, getLandColor, sleep, shuffle } from './utils.js';
import { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority } from './turnManager.js';
import { hasKeyword, canBlock } from './keywords.js';

export { logMsg, render } from './ui.js';
export { parseManaCost, getLandColor, sleep } from './utils.js';
export { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority } from './turnManager.js';

export const state = {
  turnCount: 1,
  isPlayerTurn: true,
  activePlayer: 'local',    // 'local' o 'rival'
  priorityPlayer: 'local',  // 'local' o 'rival'
  consecutivePasses: 0,
  
  // Fases: 'untap', 'upkeep', 'draw', 'main1', 
  // 'combat_begin', 'combat_attackers', 'combat_blockers', 'combat_damage', 'combat_end',
  // 'main2', 'end_step', 'cleanup'
  phase: 'main1', 
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
  pendingAbilitySource: null,
  
  pendingBlockerIndex: null,
  
  localSupport: [],
  rivalSupport: [],
  pendingTargetSource: null, 

  // Efectos genéricos de una sola aplicación, sin fechas ni contadores de turno.
  // Cada entrada se borra sola la primera vez que el motor llega al punto donde
  // corresponde aplicarla (ver turnManager.js). Ej: { id, effectType: 'prevent_attack',
  // targetPlayer: 'local'|'rival', sourceName }.
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

  isDiscarding: false,
  cardsToDiscard: 0,

  damageModalOpen: false,

  // Contadores por turno para condiciones de gatillos (ej. Hinchada Fervorosa:
  // "si atacaste con 2 o más criaturas este turno"). Se resetean en el Enderezar de cada uno.
  localAttackersDeclaredThisTurn: 0,
  rivalAttackersDeclaredThisTurn: 0
};

async function initGame(humanIdentity) {
  logMsg("Cargando el mazo...");

  setupBoardLayout();

  // El mazo del jugador humano respeta la identidad de color que eligió en el modal
  // inicial; el del Tano siempre es al azar (ver buildRandomDeck en utils.js).
  state.localDeck = buildRandomDeck(humanIdentity);
  state.rivalDeck = buildRandomDeck();

  for (let i = 0; i < 7; i++) {
    state.localHand.push(state.localDeck.pop());
    state.rivalHand.push(state.rivalDeck.pop());
  }

  // El Tano resuelve su propio mulligan solo, sin UI (ver resolveBotMulligan).
  resolveBotMulligan();

  // El jugador humano decide el suyo de forma interactiva. La partida arranca de
  // verdad recién cuando termina de resolver su mano (finishSetup).
  const finishSetup = () => {
    els.btnRestart.addEventListener('click', () => location.reload());
    els.rivalHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(false));
    els.localHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(true));

    render();
    logMsg(`¡Arranca la partida! Elegiste ${humanIdentity.join('/')}.`);
    logMsg("¡Tu turno! Bajá una tierra para empezar.");
  };

  startLocalMulliganFlow(finishSetup);
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
  let mulliganCount = 0;

  const askPlayer = () => {
    showMulliganModal(state.localHand, mulliganCount, {
      onMulligan: () => {
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
        showBottomCardsModal(state.localHand, mulliganCount, (chosenCards) => {
          chosenCards.forEach(c => {
            const idx = state.localHand.indexOf(c);
            if (idx !== -1) {
              state.localHand.splice(idx, 1);
              state.localDeck.unshift(c);
            }
          });
          logMsg(`Dejaste ${mulliganCount} carta(s) al fondo del mazo. Mano final: ${state.localHand.length} cartas.`);
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
async function boot() {
  await cardDb.loadAll();
  showDeckSelectionModal((chosenIdentity) => {
    initGame(chosenIdentity);
  });
}

export function getEffectivePower(itemObj) {
  const card = itemObj.card || itemObj;
  let p = card.power || 0;
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
  return [...new Set([...base, ...fromAuras, ...fromEquipment, ...fromStatic, ...fromTemp])];
}

// --- SACRIFICAR COMO COSTO ---
// Saca un permanente propio del campo de batalla y lo manda al cementerio, como parte de
// pagar el costo de una habilidad (no como resultado de daño ni de un "destroy"). Por eso
// NO chequea Indestructible: en MTG real, Indestructible no protege contra un sacrificio.
// Busca en las 3 zonas posibles (criaturas, soporte, tierras) porque lo que se sacrifica
// puede ser cualquiera de los tres.
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
    if (isCreatureZone) detachEquipmentFrom(item, isLocal);
    grave.push(item.card);
    logMsg(`🔪 ¡Sacrificaste a ${item.card.name}!`);
    if (isCreatureZone) {
      triggerCreatureDies(item, isLocal);
      triggerAnyCreatureDeath(item, isLocal);
    }
    return true;
  }
  logMsg(`⚠️ No se pudo sacrificar a ${item.card.name}: ya no está en el campo.`);
  return false;
}

// --- ENCANTAMIENTOS ESTÁTICOS GLOBALES ---
// Busca, en la zona de soporte del dueño (y del rival, para efectos "scope: opponent"),
// permanentes con `card.staticEffect` y devuelve los que aplican a esta criatura.
// No usan la pila: mientras el Encantamiento esté en el campo, el efecto está activo.
function getStaticTeamModifiers(itemObj) {
  const isLocal = state.localCombat.includes(itemObj);
  const ownSupport = isLocal ? state.localSupport : state.rivalSupport;
  const oppSupport = isLocal ? state.rivalSupport : state.localSupport;
  const mods = [];
  ownSupport.forEach(s => {
    const eff = s.card.staticEffect;
    if (eff && (eff.scope || 'own') === 'own') mods.push(eff);
  });
  oppSupport.forEach(s => {
    const eff = s.card.staticEffect;
    if (eff && eff.scope === 'opponent') mods.push(eff);
  });
  return mods;
}

// Habilidad Disparada: "Siempre que una criatura entre al campo bajo tu control..." (ej. Cumbia
// Santafesina). Se llama a mano desde stackManager cada vez que una criatura (propia, ficha o
// reanimada) se empuja al campo de batalla. Misma simplificación que el resto: resuelve directo,
// sin pasar por la pila.
export function triggerCreatureEtb(isLocal) {
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  supportZone.forEach(item => {
    if (item.card.creatureEtbTrigger) {
      resolveEffectDirect(item.card.creatureEtbTrigger, item.card.name, isLocal);
    }
  });
}

// Habilidad Disparada: "Cuando esta criatura muera..." (la de la criatura misma, no importa
// cómo haya muerto — combate, un removal, o el día de mañana un sacrificio). Es la contraparte
// de triggerCreatureEtb, pero para la salida en vez de la entrada.
export function triggerCreatureDies(unit, isLocal) {
  const trig = unit.card.diesTrigger;
  if (!trig) return;
  resolveEffectDirect(trig, unit.card.name, isLocal);
}

// Habilidad Disparada estilo "Blood Artist": se dispara con la muerte de CUALQUIER criatura
// del campo (propia o rival, incluida ella misma), a diferencia de diesTrigger (solo la propia)
// y opponentDeathTrigger (solo las del rival). El "watcher" no tiene por qué seguir vivo:
// si murió en la misma movida que está mirando, igual se dispara una última vez.
export function triggerAnyCreatureDeath(deadUnit, deadUnitIsLocal) {
  const watchers = [
    ...state.localCombat.filter(u => u !== deadUnit).map(u => ({ unit: u, isLocal: true })),
    ...state.rivalCombat.filter(u => u !== deadUnit).map(u => ({ unit: u, isLocal: false })),
    { unit: deadUnit, isLocal: deadUnitIsLocal }
  ];
  watchers.forEach(({ unit, isLocal }) => {
    const trig = unit.card.anyCreatureDiesTrigger;
    if (!trig) return;
    if (trig.type === 'drain') {
      if (isLocal) { state.rivalHP -= trig.amount; state.localHP += trig.amount; }
      else { state.localHP -= trig.amount; state.rivalHP += trig.amount; }
      logMsg(`🩸 ¡${unit.card.name}! Drena ${trig.amount} de vida por la muerte de ${deadUnit.card.name}.`);
    } else {
      resolveEffectDirect(trig, unit.card.name, isLocal);
    }
  });
}

// --- EQUIPAMIENTO REAL (Equip) ---
// Devuelve los items de la zona de soporte (Equipos) adjuntos a esta criatura.
export function getEquipmentOn(itemObj) {
  const isLocal = state.localCombat.includes(itemObj);
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  return supportZone.filter(s => s.attachedTo === itemObj);
}

// Cuando una criatura sale del campo de batalla por cualquier vía (muerte, rebote,
// destrucción, arrasada), el Equipo que tuviera puesto se cae y se queda en tu campo:
// nunca va al cementerio con la criatura.
export function detachEquipmentFrom(creatureItem, isLocal) {
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  supportZone.forEach(s => {
    if (s.attachedTo === creatureItem) {
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
  const grave = isLocal ? state.localGraveyard : state.rivalGraveyard;
  unit.auras.forEach(auraCard => {
    logMsg(`💔 ${auraCard.name} se desprendió de ${unit.card.name} y fue al cementerio.`);
    grave.push(auraCard);
  });
  unit.auras = [];
}

export function attachAura(auraCard, creatureItem) {
  if (!creatureItem.auras) creatureItem.auras = [];
  creatureItem.auras.push(auraCard);
  logMsg(`✨ ¡${auraCard.name} se pegó a ${creatureItem.card.name}!`);
}

export function handleCombatClick(item, isLocal, index) {
  if (state.damageModalOpen) return;

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
    
    const rules = getTargetRules(state.pendingTargetCard);
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;

    if (!allowed) {
      logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
      return;
    }
    executeSpellOnTarget({ type: 'creature', isLocal, index, item });
    return;
  }

 // Declarar atacantes solo en sub-paso de atacantes
  if (state.phase === 'combat_attackers' && isLocal && state.activePlayer === 'local' && state.priorityPlayer === 'local') {
    if (hasKeyword(item, 'defender')) {
      logMsg(`🛡️ ${item.card.name} es Defensor y no puede atacar.`);
      return;
    }
    if (item.summoningSickness) {
      logMsg(`Tu ${item.card.name} está mareado y no puede atacar este turno.`);
      return;
    }
    if (item.tapped) return; 
    
    item.isAttacking = !item.isAttacking;
    render();
  }
  else if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local') {
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
  // Fuera de combate: clic en tu propia criatura para usar la habilidad que le da un Equipo
  // (ej. Facón de Plata otorga "{T}: hace 2 de daño" a quien lo tenga puesto).
  else if (state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2') && isLocal && state.priorityPlayer === 'local') {
    tryActivateGrantedAbility(item, isLocal, index);
  }
}

function tryActivateGrantedAbility(creatureItem, isLocal, creatureIndex) {
  // Prioridad: si la criatura tiene su PROPIA habilidad activada (ej. Alberto Samid,
  // "{1}{G}: Pelea contra la criatura objetivo"), usamos esa. Si no, buscamos si algún
  // Equipo puesto le está prestando una (ej. Facón de Plata).
  const ownAbility = creatureItem.card.activatedAbility;
  const equippedWithAbility = !ownAbility ? getEquipmentOn(creatureItem).find(eq => eq.card.grantedAbility) : null;
  if (!ownAbility && !equippedWithAbility) return false;

  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null) {
    logMsg("Terminá de pagar lo anterior antes de activar otra cosa.");
    return true;
  }

  const ability = ownAbility || equippedWithAbility.card.grantedAbility;
  const sourceCardName = ownAbility ? creatureItem.card.name : equippedWithAbility.card.name;
  const costStr = ability.cost || "";
  const requiresTap = costStr.includes('{T}');

  if (requiresTap && creatureItem.tapped) {
    logMsg(`${creatureItem.card.name} ya está girada.`);
    return true;
  }
  if (requiresTap && creatureItem.summoningSickness) {
    logMsg(`${creatureItem.card.name} tiene mareo de invocación: todavía no puede usar la habilidad de ${sourceCardName}.`);
    return true;
  }

  const manaCostStr = costStr.replace('{T}', '').trim();
  const manaCost = parseManaCost(manaCostStr || "");

  if (ownAbility) {
    // La criatura activa su propia habilidad: ella misma es "item" y "tapTarget".
    state.pendingAbilitySource = {
      item: creatureItem,
      tapTarget: creatureItem,
      index: creatureIndex,
      isLocal,
      requiresTap,
      abilityKind: 'own'
    };
  } else {
    const supportZone = isLocal ? state.localSupport : state.rivalSupport;
    const equipIndex = supportZone.indexOf(equippedWithAbility);
    state.pendingAbilitySource = {
      item: equippedWithAbility,
      tapTarget: creatureItem,
      index: equipIndex,
      isLocal,
      requiresTap,
      abilityKind: 'granted'
    };
  }

  state.pendingCost = manaCost;
  state.tappedLandsThisSpell = [];

  const totalMana = manaCost.W + manaCost.U + manaCost.B + manaCost.R + manaCost.G + manaCost.generic;
  if (totalMana === 0) {
    checkPaymentComplete();
  } else {
    logMsg(`Activando la habilidad de ${sourceCardName} en ${creatureItem.card.name}. Elegí tierras para pagar.`);
    render();
  }
  return true;
}

export function handleSupportTargetClick(item, isLocal, index) {
  if (state.damageModalOpen) return;
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
    executeSpellOnTarget({ type: 'player', isLocal });
  }
}

export function cancelPayment() {
  if (state.pendingSpellIndex === null && state.pendingAbilitySource === null && state.pendingSacrificeChoice === null) return;
  state.tappedLandsThisSpell.forEach(land => land.tapped = false);
  state.pendingSpellIndex = null; 
  state.pendingAbilitySource = null; // <- Agregado
  state.pendingSacrificeChoice = null;
  state.pendingCost = null; 
  state.tappedLandsThisSpell = []; 
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  logMsg("Cancelaste la acción. Las tierras se enderezaron.");
  render();
}

export function canPlayCard(card) {
  if (state.gameOver || state.pendingSpellIndex !== null || state.pendingAbilitySource !== null || state.damageModalOpen) return false;
  if (state.priorityPlayer !== 'local') return false; // Solo si poseés prioridad
  
  const isInstant = card.type.includes('Instantáneo');

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
    state.localLands.push({ card, tapped: entersTapped }); state.localHand.splice(index, 1); state.localLandPlayedThisTurn = true;
    logMsg(entersTapped ? `Bajaste la tierra: ${card.name} (entra girada).` : `Bajaste la tierra: ${card.name}.`);
    render(); return;
  }

  if (card.effect && card.effect.type && card.effect.type.startsWith('counter')) {
    if (!spellStack || spellStack.length === 0) {
      logMsg(`⚠️ No hay ningún hechizo en la pila para contrarrestar.`);
      return;
    }
  }

  state.pendingSpellIndex = index; 
  state.pendingCost = parseManaCost(card.manaCost); 
  state.tappedLandsThisSpell = [];
  logMsg(`Preparando: ${card.name}. Seleccioná tierras para pagar.`);
  checkPaymentComplete(); 
  render();
}

export function tapLocalLand(item) {
  if (state.gameOver || item.tapped) return;
  if (state.pendingSacrificeChoice) return; // Una tierra no es una opción válida de sacrificio hoy

  // Tierras de utilidad (sin `produces`, con activatedAbility propia — ej. Biblioteca
  // Nacional) se activan como cualquier permanente con habilidad, no como fuente de maná.
  if (item.card.activatedAbility && !item.card.produces && !item.card.producesOptions) {
    const index = state.localLands.indexOf(item);
    handleSupportClick(item, true, index);
    return;
  }

  if (state.pendingSpellIndex === null && state.pendingAbilitySource === null) { 
    logMsg("Seleccioná primero un hechizo o habilidad para pagar."); 
    return; 
  }
  
  // Soporte para tierras que producen más de 1 maná (ej. Las Malvinas: {T}: Agrega {U}{U}).
  // El excedente de un color se puede usar para pagar costo genérico, como en MTG real.
  const amount = item.card.manaAmount || 1;
  let remaining = amount;
  let used = false;

  if (item.card.producesOptions) {
    // Tierra dual: elegimos automáticamente el color que más te sirve pagar ahora mismo.
    const bestColor = item.card.producesOptions.find(c => (state.pendingCost[c] || 0) > 0) || item.card.producesOptions[0];
    const takeFromColor = Math.min(remaining, state.pendingCost[bestColor] || 0);
    if (takeFromColor > 0) {
      state.pendingCost[bestColor] -= takeFromColor;
      remaining -= takeFromColor;
      used = true;
    }
  } else {
    const landColor = getLandColor(item.card);
    if (['W', 'U', 'B', 'R', 'G'].includes(landColor)) {
      const takeFromColor = Math.min(remaining, state.pendingCost[landColor] || 0);
      if (takeFromColor > 0) {
        state.pendingCost[landColor] -= takeFromColor;
        remaining -= takeFromColor;
        used = true;
      }
    }
  }

  if (remaining > 0 && state.pendingCost.generic > 0) {
    const takeGeneric = Math.min(remaining, state.pendingCost.generic);
    state.pendingCost.generic -= takeGeneric;
    remaining -= takeGeneric;
    used = true;
  }

  if (used) { item.tapped = true; state.tappedLandsThisSpell.push(item); checkPaymentComplete(); } 
  else { logMsg(`Esa yerba no te sirve para este hechizo.`); }
  render();
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

    // CASO A: ESTAMOS PAGANDO UNA CARTA DE LA MANO
    if (state.pendingSpellIndex !== null) {
      const card = state.localHand[state.pendingSpellIndex];
      const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);
 
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
      else if (isPermanent) stackType = 'permanent';
      else if (card.type.includes('Instantáneo')) stackType = 'instant';
 
      addToStack({
        card: card,
        isLocal: true,
        targetObj: null,
        type: stackType
      });
 
      logMsg(`⏳ ${card.name} entró a la pila.`);
 
      // --- LIMPIEZA DE ESTADO QUE FALTABA (espejo del CASO B) ---
      state.consecutivePasses = 0;
      state.pendingSpellIndex = null;
      state.pendingCost = null;
      state.tappedLandsThisSpell = [];
      render();
 
      checkRivalCounterOrResponse();
    } 
    
    // CASO B: ESTAMOS PAGANDO UNA HABILIDAD DE LA MESA (propia, o de un Equipo otorgada a una criatura)
    else if (state.pendingAbilitySource !== null) {
      const source = state.pendingAbilitySource;
      const card = source.item.card;
      const isGranted = source.abilityKind === 'granted';
      const ability = isGranted ? card.grantedAbility : card.activatedAbility;
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

// Segunda mitad de la activación de una habilidad (elegir objetivo si hace falta, o ir
// directo a la pila). Separado de checkPaymentComplete para poder retomarlo después de
// resolver una elección de sacrificio, que pausa el flujo a mitad de camino.
function finalizeAbilityActivation(source, ability, card) {
  const isGranted = source.abilityKind === 'granted';

  if (ability.requiresTarget) {
    logMsg(`Elegí un objetivo para la habilidad de ${card.name}.`);
    state.pendingTargetCard = card;
    state.pendingTargetSource = source;
    render();
    return;
  }

  addToStack({
    card: card,
    isLocal: source.isLocal,
    targetObj: null,
    type: 'ability',
    source: { type: isGranted ? 'equipped_activation' : 'support_activation', index: source.index },
    sourceItem: source.item
  });

  logMsg(`Activaste la habilidad de ${card.name}.`);
  state.consecutivePasses = 0;
  state.pendingAbilitySource = null;
  state.pendingCost = null;
  state.tappedLandsThisSpell = [];
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

  const isCreatureItem = item.card.power !== undefined || item.isVehicle;
  const matchesType = pending.eligibleType === 'creature' ? isCreatureItem : !isCreatureItem;
  if (!matchesType) {
    logMsg(`Ese no es un ${pending.eligibleType === 'creature' ? 'criatura' : 'artefacto'} válido para sacrificar acá.`);
    return true;
  }

  performSacrifice(item, isLocal);
  const { source, ability, card } = pending;
  state.pendingSacrificeChoice = null;
  finalizeAbilityActivation(source, ability, card);
  return true;
}

function executeSpellOnTarget(targetObj) {
  if (!state.pendingTargetCard) return;

  let card;
  let isPermanentSource = state.pendingTargetSource !== null;

  if (isPermanentSource) {
    const src = state.pendingTargetSource;
    card = src.item.card;
    const isGranted = src.abilityKind === 'granted';
    addToStack({
      card: card,
      isLocal: true,
      targetObj: targetObj,
      type: 'ability',
      // Agregamos el type correcto para que el stackManager lo reconozca
      source: { type: isGranted ? 'equipped_activation' : 'support_activation', index: src.index },
      sourceItem: src.item
    });
  }
  else {
    card = state.localHand.splice(state.pendingSpellIndex, 1)[0];

    let stackType = 'spell';
    const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);
    
    if (card.power !== undefined) stackType = 'summon';
    else if (isPermanent) stackType = 'permanent';
    else if (card.adjunta) stackType = 'aura';
    else if (card.type.includes('Instantáneo')) stackType = 'instant';

    addToStack({
      card: card,
      isLocal: true,
      targetObj: targetObj,
      type: stackType
    });

    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.tappedLandsThisSpell = [];
  }

  state.consecutivePasses = 0;
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  state.pendingAbilitySource = null;
  render();

  checkRivalCounterOrResponse();
}

export function handleSupportClick(item, isLocal, index) {
  if (state.gameOver || !isLocal) return;

  if (state.pendingSacrificeChoice) {
    tryResolveSacrificeChoice(item, isLocal);
    return;
  }

  if (state.phase !== 'main1' && state.phase !== 'main2') return;
  if (state.pendingSpellIndex !== null || state.pendingAbilitySource !== null) {
    logMsg("Terminá de pagar lo anterior antes de activar otra cosa.");
    return;
  }

  const card = item.card;
  if (!card.activatedAbility) return;

  const costStr = card.activatedAbility.cost || "";
  const requiresTap = costStr.includes('{T}');
  
  if (requiresTap && item.tapped) {
    logMsg(`⏳ ${card.name} ya está girado.`);
    return;
  }

  // Extraemos el costo de maná removiendo el símbolo de tapeo
  const manaCostStr = costStr.replace('{T}', '').trim();
  const manaCost = parseManaCost(manaCostStr || "");

  state.pendingAbilitySource = { item, index, isLocal, requiresTap, tapTarget: item, abilityKind: 'own' };
  state.pendingCost = manaCost;
  state.tappedLandsThisSpell = [];

  // El objetivo se pide recién cuando el costo esté pagado (ver checkPaymentComplete, CASO B).
  // No seteamos pendingTargetCard acá todavía.

  const totalMana = manaCost.W + manaCost.U + manaCost.B + manaCost.R + manaCost.G + manaCost.generic;
  
  if (totalMana === 0) {
    checkPaymentComplete(); // Si solo cuesta {T} o {0}, lo procesamos directo
  } else {
    logMsg(`Activando ${card.name}. Elegí tierras para pagar el costo.`);
    render();
  }
}

export function resolveEffectDirect(effect, cardName, isLocal) {
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
  } else if (effect.type === 'fog') {
    state.combatDamagePrevented = true;
    logMsg(`🌫️ ¡${cardName}! Se previene todo el daño de combate este turno.`);
  } else if (effect.type === 'draw_and_lose_life') {
    if (isLocal && state.localDeck.length > 0) state.localHand.push(state.localDeck.pop());
    if (!isLocal && state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
    if (isLocal) state.localHP -= effect.lifeLoss; else state.rivalHP -= effect.lifeLoss;
    logMsg(`📖 ¡${cardName}! ${targetName} robó una carta y perdió ${effect.lifeLoss} de vida.`);
  } else if (effect.type === 'drain') {
    // Genérico para cualquier disparador (diesTrigger, upkeepTrigger, etc.), no solo los
    // dos casos de muerte que ya tenían su propio código a mano.
    if (isLocal) { state.rivalHP -= effect.amount; state.localHP += effect.amount; }
    else { state.localHP -= effect.amount; state.rivalHP += effect.amount; }
    logMsg(`🩸 ¡${cardName}! Drena ${effect.amount} de vida.`);
  } else if (effect.type === 'discard') {
    // Discard sin target explícito (ej. un ETB): siempre le pega al oponente de quien
    // controla el disparador, igual que ya hacen damage/heal en esta misma función.
    const targetHand = isLocal ? state.rivalHand : state.localHand;
    const targetGrave = isLocal ? state.rivalGraveyard : state.localGraveyard;
    const discardedNames = [];
    for (let i = 0; i < effect.amount && targetHand.length > 0; i++) {
      const idx = Math.floor(Math.random() * targetHand.length);
      const discarded = targetHand.splice(idx, 1)[0];
      targetGrave.push(discarded);
      discardedNames.push(discarded.name);
    }
    const opponentName = isLocal ? "el Tano" : "vos";
    logMsg(discardedNames.length > 0
      ? `🗑️ ¡${cardName}! ${opponentName} descartó: ${discardedNames.join(', ')}.`
      : `🗑️ ¡${cardName}! ${opponentName} no tenía cartas para descartar.`);
  }
}

export function resolveSpellDirect(card, isLocal) { resolveEffectDirect(card.effect, card.name, isLocal); }

boot();
