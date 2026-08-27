import { maximumBipartiteAssignment } from './flexibleMatching.js';
// js/costEngine.js — Argentinia 23.15.4 · Cost Modifier / Payment Engine 2.0
// Capa pura para CR 601.2f/h: determina el coste final de maná y planifica métodos de pago.
// No conoce DOM ni importa main/state. Recibe el estado explícitamente y devuelve trazas
// deterministas, para compartir el mismo contrato entre humano, Tano, tests y multiplayer.

import { isCreaturePermanent, isArtifactPermanent, isLandPermanent, getPermanentTypes } from './permanentTypes.js';
import { cardStaticEffects, scopeApplies } from './landStax.js';
import { landRulesTextSuppressed } from './landCharacteristics.js';
import { cardHasSubtype, resolveSubtypeReference, countBySubtype } from './typalEngine.js';

export const COST_ENGINE_VERSION = '23.15.4';
const MANA_TYPES = Object.freeze(['W','U','B','R','G','C']);

export function emptyParsedManaCost() {
  return { W:0,U:0,B:0,R:0,G:0,C:0,generic:0 };
}

export function normalizeParsedManaCost(cost) {
  const out = emptyParsedManaCost();
  for (const k of MANA_TYPES) out[k] = Math.max(0, Math.floor(Number(cost?.[k]) || 0));
  out.generic = Math.max(0, Math.floor(Number(cost?.generic) || 0));
  const hybrid=(cost?.hybrid||[]).filter(x=>Array.isArray(x)&&x.length>=2).map(x=>[...x]);
  const phyrexian=(cost?.phyrexian||[]).filter(x=>['W','U','B','R','G'].includes(x));
  if(hybrid.length) out.hybrid=hybrid;
  if(phyrexian.length) out.phyrexian=[...phyrexian];
  return out;
}

export function parsedManaTotal(cost) {
  const c = normalizeParsedManaCost(cost);
  return MANA_TYPES.reduce((n,k)=>n+c[k],c.generic) + (c.hybrid?.length||0) + (c.phyrexian?.length||0);
}

function parseSimpleManaString(text) {
  const out = emptyParsedManaCost();
  for (const raw of String(text || '').match(/\{[^}]+\}/g) || []) {
    const symbol = raw.slice(1,-1).trim().toUpperCase();
    if (symbol === 'X') continue;
    if (MANA_TYPES.includes(symbol)) { out[symbol] += 1; continue; }
    if (/^\d+$/.test(symbol)) { out.generic += Math.max(0, Number(symbol) || 0); continue; }
    const parts=symbol.split('/').map(x=>x.trim()).filter(Boolean);
    if(parts.length===2&&parts[1]==='P'&&['W','U','B','R','G'].includes(parts[0])){
      if(!out.phyrexian) out.phyrexian=[]; out.phyrexian.push(parts[0]); continue;
    }
    if(parts.length===2&&parts.every(x=>MANA_TYPES.includes(x))){
      if(!out.hybrid) out.hybrid=[]; out.hybrid.push(parts);
    }
  }
  return out;
}

function addManaCosts(a,b) {
  const out = normalizeParsedManaCost(a);
  const rhs = normalizeParsedManaCost(b);
  for (const k of MANA_TYPES) out[k] += rhs[k];
  out.generic += rhs.generic;
  const hybrid=[...(out.hybrid||[]),...(rhs.hybrid||[])];
  const phyrexian=[...(out.phyrexian||[]),...(rhs.phyrexian||[])];
  if(hybrid.length) out.hybrid=hybrid; else delete out.hybrid;
  if(phyrexian.length) out.phyrexian=phyrexian; else delete out.phyrexian;
  return out;
}

function subtractManaCost(cost, reduction) {
  const out = normalizeParsedManaCost(cost);
  const r = normalizeParsedManaCost(reduction);
  // Reducciones coloreadas sólo reducen el símbolo indicado. La parte genérica jamás
  // puede comerse pips coloreados/incoloros, igual que en Magic.
  for (const k of MANA_TYPES) out[k] = Math.max(0, out[k] - r[k]);
  out.generic = Math.max(0, out.generic - r.generic);
  if(r.hybrid?.length&&out.hybrid?.length){
    for(const sym of r.hybrid){ const i=out.hybrid.findIndex(x=>x.join('/')===sym.join('/')); if(i>=0) out.hybrid.splice(i,1); }
    if(!out.hybrid.length) delete out.hybrid;
  }
  if(r.phyrexian?.length&&out.phyrexian?.length){
    for(const color of r.phyrexian){ const i=out.phyrexian.indexOf(color); if(i>=0) out.phyrexian.splice(i,1); }
    if(!out.phyrexian.length) delete out.phyrexian;
  }
  return out;
}

function battlefieldEntries(state) {
  if (!state) return [];
  const zones = [
    ['combat',true,state.localCombat], ['support',true,state.localSupport], ['lands',true,state.localLands], ['planeswalkers',true,state.localPlaneswalkers],
    ['combat',false,state.rivalCombat], ['support',false,state.rivalSupport], ['lands',false,state.rivalLands], ['planeswalkers',false,state.rivalPlaneswalkers]
  ];
  return zones.flatMap(([zone,isLocal,arr]) => (arr || []).map(item => ({ item, card:item?.card || null, zone, isLocal })));
}

function sourceEffectActive(item,effect) {
  if (!item || !effect) return false;
  if ((effect.whileSourceUntapped || effect.whileUntapped) && item.tapped) return false;
  return true;
}

function cardTypeTokens(card) {
  const text = String(card?.type || '').toLowerCase();
  const tokens = new Set();
  if (text.includes('criatura') || card?.power !== undefined) tokens.add('creature');
  if (text.includes('artefacto')) tokens.add('artifact');
  if (text.includes('encantamiento')) tokens.add('enchantment');
  if (text.includes('planeswalker')) tokens.add('planeswalker');
  if (text.includes('instantáneo') || text.includes('instantaneo')) tokens.add('instant');
  if (text.includes('conjuro')) tokens.add('sorcery');
  if (text.includes('tierra')) tokens.add('land');
  if (!tokens.has('creature')) tokens.add('noncreature');
  if (tokens.has('instant') || tokens.has('sorcery')) tokens.add('instant_or_sorcery');
  if (!tokens.has('land')) tokens.add('spell');
  return tokens;
}

function typeFilterMatches(card, wanted) {
  if (!wanted || wanted === 'any' || wanted === 'spell') return true;
  const tokens = cardTypeTokens(card);
  const list = Array.isArray(wanted) ? wanted : [wanted];
  return list.some(v => tokens.has(String(v).toLowerCase()));
}

function subtypeMatches(card,wanted,context={}) {
  if (!wanted) return true;
  const list = Array.isArray(wanted) ? wanted : [wanted];
  return list.map(s=>resolveSubtypeReference(s,context)).filter(Boolean).some(s => cardHasSubtype(card,s));
}

function colorMatches(card,wanted) {
  if (!wanted) return true;
  const colors = Array.isArray(card?.colors) ? card.colors.map(String) : [];
  const list = (Array.isArray(wanted) ? wanted : [wanted]).map(String);
  return list.some(c => colors.includes(c));
}

export function spellCostFilterMatches(card, filter = {}, context = {}) {
  if (!filter || typeof filter !== 'object') return true;
  if (!typeFilterMatches(card, filter.cardType || filter.type)) return false;
  if (filter.excludeCardType && typeFilterMatches(card, filter.excludeCardType)) return false;
  if (!subtypeMatches(card, filter.subtype || filter.subtypes, context)) return false;
  if (!colorMatches(card, filter.color || filter.colors)) return false;
  if (filter.multicolor === true && (card?.colors || []).length < 2) return false;
  if (filter.monocolor === true && (card?.colors || []).length !== 1) return false;
  if (filter.colorless === true && (card?.colors || []).length !== 0) return false;
  return true;
}

function countPermanents(state, isLocal, predicate) {
  return battlefieldEntries(state).filter(e => e.isLocal === isLocal && predicate(e.item)).length;
}

function countForPer(state, casterIsLocal, per, card) {
  if (!per) return 1;
  const kind = String(per.kind || per.count || '').toLowerCase();
  let n = 0;
  if (kind === 'artifact_you_control' || kind === 'artifacts_you_control') n = countPermanents(state,casterIsLocal,isArtifactPermanent);
  else if (kind === 'creature_you_control' || kind === 'creatures_you_control') n = countPermanents(state,casterIsLocal,isCreaturePermanent);
  else if (kind === 'land_you_control' || kind === 'lands_you_control') n = countPermanents(state,casterIsLocal,isLandPermanent);
  else if (kind === 'permanent_you_control' || kind === 'permanents_you_control') n = battlefieldEntries(state).filter(e=>e.isLocal===casterIsLocal).length;
  else if (kind === 'matching_permanent_you_control' || kind === 'matching_permanents_you_control') {
    n = battlefieldEntries(state).filter(e=>e.isLocal===casterIsLocal).filter(e=>{
      if(per.permanentType && !getPermanentTypes(e.item).includes(String(per.permanentType).toLowerCase())) return false;
      const wantedSubtype=resolveSubtypeReference(per.subtype,{sourceItem:per.sourceItem||null,sourceCard:per.sourceCard||null});
      if(wantedSubtype && !cardHasSubtype(e.card,wantedSubtype)) return false;
      if(per.color && !(e.card?.colors||[]).includes(per.color)) return false;
      return true;
    }).length;
  }
  else if (kind === 'creature_type_you_control' || kind === 'creatures_of_subtype_you_control' || kind === 'creatures_you_control_of_subtype') {
    const entries=battlefieldEntries(state);
    n=countBySubtype(entries,per.subtype || per.creatureType,{controllerIsLocal:casterIsLocal,sourceItem:per.sourceItem||null});
  }
  else if (kind === 'card_in_your_graveyard' || kind === 'cards_in_your_graveyard') n = (casterIsLocal ? state?.localGraveyard : state?.rivalGraveyard)?.length || 0;
  else if (kind === 'card_in_your_hand' || kind === 'cards_in_your_hand') n = (casterIsLocal ? state?.localHand : state?.rivalHand)?.length || 0;
  else if (kind === 'spell_colors') n = Array.isArray(card?.colors) ? card.colors.length : 0;
  else if (kind === 'fixed') n = Math.max(0, Number(per.count ?? per.value) || 0);
  else n = 0;
  if (Number.isFinite(Number(per.max))) n = Math.min(n, Math.max(0, Number(per.max)));
  if (Number.isFinite(Number(per.min))) n = Math.max(n, Math.max(0, Number(per.min)));
  return Math.max(0, Math.floor(n));
}

function normalizeModifier(spec, source = {}) {
  if (!spec || typeof spec !== 'object') return null;
  const modeRaw = spec.mode || spec.operation || spec.modifierType || (spec.type === 'spell_cost_modifier' ? null : spec.type);
  let mode = String(modeRaw || '').toLowerCase();
  if (['increase','add','tax'].includes(mode)) mode = 'increase';
  if (['reduce','reduction','discount'].includes(mode)) mode = 'reduce';
  if (['minimum','floor','set_minimum'].includes(mode)) mode = 'minimum';
  if (!['increase','reduce','minimum'].includes(mode)) {
    if (spec.increase != null || spec.costIncrease != null) mode = 'increase';
    else if (spec.reduce != null || spec.reduction != null || spec.costReduction != null) mode = 'reduce';
    else if (spec.minimumTotalMana != null || spec.minimum != null) mode = 'minimum';
  }
  if (!mode) return null;
  const rawMana = spec.manaCost ?? spec.cost ?? (mode === 'increase' ? spec.increase ?? spec.costIncrease : spec.reduce ?? spec.reduction ?? spec.costReduction);
  let manaCost;
  if (typeof rawMana === 'string') manaCost = parseSimpleManaString(rawMana);
  else if (rawMana && typeof rawMana === 'object') manaCost = normalizeParsedManaCost(rawMana);
  else manaCost = { ...emptyParsedManaCost(), generic:Math.max(0,Math.floor(Number(spec.amount) || 0)) };
  const per = spec.per && typeof spec.per === 'object' ? { ...spec.per, sourceItem:source.sourceItem || null, sourceCard:source.sourceCard || null } : null;
  return {
    mode,
    scope:spec.scope || 'own',
    filter:spec.filter || {
      cardType:spec.cardType || null, excludeCardType:spec.excludeCardType || null,
      subtype:spec.subtype || null, color:spec.color || null
    },
    manaCost,
    per,
    multiplier:Math.max(1,Math.floor(Number(spec.multiplier ?? per?.amount ?? 1) || 1)),
    minimumTotalMana:Math.max(0,Math.floor(Number(spec.minimumTotalMana ?? spec.minimum ?? 0) || 0)),
    sourceItem:source.sourceItem || null,
    sourceCard:source.sourceCard || null,
    sourceIsLocal:source.sourceIsLocal,
    sourceKind:source.sourceKind || 'static'
  };
}

function directCardModifiers(card) {
  const out = [];
  if (Array.isArray(card?.costModifiers)) out.push(...card.costModifiers);
  else if (card?.costModifier) out.push(card.costModifier);
  // Preset Affinity: reduce {1} por cada permanente del tipo indicado que controlás.
  if (card?.affinity) {
    const raw = card.affinity === true ? 'artifact' : (typeof card.affinity === 'string' ? card.affinity : card.affinity.permanentType || card.affinity.type || 'artifact');
    const kindMap = { artifact:'artifacts_you_control', creature:'creatures_you_control', land:'lands_you_control', permanent:'permanents_you_control' };
    out.push({ mode:'reduce', amount:1, scope:'own', per:{kind:kindMap[String(raw).toLowerCase()] || 'artifacts_you_control'} });
  }
  return out;
}

export function collectSpellCostModifiers(state, card, casterIsLocal) {
  const out = [];
  // Modificadores impresos en el propio hechizo (Affinity y equivalentes) no dependen de
  // estar en battlefield y siempre se evalúan para su controlador.
  for (const spec of directCardModifiers(card)) {
    const n = normalizeModifier(spec,{sourceCard:card,sourceIsLocal:casterIsLocal,sourceKind:'spell'});
    if (n && spellCostFilterMatches(card,n.filter,{sourceItem:null,sourceCard:card})) out.push(n);
  }
  for (const entry of battlefieldEntries(state)) {
    if (isLandPermanent(entry.item) && landRulesTextSuppressed(state,entry.item,entry.isLocal)) continue;
    for (const effect of cardStaticEffects(entry.card)) {
      if (effect?.type !== 'spell_cost_modifier' || !sourceEffectActive(entry.item,effect)) continue;
      if (!scopeApplies(effect.scope || 'own',entry.isLocal,casterIsLocal)) continue;
      const n = normalizeModifier(effect,{sourceItem:entry.item,sourceCard:entry.card,sourceIsLocal:entry.isLocal,sourceKind:'battlefield'});
      if (n && spellCostFilterMatches(card,n.filter,{sourceItem:entry.item,sourceCard:entry.card})) out.push(n);
    }
  }
  return out;
}

function scaledManaCost(manaCost, scale) {
  const c = normalizeParsedManaCost(manaCost);
  const n = Math.max(0, Math.floor(Number(scale) || 0));
  for (const k of MANA_TYPES) c[k] *= n;
  c.generic *= n;
  if(c.hybrid) c.hybrid=Array.from({length:n},()=>c.hybrid.map(x=>[...x])).flat();
  if(c.phyrexian) c.phyrexian=Array.from({length:n},()=>[...c.phyrexian]).flat();
  return c;
}

export function applySpellCostModifiers(state, card, casterIsLocal, baseCost, options = {}) {
  let cost = normalizeParsedManaCost(baseCost);
  const trace = [];
  const modifiers = options.modifiers || collectSpellCostModifiers(state,card,casterIsLocal);
  // CR 601.2f: aumentos primero, reducciones después, mínimos/floors al final.
  for (const mode of ['increase','reduce']) {
    for (const mod of modifiers.filter(m=>m.mode===mode)) {
      const count = mod.per ? countForPer(state,casterIsLocal,mod.per,card) : 1;
      const scale = count * (mod.multiplier || 1);
      if (scale <= 0) continue;
      const delta = scaledManaCost(mod.manaCost,scale);
      const before = normalizeParsedManaCost(cost);
      cost = mode === 'increase' ? addManaCosts(cost,delta) : subtractManaCost(cost,delta);
      trace.push({mode,count,scale,delta,before,after:normalizeParsedManaCost(cost),sourceCard:mod.sourceCard?.name || null});
    }
  }
  let minimum = Math.max(0,Math.floor(Number(options.minimumTotalMana) || 0));
  for (const mod of modifiers.filter(m=>m.mode==='minimum')) minimum = Math.max(minimum,mod.minimumTotalMana || parsedManaTotal(mod.manaCost));
  const total = parsedManaTotal(cost);
  if (minimum > total) {
    const before = normalizeParsedManaCost(cost);
    cost.generic += minimum-total;
    trace.push({mode:'minimum',minimum,before,after:normalizeParsedManaCost(cost),sourceCard:null});
  }
  return { cost:normalizeParsedManaCost(cost), trace, minimumTotalMana:minimum, modifiers };
}

export function getSpellPaymentMethods(card) {
  const out = [];
  const push = raw => {
    const spec = typeof raw === 'string' ? {type:raw} : raw;
    if (!spec?.type) return;
    const type = String(spec.type).toLowerCase();
    if (!['convoke','delve'].includes(type) || out.some(x=>x.type===type)) return;
    out.push({ ...spec, type });
  };
  if (card?.convoke) push(typeof card.convoke === 'object' ? {type:'convoke',...card.convoke} : 'convoke');
  if (card?.delve) push(typeof card.delve === 'object' ? {type:'delve',...card.delve} : 'delve');
  for (const raw of Array.isArray(card?.paymentMethods) ? card.paymentMethods : []) push(raw);
  return out;
}

function permanentColors(item) {
  return Array.isArray(item?.card?.colors) ? [...new Set(item.card.colors.filter(c=>MANA_TYPES.includes(c) && c!=='C'))] : [];
}

export function getConvokeCandidates(state,casterIsLocal,excludeItems=[]) {
  const excluded = new Set(excludeItems || []);
  const combat = casterIsLocal ? state?.localCombat : state?.rivalCombat;
  return (combat || []).filter(item=>isCreaturePermanent(item) && !item.tapped && !excluded.has(item));
}

export function applyConvokeToCost(baseCost, selectedCreatures = []) {
  const cost = normalizeParsedManaCost(baseCost);
  const resources = [...selectedCreatures];
  const demands = [];

  // Prioridad deliberada: pips fijos > híbridos > Phyrexian. Un símbolo Phyrexian todavía
  // puede pagarse con vida más adelante; un pip fijo no. El matching máximo evita el bug
  // greedy donde una multicolor se gastaba en W y dejaba B impagable pese a existir solución.
  for (const color of ['W','U','B','R','G']) {
    for (let i=0;i<Math.max(0,Number(cost[color])||0);i++) demands.push({kind:'fixed',color,options:[color]});
  }
  for (let i=0;i<(cost.hybrid||[]).length;i++) demands.push({kind:'hybrid',index:i,options:[...(cost.hybrid[i]||[])]});
  for (let i=0;i<(cost.phyrexian||[]).length;i++) {
    const color=cost.phyrexian[i]; demands.push({kind:'phyrexian',index:i,color,options:[color]});
  }

  const matching = maximumBipartiteAssignment(resources, demands, (item, demand) => {
    const colors = permanentColors(item);
    return demand.options.some(color => colors.includes(color));
  });
  const payments=[];
  const usedResourceIndexes=new Set();
  const matchedHybrid=new Set();
  const matchedPhyrexian=new Set();

  for (const {demandIndex,resourceIndex} of matching.assignments.sort((a,b)=>a.demandIndex-b.demandIndex)) {
    const demand=demands[demandIndex]; const item=resources[resourceIndex];
    usedResourceIndexes.add(resourceIndex);
    if(demand.kind==='fixed') { cost[demand.color]=Math.max(0,(cost[demand.color]||0)-1); payments.push({item,paid:demand.color}); }
    else if(demand.kind==='hybrid') { matchedHybrid.add(demand.index); payments.push({item,paid:`hybrid:${demand.options.join('/')}`}); }
    else { matchedPhyrexian.add(demand.index); payments.push({item,paid:`phyrexian:${demand.color}`}); }
  }

  if(Array.isArray(cost.hybrid)) {
    cost.hybrid=cost.hybrid.filter((_,index)=>!matchedHybrid.has(index));
    if(!cost.hybrid.length) delete cost.hybrid;
  }
  if(Array.isArray(cost.phyrexian)) {
    cost.phyrexian=cost.phyrexian.filter((_,index)=>!matchedPhyrexian.has(index));
    if(!cost.phyrexian.length) delete cost.phyrexian;
  }

  // Toda criatura seleccionada que no necesitó pagar un símbolo específico puede pagar {1}.
  for(let i=0;i<resources.length && cost.generic>0;i++) {
    if(usedResourceIndexes.has(i)) continue;
    usedResourceIndexes.add(i); cost.generic-=1; payments.push({item:resources[i],paid:'generic'});
  }
  return {cost,payments,usedItems:payments.map(p=>p.item)};
}

export function applyPhyrexianLifeToCost(baseCost, selectedIndexes = []) {
  const cost = normalizeParsedManaCost(baseCost);
  const symbols = [...(cost.phyrexian || [])];
  const wanted = [...new Set((selectedIndexes || []).filter(i=>Number.isInteger(i)&&i>=0&&i<symbols.length))].sort((a,b)=>b-a);
  const paid=[];
  for(const idx of wanted){ paid.push(symbols[idx]); symbols.splice(idx,1); }
  if(symbols.length) cost.phyrexian=symbols; else delete cost.phyrexian;
  paid.reverse();
  return {cost,paidSymbols:paid,life:paid.length*2};
}

export function applyDelveToCost(baseCost, selectedCards = []) {
  const cost = normalizeParsedManaCost(baseCost);
  const amount = Math.min(cost.generic, Math.max(0,selectedCards.length));
  cost.generic -= amount;
  return {cost, usedCards:selectedCards.slice(0,amount), amount};
}

export function planAutomaticPaymentMethods(state, card, casterIsLocal, baseCost, options={}) {
  let cost = normalizeParsedManaCost(baseCost);
  const plan = {convoke:[],convokePayments:[],delve:[]};
  const methods = getSpellPaymentMethods(card);
  if (methods.some(m=>m.type==='convoke')) {
    const candidates = getConvokeCandidates(state,casterIsLocal,options.excludeItems || []);
    const applied = applyConvokeToCost(cost,candidates);
    cost = applied.cost; plan.convoke = applied.usedItems; plan.convokePayments = applied.payments;
  }
  if (methods.some(m=>m.type==='delve') && cost.generic>0) {
    const grave = casterIsLocal ? state?.localGraveyard : state?.rivalGraveyard;
    const excluded = new Set(options.excludeCards || []);
    const candidates = (grave || []).filter(c=>c && !excluded.has(c)).slice(0,cost.generic);
    const applied = applyDelveToCost(cost,candidates);
    cost = applied.cost; plan.delve = applied.usedCards;
  }
  return {cost,plan};
}

export function costEngineSummary(result) {
  const c = normalizeParsedManaCost(result?.cost || result);
  const parts=[];
  for (const k of MANA_TYPES) if(c[k]) parts.push(`${c[k]}${k}`);
  for(const sym of c.hybrid||[]) parts.push(`{${sym.join('/')}}`);
  for(const color of c.phyrexian||[]) parts.push(`{${color}/P}`);
  if(c.generic) parts.push(`${c.generic} generic`);
  return parts.join(' + ') || '0';
}
