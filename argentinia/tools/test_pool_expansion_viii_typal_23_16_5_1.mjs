import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import { TYPAL_ENGINE_VERSION, buildCreatureTypeCatalog, cardHasSubtype } from '../js/typalEngine.js';
import { GENERIC_EVENT_ENGINE_VERSION } from '../js/eventEngine.js';
import { libraryCardMatchesFilter } from '../js/libraryEngine.js';
import { spellCostFilterMatches } from '../js/costEngine.js';

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

assert.ok(['23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.4.14'].includes(ENGINE_VERSION));
assert.equal(TYPAL_ENGINE_VERSION,'23.16.5');
assert.equal(GENERIC_EVENT_ENGINE_VERSION,'23.16.5');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(CURRENT_POOL_MILESTONE,'pool_expansion_viii_880');
assert.equal(POOL_BASELINE.total,880);
assert.equal(POOL_MILESTONES.pool_expansion_vii_850.total,850);
assert.equal(cards.length,880);
assert.deepEqual(Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,v.length])),{
  criaturas:355, instantaneos:147, conjuros:107, encantamientos:108, artefactos:87, tierras:68, planeswalkers:8
});

const newIds=new Set([
  ...Array.from({length:20},(_,i)=>`crea_${336+i}`),
  ...Array.from({length:3},(_,i)=>`inst_${145+i}`),
  ...Array.from({length:2},(_,i)=>`conj_${106+i}`),
  ...Array.from({length:3},(_,i)=>`ench_${106+i}`),
  ...Array.from({length:2},(_,i)=>`art_${String(86+i).padStart(3,'0')}`)
]);
const added=cards.filter(c=>newIds.has(c.id));
assert.equal(added.length,30);
const rarity=added.reduce((m,c)=>(m[c.rarity]=(m[c.rarity]||0)+1,m),{});
assert.deepEqual(rarity,{Common:10,Uncommon:12,Rare:7,Mythic:1});
assert.equal(added.filter(c=>c.type.includes('Criatura')).length,20);
assert.equal(added.filter(c=>c.type==='Instantáneo').length,3);
assert.equal(added.filter(c=>c.type==='Conjuro').length,2);
assert.equal(added.filter(c=>c.type==='Encantamiento').length,3);
assert.equal(added.filter(c=>c.type.includes('Artefacto') && !c.type.includes('Criatura')).length,2);

const stringify=x=>JSON.stringify(x);
assert.equal(added.filter(c=>stringify(c).includes('choose_creature_type')).length,7,'Pool VIII must debut seven flexible chosen-type sources');
assert.ok(added.filter(c=>stringify(c).includes('$chosen')).length>=7,'chosen type must be reused declaratively');
assert.equal(added.filter(c=>stringify(c).includes('targetSubtype')).length,3,'three combat tricks must use Typal targeting');
assert.ok(added.filter(c=>stringify(c).includes('spell_cost_modifier') && stringify(c).includes('subtype')).length>=4,'Typal cost reductions must be real content');
assert.ok(added.filter(c=>stringify(c).includes('team_buff') || stringify(c).includes('team_keyword')).length>=10,'Pool VIII must debut real lords/anthems');
assert.ok(added.some(c=>c.id==='conj_106' && libraryCardMatchesFilter({type:'Criatura — Bestia',power:2},{cardType:'creature',subtype:'Bestia'})));
assert.ok(added.some(c=>c.id==='crea_351' && spellCostFilterMatches({type:'Criatura Artefacto — Constructo',power:2},{subtype:'Constructo'})));

const mythic=added.find(c=>c.rarity==='Mythic');
assert.equal(mythic?.name,'Censo Nacional de Criaturas');
assert.equal(mythic?.etbEffect?.type,'choose_creature_type');
assert.ok(mythic.staticEffects.some(e=>e.type==='team_buff' && e.filter?.subtype==='$chosen'));
assert.ok(mythic.staticEffects.some(e=>e.type==='spell_cost_modifier' && e.filter?.subtype==='$chosen'));
assert.ok(mythic.triggers.some(t=>t.event==='creature_entered' && t.filter?.subtype==='$chosen'));

const expectedSubtypeCounts={Humano:218,'Espíritu':26,Bestia:17,Ave:11,'Músico':11,Constructo:8,Canino:5};
const catalog=buildCreatureTypeCatalog(cards);
assert.equal(catalog.length,77,'Pool VIII must strengthen existing tribes without inventing new subtype tokens');
const counts=Object.fromEntries(catalog.map(x=>[x.name,x.count]));
for(const [name,count] of Object.entries(expectedSubtypeCounts)) assert.equal(counts[name],count,`${name} count`);
assert.ok(cardHasSubtype(added.find(c=>c.id==='crea_337'),'Músico'));
assert.ok(cardHasSubtype(added.find(c=>c.id==='crea_349'),'Canino'));
assert.ok(cardHasSubtype(added.find(c=>c.id==='crea_351'),'Constructo'));

const newImages=added.map(c=>c.image);
assert.equal(newImages.length,30);
assert.equal(new Set(newImages).size,30,'every Pool VIII card uses a unique new front image filename');
const prePoolIds=new Set(cards.filter(c=>!newIds.has(c.id)).map(c=>c.image));
assert.ok(newImages.every(img=>!prePoolIds.has(img)),'Pool VIII must not reuse historical front image filenames');
assert.equal(added.filter(c=>c?.dfc?.kind==='transform').length,0,'Pool VIII is Typal, not another Transform content block');
assert.equal(added.filter(c=>stringify(c).includes('create_tokens')).length,0,'Pool VIII adds no token concepts/debt');

const manifest=json('assets/images/cards/cards-image-manifest.json');
assert.equal(manifest.pool?.total ?? manifest.poolTotal ?? manifest.cardCount,880);
assert.equal(manifest.images?.doubleFacedCardCount,16);
assert.equal(manifest.images?.referencedFaceCount,896,'880 fronts + 16 existing TDFC backs');

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log('PASS test_dfc_admin_assets_ux_23_16_5_2.mjs · +30 · 20 creatures · chosen type + lords + tutors + cost + targets · Pool 880');
