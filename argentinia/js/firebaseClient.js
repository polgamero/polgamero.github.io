// js/firebaseClient.js — Entrega 23.11.6
// Fachada lazy del SDK Firebase. El grafo principal de Argentinia puede arrancar sin
// descargar/evaluar Firebase; la conexión real se materializa recién al usar Auth,
// Multiplayer, Admin, Tienda o persistencia. En desktop main.js puede precargarla para
// conservar exactamente el comportamiento histórico.

let clientPromise = null;
let clientReady = false;
let clientModule = null;
let authBridgeStarted = false;
let authInnerStop = null;
const authSubscribers = new Set();
let initialAuthResolved = false;
let initialAuthUser = null;
let resolveInitialAuth = null;
const initialAuthPromise = new Promise(resolve => { resolveInitialAuth = resolve; });

function diag(stage, detail = null) {
  try { globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.(stage, detail); } catch {}
}

export function preloadFirebaseClient() {
  if (!clientPromise) {
    diag('firebase_import_requested');
    clientPromise = import('./firebaseClientImpl.js')
      .then(mod => {
        clientReady = true;
        clientModule = mod;
        diag('firebase_import_loaded');
        startAuthBridgeIfPossible(mod);
        return mod;
      })
      .catch(error => {
        clientPromise = null;
        clientReady = false;
        clientModule = null;
        diag('firebase_import_failed', { name: error?.name || 'Error', message: error?.message || String(error) });
        throw error;
      });
  }
  return clientPromise;
}

function startAuthBridgeIfPossible(mod) {
  if (authBridgeStarted || !authSubscribers.size) return;
  authBridgeStarted = true;
  try {
    authInnerStop = mod.onAuthChange(user => {
      for (const cb of [...authSubscribers]) {
        try { cb(user); } catch (error) { console.error('Auth subscriber failed:', error); }
      }
      // 23.13.52 — resolver DESPUÉS de notificar subscribers: main.js ya habrá
      // asignado state.currentUser y userProfileLoadPromise cuando el await continúe.
      if (!initialAuthResolved) {
        initialAuthResolved = true;
        initialAuthUser = user || null;
        resolveInitialAuth?.(initialAuthUser);
      }
    });
    diag('firebase_auth_bridge_ready');
  } catch (error) {
    authBridgeStarted = false;
    diag('firebase_auth_bridge_failed', { message: error?.message || String(error) });
    throw error;
  }
}

export function isFirebaseClientReady() { return clientReady; }
export function isInitialAuthStateResolved() { return initialAuthResolved; }

// 23.13.52 — puerta explícita contra F5 + click rápido. Importa Firebase si todavía no
// estaba cargado y espera el PRIMER estado real de Auth (usuario persistido o null).
export function waitForInitialAuthState() {
  if (initialAuthResolved) return Promise.resolve(initialAuthUser);
  return preloadFirebaseClient().then(() => initialAuthPromise);
}

export function onAuthChange(onChange) {
  if (typeof onChange !== 'function') return () => {};
  authSubscribers.add(onChange);
  // Importante: registrar el callback NO fuerza Firebase. En desktop main.js llama a
  // preloadFirebaseClient(); en mobile cualquier acción online lo hará bajo demanda.
  if (clientPromise) clientPromise.then(startAuthBridgeIfPossible).catch(() => {});
  return () => {
    authSubscribers.delete(onChange);
    if (!authSubscribers.size && authInnerStop) {
      try { authInnerStop(); } catch {}
      authInnerStop = null;
      authBridgeStarted = false;
    }
  };
}

function asyncProxy(name) {
  return (...args) => preloadFirebaseClient().then(mod => {
    const fn = mod?.[name];
    if (typeof fn !== 'function') throw new Error(`FIREBASE_LAZY_EXPORT_MISSING:${name}`);
    return fn(...args);
  });
}

// listenToMatch históricamente devuelve unsubscribe de forma sincrónica. Devolvemos un
// proxy unsubscribe inmediato y enganchamos la escucha real apenas Firebase esté listo.
export function listenToMatch(...args) {
  let cancelled = false;
  let innerStop = null;
  preloadFirebaseClient().then(mod => {
    if (cancelled) return;
    innerStop = mod.listenToMatch(...args);
    if (cancelled && typeof innerStop === 'function') innerStop();
  }).catch(error => {
    diag('firebase_listen_match_failed', { message: error?.message || String(error) });
  });
  return () => {
    cancelled = true;
    if (typeof innerStop === 'function') innerStop();
  };
}

function persistAuthError(error) {
  const detail = { code: error?.code || null, name: error?.name || null, message: error?.message || String(error), at: Date.now() };
  diag('google_signin_failed', detail);
  try {
    const payload = JSON.stringify(detail);
    sessionStorage.setItem('argentinia.mobile.lastAuthError.v1', payload);
    localStorage.setItem('argentinia.mobile.lastAuthError.v1', payload);
  } catch {}
  return error;
}

export function signInWithGoogle(...args) {
  const wasReady = clientReady && !!clientModule;
  diag('google_signin_requested', { firebaseReady: wasReady, direct: wasReady });

  // 23.11.8: si el prewarm ya terminó, llamamos signInWithPopup en ESTE MISMO task/click.
  // No interponemos Promise.then() entre el gesto del usuario y la apertura del popup.
  if (clientModule) {
    try {
      diag('google_signin_sdk_ready', { prewarmed: true, direct: true });
      return Promise.resolve(clientModule.signInWithGoogle(...args)).catch(error => { throw persistAuthError(error); });
    } catch (error) {
      return Promise.reject(persistAuthError(error));
    }
  }

  return preloadFirebaseClient().then(mod => {
    diag('google_signin_sdk_ready', { prewarmed: false, direct: false });
    return mod.signInWithGoogle(...args);
  }).catch(error => { throw persistAuthError(error); });
}
export const signOutUser = asyncProxy('signOutUser');
export const loadUserProfile = asyncProxy('loadUserProfile');
export const createUserProfile = asyncProxy('createUserProfile');
export const reserveInitialUsername = asyncProxy('reserveInitialUsername');
export const checkUsernameAvailability = asyncProxy('checkUsernameAvailability');
export const renameUsername = asyncProxy('renameUsername');
export const touchLastSeen = asyncProxy('touchLastSeen');
export const deleteUserProfile = asyncProxy('deleteUserProfile');
export const awardPoints = asyncProxy('awardPoints');
export const awardGamePointsOnce = asyncProxy('awardGamePointsOnce');
export const flushPendingGameRewards = asyncProxy('flushPendingGameRewards');
export const purchasePack = asyncProxy('purchasePack');
export const openInventoryPack = asyncProxy('openInventoryPack');
export const openGuaranteedMythic = asyncProxy('openGuaranteedMythic');
export const registerDailyLogin = asyncProxy('registerDailyLogin');
export const claimDailyReward = asyncProxy('claimDailyReward');
export const getAuthoritativeRewardNow = asyncProxy('getAuthoritativeRewardNow');
export const getAuthoritativeClassifiedsNow = asyncProxy('getAuthoritativeClassifiedsNow');
export const ensureClassifiedsSchedule = asyncProxy('ensureClassifiedsSchedule');
export const loadClassifiedsSchedule = asyncProxy('loadClassifiedsSchedule');
export const fetchCurrentClassifieds = asyncProxy('fetchCurrentClassifieds');
export const purchaseClassifiedCard = asyncProxy('purchaseClassifiedCard');
export const adminAdvanceDailyRewardDebugDay = asyncProxy('adminAdvanceDailyRewardDebugDay');
export const adminResetDailyRewardDebug = asyncProxy('adminResetDailyRewardDebug');
export const craftEnhancement = asyncProxy('craftEnhancement');
export const createDeck = asyncProxy('createDeck');
export const updateDeck = asyncProxy('updateDeck');
export const deleteDeck = asyncProxy('deleteDeck');
export const loadPublicGameConfigDocument = asyncProxy('loadPublicGameConfigDocument');
export const saveAdminGameConfigDocument = asyncProxy('saveAdminGameConfigDocument');
export const loadGameConfig = asyncProxy('loadGameConfig');
export const saveGameConfig = asyncProxy('saveGameConfig');
export const loadGameTextOverrides = asyncProxy('loadGameTextOverrides');
export const saveGameTextOverrides = asyncProxy('saveGameTextOverrides');
export const createMatch = asyncProxy('createMatch');
export const joinMatchByCode = asyncProxy('joinMatchByCode');
export const setMatchPlayerReady = asyncProxy('setMatchPlayerReady');
export const setActiveMatchId = asyncProxy('setActiveMatchId');
export const clearActiveMatchId = asyncProxy('clearActiveMatchId');
export const fetchMatchForReconnect = asyncProxy('fetchMatchForReconnect');
export const cancelMatch = asyncProxy('cancelMatch');
export const publishMyPublicState = asyncProxy('publishMyPublicState');
export const publishMyPrivateState = asyncProxy('publishMyPrivateState');
export const publishPrivateSelectionOffer = asyncProxy('publishPrivateSelectionOffer');
export const fetchPrivateSelectionOffer = asyncProxy('fetchPrivateSelectionOffer');
export const deletePrivateSelectionOffer = asyncProxy('deletePrivateSelectionOffer');
export const fetchAllUserProfiles = asyncProxy('fetchAllUserProfiles');
export const adminGrantCurrency = asyncProxy('adminGrantCurrency');
export const adminGrantCurrencyToAll = asyncProxy('adminGrantCurrencyToAll');
export const adminGrantPacks = asyncProxy('adminGrantPacks');
export const adminGrantPacksToAll = asyncProxy('adminGrantPacksToAll');
export const logAdminAction = asyncProxy('logAdminAction');
export const fetchAnnouncements = asyncProxy('fetchAnnouncements');
export const postAnnouncement = asyncProxy('postAnnouncement');
export const deleteAnnouncement = asyncProxy('deleteAnnouncement');
export const saveAnnouncement = asyncProxy('saveAnnouncement');
export const updateAnnouncement = asyncProxy('updateAnnouncement');
export const finalizeAnnouncement = asyncProxy('finalizeAnnouncement');
export const isAnnouncementDismissed = asyncProxy('isAnnouncementDismissed');
export const dismissAnnouncement = asyncProxy('dismissAnnouncement');
export const fetchCampaignEvents = asyncProxy('fetchCampaignEvents');
export const fetchCampaignSnapshot = asyncProxy('fetchCampaignSnapshot');
export const createCampaignEvent = asyncProxy('createCampaignEvent');
export const updateCampaignEvent = asyncProxy('updateCampaignEvent');
export const finalizeCampaignEvent = asyncProxy('finalizeCampaignEvent');
export const deleteCampaignEvent = asyncProxy('deleteCampaignEvent');
export const fetchTelemetrySessionsForAdmin = asyncProxy('fetchTelemetrySessionsForAdmin');
export const fetchTelemetrySessionArchive = asyncProxy('fetchTelemetrySessionArchive');
export const uploadTelemetrySession = asyncProxy('uploadTelemetrySession');
export const finalizeTelemetryLifecycleSession = asyncProxy('finalizeTelemetryLifecycleSession');
export const adminCloseStaleTelemetrySessions = asyncProxy('adminCloseStaleTelemetrySessions');
export const touchMatchPresence = asyncProxy('touchMatchPresence');
export const bootstrapPlayerStatistics = asyncProxy('bootstrapPlayerStatistics');
export const recordPlayerGameResult = asyncProxy('recordPlayerGameResult');
export const fetchPublicPlayerStats = asyncProxy('fetchPublicPlayerStats');
export const adminSyncPublicPlayerStats = asyncProxy('adminSyncPublicPlayerStats');
