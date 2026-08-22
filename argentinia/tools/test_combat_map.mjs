import assert from 'node:assert/strict';
import { buildCombatMapModel, captureCombatPairs, combatCurveLane } from '../js/combatMap.js';

const card = (name, power, toughness, keywords = [], colors = []) => ({ card:{ name, power, toughness, keywords, colors }, damageTaken:0, blockingIndex:null });
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

// Directo al jugador después de declarar cero bloqueadores.
{
  const s=stateBase('local'); const a=card('A',5,5); a.isAttacking=true; s.localCombat=[a]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.routes.length,1); assert.equal(m.routes[0].amount,5); assert.equal(m.routes[0].target.type,'player');
}
// 1v1 simple.
{
  const s=stateBase('local'); const a=card('A',3,3); a.isAttacking=true; const b=card('B',2,2); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.flexible,false); assert.deepEqual(m.routes.map(r=>[r.kind,r.amount,r.target.type]), [['blocker',2,'combat'],['attacker',3,'combat']]);
}
// Regresión 23.13.38: Number(null) === 0 no puede convertir espectadores en bloqueadores del atacante 0.
{
  const s=stateBase('rival'); const a=card('A',2,2); a.card.instanceId='a'; a.isAttacking=true;
  const notAttacking=card('No ataca',1,3); notAttacking.card.instanceId='na';
  const b=card('B',2,1); b.card.instanceId='b'; b.blockingIndex=0;
  const bystander1=card('No bloquea 1',1,1); bystander1.card.instanceId='x1';
  const bystander2=card('No bloquea 2',3,3); bystander2.card.instanceId='x2';
  s.rivalCombat=[a,notAttacking]; s.localCombat=[b,bystander1,bystander2]; s.localBlockersDeclaredThisCombat=true;
  const pairs=captureCombatPairs(s);
  assert.equal(pairs.length,1, 'blockingIndex:null jamás debe convertirse en 0');
  const m=buildCombatMapModel(s,{...helpers,stablePairs:pairs});
  assert.equal(m.routes.filter(r=>r.kind==='attacker').length,1);
  assert.equal(m.routes.filter(r=>r.kind==='blocker').length,1);
}
// Carriles visuales separados e invertidos según quién ataca.
assert.equal(combatCurveLane('local','attacker'),-1);
assert.equal(combatCurveLane('local','blocker'),1);
assert.equal(combatCurveLane('rival','attacker'),1);
assert.equal(combatCurveLane('rival','blocker'),-1);

// Trample humano: reparto flexible, no inventar cantidades.
{
  const s=stateBase('local',true); const a=card('A',5,5,['trample']); a.isAttacking=true; const b=card('B',2,2); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.flexible,true); assert.equal(m.routes.filter(r=>r.flexible).length,2); assert.equal(m.routes.find(r=>r.kind==='blocker').amount,2);
}
// Trample automático del Tano.
{
  const s=stateBase('rival',false); const a=card('Bot',5,5,['trample']); a.isAttacking=true; const b=card('Human',2,2); b.blockingIndex=0; s.rivalCombat=[a]; s.localCombat=[b]; s.localBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); const red=m.routes.filter(r=>r.kind==='attacker'); assert.deepEqual(red.map(r=>[r.amount,r.target.type]), [[2,'combat'],[3,'player']]);
}
// Trample + deathtouch automático: 1 letal y overflow.
{
  const s=stateBase('rival',false); const a=card('Bot',5,5,['trample','deathtouch']); a.isAttacking=true; const b=card('Human',2,4); b.blockingIndex=0; s.rivalCombat=[a]; s.localCombat=[b]; s.localBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); const red=m.routes.filter(r=>r.kind==='attacker'); assert.deepEqual(red.map(r=>[r.amount,r.target.type]), [[1,'combat'],[4,'player']]);
}
// Bloqueador destruido: sin trample, atacante ya bloqueado no vuelve a jugador.
{
  const s=stateBase('local'); const a=card('A',5,5); a.isAttacking=true; a.wasBlockedThisCombat=true; s.localCombat=[a]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.routes.length,0);
}
// First strike / double strike: en continuación regular, first strike simple ya no pega.
{
  const s=stateBase('local'); s.phase='combat_damage'; const a=card('A',3,3,['firststrike']); a.isAttacking=true; const b=card('B',2,2,['doublestrike']); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  assert.equal(buildCombatMapModel(s,helpers).visible,false, 'tras daño normal no debe persistir el mapa');
  const m=buildCombatMapModel(s,{...helpers,regularOnly:true}); assert.equal(m.routes.filter(r=>r.kind==='attacker').length,0); assert.equal(m.routes.find(r=>r.kind==='blocker').amount,2);
}
// Protección.
{
  const s=stateBase('local'); const a=card('Red',3,3,[],['R']); a.isAttacking=true; const b=card('Prot',2,2,['protection_R']); b.blockingIndex=0; s.localCombat=[a]; s.rivalCombat=[b]; s.rivalBlockersDeclaredThisCombat=true;
  const m=buildCombatMapModel(s,helpers); assert.equal(m.routes.find(r=>r.kind==='attacker').prevented,true);
}
// Un atacante puede desaparecer con instant: el vínculo estable no se corre al atacante siguiente.
{
  const s=stateBase('local');
  const a1=card('A1',3,3); a1.card.instanceId='a1'; a1.isAttacking=true; a1.wasBlockedThisCombat=true;
  const a2=card('A2',4,4); a2.card.instanceId='a2'; a2.isAttacking=true; a2.wasBlockedThisCombat=true;
  const b1=card('B1',2,2); b1.card.instanceId='b1'; b1.blockingIndex=0;
  const b2=card('B2',1,1); b2.card.instanceId='b2'; b2.blockingIndex=1;
  s.localCombat=[a1,a2]; s.rivalCombat=[b1,b2]; s.rivalBlockersDeclaredThisCombat=true;
  const stablePairs=captureCombatPairs(s);
  s.localCombat.splice(0,1);
  const m=buildCombatMapModel(s,{...helpers,stablePairs});
  const blue=m.routes.filter(r=>r.kind==='blocker');
  assert.equal(blue.length,1); assert.equal(blue[0].amount,1); assert.equal(blue[0].source.index,1);
  assert.equal(m.routes.some(r=>r.source.index===0 && r.kind==='blocker'),false);
}
console.log('COMBAT_MAP_23_13_39_OK');
