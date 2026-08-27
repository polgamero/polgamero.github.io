// js/typalEngine.js — Argentinia 23.16.5 · Typal Engine
// Fuente única de verdad para subtipos/Typal. Puro: no conoce DOM, state ni Firestore.

export const TYPAL_ENGINE_VERSION = '23.16.5';
export const CHOSEN_CREATURE_TYPE_SENTINELS = Object.freeze(['chosen','chosen_creature_type','$chosen']);

function arr(v){ return v == null ? [] : (Array.isArray(v) ? v : [v]); }
export function normalizeTypalName(v){
  return String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function subtypeTailFromTypeLine(type=''){
  const text=String(type || '');
  const match=text.match(/[—–-]\s*(.+)$/);
  return match ? match[1] : '';
}

export function cardSubtypes(cardOrItem={}){
  const card=cardOrItem?.card || cardOrItem || {};
  const out=[];
  const push=v=>{
    const display=String(v ?? '').trim().replace(/^[,;]+|[,;]+$/g,'');
    if(!display) return;
    const key=normalizeTypalName(display);
    if(!key || out.some(x=>x.key===key)) return;
    out.push({key,display});
  };
  for(const v of arr(card.subtypes ?? card.subtype)) push(v);
  const tail=subtypeTailFromTypeLine(card.type);
  // Los subtipos que usa hoy Argentinia son tokens de una palabra. Se aceptan comas/slashes
  // como separadores para que futuros JSON puedan ser más explícitos sin romper legacy.
  for(const token of tail.split(/[\s,;/]+/g)) push(token);
  return out;
}

export function cardSubtypeNames(cardOrItem={}){ return cardSubtypes(cardOrItem).map(x=>x.display); }
export function cardSubtypeKeys(cardOrItem={}){ return cardSubtypes(cardOrItem).map(x=>x.key); }

export function isCreatureCard(cardOrItem={}){
  const card=cardOrItem?.card || cardOrItem || {};
  const t=normalizeTypalName(card.type);
  return card.power !== undefined || t.includes('criatura');
}

export function creatureTypeNames(cardOrItem={}){
  return isCreatureCard(cardOrItem) ? cardSubtypeNames(cardOrItem) : [];
}

export function cardHasSubtype(cardOrItem, wanted){
  const keys=new Set(cardSubtypeKeys(cardOrItem));
  return arr(wanted).some(v=>keys.has(normalizeTypalName(v)));
}

export function cardHasAllSubtypes(cardOrItem, wanted){
  const keys=new Set(cardSubtypeKeys(cardOrItem));
  const list=arr(wanted).map(normalizeTypalName).filter(Boolean);
  return list.every(v=>keys.has(v));
}

export function cardsShareCreatureType(a,b){
  if(!isCreatureCard(a) || !isCreatureCard(b)) return false;
  const aa=new Set(cardSubtypeKeys(a));
  return cardSubtypeKeys(b).some(x=>aa.has(x));
}

export function getChosenCreatureType(itemOrCard={}){
  const item=itemOrCard?.card ? itemOrCard : null;
  const raw=item?._chosenCreatureType ?? item?.chosenCreatureType ?? item?.card?._chosenCreatureType ?? itemOrCard?._chosenCreatureType ?? itemOrCard?.chosenCreatureType ?? null;
  return raw ? String(raw) : null;
}

export function setChosenCreatureType(item, creatureType){
  if(!item || typeof item!=='object') return null;
  const value=String(creatureType ?? '').trim();
  if(!value) { delete item._chosenCreatureType; return null; }
  item._chosenCreatureType=value;
  return value;
}

export function resolveSubtypeReference(raw, context={}){
  const value=String(raw ?? '').trim();
  if(!value) return null;
  const key=normalizeTypalName(value);
  if(CHOSEN_CREATURE_TYPE_SENTINELS.includes(key)){
    return getChosenCreatureType(context.sourceItem || context.item || context.sourceCard || context.card || null);
  }
  return value;
}

export function normalizeTypalFilter(raw={}){
  if(typeof raw==='string') raw={subtype:raw};
  return {
    subtypes:arr(raw.subtypes ?? raw.subtype ?? raw.creatureType).filter(v=>String(v??'').trim()),
    subtypeMode:normalizeTypalName(raw.subtypeMode || 'any')==='all' ? 'all' : 'any',
    creatureOnly:raw.creatureOnly===true,
    sharedCreatureTypeWithSource:raw.sharedCreatureTypeWithSource===true || raw.sharesCreatureTypeWithSource===true,
    other:raw.other===true || raw.notSelf===true
  };
}

export function typalFilterMatches(cardOrItem, rawFilter={}, context={}){
  const item=cardOrItem?.card ? cardOrItem : null;
  const card=item?.card || cardOrItem || {};
  const filter=normalizeTypalFilter(rawFilter);
  if(filter.creatureOnly && !isCreatureCard(card)) return false;
  const resolved=filter.subtypes.map(s=>resolveSubtypeReference(s,context)).filter(Boolean);
  if(resolved.length){
    const matches=resolved.map(s=>cardHasSubtype(card,s));
    if(filter.subtypeMode==='all' ? !matches.every(Boolean) : !matches.some(Boolean)) return false;
  }
  if(filter.sharedCreatureTypeWithSource && !cardsShareCreatureType(card,context.sourceCard || context.sourceItem?.card || context.sourceItem)) return false;
  if(filter.other && context.sourceItem && item && item===context.sourceItem) return false;
  return true;
}

export function countBySubtype(entries=[], subtype, {controllerIsLocal=null, sourceItem=null}={}){
  const resolved=resolveSubtypeReference(subtype,{sourceItem});
  if(!resolved) return 0;
  return (entries||[]).filter(entry=>{
    const item=entry?.item || entry;
    if(controllerIsLocal!==null && entry?.isLocal!==controllerIsLocal) return false;
    return isCreatureCard(item) && cardHasSubtype(item,resolved);
  }).length;
}

export function buildCreatureTypeCatalog(cards=[], {minCount=1}={}){
  const counts=new Map();
  const labels=new Map();
  for(const card of cards||[]){
    if(!isCreatureCard(card)) continue;
    for(const st of cardSubtypes(card)){
      counts.set(st.key,(counts.get(st.key)||0)+1);
      if(!labels.has(st.key)) labels.set(st.key,st.display);
    }
  }
  return [...counts.entries()]
    .filter(([,count])=>count>=Math.max(1,Number(minCount)||1))
    .map(([key,count])=>({key,name:labels.get(key)||key,count}))
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,'es'));
}

export function chooseBestCreatureType(cards=[], preferredCards=[]){
  const preferred=buildCreatureTypeCatalog(preferredCards,{minCount:1});
  if(preferred.length) return preferred[0].name;
  return buildCreatureTypeCatalog(cards,{minCount:1})[0]?.name || null;
}

export function typalEngineSummary(cards=[]){
  const catalog=buildCreatureTypeCatalog(cards,{minCount:1});
  return {
    version:TYPAL_ENGINE_VERSION,
    distinctCreatureTypes:catalog.length,
    topCreatureTypes:catalog.slice(0,12),
    supports:['hasSubtype','sharesCreatureType','countBySubtype','chooseCreatureType','typalTargets','typalLibrary','typalTriggers','typalLords','typalCostReduction']
  };
}
