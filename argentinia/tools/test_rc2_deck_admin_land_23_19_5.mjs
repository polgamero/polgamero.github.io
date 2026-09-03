import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECK_INTELLIGENCE_VERSION,
  buildCompetitiveDeck,
  getArchetypeDefinition,
  inferCardDeckProfile,
  validateCompetitiveDeck
} from '../js/deckIntelligence.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION, ECONOMY_PROTOCOL_VERSION } from '../js/version.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const repoRoot=path.resolve(root,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const json=(p)=>JSON.parse(read(p));
const cards=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers'].flatMap(k=>json(`assets/data/${k}.json`));
function seeded(seed){ let x=seed>>>0; return()=>{ x=(Math.imul(x,1664525)+1013904223)>>>0; return x/4294967296; }; }

assert.equal(ENGINE_VERSION,'23.19.5.4');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(ECONOMY_PROTOCOL_VERSION,'econ-23.19.5.4');
assert.equal(DECK_INTELLIGENCE_VERSION,'23.19.5-di2');
assert.equal(cards.length,880);

// 1) Deck Composition Hardening: un artefacto utilitario ya no satisface `threat` sólo por
// ser permanente. Un Vehículo sí es amenaza, pero existe un piso separado de criaturas reales.
const utilityArtifact=cards.find(c=>String(c.type||'').includes('Artefacto') && !String(c.type||'').includes('Criatura') && !String(c.type||'').includes('Vehículo'));
assert.ok(utilityArtifact,'real pool must contain a non-creature utility artifact');
assert.ok(!inferCardDeckProfile(utilityArtifact).roles.includes('threat'),`${utilityArtifact.id} must not count as threat just for being a permanent`);
const vehicle=cards.find(c=>String(c.type||'').includes('Vehículo'));
assert.ok(vehicle,'real pool must contain a Vehicle');
const vehicleProfile=inferCardDeckProfile(vehicle);
assert.ok(vehicleProfile.roles.includes('threat') && vehicleProfile.roles.includes('vehicle'));
assert.equal(vehicleProfile.isCreature,false,'Vehicle needs real crew and does not satisfy creature floor');

const forcedCases=[
  ['aggro',['R']], ['tempo',['U','R']], ['midrange',['B','G']], ['control',['W','U']],
  ['tokens',['G','W']], ['counters',['G','W']], ['sacrifice',['B','R']], ['graveyard',['B','G']],
  ['exile',['R']], ['typal',['G','W']], ['artifacts',['W']], ['spells',['U','R']],
  ['suspend',['U','R']], ['transform',['G']], ['ramp',['G']]
];
let builtCount=0;
for (let i=0;i<forcedCases.length;i++) {
  const [archetypeId,identity]=forcedCases[i];
  const def=getArchetypeDefinition(archetypeId);
  const built=buildCompetitiveDeck(cards,identity,{archetypeId,quality:'strong',rng:seeded(23195000+i),candidateCount:12,goldfishIterations:12});
  assert.ok(validateCompetitiveDeck(built.deck,identity).ok,`${archetypeId} ${identity.join('/')} must remain legal`);
  assert.ok(built.report.creatureCount>=def.creatureFloor,`${archetypeId} creature floor ${built.report.creatureCount}/${def.creatureFloor}`);
  assert.ok(built.report.vehicleCount<=def.maxVehicles,`${archetypeId} vehicle cap ${built.report.vehicleCount}/${def.maxVehicles}`);
  assert.equal(built.report.creatureFloor,def.creatureFloor);
  assert.equal(built.report.maxVehicles,def.maxVehicles);
  builtCount++;
}

// Real Tano profiles must also preserve structural floors when the archetype is auto-selected.
for (const [q,seed] of [['good',5101],['strong',5102],['elite',5103]]) {
  for (const identity of [['W'],['U','R'],['B','G']]) {
    const built=buildCompetitiveDeck(cards,identity,{quality:q,rng:seeded(seed+identity.join('').length),candidateCount:12,goldfishIterations:12});
    assert.ok(built.report.creatureCount>=built.report.creatureFloor,`${q} ${identity.join('/')} auto deck creature floor`);
    assert.ok(built.report.vehicleCount<=built.report.maxVehicles,`${q} ${identity.join('/')} auto deck vehicle cap`);
    builtCount++;
  }
}

// Frontend and server-trusted Deck Intelligence must be byte-identical so a future starter
// cannot diverge from the same structural contract.
const frontendDeck=read('js/deckIntelligence.js');
const trustedDeck=fs.readFileSync(path.join(repoRoot,'functions/src/trusted/deckIntelligence.js'),'utf8');
assert.equal(frontendDeck,trustedDeck,'frontend/trusted Deck Intelligence parity');

// 2) Admin Instant-Open: hidden panes must not be eagerly mounted/fetched.
const ui=read('js/ui.js');
const gameTextsAdmin=read('js/gameTextsAdmin.js');
assert.ok(ui.includes('let gameTextsAdminPane = null;'));
assert.ok(ui.includes('function ensureGameTextsAdminPane()'));
assert.ok(ui.includes("if (key === 'messages') void ensureAdminMessageUsers();"));
assert.ok(ui.includes("if (key === 'campaigns') ensureAdminCampaignsPane();"));
assert.ok(!ui.includes("mountAdminCampaignsPane(overlay.querySelector('#admin-campaigns-root'), { currentUser: state.currentUser });"),'campaigns must not mount eagerly');
assert.ok(gameTextsAdmin.includes('const catalogByKey = new Map(catalog.map(item => [item.key, item]));'),'Game Text rows must use O(1) lookup');
assert.equal((gameTextsAdmin.match(/getGameTextCatalog\(\)/g)||[]).length,2,'Game Text render/reset may build catalog once; never once per row');
assert.ok(!/\n\s*render\(\);\n\s*return \{ element: root, load/.test(gameTextsAdmin),'Game Text pane must not render on construction');

// 3) Animated-land UX: legal self-payment remains allowed, but user gets a warning before tap.
const main=read('js/main.js');
const texts=read('js/gameTexts.js');
assert.ok(main.includes("pendingAbility?.ability?.effect?.type === 'animate_land'"));
assert.ok(main.includes("window.confirm(gameText('land.animate.selfManaWarning'"));
assert.ok(texts.includes("'land.animate.selfManaWarning': definition("));

console.log(`PASS test_rc2_deck_admin_land_23_19_5.mjs · builds=${builtCount} · Deck floors/Vehicle caps + Admin lazy/O(N) + animated-land self-pay warning · frontend/trusted parity`);
