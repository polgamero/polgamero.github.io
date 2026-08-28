import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeCounterType,getCounterDefinition,getCounterCount,changeCounterCount,listCounters,
  counterStatDelta,resolveUntapAttempt,counterEngineSummary
} from '../js/counterEngine.js';
import { resolveReplacementEvent } from '../js/replacementEngine.js';
import { getProliferateCandidates } from '../js/utils.js';

const creature={card:{id:'c',name:'Prueba',type:'Criatura — Humano'},tapped:true,counters:{plusOne:2,minusOne:1,shield:2,stun:2,charge:3}};
assert.equal(normalizeCounterType('+1/+1'),'plusOne');
assert.equal(normalizeCounterType('Aturdimiento'),'stun');
assert.equal(getCounterDefinition('shield').polarity,'positive');
assert.equal(getCounterDefinition('stun').polarity,'negative');
assert.deepEqual(counterStatDelta(creature),{power:1,toughness:1});
assert.ok(listCounters(creature).some(c=>c.key==='charge' && c.amount===3));
changeCounterCount(creature,'custom_fichas',4);
assert.equal(getCounterCount(creature,'custom_fichas'),4);
assert.equal(getCounterDefinition('custom_fichas').icon,'●');

const untap1=resolveUntapAttempt(creature);
assert.equal(untap1.stunConsumed,true);
assert.equal(creature.tapped,true);
assert.equal(getCounterCount(creature,'stun'),1);
const untap2=resolveUntapAttempt(creature);
assert.equal(untap2.stunConsumed,true);
assert.equal(creature.tapped,true);
assert.equal(getCounterCount(creature,'stun'),0);
const untap3=resolveUntapAttempt(creature);
assert.equal(untap3.untapped,true);
assert.equal(creature.tapped,false);

const shieldItem={card:{id:'shielded',name:'Escudado',type:'Criatura'},counters:{shield:2}};
const shieldState={activeEffects:[],localCombat:[shieldItem],rivalCombat:[],localSupport:[],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
const shieldResult=resolveReplacementEvent(shieldState,{type:'damage',amount:7,item:shieldItem,targetItem:shieldItem,targetIsLocal:true,affectedIsLocal:true});
assert.equal(shieldResult.event.amount,0);
assert.equal(getCounterCount(shieldItem,'shield'),1);
resolveReplacementEvent(shieldState,{type:'damage',amount:0,item:shieldItem,targetItem:shieldItem,targetIsLocal:true,affectedIsLocal:true});
assert.equal(getCounterCount(shieldItem,'shield'),1);

const doubler={card:{id:'dbl',name:'Duplicador',type:'Encantamiento',replacementEffect:{event:'counter_add',counterType:'charge',multiplyAmount:2}},counters:{}};
const chargeTarget={card:{id:'a',name:'Acumulador',type:'Artefacto'},counters:{charge:1}};
const replState={activeEffects:[],localCombat:[],rivalCombat:[],localSupport:[doubler,chargeTarget],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
const doubled=resolveReplacementEvent(replState,{type:'counter_add',amount:2,counterType:'charge',item:chargeTarget,targetItem:chargeTarget,targetIsLocal:true,affectedIsLocal:true});
assert.equal(doubled.event.amount,4);

const pw={card:{id:'pw',name:'PW',type:'Planeswalker'},loyalty:3,counters:{stun:1,charge:2}};
const prolState={localCombat:[{card:{type:'Criatura'},counters:{shield:1}}],rivalCombat:[],localSupport:[chargeTarget],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[pw],rivalPlaneswalkers:[],localPoison:2,rivalPoison:0};
const candidates=getProliferateCandidates(prolState);
const pwEntry=candidates.find(e=>e.item===pw);
assert.deepEqual(new Set(pwEntry.counterTypes),new Set(['loyalty','stun','charge']));
assert.ok(candidates.some(e=>e.kind==='player_poison'));

const summary=counterEngineSummary();
assert.ok(summary.builtins.includes('shield') && summary.builtins.includes('stun') && summary.builtins.includes('lore'));

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const turn=fs.readFileSync(new URL('../js/turnManager.js',import.meta.url),'utf8');
const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../js/ui.js',import.meta.url),'utf8');
const bot=fs.readFileSync(new URL('../js/bot.js',import.meta.url),'utf8');
assert.match(main,/export function removeCounters/);
assert.match(main,/attemptUntapPermanent/);
assert.match(turn,/resolveUntapAttempt\(item\)/);
assert.match(turn,/stun_untap_replacement/);
assert.match(stack,/remove_counter/);
assert.match(stack,/types\.forEach\(type => addCounters\(item,type,1\)\)/);
assert.match(ui,/counter-badge/);
assert.match(ui,/any_permanent/);
assert.match(bot,/getProliferateCandidates\(state\)/);
assert.match(bot,/\['add_counter','remove_counter'\]/);
console.log('PASS test_counters_semantics_ui_23_15_8 builtins=8 shield=semantic stun=semantic custom=generic');
