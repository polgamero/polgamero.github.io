import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { applyPhyrexianLifeToCost } from '../js/costEngine.js';
import { isStackObjectReservedByBotCounter } from '../js/botTargetReservation.js';

assert.equal(ENGINE_VERSION, '23.19.4.14');
assert.equal(ENGINE_PROTOCOL_VERSION, 'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');
const manifest=JSON.parse(fs.readFileSync(new URL('../build-manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.engineVersion,'23.19.4.14');
assert.equal(manifest.pool,880);

// Repro mínimo del log real: Cobertura #34 ya está cubierta por Pará Ahí #35.
const cobertura={id:34,isLocal:true,type:'instant',card:{name:'Cobertura de Guardia'}};
const paraAhi1={id:35,isLocal:false,type:'instant',card:{name:'Pará Ahí',effect:{type:'counter_instant'}},targetObj:{type:'stack',stackId:34}};
const isCounterSpell=(card)=>String(card?.effect?.type||'').startsWith('counter');
assert.equal(isStackObjectReservedByBotCounter(cobertura,[cobertura,paraAhi1],{isCounterSpell}),true,'un segundo counter propio no debe quemarse sobre el mismo stackId');
const otra={id:99,isLocal:true,type:'instant',card:{name:'Otra respuesta'}};
assert.equal(isStackObjectReservedByBotCounter(otra,[cobertura,paraAhi1,otra],{isCounterSpell}),false);
const humanCounter={id:36,isLocal:true,type:'instant',card:{name:'Counter humano',effect:{type:'counter_instant'}},targetObj:{type:'stack',stackId:35}};
assert.equal(isStackObjectReservedByBotCounter(cobertura,[cobertura,paraAhi1,humanCounter],{isCounterSpell}),false,'si el primer counter está siendo contrarrestado, su cobertura deja de ser segura');

// Phyrexian CR 107.4f: {1}{G}{G/P} pagando el G/P con vida conserva {1}{G} y cuesta 2 vidas.
const phy=applyPhyrexianLifeToCost({W:0,U:0,B:0,R:0,G:1,C:0,generic:1,phyrexian:['G']},[0]);
assert.deepEqual(phy.cost,{W:0,U:0,B:0,R:0,G:1,C:0,generic:1});
assert.equal(phy.life,2);
assert.deepEqual(phy.paidSymbols,['G']);

const ui=fs.readFileSync(new URL('../js/ui.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const bot=fs.readFileSync(new URL('../js/bot.js',import.meta.url),'utf8');
const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const texts=fs.readFileSync(new URL('../js/gameTexts.js',import.meta.url),'utf8');

assert.match(bot,/legalBotCounterTargets\(c\.effect\.type\)/);
assert.doesNotMatch(bot,/topLocalSpell = \[\.\.\.spellStack\]\.reverse\(\)\.find\(s => s\.isLocal && isStackItemLegalCounterTarget/);
assert.match(ui,/index !== null && index !== undefined && state\.pendingBlockerIndex === index/,'index=null no puede convertirse en selected-blocker');
assert.match(ui,/proliferate\.selectionCount/);
assert.match(ui,/classList\?\.remove\('selected-blocker'.*'blocking'\)/s);
assert.match(ui,/mulligan-card-slot\.chosen[\s\S]*!important/);
assert.match(texts,/Las Crónicas con contadores de Capítulo también son válidas/);
assert.match(stack,/Amplificar \(CR 701\.34\)/);
assert.match(texts,/2 vidas cada uno/);
assert.match(texts,/Elegir vida reemplaza sólo ese símbolo/);
assert.match(ui,/phyrexianLifeReserved/);
assert.match(ui,/sagaRomanDisplay/);
assert.match(css,/\.saga-chapter-pill-label[\s\S]*place-items:center/);
assert.match(ui,/max-width: 1600px/);
assert.match(ui,/admin-debug-table black-box-table/);
assert.match(ui,/<th>Jugadores<\/th>/);
assert.match(ui,/installAdminDebugScrollInteractions/);
assert.match(ui,/\.black-box-table th:last-child \{ position:sticky; right:0/);

console.log('GAMEPLAY_SEMANTIC_UX_HARDENING_23_19_3_OK counterReservation=PASS phyrexian=CR107.4f+UX proliferate=CR701.34+selection sagaPills=PASS blackBox=wide+drag+stickyLog pool=880 rules=23.13.79 protocol=mp-23.19.2');
