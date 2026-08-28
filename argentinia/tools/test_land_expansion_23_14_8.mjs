import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { POOL_BASELINE, POOL_MILESTONES, CURRENT_POOL_MILESTONE } from '../js/poolContract.js';
import { normalizeManaAbility } from '../js/manaSources.js';
import { normalizeLandSearchEffect } from '../js/landSearch.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(root, 'assets', 'data');
const categoryFiles = ['tierras','artefactos','criaturas','instantaneos','conjuros','encantamientos','planeswalkers'];
const cardsByCategory = Object.fromEntries(categoryFiles.map(name => [name, JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'))]));
const cards = categoryFiles.flatMap(name => cardsByCategory[name]);
const byId = new Map(cards.map(c => [c.id,c]));

const landBaseline = POOL_MILESTONES.land_expansion_643;
assert.ok(landBaseline, 'historical land_expansion_643 milestone must remain auditable');
assert.equal(landBaseline.version, '23.14.8');
assert.equal(landBaseline.total, 643);
assert.deepEqual(landBaseline.categories, {
  tierras:64, artefactos:60, criaturas:262, instantaneos:110, conjuros:76, encantamientos:63, planeswalkers:8
});
assert.ok(POOL_BASELINE.total >= landBaseline.total, 'current cumulative pool cannot shrink below LAND Expansion');
assert.equal(cards.length, POOL_BASELINE.total, `current pool must match ${CURRENT_POOL_MILESTONE}`);
for (const [name, expected] of Object.entries(POOL_BASELINE.categories)) assert.equal(cardsByCategory[name].length, expected, `${name} current cardinalidad`);

const expansionIds = [
  ...Array.from({length:8},(_,i)=>`tier_${String(57+i).padStart(3,'0')}`),
  ...Array.from({length:6},(_,i)=>`art_${String(55+i).padStart(3,'0')}`),
  ...Array.from({length:10},(_,i)=>`crea_${253+i}`),
  ...Array.from({length:5},(_,i)=>`inst_${106+i}`),
  ...Array.from({length:6},(_,i)=>`conj_${String(71+i).padStart(3,'0')}`),
  ...Array.from({length:7},(_,i)=>`ench_${String(57+i).padStart(3,'0')}`)
];
assert.equal(expansionIds.length,42);
for (const id of expansionIds) assert.ok(byId.has(id), `Falta carta LAND Expansion ${id}`);
const expansion = expansionIds.map(id => byId.get(id));
assert.equal(new Set(expansion.map(c=>c.name)).size,42,'Nombres nuevos deben ser únicos');
assert.equal(new Set(expansion.map(c=>c.image)).size,42,'Los 42 PNG asignados deben ser únicos entre sí');
for (const c of expansion) {
  assert.ok(c.image?.endsWith('.png'), `${c.id} debe tener filename PNG`);
  assert.equal(cards.filter(x => x.image === c.image).length, 1, `${c.id} no puede reutilizar imagen histórica`);
}

// Balance anchors: deliberately equal/slower than canonical historical benchmarks.
assert.equal(byId.get('conj_071').manaCost,'{2}{R}');
assert.equal(byId.get('conj_071').effect.type,'destroy_land'); // Stone Rain
assert.equal(byId.get('inst_110').manaCost,'{4}{R}'); // unconditional instant-speed LD deliberately slower
assert.equal(byId.get('tier_057').activatedAbility.cost,'{2}{T}'); // Wasteland-style, but not free
assert.equal(byId.get('inst_106').manaCost,'{G}');
assert.deepEqual(byId.get('inst_106').additionalCost,{sacrifice:{target:'own_land',amount:1}}); // Crop Rotation
assert.equal(byId.get('conj_072').manaCost,'{1}{G}');
assert.equal(byId.get('conj_072').effect.destination,'battlefield_tapped'); // Rampant Growth
assert.equal(byId.get('conj_075').manaCost,'{4}{W}{W}');
assert.equal(byId.get('conj_075').effect.type,'destroy_all_lands'); // Armageddon effect, deliberately taxed above historical 3W
assert.equal(byId.get('ench_061').manaCost,'{2}{R}');
assert.equal(byId.get('ench_061').staticEffect.type,'land_type_set'); // Blood Moon
assert.equal(byId.get('art_060').manaCost,'{3}');
assert.equal(byId.get('art_060').staticEffect.type,'land_untap_limit'); // Winter Orb effect, deliberately taxed above historical 2

// LAND 0 / 4 universal mana-source content.
assert.deepEqual(normalizeManaAbility(byId.get('art_056')), {
  options:['W','U','B','R','G'], amount:3, requiresTap:true, sacrificeSelf:true, sourceSchema:'manaAbility'
});
assert.deepEqual(normalizeManaAbility(byId.get('art_055')), {
  options:['W','U','B','R','G'], amount:1, requiresTap:false, sacrificeSelf:true, sourceSchema:'manaAbility'
});
assert.deepEqual(normalizeManaAbility(byId.get('crea_253')).options,['G']);
assert.equal(normalizeManaAbility(byId.get('crea_255')).amount,2);
assert.equal(normalizeManaAbility(byId.get('tier_064')).amount,2);

// LAND 1 manlands: four new instances plus the three historical ones.
const newManlands = expansion.filter(c => JSON.stringify(c).includes('animate_land'));
assert.equal(newManlands.length,4);
for (const c of newManlands) assert.equal(c.activatedAbility.timing,'instant');

// LAND 2 land destruction: targeted any, targeted nonbasic, filtered mass, full mass.
assert.ok(expansion.some(c=>c.effect?.type==='destroy_land'));
assert.ok(expansion.some(c=>c.effect?.type==='destroy_nonbasic_land') || expansion.some(c=>c.activatedAbility?.effect?.type==='destroy_nonbasic_land'));
assert.ok(expansion.some(c=>c.effect?.type==='destroy_all_lands' && c.effect.landFilter==='any'));
assert.ok(expansion.some(c=>c.effect?.type==='destroy_all_lands' && c.effect.landFilter==='nonbasic'));

// LAND 3 exact tutor range, including subtype search and own_land additional cost.
const searches = expansion.filter(c=>JSON.stringify(c).includes('search_land'));
assert.equal(searches.length,8);
assert.ok(searches.some(c=>JSON.stringify(c).includes('"filter":"any"')));
assert.ok(searches.some(c=>JSON.stringify(c).includes('"filter":"basic"')));
assert.ok(searches.some(c=>JSON.stringify(c).includes('subtype:Bosque')));
assert.ok(searches.some(c=>JSON.stringify(c).includes('"destination":"hand"')));
assert.ok(searches.some(c=>JSON.stringify(c).includes('"destination":"battlefield"')));
assert.ok(searches.some(c=>JSON.stringify(c).includes('"destination":"battlefield_tapped"')));
assert.deepEqual(normalizeLandSearchEffect(byId.get('inst_106').effect), {amount:1,filter:'any',destination:'battlefield',allowFewer:true,reveal:false});

// LAND 4 graveyard: Crucible/Ramunap plus selective and mass rebuild.
assert.equal(byId.get('art_059').staticEffect.type,'play_lands_from_graveyard');
assert.equal(byId.get('crea_256').staticEffect.type,'play_lands_from_graveyard');
assert.equal(byId.get('inst_109').effect.type,'return_lands_from_graveyard');
assert.equal(byId.get('conj_074').effect.type,'return_all_lands_from_graveyard');

// LAND 5 Stax / mana-tap interaction.
assert.equal(byId.get('crea_258').staticEffect.type,'lands_enter_tapped');
assert.equal(byId.get('ench_057').staticEffect.type,'lands_enter_tapped');
assert.equal(byId.get('crea_259').staticEffect.type,'lands_dont_untap');
assert.equal(byId.get('ench_058').staticEffect.type,'lands_dont_untap');
assert.equal(byId.get('art_060').staticEffect.type,'land_untap_limit');
assert.ok(byId.get('crea_260').landManaTrigger);
assert.ok(byId.get('ench_059').landManaTrigger);
assert.ok(byId.get('ench_060').landManaBonus);

// LAND 6 continuous transformations: all primitives have at least one actual card.
assert.equal(byId.get('tier_058').staticEffect.type,'land_type_add');
assert.equal(byId.get('crea_261').staticEffect.type,'land_mana_add');
assert.equal(byId.get('ench_061').staticEffect.type,'land_type_set');
assert.equal(byId.get('ench_062').staticEffect.type,'land_type_add');
assert.deepEqual(byId.get('ench_063').staticEffects.map(e=>e.type), ['land_abilities_remove','land_mana_override']);

// Player-visible ability labels introduced for the new activated LAND cards must use Game Texts.
const ui=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const texts=fs.readFileSync(path.join(root,'js','gameTexts.js'),'utf8');
for (const type of ['destroy_land','destroy_nonbasic_land','animate_land','return_lands_from_graveyard']) {
  assert.ok(ui.includes(`${type}: 'ability.effect.${type}'`));
  assert.ok(texts.includes(`'ability.effect.${type}'`));
}

console.log('LAND_EXPANSION_23_14_8_OK historical-pool=643 added=42 lands=8 artifacts=6 creatures=10 instants=5 sorceries=6 enchantments=7 allLAND0to6=yes images=42unique');
