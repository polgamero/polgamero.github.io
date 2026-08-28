// Argentinia 23.18.2 — helpers puros del Headless Coverage 2.0 + Full Game Lab.
// El worker Node importa el motor REAL (main/turnManager/bot/combatRules) y usa estas piezas
// sólo para preparar mazos seguros, decidir acciones locales y auditar progreso.
import { createSeededRng } from './gameRng.js';
import { replayHash, snapshotInvariantFindings } from './replayKernel.js';
import { classifyHeadlessCard } from './headlessCoverage.js';

export const HEADLESS_LAB_VERSION = '23.18.2-full-engine-v2';
export const HEADLESS_SAFE_PROFILE = 'core-combat-v1';
export const HEADLESS_COVERAGE_PROFILE = 'coverage-v2';
export const HEADLESS_PROBE_PROFILE = 'pool-probe-v2';

const COLOR_SYMBOLS = ['W','U','B','R','G'];

export function manaColorsFromCard(card) {
  const text = String(card?.manaCost || '');
  const found = new Set();
  for (const symbol of COLOR_SYMBOLS) if (text.includes(`{${symbol}}`)) found.add(symbol);
  return [...found];
}

export function isHeadlessSafeCreature(card, identity = ['R','G']) {
  if (!card || card.power === undefined || card.toughness === undefined) return false;
  if (!String(card.type || '').includes('Criatura')) return false;
  const manaText=String(card.manaCost || '');
  // V1 automatiza únicamente costes estándar {N}/{WUBRG}. Híbrido/Pirexiano/X/C pertenece
  // a perfiles posteriores porque abre decisiones de pago que deben tener agente propio.
  if (manaText.includes('/') || manaText.includes('{X}') || manaText.includes('{C}')) return false;
  if (card.requiresTarget || card.modal || card.kicker || card.alternativeCost || card.additionalCost || card.flashback || card.escape || card.suspend) return false;
  // Core-combat profile: sólo cuerpo + keywords estáticas. Cualquier trigger/efecto/ability
  // puede abrir decisiones o Stack adicional y pertenece a perfiles de cobertura posteriores.
  if (Object.keys(card).some(k => /trigger|effect|ability|replacement/i.test(k))) return false;
  if (card.triggers || card.transform || card.transformSpec || card.adjunta) return false;
  if (/Legendari/i.test(String(card.type || '')) || card.legendary === true) return false;
  const allowed = new Set(identity);
  return manaColorsFromCard(card).every(c => allowed.has(c));
}

function cloneCard(card, instanceId) {
  return { ...structuredClone(card), instanceId };
}

export function isHeadlessCoverageFullCard(card, identity = ['R','G']) {
  if (!card || String(card.type || '').includes('Tierra')) return false;
  if (classifyHeadlessCard(card).level !== 'FULL') return false;
  const allowed=new Set(identity);
  return manaColorsFromCard(card).every(c=>allowed.has(c));
}

export function buildHeadlessCoverageDeck({ cards = [], lands = [], identity = ['R','G'], seed = 'lab', side = 'local' } = {}) {
  const rng=createSeededRng(`${seed}|${side}|coverage-deck`);
  const candidates=cards.filter(c=>isHeadlessCoverageFullCard(c,identity))
    .sort((a,b)=>Number(a.cmc||0)-Number(b.cmc||0)||String(a.id).localeCompare(String(b.id)));
  if(candidates.length<24) throw new Error(`HEADLESS_COVERAGE_POOL_TOO_SMALL:${candidates.length}`);
  const basicByColor=new Map();
  for(const color of identity){
    const basics=lands.filter(c=>String(c.type||'').toLowerCase().includes('básica')&&String(c.produces||'')===color);
    if(!basics.length) throw new Error(`HEADLESS_BASIC_LAND_MISSING:${color}`);
    basicByColor.set(color,basics);
  }
  const deck=[]; let serial=1;
  for(let i=0;i<24;i++){ const color=identity[i%identity.length]; const opts=basicByColor.get(color); const base=opts[Math.floor(rng()*opts.length)]; deck.push(cloneCard(base,`lab2_${side}_${serial++}`)); }
  const curveBuckets=[
    candidates.filter(c=>Number(c.cmc||0)<=2),
    candidates.filter(c=>Number(c.cmc||0)>=3&&Number(c.cmc||0)<=4),
    candidates.filter(c=>Number(c.cmc||0)>=5)
  ];
  for(let i=0;i<36;i++){
    const preferred=curveBuckets[i%3].length?curveBuckets[i%3]:candidates;
    const base=preferred[Math.floor(rng()*preferred.length)];
    deck.push(cloneCard(base,`lab2_${side}_${serial++}`));
  }
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  return {deck,coverageCandidateCount:candidates.length,identity:[...identity],rng:rng.snapshot()};
}


export function isHeadlessProbeCard(card, identity = ['R','G']) {
  if (!card || String(card.type || '').includes('Tierra')) return false;
  if (classifyHeadlessCard(card).level === 'UNSUPPORTED') return false;
  const allowed=new Set(identity);
  return manaColorsFromCard(card).every(c=>allowed.has(c));
}

export function buildHeadlessProbeDeck({ cards = [], lands = [], identity = ['R','G'], seed = 'lab', side = 'local' } = {}) {
  const rng=createSeededRng(`${seed}|${side}|probe-deck`);
  const candidates=cards.filter(c=>isHeadlessProbeCard(c,identity)).sort((a,b)=>Number(a.cmc||0)-Number(b.cmc||0)||String(a.id).localeCompare(String(b.id)));
  if(candidates.length<24) throw new Error(`HEADLESS_PROBE_POOL_TOO_SMALL:${candidates.length}`);
  const basicByColor=new Map();
  for(const color of identity){ const basics=lands.filter(c=>String(c.type||'').toLowerCase().includes('básica')&&String(c.produces||'')===color); if(!basics.length) throw new Error(`HEADLESS_BASIC_LAND_MISSING:${color}`); basicByColor.set(color,basics); }
  const deck=[]; let serial=1;
  for(let i=0;i<24;i++){const color=identity[i%identity.length];const opts=basicByColor.get(color);deck.push(cloneCard(opts[Math.floor(rng()*opts.length)],`probe_${side}_${serial++}`));}
  for(let i=0;i<36;i++){ const base=candidates[Math.floor(rng()*candidates.length)]; deck.push(cloneCard(base,`probe_${side}_${serial++}`)); }
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  return {deck,probeCandidateCount:candidates.length,identity:[...identity],rng:rng.snapshot()};
}

export function buildHeadlessSafeDeck({ creatures = [], lands = [], identity = ['R','G'], seed = 'lab', side = 'local' } = {}) {
  const rng = createSeededRng(`${seed}|${side}|deck`);
  const safeCreatures = creatures
    .filter(c => isHeadlessSafeCreature(c, identity))
    .sort((a,b) => Number(a.cmc||0)-Number(b.cmc||0) || String(a.id).localeCompare(String(b.id)));
  if (safeCreatures.length < 20) throw new Error(`HEADLESS_SAFE_POOL_TOO_SMALL:${safeCreatures.length}`);

  const basicByColor = new Map();
  for (const color of identity) {
    const candidates = lands.filter(c => String(c.type || '').toLowerCase().includes('básica') && String(c.produces || '') === color);
    if (!candidates.length) throw new Error(`HEADLESS_BASIC_LAND_MISSING:${color}`);
    basicByColor.set(color, candidates);
  }

  const deck=[];
  let serial=1;
  for (let i=0;i<24;i++) {
    const color=identity[i % identity.length];
    const options=basicByColor.get(color);
    const base=options[Math.floor(rng()*options.length)];
    deck.push(cloneCard(base, `lab_${side}_${serial++}`));
  }
  // 36 criaturas únicas o casi únicas, sesgadas a curva baja para que la partida progrese.
  const pool=[...safeCreatures];
  for (let i=0;i<36;i++) {
    const window=Math.min(pool.length, Math.max(12, 36-i));
    const idx=Math.floor(rng()*window);
    const [base]=pool.splice(idx,1);
    deck.push(cloneCard(base, `lab_${side}_${serial++}`));
    if (!pool.length) pool.push(...safeCreatures);
  }

  // Fisher-Yates determinista. El motor roba con pop(), por lo que el orden completo importa.
  for (let i=deck.length-1;i>0;i--) {
    const j=Math.floor(rng()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return { deck, safeCreatureCount:safeCreatures.length, identity:[...identity], rng:rng.snapshot() };
}

export function pendingChoiceKeys(state) {
  const keys = [
    'pendingLegendChoice','pendingTriggerOrderChoice','pendingTargetCard','pendingCastTransaction','pendingSuspendTransaction','pendingAlternativeCostChoice',
    'pendingPrivateZoneChoice','pendingLandSearchChoice','pendingLibraryChoice','pendingAbilitySource','pendingActivatedAbilityChoice','pendingCrew',
    'pendingWardChoice','pendingCounterUnlessPay','pendingFightChoice','pendingXChoice','pendingModeChoice','pendingLoyaltyTargetChoice',
    'pendingMultiTargetChoice','pendingScrySurveilChoice','pendingProliferateChoice','pendingHandFilterChoice','pendingDiscardChoice',
    'pendingSacrificeEffectChoice','pendingGraveyardChoice','pendingResolvedEffectTargetChoice','pendingEscapeExileChoice','pendingKickerChoice',
    'pendingRampChoice','pendingCompositeCostPayment'
  ];
  return keys.filter(k => state?.[k]);
}

export function headlessProgressKey(snapshot) {
  return replayHash({
    turn:snapshot?.turn,
    hp:[snapshot?.local?.hp,snapshot?.rival?.hp],
    poison:[snapshot?.local?.poison,snapshot?.rival?.poison],
    zones:[snapshot?.local?.deck?.count,snapshot?.local?.hand?.count,snapshot?.local?.combat?.length,snapshot?.rival?.deck?.count,snapshot?.rival?.hand?.count,snapshot?.rival?.combat?.length],
    stack:snapshot?.stack
  });
}

export function auditHeadlessSnapshot(snapshot) {
  const findings=snapshotInvariantFindings(snapshot);
  const allObjectIds=new Map();
  for (const side of ['local','rival']) {
    for (const zone of ['lands','combat','support','planeswalkers','graveyard','exile']) {
      for (const entry of snapshot?.[side]?.[zone] || []) {
        const id=entry?._syncObjectId || entry?._effectObjectId || entry?.card?._syncObjectId || null;
        if (!id) continue;
        const where=`${side}.${zone}`;
        if (allObjectIds.has(id) && allObjectIds.get(id)!==where) findings.push({code:'HEADLESS_DUPLICATE_OBJECT_ID',details:{id,first:allObjectIds.get(id),second:where}});
        else allObjectIds.set(id,where);
      }
    }
  }
  return findings;
}

export function summarizeHeadlessRun({ seed, difficulty, profile = HEADLESS_SAFE_PROFILE, steps, snapshot, actions, unsupported = [], invariantFindings = [], status, reason, traceHash }) {
  return {
    labVersion:HEADLESS_LAB_VERSION, safeProfile:profile, seed, difficulty, status, reason,
    steps, turns:Number(snapshot?.turn?.turnCount || 0), winner:snapshot?.turn?.gameOver ? (snapshot?.local?.hp<=0 || snapshot?.local?.poison>=10 ? 'rival' : snapshot?.rival?.hp<=0 || snapshot?.rival?.poison>=10 ? 'local' : 'terminal') : null,
    finalHash:snapshot ? replayHash(snapshot) : null, traceHash,
    final:{localHP:snapshot?.local?.hp,rivalHP:snapshot?.rival?.hp,localPoison:snapshot?.local?.poison,rivalPoison:snapshot?.rival?.poison,stackDepth:snapshot?.stack?.length||0},
    actionCount:actions?.length||0, unsupported:[...new Set(unsupported)], invariantFindings
  };
}
