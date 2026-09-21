import assert from 'node:assert/strict';
import { chooseHardBlockPlan } from '../js/combatBot2.js';

const unit=(name,p,t,keywords=[])=>({card:{name,rarity:'Common'},p,t,keywords});
const helpers={
  getPower:u=>u.p,
  getToughness:u=>u.t,
  hasKeyword:(u,k)=>u.keywords.includes(k),
  canBlock:()=>true,
  predictDuel:(a,b)=>({attackerDies:b.p>=a.t,blockerDies:a.p>=b.t})
};

// Reproducción exacta del caso observado en torneo HF23.3.8:
// Diablo 6/5 Intimidante + Arrolla, bot a 1 vida, dos bloqueadores 2/2.
// Todas las líneas son terminales, pero el bot debe minimizar el daño y pelear
// en lugar de conservar criaturas para un turno futuro que no existirá.
const terminal=chooseHardBlockPlan({
  attackers:[{unit:unit('Diablo de la Salamanca',6,5,['menace','trample']),index:0}],
  blockers:[
    {unit:unit('Bibliotecaria del Palacio Legislativo',2,2),index:0},
    {unit:unit('Chatarrero con megáfono',2,2),index:1}
  ],
  botLife:1,
  opponentLife:40,
  helpers
});
assert.deepEqual(terminal.assignment,[0,0], 'terminal lethal: must double-block menace instead of preserving doomed material');
assert.equal(terminal.damage,2, 'double block must reduce trample damage from 6 to 2');
assert.equal(terminal.reason,'forced_lethal_line');

// Guard de no-regresión: si una defensa puede evitar lethal, sigue ganando siempre
// sobre cualquier línea terminal, sin importar el material sacrificado.
const survivable=chooseHardBlockPlan({
  attackers:[{unit:unit('Gigante',6,6),index:0}],
  blockers:[
    {unit:unit('Bloq 1',3,3),index:0},
    {unit:unit('Bloq 2',3,3),index:1}
  ],
  botLife:5,
  opponentLife:20,
  helpers
});
assert.deepEqual(survivable.assignment,[0,0]);
assert.equal(survivable.damage,0);
assert.equal(survivable.reason,'best_global');

console.log('PASS test_combat_bot_terminal_lethal_tiebreak_23_21_6_hf23_3_8_1.mjs · terminal lethal prioritizes damage reduction + fight-back; survivable defense unchanged');
