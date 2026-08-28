// Argentinia 23.18.2 — Automated Choice Engine V2.
// Política determinista side-neutral para decisiones interactivas del runtime headless.
// Objetivo: elegir algo LEGAL y reproducible; no pretende maximizar valor estratégico.
export const HEADLESS_CHOICE_ENGINE_VERSION = '23.18.2-choice-v2';

function firstN(items, n) {
  return (Array.isArray(items) ? items : []).slice(0, Math.max(0, Math.floor(Number(n) || 0)));
}

export function chooseModeIndex(card) {
  return Array.isArray(card?.modes) && card.modes.length ? 0 : null;
}

export function chooseXValue({ roughMaxX = 0 } = {}) {
  // X=0 es siempre la elección legal más conservadora según 107.3, y evita fabricar maná.
  return Math.max(0, Math.min(0, Math.floor(Number(roughMaxX) || 0)));
}

export function chooseKicker() { return false; }
export function chooseAlternativeCost() { return false; }
export function chooseCounterTax() { return 'decline'; }
export function chooseRampColor(colors = []) { return (colors || [])[0] ?? null; }

export function chooseLandSearchIndexes(candidates = [], maxCount = 0, { allowFewer = true } = {}) {
  const count = Math.max(0, Math.min(Number(maxCount) || 0, candidates.length));
  if (allowFewer && count === 0) return [];
  return firstN(candidates, count).map(e => Number(e?.index)).filter(Number.isInteger);
}

export function chooseLibraryIndexes(candidates = [], maxCount = 0, { allowFewer = true } = {}) {
  const eligible = (candidates || []).filter(e => e?.selectable !== false);
  const count = Math.max(0, Math.min(Number(maxCount) || 0, eligible.length));
  if (allowFewer && count === 0) return [];
  return firstN(eligible, count).map(e => Number(e?.index)).filter(Number.isInteger);
}

export function choosePrivateZoneTokens(offer = {}) {
  const amount = Math.max(0, Number(offer?.amount || 0));
  return firstN((offer?.candidates || []).filter(e => e?.selectable !== false), amount).map(e => e.token);
}

export function chooseScrySurveil(cards = [], mode = 'scry') {
  // Keep-all es legal, estable y no exige valorar cartas. Para Surveil también evita mover
  // cartas por una heurística artificial que contaminaría el test de reglas.
  return { moved: [], kept: [...cards], mode };
}

export function chooseProliferate(eligible = []) {
  // Proliferar permite elegir cualquier cantidad. Elegimos todos los objetos elegibles para
  // maximizar cobertura de tipos de contador sin introducir scoring estratégico.
  return [...eligible];
}

export function chooseUntapIndexes(entries = [], countToChoose = 0) {
  const count = Math.max(0, Math.min(Number(countToChoose) || 0, entries.length));
  return firstN(entries, count).map(e => Number(e?.index)).filter(Number.isInteger).sort((a,b)=>a-b);
}

export function chooseGraveyardIndexes(entries = [], countToChoose = 1) {
  const count = Math.max(0, Math.min(Number(countToChoose) || 0, entries.length));
  return firstN(entries, count).map(e => Number(e?.index)).filter(Number.isInteger);
}

export function chooseEscapeIndexes(graveyardCards = [], exileCount = 0) {
  return firstN(graveyardCards, Math.min(Number(exileCount) || 0, graveyardCards.length)).map((_, i) => i);
}

export function chooseSacrificeEntries(candidates = [], countToSacrifice = 1) {
  // Menor valor determinista: primero menor CMC, luego nombre/id; devuelve entradas originales.
  const sorted=[...candidates].sort((a,b)=>{
    const ac=Number(a?.item?.card?.cmc ?? a?.card?.cmc ?? 0);
    const bc=Number(b?.item?.card?.cmc ?? b?.card?.cmc ?? 0);
    return ac-bc || String(a?.item?.card?.id ?? a?.card?.id ?? '').localeCompare(String(b?.item?.card?.id ?? b?.card?.id ?? ''));
  });
  return firstN(sorted, Math.min(Number(countToSacrifice)||0, sorted.length));
}

export function chooseHandIndexes(hand = [], count = 1) {
  // Descarta/fondea cartas de mayor CMC primero para una política estable y razonable.
  const ranked=(hand||[]).map((card,index)=>({card,index})).sort((a,b)=>Number(b.card?.cmc||0)-Number(a.card?.cmc||0)||a.index-b.index);
  return firstN(ranked, Math.min(Number(count)||0, ranked.length)).map(e=>e.index).sort((a,b)=>a-b);
}

export function chooseLegendEntry(entries = []) { return (entries || [])[0] ?? null; }
export function chooseTriggerOrder(entries = []) { return [...entries]; }
export function chooseStackEntry(entries = []) { return (entries || [])[0] ?? null; }
export function chooseCopyRetarget() { return 'keep'; }
