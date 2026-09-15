import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateBotValueAbilityPolicy,
  projectedBotHandGain,
  chooseStrategicBotDiscardIndex,
  scoreBotGraveyardRecovery,
  buildBotSubtypeCounts
} from '../js/botStrategy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// Caso real HF15: Difícil, upkeep propio, 7 cartas y Crematorio instantáneo.
const incident = evaluateBotValueAbilityPolicy({
  strategic:true,
  activePlayer:'rival',
  phase:'upkeep',
  timing:'instant',
  handSize:7,
  projectedHandGain:1,
  hasPlayableMainPhaseSpell:true,
  effectType:'return_from_graveyard'
});
assert.equal(incident.allow, false);
assert.ok(['hand_pressure','reserve_main_phase','defer_to_main2'].includes(incident.reason));

// Incluso con espacio de mano, el valor instantáneo propio se difiere a Main 2.
assert.deepEqual(evaluateBotValueAbilityPolicy({
  strategic:true, activePlayer:'rival', phase:'draw', timing:'instant', handSize:3,
  projectedHandGain:1, hasPlayableMainPhaseSpell:false, effectType:'draw'
}), { allow:false, reason:'defer_to_main2' });

// En turno humano, el valor se guarda para End Step.
assert.equal(evaluateBotValueAbilityPolicy({
  strategic:true, activePlayer:'local', phase:'main2', timing:'instant', handSize:3,
  projectedHandGain:1, effectType:'draw'
}).allow, false);
assert.equal(evaluateBotValueAbilityPolicy({
  strategic:true, activePlayer:'local', phase:'end_step', timing:'instant', handSize:3,
  projectedHandGain:1, effectType:'draw'
}).allow, true);

assert.equal(projectedBotHandGain({type:'return_from_graveyard', amount:1}, 4), 1);
assert.equal(projectedBotHandGain({type:'return_all_lands_from_graveyard'}, 4), 4);

// strategicDiscard: con manabase abundante, una tierra básica sobrante vale menos que removal/engine.
const discardHand = [
  {id:'land',name:'Pantano',type:'Tierra básica — Pantano',cmc:0},
  {id:'rem',name:'Matar',type:'Instantáneo',cmc:2,effect:{type:'destroy_creature'}},
  {id:'engine',name:'Motor',type:'Criatura Artefacto — Constructo',cmc:3,power:2,toughness:3,staticEffect:{type:'spell_cost_modifier',filter:{subtype:'Constructo'}}}
];
assert.equal(chooseStrategicBotDiscardIndex(discardHand,{landCount:7,manaNextTurn:7,battlefieldCards:[]}),0);

// Recuperación: en una mano cargada de Constructos, el reducer debe superar al 3/3 haste plano.
const pibe = {id:'crea_214',name:'Pibe',type:'Criatura Artefacto — Constructo',cmc:3,power:3,toughness:3,keywords:['haste']};
const automata = {id:'crea_351',name:'Autómata',type:'Criatura Artefacto — Constructo',cmc:3,power:2,toughness:3,staticEffect:{type:'spell_cost_modifier',mode:'reduce',amount:1,filter:{subtype:'Constructo'}}};
const constructHand = [
  {type:'Criatura Artefacto — Constructo',cmc:5,power:4,toughness:4},
  {type:'Criatura Artefacto — Constructo',cmc:4,power:4,toughness:4},
  {type:'Criatura Artefacto — Constructo',cmc:3,power:3,toughness:3}
];
const subtypeCounts = buildBotSubtypeCounts(constructHand);
assert.ok(
  scoreBotGraveyardRecovery(automata,{hand:constructHand,battlefieldCards:[],subtypeCounts,landCount:6,manaNextTurn:6}) >
  scoreBotGraveyardRecovery(pibe,{hand:constructHand,battlefieldCards:[],subtypeCounts,landCount:6,manaNextTurn:6})
);

const bot = read('js/bot.js');
const turn = read('js/turnManager.js');
const main = read('js/main.js');
const telemetry = read('js/telemetry.js');

assert.match(bot,/bot_value_ability_deferred/);
assert.match(bot,/reportBotStrategicTurnAtCleanup/);
assert.match(bot,/chooseBotCleanupDiscardIndex/);
assert.match(bot,/BOT_STRATEGIC_MANA_WASTE/);
assert.match(turn,/chooseBotCleanupDiscardIndex\(\)/);
assert.match(turn,/reportBotStrategicTurnAtCleanup\(\{ excessDiscardCount:rivalExcess \}\)/);
assert.match(telemetry,/export function recordTelemetryBugCandidate/);
assert.match(telemetry,/BOT_STRATEGIC_MANA_WASTE/);

// Desktop también debe ceder dos paints antes del trabajo pesado de initGame.
assert.match(main,/async function paintMatchInitializationOverlay\(\)[\s\S]*requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => setTimeout\(resolve, 0\)\)\)/);
assert.match(main,/async function initGame\(deckSource, options = \{\}\) \{\s*showMatchInitializationOverlay\(\);[\s\S]{0,160}?await paintMatchInitializationOverlay\(\);/);
assert.match(main,/globalThis\.__ARGENTINIA_HIDE_MATCH_LOADING__/);

console.log('BOT_STRATEGY_DESKTOP_MATCH_COVER_23_21_6_HF15_OK');
