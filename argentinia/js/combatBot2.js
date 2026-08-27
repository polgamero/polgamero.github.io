// js/combatBot2.js — 23.17.2 — Combat Bot 2.0
// Evaluador puro de información PÚBLICA. No inspecciona mano/biblioteca del humano.
// Busca conjuntos globales de ataque y asignaciones globales de bloqueadores mediante
// búsqueda acotada/beam, valorando lethal, daño, trades, trample y crack-back.

const HUGE=1_000_000;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function keywordWeight(unit, hasKeyword) {
  let v=0;
  if (hasKeyword(unit,'flying')) v+=1.2;
  if (hasKeyword(unit,'trample')) v+=1.1;
  if (hasKeyword(unit,'doublestrike')) v+=2.2;
  if (hasKeyword(unit,'firststrike')) v+=0.8;
  if (hasKeyword(unit,'deathtouch')) v+=1.3;
  if (hasKeyword(unit,'lifelink')) v+=1.0;
  if (hasKeyword(unit,'vigilance')) v+=0.8;
  if (hasKeyword(unit,'indestructible')) v+=2.0;
  if (hasKeyword(unit,'menace')) v+=0.8;
  return v;
}

export function combatUnitValue(unit, helpers) {
  const p=Math.max(0,helpers.getPower(unit)||0);
  const t=Math.max(0,helpers.getToughness(unit)||0);
  const mv=Number(unit?.card?.manaValue ?? unit?.card?.cmc ?? 0) || 0;
  const rarity=String(unit?.card?.rarity||'').toLowerCase();
  const rarityBonus=rarity.includes('myth')?2.0:rarity.includes('rare')?1.2:rarity.includes('uncommon')?0.5:0;
  return Math.max(1,p*1.25+t+mv*0.25+rarityBonus+keywordWeight(unit,helpers.hasKeyword));
}

function strikeMultiplier(unit, helpers) {
  return helpers.hasKeyword(unit,'doublestrike') ? 2 : 1;
}

function groupOutcome(attacker, blockers, helpers) {
  const p=Math.max(0,helpers.getPower(attacker)||0);
  const t=Math.max(1,helpers.getToughness(attacker)||1);
  const atkValue=combatUnitValue(attacker,helpers);
  if (!blockers.length) return { playerDamage:p*strikeMultiplier(attacker,helpers), attackerDies:false, blockerLossValue:0, attackerLossValue:0 };

  if (blockers.length===1) {
    const duel=helpers.predictDuel(attacker,blockers[0]);
    let playerDamage=0;
    if (helpers.hasKeyword(attacker,'trample')) {
      const bt=Math.max(0,helpers.getToughness(blockers[0])-(blockers[0].damageTaken||0));
      playerDamage=Math.max(0,p-bt)*strikeMultiplier(attacker,helpers);
    }
    return {
      playerDamage,
      attackerDies:!!duel.attackerDies,
      blockerLossValue:duel.blockerDies?combatUnitValue(blockers[0],helpers):0,
      attackerLossValue:duel.attackerDies?atkValue:0
    };
  }

  const remainingToughness=blockers.reduce((sum,b)=>sum+Math.max(0,helpers.getToughness(b)-(b.damageTaken||0)),0);
  const totalBlockPower=blockers.reduce((sum,b)=>sum+Math.max(0,helpers.getPower(b)||0),0);
  const deathtouchBlocker=blockers.some(b=>helpers.hasKeyword(b,'deathtouch') && (helpers.getPower(b)||0)>0);
  const attackerIndestructible=helpers.hasKeyword(attacker,'indestructible');
  const attackerDies=!attackerIndestructible && (deathtouchBlocker || totalBlockPower>=t);

  // Conservador para el defensor: suponemos que el atacante asigna daño para retirar primero
  // los bloqueadores de mayor valor que alcance a matar.
  let damageBudget=p*strikeMultiplier(attacker,helpers);
  let blockerLossValue=0;
  const ordered=[...blockers].sort((a,b)=>combatUnitValue(b,helpers)-combatUnitValue(a,helpers));
  for (const blocker of ordered) {
    if (damageBudget<=0) break;
    if (helpers.hasKeyword(blocker,'indestructible')) continue;
    const lethal=helpers.hasKeyword(attacker,'deathtouch')?1:Math.max(1,helpers.getToughness(blocker)-(blocker.damageTaken||0));
    if (damageBudget>=lethal) {
      blockerLossValue+=combatUnitValue(blocker,helpers);
      damageBudget-=lethal;
    }
  }
  const playerDamage=helpers.hasKeyword(attacker,'trample') ? Math.max(0,p-remainingToughness)*strikeMultiplier(attacker,helpers) : 0;
  return { playerDamage, attackerDies, blockerLossValue, attackerLossValue:attackerDies?atkValue:0 };
}

function assignmentIsLegal(attackers, assignment, helpers) {
  for (let a=0;a<attackers.length;a++) {
    if (!helpers.hasKeyword(attackers[a].unit,'menace')) continue;
    const count=assignment.filter(x=>x===a).length;
    if (count===1) return false;
  }
  return true;
}

function quickDefenseScore(attackers, blockers, assignment, helpers) {
  let score=0;
  for (let b=0;b<assignment.length;b++) {
    const a=assignment[b];
    if (a<0) continue;
    const att=attackers[a].unit, block=blockers[b].unit;
    const prevented=Math.min(Math.max(0,helpers.getPower(att)||0),Math.max(0,helpers.getToughness(block)||0));
    score+=prevented*4;
    const duel=helpers.predictDuel(att,block);
    if (duel.attackerDies) score+=combatUnitValue(att,helpers)*2;
    if (duel.blockerDies) score-=combatUnitValue(block,helpers)*0.8;
  }
  return score;
}

function evaluateResolvedAttack(attackers, blockers, assignment, attackerLife, defenderLife, helpers) {
  let damage=0, defenderLoss=0, attackerLoss=0;
  for (let a=0;a<attackers.length;a++) {
    const assigned=blockers.filter((_,b)=>assignment[b]===a).map(x=>x.unit);
    const out=groupOutcome(attackers[a].unit,assigned,helpers);
    damage+=out.playerDamage;
    defenderLoss+=out.blockerLossValue;
    attackerLoss+=out.attackerLossValue;
  }
  let utility=damage*11 + defenderLoss*4.5 - attackerLoss*4.2;
  if (damage>=defenderLife) utility+=HUGE;
  // A vida baja, perder material y no cerrar la partida es más peligroso.
  if (attackerLife<=6 && damage<defenderLife) utility-=attackerLoss*1.5;
  return {utility,damage,defenderLoss,attackerLoss};
}

export function findBestDefenseAssignment({attackers,blockers,attackerLife=20,defenderLife=20,helpers,beamWidth=420}) {
  if (!attackers.length || !blockers.length) {
    const assignment=new Array(blockers.length).fill(-1);
    return {assignment,...evaluateResolvedAttack(attackers,blockers,assignment,attackerLife,defenderLife,helpers)};
  }
  let states=[{assignment:[]}];
  for (let b=0;b<blockers.length;b++) {
    const next=[];
    for (const s of states) {
      next.push({assignment:[...s.assignment,-1]});
      for (let a=0;a<attackers.length;a++) {
        if (helpers.canBlock(attackers[a].unit,blockers[b].unit)) next.push({assignment:[...s.assignment,a]});
      }
    }
    next.forEach(s=>{s.quick=quickDefenseScore(attackers,blockers,s.assignment,helpers);});
    next.sort((x,y)=>y.quick-x.quick);
    states=next.slice(0,beamWidth);
  }

  let best=null;
  for (const s of states) {
    if (!assignmentIsLegal(attackers,s.assignment,helpers)) continue;
    const result=evaluateResolvedAttack(attackers,blockers,s.assignment,attackerLife,defenderLife,helpers);
    // El defensor elige la línea que MINIMIZA la utilidad del atacante.
    if (!best || result.utility<best.utility) best={assignment:s.assignment,...result};
  }
  if (best) return best;
  const assignment=new Array(blockers.length).fill(-1);
  return {assignment,...evaluateResolvedAttack(attackers,blockers,assignment,attackerLife,defenderLife,helpers)};
}

function attackSubsets(eligible, helpers) {
  const n=eligible.length;
  const subsets=[[]];
  if (n<=7) {
    for (let mask=1;mask<(1<<n);mask++) {
      const sub=[];
      for (let i=0;i<n;i++) if (mask&(1<<i)) sub.push(eligible[i]);
      subsets.push(sub);
    }
    return subsets;
  }
  // Campo ancho: beam determinista en vez de 2^N.
  const byValue=[...eligible].sort((a,b)=>combatUnitValue(b.unit,helpers)-combatUnitValue(a.unit,helpers));
  subsets.push([...eligible]);
  const vigilance=eligible.filter(x=>helpers.hasKeyword(x.unit,'vigilance'));
  if (vigilance.length) subsets.push(vigilance);
  for (let k=1;k<=Math.min(n,8);k++) subsets.push(byValue.slice(0,k));
  for (const one of byValue.slice(0,8)) subsets.push([one]);
  const evasive=eligible.filter(x=>helpers.hasKeyword(x.unit,'flying')||helpers.hasKeyword(x.unit,'menace')||helpers.hasKeyword(x.unit,'trample'));
  if (evasive.length) subsets.push(evasive);
  const uniq=new Map();
  for (const s of subsets) uniq.set(s.map(x=>x.index).sort((a,b)=>a-b).join(','),s);
  return [...uniq.values()];
}

export function chooseHardAttackPlan({eligibleAttackers,defenders,botLife=20,opponentLife=20,helpers}) {
  const candidates=attackSubsets(eligibleAttackers,helpers);
  const opponentBoardPower=defenders.reduce((sum,x)=>sum+Math.max(0,helpers.getPower(x.unit)||0),0);
  let best={indexes:[],utility:0,damage:0,reason:'hold'};

  for (const subset of candidates) {
    if (!subset.length) continue;
    const defense=findBestDefenseAssignment({attackers:subset,blockers:defenders,attackerLife:botLife,defenderLife:opponentLife,helpers});
    const attackingSet=new Set(subset.map(x=>x.index));
    const held=eligibleAttackers.filter(x=>!attackingSet.has(x.index) || helpers.hasKeyword(x.unit,'vigilance'));
    const heldDefense=held.reduce((sum,x)=>sum+Math.max(0,helpers.getPower(x.unit)||0)+Math.max(0,helpers.getToughness(x.unit)||0)*0.35,0);
    const crackBack=Math.max(0,opponentBoardPower-heldDefense*0.85);
    const urgency=botLife<=8?2.0:botLife<=12?1.25:0.75;
    let utility=defense.utility-crackBack*urgency;
    const attackPower=subset.reduce((sum,x)=>sum+Math.max(0,helpers.getPower(x.unit)||0)*strikeMultiplier(x.unit,helpers),0);
    // Pequeño incentivo a convertir ventaja cuando el rival está a rango.
    if (attackPower>=opponentLife) utility+=25;
    if (utility>best.utility) best={indexes:subset.map(x=>x.index),utility,damage:defense.damage,attackPower,crackBack,reason:defense.damage>=opponentLife?'lethal':'best_global'};
  }
  return best;
}

export function chooseHardBlockPlan({attackers,blockers,botLife=20,opponentLife=20,helpers}) {
  const result=findBestDefenseAssignment({attackers,blockers,attackerLife:opponentLife,defenderLife:botLife,helpers,beamWidth:650});
  return {...result, reason:result.damage>=botLife?'forced_lethal_line':'best_global'};
}

export const COMBAT_BOT_2_VERSION='23.17.2';
