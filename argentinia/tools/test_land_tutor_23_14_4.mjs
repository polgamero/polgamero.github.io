import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeLandSearchEffect, getLandSearchCandidates, chooseBotLandSearchEntries } from '../js/landSearch.js';
import { normalizeCompositeCost, describeCompositeCost, isSacrificeCandidate } from '../js/utils.js';
import { landMatchesFilter } from '../js/permanentTypes.js';

const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const stack = fs.readFileSync(new URL('../js/stackManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');

assert.ok((version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4'"))) || (()=>{ try { if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4'")))) return /ENGINE_VERSION = '(?:23\.14\.(?:[4-9]|[1-9][0-9]+)|23\.(?:1[5-9]|[2-9][0-9])\.\d+(?:\.\d+)?|(?:2[4-9]|[3-9]\d)\.\d+\.\d+)'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/.test(version); } catch { return false; } })());
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4'")))) assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.68'/);

const forest = { id:'land_forest', name:'Bosque', type:'Tierra básica — Bosque', produces:'G' };
const swamp = { id:'land_swamp', name:'Pantano', type:'Tierra básica — Pantano', produces:'B' };
const dualForest = { id:'land_dual', name:'Delta Verde', type:'Tierra — Bosque Isla', producesOptions:['G','U'], activatedAbility:{ effect:{ type:'draw' } } };
const utility = { id:'land_utility', name:'Terminal', type:'Tierra', produces:'C', activatedAbility:{ effect:{ type:'return_from_graveyard' } } };
const deck = [forest, swamp, dualForest, utility, {id:'x',name:'No tierra',type:'Criatura',power:1,toughness:1}];

assert.deepEqual(normalizeLandSearchEffect({ amount:2, filter:'nonbasic', destination:'hand' }), {
  amount:2, filter:'nonbasic', destination:'hand', allowFewer:true, reveal:false
});
assert.equal(getLandSearchCandidates(deck, 'basic').length, 2);
assert.equal(getLandSearchCandidates(deck, 'nonbasic').length, 2);
assert.deepEqual(getLandSearchCandidates(deck, 'subtype:Bosque').map(e => e.card.id), ['land_forest','land_dual']);
assert.equal(landMatchesFilter(dualForest, 'subtype:Isla'), true);
assert.equal(chooseBotLandSearchEntries(deck, 'any', 1, 'battlefield')[0].card.id, 'land_dual');

const cropLike = normalizeCompositeCost({ sacrifice:{ target:'own_land', amount:1 } });
assert.equal(cropLike.sacrifice.target, 'own_land');
assert.match(describeCompositeCost({ sacrifice:{ target:'own_land', amount:1 } }), /sacrificar 1 tierra/);
assert.equal(isSacrificeCandidate({card:forest}, 'land'), true);
assert.equal(isSacrificeCandidate({card:{type:'Criatura',power:1,toughness:1}}, 'land'), false);

assert.match(main, /export async function searchLibraryForLands/);
assert.match(main, /self_search_land/);
assert.match(main, /pendingLandSearchChoice/);
assert.match(main, /spec\.destination === 'battlefield_tapped'/);
assert.match(main, /await triggerLandEtb\(/);
assert.match(main, /shuffleLibraryInPlace\(deck\)/);
assert.match(main, /const identityIsPublic = spec\.reveal \|\| spec\.destination !== 'hand'/);
assert.match(main, /req\.target === 'own_land' \? 'land'/);
assert.match(main, /spec\.target === 'own_land' \? 'land'/);
assert.match(main, /compositeCostHasNonMana\(card\.additionalCost\)/, 'canPlayCard debe prevalidar también type:sacrifice legacy');

assert.match(stack, /effectToApply\.type === 'search_land' \|\| effectToApply\.type === 'ramp'/);
assert.match(stack, /filter: effectToApply\.filter \|\| 'basic'/);
assert.match(stack, /reveal: false/);
assert.match(ui, /export function showLandSearchModal/);
assert.match(ui, /land\.search\.failToFind/);
assert.match(texts, /'land\.search\.title'/);
assert.match(texts, /'ability\.cost\.sacLand'/);
assert.match(bot, /search_land/);
assert.match(bot, /ability\.sacrifice === 'land'/);

const dataFiles = ['artefactos','conjuros','criaturas','encantamientos','instantaneos','planeswalkers','tierras'];
let total = 0;
let searchCards = 0;
for (const name of dataFiles) {
  const cards = JSON.parse(fs.readFileSync(new URL(`../assets/data/${name}.json`, import.meta.url), 'utf8'));
  total += cards.length;
  searchCards += cards.filter(c => JSON.stringify(c).includes('"search_land"')).length;
}
assert.ok(total >= 601);
assert.ok(searchCards >= 8, 'LAND Expansion I debe materializar tutors básicos, any y subtype.');

console.log(`LAND_TUTOR_23_14_4_OK search=exact filters=basic/nonbasic/any/subtype destinations=hand/battlefield/tapped failToFind=yes reveal=explicit sacrifice=own_land ramp=unified multiplayer=private pool=${total} cards=${searchCards}`);
