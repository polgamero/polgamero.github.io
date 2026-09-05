import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPermanentTypes, isLandPermanent, isCreaturePermanent, isBasicLandCard, isNonbasicLandPermanent, landMatchesFilter } from '../js/permanentTypes.js';

const basic = { card:{ type:'Tierra básica — Bosque', name:'Bosque' } };
const nonbasic = { card:{ type:'Tierra — Bosque', name:'Dual' } };
const animated = { card:{ type:'Tierra', name:'Manland' }, isAnimatedLand:true, permanentTypes:['land','creature'], animatedBasePower:2, animatedBaseToughness:3 };
assert.equal(isLandPermanent(basic), true);
assert.equal(isBasicLandCard(basic), true);
assert.equal(isNonbasicLandPermanent(basic), false);
assert.equal(isNonbasicLandPermanent(nonbasic), true);
assert.deepEqual(new Set(getPermanentTypes(animated)), new Set(['land','creature']));
assert.equal(isCreaturePermanent(animated), true);
assert.equal(landMatchesFilter(basic,'basic'), true);
assert.equal(landMatchesFilter(nonbasic,'nonbasic'), true);
assert.equal(landMatchesFilter(nonbasic,'subtype:Bosque'), true);

const lands = JSON.parse(fs.readFileSync(new URL('../assets/data/tierras.json', import.meta.url),'utf8'));
const names=['Puente Alsina','Refugio Jakob','Viñedo de la Luna Muerta'];
for (const name of names) {
  const card=lands.find(c=>c.name===name);
  assert.ok(card, name);
  assert.equal(card.activatedAbility?.effect?.type,'animate_land', `${name} debe usar animate_land`);
  assert.equal(card.activatedAbility?.timing,'instant', `${name} debe usar timing instant`);
  assert.ok(Number.isFinite(card.activatedAbility.effect.power));
  assert.ok(Number.isFinite(card.activatedAbility.effect.toughness));
}
assert.equal(lands.some(c=>c.activatedAbility?.effect?.type==='crew_vehicle'), false, 'ninguna Tierra debe seguir hackeada como Vehículo');

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../js/ui.js',import.meta.url),'utf8');
const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../js/matchSync.js',import.meta.url),'utf8');
const turns=fs.readFileSync(new URL('../js/turnManager.js',import.meta.url),'utf8');
const telemetry=fs.readFileSync(new URL('../js/telemetry.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../js/version.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../build-manifest.json',import.meta.url),'utf8'));

assert.ok(main.includes('export function animateLandPermanent'));
assert.ok(main.includes("permanentTypes = ['land', 'creature']"));
assert.ok(main.includes('enteredThisTurn: true, permanentTypes: [\'land\']'));
assert.ok(main.includes("targetObj.type === 'land'"));
assert.ok(main.includes('export function handleLandTargetClick'));
assert.ok(ui.includes("effect.targetKind === 'land'") || ui.includes("effect.targetKind === 'land'"));
assert.ok(ui.includes('rules.allowLocalLand'));
assert.ok(ui.includes('displayType = publicCardTypeLine(itemObj.isAnimatedLand'));
assert.ok(stack.includes("effectToApply.type === 'animate_land'"));
assert.ok(sync.includes("if (type === 'land') return 'lands'"));
assert.ok(sync.includes("if (targetObj.type === 'land')"));
assert.ok(turns.includes('revertAnimatedLandState(item)'));
assert.ok(turns.includes('detachEquipmentFrom(item, isLocalLand)'));
assert.ok(telemetry.includes("'isAnimatedLand'"));
const versionMatch = version.match(/ENGINE_VERSION = '(\d+)\.(\d+)(?:\.(\d+))?(?:\.\d+)?'/);
assert.ok(versionMatch);
const versionTuple = versionMatch.slice(1).map(v => Number(v || 0));
assert.ok(versionTuple[0] > 23 || (versionTuple[0] === 23 && (versionTuple[1] > 14 || (versionTuple[1] === 14 && versionTuple[2] >= 2))), 'LAND 1 requiere engine 23.14.2 o posterior');
assert.match(manifest.engineVersion,/^23\.(?:14\.(?:[2-9]|\d{2,})|1[5-7]\.\d+(?:\.\d+)?|18(?:\.\d+)?|19(?:\.\d+){1,2}|[2-9]\d\.\d+(?:\.\d+)?)$/);
assert.equal(manifest.firestoreRulesVersion,'23.13.80');
console.log('LAND_ENGINE_23_14_2_OK targets=land basic/nonbasic manlands=animate_land dualIdentity=land+creature sickness=tracked cleanup=eot multiplayer=serialized');
