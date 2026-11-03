import {getBotCombatProfile,BOT_AI_VERSION} from './botDifficulty.js';
import {prepareCombat3,forecastCombat3,forkCombat3,combat3Units,combat3Power,combat3Toughness} from './combatForecast3.js';

export const COMBAT_BOT_3_VERSION=BOT_AI_VERSION;
const WIN=1_000_000;
const keyword=(u,k)=>u._combat3Keywords.includes(k);
const value=u=>u._combat3Value;
const pressure=u=>combat3Power(u)*(keyword(u,'doublestrike')?2:1);
function attackUtility(out){
  const terminal=out.uncertainty.length?WIN/20:WIN;
  return (out.win?terminal:out.lose?-terminal:0)+out.damage*10+out.poison*26+out.defenderLoss*4.4-out.attackerLoss*4.7
    +out.attackerGain*5-out.defenderGain*6+Math.min(out.pwDamage,12)*3+out.planeswalkersRemoved*36;
}
function createSearch(input){
  let profile=getBotCombatProfile(input.difficulty||'hard');
  if(input.purpose==='crew'&&profile.enabled)profile={...profile,attackCandidates:8,beam:8,defenseCandidates:8,blockCandidates:8,forecasts:240,replyCandidates:profile.id==='elite'?4:0,finalists:profile.id==='elite'?2:0};
  const ctx=prepareCombat3({...input,extras:[...(input.eligibleAttackers||[]).map(x=>({...x,side:'rival'})),...(input.attackers||[]).map(x=>({...x,side:'local'})),...(input.blockers||[]).map(x=>({...x,side:'rival'}))]});
  const sources=new Map([...ctx.keys].map(([unit,key])=>[key,unit]));
  const stats={version:COMBAT_BOT_3_VERSION,profile:profile.id,forecasts:0,limit:profile.forecasts,nodes:0,blockLegalityChecks:0,truncated:false};
  // Canonical legality reads the same original public objects throughout this
  // synchronous search (including replies). Cache only for this search, never
  // across actions, so a subsequent rules/keyword change is read afresh.
  const blockLegality=new Map();
  const canBlock=(a,b)=>{
    let row=blockLegality.get(a._combat3Key);
    if(!row){row=new Map();blockLegality.set(a._combat3Key,row);}
    if(!row.has(b._combat3Key)){
      stats.blockLegalityChecks++;
      row.set(b._combat3Key,!!input.helpers.canBlock(sources.get(a._combat3Key),sources.get(b._combat3Key)));
    }
    return row.get(b._combat3Key);
  };
  function simulate(context,args){if(stats.forecasts>=stats.limit){stats.truncated=true;return null;}stats.forecasts++;return forecastCombat3(context,args);}
  return {ctx,profile,stats,canBlock,simulate};
}
function legalAssignment(attackers,blockers,assignment,canBlock){
  for(let b=0;b<assignment.length;b++){const a=assignment[b];if(a>=0&&(!attackers[a]||!canBlock(attackers[a],blockers[b])))return false;}
  return attackers.every((a,i)=>!keyword(a,'menace')||assignment.filter(x=>x===i).length!==1);
}
function defenseSeeds(attackers,blockers,canBlock){
  const none=blockers.map(()=>-1),seeds=[none];
  // Completed legal gang blocks are explicit seeds, so beam pruning cannot lose
  // every menace/multiple-block line before its second blocker is assigned.
  for(let a=0;a<attackers.length;a++){
    const compatible=blockers.map((b,i)=>canBlock(attackers[a],b)?i:-1).filter(i=>i>=0);
    for(const count of [keyword(attackers[a],'menace')?2:1,compatible.length]){
      if(!count||compatible.length<count)continue;
      const line=[...none];for(const b of compatible.slice(0,count))line[b]=a;seeds.push(line);
    }
  }
  const greedy=[...none],free=new Set(blockers.map((_,i)=>i));
  for(const a of attackers.map((_,i)=>i).sort((a,b)=>pressure(attackers[b])-pressure(attackers[a]))){
    const choices=[...free].filter(b=>canBlock(attackers[a],blockers[b])).sort((a,b)=>value(blockers[a])-value(blockers[b]));
    const count=keyword(attackers[a],'menace')?2:1;
    if(choices.length>=count)for(const b of choices.slice(0,count)){greedy[b]=a;free.delete(b);}
  }
  seeds.push(greedy);return seeds;
}
function prepareDefenseEstimate(attackers,blockers){
  // One unchanged forecast snapshot per defense search. Aggregate each partial
  // assignment in blocker order, preserving the old score and tie ordering,
  // without filtering/re-reading the same bodies for every attacker and node.
  const attacks=attackers.map(u=>({pressure:pressure(u),toughness:combat3Toughness(u),value:value(u),trample:keyword(u,'trample')}));
  const bodies=blockers.map(u=>({power:combat3Power(u),toughness:Math.max(0,combat3Toughness(u)-(u.damageTaken||0)),value:value(u),deathtouch:keyword(u,'deathtouch')&&combat3Power(u)>0}));
  const counts=new Uint32Array(attackers.length),powers=new Float64Array(attackers.length),toughnesses=new Float64Array(attackers.length),values=new Float64Array(attackers.length),deathtouch=new Uint8Array(attackers.length);
  return assignment=>{
    counts.fill(0);powers.fill(0);toughnesses.fill(0);values.fill(0);deathtouch.fill(0);
    for(let b=0;b<assignment.length;b++){
      const a=assignment[b];if(a<0)continue;
      const body=bodies[b];counts[a]++;powers[a]+=body.power;toughnesses[a]+=body.toughness;values[a]+=body.value;if(body.deathtouch)deathtouch[a]=1;
    }
    let score=0;
    for(let a=0;a<attacks.length;a++){
      const attacker=attacks[a];
      if(!counts[a]){score-=attacker.pressure*12;continue;}
      score+=(attacker.trample?Math.min(attacker.pressure,toughnesses[a]):attacker.pressure)*12;
      if(powers[a]>=attacker.toughness||deathtouch[a])score+=attacker.value*3;
      score-=values[a]*.45;
    }
    return score;
  };
}
function bestDefense(search,ctx,attackers,blockers,{attackerIsLocal=false,faceOnly=false,attackTargets=null,maxCandidates=search.profile.defenseCandidates}={}){
  const {canBlock,profile,simulate}=search;
  const estimate=prepareDefenseEstimate(attackers,blockers);
  const seeds=defenseSeeds(attackers,blockers,canBlock);
  const exhaustive=Math.pow(attackers.length+1,blockers.length)<=maxCandidates;
  let beam=[[]],nodeLimit=4096;
  for(let b=0;b<blockers.length;b++){
    const next=[];
    const choices=[-1,...attackers.map((_,i)=>i).filter(i=>canBlock(attackers[i],blockers[b]))];
    for(const line of beam){
      for(const a of choices){
        if(nodeLimit--<=0){search.stats.truncated=true;break;}
        search.stats.nodes++;const assignment=[...line,a];next.push({assignment,quick:estimate(assignment)});
      }
      if(nodeLimit<=0)break;
    }
    if(!next.length)break;
    next.sort((a,c)=>c.quick-a.quick);
    beam=next.slice(0,exhaustive?maxCandidates:profile.beam).map(row=>row.assignment);
    if(nodeLimit<=0)break;
  }
  const candidates=[...seeds,...beam.map(line=>[...line,...Array(blockers.length-line.length).fill(-1)])];
  const unique=new Map();for(const line of candidates)if(legalAssignment(attackers,blockers,line,canBlock))unique.set(line.join(','),line);
  const sorted=[...unique.values()].map(assignment=>({assignment,quick:estimate(assignment)})).sort((a,b)=>b.quick-a.quick).map(row=>row.assignment);
  // Always evaluate no blocks too: chumping is optional and may lose more than racing.
  const selected=[blockers.map(()=>-1),...sorted].filter((line,i,all)=>all.findIndex(other=>other.join(',')===line.join(','))===i).slice(0,Math.max(1,maxCandidates));
  let best=null;
  for(const assignment of selected){
    const out=simulate(ctx,{attackKeys:attackers.map(a=>a._combat3Key),blockKeys:blockers.map(b=>b._combat3Key),assignment,attackerIsLocal,faceOnly,attackTargets});
    if(!out)break;
    const utility=attackUtility(out),candidate={...out,assignment,utility};
    let take=!best;
    if(best){
      if(candidate.win!==best.win)take=!candidate.win;
      else if(candidate.win&&best.win){
        // Once every line is terminal, hoarding blockers has no future value.
        const incoming=c=>c.damage+c.poison*2;
        take=incoming(candidate)<incoming(best)||(incoming(candidate)===incoming(best)&&(candidate.attackerLoss>best.attackerLoss
          ||candidate.attackerLoss===best.attackerLoss&&candidate.assignment.filter(a=>a>=0).length>best.assignment.filter(a=>a>=0).length));
      }else take=utility<best.utility||utility===best.utility&&candidate.damage<best.damage;
    }
    if(take)best=candidate;
  }
  return best;
}
function attackSets(units,limit){
  const sets=[[],units],sorted=[...units].sort((a,b)=>pressure(b)-pressure(a)||value(b)-value(a));
  if(units.length<=5){for(let mask=1;mask<(1<<units.length);mask++)sets.push(units.filter((_,i)=>mask&(1<<i)));}
  else{
    sets.push(units.filter(u=>keyword(u,'vigilance')),units.filter(u=>keyword(u,'flying')||keyword(u,'menace')||keyword(u,'trample')));
    for(const reserve of [...units].sort((a,b)=>value(a)-value(b)).slice(0,3))sets.push(units.filter(u=>u!==reserve));
    for(const u of sorted.slice(0,8)){sets.push([u],units.filter(x=>x!==u));}
    for(let count=2;count<sorted.length;count++)sets.push(sorted.slice(0,count));
    for(let i=0;i<Math.min(5,sorted.length);i++)for(let j=i+1;j<Math.min(5,sorted.length);j++)sets.push([sorted[i],sorted[j]]);
  }
  const unique=new Map();for(const set of sets)unique.set(set.map(x=>x._combat3Key).sort().join(','),set);
  return [...unique.values()].slice(0,limit);
}
function retaliation(search,outcome,attackers,maxCandidates){
  const ctx=forkCombat3(search.ctx,outcome.state,{cleanup:true}),attackingKeys=new Set(attackers.map(u=>u._combat3Key));
  // The opponent untaps; our attackers do not. Creatures that could not attack
  // (summoning sickness/defender/attack lock) remain genuine reserve blockers.
  const defenders=combat3Units(ctx,'rival').filter(u=>!u.tapped&&(!attackingKeys.has(u._combat3Key)||keyword(u,'vigilance')));
  const counterUnits=combat3Units(ctx,'local').filter(u=>!keyword(u,'defender')&&(!u.tapped||getStun(u)===0)&&!u.isVehicle&&!u.isAnimatedLand
    &&!(ctx.state.activeEffects||[]).some(e=>e.effectType==='cant_attack_next_turn'&&e.targetPlayer==='local'&&e.targetObjectId&&[u._effectObjectId,u._syncObjectId].includes(e.targetObjectId)));
  let worst=null;
  for(const subset of attackSets(counterUnits,maxCandidates)){
    if(!subset.length)continue;
    const reply=bestDefense(search,ctx,subset,defenders,{attackerIsLocal:true,faceOnly:true,maxCandidates:8});
    if(reply&&(!worst||reply.utility>worst.utility))worst=reply;
  }
  return worst;
}
const getStun=u=>Math.max(0,Number(u.counters?.stun)||0);

export function chooseAttackPlan3(input){
  const search=createSearch(input),{ctx,profile,stats}=search;
  if(!profile.enabled)return null;
  const byKey=new Map(combat3Units(ctx,'rival').map(u=>[u._combat3Key,u]));
  const eligible=input.eligibleAttackers.map(x=>byKey.get(ctx.keys.get(x.unit))).filter(Boolean);
  const defenders=input.defenders.map(x=>combat3Units(ctx,'local').find(u=>u._combat3Key===ctx.keys.get(x.unit))).filter(Boolean);
  const sets=attackSets(eligible,profile.attackCandidates),plans=[];
  for(const attackers of sets){
    const out=bestDefense(search,ctx,attackers,defenders,{faceOnly:true,maxCandidates:profile.defenseCandidates});if(!out)break;
    plans.push({attackers,out,score:out.utility,targets:{}});
  }
  if(!plans.length)return null;
  plans.sort((a,b)=>b.score-a.score);
  const finalists=profile.finalists?[...new Set([plans.find(p=>!p.attackers.length),...plans.slice(0,profile.finalists)].filter(Boolean))]:plans;
  if(profile.replyCandidates)for(const plan of finalists){
    if(plan.out.win)continue;
    const reply=retaliation(search,plan.out,plan.attackers,profile.replyCandidates);
    plan.reply=reply;
    if(reply)plan.score-=Math.max(0,reply.utility)*.9;
  }
  finalists.sort((a,b)=>b.score-a.score||a.attackers.length-b.attackers.length);
  let best=finalists[0];
  // Joint target choice: consider ONE body on a walker, never independently
  // redirect every attacker to the same low-loyalty target after planning face.
  if(profile.id==='elite'&&!best.out.win){
    for(const walker of ctx.state.localPlaneswalkers.slice(0,2)){
      const body=[...best.attackers].filter(u=>pressure(u)>=Number(walker.loyalty||0)).sort((a,b)=>pressure(a)-pressure(b))[0];
      if(!body)continue;
      const targets={[body._combat3Key]:walker._combat3Key};
      const out=bestDefense(search,ctx,best.attackers,defenders,{attackTargets:targets,maxCandidates:8});
      if(out){
        const reply=out.win?null:retaliation(search,out,best.attackers,Math.min(4,profile.replyCandidates));
        const score=out.utility-(reply?Math.max(0,reply.utility)*.9:0);
        if(score>best.score)best={...best,out,score,targets,reply};
      }
    }
  }
  const indices=new Map(input.eligibleAttackers.map(x=>[ctx.keys.get(x.unit),x.index]));
  const targets={};for(const [key,target]of Object.entries(best.targets))targets[indices.get(key)]=ctx.state.localPlaneswalkers.findIndex(u=>u._combat3Key===target);
  return {indexes:best.attackers.map(u=>indices.get(u._combat3Key)),attackTargets:targets,utility:best.score,damage:best.out.damage,poison:best.out.poison,
    attackPower:best.attackers.reduce((s,u)=>s+pressure(u),0),crackBack:best.reply?.damage||0,
    certainLethal:best.out.win&&!ctx.uncertainty.length,reason:best.out.win&&!ctx.uncertainty.length?'lethal':best.attackers.length?'public_minimax':'hold',
    uncertainty:[...new Set([...ctx.uncertainty,...best.out.uncertainty,...(best.reply?.uncertainty||[])])],search:{...stats}};
}

export function chooseBlockPlan3(input){
  const search=createSearch(input),{ctx,profile,stats}=search;
  if(!profile.enabled)return null;
  const find=(side,ref)=>combat3Units(ctx,side).find(u=>u._combat3Key===ctx.keys.get(ref.unit));
  const attackers=input.attackers.map(x=>find('local',x)),blockers=input.blockers.map(x=>find('rival',x));
  if(attackers.some(x=>!x)||blockers.some(x=>!x))return null;
  const out=bestDefense(search,ctx,attackers,blockers,{attackerIsLocal:true,maxCandidates:profile.blockCandidates||profile.defenseCandidates});
  return out?{assignment:out.assignment,utility:out.utility,damage:out.damage,poison:out.poison,uncertainty:out.uncertainty,
    reason:out.win?'forced_lethal_line':'public_global_defense',search:{...stats}}:null;
}
