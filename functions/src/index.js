import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from './shared/firestore.js';
import {
  ECONOMY_PROTOCOL_VERSION,
  ECONOMY_SCHEMA_VERSION,
  ENGINE_VERSION,
  FUNCTION_RUNTIME_OPTIONS,
  ADMIN_EMAIL
} from './shared/constants.js';
import { requireAuth, trustedProfileFields } from './shared/auth.js';
import { assertRateLimit } from './shared/rateLimit.js';
import { economyError, errorCode } from './shared/errors.js';
import { loadEconomyConfig, assertEconomyAvailable } from './economy/config.js';
import { runIdempotentOperation, readOwnOperation } from './economy/operationLedger.js';
import { bootstrapAccountTx, completeStarterDeckTx, normalizeStarterIdentity } from './economy/accounts.js';
import { prepareAdmissionObservation, getAdmissionStatus, setAdmissionPolicyAdmin, ADMISSION_MODES } from './economy/admission.js';
import { loadMatchCampaignEffects, normalizeMatchRewardRequest, sealMultiplayerOutcomeServer, settleMatchRewardTx, ensureMatchResultStats, applyAbandonPenaltyTx, ensureAbandonSettlementEvidence, normalizeGameRewardReceiptId } from './economy/matches.js';
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
  loadDailyCampaignEffects, registerDailyLoginTx, claimDailyRewardTx, adminDailyDebugTx
} from './economy/daily.js';
import {
  storefrontSnapshot, loadCommerceCampaignEffects, purchasePackTx, craftEnhancementTx,
  purchasePrebuiltTx, getClassifiedsView, purchaseClassifiedTx, renameUsernameTx
} from './economy/commerce.js';
import { recordAuthorityAudit } from './economy/audit.js';
import { deriveSoloAbandonReceiptId, normalizeAbandonDurationMs } from './economy/matchCore.js';
import { normalizeAdminGrantRequest, adminGrantTx, advanceBulkGrantJob, readBulkGrantJob, adminSyncPlayerStats, adminRepairSoloRewardTx } from './economy/admin.js';

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

function isAdminAuth(auth) {
  return String(auth?.token?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

function logFailure(name, auth, error) {
  logger.warn('Economy callable rejected', {
    function: name,
    uid: auth?.uid || null,
    appCheckPresent: auth?.appCheckPresent || false,
    code: errorCode(error)
  });
}

async function finalizeAuthorityAudit({ auth, operationId, type, outcome, metadata = {} }) {
  // Always attempt the idempotent audit, including operation-ledger replays. If the
  // canonical mutation committed but the first response/audit side effect was interrupted,
  // retrying the same operationId backfills the missing event/stats without double counting.
  if (outcome?.result) {
    await recordAuthorityAudit(db, { uid: auth.uid, actorUid: auth.uid, operationId, type, result: outcome.result, metadata });
  }
  return outcome;
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
        classifiedsAuthority: 'server', usernameRenameAuthority: 'server',
        dailyRewardsAuthority: 'server', dailyClockAuthority: 'server', dailyClaimRecovery: true,
        matchSettlementAuthority: 'server', pvpAntiFarmAuthority: 'server',
        registrationAdmissionAuthority: 'server', adminEconomyAuthority: 'server',
        economicStatisticsAuthority: 'server', immutableAuditAuthority: 'server'
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
    // El aggregate count es una observación trusted. El contador transaccional serializa
    // el último cupo para impedir oversubscription cuando llegan altas simultáneas.
    const admissionObservation = await prepareAdmissionObservation(db);
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
          usernameRaw: username,
          admissionObservation
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
    await finalizeAuthorityAudit({ auth, operationId, type:'chest.open_pack', outcome });
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
    await finalizeAuthorityAudit({ auth, operationId, type:'chest.open_guaranteed_mythic', outcome });
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
    await finalizeAuthorityAudit({ auth, operationId, type:'store.purchase_pack', outcome });
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
    await finalizeAuthorityAudit({ auth, operationId, type:'store.craft_enhancement', outcome });
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
    await finalizeAuthorityAudit({ auth, operationId, type:'store.purchase_prebuilt', outcome });
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
    await finalizeAuthorityAudit({ auth, operationId, type:'store.purchase_classified', outcome });
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
    await finalizeAuthorityAudit({ auth, operationId, type:'account.rename_username', outcome });
    logger.info('Economy username renamed', { uid: auth.uid, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyRenameUsername', auth, error);
    throw error;
  }
});


export const economyRegisterDailyLogin = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'daily-login', { limit: 30, windowMs: 60000 });
    rejectForbidden(data, ['uid','nowMs','date','day','streak','dailyRewards','points','fichas','inventory','rewardDebugOffsetDays']);
    rejectUnknown(data, ['economyProtocolVersion']);
    const config = await loadEconomyConfig(db);
    assertEconomyAvailable(config, clientProtocol(data));
    const serverNowMs = Date.now();
    const result = await db.runTransaction(tx => registerDailyLoginTx({
      db, tx, uid: auth.uid, serverNowMs, isAdmin: isAdminAuth(auth)
    }));
    logger.info('Economy daily login registered', { uid: auth.uid, newCalendarLogin: !!result.login?.newCalendarLogin, appCheckPresent: auth.appCheckPresent });
    return { ok: true, result };
  } catch (error) {
    logFailure('economyRegisterDailyLogin', auth, error);
    throw error;
  }
});

export const economyClaimDailyReward = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'daily-claim', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','nowMs','date','streak','dailyRewards','points','fichas','inventory','rewards','amount','campaign']);
    rejectUnknown(data, ['operationId','economyProtocolVersion','day']);
    const operationId = String(data.operationId || '');
    const day = Number(data.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) throw economyError('DAILY_REWARD_INVALID');
    const serverNowMs = Date.now();
    const campaignEffects = await loadDailyCampaignEffects(db, serverNowMs);
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid, operationId, type: 'daily.claim', request: { day },
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return claimDailyRewardTx({
          db, tx, uid: auth.uid, day, serverNowMs,
          isAdmin: isAdminAuth(auth), campaignEffects
        });
      }
    });
    await finalizeAuthorityAudit({ auth, operationId, type:'daily.claim', outcome });
    logger.info('Economy daily reward claimed', { uid: auth.uid, day, operationId, replayed: outcome.replayed, appCheckPresent: auth.appCheckPresent });
    return { ok: true, ...outcome };
  } catch (error) {
    logFailure('economyClaimDailyReward', auth, error);
    throw error;
  }
});

export const economyAdminDailyDebug = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'daily-debug', { limit: 40, windowMs: 60000 });
    rejectForbidden(data, ['uid','nowMs','date','day','streak','dailyRewards','points','fichas','inventory','rewardDebugOffsetDays']);
    rejectUnknown(data, ['economyProtocolVersion','mode']);
    if (!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    const mode = String(data.mode || '');
    if (!['advance','reset'].includes(mode)) throw economyError('DAILY_DEBUG_MODE_INVALID');
    const config = await loadEconomyConfig(db);
    assertEconomyAvailable(config, clientProtocol(data));
    const serverNowMs = Date.now();
    const result = await db.runTransaction(tx => adminDailyDebugTx({ db, tx, uid: auth.uid, mode, serverNowMs }));
    logger.info('Economy daily admin debug updated', { uid: auth.uid, mode, offset: result.rewardDebugOffsetDays, appCheckPresent: auth.appCheckPresent });
    return { ok: true, result };
  } catch (error) {
    logFailure('economyAdminDailyDebug', auth, error);
    throw error;
  }
});



// ---------------------------------------------------------------------------
// v23.19.5.4 — Admission Control (Admin) + Match Settlement Authority.
// ---------------------------------------------------------------------------
export const economyGetAdmissionStatus = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'admission-status', { limit: 30, windowMs: 60000 });
    rejectUnknown(data, ['economyProtocolVersion']);
    if (!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    return { ok: true, status: await getAdmissionStatus(db) };
  } catch (error) {
    logFailure('economyGetAdmissionStatus', auth, error);
    throw error;
  }
});

export const economyAdminSetAdmissionPolicy = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'admission-admin-set', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','registeredUsers','registrationsToday','availableSlots','dailySlotsRemaining','dayKey']);
    rejectUnknown(data, ['economyProtocolVersion','registrationMode','maxRegisteredUsers','maxRegistrationsPerDay']);
    if (!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    const registrationMode = String(data.registrationMode || '');
    if (!Object.values(ADMISSION_MODES).includes(registrationMode)) throw economyError('INVALID_ECONOMY_REQUEST', { field:'registrationMode' });
    const maxRegisteredUsers = Number(data.maxRegisteredUsers);
    const maxRegistrationsPerDay = Number(data.maxRegistrationsPerDay);
    if (!Number.isFinite(maxRegisteredUsers) || !Number.isFinite(maxRegistrationsPerDay) || maxRegisteredUsers < 0 || maxRegistrationsPerDay < 0) {
      throw economyError('INVALID_ECONOMY_REQUEST', { field:'admissionLimits' });
    }
    const status = await setAdmissionPolicyAdmin({ db, registrationMode, maxRegisteredUsers, maxRegistrationsPerDay });
    logger.info('Registration admission policy updated', { uid:auth.uid, registrationMode:status.registrationMode, maxRegisteredUsers:status.maxRegisteredUsers, maxRegistrationsPerDay:status.maxRegistrationsPerDay });
    return { ok:true, status };
  } catch (error) {
    logFailure('economyAdminSetAdmissionPolicy', auth, error);
    throw error;
  }
});

export const economySettleMatchReward = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'match-settlement', { limit: 20, windowMs: 60000 });
    rejectForbidden(data, ['uid','baseDelta','effectiveDelta','requestedEffectiveDelta','points','fichas','limits','campaign','myRole','winnerRole','terminalKind','completedTurns']);
    rejectUnknown(data, ['operationId','economyProtocolVersion','receiptId','mode','outcome','difficulty','matchId','durationMs']);
    const operationId = String(data.operationId || '');
    const rewardRequest = normalizeMatchRewardRequest(data);
    // durationMs is stat-only client evidence for Solo and is intentionally OUTSIDE the
    // operation request digest, preserving replay compatibility with 23.19.5.4 ledgers.
    const clientDurationMs = rewardRequest.mode === 'solo' ? normalizeAbandonDurationMs(data.durationMs) : 0;
    if (rewardRequest.mode === 'multiplayer') {
      // El servidor congela primero endedAt/terminalKind/winnerRole. El settlement posterior
      // consume exclusivamente esa evidencia sellada y nunca el resultado declarado por UI.
      await sealMultiplayerOutcomeServer(db, auth.uid, rewardRequest.matchId);
    }
    const campaignEffects = await loadMatchCampaignEffects(db);
    const outcome = await runIdempotentOperation(db, {
      uid: auth.uid,
      operationId,
      type: 'match.settle_reward',
      request: rewardRequest,
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return settleMatchRewardTx({ db, tx, uid: auth.uid, request:rewardRequest, campaignEffects, clientDurationMs });
      }
    });
    await ensureMatchResultStats({ db, uid:auth.uid, request:rewardRequest, result:outcome?.result||{}, clientDurationMs });
    await finalizeAuthorityAudit({ auth, operationId, type:'match.settle_reward', outcome, metadata:{ receiptId:rewardRequest.receiptId, mode:rewardRequest.mode, matchId:rewardRequest.matchId||null } });
    logger.info('Economy match reward settled', { uid:auth.uid, operationId, receiptId:rewardRequest.receiptId, mode:rewardRequest.mode, replayed:outcome.replayed, appCheckPresent:auth.appCheckPresent });
    return { ok:true, ...outcome };
  } catch (error) {
    logFailure('economySettleMatchReward', auth, error);
    throw error;
  }
});

export const economyApplyAbandonPenalty = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request);
  const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'abandon-penalty', { limit: 12, windowMs: 60000 });
    rejectForbidden(data, ['uid','points','delta','abandonPenalty','settings','myRole']);
    // receiptId/durationMs are accepted for the 23.19.5.5 client, but deliberately excluded
    // from the operation digest below so a 23.19.5.4 ledger entry remains replay-compatible.
    rejectUnknown(data, ['operationId','economyProtocolVersion','mode','matchId','receiptId','durationMs']);
    const operationId = String(data.operationId || '');
    const mode = data.mode === 'multiplayer' ? 'multiplayer' : (data.mode === 'solo' ? 'solo' : null);
    if (!mode) throw economyError('ABANDON_MODE_INVALID');
    const matchId = mode === 'multiplayer' ? String(data.matchId || '').trim().toUpperCase() : '';
    if (mode === 'multiplayer' && !matchId) throw economyError('MATCH_REWARD_MATCH_REQUIRED');
    const derivedReceiptId = mode === 'solo' ? deriveSoloAbandonReceiptId(operationId, auth.uid) : '';
    const requestedReceiptId = mode === 'solo' ? normalizeGameRewardReceiptId(data.receiptId) : '';
    if (mode === 'solo' && requestedReceiptId && derivedReceiptId && requestedReceiptId !== derivedReceiptId) {
      throw economyError('ABANDON_RECEIPT_CONFLICT', { requestedReceiptId, derivedReceiptId });
    }
    const receiptId = mode === 'solo' ? (requestedReceiptId || derivedReceiptId) : '';
    if (mode === 'solo' && !receiptId) throw economyError('ABANDON_RECEIPT_REQUIRED');
    const durationMs = normalizeAbandonDurationMs(data.durationMs);
    const outcome = await runIdempotentOperation(db, {
      uid:auth.uid, operationId, type:'match.abandon_penalty',
      // IMPORTANT: v23.19.5.4 used exactly this digest shape. Keep it stable through rollout.
      request:{ mode, matchId },
      execute: async tx => {
        const config = await loadEconomyConfig(db, tx);
        assertEconomyAvailable(config, clientProtocol(data));
        return applyAbandonPenaltyTx({ db, tx, uid:auth.uid, operationId, mode, matchId, receiptId, durationMs });
      }
    });
    // If the operation ledger was created by 23.19.5.4, runIdempotentOperation replays its
    // old result without executing schema-6 writes. Backfill only evidence/stats/audit here;
    // points are never mutated by this compatibility path. Fresh 23.19.5.5 operations no-op.
    if (outcome.replayed && (!outcome.result?.receiptId || outcome.result?.terminalKind !== 'abandon')) {
      await ensureAbandonSettlementEvidence(db, {
        uid:auth.uid, operationId, mode, matchId, receiptId, durationMs, result:outcome.result
      });
    }
    logger.info('Economy abandon penalty applied', { uid:auth.uid, operationId, mode, matchId:matchId||null, receiptId:receiptId||null, replayed:outcome.replayed, appCheckPresent:auth.appCheckPresent });
    return { ok:true, ...outcome };
  } catch (error) {
    logFailure('economyApplyAbandonPenalty', auth, error);
    throw error;
  }
});


// ---------------------------------------------------------------------------
// v23.19.5.5 — Admin Economy + Statistics / Immutable Audit Authority.
// ---------------------------------------------------------------------------
export const economyAdminGrant = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth = requireAuth(request); const data = requestData(request);
  try {
    assertRateLimit(auth.uid, 'admin-grant', { limit: 40, windowMs: 60000 });
    rejectUnknown(data, ['operationId','economyProtocolVersion','targetUid','kind','amount','reason']);
    if (!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    const operationId=String(data.operationId||''), grant=normalizeAdminGrantRequest(data);
    const outcome=await runIdempotentOperation(db,{uid:auth.uid,operationId,type:'admin.grant',request:grant,execute:async tx=>{
      const config=await loadEconomyConfig(db,tx); assertEconomyAvailable(config,clientProtocol(data));
      return adminGrantTx({db,tx,adminUid:auth.uid,operationId,...grant});
    }});
    logger.info('Admin economy grant committed',{adminUid:auth.uid,targetUid:grant.targetUid,kind:grant.kind,operationId,replayed:outcome.replayed});
    return {ok:true,...outcome};
  } catch(error){logFailure('economyAdminGrant',auth,error);throw error;}
});

export const economyAdminBulkGrant = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth=requireAuth(request); const data=requestData(request);
  try {
    assertRateLimit(auth.uid,'admin-bulk-grant',{limit:20,windowMs:60000});
    rejectUnknown(data,['economyProtocolVersion','jobId','kind','amount','reason']);
    if(!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    const kind=String(data.kind||''),amount=Math.floor(Number(data.amount)||0),reason=String(data.reason||'').trim().slice(0,240),jobId=String(data.jobId||'');
    const config=await loadEconomyConfig(db); assertEconomyAvailable(config,clientProtocol(data));
    const job=await advanceBulkGrantJob(db,{adminUid:auth.uid,jobId,kind,amount,reason});
    return {ok:true,job};
  } catch(error){logFailure('economyAdminBulkGrant',auth,error);throw error;}
});

export const economyAdminGetBulkGrant = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth=requireAuth(request); const data=requestData(request);
  try {
    assertRateLimit(auth.uid,'admin-bulk-grant-read',{limit:60,windowMs:60000});
    rejectUnknown(data,['economyProtocolVersion','jobId']); if(!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    return {ok:true,job:await readBulkGrantJob(db,{adminUid:auth.uid,jobId:String(data.jobId||'')})};
  } catch(error){logFailure('economyAdminGetBulkGrant',auth,error);throw error;}
});

export const economyAdminRepairGameReward = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth=requireAuth(request); const data=requestData(request);
  try {
    assertRateLimit(auth.uid,'admin-reward-repair',{limit:20,windowMs:60000});
    rejectUnknown(data,['economyProtocolVersion','targetUid','receiptId','telemetrySessionId','reason']); if(!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    const targetUid=String(data.targetUid||'').trim(),receiptId=String(data.receiptId||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,240),telemetrySessionId=String(data.telemetrySessionId||'').trim();
    if(!targetUid||!receiptId||!telemetrySessionId) throw economyError('ADMIN_REWARD_REPAIR_INVALID_REQUEST');
    const config=await loadEconomyConfig(db); assertEconomyAvailable(config,clientProtocol(data));
    const result=await db.runTransaction(tx=>adminRepairSoloRewardTx({db,tx,adminUid:auth.uid,targetUid,receiptId,telemetrySessionId,reason:String(data.reason||'')}));
    return {ok:true,result};
  } catch(error){logFailure('economyAdminRepairGameReward',auth,error);throw error;}
});

export const economyAdminSyncPlayerStats = onCall(FUNCTION_RUNTIME_OPTIONS, async request => {
  const auth=requireAuth(request); const data=requestData(request);
  try {
    assertRateLimit(auth.uid,'admin-stats-sync',{limit:6,windowMs:60000});
    rejectUnknown(data,['economyProtocolVersion','targetUid']); if(!isAdminAuth(auth)) throw economyError('ADMIN_REQUIRED');
    const config=await loadEconomyConfig(db); assertEconomyAvailable(config,clientProtocol(data));
    return {ok:true,result:await adminSyncPlayerStats(db,{targetUid:String(data.targetUid||'').trim()||null})};
  } catch(error){logFailure('economyAdminSyncPlayerStats',auth,error);throw error;}
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
