import { cardHasSubtype } from './typalEngine.js';
// js/libraryEngine.js — Argentinia 23.15.6 · Generic Library / Tutor / Look-at-N
// Capa pura y determinista para seleccionar cartas de biblioteca. No conoce DOM, state ni Firestore.
// El commit real sobre zonas privadas vive en main.js; este módulo sólo normaliza contratos,
// filtra candidatos y puntúa selecciones para Tano/tests.

export const LIBRARY_ENGINE_VERSION = '23.15.6';

export const LIBRARY_CARD_TYPES = Object.freeze([
  'any','spell','permanent','land','nonland','creature','noncreature','instant','sorcery',
  'instant_or_sorcery','artifact','enchantment','planeswalker'
]);
export const LIBRARY_DESTINATIONS = Object.freeze([
  'hand','battlefield','battlefield_tapped','graveyard','exile','top','bottom'
]);
export const LIBRARY_REMAINDER_DESTINATIONS = Object.freeze([
  'stay','top','bottom','graveyard','exile'
]);

function arr(v){ return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function normText(v){ return String(v ?? '').trim().toLowerCase(); }

export function cardTypeTokens(card = {}) {
  const text=normText(card.type);
  const out=new Set();
  const creature=card.power !== undefined || text.includes('criatura');
  if(creature) out.add('creature');
  if(text.includes('tierra')) out.add('land');
  if(text.includes('artefacto')) out.add('artifact');
  if(text.includes('encantamiento')) out.add('enchantment');
  if(text.includes('planeswalker')) out.add('planeswalker');
  if(text.includes('instantáneo') || text.includes('instantaneo')) out.add('instant');
  if(text.includes('conjuro')) out.add('sorcery');
  if(!out.has('creature')) out.add('noncreature');
  if(!out.has('land')) out.add('nonland');
  if(out.has('instant') || out.has('sorcery')) out.add('instant_or_sorcery');
  if(!out.has('land')) out.add('spell');
  if(out.has('creature') || out.has('artifact') || out.has('enchantment') || out.has('planeswalker') || out.has('land')) out.add('permanent');
  out.add('any');
  return out;
}

export function cardManaValue(card = {}) {
  if(Number.isFinite(Number(card.cmc))) return Math.max(0,Number(card.cmc));
  const text=String(card.manaCost || '');
  let total=0;
  for(const raw of text.match(/\{[^}]+\}/g) || []){
    const s=raw.slice(1,-1).toUpperCase();
    if(s==='X') continue;
    if(/^\d+$/.test(s)) total+=Number(s);
    else total+=1; // híbrido/Phyrexian/color/C cuentan un símbolo.
  }
  return total;
}

export function normalizeLibraryFilter(raw = {}) {
  if(typeof raw === 'string') raw={cardType:raw};
  const cardType = LIBRARY_CARD_TYPES.includes(normText(raw.cardType || raw.type || 'any'))
    ? normText(raw.cardType || raw.type || 'any') : 'any';
  const excludeCardType = LIBRARY_CARD_TYPES.includes(normText(raw.excludeCardType || ''))
    ? normText(raw.excludeCardType) : null;
  const colors=arr(raw.colors ?? raw.color).map(v=>String(v).toUpperCase()).filter(v=>['W','U','B','R','G','C'].includes(v));
  const colorMode=['any','all','exact'].includes(normText(raw.colorMode)) ? normText(raw.colorMode) : 'any';
  const subtypes=arr(raw.subtypes ?? raw.subtype).map(v=>normText(v)).filter(Boolean);
  const exactRaw=raw.manaValue ?? raw.exactManaValue;
  const exactManaValue=exactRaw !== null && exactRaw !== undefined && Number.isFinite(Number(exactRaw)) ? Math.max(0,Number(exactRaw)) : null;
  const minManaValue=raw.minManaValue !== null && raw.minManaValue !== undefined && Number.isFinite(Number(raw.minManaValue)) ? Math.max(0,Number(raw.minManaValue)) : null;
  const maxManaValue=raw.maxManaValue !== null && raw.maxManaValue !== undefined && Number.isFinite(Number(raw.maxManaValue)) ? Math.max(0,Number(raw.maxManaValue)) : null;
  const landKind=['basic','nonbasic'].includes(normText(raw.landKind || raw.landFilter)) ? normText(raw.landKind || raw.landFilter) : null;
  return {
    cardType, excludeCardType, colors, colorMode, subtypes,
    legendary: raw.legendary === true ? true : raw.legendary === false ? false : null,
    multicolor: raw.multicolor === true,
    monocolor: raw.monocolor === true,
    colorless: raw.colorless === true,
    exactManaValue,minManaValue,maxManaValue,landKind
  };
}

export function libraryCardMatchesFilter(card, rawFilter = {}) {
  if(!card) return false;
  const filter=normalizeLibraryFilter(rawFilter);
  const types=cardTypeTokens(card);
  if(!types.has(filter.cardType)) return false;
  if(filter.excludeCardType && types.has(filter.excludeCardType)) return false;
  if(filter.subtypes.length){
    if(!filter.subtypes.some(s=>cardHasSubtype(card,s))) return false;
  }
  const colors=new Set(arr(card.colors || card.color).map(v=>String(v).toUpperCase()));
  if(filter.colors.length){
    const matches=filter.colors.map(c=>colors.has(c));
    if(filter.colorMode==='all' && !matches.every(Boolean)) return false;
    if(filter.colorMode==='exact' && !(matches.every(Boolean) && colors.size===filter.colors.length)) return false;
    if(filter.colorMode==='any' && !matches.some(Boolean)) return false;
  }
  if(filter.multicolor && colors.size<2) return false;
  if(filter.monocolor && colors.size!==1) return false;
  if(filter.colorless && colors.size!==0) return false;
  if(filter.legendary !== null && Boolean(card.legendary)!==filter.legendary) return false;
  const mv=cardManaValue(card);
  if(filter.exactManaValue!==null && mv!==filter.exactManaValue) return false;
  if(filter.minManaValue!==null && mv<filter.minManaValue) return false;
  if(filter.maxManaValue!==null && mv>filter.maxManaValue) return false;
  if(filter.landKind){
    if(!types.has('land')) return false;
    const typeText=normText(card.type);
    const basic=typeText.includes('básica') || typeText.includes('basica') || card.basic === true;
    if(filter.landKind==='basic' && !basic) return false;
    if(filter.landKind==='nonbasic' && basic) return false;
  }
  return true;
}

export function normalizeLibraryEffect(effect = {}) {
  const type = effect.type === 'look_at_top' ? 'look_at_top' : 'search_library';
  const range = type === 'look_at_top' ? 'top_n' : (effect.range === 'top_n' ? 'top_n' : 'all');
  const rangeCount = range === 'top_n'
    ? Math.max(0,Math.floor(Number(effect.lookCount ?? effect.rangeCount ?? effect.count ?? effect.amount ?? 1)||0))
    : null;
  const amount=Math.max(0,Math.floor(Number(effect.amount ?? effect.choose ?? 1)||0));
  const destination=LIBRARY_DESTINATIONS.includes(effect.destination) ? effect.destination : 'hand';
  const remainderDestination=LIBRARY_REMAINDER_DESTINATIONS.includes(effect.remainderDestination)
    ? effect.remainderDestination : (range==='top_n' ? 'bottom' : 'stay');
  return {
    type, range, rangeCount, amount,
    filter:normalizeLibraryFilter(effect.filter || effect),
    destination,remainderDestination,
    allowFewer: effect.allowFewer !== false,
    reveal: effect.reveal === true,
    revealCandidates: effect.revealCandidates !== false,
    shuffle: effect.shuffle !== undefined ? effect.shuffle === true : range === 'all',
    owner: ['self','opponent'].includes(effect.owner) ? effect.owner : 'self',
    chooser: ['owner'].includes(effect.chooser) ? effect.chooser : 'owner'
  };
}

function isNormalizedLibrarySpec(value = {}) {
  return !!value && ['all','top_n'].includes(value.range) && !!value.filter && Array.isArray(value.filter.colors) && Array.isArray(value.filter.subtypes);
}

function asLibrarySpec(value = {}) {
  return isNormalizedLibrarySpec(value) ? value : normalizeLibraryEffect(value);
}

// Devuelve candidatos con índice real. Para top_n el orden es TOP-FIRST aunque el mazo use pop().
export function getLibraryWindowEntries(deck, specOrEffect = {}) {
  if(!Array.isArray(deck)) return [];
  const spec=asLibrarySpec(specOrEffect);
  if(spec.range==='top_n'){
    const n=Math.min(deck.length,Math.max(0,Number(spec.rangeCount)||0));
    const start=deck.length-n;
    return deck.slice(start).map((card,offset)=>({card,index:start+offset})).reverse();
  }
  return deck.map((card,index)=>({card,index}));
}

export function getLibraryEligibleEntries(deck, specOrEffect = {}) {
  const spec=asLibrarySpec(specOrEffect);
  return getLibraryWindowEntries(deck,spec).filter(entry=>libraryCardMatchesFilter(entry.card,spec.filter));
}

export function libraryCardCanMoveToDestination(card,destination='hand') {
  if(!card) return false;
  if(!['battlefield','battlefield_tapped'].includes(destination)) return true;
  const types=cardTypeTokens(card);
  if(!types.has('permanent')) return false;
  // Auras necesitan elegir legalmente qué encantar; 23.15.6 no inventa un attach implícito.
  if(card.adjunta || card.auraEffect) return false;
  return true;
}

export function scoreLibraryCardForBot(card,destination='hand') {
  if(!card) return -Infinity;
  const types=cardTypeTokens(card);
  let score=cardManaValue(card)*1.5;
  if(types.has('creature')) score += Math.max(0,Number(card.power)||0)+Math.max(0,Number(card.toughness)||0);
  if(card.legendary) score+=1;
  if(card.etbEffect || card.staticEffect || card.activatedAbility || (card.activatedAbilities||[]).length) score+=3;
  if(destination==='graveyard') score = types.has('creature') ? score*0.75 : score*0.25;
  return score;
}

export function chooseBotLibraryEntries(deck,specOrEffect={}){
  const spec=asLibrarySpec(specOrEffect);
  const max=Math.min(spec.amount,getLibraryEligibleEntries(deck,spec).length);
  return getLibraryEligibleEntries(deck,spec)
    .filter(entry=>libraryCardCanMoveToDestination(entry.card,spec.destination))
    .sort((a,b)=>scoreLibraryCardForBot(b.card,spec.destination)-scoreLibraryCardForBot(a.card,spec.destination) || b.index-a.index)
    .slice(0,max);
}

export function libraryEngineSummary(){
  return {
    version:LIBRARY_ENGINE_VERSION,
    effects:['search_library','look_at_top'],
    destinations:[...LIBRARY_DESTINATIONS],
    filters:['type','excludeType','subtype(exact typal)','color','legendary','manaValue','basic/nonbasic'],
    notes:['library top = deck[deck.length-1]','Aura-to-battlefield intentionally fail-closed']
  };
}
