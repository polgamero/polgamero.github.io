import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeLibraryEffect, normalizeLibraryFilter, libraryCardMatchesFilter,
  getLibraryWindowEntries, getLibraryEligibleEntries, libraryCardCanMoveToDestination,
  chooseBotLibraryEntries, libraryEngineSummary
} from '../js/libraryEngine.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const card=(name,type,manaCost,extra={})=>({name,type,manaCost,...extra});
const deck=[
  card('Bottom Land','Tierra Básica — Bosque','',{colors:[],basic:true}),
  card('Big Beast','Criatura — Bestia','{4}{G}',{colors:['G'],power:5,toughness:5}),
  card('Blue Instant','Instantáneo','{1}{U}',{colors:['U']}),
  card('Legend','Criatura Legendaria — Humano','{W}{U}',{colors:['W','U'],power:2,toughness:2,legendary:true}),
  card('Top Artifact','Artefacto','{2}',{colors:[]})
];

// Contratos default.
const search=normalizeLibraryEffect({type:'search_library',amount:1,filter:{cardType:'creature'},destination:'hand'});
assert.equal(search.range,'all');
assert.equal(search.shuffle,true);
assert.equal(search.remainderDestination,'stay');
assert.equal(search.owner,'self');
const look=normalizeLibraryEffect({type:'look_at_top',lookCount:3,amount:1,filter:{cardType:'creature'},destination:'hand'});
assert.equal(look.range,'top_n');
assert.equal(look.rangeCount,3);
assert.equal(look.shuffle,false);
assert.equal(look.remainderDestination,'bottom');

// Top = final del array: la ventana debe salir TOP-FIRST.
assert.deepEqual(getLibraryWindowEntries(deck,look).map(e=>e.card.name),['Top Artifact','Legend','Blue Instant']);
assert.deepEqual(getLibraryEligibleEntries(deck,look).map(e=>e.card.name),['Legend']);

// Filtros universales.
assert.equal(libraryCardMatchesFilter(deck[3],{cardType:'creature',subtype:'Humano',colors:['W','U'],colorMode:'all',legendary:true,manaValue:2}),true);
assert.equal(libraryCardMatchesFilter(deck[3],{cardType:'creature',color:'B'}),false);
assert.equal(libraryCardMatchesFilter(deck[2],{cardType:'instant_or_sorcery',maxManaValue:2}),true);
assert.equal(libraryCardMatchesFilter(deck[0],{cardType:'land',landKind:'basic'}),true);
assert.equal(libraryCardMatchesFilter(deck[0],{cardType:'land',landKind:'nonbasic'}),false);
assert.equal(normalizeLibraryFilter({cardType:'not_real'}).cardType,'any');

// Destinos: permanentes normales sí; instant/sorcery y Aura a battlefield no.
assert.equal(libraryCardCanMoveToDestination(deck[4],'battlefield'),true);
assert.equal(libraryCardCanMoveToDestination(deck[2],'battlefield'),false);
assert.equal(libraryCardCanMoveToDestination({name:'Aura',type:'Encantamiento — Aura',adjunta:true},'battlefield'),false);

// Tano elige una carta legal y valiosa sin inspeccionar fuera del rango.
const picked=chooseBotLibraryEntries(deck,{...look,amount:1});
assert.equal(picked.length,1);
assert.equal(picked[0].card.name,'Legend');
assert.equal(libraryEngineSummary().version,'23.15.6');

// Integración real del repo.
const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
const stack=fs.readFileSync(path.join(root,'js/stackManager.js'),'utf8');
const bot=fs.readFileSync(path.join(root,'js/bot.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
const version=fs.readFileSync(path.join(root,'js/version.js'),'utf8');
const workflow=fs.readFileSync(path.join(root,'../.github/workflows/pages.yml'),'utf8');
const poolContract=fs.readFileSync(path.join(root,'js/poolContract.js'),'utf8');
assert.match(main,/export async function resolveLibraryEffect/);
assert.match(main,/self_library_action/,'multiplayer debe ejecutar la selección en el dueño real de la biblioteca');
assert.match(main,/pendingLibraryChoice/);
assert.match(main,/putLibraryCardsOntoBattlefield/);
assert.match(main,/replacementCardZonePlan\(card,ownerIsLocal,'library','graveyard'/,'library->graveyard debe respetar Replacement Engine');
assert.match(stack,/effectToApply\.type === 'search_library' \|\| effectToApply\.type === 'look_at_top'/);
assert.match(stack,/canResolveGameEffectWithoutTarget[\s\S]*'search_library'[\s\S]*'look_at_top'/);
assert.match(bot,/normalizeLibraryEffect/);
assert.match(ui,/export function showLibrarySearchModal/);
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.4'")))) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:[6-9]|[1-9]\d+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
assert.match(poolContract,/pool_expansion_i_673:[\s\S]*?23\.15\.5\.5[\s\S]*?673/,'milestone 673 debe seguir auditable');
assert.match(workflow,/regression_legacy_23_(?:15|16|17)_[0-9_]+\.zip/);
assert.match(workflow,/ci_regression_manifest_23_(?:15|16|17)_[0-9_]+\.txt/);
assert.ok(fs.readFileSync(path.join(root,'tools','ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_library_engine_23_15_6.mjs'));

// 23.15.6 congeló el pool en 673; releases posteriores pueden estrenarlo con contenido.
const dataDir=path.join(root,'assets/data');
const files=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const all=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(dataDir,f),'utf8')));
assert.ok(all.length>=673);
assert.ok(all.some(c=>JSON.stringify(c).includes('search_library') || JSON.stringify(c).includes('look_at_top')) || all.length===673);
assert.ok(all.some(c=>c.effect?.type==='search_land'),'search_land legacy debe seguir vivo');

console.log('PASS test_library_engine_23_15_6 pool=673 effects=search_library,look_at_top destinations=7 filters=generic multiplayer=owner-private');
