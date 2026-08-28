#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  roleSessionField,
  validateRoleSession,
  classifyReconnectSafety,
  syncRetryDelayMs,
  SYNC_RETRY_MAX_ATTEMPTS,
  SYNC_RECOVERY_RETRY_MS
} from '../js/multiplayerReliability.js';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};
const cases = Math.max(1, Math.floor(arg('cases', 5000)));

let supersededRejected = 0;
let newOwnerAccepted = 0;
let rivalUnaffected = 0;
let reconnectSafe = 0;
let reconnectRejected = 0;

for (let i = 0; i < cases; i++) {
  const oldHost = `mps_host_old_${i}`;
  const newHost = `mps_host_new_${i}`;
  const guest = `mps_guest_${i}`;
  const before = { hostSessionId: oldHost, guestSessionId: guest };
  assert.equal(validateRoleSession(before, 'host', oldHost).ok, true);

  // La nueva pestaña/dispositivo reclama el MISMO rol host. Desde ese instante el cliente
  // anterior queda fenced; guest no cambia y sigue siendo válido.
  const after = { ...before, [roleSessionField('host')]: newHost };
  if (!validateRoleSession(after, 'host', oldHost).ok) supersededRejected++;
  if (validateRoleSession(after, 'host', newHost).ok) newOwnerAccepted++;
  if (validateRoleSession(after, 'guest', guest).ok) rivalUnaffected++;

  const stable = classifyReconnectSafety({ consecutivePasses: 0 }, 'host');
  assert.equal(stable.ok, true); reconnectSafe++;

  const responderCanReturn = classifyReconnectSafety({
    pendingDecision: { requestId:`d_${i}`, forRole:'host', type:'choose' },
    decisionResponse: null
  }, 'host');
  assert.equal(responderCanReturn.ok, true); reconnectSafe++;

  const requesterLost = classifyReconnectSafety({
    pendingDecision: { requestId:`d_${i}`, forRole:'guest', type:'choose' },
    decisionResponse: null
  }, 'host');
  assert.equal(requesterLost.ok, false); reconnectRejected++;

  const ownResolutionLost = classifyReconnectSafety({
    multiplayerResolutionMarker: { authorityRole:'host', kind:'stack_resolution', stackId:`s_${i}` }
  }, 'host');
  assert.equal(ownResolutionLost.ok, false); reconnectRejected++;

  const rivalResolution = classifyReconnectSafety({
    multiplayerResolutionMarker: { authorityRole:'guest', kind:'stack_resolution', stackId:`s_${i}` }
  }, 'host');
  assert.equal(rivalResolution.ok, true); reconnectSafe++;

  const responsePending = classifyReconnectSafety({
    decisionResponse: { requestId:`d_${i}`, type:'choose' }
  }, 'host');
  assert.equal(responsePending.ok, false); reconnectRejected++;
}

assert.deepEqual([syncRetryDelayMs(1), syncRetryDelayMs(2), syncRetryDelayMs(3)], [300, 750, 1500]);
assert.equal(SYNC_RETRY_MAX_ATTEMPTS, 3);
assert.equal(SYNC_RECOVERY_RETRY_MS, 5000);

console.log(
  `MULTIPLAYER_HARDENING_LAB_23_19_1_OK cases=${cases} ` +
  `supersededRejected=${supersededRejected} newOwnerAccepted=${newOwnerAccepted} ` +
  `rivalUnaffected=${rivalUnaffected} reconnectSafe=${reconnectSafe} reconnectRejected=${reconnectRejected}`
);
