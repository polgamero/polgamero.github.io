import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GAME_EVENT_TYPES,
  normalizeGameEvent,
  normalizeGenericTriggerSpecs,
  eventTypeMatches,
  eventFilterMatches,
  collectGenericEventMatches
} from '../js/eventEngine.js';

assert.ok(GAME_EVENT_TYPES.includes('spell_cast'));
assert.ok(GAME_EVENT_TYPES.includes('creature_died'));
assert.ok(GAME_EVENT_TYPES.includes('life_gained'));
assert.ok(GAME_EVENT_TYPES.includes('permanent_sacrificed'));
assert.ok(GAME_EVENT_TYPES.includes('token_created'));
assert.ok(GAME_EVENT_TYPES.includes('spell_countered'));

const watcherCard = {
  id:'watcher', name:'Watcher', type:'Criatura — Músico', colors:['U'],
  triggers:[
    { event:'spell_cast', filter:{controller:'you',cardType:'noncreature'}, effect:{type:'draw',amount:1} },
    { event:'permanent_entered', filter:{controller:'you',cardType:'creature',subtype:'Músico'}, effect:{type:'heal',amount:1} },
    { event:'damage_dealt', filter:{targetSelf:true,minAmount:2}, effect:{type:'draw',amount:1} },
    { event:'counter_added', filter:{self:true,counterType:'charge'}, effect:{type:'draw',amount:1} }
  ]
};
const watcherItem = { card:watcherCard, _syncObjectId:'perm_watch' };
const rivalWatcher = { card:{...watcherCard,id:'rival'}, _syncObjectId:'perm_rival' };

const specs=normalizeGenericTriggerSpecs(watcherCard);
assert.equal(specs.length,4);
assert.equal(specs[0].event,'spell_cast');
assert.equal(specs[0].effect.type,'draw');

const shorthand=normalizeGenericTriggerSpecs({triggers:{
  spell_cast:{filter:{cardType:'instant'},effect:{type:'draw',amount:1}},
  creature_died:{filter:{controller:'opponent'},effect:{type:'heal',amount:1}}
}});
assert.equal(shorthand.length,2);
assert.equal(shorthand[1].event,'creature_died');

const creatureEntered=normalizeGameEvent({
  type:'creature_entered', controllerIsLocal:true,
  card:{name:'Bandoneonista',type:'Criatura — Humano Músico',colors:['U']},
  item:{_syncObjectId:'entered'}
});
assert.ok(eventTypeMatches('creature_entered',creatureEntered));
assert.ok(eventTypeMatches('permanent_entered',creatureEntered),'Creature ETB must imply permanent ETB');

const died=normalizeGameEvent({type:'creature_died',controllerIsLocal:false,card:{type:'Criatura'}});
assert.ok(eventTypeMatches('permanent_left_battlefield',died),'Death must imply LTB');
const combat=normalizeGameEvent({type:'combat_damage_dealt',amount:3,combat:true});
assert.ok(eventTypeMatches('damage_dealt',combat),'Combat damage must imply damage');

const instant={name:'Respuesta',type:'Instantáneo',colors:['U']};
assert.equal(eventFilterMatches({controller:'you',cardType:'noncreature'},normalizeGameEvent({type:'spell_cast',controllerIsLocal:true,card:instant}),{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),true);
assert.equal(eventFilterMatches({controller:'opponent'},normalizeGameEvent({type:'spell_cast',controllerIsLocal:true,card:instant}),{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),false);
assert.equal(eventFilterMatches({controller:'opponent'},normalizeGameEvent({type:'spell_cast',controllerIsLocal:true,card:instant}),{sourceIsLocal:false,sourceItem:rivalWatcher,sourceCard:rivalWatcher.card}),true,'Opponent is controller-relative for rival watchers too');
assert.equal(eventFilterMatches({controller:'rival'},normalizeGameEvent({type:'spell_cast',controllerIsLocal:false,card:instant}),{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),true,'rival is the absolute remote client side');
assert.equal(eventFilterMatches({cardType:'instant',color:'U'},normalizeGameEvent({type:'spell_cast',controllerIsLocal:true,card:instant}),{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),true);
assert.equal(eventFilterMatches({zoneFrom:'graveyard',cause:['escape','flashback']},normalizeGameEvent({type:'spell_cast',controllerIsLocal:true,card:instant,zoneFrom:'graveyard',cause:'flashback'}),{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),true);

const damageEvent=normalizeGameEvent({
  type:'damage_dealt', controllerIsLocal:true, targetControllerIsLocal:true,
  card:watcherCard,item:watcherItem,targetCard:watcherCard,targetItem:watcherItem,
  sourceCard:{type:'Criatura — Bestia'},sourceItem:{_syncObjectId:'src'},amount:3
});
assert.equal(eventFilterMatches({targetSelf:true,minAmount:2,eventSourceCardType:'creature'},damageEvent,{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),true);
assert.equal(eventFilterMatches({targetSelf:true,minAmount:4},damageEvent,{sourceIsLocal:true,sourceItem:watcherItem,sourceCard:watcherCard}),false);

const musicEtb=normalizeGameEvent({type:'creature_entered',controllerIsLocal:true,card:{type:'Criatura — Humano Músico'},item:{_syncObjectId:'music'}});
const matches=collectGenericEventMatches({
  event:musicEtb,
  watchers:[{item:watcherItem,isLocal:true},{item:rivalWatcher,isLocal:false}]
});
assert.equal(matches.length,1,'Only the controller-relative local watcher should match your Musician ETB');
assert.equal(matches[0].sourceItem,watcherItem);
assert.equal(matches[0].spec.event,'permanent_entered');

const counterEvent=normalizeGameEvent({type:'counter_added',controllerIsLocal:true,card:watcherCard,item:watcherItem,amount:1,metadata:{counterType:'charge'}});
const counterMatches=collectGenericEventMatches({event:counterEvent,watchers:[{item:watcherItem,isLocal:true}]});
assert.equal(counterMatches.length,1);
assert.equal(counterMatches[0].spec.event,'counter_added');

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const combatJs=fs.readFileSync(new URL('../js/combatRules.js',import.meta.url),'utf8');
const turn=fs.readFileSync(new URL('../js/turnManager.js',import.meta.url),'utf8');
const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const bot=fs.readFileSync(new URL('../js/bot.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../js/version.js',import.meta.url),'utf8');

assert.match(main,/buildGenericEventTriggerEntries/);
assert.match(main,/dispatchGameEvent/);
assert.match(main,/type:'spell_cast'/);
assert.match(main,/type:'creature_entered'/);
assert.match(main,/type:'land_entered'/);
assert.match(main,/type:'creature_died'/);
assert.match(main,/type:'card_discarded'/);
assert.match(main,/type:'permanent_sacrificed'/);
assert.match(main,/type:'counter_added'/);
assert.match(main,/type:'counter_removed'/);
assert.match(main,/type:'permanent_tapped'/);
assert.match(main,/generic_event_triggers_deferred/);
assert.match(main,/state\.deferredLandManaTriggers\.push\(\.\.\.entries\)/);
assert.match(main,/genericWatchersSnapshot[\s\S]*entry\.item[\s\S]*unit: entry\.item/,'Single-sacrifice death watcher snapshot must use generic watcher.item');
assert.match(main,/confirmCrew\(\)[\s\S]*cause:'crew'/,'Crew tap event must be emitted only when Crew is confirmed');
assert.match(combatJs,/attack_declared/);
assert.match(combatJs,/queueDeclaredAttackTriggers/);
assert.match(combatJs,/cause:'attack'/);
assert.match(combatJs,/type:'permanent_tapped'/);
assert.match(combatJs,/block_declared/);
assert.match(combatJs,/combat_damage_dealt/);
assert.match(turn,/type:'turn_started'/);
assert.match(turn,/type:'permanent_untapped'/);
assert.match(turn,/type:'upkeep_started'/);
assert.match(turn,/type:'end_step_started'/);
assert.match(turn,/type:'card_drawn'/);
assert.match(stack,/type:'token_created'/);
assert.match(stack,/type:'spell_countered'/);
assert.match(stack,/type:'life_gained'/);
assert.match(stack,/type:'life_lost'/);
assert.match(stack,/aliases:\['permanent_left_battlefield'\]/);
assert.match(bot,/queueDeclaredAttackTriggers\(declaredAttackers, false\)/);
assert.match(bot,/cause:'mana_ability'/);
assert.match(bot,/cause:'activated_ability'/);
assert.match(bot,/cause:'crew'/);

// Legacy JSON stays valid: 23.15.3 is additive, not a forced 643-card migration.
assert.match(main,/creatureEtbTrigger/);
assert.match(main,/landEtbTrigger/);
assert.match(main,/spellCastTrigger/);
assert.match(main,/diesTrigger/);
assert.match(combatJs,/attackTrigger/);
assert.match(turn,/upkeepTrigger/);
if (!version.includes("ENGINE_VERSION = '23.18'")) assert.match(version,/23\.15\.3/);

console.log('EVENT_ENGINE_23_15_3_OK events=25 predicates=controller+owner+self+type+subtype+color+zone+cause+amount+source-target payment-defer+attack-tap+crew-confirm legacy=compatible');
