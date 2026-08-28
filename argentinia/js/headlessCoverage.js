// Argentinia 23.18.2 — Coverage Map V2.
// Clasificación ESTÁTICA del pool para el agente headless. FULL significa que la carta
// entra en el perfil automático sin requerir una decisión/target no modelado. PARTIAL
// significa que el motor está soportado pero falta automatizar al menos una decisión local.
// UNSUPPORTED se reserva para rutas de pago/identidad que el lab deliberadamente no ejecuta.
export const HEADLESS_COVERAGE_VERSION = '23.18.2-coverage-v2';

const HARD_UNSUPPORTED_KEYS = new Set(['convoke','delve','affinity']);
const PARTIAL_KEYS = new Set([
  'requiresTarget','multiTarget','targets','activatedAbility','activatedAbilities','loyalty','loyaltyAbilities',
  'dfc','transform','transformSpec','suspend','flashback','escape','additionalCost','adjunta','equipment'
]);
const AUTO_EFFECT_TYPES = new Set([
  'draw','heal','create_tokens','scry','surveil','proliferate','search_land','ramp','search_library','look_at_top',
  'draw_and_lose_life','rummage','loot','team_buff','team_keyword','spell_cost_modifier','land_mana_add','land_mana_override',
  'exile_top_with_permission','add_counter','remove_counter','add_time_counter_suspended','remove_time_counter_suspended',
  'cant_attack_next_turn','prevent_damage','poison'
]);


function containsNestedTargetChoice(value, root = true) {
  if (Array.isArray(value)) return value.some(v=>containsNestedTargetChoice(v,false));
  if (!value || typeof value !== 'object') return false;
  if (!root && (value.requiresTarget === true || Array.isArray(value.targets) || value.multiTarget === true)) return true;
  return Object.values(value).some(v=>containsNestedTargetChoice(v,false));
}

function collectEffectTypes(value, out = new Set()) {
  if (Array.isArray(value)) { value.forEach(v=>collectEffectTypes(v,out)); return out; }
  if (!value || typeof value !== 'object') return out;
  if (typeof value.type === 'string' && ('amount' in value || 'destination' in value || 'counterType' in value || 'filter' in value || 'duration' in value || 'selection' in value)) out.add(value.type);
  Object.values(value).forEach(v=>collectEffectTypes(v,out));
  return out;
}

export function classifyHeadlessCard(card = {}) {
  const reasons=[];
  const mana=String(card.manaCost||'');
  if (mana.includes('/') || /\{P\}/i.test(mana)) reasons.push('COMPLEX_MANA_SYMBOL');
  if (mana.includes('{C}')) reasons.push('COLORLESS_PAYMENT');
  for (const key of HARD_UNSUPPORTED_KEYS) if (card[key]) reasons.push(`UNSUPPORTED_${key.toUpperCase()}`);
  if (reasons.length) return {level:'UNSUPPORTED',reasons,effectTypes:[...collectEffectTypes(card)]};

  const partial=[];
  for (const key of PARTIAL_KEYS) if (card[key]) partial.push(`DECISION_${key}`);
  // 23.18.2 Automated Choice Engine cubre Modal/X/Kicker/Legend Rule y targets que nacen
  // durante resolución. Los effect types son reportados, pero no degradan por sí solos la
  // cobertura: el criterio FULL es "la carta puede atravesar el motor con una política legal".
  const effectTypes=[...collectEffectTypes(card)];
  return {level:partial.length?'PARTIAL':'FULL',reasons:[...new Set(partial)],effectTypes};
}

export function buildHeadlessCoverageReport(cards = []) {
  const rows=(cards||[]).map(({card,source})=>({source,id:card.id,name:card.name,type:card.type,...classifyHeadlessCard(card)}));
  const counts={FULL:0,PARTIAL:0,UNSUPPORTED:0}; rows.forEach(r=>counts[r.level]++);
  const bySource={};
  for(const row of rows){
    const bucket=bySource[row.source] ||= {total:0,FULL:0,PARTIAL:0,UNSUPPORTED:0};
    bucket.total++; bucket[row.level]++;
  }
  const reasonCounts={};
  for(const row of rows) for(const reason of row.reasons) reasonCounts[reason]=(reasonCounts[reason]||0)+1;
  return {
    version:HEADLESS_COVERAGE_VERSION,total:rows.length,counts,
    fullPct:rows.length?Number((counts.FULL*100/rows.length).toFixed(2)):0,
    structurallyKnownPct:rows.length?Number(((counts.FULL+counts.PARTIAL)*100/rows.length).toFixed(2)):0,
    bySource,
    topReasons:Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count})),
    rows
  };
}
