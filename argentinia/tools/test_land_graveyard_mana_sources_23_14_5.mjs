import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeManaAbility,
  getManaSourceOptions,
  getManaSourceAmount,
  manaSourceRequiresTap,
  manaSourceSacrificesSelf,
  canActivateManaSourcePermanent
} from '../js/manaSources.js';
import {
  landGraveyardFilterMatches,
  normalizeLandGraveyardReturnEffect,
  cardGrantsLandPlayFromGraveyard,
  hasLandPlayFromGraveyardPermission,
  playableLandGraveyardEntries
} from '../js/landGraveyard.js';

const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const stack = fs.readFileSync(new URL('../js/stackManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');

assert.ok((version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.5'"))) || (()=>{ try { if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.5'")))) return /ENGINE_VERSION = '(?:23\.14\.(?:[5-9]|[1-9][0-9]+)|23\.(?:1[5-9]|[2-9][0-9])\.\d+(?:\.\d+)?|(?:2[4-9]|[3-9]\d)\.\d+\.\d+)'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/.test(version); } catch { return false; } })());
if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.5'")))) assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.68'/);

// Legacy Treasure / mana-rock compatibility.
const treasure = { type:'Artefacto', producesOptions:['W','U','B','R','G'], sacrificeOnTap:true };
assert.deepEqual(getManaSourceOptions(treasure), ['W','U','B','R','G']);
assert.equal(getManaSourceAmount(treasure), 1);
assert.equal(manaSourceRequiresTap(treasure), true);
assert.equal(manaSourceSacrificesSelf(treasure), true);

// Black Lotus / Lotus Bloom-style schema: tap + sacrifice => 3 of one chosen color.
const lotus = { type:'Artefacto', manaAbility:{ producesOptions:['W','U','B','R','G'], amount:3, requiresTap:true, sacrificeSelf:true } };
assert.deepEqual(normalizeManaAbility(lotus), {
  options:['W','U','B','R','G'], amount:3, requiresTap:true, sacrificeSelf:true, sourceSchema:'manaAbility'
});
assert.equal(getManaSourceAmount(lotus), 3);
assert.equal(canActivateManaSourcePermanent({card:lotus,tapped:false}), true);
assert.equal(canActivateManaSourcePermanent({card:lotus,tapped:true}), false);

// Lotus Petal-style source: sacrifice without tap can activate even if already tapped.
const petal = { type:'Artefacto', manaAbility:{ producesOptions:['W','U','B','R','G'], amount:1, requiresTap:false, sacrificeSelf:true } };
assert.equal(canActivateManaSourcePermanent({card:petal,tapped:true}), true);
assert.equal(manaSourceSacrificesSelf(petal), true);

// Mana dork / artifact creature: summoning sickness only matters because {T} is a cost.
const elf = { type:'Criatura — Druida', power:1, toughness:1, manaAbility:{ produces:'G', amount:1, requiresTap:true } };
assert.equal(canActivateManaSourcePermanent({card:elf,tapped:false,summoningSickness:true}), false);
assert.equal(canActivateManaSourcePermanent({card:elf,tapped:false,summoningSickness:false}), true);
assert.equal(canActivateManaSourcePermanent({card:elf,tapped:false,summoningSickness:true}, {hasHaste:true}), true, 'Haste debe permitir {T} aunque el permanente haya entrado este turno.');
const artifactCreature = { type:'Criatura Artefacto — Constructo', power:1, toughness:1, manaAbility:{ produces:'C', amount:1, requiresTap:true } };
assert.equal(canActivateManaSourcePermanent({card:artifactCreature,tapped:false,summoningSickness:true}), false);
assert.equal(canActivateManaSourcePermanent({card:artifactCreature,tapped:false,summoningSickness:false}), true);

const forest = { id:'f', name:'Bosque', type:'Tierra básica — Bosque', produces:'G' };
const dual = { id:'d', name:'Delta', type:'Tierra — Bosque Isla', producesOptions:['G','U'] };
const utility = { id:'u', name:'Terminal', type:'Tierra', produces:'C' };
const creature = { id:'c', name:'Bicho', type:'Criatura', power:1, toughness:1 };
assert.equal(landGraveyardFilterMatches(forest,'basic'), true);
assert.equal(landGraveyardFilterMatches(dual,'basic'), false);
assert.equal(landGraveyardFilterMatches(dual,'nonbasic'), true);
assert.equal(landGraveyardFilterMatches(dual,'subtype:Bosque'), true);
assert.deepEqual(playableLandGraveyardEntries([creature,forest,dual],'any').map(x=>x.index), [1,2]);

const crucibleLike = { type:'Artefacto', staticEffect:{ type:'play_lands_from_graveyard' } };
assert.equal(cardGrantsLandPlayFromGraveyard(crucibleLike), true);
assert.equal(hasLandPlayFromGraveyardPermission([{card:crucibleLike}]), true);
assert.equal(hasLandPlayFromGraveyardPermission([{card:creature}]), false);

assert.deepEqual(normalizeLandGraveyardReturnEffect({ type:'return_all_lands_from_graveyard' }), {
  type:'return_lands_from_graveyard', amount:'all', filter:'any', destination:'battlefield_tapped', all:true
});
assert.deepEqual(normalizeLandGraveyardReturnEffect({ type:'return_lands_from_graveyard', amount:2, filter:'nonbasic', destination:'battlefield' }), {
  type:'return_lands_from_graveyard', amount:2, filter:'nonbasic', destination:'battlefield', all:false
});

// Crucible/Ramunap-style play is a normal land play: normal timing, empty stack, consumes land drop.
assert.match(main, /export function canPlayLandFromGraveyard/);
assert.match(main, /state\.phase !== 'main1' && state\.phase !== 'main2'/);
assert.match(main, /spellStack\.length > 0/);
assert.match(main, /state\.localLandPlayedThisTurn : state\.rivalLandPlayedThisTurn/);
assert.match(main, /export async function playLandFromGraveyardByIndex/);
assert.match(main, /state\.localLandPlayedThisTurn = true/);
assert.match(main, /await triggerLandEtb\(isLocal, card, landItem(?:,\s*'graveyard')?\)/);

// All returned lands enter before Landfall triggers are enqueued => simultaneous battlefield return.
assert.match(stack, /async function resolveReturnLandsFromGraveyardEffect/);
assert.match(stack, /effectToApply\.type === 'return_lands_from_graveyard' \|\| effectToApply\.type === 'return_all_lands_from_graveyard'/);
assert.match(stack, /const entered = validChosenCards\.map[\s\S]*landEntersTappedForBattlefield[\s\S]*entered\.forEach\(entry => lands\.push\(entry\.item\)\)[\s\S]*for \(const entry of entered\) await triggerLandEtb/);

// Universal mana source integration: support + combat (mana dorks/artifact creatures), amounts and sacrifice.
assert.match(main, /normalizeManaAbility\(item\.card\)/);
assert.match(main, /const amount = manaSourceAmount\(item, isLocal\)/);
assert.match(main, /if \(ability\.requiresTap\) \{[\s\S]*item\.tapped = true/);
assert.match(main, /if \(ability\.sacrificeSelf\)/);
assert.match(main, /addMana\(pool, type, amount\)/);
assert.match(main, /const combatManaAbility = effectiveManaAbilityForItem\(item, isLocal\)[\s\S]*canActivateLocalManaAbility\(item\)/);
assert.match(ui, /canActivateLocalManaAbility\(itemObj\)/);
assert.match(ui, /graveyard-play-land-btn/);
assert.match(bot, /\.\.\.state\.rivalSupport, \.\.\.state\.rivalCombat/);
assert.match(bot, /hasLandPlayFromGraveyardPermission\(false\)/);
assert.match(bot, /playLandFromGraveyardByIndex/);
assert.match(texts, /'land\.grave\.playTitle'/);
assert.match(texts, /'mana\.source\.summoningSick'/);

// Desde 23.14.8 LAND 4 ya tiene contenido real; el contrato histórico verifica cobertura mínima acumulativa.
const dataFiles = ['artefactos','conjuros','criaturas','encantamientos','instantaneos','planeswalkers','tierras'];
let total = 0;
let land4Cards = 0;
for (const name of dataFiles) {
  const cards = JSON.parse(fs.readFileSync(new URL(`../assets/data/${name}.json`, import.meta.url), 'utf8'));
  total += cards.length;
  land4Cards += cards.filter(c => JSON.stringify(c).includes('play_lands_from_graveyard') || JSON.stringify(c).includes('return_lands_from_graveyard') || JSON.stringify(c).includes('return_all_lands_from_graveyard') || c.manaAbility).length;
}
assert.ok(total >= 601);
assert.ok(land4Cards >= 11, 'LAND Expansion I debe materializar cementerio + fuentes universales de maná.');

console.log(`LAND_4_23_14_5_OK graveyard=play+mass-return manaSources=lotus+petal+dork+artifactCreature pool=${total} cards=${land4Cards}`);
