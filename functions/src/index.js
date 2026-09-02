import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from './shared/firestore.js';
import {
  ECONOMY_PROTOCOL_VERSION,
  ECONOMY_SCHEMA_VERSION,
  ENGINE_VERSION,
  FUNCTION_RUNTIME_OPTIONS
} from './shared/constants.js';
import { requireAuth, trustedProfileFields } from './shared/auth.js';
import { assertRateLimit } from './shared/rateLimit.js';
import { economyError, errorCode } from './shared/errors.js';
import { loadEconomyConfig, assertEconomyAvailable } from './economy/config.js';
import { runIdempotentOperation, readOwnOperation } from './economy/operationLedger.js';
import { bootstrapAccountTx, completeStarterDeckTx, normalizeStarterIdentity } from './economy/accounts.js';
import {
  createServerEntropy,
  generateTrustedPack,
  generateTrustedGuaranteedMythic,
  loadPackPolicy,
  loadPackCampaignEffects,
  openTrustedPackTx,
  openTrustedGuaranteedMythicTx
} from './economy/packs.js';
import { TRUSTED_CARD_POOL_FINGERPRINT } from './trusted/cardCatalog.js';

function requestData(request) {
  const data = request?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw economyError('INVALID_ECONOMY_REQUEST');
  return data;
}
function clientProtocol(data) {
  return String(data?.economyProtocolVersion || '');
}
function rejectForbidden(data, keys) {
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(data, key)) {
    throw economyError('INVALID_ECONOMY_REQUEST', { forbiddenField: key });
  }
}
function rejectUnknown(data, allowedKeys) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(data || {})) if (!allowed.has(key)) {
    throw economyError('INVALID_ECONOMY_REQUEST', { unknownField: key });
  }
}
function logFailure(name, auth, error) {
  logger.warn('Economy callable rejected', {
    function: name,
    uid: auth?.uid || null,
    appCheckPresent: auth?.appCheckPresent || false,
    code: errorCode(error)
  });
}

export const economyStatus = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  requestData(request);
  try {
    assertRateLimit(auth.uid, 'status', { limit: 60, windowMs: 60000 });
    const config = await loadEconomyConfig(db);
    return {
      ok: true,
      engineVersion: ENGINE_VERSION,
      economyProtocolVersion: ECONOMY_PROTOCOL_VERSION,
      economySchemaVersion: ECONOMY_SCHEMA_VERSION,
      minimumEconomyClientVersion: config.minimumEconomyClientVersion,
      mode: config.mode,
      enabled: config.enabled,
      appCheckPresent: auth.appCheckPresent,
      costSafety: { minInstances: 0, maxInstances: 1, concurrency: 10 },
      capabilities: { packAuthority: 'server', guaranteedMythicAuthority: 'server', operationRecovery: true },
      trustedPoolFingerprint: TRUSTED_CARD_POOL_FINGERPRINT
    };
  } catch (error) {
    logFailure('economyStatus', auth, error);
    throw error;
  }
});

export const economyBootstrapAccount = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'bootstrap', { limit: 30, windowMs: 60000 });
    rejectForbidden(data, ['uid','points','fichas','collection','decks','inventory','enhancements','starterCardIds','cardIds']);
    const username = String(data.username || '');
    const operationId = String(data.operationId || '');
    const opRequest = { username };
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid,
      operationId,
      type: 'account.bootstrap',
      request: opRequest,
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return bootstrapAccountTx({
          db,
          tx,
          uid: auth.uid,
          authProfile: trustedProfileFields(auth),
          usernameRaw: username
        });
      }
    });
    logger.info('Economy account bootstrap committed', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyBootstrapAccount', auth, error);
    throw error;
  }
});

export const economyCompleteStarterDeck = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'starter', { limit: 30, windowMs: 60000 });
    rejectForbidden(data, ['uid','points','fichas','collection','decks','inventory','enhancements','starterCardIds','cardIds']);
    const operationId = String(data.operationId || '');
    const identity = normalizeStarterIdentity(data.identity);
    const opRequest = { identity };
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid,
      operationId,
      type: 'account.complete_starter',
      request: opRequest,
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return completeStarterDeckTx({ db, tx, uid: auth.uid, operationId, identity });
      }
    });
    logger.info('Economy starter completed', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyCompleteStarterDeck', auth, error);
    throw error;
  }
});


export const economyOpenPack = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'pack-open', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','cardIds','cards','rarity','rareSlotRarity','mythicChance','fichasGain','inventory','collection']);
    rejectUnknown(data, ['operationId','economyProtocolVersion']);
    const operationId = String(data.operationId || '');
    const entropy = createServerEntropy();
    const [packPolicy, campaignEffects] = await Promise.all([
      loadPackPolicy(db),
      loadPackCampaignEffects(db)
    ]);
    const generated = generateTrustedPack({ seed: entropy.seed, mythicChance: packPolicy.mythicChance });
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid,
      operationId,
      type: 'chest.open_pack',
      request: {},
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return openTrustedPackTx({
          db, tx, uid: auth.uid, generated,
          entropyCommitment: entropy.commitment,
          campaignEffects, packPolicy
        });
      }
    });
    logger.info('Economy pack opened', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyOpenPack', auth, error);
    throw error;
  }
});

export const economyOpenGuaranteedMythic = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'mythic-open', { limit: 12, windowMs: 60000 });
    rejectForbidden(data, ['uid','cardId','cardIds','cards','rarity','mythicChance','inventory','collection']);
    rejectUnknown(data, ['operationId','economyProtocolVersion']);
    const operationId = String(data.operationId || '');
    const entropy = createServerEntropy();
    const cardId = generateTrustedGuaranteedMythic({ seed: entropy.seed });
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid,
      operationId,
      type: 'chest.open_guaranteed_mythic',
      request: {},
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return openTrustedGuaranteedMythicTx({
          db, tx, uid: auth.uid, cardId,
          entropyCommitment: entropy.commitment
        });
      }
    });
    logger.info('Economy guaranteed Mythic opened', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyOpenGuaranteedMythic', auth, error);
    throw error;
  }
});

export const economyGetOperation = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'operation-read', { limit: 60, windowMs: 60000 });
    const operation = await readOwnOperation(db, auth.uid, String(data.operationId || ''));
    return { ok: true, operation };
  } catch (error) {
    logFailure('economyGetOperation', auth, error);
    throw error;
  }
});
