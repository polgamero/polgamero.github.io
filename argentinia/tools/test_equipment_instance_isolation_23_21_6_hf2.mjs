import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installHeadlessDom } from './headless_dom_stub_23_18_1.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ui=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');

// UI regression: Equipamientos idénticos deben renderizarse por instancia, no por card.id.
// Si se agrupan, group.ready[0] hace que el segundo click reactive siempre la primera copia.
assert.match(ui,/zoneType === 'support' && \(isSagaCard\(item\?\.card\) \|\| !!item\?\.card\?\.equipment\)/,
  'Support grouping must isolate Equipment instances just like Sagas');
assert.match(ui,/const kind = isSagaCard\(item\?\.card\) \? 'saga' : 'equipment'/,
  'Equipment instance grouping key must be explicit and stable');

// Engine regression: dos copias del mismo card.id mantienen attachments y bonuses independientes.
installHeadlessDom();
const main=await import(pathToFileURL(path.join(root,'js','main.js')).href+`?equipment_hf2=${Date.now()}`);
const {state,getEquipmentOn,getEffectivePower}=main;
const creatureA={card:{id:'crea_test_a',name:'Criatura A',type:'Criatura',power:2,toughness:2},auras:[]};
const creatureB={card:{id:'crea_test_b',name:'Criatura B',type:'Criatura',power:3,toughness:3},auras:[]};
const sharedCard={id:'art_024',name:'Atado con Alambre',type:'Artefacto — Equipamiento',equipment:{grantedStats:{powerMod:1,toughnessMod:0}}};
const equipmentA={card:sharedCard,attachedTo:creatureA,_syncObjectId:'eq_a'};
const equipmentB={card:sharedCard,attachedTo:creatureB,_syncObjectId:'eq_b'};
state.localCombat=[creatureA,creatureB];
state.rivalCombat=[];
state.localSupport=[equipmentA,equipmentB];
state.rivalSupport=[];
assert.equal(getEquipmentOn(creatureA).length,1);
assert.equal(getEquipmentOn(creatureB).length,1);
assert.equal(getEffectivePower(creatureA),3,'first Atado grants +1 only to first creature');
assert.equal(getEffectivePower(creatureB),4,'second Atado grants +1 independently to second creature');

equipmentB.attachedTo=creatureA;
assert.equal(getEquipmentOn(creatureA).length,2,'both copies may attach to one creature independently');
assert.equal(getEffectivePower(creatureA),4,'two Atado copies stack +2 on the same creature');
assert.equal(getEffectivePower(creatureB),3,'moving second copy must not move first copy');

console.log('EQUIPMENT_INSTANCE_ISOLATION_23_21_6_HF2_OK duplicateCopies=independent uiGrouping=perInstance stats=stackCorrectly');
