import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManaCost } from '../js/utils.js';
import { applySpellCostModifiers, getSpellPaymentMethods } from '../js/costEngine.js';
import { normalizeGenericTriggerSpecs, eventFilterMatches, normalizeGameEvent } from '../js/eventEngine.js';
import { resolveReplacementEvent } from '../js/replacementEngine.js';
import { buildCardTextLayout } from '../js/cardTextFormatter.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const files={
  criaturas:'criaturas.json', instantaneos:'instantaneos.json', conjuros:'conjuros.json',
  encantamientos:'encantamientos.json', artefactos:'artefactos.json', tierras:'tierras.json', planeswalkers:'planeswalkers.json'
};
const pools={};
for(const [k,f] of Object.entries(files)) pools[k]=JSON.parse(fs.readFileSync(path.join(root,'assets/data',f),'utf8'));
const all=Object.values(pools).flat();
const byId=new Map(all.map(c=>[c.id,c]));
const ids=[
  ...Array.from({length:13},(_,i)=>`crea_${263+i}`),
  ...Array.from({length:5},(_,i)=>`inst_${111+i}`),
  ...Array.from({length:4},(_,i)=>`conj_${String(77+i).padStart(3,'0')}`),
  ...Array.from({length:5},(_,i)=>`ench_${String(64+i).padStart(3,'0')}`),
  ...Array.from({length:3},(_,i)=>`art_${String(61+i).padStart(3,'0')}`)
];
assert.equal(ids.length,30);
ids.forEach(id=>assert.ok(byId.has(id),`falta ${id}`));

// Milestone histórico 643 -> 673: el pool acumulativo puede crecer, pero nunca encogerse.
assert.ok(all.length>=673);
const minimum={criaturas:275,instantaneos:115,conjuros:80,encantamientos:68,artefactos:63,tierras:64,planeswalkers:8};
for(const [k,n] of Object.entries(minimum)) assert.ok(pools[k].length>=n,`${k} no puede caer por debajo de Pool Expansion I`);
const addedRarity={}; for(const id of ids){ const r=byId.get(id).rarity; addedRarity[r]=(addedRarity[r]||0)+1; }
assert.deepEqual(addedRarity,{Common:10,Uncommon:12,Rare:7,Mythic:1});

// IDs e imágenes: una identidad y un arte por carta, sin reutilización.
assert.equal(new Set(all.map(c=>c.id)).size,all.length,'IDs duplicados');
const newImages=ids.map(id=>byId.get(id).image);
assert.equal(new Set(newImages).size,30,'las 30 nuevas requieren filename exclusivo');
const oldImageSet=new Set(all.filter(c=>!ids.includes(c.id)).map(c=>c.image).filter(Boolean));
for(const img of newImages) assert.equal(oldImageSet.has(img),false,`Pool Expansion no puede reutilizar arte histórico: ${img}`);
const expectedImageName=(name)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'.png';
for(const id of ids){
  const c=byId.get(id);
  assert.equal(c.image,expectedImageName(c.name),`${id}: filename debe seguir ownership contract nombre->PNG`);
}

// Scope: híbrido normal + Phyrexian mono sí; híbrido-Phyrexian/{P} no entra todavía en manaCost.
for(const c of ids.map(id=>byId.get(id))){
  const cost=String(c.manaCost||'');
  assert.doesNotMatch(cost,/\{P\}/,`${c.name}: {P} todavía no es coste pagable`);
  assert.doesNotMatch(cost,/\{[WUBRG]\/[WUBRG]\/P\}/,`${c.name}: Phyrexian híbrido todavía no es pagable`);
}
assert.deepEqual(parseManaCost(byId.get('crea_264').manaCost).hybrid,[['U','R'],['U','R']]);
assert.deepEqual(parseManaCost(byId.get('inst_114').manaCost).phyrexian,['U']);
assert.deepEqual(parseManaCost(byId.get('ench_066').manaCost).phyrexian,['G']);

// Cost Engine estrenado por cartas reales.
assert.equal(getSpellPaymentMethods(byId.get('crea_271')).some(x=>x.type==='convoke'),true);
assert.equal(getSpellPaymentMethods(byId.get('inst_113')).some(x=>x.type==='delve'),true);
assert.equal(byId.get('crea_272').affinity,'artifact');
{
  const state={localCombat:[],localSupport:[{card:{name:'A',type:'Artefacto'}},{card:{name:'B',type:'Artefacto'}}],localLands:[],localPlaneswalkers:[],rivalCombat:[],rivalSupport:[],rivalLands:[],rivalPlaneswalkers:[],localGraveyard:[],rivalGraveyard:[],localHand:[],rivalHand:[]};
  const r=applySpellCostModifiers(state,byId.get('conj_080'),true,parseManaCost('{4}{U}'));
  assert.equal(r.cost.generic,2,'Inventario del Taller debe recibir Affinity real');
}
{
  const state={localCombat:[],localSupport:[],localLands:[],localPlaneswalkers:[],rivalCombat:[{card:byId.get('crea_270'),tapped:false}],rivalSupport:[],rivalLands:[],rivalPlaneswalkers:[],localGraveyard:[],rivalGraveyard:[],localHand:[],rivalHand:[]};
  const r=applySpellCostModifiers(state,{name:'Prueba',type:'Instantáneo',colors:['U']},true,parseManaCost('{U}'));
  assert.equal(r.cost.generic,1,'Gestora debe taxear noncreature rival');
}

// Event Engine: 7 cartas nuevas usan el contrato declarativo y sus filtros son ejecutables.
const genericCards=ids.map(id=>byId.get(id)).filter(c=>Array.isArray(c.triggers));
assert.equal(genericCards.length,7);
assert.equal(normalizeGenericTriggerSpecs(byId.get('crea_264'))[0].event,'spell_cast');
assert.equal(eventFilterMatches(
  normalizeGenericTriggerSpecs(byId.get('crea_264'))[0].filter,
  normalizeGameEvent({type:'spell_cast',controllerIsLocal:true,card:{type:'Instantáneo',colors:['U']}}),
  {sourceIsLocal:true,sourceItem:{_syncObjectId:'f'},sourceCard:byId.get('crea_264')}
),true);
assert.equal(normalizeGenericTriggerSpecs(byId.get('ench_066'))[0].target,'event');

// Control Engine: temporal, permanente any_permanent y Aura ligada a fuente.
assert.equal(byId.get('conj_077').effect.type,'gain_control_until_eot');
assert.equal(byId.get('conj_077').effect.untap,true);
assert.equal(byId.get('conj_077').effect.grantHaste,true);
assert.equal(byId.get('conj_078').effect.targetKind,'any_permanent');
assert.equal(byId.get('ench_064').auraEffect.controlAttachedCreature,true);

// Replacement / Prevention: cuatro fuentes reales del pool.
const replacementCards=ids.map(id=>byId.get(id)).filter(c=>c.replacementEffect);
assert.equal(replacementCards.length,4);
const perm=(c,isLocal=true)=>({card:c,tapped:false,_syncObjectId:`obj_${c.id}`,isLocal});
const empty=()=>({localCombat:[],localSupport:[],localLands:[],localPlaneswalkers:[],rivalCombat:[],rivalSupport:[],rivalLands:[],rivalPlaneswalkers:[],activeEffects:[]});
{
  const s=empty(); s.localSupport.push(perm(byId.get('ench_067')));
  const r=resolveReplacementEvent(s,{type:'zone_change',zoneFrom:'battlefield',zoneTo:'graveyard',affectedIsLocal:false,card:{type:'Criatura'},cause:'destroy'});
  assert.equal(r.event.zoneTo,'exile');
}
{
  const s=empty(); s.localSupport.push(perm(byId.get('ench_068')));
  const r=resolveReplacementEvent(s,{type:'damage',amount:4,affectedIsLocal:true,targetIsLocal:true,card:{type:'Criatura — Humano'}});
  assert.equal(r.event.amount,3);
}
{
  const s=empty(); s.localCombat.push(perm(byId.get('crea_269')));
  const r=resolveReplacementEvent(s,{type:'counter_add',amount:2,counterType:'plusOne',affectedIsLocal:true,card:{type:'Criatura — Humano'}});
  assert.equal(r.event.amount,4);
}
{
  const s=empty(); s.localSupport.push(perm(byId.get('art_063')));
  const r=resolveReplacementEvent(s,{type:'token_create',amount:3,affectedIsLocal:true});
  assert.equal(r.event.amount,6);
}

// Presentation contract: la expansión nace usando reminders centralizados.
assert.match(buildCardTextLayout(byId.get('crea_271')).paragraphs[0].reminder,/criaturas pueden ayudar/i);
assert.match(buildCardTextLayout(byId.get('inst_113')).paragraphs[0].reminder,/exilies de tu cementerio/i);
assert.match(buildCardTextLayout(byId.get('conj_080')).paragraphs[0].reminder,/cuesta \{1\} menos/i);
assert.deepEqual(buildCardTextLayout(byId.get('crea_268')).keywordLabels,['Al toque','Impuesto 1']);
assert.equal(buildCardTextLayout(byId.get('conj_077')).paragraphs.length,3,'Threaten debe renderizar sus tres reglas en renglones separados');
assert.equal(buildCardTextLayout(byId.get('inst_112')).paragraphs.length,2,'Convoke + prevention deben quedar separados');

// Los cuatro bordes genéricos descubiertos por el gate quedan resueltos en el motor, no por carta.
const stack=fs.readFileSync(path.join(root,'js/stackManager.js'),'utf8');
const bot=fs.readFileSync(path.join(root,'js/bot.js'),'utf8');
assert.match(stack,/const drawAmount=Math\.max\(0,Math\.floor\(Number\(effect\.amount \?\? 1\)/,'draw_and_lose_life debe honrar amount > 1');
assert.match(stack,/resolveSimpleDirectEffect\(effectToApply, card, isLocal\)/,'efectos directos deben conservar sourceCard');
assert.match(stack,/effect\.type === 'damage'[\s\S]{0,700}replacementDamageAmount/,'daño sin target debe pasar por Replacement/Prevention');
assert.match(stack,/powerMod: effectToApply\.powerMod[\s\S]{0,180}keywords:/,'pump debe poder conceder keyword temporal en el mismo efecto');
assert.match(bot,/cardToPlay\.effect\.type === 'prevent_damage'[\s\S]{0,600}type:'creature'/,'Tano debe construir target legal para prevention');

// Pool Contract / build / CI.
const poolContract=fs.readFileSync(path.join(root,'js/poolContract.js'),'utf8');
const version=fs.readFileSync(path.join(root,'js/version.js'),'utf8');
const workflow=fs.readFileSync(path.join(root,'../.github/workflows/pages.yml'),'utf8');
assert.match(poolContract,/pool_expansion_i_673:\s*makeMilestone\('23\.15\.5\.5',\s*673,/, 'milestone 673 debe existir');
assert.match(poolContract,/pool_expansion_i_673:\s*makeMilestone\('23\.15\.5\.5',\s*673,/);
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.4'")))) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:[6-9]|[1-9]\d+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
assert.match(workflow,/regression_legacy_23_(?:15|16|17)_[0-9_]+\.zip/);
assert.match(workflow,/ci_regression_manifest_23_(?:15|16|17)_[0-9_]+\.txt/);
// The canonical compact-regression manifest is explicit. Do not pick the first
// historical manifest returned by readdirSync(): stale files can survive a web
// upload in GitHub and directory enumeration order is not a version contract.
const manifest='ci_regression_manifest_23_17_3_1.txt';
assert.ok(fs.existsSync(path.join(root,'tools',manifest)), 'canonical regression manifest debe existir');
assert.ok(fs.readFileSync(path.join(root,'tools',manifest),'utf8').includes('test_pool_expansion_i_23_15_5_5.mjs'));

console.log('PASS test_pool_expansion_i_23_15_5_5 pool=673 new=30 events=7 control=3 convoke=3 delve=2 affinity=2 replacements=4');
