import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  scopeApplies,
  shouldLandEnterTapped,
  getLandUntapLimit,
  isLandPreventedFromUntapping,
  getLandManaTriggerEntries,
  getLandManaBonuses,
  scoreLandForUntap
} from '../js/landStax.js';

const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const stack = fs.readFileSync(new URL('../js/stackManager.js', import.meta.url), 'utf8');
const turn = fs.readFileSync(new URL('../js/turnManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

assert.ok((version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.4'"))) || (()=>{ try { if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.4'")))) return /ENGINE_VERSION = '(?:23\.14\.(?:[6-9]|[1-9][0-9]+)|23\.(?:1[5-9]|[2-9][0-9])\.\d+(?:\.\d+)?|(?:2[4-9]|[3-9]\d)\.\d+\.\d+)'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/.test(version); } catch { return false; } })());
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.4'")))) assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.68'/);
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.4'")))) assert.match(version, /ENGINE_PROTOCOL_VERSION = 'mp-23\.10\.0'/);

const forest = { card:{ id:'forest', name:'Bosque', type:'Tierra básica — Bosque', produces:'G' }, tapped:false, permanentTypes:['land'] };
const mountain = { card:{ id:'mountain', name:'Montaña', type:'Tierra básica — Montaña', produces:'R' }, tapped:false, permanentTypes:['land'] };
const dual = { card:{ id:'dual', name:'Delta Dual', type:'Tierra — Bosque Isla', producesOptions:['G','U'] }, tapped:false, permanentTypes:['land'] };
const utility = { card:{ id:'utility', name:'Puerto Arcano', type:'Tierra', produces:'C', activatedAbility:{ cost:'{2}', effect:{type:'draw',amount:1} } }, tapped:false, permanentTypes:['land'] };

function emptyState() {
  return {
    localCombat:[], localSupport:[], localLands:[], localPlaneswalkers:[],
    rivalCombat:[], rivalSupport:[], rivalLands:[], rivalPlaneswalkers:[]
  };
}

// Scope semantics.
assert.equal(scopeApplies('all', true, false), true);
assert.equal(scopeApplies('own', true, true), true);
assert.equal(scopeApplies('own', true, false), false);
assert.equal(scopeApplies('opponent', true, false), true);
assert.equal(scopeApplies('opponent', true, true), false);

// Root Maze-style: all lands enter tapped, independently of controller.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Root Maze', type:'Artefacto', staticEffect:{ type:'lands_enter_tapped', scope:'all' } }, tapped:false });
  assert.equal(shouldLandEnterTapped(state, forest, true), true);
  assert.equal(shouldLandEnterTapped(state, forest, false), true);
}

// Thalia-style: only opponents' lands are modified.
{
  const state = emptyState();
  state.localCombat.push({ card:{ name:'Fixture Thalia', type:'Criatura', power:2, toughness:1, staticEffect:{ type:'lands_enter_tapped', scope:'opponent' } }, tapped:false });
  assert.equal(shouldLandEnterTapped(state, forest, true), false);
  assert.equal(shouldLandEnterTapped(state, forest, false), true);
}

// Filtered replacement + printed/forced tapped always wins.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Nonbasic Tax', type:'Encantamiento', staticEffect:{ type:'lands_enter_tapped', scope:'all', landFilter:'nonbasic' } }, tapped:false });
  assert.equal(shouldLandEnterTapped(state, forest, true), false);
  assert.equal(shouldLandEnterTapped(state, dual, true), true);
  assert.equal(shouldLandEnterTapped(state, { card:{...forest.card, entersTapped:true}, permanentTypes:['land'] }, true), true);
  assert.equal(shouldLandEnterTapped(emptyState(), forest, true, true), true);
}

// Winter Orb-style cap is active only while its source is untapped when requested.
{
  const state = emptyState();
  const orb = { card:{ name:'Fixture Orb', type:'Artefacto', staticEffect:{ type:'land_untap_limit', scope:'all', max:1, whileSourceUntapped:true } }, tapped:false };
  state.localSupport.push(orb);
  assert.equal(getLandUntapLimit(state, true), 1);
  assert.equal(getLandUntapLimit(state, false), 1);
  orb.tapped = true;
  assert.equal(getLandUntapLimit(state, true), Infinity);
}

// Filtered "doesn't untap" is per land, not an accidental global freeze.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Frozen Nonbasics', type:'Encantamiento', staticEffect:{ type:'lands_dont_untap', scope:'opponent', landFilter:'nonbasic' } }, tapped:false });
  assert.equal(isLandPreventedFromUntapping(state, dual, false), true);
  assert.equal(isLandPreventedFromUntapping(state, forest, false), false);
  assert.equal(isLandPreventedFromUntapping(state, dual, true), false);
}

// Manabarbs-style trigger: normal trigger targeted at the player who tapped the land.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Manabarbs', type:'Encantamiento', landManaTrigger:{ scope:'all', effect:{ type:'damage', amount:1 } } }, tapped:false });
  const entries = getLandManaTriggerEntries(state, false, mountain);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].triggerType, 'land_tapped_for_mana');
  assert.deepEqual(entries[0].targetObj, { type:'player', isLocal:false });
  assert.deepEqual(entries[0].effect, { type:'damage', amount:1 });
}

// Burning Earth-style filter: only nonbasic land mana activations trigger.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Burning Earth', type:'Encantamiento', staticEffect:{ type:'land_mana_trigger', scope:'all', landFilter:'nonbasic', effect:{ type:'damage', amount:1 } } }, tapped:false });
  assert.equal(getLandManaTriggerEntries(state, true, forest).length, 0);
  assert.equal(getLandManaTriggerEntries(state, true, dual).length, 1);
}

// Mana Flare-style triggered mana ability: immediate bonus of the same produced type.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Mana Flare', type:'Encantamiento', staticEffect:{ type:'land_mana_bonus', scope:'all', mode:'same_type', amount:1 } }, tapped:false });
  assert.deepEqual(getLandManaBonuses(state, true, mountain, 'R').map(x=>({type:x.type,amount:x.amount})), [{type:'R',amount:1}]);
  assert.deepEqual(getLandManaBonuses(state, false, forest, 'G').map(x=>({type:x.type,amount:x.amount})), [{type:'G',amount:1}]);
}

assert.ok(scoreLandForUntap(utility) > scoreLandForUntap(forest), 'El Tano debe preferir utility lands bajo un cap de enderezado.');

// Every battlefield-entry route must funnel through the same replacement hook.
assert.match(main, /export function landEntersTappedForBattlefield/);
assert.match(main, /landEntersTappedForBattlefield\(landCard, ownerIsLocal, spec\.destination === 'battlefield_tapped'\)/);
assert.match(main, /landEntersTappedForBattlefield\(card, isLocal\)/);
assert.match(main, /landEntersTappedForBattlefield\(card, true\)/);
assert.match(stack, /landEntersTappedForBattlefield\(chosenCard, isLocal, spec\.destination === 'battlefield_tapped'\)/);
assert.match(bot, /landEntersTappedForBattlefield\(landCard, false\)/);

// Normal land-mana triggers use Stack and are deferred while 601/602 payment is in progress.
assert.match(main, /land_tapped_for_mana: gameText\('land\.stax\.triggerLabel'\)/);
assert.match(main, /export function captureLandTappedForManaEvent/);
assert.match(main, /export function handleLandTappedForManaEvent/);
assert.match(main, /getLandManaBonuses/);
assert.match(main, /getLandManaTriggerEntries/);
assert.match(main, /eventSnapshot/);
assert.match(main, /restoreManaPaymentSnapshot[\s\S]*deferredLandManaTriggers\.splice\(0\)/);
assert.match(main, /deferredLandManaTriggers\.push/);
assert.match(main, /export function flushDeferredLandManaTriggers/);
assert.match(main, /queueTriggeredAbilities\(pending\)/);
assert.match(bot, /forceDeferNormalTriggers:true/);
assert.match(bot, /addToStack\(castStackItem\);\s*flushDeferredLandManaTriggers\(\);/);

// Untap decision is made before mutation and has real human choice / bot heuristic.
assert.match(turn, /async function executeUntapStep/);
assert.match(turn, /isLandPreventedFromUntapping/);
assert.match(turn, /showUntapLandChoiceModal/);
assert.match(turn, /scoreLandForUntap/);
assert.match(turn, /const chosen = new Set\(chosenIndexes\)/);
assert.match(ui, /export function showUntapLandChoiceModal/);
assert.match(ui, /btn-confirm-land-untap/);

// Player-facing copies remain in ADMIN Game Texts catalog.
for (const key of ['land.stax.untap.title','land.stax.untap.confirm','land.stax.untap.restricted','land.stax.manaBonus','land.stax.triggerLabel']) {
  assert.ok(texts.includes(`'${key}'`), `Falta Game Text ${key}`);
}
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt') && fs.readFileSync(new URL('./ci_regression_manifest_23_17_3_1.txt', import.meta.url),'utf8').includes('test_land_stax_23_14_6.mjs'));

// LAND 5 is engine-only: no pool cards silently introduced yet.
const dataFiles = ['artefactos','conjuros','criaturas','encantamientos','instantaneos','planeswalkers','tierras'];
let total = 0;
let land5Cards = 0;
const land5Tokens = ['lands_enter_tapped','land_enters_tapped','land_untap_limit','lands_dont_untap','land_mana_trigger','land_mana_bonus'];
for (const name of dataFiles) {
  const cards = JSON.parse(fs.readFileSync(new URL(`../assets/data/${name}.json`, import.meta.url), 'utf8'));
  total += cards.length;
  land5Cards += cards.filter(c => {
    const raw = JSON.stringify(c);
    return land5Tokens.some(token => raw.includes(token)) || c.landManaTrigger || c.landManaBonus;
  }).length;
}
assert.ok(total >= 601);
assert.ok(land5Cards >= 8, 'LAND Expansion I debe materializar enter-tapped, untap denial, mana triggers y bonus.');

console.log(`LAND_5_23_14_6_OK entryTapped=global+filtered untap=choice+filtered manaTap=stack+immediate pool=${total} cards=${land5Cards}`);
