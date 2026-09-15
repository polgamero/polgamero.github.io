// js/botStrategy.js — 23.21.6 HF15
// Heurísticas puras para que Medio/Difícil no conviertan habilidades instantáneas de valor
// en un "tap out" automático antes de su propia fase principal, y para que el descarte/recuperación
// de cementerio respeten valor, sinergia y presión de mano.

export const BOT_STRATEGY_HF15_VERSION = '23.21.6-hf15';

const NONURGENT_VALUE_EFFECTS = new Set([
  'return_from_graveyard', 'return_lands_from_graveyard', 'return_all_lands_from_graveyard',
  'draw', 'draw_and_lose_life', 'search_library', 'look_at_top'
]);

export function isNonUrgentBotValueEffect(effectType) {
  return NONURGENT_VALUE_EFFECTS.has(String(effectType || ''));
}

export function projectedBotHandGain(effect = {}, eligibleCount = 0) {
  const type = String(effect?.type || '');
  if (type === 'return_all_lands_from_graveyard') return Math.max(0, Number(eligibleCount) || 0);
  if (type === 'return_from_graveyard' || type === 'return_lands_from_graveyard' || type === 'draw' || type === 'draw_and_lose_life') {
    return Math.max(1, Math.floor(Number(effect?.amount ?? 1) || 1));
  }
  return 0;
}

// Medio/Difícil: una habilidad de valor instantánea se usa cuando ya no compite con el plan
// principal del turno: Main 2 propio o End step rival. En cualquier otra ventana se reserva.
// Además no genera cartas que inevitablemente excedan el límite de mano.
export function evaluateBotValueAbilityPolicy({
  strategic = false,
  activePlayer = null,
  phase = null,
  timing = 'legacy',
  handSize = 0,
  projectedHandGain = 0,
  hasPlayableMainPhaseSpell = false,
  effectType = null
} = {}) {
  if (!strategic || !isNonUrgentBotValueEffect(effectType)) return { allow:true, reason:'legacy_or_tactical' };

  const projected = Math.max(0, Number(handSize) || 0) + Math.max(0, Number(projectedHandGain) || 0);
  if (projectedHandGain > 0 && projected > 7) return { allow:false, reason:'hand_pressure' };

  // Las habilidades con timing no instantáneo siguen sus ventanas propias; este hardening
  // apunta al patrón que secuestraba prioridad por ser instantáneo.
  if (timing !== 'instant') {
    if (activePlayer === 'rival' && phase === 'main1' && hasPlayableMainPhaseSpell) {
      return { allow:false, reason:'reserve_main_phase' };
    }
    return { allow:true, reason:'noninstant_window' };
  }

  if (activePlayer === 'rival') {
    if (phase === 'main2' || phase === 'end_step') return { allow:true, reason:'safe_own_window' };
    return { allow:false, reason:hasPlayableMainPhaseSpell ? 'reserve_main_phase' : 'defer_to_main2' };
  }

  // Durante el turno humano se conservan respuestas hasta el final del turno. Es el patrón
  // estándar de "usar el maná sobrante EOT" y evita tapearse en main/combat por puro valor.
  if (activePlayer === 'local') {
    return phase === 'end_step'
      ? { allow:true, reason:'opponent_end_step' }
      : { allow:false, reason:'hold_reactive_mana' };
  }

  return { allow:false, reason:'unsafe_window' };
}

function cardSubtypeTokens(card) {
  const type = String(card?.type || '');
  const dash = type.split('—')[1] || '';
  return dash.split(/\s+/).map(x => x.trim()).filter(Boolean);
}

function keywordCount(card) {
  return Array.isArray(card?.keywords) ? card.keywords.length : 0;
}

function effectStrategicBonus(card) {
  const effect = card?.effect || card?.etbEffect || null;
  const type = String(effect?.type || '');
  if (['destroy_all_creatures','destroy_all_lands'].includes(type)) return 5.0;
  if (['destroy_creature','exile_creature','exile_and_return','bounce','fight'].includes(type)) return 3.4;
  if (['counter_spell','counter_ability','counter_stack_object'].includes(type) || type.startsWith('counter')) return 3.0;
  if (['draw','search_library','look_at_top'].includes(type)) return 2.2;
  if (['reanimate','return_from_graveyard'].includes(type)) return 1.8;
  if (type === 'damage') return 1.2 + Math.min(2.4, Math.max(0, Number(effect?.amount) || 0) * .35);
  if (type === 'heal') return .4;
  return 0;
}

function staticStrategicBonus(card, subtypeCounts = {}) {
  const st = card?.staticEffect || null;
  if (!st) return 0;
  let bonus = 1.4;
  if (st.type === 'spell_cost_modifier') bonus += 2.4;
  else if (st.type === 'team_buff') bonus += 1.8;
  else if (st.type) bonus += .8;
  const subtype = st?.filter?.subtype;
  if (subtype) bonus += Math.min(2.5, Math.max(0, Number(subtypeCounts[subtype]) || 0) * .45);
  return bonus;
}

export function buildBotSubtypeCounts(cards = []) {
  const counts = {};
  for (const card of cards || []) {
    for (const subtype of cardSubtypeTokens(card)) counts[subtype] = (counts[subtype] || 0) + 1;
  }
  return counts;
}

export function scoreBotCardKeepValue(card, context = {}) {
  if (!card) return -999;
  const type = String(card.type || '');
  const cmc = Math.max(0, Number(card.cmc) || 0);
  const manaNextTurn = Math.max(0, Number(context.manaNextTurn) || 0);
  const subtypeCounts = context.subtypeCounts || {};
  let score = 0;

  if (type.includes('Tierra')) {
    // Con 6+ fuentes el land extra suele ser el descarte natural, pero las tierras utility
    // conservan algo de valor. Con pocas tierras, en cambio, se protegen fuertemente.
    const landCount = Math.max(0, Number(context.landCount) || 0);
    score += landCount <= 4 ? 5.0 : landCount === 5 ? 2.8 : .65;
    if (card.activatedAbility || card.activatedAbilities || card.manaAbility?.options?.length > 1) score += 1.0;
    return score;
  }

  score += Math.min(2.5, cmc * .28);
  if (card.power !== undefined) {
    score += Math.max(0, Number(card.power) || 0) * .42;
    score += Math.max(0, Number(card.toughness) || 0) * .32;
    score += keywordCount(card) * .35;
  }
  score += effectStrategicBonus(card);
  score += staticStrategicBonus(card, subtypeCounts);

  // Cartas que realmente podrá usar en su próximo turno reciben un premio; bombas muy por
  // encima de la manabase pierden algo de prioridad frente a recursos utilizables ahora.
  if (manaNextTurn > 0) {
    if (cmc <= manaNextTurn) score += 1.2;
    else score -= Math.min(2.0, (cmc - manaNextTurn) * .45);
  }

  for (const subtype of cardSubtypeTokens(card)) {
    score += Math.min(1.4, Math.max(0, Number(subtypeCounts[subtype]) || 0) * .18);
  }
  return score;
}

export function chooseStrategicBotDiscardIndex(hand = [], context = {}) {
  if (!Array.isArray(hand) || hand.length === 0) return -1;
  const subtypeCounts = context.subtypeCounts || buildBotSubtypeCounts([
    ...hand,
    ...(context.battlefieldCards || [])
  ]);
  let bestIndex = 0;
  let bestScore = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const score = scoreBotCardKeepValue(hand[i], { ...context, subtypeCounts });
    if (score < bestScore) { bestScore = score; bestIndex = i; }
  }
  return bestIndex;
}

export function scoreBotGraveyardRecovery(card, context = {}) {
  if (!card) return -999;
  const hand = Array.isArray(context.hand) ? context.hand : [];
  const battlefieldCards = Array.isArray(context.battlefieldCards) ? context.battlefieldCards : [];
  const subtypeCounts = context.subtypeCounts || buildBotSubtypeCounts([...hand, ...battlefieldCards]);
  // Similar a keep value pero prioriza engine/sinergia sobre un cuerpo apenas más grande.
  return scoreBotCardKeepValue(card, {
    ...context,
    subtypeCounts,
    manaNextTurn: context.manaNextTurn ?? context.landCount ?? 0
  }) + staticStrategicBonus(card, subtypeCounts) * .45;
}
