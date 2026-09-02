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
import {
  storefrontSnapshot, loadCommerceCampaignEffects, purchasePackTx, craftEnhancementTx,
  purchasePrebuiltTx, getClassifiedsView, purchaseClassifiedTx, renameUsernameTx
} from './economy/commerce.js';

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
      capabilities: {
        packAuthority: 'server', guaranteedMythicAuthority: 'server', operationRecovery: true,
        storePurchaseAuthority: 'server', craftAuthority: 'server', prebuiltAuthority: 'server',
        classifiedsAuthority: 'server', usernameRenameAuthority: 'server'
      },
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


export const economyGetStorefront = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'storefront-read', { limit: 60, windowMs: 60000 });
    rejectUnknown(data, ['economyProtocolVersion']);
    const config = await loadEconomyConfig(db);
    assertEconomyAvailable(config, clientProtocol(data));
    return { ok: true, storefront: await storefrontSnapshot(db) };
  } catch (error) {
    logFailure('economyGetStorefront', auth, error);
    throw error;
  }
});

export const economyPurchasePack = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'pack-purchase', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','points','fichas','baseCost','cost','effectiveCost','inventory','collection','campaign']);
    rejectUnknown(data, ['operationId','economyProtocolVersion']);
    const operationId = String(data.operationId || '');
    const campaignEffects = await loadCommerceCampaignEffects(db);
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid, operationId, type: 'store.purchase_pack', request: {},
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return purchasePackTx({ db, tx, uid: auth.uid, campaignEffects });
      }
    });
    logger.info('Economy pack purchased', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyPurchasePack', auth, error);
    throw error;
  }
});

export const economyCraftEnhancement = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'craft-enhancement', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','fichas','fichaCost','cost','collection','enhancements']);
    rejectUnknown(data, ['operationId','economyProtocolVersion','cardId','keyword']);
    const operationId = String(data.operationId || '');
    const cardId = String(data.cardId || '');
    const keyword = String(data.keyword || '');
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid, operationId, type: 'store.craft_enhancement', request: { cardId, keyword },
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return craftEnhancementTx({ db, tx, uid: auth.uid, cardId, keyword });
      }
    });
    logger.info('Economy enhancement crafted', { uid: auth.uid, operationId, cardId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyCraftEnhancement', auth, error);
    throw error;
  }
});

export const economyPurchasePrebuiltDeck = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'prebuilt-purchase', { limit: 12, windowMs: 60000 });
    rejectForbidden(data, ['uid','points','fichas','pointsCost','fichasCost','collection','decks','cardIds','cardsGranted']);
    rejectUnknown(data, ['operationId','economyProtocolVersion','productId','deckName']);
    const operationId = String(data.operationId || '');
    const productId = String(data.productId || '');
    const deckName = String(data.deckName || '');
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid, operationId, type: 'store.purchase_prebuilt', request: { productId, deckName },
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return purchasePrebuiltTx({ db, tx, uid: auth.uid, productId, deckName, operationId });
      }
    });
    logger.info('Economy prebuilt purchased', { uid: auth.uid, operationId, productId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyPurchasePrebuiltDeck', auth, error);
    throw error;
  }
});

export const economyGetClassifieds = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'classifieds-read', { limit: 60, windowMs: 60000 });
    rejectUnknown(data, ['economyProtocolVersion']);
    const config = await loadEconomyConfig(db);
    assertEconomyAvailable(config, clientProtocol(data));
    return { ok: true, offer: await getClassifiedsView(db, auth.uid, Date.now()) };
  } catch (error) {
    logFailure('economyGetClassifieds', auth, error);
    throw error;
  }
});

export const economyPurchaseClassifiedCard = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'classified-purchase', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','points','fichas','pointsCost','fichasCost','rarity','collection','weekKey']);
    rejectUnknown(data, ['operationId','economyProtocolVersion','cardId']);
    const operationId = String(data.operationId || '');
    const cardId = String(data.cardId || '');
    const nowMs = Date.now();
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid, operationId, type: 'store.purchase_classified', request: { cardId },
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return purchaseClassifiedTx({ db, tx, uid: auth.uid, cardId, nowMs });
      }
    });
    logger.info('Economy classified purchased', { uid: auth.uid, operationId, cardId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyPurchaseClassifiedCard', auth, error);
    throw error;
  }
});

export const economyRenameUsername = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'username-rename', { limit: 12, windowMs: 60000 });
    rejectForbidden(data, ['uid','usernameKey','fichas','fichaCost','cost']);
    rejectUnknown(data, ['operationId','economyProtocolVersion','username']);
    const operationId = String(data.operationId || '');
    const username = String(data.username || '');
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid, operationId, type: 'account.rename_username', request: { username },
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return renameUsernameTx({ db, tx, uid: auth.uid, usernameRaw: username });
      }
    });
    logger.info('Economy username renamed', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyRenameUsername', auth, error);
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
