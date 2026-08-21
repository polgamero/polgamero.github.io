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
import { getFirestore, doc, getDoc, getDocFromServer, setDoc, deleteDoc, runTransaction, serverTimestamp, onSnapshot, getDocs, collection, query, orderBy, limit, writeBatch } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { cardDb } from './cardLoader.js';
import { DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, ENHANCED_SUFFIX } from './store.js';
import { buildClassifiedsScheduleWindow, classifiedsWeekKey, getClassifiedsEconomySnapshot, getClassifiedsProfileState, countOwnedClassifiedCard, getScheduledClassifiedsWeek, validateClassifiedsScheduleWeek, normalizeClassifiedsPurchaseCounts, CLASSIFIEDS_SCHEMA_VERSION, CLASSIFIEDS_ALGORITHM_VERSION, CLASSIFIEDS_SCHEDULE_HORIZON_WEEKS, CLASSIFIEDS_SCHEDULE_HISTORY_WEEKS } from './classifieds.js';
import { defaultInventory, defaultDailyRewardsState, normalizeInventory, normalizeDailyRewardsState, advanceDailyLoginState, rewardForDay, isRewardClaimable, applyRewardToProfileData, CHEST_ITEM_KEYS, localDateKey, hasAuthoritativeDailyState, serializeDailyRewardsForFirestore } from './rewards.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, isExactMultiplayerVersionCompatible } from './version.js';
import { validateUsername, USERNAME_RENAME_COST } from './usernames.js';

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
const REWARD_RULES_VERSION = '23.13.14';

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

  return runTransaction(db, async (tx) => {
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

  return runTransaction(db, async (tx) => {
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
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().points || 0) : 0;
    const next = Math.max(0, current + delta);
    tx.update(ref, { points: next });
    return next;
  });
}

// 23.13.0 — Comprar ya NO abre el sobre. La transacción descuenta puntos y deposita una
// unidad en Mi Cofre; abrirlo es otra acción atómica. Esto unifica sobres comprados,
// recompensas diarias y futuros regalos/admin bajo el mismo inventario persistente.
export async function purchasePack(uid, cost) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
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
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const inventory = normalizeInventory(data.inventory);
    if (inventory[CHEST_ITEM_KEYS.standardPack] < 1) throw new Error('No tenés sobres para abrir.');
    inventory[CHEST_ITEM_KEYS.standardPack] -= 1;
    const updated = {
      inventory,
      collection: [...(data.collection || []), ...newCardIds],
      fichas: (data.fichas || 0) + 1
    };
    tx.update(ref, updated);
    return { ...data, ...updated, dailyRewards: normalizeDailyRewardsState(data.dailyRewards) };
  });
}

// Consume la recompensa final del pase y agrega exactamente UNA carta Mythic existente.
export async function openGuaranteedMythic(uid, cardId) {
  const card = cardDb.getById(cardId);
  if (!card || card.rarity !== 'Mythic') throw new Error('La recompensa mítica no es válida.');
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
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

async function getAuthoritativeServerClock(uid) {
  const ref = doc(db, 'rewardClock', uid);
  try {
    // 23.13.14 — attestation de Rules: las Rules nuevas aceptan este campo versionado;
    // una Rules vieja lo rechaza y nos permite distinguir deploy incompleto de bug lógico.
    await setDoc(ref, { now: serverTimestamp(), rulesVersion: REWARD_RULES_VERSION });
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.error(`[ServerClock ${REWARD_RULES_VERSION}] Rules incompatibles o no publicadas: el probe rewardClock fue rechazado.`);
    }
    throw error;
  }
  const snap = await getDocFromServer(ref);
  const clockData = snap.exists() ? snap.data() : {};
  const raw = clockData.now || null;
  if (clockData.rulesVersion !== REWARD_RULES_VERSION) {
    throw new Error(`RULES_VERSION_MISMATCH_${REWARD_RULES_VERSION.replaceAll('.', '_')}`);
  }
  if (!raw || typeof raw.toDate !== 'function') throw new Error('No se pudo obtener la hora oficial del servidor.');
  return { serverNow: raw.toDate(), rulesVersion: clockData.rulesVersion };
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

export async function adminAdvanceDailyRewardDebugDay(uid) {
  if (!(auth.currentUser?.uid === uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL)) {
    throw new Error('Esta herramienta de debug es exclusiva del admin.');
  }
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil admin.');
    const current = Math.max(0, Math.floor(Number(snap.data().rewardDebugOffsetDays) || 0));
    const next = Math.min(30, current + 1);
    tx.update(ref, { rewardDebugOffsetDays: next });
    return next;
  });
}

export async function adminResetDailyRewardDebug(uid) {
  if (!(auth.currentUser?.uid === uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL)) {
    throw new Error('Esta herramienta de debug es exclusiva del admin.');
  }
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil admin.');
    tx.update(ref, { rewardDebugOffsetDays: 0 });
  });
  return 0;
}

// Registra como máximo UN login por fecha oficial ART. Primer acceso = Día 1. El día
// siguiente avanza hasta Día 7; un gap reinicia Día 1; después de Día 7, el siguiente día
// consecutivo empieza un ciclo nuevo. La operación es idempotente el mismo día.
export async function registerDailyLogin(uid, nowMs = null) {
  const clock = nowMs == null
    ? await getAuthoritativeRewardNow(uid)
    : { serverNow: new Date(nowMs), effectiveNow: new Date(nowMs), debugOffsetDays: 0 };
  const now = clock.effectiveNow;
  const ref = doc(db, 'users', uid);
  let transitionDebug = null;
  try {
    return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();

    // Schema 3: los estados semanales 23.13.0–23.13.2 no representan el nuevo concepto.
    // El primer acceso 23.13.3 empieza inmediatamente Día 1, sea el día calendario que sea.
    const sourceDaily = hasAuthoritativeDailyState(data.dailyRewards) ? data.dailyRewards : null;
    const login = advanceDailyLoginState(sourceDaily, now);
    const inventory = normalizeInventory(data.inventory);
    const previous = normalizeDailyRewardsState(data.dailyRewards, now);
    transitionDebug = {
      schemaVersion: Number(data.dailyRewards?.schemaVersion) || 0,
      hasServerUpdatedAt: !!data.dailyRewards?.serverUpdatedAt,
      previousLastLoginDate: previous.lastLoginDate,
      previousCycleStartDate: previous.cycleStartDate,
      previousStreak: previous.streak,
      previousUnlockedDays: previous.unlockedDays.slice(),
      previousClaimedDays: previous.claimedDays.slice(),
      previousLastClaimedDay: previous.lastClaimedDay,
      effectiveDate: localDateKey(now),
      requestedRewardDay: login.rewardDay,
      requestedStreak: login.state.streak,
      requestedUnlockedDays: login.state.unlockedDays.slice(),
      requestedClaimedDays: login.state.claimedDays.slice(),
      requestedLastClaimedDay: login.state.lastClaimedDay,
      debugOffsetDays: clock.debugOffsetDays,
      rulesVersion: clock.rulesVersion || null
    };

    if (login.newCalendarLogin) {
      const persistedDaily = serializeDailyRewardsForFirestore(login.state, now, serverTimestamp());
      // Continuidad D2..D7: el inicio del ciclo es un dato inmutable. Preservamos el
      // Timestamp EXACTO almacenado, no sólo su fecha normalizada, para que Rules pueda
      // exigir igualdad fuerte sin migrar/resetear perfiles existentes.
      if (sourceDaily && login.state.streak > 1 && data.dailyRewards?.serverCycleStartDay) {
        persistedDaily.serverCycleStartDay = data.dailyRewards.serverCycleStartDay;
      }
      tx.update(ref, { dailyRewards: persistedDaily, lastSeenAt: serverTimestamp() });
    } else {
      tx.update(ref, { lastSeenAt: serverTimestamp() });
    }

    return {
      profile: { ...data, inventory, dailyRewards: login.state },
      login: {
        newCalendarLogin: login.newCalendarLogin,
        rewardDay: login.rewardDay,
        rewardUnlocked: login.rewardUnlocked,
        streakReset: login.streakReset,
        cycleRestarted: login.cycleRestarted,
        cycleCompleted: login.cycleCompleted,
        streak: login.state.streak,
        cycleStartDate: login.state.cycleStartDate,
        authoritative: nowMs == null,
        serverNowMs: clock.serverNow.getTime(),
        effectiveNowMs: now.getTime(),
        debugOffsetDays: clock.debugOffsetDays,
      rulesVersion: clock.rulesVersion || null
      }
    };
    });
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.error('[DailyRewards 23.13.14] Firestore rechazó registerDailyLogin.', transitionDebug || { effectiveDate: localDateKey(now) });
    }
    throw error;
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
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    if (!hasAuthoritativeDailyState(data.dailyRewards)) throw new Error('Volvé a entrar para sincronizar tu racha con el reloj oficial.');
    const dailyRewards = normalizeDailyRewardsState(data.dailyRewards, now);
    if (dailyRewards.lastLoginDate !== localDateKey(now)) throw new Error('Volvé a entrar hoy para activar tu recompensa diaria.');
    if (!isRewardClaimable(dailyRewards, day, now)) throw new Error('Ese premio no está disponible o ya fue reclamado.');
    const rewarded = applyRewardToProfileData({ ...data, inventory: normalizeInventory(data.inventory) }, reward);
    const claimedDays = [...dailyRewards.claimedDays, Number(day)];
    const nextDaily = { ...dailyRewards, claimedDays, lastClaimedDay: Number(day) };
    const persistedDaily = serializeDailyRewardsForFirestore(nextDaily, now, serverTimestamp());
    persistedDaily.serverLastLoginDay = data.dailyRewards.serverLastLoginDay;
    persistedDaily.serverCycleStartDay = data.dailyRewards.serverCycleStartDay;
    const updated = {
      points: Number(rewarded.points) || 0,
      fichas: Number(rewarded.fichas) || 0,
      inventory: normalizeInventory(rewarded.inventory),
      dailyRewards: persistedDaily
    };
    tx.update(ref, updated);
    return { ...data, ...updated, dailyRewards: nextDaily };
  });
}

// Craftea una mejora permanente: gasta `fichaCost` Fichas para taggear UNA carta que ya
// tenés (y que todavía no esté mejorada) con una keyword de la lista curada
// (ENHANCEMENT_KEYWORDS en store.js). Devuelve el perfil ya actualizado.
export async function craftEnhancement(uid, cardId, keyword, fichaCost) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
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
}

// FASE 3, ETAPA 2: crea un mazo nuevo (hasta 5 en total, contando el inicial). Todo
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

    if (decks.length >= 5) throw new Error('Ya tenés el máximo de 5 mazos.');
    validateDeckCards(data, name, cardIds, {
      allowVirtualAdminPool: auth.currentUser?.uid === uid && String(auth.currentUser?.email || '').trim().toLowerCase() === ADMIN_EMAIL
    });

    const newDeck = { id: `deck_${Date.now()}`, name: name.trim(), cardIds, isDefault: false, createdAt: Date.now() };
    const updated = { decks: [...decks, newDeck] };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
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
export async function ensureClassifiedsSchedule() {
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
  return runTransaction(db, async tx => {
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

    const data = {
      status: 'waiting', // 'waiting' | 'active' | 'cancelled'
      hostUid: uid,
      guestUid: null,
      hostReady: false,
      guestReady: false,
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
  await setDoc(doc(db, 'matches', matchId), {
    [`${role}Ready`]: !!ready,
    updatedAt: serverTimestamp()
  }, { merge: true });
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
  const [publicSnap, privateSnap] = await Promise.all([
    getDoc(doc(db, 'matches', matchId)),
    getDoc(doc(db, 'matches', matchId, 'private', uid))
  ]);
  if (!publicSnap.exists() || !privateSnap.exists()) return null;
  const publicDoc = publicSnap.data();
  if (publicDoc.gameOver) return null;
  if (!isExactMultiplayerVersionCompatible(publicDoc.engineVersion, publicDoc.engineProtocolVersion)) {
    return {
      incompatible: true,
      engineVersion: publicDoc.engineVersion || null,
      engineProtocolVersion: publicDoc.engineProtocolVersion || null,
      publicDoc,
      privateDoc: privateSnap.data()
    };
  }
  return { publicDoc, privateDoc: privateSnap.data() };
}

// Escucha cambios en tiempo real de una partida — así la sala de espera se entera sola
// apenas alguien se une, sin tener que refrescar nada a mano. Devuelve la función de
// unsubscribe (cortar la escucha al salir de la pantalla, para no dejarla corriendo de más).
export function listenToMatch(code, onUpdate) {
  const ref = doc(db, 'matches', code.trim().toUpperCase());
  return onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    onUpdate(snap.exists() ? snap.data() : null, {
      hasPendingWrites: !!snap.metadata?.hasPendingWrites,
      fromCache: !!snap.metadata?.fromCache,
      receivedAtClientMs: Date.now()
    });
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

// Escribe mi mitad del estado PÚBLICO de la partida (mi campo de batalla, vida, fase,
// turno — todo lo que el rival puede ver legítimamente, pero NUNCA el contenido de mi mano
// ni mi mazo, solo la cantidad — ver buildMyPublicPatch).
export async function publishMyPublicState(matchId, publicPatch) {
  // 23.8: serverCommittedAt es un reloj COMÚN a ambas notebooks. `serverTimestamp()` se
  // resuelve en el backend; el listener rival recibe el Timestamp real ya confirmado.
  const patch = { ...publicPatch };
  if (publicPatch?.syncMeta && typeof publicPatch.syncMeta === 'object') {
    patch.syncMeta = {
      ...publicPatch.syncMeta,
      serverCommittedAt: serverTimestamp(),
      engineVersion: ENGINE_VERSION,
      engineProtocolVersion: ENGINE_PROTOCOL_VERSION
    };
  }
  await setDoc(doc(db, 'matches', matchId), patch, { merge: true });
}

// Escribe mi mano y mazo REALES en mi documento privado — el único que solo yo puedo leer
// (ver firestore.rules: matches/{matchId}/private/{uid}).
export async function publishMyPrivateState(matchId, uid, privatePatch) {
  await setDoc(doc(db, 'matches', matchId, 'private', uid), privatePatch, { merge: true });
}


// ENTREGA 23.10 — CANAL EFÍMERO PARTICIPANT-ONLY PARA SELECCIONES PRIVADAS.
// A diferencia del documento público matches/{matchId}, estos documentos sólo pueden ser
// leídos/escritos por host o guest del match (ver reglas 23.10). Nunca son la fuente de verdad
// de mano/mazo: contienen únicamente una OFERTA saneada (tokens opacos o descriptores que el
// propio efecto permite revelar). La zona real sigue viviendo exclusivamente en private/{uid}.
export async function publishPrivateSelectionOffer(matchId, requestId, offer) {
  await setDoc(doc(db, 'matches', matchId, 'privateSelections', requestId), {
    ...offer,
    updatedAt: serverTimestamp()
  });
}

export async function fetchPrivateSelectionOffer(matchId, requestId) {
  const snap = await getDoc(doc(db, 'matches', matchId, 'privateSelections', requestId));
  return snap.exists() ? snap.data() : null;
}

export async function deletePrivateSelectionOffer(matchId, requestId) {
  await deleteDoc(doc(db, 'matches', matchId, 'privateSelections', requestId));
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
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esa cuenta no existe.');
    const current = snap.data()[currencyField] || 0;
    const newValue = Math.max(0, current + amount);
    tx.update(ref, { [currencyField]: newValue });
    return newValue;
  });
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
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esa cuenta no existe.');
    const data = snap.data();
    const inventory = normalizeInventory(data.inventory);
    inventory[CHEST_ITEM_KEYS.standardPack] += delta;
    tx.update(ref, { inventory });
    return inventory[CHEST_ITEM_KEYS.standardPack];
  });
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
// "Noticias" del menú principal — cualquiera puede leerlas (ver firestore.rules), solo el
// admin puede publicar o borrar.
// ============================================================================

// Trae las últimas maxCount noticias, más recientes primero. Normaliza createdAt a un Date
// real de JS (en vez de un Timestamp de Firestore) — así el resto del código nunca necesita
// saber nada de Timestamps, solo trabaja con fechas de siempre.
export async function fetchAnnouncements(maxCount = 15) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      text: data.text,
      adminUid: data.adminUid,
      createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : null
    };
  });
}

export async function postAnnouncement(adminUid, text) {
  await setDoc(doc(collection(db, 'announcements')), {
    text: text.trim(),
    adminUid,
    createdAt: serverTimestamp()
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
