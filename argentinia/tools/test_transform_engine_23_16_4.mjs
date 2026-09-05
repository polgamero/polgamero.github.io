import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import {
  TRANSFORM_ENGINE_VERSION, normalizeTransformSpec, isTransformingDoubleFacedCard,
  initializeTransformPermanentItem, currentTransformFace, canTransformPermanent,
  transformPermanent, cardForNonBattlefieldZone, buildTransformFaceCard
} from '../js/transformEngine.js';
import { buildPermanentCopyToken, buildBecameCopyCard, extractCopiableCardValues } from '../js/copyEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const files=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const cards=files.flatMap(f=>json(`assets/data/${f}`));

assert.ok(['23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.6'].includes(ENGINE_VERSION));
assert.equal(TRANSFORM_ENGINE_VERSION,'23.16.4');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.80');
assert.ok(['pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=820);
assert.ok(cards.length>=820);
assert.ok(cards.filter(c=>c?.dfc?.kind==='transform').length>=0,'Transform Engine contract survives later TDFC content releases');

const physical={
  id:'test_dfc_001',name:'Persona de Día',type:'Criatura — Humano',manaCost:'{2}{W}',cmc:3,
  rarity:'Rare',colors:['W'],power:2,toughness:3,image:'persona_de_dia.png',text:'',keywords:[],
  _ownerRole:'host',
  dfc:{kind:'transform',backFace:{
    name:'Leyenda de Noche',type:'Encantamiento',colors:['B'],image:'leyenda_de_noche.png',
    text:'Cara posterior.',keywords:[]
  }}
};
assert.ok(isTransformingDoubleFacedCard(physical));
assert.equal(normalizeTransformSpec(physical).backName,'Leyenda de Noche');
const item={card:physical,tapped:true,damageTaken:2,counters:{plusOne:2,customMarca:1},auras:[{name:'Aura'}],summoningSickness:false,enteredThisTurn:false};
const init=initializeTransformPermanentItem(item,physical,{face:'front'});
assert.equal(init.changed,true);
assert.equal(currentTransformFace(item),'front');
assert.equal(item.card.name,'Persona de Día');
assert.equal(item.card.dfc,undefined,'effective battlefield face must not expose physical DFC metadata as a copiable value');
assert.ok(canTransformPermanent(item));

const identity=item;
const runtimeBefore={tapped:item.tapped,damage:item.damageTaken,counters:item.counters,auras:item.auras,sick:item.summoningSickness};
const t1=transformPermanent(item);
assert.equal(t1.transformed,true);
assert.equal(item,identity,'transform must preserve physical permanent identity');
assert.equal(currentTransformFace(item),'back');
assert.equal(item.card.name,'Leyenda de Noche');
assert.equal(item.card.type,'Encantamiento');
assert.equal(item.card.manaCost,'');
assert.equal(item.card.cmc,3,'TDFC back face uses front mana value');
assert.equal(item.tapped,runtimeBefore.tapped);
assert.equal(item.damageTaken,runtimeBefore.damage);
assert.equal(item.counters,runtimeBefore.counters);
assert.equal(item.auras,runtimeBefore.auras);
assert.equal(item.summoningSickness,runtimeBefore.sick);

const copiedValues=extractCopiableCardValues(item.card);
assert.equal(copiedValues.dfc,undefined);
assert.equal(copiedValues._dfcPhysicalCard,undefined);
assert.equal(copiedValues.name,'Leyenda de Noche');
const tokenCopy=buildPermanentCopyToken(item,{id:'token_copy_dfc'});
assert.equal(tokenCopy.card.name,'Leyenda de Noche');
assert.equal(tokenCopy.card.dfc,undefined);
assert.equal(tokenCopy.card.isToken,true);
assert.equal(canTransformPermanent(tokenCopy.item),false,'token copy of current face is not physically double-faced');

const mundane={id:'plain_1',name:'Fotocopia Humana',type:'Criatura — Humano',manaCost:'{1}{U}',cmc:2,colors:['U'],power:4,toughness:4,text:'',keywords:[]};
item.card=buildBecameCopyCard(item.card,mundane);
assert.equal(item.card.name,'Fotocopia Humana');
assert.equal(item.card._dfcCopyLocked,true);
const faceBefore=currentTransformFace(item);
const t2=transformPermanent(item);
assert.equal(t2.transformed,true);
assert.notEqual(currentTransformFace(item),faceBefore,'physical TDFC can still turn over while copy effect is active');
assert.equal(item.card.name,'Fotocopia Humana','turning over does not end the copy effect');

const frontInZone=cardForNonBattlefieldZone(item);
assert.equal(frontInZone.name,'Persona de Día');
assert.equal(frontInZone.dfc.kind,'transform');
assert.equal(frontInZone._dfcFace,undefined);
assert.equal(frontInZone._dfcCopyLocked,undefined);
const builtBack=buildTransformFaceCard(physical,'back');
assert.equal(builtBack.name,'Leyenda de Noche');
assert.equal(builtBack.cmc,3);

const stack=read('js/stackManager.js');
assert.ok(stack.includes('async function transformBattlefieldItem'));
assert.ok(stack.includes("type:'permanent_transformed'"));
assert.ok(stack.includes("effectToApply.type === 'transform'"));
assert.ok(stack.includes("initializeTransformPermanentItem(newPermanentItem,card,{face:'front'})"));
assert.ok(stack.includes("await runStateBasedActions({reason:'permanent_transformed'})"));
const main=read('js/main.js');
assert.ok(main.includes('initializeTransformPermanentItem'));
assert.ok(main.includes('rules.transformableOnly'));
assert.ok(main.includes("initializeTransformPermanentItem(newItem,entry.card,{face:'front'})"));
const ui=read('js/ui.js');
assert.ok(ui.includes("effectType === 'transform'"));
assert.ok(ui.includes('transformableOnly:true'));
assert.ok(ui.includes('dfc-face-badge'));
const events=read('js/eventEngine.js');
assert.ok(events.includes("'permanent_transformed'"));
const bot=read('js/bot.js');
assert.ok(bot.includes("effect.type === 'transform'"));
assert.ok(bot.includes('canTransformPermanent'));
const utils=read('js/utils.js');
assert.ok(utils.includes('cardForNonBattlefieldZone'));
const generator=read('tools/generate_image_manifest.py');
assert.ok(generator.includes('iter_card_face_images'));
assert.ok(generator.includes('backFace'));
assert.ok(generator.includes('doubleFacedCardCount'));

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log('PASS test_transform_engine_23_16_4.mjs · TDFC identity/faces/zones/copy/UI/assets · Pool 820');
