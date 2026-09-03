import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLibraryEffect, libraryCardMatchesFilter, libraryCardCanMoveToDestination } from '../js/libraryEngine.js';
import { normalizeTokenSpec, buildTokenCard, tokenBattlefieldKind } from '../js/tokenEngine.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const dataDir=path.join(root,'assets','data');
const files=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const all=files.flatMap(file=>JSON.parse(fs.readFileSync(path.join(dataDir,file),'utf8')));
const byId=new Map(all.map(c=>[c.id,c]));

// Milestone histórico: los pools acumulativos posteriores pueden crecer, pero 700 y sus mínimos deben sobrevivir.
assert.ok(all.length>=700,'POOL EXPANSION II no puede desaparecer de un pool acumulativo posterior');
const currentCounts=Object.fromEntries(files.map(f=>[f,JSON.parse(fs.readFileSync(path.join(dataDir,f),'utf8')).length]));
const minimumCounts={'criaturas.json':285,'instantaneos.json':120,'conjuros.json':85,'encantamientos.json':71,'artefactos.json':67,'tierras.json':64,'planeswalkers.json':8};
for(const [file,min] of Object.entries(minimumCounts)) assert.ok(currentCounts[file]>=min,`${file} cayó por debajo del milestone 700`);

const newIds=[
  ...Array.from({length:10},(_,i)=>`crea_${276+i}`),
  ...Array.from({length:5},(_,i)=>`inst_${116+i}`),
  ...Array.from({length:5},(_,i)=>`conj_${String(81+i).padStart(3,'0')}`),
  ...Array.from({length:3},(_,i)=>`ench_${String(69+i).padStart(3,'0')}`),
  ...Array.from({length:4},(_,i)=>`art_${String(64+i).padStart(3,'0')}`)
];
assert.equal(newIds.length,27);
const added=newIds.map(id=>{ assert.ok(byId.has(id),`falta ${id}`); return byId.get(id); });

// Gate pedido por el usuario: nombres únicos incluso ignorando tildes, mayúsculas y puntuación.
const normalizedName=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const seenNames=new Map();
for(const c of all){
  const key=normalizedName(c.name);
  assert.ok(!seenNames.has(key),`nombre duplicado normalizado: ${c.name} / ${seenNames.get(key)?.name}`);
  seenNames.set(key,c);
}
assert.equal(byId.get('crea_176').name,'Archivista del Congreso','la carta histórica se preserva');
assert.equal(byId.get('crea_277').name,'Bibliotecaria del Palacio Legislativo','el duplicado propuesto fue renombrado');

// Imágenes de carta nuevas: exclusivas y con slug canónico completo derivado del nombre.
const canonical=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')+'.png';
const allImageOwners=new Map();
for(const c of all){
  if(!c.image) continue;
  if(!allImageOwners.has(c.image)) allImageOwners.set(c.image,[]);
  allImageOwners.get(c.image).push(c.id);
}
for(const c of added){
  assert.equal(c.image,canonical(c.name),`${c.id} filename no canónico`);
  assert.deepEqual(allImageOwners.get(c.image),[c.id],`${c.id} reutiliza imagen ${c.image}`);
}

// Rarezas pactadas: 10 C / 10 U / 6 R / 1 M.
const rarity={}; for(const c of added) rarity[c.rarity]=(rarity[c.rarity]||0)+1;
assert.deepEqual(rarity,{Common:10,Rare:6,Uncommon:10,Mythic:1});

// Library Engine: 11 cartas reales nuevas, incluyendo search, look-at-N y battlefield_tapped.
const effects=[];
const walk=v=>{ if(!v)return; if(Array.isArray(v)) return v.forEach(walk); if(typeof v!=='object')return; if(v.type) effects.push(v); Object.values(v).forEach(walk); };
added.forEach(walk);
const libraryEffects=effects.filter(e=>['search_library','look_at_top'].includes(e.type));
assert.equal(libraryEffects.length,11,'deben estrenarse 11 efectos de biblioteca');
assert.ok(libraryEffects.some(e=>e.type==='search_library' && e.destination==='battlefield_tapped'));
assert.ok(libraryEffects.some(e=>e.type==='look_at_top' && e.remainderDestination==='graveyard'));
for(const e of libraryEffects){
  const spec=normalizeLibraryEffect(e);
  assert.ok(spec.amount>=1);
}
assert.equal(libraryCardMatchesFilter({type:'Criatura — Humano',cmc:2,colors:['W']},{cardType:'creature',maxManaValue:2}),true);
assert.equal(libraryCardCanMoveToDestination({type:'Artefacto',cmc:2},'battlefield_tapped'),true);

// Generic Permanent Tokens: los cuatro presets + Encantamiento-token + Tierra-token.
const tokenEffects=effects.filter(e=>e.type==='create_tokens');
assert.ok(tokenEffects.length>=13,'deben existir al menos 13 productores token en las 27');
for(const preset of ['treasure','clue','food','blood']) assert.ok(tokenEffects.some(e=>e.tokenPreset===preset),`falta preset ${preset}`);
const pactEffect=byId.get('conj_085').effect;
const pactCard=buildTokenCard(normalizeTokenSpec(pactEffect,byId.get('conj_085')),{id:'test_pact'});
assert.equal(pactCard.type,'Encantamiento — Pacto'); assert.equal(tokenBattlefieldKind(pactCard),'support');
const lotEffect=byId.get('art_067').etbEffect;
const lotCard=buildTokenCard(normalizeTokenSpec(lotEffect,byId.get('art_067')),{id:'test_lot'});
assert.equal(lotCard.type,'Tierra — Lote'); assert.equal(tokenBattlefieldKind(lotCard),'land'); assert.equal(lotCard.manaAbility.produces,'C');

// Los triggers token_created están redactados/contratados por ficha (el engine publica un evento por token).
for(const id of ['crea_279','crea_283','ench_069']){
  const t=byId.get(id).triggers?.[0]; assert.equal(t?.event,'token_created'); assert.equal(t?.filter?.controller,'you');
}
assert.equal(byId.get('ench_070').triggers[0].event,'permanent_sacrificed');
assert.equal(byId.get('ench_070').triggers[0].filter.excludeCardType,'artifact');

// Milestone/version y reanimate hotfix heredado deben sobrevivir.
const poolContract=fs.readFileSync(path.join(root,'js','poolContract.js'),'utf8');
const version=fs.readFileSync(path.join(root,'js','version.js'),'utf8');
const stack=fs.readFileSync(path.join(root,'js','stackManager.js'),'utf8');
assert.match(poolContract,/pool_expansion_ii_700:[\s\S]*?23\.15\.7\.2[\s\S]*?700/);
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.4'")))) assert.match(version,/ENGINE_BASELINE = '[^']*23\.15\.7\.2 POOL EXPANSION II/);
assert.doesNotMatch(stack,/triggerCreatureEtb\(isLocal, revivedCard, newUnit\);\s*}\s*if \(revivedCard\.etbEffect\)/);

console.log('PASS test_pool_expansion_ii_23_15_7_2 milestone=700 added=27 names=unique library=11 tokens=13+');
