// js/economyClient.js — v23.19.5.4 Match Settlement + Admission Control Authority.
// Transporte único browser -> callable Functions. El cliente expresa INTENCIÓN; nunca
// construye receipts ni escribe directamente economyOperations.

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { ECONOMY_PROTOCOL_VERSION } from './version.js';

export const ECONOMY_FUNCTIONS_REGION = 'southamerica-east1';
export const ECONOMY_CLIENT_VERSION = ECONOMY_PROTOCOL_VERSION;

let functions = null;
let authRef = null;

export function configureEconomyClient(app, auth) {
  if (!app || !auth) throw new Error('ECONOMY_CLIENT_FIREBASE_REQUIRED');
  if (!functions) functions = getFunctions(app, ECONOMY_FUNCTIONS_REGION);
  authRef = auth;
  return functions;
}

function requireConfigured() {
  if (!functions || !authRef) throw new Error('ECONOMY_CLIENT_NOT_CONFIGURED');
  if (!authRef.currentUser?.uid) {
    const error = new Error('Tenés que iniciar sesión.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
}

function normalizeCallableError(error) {
  const argentiniaCode = error?.details?.code || error?.details?.details?.code || null;
  if (argentiniaCode) error.code = argentiniaCode;
  return error;
}

async function call(name, payload = {}) {
  requireConfigured();
  const callable = httpsCallable(functions, name);
  try {
    const response = await callable({
      ...payload,
      economyProtocolVersion: ECONOMY_PROTOCOL_VERSION
    });
    return response?.data;
  } catch (error) {
    throw normalizeCallableError(error);
  }
}

export function bootstrapOperationId(uid) {
  return `acctboot:${String(uid || '').trim()}`;
}

export function starterOperationId(uid) {
  return `starter:${String(uid || '').trim()}`;
}

export function createEconomyOperationId(prefix = 'op') {
  const safePrefix = String(prefix || 'op').replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 24) || 'op';
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${safePrefix}:${random}`.slice(0, 128);
}

export function getEconomyStatus() {
  return call('economyStatus');
}

export function bootstrapAccountServer(username, operationId = null) {
  const uid = authRef?.currentUser?.uid;
  return call('economyBootstrapAccount', {
    operationId: operationId || bootstrapOperationId(uid),
    username: String(username || '')
  });
}

export function completeStarterDeckServer(identity, operationId = null) {
  const uid = authRef?.currentUser?.uid;
  return call('economyCompleteStarterDeck', {
    operationId: operationId || starterOperationId(uid),
    identity: Array.isArray(identity) ? identity : []
  });
}


export function openPackServer(operationId = null) {
  return call('economyOpenPack', {
    operationId: operationId || createEconomyOperationId('pack')
  });
}

export function openGuaranteedMythicServer(operationId = null) {
  return call('economyOpenGuaranteedMythic', {
    operationId: operationId || createEconomyOperationId('mythic')
  });
}



export function getStorefrontServer() {
  return call('economyGetStorefront');
}

export function purchasePackServer(operationId = null) {
  return call('economyPurchasePack', {
    operationId: operationId || createEconomyOperationId('buy-pack')
  });
}

export function craftEnhancementServer(cardId, keyword, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('craft'),
    cardId: String(cardId || ''),
    keyword: String(keyword || '')
  });
}

export function purchasePrebuiltDeckServer(productId, deckName, operationId = null) {
  return call('economyPurchasePrebuiltDeck', {
    operationId: operationId || createEconomyOperationId('prebuilt'),
    productId: String(productId || ''),
    deckName: String(deckName || '')
  });
}

export function getClassifiedsServer() {
  return call('economyGetClassifieds');
}

export function purchaseClassifiedCardServer(cardId, operationId = null) {
  return call('economyPurchaseClassifiedCard', {
    operationId: operationId || createEconomyOperationId('classified'),
    cardId: String(cardId || '')
  });
}

export function renameUsernameServer(username, operationId = null) {
  return call('economyRenameUsername', {
    operationId: operationId || createEconomyOperationId('rename'),
    username: String(username || '')
  });
}


export function registerDailyLoginServer() {
  return call('economyRegisterDailyLogin');
}

export function claimDailyRewardServer(day, operationId = null) {
  return call('economyClaimDailyReward', {
    operationId: operationId || createEconomyOperationId('daily-claim'),
    day: Number(day)
  });
}

export function adminDailyDebugServer(mode) {
  return call('economyAdminDailyDebug', { mode: String(mode || '') });
}

export function getAdmissionStatusServer() {
  return call('economyGetAdmissionStatus');
}

export function adminSetAdmissionPolicyServer(policy = {}) {
  return call('economyAdminSetAdmissionPolicy', {
    registrationMode: String(policy.registrationMode || ''),
    maxRegisteredUsers: Number(policy.maxRegisteredUsers),
    maxRegistrationsPerDay: Number(policy.maxRegistrationsPerDay)
  });
}

export function matchRewardOperationId(receiptId) {
  const safe = String(receiptId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 105);
  return `match-reward:${safe}`.slice(0, 128);
}

export function settleMatchRewardServer(reward = {}, operationId = null) {
  return call('economySettleMatchReward', {
    operationId: operationId || matchRewardOperationId(reward.receiptId),
    receiptId: String(reward.receiptId || ''),
    mode: reward.mode === 'multiplayer' ? 'multiplayer' : 'solo',
    outcome: reward.outcome === 'loss' ? 'loss' : 'win',
    difficulty: reward.mode === 'multiplayer' ? null : String(reward.difficulty || ''),
    matchId: reward.mode === 'multiplayer' ? String(reward.matchId || '') : ''
  });
}

export function applyAbandonPenaltyServer({ mode = 'solo', matchId = '', operationId = null } = {}) {
  return call('economyApplyAbandonPenalty', {
    operationId: operationId || createEconomyOperationId('abandon'),
    mode: mode === 'multiplayer' ? 'multiplayer' : 'solo',
    matchId: mode === 'multiplayer' ? String(matchId || '') : ''
  });
}

export function recoverEconomyOperation(operationId) {
  return call('economyGetOperation', { operationId: String(operationId || '') });
}
