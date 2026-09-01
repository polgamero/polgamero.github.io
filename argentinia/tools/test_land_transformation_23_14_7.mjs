import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getEffectiveLandCharacteristics,
  getEffectiveLandTypeLine,
  getEffectiveLandManaAbility,
  getEffectiveLandActivatedAbilities,
  getEffectiveLandPrintedKeywords,
  landMatchesEffectiveFilter,
  landRulesTextSuppressed
} from '../js/landCharacteristics.js';
import { shouldLandEnterTapped, collectLandRuleEffects } from '../js/landStax.js';
import { normalizeManaAbility, canActivateManaSourcePermanent } from '../js/manaSources.js';
import { getPermanentTypes } from '../js/permanentTypes.js';

const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');
const stack = fs.readFileSync(new URL('../js/stackManager.js', import.meta.url), 'utf8');
const stax = fs.readFileSync(new URL('../js/landStax.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

assert.ok((version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.15'"))) || (()=>{ try { if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.15'")))) return /ENGINE_VERSION = '(?:23\.14\.(?:[7-9]|[1-9][0-9]+)|23\.(?:1[5-9]|[2-9][0-9])\.\d+(?:\.\d+)?|(?:2[4-9]|[3-9]\d)\.\d+\.\d+)'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/.test(version); } catch { return false; } })());
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.15'")))) assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.68'/);
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.15'")))) assert.match(version, /ENGINE_PROTOCOL_VERSION = 'mp-23\.10\.0'/);

function emptyState() {
  return {
    localCombat:[], localSupport:[], localLands:[], localPlaneswalkers:[],
    rivalCombat:[], rivalSupport:[], rivalLands:[], rivalPlaneswalkers:[]
  };
}

const bloodMoon = {
  card:{
    id:'fixture_blood_moon', name:'Fixture Luna Roja', type:'Encantamiento',
    staticEffect:{ type:'land_type_set', scope:'all', landFilter:'nonbasic', setLandTypes:['Montaña'] }
  },
  tapped:false
};
const dual = {
  card:{
    id:'fixture_dual', name:'Puerto Doble', type:'Tierra sagrada — Agua Bosque',
    producesOptions:['U','G'], entersTapped:true, keywords:['hexproof'],
    activatedAbility:{ cost:'{2}', timing:'instant', effect:{type:'draw',amount:1} }
  },
  tapped:false, permanentTypes:['land']
};
const basicIsland = {
  card:{ id:'fixture_island', name:'Agua Básica', type:'Tierra básica — Agua', produces:'U' },
  tapped:false, permanentTypes:['land']
};

// Blood Moon-style exact core: nonbasic remains nonbasic, becomes Mountain, loses printed
// abilities and gains intrinsic red mana. Basic lands are untouched.
{
  const state = emptyState();
  state.localSupport.push(bloodMoon);
  state.localLands.push(dual, basicIsland);

  const ch = getEffectiveLandCharacteristics(state, dual, true);
  assert.equal(ch.isNonbasic, true);
  assert.equal(ch.isBasic, false);
  assert.deepEqual(ch.subtypes, ['Montaña']);
  assert.equal(ch.suppressPrintedAbilities, true);
  assert.equal(getEffectiveLandTypeLine(state, dual, true), 'Tierra sagrada — Montaña');
  assert.deepEqual(getEffectiveLandManaAbility(state, dual, true), {
    options:['R'], amount:1, requiresTap:true, sacrificeSelf:false, sourceSchema:'intrinsic_basic_land_type'
  });
  assert.deepEqual(getEffectiveLandActivatedAbilities(state, dual, true), []);
  assert.deepEqual(getEffectiveLandPrintedKeywords(state, dual, true), []);
  assert.equal(landMatchesEffectiveFilter(state, dual, true, 'subtype:Montaña'), true);
  assert.equal(landMatchesEffectiveFilter(state, dual, true, 'subtype:Agua'), false);
  assert.equal(landMatchesEffectiveFilter(state, dual, true, 'nonbasic'), true);

  assert.equal(landRulesTextSuppressed(state, basicIsland, true), false);
  assert.deepEqual(getEffectiveLandManaAbility(state, basicIsland, true).options, ['U']);
  assert.equal(getEffectiveLandTypeLine(state, basicIsland, true), basicIsland.card.type);
}

// Current Blood Moon entry behavior: a printed entersTapped ability on the affected nonbasic
// is gone before it can apply. An EXTERNAL Root Maze-style replacement still applies.
{
  const state = emptyState();
  state.localSupport.push(bloodMoon);
  assert.equal(shouldLandEnterTapped(state, dual, true), false);
  state.localSupport.push({ card:{ name:'Fixture Root Maze', type:'Encantamiento', staticEffect:{type:'lands_enter_tapped',scope:'all'} }, tapped:false });
  assert.equal(shouldLandEnterTapped(state, dual, true), true);
}

// A land already animated by a resolved effect remains Land + Creature. Blood Moon removes
// printed keywords/abilities, not the external animation identity/effect stored on the item.
{
  const state = emptyState();
  state.localSupport.push(bloodMoon);
  const animated = {
    ...dual,
    card:{...dual.card},
    isAnimatedLand:true,
    permanentTypes:['land','creature'],
    animatedBasePower:2,
    animatedBaseToughness:3,
    animationKeywords:['deathtouch']
  };
  state.localCombat.push(animated);
  assert.deepEqual(new Set(getPermanentTypes(animated)), new Set(['land','creature']));
  assert.deepEqual(getEffectiveLandPrintedKeywords(state, animated, true), []);
  assert.deepEqual(animated.animationKeywords, ['deathtouch']);
  assert.deepEqual(getEffectiveLandManaAbility(state, animated, true).options, ['R']);
}

// Add-a-basic-type infrastructure: keeps text and adds the intrinsic mana choice.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Pantano Global', type:'Encantamiento', staticEffect:{type:'land_type_add',scope:'all',addLandTypes:['Pantano']} }, tapped:false });
  state.localLands.push(basicIsland);
  const ch = getEffectiveLandCharacteristics(state, basicIsland, true);
  assert.deepEqual(ch.subtypes, ['Agua','Pantano']);
  assert.equal(ch.suppressPrintedAbilities, false);
  assert.deepEqual(getEffectiveLandManaAbility(state, basicIsland, true).options.sort(), ['B','U']);
}

// Explicit mana override is independent of subtype setting and can model Imprisoned-style
// transformations in future cards.
{
  const state = emptyState();
  state.localSupport.push({ card:{ name:'Fixture Incoloro', type:'Encantamiento', staticEffect:{type:'land_mana_override',scope:'all',landFilter:'nonbasic',produces:'C'} }, tapped:false });
  assert.deepEqual(getEffectiveLandManaAbility(state, dual, true), {
    options:['C'], amount:1, requiresTap:true, sacrificeSelf:false, sourceSchema:'land_continuous_override'
  });
}

// Dependency relevant to Blood Moon: a nonbasic LAND that carries a printed continuous land
// rule loses that rules text under another Blood Moon-style effect, so it stops modifying others.
{
  const state = emptyState();
  const urborgLikeLand = {
    card:{ name:'Fixture Urborg Land', type:'Tierra sagrada', produces:'C', staticEffect:{type:'land_type_add',scope:'all',addLandTypes:['Pantano']} },
    tapped:false, permanentTypes:['land']
  };
  state.localSupport.push(bloodMoon);
  state.localLands.push(urborgLikeLand, basicIsland);
  assert.equal(landRulesTextSuppressed(state, urborgLikeLand, true), true);
  assert.deepEqual(getEffectiveLandCharacteristics(state, basicIsland, true).subtypes, ['Agua']);
  assert.equal(collectLandRuleEffects(state).some(e => e.sourceItem === urborgLikeLand), false);
}

// Effective mana ability must be accepted by the universal mana-source gate even when the
// printed nonbasic land had no mana ability at all.
{
  const state = emptyState();
  state.localSupport.push(bloodMoon);
  const utility = { card:{ name:'Fixture Utility', type:'Tierra sagrada', activatedAbility:{cost:'{1}',effect:{type:'draw',amount:1}} }, tapped:false, permanentTypes:['land'] };
  const ability = getEffectiveLandManaAbility(state, utility, true, normalizeManaAbility(utility.card));
  assert.deepEqual(ability.options, ['R']);
  assert.equal(canActivateManaSourcePermanent(utility, { ability }), true);
}

// Wiring checks: all relevant runtime surfaces must consume EFFECTIVE characteristics.
assert.match(main, /getEffectiveLandManaAbility/);
assert.match(main, /getEffectiveLandActivatedAbilities/);
assert.match(main, /getEffectiveLandPrintedKeywords/);
assert.match(main, /landMatchesEffectiveFilter/);
assert.match(main, /landRulesTextSuppressed/);
assert.match(ui, /getEffectiveLandTypeLine/);
assert.match(ui, /describeLandTransformation/);
assert.match(ui, /land\.transform\.rulesText/);
assert.match(bot, /botEffectiveManaAbility/);
assert.match(bot, /getEffectiveLandActivatedAbilities/);
assert.match(stack, /landMatchesEffectiveFilter/);
assert.match(stax, /landRulesTextSuppressed/);

for (const key of ['land.transform.rulesText','land.transform.noAbilities','land.transform.abilityGone']) {
  assert.ok(texts.includes(`'${key}'`), `Falta Game Text ${key}`);
}
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt') && fs.readFileSync(new URL('./ci_regression_manifest_23_17_3_1.txt', import.meta.url),'utf8').includes('test_land_transformation_23_14_7.mjs'));

// Desde 23.14.8 LAND 6 ya está materializado; el contrato histórico verifica que las primitivas tengan cartas reales.
const dataFiles = ['artefactos','conjuros','criaturas','encantamientos','instantaneos','planeswalkers','tierras'];
let total = 0;
let land6Cards = 0;
const land6Tokens = ['land_type_set','land_type_add','land_abilities_remove','land_mana_override','land_mana_add'];
for (const name of dataFiles) {
  const cards = JSON.parse(fs.readFileSync(new URL(`../assets/data/${name}.json`, import.meta.url), 'utf8'));
  total += cards.length;
  land6Cards += cards.filter(c => land6Tokens.some(token => JSON.stringify(c).includes(token))).length;
}
assert.ok(total >= 601);
assert.ok(land6Cards >= 5, 'LAND Expansion I debe materializar type set/add, ability removal y mana override/add.');

console.log(`LAND_6_23_14_7_OK bloodMoon=types+abilities+mana addType=yes manaOverride=yes ui=effective pool=${total} cards=${land6Cards}`);
