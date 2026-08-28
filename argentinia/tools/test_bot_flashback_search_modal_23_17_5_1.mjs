import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const bot = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const telemetry = fs.readFileSync(new URL('../js/telemetry.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

assert.equal(ENGINE_VERSION, '23.17.5.2');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.75');

const graveStart = bot.indexOf('async function tryFlashbackOrEscapeFromBotGraveyard()');
const graveEnd = bot.indexOf('// Elegir un valor de X', graveStart);
assert.ok(graveStart >= 0 && graveEnd > graveStart, 'No se encontró la ruta de Flashback/Escape del Tano.');
const grave = bot.slice(graveStart, graveEnd);
assert.match(grave, /addToStack\(castStackItem\)[\s\S]*state\.priorityPlayer = 'local';[\s\S]*state\.consecutivePasses = 0;[\s\S]*render\(\);[\s\S]*return true;/,
  'Flashback/Escape del Tano debe renderizar al entregar prioridad al humano.');

// Auditoría global: cualquier ruta del bot que entregue prioridad al humano debe refrescar
// el DOM antes de retornar; evita que otra vía repita el stall silencioso de Flashback.
const handoffMatches = [...bot.matchAll(/state\.priorityPlayer\s*=\s*'local'/g)];
assert.ok(handoffMatches.length >= 10, 'Se esperaban múltiples handoffs de prioridad del bot.');
for (const match of handoffMatches) {
  const window = bot.slice(match.index, match.index + 420);
  assert.match(window, /render\(\)/, `Handoff del bot sin render cerca de offset ${match.index}.`);
}

assert.match(main, /let soloGameplayReady = false;/);
assert.match(main, /const finishSetup = \(\) => \{\s*soloGameplayReady = true;/);
assert.match(main, /isSoloGameplayReady: \(\) => soloGameplayReady/);
assert.match(telemetry, /const gameplayReady = typeof providers\.isSoloGameplayReady === 'function'/);
assert.match(telemetry, /if \(!gameplayReady\) \{\s*resetBotPriorityWatchdogWindow\(\);\s*return;/);

assert.match(ui, /overflow-x: auto; overflow-y: hidden;/, 'Los selectores de cartas deben contener overflow horizontal.');
assert.match(ui, /scrollbar-width: thin;/);
assert.match(ui, /document\.addEventListener\('wheel',[\s\S]*row\.scrollLeft \+= event\.deltaY;/,
  'La rueda vertical de desktop debe mover horizontalmente el selector.');
assert.match(ui, /Math\.abs\(dx\) < 7/);
assert.match(ui, /suppressSelectionClickUntil/, 'El drag no debe seleccionar una carta accidentalmente.');
assert.match(ui, /event\.pointerType === 'touch'/, 'Touch debe conservar pan-x nativo.');

console.log('BOT_FLASHBACK_SEARCH_MODAL_23_17_5_1_OK flashbackHandoff=render watchdog=mulligan-safe selectors=horizontal-wheel-drag-mobile');
