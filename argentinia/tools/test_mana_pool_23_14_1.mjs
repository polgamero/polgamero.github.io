import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseManaCost, sumManaCosts } from '../js/utils.js';
import {
  emptyManaPool, addMana, manaPoolTotal, spendOneMana, clearManaPool,
  spendAvailableTowardCost, canPoolPayCost
} from '../js/manaPool.js';

// {C} es un requisito específico, distinto de genérico.
assert.deepEqual(parseManaCost('{2}{C}{G}'), { W:0,U:0,B:0,R:0,G:1,C:1,generic:2 });
assert.deepEqual(sumManaCosts(parseManaCost('{C}'), parseManaCost('{1}{G}')), { W:0,U:0,B:0,R:0,G:1,C:1,generic:1 });

// Producción multi-maná: paga sólo lo necesario y el sobrante permanece flotando.
const pool = emptyManaPool();
addMana(pool, 'G', 2);
let cost = parseManaCost('{1}{G}');
assert.equal(spendOneMana(pool, cost, 'G')?.paid, 'G');
assert.equal(spendOneMana(pool, cost, 'G')?.paid, 'generic');
assert.equal(manaPoolTotal(pool), 0);
addMana(pool, 'G', 3);
cost = parseManaCost('{G}');
assert.equal(spendOneMana(pool, cost, 'G')?.paid, 'G');
assert.equal(pool.G, 2, 'el excedente debe quedar en el pool');

// {C} no puede pagarse con maná de color.
const colored = { W:1,U:1,B:0,R:0,G:0,C:0 };
assert.equal(canPoolPayCost(colored, parseManaCost('{C}')), false);
addMana(colored, 'C', 1);
assert.equal(canPoolPayCost(colored, parseManaCost('{C}')), true);

// Automatismos pueden gastar primero el pool ya existente y dejar un coste parcial.
const autoPool = { W:0,U:1,B:0,R:0,G:0,C:1 };
const autoCost = parseManaCost('{C}{2}');
spendAvailableTowardCost(autoPool, autoCost);
assert.equal(autoCost.C, 0);
assert.equal(autoCost.generic, 1);
assert.equal(manaPoolTotal(autoPool), 0);

clearManaPool(pool);
assert.equal(manaPoolTotal(pool), 0);

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../js/matchSync.js', import.meta.url), 'utf8');
const turns = fs.readFileSync(new URL('../js/turnManager.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../build-manifest.json', import.meta.url), 'utf8'));

assert.ok(main.includes('localManaPool: emptyManaPool()'));
assert.ok(main.includes('rivalManaPool: emptyManaPool()'));
assert.ok(main.includes('export function canActivateLocalManaAbility'));
assert.ok(main.includes('showManaColorChoiceModal'));
assert.ok(main.includes('spendLocalManaFromPool'));
assert.ok(main.includes("recordTelemetryEvent('mana_added_to_pool'"));
assert.ok(main.includes('let autoSpent = 0;'), 'durante un pago la fuente debe aplicar sólo su producción nueva');
assert.ok(main.includes('for (let i = 0; i < amount; i += 1)'), 'una fuente multi-maná debe poder pagar más de un símbolo');
assert.ok(main.includes('const spent = spendOneMana(pool, state.pendingCost, type);'), 'la producción nueva debe pasar por el mismo resolvedor de pool');
assert.ok(main.includes('restoreManaPaymentSnapshot()'), 'cancelar un casteo debe restaurar el pool previo');
assert.ok(main.includes('autoPayGenericManaCost'), 'Ward/impuestos deben compartir el mana pool real');
assert.ok(main.includes('if (state.pendingWardChoice || state.pendingCounterUnlessPay) return true;'), 'CR605.3a: los pagos pedidos por efectos deben permitir activar mana abilities sin prioridad');
assert.ok(!main.includes('este motor no mantiene una mana pool flotante'), 'no debe sobrevivir el contrato legacy sin pool');

assert.ok(html.includes('id="local-mana-pool"'));
assert.ok(html.includes('id="rival-mana-pool"'));
assert.ok(ui.includes('mana-icon-pool'));
assert.ok(ui.includes('spendLocalManaFromPool(type)'));
assert.ok(ui.includes("'payment.color.colorless'"));
assert.ok(texts.includes("'mana.pool.emptied'"));
assert.ok(texts.includes("'mana.chooseColor.title'"));

assert.match(sync, /'HP', 'Poison', 'ManaPool', 'Lands'/, 'el pool debe ser estado público por jugador');
assert.ok(turns.includes('clearManaPool(state.localManaPool)'));
assert.ok(turns.includes('clearManaPool(state.rivalManaPool)'));
assert.ok(turns.includes("recordTelemetryEvent('mana_pools_emptied'"));
assert.ok(bot.includes('manaPoolTotal(state.rivalManaPool)'));
assert.ok(bot.includes('spendAvailableTowardCost(state.rivalManaPool'));

const versionMatch = version.match(/ENGINE_VERSION = '(\d+)\.(\d+)(?:\.(\d+))?(?:\.\d+)?'/);
assert.ok(versionMatch, 'ENGINE_VERSION debe existir');
const [,maj,min,patch] = versionMatch.map(v => Number(v || 0));
assert.ok(maj > 23 || (maj === 23 && (min > 14 || (min === 14 && patch >= 1))), 'LAND 0 debe sobrevivir en 23.14.1+');
assert.ok(version.includes("FIRESTORE_RULES_VERSION = '23.13.80'"));
assert.match(manifest.engineVersion, /^23\.(?:14\.(?:[1-9]|\d{2,})|1[5-7]\.\d+(?:\.\d+)?|18(?:\.\d+)?|19(?:\.\d+){1,2}|[2-9]\d\.\d+(?:\.\d+)?)$/);
assert.equal(manifest.firestoreRulesVersion, '23.13.80');

console.log('MANA_POOL_23_14_1_OK pool=WUBRGC excess=floats clear=end-step-phase sync=public bot=shared-model');
