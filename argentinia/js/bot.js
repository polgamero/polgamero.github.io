import { hasKeyword, canBlock, predictDuel } from './keywords.js';
import {
  state,
  logMsg,
  render,
  parseManaCost,
  getLandColor,
  sleep,
  getEffectivePower,
  getEffectiveToughness,
  passPriority // Importado del nuevo turnManager / main
} from './main.js';

import { assignBotBlockers } from './combatRules.js';
import { addToStack, spellStack } from './stackManager.js';

export function canRivalAfford(card) {
  if (!card.manaCost) return true;
  const cost = parseManaCost(card.manaCost);

  const fixed = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const duals = [];
  let totalMana = 0;

  state.rivalLands.forEach(landItem => {
    if (landItem.tapped) return;
    // Tierras de utilidad sin `produces` ni `producesOptions` (ej. Biblioteca Nacional) no
    // producen maná real — su {T} activa otra cosa. No cuentan para pagar hechizos.
    if (!landItem.card.produces && !landItem.card.producesOptions) return;
    const amount = landItem.card.manaAmount || 1;
    totalMana += amount;
    if (landItem.card.producesOptions) {
      duals.push({ options: landItem.card.producesOptions, amount });
    } else {
      const color = getLandColor(landItem.card);
      if (['W', 'U', 'B', 'R', 'G'].includes(color)) fixed[color] += amount;
    }
  });

  const colors = ['W', 'U', 'B', 'R', 'G'];
  const remainingNeed = {};
  colors.forEach(c => { remainingNeed[c] = Math.max(0, cost[c] - fixed[c]); });

  // Asignación golosa: las duales con menos opciones (más específicas) se reparten primero,
  // para no "gastar" una tierra flexible en un color que otra tierra menos flexible ya cubre.
  [...duals].sort((a, b) => a.options.length - b.options.length).forEach(d => {
    const need = colors.find(c => d.options.includes(c) && remainingNeed[c] > 0);
    if (need) {
      const take = Math.min(d.amount, remainingNeed[need]);
      remainingNeed[need] -= take;
    }
  });

  if (colors.some(c => remainingNeed[c] > 0)) return false;

  const remainingForGeneric = totalMana - (cost.W + cost.U + cost.B + cost.R + cost.G);
  return remainingForGeneric >= cost.generic;
}

export function tapRivalLandsFor(card) {
  if (!card.manaCost) return;
  const cost = parseManaCost(card.manaCost);
  const colors = ['W', 'U', 'B', 'R', 'G'];

  // 1) Primero cubrimos cada color con tierras fijas (de un solo color)
  colors.forEach(color => {
    let needed = cost[color];
    for (let i = 0; i < state.rivalLands.length && needed > 0; i++) {
      const land = state.rivalLands[i];
      if (!land.tapped && !land.card.producesOptions && getLandColor(land.card) === color) {
        land.tapped = true;
        needed -= (land.card.manaAmount || 1);
      }
    }
  });

  // 2) Lo que falte de cada color se cubre con tierras duales (las más específicas primero)
  const dualEntries = state.rivalLands.filter(l => !l.tapped && l.card.producesOptions)
    .sort((a, b) => a.card.producesOptions.length - b.card.producesOptions.length);

  colors.forEach(color => {
    let stillNeeded = cost[color] - state.rivalLands
      .filter(l => l.tapped && !l.card.producesOptions && getLandColor(l.card) === color)
      .reduce((sum, l) => sum + (l.card.manaAmount || 1), 0);

    for (const land of dualEntries) {
      if (stillNeeded <= 0) break;
      if (land.tapped) continue;
      if (land.card.producesOptions.includes(color)) {
        land.tapped = true;
        stillNeeded -= (land.card.manaAmount || 1);
      }
    }
  });

  // 3) Genérico: cualquier tierra que todavía no se giró (y que produzca maná de verdad)
  let genericNeeded = cost.generic;
  for (let i = 0; i < state.rivalLands.length && genericNeeded > 0; i++) {
    const land = state.rivalLands[i];
    if (!land.tapped && (land.card.produces || land.card.producesOptions)) {
      land.tapped = true;
      genericNeeded -= (land.card.manaAmount || 1);
    }
  }
}

function isCounterSpell(card) {
  return card.effect && card.effect.type && card.effect.type.startsWith('counter');
}

// NUEVO: El Tano usa un instantáneo de daño como truco de combate cuando VOS declarás
// atacantes — antes de esto, el Tano jamás consideraba instantáneos salvo que hubiera algo
// en la pila para responder, así que nunca defendía proactivamente con una quema.
function tryBotCombatTrick() {
  if (!(state.activePlayer === 'local' && state.phase === 'combat_attackers')) return false;

  const attackingUnits = state.localCombat.filter(c => c.isAttacking);
  if (attackingUnits.length === 0) return false;

  const cardIndex = state.rivalHand.findIndex(c =>
    c.type.includes('Instantáneo') && c.effect && c.effect.type === 'damage' && canRivalAfford(c)
  );
  if (cardIndex === -1) return false;

  const card = state.rivalHand[cardIndex];
  const target = attackingUnits.find(c => !hasKeyword(c, 'hexproof') && getEffectiveToughness(c) <= card.effect.amount);
  if (!target) return false;

  state.rivalHand.splice(cardIndex, 1);
  tapRivalLandsFor(card);

  addToStack({
    card,
    isLocal: false,
    targetObj: { type: 'creature', isLocal: true, index: state.localCombat.indexOf(target), item: target },
    type: 'instant'
  });

  state.priorityPlayer = 'local';
  state.consecutivePasses = 0;

  logMsg(`🔴 ¡El Tano respondió a tus atacantes con "${card.name}"!`);
  render();
  return true;
}

export async function checkRivalCounterOrResponse() {
  if (spellStack.length === 0) return false;

  await sleep(600);

  const responseIndex = state.rivalHand.findIndex(c => {
    if (!c.type.includes('Instantáneo') || !canRivalAfford(c)) return false;

    if (isCounterSpell(c)) {
      if (c.effect.type === 'counter_creature') {
        return spellStack.some(s => s.isLocal && s.card?.type?.includes('Criatura'));
      }
      if (c.effect.type === 'counter_non_creature') {
        return spellStack.some(s => s.isLocal && !s.card?.type?.includes('Criatura'));
      }
      return spellStack.some(s => s.isLocal);
    }
    return true;
  });

  if (responseIndex !== -1) {
    const responseCard = state.rivalHand.splice(responseIndex, 1)[0];
    tapRivalLandsFor(responseCard);

    let targetObj = null;
    if (isCounterSpell(responseCard)) {
      const topLocalSpell = [...spellStack].reverse().find(s => s.isLocal);
      if (topLocalSpell) {
        targetObj = { type: 'stack', stackId: topLocalSpell.id };
      }
    } else if (responseCard.effect?.type === 'damage') {
      targetObj = { type: 'player', isLocal: true };
    }

    addToStack({
      card: responseCard,
      isLocal: false,
      targetObj: targetObj,
      type: 'instant'
    });

    // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;
    // -----------------------------------------------
    
    logMsg(`🔴 ¡El Tano te respondió en velocidad instantánea con "${responseCard.name}"!`);
    render();
    return true;
  }
  return false;
}

// --- EVALUACIÓN TÁCTICA DE ATAQUE ---
function shouldRivalAttackWith(attackerItem) {
  const atkPower = getEffectivePower(attackerItem);
  const atkHasMenace = hasKeyword(attackerItem, 'menace');
  const hasVigilance = hasKeyword(attackerItem, 'vigilance');

  const validBlockers = state.localCombat.filter(b => !b.tapped && canBlock(attackerItem, b));

  if (validBlockers.length === 0) return true;
  if (atkHasMenace && validBlockers.length < 2) return true;

  const dueledBlockers = validBlockers.map(b => ({ b, duel: predictDuel(attackerItem, b) }));

  const freeKillAvailable = dueledBlockers.some(({ duel }) => duel.attackerDies && !duel.blockerDies);
  if (freeKillAvailable) return false;

  const getsAGoodTrade = dueledBlockers.some(({ duel }) => duel.blockerDies);
  if (getsAGoodTrade) return true;

  return hasVigilance;
}

// NUEVO: Evaluación táctica para activar artefactos y soporte
export function tryActivateBotAbilities() {
  // Recorremos los artefactos en la mesa del Tano
  for (let i = 0; i < state.rivalSupport.length; i++) {
    const supportItem = state.rivalSupport[i];
    const card = supportItem.card;
    
    // Si no tiene habilidad activable o ya está girado y la requiere, pasamos
    if (!card.activatedAbility) continue;
    const ability = card.activatedAbility;
    const requiresTap = ability.cost.includes('{T}');
    if (requiresTap && supportItem.tapped) continue;

    // Extraemos el costo de maná para ver si el Tano lo puede pagar
    const manaCostString = ability.cost.replace('{T}', '').replace(',', '').trim();
    const dummyCardForCost = { manaCost: manaCostString || null };
    
    if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;

    let shouldActivate = false;
    let aiTargetObj = null;

    // 🧠 CEREBRO DEL TANO: ¿Cuándo y a quién activar?
    if (ability.effect.type === 'crew_vehicle') {
      // Tripular la Carreta Blindada solo en main1 para poder atacar con ella
      if (state.phase === 'main1') shouldActivate = true;
    } 
    else if (ability.effect.type === 'attach_equipment') {
      // Equipar el Facón en main1 a su criatura más fuerte que no esté girada
      if (state.phase === 'main1' && state.rivalCombat.length > 0) {
         const bestTargets = state.rivalCombat.filter(c => !c.tapped);
         if (bestTargets.length > 0) {
           const chosen = bestTargets.reduce((prev, current) => 
              (getEffectivePower(prev) > getEffectivePower(current)) ? prev : current
           );
           aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
           shouldActivate = true;
         }
      }
    }
    else if (ability.effect.type === 'heal' || ability.effect.type === 'draw') {
      // Tomar Mate o usar la Imprenta: priorizar en main2 si sobra maná, o si está perdiendo sangre
      if (state.phase === 'main2' || (ability.effect.type === 'heal' && state.rivalHP <= 12)) {
        aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
        shouldActivate = true;
      }
    }
    else if (ability.effect.type === 'damage') {
      // Boleadoras: Tratar de matar una criatura tuya molesta, o pegarte directo en main2
      if (state.localCombat.length > 0) {
        const vulnerable = state.localCombat.find(c => 
          !hasKeyword(c, 'hexproof') && getEffectiveToughness(c) <= ability.effect.amount
        );
        if (vulnerable) {
           aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable };
           shouldActivate = true;
        }
      }
      // Si no hay criaturas vulnerables y está cerrando el turno, te pega a la cara
      if (!shouldActivate && state.phase === 'main2') {
         aiTargetObj = { type: 'player', isLocal: true };
         shouldActivate = true;
      }
    }

    // ⚡ EJECUCIÓN
    if (shouldActivate) {
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) supportItem.tapped = true;

      addToStack({
        card: card,
        isLocal: false,
        targetObj: aiTargetObj,
        type: 'ability',
        source: { type: 'support_activation', index: i },
        sourceItem: supportItem
      });

      // Devolvemos la prioridad al jugador para que pueda responder
      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      
      logMsg(`⚙️ El Tano activó la habilidad de ${card.name}. Tenés prioridad para responder.`);
      render();
      return true; // Retornamos true para pausar su loop de toma de decisiones
    }
  }
  return false;
}

// NUEVO: El Tano usa las habilidades que un Equipo le presta a una criatura que ya tiene puesta
// (ej. Facón de Plata equipado: "{T}: hace 2 de daño"). Es la contraparte de tryActivateBotAbilities
// pero mirando las criaturas equipadas en vez de los permanentes de soporte.
export function tryActivateGrantedBotAbilities() {
  for (let i = 0; i < state.rivalCombat.length; i++) {
    const creatureItem = state.rivalCombat[i];

    // Prioridad: habilidad PROPIA de la criatura (ej. Alberto Samid, "Pelea contra...").
    // Si no tiene, buscamos si algún Equipo puesto se la está prestando.
    const ownAbility = creatureItem.card.activatedAbility;
    const supportZone = state.rivalSupport;
    const equippedItem = !ownAbility ? supportZone.find(s => s.attachedTo === creatureItem && s.card.grantedAbility) : null;
    if (!ownAbility && !equippedItem) continue;

    const ability = ownAbility || equippedItem.card.grantedAbility;
    const sourceCard = ownAbility ? creatureItem.card : equippedItem.card;
    const requiresTap = (ability.cost || "").includes('{T}');
    if (requiresTap && (creatureItem.tapped || creatureItem.summoningSickness)) continue;

    const manaCostString = (ability.cost || "").replace('{T}', '').replace(',', '').trim();
    const dummyCardForCost = { manaCost: manaCostString || null };
    if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;

    let shouldActivate = false;
    let aiTargetObj = null;

    if (ability.effect.type === 'damage') {
      // Mismo criterio que las Boleadoras: matar algo vulnerable, o pegar en main2
      const vulnerable = state.localCombat.find(c =>
        !hasKeyword(c, 'hexproof') && getEffectiveToughness(c) <= ability.effect.amount
      );
      if (vulnerable) {
        aiTargetObj = ability.requiresTarget ? { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable } : null;
        shouldActivate = true;
      } else if (state.phase === 'main2') {
        aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: true } : null;
        shouldActivate = true;
      }
    } else if (ability.effect.type === 'heal' || ability.effect.type === 'draw') {
      if (state.phase === 'main2') {
        aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
        shouldActivate = true;
      }
    } else if (ability.effect.type === 'fight') {
      // Pelea si le conviene: mata o daña bien a cambio de poco (o nada) de vuelta.
      const myPower = getEffectivePower(creatureItem);
      const target = state.localCombat.find(c =>
        !hasKeyword(c, 'hexproof') && getEffectiveToughness(c) <= myPower && getEffectivePower(c) < getEffectiveToughness(creatureItem)
      );
      if (target) {
        aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(target), item: target };
        shouldActivate = true;
      }
    }

    if (shouldActivate) {
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) creatureItem.tapped = true;

      const sourceIndex = ownAbility ? i : supportZone.indexOf(equippedItem);
      const sourceItem = ownAbility ? creatureItem : equippedItem;
      addToStack({
        card: sourceCard,
        isLocal: false,
        targetObj: aiTargetObj,
        type: 'ability',
        source: { type: ownAbility ? 'support_activation' : 'equipped_activation', index: sourceIndex },
        sourceItem: sourceItem
      });

      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;

      logMsg(`⚙️ El Tano usó la habilidad de ${sourceCard.name} con ${creatureItem.card.name}. Tenés prioridad para responder.`);
      render();
      return true;
    }
  }
  return false;
}

// NUEVO: SISTEMA DE PRIORIDAD DEL BOT (Remplaza startRivalTurn)
export async function takeBotPriorityAction() {
  if (state.gameOver || state.priorityPlayer !== 'rival') return;

  await sleep(600); // El Tano "piensa"

  // 1. Responder a la pila
  if (spellStack.length > 0) {
    const responded = await checkRivalCounterOrResponse();
    if (!responded) {
      logMsg(`👁️ El Tano revisó su mano, no tiene respuestas y pasa prioridad.`);
      passPriority('rival');
    }
    return; // Si respondió, addToStack ya manejará los pases de prioridad
  }

  // 1.5. Truco de combate: si vos declarás atacantes y la pila está vacía, el Tano puede
  // quemar a uno antes de que se asignen bloqueos.
  if (state.phase === 'combat_attackers' && state.activePlayer === 'local') {
    const trickUsed = tryBotCombatTrick();
    if (trickUsed) return;
  }

  // 2. Acciones de Fase Principal (Solo en el turno del Tano)
  if (state.activePlayer === 'rival' && (state.phase === 'main1' || state.phase === 'main2')) {
    
    // Intentar bajar tierra
    const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
    if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
      const landCard = state.rivalHand.splice(landIndex, 1)[0];
      const entersTapped = !!landCard.entersTapped;
      state.rivalLands.push({ card: landCard, tapped: entersTapped }); 
      state.rivalLandPlayedThisTurn = true;
      logMsg(entersTapped ? `El Tano bajó una tierra: ${landCard.name} (entra girada).` : `El Tano bajó una tierra: ${landCard.name}.`); 
      render(); 
      await sleep(800);
    }

    // --- NUEVO: Intentar activar habilidades de artefactos primero ---
    const abilityActivated = tryActivateBotAbilities();
    if (abilityActivated) return; // Si activó algo, la función corta y espera resolución

    // --- NUEVO: Intentar usar habilidades otorgadas por Equipos ya puestos ---
    const grantedActivated = tryActivateGrantedBotAbilities();
    if (grantedActivated) return;
    // -----------------------------------------------------------------
    
    const getAffordableMainPhaseCardIndex = () => {
      return state.rivalHand.findIndex(c => {
        if (c.type.includes('Tierra') || !canRivalAfford(c)) return false;
        if (isCounterSpell(c)) return false;
        // NUEVO: El Tano solo arrasa el campo si está en desventaja de poder
        if (c.effect && c.effect.type === 'destroy_all_creatures') {
          const localPower = state.localCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          const rivalPower = state.rivalCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          if (rivalPower >= localPower) return false;
        }
        return true;
      });
    };
    
    let affordableIndex = getAffordableMainPhaseCardIndex();  
    
    if (affordableIndex !== -1) {
      const cardToPlay = state.rivalHand.splice(affordableIndex, 1)[0];
      tapRivalLandsFor(cardToPlay);

      const isPermanent = cardToPlay.type.includes('Artefacto') || (cardToPlay.type.includes('Encantamiento') && !cardToPlay.adjunta);
      
      let stackType = 'spell';
      let aiTargetObj = null;
      let validPlay = true;

      if (cardToPlay.power !== undefined) {
        stackType = 'summon';
      } else if (isPermanent) {
        stackType = 'permanent';
        // --- LÓGICA HEXPROOF PARA EL BOT ---
        if (cardToPlay.requiresTarget && cardToPlay.etbEffect) {
          if (cardToPlay.etbEffect.type === 'damage') {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            const validLocalTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
            if (validLocalTargets.length > 0) {
              aiTargetObj = { type: 'creature', isLocal: true, index: 0, item: validLocalTargets[0] };
            } else {
              aiTargetObj = { type: 'player', isLocal: true };
            }
          }
        }
      } else if (cardToPlay.adjunta) {
        stackType = 'aura';
        // Maldiciones (alcance: criatura_rival) van a tu criatura más peligrosa;
        // las Auras normales (buff propio) van a la mejor criatura del Tano.
        if (cardToPlay.alcance === 'criatura_rival') {
          const validTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
          if (validTargets.length > 0) {
            const chosen = validTargets.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        } else if (state.rivalCombat.length > 0) {
          aiTargetObj = { type: 'creature', isLocal: false, item: state.rivalCombat[0] };
        } else {
          validPlay = false;
          logMsg(`El Tano no tenía criaturas para encantar con ${cardToPlay.name} y lo descartó.`);
          state.rivalGraveyard.push(cardToPlay);
        }
      } else {
        stackType = cardToPlay.type.includes('Instantáneo') ? 'instant' : 'spell';
        if (cardToPlay.effect && cardToPlay.effect.type === 'damage') {
          aiTargetObj = { type: 'player', isLocal: true };
        } else if (cardToPlay.effect && cardToPlay.effect.type === 'heal') {
          aiTargetObj = { type: 'player', isLocal: false };
        }
        // LÓGICA NUEVA: REMOCIÓN DE CRIATURA (Yuyo del Loco, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'destroy_creature') {
          const validTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura más grande (poder + resistencia)
            const chosen = validTargets.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        // LÓGICA NUEVA: REBOTE (Vuelto en Mano, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'bounce') {
          const validTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura con más poder (la más amenazante en combate)
            const chosen = validTargets.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        // LÓGICA NUEVA: DESCARTE (Corralito, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'discard') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: PREVENIR ATAQUE (Cuarentena Total)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'prevent_attack') {
          // El Tano te lo tira a vos para frenar tu próximo ataque
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: TRUCO DE COMBATE (Fuerza de Toro, etc.) — a su mejor criatura
        else if (cardToPlay.effect && cardToPlay.effect.type === 'pump') {
          if (state.rivalCombat.length > 0) {
            const chosen = state.rivalCombat.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía criaturas para reforzar con ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        // LÓGICA NUEVA: PROTECCIÓN TEMPORAL (A Cubierto, etc.) — protege a su criatura más grande
        else if (cardToPlay.effect && cardToPlay.effect.type === 'grant_keyword_temp') {
          if (state.rivalCombat.length > 0) {
            const chosen = state.rivalCombat.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía criaturas para proteger con ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        // LÓGICA NUEVA: DESTRUIR PERMANENTE (Piedrazo a la Vidriera / Yuyerío Salvaje)
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_artifact' || cardToPlay.effect.type === 'destroy_enchantment')) {
          const filterType = cardToPlay.effect.type === 'destroy_artifact' ? 'Artefacto' : 'Encantamiento';
          const validTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
          if (validTargets.length > 0) {
            aiTargetObj = { type: 'permanent', isLocal: true, item: validTargets[0] };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
      }

      if (validPlay) {
        addToStack({
          card: cardToPlay,
          isLocal: false,
          targetObj: aiTargetObj,
          type: stackType
        });

        // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
        state.priorityPlayer = 'local';
        state.consecutivePasses = 0;
        // -----------------------------------------------
        
        logMsg(`⏳ El Tano puso ${cardToPlay.name} en la pila. Tenés la prioridad para responder.`);
        render();
        return; // Retorna para esperar resolución. El ciclo de prioridad continuará después.
      }
    }
  }

  // 3. Fase de Declaración de Atacantes (Turno del Tano)
  if (state.activePlayer === 'rival' && state.phase === 'combat_attackers') {
    let attackCount = 0;
    let heldBackCount = 0;
    state.rivalCombat.forEach(unit => {
      if (hasKeyword(unit, 'defender')) return;

      if (!unit.tapped && !unit.summoningSickness) {
        if (shouldRivalAttackWith(unit)) {
          unit.isAttacking = true;
          if (!hasKeyword(unit, 'vigilance')) {
            unit.tapped = true;
          }
          attackCount++;
        } else {
          heldBackCount++;
        }
      }
    });

    if (heldBackCount > 0) logMsg(`🧠 El Tano decide guardar ${heldBackCount} criatura(s) atrás para defender.`);
    if (attackCount > 0) logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s)!`);
    else logMsg("El Tano no atacó con nada.");
    state.rivalAttackersDeclaredThisTurn = attackCount;
    
    render();
    passPriority('rival'); // Termina de declarar atacantes
    return;
  }

  // 4. Fase de Declaración de Bloqueadores (Tu Turno)
  if (state.activePlayer === 'local' && state.phase === 'combat_blockers') {
    assignBotBlockers(); // Llama a la lógica inteligente de combate
    render();
    passPriority('rival');
    return;
  }

  // 5. Si no hizo nada de lo anterior, pasa prioridad
  passPriority('rival');
}
