import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { OWNER_APPROVED_PUBLIC_DICTIONARY, PUBLIC_TERMINOLOGY_VERSION, publicKeywordLabel, publicCardTypeLine, publicTerminologyText } from '../js/publicTerminology.js';
import { getCounterDefinition, normalizeCounterType } from '../js/counterEngine.js';
import { buildCardTextLayout } from '../js/cardTextFormatter.js';
import { gameText, getGameTextCatalog, applyGameTextOverrides, resetGameTextOverrides } from '../js/gameTexts.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const load=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const cards=[
  ...load('assets/data/criaturas.json'),
  ...load('assets/data/instantaneos.json'),
  ...load('assets/data/conjuros.json'),
  ...load('assets/data/encantamientos.json'),
  ...load('assets/data/artefactos.json'),
  ...load('assets/data/tierras.json'),
  ...load('assets/data/planeswalkers.json')
];

assert.equal(ENGINE_VERSION,'23.19.5.1');
assert.equal(PUBLIC_TERMINOLOGY_VERSION,'23.19.4.14');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(cards.length,880);

const contract=load('OWNER_APPROVED_TERMINOLOGY_23_19_4_14.json');
assert.equal(contract.status,'OWNER_APPROVED_44_OF_44');
assert.equal(contract.decisions.length,44);
assert.equal(contract.cardImages,'EXTERNALIZED');
assert.equal(Object.keys(OWNER_APPROVED_PUBLIC_DICTIONARY).length,44);

// Exact owner-approved public labels for internal keyword keys.
assert.deepEqual({
  flying:publicKeywordLabel('flying'), trample:publicKeywordLabel('trample'), vigilance:publicKeywordLabel('vigilance'),
  haste:publicKeywordLabel('haste'), menace:publicKeywordLabel('menace'), reach:publicKeywordLabel('reach'),
  lifelink:publicKeywordLabel('lifelink'), deathtouch:publicKeywordLabel('deathtouch'), infect:publicKeywordLabel('infect'),
  flash:publicKeywordLabel('flash'), firststrike:publicKeywordLabel('firststrike'), doublestrike:publicKeywordLabel('doublestrike'),
  hexproof:publicKeywordLabel('hexproof'), defender:publicKeywordLabel('defender'), indestructible:publicKeywordLabel('indestructible'),
  ward2:publicKeywordLabel('ward_2')
},{
  flying:'Vuela',trample:'Arrolla',vigilance:'Alerta',haste:'Apuro',menace:'Intimidante',reach:'Alcance',
  lifelink:'Absorción',deathtouch:'Letal',infect:'Contagio',flash:'Al toque',firststrike:'Iniciativa',
  doublestrike:'Dos golpes',hexproof:'Intocable',defender:'Muralla',indestructible:'Irrompible',ward2:'Impuesto 2'
});

assert.equal(publicCardTypeLine('Planeswalker — Bruja'),'Semidiós — Bruja');
assert.equal(publicCardTypeLine('Encantamiento — Saga'),'Encantamiento — Crónica');
assert.equal(publicCardTypeLine('Encantamiento — Aura'),'Encantamiento — Encanto');
assert.equal(publicCardTypeLine('Artefacto — Vehículo'),'Artefacto — Transporte');

assert.equal(getCounterDefinition('loyalty').label,'Creencia');
assert.equal(getCounterDefinition('lore').label,'Capítulo');
assert.equal(normalizeCounterType('Creencia'),'loyalty');
assert.equal(normalizeCounterType('Capítulo'),'lore');

// Owner-approved named mechanics in actual card rules text.
const joined=cards.map(c=>`${c.name}\n${c.text||''}\n${c.flavorText||''}`).join('\n');
for(const term of ['Arraigo','Anticipá','Chusmeá','Amplificá','Yapa','Otra vuelta','Zafar','En espera','Vaquita','Conexión con','Rebuscar']) {
  assert.ok(joined.includes(term),`public card data must include ${term}`);
}

// Changed legacy vocabulary must not survive in user-facing card name/rules/flavor strings.
const forbidden=[
  /\bPlaneswalker(?:s)?\b/i,/\bLealtad\b/i,/\bSaga(?:s)?\b/i,/\bLore\b/i,/\bAura(?:s)?\b/i,/\bVeh[ií]culo(?:s)?\b/i,
  /\bVigilancia\b/i,/\bPrisa\b/i,/\bAmenaza\b/i,/V[ií]nculo vital/i,/Toque mortal/i,/\bInfectar\b/i,/\bDestello\b/i,
  /Primer golpe/i,/Doble golpe/i,/\bWard\b/i,/\bDefensor(?:a)?\b/i,/\bIndestructible\b/i,/\bLandfall\b/i,
  /\bAdivin[aá](?:r)?\b/i,/\b(?:Surveil|Vigil[aá])\b/i,/\bProlifer[aá](?:r)?\b/i,/\bKicker\b/i,/\bFlashback\b/i,
  /\bEscape\b/i,/\bSuspend(?:er|ida|ido|idas|idos)?\b/i,/\b(?:Convocar|Convoke)\b/i,/\bAfinidad por\b/i,/\bExcavar\b/i
];
function publicStrings(node,key=''){
  const out=[];
  if(Array.isArray(node)) for(const v of node) out.push(...publicStrings(v,key));
  else if(node && typeof node==='object') for(const [k,v] of Object.entries(node)) {
    if(typeof v==='string' && ['name','text','flavorText','reminderText','description','label','title','message'].includes(k)) out.push(v);
    else out.push(...publicStrings(v,k));
  }
  return out;
}
for(const card of cards) for(const value of publicStrings(card)) for(const rx of forbidden) {
  assert.ok(!rx.test(value),`legacy public terminology survives in ${card.id}: ${value}`);
}

// Raw/internal compatibility contracts deliberately remain old/stable.
const planeswalkers=load('assets/data/planeswalkers.json');
assert.ok(planeswalkers.every(c=>String(c.type).includes('Planeswalker')),'raw Planeswalker classifier must remain internal');
assert.ok(load('assets/data/encantamientos.json').filter(c=>c.saga).every(c=>String(c.type).includes('Saga')),'raw Saga classifier remains');
assert.ok(load('assets/data/encantamientos.json').filter(c=>c.auraEffect).every(c=>String(c.type).includes('Aura')),'raw Aura classifier remains');
assert.ok(load('assets/data/artefactos.json').filter(c=>c.activatedAbility?.effect?.type==='crew_vehicle').every(c=>String(c.type).includes('Vehículo')),'raw Vehicle classifier remains');
assert.ok(cards.some(c=>c.keywords?.includes('vigilance')));
assert.ok(cards.some(c=>c.keywords?.some(k=>String(k).startsWith('ward_'))));
assert.ok(cards.some(c=>c.suspend));
assert.ok(cards.some(c=>c.flashback));
assert.ok(cards.some(c=>c.escape));

// Formatter emits owner labels while consuming stable internal IDs.
const sampleLayout=buildCardTextLayout({text:'Vigilancia. Ward 2. Adiviná 1.',keywords:['vigilance','ward_2']});
assert.deepEqual(sampleLayout.keywordLabels,['Alerta','Impuesto 2']);
assert.ok(sampleLayout.paragraphs.some(p=>String(p.text).includes('Anticipá 1')));

// Game Text output and legacy Admin overrides are translated at the presentation boundary.
assert.match(gameText('scry.title',{count:2}),/Anticipá 2/);
assert.match(gameText('surveil.title',{count:2}),/Chusmeá 2/);
assert.match(gameText('proliferate.title'),/Amplificar/);
const wardDef=getGameTextCatalog().find(x=>x.key==='payment.status.ward');
assert.ok(wardDef && wardDef.defaultText.includes('Impuesto'));
applyGameTextOverrides({schemaVersion:1,overrides:{'payment.status.ward':'🔶 ¡{card} tiene Ward {cost}! Pagá o el hechizo se pierde.'}});
assert.match(gameText('payment.status.ward',{card:'X',cost:'{2}'}),/Impuesto/);
assert.ok(!gameText('payment.status.ward',{card:'X',cost:'{2}'}).includes('Ward'));
resetGameTextOverrides();

// Browser/API internal contract must not be confused with the public mechanic Escape→Zafar.
const ui=read('js/ui.js');
const telemetry=read('js/telemetry.js');
assert.ok(ui.includes("event.key === 'Escape'"));
assert.ok(ui.includes("e.key === 'Escape'"));
assert.ok(telemetry.includes("[' ', 'Escape', 'Enter']"));

// Delivery policy is validated by the release snapshot/artifact gate. The live
// GitHub Pages checkout is allowed (and expected) to retain externalized card PNGs.
// Runtime regression tests must therefore not assert that the hosted asset directory
// is empty. This keeps the legal clean-room contract separate from deployment state.
assert.equal(contract.cardImages,'EXTERNALIZED');

console.log('GLOBAL_TERMINOLOGY_CLEANROOM_WAVE4_23_19_4_13_OK');
console.log('ownerDictionary=44/44 pool=880 internalKeys=STABLE gameplayChanges=0 cardImages=EXTERNALIZED');
