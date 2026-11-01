import {resolveReplacementEvent} from './replacementEngine.js';
import {changeCounterCount,getCounterCount} from './counterEngine.js';
import {combatUnitValue} from './combatBot2.js';

// Advisory public-board model. Authoritative combat, triggers, targets and priority
// still go through combatRules/Stack. No hands, libraries, RNG or live mutations.
const ZONES=['localCombat','localSupport','localLands','localPlaneswalkers','rivalCombat','rivalSupport','rivalLands','rivalPlaneswalkers'];
const KEYWORDS=['firststrike','doublestrike','deathtouch','indestructible','infect','lifelink','life_link','trample','vigilance','flying','reach','menace','defender','haste',...['W','U','B','R','G'].map(c=>'protection_'+c)];
const n=value=>Math.max(0,Number(value)||0);
const kw=(unit,name)=>unit._combat3Keywords.includes(name);
export const combat3Power=u=>Math.max(0,u._combat3Power+counterDelta(u));
export const combat3Toughness=u=>u._combat3Toughness+counterDelta(u);
function counterDelta(u){return getCounterCount(u,'plusOne')-u._combat3Plus-getCounterCount(u,'minusOne')+u._combat3Minus;}
const dead=u=>u._combat3Dead||combat3Toughness(u)<=0||(!kw(u,'indestructible')&&(n(u.damageTaken)>=combat3Toughness(u)||(u.tookDeathtouch&&n(u.damageTaken)>0)));
// Mirror the current canonical substep filter separately from SBA survival.
// Advisory AI must not silently change the authoritative/PvP damage rules.
const inactive=u=>u._combat3Dead||n(u.damageTaken)>=combat3Toughness(u)||(u.tookDeathtouch&&n(u.damageTaken)>0);
const first=u=>kw(u,'firststrike')||kw(u,'doublestrike');
const regular=u=>!kw(u,'firststrike')||kw(u,'doublestrike');

export function publicCombatState3(state){
  const out={activeEffects:state.activeEffects||[],combatDamagePrevented:state.combatDamagePrevented===true};
  for(const zone of ZONES)out[zone]=state[zone]||[];
  for(const key of ['localHP','rivalHP','localPoison','rivalPoison'])out[key]=state[key];
  return out;
}

export function prepareCombat3({publicState,helpers,extras=[]}){
  const keys=new Map(),state={activeEffects:structuredClone(publicState.activeEffects||[]),combatDamagePrevented:publicState.combatDamagePrevented===true},uncertainty=new Set();
  for(const field of ['localHP','rivalHP','localPoison','rivalPoison'])state[field]=Number(publicState[field]??(field.endsWith('HP')?20:0));
  function snapshot(unit,key){
    keys.set(unit,key);
    const card=structuredClone(unit.card||{});
    const result={...unit,card,counters:{...(unit.counters||{})},tempEffects:structuredClone(unit.tempEffects||[]),attackTarget:null,
      _combat3Key:key,_combat3Power:Number(helpers.getPower(unit))||0,_combat3Toughness:Number(helpers.getToughness(unit))||0,
      _combat3Plus:getCounterCount(unit,'plusOne'),_combat3Minus:getCounterCount(unit,'minusOne'),
      _combat3Keywords:KEYWORDS.filter(name=>helpers.hasKeyword(unit,name)),_combat3Value:combatUnitValue(unit,helpers),_combat3Dead:false};
    if(Object.keys(card).some(k=>/^(attackTrigger|blockTrigger|combatDamageTrigger|diesTrigger|anyCreatureDiesTrigger|anyCreatureAttacksTrigger|triggers|triggeredAbilities)$/.test(k)))uncertainty.add('public_triggers_not_resolved');
    const statics=[card.staticEffect,...(card.staticEffects||[])].filter(Boolean);
    if(statics.some(s=>!['replacement_effect','prevention_effect'].includes(s.type)))uncertainty.add('survivor_static_stats_not_recomputed');
    if((unit.tempEffects||[]).length)uncertainty.add('temporary_effect_expiry');
    if(unit.isVehicle||unit.isAnimatedLand)uncertainty.add('temporary_animation_or_crew');
    return result;
  }
  for(const zone of ZONES)state[zone]=(publicState[zone]||[]).map((unit,index)=>snapshot(unit,zone+':'+index));
  for(const {unit,index,side='rival'}of extras){if(keys.has(unit))continue;const zone=side+'Combat';state[zone].push(snapshot(unit,zone+':virtual:'+index));}
  for(const zone of ZONES)for(const unit of publicState[zone]||[]){
    const copy=state[zone].find(x=>x._combat3Key===keys.get(unit));
    if(unit.attackTarget)copy._combat3TargetKey=keys.get(unit.attackTarget)||'unknown-target';
  }
  return {state,keys,uncertainty:[...uncertainty],helpers};
}

export function forkCombat3(context,state=context.state,{cleanup=false}={}){
  const shadow={...state,activeEffects:(state.activeEffects||[]).map(e=>({...e}))};
  if(cleanup)shadow.combatDamagePrevented=false;
  for(const zone of ZONES)shadow[zone]=(state[zone]||[]).map(u=>({...u,counters:{...u.counters},damageTaken:cleanup?0:u.damageTaken,tookDeathtouch:cleanup?false:u.tookDeathtouch,
    ...(cleanup?{wasBlockedThisCombat:false,blockingIndex:null,isAttacking:false,_combat3TargetKey:null}:{})}));
  return {...context,state:shadow};
}
export function combat3Units(context,side){return context.state[side+'Combat']||[];}

export function forecastCombat3(context,{attackKeys,blockKeys,assignment,attackerIsLocal=false,faceOnly=false,attackTargets=null}){
  const shadow=forkCombat3(context).state,byKey=new Map(ZONES.flatMap(zone=>shadow[zone]).map(u=>[u._combat3Key,u]));
  const atkSide=attackerIsLocal?'local':'rival',defSide=attackerIsLocal?'rival':'local';
  const uncertainty=[...context.uncertainty];
  const attackers=attackKeys.map(key=>byKey.get(key)).filter(Boolean),blockers=blockKeys.map(key=>byKey.get(key));
  if(attackTargets)for(const unit of attackers)unit._combat3TargetKey=attackTargets[unit._combat3Key]||null;
  const initialWalkers=shadow[defSide+'Planeswalkers'].length;
  const before={attackerLife:shadow[atkSide+'HP'],defenderLife:shadow[defSide+'HP'],attackerPoison:shadow[atkSide+'Poison'],defenderPoison:shadow[defSide+'Poison']};
  let playerDamage=0,poisonDamage=0,pwDamage=0,attackerGain=0,defenderGain=0;
  const heal=(source,side,amount)=>{if(amount>0&&(kw(source,'lifelink')||kw(source,'life_link'))){shadow[side+'HP']+=amount;if(side===atkSide)attackerGain+=amount;else defenderGain+=amount;}};
  function hit(source,target,amount,sourceSide,targetSide){
    amount=n(amount);if(!amount)return 0;
    if(target&&(source.card.colors||[]).some(color=>kw(target,'protection_'+color)))return 0;
    const event={type:'damage',amount,affectedIsLocal:targetSide==='local',targetIsLocal:targetSide==='local',sourceCard:source.card,sourceItem:source,combat:true,cause:'combat'};
    if(target)Object.assign(event,{card:target.card,item:target,targetCard:target.card,targetItem:target});
    const dealt=n(resolveReplacementEvent(shadow,event).event.amount);
    if(target){
      if(targetSide+'Planeswalkers' in shadow&&shadow[targetSide+'Planeswalkers'].includes(target)){target.loyalty=n(target.loyalty)-dealt;pwDamage+=dealt;}
      else if(kw(source,'infect')){
        const counters=resolveReplacementEvent(shadow,{type:'counter_add',amount:dealt,counterType:'minusOne',affectedIsLocal:targetSide==='local',targetIsLocal:targetSide==='local',card:target.card,item:target,targetCard:target.card,targetItem:target,sourceCard:source.card,sourceItem:source,combat:true,cause:'infect'});
        changeCounterCount(target,'minusOne',n(counters.event.amount));
      }else target.damageTaken=n(target.damageTaken)+dealt;
      if(dealt&&kw(source,'deathtouch'))target.tookDeathtouch=true;
    }else if(kw(source,'infect')){shadow[targetSide+'Poison']+=dealt;poisonDamage+=dealt;}
    else{shadow[targetSide+'HP']-=dealt;playerDamage+=dealt;}
    heal(source,sourceSide,dealt);return dealt;
  }
  function strike(acts){
    for(let a=0;a<attackers.length;a++){
      const attacker=attackers[a];if(inactive(attacker))continue;
      const group=blockers.filter((b,i)=>b&&assignment[i]===a&&!inactive(b));
      if(attackerIsLocal&&group.length>1){
        // A human can choose a damage distribution. Do not assume they will
        // spare the most valuable blocker merely because of battlefield order.
        group.sort((a,b)=>b._combat3Value-a._combat3Value);
        if(!uncertainty.includes('opponent_manual_damage_distribution'))uncertainty.push('opponent_manual_damage_distribution');
      }
      const originallyBlocked=assignment.some(x=>x===a)||!!attacker.wasBlockedThisCombat;
      const power=combat3Power(attacker);
      const blockerPowers=group.map(combat3Power);
      // Same ordering and two damage substeps as the canonical automatic path.
      // Damage recipients stay present until the state-based actions below.
      group.forEach((blocker,i)=>{if(acts(blocker))hit(blocker,attacker,blockerPowers[i],defSide,atkSide);});
      if(!acts(attacker))continue;
      let remaining=power;
      if(originallyBlocked){
        for(let b=0;b<group.length;b++){
          const blocker=group[b];
          const lethal=kw(attacker,'deathtouch')?1:Math.max(0,combat3Toughness(blocker)-n(blocker.damageTaken));
          let amount=Math.min(remaining,lethal);
          if(b===group.length-1&&!kw(attacker,'trample'))amount=remaining;
          remaining-=amount;hit(attacker,blocker,amount,atkSide,defSide);
        }
        if(!kw(attacker,'trample'))remaining=0;
      }
      if(remaining>0){
        const targetKey=faceOnly?null:attacker._combat3TargetKey;
        const target=targetKey?byKey.get(targetKey):null;
        if(!targetKey||target&&n(target.loyalty)>0)hit(attacker,target,remaining,atkSide,defSide);
      }
    }
    for(const zone of ['localCombat','rivalCombat']){
      for(const unit of shadow[zone])if(dead(unit))unit._combat3Dead=true;
      shadow[zone]=shadow[zone].filter(u=>!u._combat3Dead);
    }
    for(const zone of ['localPlaneswalkers','rivalPlaneswalkers'])shadow[zone]=shadow[zone].filter(u=>n(u.loyalty)>0);
  }
  const hasFirst=attackers.some(first)||blockers.some(b=>b&&first(b));
  if(hasFirst&&!shadow.combatDamagePrevented)strike(first);
  const terminal=()=>shadow.localHP<=0||shadow.rivalHP<=0||shadow.localPoison>=10||shadow.rivalPoison>=10;
  if(!terminal()&&!shadow.combatDamagePrevented)strike(regular);
  const loss=units=>units.filter(u=>u?._combat3Dead).reduce((sum,u)=>sum+u._combat3Value,0);
  const attackerLost=shadow[atkSide+'HP']<=0||shadow[atkSide+'Poison']>=10;
  const defenderLost=shadow[defSide+'HP']<=0||shadow[defSide+'Poison']>=10;
  return {state:shadow,damage:playerDamage,poison:poisonDamage,pwDamage,planeswalkersRemoved:initialWalkers-shadow[defSide+'Planeswalkers'].length,attackerGain,defenderGain,
    attackerLoss:loss(attackers),defenderLoss:loss(blockers.filter(Boolean)),
    attackerLost,defenderLost,win:defenderLost&&!attackerLost,lose:attackerLost&&!defenderLost,
    attackerLife:shadow[atkSide+'HP'],defenderLife:shadow[defSide+'HP'],before,
    uncertainty};
}
