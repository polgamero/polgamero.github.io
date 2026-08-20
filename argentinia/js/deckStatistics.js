const COLORS = ['W','U','B','R','G','C'];

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
    typeCounts:{}
  };
  for (const entry of entries) {
    if (!entry?.card || !entry?.count || entry.count <= 0) continue;
    const count = entry.count;
    const card = entry.card;
    const category = entry.categoryKey || 'otros';
    const isLand = category === 'tierras' || /Tierra/i.test(String(card.type || ''));
    const isCreature = category === 'criaturas';
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
  for (const entry of entries) for (let i=0; i<(entry.count || 0); i++) deck.push({ card:entry.card, categoryKey:entry.categoryKey });
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
    const creatures = hand.filter(x => x.categoryKey === 'criaturas').length;
    const hasEarly3 = hand.some(x => x.categoryKey !== 'tierras' && safeCmc(x.card) <= 3);
    const hasEarly2 = hand.some(x => x.categoryKey !== 'tierras' && safeCmc(x.card) >= 1 && safeCmc(x.card) <= 2);
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
