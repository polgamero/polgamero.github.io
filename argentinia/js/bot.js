import { hasKeyword, canBlock, predictDuel, getProtectionMatch } from './keywords.js';
import {
  state,
  logMsg,
  render,
  parseManaCost,
  getLandColor,
  sleep,
  getEffectivePower,
  getEffectiveToughness,
  performSacrifice,
  resolveEffectDirect,
  getKeywordsGrantedByPendingSpell,
  payAdditionalCost,
  getEffectiveKeywords,
  checkPlaneswalkerDeaths,
  detachEquipmentFrom,
  sendAurasToGraveyard,
  cleanupIfVehicle,
  triggerCreatureDies,
  triggerAnyCreatureDeath,
  passPriority // Importado del nuevo turnManager / main
} from './main.js';

import { assignBotBlockers, triggerCombatAbility, triggerAnyCreatureAttacks, checkDeaths } from './combatRules.js';
import { addToStack, spellStack, getCounterTargetRestriction } from './stackManager.js';

// Costo alternativo del Tano: ¿puede pagar esta carta por la vía alternativa si el maná
// normal no le alcanza? Cubre las 2 variantes — vida pura, o híbrida (maná reducido +
// vida) — siempre con el mismo colchón de seguridad (nunca lo deja por debajo de 5 de
// vida) para no jugársela al pedo.
function isAffordableAlternativeCost(ac) {
  if (!ac) return false;
  if (ac.type === 'life') return state.rivalHP - ac.amount >= 5;
  if (ac.type === 'hybrid') return canRivalAfford({ manaCost: ac.manaCost }) && state.rivalHP - ac.life >= 5;
  return false;
}

// Mismo criterio en los 10 lugares donde el Tano elige objetivo para daño/remoción: nunca
// algo Intocable, y nunca algo protegido del color de LA CARTA que está usando (Protección
// de [color] hace que ese hechizo no le sirva de nada, así que ni tiene sentido intentarlo).
function isValidBotTarget(creatureItem, sourceColors) {
  if (hasKeyword(creatureItem, 'hexproof')) return false;
  if (getProtectionMatch(creatureItem, sourceColors || [])) return false;
  return true;
}

// ETAPA 2 (Grupo C, Pelear del Tano): antes, pelear SOLO se consideraba si era un cambio
// 100% gratis (mata y sobrevive) — cualquier otra situación, el Tano ni la evaluaba, aunque
// fuera un cambio parejo obviamente bueno (matar algo mucho más grande a cambio de perder
// algo chico). Un jugador real SÍ consideraría ese trade. Devuelve 'clean' (gratis), 'trade'
// (cambio que vale la pena) o null (ni siquiera vale pelear).
function evaluateFight(mine, theirs) {
  const myPower = getEffectivePower(mine);
  const myTough = getEffectiveToughness(mine);
  const theirPower = getEffectivePower(theirs);
  const theirTough = getEffectiveToughness(theirs);

  if (myPower < theirTough) return null; // ni la mata: nunca vale la pena pelear así
  if (theirPower < myTough) return 'clean'; // la mata y sobrevive: el mejor caso posible

  // La mata, pero también muere (o queda deathtouched — predictDuel ya lo maneja bien para
  // combate; acá, fight es más simple: siempre daño simultáneo, sin sub-pasos). Vale la
  // pena SOLO si el rival "pesa" más que la mía (cambio a favor, no solo parejo o peor).
  // Grupo C, Etapa 4: en Fácil, ni se evalúa esto — solo pelea si es gratis (evaluación
  // vieja, de antes de la Etapa 2).
  if (state.botDifficulty !== 'hard') return null;
  const myValue = myPower + myTough;
  const theirValue = theirPower + theirTough;
  return theirValue > myValue ? 'trade' : null;
}

// Busca, entre TODOS los "theirs" válidos, cuál conviene más pelear contra "mine" —
// prefiere siempre un 'clean' por sobre un 'trade', y dentro de cada categoría prefiere
// al rival más grande (más valor removido). Devuelve { theirs, tier } o null.
function bestFightTargetFor(mine, candidates) {
  let best = null;
  candidates.forEach(theirs => {
    const tier = evaluateFight(mine, theirs);
    if (!tier) return;
    const theirValue = getEffectivePower(theirs) + getEffectiveToughness(theirs);
    const isBetter = !best
      || (tier === 'clean' && best.tier !== 'clean')
      || (tier === best.tier && theirValue > (getEffectivePower(best.theirs) + getEffectiveToughness(best.theirs)));
    if (isBetter) best = { theirs, tier };
  });
  return best;
}

// A quién ataca cada criatura del Tano: si tenés Planeswalkers en el campo, prioriza
// rematar al que tenga MENOS Lealtad, pero solo si el golpe alcanza para matarlo de una
// (no desperdicia ataques en un Planeswalker que va a sobrevivir igual) — si no hay un
// remate limpio disponible, ataca a la cara, que sigue siendo el objetivo principal.
function chooseBotAttackTarget(attackerItem) {
  if (state.localPlaneswalkers.length === 0) return null;
  const power = getEffectivePower(attackerItem);
  const weakest = [...state.localPlaneswalkers].sort((a, b) => a.loyalty - b.loyalty)[0];
  if (weakest && power >= weakest.loyalty) return weakest;
  return null;
}

// El Tano y sus propios Planeswalkers: por cada uno que no haya usado su habilidad este
// turno, prefiere la más agresiva que pueda pagar (generalmente cuesta más Lealtad = hace
// más), salvo que eso lo deje en 0 o menos — ahí prefiere sumar Lealtad en cambio, para no
// perderlo de gusto. Soporta target de daño/bufo/destruir/exiliar (mismo vocabulario que el
// jugador humano tiene en resolveLoyaltyTargetChoice, main.js).
function tryActivateBotPlaneswalkers() {
  if (state.phase !== 'main1') return;
  state.rivalPlaneswalkers.forEach(pwItem => {
    if (pwItem.abilityUsedThisTurn) return;
    const abilities = pwItem.card.loyaltyAbilities || [];
    if (abilities.length === 0) return;

    const canAfford = (a) => !(a.cost < 0 && pwItem.loyalty < Math.abs(a.cost));
    // Si la habilidad pide target, solo cuenta como "usable" si además hay un blanco válido
    // — activarla sin nada que targetear no serviría de nada.
    const hasValidTarget = (a) => !a.requiresTarget || state.localCombat.some(c => isValidBotTarget(c, pwItem.card.colors));
    const affordable = abilities.map((a, idx) => ({ a, idx })).filter(({ a }) => canAfford(a) && hasValidTarget(a));
    if (affordable.length === 0) return;

    const sorted = [...affordable].sort((x, y) => x.a.cost - y.a.cost); // más negativo (más agresiva) primero
    let chosen = sorted[0];
    if (pwItem.loyalty + chosen.a.cost <= 0 && affordable.some(({ a }) => a.cost > 0)) {
      chosen = affordable.find(({ a }) => a.cost > 0);
    }

    const ability = chosen.a;
    pwItem.loyalty += ability.cost;
    pwItem.abilityUsedThisTurn = true;
    logMsg(`🔮 El Tano activó "${ability.name}" en ${pwItem.card.name} (Lealtad ahora: ${pwItem.loyalty}).`);

    if (ability.requiresTarget) {
      // Reusa el mismo criterio de "mejor blanco" que ya usa en todos lados: la criatura
      // rival más grande (poder + resistencia) entre las válidas.
      const validTargets = state.localCombat.filter(c => isValidBotTarget(c, pwItem.card.colors));
      const target = validTargets.reduce((prev, cur) =>
        (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
      );
      if (ability.effect.type === 'damage') {
        target.damageTaken = (target.damageTaken || 0) + ability.effect.amount;
        logMsg(`💥 "${ability.name}" le hizo ${ability.effect.amount} de daño a ${target.card.name}.`);
        checkDeaths(state.localCombat, state.localGraveyard, "Vos");
        checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
      } else if (ability.effect.type === 'pump') {
        if (!target.tempEffects) target.tempEffects = [];
        target.tempEffects.push({ powerMod: ability.effect.powerMod || 0, toughnessMod: ability.effect.toughnessMod || 0 });
      } else if (ability.effect.type === 'destroy_creature' || ability.effect.type === 'exile_creature') {
        // El objetivo del Tano siempre es tu criatura (isValidBotTarget ya filtró Intocable
        // y Protección al elegir `target` más arriba) — mismos pasos de limpieza que
        // stackManager.js usa para hechizos normales de remoción.
        const idx = state.localCombat.indexOf(target);
        if (idx !== -1 && !(ability.effect.type === 'destroy_creature' && hasKeyword(target, 'indestructible'))) {
          state.localCombat.splice(idx, 1);
          detachEquipmentFrom(target, true);
          sendAurasToGraveyard(target, true);
          cleanupIfVehicle(target);
          if (ability.effect.type === 'destroy_creature') {
            state.localGraveyard.push(target.card);
            logMsg(`💀 "${ability.name}" destruyó a ${target.card.name}!`);
            triggerCreatureDies(target, true);
            triggerAnyCreatureDeath(target, true);
          } else {
            state.localExile.push(target.card);
            logMsg(`🌀 "${ability.name}" exilió a ${target.card.name}!`);
          }
        }
      }
    } else if (ability.effect) {
      resolveEffectDirect(ability.effect, pwItem.card.name, false);
    }

    checkPlaneswalkerDeaths();
  });
}

// Ward: si el objetivo que el Tano eligió tiene esta keyword y te pertenece a vos (o sea,
// es "un rival" desde su perspectiva), tiene que pagar el costo extra o el hechizo se
// pierde. Se llama una sola vez, justo antes de cada addToStack que targetee una criatura
// — así no hace falta meter esto en cada una de las ramas que arman targetObj más arriba.
function tryPayWardForBotTarget(targetObj) {
  if (!targetObj || targetObj.type !== 'creature' || !targetObj.isLocal) return true; // no aplica
  const wardKw = (getEffectiveKeywords(targetObj.item) || []).find(k => k.startsWith('ward_'));
  if (!wardKw) return true;
  const wardCost = parseInt(wardKw.split('_')[1], 10);

  const sources = [...state.rivalLands, ...state.rivalSupport.filter(s => s.card.produces || s.card.producesOptions)]
    .filter(s => !s.tapped);
  let need = wardCost;
  const toTap = [];
  for (const s of sources) {
    if (need <= 0) break;
    toTap.push(s);
    need -= (s.card.manaAmount || 1);
  }
  if (need > 0) {
    logMsg(`🔶 ${targetObj.item.card.name} tenía Ward ${wardCost} y al Tano no le alcanzó el maná extra — el hechizo se pierde sin efecto.`);
    return false;
  }
  toTap.forEach(s => { s.tapped = true; });
  logMsg(`🔶 El Tano pagó Ward ${wardCost} para que su hechizo pase igual.`);
  return true;
}

// Fuentes de maná del Tano: sus tierras + cualquier artefacto que produzca maná (mana
// rocks / Treasures) que no esté ya girado. Un solo lugar para juntarlas evita repetir
// este filtro en cada función de abajo.
function getRivalManaSources() {
  const artifacts = state.rivalSupport.filter(s => s.card.produces || s.card.producesOptions);
  return [...state.rivalLands, ...artifacts];
}

// Cuánto maná TOTAL (sumando todo lo que tiene sin girar) le queda disponible al Tano —
// no descuenta nada todavía, es la base para calcular cuánto puede gastar en X.
function getRivalTotalAvailableMana() {
  return getRivalManaSources().filter(s => !s.tapped).reduce((sum, s) => sum + (s.card.manaAmount || 1), 0);
}

// Flashback o Escape desde el cementerio del Tano: busca la primera carta que tenga
// cualquiera de las dos, le alcance el maná (y si es Escape, le alcancen las cartas de
// cementerio para exiliar), y si necesita target de remoción tenga un blanco válido — recién
// ahí se compromete, para no desperdiciar la carta sacándola sin necesidad. A diferencia de
// antes, ahora también contempla CRIATURAS (el uso más común de Escape en MTG real — un
// cuerpo que vuelve una y otra vez), no solo hechizos/instantáneos.
function tryFlashbackOrEscapeFromBotGraveyard() {
  if (state.phase !== 'main1') return false;

  const getAbility = (c) => {
    if (c.flashback) return { source: 'flashback', ability: c.flashback };
    if (c.escape) return { source: 'escape', ability: c.escape };
    return null;
  };

  const isUsable = (c) => {
    const meta = getAbility(c);
    if (!meta || !canRivalAfford({ manaCost: meta.ability.cost })) return false;
    if (meta.source === 'escape') {
      const exileCount = meta.ability.exileCount || 0;
      const otherCount = state.rivalGraveyard.filter(g => g !== c).length;
      if (otherCount < exileCount) return false;
    }
    if (c.power !== undefined) return true; // criatura: siempre vale la pena recuperarla
    if (c.effect && ['destroy_creature', 'exile_creature', 'bounce'].includes(c.effect.type)) {
      return state.localCombat.some(u => isValidBotTarget(u, c.colors));
    }
    return true; // daño a la cara / robar / curarse siempre tienen destino válido
  };

  const idx = state.rivalGraveyard.findIndex(isUsable);
  if (idx === -1) return false;

  const card = state.rivalGraveyard.splice(idx, 1)[0];
  const { source, ability } = getAbility(card);
  tapRivalLandsFor({ manaCost: ability.cost });

  // Escape: además del maná, exilia N cartas más del cementerio — sin criterio especial
  // (no hay nada "mejor o peor" para exiliar desde la perspectiva del Tano acá), toma las
  // últimas del array nomás.
  if (source === 'escape') {
    const exileCount = ability.exileCount || 0;
    for (let i = 0; i < exileCount && state.rivalGraveyard.length > 0; i++) {
      state.rivalExile.push(state.rivalGraveyard.pop());
    }
    logMsg(`🌀 El Tano exilió ${exileCount} carta(s) de su cementerio para el Escape de ${card.name}.`);
  }

  let aiTargetObj = null;
  if (card.effect) {
    if (card.effect.type === 'damage') {
      // Mismo criterio que en el turno principal: si remata un Planeswalker tuyo, lo prioriza.
      const killablePw = state.localPlaneswalkers.find(pw => pw.loyalty <= card.effect.amount);
      aiTargetObj = killablePw
        ? { type: 'planeswalker', isLocal: true, item: killablePw }
        : { type: 'player', isLocal: true };
    } else if (card.effect.type === 'heal' || card.effect.type === 'draw') {
      aiTargetObj = { type: 'player', isLocal: false };
    } else if (['destroy_creature', 'exile_creature', 'bounce'].includes(card.effect.type)) {
      const validTargets = state.localCombat.filter(c => isValidBotTarget(c, card.colors));
      const best = validTargets.reduce((prev, cur) =>
        (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
      );
      aiTargetObj = { type: 'creature', isLocal: true, item: best };
    }
  }

  if (!tryPayWardForBotTarget(aiTargetObj)) {
    // Ward le ganó la pulseada: la carta (y, si era Escape, lo ya exiliado) se pierde igual.
    state.rivalExile.push(card);
    return true;
  }

  let stackType = 'spell';
  if (card.power !== undefined) stackType = 'summon';
  else if (card.type.includes('Planeswalker')) stackType = 'planeswalker';
  else if (card.type.includes('Instantáneo')) stackType = 'instant';

  addToStack({
    card,
    isLocal: false,
    targetObj: aiTargetObj,
    type: stackType,
    castFrom: source
  });
  logMsg(`🔄 El Tano usó ${source === 'escape' ? 'Escape' : 'Flashback'} en ${card.name}.`);
  state.priorityPlayer = 'local';
  state.consecutivePasses = 0;
  return true;
}

// Elegir un valor de X: el Tano gasta TODO lo que le sobra después de pagar el resto del
// costo de la carta — más grande, mejor, no hay motivo real para guardarse maná en su
// propia fase principal (a diferencia de un truco reactivo, donde sí conviene guardar).
function chooseBotXValue(card) {
  const baseCost = parseManaCost(card.manaCost); // el {X} de la cadena no suma nada acá
  const baseTotal = baseCost.W + baseCost.U + baseCost.B + baseCost.R + baseCost.G + baseCost.generic;
  const totalAvailable = getRivalTotalAvailableMana();
  return Math.max(0, totalAvailable - baseTotal);
}

// Elegir TODOS los objetivos de un hechizo multi-target, uno por cada entrada de
// card.targets[], con el mismo criterio que el Tano ya usa para esa clase de efecto
// cuando aparece solo en una carta de target único. Si CUALQUIER target no encuentra un
// blanco válido, devuelve null — regla real: no podés castear sin objetivo legal para
// todos los que la carta pide, no hay forma de "completar a medias".
function chooseBotMultiTargets(card) {
  const chosen = [];
  for (const spec of card.targets) {
    const effect = spec.effect;
    let targetObj = null;

    if (effect.type === 'destroy_artifact' || effect.type === 'destroy_enchantment') {
      const filterType = effect.type === 'destroy_artifact' ? 'Artefacto' : 'Encantamiento';
      const validTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
      if (validTargets.length > 0) targetObj = { type: 'permanent', isLocal: true, item: validTargets[0] };
    } else if (['destroy_creature', 'exile_creature', 'bounce', 'damage'].includes(effect.type)) {
      const validTargets = state.localCombat.filter(c => isValidBotTarget(c, card.colors));
      if (validTargets.length > 0) {
        const best = validTargets.reduce((prev, cur) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
        );
        targetObj = { type: 'creature', isLocal: true, item: best };
      } else if (effect.type === 'damage') {
        targetObj = { type: 'player', isLocal: true }; // sin criatura mejor, va a la cara
      }
    } else if (effect.type === 'pump') {
      if (state.rivalCombat.length > 0) {
        const best = state.rivalCombat.reduce((prev, cur) => getEffectivePower(cur) > getEffectivePower(prev) ? cur : prev);
        targetObj = { type: 'creature', isLocal: false, item: best };
      }
    } else if (effect.type === 'discard') {
      targetObj = { type: 'player', isLocal: true };
    } else if (effect.type === 'draw') {
      targetObj = { type: 'player', isLocal: false };
    } else if (effect.type === 'heal') {
      targetObj = { type: 'player', isLocal: false };
    } else if (effect.type === 'exile_graveyard') {
      // Le sirve si vos tenés algo en el cementerio que valga la pena exiliar; si no,
      // mejor no gastarlo (aunque el hechizo en sí igual podría servir por el otro target).
      if (state.localGraveyard.length > 0) targetObj = { type: 'player', isLocal: true };
    }

    if (!targetObj) return null;
    chosen.push(targetObj);
  }
  return chosen;
}

// Elegir un modo para un hechizo modal: prioridad simple — 1) un modo de remoción si hay
// un buen blanco disponible, 2) si no, uno de ventaja de cartas (robar), 3) si no, el
// primero que no pida target (para no arriesgarse a que no haya nada que targetear), y
// si ninguno cumple, directamente el primero de la lista.
function chooseBotMode(card) {
  const modes = card.modes;

  let idx = modes.findIndex(m => {
    if (!m.effect || !['damage', 'destroy_creature', 'exile_creature', 'bounce'].includes(m.effect.type)) return false;
    if (!m.requiresTarget) return true;
    return state.localCombat.some(c => isValidBotTarget(c, card.colors));
  });
  if (idx !== -1) return idx;

  idx = modes.findIndex(m => m.effect && m.effect.type === 'draw');
  if (idx !== -1) return idx;

  idx = modes.findIndex(m => !m.requiresTarget);
  return idx !== -1 ? idx : 0;
}

export function canRivalAfford(card) {
  if (!card.manaCost) return true;
  const cost = parseManaCost(card.manaCost);

  const fixed = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const duals = [];
  let totalMana = 0;

  getRivalManaSources().forEach(landItem => {
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
  const sources = getRivalManaSources();

  // 1) Primero cubrimos cada color con fuentes fijas (de un solo color)
  colors.forEach(color => {
    let needed = cost[color];
    for (let i = 0; i < sources.length && needed > 0; i++) {
      const land = sources[i];
      if (!land.tapped && !land.card.producesOptions && getLandColor(land.card) === color) {
        land.tapped = true;
        needed -= (land.card.manaAmount || 1);
        if (land.card.sacrificeOnTap) performSacrifice(land, false);
      }
    }
  });

  // 2) Lo que falte de cada color se cubre con fuentes duales (las más específicas primero)
  const dualEntries = sources.filter(l => !l.tapped && l.card.producesOptions)
    .sort((a, b) => a.card.producesOptions.length - b.card.producesOptions.length);

  colors.forEach(color => {
    let stillNeeded = cost[color] - sources
      .filter(l => l.tapped && !l.card.producesOptions && getLandColor(l.card) === color)
      .reduce((sum, l) => sum + (l.card.manaAmount || 1), 0);

    for (const land of dualEntries) {
      if (stillNeeded <= 0) break;
      if (land.tapped) continue;
      if (land.card.producesOptions.includes(color)) {
        land.tapped = true;
        stillNeeded -= (land.card.manaAmount || 1);
        if (land.card.sacrificeOnTap) performSacrifice(land, false);
      }
    }
  });

  // 3) Genérico: cualquier fuente que todavía no se giró (y que produzca maná de verdad)
  let genericNeeded = cost.generic;
  for (let i = 0; i < sources.length && genericNeeded > 0; i++) {
    const land = sources[i];
    if (!land.tapped && (land.card.produces || land.card.producesOptions)) {
      land.tapped = true;
      genericNeeded -= (land.card.manaAmount || 1);
      if (land.card.sacrificeOnTap) performSacrifice(land, false);
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
  if (state.botDifficulty !== 'hard') return false; // Grupo C, Etapa 4: en Fácil, sin trucos reactivos
  if (!(state.activePlayer === 'local' && state.phase === 'combat_attackers')) return false;

  const attackingUnits = state.localCombat.filter(c => c.isAttacking);
  if (attackingUnits.length === 0) return false;

  const cardIndex = state.rivalHand.findIndex(c =>
    c.type.includes('Instantáneo') && c.effect && c.effect.type === 'damage' && canRivalAfford(c)
  );
  if (cardIndex === -1) return false;

  const card = state.rivalHand[cardIndex];
  const target = attackingUnits.find(c => isValidBotTarget(c, card.colors) && getEffectiveToughness(c) <= card.effect.amount);
  if (!target) return false;

  state.rivalHand.splice(cardIndex, 1);
  tapRivalLandsFor(card);

  const targetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(target), item: target };
  if (!tryPayWardForBotTarget(targetObj)) {
    state.rivalGraveyard.push(card);
    render();
    return true;
  }

  addToStack({
    card,
    isLocal: false,
    targetObj: targetObj,
    type: 'instant'
  });

  state.priorityPlayer = 'local';
  state.consecutivePasses = 0;

  logMsg(`🔴 ¡El Tano respondió a tus atacantes con "${card.name}"!`);
  render();
  return true;
}

// ETAPA 1 (Grupo C, IA reactiva): mismo espíritu que tryBotCombatTrick de arriba, pero para
// DESPUÉS de que el Tano ya asignó bloqueadores — si alguno de sus bloqueos va a perder a
// la criatura tal como está, y tiene un instantáneo de pump que lo salve, lo usa antes de
// pasar prioridad. Antes de esto, el Tano bloqueaba "bien" (assignSmartBlock ya es
// inteligente) pero nunca consideraba que podía MEJORAR un bloqueo ya hecho con un truco.
function tryBotPostBlockTrick() {
  if (state.botDifficulty !== 'hard') return false; // Grupo C, Etapa 4: en Fácil, sin trucos reactivos
  const blockingPairs = state.rivalCombat.filter(c => c.blockingIndex !== null && c.blockingIndex !== undefined);

  for (const blocker of blockingPairs) {
    const attacker = state.localCombat[blocker.blockingIndex];
    if (!attacker || !attacker.isAttacking) continue;

    // Si este bloqueo ya está bien tal cual está (el bloqueador sobrevive), no hay nada que
    // mejorar — nos ahorramos gastar la carta de pump al pedo.
    if (!predictDuel(attacker, blocker).blockerDies) continue;

    const pumpIndex = state.rivalHand.findIndex(c => {
      const hasFlash = c.keywords && c.keywords.includes('flash');
      if (!(c.type.includes('Instantáneo') || hasFlash) || c.effect?.type !== 'pump' || !canRivalAfford(c)) return false;
      // X queda afuera a propósito: elegir X a ciegas en medio de una simulación de combate
      // es un caso raro que no vale la pena resolver acá.
      return typeof c.effect.powerMod === 'number' && typeof c.effect.toughnessMod === 'number';
    });
    if (pumpIndex === -1) continue;

    const pumpCard = state.rivalHand[pumpIndex];
    const trialMod = { powerMod: pumpCard.effect.powerMod || 0, toughnessMod: pumpCard.effect.toughnessMod || 0 };

    // Probamos el pump DIRECTO sobre el objeto real (después lo sacamos si no sirve) para
    // que getEffectivePower/getEffectiveToughness sigan contando bien auras/equipos/otros
    // trucos ya puestos — clonar el objeto rompería esas referencias.
    if (!blocker.tempEffects) blocker.tempEffects = [];
    blocker.tempEffects.push(trialMod);
    const survivesWithPump = !predictDuel(attacker, blocker).blockerDies;
    blocker.tempEffects.pop(); // fue solo una prueba

    if (!survivesWithPump) continue; // ni con el pump se salva, no vale la pena gastarlo

    state.rivalHand.splice(pumpIndex, 1);
    tapRivalLandsFor(pumpCard);
    blocker.tempEffects.push(trialMod); // ahora sí, lo dejamos puesto de verdad

    addToStack({
      card: pumpCard,
      isLocal: false,
      targetObj: { type: 'creature', isLocal: false, item: blocker, index: state.rivalCombat.indexOf(blocker) },
      type: 'instant'
    });

    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;
    logMsg(`💪 ¡El Tano salvó a ${blocker.card.name} con "${pumpCard.name}" en medio del combate!`);
    render();
    return true;
  }
  return false;
}

export async function checkRivalCounterOrResponse() {
  if (spellStack.length === 0) return false;
  // Grupo C, Etapa 4: en Fácil, el Tano nunca juega en velocidad instantánea — ni
  // contrarresta, ni se defiende, ni responde a nada. Pasa prioridad y ya (comportamiento
  // de base, sin ningún truco reactivo, viejo o nuevo).
  if (state.botDifficulty !== 'hard') return false;

  await sleep(600);

  // ETAPA 1 (Grupo C, IA reactiva): si algo en la pila amenaza con destruir/exiliar/matar
  // (de daño letal) a una criatura del Tano, y tiene un instantáneo que le dé Intocable
  // temporal, lo usa ANTES de mirar cualquier otra respuesta — salvar una criatura vale más
  // que cualquier otro truco reactivo. "Bounce" queda afuera a propósito (no es grave
  // perder solo el tempo de que vuelva a la mano, no vale la pena gastar la protección).
  const threatened = spellStack.find(s => {
    if (!s.isLocal || !s.targetObj || s.targetObj.type !== 'creature' || s.targetObj.isLocal) return false;
    const eff = s.card.effect;
    if (!eff) return false;
    if (eff.type === 'destroy_creature' || eff.type === 'exile_creature') return true;
    if (eff.type === 'damage') {
      const target = s.targetObj.item;
      return (getEffectiveToughness(target) - (target.damageTaken || 0)) <= eff.amount;
    }
    return false;
  });

  if (threatened) {
    const protectIndex = state.rivalHand.findIndex(c => {
      const hasFlash = c.keywords && c.keywords.includes('flash');
      return (c.type.includes('Instantáneo') || hasFlash) && c.effect?.type === 'grant_keyword_temp' && c.effect.keyword === 'hexproof' && canRivalAfford(c);
    });
    if (protectIndex !== -1) {
      const protectCard = state.rivalHand.splice(protectIndex, 1)[0];
      const savedCreature = threatened.targetObj.item;
      tapRivalLandsFor(protectCard);
      addToStack({
        card: protectCard,
        isLocal: false,
        targetObj: { type: 'creature', isLocal: false, item: savedCreature, index: state.rivalCombat.indexOf(savedCreature) },
        type: 'instant'
      });
      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(`🛡️ ¡El Tano protegió a ${savedCreature.card.name} con "${protectCard.name}" antes de que le hicieras algo!`);
      render();
      return true;
    }
  }

  const responseIndex = state.rivalHand.findIndex(c => {
    const hasFlash = c.keywords && c.keywords.includes('flash');
    if (!(c.type.includes('Instantáneo') || hasFlash) || !canRivalAfford(c)) return false;

    if (isCounterSpell(c)) {
      // Un counter normal solo le sirve al Tano contra HECHIZOS (nunca habilidades) a
      // menos que la carta lo diga explícitamente — misma regla real de MTG.
      const restriction = getCounterTargetRestriction(c.effect.type);
      const matchesStackItem = (s) => {
        if (!s.isLocal) return false;
        const isAbility = s.type === 'ability';
        return isAbility ? restriction.allowAbility : restriction.allowSpell;
      };
      if (c.effect.type === 'counter_creature') {
        return spellStack.some(s => matchesStackItem(s) && s.card?.type?.includes('Criatura'));
      }
      if (c.effect.type === 'counter_non_creature') {
        return spellStack.some(s => matchesStackItem(s) && !s.card?.type?.includes('Criatura'));
      }
      return spellStack.some(matchesStackItem);
    }

    // Fuera de counters, solo consideramos jugarla en respuesta si no necesita objetivo,
    // o si es un tipo que sabemos targetear bien acá abajo. Si no, la dejamos afuera del
    // camino reactivo (igual la puede jugar en su propia fase principal, donde SÍ sabe
    // targetear pump/fight/etc.) — mejor no jugarla que jugarla y que fallezca sin efecto.
    if (!c.requiresTarget) return true;
    if (c.effect?.type === 'damage') return true;
    if (c.effect?.type === 'destroy_creature' || c.effect?.type === 'bounce' || c.effect?.type === 'exile_creature' || c.effect?.type === 'exile_and_return') {
      return state.localCombat.some(u => isValidBotTarget(u, c.colors));
    }
    return false;
  });

  if (responseIndex !== -1) {
    const responseCard = state.rivalHand.splice(responseIndex, 1)[0];
    tapRivalLandsFor(responseCard);

    let targetObj = null;
    if (isCounterSpell(responseCard)) {
      const restriction = getCounterTargetRestriction(responseCard.effect.type);
      const topLocalSpell = [...spellStack].reverse().find(s => {
        if (!s.isLocal) return false;
        const isAbility = s.type === 'ability';
        return isAbility ? restriction.allowAbility : restriction.allowSpell;
      });
      if (topLocalSpell) {
        targetObj = { type: 'stack', stackId: topLocalSpell.id };
      }
    } else if (responseCard.effect?.type === 'damage') {
      // Preferimos rematar una criatura vulnerable; si no hay, pegamos a la cara
      const vulnerable = state.localCombat.find(c =>
        isValidBotTarget(c, responseCard.colors) && getEffectiveToughness(c) <= responseCard.effect.amount
      );
      targetObj = vulnerable
        ? { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable }
        : { type: 'player', isLocal: true };
    } else if (responseCard.effect?.type === 'destroy_creature' || responseCard.effect?.type === 'bounce' || responseCard.effect?.type === 'exile_creature' || responseCard.effect?.type === 'exile_and_return') {
      // La criatura tuya con más poder efectivo (la más peligrosa)
      const candidates = state.localCombat.filter(c => isValidBotTarget(c, responseCard.colors));
      if (candidates.length > 0) {
        const chosen = candidates.reduce((prev, cur) => getEffectivePower(prev) > getEffectivePower(cur) ? prev : cur);
        targetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(chosen), item: chosen };
      }
    }

    if (!tryPayWardForBotTarget(targetObj)) {
      state.rivalGraveyard.push(responseCard);
      render();
      return true;
    }

    addToStack({
      card: responseCard,
      isLocal: false,
      targetObj: targetObj,
      // Un permanente con Flash (artefacto/criatura) tiene que entrar al campo como
      // corresponde, no resolverse como si fuera un hechizo de una sola vez — antes esto
      // estaba fijo en 'instant' sin importar qué era la carta.
      type: responseCard.power !== undefined ? 'summon'
          : (responseCard.type.includes('Artefacto') || responseCard.type.includes('Encantamiento')) ? 'permanent'
          : 'instant'
    });

    // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;    // -----------------------------------------------
    
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

// Tripular un Vehículo del Tano: se paga girando poder de criaturas propias, nunca maná
// (regla 702.121). Prioriza gastar criaturas mareadas (no pueden atacar este turno de
// todas formas) o de bajo poder antes que sus mejores atacantes, para no restarle
// potencial de ataque si hay alternativas más baratas para completar el poder pedido.
function tryBotCrewVehicle(vehicleItem, zoneType) {
  if (state.phase !== 'main1') return; // mismo criterio de timing que ya tenía

  const required = vehicleItem.card.activatedAbility.crewCost;
  const candidates = state.rivalCombat
    .filter(c => !c.tapped)
    .sort((a, b) => {
      if (a.summoningSickness !== b.summoningSickness) return a.summoningSickness ? -1 : 1;
      return getEffectivePower(a) - getEffectivePower(b);
    });

  const chosen = [];
  let powerSoFar = 0;
  for (const c of candidates) {
    if (powerSoFar >= required) break;
    chosen.push(c);
    powerSoFar += getEffectivePower(c);
  }
  if (powerSoFar < required) return; // no le alcanza el poder disponible para tripularlo

  const originZone = zoneType === 'land' ? state.rivalLands : state.rivalSupport;
  const vIdx = originZone.indexOf(vehicleItem);
  if (vIdx === -1) return;

  chosen.forEach(c => { c.tapped = true; });

  const card = vehicleItem.card;
  const removed = originZone.splice(vIdx, 1)[0];
  removed.card.power = card.baseStats.power;
  removed.card.toughness = card.baseStats.toughness;
  removed.isVehicle = true;
  removed.wasLand = (zoneType === 'land');
  removed.summoningSickness = !!removed.enteredThisTurn;
  state.rivalCombat.push(removed);

  logMsg(`🚗 El Tano tripuló a ${card.name} con ${chosen.length} criatura(s) suya(s) (${powerSoFar} de poder) — ahora es un ${card.baseStats.power}/${card.baseStats.toughness}.`);
}

// NUEVO: Evaluación táctica para activar artefactos y soporte
export function tryActivateBotAbilities() {
  // Recorremos artefactos Y tierras de utilidad del Tano (cualquier permanente con
  // activatedAbility propia que no sea simplemente maná).
  const candidates = [
    ...state.rivalSupport.map((item, idx) => ({ item, index: idx, zoneType: 'support' })),
    ...state.rivalLands.map((item, idx) => ({ item, index: idx, zoneType: 'land' }))
  ];

  for (const { item: supportItem, index: i, zoneType } of candidates) {
    const card = supportItem.card;

    if (!card.activatedAbility) continue;
    // Para tierras, ignoramos las de maná normal (esas las maneja tapRivalLandsFor)
    if (zoneType === 'land' && (card.produces || card.producesOptions)) continue;

    const ability = card.activatedAbility;

    // Tripular un Vehículo: se paga girando poder de criaturas, no maná — va por un camino
    // totalmente aparte (antes esto intentaba leer ability.cost.includes(...) más abajo,
    // que ni siquiera existe en un Vehículo, y encima cobraba maná por error).
    if (ability.crewCost !== undefined) {
      tryBotCrewVehicle(supportItem, zoneType);
      continue;
    }

    const requiresTap = ability.cost.includes('{T}');
    if (requiresTap && supportItem.tapped) continue;

    // Extraemos el costo de maná para ver si el Tano lo puede pagar
    const manaCostString = ability.cost.replace('{T}', '').replace(',', '').trim();
    const dummyCardForCost = { manaCost: manaCostString || null };
    if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;

    // Si el costo pide sacrificar, chequeamos que tenga algo válido para pagar con eso
    if (ability.sacrifice === 'creature' && state.rivalCombat.length === 0) continue;
    if (ability.sacrifice === 'artifact' && !state.rivalSupport.some(s => s.card.type.includes('Artefacto'))) continue;

    let shouldActivate = false;
    let aiTargetObj = null;

    // 🧠 CEREBRO DEL TANO: ¿Cuándo y a quién activar?
    // Nota: si llegamos hasta acá con effect.type 'crew_vehicle', es una tierra-criatura
    // (man-land) pagada con maná — los Vehículos de verdad ya se filtraron arriba
    // (ability.crewCost) y nunca llegan a este árbol.
    if (ability.effect.type === 'crew_vehicle') {
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
           // Bug reportado: sin este chequeo, el Tano volvía a pagar y re-equipar lo mismo
           // en la misma criatura una y otra vez cada vez que este loop se ejecutaba (varias
           // veces por turno), porque "chosen" siempre daba la misma criatura y nada le
           // avisaba que ya estaba puesto ahí. Si ya está en esa criatura, no repetir — pero
           // sí lo deja moverlo a una mejor si la situación cambió (como en MTG real).
           if (supportItem.attachedTo === chosen) continue;
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
          isValidBotTarget(c, card.colors) && getEffectiveToughness(c) <= ability.effect.amount
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
    else if (ability.effect.type === 'ramp') {
      // Tipo fetchland: le conviene usarla temprano, mientras todavía le faltan tierras
      if (state.phase === 'main1' && state.rivalLands.length < 6) shouldActivate = true;
    }
    else if (ability.effect.type === 'draw_and_lose_life') {
      // Tipo Cassette Pirata / Biblioteca Nacional: solo si no está muy lastimado
      if (state.phase === 'main2' && state.rivalHP > 8) shouldActivate = true;
    }

    // ⚡ EJECUCIÓN
    if (shouldActivate) {
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) supportItem.tapped = true;

      // El sacrificio se paga ahora, antes de que la habilidad llegue a la pila —
      // igual que para el jugador humano.
      if (ability.sacrifice === 'self') {
        performSacrifice(supportItem, false);
      } else if (ability.sacrifice === 'creature') {
        const worst = state.rivalCombat.reduce((prev, current) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) < (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
        );
        performSacrifice(worst, false);
      } else if (ability.sacrifice === 'artifact') {
        const artifacts = state.rivalSupport.filter(s => s.card.type.includes('Artefacto'));
        performSacrifice(artifacts[0], false);
      }

      // El costo (maná, sacrificio) ya se pagó arriba y no se devuelve, sea cual sea el
      // resultado de acá — así es en MTG real, Ward contrarresta el efecto, no reembolsa
      // lo ya pagado para activarlo.
      if (tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card: card,
          isLocal: false,
          targetObj: aiTargetObj,
          type: 'ability',
          source: { type: 'support_activation', index: i },
          sourceItem: supportItem
        });
      }

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

    // Un Vehículo ya tripulado (ahora una criatura en combate) todavía tiene pegada su
    // habilidad de Tripular original — no es una habilidad de criatura de verdad, así que
    // la salteamos acá explícitamente en vez de confiar en que ningún caso de abajo matchee.
    if (ability.crewCost !== undefined) continue;

    const requiresTap = (ability.cost || "").includes('{T}');
    if (requiresTap && (creatureItem.tapped || creatureItem.summoningSickness)) continue;

    const manaCostString = (ability.cost || "").replace('{T}', '').replace(',', '').trim();
    const dummyCardForCost = { manaCost: manaCostString || null };
    if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;

    // Si el costo pide sacrificar, chequeamos que tenga algo válido para pagar con eso.
    // Al elegir criatura, evitamos sacrificar a la que está activando la propia habilidad.
    if (ability.sacrifice === 'creature' && state.rivalCombat.filter(c => c !== creatureItem).length === 0) continue;
    if (ability.sacrifice === 'artifact' && !state.rivalSupport.some(s => s.card.type.includes('Artefacto'))) continue;

    let shouldActivate = false;
    let aiTargetObj = null;

    if (ability.effect.type === 'damage') {
      // Mismo criterio que las Boleadoras: matar algo vulnerable, o pegar en main2
      const vulnerable = state.localCombat.find(c =>
        isValidBotTarget(c, sourceCard.colors) && getEffectiveToughness(c) <= ability.effect.amount
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
      // Pelea si conviene de verdad: prefiere un cambio limpio, pero ahora también acepta
      // un trade parejo si el rival vale más que la propia criatura (antes SOLO peleaba
      // si era gratis — un jugador real también consideraría el cambio a favor).
      const candidates = state.localCombat.filter(c => isValidBotTarget(c, creatureItem.card.colors));
      const best = bestFightTargetFor(creatureItem, candidates);
      if (best) {
        aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(best.theirs), item: best.theirs };
        shouldActivate = true;
      }
    }

    if (shouldActivate) {
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) creatureItem.tapped = true;

      // El sacrificio se paga ahora, antes de que la habilidad llegue a la pila.
      if (ability.sacrifice === 'creature') {
        const candidates = state.rivalCombat.filter(c => c !== creatureItem);
        const worst = candidates.reduce((prev, current) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) < (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
        );
        performSacrifice(worst, false);
      } else if (ability.sacrifice === 'artifact') {
        const artifacts = state.rivalSupport.filter(s => s.card.type.includes('Artefacto'));
        performSacrifice(artifacts[0], false);
      } else if (ability.sacrifice === 'self') {
        performSacrifice(creatureItem, false);
      }

      const sourceIndex = ownAbility ? i : supportZone.indexOf(equippedItem);
      const sourceItem = ownAbility ? creatureItem : equippedItem;
      if (tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card: sourceCard,
          isLocal: false,
          targetObj: aiTargetObj,
          type: 'ability',
          source: { type: ownAbility ? 'support_activation' : 'equipped_activation', index: sourceIndex },
          sourceItem: sourceItem
        });
      }

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

    // Planeswalkers propios: revisa si conviene usar alguna habilidad de Lealtad este turno
    // (resuelve todo de una, sin pasar por la pila — mismo criterio que el jugador humano).
    tryActivateBotPlaneswalkers();
    render();

    // Flashback o Escape desde su propio cementerio: si tiene algo pagable, lo usa antes de
    // seguir con el resto de sus decisiones — esto SÍ pasa por la pila (a diferencia de
    // Lealtad), así que cortamos acá para esperar a que resuelva.
    if (tryFlashbackOrEscapeFromBotGraveyard()) return;

    // --- NUEVO: Intentar activar habilidades de artefactos primero ---
    const abilityActivated = tryActivateBotAbilities();
    if (abilityActivated) return; // Si activó algo, la función corta y espera resolución

    // --- NUEVO: Intentar usar habilidades otorgadas por Equipos ya puestos ---
    const grantedActivated = tryActivateGrantedBotAbilities();
    if (grantedActivated) return;
    // -----------------------------------------------------------------
    
    // ETAPA 3 (Grupo C, "mejor jugada"): entre TODAS las cartas que puede pagar, antes
    // jugaba literalmente la primera en el orden de la mano (puro azar de robo). Ahora usa
    // un sistema de 3 niveles de prioridad — chico y explicable a propósito, no una IA real
    // de verdad: 1) remoción si hay una amenaza grande enfrente, 2) una criatura si el
    // campo está vacío, 3) lo que sea, como antes. Dentro de cada nivel, sigue siendo la
    // primera en orden de mano (no evalúa CUÁL remoción o CUÁL criatura es mejor entre sí).
    function isRemovalCard(c) {
      return c.effect && ['destroy_creature', 'exile_creature', 'fight'].includes(c.effect.type);
    }
    function pickBestMainPhaseCardIndex(affordableIndexes) {
      if (affordableIndexes.length === 0) return -1;

      // Grupo C, Etapa 4: en Fácil, directo la primera que puede pagar — sin ningún nivel
      // de prioridad (el comportamiento de base, antes de la Etapa 3).
      if (state.botDifficulty !== 'hard') return affordableIndexes[0];

      // Nivel 1: hay una amenaza grande de tu lado (poder+resistencia por encima de un piso
      // razonable) y el Tano tiene algo de remoción — la prioriza por sobre cualquier otra cosa.
      const biggestThreatValue = state.localCombat.reduce((max, u) => {
        const val = getEffectivePower(u) + getEffectiveToughness(u);
        return val > max ? val : max;
      }, 0);
      if (biggestThreatValue >= 6) {
        const removalIdx = affordableIndexes.find(i => isRemovalCard(state.rivalHand[i]));
        if (removalIdx !== undefined) return removalIdx;
      }

      // Nivel 2: el campo está vacío (o casi) — prioriza desarrollar con una criatura antes
      // que gastar la carta en otra cosa (drenar, robar, etc.), aunque también la pueda pagar.
      if (state.rivalCombat.length === 0) {
        const creatureIdx = affordableIndexes.find(i => state.rivalHand[i].power !== undefined);
        if (creatureIdx !== undefined) return creatureIdx;
      }

      // Nivel 3: sin ninguna prioridad especial, la primera que pueda pagar (comportamiento
      // de siempre).
      return affordableIndexes[0];
    }


    // Mismo filtro de siempre (afford, no counterspell, colchón de vida, gating de
    // destroy_all_creatures/proliferate) — antes devolvía solo el PRIMER índice que
    // pasaba (findIndex); ahora devuelve TODOS los que pasan (filter), para que
    // pickBestMainPhaseCardIndex pueda elegir entre ellos en vez de quedarse con el primero.
    const getAllAffordableMainPhaseCardIndexes = () => {
      const indexes = [];
      state.rivalHand.forEach((c, i) => {
        if (c.type.includes('Tierra')) return;
        // Costo alternativo: si no le alcanza el maná normal, puede pagar con vida pura, o
        // con un costo híbrido (maná reducido + vida) — según lo que la carta ofrezca.
        const canAffordAlternative = isAffordableAlternativeCost(c.alternativeCost);
        if (!canRivalAfford(c) && !canAffordAlternative) return;
        if (isCounterSpell(c)) return;
        // No jugarse la vida al pedo: si el costo adicional es de vida, deja un colchón
        // de seguridad en vez de arriesgarse a quedar muy bajo (o directo no poder pagarlo).
        if (c.additionalCost && c.additionalCost.type === 'life' && state.rivalHP - c.additionalCost.amount < 5) return;
        // NUEVO: El Tano solo arrasa el campo si está en desventaja de poder
        if (c.effect && c.effect.type === 'destroy_all_creatures') {
          const localPower = state.localCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          const rivalPower = state.rivalCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          if (rivalPower >= localPower) return;
        }
        // NUEVO: no tiene sentido gastar Proliferar si no hay ni un solo contador en juego
        // (ni +1/+1, ni -1/-1, ni un Planeswalker con Lealtad) — se desperdiciaría entero.
        if (c.effect && c.effect.type === 'proliferate') {
          const hasCreatureCounters = [...state.localCombat, ...state.rivalCombat].some(u =>
            u.counters && ((u.counters.plusOne || 0) > 0 || (u.counters.minusOne || 0) > 0)
          );
          const hasPlaneswalkers = state.localPlaneswalkers.length > 0 || state.rivalPlaneswalkers.length > 0;
          if (!hasCreatureCounters && !hasPlaneswalkers) return;
        }
        indexes.push(i);
      });
      return indexes;
    };

    let affordableIndex = pickBestMainPhaseCardIndex(getAllAffordableMainPhaseCardIndexes());
    
    if (affordableIndex !== -1) {
      let cardToPlay = state.rivalHand.splice(affordableIndex, 1)[0];

      // Hechizos modales: el Tano elige un modo ANTES de todo lo demás (mismo orden que
      // el jugador humano) — "resuelve" la carta en una versión con el effect/requiresTarget
      // del modo elegido ya fijados, y el resto de su lógica de casteo (más abajo) sigue
      // funcionando exactamente igual, sin saber que la carta era modal.
      if (cardToPlay.modal && cardToPlay.modes && cardToPlay.modes.length > 0) {
        const modeIdx = chooseBotMode(cardToPlay);
        const chosenMode = cardToPlay.modes[modeIdx];
        cardToPlay = { ...cardToPlay, effect: chosenMode.effect, requiresTarget: chosenMode.requiresTarget, chosenModeText: chosenMode.text };
        logMsg(`🔀 El Tano eligió el modo "${chosenMode.text}" para ${cardToPlay.name}.`);
      }

      // Kicker (costo ADICIONAL y OPCIONAL): el Tano lo paga si tiene con qué — mismo
      // criterio "más grande, mejor, sin evaluar de verdad si conviene" que el resto de sus
      // decisiones de maná (ver X más abajo). Concatenar los dos strings de costo funciona
      // porque parseManaCost solo busca símbolos {..}, no importa el orden ni de dónde vienen.
      let botKicked = false;
      let manaSourceCard = cardToPlay;
      if (cardToPlay.kicker) {
        const combinedManaCost = (cardToPlay.manaCost || '') + cardToPlay.kicker.cost;
        if (canRivalAfford({ manaCost: combinedManaCost })) {
          botKicked = true;
          manaSourceCard = { ...cardToPlay, manaCost: combinedManaCost };
          logMsg(`💪 El Tano pagó también el Kicker de ${cardToPlay.name}.`);
        }
      }

      // Costo de maná variable ({X}): el Tano elige X ANTES de tapear nada — gasta todo el
      // maná que le sobre después de pagar el resto del costo (más grande, mejor, no hay
      // razón para guardarse maná en su propio turno principal).
      let botXValue = null;
      if (manaSourceCard.manaCost && manaSourceCard.manaCost.includes('{X}')) {
        botXValue = chooseBotXValue(manaSourceCard);
        const effectiveManaCost = manaSourceCard.manaCost.replace('{X}', Array(botXValue).fill('{1}').join(''));
        tapRivalLandsFor({ manaCost: effectiveManaCost });
        logMsg(`✨ El Tano eligió X = ${botXValue} para ${cardToPlay.name}.`);
      }
      // Si el maná normal no le alcanza pero el costo alternativo sí (ya validado arriba),
      // paga por esa vía en cambio de girar tierras que no tiene.
      else if (!canRivalAfford(manaSourceCard) && manaSourceCard.alternativeCost) {
        const ac = manaSourceCard.alternativeCost;
        if (ac.type === 'life') {
          state.rivalHP -= ac.amount;
          logMsg(`💉 El Tano pagó ${cardToPlay.name} con ${ac.amount} de vida en vez de maná.`);
        } else if (ac.type === 'hybrid') {
          tapRivalLandsFor({ manaCost: ac.manaCost });
          state.rivalHP -= ac.life;
          logMsg(`💉 El Tano pagó ${cardToPlay.name} con ${ac.manaCost} + ${ac.life} de vida.`);
        }
      } else {
        tapRivalLandsFor(manaSourceCard);
      }
      payAdditionalCost(cardToPlay, false); // vida o descarte, si la carta lo pide

      const isPermanent = cardToPlay.type.includes('Artefacto') || (cardToPlay.type.includes('Encantamiento') && !cardToPlay.adjunta);
      
      let stackType = 'spell';
      let aiTargetObj = null;
      let validPlay = true;

      if (cardToPlay.power !== undefined) {
        stackType = 'summon';
      } else if (cardToPlay.type.includes('Planeswalker')) {
        stackType = 'planeswalker';
      } else if (isPermanent) {
        stackType = 'permanent';
        // --- LÓGICA HEXPROOF PARA EL BOT ---
        if (cardToPlay.requiresTarget && cardToPlay.etbEffect) {
          if (cardToPlay.etbEffect.type === 'damage') {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            const validLocalTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
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
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
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
          // Mismo criterio que del lado del jugador: no le vuelvas a poner una habilidad que
          // esa criatura ya tiene (de cualquier fuente) — antes siempre iba a rivalCombat[0]
          // sin chequear nada.
          const grantedKeywords = getKeywordsGrantedByPendingSpell(cardToPlay);
          const validSelfTargets = state.rivalCombat.filter(c =>
            !grantedKeywords.some(k => hasKeyword(c, k))
          );
          if (validSelfTargets.length > 0) {
            aiTargetObj = { type: 'creature', isLocal: false, item: validSelfTargets[0] };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía ninguna criatura que se beneficiara de ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        } else {
          validPlay = false;
          logMsg(`El Tano no tenía criaturas para encantar con ${cardToPlay.name} y lo descartó.`);
          state.rivalGraveyard.push(cardToPlay);
        }
      } else {
        stackType = cardToPlay.type.includes('Instantáneo') ? 'instant' : 'spell';

        // Objetivos múltiples: elige TODOS los targets de una, con el mismo criterio que
        // ya usa para cada tipo de efecto en solitario. Si falta uno solo, la carta entera
        // queda sin jugar — regla real: no podés castear sin objetivo legal para todos los
        // que pide.
        if (cardToPlay.multiTarget && cardToPlay.targets && cardToPlay.targets.length > 0) {
          const chosenTargets = chooseBotMultiTargets(cardToPlay);
          if (chosenTargets) {
            aiTargetObj = { type: 'multi', targets: chosenTargets };
          } else {
            validPlay = false;
            logMsg(`El Tano no encontró objetivos válidos para todos los modos de ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        else if (cardToPlay.effect && cardToPlay.effect.type === 'damage') {
          // LÓGICA NUEVA (Cabo suelto #13): mismo criterio que ya usa en combate
          // (chooseBotAttackTarget) — si con esto remata un Planeswalker tuyo, lo prioriza
          // por sobre pegarte a la cara. Si no hay un remate limpio, va a la cara como antes.
          const killablePw = state.localPlaneswalkers.find(pw => pw.loyalty <= cardToPlay.effect.amount);
          aiTargetObj = killablePw
            ? { type: 'planeswalker', isLocal: true, item: killablePw }
            : { type: 'player', isLocal: true };
        } else if (cardToPlay.effect && cardToPlay.effect.type === 'heal') {
          aiTargetObj = { type: 'player', isLocal: false };
        }
        // LÓGICA NUEVA: VENENO DIRECTO — mismo criterio que daño, siempre apunta al jugador.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'poison') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: REMOCIÓN DE CRIATURA (Yuyo del Loco, etc.)
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_creature' || cardToPlay.effect.type === 'exile_creature' || cardToPlay.effect.type === 'exile_and_return')) {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura más grande (poder + resistencia) — si es
            // Exilio, además prioriza una Indestructible (a esa, "destruir" no le sirve
            // de nada, pero Exilio no le pregunta nada).
            const indestructibleTargets = validTargets.filter(c => hasKeyword(c, 'indestructible'));
            const pool = ((cardToPlay.effect.type === 'exile_creature' || cardToPlay.effect.type === 'exile_and_return') && indestructibleTargets.length > 0) ? indestructibleTargets : validTargets;
            const chosen = pool.reduce((prev, current) =>
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
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
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
        // LÓGICA NUEVA: EXILIAR CEMENTERIO — el Tano se lo tira a quien tenga más cartas
        // ahí (normalmente vos); si el rival tiene el cementerio vacío, mejor ni gastarla.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'exile_graveyard') {
          if (state.localGraveyard.length > 0) {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            validPlay = false;
            logMsg(`El Tano no encontró un cementerio que valiera la pena exiliar y descartó ${cardToPlay.name}.`);
            state.rivalGraveyard.push(cardToPlay);
          }
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
        // LÓGICA NUEVA: CONTADOR PERMANENTE (+1/+1 propio, o -1/-1 al rival) — mismo criterio
        // que pump (+1/+1 a su mejor criatura) y destroy_creature (-1/-1 a la más grande tuya).
        else if (cardToPlay.effect && cardToPlay.effect.type === 'add_counter') {
          if (cardToPlay.effect.counterType === 'minusOne') {
            const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
            if (validTargets.length > 0) {
              const chosen = validTargets.reduce((prev, current) =>
                (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
              );
              aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
            } else {
              validPlay = false;
              logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
              state.rivalGraveyard.push(cardToPlay);
            }
          } else if (state.rivalCombat.length > 0) {
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
        // ETAPA 2 (Grupo C, Pelear del Tano): antes solo consideraba un cambio 100% gratis
        // (mata y sobrevive) entre TODAS sus combinaciones posibles — ahora, si no hay
        // ninguna así, también acepta la mejor combinación de trade parejo disponible
        // (mata pero también muere, si el rival vale más que la propia). Mismo criterio
        // que la pelea por habilidad (bestFightTargetFor), pero acá también hay que elegir
        // CUÁL de sus criaturas pelea, no solo contra cuál.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'fight') {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          let bestPair = null, bestTier = null;
          state.rivalCombat.forEach(mine => {
            const best = bestFightTargetFor(mine, validTargets);
            if (!best) return;
            const theirValue = getEffectivePower(best.theirs) + getEffectiveToughness(best.theirs);
            const currentBestValue = bestPair ? getEffectivePower(bestPair.theirs) + getEffectiveToughness(bestPair.theirs) : -1;
            const isBetter = !bestPair
              || (best.tier === 'clean' && bestTier !== 'clean')
              || (best.tier === bestTier && theirValue > currentBestValue);
            if (isBetter) { bestPair = { mine, theirs: best.theirs }; bestTier = best.tier; }
          });
          if (bestPair) {
            aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(bestPair.theirs), item: bestPair.theirs, fightWithItem: bestPair.mine };
          } else {
            validPlay = false;
            logMsg(`El Tano no encontró una pelea que le convenga con ${cardToPlay.name} y lo descartó.`);
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

      if (validPlay && tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card: cardToPlay,
          isLocal: false,
          targetObj: aiTargetObj,
          type: stackType,
          xValue: botXValue,
          kicked: botKicked
        });

        // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
        state.priorityPlayer = 'local';
        state.consecutivePasses = 0;
        // -----------------------------------------------
        
        logMsg(`⏳ El Tano puso ${cardToPlay.name} en la pila. Tenés la prioridad para responder.`);
        render();
        return; // Retorna para esperar resolución. El ciclo de prioridad continuará después.
      } else if (validPlay) {
        // Tenía target válido pero Ward le ganó la pulseada de maná: la carta ya se sacó de
        // la mano (se "gastó" igual, como en MTG real), va al cementerio sin efecto.
        state.rivalGraveyard.push(cardToPlay);
        state.priorityPlayer = 'local';
        state.consecutivePasses = 0;
        render();
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
          unit.attackTarget = chooseBotAttackTarget(unit);
          if (!hasKeyword(unit, 'vigilance')) {
            unit.tapped = true;
          }
          triggerCombatAbility(unit, 'attackTrigger', false);
          attackCount++;
          if (unit.attackTarget) {
            logMsg(`🔮 El Tano manda a ${unit.card.name} contra tu Planeswalker ${unit.attackTarget.card.name}.`);
          }
        } else {
          heldBackCount++;
        }
      }
    });

    if (heldBackCount > 0) logMsg(`🧠 El Tano decide guardar ${heldBackCount} criatura(s) atrás para defender.`);
    if (attackCount > 0) {
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s)!`);
      triggerAnyCreatureAttacks(false);
    }
    else logMsg("El Tano no atacó con nada.");
    state.rivalAttackersDeclaredThisTurn = attackCount;
    
    render();
    passPriority('rival'); // Termina de declarar atacantes
    return;
  }

  // 4. Fase de Declaración de Bloqueadores (Tu Turno)
  if (state.activePlayer === 'local' && state.phase === 'combat_blockers') {
    // Guard de idempotencia: si el Tano vuelve a tener prioridad en esta misma fase (ej.
    // después de usar un truco reactivo más abajo), no hay que volver a asignar bloqueos
    // desde cero — assignBotBlockers no sabe que ya corrió antes.
    const alreadyBlocked = state.rivalCombat.some(c => c.blockingIndex !== null && c.blockingIndex !== undefined);
    if (!alreadyBlocked) {
      assignBotBlockers(); // Llama a la lógica inteligente de combate
      render();
    }

    // ETAPA 1 (Grupo C, IA reactiva): con los bloqueos ya sobre la mesa, ¿hay alguno que
    // el Tano pueda salvar con un pump antes de que se calcule el daño?
    if (tryBotPostBlockTrick()) return;

    passPriority('rival');
    return;
  }

  // 5. Si no hizo nada de lo anterior, pasa prioridad
  passPriority('rival');
}
