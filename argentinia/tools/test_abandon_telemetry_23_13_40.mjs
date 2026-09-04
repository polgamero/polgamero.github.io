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

// El callback de abandono sigue blindado por deadline, pero desde 23.19.5.5 las stats
// y el receipt terminal nacen del MISMO settlement server-side. El browser no debe volver
// a competir con la Function escribiendo playerStats/playerGameReceipts.
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
assert.doesNotMatch(main, /function recordLocalAbandonStatsBestEffort\(/,
  '23.19.5.5 elimina la escritura cliente de stats de abandono');
assert.doesNotMatch(main, /cleanupTasks\.push\(recordLocalAbandonStatsBestEffort\(\)\)/,
  'El cleanup no debe lanzar una transacción cliente paralela contra playerStats');
assert.match(main, /applyAbandonPenalty\(state\.currentUser\.uid,[\s\S]*?receiptId: abandonReceiptId,[\s\S]*?durationMs: abandonDurationMs/,
  'El settlement server-side debe recibir receipt durable + duración de diagnóstico');
assert.match(main, /Promise\.race\(\[settle, deadline\]\)/,
  'El cleanup mantiene el deadline para que la UI nunca quede congelada');
assert.match(main, /finally\s*\{[\s\S]*?endTelemetrySession\('abandon_local'\)[\s\S]*?location\.reload\(\)/,
  'La salida debe vivir en finally y no depender de ningún cleanup');
assert.match(main, /abandon_cleanup_exception/, 'Las excepciones de cleanup deben quedar registradas');

const impl = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
assert.match(impl, /PENDING_ABANDON_PENALTIES_KEY/, 'La penalidad debe tener journal durable');
assert.match(impl, /flushPendingAbandonPenalties/, 'El próximo login debe poder reintentar la penalidad exactly-once');

const telemetrySource = fs.readFileSync(new URL('../js/telemetry.js', import.meta.url), 'utf8');
assert.match(telemetrySource, /ABANDON_CLEANUP_EXCEPTION/, 'Telemetry debe convertir excepciones de abandono en bugCandidate');
console.log('ABANDON_TELEMETRY_23_13_40_OK');
