import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { keywordReminder } from '../js/cardTextFormatter.js';

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const telemetry = fs.readFileSync(new URL('../js/telemetry.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const combat = fs.readFileSync(new URL('../js/combatRules.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const creatures = JSON.parse(fs.readFileSync(new URL('../assets/data/criaturas.json', import.meta.url), 'utf8'));

assert.equal(ENGINE_VERSION, '23.19.4.15');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');

// RCA real turno 26: tras cerrar un efecto interactivo, el driver COMPLETO del bot debe
// reactivarse. checkRivalCounterOrResponse() solo no es suficiente porque no pasa prioridad.
const resumeStart = main.indexOf('export async function resumeAfterInteractiveEffect()');
const resumeEnd = main.indexOf('export function resolveSpellDirect', resumeStart);
assert.ok(resumeStart >= 0 && resumeEnd > resumeStart, 'No se encontró resumeAfterInteractiveEffect.');
const resume = main.slice(resumeStart, resumeEnd);
assert.match(resume, /state\.priorityPlayer = state\.activePlayer;/);
assert.match(resume, /resetPriorityClock\('interactive_effect_finished'\)/);
assert.match(resume, /render\(\);/);
assert.match(resume, /state\.priorityPlayer === 'rival'[\s\S]*takeBotPriorityAction\(\)/,
  'Al devolver prioridad al Tano tras un modal debe reactivarse su loop completo.');
assert.doesNotMatch(resume, /checkRivalCounterOrResponse\(\);/,
  'El resume interactivo no debe volver al helper parcial que produjo el stall.');

// El watchdog no debe acusar stall mientras el humano ordena triggers u otra decisión
// reglamentaria sin prioridad.
assert.match(telemetry, /'pendingLegendChoice', 'pendingTriggerOrderChoice', 'pendingSuspendTransaction'/);
assert.match(telemetry, /'pendingCastTransaction', 'pendingAlternativeCostChoice', 'pendingPrivateZoneChoice'/);
assert.match(telemetry, /'pendingUntapLandChoice', 'pendingKickerChoice', 'pendingEscapeExileChoice', 'pendingRampChoice'/);

// Suspend: Cancelar/ESC debe reconocer la transacción especial y deshacer pago parcial.
const cancelStart = main.indexOf('export function cancelPayment()');
const cancelEnd = main.indexOf('// LAND 4', cancelStart);
const cancel = main.slice(cancelStart, cancelEnd);
assert.match(cancel, /if \(state\.pendingSuspendTransaction\)[\s\S]*clearSuspendPaymentState\(\{ rollback: true \}\)[\s\S]*suspend\.cancelled[\s\S]*render\(\)/);
assert.match(main, /function clearSuspendPaymentState\(\{rollback=true\}[\s\S]*restorePaymentManaSources\(\)[\s\S]*restoreManaPaymentSnapshot\(\)/);
assert.match(ui, /e\.key === 'Escape' && \(state\.pendingSuspendTransaction/,
  'ESC debe seguir enrutando Suspend hacia cancelPayment.');

// Amenaza: reminder visible + bitácora específica, sin depender del ambiguo illegalReset.
assert.equal(keywordReminder('menace'), 'Esta criatura no puede ser bloqueada excepto por dos o más criaturas.');
assert.match(combat, /const menaceViolations = \[\]/);
assert.match(combat, /gameText\('combat\.block\.menaceIllegal',[\s\S]*count: blockersCount/);
assert.match(texts, /Bloqueo cancelado: \{attacker\} tiene Intimidante[\s\S]*Intimidante exige 2 o más bloqueadores/);

// Orden de triggers: no exponer enums internos; mostrar texto de la carta, procedencia y
// botones de flecha accesibles.
const eternal = creatures.find(c => c.id === 'crea_021');
assert.equal(eternal?.text, 'Siempre que muera una criatura, Anticipá 1.');
assert.match(ui, /function triggerOrderDescription\(entry = \{\}\)[\s\S]*entry\.sourceCard\?\.text/);
assert.match(ui, /any_creature_dies: \/muera una criatura/);
assert.match(ui, /trigger-order-event/);
assert.match(ui, /trigger\.order\.eventOwn/);
assert.match(ui, /trigger\.order\.eventRival/);
assert.match(ui, /class="trigger-order-arrow"[\s\S]*>↑<\/button>/);
assert.match(ui, /class="trigger-order-arrow"[\s\S]*>↓<\/button>/);
assert.match(css, /\.trigger-order-row/);
assert.match(css, /\.trigger-order-arrow/);

// DFC: fallback pequeño y tooltip fuera del clipping CSS mediante title nativo.
assert.match(ui, /class="card-art-fallback"/);
assert.match(css, /\.card-art-fallback[\s\S]*font-size:clamp\(14px, 9cqw, 32px\)/);
assert.match(ui, /class="dfc-face-badge" title=/);
assert.doesNotMatch(ui, /class="dfc-face-badge" data-tooltip=/);
assert.doesNotMatch(css, /\.dfc-face-badge\[data-tooltip\]:hover::after/);

console.log('TANO_INTERACTIVE_SUSPEND_RULES_UX_23_17_5_2_OK resume=bot-loop watchdog=human-pending suspend=cancel menace=explained triggers=human dfc=contained');
