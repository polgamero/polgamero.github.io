import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  controllerRoleForSide, stampPermanentController, permanentControllerRole,
  makeControlEffect, addControlEffect, expireEndOfTurnControlEffects,
  removeSourceBoundControlEffects
} from '../js/controlEngine.js';
import { serializeStackTarget, deserializeStackTarget } from '../js/matchSync.js';
import { stampCardOwner, zoneForCardOwner } from '../js/zoneOwnership.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const main = fs.readFileSync(path.join(root,'js','main.js'),'utf8');
const stack = fs.readFileSync(path.join(root,'js','stackManager.js'),'utf8');
const match = fs.readFileSync(path.join(root,'js','matchSync.js'),'utf8');
const turn = fs.readFileSync(path.join(root,'js','turnManager.js'),'utf8');
const ui = fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const version = fs.readFileSync(path.join(root,'js','version.js'),'utf8');
const texts = fs.readFileSync(path.join(root,'js','gameTexts.js'),'utf8');

assert.equal(controllerRoleForSide(true,'host'),'host');
assert.equal(controllerRoleForSide(false,'host'),'guest');
const item={card:{name:'Robable'}};
stampPermanentController(item,false,'host');
assert.equal(permanentControllerRole(item,false,'host'),'guest');
const permanent=makeControlEffect({controllerRole:'host',duration:'indefinite',serial:10});
addControlEffect(item,permanent);
assert.equal(item._controllerRole,'host');
const temporary=makeControlEffect({controllerRole:'guest',duration:'until_end_of_turn',expiresAtTurn:7,serial:11});
addControlEffect(item,temporary);
assert.equal(item._controllerRole,'guest');
expireEndOfTurnControlEffects(item,7);
assert.equal(item._controllerRole,'host','al expirar Threaten vuelve al efecto de control anterior, no necesariamente al owner');
const aura=makeControlEffect({controllerRole:'guest',duration:'while_source',sourceId:'aura1',serial:12});
addControlEffect(item,aura);
assert.equal(item._controllerRole,'guest');
removeSourceBoundControlEffects(item,'aura1');
assert.equal(item._controllerRole,'host');

// Owner y controller son ejes distintos también en wire: una carta guest robada por host
// se localiza por controllerRole=host, pero sus destinos privados siguen perteneciendo a guest.
const stolenCard={id:'stolen_1',name:'Prestada'};
stampCardOwner(stolenCard,false,'host');
const stolen={card:stolenCard,_syncObjectId:'guest_stolen_1'};
stampPermanentController(stolen,true,'host');
const syncState={
  localCombat:[stolen],rivalCombat:[],localSupport:[],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]
};
const descriptor=serializeStackTarget({type:'creature',isLocal:true,item:stolen,index:0},syncState,'host');
assert.equal(descriptor.controllerRole,'host');
assert.equal(descriptor.cardOwnerRole,'guest');
const localGrave=[]; const rivalGrave=[];
assert.equal(zoneForCardOwner(stolenCard,localGrave,rivalGrave,true,'host'),rivalGrave,'la carta robada vuelve a la zona de su owner');
// Si el objeto cambió nuevamente de controlador después de declarar el target, el sync id lo sigue.
syncState.localCombat=[]; syncState.rivalCombat=[stolen];
const rehydrated=deserializeStackTarget(descriptor,syncState,'host');
assert.equal(rehydrated.item,stolen);
assert.equal(rehydrated.isLocal,false);

if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.4'")))) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:[2-9]|[1-9][0-9]+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
assert.ok(main.includes('export function changePermanentController'));
assert.ok(main.includes('expireTemporaryControlEffects'));
assert.ok(main.includes('removeControlEffectFromPermanent'));
assert.ok(main.includes('zoneForCardOwner'));
assert.ok(main.includes('cardOwnerIsLocal'));
assert.ok(main.includes('repairCombatLinksAfterControllerMove'));
assert.ok(main.includes('item.enteredThisTurn = true'), 'cambiar control reinicia reloj para man-lands/Vehículos');
assert.ok(main.includes('ownerIsLocal'));
assert.ok(stack.includes('stampPermanentController'));
assert.ok(stack.includes('stampCardOwner(tokenCard'));
assert.ok(stack.includes("effectToApply.type === 'gain_control'"));
assert.ok(stack.includes("effectToApply.type === 'gain_control_until_eot'"));
assert.ok(stack.includes('changePermanentController'));
assert.ok(turn.includes('expireTemporaryControlEffects'));
assert.ok(match.includes('controllerRole'));
assert.ok(match.includes('cardOwnerRole'));
assert.ok(ui.includes("effectType === 'gain_control'"));
assert.ok(texts.includes("'control.gained'"));
assert.ok(texts.includes("'control.returned'"));
assert.ok(texts.includes("'control.auraEnded'"));

const files=['tierras','artefactos','criaturas','instantaneos','conjuros','encantamientos','planeswalkers'];
const total=files.reduce((n,name)=>n+JSON.parse(fs.readFileSync(path.join(root,'assets','data',`${name}.json`),'utf8')).length,0);
assert.ok(total>=643,'cumulative source must preserve the historical 643-card pool from 23.15.2');
console.log('CONTROL_ENGINE_23_15_2_OK owner!=controller temporary+indefinite+source-bound combat-reset owner-zones multiplayer-descriptors historical-pool>=643');
