import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../js/matchSync.js', import.meta.url), 'utf8');
const stack = fs.readFileSync(new URL('../js/stackManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
const artifacts = JSON.parse(fs.readFileSync(new URL('../assets/data/artefactos.json', import.meta.url), 'utf8'));

const crewCards = artifacts.filter(card => {
  const abilities = Array.isArray(card.activatedAbilities) ? card.activatedAbilities : (card.activatedAbility ? [card.activatedAbility] : []);
  return abilities.some(ab => ab?.crewCost !== undefined);
});
assert.equal(crewCards.length, 10, 'se esperaban los 10 Vehículos históricos con Crew');
for (const card of crewCards) {
  const abilities = Array.isArray(card.activatedAbilities) ? card.activatedAbilities : [card.activatedAbility];
  const crew = abilities.find(ab => ab?.crewCost !== undefined);
  assert.equal(crew.timing, 'instant', `${card.name}: Crew debe usar timing instant`);
  assert.equal(crew.effect?.type, 'crew_vehicle', `${card.name}: conserva efecto crew_vehicle`);
}

assert.match(main, /const intrinsicSorceryOnly = ability\.effect\?\.type === 'attach_equipment'/, 'Crew no debe quedar en el guard sorcery-only');
assert.doesNotMatch(main, /intrinsicSorceryOnly = ability\.crewCost/, 'Crew no debe seguir marcado intrinsicSorcery');
assert.match(main, /startCrewing\(source\.item, source\.isLocal, ability, source\.abilityIndex\)/, 'Crew inicia pago desde el pipeline normal de habilidad');
assert.match(main, /type: 'ability',[\s\S]{0,250}abilityKind: 'own',[\s\S]{0,400}type:'crew_vehicle'/, 'confirmCrew debe crear una habilidad real de Stack');
assert.match(main, /addToStack\(stackItem\);[\s\S]{0,180}state\.pendingCrew = null;[\s\S]{0,180}flushDeferredLandManaTriggers\(\)/, 'Crew debe entrar primero a Stack y luego liberar triggers del coste');
assert.match(main, /state\.pendingAbilitySource \|\| state\.pendingCrew \|\| state\.pendingWardChoice/, 'eventos por taps de Crew se difieren durante el pago');

const confirmStart = main.indexOf('export function confirmCrew()');
const cancelStart = main.indexOf('export function cancelCrew()', confirmStart);
const confirmBlock = main.slice(confirmStart, cancelStart);
assert.doesNotMatch(confirmBlock, /combatZone\.push|originZone\.splice/, 'confirmCrew no debe convertir el Vehicle inmediatamente');

assert.match(stack, /effectToApply\.type === 'crew_vehicle'[\s\S]{0,1800}loc\.combat\.push\(sourceItem\)/, 'crew_vehicle debe convertir al resolver en stackManager');
assert.match(stack, /alreadyCombat && sourceItem\?\.isVehicle/, 'activar Crew varias veces debe resolver sin duplicar el permanente');
assert.match(stack, /summoningSickness = !!sourceItem\.enteredThisTurn && !hasKeyword\(sourceItem, 'haste'\)/, 'Crew respeta reloj continuo y Prisa al resolver');

assert.match(bot, /type:'ability',[\s\S]{0,220}abilityKind:'own',[\s\S]{0,320}type:'crew_vehicle'/, 'Tano también debe poner Crew en la Stack');
assert.doesNotMatch(bot.slice(bot.indexOf('function tryBotCrewVehicle'), bot.indexOf('// Punto 12: mismo contrato', bot.indexOf('function tryBotCrewVehicle'))), /state\.rivalCombat\.push\(removed\)/, 'Tano no debe transformar el Vehicle inmediatamente');
assert.match(texts, /'crew\.activated'/, 'texto visible para activación de Crew');
assert.match(texts, /'effect\.crew\.done'/, 'texto visible para resolución de Crew');

assert.doesNotMatch(main, /powerSoFar\s*>=\s*pc\.required[\s\S]{0,120}confirmCrew\s*\(/, 'Crew no debe auto-confirmar al llegar al mínimo: es legal sobre-tripular');
assert.match(ui, /btnConfirmCrew[\s\S]{0,500}state\.pendingCrew\.powerSoFar < state\.pendingCrew\.required/, 'UI debe ofrecer Confirmar Tripular y deshabilitarlo bajo el mínimo');
assert.ok(indexHtml.includes('id="btn-confirm-crew"'), 'HTML debe incluir botón explícito Confirmar Tripular');
assert.match(ui, /btnConfirmCrew\.addEventListener\('click', confirmCrew\)/, 'botón Crew debe comprometer el coste explícitamente');
assert.match(ui, /e\.key === 'Escape'[\s\S]{0,180}state\.pendingCrew/, 'Escape debe cancelar selección de Crew');
assert.match(texts, /'payment\.button\.crew'/, 'texto visible del botón Confirmar Tripular');
assert.match(main, /if \(item === pc\.item\)[\s\S]{0,160}crew\.selfNotAllowed/, 'un Vehicle no puede pagar su propio Crew');
assert.match(ui, /itemObj !== state\.pendingCrew\.item/, 'UI no debe resaltar el Vehicle fuente como tripulante');
assert.match(bot, /filter\(c => c !== vehicleItem && !c\.tapped\)/, 'Tano tampoco puede usar el Vehicle como su propio tripulante');
assert.match(sync, /sourceItemRef = serializeBoardItemRef\(item\?\.sourceItem/, 'Stack multiplayer debe serializar referencia estable a sourceItem');
assert.match(sync, /item\.sourceItem = deserializeBoardItemRef\(wire\.sourceItemRef/, 'Stack multiplayer debe rehidratar sourceItem antes de resolver Crew');

assert.match(workflow, /regression_legacy_23_(?:15|16|17)_[0-9_]+\.zip/, 'CI debe usar archive histórico 23.15.5.4');
assert.match(workflow, /ci_regression_manifest_23_(?:15|16|17)_[0-9_]+\.txt/, 'CI debe usar manifest 23.15.5.5');
assert.ok(fs.readFileSync(new URL('./ci_regression_manifest_23_17_3_1.txt', import.meta.url),'utf8').includes('test_crew_timing_23_15_5_4.mjs'), 'Crew debe seguir en la regresión histórica activa');

console.log('PASS test_crew_timing_23_15_5_4');
