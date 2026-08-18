import { hasKeyword, canBlock, predictDuel, getProtectionMatch } from './keywords.js';
import { recordTelemetryEvent } from './telemetry.js';
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
  putLoyaltyAbilityOnStack,
  detachEquipmentFrom,
  sendAurasToGraveyard,
  cleanupIfVehicle,
  triggerCreatureDies,
  triggerAnyCreatureDeath,
  triggerLandEtb,
  triggerSpellCast,
  chooseGraveyardCards,
  cardMatchesGraveyardFilter,
  chooseResolvedEffectTarget,
  getResolvedEffectTargetCandidates,
  waitForDiscardEffects,
  canPayCastCompositeNonManaCosts,
  payCastCompositeNonManaCosts,
  getCastingManaCostString,
  getCastCompositeCostBundle,
  passPriority // Importado del nuevo turnManager / main
} from './main.js';

import { moveBattlefieldCardToZone, moveCounteredStackItemToDestination, getActivatedAbilities, getGrantedAbilities, getActivatedAbilityTiming } from './utils.js';

import { assignBotBlockers, triggerCombatAbility, triggerAnyCreatureAttacks, queueDeclaredBlockTriggers, markDeclaredBlocks, checkDeaths } from './combatRules.js';
import { addToStack, spellStack, isStackItemLegalCounterTarget, resolveGameEffect, canResolveGameEffectWithoutTarget, canResolveGameEffectWithTarget } from './stackManager.js';

// Punto 14: affordability de una ruta de casteo completa. La vía alternativa reemplaza
// sólo el costo base; Kicker y additionalCost siguen sumándose. El piso de 5 de vida es
// estrategia del Tano, NO una regla del motor.
function canBotPayCastRoute(card, useAlternative = false, options = {}) {
  if (useAlternative && !card?.alternativeCost) return false;
  const manaCost = getCastingManaCostString(card, {
    useAlternative,
    kicked: !!options.kicked,
    baseOverride: options.baseOverride ?? null
  });
  if (!canRivalAfford({ manaCost })) return false;
  return canPayCastCompositeNonManaCosts(card, false, useAlternative, {
    excludeCard: options.excludeCard || null,
    lifeFloor: options.lifeFloor ?? 5
  });
}

function chooseBotCastRoute(card, options = {}) {
  if (canBotPayCastRoute(card, false, options)) return false;
  if (canBotPayCastRoute(card, true, options)) return true;
  return null;
}

async function payBotCastRoute(card, useAlternative = false, options = {}) {
  const manaCost = getCastingManaCostString(card, {
    useAlternative,
    kicked: !!options.kicked,
    baseOverride: options.baseOverride ?? null
  });
  if (manaCost) tapRivalLandsFor({ manaCost });
  await payCastCompositeNonManaCosts(card, false, useAlternative);
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

// 23.9.2 — el Tano usa el MISMO carril de Stack que el humano para Loyalty. Conserva su
// criterio de elección, pero la habilidad ya no resuelve "de costado": fija target, paga
// Lealtad, entra como abilityKind:"loyalty" y corta su turno para abrir prioridad.
async function tryActivateBotPlaneswalkers() {
  if (state.phase !== 'main1' && state.phase !== 'main2') return false;
  if (state.activePlayer !== 'rival' || state.priorityPlayer !== 'rival' || spellStack.length > 0) return false;

  for (const pwItem of state.rivalPlaneswalkers) {
    if (pwItem.abilityUsedThisTurn) continue;
    const abilities = pwItem.card.loyaltyAbilities || [];
    if (abilities.length === 0) continue;

    const canAfford = (a) => !(a.cost < 0 && pwItem.loyalty < Math.abs(a.cost));
    const hasValidTarget = (a) => {
      if (!a.effect) return false;
      const effectType = a.effect.type;
      if (['attach_equipment', 'fight', 'crew_vehicle'].includes(effectType)) return false;
      if (!a.requiresTarget) return canResolveGameEffectWithoutTarget(effectType);
      if (!canResolveGameEffectWithTarget(effectType)) return false;
      const sourceCard = { ...pwItem.card, name: `${pwItem.card.name} — ${a.name}` };
      return getResolvedEffectTargetCandidates({
        effect: a.effect,
        sourceCard,
        controllerIsLocal: false,
        chooserIsLocal: false,
        cardName: a.name
      }).length > 0;
    };
    const affordable = abilities.map((a, idx) => ({ a, idx })).filter(({ a }) => a.effect && canAfford(a) && hasValidTarget(a));
    if (affordable.length === 0) continue;

    const sorted = [...affordable].sort((x, y) => x.a.cost - y.a.cost);
    let chosen = sorted[0];
    if (pwItem.loyalty + chosen.a.cost <= 0 && affordable.some(({ a }) => a.cost > 0)) {
      chosen = affordable.find(({ a }) => a.cost > 0);
    }

    const ability = chosen.a;
    const sourceCard = { ...pwItem.card, name: `${pwItem.card.name} — ${ability.name}` };
    let targetObj = null;
    if (ability.requiresTarget) {
      // Igual que el humano: target primero, costo después.
      targetObj = await chooseResolvedEffectTarget({
        effect: ability.effect,
        sourceCard,
        sourceItem: pwItem,
        controllerIsLocal: false,
        chooserIsLocal: false,
        cardName: `${pwItem.card.name} — ${ability.name}`
      });
      if (!targetObj) continue;

      // La elección no debe poder pagar un costo sobre una ventana que cambió mientras el
      // selector estaba activo (defensivo; en Solitario normalmente todo es síncrono).
      if (state.gameOver || state.activePlayer !== 'rival' || state.priorityPlayer !== 'rival' ||
          (state.phase !== 'main1' && state.phase !== 'main2') || spellStack.length > 0 ||
          pwItem.abilityUsedThisTurn || !canAfford(ability)) continue;
    }

    putLoyaltyAbilityOnStack(pwItem, ability, chosen.idx, false, targetObj);
    logMsg(`🔮 El Tano puso "${ability.name}" de ${pwItem.card.name} en la pila.`);
    return true;
  }
  return false;
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
  toTap.forEach(s => {
    s.tapped = true;
    // HOTFIX 1.1 — misma regla que para el humano: si la fuente es de un solo uso,
    // pagar Ward también la sacrifica.
    if (s.card.sacrificeOnTap) performSacrifice(s, false);
  });
  logMsg(`🔶 El Tano pagó Ward ${wardCost} para que su hechizo pase igual.`);
  return true;
}

// Fuentes de maná del Tano: sus tierras + cualquier artefacto que produzca maná (mana
// rocks / Treasures) que no esté ya girado. Un solo lugar para juntarlas evita repetir
// este filtro en cada función de abajo.
function getRivalManaSources(excludeItems = []) {
  const excluded = new Set(excludeItems || []);
  const artifacts = state.rivalSupport.filter(s => s.card.produces || s.card.producesOptions);
  return [...state.rivalLands, ...artifacts].filter(item => !excluded.has(item));
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
async function tryFlashbackOrEscapeFromBotGraveyard() {
  if (state.phase !== 'main1') return false;

  const getAbility = (c) => {
    if (c.flashback) return { source: 'flashback', ability: c.flashback };
    if (c.escape) return { source: 'escape', ability: c.escape };
    return null;
  };

  const isUsable = (c) => {
    const meta = getAbility(c);
    if (!meta || !canBotPayCastRoute(c, false, { baseOverride: meta.ability.cost, excludeCard: null })) return false;
    if (meta.source === 'escape') {
      const exileCount = meta.ability.exileCount || 0;
      const extraCostExiles = getCastCompositeCostBundle(c, false).graveyardExiles.reduce((sum, spec) => sum + (spec.amount || 0), 0);
      const otherCount = state.rivalGraveyard.filter(g => g !== c).length;
      if (otherCount < exileCount + extraCostExiles) return false;
    }
    if (c.power !== undefined) return true; // criatura: siempre vale la pena recuperarla
    if (c.effect && ['destroy_creature', 'exile_creature', 'bounce'].includes(c.effect.type)) {
      return state.localCombat.some(u => isValidBotTarget(u, c.colors));
    }
    return true; // daño a la cara / robar / curarse siempre tienen destino válido
  };

  const idx = state.rivalGraveyard.findIndex(isUsable);
  if (idx === -1) return false;

  // 601.2a: la carta deja conceptualmente el cementerio al anunciar el casteo. Todavía
  // no se activó ninguna fuente ni se pagó nada.
  const card = state.rivalGraveyard.splice(idx, 1)[0];
  const { source, ability } = getAbility(card);

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

  // Objetivo fijado: recién ahora fuentes y pago.
  await payBotCastRoute(card, false, { baseOverride: ability.cost });

  // Escape paga su exilio como parte del commit de costos, después de fijar objetivos.
  if (source === 'escape') {
    const exileCount = ability.exileCount || 0;
    const chosen = await chooseGraveyardCards({
      zoneIsLocal: false, chooserIsLocal: false, filter: 'any', amount: exileCount,
      cardName: card.name, actionLabel: 'elegí cartas para pagar Escape', botStrategy: 'last'
    });
    chosen.forEach(c => {
      const gyIdx = state.rivalGraveyard.indexOf(c);
      if (gyIdx !== -1) state.rivalGraveyard.splice(gyIdx, 1);
    });
    state.rivalExile.push(...chosen);
    logMsg(`🌀 El Tano exilió ${chosen.length} carta(s) de su cementerio para el Escape de ${card.name}.`);
  }

  let stackType = 'spell';
  if (card.power !== undefined) stackType = 'summon';
  else if (card.type.includes('Planeswalker')) stackType = 'planeswalker';
  else if (card.type.includes('Instantáneo')) stackType = 'instant';

  const castStackItem = {
    card,
    isLocal: false,
    targetObj: aiTargetObj,
    type: stackType,
    castFrom: source
  };
  addToStack(castStackItem);
  logMsg(`🔄 El Tano usó ${source === 'escape' ? 'Escape' : 'Flashback'} en ${card.name}.`);
  await triggerSpellCast(false, card, castStackItem);
  if (!tryPayWardForBotTarget(aiTargetObj)) {
    const stackIndex = spellStack.indexOf(castStackItem);
    if (stackIndex >= 0) moveCounteredStackItemToDestination(spellStack.splice(stackIndex, 1)[0], state);
  }
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
      const supportTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
      const combatTargets = effect.type === 'destroy_artifact'
        ? state.localCombat.filter(c => c.card.type.includes('Artefacto') && isValidBotTarget(c, card.colors))
        : [];
      if (combatTargets.length > 0) {
        const best = combatTargets.reduce((prev, cur) =>
          (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
        );
        targetObj = { type: 'creature', isLocal: true, item: best };
      } else if (supportTargets.length > 0) {
        targetObj = { type: 'permanent', isLocal: true, item: supportTargets[0] };
      }
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
    } else if (effect.type === 'discard' || effect.type === 'private_zone_move') {
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

export function canRivalAfford(card, options = null) {
  const excludeItems = options?.excludeItems || [];
  if (!card.manaCost) return true;
  const cost = parseManaCost(card.manaCost);

  const fixed = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const duals = [];
  let totalMana = 0;

  getRivalManaSources(excludeItems).forEach(landItem => {
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

export function tapRivalLandsFor(card, options = null) {
  const excludeItems = options?.excludeItems || [];
  if (!card.manaCost) return;
  const cost = parseManaCost(card.manaCost);
  const colors = ['W', 'U', 'B', 'R', 'G'];
  const sources = getRivalManaSources(excludeItems);

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
async function tryBotCombatTrick() {
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

  const targetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(target), item: target };
  // Target fijado: recién ahora se compromete la carta y se activan fuentes.
  state.rivalHand.splice(cardIndex, 1);
  tapRivalLandsFor(card);

  const castStackItem = {
    card,
    isLocal: false,
    targetObj: targetObj,
    type: 'instant'
  };
  addToStack(castStackItem);
  await triggerSpellCast(false, card, castStackItem);
  if (!tryPayWardForBotTarget(targetObj)) {
    const idx = spellStack.indexOf(castStackItem);
    if (idx >= 0) moveCounteredStackItemToDestination(spellStack.splice(idx, 1)[0], state);
  }

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
async function tryBotPostBlockTrick() {
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

    const castStackItem = {
      card: pumpCard,
      isLocal: false,
      targetObj: { type: 'creature', isLocal: false, item: blocker, index: state.rivalCombat.indexOf(blocker) },
      type: 'instant'
    };
    addToStack(castStackItem);
    await triggerSpellCast(false, pumpCard, castStackItem);

    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;
    logMsg(`💪 ¡El Tano salvó a ${blocker.card.name} con "${pumpCard.name}" en medio del combate!`);
    render();
    return true;
  }
  return false;
}

export async function checkRivalCounterOrResponse() {
  // FASE 4, ETAPA 4: durante una partida multiplayer real (state.currentMatch existe), el
  // "rival" es una persona de verdad con su propio cliente — nunca este código decide por
  // ella. Se blinda ACÁ, en la entrada, en vez de en cada uno de los 6 lugares de main.js
  // que llaman a esto: así queda protegido sin importar desde dónde se lo llame, incluso si
  // en el futuro se agrega un séptimo lugar y alguien se olvida de este chequeo ahí.
  if (state.currentMatch) return false;
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
      return (c.type.includes('Instantáneo') || hasFlash) && c.effect?.type === 'grant_keyword_temp' && c.effect.keyword === 'hexproof' && chooseBotCastRoute(c, { excludeCard: c }) !== null;
    });
    if (protectIndex !== -1) {
      const protectCard = state.rivalHand.splice(protectIndex, 1)[0];
      const savedCreature = threatened.targetObj.item;
      const useAlternative = chooseBotCastRoute(protectCard);
      if (useAlternative === null) { state.rivalHand.splice(protectIndex, 0, protectCard); return false; }
      await payBotCastRoute(protectCard, useAlternative);
      const castStackItem = {
        card: protectCard,
        isLocal: false,
        targetObj: { type: 'creature', isLocal: false, item: savedCreature, index: state.rivalCombat.indexOf(savedCreature) },
        type: 'instant'
      };
      addToStack(castStackItem);
      await triggerSpellCast(false, protectCard, castStackItem);
      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(`🛡️ ¡El Tano protegió a ${savedCreature.card.name} con "${protectCard.name}" antes de que le hicieras algo!`);
      render();
      return true;
    }
  }

  const responseIndex = state.rivalHand.findIndex(c => {
    const hasFlash = c.keywords && c.keywords.includes('flash');
    if (!(c.type.includes('Instantáneo') || hasFlash) || chooseBotCastRoute(c, { excludeCard: c }) === null) return false;

    if (isCounterSpell(c)) {
      // Un counter normal solo le sirve al Tano contra HECHIZOS (nunca habilidades) a
      // menos que la carta lo diga explícitamente — misma regla real de MTG.
      return spellStack.some(s => s.isLocal && isStackItemLegalCounterTarget(c.effect.type, s));
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
    const responseCard = state.rivalHand[responseIndex];
    const useAlternative = chooseBotCastRoute(responseCard, { excludeCard: responseCard });
    if (useAlternative === null) return false;

    // CR 601: targetear la Stack/campo ANTES de comprometer carta, fuentes o costos.
    let targetObj = null;
    if (isCounterSpell(responseCard)) {
      const topLocalSpell = [...spellStack].reverse().find(s => s.isLocal && isStackItemLegalCounterTarget(responseCard.effect.type, s));
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

    if (responseCard.requiresTarget && !targetObj) return false;

    state.rivalHand.splice(responseIndex, 1);
    await payBotCastRoute(responseCard, useAlternative);

    const castStackItem = {
      card: responseCard,
      isLocal: false,
      targetObj: targetObj,
      // Un permanente con Flash (artefacto/criatura) tiene que entrar al campo como
      // corresponde, no resolverse como si fuera un hechizo de una sola vez — antes esto
      // estaba fijo en 'instant' sin importar qué era la carta.
      type: responseCard.power !== undefined ? 'summon'
          : (responseCard.type.includes('Artefacto') || responseCard.type.includes('Encantamiento')) ? 'permanent'
          : 'instant'
    };
    addToStack(castStackItem);
    await triggerSpellCast(false, responseCard, castStackItem);
    if (!tryPayWardForBotTarget(targetObj)) {
      const idx = spellStack.indexOf(castStackItem);
      if (idx >= 0) moveCounteredStackItemToDestination(spellStack.splice(idx, 1)[0], state);
    }

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
function tryBotCrewVehicle(vehicleItem, zoneType, ability = getActivatedAbilities(vehicleItem.card).find(ab => ab.crewCost !== undefined)) {
  if (state.phase !== 'main1') return false; // mismo criterio de timing que ya tenía

  const required = ability?.crewCost;
  if (required === undefined) return false;
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
  if (powerSoFar < required) return false; // no le alcanza el poder disponible para tripularlo

  const originZone = zoneType === 'land' ? state.rivalLands : state.rivalSupport;
  const vIdx = originZone.indexOf(vehicleItem);
  if (vIdx === -1) return false;

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
  return true;
}

// Punto 12: mismo contrato de timing para el Tano. Sin campo conserva la regla legacy;
// `sorcery` exige propia Main + pila vacía; `instant` sólo exige que el Tano tenga prioridad.
function botAbilityTimingAllowed(ability, { instantOnly = false } = {}) {
  if (!ability || state.gameOver || state.priorityPlayer !== 'rival') return false;
  const timing = getActivatedAbilityTiming(ability);
  if (timing === 'invalid') return false;
  const intrinsicSorceryOnly = ability.crewCost !== undefined || ability.effect?.type === 'crew_vehicle' || ability.effect?.type === 'attach_equipment';
  if (intrinsicSorceryOnly && timing === 'instant') return false;
  if (instantOnly && timing !== 'instant') return false;
  if (timing === 'instant') return true;
  const ownMain = state.activePlayer === 'rival' && (state.phase === 'main1' || state.phase === 'main2');
  if (!ownMain) return false;
  if (timing === 'sorcery') return spellStack.length === 0;
  return true;
}

// NUEVO: Evaluación táctica para activar artefactos y soporte
export function tryActivateBotAbilities({ instantOnly = false } = {}) {
  // Recorremos artefactos Y tierras de utilidad del Tano. Cada permanente puede exponer
  // varias habilidades propias; el Tano evalúa cada opción hasta encontrar una conveniente.
  const candidates = [
    ...state.rivalSupport.map((item, idx) => ({ item, index: idx, zoneType: 'support' })),
    ...state.rivalLands.map((item, idx) => ({ item, index: idx, zoneType: 'land' }))
  ];

  candidateLoop:
  for (const { item: supportItem, index: i, zoneType } of candidates) {
    const card = supportItem.card;
    const abilities = getActivatedAbilities(card);
    if (abilities.length === 0) continue;

    // Punto 13: una Tierra puede producir maná Y tener habilidades utility. Ya no se
    // descarta como candidata por tener `produces`; la IA evalúa la habilidad igual que
    // cualquier otra, reservando la propia Tierra si el costo incluye {T}.

    for (let abilityIndex = 0; abilityIndex < abilities.length; abilityIndex++) {
      const ability = abilities[abilityIndex];
      if (!ability) continue;
      if (!botAbilityTimingAllowed(ability, { instantOnly })) continue;

      if (ability.crewCost !== undefined) {
        const crewed = tryBotCrewVehicle(supportItem, zoneType, ability);
        if (crewed) continue candidateLoop; // el objeto ya se movió a Combat
        continue;
      }

      const costStr = ability.cost || '';
      const requiresTap = costStr.includes('{T}');
      if (requiresTap && supportItem.tapped) continue;

      const manaCostString = costStr.replace('{T}', '').replace(',', '').trim();
      const dummyCardForCost = { manaCost: manaCostString || null };
      const reservedManaSources = requiresTap ? [supportItem] : [];
      if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost, { excludeItems: reservedManaSources })) continue;
      const timing = getActivatedAbilityTiming(ability);
      // Sin costo, sin {T} y sin sacrificio, una habilidad instantánea repetible podría hacer
      // que la IA se auto-encadene para siempre cada vez que recupera prioridad. El jugador
      // humano puede usarla; el Tano no la spamea automáticamente.
      if (instantOnly && !requiresTap && !dummyCardForCost.manaCost && !ability.sacrifice) continue;

      if (ability.sacrifice === 'creature' && state.rivalCombat.length === 0) continue;
      if (ability.sacrifice === 'artifact' && !state.rivalSupport.some(s => s.card.type.includes('Artefacto'))) continue;

      let shouldActivate = false;
      let aiTargetObj = null;
      const effect = ability.effect || {};

      if (effect.type === 'crew_vehicle') {
        if (state.phase === 'main1') shouldActivate = true;
      }
      else if (effect.type === 'attach_equipment') {
        if (state.phase === 'main1' && state.rivalCombat.length > 0) {
          const bestTargets = state.rivalCombat.filter(c => !c.tapped);
          if (bestTargets.length > 0) {
            const chosen = bestTargets.reduce((prev, current) =>
              (getEffectivePower(prev) > getEffectivePower(current)) ? prev : current
            );
            if (supportItem.attachedTo === chosen) continue;
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
            shouldActivate = true;
          }
        }
      }
      else if (effect.type === 'heal' || effect.type === 'draw') {
        const instantReason = timing === 'instant' && (
          (effect.type === 'heal' && state.rivalHP <= 12) ||
          (effect.type === 'draw' && state.rivalHand.length <= 3)
        );
        if (state.phase === 'main2' || instantReason) {
          aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
          shouldActivate = true;
        }
      }
      else if (effect.type === 'damage') {
        if (state.localCombat.length > 0) {
          const vulnerable = state.localCombat.find(c =>
            isValidBotTarget(c, card.colors) && getEffectiveToughness(c) <= effect.amount
          );
          if (vulnerable) {
            aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable };
            shouldActivate = true;
          }
        }
        if (!shouldActivate && (state.phase === 'main2' || (timing === 'instant' && state.localHP <= effect.amount))) {
          aiTargetObj = { type: 'player', isLocal: true };
          shouldActivate = true;
        }
      }
      else if (effect.type === 'ramp') {
        if (state.phase === 'main1' && state.rivalLands.length < 6) shouldActivate = true;
      }
      else if (effect.type === 'return_from_graveyard') {
        const hasCandidate = state.rivalGraveyard.some(c => cardMatchesGraveyardFilter(c, effect.filter || 'any'));
        if (hasCandidate && (state.phase === 'main2' || timing === 'instant')) shouldActivate = true;
      }
      else if (effect.type === 'draw_and_lose_life') {
        if ((state.phase === 'main2' || (timing === 'instant' && state.rivalHand.length <= 3)) && state.rivalHP > 8) shouldActivate = true;
      }

      if (!shouldActivate) continue;

      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost, { excludeItems: reservedManaSources });
      if (requiresTap) supportItem.tapped = true;

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

      if (tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card,
          isLocal: false,
          targetObj: aiTargetObj,
          type: 'ability',
          source: { type: 'support_activation', index: i, abilityIndex },
          sourceItem: supportItem,
          ability
        });
      }

      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(`⚙️ El Tano activó una habilidad de ${card.name}. Tenés prioridad para responder.`);
      render();
      return true;
    }
  }
  return false;
}

// NUEVO: El Tano usa las habilidades que un Equipo le presta a una criatura que ya tiene puesta
// (ej. Facón de Plata equipado: "{T}: hace 2 de daño"). Es la contraparte de tryActivateBotAbilities
// pero mirando las criaturas equipadas en vez de los permanentes de soporte.
export function tryActivateGrantedBotAbilities({ instantOnly = false } = {}) {
  for (let i = 0; i < state.rivalCombat.length; i++) {
    const creatureItem = state.rivalCombat[i];
    const supportZone = state.rivalSupport;
    const options = [];

    // Punto 11: la criatura conserva TODAS sus habilidades propias y además TODAS las
    // habilidades prestadas por cada Equipo. Tripular se omite porque un Vehículo ya está
    // en Combat y esa habilidad sólo se usa desde Support/Tierras.
    getActivatedAbilities(creatureItem.card).forEach((ability, abilityIndex) => {
      if (ability.crewCost !== undefined) return;
      options.push({ ability, abilityIndex, sourceCard: creatureItem.card, sourceItem: creatureItem, sourceIndex: i, abilityKind: 'own' });
    });
    supportZone.forEach((equipment, equipIndex) => {
      if (equipment.attachedTo !== creatureItem) return;
      getGrantedAbilities(equipment.card).forEach((ability, abilityIndex) => {
        options.push({ ability, abilityIndex, sourceCard: equipment.card, sourceItem: equipment, sourceIndex: equipIndex, abilityKind: 'granted' });
      });
    });

    for (const option of options) {
      const { ability, abilityIndex, sourceCard, sourceItem, sourceIndex, abilityKind } = option;
      if (!botAbilityTimingAllowed(ability, { instantOnly })) continue;
      const costStr = ability.cost || '';
      const requiresTap = costStr.includes('{T}');
      if (requiresTap && (creatureItem.tapped || creatureItem.summoningSickness)) continue;

      const manaCostString = costStr.replace('{T}', '').replace(',', '').trim();
      const dummyCardForCost = { manaCost: manaCostString || null };
      if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;
      const timing = getActivatedAbilityTiming(ability);
      if (instantOnly && !requiresTap && !dummyCardForCost.manaCost && !ability.sacrifice) continue;

      if (ability.sacrifice === 'creature' && state.rivalCombat.filter(c => c !== creatureItem).length === 0) continue;
      if (ability.sacrifice === 'artifact' && !state.rivalSupport.some(s => s.card.type.includes('Artefacto'))) continue;

      let shouldActivate = false;
      let aiTargetObj = null;
      const effect = ability.effect || {};

      if (effect.type === 'damage') {
        const vulnerable = state.localCombat.find(c =>
          isValidBotTarget(c, sourceCard.colors) && getEffectiveToughness(c) <= effect.amount
        );
        if (vulnerable) {
          aiTargetObj = ability.requiresTarget ? { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable } : null;
          shouldActivate = true;
        } else if (state.phase === 'main2' || (timing === 'instant' && state.localHP <= effect.amount)) {
          aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: true } : null;
          shouldActivate = true;
        }
      } else if (effect.type === 'heal' || effect.type === 'draw') {
        const instantReason = timing === 'instant' && (
          (effect.type === 'heal' && state.rivalHP <= 12) ||
          (effect.type === 'draw' && state.rivalHand.length <= 3)
        );
        if (state.phase === 'main2' || instantReason) {
          aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
          shouldActivate = true;
        }
      } else if (effect.type === 'cant_attack_next_turn') {
        const validTargets = state.localCombat.filter(c => isValidBotTarget(c, sourceCard.colors));
        if (validTargets.length > 0 && (state.phase === 'main2' || state.activePlayer === 'local')) {
          const chosen = validTargets.reduce((prev, current) =>
            (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
          );
          aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(chosen), item: chosen };
          shouldActivate = true;
        }
      } else if (effect.type === 'return_from_graveyard') {
        const hasCandidate = state.rivalGraveyard.some(c => cardMatchesGraveyardFilter(c, effect.filter || 'any'));
        if (hasCandidate && (state.phase === 'main2' || timing === 'instant')) shouldActivate = true;
      } else if (effect.type === 'fight') {
        const candidates = state.localCombat.filter(c => isValidBotTarget(c, creatureItem.card.colors));
        const best = bestFightTargetFor(creatureItem, candidates);
        if (best) {
          aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(best.theirs), item: best.theirs };
          shouldActivate = true;
        }
      }

      if (!shouldActivate) continue;

      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) creatureItem.tapped = true;

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
        // Conserva la semántica histórica de una habilidad activada desde criatura:
        // "self" refiere a la criatura que está usando la habilidad.
        performSacrifice(creatureItem, false);
      }

      if (tryPayWardForBotTarget(aiTargetObj)) {
        addToStack({
          card: sourceCard,
          isLocal: false,
          targetObj: aiTargetObj,
          type: 'ability',
          source: { type: abilityKind === 'own' ? 'support_activation' : 'equipped_activation', index: sourceIndex, abilityIndex },
          sourceItem,
          ability
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

// 23.11.3 — PRE-FLIGHT FORMAL DEL TANO PARA MAIN PHASE.
// Antes el selector principal sólo filtraba "pagable" y recién DESPUÉS de elegir una carta
// descubría si realmente existían los objetivos/condiciones que su heurística exigía. Si esa
// propuesta fallaba, el viejo `return` podía dejar la prioridad en `rival` sin callback futuro.
// Este pre-flight NO paga, NO saca la carta de la mano y NO publica nada: sólo responde si la
// carta puede convertirse AHORA en una propuesta de casteo legal/útil según los criterios que
// el propio Tano ya usa más abajo.
function resolveBotModalVariantForPreflight(card) {
  if (!card?.modal || !Array.isArray(card.modes) || card.modes.length === 0) return card;
  const chosenMode = card.modes[chooseBotMode(card)];
  return { ...card, effect: chosenMode.effect, requiresTarget: chosenMode.requiresTarget, chosenModeText: chosenMode.text };
}

function canBotBuildMainPhaseCastProposal(rawCard) {
  const card = resolveBotModalVariantForPreflight(rawCard);
  if (!card) return false;

  // Auras: replicamos exactamente el criterio del casteo real (maldición rival vs buff propio).
  if (card.adjunta) {
    if (card.alcance === 'criatura_rival') {
      return state.localCombat.some(c => isValidBotTarget(c, card.colors));
    }
    const grantedKeywords = getKeywordsGrantedByPendingSpell(card);
    return state.rivalCombat.some(c => !grantedKeywords.some(k => hasKeyword(c, k)));
  }

  // Todos los targets múltiples tienen que existir antes de que la carta compita por ser elegida.
  if (card.multiTarget && Array.isArray(card.targets) && card.targets.length > 0) {
    return Boolean(chooseBotMultiTargets(card));
  }

  // Criaturas/Planeswalkers sin ETB target no necesitan otra validación de target para castearse.
  if (card.power !== undefined || card.type?.includes('Planeswalker')) return true;

  const isPermanent = card.type?.includes('Artefacto') || (card.type?.includes('Encantamiento') && !card.adjunta);
  if (isPermanent && card.requiresTarget && card.etbEffect) {
    return getResolvedEffectTargetCandidates({
      effect: card.etbEffect,
      sourceCard: card,
      controllerIsLocal: false,
      chooserIsLocal: false,
      cardName: card.name
    }).length > 0;
  }

  if (!card.requiresTarget) return true;
  const effect = card.effect || {};

  // Efectos cuyo target siempre puede ser un jugador adecuado.
  if (['damage', 'heal', 'poison', 'discard', 'private_zone_move', 'prevent_attack'].includes(effect.type)) return true;

  // El Tano históricamente no desperdicia odio de cementerio sobre un cementerio vacío.
  if (effect.type === 'exile_graveyard') return state.localGraveyard.length > 0;

  // Remoción/freno: su heurística sólo los usa sobre una criatura rival válida.
  if (['destroy_creature', 'exile_creature', 'exile_and_return', 'bounce', 'cant_attack_next_turn'].includes(effect.type)) {
    return state.localCombat.some(c => isValidBotTarget(c, card.colors));
  }

  // Buff/protección: sólo sobre una criatura propia real.
  if (effect.type === 'pump' || effect.type === 'grant_keyword_temp') return state.rivalCombat.length > 0;
  if (effect.type === 'add_counter') {
    if (effect.counterType === 'minusOne') return state.localCombat.some(c => isValidBotTarget(c, card.colors));
    return state.rivalCombat.length > 0;
  }

  // Fight agrega una condición estratégica: no basta con que haya dos criaturas; tiene que
  // existir al menos una pareja que el Tano considere una pelea aceptable.
  if (effect.type === 'fight') {
    const validTargets = state.localCombat.filter(c => isValidBotTarget(c, card.colors));
    return state.rivalCombat.some(mine => Boolean(bestFightTargetFor(mine, validTargets)));
  }

  if (effect.type === 'destroy_artifact') {
    return state.localCombat.some(c => c.card.type.includes('Artefacto') && isValidBotTarget(c, card.colors))
      || state.localSupport.some(s => s.card.type.includes('Artefacto'));
  }
  if (effect.type === 'destroy_enchantment') {
    return state.localSupport.some(s => s.card.type.includes('Encantamiento'));
  }

  // Cinturón genérico para futuros efectos targeteados: si el contrato universal sabe
  // enumerar al menos un target legal, la propuesta puede competir. Si no, queda afuera.
  return getResolvedEffectTargetCandidates({
    effect,
    sourceCard: card,
    controllerIsLocal: false,
    chooserIsLocal: false,
    cardName: card.name
  }).length > 0;
}

// NUEVO: SISTEMA DE PRIORIDAD DEL BOT (Remplaza startRivalTurn)
export async function takeBotPriorityAction() {
  // FASE 4, ETAPA 4: mismo criterio que checkRivalCounterOrResponse acá arriba — durante
  // una partida multiplayer real, "esperar la jugada real del rival" significa exactamente
  // NO HACER NADA acá. El otro cliente (el de la persona de verdad) es quien procesa su
  // propia prioridad y publica el resultado — este cliente solo lo refleja (ver
  // startListeningToMatch, Etapa 3), nunca lo simula.
  if (state.currentMatch) return;
  if (state.gameOver || state.priorityPlayer !== 'rival') return;

  await sleep(600); // El Tano "piensa"

  // 1. Responder a la pila
  if (spellStack.length > 0) {
    const responded = await checkRivalCounterOrResponse();
    if (responded) return;
    // Punto 12: una habilidad `instant` también es una respuesta válida a la pila; hasta
    // ahora la IA sólo miraba cartas de la mano en esta ventana.
    if (tryActivateBotAbilities({ instantOnly: true })) return;
    if (tryActivateGrantedBotAbilities({ instantOnly: true })) return;
    logMsg(`👁️ El Tano revisó su mano y sus habilidades, no tiene respuestas y pasa prioridad.`);
    passPriority('rival');
    return;
  }

  // 1.5. Truco de combate: si vos declarás atacantes y la pila está vacía, el Tano puede
  // quemar a uno antes de que se asignen bloqueos.
  if (state.phase === 'combat_attackers' && state.activePlayer === 'local') {
    const trickUsed = await tryBotCombatTrick();
    if (trickUsed) return;
  }

  // Punto 12: con la pila vacía, el Tano también puede usar habilidades explícitamente
  // instantáneas durante upkeep/draw/combat/end step o en el turno humano.
  if (tryActivateBotAbilities({ instantOnly: true })) return;
  if (tryActivateGrantedBotAbilities({ instantOnly: true })) return;

  // 2. Acciones de Fase Principal (Solo en el turno del Tano)
  if (state.activePlayer === 'rival' && (state.phase === 'main1' || state.phase === 'main2')) {
    
    // Intentar bajar tierra
    const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
    if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
      const landCard = state.rivalHand.splice(landIndex, 1)[0];
      const entersTapped = !!landCard.entersTapped;
      const landItem = { card: landCard, tapped: entersTapped };
      state.rivalLands.push(landItem); 
      state.rivalLandPlayedThisTurn = true;
      logMsg(entersTapped ? `El Tano bajó una tierra: ${landCard.name} (entra girada).` : `El Tano bajó una tierra: ${landCard.name}.`); 
      // PUNTO 2: el Tano dispara el mismo evento Landfall que el jugador humano.
      await triggerLandEtb(false, landCard, landItem);
      render(); 
      await sleep(800);
    }

    // Planeswalkers propios: si activa Loyalty, ahora entra a la Stack y el Tano corta acá
    // para abrir la ventana de prioridad antes de seguir jugando su Main.
    if (await tryActivateBotPlaneswalkers()) {
      render();
      return;
    }

    // Flashback o Escape desde su propio cementerio: si tiene algo pagable, lo usa antes de
    // seguir con el resto de sus decisiones — esto SÍ pasa por la pila (a diferencia de
    // Lealtad), así que cortamos acá para esperar a que resuelva.
    if (await tryFlashbackOrEscapeFromBotGraveyard()) return;

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
        // Punto 14: affordability de la ruta COMPLETA. Incluye maná adicional y todos los
        // componentes no-maná; si el normal no alcanza, contempla la vía alternativa.
        if (chooseBotCastRoute(c, { excludeCard: c }) === null) return;
        if (isCounterSpell(c)) return;
        // 23.11.3: una carta pagable no alcanza. Si no puede formar una propuesta legal/útil
        // con sus targets actuales, ni siquiera compite en la selección de Main.
        if (!canBotBuildMainPhaseCastProposal(c)) return;
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
      // 23.10 / CR 601: se aparta conceptualmente la carta al anunciarla, pero no se
      // activan fuentes ni se pagan costos hasta fijar modo/ruta/X/Kicker y objetivos.
      const originalCardToPlay = state.rivalHand[affordableIndex];
      let cardToPlay = originalCardToPlay;

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

      // Punto 14: primero fija la vía de costo. El Tano conserva su preferencia histórica:
      // paga normal si puede; sólo usa alternativa si la normal no alcanza.
      const useAlternative = chooseBotCastRoute(cardToPlay);
      if (useAlternative === null) {
        // Defensa ante un cambio de estado inesperado entre evaluación y compromiso. Como la
        // carta todavía NO salió de la mano, el rewind es gratis. Lo importante: nunca dejamos
        // la prioridad del bot huérfana.
        recordTelemetryEvent('bot_cast_proposal_rejected', { cardId: originalCardToPlay?.id || null, cardName: originalCardToPlay?.name || null, reason: 'route_became_unpayable', phase: state.phase });
        passPriority('rival');
        return;
      }

      // Kicker sigue siendo ADICIONAL a cualquiera de las dos vías. Antes elegir alternativa
      // podía borrar accidentalmente el Kicker; ahora se prueba contra la ruta ya elegida.
      let botKicked = false;
      if (cardToPlay.kicker && canBotPayCastRoute(cardToPlay, useAlternative, { kicked: true })) {
        botKicked = true;
        logMsg(`💪 El Tano pagó también el Kicker de ${cardToPlay.name}.`);
      }

      // 601.2b: X queda anunciado antes de objetivos y antes de activar fuentes.
      const routeManaCost = getCastingManaCostString(cardToPlay, { useAlternative, kicked: botKicked });
      let botXValue = null;
      if (routeManaCost && routeManaCost.includes('{X}')) {
        const manaSourceCard = { ...cardToPlay, manaCost: routeManaCost };
        botXValue = chooseBotXValue(manaSourceCard);
        logMsg(`✨ El Tano eligió X = ${botXValue} para ${cardToPlay.name}.`);
      }

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
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y no lo lanzó.`);
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
            logMsg(`El Tano no tenía ninguna criatura que se beneficiara de ${cardToPlay.name} y no lo lanzó.`);
          }
        } else {
          validPlay = false;
          logMsg(`El Tano no tenía criaturas para encantar con ${cardToPlay.name} y no lo lanzó.`);
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
            logMsg(`El Tano no encontró objetivos válidos para todos los modos de ${cardToPlay.name} y no lo lanzó.`);
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
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y no lo lanzó.`);
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
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y no lo lanzó.`);
          }
        }
        // LÓGICA NUEVA: DESCARTE (Corralito, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'discard') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // 23.10.1: Hand/Deck rival se TARGETEA como jugador durante casteo. La
        // identidad de la carta privada se elegirá recién cuando el hechizo resuelva.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'private_zone_move') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: EXILIAR CEMENTERIO — el Tano se lo tira a quien tenga más cartas
        // ahí (normalmente vos); si el rival tiene el cementerio vacío, mejor ni gastarla.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'exile_graveyard') {
          if (state.localGraveyard.length > 0) {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            validPlay = false;
            logMsg(`El Tano no encontró un cementerio que valiera la pena exiliar y no lanzó ${cardToPlay.name}.`);
          }
        }
        // 23.9.3: impedir que UNA criatura ataque en el próximo turno de su controlador.
        else if (cardToPlay.effect && cardToPlay.effect.type === 'cant_attack_next_turn') {
          const validTargets = state.localCombat.filter(c => isValidBotTarget(c, cardToPlay.colors));
          if (validTargets.length > 0) {
            const chosen = validTargets.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen, index: state.localCombat.indexOf(chosen) };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía criaturas válidas para frenar con ${cardToPlay.name} y no lo lanzó.`);
          }
        }
        // PREVENIR COMBATE GLOBAL (Cuarentena Total)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'prevent_attack') {
          // El Tano te lo tira a vos para frenar tu próximo ataque completo.
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
            logMsg(`El Tano no tenía criaturas para reforzar con ${cardToPlay.name} y no lo lanzó.`);
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
              logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y no lo lanzó.`);
              }
          } else if (state.rivalCombat.length > 0) {
            const chosen = state.rivalCombat.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía criaturas para reforzar con ${cardToPlay.name} y no lo lanzó.`);
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
            logMsg(`El Tano no tenía criaturas para proteger con ${cardToPlay.name} y no lo lanzó.`);
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
            logMsg(`El Tano no encontró una pelea que le convenga con ${cardToPlay.name} y no lo lanzó.`);
          }
        }
        // LÓGICA NUEVA: DESTRUIR PERMANENTE (Piedrazo a la Vidriera / Yuyerío Salvaje)
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_artifact' || cardToPlay.effect.type === 'destroy_enchantment')) {
          const filterType = cardToPlay.effect.type === 'destroy_artifact' ? 'Artefacto' : 'Encantamiento';
          const supportTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
          const combatTargets = cardToPlay.effect.type === 'destroy_artifact'
            ? state.localCombat.filter(c => c.card.type.includes('Artefacto') && isValidBotTarget(c, cardToPlay.colors))
            : [];
          if (combatTargets.length > 0) {
            const best = combatTargets.reduce((prev, cur) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(cur) + getEffectiveToughness(cur)) ? prev : cur
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: best };
          } else if (supportTargets.length > 0) {
            aiTargetObj = { type: 'permanent', isLocal: true, item: supportTargets[0] };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y no lo lanzó.`);
          }
        }
      }

      if (!validPlay) {
        // 601.2e: propuesta ilegal -> rewind completo. En 23.11.3 la carta ni siquiera salió
        // de la mano. Este camino debería ser excepcional porque el pre-flight ya filtró las
        // propuestas conocidas; aun así, el fail-safe SIEMPRE devuelve la prioridad y jamás
        // vuelve a dejar al Tano congelado.
        recordTelemetryEvent('bot_cast_proposal_rejected', { cardId: originalCardToPlay?.id || null, cardName: originalCardToPlay?.name || null, reason: 'late_target_revalidation_failed', phase: state.phase });
        render();
        passPriority('rival');
        return;
      }

      // 601.2f-g-h: recién AHORA la propuesta quedó cerrada. Se retira la carta real de la
      // mano y, desde este punto, se comprometen fuentes/costos y el objeto entra a Stack.
      const committedHandIndex = state.rivalHand.indexOf(originalCardToPlay);
      if (committedHandIndex < 0) {
        recordTelemetryEvent('bot_cast_proposal_rejected', { cardId: originalCardToPlay?.id || null, cardName: originalCardToPlay?.name || null, reason: 'card_missing_before_commit', phase: state.phase });
        passPriority('rival');
        return;
      }
      state.rivalHand.splice(committedHandIndex, 1);

      // 601.2f-g-h: con objetivos ya legales se fija el total, se activan fuentes y se paga.
      if (routeManaCost && routeManaCost.includes('{X}')) {
        const effectiveManaCost = routeManaCost.replace('{X}', Array(botXValue || 0).fill('{1}').join(''));
        tapRivalLandsFor({ manaCost: effectiveManaCost });
        await payCastCompositeNonManaCosts(cardToPlay, false, useAlternative);
      } else {
        await payBotCastRoute(cardToPlay, useAlternative, { kicked: botKicked });
      }
      if (useAlternative) logMsg(`🔀 El Tano pagó ${cardToPlay.name} por su costo alternativo.`);

      const castStackItem = {
        card: cardToPlay,
        isLocal: false,
        targetObj: aiTargetObj,
        type: stackType,
        xValue: botXValue,
        kicked: botKicked
      };
      addToStack(castStackItem);
      await triggerSpellCast(false, cardToPlay, castStackItem);

      // Ward es posterior al casteo. Aún se resuelve como prompt simplificado (no trigger
      // separado en Stack), pero ya no evita que el hechizo haya sido casteado primero.
      if (!tryPayWardForBotTarget(aiTargetObj)) {
        const stackIndex = spellStack.indexOf(castStackItem);
        if (stackIndex >= 0) {
          const [counteredItem] = spellStack.splice(stackIndex, 1);
          moveCounteredStackItemToDestination(counteredItem, state);
        }
      }

      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      logMsg(`⏳ El Tano puso ${cardToPlay.name} en la pila. Tenés la prioridad para responder.`);
      render();
      return;
    }
  }

  // 3. Fase de Declaración de Atacantes (Turno del Tano)
  if (state.activePlayer === 'rival' && state.phase === 'combat_attackers') {
    // 23.7.1: si ya declaró atacantes y recupera prioridad en este mismo paso después de
    // resolver un trigger, no vuelve a declarar ni a disparar anyCreatureAttacks.
    if ((state.rivalAttackersDeclaredThisTurn || 0) > 0) {
      passPriority('rival');
      return;
    }

    let attackCount = 0;
    let heldBackCount = 0;
    for (const unit of state.rivalCombat) {
      if (hasKeyword(unit, 'defender')) continue;
      const attackLock = (state.activeEffects || []).find(effect =>
        effect.effectType === 'cant_attack_next_turn' &&
        effect.targetPlayer === 'rival' &&
        effect.appliesThisCombat === true &&
        effect.targetObjectId && effect.targetObjectId === unit._effectObjectId
      );
      if (attackLock) {
        logMsg(`🚫 ${unit.card.name} no puede atacar en este combate por ${attackLock.sourceName || 'un efecto'}.`);
        continue;
      }

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
    }

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
    // 23.9.3: la declaración del Tano también es idempotente si bloqueó CERO criaturas.
    // Inferirlo mirando blockingIndex fallaba exactamente en ese caso.
    if (!state.rivalBlockersDeclaredThisCombat) {
      assignBotBlockers(); // Llama a la lógica inteligente de combate
      markDeclaredBlocks(state.localCombat, state.rivalCombat);
      state.rivalBlockersDeclaredThisCombat = true;
      recordTelemetryEvent('blockers_declared', {
        player: 'rival', turnCount: state.turnCount, activePlayer: state.activePlayer, phase: state.phase,
        blockerCount: state.rivalCombat.filter(unit => unit.blockingIndex !== null && unit.blockingIndex !== undefined).length
      });
      queueDeclaredBlockTriggers(state.rivalCombat, false);
      render();
    }

    // ETAPA 1 (Grupo C, IA reactiva): con los bloqueos ya sobre la mesa, ¿hay alguno que
    // el Tano pueda salvar con un pump antes de que se calcule el daño?
    if (await tryBotPostBlockTrick()) return;

    passPriority('rival');
    return;
  }

  // 5. Si no hizo nada de lo anterior, pasa prioridad
  passPriority('rival');
}
