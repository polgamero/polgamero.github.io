import assert from 'node:assert/strict';
import { buildCombatMapModel, captureCombatPairs } from '../js/combatMap.js';

const card = (name, power, toughness, keywords = [], colors = []) => ({ card:{ name, power, toughness, keywords, colors }, damageTaken:0 });
const helpers = {
  getPower: x => x.card.power,
  getToughness: x => x.card.toughness,
  hasKeyword: (x,k) => (x.card.keywords || []).includes(k),
  getProtectionMatch: (x, colors) => colors.find(c => (x.card.keywords || []).includes(`protection_${c}`)) || null
};
function stateBase(active='local', multi=false) {
  return { phase:'combat_blockers', activePlayer:active, currentMatch:multi ? {id:'X'} : null,
    localCombat:[], rivalCombat:[], localBlockersDeclaredThisCombat:false, rivalBlockersDeclaredThisCombat:false };
}

{
  const s=stateBase('local'); const a=card('A',5,5); a.isAttacking=true; s.localCombat=[a]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.routes.length,1); assert.equal(m.routes[0].amount,5); assert.equal(m.routes[0].target.type,'player');
}
{
  const s=stateBase('local'); const a=card('A',3,3); a.isAttacking=true; const b=card('B',2,2); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.flexible,false); assert.deepEqual(m.routes.map(r=>[r.kind,r.amount,r.target.type]), [['blocker',2,'combat'],['attacker',3,'combat']]);
}
{
  const s=stateBase('local',true); const a=card('A',5,5,['trample']); a.isAttacking=true; const b=card('B',2,2); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.flexible,true); assert.equal(m.routes.filter(r=>r.flexible).length,2); assert.equal(m.routes.find(r=>r.kind==='blocker').amount,2);
}
{
  const s=stateBase('rival',false); const a=card('Bot',5,5,['trample']); a.isAttacking=true; const b=card('Human',2,2); b.blockingIndex=0; s.rivalCombat=[a]; s.localCombat=[b]; s.localBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); const red=m.routes.filter(r=>r.kind==='attacker'); assert.deepEqual(red.map(r=>[r.amount,r.target.type]), [[2,'combat'],[3,'player']]);
}
{
  const s=stateBase('rival',false); const a=card('Bot',5,5,['trample','deathtouch']); a.isAttacking=true; const b=card('Human',2,4); b.blockingIndex=0; s.rivalCombat=[a]; s.localCombat=[b]; s.localBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); const red=m.routes.filter(r=>r.kind==='attacker'); assert.deepEqual(red.map(r=>[r.amount,r.target.type]), [[1,'combat'],[4,'player']]);
}
{
  const s=stateBase('local'); const a=card('A',5,5); a.isAttacking=true; a.wasBlockedThisCombat=true; s.localCombat=[a]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.routes.length,0);
}
{
  const s=stateBase('local'); s.phase='combat_damage'; const a=card('A',3,3,['firststrike']); a.isAttacking=true; const b=card('B',2,2,['doublestrike']); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,{...helpers,regularOnly:true}); assert.equal(m.routes.filter(r=>r.kind==='attacker').length,0); assert.equal(m.routes.find(r=>r.kind==='blocker').amount,2);
}
{
  const s=stateBase('local'); const a=card('Red',3,3,[],['R']); a.isAttacking=true; const b=card('Prot',2,2,['protection_R']); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.routes.find(r=>r.kind==='attacker').prevented,true);
}

{
  // Una criatura atacante puede desaparecer con un instant después de bloquear. El índice
  // del array puede correrse; el mapa conserva el vínculo por identidad estable y jamás
  // redibuja al bloqueador contra el atacante siguiente por accidente.
  const s=stateBase('local');
  const a1=card('A1',3,3); a1.card.instanceId='a1'; a1.isAttacking=true; a1.wasBlockedThisCombat=true;
  const a2=card('A2',4,4); a2.card.instanceId='a2'; a2.isAttacking=true; a2.wasBlockedThisCombat=true;
  const b1=card('B1',2,2); b1.card.instanceId='b1'; b1.blockingIndex=0;
  const b2=card('B2',1,1); b2.card.instanceId='b2'; b2.blockingIndex=1;
  s.localCombat=[a1,a2]; s.rivalCombat=[b1,b2]; s.rivalBlockersDeclaredThisCombat=true;
  const stablePairs=captureCombatPairs(s);
  s.localCombat.splice(0,1); // A1 destruido: A2 pasa a índice 0, pero los blockingIndex legacy no cambian.
  const m=buildCombatMapModel(s,{...helpers,stablePairs});
  const blue=m.routes.filter(r=>r.kind==='blocker');
  assert.equal(blue.length,1); assert.equal(blue[0].amount,1); assert.equal(blue[0].source.index,1);
  assert.equal(m.routes.some(r=>r.source.index===0 && r.kind==='blocker'),false);
}
console.log('COMBAT_MAP_23_13_38_OK');
