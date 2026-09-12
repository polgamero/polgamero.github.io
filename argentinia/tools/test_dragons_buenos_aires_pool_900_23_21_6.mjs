import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPE_IDS, getArchetypeDefinition, inferCardDeckProfile, buildCompetitiveDeck, validateCompetitiveDeck } from '../js/deckIntelligence.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import { PUBLISHED_CARD_BASELINE_IDS } from '../js/publishedCardBaseline.js';
import { TRUSTED_CARD_POOL } from '../../functions/src/trusted/cardCatalog.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const argRoot=path.resolve(__dirname,'..');
const dataRoot=path.join(argRoot,'assets/data');
const readCards=name=>JSON.parse(fs.readFileSync(path.join(dataRoot,`${name}.json`),'utf8'));
const categories={
  tierras:readCards('tierras'), artefactos:readCards('artefactos'), criaturas:readCards('criaturas'),
  instantaneos:readCards('instantaneos'), conjuros:readCards('conjuros'), encantamientos:readCards('encantamientos'),
  planeswalkers:readCards('planeswalkers')
};
const cards=Object.values(categories).flat();
const manifest=JSON.parse(fs.readFileSync(path.join(argRoot,'build-manifest.json'),'utf8'));

assert.equal(manifest.engineVersion,'23.21.6');
assert.equal(manifest.pool,900);
assert.equal(manifest.poolMilestone,'dragons_buenos_aires_900');
assert.match(manifest.label,/DRAGONES EN BUENOS AIRES/i);
assert.equal(CURRENT_POOL_MILESTONE,'dragons_buenos_aires_900');
assert.equal(POOL_BASELINE.total,900);
assert.deepEqual(POOL_BASELINE.categories,{tierras:68,artefactos:89,criaturas:367,instantaneos:149,conjuros:109,encantamientos:110,planeswalkers:8});
assert.equal(cards.length,900);
assert.equal(TRUSTED_CARD_POOL.length,900);

// Publication is deliberately NOT advanced with physical pool cardinality.
assert.equal(PUBLISHED_CARD_BASELINE_IDS.length,880);
assert.equal(new Set(PUBLISHED_CARD_BASELINE_IDS).size,880);

const dragonIds=[
  'crea_356','crea_357','crea_358','crea_359','crea_360','crea_361','crea_362','crea_363','crea_364','crea_365','crea_366','crea_367',
  'inst_148','inst_149','conj_108','conj_109','ench_109','ench_110','art_088','art_089'
];
const expansion=dragonIds.map(id=>cards.find(card=>card.id===id));
assert.ok(expansion.every(Boolean),'the 20 Dragon expansion IDs must exist');
assert.equal(new Set(dragonIds).size,20);
assert.ok(expansion.every(card=>card.enabled===false),'every 23.21.6 card must ship explicitly disabled');
assert.ok(expansion.every(card=>!PUBLISHED_CARD_BASELINE_IDS.includes(card.id)),'new cards must remain outside frozen 880 publication baseline');

assert.equal(expansion.filter(c=>c.type.includes('Criatura')).length,12);
assert.equal(expansion.filter(c=>c.type==='Instantáneo').length,2);
assert.equal(expansion.filter(c=>c.type==='Conjuro').length,2);
assert.equal(expansion.filter(c=>c.type==='Encantamiento').length,2);
assert.equal(expansion.filter(c=>c.type==='Artefacto').length,2);
assert.deepEqual(Object.fromEntries(['Common','Uncommon','Rare','Mythic'].map(r=>[r,expansion.filter(c=>c.rarity===r).length])),{Common:5,Uncommon:7,Rare:6,Mythic:2});

const expectedNames=new Map([
 ['crea_356','Cría de Brasa Errante'],['crea_357','Varkel, Vigía del Poniente'],['crea_358','Garganta de Fuego Carmesí'],
 ['crea_359','Ignivar, Rey de las Brasas'],['crea_360','Musgaria, Cría de Escama Verde'],['crea_361','Torvagrís, Draco de la Sierra'],
 ['crea_362','Verdarraíz, Coloso Ancestral'],['crea_363','Magmavelo, Ala del Horizonte'],['crea_364','Azhkar, Furia del Cielo Austral'],
 ['crea_365','Nocthar, Devorador de Juramentos'],['crea_366','Zafiria, Ala de la Tormenta'],['crea_367','Aureón, Guardián del Alba'],
 ['inst_148','Escamas de Acero'],['inst_149','Picada desde las Nubes'],['conj_108','Rastro de Escamas'],['conj_109','Despertar de los Nidos'],
 ['ench_109','Cielo Reclamado'],['ench_110','Juramento de la Primera Llama'],['art_088','Nido de Obsidiana'],['art_089','Mapa de los Nidos Antiguos']
]);
for(const card of expansion) assert.equal(card.name,expectedNames.get(card.id));

// Client/server trusted definitions stay semantic parity for all new cards.
for(const card of expansion){
  const trusted=TRUSTED_CARD_POOL.find(x=>x.id===card.id);
  assert.deepEqual(trusted,card,`trusted server card must equal client ${card.id}`);
}

assert.equal(ARCHETYPE_IDS.length,16);
assert.ok(ARCHETYPE_IDS.includes('dragons'));
const dragonArch=getArchetypeDefinition('dragons');
assert.equal(dragonArch.label,'Dragones');
assert.equal(dragonArch.lands,25);
assert.equal(dragonArch.typalDensityFloor,0.50);
assert.equal(dragonArch.tribalSupportFloor,4);

for(const card of categories.criaturas.filter(c=>dragonIds.includes(c.id))){
  const profile=inferCardDeckProfile(card);
  assert.ok(profile.subtypeTokens.includes('dragon'),`${card.id} must normalize subtype Dragón`);
  assert.ok(profile.themes.includes('dragons'),`${card.id} must feed Dragon specialization`);
}

function seeded(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
const built=buildCompetitiveDeck(cards,['R','G'],{quality:'strong',archetypeId:'dragons',rng:seeded(2321600),candidateCount:28,goldfishIterations:16});
assert.ok(validateCompetitiveDeck(built.deck,['R','G']).ok);
assert.equal(built.report.archetypeId,'dragons');
assert.equal(built.report.focusSubtype,'dragon');
assert.ok(built.report.composition.focusCreatures>=8,'RG Dragons must contain real Dragon mass');
assert.ok(built.report.composition.typalDensity>=0.40,'Strong RG Dragons must preserve high Dragon density');
assert.ok((built.report.roles.ramp||0)>=2,'Dragon build must include real acceleration/reduction support');

// Starter construction must remain deterministic and respect the premium-card budget even with a rare-heavy tribe.
const starterBuilt=buildCompetitiveDeck(cards,['R','G'],{quality:'starter',archetypeId:'dragons',rng:seeded(23195010),candidateCount:32,goldfishIterations:12});
assert.ok(validateCompetitiveDeck(starterBuilt.deck,['R','G']).ok);
assert.equal(starterBuilt.report.focusSubtype,'dragon');
assert.ok((starterBuilt.report.rarity.Mythic||0)<=1,'Starter Dragons mythic ceiling');
assert.ok((starterBuilt.report.rarity.Mythic||0)+(starterBuilt.report.rarity.Rare||0)<=6,'Starter Dragons premium ceiling');
assert.ok(starterBuilt.report.composition.typalDensity>=0.50,'Starter Dragons remains recognizably tribal');

console.log('DRAGONES_BUENOS_AIRES_23_21_6_OK pool=900 publishedBaseline=880 newCards=20 creatures=12 supports=8 archetypes=16 focus=dragon');
