// js/prebuiltDecks.js
// ENTREGA 23.17.3 — catálogo/validación/resumen de Mazos Prearmados.
// Puro salvo loadPrebuiltDeckCatalog(), que sólo hace fetch del JSON versionado del repo.

import { inferCardDeckProfile } from './deckIntelligence.js';

export const PREBUILT_DECKS_VERSION = '23.17.3';
export const PREBUILT_DECK_CATALOG_URL = new URL('../assets/data/prebuilt-decks.json', import.meta.url).href;

let cachedCatalog = null;

function norm(value='') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function isLand(card) { return norm(card?.type).includes('tierra'); }
function isBasicLand(card) { return isLand(card) && norm(card?.type).includes('basica'); }

export async function loadPrebuiltDeckCatalog({ force = false } = {}) {
  if (!force && cachedCatalog) return cachedCatalog;
  const response = await fetch(PREBUILT_DECK_CATALOG_URL, { cache:'no-store' });
  if (!response.ok) throw new Error(`PREBUILT_CATALOG_HTTP_${response.status}`);
  const raw = await response.json();
  const normalized = normalizePrebuiltDeckCatalog(raw);
  if (!normalized.ok) {
    const error = new Error(`PREBUILT_CATALOG_INVALID:${normalized.errors.join('|')}`);
    error.code = 'PREBUILT_CATALOG_INVALID';
    throw error;
  }
  cachedCatalog = normalized.catalog;
  return cachedCatalog;
}

export function resetPrebuiltDeckCatalogCache() { cachedCatalog = null; }

export function normalizePrebuiltDeckCatalog(raw) {
  const errors=[];
  const products = Array.isArray(raw?.products) ? raw.products : [];
  if (String(raw?.version || '') !== PREBUILT_DECKS_VERSION) errors.push('version');
  if (products.length < 1) errors.push('products-empty');
  const ids=new Set(), images=new Set();
  const normalized=[];
  for (const item of products) {
    const id=String(item?.id||'').trim();
    const name=String(item?.name||'').trim();
    const colors=Array.isArray(item?.colors)?[...new Set(item.colors.map(c=>String(c).toUpperCase()))]:[];
    const cardIds=Array.isArray(item?.cardIds)?item.cardIds.map(String):[];
    const image=String(item?.image||'').trim();
    if (!id || ids.has(id)) errors.push(`id:${id||'missing'}`); else ids.add(id);
    if (!name) errors.push(`name:${id}`);
    if (colors.length < 1 || colors.length > 2 || colors.some(c=>!'WUBRG'.includes(c))) errors.push(`colors:${id}`);
    if (cardIds.length !== 60) errors.push(`size:${id}:${cardIds.length}`);
    if (!image || images.has(image)) errors.push(`image:${id}:${image||'missing'}`); else images.add(image);
    normalized.push({
      id,name,colors,archetypeId:String(item?.archetypeId||''),archetypeLabel:String(item?.archetypeLabel||''),
      image,cardIds,report:item?.report && typeof item.report==='object'?item.report:{},
    });
  }
  return { ok:errors.length===0, errors, catalog:{ version:PREBUILT_DECKS_VERSION, products:normalized } };
}

export function validatePrebuiltDeckProduct(product, cards) {
  const errors=[];
  const byId = cards instanceof Map ? cards : new Map((cards||[]).map(c=>[c.id,c]));
  if (!product || !Array.isArray(product.cardIds) || product.cardIds.length!==60) errors.push('size');
  const counts=new Map();
  for (const id of product?.cardIds||[]) {
    const card=byId.get(id);
    if (!card) { errors.push(`missing:${id}`); continue; }
    const cols=Array.isArray(card.colors)?card.colors:[];
    if (cols.some(c=>!product.colors.includes(c))) errors.push(`offcolor:${id}`);
    counts.set(id,(counts.get(id)||0)+1);
    if (!isBasicLand(card)) {
      const max=isLand(card)?2:4;
      if (counts.get(id)>max) errors.push(`copies:${id}:${counts.get(id)}`);
    }
  }
  return {ok:errors.length===0,errors};
}

export function validatePrebuiltDeckCatalog(catalog, cards) {
  const normalized=normalizePrebuiltDeckCatalog(catalog);
  const errors=[...normalized.errors];
  normalized.catalog.products.forEach(product=>{
    const result=validatePrebuiltDeckProduct(product,cards);
    result.errors.forEach(err=>errors.push(`${product.id}:${err}`));
  });
  return {ok:errors.length===0,errors,catalog:normalized.catalog};
}

export function getPrebuiltPurchaseIds(profile) {
  const value=profile?.prebuiltDeckPurchases;
  if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  if (value && typeof value==='object') return Object.keys(value).filter(k=>value[k]);
  return [];
}

export function summarizePrebuiltDeck(product, cards) {
  const byId = cards instanceof Map ? cards : new Map((cards||[]).map(c=>[c.id,c]));
  const deck=(product?.cardIds||[]).map(id=>byId.get(id)).filter(Boolean);
  const summary={
    total:deck.length, lands:0, creatures:0, instants:0, sorceries:0, enchantments:0, artifacts:0, planeswalkers:0,
    rarity:{Common:0,Uncommon:0,Rare:0,Mythic:0}, landColors:{W:0,U:0,B:0,R:0,G:0,C:0,Other:0},
    curve:{1:0,2:0,3:0,4:0,5:0,'6+':0}, averageManaValue:0, themes:{}, roles:{}, notable:[]
  };
  let mvSum=0, nonlands=0;
  for(const card of deck){
    const type=norm(card.type);
    if(type.includes('tierra')) {
      summary.lands++;
      const prod=String(card.produces||'').toUpperCase();
      if('WUBRG'.includes(prod)) summary.landColors[prod]++;
      else if(prod==='C') summary.landColors.C++;
      else summary.landColors.Other++;
    } else {
      nonlands++;
      const mv=Math.max(0,Number(card.cmc)||0); mvSum+=mv;
      const bucket=mv>=6?'6+':String(Math.max(1,Math.floor(mv)||1));
      if(Object.prototype.hasOwnProperty.call(summary.curve,bucket)) summary.curve[bucket]++;
    }
    if(type.includes('criatura')) summary.creatures++;
    else if(type.includes('instantaneo')) summary.instants++;
    else if(type.includes('conjuro')) summary.sorceries++;
    else if(type.includes('encantamiento')) summary.enchantments++;
    else if(type.includes('artefacto')) summary.artifacts++;
    else if(type.includes('planeswalker')) summary.planeswalkers++;
    const rarity=String(card.rarity||'Common'); if(summary.rarity[rarity]!==undefined) summary.rarity[rarity]++;
    const profile=inferCardDeckProfile(card);
    for(const theme of profile.themes||[]) summary.themes[theme]=(summary.themes[theme]||0)+1;
    for(const role of profile.roles||[]) summary.roles[role]=(summary.roles[role]||0)+1;
  }
  summary.averageManaValue=nonlands?Math.round((mvSum/nonlands)*100)/100:0;
  summary.notable=[...new Map(deck.filter(c=>['Mythic','Rare'].includes(c.rarity)).map(c=>[c.id,c])).values()]
    .sort((a,b)=>(b.rarity==='Mythic')-(a.rarity==='Mythic') || (Number(b.cmc)||0)-(Number(a.cmc)||0))
    .slice(0,5).map(c=>({id:c.id,name:c.name,rarity:c.rarity}));
  summary.topThemes=Object.entries(summary.themes).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count}));
  return summary;
}
