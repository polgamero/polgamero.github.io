import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ECONOMY_PROTOCOL_VERSION, ECONOMY_SCHEMA_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { TRUSTED_CARD_POOL } from '../../functions/src/trusted/cardCatalog.js';
import { TRUSTED_PREBUILT_PRODUCTS } from '../../functions/src/trusted/prebuiltCatalog.js';
import {
  ENHANCEMENT_KEYWORDS,
  buildCommerceCampaignEffects,
  effectivePackPurchaseCost,
  argentinaWeekKey,
  nextArgentinaWeekRotationIso,
  nextClassifiedCounts,
  normalizeStoreSettings
} from '../../functions/src/economy/commerceCore.js';
import {
  beginEconomyAction, getPendingEconomyAction, clearPendingEconomyAction, economyActionRequestKey
} from '../js/economyActionRecovery.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here,'..');
const repo = path.resolve(root,'..');
const read = p => fs.readFileSync(path.join(repo,p),'utf8');

assert.equal(ENGINE_VERSION,'23.19.5.4');
assert.equal(ECONOMY_PROTOCOL_VERSION,'econ-23.19.5.4');
assert.equal(ECONOMY_SCHEMA_VERSION,5);
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(TRUSTED_CARD_POOL.length,880);
assert.equal(TRUSTED_PREBUILT_PRODUCTS.length,10);
assert.ok(TRUSTED_PREBUILT_PRODUCTS.every(p=>p.cardIds.length===60));
assert.equal(ENHANCEMENT_KEYWORDS.length,10);

const settings=normalizeStoreSettings({packCost:200,fichasPerEnhancement:4,prebuiltDeckPoints:1700,prebuiltDeckFichas:5,maxSavedDecks:13});
assert.deepEqual(settings,{packCost:200,craftCost:4,prebuiltPoints:1700,prebuiltFichas:5,maxSavedDecks:13});
const effects=buildCommerceCampaignEffects([
  {id:'discount',type:'pack_discount',value:50,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'ignored-fichas',type:'all_fichas_multiplier',value:9,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'ignored-bonus',type:'pack_open_ficha_bonus',value:3,startAt:new Date(1),endAt:new Date(Date.now()+60000)}
]);
assert.equal(effects.packDiscountPercent,50);
assert.deepEqual(effects.activeEventIds,['discount'],'commerce audit IDs must include only events that affect Store Pack price');
assert.equal(effectivePackPurchaseCost(200,effects),100);
assert.equal(argentinaWeekKey(Date.parse('2026-09-02T15:00:00Z')),'2026-08-31');
assert.equal(new Date(nextArgentinaWeekRotationIso(Date.parse('2026-09-02T15:00:00Z'))).toISOString(),'2026-09-07T03:00:00.000Z');
assert.deepEqual(nextClassifiedCounts(null,'Common',true),{Common:1,Uncommon:0,Rare:0,Mythic:0});

const memory=new Map();
globalThis.localStorage={
  getItem:k=>memory.has(k)?memory.get(k):null,
  setItem:(k,v)=>memory.set(k,String(v)),
  removeItem:k=>memory.delete(k)
};
const reqA={cardId:'crea_001',keyword:'flying'};
const reqB={keyword:'flying',cardId:'crea_001'};
assert.equal(economyActionRequestKey(reqA),economyActionRequestKey(reqB));
const pending=beginEconomyAction('qa-user','enhancementCraft','craft:12345678',reqA);
assert.equal(pending.operationId,'craft:12345678');
assert.equal(getPendingEconomyAction('qa-user','enhancementCraft',reqB)?.operationId,'craft:12345678');
assert.equal(clearPendingEconomyAction('qa-user','enhancementCraft',reqA,'craft:12345678'),true);
assert.equal(getPendingEconomyAction('qa-user','enhancementCraft',reqA),null);

const fnIndex=read('functions/src/index.js');
const commerce=read('functions/src/economy/commerce.js');
const client=read('argentinia/js/economyClient.js');
const impl=read('argentinia/js/firebaseClientImpl.js');
const facade=read('argentinia/js/firebaseClient.js');
const recovery=read('argentinia/js/economyActionRecovery.js');

for (const fn of [
  'economyGetStorefront','economyPurchasePack','economyCraftEnhancement','economyPurchasePrebuiltDeck',
  'economyGetClassifieds','economyPurchaseClassifiedCard','economyRenameUsername'
]) assert.match(fnIndex,new RegExp(`export const ${fn}\\s*=`),`${fn} callable missing`);
for (const capability of ['storePurchaseAuthority','craftAuthority','prebuiltAuthority','classifiedsAuthority','usernameRenameAuthority']) {
  assert.match(fnIndex,new RegExp(`${capability}: 'server'`));
}
assert.match(fnIndex,/type:\s*'store\.purchase_pack'/);
assert.match(fnIndex,/type:\s*'store\.craft_enhancement'/);
assert.match(fnIndex,/type:\s*'store\.purchase_prebuilt'/);
assert.match(fnIndex,/type:\s*'store\.purchase_classified'/);
assert.match(fnIndex,/type:\s*'account\.rename_username'/);
assert.match(fnIndex,/rejectForbidden\(data, \['uid','points','fichas','baseCost'/,'pack cost authority must stay server-side');
assert.match(fnIndex,/rejectForbidden\(data, \['uid','fichas','fichaCost'/,'craft cost authority must stay server-side');
assert.match(fnIndex,/rejectForbidden\(data, \['uid','usernameKey','fichas','fichaCost','cost'\]/,'rename key/cost must be server-derived');

assert.match(commerce,/effectivePackPurchaseCost\(settings\.packCost, campaignEffects\)/);
assert.match(commerce,/ENHANCEMENT_KEYWORDS\.includes\(cleanKeyword\)/);
assert.match(commerce,/TRUSTED_PREBUILT_BY_ID\.get/);
assert.match(commerce,/validatedClassifiedWeek/);
assert.match(commerce,/argentinaWeekKey\(nowMs\)/);
assert.match(commerce,/validateUsername\(usernameRaw\)/);
assert.match(commerce,/FieldValue\.serverTimestamp\(\)/);

for (const fn of [
  'economyPurchasePack','economyCraftEnhancement','economyPurchasePrebuiltDeck','economyGetClassifieds','economyPurchaseClassifiedCard','economyRenameUsername'
]) assert.match(client,new RegExp(`'${fn}'`));
assert.match(impl,/runEconomyActionAuthority/);
assert.match(impl,/recoverEconomyOperation\(operationId\)/);
assert.match(impl,/purchasePackServer\(operationId\)/);
assert.match(impl,/craftEnhancementServer\(request\.cardId, request\.keyword, operationId\)/);
assert.match(impl,/purchasePrebuiltDeckServer\(request\.productId, request\.deckName, operationId\)/);
assert.match(impl,/getClassifiedsServer\(\)/);
assert.match(impl,/purchaseClassifiedCardServer\(request\.cardId, operationId\)/);
assert.match(impl,/renameUsernameServer\(request\.username, operationId\)/);
assert.match(recovery,/Nunca guarda saldo, cartas ni autoridad/);

// Systemic lazy-facade parity survives the 23.19.5.4 production bug.
const lazyTargets=[...facade.matchAll(/asyncProxy\('([^']+)'\)/g)].map(m=>m[1]);
const implExports=new Set([
  ...[...impl.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1]),
  ...[...impl.matchAll(/export\s+(?:const|let|class)\s+(\w+)/g)].map(m=>m[1])
]);
assert.deepEqual(lazyTargets.filter(name=>!implExports.has(name)),[],'firebase lazy facade drift');

const manifest=JSON.parse(read('argentinia/build-manifest.json'));
assert.equal(manifest.engineVersion,'23.19.5.4');
assert.equal(manifest.economyProtocolVersion,'econ-23.19.5.4');
assert.equal(manifest.economySchemaVersion,5);

console.log('STORE_CRAFT_PREBUILT_CLASSIFIEDS_USERNAME_AUTHORITY_23_19_5_2_OK pack=SERVER craft=SERVER prebuilt=TRUSTED classifieds=SERVER_WEEK username=SERVER_IDEMPOTENT recovery=OPERATION_ID lazy=PARITY');
