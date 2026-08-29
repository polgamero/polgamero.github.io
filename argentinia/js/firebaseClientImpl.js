// js/firebaseClient.js
//
// Fase 0 del multiplayer: conecta el SDK de Firebase (Auth + Firestore) y expone un puñado
// de funciones chicas para que el resto del juego no tenga que saber nada de Firebase por
// dentro — ni ui.js ni main.js importan nada de gstatic.com directamente, todo pasa por acá.
//
// Import vía CDN con <script type="module">, sin bundler — misma filosofía que el resto del
// proyecto (JS puro con módulos ES6). Referencia oficial: firebase.google.com/docs/web/setup
//
// Los valores de firebaseConfig son datos PÚBLICOS a propósito: viajan en el código que le
// llega a cualquier jugador en el navegador. Lo que protege la base de datos de verdad son
// las Reglas de Seguridad de Firestore (Fase 1 en adelante), no que esto esté "oculto".
// 23.11.9: PIN intencional a 12.16.0. Firebase 12.17.0/12.17.1 (@firebase/auth 1.13.4)
// tienen una regresión de IndexedDB + visibilitychange que rompe signInWithPopup con
// "Database is closing/hidden". No subir esta versión sin un contrato/regresión explícito.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocFromServer, setDoc, deleteDoc, runTransaction, serverTimestamp, onSnapshot, getDocs, collection, query, orderBy, limit, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { cardDb } from './cardLoader.js';
import { DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, MAX_SAVED_DECKS, PREBUILT_DECK_POINTS, PREBUILT_DECK_FICHAS, ENHANCED_SUFFIX, isEnhancementEligibleCard } from './store.js';
import { loadPrebuiltDeckCatalog, validatePrebuiltDeckProduct, getPrebuiltPurchaseIds } from './prebuiltDecks.js';
import { buildClassifiedsScheduleWindow, classifiedsWeekKey, getClassifiedsEconomySnapshot, getClassifiedsProfileState, countOwnedClassifiedCard, getScheduledClassifiedsWeek, validateClassifiedsScheduleWeek, normalizeClassifiedsPurchaseCounts, CLASSIFIEDS_SCHEMA_VERSION, CLASSIFIEDS_ALGORITHM_VERSION, CLASSIFIEDS_SCHEDULE_HORIZON_WEEKS, CLASSIFIEDS_SCHEDULE_HISTORY_WEEKS } from './classifieds.js';
import { defaultInventory, defaultDailyRewardsState, normalizeInventory, normalizeDailyRewardsState, advanceDailyLoginState, isDailyStreakConsistent, rewardForDay, isRewardClaimable, applyRewardToProfileData, CHEST_ITEM_KEYS, localDateKey, hasAuthoritativeDailyState, serializeDailyRewardsForFirestore } from './rewards.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION, isExactMultiplayerVersionCompatible } from './version.js';
import { validateUsername, USERNAME_RENAME_COST } from './usernames.js';
import { normalizePlayerStats, summarizePlayerTelemetry, PLAYER_GAME_BACKFILL_VERSION } from './statistics.js';
import { chooseMultiplayerStartingRole } from './startingPlayer.js';
import { buildCampaignSnapshot, validateEventPayload, validateAnnouncementPayload, effectivePackCost, effectiveMatchPoints, effectiveAllPoints, effectiveFichas } from './campaigns.js';
import { queuePendingGameReward, pendingGameRewardsForUid, removePendingGameReward, normalizeGameRewardReceiptId } from './gameRewards.js';
import { normalizePvpRewardLimits, evaluatePvpRewardEligibility, argentinaDayKeyFromMs, pvpPairKey, pvpCompletedTurns } from './pvpRewards.js';
import { privateRevisionField, validateReconnectRevisionPair, normalizeSyncRevision, MULTIPLAYER_CLIENT_SESSION_ID, roleSessionField, validateRoleSession, classifyReconnectSafety } from './multiplayerReliability.js';

const firebaseConfig = {
  apiKey: "AIzaSyAAvUAaZ35_sF9uCsecLPg7zqhB7mLa7yo",
  authDomain: "argentinia-tcg.firebaseapp.com",
  projectId: "argentinia-tcg",
  messagingSenderId: "624830573266",
  appId: "1:624830573266:web:55ff4c56665f33a5821b0b"
};

const app = initializeApp(firebaseConfig);

// Se exportan por si Fase 1 en adelante necesita usarlos directo (ej. leer/escribir la
// colección del jugador en Firestore) — hoy (Fase 0) nadie más los usa todavía.
export const auth = getAuth(app);
export const db = getFirestore(app);

// El scope de foto de perfil (photoURL) ya viene incluido en el perfil básico de Google —
// no hace falta pedir ningún permiso extra aparte, alcanza con el login estándar.
const googleProvider = new GoogleAuthProvider();
const ADMIN_EMAIL = 'pablogamero1@gmail.com';
export const FIREBASE_IMPL_VERSION = ENGINE_VERSION;
const REWARD_RULES_VERSION = FIRESTORE_RULES_VERSION;

function usernameError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function assertValidUsernamePayload(username, usernameKey) {
  const validated = validateUsername(username);
  if (!validated.ok || validated.usernameKey !== usernameKey) {
    throw usernameError(validated.code || 'USERNAME_INVALID', validated.message || 'Nombre inválido.');
  }
  return validated;
}

function normalizeProfileForClient(data) {
  if (!data) return null;
  return {
    ...data,
    starterDeckPending: data.starterDeckPending === true,
    inventory: normalizeInventory(data.inventory),
    dailyRewards: normalizeDailyRewardsState(data.dailyRewards)
  };
}


// ============================================================================
// 23.13.37 — ESTADÍSTICAS / RANKING PÚBLICO.
// playerStats/{uid} contiene exclusivamente datos sanitizados: username + saldos públicos
// de juego + contadores agregados. Nunca email, photoURL, decks, cartas concretas ni mano.
// Las mutaciones económicas originales siguen siendo autoritativas para el gameplay; si una
// actualización estadística falla, NO revierte una compra/recompensa ya válida.
// ============================================================================

function playerStatsMirror(profile, statsValue = null) {
  const stats = normalizePlayerStats(statsValue);
  const collectionIds = Array.isArray(profile?.collection) ? profile.collection : [];
  const inventory = normalizeInventory(profile?.inventory);
  return {
    ...stats,
    uid: String(profile?.uid || ''),
    username: String(profile?.username || 'Jugador'),
    pointsCurrent: Math.max(0, Math.floor(Number(profile?.points) || 0)),
    fichasCurrent: Math.max(0, Math.floor(Number(profile?.fichas) || 0)),
    packsInChest: Math.max(0, Math.floor(Number(inventory[CHEST_ITEM_KEYS.standardPack]) || 0)),
    cardsOwned: collectionIds.length,
    uniqueCards: new Set(collectionIds).size,
    updatedAt: serverTimestamp()
  };
}

async function loadProfileRaw(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

async function trackPlayerStats(uid, deltas = {}, options = {}) {
  const userRef = doc(db, 'users', uid);
  const statsRef = doc(db, 'playerStats', uid);
  const receiptId = options.receiptId ? String(options.receiptId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 300) : null;
  const receiptRef = receiptId ? doc(db, 'playerGameReceipts', `${uid}_${receiptId}`) : null;
  return runTransaction(db, async tx => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return { applied: false, reason: 'missing_user' };
    const statsSnap = await tx.get(statsRef);
    let receiptSnap = null;
    if (receiptRef) receiptSnap = await tx.get(receiptRef);
    if (receiptSnap?.exists()) return { applied: false, reason: 'duplicate_receipt' };

    const profile = { uid, ...userSnap.data() };
    const stats = normalizePlayerStats(statsSnap.exists() ? statsSnap.data() : null);
    const numericKeys = [
      'gamesPlayed','soloGames','multiplayerGames','wins','losses','soloWins','soloLosses',
      'multiplayerWins','multiplayerLosses','abandons','totalDurationMs','pointsEarned',
      'pointsSpent','pointsLost','fichasEarned','fichasSpent','packsReceived','packsOpened',
      'guaranteedMythicsOpened'
    ];
    for (const key of numericKeys) {
      const delta = Math.floor(Number(deltas[key]) || 0);
      if (delta) stats[key] = Math.max(0, (Number(stats[key]) || 0) + delta);
    }
    if (Number.isFinite(Number(options.gameBackfillVersion))) {
      stats.gameBackfillVersion = Math.max(stats.gameBackfillVersion || 0, Math.floor(Number(options.gameBackfillVersion)));
    }
    tx.set(statsRef, playerStatsMirror(profile, stats), { merge: false });
    if (receiptRef) {
      tx.set(receiptRef, {
        uid,
        receiptId,
        mode: options.mode || null,
        result: options.result || null,
        durationMs: Math.max(0, Math.floor(Number(options.durationMs) || 0)),
        createdAt: serverTimestamp()
      });
    }
    return { applied: true, stats };
  });
}

function statsBestEffort(uid, deltas = {}, options = {}) {
  return trackPlayerStats(uid, deltas, options).catch(error => {
    console.warn('[Statistics 23.13.37] No se pudo actualizar playerStats:', error);
    return { applied: false, error };
  });
}

async function logEconomyEvent(event) {
  const actorUid = auth.currentUser?.uid || null;
  if (!actorUid) return false;
  const targetUid = String(event?.targetUid || actorUid);
  const ref = doc(collection(db, 'economyEvents'));
  await setDoc(ref, {
    actorUid,
    targetUid,
    source: String(event?.source || 'unknown'),
    pointsDelta: Math.floor(Number(event?.pointsDelta) || 0),
    fichasDelta: Math.floor(Number(event?.fichasDelta) || 0),
    packsDelta: Math.floor(Number(event?.packsDelta) || 0),
    cardsDelta: Math.floor(Number(event?.cardsDelta) || 0),
    matchId: event?.matchId || null,
    sessionId: event?.sessionId || null,
    engineVersion: ENGINE_VERSION,
    createdAt: serverTimestamp()
  });
  return true;
}

function economyLogBestEffort(event) {
  return logEconomyEvent(event).catch(error => {
    console.warn('[Statistics 23.13.37] No se pudo registrar economyEvent:', error);
    return false;
  });
}

export async function bootstrapPlayerStatistics(uid) {
  const ownQuery = query(collection(db, 'telemetrySessions'), where('ownerUid', '==', uid));
  const sessionsSnap = await getDocs(ownQuery);
  const sessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const history = summarizePlayerTelemetry(sessions);
  const statsRef = doc(db, 'playerStats', uid);
  const currentSnap = await getDoc(statsRef);
  const current = normalizePlayerStats(currentSnap.exists() ? currentSnap.data() : null);
  // Reconciliación permanente, no sólo migración one-shot: si un cierre de pestaña o una
  // caída de red impidió grabar el receipt en vivo pero la telemetría sí quedó finalizada,
  // el próximo login rellena el hueco. Nunca decrementa contadores ya registrados.
  const gameKeys = ['gamesPlayed','soloGames','multiplayerGames','wins','losses','soloWins','soloLosses','multiplayerWins','multiplayerLosses','abandons'];
  const deltas = {};
  if ((Number(history.gamesPlayed) || 0) > (Number(current.gamesPlayed) || 0)) {
    for (const key of gameKeys) deltas[key] = Math.max(0, Number(history[key]) || 0) - Math.max(0, Number(current[key]) || 0);
  }
  deltas.totalDurationMs = Math.max(0, (Number(history.totalDurationMs) || 0) - Math.max(0, Number(current.totalDurationMs) || 0));
  await trackPlayerStats(uid, deltas, { gameBackfillVersion: PLAYER_GAME_BACKFILL_VERSION });
  const refreshed = await getDoc(statsRef);
  return refreshed.exists() ? { id: refreshed.id, ...refreshed.data() } : null;
}

export async function recordPlayerGameResult(uid, result = {}) {
  const mode = String(result.mode || 'solo').toLowerCase().startsWith('multi') ? 'multiplayer' : 'solo';
  const won = result.won === true;
  const lost = result.won === false;
  const deltas = {
    gamesPlayed: 1,
    soloGames: mode === 'solo' ? 1 : 0,
    multiplayerGames: mode === 'multiplayer' ? 1 : 0,
    wins: won ? 1 : 0,
    losses: lost ? 1 : 0,
    soloWins: mode === 'solo' && won ? 1 : 0,
    soloLosses: mode === 'solo' && lost ? 1 : 0,
    multiplayerWins: mode === 'multiplayer' && won ? 1 : 0,
    multiplayerLosses: mode === 'multiplayer' && lost ? 1 : 0,
    abandons: result.abandoned ? 1 : 0,
    totalDurationMs: Math.max(0, Math.floor(Number(result.durationMs) || 0))
  };
  return trackPlayerStats(uid, deltas, {
    receiptId: result.sessionId,
    mode,
    result: won ? 'win' : (lost ? 'loss' : 'unknown'),
    durationMs: result.durationMs
  });
}

export async function fetchPublicPlayerStats() {
  const snap = await getDocs(collection(db, 'playerStats'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adminSyncPublicPlayerStats(profiles = [], sessions = []) {
  if ((auth.currentUser?.email || '').toLowerCase() !== ADMIN_EMAIL) throw new Error('ADMIN_REQUIRED');
  const byOwner = new Map();
  for (const session of sessions) {
    const uid = session?.ownerUid;
    if (!uid) continue;
    if (!byOwner.has(uid)) byOwner.set(uid, []);
    byOwner.get(uid).push(session);
  }
  let updated = 0;
  for (const profile of profiles) {
    if (!profile?.uid) continue;
    const statsRef = doc(db, 'playerStats', profile.uid);
    const currentSnap = await getDoc(statsRef);
    const current = normalizePlayerStats(currentSnap.exists() ? currentSnap.data() : null);
    const history = summarizePlayerTelemetry(byOwner.get(profile.uid) || []);
    let merged = { ...current, gameBackfillVersion: PLAYER_GAME_BACKFILL_VERSION };
    if ((Number(history.gamesPlayed) || 0) > (Number(current.gamesPlayed) || 0)) {
      for (const key of ['gamesPlayed','soloGames','multiplayerGames','wins','losses','soloWins','soloLosses','multiplayerWins','multiplayerLosses','abandons']) {
        merged[key] = Number(history[key]) || 0;
      }
    }
    merged.totalDurationMs = Math.max(Number(current.totalDurationMs) || 0, Number(history.totalDurationMs) || 0);
    await setDoc(statsRef, playerStatsMirror(profile, merged), { merge: false });
    updated++;
  }
  return { updated };
}

// Devuelve una Promise que resuelve con el UserCredential de Firebase, o rechaza si el
// jugador cerró el popup, lo bloqueó el navegador, o falló la red. Quien llama decide qué
// hacer con el error (Fase 0: solo mostrarlo, no hay nada más "grave" atado al login todavía).
export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

// onChange(user) se dispara solo, automáticamente, cada vez que el estado de sesión cambia
// (login, logout, o al recargar la página si ya había una sesión activa) — con el objeto de
// usuario de Firebase, o null si no hay nadie logueado. Devuelve la función de unsubscribe
// por si en el futuro hace falta cortar la escucha (hoy se usa una sola vez, en boot()).
export function onAuthChange(onChange) {
  return onAuthStateChanged(auth, onChange);
}

// ============================================================================
// FASE 1: perfil de jugador en Firestore (colección `users`, un documento por uid).
//
// Forma del documento:
//   { displayName, photoURL, email,
//     points: number,
//     collection: string[],   // IDs de carta, CON repetidos = copias que tenés
//     decks: [{ id, name, cardIds: string[], isDefault, createdAt }],  // hasta 5, el
//       primero ("starter") se crea solo con el mazo inicial random (Fase 3)
//     fichas: number,          // Fase 2/23.13: +1 por sobre ABIERTO
//     enhancements: { [cardId]: keyword },  // Fase 2: mejoras permanentes por Ficha
//     createdAt, lastSeenAt }
//
// Nadie fuera de este archivo arma una referencia a `users/{uid}` a mano — todo pasa por
// estas 3 funciones, para que el resto del juego no tenga que saber nada de la forma real
// del documento ni de cómo está guardado.
// ============================================================================

// Devuelve el documento del jugador, o null si todavía no existe (recién se logueó por
// primera vez y nunca terminó de armar su colección inicial).
export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  // 23.13.0 — migración lazy/no destructiva: perfiles históricos no tienen Mi Cofre ni
  // dailyRewards. Los normalizamos en memoria; la primera transacción posterior persiste
  // los campos nuevos sin tocar colección/mazos/economía existente.
  return normalizeProfileForClient(data);
}

// 23.13.67 — lectura explícita desde servidor usada únicamente para reconciliar el journal
// visual de una Mythic después de F5/conexión perdida. No escribe nada y no cambia Rules.
export async function loadUserProfileFromServer(uid) {
  const snap = await getDocFromServer(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return normalizeProfileForClient(snap.data());
}

// 23.13.24 — reserva inicial de identidad. Se ejecuta ANTES del mazo inicial. Si todavía
// no existe users/{uid}, crea un perfil mínimo starterDeckPending=true en la MISMA transacción
// que reserva usernames/{usernameKey}; si el perfil ya existía (migración), sólo agrega los
// campos username*. Las Rules 23.13.24 enlazan ambos documentos con getAfter().
export async function reserveInitialUsername(uid, username, usernameKey, profileFields = {}) {
  const validated = assertValidUsernamePayload(username, usernameKey);
  const userRef = doc(db, 'users', uid);
  const nameRef = doc(db, 'usernames', validated.usernameKey);

  return runTransaction(db, async (tx) => {
    const [userSnap, nameSnap] = await Promise.all([tx.get(userRef), tx.get(nameRef)]);
    if (nameSnap.exists() && nameSnap.data()?.uid !== uid) {
      throw usernameError('USERNAME_TAKEN', 'Ese nombre ya está usado.');
    }

    const now = serverTimestamp();
    const identityPatch = {
      username: validated.username,
      usernameKey: validated.usernameKey,
      usernameUpdatedAt: now
    };

    let nextProfile;
    if (userSnap.exists()) {
      const current = userSnap.data();
      // 23.13.26 — el criterio debe ser idéntico al del boot/UI. Perfiles históricos
      // (especialmente Admin/debug) pueden tener usernameKey null, huérfano o una identidad
      // parcial; eso NO cuenta como username configurado. Sólo bloqueamos una segunda alta
      // gratis cuando ya existe username + usernameKey válidos.
      const hasConfiguredIdentity = typeof current.username === 'string' && current.username.trim()
        && typeof current.usernameKey === 'string' && current.usernameKey.trim();
      if (hasConfiguredIdentity && current.usernameKey !== validated.usernameKey) {
        throw usernameError('USERNAME_ALREADY_CONFIGURED', 'La cuenta ya tiene un nombre configurado.');
      }
      tx.update(userRef, identityPatch);
      nextProfile = { ...current, ...identityPatch };
    } else {
      nextProfile = {
        displayName: profileFields.displayName || '',
        photoURL: profileFields.photoURL || '',
        email: profileFields.email || '',
        ...identityPatch,
        points: 0,
        collection: [],
        decks: [],
        fichas: 0,
        enhancements: {},
        inventory: defaultInventory(),
        dailyRewards: defaultDailyRewardsState(),
        activeMatchId: null,
        starterDeckPending: true,
        createdAt: now,
        lastSeenAt: now
      };
      tx.set(userRef, nextProfile);
    }

    const registryData = {
      uid,
      username: validated.username,
      updatedAt: now,
      ...(nameSnap.exists() ? {} : { createdAt: now })
    };
    tx.set(nameRef, registryData, { merge: nameSnap.exists() });
    return normalizeProfileForClient(nextProfile);
  });
}

export async function checkUsernameAvailability(username, usernameKey) {
  const validated = assertValidUsernamePayload(username, usernameKey);
  const snap = await getDoc(doc(db, 'usernames', validated.usernameKey));
  if (!snap.exists()) return { available: true };
  return { available: false };
}

// Rename real: nombre + reserva + Ficha forman una única transacción. No se permite con
// activeMatchId para que un snapshot multiplayer nunca cambie de identidad a mitad de match.
export async function renameUsername(uid, username, usernameKey, fichaCost = USERNAME_RENAME_COST) {
  const validated = assertValidUsernamePayload(username, usernameKey);
  const cost = Math.max(1, Math.floor(Number(fichaCost) || USERNAME_RENAME_COST));
  const userRef = doc(db, 'users', uid);

  const profile = await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw usernameError('USERNAME_PROFILE_MISSING', 'La cuenta no existe.');
    const current = userSnap.data();
    const oldKey = String(current.usernameKey || '');
    const oldUsername = String(current.username || '');
    if (!oldKey || !oldUsername) throw usernameError('USERNAME_NOT_CONFIGURED', 'Primero tenés que configurar tu nombre.');
    if (current.activeMatchId) throw usernameError('USERNAME_ACTIVE_MATCH', 'Terminá tu partida multiplayer antes de cambiar el nombre.');
    if ((Number(current.fichas) || 0) < cost) throw usernameError('USERNAME_NOT_ENOUGH_FICHAS', 'No tenés suficientes Fichas.');
    if (oldUsername === validated.username) throw usernameError('USERNAME_SAME', 'Ese ya es tu nombre actual.');

    const newNameRef = doc(db, 'usernames', validated.usernameKey);
    const oldNameRef = doc(db, 'usernames', oldKey);
    const refsToRead = validated.usernameKey === oldKey ? [newNameRef] : [newNameRef, oldNameRef];
    const snaps = [];
    for (const ref of refsToRead) snaps.push(await tx.get(ref));
    const newNameSnap = snaps[0];
    const oldNameSnap = validated.usernameKey === oldKey ? newNameSnap : snaps[1];

    if (newNameSnap.exists() && newNameSnap.data()?.uid !== uid) {
      throw usernameError('USERNAME_TAKEN', 'Ese nombre ya está usado.');
    }
    if (!oldNameSnap.exists() || oldNameSnap.data()?.uid !== uid) {
      throw usernameError('USERNAME_REGISTRY_MISMATCH', 'La reserva del nombre actual está inconsistente.');
    }

    const now = serverTimestamp();
    tx.update(userRef, {
      username: validated.username,
      usernameKey: validated.usernameKey,
      usernameUpdatedAt: now,
      fichas: (Number(current.fichas) || 0) - cost
    });
    tx.set(newNameRef, {
      uid,
      username: validated.username,
      updatedAt: now,
      ...(newNameSnap.exists() ? {} : { createdAt: now })
    }, { merge: newNameSnap.exists() });
    if (validated.usernameKey !== oldKey) tx.delete(oldNameRef);

    return normalizeProfileForClient({
      ...current,
      username: validated.username,
      usernameKey: validated.usernameKey,
      usernameUpdatedAt: now,
      fichas: (Number(current.fichas) || 0) - cost
    });
  });
  await statsBestEffort(uid, { fichasSpent: cost });
  void economyLogBestEffort({ targetUid: uid, source: 'username_rename', fichasDelta: -cost });
  return profile;
}

// Se llama una sola vez por cuenta para completar el mazo/colección inicial. Desde
// 23.13.24 normalmente users/{uid} YA existe como perfil mínimo starterDeckPending=true
// porque el username se elige antes. Conserva fallback de creación defensiva si la reserva
// existe pero el perfil todavía no llegó a escribirse por una ruta histórica.
export async function createUserProfile(uid, profileFields, starterCardIds) {
  const username = profileFields.username || '';
  const usernameKey = profileFields.usernameKey || '';
  const validated = assertValidUsernamePayload(username, usernameKey);
  const userRef = doc(db, 'users', uid);
  const nameRef = doc(db, 'usernames', validated.usernameKey);

  const profile = await runTransaction(db, async (tx) => {
    const [userSnap, nameSnap] = await Promise.all([tx.get(userRef), tx.get(nameRef)]);
    if (!nameSnap.exists() || nameSnap.data()?.uid !== uid) {
      throw usernameError('USERNAME_REQUIRED', 'Primero elegí tu nombre en Argentinia.');
    }

    const current = userSnap.exists() ? userSnap.data() : null;
    if (current && current.starterDeckPending !== true) {
      return normalizeProfileForClient(current);
    }

    const base = current || {
      displayName: profileFields.displayName || '',
      photoURL: profileFields.photoURL || '',
      email: profileFields.email || '',
      username: validated.username,
      usernameKey: validated.usernameKey,
      usernameUpdatedAt: serverTimestamp(),
      points: 0,
      fichas: 0,
      enhancements: {},
      inventory: defaultInventory(),
      dailyRewards: defaultDailyRewardsState(),
      activeMatchId: null,
      createdAt: serverTimestamp()
    };
    const patch = {
      collection: starterCardIds,
      decks: [
        { id: 'starter', name: 'Mazo 1', cardIds: starterCardIds, isDefault: true, createdAt: Date.now() }
      ],
      starterDeckPending: false,
      lastSeenAt: serverTimestamp()
    };
    if (current) tx.update(userRef, patch);
    else tx.set(userRef, { ...base, ...patch });
    return normalizeProfileForClient({ ...base, ...patch });
  });
  await statsBestEffort(uid, {});
  return profile;
}

// Actualiza SOLO la marca de última conexión, sin tocar el resto del documento (merge:true)
// — se llama cada vez que un jugador YA existente vuelve a loguearse.
export function touchLastSeen(uid) {
  return setDoc(doc(db, 'users', uid), { lastSeenAt: serverTimestamp() }, { merge: true });
}

// Borra el documento completo del jugador — colección, puntos, Fichas, mazos, todo. Pensada
// para testing/desarrollo (reiniciar tu propia cuenta), pero cualquiera puede borrar LA
// SUYA — no hace falta un rol especial, las reglas de Firestore ya limitan esto a "tu
// propio documento". La confirmación (escribir "ELIMINAR") vive en la UI, no acá — esta
// función no vuelve a preguntar nada, ejecuta directo.
export async function deleteUserProfile(uid) {
  const userRef = doc(db, 'users', uid);
  const statsRef = doc(db, 'playerStats', uid);
  return runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;
    const usernameKey = String(userSnap.data()?.usernameKey || '');
    let usernameRef = null;
    let usernameSnap = null;
    if (usernameKey) {
      usernameRef = doc(db, 'usernames', usernameKey);
      usernameSnap = await tx.get(usernameRef);
    }
    tx.delete(userRef);
    tx.delete(statsRef);
    if (usernameRef && usernameSnap?.exists() && usernameSnap.data()?.uid === uid) tx.delete(usernameRef);
  });
}

// ============================================================================
// FASE 2: economía (puntos, sobres, Fichas). Las 3 funciones de abajo usan una
// TRANSACCIÓN de Firestore cada una — no un simple "leer y después escribir" — para que
// dos escrituras casi simultáneas (ej. doble click comprando un sobre) no puedan pisarse
// entre sí ni gastar puntos/Fichas que ya no estaban. Firestore reintenta la transacción
// sola si detecta que el documento cambió en el medio.
// ============================================================================

// Suma (o resta) puntos de forma atómica, y nunca deja el total por debajo de 0 — se usa
// tanto para premiar victorias/derrotas como para penalizar abandonos (delta negativo).
// Devuelve el total de puntos ya actualizado.
export async function awardPoints(uid, delta) {
  const baseDelta = Math.floor(Number(delta) || 0);
  const snapshot = baseDelta > 0 ? await getCampaignSnapshotForEconomy(uid) : buildCampaignSnapshot([], Date.now());
  const effectiveDelta = baseDelta > 0 ? effectiveMatchPoints(baseDelta, snapshot) : baseDelta;
  const ref = doc(db, 'users', uid);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().points || 0) : 0;
    const next = Math.max(0, current + effectiveDelta);
    tx.update(ref, { points: next });
    return { current, next, appliedDelta: next - current };
  });
  const applied = Number(result.appliedDelta) || 0;
  await statsBestEffort(uid, applied >= 0 ? { pointsEarned: applied } : { pointsLost: Math.abs(applied) });
  void economyLogBestEffort({ targetUid: uid, source: applied >= 0 ? 'game_reward' : 'abandon_penalty', pointsDelta: applied });
  return { total: result.next, appliedDelta: applied, baseDelta, campaignSnapshot: snapshot };
}


// 23.13.59 — premios de FIN DE PARTIDA durables e idempotentes.
// `awardPoints()` sigue existiendo para ajustes/penalidades generales; gameplay terminal usa
// este contrato con receipt estable. La cola local se crea antes de cualquier await y la
// transacción acredita puntos + crea el receipt de manera atómica.
function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deriveTerminalOutcome(match) {
  const hostDeadByHp = Number.isFinite(Number(match?.hostHP)) && Number(match.hostHP) <= 0;
  const guestDeadByHp = Number.isFinite(Number(match?.guestHP)) && Number(match.guestHP) <= 0;
  const hostDeadByPoison = Number(match?.hostPoison || 0) >= 10;
  const guestDeadByPoison = Number(match?.guestPoison || 0) >= 10;
  // Deck-out es terminal sólo al INTENTAR robar: el estado público queda en fase draw,
  // con el jugador activo correspondiente y DeckCount=0. Tener 0 cartas fuera del draw no
  // alcanza por sí solo para perder.
  const hostDeckedOut = match?.gameOver === true && match?.phase === 'draw' && match?.activePlayer === 'host' && Number(match?.hostDeckCount || 0) <= 0;
  const guestDeckedOut = match?.gameOver === true && match?.phase === 'draw' && match?.activePlayer === 'guest' && Number(match?.guestDeckCount || 0) <= 0;
  const hostDefeated = hostDeadByHp || hostDeadByPoison || hostDeckedOut;
  const guestDefeated = guestDeadByHp || guestDeadByPoison || guestDeckedOut;

  if (match?.abandonedBy === 'host' || match?.abandonedBy === 'guest') {
    return {
      terminalKind: 'abandon',
      loserRole: match.abandonedBy,
      winnerRole: match.abandonedBy === 'host' ? 'guest' : 'host'
    };
  }
  if (hostDefeated !== guestDefeated) {
    return hostDefeated
      ? { terminalKind: 'natural', loserRole: 'host', winnerRole: 'guest' }
      : { terminalKind: 'natural', loserRole: 'guest', winnerRole: 'host' };
  }
  return null;
}

function matchIdFromReward(reward = {}) {
  const explicit = String(reward.matchId || '').trim().toUpperCase();
  if (explicit) return explicit;
  const m = String(reward.receiptId || '').match(/^match_([A-Za-z0-9]+)_(?:host|guest)$/);
  return m ? m[1].toUpperCase() : '';
}

// 23.13.68 — sella una sola vez el resultado terminal con hora de SERVIDOR. No decide
// puntos: sólo congela evidencia que después usa el ledger económico PvP.
export async function sealMultiplayerOutcome(matchId) {
  const ref = doc(db, 'matches', String(matchId || '').trim().toUpperCase());
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('PVP_MATCH_NOT_FOUND');
    const data = snap.data() || {};
    if (data.endedAt && data.terminalKind && data.winnerRole) {
      return {
        terminalKind: data.terminalKind,
        winnerRole: data.winnerRole,
        turnCountAtEnd: Number(data.turnCountAtEnd || data.turnCount || 1)
      };
    }
    const terminal = deriveTerminalOutcome(data);
    if (!data.gameOver || !terminal) throw new Error('PVP_MATCH_NOT_TERMINAL');
    if (!data.bothReadyAt && !(data.hostReady === true && data.guestReady === true)) throw new Error('PVP_MATCH_NOT_READY');
    const turnCountAtEnd = Math.max(1, Math.floor(Number(data.turnCount) || 1));
    const terminalPatch = {
      terminalKind: terminal.terminalKind,
      winnerRole: terminal.winnerRole,
      turnCountAtEnd,
      endedAt: serverTimestamp()
    };
    // Compat de deploy: matches creados antes de 23.13.68 pueden haber quedado con ambos
    // Ready pero sin bothReadyAt. Lo sellamos ahora con hora de servidor. Un abandono legacy
    // queda deliberadamente con duración 0 (no premio); un final natural igual es elegible.
    if (!data.bothReadyAt) terminalPatch.bothReadyAt = serverTimestamp();
    tx.update(ref, terminalPatch);
    return { ...terminal, turnCountAtEnd };
  });
}

function normalizeSoloRewardDifficulty(value) {
  const key = String(value || '').trim().toLowerCase();
  return ['easy','medium','hard'].includes(key) ? key : null;
}

// Mantiene exactamente la migración 23.17.2 de store.js también en la capa de settlement:
// si winVsTanoMedio todavía no existe, el viejo winVsTanoDificil representa a Medio y el
// nuevo Difícil conserva 200 como default.
function normalizeSoloRewardConfig(settings = {}) {
  const intOr = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
  const hasMedium = Number.isFinite(Number(settings?.winVsTanoMedio));
  const hasLegacyDifficult = Number.isFinite(Number(settings?.winVsTanoDificil));
  return {
    easy: intOr(settings?.winVsTanoFacil, 50),
    medium: hasMedium ? intOr(settings.winVsTanoMedio, 100) : (hasLegacyDifficult ? intOr(settings.winVsTanoDificil, 100) : 100),
    hard: hasMedium && hasLegacyDifficult ? intOr(settings.winVsTanoDificil, 200) : 200,
    loss: intOr(settings?.lossVsTano, 15)
  };
}

function expectedSoloRewardBase(config, outcome, difficulty) {
  if (outcome === 'loss') return config.loss;
  if (difficulty === 'hard') return config.hard;
  if (difficulty === 'medium') return config.medium;
  if (difficulty === 'easy') return config.easy;
  return null;
}

function legacySoloRewardMatchesConfig(config, outcome, baseDelta) {
  if (outcome === 'loss') return baseDelta === config.loss;
  return [config.easy, config.medium, config.hard].includes(baseDelta);
}

async function settleSoloGameRewardOnce(uid, reward, snapshot, requestedEffectiveDelta) {
  const receiptId = normalizeGameRewardReceiptId(reward.receiptId);
  const baseDelta = Math.max(0, Math.floor(Number(reward.baseDelta) || 0));
  const outcome = reward.outcome === 'loss' ? 'loss' : 'win';
  const requestedDifficulty = normalizeSoloRewardDifficulty(reward.difficulty);
  const userRef = doc(db, 'users', uid);
  const receiptRef = doc(db, 'gameRewardReceipts', `${uid}_${receiptId}`);
  const settingsRef = doc(db, 'gameConfig', 'settings');
  const result = await runTransaction(db, async tx => {
    // Todas las lecturas antes de cualquier escritura: Firestore transactions lo exigen y
    // además la configuración que valida el premio queda congelada para este settlement.
    const receiptSnap = await tx.get(receiptRef);
    const userSnap = await tx.get(userRef);
    const settingsSnap = await tx.get(settingsRef);
    if (!userSnap.exists()) throw new Error('No se encontró tu perfil.');
    const current = Math.max(0, Math.floor(Number(userSnap.data()?.points) || 0));
    if (receiptSnap.exists()) {
      const previous = receiptSnap.data() || {};
      return {
        duplicate: true,
        current,
        next: current,
        appliedDelta: Number(previous.effectiveDelta) || 0,
        effectiveDelta: Number(previous.effectiveDelta) || requestedEffectiveDelta,
        rewardReason: previous.rewardReason || 'duplicate',
        difficulty: previous.difficulty || requestedDifficulty || null
      };
    }

    const rewardConfig = normalizeSoloRewardConfig(settingsSnap.exists() ? settingsSnap.data() : {});
    const exactExpected = expectedSoloRewardBase(rewardConfig, outcome, requestedDifficulty);
    const validBase = requestedDifficulty
      ? baseDelta === exactExpected
      : legacySoloRewardMatchesConfig(rewardConfig, outcome, baseDelta);
    if (!validBase) throw new Error('SOLO_REWARD_CONFIG_MISMATCH');

    const storedDifficulty = requestedDifficulty || 'legacy';
    const next = current + requestedEffectiveDelta;
    tx.update(userRef, { points: next });
    tx.set(receiptRef, {
      uid, receiptId, mode: 'solo', outcome, difficulty: storedDifficulty, baseDelta,
      effectiveDelta: requestedEffectiveDelta,
      resultingTotal: next, engineVersion: ENGINE_VERSION, createdAt: serverTimestamp()
    });
    return {
      duplicate: false,
      current,
      next,
      appliedDelta: requestedEffectiveDelta,
      effectiveDelta: requestedEffectiveDelta,
      rewardReason: 'rewarded',
      difficulty: storedDifficulty
    };
  });
  return { ...result, total: result.next, baseDelta, receiptId, mode: 'solo', outcome, difficulty: result.difficulty || requestedDifficulty || null, campaignSnapshot: snapshot };
}

async function settlePvpGameRewardOnce(uid, reward, snapshot, requestedEffectiveDelta) {
  const receiptId = normalizeGameRewardReceiptId(reward.receiptId);
  const baseDelta = Math.max(0, Math.floor(Number(reward.baseDelta) || 0));
  const outcome = reward.outcome === 'loss' ? 'loss' : 'win';
  const matchId = matchIdFromReward(reward);
  if (!matchId) throw new Error('PVP_MATCH_ID_REQUIRED');

  const userRef = doc(db, 'users', uid);
  const receiptRef = doc(db, 'gameRewardReceipts', `${uid}_${receiptId}`);
  const matchRef = doc(db, 'matches', matchId);
  const settingsRef = doc(db, 'gameConfig', 'settings');

  const result = await runTransaction(db, async tx => {
    // Todas las lecturas antes de cualquier escritura.
    const receiptSnap = await tx.get(receiptRef);
    const userSnap = await tx.get(userRef);
    const matchSnap = await tx.get(matchRef);
    const settingsSnap = await tx.get(settingsRef);
    if (!userSnap.exists()) throw new Error('No se encontró tu perfil.');
    if (!matchSnap.exists()) throw new Error('PVP_MATCH_NOT_FOUND');

    const current = Math.max(0, Math.floor(Number(userSnap.data()?.points) || 0));
    if (receiptSnap.exists()) {
      const previous = receiptSnap.data() || {};
      return {
        duplicate: true,
        current,
        next: current,
        appliedDelta: Number(previous.effectiveDelta) || 0,
        effectiveDelta: Number(previous.effectiveDelta) || 0,
        requestedEffectiveDelta: Number(previous.requestedEffectiveDelta) || Number(previous.effectiveDelta) || requestedEffectiveDelta,
        rewardReason: previous.rewardReason || 'duplicate',
        terminalKind: previous.terminalKind || null,
        durationMs: Number(previous.durationMs) || 0,
        completedTurns: Number(previous.completedTurns) || 0,
        pvpDayKey: previous.pvpDayKey || null,
        pairCountAfter: Number(previous.pairCountAfter) || 0,
        dailyPointsAfter: Number(previous.dailyPointsAfter) || 0,
        limits: previous.limits || null
      };
    }

    const match = matchSnap.data() || {};
    if (!match.endedAt || !match.terminalKind || !match.winnerRole) throw new Error('PVP_MATCH_NOT_SEALED');
    const myRole = match.hostUid === uid ? 'host' : (match.guestUid === uid ? 'guest' : null);
    if (!myRole) throw new Error('PVP_NOT_MATCH_PARTICIPANT');
    const terminal = deriveTerminalOutcome(match);
    if (!terminal || terminal.terminalKind !== match.terminalKind || terminal.winnerRole !== match.winnerRole) throw new Error('PVP_TERMINAL_EVIDENCE_MISMATCH');
    const actualOutcome = match.winnerRole === myRole ? 'win' : 'loss';
    if (actualOutcome !== outcome) throw new Error('PVP_OUTCOME_MISMATCH');

    const limits = normalizePvpRewardLimits(settingsSnap.exists() ? settingsSnap.data() : {});
    const endedAtMs = timestampMs(match.endedAt);
    const bothReadyAtMs = timestampMs(match.bothReadyAt);
    const durationMs = bothReadyAtMs > 0 && endedAtMs >= bothReadyAtMs ? endedAtMs - bothReadyAtMs : 0;
    const turnCountAtEnd = Math.max(1, Math.floor(Number(match.turnCountAtEnd || match.turnCount) || 1));
    const completedTurns = pvpCompletedTurns(turnCountAtEnd);
    const dayKey = argentinaDayKeyFromMs(endedAtMs || Date.now());
    const pairKey = pvpPairKey(match.hostUid, match.guestUid);
    const pairRef = doc(db, 'pvpDailyPairs', `${dayKey}__${pairKey}`);
    const dailyRef = doc(db, 'pvpDailyUsers', `${dayKey}__${uid}`);
    const pairSnap = await tx.get(pairRef);
    const dailySnap = await tx.get(dailyRef);
    const pairData = pairSnap.exists() ? (pairSnap.data() || {}) : {};
    const dailyData = dailySnap.exists() ? (dailySnap.data() || {}) : {};
    const rewardedMatchIds = Array.isArray(pairData.rewardedMatchIds) ? pairData.rewardedMatchIds : [];
    const pairAlreadyRewarded = rewardedMatchIds.includes(matchId);
    const pairRewardedCount = Math.max(0, Math.floor(Number(pairData.rewardedMatches) || rewardedMatchIds.length));
    const dailyPointsAwarded = Math.max(0, Math.floor(Number(dailyData.pointsAwarded) || 0));

    const verdict = evaluatePvpRewardEligibility({
      terminalKind: match.terminalKind,
      durationMs,
      turnCountAtEnd,
      pairAlreadyRewarded,
      pairRewardedCount,
      dailyPointsAwarded,
      requestedDelta: requestedEffectiveDelta,
      limits
    });

    const passesEarlyGate = match.terminalKind !== 'abandon'
      || (durationMs >= limits.minRewardMinutes * 60000 && completedTurns >= limits.minCompletedTurns);
    const pairCanCount = pairAlreadyRewarded || pairRewardedCount < limits.maxRewardedMatchesPerPairDaily;
    const shouldRegisterPairMatch = passesEarlyGate && pairCanCount && !pairAlreadyRewarded;
    const pairCountAfter = pairRewardedCount + (shouldRegisterPairMatch ? 1 : 0);
    const appliedDelta = Math.max(0, Math.floor(Number(verdict.appliedDelta) || 0));
    const dailyPointsAfter = dailyPointsAwarded + appliedDelta;
    const next = current + appliedDelta;

    if (shouldRegisterPairMatch) {
      tx.set(pairRef, {
        schemaVersion: 1,
        dayKey,
        uidA: [String(match.hostUid), String(match.guestUid)].sort()[0],
        uidB: [String(match.hostUid), String(match.guestUid)].sort()[1],
        rewardedMatches: pairCountAfter,
        rewardedMatchIds: rewardedMatchIds.concat([matchId]),
        updatedAt: serverTimestamp()
      });
    }
    if (appliedDelta > 0) {
      tx.update(userRef, { points: next });
      const priorReceipts = Array.isArray(dailyData.rewardReceiptIds) ? dailyData.rewardReceiptIds : [];
      tx.set(dailyRef, {
        schemaVersion: 1,
        dayKey,
        uid,
        pointsAwarded: dailyPointsAfter,
        rewardReceiptIds: priorReceipts.includes(receiptId) ? priorReceipts : priorReceipts.concat([receiptId]),
        updatedAt: serverTimestamp()
      });
    }

    tx.set(receiptRef, {
      uid,
      receiptId,
      mode: 'multiplayer',
      outcome,
      baseDelta,
      requestedEffectiveDelta,
      effectiveDelta: appliedDelta,
      resultingTotal: next,
      matchId,
      terminalKind: match.terminalKind,
      rewardReason: verdict.reason,
      durationMs,
      completedTurns,
      pvpDayKey: dayKey,
      pairKey,
      pairCountAfter,
      dailyPointsAfter,
      limits,
      engineVersion: ENGINE_VERSION,
      createdAt: serverTimestamp()
    });

    return {
      duplicate: false,
      current,
      next,
      appliedDelta,
      effectiveDelta: appliedDelta,
      requestedEffectiveDelta,
      rewardReason: verdict.reason,
      terminalKind: match.terminalKind,
      durationMs,
      completedTurns,
      pvpDayKey: dayKey,
      pairCountAfter,
      dailyPointsAfter,
      limits
    };
  });

  return { ...result, total: result.next, baseDelta, receiptId, mode: 'multiplayer', outcome, matchId, campaignSnapshot: snapshot };
}

async function settleGameRewardOnce(uid, reward = {}) {
  const receiptId = normalizeGameRewardReceiptId(reward.receiptId);
  const baseDelta = Math.max(0, Math.floor(Number(reward.baseDelta) || 0));
  const mode = reward.mode === 'multiplayer' ? 'multiplayer' : 'solo';
  if (!uid || !receiptId || baseDelta <= 0) throw new Error('GAME_REWARD_INVALID_REQUEST');

  if (mode === 'multiplayer') {
    // También corre al reconciliar la cola después de F5: si el match ya quedó terminal
    // pero la pestaña murió antes del sellado, lo completa antes de liquidar.
    await sealMultiplayerOutcome(matchIdFromReward(reward));
  }
  const snapshot = await getCampaignSnapshotForEconomy(uid);
  const requestedEffectiveDelta = effectiveMatchPoints(baseDelta, snapshot);
  const result = mode === 'multiplayer'
    ? await settlePvpGameRewardOnce(uid, reward, snapshot, requestedEffectiveDelta)
    : await settleSoloGameRewardOnce(uid, reward, snapshot, requestedEffectiveDelta);

  if (!result.duplicate && Number(result.appliedDelta) > 0) {
    await statsBestEffort(uid, { pointsEarned: Math.max(0, Number(result.appliedDelta) || 0) });
    void economyLogBestEffort({
      targetUid: uid,
      source: 'game_reward',
      pointsDelta: Math.max(0, Number(result.appliedDelta) || 0),
      sessionId: receiptId
    });
  }
  return result;
}

export async function awardGamePointsOnce(uid, reward = {}) {
  const pending = queuePendingGameReward(uid, reward);
  if (!pending) throw new Error('GAME_REWARD_INVALID_REQUEST');
  try {
    const result = await settleGameRewardOnce(uid, pending);
    removePendingGameReward(uid, pending.receiptId);
    return result;
  } catch (error) {
    // El pending queda deliberadamente persistido para el próximo boot/login.
    throw error;
  }
}

export async function flushPendingGameRewards(uid) {
  const pending = pendingGameRewardsForUid(uid);
  if (!pending.length) return { attempted: 0, settled: 0, failed: 0, latestTotal: null, results: [] };
  const results = [];
  let settled = 0;
  let failed = 0;
  let latestTotal = null;
  for (const reward of pending) {
    try {
      const result = await settleGameRewardOnce(uid, reward);
      removePendingGameReward(uid, reward.receiptId);
      settled += 1;
      if (Number.isFinite(Number(result?.total))) latestTotal = Number(result.total);
      results.push({
        receiptId: reward.receiptId,
        ok: true,
        duplicate: !!result?.duplicate,
        total: result?.total ?? null,
        appliedDelta: Number(result?.appliedDelta) || 0,
        rewardReason: result?.rewardReason || 'rewarded'
      });
    } catch (error) {
      failed += 1;
      results.push({ receiptId: reward.receiptId, ok: false, code: error?.code || error?.name || 'ERROR', message: error?.message || String(error) });
    }
  }
  return { attempted: pending.length, settled, failed, latestTotal, results };
}

// 23.13.0 — Comprar ya NO abre el sobre. La transacción descuenta puntos y deposita una
// unidad en Mi Cofre; abrirlo es otra acción atómica. Esto unifica sobres comprados,
// recompensas diarias y futuros regalos/admin bajo el mismo inventario persistente.
export async function purchasePack(uid, baseCost) {
  const snapshot = await getCampaignSnapshotForEconomy(uid);
  const cost = effectivePackCost(baseCost, snapshot);
  const ref = doc(db, 'users', uid);
  const profile = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const currentPoints = data.points || 0;
    if (currentPoints < cost) throw new Error('No te alcanzan los puntos para este sobre.');
    const inventory = normalizeInventory(data.inventory);
    inventory[CHEST_ITEM_KEYS.standardPack] += 1;
    const updated = { points: currentPoints - cost, inventory };
    tx.update(ref, updated);
    return { ...data, ...updated, dailyRewards: normalizeDailyRewardsState(data.dailyRewards) };
  });
  await statsBestEffort(uid, { pointsSpent: cost, packsReceived: 1 });
  void economyLogBestEffort({ targetUid: uid, source: 'pack_purchase', pointsDelta: -cost, packsDelta: 1 });
  return { profile, effectiveCost: cost, baseCost: Math.max(0, Math.floor(Number(baseCost) || 0)), campaignSnapshot: snapshot };
}

function validatePackCardIds(cardIds) {
  if (!Array.isArray(cardIds) || cardIds.length !== 15) throw new Error('El contenido del sobre no es válido.');
  const cards = cardIds.map(id => cardDb.getById(id));
  if (cards.some(c => !c)) throw new Error('El sobre contiene una carta desconocida.');
  if (!cards.some(c => c.rarity === 'Rare' || c.rarity === 'Mythic')) throw new Error('El sobre no contiene su slot raro/mítico.');
  return cards;
}

// Consume UN sobre ya existente en Mi Cofre, agrega sus 15 cartas a la colección y entrega
// la +1 Ficha histórica recién al ABRIR (no al comprar). Así un sobre regalado se comporta
// exactamente igual que uno comprado.
export async function openInventoryPack(uid, newCardIds) {
  validatePackCardIds(newCardIds);
  const campaignSnapshot = await getCampaignSnapshotForEconomy(uid);
  const fichasGain = effectiveFichas(1, campaignSnapshot, { packOpen: true });
  const ref = doc(db, 'users', uid);
  const profile = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const inventory = normalizeInventory(data.inventory);
    if (inventory[CHEST_ITEM_KEYS.standardPack] < 1) throw new Error('No tenés sobres para abrir.');
    inventory[CHEST_ITEM_KEYS.standardPack] -= 1;
    const updated = {
      inventory,
      collection: [...(data.collection || []), ...newCardIds],
      fichas: (data.fichas || 0) + fichasGain
    };
    tx.update(ref, updated);
    return { ...data, ...updated, dailyRewards: normalizeDailyRewardsState(data.dailyRewards) };
  });
  await statsBestEffort(uid, { fichasEarned: fichasGain, packsOpened: 1 });
  void economyLogBestEffort({ targetUid: uid, source: 'pack_open', fichasDelta: fichasGain, packsDelta: -1, cardsDelta: newCardIds.length });
  return profile;
}

// Consume la recompensa final del pase y agrega exactamente UNA carta Mythic existente.
export async function openGuaranteedMythic(uid, cardId) {
  const card = cardDb.getById(cardId);
  if (!card || card.rarity !== 'Mythic') throw new Error('La recompensa mítica no es válida.');
  const ref = doc(db, 'users', uid);
  const profile = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const inventory = normalizeInventory(data.inventory);
    if (inventory[CHEST_ITEM_KEYS.guaranteedMythic] < 1) throw new Error('No tenés recompensas míticas para abrir.');
    inventory[CHEST_ITEM_KEYS.guaranteedMythic] -= 1;
    const updated = { inventory, collection: [...(data.collection || []), cardId] };
    tx.update(ref, updated);
    return { ...data, ...updated, dailyRewards: normalizeDailyRewardsState(data.dailyRewards) };
  });
  await statsBestEffort(uid, { guaranteedMythicsOpened: 1 });
  void economyLogBestEffort({ targetUid: uid, source: 'guaranteed_mythic_open', cardsDelta: 1 });
  return profile;
}

// ============================================================================
// 23.13.3 — RELOJ AUTORITATIVO + RACHA MÓVIL DE 7 DÍAS.
// El reloj real sigue viniendo de serverTimestamp()/getDocFromServer(). El offset QA ya NO
// vive en rewardDebug/{uid}: queda como campo aislado del propio perfil admin para evitar el
// permiso fallido observado físicamente en 23.13.2 y reducir una colección/regla extra.
// Security Rules vuelve a calcular el mismo día desde request.time y autoriza ese campo sólo
// para la cuenta admin autenticada.
// ============================================================================
async function fetchRewardDebugOffsetDays(uid) {
  if (!(auth.currentUser?.uid === uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL)) return 0;
  try {
    const snap = await getDocFromServer(doc(db, 'users', uid));
    return snap.exists() ? Math.max(0, Math.min(30, Math.floor(Number(snap.data().rewardDebugOffsetDays) || 0))) : 0;
  } catch {
    return 0;
  }
}

const authoritativeClockInFlight = new Map();

function firestoreTimestampLikeToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function readAuthoritativeServerClockOnce(uid) {
  const ref = doc(db, 'rewardClock', uid);
  // 23.17.3.4 — un único probe sirve a Daily y Clasificados. El write queda sellado por
  // Rules con request.time; la lectura posterior sólo acepta la misma attestation.
  await setDoc(ref, { now: serverTimestamp(), rulesVersion: REWARD_RULES_VERSION });
  const snap = await getDocFromServer(ref);
  const clockData = snap.exists() ? snap.data() : {};
  if (clockData.rulesVersion !== REWARD_RULES_VERSION) {
    throw new Error(`RULES_VERSION_MISMATCH_${REWARD_RULES_VERSION.replaceAll('.', '_')}`);
  }
  const serverNow = firestoreTimestampLikeToDate(clockData.now);
  if (!serverNow) {
    const error = new Error('SERVER_CLOCK_UNRESOLVED');
    error.code = 'SERVER_CLOCK_UNRESOLVED';
    throw error;
  }
  return { serverNow, rulesVersion: clockData.rulesVersion };
}

async function getAuthoritativeServerClock(uid) {
  if (!uid) throw new Error('SERVER_CLOCK_UID_REQUIRED');
  const existing = authoritativeClockInFlight.get(uid);
  if (existing) return existing;

  const task = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await readAuthoritativeServerClockOnce(uid);
      } catch (error) {
        lastError = error;
        // permission-denied / rules mismatch no son transitorios: fallar inmediatamente.
        if (error?.code === 'permission-denied' || String(error?.message || '').startsWith('RULES_VERSION_MISMATCH_')) throw error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 60 * (attempt + 1)));
      }
    }
    throw lastError || new Error('SERVER_CLOCK_UNAVAILABLE');
  })();

  authoritativeClockInFlight.set(uid, task);
  try {
    return await task;
  } finally {
    if (authoritativeClockInFlight.get(uid) === task) authoritativeClockInFlight.delete(uid);
  }
}

export async function getAuthoritativeRewardNow(uid) {
  const clock = await getAuthoritativeServerClock(uid);
  const debugOffsetDays = await fetchRewardDebugOffsetDays(uid);
  return {
    ...clock,
    effectiveNow: new Date(clock.serverNow.getTime() + debugOffsetDays * 86400000),
    debugOffsetDays
  };
}

// Clasificados SIEMPRE usa reloj real. El offset QA de Daily Rewards jamás puede adelantar
// o retroceder la tienda semanal del Admin.
export async function getAuthoritativeClassifiedsNow(uid) {
  const clock = await getAuthoritativeServerClock(uid);
  return { ...clock, effectiveNow: new Date(clock.serverNow.getTime()), debugOffsetDays: 0 };
}

function isAdminDailyQaUser(uid) {
  return auth.currentUser?.uid === uid
    && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

function buildDailyLoginPlan(data, now, clock) {
  const sourceDaily = hasAuthoritativeDailyState(data.dailyRewards) ? data.dailyRewards : null;
  const previous = normalizeDailyRewardsState(data.dailyRewards, now);
  const previousSchemaVersion = Math.max(0, Math.floor(Number(data.dailyRewards?.schemaVersion) || 0));
  const legacyContinuityMigration = previousSchemaVersion > 0 && previousSchemaVersion < 4;
  const login = advanceDailyLoginState(sourceDaily, now);
  if (legacyContinuityMigration && previous.streak > 0) {
    login.streakReset = true;
    login.cycleRestarted = true;
    login.repairApplied = true;
  }
  const inventory = normalizeInventory(data.inventory);
  const diagnostics = {
    adminQa: isAdminDailyQaUser(data.uid || auth.currentUser?.uid),
    schemaVersion: previousSchemaVersion,
    hasServerUpdatedAt: !!data.dailyRewards?.serverUpdatedAt,
    previousLastLoginDate: previous.lastLoginDate,
    previousPreviousLoginDate: previous.previousLoginDate,
    previousCycleStartDate: previous.cycleStartDate,
    previousStreak: previous.streak,
    previousUnlockedDays: previous.unlockedDays.slice(),
    previousClaimedDays: previous.claimedDays.slice(),
    previousLastClaimedDay: previous.lastClaimedDay,
    previousStateConsistent: sourceDaily ? isDailyStreakConsistent(sourceDaily, now) : false,
    previousAuthoritative: !!sourceDaily,
    legacyMigration: legacyContinuityMigration,
    effectiveDate: localDateKey(now),
    requestedRewardDay: login.rewardDay,
    requestedStreak: login.state.streak,
    requestedUnlockedDays: login.state.unlockedDays.slice(),
    requestedClaimedDays: login.state.claimedDays.slice(),
    requestedLastClaimedDay: login.state.lastClaimedDay,
    debugOffsetDays: clock.debugOffsetDays,
    rulesVersion: clock.rulesVersion || null
  };
  return { sourceDaily, previous, previousSchemaVersion, login, inventory, diagnostics };
}

function serializeDailyLoginPlan(data, plan, now, serverUpdatedAt = serverTimestamp()) {
  const persistedDaily = serializeDailyRewardsForFirestore(plan.login.state, now, serverUpdatedAt);
  if (plan.sourceDaily && plan.login.state.streak > 1 && data.dailyRewards?.serverCycleStartDay) {
    persistedDaily.serverCycleStartDay = data.dailyRewards.serverCycleStartDay;
    persistedDaily.serverPreviousLoginDay = data.dailyRewards.serverLastLoginDay;
  }
  return persistedDaily;
}

function dailyLoginResult(data, plan, clock, now, extraProfile = {}) {
  return {
    profile: { ...data, ...extraProfile, inventory: plan.inventory, dailyRewards: plan.login.state },
    diagnostics: plan.diagnostics,
    login: {
      newCalendarLogin: plan.login.newCalendarLogin,
      rewardDay: plan.login.rewardDay,
      rewardUnlocked: plan.login.rewardUnlocked,
      streakReset: plan.login.streakReset,
      cycleRestarted: plan.login.cycleRestarted,
      cycleCompleted: plan.login.cycleCompleted,
      repairApplied: plan.login.repairApplied === true,
      streak: plan.login.state.streak,
      cycleStartDate: plan.login.state.cycleStartDate,
      authoritative: true,
      serverNowMs: clock.serverNow.getTime(),
      effectiveNowMs: now.getTime(),
      debugOffsetDays: clock.debugOffsetDays,
      rulesVersion: clock.rulesVersion || null
    }
  };
}

async function applyAdminDailyDebugOffset(uid, mode) {
  if (!isAdminDailyQaUser(uid)) throw new Error('Esta herramienta de debug es exclusiva del admin.');
  const clock = await getAuthoritativeServerClock(uid);
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil admin.');
    const data = snap.data();
    const current = Math.max(0, Math.min(30, Math.floor(Number(data.rewardDebugOffsetDays) || 0)));
    const nextOffset = mode === 'reset' ? 0 : Math.min(30, current + 1);
    if (mode === 'advance' && current >= 30) throw new Error('El reloj QA ya está en el máximo de +30 días.');
    const now = new Date(clock.serverNow.getTime() + nextOffset * 86400000);
    const effectiveClock = { ...clock, effectiveNow: now, debugOffsetDays: nextOffset };
    const plan = buildDailyLoginPlan(data, now, effectiveClock);
    const update = { rewardDebugOffsetDays: nextOffset, lastSeenAt: serverTimestamp() };
    if (plan.login.newCalendarLogin) update.dailyRewards = serializeDailyLoginPlan(data, plan, now);
    tx.update(ref, update);
    return dailyLoginResult(data, plan, effectiveClock, now, { rewardDebugOffsetDays: nextOffset });
  });
}

// 23.13.62 — ADMIN QA ATÓMICO: el offset y la transición Daily se confirman juntos.
// Si Firestore rechaza Daily, el offset tampoco avanza y no queda un reloj desincronizado.
export async function adminAdvanceDailyRewardDebugDay(uid) {
  return applyAdminDailyDebugOffset(uid, 'advance');
}

export async function adminResetDailyRewardDebug(uid) {
  return applyAdminDailyDebugOffset(uid, 'reset');
}

// Registra como máximo UN login por fecha oficial ART. Primer acceso = Día 1. El día
// siguiente avanza hasta Día 7; un gap reinicia Día 1; después de Día 7, el siguiente día
// consecutivo empieza un ciclo nuevo. La operación es idempotente el mismo día.
const dailyLoginInFlight = new Map();

async function registerDailyLoginOnce(uid, nowMs = null) {
  const clock = nowMs == null
    ? await getAuthoritativeRewardNow(uid)
    : { serverNow: new Date(nowMs), effectiveNow: new Date(nowMs), debugOffsetDays: 0, rulesVersion: null };
  const now = clock.effectiveNow;
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const plan = buildDailyLoginPlan(data, now, clock);
    if (plan.login.newCalendarLogin) {
      tx.update(ref, {
        // 23.17.3.4: serverUpdatedAt es metadata tomada del rewardClock ya resuelto. Evitamos
        // un transform anidado dentro de dailyRewards; la autorización vive en lastSeenAt=request.time.
        dailyRewards: serializeDailyLoginPlan(data, plan, now, clock.serverNow),
        lastSeenAt: serverTimestamp()
      });
    } else {
      tx.update(ref, { lastSeenAt: serverTimestamp() });
    }
    return dailyLoginResult(data, plan, clock, now);
  });
}

export async function registerDailyLogin(uid, nowMs = null) {
  // En producción el callback de Auth puede repetirse durante popup/F5. No ejecutamos dos
  // transacciones Daily paralelas para la misma cuenta. Los tests con nowMs siguen aislados.
  if (nowMs != null) return registerDailyLoginOnce(uid, nowMs);
  const existing = dailyLoginInFlight.get(uid);
  if (existing) return existing;
  const task = registerDailyLoginOnce(uid, null);
  dailyLoginInFlight.set(uid, task);
  try {
    return await task;
  } finally {
    if (dailyLoginInFlight.get(uid) === task) dailyLoginInFlight.delete(uid);
  }
}

// Claim separado del login: entrar desbloquea y RECLAMAR acredita. Los premios pertenecen
// al ciclo activo. Antes de reclamar exigimos que hoy ya haya sido registrado con el reloj
// oficial; así una llamada manual no puede cobrar un ciclo viejo después de cortar la racha.
export async function claimDailyReward(uid, day, nowMs = null) {
  const clock = nowMs == null
    ? await getAuthoritativeRewardNow(uid)
    : { serverNow: new Date(nowMs), effectiveNow: new Date(nowMs), debugOffsetDays: 0 };
  const now = clock.effectiveNow;
  const reward = rewardForDay(day);
  if (!reward) throw new Error('Ese premio diario no existe.');
  const campaignSnapshot = buildCampaignSnapshot(await fetchCampaignEvents(100), clock.serverNow);
  const effectiveReward = {
    ...reward,
    rewards: (reward.rewards || []).map(item => {
      const amount = Math.max(0, Math.floor(Number(item?.amount) || 0));
      if (item?.type === 'points') return { ...item, amount: effectiveAllPoints(amount, campaignSnapshot) };
      if (item?.type === 'fichas') return { ...item, amount: effectiveFichas(amount, campaignSnapshot) };
      return { ...item, amount };
    })
  };
  const ref = doc(db, 'users', uid);
  const profile = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    if (!hasAuthoritativeDailyState(data.dailyRewards)) throw new Error('Volvé a entrar para sincronizar tu racha con el reloj oficial.');
    const dailyRewards = normalizeDailyRewardsState(data.dailyRewards, now);
    if (dailyRewards.lastLoginDate !== localDateKey(now)) throw new Error('Volvé a entrar hoy para activar tu recompensa diaria.');
    if (!isRewardClaimable(dailyRewards, day, now)) throw new Error('Ese premio no está disponible o ya fue reclamado.');
    const rewarded = applyRewardToProfileData({ ...data, inventory: normalizeInventory(data.inventory) }, effectiveReward);
    const claimedDays = [...dailyRewards.claimedDays, Number(day)];
    const nextDaily = { ...dailyRewards, claimedDays, lastClaimedDay: Number(day) };
    // 23.17.3.4: misma simplificación que login. serverUpdatedAt conserva hora de servidor
    // obtenida del rewardClock; sólo lastSeenAt usa transform de request.time como sello de Rules.
    const persistedDaily = serializeDailyRewardsForFirestore(nextDaily, now, clock.serverNow);
    persistedDaily.serverLastLoginDay = data.dailyRewards.serverLastLoginDay;
    persistedDaily.serverPreviousLoginDay = data.dailyRewards.serverPreviousLoginDay || null;
    persistedDaily.serverCycleStartDay = data.dailyRewards.serverCycleStartDay;
    const updated = {
      points: Number(rewarded.points) || 0,
      fichas: Number(rewarded.fichas) || 0,
      inventory: normalizeInventory(rewarded.inventory),
      dailyRewards: persistedDaily,
      lastSeenAt: serverTimestamp()
    };
    tx.update(ref, updated);
    return { ...data, ...updated, dailyRewards: nextDaily };
  });
  const rewardTotals = (effectiveReward.rewards || []).reduce((acc, item) => {
    const amount = Math.max(0, Math.floor(Number(item?.amount) || 0));
    if (item?.type === 'points') acc.points += amount;
    else if (item?.type === 'fichas') acc.fichas += amount;
    else if (item?.type === 'standardPack') acc.packs += amount;
    return acc;
  }, { points: 0, fichas: 0, packs: 0 });
  await statsBestEffort(uid, { pointsEarned: rewardTotals.points, fichasEarned: rewardTotals.fichas, packsReceived: rewardTotals.packs });
  void economyLogBestEffort({ targetUid: uid, source: 'daily_reward', pointsDelta: rewardTotals.points, fichasDelta: rewardTotals.fichas, packsDelta: rewardTotals.packs });
  return profile;
}

// Craftea una mejora permanente: gasta `fichaCost` Fichas para taggear UNA carta que ya
// tenés (y que todavía no esté mejorada) con una keyword de la lista curada
// (ENHANCEMENT_KEYWORDS en store.js). Devuelve el perfil ya actualizado.
export async function craftEnhancement(uid, cardId, keyword, fichaCost) {
  // 23.13.37 craft hotfix — las mejoras actuales son exclusivamente keywords de criatura.
  // No confiamos sólo en el filtro visual: cualquier caller interno que intente pasar una
  // Tierra/Artefacto/etc. queda rechazado antes de tocar Fichas o Firestore.
  const cardDef = cardDb.getById(cardId);
  if (!isEnhancementEligibleCard(cardDef)) {
    throw new Error('Por ahora sólo se pueden mejorar Criaturas.');
  }
  const ref = doc(db, 'users', uid);
  const profile = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const currentFichas = data.fichas || 0;
    if (currentFichas < fichaCost) throw new Error('No te alcanzan las Fichas.');
    const enhancements = data.enhancements || {};
    if (enhancements[cardId]) throw new Error('Esa carta ya tiene una mejora.');
    if (!(data.collection || []).includes(cardId)) throw new Error('No tenés esa carta en tu colección.');

    const updated = {
      fichas: currentFichas - fichaCost,
      enhancements: { ...enhancements, [cardId]: keyword }
    };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
  const spent = Math.max(0, Math.floor(Number(fichaCost) || 0));
  await statsBestEffort(uid, { fichasSpent: spent });
  void economyLogBestEffort({ targetUid: uid, source: 'enhancement_craft', fichasDelta: -spent });
  return profile;
}

// FASE 3, ETAPA 2: crea un mazo nuevo (límite global admin-editable, contando el inicial). Todo
// validado DENTRO de la transacción — no confía en que el cliente ya haya chequeado esto,
// lo vuelve a comprobar del lado "servidor": máximo de mazos, nombre no vacío, al menos
// una carta, y que ninguna carta use más copias de las que realmente están en tu colección.
// Valida que cardIds represente un mazo legal para esta cuenta (tamaño exacto, posesión
// real, tope de copias, reglas de la copia mejorada) — compartido entre createDeck y
// updateDeck, porque las reglas son EXACTAMENTE las mismas para crear un mazo nuevo o
// editar uno existente. Tira una excepción con mensaje claro si algo no cumple.
function validateDeckCards(data, name, cardIds, { allowVirtualAdminPool = false } = {}) {
  if (!name || !name.trim()) throw new Error('El mazo necesita un nombre.');
  // BUGFIX: el input del cliente ya limita a 30 caracteres (maxlength), pero esto es la
  // defensa real del lado del servidor — un nombre más largo rompía el layout de la
  // tarjeta del mazo en "Mis Mazos" (se salía de la caja).
  if (name.trim().length > 30) throw new Error('El nombre del mazo no puede tener más de 30 caracteres.');
  // FASE 3, ETAPA 3: tamaño de mazo rígido — ni de más, ni de menos. (Sí, en el
  // reglamento real de MTG 60 es un PISO, no un tope — acá se decidió a propósito que sea
  // exacto para esta versión del juego.)
  if (!cardIds || cardIds.length !== DECK_SIZE_EXACT) {
    throw new Error(`El mazo tiene que tener exactamente ${DECK_SIZE_EXACT} cartas (tiene ${cardIds ? cardIds.length : 0}).`);
  }

  const ownedCounts = {};
  if (allowVirtualAdminPool) {
    // 23.11.13 — colección virtual de test: el admin puede guardar mazos contra todo el
    // pool sin persistir 511 IDs/copias artificiales en su perfil. Los topes legales de
    // copias siguen aplicando más abajo; sólo se saltea la restricción económica de posesión.
    cardDb.allCards.forEach(card => {
      ownedCounts[card.id] = card.type?.includes('básica') ? DECK_SIZE_EXACT : MAX_COPIES_PER_CARD;
    });
  } else {
    (data.collection || []).forEach(id => { ownedCounts[id] = (ownedCounts[id] || 0) + 1; });
  }

  // FASE 3 (revisión): "crea_028::enhanced" representa la copia puntual mejorada por
  // Fichas — para el tope de copias/posesión cuenta como la MISMA carta base que
  // "crea_028" (no podés tener 4 planas + 1 mejorada = 5, seguiría violando la 100.2a),
  // pero se valida aparte que: 1) esa carta REALMENTE tenga una mejora crafteada, y
  // 2) nunca se pida más de 1 copia mejorada de la misma carta (solo existe 1).
  const enhancements = data.enhancements || {};
  const requestedCounts = {};
  const enhancedSlotCounts = {};
  cardIds.forEach(id => {
    const isEnhancedSlot = id.endsWith(ENHANCED_SUFFIX);
    const baseId = isEnhancedSlot ? id.slice(0, -ENHANCED_SUFFIX.length) : id;
    requestedCounts[baseId] = (requestedCounts[baseId] || 0) + 1;
    if (isEnhancedSlot) enhancedSlotCounts[baseId] = (enhancedSlotCounts[baseId] || 0) + 1;
  });

  for (const [baseId, count] of Object.entries(requestedCounts)) {
    if (count > (ownedCounts[baseId] || 0)) throw new Error('Estás usando más copias de una carta de las que tenés.');
    // Regla oficial 100.2a: máximo 4 copias de una misma carta, salvo Tierras básicas
    // (esas no tienen límite, ni acá ni en MTG real).
    const cardDef = cardDb.getById(baseId);
    const isBasicLand = cardDef && cardDef.type.includes('básica');
    if (!isBasicLand && count > MAX_COPIES_PER_CARD) {
      throw new Error(`No podés tener más de ${MAX_COPIES_PER_CARD} copias de la misma carta (salvo Tierras básicas)${cardDef ? `: ${cardDef.name}` : ''}.`);
    }
  }
  for (const [baseId, count] of Object.entries(enhancedSlotCounts)) {
    const enhancedCardDef = cardDb.getById(baseId);
    if (!isEnhancementEligibleCard(enhancedCardDef)) {
      throw new Error('Las mejoras permanentes sólo pueden aplicarse a Criaturas.');
    }
    if (!enhancements[baseId]) throw new Error('Estás usando la copia mejorada de una carta que no tiene ninguna mejora crafteada.');
    if (count > 1) throw new Error('Solo puede haber una copia mejorada de la misma carta en el mazo.');
  }

  // Tope total de cartas mejoradas por mazo (admin-editable, default 3) — sin esto, un
  // jugador con muchas Fichas podría armar un mazo entero de bombas mejoradas.
  const totalEnhancedInDeck = Object.values(enhancedSlotCounts).reduce((sum, n) => sum + n, 0);
  if (totalEnhancedInDeck > MAX_ENHANCED_CARDS_PER_DECK) {
    throw new Error(`No podés tener más de ${MAX_ENHANCED_CARDS_PER_DECK} cartas mejoradas en el mismo mazo.`);
  }
}

export async function createDeck(uid, name, cardIds) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const decks = data.decks || [];

    if (decks.length >= MAX_SAVED_DECKS) throw new Error(`Ya tenés el máximo de ${MAX_SAVED_DECKS} mazos.`);
    validateDeckCards(data, name, cardIds, {
      allowVirtualAdminPool: auth.currentUser?.uid === uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL
    });

    const newDeck = { id: `deck_${Date.now()}`, name: name.trim(), cardIds, isDefault: false, createdAt: Date.now() };
    const updated = { decks: [...decks, newDeck] };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}


// 23.17.3.1 — compra atómica + attestation server-side de un Mazo Prearmado oficial.
// Lee el catálogo bundled y la configuración pública actual antes de entrar a la transacción;
// dentro de la transacción vuelve a leer gameConfig/settings para que precio/cupo sean los
// valores autoritativos publicados por Admin en ese instante.
export async function purchasePrebuiltDeck(uid, productId, deckName) {
  await cardDb.loadAll();
  const catalog = await loadPrebuiltDeckCatalog();
  const product = catalog.products.find(entry => entry.id === String(productId || ''));
  if (!product) {
    const error = new Error('Ese mazo prearmado no existe.'); error.code='PREBUILT_NOT_FOUND'; throw error;
  }
  const legal = validatePrebuiltDeckProduct(product, cardDb.allCards);
  if (!legal.ok) {
    const error = new Error(`El mazo oficial no supera su contrato de legalidad: ${legal.errors.join(', ')}`); error.code='PREBUILT_INVALID_PRODUCT'; throw error;
  }
  const cleanName=String(deckName||'').trim();
  if (!cleanName) { const error=new Error('Elegí un nombre para el mazo.'); error.code='PREBUILT_NAME_REQUIRED'; throw error; }
  if (cleanName.length>30) { const error=new Error('El nombre del mazo no puede tener más de 30 caracteres.'); error.code='PREBUILT_NAME_TOO_LONG'; throw error; }

  // 23.17.3.1 — fail closed: antes de tocar economía, exigimos que Firestore acepte la
  // attestation 23.13.71. Con Rules anteriores el probe es rechazado y la compra NO ocurre.
  try {
    await getAuthoritativeServerClock(uid);
  } catch (cause) {
    const error=new Error('La compra segura de Mazos Prearmados requiere Firestore Rules 23.13.71 publicadas.');
    error.code='PREBUILT_RULES_STALE'; error.cause=cause; throw error;
  }

  const userRef=doc(db,'users',uid);
  const settingsRef=doc(db,'gameConfig','settings');
  const result=await runTransaction(db, async tx => {
    const [userSnap,settingsSnap]=await Promise.all([tx.get(userRef),tx.get(settingsRef)]);
    if(!userSnap.exists()) throw new Error('No se encontró tu perfil.');
    const data=userSnap.data();
    const settings=settingsSnap.exists()?settingsSnap.data():{};
    const pointsCost=Math.max(0,Math.floor(Number(settings.prebuiltDeckPoints ?? PREBUILT_DECK_POINTS)||0));
    const fichasCost=Math.max(0,Math.floor(Number(settings.prebuiltDeckFichas ?? PREBUILT_DECK_FICHAS)||0));
    const maxDecks=Math.max(1,Math.floor(Number(settings.maxSavedDecks ?? MAX_SAVED_DECKS)||MAX_SAVED_DECKS));
    const decks=Array.isArray(data.decks)?data.decks:[];
    if(decks.length>=maxDecks){ const error=new Error(`Ya tenés el máximo de ${maxDecks} mazos.`); error.code='PREBUILT_DECK_LIMIT'; throw error; }
    const purchased=getPrebuiltPurchaseIds(data);
    if(purchased.includes(product.id)){ const error=new Error('Ese mazo prearmado ya fue comprado por esta cuenta.'); error.code='PREBUILT_ALREADY_PURCHASED'; throw error; }
    const points=Math.max(0,Math.floor(Number(data.points)||0));
    const fichas=Math.max(0,Math.floor(Number(data.fichas)||0));
    if(points<pointsCost || fichas<fichasCost){ const error=new Error('No te alcanzan los puntos o las Fichas.'); error.code='PREBUILT_INSUFFICIENT_FUNDS'; throw error; }

    const collection=[...(Array.isArray(data.collection)?data.collection:[]),...product.cardIds];
    const synthetic={...data,collection};
    validateDeckCards(synthetic,cleanName,product.cardIds,{allowVirtualAdminPool:false});
    const now=Date.now();
    const newDeck={id:`prebuilt_${product.id}_${now}`,name:cleanName,cardIds:[...product.cardIds],isDefault:false,createdAt:now,prebuiltProductId:product.id};
    const receipt={productId:product.id,purchasedAt:now,deckId:newDeck.id,pointsCost,fichasCost};
    const receipts={...(data.prebuiltDeckPurchases&&typeof data.prebuiltDeckPurchases==='object'&&!Array.isArray(data.prebuiltDeckPurchases)?data.prebuiltDeckPurchases:{}),[product.id]:receipt};
    const updated={
      points:points-pointsCost,
      fichas:fichas-fichasCost,
      collection,
      decks:[...decks,newDeck],
      prebuiltDeckPurchases:receipts
    };
    tx.update(userRef,updated);
    return {profile:normalizeProfileForClient({...data,...updated}),pointsCost,fichasCost,cardsGranted:product.cardIds.length,deck:newDeck};
  });
  await statsBestEffort(uid,{pointsSpent:result.pointsCost,fichasSpent:result.fichasCost});
  void economyLogBestEffort({targetUid:uid,source:'prebuilt_deck_purchase',pointsDelta:-result.pointsCost,fichasDelta:-result.fichasCost,cardsDelta:result.cardsGranted});
  return result;
}

// Edita un mazo YA GUARDADO — mismas reglas que crear uno nuevo (mismo validateDeckCards),
// pero reemplaza el nombre/cardIds del mazo existente en vez de sumar uno a la lista.
// Conserva su id/isDefault/createdAt originales — solo cambia el contenido.
export async function updateDeck(uid, deckId, name, cardIds) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const decks = data.decks || [];
    const idx = decks.findIndex(d => d.id === deckId);
    if (idx === -1) throw new Error('Ese mazo ya no existe.');

    validateDeckCards(data, name, cardIds, {
      allowVirtualAdminPool: auth.currentUser?.uid === uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL
    });

    const newDecks = [...decks];
    newDecks[idx] = { ...decks[idx], name: name.trim(), cardIds };
    const updated = { decks: newDecks };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}

// Borra un mazo guardado — nunca deja la cuenta sin ninguno (siempre tiene que quedar al
// menos 1 para poder jugar). Si el que se borra era el "Default" y quedan otros, el primero
// que quede pasa a serlo — para que nunca quede una cuenta sin ningún mazo marcado así.
export async function deleteDeck(uid, deckId) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const decks = data.decks || [];
    if (decks.length <= 1) throw new Error('No podés eliminar tu único mazo — siempre tiene que quedar al menos uno.');
    const idx = decks.findIndex(d => d.id === deckId);
    if (idx === -1) throw new Error('Ese mazo ya no existe.');

    const remaining = decks.filter(d => d.id !== deckId);
    if (decks[idx].isDefault && !remaining.some(d => d.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    const updated = { decks: remaining };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}

// ============================================================================
// 23.13.25 — AVISOS CLASIFICADOS: backend semanal + compra atómica.
//
// `gameConfig/classifiedsSchedule` es una cartelera pública pero de escritura Admin-only.
// Contiene la semana actual y una ventana futura; así las siete cartas y sus precios quedan
// congelados por semana y Firestore Rules puede validar la compra contra una fuente trusted.
// ============================================================================
const CLASSIFIEDS_SCHEDULE_DOCUMENT_ID = 'classifiedsSchedule';

function isRuntimeAdmin() {
  return auth.currentUser?.uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

function normalizeScheduleForClient(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? { ...data, weeks: data.weeks && typeof data.weeks === 'object' ? data.weeks : {} }
    : null;
}

function sameScheduledWeekContent(a, b) {
  if (!a || !b) return false;
  const dateMs = value => {
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? NaN : d.getTime();
  };
  return dateMs(a.weekStart) === dateMs(b.weekStart)
    && JSON.stringify(a.cardIds || []) === JSON.stringify(b.cardIds || [])
    && JSON.stringify(a.rarities || {}) === JSON.stringify(b.rarities || {})
    && JSON.stringify(a.prices || {}) === JSON.stringify(b.prices || {})
    && a.premiumRarity === b.premiumRarity
    && a.poolFingerprint === b.poolFingerprint
    && a.economyFingerprint === b.economyFingerprint
    && Number(a.algorithmVersion) === Number(b.algorithmVersion);
}

// El Admin mantiene automáticamente una ventana móvil: 4 semanas históricas + actual +
// 26 futuras. Si cambia el pool o la economía, la semana ACTUAL se preserva y sólo se
// regeneran semanas futuras, evitando que una oferta cambie un jueves porque ajustamos un
// precio o agregamos contenido.
let classifiedsScheduleEnsureInFlight = null;

async function ensureClassifiedsScheduleOnce() {
  if (!isRuntimeAdmin()) return { skipped: true, reason: 'not_admin' };
  await cardDb.loadAll();
  const clock = await getAuthoritativeClassifiedsNow(auth.currentUser.uid);
  const currentWeekKey = classifiedsWeekKey(clock.serverNow);
  const scheduleRef = doc(db, 'gameConfig', CLASSIFIEDS_SCHEDULE_DOCUMENT_ID);
  const settingsRef = doc(db, 'gameConfig', 'settings');

  return runTransaction(db, async tx => {
    const scheduleSnap = await tx.get(scheduleRef);
    const settingsSnap = await tx.get(settingsRef);
    const previous = normalizeScheduleForClient(scheduleSnap.exists() ? scheduleSnap.data() : null) || { weeks: {} };
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const economy = getClassifiedsEconomySnapshot(settings);
    const generated = buildClassifiedsScheduleWindow(cardDb.allCards, clock.serverNow, economy, {
      historyWeeks: CLASSIFIEDS_SCHEDULE_HISTORY_WEEKS,
      horizonWeeks: CLASSIFIEDS_SCHEDULE_HORIZON_WEEKS
    });

    const sourceChanged = Number(previous.schemaVersion) !== CLASSIFIEDS_SCHEMA_VERSION
      || Number(previous.algorithmVersion) !== CLASSIFIEDS_ALGORITHM_VERSION
      || previous.poolFingerprint !== generated.poolFingerprint
      || previous.economyFingerprint !== generated.economyFingerprint;

    const nextWeeks = {};
    let changed = !scheduleSnap.exists();
    for (const [weekKey, generatedWeek] of Object.entries(generated.weeks)) {
      const oldWeek = previous.weeks?.[weekKey] || null;
      const preservePublished = weekKey <= currentWeekKey && oldWeek && validateClassifiedsScheduleWeek(oldWeek, cardDb);
      const selected = preservePublished ? oldWeek : ((sourceChanged || !oldWeek) ? generatedWeek : oldWeek);
      nextWeeks[weekKey] = selected;
      if (!sameScheduledWeekContent(oldWeek, selected)) changed = true;
    }

    const previousKeys = Object.keys(previous.weeks || {}).sort();
    const nextKeys = Object.keys(nextWeeks).sort();
    if (JSON.stringify(previousKeys) !== JSON.stringify(nextKeys)) changed = true;

    if (!changed) {
      return { skipped: false, changed: false, currentWeekKey, totalWeeks: nextKeys.length };
    }

    tx.set(scheduleRef, {
      schemaVersion: CLASSIFIEDS_SCHEMA_VERSION,
      algorithmVersion: CLASSIFIEDS_ALGORITHM_VERSION,
      poolFingerprint: generated.poolFingerprint,
      economyFingerprint: generated.economyFingerprint,
      currentWeekKey,
      weeks: nextWeeks,
      updatedAt: serverTimestamp()
    });
    return { skipped: false, changed: true, currentWeekKey, totalWeeks: nextKeys.length };
  });
}

export async function ensureClassifiedsSchedule() {
  if (!isRuntimeAdmin()) return { skipped: true, reason: 'not_admin' };
  if (classifiedsScheduleEnsureInFlight) return classifiedsScheduleEnsureInFlight;
  const task = ensureClassifiedsScheduleOnce();
  classifiedsScheduleEnsureInFlight = task;
  try {
    return await task;
  } finally {
    if (classifiedsScheduleEnsureInFlight === task) classifiedsScheduleEnsureInFlight = null;
  }
}

export async function loadClassifiedsSchedule({ forceServer = false } = {}) {
  const ref = doc(db, 'gameConfig', CLASSIFIEDS_SCHEDULE_DOCUMENT_ID);
  const snap = forceServer ? await getDocFromServer(ref) : await getDoc(ref);
  return normalizeScheduleForClient(snap.exists() ? snap.data() : null);
}

export async function fetchCurrentClassifieds(uid) {
  await cardDb.loadAll();
  const clock = await getAuthoritativeClassifiedsNow(uid);
  const [schedule, profileSnap] = await Promise.all([
    loadClassifiedsSchedule({ forceServer: true }),
    getDocFromServer(doc(db, 'users', uid))
  ]);
  if (!profileSnap.exists()) throw new Error('No se encontró tu perfil.');
  const week = getScheduledClassifiedsWeek(schedule, clock.serverNow);
  if (!week || !validateClassifiedsScheduleWeek(week, cardDb)) {
    const error = new Error('Los Avisos Clasificados de esta semana todavía no fueron publicados.');
    error.code = 'CLASSIFIEDS_WEEK_NOT_PUBLISHED';
    throw error;
  }

  const profile = normalizeProfileForClient(profileSnap.data());
  const weeklyState = getClassifiedsProfileState(profile, week.weekKey);
  const entries = week.cardIds.map((cardId, slot) => {
    const rarity = week.rarities[cardId];
    const price = week.prices?.[rarity] || { points: 0, fichas: 0 };
    return {
      slot,
      cardId,
      rarity,
      points: Math.max(0, Math.floor(Number(price.points) || 0)),
      fichas: Math.max(0, Math.floor(Number(price.fichas) || 0)),
      ownedCount: countOwnedClassifiedCard(profile, cardId),
      purchased: weeklyState.purchased.includes(cardId)
    };
  });

  return {
    schemaVersion: CLASSIFIEDS_SCHEMA_VERSION,
    weekKey: week.weekKey,
    weekStart: week.weekStart,
    premiumRarity: week.premiumRarity,
    serverNow: clock.serverNow,
    entries,
    purchased: weeklyState.purchased,
    purchaseCounts: weeklyState.counts,
    profile
  };
}

function nextClassifiedsCounts(previous, rarity, reset = false) {
  const counts = reset ? normalizeClassifiedsPurchaseCounts(null) : normalizeClassifiedsPurchaseCounts(previous);
  if (!Object.hasOwn(counts, rarity)) throw new Error('CLASSIFIEDS_INVALID_RARITY');
  counts[rarity] += 1;
  if (counts.Common > 4 || counts.Uncommon > 2 || counts.Rare + counts.Mythic > 1) {
    throw new Error('CLASSIFIEDS_SLOT_LIMIT_REACHED');
  }
  return counts;
}

// Una sola transacción sobre users/{uid}. Firestore reintenta si otra pestaña ganó la
// carrera. Las Rules 23.13.25 validan además contra la semana trusted publicada en
// gameConfig/classifiedsSchedule: cardId, rareza, precio, cupo semanal y append de colección.
export async function purchaseClassifiedCard(uid, cardId) {
  await cardDb.loadAll();
  const clock = await getAuthoritativeClassifiedsNow(uid);
  const schedule = await loadClassifiedsSchedule({ forceServer: true });
  const week = getScheduledClassifiedsWeek(schedule, clock.serverNow);
  if (!week || !validateClassifiedsScheduleWeek(week, cardDb)) {
    const error = new Error('Los Avisos Clasificados de esta semana todavía no fueron publicados.');
    error.code = 'CLASSIFIEDS_WEEK_NOT_PUBLISHED';
    throw error;
  }
  if (!week.cardIds.includes(cardId)) {
    const error = new Error('Esa carta no forma parte de los Avisos Clasificados de esta semana.');
    error.code = 'CLASSIFIEDS_CARD_NOT_OFFERED';
    throw error;
  }

  const rarity = week.rarities[cardId];
  const price = week.prices?.[rarity];
  if (!price || !Number.isInteger(price.points) || !Number.isInteger(price.fichas) || price.points < 0 || price.fichas < 0) {
    throw new Error('CLASSIFIEDS_PRICE_INVALID');
  }

  const ref = doc(db, 'users', uid);
  const profile = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const state = getClassifiedsProfileState(data, week.weekKey);
    if (state.purchased.includes(cardId)) {
      const error = new Error('Esa carta ya la compraste esta semana.');
      error.code = 'CLASSIFIEDS_ALREADY_PURCHASED';
      throw error;
    }

    const currentPoints = Math.max(0, Math.floor(Number(data.points) || 0));
    const currentFichas = Math.max(0, Math.floor(Number(data.fichas) || 0));
    if (currentPoints < price.points || currentFichas < price.fichas) {
      const error = new Error('No te alcanzan los puntos o las Fichas para comprar esta carta.');
      error.code = 'CLASSIFIEDS_INSUFFICIENT_FUNDS';
      throw error;
    }

    const sameWeek = String(data.classifiedsWeekKey || '') === week.weekKey;
    const purchased = sameWeek ? [...state.purchased, cardId] : [cardId];
    const counts = nextClassifiedsCounts(data.classifiedsPurchaseCounts, rarity, !sameWeek);
    const purchase = {
      weekKey: week.weekKey,
      cardId,
      rarity,
      pointsCost: price.points,
      fichasCost: price.fichas
    };
    const updated = {
      points: currentPoints - price.points,
      fichas: currentFichas - price.fichas,
      collection: [...(data.collection || []), cardId],
      classifiedsWeekKey: week.weekKey,
      classifiedsPurchased: purchased,
      classifiedsPurchaseCounts: counts,
      classifiedsLastPurchase: purchase,
      classifiedsUpdatedAt: serverTimestamp()
    };
    tx.update(ref, updated);
    return normalizeProfileForClient({ ...data, ...updated, classifiedsUpdatedAt: new Date() });
  });
  await statsBestEffort(uid, { pointsSpent: price.points, fichasSpent: price.fichas });
  void economyLogBestEffort({ targetUid: uid, source: 'classified_purchase', pointsDelta: -price.points, fichasDelta: -price.fichas, cardsDelta: 1 });
  return profile;
}

// ============================================================================
// PANEL DE ADMIN: la configuración de balance vive en un documento aparte
// (gameConfig/settings), NO en el perfil de ningún jugador — cualquiera puede LEERLA (todo
// el mundo necesita los valores actuales para jugar, esté logueado o no), pero solo el
// admin puede ESCRIBIRLA. Ese "solo el admin puede escribir" NO se decide acá — lo decide
// firestore.rules del lado del servidor, que es lo que de verdad protege esto. El chequeo
// de "sos vos, Pablo" que hace la UI (ver ui.js) es solo para no mostrar el botón, no es
// seguridad real.
const GAME_CONFIG_DOCUMENT_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function assertGameConfigDocumentId(documentId) {
  const id = String(documentId || '').trim();
  if (!GAME_CONFIG_DOCUMENT_ID_RE.test(id)) {
    throw new Error('GAME_CONFIG_INVALID_DOCUMENT_ID');
  }
  return id;
}

// 23.13.22 — infraestructura común para configuración pública/admin. Mantiene los docs
// separados (settings, texts, futuro artLayouts, etc.) y evita construir paths arbitrarios.
// La SEGURIDAD real sigue en Firestore Rules: lectura pública, escritura sólo isAdmin().
export async function loadPublicGameConfigDocument(documentId) {
  const id = assertGameConfigDocumentId(documentId);
  const snap = await getDoc(doc(db, 'gameConfig', id));
  return snap.exists() ? snap.data() : null;
}

export async function saveAdminGameConfigDocument(documentId, config) {
  const id = assertGameConfigDocumentId(documentId);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('GAME_CONFIG_INVALID_PAYLOAD');
  }
  await setDoc(doc(db, 'gameConfig', id), { ...config, updatedAt: serverTimestamp() });
}

// Wrappers históricos: settings conserva exactamente el contrato que ya usaba store.js/UI.
export async function loadGameConfig() {
  return loadPublicGameConfigDocument('settings');
}

export async function saveGameConfig(config) {
  return saveAdminGameConfigDocument('settings', config);
}

// 23.19.4 — kill switch visual independiente del balance/economía. Vive en su propio
// documento para que apagar animaciones nunca reescriba settings ni altere una partida.
export async function loadAnimationPolicy() {
  return loadPublicGameConfigDocument('animations');
}

export async function saveAnimationPolicy(config = {}) {
  const clampMultiplier = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0.25, Math.min(3, Math.round(n * 100) / 100));
  };
  const rawSpeeds = config?.speedMultipliers && typeof config.speedMultipliers === 'object' ? config.speedMultipliers : {};
  return saveAdminGameConfigDocument('animations', {
    enabled: config?.enabled !== false,
    speedMultipliers: {
      slow: clampMultiplier(rawSpeeds.slow, 1.35),
      normal: clampMultiplier(rawSpeeds.normal, 1),
      fast: clampMultiplier(rawSpeeds.fast, 0.68)
    },
    schemaVersion: 2,
    engineVersion: ENGINE_VERSION
  });
}

export function listenAnimationPolicy(onChange, onError = null) {
  const ref = doc(db, 'gameConfig', 'animations');
  return onSnapshot(ref, snap => {
    if (typeof onChange === 'function') onChange(snap.exists() ? snap.data() : null);
  }, err => { if (typeof onError === 'function') onError(err); });
}

// Cimiento de Textos del Juego. 23.13.22 NO lo carga durante boot ni migra copy existente;
// estas funciones quedan preparadas para el panel/migraciones de las Etapas 5 y 6.
export async function loadGameTextOverrides() {
  return loadPublicGameConfigDocument('texts');
}

export async function saveGameTextOverrides(documentData) {
  return saveAdminGameConfigDocument('texts', documentData);
}

// ============================================================================
// FASE 4: MATCHMAKING — cimiento del multiplayer. Resuelve "cómo se encuentran dos
// jugadores" (crear partida, unirse con un código, sala de espera en tiempo real). La
// sincronización de la partida EN SÍ (mano, campo, turnos) es la próxima etapa — acá
// todavía no hay ninguna jugada real que validar, por eso las reglas del documento público
// del match son permisivas (ver firestore.rules): el blindaje real que YA existe es el de
// matches/{matchId}/private/{uid}, donde en el futuro va a vivir la mano/mazo de cada uno.
// ============================================================================

// 6 caracteres, sin 0/O/1/I (se prestan a confusión al compartir el código de palabra o
// por mensaje) — de un alfabeto de 33 símbolos, 33^6 ≈ 1300 millones de combinaciones.
function generateMatchCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

// Crea una partida nueva y te suma como el primer jugador ("host"). Reintenta con un
// código nuevo si por casualidad ya existe uno igual (con 6 caracteres de ~33 posibles, la
// chance de choque es insignificante, pero por las dudas no se asume que nunca va a pasar).
export async function createMatch(uid, profileFields) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateMatchCode();
    const ref = doc(db, 'matches', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue; // choque rarísimo — probamos con otro código

    const startingRole = chooseMultiplayerStartingRole();
    const data = {
      status: 'waiting', // 'waiting' | 'active' | 'cancelled'
      hostUid: uid,
      // 23.13.52 — sorteo autoritativo del lobby. Se decide UNA sola vez al crear y el
      // guest sólo lo lee; ambos clientes derivan local/rival desde este mismo valor.
      startingRole,
      guestUid: null,
      hostReady: false,
      guestReady: false,
      bothReadyAt: null,
      // 23.17.4.2 — los campos terminales neutrales nacen en el lobby. Antes gameOver y
      // abandonedBy no existían hasta el primer publish del motor; Rules los veía como un
      // cambio protegido (missing→false/null) y rechazaba TODO snapshot vivo inicial.
      gameOver: false,
      abandonedBy: null,
      // 23.19 — revisión global del documento + revisión del último commit privado de
      // cada participante. Los cambios gameplay incrementan syncRevision en una transacción
      // atómica que puede incluir también private/{uid}; reconnect verifica la pareja.
      syncRevision: 0,
      syncFieldRevisions: {},
      hostPrivateRevision: 0,
      guestPrivateRevision: 0,
      // 23.19.1 — fencing por instancia. Evita que dos pestañas con el mismo uid
      // controlen simultáneamente el mismo rol; NO reemplaza el guard host!=guest.
      hostSessionId: MULTIPLAYER_CLIENT_SESSION_ID,
      guestSessionId: null,
      endedAt: null,
      terminalKind: null,
      winnerRole: null,
      turnCountAtEnd: null,
      engineVersion: ENGINE_VERSION,
      engineProtocolVersion: ENGINE_PROTOCOL_VERSION,
      hostEngineVersion: ENGINE_VERSION,
      guestEngineVersion: null,
      players: {
        [uid]: { username: profileFields.username || '', displayName: profileFields.username || '', photoURL: profileFields.photoURL || '' }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, data);
    // FASE 4, ETAPA 6: guardo el código en MI PROPIO perfil — así, si recargo la página a
    // mitad de partida, boot() (main.js) sabe que hay algo para reconectar sin necesitar
    // una consulta cruzada de colecciones (solo lee mi perfil, que ya carga de entrada).
    await setActiveMatchId(uid, code);
    return { code, ...data };
  }
  throw new Error('No se pudo generar un código de partida único. Probá de nuevo.');
}

// Se une a una partida existente por su código — rechaza si no existe, si ya está llena, si
// ya no está esperando, o si intentás unirte a tu propia partida.
export async function joinMatchByCode(uid, rawCode, profileFields) {
  const code = rawCode.trim().toUpperCase();
  const ref = doc(db, 'matches', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('No existe ninguna partida con ese código.');
  const data = snap.data();
  if (data.hostUid === uid) throw new Error('No podés unirte a tu propia partida.');
  if (!isExactMultiplayerVersionCompatible(data.engineVersion, data.engineProtocolVersion)) {
    const remote = data.engineVersion || 'versión anterior/desconocida';
    throw new Error(`Versión incompatible: la partida fue creada con ${remote} y esta notebook usa ${ENGINE_VERSION}. Actualizá ambas pestañas antes de jugar.`);
  }
  if (data.status !== 'waiting') throw new Error('Esa partida ya no está esperando jugadores.');
  if (data.guestUid) throw new Error('Esa partida ya tiene 2 jugadores.');

  const updated = {
    status: 'active',
    guestUid: uid,
    guestEngineVersion: ENGINE_VERSION,
    guestSessionId: MULTIPLAYER_CLIENT_SESSION_ID,
    players: {
      ...data.players,
      [uid]: { username: profileFields.username || '', displayName: profileFields.username || '', photoURL: profileFields.photoURL || '' }
    },
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, updated, { merge: true });
  await setActiveMatchId(uid, code); // mismo motivo que en createMatch
  return { code, ...data, ...updated };
}

// FASE 4, ETAPA 6: activeMatchId vive en MI PROPIO perfil (users/{uid}), no en el match en
// sí — así lo puedo leer apenas cargo mi perfil al arrancar, sin una consulta aparte.

// ENTREGA 23.7.2 — barrera de readiness: deck + mulligan local deben estar publicados
// antes de abrir la primera ventana de prioridad. Estos flags son públicos, no contienen
// cartas ni información privada.
export async function setMatchPlayerReady(matchId, role, ready = true) {
  if (role !== 'host' && role !== 'guest') throw new Error('Rol multiplayer inválido para readiness.');
  const ref = doc(db, 'matches', String(matchId || '').trim().toUpperCase());
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La partida ya no existe.');
    const data = snap.data() || {};
    const uid = auth.currentUser?.uid || null;
    const expectedUid = role === 'host' ? data.hostUid : data.guestUid;
    if (!uid || expectedUid !== uid) throw new Error('MULTIPLAYER_ROLE_UID_MISMATCH');
    const session = validateRoleSession(data, role, MULTIPLAYER_CLIENT_SESSION_ID);
    if (!session.ok) throw new Error('MULTIPLAYER_SESSION_SUPERSEDED');
    const patch = { [`${role}Ready`]: !!ready, updatedAt: serverTimestamp() };
    const otherRole = role === 'host' ? 'guest' : 'host';
    if (ready && data[`${otherRole}Ready`] === true && !data.bothReadyAt) {
      patch.bothReadyAt = serverTimestamp();
    }
    tx.update(ref, patch);
    return { bothReadyAtWasSet: !!patch.bothReadyAt };
  });
}

export async function setActiveMatchId(uid, matchId) {
  await setDoc(doc(db, 'users', uid), { activeMatchId: matchId }, { merge: true });
}

export async function clearActiveMatchId(uid) {
  await setDoc(doc(db, 'users', uid), { activeMatchId: null }, { merge: true });
}

// Trae todo lo necesario para reconectarme a una partida en curso: mi documento privado
// (mano/mazo reales) + el documento público (todo lo demás). Devuelve null si cualquiera de
// los dos ya no existe, o si la partida ya terminó — no tiene sentido ofrecer reconectarse
// a algo que ya no está en curso.
export async function fetchMatchForReconnect(matchId, uid) {
  const normalizedMatchId = String(matchId || '').trim().toUpperCase();
  const publicRef = doc(db, 'matches', normalizedMatchId);
  const privateRef = doc(db, 'matches', normalizedMatchId, 'private', uid);

  // 23.19 — lectura consistente. Promise.all(getDoc,getDoc) podía observar el documento
  // público antes de un commit y el privado después (o al revés). Una transacción de sólo
  // lectura toma ambos desde el mismo snapshot lógico de Firestore.
  return runTransaction(db, async tx => {
    const publicSnap = await tx.get(publicRef);
    const privateSnap = await tx.get(privateRef);
    if (!publicSnap.exists() || !privateSnap.exists()) return null;

    const publicDoc = publicSnap.data();
    const privateDoc = privateSnap.data();
    if (publicDoc.gameOver) return null;
    if (!isExactMultiplayerVersionCompatible(publicDoc.engineVersion, publicDoc.engineProtocolVersion)) {
      return {
        incompatible: true,
        engineVersion: publicDoc.engineVersion || null,
        engineProtocolVersion: publicDoc.engineProtocolVersion || null,
        publicDoc,
        privateDoc
      };
    }

    const role = publicDoc.hostUid === uid ? 'host' : (publicDoc.guestUid === uid ? 'guest' : null);
    if (!role) return null;
    const revisionIntegrity = validateReconnectRevisionPair(publicDoc, privateDoc, role);
    if (!revisionIntegrity.ok) {
      return {
        integrityError: true,
        integrityReason: revisionIntegrity.reason,
        expectedPrivateRevision: revisionIntegrity.expected,
        actualPrivateRevision: revisionIntegrity.actual,
        publicDoc,
        privateDoc
      };
    }
    const reconnectSafety = classifyReconnectSafety(publicDoc, role);
    return { publicDoc, privateDoc, reconnectSafety };
  });
}

// 23.19.1 — al ACEPTAR un reconnect, la nueva instancia reclama el rol. Abrir otra
// pestaña por sí solo no desplaza a la actual: el fencing cambia recién cuando el usuario
// decide reconectarse. El cliente viejo verá el sessionId distinto y quedará fail-closed.
export async function claimMatchRoleSession(matchId, uid, role, options = {}) {
  if (!matchId || !uid) throw new Error('MULTIPLAYER_SESSION_IDENTITY_REQUIRED');
  if (role !== 'host' && role !== 'guest') throw new Error('MULTIPLAYER_ROLE_INVALID');
  const ref = doc(db, 'matches', String(matchId).trim().toUpperCase());
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('MULTIPLAYER_MATCH_NOT_FOUND');
    const data = snap.data() || {};
    const expectedUid = role === 'host' ? data.hostUid : data.guestUid;
    if (expectedUid !== uid) throw new Error('MULTIPLAYER_ROLE_UID_MISMATCH');
    if (data.gameOver) throw new Error('MULTIPLAYER_MATCH_FINISHED');
    if (!isExactMultiplayerVersionCompatible(data.engineVersion, data.engineProtocolVersion)) {
      throw new Error('MULTIPLAYER_ENGINE_MISMATCH');
    }
    const safety = classifyReconnectSafety(data, role);
    if (!safety.ok && options.allowUnsafe !== true) throw new Error(`MULTIPLAYER_RECONNECT_UNSAFE:${safety.reason}`);
    const field = roleSessionField(role);
    const previousSessionId = data[field] || null;
    tx.update(ref, { [field]: MULTIPLAYER_CLIENT_SESSION_ID, updatedAt: serverTimestamp() });
    return { role, field, sessionId: MULTIPLAYER_CLIENT_SESSION_ID, previousSessionId };
  });
}

// Escucha cambios en tiempo real de una partida — así la sala de espera se entera sola
// apenas alguien se une, sin tener que refrescar nada a mano. Devuelve la función de
// unsubscribe (cortar la escucha al salir de la pantalla, para no dejarla corriendo de más).
export function listenToMatch(code, onUpdate, onError = null) {
  const ref = doc(db, 'matches', code.trim().toUpperCase());
  return onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    onUpdate(snap.exists() ? snap.data() : null, {
      hasPendingWrites: !!snap.metadata?.hasPendingWrites,
      fromCache: !!snap.metadata?.fromCache,
      receivedAtClientMs: Date.now()
    });
  }, (error) => {
    if (typeof onError === 'function') onError(error);
    else console.error('Listener multiplayer interrumpido:', error);
  });
}

// Cancela/borra una partida propia — pensada para cuando el host se cansa de esperar antes
// de que se una nadie. No tiene sentido dejar códigos de partidas abandonadas dando vueltas.
export async function cancelMatch(code, uid = null) {
  const matchRef = doc(db, 'matches', code.trim().toUpperCase());
  if (!uid) {
    await deleteDoc(matchRef);
    return;
  }
  const userRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (matchSnap.exists()) {
      const match = matchSnap.data() || {};
      if (match.hostUid !== uid || match.status !== 'waiting' || match.guestUid != null) {
        throw new Error('La sala ya no puede cancelarse desde este estado.');
      }
      tx.delete(matchRef);
    }
    // Se confirma en el mismo commit que el delete cuando el lobby existe. Si el documento
    // ya desapareció, igualmente limpia un activeMatchId histórico/huérfano del propio perfil.
    tx.update(userRef, { activeMatchId: null });
  });
}

// ============================================================================
// FASE 4, ETAPA 2: publicar mi mitad del estado — cada cliente escribe SOLO su propia
// mitad (ver matchSync.js: buildMyPublicPatch/buildMyPrivatePatch ya arman exactamente eso,
// nada del rival). merge:true en ambas para no pisar la mitad del otro jugador ni el resto
// del documento (players, status, etc.) que no forma parte de este patch.
// ============================================================================

// 23.19 — COMMIT ATÓMICO gameplay. Public + private viajan en la misma transacción y
// cada commit recibe una revisión global monotónica. Esto elimina el reconnect "partido"
// (mano privada de una jugada con board público de otra) y permite al listener descartar
// snapshots viejos sin perder cambios acumulados.
export async function publishMatchStateAtomic(matchId, uid, role, publicPatch = {}, privatePatch = {}) {
  if (!matchId || !uid) throw new Error('MULTIPLAYER_COMMIT_IDENTITY_REQUIRED');
  if (role !== 'host' && role !== 'guest') throw new Error('MULTIPLAYER_ROLE_INVALID');

  const matchRef = doc(db, 'matches', String(matchId).trim().toUpperCase());
  const privateRef = doc(db, 'matches', String(matchId).trim().toUpperCase(), 'private', uid);

  return runTransaction(db, async tx => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) throw new Error('MULTIPLAYER_MATCH_NOT_FOUND');
    const current = matchSnap.data() || {};
    const expectedUid = role === 'host' ? current.hostUid : current.guestUid;
    if (expectedUid !== uid) throw new Error('MULTIPLAYER_ROLE_UID_MISMATCH');
    if (!isExactMultiplayerVersionCompatible(current.engineVersion, current.engineProtocolVersion)) {
      throw new Error('MULTIPLAYER_ENGINE_MISMATCH');
    }
    const session = validateRoleSession(current, role, MULTIPLAYER_CLIENT_SESSION_ID);
    if (!session.ok) throw new Error('MULTIPLAYER_SESSION_SUPERSEDED');

    const nextRevision = normalizeSyncRevision(current.syncRevision) + 1;
    const publicKeys = Object.keys(publicPatch || {}).filter(key => key !== 'syncMeta');
    const privateKeys = Object.keys(privatePatch || {});
    const meta = publicPatch?.syncMeta && typeof publicPatch.syncMeta === 'object' ? publicPatch.syncMeta : {};
    const nextFieldRevisions = {
      ...(current.syncFieldRevisions && typeof current.syncFieldRevisions === 'object' ? current.syncFieldRevisions : {})
    };
    publicKeys.forEach(key => { nextFieldRevisions[key] = nextRevision; });
    const publicWrite = {
      ...(publicPatch || {}),
      syncRevision: nextRevision,
      syncFieldRevisions: nextFieldRevisions,
      syncMeta: {
        ...meta,
        serverRevision: nextRevision,
        serverCommittedAt: serverTimestamp(),
        engineVersion: ENGINE_VERSION,
        engineProtocolVersion: ENGINE_PROTOCOL_VERSION,
        touchedKeys: Array.isArray(meta.touchedKeys) ? meta.touchedKeys : publicKeys,
        privateTouchedKeys: privateKeys
      }
    };

    let privateWrite = null;
    if (privateKeys.length > 0) {
      const revisionField = privateRevisionField(role);
      publicWrite[revisionField] = nextRevision;
      privateWrite = { ...(privatePatch || {}), _syncRevision: nextRevision };
    }

    tx.set(matchRef, publicWrite, { merge: true });
    if (privateWrite) tx.set(privateRef, privateWrite, { merge: true });
    return {
      syncRevision: nextRevision,
      syncFieldRevisions: nextFieldRevisions,
      privateRevision: privateWrite ? nextRevision : null,
      publicKeys,
      privateKeys
    };
  });
}

// 23.19.1 — rutas legacy publishMyPublicState/publishMyPrivateState eliminadas.
// Gameplay multiplayer sólo puede escribir mediante publishMatchStateAtomic().

// ENTREGA 23.10 — CANAL EFÍMERO PARTICIPANT-ONLY PARA SELECCIONES PRIVADAS.
// A diferencia del documento público matches/{matchId}, estos documentos sólo pueden ser
// leídos/escritos por host o guest del match (ver Rules 23.13.76). Nunca son la fuente de verdad
// de mano/mazo: contienen únicamente una OFERTA saneada (tokens opacos o descriptores que el
// propio efecto permite revelar). La zona real sigue viviendo exclusivamente en private/{uid}.
function validateCurrentMatchSessionForUid(matchData, uid) {
  const role = matchData?.hostUid === uid ? 'host' : (matchData?.guestUid === uid ? 'guest' : null);
  if (!role) throw new Error('MULTIPLAYER_ROLE_UID_MISMATCH');
  const session = validateRoleSession(matchData, role, MULTIPLAYER_CLIENT_SESSION_ID);
  if (!session.ok) throw new Error('MULTIPLAYER_SESSION_SUPERSEDED');
  return role;
}

export async function publishPrivateSelectionOffer(matchId, requestId, offer) {
  const uid = auth.currentUser?.uid || null;
  if (!uid) throw new Error('MULTIPLAYER_SESSION_IDENTITY_REQUIRED');
  const normalizedMatchId = String(matchId || '').trim().toUpperCase();
  const matchRef = doc(db, 'matches', normalizedMatchId);
  const offerRef = doc(db, 'matches', normalizedMatchId, 'privateSelections', requestId);
  await runTransaction(db, async tx => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) throw new Error('MULTIPLAYER_MATCH_NOT_FOUND');
    const matchData = matchSnap.data() || {};
    const role = validateCurrentMatchSessionForUid(matchData, uid);
    if (offer?.ownerRole !== role) throw new Error('MULTIPLAYER_PRIVATE_SELECTION_OWNER_MISMATCH');
    tx.set(offerRef, {
      ...offer,
      ownerSessionId: MULTIPLAYER_CLIENT_SESSION_ID,
      updatedAt: serverTimestamp()
    });
  });
}

export async function fetchPrivateSelectionOffer(matchId, requestId) {
  const uid = auth.currentUser?.uid || null;
  if (!uid) throw new Error('MULTIPLAYER_SESSION_IDENTITY_REQUIRED');
  const normalizedMatchId = String(matchId || '').trim().toUpperCase();
  const matchRef = doc(db, 'matches', normalizedMatchId);
  const offerRef = doc(db, 'matches', normalizedMatchId, 'privateSelections', requestId);
  return runTransaction(db, async tx => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) throw new Error('MULTIPLAYER_MATCH_NOT_FOUND');
    validateCurrentMatchSessionForUid(matchSnap.data() || {}, uid);
    const snap = await tx.get(offerRef);
    return snap.exists() ? snap.data() : null;
  });
}

export async function deletePrivateSelectionOffer(matchId, requestId) {
  const uid = auth.currentUser?.uid || null;
  if (!uid) throw new Error('MULTIPLAYER_SESSION_IDENTITY_REQUIRED');
  const normalizedMatchId = String(matchId || '').trim().toUpperCase();
  const matchRef = doc(db, 'matches', normalizedMatchId);
  const offerRef = doc(db, 'matches', normalizedMatchId, 'privateSelections', requestId);
  await runTransaction(db, async tx => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) throw new Error('MULTIPLAYER_MATCH_NOT_FOUND');
    validateCurrentMatchSessionForUid(matchSnap.data() || {}, uid);
    tx.delete(offerRef);
  });
}

// ============================================================================
// PANEL DE ADMIN: "regalar puntos/Fichas" — la protección real de todo esto vive en
// firestore.rules (users/{userId}: el admin solo puede tocar points/fichas, nunca otro
// campo, garantizado con diff().affectedKeys().hasOnly([...])), no acá. Estas funciones
// asumen que quien las llama YA pasó ese chequeo del servidor — si no es el admin, Firestore
// va a rechazar el pedido igual, pase lo que pase de este lado.
// ============================================================================

// Trae TODOS los perfiles de usuario, para el desplegable de destinatarios — solo el admin
// tiene permiso de leer esto (ver firestore.rules); para cualquier otra cuenta, esta
// consulta la rechaza el servidor directo.
export async function fetchAllUserProfiles() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Le da (o le quita, si amount es negativo) puntos o Fichas a UN usuario puntual. Usa una
// transacción para no pisar un cambio concurrente (ej. el jugador comprando un sobre justo
// en ese momento) — mismo patrón que awardPoints/purchasePack. Nunca deja el valor en
// negativo, sea cual sea el monto pedido.
export async function adminGrantCurrency(targetUid, currencyField, amount) {
  const ref = doc(db, 'users', targetUid);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esa cuenta no existe.');
    const current = snap.data()[currencyField] || 0;
    const newValue = Math.max(0, current + amount);
    tx.update(ref, { [currencyField]: newValue });
    return { current, newValue };
  });
  const applied = result.newValue - result.current;
  const statDelta = currencyField === 'points' ? { pointsEarned: Math.max(0, applied) } : { fichasEarned: Math.max(0, applied) };
  await statsBestEffort(targetUid, statDelta);
  void economyLogBestEffort({ targetUid, source: 'admin_grant', pointsDelta: currencyField === 'points' ? applied : 0, fichasDelta: currencyField === 'fichas' ? applied : 0 });
  return result.newValue;
}

// Le da lo mismo a TODOS los usuarios — trae la lista completa y aplica adminGrantCurrency
// a cada uno. No es una única transacción atómica gigante (Firestore no está pensado para
// eso con potencialmente cientos de cuentas) — cada cuenta se actualiza en su propia
// transacción chica, en paralelo. Devuelve cuántas tuvieron éxito y cuántas fallaron, para
// que la UI pueda avisar si algo no se pudo aplicar.
export async function adminGrantCurrencyToAll(currencyField, amount) {
  const profiles = await fetchAllUserProfiles();
  const results = await Promise.allSettled(
    profiles.map(p => adminGrantCurrency(p.uid, currencyField, amount))
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  return { total: profiles.length, succeeded: profiles.length - failed, failed };
}


// 23.13.2 — Regalo de sobres al Cofre. Es inventario, no compra: no descuenta puntos y
// no abre el sobre. Firestore Rules permite al admin modificar únicamente standardPacks
// dentro del inventory de otra cuenta; guaranteedMythics queda fuera de este permiso.
export async function adminGrantPacks(targetUid, amount) {
  const delta = Math.floor(Number(amount) || 0);
  if (delta <= 0) throw new Error('La cantidad de sobres debe ser mayor que 0.');
  const ref = doc(db, 'users', targetUid);
  const total = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esa cuenta no existe.');
    const data = snap.data();
    const inventory = normalizeInventory(data.inventory);
    inventory[CHEST_ITEM_KEYS.standardPack] += delta;
    tx.update(ref, { inventory });
    return inventory[CHEST_ITEM_KEYS.standardPack];
  });
  await statsBestEffort(targetUid, { packsReceived: delta });
  void economyLogBestEffort({ targetUid, source: 'admin_pack_grant', packsDelta: delta });
  return total;
}

export async function adminGrantPacksToAll(amount) {
  const profiles = await fetchAllUserProfiles();
  const results = await Promise.allSettled(profiles.map(p => adminGrantPacks(p.uid, amount)));
  const failed = results.filter(r => r.status === 'rejected').length;
  return { total: profiles.length, succeeded: profiles.length - failed, failed };
}

// Registro liviano de auditoría — a quién, cuánto, de qué, y por qué (si se puso un
// motivo). No bloquea ni condiciona el regalo en sí (que ya se aplicó antes de llamar a
// esto) — es solo trazabilidad, mejor esfuerzo: si esto falla, el regalo ya se hizo igual.
export async function logAdminAction(action) {
  await setDoc(doc(collection(db, 'adminActions')), { ...action, timestamp: serverTimestamp() });
}

// ============================================================================
// ENTREGA 23.13.53 — Campañas: Anuncios + Eventos temporales.
// ============================================================================

function campaignDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeAnnouncementDoc(id, data = {}) {
  const legacyText = String(data.text || '').trim();
  const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs.map(x => String(x || '')).filter(Boolean) : (legacyText ? [legacyText] : []);
  return {
    id,
    title: String(data.title || (legacyText ? 'Noticias de Argentinia' : '')).trim(),
    subtitle: String(data.subtitle || '').trim(),
    paragraphs,
    text: paragraphs.join('\n\n'),
    imageFilename: String(data.imageFilename || '').trim(),
    showPopup: data.showPopup !== false && !legacyText,
    showInNews: data.showInNews !== false,
    dismissible: data.dismissible !== false,
    adminUid: data.adminUid || null,
    startAt: campaignDate(data.startAt) || campaignDate(data.createdAt),
    endAt: campaignDate(data.endAt),
    finalizedAt: campaignDate(data.finalizedAt),
    createdAt: campaignDate(data.createdAt),
    updatedAt: campaignDate(data.updatedAt)
  };
}

function normalizeCampaignEventDoc(id, data = {}) {
  return {
    id,
    name: String(data.name || '').trim(),
    type: String(data.type || '').trim(),
    value: Number(data.value) || 0,
    adminUid: data.adminUid || null,
    startAt: campaignDate(data.startAt),
    endAt: campaignDate(data.endAt),
    finalizedAt: campaignDate(data.finalizedAt),
    createdAt: campaignDate(data.createdAt),
    updatedAt: campaignDate(data.updatedAt)
  };
}

export async function fetchCampaignEvents(maxCount = 100) {
  const q = query(collection(db, 'campaignEvents'), orderBy('startAt', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => normalizeCampaignEventDoc(d.id, d.data()));
}

export async function fetchCampaignSnapshot(now = null) {
  let effectiveNow = now;
  if (effectiveNow == null && auth.currentUser?.uid) {
    try { effectiveNow = (await getAuthoritativeClassifiedsNow(auth.currentUser.uid)).serverNow; } catch {}
  }
  if (effectiveNow == null) effectiveNow = Date.now();
  const events = await fetchCampaignEvents(100);
  return buildCampaignSnapshot(events, effectiveNow);
}

async function getCampaignSnapshotForEconomy(uid) {
  let now = new Date();
  try {
    if (uid) now = (await getAuthoritativeClassifiedsNow(uid)).serverNow;
  } catch (error) {
    console.warn('[Campaigns] No se pudo obtener reloj autoritativo; se usa reloj local como fallback.', error);
  }
  return buildCampaignSnapshot(await fetchCampaignEvents(100), now);
}

export async function createCampaignEvent(adminUid, payload) {
  const normalized = validateEventPayload(payload);
  const ref = doc(collection(db, 'campaignEvents'));
  await setDoc(ref, { ...normalized, adminUid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), finalizedAt: null });
  return ref.id;
}

export async function updateCampaignEvent(eventId, payload) {
  const normalized = validateEventPayload(payload);
  await setDoc(doc(db, 'campaignEvents', eventId), { ...normalized, updatedAt: serverTimestamp(), finalizedAt: null }, { merge: true });
}

export async function finalizeCampaignEvent(eventId) {
  await setDoc(doc(db, 'campaignEvents', eventId), { finalizedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteCampaignEvent(eventId) {
  await deleteDoc(doc(db, 'campaignEvents', eventId));
}

export async function saveAnnouncement(adminUid, payload, announcementId = null) {
  const normalized = validateAnnouncementPayload(payload);
  const ref = announcementId ? doc(db, 'announcements', announcementId) : doc(collection(db, 'announcements'));
  const base = { ...normalized, adminUid, updatedAt: serverTimestamp(), finalizedAt: null };
  if (!announcementId) base.createdAt = serverTimestamp();
  await setDoc(ref, base, { merge: !!announcementId });
  return ref.id;
}

export async function updateAnnouncement(announcementId, adminUid, payload) {
  return saveAnnouncement(adminUid, payload, announcementId);
}

export async function finalizeAnnouncement(announcementId) {
  await setDoc(doc(db, 'announcements', announcementId), { finalizedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function isAnnouncementDismissed(uid, announcementId) {
  if (!uid || !announcementId) return false;
  const snap = await getDoc(doc(db, 'announcementDismissals', `${uid}_${announcementId}`));
  return snap.exists();
}

export async function dismissAnnouncement(uid, announcementId) {
  if (!uid || !announcementId) return;
  await setDoc(doc(db, 'announcementDismissals', `${uid}_${announcementId}`), {
    uid, announcementId, dismissedAt: serverTimestamp()
  });
}

// ============================================================================
// "Noticias" del menú principal — cualquiera puede leerlas (ver firestore.rules), solo el
// admin puede publicar o borrar.
// ============================================================================

// Trae las últimas maxCount noticias, más recientes primero. Normaliza createdAt a un Date
// real de JS (en vez de un Timestamp de Firestore) — así el resto del código nunca necesita
// saber nada de Timestamps, solo trabaja con fechas de siempre.
export async function fetchAnnouncements(maxCount = 50) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => normalizeAnnouncementDoc(d.id, d.data()));
}

// Compatibilidad con el formulario histórico: publica un anuncio simple en Noticias.
export async function postAnnouncement(adminUid, text) {
  return saveAnnouncement(adminUid, {
    title: 'Noticias de Argentinia',
    subtitle: '',
    paragraphs: [String(text || '').trim()],
    imageFilename: '',
    startAt: new Date(),
    endAt: null,
    showPopup: false,
    showInNews: true,
    dismissible: true
  });
}

export async function deleteAnnouncement(announcementId) {
  await deleteDoc(doc(db, 'announcements', announcementId));
}

// ============================================================================
// ENTREGA 23.5 — Admin / Debugging: historial y descarga de telemetría.
//
// Estas lecturas NO agregan permisos nuevos: las reglas de Entrega 23.1 ya permiten que
// isAdmin() lea telemetrySessions y sus chunks. El cliente normal sigue pudiendo leer sólo
// sus propias sesiones. No se escribe nada desde este panel.
// ============================================================================

function firestoreTimestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTelemetryJsonField(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Devuelve TODAS las sesiones visibles para el admin. Ordenamos del lado del cliente para
// no exigir índices nuevos de Firestore; con el volumen de QA de Argentinia esto es chico y
// además garantiza que también aparezcan sesiones viejas/incompletas.
export async function finalizeTelemetryLifecycleSession(sessionId, payload = {}) {
  if (!sessionId) throw new Error('Falta sessionId para cerrar lifecycle de Telemetría.');
  const status = String(payload.status || 'interrupted');
  const allowed = new Set(['interrupted', 'completed']);
  if (!allowed.has(status)) throw new Error('Estado de lifecycle inválido.');
  const patch = {
    status,
    endedAtClient: payload.endedAtClient || new Date().toISOString(),
    endReason: String(payload.endReason || (status === 'completed' ? 'completed_external' : 'interrupted')),
    effectiveDurationMs: Math.max(0, Math.floor(Number(payload.effectiveDurationMs) || 0))
  };
  if (payload.soloGameId) patch.soloGameId = String(payload.soloGameId);
  if (Number.isFinite(Number(payload.segmentIndex))) patch.segmentIndex = Number(payload.segmentIndex);
  await setDoc(doc(db, 'telemetrySessions', sessionId), patch, { merge: true });
  return patch;
}

export async function touchMatchPresence(matchId, role) {
  if (!matchId || (role !== 'host' && role !== 'guest')) return null;
  const ref = doc(db, 'matches', String(matchId).trim().toUpperCase());
  const field = role === 'host' ? 'hostLastSeenAt' : 'guestLastSeenAt';
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('MULTIPLAYER_MATCH_NOT_FOUND');
    const data = snap.data() || {};
    const uid = auth.currentUser?.uid || null;
    const expectedUid = role === 'host' ? data.hostUid : data.guestUid;
    if (!uid || expectedUid !== uid) throw new Error('MULTIPLAYER_ROLE_UID_MISMATCH');
    const session = validateRoleSession(data, role, MULTIPLAYER_CLIENT_SESSION_ID);
    if (!session.ok) throw new Error('MULTIPLAYER_SESSION_SUPERSEDED');
    tx.update(ref, { [field]: serverTimestamp() });
    return true;
  });
}

export async function adminCloseStaleTelemetrySessions(staleAfterMs = 120000) {
  if ((auth.currentUser?.email || '').toLowerCase() !== ADMIN_EMAIL) throw new Error('ADMIN_REQUIRED');
  const threshold = Math.max(30000, Number(staleAfterMs) || 120000);
  const now = Date.now();
  const snap = await getDocs(collection(db, 'telemetrySessions'));
  const batch = writeBatch(db);
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data() || {};
    if (String(data.status || 'running') !== 'running') continue;
    const lastMs = firestoreTimestampMs(data.updatedAt) || Date.parse(data.startedAtClient || '') || 0;
    if (!lastMs || now - lastMs <= threshold) continue;
    const startMs = Date.parse(data.startedAtClient || '') || lastMs;
    const durationMs = Math.max(0, lastMs - startMs);
    batch.set(d.ref, {
      status: 'interrupted',
      endedAtClient: new Date(lastMs).toISOString(),
      endReason: 'stale_timeout_admin',
      effectiveDurationMs: durationMs
    }, { merge: true });
    count += 1;
  }
  if (count > 0) await batch.commit();
  return { count, staleAfterMs: threshold };
}

// 23.19.2 — Vista económica autoritativa para Caja Negra. A diferencia de Telemetría,
// estos documentos prueban si la transacción de puntos realmente se confirmó: el receipt
// económico y el salto de users.points nacen atómicamente.
export async function fetchGameRewardAuditForAdmin() {
  if ((auth.currentUser?.email || '').toLowerCase() !== ADMIN_EMAIL) throw new Error('ADMIN_REQUIRED');
  const [gameResultsSnap, rewardsSnap] = await Promise.all([
    getDocs(collection(db, 'playerGameReceipts')),
    getDocs(collection(db, 'gameRewardReceipts'))
  ]);
  return {
    playerGameReceipts: gameResultsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    gameRewardReceipts: rewardsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}

function adminRewardRepairSafeId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
}

// Reparación excepcional, explícita e idempotente. Hoy se habilita únicamente para Solo:
// en PvP existen anti-farming, ledger por pareja y tope diario, por lo que "sumar el premio"
// sin reconstruir todos esos ledgers sería conceptualmente incorrecto.
export async function adminRepairSoloGameReward(payload = {}) {
  const adminUid = auth.currentUser?.uid || '';
  if ((auth.currentUser?.email || '').toLowerCase() !== ADMIN_EMAIL || !adminUid) throw new Error('ADMIN_REQUIRED');

  const targetUid = String(payload.targetUid || '').trim();
  const receiptId = normalizeGameRewardReceiptId(payload.receiptId);
  const telemetrySessionId = String(payload.telemetrySessionId || '').trim();
  if (!targetUid || !receiptId || !telemetrySessionId) throw new Error('ADMIN_REWARD_REPAIR_INVALID_REQUEST');

  const userRef = doc(db, 'users', targetUid);
  const gameResultRef = doc(db, 'playerGameReceipts', `${targetUid}_${receiptId}`);
  const rewardRef = doc(db, 'gameRewardReceipts', `${targetUid}_${receiptId}`);
  const telemetryRef = doc(db, 'telemetrySessions', telemetrySessionId);
  const settingsRef = doc(db, 'gameConfig', 'settings');
  const auditSuffix = adminRewardRepairSafeId(`${targetUid}_${receiptId}`);
  const actionRef = doc(db, 'adminActions', `reward_repair_${auditSuffix}`);
  const economyRef = doc(db, 'economyEvents', `reward_repair_${auditSuffix}`);

  const result = await runTransaction(db, async tx => {
    // Reads primero: además de ser requisito de Firestore, evita que el botón confíe en la UI.
    const rewardSnap = await tx.get(rewardRef);
    const userSnap = await tx.get(userRef);
    const resultSnap = await tx.get(gameResultRef);
    const telemetrySnap = await tx.get(telemetryRef);
    const settingsSnap = await tx.get(settingsRef);

    if (!userSnap.exists()) throw new Error('ADMIN_REWARD_REPAIR_USER_NOT_FOUND');
    const current = Math.max(0, Math.floor(Number(userSnap.data()?.points) || 0));
    if (rewardSnap.exists()) {
      const previous = rewardSnap.data() || {};
      return {
        duplicate: true,
        appliedDelta: 0,
        creditedDelta: Math.max(0, Math.floor(Number(previous.effectiveDelta) || 0)),
        total: current,
        reward: previous
      };
    }
    if (!resultSnap.exists()) throw new Error('ADMIN_REWARD_REPAIR_RESULT_RECEIPT_MISSING');
    if (!telemetrySnap.exists()) throw new Error('ADMIN_REWARD_REPAIR_TELEMETRY_MISSING');

    const gameResult = resultSnap.data() || {};
    const telemetry = telemetrySnap.data() || {};
    const outcome = gameResult.result === 'loss' ? 'loss' : (gameResult.result === 'win' ? 'win' : null);
    const difficulty = normalizeSoloRewardDifficulty(telemetry.difficulty);
    if (gameResult.uid !== targetUid || gameResult.receiptId !== receiptId || gameResult.mode !== 'solo' || !outcome) {
      throw new Error('ADMIN_REWARD_REPAIR_RESULT_EVIDENCE_MISMATCH');
    }
    const telemetryReceipt = String(telemetry.soloGameId || telemetry.sessionId || '');
    if (telemetry.ownerUid !== targetUid || telemetry.mode !== 'solo' || telemetry.status !== 'completed' || telemetryReceipt !== receiptId || !difficulty) {
      throw new Error('ADMIN_REWARD_REPAIR_TELEMETRY_EVIDENCE_MISMATCH');
    }

    const rewardConfig = normalizeSoloRewardConfig(settingsSnap.exists() ? settingsSnap.data() : {});
    const baseDelta = expectedSoloRewardBase(rewardConfig, outcome, difficulty);
    if (!Number.isFinite(baseDelta) || baseDelta <= 0) throw new Error('ADMIN_REWARD_REPAIR_CONFIG_INVALID');
    const next = current + baseDelta;

    tx.update(userRef, { points: next });
    tx.set(rewardRef, {
      uid: targetUid,
      receiptId,
      mode: 'solo',
      outcome,
      difficulty,
      baseDelta,
      effectiveDelta: baseDelta,
      resultingTotal: next,
      rewardReason: 'admin_repair',
      adminRepair: true,
      repairAdminUid: adminUid,
      telemetrySessionId,
      engineVersion: ENGINE_VERSION,
      createdAt: serverTimestamp()
    });
    tx.set(actionRef, {
      type: 'game_reward_manual_repair',
      adminUid,
      targetUid,
      telemetrySessionId,
      receiptId,
      outcome,
      difficulty,
      pointsDelta: baseDelta,
      reason: String(payload.reason || 'Caja Negra: liquidación faltante confirmada').slice(0, 240),
      createdAt: serverTimestamp()
    });
    tx.set(economyRef, {
      actorUid: adminUid,
      targetUid,
      source: 'game_reward_admin_repair',
      pointsDelta: baseDelta,
      fichasDelta: 0,
      packsDelta: 0,
      cardsDelta: 0,
      matchId: null,
      sessionId: receiptId,
      engineVersion: ENGINE_VERSION,
      createdAt: serverTimestamp()
    });
    return { duplicate: false, appliedDelta: baseDelta, creditedDelta: baseDelta, total: next, outcome, difficulty };
  });

  if (!result.duplicate && result.appliedDelta > 0) {
    await statsBestEffort(targetUid, { pointsEarned: result.appliedDelta });
  }
  return result;
}

export async function fetchTelemetrySessionsForAdmin() {
  const snap = await getDocs(collection(db, 'telemetrySessions'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
    const aMs = firestoreTimestampMs(a.finalizedAt || a.updatedAt) || Date.parse(a.endedAtClient || a.startedAtClient || '') || 0;
    const bMs = firestoreTimestampMs(b.finalizedAt || b.updatedAt) || Date.parse(b.endedAtClient || b.startedAtClient || '') || 0;
    return bMs - aMs;
  });
}

// Reconstruye el mismo tipo de JSON que exporta telemetry.js, pero usando como fuente los
// chunks persistidos en Firestore. Los eventos y bugCandidates son los payloads REALES que
// subió el tester; sólo el envoltorio/resumen se recompone desde el documento índice.
export async function fetchTelemetrySessionArchive(sessionId) {
  if (!sessionId) throw new Error('Falta sessionId para descargar telemetría.');

  const indexSnap = await getDoc(doc(db, 'telemetrySessions', sessionId));
  if (!indexSnap.exists()) throw new Error('La sesión de telemetría ya no existe.');
  const index = indexSnap.data();

  const chunksSnap = await getDocs(collection(db, 'telemetrySessions', sessionId, 'chunks'));
  const chunkDocs = chunksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const events = [];
  const bugs = [];
  for (const chunk of chunkDocs) {
    const payload = parseTelemetryJsonField(chunk.payloadJson, null);
    if (!payload || typeof payload !== 'object') continue;
    if (Array.isArray(payload.events)) events.push(...payload.events);
    if (Array.isArray(payload.bugCandidates)) bugs.push(...payload.bugCandidates);
  }

  // Los IDs de chunks son idempotentes, pero igual deduplicamos defensivamente por seq/id
  // para que un archivo descargado desde Admin nunca repita evidencia.
  const eventBySeq = new Map();
  events.forEach((ev, idx) => {
    const key = Number.isFinite(Number(ev?.seq)) ? `seq:${Number(ev.seq)}` : `fallback:${idx}:${JSON.stringify(ev)}`;
    if (!eventBySeq.has(key)) eventBySeq.set(key, ev);
  });
  const mergedEvents = [...eventBySeq.values()].sort((a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0));

  const bugById = new Map();
  bugs.forEach((bug, idx) => {
    const key = bug?.id || `${bug?.code || 'BUG'}:${bug?.eventSeq ?? ''}:${bug?.detectedAt || ''}:${idx}`;
    if (!bugById.has(key)) bugById.set(key, bug);
  });
  let mergedBugs = [...bugById.values()].sort((a, b) => (Number(a?.eventSeq) || 0) - (Number(b?.eventSeq) || 0));
  if (mergedBugs.length === 0) {
    // Compatibilidad defensiva: si una sesión antigua no conservó bug deltas en chunks,
    // el índice guarda al menos el resumen de los últimos 100 candidatos.
    mergedBugs = parseTelemetryJsonField(index.bugCandidatesJson, []) || [];
  }

  const meta = parseTelemetryJsonField(index.metaJson, {}) || {};
  const finalSnapshot = parseTelemetryJsonField(index.latestSnapshotJson, null);
  const byType = {};
  const bySeverity = {};
  mergedEvents.forEach(ev => {
    const type = ev?.type || 'unknown';
    const severity = ev?.severity || 'info';
    byType[type] = (byType[type] || 0) + 1;
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
  });
  const stats = {
    eventCount: mergedEvents.length,
    bugCandidateCount: mergedBugs.length,
    byType,
    bySeverity,
    truncated: !!index.truncated
  };
  const manualCount = mergedBugs.filter(b => b?.code === 'MANUAL_BUG_MARKER').length;
  const automaticCount = Math.max(0, mergedBugs.length - manualCount);
  const summaryLines = [
    'Argentinia — Diagnóstico de partida (reconstruido desde Firestore)',
    `Sesión: ${sessionId}`,
    `Motor base: ${index.engineBaseline || '?'}`,
    `Telemetría: ${index.telemetryVersion || '?'} / schema ${index.schemaVersion || '?'}`,
    `Inicio: ${index.startedAtClient || '?'}`,
    `Fin: ${index.endedAtClient || '(sesión todavía abierta)'}`,
    `Modo: ${index.mode || meta.mode || '?'}`,
    index.matchId ? `Match: ${index.matchId} (${index.myRole || '?'})` : null,
    `Eventos subidos: ${mergedEvents.length}`,
    `Candidatos de bug: ${mergedBugs.length} (automáticos: ${automaticCount}, manuales: ${manualCount})`
  ].filter(Boolean);

  return {
    schemaVersion: index.schemaVersion || null,
    telemetryVersion: index.telemetryVersion || null,
    engineBaseline: index.engineBaseline || null,
    sessionId,
    startedAt: index.startedAtClient || null,
    endedAt: index.endedAtClient || null,
    endReason: index.endReason || null,
    meta,
    remote: {
      source: 'firestore',
      reconstructedFromChunks: true,
      status: index.status || null,
      lastUploadedSeq: index.lastUploadedSeq || 0,
      lastUploadedBugCount: index.lastUploadedBugCount || 0,
      lastUploadKind: index.lastUploadKind || null,
      lastUploadReason: index.lastUploadReason || null,
      chunkCount: chunkDocs.length,
      downloadedAt: new Date().toISOString()
    },
    stats,
    humanSummary: summaryLines.join('\n'),
    bugCandidates: mergedBugs,
    finalSnapshot,
    events: mergedEvents,
    truncated: !!index.truncated
  };
}


// ============================================================================
// ENTREGA 23.1 — Telemetría remota Firestore-only.
//
// No usa Cloud Storage. Cada checkpoint escribe únicamente los eventos/bugs NUEVOS como
// chunks bajo telemetrySessions/{sessionId}/chunks/{chunkId}, y actualiza el documento
// padre con un índice/resumen. Los chunks se escriben junto con el índice en un writeBatch
// atómico: o queda todo el checkpoint o no queda nada.
//
// El UID se usa para autorización y vive en los documentos de Firestore, pero NO entra al
// JSON exportable local de telemetría. El nombre visible viene del mismo nombre de pila de
// Google que ya usa el juego.
// ============================================================================

const TELEMETRY_CHUNK_TARGET_BYTES = 600 * 1024;
const TELEMETRY_SINGLE_DOC_GUARD_BYTES = 850 * 1024;

function telemetryUtf8Bytes(text) {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  } catch {}
  // Fallback conservador para runtimes de test: encodeURIComponent aproxima UTF-8.
  try { return unescape(encodeURIComponent(text)).length; } catch { return String(text).length * 2; }
}

function telemetryJson(value) {
  return JSON.stringify(value ?? null);
}

function splitTelemetryEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const groups = [];
  let current = [];
  let currentBytes = 2; // []

  for (const event of events) {
    const raw = telemetryJson(event);
    const eventBytes = telemetryUtf8Bytes(raw) + (current.length ? 1 : 0);
    if (eventBytes > TELEMETRY_SINGLE_DOC_GUARD_BYTES) {
      throw new Error(`Telemetría remota: evento #${event?.seq ?? '?'} demasiado grande para Firestore (${eventBytes} bytes).`);
    }
    if (current.length && currentBytes + eventBytes > TELEMETRY_CHUNK_TARGET_BYTES) {
      groups.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(event);
    currentBytes += eventBytes;
  }
  if (current.length) groups.push(current);
  return groups;
}

function chunkDocId(events, partIndex, totalParts) {
  const first = Number(events?.[0]?.seq || 0);
  const last = Number(events?.[events.length - 1]?.seq || first);
  const pad = n => String(Math.max(0, n)).padStart(9, '0');
  const part = totalParts > 1 ? `-p${String(partIndex + 1).padStart(2, '0')}` : '';
  return `${pad(first)}-${pad(last)}${part}`;
}

function telemetryIndexData(checkpoint, playerName, reason) {
  const summary = checkpoint?.summary || {};
  const bySeverity = summary?.stats?.bySeverity || {};
  return {
    ownerUid: auth.currentUser?.uid || null,
    playerName: String(playerName || summary?.meta?.localPlayerName || 'Jugador').slice(0, 80),
    sessionId: checkpoint?.sessionId || null,
    matchId: summary?.meta?.matchId || null,
    mode: summary?.meta?.mode || null,
    myRole: summary?.meta?.myRole || null,
    difficulty: summary?.meta?.difficulty || null,
    deckLabel: summary?.meta?.deckLabel || null,
    soloGameId: summary?.meta?.soloGameId || null,
    segmentIndex: Number.isFinite(Number(summary?.meta?.segmentIndex)) ? Number(summary.meta.segmentIndex) : null,
    effectiveDurationMs: Math.max(0, (Number(summary?.meta?.activeElapsedBaseMs) || 0) + (Number(summary?.stats?.elapsedMs) || 0)),
    telemetryVersion: summary?.telemetryVersion || null,
    schemaVersion: summary?.schemaVersion || null,
    engineBaseline: summary?.engineBaseline || null,
    startedAtClient: summary?.startedAt || null,
    endedAtClient: summary?.endedAt || null,
    endReason: summary?.endReason || null,
    status: checkpoint?.kind === 'final' ? 'completed' : (summary?.endedAt ? 'ended_unfinalized' : 'running'),
    eventCount: checkpoint?.throughSeq || summary?.stats?.eventCount || 0,
    bugCandidateCount: summary?.stats?.bugCandidateCount || 0,
    errorCount: bySeverity.error || 0,
    warningCount: bySeverity.warning || 0,
    lastUploadedSeq: checkpoint?.throughSeq || 0,
    lastUploadedBugCount: checkpoint?.throughBugCount || 0,
    lastUploadKind: checkpoint?.kind || 'latest',
    lastUploadReason: reason || null,
    latestSnapshotJson: telemetryJson(summary?.finalSnapshot || null),
    bugCandidatesJson: telemetryJson((summary?.bugCandidates || []).slice(-100).map(b => ({
      id: b?.id || null, detectedAt: b?.detectedAt || null, eventSeq: b?.eventSeq ?? null,
      severity: b?.severity || null, code: b?.code || null, message: b?.message || null
    }))),
    statsJson: telemetryJson(summary?.stats || null),
    metaJson: telemetryJson(summary?.meta || null),
    truncated: !!summary?.truncated,
    checkpointIntervalMs: summary?.remote?.checkpointIntervalMs || 30000,
    updatedAt: serverTimestamp(),
    ...(checkpoint?.kind === 'final' ? { finalizedAt: serverTimestamp() } : {})
  };
}

/**
 * Persiste un checkpoint incremental de telemetría exclusivamente en Firestore.
 *
 * `checkpoint.events` contiene sólo los eventos todavía no confirmados remotamente.
 * Se divide en documentos <= ~600 KiB y se escribe junto con el índice en un batch atómico.
 * Los IDs de chunk dependen del rango de seq: reintentar el mismo checkpoint sobrescribe
 * el mismo documento en vez de duplicarlo.
 */
export async function uploadTelemetrySession({ uid, playerName, checkpoint, reason = 'interval' }) {
  if (!uid || !checkpoint?.sessionId) throw new Error('Telemetría remota: faltan uid o sessionId.');
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error('Telemetría remota: la sesión autenticada no coincide con el jugador.');
  }
  if (checkpoint.kind !== 'latest' && checkpoint.kind !== 'final') {
    throw new Error(`Telemetría remota: kind inválido (${checkpoint.kind}).`);
  }

  const eventGroups = splitTelemetryEvents(checkpoint.events || []);
  const bugDelta = Array.isArray(checkpoint.bugCandidates) ? checkpoint.bugCandidates : [];
  const batch = writeBatch(db);
  const indexRef = doc(db, 'telemetrySessions', checkpoint.sessionId);
  const indexData = telemetryIndexData(checkpoint, playerName, reason);
  batch.set(indexRef, indexData, { merge: true });

  const chunkIds = [];
  eventGroups.forEach((events, index) => {
    const chunkId = chunkDocId(events, index, eventGroups.length);
    chunkIds.push(chunkId);
    // Los bugs nuevos van en el último chunk del checkpoint. En la práctica son pocos; el
    // guard de tamaño de abajo evita acercarnos al límite duro de 1 MiB por documento.
    const chunkBugs = index === eventGroups.length - 1 ? bugDelta : [];
    const payloadJson = telemetryJson({ events, bugCandidates: chunkBugs });
    const payloadBytes = telemetryUtf8Bytes(payloadJson);
    if (payloadBytes > TELEMETRY_SINGLE_DOC_GUARD_BYTES) {
      throw new Error(`Telemetría remota: chunk ${chunkId} demasiado grande (${payloadBytes} bytes).`);
    }
    const chunkRef = doc(db, 'telemetrySessions', checkpoint.sessionId, 'chunks', chunkId);
    batch.set(chunkRef, {
      ownerUid: uid,
      sessionId: checkpoint.sessionId,
      matchId: checkpoint?.summary?.meta?.matchId || null,
      playerName: String(playerName || checkpoint?.summary?.meta?.localPlayerName || 'Jugador').slice(0, 80),
      chunkId,
      seqStart: events[0]?.seq || null,
      seqEnd: events[events.length - 1]?.seq || null,
      eventCount: events.length,
      bugCandidateCount: chunkBugs.length,
      reason: reason || null,
      final: checkpoint.kind === 'final',
      payloadJson,
      uploadedAt: serverTimestamp()
    }, { merge: true });
  });

  // Caso raro: bugs nuevos sin eventos nuevos. Se conserva evidencia en un chunk bug-only
  // determinístico por contador para no depender de que exista un evento acompañante.
  if (!eventGroups.length && bugDelta.length) {
    const bugStart = Math.max(1, (checkpoint.throughBugCount || bugDelta.length) - bugDelta.length + 1);
    const bugEnd = checkpoint.throughBugCount || bugDelta.length;
    const chunkId = `bugs-${String(bugStart).padStart(6, '0')}-${String(bugEnd).padStart(6, '0')}`;
    const payloadJson = telemetryJson({ events: [], bugCandidates: bugDelta });
    const payloadBytes = telemetryUtf8Bytes(payloadJson);
    if (payloadBytes > TELEMETRY_SINGLE_DOC_GUARD_BYTES) {
      throw new Error(`Telemetría remota: chunk ${chunkId} demasiado grande (${payloadBytes} bytes).`);
    }
    chunkIds.push(chunkId);
    batch.set(doc(db, 'telemetrySessions', checkpoint.sessionId, 'chunks', chunkId), {
      ownerUid: uid,
      sessionId: checkpoint.sessionId,
      matchId: checkpoint?.summary?.meta?.matchId || null,
      playerName: String(playerName || checkpoint?.summary?.meta?.localPlayerName || 'Jugador').slice(0, 80),
      chunkId,
      seqStart: null,
      seqEnd: null,
      eventCount: 0,
      bugCandidateCount: bugDelta.length,
      reason: reason || null,
      final: checkpoint.kind === 'final',
      payloadJson,
      uploadedAt: serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();

  return {
    kind: checkpoint.kind,
    chunkCount: chunkIds.length,
    chunkIds,
    uploadedThroughSeq: checkpoint.throughSeq || 0,
    uploadedThroughBugCount: checkpoint.throughBugCount || 0,
    eventCount: (checkpoint.events || []).length
  };
}
