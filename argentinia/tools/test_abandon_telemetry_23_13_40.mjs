import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  startTelemetrySession,
  getTelemetryStatus,
  endTelemetrySession
} from '../js/telemetry.js';

// Regression real 23.13.39: getTelemetryStatus() intentaba llamar currentRelativeMs(),
// nombre inexistente, al abandonar una partida autenticada.
const id = startTelemetrySession({ mode: 'solo', deckLabel: 'qa' });
assert.ok(id, 'La sesión de Telemetría debe iniciar');
const status = getTelemetryStatus();
assert.equal(status.sessionId, id);
assert.equal(status.active, true);
assert.ok(Number.isFinite(status.elapsedMs), 'elapsedMs debe ser numérico y nunca lanzar ReferenceError');
assert.ok(status.elapsedMs >= 0, 'elapsedMs no puede ser negativo');
endTelemetrySession('qa');

// El callback de abandono debe blindar stats y meterlas dentro del deadline best-effort.
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const fnStart = main.indexOf('function recordLocalAbandonStatsBestEffort()');
const fnEnd = main.indexOf('\n}\n\nfunction hookGameplayButtons()', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'No se encontró recordLocalAbandonStatsBestEffort');
const fn = main.slice(fnStart, fnEnd + 2);
assert.match(fn, /try\s*\{/, 'Stats de abandono deben estar protegidas por try/catch');
assert.match(fn, /catch\s*\(err\)/, 'Stats de abandono deben absorber errores síncronos');
assert.match(fn, /Promise\.resolve\(null\)/, 'El fallback debe devolver una Promise segura');
assert.match(main, /cleanupTasks\.push\(recordLocalAbandonStatsBestEffort\(\)\)/,
  'La escritura de stats debe formar parte del cleanup limitado por deadline');
assert.match(main, /finally\s*\{[\s\S]*?endTelemetrySession\('abandon_local'\)[\s\S]*?location\.reload\(\)/,
  'La salida debe vivir en finally y no depender de ningún cleanup');
assert.match(main, /abandon_cleanup_exception/, 'Las excepciones de cleanup deben quedar registradas');
assert.doesNotMatch(main, /recordLocalAbandonStatsBestEffort\(\);\s*cleanupTasks\.push\(/,
  'No debe volver a quedar fire-and-forget antes del cleanup');

const telemetrySource = fs.readFileSync(new URL('../js/telemetry.js', import.meta.url), 'utf8');
assert.match(telemetrySource, /ABANDON_CLEANUP_EXCEPTION/, 'Telemetry debe convertir excepciones de abandono en bugCandidate');
console.log('ABANDON_TELEMETRY_23_13_40_OK');
