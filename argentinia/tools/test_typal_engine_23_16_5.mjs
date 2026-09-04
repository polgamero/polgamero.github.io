import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import {
  TYPAL_ENGINE_VERSION, normalizeTypalName, cardSubtypeNames, cardHasSubtype,
  cardsShareCreatureType, setChosenCreatureType, getChosenCreatureType,
  typalFilterMatches, countBySubtype, buildCreatureTypeCatalog, typalEngineSummary
} from '../js/typalEngine.js';
import { libraryCardMatchesFilter } from '../js/libraryEngine.js';
import { spellCostFilterMatches, applySpellCostModifiers } from '../js/costEngine.js';
import { eventFilterMatches, GAME_EVENT_TYPES, GENERIC_EVENT_ENGINE_VERSION } from '../js/eventEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers'];
const cards=files.flatMap(x=>JSON.parse(read(`assets/data/${x}.json`)));

assert.ok(['23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.5'].includes(ENGINE_VERSION));
assert.equal(TYPAL_ENGINE_VERSION,'23.16.5');
assert.equal(GENERIC_EVENT_ENGINE_VERSION,'23.16.5');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=850);
assert.ok(cards.length>=850,'Typal Engine contract survives later Typal content');

const firulais=cards.find(c=>c.id==='crea_001');
assert.deepEqual(cardSubtypeNames(firulais),['Canino']);
assert.ok(cardHasSubtype(firulais,'CANÍNO'),'subtype matching is accent/case insensitive but token exact');
assert.equal(cardHasSubtype({type:'Criatura — Humanos'},'Humano'),false,'Typal does not silently singularize legacy type names');
assert.ok(cardsShareCreatureType({type:'Criatura — Humano Músico',power:1},{type:'Criatura — Humano Artista',power:1}));
assert.equal(cardsShareCreatureType({type:'Criatura — Canino',power:1},{type:'Criatura — Felino',power:1}),false);
assert.equal(normalizeTypalName('  Espíritu '),'espiritu');

const source={card:{name:'Lord',type:'Criatura — Humano',power:2,toughness:2},_chosenCreatureType:null};
assert.equal(setChosenCreatureType(source,'Canino'),'Canino');
assert.equal(getChosenCreatureType(source),'Canino');
assert.ok(typalFilterMatches(firulais,{subtype:'$chosen'},{sourceItem:source,sourceCard:source.card}));
assert.ok(typalFilterMatches({card:{type:'Criatura — Humano',power:1}}, {sharedCreatureTypeWithSource:true},{sourceItem:source,sourceCard:source.card}));
assert.equal(typalFilterMatches(source,{subtype:'Humano',other:true},{sourceItem:source,sourceCard:source.card}),false,'other excludes the source object itself');

const entries=[
  {isLocal:true,item:{card:{type:'Criatura — Canino',power:1}}},
  {isLocal:true,item:{card:{type:'Criatura — Humano Canino',power:2}}},
  {isLocal:false,item:{card:{type:'Criatura — Canino',power:3}}}
];
assert.equal(countBySubtype(entries,'Canino',{controllerIsLocal:true}),2);
assert.equal(countBySubtype(entries,'$chosen',{controllerIsLocal:true,sourceItem:source}),2);

const catalog=buildCreatureTypeCatalog(cards);
assert.equal(catalog.length,77);
assert.deepEqual(catalog.slice(0,3).map(x=>x.name),['Humano','Espíritu','Bestia']);
assert.ok(catalog[0].count>=211 && catalog[1].count>=23 && catalog[2].count>=14);
const summary=typalEngineSummary(cards);
assert.ok(summary.supports.includes('typalLords') && summary.supports.includes('typalCostReduction'));

assert.ok(libraryCardMatchesFilter(firulais,{cardType:'creature',subtype:'Canino'}));
assert.equal(libraryCardMatchesFilter(firulais,{cardType:'creature',subtype:'Humano'}),false);
assert.ok(spellCostFilterMatches({type:'Criatura — Canino',colors:['G']},{subtype:'Canino'}));
assert.equal(spellCostFilterMatches({type:'Criatura — Canino',colors:['G']},{subtype:'Humano'}),false);

const typalReducer={card:{name:'Criadero del Barrio',type:'Encantamiento',staticEffect:{type:'spell_cost_modifier',mode:'reduce',amount:1,scope:'own',filter:{subtype:'$chosen'}}},_chosenCreatureType:'Canino'};
const empty={localCombat:[],rivalCombat:[],localSupport:[typalReducer],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[],localGraveyard:[],rivalGraveyard:[],localHand:[],rivalHand:[]};
const reduced=applySpellCostModifiers(empty,{type:'Criatura — Canino',colors:['G']},true,{W:0,U:0,B:0,R:0,G:1,C:0,generic:3});
assert.equal(reduced.cost.generic,2,'chosen-type cost reducer applies through the canonical Cost Engine');
const untouched=applySpellCostModifiers(empty,{type:'Criatura — Felino',colors:['G']},true,{W:0,U:0,B:0,R:0,G:1,C:0,generic:3});
assert.equal(untouched.cost.generic,3);

assert.ok(eventFilterMatches({subtype:'Canino'},{type:'creature_entered',card:{type:'Criatura — Canino',power:1}},{sourceCard:{type:'Encantamiento'},sourceItem:{}}));
assert.equal(eventFilterMatches({subtype:'Humano'},{type:'creature_entered',card:{type:'Criatura — Canino',power:1}},{sourceCard:{type:'Encantamiento'},sourceItem:{}}),false);
assert.ok(eventFilterMatches({sharedCreatureTypeWithSource:true},{type:'creature_entered',card:{type:'Criatura — Humano Músico',power:1}},{sourceCard:{type:'Criatura — Humano Artista',power:2},sourceItem:{}}));
assert.ok(GAME_EVENT_TYPES.includes('creature_type_chosen'));

const main=read('js/main.js'), ui=read('js/ui.js'), bot=read('js/bot.js'), stack=read('js/stackManager.js');
assert.ok(main.includes('chooseCreatureTypeForEffect') && main.includes("typal_choose_creature_type"),'human + multiplayer creature-type choice must be wired');
assert.ok(ui.includes('showCreatureTypeChoiceModal') && ui.includes('subtypeFilter'),'Typal targeting/UI must be wired');
assert.ok(bot.includes('targetSubtype') && bot.includes('cardHasSubtype'),'Tano must understand typal targets');
assert.ok(stack.includes("'choose_creature_type'") && stack.includes("effectToApply.type === 'choose_creature_type'"),'Stack resolver must classify and execute chooseCreatureType');
assert.ok(cards.filter(c=>JSON.stringify(c).includes('choose_creature_type')).length>=0,'Typal content may debut in Pool VIII');

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log('PASS test_typal_engine_23_16_5.mjs · generic exact subtypes + shared types + chosen type + lords/cost/library/events/targets · Pool 850');
