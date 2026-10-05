// Argentinia · Santuario Stage 22 — Enciclopedia sobre catálogo público anónimo + vault autorizado.
import {
  DISCOVERY_POOL_SIZE,
  DISCOVERY_ICON_GLYPH,
  DISCOVERY_ICON_ASSET,
  isDiscoveryCard,
  discoveryClueForCard
} from './discoveryCards.js';

function normalizedCollectionSet(collection = []) {
  return new Set((Array.isArray(collection) ? collection : []).map(id => String(id || '').trim()).filter(Boolean));
}
function cleanPublicClues(rows = []) {
  const seen=new Set(); const out=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const clue=String(row?.clue||'').trim(); if(!clue||seen.has(clue)) continue; seen.add(clue); out.push(clue);
  }
  return out.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}

// Las incógnitas nacen de discovery-public.json: sólo contienen clue. Si una definición
// autorizada está en memoria, ocupa el slot de la misma pista y recién ahí existe identidad.
export function discoveryCatalogForEncyclopedia(publicRows = [], authorizedCards = []) {
  const byClue=new Map();
  for(const card of Array.isArray(authorizedCards)?authorizedCards:[]){
    if(!isDiscoveryCard(card)) continue;
    const clue=discoveryClueForCard(card); if(clue) byClue.set(clue,card);
  }
  return cleanPublicClues(publicRows).map(clue => byClue.get(clue) || Object.freeze({
    acquisition:Object.freeze({type:'discovery'}),
    discovery:Object.freeze({clue}),
    __publicDiscoveryPlaceholder:true
  }));
}

export function discoveryEncyclopediaProgress(publicRows = [], authorizedCards = [], collection = []) {
  const owned=normalizedCollectionSet(collection); let count=0;
  for(const card of Array.isArray(authorizedCards)?authorizedCards:[]){
    if(isDiscoveryCard(card) && card?.id && owned.has(String(card.id))) count+=1;
  }
  const total=cleanPublicClues(publicRows).length;
  return Object.freeze({count,total,expectedTotal:DISCOVERY_POOL_SIZE,catalogComplete:total===DISCOVERY_POOL_SIZE});
}

export function buildDiscoveryEncyclopediaEntry(card, { discovered = false, admin = false } = {}) {
  if (!isDiscoveryCard(card)) return null;
  const clue=discoveryClueForCard(card);
  const hasIdentity=!!String(card?.id||'').trim() && card?.__publicDiscoveryPlaceholder!==true;
  const reveal=hasIdentity && !!(discovered || admin);
  if(reveal) return Object.freeze({discovered:true,clue,card});
  return Object.freeze({discovered:false,clue,iconGlyph:DISCOVERY_ICON_GLYPH,iconAsset:DISCOVERY_ICON_ASSET});
}
export function discoveryEntrySearchText(entry) {
  if(!entry) return ''; const clue=String(entry.clue||''); if(!entry.discovered) return clue;
  return [entry.card?.name,clue].filter(Boolean).join(' ');
}
export function discoveryEntryIsSpoilerSafe(entry) {
  if(!entry||entry.discovered) return true;
  const forbidden=['card','cardId','id','name','image','rules','text','type','rarity','colors','color','cost','manaCost','power','toughness','keywords','effects','affinity','number','ordinal'];
  return forbidden.every(key=>!Object.prototype.hasOwnProperty.call(entry,key));
}
