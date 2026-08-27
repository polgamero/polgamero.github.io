import { getCounterCount, consumeCounter } from './counterEngine.js';
import { cardHasSubtype } from './typalEngine.js';

// js/replacementEngine.js — Argentinia 23.15.5 · Replacement + Prevention Engine
// Pipeline puro para eventos que todavía NO ocurrieron. Recibe state explícito y devuelve
// el evento final a commitear. No importa main/Stack/UI para evitar un segundo rules loop.

const MAX_REPLACEMENT_PASSES = 24;

function battlefieldEntries(state) {
  if (!state) return [];
  const pairs = [
    ['localCombat',true],['localSupport',true],['localLands',true],['localPlaneswalkers',true],
    ['rivalCombat',false],['rivalSupport',false],['rivalLands',false],['rivalPlaneswalkers',false]
  ];
  return pairs.flatMap(([key,isLocal]) => (state[key] || []).map(item => ({item,isLocal})));
}

function cardSpecs(card) {
  if (!card) return [];
  const out=[];
  if (card.replacementEffect) out.push(card.replacementEffect);
  if (Array.isArray(card.replacementEffects)) out.push(...card.replacementEffects);
  const statics=[card.staticEffect,...(Array.isArray(card.staticEffects)?card.staticEffects:[])].filter(Boolean);
  out.push(...statics.filter(spec => ['replacement_effect','prevention_effect'].includes(spec?.type)));
  return out.filter(Boolean);
}

function sourceActive(item,spec){
  if (!item || !spec) return false;
  if ((spec.whileSourceUntapped || spec.whileUntapped) && item.tapped) return false;
  return true;
}

function relationMatches(rel,sourceIsLocal,targetIsLocal){
  const r=String(rel || 'all').toLowerCase();
  if (['all','any','each'].includes(r)) return true;
  if (['own','you','self','controller'].includes(r)) return sourceIsLocal===targetIsLocal;
  if (['opponent','opponents','rival'].includes(r)) return sourceIsLocal!==targetIsLocal;
  return true;
}

function textIncludes(type, needle){ return String(type || '').toLowerCase().includes(needle); }
function cardMatchesTypeToken(card, rawToken){
  const token=String(rawToken || '').trim().toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');
  const type=String(card?.type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const isCreature=type.includes('criatura');
  if(token==='creature') return isCreature;
  if(token==='noncreature') return !isCreature;
  if(token==='artifact') return type.includes('artefacto');
  if(token==='enchantment') return type.includes('encantamiento');
  if(token==='land') return type.includes('tierra');
  if(token==='planeswalker') return type.includes('planeswalker');
  if(token==='instant') return type.includes('instantaneo');
  if(token==='sorcery') return type.includes('conjuro');
  if(token==='instant_or_sorcery') return type.includes('instantaneo') || type.includes('conjuro');
  return type.includes(token);
}
function cardMatchesFilter(card,filter={}){
  if(!filter || typeof filter!=='object') return true;
  const type=String(card?.type || '');
  if(filter.cardType){
    const wanted=Array.isArray(filter.cardType)?filter.cardType:[filter.cardType];
    if(!wanted.some(x=>cardMatchesTypeToken(card,x))) return false;
  }
  if(filter.excludeCardType && cardMatchesTypeToken(card,filter.excludeCardType)) return false;
  if(filter.subtype && !cardHasSubtype(card,filter.subtype)) return false;
  if(filter.color){
    const colors=card?.colors || [];
    if(!colors.includes(filter.color)) return false;
  }
  return true;
}

function eventKindMatches(spec,event){
  const wanted=String(spec.event || spec.eventType || '').toLowerCase();
  const actual=String(event.type || '').toLowerCase();
  if(!wanted || wanted==='any') return true;
  if(wanted===actual) return true;
  if(wanted==='zone_change_to_graveyard') return actual==='zone_change' && event.zoneTo==='graveyard';
  if(wanted==='graveyard') return actual==='zone_change' && event.zoneTo==='graveyard';
  if(wanted==='token_create') return actual==='token_create';
  if(wanted==='counter_add') return actual==='counter_add';
  if(wanted==='damage') return actual==='damage';
  if(wanted==='destroy') return actual==='destroy';
  return false;
}

function specMatches(spec,event,sourceIsLocal){
  if(!eventKindMatches(spec,event)) return false;
  const affectedIsLocal = event.affectedIsLocal ?? event.targetIsLocal ?? event.controllerIsLocal ?? true;
  if(!relationMatches(spec.scope || spec.controller || 'all',sourceIsLocal,affectedIsLocal)) return false;
  const filter=spec.filter || {};
  if(!cardMatchesFilter(event.card || event.targetCard || event.item?.card,filter)) return false;
  if(filter.zoneFrom && filter.zoneFrom!==event.zoneFrom) return false;
  if(filter.zoneTo && filter.zoneTo!==event.zoneTo) return false;
  if(filter.cause && filter.cause!==event.cause) return false;
  if(filter.combat!==undefined && !!filter.combat!==!!event.combat) return false;
  if(filter.counterType && filter.counterType!==(event.counterType || event.metadata?.counterType)) return false;
  if(filter.minAmount!==undefined && Number(event.amount||0)<Number(filter.minAmount)) return false;
  if(filter.maxAmount!==undefined && Number(event.amount||0)>Number(filter.maxAmount)) return false;
  return true;
}

function stableReplacementId(sourceItem,spec,index){
  const sid=sourceItem?._syncObjectId || sourceItem?._effectObjectId || sourceItem?.card?.id || sourceItem?.card?.name || 'source';
  return String(spec.id || `${sid}:replacement:${index}`);
}

function collectStaticCandidates(state,event){
  const out=[];
  for(const {item,isLocal} of battlefieldEntries(state)){
    const specs=cardSpecs(item?.card);
    specs.forEach((spec,index)=>{
      if(!sourceActive(item,spec) || !specMatches(spec,event,isLocal)) return;
      out.push({kind:'static',id:stableReplacementId(item,spec,index),spec,sourceItem:item,sourceCard:item.card,sourceIsLocal:isLocal,priority:Number(spec.priority||0)});
    });
  }
  return out;
}

function activeEffectTargetMatches(effect,event){
  if(effect.targetPlayer){
    const local = effect.targetPlayer==='local';
    if((event.targetIsLocal ?? event.affectedIsLocal)!==local) return false;
  }
  if(effect.targetObjectId){
    const item=event.item || event.targetItem || null;
    const ids=[item?._syncObjectId,item?._effectObjectId].filter(Boolean);
    if(!ids.includes(effect.targetObjectId)) return false;
  }
  return true;
}

function collectActivePrevention(state,event){
  if(event.type!=='damage') return [];
  return (state?.activeEffects || []).flatMap((effect,index)=>{
    if(!['prevent_damage','prevent_next_damage'].includes(effect?.effectType)) return [];
    if(!activeEffectTargetMatches(effect,event)) return [];
    if(effect.combatOnly && !event.combat) return [];
    if(effect.noncombatOnly && event.combat) return [];
    return [{kind:'active_prevention',id:String(effect.id ?? `active:${index}`),spec:effect,activeIndex:index,priority:Number(effect.priority||0)}];
  });
}

function collectShieldCounter(state,event){
  const item=event.item || event.targetItem;
  if(getCounterCount(item,'shield')<=0) return [];
  if(event.type!=='damage' && event.type!=='destroy') return [];
  if(event.type==='damage' && Math.max(0,Number(event.amount)||0)<=0) return [];
  return [{kind:'shield_counter',id:`shield:${item._syncObjectId || item._effectObjectId || item.card?.id || 'item'}`,spec:{priority:1000},sourceItem:item,priority:1000}];
}

export function collectReplacementEffects(state,event){
  return [
    ...collectShieldCounter(state,event),
    ...collectActivePrevention(state,event),
    ...collectStaticCandidates(state,event)
  ].sort((a,b)=>(Number(b.priority||0)-Number(a.priority||0)) || String(a.id).localeCompare(String(b.id)));
}

function applyStaticSpec(event,spec){
  const out={...event};
  const action=String(spec.action || spec.mode || '').toLowerCase();
  if(spec.replaceZoneTo || action==='redirect_zone'){
    out.zoneTo=spec.replaceZoneTo || spec.destination || spec.zoneTo || out.zoneTo;
  }
  const mult=Number(spec.multiplyAmount ?? spec.multiplier ?? (action==='double'?2:1));
  if(Number.isFinite(mult) && mult!==1 && out.amount!==undefined) out.amount=Math.max(0,Number(out.amount||0)*mult);
  if(spec.setAmount!==undefined && out.amount!==undefined) out.amount=Math.max(0,Number(spec.setAmount)||0);
  if(action==='prevent' || spec.prevent===true || spec.preventAll===true){ out.amount=0; out.prevented=true; }
  if(spec.preventAmount!==undefined && out.amount!==undefined){
    const p=spec.preventAmount==='all' ? Number(out.amount||0) : Math.max(0,Number(spec.preventAmount)||0);
    out.amount=Math.max(0,Number(out.amount||0)-p); if(out.amount===0) out.prevented=true;
  }
  if(action==='prevent_destroy' && out.type==='destroy') out.prevented=true;
  return out;
}

function applyCandidate(state,event,candidate){
  if(candidate.kind==='shield_counter'){
    const item=candidate.sourceItem;
    const change=consumeCounter(item,'shield',1);
    const removed=Math.max(0,Number(change?.removed)||0);
    return {
      ...event,
      amount:event.type==='damage'?0:event.amount,
      prevented:true,
      shieldCounterConsumed:removed>0,
      counterRemovedByReplacement:removed>0 ? {
        counterType:'shield',
        amount:removed,
        cause:event.type==='damage' ? 'shield_damage_replacement' : 'shield_destroy_replacement'
      } : null
    };
  }
  if(candidate.kind==='active_prevention'){
    const effect=(state.activeEffects||[])[candidate.activeIndex];
    if(!effect) return event;
    const current=Math.max(0,Number(event.amount||0));
    const remaining=effect.remaining==='all' ? current : Math.max(0,Number(effect.remaining ?? effect.amount ?? 0));
    const prevented=Math.min(current,remaining);
    const out={...event,amount:Math.max(0,current-prevented),prevented:current>0 && current-prevented===0,preventedAmount:(event.preventedAmount||0)+prevented};
    if(effect.remaining!=='all'){
      effect.remaining=Math.max(0,remaining-prevented);
      if(effect.remaining<=0) state.activeEffects.splice(candidate.activeIndex,1);
    } else if(effect.consumeOnUse!==false) state.activeEffects.splice(candidate.activeIndex,1);
    return out;
  }
  return applyStaticSpec(event,candidate.spec || {});
}

export function resolveReplacementEvent(state,rawEvent={},options={}){
  let event={...rawEvent};
  const applied=[];
  const seen=new Set();
  for(let pass=0;pass<MAX_REPLACEMENT_PASSES;pass++){
    const candidates=collectReplacementEffects(state,event).filter(c=>!seen.has(c.id));
    if(!candidates.length) break;
    let chosen=candidates[0];
    if(typeof options.chooseReplacement==='function' && candidates.length>1){
      const selection=options.chooseReplacement(candidates,event);
      if(selection){
        if(typeof selection==='string') chosen=candidates.find(c=>c.id===selection) || chosen;
        else if(candidates.includes(selection)) chosen=selection;
      }
    }
    seen.add(chosen.id); applied.push(chosen.id);
    event=applyCandidate(state,event,chosen);
    if(event.prevented && (event.type==='destroy' || Number(event.amount||0)<=0)) break;
  }
  return {event,prevented:!!event.prevented,applied,changed:applied.length>0};
}

export function replacementEngineSummary(){
  return {
    version:'23.15.5',
    events:['damage','destroy','zone_change','token_create','counter_add'],
    actions:['redirect_zone','multiply_amount','set_amount','prevent','prevent_amount','prevent_destroy'],
    supports:['static_replacements','active_damage_prevention','shield_counter','affected_player_order_hook']
  };
}

export { MAX_REPLACEMENT_PASSES };
