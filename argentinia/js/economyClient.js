// js/economyClient.js — v23.20.0 Tournament Mode + server-required Economy Authority.
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

// Bootstrap/starter receipts must not be permanent functions of uid: deleting and
// recreating the in-game profile can keep the same Firebase Auth uid while the old
// economyOperations ledger intentionally survives. Callers normally pass a journaled
// operationId; these fallbacks are fresh for defensive direct use.
export function bootstrapOperationId(_uid) {
  return createEconomyOperationId('acctboot');
}

export function starterOperationId(_uid) {
  return createEconomyOperationId('starter');
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

export function bootstrapAccountServer(username, operationId = null, legalAcceptance = null) {
  const uid = authRef?.currentUser?.uid;
  return call('economyBootstrapAccount', {
    operationId: operationId || bootstrapOperationId(uid),
    username: String(username || ''),
    legalAcceptance
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

export function unlockWorkshopMachineServer(machineId, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('workshop-unlock'),
    action: 'unlockWorkshopMachine',
    machineId: String(machineId || '')
  });
}

export function claimAchievementServer(achievementId, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('achievement-claim'),
    action: 'claimAchievement', achievementId:String(achievementId || '')
  });
}
export function acknowledgeAchievementNoticeServer(achievementId, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('achievement-notice'),
    action: 'acknowledgeAchievementNotice', achievementId:String(achievementId || '')
  });
}
export function convertEssenceServer(quantity = 1, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('essence-convert'),
    action: 'convertEssence', quantity:Math.floor(Number(quantity) || 0)
  });
}

export function evolveCardServer(cardId, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('card-evolution'),
    action: 'evolveCard', cardId:String(cardId || '')
  });
}


export function mixCardsServer(cardId, operationId = null) {
  return call('economyCraftEnhancement', {
    operationId: operationId || createEconomyOperationId('industrial-mix'),
    action: 'mixCards', cardId:String(cardId || '')
  });
}

export function purchasePrebuiltDeckServer(productId, deckName, operationId = null) {
  return call('economyPurchasePrebuiltDeck', {
    operationId: operationId || createEconomyOperationId('prebuilt'),
    productId: String(productId || ''),
    deckName: String(deckName || '')
  });
}

export function purchaseEmoteServer(emoteId, operationId = null) {
  return call('economyPurchaseEmote', {
    operationId: operationId || createEconomyOperationId('emote'),
    emoteId: String(emoteId || '')
  });
}

export function adminSetEmoteCatalogServer(items, operationId = null) {
  return call('economyAdminSetEmoteCatalog', {
    operationId: operationId || createEconomyOperationId('admin-emotes'),
    items: Array.isArray(items) ? items : []
  });
}

export function sendMultiplayerCommunicationServer(matchId, payload = {}) {
  return call('multiplayerSendCommunication', {
    scope: 'match',
    matchId: String(matchId || '').trim().toUpperCase(),
    type: String(payload?.type || ''),
    text: String(payload?.text || ''),
    emoteId: String(payload?.emoteId || '')
  });
}

export function sendLobbyCommunicationServer(text = '') {
  return call('multiplayerSendCommunication', {
    scope: 'lobby',
    type: 'chat',
    text: String(text || '')
  });
}

export function deleteLobbyCommunicationServer(messageSeq) {
  return call('multiplayerSendCommunication', {
    scope: 'lobby', action: 'delete', messageSeq: Math.floor(Number(messageSeq) || 0)
  });
}

export function sendDirectChallengeServer(action, payload = {}) {
  return call('multiplayerSendCommunication', {
    scope: 'challenge',
    action: String(action || ''),
    targetUid: String(payload?.targetUid || ''),
    challengeId: String(payload?.challengeId || ''),
    sessionId: String(payload?.sessionId || '')
  });
}

export function communityActionServer(action, payload = {}) {
  return call('economyCommunityAction', { action:String(action || ''), ...(payload && typeof payload === 'object' ? payload : {}) });
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

export function purchaseClassifiedBasicLandPackServer(color, operationId = null) {
  return call('economyPurchaseClassifiedBasicLandPack', {
    operationId: operationId || createEconomyOperationId('classified-land'),
    color: String(color || '').trim().toUpperCase()
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

export function getSanctuaryStatusServer({includeDiscoveryAssets=false}={}) {
  return call('economyGetSanctuaryStatus',{includeDiscoveryAssets:includeDiscoveryAssets===true});
}


export function resolveSanctuaryBarcodeServer(gtin) {
  return call('economyResolveSanctuaryBarcode', { gtin: String(gtin || '') });
}

export function claimSanctuaryBarcodeServer(gtin, operationId = null) {
  return call('economyClaimSanctuaryBarcode', {
    operationId: operationId || createEconomyOperationId('sanctuary-claim'),
    gtin: String(gtin || '')
  });
}

export function resolveSanctuaryResonanceServer(signature) {
  return call('economyResolveSanctuaryResonance', { signature: String(signature || '') });
}

export function claimSanctuaryResonanceServer(signature, operationId = null) {
  return call('economyClaimSanctuaryResonance', {
    operationId: operationId || createEconomyOperationId('sanctuary-resonance-claim'),
    signature: String(signature || '')
  });
}

export function adminPreviewSanctuaryServer(type, input) {
  return call('economyAdminPreviewSanctuary', {
    type: String(type || ''),
    input: String(input || '')
  });
}

export function adminMigrateDiscoveryPresentationServer() {
  return call('economyAdminSetSanctuaryConfig',{action:'discovery_presentation_migrate'});
}

export function adminSaveDiscoveryPresentationServer(cardId, patch = {}) {
  const payload={action:'discovery_presentation',cardId:String(cardId||'').trim()};
  if(Object.prototype.hasOwnProperty.call(patch,'name')) payload.name=String(patch.name??'');
  if(Object.prototype.hasOwnProperty.call(patch,'artLayout')) payload.artLayout=patch.artLayout;
  if(Object.prototype.hasOwnProperty.call(patch,'textLayout')) payload.textLayout=patch.textLayout;
  return call('economyAdminSetSanctuaryConfig',payload);
}

export function adminCreateDiscoveryArtUploadServer(cardId) {
  return call('economyAdminSetSanctuaryConfig',{action:'discovery_asset_upload',cardId:String(cardId||'').trim()});
}

export function adminFinalizeDiscoveryArtUploadServer(cardId, uploadId, uploadObjectPath) {
  return call('economyAdminSetSanctuaryConfig',{
    action:'discovery_asset_finalize',
    cardId:String(cardId||'').trim(),
    uploadId:String(uploadId||'').trim(),
    uploadObjectPath:String(uploadObjectPath||'').trim()
  });
}

export function adminSetSanctuaryConfigServer(config = {}) {
  return call('economyAdminSetSanctuaryConfig', {
    action: 'general',
    masterEnabled: config.masterEnabled === true,
    cooldownDays: Number(config.cooldownDays),
    barcodeEnabled: config.barcodeEnabled === true,
    resonanceEnabled: config.resonanceEnabled === true
  });
}

export function adminSetSanctuaryBarcodeBucketsServer(barcodeBuckets = []) {
  return call('economyAdminSetSanctuaryConfig', {
    action: 'barcode_buckets',
    barcodeBuckets: Array.isArray(barcodeBuckets) ? barcodeBuckets.map(value=>String(value ?? '').trim()) : []
  });
}

export function adminSetSanctuaryResonanceBucketsServer(resonanceBuckets = []) {
  return call('economyAdminSetSanctuaryConfig', {
    action: 'resonance_buckets',
    resonanceBuckets: Array.isArray(resonanceBuckets) ? resonanceBuckets.map(value=>String(value ?? '').trim()) : []
  });
}

export function adminSetSanctuaryBarcodeEasterEggsServer(barcodeEasterEggs = []) {
  return call('economyAdminSetSanctuaryConfig', {
    action: 'barcode_easter_eggs',
    barcodeEasterEggs: Array.isArray(barcodeEasterEggs) ? barcodeEasterEggs.map(row=>({
      id:String(row?.id||'').trim(),
      enabled:row?.enabled===true,
      label:String(row?.label||'').trim(),
      note:String(row?.note||'').trim(),
      priority:Number(row?.priority),
      cardId:String(row?.cardId||'').trim(),
      gtins:Array.isArray(row?.gtins)?row.gtins.map(value=>String(value??'').trim()):[]
    })) : []
  });
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
    matchId: reward.mode === 'multiplayer' ? String(reward.matchId || '') : '',
    durationMs: reward.mode === 'multiplayer' ? 0 : Math.max(0, Math.floor(Number(reward.durationMs) || 0))
  });
}

export function applyAbandonPenaltyServer({ mode = 'solo', matchId = '', receiptId = '', durationMs = 0, operationId = null } = {}) {
  const normalizedMode = mode === 'multiplayer' ? 'multiplayer' : 'solo';
  return call('economyApplyAbandonPenalty', {
    operationId: operationId || createEconomyOperationId('abandon'),
    mode: normalizedMode,
    matchId: normalizedMode === 'multiplayer' ? String(matchId || '') : '',
    receiptId: normalizedMode === 'solo' ? String(receiptId || '') : '',
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0))
  });
}

export function recoverEconomyOperation(operationId) {
  return call('economyGetOperation', { operationId: String(operationId || '') });
}


export function adminGrantServer({ targetUid, kind, amount, reason = '', operationId = null } = {}) {
  return call('economyAdminGrant', {
    operationId: operationId || createEconomyOperationId('admin-grant'),
    targetUid: String(targetUid || ''), kind: String(kind || ''), amount: Number(amount), reason: String(reason || '')
  });
}
export function adminBulkGrantServer({ jobId, kind, amount, reason = '' } = {}) {
  return call('economyAdminBulkGrant', { jobId:String(jobId||''), kind:String(kind||''), amount:Number(amount), reason:String(reason||'') });
}
export function adminGetBulkGrantServer(jobId) {
  return call('economyAdminGetBulkGrant', { jobId:String(jobId||'') });
}
export function adminRepairGameRewardServer(payload = {}) {
  return call('economyAdminRepairGameReward', {
    targetUid:String(payload.targetUid||''), receiptId:String(payload.receiptId||''),
    telemetrySessionId:String(payload.telemetrySessionId||''), reason:String(payload.reason||'')
  });
}
export function adminSyncPlayerStatsServer(targetUid = '') {
  return call('economyAdminSyncPlayerStats', { targetUid:String(targetUid||'') });
}


// v23.20.0 — Tournament Authority
export function getTournamentServer({ resolveInterrupted = false } = {}) {
  return call('economyGetTournament', { resolveInterrupted: resolveInterrupted === true });
}

export function startTournamentServer(operationId = null) {
  return call('economyStartTournament', {
    operationId: operationId || createEconomyOperationId('tournament-start')
  });
}

export function beginTournamentMatchServer(tournamentId, operationId = null) {
  return call('economyBeginTournamentMatch', {
    operationId: operationId || createEconomyOperationId('tournament-begin'),
    tournamentId: String(tournamentId || '')
  });
}

export function settleTournamentMatchServer(tournamentId, matchId, won, operationId = null) {
  return call('economySettleTournamentMatch', {
    operationId: operationId || `tournament-settle:${String(tournamentId || '')}:${String(matchId || '')}`.slice(0, 128),
    tournamentId: String(tournamentId || ''),
    matchId: String(matchId || ''),
    won: won === true
  });
}

export function forfeitTournamentServer(tournamentId, matchId, operationId = null) {
  return call('economyForfeitTournament', {
    operationId: operationId || `tournament-forfeit:${String(tournamentId || '')}:${String(matchId || '')}`.slice(0, 128),
    tournamentId: String(tournamentId || ''),
    matchId: String(matchId || '')
  });
}

export function abandonTournamentServer(tournamentId, operationId = null) {
  return call('economyForfeitTournament', {
    operationId: operationId || `tournament-abandon:${String(tournamentId || '')}`.slice(0, 128),
    tournamentId: String(tournamentId || ''),
    matchId: ''
  });
}

// v23.21.0 — Mercado de Pases Authority
export function getTradeMarketServer() {
  return call('economyGetTradeMarket');
}
export function createTradeListingServer({ cardId, wantedCriteria = [], acceptAnyCard = false } = {}, operationId = null) {
  return call('economyCreateTradeListing', {
    operationId: operationId || createEconomyOperationId('trade-listing'),
    cardId: String(cardId || ''),
    wantedCriteria: Array.isArray(wantedCriteria) ? wantedCriteria : [],
    acceptAnyCard: acceptAnyCard === true
  });
}
export function cancelTradeListingServer(listingId, operationId = null) {
  return call('economyCancelTradeListing', {
    operationId: operationId || createEconomyOperationId('trade-listing-cancel'),
    listingId: String(listingId || '')
  });
}
export function createTradeOfferServer(listingOwnerUid, listingId, cardId, operationId = null) {
  return call('economyCreateTradeOffer', {
    operationId: operationId || createEconomyOperationId('trade-offer'),
    listingOwnerUid: String(listingOwnerUid || ''),
    listingId: String(listingId || ''),
    cardId: String(cardId || '')
  });
}
export function cancelTradeOfferServer(offerId, operationId = null) {
  return call('economyCancelTradeOffer', {
    operationId: operationId || createEconomyOperationId('trade-offer-cancel'),
    offerId: String(offerId || '')
  });
}
export function rejectTradeOfferServer(offerId, operationId = null) {
  return call('economyRejectTradeOffer', {
    operationId: operationId || createEconomyOperationId('trade-offer-reject'),
    offerId: String(offerId || '')
  });
}
export function acceptTradeOfferServer(offerId, operationId = null) {
  return call('economyAcceptTradeOffer', {
    operationId: operationId || createEconomyOperationId('trade-offer-accept'),
    offerId: String(offerId || '')
  });
}
