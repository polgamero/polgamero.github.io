import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import {
  TRANSFORM_ENGINE_VERSION, isTransformingDoubleFacedCard,
  initializeTransformPermanentItem, transformPermanent, currentTransformFace,
  canTransformPermanent, cardForNonBattlefieldZone
} from '../js/transformEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const fileMap={
  criaturas:'criaturas.json', instantaneos:'instantaneos.json', conjuros:'conjuros.json',
  encantamientos:'encantamientos.json', artefactos:'artefactos.json', tierras:'tierras.json', planeswalkers:'planeswalkers.json'
};
const byCategory=Object.fromEntries(Object.entries(fileMap).map(([k,f])=>[k,json(`assets/data/${f}`)]));
const cards=Object.values(byCategory).flat();

assert.ok(['23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.4.6'].includes(ENGINE_VERSION));
assert.equal(TRANSFORM_ENGINE_VERSION,'23.16.4','content release reuses the canonical 23.16.4 Transform Engine');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=850);
assert.equal(POOL_MILESTONES.pool_expansion_vi_820.total,820,'previous Pool VI milestone must remain frozen');
assert.ok(cards.length>=850);
const cats=Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,v.length]));
assert.ok(cats.criaturas>=335 && cats.instantaneos>=144 && cats.conjuros>=105 && cats.encantamientos>=105 && cats.artefactos>=85 && cats.tierras>=68 && cats.planeswalkers>=8);

const newIds=new Set([
  ...Array.from({length:14},(_,i)=>`crea_${322+i}`),
  ...Array.from({length:4},(_,i)=>`inst_${141+i}`),
  ...Array.from({length:3},(_,i)=>`conj_${103+i}`),
  ...Array.from({length:4},(_,i)=>`ench_${102+i}`),
  ...Array.from({length:4},(_,i)=>`art_${String(82+i).padStart(3,'0')}`),
  'tier_068'
]);
const added=cards.filter(c=>newIds.has(c.id));
assert.equal(added.length,30);
const rarity=added.reduce((m,c)=>(m[c.rarity]=(m[c.rarity]||0)+1,m),{});
assert.deepEqual(rarity,{Common:10,Uncommon:12,Rare:7,Mythic:1});

const tdfc=added.filter(c=>c?.dfc?.kind==='transform');
assert.equal(tdfc.length,16,'Pool VII debuts sixteen physical TDFCs');
assert.ok(cards.filter(c=>c?.dfc?.kind==='transform').length>=16,'Pool VII TDFCs must survive later pools');
assert.ok(tdfc.every(c=>c.dfc.backFace?.name && c.dfc.backFace?.type && c.dfc.backFace?.image));
assert.ok(tdfc.every(c=>!String(c.dfc.kind).toLowerCase().includes('modal')),'MDFC remains out of scope');
assert.equal(cards.filter(c=>/daybound|nightbound/i.test(JSON.stringify(c))).length,0,'Day/Night remains out of scope');

const frontImages=added.map(c=>c.image);
const backImages=tdfc.map(c=>c.dfc.backFace.image);
const allNewImages=[...frontImages,...backImages];
assert.equal(allNewImages.length,46);
assert.equal(new Set(allNewImages).size,46,'30 fronts + 16 backs require unique filenames');

const mythic=added.find(c=>c.rarity==='Mythic');
assert.equal(mythic?.name,'Pibe del Barrio Imposible');
assert.equal(mythic?.dfc?.backFace?.name,'Avatar de la Argentina Secreta');
assert.ok(mythic.dfc.backFace.keywords.includes('flying'));
assert.ok(mythic.dfc.backFace.keywords.includes('trample'));

const support=added.filter(c=>!isTransformingDoubleFacedCard(c));
assert.equal(support.length,14);
const stringify=x=>JSON.stringify(x);
assert.ok(support.filter(c=>stringify(c).includes('"type":"transform"')).length>=8,'support suite must include direct transform effects');
assert.ok(added.filter(c=>stringify(c).includes('permanent_transformed')).length>=7,'Pool VII must debut real transform payoffs');
assert.ok(added.some(c=>c.name==='Segunda Naturaleza' && stringify(c).includes('"target":"event"')));
assert.ok(added.some(c=>c.name==='Espejo de Vestuario'));
assert.ok(added.some(c=>c.name==='Interruptor de Dos Posiciones'));

// Runtime smoke against a real Pool VII TDFC, not a synthetic fixture.
const physical=added.find(c=>c.id==='crea_326');
const item={card:physical,tapped:true,damageTaken:1,counters:{plusOne:1},summoningSickness:false,enteredThisTurn:false,auras:[]};
assert.ok(isTransformingDoubleFacedCard(physical));
assert.equal(initializeTransformPermanentItem(item,physical,{face:'front'}).changed,true);
assert.equal(currentTransformFace(item),'front');
assert.ok(canTransformPermanent(item));
const ref=item;
const result=transformPermanent(item);
assert.equal(result.transformed,true);
assert.equal(item,ref);
assert.equal(currentTransformFace(item),'back');
assert.equal(item.card.name,'Lobizón de Medianoche');
assert.equal(item.tapped,true);
assert.equal(item.damageTaken,1);
assert.equal(item.counters.plusOne,1);
assert.equal(cardForNonBattlefieldZone(item).name,'Séptimo Hijo del Barrio');

const manifest=json('assets/images/cards/cards-image-manifest.json');
assert.ok((manifest.pool?.total ?? manifest.poolTotal ?? manifest.cardCount)>=850);
const manifestText=JSON.stringify(manifest);
assert.ok(manifestText.includes('doubleFacedCardCount'));
assert.ok(manifest.images?.doubleFacedCardCount>=16);
assert.ok(manifest.images?.referencedFaceCount>=866);
assert.ok(manifestText.includes('avatar_de_la_argentina_secreta.png'));
assert.ok(manifestText.includes('usina_fantasma_de_barracas.png'));

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log('PASS test_pool_expansion_vii_transform_23_16_4_1.mjs · +30 · 16 TDFC + 14 support · 46 new face images · Pool 850');
