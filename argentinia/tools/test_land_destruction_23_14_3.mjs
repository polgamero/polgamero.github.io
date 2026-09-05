import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isLandPermanent, isCreaturePermanent, landMatchesFilter } from '../js/permanentTypes.js';

const basic = { card:{ type:'Tierra básica — Montaña', name:'Montaña' } };
const utility = { card:{ type:'Tierra', name:'Utility', activatedAbility:{ effect:{ type:'animate_land' } } } };
const animated = { card:{ type:'Tierra', name:'Manland' }, isAnimatedLand:true, permanentTypes:['land','creature'] };
assert.equal(isLandPermanent(basic), true);
assert.equal(landMatchesFilter(basic,'basic'), true);
assert.equal(landMatchesFilter(utility,'nonbasic'), true);
assert.equal(isLandPermanent(animated), true);
assert.equal(isCreaturePermanent(animated), true);

const ui=fs.readFileSync(new URL('../js/ui.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const bot=fs.readFileSync(new URL('../js/bot.js',import.meta.url),'utf8');
const texts=fs.readFileSync(new URL('../js/gameTexts.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../js/version.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../build-manifest.json',import.meta.url),'utf8'));

assert.ok(ui.includes("effectType === 'destroy_land'"));
assert.ok(ui.includes("effectType === 'destroy_nonbasic_land'"));
assert.ok(ui.includes("landFilter = effectType === 'destroy_nonbasic_land' ? 'nonbasic'"));
assert.ok(main.includes("targetObj.type === 'land'"));
assert.ok(main.includes("Impuesto es una habilidad de PERMANENTE"));
assert.ok(main.includes("effect.type === 'destroy_land' || effect.type === 'destroy_nonbasic_land'"));
assert.ok(main.includes("card.effect.type === 'destroy_land' || card.effect.type === 'destroy_nonbasic_land'"), 'casteo debe inferir target Tierra aunque requiresTarget se omita');
assert.ok(stack.includes("effectToApply.type === 'destroy_nonbasic_land'"));
assert.ok(stack.includes("effectToApply.type === 'destroy_all_lands'"));
assert.ok(stack.includes("triggerCreatureDies(targetItem, isTargetLocal)"), 'una man-land destruida debe morir como criatura');
assert.ok(stack.includes("queueCreatureDeathBatch(deadCreatures, watchersSnapshot)"), 'wipe de tierras debe preservar muertes simultáneas de man-lands');
assert.ok(stack.includes("hasKeyword(targetItem, 'indestructible')"));
assert.ok(stack.includes("'destroy_artifact', 'destroy_enchantment', 'destroy_land', 'destroy_nonbasic_land'"));
assert.ok(stack.includes("'destroy_all_creatures', 'destroy_all_lands'"));
assert.ok(bot.includes('getBotLandDestructionTargets'));
assert.ok(bot.includes('countBotMassLandVictims'));
assert.ok(bot.includes("c.effect.type === 'destroy_all_lands'"));
assert.ok(bot.includes("cardToPlay.effect.type === 'destroy_land'"));
assert.ok(texts.includes("'land.destroy.done'"));
assert.ok(texts.includes("'land.destroy.invalid'"));
assert.ok(texts.includes("'land.destroy.mass'"));
const currentVersion = version.match(/ENGINE_VERSION = '([^']+)'/)?.[1] || '';
const [maj,min,patch] = currentVersion.split('.').map(Number);
assert.ok(maj > 23 || (maj === 23 && (min > 14 || (min === 14 && patch >= 3))), 'LAND 2 debe sobrevivir en 23.14.3 o posterior');
assert.equal(manifest.engineVersion,currentVersion);
assert.equal(manifest.firestoreRulesVersion,'23.13.80');

// Desde 23.14.8 LAND 2 ya está materializado en cartas reales; este test histórico valida que el motor sobreviva acumulativamente.
const files=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers'];
let total=0, landDestructionCards=0;
for (const file of files) {
  const cards=JSON.parse(fs.readFileSync(new URL(`../assets/data/${file}.json`,import.meta.url),'utf8'));
  total += cards.length;
  for (const c of cards) {
    const serialized=JSON.stringify(c);
    if (/destroy_(?:nonbasic_)?land|destroy_all_lands/.test(serialized)) landDestructionCards += 1;
  }
}
assert.ok(total >= 601);
assert.ok(landDestructionCards >= 6, 'LAND Expansion I debe materializar destrucción puntual/no básica/masiva.');
console.log(`LAND_DESTRUCTION_23_14_3_OK targeted=any/nonbasic mass=filter+scope manland=dies indestructible=yes bot=yes pool=${total} cards=${landDestructionCards}`);
