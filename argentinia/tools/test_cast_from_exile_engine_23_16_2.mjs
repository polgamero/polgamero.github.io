import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import {
  EXILE_PLAY_ENGINE_VERSION,
  EXILE_PLAY_DURATIONS,
  normalizeExilePlayPermission,
  grantExilePlayPermission,
  listExilePlayPermissions,
  findExilePlayPermission,
  permissionBaseManaOverride,
  expireExilePermissionsAtCleanup,
  ensureExileObjectId,
  clearExilePlayStateOnLeave
} from '../js/exilePlayEngine.js';
import { GAME_EVENT_TYPES, GENERIC_EVENT_ENGINE_VERSION, isKnownGameEventType } from '../js/eventEngine.js';
import { buildStackCopy } from '../js/copyEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

assert.ok(['23.16.2','23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.4.4'].includes(ENGINE_VERSION));
assert.equal(EXILE_PLAY_ENGINE_VERSION,'23.16.2');
assert.ok(['23.16.2','23.16.4','23.16.5'].includes(GENERIC_EVENT_ENGINE_VERSION));
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.1'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_iv_760','pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=760);
assert.equal(POOL_MILESTONES.pool_expansion_iv_760.total,760);

// Pure permission schema.
assert.deepEqual(EXILE_PLAY_DURATIONS,['until_end_of_turn','until_end_of_next_turn','while_exiled']);
assert.deepEqual(normalizeExilePlayPermission({withoutPayingManaCost:true,asThoughFlash:true}),{
  duration:'until_end_of_turn',playMode:'any',timing:'any_time',costMode:'without_paying_mana_cost',customCost:null,singleUse:true,allowKicker:true,label:null
});
assert.equal(permissionBaseManaOverride(normalizeExilePlayPermission({withoutPayingManaCost:true})),'{0}');
assert.equal(permissionBaseManaOverride(normalizeExilePlayPermission({costMode:'custom',cost:'{2}{R}'})),'{2}{R}');
assert.equal(permissionBaseManaOverride(normalizeExilePlayPermission({costMode:'normal'})),null);

// EOT expires in the current cleanup.
const eot={id:'eot',name:'EOT',type:'Conjuro'};
const pEot=grantExilePlayPermission(eot,{controllerRole:'host',ownerRole:'host',activePlayerRole:'host',turnCount:10,spec:{duration:'until_end_of_turn'}});
assert.equal(listExilePlayPermissions(eot,'host').length,1);
let expired=expireExilePermissionsAtCleanup([eot],{endingPlayerRole:'host',turnCount:10});
assert.equal(expired.length,1);
assert.equal(listExilePlayPermissions(eot).length,0);

// "Until end of your next turn": if granted in your own turn it survives this cleanup + one full own turn.
const nextOwn={id:'next',name:'Next',type:'Instantáneo'};
const pNext=grantExilePlayPermission(nextOwn,{controllerRole:'host',ownerRole:'host',activePlayerRole:'host',turnCount:20,spec:{duration:'until_end_of_next_turn'}});
assert.equal(pNext.controllerTurnEndsRemaining,2);
expired=expireExilePermissionsAtCleanup([nextOwn],{endingPlayerRole:'host',turnCount:20});
assert.equal(expired.length,0);
assert.equal(findExilePlayPermission(nextOwn,'host').controllerTurnEndsRemaining,1);
expired=expireExilePermissionsAtCleanup([nextOwn],{endingPlayerRole:'guest',turnCount:21});
assert.equal(expired.length,0);
expired=expireExilePermissionsAtCleanup([nextOwn],{endingPlayerRole:'host',turnCount:22});
assert.equal(expired.length,1);

// Granted during opponent turn => expires at your very next cleanup.
const nextFromOpp={id:'opp',name:'Opp',type:'Criatura'};
grantExilePlayPermission(nextFromOpp,{controllerRole:'host',ownerRole:'host',activePlayerRole:'guest',turnCount:30,spec:{duration:'until_end_of_next_turn'}});
assert.equal(findExilePlayPermission(nextFromOpp,'host').controllerTurnEndsRemaining,1);
assert.equal(expireExilePermissionsAtCleanup([nextFromOpp],{endingPlayerRole:'guest',turnCount:30}).length,0);
assert.equal(expireExilePermissionsAtCleanup([nextFromOpp],{endingPlayerRole:'host',turnCount:31}).length,1);

// while_exiled does not decay; leaving Exile destroys both permission and exile-object identity.
const persistent={id:'persist',name:'Persist',type:'Tierra'};
const firstObjectId=ensureExileObjectId(persistent,'host');
grantExilePlayPermission(persistent,{controllerRole:'guest',ownerRole:'host',activePlayerRole:'host',turnCount:40,spec:{duration:'while_exiled',playMode:'land'}});
assert.equal(expireExilePermissionsAtCleanup([persistent],{endingPlayerRole:'host',turnCount:40}).length,0);
assert.ok(findExilePlayPermission(persistent,'guest'));
clearExilePlayStateOnLeave(persistent);
assert.equal(findExilePlayPermission(persistent,'guest'),null);
assert.equal(persistent._exileObjectId,undefined);
assert.notEqual(ensureExileObjectId(persistent,'host'),firstObjectId);

// The same physical exiled card can authorize a controller different from its owner.
const stolen={id:'stolen',name:'Prestada',type:'Conjuro'};
grantExilePlayPermission(stolen,{controllerRole:'guest',ownerRole:'host',activePlayerRole:'host',turnCount:50,spec:{duration:'until_end_of_turn',playMode:'spell',costMode:'custom',cost:'{1}{U}'}});
assert.equal(findExilePlayPermission(stolen,'host'),null);
assert.equal(findExilePlayPermission(stolen,'guest').customCost,'{1}{U}');

// Cast-from-exile is an explicit generic event vocabulary.
for(const event of ['cast_from_exile','card_played_from_exile']){
  assert.ok(GAME_EVENT_TYPES.includes(event));
  assert.equal(isKnownGameEventType(event),true);
}

// Copy Engine hardening: cast origin / permission are historical runtime facts, not copiable.
const originalStack={id:'stack1',type:'instant',card:{id:'inst_x',name:'Hechizo',type:'Instantáneo',manaCost:'{X}{U}'},isLocal:true,xValue:4,kicked:true,castFrom:'exile',exilePermissionId:'xp_1',exilePlayEngineVersion:'23.16.2'};
const copied=buildStackCopy(originalStack,{controllerIsLocal:true});
assert.equal(copied.isCopy,true);
assert.equal(copied.wasCast,false);
assert.equal(copied.xValue,4);
assert.equal(copied.kicked,true);
assert.equal(copied.castFrom,null);
assert.equal(copied.exilePermissionId,null);
assert.equal(copied.exilePlayEngineVersion,null);

// Integration markers: direct CR601 from public Exile, lands, X/Kicker, cleanup, effect vocabulary, UI, Tano and wire metadata.
const main=read('js/main.js');
for(const marker of [
  'grantPlayPermissionForExiledCard', 'canPlayCardFromExile', 'playCardFromExile', 'exileTopCardsWithPlayPermission',
  "originZone:'exile'", "castFrom:'exile'", 'const physicalCard = tx.originalCard || tx.card',
  "type:'cast_from_exile'", "type:'card_played_from_exile'", 'allowKicker:permission.allowKicker !== false'
]) assert.ok(main.includes(marker),`main missing ${marker}`);
assert.ok(!main.includes("state.localHand.push(card); // exile"),'Cast-from-Exile must not loan public cards into private hand');

const stack=read('js/stackManager.js');
assert.ok(stack.includes("effectToApply.type === 'exile_top_with_permission'"));
assert.ok(stack.includes("'exile_top_with_permission'"));
const turn=read('js/turnManager.js');
assert.ok(turn.includes('expireExilePlayPermissionsForCleanup(isLocal)'));
const ui=read('js/ui.js');
for(const marker of ['getExilePlayPermissionForCard(cardObj,true)','canPlayCardFromExile(cardObj,true)','Jugar desde Exilio','Castear desde Exilio']) assert.ok(ui.includes(marker));
const bot=read('js/bot.js');
for(const marker of ['tryBotCastFromExile','permissionBaseManaOverride(permission)',"castFrom:'exile'",'card.adjunta']) assert.ok(bot.includes(marker));
const sync=read('js/matchSync.js');
for(const marker of ['exilePermissionId:', 'exilePlayEngineVersion:']) assert.ok(sync.includes(marker));

// Historical engine contract: Suspend/Time semantics stay reserved for 23.16.3; later pool releases may add exile content.
const dataFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const cards=[];
const visit=v=>{ if(Array.isArray(v)) v.forEach(visit); else if(v&&typeof v==='object'){ if(v.id&&v.name&&v.type) cards.push(v); else Object.values(v).forEach(visit); } };
for(const f of dataFiles) visit(JSON.parse(read(`assets/data/${f}`)));
assert.ok(cards.length>=760);

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_cast_from_exile_engine_23_16_2.mjs'));

console.log('PASS test_cast_from_exile_engine_23_16_2.mjs · permissions/EOT-next-turn/while-exiled + direct CR601 + lands/spells + X/Kicker + events + multiplayer/Tano/UI · Pool 760');
