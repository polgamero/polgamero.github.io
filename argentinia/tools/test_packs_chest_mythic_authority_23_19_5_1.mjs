import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ECONOMY_PROTOCOL_VERSION, ECONOMY_SCHEMA_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { beginEconomyReveal, getPendingEconomyReveal, clearPendingEconomyReveal } from '../js/economyRevealRecovery.js';
import {
  generateTrustedPack,
  generateTrustedGuaranteedMythic,
  buildPackCampaignEffects,
  effectivePackOpenFichas,
  PACK_SIZE
} from '../../functions/src/economy/packCore.js';
import { TRUSTED_CARD_POOL } from '../../functions/src/trusted/cardCatalog.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=(p)=>fs.readFileSync(path.join(repo,p),'utf8');

assert.equal(ENGINE_VERSION,'23.19.5.4');
assert.equal(ECONOMY_PROTOCOL_VERSION,'econ-23.19.5.4');
assert.equal(ECONOMY_SCHEMA_VERSION,5);
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(TRUSTED_CARD_POOL.length,880);

const byId=new Map(TRUSTED_CARD_POOL.map(c=>[c.id,c]));
const rarePack=generateTrustedPack({seed:'qa-pack-rare',mythicChance:0});
assert.equal(rarePack.cardIds.length,PACK_SIZE);
assert.ok(rarePack.cardIds.slice(0,9).every(id=>byId.get(id)?.rarity==='Common'));
assert.ok(rarePack.cardIds.slice(9,13).every(id=>byId.get(id)?.rarity==='Uncommon'));
assert.equal(byId.get(rarePack.cardIds[13])?.rarity,'Rare');
assert.ok(String(byId.get(rarePack.cardIds[14])?.type||'').toLowerCase().includes('tierra'));
const mythicPack=generateTrustedPack({seed:'qa-pack-mythic',mythicChance:1});
assert.equal(mythicPack.rareSlotRarity,'Mythic');
assert.equal(byId.get(mythicPack.cardIds[13])?.rarity,'Mythic');
assert.equal(byId.get(generateTrustedGuaranteedMythic({seed:'qa-mythic'}))?.rarity,'Mythic');
const packCampaignEffects=buildPackCampaignEffects([
  {id:'a',type:'all_fichas_multiplier',value:2,startAt:new Date(1),endAt:new Date(Date.now()+60_000)},
  {id:'b',type:'pack_open_ficha_bonus',value:3,startAt:new Date(1),endAt:new Date(Date.now()+60_000)},
  {id:'ignored-discount',type:'pack_discount',value:50,startAt:new Date(1),endAt:new Date(Date.now()+60_000)}
]);
assert.equal(effectivePackOpenFichas(packCampaignEffects),5);
assert.deepEqual(packCampaignEffects.activeEventIds,['a','b'],'Pack-open audit IDs must exclude Store-only campaign effects');

const memory=new Map();
globalThis.localStorage={
  getItem:k=>memory.has(k)?memory.get(k):null,
  setItem:(k,v)=>memory.set(k,String(v)),
  removeItem:k=>memory.delete(k)
};
const pending=beginEconomyReveal('qa-user','pack','pack:12345678');
assert.equal(pending.operationId,'pack:12345678');
assert.equal(getPendingEconomyReveal('qa-user','pack')?.operationId,'pack:12345678');
assert.equal(clearPendingEconomyReveal('qa-user','pack','pack:12345678'),true);
assert.equal(getPendingEconomyReveal('qa-user','pack'),null);

const ui=read('argentinia/js/ui.js');
const client=read('argentinia/js/economyClient.js');
const firebaseFacade=read('argentinia/js/firebaseClient.js');
const firebaseImpl=read('argentinia/js/firebaseClientImpl.js');
const fnIndex=read('functions/src/index.js');
const packServer=read('functions/src/economy/packs.js');
const packCore=read('functions/src/economy/packCore.js');

assert.match(client,/economyOpenPack/);
assert.match(client,/economyOpenGuaranteedMythic/);
assert.match(client,/economyGetOperation/);
assert.match(ui,/openPackAuthorityServer/);
assert.match(ui,/openGuaranteedMythicAuthorityServer/);
assert.match(ui,/recoverEconomyOperationServer/);
assert.match(ui,/beginEconomyReveal/);
assert.doesNotMatch(ui,/generatePackCards\s*\(/,'UI must not generate pack contents client-side');
assert.doesNotMatch(ui,/generateGuaranteedMythicCard\s*\(/,'UI must not choose guaranteed Mythic client-side');
assert.doesNotMatch(ui,/openInventoryPack\s*\(/,'UI must not invoke legacy client-authoritative pack mutation');
assert.doesNotMatch(ui,/openGuaranteedMythic\s*\(/,'UI must not invoke legacy client-authoritative Mythic mutation');
assert.match(firebaseImpl,/LEGACY_CHEST_WRITE_DISABLED/,'current client must hard-disable legacy direct Cofre writes');
assert.match(firebaseImpl,/export async function recordChestAuthorityStatsBestEffort/,'server-authoritative chest stats bridge must exist in Firebase implementation');
assert.match(ui,/if \(!outcome\.replayed\)[\s\S]{0,260}recordChestAuthorityStatsBestEffort/,'replayed economy receipts must not double-count chest statistics');

// Systemic lazy-facade contract: every asyncProxy exported by firebaseClient.js must
// resolve to a real export in firebaseClientImpl.js. This catches the exact class of
// FIREBASE_LAZY_EXPORT_MISSING regressions before production.
const lazyTargets=[...firebaseFacade.matchAll(/asyncProxy\('([^']+)'\)/g)].map(m=>m[1]);
const implExportNames=new Set([
  ...[...firebaseImpl.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1]),
  ...[...firebaseImpl.matchAll(/export\s+(?:const|let|class)\s+(\w+)/g)].map(m=>m[1])
]);
const missingLazyTargets=lazyTargets.filter(name=>!implExportNames.has(name));
assert.deepEqual(missingLazyTargets,[],'firebase lazy facade must not proxy missing implementation exports');

assert.match(fnIndex,/export const economyOpenPack/);
assert.match(fnIndex,/export const economyOpenGuaranteedMythic/);
assert.match(fnIndex,/type:\s*'chest\.open_pack'/);
assert.match(fnIndex,/type:\s*'chest\.open_guaranteed_mythic'/);
assert.match(fnIndex,/rejectUnknown\(data, \['operationId','economyProtocolVersion'\]\)/);
assert.match(packCore,/crypto\.randomBytes\(32\)/,'server entropy must be independent from client operationId');
assert.match(packServer,/TRUSTED_CARD_POOL/);
assert.match(packServer,/inventory\.standardPacks < 1/);
assert.match(packServer,/inventory\.guaranteedMythics < 1/);
assert.match(packServer,/CAMPAIGN_POLICY_UNAVAILABLE/,'campaign lookup must fail before consuming a pack');
assert.match(packServer,/mythicChance/,'server must honor trusted admin pack policy');

const manifest=JSON.parse(read('argentinia/build-manifest.json'));
assert.equal(manifest.engineVersion,'23.19.5.4');
assert.equal(manifest.economyProtocolVersion,'econ-23.19.5.4');
assert.equal(manifest.economySchemaVersion,5);

console.log('PACKS_CHEST_MYTHIC_AUTHORITY_23_19_5_1_OK serverRng=CRYPTO trustedPool=880 pack=9C+4U+R/M+L mythic=SERVER_ONLY recovery=OPERATION_ID campaign=FAIL_CLOSED');
