import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectAttachmentStateActions,
  evaluateStateBasedActions,
  hasMechanicalStateActions
} from '../js/rulesKernel.js';
import { deriveNextControlEffectSerial } from '../js/controlEngine.js';
import { serializeBoardItemRef, deserializeBoardItemRef } from '../js/matchSync.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const main = fs.readFileSync(path.join(root,'js','main.js'),'utf8');
const version = fs.readFileSync(path.join(root,'js','version.js'),'utf8');
const workflow = fs.readFileSync(path.join(root,'..','.github','workflows','pages.yml'),'utf8');

function blankState() {
  return {
    localCombat:[], rivalCombat:[], localSupport:[], rivalSupport:[], localLands:[], rivalLands:[],
    localPlaneswalkers:[], rivalPlaneswalkers:[], localGraveyard:[], rivalGraveyard:[],
    localExile:[], rivalExile:[], localHand:[], rivalHand:[], localDeck:[], rivalDeck:[]
  };
}

// P0 #1: an illegal Aura/Equipment is itself enough to keep the SBA loop alive.
{
  const s = blankState();
  const protectedUnit = {
    card:{id:'u1',name:'Protegida',type:'Criatura',toughness:2},
    auras:[{id:'a1',name:'Aura Azul',colors:['U']}],
    protectionColor:'U'
  };
  const equipment = {
    card:{id:'e1',name:'Equipo Azul',type:'Artefacto — Equipo',colors:['U']},
    attachedTo: protectedUnit
  };
  s.localCombat.push(protectedUnit);
  s.localSupport.push(equipment);
  const getProtectionMatch = (item, colors=[]) => item?.protectionColor && colors.includes(item.protectionColor) ? item.protectionColor : null;
  const actions = collectAttachmentStateActions(s,{getProtectionMatch});
  assert.equal(actions.length,2);
  assert.deepEqual(actions.map(x=>x.kind).sort(),['aura','equipment']);
  const snap = evaluateStateBasedActions(s,{getProtectionMatch});
  assert.equal(snap.attachments.length,2);
  assert.equal(hasMechanicalStateActions(snap),true,'attachments ilegales deben contar como SBA mecánica aun sin muertes/contadores/Leyenda');
}

// P0 #2: after F5/hydration, the next serial must be above every persisted control layer.
{
  const s = blankState();
  s.localCombat.push({_controlEffects:[{serial:10},{serial:3}]});
  s.rivalLands.push({_controlEffects:[{serial:41}]});
  s.localSupport.push({_controlEffects:[{serial:'17'}]});
  assert.equal(deriveNextControlEffectSerial(s),42);
  s.rivalPlaneswalkers.push({_controlEffects:[{serial:99}]});
  assert.equal(deriveNextControlEffectSerial(s),100);
}

// P1: stable battlefield refs survive a controller-side move.
{
  const item={card:{id:'stolen',name:'Prestada',_ownerRole:'guest'},_syncObjectId:'guest_obj_77'};
  const s=blankState();
  s.localCombat=[item];
  const ref=serializeBoardItemRef(item,s,'host');
  assert.equal(ref.controllerRole,'host');
  assert.equal(ref.cardOwnerRole,'guest');
  s.localCombat=[]; s.rivalCombat=[item];
  assert.equal(deserializeBoardItemRef(ref,s,'host'),item,'_syncObjectId debe seguir al permanente aunque cambie de controlador');
}

if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.6'")))) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:2\.1|[3-9]|[1-9][0-9]+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
assert.ok(main.includes("evaluateStateBasedActions(state,{getEffectiveToughness,hasKeyword,getProtectionMatch,hasPendingSagaChapter})") || main.includes("evaluateStateBasedActions(state,{getEffectiveToughness,hasKeyword,getProtectionMatch})"));
assert.ok(main.includes('if (checkAuraLegality() > 0) changed = true;'));
assert.ok(main.includes('if (checkEquipmentLegality() > 0) changed = true;'));
assert.ok(main.includes('for (const unit of [...(zone||[])])'),'Aura legality debe iterar snapshot para no saltear vecinos si una Aura de control mueve el permanente');
assert.ok(main.includes('deriveNextControlEffectSerial(state)'));
assert.ok((main.match(/ensureControlEffectSerialAfterHydration\(\);/g)||[]).length >= 3,'debe endurecer snapshot remoto, reconnect multiplayer y recovery Solo');
assert.ok(main.includes('serializeBoardItemRef(targetObj.item, state, myRole)'));
assert.ok(main.includes('deserializeBoardItemRef(normalized, state, myRole)'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt') && fs.readFileSync(path.join(root,'tools','ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_rules_control_hardening_23_15_2_1.mjs'));

const files=['tierras','artefactos','criaturas','instantaneos','conjuros','encantamientos','planeswalkers'];
const total=files.reduce((n,name)=>n+JSON.parse(fs.readFileSync(path.join(root,'assets','data',`${name}.json`),'utf8')).length,0);
assert.ok(total>=643,'cumulative source must preserve the historical 643-card pool from 23.15.2.1');

console.log('RULES_CONTROL_HARDENING_23_15_2_1_OK attachments=SBA serial=rebuild-after-hydration refs=syncObjectId historical-pool>=643');
