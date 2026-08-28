// js/startingPlayer.js — Entrega 23.13.52
// Sorteo binario compartido por Solitario y Multiplayer. No toca estado ni DOM.

import { gameRandom } from './gameRng.js';

export function secureCoinBit() {
  try {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.getRandomValues) {
      const value = new Uint32Array(1);
      cryptoObj.getRandomValues(value);
      return value[0] & 1;
    }
  } catch {}
  return Math.random() < 0.5 ? 0 : 1;
}

export function chooseSoloStartingSide() {
  return gameRandom('solo_starting_player') < 0.5 ? 'local' : 'rival';
}

export function chooseMultiplayerStartingRole() {
  return secureCoinBit() === 0 ? 'host' : 'guest';
}

export function normalizeStartingRole(value, fallback = 'host') {
  return value === 'guest' || value === 'host' ? value : fallback;
}

export function startingSideForRole(startingRole, myRole) {
  const role = normalizeStartingRole(startingRole);
  if (myRole !== 'host' && myRole !== 'guest') throw new Error('INVALID_MULTIPLAYER_ROLE');
  return role === myRole ? 'local' : 'rival';
}
