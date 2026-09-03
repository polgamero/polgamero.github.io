import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import {
  COPY_ENGINE_VERSION, extractCopiableCardValues, buildCopiedCard, buildBecameCopyCard,
  buildStackCopy, buildPermanentCopyToken, isCopyableStackItem, copyEngineSummary
} from '../js/copyEngine.js';
import { GAME_EVENT_TYPES } from '../js/eventEngine.js';
import { moveCounteredStackItemToDestination } from '../js/utils.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

// Release identity: engine-only release, content milestone stays frozen at 730.
assert.ok(['23.15.9','23.15.10','23.16.1','23.16.1.1','23.16.2','23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.4'].includes(ENGINE_VERSION),'Copy Engine contract must survive later engine-only releases');
assert.equal(COPY_ENGINE_VERSION,'23.15.9');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_iii_730','pool_expansion_iv_760','pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=730);

const sourceCard={
  id:'inst_demo',_ownerRole:'host',_runtime:'ignore',name:'Eco del Obelisco',type:'Instantáneo',
  manaCost:'{2}{U}',cmc:3,colors:['U'],rarity:'Rare',text:'Texto',image:'demo.png',
  keywords:['flashback'],effect:{type:'damage',amount:'X'},kicker:{cost:'{R}',bonusEffect:{type:'draw',amount:1}},
  modes:[{text:'A',effect:{type:'draw',amount:1}}],targets:[{effect:{type:'damage',amount:2}}],
  isToken:true,tokenCreatedBy:'old',copyOfCardId:'older'
};
const values=extractCopiableCardValues(sourceCard);
assert.equal(values.name,sourceCard.name);
assert.equal(values.manaCost,'{2}{U}');
assert.deepEqual(values.effect,sourceCard.effect);
assert.deepEqual(values.kicker,sourceCard.kicker);
assert.equal(values.id,undefined);
assert.equal(values._ownerRole,undefined);
assert.equal(values._runtime,undefined);
assert.equal(values.isToken,undefined);
assert.equal(values.copyOfCardId,undefined);

const copiedCard=buildCopiedCard(sourceCard,{id:'copy_card_1',overrides:{name:'Eco Perfecto',addKeywords:['flying'],appendText:'Vuela.'}});
assert.equal(copiedCard.id,'copy_card_1');
assert.equal(copiedCard.name,'Eco Perfecto');
assert.equal(copiedCard.manaCost,'{2}{U}');
assert.ok(copiedCard.keywords.includes('flashback') && copiedCard.keywords.includes('flying'));
assert.match(copiedCard.text,/Vuela\.$/);
assert.equal(copiedCard.isToken,undefined);
assert.equal(copiedCard.copyEngineVersion,'23.15.9');

// copy-of-copy toma los valores COPIABLES actuales, no vuelve al original histórico.
const second=buildCopiedCard(copiedCard,{id:'copy_card_2'});
assert.equal(second.name,'Eco Perfecto');
assert.ok(second.keywords.includes('flying'));

// Un permanente que se vuelve copia mantiene identidad física/owner/token del SUJETO.
const targetCard={id:'crea_target',name:'Sujeto',type:'Criatura',power:1,toughness:1,_ownerRole:'guest',isToken:true,tokenCreatedBy:'x'};
const template={id:'crea_template',name:'Molde',type:'Criatura Artefacto',manaCost:'{4}',cmc:4,power:5,toughness:5,keywords:['trample']};
const became=buildBecameCopyCard(targetCard,template);
assert.equal(became.id,'crea_target');
assert.equal(became._ownerRole,'guest');
assert.equal(became.isToken,true);
assert.equal(became.name,'Molde');
assert.equal(became.power,5);
assert.equal(became.manaCost,'{4}');

// Token-copy conserva características impresas, pero su objeto runtime nace limpio.
const templateItem={card:template,tapped:true,damageTaken:4,counters:{shield:2},summoningSickness:false,auras:[{id:'a'}]};
const tokenCopy=buildPermanentCopyToken(templateItem,{id:'tokcopy_1'});
assert.equal(tokenCopy.card.name,'Molde');
assert.equal(tokenCopy.card.manaCost,'{4}');
assert.equal(tokenCopy.card.cmc,4);
assert.equal(tokenCopy.card.isToken,true);
assert.equal(tokenCopy.item.tapped,false);
assert.equal(tokenCopy.item.damageTaken,0);
assert.equal(tokenCopy.item.counters,undefined);
assert.deepEqual(tokenCopy.item.auras,[]);
assert.equal(tokenCopy.item.summoningSickness,true);

// Stack copies: objeto nuevo, misma información copiable/choices y referencias vivas a targets.
const battlefieldTarget={card:{id:'crea_foo',name:'Objetivo'}};
const originalSpell={
  id:77,card:{id:'inst_x',name:'Rayazo X',type:'Instantáneo',manaCost:'{X}{R}',cmc:1,effect:{type:'damage',amount:'X'}},
  isLocal:false,type:'instant',xValue:6,kicked:true,castFrom:'hand',targetObj:{type:'creature',isLocal:true,item:battlefieldTarget}
};
const spellCopy=buildStackCopy(originalSpell,{controllerIsLocal:true,sourceCardId:'inst_copy'});
assert.equal(spellCopy.id,undefined);
assert.equal(spellCopy.isCopy,true);
assert.equal(spellCopy.wasCast,false);
assert.equal(spellCopy.copyKind,'spell');
assert.equal(spellCopy.copiedFromStackId,77);
assert.equal(spellCopy.xValue,6);
assert.equal(spellCopy.kicked,true);
assert.equal(spellCopy.targetObj.item,battlefieldTarget);
assert.notEqual(spellCopy.card,originalSpell.card);
assert.deepEqual(spellCopy.card.effect,originalSpell.card.effect);

const ability={id:88,card:{id:'art_a',name:'Motor',type:'Artefacto'},type:'ability',isLocal:false,abilityKind:'activated',ability:{name:'Pulso',effect:{type:'draw',amount:1}},targetObj:null};
const abilityCopy=buildStackCopy(ability,{controllerIsLocal:true});
assert.equal(abilityCopy.copyKind,'ability');
assert.equal(abilityCopy.wasCast,false);
assert.deepEqual(abilityCopy.ability,ability.ability);
assert.ok(isCopyableStackItem(ability,'ability'));
assert.ok(!isCopyableStackItem(ability,'spell'));
assert.ok(isCopyableStackItem(originalSpell,'instant_or_sorcery'));
assert.ok(isCopyableStackItem({card:template,type:'summon'},'permanent_spell'));

// Counterear una copia jamás mueve una carta física a cementerio/exilio.
const fakeState={localGraveyard:[],rivalGraveyard:[],localExile:[],rivalExile:[],currentMatch:null};
assert.equal(moveCounteredStackItemToDestination({...spellCopy,id:99},fakeState),'copy_ceased');
assert.equal(fakeState.localGraveyard.length+fakeState.rivalGraveyard.length+fakeState.localExile.length+fakeState.rivalExile.length,0);

const summary=copyEngineSummary();
assert.equal(summary.permanentTokenCopies,true);
assert.equal(summary.permanentBecomesCopy,true);
assert.ok(summary.nonCopiableRuntimeState.includes('counters'));

for(const event of ['spell_copied','ability_copied','permanent_became_copy']) assert.ok(GAME_EVENT_TYPES.includes(event),`missing copy event ${event}`);

// Integración estática: estas marcas protegen las rutas críticas sin importar DOM/browser.
const stack=read('js/stackManager.js');
for(const marker of [
  "STACK_COPY_EFFECTS", "resolveStackCopyEffect", "buildStackCopy(original", "create_token_copy", "buildPermanentCopyToken",
  "become_copy", "buildBecameCopyCard", "item?.isCopy) return 'copy_ceased'", "permanent_spell_copy",
  "copy_retarget_decision", "copy_stack_target", "isStackItemLegalCopyTarget"
]) assert.ok(stack.includes(marker),`stackManager missing ${marker}`);
const sync=read('js/matchSync.js');
for(const marker of ['isCopy','wasCast','copyKind','copiedFromStackId','copyCreatedBy','copyEngineVersion']) assert.ok(sync.includes(marker),`matchSync missing ${marker}`);
const ui=read('js/ui.js');
for(const marker of ['showCopyRetargetModal','showStackObjectChoiceModal',"'copy_spell','copy_ability','copy_stack_object'",'create_token_copy','become_copy']) assert.ok(ui.includes(marker),`ui missing ${marker}`);
const main=read('js/main.js');
for(const marker of ["decision.type === 'copy_retarget_decision'","decision.type === 'copy_stack_target'",'spell_copied','ability_copied','permanent_became_copy']) assert.ok(main.includes(marker),`main missing ${marker}`);
const bot=read('js/bot.js');
for(const marker of ['isStackCopySpell','isStackItemLegalCopyTarget','create_token_copy','become_copy']) assert.ok(bot.includes(marker),`bot missing ${marker}`);
const workflow=read('../.github/workflows/pages.yml');
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_copy_engine_23_15_9.mjs'),'Copy Engine must remain in historical regression');

console.log('PASS test_copy_engine_23_15_9.mjs · Copy Engine stack/permanent/multiplayer/Tano contracts OK · Pool 730');
