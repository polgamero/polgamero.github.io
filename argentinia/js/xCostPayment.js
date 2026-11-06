// Observational payment planning. Uses the same source abilities, land bonuses and
// pool matcher as payment; never taps, sacrifices, spends or chooses for a human.
import { MANA_TYPES, cloneManaPool, addMana, manaPoolTotal, canPoolPayCost } from './manaPool.js';
import { normalizeManaAbility, canActivateManaSourcePermanent } from './manaSources.js';
import { isLandPermanent } from './permanentTypes.js';
import { getEffectiveLandManaAbility } from './landCharacteristics.js';
import { getLandManaBonuses } from './landStax.js';
import { getSpellPaymentMethods, getConvokeCandidates, applyConvokeToCost, applyDelveToCost, applyPhyrexianLifeToCost } from './costEngine.js';

export function readPaymentSources(state, isLocal, { excludeItems = [], hasHaste = () => false } = {}) {
  const prefix = isLocal ? 'local' : 'rival';
  const excluded = new Set(excludeItems), seen = new Set();
  const sources = [];
  for (const zone of ['Lands', 'Support', 'Combat', 'Planeswalkers']) {
    for (const item of state[prefix + zone] || []) {
      if (!item?.card || excluded.has(item) || seen.has(item)) continue;
      seen.add(item);
      const land = isLandPermanent(item);
      const printed = normalizeManaAbility(item.card);
      const ability = land ? getEffectiveLandManaAbility(state, item, isLocal, printed) : printed;
      if (!canActivateManaSourcePermanent(item, { ability, hasHaste:hasHaste(item) })) continue;
      const choices = ability.options.map(type => {
        const pool = cloneManaPool();
        addMana(pool, type, ability.amount);
        if (land && ability.requiresTap) {
          for (const bonus of getLandManaBonuses(state, isLocal, item, type)) addMana(pool, bonus.type, bonus.amount);
        }
        return { item, type, ability, pool };
      });
      sources.push({ item, choices });
    }
  }
  return sources;
}

// A flexible source produces ONE chosen color per activation, including rocks
// that produce several mana. Do not treat its color options as separate sources.
export function planManaSources(pool, cost, sources) {
  const available = cloneManaPool(pool), chosen = [], failed = new Set();
  const ordered = [...sources].sort((a,b) => a.choices.length - b.choices.length);
  const upper = Array(ordered.length + 1).fill(0);
  const colorUpper = Array.from({length:ordered.length+1},()=>cloneManaPool());
  for (let i=ordered.length-1; i>=0; i--) upper[i] = upper[i+1] + Math.max(0, ...ordered[i].choices.map(c=>manaPoolTotal(c.pool)));
  for (let i=ordered.length-1; i>=0; i--) for (const c of MANA_TYPES) colorUpper[i][c]=colorUpper[i+1][c]+Math.max(0,...ordered[i].choices.map(option=>option.pool[c]));
  const needed = MANA_TYPES.reduce((sum,c)=>sum+(cost[c]||0),cost.generic||0) + (cost.hybrid?.length||0) + (cost.phyrexian?.length||0);
  function walk(i) {
    if (canPoolPayCost(available, cost)) return [...chosen];
    if (i === ordered.length || manaPoolTotal(available)+upper[i] < needed) return null;
    if (MANA_TYPES.some(c=>(cost[c]||0)>available[c]+colorUpper[i][c])) return null;
    const key = i + ':' + MANA_TYPES.map(c=>available[c]).join(',');
    if (failed.has(key)) return null;
    // Prefer leaving a source unused. The suffix bound prunes missing capacity,
    // so this does not enumerate every subset of identical basic lands.
    const skipped = walk(i+1);
    if (skipped) return skipped;
    for (const choice of ordered[i].choices) {
      for (const c of MANA_TYPES) available[c] += choice.pool[c];
      chosen.push(choice);
      const plan = walk(i+1);
      chosen.pop();
      for (const c of MANA_TYPES) available[c] -= choice.pool[c];
      if (plan) return plan;
    }
    failed.add(key);
    return null;
  }
  return walk(0);
}

export function canPayXCost(state, card, cost, { isLocal = true, excludeItems = [], excludeCards = [], lifeReserved = 0, hasHaste } = {}) {
  const prefix = isLocal ? 'local' : 'rival';
  const sources = readPaymentSources(state, isLocal, { excludeItems, hasHaste });
  const methods = getSpellPaymentMethods(card);
  const convoke = methods.some(m=>m.type==='convoke') ? getConvokeCandidates(state,isLocal,excludeItems) : [];
  const excluded = new Set([card, ...excludeCards]);
  const delve = methods.some(m=>m.type==='delve') ? (state[prefix+'Graveyard']||[]).filter(c=>!excluded.has(c)) : [];
  const life = Math.max(0,(state[prefix+'HP']||0)-lifeReserved);
  function manaPayment(remaining, used) {
    const afterDelve = applyDelveToCost(remaining,delve).cost;
    const usable = sources.filter(s=>!used.includes(s.item));
    function phyrexian(c, index, paidLife) {
      if (planManaSources(state[prefix+'ManaPool'],c,usable)) return true;
      if (index >= (c.phyrexian?.length||0) || paidLife+2>life) return false;
      const paid = applyPhyrexianLifeToCost(c,[index]).cost;
      return phyrexian(paid,index,paidLife+2) || phyrexian(c,index+1,paidLife);
    }
    return phyrexian(afterDelve,0,0);
  }
  function chooseConvoke(i, selected) {
    const applied = applyConvokeToCost(cost,selected);
    if (manaPayment(applied.cost,applied.usedItems)) return true;
    for (let j=i; j<convoke.length; j++) if (chooseConvoke(j+1,[...selected,convoke[j]])) return true;
    return false;
  }
  return chooseConvoke(0,[]);
}

// Final cost modifiers can make X cheaper or more expensive than printed mana.
// Search the actual monotonic affordability boundary rather than counting symbols.
export function maximumAffordableX(canPay) {
  if (!canPay(0)) return -1;
  let low=0, high=1;
  while (canPay(high)) {
    low=high;
    if (high >= Number.MAX_SAFE_INTEGER) return high;
    high=Math.min(Number.MAX_SAFE_INTEGER,high*2);
  }
  while (high-low>1) {
    const mid=low+Math.floor((high-low)/2);
    if (canPay(mid)) low=mid; else high=mid;
  }
  return low;
}
