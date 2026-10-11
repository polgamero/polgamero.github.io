// Argentinia — Prioridad Inteligente HF3: inventario de acciones observacional.
// Nunca ejecuta una jugada. Comparte timing, coste FINAL y permisos con el motor real.
// `none` SOLO si cada ruta cubierta quedó descartada con pruebas canónicas.
// Mecánicas desconocidas, combinatoria excesiva o efectos que alteran permisos => `unknown`.
import { normalizeManaPool, canPoolPayCost } from './manaPool.js';
import { normalizeManaAbility, canActivateManaSourcePermanent } from './manaSources.js';
import { getEffectiveLandManaAbility, getEffectiveLandActivatedAbilities } from './landCharacteristics.js';
import { getActivatedAbilities, getGrantedAbilities, parseManaCost } from './utils.js';

const COLORS = Object.freeze(['W','U','B','R','G','C']);
const ZONES = Object.freeze(['localHand','localLands','localCombat','localSupport','localPlaneswalkers','localGraveyard','localExile']);
const EXOTIC = Object.freeze(['activeEffects','localSuspended','suspendedCards','suspendedSpells',
  'localAdventureCards','localForetellCards','localCommandZone','localPlayPermissions',
  'exilePlayPermissions','exilePlayPermissionLedger','scheduledReturns','deferredLandManaTriggers']);
const NON_STANDARD = Object.freeze(['convoke','delve','affinity','improvise','escape','flashback','suspend']);
const KNOWN_STATIC = new Set(['team_buff','team_keyword','spell_cost_modifier','play_lands_from_graveyard',
  'lands_enter_tapped','lands_dont_untap','land_type_add','land_untap_limit','land_mana_add',
  'land_type_set','land_abilities_remove','land_mana_override']);
const KNOWN_MANA = /^\{(?:[WUBRGCX]|\d+|[WUBRGC]\/[WUBRGC]|[WUBRG]\/P|T|Q)\}$/i;
const result=(legalActions,reason,details={})=>Object.freeze({legalActions,reason,...details});
const isLand=c=>String(c?.type||'').toLowerCase().includes('tierra');
const isMain=s=>s.activePlayer==='local' && (s.phase==='main1'||s.phase==='main2');
const isInstant=c=>String(c?.type||'').includes('Instantáneo') || (Array.isArray(c?.keywords)&&c.keywords.includes('flash'));
const canCastTiming=(s,c,depth)=>s.priorityPlayer==='local' && (isInstant(c)|| (depth===0&&isMain(s)));
const basicMoney=c=>c && typeof c==='object' && (typeof c.manaCost==='string'||c.manaCost==null);
const checkTokenString=(str,{ability=false}={})=>{
  if(typeof str!=='string')return false;
  const tokens=str.match(/\{[^}]+\}/g)||[];
  if(str.replace(/\{[^}]+\}/g,'').trim())return false;
  return tokens.every(t=>KNOWN_MANA.test(t) && (ability || !/^\{[TQ]\}$/i.test(t)));
};
function conservativeUnknownState(s) {
  // Los mapas complejos pueden conceder nuevas acciones fuera del catálogo clásico.
  // Hasta que haya una prueba específica para ese permiso, NO pasamos automáticamente.
  for(const k of EXOTIC){
    const v=s[k];
    if(v && ((Array.isArray(v)&&v.length>0) || (!Array.isArray(v)&&typeof v==='object'&&Object.keys(v).length>0) ||
        (typeof v!=='object' && v!==false && v!==0)))return k;
  }
  return null;
}
function readManaSources(s, helpers) {
  const pool=normalizeManaPool(s.localManaPool);
  const entries=[];
  for(const zone of ['localLands','localSupport','localCombat','localPlaneswalkers']) {
    for(const item of s[zone]) {
      if(!item || !item.card)return {status:'unknown',reason:'invalid_mana_permanent'};
      let mana;
      try { mana=zone==='localLands' ? getEffectiveLandManaAbility(s,item,true) : normalizeManaAbility(item.card); }
      catch {return {status:'unknown',reason:'effective_mana_error'};}
      if(!mana)continue;
      if(!Array.isArray(mana.options)||!mana.options.length ||
        !mana.options.every(c=>COLORS.includes(c)) || !Number.isSafeInteger(mana.amount)||mana.amount<=0)
        return {status:'unknown',reason:'unsupported_mana_source'};
      let haste=false;
      try{haste=!!helpers.getEffectiveKeywords?.(item)?.some(k=>String(k).toLowerCase()==='haste');}catch{}
      // El chequeo canónico de factibilidad de la fuente protege mareo/tap y ventanas.
      // Al calcular pagos NO descartamos una fuente que podría activarse en una
      // ventana 601/602, por eso sólo se omite por tap/mareo intrínsecos.
      if(!canActivateManaSourcePermanent(item,{hasHaste:haste||item.card?.keywords?.includes('haste'),ability:mana}))continue;
      if(mana.requiresTap===false && mana.sacrificeSelf===false)
        return {status:'unknown',reason:'unbounded_repeatable_mana'};
      entries.push({options:mana.options,amount:mana.amount});
    }
  }
  return {status:'ok',pool,entries};
}
// Decide si el coste es potencialmente pagable probando asignaciones completas,
// usando `canPoolPayCost` del motor existente para colores/híbridos/genérico.
// No resta maná, no gira fuentes, no pide targets. Tope explícito: fail-closed.
export function evaluateManaPayment(cost,model,{searchLimit=150000}={}) {
  if(!model || model.status!=='ok')return 'unknown';
  if(!cost || typeof cost!=='object')return 'unknown';
  const c={...cost};
  if(COLORS.some(k=>!Number.isSafeInteger(c[k]??0)||(c[k]??0)<0) ||
     !Number.isSafeInteger(c.generic??0)||(c.generic??0)<0 ||
     (c.hybrid && !Array.isArray(c.hybrid)) || (c.phyrexian && !Array.isArray(c.phyrexian)))return 'unknown';
  // Phyrexian puede pagarse con VIDA. Incluso sin maná la acción podría existir.
  if(c.phyrexian?.length)return 'unknown';
  const available=model.pool;
  if(canPoolPayCost(available,c))return 'possible';
  const upper=COLORS.reduce((n,k)=>n+available[k],0)+model.entries.reduce((n,s)=>n+s.amount,0);
  const total=COLORS.reduce((n,k)=>n+(c[k]||0),c.generic||0)+(c.hybrid?.length||0);
  if(total>upper)return 'impossible';
  for(const color of COLORS){
    const colorMaximum=available[color]+model.entries.filter(e=>e.options.includes(color)).reduce((n,e)=>n+e.amount,0);
    if((c[color]||0)>colorMaximum)return 'impossible';
  }
  const mutable={...available};let visited=0,found=false,exhausted=false;
  function walk(i){
    if(found||exhausted)return;
    if(++visited>searchLimit){exhausted=true;return;}
    if(canPoolPayCost(mutable,c)){found=true;return;}
    if(i>=model.entries.length)return;
    walk(i+1);
    const source=model.entries[i];
    for(const color of source.options){
      mutable[color]+=source.amount;
      walk(i+1);
      mutable[color]-=source.amount;
      if(found||exhausted)break;
    }
  }
  walk(0);
  return found?'possible':exhausted?'unknown':'impossible';
}
function castAffordability(s,card,model,h,{baseOverride=null,fromExile=false}={}) {
  const initial=baseOverride===null?card.manaCost:baseOverride;
  if(!basicMoney(card)||typeof initial!=='string'&&initial!=null)return 'unknown';
  if(card.alternativeCost || NON_STANDARD.some(k=>card[k] && k!=='flashback'&&k!=='escape'&&k!=='suspend')) {
    // La ruta estándar puede ser imposible, pero hay un segundo método potencial.
    // No probamos que ese segundo método sea imposible sin su validador canónico.
    return 'unknown';
  }
  if(fromExile)return 'unknown'; // permisos pueden modificar el coste / castear gratis
  if(typeof h.getFinalCastingManaCost!=='function')return 'unknown';
  let data;
  try{data=h.getFinalCastingManaCost(card,baseOverride===null?{isLocal:true}:{isLocal:true,baseOverride});}
  catch{return 'unknown';}
  if(!data || !checkTokenString(data.manaString??''))return 'unknown';
  return evaluateManaPayment(data.cost,model);
}
function abilityAffordability(s,item,ability,model,h) {
  if(!ability || typeof ability!=='object')return 'unknown';
  if(typeof h.canActivateActivatedAbilityNow!=='function')return 'unknown';
  let canActivate=false;
  try{canActivate=h.canActivateActivatedAbilityNow(ability,true);}catch{return 'unknown';}
  if(!canActivate)return 'impossible';
  const raw=ability.cost??'';
  if(!checkTokenString(raw,{ability:true}))return 'unknown';
  if(/\{Q\}/i.test(raw))return 'unknown';
  if(/\{T\}/i.test(raw)){
    if(item.tapped)return 'impossible';
    if(s.localCombat.includes(item)&&item.summoningSickness && !h.getEffectiveKeywords?.(item)?.includes('haste'))return 'impossible';
  }
  if(ability.crewCost!==undefined){
    // Mismo criterio de tripulación: cualquier combinación de criaturas enderezadas,
    // sin bloquear por mareo; el vehículo nunca puede tripularse a sí mismo.
    if(typeof h.getEffectivePower!=='function')return 'unknown';
    let total=0;
    for(const candidate of s.localCombat){
      if(candidate===item || candidate.tapped)continue;
      let power;
      try{power=Number(h.getEffectivePower(candidate));}catch{return 'unknown';}
      if(!Number.isFinite(power))return 'unknown';
      total+=Math.max(0,power);
    }
    return total >= Number(ability.crewCost) ? 'possible' : 'impossible';
  }
  if(ability.additionalCost || ability.sacrifice)
    return 'unknown'; // requiere prueba de materiales/selecciones antes de declarar ausencia
  const parsed=parseManaCost(raw.replaceAll(/\{[TQ]\}/ig,''));
  return evaluateManaPayment(parsed,model);
}
function actionSummary(s,options,h){
  const stackDepth=options.stackDepth;
  if(!s||s.currentMatch||!Number.isSafeInteger(stackDepth)||stackDepth<0)return result('unknown','nonlocal_or_unverified_stack');
  if(s.priorityPlayer!=='local')return result('unknown','not_local_priority');
  if(ZONES.some(z=>!Array.isArray(s[z])))return result('unknown','unverified_zone');
  if(!s.localManaPool||typeof s.localManaPool!=='object'||Array.isArray(s.localManaPool) ||
     Object.entries(s.localManaPool).some(([k,v])=>!COLORS.includes(k)||!Number.isFinite(v)||v<0))
     return result('unknown','unverified_pool');
  // La propia pila puede contener un hechizo que necesita respuesta o trigger;
  // en HF3 Smart no pasa sobre la pila aunque no se detecten otras acciones.
  if(stackDepth>0)return result('unknown','stack_requires_inspection');
  const effects=conservativeUnknownState(s);
  if(effects)return result('unknown','external_permission_or_effect',{category:effects});
  const model=readManaSources(s,h);
  if(model.status!=='ok')return result('unknown',model.reason);
  let evaluated=0;
  let unknown=false;
  let firstUnknown='';
  function record(out,category){
    evaluated++;
    if(out==='possible')return result('available','legal_'+category,{evaluated});
    if(out==='unknown'){unknown=true;firstUnknown ||= category;}
    return null;
  }
  for(const card of s.localHand){
    if(!card||typeof card.type!=='string')return result('unknown','invalid_hand_card');
    if(isLand(card)){
      if(isMain(s)&&!s.localLandPlayedThisTurn)return result('available','land_drop',{evaluated});
      continue;
    }
    try{if(h.canSuspendCardFromHand?.(card)) {
      const spec=card.suspend;
      if(typeof spec?.cost!=='string')return result('unknown','suspend_cost');
      const status=evaluateManaPayment(parseManaCost(spec.cost),model);
      const hit=record(status,'suspend');if(hit)return hit;
    }}catch{return result('unknown','suspend_timing_error');}
    if(!canCastTiming(s,card,stackDepth))continue;
    if(typeof h.canPlayCard!=='function')return result('unknown','missing_cast_validator');
    let legal;
    try{legal=h.canPlayCard(card);}catch{return result('unknown','cast_validator_error');}
    if(!legal)continue;
    const hit=record(castAffordability(s,card,model,h),'hand_spell');if(hit)return hit;
  }
  for(const zone of ['localLands','localSupport','localCombat']){
    for(const item of s[zone]){
      if(!item?.card)return result('unknown','invalid_permanent');
      const staticRules=[item.card.staticEffect,...(Array.isArray(item.card.staticEffects)?item.card.staticEffects:[])].filter(Boolean);
      if(staticRules.some(e=>!KNOWN_STATIC.has(e?.type)))unknown=true;
      // Cualquier concesión dinámica de habilidades aún no incorporada al inventario
      // impide demostrar ausencia. El fallo siempre es hacia prioridad MANUAL.
      if((Array.isArray(item.grantedAbilities)&&item.grantedAbilities.length>0) ||
         (Array.isArray(item.card.abilities)&&item.card.abilities.length>0) ||
         (Array.isArray(item.tempEffects)&&item.tempEffects.some(e=>e?.activatedAbility||e?.grantedAbility)))
         unknown=true;
      const abilities=zone==='localLands'?getEffectiveLandActivatedAbilities(s,item,true):getActivatedAbilities(item.card);
      if(!Array.isArray(abilities))return result('unknown','invalid_ability_list');
      for(const ab of abilities){
        const hit=record(abilityAffordability(s,item,ab,model,h),'activated_ability');if(hit)return hit;
      }
      if(zone==='localCombat'){
        const attached=h.getEquipmentOn?.(item);
        if(attached===undefined && typeof h.getEquipmentOn!=='function')return result('unknown','unverified_granted_abilities');
        for(const eq of attached||[]){
          for(const ab of getGrantedAbilities(eq?.card)){
            const hit=record(abilityAffordability(s,item,ab,model,h),'granted_ability');if(hit)return hit;
          }
        }
      }
    }
  }
  // Creencia es una acción propia de Main, con pila vacía y una vez por turno.
  if(isMain(s))for(const item of s.localPlaneswalkers){
    if(!item?.card)return result('unknown','invalid_semidios');
    if(!item.abilityUsedThisTurn && Array.isArray(item.card.loyaltyAbilities) &&
       item.card.loyaltyAbilities.some(ab=>Number.isFinite(Number(ab.cost))&&item.loyalty+Number(ab.cost)>=0))
       return result('available','loyalty_ability',{evaluated});
    if(!item.abilityUsedThisTurn && !Array.isArray(item.card.loyaltyAbilities))unknown=true;
  }
  for(const card of s.localGraveyard){
    if(!card)return result('unknown','invalid_graveyard_card');
    if(isLand(card)){
      if(typeof h.canPlayLandFromGraveyard==='function' && h.canPlayLandFromGraveyard(card,true))return result('available','graveyard_land',{evaluated});
      continue;
    }
    const permission=card.flashback?.cost?card.flashback:card.escape?.cost?card.escape:null;
    if(!permission||!canCastTiming(s,card,stackDepth))continue;
    const status=castAffordability(s,card,model,h,{baseOverride:permission.cost});
    const hit=record(status,'graveyard_spell');if(hit)return hit;
  }
  for(const card of s.localExile){
    if(!card)return result('unknown','invalid_exile_card');
    if(typeof h.getExilePlayPermissionForCard!=='function')return result('unknown','missing_exile_permission_validator');
    let permission;
    try{permission=h.getExilePlayPermissionForCard(card,true);}catch{return result('unknown','exile_permission_error');}
    if(!permission)continue;
    if(typeof h.canPlayCardFromExile!=='function')return result('unknown','missing_exile_cast_validator');
    try{if(!h.canPlayCardFromExile(card,true))continue;}catch{return result('unknown','exile_timing_error');}
    // El permiso puede ser gratis o alternativo: nunca descartarlo por un coste impreso.
    return result('available','exile_permission',{evaluated});
  }
  return unknown?result('unknown','unverified_'+firstUnknown,{evaluated}):result('none','no_legal_actions_after_canonical_checks',{evaluated});
}
export function proveNoRelevantLegalActions(s,options={}) {
  try{return actionSummary(s,options,options.adapters||{});}
  catch{return result('unknown','legal_action_analysis_failed');}
}
