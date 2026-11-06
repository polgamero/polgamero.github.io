import { normalizeManaAbility } from './manaSources.js';
const COLORS = ['W','U','B','R','G','C'];
const isLandCard = card => /Tierra/i.test(String(card?.type || ''));
const isCreatureCard = card => card?.power !== undefined || /Criatura/i.test(String(card?.type || ''));

function safeCmc(card) {
  const n = Number(card?.cmc);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function parseManaDemand(manaCost = '') {
  const out = { W:0,U:0,B:0,R:0,G:0,C:0 };
  const text = String(manaCost || '');
  for (const match of text.matchAll(/\{([WUBRGC])\}/g)) out[match[1]] += 1;
  return out;
}

export function getManaSourceProfile(card) {
  const ability = normalizeManaAbility(card);
  if (ability) return { colors:[...ability.options], flexible:ability.options.length>1, amount:ability.amount };
  const colors = new Set();
  let flexible = false;
  const produced = String(card?.produces || '').toUpperCase();
  if (COLORS.includes(produced)) colors.add(produced);

  const text = String(card?.text || '');
  const clauses = text.match(/\{T\}[^.\n]{0,110}Agreg(?:a|á)[^.\n]*/gi) || [];
  for (const clause of clauses) {
    if (/cualquier color/i.test(clause)) flexible = true;
    for (const match of clause.matchAll(/\{([WUBRGC])\}/g)) colors.add(match[1].toUpperCase());
    if (/Agreg(?:a|á)\s*\{1\}/i.test(clause)) colors.add('C');
  }
  if (flexible) ['W','U','B','R','G'].forEach(c => colors.add(c));
  return { colors:[...colors], flexible };
}

export function buildDeckStatistics(entries = []) {
  const stats = {
    total:0, lands:0, creatures:0, nonlands:0, manaValueTotal:0, averageManaValue:0,
    curve:{0:0,1:0,2:0,3:0,4:0,5:0,'6+':0},
    demand:{W:0,U:0,B:0,R:0,G:0,C:0},
    cardColors:{W:0,U:0,B:0,R:0,G:0,C:0},
    sources:{W:0,U:0,B:0,R:0,G:0,C:0}, flexibleSources:0, manaSourceCards:0,
    typeCounts:{}, flexibleSymbols:0, xCards:0
  };
  for (const entry of entries) {
    if (!entry?.card || !entry?.count || entry.count <= 0) continue;
    const count = Math.max(0,Math.floor(Number(entry.count)||0));
    const card = entry.card;
    const category = entry.categoryKey || 'otros';
    const isLand = category === 'tierras' || /Tierra/i.test(String(card.type || ''));
    const isCreature = isCreatureCard(card);
    stats.total += count;
    stats.typeCounts[category] = (stats.typeCounts[category] || 0) + count;
    if (isLand) stats.lands += count;
    else {
      stats.nonlands += count;
      const cmc = safeCmc(card);
      stats.manaValueTotal += cmc * count;
      const bucket = cmc >= 6 ? '6+' : String(Math.floor(cmc));
      if (bucket in stats.curve) stats.curve[bucket] += count;
      const demand = parseManaDemand(card.manaCost);
      COLORS.forEach(c => { stats.demand[c] += demand[c] * count; });
      stats.flexibleSymbols += (String(card.manaCost||'').match(/\{[^}]*\/[^}]*\}/g)||[]).length*count;
      if(String(card.manaCost||'').includes('{X}'))stats.xCards+=count;
    }
    if (isCreature) stats.creatures += count;
    const colors = Array.isArray(card.colors) ? card.colors : [];
    if (colors.length === 0) stats.cardColors.C += count;
    else colors.forEach(c => { if (c in stats.cardColors) stats.cardColors[c] += count; });

    const source = getManaSourceProfile(card);
    if (source.colors.length) {
      stats.manaSourceCards += count;
      source.colors.forEach(c => { if (c in stats.sources) stats.sources[c] += count; });
      if (source.flexible) stats.flexibleSources += count;
    }
  }
  stats.averageManaValue = stats.nonlands ? stats.manaValueTotal / stats.nonlands : 0;
  return stats;
}

export function analyzeDeckHealth(stats) {
  const out = [];
  const add = (level, title, detail, code) => out.push({ level, title, detail, code });
  if (stats.total === 60) add('ok','60/60 cartas','El mazo tiene el tamaño reglamentario.','size');
  else add('warn',`${stats.total}/60 cartas`,'Completá el mazo para que las probabilidades representen una lista final.','size');

  if (stats.lands < 20) add('danger','Muy pocas tierras',`${stats.lands} tierras: la consistencia de maná puede ser baja.`, 'lands-low');
  else if (stats.lands <= 21) add('warn','Base de maná ajustada',`${stats.lands} tierras. Puede funcionar en curvas muy bajas, pero conviene revisarlo.`, 'lands-tight');
  else if (stats.lands <= 27) add('ok','Base de tierras razonable',`${stats.lands} tierras en el mazo.`, 'lands-ok');
  else add('warn','Muchas tierras',`${stats.lands} tierras. Revisá que sea una decisión deliberada.`, 'lands-high');

  if (stats.averageManaValue >= 4) add('warn','Curva de maná alta',`MV medio sin tierras: ${stats.averageManaValue.toFixed(1)}.`, 'mv-high');
  else if (stats.nonlands && stats.averageManaValue <= 3.2) add('ok','Curva compacta',`MV medio sin tierras: ${stats.averageManaValue.toFixed(1)}.`, 'mv-ok');

  const early = (stats.curve['1'] || 0) + (stats.curve['2'] || 0);
  if (stats.nonlands >= 20 && early < 6) add('warn','Pocas jugadas tempranas',`Sólo ${early} cartas de CMC 1–2.`, 'early-low');
  else if (early >= 10) add('ok','Buena presencia temprana',`${early} cartas de CMC 1–2.`, 'early-ok');

  const high = (stats.curve['5'] || 0) + (stats.curve['6+'] || 0);
  if (high >= 10) add('warn','Carga alta de cartas costosas',`${high} cartas cuestan 5 o más.`, 'high-curve');

  ['W','U','B','R','G'].forEach(color => {
    const demand = stats.demand[color] || 0;
    const sources = stats.sources[color] || 0;
    if (demand > 0 && sources === 0) add('danger',`Sin fuentes ${color}`,`El mazo exige ${demand} símbolo(s) ${color} y no detecta fuentes de ese color.`, `source-${color}`);
    else if (demand >= 5 && sources > 0 && sources < 4) add('warn',`Pocas fuentes ${color}`,`${sources} fuente(s) para ${demand} símbolo(s) de coste.`, `source-${color}`);
  });
  return out;
}

function expandEntries(entries) {
  const deck = [];
  for (const entry of entries) if(entry?.card)for (let i=0; i<Math.max(0,Math.floor(Number(entry.count)||0)); i++) deck.push({ card:entry.card, categoryKey:entry.categoryKey });
  return deck;
}

function sampleHand(deck, size, rng) {
  const pool = deck.slice();
  const n = Math.min(size, pool.length);
  for (let i=0; i<n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }
  return pool.slice(0,n);
}

export function simulateOpeningHands(entries = [], iterations = 100, rng = Math.random) {
  const deck = expandEntries(entries);
  const runs = Math.max(1, Math.floor(iterations));
  const landHistogram = Array(8).fill(0);
  let balanced=0, early=0, mulligan=0, threeFour=0, zero=0, one=0, fivePlus=0, creatureHands=0;
  let landsTotal=0, creaturesTotal=0;
  for (let r=0; r<runs; r++) {
    const hand = sampleHand(deck, 7, rng);
    const lands = hand.filter(x => x.categoryKey === 'tierras' || /Tierra/i.test(String(x.card?.type || ''))).length;
    const creatures = hand.filter(x => isCreatureCard(x.card)).length;
    const hasEarly3 = hand.some(x => x.categoryKey !== 'tierras' && !isLandCard(x.card) && safeCmc(x.card) <= 3);
    const hasEarly2 = hand.some(x => x.categoryKey !== 'tierras' && !isLandCard(x.card) && safeCmc(x.card) >= 1 && safeCmc(x.card) <= 2);
    landHistogram[Math.min(7, lands)] += 1;
    landsTotal += lands; creaturesTotal += creatures;
    if (lands >= 2 && lands <= 4 && hasEarly3) balanced += 1;
    if (lands >= 2 && lands <= 4 && hasEarly2) early += 1;
    if (lands <= 1 || lands >= 6) mulligan += 1;
    if (lands >= 3 && lands <= 4) threeFour += 1;
    if (lands === 0) zero += 1;
    if (lands === 1) one += 1;
    if (lands >= 5) fivePlus += 1;
    if (creatures > 0) creatureHands += 1;
  }
  const pct = n => Math.round((n / runs) * 1000) / 10;
  return {
    iterations:runs,
    balancedPct:pct(balanced), earlyPlayPct:pct(early), mulliganPct:pct(mulligan), threeFourLandsPct:pct(threeFour),
    zeroLandPct:pct(zero), oneLandPct:pct(one), fivePlusLandsPct:pct(fivePlus), creatureHandPct:pct(creatureHands),
    averageLands: landsTotal / runs, averageCreatures: creaturesTotal / runs,
    landHistogram: landHistogram.map(n => pct(n))
  };
}

// Exact descriptive draw probabilities, without replacement. They describe the
// cards in the current list; they do not prove timing, targets or color payment.
export function drawCountProbability(total, successes, draws, hits) {
  const n=Math.max(0,Math.floor(Number(total)||0));
  const k=Math.min(n,Math.max(0,Math.floor(Number(successes)||0)));
  const d=Math.min(n,Math.max(0,Math.floor(Number(draws)||0)));
  if(!n || !Number.isSafeInteger(hits) || hits<0 || hits>d || hits>k || d-hits>n-k)return 0;
  const choose=(a,b)=>{let result=1;for(let i=1;i<=Math.min(b,a-b);i++)result=result*(a-i+1)/i;return result;};
  return choose(k,hits)*choose(n-k,d-hits)/choose(n,d);
}

export function openingHandProfile(entries=[]) {
  const stats=buildDeckStatistics(entries),draws=Math.min(7,stats.total);
  const early=entries.reduce((n,e)=>n+(e?.card&&e.categoryKey!=='tierras'&&!isLandCard(e.card)&&safeCmc(e.card)>=1&&safeCmc(e.card)<=2?Math.max(0,Math.floor(Number(e.count)||0)):0),0);
  return {draws,earlyCards:early,
    twoFourLands:stats.total?[2,3,4].reduce((n,k)=>n+drawCountProbability(stats.total,stats.lands,draws,k),0)*100:0,
    atLeastOneEarly:stats.total?(1-drawCountProbability(stats.total,early,draws,0))*100:0,
    atLeastOneCreature:stats.total?(1-drawCountProbability(stats.total,stats.creatures,draws,0))*100:0};
}

export function compareDeckEntries(before=[],after=[]) {
  const counts=entries=>new Map(entries.map(e=>[e.trackingKey||e.card.id,e]));
  const old=counts(before),next=counts(after),added=[],removed=[];
  for(const key of new Set([...old.keys(),...next.keys()])){
    const a=old.get(key),b=next.get(key),delta=(b?.count||0)-(a?.count||0);
    if(delta>0)added.push({...b,count:delta});
    if(delta<0)removed.push({...a,count:-delta});
  }
  return {added,removed,before:buildDeckStatistics(before),after:buildDeckStatistics(after)};
}
