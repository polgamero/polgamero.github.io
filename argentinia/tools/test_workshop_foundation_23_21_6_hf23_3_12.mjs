import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkshopLayout, DEFAULT_WORKSHOP_LAYOUT, workshopMachineAsset } from '../js/workshop.js';
import { getDefaultGameConfig, WORKSHOP_POLICY } from '../js/store.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=path.resolve(__dirname,'..');
const repo=path.resolve(app,'..');
const ui=fs.readFileSync(path.join(app,'js','ui.js'),'utf8');
const texts=fs.readFileSync(path.join(app,'js','gameTexts.js'),'utf8');
const client=fs.readFileSync(path.join(app,'js','economyClient.js'),'utf8');
const impl=fs.readFileSync(path.join(app,'js','firebaseClientImpl.js'),'utf8');
const functionsIndex=fs.readFileSync(path.join(repo,'functions','src','index.js'),'utf8');
const commerce=fs.readFileSync(path.join(repo,'functions','src','economy','commerce.js'),'utf8');
const admin=fs.readFileSync(path.join(repo,'functions','src','economy','admin.js'),'utf8');
const audit=fs.readFileSync(path.join(repo,'functions','src','economy','audit.js'),'utf8');
const config=getDefaultGameConfig();

// Economy/config defaults: only Generador is player-available in Point 5.
assert.equal(config.workshopEnabled,true);
assert.equal(config.workshopMachine1Available,true);
assert.equal(config.workshopMachine1UnlockPoints,1000);
assert.equal(config.workshopMachine1UnlockFichas,0);
assert.equal(config.workshopMachine2Available,false);
assert.equal(config.workshopMachine2UnlockPoints,2000);
assert.equal(config.workshopMachine2UnlockFichas,20);
assert.equal(config.workshopMachine3Available,false);
assert.equal(config.workshopMachine3UnlockPoints,3000);
assert.equal(config.workshopMachine3UnlockFichas,50);
assert.equal(WORKSHOP_POLICY.machine1.points,1000);

// Layout is normalized and machine art keeps canonical filenames.
const layout=normalizeWorkshopLayout({machines:{machine1:{xPct:999,yPct:-999,widthPct:999}}});
assert.deepEqual(layout.machines.machine1,{xPct:120,yPct:-20,widthPct:60});
assert.deepEqual(normalizeWorkshopLayout(null).machines.machine2,DEFAULT_WORKSHOP_LAYOUT.machines.machine2);
for(let i=1;i<=4;i++) assert.equal(workshopMachineAsset(`machine${i}`),`maquina${i}.png`);

// Player surface: full workshop image + account access; Store no longer advertises enhancement crafting.
assert.match(ui,/id="menu-workshop"/);
assert.match(ui,/menu_taller\.png/);
assert.match(ui,/showWorkshopScreen/);
assert.match(ui,/showEnhancementCraftScreen/);
assert.doesNotMatch(ui,/store-market-item store-market-craft/);
assert.match(ui,/showWorkshopScreen\(\(\) => showChestScreen\(onBack\), \{ autoOpenMachine1: true \}\)/);

// Admin-only editor: four preview unlock checks, pencils, pointer drag, wheel zoom, persisted gameConfig\/workshop.
assert.match(ui,/data-workshop-preview/);
assert.match(ui,/admin-workshop-pencil/);
assert.match(ui,/addEventListener\('pointermove'/);
assert.match(ui,/addEventListener\('wheel'/);
assert.match(ui,/saveAdminGameConfigDocument\('workshop'/);
assert.match(ui,/gameText\('admin\.workshop\.selected'/);
const playerWorkshopSection=ui.slice(ui.indexOf('export function showWorkshopScreen'),ui.indexOf('function injectMyDecksStyles'));
assert.doesNotMatch(playerWorkshopSection,/admin-workshop-pencil|data-workshop-preview/,'pencil/preview controls must never leak into player workshop');

// All new player/admin labels are Game Text-backed.
for(const key of ['account.workshop','workshop.title','workshop.machine1.title','workshop.machine2.title','workshop.machine3.title','workshop.machine4.title','admin.tab.workshop','admin.gifts.title','admin.gifts.guaranteedMythic']) assert.ok(texts.includes(`'${key}'`),`missing Game Text ${key}`);

// Server authority: unlock is multiplexed through existing craft callable, preserving 42 Functions.
assert.equal([...functionsIndex.matchAll(/export const \w+\s*=\s*onCall\(/g)].length,42);
assert.match(functionsIndex,/action === 'unlockWorkshopMachine'/);
assert.match(functionsIndex,/type:'workshop\.unlock_machine'/);
assert.match(client,/call\('economyCraftEnhancement',[\s\S]*action: 'unlockWorkshopMachine'/);
assert.match(impl,/runEconomyActionAuthority\(uid, 'workshopUnlock'/);
assert.match(audit,/case 'workshop\.unlock_machine'/);

// Craft is not merely relocated visually: server requires the unlocked Generador.
assert.match(commerce,/profile\?\.workshop\?\.unlockedMachines\?\.machine1 !== true/);
assert.match(commerce,/CRAFT_WORKSHOP_LOCKED/);

// Moderation gift extension is real inventory authority, not a UI-only selector.
assert.match(admin,/GRANT_KINDS=new Set\(\['points','fichas','standardPacks','guaranteedMythics'\]\)/);
assert.match(admin,/kind==='guaranteedMythics'/);
assert.match(ui,/value="guaranteedMythics"/);
assert.match(ui,/value="essence" disabled/);

console.log('WORKSHOP_FOUNDATION_23_21_6_HF23_3_12_OK machine1=SERVER_UNLOCK_1000P craft=MIGRATED+LOCKED adminLayout=DRAG+WHEEL+SAVE preview=ADMIN_ONLY gifts=MYTHIC functions=42');
